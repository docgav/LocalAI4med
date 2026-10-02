@echo off
rem Enregistre le micro, transcrit avec whisperfile, puis depose le texte
rem dans app\dictee\ (insere automatiquement dans la page) et le presse-papier.
setlocal
chcp 65001 >nul
cd /d "%~dp0.."
call config.bat

if not exist micro.txt call scripts\micro.bat
set "MIC="
if exist micro.txt set /p MIC=<micro.txt
if not defined MIC (echo [ERREUR] Micro non configure : lancez scripts\micro.bat. & exit /b 1)

set "BASE=dictees\dictee"
del /q "%BASE%.wav" "%BASE%.txt" 2>nul

echo.
echo === Dictez maintenant. Appuyez sur q pour arreter. ===
"%FFMPEG%" -hide_banner -loglevel error -f dshow -i audio="%MIC%" -ar 16000 -ac 1 -y "%BASE%.wav"
if not exist "%BASE%.wav" (
  echo [ERREUR] Enregistrement impossible avec le micro "%MIC%".
  echo Supprimez micro.txt ou lancez scripts\micro.bat pour en choisir un autre.
  exit /b 1
)

echo === Transcription en cours... ===
"%WHISPERFILE%" -m "%MODELE_WHISPER%" -f "%BASE%.wav" -l fr -otxt -of "%BASE%" -np --prompt "%VOCABULAIRE%"
del /q "%BASE%.wav" 2>nul
if not exist "%BASE%.txt" (echo [ERREUR] Transcription echouee. & exit /b 1)

copy /y "%BASE%.txt" "app\dictee\dictee.txt" >nul
> "app\dictee\pret.txt" echo %RANDOM%-%TIME%
powershell -NoProfile -Command "Get-Content -Path '%BASE%.txt' -Encoding UTF8 | Set-Clipboard" 2>nul
del /q "%BASE%.txt" 2>nul
echo === Texte insere dans la page (et copie dans le presse-papier). ===
endlocal
