@echo off
chcp 65001 >nul
title AgroTitan - vista previa local
cd /d "%~dp0"

echo.
echo   AGROTITAN - vista previa local
echo   ================================
echo.

where python >nul 2>&1
if errorlevel 1 (
    echo   ERROR: no encuentro Python instalado en esta computadora.
    echo   Instalalo desde https://python.org y volve a intentar.
    echo.
    pause
    exit /b 1
)

echo   Levantando el servidor...
echo   ^(se abre en una ventana aparte, no la cierres mientras mires el sitio^)
echo.

REM El servidor arranca en SU PROPIA ventana, separada de esta.
REM Antes, el navegador se abria al mismo tiempo que el servidor y a
REM veces llegaba antes de que estuviera listo -> "no se puede acceder
REM a este sitio". Ahora se espera a que el servidor responda de verdad
REM antes de abrir el navegador.
start "AgroTitan - servidor (no cerrar)" cmd /k "python -m http.server 8765"

echo   Esperando a que el servidor este listo...
set intentos=0

:esperar
set /a intentos+=1
powershell -NoProfile -Command "try { (Invoke-WebRequest -Uri http://127.0.0.1:8765 -UseBasicParsing -TimeoutSec 1) | Out-Null; exit 0 } catch { exit 1 }" >nul 2>&1
if %errorlevel%==0 goto listo
if %intentos% geq 20 goto fallo
timeout /t 1 /nobreak >nul
goto esperar

:listo
echo   Listo. Abriendo el navegador...
start "" http://localhost:8765
echo.
echo   Si el navegador no abrio solo, entra manualmente a:
echo     http://localhost:8765
echo.
echo   Para cerrar: cerra ESTA ventana y la del servidor.
pause
exit /b 0

:fallo
echo.
echo   El servidor no respondio despues de 20 segundos.
echo   Revisa la otra ventana ^("AgroTitan - servidor"^): si dice
echo   "Address already in use", ya hay un sitio abierto - anda
echo   directo a http://localhost:8765 en el navegador.
echo.
pause
exit /b 1
