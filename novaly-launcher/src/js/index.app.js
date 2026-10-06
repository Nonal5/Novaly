        import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
        import { getAuth, updateProfile, onAuthStateChanged, signOut, deleteUser, EmailAuthProvider, reauthenticateWithCredential, updatePassword } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
        import { getFirestore, doc, setDoc, getDoc, collection, query, where, getDocs, addDoc, serverTimestamp, deleteDoc, onSnapshot, orderBy, arrayUnion, writeBatch, deleteField } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";
        import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-storage.js";

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
        const db = getFirestore(app);
        const storage = getStorage(app);

        // ---------------- SÉCURITÉ : ANTI-XSS ----------------
        // Toute donnée venant de Firestore (pseudos, messages, jeux...) doit passer par esc()
        // avant d'être insérée dans du HTML, sinon un joueur peut injecter du code.
        const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        // Argument sûr pour un attribut onclick="fonction(...)"
        const jsArg = (v) => esc(JSON.stringify(String(v ?? '')));
        // URL sûre pour un url('...') CSS : version brute pour element.style, version échappée pour du HTML
        const cssUrlBrut = (v) => String(v ?? '').replace(/['"()\\\s]/g, c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'));
        const cssUrl = (v) => esc(cssUrlBrut(v));

        // Données personnelles : jamais dans users/{uid} (lisible par tous les joueurs connectés),
        // mais dans users/{uid}/private/profil (lisible uniquement par le propriétaire).
        const CHAMPS_PRIVES = ['prenom', 'nom', 'adresse1', 'adresse2', 'ville', 'region', 'zip', 'country',
            'paymentCardLast4', 'a2f_app', 'a2f_email', 'linked_steam', 'linked_discord'];
        const privateDocRef = (uid) => doc(db, "users", uid, "private", "profil");

        window.currentAvatarFile = null;
        window.currentAvatarDataUrl = null;
        window.mesJeux = [];

        window.unreadChatsCount = 0;
        window.pendingReqCount = 0;
        window.updateGlobalBadge = function() {
            const badgeGlobal = document.getElementById('unread-badge');
            if (badgeGlobal) {
                const total = window.unreadChatsCount + window.pendingReqCount;
                if (total > 0) {
                    badgeGlobal.style.display = 'inline-block';
                    badgeGlobal.innerText = total;
                } else {
                    badgeGlobal.style.display = 'none';
                }
            }
        };

        // SURVEILLANCE DU COMPTE
        onAuthStateChanged(auth, async (user) => {
            const loggedOutView = document.getElementById('logged-out-view');
            const loggedInView = document.getElementById('logged-in-view');
            const friendsMenuContainer = document.getElementById('friends-menu-container');

            if (user) {
                // Verrou A2F : si activée et que CETTE connexion n'a pas été validée par
                // le code e-mail, la page de connexion demande le code (Firestore et les
                // Cloud Functions refusent de toute façon une session non validée).
                try {
                    const actif = await getDoc(doc(db, "a2f_actif", user.uid));
                    if (actif.exists()) {
                        const { claims } = await user.getIdTokenResult();
                        const ok = await getDoc(doc(db, "a2f_sessions", user.uid, "ok", String(claims.auth_time)));
                        if (!ok.exists()) {
                            window.location.href = 'login.html';
                            return;
                        }
                    }
                } catch (e) { /* hors ligne : les règles Firestore restent le vrai verrou */ }

                if (loggedOutView) loggedOutView.style.display = 'none';
                if (loggedInView) loggedInView.style.display = 'flex';
                if (friendsMenuContainer) friendsMenuContainer.style.display = 'flex';

                const displayName = user.displayName || "Joueur";
                document.getElementById('nav-username').innerText = displayName;
                document.getElementById('profile-username').value = displayName;
                document.getElementById('profile-email').value = user.email || "";

                const initial = displayName.charAt(0).toUpperCase();
                document.getElementById('nav-avatar').innerText = initial;
                document.getElementById('profile-avatar-preview').innerText = initial;

                try {
                    const userDocRef = doc(db, "users", user.uid);
                    await setDoc(userDocRef, { 
                        pseudo: displayName, 
                        pseudoLower: displayName.toLowerCase(),
                        isOnline: true 
                    }, { merge: true });

                    window.addEventListener('beforeunload', () => {
                        setDoc(userDocRef, { isOnline: false }, { merge: true });
                    });

// On remplace le getDoc par onSnapshot pour écouter la base de données en direct
            onSnapshot(userDocRef, (docSnap) => {
                if (docSnap.exists()) {
                    const data = docSnap.data();

                    // 1. On mémorise combien de jeux on avait avant la mise à jour
                    const nombreAnciensJeux = window.mesJeux.length;

                    // 2. On met à jour la liste globale
                    window.mesJeux = data.jeuxPossedes || [];
                    window.mesJeux.forEach(gameId => {
                        const btn = document.getElementById('btn-add-' + gameId);
                        if (btn) {
                            btn.innerText = "Dans la bibliothèque";
                            btn.disabled = true;
                            btn.style.background = "#2a2a2a";
                            btn.style.color = "#888";
                        }
                    });

                    // 3. Si un nouveau jeu vient d'être ajouté (par le Webhook Stripe en arrière-plan)
                    if (window.mesJeux.length > nombreAnciensJeux) {
                        if(window.actualiserBibliotheque) window.actualiserBibliotheque();

                        // Si le joueur est en train de regarder la page d'un jeu, on la rafraîchit
                        if (window.currentViewId === 'game-detail') {
                            const dernierJeuAchete = window.mesJeux[window.mesJeux.length - 1];
                            window.afficherPageJeu(dernierJeuAchete);
                        }
                    }

                    // --- Le reste de ton code original pour le profil (Avatar, Titre, etc.) ---
                    if (data.avatarUrl) {
                        document.getElementById('nav-avatar').innerText = "";
                        document.getElementById('nav-avatar').style.backgroundImage = `url(${data.avatarUrl})`;
                        document.getElementById('profile-avatar-preview').innerText = "";
                        document.getElementById('profile-avatar-preview').style.backgroundImage = `url(${data.avatarUrl})`;
                    }

                    const titleVal = data.titre || "NOVICE";
                    if(document.getElementById('profile-title')) document.getElementById('profile-title').value = titleVal;
                    if(document.getElementById('nav-title')) document.getElementById('nav-title').innerText = titleVal;

                    // Migration : les anciennes données perso stockées dans le profil public
                    // sont déplacées vers users/{uid}/private/profil (lisible uniquement par soi).
                    const anciennesDonneesPrivees = {};
                    const suppression = {};
                    CHAMPS_PRIVES.forEach(champ => {
                        if (champ in data) {
                            // Les anciens drapeaux a2f_* sont obsolètes (référence : a2f_actif)
                            if (!champ.startsWith('a2f_')) anciennesDonneesPrivees[champ] = data[champ];
                            suppression[champ] = deleteField();
                        }
                    });
                    if (Object.keys(suppression).length > 0) {
                        setDoc(privateDocRef(user.uid), anciennesDonneesPrivees, { merge: true })
                            .then(() => setDoc(userDocRef, suppression, { merge: true }))
                            .catch(e => console.error("Migration des données privées :", e));
                    }
                }
            });

            onSnapshot(privateDocRef(user.uid), (docSnap) => {
                if (docSnap.exists()) {
                    const data = docSnap.data();

                    if(document.getElementById('profile-firstname')) document.getElementById('profile-firstname').value = data.prenom || "";
                    if(document.getElementById('profile-lastname')) document.getElementById('profile-lastname').value = data.nom || "";
                    if(document.getElementById('profile-address1')) document.getElementById('profile-address1').value = data.adresse1 || "";
                    if(document.getElementById('profile-address2')) document.getElementById('profile-address2').value = data.adresse2 || "";
                    if(document.getElementById('profile-city')) document.getElementById('profile-city').value = data.ville || "";
                    if(document.getElementById('profile-region')) document.getElementById('profile-region').value = data.region || "";
                    if(document.getElementById('profile-zip')) document.getElementById('profile-zip').value = data.zip || "";
                    if(document.getElementById('profile-country')) document.getElementById('profile-country').value = data.country || "";

                }
            });
            } catch(error) {
                    console.error("Erreur Firestore:", error);
            }
                // GESTION DES REQUÊTES D'AMIS
                const requestsRef = collection(db, "friend_requests");
                const qRequests = query(requestsRef, where("receiverId", "==", user.uid), where("status", "==", "pending"));

                onSnapshot(qRequests, (snapshot) => {
                    const listEl = document.getElementById('friend-requests-list');
                    const container = document.getElementById('pending-requests-container');

                    window.pendingReqCount = snapshot.empty ? 0 : snapshot.docs.length;
                    window.updateGlobalBadge();

                    if (snapshot.empty) {
                        if(container) container.style.display = 'none';
                        if(listEl) listEl.innerHTML = '';
                        return;
                    }

                    if(container) container.style.display = 'block';
                    let html = "";
                    snapshot.forEach(docRequest => {
                        const req = docRequest.data();
                        html += `
                        <div style="display: flex; justify-content: space-between; align-items: center; background: #111; padding: 8px 10px; border-radius: 4px; margin-bottom: 5px; border: 1px solid #333;">
                            <span style="color: white; font-weight: bold; font-size: 11px;">${esc(req.senderPseudo)}</span>
                            <div style="display: flex; gap: 5px;">
                                <button onclick="acceptFriend(${jsArg(docRequest.id)}, ${jsArg(req.senderId)})" style="background: #4cd137; color: black; border: none; padding: 4px 8px; border-radius: 3px; cursor: pointer; font-size: 10px; font-weight: 800;">OK</button>
                                <button onclick="declineFriend(${jsArg(docRequest.id)})" style="background: transparent; color: #ff4757; border: 1px solid #ff4757; padding: 4px 8px; border-radius: 3px; cursor: pointer; font-size: 10px; font-weight: 800;">X</button>
                            </div>
                        </div>`;
                    });
                    if(listEl) listEl.innerHTML = html;
                });

                const friendsRef = collection(db, "users", user.uid, "friends");

                // On prépare le son de notification
                const sonNotif = new Audio('https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3');
                sonNotif.volume = 0.5;
                window.amisAvertis = window.amisAvertis || {};

                onSnapshot(friendsRef, async (snapshot) => {
                    const onlineList = document.getElementById('friends-online-list');
                    const offlineList = document.getElementById('friends-offline-list');

                    let onlineHtml = "";
                    let offlineHtml = "";
                    let onlineCount = 0;
                    let offlineCount = 0;
                    let totalUnread = 0;

                    for (const docFriend of snapshot.docs) {
                        const friendLink = docFriend.data();
                        const friendId = docFriend.id;

                        const friendSnap = await getDoc(doc(db, "users", friendId));
                        const friendData = friendSnap.exists() ? friendSnap.data() : null;
                        const isOnline = friendData ? friendData.isOnline : false;

                        const hasUnread = friendLink.hasUnread === true;
                        if (hasUnread) {
                            totalUnread++;
                            // Jouer le son si on n'avait pas encore averti pour ce message
                            if (!window.amisAvertis[friendId]) {
                                sonNotif.play().catch(e => console.log("Son bloqué par le navigateur"));
                                window.amisAvertis[friendId] = true;
                            }
                        } else {
                            window.amisAvertis[friendId] = false;
                        }

                        const badgeUnread = hasUnread ? `<span style="background: #ff4757; color: white; font-size: 9px; padding: 2px 5px; border-radius: 10px; font-weight: bold; margin-left: auto; box-shadow: 0 0 5px rgba(255,71,87,0.5);">NOUVEAU</span>` : '';

                        const itemHtml = `
                        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px; padding: 4px; opacity: ${isOnline ? '1' : '0.5'}; cursor: pointer; border-radius: 4px; transition: background 0.2s;" onmouseover="this.style.background='#222'" onmouseout="this.style.background='transparent'" onclick="ouvrirChat(${jsArg(friendId)}, ${jsArg(friendLink.pseudo)})">
                            <div style="width: 7px; height: 7px; background: ${isOnline ? '#4cd137' : '#555'}; border-radius: 50%; ${isOnline ? 'box-shadow: 0 0 5px #4cd137;' : ''}"></div>
                            <span style="font-size: 13px; color: ${isOnline ? '#eee' : '#777'}; font-weight: 500;">${esc(friendLink.pseudo)}</span>
                            ${badgeUnread}
                        </div>`;

                        if (isOnline) {
                            onlineHtml += itemHtml;
                            onlineCount++;
                        } else {
                            offlineHtml += itemHtml;
                            offlineCount++;
                        }
                    }

if(onlineList) onlineList.innerHTML = onlineCount > 0 ? onlineHtml : '<p style="font-size: 11px; color: #666; font-style: italic; margin: 0;">Aucun ami en ligne.</p>';
                    if(offlineList) offlineList.innerHTML = offlineCount > 0 ? offlineHtml : '<p style="font-size: 11px; color: #666; font-style: italic; margin: 0;">Aucun ami hors ligne.</p>';

                    window.unreadChatsCount = totalUnread;
                    window.updateGlobalBadge();
                });
            } else {
                // SI L'UTILISATEUR N'EST PAS CONNECTÉ (C'EST CE QU'IL TE MANQUAIT)
                if (loggedOutView) loggedOutView.style.display = 'block';
                if (loggedInView) loggedInView.style.display = 'none';
                if (friendsMenuContainer) friendsMenuContainer.style.display = 'none'; 
            }
        });

        // ================= GESTION DU TEMPS DE JEU ET STATUT =================
        window.heureDebutJeu = 0;
        window.jeuEnCoursId = null;

        window.demarrerSessionJeu = async function(gameId, gameTitle) {
            window.heureDebutJeu = Date.now();
            window.jeuEnCoursId = gameId;

            const user = auth.currentUser;
            if (user) {
                // Changer le statut pour tous les amis
                await setDoc(doc(db, "users", user.uid), {
                    isOnline: true,
                    activite: "Joue à " + gameTitle
                }, { merge: true });
            }
        };

        window.terminerSessionJeu = async function() {
            if (!window.jeuEnCoursId) return;

            // Calculer le temps passé en minutes
            const tempsJoueMs = Date.now() - window.heureDebutJeu;
            const tempsJoueMinutes = Math.floor(tempsJoueMs / 60000); 
            const gameId = window.jeuEnCoursId;

            window.jeuEnCoursId = null;
            window.heureDebutJeu = 0;

            const user = auth.currentUser;
            if (user) {
                const userRef = doc(db, "users", user.uid);
                const userSnap = await getDoc(userRef);

                let tempsTotal = tempsJoueMinutes;

                // Si on a déjà joué avant, on additionne
                if (userSnap.exists() && userSnap.data().tempsDeJeu && userSnap.data().tempsDeJeu[gameId]) {
                    tempsTotal += userSnap.data().tempsDeJeu[gameId];
                }

                // Retour à la normale et sauvegarde du temps
                await setDoc(userRef, {
                    isOnline: true,
                    activite: "En ligne",
                    [`tempsDeJeu.${gameId}`]: tempsTotal
                }, { merge: true });

                console.log(`Session terminée. Temps total sur ${gameId} : ${tempsTotal} minutes.`);
            }
        };

        // ---------------- FONCTIONS DE GESTION ----------------
        window.previewAvatar = function(event) {
            const file = event.target.files[0];
            if (file) {
                if (file.size > 2 * 1024 * 1024) {
                    afficherAlerte("L'image est trop lourde ! Choisissez une image de moins de 2 Mo.");
                    return;
                }
                window.currentAvatarFile = file; 
                const reader = new FileReader();
                reader.onload = function(e) {
                    const preview = document.getElementById('profile-avatar-preview');
                    if(preview) {
                        preview.style.backgroundImage = `url(${e.target.result})`;
                        preview.innerText = "";
                    }
                };
                reader.readAsDataURL(file);
            }
        };

        window.sendFriendRequest = async function() {
            const pseudoInput = document.getElementById('friend-search-input');
            const msg = document.getElementById('friend-msg');
            const targetPseudo = pseudoInput.value.trim();

            if (targetPseudo === "") {
                msg.style.color = "#ff4757";
                msg.innerText = "Veuillez entrer un pseudo.";
                msg.style.display = "block";
                return;
            }

            if (!auth.currentUser) return;
            const myPseudo = document.getElementById('profile-username').value;

            if (targetPseudo.toLowerCase() === myPseudo.toLowerCase()) {
                msg.style.color = "#ff4757";
                msg.innerText = "Vous ne pouvez pas vous ajouter vous-même !";
                msg.style.display = "block";
                return;
            }

            const btn = document.querySelector('button[onclick="sendFriendRequest()"]');
            const originalText = btn.innerText;
            btn.innerText = "...";
            btn.disabled = true;

            try {
                const usersRef = collection(db, "users");
                const q = query(usersRef, where("pseudoLower", "==", targetPseudo.toLowerCase()));
                const querySnapshot = await getDocs(q);

                if (querySnapshot.empty) {
                    msg.style.color = "#ff4757";
                    msg.innerText = "Joueur introuvable.";
                    msg.style.display = "block";
                } else {
                    const targetUserDoc = querySnapshot.docs[0];
                    const targetUserId = targetUserDoc.id;
                    const realTargetPseudo = targetUserDoc.data().pseudo;

                    // ID prévisible "expediteur_destinataire" : les règles Firestore vérifient
                    // qu'une vraie demande existe avant d'autoriser l'ajout en ami.
                    await setDoc(doc(db, "friend_requests", `${auth.currentUser.uid}_${targetUserId}`), {
                        senderId: auth.currentUser.uid,
                        senderPseudo: myPseudo,
                        receiverId: targetUserId,
                        receiverPseudo: realTargetPseudo,
                        status: "pending",
                        timestamp: serverTimestamp()
                    });

                    msg.style.color = "#4cd137";
                    msg.innerText = "Demande envoyée !";
                    msg.style.display = "block";
                    pseudoInput.value = "";
                }
            } catch(error) {
                msg.style.color = "#ff4757";
                msg.innerText = "Erreur de connexion.";
                msg.style.display = "block";
            } finally {
                btn.innerText = originalText;
                btn.disabled = false;
                setTimeout(() => msg.style.display = "none", 4000);
            }
        };

        window.acceptFriend = async function(requestId, senderId) {
            try {
                // Le pseudo est relu depuis le profil de l'expéditeur (pas depuis la demande, falsifiable)
                const senderSnap = await getDoc(doc(db, "users", senderId));
                const senderPseudo = senderSnap.exists() ? senderSnap.data().pseudo : "Joueur";
                const myPseudo = document.getElementById('profile-username').value;

                // Tout en une seule écriture atomique, AVANT la suppression de la demande :
                // les règles Firestore vérifient que la demande existe.
                const batch = writeBatch(db);
                batch.set(doc(db, "users", auth.currentUser.uid, "friends", senderId), {
                    pseudo: senderPseudo,
                    addedAt: serverTimestamp()
                });
                batch.set(doc(db, "users", senderId, "friends", auth.currentUser.uid), {
                    pseudo: myPseudo,
                    addedAt: serverTimestamp()
                });
                batch.delete(doc(db, "friend_requests", requestId));
                await batch.commit();
            } catch (error) {
                console.error("Erreur acceptation:", error);
            }
        };

        window.declineFriend = async function(requestId) {
            try {
                await deleteDoc(doc(db, "friend_requests", requestId));
            } catch (error) {
                console.error("Erreur refus:", error);
            }
        };

        window.saveProfile = async function() {
            const btn = document.querySelector('button[onclick="saveProfile()"]');
            let msg = document.getElementById('save-msg');

            if (auth.currentUser) {
                const originalText = btn.innerText;
                btn.innerText = "Vérification...";
                btn.disabled = true;

                try {
                    const newUsername = document.getElementById('profile-username').value.trim();
                    const newTitle = document.getElementById('profile-title').value;

                    const usersRef = collection(db, "users");
                    const q = query(usersRef, where("pseudoLower", "==", newUsername.toLowerCase()));
                    const querySnapshot = await getDocs(q);

                    let isTaken = false;
                    querySnapshot.forEach((docSnap) => {
                        if (docSnap.id !== auth.currentUser.uid) isTaken = true;
                    });

                    if (isTaken) {
                        msg.style.color = "#ff4757";
                        msg.innerText = "Erreur : Ce pseudo est déjà utilisé.";
                        msg.style.display = "block";
                        return;
                    }

                    btn.innerText = "Sauvegarde...";
                    await updateProfile(auth.currentUser, { displayName: newUsername });
                    const userDocRef = doc(db, "users", auth.currentUser.uid);

                    let dataToSave = {
                        pseudo: newUsername,
                        pseudoLower: newUsername.toLowerCase(),
                        titre: newTitle
                    };
                    const donneesPrivees = {
                        prenom: document.getElementById('profile-firstname').value,
                        nom: document.getElementById('profile-lastname').value,
                        adresse1: document.getElementById('profile-address1').value,
                        adresse2: document.getElementById('profile-address2').value || "",
                        ville: document.getElementById('profile-city').value,
                        region: document.getElementById('profile-region').value || "",
                        zip: document.getElementById('profile-zip').value || "",
                        country: document.getElementById('profile-country').value || ""
                    };

                    if (window.currentAvatarFile) {
                        btn.innerText = "Upload de l'image...";
                        const storageRef = ref(storage, 'avatars/' + auth.currentUser.uid + '.jpg');
                        await uploadBytes(storageRef, window.currentAvatarFile);
                        const downloadUrl = await getDownloadURL(storageRef);
                        dataToSave.avatarUrl = downloadUrl;
                        window.currentAvatarFile = null; 
                    }

                    await setDoc(userDocRef, dataToSave, { merge: true });
                    await setDoc(privateDocRef(auth.currentUser.uid), donneesPrivees, { merge: true });

                    document.getElementById('nav-username').innerText = newUsername;
                    document.getElementById('nav-title').innerText = newTitle;

                    if (window.currentAvatarDataUrl) {
                        document.getElementById('nav-avatar').innerText = "";
                        document.getElementById('nav-avatar').style.backgroundImage = `url(${window.currentAvatarDataUrl})`;
                    } else if (!document.getElementById('nav-avatar').style.backgroundImage) {
                        document.getElementById('nav-avatar').innerText = newUsername.charAt(0).toUpperCase();
                    }

                    msg.style.color = "#4cd137";
                    msg.innerText = "Données sauvegardées !";
                    msg.style.display = "block";

                } catch (error) {
                    msg.style.color = "#ff4757";
                    msg.innerText = "Erreur de connexion à la base.";
                    msg.style.display = "block";
                } finally {
                    btn.innerText = originalText;
                    btn.disabled = false;
                    setTimeout(() => msg.style.display = "none", 4000);
                }
            }
        };

        window.confirmDeleteAccount = async function() {
            const email = document.getElementById('delete-email').value;
            const password = document.getElementById('delete-password').value;
            const msg = document.getElementById('delete-msg');

            if(!email || !password) {
                msg.innerText = "Veuillez remplir votre e-mail et mot de passe.";
                msg.style.display = "block";
                return;
            }

            try {
                const user = auth.currentUser;
                const credential = EmailAuthProvider.credential(email, password);
                await reauthenticateWithCredential(user, credential);

                await deleteDoc(privateDocRef(user.uid));
                await deleteDoc(doc(db, "users", user.uid));
                await deleteUser(user);

                localStorage.clear();
                window.location.href = "index.html";
            } catch (error) {
                msg.innerText = "Identifiants incorrects.";
                msg.style.display = "block";
            }
        };





        window.logout = async function() {
            try {
                if (auth.currentUser) {
                    await setDoc(doc(db, "users", auth.currentUser.uid), { isOnline: false }, { merge: true });
                }
                localStorage.clear();
                await signOut(auth);
                window.location.reload();
            } catch (error) {
                console.error("Erreur lors de la déconnexion", error);
            }
        };

        // ================= GESTION DES JEUX ONLINE ET BIBLIOTHEQUE =================
        window.currentGameSelected = "";

        window.lancerJeu = function(jeuId) {
            window.currentGameSelected = jeuId;
            const titles = { 'imposteur': 'The Imposteur', 'nolimite': 'Nolimite' };
            document.getElementById('lobby-game-title').innerText = titles[jeuId] || "Jeu";
            document.getElementById('game-lobby-modal').style.display = 'flex';
            document.getElementById('private-match-section').style.display = 'none';
            document.getElementById('private-room-code').value = '';
        };

        window.closeGameModal = function() {
            document.getElementById('game-lobby-modal').style.display = 'none';
        };

        window.togglePrivateMatchInput = function() {
            const sec = document.getElementById('private-match-section');
            sec.style.display = sec.style.display === 'none' ? 'block' : 'none';
        };

        function chargerLeJeuEnPleinEcran() {
            window.closeGameModal();
            document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
            document.getElementById('game-container').style.display = 'block';
            if(window.currentGameSelected === 'nolimite') {
                document.getElementById('game-frame').src = 'games/nolimite/index.html';
            } else if (window.currentGameSelected === 'imposteur') {
                document.getElementById('game-frame').src = 'games/imposteur/index.html'; 
            }
        }

        window.startPublicMatch = function() { chargerLeJeuEnPleinEcran(); };
        window.joinPrivateMatch = function() { chargerLeJeuEnPleinEcran(); };
        window.createPrivateMatch = function() { chargerLeJeuEnPleinEcran(); };

        window.quitterJeu = async function() {
            if (await confirmer("Quitter la partie en cours ?", { confirmer: "Quitter", danger: true })) {
                document.getElementById('game-container').style.display = 'none';
                document.getElementById('game-frame').src = '';
                navigateTo('#magasin', 'store');
            }
        };

        window.ajouterALaBibliotheque = async function(gameId, btnElement) {
            if (!auth.currentUser) {
                notifier("Vous devez être connecté !", { type: 'erreur' });
                return;
            }
            if (window.mesJeux.includes(gameId)) {
                afficherAlerte("Vous possédez déjà ce jeu !");
                return;
            }

            // Seuls les jeux gratuits peuvent être ajoutés ici (vérifié par les règles Firestore) ;
            // les jeux payants sont ajoutés par le serveur après paiement Stripe.
            await setDoc(doc(db, "users", auth.currentUser.uid), { jeuxPossedes: arrayUnion(gameId) }, { merge: true });
            window.mesJeux.push(gameId);

            if(btnElement) {
                btnElement.innerText = "Dans la bibliothèque";
                btnElement.disabled = true;
                btnElement.style.background = "#2a2a2a";
                btnElement.style.color = "#888";
            }
            if(window.actualiserBibliotheque) window.actualiserBibliotheque();
        };

