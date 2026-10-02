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
- Deux modes, choisis par `Demarrer.bat` selon que la passerelle PowerShell répond (`/etat`) :
  - **complet** : la passerelle (`scripts/dictee-serveur.ps1`, port `PORT_DICTEE`) sert `app/` ET la
    dictée ; llamafile tourne SANS `--path`, donc sert son interface web par défaut, préréglée par
    `--ui-config-file app/discussion-config.json` (clés de `tools/ui/src/lib/constants/settings-keys`
    de llama.cpp : `systemMessage`, `temperature`…). La page appelle l'API sur `http://127.0.0.1:PORT/`
    (CORS de llama-server : `*` par défaut) et affiche l'interface par défaut en iframe (onglet
    Discussion) ; la dictée y est copiée dans le presse-papier (autre origine).
  - **secours** (PowerShell bloqué) : `llamafile --path app` sert la page ; API même origine ;
    `discussion.js` fournit la discussion intégrée (images en `image_url`, PDF par pdf.js 3.11 dans
    `app/lib/pdfjs`, scripts classiques, pas de .mjs).
  La page lit les ports dans `app/dictee/config.json` (écrit par `Demarrer.bat`) ; mode complet si
  `location.port` = port de la passerelle. Navigateur : Edge InPrivate (`NAVIGATEUR_PRIVE`), car
  l'interface par défaut garde l'historique en IndexedDB.
- Interface `app/` : `commun.js` (config, API en streaming, onglets, dépôt de la dictée), `dictee.js`,
  `redaction.js`, `discussion.js`. Chaque onglet est dans un bloc `{ }` (pas de collisions globales).
  `[hidden]` forcé en `display: none !important` (les `.colonne` sont en flex).
- llamafile 0.10.6 (basé sur llama-server) : API OpenAI `/v1/chat/completions`, `/health` (200 quand
  prêt), `/props`.
