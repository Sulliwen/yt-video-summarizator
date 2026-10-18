# Politique de confidentialité de l'extension ytsum

Dernière mise à jour : 18 octobre 2026

ytsum est une extension Chrome qui récupère le transcript (sous-titres) d'une vidéo
YouTube et l'envoie dans ChatGPT avec un prompt de résumé. Cette page décrit les
données qu'elle manipule.

## Données traitées

Uniquement quand tu déclenches l'extension (clic sur l'icône, raccourci Alt+S ou
menu contextuel) sur une vidéo YouTube :

- **Identifiant, titre, chaîne et sous-titres de la vidéo**, demandés à youtube.com.
- **Le prompt construit** à partir de ces informations et de ton modèle de prompt.

## Où vont ces données

- Le prompt est **copié dans ton presse-papier** et **inséré dans un onglet
  chatgpt.com** que l'extension ouvre pour toi. Ce qui se passe ensuite relève de la
  politique de confidentialité d'OpenAI.
- Le prompt est conservé quelques minutes au maximum dans le stockage de session du
  navigateur (`chrome.storage.session`), le temps que l'onglet ChatGPT le récupère,
  puis il est effacé.

## Données conservées

Tes réglages (envoi automatique, langues de sous-titres préférées, modèle de prompt)
sont enregistrés avec `chrome.storage.sync`, donc dans ton compte Chrome si la
synchronisation est activée.

## Ce que l'extension ne fait pas

- Elle n'envoie **aucune donnée à un serveur du développeur** : il n'y en a pas.
- Elle ne collecte ni historique de navigation, ni données personnelles, ni
  statistiques d'usage, et n'utilise aucun traceur.
- Elle ne vend ni ne transmet de données à des tiers, en dehors de l'envoi à
  chatgpt.com que tu déclenches toi-même.
- Elle n'exécute aucun code chargé à distance.

## Contact

Pour toute question : ouvre une issue sur
https://github.com/Sulliwen/yt-video-summarizator/issues
