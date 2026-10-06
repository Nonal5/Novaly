const {setGlobalOptions} = require("firebase-functions");
const {onRequest} = require("firebase-functions/https");
const {defineSecret} = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const Stripe = require("stripe");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const QRCode = require("qrcode");

admin.initializeApp();

// For cost control, you can set the maximum number of containers that can be
// running at the same time.
setGlobalOptions({maxInstances: 10});

// Les secrets ne sont JAMAIS écrits dans le code (le dépôt GitHub est public).
// Ils sont stockés dans Google Secret Manager :
//   firebase functions:secrets:set STRIPE_SECRET_KEY
//   firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
const stripeSecretKey = defineSecret("STRIPE_SECRET_KEY");
const stripeWebhookSecret = defineSecret("STRIPE_WEBHOOK_SECRET");

// Envoi des codes 2FA par e-mail (Zoho Mail EU). Les joueurs reçoivent les
// codes de SMTP_FROM. SMTP_USER = le compte Zoho qui se connecte :
// authentificator@ si c'est une vraie boîte, contact@ si c'est un alias.
//   firebase functions:secrets:set SMTP_USER   (compte Zoho)
//   firebase functions:secrets:set SMTP_PASS   (mot de passe appli Zoho)
const smtpUser = defineSecret("SMTP_USER");
const smtpPass = defineSecret("SMTP_PASS");
const SMTP_HOST = "smtp.zoho.eu";
const SMTP_PORT = 465;
const SMTP_FROM = "authentificator@novaly-store.fr";

// A2F : a2f_actif/{uid} existe si la vérification par e-mail est activée, et
// a2f_sessions/{uid}/ok/{auth_time} marque chaque connexion dont le code a été
// validé. auth_time (date de connexion signée par Firebase) identifie la
// session : un mot de passe volé ouvre une NOUVELLE session, non validée.
// Les règles Firestore appliquent le même verrou (voir a2fValide()).

/**
 * Indique si la session du jeton a franchi l'A2F (ou si l'A2F est désactivée).
 * @param {object} jeton Jeton Firebase décodé.
 * @return {Promise<boolean>} true si la session est autorisée.
 */
async function sessionA2FValidee(jeton) {
  const db = admin.firestore();
  const actif = await db.collection("a2f_actif").doc(jeton.uid).get();
  if (!actif.exists) return true;
  const ok = await db.collection("a2f_sessions").doc(jeton.uid)
      .collection("ok").doc(String(jeton.auth_time)).get();
  return ok.exists;
}

/**
 * Vérifie le jeton Firebase envoyé par le launcher (en-tête Authorization).
 * Par défaut, refuse aussi une session dont l'A2F n'a pas été validée.
 * @param {object} req Requête HTTP.
 * @param {object} [options] {ignorerA2F: true} pour les fonctions de l'A2F.
 * @return {Promise<object|null>} Le jeton décodé, ou null s'il est invalide.
 */
async function verifierJeton(req, options = {}) {
  const entete = req.get("Authorization") || "";
  const correspondance = entete.match(/^Bearer (.+)$/);
  if (!correspondance) return null;
  let jeton;
  try {
    jeton = await admin.auth().verifyIdToken(correspondance[1]);
  } catch (err) {
    return null;
  }
  if (!options.ignorerA2F && !(await sessionA2FValidee(jeton))) return null;
  return jeton;
}

/**
 * Retourne l'identifiant du client Stripe persistant du joueur, en le créant au
 * besoin et en le mémorisant dans users/{uid}.stripe_customer_id.
 * Nécessaire pour que les cartes enregistrées soient réutilisables d'un achat à
 * l'autre (une session invitée crée un client jetable à chaque fois).
 * @param {object} db Firestore.
 * @param {string} userId UID Firebase du joueur.
 * @param {string|undefined} email E-mail du joueur (pour le reçu Stripe).
 * @param {object} stripe Instance Stripe initialisée.
 * @return {Promise<string>} L'identifiant client Stripe (cus_...).
 */
async function getOrCreateStripeCustomer(db, userId, email, stripe) {
  const userRef = db.collection("users").doc(userId);
  const snap = await userRef.get();
  const existant = snap.exists ? snap.data().stripe_customer_id : null;

  if (existant) {
    try {
      const client = await stripe.customers.retrieve(existant);
      if (client && !client.deleted) return existant;
    } catch (err) {
      // Client absent côté Stripe (ex. clé de test réinitialisée) :
      // on en recrée un ci-dessous.
    }
  }

  const client = await stripe.customers.create({
    email: email || undefined,
    metadata: {firebaseUID: userId},
  });
  await userRef.set({stripe_customer_id: client.id}, {merge: true});
  return client.id;
}

/**
 * Erreur porteuse d'un code HTTP (pour remonter un statut d'une transaction).
 * @param {number} statut Code HTTP à renvoyer.
 * @param {string} message Message destiné à l'utilisateur.
 * @return {Error} L'erreur annotée.
 */
function httpError(statut, message) {
  return Object.assign(new Error(message), {statut});
}

/**
 * Empreinte d'un code 2FA (jamais stocké en clair), salée par l'UID.
 * @param {string} code Le code à 6 chiffres.
 * @param {string} uid UID du joueur.
 * @return {string} L'empreinte SHA-256.
 */
function hashCode2FA(code, uid) {
  return crypto.createHash("sha256").update(`${uid}:${code}`).digest("hex");
}

/**
 * Version HTML du mail de code (styles en ligne : seuls compris par les
 * messageries). Le code n'est fait que de chiffres : rien à échapper.
 * @param {string} code Le code à 6 chiffres.
 * @return {string} Le corps HTML du mail.
 */
function emailCodeHtml(code) {
  return `<!doctype html><html lang="fr"><body style="margin:0;padding:0;
background:#f4f4f7;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"
style="background:#f4f4f7;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"
style="max-width:460px;background:#ffffff;border-radius:14px;padding:32px">
<tr><td style="font-size:22px;font-weight:800;color:#111">Novaly</td></tr>
<tr><td style="padding-top:18px;font-size:15px;color:#333">
Voici votre code de vérification :</td></tr>
<tr><td align="center" style="padding:22px 0">
<div style="display:inline-block;font-size:34px;font-weight:800;
letter-spacing:10px;color:#111;background:#f1f1f5;border-radius:10px;
padding:14px 22px">${code}</div></td></tr>
<tr><td style="font-size:13px;color:#666;line-height:1.5">
Il expire dans 10 minutes.<br>Si vous n'êtes pas à l'origine de cette
demande, changez votre mot de passe : quelqu'un le connaît.</td></tr>
</table></td></tr></table></body></html>`;
}

// ---------- A2F : méthodes (e-mail, application TOTP, codes de secours) ----
// a2f_actif/{uid} = {email: bool, app: bool} ; le document n'existe que si au
// moins une méthode est active (c'est ce que testent les règles Firestore).
// a2f_totp/{uid} (serveur uniquement) : secret TOTP, secret en attente,
// dernier pas utilisé (anti-rejeu), échecs récents et codes de secours hachés.

/**
 * Méthodes A2F actives d'un joueur (gère l'ancien format {methode: "email"}).
 * @param {object} db Firestore.
 * @param {string} uid UID du joueur.
 * @return {Promise<{email: boolean, app: boolean}>} Les méthodes actives.
 */
async function methodesA2F(db, uid) {
  const snap = await db.collection("a2f_actif").doc(uid).get();
  if (!snap.exists) return {email: false, app: false};
  const d = snap.data();
  return {
    email: d.email === true || d.methode === "email",
    app: d.app === true,
  };
}

/**
 * Active / désactive une méthode et met à jour la session courante :
 * toutes les autres sessions devront de nouveau saisir un code.
 * @param {object} db Firestore.
 * @param {object} jeton Jeton Firebase décodé (uid + auth_time).
 * @param {object} changements Ex. {app: true}.
 * @return {Promise<object>} Les méthodes après changement.
 */
