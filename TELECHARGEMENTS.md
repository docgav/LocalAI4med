# Fichiers à télécharger

Ces fichiers ne sont pas sur GitHub parce qu'ils sont trop lourds. Téléchargez-les une fois sur
votre ordinateur personnel. Aucun ne nécessite d'installation.

**Tous vont dans le même dossier : `IA\ressources\`.** Les mises à jour ne touchent jamais ce dossier.

| Fichier (nom exact dans `ressources\`) | Taille |
|---|---|
| `llamafile.exe` | ~ 300 Mo |
| `gemma-4-E2B-it-Q4_K_M.gguf` | quelques Go |
| `mmproj-E2B.gguf` (facultatif : images) | quelques centaines de Mo |
| `gemma-4-E4B-it-Q4_K_M.gguf` (facultatif) | ~ 5 Go |
| `mmproj-E4B.gguf` (facultatif : images) | quelques centaines de Mo |
| `whisper-cpp\` (dossier, **recommandé** : transcription rapide) | ~ 10 Mo |
| `whisperfile.exe` (si `whisper-cpp\` absent) | ~ 300 Mo |
| `ggml-medium-q5_0.bin` | ~ 540 Mo (vérifiez la taille) |
| `ffmpeg.exe` (facultatif : dictée de secours) | ~ 100 Mo |

Avant tout : dans l'Explorateur, menu **Affichage** → **Afficher** → cochez
**Extensions de noms de fichiers**. Vous verrez ainsi les noms complets des fichiers.

---

## 1. llamafile et whisperfile (version 0.10.6)

Les deux programmes sont publiés au même endroit.

1. Ouvrez la page de la version : https://github.com/mozilla-ai/llamafile/releases/tag/0.10.6
2. En bas, dans **Assets**, téléchargez :
   - `llamafile-0.10.6` (prenez bien ce fichier, pas la version `-thin`) ;
   - `whisperfile-0.10.6`.
3. Renommez-les en ajoutant `.exe` à la fin (Windows l'exige) :
   - `llamafile-0.10.6` → `llamafile.exe` ;
   - `whisperfile-0.10.6` → `whisperfile.exe`.
4. Placez-les dans `IA\ressources\`.

Vérification : ouvrez une invite de commandes dans le dossier `IA\ressources` (tapez `cmd` dans la barre
d'adresse de l'Explorateur, puis Entrée), puis tapez `llamafile.exe --version`.
La commande doit afficher un numéro de version.

## 2. Modèle de rédaction : Gemma 4 E2B

1. Allez sur https://huggingface.co et cherchez **`gemma-4-E2B-it-GGUF`**.
2. Choisissez un dépôt connu, par exemple ceux de **ggml-org** (équipe de llama.cpp) ou d'**unsloth**.
3. Onglet **Files and versions** : téléchargez le fichier dont le nom contient **`Q4_K_M`** et finit par `.gguf`.
4. Placez-le dans `IA\ressources\`.

Si le nom du fichier n'est pas exactement `gemma-4-E2B-it-Q4_K_M.gguf`, vous avez deux solutions :
- renommer le fichier ;
- ou indiquer son nom dans `ressources\config_perso.bat` (voir « Mettre à jour » dans le README), par exemple :
  `set "MODELE_2B=ressources\nom-du-fichier.gguf"`

Le téléchargement peut demander un compte Hugging Face et l'acceptation de la licence Gemma.

### Facultatif : version E4B (plus précise)

Même démarche avec **`gemma-4-E4B-it-GGUF`**, fichier `Q4_K_M`, renommé `gemma-4-E4B-it-Q4_K_M.gguf`.
Si les deux versions sont dans `ressources\`, `Demarrer.bat` propose de choisir. E4B demande environ
16 Go de RAM : réservez-le à votre ordinateur personnel, gardez E2B pour les postes de l'hôpital.

### Facultatif : lecture des images (fichiers mmproj)

Pour envoyer des images à l'IA (onglets Discussion et Synthèse patient), il faut le « projecteur » du modèle.
1. Dans le même dépôt Hugging Face que le modèle, téléchargez le fichier dont le nom commence par
   **`mmproj`** (prendre la version `F16` ou `Q8_0` si plusieurs sont proposées).
2. Renommez-le `mmproj-E2B.gguf` (ou `mmproj-E4B.gguf` pour la version E4B) et placez-le dans `ressources\`.

Chaque mmproj ne fonctionne qu'avec son modèle. Sans ce fichier, tout fonctionne sauf les images
(les PDF contenant du texte restent lisibles).

## 3. Transcription rapide : whisper.cpp officiel (recommandé)

whisperfile 0.10.6 est compilé sans les instructions de calcul rapide des processeurs (AVX2) :
la transcription est 10 à 20 fois plus lente que nécessaire. Le whisper.cpp officiel est le même
moteur, avec les mêmes options, compilé correctement. Il est utilisé automatiquement s'il est présent.

1. Ouvrez https://github.com/ggml-org/whisper.cpp/releases et prenez la dernière version.
2. Dans **Assets**, téléchargez **`whisper-bin-x64.zip`** (pas les versions `blas`, `cublas` ni `win32`).
3. Créez le dossier `IA\ressources\whisper-cpp\`.
4. Ouvrez le ZIP : copiez **tout le contenu** du dossier `Release` (fichiers `.exe` **et** `.dll`)
   dans `IA\ressources\whisper-cpp\`. Il faut au moins `whisper-cli.exe` et les `.dll` à côté.

Vérification : invite de commandes dans `IA\ressources\whisper-cpp`, puis `whisper-cli.exe --help`.
Si Windows signale un fichier `VCRUNTIME140.dll` manquant, ce poste n'a pas les bibliothèques Microsoft
nécessaires : gardez whisperfile (il suffit de supprimer le dossier `whisper-cpp`).

Après une dictée, `journal\whisper.log` doit afficher une ligne `CPU : ... AVX2 = 1 ...`.

## 4. Modèle de transcription : Whisper medium

Téléchargement direct :
https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium-q5_0.bin

Placez le fichier dans `IA\ressources\`. **Vérifiez sa taille : environ 540 Mo.** Un fichier de 1,4 Go
est la version non compressée (`ggml-medium.bin`) : elle fonctionne, mais plus lentement.

Autres modèles possibles, dans le même dépôt (https://huggingface.co/ggerganov/whisper.cpp) :

| Fichier | Vitesse | Précision |
|---|---|---|
| `ggml-small-q5_1.bin` (~ 190 Mo) | environ 3 fois plus rapide que medium | moins bonne sur le vocabulaire médical |
| `ggml-medium-q5_0.bin` (~ 540 Mo) | référence | bonne |
| `ggml-large-v3-turbo-q5_0.bin` (~ 550 Mo) | à comparer sur votre poste | meilleure |

Pour en utiliser un autre, placez-le dans `ressources\` et indiquez son nom dans
`ressources\config_perso.bat`, par exemple : `set "MODELE_WHISPER=ressources\ggml-small-q5_1.bin"`.
Plus simple : gardez plusieurs fichiers dans `ressources\` et choisissez-les dans le menu **⚙ Modèles** de la page ;
le temps mis s'affiche après chaque dictée et dans `journal\dictee.log`.

## 5. ffmpeg (facultatif : dictée de secours depuis la fenêtre noire)

La dictée de la page n'en a pas besoin. ffmpeg ne sert que si PowerShell est bloqué sur le poste.

1. Allez sur https://www.gyan.dev/ffmpeg/builds/. Ce site est cité par le site officiel ffmpeg.org.
2. Section **release builds** : téléchargez `ffmpeg-release-essentials.zip`.
3. Ouvrez le ZIP. Dans le dossier `bin`, copiez **seulement** `ffmpeg.exe` dans `IA\ressources\`.

---

## Contrôle d'intégrité (recommandé, utile pour la DSI)

Les pages de téléchargement indiquent souvent une empreinte **SHA256**. Pour la comparer avec
celle du fichier que vous avez téléchargé, tapez dans une invite de commandes :

```
certutil -hashfile llamafile.exe SHA256
```

Les deux empreintes doivent être identiques. Notez-les : elles serviront au dossier de validation.

## Après le téléchargement

Débloquez chaque fichier : clic droit → **Propriétés** → cochez **Débloquer** (si la case
existe) → **OK**. Lancez ensuite `Demarrer.bat` (voir le [README](README.md)).
