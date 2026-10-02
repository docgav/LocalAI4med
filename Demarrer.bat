@echo off
rem Relance dans une fenetre qui reste ouverte, pour voir les messages en cas d'erreur.
if /i "%~1"=="/garder" goto suite
cmd /k ""%~f0" /garder"
exit /b
:suite
chcp 65001 >nul
cd /d "%~dp0"
call config.bat
title IA locale - dictaphone

if not exist "app\index.html" (echo [ERREUR] Dossier app incomplet : recopiez le contenu du ZIP. & pause & exit /b 1)
if not exist "app\prompts\" (echo [ERREUR] Dossier app\prompts manquant : recopiez le contenu du ZIP. & pause & exit /b 1)
if not exist "%LLAMAFILE%"  (echo [ERREUR] %LLAMAFILE% introuvable. & pause & exit /b 1)
if not exist "%MODELE_LLM%" (echo [ERREUR] Modele introuvable : %MODELE_LLM% & pause & exit /b 1)
if not exist "%WHISPERFILE%"    echo [ATTENTION] %WHISPERFILE% introuvable : dictee indisponible.
if not exist "%MODELE_WHISPER%" echo [ATTENTION] %MODELE_WHISPER% introuvable : dictee indisponible.
if not exist "%FFMPEG%"         echo [ATTENTION] %FFMPEG% introuvable : dictee indisponible.

for %%F in ("%LLAMAFILE%") do set "PROC=%%~nxF"
if not exist journal mkdir journal
if not exist dictees mkdir dictees
if not exist app\dictee mkdir app\dictee
del /q app\dictee\*.txt 2>nul

rem Liste des types de documents (fichiers de app\prompts ne commencant pas par _)
dir /b /on "app\prompts\*.txt" | findstr /v /b /c:"_" > "app\prompts\_liste.txt"

curl -s -f -o nul "http://127.0.0.1:%PORT%/health" && goto ouvrir

echo Demarrage du modele de redaction...
start "IA - serveur" /min cmd /c scripts\serveur.bat

set /a ESSAIS=0
:attente
timeout /t 2 /nobreak >nul
curl -s -f -o nul "http://127.0.0.1:%PORT%/health" && goto ouvrir
tasklist /fi "imagename eq %PROC%" | find /i "%PROC%" >nul
if errorlevel 1 goto echec
set /a ESSAIS+=1
if %ESSAIS% lss 120 (echo   chargement... & goto attente)
:echec
echo.
echo [ERREUR] Le serveur n'a pas demarre. Fin du journal :
echo ------------------------------------------------------------
powershell -NoProfile -Command "Get-Content journal\serveur.log -Tail 25" 2>nul || type journal\serveur.log
echo ------------------------------------------------------------
pause
exit /b 1

:ouvrir
start "" "http://127.0.0.1:%PORT%/"
cls
echo ============================================================
echo  IA locale prete : http://127.0.0.1:%PORT%/
echo  Gardez cette fenetre ouverte : elle sert de dictaphone.
echo  Le texte dicte s'insere automatiquement dans la page.
echo ============================================================

:menu
echo.
set "R="
set /p "R=[Entree] dicter    [Q] quitter et tout effacer : "
if /i "%R%"=="q" goto fin
call scripts\dictee.bat
goto menu

:fin
call Arreter.bat
exit
