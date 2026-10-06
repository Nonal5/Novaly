        import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
        import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, updateProfile, signOut } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
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
        async function etatA2F(user) {
            const actif = await getDoc(doc(db, "a2f_actif", user.uid));
            if (!actif.exists()) return 'aucune';
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
        async function demanderCode2FA(user) {
            afficher2faSection();
            document.getElementById('twofa-error').style.display = "none";
            try {
                const d = await envoyerCode2FA(user);
                if (d.error) showError('twofa-error', d.error);
            } catch (e) {
                showError('twofa-error', "Impossible d'envoyer le code. Réessayez avec « Renvoyer le code ».");
            }
        }

        function entrer(user) {
            localStorage.setItem('isLoggedIn', 'true');
            localStorage.setItem('username', user.displayName || "Joueur");
            localStorage.setItem('email', user.email);
            window.location.href = 'index.html';
        }

        function afficher2faSection() {
            document.getElementById('login-section').style.display = 'none';
            document.getElementById('register-section').style.display = 'none';
            document.getElementById('google-pseudo-section').style.display = 'none';
            document.getElementById('twofa-section').style.display = 'block';
        }

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
                    body: JSON.stringify({ code, action: 'login' })
                });
                const d = await r.json();
                if (d.success) {
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
            document.getElementById('twofa-section').style.display = 'none';
            document.getElementById('login-section').style.display = 'block';
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

window.loginWithGoogle = async function() {
    hideErrors();
    try {
        const result = await signInWithPopup(auth, provider);
        if (await etatA2F(result.user) === 'requise') {
            await demanderCode2FA(result.user);
            return;
        }
        const userDocRef = doc(db, "users", result.user.uid);

        // On vérifie si ce compte Google a déjà un profil Novaly
        const docSnap = await getDoc(userDocRef);

        if (docSnap.exists()) {
            // Le compte existe déjà, on le connecte direct
            localStorage.setItem('isLoggedIn', 'true');
            window.location.href = 'index.html';
        } else {
            // NOUVEAU COMPTE : On cache le reste et on demande le pseudo
            window.tempGoogleUser = result.user;
            document.getElementById('login-section').style.display = 'none';
            document.getElementById('google-pseudo-section').style.display = 'block';
        }
    } catch (error) {
        if (error.code !== 'auth/popup-closed-by-user') {
            showError('login-error', "Erreur avec Google.");
        }
    }
};

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