async function changerMethodesA2F(db, jeton, changements) {
  const m = {...(await methodesA2F(db, jeton.uid)), ...changements};
  const actifRef = db.collection("a2f_actif").doc(jeton.uid);
  const sessions = db.collection("a2f_sessions").doc(jeton.uid);
  await db.recursiveDelete(sessions);
  if (m.email || m.app) {
    await actifRef.set({email: m.email, app: m.app, depuis: Date.now()});
    await sessions.collection("ok").doc(String(jeton.auth_time))
        .set({validatedAt: Date.now()});
  } else {
    await actifRef.delete();
  }
  // Copie pour l'affichage uniquement ; la référence est a2f_actif.
  await db.collection("users").doc(jeton.uid).collection("private")
      .doc("profil").set({a2f_email: m.email, a2f_app: m.app}, {merge: true});
  return m;
}

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/**
 * Encode en base32 (RFC 4648, sans « = »), format des secrets TOTP.
 * @param {Buffer} buf Octets.
 * @return {string} Texte base32.
 */
function base32(buf) {
  let bits = "";
  for (const o of buf) bits += o.toString(2).padStart(8, "0");
  let out = "";
  for (let i = 0; i < bits.length; i += 5) {
    out += BASE32[parseInt(bits.slice(i, i + 5).padEnd(5, "0"), 2)];
  }
  return out;
}

/**
 * Décode un secret base32.
 * @param {string} txt Texte base32.
 * @return {Buffer} Octets.
 */
function deBase32(txt) {
  let bits = "";
  for (const c of txt.replace(/=+$/, "").toUpperCase()) {
    bits += BASE32.indexOf(c).toString(2).padStart(5, "0");
  }
  const out = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    out.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(out);
}

/**
 * Code TOTP (RFC 6238 : HMAC-SHA1, 6 chiffres, pas de 30 s).
 * @param {string} secret Secret base32.
 * @param {number} pas Numéro du pas de 30 s.
 * @return {string} Le code à 6 chiffres.
 */
function codeTOTP(secret, pas) {
  const b = Buffer.alloc(8);
  b.writeUInt32BE(Math.floor(pas / 0x100000000), 0);
  b.writeUInt32BE(pas >>> 0, 4);
  const h = crypto.createHmac("sha1", deBase32(secret)).update(b).digest();
  const o = h[h.length - 1] & 0xf;
  const n = (((h[o] & 0x7f) << 24) | (h[o + 1] << 16) |
    (h[o + 2] << 8) | h[o + 3]) % 1000000;
  return String(n).padStart(6, "0");
}

/**
 * Vérifie un code TOTP (±30 s de décalage d'horloge toléré).
 * @param {string} secret Secret base32.
 * @param {string} code Code saisi.
 * @param {number} dernierPas Dernier pas accepté (un code ne sert qu'une fois).
 * @return {number|null} Le pas accepté, ou null.
 */
function verifierTOTP(secret, code, dernierPas) {
  const maintenant = Math.floor(Date.now() / 30000);
  for (const d of [-1, 0, 1]) {
    const pas = maintenant + d;
    if (pas <= (dernierPas || 0)) continue;
    const attendu = Buffer.from(codeTOTP(secret, pas));
    const recu = Buffer.from(String(code));
    if (recu.length === attendu.length &&
        crypto.timingSafeEqual(recu, attendu)) return pas;
  }
  return null;
}

/**
 * Vérifie un code d'application ou de secours, avec limite d'échecs
 * (5 par tranche de 10 min) et usage unique, dans une transaction.
 * @param {object} db Firestore.
 * @param {string} uid UID du joueur.
 * @param {string} code Code saisi.
 * @param {string} methode "app" ou "secours".
 * @return {Promise<Array|null>} [statut, message] si refusé, sinon null.
 */
async function verifierCodeApp(db, uid, code, methode) {
  const ref = db.collection("a2f_totp").doc(uid);
  return db.runTransaction(async (t) => {
    const snap = await t.get(ref);
    if (!snap.exists || !snap.data().secret) {
      return [400, "Application d'authentification non configurée."];
    }
    const d = snap.data();
    const echecs = (d.echecs || []).filter((x) => Date.now() - x < 600000);
    if (echecs.length >= 5) {
      return [429, "Trop de tentatives. Réessayez dans 10 minutes."];
    }
    if (methode === "secours") {
      const h = hashCode2FA(code.toUpperCase().replace(/[^A-Z0-9]/g, ""), uid);
      if ((d.secours || []).includes(h)) {
        t.update(ref, {secours: d.secours.filter((x) => x !== h), echecs: []});
        return null;
      }
    } else {
      const pas = verifierTOTP(d.secret, code, d.dernierPas);
      if (pas !== null) {
        t.update(ref, {dernierPas: pas, echecs: []});
        return null;
      }
    }
    t.update(ref, {echecs: [...echecs, Date.now()]});
    return [400, "Code incorrect."];
  });
}

/**
 * 8 codes de secours à usage unique (affichés une fois, stockés hachés).
 * @param {string} uid UID du joueur.
 * @return {{codes: string[], hashes: string[]}} Codes et empreintes.
 */
function nouveauxCodesSecours(uid) {
  const alpha = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sans 0/O ni 1/I
  const codes = [];
  for (let i = 0; i < 8; i++) {
    let c = "";
    for (let j = 0; j < 8; j++) c += alpha[crypto.randomInt(alpha.length)];
    codes.push(c.slice(0, 4) + "-" + c.slice(4));
  }
  const hashes = codes.map((c) => hashCode2FA(c.replace("-", ""), uid));
  return {codes, hashes};
}

// ---------- Boutique : prix, contrôle parental, livraison des commandes ------

/**
 * Convertit une date Firestore (Timestamp), un texte ISO ou un nombre en ms.
 * @param {*} v La valeur.
 * @return {number|null} Millisecondes, ou null si absente / illisible.
 */
