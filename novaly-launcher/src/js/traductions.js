// =====================================================================
// TRADUCTIONS DE L'INTERFACE (anglais, espagnol, allemand, italien)
// Fichier IDENTIQUE dans le launcher (src/js/traductions.js) et sur le site
// (assets/js/traductions.js) : modifier l'un, recopier dans l'autre.
//
// Principe : on écrit les pages en français, et ce fichier remplace chaque
// texte français connu par sa traduction — y compris les textes ajoutés plus
// tard par le JavaScript (panier, fenêtres, boutons…), grâce à un observateur.
// Pour traduire un nouveau texte : ajouter une ligne dans DICO
//   "Texte français exact": ["English", "Español", "Deutsch", "Italiano"],
// Les éléments marqués data-i18n restent gérés par index.ui.js.
// =====================================================================
(function () {
    const LANGUES = { en: 0, es: 1, de: 2, it: 3 };

    const DICO = {
        // --- En-tête, menus ---
        "Magasin": ["Store", "Tienda", "Shop", "Negozio"],
        "Jeux rapide": ["Quick games", "Juegos rápidos", "Schnelle Spiele", "Giochi rapidi"],
        "Bibliothèque": ["Library", "Biblioteca", "Bibliothek", "Libreria"],
        "À propos": ["About", "Acerca de", "Über uns", "Info"],
        "Panier": ["Cart", "Carrito", "Warenkorb", "Carrello"],
        "Paramètres": ["Settings", "Ajustes", "Einstellungen", "Impostazioni"],
        "Rechercher un jeu...": ["Search for a game...", "Buscar un juego...", "Spiel suchen...", "Cerca un gioco..."],
        "Téléchargements": ["Downloads", "Descargas", "Downloads", "Download"],
        "Aucun téléchargement actif.": ["No active downloads.", "No hay descargas activas.", "Keine aktiven Downloads.", "Nessun download attivo."],
        "AMIS": ["FRIENDS", "AMIGOS", "FREUNDE", "AMICI"],
        "Ajouter un pseudo...": ["Add a username...", "Añadir un usuario...", "Benutzernamen hinzufügen...", "Aggiungi un nome utente..."],
        "Demandes d'ami": ["Friend requests", "Solicitudes de amistad", "Freundschaftsanfragen", "Richieste di amicizia"],
        "En ligne": ["Online", "En línea", "Online", "Online"],
        "Hors ligne": ["Offline", "Desconectado", "Offline", "Offline"],
        "Aucun ami en ligne.": ["No friends online.", "Ningún amigo en línea.", "Keine Freunde online.", "Nessun amico online."],
        "Aucun ami hors ligne.": ["No friends offline.", "Ningún amigo desconectado.", "Keine Freunde offline.", "Nessun amico offline."],
        "Invité": ["Guest", "Invitado", "Gast", "Ospite"],
        "Non connecté": ["Not signed in", "Sin conectar", "Nicht angemeldet", "Non connesso"],
        "Utilisateur": ["User", "Usuario", "Benutzer", "Utente"],
        "Mes succès": ["My achievements", "Mis logros", "Meine Erfolge", "I miei trofei"],
        "Récompenses Novaly": ["Novaly rewards", "Recompensas Novaly", "Novaly-Belohnungen", "Premi Novaly"],
        "Solde du compte": ["Account balance", "Saldo de la cuenta", "Kontoguthaben", "Saldo del conto"],
        "Bons": ["Vouchers", "Vales", "Gutscheine", "Buoni"],
        "Compte": ["Account", "Cuenta", "Konto", "Account"],
        "Utiliser un code": ["Redeem a code", "Canjear un código", "Code einlösen", "Riscatta un codice"],
        "Liste de souhaits": ["Wishlist", "Lista de deseos", "Wunschliste", "Lista dei desideri"],
        "Assistance": ["Support", "Asistencia", "Hilfe", "Assistenza"],
        "Se déconnecter": ["Sign out", "Cerrar sesión", "Abmelden", "Esci"],

        // --- Magasin, jeux ---
        "En vedette": ["Featured", "Destacados", "Empfohlen", "In evidenza"],
        "Tous nos jeux": ["All our games", "Todos nuestros juegos", "Alle unsere Spiele", "Tutti i nostri giochi"],
        "Nos Jeux en Ligne": ["Our online games", "Nuestros juegos en línea", "Unsere Online-Spiele", "I nostri giochi online"],
        "Jouer à l'alpha": ["Play the alpha", "Jugar a la alfa", "Alpha spielen", "Gioca all'alpha"],
        "Ajouter à la bibliothèque": ["Add to library", "Añadir a la biblioteca", "Zur Bibliothek hinzufügen", "Aggiungi alla libreria"],
        "Dans la bibliothèque": ["In library", "En la biblioteca", "In der Bibliothek", "Nella libreria"],
        "Multijoueur": ["Multiplayer", "Multijugador", "Mehrspieler", "Multigiocatore"],
        "Réflexion": ["Puzzle", "Reflexión", "Denkspiel", "Riflessione"],
        "Votre bibliothèque est vide": ["Your library is empty", "Tu biblioteca está vacía", "Deine Bibliothek ist leer", "La tua libreria è vuota"],
        "Les jeux que vous achèterez apparaîtront ici.": ["Games you buy will appear here.", "Los juegos que compres aparecerán aquí.", "Gekaufte Spiele erscheinen hier.", "I giochi che acquisti appariranno qui."],
        "← Retour au magasin": ["← Back to store", "← Volver a la tienda", "← Zurück zum Shop", "← Torna al negozio"],
        "Médias": ["Media", "Multimedia", "Medien", "Media"],
        "Vidéo et captures d'écran bientôt disponibles": ["Video and screenshots coming soon", "Vídeo y capturas próximamente", "Video und Screenshots folgen bald", "Video e screenshot in arrivo"],
        "Avis des joueurs": ["Player reviews", "Opiniones de jugadores", "Spielerbewertungen", "Recensioni dei giocatori"],
        "Derniers avis des joueurs": ["Latest player reviews", "Últimas opiniones", "Neueste Spielerbewertungen", "Ultime recensioni"],
        "Aucun avis pour l'instant.": ["No reviews yet.", "Aún no hay opiniones.", "Noch keine Bewertungen.", "Ancora nessuna recensione."],
        "Possède le jeu pour pouvoir le noter.": ["Own the game to rate it.", "Ten el juego para valorarlo.", "Besitze das Spiel, um es zu bewerten.", "Possiedi il gioco per valutarlo."],
        "Publier mon avis": ["Post my review", "Publicar mi opinión", "Bewertung veröffentlichen", "Pubblica la recensione"],
        "Modifier mon avis": ["Edit my review", "Editar mi opinión", "Bewertung bearbeiten", "Modifica la recensione"],
        "Télécharger": ["Download", "Descargar", "Herunterladen", "Scarica"],
        "► Jouer": ["► Play", "► Jugar", "► Spielen", "► Gioca"],
        "► Jouer sur Novaly": ["► Play on Novaly", "► Jugar en Novaly", "► Auf Novaly spielen", "► Gioca su Novaly"],
        "Prêt à jouer": ["Ready to play", "Listo para jugar", "Spielbereit", "Pronto da giocare"],
        "Voir la page": ["View page", "Ver página", "Seite ansehen", "Vedi pagina"],
        "Désinstaller": ["Uninstall", "Desinstalar", "Deinstallieren", "Disinstalla"],
        "Obtenir (Gratuit)": ["Get (Free)", "Obtener (Gratis)", "Holen (Kostenlos)", "Ottieni (Gratis)"],
        "Gratuit": ["Free", "Gratis", "Kostenlos", "Gratis"],
        "Indisponible": ["Unavailable", "No disponible", "Nicht verfügbar", "Non disponibile"],
        "Patientez...": ["Please wait...", "Espera...", "Bitte warten...", "Attendere..."],
        "Chargement...": ["Loading...", "Cargando...", "Wird geladen...", "Caricamento..."],
        "Chargement…": ["Loading…", "Cargando…", "Wird geladen…", "Caricamento…"],
        "Redirection sécurisée...": ["Secure redirect...", "Redirección segura...", "Sichere Weiterleitung...", "Reindirizzamento sicuro..."],
        "Téléchargement en arrière-plan...": ["Downloading in the background...", "Descargando en segundo plano...", "Download im Hintergrund...", "Download in background..."],
        "Désinstallation en cours...": ["Uninstalling...", "Desinstalando...", "Wird deinstalliert...", "Disinstallazione..."],

        // --- Boutique : panier, achat, cadeaux ---
        "Mon panier": ["My cart", "Mi carrito", "Mein Warenkorb", "Il mio carrello"],
        "Votre panier est vide": ["Your cart is empty", "Tu carrito está vacío", "Dein Warenkorb ist leer", "Il carrello è vuoto"],
        "Découvrez nos nouveautés dans le magasin.": ["Check out what's new in the store.", "Descubre las novedades en la tienda.", "Entdecke die Neuheiten im Shop.", "Scopri le novità nel negozio."],
        "Aller au magasin": ["Go to store", "Ir a la tienda", "Zum Shop", "Vai al negozio"],
        "Total": ["Total", "Total", "Gesamt", "Totale"],
        "Retirer": ["Remove", "Quitar", "Entfernen", "Rimuovi"],
        "Payer par carte": ["Pay by card", "Pagar con tarjeta", "Mit Karte bezahlen", "Paga con carta"],
        "Payer avec mon solde": ["Pay with my balance", "Pagar con mi saldo", "Mit meinem Guthaben bezahlen", "Paga con il mio saldo"],
        "Recharger mon solde": ["Top up my balance", "Recargar mi saldo", "Guthaben aufladen", "Ricarica il saldo"],
        "Le prix final est recalculé au paiement (promotions en cours).": ["The final price is recalculated at checkout (current deals).", "El precio final se recalcula al pagar (promociones vigentes).", "Der Endpreis wird beim Bezahlen neu berechnet (aktuelle Angebote).", "Il prezzo finale viene ricalcolato al pagamento (promozioni in corso)."],
        "🛒 Panier": ["🛒 Cart", "🛒 Carrito", "🛒 Warenkorb", "🛒 Carrello"],
        "🎁 Offrir": ["🎁 Gift", "🎁 Regalar", "🎁 Verschenken", "🎁 Regala"],
        "À qui ?": ["To whom?", "¿A quién?", "An wen?", "A chi?"],
        "Petit mot (facultatif)": ["Short message (optional)", "Mensaje (opcional)", "Nachricht (optional)", "Messaggio (facoltativo)"],
        "Avec mon solde": ["With my balance", "Con mi saldo", "Mit meinem Guthaben", "Con il mio saldo"],

        // --- Profil ---
        "Paramètres du compte": ["Account settings", "Ajustes de la cuenta", "Kontoeinstellungen", "Impostazioni account"],
        "Mot de passe et sécurité": ["Password & security", "Contraseña y seguridad", "Passwort & Sicherheit", "Password e sicurezza"],
        "Paiement et solde": ["Payment & balance", "Pago y saldo", "Zahlung & Guthaben", "Pagamento e saldo"],
        "Comptes associés": ["Linked accounts", "Cuentas vinculadas", "Verknüpfte Konten", "Account collegati"],
        "Comptes Associés": ["Linked accounts", "Cuentas vinculadas", "Verknüpfte Konten", "Account collegati"],
        "Contrôle parental": ["Parental controls", "Control parental", "Kindersicherung", "Controllo parentale"],
        "Contrôle Parental": ["Parental controls", "Control parental", "Kindersicherung", "Controllo parentale"],
        "Informations de compte": ["Account information", "Información de la cuenta", "Kontoinformationen", "Informazioni account"],
        "Gérez les détails de votre compte et votre apparence publique.": ["Manage your account details and public profile.", "Gestiona los datos de tu cuenta y tu perfil público.", "Verwalte deine Kontodaten und dein öffentliches Profil.", "Gestisci i dati del tuo account e il profilo pubblico."],
        "Téléverser une image": ["Upload an image", "Subir una imagen", "Bild hochladen", "Carica un'immagine"],
        "Format JPG ou PNG. Max 1 Mo.": ["JPG or PNG. Max 1 MB.", "JPG o PNG. Máx. 1 MB.", "JPG oder PNG. Max. 1 MB.", "JPG o PNG. Max 1 MB."],
        "Nom d'affichage (Pseudo)": ["Display name", "Nombre visible", "Anzeigename", "Nome visualizzato"],
        "Titre (Cosmétique)": ["Title (cosmetic)", "Título (cosmético)", "Titel (kosmetisch)", "Titolo (cosmetico)"],
        "NOVICE (Défaut)": ["NOVICE (Default)", "NOVATO (Por defecto)", "NEULING (Standard)", "NOVIZIO (Predefinito)"],
        "PIONNIER (Fondateur)": ["PIONEER (Founder)", "PIONERO (Fundador)", "PIONIER (Gründer)", "PIONIERE (Fondatore)"],
        "BÊTA TESTEUR": ["BETA TESTER", "BETA TESTER", "BETA-TESTER", "BETA TESTER"],
        "Adresse e-mail": ["Email address", "Correo electrónico", "E-Mail-Adresse", "Indirizzo e-mail"],
        "Détails personnels": ["Personal details", "Datos personales", "Persönliche Daten", "Dati personali"],
        "Ces informations sont privées et ne seront pas affichées.": ["This information is private and won't be shown.", "Esta información es privada y no se mostrará.", "Diese Angaben sind privat und werden nicht angezeigt.", "Queste informazioni sono private e non saranno mostrate."],
        "Prénom": ["First name", "Nombre", "Vorname", "Nome"],
        "Nom de famille": ["Last name", "Apellido", "Nachname", "Cognome"],
        "Adresse 1": ["Address line 1", "Dirección 1", "Adresse 1", "Indirizzo 1"],
        "Adresse 2": ["Address line 2", "Dirección 2", "Adresse 2", "Indirizzo 2"],
        "Ville": ["City", "Ciudad", "Stadt", "Città"],
        "Région / État": ["Region / State", "Región / Estado", "Region / Bundesland", "Regione / Stato"],
        "Code Postal": ["Postal code", "Código postal", "Postleitzahl", "CAP"],
        "Pays": ["Country", "País", "Land", "Paese"],
        "Enregistrer les modifications": ["Save changes", "Guardar cambios", "Änderungen speichern", "Salva modifiche"],
        "Profil mis à jour !": ["Profile updated!", "¡Perfil actualizado!", "Profil aktualisiert!", "Profilo aggiornato!"],
        "Zone de danger": ["Danger zone", "Zona de peligro", "Gefahrenbereich", "Zona pericolosa"],
        "La suppression de votre compte est définitive.": ["Deleting your account is permanent.", "Eliminar tu cuenta es definitivo.", "Das Löschen deines Kontos ist endgültig.", "L'eliminazione dell'account è definitiva."],
        "Supprimer mon compte": ["Delete my account", "Eliminar mi cuenta", "Mein Konto löschen", "Elimina il mio account"],
        "Confirmez votre identité :": ["Confirm your identity:", "Confirma tu identidad:", "Bestätige deine Identität:", "Conferma la tua identità:"],
        "Mot de passe": ["Password", "Contraseña", "Passwort", "Password"],
        "Annuler": ["Cancel", "Cancelar", "Abbrechen", "Annulla"],
        "Confirmer la suppression": ["Confirm deletion", "Confirmar eliminación", "Löschen bestätigen", "Conferma eliminazione"],
        "Changer le mot de passe": ["Change password", "Cambiar contraseña", "Passwort ändern", "Cambia password"],
        "Mot de passe actuel": ["Current password", "Contraseña actual", "Aktuelles Passwort", "Password attuale"],
        "Nouveau mot de passe (6 caractères min.)": ["New password (min. 6 characters)", "Nueva contraseña (mín. 6 caracteres)", "Neues Passwort (mind. 6 Zeichen)", "Nuova password (min. 6 caratteri)"],
        "Confirmer le nouveau mot de passe": ["Confirm new password", "Confirmar nueva contraseña", "Neues Passwort bestätigen", "Conferma nuova password"],
        "Mettre à jour le mot de passe": ["Update password", "Actualizar contraseña", "Passwort aktualisieren", "Aggiorna password"],
        "Authentification à deux facteurs (A2F)": ["Two-factor authentication (2FA)", "Autenticación en dos pasos (2FA)", "Zwei-Faktor-Authentifizierung (2FA)", "Autenticazione a due fattori (2FA)"],
        "Protégez votre compte des accès non autorisés : à chaque nouvelle connexion, un code vous sera demandé.": ["Protect your account: a code will be required at every new sign-in.", "Protege tu cuenta: se pedirá un código en cada nuevo inicio de sesión.", "Schütze dein Konto: Bei jeder neuen Anmeldung wird ein Code verlangt.", "Proteggi il tuo account: a ogni nuovo accesso verrà chiesto un codice."],
        "Application d'authentification": ["Authenticator app", "App de autenticación", "Authenticator-App", "App di autenticazione"],
        "Utilisez Google Authenticator, Authy ou 1Password.": ["Use Google Authenticator, Authy or 1Password.", "Usa Google Authenticator, Authy o 1Password.", "Nutze Google Authenticator, Authy oder 1Password.", "Usa Google Authenticator, Authy o 1Password."],
        "Authentification par E-mail": ["Email authentication", "Autenticación por correo", "E-Mail-Authentifizierung", "Autenticazione via e-mail"],
        "Recevez un code à votre e-mail.": ["Receive a code by email.", "Recibe un código por correo.", "Erhalte einen Code per E-Mail.", "Ricevi un codice via e-mail."],
        "Activer": ["Enable", "Activar", "Aktivieren", "Attiva"],
        "Désactiver": ["Disable", "Desactivar", "Deaktivieren", "Disattiva"],
        "Valider": ["Confirm", "Validar", "Bestätigen", "Conferma"],
        "Clé manuelle :": ["Manual key:", "Clave manual:", "Manueller Schlüssel:", "Chiave manuale:"],
        "Scannez le QR code avec votre application, puis saisissez le code à 6 chiffres affiché.": ["Scan the QR code with your app, then enter the 6-digit code shown.", "Escanea el código QR con tu app e introduce el código de 6 cifras.", "Scanne den QR-Code mit deiner App und gib den 6-stelligen Code ein.", "Scansiona il codice QR con l'app e inserisci il codice a 6 cifre."],
        "Notez ces codes de secours maintenant.": ["Write down these backup codes now.", "Anota estos códigos de respaldo ahora.", "Notiere dir jetzt diese Backup-Codes.", "Annota subito questi codici di backup."],
        "Ils permettent de vous connecter si vous perdez votre téléphone. Chacun ne sert qu'une fois et ils ne seront plus affichés.": ["They let you sign in if you lose your phone. Each works once and they won't be shown again.", "Te permiten entrar si pierdes el móvil. Cada uno sirve una vez y no se volverán a mostrar.", "Damit kannst du dich anmelden, wenn du dein Handy verlierst. Jeder gilt einmal und wird nicht erneut angezeigt.", "Ti permettono di accedere se perdi il telefono. Ognuno vale una volta e non verranno più mostrati."],
        "Copier les codes": ["Copy codes", "Copiar códigos", "Codes kopieren", "Copia i codici"],
        "C'est noté": ["Got it", "Anotado", "Notiert", "Fatto"],
        "Saisissez le code à 6 chiffres envoyé à votre adresse e-mail.": ["Enter the 6-digit code sent to your email.", "Introduce el código de 6 cifras enviado a tu correo.", "Gib den 6-stelligen Code aus deiner E-Mail ein.", "Inserisci il codice a 6 cifre inviato alla tua e-mail."],
        "Portefeuille Novaly": ["Novaly wallet", "Monedero Novaly", "Novaly-Wallet", "Portafoglio Novaly"],
        "Solde actuel": ["Current balance", "Saldo actual", "Aktuelles Guthaben", "Saldo attuale"],
        "Ajouter des fonds": ["Add funds", "Añadir fondos", "Guthaben hinzufügen", "Aggiungi fondi"],
        "Crédit utilisable pour acheter des jeux sur Novaly, non remboursable.": ["Credit for buying games on Novaly, non-refundable.", "Crédito para comprar juegos en Novaly, no reembolsable.", "Guthaben für Spielekäufe auf Novaly, nicht erstattbar.", "Credito per acquistare giochi su Novaly, non rimborsabile."],
        "Moyens de paiement": ["Payment methods", "Métodos de pago", "Zahlungsmethoden", "Metodi di pagamento"],
        "+ Ajouter une carte": ["+ Add a card", "+ Añadir una tarjeta", "+ Karte hinzufügen", "+ Aggiungi una carta"],
        "Vos cartes sont enregistrées en toute sécurité par": ["Your cards are stored securely by", "Tus tarjetas se guardan de forma segura con", "Deine Karten werden sicher gespeichert von", "Le tue carte sono salvate in sicurezza da"],
        ". Novaly ne voit ni ne conserve jamais votre numéro de carte.": [". Novaly never sees or stores your card number.", ". Novaly nunca ve ni guarda el número de tu tarjeta.", ". Novaly sieht oder speichert deine Kartennummer nie.", ". Novaly non vede né conserva mai il numero della carta."],
        "Supprimer": ["Delete", "Eliminar", "Löschen", "Elimina"],
        "Lier": ["Link", "Vincular", "Verknüpfen", "Collega"],
        "Délier": ["Unlink", "Desvincular", "Trennen", "Scollega"],
        "Non lié": ["Not linked", "Sin vincular", "Nicht verknüpft", "Non collegato"],
        "Saisissez un code pour débloquer un jeu dans votre bibliothèque.": ["Enter a code to unlock a game in your library.", "Introduce un código para desbloquear un juego.", "Gib einen Code ein, um ein Spiel freizuschalten.", "Inserisci un codice per sbloccare un gioco."],
        "Valider le code": ["Redeem code", "Canjear código", "Code einlösen", "Riscatta codice"],
        "Le Contrôle Parental est désactivé": ["Parental controls are off", "El control parental está desactivado", "Die Kindersicherung ist aus", "Il controllo parentale è disattivato"],
        "Le Contrôle Parental est activé 🔒": ["Parental controls are on 🔒", "El control parental está activado 🔒", "Die Kindersicherung ist an 🔒", "Il controllo parentale è attivo 🔒"],
        "Restreignez les achats, coupez le chat et filtrez les jeux par classification d'âge (PEGI). Un code PIN protège ces réglages.": ["Restrict purchases, turn off chat and filter games by age rating (PEGI). A PIN protects these settings.", "Limita las compras, desactiva el chat y filtra juegos por edad (PEGI). Un PIN protege estos ajustes.", "Käufe einschränken, Chat abschalten und Spiele nach Altersfreigabe (PEGI) filtern. Eine PIN schützt diese Einstellungen.", "Limita gli acquisti, disattiva la chat e filtra i giochi per età (PEGI). Un PIN protegge queste impostazioni."],
        "Bloquer tous les achats (et les recharges)": ["Block all purchases (and top-ups)", "Bloquear todas las compras (y recargas)", "Alle Käufe (und Aufladungen) sperren", "Blocca tutti gli acquisti (e le ricariche)"],
        "Couper le chat avec les amis": ["Turn off chat with friends", "Desactivar el chat con amigos", "Chat mit Freunden abschalten", "Disattiva la chat con gli amici"],
        "Âge maximum des jeux": ["Maximum game age rating", "Edad máxima de los juegos", "Maximale Altersfreigabe", "Età massima dei giochi"],
        "Aucune limite": ["No limit", "Sin límite", "Keine Grenze", "Nessun limite"],
        "Code PIN (4 à 6 chiffres)": ["PIN (4 to 6 digits)", "PIN (4 a 6 cifras)", "PIN (4 bis 6 Ziffern)", "PIN (da 4 a 6 cifre)"],
        "Nouveau PIN (facultatif)": ["New PIN (optional)", "Nuevo PIN (opcional)", "Neue PIN (optional)", "Nuovo PIN (facoltativo)"],
        "Activer le contrôle parental": ["Turn on parental controls", "Activar el control parental", "Kindersicherung aktivieren", "Attiva il controllo parentale"],
        "Désactiver (code PIN requis)": ["Turn off (PIN required)", "Desactivar (PIN obligatorio)", "Deaktivieren (PIN erforderlich)", "Disattiva (PIN richiesto)"],

        // --- Jeux en ligne, chat, contact ---
        "Choisissez votre mode de jeu :": ["Choose your game mode:", "Elige tu modo de juego:", "Wähle deinen Spielmodus:", "Scegli la modalità di gioco:"],
        "Lancer publiquement": ["Play public match", "Partida pública", "Öffentliches Spiel", "Partita pubblica"],
        "Partie privée": ["Private match", "Partida privada", "Privates Spiel", "Partita privata"],
        "Rejoindre avec un code :": ["Join with a code:", "Unirse con un código:", "Mit Code beitreten:", "Entra con un codice:"],
        "Créer une nouvelle salle privée": ["Create a new private room", "Crear una sala privada", "Neuen privaten Raum erstellen", "Crea una nuova stanza privata"],
        "Quitter le jeu": ["Quit game", "Salir del juego", "Spiel verlassen", "Esci dal gioco"],
        "Plein Écran": ["Full screen", "Pantalla completa", "Vollbild", "Schermo intero"],
        "Écrire un message...": ["Write a message...", "Escribe un mensaje...", "Nachricht schreiben...", "Scrivi un messaggio..."],
        "Inviter à jouer": ["Invite to play", "Invitar a jugar", "Zum Spielen einladen", "Invita a giocare"],
        "Votre e-mail": ["Your email", "Tu correo", "Deine E-Mail", "La tua e-mail"],
        "pour que l'on puisse vous répondre": ["so we can reply to you", "para poder responderte", "damit wir dir antworten können", "per poterti rispondere"],

        // --- À propos, pied de page ---
        "À propos de Novaly": ["About Novaly", "Acerca de Novaly", "Über Novaly", "Informazioni su Novaly"],
        "Tous les systèmes sont opérationnels.": ["All systems operational.", "Todos los sistemas operativos.", "Alle Systeme funktionieren.", "Tutti i sistemi sono operativi."],
        "Vérifier les mises à jour": ["Check for updates", "Buscar actualizaciones", "Nach Updates suchen", "Controlla aggiornamenti"],
        "Téléchargez Novaly": ["Download Novaly", "Descarga Novaly", "Novaly herunterladen", "Scarica Novaly"],
        "Télécharger Novaly": ["Download Novaly", "Descargar Novaly", "Novaly herunterladen", "Scarica Novaly"],
        "Aide": ["Help", "Ayuda", "Hilfe", "Aiuto"],
        "Support": ["Support", "Soporte", "Support", "Supporto"],
        "Tous droits réservés.": ["All rights reserved.", "Todos los derechos reservados.", "Alle Rechte vorbehalten.", "Tutti i diritti riservati."],
        "Bientôt disponible": ["Coming soon", "Próximamente", "Demnächst", "Prossimamente"],
        "Bientôt": ["Soon", "Pronto", "Bald", "Presto"]
    };

    // Textes avec une partie variable (prix, version…) : [motif, [en, es, de, it]] ; $1 = partie variable
    const MOTIFS = [
        [/^Acheter \((.+)\)$/, ["Buy ($1)", "Comprar ($1)", "Kaufen ($1)", "Acquista ($1)"]],
        [/^Acheter (.+)$/, ["Buy $1", "Comprar $1", "Kaufen $1", "Acquista $1"]],
        [/^Mettre à jour \((.+)\)$/, ["Update ($1)", "Actualizar ($1)", "Aktualisieren ($1)", "Aggiorna ($1)"]],
        [/^Pas encore disponible sur (.+)$/, ["Not yet available on $1", "Aún no disponible en $1", "Noch nicht verfügbar für $1", "Non ancora disponibile su $1"]],
        [/^Solde insuffisant : il manque (.+)\.$/, ["Insufficient balance: $1 missing.", "Saldo insuficiente: faltan $1.", "Guthaben reicht nicht: es fehlen $1.", "Saldo insufficiente: mancano $1."]],
        [/^Version du Launcher : (.+)$/, ["Launcher version: $1", "Versión del launcher: $1", "Launcher-Version: $1", "Versione del launcher: $1"]]
    ];

    let langue = 'fr';
    const originaux = new WeakMap();   // nœud -> texte français d'origine
    const ATTRIBUTS = ['placeholder', 'title', 'aria-label'];

    function traduireTexte(fr) {
        const i = LANGUES[langue];
        if (i === undefined) return fr;
        const net = fr.trim().replace(/\s+/g, ' ');
        if (!net) return fr;
        let t = DICO[net] ? DICO[net][i] : null;
        if (!t) for (const [motif, trad] of MOTIFS) {
            const m = net.match(motif);
            if (m) { t = trad[i].replace('$1', m[1]); break; }
        }
        if (!t) return fr;
        // on garde les espaces autour du texte d'origine
        const avant = fr.match(/^\s*/)[0], apres = fr.match(/\s*$/)[0];
        return avant + t + apres;
    }

    function ignorer(el) {
        return !el || el.closest('script, style, code, pre, [data-i18n], [data-sans-traduction], input[type="hidden"]');
    }

    function traiterNoeud(n) {
        if (n.nodeType === 3) {
            if (ignorer(n.parentElement)) return;
            if (!originaux.has(n)) originaux.set(n, n.nodeValue);
            const fr = originaux.get(n);
            const t = langue === 'fr' ? fr : traduireTexte(fr);
            if (n.nodeValue !== t) n.nodeValue = t;
        } else if (n.nodeType === 1) {
            if (ignorer(n)) return;
            for (const a of ATTRIBUTS) {
                if (!n.hasAttribute(a)) continue;
                const cle = 'data-fr-' + a;
                if (!n.hasAttribute(cle)) n.setAttribute(cle, n.getAttribute(a));
                const fr = n.getAttribute(cle);
                n.setAttribute(a, langue === 'fr' ? fr : traduireTexte(fr));
            }
            const w = document.createTreeWalker(n, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
            let c = w.nextNode();
            while (c) { if (c.nodeType === 3) traiterNoeud(c); else traiterAttributs(c); c = w.nextNode(); }
        }
    }
    function traiterAttributs(el) {
        if (ignorer(el)) return;
        for (const a of ATTRIBUTS) {
            if (!el.hasAttribute(a)) continue;
            const cle = 'data-fr-' + a;
            if (!el.hasAttribute(cle)) el.setAttribute(cle, el.getAttribute(a));
            el.setAttribute(a, langue === 'fr' ? el.getAttribute(cle) : traduireTexte(el.getAttribute(cle)));
        }
    }

    // Les textes ajoutés ou modifiés par le JavaScript sont traduits au vol.
    let enCours = false;
    const observateur = new MutationObserver((mutations) => {
        if (enCours || langue === 'fr') return;
        enCours = true;
        for (const m of mutations) {
            if (m.type === 'characterData') { originaux.set(m.target, m.target.nodeValue); traiterNoeud(m.target); }
            else m.addedNodes.forEach(n => { if (n.nodeType === 3) originaux.set(n, n.nodeValue); traiterNoeud(n); });
        }
        observateur.takeRecords();
        enCours = false;
    });

    window.traduirePage = function (code) {
        langue = LANGUES[code] !== undefined ? code : 'fr';
        document.documentElement.lang = langue;
        enCours = true;
        traiterNoeud(document.body);
        observateur.takeRecords();
        enCours = false;
        observateur.observe(document.body, { childList: true, subtree: true, characterData: true });
    };
    window.traduireTexte = (fr) => traduireTexte(fr);
})();
