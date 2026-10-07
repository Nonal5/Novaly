// =====================================================================
// BOUTIQUE : promotions, liste de souhaits, panier, cadeaux, avis, portefeuille.
// Fichier IDENTIQUE dans le launcher (novaly-launcher/src/js/boutique.js) et sur le
// site (assets/js/boutique.js) : modifier l'un, recopier dans l'autre.
// Chargé APRÈS index.app.js, qui initialise Firebase (on réutilise la même app).
// Le serveur refait tous les contrôles (prix, possession, solde, contrôle parental) :
// ce fichier ne fait qu'afficher et appeler les Cloud Functions.
// =====================================================================
import { getApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import { getFirestore, doc, getDoc, getDocs, setDoc, deleteDoc, collection, query, where, orderBy, limit,
         onSnapshot, updateDoc, arrayUnion, arrayRemove, serverTimestamp, collectionGroup } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

const app = getApp();
const auth = getAuth(app);
const db = getFirestore(app);

const FN = "https://us-central1-novaly-a80f7.cloudfunctions.net/";
const DANS_LAUNCHER = !!window.__TAURI__;

// ---------- Outils ----------
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const jsArg = (v) => esc(JSON.stringify(String(v ?? '')));
const euros = (n) => Number(n).toFixed(2).replace('.', ',') + ' €';
const note = (texte, type) => (window.notifier ? window.notifier(texte, type ? { type } : {}) : alert(texte));

function enMillis(v) {
    if (v == null || v === '') return null;
    if (typeof v.toMillis === 'function') return v.toMillis();
    const n = typeof v === 'number' ? v : Date.parse(v);
    return Number.isFinite(n) ? n : null;
}

// Même règle que prixJeu() côté serveur (functions/index.js) : promoPrix / promoDebut / promoFin.
window.prixJeu = function(jeu) {
    const base = Number(jeu.prix);
    if (!Number.isFinite(base) || base < 0) return null;
    const promo = Number(jeu.promoPrix), debut = enMillis(jeu.promoDebut), fin = enMillis(jeu.promoFin);
    const t = Date.now();
    const enPromo = jeu.promoPrix != null && Number.isFinite(promo) && promo >= 0 && promo < base
        && (debut === null || t >= debut) && (fin === null || t < fin);
    return { prix: enPromo ? promo : base, base, promo: enPromo,
             pct: enPromo && base > 0 ? Math.round((1 - promo / base) * 100) : 0, fin: enPromo ? fin : null };
};

// Libellé du bouton d'achat (remplace l'ancien libelleBoutonAchat).
window.libelleAchat = function(jeu) {
    const p = window.prixJeu(jeu);
    if (!p) return "Indisponible";
    if (p.prix === 0) return "Obtenir (Gratuit)";
    return p.promo ? `Acheter ${euros(p.prix)} <s style="opacity:.55; font-weight:400;">${euros(p.base)}</s> <span class="promo-badge">-${p.pct}%</span>`
                   : `Acheter (${euros(p.prix)})`;
};

// Petit encart prix pour les cartes du magasin.
window.prixCarte = function(jeu) {
    const p = window.prixJeu(jeu);
    if (!p) return '';
    if (p.prix === 0) return `<div class="carte-prix">Gratuit</div>`;
    return p.promo
        ? `<div class="carte-prix"><span class="promo-badge">-${p.pct}%</span> <s>${euros(p.base)}</s> <strong>${euros(p.prix)}</strong></div>`
        : `<div class="carte-prix">${euros(p.prix)}</div>`;
};

function finPromo(p) {
    if (!p.fin) return '';
    const h = Math.max(0, Math.round((p.fin - Date.now()) / 3600e3));
    return h < 48 ? `Plus que ${h} h` : `Jusqu'au ${new Date(p.fin).toLocaleDateString('fr-FR')}`;
}

async function appeler(fn, corps) {
    const u = auth.currentUser;
    if (!u || u.isAnonymous) throw new Error("Connecte-toi d'abord.");
    const r = await fetch(FN + fn, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${await u.getIdToken()}` },
        body: JSON.stringify(corps)
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok && !d.url && !d.livree) throw new Error(d.error || "Erreur du serveur.");
    return d;
}

async function ouvrirUrl(url) {
    if (DANS_LAUNCHER) await window.__TAURI__.core.invoke("plugin:opener|open_url", { url });
    else window.location.href = url;
}

const cacheJeux = new Map();
async function jeu(id) {
    if (!cacheJeux.has(id)) {
        const s = await getDoc(doc(db, "games", id));
        cacheJeux.set(id, s.exists() ? { id, ...s.data() } : null);
    }
    return cacheJeux.get(id);
}

// ---------- État du joueur (souhaits, jeux possédés, solde, amis) ----------
let moi = null;
let souhaits = [];
let possedes = [];
let solde = 0;            // centimes
let desabonnements = [];

onAuthStateChanged(auth, (u) => {
    desabonnements.forEach(f => f()); desabonnements = [];
    moi = u && !u.isAnonymous ? u : null;
    souhaits = []; possedes = []; solde = 0;
    majCompteurPanier();
    if (!moi) return;

    desabonnements.push(onSnapshot(doc(db, "users", moi.uid), (s) => {
        const d = s.data() || {};
        souhaits = d.souhaits || [];
        possedes = d.jeuxPossedes || [];
        // Un jeu acheté sort du panier et de la liste de souhaits.
        const panier = lirePanier().filter(id => !possedes.includes(id));
        ecrirePanier(panier);
        if (window.currentViewId === 'wishlist') window.afficherSouhaits();
        if (window.currentViewId === 'cart') window.afficherPanier();
        alerterPromos();
    }, () => {}));

    // Comptes associés (écrits par les fonctions retourSteam / retourDiscord).
    desabonnements.push(onSnapshot(doc(db, "comptes_lies", moi.uid), (s) => {
        comptesLies = s.data() || {};
        afficherLiens();
    }, () => {}));

    // Contrôle parental (écrit uniquement par la fonction controleParental).
    desabonnements.push(onSnapshot(doc(db, "parental", moi.uid), (s) => {
        window.parental = s.exists() && s.data().actif ? s.data() : { actif: false };
        afficherParental();
    }, () => {}));

    desabonnements.push(onSnapshot(doc(db, "portefeuilles", moi.uid), (s) => {
        solde = (s.data() || {}).solde || 0;
        afficherSolde();
        if (window.currentViewId === 'cart') window.afficherPanier();
    }, () => {}));

    // Cadeaux reçus : notification une seule fois, puis marqués « vus ».
    desabonnements.push(onSnapshot(query(collection(db, "users", moi.uid, "cadeaux"), where("vu", "==", false)), (q) => {
        q.docs.forEach(c => {
            const d = c.data();
            const titres = (d.titres || []).join(', ') || 'un jeu';
            note(`🎁 ${d.dePseudo} t'a offert ${titres} !${d.message ? ` « ${d.message} »` : ''} Il est dans ta bibliothèque.`, 'succes');
            updateDoc(c.ref, { vu: true }).catch(() => {});
        });
    }, () => {}));
});

