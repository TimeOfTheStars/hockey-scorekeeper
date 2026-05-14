use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use tauri::path::BaseDirectory;
use tauri::AppHandle;
use tauri::Manager;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::routing::get;
use axum::Json;
use axum::Router;
use futures_util::{SinkExt, StreamExt};
use serde_json::Value;
use tokio::sync::{broadcast, RwLock};
use tokio_util::sync::CancellationToken;
use tower_http::services::{ServeDir, ServeFile};

/// Дефолт исходного состояния (под новый формат API). Используется в режиме «Тест».
fn default_source_value() -> Value {
    serde_json::json!({
        "TournamentTitle": "Регулярный турнир по хоккею с шайбой",
        "num_fields": 1,
        "fields": {
            "A": {
                "TeamH": "A",
                "TeamHFull": "Team A",
                "TeamG": "B",
                "TeamGFull": "Team B",
                "ScoreH": 0,
                "ScoreG": 0,
                "ShotsH": 0,
                "ShotsG": 0,
                "LogoH": "team-a.png",
                "LogoG": "team-b.png"
            }
        },
        "Timer": 1200,
        "timer_running": false,
        "timer_default": 1200,
        "Period": 1,
        "Period_label": "1-й",
        "auto_next_period": false,
        "logoLeagues": "",
        "visible": true,
        "PenaltyH": null,
        "PenaltyG": null
    })
}

fn extract_patch(raw: Value) -> Value {
    if raw.is_array() {
        raw.get(0).cloned().unwrap_or(Value::Null)
    } else {
        raw
    }
}

fn as_str(v: Option<&Value>) -> String {
    match v {
        Some(Value::String(s)) => s.clone(),
        Some(Value::Number(n)) => n.to_string(),
        Some(Value::Bool(b)) => b.to_string(),
        _ => String::new(),
    }
}

fn as_i64(v: Option<&Value>) -> i64 {
    v.and_then(|x| x.as_i64())
        .or_else(|| v.and_then(|x| x.as_f64()).map(|f| f as i64))
        .unwrap_or(0)
}

fn as_bool(v: Option<&Value>, default: bool) -> bool {
    v.and_then(|x| x.as_bool()).unwrap_or(default)
}

/// Секунды → "MM:SS".
fn format_timer_seconds(total: i64) -> String {
    let safe = if total > 0 { total } else { 0 };
    let m = safe / 60;
    let s = safe % 60;
    format!("{:02}:{:02}", m, s)
}

#[derive(Clone, Copy, Default, PartialEq)]
pub enum ActiveField {
    #[default]
    A,
    B,
}

impl ActiveField {
    pub fn parse(s: &str) -> Option<Self> {
        match s.trim().to_ascii_uppercase().as_str() {
            "A" => Some(ActiveField::A),
            "B" => Some(ActiveField::B),
            _ => None,
        }
    }

    fn key(self) -> &'static str {
        match self {
            ActiveField::A => "A",
            ActiveField::B => "B",
        }
    }
}

#[derive(Clone, Copy, Default, PartialEq)]
pub enum TeamNameMode {
    #[default]
    Short,
    Full,
}

impl TeamNameMode {
    pub fn parse(s: &str) -> Option<Self> {
        match s.trim().to_ascii_lowercase().as_str() {
            "short" => Some(TeamNameMode::Short),
            "full" => Some(TeamNameMode::Full),
            _ => None,
        }
    }
}

fn apply_name_mode(state: Value, name_mode: TeamNameMode) -> Value {
    if !matches!(name_mode, TeamNameMode::Full) {
        return state;
    }
    let Some(mut obj) = state.as_object().cloned() else {
        return state;
    };
    let team_a_full = obj
        .get("TeamAFull")
        .and_then(Value::as_str)
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let team_b_full = obj
        .get("TeamBFull")
        .and_then(Value::as_str)
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    if let Some(name) = team_a_full {
        obj.insert("TeamA".to_string(), Value::String(name));
    }
    if let Some(name) = team_b_full {
        obj.insert("TeamB".to_string(), Value::String(name));
    }
    Value::Object(obj)
}

