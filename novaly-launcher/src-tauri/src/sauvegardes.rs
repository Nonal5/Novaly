//! Sauvegardes cloud : le dossier de sauvegarde d'un jeu est compressé en .zip et stocké
//! dans Firebase Storage sous saves/{uid}/{gameId}.zip (voir storage.rules).
//! Les échanges passent par Rust (API REST de Firebase Storage) et pas par la page web,
//! pour ne pas dépendre de la configuration CORS du bucket.

use std::io::{Cursor, Read, Write};
use std::path::{Path, PathBuf};

const BUCKET: &str = "novaly-a80f7.firebasestorage.app";
/// Au-delà, on refuse d'envoyer (la règle Storage applique la même limite).
const TAILLE_MAX: usize = 100 * 1024 * 1024;

fn client() -> Result<reqwest::Client, String> {
    // reqwest est compilé sans fournisseur crypto par défaut (comme pour le plugin updater)
    if rustls::crypto::CryptoProvider::get_default().is_none() {
        let _ = rustls::crypto::ring::default_provider().install_default();
    }
    reqwest::Client::builder()
        .build()
        .map_err(|e| format!("Client réseau indisponible : {e}"))
}

/// Seuls les chemins saves/<uid>/<gameId>.zip sont acceptés.
fn url_objet(objet: &str) -> Result<String, String> {
    let morceaux: Vec<&str> = objet.split('/').collect();
    let valide = morceaux.len() == 3
        && morceaux[0] == "saves"
        && morceaux[1..].iter().all(|m| {
            !m.is_empty()
                && !m.starts_with('.')
                && m.chars()
                    .all(|c| c.is_ascii_alphanumeric() || "-_.".contains(c))
        })
        && morceaux[2].ends_with(".zip");
    if !valide {
        return Err("Chemin de sauvegarde invalide".into());
    }
    Ok(format!(
        "https://firebasestorage.googleapis.com/v0/b/{BUCKET}/o/{}",
        objet.replace('/', "%2F")
    ))
}

fn dossier_absolu(dossier: &str) -> Result<PathBuf, String> {
    let chemin = PathBuf::from(dossier);
    if !chemin.is_absolute() || chemin.parent().is_none() {
        return Err(format!("Dossier de sauvegarde invalide : {dossier}"));
    }
    Ok(chemin)
}

