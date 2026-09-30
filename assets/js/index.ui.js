        // 1. GESTION DU PLEIN ÉCRAN
        window.toggleFullscreen = function() {
            const container = document.getElementById('game-container');
            if (!document.fullscreenElement) {
                if(container.requestFullscreen) {
                    container.requestFullscreen().catch(err => console.log(err));
                }
            } else {
                if(document.exitFullscreen) {
                    document.exitFullscreen();
                }
            }
        };

        // 2. RETRAIT DE L'EFFET SKELETON APRÈS 1.5 SECONDES
// 2. RETRAIT DE L'EFFET SKELETON ET CHARGEMENT DE LA LANGUE
window.addEventListener('DOMContentLoaded', () => {
    // Retrait du skeleton
    setTimeout(() => {
        document.querySelectorAll('.skeleton').forEach(el => el.classList.remove('skeleton'));
    }, 1500);

    // --- NOUVEAU : Appliquer la langue sauvegardée ---
    const savedLang = localStorage.getItem('novaly_lang') || 'fr';

    // Petit dictionnaire pour faire correspondre la langue au bon drapeau
    const flags = {
        'fr': 'https://flagcdn.com/w40/fr.png',
        'en': 'https://flagcdn.com/w40/gb.png',
        'es': 'https://flagcdn.com/w40/es.png',
        'de': 'https://flagcdn.com/w40/de.png',
        'it': 'https://flagcdn.com/w40/it.png'
    };

    // On force l'affichage avec la langue sauvegardée
    changeLanguage(savedLang, flags[savedLang]);
});

