# Fiche Chrome Web Store : textes à copier-coller

Console : https://chrome.google.com/webstore/devconsole

Les justifications sont en anglais, la langue des reviewers ; la fiche publique est
en français.

---

## Paquet

```bash
scripts/package_chrome_extension.sh   # → dist/ytsum-<version>.zip
```

---

## Onglet « Fiche Play Store »

**Langue principale** : Français

**Catégorie** : Productivité

**Titre** : repris du manifest (`ytsum`).

**Résumé** : repris du manifest (`description`, 132 caractères max).

**Description**

```
Résume n'importe quelle vidéo YouTube en un clic avec ChatGPT.

Sur une vidéo YouTube, clique sur l'icône ytsum (ou Alt+S, ou clic droit sur un lien vidéo) : l'extension récupère les sous-titres, les insère dans ton prompt de résumé et ouvre ChatGPT avec le tout, prêt à être envoyé.

• Fonctionne sur les vidéos, Shorts et lives qui ont des sous-titres
• Préfère les sous-titres rédigés à la main, sinon prend les automatiques
• Langue préférée au choix : français ou anglais
• Prompt entièrement personnalisable, avec les variables {title}, {channel}, {url} et {transcript}
• Envoi automatique ou simple insertion, à toi de choisir
• Le prompt est aussi copié dans le presse-papier

Les sous-titres sont lus par le lecteur YouTube lui-même : si une publicité passe, attends sa fin avant de cliquer.

Il faut un compte ChatGPT (gratuit ou payant), connecté dans Chrome.

Confidentialité : aucun serveur intermédiaire, aucune statistique, aucun traceur. Le transcript va directement de YouTube à ton onglet ChatGPT.

ytsum n'est affilié ni à YouTube/Google ni à OpenAI.
```

**Icône** : `extension/icons/128.png`

**Petite vignette promotionnelle (440×280)** : `store/promo-440x280.png`

**Captures d'écran (1280×800)**, dans cet ordre :
1. `store/capture-1-youtube.png` : le toast « Envoyé à ChatGPT » sur la vidéo.
2. `store/capture-2-chatgpt.png` : le prompt envoyé dans ChatGPT.
3. `store/capture-3-options.png` : la page d'options.

**Site web / assistance** : https://github.com/Sulliwen/yt-video-summarizator

---

## Onglet « Pratiques de confidentialité »

**Single purpose description**

```
Send the transcript of the YouTube video the user is watching to ChatGPT, wrapped in a user-configurable summary prompt, so ChatGPT can summarize the video.
```

**activeTab**

```
When the user clicks the toolbar button, presses the keyboard shortcut or uses the context menu, the extension reads the URL of the active tab to get the YouTube video ID, and shows a small status toast in that tab.
```

**scripting**

```
Runs a function in the YouTube watch tab where the user triggered the extension (MAIN world, because it needs the page's own video player). It asks the player to load the video's captions through the player API, restores the captions display state, then reads the caption track the player itself requested. Also injects a small status toast ("fetching transcript…", "sent to ChatGPT") into that tab.
```

**storage**

```
chrome.storage.sync stores the user's settings (auto-send toggle, preferred subtitle languages, prompt template). chrome.storage.session holds the generated prompt for a few minutes, until the ChatGPT tab opened by the extension picks it up; it is then deleted.
```

**contextMenus**

```
Adds a "Summarize this video with ChatGPT" entry to the right-click menu on YouTube video links and pages.
```

**offscreen**

```
An offscreen document with the CLIPBOARD reason copies the generated prompt to the clipboard, since a Manifest V3 service worker has no access to the clipboard API.
```

**clipboardWrite**

```
Copies the generated prompt to the clipboard, so the user can paste it manually if automatic insertion into ChatGPT fails.
```

**Host permissions (youtube.com, chatgpt.com)**

```
https://www.youtube.com/*: to read the title, channel and captions of the video the user asked to summarize. When the user right-clicks a YouTube link on another site (or uses the button on a Shorts page), the extension opens the video's watch page in a new tab and reads the captions there, which needs host access since activeTab does not cover a newly opened tab.
https://chatgpt.com/*: a content script inserts the generated prompt into the ChatGPT composer of the tab the extension opened, and sends it if the user enabled auto-send. It does nothing in ChatGPT tabs the extension did not open.
```

**Remote code** : No, I am not using remote code.

**Données utilisateur collectées** : cocher **Contenu de site web** (le transcript
de la vidéo lu sur youtube.com puis envoyé à chatgpt.com). Rien d'autre.

**Certifications** : cocher les trois (pas de vente à des tiers, pas d'usage hors
objectif unique, pas d'évaluation de solvabilité).

**URL de la politique de confidentialité**

```
https://github.com/Sulliwen/yt-video-summarizator/blob/main/PRIVACY.md
```

---

## Onglet « Distribution »

- **Visibilité** : Non répertoriée pour un usage perso ou entre proches,
  Publique pour apparaître dans les recherches.
- **Régions** : toutes.
