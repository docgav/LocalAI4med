# Fichiers à télécharger

Ces fichiers ne sont pas sur GitHub parce qu'ils sont trop lourds. Téléchargez-les une fois sur
votre ordinateur personnel. Aucun ne nécessite d'installation.

**Tous vont dans le même dossier : `IA\ressources\`.** Les mises à jour ne touchent jamais ce dossier.

| Fichier (nom exact dans `ressources\`) | Taille |
|---|---|
| `llamafile.exe` | ~ 300 Mo |
| `gemma-4-E2B-it-Q4_K_M.gguf` | quelques Go |
| `whisperfile.exe` | ~ 300 Mo |
| `ggml-medium-q5_0.bin` | ~ 540 Mo |
| `ffmpeg.exe` | ~ 100 Mo |

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
  `set "MODELE_LLM=ressources\nom-du-fichier.gguf"`

Le téléchargement peut demander un compte Hugging Face et l'acceptation de la licence Gemma.

Ne prenez pas les modèles E4B : en Q4, ils sont trop lourds pour les postes de 8 Go de RAM.

## 3. Modèle de transcription : Whisper medium

Téléchargement direct :
https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium-q5_0.bin

Placez le fichier dans `IA\ressources\`.

Option plus précise, mais plus lente : `ggml-large-v3-turbo-q5_0.bin`, dans le même dépôt
(https://huggingface.co/ggerganov/whisper.cpp). Il faut alors indiquer `set "MODELE_WHISPER=ressources\ggml-large-v3-turbo-q5_0.bin"` dans `ressources\config_perso.bat`.

## 4. ffmpeg (enregistrement du micro)

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
