import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, updateDoc, onSnapshot, deleteDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

        // ---------------- SÉCURITÉ : ANTI-XSS ----------------
        // Les pseudos, avatars et réponses viennent des autres joueurs : on les échappe toujours
        // avant de les insérer dans du HTML (le jeu tourne dans le launcher, une injection serait grave).
        const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        const jsArg = (v) => esc(JSON.stringify(String(v ?? '')));
        const cssUrl = (v) => esc(String(v ?? '').replace(/['"()\\\s]/g, c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')));

const firebaseConfig = {
    apiKey: "AIzaSyBfM8rodwJivN1vW8Vt9WJRvELIPxozvBg",
    authDomain: "novaly-a80f7.firebaseapp.com",
    projectId: "novaly-a80f7",
    storageBucket: "novaly-a80f7.firebasestorage.app",
    messagingSenderId: "58102958990",
    appId: "1:58102958990:web:6bdc2d3f049015fd0672df"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ── STATE ──────────────────────────────────────────────────────
let myUid = null, isHost = false, currentRoomId = null;
let myHand = [], listePhrases = [], listeMots = [];
let timerInterval = null, timerSeconds = 30;
let unsubscribeRoom = null;
let lastRoomData = null;
let cardFlipped = {};  // track which judge cards have been flipped

window.monAvatar = "";
window.monPseudo = "Joueur";
window.carteSelectionnee = null;

// ── AUTH ───────────────────────────────────────────────────────
onAuthStateChanged(auth, (user) => {
    if (user) {
        myUid = user.uid;
        // Try to get display name from parent Novaly launcher
        const parentUser = (() => { try { return window.parent?.firebase?.auth?.()?.currentUser; } catch(e) { return null; } })();
        const displayName = user.displayName || parentUser?.displayName || "Joueur";
        window.monPseudo = displayName;
        const inp = document.getElementById('input-pseudo');
        if (inp) inp.value = displayName;
        const av = document.getElementById('avatar-preview');
        if (av) av.innerText = displayName.charAt(0).toUpperCase();
    } else {
        signInAnonymously(auth).then(res => { myUid = res.user.uid; }).catch(e => showError("Erreur auth : " + e.message));
    }
});

// ── LOAD TXT FILES ─────────────────────────────────────────────
async function chargerFichiers() {
    try {
        const [p, w] = await Promise.all([fetch('nolimite-prop.txt'), fetch('nolimite-word.txt')]);
        if (!p.ok || !w.ok) throw new Error("Fichiers introuvables");
        listePhrases = (await p.text()).split('\n').map(l => l.trim()).filter(Boolean);
        listeMots = (await w.text()).split('\n').map(l => l.trim()).filter(Boolean);
    } catch {
        listePhrases = [
            "Le secret de la productivité c'est _________.",
            "Mon ex m'a quitté(e) à cause de _________.",
            "Ce qui m'empêche de dormir la nuit : _________.",
            "La nouvelle fonctionnalité d'iPhone : _________.",
            "_________ : interdit dans 42 pays."
        ];
        listeMots = [
            "Un crocodile en costume", "L'odeur de mamie", "Un bug de Firebase",
            "Mon chat qui me juge", "Une baguette de pain", "Le WiFi gratuit",
            "L'ancienne flamme", "Un algorithme déprimé", "La dette technique",
            "Un manager en télétravail", "Le gluten", "Les réseaux sociaux",
            "Une notification à 3h du matin", "Un stagiaire non payé", "La vérité"
        ];
    }
}
chargerFichiers();

// ── AVATAR PREVIEW ─────────────────────────────────────────────
document.getElementById('avatar-file-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    window.monAvatar = url;
    const av = document.getElementById('avatar-preview');
    av.style.backgroundImage = `url(${url})`;
    av.style.backgroundSize = 'cover';
    av.innerText = "";
});

