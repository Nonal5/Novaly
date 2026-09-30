#!/bin/bash
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Secrets locaux : JAMAIS dans le dépôt (il est public).
# Créer ~/.novaly/secrets.env contenant par exemple :
#   NOVALY_DISCORD_WEBHOOK="https://discord.com/api/webhooks/..."
#   NOVALY_SIGNING_KEY="$HOME/.novaly/updater.key"
SECRETS_FILE="$HOME/.novaly/secrets.env"
[ -f "$SECRETS_FILE" ] && source "$SECRETS_FILE"
SIGNING_KEY="${NOVALY_SIGNING_KEY:-$HOME/Desktop/secret.txt}"
if [ ! -f "$SIGNING_KEY" ]; then
  echo "❌ Clé de signature introuvable : $SIGNING_KEY"
  exit 1
fi

cd "$ROOT/novaly-launcher" || exit

# 1. Lit la version
VERSION=$(node -p "require('./package.json').version")
DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

echo "⏳ Signature de l'archive v$VERSION en cours..."
# 2. Signe l'archive présente sur le bureau
SIGNATURE=$(npm run tauri -- signer sign --private-key-path "$SIGNING_KEY" ~/Desktop/Novaly_aarch64.app.tar.gz | awk '/Public signature:/{getline; print}')

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
DISCORD_WEBHOOK="$NOVALY_DISCORD_WEBHOOK"

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

if [ -n "$DISCORD_WEBHOOK" ]; then
  curl -H "Content-Type: application/json" \
  -X POST \
  -d "$payload" \
  "$DISCORD_WEBHOOK"
else
  echo "⚠️ NOVALY_DISCORD_WEBHOOK absent de $SECRETS_FILE : annonce Discord ignorée."
fi

echo "🔄 Publication du latest.json sur le dépôt principal..."
cd "$ROOT"
git add novaly-launcher/src-tauri/latest.json
git commit -m "Déploiement du patch auto-updater v$VERSION"
git push origin main

echo "🧹 Nettoyage du Bureau..."
rm -f ~/Desktop/Novaly_aarch64.app.tar.gz
rm -f ~/Desktop/Novaly_aarch64.app.tar.gz.sig

echo "✅ TOUT EST FINI ! Release, auto-update et Discord sont bouclés !"