fn first_penalty_from_array(v: Option<&Value>) -> String {
    let Some(arr) = v.and_then(|x| x.as_array()) else {
        return "None".to_string();
    };
    for item in arr {
        let s = match item {
            Value::String(s) => s.trim().to_string(),
            Value::Number(n) => n.to_string(),
            _ => continue,
        };
        if !s.is_empty() {
            return s;
        }
    }
    "None".to_string()
}

fn top_level_penalty(v: Option<&Value>) -> String {
    match v {
        Some(Value::String(s)) => {
            let t = s.trim();
            if t.is_empty() {
                "None".to_string()
            } else {
                t.to_string()
            }
        }
        _ => "None".to_string(),
    }
}

/// Снимок для OBS/WebSocket: ключи как в `GameState`.
pub fn build_client_state(
    source: &Value,
    field: ActiveField,
    name_mode: TeamNameMode,
) -> Value {
    let Some(obj) = source.as_object() else {
        return Value::Object(Default::default());
    };

    let num_fields = as_i64(obj.get("num_fields")).max(1);
    let effective_field = if matches!(field, ActiveField::B) && num_fields >= 2 {
        ActiveField::B
    } else {
        ActiveField::A
    };

    let field_obj = obj
        .get("fields")
        .and_then(|v| v.get(effective_field.key()))
        .cloned()
        .unwrap_or(Value::Null);
    let fo = field_obj.as_object();

    let team_a = as_str(fo.and_then(|o| o.get("TeamH")));
    let team_af = as_str(fo.and_then(|o| o.get("TeamHFull")));
    let team_b = as_str(fo.and_then(|o| o.get("TeamG")));
    let team_bf = as_str(fo.and_then(|o| o.get("TeamGFull")));
    let sa = as_i64(fo.and_then(|o| o.get("ScoreH")));
    let sb = as_i64(fo.and_then(|o| o.get("ScoreG")));
    let sha = as_i64(fo.and_then(|o| o.get("ShotsH")));
    let shb = as_i64(fo.and_then(|o| o.get("ShotsG")));
    let la = as_str(fo.and_then(|o| o.get("LogoH")));
    let lb = as_str(fo.and_then(|o| o.get("LogoG")));

    let (pa, pb) = if num_fields >= 2 {
        let penalties = fo.and_then(|o| o.get("Penalties"));
        (
            first_penalty_from_array(penalties.and_then(|p| p.get("H"))),
            first_penalty_from_array(penalties.and_then(|p| p.get("G"))),
        )
    } else {
        (
            top_level_penalty(obj.get("PenaltyH")),
            top_level_penalty(obj.get("PenaltyG")),
        )
    };

    let title_raw = as_str(obj.get("TournamentTitle"));
    let tournament = if title_raw.is_empty() {
        "Регулярный турнир по хоккею с шайбой".to_string()
    } else {
        title_raw
    };
    let period = as_i64(obj.get("Period")).max(1);
    let running = as_bool(obj.get("timer_running"), false);
    let visible = as_bool(obj.get("visible"), true);
    let league_logo = as_str(obj.get("logoLeagues"));
    let timer_sec = as_i64(obj.get("Timer"));
    let timer_o = format_timer_seconds(timer_sec);

    let team_a_o = if team_a.is_empty() { "A".to_string() } else { team_a };
    let team_af_o = if team_af.is_empty() { "Team A".to_string() } else { team_af };
    let team_b_o = if team_b.is_empty() { "B".to_string() } else { team_b };
    let team_bf_o = if team_bf.is_empty() { "Team B".to_string() } else { team_bf };
    let la_o = if la.is_empty() { "team-a.png".to_string() } else { la };
    let lb_o = if lb.is_empty() { "team-b.png".to_string() } else { lb };

    let display = serde_json::json!({
        "TournamentTitle": tournament,
        "SeriesInfo": "",
        "BrandingImage": league_logo,
        "TeamA": team_a_o,
        "TeamAFull": team_af_o,
        "TeamB": team_b_o,
        "TeamBFull": team_bf_o,
        "penalty_a": pa,
        "penalty_b": pb,
        "ScoreA": sa,
        "ScoreB": sb,
        "ShotsA": sha,
        "ShotsB": shb,
        "logo_a": la_o,
        "logo_b": lb_o,
        "Timer": timer_o,
        "PowerPlayTimer": "02:00",
        "PowerPlayActive": false,
        "Period": period,
        "Running": running,
        "Visible": visible,
    });
    apply_name_mode(display, name_mode)
}