// ── COPY ROOM CODE ─────────────────────────────────────────────
window.copyRoomCode = function() {
    const code = document.getElementById('display-room-code').innerText;
    navigator.clipboard?.writeText(code).then(() => {
        const el = document.querySelector('.copy-hint');
        if (el) { el.innerHTML = icone('check') + ' Copié !'; setTimeout(() => el.innerText = 'Appuyez pour copier', 1500); }
    });
};

// ── HELPER: current player info ────────────────────────────────
function playerInfo() {
    const pseudo = document.getElementById('input-pseudo').value.trim() || window.monPseudo || "Joueur";
    window.monPseudo = pseudo;
    return { uid: myUid, pseudo, avatar: window.monAvatar, score: 0 };
}

function genCode() {
    return Array.from({ length: 4 }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[Math.floor(Math.random() * 36)]).join('');
}

function showError(msg) {
    const el = document.getElementById('setup-error');
    el.innerText = msg; el.style.display = 'block';
    setTimeout(() => el.style.display = 'none', 4000);
}

function piocherCarte() {
    return listeMots[Math.floor(Math.random() * listeMots.length)];
}

function piocherQuestion() {
    return listePhrases[Math.floor(Math.random() * listePhrases.length)];
}

// ── CREATE ROOM ────────────────────────────────────────────────
window.creerSalon = async function() {
    if (!myUid) return showError("Connexion en cours, réessayez...");
    const p = playerInfo();
    currentRoomId = genCode();
    isHost = true;

    const scoreLimit = parseInt(document.getElementById('score-limit-input')?.value || '9');

    const data = {
        code: currentRoomId, status: 'waiting', host: myUid,
        players: { [myUid]: p }, playerList: [myUid],
        currentJudgeIndex: 0, blackCard: "", submissions: {},
        reactions: {}, roundNumber: 0,
        scoreLimit: scoreLimit,
        createdAt: serverTimestamp()
    };
    try {
        await setDoc(doc(db, "nolimite_rooms", currentRoomId), data);
        goToWaitingRoom(currentRoomId);
        subscribeRoom(currentRoomId);
    } catch (e) {
        showError("Erreur Firebase : " + e.message);
    }
};

// ── JOIN ROOM ──────────────────────────────────────────────────
window.rejoindreSalon = async function() {
    if (!myUid) return showError("Connexion en cours, réessayez...");
    const code = document.getElementById('join-code').value.trim().toUpperCase();
    if (code.length !== 4) return showError("Code invalide (4 caractères).");

    const roomRef = doc(db, "nolimite_rooms", code);
    const snap = await getDoc(roomRef);
    if (!snap.exists()) return showError("Salon introuvable.");
    const d = snap.data();
    if (d.status !== 'waiting') return showError("Cette partie a déjà commencé.");

    currentRoomId = code;
    isHost = false;
    const p = playerInfo();
    const players = { ...d.players, [myUid]: p };
    const playerList = d.playerList.includes(myUid) ? d.playerList : [...d.playerList, myUid];

    await updateDoc(roomRef, { players, playerList });
    goToWaitingRoom(currentRoomId);
    subscribeRoom(currentRoomId);
};

function goToWaitingRoom(code) {
    document.getElementById('setup-screen').style.display = 'none';
    document.getElementById('waiting-room-screen').style.display = 'flex';
    document.getElementById('display-room-code').innerText = code;
    if (isHost) document.getElementById('host-config').style.display = 'block';
}

// ── KICK PLAYER ────────────────────────────────────────────────
window.kickPlayer = async function(uid) {
    if (!isHost || uid === myUid) return;
    const roomRef = doc(db, "nolimite_rooms", currentRoomId);
    const snap = await getDoc(roomRef);
    if (!snap.exists()) return;
    const d = snap.data();
    const players = { ...d.players };
    delete players[uid];
    const playerList = d.playerList.filter(id => id !== uid);
    await updateDoc(roomRef, { players, playerList });
};