window.chargerMagasin = async function() {
    const grid = document.getElementById('store-grid');
    const banner = document.getElementById('store-banner');
    const carousel = document.getElementById('store-carousel');
    if (!grid) return;

    grid.innerHTML = '<p style="color: #fff; font-size: 14px;">Chargement des jeux...</p>';

    try {
        const querySnapshot = await getDocs(collection(db, "games"));

        if (querySnapshot.empty) {
            grid.innerHTML = '<p style="color: #ff4757; font-size: 14px;">Aucun jeu trouvé.</p>';
            return;
        }

        // 1. On stocke tous les jeux dans un tableau
        let allGames = [];
        querySnapshot.forEach((docSnap) => {
            allGames.push({ id: docSnap.id, ...docSnap.data() });
        });

        // 2. Gestion de la Grande Bannière (Le premier jeu)
        const featuredGame = allGames[0];
        if (banner) {
            banner.style.background = `linear-gradient(rgba(0,0,0,0.2), rgba(0,0,0,0.9)), url('${cssUrlBrut(featuredGame.coverUrl)}') center/cover`;
            banner.innerHTML = `
                <div style="background: #ffffff; color: #000; padding: 5px 15px; border-radius: 4px; font-weight: 800; font-size: 12px; margin-bottom: 15px; text-transform: uppercase; letter-spacing: 2px; animation: slideUpFade 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.2s both;">À la une</div>
                <h1 style="font-size: 56px; margin: 0 0 10px; font-weight: 800; text-shadow: 0 4px 10px rgba(0,0,0,0.5); animation: slideUpFade 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.1s both;">${esc(featuredGame.titre.toUpperCase())}</h1>
                <p style="font-size: 18px; color: #ddd; margin: 0 0 25px; max-width: 600px; animation: slideUpFade 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.2s both;">${esc(featuredGame.description_courte || "Découvrez ce jeu incroyable dès maintenant sur Novaly.")}</p>
                <button class="btn-hero" onclick="afficherPageJeu(${jsArg(featuredGame.id)})">Découvrir le jeu</button>
            `;
        }

        // 3. Gestion du Carrousel Infini (L'astuce de clonage)
        if (carousel) {
            let carouselGames = [...allGames];

            // S'il n'y a pas assez de jeux pour remplir l'écran (ex: moins de 6), on les duplique
            while (carouselGames.length < 6) {
                carouselGames = carouselGames.concat(allGames);
            }

            // Pour que l'animation infinie fonctionne, on double la liste finale (le CSS décalera de 50%)
            const infiniteList = [...carouselGames, ...carouselGames];

            let carouselHtml = '';
            infiniteList.forEach(g => {
                carouselHtml += `
                    <div class="carousel-card" style="background-image: url('${cssUrl(g.coverUrl)}');" onclick="afficherPageJeu(${jsArg(g.id)})">
                        <div class="carousel-title">${esc(g.titre)}</div>
                    </div>
                `;
            });
            carousel.innerHTML = carouselHtml;
        }

        // 4. Gestion de la Grille "Tous nos jeux"
        grid.innerHTML = ''; 
        allGames.forEach(g => {
            grid.innerHTML += `
                <div class="game-card" onclick="afficherPageJeu(${jsArg(g.id)})">
                    <div class="game-cover" style="background: url('${cssUrl(g.coverUrl)}') center/cover; background-color: #222;"></div>
                    <div class="game-tags"><span class="tag tag-action">Disponible</span></div>
                    <div class="game-title">${esc(g.titre)}</div>
                    ${window.prixCarte ? window.prixCarte(g) : ''}
                    <button class="btn" style="width:100%; margin-top:10px; background: #ffffff; color: #000; font-size: 12px;">Voir la page</button>
                </div>
            `;
        });

    } catch (error) {
        grid.innerHTML = `<p style="color: #ff4757; font-size: 14px;">Erreur : ${esc(error.message)}</p>`;
    }
};

        // Force le chargement du catalogue dès que l'interface est prête
