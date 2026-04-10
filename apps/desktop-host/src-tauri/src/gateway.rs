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

/// Дефолты для **новой** схемы API (HA/GA/HB/GB) при merge с ответом.
fn new_schema_defaults() -> Value {
    serde_json::json!({
        "TournamentTitle": "Регулярный турнир по хоккею с шайбой",
        "TeamHA": "A",
        "TeamHAFull": "Team A",
        "TeamGA": "B",
        "TeamGAFull": "Team B",
        "TeamHB": "A",
        "TeamHBFull": "Team A",
        "TeamGB": "B",
        "TeamGBFull": "Team B",
        "PenaltyH": "None",
        "PenaltyG": "None",
        "ScoreHA": 0,
        "ScoreGA": 0,
        "ScoreHB": 0,
        "ScoreGB": 0,
        "ShotsH": 0,
        "ShotsG": 0,
        "LogoHA": "team-a.png",
        "LogoGA": "team-b.png",
        "LogoHB": "team-a.png",
        "LogoGB": "team-b.png",
        "logoLeagues": "",
        "Timer": "20:00",
        "Period": 1,
        "Running": false,
        "Visible": true,
        "PowerPlayTimer": "02:00",
        "PowerPlayActive": false
    })
}

/// Дефолты **оверлея** (ключи GameState) для старого API без HA/HB.
fn default_overlay_value() -> Value {
    serde_json::json!({
        "TournamentTitle": "Регулярный турнир по хоккею с шайбой",
        "SeriesInfo": "",
        "BrandingImage": "",
        "TeamA": "A",
        "TeamAFull": "Team A",
        "TeamB": "B",
        "TeamBFull": "Team B",
        "penalty_a": "None",
        "penalty_b": "None",
        "ScoreA": 0,
        "ScoreB": 0,
        "ShotsA": 0,
        "ShotsB": 0,
        "logo_a": "team-a.png",
        "logo_b": "team-b.png",
        "Timer": "20:00",
        "PowerPlayTimer": "02:00",
        "PowerPlayActive": false,
        "Period": 1,
        "Running": false,
        "Visible": true
    })
}

fn shallow_merge(base: Value, patch: &Value) -> Value {
    let mut b = base.as_object().cloned().unwrap_or_default();
    if let Some(p) = patch.as_object() {
        for (k, v) in p {
            b.insert(k.clone(), v.clone());
        }
    }
    Value::Object(b)
}

fn extract_patch(raw: Value) -> Value {
    if raw.is_array() {
        raw.get(0).cloned().unwrap_or(Value::Null)
    } else {
        raw
    }
}

/// Только по **сырому** фрагменту ответа (до merge с дефолтами), иначе HA-ключи из дефолтов ломают legacy.
fn is_new_schema_patch(patch: &Value) -> bool {
    patch
        .as_object()
        .map(|o| {
            o.contains_key("TeamHA")
                || o.contains_key("TeamHB")
                || o.contains_key("ScoreHA")
                || o.contains_key("ScoreHB")
        })
        .unwrap_or(false)
}

fn merge_incoming(raw: Value) -> (Value, bool) {
    let patch = extract_patch(raw);
    let new_schema = is_new_schema_patch(&patch);
    let merged = if new_schema {
        shallow_merge(new_schema_defaults(), &patch)
    } else {
        shallow_merge(default_overlay_value(), &patch)
    };
    (merged, new_schema)
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
}

