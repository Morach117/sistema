# Permisos de Captura de Empleados Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Limitar la recepción de empleados a producto, cantidad, físico y caja, sin exponer ni permitir acciones administrativas o datos de precio.

**Architecture:** Una política en backend filtra campos y datos de detalle por rol. React conserva las tres zonas de captura para empleados y muestra decisión/precios únicamente a administración. SICAR se expresa como pertenencia de catálogo, no como error de coincidencia.

**Tech Stack:** Node.js/Express, MySQL, React, TanStack Query, node:test, Vitest, Tailwind.

## Global Constraints

- La autorización se exige en backend; ocultar un botón no es autorización.
- Empleado: `clave_final`, `cantidad`, `existencia_lapiz`, `es_paquete`, `piezas_por_paquete` únicamente.
- Empleado no recibe ni visualiza costo, IVA, descuento, sugerencias, venta o ganancia.
- Administración conserva el flujo completo.
- Copia SICAR: `El código <clave> pertenece a: <descripción>`.

---

### Task 1: Política de backend

**Files:**

- Create: `services/reception-access-policy.js`
- Modify: `routes/recepciones.js`
- Test: `test/routes/recepciones-employee-permissions.test.js`

**Interfaces:** Produce `canManageReception(user)`, `canEditReceptionField(user, field)` y `sanitizeReceptionItemForUser(item, user)`.

- [ ] **Step 1: Escribir prueba RED de campo y detalle**

```js
const detail = await request(app).get('/api/recepciones/11').set('Authorization', employeeToken);
assert.equal('precio_venta_sistema' in detail.body.items[0], false);
const denied = await request(app).post('/api/recepciones/actualizar_campo')
  .set('Authorization', employeeToken)
  .send({ id_item: 8, campo: 'costo_unitario', valor: 9 });
assert.equal(denied.status, 403);
```

- [ ] **Step 2: Ejecutar RED**

Run: `node --test test/routes/recepciones-employee-permissions.test.js`

Expected: FAIL porque la ruta actual acepta costo y entrega precios.

- [ ] **Step 3: Implementar política mínima**

```js
const EMPLOYEE_CAPTURE_FIELDS = new Set([
  'clave_final', 'cantidad', 'existencia_lapiz', 'es_paquete', 'piezas_por_paquete'
]);
function canManageReception(user) { return user?.rol === 'admin'; }
function canEditReceptionField(user, field) {
  return canManageReception(user) || EMPLOYEE_CAPTURE_FIELDS.has(field);
}
```

Aplicar la política antes de `updateReceptionItem`. Rechazar para empleado proveedor, carga XML/CSV, Excel, finalizar, eliminar y rectificar. Sanear el detalle para conservar sólo identificación, descripción, código proveedor, cantidad, físico, SICAR y caja.

- [ ] **Step 4: Ejecutar GREEN**

Run: `node --test test/routes/recepciones-employee-permissions.test.js test/routes/recepciones-sicar.test.js`

Expected: PASS y las operaciones denegadas no mutan BD.

- [ ] **Step 5: Commit**

Run: `git add services/reception-access-policy.js routes/recepciones.js test/routes/recepciones-employee-permissions.test.js; git commit -m "feat: restrict employee reception actions"`

### Task 2: Interfaz de captura y aviso SICAR

**Files:**

- Modify: `frontend/src/pages/Recepciones.jsx`
- Test: `frontend/src/pages/Recepciones.test.jsx`
- Test: `frontend/src/pages/modulePermissions.test.jsx`

**Interfaces:** Consume el detalle saneado y `readSession().user.rol`; produce tarjetas operativas para empleado y tarjetas completas para administrador.

- [ ] **Step 1: Escribir prueba RED de interfaz**

```jsx
saveSession({ token: 'token', user: employee(['recepciones']) });
renderReception(employeeDetailAdapter);
expect(await screen.findByLabelText('FACTURA Cuaderno')).toBeVisible();
expect(screen.queryByText(/precio compra|ganancia real|sugerido 20/i)).not.toBeInTheDocument();
expect(screen.queryByRole('button', { name: /mandar a contar|finalizar|excel|eliminar/i })).not.toBeInTheDocument();
expect(await screen.findByText('El código 106 pertenece a: Folder Flashfile T/C Colores')).toBeVisible();
```

- [ ] **Step 2: Ejecutar RED**

Run: `npm --prefix frontend run test -- Recepciones.test.jsx modulePermissions.test.jsx`

Expected: FAIL porque la tarjeta actual muestra la zona de precios al empleado y conserva la copia anterior.

- [ ] **Step 3: Implementar vista por rol**

```jsx
const isReceptionAdmin = sessionUser?.rol === 'admin';
{isReceptionAdmin && <section aria-label={`Decisión y precios de ${item.desc}`}>...</section>}
{isReceptionAdmin && <Button aria-label={`Mandar a contar ${item.desc}`}>Mandar a contar</Button>}
```

Conservar Factura, SICAR, Físico y Caja para empleado. Ocultar proveedor, XML, Excel, finalizar, eliminar y notas. Convertir el aviso SICAR a información neutral con la descripción del catálogo.

- [ ] **Step 4: Ejecutar GREEN**

Run: `npm --prefix frontend run test -- Recepciones.test.jsx Recepciones.dialog.test.jsx modulePermissions.test.jsx`

Expected: PASS; empleado puede corregir cantidad, físico y caja; administración conserva precios.

- [ ] **Step 5: Commit**

Run: `git add frontend/src/pages/Recepciones.jsx frontend/src/pages/Recepciones.test.jsx frontend/src/pages/modulePermissions.test.jsx; git commit -m "feat: limit employee reception interface"`

### Task 3: Verificación integrada

**Files:**

- Modify: `docs/superpowers/specs/2026-08-18-permisos-captura-empleados-design.md`

- [ ] **Step 1: Añadir regresión de guardado de cantidad del empleado**

```jsx
fireEvent.change(screen.getByLabelText('FACTURA Cuaderno'), { target: { value: '8' } });
fireEvent.blur(screen.getByLabelText('FACTURA Cuaderno'));
await waitFor(() => expect(postedField).toEqual({ id_item: 11, campo: 'cantidad', valor: '8' }));
```

- [ ] **Step 2: Ejecutar verificaciones**

Run: `node --test test/routes/recepciones-employee-permissions.test.js test/routes/recepciones-sicar.test.js test/routes/reclamaciones.test.js`

Run: `npm --prefix frontend run test -- Recepciones.test.jsx Recepciones.dialog.test.jsx modulePermissions.test.jsx`

Run: `npm run verify`

Expected: todas las pruebas, lint y build pasan.

- [ ] **Step 3: Revisar y documentar**

Run: `git diff --check; git status --short; git add docs/superpowers/specs/2026-08-18-permisos-captura-empleados-design.md; git commit -m "docs: verify employee reception policy"`