window.addEventListener('DOMContentLoaded', () => {
        if(window.chargerMagasin) window.chargerMagasin();
        });

// Jeux web intégrés à Novaly (lancés dans l'iframe via lancerJeu)
const JEUX_WEB = {
    imposteur: { titre: 'The Imposteur', cover: `linear-gradient(135deg, #2c3e50, #000)`, icone: 'https://cdn.jsdelivr.net/npm/lucide-static@0.321.0/icons/detective.svg' },
    nolimite: { titre: 'Nolimite', cover: `url('assets/img/cover-nolimite.png') center/cover` }
};

function carteJeuWeb(gameId) {
    const jeu = JEUX_WEB[gameId];
    const icone = jeu.icone ? `<img src="${jeu.icone}" style="width: 64px; height: 64px; filter: invert(1); opacity: 0.5;">` : '';
    return `
                <div class="game-card" onclick="lancerJeu(${jsArg(gameId)})">
                    <div class="game-cover" style="background: ${jeu.cover}; display: flex; align-items: center; justify-content: center;">${icone}</div>
                    <div class="game-title">${esc(jeu.titre)}</div>
                    <div class="game-price" style="background:#4cd137; color:#000;">Prêt à jouer</div>
                </div>`;
}

window.actualiserBibliotheque = async function() {
    const biblioView = document.getElementById('view-library');
    if (!biblioView) return;

    if (!window.mesJeux || window.mesJeux.length === 0) {
        biblioView.innerHTML = `<div class="generic-view-content"><h2>Votre bibliothèque est vide</h2><p>Vos achats apparaîtront ici.</p></div>`;
        return;
    }

    let html = `<h2 style="font-size: 18px; margin-bottom: 20px;">Vos Jeux</h2><div class="grid">`;

    for (let gameId of window.mesJeux) {
        // Jeux jouables directement dans Novaly (ils ne sont pas dans le catalogue Firestore)
        if (JEUX_WEB[gameId]) {
            html += carteJeuWeb(gameId);
            continue;
        }
        try {
            const gameSnap = await getDoc(doc(db, "games", gameId));
            if (gameSnap.exists()) {
                const gameData = gameSnap.data();
                const savedPath = localStorage.getItem('install_path_' + gameId);

                // Détermine l'action rapide en fonction du stockage local
                let actionBtn = savedPath 
                    ? `<button class="btn" style="width:100%; margin-top:10px; background: #4cd137; color: black;" onclick="event.stopPropagation(); window.afficherPageJeu(${jsArg(gameId)})">► Jouer</button>`
                    : `<button class="btn" style="width:100%; margin-top:10px; background: #0984e3; color: white;" onclick="event.stopPropagation(); telechargerJeu(${jsArg(gameId)})">Télécharger</button>`;

                html += `
                <div class="game-card" onclick="afficherPageJeu(${jsArg(gameId)})">
                    <div class="game-cover" style="background: url('${cssUrl(gameData.coverUrl)}') center/cover; background-color: #222;"></div>
                    <div class="game-title">${esc(gameData.titre)}</div>
                    ${actionBtn}
                </div>`;
            }
        } catch(e) { console.error("Erreur de chargement du jeu:", e); }
    }
    html += `</div>`;
    biblioView.innerHTML = html;
};

        // ================= GESTION DU CHAT =================

        window.activeChatId = null;
        window.currentFriendId = null; 
        let chatUnsubscribe = null;

        // Les messages peuvent avoir une date en millisecondes (Date.now()) ou un Timestamp Firestore
        // (anciennes versions) : on convertit tout en millisecondes.
        const enMillis = (t) => t == null ? Date.now() : (typeof t === 'number' ? t : (t.toMillis ? t.toMillis() : Date.now()));

        function formatChatDate(timestamp) {
            if (!timestamp) return "";
            const date = new Date(enMillis(timestamp));
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const targetDate = new Date(date);
            targetDate.setHours(0, 0, 0, 0);

            const diffTime = today - targetDate;
            const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays === 0) return "Aujourd'hui";
            if (diffDays === 1) return "Hier";
            if (diffDays >= 2 && diffDays <= 6) return `Il y a ${diffDays} jours`;

            return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
        }

        window.ouvrirChat = function(friendId, friendPseudo) {
            document.getElementById('chat-box').style.display = 'flex';
            document.getElementById('chat-title').innerText = "Discussion avec " + friendPseudo;

            window.currentFriendId = friendId;
            const chatId = [auth.currentUser.uid, friendId].sort().join('_');
            window.activeChatId = chatId;

            if (chatUnsubscribe) chatUnsubscribe(); 

            const msgsRef = collection(db, "chats", chatId, "messages");
            const q = query(msgsRef, orderBy("timestamp", "asc"));

            chatUnsubscribe = onSnapshot(q, (snap) => {
                const box = document.getElementById('chat-messages');
                box.innerHTML = '';
                let lastDateStr = null;

                // Tri côté client : les anciens messages mélangent deux formats de date
                const messages = snap.docs.map(d => ({ id: d.id, ...d.data() }))
                    .sort((a, b) => enMillis(a.timestamp) - enMillis(b.timestamp));

                messages.forEach(msg => {
                    const msgId = msg.id;
                    const isMe = msg.senderId === auth.currentUser.uid;

                    const dateStr = formatChatDate(msg.timestamp);
                    if (dateStr !== lastDateStr) {
                        box.innerHTML += `<div style="text-align: center; color: #666; font-size: 10px; margin: 15px 0 5px 0; font-weight: 800; text-transform: uppercase; letter-spacing: 1px;">${dateStr}</div>`;
                        lastDateStr = dateStr;
                    }

                    const timeStr = msg.timestamp ? new Date(enMillis(msg.timestamp)).toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'}) : '';

                    if (!isMe && msg.status !== 'read') {
                        setDoc(doc(db, "chats", chatId, "messages", msgId), { status: 'read' }, { merge: true });
                    }

                    let statusHtml = '';
                    if (isMe) {
                        if (msg.status === 'read') {
                            statusHtml = `<span style="color: #4cd137; font-size: 10px; margin-left: 4px; font-weight: bold;">${icone('check-check')}</span>`;
                        } else {
                            statusHtml = `<span style="color: #888; font-size: 10px; margin-left: 4px; font-weight: bold;">${icone('check')}</span>`;
                        }
                    }

                    box.innerHTML += `
                        <div style="align-self: ${isMe ? 'flex-end' : 'flex-start'}; max-width: 80%; display: flex; flex-direction: column;">
                            <div style="background: ${isMe ? '#0984e3' : '#2a2a2a'}; padding: 8px 12px; border-radius: 12px; color: white; word-wrap: break-word; box-shadow: 0 2px 5px rgba(0,0,0,0.3);">
                                ${rendreMessageChat(msg.text ?? msg.texte, isMe)}
                            </div>
                            <div style="align-self: ${isMe ? 'flex-end' : 'flex-start'}; font-size: 9px; color: #777; margin-top: 4px; display: flex; align-items: center;">
                                ${timeStr} ${statusHtml}
                            </div>
                        </div>`;
                });
                box.scrollTop = box.scrollHeight; 

                setDoc(doc(db, "users", auth.currentUser.uid, "friends", friendId), { 
                    hasUnread: false 
                }, { merge: true });
            });
        };

        // Invitation à jouer : un message texte contenant novaly://game/<id>, affiché en carte.
        function rendreMessageChat(texte, isMe) {
            const m = String(texte || '').match(/novaly:\/\/game\/([\w-]{1,100})/);
            if (!m) return esc(texte);
            const libelle = String(texte).replace(m[0], '').replace(/[\[\]]/g, '').trim();
            return `<div style="font-weight: 600; margin-bottom: 6px;">${esc(libelle)}</div>
                <button onclick="afficherPageJeu(${jsArg(m[1])}); document.getElementById('chat-box').style.display='none';"
                    style="background: ${isMe ? 'rgba(0,0,0,0.25)' : '#4cd137'}; color: ${isMe ? '#fff' : '#000'}; border: none; border-radius: 6px; padding: 6px 10px; font-weight: 700; cursor: pointer; font-size: 11px;">► Voir le jeu</button>`;
        }

        // Choix d'un jeu de ma bibliothèque à proposer à l'ami du chat ouvert.
        window.inviterAJouer = async function() {
            if (!window.activeChatId || !window.currentFriendId) return;
            const liste = document.getElementById('chat-invite-liste');
            if (liste.style.display === 'block') { liste.style.display = 'none'; return; }
            const jeux = await Promise.all((window.mesJeux || []).map(async id => {
                const s = await getDoc(doc(db, "games", id)).catch(() => null);
                return s && s.exists() ? { id, titre: s.data().titre || id } : null;
            }));
            const dispo = jeux.filter(Boolean);
            liste.innerHTML = dispo.length
                ? dispo.map(j => `<div class="dropdown-item" onclick="envoyerInvitation(${jsArg(j.id)}, ${jsArg(j.titre)})">${esc(j.titre)}</div>`).join('')
                : `<div style="padding: 10px; color: #888; font-size: 12px;">Aucun jeu dans ta bibliothèque.</div>`;
            liste.style.display = 'block';
        };

        window.envoyerInvitation = async function(gameId, titre) {
            document.getElementById('chat-invite-liste').style.display = 'none';
            const input = document.getElementById('chat-input');
            input.value = `🎮 Viens jouer à ${titre} avec moi ! [novaly://game/${gameId}]`;
            await window.envoyerMessage();
        };

        window.envoyerMessage = async function() {
            const input = document.getElementById('chat-input');
            const text = input.value.trim();
            if (!text || !window.activeChatId || !window.currentFriendId) return;
            if (window.parental && window.parental.actif && window.parental.chatBloque) {
                notifier("Le chat est désactivé par le contrôle parental.", { type: 'erreur' });
                return;
            }

            input.value = ""; 

            await addDoc(collection(db, "chats", window.activeChatId, "messages"), {
                text: text,
                senderId: auth.currentUser.uid,
                timestamp: Date.now(),
                status: 'sent'
            });

            await setDoc(doc(db, "users", window.currentFriendId, "friends", auth.currentUser.uid), { 
                hasUnread: true 
            }, { merge: true });
        };

        document.getElementById('chat-input').addEventListener('keypress', function (e) {
            if (e.key === 'Enter') window.envoyerMessage(); 
        });

