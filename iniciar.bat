@echo off
chcp 65001 >nul
cd /d "%~dp0"
where py >nul 2>nul && (py -3 server.py %* & goto :end)
where python >nul 2>nul && (python server.py %* & goto :end)
echo Python 3 nao encontrado. Instale em https://www.python.org/downloads/ (marque "Add Python to PATH").
pause
:end