// ---------- Liste de souhaits ----------
window.estSouhaite = (id) => souhaits.includes(id);

window.toggleSouhait = async function(gameId) {
    if (!moi) return note("Connecte-toi pour utiliser la liste de souhaits.");
    const ajout = !souhaits.includes(gameId);
    try {
        await updateDoc(doc(db, "users", moi.uid), { souhaits: ajout ? arrayUnion(gameId) : arrayRemove(gameId) });
        note(ajout ? "Ajouté à ta liste de souhaits. Tu seras prévenu des promos." : "Retiré de ta liste de souhaits.", 'succes');
        const b = document.getElementById('btn-souhait');
        if (b) b.outerHTML = boutonSouhait(gameId, ajout);
    } catch (e) { note("Impossible de modifier la liste de souhaits.", 'erreur'); }
};

function boutonSouhait(gameId, actif) {
    return `<button class="btn btn-boutique" id="btn-souhait" onclick="toggleSouhait(${jsArg(gameId)})" title="Liste de souhaits">${actif ? '♥ Souhaité' : '♡ Souhait'}</button>`;
}

window.afficherSouhaits = async function() {
    const zone = document.getElementById('wishlist-content');
    if (!zone) return;
    if (!moi) { zone.innerHTML = `<p class="boutique-vide">Connecte-toi pour voir ta liste de souhaits.</p>`; return; }
    const ids = souhaits.filter(id => !possedes.includes(id));
    if (!ids.length) { zone.innerHTML = `<p class="boutique-vide">Ta liste de souhaits est vide. Ajoute des jeux avec « ♡ Souhait » sur leur page : tu seras prévenu dès qu'ils sont en promo.</p>`; return; }
    const jeux = (await Promise.all(ids.map(jeu))).filter(Boolean);
    zone.innerHTML = jeux.map(g => `
        <div class="ligne-boutique">
            <div class="ligne-cover" style="background-image:url('${esc(g.coverUrl || '')}')" onclick="afficherPageJeu(${jsArg(g.id)})"></div>
            <div class="ligne-info" onclick="afficherPageJeu(${jsArg(g.id)})"><strong>${esc(g.titre)}</strong>${window.prixCarte(g)}</div>
            <button class="btn btn-boutique" onclick="ajouterAuPanier(${jsArg(g.id)})">🛒</button>
            <button class="btn btn-boutique" onclick="toggleSouhait(${jsArg(g.id)}).then(afficherSouhaits)">Retirer</button>
        </div>`).join('');
};

