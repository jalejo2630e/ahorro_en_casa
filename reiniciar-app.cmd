@echo off
rem Reinicia "Ahorro en casa": detiene la app, la recompila (para que tome los cambios) y la vuelve a arrancar.
cd /d "%~dp0"
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /R /C:":3000 .*LISTENING"') do taskkill /PID %%p /F >nul 2>&1
timeout /t 3 /nobreak >nul
call npm run build
if errorlevel 1 (
  echo La compilacion fallo. La app NO se reinicio.
  pause
  exit /b 1
)
if not exist "data" mkdir data
start "Ahorro en casa" /min cmd /c "npm start >> data\app.log 2>&1"
echo Listo: la app esta corriendo de nuevo.
timeout /t 3 /nobreak >nul
