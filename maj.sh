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

echo "📤 Création de la Release GitHub et Upload des fichiers..."
gh release create v$VERSION ~/Desktop/Novaly_aarch64.app.tar.gz ~/Desktop/Novaly_aarch64.app.tar.gz.sig --title "$COMMENTAIRE" --notes "Mise à jour automatique v$VERSION" --draft=false

echo "🚀 Envoi de la notification sur Discord..."
# Remplace URL_DE_TON_WEBHOOK_DISCORD par ton vrai webhook secret ou mets-le directement entre guillemets
DISCORD_WEBHOOK="https://discord.com/api/webhooks/1546770009592958979/uv_EmISD4Hvu1tX9GQxjral3V0MLwUbDKuNpcNcMt236SoerjZ5LdlkMk2piWnPOtxtn"

LOGO_URL="https://firebasestorage.googleapis.com/v0/b/novaly-a80f7.firebasestorage.app/o/logo1.png?alt=media&token=217eb083-ea50-4c6e-806a-5c6e6b5d429a"

payload=$(cat <<EOF
{
  "embeds": [
    {
      "title": "🚀 Novaly v$VERSION is available !",
      "description": "**$COMMENTAIRE**\n\n👉 [Joue dès maintenant sur le site](https://novaly-store.fr)",
      "color": 16711680,
      "thumbnail": {
        "url": "$LOGO_URL"
      }
    }
  ]
}
EOF
)

curl -H "Content-Type: application/json" \
-X POST \
-d "$payload" \
"$DISCORD_WEBHOOK"

echo "🔄 Publication du latest.json sur le dépôt principal..."
cd ..
git add novaly-launcher/src-tauri/latest.json
git commit -m "Déploiement du patch auto-updater v$VERSION"
git push origin main

echo "🧹 Nettoyage du Bureau..."
rm -f ~/Desktop/Novaly_aarch64.app.tar.gz
rm -f ~/Desktop/Novaly_aarch64.app.tar.gz.sig

echo "✅ TOUT EST FINI ! Release, auto-update et Discord sont bouclés !"