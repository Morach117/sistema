@echo off
title LANZADOR - PAPELERIA YAZMIN
color 0B
cls
echo ===================================================
echo   INICIANDO SISTEMA PAPELERIA YAZMIN (REACT + NODE)
echo ===================================================
echo.

:: Liberar procesos previos si existen
powershell -Command "Stop-Process -Name node -Force -ErrorAction SilentlyContinue" >nul 2>&1

echo Iniciando servidor del sistema en puerto 3000...
start "Servidor Papeleria Yazmin" cmd /k "node server.js"

echo.
echo Esperando a que el servidor este listo...
timeout /t 3 /nobreak >nul

echo Abriendo sistema en el navegador predeterminado...
start http://localhost:3000

echo.
echo ===================================================
echo ✔ ¡Sistema ejecutandose en http://localhost:3000!
echo (No cierres la ventana negra del servidor mientras uses el sistema)
echo ===================================================
echo.
pause