fn ajouter_au_zip(
    zip: &mut zip::ZipWriter<Cursor<Vec<u8>>>,
    racine: &Path,
    dossier: &Path,
    total: &mut usize,
) -> Result<(), String> {
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);
    let entrees = std::fs::read_dir(dossier).map_err(|e| e.to_string())?;
    for entree in entrees {
        let entree = entree.map_err(|e| e.to_string())?;
        let chemin = entree.path();
        let type_ = entree.file_type().map_err(|e| e.to_string())?;
        if type_.is_symlink() {
            continue;
        }
        let relatif = chemin
            .strip_prefix(racine)
            .map_err(|e| e.to_string())?
            .to_string_lossy()
            .replace('\\', "/");
        if type_.is_dir() {
            zip.add_directory(format!("{relatif}/"), options)
                .map_err(|e| e.to_string())?;
            ajouter_au_zip(zip, racine, &chemin, total)?;
        } else {
            zip.start_file(relatif, options)
                .map_err(|e| e.to_string())?;
            let mut contenu = Vec::new();
            std::fs::File::open(&chemin)
                .and_then(|mut f| f.read_to_end(&mut contenu))
                .map_err(|e| format!("Lecture de {} impossible : {e}", chemin.display()))?;
            *total += contenu.len();
            if *total > 3 * TAILLE_MAX {
                return Err("Sauvegarde trop volumineuse (100 Mo max)".into());
            }
            zip.write_all(&contenu).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn zipper(dossier: &Path) -> Result<Vec<u8>, String> {
    let mut zip = zip::ZipWriter::new(Cursor::new(Vec::new()));
    ajouter_au_zip(&mut zip, dossier, dossier, &mut 0)?;
    let octets = zip.finish().map_err(|e| e.to_string())?.into_inner();
    if octets.len() > TAILLE_MAX {
        return Err("Sauvegarde trop volumineuse (100 Mo max)".into());
    }
    Ok(octets)
}

fn dossier_non_vide(dossier: &Path) -> bool {
    std::fs::read_dir(dossier)
        .map(|mut it| it.next().is_some())
        .unwrap_or(false)
}

/// Décompresse l'archive dans le dossier, après une copie de secours des fichiers locaux.
fn dezipper(octets: Vec<u8>, dossier: &Path) -> Result<(), String> {
    let mut archive =
        zip::ZipArchive::new(Cursor::new(octets)).map_err(|e| format!("Archive invalide : {e}"))?;

    if dossier_non_vide(dossier) {
        let copie = zipper(dossier)?;
        let mut nom = dossier.file_name().unwrap_or_default().to_os_string();
        nom.push(".avant-cloud.zip");
        std::fs::write(dossier.with_file_name(nom), copie)
            .map_err(|e| format!("Copie de secours impossible : {e}"))?;
    }

    std::fs::create_dir_all(dossier).map_err(|e| e.to_string())?;
    for i in 0..archive.len() {
        let mut fichier = archive.by_index(i).map_err(|e| e.to_string())?;
        // enclosed_name refuse les chemins absolus et les "../" (zip slip)
        let Some(relatif) = fichier.enclosed_name() else {
            continue;
        };
        let cible = dossier.join(relatif);
        if fichier.is_dir() {
            std::fs::create_dir_all(&cible).map_err(|e| e.to_string())?;
            continue;
        }
        if let Some(parent) = cible.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let mut sortie = std::fs::File::create(&cible)
            .map_err(|e| format!("Écriture de {} impossible : {e}", cible.display()))?;
        std::io::copy(&mut fichier, &mut sortie).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Date de dernière modification de la sauvegarde en ligne (None s'il n'y en a pas).
#[tauri::command]
pub async fn sauvegarde_infos(objet: String, jeton: String) -> Result<Option<String>, String> {
    let reponse = client()?
        .get(url_objet(&objet)?)
        .header("Authorization", format!("Firebase {jeton}"))
        .send()
        .await
        .map_err(|e| format!("Réseau : {e}"))?;
    if reponse.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(None);
    }
    if !reponse.status().is_success() {
        return Err(format!("Cloud : erreur {}", reponse.status()));
    }
    let infos: serde_json::Value = reponse.json().await.map_err(|e| e.to_string())?;
    Ok(infos["updated"].as_str().map(String::from))
}

/// Compresse le dossier et l'envoie. Renvoie la date de la sauvegarde en ligne,
/// ou None si le dossier n'existe pas / est vide (rien à envoyer).
#[tauri::command]
pub async fn sauvegarde_envoyer(
    dossier: String,
    objet: String,
    jeton: String,
) -> Result<Option<String>, String> {
    let dossier = dossier_absolu(&dossier)?;
    let url = url_objet(&objet)?;
    if !dossier_non_vide(&dossier) {
        return Ok(None);
    }
    let octets = tauri::async_runtime::spawn_blocking(move || zipper(&dossier))
        .await
        .map_err(|e| e.to_string())??;

    let reponse = client()?
        .post(format!("{url}?uploadType=media"))
        .header("Authorization", format!("Firebase {jeton}"))
        .header("Content-Type", "application/zip")
        .body(octets)
        .send()
        .await
        .map_err(|e| format!("Réseau : {e}"))?;
    if !reponse.status().is_success() {
        return Err(format!("Envoi refusé ({})", reponse.status()));
    }
    let infos: serde_json::Value = reponse.json().await.map_err(|e| e.to_string())?;
    Ok(infos["updated"].as_str().map(String::from))
}

/// Télécharge la sauvegarde en ligne et la décompresse dans le dossier.
/// Les fichiers locaux sont d'abord copiés dans <dossier>.avant-cloud.zip (rien n'est perdu).
#[tauri::command]
pub async fn sauvegarde_recuperer(
    dossier: String,
    objet: String,
    jeton: String,
) -> Result<(), String> {
    let dossier = dossier_absolu(&dossier)?;
    let reponse = client()?
        .get(format!("{}?alt=media", url_objet(&objet)?))
        .header("Authorization", format!("Firebase {jeton}"))
        .send()
        .await
        .map_err(|e| format!("Réseau : {e}"))?;
    if !reponse.status().is_success() {
        return Err(format!("Téléchargement refusé ({})", reponse.status()));
    }
    let octets = reponse.bytes().await.map_err(|e| e.to_string())?.to_vec();

    tauri::async_runtime::spawn_blocking(move || dezipper(octets, &dossier))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn aller_retour_avec_copie_de_secours() {
        let base = std::env::temp_dir().join(format!("novaly-test-{}", std::process::id()));
        let src = base.join("src");
        std::fs::create_dir_all(src.join("sous/dossier")).unwrap();
        std::fs::write(src.join("a.sav"), b"partie 1").unwrap();
        std::fs::write(src.join("sous/dossier/b.sav"), vec![7u8; 10_000]).unwrap();
        let octets = zipper(&src).unwrap();

        let dst = base.join("dst");
        std::fs::create_dir_all(&dst).unwrap();
        std::fs::write(dst.join("local.sav"), b"ancien").unwrap();
        dezipper(octets, &dst).unwrap();

        assert_eq!(std::fs::read(dst.join("a.sav")).unwrap(), b"partie 1");
        assert_eq!(
            std::fs::read(dst.join("sous/dossier/b.sav")).unwrap().len(),
            10_000
        );
        assert!(base.join("dst.avant-cloud.zip").is_file());
        std::fs::remove_dir_all(&base).unwrap();
    }

    #[test]
    fn chemins_objets() {
        assert!(url_objet("saves/abc123/jeu-1.zip").is_ok());
        assert!(url_objet("saves/../x.zip").is_err());
        assert!(url_objet("avatars/abc.jpg").is_err());
        assert!(url_objet("saves/a/b/c.zip").is_err());
    }
}
