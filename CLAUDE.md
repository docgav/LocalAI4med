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

- Tous les fichiers téléchargés (exécutables, modèles) sont dans `ressources/` (ignoré par git,
  sauf `A_LIRE.txt`), pour que les mises à jour par copie du ZIP n'y touchent pas.
  Réglages perso : `ressources/config_perso.bat`, appelé à la fin de `config.bat`.
- Modèle : `Demarrer.bat` choisit E2B ou E4B (`choice`, selon les fichiers présents) et passe
  `LLM_ACTIF` / `MMPROJ_ACTIF` à `scripts/serveur.bat` par l'environnement ; `--mmproj` seulement si le
  fichier existe (images). La page lit `/props` (`model_path`, `modalities.vision`).
- Interface `app/` en deux onglets dans une seule page : `commun.js` (API en streaming, onglets,
  dictée, état), `redaction.js`, `discussion.js` (images redimensionnées en JPEG et envoyées en
  `image_url` ; PDF lus par pdf.js 3.11 copié dans `app/lib/pdfjs`, scripts classiques, pas de .mjs).
  Chaque onglet est dans un bloc `{ }` pour éviter les collisions de noms globaux.
- `llamafile.exe --server --path app` (v0.10.6, basé sur llama-server) sert l'interface `app/`
  et l'API OpenAI `/v1/chat/completions` sur la même origine. `/health` renvoie 200 quand prêt.
- whisperfile 0.10.6 est **CLI uniquement** (pas de whisper-server dans la distribution).
  Dictée principale : `app/dictee.js` enregistre dans le navigateur (MediaRecorder), convertit en WAV
  16 kHz mono (OfflineAudioContext) et POST vers `scripts/dictee-serveur.ps1`, passerelle PowerShell 5.1
  (TcpListener sur 127.0.0.1:`PORT_DICTEE`, CORS limité à l'origine de la page). Elle sauvegarde
  `dictees/dictee-AAAAMMJJ-HHMMSS.wav`, lance whisperfile, renvoie `{texte, fichier}` ;
  `?fichier=` retranscrit un fichier déjà sauvegardé. « Fichier audio… » (et un audio déposé dans Discussion)
  passe par la même conversion WAV puis la même passerelle (`window.transcrireFichierAudio`). PID dans `journal/dictee.pid`
  (`scripts/arreter-dictee.bat`). Le port est transmis à la page par `app/dictee/port.txt`.
  Le stdout de whisperfile (qui contient le texte) ne va jamais dans `journal/`.
  Vitesse : whisperfile utilise par défaut beam 5 et 4 threads ; la passerelle passe `-t` (cœurs
  physiques ou `WHISPER_THREADS`) et `WHISPER_OPTIONS` (`-bs 1` = glouton). Réponse de `/transcrire`
  en NDJSON : `{fichier, duree_audio}`, `{progression}` (lu dans `-pp` sur stderr, par tranches de
  30 s), puis `{texte, duree}` ou `{erreur}`. Connexion coupée → whisperfile tué. La page retire les
  silences de début/fin et estime le temps restant (facteur appris, seul nombre en localStorage).
  Dictée de secours (si PowerShell est bloqué) par la console : `scripts/dictee.bat` (ffmpeg dshow → wav 16 kHz →
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
  La passerelle se teste avec `pwsh` (PowerShell 7) et un faux whisperfile, en exportant
  `WHISPERFILE`, `MODELE_WHISPER`, `PORT`, `PORT_DICTEE` ; Chromium avec
  `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream` simule le micro.
- Interface et messages en français. JS sans dépendance ni étape de build.
- Non testé sur Windows réel à ce jour : scripts `.bat` à valider sur un poste.
