#!/usr/bin/env bash
# Copie l'extension Chrome dans un dossier Windows (Chrome Windows ne charge pas
# fiablement une extension depuis le système de fichiers WSL).
# À relancer après chaque modification, puis cliquer « Actualiser » dans chrome://extensions.
set -euo pipefail

SRC="$(cd "$(dirname "$0")/../extension" && pwd)"
WIN_HOME="$(powershell.exe -NoProfile -Command '$env:USERPROFILE' | tr -d '\r')"
DEST_WIN="$WIN_HOME\\ytsum-extension"
DEST="$(wslpath "$DEST_WIN")"

mkdir -p "$DEST"
rsync -a --delete "$SRC"/ "$DEST"/
echo "Extension copiée dans : $DEST_WIN"