// Prévient une fois par promo pour les jeux de la liste de souhaits.
async function alerterPromos() {
    for (const id of souhaits) {
        if (possedes.includes(id)) continue;
        const g = await jeu(id); if (!g) continue;
        const p = window.prixJeu(g); if (!p || !p.promo) continue;
        const cle = `promo_vue_${id}_${p.fin || 'sans-fin'}_${p.prix}`;
        try { if (localStorage.getItem(cle)) continue; localStorage.setItem(cle, '1'); } catch (e) { continue; }
        note(`🔥 ${g.titre} est en promo : ${euros(p.prix)} au lieu de ${euros(p.base)} (-${p.pct}%).`, 'succes');
    }
}

// ---------- Panier (gardé sur cet appareil, par compte) ----------
const clePanier = () => 'panier_' + (moi ? moi.uid : 'invite');
function lirePanier() { try { return JSON.parse(localStorage.getItem(clePanier()) || '[]'); } catch (e) { return []; } }
function ecrirePanier(p) { try { localStorage.setItem(clePanier(), JSON.stringify(p)); } catch (e) {} majCompteurPanier(); }
function majCompteurPanier() {
    const n = lirePanier().length;
    document.querySelectorAll('.compteur-panier').forEach(el => { el.innerText = n; el.style.display = n ? 'inline-block' : 'none'; });
}

window.ajouterAuPanier = async function(gameId) {
    if (!moi) return note("Connecte-toi pour utiliser le panier.");
    if (possedes.includes(gameId)) return note("Tu possèdes déjà ce jeu.");
    const p = lirePanier();
    if (!p.includes(gameId)) { p.push(gameId); ecrirePanier(p); }
    note("Ajouté au panier.", 'succes');
};
window.retirerDuPanier = function(gameId) { ecrirePanier(lirePanier().filter(id => id !== gameId)); window.afficherPanier(); };

window.afficherPanier = async function() {
    const zone = document.getElementById('cart-content');
    if (!zone) return;
    const ids = lirePanier();
    if (!ids.length) {
        zone.innerHTML = `<div class="generic-view-content"><h2>Votre panier est vide</h2><p>Découvrez nos nouveautés dans le magasin.</p>
            <button class="btn btn-primary" style="margin-top: 20px;" onclick="navigateTo('#magasin', 'store')">Aller au magasin</button></div>`;
        return;
    }
    const jeux = (await Promise.all(ids.map(jeu))).filter(Boolean);
    let total = 0;
    const lignes = jeux.map(g => {
        const p = window.prixJeu(g) || { prix: 0 };
        total += p.prix;
        return `<div class="ligne-boutique">
            <div class="ligne-cover" style="background-image:url('${esc(g.coverUrl || '')}')"></div>
            <div class="ligne-info"><strong>${esc(g.titre)}</strong>${window.prixCarte(g)}</div>
            <button class="btn btn-boutique" onclick="retirerDuPanier(${jsArg(g.id)})">Retirer</button></div>`;
    }).join('');
    const assez = solde >= Math.round(total * 100);
    zone.innerHTML = `<h2 class="titre-section">Mon panier</h2>${lignes}
        <div class="panier-total"><span>Total</span><strong>${euros(total)}</strong></div>
        <div class="panier-actions">
            <button class="btn btn-primary" onclick="payerPanier('carte')">Payer par carte</button>
            <button class="btn btn-accent" ${assez && total > 0 ? '' : 'disabled'} onclick="payerPanier('solde')">Payer avec mon solde (${euros(solde / 100)})</button>
        </div>
        <p class="boutique-note">Le prix final est recalculé au paiement (promotions en cours).</p>`;
};