window.acheterJeu = async function(gameId) {
    const user = auth.currentUser;
    if (!user) {
        notifier("Veuillez vous connecter pour acheter ce jeu.", { type: 'erreur' });
        return;
    }

    // Le bouton passe en mode chargement
    const zoneAction = document.getElementById('detail-action-zone');
    const boutonOriginal = zoneAction.innerHTML;
    zoneAction.innerHTML = `<button class="btn" disabled style="background: #333; color: white; width: 100%; padding: 15px;">Redirection sécurisée...</button>`;

    try {
        // Remplace cette URL par celle de ta future Cloud Function
        const endpointUrl = "https://creersessionachat-pa4unglnha-uc.a.run.app";

        // Le serveur identifie le joueur grâce à son jeton Firebase (impossible à falsifier)
        const idToken = await user.getIdToken();
        const reponse = await fetch(endpointUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${idToken}` },
            body: JSON.stringify({ gameId: gameId })
        });

        const data = await reponse.json();

        if (data.owned) {
            // Jeu gratuit : ajouté directement par le serveur
            notifier("Jeu ajouté à votre bibliothèque !", { type: 'succes' });
            zoneAction.innerHTML = boutonOriginal;
        } else if (data.url) {
            // Ouverture sécurisée du lien Stripe via le plugin opener (universel V2)
            try {
                await window.__TAURI__.core.invoke("plugin:opener|open_url", { url: data.url });
            } catch (err) {
                console.error("Impossible d'ouvrir le navigateur :", err);
                window.location.href = data.url; // Plan B d'urgence
            }

            // On remet le bouton à la normale
            setTimeout(() => { zoneAction.innerHTML = boutonOriginal; }, 5000);

        } else {
            notifier(data.error || "Impossible d'initialiser le paiement Stripe.", { type: 'erreur' });
            zoneAction.innerHTML = boutonOriginal;
        }
    } catch (e) {
        console.error("Erreur Stripe :", e);
        notifier("Erreur réseau lors de la connexion à la banque.", { type: 'erreur' });
        zoneAction.innerHTML = boutonOriginal;
    }
};

// ================= MOYENS DE PAIEMENT (cartes enregistrées) =================
const ENDPOINT_MOYENS_PAIEMENT = "https://us-central1-novaly-a80f7.cloudfunctions.net/moyensPaiement";

window.chargerMoyensPaiement = async function() {
    const container = document.getElementById('payment-methods-list');
    if (!container) return;

    const user = auth.currentUser;
    if (!user) {
        container.innerHTML = '<p style="color:#888;font-size:13px;">Connectez-vous pour voir vos cartes.</p>';
        return;
    }
    container.innerHTML = '<p style="color:#888;font-size:13px;">Chargement…</p>';

    try {
        const idToken = await user.getIdToken();
        const reponse = await fetch(`${ENDPOINT_MOYENS_PAIEMENT}?action=list`, {
            method: "GET",
            headers: { "Authorization": `Bearer ${idToken}` }
        });
        const data = await reponse.json();

        if (!data.success) {
            container.innerHTML = `<p style="color:#ff6b6b;font-size:13px;">${esc(data.error || 'Erreur')}</p>`;
            return;
        }
        if (!data.cartes || data.cartes.length === 0) {
            container.innerHTML = '<p style="color:#888;font-size:13px;">Aucune carte enregistrée.</p>';
            return;
        }

        container.innerHTML = data.cartes.map(c => `
            <div style="display:flex;justify-content:space-between;align-items:center;background:#222;border:1px solid #444;border-radius:8px;padding:15px 20px;flex-wrap:wrap;gap:10px;">
                <div style="display:flex;align-items:center;gap:12px;">
                    <span style="text-transform:uppercase;font-weight:bold;">${esc(c.marque)}</span>
                    <span style="color:#aaa;">•••• ${esc(c.dernier4)}</span>
                    <span style="color:#888;font-size:12px;">Exp. ${esc(String(c.mois).padStart(2, '0'))}/${esc(c.annee)}</span>
                </div>
                <button class="btn" onclick="supprimerCarte('${esc(c.id)}')" style="background:transparent;color:#ff6b6b;border:1px solid #ff6b6b;padding:6px 12px;">Supprimer</button>
            </div>
        `).join('');
    } catch (e) {
        console.error(e);
        container.innerHTML = '<p style="color:#ff6b6b;font-size:13px;">Erreur réseau.</p>';
    }
};

window.ajouterCarte = async function() {
    const user = auth.currentUser;
    if (!user) {
        notifier("Veuillez vous connecter.", { type: 'erreur' });
        return;
    }
    try {
        const idToken = await user.getIdToken();
        const reponse = await fetch(ENDPOINT_MOYENS_PAIEMENT, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${idToken}` },
            body: JSON.stringify({ action: "add" })
        });
        const data = await reponse.json();

        if (data.url) {
            try {
                await window.__TAURI__.core.invoke("plugin:opener|open_url", { url: data.url });
            } catch (err) {
                window.location.href = data.url; // Plan B
            }
            notifier("Enregistrez votre carte dans la fenêtre Stripe, puis revenez ici.");
        } else {
            notifier(data.error || "Impossible d'ouvrir la page d'ajout de carte.", { type: 'erreur' });
        }
    } catch (e) {
        console.error(e);
        notifier("Erreur réseau.", { type: 'erreur' });
    }
};

