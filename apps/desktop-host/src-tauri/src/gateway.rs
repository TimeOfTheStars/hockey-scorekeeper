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
use serde_json::{Map, Value};
use tokio::sync::{broadcast, RwLock};
use tokio_util::sync::CancellationToken;
use tower_http::services::{ServeDir, ServeFile};

fn default_source_value_for(num_fields: i64) -> Value {
    let fields = if num_fields >= 2 {
        serde_json::json!({
            "A": {
                "TeamH": "A1",
                "TeamHFull": "Team A1",
                "TeamG": "B1",
                "TeamGFull": "Team B1",
                "ScoreH": 0,
                "ScoreG": 0,
                "ShotsH": 0,
                "ShotsG": 0,
                "LogoH": "team-a.png",
                "LogoG": "team-b.png",
                "Penalties": { "H": [], "G": [] }
            },
            "B": {
                "TeamH": "A2",
                "TeamHFull": "Team A2",
                "TeamG": "B2",
                "TeamGFull": "Team B2",
                "ScoreH": 0,
                "ScoreG": 0,
                "ShotsH": 0,
                "ShotsG": 0,
                "LogoH": "team-a.png",
                "LogoG": "team-b.png",
                "Penalties": { "H": [], "G": [] }
            }
        })
    } else {
        serde_json::json!({
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
        })
    };

    let mut value = serde_json::json!({
        "TournamentTitle": "Регулярный турнир по хоккею с шайбой",
        "num_fields": num_fields.max(1),
        "fields": fields,
        "Timer": 1200,
        "timer_running": false,
        "timer_default": 1200,
        "Period": 1,
        "Period_label": "1-й",
        "auto_next_period": false,
        "logoLeagues": "",
        "visible": true,
    });
    if num_fields < 2 {
        let obj = value.as_object_mut().expect("default source must be object");
        obj.insert("PenaltyH".to_string(), Value::Null);
        obj.insert("PenaltyG".to_string(), Value::Null);
    }
    value
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

#[derive(Clone, Copy, PartialEq)]
pub enum SourceMode {
    Server,
    Local,
}

impl Default for SourceMode {
    fn default() -> Self {
        SourceMode::Server
    }
}

impl SourceMode {
    pub fn parse(s: &str) -> Option<Self> {
        match s.trim().to_ascii_lowercase().as_str() {
            "server" => Some(SourceMode::Server),
            "local" => Some(SourceMode::Local),
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
    serde_json::json!({
        "type": "state",
        "payload": display,
        "source": g.source.clone(),
    })
    .to_string()
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
    let envelope = envelope_for_display_async(&inner.runtime).await;
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

async fn tick_loop(runtime: Arc<RuntimeHandles>, cancel: CancellationToken) {
    let mut interval = tokio::time::interval(Duration::from_secs(1));
    interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    loop {
        tokio::select! {
            _ = cancel.cancelled() => break,
            _ = interval.tick() => {
                let changed = {
                    let mut w = runtime.sync.write().await;
                    let Some(obj) = w.source.as_object_mut() else { continue; };
                    let running = obj.get("timer_running").and_then(Value::as_bool).unwrap_or(false);
                    let timer = obj.get("Timer").and_then(Value::as_i64).unwrap_or(0);
                    if running && timer > 0 {
                        let next = timer - 1;
                        obj.insert("Timer".to_string(), Value::from(next));
                        if next == 0 {
                            obj.insert("timer_running".to_string(), Value::Bool(false));
                        }
                        true
                    } else {
                        false
                    }
                };
                if changed {
                    let msg = envelope_for_display_async(&runtime).await;
                    let _ = runtime.tx.send(msg);
                }
            }
        }
    }
}

fn source_obj_mut(value: &mut Value) -> Option<&mut Map<String, Value>> {
    value.as_object_mut()
}

fn field_map_mut<'a>(source: &'a mut Value, field: ActiveField) -> Option<&'a mut Map<String, Value>> {
    let obj = source.as_object_mut()?;
    let fields_entry = obj
        .entry("fields".to_string())
        .or_insert_with(|| Value::Object(Map::new()));
    let fields_obj = fields_entry.as_object_mut()?;
    let key = field.key().to_string();
    let f = fields_entry_or_insert(fields_obj, key)?;
    f.as_object_mut()
}

fn fields_entry_or_insert<'a>(
    fields_obj: &'a mut Map<String, Value>,
    key: String,
) -> Option<&'a mut Value> {
    if !fields_obj.contains_key(&key) {
        fields_obj.insert(key.clone(), Value::Object(Map::new()));
    }
    fields_obj.get_mut(&key)
}

