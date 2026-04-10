mod gateway;

use std::sync::Arc;

use tauri::State;
use tokio::sync::Mutex;

pub type GatewayHandle = Arc<Mutex<gateway::GatewayController>>;

#[tauri::command]
async fn start_score_gateway(
    app: tauri::AppHandle,
    gateway: State<'_, GatewayHandle>,
    api_url: String,
    port: u16,
    test_mode: Option<bool>,
    ice_field: Option<String>,
) -> Result<String, String> {
    let mut g = gateway.lock().await;
    let test = test_mode.unwrap_or(false);
    let field = ice_field
        .as_deref()
        .and_then(gateway::ActiveField::parse)
        .unwrap_or_default();
    g.start(&app, api_url.trim().to_string(), port, test, field)
        .await
}

#[tauri::command]
async fn set_scoreboard_field(
    gateway: State<'_, GatewayHandle>,
    field: String,
) -> Result<(), String> {
    let f = gateway::ActiveField::parse(&field)
        .ok_or_else(|| "Укажите поле льда: A или B".to_string())?;
    let mut g = gateway.lock().await;
    g.set_field(f).await
}

#[tauri::command]
async fn stop_score_gateway(gateway: State<'_, GatewayHandle>) -> Result<(), String> {
    let mut g = gateway.lock().await;
    g.stop().await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage::<GatewayHandle>(Arc::new(Mutex::new(gateway::GatewayController::new())))
        .invoke_handler(tauri::generate_handler![
            start_score_gateway,
            set_scoreboard_field,
            stop_score_gateway
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
