@echo off
cd /d "%~dp0"
call config.bat
for %%F in ("%LLAMAFILE%") do set "PROC=%%~nxF"
taskkill /f /im "%PROC%" >nul 2>&1
call scripts\nettoyer.bat
echo IA arretee, dictees effacees.
timeout /t 3 >nul
