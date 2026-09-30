#!/bin/bash
# Publie une nouvelle version de Novaly.
# Ce script incrémente la version, puis pousse le code et un tag sur GitHub.
# GitHub Actions (.github/workflows/release.yml) fait ensuite TOUT le reste :
# compilation Mac / Windows / Linux, signature, mise à jour automatique des launchers
# (latest.json), publication de la release et annonce Discord.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "🔄 Récupération des dernières modifications (latest.json publié par GitHub)..."
git pull --rebase --autostash origin main

read -p "📝 Titre de la mise à jour (affiché dans la release et sur Discord) : " TITRE
[ -z "$TITRE" ] && TITRE="Améliorations et corrections"

echo "⬆️ Incrémentation de la version..."
cd novaly-launcher
npm version patch --no-git-tag-version > /dev/null
VERSION=$(node -p "require('./package.json').version")
cd "$ROOT"

echo "📦 Sauvegarde de tout le projet (site web + launcher)..."
git add -A
git commit -m "Préparation de la v$VERSION"

echo "🏷️ Création du tag v$VERSION..."
git tag -a "v$VERSION" -m "$TITRE"

echo "🚀 Envoi sur GitHub..."
git push origin main
git push origin "v$VERSION"

echo ""
echo "✅ v$VERSION envoyée ! GitHub compile maintenant Mac, Windows et Linux (environ 40 minutes),"
echo "   puis publie la mise à jour et l'annonce sur Discord automatiquement."
echo "👉 Suivre la progression : gh run watch \$(gh run list --workflow=release.yml --limit 1 --json databaseId --jq '.[0].databaseId')"