- whisperfile 0.10.6 est **CLI uniquement** (pas de whisper-server dans la distribution).
  Dictée principale : `app/dictee.js` enregistre dans le navigateur (MediaRecorder), convertit en WAV
  16 kHz mono (OfflineAudioContext) et POST vers `scripts/dictee-serveur.ps1`, passerelle PowerShell 5.1
  (TcpListener sur 127.0.0.1:`PORT_DICTEE`, CORS limité à l'origine de la page). Elle sauvegarde
  `dictees/dictee-AAAAMMJJ-HHMMSS.wav`, lance whisperfile, renvoie `{texte, fichier}` ;
  `?fichier=` retranscrit un fichier déjà sauvegardé. « Fichier audio… » (et un audio déposé dans Discussion)
  passe par la même conversion WAV puis la même passerelle (`window.transcrireFichierAudio`). PID dans `journal/dictee.pid`
  (`scripts/arreter-dictee.bat`). Elle sert aussi les fichiers de `app/` (GET, types limités, pas de
  sortie du dossier).
  Le stdout de whisperfile (qui contient le texte) ne va jamais dans `journal/`.
  Vitesse : whisperfile utilise par défaut beam 5 et 4 threads ; la passerelle passe `-t` (cœurs
  physiques ou `WHISPER_THREADS`) et `WHISPER_OPTIONS` (`-bs 1` = glouton). Réponse de `/transcrire`
  en NDJSON : `{fichier, duree_audio}`, `{progression}` (lu dans `-pp` sur stderr, par tranches de
  30 s), puis `{texte, duree}` ou `{erreur}`. Connexion coupée → whisperfile tué. « progress = 100% »
  est émis au début de la dernière passe, donc transcription finie ; whisperfile peut ensuite mettre
  longtemps à se fermer : dès que le `.txt` existe et ne change plus, la passerelle le lit et tue le
  processus. Durées (sans texte) dans `journal/dictee.log` ; étapes et erreurs de la passerelle dans
  `journal/passerelle.log`. Tous les `curl` de `Demarrer.bat` ont `--max-time` et `--noproxy "*"`. `WHISPER_CTX_ADAPTE=1` → `-ac` ajusté
  à la durée (50 trames/s, 1500 = 30 s). La page retire les
  silences de début/fin et estime le temps restant (facteur appris, seul nombre en localStorage).
  Dictée de secours (si PowerShell est bloqué) par la console : `scripts/dictee.bat` (ffmpeg dshow → wav 16 kHz →
  whisperfile `-otxt`) écrit `app/dictee/dictee.txt` puis `app/dictee/pret.txt` (identifiant).
  La page interroge `pret.txt` toutes les 1,5 s et insère le texte quand l'identifiant change.
- Si llamafile s'arrête aussitôt en mode complet, `Demarrer.bat` le relance une fois sans
  `--ui-config-file` (`SANS_PRECONFIG=1`, premier journal gardé dans `journal/serveur-essai1.log`).
  `serveur.log` commence par la commande exacte et finit par « [llamafile arrete, code N] ».
  C'est CETTE ligne (findstr /l) qui signale l'arrêt de llamafile, pas `tasklist` : sur le poste
  de test, tasklist ne voyait pas llamafile.exe en cours de chargement. Journal effacé avant chaque lancement.
- `Demarrer.bat` : vérifie les fichiers, arrête tout llamafile déjà lancé, génère `app/prompts/_liste.txt`, lance
  `scripts/serveur.bat` (journal `journal/serveur.log`), attend `/health` (curl.exe natif),
  ouvre le navigateur, puis boucle comme dictaphone.
- Prompts : `app/prompts/*.txt`, sections `### TITRE`, `### CONSIGNES`, paires
  `### EXEMPLE NOTES` / `### EXEMPLE DOCUMENT`. Envoyés ainsi : système = `_commun.txt` +
  consignes, puis exemples en tours user/assistant (few-shot), puis les notes.
- Textes lus en UTF-8 via `TextDecoder` (le serveur ne précise pas toujours le charset).

## Décisions déjà prises (ne pas rouvrir sans raison)

- llamafile : seul outil vraiment portable pour le LLM (calcul optimisé AVX/AVX2/AVX-512 par
  détection à l'exécution, tinyBLAS).
- Transcription : **whisper.cpp officiel** (`ressources/whisper-cpp/whisper-cli.exe` + DLL, ZIP
  `whisper-bin-x64` des releases ggml-org) choisi automatiquement par `config.bat` s'il est présent ;
  whisperfile 0.10.6 en repli. Raison : whisperfile compile `ggml-cpu` sans `-mavx*`
  (`whisper.cpp.patches/llamafile-files/BUILD.mk`, pas de variantes), donc en SSE2 seul ;
  mesuré sur Xeon E-2124G : encodage medium 219 s pour 30 s de fenêtre, `CPU :` vide dans le
  journal. Mêmes options en ligne de commande (`-otxt -of -pp -bs -t -ac --prompt`).
- Whisper plutôt que l'audio natif de Gemma 4 : meilleur en français, relecture avant rédaction.
- MedGemma et MedASR écartés (anglophones, dépendances Python). Pas de RAG : few-shot suffit.

## Développement

- `python3 dev/serveur_factice.py 8080` imite llamafile pour tester `app/` sous Linux/macOS.
  La passerelle se teste avec `pwsh` (PowerShell 7) et un faux whisperfile, en exportant
  `WHISPERFILE`, `MODELE_WHISPER`, `PORT`, `PORT_DICTEE` ; Chromium avec
  `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream` simule le micro.
- Interface et messages en français. JS sans dépendance ni étape de build.
- `.bat` et `.ps1` : **ASCII uniquement** (PowerShell 5.1 lit l'UTF-8 sans BOM comme ANSI ; cmd et
  `chcp`). Les accents vont dans les fichiers lus par la page (UTF-8).
- Non testé sur Windows réel à ce jour : scripts `.bat` à valider sur un poste.
