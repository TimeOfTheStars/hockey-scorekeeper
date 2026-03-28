import asyncio
import json
from pathlib import Path

from app.models.game_state import GameState, GameStatePatch


class StateStore:
    def __init__(self, data_file: Path) -> None:
        self.data_file = data_file
        self._lock = asyncio.Lock()
        self._state = GameState()

    async def load(self) -> None:
        if not self.data_file.exists():
            await self.save()
            return
        raw = self.data_file.read_text(encoding="utf-8")
        self._state = GameState(**json.loads(raw))

    async def save(self) -> None:
        self.data_file.parent.mkdir(parents=True, exist_ok=True)
        self.data_file.write_text(
            json.dumps(self._state.model_dump(), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    async def get(self) -> GameState:
        async with self._lock:
            return self._state.model_copy(deep=True)

    async def update_patch(self, patch: GameStatePatch) -> GameState:
        async with self._lock:
            data = patch.model_dump(exclude_none=True)
            self._state = self._state.model_copy(update=data)
            await self.save()
            return self._state.model_copy(deep=True)

    async def replace(self, state: GameState) -> GameState:
        async with self._lock:
            self._state = state.model_copy(deep=True)
            await self.save()
            return self._state.model_copy(deep=True)
