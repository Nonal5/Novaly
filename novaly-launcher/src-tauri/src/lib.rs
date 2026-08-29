#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        // 🚀 L'UPDATER EST INITIALISÉ JUSTE ICI :
        .plugin(tauri_plugin_updater::Builder::new().build())
        // Laisse la ligne invoke_handler si tu l'avais avant
        .run(tauri::generate_context!())
        .expect("erreur lors du lancement de l'application tauri");
}