fn overlay_dist_path(app: &AppHandle) -> Result<PathBuf, String> {
    let bundled = app
        .path()
        .resolve("obs-overlay-dist", BaseDirectory::Resource)
        .map_err(|e| format!("путь к ресурсам Tauri: {e}"))?;
    if bundled.join("index.html").is_file() {
        return Ok(bundled);
    }

    let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../obs-overlay/dist");
    let index = dev.join("index.html");
    if index.is_file() {
        return Ok(dev);
    }

    Err(format!(
        "Не найден OBS-оверлей (index.html). Ожидалось: {} или dev {}. Собери: npm --prefix apps/obs-overlay run build",
        bundled.display(),
        index.display()
    ))
}

pub struct GatewaySync {
    pub source: Value,
    pub field: ActiveField,
    pub name_mode: TeamNameMode,
}

pub struct RuntimeHandles {
    pub sync: Arc<RwLock<GatewaySync>>,
    pub tx: broadcast::Sender<String>,
}

#[derive(Clone)]
struct GatewayInner {
    runtime: Arc<RuntimeHandles>,
}

async fn envelope_for_display_async(runtime: &RuntimeHandles) -> String {
    let g = runtime.sync.read().await;
    let display = build_client_state(&g.source, g.field, g.name_mode);
    serde_json::json!({ "type": "state", "payload": display }).to_string()
}

async fn get_state_json(State(inner): State<GatewayInner>) -> Result<Json<Value>, StatusCode> {
    let g = inner.runtime.sync.read().await;
    let display = build_client_state(&g.source, g.field, g.name_mode);
    Ok(Json(display))
}

async fn ws_upgrade(ws: WebSocketUpgrade, State(inner): State<GatewayInner>) -> impl IntoResponse {
    ws.on_upgrade(move |socket| ws_connected(socket, inner))
}

