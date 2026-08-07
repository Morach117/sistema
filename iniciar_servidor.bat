@echo off
echo ==========================================
echo Inicializando Papeleria Yazmin (React + Node)
echo ==========================================
echo.

echo [1/2] Iniciando Backend (Node.js/Express) en el puerto 3000...
start "Backend - Node" cmd /c "npm install && npm start"

echo [2/2] Iniciando Frontend (Vite/React) en el puerto 5173...
start "Frontend - React" cmd /c "cd frontend && npm install && npm run dev"

echo.
echo ==========================================
echo ¡Ambos servidores se estan ejecutando en nuevas ventanas!
echo - API Backend: http://localhost:3000
echo - Sistema Frontend: http://localhost:5173
echo.
echo (Puedes cerrar esta ventana, pero NO cierres las ventanas negras nuevas)
echo ==========================================
pause