function enMillis(v) {
  if (v == null || v === "") return null;
  if (typeof v.toMillis === "function") return v.toMillis();
  const n = typeof v === "number" ? v : Date.parse(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Prix réellement facturé d'un jeu. Promotion : champs « promoPrix » (euros)
 * et facultativement « promoDebut » / « promoFin » sur le document du jeu.
 * Même règle que l'affichage (boutique.js).
 * @param {object} jeu Données du jeu (Firestore).
 * @return {{prix: number, base: number, promo: boolean}|null} null : pas
 *   en vente.
 */
function prixJeu(jeu) {
  const base = Number(jeu.prix);
  if (!Number.isFinite(base) || base < 0) return null;
  const promo = Number(jeu.promoPrix);
  const debut = enMillis(jeu.promoDebut);
  const fin = enMillis(jeu.promoFin);
  const maintenant = Date.now();
  const enPromo = jeu.promoPrix != null && Number.isFinite(promo) &&
    promo >= 0 && promo < base &&
    (debut === null || maintenant >= debut) &&
    (fin === null || maintenant < fin);
  return {prix: enPromo ? promo : base, base, promo: enPromo};
}

/**
 * Réglages du contrôle parental (parental/{uid}, écrit par le serveur).
 * @param {object} db Firestore.
 * @param {string} uid UID du joueur.
 * @return {Promise<object>} {actif, achatsBloques, chatBloque, ageMax}.
 */
async function parentalDe(db, uid) {
  const snap = await db.collection("parental").doc(uid).get();
  const d = snap.exists ? snap.data() : {};
  return d.actif ? d : {actif: false};
}

/**
 * Raison pour laquelle le contrôle parental refuse ce jeu, ou null.
 * @param {object} parental Réglages (parentalDe).
 * @param {object} jeu Données du jeu (champ « age » = classification PEGI).
 * @return {string|null} Message d'erreur, ou null si autorisé.
 */
function refusParental(parental, jeu) {
  if (!parental.actif) return null;
  if (parental.achatsBloques) {
    return "Les achats sont bloqués par le contrôle parental.";
  }
  const age = Number(jeu.age);
  if (parental.ageMax && Number.isFinite(age) && age > parental.ageMax) {
    return `« ${jeu.titre || "Ce jeu"} » est classé ${age}+ : bloqué par ` +
      "le contrôle parental.";
  }
  return null;
}

/**
 * Livre une commande payée (une seule fois, même si Stripe renvoie
 * l'événement) : ajoute les jeux au destinataire et prévient s'il s'agit
 * d'un cadeau.
 * @param {object} db Firestore.
 * @param {string} commandeId ID du document commandes/{id}.
 * @param {string} moyen « carte » ou « solde ».
 * @return {Promise<void>}
 */
async function livrerCommande(db, commandeId, moyen) {
  const ref = db.collection("commandes").doc(commandeId);
  const c = await db.runTransaction(async (t) => {
    const snap = await t.get(ref);
    if (!snap.exists || snap.data().statut === "livree") return null;
    t.update(ref, {statut: "livree", moyen, livreeLe: Date.now()});
    return snap.data();
  });
  if (!c) return;
  await db.collection("users").doc(c.pourUid).set({
    jeuxPossedes: admin.firestore.FieldValue.arrayUnion(...c.gameIds),
  }, {merge: true});
  if (c.pourUid !== c.userId) {
    await db.collection("users").doc(c.pourUid).collection("cadeaux").add({
      de: c.userId, dePseudo: c.pseudo || "Un ami", gameIds: c.gameIds,
      titres: c.titres || [], message: c.message || "", vu: false,
      recuLe: Date.now(),
    });
  }
  logger.info(`Commande ${commandeId} livrée à ${c.pourUid}`, {
    jeux: c.gameIds, moyen,
  });
}

// 1. Générer la page de paiement pour le jeu
exports.creerSessionAchat = onRequest(
    {secrets: [stripeSecretKey]},
    async (req, res) => {
      res.set("Access-Control-Allow-Origin", "*");
      res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
      if (req.method === "OPTIONS") return res.status(204).send("");
      if (req.method !== "POST") {
        return res.status(405).json({error: "Méthode non autorisée."});
      }

      // L'identité du joueur vient de son jeton Firebase, pas du corps de la
      // requête (qui peut être falsifié).
      const jeton = await verifierJeton(req);
      if (!jeton) {
        return res.status(401).json({error: "Veuillez vous reconnecter."});
      }
      const userId = jeton.uid;

      const gameId = req.body && req.body.gameId;
      if (typeof gameId !== "string" || !/^[\w-]{1,100}$/.test(gameId)) {
        return res.status(400).json({error: "Jeu invalide."});
      }

      try {
        const db = admin.firestore();
        const [jeuSnap, joueurSnap] = await Promise.all([
          db.collection("games").doc(gameId).get(),
          db.collection("users").doc(userId).get(),
        ]);

        if (!jeuSnap.exists) {
          return res.status(404).json({error: "Ce jeu n'existe pas."});
        }
        const jeuxPossedes = (joueurSnap.exists &&
          joueurSnap.data().jeuxPossedes) || [];
        if (jeuxPossedes.includes(gameId)) {
          return res.status(409).json({error: "Vous possédez déjà ce jeu."});
        }

        // Le prix vient TOUJOURS de Firestore (champ "prix", en euros),
        // jamais du launcher.
        const jeu = jeuSnap.data();
        const tarif = prixJeu(jeu);
        if (!tarif) {
          logger.error(`Prix manquant ou invalide pour le jeu ${gameId}`);
          return res.status(500)
              .json({error: "Ce jeu n'est pas encore en vente."});
        }
        const prix = tarif.prix;
        const refus = refusParental(await parentalDe(db, userId), jeu);
        if (refus) return res.status(403).json({error: refus});

        // Jeu gratuit : ajouté directement, sans passer par Stripe
        if (prix === 0) {
          await db.collection("users").doc(userId).set({
            jeuxPossedes: admin.firestore.FieldValue.arrayUnion(gameId),
          }, {merge: true});
          return res.json({owned: true});
        }

        const stripe = new Stripe(stripeSecretKey.value());
        // Client Stripe persistant : la carte enregistrée pendant cet achat
        // (setup_future_usage) reste réutilisable ensuite dans "Moyens de
        // paiement".
        const customerId = await getOrCreateStripeCustomer(
            db, userId, jeton.email, stripe);
        // Après le paiement, on revient sur le site ou dans le launcher
        const depuisSite = req.body.retour === "site";
        const urlRetour = depuisSite ?
          "https://www.novaly-store.fr/#bibliotheque" :
          "https://novaly-a80f7.web.app/paiement-reussi.html";
        const urlAnnulation = depuisSite ?
          "https://www.novaly-store.fr/#magasin" :
          "https://novaly-a80f7.web.app/paiement-annule.html";

        const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          mode: "payment",
          customer: customerId,
          // C'EST CETTE LIGNE QUI PERMET DE SAUVEGARDER LA CARTE !
          payment_intent_data: {
            setup_future_usage: "on_session",
          },
          line_items: [{
            price_data: {
              currency: "eur",
              product_data: {
                name: `Achat du jeu : ${jeu.titre || gameId}`,
                description: "Clé numérique ajoutée directement à votre " +
                  "bibliothèque Novaly.",
              },
              unit_amount: Math.round(prix * 100),
            },
            quantity: 1,
          }],
          metadata: {
            userId: userId,
            gameId: gameId,
          },
          success_url: urlRetour,
          cancel_url: urlAnnulation,
        });

        res.json({url: session.url});
      } catch (err) {
        // Le détail de l'erreur reste dans les logs, pas chez le client
        logger.error("Erreur lors de la création de la session Stripe", err);
        res.status(500).json({error: "Impossible d'initialiser le paiement."});
      }
    });

// 2. Le Webhook qui ajoute automatiquement le jeu quand le paiement est validé
exports.stripeWebhook = onRequest(
    {secrets: [stripeSecretKey, stripeWebhookSecret]},
    async (req, res) => {
      const sig = req.headers["stripe-signature"];
      const stripe = new Stripe(stripeSecretKey.value());

      let event;
      try {
        event = stripe.webhooks.constructEvent(
            req.rawBody, sig, stripeWebhookSecret.value());
      } catch (err) {
        return res.status(400).send(`Webhook Error: ${err.message}`);
      }

      // Si le paiement est un succès validé par la banque :
      if (event.type === "checkout.session.completed") {
        const session = event.data.object;
        const {userId, gameId, commandeId, type} = session.metadata || {};

        if (session.payment_status === "paid" && commandeId) {
          await livrerCommande(admin.firestore(), commandeId, "carte");
          return res.json({received: true});
        }
        if (session.payment_status === "paid" && type === "recharge") {
          await crediterPortefeuille(admin.firestore(), userId,
              Number(session.metadata.centimes), session.id);
          return res.json({received: true});
        }

        if (session.payment_status !== "paid" || !userId || !gameId) {
          logger.warn("Session Stripe ignorée", {
            id: session.id, status: session.payment_status,
          });
          return res.json({received: true});
        }

        // On ajoute le jeu directement dans le tableau jeuxPossedes du joueur
        const userRef = admin.firestore().collection("users").doc(userId);
        await userRef.set({
          jeuxPossedes: admin.firestore.FieldValue.arrayUnion(gameId),
        }, {merge: true});

        logger.info(`Jeu ${gameId} ajouté au compte de ${userId}.`);
      }

      res.json({received: true});
    });

