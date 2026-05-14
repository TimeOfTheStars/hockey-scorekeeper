mod gateway;

use std::sync::Arc;

use tauri::{AppHandle, Manager, State, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_dialog::DialogExt;
use tokio::sync::Mutex;

pub type GatewayHandle = Arc<Mutex<gateway::GatewayController>>;

#[tauri::command]
async fn start_score_gateway(
    app: tauri::AppHandle,
    gateway: State<'_, GatewayHandle>,
    api_url: String,
    port: u16,
    source_mode: Option<String>,
    ice_field: Option<String>,
    name_mode: Option<String>,
    num_fields: Option<i64>,
) -> Result<String, String> {
    let mut g = gateway.lock().await;
    let mode = source_mode
        .as_deref()
        .and_then(gateway::SourceMode::parse)
        .unwrap_or_default();
    let field = ice_field
        .as_deref()
        .and_then(gateway::ActiveField::parse)
        .unwrap_or_default();
    let name = name_mode
        .as_deref()
        .and_then(gateway::TeamNameMode::parse)
        .unwrap_or_default();
    let n = num_fields.unwrap_or(1);
    g.start(&app, api_url.trim().to_string(), port, mode, field, name, n)
        .await
}

#[tauri::command]
async fn set_scoreboard_field(
    gateway: State<'_, GatewayHandle>,
    field: String,
) -> Result<(), String> {
    let f = gateway::parse_field_arg(&field)?;
    let mut g = gateway.lock().await;
    g.set_field(f).await
}

#[tauri::command]
async fn set_scoreboard_name_mode(
    gateway: State<'_, GatewayHandle>,
    mode: String,
) -> Result<(), String> {
    let m = gateway::TeamNameMode::parse(&mode)
        .ok_or_else(|| "Укажите режим: short или full".to_string())?;
    let mut g = gateway.lock().await;
    g.set_name_mode(m).await
}

#[tauri::command]
async fn stop_score_gateway(
    app: tauri::AppHandle,
    gateway: State<'_, GatewayHandle>,
) -> Result<(), String> {
    let mut g = gateway.lock().await;
    g.stop().await?;
    if let Some(w) = app.get_webview_window("control") {
        let _ = w.close();
    }
    Ok(())
}

#[tauri::command]
async fn set_score(
    gateway: State<'_, GatewayHandle>,
    field: String,
    team: String,
    value: i64,
) -> Result<(), String> {
    let f = gateway::parse_field_arg(&field)?;
    let t = gateway::parse_team_arg(&team)?;
    let g = gateway.lock().await;
    g.set_score(f, t, value).await
}

#[tauri::command]
async fn set_shots(
    gateway: State<'_, GatewayHandle>,
    field: String,
    team: String,
    value: i64,
) -> Result<(), String> {
    let f = gateway::parse_field_arg(&field)?;
    let t = gateway::parse_team_arg(&team)?;
    let g = gateway.lock().await;
    g.set_shots(f, t, value).await
}

#[tauri::command]
async fn set_team_name(
    gateway: State<'_, GatewayHandle>,
    field: String,
    team: String,
    short: String,
    full: String,
) -> Result<(), String> {
    let f = gateway::parse_field_arg(&field)?;
    let t = gateway::parse_team_arg(&team)?;
    let g = gateway.lock().await;
    g.set_team_name(f, t, short, full).await
}

#[tauri::command]
async fn set_team_logo(
    gateway: State<'_, GatewayHandle>,
    field: String,
    team: String,
    url: String,
) -> Result<(), String> {
    let f = gateway::parse_field_arg(&field)?;
    let t = gateway::parse_team_arg(&team)?;
    let g = gateway.lock().await;
    g.set_team_logo(f, t, url).await
}

#[tauri::command]
async fn set_penalty(
    gateway: State<'_, GatewayHandle>,
    field: String,
    team: String,
    value: Option<String>,
) -> Result<(), String> {
    let f = gateway::parse_field_arg(&field)?;
    let t = gateway::parse_team_arg(&team)?;
    let g = gateway.lock().await;
    g.set_penalty(f, t, value).await
}

#[tauri::command]
async fn set_tournament(
    gateway: State<'_, GatewayHandle>,
    title: String,
    league_logo: String,
) -> Result<(), String> {
    let g = gateway.lock().await;
    g.set_tournament(title, league_logo).await
}

#[tauri::command]
async fn set_visible(
    gateway: State<'_, GatewayHandle>,
    value: bool,
) -> Result<(), String> {
    let g = gateway.lock().await;
    g.set_visible(value).await
}

#[tauri::command]
async fn set_period(
    gateway: State<'_, GatewayHandle>,
    value: i64,
    label: String,
) -> Result<(), String> {
    let g = gateway.lock().await;
    g.set_period(value, label).await
}

#[tauri::command]
async fn set_timer(
    gateway: State<'_, GatewayHandle>,
    seconds: i64,
) -> Result<(), String> {
    let g = gateway.lock().await;
    g.set_timer(seconds).await
}

#[tauri::command]
async fn set_timer_default(
    gateway: State<'_, GatewayHandle>,
    seconds: i64,
) -> Result<(), String> {
    let g = gateway.lock().await;
    g.set_timer_default(seconds).await
}

#[tauri::command]
async fn set_timer_running(
    gateway: State<'_, GatewayHandle>,
    value: bool,
) -> Result<(), String> {
    let g = gateway.lock().await;
    g.set_timer_running(value).await
}

#[tauri::command]
async fn reset_timer(gateway: State<'_, GatewayHandle>) -> Result<(), String> {
    let g = gateway.lock().await;
    g.reset_timer().await
}

#[tauri::command]
async fn set_num_fields(
    gateway: State<'_, GatewayHandle>,
    value: i64,
) -> Result<(), String> {
    let g = gateway.lock().await;
    g.set_num_fields(value).await
}

#[tauri::command]
async fn pick_logo_file(
    app: AppHandle,
    gateway: State<'_, GatewayHandle>,
) -> Result<Option<String>, String> {
    let port = {
        let g = gateway.lock().await;
        g.bound_port
            .ok_or_else(|| "Сервер не запущен".to_string())?
    };

    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .add_filter("Изображения", &["png", "jpg", "jpeg", "gif", "svg", "webp"])
        .pick_file(move |path| {
            let _ = tx.send(path);
        });
    let chosen = rx.await.map_err(|e| format!("dialog: {e}"))?;
    let Some(file_path) = chosen else {
        return Ok(None);
    };
    let source_path = file_path
        .into_path()
        .map_err(|e| format!("file path: {e}"))?;

    let logos_dir = gateway::user_logos_dir(&app)?;
    std::fs::create_dir_all(&logos_dir).map_err(|e| format!("создать logos dir: {e}"))?;

    let basename = source_path
        .file_name()
        .ok_or_else(|| "Не удалось определить имя файла".to_string())?
        .to_string_lossy()
        .to_string();

    let mut target_name = basename.clone();
    let mut target_path = logos_dir.join(&target_name);
    if target_path.exists() {
        let stem = source_path
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| "logo".to_string());
        let ext = source_path
            .extension()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_default();
        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        target_name = if ext.is_empty() {
            format!("{}-{}", stem, ts)
        } else {
            format!("{}-{}.{}", stem, ts, ext)
        };
        target_path = logos_dir.join(&target_name);
    }

    std::fs::copy(&source_path, &target_path).map_err(|e| format!("копирование: {e}"))?;

    let encoded = url_encode_filename(&target_name);
    Ok(Some(format!("http://127.0.0.1:{}/user-logos/{}", port, encoded)))
}

