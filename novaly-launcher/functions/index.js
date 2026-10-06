const {setGlobalOptions} = require("firebase-functions");
const {onRequest} = require("firebase-functions/https");
const {defineSecret} = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const Stripe = require("stripe");
const nodemailer = require("nodemailer");
const crypto = require("crypto");

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
        const prix = Number(jeu.prix);
        if (!Number.isFinite(prix) || prix < 0) {
          logger.error(`Prix manquant ou invalide pour le jeu ${gameId}`);
          return res.status(500)
              .json({error: "Ce jeu n'est pas encore en vente."});
        }

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
        const {userId, gameId} = session.metadata || {};

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

// 6. Vérification d'un code 2FA. action : login | enable | disable.
//   login   : valide la session courante (franchit le verrou A2F).
//   enable  : active l'A2F ; seule la session courante reste validée.
//   disable : désactive l'A2F (exige une session déjà validée).
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
      if (!["login", "enable", "disable"].includes(action)) {
        return res.status(400).json({error: "Action inconnue."});
      }
      if (!/^\d{6}$/.test(code)) {
        return res.status(400).json({error: "Code à 6 chiffres attendu."});
      }

      try {
        const db = admin.firestore();
        if (action === "disable" && !(await sessionA2FValidee(jeton))) {
          return res.status(401).json({error: "Veuillez vous reconnecter."});
        }

        // Transaction : deux essais simultanés ne contournent pas la limite.
        const ref = db.collection("a2f_codes").doc(userId);
        const erreur = await db.runTransaction(async (t) => {
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
        if (erreur) return res.status(erreur[0]).json({error: erreur[1]});

        const sessions = db.collection("a2f_sessions").doc(userId);
        const sessionCourante = sessions.collection("ok")
            .doc(String(jeton.auth_time));
        const profil = db.collection("users").doc(userId)
            .collection("private").doc("profil");

        if (action === "enable" || action === "disable") {
          // Repart de zéro : les autres appareils devront saisir un code.
          await db.recursiveDelete(sessions);
        }
        if (action === "disable") {
          await db.collection("a2f_actif").doc(userId).delete();
        } else {
          await sessionCourante.set({validatedAt: Date.now()});
        }
        if (action === "enable") {
          await db.collection("a2f_actif").doc(userId)
              .set({methode: "email", depuis: Date.now()});
        }
        if (action !== "login") {
          // Copie pour l'affichage uniquement ; la référence est a2f_actif.
          await profil.set({a2f_email: action === "enable"}, {merge: true});
        }

        return res.json({success: true});
      } catch (err) {
        logger.error("Erreur verifierCode2FA", err);
        return res.status(500)
            .json({error: "Erreur lors de la vérification du code."});
      }
    });