// 3. Gestion des moyens de paiement (cartes enregistrées)
//    Actions : list (GET), add (POST) = page Stripe pour enregistrer une carte,
//    delete (POST) = détacher une carte.
exports.moyensPaiement = onRequest(
    {secrets: [stripeSecretKey]},
    async (req, res) => {
      res.set("Access-Control-Allow-Origin", "*");
      res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      if (req.method === "OPTIONS") return res.status(204).send("");

      const jeton = await verifierJeton(req);
      if (!jeton) {
        return res.status(401).json({error: "Veuillez vous reconnecter."});
      }
      const userId = jeton.uid;

      const stripe = new Stripe(stripeSecretKey.value());
      const db = admin.firestore();
      const action =
        (req.body && req.body.action) || req.query.action || "list";

      try {
        const customerId = await getOrCreateStripeCustomer(
            db, userId, jeton.email, stripe);

        // Lister les cartes enregistrées
        if (action === "list") {
          const pms = await stripe.paymentMethods.list({
            customer: customerId,
            type: "card",
          });
          const cartes = pms.data.map((pm) => ({
            id: pm.id,
            marque: pm.card.brand,
            dernier4: pm.card.last4,
            mois: pm.card.exp_month,
            annee: pm.card.exp_year,
          }));
          return res.json({success: true, cartes});
        }

        // Ajouter une carte : page Stripe sécurisée (Checkout en mode "setup")
        if (action === "add") {
          const depuisSite = req.body && req.body.retour === "site";
          const retour = depuisSite ?
            "https://www.novaly-store.fr/#profile" :
            "https://novaly-a80f7.web.app/carte-ajoutee.html";
          const session = await stripe.checkout.sessions.create({
            mode: "setup",
            payment_method_types: ["card"],
            customer: customerId,
            success_url: retour,
            cancel_url: retour,
          });
          return res.json({success: true, url: session.url});
        }

        // Supprimer (détacher) une carte, après vérification d'appartenance
        if (action === "delete") {
          const pmId = req.body && req.body.paymentMethodId;
          if (!pmId) {
            return res.status(400).json({error: "Carte manquante."});
          }
          const pm = await stripe.paymentMethods.retrieve(pmId);
          if (!pm || pm.customer !== customerId) {
            return res.status(403)
                .json({error: "Cette carte ne vous appartient pas."});
          }
          await stripe.paymentMethods.detach(pmId);
          return res.json({success: true});
        }

        return res.status(400).json({error: "Action inconnue."});
      } catch (err) {
        logger.error("Erreur moyensPaiement", err);
        return res.status(500)
            .json({error: "Erreur lors de la gestion des moyens de paiement."});
      }
    });

