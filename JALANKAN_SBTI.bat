@echo off
title SBTI Management System Server
echo ==========================================
echo   SBTI Management System - Auto Launcher
echo ==========================================
if not exist node_modules (
    echo Menginstal library database & server...
    call npm install
)
echo.
echo Menjalankan server di http://localhost:3000
echo Jangan tutup jendela ini selama website dipakai!
echo.
start http://localhost:3000
npm start
pause
