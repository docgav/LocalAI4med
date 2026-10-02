# IA locale portable pour la rédaction médicale

IA qui tourne entièrement sur le poste, depuis un disque USB chiffré, sans installation.
Dictée → transcription (Whisper) → rédaction du courrier (Gemma) → relecture → copie dans le DPI.
Rien ne sort de la machine : le serveur écoute uniquement sur `127.0.0.1`.

## Utilisation

1. Double-cliquer sur `Demarrer.bat`. Le modèle se charge, puis la page s'ouvre dans le navigateur.
2. La fenêtre noire sert de **dictaphone** : `Entrée` pour dicter, `q` pour arrêter l'enregistrement.
   Le texte transcrit s'insère automatiquement dans « Notes / dictée ». On peut aussi taper les notes.
3. Choisir le type de document, cliquer sur **Rédiger** (ou `Ctrl+Entrée`).
4. Corriger directement le texte, ou donner une consigne (« plus court »…) puis **Modifier**.
5. **Copier**, coller dans le DPI.
6. En fin de session : **Tout effacer** dans la page, puis `Q` dans la fenêtre dictaphone
   (arrêt du serveur, effacement des dictées, vidage du presse-papier).

Au premier lancement sur un poste, le micro est demandé (`scripts\micro.bat`, résultat dans `micro.txt`).
Pour changer de micro : supprimer `micro.txt`.

## Contenu du disque

```
IA/
├── Demarrer.bat          lance le serveur, ouvre la page, sert de dictaphone
├── Arreter.bat           arrête le serveur et efface les données de session
├── config.bat            SEUL fichier de réglages (modèles, port, vocabulaire)
├── llamafile.exe         *
├── modeles/              * gemma-4-E2B-it-Q4_K_M.gguf
├── whisper/              * whisperfile.exe, ggml-medium-q5_0.bin
├── outils/               * ffmpeg.exe (build statique Windows)
├── app/                  interface web (servie par llamafile)
│   ├── prompts/          un fichier .txt par type de document
│   └── dictee/           dernière transcription (temporaire, effacée à l'arrêt)
├── scripts/              dictee.bat, micro.ps1, serveur.bat, nettoyer.bat
├── dictees/              audio temporaire (effacé après transcription)
├── journal/              serveur.log (diagnostic)
└── dev/                  serveur factice pour tester l'interface sans modèle
```

`*` : non versionnés (trop lourds). Les exécutables llamafile et whisperfile 0.10.6
doivent être renommés avec l'extension `.exe`.

## Ajouter ou modifier un type de document

Créer un fichier `.txt` (UTF-8, nom sans accent) dans `app/prompts/`. Il apparaît au prochain démarrage.
Le numéro en début de nom fixe l'ordre. Les fichiers commençant par `_` sont ignorés
(`_commun.txt` contient les consignes communes à tous les documents, dont la signature).

```
### TITRE
Courrier d'adressage

### CONSIGNES
Ce que le modèle doit faire, la structure attendue…

### EXEMPLE NOTES
notes ou dictée fictives

### EXEMPLE DOCUMENT
le document attendu pour ces notes
```

On peut mettre plusieurs paires `EXEMPLE NOTES` / `EXEMPLE DOCUMENT`. Elles sont envoyées comme
exemples de dialogue (few-shot), plus efficace que de les mettre dans les consignes.
Deux ou trois exemples suffisent ; au-delà, la génération ralentit.
**Les exemples doivent être fictifs ou totalement anonymisés.**

## Dépannage

| Problème | Piste |
|---|---|
| « Le serveur n'a pas démarré » | Lire la fin de `journal\serveur.log`, affichée à l'écran. Vérifier le nom exact du modèle dans `config.bat` et les doubles extensions cachées (`llamafile.exe.exe`). Tester `llamafile.exe --version` dans une invite de commandes. Antivirus. |
| Page sans types de document | Lancer par `Demarrer.bat` (il génère `app\prompts\_liste.txt`). |
| La dictée ne démarre pas | Nom du micro : supprimer `micro.txt`. Si PowerShell est bloqué : écrire le nom du micro à la main dans `micro.txt` (liste : `outils\ffmpeg.exe -list_devices true -f dshow -i dummy`). |
| Lenteur | La vitesse (tokens/s) s'affiche après chaque rédaction. Fermer les autres applications, réduire `CONTEXTE`, raccourcir les exemples. |
| Le modèle « réfléchit » longtemps | Ajouter `--reasoning-budget 0` dans `OPTIONS_LLM` (`config.bat`). |

## Tester l'interface sans modèle (développement)

```
python3 dev/serveur_factice.py 8080
```

## Points de vigilance

- **Validation DSI/RSSI indispensable** avant tout usage réel (exécutables non signés, ports USB).
- Chiffrer le disque avec BitLocker To Go.
- Pseudonymiser les dictées autant que possible ; navigateur sans extensions.
- Le document produit est un **brouillon** : relecture obligatoire, surtout les ordonnances
  (risque d'invention de posologie, normalement signalée par `[À PRÉCISER]`).
