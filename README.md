# MEDS PropX Command Center

Portal operativo de frac sand (MEDS Logistics / OMMA Trucking) — multi-pozo en tiempo real sobre Google Sheets.

## Arquitectura
- **`index.html`** — portal completo (single-file, Chart.js v4). Netlify lo sirve tal cual; este repo está ligado a Netlify con deploy automático en cada push a `main`.
- **`gas/Code.gs`** — API (Google Apps Script Web App) sobre el Hub de PropX. Se pega en el editor de Apps Script → **Implementar → Nueva versión** (el deploy del GAS NO es automático desde el repo; el archivo aquí es la fuente de verdad versionada).
- **`gas/Code_Velox.gs`** — API del sistema hermano VELOX Command Center (sitio Netlify aparte).

## Versionado
- Portal: `VBUILD` en `index.html` (visible en el header del sitio).
- API: `API_VERSION` en `gas/Code.gs` (visible en la pill "Live API" del portal).
- Regla: todo cambio de GAS requiere **Nueva versión** en Apps Script; el portal solo requiere push.

## Modelo financiero
- Tarifas **versionadas por vigencia** (hoja Rates del Hub, columna `effective`): cada carga factura la tarifa vigente en su fecha de entrega. Aumentos = fila nueva; el histórico nunca se edita.
- **FSC (fuel surcharge)**: columna opcional `fsc` ($/ton) en Rates. Revenue facturado = rate + FSC, con desglose (`revenue_base` / `revenue_fsc`). Target por pozo: key `fsc_per_ton` en la pestaña Targets del workbook. Pozos sin FSC no cambian ("Sin FSC reportado").

## Flujo de datos
Hub (Registry + Rates + Status Log) → GAS (snapshots congelados en Drive/pestaña `_SNAP_CACHE`, portafolio precocido, trigger 6h) → portal (1 llamada de arranque, caché local por estado: cierres congelados, lives revalidados).
