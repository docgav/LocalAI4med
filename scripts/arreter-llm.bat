@echo off
rem Arrete llamafile : par nom d'executable, puis tout processus qui ecoute sur le port du modele
rem (sur certains postes, le processus n'apparait pas sous le nom llamafile.exe).
cd /d "%~dp0.."
for %%F in ("%LLAMAFILE%") do taskkill /f /im "%%~nxF" >nul 2>&1
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /c:"127.0.0.1:%PORT% " ^| findstr /c:"0.0.0.0:0"') do taskkill /f /pid %%p >nul 2>&1