window.payerPanier = async function(moyen) {
    const ids = lirePanier();
    if (!ids.length) return;
    try {
        const d = await appeler('creerCommande', { gameIds: ids, payerAvec: moyen, retour: DANS_LAUNCHER ? undefined : 'site' });
        if (d.url) { await ouvrirUrl(d.url); note("Termine le paiement dans la page Stripe.", 'succes'); }
        else { ecrirePanier([]); note("Achat terminé : les jeux sont dans ta bibliothèque.", 'succes'); window.afficherPanier(); }
    } catch (e) { note(e.message, 'erreur'); }
};

// ---------- Achat d'un jeu depuis sa page : solde du portefeuille ou carte ----------
// Appelé par acheterJeu (index.app.js) pour les jeux payants.
window.choisirPaiement = async function(gameId) {
    if (!moi) return note("Connecte-toi pour acheter ce jeu.", 'erreur');
    const g = await jeu(gameId);
    const p = g && window.prixJeu(g);
    if (!p) return note("Ce jeu n'est pas en vente.", 'erreur');
    const manque = Math.round(p.prix * 100) - solde;
    fenetre(`<h3 class="fenetre-titre">Acheter ${esc(g.titre)}</h3>
        <div class="paiement-recap">
            <div class="ligne-cover" style="background-image:url('${esc(g.coverUrl || '')}')"></div>
            <div class="ligne-info"><strong>${esc(g.titre)}</strong>${window.prixCarte(g)}</div>
        </div>
        <div class="paiement-choix">
            <button class="btn btn-accent" ${manque > 0 ? 'disabled' : ''} onclick="acheterAvec(${jsArg(gameId)}, 'solde')">
                Payer avec mon solde <span class="btn-detail">${euros(solde / 100)}</span></button>
            <button class="btn btn-primary" onclick="acheterAvec(${jsArg(gameId)}, 'carte')">Payer par carte</button>
        </div>
        ${manque > 0 ? `<p class="boutique-note">Solde insuffisant : il manque ${euros(manque / 100)}.
            <button class="btn-lien" onclick="allerAuPortefeuille()">Recharger mon solde</button></p>` : ''}
        <p class="boutique-note">Le prix final est recalculé au paiement (promotions en cours).</p>`);
};

window.acheterAvec = async function(gameId, moyen) {
    try {
        const d = await appeler('creerCommande', { gameIds: [gameId], payerAvec: moyen, retour: DANS_LAUNCHER ? undefined : 'site' });
        fermerFenetre();
        if (d.url) { await ouvrirUrl(d.url); note("Termine le paiement dans la page Stripe.", 'succes'); }
        else {
            ecrirePanier(lirePanier().filter(id => id !== gameId));
            note("Achat terminé : le jeu est dans ta bibliothèque.", 'succes');
        }
    } catch (e) { note(e.message, 'erreur'); }
};

window.allerAuPortefeuille = function() {
    fermerFenetre();
    if (window.switchProfileTab) window.switchProfileTab('payment', document.getElementById('tab-btn-payment'));
    if (window.navigateTo) window.navigateTo('#profile', 'profile');
};