// 4. Utiliser un code d'activation (débloque un jeu).
//    Les codes vivent dans la collection Firestore "codes" (ID = code
//    normalisé), inaccessible aux clients : seule cette fonction (Admin SDK)
//    les lit/écrit. Document attendu : { gameId: "<id>", used: false }.
exports.utiliserCode = onRequest(
    async (req, res) => {
      res.set("Access-Control-Allow-Origin", "*");
      res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
      if (req.method === "OPTIONS") return res.status(204).send("");

      const jeton = await verifierJeton(req);
      if (!jeton) {
        return res.status(401).json({error: "Veuillez vous reconnecter."});
      }
      const userId = jeton.uid;

      // Normalisation : majuscules, sans espaces ni tirets.
      let code = (req.body && req.body.code) || "";
      code = String(code).toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (code.length < 4) {
        return res.status(400).json({error: "Code invalide."});
      }

      const db = admin.firestore();
      try {
        const resultat = await db.runTransaction(async (tx) => {
          const codeRef = db.collection("codes").doc(code);
          const codeSnap = await tx.get(codeRef);
          if (!codeSnap.exists) {
            throw httpError(404, "Code invalide.");
          }
          const data = codeSnap.data();
          if (data.used) {
            throw httpError(409, "Ce code a déjà été utilisé.");
          }
          const gameId = data.gameId;
          if (!gameId) {
            throw httpError(500, "Ce code n'est associé à aucun jeu.");
          }

          const userRef = db.collection("users").doc(userId);
          const userSnap = await tx.get(userRef);
          const jeux = (userSnap.exists && userSnap.data().jeuxPossedes) || [];
          if (jeux.includes(gameId)) {
            throw httpError(409, "Vous possédez déjà ce jeu.");
          }

          tx.set(userRef, {
            jeuxPossedes: admin.firestore.FieldValue.arrayUnion(gameId),
          }, {merge: true});
          tx.update(codeRef, {
            used: true,
            usedBy: userId,
            usedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          return {gameId};
        });

        // Titre du jeu pour un message plus clair.
        let titre = resultat.gameId;
        try {
          const g = await db.collection("games").doc(resultat.gameId).get();
          if (g.exists && g.data().titre) titre = g.data().titre;
        } catch (e) {
          // titre décoratif : on garde l'id en cas d'échec
        }

        logger.info(`Code ${code} utilisé par ${userId} (${resultat.gameId}).`);
        return res.json({success: true, gameId: resultat.gameId, titre});
      } catch (err) {
        if (err && err.statut) {
          return res.status(err.statut).json({error: err.message});
        }
        logger.error("Erreur utiliserCode", err);
        return res.status(500)
            .json({error: "Erreur lors de l'utilisation du code."});
      }
    });

// 5. Envoi d'un code 2FA par e-mail (10 min de validité, 1 envoi / minute).
exports.envoyerCode2FA = onRequest(
    {secrets: [smtpUser, smtpPass]},
    async (req, res) => {
      res.set("Access-Control-Allow-Origin", "*");
      res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
      if (req.method === "OPTIONS") return res.status(204).send("");

      // Pas de verrou A2F ici : c'est justement ce qui permet de le franchir.
      const jeton = await verifierJeton(req, {ignorerA2F: true});
      if (!jeton) {
        return res.status(401).json({error: "Veuillez vous reconnecter."});
      }
      if (!jeton.email) {
        return res.status(400)
            .json({error: "Aucune adresse e-mail sur ce compte."});
      }
      const userId = jeton.uid;

      try {
        const db = admin.firestore();
        const ref = db.collection("a2f_codes").doc(userId);
        const precedent = await ref.get();
        if (precedent.exists &&
            Date.now() - (precedent.data().sentAt || 0) < 60 * 1000) {
          return res.status(429).json({
            error: "Un code vient d'être envoyé. Patientez une minute.",
          });
        }

        const code = String(crypto.randomInt(100000, 1000000));
        await ref.set({
          codeHash: hashCode2FA(code, userId),
          sentAt: Date.now(),
          expiresAt: Date.now() + 10 * 60 * 1000,
          attempts: 0,
        });

        const transporter = nodemailer.createTransport({
          host: SMTP_HOST,
          port: SMTP_PORT,
          secure: SMTP_PORT === 465,
          auth: {user: smtpUser.value(), pass: smtpPass.value()},
        });
        await transporter.sendMail({
          from: `Novaly <${SMTP_FROM}>`,
          to: jeton.email,
          subject: `${code} est votre code de vérification Novaly`,
          text: `Votre code de vérification Novaly est : ${code}\n\n` +
            "Il expire dans 10 minutes. Si vous n'êtes pas à l'origine de " +
            "cette demande, changez votre mot de passe : quelqu'un le connaît.",
          html: emailCodeHtml(code),
        });

        return res.json({success: true});
      } catch (err) {
        logger.error("Erreur envoyerCode2FA", err);
        return res.status(500)
            .json({error: "Impossible d'envoyer le code par e-mail."});
      }
    });

// 6. Vérification d'un code 2FA.
//   methode : email (défaut) | app (application TOTP) | secours (code unique).
//   action  : login   → valide la session courante (franchit le verrou A2F) ;
//             enable / disable → active / désactive l'A2F par E-MAIL
//             (l'application se gère avec la fonction a2fApp).
exports.verifierCode2FA = onRequest(
    async (req, res) => {
      res.set("Access-Control-Allow-Origin", "*");
      res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
      if (req.method === "OPTIONS") return res.status(204).send("");

      const jeton = await verifierJeton(req, {ignorerA2F: true});
      if (!jeton) {
        return res.status(401).json({error: "Veuillez vous reconnecter."});
      }
      const userId = jeton.uid;

      const code = ((req.body && req.body.code) || "").toString().trim();
      const action = (req.body && req.body.action) || "login";
      const methode = (req.body && req.body.methode) || "email";
      if (!["login", "enable", "disable"].includes(action) ||
          !["email", "app", "secours"].includes(methode) ||
          (action !== "login" && methode !== "email")) {
        return res.status(400).json({error: "Action inconnue."});
      }
      const formatOk = methode === "secours" ?
        /^[A-Za-z0-9]{4}-?[A-Za-z0-9]{4}$/.test(code) : /^\d{6}$/.test(code);
      if (!formatOk) {
        return res.status(400).json({error: methode === "secours" ?
          "Code de secours attendu (ex. ABCD-EF23)." :
          "Code à 6 chiffres attendu."});
      }

      try {
        const db = admin.firestore();
        if (action === "disable" && !(await sessionA2FValidee(jeton))) {
          return res.status(401).json({error: "Veuillez vous reconnecter."});
        }

        let erreur;
        if (methode === "email") {
          // Transaction : deux essais simultanés ne contournent pas la limite.
          const ref = db.collection("a2f_codes").doc(userId);
          erreur = await db.runTransaction(async (t) => {
            const snap = await t.get(ref);
            if (!snap.exists) {
              return [400, "Aucun code en attente. Renvoyez un code."];
            }
            const data = snap.data();
            if (Date.now() > data.expiresAt) {
              t.delete(ref);
              return [400, "Code expiré. Renvoyez un code."];
            }
            if ((data.attempts || 0) >= 5) {
              t.delete(ref);
              return [429, "Trop de tentatives. Renvoyez un code."];
            }
            if (hashCode2FA(code, userId) !== data.codeHash) {
              t.update(ref, {attempts: (data.attempts || 0) + 1});
              return [400, "Code incorrect."];
            }
            t.delete(ref);
            return null;
          });
        } else {
          erreur = await verifierCodeApp(db, userId, code, methode);
        }
        if (erreur) return res.status(erreur[0]).json({error: erreur[1]});

        if (action === "login") {
          await db.collection("a2f_sessions").doc(userId).collection("ok")
              .doc(String(jeton.auth_time)).set({validatedAt: Date.now()});
          let restants;
          if (methode === "secours") {
            const t = await db.collection("a2f_totp").doc(userId).get();
            restants = ((t.exists && t.data().secours) || []).length;
          }
          return res.json({success: true, codesSecoursRestants: restants});
        }
        await changerMethodesA2F(db, jeton, {email: action === "enable"});
        return res.json({success: true});
      } catch (err) {
        logger.error("Erreur verifierCode2FA", err);
        return res.status(500)
            .json({error: "Erreur lors de la vérification du code."});
      }
    });

// 6 bis. A2F par application (Google Authenticator, Authy, 1Password…).
//   setup   → nouveau secret en attente + QR code (session déjà validée) ;
//   enable  → vérifie un code du secret en attente, active, renvoie 8 codes
//             de secours (affichés une seule fois) ;
//   disable → code de l'application ou de secours, puis désactive.
exports.a2fApp = onRequest(
    async (req, res) => {
      res.set("Access-Control-Allow-Origin", "*");
      res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
      if (req.method === "OPTIONS") return res.status(204).send("");

      // Verrou A2F appliqué : il faut une session déjà validée.
      const jeton = await verifierJeton(req);
      if (!jeton) {
        return res.status(401).json({error: "Veuillez vous reconnecter."});
      }
      const uid = jeton.uid;
      const action = (req.body && req.body.action) || "";
      const code = ((req.body && req.body.code) || "").toString().trim();

      try {
        const db = admin.firestore();
        const ref = db.collection("a2f_totp").doc(uid);

        if (action === "setup") {
          const secret = base32(crypto.randomBytes(20));
          await ref.set({attente: secret, attenteDepuis: Date.now()},
              {merge: true});
          const compte = jeton.email || uid;
          const uri = "otpauth://totp/" +
            encodeURIComponent("Novaly:" + compte) +
            "?secret=" + secret + "&issuer=Novaly&digits=6&period=30";
          const qr = await QRCode.toDataURL(uri, {margin: 1, width: 240});
          return res.json({success: true, secret, uri, qr});
        }

        if (action === "enable") {
          if (!/^\d{6}$/.test(code)) {
            return res.status(400).json({error: "Code à 6 chiffres attendu."});
          }
          const snap = await ref.get();
          const d = snap.exists ? snap.data() : {};
          if (!d.attente || Date.now() - d.attenteDepuis > 15 * 60000) {
            return res.status(400)
                .json({error: "Configuration expirée. Recommencez."});
          }
          const pas = verifierTOTP(d.attente, code, 0);
          if (pas === null) {
            return res.status(400).json({
              error: "Code incorrect. Vérifiez l'heure de votre téléphone.",
            });
          }
          const secours = nouveauxCodesSecours(uid);
          await ref.set({
            secret: d.attente, dernierPas: pas, echecs: [],
            secours: secours.hashes, depuis: Date.now(),
          });
          await changerMethodesA2F(db, jeton, {app: true});
          return res.json({success: true, codesSecours: secours.codes});
        }

        if (action === "disable") {
          const methode = /^\d{6}$/.test(code) ? "app" : "secours";
          const erreur = await verifierCodeApp(db, uid, code, methode);
          if (erreur) return res.status(erreur[0]).json({error: erreur[1]});
          await ref.delete();
          await changerMethodesA2F(db, jeton, {app: false});
          return res.json({success: true});
        }

        return res.status(400).json({error: "Action inconnue."});
      } catch (err) {
        logger.error("Erreur a2fApp", err);
        return res.status(500).json({error: "Erreur A2F application."});
      }
    });

// 7. Formulaire « Nous contacter » (launcher et site) → contact@.
// Connecté : l'e-mail vient du jeton Firebase.
// Sinon : e-mail saisi + limites anti-spam.
const CONTACT_TO = "contact@novaly-store.fr";
exports.envoyerContact = onRequest(
    {secrets: [smtpUser, smtpPass]},
    async (req, res) => {
      res.set("Access-Control-Allow-Origin", "*");
      res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
      if (req.method === "OPTIONS") return res.status(204).send("");
      if (req.method !== "POST") {
        return res.status(405).json({error: "Méthode non autorisée."});
      }

      const body = req.body || {};
      // Champ piège invisible : seul un robot le remplit. On fait semblant.
      if (body.site) return res.json({success: true});

      const sujet = String(body.sujet || "").trim().slice(0, 150);
      const message = String(body.message || "").trim().slice(0, 5000);
      if (!sujet || message.length < 10) {
        return res.status(400).json({
          error: "Indiquez un sujet et un message (10 caractères minimum).",
        });
      }

      const jeton = await verifierJeton(req, {ignorerA2F: true});
      const email = jeton ? jeton.email :
        String(body.email || "").trim().slice(0, 200);
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({error: "Adresse e-mail invalide."});
      }

      try {
        const db = admin.firestore();
        // Limite : 5 messages par heure par compte (ou par adresse IP).
        const ip = String(req.get("x-forwarded-for") || req.ip || "")
            .split(",")[0].trim();
        const cle = jeton ? "uid_" + jeton.uid : "ip_" +
          crypto.createHash("sha256").update(ip).digest("hex").slice(0, 32);
        const limiteRef = db.collection("contact_limites").doc(cle);
        const bloque = await db.runTransaction(async (t) => {
          const snap = await t.get(limiteRef);
          const recents = ((snap.exists && snap.data().envois) || [])
              .filter((d) => Date.now() - d < 60 * 60 * 1000);
          if (recents.length >= 5) return true;
          t.set(limiteRef, {envois: [...recents, Date.now()]});
          return false;
        });
        if (bloque) {
          return res.status(429).json({
            error: "Trop de messages envoyés. Réessayez dans une heure.",
          });
        }

        // Copie de sauvegarde (lisible uniquement depuis la console).
        await db.collection("contact_messages").add({
          sujet, message, email,
          uid: jeton ? jeton.uid : null,
          pseudo: jeton ? (jeton.name || null) : null,
          creeLe: admin.firestore.FieldValue.serverTimestamp(),
        });

        const transporter = nodemailer.createTransport({
          host: SMTP_HOST,
          port: SMTP_PORT,
          secure: SMTP_PORT === 465,
          auth: {user: smtpUser.value(), pass: smtpPass.value()},
        });
        await transporter.sendMail({
          from: `Formulaire Novaly <${SMTP_FROM}>`,
          to: CONTACT_TO,
          replyTo: email,
          subject: `[Contact] ${sujet}`,
          text: `De : ${email}` +
            (jeton ? ` (compte ${jeton.name || ""} — uid ${jeton.uid})` :
              " (non connecté)") +
            `\n\n${message}`,
        });
        return res.json({success: true});
      } catch (err) {
        logger.error("Erreur envoyerContact", err);
        return res.status(500)
            .json({error: "Impossible d'envoyer le message pour le moment."});
      }
    });

// 8. Commande : un ou plusieurs jeux (panier), pour soi ou offerts à un ami,
// payés par carte (Stripe) ou avec le solde du portefeuille.
// Corps : {gameIds: [...], pourUid?, message?, payerAvec: "carte"|"solde",
// retour?: "site"}.
exports.creerCommande = onRequest(
    {secrets: [stripeSecretKey]},
    async (req, res) => {
      res.set("Access-Control-Allow-Origin", "*");
      res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
      if (req.method === "OPTIONS") return res.status(204).send("");
      const jeton = await verifierJeton(req);
      if (!jeton) {
        return res.status(401).json({error: "Veuillez vous reconnecter."});
      }
      const b = req.body || {};
      const ids = [...new Set(Array.isArray(b.gameIds) ? b.gameIds : [])];
      if (!ids.length || ids.length > 20 ||
          !ids.every((g) => typeof g === "string" &&
            /^[\w-]{1,100}$/.test(g))) {
        return res.status(400).json({error: "Panier invalide."});
      }
      const userId = jeton.uid;
      const pourUid = typeof b.pourUid === "string" && b.pourUid ?
        b.pourUid : userId;
      const message = String(b.message || "").slice(0, 300);

      try {
        const db = admin.firestore();
        if (pourUid !== userId) {
          // On n'offre qu'à un ami (évite les envois à des inconnus).
          const ami = await db.collection("users").doc(userId)
              .collection("friends").doc(pourUid).get();
          if (!ami.exists) {
            return res.status(403)
                .json({error: "Tu ne peux offrir un jeu qu'à un ami."});
          }
        }
        const [jeux, dest, parental, moi] = await Promise.all([
          Promise.all(ids.map((g) => db.collection("games").doc(g).get())),
          db.collection("users").doc(pourUid).get(),
          parentalDe(db, userId),
          db.collection("users").doc(userId).get(),
        ]);
        const possedes = (dest.exists && dest.data().jeuxPossedes) || [];
        let total = 0;
        const lignes = [];
        for (const snap of jeux) {
          if (!snap.exists) {
            return res.status(404).json({error: "Un jeu n'existe plus."});
          }
          const jeu = snap.data();
          const tarif = prixJeu(jeu);
          if (!tarif) {
            return res.status(400).json({
              error: `« ${jeu.titre || snap.id} » n'est pas en vente.`});
          }
          if (possedes.includes(snap.id)) {
            return res.status(409).json({error: pourUid === userId ?
              `Tu possèdes déjà « ${jeu.titre || snap.id} ».` :
              `Ton ami possède déjà « ${jeu.titre || snap.id} ».`});
          }
          const refus = refusParental(parental, jeu);
          if (refus) return res.status(403).json({error: refus});
          total += Math.round(tarif.prix * 100);
          lignes.push({id: snap.id, titre: jeu.titre || snap.id,
            centimes: Math.round(tarif.prix * 100)});
        }

        const commandeRef = db.collection("commandes").doc();
        await commandeRef.set({
          userId, pourUid, gameIds: ids, titres: lignes.map((l) => l.titre),
          centimes: total, message,
          pseudo: (moi.exists && moi.data().pseudo) || jeton.name || "",
          statut: "en_attente", creeLe: Date.now(),
        });

        // Gratuit : livré tout de suite.
        if (total === 0) {
          await livrerCommande(db, commandeRef.id, "gratuit");
          return res.json({livree: true});
        }

        if (b.payerAvec === "solde") {
          const ok = await debiterPortefeuille(db, userId, total,
              commandeRef.id);
          if (!ok) {
            await commandeRef.update({statut: "refusee"});
            return res.status(402).json({error: "Solde insuffisant."});
          }
          await livrerCommande(db, commandeRef.id, "solde");
          return res.json({livree: true});
        }

        const stripe = new Stripe(stripeSecretKey.value());
        const customerId = await getOrCreateStripeCustomer(
            db, userId, jeton.email, stripe);
        const depuisSite = b.retour === "site";
        const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          mode: "payment",
          customer: customerId,
          payment_intent_data: {setup_future_usage: "on_session"},
          line_items: lignes.map((l) => ({
            price_data: {
              currency: "eur",
              product_data: {
                name: (pourUid === userId ? "" : "Cadeau : ") + l.titre,
                description: "Clé numérique ajoutée directement à la " +
                  "bibliothèque Novaly.",
              },
              unit_amount: l.centimes,
            },
            quantity: 1,
          })),
          metadata: {commandeId: commandeRef.id, userId},
          success_url: depuisSite ?
            "https://www.novaly-store.fr/#bibliotheque" :
            "https://novaly-a80f7.web.app/paiement-reussi.html",
          cancel_url: depuisSite ?
            "https://www.novaly-store.fr/#panier" :
            "https://novaly-a80f7.web.app/paiement-annule.html",
        });
        await commandeRef.update({stripeSession: session.id});
        return res.json({url: session.url});
      } catch (err) {
        logger.error("Erreur creerCommande", err);
        return res.status(500)
            .json({error: "Impossible de créer la commande."});
      }
    });

