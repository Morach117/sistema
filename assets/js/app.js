// assets/js/app.js

async function cargarVista(vista, elementoMenu = null) {
    const contenedor = document.getElementById('app-content');

    // UI: Manejo de clase 'active' en el menú
    if (elementoMenu) {
        document.querySelectorAll('.nav-link').forEach(el => el.classList.remove('active'));
        elementoMenu.classList.add('active');
        // En móvil cerramos el menú al hacer click
        if (window.innerWidth < 768) toggleMenu();
    }

    // Efecto de carga
    contenedor.innerHTML = `
        <div class="d-flex justify-content-center align-items-center" style="height: 60vh;">
            <div class="text-center">
                <div class="spinner-border text-primary" style="width: 3rem; height: 3rem;"></div>
                <p class="mt-2 text-muted">Cargando módulo...</p>
            </div>
        </div>`;

    try {
        // Pedimos el archivo HTML de la vista
        const response = await fetch(`views/${vista}.php`);
        if (!response.ok) throw new Error('Error cargando el módulo');

        const html = await response.text();
        contenedor.innerHTML = html;

        // IMPORTANTE: Si la vista tiene scripts incrustados (<script>), hay que ejecutarlos manualmente
        ejecutarScriptsVista(contenedor);

    } catch (error) {
        contenedor.innerHTML = `<div class="alert alert-danger">Error: ${error.message}</div>`;
    }
}

// Función auxiliar para que el JS dentro de las vistas funcione
function ejecutarScriptsVista(contenedor) {
    const scripts = contenedor.querySelectorAll("script");
    scripts.forEach(script => {
        const nuevoScript = document.createElement("script");
        if (script.src) {
            nuevoScript.src = script.src;
        } else {
            nuevoScript.textContent = script.textContent;
        }
        document.body.appendChild(nuevoScript);
    });
}

// --- UTILIDAD: ALERTA GLOBAL BONITA ---
function mostrarAlerta(titulo, texto, icono = 'success') {
    Swal.fire({
        title: titulo,
        text: texto,
        icon: icono,
        confirmButtonColor: '#3085d6',
        confirmButtonText: 'Entendido'
    });
}