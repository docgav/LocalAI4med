@echo off
rem Efface les fichiers temporaires de la session. Ne touche jamais au dossier donnees\
rem (documents conserves, dossiers patients, tables d'anonymisation).
cd /d "%~dp0.."
call config.bat
if not "%CONSERVER_AUDIO%"=="1" del /q dictees\*.wav 2>nul
del /q dictees\*.txt dictees\*.sortie 2>nul
del /q app\dictee\*.txt 2>nul
rem Vide le presse-papier
cmd /c "echo off | clip"
