# CLAUDE.md

Projet : IA locale portable (disque USB chiffré) pour un neurologue hospitalier.
Dictée → whisperfile → notes → Gemma (llamafile) → courrier/ordonnance → copie dans le DPI.
Le dépôt correspond au contenu du dossier `IA/` à la racine du disque.

## Contraintes (ne pas les perdre de vue)

- Postes Windows de l'hôpital : **ni installation, ni droits admin, ni internet, ni Python**.
  PowerShell peut être bloqué : il ne sert qu'à des fonctions de confort, avec repli.
  Orchestration en `.bat` (CRLF, voir `.gitattributes`). Navigateur : Edge/Chrome.
- RAM des postes : 8 Go → Gemma 4 E2B Q4_K_M (E4B trop juste). Machine de dev : 16 Go.
- Aucune donnée ne sort de la machine : serveur sur `127.0.0.1` uniquement, **aucune ressource
  externe dans `app/`** (pas de CDN, pas de police distante), pas de télémétrie.
- Aucune donnée patient persistée : pas de localStorage pour les notes/documents,
  fichiers temporaires effacés (`scripts/nettoyer.bat`, appelé par `Arreter.bat`).
- Exemples des prompts : fictifs uniquement.

## Architecture

- `llamafile.exe --server --path app` (v0.10.6, basé sur llama-server) sert l'interface `app/`
  et l'API OpenAI `/v1/chat/completions` sur la même origine. `/health` renvoie 200 quand prêt.
- whisperfile 0.10.6 est **CLI uniquement** (pas de whisper-server dans la distribution).
  La dictée passe donc par la console : `scripts/dictee.bat` (ffmpeg dshow → wav 16 kHz →
  whisperfile `-otxt`) écrit `app/dictee/dictee.txt` puis `app/dictee/pret.txt` (identifiant).
  La page interroge `pret.txt` toutes les 1,5 s et insère le texte quand l'identifiant change.
- `Demarrer.bat` : vérifie les fichiers, arrête tout llamafile déjà lancé, génère `app/prompts/_liste.txt`, lance
  `scripts/serveur.bat` (journal `journal/serveur.log`), attend `/health` (curl.exe natif),
  ouvre le navigateur, puis boucle comme dictaphone.
- Prompts : `app/prompts/*.txt`, sections `### TITRE`, `### CONSIGNES`, paires
  `### EXEMPLE NOTES` / `### EXEMPLE DOCUMENT`. Envoyés ainsi : système = `_commun.txt` +
  consignes, puis exemples en tours user/assistant (few-shot), puis les notes.
- Textes lus en UTF-8 via `TextDecoder` (le serveur ne précise pas toujours le charset).

## Décisions déjà prises (ne pas rouvrir sans raison)

- llamafile/whisperfile : seuls outils vraiment portables (un exécutable par fonction).
- Whisper plutôt que l'audio natif de Gemma 4 : meilleur en français, relecture avant rédaction.
- MedGemma et MedASR écartés (anglophones, dépendances Python). Pas de RAG : few-shot suffit.

## Développement

- `python3 dev/serveur_factice.py 8080` imite llamafile pour tester `app/` sous Linux/macOS.
- Interface et messages en français. JS sans dépendance ni étape de build.
- Non testé sur Windows réel à ce jour : scripts `.bat` à valider sur un poste.
