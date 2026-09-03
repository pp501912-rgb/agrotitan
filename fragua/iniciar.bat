@echo off
REM ==============================================================
REM  FRAGUA - doble clic para arrancar
REM ==============================================================
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   No encuentro Node.js en esta computadora.
  echo.
  echo   Bajalo de https://nodejs.org ^(la version LTS^), instalalo,
  echo   cerra esta ventana y volve a hacer doble clic aca.
  echo.
  pause
  exit /b 1
)

if not exist ".env" (
  echo.
  echo   No hay archivo .env todavia. Copio el de ejemplo.
  copy /y ".env.ejemplo" ".env" >nul
  echo   Listo: abri .env con el Bloc de notas y pega tu clave de Claude.
  echo   La app arranca igual sin ella, pero sin el chat.
  echo.
)

start "" http://127.0.0.1:4321
node servidor/index.mjs
pause
