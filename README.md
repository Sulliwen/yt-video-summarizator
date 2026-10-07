# ytsum

Accélère le résumé de vidéos YouTube : récupère le transcript, construit le prompt
de résumé et le copie dans le presse-papier, prêt à coller dans ChatGPT.

## Installation

```bash
uv sync
uv tool install --editable .   # rend `ytsum` disponible partout
```

## Usage

```bash
ytsum https://www.youtube.com/watch?v=XXXXXXXXXXX
ytsum https://youtu.be/XXXXXXXXXXX --open      # ouvre aussi chatgpt.com
ytsum XXXXXXXXXXX --langs en,fr                # préfère l'anglais
ytsum XXXXXXXXXXX --print --no-clip            # affiche le prompt sans copier
```

Sans `uv tool install`, remplace `ytsum` par `uv run ytsum`.

## Interface web

```bash
ytsum-web            # lance http://127.0.0.1:8765 et ouvre le navigateur
ytsum-web --port 9000 --no-browser
```

Colle une URL : la récupération démarre toute seule, le prompt s'affiche et
est copié dans le presse-papier. « Copier et ouvrir ChatGPT » fait les deux
d'un coup. La page garde en mémoire (dans le navigateur) les 8 dernières vidéos,
la langue choisie et un template de prompt personnalisé si tu modifies les
instructions depuis l'interface.

`http://127.0.0.1:8765/?url=<url youtube>` pré-remplit et lance la récupération,
pratique pour un favori ou un bookmarklet. Ferme la fenêtre de terminal pour
arrêter le serveur.

### Raccourci sur le bureau Windows (WSL)

```bash
./scripts/install_windows_shortcut.sh
```

Crée `ytsum.lnk` sur le bureau : il lance `ytsum-web` dans WSL (fenêtre
réduite dans la barre des tâches) et ouvre la page dans le navigateur Windows.
À relancer si le projet est déplacé.

Le transcript et le prompt sont sauvegardés dans `./summaries/` (modifiable avec `--out-dir`).

## Extension Chrome

Le plus rapide au quotidien, sans serveur local : sur une vidéo YouTube, un clic
sur l'icône ytsum (ou `Alt+S`) récupère le transcript, ouvre ChatGPT dans un
nouvel onglet, y insère le prompt et l'envoie. Clic droit sur un lien ou une
miniature YouTube → « Résumer cette vidéo avec ChatGPT » fait la même chose sans
ouvrir la vidéo. Le prompt est aussi copié dans le presse-papier, en secours.

Installation (une seule fois) :

```bash
./scripts/install_chrome_extension.sh     # copie vers C:\Users\<toi>\ytsum-extension
```

Puis dans Chrome : `chrome://extensions` → activer « Mode développeur » →
« Charger l'extension non empaquetée » → choisir le dossier `ytsum-extension`.
Épingle ensuite l'icône via le bouton puzzle de la barre d'outils.

Réglages (clic droit sur l'icône → Options) : envoi automatique ou simple
insertion, langue de sous-titres préférée, texte du prompt. Le raccourci clavier
se change dans `chrome://extensions/shortcuts`.

Après une modification du code dans `extension/`, relancer le script puis
cliquer « Actualiser » sur la carte de l'extension.

## Personnaliser le prompt

Le template est dans `src/ytsum/prompt.md`. Placeholders disponibles :
`{title}`, `{channel}`, `{url}`, `{transcript}`. On peut aussi passer un autre
fichier avec `--template`.

## Si YouTube casse la récupération

YouTube change régulièrement ses API ; yt-dlp suit de près. En cas d'erreur de
récupération, mets-le à jour :

```bash
uv lock --upgrade-package yt-dlp && uv tool install --editable . --reinstall
```
