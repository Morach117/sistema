@echo off
title INSTALADOR AUTOMATICO - SISTEMA PAPELERIA YAZMIN
color 0A
cls
echo ===================================================
echo   INSTALADOR AUTOMATICO - PAPELERIA YAZMIN
echo ===================================================
echo.
echo Este instalador configurara automaticamente:
echo  1. Verificacion de Node.js y npm
echo  2. Instalacion de dependencias (Backend y Frontend)
echo  3. Compilacion de la aplicacion de React
echo  4. Creacion y Migracion de Base de Datos MySQL
echo  5. Creacion del archivo .env y Accesos Directos
echo.
pause

:: 1. Verificar Node.js
echo.
echo [1/5] Verificando instalacion de Node.js...
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo ✖ ERROR: Node.js no esta instalado en este equipo.
    echo Por favor instala Node.js desde https://nodejs.org/ e intentalo de nuevo.
    echo.
    pause
    exit
)
echo ✔ Node.js detectado correctamente.

:: 2. Crear .env si no existe
echo.
echo [2/5] Configurando archivo .env...
if not exist ".env" (
    echo PORT=3000 > .env
    echo DB_HOST=127.0.0.1 >> .env
    echo DB_USER=root >> .env
    echo DB_PASSWORD= >> .env
    echo DB_NAME=importador_papeleria >> .env
    echo JWT_SECRET=super_secret_key_12345 >> .env
    echo ✔ Archivo .env creado con valores por defecto.
) else (
    echo ✔ Archivo .env ya existente.
)

:: 3. Instalacion de dependencias
echo.
echo [3/5] Instalando dependencias de Node.js (Backend y Frontend)...
cmd /c "npm install"
cd frontend
cmd /c "npm install"
echo.
echo Compilando aplicacion React...
cmd /c "npm run build"
cd ..

:: 4. Migracion de BD
echo.
echo [4/5] Ejecutando migración de Base de Datos en MySQL (XAMPP/Servicio)...
node migrar_base_datos.js
if %errorlevel% neq 0 (
    echo.
    echo ⚠️ ATENCION: Asegurate de que el servicio de MySQL (XAMPP) esté ENCENDIDO.
    echo Vuelve a ejecutar este instalador cuando MySQL este activo.
    echo.
    pause
    exit
)

:: 5. Finalizacion y Lanzamiento
echo.
echo [5/5] Instalación finalizada con éxito.
echo ===================================================
echo ¡El sistema esta listo para usar!
echo.
echo Para iniciar el sistema en el futuro, solo ejecuta:
echo INICIAR_SISTEMA.bat
echo ===================================================
echo.
pause
