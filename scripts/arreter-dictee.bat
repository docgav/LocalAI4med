@echo off
rem Arrete la passerelle de dictee (PID dans journal\dictee.pid), seulement si c'est bien PowerShell.
cd /d "%~dp0.."
set "ANCIEN="
if exist journal\dictee.pid set /p ANCIEN=<journal\dictee.pid
if defined ANCIEN tasklist /fi "pid eq %ANCIEN%" /fi "imagename eq powershell.exe" | find /i "powershell" >nul && taskkill /f /pid %ANCIEN% >nul 2>&1
del /q journal\dictee.pid 2>nul