// ---------- Portefeuille (solde Novaly, en centimes) ----------
// portefeuilles/{uid} = {solde} ; historique dans .../mouvements/{id}.
// Écrit uniquement par le serveur ; le joueur peut le lire (règles).

/**
 * Crédite le portefeuille une seule fois par paiement Stripe.
 * @param {object} db Firestore.
 * @param {string} uid UID du joueur.
 * @param {number} centimes Montant.
 * @param {string} sessionId Session Stripe (sert d'identifiant unique).
 * @return {Promise<void>}
 */
async function crediterPortefeuille(db, uid, centimes, sessionId) {
  if (!uid || !Number.isInteger(centimes) || centimes <= 0) return;
  const ref = db.collection("portefeuilles").doc(uid);
  const mvt = ref.collection("mouvements").doc(sessionId);
  await db.runTransaction(async (t) => {
    const [deja, porte] = await Promise.all([t.get(mvt), t.get(ref)]);
    if (deja.exists) return;
    const solde = (porte.exists && porte.data().solde) || 0;
    t.set(ref, {solde: solde + centimes}, {merge: true});
    t.set(mvt, {type: "recharge", centimes, le: Date.now()});
  });
  logger.info(`Portefeuille de ${uid} crédité de ${centimes} centimes.`);
}

