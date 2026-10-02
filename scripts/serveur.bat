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
"%LLAMAFILE%" --server -m "%LLM_ACTIF%" %OPT_MMPROJ% --host 127.0.0.1 --port %PORT% -c %CONTEXTE% --path app %OPT_THREADS% %OPTIONS_LLM% > journal\serveur.log 2>&1
