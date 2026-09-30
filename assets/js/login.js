        import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
        import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, updateProfile } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
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

            try {
                const userCredential = await signInWithEmailAndPassword(auth, email, password);
                localStorage.setItem('isLoggedIn', 'true');
                localStorage.setItem('username', userCredential.user.displayName || "Joueur");
                localStorage.setItem('email', userCredential.user.email);
                window.location.href = 'index.html';
            } catch (error) {
                showError('login-error', "Adresse e-mail ou mot de passe incorrect.");
                btn.innerText = originalText;
            }
        };

window.tempGoogleUser = null; // Stocke l'utilisateur temporairement

window.loginWithGoogle = async function() {
    hideErrors();
    try {
        const result = await signInWithPopup(auth, provider);
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
