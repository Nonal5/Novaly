// ================= NOTIFICATIONS NOVALY =================
// Remplace toutes les pop-ups (alert, confirm, fenêtres de message) par des
// notifications empilées en haut de l'écran.
//
// Utilisation :
//   notifier("Profil enregistré", { type: 'succes' });
//   notifier("Connexion perdue", { type: 'erreur', titre: "Oups", duree: 0 });   // duree 0 = reste affichée
//   notifier("Mise à jour prête", { actions: [{ libelle: "Redémarrer", principal: true, action: () => ... }] });
//   if (await confirmer("Supprimer ce jeu ?", { confirmer: "Supprimer", danger: true })) { ... }
//   icone('trophy')  ->  <span class="ico" ...></span>  (fichiers dans le dossier des icônes)
//
// Le dossier des icônes est indiqué sur la balise : <script src="..." data-icones="assets/icons/"></script>
(function () {
    const script = document.currentScript;
    const DOSSIER_ICONES = (script && script.dataset.icones) || 'assets/icons/';

    const TYPES = {
        info:   { icone: 'info',           classe: 'notif-info' },
        succes: { icone: 'circle-check',   classe: 'notif-succes' },
        erreur: { icone: 'triangle-alert', classe: 'notif-erreur' },
        trophee:{ icone: 'trophy',         classe: 'notif-trophee' }
    };

    // Icône colorée par CSS (prend la couleur du texte). nom = fichier sans ".svg"
    window.icone = function (nom, classe = '') {
        const url = DOSSIER_ICONES + encodeURIComponent(nom) + '.svg';
        return `<span class="ico ${classe}" style="-webkit-mask-image: url('${url}'); mask-image: url('${url}')" aria-hidden="true"></span>`;
    };

    function conteneur() {
        let c = document.getElementById('notif-conteneur');
        if (!c) {
            c = document.createElement('div');
            c.id = 'notif-conteneur';
            c.setAttribute('role', 'status');
            c.setAttribute('aria-live', 'polite');
            document.body.appendChild(c);
        }
        return c;
    }

    window.notifier = function (message, options = {}) {
        const type = TYPES[options.type] || TYPES.info;
        const actions = options.actions || [];
        // Par défaut : 4 s, un peu plus pour les longs messages ; les notifications à boutons restent affichées
        const duree = options.duree ?? (actions.length ? 0 : Math.min(8000, 3500 + String(message).length * 30));

        const el = document.createElement('div');
        el.className = 'notif ' + type.classe;
        el.innerHTML = `
            <div class="notif-icone">${window.icone(options.icone || type.icone)}</div>
            <div class="notif-corps">
                <div class="notif-titre"></div>
                <div class="notif-texte"></div>
                <div class="notif-actions"></div>
            </div>
            <button class="notif-fermer" aria-label="Fermer">${window.icone('x')}</button>`;

        // Texte inséré avec textContent : aucun HTML interprété
        const titre = el.querySelector('.notif-titre');
        if (options.titre) titre.textContent = options.titre; else titre.remove();
        el.querySelector('.notif-texte').textContent = message;

        let fermee = false;
        const fermer = () => {
            if (fermee) return;
            fermee = true;
            el.classList.add('notif-sortie');
            setTimeout(() => el.remove(), 250);
            if (options.onFermer) options.onFermer();
        };

        const zoneActions = el.querySelector('.notif-actions');
        if (!actions.length) zoneActions.remove();
        actions.forEach(a => {
            const b = document.createElement('button');
            b.className = 'notif-bouton' + (a.principal ? ' notif-bouton-principal' : '') + (a.danger ? ' notif-bouton-danger' : '');
            b.textContent = a.libelle;
            // L'action passe avant la fermeture (confirmer() lit sa réponse à la fermeture)
            b.addEventListener('click', () => { if (a.action) a.action(); fermer(); });
            zoneActions.appendChild(b);
        });

        el.querySelector('.notif-fermer').addEventListener('click', fermer);
        conteneur().appendChild(el);
        if (duree > 0) setTimeout(fermer, duree);
        return { fermer };
    };

    // Remplace confirm() : renvoie une promesse (true = confirmé)
    window.confirmer = function (message, options = {}) {
        return new Promise(resolve => {
            let reponse = false;
            window.notifier(message, {
                type: options.type || 'info',
                titre: options.titre,
                icone: options.icone,
                duree: 0,
                onFermer: () => resolve(reponse),
                actions: [
                    { libelle: options.annuler || 'Annuler' },
                    { libelle: options.confirmer || 'Confirmer', principal: true, danger: !!options.danger, action: () => { reponse = true; } }
                ]
            });
        });
    };

    // Compatibilité avec l'ancien code
    window.afficherAlerte = (message) => window.notifier(message);
})();
