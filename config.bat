@echo off
rem ============================================================
rem  Parametres de l'IA locale. Seul fichier a modifier.
rem  Tous les fichiers telecharges vont dans le dossier ressources\.
rem  Pour garder vos reglages lors des mises a jour, recopiez les lignes
rem  a modifier dans ressources\config_perso.bat (lu en dernier).
rem ============================================================

rem --- Modele de redaction (llamafile) ---
set "LLAMAFILE=ressources\llamafile.exe"
set "MODELE_LLM=ressources\gemma-4-E2B-it-Q4_K_M.gguf"
set "PORT=8080"
rem Taille du contexte (tokens). 8192 suffit pour consignes + exemples + notes.
set "CONTEXTE=8192"
rem Nombre de threads CPU (vide = automatique).
set "THREADS="
rem Options supplementaires passees a llamafile (ex. --reasoning-budget 0).
set "OPTIONS_LLM="

rem --- Transcription (whisperfile) ---
set "WHISPERFILE=ressources\whisperfile.exe"
set "MODELE_WHISPER=ressources\ggml-medium-q5_0.bin"
set "VOCABULAIRE=Consultation de neurologie. Sclerose en plaques, IRM, EDSS, ocrelizumab, natalizumab, bandes oligoclonales, poussee, myelite."

rem --- Enregistrement (ffmpeg) ---
set "FFMPEG=ressources\ffmpeg.exe"

if exist "ressources\config_perso.bat" call "ressources\config_perso.bat"