window.supprimerCarte = async function(paymentMethodId) {
    const user = auth.currentUser;
    if (!user) return;
    if (!confirm("Supprimer cette carte ?")) return;

    try {
        const idToken = await user.getIdToken();
        const reponse = await fetch(ENDPOINT_MOYENS_PAIEMENT, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${idToken}` },
            body: JSON.stringify({ action: "delete", paymentMethodId })
        });
        const data = await reponse.json();

        if (data.success) {
            notifier("Carte supprimée.", { type: 'succes' });
            chargerMoyensPaiement();
        } else {
            notifier(data.error || "Suppression impossible.", { type: 'erreur' });
        }
    } catch (e) {
        console.error(e);
        notifier("Erreur réseau.", { type: 'erreur' });
    }
};

// ================= CODE D'ACTIVATION =================
const ENDPOINT_UTILISER_CODE = "https://us-central1-novaly-a80f7.cloudfunctions.net/utiliserCode";

window.utiliserCode = async function() {
    const user = auth.currentUser;
    if (!user) {
        notifier("Veuillez vous connecter.", { type: 'erreur' });
        return;
    }
    const input = document.getElementById('code-input');
    const code = input ? input.value.trim() : '';
    if (!code) {
        notifier("Saisissez un code.", { type: 'erreur' });
        return;
    }

    try {
        const idToken = await user.getIdToken();
        const reponse = await fetch(ENDPOINT_UTILISER_CODE, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${idToken}` },
            body: JSON.stringify({ code })
        });
        const data = await reponse.json();

        if (data.success) {
            notifier(`Code validé : « ${data.titre} » ajouté à votre bibliothèque !`, { type: 'succes' });
            if (input) input.value = '';
            // Met à jour la bibliothèque en mémoire + rafraîchit l'affichage
            window.mesJeux = window.mesJeux || [];
            if (!window.mesJeux.includes(data.gameId)) window.mesJeux.push(data.gameId);
            if (typeof actualiserBibliotheque === 'function') actualiserBibliotheque();
        } else {
            notifier(data.error || "Code invalide.", { type: 'erreur' });
        }
    } catch (e) {
        console.error(e);
        notifier("Erreur réseau.", { type: 'erreur' });
    }
};

// ================= CHANGEMENT DE MOT DE PASSE =================
window.changerMotDePasse = async function() {
    const user = auth.currentUser;
    const msg = document.getElementById('pwd-msg');
    const show = (texte, ok) => {
        if (!msg) return;
        msg.style.display = 'block';
        msg.style.color = ok ? '#2ecc71' : '#ff6b6b';
        msg.innerText = texte;
    };

    if (!user || !user.email) { show("Vous devez être connecté.", false); return; }

    const actuel = document.getElementById('pwd-current').value;
    const nouveau = document.getElementById('pwd-new').value;
    const confirme = document.getElementById('pwd-confirm').value;

    if (!actuel || !nouveau || !confirme) { show("Remplissez tous les champs.", false); return; }
    if (nouveau.length < 6) { show("Le nouveau mot de passe doit faire au moins 6 caractères.", false); return; }
    if (nouveau !== confirme) { show("Les deux nouveaux mots de passe ne correspondent pas.", false); return; }

    try {
        // Ré-authentification obligatoire avant un changement sensible
        const credential = EmailAuthProvider.credential(user.email, actuel);
        await reauthenticateWithCredential(user, credential);
        await updatePassword(user, nouveau);

        // La ré-authentification ouvre une nouvelle session : avec l'A2F, il faut
        // la valider par un code (la page de connexion s'en charge).
        if ((await getDoc(doc(db, "a2f_actif", user.uid))).exists()) {
            notifier("Mot de passe mis à jour. Confirmez avec le code reçu par e-mail.", { type: 'succes' });
            setTimeout(() => { window.location.href = 'login.html'; }, 1500);
            return;
        }

        show("Mot de passe mis à jour.", true);
        document.getElementById('pwd-current').value = '';
        document.getElementById('pwd-new').value = '';
        document.getElementById('pwd-confirm').value = '';
    } catch (e) {
        console.error(e);
        if (e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential') {
            show("Mot de passe actuel incorrect.", false);
        } else if (e.code === 'auth/weak-password') {
            show("Nouveau mot de passe trop faible.", false);
        } else if (e.code === 'auth/requires-recent-login') {
            show("Reconnectez-vous puis réessayez.", false);
        } else {
            show("Erreur : " + (e.message || e.code), false);
        }
    }
};

// ================= 2FA E-MAIL (onglet Sécurité) =================
const ENDPOINT_ENVOYER_CODE_2FA = "https://us-central1-novaly-a80f7.cloudfunctions.net/envoyerCode2FA";
const ENDPOINT_VERIFIER_CODE_2FA = "https://us-central1-novaly-a80f7.cloudfunctions.net/verifierCode2FA";

// L'état de référence est a2f_actif/{uid} = {email, app} (écrit seulement par le serveur).
window.charger2faEmailState = async function() {
    const user = auth.currentUser;
    if (!user) return;
    try {
        const snap = await getDoc(doc(db, "a2f_actif", user.uid));
        const d = snap.exists() ? snap.data() : {};
        const etat = { 'btn-2fa-email': d.email === true || d.methode === 'email', 'btn-2fa-app': d.app === true };
        for (const [id, on] of Object.entries(etat)) {
            const btn = document.getElementById(id);
            if (!btn) continue;
            btn.dataset.state = on ? 'on' : 'off';
            btn.innerText = on ? 'Désactiver' : 'Activer';
            btn.style.background = on ? '#ff6b6b' : '#0984e3';
        }
    } catch (e) { /* lecture best-effort */ }
};

// ================= A2F PAR APPLICATION (TOTP) =================
const ENDPOINT_A2F_APP = "https://us-central1-novaly-a80f7.cloudfunctions.net/a2fApp";

