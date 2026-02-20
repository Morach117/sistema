<?php
// views/modulo_usuarios.php
session_start();

// Validación de seguridad (Solo Admin)
if (!isset($_SESSION['rol']) || $_SESSION['rol'] !== 'admin') {
    echo "<div role='alert' class='alert alert-error m-4 shadow-lg'>
            <svg xmlns='http://www.w3.org/2000/svg' class='stroke-current shrink-0 h-6 w-6' fill='none' viewBox='0 0 24 24'><path stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z' /></svg>
            <span class='font-bold'>Acceso Denegado: Se requieren permisos de administrador.</span>
          </div>";
    exit;
}
?>

<div class="p-6 md:p-10 animate-fade-in font-sans">

    <div class="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
        <div>
            <h1 class="text-3xl font-bold text-base-content">Gestión de Usuarios</h1>
            <p class="text-base-content/60 mt-1">Administra el acceso y roles del sistema</p>
        </div>
        <div>
            <button class="btn btn-primary shadow-lg text-white gap-2" onclick="UsuariosAPI.abrirModalUsuario()">
                <i class="bi bi-person-plus-fill text-lg"></i> Nuevo Usuario
            </button>
        </div>
    </div>

    <div class="card bg-base-100 shadow-xl border border-base-200 overflow-visible">
        <div class="card-body p-0">
            <div class="overflow-x-auto">
                <table class="table table-lg w-full">
                    <thead class="bg-base-200/50 text-base-content/70">
                        <tr>
                            <th class="pl-6">Nombre</th>
                            <th>Usuario (Login)</th>
                            <th>Rol</th>
                            <th class="text-right pr-6">Acciones</th>
                        </tr>
                    </thead>
                    <tbody id="tablaUsuarios">
                        <tr>
                            <td colspan="4" class="text-center py-10">
                                <span class="loading loading-dots loading-lg text-primary"></span>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    </div>
</div>

<dialog id="modalUsuario" class="modal modal-bottom sm:modal-middle">
    <div class="modal-box">
        <h3 class="font-bold text-lg mb-6" id="modalTitulo">Nuevo Usuario</h3>

        <form id="formUsuario" class="flex flex-col gap-4" onsubmit="UsuariosAPI.guardarUsuario(event)">
            <input type="hidden" name="id" id="userId">

            <div class="form-control">
                <label class="label"><span class="label-text font-bold">Nombre Completo</span></label>
                <label class="input input-bordered flex items-center gap-2">
                    <i class="bi bi-person opacity-50"></i>
                    <input type="text" name="nombre" id="userNombre" class="grow" placeholder="Ej. Juan Pérez" required />
                </label>
            </div>

            <div class="form-control">
                <label class="label"><span class="label-text font-bold">Usuario (Login)</span></label>
                <label class="input input-bordered flex items-center gap-2">
                    <i class="bi bi-person-badge opacity-50"></i>
                    <input type="text" name="usuario" id="userLogin" class="grow" placeholder="Ej. jperez" required />
                </label>
            </div>

            <div class="form-control">
                <label class="label"><span class="label-text font-bold">Contraseña</span></label>
                <label class="input input-bordered flex items-center gap-2">
                    <i class="bi bi-key opacity-50"></i>
                    <input type="password" name="password" id="userPass" class="grow" placeholder="Dejar vacío para no cambiar" />
                </label>
            </div>

            <div class="form-control">
                <label class="label"><span class="label-text font-bold">Rol</span></label>
                <select name="rol" id="userRol" class="select select-bordered w-full">
                    <option value="empleado">Empleado</option>
                    <option value="admin">Administrador</option>
                </select>
            </div>

            <div class="modal-action mt-6">
                <button type="button" class="btn" onclick="document.getElementById('modalUsuario').close()">Cancelar</button>
                <button type="submit" class="btn btn-primary text-white">Guardar</button>
            </div>
        </form>
    </div>
    <form method="dialog" class="modal-backdrop">
        <button>close</button>
    </form>
</dialog>

