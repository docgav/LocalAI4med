@echo off
rem ============================================================
rem  Parametres techniques de l'IA locale (les reglages courants se font dans
rem  l'onglet Personnaliser de la page). Ne modifiez pas ce fichier : il est remplace
rem  a chaque mise a jour. Recopiez les lignes a changer dans
rem  ressources\config_perso.bat, lu en dernier et jamais ecrase.
rem  Tous les fichiers telecharges vont dans le dossier ressources\.
rem ============================================================

rem --- Modele de redaction (llamafile) ---
set "LLAMAFILE=ressources\llamafile.exe"
rem Deux versions possibles. Si les deux sont presentes, un choix est propose au demarrage.
rem Les fichiers mmproj (facultatifs) permettent d'envoyer des images a l'IA.
set "MODELE_2B=ressources\gemma-4-E2B-it-Q4_K_M.gguf"
set "MMPROJ_2B=ressources\mmproj-E2B.gguf"
set "MODELE_4B=ressources\gemma-4-E4B-it-Q4_K_M.gguf"
set "MMPROJ_4B=ressources\mmproj-E4B.gguf"
rem Modele choisi par defaut (2B ou 4B) si aucune touche n'est pressee.
set "MODELE_DEFAUT=2B"
set "PORT=8080"
rem Taille du contexte (tokens). 8192 suffit pour consignes + exemples + notes.
set "CONTEXTE=8192"
rem Nombre de threads CPU (vide = automatique).
set "THREADS="
rem Options supplementaires passees a llamafile (ex. --reasoning-budget 0).
set "OPTIONS_LLM="

rem --- Transcription (whisperfile) ---
rem whisper.cpp officiel (dossier ressources\whisper-cpp\) utilise s'il est present : meme moteur que
rem whisperfile, mais compile avec AVX2, donc 10 a 20 fois plus rapide. Sinon : whisperfile.
set "WHISPERFILE=ressources\whisperfile.exe"
if exist "ressources\whisper-cpp\whisper-cli.exe" set "WHISPERFILE=ressources\whisper-cpp\whisper-cli.exe"
set "MODELE_WHISPER=ressources\ggml-medium-q5_0.bin"
rem Vitesse : -bs 1 = decodage rapide (glouton). -bs 5 = recherche en faisceau (reglage d'origine),
rem un peu plus precise mais nettement plus lente.
set "WHISPER_OPTIONS=-bs 1"
rem Dictees courtes : 1 = fenetre audio adaptee a la duree (beaucoup plus rapide sous 30 s),
rem a tester : peut un peu degrader la reconnaissance. 0 = fenetre standard de 30 s.
set "WHISPER_CTX_ADAPTE=0"
rem Threads CPU pour la transcription (vide = nombre de coeurs physiques du poste).
set "WHISPER_THREADS="
set "VOCABULAIRE=Consultation de neurologie. Sclerose en plaques, IRM, EDSS, ocrelizumab, natalizumab, bandes oligoclonales, poussee, myelite."

rem --- Dictee integree a la page (passerelle PowerShell sur 127.0.0.1) ---
set "PORT_DICTEE=8081"
rem Audio des dictees (dictees\*.wav) : 0 = efface en fin de session, 1 = conserve.
set "CONSERVER_AUDIO=0"

rem --- Raccourcis clavier globaux (mode complet) : Ctrl+Alt+<touche> dans n'importe quel logiciel.
rem TOUCHE_TEXTE envoie le texte selectionne, TOUCHE_IMAGE une capture d'ecran, a la Synthese patient.
set "CAPTEUR=1"
set "TOUCHE_TEXTE=T"
set "TOUCHE_IMAGE=P"

rem --- Navigateur : 1 = fenetre InPrivate d'Edge (historique des discussions efface a la fermeture).
set "NAVIGATEUR_PRIVE=1"

rem --- Enregistrement en secours depuis la fenetre noire (ffmpeg) ---
set "FFMPEG=ressources\ffmpeg.exe"

if exist "ressources\config_perso.bat" call "ressources\config_perso.bat"