async function appelA2fApp(corps) {
    const r = await fetch(ENDPOINT_A2F_APP, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${await auth.currentUser.getIdToken()}` },
        body: JSON.stringify(corps)
    });
    return r.json().catch(() => ({ error: "Réponse invalide du serveur." }));
}

window.fermer2faAppBox = function() {
    document.getElementById('twofa-app-box').style.display = 'none';
    document.getElementById('twofa-app-code').value = '';
};

// Activer : QR code à scanner. Désactiver : demande un code (application ou secours).
window.toggle2faApp = async function() {
    const btn = document.getElementById('btn-2fa-app');
    const box = document.getElementById('twofa-app-box');
    if (!auth.currentUser || !btn) return;
    const enabling = btn.dataset.state !== 'on';
    box.dataset.action = enabling ? 'enable' : 'disable';
    document.getElementById('twofa-app-qr-zone').style.display = enabling ? 'block' : 'none';
    document.getElementById('twofa-app-consigne').innerText = enabling
        ? "Scannez le QR code avec votre application, puis saisissez le code à 6 chiffres affiché."
        : "Pour désactiver, saisissez un code de votre application (ou un code de secours).";
    if (enabling) {
        btn.disabled = true;
        try {
            const d = await appelA2fApp({ action: 'setup' });
            if (!d.success) { notifier(d.error || "Configuration impossible.", { type: 'erreur' }); return; }
            document.getElementById('twofa-app-qr').src = d.qr;
            document.getElementById('twofa-app-secret').innerText = d.secret.replace(/(.{4})/g, '$1 ').trim();
        } catch (e) {
            notifier("Erreur réseau.", { type: 'erreur' }); return;
        } finally { btn.disabled = false; }
    }
    box.style.display = 'flex';
    document.getElementById('twofa-app-code').focus();
};

window.valider2faApp = async function() {
    const box = document.getElementById('twofa-app-box');
    const code = document.getElementById('twofa-app-code').value.trim();
    const enabling = box.dataset.action === 'enable';
    if (enabling ? !/^\d{6}$/.test(code) : !/^(\d{6}|[A-Za-z0-9]{4}-?[A-Za-z0-9]{4})$/.test(code)) {
        notifier(enabling ? "Le code contient 6 chiffres." : "Code de l'application (6 chiffres) ou code de secours attendu.", { type: 'erreur' });
        return;
    }
    try {
        const d = await appelA2fApp({ action: enabling ? 'enable' : 'disable', code });
        if (!d.success) { notifier(d.error || "Code incorrect.", { type: 'erreur' }); return; }
        fermer2faAppBox();
        if (enabling) {
            document.getElementById('twofa-app-secours-liste').innerText = d.codesSecours.join('\n');
            document.getElementById('twofa-app-secours').style.display = 'block';
            notifier("Application d'authentification activée.", { type: 'succes' });
        } else {
            notifier("Application d'authentification désactivée.", { type: 'succes' });
        }
    } catch (e) {
        notifier("Erreur réseau.", { type: 'erreur' });
    } finally {
        charger2faEmailState();
    }
};

window.copierCodesSecours = async function() {
    try {
        await navigator.clipboard.writeText(document.getElementById('twofa-app-secours-liste').innerText);
        notifier("Codes copiés.", { type: 'succes' });
    } catch (e) { notifier("Copie impossible : sélectionnez-les à la main.", { type: 'erreur' }); }
};

// Alerte laissée par la page de connexion (ex. peu de codes de secours restants).
try {
    const alerte = localStorage.getItem('a2f_alerte');
    if (alerte) { localStorage.removeItem('a2f_alerte'); setTimeout(() => notifier(alerte, { duree: 0 }), 1500); }
} catch (e) { /* stockage indisponible */ }

window.fermer2faEmailBox = function() {
    const box = document.getElementById('twofa-email-box');
    if (box) box.style.display = 'none';
    document.getElementById('twofa-email-code').value = '';
};

// Étape 1 : envoi du code par e-mail, puis affichage du champ de saisie.
window.toggle2faEmail = async function() {
    const btn = document.getElementById('btn-2fa-email');
    const user = auth.currentUser;
    if (!btn || !user) return;
    const enabling = btn.dataset.state !== 'on';

    if (!enabling && !(await confirmer("Désactiver la vérification par e-mail ?", { confirmer: "Désactiver", danger: true }))) return;

    btn.disabled = true;
    try {
        const idToken = await user.getIdToken();
        const envoi = await fetch(ENDPOINT_ENVOYER_CODE_2FA, {
            method: "POST", headers: { "Authorization": `Bearer ${idToken}` }
        });
        const envoiData = await envoi.json();
        // 429 = un code envoyé il y a moins d'une minute est toujours valable
        if (!envoiData.success && envoi.status !== 429) {
            notifier(envoiData.error || "Envoi du code impossible.", { type: 'erreur' });
            return;
        }
        if (envoiData.error) notifier(envoiData.error);
        const box = document.getElementById('twofa-email-box');
        box.dataset.action = enabling ? 'enable' : 'disable';
        box.style.display = 'flex';
        document.getElementById('twofa-email-code').focus();
    } catch (e) {
        console.error(e);
        notifier("Erreur réseau.", { type: 'erreur' });
    } finally {
        btn.disabled = false;
    }
};

// Étape 2 : vérification du code + activation/désactivation côté serveur.
window.valider2faEmail = async function() {
    const user = auth.currentUser;
    const box = document.getElementById('twofa-email-box');
    const code = document.getElementById('twofa-email-code').value.trim();
    if (!user || !box) return;
    if (!/^\d{6}$/.test(code)) {
        notifier("Le code contient 6 chiffres.", { type: 'erreur' });
        return;
    }
    const enabling = box.dataset.action === 'enable';
    try {
        const idToken = await user.getIdToken();
        const verif = await fetch(ENDPOINT_VERIFIER_CODE_2FA, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${idToken}` },
            body: JSON.stringify({ code, action: enabling ? 'enable' : 'disable' })
        });
        const verifData = await verif.json();
        if (verifData.success) {
            fermer2faEmailBox();
            notifier(enabling ? "Vérification par e-mail activée." : "Vérification par e-mail désactivée.", { type: 'succes' });
        } else {
            notifier(verifData.error || "Code incorrect.", { type: 'erreur' });
        }
    } catch (e) {
        console.error(e);
        notifier("Erreur réseau.", { type: 'erreur' });
    } finally {
        charger2faEmailState();
    }
};

// Le prix affiché vient du champ "prix" (en euros) du jeu dans Firestore : c'est le même que celui facturé par le serveur
function libelleBoutonAchat(gameData) {
    if (window.libelleAchat) return window.libelleAchat(gameData);
    const prix = Number(gameData.prix);
    if (!prix) return "Obtenir (Gratuit)";
    return `Acheter (${esc(prix.toFixed(2).replace('.', ','))} €)`;
}

// Système du joueur : 'mac', 'win' ou 'linux'. C'est le suffixe des champs Firestore du jeu
// (executable_mac, executable_win, executable_linux ; downloadUrl_mac, downloadUrl_win, downloadUrl_linux).
async function systemeJoueur() {
    const osName = await window.__TAURI__.os.type();
    if (osName === "macos" || osName === "Darwin") return 'mac';
    if (osName === "linux" || osName === "Linux") return 'linux';
    return 'win';
}
const NOMS_SYSTEMES = { mac: 'macOS', win: 'Windows', linux: 'Linux' };

// --- 1. FONCTION AFFICHER PAGE JEU (Gère OS + Version) ---
window.afficherPageJeu = async function(gameId) {
    navigateTo('#jeu', 'game-detail');
    document.getElementById('detail-title').innerText = "Chargement...";
    const zoneAction = document.getElementById('detail-action-zone');
    zoneAction.innerHTML = `<button class="btn" disabled>Patientez...</button>`;

    try {
        const gameSnap = await getDoc(doc(db, "games", gameId));
        if (!gameSnap.exists()) return zoneAction.innerHTML = `<button class="btn" disabled>Introuvable</button>`;
        const gameData = gameSnap.data();

        document.getElementById('detail-title').innerText = gameData.titre;
        document.getElementById('detail-desc').innerText = gameData.description_courte || "Un jeu incroyable disponible sur Novaly.";
        document.getElementById('detail-banner').style.background = `linear-gradient(rgba(0,0,0,0.1), rgba(0,0,0,0.9)), url('${cssUrlBrut(gameData.coverUrl)}') center/cover`;

        const possede = window.mesJeux && window.mesJeux.includes(gameId);

        if (!possede) {
            zoneAction.innerHTML = `<button class="btn" style="background: #ffffff; color: #000; width: 100%; font-size: 16px; padding: 15px;" onclick="acheterJeu(${jsArg(gameId)})">${libelleBoutonAchat(gameData)}</button>`;
        } else {
            const { exists } = window.__TAURI__.fs;
            const { join } = window.__TAURI__.path;
            const { type } = window.__TAURI__.os;

            const systeme = await systemeJoueur();
            const exeKey = "executable_" + systeme;
            const savedPath = localStorage.getItem('install_path_' + gameId);
            const savedVersion = localStorage.getItem('version_' + gameId);

            let estInstalle = false;
            let cheminExecutable = "";

            if (savedPath && gameData[exeKey]) {
                cheminExecutable = await join(savedPath, gameData[exeKey]);
                estInstalle = await exists(cheminExecutable);

                // --- AJOUTS DE DEBUG POUR COMPRENDRE LE BLOCAGE ---
                console.log("Dossier d'installation sauvegardé :", savedPath);
                console.log("Nom de l'exécutable attendu :", gameData[exeKey]);
                console.log("Chemin complet testé par le launcher :", cheminExecutable);
                console.log("Le fichier existe-t-il vraiment à cet endroit ? :", estInstalle);
                // --------------------------------------------------
            } else {
                console.log("Il manque soit le chemin sauvegardé, soit le champ", exeKey, "dans Firebase.");
            }

            if (!gameData[exeKey]) {
                // Pas encore de version de ce jeu pour le système du joueur
                zoneAction.innerHTML = `<button class="btn" disabled style="background: #333; color: #888; width: 100%; font-size: 16px; padding: 15px; cursor: not-allowed;">Pas encore disponible sur ${NOMS_SYSTEMES[systeme]}</button>`;
            }
            else if (!estInstalle) {
                // TÉLÉCHARGER
                zoneAction.innerHTML = `<button class="btn" style="background: #0984e3; color: white; width: 100%; font-size: 16px; padding: 15px;" onclick="telechargerJeu(${jsArg(gameId)})">Télécharger</button>`;
            }
            else if (gameData.version && savedVersion !== gameData.version) {
                // METTRE À JOUR (La version Firebase est différente de la version locale)
                zoneAction.innerHTML = `<button class="btn" style="background: #eccc68; color: black; width: 100%; font-size: 16px; padding: 15px;" onclick="telechargerJeu(${jsArg(gameId)})">Mettre à jour (v${esc(gameData.version)})</button>`;
            } 
            else {
                // JOUER
                zoneAction.innerHTML = `
                    <div style="position: relative; display: flex; gap: 10px; width: 100%;">
                        <button class="btn" style="background: #4cd137; color: black; flex-grow: 1; font-size: 16px; padding: 15px;" onclick="lancerJeuInstalle(${jsArg(cheminExecutable)}, ${jsArg(gameId)}, ${jsArg(gameData.titre)})">► Jouer</button>
                        <button class="btn" style="background: transparent; color: white; border: 1px solid #555; padding: 0 20px; font-size: 18px; font-weight: bold;" onclick="event.stopPropagation(); document.getElementById('game-options-menu').classList.toggle('show')">...</button>
                        <div id="game-options-menu" class="user-dropdown" style="top: 110%; right: 0; width: 200px; z-index: 100;">
                            <div class="dropdown-item" style="color: #ff4757;" onclick="desinstallerJeu(${jsArg(gameId)})">Désinstaller</div>
                        </div>
                    </div>`;
            }
        }
        // Boutons boutique, contrôle parental et avis : APRÈS le bouton principal.
        if (window.boutiqueSurPageJeu) window.boutiqueSurPageJeu(gameId, gameData, possede);
    } catch (error) {
        console.error(error);
    }
};

