@echo off
rem Lance llamafile en mode serveur (appele par Demarrer.bat). Journal : journal\serveur.log
cd /d "%~dp0.."
call config.bat
set "OPT_THREADS="
if defined THREADS set "OPT_THREADS=-t %THREADS%"
"%LLAMAFILE%" --server -m "%MODELE_LLM%" --host 127.0.0.1 --port %PORT% -c %CONTEXTE% --path app %OPT_THREADS% %OPTIONS_LLM% > journal\serveur.log 2>&1