// ── REALTIME SUBSCRIPTION ──────────────────────────────────────
function subscribeRoom(roomId) {
    if (unsubscribeRoom) unsubscribeRoom();
    document.getElementById('reconnect-banner').style.display = 'none';

    unsubscribeRoom = onSnapshot(doc(db, "nolimite_rooms", roomId),
        (snap) => {
            document.getElementById('reconnect-banner').style.display = 'none';
            if (!snap.exists()) {
                window.afficherNotification("Salon fermé", "L'hôte a mis fin à la partie.");
                return;
            }
            lastRoomData = snap.data();
            handleRoomUpdate(lastRoomData);
        },
        (err) => {
            console.error("Snapshot error:", err);
            document.getElementById('reconnect-banner').style.display = 'block';
            // Auto-retry after 3s
            setTimeout(() => subscribeRoom(roomId), 3000);
        }
    );
}

// ── MAIN STATE HANDLER ─────────────────────────────────────────
function handleRoomUpdate(data) {
    if (data.status === 'waiting') renderWaiting(data);
    else if (data.status === 'playing') renderGame(data);
    else if (data.status === 'ended') renderEndScreen(data);
}

// ── WAITING ROOM RENDER ────────────────────────────────────────
function renderWaiting(data) {
    const nb = data.playerList.length;
    document.getElementById('player-count').innerText = `${nb} / 8 joueur(s)`;

    const listEl = document.getElementById('waiting-players-list');
    listEl.innerHTML = '';
    data.playerList.forEach(uid => {
        const p = data.players[uid];
        if (!p) return;
        const avatarStyle = p.avatar ? `background-image:url(${cssUrl(p.avatar)});background-size:cover;font-size:0;` : '';
        const kickBtn = (isHost && uid !== myUid) ? `<button class="kick-btn" onclick="kickPlayer(${jsArg(uid)})" title="Expulser">${icone('x')}</button>` : '';
        listEl.innerHTML += `
            <div class="waiting-player">
                ${kickBtn}
                <div class="avatar" style="${avatarStyle}">${p.avatar ? '' : esc(p.pseudo.charAt(0).toUpperCase())}</div>
                <div style="font-size: 11px; font-weight: bold; overflow: hidden; text-overflow: ellipsis; max-width: 100%; text-align:center;">${esc(p.pseudo)}</div>
                ${uid === data.host ? '<div style="font-size:9px;color:#f1c40f;font-weight:900;">HÔTE</div>' : ''}
            </div>`;
    });

    const btn = document.getElementById('btn-start-game');
    if (isHost) {
        btn.disabled = nb < 2;
        btn.innerText = nb >= 2 ? `Lancer la partie (${nb} joueurs)` : 'Il manque des joueurs...';
    }
}

// ── GAME RENDER ────────────────────────────────────────────────
function renderGame(data) {
    document.getElementById('waiting-room-screen').style.display = 'none';
    document.getElementById('game-screen').style.display = 'flex';

    renderScoreboard(data);

    // Question
    document.getElementById('question-text').innerText = data.blackCard || "Chargement...";
    document.getElementById('header-round').innerText = `Manche ${data.roundNumber || 1}`;
    document.getElementById('round-indicator').innerText = `Score cible : ${data.scoreLimit || 9} pts`;

    const judgeUid = data.playerList[data.currentJudgeIndex];
    const imJudge = myUid === judgeUid;
    const judgePseudo = data.players[judgeUid]?.pseudo || "Juge";
    const hasSubmitted = !!data.submissions[myUid];
    const expectedSubs = data.playerList.length - 1;
    const currentSubs = Object.keys(data.submissions).length;
    const allSubmitted = currentSubs >= expectedSubs;

    // Timer
    if (data.timerEnd && !imJudge && !hasSubmitted) {
        startClientTimer(data.timerEnd, 30);
    } else if (imJudge && allSubmitted) {
        stopTimer();
        startClientTimer(data.judgeTimerEnd || (Date.now() + 60000), 60);
    } else if (!hasSubmitted && !imJudge) {
        // No timer data yet — hide
    } else {
        stopTimer();
    }

    // Show reactions
    document.getElementById('reaction-bar').style.display = 'flex';

    // Handle incoming reactions
    if (data.reactions) {
        Object.entries(data.reactions).forEach(([key, r]) => {
            if (!window.shownReactions) window.shownReactions = {};
            if (!window.shownReactions[key]) {
                window.shownReactions[key] = true;
                showFloatingReaction(r.emoji, r.x, r.y);
            }
        });
    }

    if (imJudge) {
        renderJudgeView(data, allSubmitted, expectedSubs, currentSubs, judgePseudo);
    } else {
        renderPlayerView(data, hasSubmitted, judgePseudo);
    }
}

