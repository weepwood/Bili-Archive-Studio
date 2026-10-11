@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
start "" "http://127.0.0.1:8765"
node server.js --data "%~dp0demo-data" --port 8765
pause