fn url_encode_filename(name: &str) -> String {
    name.chars()
        .map(|c| match c {
            'A'..='Z' | 'a'..='z' | '0'..='9' | '.' | '_' | '-' | '~' => c.to_string(),
            _ => {
                let mut buf = [0u8; 4];
                let s = c.encode_utf8(&mut buf);
                s.as_bytes()
                    .iter()
                    .map(|b| format!("%{:02X}", b))
                    .collect::<String>()
            }
        })
        .collect()
}

#[tauri::command]
async fn open_control_window(
    app: AppHandle,
    gateway: State<'_, GatewayHandle>,
) -> Result<(), String> {
    let port = {
        let g = gateway.lock().await;
        g.bound_port
            .ok_or_else(|| "Сервер не запущен".to_string())?
    };
    if let Some(w) = app.get_webview_window("control") {
        let _ = w.set_focus();
        return Ok(());
    }
    let url = format!("index.html?window=control&port={}", port);
    WebviewWindowBuilder::new(&app, "control", WebviewUrl::App(url.into()))
        .title("Панель управления табло")
        .inner_size(560.0, 900.0)
        .min_inner_size(480.0, 720.0)
        .resizable(true)
        .build()
        .map_err(|e| format!("control window: {e}"))?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage::<GatewayHandle>(Arc::new(Mutex::new(gateway::GatewayController::new())))
        .invoke_handler(tauri::generate_handler![
            start_score_gateway,
            set_scoreboard_field,
            set_scoreboard_name_mode,
            stop_score_gateway,
            set_score,
            set_shots,
            set_team_name,
            set_team_logo,
            set_penalty,
            set_tournament,
            set_visible,
            set_period,
            set_timer,
            set_timer_default,
            set_timer_running,
            reset_timer,
            set_num_fields,
            open_control_window,
            pick_logo_file,
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
