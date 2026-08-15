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

- The safe historical compatibility path is intentionally narrow and non-destructive: it only normalizes rows that still lack persisted VAT metadata and also match the strongest existing XML-origin evidence in schema data today, namely Tony rows with `aplica_descuento = 1`, which the importer set from XML concept discounts.
- Ambiguous old rows without that XML-specific signature are left unchanged rather than guessed into `costo_incluye_iva = 1`; they still rely on explicit persisted VAT markers from current imports or later correction/reimport.
