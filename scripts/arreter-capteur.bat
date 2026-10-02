@echo off
rem Arrete le capteur (raccourcis clavier) (PID dans journal\capteur.pid), seulement si c'est bien PowerShell.
cd /d "%~dp0.."
set "ANCIEN="
if exist journal\capteur.pid set /p ANCIEN=<journal\capteur.pid
if defined ANCIEN tasklist /fi "pid eq %ANCIEN%" /fi "imagename eq powershell.exe" | find /i "powershell" >nul && taskkill /f /pid %ANCIEN% >nul 2>&1
del /q journal\capteur.pid 2>nul
