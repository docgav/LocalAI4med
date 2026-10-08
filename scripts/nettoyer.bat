@echo off
rem Efface les fichiers temporaires de la session (presse-papier, textes intermediaires).
rem Les enregistrements audio (donnees\audio) sont conserves, sauf si l'option
rem "Supprimer les enregistrements audio a la fermeture" est cochee dans Reglages > Donnees.
rem Ne touche jamais aux documents, dossiers patients ni tables d'anonymisation.
cd /d "%~dp0.."
call config.bat
if exist ressources\reglages.json findstr /r /c:"supprimer_audio.*true" ressources\reglages.json >nul && del /q donnees\audio\*.wav 2>nul
del /q donnees\audio\*.txt donnees\audio\*.sortie 2>nul
del /q dictees\*.wav dictees\*.txt dictees\*.sortie 2>nul
del /q app\dictee\*.txt 2>nul
rem Vide le presse-papier
cmd /c "echo off | clip"