// Variable globale pour empêcher de télécharger deux fois le même jeu en même temps
window.activeDownloads = {};

window.telechargerJeu = async function(gameId) {
    if (window.activeDownloads[gameId]) {
        notifier("Ce jeu est déjà en cours de téléchargement !", { type: 'erreur' });
        return;
    }

    let selectedFolder = localStorage.getItem('novaly_default_install_path');
    if (!selectedFolder) {
        selectedFolder = await window.__TAURI__.core.invoke('plugin:dialog|open', {
            options: { directory: true, multiple: false, title: "Choisissez un dossier d'installation (1ère fois)" }
        });
        if (!selectedFolder) return;
        localStorage.setItem('novaly_default_install_path', selectedFolder);
        afficherAlerte("Dossier d'installation enregistré. Vous pourrez le modifier dans les paramètres.");
    }

    try {
        window.activeDownloads[gameId] = true;
        const gameData = (await getDoc(doc(db, "games", gameId))).data();

        const zoneAction = document.getElementById('detail-action-zone');
        if (zoneAction) {
            zoneAction.innerHTML = `<button class="btn" disabled style="background: #333; color: white; width: 100%; font-size: 16px; padding: 15px;">Téléchargement en arrière-plan...</button>`;
        }

        const globalList = document.getElementById('global-dl-list');
        const badge = document.getElementById('global-dl-percent');

        badge.style.display = 'inline-block';
        badge.innerText = '0%';
        if (globalList.innerHTML.includes('Aucun téléchargement')) globalList.innerHTML = '';

        const dlItemId = 'dl-item-' + gameId;
        globalList.innerHTML += `
            <div id="${dlItemId}" style="background: #222; padding: 10px; border-radius: 6px; margin-bottom: 10px; border: 1px solid #444;">
                <div style="font-size: 11px; color: white; font-weight: bold; margin-bottom: 5px;">${esc(gameData.titre)}</div>
                <div style="display: flex; justify-content: space-between; font-size: 10px; color: #aaa; margin-bottom: 5px;">
                    <span id="status-${gameId}">Téléchargement...</span>
                    <span id="percent-${gameId}">0%</span>
                </div>
                <div style="width: 100%; background: #111; height: 6px; border-radius: 3px; overflow: hidden;">
                    <div id="bar-${gameId}" style="width: 0%; height: 100%; background: #0984e3; transition: width 0.2s;"></div>
                </div>
            </div>
        `;

        const { join } = window.__TAURI__.path;
        const { mkdir, remove, exists } = window.__TAURI__.fs;
        const { Command } = window.__TAURI__.shell;
        const { type } = window.__TAURI__.os;

        const systeme = await systemeJoueur();
        // Les liens de téléchargement sont dans games/{id}/fichiers/telechargement, lisible
        // uniquement par les joueurs qui possèdent le jeu (anciens champs gardés en secours).
        let liens = gameData;
        const fichiersSnap = await getDoc(doc(db, "games", gameId, "fichiers", "telechargement"));
        if (fichiersSnap.exists()) liens = fichiersSnap.data();
        const dlUrl = liens['downloadUrl_' + systeme];
        if (!/^https:\/\//.test(dlUrl || "")) throw new Error("Lien de téléchargement invalide");

        const dossierDuJeu = await join(selectedFolder, gameId);
        const cheminZip = await join(selectedFolder, `${gameId}.zip`);
        await mkdir(dossierDuJeu, { recursive: true });

        // NOUVEAU : Le "-C -" permet de reprendre le téléchargement là où il s'est arrêté !
        const curlCmd = Command.create('curl', ['-#', '-L', '--proto', '=https', '--proto-redir', '=https', '-C', '-', '-o', cheminZip, dlUrl]);

        curlCmd.on('stderr', line => {
            const matches = line.match(/(\d+(?:\.\d+)?)%/g);
            if (matches) {
                const pct = matches[matches.length - 1];
                const bar = document.getElementById(`bar-${gameId}`);
                const percentTxt = document.getElementById(`percent-${gameId}`);
                if (bar) bar.style.width = pct;
                if (percentTxt) percentTxt.innerText = pct;
                if (badge) badge.innerText = pct;
            }
        });
        await curlCmd.execute();

        const statusTxt = document.getElementById(`status-${gameId}`);
        const bar = document.getElementById(`bar-${gameId}`);
        if (statusTxt) statusTxt.innerText = "Extraction...";
        if (bar) { bar.style.background = "#eccc68"; bar.style.width = "100%"; }
        if (badge) badge.innerText = "EXT";

        // Mac et Linux : unzip ; Windows : tar (fourni avec Windows 10+, sait lire les .zip)
        const unzipArgs = systeme !== 'win' ? ['-o', cheminZip, '-d', dossierDuJeu] : ['-xf', cheminZip, '-C', dossierDuJeu];
        const unzipCmdName = systeme !== 'win' ? 'unzip' : 'tar';

        const unzipCmd = Command.create(unzipCmdName, unzipArgs);
        await unzipCmd.execute();

        // On supprime le .zip uniquement quand tout s'est bien passé
        try { await remove(cheminZip); } catch(e) {}

        localStorage.setItem('install_path_' + gameId, dossierDuJeu);
        localStorage.setItem('version_' + gameId, gameData.version || "1.0.0");

        delete window.activeDownloads[gameId];
        const dlItem = document.getElementById(dlItemId);
        if (dlItem) dlItem.remove();

        if (globalList.innerHTML.trim() === '') {
            globalList.innerHTML = '<p style="font-size: 11px; color: #666; font-style: italic; margin: 0;">Aucun téléchargement actif.</p>';
            badge.style.display = 'none';
        }

        notifier(`${gameData.titre} est installé et prêt à jouer !`, { type: 'succes', icone: 'rocket' });

        const currentTitle = document.getElementById('detail-title').innerText;
        if (window.currentViewId === 'game-detail' && currentTitle === gameData.titre) {
            window.afficherPageJeu(gameId);
        }

    } catch (err) {
        console.error("Erreur de téléchargement :", err);
        delete window.activeDownloads[gameId];
        notifier("Téléchargement interrompu. Cliquez sur Télécharger pour reprendre.", { type: 'erreur', icone: 'pause' });

        // NOUVEAU : Nettoyage uniquement du dossier corrompu, on garde le .zip
        try {
            const { remove, exists } = window.__TAURI__.fs;
            const { join } = window.__TAURI__.path;
            let selectedFolder = localStorage.getItem('novaly_default_install_path');

            if (selectedFolder) {
                const dossierDuJeu = await join(selectedFolder, gameId);
                if (await exists(dossierDuJeu)) {
                    await remove(dossierDuJeu, { recursive: true });
                }
            }
        } catch (cleanupErr) { console.error("Erreur de nettoyage :", cleanupErr); }

        const dlItem = document.getElementById('dl-item-' + gameId);
        if (dlItem) dlItem.remove();

        const globalList = document.getElementById('global-dl-list');
        const badge = document.getElementById('global-dl-percent');
        if (globalList && globalList.innerHTML.trim() === '') {
            globalList.innerHTML = '<p style="font-size: 11px; color: #666; font-style: italic; margin: 0;">Aucun téléchargement actif.</p>';
            if (badge) badge.style.display = 'none';
        }

        if (window.currentViewId === 'game-detail') {
            window.afficherPageJeu(gameId); 
        }
    }
};

// On ajoute gameId et gameTitle dans les paramètres pour que le compteur sache quoi traquer !
window.lancerJeuInstalle = async function(cheminExec, gameId, gameTitle) {
    // 1. On lance le chrono et on met à jour le statut Firebase
    window.demarrerSessionJeu(gameId, gameTitle);

    // 2. On change visuellement le bouton pour permettre de quitter
    const actionZone = document.getElementById('detail-action-zone');
    if (actionZone) {
        actionZone.innerHTML = `
            <button class="btn" style="background: #ff4757; color: white; border: none; padding: 12px 25px; font-weight: bold; border-radius: 6px;" onclick="signalerFinDeJeu(${jsArg(gameId)})">
                ${icone('square')} Terminer la session
            </button>
            <p style="color: #aaa; font-size: 11px; margin-top: 10px;">Le jeu tourne en arrière-plan. Cliquez ici quand vous avez fini pour sauvegarder votre temps.</p>
        `;
    }

    // 3. Lancement physique du jeu sur l'OS
    try {
        const { type } = window.__TAURI__.os;
        const systeme = await systemeJoueur();

        if (systeme === 'mac') {
            const { Command } = window.__TAURI__.shell;
            const openCmd = Command.create('open', [cheminExec]);
            await openCmd.execute();
        } else if (systeme === 'linux') {
            // Commande du launcher (src-tauri/src/lib.rs) : rend le fichier exécutable puis le lance
            await window.__TAURI__.core.invoke('lancer_jeu', { chemin: cheminExec });
        } else {
            await window.__TAURI__.core.invoke('plugin:opener|open_path', { path: cheminExec });
        }
    } catch(e) {
        afficherAlerte("Fichier introuvable. Le launcher cherche ici :\n" + cheminExec);
    }
};

// --- NOUVELLE FONCTION ---
window.signalerFinDeJeu = async function(gameId) {
    // On arrête le chrono, on calcule les minutes et on repasse le profil "En ligne"
    await window.terminerSessionJeu();

    // On recharge l'interface de la page pour remettre le bouton "► Jouer"
    if (window.afficherPageJeu) {
        window.afficherPageJeu(gameId);
    }
};

window.desinstallerJeu = async function(gameId) {
    if (!(await confirmer("Désinstaller ce jeu et supprimer tous ses fichiers ?", { confirmer: "Désinstaller", danger: true }))) return;

    const zoneAction = document.getElementById('detail-action-zone');
    zoneAction.innerHTML = `<button class="btn" disabled style="background: #333; color: #aaa; width: 100%; padding: 15px; font-size: 16px;">Désinstallation en cours...</button>`;

    try {
        const { remove } = window.__TAURI__.fs;
        const savedPath = localStorage.getItem('install_path_' + gameId);

        if (savedPath) await remove(savedPath, { recursive: true });

        localStorage.removeItem('install_path_' + gameId);
        window.afficherPageJeu(gameId);

    } catch (err) {
        console.error("Erreur de désinstallation:", err);
        notifier("Impossible de supprimer certains fichiers.", { type: 'erreur' });
        window.afficherPageJeu(gameId); 
    }
};
window.ouvrirParametres = async function() {
    const currentPath = localStorage.getItem('novaly_default_install_path') || "Aucun dossier sélectionné";

    let modal = document.getElementById('settings-modal');
    if (!modal) {
        document.body.insertAdjacentHTML('beforeend', `
            <div id="settings-modal" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); z-index:9999; display:flex; justify-content:center; align-items:center; backdrop-filter: blur(5px);">
                <div style="background:#1a1a1a; padding:30px; border-radius:12px; width:450px; border:1px solid #333; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
                    <h2 style="margin-top:0; font-size:20px; border-bottom:1px solid #333; padding-bottom:15px;">Paramètres du Launcher</h2>

                    <p style="color:#aaa; font-size:12px; font-weight:bold; text-transform:uppercase; margin-top:20px;">Dossier d'installation par défaut :</p>
                    <div style="background:#000; padding:12px; font-size:12px; margin-bottom:15px; border-radius:6px; word-break:break-all; color:#4cd137;" id="settings-install-path">${esc(currentPath)}</div>

                    <div style="display: flex; gap: 10px; margin-top: 20px;">
                        <button class="btn" style="background:#0984e3; color:white; flex:1;" onclick="choisirDossierDefaut()">Modifier le dossier</button>
                        <button class="btn" style="background:#333; color:white; flex:1;" onclick="document.getElementById('settings-modal').style.display='none'">Fermer</button>
                    </div>
                </div>
            </div>
        `);
    } else {
        document.getElementById('settings-install-path').innerText = currentPath;
        modal.style.display = 'flex';
    }
};

window.choisirDossierDefaut = async function() {
    const selectedFolder = await window.__TAURI__.core.invoke('plugin:dialog|open', {
        options: { directory: true, multiple: false, title: "Dossier d'installation principal" }
    });
    if (selectedFolder) {
        localStorage.setItem('novaly_default_install_path', selectedFolder);
        document.getElementById('settings-install-path').innerText = selectedFolder;
        notifier("Dossier principal mis à jour !", { type: 'succes' });
    }
};
// ================= SYSTÈME DE SUCCÈS =================
window.debloquerSucces = async function(succesId, titre, description) {
    const user = auth.currentUser;
    if (!user) return;

    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
        const dejaObtenu = (userSnap.data().succes || []).some(s => s.id === succesId);
        if (dejaObtenu) return; // Ne pas redébloquer
    }

    // Sauvegarde dans Firestore
    await setDoc(userRef, {
        succes: arrayUnion({
            id: succesId,
            titre: titre,
            description: description,
            date: new Date().toLocaleDateString()
        })
    }, { merge: true });

    // Notification en haut de l'écran
    notifier(description, { type: 'trophee', titre: `Succès débloqué : ${titre}` });
};
// ================= GESTION DE LA CONNEXION INTERNET (HORS-LIGNE) =================
window.addEventListener('offline', () => {
    // Si on perd internet, on affiche une grosse alerte rouge qui bloque le haut
    let offlineBanner = document.getElementById('offline-banner');
    if (!offlineBanner) {
        document.body.insertAdjacentHTML('afterbegin', `
            <div id="offline-banner" style="position: fixed; top: 32px; left: 0; width: 100%; background: #ff4757; color: white; text-align: center; padding: 10px; font-weight: bold; font-size: 12px; z-index: 9998; box-shadow: 0 4px 10px rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center; gap: 10px;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 2l20 20M8.5 8.5a5 5 0 0 0-5 5M16 16a5 5 0 0 1-5 5M12 20a8 8 0 0 1-8-8M20 12a8 8 0 0 0-8-8"></path></svg>
                Vous êtes hors-ligne. Vérifiez votre connexion Internet. Certaines fonctionnalités sont désactivées.
            </div>
        `);
    } else {
        offlineBanner.style.display = 'flex';
    }

    // On repasse le statut Firebase en "Hors-ligne" si on peut avant la coupure totale
    if (auth.currentUser) {
        setDoc(doc(db, "users", auth.currentUser.uid), { isOnline: false }, { merge: true }).catch(()=>{});
    }
});

