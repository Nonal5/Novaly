// =====================================================================
// CHARGEMENT DES BOUTONS
// Quand un clic sur un bouton lance une action asynchrone (fonction
// « async » exposée sur window : achat, sauvegarde, connexion…), le bouton
// passe en état de chargement (roue + bouton bloqué) jusqu'à la fin de
// l'action. Aucun code à ajouter dans les pages : ça marche avec les
// onclick="maFonction()" existants.
// Une action très rapide (< 150 ms) n'affiche rien, pour éviter un clignotement.
// Pour exclure un bouton : attribut data-sans-chargement.
// =====================================================================
(function () {
    const DELAI_AFFICHAGE = 150;
    let boutonClique = null;          // bouton cliqué pendant le tour en cours
    const enveloppees = new WeakSet();

    function marquer(bouton, actif) {
        if (actif) {
            bouton.style.setProperty('--couleur-roue', getComputedStyle(bouton).color);
            bouton.classList.add('is-loading');
            bouton.setAttribute('aria-busy', 'true');
        } else {
            bouton.classList.remove('is-loading');
            bouton.removeAttribute('aria-busy');
        }
    }

    // Remplace chaque fonction async de window par une version qui gère le bouton.
    function envelopper() {
        for (const nom of Object.keys(window)) {
            let f;
            try { f = window[nom]; } catch (e) { continue; }
            if (typeof f !== 'function' || enveloppees.has(f)) continue;
            if (!f.constructor || f.constructor.name !== 'AsyncFunction') continue;
            const version = async function (...args) {
                const bouton = boutonClique;
                boutonClique = null;  // les sous-appels ne reprennent pas le bouton
                if (!bouton) return f.apply(this, args);
                const minuteur = setTimeout(() => marquer(bouton, true), DELAI_AFFICHAGE);
                try { return await f.apply(this, args); }
                finally { clearTimeout(minuteur); marquer(bouton, false); }
            };
            enveloppees.add(version);
            try { window[nom] = version; } catch (e) { /* propriété non modifiable */ }
        }
    }

    // Phase de capture : passe AVANT le onclick du bouton.
    document.addEventListener('click', (e) => {
        const bouton = e.target.closest && e.target.closest('button, .btn');
        if (!bouton || bouton.hasAttribute('data-sans-chargement')) return;
        if (bouton.classList.contains('is-loading')) {
            // Action déjà en cours : on ignore le double-clic.
            e.preventDefault();
            e.stopImmediatePropagation();
            return;
        }
        envelopper();
        boutonClique = bouton;
        setTimeout(() => { if (boutonClique === bouton) boutonClique = null; }, 0);
    }, true);

    // Petite aide pour le code qui veut le faire à la main : await avecChargement(bouton, promesse)
    window.avecChargement = async function (bouton, promesse) {
        marquer(bouton, true);
        try { return await promesse; } finally { marquer(bouton, false); }
    };
})();
