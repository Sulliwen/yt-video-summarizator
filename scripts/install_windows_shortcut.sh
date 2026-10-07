#!/usr/bin/env bash
# Crée un raccourci "ytsum" sur le bureau Windows qui lance ytsum-web dans WSL
# et ouvre le navigateur. À relancer si le projet change de dossier.
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DISTRO="${WSL_DISTRO_NAME:-Ubuntu}"
DESKTOP="$(powershell.exe -NoProfile -Command "[Environment]::GetFolderPath('Desktop')" | tr -d '\r')"
LNK="$DESKTOP\\ytsum.lnk"
ARGS="-d $DISTRO --cd $PROJECT_DIR -- $HOME/.local/bin/ytsum-web"

powershell.exe -NoProfile -Command "
  \$s = (New-Object -ComObject WScript.Shell).CreateShortcut('$LNK')
  \$s.TargetPath = 'C:\\Windows\\System32\\wsl.exe'
  \$s.Arguments = '$ARGS'
  \$s.WorkingDirectory = '%USERPROFILE%'
  \$s.Description = 'ytsum : transcript YouTube -> prompt de résumé'
  \$s.IconLocation = 'C:\\Windows\\System32\\shell32.dll,222'
  \$s.WindowStyle = 7
  \$s.Save()
"
echo "Raccourci créé : $LNK"
echo "Commande lancée : wsl.exe $ARGS"
