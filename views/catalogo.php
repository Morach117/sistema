<?php
// views/modulo_catalogo.php
session_start();
?>

<div class="p-6 md:p-10 animate-fade-in font-sans">

    <div class="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
        <div>
            <h1 class="text-3xl font-bold text-base-content">Catálogo Maestro</h1>
            <p class="text-base-content/60 mt-1">Base de datos de productos Sicar</p>
        </div>
        <div>
            <button class="btn btn-primary shadow-lg text-white gap-2"
                onclick="document.getElementById('modalCargaCatalogo').showModal()">
                <i class="bi bi-cloud-upload"></i> Actualizar con Sicar
            </button>
        </div>
    </div>

    <div class="form-control mb-8">
        <label
            class="input input-bordered input-lg flex items-center gap-4 shadow-sm focus-within:input-primary focus-within:shadow-md transition-all">
            <i class="bi bi-search text-base-content/40 text-xl"></i>
            <input type="text" id="busquedaCatalogo" class="grow text-lg"
                placeholder="Buscar por clave, descripción o código de barras..." onkeyup="buscarProducto()" />
            <kbd class="kbd kbd-sm hidden md:inline-flex">Esc</kbd>
        </label>
    </div>

    <div class="card bg-base-100 shadow-xl border border-base-200">
        <div class="card-body p-0">
            <div class="overflow-x-auto">
                <table class="table table-lg w-full">
                    <thead class="bg-base-200/50 text-base-content/70">
                        <tr>
                            <th class="pl-6">Clave / Código</th>
                            <th>Descripción</th>
                            <th class="text-center">Existencia</th>
                            <th class="text-right pr-6">Precio Público</th>
                            <th class="text-right">Actualizado</th>
                        </tr>
                    </thead>
                    <tbody id="tablaCatalogo">
                        <tr>
                            <td colspan="5" class="text-center py-10">
                                <div class="flex flex-col items-center opacity-40">
                                    <i class="bi bi-search text-4xl mb-2"></i>
                                    <span>Ingresa una búsqueda para comenzar</span>
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    </div>
</div>

<dialog id="modalCargaCatalogo" class="modal modal-bottom sm:modal-middle">
    <div class="modal-box">
        <h3 class="font-bold text-lg">Actualizar Catálogo</h3>
        <p class="py-4 text-sm opacity-70">Sube el archivo CSV exportado desde Sicar para actualizar precios y
            existencias masivamente.</p>

        <form id="formCatalogo">
            <input type="file" name="archivo_sicar"
                class="file-input file-input-bordered file-input-primary w-full mb-6" required accept=".csv" />

            <div id="progresoCarga" class="hidden flex flex-col items-center mb-4">
                <span class="loading loading-spinner loading-md text-primary"></span>
                <span class="text-xs mt-2 opacity-60">Procesando archivo...</span>
            </div>

            <div class="modal-action">
                <form method="dialog"><button class="btn btn-ghost">Cancelar</button></form>
                <button type="button" class="btn btn-primary" onclick="submitCatalogo()">Procesar Archivo</button>
            </div>
        </form>
    </div>
</dialog>

