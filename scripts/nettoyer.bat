@echo off
cd /d "%~dp0.."
del /q dictees\*.wav dictees\*.txt 2>nul
del /q app\dictee\*.txt 2>nul
rem Vide le presse-papier
cmd /c "echo off | clip"
