        import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
        import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, signInWithCredential, updateProfile, signOut } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
        import { getFirestore, collection, query, where, getDocs, setDoc, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";        
        const firebaseConfig = {
            apiKey: "AIzaSyBfM8rodwJivN1vW8Vt9WJRvELIPxozvBg",
            authDomain: "novaly-a80f7.firebaseapp.com",
            projectId: "novaly-a80f7",
            storageBucket: "novaly-a80f7.firebasestorage.app",
            messagingSenderId: "58102958990",
            appId: "1:58102958990:web:6bdc2d3f049015fd0672df",
            measurementId: "G-HE39HWQB70"
        };

        const app = initializeApp(firebaseConfig);
        const auth = getAuth(app);
        const provider = new GoogleAuthProvider();
        const db = getFirestore(app);

        const ENDPOINT_ENVOYER_CODE_2FA = "https://us-central1-novaly-a80f7.cloudfunctions.net/envoyerCode2FA";
        const ENDPOINT_VERIFIER_CODE_2FA = "https://us-central1-novaly-a80f7.cloudfunctions.net/verifierCode2FA";

        // État de l'A2F pour la session courante : 'aucune' | 'validee' | 'requise'.
        // La session est identifiée par auth_time (date de connexion signée par
        // Firebase) ; Firestore et les Cloud Functions appliquent le même verrou.
        // Méthodes A2F actives du compte (e-mail, application), lues avec l'état.
        let methodesA2F = { email: true, app: false };
        let methode2fa = 'email';

        async function etatA2F(user) {
            const actif = await getDoc(doc(db, "a2f_actif", user.uid));
            if (!actif.exists()) return 'aucune';
            const d = actif.data();
            methodesA2F = { email: d.email === true || d.methode === 'email', app: d.app === true };
            const { claims } = await user.getIdTokenResult();
            const ok = await getDoc(doc(db, "a2f_sessions", user.uid, "ok", String(claims.auth_time)));
            return ok.exists() ? 'validee' : 'requise';
        }

        async function envoyerCode2FA(user) {
            const idToken = await user.getIdToken();
            const r = await fetch(ENDPOINT_ENVOYER_CODE_2FA, {
                method: "POST",
                headers: { "Authorization": `Bearer ${idToken}` }
            });
            const d = await r.json().catch(() => ({}));
            if (!r.ok && r.status !== 429) throw new Error(d.error || "Envoi impossible.");
            return d;
        }

        // Affiche l'écran du code et envoie un code par e-mail.
        // Écran du code : l'application est proposée en premier (aucun e-mail envoyé).
        async function demanderCode2FA(user) {
            afficher2faSection();
            await choisirMethode2faPour(user, methodesA2F.app ? 'app' : 'email');
        }

        const TEXTES_2FA = {
            email: ["Un code à 6 chiffres vient d'être envoyé à votre adresse e-mail. Saisissez-le pour continuer.", "Code reçu par e-mail", "000000", 6],
            app: ["Ouvrez votre application d'authentification (Google Authenticator, Authy…) et saisissez le code Novaly.", "Code de l'application", "000000", 6],
            secours: ["Saisissez l'un de vos codes de secours. Chaque code ne fonctionne qu'une seule fois.", "Code de secours", "ABCD-EF23", 9]
        };

        async function choisirMethode2faPour(user, m) {
            methode2fa = m;
            const [texte, label, ph, max] = TEXTES_2FA[m];
            document.getElementById('twofa-texte').innerText = texte;
            document.getElementById('twofa-label').innerText = label;
            const champ = document.getElementById('twofa-code');
            champ.value = ''; champ.placeholder = ph; champ.maxLength = max;
            champ.inputMode = m === 'secours' ? 'text' : 'numeric';
            champ.style.letterSpacing = m === 'secours' ? '3px' : '6px';
            const voir = (id, oui) => { document.getElementById(id).style.display = oui ? 'block' : 'none'; };
            voir('twofa-renvoyer', m === 'email');
            voir('twofa-vers-email', m !== 'email' && methodesA2F.email);
            voir('twofa-vers-app', m !== 'app' && methodesA2F.app);
            voir('twofa-vers-secours', m !== 'secours' && methodesA2F.app);
            document.getElementById('twofa-error').style.display = "none";
            champ.focus();
            if (m !== 'email') return;
            try {
                const d = await envoyerCode2FA(user);
                if (d.error) showError('twofa-error', d.error);
            } catch (e) {
                showError('twofa-error', "Impossible d'envoyer le code. Réessayez avec « Renvoyer le code ».");
            }
        }

        window.choisirMethode2fa = function(m) {
            if (auth.currentUser) choisirMethode2faPour(auth.currentUser, m);
        };

        function entrer(user) {
            localStorage.setItem('isLoggedIn', 'true');
            localStorage.setItem('username', user.displayName || "Joueur");
            localStorage.setItem('email', user.email);
            window.location.href = 'index.html';
        }

        // Affiche une seule section du formulaire (les absentes de la page sont ignorées).
        const SECTIONS = ['login-section', 'register-section', 'google-pseudo-section', 'twofa-section', 'google-wait-section'];
        function montrerSection(id) {
            SECTIONS.forEach(s => {
                const el = document.getElementById(s);
                if (el) el.style.display = (s === id) ? 'block' : 'none';
            });
        }
        function afficher2faSection() { montrerSection('twofa-section'); }

        function showError(elementId, message) {
            const errorDiv = document.getElementById(elementId);
            errorDiv.innerText = message;
            errorDiv.style.display = "block";
            errorDiv.animate([{ transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(0)' }], { duration: 300, iterations: 2 });
        }

        function hideErrors() {
            document.getElementById('login-error').style.display = "none";
            document.getElementById('reg-error').style.display = "none";
        }

        window.register = async function() {
            hideErrors();
            const username = document.getElementById('reg-username').value.trim();
            const email = document.getElementById('reg-email').value;
            const password = document.getElementById('reg-password').value;

            if (!username || !email || !password) {
                showError('reg-error', "Veuillez remplir tous les champs.");
                return;
            }

            const btn = document.querySelector('#register-section .btn');
            const originalText = btn.innerText;
            btn.innerText = "Vérification...";

            try {
                // Le compte est créé d'abord : la liste des joueurs n'est lisible qu'une fois connecté
                btn.innerText = "Création...";
                const userCredential = await createUserWithEmailAndPassword(auth, email, password);

                const usersRef = collection(db, "users");
                const q = query(usersRef, where("pseudoLower", "==", username.toLowerCase()));
                const querySnapshot = await getDocs(q);

                if (!querySnapshot.empty) {
                    // Pseudo déjà pris : on annule la création du compte
                    await userCredential.user.delete();
                    showError('reg-error', "Ce pseudo est déjà pris par un autre joueur.");
                    btn.innerText = originalText;
                    return; 
                }

                await updateProfile(userCredential.user, { displayName: username });

                await setDoc(doc(db, "users", userCredential.user.uid), {
                    pseudo: username,
                    pseudoLower: username.toLowerCase()
                });

                localStorage.setItem('isLoggedIn', 'true');
                window.location.href = 'index.html';
            } catch (error) {
                let errorMsg = "Une erreur est survenue.";
                if(error.code === 'auth/email-already-in-use') errorMsg = "Cet e-mail est déjà utilisé.";
                if(error.code === 'auth/weak-password') errorMsg = "Le mot de passe doit faire au moins 6 caractères.";
                showError('reg-error', errorMsg);
                btn.innerText = originalText;
            }
        };

        window.login = async function() {
            hideErrors();
            const email = document.getElementById('login-email').value;
            const password = document.getElementById('login-password').value;

            if (!email || !password) {
                showError('login-error', "Veuillez entrer vos identifiants.");
                return;
            }

            const btn = document.querySelector('#login-section .btn');
            const originalText = btn.innerText;
            btn.innerText = "Connexion...";

            let userCredential;
            try {
                userCredential = await signInWithEmailAndPassword(auth, email, password);
            } catch (error) {
                showError('login-error', "Adresse e-mail ou mot de passe incorrect.");
                btn.innerText = originalText;
                return;
            }

            try {
                // Vérification en deux étapes (e-mail) si activée sur ce compte
                if (await etatA2F(userCredential.user) === 'requise') {
                    btn.innerText = originalText;
                    await demanderCode2FA(userCredential.user);
                    return;
                }
                entrer(userCredential.user);
            } catch (error) {
                showError('login-error', "Erreur réseau, réessayez.");
                btn.innerText = originalText;
            }
        };

        window.verifier2fa = async function() {
            const code = document.getElementById('twofa-code').value.trim();
            const user = auth.currentUser;
            if (!user) {
                showError('twofa-error', "Session expirée, reconnectez-vous.");
                return;
            }
            try {
                const idToken = await user.getIdToken();
                const r = await fetch(ENDPOINT_VERIFIER_CODE_2FA, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${idToken}` },
                    body: JSON.stringify({ code, action: 'login', methode: methode2fa })
                });
                const d = await r.json();
                if (d.success) {
                    if (typeof d.codesSecoursRestants === 'number' && d.codesSecoursRestants <= 3) {
                        localStorage.setItem('a2f_alerte', `Il te reste ${d.codesSecoursRestants} code(s) de secours : désactive puis réactive l'application d'authentification pour en obtenir de nouveaux.`);
                    }
                    entrer(user);
                } else {
                    showError('twofa-error', d.error || "Code incorrect.");
                }
            } catch (e) {
                showError('twofa-error', "Erreur réseau.");
            }
        };

        window.renvoyer2fa = async function() {
            const user = auth.currentUser;
            if (!user) return;
            try {
                const d = await envoyerCode2FA(user);
                showError('twofa-error', d.error || "Un nouveau code a été envoyé.");
            } catch (e) {
                showError('twofa-error', "Impossible de renvoyer le code.");
            }
        };

        // Abandon : on ferme la session non validée et on revient au formulaire.
        window.annuler2fa = async function() {
            await signOut(auth);
            montrerSection('login-section');
        };

        // Session déjà ouverte mais pas encore validée (ex. redirigé depuis
        // index.html, ou après un changement de mot de passe) : on demande le code.
        auth.authStateReady().then(async () => {
            const user = auth.currentUser;
            if (!user || user.isAnonymous) return;
            try {
                if (await etatA2F(user) === 'requise') await demanderCode2FA(user);
            } catch (e) { /* hors ligne : le formulaire normal reste affiché */ }
        });

window.tempGoogleUser = null; // Stocke l'utilisateur temporairement

// ---------- Connexion Google ----------
// Site : pop-up Google classique.
// Launcher (Tauri) : le pop-up est bloqué et Google refuse les fenêtres intégrées aux apps.
// On ouvre donc DIRECTEMENT le choix de compte Google dans le navigateur ; Google renvoie
// le jeton à novaly-store.fr/connexion-google.html, qui rouvre aussitôt le launcher avec
// novaly://auth-google#n=<jeton unique>&t=<jeton Google>.
// Le jeton unique (state + nonce OpenID) n'est accepté que s'il a été créé ICI il y a moins
// de 10 min et qu'il figure dans le jeton Google : un lien reçu d'ailleurs ne peut pas nous
// connecter au compte de quelqu'un d'autre.
// ⚠️ L'adresse de retour doit être autorisée dans Google Cloud Console → Identifiants →
// « Web client (auto created by Google Service) » → URI de redirection autorisés.
const GOOGLE_CLIENT_ID = "58102958990-mou6q8c77761aqinj5uc9i2uhc3qnr28.apps.googleusercontent.com";
const RETOUR_GOOGLE = "https://novaly-store.fr/connexion-google.html";
const NONCE_GOOGLE = "google_nonce";

// Lit le contenu (non vérifié ici : Firebase vérifie la signature) d'un jeton Google.
function contenuJeton(jwt) {
    try {
        const b64 = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        return JSON.parse(decodeURIComponent(escape(atob(b64))));
    } catch (e) { return {}; }
}

// Suite commune après une connexion Google réussie (pop-up ou navigateur).
async function apresConnexionGoogle(user) {
    if (await etatA2F(user) === 'requise') {
        await demanderCode2FA(user);
        return;
    }
    // On vérifie si ce compte Google a déjà un profil Novaly
    const docSnap = await getDoc(doc(db, "users", user.uid));
    if (docSnap.exists()) {
        localStorage.setItem('isLoggedIn', 'true');
        window.location.href = 'index.html';
    } else {
        // NOUVEAU COMPTE : on demande le pseudo
        window.tempGoogleUser = user;
        montrerSection('google-pseudo-section');
    }
}

function erreurGoogle(error) {
    console.error("Connexion Google :", error);
    montrerSection('login-section');
    showError('login-error', "Erreur avec Google (" + (error.code || error.message || "inconnue") + ").");
}

window.loginWithGoogle = async function() {
    hideErrors();
    if (window.__TAURI__) return demarrerGoogleNavigateur();
    try {
        const result = await signInWithPopup(auth, provider);
        await apresConnexionGoogle(result.user);
    } catch (error) {
        if (error.code !== 'auth/popup-closed-by-user') erreurGoogle(error);
    }
};

async function demarrerGoogleNavigateur() {
    const nonce = crypto.randomUUID();
    localStorage.setItem(NONCE_GOOGLE, JSON.stringify({ nonce, at: Date.now() }));
    montrerSection('google-wait-section');
    document.getElementById('google-wait-error').style.display = 'none';
    const url = "https://accounts.google.com/o/oauth2/v2/auth?" + new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        redirect_uri: RETOUR_GOOGLE,
        response_type: "id_token",
        scope: "openid email profile",
        prompt: "select_account",
        state: nonce,
        nonce: nonce
    });
    try {
        await window.__TAURI__.core.invoke("plugin:opener|open_url", { url });
    } catch (e) {
        showError('google-wait-error', "Impossible d'ouvrir le navigateur.");
    }
}

async function recevoirLienGoogle(url) {
    let lien;
    try { lien = new URL(String(url).trim()); } catch (e) { return false; }
    if (lien.protocol !== 'novaly:' || lien.host !== 'auth-google') return false;
    const p = new URLSearchParams(lien.hash.slice(1));
    let attendu = null;
    try { attendu = JSON.parse(localStorage.getItem(NONCE_GOOGLE) || 'null'); } catch (e) { /* illisible */ }
    if (!attendu) return true;   // aucune connexion en attente (ex. lien déjà utilisé) : on ignore
    if (attendu.nonce !== p.get('n') || Date.now() - attendu.at > 10 * 60 * 1000 || !p.get('t')
        || contenuJeton(p.get('t')).nonce !== attendu.nonce) {
        montrerSection('login-section');
        showError('login-error', "Lien de connexion Google invalide ou expiré. Recommence.");
        return true;
    }
    localStorage.removeItem(NONCE_GOOGLE);   // usage unique
    try {
        const cred = await signInWithCredential(auth, GoogleAuthProvider.credential(p.get('t')));
        await apresConnexionGoogle(cred.user);
    } catch (error) {
        erreurGoogle(error);
    }
    return true;
}

// Secours si le navigateur n'a pas pu rouvrir Novaly : on colle le lien affiché par la page.
window.collerLienGoogle = async function() {
    const champ = document.getElementById('google-paste');
    if (!(await recevoirLienGoogle(champ.value))) showError('google-wait-error', "Ce n'est pas un lien de connexion Novaly.");
};
window.annulerGoogle = function() {
    localStorage.removeItem(NONCE_GOOGLE);
    montrerSection('login-section');
};

if (window.__TAURI__ && window.__TAURI__.deepLink) {
    const { getCurrent, onOpenUrl } = window.__TAURI__.deepLink;
    onOpenUrl(urls => urls.forEach(recevoirLienGoogle)).catch(() => {});
    // Lien arrivé pendant qu'une autre page était affichée (relayé par index.html)
    const enAttente = sessionStorage.getItem('lien_google');
    if (enAttente) { sessionStorage.removeItem('lien_google'); recevoirLienGoogle(enAttente); }
    else getCurrent().then(urls => (urls || []).forEach(recevoirLienGoogle)).catch(() => {});
}

window.finalizeGoogleLogin = async function() {
    hideErrors();
    const pseudo = document.getElementById('google-username').value.trim();
    const btn = document.querySelector('#google-pseudo-section .btn');

    if (!pseudo) return showError('google-error', "Veuillez entrer un pseudo.");

    btn.innerText = "Vérification...";
    try {
        // On vérifie si le pseudo est déjà pris
        const usersRef = collection(db, "users");
        const q = query(usersRef, where("pseudoLower", "==", pseudo.toLowerCase()));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
            btn.innerText = "Valider et entrer";
            return showError('google-error', "Ce pseudo est déjà pris !");
        }

        // Pseudo libre : on met à jour le profil et on crée le document
        await updateProfile(window.tempGoogleUser, { displayName: pseudo });
        await setDoc(doc(db, "users", window.tempGoogleUser.uid), {
            pseudo: pseudo,
            pseudoLower: pseudo.toLowerCase()
        });

        localStorage.setItem('isLoggedIn', 'true');
        window.location.href = 'index.html';

    } catch (error) {
        showError('google-error', "Une erreur est survenue.");
        btn.innerText = "Valider et entrer";
    }
};

        window.toggleForm = function() {
            hideErrors();
            let loginSec = document.getElementById('login-section');
            let regSec = document.getElementById('register-section');

            if (loginSec.style.display === "none") {
                loginSec.style.display = "block";
                regSec.style.display = "none";
            } else {
                loginSec.style.display = "none";
                regSec.style.display = "block";
            }
        };
        if (window.__TAURI__) {
            const appWindow = window.__TAURI__.window.getCurrentWindow();
            document.getElementById('titlebar-minimize').addEventListener('click', () => appWindow.minimize());
            document.getElementById('titlebar-maximize').addEventListener('click', () => appWindow.toggleMaximize());
            document.getElementById('titlebar-close').addEventListener('click', () => appWindow.close());
        }
                        // ================= CONTRÔLES DE LA FENÊTRE =================
        const appWindow = window.__TAURI__.window.getCurrentWindow();

        document.getElementById('titlebar-minimize').addEventListener('click', () => {
            appWindow.minimize();
        });

        document.getElementById('titlebar-maximize').addEventListener('click', () => {
            appWindow.toggleMaximize();
        });

        document.getElementById('titlebar-close').addEventListener('click', () => {
            appWindow.close();
        });