// 3. ANIMATION MOTION "NOVALY" (SPOTLIGHT) FIXÉ
        const motionContainer = document.getElementById('motion-container');
        const motionLogo = document.getElementById('motion-logo');
        if (motionContainer && motionLogo) {
            motionContainer.addEventListener('mousemove', (e) => {
                if (window.innerWidth > 768) { // Appliquer uniquement sur les écrans plus larges que mobile
                    motionLogo.classList.add('active-light'); // Allume la lumière
                    const rect = motionLogo.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const y = e.clientY - rect.top;
                    motionLogo.style.setProperty('--mouse-x', `${x}px`);
                    motionLogo.style.setProperty('--mouse-y', `${y}px`);
                }
            });

            motionContainer.addEventListener('mouseleave', () => {
                if (window.innerWidth > 768) { // Appliquer uniquement sur les écrans plus larges que mobile
                    motionLogo.classList.remove('active-light'); // Éteint la lumière
                }
            });
        }
        const translations = {
            fr: {
                navStore: "Magasin", navOnline: "Jeux Rapide", navLibrary: "Bibliothèque", navCommunity: "Communauté", navAbout: "À propos", navCart: "Panier", navContact: "Contactez-nous",
                searchPh: "Rechercher un jeu...", onlineStatus: "En ligne",
                bannerTitle: "Cyberpunk Adventures", bannerDesc: "Découvrez la nouvelle extension majeure. Explorez de nouveaux territoires et forgez votre propre destin.", bannerBtn: "Acheter Maintenant",
                storeSubtitle: "Nouveautés et Tendances", searchResults: "Résultats de recherche...", readyToPlay: "Prêt à jouer",
                communityTitle: "Communauté Novaly", communityDesc: "Rejoignez la discussion, partagez vos créations et trouvez des coéquipiers.",
                commNews1Title: "📢 Mise à jour v1.2 : Patch Notes", commNews1Desc: "Découvrez toutes les nouveautés, corrections de bugs et équilibrages apportés par la dernière mise à jour.",
                commNews2Title: "🏆 Tournoi Galactic Warfare", commNews2Desc: "Les inscriptions pour le tournoi d'été sont ouvertes ! Constituez votre équipe et tentez de remporter le grand prix.",
                commNews3Title: "🎨 Créations de la semaine", commNews3Desc: "Découvrez les mods et les fan-arts les plus populaires votés par les joueurs cette semaine.",
                aboutTitle: "À propos de Novaly", aboutDesc1: "Novaly est votre plateforme de jeu de nouvelle génération, conçue pour offrir des performances optimales, une bibliothèque unifiée et une expérience utilisateur fluide sans distraction.",
                aboutVersion: "Version du Launcher :  <span class='app-version'></span>", aboutStatus: "Tous les systèmes sont opérationnels.", aboutBtn: "Vérifier les mises à jour",
                cartEmpty: "Votre panier est vide", cartDesc: "Découvrez nos nouveautés dans le magasin.", goStore: "Aller au magasin",
                contactTitle: "Nous contacter", contactSubject: "Sujet", contactMessage: "Message", contactBtn: "Envoyer le message",
                tabPublic: "Profil Public", tabSecurity: "Sécurité & Connexion", tabPayment: "Moyens de paiement",
                profName: "Nom d'utilisateur", profSave: "Enregistrer les modifications", profSaved: "Profil mis à jour !",
                footerAppsTitle: "Téléchargez Novaly", footerHelpTitle: "Aide", footerNovalyTitle: "Novaly", footerRights: "Tous droits réservés.",
                title_store: "Magasin", title_online: "Jeux Rapide", title_library: "Bibliothèque", title_community: "Communauté", title_about: "À propos", title_cart: "Mon Panier", title_contact: "Nous Contacter", title_profile: "Paramètres"
            },
            en: {
                navStore: "Store", navOnline: "Online Games", navLibrary: "Library", navCommunity: "Community", navAbout: "About", navCart: "Cart", navContact: "Contact Us",
                searchPh: "Search for a game...", onlineStatus: "Online",
                bannerTitle: "Cyberpunk Adventures", bannerDesc: "Discover the new major expansion. Explore new territories and forge your own destiny.", bannerBtn: "Buy Now",
                storeSubtitle: "New & Trending", searchResults: "Search Results...", readyToPlay: "Ready to Play",
                communityTitle: "Novaly Community", communityDesc: "Join the discussion, share your creations, and find teammates.",
                commNews1Title: "📢 Update v1.2 : Patch Notes", commNews1Desc: "Discover all the new features, bug fixes, and balancing brought by the latest update.",
                commNews2Title: "🏆 Galactic Warfare Tournament", commNews2Desc: "Registrations for the summer tournament are open! Form your team and try to win the grand prize.",
                commNews3Title: "🎨 Creations of the week", commNews3Desc: "Check out the most popular mods and fan-arts voted by players this week.",
                aboutTitle: "About Novaly", aboutDesc1: "Novaly is your next-generation gaming platform, designed to offer optimal performance, a unified library, and a seamless distraction-free user experience.",
                aboutVersion: "Launcher Version: <span class='app-version'></span>", aboutStatus: "All systems operational.", aboutBtn: "Check for updates",
                cartEmpty: "Your cart is empty", cartDesc: "Check out our new releases in the store.", goStore: "Go to Store",
                contactTitle: "Contact Us", contactSubject: "Subject", contactMessage: "Message", contactBtn: "Send Message",
                tabPublic: "Public Profile", tabSecurity: "Security & Login", tabPayment: "Payment Methods",
                profName: "Username", profSave: "Save Changes", profSaved: "Profile updated!",
                footerAppsTitle: "Download Novaly", footerHelpTitle: "Help", footerNovalyTitle: "Novaly", footerRights: "All rights reserved.",
                title_store: "Store", title_online: "Online Games", title_library: "Library", title_community: "Community", title_about: "About", title_cart: "My Cart", title_contact: "Contact Us", title_profile: "Settings"
            },
            es: {
                navStore: "Tienda", navOnline: "Juegos Online", navLibrary: "Biblioteca", navCommunity: "Comunidad", navAbout: "Acerca de", navCart: "Carrito", navContact: "Contáctenos",
                searchPh: "Buscar un juego...", onlineStatus: "En línea",
                bannerTitle: "Cyberpunk Adventures", bannerDesc: "Descubre la nueva expansión mayor. Explora nuevos territorios y forja tu propio destino.", bannerBtn: "Comprar Ahora",
                storeSubtitle: "Novedades y Tendencias", searchResults: "Resultados de búsqueda...", readyToPlay: "Listo para jugar",
                communityTitle: "Comunidad Novaly", communityDesc: "Únete a la discusión, comparte tus creaciones y encuentra compañeros de equipo.",
                commNews1Title: "📢 Actualización v1.2 : Notas del Parche", commNews1Desc: "Descubre todas las novedades, correcciones de errores y ajustes de equilibrio de la última actualización.",
                commNews2Title: "🏆 Torneo Galactic Warfare", commNews2Desc: "¡Las inscripciones para el torneo de verano están abiertas! Forma tu equipo y compite por el gran premio.",
                commNews3Title: "🎨 Creaciones de la semana", commNews3Desc: "Descubre los mods y fan-arts más populares votados por los jugadores esta semana.",
                aboutTitle: "Acerca de Novaly", aboutDesc1: "Novaly es tu plataforma de juegos de próxima generación, diseñada para ofrecer un rendimiento óptimo y una experiencia fluida sin distracciones.",
                aboutVersion: "Versión del Launcher: <span class='app-version'></span>", aboutStatus: "Todos los sistemas operativos.", aboutBtn: "Buscar actualizaciones",
                cartEmpty: "Tu carrito está vacío", cartDesc: "Descubre nuestras novedades en la tienda.", goStore: "Ir a la tienda",
                contactTitle: "Contáctenos", contactSubject: "Asunto", contactMessage: "Mensaje", contactBtn: "Enviar mensaje",
                tabPublic: "Perfil Público", tabSecurity: "Seguridad e Inicio", tabPayment: "Métodos de pago",
                profName: "Nombre de usuario", profSave: "Guardar cambios", profSaved: "¡Perfil actualizado!",
                footerAppsTitle: "Descargar Novaly", footerHelpTitle: "Ayuda", footerNovalyTitle: "Novaly", footerRights: "Todos los derechos reservados.",
                title_store: "Tienda", title_online: "Juegos Online", title_library: "Biblioteca", title_community: "Comunidad", title_about: "Acerca de", title_cart: "Mi Carrito", title_contact: "Contáctenos", title_profile: "Ajustes"
            },
            de: {
                navStore: "Shop", navOnline: "Online-Spiele", navLibrary: "Bibliothek", navCommunity: "Gemeinschaft", navAbout: "Über uns", navCart: "Warenkorb", navContact: "Kontakt",
                searchPh: "Spiel suchen...", onlineStatus: "Online",
                bannerTitle: "Cyberpunk Adventures", bannerDesc: "Entdecken Sie die neue große Erweiterung. Erkunden Sie neue Gebiete und schmieden Sie Ihr eigenes Schicksal.", bannerBtn: "Jetzt Kaufen",
                storeSubtitle: "Neu & im Trend", searchResults: "Suchergebnisse...", readyToPlay: "Bereit zum Spielen",
                communityTitle: "Novaly Gemeinschaft", communityDesc: "Tritt der Diskussion bei, teile deine Kreationen und finde Teamkollegen.",
                commNews1Title: "📢 Update v1.2 : Patchnotes", commNews1Desc: "Entdecken Sie alle neuen Funktionen, Fehlerbehebungen und Anpassungen des neuesten Updates.",
                commNews2Title: "🏆 Galactic Warfare Turnier", commNews2Desc: "Die Anmeldungen für das Sommerturnier sind eröffnet! Bilde dein Team und gewinne den Hauptpreis.",
                commNews3Title: "🎨 Kreationen der Woche", commNews3Desc: "Sieh dir die beliebtesten Mods und Fan-Arts an, die diese Woche von den Spielern gewählt wurden.",
                aboutTitle: "Über Novaly", aboutDesc1: "Novaly ist Ihre Gaming-Plattform der nächsten Generation, entwickelt für optimale Leistung und ein nahtloses Benutzererlebnis.",
                aboutVersion: "Launcher-Version: <span class='app-version'></span>", aboutStatus: "Alle Systeme sind betriebsbereit.", aboutBtn: "Nach Updates suchen",
                cartEmpty: "Dein Warenkorb ist leer", cartDesc: "Entdecke unsere Neuheiten im Shop.", goStore: "Zum Shop",
                contactTitle: "Kontaktiere uns", contactSubject: "Betreff", contactMessage: "Nachricht", contactBtn: "Nachricht senden",
                tabPublic: "Öffentliches Profil", tabSecurity: "Sicherheit & Login", tabPayment: "Zahlungsmethoden",
                profName: "Benutzername", profSave: "Änderungen speichern", profSaved: "Profil aktualisiert!",
                footerAppsTitle: "Novaly Herunterladen", footerHelpTitle: "Hilfe", footerNovalyTitle: "Novaly", footerRights: "Alle Rechte vorbehalten.",
                title_store: "Shop", title_online: "Online-Spiele", title_library: "Bibliothek", title_community: "Gemeinschaft", title_about: "Über uns", title_cart: "Mein Warenkorb", title_contact: "Kontakt", title_profile: "Einstellungen"
            },
            it: {
                navStore: "Negozio", navOnline: "Giochi Online", navLibrary: "Libreria", navCommunity: "Comunità", navAbout: "Chi siamo", navCart: "Carrello", navContact: "Contattaci",
                searchPh: "Cerca un gioco...", onlineStatus: "Online",
                bannerTitle: "Cyberpunk Adventures", bannerDesc: "Scopri la nuova grande espansione. Esplora nuovi territori e forgia il tuo destino.", bannerBtn: "Acquista Ora",
                storeSubtitle: "Novità e Tendenze", searchResults: "Risultati della ricerca...", readyToPlay: "Pronto per giocare",
                communityTitle: "Comunità Novaly", communityDesc: "Unisciti alla discussione, condividi le tue creazioni e trova compagni di squadra.",
                commNews1Title: "📢 Aggiornamento v1.2: Note sulla patch", commNews1Desc: "Scopri tutte le novità, le correzioni di bug e i bilanciamenti apportati dall'ultimo aggiornamento.",
                commNews2Title: "🏆 Torneo Galactic Warfare", commNews2Desc: "Le iscrizioni per il torneo estivo sono aperte! Forma la tua squadra e prova a vincere il primo premio.",
                commNews3Title: "🎨 Creazioni della settimana", commNews3Desc: "Scopri le mod e le fan-art più popolari votate dai giocatori questa settimana.",
                aboutTitle: "Informazioni su Novaly", aboutDesc1: "Novaly è la tua piattaforma di gioco di nuova generazione, progettata per offrire prestazioni ottimali e un'esperienza fluida.",
                aboutVersion: "Versione Launcher: <span class='app-version'></span>", aboutStatus: "Tutti i sistemi sono operativi.", aboutBtn: "Verifica aggiornamenti",
                cartEmpty: "Il tuo carrello è vuoto", cartDesc: "Scopri le nostre novità nel negozio.", goStore: "Vai al negozio",
                contactTitle: "Contattaci", contactSubject: "Oggetto", contactMessage: "Messaggio", contactBtn: "Invia messaggio",
                tabPublic: "Profilo Pubblico", tabSecurity: "Sicurezza e Accesso", tabPayment: "Metodi di pagamento",
                profName: "Nome utente", profSave: "Salva modifiche", profSaved: "Profilo aggiornato!",
                footerAppsTitle: "Scarica Novaly", footerHelpTitle: "Aiuto", footerNovalyTitle: "Novaly", footerRights: "Tutti i diritti riservati.",
                title_store: "Negozio", title_online: "Giochi Online", title_library: "Libreria", title_community: "Comunità", title_about: "Chi siamo", title_cart: "Il mio Carrello", title_contact: "Contattaci", title_profile: "Impostazioni"
            }
        };

        let currentLang = 'fr';
        let currentViewId = 'store';

        function toggleLangMenu() {
            document.getElementById('lang-menu').classList.toggle('show');
        }

        function changeLanguage(langCode, flagUrl) {
            currentLang = langCode;

            // --- NOUVEAU : Sauvegarde la langue dans le navigateur ---
            localStorage.setItem('novaly_lang', langCode);

            document.getElementById('lang-btn').innerHTML = `<img src="${flagUrl}" alt="${langCode}" class="flag-icon">`;
            document.getElementById('lang-menu').classList.remove('show');

            const t = translations[langCode] || translations['en'];

            document.querySelectorAll('[data-i18n]').forEach(el => {
                const key = el.getAttribute('data-i18n');
                if(t[key]) el.textContent = t[key];
            });

            document.querySelectorAll('[data-i18n-ph]').forEach(el => {
                const key = el.getAttribute('data-i18n-ph');
                if(t[key]) el.placeholder = t[key];
            });

            updatePageTitle();
        }

        const searchInput = document.getElementById('main-search-bar');
        searchInput.addEventListener('input', function(e) {
            const termeRecherche = e.target.value.toLowerCase();
            document.querySelectorAll('.game-card').forEach(carte => {
                const titreElement = carte.querySelector('.game-title');
                if (titreElement) {
                    carte.style.display = titreElement.textContent.toLowerCase().includes(termeRecherche) ? '' : 'none';
                }
            });

            const banner = document.getElementById('store-banner');
            const subtitle = document.getElementById('store-subtitle');
            if(banner && subtitle) {
                if(termeRecherche.length > 0) {
                    banner.style.display = 'none';
                    subtitle.textContent = translations[currentLang].searchResults;
                } else {
                    banner.style.display = 'flex';
                    subtitle.textContent = translations[currentLang].storeSubtitle;
                }
            }
        });

        function navigateTo(path, viewId) {
            currentViewId = viewId;
            window.history.pushState({ viewId: viewId }, "", path);
            renderView(viewId);
        }

        function renderView(viewId) {
            document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
            document.querySelectorAll('.nav-item, .footer-link').forEach(el => el.classList.remove('active'));

            let viewElement = document.getElementById('view-' + viewId);
            if (viewElement) viewElement.classList.add('active');

            let navItem = document.getElementById('nav-' + viewId);
            if(navItem) navItem.classList.add('active');

            if(searchInput.value !== "") {
                searchInput.value = '';
                searchInput.dispatchEvent(new Event('input')); 
            }

            document.querySelector('.content').scrollTop = 0;

            // Gestion du scroll du sidebar de profil sur mobile
            if (viewId === 'profile') {
                const sidebar = document.getElementById('profileSidebar');
                if (sidebar) sidebar.scrollLeft = 0;
            }

            updatePageTitle();
        }

        function updatePageTitle() {
            let pageTitleEl = document.getElementById('dynamic-page-title');
            if (currentViewId === 'store') {
                pageTitleEl.style.display = 'none';
            } else {
                pageTitleEl.style.display = 'block';
                pageTitleEl.textContent = translations[currentLang]["title_" + currentViewId] || "";
            }
        }

        function switchProfileTab(tabId, element) {
            document.querySelectorAll('.profile-tab').forEach(el => el.classList.remove('active'));
            document.querySelectorAll('.profile-tab-content').forEach(el => el.classList.remove('active'));
            element.classList.add('active');
            document.getElementById('tab-' + tabId).classList.add('active');

            // Auto-scroll pour rendre l'onglet visible sur mobile
            const sidebar = document.getElementById('profileSidebar');
            if (sidebar && window.innerWidth <= 1024) {
                sidebar.scrollTo({
                    left: element.offsetLeft - 20,
                    behavior: 'smooth'
                });
            }
        }

        function previewAvatar(event) {
            const file = event.target.files[0];
            if (file) {
                const url = URL.createObjectURL(file);
                document.getElementById('profile-avatar-preview').style.backgroundImage = `url(${url})`;
            }
        }

        function toggleMobileMenu() {
            document.querySelector('.main-header').classList.toggle('open');
        }

        document.querySelectorAll('.nav-item').forEach(item => {
            // Ne pas fermer si on clique sur un trigger de dropdown
            if(!item.classList.contains('profile-trigger') && !item.classList.contains('friends-btn')) {
                item.addEventListener('click', () => {
                    document.querySelector('.main-header').classList.remove('open');
                });
            }
        });

        // ================= GESTION DES MENUS (PROFIL & AMIS) =================
        function toggleUserMenu(event) {
            event.stopPropagation();
            document.getElementById('user-dropdown').classList.toggle('show');
            const friendsMenu = document.getElementById('friends-dropdown');
            if(friendsMenu) friendsMenu.classList.remove('show');
        }

        function toggleFriendsMenu(event) {
            event.stopPropagation();
            document.getElementById('friends-dropdown').classList.toggle('show');
            const userMenu = document.getElementById('user-dropdown');
            if(userMenu) userMenu.classList.remove('show');
        }

        window.addEventListener('click', function(event) {
            const langWrapper = document.querySelector('.lang-wrapper');
            if (langWrapper && !langWrapper.contains(event.target)) {
                document.getElementById('lang-menu').classList.remove('show');
            }

            const userDropdown = document.getElementById('user-dropdown');
            if (userDropdown && userDropdown.classList.contains('show') && !event.target.closest('.user-section')) {
                userDropdown.classList.remove('show');
            }

            const friendsDropdown = document.getElementById('friends-dropdown');
            if (friendsDropdown && friendsDropdown.classList.contains('show') && !event.target.closest('#friends-menu-container')) {
                friendsDropdown.classList.remove('show');
            }
        });

        window.addEventListener('popstate', (event) => {
            if (event.state && event.state.viewId) {
                renderView(event.state.viewId);
            } else {
                renderView('store'); // Vue par défaut
        }
        });
        window.afficherAlerte = function(message) {
    document.getElementById('novaly-alert-text').innerText = message;
    document.getElementById('novaly-alert').style.display = 'flex';
};
