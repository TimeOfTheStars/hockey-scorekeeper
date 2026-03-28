from pathlib import Path

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.models.game_state import GameStatePatch
from app.services.state_store import StateStore
from app.services.timer_service import TimerService
from app.services.ws_manager import WSConnectionManager

ROOT_DIR = Path(__file__).resolve().parent.parent
LOGOS_DIR = ROOT_DIR / "logos"
DATA_FILE = ROOT_DIR / "data" / "game_state.json"
FRONTEND_DIST = ROOT_DIR.parent / "frontend" / "dist"
INDEX_HTML = FRONTEND_DIST / "index.html"

app = FastAPI(title="hockey-scoreboard")
ws_manager = WSConnectionManager()
store = StateStore(DATA_FILE)
timer_service = TimerService(store, ws_manager)

LOGOS_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/logos", StaticFiles(directory=LOGOS_DIR), name="logos")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_event() -> None:
    await store.load()
    await timer_service.start()


@app.get("/api/state")
async def get_state() -> dict:
    state = await store.get()
    return state.model_dump()


@app.post("/api/state")
async def patch_state(patch: GameStatePatch) -> dict:
    updated = await store.update_patch(patch)
    payload = {"type": "state", "payload": updated.model_dump()}
    await ws_manager.broadcast(payload)
    return updated.model_dump()


@app.post("/api/actions/goal")
async def goal(team: str, delta: int) -> dict:
    state = await store.get()
    if team not in ("A", "B"):
        raise HTTPException(status_code=400, detail="team must be A or B")
    if delta not in (-1, 1):
        raise HTTPException(status_code=400, detail="delta must be -1 or 1")
    if team == "A":
        value = max(0, state.ScoreA + delta)
        updated = await store.update_patch(GameStatePatch(ScoreA=value))
    else:
        value = max(0, state.ScoreB + delta)
        updated = await store.update_patch(GameStatePatch(ScoreB=value))
    await ws_manager.broadcast({"type": "state", "payload": updated.model_dump()})
    return updated.model_dump()


@app.post("/api/actions/period")
async def set_period(period: int) -> dict:
    updated = await store.update_patch(GameStatePatch(Period=max(1, period)))
    await ws_manager.broadcast({"type": "state", "payload": updated.model_dump()})
    return updated.model_dump()


@app.post("/api/actions/timer")
async def set_timer_running(running: bool) -> dict:
    updated = await store.update_patch(GameStatePatch(Running=running))
    await ws_manager.broadcast({"type": "state", "payload": updated.model_dump()})
    return updated.model_dump()


@app.post("/api/actions/visible")
async def set_visible(visible: bool) -> dict:
    updated = await store.update_patch(GameStatePatch(Visible=visible))
    await ws_manager.broadcast({"type": "state", "payload": updated.model_dump()})
    return updated.model_dump()


@app.post("/api/actions/powerplay")
async def set_powerplay(active: bool) -> dict:
    if not active:
        updated = await store.update_patch(GameStatePatch(PowerPlayActive=False))
        await ws_manager.broadcast({"type": "state", "payload": updated.model_dump()})
        return updated.model_dump()
    st = await store.get()
    pp_sec = 0
    try:
        a, b = st.PowerPlayTimer.strip().split(":")
        pp_sec = int(a) * 60 + int(b)
    except (ValueError, AttributeError):
        pp_sec = 0
    kwargs: dict = {"PowerPlayActive": True}
    if pp_sec <= 0:
        kwargs["PowerPlayTimer"] = "02:00"
    updated = await store.update_patch(GameStatePatch(**kwargs))
    await ws_manager.broadcast({"type": "state", "payload": updated.model_dump()})
    return updated.model_dump()


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    await ws_manager.connect(websocket)
    current = await store.get()
    await websocket.send_json({"type": "state", "payload": current.model_dump()})
    try:
        while True:
            message = await websocket.receive_json()
            if isinstance(message, dict) and message.get("type") == "patch":
                patch = GameStatePatch(**(message.get("payload") or {}))
                updated = await store.update_patch(patch)
                await ws_manager.broadcast({"type": "state", "payload": updated.model_dump()})
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)


if FRONTEND_DIST.exists():
    assets_dir = FRONTEND_DIST / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/")
    async def serve_obs() -> FileResponse:
        return FileResponse(INDEX_HTML)

    @app.get("/controlpanel")
    async def serve_controlpanel() -> FileResponse:
        return FileResponse(INDEX_HTML)