function renderJudgeView(data, allSubmitted, expectedSubs, currentSubs, judgePseudo) {
    document.getElementById('hand-area').style.display = 'none';
    document.getElementById('confirm-btn').style.display = 'none';
    document.getElementById('judge-area').style.display = 'flex';

    if (!allSubmitted) {
        const gs = document.getElementById('game-status');
        gs.innerText = `En attente des réponses (${currentSubs}/${expectedSubs})`;
        gs.style.color = '#e74c3c';
        stopTimer();
        document.getElementById('timer-wrap').style.display = 'none';
        document.getElementById('judge-area').innerHTML = `
            <div style="text-align:center; color:#666; padding: 20px;">
                <div style="font-size: 28px; margin-bottom: 10px;">${icone('hourglass')}</div>
                <p style="margin:0; font-size:13px;">Les joueurs choisissent leurs cartes...</p>
                <p style="margin:8px 0 0; font-size:11px; color:#555;">${currentSubs}/${expectedSubs} réponse(s) reçue(s)</p>
            </div>`;
    } else {
        document.getElementById('game-status').innerText = "Choisissez la meilleure carte !";
        document.getElementById('game-status').style.color = '#4cd137';

        const judgeArea = document.getElementById('judge-area');
        // Rebuild only if needed (avoid re-rendering on every snapshot)
        const existingCards = judgeArea.querySelectorAll('.white-card');
        if (existingCards.length !== Object.keys(data.submissions).length) {
            judgeArea.innerHTML = '';
            cardFlipped = {};
            const entries = Object.entries(data.submissions).sort(() => 0.5 - Math.random());
            entries.forEach(([uid, text]) => {
                const card = document.createElement('div');
                card.className = 'white-card card-back';
                card.dataset.uid = uid;
                card.dataset.text = text;
                card.onclick = function() {
                    if (!cardFlipped[uid]) {
                        // First click: flip card
                        cardFlipped[uid] = true;
                        card.classList.remove('card-back');
                        card.classList.add('card-flipped');
                        card.innerHTML = `<div style="flex-grow:1;">${esc(text)}</div><div class="card-footer-w">NOLIMITE</div>`;
                        card.onclick = function() { terminerManche(uid, text, lastRoomData); };
                    }
                };
                judgeArea.appendChild(card);
            });
        }
    }
}

function renderPlayerView(data, hasSubmitted, judgePseudo) {
    document.getElementById('judge-area').style.display = 'none';

    if (hasSubmitted) {
        document.getElementById('hand-area').style.display = 'none';
        document.getElementById('confirm-btn').style.display = 'none';
        stopTimer();
        document.getElementById('timer-wrap').style.display = 'none';
        document.getElementById('game-status').innerText = `${judgePseudo} choisit la meilleure carte...`;
        document.getElementById('game-status').style.color = '#f1c40f';
    } else {
        document.getElementById('hand-area').style.display = 'flex';
        document.getElementById('game-status').innerText = 'Choisissez une carte';
        document.getElementById('game-status').style.color = '#4cd137';
        remplirMain();
    }
}

