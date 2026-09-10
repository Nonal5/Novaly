#!/bin/bash

echo "⬆️ Incrémentation de la version..."
cd novaly-launcher || exit
npm version patch --no-git-tag-version
VERSION=$(node -p "require('./package.json').version")

echo "🔨 Compilation de Tauri pour générer le tar.gz..."
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
cp cp novaly-launcher/src-tauri/target/release/bundle/macos/*.tar.gz ~/Desktop/Novaly_aarch64.app.tar.gz
echo "💬 Préparation de l'annonce Discord..."
read -p "Titre de la mise à jour (pour l'annonce Discord) : " COMMENTAIRE

echo "🎉 Création de la Release sur GitHub..."
gh release create v$VERSION --title "$COMMENTAIRE" --notes "Mise à jour automatique v$VERSION"

echo "✅ Fichier patch terminé !"
echo "👉 Tu peux maintenant lancer ./maj.sh"