// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        // 🚀 L'UPDATER EST INITIALISÉ JUSTE ICI :
        .plugin(tauri_plugin_updater::Builder::new().build()) 
        .invoke_handler(tauri::generate_handler![greet]) // (Si tu as la fonction greet)
        .run(tauri::generate_context!())
        .expect("erreur lors du lancement de l'application tauri");
}