// ── SCOREBOARD ─────────────────────────────────────────────────
function renderScoreboard(data) {
    const sb = document.getElementById('scoreboard');
    sb.innerHTML = '';
    const scoreLimit = data.scoreLimit || 9;

    data.playerList.forEach((uid, i) => {
        const p = data.players[uid];
        if (!p) return;
        const isJudge = i === data.currentJudgeIndex;
        const isMe = uid === myUid;
        const pct = Math.min(100, Math.round((p.score / scoreLimit) * 100));
        const avatarStyle = p.avatar ? `background-image:url(${cssUrl(p.avatar)});background-size:cover;font-size:0;` : '';
        const crownHtml = isJudge ? `<div class="crown">${icone('crown', 'ico-or')}</div>` : '';
        sb.innerHTML += `
            <div class="player-score-box active-player ${isJudge ? 'is-judge' : ''} ${isMe ? 'is-me' : ''}">
                ${crownHtml}
                <div class="avatar" style="${avatarStyle}">${p.avatar ? '' : esc(p.pseudo.charAt(0).toUpperCase())}</div>
                <div class="player-name">${esc(p.pseudo)}${isMe ? ' (toi)' : ''}</div>
                <div class="player-points">${esc(p.score)}/${scoreLimit}</div>
                <div class="score-bar-bg" style="width:55px;"><div class="score-bar" style="width:${pct}%;"></div></div>
            </div>`;
    });
}

// ── HAND ───────────────────────────────────────────────────────
function remplirMain() {
    const hand = document.getElementById('hand-area');
    // Keep existing cards if already rendered and selection ongoing
    if (hand.children.length > 0) return;

    if (myHand.length === 0) {
        myHand = Array.from({ length: 5 }, piocherCarte);
    }

    hand.innerHTML = '';
    myHand.forEach((texte, idx) => {
        const card = document.createElement('div');
        card.className = 'white-card';
        card.innerHTML = `<div style="flex-grow:1;">${esc(texte)}</div><div class="card-footer-w">NOLIMITE</div>`;
        card.onclick = () => selectCard(card, texte, idx);
        hand.appendChild(card);
    });

    // Ajouter carte custom (vide)
    const custom = document.createElement('div');
    custom.className = 'white-card custom-card';
    custom.innerHTML = `
        <textarea placeholder="Écris ta propre réponse..." maxlength="80" style="flex-grow:1;border:none;background:transparent;resize:none;font-family:inherit;font-size:12px;font-weight:700;outline:none;color:#000;"></textarea>
        <div class="card-footer-w">CUSTOM</div>`;
    custom.onclick = (e) => {
        e.stopPropagation();
        const ta = custom.querySelector('textarea');
        const val = ta.value.trim();
        if (!val) { ta.focus(); return; }
        selectCard(custom, val, -1);
    };
    hand.appendChild(custom);
}

