# IA locale portable pour la rédaction médicale

IA qui tourne entièrement sur le poste, depuis un disque USB chiffré, sans installation.
Dictée → transcription (Whisper) → rédaction du courrier (Gemma) → relecture → copie dans le DPI.
Rien ne sort de la machine : le serveur écoute uniquement sur `127.0.0.1`.

## Utilisation

1. Double-cliquer sur `Demarrer.bat`. Si les deux versions de Gemma sont présentes, taper `1` (E2B, rapide)
   ou `2` (E4B, plus précis, 16 Go de RAM conseillés) ; sans réponse, E2B est choisi après 10 s.
   Le modèle se charge, puis la page s'ouvre dans le navigateur.
2. Dicter avec le bouton **🎙 Dicter** en haut de la page (ou la touche `F2`), puis **Arrêter** (ou `F2`).
   Au premier usage, le navigateur demande l'autorisation d'utiliser le micro : accepter.
   Le texte transcrit s'insère dans l'onglet affiché. On peut aussi taper les notes.
   - Chaque enregistrement est sauvegardé dans `dictees\` (nom affiché). En cas d'échec de la
     transcription, **Réessayer** relance sur le même fichier ; **▶** réécoute le dernier enregistrement.
   - Si plusieurs micros sont branchés, une liste permet de choisir.
   - **Fichier audio…** transcrit un enregistrement existant (wav, mp3, m4a, ogg…), par exemple celui
     d'un dictaphone. On peut aussi le glisser dans l'onglet Discussion. Une copie est sauvegardée dans `dictees\`.
   - Les fichiers audio sont effacés à l'arrêt (`Q`), sauf si `CONSERVER_AUDIO=1` (réglages).
   - Secours : si le bouton reste grisé (PowerShell bloqué sur le poste), dicter depuis la fenêtre
     noire : `Entrée` pour commencer, `q` pour arrêter.
3. Choisir le type de document, cliquer sur **Rédiger** (ou `Ctrl+Entrée`).
4. Corriger directement le texte, ou donner une consigne (« plus court »…) puis **Modifier**.
5. **Copier**, coller dans le DPI.
6. En fin de session : **Tout effacer** dans la page, puis `Q` dans la fenêtre noire
   (arrêt du serveur, effacement des dictées, vidage du presse-papier).

### Onglet Personnaliser

Tout se règle dans l'application ; en mode complet, c'est enregistré dans `ressources\` (fichier
`reglages.json` et dossier `prompts\`), donc conservé lors des mises à jour.
- **Réglages** : signature des courriers (remplace `[NOM]`, `[HÔPITAL]` et le service), créativité et
  longueur de la rédaction, affichage de la réflexion du modèle, options de transcription, choix de
  l'interface de discussion.
- **Modèles de documents** : modifier un modèle existant (votre version remplace l'originale, qui
  reste récupérable), en créer un nouveau, modifier les consignes communes (`_commun.txt`).
- **Raccourcis** : une expression (ex. « examen neurologique normal ») est remplacée par un texte
  complet, dans les notes dictées et au moment de la rédaction.
- **Dictionnaire de transcription** : corrige ce que Whisper comprend mal (ex. « natalisumab » →
  « natalizumab ») ; les formes correctes lui sont aussi données comme vocabulaire.
- **Glossaire** : abréviations du service (ex. SEP = sclérose en plaques), transmises au modèle.

Pendant la rédaction, la page affiche la phase en cours, la **réflexion du modèle** s'il en produit
(cadre repliable) et les **statistiques** : tokens lus, tokens rédigés, vitesse en tokens/s.

### Changer de modèle sans redémarrer

Le menu **⚙ Modèles** (en haut de la page) liste les fichiers présents dans `ressources\` :
- **Rédaction / discussion** (fichiers `.gguf`) : choisir puis **Charger**. Le modèle actuel est
  arrêté et le nouveau chargé (environ une minute, compteur affiché). Les images restent disponibles
  si le fichier mmproj correspondant est présent (`mmproj-E2B.gguf`, `mmproj-E4B.gguf`, ou
  `mmproj-<nom du modèle>` pour un autre modèle).
- **Transcription** (fichiers `ggml*.bin`) : pris en compte dès la dictée suivante. Pratique pour
  comparer vitesse et précision : le modèle utilisé est noté dans `journal\dictee.log`.

Ces choix valent pour la session ; au démarrage suivant, les réglages de `config.bat` s'appliquent.
Menu disponible en mode complet seulement.

### Onglet Discussion

Par défaut, c'est **l'interface de discussion de llamafile** (celle de llama.cpp), affichée dans la page
et déjà réglée : message système en français adapté à la neurologie, température basse, titres des
discussions sans appel au modèle. Toutes ses fonctions sont disponibles : historique des discussions,
pièces jointes (PDF, images, texte), modification et régénération des réponses, réglages (roue dentée).
- Les **images** nécessitent le fichier `mmproj` du modèle (voir [TELECHARGEMENTS.md](TELECHARGEMENTS.md)) ;
  en haut à droite de la page, « (images) » indique qu'il est chargé.
- La **dictée** n'est pas insérée directement dans cette interface : elle est copiée dans le presse-papier,
  il suffit de coller (Ctrl+V). Cliquer sur « Dicter » (F2 ne marche pas quand on est dans la discussion).
- « Ouvrir dans un onglet séparé » l'affiche en plein écran.
- Les préréglages sont dans `app\discussion-config.json` (message système, température…), lus au démarrage.

**Confidentialité** : cette interface garde l'historique des discussions dans le navigateur. La page est
donc ouverte dans une **fenêtre InPrivate** d'Edge, dont tout le contenu est effacé à sa fermeture
(réglage `NAVIGATEUR_PRIVE=1`). Conséquence : l'autorisation du micro est redemandée à chaque session.

**Interface en anglais** : celle de llamafile n'existe qu'en anglais (le modèle répond en français).
Pour une discussion entièrement en français : onglet Personnaliser → Discussion → « Interface intégrée ».

**Mode secours** : si PowerShell est bloqué sur le poste, la page est servie par llamafile et l'onglet
Discussion revient à une discussion simplifiée intégrée (mêmes pièces jointes, dictée insérée directement).
La fenêtre noire indique « mode complet » ou « mode secours » au démarrage.

Pour la dictée de secours (fenêtre noire), le micro est demandé au premier usage sur un poste
(`scripts\micro.bat`, résultat dans `micro.txt`). Pour en changer : supprimer `micro.txt`.

## Contenu du disque

```
IA/
├── Demarrer.bat          lance le serveur, ouvre la page, sert de dictaphone
├── Arreter.bat           arrête le serveur et efface les données de session
├── config.bat            réglages (modèles, port, vocabulaire)
├── ressources/           * TOUS les fichiers téléchargés, réunis ici :
│                           llamafile.exe, whisperfile.exe, ffmpeg.exe,
│                           gemma-4-E2B-it-Q4_K_M.gguf, ggml-medium-q5_0.bin,
│                           (facultatifs) gemma-4-E4B-it-Q4_K_M.gguf, mmproj-E2B.gguf, mmproj-E4B.gguf
│                           (+ config_perso.bat, facultatif)
├── app/                  interface web (servie par llamafile) ; lib/pdfjs : lecture des PDF
│   ├── prompts/          un fichier .txt par type de document
│   └── dictee/           dernière transcription (temporaire, effacée à l'arrêt)
├── scripts/              dictee-serveur.ps1 (passerelle de dictée), serveur.bat, nettoyer.bat,
│                         dictee.bat + micro.ps1 (dictée de secours)
├── dictees/              enregistrements audio de la session (effacés à l'arrêt)
├── journal/              serveur.log (diagnostic)
└── dev/                  serveur factice pour tester l'interface sans modèle
```

`*` : non versionné (trop lourd) : voir [TELECHARGEMENTS.md](TELECHARGEMENTS.md).

## Mettre à jour

Téléchargez le nouveau ZIP et copiez son contenu par-dessus le dossier `IA` en acceptant de remplacer.
Le dossier `ressources` n'est pas touché : rien à retélécharger.

Vos réglages personnels (nom du modèle, vocabulaire…) : créez `ressources\config_perso.bat` et
recopiez-y seulement les lignes `set` de `config.bat` que vous modifiez. Il est lu après `config.bat`
et n'est jamais écrasé par une mise à jour.

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

## Accélérer la transcription

Pendant la transcription, la page affiche le temps restant estimé. L'estimation s'affine au fil
des dictées sur un même poste. À la fin, elle indique la durée d'audio et le temps mis.

**Le plus important : installer whisper.cpp officiel** dans `ressources\whisper-cpp\` (voir
[TELECHARGEMENTS.md](TELECHARGEMENTS.md)). whisperfile 0.10.6 n'utilise pas les instructions AVX2 des
processeurs : sur un Xeon E-2124G, 20 s d'audio prenaient 250 s, dont 219 s d'encodage.

Réglages déjà appliqués : décodage rapide (`WHISPER_OPTIONS=-bs 1`), tous les cœurs physiques
du processeur (`WHISPER_THREADS` vide), silences de début et de fin retirés avant l'envoi.

Pour aller plus vite :
1. **Modèle Whisper plus petit** : `ggml-small-q5_1.bin` est environ 3 fois plus rapide que medium,
   mais fait plus d'erreurs sur le vocabulaire médical (voir [TELECHARGEMENTS.md](TELECHARGEMENTS.md)).
2. **Ordinateur portable branché sur secteur**, en mode d'alimentation « Performances optimales » :
   sur batterie, le processeur est bridé.
3. **Disque USB 3** (prise bleue) : le modèle est relu à chaque dictée. Un vieux port USB 2 peut
   ajouter plusieurs secondes.
4. **Dicter par morceaux** plutôt qu'en un seul long enregistrement : chaque morceau est
   transcrit pendant que vous préparez le suivant.
5. **Dictées courtes** : Whisper traite toujours une fenêtre de 30 s, même pour 6 s de parole.
   `set "WHISPER_CTX_ADAPTE=1"` (dans `ressources\config_perso.bat`) adapte la fenêtre à la durée
   réelle : nettement plus rapide sous 30 s, mais à tester, la reconnaissance peut être un peu moins bonne.

Chaque transcription ajoute une ligne de durées dans `journal\dictee.log` (aucun texte) :
durée de l'audio, moment où la transcription est finie, temps total. Utile pour comparer les réglages.

À l'inverse, pour un peu plus de précision au prix de la vitesse : `set "WHISPER_OPTIONS=-bs 5"`
dans `ressources\config_perso.bat`.

## Dépannage

| Problème | Piste |
|---|---|
| « Le serveur n'a pas démarré » | Lire la fin de `journal\serveur.log`, affichée à l'écran. Vérifier le nom exact du modèle dans `config.bat` et les doubles extensions cachées (`llamafile.exe.exe`). Tester `llamafile.exe --version` dans une invite de commandes. Antivirus. |
| Page sans types de document | Lancer par `Demarrer.bat` (il génère `app\prompts\_liste.txt`). |
| Démarrage bloqué ou « mode secours » inattendu | Lire `journal\passerelle.log`. « impossible d'écouter sur le port 8081 » : un autre logiciel utilise ce port ; mettre `set "PORT_DICTEE=8091"` (ou un autre numéro) dans `ressources\config_perso.bat`. Pas de fichier du tout : PowerShell est bloqué sur le poste. |
| Bouton « Dicter » grisé | Passerelle de dictée non lancée : PowerShell bloqué par le poste, ou whisperfile / son modèle absent de `ressources\` (le survol du bouton indique la cause). Utiliser la dictée de secours de la fenêtre noire. |
| La dictée de secours ne démarre pas | Nom du micro : supprimer `micro.txt`. Si PowerShell est bloqué : écrire le nom du micro à la main dans `micro.txt` (liste : `ressources\ffmpeg.exe -list_devices true -f dshow -i dummy`). |
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
