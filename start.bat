@echo off
cd /d %~dp0

echo 🚀 Starting Node.js server...
start "" /B cmd /C "node upload-server.js"

:: Delay 2 detik biar server sempat ready
timeout /t 2 >nul

echo 🌐 Opening browser...
start "" http://localhost:3000/