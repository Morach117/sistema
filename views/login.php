<?php
// views/login.php
session_start();
require_once '../config/db.php';

// Si ya hay sesión, redirigir al dashboard inmediatamente
if (isset($_SESSION['user_id'])) {
    header('Location: ../index.php');
    exit();
}

$error = null;

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $user = trim($_POST['usuario']);
    $pass = trim($_POST['password']);

    try {
        // Buscamos usuario activo
        $stmt = $pdo->prepare("SELECT * FROM usuarios WHERE usuario = ? AND activo = 1");
        $stmt->execute([$user]);
        $usuario = $stmt->fetch();

        // VERIFICACIÓN DE HASH
        if ($usuario && password_verify($pass, $usuario['password'])) {
            // Regenerar ID de sesión para seguridad (evita Session Fixation)
            session_regenerate_id(true);
            
            $_SESSION['user_id'] = $usuario['id'];
            $_SESSION['usuario'] = $usuario['usuario'];
            $_SESSION['nombre'] = $usuario['nombre'] ?? $usuario['usuario'];
            $_SESSION['rol'] = $usuario['rol'];
            
            header('Location: ../index.php');
            exit();
        } else {
            $error = "Credenciales incorrectas o cuenta inactiva.";
        }
    } catch (Exception $e) {
        $error = "Error de conexión. Intente más tarde.";
    }
}
?>
<!DOCTYPE html>
<html lang="es" data-theme="light">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Acceso | Papelería Yazmín</title>

    <link href="https://cdn.jsdelivr.net/npm/daisyui@4.6.0/dist/full.min.css" rel="stylesheet" type="text/css" />
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.0/font/bootstrap-icons.css">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700&display=swap" rel="stylesheet">

    <script>
        tailwind.config = {
            theme: {
                extend: {
                    fontFamily: {
                        sans: ['Inter', 'sans-serif']
                    },
                    colors: {
                        primary: '#FF69B4', // Rosa Yazmín
                        secondary: '#9333ea', // Morado
                    },
                    // Agregamos la animación personalizada aquí mismo
                    animation: {
                        'fade-in': 'fadeIn 0.5s ease-out forwards',
                    },
                    keyframes: {
                        fadeIn: {
                            '0%': { opacity: '0', transform: 'translateY(15px)' },
                            '100%': { opacity: '1', transform: 'translateY(0)' },
                        }
                    }
                }
            },
            daisyui: {
                themes: ["light"]
            }
        }
    </script>
</head>

<body class="bg-base-200 min-h-screen flex items-center justify-center p-4 font-sans bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]">

    <div class="card w-full max-w-sm bg-base-100 shadow-2xl border border-base-200 animate-fade-in">
        <div class="card-body">

            <div class="text-center mb-6">
                <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 text-primary mb-3 shadow-sm">
                    <i class="bi bi-journal-bookmark-fill text-3xl"></i>
                </div>
                <h2 class="text-2xl font-black text-gray-800 tracking-tight">Papelería Yazmín</h2>
                <p class="text-xs text-gray-400 uppercase tracking-widest font-bold mt-1">Control de Inventario</p>
            </div>

            <?php if ($error): ?>
                <div role="alert" class="alert alert-error text-white text-sm py-2 mb-4 shadow-md rounded-lg flex items-center gap-2">
                    <i class="bi bi-exclamation-triangle-fill"></i>
                    <span><?= $error ?></span>
                </div>
            <?php endif; ?>

            <form method="POST" class="space-y-4" autocomplete="off">

                <div class="form-control">
                    <label class="label">
                        <span class="label-text font-bold text-gray-600">Usuario</span>
                    </label>
                    <label class="input input-bordered flex items-center gap-3 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary transition-all bg-gray-50 focus-within:bg-white">
                        <i class="bi bi-person-fill text-gray-400"></i>
                        <input type="text" name="usuario" class="grow font-medium text-gray-700" placeholder="Ej. admin" required autocomplete="username" autofocus />
                    </label>
                </div>

                <div class="form-control">
                    <label class="label">
                        <span class="label-text font-bold text-gray-600">Contraseña</span>
                    </label>
                    <label class="input input-bordered flex items-center gap-3 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary transition-all bg-gray-50 focus-within:bg-white">
                        <i class="bi bi-lock-fill text-gray-400"></i>
                        <input type="password" name="password" class="grow font-medium text-gray-700" placeholder="••••••••" required autocomplete="current-password" />
                    </label>
                </div>

                <div class="form-control mt-6">
                    <button type="submit" class="btn btn-primary text-white shadow-lg uppercase font-bold tracking-wide hover:scale-[1.02] transition-transform">
                        Iniciar Sesión <i class="bi bi-box-arrow-in-right text-lg"></i>
                    </button>
                </div>
            </form>

            <div class="text-center mt-8 text-[10px] text-gray-300 font-medium">
                &copy; <?= date('Y') ?> Papelería Yazmín • Sistema v2.5
            </div>
        </div>
    </div>

</body>
</html>