function selectCard(card, texte, idx) {
    document.querySelectorAll('.white-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    window.carteSelectionnee = { text: texte, index: idx };
    document.getElementById('confirm-btn').style.display = 'block';
}

// ── SUBMIT CARD ────────────────────────────────────────────────
window.validerCarteFirebase = async function() {
    if (!window.carteSelectionnee) return;
    const { text, index } = window.carteSelectionnee;

    // Replace played card
    if (index >= 0) {
        myHand.splice(index, 1, piocherCarte());
    }
    window.carteSelectionnee = null;

    // Clear hand UI so it rebuilds fresh next round
    document.getElementById('hand-area').innerHTML = '';

    const roomRef = doc(db, "nolimite_rooms", currentRoomId);
    const snap = await getDoc(roomRef);
    if (!snap.exists()) return;
    const subs = { ...snap.data().submissions, [myUid]: text };
    await updateDoc(roomRef, { submissions: subs });

    stopTimer();
};

// ── END ROUND (JUDGE PICKS) ────────────────────────────────────
async function terminerManche(gagnantUid, winningText, data) {
    if (!isHost && data.host !== myUid) {
        // Non-host judges can still pick — host handles the update
        // But in our model any player can be judge, so we allow it
    }

    // Highlight winner card
    document.querySelectorAll('#judge-area .white-card').forEach(c => {
        if (c.dataset.uid === gagnantUid) {
            c.classList.add('card-winner');
        }
    });

    stopTimer();

    const gagnantPseudo = data.players[gagnantUid]?.pseudo || "Quelqu'un";
    window.afficherNotification("Manche terminée !", `La carte de ${gagnantPseudo} a été choisie :\n\n"${winningText}"`);

    // Update scores
    const players = JSON.parse(JSON.stringify(data.players));
    players[gagnantUid].score = (players[gagnantUid].score || 0) + 1;

    const scoreLimit = data.scoreLimit || 9;
    const roundNumber = (data.roundNumber || 1) + 1;

    // Check win condition
    if (players[gagnantUid].score >= scoreLimit) {
        await updateDoc(doc(db, "nolimite_rooms", currentRoomId), {
            players, status: 'ended', winnerId: gagnantUid
        });
        return;
    }

    // Next judge
    let nextJudgeIndex = (data.currentJudgeIndex + 1) % data.playerList.length;
    const newBlackCard = piocherQuestion();
    const now = Date.now();

    await updateDoc(doc(db, "nolimite_rooms", currentRoomId), {
        players,
        currentJudgeIndex: nextJudgeIndex,
        blackCard: newBlackCard,
        submissions: {},
        reactions: {},
        roundNumber,
        timerEnd: now + 30000,
        judgeTimerEnd: now + 90000
    });

    // Reset local state
    cardFlipped = {};
    window.carteSelectionnee = null;
}

// ── END SCREEN ─────────────────────────────────────────────────
function renderEndScreen(data) {
    document.getElementById('game-screen').style.display = 'none';
    document.getElementById('end-screen').style.display = 'flex';
    stopTimer();

    const sorted = data.playerList
        .map(uid => ({ uid, ...data.players[uid] }))
        .sort((a, b) => b.score - a.score);

    const winner = sorted[0];
    document.getElementById('winner-name').innerText = winner?.pseudo || '—';

    // Podium
    const podium = document.getElementById('podium');
    podium.innerHTML = '';
    const order = [sorted[1], sorted[0], sorted[2]]; // silver, gold, bronze visual order
    const classOrder = ['silver', 'gold', 'bronze'];
    const medailles = [icone('medal'), icone('medal'), icone('medal')]; // blanches sur les blocs colorés du podium

    order.forEach((p, i) => {
        if (!p) return;
        const step = document.createElement('div');
        step.className = 'podium-step';
        step.innerHTML = `
            <div class="avatar" style="width:50px;height:50px;${p.avatar ? `background-image:url(${cssUrl(p.avatar)});background-size:cover;font-size:0;` : ''}">${p.avatar ? '' : esc(p.pseudo?.charAt(0).toUpperCase())}</div>
            <div style="font-size:11px;font-weight:900;">${esc(p.pseudo)}</div>
            <div style="font-size:11px;color:#aaa;">${esc(p.score)} pts</div>
            <div class="podium-block ${classOrder[i]}">${medailles[i]}</div>`;
        podium.appendChild(step);
    });

    // Confetti
    launchConfetti();
}

function launchConfetti() {
    const container = document.getElementById('confetti-container');
    container.innerHTML = '';
    const colors = ['#8e44ad', '#f1c40f', '#e74c3c', '#3498db', '#2ecc71', '#e67e22'];
    for (let i = 0; i < 60; i++) {
        const piece = document.createElement('div');
        piece.className = 'confetti-piece';
        piece.style.cssText = `
            left: ${Math.random() * 100}%;
            top: ${-Math.random() * 20}%;
            background: ${colors[Math.floor(Math.random() * colors.length)]};
            border-radius: ${Math.random() > 0.5 ? '50%' : '0'};
            animation-duration: ${1.5 + Math.random() * 2}s;
            animation-delay: ${Math.random() * 1.5}s;
            transform: rotate(${Math.random() * 360}deg);
        `;
        container.appendChild(piece);
    }
}

// ── REJOIN GAME ────────────────────────────────────────────────
window.relancerPartie = function() {
    window.location.reload();
};

// ── TIMER ──────────────────────────────────────────────────────
function startClientTimer(endTimestamp, totalSeconds) {
    stopTimer();
    const circle = document.getElementById('timer-circle');
    const numberEl = document.getElementById('timer-number');
    const wrap = document.getElementById('timer-wrap');
    const circumference = 125.7;

    wrap.style.display = 'flex';

    timerInterval = setInterval(() => {
        const remaining = Math.max(0, Math.ceil((endTimestamp - Date.now()) / 1000));
        numberEl.innerText = remaining;
        const progress = remaining / totalSeconds;
        circle.style.strokeDashoffset = circumference * (1 - progress);

        if (remaining <= 10) {
            circle.classList.add('urgent');
            document.getElementById('timer-label').innerText = remaining === 0 ? 'Temps écoulé !' : 'urgent !';
        } else {
            circle.classList.remove('urgent');
            document.getElementById('timer-label').innerText = 'secondes';
        }
        if (remaining <= 0) stopTimer();
    }, 500);
}

function stopTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
}

