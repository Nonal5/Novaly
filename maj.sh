#!/bin/bash
cd novaly-launcher || exit

# 1. Lit la version
VERSION=$(node -p "require('./package.json').version")
DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

echo "⏳ Signature de l'archive v$VERSION en cours..."
# 2. Signe l'archive présente sur le bureau
SIGNATURE=$(npm run tauri -- signer sign --private-key-path ~/Desktop/secret.txt ~/Desktop/Novaly_aarch64.app.tar.gz | awk '/Public signature:/{getline; print}')

# 3. Crée le fichier latest.json
cat <<EOF > src-tauri/latest.json
{
  "version": "v$VERSION",
  "notes": "Mise à jour v$VERSION",
  "pub_date": "$DATE",
  "platforms": {
    "darwin-aarch64": {
      "signature": "$SIGNATURE",
      "url": "https://github.com/Nonal5/Novaly/releases/download/v$VERSION/Novaly_aarch64.app.tar.gz"
    }
  }
}
EOF

echo "💬 Préparation de l'annonce Discord..."
read -p "Titre de la mise à jour (pour l'annonce Discord) : " COMMENTAIRE


echo "📤 Création de la Release GitHub et Upload des fichiers (Déclenche Discord !)..."
gh release create v$VERSION ~/Desktop/Novaly_aarch64.app.tar.gz ~/Desktop/Novaly_aarch64.app.tar.gz.sig --title "$COMMENTAIRE" --notes "Mise à jour automatique v$VERSION" --draft=false
echo "🔄 Publication du latest.json sur le dépôt principal (Déclenche les mises à jour auto)..."
cd ..
git add novaly-launcher/src-tauri/latest.json
git commit -m "Déploiement du patch auto-updater v$VERSION"
git push origin main

echo "🧹 Nettoyage du Bureau..."
rm -f ~/Desktop/Novaly_aarch64.app.tar.gz
rm -f ~/Desktop/Novaly_aarch64.app.tar.gz.sig

echo "✅ TOUT EST FINI ! Les joueurs recevront la mise à jour au prochain lancement du launcher."