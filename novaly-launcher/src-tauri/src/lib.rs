// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // 🚀 L'UPDATER EST INITIALISÉ JUSTE ICI :
        .plugin(tauri_plugin_updater::Builder::new().build()) 
        // Laisse la ligne invoke_handler si tu l'avais avant
        .run(tauri::generate_context!())
        .expect("erreur lors du lancement de l'application tauri");
}