// ---------- Offrir un jeu à un ami ----------
window.offrirJeu = async function(gameId) {
    if (!moi) return note("Connecte-toi pour offrir un jeu.");
    const amis = (await getDocs(collection(db, "users", moi.uid, "friends"))).docs.map(d => ({ uid: d.id, pseudo: d.data().pseudo || 'Ami' }));
    const g = await jeu(gameId);
    const p = g && window.prixJeu(g);
    fenetre(`<h3 class="fenetre-titre">🎁 Offrir ${esc(g ? g.titre : 'ce jeu')}</h3>
        ${amis.length ? `
        <label class="boutique-label">À qui ?</label>
        <select id="cadeau-ami" class="boutique-champ">${amis.map(a => `<option value="${esc(a.uid)}">${esc(a.pseudo)}</option>`).join('')}</select>
        <label class="boutique-label">Petit mot (facultatif)</label>
        <input id="cadeau-message" class="boutique-champ" maxlength="300" placeholder="Joyeux anniversaire !">
        <p class="boutique-note">${p ? `Prix : ${euros(p.prix)}` : ''} — le jeu arrive directement dans sa bibliothèque.</p>
        <div class="panier-actions">
            <button class="btn btn-primary" onclick="envoyerCadeau(${jsArg(gameId)}, 'carte')">Payer par carte</button>
            <button class="btn btn-accent" ${p && solde >= Math.round(p.prix * 100) ? '' : 'disabled'} onclick="envoyerCadeau(${jsArg(gameId)}, 'solde')">Avec mon solde (${euros(solde / 100)})</button>
        </div>` : `<p>Ajoute d'abord des amis pour pouvoir leur offrir des jeux.</p>`}`);
};

window.envoyerCadeau = async function(gameId, moyen) {
    const pourUid = document.getElementById('cadeau-ami').value;
    const message = document.getElementById('cadeau-message').value.trim();
    try {
        const d = await appeler('creerCommande', { gameIds: [gameId], pourUid, message, payerAvec: moyen, retour: DANS_LAUNCHER ? undefined : 'site' });
        fermerFenetre();
        if (d.url) { await ouvrirUrl(d.url); note("Termine le paiement : ton ami recevra le jeu juste après.", 'succes'); }
        else note("Cadeau envoyé ! 🎁", 'succes');
    } catch (e) { note(e.message, 'erreur'); }
};

// ---------- Avis & notes ----------
const etoiles = (n) => '★★★★★'.slice(0, Math.round(n)) + '☆☆☆☆☆'.slice(0, 5 - Math.round(n));

async function chargerAvis(gameId) {
    const zone = document.getElementById('detail-avis');
    if (!zone) return;
    const snap = await getDocs(collection(db, "games", gameId, "avis")).catch(() => null);
    const avis = snap ? snap.docs.map(d => ({ uid: d.id, ...d.data() })) : [];
    avis.sort((a, b) => (enMillis(b.date) || 0) - (enMillis(a.date) || 0));
    const moyenne = avis.length ? avis.reduce((s, a) => s + (a.note || 0), 0) / avis.length : 0;
    const monAvis = moi && avis.find(a => a.uid === moi.uid);
    const peutNoter = moi && possedes.includes(gameId);

    zone.innerHTML = `
        <h2 class="avis-titre">Avis des joueurs
            ${avis.length ? `<span class="avis-moyenne">${etoiles(moyenne)} ${moyenne.toFixed(1).replace('.', ',')} / 5 · ${avis.length} avis</span>` : ''}</h2>
        ${peutNoter ? `
        <div class="avis-form">
            <div id="avis-etoiles" data-note="${monAvis ? monAvis.note : 0}">
                ${[1, 2, 3, 4, 5].map(i => `<span class="avis-etoile${monAvis && i <= monAvis.note ? ' on' : ''}" onclick="choisirNote(${i})">★</span>`).join('')}
            </div>
            <textarea id="avis-texte" maxlength="1000" placeholder="Qu'as-tu pensé du jeu ? (facultatif)">${esc(monAvis ? monAvis.texte : '')}</textarea>
            <div style="display:flex; gap:8px;">
                <button class="btn btn-primary" onclick="publierAvis(${jsArg(gameId)})">${monAvis ? 'Modifier mon avis' : 'Publier mon avis'}</button>
                ${monAvis ? `<button class="btn btn-boutique" onclick="supprimerAvis(${jsArg(gameId)})">Supprimer</button>` : ''}
            </div>
        </div>` : (moi ? `<p class="boutique-note">Possède le jeu pour pouvoir le noter.</p>` : '')}
        ${avis.length ? avis.map(a => `
            <div class="avis-item">
                <div><strong>${esc(a.pseudo || 'Joueur')}</strong> <span class="avis-etoiles-lecture">${etoiles(a.note || 0)}</span>
                <span class="boutique-note">${enMillis(a.date) ? new Date(enMillis(a.date)).toLocaleDateString('fr-FR') : ''}</span></div>
                ${a.texte ? `<p>${esc(a.texte)}</p>` : ''}
            </div>`).join('') : `<p class="boutique-note">Aucun avis pour l'instant.</p>`}`;
}

window.choisirNote = function(n) {
    const z = document.getElementById('avis-etoiles');
    z.dataset.note = n;
    z.querySelectorAll('.avis-etoile').forEach((e, i) => e.classList.toggle('on', i < n));
};

window.publierAvis = async function(gameId) {
    const n = Number(document.getElementById('avis-etoiles').dataset.note);
    if (!(n >= 1 && n <= 5)) return note("Choisis une note de 1 à 5 étoiles.", 'erreur');
    try {
        await setDoc(doc(db, "games", gameId, "avis", moi.uid), {
            note: n, texte: document.getElementById('avis-texte').value.trim().slice(0, 1000),
            pseudo: (moi.displayName || 'Joueur').slice(0, 40), date: serverTimestamp()
        });
        note("Merci pour ton avis !", 'succes');
        chargerAvis(gameId);
    } catch (e) { note("Impossible de publier l'avis.", 'erreur'); }
};

window.supprimerAvis = async function(gameId) {
    try { await deleteDoc(doc(db, "games", gameId, "avis", moi.uid)); chargerAvis(gameId); }
    catch (e) { note("Suppression impossible.", 'erreur'); }
};

// ---------- Comptes associés (Steam, Discord) ----------
let comptesLies = {};

function afficherLiens() {
    for (const svc of ['steam', 'discord']) {
        const nom = document.getElementById(`lien-${svc}-nom`), btn = document.getElementById(`lien-${svc}-btn`);
        if (!nom || !btn) continue;
        const c = comptesLies[svc];
        nom.innerText = c ? `Lié : ${c.nom || c.id}` : 'Non lié';
        nom.classList.toggle('texte-succes', !!c);
        btn.innerText = c ? 'Délier' : 'Lier';
        btn.classList.toggle('btn-danger', !!c);
        btn.classList.toggle('btn-accent', !c);
    }
}

window.basculerLien = async function(service) {
    try {
        if (comptesLies[service]) {
            await appeler('lierCompte', { action: 'delier', service });
            note("Compte délié.", 'succes');
            return;
        }
        const d = await appeler('lierCompte', { action: 'debut', service });
        await ouvrirUrl(d.url);
        note(`Termine la connexion ${service === 'steam' ? 'Steam' : 'Discord'} dans ton navigateur.`, 'succes');
    } catch (e) { note(e.message, 'erreur'); }
};

// ---------- Contrôle parental ----------
window.parental = { actif: false };

// Raison du blocage parental pour ce jeu (même règle que le serveur), ou null.
window.refusParental = function(jeu) {
    const p = window.parental;
    if (!p || !p.actif) return null;
    if (p.achatsBloques) return "Les achats sont bloqués par le contrôle parental.";
    const age = Number(jeu.age);
    if (p.ageMax && Number.isFinite(age) && age > p.ageMax) return `Ce jeu est classé PEGI ${age} : bloqué par le contrôle parental.`;
    return null;
};

function afficherParental() {
    const p = window.parental, titre = document.getElementById('parental-titre');
    if (!titre) return;
    titre.innerText = p.actif ? "Le Contrôle Parental est activé 🔒" : "Le Contrôle Parental est désactivé";
    document.getElementById('parental-achats').checked = !!p.achatsBloques;
    document.getElementById('parental-chat').checked = !!p.chatBloque;
    document.getElementById('parental-age').value = String(p.ageMax || 0);
    document.getElementById('parental-pin').placeholder = p.actif ? "Code PIN actuel" : "Choisissez un code PIN (4 à 6 chiffres)";
    document.getElementById('parental-nouveau-pin').style.display = p.actif ? 'block' : 'none';
    document.getElementById('parental-btn').innerText = p.actif ? "Enregistrer les modifications" : "Activer le contrôle parental";
    document.getElementById('parental-off').style.display = p.actif ? 'block' : 'none';
}

window.enregistrerParental = async function() {
    const pin = document.getElementById('parental-pin').value.trim();
    try {
        await appeler('controleParental', {
            action: window.parental.actif ? 'modifier' : 'activer', pin,
            nouveauPin: document.getElementById('parental-nouveau-pin').value.trim() || undefined,
            achatsBloques: document.getElementById('parental-achats').checked,
            chatBloque: document.getElementById('parental-chat').checked,
            ageMax: Number(document.getElementById('parental-age').value)
        });
        document.getElementById('parental-pin').value = '';
        document.getElementById('parental-nouveau-pin').value = '';
        note("Contrôle parental enregistré.", 'succes');
    } catch (e) { note(e.message, 'erreur'); }
};

window.desactiverParental = async function() {
    const pin = document.getElementById('parental-pin').value.trim();
    if (!pin) return note("Saisissez le code PIN pour désactiver.", 'erreur');
    try {
        await appeler('controleParental', { action: 'desactiver', pin });
        document.getElementById('parental-pin').value = '';
        note("Contrôle parental désactivé.", 'succes');
    } catch (e) { note(e.message, 'erreur'); }
};

// ---------- Page d'un jeu : boutons boutique + avis ----------
// Appelé par afficherPageJeu (index.app.js) une fois le jeu chargé.
window.boutiqueSurPageJeu = function(gameId, gameData, possede) {
    const zone = document.getElementById('detail-boutique');
    if (zone) {
        const p = window.prixJeu(gameData);
        const payant = p && p.prix > 0;
        const refus = window.refusParental(gameData);
        if (refus && !possede) {
            // Le serveur refuserait l'achat : on le dit tout de suite.
            const z = document.getElementById('detail-action-zone');
            if (z) z.innerHTML = `<button class="btn btn-secondary btn-lg btn-bloc" disabled>🔒 ${esc(refus)}</button>`;
        }
        zone.innerHTML = `
            ${p && p.promo ? `<div class="promo-bandeau"><span class="promo-badge">-${p.pct}%</span> Promotion ${esc(finPromo(p))}</div>` : ''}
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
                ${!possede ? boutonSouhait(gameId, window.estSouhaite(gameId)) : ''}
                ${!possede && payant ? `<button class="btn btn-boutique" onclick="ajouterAuPanier(${jsArg(gameId)})">🛒 Panier</button>` : ''}
                ${payant ? `<button class="btn btn-boutique" onclick="offrirJeu(${jsArg(gameId)})">🎁 Offrir</button>` : ''}
            </div>`;
    }
    chargerAvis(gameId);
};

// ---------- Portefeuille ----------
function afficherSolde() {
    const el = document.getElementById('wallet-balance');
    if (el) el.innerText = euros(solde / 100);
}

window.rechargerPortefeuille = async function(centimes) {
    try {
        const d = await appeler('rechargerPortefeuille', { centimes });
        if (d.url) { await ouvrirUrl(d.url); note("Termine le paiement : ton solde sera crédité juste après.", 'succes'); }
    } catch (e) { note(e.message, 'erreur'); }
};

// ---------- Fenêtre simple (choix d'un ami, etc.) ----------
function fenetre(html) {
    fermerFenetre();
    const f = document.createElement('div');
    f.id = 'fenetre-boutique';
    f.innerHTML = `<div class="fenetre-fond" onclick="fermerFenetre()"></div><div class="fenetre-boite">${html}
        <button class="fenetre-fermer" onclick="fermerFenetre()" aria-label="Fermer">×</button></div>`;
    document.body.appendChild(f);
}
function fermerFenetre() { document.getElementById('fenetre-boutique')?.remove(); }
window.fermerFenetre = fermerFenetre;

// ---------- Communauté : derniers avis publiés ----------
window.afficherCommunaute = async function() {
    const zone = document.getElementById('communaute-avis');
    if (!zone) return;
    zone.innerHTML = `<p class="boutique-note">Chargement des avis…</p>`;
    try {
        const q = query(collectionGroup(db, "avis"), orderBy("date", "desc"), limit(15));
        const snap = await getDocs(q);
        const items = await Promise.all(snap.docs.map(async d => ({ ...d.data(), jeu: await jeu(d.ref.parent.parent.id) })));
        zone.innerHTML = items.length ? items.filter(a => a.jeu).map(a => `
            <div class="avis-item" style="cursor:pointer;" onclick="afficherPageJeu(${jsArg(a.jeu.id)})">
                <div><strong>${esc(a.pseudo || 'Joueur')}</strong> sur <strong>${esc(a.jeu.titre)}</strong>
                <span class="avis-etoiles-lecture">${etoiles(a.note || 0)}</span></div>
                ${a.texte ? `<p>${esc(a.texte)}</p>` : ''}
            </div>`).join('') : `<p class="boutique-note">Aucun avis publié pour l'instant.</p>`;
    } catch (e) { zone.innerHTML = `<p class="boutique-note">Avis indisponibles pour le moment.</p>`; }
};

majCompteurPanier();

// La vue a pu être ouverte avant le chargement de ce module (lien direct #panier, etc.).
({ wishlist: window.afficherSouhaits, cart: window.afficherPanier, community: window.afficherCommunaute })[window.currentViewId]?.();