/**
 * Débite le portefeuille si le solde suffit (transaction).
 * @param {object} db Firestore.
 * @param {string} uid UID du joueur.
 * @param {number} centimes Montant.
 * @param {string} commandeId Commande payée.
 * @return {Promise<boolean>} false si solde insuffisant.
 */
async function debiterPortefeuille(db, uid, centimes, commandeId) {
  const ref = db.collection("portefeuilles").doc(uid);
  return db.runTransaction(async (t) => {
    const porte = await t.get(ref);
    const solde = (porte.exists && porte.data().solde) || 0;
    if (solde < centimes) return false;
    t.set(ref, {solde: solde - centimes}, {merge: true});
    t.set(ref.collection("mouvements").doc("cmd_" + commandeId),
        {type: "achat", centimes: -centimes, commandeId, le: Date.now()});
    return true;
  });
}

// 9. Recharger le portefeuille (montants fixes, paiement par carte).
const RECHARGES = [500, 1000, 2000, 5000];
exports.rechargerPortefeuille = onRequest(
    {secrets: [stripeSecretKey]},
    async (req, res) => {
      res.set("Access-Control-Allow-Origin", "*");
      res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
      if (req.method === "OPTIONS") return res.status(204).send("");
      const jeton = await verifierJeton(req);
      if (!jeton) {
        return res.status(401).json({error: "Veuillez vous reconnecter."});
      }
      const centimes = Number(req.body && req.body.centimes);
      if (!RECHARGES.includes(centimes)) {
        return res.status(400).json({error: "Montant non proposé."});
      }
      try {
        const db = admin.firestore();
        const parental = await parentalDe(db, jeton.uid);
        if (parental.actif && parental.achatsBloques) {
          return res.status(403).json({
            error: "Les achats sont bloqués par le contrôle parental."});
        }
        const stripe = new Stripe(stripeSecretKey.value());
        const customerId = await getOrCreateStripeCustomer(
            db, jeton.uid, jeton.email, stripe);
        const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          mode: "payment",
          customer: customerId,
          line_items: [{
            price_data: {
              currency: "eur",
              product_data: {
                name: `Recharge du portefeuille Novaly`,
                description: "Crédit utilisable pour acheter des jeux sur " +
                  "Novaly. Non remboursable, non convertible en argent.",
              },
              unit_amount: centimes,
            },
            quantity: 1,
          }],
          metadata: {type: "recharge", userId: jeton.uid,
            centimes: String(centimes)},
          success_url: "https://novaly-a80f7.web.app/paiement-reussi.html",
          cancel_url: "https://novaly-a80f7.web.app/paiement-annule.html",
        });
        return res.json({url: session.url});
      } catch (err) {
        logger.error("Erreur rechargerPortefeuille", err);
        return res.status(500)
            .json({error: "Impossible d'initialiser la recharge."});
      }
    });


// 10. Contrôle parental, protégé par un code PIN.
// parental/{uid} = réglages (lisibles par le joueur, écrits ici seulement) ;
// parental_pins/{uid} = empreinte scrypt du PIN + échecs (serveur uniquement).
// Corps : {action: "activer"|"modifier"|"desactiver", pin, nouveauPin?,
//          achatsBloques?, chatBloque?, ageMax?}
const AGES_PEGI = [0, 3, 7, 12, 16, 18];

/**
 * Empreinte d'un PIN (scrypt, sel aléatoire).
 * @param {string} pin Le code PIN.
 * @param {string} sel Sel hexadécimal.
 * @return {string} Empreinte hexadécimale.
 */
function empreintePin(pin, sel) {
  return crypto.scryptSync(String(pin), sel, 32).toString("hex");
}

exports.controleParental = onRequest(
    async (req, res) => {
      res.set("Access-Control-Allow-Origin", "*");
      res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
      if (req.method === "OPTIONS") return res.status(204).send("");
      const jeton = await verifierJeton(req);
      if (!jeton) {
        return res.status(401).json({error: "Veuillez vous reconnecter."});
      }
      const b = req.body || {};
      const action = b.action;
      const pin = String(b.pin || "");
      const reglages = {
        achatsBloques: b.achatsBloques === true,
        chatBloque: b.chatBloque === true,
        ageMax: AGES_PEGI.includes(Number(b.ageMax)) ? Number(b.ageMax) : 0,
      };

      try {
        const db = admin.firestore();
        const refR = db.collection("parental").doc(jeton.uid);
        const refPin = db.collection("parental_pins").doc(jeton.uid);
        const snapPin = await refPin.get();
        const snapR = await refR.get();
        const actif = snapR.exists && snapR.data().actif === true;

        if (action === "activer") {
          if (actif) {
            return res.status(409)
                .json({error: "Le contrôle parental est déjà actif."});
          }
          if (!/^\d{4,6}$/.test(pin)) {
            return res.status(400)
                .json({error: "Choisissez un code PIN de 4 à 6 chiffres."});
          }
          const sel = crypto.randomBytes(16).toString("hex");
          await refPin.set({sel, empreinte: empreintePin(pin, sel),
            echecs: []});
          await refR.set({actif: true, ...reglages, depuis: Date.now()});
          return res.json({success: true});
        }

        if (action !== "modifier" && action !== "desactiver") {
          return res.status(400).json({error: "Action inconnue."});
        }
        if (!actif || !snapPin.exists) {
          return res.status(400)
              .json({error: "Le contrôle parental n'est pas actif."});
        }
        // Vérification du PIN : 5 essais par quart d'heure.
        const p = snapPin.data();
        const echecs = (p.echecs || []).filter((t) => Date.now() - t < 900000);
        if (echecs.length >= 5) {
          return res.status(429).json({
            error: "Trop d'essais. Réessayez dans 15 minutes."});
        }
        const attendu = Buffer.from(p.empreinte, "hex");
        const recu = Buffer.from(empreintePin(pin, p.sel), "hex");
        if (!crypto.timingSafeEqual(attendu, recu)) {
          await refPin.update({echecs: [...echecs, Date.now()]});
          return res.status(403).json({error: "Code PIN incorrect."});
        }

        if (action === "desactiver") {
          await Promise.all([refR.delete(), refPin.delete()]);
          return res.json({success: true});
        }
        const maj = {echecs: []};
        if (b.nouveauPin) {
          if (!/^\d{4,6}$/.test(String(b.nouveauPin))) {
            return res.status(400)
                .json({error: "Le nouveau PIN doit faire 4 à 6 chiffres."});
          }
          maj.sel = crypto.randomBytes(16).toString("hex");
          maj.empreinte = empreintePin(String(b.nouveauPin), maj.sel);
        }
        await refPin.update(maj);
        await refR.set({actif: true, ...reglages}, {merge: true});
        return res.json({success: true});
      } catch (err) {
        logger.error("Erreur controleParental", err);
        return res.status(500)
            .json({error: "Erreur du contrôle parental."});
      }
    });

// 11. Comptes associés (Steam, Discord). Résultat dans comptes_lies/{uid}
// (lisible par le joueur, écrit ici seulement).
// Flux : lierCompte {action: "debut", service} → URL à ouvrir dans le
// navigateur → le service renvoie vers retourSteam / retourDiscord, qui
// vérifient l'identité puis enregistrent le compte. Le « state » est un jeton
// à usage unique (10 min) qui relie le retour au bon joueur.
// Discord : créer une application sur https://discord.com/developers,
// URI de redirection = DISCORD_REDIRECT ci-dessous, puis
//   firebase functions:secrets:set DISCORD_CLIENT_SECRET
const FN_BASE = "https://us-central1-novaly-a80f7.cloudfunctions.net/";
const DISCORD_CLIENT_ID = 1557027740039913473; // ⚠️ à remplir (ID public de l'application)
const DISCORD_REDIRECT = FN_BASE + "retourDiscord";
const discordSecret = defineSecret("DISCORD_CLIENT_SECRET");

