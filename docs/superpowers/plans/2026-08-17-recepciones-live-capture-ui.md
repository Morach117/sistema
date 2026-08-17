# Recepciones Live Capture UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** Recuperar la captura directa de la versión anterior con reglas automáticas, validación visual y guardado Node sin recargar la página.

**Architecture:** \`receptionCalculations\` produce valores de presentación, validación y comparación de precios puros; \`Recepciones\` los presenta en cuatro zonas por producto. \`useReceptionEditor\` conserva el guardado en cola y expone estado visible; Historial abre el detalle dentro de un dialog modal.

**Tech Stack:** React 19, TanStack Query 5, shadcn/Radix Dialog, Tailwind CSS, Node.js, Express, Vitest y Testing Library.

## Global Constraints

- Conserva la captura directa por renglón; no abre un formulario por producto.
- Caja calcula exactamente \`cantidad de factura ÷ piezas por caja\`; el conteo físico es opcional incluso al finalizar.
- Descuento se decide por XML/regla de proveedor; una excepción manual sólo está disponible en opciones avanzadas.
- Precios 20% y 30% son sugerencias de lectura y nunca actualizan el precio de venta existente.
- Falta de SICAR o físico no bloquea; una caja activada sin piezas definidas sí requiere corrección.
- Guardado, cambios de proveedor, filtros y detalle no recargan la página.

---

### Task 1: Cálculos de revisión, precio y SICAR no bloqueantes

**Files:**
- Modify: \`frontend/src/features/recepciones/receptionCalculations.js\`
- Create: \`frontend/src/features/recepciones/receptionCalculations.test.js\`

**Interfaces:**
- Consumes: item with \`cantidad\`, \`es_paquete\`, \`piezas_por_paquete\`, \`costo_unitario\`, \`precio_venta\`, \`clave_final\` and \`clave_sicar\`.
- Produces: \`priceComparison(item, cost): {compra, sugerido20, sugerido30, ventaActual, gananciaActual, margenActual}\` and non-blocking review issues.

- [ ] **Step 1: Write failing calculation tests**

    it('keeps missing SICAR and blank physical count as non-blocking review', () => {
      const issues = validateReceptionItems([{ id: 1, cantidad: 10, costo_unitario: 5, existencia_lapiz: 0 }])
      expect(issues.map(({ code, severity }) => ({ code, severity }))).toEqual([
        { code: 'missing-sicar', severity: 'review' },
        { code: 'missing-physical-count', severity: 'review' },
      ])
    })

    it('returns purchase, 20%, 30%, sale and real profit without changing sale', () => {
      expect(priceComparison({ precio_venta: 24 }, 19.49)).toMatchObject({
        compra: 19.49, sugerido20: 23.39, sugerido30: 25.34,
        ventaActual: 24, gananciaActual: 4.51,
      })
    })

- [ ] **Step 2: Run test to verify it fails**

    Run: npm --prefix frontend run test -- receptionCalculations.test.js
    Expected: FAIL because missing SICAR/físico are currently errors and priceComparison does not exist.

- [ ] **Step 3: Implement pure helpers**

    export function priceComparison(item, finalCost) {
      const compra = round(finalCost, 2)
      const ventaActual = numeric(item?.precio_venta ?? item?.precioVenta)
      return {
        compra,
        sugerido20: round(compra * 1.2, 2),
        sugerido30: round(compra * 1.3, 2),
        ventaActual,
        gananciaActual: round(ventaActual - compra, 2),
        margenActual: compra > 0 ? round(((ventaActual - compra) / compra) * 100, 1) : 0,
      }
    }

    Leave invalid-package-config and zero/invalid cost as error; mark missing SICAR and physical as review.

- [ ] **Step 4: Run calculation tests**

    Run: npm --prefix frontend run test -- receptionCalculations.test.js
    Expected: PASS.

- [ ] **Step 5: Commit**

    git add frontend/src/features/recepciones/receptionCalculations.js frontend/src/features/recepciones/receptionCalculations.test.js
    git commit -m "feat: add reception price comparison and review states"

### Task 2: SICAR confirmation and live-save feedback

**Files:**
- Modify: \`frontend/src/features/recepciones/useReceptionEditor.js\`, \`frontend/src/pages/Recepciones.jsx\`
- Test: \`frontend/src/features/recepciones/useReceptionEditor.test.jsx\`, \`frontend/src/pages/Recepciones.dialog.test.jsx\`

**Interfaces:**
- Consumes: per-field \`POST /api/recepciones/actualizar_campo\` and catalog lookup result \`{clave_sicar, codigo_barras, descripcion}\`.
- Produces: \`saveState\` of \`idle | saving | saved | error\` and item \`sicarStatus\` of \`confirmed | pending | mismatch\`.

- [ ] **Step 1: Write failing editor and page tests**

    it('shows Guardando and Guardado without remounting the selected reception', async () => {
      render(<ReceptionHarness />)
      await userEvent.type(screen.getByLabelText(/SICAR de artículo/i), '7502269634659')
      expect(screen.getByRole('status')).toHaveTextContent(/guardando/i)
      await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/guardado/i))
      expect(screen.getByText(/orden #/i)).toBeVisible()
    })

    it('labels a catalog code as confirmed only when it matches the item', async () => {
      mockCatalogMatch({ clave_sicar: '7502269634659', descripcion: 'ABACO PLAST CH BOLSA JOCAR' })
      renderPage()
      expect(await screen.findByText(/SICAR confirmado/i)).toBeVisible()
    })

- [ ] **Step 2: Run tests to verify they fail**

    Run: npm --prefix frontend run test -- useReceptionEditor.test.jsx Recepciones.dialog.test.jsx
    Expected: FAIL because the hook has no rendered terminal status and mismatch states are not distinguished.

- [ ] **Step 3: Implement status and confirmation mapping**

    const [saveState, setSaveState] = useState('idle')
    // Set saving before queueing, saved only after the latest request settles,
    // and error only if the latest save for that field rejects.

    Render a compact role="status" beside the order header. Keep debounce, serialization and flushAndWait; do not call window.location.reload.

- [ ] **Step 4: Run focused tests**

    Run: npm --prefix frontend run test -- useReceptionEditor.test.jsx Recepciones.dialog.test.jsx
    Expected: PASS.

- [ ] **Step 5: Commit**

    git add frontend/src/features/recepciones/useReceptionEditor.js frontend/src/features/recepciones/useReceptionEditor.test.jsx frontend/src/pages/Recepciones.jsx frontend/src/pages/Recepciones.dialog.test.jsx
    git commit -m "feat: show reception save and SICAR status"

### Task 3: Direct four-zone capture card and conditional actions

**Files:**
- Modify: \`frontend/src/pages/Recepciones.jsx\`
- Test: \`frontend/src/pages/Recepciones.test.jsx\`

**Interfaces:**
- Consumes: \`calculatePresentation\`, \`calculateCost\`, \`priceComparison\`, selected items and \`useReceptionEditor\` state.
- Produces: direct four-zone product cards and an action strip only when products are selected.

- [ ] **Step 1: Write failing page tests**

    it('shows purchase, 20%, 30% and current sale as read-only values', async () => {
      renderPage(createAdapter({ detailsItems: [item({ costo_unitario: 19.49, precio_venta: 24 })] }))
      expect(await screen.findByText(/precio compra/i)).toBeVisible()
      expect(screen.getByText(/sugerido 20%/i)).toBeVisible()
      expect(screen.getByText(/sugerido 30%/i)).toBeVisible()
      expect(screen.getByText(/precio venta actual/i)).toBeVisible()
    })

    it('hides bulk controls until an item is selected', async () => {
      renderPage()
      expect(screen.queryByText(/presentación masiva/i)).not.toBeInTheDocument()
      await userEvent.click(screen.getByLabelText(/seleccionar .*artículo/i))
      expect(screen.getByText(/presentación masiva/i)).toBeVisible()
    })

- [ ] **Step 2: Run test to verify it fails**

    Run: npm --prefix frontend run test -- Recepciones.test.jsx
    Expected: FAIL because cards expose repeated controls and the mass bar is always rendered.

- [ ] **Step 3: Implement the direct card layout**

    <article className="grid gap-4 rounded-2xl border bg-card p-4 xl:grid-cols-[7rem_minmax(16rem,1.2fr)_10rem_minmax(20rem,.95fr)]">
      <InvoiceZone item={item} />
      <ProductSicarZone item={item} />
      <PhysicalBoxZone item={item} />
      <DecisionPricesZone item={item} comparison={priceComparison(item, cost.costoFinal)} />
    </article>

    Keep rejection and automatic discount visible. Put manual override, internal note, missing, reclamation and restore in an accessible “Más opciones” disclosure. Render mass controls only when selectedItems.length > 0.

- [ ] **Step 4: Run page tests**

    Run: npm --prefix frontend run test -- Recepciones.test.jsx
    Expected: PASS.

- [ ] **Step 5: Commit**

    git add frontend/src/pages/Recepciones.jsx frontend/src/pages/Recepciones.test.jsx
    git commit -m "feat: simplify direct reception capture cards"

### Task 4: Modal detail in reception history

**Files:**
- Modify: \`frontend/src/pages/HistorialRecepciones.jsx\`
- Test: \`frontend/src/pages/HistorialRecepciones.test.jsx\`

**Interfaces:**
- Consumes: existing \`HistoryDetail({detail, detailId, onClose})\` and selected receipt query.
- Produces: an accessible Radix Dialog with detail and preserved list/filter DOM behind it.

- [ ] **Step 1: Write failing modal interaction test**

    it('opens receipt detail in a dialog and retains the filtered result list on close', async () => {
      render(<HistorialRecepciones />)
      await userEvent.click(await screen.findByRole('button', { name: /abrir KPL056869/i }))
      expect(await screen.findByRole('dialog')).toHaveTextContent(/KPL056869/)
      await userEvent.click(screen.getByRole('button', { name: /cerrar detalle/i }))
      expect(screen.getByRole('button', { name: /abrir KPL056869/i })).toBeVisible()
    })

- [ ] **Step 2: Run test to verify it fails**

    Run: npm --prefix frontend run test -- HistorialRecepciones.test.jsx
    Expected: FAIL because selected detail replaces the filter/list branch.

- [ ] **Step 3: Wrap detail in Dialog primitives**

    <Dialog open={Boolean(selectedId)} onOpenChange={(open) => !open && setSelectedId(null)}>
      <DialogContent className="max-h-[90vh] max-w-6xl overflow-y-auto">
        <DialogTitle>Recepción {detail?.numero_remision || ''}</DialogTitle>
        {loadingDetail ? <LoadingState label="Cargando detalle…" /> : <HistoryDetail detail={detail} detailId={selectedId} onClose={() => setSelectedId(null)} />}
      </DialogContent>
    </Dialog>

    Leave filters/results outside the dialog unconditionally.

- [ ] **Step 4: Run modal tests**

    Run: npm --prefix frontend run test -- HistorialRecepciones.test.jsx
    Expected: PASS.

- [ ] **Step 5: Commit**

    git add frontend/src/pages/HistorialRecepciones.jsx frontend/src/pages/HistorialRecepciones.test.jsx
    git commit -m "feat: open reception history details in a modal"

### Task 5: Whole-release verification and visual checks

**Files:**
- Modify: \`docs/superpowers/specs/2026-08-17-operacion-local-y-recepciones-design.md\` only if test evidence reveals a design mismatch.
- Test: all suites named above.

**Interfaces:**
- Consumes: completed Tasks 1-4.
- Produces: verified desktop/responsive layout and test/build/lint evidence.

- [ ] **Step 1: Run focused regression suites**

    Run: npm --prefix frontend run test -- Recepciones.test.jsx Recepciones.dialog.test.jsx HistorialRecepciones.test.jsx receptionCalculations.test.js useReceptionEditor.test.jsx
    Expected: PASS.

- [ ] **Step 2: Run backend and full frontend tests**

    Run: node --test; npm --prefix frontend run test -- --run
    Expected: PASS with no new failures.

- [ ] **Step 3: Build and lint**

    Run: npm --prefix frontend run build; npm --prefix frontend run lint; git diff --check
    Expected: build and diff check exit 0; lint has no new warnings.

- [ ] **Step 4: Manually inspect the target flows**

    1. Start Node and open /clientes-configuracion on an unconfigured database.
    2. Configure Central, generate a code, then verify a Sucursal can discover/pair without IP input.
    3. Open /recepciones and change SICAR, physical and box values without a browser reload.
    4. Check an XML-discounted Tony line and an XML-without-discount line.
    5. Open /historial-recepciones, filter, open a row, close its dialog and verify filters remain.

- [ ] **Step 5: Commit final integration**

    git add docs/superpowers/specs/2026-08-17-operacion-local-y-recepciones-design.md
    git commit -m "docs: record reception and local operation verification"
