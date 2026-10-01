@echo off
rem pokearena from cmd, bash or PowerShell (put this folder on your PATH): pokearena [start|status|stop] [-NoOpen]
powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0pokearena.ps1" %*