// ── REACTIONS ──────────────────────────────────────────────────
window.sendReaction = async function(emoji) {
    if (!currentRoomId) return;
    const key = `${myUid}_${Date.now()}`;
    const roomRef = doc(db, "nolimite_rooms", currentRoomId);
    const reactions = { ...((lastRoomData?.reactions) || {}), [key]: { emoji, uid: myUid, x: 30 + Math.random() * 40, y: 60 + Math.random() * 20 } };
    // Keep only last 10 reactions
    const keys = Object.keys(reactions);
    if (keys.length > 10) delete reactions[keys[0]];
    await updateDoc(roomRef, { reactions });
};

const ICONES_REACTIONS = { rire: 'laugh', feu: 'flame', crane: 'skull', couronne: 'crown', beurk: 'thumbs-down' };
const ANCIENNES_REACTIONS = { '😂': 'rire', '🔥': 'feu', '💀': 'crane', '👑': 'couronne', '🤮': 'beurk' };

function showFloatingReaction(emoji, xPct, yPct) {
    const nom = ANCIENNES_REACTIONS[emoji] || emoji;
    if (!ICONES_REACTIONS[nom]) return; // réaction inconnue : ignorée
    const el = document.createElement('div');
    el.className = 'floating-reaction';
    el.innerHTML = icone(ICONES_REACTIONS[nom]);
    el.style.left = (xPct || 50) + '%';
    el.style.top = (yPct || 70) + '%';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2000);
}

// ── NOTIFICATIONS ──────────────────────────────────────────────
window.afficherNotification = function(titre, texte) {
    notifier(texte, { type: 'trophee', titre });
};

// ── START GAME (HOST) ──────────────────────────────────────────
window.demarrerLaPartieFirebase = async function() {
    if (!isHost) return;
    const scoreLimit = parseInt(document.getElementById('score-limit-input').value || '9');
    const newBlackCard = piocherQuestion();
    const now = Date.now();
    await updateDoc(doc(db, "nolimite_rooms", currentRoomId), {
        status: 'playing',
        blackCard: newBlackCard,
        submissions: {},
        reactions: {},
        roundNumber: 1,
        scoreLimit,
        timerEnd: now + 30000,
        judgeTimerEnd: now + 90000
    });
};
