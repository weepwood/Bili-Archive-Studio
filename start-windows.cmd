@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] 未找到 Node.js ^(请安装 Node.js 20 或更新版本^)
  pause
  exit /b 1
)
if not exist "%~dp0archive-data" mkdir "%~dp0archive-data"
echo.
echo Bili Archive Studio - http://127.0.0.1:8765
start "" "http://127.0.0.1:8765"
node server.js --data "%~dp0archive-data" --port 8765
pause
