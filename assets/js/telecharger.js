async function fetchLatestReleases() {
    try {
        // Va chercher les infos de la dernière release de ton dépôt
        const response = await fetch('https://api.github.com/repos/Nonal5/Novaly/releases/latest');
        const data = await response.json();

        // Parcourt les fichiers attachés à la release
        data.assets.forEach(asset => {
            // Si c'est le fichier Windows
            if (asset.name.endsWith('.exe')) {
                document.getElementById('download-win').href = asset.browser_download_url;
            }
            // Si c'est le fichier Mac
            if (asset.name.endsWith('.dmg')) {
                document.getElementById('download-mac').href = asset.browser_download_url;
            }
        });
    } catch (error) {
        console.log("Erreur lors de la récupération des liens GitHub :", error);
        // Liens de secours au cas où l'API GitHub bloque
        document.getElementById('download-win').href = "https://github.com/Nonal5/Novaly/releases/latest";
        document.getElementById('download-mac').href = "https://github.com/Nonal5/Novaly/releases/latest";
    }
}

// Lance la fonction au chargement de la page
fetchLatestReleases();