<script>
    let timeoutSearch = null;

    // --- BÚSQUEDA EN TIEMPO REAL ---
    function buscarProducto() {
        const texto = document.getElementById('busquedaCatalogo').value;
        clearTimeout(timeoutSearch);

        if (texto.length === 0) {
            document.getElementById('tablaCatalogo').innerHTML =
                '<tr><td colspan="5" class="text-center py-10 opacity-40"><i class="bi bi-search text-4xl mb-2 block"></i><span>Ingresa una búsqueda</span></td></tr>';
            return;
        }

        if (texto.length < 2) return;

        timeoutSearch = setTimeout(() => {
            // Efecto de carga en la tabla
            const tbody = document.getElementById('tablaCatalogo');
            tbody.innerHTML =
                '<tr><td colspan="5" class="text-center py-10"><span class="loading loading-dots loading-lg text-primary"></span></td></tr>';

            fetch(`api/api_buscar_catalogo.php?q=${encodeURIComponent(texto)}`)
                .then(r => r.json())
                .then(data => {
                    tbody.innerHTML = '';

                    if (data.length === 0) {
                        tbody.innerHTML =
                            '<tr><td colspan="5" class="text-center py-8 text-error font-bold">No se encontraron productos</td></tr>';
                        return;
                    }

                    data.forEach(p => {
                        // Formato Moneda
                        const precio = new Intl.NumberFormat('es-MX', {
                            style: 'currency',
                            currency: 'MXN'
                        }).format(p.precio_publico);

                        // Lógica de Badges para Stock
                        let stockBadge = '';
                        let existencia = parseFloat(p.existencia);

                        if (existencia <= 0) {
                            stockBadge =
                                `<div class="badge badge-error text-white font-bold gap-1"><i class="bi bi-x"></i> ${existencia}</div>`;
                        } else if (existencia < 5) {
                            stockBadge =
                                `<div class="badge badge-warning font-bold gap-1"><i class="bi bi-exclamation"></i> ${existencia}</div>`;
                        } else {
                            stockBadge =
                                `<div class="badge badge-success text-white font-bold gap-1"><i class="bi bi-check"></i> ${existencia}</div>`;
                        }

                        tbody.innerHTML += `
                    <tr class="hover:bg-base-200/50 transition-colors">
                        <td class="pl-6">
                            <div class="font-bold text-primary">${p.clave_sicar}</div>
                            <div class="text-xs opacity-50 font-mono">${p.codigo_barras || ''}</div>
                        </td>
                        <td>
                            <div class="font-bold text-sm text-base-content/80">${p.descripcion}</div>
                        </td>
                        <td class="text-center">
                            ${stockBadge}
                        </td>
                        <td class="text-right pr-6">
                            <div class="font-bold text-lg">${precio}</div>
                        </td>
                        <td class="text-right text-xs opacity-50">
                            ${new Date(p.fecha_actualizacion).toLocaleDateString()}
                        </td>
                    </tr>
                `;
                    });
                });
        }, 300);
    }

    // --- SUBMIT DEL MODAL ---
    function submitCatalogo() {
        const form = document.getElementById('formCatalogo');
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        const btn = form.querySelector('button[type="button"]'); // El botón procesar
        const spinner = document.getElementById('progresoCarga');
        const txtBtn = btn.innerText;

        // UI Loading
        btn.disabled = true;
        btn.innerText = 'Cargando...';
        spinner.classList.remove('hidden');

        fetch('api/api_importar_catalogo.php', {
            method: 'POST',
            body: new FormData(form)
        })
            .then(r => r.json())
            .then(d => {
                // UI Reset
                btn.disabled = false;
                btn.innerText = txtBtn;
                spinner.classList.add('hidden');

                if (d.success) {
                    document.getElementById('modalCargaCatalogo').close();
                    form.reset();
                    Swal.fire({
                        title: 'Actualización Exitosa',
                        text: `${d.insertados} productos procesados correctamente.`,
                        icon: 'success',
                        confirmButtonColor: '#FF69B4' // Color Rosa Yazmín
                    });
                    document.getElementById('busquedaCatalogo').value = '';
                    buscarProducto(); // Refrescar tabla limpia
                } else {
                    Swal.fire('Error', d.error, 'error');
                }
            })
            .catch(e => {
                btn.disabled = false;
                btn.innerText = txtBtn;
                spinner.classList.add('hidden');
                Swal.fire('Error', 'Fallo en la conexión con el servidor', 'error');
            });
    }

    // Limpiar input con ESC
    document.addEventListener('keydown', function (event) {
        if (event.key === "Escape") {
            const input = document.getElementById('busquedaCatalogo');
            if (document.activeElement === input) {
                input.value = '';
                buscarProducto();
            }
        }
    });
</script>