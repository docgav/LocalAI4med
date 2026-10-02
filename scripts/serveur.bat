@echo off
rem Lance llamafile en mode serveur (appele par Demarrer.bat). Journal : journal\serveur.log
cd /d "%~dp0.."
call config.bat
rem LLM_ACTIF / MMPROJ_ACTIF sont choisis par Demarrer.bat (2B par defaut sinon).
if not defined LLM_ACTIF (set "LLM_ACTIF=%MODELE_2B%" & set "MMPROJ_ACTIF=%MMPROJ_2B%")
set "OPT_MMPROJ="
if exist "%MMPROJ_ACTIF%" set "OPT_MMPROJ=--mmproj "%MMPROJ_ACTIF%""
set "OPT_THREADS="
if defined THREADS set "OPT_THREADS=-t %THREADS%"
rem Mode complet : interface de discussion par defaut de llamafile, preconfiguree (app\discussion-config.json).
rem Mode secours : llamafile sert la page de l'IA (app\).
rem SANS_PRECONFIG=1 (relance automatique par Demarrer.bat) : interface par defaut sans preconfiguration.
set "OPT_UI=--ui-config-file app\discussion-config.json"
if "%SANS_PRECONFIG%"=="1" set "OPT_UI="
if /i "%MODE%"=="secours" set "OPT_UI=--path app"
set ARGS=--server -m "%LLM_ACTIF%" %OPT_MMPROJ% --host 127.0.0.1 --port %PORT% -c %CONTEXTE% %OPT_UI% %OPT_THREADS% %OPTIONS_LLM%
> journal\serveur.log echo Commande : "%LLAMAFILE%" %ARGS%
"%LLAMAFILE%" %ARGS% >> journal\serveur.log 2>&1
>> journal\serveur.log echo [llamafile arrete, code de sortie %ERRORLEVEL%]
