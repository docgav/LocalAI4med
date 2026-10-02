@echo off
cd /d "%~dp0"
call config.bat
for %%F in ("%LLAMAFILE%") do set "PROC=%%~nxF"
call scripts\arreter-llm.bat
call scripts\arreter-dictee.bat
call scripts\nettoyer.bat
echo IA arretee, dictees effacees.
timeout /t 3 >nul
