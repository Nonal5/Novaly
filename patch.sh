#!/bin/bash

echo "⬆️ Incrémentation de la version..."
cd novaly-launcher || exit
npm version patch --no-git-tag-version
VERSION=$(node -p "require('./package.json').version")

echo "🔨 Compilation de Tauri pour générer le .app..."
npm run tauri build

echo "📦 Compression manuelle du .app en .tar.gz pour l'updater..."
cd src-tauri/target/release/bundle/macos/
tar -czf Novaly_aarch64.app.tar.gz Novaly.app
cp Novaly_aarch64.app.tar.gz ~/Desktop/
# On remonte de 6 dossiers pour revenir à la racine du projet (Novaly)
cd ../../../../../../

echo "📦 Sauvegarde de TOUT le projet (Site web + Launcher)..."
git add -A
git commit -m "Préparation de la v$VERSION"

echo "🏷️ Création du tag officiel v$VERSION..."
git tag v$VERSION

echo "🚀 Envoi du code et des tags vers GitHub..."
git push origin main --tags

echo "💬 Préparation de l'annonce Discord..."
read -p "Titre de la mise à jour (pour l'annonce Discord) : " COMMENTAIRE

echo "🎉 Création de la Release sur GitHub..."
gh release create v$VERSION --title "$COMMENTAIRE" --notes "Mise à jour automatique v$VERSION"

echo "✅ Fichier patch terminé ! L'archive est bien sur ton Bureau."
echo "👉 Tu peux maintenant lancer ./maj.sh"