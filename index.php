<?php
session_start();

// Si no hay sesión, mandar al login
if (!isset($_SESSION['user_id'])) {
    header("Location: views/login.php");
    exit();
}

$rol = $_SESSION['rol'] ?? 'empleado';
$nombre = $_SESSION['nombre'] ?? 'Usuario';
?>
<!DOCTYPE html>
<html lang="es" data-theme="light">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Inventario | Papelería Yazmín</title>
    <link href="https://cdn.jsdelivr.net/npm/daisyui@4.6.0/dist/full.min.css" rel="stylesheet" type="text/css" />
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.0/font/bootstrap-icons.css">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700&display=swap" rel="stylesheet">
    <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
    <script>
        tailwind.config = {
            theme: {
                extend: {
                    fontFamily: { sans: ['Inter', 'sans-serif'] },
                    colors: {
                        primary: '#FF69B4', 
                        secondary: '#9333ea',
                    }
                }
            },
            daisyui: { themes: ["light", "dark"] }
        }
    </script>
    <style>
        body { transition: background-color 0.3s, color 0.3s; }
        #loading-overlay {
            position: absolute; inset: 0; z-index: 50;
            background-color: oklch(var(--b1) / 0.7);
            backdrop-filter: blur(2px);
            display: none; justify-content: center; align-items: center;
        }
        .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background-color: rgba(0,0,0,0.1); border-radius: 10px; }
        .custom-scrollbar:hover::-webkit-scrollbar-thumb { background-color: rgba(0,0,0,0.2); }
    </style>
</head>

<body>
    <div class="drawer lg:drawer-open">
        <input id="my-drawer-2" type="checkbox" class="drawer-toggle" />

        <div class="drawer-content flex flex-col bg-base-200 h-screen overflow-hidden relative">
            <div class="w-full navbar bg-base-100 shadow-sm lg:hidden z-20">
                <div class="flex-none">
                    <label for="my-drawer-2" class="btn btn-square btn-ghost">
                        <i class="bi bi-list text-2xl"></i>
                    </label>
                </div>
                <div class="flex-1">
                    <a class="btn btn-ghost normal-case text-xl text-primary font-bold">Papelería Yazmín</a>
                </div>
            </div>

            <div id="loading-overlay">
                <span class="loading loading-spinner loading-lg text-primary"></span>
            </div>

            <div id="app-container" class="flex-grow overflow-hidden h-full relative"></div>
        </div>

        <div class="drawer-side z-30">
            <label for="my-drawer-2" aria-label="close sidebar" class="drawer-overlay"></label>

            <aside class="bg-base-100 text-base-content w-72 min-h-full flex flex-col border-r border-base-200">
                <div class="p-6 pb-4">
                    <a class="flex items-center gap-2 font-bold text-2xl text-primary tracking-tight">
                        <i class="bi bi-journal-bookmark-fill"></i> Papelería Yazmín
                    </a>
                    <p class="text-xs opacity-50 mt-1 ml-1 font-mono">Sistema v2.5</p>
                </div>

                <ul class="menu p-4 w-full text-base-content gap-1 flex-grow overflow-y-auto custom-scrollbar">
                    
                    <li>
                        <a onclick="window.cargarVista('dashboard')" id="nav-dashboard" class="font-medium">
                            <i class="bi bi-grid-1x2 text-lg"></i> Dashboard
                        </a>
                    </li>

                    <?php if ($rol === 'admin'): ?>
                        <li>
                            <a onclick="window.cargarVista('catalogo')" id="nav-catalogo" class="font-medium">
                                <i class="bi bi-search text-lg"></i> Catálogo
                            </a>
                        </li>
                        <li>
                            <a onclick="window.cargarVista('modulo_historial')" id="nav-modulo_historial" class="font-medium">
                                <i class="bi bi-graph-up-arrow text-lg"></i> Evolución Precios
                            </a>
                        </li>
                    <?php endif; ?>

                    <li class="menu-title mt-4 text-xs uppercase opacity-50 font-bold">Operaciones</li>
                    <li>
    <a onclick="window.cargarVista('modulo_auditoria_admin')" id="nav-modulo_auditoria_admin" class="font-medium text-indigo-600 hover:bg-indigo-50">
        <i class="bi bi-file-earmark-spreadsheet text-lg"></i> Auditoría & Exportar
    </a>
