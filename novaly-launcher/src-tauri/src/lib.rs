use tauri::Manager;
#[cfg(any(target_os = "linux", all(debug_assertions, windows)))]
use tauri_plugin_deep_link::DeepLinkExt;

/// Lance un jeu installé (utilisé sous Linux, où il n'y a pas d'équivalent à `open` / l'ouverture par défaut).
/// Le fichier doit exister ; on lui (re)donne le droit d'exécution, souvent perdu à la décompression.
#[tauri::command]
fn lancer_jeu(chemin: String) -> Result<(), String> {
    let executable = std::path::Path::new(&chemin);
    if !executable.is_absolute() || !executable.is_file() {
        return Err(format!("Exécutable introuvable : {chemin}"));
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(infos) = std::fs::metadata(executable) {
            let mut droits = infos.permissions();
            droits.set_mode(droits.mode() | 0o755);
            let _ = std::fs::set_permissions(executable, droits);
        }
    }
    let dossier = executable.parent().ok_or("Dossier du jeu introuvable")?;
    std::process::Command::new(executable)
        .current_dir(dossier)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Impossible de lancer le jeu : {e}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Doit être le premier plugin : si Novaly est déjà ouvert, on remet sa fenêtre au premier plan
        // (et le lien novaly:// reçu est transmis au plugin deep-link)
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(fenetre) = app.get_webview_window("main") {
                let _ = fenetre.unminimize();
                let _ = fenetre.set_focus();
            }
        }))
        // Les liens "novaly://" (site web, retour après paiement)
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![lancer_jeu])
        .setup(|app| {
            // Linux (AppImage) et Windows en développement : le schéma novaly:// doit être
            // enregistré au lancement (les installeurs Mac / Windows le font eux-mêmes)
            #[cfg(any(target_os = "linux", all(debug_assertions, windows)))]
            app.deep_link().register_all()?;
            let _ = app;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("erreur lors du lancement de l'application tauri");
}