async fn ws_connected(mut socket: WebSocket, inner: GatewayInner) {
    let mut rx = inner.runtime.tx.subscribe();
    let initial = {
        let g = inner.runtime.sync.read().await;
        build_client_state(&g.source, g.field, g.name_mode)
    };
    let envelope = serde_json::json!({ "type": "state", "payload": initial }).to_string();
    if socket.send(Message::Text(envelope.into())).await.is_err() {
        return;
    }
    let (mut sink, mut stream) = socket.split();
    let mut read = tokio::spawn(async move {
        while let Some(msg) = stream.next().await {
            if msg.is_err() {
                break;
            }
        }
    });
    loop {
        tokio::select! {
            _ = &mut read => break,
            recv = rx.recv() => {
                match recv {
                    Ok(msg) => {
                        if sink.send(Message::Text(msg.into())).await.is_err() {
                            break;
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(_)) => {}
                    Err(broadcast::error::RecvError::Closed) => break,
                }
            }
        }
    }
}

fn router(inner: GatewayInner, dist: PathBuf) -> Router {
    let index_path = dist.join("index.html");
    let static_service = ServeDir::new(&dist).not_found_service(ServeFile::new(index_path));

    Router::new()
        .route("/api/state", get(get_state_json))
        .route("/ws", get(ws_upgrade))
        .fallback_service(static_service)
        .with_state(inner)
}

async fn poll_loop(
    api_url: String,
    runtime: Arc<RuntimeHandles>,
    cancel: CancellationToken,
) {
    let client = match reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
    {
        Ok(c) => c,
        Err(_) => return,
    };
    let mut interval = tokio::time::interval(Duration::from_millis(800));
    loop {
        tokio::select! {
            _ = cancel.cancelled() => break,
            _ = interval.tick() => {
                match client.get(&api_url).send().await {
                    Ok(resp) if resp.status().is_success() => {
                        if let Ok(json) = resp.json::<Value>().await {
                            let next = extract_patch(json);
                            if next.is_object() {
                                {
                                    let mut w = runtime.sync.write().await;
                                    w.source = next;
                                }
                                let msg = envelope_for_display_async(&runtime).await;
                                let _ = runtime.tx.send(msg);
                            }
                        }
                    }
                    _ => {}
                }
            }
        }
    }
}

pub struct GatewayController {
    cancel: Option<CancellationToken>,
    server_task: Option<tokio::task::JoinHandle<std::io::Result<()>>>,
    poller_task: Option<tokio::task::JoinHandle<()>>,
    pub runtime: Option<Arc<RuntimeHandles>>,
}

impl GatewayController {
    pub fn new() -> Self {
        Self {
            cancel: None,
            server_task: None,
            poller_task: None,
            runtime: None,
        }
    }

    pub async fn stop(&mut self) -> Result<(), String> {
        if let Some(c) = self.cancel.take() {
            c.cancel();
        }
        if let Some(h) = self.server_task.take() {
            h.await.map_err(|e| format!("server join: {e}"))?
                .map_err(|e| format!("server: {e}"))?;
        }
        if let Some(h) = self.poller_task.take() {
            h.await.map_err(|e| format!("poller join: {e}"))?;
        }
        self.runtime = None;
        Ok(())
    }

    pub async fn set_field(&mut self, field: ActiveField) -> Result<(), String> {
        let rt = self
            .runtime
            .as_ref()
            .ok_or_else(|| "Сервер не запущен".to_string())?;
        {
            let mut w = rt.sync.write().await;
            w.field = field;
        }
        let msg = envelope_for_display_async(rt).await;
        let _ = rt.tx.send(msg);
        Ok(())
    }

    pub async fn set_name_mode(&mut self, mode: TeamNameMode) -> Result<(), String> {
        let rt = self
            .runtime
            .as_ref()
            .ok_or_else(|| "Сервер не запущен".to_string())?;
        {
            let mut w = rt.sync.write().await;
            w.name_mode = mode;
        }
        let msg = envelope_for_display_async(rt).await;
        let _ = rt.tx.send(msg);
        Ok(())
    }

    pub async fn start(
        &mut self,
        app_handle: &AppHandle,
        api_url: String,
        port: u16,
        test_mode: bool,
        initial_field: ActiveField,
        initial_name_mode: TeamNameMode,
    ) -> Result<String, String> {
        if !test_mode {
            if !api_url.starts_with("http://") && !api_url.starts_with("https://") {
                return Err("URL должен начинаться с http:// или https://".to_string());
            }
        }
        if self.cancel.is_some() {
            self.stop().await?;
        }

        let dist = overlay_dist_path(app_handle)?;
        let dist = std::fs::canonicalize(&dist).map_err(|e| format!("canonicalize dist: {e}"))?;
        if !dist.as_path().join("index.html").is_file() {
            return Err("В obs-overlay/dist нет index.html".to_string());
        }

        let listener = tokio::net::TcpListener::bind(("127.0.0.1", port))
            .await
            .map_err(|e| format!("порт {port} недоступен: {e}"))?;
        let bound = listener
            .local_addr()
            .map_err(|e| format!("local_addr: {e}"))?;

        let sync = Arc::new(RwLock::new(GatewaySync {
            source: default_source_value(),
            field: initial_field,
            name_mode: initial_name_mode,
        }));
        let (tx, _rx) = broadcast::channel::<String>(32);
        let runtime = Arc::new(RuntimeHandles {
            sync: sync.clone(),
            tx: tx.clone(),
        });

        let inner = GatewayInner {
            runtime: runtime.clone(),
        };
        let axum_app = router(inner, dist);

        let token = CancellationToken::new();
        let token_serve = token.clone();
        let server_task = tokio::spawn(async move {
            axum::serve(listener, axum_app)
                .with_graceful_shutdown(async move {
                    token_serve.cancelled().await;
                })
                .await
        });

        let poller_task = if test_mode {
            let msg = envelope_for_display_async(&runtime).await;
            let _ = tx.send(msg);
            None
        } else {
            let poll_cancel = token.clone();
            let rt = runtime.clone();
            Some(tokio::spawn(async move {
                poll_loop(api_url, rt, poll_cancel).await;
            }))
        };

        self.cancel = Some(token);
        self.server_task = Some(server_task);
        self.poller_task = poller_task;
        self.runtime = Some(runtime);

        Ok(format!("http://127.0.0.1:{}/", bound.port()))
    }
}
