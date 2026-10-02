@echo off
cd /d "%~dp0.."
call config.bat
if not "%CONSERVER_AUDIO%"=="1" del /q dictees\*.wav 2>nul
del /q dictees\*.txt dictees\*.sortie 2>nul
del /q app\dictee\*.txt 2>nul
rem Vide le presse-papier
cmd /c "echo off | clip"
