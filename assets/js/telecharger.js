// Remplit les boutons de téléchargement avec les fichiers de la dernière release GitHub.
// Un bouton dont le fichier n'existe pas encore est grisé.
const PLATEFORMES = [
    { id: 'download-win',        fichier: nom => nom.endsWith('-setup.exe') },
    { id: 'download-mac',        fichier: nom => nom.endsWith('_aarch64.dmg') },
    { id: 'download-mac-intel',  fichier: nom => nom.endsWith('_x64.dmg') },
    { id: 'download-linux',      fichier: nom => nom.endsWith('.AppImage') }
];
const PAGE_RELEASES = "https://github.com/Nonal5/Novaly/releases/latest";

async function fetchLatestReleases() {
    try {
        const response = await fetch('https://api.github.com/repos/Nonal5/Novaly/releases/latest');
        if (!response.ok) throw new Error("API GitHub : " + response.status);
        const data = await response.json();

        PLATEFORMES.forEach(({ id, fichier }) => {
            const bouton = document.getElementById(id);
            const asset = data.assets.find(a => fichier(a.name));
            if (asset) {
                bouton.href = asset.browser_download_url;
            } else {
                // Pas encore disponible pour cette plateforme
                bouton.removeAttribute('download');
                bouton.classList.add('disabled');
                bouton.href = PAGE_RELEASES;
            }
        });
    } catch (error) {
        console.log("Erreur lors de la récupération des liens GitHub :", error);
        // Liens de secours au cas où l'API GitHub bloque
        PLATEFORMES.forEach(({ id }) => {
            const bouton = document.getElementById(id);
            bouton.removeAttribute('download');
            bouton.href = PAGE_RELEASES;
        });
    }
}

// Lance la fonction au chargement de la page
fetchLatestReleases();
