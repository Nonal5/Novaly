#!/bin/bash

echo "⬆️ Incrémentation de la version..."
cd novaly-launcher || exit
npm version patch --no-git-tag-version
VERSION=$(node -p "require('./package.json').version")

echo "🔨 Compilation de Tauri pour générer le tar.gz..."
# Lance la création de l'application et de l'archive
npm run tauri build

echo "📦 Sauvegarde de TOUT le projet (Site web + Launcher)..."
cd ..
git add -A
git commit -m "Préparation de la v$VERSION"

echo "🏷️ Création du tag officiel v$VERSION..."
git tag v$VERSION

echo "🚀 Envoi du code et des tags vers GitHub..."
git push origin main --tags

echo "🚚 Déplacement du tar.gz sur le Bureau..."
# On récupère le tar.gz tout juste généré et on le met sur ton bureau avec le bon nom
cp novaly-launcher/src-tauri/target/release/bundle/macos/*.tar.gz ~/Desktop/Novaly_aarch64.app.tar.gz

echo "💬 Préparation de l'annonce Discord..."
# Le script te demande le texte qui sera affiché en gras sur Discord !
read -p "Titre de la mise à jour (pour l'annonce Discord) : " COMMENTAIRE

echo "🎉 Création de la Release sur GitHub (Déclenchement du bot Discord)..."
# Crée la release publique. C'est ÇA qui va activer ta GitHub Action.
gh release create v$VERSION --title "$COMMENTAIRE" --notes "Mise à jour automatique v$VERSION"

echo "✅ Fichier patch terminé ! La release est en ligne et ton bot Discord est prévenu."
echo "👉 Tu peux maintenant lancer ./maj.sh"