window.addEventListener('online', () => {
    // 1. Quand internet revient, on cache immédiatement le bandeau rouge
    const offlineBanner = document.getElementById('offline-banner');
    if (offlineBanner) {
        offlineBanner.style.display = 'none';
    }

    // 2. On crée et on affiche le bandeau vert
    let onlineBanner = document.getElementById('online-banner');
    if (!onlineBanner) {
        document.body.insertAdjacentHTML('afterbegin', `
            <div id="online-banner" style="position: fixed; top: 32px; left: 0; width: 100%; background: #4cd137; color: black; text-align: center; padding: 10px; font-weight: bold; font-size: 12px; z-index: 9998; box-shadow: 0 4px 10px rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center; gap: 10px; transition: opacity 0.3s ease;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                Vous êtes à nouveau connecté.
            </div>
        `);
        onlineBanner = document.getElementById('online-banner');
    } else {
        onlineBanner.style.display = 'flex';
        onlineBanner.style.opacity = '1';
    }

    // 3. On le fait disparaître doucement après 3 secondes
    setTimeout(() => {
        if (onlineBanner) {
            onlineBanner.style.opacity = '0';
            setTimeout(() => { onlineBanner.style.display = 'none'; }, 300); // Laisse le temps à l'animation de se finir
        }
    }, 3000);

    // 4. On repasse le joueur en ligne sur Firebase
    if (auth.currentUser) {
        setDoc(doc(db, "users", auth.currentUser.uid), { isOnline: true }, { merge: true }).catch(()=>{});
    }
});

// ================= LIENS novaly:// (site web, retour après paiement) =================
// novaly://game/<id>     -> page du jeu
// novaly://bibliotheque  -> bibliothèque
function ouvrirLienNovaly(url) {
    let lien;
    try { lien = new URL(url); } catch (e) { return; }
    if (lien.protocol !== 'novaly:') return;
    const section = lien.host;
    // Retour de la connexion Google : traité par la page de connexion
    if (section === 'auth-google') {
        if (!localStorage.getItem('google_nonce')) return;   // déjà traité : pas de boucle
        sessionStorage.setItem('lien_google', url);
        window.location.href = 'login.html';
        return;
    }
    const valeur = decodeURIComponent(lien.pathname.replace(/^\/+/, ''));
    if (section === 'game' && /^[\w-]{1,100}$/.test(valeur)) {
        window.afficherPageJeu(valeur);
    } else if (section === 'bibliotheque') {
        navigateTo('#bibliotheque', 'library');
    }
}

if (window.__TAURI__ && window.__TAURI__.deepLink) {
    const { getCurrent, onOpenUrl } = window.__TAURI__.deepLink;
    // Lien qui a lancé le launcher, puis liens reçus pendant qu'il est ouvert
    getCurrent().then(urls => (urls || []).forEach(ouvrirLienNovaly)).catch(() => {});
    onOpenUrl(urls => urls.forEach(ouvrirLienNovaly)).catch(() => {});
}

// ================= FORMULAIRE « NOUS CONTACTER » =================
// Envoyé à contact@novaly-store.fr par la Cloud Function envoyerContact.
const ENDPOINT_CONTACT = "https://us-central1-novaly-a80f7.cloudfunctions.net/envoyerContact";

// Champ e-mail seulement pour les visiteurs non connectés (sinon : e-mail du compte).
onAuthStateChanged(auth, (u) => {
    const g = document.getElementById('contact-email-group');
    if (g) g.style.display = (u && !u.isAnonymous) ? 'none' : 'block';
});

window.envoyerContact = async function() {
    const btn = document.getElementById('contact-btn');
    const msg = document.getElementById('contact-msg');
    const show = (texte, ok) => {
        msg.style.display = 'block';
        msg.style.color = ok ? '#2ecc71' : '#ff6b6b';
        msg.innerText = texte;
    };
    const sujet = document.getElementById('contact-sujet').value.trim();
    const message = document.getElementById('contact-message').value.trim();
    const email = document.getElementById('contact-email').value.trim();
    const user = auth.currentUser && !auth.currentUser.isAnonymous ? auth.currentUser : null;

    if (!sujet || message.length < 10) { show("Indiquez un sujet et un message (10 caractères minimum).", false); return; }
    if (!user && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { show("Indiquez une adresse e-mail valide pour recevoir la réponse.", false); return; }

    btn.disabled = true;
    const texteBtn = btn.innerText;
    btn.innerText = "Envoi…";
    try {
        const headers = { "Content-Type": "application/json" };
        if (user) headers["Authorization"] = `Bearer ${await user.getIdToken()}`;
        const r = await fetch(ENDPOINT_CONTACT, {
            method: "POST", headers,
            body: JSON.stringify({ sujet, message, email, site: document.getElementById('contact-site').value })
        });
        const d = await r.json().catch(() => ({}));
        if (d.success) {
            show("Message envoyé ✓ Nous vous répondrons par e-mail.", true);
            document.getElementById('contact-sujet').value = '';
            document.getElementById('contact-message').value = '';
        } else {
            show(d.error || "Envoi impossible pour le moment.", false);
        }
    } catch (e) {
        show("Erreur réseau, réessayez.", false);
    } finally {
        btn.disabled = false;
        btn.innerText = texteBtn;
    }
};
