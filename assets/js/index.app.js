import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getAuth, updateProfile, onAuthStateChanged, signOut, deleteUser, EmailAuthProvider, reauthenticateWithCredential } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
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

// Données personnelles : jamais dans users/{uid} (lisible par tous les joueurs connectés),
// mais dans users/{uid}/private/profil (lisible uniquement par le propriétaire).
const CHAMPS_PRIVES = ['prenom', 'nom', 'adresse1', 'adresse2', 'ville', 'region', 'zip', 'country',
    'paymentCardLast4', 'a2f_app', 'a2f_email', 'linked_steam', 'linked_discord'];
const privateDocRef = (uid) => doc(db, "users", uid, "private", "profil");

window.currentAvatarFile = null;
window.currentAvatarDataUrl = null;
window.mesJeux = [];

// --- COMPTEURS GLOBAUX ---
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

            const docSnap = await getDoc(userDocRef);

            if (docSnap.exists()) {
                const privSnap = await getDoc(privateDocRef(user.uid));
                const data = { ...docSnap.data(), ...(privSnap.exists() ? privSnap.data() : {}) };

                // Migration : les anciennes données perso du profil public vont dans le document privé
                const publiques = docSnap.data();
                const aDeplacer = {}, suppression = {};
                CHAMPS_PRIVES.forEach(champ => {
                    if (champ in publiques) { aDeplacer[champ] = publiques[champ]; suppression[champ] = deleteField(); }
                });
                if (Object.keys(suppression).length > 0) {
                    setDoc(privateDocRef(user.uid), aDeplacer, { merge: true })
                        .then(() => setDoc(userDocRef, suppression, { merge: true }))
                        .catch(e => console.error("Migration des données privées :", e));
                }

                window.mesJeux = data.jeuxPossedes || [];
                window.mesJeux.forEach(gameId => {
                    let btn = document.getElementById('btn-add-' + gameId);
                    if(btn) {
                        btn.innerText = "Dans la bibliothèque";
                        btn.disabled = true;
                        btn.style.background = "#2a2a2a";
                        btn.style.color = "#888";
                    }
                });
                if(window.actualiserBibliotheque) window.actualiserBibliotheque();

                if (data.avatarUrl) {
                    document.getElementById('nav-avatar').innerText = "";
                    document.getElementById('nav-avatar').style.backgroundImage = `url(${data.avatarUrl})`;
                    document.getElementById('profile-avatar-preview').innerText = "";
                    document.getElementById('profile-avatar-preview').style.backgroundImage = `url(${data.avatarUrl})`;
                }

                const titleVal = data.titre || "NOVICE";
                if(document.getElementById('profile-title')) document.getElementById('profile-title').value = titleVal;
                if(document.getElementById('nav-title')) document.getElementById('nav-title').innerText = titleVal;

                if(document.getElementById('profile-firstname')) document.getElementById('profile-firstname').value = data.prenom || "";
                if(document.getElementById('profile-lastname')) document.getElementById('profile-lastname').value = data.nom || "";
                if(document.getElementById('profile-address1')) document.getElementById('profile-address1').value = data.adresse1 || "";
                if(document.getElementById('profile-address2')) document.getElementById('profile-address2').value = data.adresse2 || "";
                if(document.getElementById('profile-city')) document.getElementById('profile-city').value = data.ville || "";
                if(document.getElementById('profile-region')) document.getElementById('profile-region').value = data.region || "";
                if(document.getElementById('profile-zip')) document.getElementById('profile-zip').value = data.zip || "";
                if(document.getElementById('profile-country')) document.getElementById('profile-country').value = data.country || "";

                if (data.paymentCardLast4) {
                    document.getElementById('add-card-btn').style.display = 'none';
                    document.getElementById('saved-cards-list').style.display = 'block';
                    document.getElementById('card-last4').innerText = data.paymentCardLast4;
                }

                if (data.a2f_app) {
                    const btn = document.getElementById('btn-a2f-app');
                    if(btn) {
                        btn.innerText = "Désactiver";
                        btn.style.background = "transparent";
                        btn.style.color = "#ff4757";
                        btn.style.border = "1px solid #ff4757";
                    }
                }
                if (data.a2f_email) {
                    const btn = document.getElementById('btn-a2f-email');
                    if(btn) {
                        btn.innerText = "Désactiver";
                        btn.style.background = "transparent";
                        btn.style.color = "#ff4757";
                        btn.style.border = "1px solid #ff4757";
                    }
                }
            }
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

        // CHARGEMENT ET TRI DES AMIS (EN LIGNE / HORS LIGNE)
        const friendsRef = collection(db, "users", user.uid, "friends");
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
                if (hasUnread) totalUnread++;
                const badgeUnread = hasUnread ? `<span style="background: #ff4757; color: white; font-size: 9px; padding: 2px 5px; border-radius: 10px; font-weight: bold; margin-left: auto; box-shadow: 0 0 5px rgba(255,71,87,0.5);">NOUVEAU</span>` : '';

                const itemHtml = `
                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px; padding: 4px; opacity: ${isOnline ? '1' : '0.5'}; cursor: pointer; border-radius: 4px; transition: background 0.2s;" onmouseover="this.style.background='#222'" onmouseout="this.style.background='transparent'" onclick="ouvrirChat(${jsArg(friendId)}, ${jsArg(friendLink.pseudo)})">
                    <div style="width: 7px; height: 7px; background: ${isOnline ? '#4cd137' : '#555'}; border-radius: 50%; ${isOnline ? 'box-shadow: 0 0 5px #4cd137;' : ''}"></div>
                    <span style="font-size: 13px; color: ${isOnline ? '#eee' : '#777'}; font-weight: 500;">${friendLink.pseudo}</span>
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
        if (loggedOutView) loggedOutView.style.display = 'block';
        if (loggedInView) loggedInView.style.display = 'none';
        if (friendsMenuContainer) friendsMenuContainer.style.display = 'none'; 
    }
});

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

            // ID prévisible "expediteur_destinataire" : vérifié par les règles Firestore
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

        // Écriture atomique AVANT la suppression de la demande (vérifiée par les règles Firestore)
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
        // Alerte supprimée pour éviter le pop-up indésirable
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
                titre: newTitle,
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

window.toggleA2F = async function(type) {
    const btnId = type === 'app' ? 'btn-a2f-app' : 'btn-a2f-email';
    const btn = document.getElementById(btnId);
    const msg = document.getElementById('a2f-msg');
    const userDocRef = privateDocRef(auth.currentUser.uid);

    if (btn.innerText === "Activer") {
        btn.innerText = "Désactiver";
        btn.style.background = "transparent";
        btn.style.color = "#ff4757";
        btn.style.border = "1px solid #ff4757";
        msg.innerText = "Sécurité A2F activée avec succès !";
        await setDoc(userDocRef, { ["a2f_" + type]: true }, { merge: true });
    } else {
        btn.innerText = "Activer";
        btn.style.background = "#4cd137";
        btn.style.color = "black";
        btn.style.border = "none";
        msg.innerText = "Sécurité A2F désactivée.";
        await setDoc(userDocRef, { ["a2f_" + type]: false }, { merge: true });
    }
    msg.style.display = "block";
    setTimeout(() => msg.style.display = "none", 3000);
};

window.saveFakeCard = async function() {
    const cardNum = document.getElementById('fake-card-num').value;
    if (cardNum.length < 16) {
        afficherAlerte("Veuillez entrer une fausse carte à 16 chiffres.");
        return;
    }
    const last4 = cardNum.substring(12, 16);

    document.getElementById('stripe-modal').style.display = 'none';
    document.getElementById('add-card-btn').style.display = 'none';
    document.getElementById('saved-cards-list').style.display = 'block';
    document.getElementById('card-last4').innerText = last4;

    const userDocRef = privateDocRef(auth.currentUser.uid);
    await setDoc(userDocRef, { paymentCardLast4: last4 }, { merge: true });
};

window.removeCard = async function() {
    if(confirm("Supprimer ce moyen de paiement ?")) {
        document.getElementById('saved-cards-list').style.display = 'none';
        document.getElementById('add-card-btn').style.display = 'block';
        document.getElementById('fake-card-num').value = "";

        const userDocRef = privateDocRef(auth.currentUser.uid);
        await setDoc(userDocRef, { paymentCardLast4: null }, { merge: true });
    }
};

window.linkAccount = async function(platform) {
    const btnId = "link-" + platform + "-btn";
    const btn = document.getElementById(btnId);
    const msg = document.getElementById('link-msg');
    const userDocRef = privateDocRef(auth.currentUser.uid);

    if (btn.innerText === "Associer") {
        let popup = window.open("", "Connexion", "width=500,height=600");
        popup.document.write(`<div style="font-family:sans-serif;text-align:center;margin-top:50px;"><h2>Connexion à ${platform.toUpperCase()}</h2><p>Veuillez patienter pendant l'autorisation sécurisée...</p></div>`);

        setTimeout(async () => {
            popup.close();
            btn.innerText = "Dissocier";
            btn.style.background = "#ff4757";
            btn.style.color = "white";
            msg.innerText = `Compte ${platform.toUpperCase()} associé avec succès !`;
            msg.style.display = "block";

            await setDoc(userDocRef, { ["linked_" + platform]: true }, { merge: true });
            setTimeout(() => msg.style.display = "none", 3000);
        }, 2000);
    } else {
        btn.innerText = "Associer";
        btn.style.background = "#fff";
        btn.style.color = "black";
        await setDoc(userDocRef, { ["linked_" + platform]: false }, { merge: true });
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

// ================= GESTION DES JEUX ONLINE =================
window.currentGameSelected = "";

window.lancerJeu = function(jeuId) {
    window.currentGameSelected = jeuId;
    const titles = { 'imposteur': 'The Imposteur', 'nolimite': 'Nolimite' };
    document.getElementById('lobby-game-title').innerText = titles[jeuId];
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

window.quitterJeu = function() {
    if(confirm("Êtes-vous sûr de vouloir quitter le jeu en cours ?")) {
        document.getElementById('game-container').style.display = 'none';
        document.getElementById('game-frame').src = '';
        navigateTo('#magasin', 'store');
    }
};

window.ajouterALaBibliotheque = async function(gameId, btnElement) {
    if (!auth.currentUser) {
        afficherAlerte("Vous devez être connecté !");
        return;
    }
    if (window.mesJeux.includes(gameId)) {
        afficherAlerte("Vous possédez déjà ce jeu !");
        return;
    }

    // Seuls les jeux gratuits peuvent être ajoutés ici (vérifié par les règles Firestore)
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

window.actualiserBibliotheque = function() {
    const biblioView = document.getElementById('view-library');
    if (!biblioView) return;
    if (window.mesJeux.length === 0) {
        biblioView.innerHTML = `
            <div class="generic-view-content">
                <h2>Votre bibliothèque est vide</h2>
                <p>Les jeux que vous achèterez apparaîtront ici.</p>
            </div>`;
        return;
    }

    let html = `<h2 style="font-size: 18px; margin-bottom: 20px;">Vos Jeux</h2><div class="grid">`;
    if (window.mesJeux.includes('imposteur')) {
        html += `<div class="game-card" onclick="lancerJeu('imposteur')">
                    <div class="game-cover" style="background: linear-gradient(135deg, #2c3e50, #000); display: flex; align-items: center; justify-content: center;">
                        <img src="https://cdn.jsdelivr.net/npm/lucide-static@0.321.0/icons/detective.svg" style="width: 64px; height: 64px; filter: invert(1); opacity: 0.5;">
                    </div>
                    <div class="game-title">The Imposteur</div>
                    <div class="game-price" style="background:#4cd137; color:#000;">Prêt à jouer</div>
                 </div>`;
    }
    if (window.mesJeux.includes('nolimite')) {
        html += `<div class="game-card" onclick="lancerJeu('nolimite')">
                    <div class="game-cover" style="background: url('assets/img/cover-nolimite.png') center/cover; display: flex; align-items: center; justify-content: center;"></div>
                    <div class="game-title">Nolimite</div>
                    <div class="game-price" style="background:#4cd137; color:#000;">Prêt à jouer</div>
                 </div>`;
    }
    html += `</div>`;
    biblioView.innerHTML = html;
};

// ================= GESTION DU CHAT =================

window.activeChatId = null;
window.currentFriendId = null; 
let chatUnsubscribe = null;

function formatChatDate(timestamp) {
    if (!timestamp) return "";
    const date = new Date(timestamp);
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

        snap.forEach(docSnap => {
            const msg = docSnap.data();
            const msgId = docSnap.id;
            const isMe = msg.senderId === auth.currentUser.uid;

            const dateStr = formatChatDate(msg.timestamp);
            if (dateStr !== lastDateStr) {
                box.innerHTML += `<div style="text-align: center; color: #666; font-size: 10px; margin: 15px 0 5px 0; font-weight: 800; text-transform: uppercase; letter-spacing: 1px;">${dateStr}</div>`;
                lastDateStr = dateStr;
            }

            const timeStr = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'}) : '';

            if (!isMe && msg.status !== 'read') {
                setDoc(doc(db, "chats", chatId, "messages", msgId), { status: 'read' }, { merge: true });
            }

            let statusHtml = '';
            if (isMe) {
                if (msg.status === 'read') {
                    statusHtml = `<span style="color: #4cd137; font-size: 10px; margin-left: 4px; font-weight: bold;">✓✓</span>`;
                } else {
                    statusHtml = `<span style="color: #888; font-size: 10px; margin-left: 4px; font-weight: bold;">✓</span>`;
                }
            }

            box.innerHTML += `
                <div style="align-self: ${isMe ? 'flex-end' : 'flex-start'}; max-width: 80%; display: flex; flex-direction: column;">
                    <div style="background: ${isMe ? '#0984e3' : '#2a2a2a'}; padding: 8px 12px; border-radius: 12px; color: white; word-wrap: break-word; box-shadow: 0 2px 5px rgba(0,0,0,0.3);">
                        ${esc(msg.text)}
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

window.envoyerMessage = async function() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text || !window.activeChatId || !window.currentFriendId) return;

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
// ================= GESTION DU DEEP LINK VERS LE LAUNCHER =================
window.ouvrirNovaly = function(idDuJeu) {
    // Tente d'ouvrir le launcher avec l'ID du jeu
    const lienApp = `novaly://game/${idDuJeu}`;
    const lienDownload = "telecharger.html"; // Ta page de téléchargement existante
    let appOuverte = false;

    // Si la fenêtre perd le focus, ça veut dire que le launcher s'est ouvert par-dessus
    const blurHandler = () => { appOuverte = true; };
    window.addEventListener('blur', blurHandler);

    // Lancement de la requête d'ouverture
    window.location.href = lienApp;

    // Si après 2 secondes le navigateur a toujours le focus, le launcher n'est pas installé
    setTimeout(() => {
        window.removeEventListener('blur', blurHandler);
        if (!appOuverte && !document.hidden) {
            window.location.href = lienDownload;
        }
    }, 2000);
};