<script>
(() => {
    // API PÚBLICA
    window.UsuariosAPI = {
        
        init: () => {
            UsuariosAPI.cargarUsuarios();
        },

        cargarUsuarios: () => {
            fetch('api/api_usuarios_listar.php')
                .then(r => r.json())
                .then(data => {
                    const tbody = document.getElementById('tablaUsuarios');
                    if (!tbody) return;
                    tbody.innerHTML = '';

                    if (data.length === 0) {
                        tbody.innerHTML = '<tr><td colspan="4" class="text-center py-10 opacity-50">No hay usuarios registrados</td></tr>';
                        return;
                    }

                    data.forEach(u => {
                        let badgeClass = u.rol === 'admin' ? 'badge-primary badge-outline' : 'badge-ghost';
                        let inicial = u.nombre.charAt(0).toUpperCase();
                        // Escapar JSON para el onclick
                        let userStr = JSON.stringify(u).replace(/"/g, "&quot;");

                        tbody.innerHTML += `
                        <tr class="hover:bg-base-200/50 transition-colors">
                            <td class="pl-6">
                                <div class="flex items-center gap-3">
                                    <div class="avatar placeholder">
                                        <div class="bg-neutral text-neutral-content rounded-full w-10">
                                            <span class="text-lg">${inicial}</span>
                                        </div>
                                    </div>
                                    <div>
                                        <div class="font-bold">${u.nombre}</div>
                                    </div>
                                </div>
                            </td>
                            <td class="font-mono text-sm opacity-70">${u.usuario}</td>
                            <td>
                                <div class="badge ${badgeClass} font-bold uppercase text-xs p-3">${u.rol}</div>
                            </td>
                            <td class="text-right pr-6">
                                <div class="join">
                                    <button class="btn btn-sm btn-ghost join-item text-info tooltip" data-tip="Editar" 
                                            onclick="UsuariosAPI.editarUsuario(${userStr})">
                                        <i class="bi bi-pencil-square text-lg"></i>
                                    </button>
                                    <button class="btn btn-sm btn-ghost join-item text-error tooltip" data-tip="Eliminar" 
                                            onclick="UsuariosAPI.eliminarUsuario(${u.id})">
                                        <i class="bi bi-trash text-lg"></i>
                                    </button>
                                </div>
                            </td>
                        </tr>`;
                    });
                })
                .catch(e => {
                    const tbody = document.getElementById('tablaUsuarios');
                    if(tbody) tbody.innerHTML = '<tr><td colspan="4" class="text-center text-error py-4">Error al cargar datos</td></tr>';
                });
        },

        abrirModalUsuario: () => {
            document.getElementById('formUsuario').reset();
            document.getElementById('userId').value = '';
            document.getElementById('modalTitulo').innerText = 'Nuevo Usuario';
            document.getElementById('modalUsuario').showModal();
        },

        editarUsuario: (u) => {
            document.getElementById('userId').value = u.id;
            document.getElementById('userNombre').value = u.nombre;
            document.getElementById('userLogin').value = u.usuario;
            document.getElementById('userPass').value = ''; // Contraseña vacía al editar
            document.getElementById('userRol').value = u.rol;
            document.getElementById('modalTitulo').innerText = 'Editar Usuario';
            document.getElementById('modalUsuario').showModal();
        },

        eliminarUsuario: (id) => {
            Swal.fire({
                title: '¿Eliminar Usuario?',
                text: "Esta acción no se puede deshacer.",
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#ff0000',
                confirmButtonText: 'Sí, eliminar',
                cancelButtonText: 'Cancelar'
            }).then((result) => {
                if (result.isConfirmed) {
                    let fd = new FormData();
                    fd.append('id', id);
                    
                    fetch('api/api_usuarios_eliminar.php', { method: 'POST', body: fd })
                        .then(r => r.json())
                        .then(d => {
                            if (d.success) {
                                Swal.fire('Eliminado', 'Usuario eliminado correctamente.', 'success');
                                UsuariosAPI.cargarUsuarios();
                            } else {
                                Swal.fire('Error', d.error, 'error');
                            }
                        });
                }
            })
        },

        guardarUsuario: (e) => {
            e.preventDefault();
            const form = document.getElementById('formUsuario');
            const fd = new FormData(form);

            fetch('api/api_usuarios_guardar.php', { method: 'POST', body: fd })
                .then(r => r.json())
                .then(d => {
                    if (d.success) {
                        document.getElementById('modalUsuario').close();
                        Swal.fire({
                            title: 'Guardado',
                            text: 'Usuario actualizado correctamente.',
                            icon: 'success',
                            timer: 1500,
                            showConfirmButton: false
                        });
                        UsuariosAPI.cargarUsuarios();
                    } else {
                        Swal.fire('Error', d.error, 'error');
                    }
                });
        }
    };

    // Auto-iniciar
    UsuariosAPI.init();
})();
</script>