/// Снимок для OBS/WebSocket: ключи как в `GameState`.
pub fn build_client_state(source: &Value, field: ActiveField, use_new_schema: bool) -> Value {
    if !use_new_schema {
        return shallow_merge(default_overlay_value(), source);
    }

    let Some(obj) = source.as_object() else {
        return default_overlay_value();
    };

    let title_raw = as_str(obj.get("TournamentTitle"));
    let def_title = default_overlay_value()["TournamentTitle"]
        .as_str()
        .unwrap_or("")
        .to_string();
    let tournament = if title_raw.is_empty() {
        def_title
    } else {
        title_raw
    };
    let timer = as_str(obj.get("Timer"));
    let period = as_i64(obj.get("Period")).max(1) as i64;
    let running = as_bool(obj.get("Running"), false);
    let visible = as_bool(obj.get("Visible"), true);
    let pp_timer = as_str(obj.get("PowerPlayTimer"));
    let pp_active = as_bool(obj.get("PowerPlayActive"), false);
    let league_logo = as_str(obj.get("logoLeagues"));

    let (team_a, team_af, team_b, team_bf, pa, pb, sa, sb, sha, shb, la, lb): (
        String,
        String,
        String,
        String,
        String,
        String,
        i64,
        i64,
        i64,
        i64,
        String,
        String,
    ) = match field {
        ActiveField::A => (
            as_str(obj.get("TeamHA")),
            as_str(obj.get("TeamHAFull")),
            as_str(obj.get("TeamGA")),
            as_str(obj.get("TeamGAFull")),
            as_str(obj.get("PenaltyH")),
            as_str(obj.get("PenaltyG")),
            as_i64(obj.get("ScoreHA")),
            as_i64(obj.get("ScoreGA")),
            as_i64(obj.get("ShotsH")),
            as_i64(obj.get("ShotsG")),
            as_str(obj.get("LogoHA")),
            as_str(obj.get("LogoGA")),
        ),
        ActiveField::B => (
            as_str(obj.get("TeamHB")),
            as_str(obj.get("TeamHBFull")),
            as_str(obj.get("TeamGB")),
            as_str(obj.get("TeamGBFull")),
            as_str(obj.get("PenaltyH")),
            as_str(obj.get("PenaltyG")),
            as_i64(obj.get("ScoreHB")),
            as_i64(obj.get("ScoreGB")),
            as_i64(obj.get("ShotsH")),
            as_i64(obj.get("ShotsG")),
            as_str(obj.get("LogoHB")),
            as_str(obj.get("LogoGB")),
        ),
    };

    let team_a_o = if team_a.is_empty() {
        "A".to_string()
    } else {
        team_a
    };
    let team_af_o = if team_af.is_empty() {
        "Team A".to_string()
    } else {
        team_af
    };
    let team_b_o = if team_b.is_empty() {
        "B".to_string()
    } else {
        team_b
    };
    let team_bf_o = if team_bf.is_empty() {
        "Team B".to_string()
    } else {
        team_bf
    };
    let pa_o = if pa.is_empty() {
        "None".to_string()
    } else {
        pa
    };
    let pb_o = if pb.is_empty() {
        "None".to_string()
    } else {
        pb
    };
    let la_o = if la.is_empty() {
        "team-a.png".to_string()
    } else {
        la
    };
    let lb_o = if lb.is_empty() {
        "team-b.png".to_string()
    } else {
        lb
    };
    let timer_o = if timer.is_empty() {
        "20:00".to_string()
    } else {
        timer
    };
    let pp_timer_o = if pp_timer.is_empty() {
        "02:00".to_string()
    } else {
        pp_timer
    };

    serde_json::json!({
        "TournamentTitle": tournament,
        "SeriesInfo": "",
        "BrandingImage": league_logo,
        "TeamA": team_a_o,
        "TeamAFull": team_af_o,
        "TeamB": team_b_o,
        "TeamBFull": team_bf_o,
        "penalty_a": pa_o,
        "penalty_b": pb_o,
        "ScoreA": sa,
        "ScoreB": sb,
        "ShotsA": sha,
        "ShotsB": shb,
        "logo_a": la_o,
        "logo_b": lb_o,
        "Timer": timer_o,
        "PowerPlayTimer": pp_timer_o,
        "PowerPlayActive": pp_active,
        "Period": period,
        "Running": running,
        "Visible": visible,
    })
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
    pub use_new_schema: bool,
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
    let display = build_client_state(&g.source, g.field, g.use_new_schema);
    serde_json::json!({ "type": "state", "payload": display }).to_string()
}

async fn get_state_json(State(inner): State<GatewayInner>) -> Result<Json<Value>, StatusCode> {
    let g = inner.runtime.sync.read().await;
    let display = build_client_state(&g.source, g.field, g.use_new_schema);
    Ok(Json(display))
}

async fn ws_upgrade(ws: WebSocketUpgrade, State(inner): State<GatewayInner>) -> impl IntoResponse {
    ws.on_upgrade(move |socket| ws_connected(socket, inner))
}

async fn ws_connected(mut socket: WebSocket, inner: GatewayInner) {
    let mut rx = inner.runtime.tx.subscribe();
    let initial = {
        let g = inner.runtime.sync.read().await;
        build_client_state(&g.source, g.field, g.use_new_schema)
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
                            let (merged, new_schema) = merge_incoming(json);
                            {
                                let mut w = runtime.sync.write().await;
                                w.source = merged;
                                w.use_new_schema = new_schema;
                            }
                            let msg = envelope_for_display_async(&runtime).await;
                            let _ = runtime.tx.send(msg);
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

    pub async fn start(
        &mut self,
        app_handle: &AppHandle,
        api_url: String,
        port: u16,
        test_mode: bool,
        initial_field: ActiveField,
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
            source: new_schema_defaults(),
            field: initial_field,
            use_new_schema: true,
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