fn team_keys(team: char) -> Option<(&'static str, &'static str, &'static str, &'static str, &'static str)> {
    match team.to_ascii_uppercase() {
        'H' => Some(("TeamH", "TeamHFull", "ScoreH", "ShotsH", "LogoH")),
        'G' => Some(("TeamG", "TeamGFull", "ScoreG", "ShotsG", "LogoG")),
        _ => None,
    }
}

fn parse_field(s: &str) -> Option<ActiveField> {
    ActiveField::parse(s)
}

fn parse_team(s: &str) -> Option<char> {
    let upper = s.trim().to_ascii_uppercase();
    let c = upper.chars().next()?;
    match c {
        'H' | 'G' => Some(c),
        _ => None,
    }
}

pub struct GatewayController {
    cancel: Option<CancellationToken>,
    server_task: Option<tokio::task::JoinHandle<std::io::Result<()>>>,
    poller_task: Option<tokio::task::JoinHandle<()>>,
    tick_task: Option<tokio::task::JoinHandle<()>>,
    pub runtime: Option<Arc<RuntimeHandles>>,
    pub bound_port: Option<u16>,
}

impl GatewayController {
    pub fn new() -> Self {
        Self {
            cancel: None,
            server_task: None,
            poller_task: None,
            tick_task: None,
            runtime: None,
            bound_port: None,
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
        if let Some(h) = self.tick_task.take() {
            h.await.map_err(|e| format!("tick join: {e}"))?;
        }
        self.runtime = None;
        self.bound_port = None;
        Ok(())
    }

    pub async fn set_field(&mut self, field: ActiveField) -> Result<(), String> {
        let rt = self.runtime_ref()?;
        {
            let mut w = rt.sync.write().await;
            w.field = field;
        }
        self.broadcast(rt).await;
        Ok(())
    }

    pub async fn set_name_mode(&mut self, mode: TeamNameMode) -> Result<(), String> {
        let rt = self.runtime_ref()?;
        {
            let mut w = rt.sync.write().await;
            w.name_mode = mode;
        }
        self.broadcast(rt).await;
        Ok(())
    }

    fn runtime_ref(&self) -> Result<Arc<RuntimeHandles>, String> {
        self.runtime
            .as_ref()
            .cloned()
            .ok_or_else(|| "Сервер не запущен".to_string())
    }

    async fn broadcast(&self, rt: Arc<RuntimeHandles>) {
        let msg = envelope_for_display_async(&rt).await;
        let _ = rt.tx.send(msg);
    }

    async fn mutate<F>(&self, mutator: F) -> Result<(), String>
    where
        F: FnOnce(&mut Value),
    {
        let rt = self.runtime_ref()?;
        {
            let mut w = rt.sync.write().await;
            mutator(&mut w.source);
        }
        self.broadcast(rt).await;
        Ok(())
    }

    pub async fn set_score(&self, field: ActiveField, team: char, value: i64) -> Result<(), String> {
        let (_, _, score_key, _, _) = team_keys(team).ok_or_else(|| "team: H или G".to_string())?;
        self.mutate(|src| {
            if let Some(f) = field_map_mut(src, field) {
                f.insert(score_key.to_string(), Value::from(value.max(0)));
            }
        })
        .await
    }

    pub async fn set_shots(&self, field: ActiveField, team: char, value: i64) -> Result<(), String> {
        let (_, _, _, shots_key, _) = team_keys(team).ok_or_else(|| "team: H или G".to_string())?;
        self.mutate(|src| {
            if let Some(f) = field_map_mut(src, field) {
                f.insert(shots_key.to_string(), Value::from(value.max(0)));
            }
        })
        .await
    }

    pub async fn set_team_name(
        &self,
        field: ActiveField,
        team: char,
        short: String,
        full: String,
    ) -> Result<(), String> {
        let (short_key, full_key, _, _, _) =
            team_keys(team).ok_or_else(|| "team: H или G".to_string())?;
        self.mutate(|src| {
            if let Some(f) = field_map_mut(src, field) {
                f.insert(short_key.to_string(), Value::String(short));
                f.insert(full_key.to_string(), Value::String(full));
            }
        })
        .await
    }

    pub async fn set_team_logo(
        &self,
        field: ActiveField,
        team: char,
        url: String,
    ) -> Result<(), String> {
        let (_, _, _, _, logo_key) =
            team_keys(team).ok_or_else(|| "team: H или G".to_string())?;
        self.mutate(|src| {
            if let Some(f) = field_map_mut(src, field) {
                f.insert(logo_key.to_string(), Value::String(url));
            }
        })
        .await
    }

    pub async fn set_penalty(
        &self,
        field: ActiveField,
        team: char,
        value: Option<String>,
    ) -> Result<(), String> {
        let team_upper = team.to_ascii_uppercase();
        if team_upper != 'H' && team_upper != 'G' {
            return Err("team: H или G".to_string());
        }
        self.mutate(|src| {
            let num_fields = src
                .get("num_fields")
                .and_then(Value::as_i64)
                .unwrap_or(1)
                .max(1);
            if num_fields >= 2 {
                if let Some(f) = field_map_mut(src, field) {
                    let pen_entry = f
                        .entry("Penalties".to_string())
                        .or_insert_with(|| serde_json::json!({"H": [], "G": []}));
                    if let Some(pen_obj) = pen_entry.as_object_mut() {
                        let key = team_upper.to_string();
                        let arr = match value.as_ref() {
                            Some(v) if !v.trim().is_empty() => {
                                Value::Array(vec![Value::String(v.trim().to_string())])
                            }
                            _ => Value::Array(Vec::new()),
                        };
                        pen_obj.insert(key, arr);
                    }
                }
            } else if let Some(obj) = src.as_object_mut() {
                let key = format!("Penalty{}", team_upper);
                let val = match value.as_ref() {
                    Some(v) if !v.trim().is_empty() => Value::String(v.trim().to_string()),
                    _ => Value::Null,
                };
                obj.insert(key, val);
            }
        })
        .await
    }

    pub async fn set_tournament(
        &self,
        title: String,
        league_logo: String,
    ) -> Result<(), String> {
        self.mutate(|src| {
            if let Some(obj) = source_obj_mut(src) {
                obj.insert("TournamentTitle".to_string(), Value::String(title));
                obj.insert("logoLeagues".to_string(), Value::String(league_logo));
            }
        })
        .await
    }

    pub async fn set_visible(&self, value: bool) -> Result<(), String> {
        self.mutate(|src| {
            if let Some(obj) = source_obj_mut(src) {
                obj.insert("visible".to_string(), Value::Bool(value));
            }
        })
        .await
    }

    pub async fn set_period(&self, value: i64, label: String) -> Result<(), String> {
        self.mutate(|src| {
            if let Some(obj) = source_obj_mut(src) {
                obj.insert("Period".to_string(), Value::from(value.max(1)));
                obj.insert("Period_label".to_string(), Value::String(label));
            }
        })
        .await
    }

    pub async fn set_timer(&self, seconds: i64) -> Result<(), String> {
        self.mutate(|src| {
            if let Some(obj) = source_obj_mut(src) {
                obj.insert("Timer".to_string(), Value::from(seconds.max(0)));
            }
        })
        .await
    }

    pub async fn set_timer_default(&self, seconds: i64) -> Result<(), String> {
        self.mutate(|src| {
            if let Some(obj) = source_obj_mut(src) {
                obj.insert("timer_default".to_string(), Value::from(seconds.max(0)));
            }
        })
        .await
    }

    pub async fn set_timer_running(&self, value: bool) -> Result<(), String> {
        self.mutate(|src| {
            if let Some(obj) = source_obj_mut(src) {
                obj.insert("timer_running".to_string(), Value::Bool(value));
            }
        })
        .await
    }

    pub async fn reset_timer(&self) -> Result<(), String> {
        self.mutate(|src| {
            if let Some(obj) = source_obj_mut(src) {
                let def = obj.get("timer_default").and_then(Value::as_i64).unwrap_or(1200);
                obj.insert("Timer".to_string(), Value::from(def));
                obj.insert("timer_running".to_string(), Value::Bool(false));
            }
        })
        .await
    }

    pub async fn set_num_fields(&self, value: i64) -> Result<(), String> {
        let target = value.clamp(1, 2);
        self.mutate(|src| {
            if let Some(obj) = source_obj_mut(src) {
                obj.insert("num_fields".to_string(), Value::from(target));
                // Гарантируем структуру fields соответственно target.
                let fields_entry = obj
                    .entry("fields".to_string())
                    .or_insert_with(|| Value::Object(Map::new()));
                if let Some(fields_obj) = fields_entry.as_object_mut() {
                    if !fields_obj.contains_key("A") {
                        fields_obj.insert("A".to_string(), default_field_object(1));
                    }
                    if target >= 2 {
                        if !fields_obj.contains_key("B") {
                            fields_obj.insert("B".to_string(), default_field_object(2));
                        }
                        // обеспечим наличие Penalties в обоих
                        ensure_penalties_in_field(fields_obj, "A");
                        ensure_penalties_in_field(fields_obj, "B");
                    } else {
                        // 1-полевой: убираем Penalties из fields, добавляем top-level
                        if let Some(a) = fields_obj.get_mut("A").and_then(|v| v.as_object_mut()) {
                            a.remove("Penalties");
                        }
                        if !obj.contains_key("PenaltyH") {
                            obj.insert("PenaltyH".to_string(), Value::Null);
                        }
                        if !obj.contains_key("PenaltyG") {
                            obj.insert("PenaltyG".to_string(), Value::Null);
                        }
                    }
                }
                if target >= 2 {
                    obj.remove("PenaltyH");
                    obj.remove("PenaltyG");
                }
            }
        })
        .await
    }

    pub async fn start(
        &mut self,
        app_handle: &AppHandle,
        api_url: String,
        port: u16,
        source_mode: SourceMode,
        initial_field: ActiveField,
        initial_name_mode: TeamNameMode,
        initial_num_fields: i64,
    ) -> Result<String, String> {
        if matches!(source_mode, SourceMode::Server) {
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

        let initial_source = match source_mode {
            SourceMode::Server => default_source_value_for(initial_num_fields.max(1)),
            SourceMode::Local => default_source_value_for(initial_num_fields.clamp(1, 2)),
        };

        let sync = Arc::new(RwLock::new(GatewaySync {
            source: initial_source,
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

        let (poller_task, tick_task) = match source_mode {
            SourceMode::Server => {
                let poll_cancel = token.clone();
                let rt = runtime.clone();
                let handle = tokio::spawn(async move {
                    poll_loop(api_url, rt, poll_cancel).await;
                });
                (Some(handle), None)
            }
            SourceMode::Local => {
                let msg = envelope_for_display_async(&runtime).await;
                let _ = tx.send(msg);
                let tick_cancel = token.clone();
                let rt = runtime.clone();
                let handle = tokio::spawn(async move {
                    tick_loop(rt, tick_cancel).await;
                });
                (None, Some(handle))
            }
        };

        self.cancel = Some(token);
        self.server_task = Some(server_task);
        self.poller_task = poller_task;
        self.tick_task = tick_task;
        self.runtime = Some(runtime);
        self.bound_port = Some(bound.port());

        Ok(format!("http://127.0.0.1:{}/", bound.port()))
    }
}

fn default_field_object(idx: i64) -> Value {
    let suffix = if idx <= 1 { "" } else { "2" };
    serde_json::json!({
        "TeamH": format!("A{}", suffix),
        "TeamHFull": format!("Team A{}", suffix),
        "TeamG": format!("B{}", suffix),
        "TeamGFull": format!("Team B{}", suffix),
        "ScoreH": 0,
        "ScoreG": 0,
        "ShotsH": 0,
        "ShotsG": 0,
        "LogoH": "team-a.png",
        "LogoG": "team-b.png",
        "Penalties": { "H": [], "G": [] }
    })
}

fn ensure_penalties_in_field(fields_obj: &mut Map<String, Value>, key: &str) {
    if let Some(f) = fields_obj.get_mut(key).and_then(|v| v.as_object_mut()) {
        if !f.contains_key("Penalties") {
            f.insert(
                "Penalties".to_string(),
                serde_json::json!({"H": [], "G": []}),
            );
        }
    }
}

pub fn parse_field_arg(s: &str) -> Result<ActiveField, String> {
    parse_field(s).ok_or_else(|| "field: A или B".to_string())
}

pub fn parse_team_arg(s: &str) -> Result<char, String> {
    parse_team(s).ok_or_else(|| "team: H или G".to_string())
}