/**
 * Page HTML de fin de liaison (affichée dans le navigateur).
 * @param {boolean} ok Succès ou échec.
 * @param {string} message Texte à afficher (sans HTML).
 * @return {string} La page.
 */
function pageLiaison(ok, message) {
  const texte = String(message).replace(/[<>&"]/g, "");
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Novaly</title></head><body style="margin:0;background:#0b0b0c;
color:#fff;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;
display:grid;place-items:center;min-height:100vh"><div style="text-align:center;
padding:30px;max-width:420px"><div style="font-size:28px;font-weight:800;
letter-spacing:2px">NOVALY</div><p style="font-size:40px;margin:20px 0 6px">
${ok ? "✅" : "⚠️"}</p><p style="color:#ccc">${texte}</p>
<a href="novaly://profile" style="display:inline-block;margin-top:16px;
background:#fff;color:#000;padding:10px 18px;border-radius:8px;
text-decoration:none;font-weight:700">Retourner dans Novaly</a></div>
</body></html>`;
}

/**
 * Consomme un jeton « state » (usage unique, 10 min).
 * @param {object} db Firestore.
 * @param {string} state Le jeton reçu.
 * @param {string} service « steam » ou « discord ».
 * @return {Promise<string|null>} L'UID du joueur, ou null.
 */
async function consommerEtat(db, state, service) {
  if (!/^[a-f0-9]{48}$/.test(String(state || ""))) return null;
  const ref = db.collection("liens_etats").doc(state);
  return db.runTransaction(async (t) => {
    const snap = await t.get(ref);
    if (!snap.exists) return null;
    t.delete(ref);
    const d = snap.data();
    if (d.service !== service || Date.now() - d.cree > 600000) return null;
    return d.uid;
  });
}

exports.lierCompte = onRequest(
    async (req, res) => {
      res.set("Access-Control-Allow-Origin", "*");
      res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
      if (req.method === "OPTIONS") return res.status(204).send("");
      const jeton = await verifierJeton(req);
      if (!jeton) {
        return res.status(401).json({error: "Veuillez vous reconnecter."});
      }
      const {action, service} = req.body || {};
      if (!["steam", "discord"].includes(service)) {
        return res.status(400).json({error: "Service inconnu."});
      }
      const db = admin.firestore();
      try {
        if (action === "delier") {
          await db.collection("comptes_lies").doc(jeton.uid).set({
            [service]: admin.firestore.FieldValue.delete(),
          }, {merge: true});
          return res.json({success: true});
        }
        if (action !== "debut") {
          return res.status(400).json({error: "Action inconnue."});
        }
        if (service === "discord" && !DISCORD_CLIENT_ID) {
          return res.status(503).json({
            error: "La liaison Discord n'est pas encore configurée."});
        }
        const state = crypto.randomBytes(24).toString("hex");
        await db.collection("liens_etats").doc(state)
            .set({uid: jeton.uid, service, cree: Date.now()});
        let url;
        if (service === "steam") {
          const retour = FN_BASE + "retourSteam?state=" + state;
          url = "https://steamcommunity.com/openid/login?" +
            new URLSearchParams({
              "openid.ns": "http://specs.openid.net/auth/2.0",
              "openid.mode": "checkid_setup",
              "openid.return_to": retour,
              "openid.realm": FN_BASE,
              "openid.identity":
                "http://specs.openid.net/auth/2.0/identifier_select",
              "openid.claimed_id":
                "http://specs.openid.net/auth/2.0/identifier_select",
            });
        } else {
          url = "https://discord.com/oauth2/authorize?" +
            new URLSearchParams({
              client_id: DISCORD_CLIENT_ID, response_type: "code",
              redirect_uri: DISCORD_REDIRECT, scope: "identify",
              state,
            });
        }
        return res.json({url});
      } catch (err) {
        logger.error("Erreur lierCompte", err);
        return res.status(500).json({error: "Liaison impossible."});
      }
    });

// Retour de Steam (OpenID 2.0) : on fait confirmer la réponse par Steam
// lui-même (check_authentication) avant de croire l'identifiant.
exports.retourSteam = onRequest(async (req, res) => {
  const db = admin.firestore();
  try {
    const q = req.query || {};
    const attendu = FN_BASE + "retourSteam?state=" + q.state;
    if (q["openid.mode"] !== "id_res" || q["openid.return_to"] !== attendu) {
      return res.status(400).send(pageLiaison(false, "Liaison annulée."));
    }
    const verif = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) {
      if (k.startsWith("openid.")) verif.set(k, String(v));
    }
    verif.set("openid.mode", "check_authentication");
    const r = await fetch("https://steamcommunity.com/openid/login", {
      method: "POST", body: verif,
      headers: {"Content-Type": "application/x-www-form-urlencoded"},
    });
    const corps = await r.text();
    const m = String(q["openid.claimed_id"] || "")
        .match(/^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/);
    if (!/is_valid\s*:\s*true/.test(corps) || !m) {
      return res.status(400)
          .send(pageLiaison(false, "Steam n'a pas confirmé la connexion."));
    }
    const uid = await consommerEtat(db, q.state, "steam");
    if (!uid) {
      return res.status(400).send(pageLiaison(false,
          "Lien expiré : recommencez depuis Novaly."));
    }
    // Pseudo Steam public (facultatif : sans clé d'API).
    let nom = "";
    try {
      const xml = await (await fetch(
          `https://steamcommunity.com/profiles/${m[1]}?xml=1`)).text();
      const n = xml.match(/<steamID><!\[CDATA\[([^\]]{0,64})\]\]><\/steamID>/);
      if (n) nom = n[1];
    } catch (e) {/* pseudo facultatif */}
    await db.collection("comptes_lies").doc(uid).set({
      steam: {id: m[1], nom, le: Date.now()},
    }, {merge: true});
    return res.send(pageLiaison(true,
        `Compte Steam ${nom || m[1]} lié à Novaly.`));
  } catch (err) {
    logger.error("Erreur retourSteam", err);
    return res.status(500).send(pageLiaison(false, "Erreur de liaison."));
  }
});

// Retour de Discord (OAuth2) : échange du code contre un jeton, lecture du
// profil (scope « identify » : identifiant + pseudo seulement).
exports.retourDiscord = onRequest(
    {secrets: [discordSecret]},
    async (req, res) => {
      const db = admin.firestore();
      try {
        const {code, state} = req.query || {};
        if (!code) {
          return res.status(400).send(pageLiaison(false, "Liaison annulée."));
        }
        const uid = await consommerEtat(db, state, "discord");
        if (!uid) {
          return res.status(400).send(pageLiaison(false,
              "Lien expiré : recommencez depuis Novaly."));
        }
        const tok = await (await fetch("https://discord.com/api/oauth2/token", {
          method: "POST",
          headers: {"Content-Type": "application/x-www-form-urlencoded"},
          body: new URLSearchParams({
            client_id: DISCORD_CLIENT_ID,
            client_secret: discordSecret.value(),
            grant_type: "authorization_code",
            code: String(code), redirect_uri: DISCORD_REDIRECT,
          }),
        })).json();
        if (!tok.access_token) throw new Error("jeton Discord refusé");
        const moi = await (await fetch("https://discord.com/api/users/@me", {
          headers: {Authorization: `Bearer ${tok.access_token}`},
        })).json();
        if (!moi.id) throw new Error("profil Discord illisible");
        await db.collection("comptes_lies").doc(uid).set({
          discord: {id: moi.id, nom: moi.global_name || moi.username || "",
            le: Date.now()},
        }, {merge: true});
        return res.send(pageLiaison(true,
            `Compte Discord ${moi.global_name || moi.username} lié à Novaly.`));
      } catch (err) {
        logger.error("Erreur retourDiscord", err);
        return res.status(500).send(pageLiaison(false, "Erreur de liaison."));
      }
    });
