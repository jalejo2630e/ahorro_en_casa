@echo off
rem Arranca "Ahorro en casa" (modo produccion) si todavia no esta corriendo.
rem Se ejecuta solo al iniciar sesion en Windows (ver README, seccion "Que arranque sola").
cd /d "%~dp0"
netstat -ano | findstr /R /C:":3000 .*LISTENING" >nul
if %errorlevel%==0 exit /b 0
if not exist ".next\BUILD_ID" call npm run build
if not exist "data" mkdir data
start "Ahorro en casa" /min cmd /c "npm start >> data\app.log 2>&1"
