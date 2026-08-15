# Task 2 Report

## Changed Files

- `services/reception-rules.js`
- `services/recepciones-service.js`
- `routes/recepciones.js`
- `test/services/reception-rules.test.js`
- `test/services/recepciones-service.test.js`
- `test/routes/recepciones-upload.test.js`
- `database/migrations/004_reception_xml_vat_persistence.js`
- `routes/evolucion.js`
- `test/database/migrations.test.js`
- `test/routes/evolucion-compatibility.test.js`

## RED Commands / Results

- `node --test test/services/reception-rules.test.js test/services/recepciones-service.test.js test/routes/recepciones-upload.test.js`
  - Result: `FAIL`
  - Evidence:
    - `Cannot find module '../../services/reception-rules'`
    - XML reimport update SQL did not include `aplica_iva`
    - New XML insert SQL hard-coded `aplica_iva = 0`
    - XML parser output did not include `aplica_iva` or `source` metadata

## GREEN Commands / Results

- `node --test test/services/reception-rules.test.js test/services/recepciones-service.test.js test/routes/recepciones-upload.test.js`
  - Result: `PASS`
  - Evidence: `22` tests passed, `0` failed
- `git diff --check`
  - Result: `PASS`
  - Evidence: no diff errors; only LF->CRLF warnings from Git on this Windows workspace
- `node --check services/reception-rules.js`
  - Result: `PASS`
- `node --check services/recepciones-service.js`
  - Result: `PASS`
- `node --check routes/recepciones.js`
  - Result: `PASS`

## Commit(s)

- `feat: add reception rules and xml reimport metadata`

## Review Fix RED / GREEN

### RED Commands / Results

- `node --test test/database/migrations.test.js test/services/reception-rules.test.js test/routes/recepciones-upload.test.js`
  - Result: `FAIL`
  - Evidence:
    - `Cannot find module '../../database/migrations/004_reception_xml_vat_persistence'`
    - XML reimport update SQL did not persist `iva_tasa` / `costo_incluye_iva`
    - New XML insert SQL did not persist `iva_tasa` / `costo_incluye_iva`
    - Persisted XML round-trip cost test showed IVA metadata was lost after reload

### GREEN Commands / Results

- `node --test test/database/migrations.test.js test/services/reception-rules.test.js test/routes/recepciones-upload.test.js`
  - Result: `PASS`
  - Evidence: `51` tests passed, `0` failed
- `git diff --check`
  - Result: `PASS`
  - Evidence: no diff errors; only LF->CRLF warnings from Git on this Windows workspace
- `node --check database/migrations/004_reception_xml_vat_persistence.js`
  - Result: `PASS`
- `node --check services/reception-rules.js`
  - Result: `PASS`
- `node --check routes/recepciones.js`
  - Result: `PASS`
- `node --check routes/evolucion.js`
  - Result: `PASS`

## Concerns

- No functional concerns found in Task 2 after the focused verification run.
- `buildReceptionSummary` and `validateReceptionItems` are implemented and covered with unit tests, but they are not wired into the reception detail response yet; later tasks can consume them without changing the XML import contract added here.
- Git reports LF->CRLF warnings for several tracked files in this workspace, but verification found no whitespace or syntax errors.
- Follow-up fix stores XML VAT persistence in the database with `iva_tasa` and `costo_incluye_iva`, while persisted XML rows keep `aplica_iva = 0` so current Evolución reads cannot double-apply VAT after reload.

## Compatibility Round 2 RED / GREEN

### RED Commands / Results

- `node --test test/services/reception-rules.test.js test/routes/evolucion-compatibility.test.js`
  - Result: `FAIL`
  - Evidence:
    - known `256e140`-style Tony XML row still surfaced as `aplica_iva = 1`, `iva_tasa = null`, `costo_incluye_iva = 0`
    - `calculateCost(...)` still treated that persisted row as taxable again and returned `31.958` instead of the safe historical path

### GREEN Commands / Results

- `node --test test/services/reception-rules.test.js test/routes/evolucion-compatibility.test.js test/routes/recepciones-upload.test.js`
  - Result: `PASS`
  - Evidence: `18` tests passed, `0` failed
- `git diff --check`
  - Result: `PASS`
  - Evidence: no diff errors; only LF->CRLF warnings from Git on this Windows workspace
- `node --check services/reception-rules.js`
  - Result: `PASS`
- `node --check routes/evolucion.js`
  - Result: `PASS`

### Compatibility Boundary

- The durable compatibility contract is now marker-based only: rows are treated as VAT-included after reload only when they carry persisted VAT metadata such as `iva_tasa` or `costo_incluye_iva`.
- Ambiguous old rows without persisted source markers are left unchanged rather than guessed into `costo_incluye_iva = 1`; they keep historical behavior unless a future explicit repair source is introduced.

## Compatibility Round 3 RED / GREEN

### RED Commands / Results

- `node --test test/services/reception-rules.test.js test/routes/evolucion-compatibility.test.js`
  - Result: `FAIL`
  - Evidence:
    - ambiguous discounted Tony legacy row was still auto-normalized to `aplica_iva = 0`, `iva_tasa = 0.16`, `costo_incluye_iva = 1`
    - `calculateCost(...)` still returned the repaired path `27.55` instead of preserving historical taxable behavior `31.958`

### GREEN Commands / Results

- `node --test test/services/reception-rules.test.js test/routes/evolucion-compatibility.test.js test/routes/recepciones-upload.test.js`
  - Result: `PASS`
  - Evidence: `18` tests passed, `0` failed
- `git diff --check`
  - Result: `PASS`
  - Evidence: no diff errors; only LF->CRLF warnings from Git on this Windows workspace
- `node --check services/reception-rules.js`
  - Result: `PASS`
- `node --check routes/evolucion.js`
  - Result: `PASS`

### Release History Note

- The earlier `256e140` behavior was a task-local commit, not an independently released migration that wrote durable source markers onto historical rows.
- Because those ambiguous persisted rows do not carry trustworthy origin markers in schema data, the application does not auto-repair them now; only persisted VAT markers drive VAT-included reload behavior.
