# Clientes LAN Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** Hacer que la primera configuración Central/Sucursal y el módulo Clientes funcionen sin pantallas vacías, recargas ni dependencia de IP.

**Architecture:** El router expone un DTO de estado explícito y limitado; React lo consume como fuente de estado local y actualiza sus consultas sin recargar. La página de configuración es un asistente de primer uso y después conserva las operaciones de vínculo existentes.

**Tech Stack:** Node.js, Express, mysql2/promise, React 19, TanStack Query 5, Vitest, Testing Library, node:test y Supertest.

## Global Constraints

- La LAN es el único medio de sincronización; no se usan IP pública, DNS dinámico, Tailscale ni MySQL remoto.
- IP, hostname y DHCP no definen la identidad de una Central o Sucursal.
- No se exponen claves privadas, IPs ni identificadores internos en el DTO de estado.
- Clientes y compras siguen operando localmente cuando no hay Central; el frontend nunca debe quedarse en blanco.
- Las mutaciones no recargan la página: TanStack Query actualiza la UI local y refresca en segundo plano.

---

### Task 1: Contrato de estado LAN inicializable

**Files:**
- Modify: \`routes/clientes-sync.js:47-71\`
- Test: \`test/routes/clientes-sync.test.js\`

**Interfaces:**
- Consumes: \`syncService.getStatus(): Promise<{configuracionRequerida?: boolean, sucursal?: {nombre?: string, rol?: 'central'|'sucursal'}}>\`.
- Produces: \`GET /api/clientes-sync/estado\` response \`data.configuracionRequerida: boolean\` plus the existing safe fields.

- [ ] **Step 1: Write the failing route test**

    it('reports setup required without leaking node identity details', async () => {
      const app = createAppWithSyncStatus({ configuracionRequerida: true, sucursal: null })
      const response = await request(app).get('/api/clientes-sync/estado').set(authHeader)
      assert.equal(response.status, 200)
      assert.equal(response.body.data.configuracionRequerida, true)
      assert.equal('privateKey' in response.body.data, false)
    })

- [ ] **Step 2: Run test to verify it fails**

    Run: node --test test/routes/clientes-sync.test.js
    Expected: FAIL because configuracionRequerida is stripped by the route DTO.

- [ ] **Step 3: Add the safe field to the router response**

    data: {
      configuracionRequerida: Boolean(status.configuracionRequerida),
      sucursal: { nombre: status.sucursal?.nombre, rol: status.sucursal?.rol },
      centralVinculada: Boolean(status.centralVinculada),
      centralFingerprint: status.centralFingerprint || null,
      estado: status.estado,
      pendientes: Number(status.pendientes || 0),
      conflictos: Number(status.conflictos || 0),
    }

- [ ] **Step 4: Run route tests**

    Run: node --test test/routes/clientes-sync.test.js
    Expected: PASS, including LAN authorization tests.

- [ ] **Step 5: Commit**

    git add routes/clientes-sync.js test/routes/clientes-sync.test.js
    git commit -m "fix: expose local client setup status"

### Task 2: Asistente claro de Central y Sucursal

**Files:**
- Modify: \`frontend/src/pages/ClientesConfiguracion.jsx\`
- Create: \`frontend/src/pages/ClientesConfiguracion.test.jsx\`

**Interfaces:**
- Consumes: DTO from Task 1 and \`PUT /api/clientes-sync/configuracion\` with \`{rol_nodo, nombre}\`.
- Produces: a first-use screen with Central and Sucursal choices, readable service errors and configuration mutation without navigation reload.

- [ ] **Step 1: Write failing component tests**

    it('shows a first-use Central or Sucursal choice when setup is required', async () => {
      mockStatus({ configuracionRequerida: true, sucursal: null })
      render(<ClientesConfiguracion />)
      await userEvent.click(screen.getByRole('button', { name: /esta será la central/i }))
      expect(screen.getByLabelText(/nombre visible/i)).toBeVisible()
    })

    it('shows a retryable service message instead of a stuck role field', async () => {
      mockStatusError(404)
      render(<ClientesConfiguracion />)
      expect(await screen.findByRole('alert')).toHaveTextContent(/servicio local/i)
      expect(screen.getByRole('button', { name: /reintentar/i })).toBeVisible()
    })

- [ ] **Step 2: Run test to verify it fails**

    Run: npm --prefix frontend run test -- ClientesConfiguracion.test.jsx
    Expected: FAIL because the form is a dense select and lacks retry.

- [ ] **Step 3: Implement guided choices and retry**

    const choices = [
      { value: 'central', title: 'Esta será la Central', copy: 'Aquí se resguardan y comparten los clientes.' },
      { value: 'sucursal', title: 'Esta será una Sucursal', copy: 'Se vincula con un código temporal de la Central.' },
    ]

    <Button onClick={() => statusQuery.refetch()} variant="outline">Reintentar</Button>

    Use selectable cards rather than a disabled-looking select. Preserve configure.mutate and invalidate ['clientes-sync-estado'] on success.

- [ ] **Step 4: Run focused tests**

    Run: npm --prefix frontend run test -- ClientesConfiguracion.test.jsx
    Expected: PASS with no browser reload assertion failures.

- [ ] **Step 5: Commit**

    git add frontend/src/pages/ClientesConfiguracion.jsx frontend/src/pages/ClientesConfiguracion.test.jsx
    git commit -m "feat: guide local central and branch setup"

### Task 3: Clientes recoverable loading and offline states

**Files:**
- Modify: \`frontend/src/pages/Clientes.jsx\`
- Test: \`frontend/src/pages/Clientes.test.jsx\`

**Interfaces:**
- Consumes: local Clientes API and \`['clientes-sync-estado']\` query.
- Produces: visible loading, empty, stale/offline and retry states while preserving locally loaded client data.

- [ ] **Step 1: Write failing UI tests**

    it('keeps the directory visible when sync status fails', async () => {
      mockSyncStatusError()
      mockClients([{ id: 'c-1', nombre: 'María' }])
      render(<Clientes />)
      expect(await screen.findByText('María')).toBeVisible()
      expect(screen.getByText(/siguen guardándose localmente/i)).toBeVisible()
    })

    it('renders a retryable directory error rather than a blank page', async () => {
      mockClientsError()
      render(<Clientes />)
      expect(await screen.findByRole('alert')).toBeVisible()
      expect(screen.getByRole('button', { name: /reintentar clientes/i })).toBeVisible()
    })

- [ ] **Step 2: Run test to verify it fails**

    Run: npm --prefix frontend run test -- Clientes.test.jsx
    Expected: FAIL because an API error can leave the directory without an action.

- [ ] **Step 3: Implement explicit page states**

    if (clientsQuery.isError) return <DirectoryError onRetry={() => clientsQuery.refetch()} />
    const offlineCopy = statusQuery.isError || status?.estado === 'offline'

    Keep StatusBanner separate from directory rendering, use placeholderData for the last client list, and expose role="status" and role="alert".

- [ ] **Step 4: Run focused tests**

    Run: npm --prefix frontend run test -- Clientes.test.jsx
    Expected: PASS.

- [ ] **Step 5: Commit**

    git add frontend/src/pages/Clientes.jsx frontend/src/pages/Clientes.test.jsx
    git commit -m "fix: keep local clients usable during sync errors"
