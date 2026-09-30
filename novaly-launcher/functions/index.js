const {setGlobalOptions} = require("firebase-functions");
const {onRequest} = require("firebase-functions/https");
const {defineSecret} = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const Stripe = require("stripe");

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

/**
 * Vérifie le jeton Firebase envoyé par le launcher (en-tête Authorization).
 * @param {object} req Requête HTTP.
 * @return {Promise<object|null>} Le jeton décodé, ou null s'il est invalide.
 */
async function verifierJeton(req) {
  const entete = req.get("Authorization") || "";
  const correspondance = entete.match(/^Bearer (.+)$/);
  if (!correspondance) return null;
  try {
    return await admin.auth().verifyIdToken(correspondance[1]);
  } catch (err) {
    return null;
  }
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
        // Après le paiement, on revient sur le site ou dans le launcher
        const depuisSite = req.body.retour === "site";
        const urlRetour = depuisSite ?
          "https://www.novaly-store.fr/#bibliotheque" :
          "https://novaly-a80f7.web.app/paiement-reussi.html";
        const urlAnnulation = depuisSite ?
          "https://www.novaly-store.fr/#magasin" :
          "https://novaly.games/paiement-annule";

        const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          mode: "payment",
          customer_email: jeton.email,
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