</li>
                    <li>
                        <a onclick="window.cargarVista('modulo_captura_inteligente')" id="nav-modulo_captura_inteligente" class="font-medium text-secondary hover:bg-secondary/10">
                            <i class="bi bi-qr-code-scan text-lg"></i> Captura Inteligente
                        </a>
                    </li>

                    <li>
                        <a onclick="window.cargarVista('modulo_facturas')" id="nav-modulo_facturas" class="font-medium">
                            <i class="bi bi-box-seam text-lg"></i> Recepción (Activos)
                        </a>
                    </li>
                    
                    <?php if ($rol === 'admin'): ?>
                        <li>
                            <a onclick="window.cargarVista('modulo_historial_facturas')" id="nav-modulo_historial_facturas" class="font-medium">
                                <i class="bi bi-archive text-lg"></i> Historial Remisiones
                            </a>
                        </li>
                    <?php endif; ?>

                    <li>
                        <a onclick="window.cargarVista('modulo_devoluciones')" id="nav-modulo_devoluciones" class="font-medium text-error hover:bg-error/10">
                            <i class="bi bi-exclamation-triangle text-lg"></i> Reclamaciones
                        </a>
                    </li>

                    <?php if ($rol === 'admin'): ?>
                        <li class="menu-title mt-4 text-xs uppercase opacity-50 font-bold">Administración</li>
                        <li>
                            <a onclick="window.cargarVista('usuarios')" id="nav-usuarios" class="font-medium">
                                <i class="bi bi-people text-lg"></i> Usuarios
                            </a>
                        </li>
                    <?php endif; ?>
                </ul>

                <div class="p-4 bg-base-200/50 border-t border-base-200">
                    <div class="flex items-center gap-3 mb-3">
                        <div class="avatar placeholder">
                            <div class="bg-primary text-primary-content rounded-full w-10 ring ring-primary ring-offset-base-100 ring-offset-2">
                                <span class="text-lg font-bold"><?= strtoupper(substr($nombre, 0, 1)) ?></span>
                            </div>
                        </div>
                        <div class="overflow-hidden">
                            <p class="font-bold truncate text-sm"><?= htmlspecialchars($nombre) ?></p>
                            <div class="badge badge-xs badge-outline opacity-60 capitalize mt-1"><?= $rol ?></div>
                        </div>
                    </div>
                    <a href="logout.php" class="btn btn-sm btn-ghost w-full text-error hover:bg-error/10">
                        <i class="bi bi-box-arrow-left"></i> Cerrar Sesión
                    </a>
                </div>
            </aside>
        </div>
    </div>

    <script>
        window.cargarVista = function (vista) {
            const container = document.getElementById('app-container');
            const loader = document.getElementById('loading-overlay');
            document.querySelectorAll('.menu a').forEach(el => el.classList.remove('active'));
            const activeLink = document.getElementById('nav-' + vista);
            if (activeLink) activeLink.classList.add('active');
            document.getElementById('my-drawer-2').checked = false;
            window.location.hash = vista;
            loader.style.display = 'flex';

            fetch('views/' + vista + '.php')
                .then(r => { if (!r.ok) throw new Error("Acceso denegado o no encontrado"); return r.text(); })
                .then(html => {
                    container.innerHTML = html;
                    const scripts = container.querySelectorAll("script");
                    scripts.forEach(oldScript => {
                        const newScript = document.createElement("script");
                        Array.from(oldScript.attributes).forEach(attr => newScript.setAttribute(attr.name, attr.value));
                        newScript.appendChild(document.createTextNode(oldScript.innerHTML));
                        oldScript.parentNode.replaceChild(newScript, oldScript);
                    });
                })
                .catch(e => {
                    container.innerHTML = `<div class="flex flex-col items-center justify-center h-full text-center p-6"><i class="bi bi-lock text-6xl text-base-content/20 mb-4"></i><h1 class="text-2xl font-bold">No tienes permiso</h1></div>`;
                })
                .finally(() => setTimeout(() => loader.style.display = 'none', 150));
        };

        document.addEventListener('DOMContentLoaded', () => {
            let hash = window.location.hash.replace('#', '');
            const userRol = "<?= $rol ?>";

            // Lista negra para empleados (Nota: Captura Inteligente NO está aquí, así que pueden entrar)
            const prohibidoParaEmpleado = ['catalogo', 'modulo_historial', 'modulo_historial_facturas', 'usuarios'];
            
            if(userRol === 'empleado' && prohibidoParaEmpleado.includes(hash)) {
                cargarVista('dashboard');
            } else {
                cargarVista(hash ? hash : 'dashboard');
            }
        });

        window.addEventListener('hashchange', () => {
            let hash = window.location.hash.replace('#', '');
            if (hash) {
                const userRol = "<?= $rol ?>";
                const prohibidoParaEmpleado = ['catalogo', 'modulo_historial', 'modulo_historial_facturas', 'usuarios'];
                if(userRol === 'empleado' && prohibidoParaEmpleado.includes(hash)) {
                    cargarVista('dashboard');
                } else {
                    cargarVista(hash);
                }
            }
        });
    </script>
</body>
</html>