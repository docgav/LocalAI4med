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
if not exist "%WHISPERFILE%"    echo [ATTENTION] %WHISPERFILE% introuvable : dictee indisponible.
if not exist "%MODELE_WHISPER%" echo [ATTENTION] %MODELE_WHISPER% introuvable : dictee indisponible.
if not exist "%FFMPEG%"         echo [ATTENTION] %FFMPEG% introuvable : dictee indisponible.

for %%F in ("%LLAMAFILE%") do set "PROC=%%~nxF"

rem --- Choix du modele (2B / 4B) selon les fichiers presents ---
set "OK2=" & set "OK4="
if exist "%MODELE_2B%" set "OK2=1"
if exist "%MODELE_4B%" set "OK4=1"
if not defined OK2 if not defined OK4 (echo [ERREUR] Aucun modele trouve : %MODELE_2B% ou %MODELE_4B% & pause & exit /b 1)
set "CHOIX=%MODELE_DEFAUT%"
if not defined OK2 set "CHOIX=4B"
if not defined OK4 set "CHOIX=2B"
if not defined OK2 goto modele_choisi
if not defined OK4 goto modele_choisi
set "DEF=1"
if /i "%MODELE_DEFAUT%"=="4B" set "DEF=2"
echo.
echo Choix du modele :
echo   [1] Gemma 4 E2B : rapide, adapte aux postes de 8 Go de RAM
echo   [2] Gemma 4 E4B : plus precis, 16 Go de RAM conseilles
choice /c 12 /t 10 /d %DEF% /n /m "Tapez 1 ou 2 (choix par defaut dans 10 s) : "
if errorlevel 2 (set "CHOIX=4B") else (set "CHOIX=2B")
:modele_choisi
if /i "%CHOIX%"=="4B" (set "LLM_ACTIF=%MODELE_4B%" & set "MMPROJ_ACTIF=%MMPROJ_4B%") else (set "LLM_ACTIF=%MODELE_2B%" & set "MMPROJ_ACTIF=%MMPROJ_2B%")
echo Modele : %LLM_ACTIF%
if exist "%MMPROJ_ACTIF%" (echo Images : activees) else (echo Images : desactivees ^(pas de %MMPROJ_ACTIF%^))
if not exist journal mkdir journal
if not exist dictees mkdir dictees
if not exist app\dictee mkdir app\dictee
del /q app\dictee\*.txt 2>nul

rem Liste des types de documents (fichiers de app\prompts ne commencant pas par _)
dir /b /on "app\prompts\*.txt" | findstr /v /b /c:"_" > "app\prompts\_liste.txt"

rem Arrete un eventuel serveur reste ouvert (lance avec d'autres options).
taskkill /f /im "%PROC%" >nul 2>&1
timeout /t 1 /nobreak >nul

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
echo  Modele : %LLM_ACTIF%
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
