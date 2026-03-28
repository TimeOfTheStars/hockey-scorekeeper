import asyncio

from app.models.game_state import GameStatePatch
from app.services.state_store import StateStore
from app.services.ws_manager import WSConnectionManager


def _timer_to_seconds(value: str) -> int:
    parts = value.strip().split(":")
    if len(parts) != 2:
        raise ValueError("timer must be MM:SS")
    return int(parts[0]) * 60 + int(parts[1])


def _seconds_to_timer(value: int) -> str:
    mins = value // 60
    secs = value % 60
    return f"{mins:02d}:{secs:02d}"


class TimerService:
    def __init__(self, store: StateStore, ws_manager: WSConnectionManager) -> None:
        self.store = store
        self.ws_manager = ws_manager
        self._task: asyncio.Task | None = None

    async def start(self) -> None:
        if self._task and not self._task.done():
            return
        self._task = asyncio.create_task(self._loop())

    async def _loop(self) -> None:
        while True:
            await asyncio.sleep(1)
            state = await self.store.get()
            patch: dict = {}

            if state.Running:
                try:
                    current = _timer_to_seconds(state.Timer)
                except ValueError:
                    current = -1
                if current <= 0:
                    patch["Timer"] = "00:00"
                    patch["Running"] = False
                else:
                    patch["Timer"] = _seconds_to_timer(current - 1)

            if state.PowerPlayActive:
                try:
                    pp = _timer_to_seconds(state.PowerPlayTimer)
                except ValueError:
                    pp = 0
                if pp <= 0:
                    patch["PowerPlayActive"] = False
                    patch["PowerPlayTimer"] = "00:00"
                else:
                    new_pp = pp - 1
                    patch["PowerPlayTimer"] = _seconds_to_timer(new_pp)
                    if new_pp == 0:
                        patch["PowerPlayActive"] = False

            if not patch:
                continue
            updated = await self.store.update_patch(GameStatePatch(**patch))
            await self.ws_manager.broadcast(
                {"type": "state", "payload": updated.model_dump()}
            )
