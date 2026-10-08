# CLAUDE.md

Projet : IA locale portable (disque USB chiffré) pour un neurologue hospitalier, novice en code.
Dictée → transcription (whisper.cpp) → rédaction (Gemma via llamafile) ; discussion ; synthèse de
dossier patient ; anonymisation ; historique. Le dépôt correspond au dossier `IA/` à la racine du disque.
L'utilisateur teste sur Windows ; ici, on ne peut tester que sous Linux (voir « Développement »).

## Contraintes (ne pas les perdre de vue)

- Postes Windows de l'hôpital : **ni installation, ni droits admin, ni internet, ni Python**.
  Orchestration en `.bat` ; PowerShell 5.1 pour la passerelle et le capteur, avec **mode secours**
  si PowerShell est bloqué. Navigateur : Edge (InPrivate), Chrome possible.
- RAM des postes : 8 Go → Gemma 4 E2B Q4_K_M ; E4B possible sur la machine de dev (16 Go).
- Rien ne sort de la machine : services sur `127.0.0.1` uniquement, **aucune ressource externe dans
  `app/`** (pas de CDN, pas de police distante), pas de télémétrie.
- **Données patient** : conservées uniquement dans `donnees/` (sur le disque chiffré, jamais versionné),
  à la demande de l'utilisateur (archives, dossiers patients, tables d'anonymisation). Jamais dans le
  stockage du navigateur (localStorage limité à : onglet, type de document, micro, facteur de vitesse de
  transcription, réglages en mode secours), jamais dans `journal/` (le stdout de whisper, qui contient le
  texte, n'y va pas). Temporaires effacés par `scripts/nettoyer.bat` (appelé par `Arreter.bat`) :
  `dictees/*.wav` (sauf `CONSERVER_AUDIO=1`), `app/dictee/*`, presse-papier. `donnees/` n'est jamais effacé.
- Exemples des prompts : fictifs uniquement.
- `.bat` et `.ps1` : **ASCII uniquement** (PowerShell 5.1 lit l'UTF-8 sans BOM comme ANSI) et **CRLF**
  (stockés tels quels, `.gitattributes` : `-text`). Accents seulement dans les fichiers lus par la page.

## Démarrage (`Demarrer.bat`)

1. Relance dans `cmd /k` (fenêtre qui reste ouverte), `config.bat` (puis `ressources/config_perso.bat`).
2. Vérifie `app/`, choisit le modèle (E2B/E4B via `choice`) → `LLM_ACTIF`/`MMPROJ_ACTIF` (environnement).
3. Écrit `app/dictee/config.json` (`{llm, dictee}` : ports), génère `app/prompts/_liste.txt`.
4. Arrête l'ancien llamafile (`scripts/arreter-llm.bat` : par nom puis par port via netstat).
5. Lance la passerelle (`scripts/dictee-serveur.ps1`) et attend `/etat` (8 essais, `curl --max-time
   --noproxy "*"`) → `MODE=complet` ou `secours`. En complet, lance le capteur (`scripts/capteur.ps1`,
   si `CAPTEUR=1`).
6. Lance `scripts/serveur.bat` (llamafile). Journal `journal/serveur.log` : 1re ligne = commande,
   dernière = « [llamafile arrete, code N] ». **C'est cette ligne (findstr /l) qui signale l'arrêt**,
   pas `tasklist` (qui ne voyait pas llamafile.exe sur le poste de test). Journal effacé avant chaque
   lancement. En complet, s'il s'arrête, relance une fois sans `--ui-config-file` (`SANS_PRECONFIG`).
7. Attend `/health` (jusqu'à 10 min, durée affichée), ouvre Edge InPrivate (`NAVIGATEUR_PRIVE`), puis
   boucle comme dictaphone de secours (`Entrée`) ; `Q` → `Arreter.bat`.

## Les deux modes

- **complet** : la passerelle (port `PORT_DICTEE`) sert `app/` et toutes les API locales ; llamafile
  tourne SANS `--path`, donc sert son interface web par défaut, préréglée par `--ui-config-file
  app/discussion-config.json` (clés de `tools/ui/src/lib/constants/settings-keys.constants.ts` de
  llama.cpp). La page appelle l'API du modèle sur `http://127.0.0.1:PORT/` (CORS de llama-server : `*`).
- **secours** : `llamafile --path app` sert la page ; API même origine ; pas de passerelle, donc pas de
  dictée dans la page, de synthèse patient, d'historique, de capteur ni de réglages sur disque.
- La page lit `app/dictee/config.json` ; mode complet si `location.port` = port de la passerelle.

## llamafile 0.10.6

Basé sur llama-server : `/v1/chat/completions` (streaming, `timings_per_token: true`,
`reasoning_content`), `/health`, `/props` (`model_path`, `modalities.vision`,
`default_generation_settings.n_ctx`). `--mmproj` seulement si le fichier existe (images).
Son interface web n'a pas de traduction (anglais seulement).

## Passerelle (`scripts/dictee-serveur.ps1`)

TcpListener sur 127.0.0.1, monotâche, routes **comparées exactement** (sinon `/modeles` attrape
`/modeles.js`). Requêtes avec un en-tête `Origin` étranger refusées (403) ; sans `Origin` (capteur,
curl) acceptées. Journal `journal/passerelle.log`, PID `journal/dictee.pid` (écrit une fois le port
obtenu). Noms de fichiers toujours validés par motif avant de construire un chemin.
- `GET` fichiers de `app/` (types limités, pas de sortie du dossier).
- `/etat` ; `/transcrire` (POST WAV) → NDJSON `{fichier, duree_audio}`, `{progression}`, puis
  `{texte, duree}` ou `{erreur}` ; `?fichier=` retranscrit un WAV sauvegardé.
- `/modeles`, `/choisir-whisper?nom=`, `/charger-llm?nom=` (arrête llamafile par le port via
  `Get-NetTCPConnection` puis par nom, relance `serveur.bat`).
- `/reglages` (GET/POST `ressources/reglages.json`, défaut `app/reglages-defaut.json`, JSON validé) ;
  `/documents` (fusion `app/prompts` + `ressources/prompts`, origine defaut/modifie/perso),
  `/documents?fichier=` (POST), `/documents-supprimer`.
- `donnees/` : `/archiver` (POST ; `?type=` nouvelle archive `AAAA-MM-JJ/HHmmss-fff-type.json`,
  `?fichier=` mise à jour), `/archives?type=&texte=` (300 plus récentes), `/archive?fichier=`,
  `/archive-supprimer` ; `/patients`, `/patient?id=` (GET/POST, 100 Mo max), `/patient-supprimer` ;
  `/correspondances`, `/correspondance?id=ANON-AAAAMMJJ-HHMMSS`.
- `/boite` : POST par le capteur (gardé en mémoire, 50 max), GET par la page (vide la boîte).

## Transcription

- **whisper.cpp officiel** (`ressources/whisper-cpp/whisper-cli.exe` + DLL) choisi par `config.bat`
  s'il est présent, sinon whisperfile 0.10.6. Raison : whisperfile compile `ggml-cpu` sans `-mavx*`
  (`whisper.cpp.patches/llamafile-files/BUILD.mk`), donc SSE2 seul ; mesuré sur Xeon E-2124G :
  encodage 219 s pour une fenêtre de 30 s, `CPU :` vide dans le journal. Mêmes options.
- La page (`app/dictee.js`) enregistre (MediaRecorder), retire les silences de début/fin, convertit en
  WAV 16 kHz mono, envoie à `/transcrire`, estime le temps restant (facteur appris).
- La passerelle : `-t` (cœurs physiques), `-bs 1` (glouton ; whisper.cpp met beam 5 par défaut),
  `-ac` si fenêtre adaptée (50 trames/s, 1500 = 30 s), `-pp` (progression lue sur stderr),
  `--prompt` = vocabulaire + termes du dictionnaire **sans accents** (ligne de commande non sûre en
  UTF-8). Réglages de `reglages.json` prioritaires sur `config.bat`. « progress = 100% » = transcription
  finie ; whisper peut mettre longtemps à se fermer : dès que le `.txt` est stable, il est lu et le
  processus tué. Durées (sans texte) dans `journal/dictee.log`.
- Dictée de secours (console) : `scripts/dictee.bat` (ffmpeg dshow) → `app/dictee/pret.txt`, lu par la page.

## Page (`app/`)

Une seule page, onglets dans des blocs `{ }` (pas de collisions globales). `[hidden]` forcé en
`display: none !important` ; dans les `.colonne` (flex en colonne), `input`/`select` en `flex: none`.
- `commun.js` : config, `appelerModele` (streaming, stats, réflexion), `bilanGeneration`, réglages
  (`reglages`, `reglagesPrets`, `enregistrerReglages`), `corrigerTranscription` (seule transformation de la dictée),
  `consignesPersonnelles` (glossaire + formulations types), `appliquerSignature`, `chargerDocuments`, onglets et `vues`
  (zone qui reçoit la dictée ; `null` → presse-papier), `deposerTexte`, lecture de fichiers
  (`lireDocument` : images JPEG réduites, PDF par pdf.js 3.11 dans `app/lib/pdfjs`, scripts classiques,
  texte), `passerelleJson`, `archiver(type, titre, donnees, fichier)`.
- `redaction.js` (archive une rédaction, mise à jour à chaque modification), `discussion.js`
  (interface de llamafile en iframe ou intégrée selon `discussion.interface` ; l'intégrée est archivée),
  `synthese.js` (dossiers, éléments activables, boîte de réception relevée toutes les 2 s, outils
  résumé / question / rédaction, au plus 4 images), `anonymisation.js` (ordre : date de naissance,
  e-mail/NIR/téléphone, expressions longues, nom/prénom seuls, dates ; motifs insensibles aux accents ;
  identifiant `[ANON-…]` en tête), `historique.js`, `personnaliser.js`, `modeles.js`, `dictee.js`.
- Prompts : `app/prompts/*.txt` (`### TITRE`, `### CONSIGNES`, paires `### EXEMPLE NOTES` /
  `### EXEMPLE DOCUMENT`) ; système = `_commun.txt` + consignes + glossaire + formulations types (réglage
  `raccourcis` : aucun remplacement textuel, le modèle les adapte aux notes, exceptions comprises) ; exemples en tours
  user/assistant ; signature appliquée au système et aux exemples.
- Textes lus en UTF-8 via `TextDecoder` (le serveur ne précise pas toujours le charset).

## Capteur (`scripts/capteur.ps1`)

PowerShell `-STA`, fenêtre WinForms invisible (C# via `Add-Type`), `RegisterHotKey` Ctrl+Alt+
`TOUCHE_TEXTE`/`TOUCHE_IMAGE` (T/P par défaut ; attention : Ctrl+Alt = AltGr sur clavier français).
Texte : attend le relâchement des touches, `SendKeys ^c`, lit le presse-papier. Image :
`ms-screenclip:` puis attend une image dans le presse-papier (60 s). Envoi en JSON à `/boite`, bulle de
confirmation, journal `journal/capteur.log`, PID `journal/capteur.pid` (`scripts/arreter-capteur.bat`).
Non testable sous Linux (seule la syntaxe est vérifiée).

## Décisions déjà prises (ne pas rouvrir sans raison)

- llamafile pour le LLM (portable, calcul optimisé AVX/AVX2/AVX-512 par détection à l'exécution).
- whisper.cpp officiel pour la transcription (voir plus haut), whisperfile en repli.
- Whisper plutôt que l'audio natif de Gemma 4 : meilleur en français, relecture avant rédaction.
- MedGemma et MedASR écartés (anglophones, dépendances Python). Pas de RAG : few-shot suffit.

## Développement

- `python3 dev/serveur_factice.py 8080 [--ui-defaut]` imite llamafile (réflexion et timings simulés ;
  `--ui-defaut` = mode complet : fausse interface sur `/`, CORS).
- Passerelle : `pwsh` (PowerShell 7, téléchargeable en archive) et un faux whisper (script shell qui
  écrit `<-of>.txt`), avec `WHISPERFILE`, `MODELE_WHISPER`, `PORT`, `PORT_DICTEE` exportés.
  Attendre que `/etat` réponde avant de tester (démarrage de pwsh lent).
- Navigateur : playwright-core + Chromium (`/opt/pw-browsers`), micro simulé par
  `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream`.
- Syntaxe PowerShell : `[System.Management.Automation.Language.Parser]::ParseFile`.
- Interface et messages en français ; JS sans dépendance ni étape de build.
- Non testé sur Windows réel par Claude : s'appuyer sur les journaux envoyés par l'utilisateur.
