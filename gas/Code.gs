/** MEDS · PropX Live API — Code.gs v11.2. PEGAR TAL CUAL → Nueva versión.
 *  v11.2 UN DRIVER POR CAMIÓN (la flota no corre con dos drivers): un bloque de más de 24 h sin una
 *  pausa de 4 h ya NO es "unidad 24/7 / dos drivers" sino una CORRIDA CONTINUA del driver → alerta HOS.
 *  (1) roster[].cx = [inicio, fin, horas, loads, abierta] de sus corridas; sus días siguen en dh con
 *  dh[7]=1 y sus loads son solo los de la corrida (antes contaba todas las del día). (2) La corrida no
 *  enseña su ventana: se proyecta como UN driver (jornadas normales, pozo pasado o 12 h · src 'cx')
 *  y nunca 24/7. (3) El descanso se mide también al entrar y al salir de la corrida (dh[6]).
 *  (4) diag.roster_clock.hos = drivers con corrida (antes team). Sin densidad mínima de cargas.
 *  v11.1 RELOJ REAL POR HORA + DRIVERS EN TURNO + LOAD ID DUPLICADO: (1) la serie por hora (loads,
 *  drivers, revenue, FSC, tons, ciclo y pesos) pone cada entrega OFFLINE en su hora REAL (In Transit +
 *  tránsito típico del pad, o At Terminal + tramo típico — la misma regla del roster) sin salir del día
 *  oficial del Delivered: la suma por hora sigue cuadrando con el total del día. (2) hourly[].ac =
 *  drivers EN TURNO por hora (fracción de la hora entre su 1er At Terminal y su última entrega, de los
 *  bloques del roster) — base del Forecast para la tasa por hora en turno y de la línea "On shift".
 *  (3) diag.dup_ids: un Load ID propio que también está en el Loads Report de un pozo vecino (Live o
 *  cerrado con fechas que se cruzan) aunque comparta terminal — solo aviso para DATA AUDIT (no excluye).
 *  (4) diag.hourly_clock: entregas offline, cuántas cambiaron de hora y el tramo típico usado.
 *  v11.0 HORAS POR DÍA + TARIFAS EN LA FIRMA: (1) cada driver del roster publica dh = TODAS sus
 *  jornadas en el pad (día operativo, arranque, fin, horas, loads, clase, descanso previo, 24/7) →
 *  el portal muestra en Roster las horas de cada driver en el día elegido y su media. Día operativo:
 *  la jornada que arranca de 22:00 en adelante cuenta para el día siguiente. (2) La firma de los
 *  snapshots incluye las tarifas del Hub (Rates) del cliente del pozo: un cambio de rate o FSC con
 *  vigencia hacia atrás ya refresca los cierres (antes se quedaban con la tarifa vieja).
 *  v10.9 CERO DRIVERS DE OTRO POZO + HORAS REALES: (1) CROSS-PAD: una fila cuya terminal es AJENA al
 *  pad y cuyo Load ID existe en el Loads Report de un pozo vecino (Live o cerrado ≤7 días) que SÍ
 *  declara esa terminal ya no se cuenta aquí — sale antes de sumar loads, tons, revenue, drivers y
 *  roster (lectura del vecino por columnas, caché 15 min, solo si hay filas de terminal ajena).
 *  Caso real: Casselman B #3/#4 traía 159 cargas de Oasis/Nile pegadas en las filas 255–413 (después
 *  del pie "Transferred"): 18 drivers de Bayswater sin cargas propias salían en su roster. Queda
 *  auditado en diag.cross_pad (pozo dueño, filas, drivers, fechas). Con terminals_strict la exclusión
 *  ahora ocurre ANTES de acumular (antes se escapaban FSC, revenue base y pesos). (2) ROSTER con
 *  reloj real: arranque = At Terminal (no la 1a entrega), minutos exactos, entregas OFFLINE
 *  corregidas (el sello llega horas tarde al sincronizar: 74 en Casselman), jornadas por intervalos
 *  (el nocturno que cruza medianoche ya no suma "días" de 20 h), login 24/7 detectado. (3) Reglas:
 *  el día-1 del pozo, la PRIMERA jornada del driver en el pad y la jornada en curso no enseñan; con 0
 *  jornadas que enseñan (prefill / día-1 / su primer día) mandan sus POZOS PASADOS; primer viaje sin
 *  historial = 12 h desde su arranque real; 1–2 jornadas se mezclan con ese historial. (4) Estimador
 *  PONDERADO de horas (_hrsEst) en vez del promedio simple: patrón repetido = 50% valor repetido +
 *  25% último día + 25% media; días cortos con el último arriba de la media = 50/50 último + media;
 *  último día corto (parcial) = mediana + media de días completos. Cada driver publica hx (método,
 *  pesos, jornadas saltadas) y cs/lm/op (turno en curso) para que el portal ancle su salida.
 *  v10.8 CIERRES QUE NO SE QUEDAN VIEJOS: (1) la web app corre SIN permiso de Drive (almacén en la
 *  pestaña _SNAP_CACHE) y así un pozo Closed se servía 24 h a ciegas: State Scarab quedó en 200/201
 *  stages porque la etapa 201 se capturó 40 s después del cálculo. Ahora cada snapshot guarda la
 *  FIRMA del contenido (MD5 de Loads Report · Stages · Downtimes · Targets + su renglón del
 *  Registry, tomada de la MISMA lectura del cálculo) y antes de servirlo se compara contra el
 *  workbook (1-3 s, solo lectura): igual → se sirve · distinta → se recalcula. Revisión máx. cada
 *  10 min en cierres recientes (≤7 días desde end_date) y cada 6 h en cierres viejos. Con Drive la
 *  comparación exacta ahora es contra el INICIO de la lectura (t0): una edición a media corrida ya
 *  no se pierde. (2) _SNAP_CACHE: escritura con candado (se acabaron las llaves duplicadas de
 *  pedidos simultáneos) y lectura solo de las celdas del snapshot pedido (antes leía la pestaña
 *  completa, varios MB, por cada pozo del portafolio). (3) Registry memorizado por ejecución.
 *  (4) targets_notes: notas de Targets ("unit / notas") — el portal toma de ahí la mezcla de diseño
 *  por etapa (toe prep · 1W · 2W/3W) y compara cada etapa contra SU diseño, no contra el promedio.
 *  v10.7 TERMINALES SIN TOPE: (1) el match de terminales normaliza guiones Unicode. PropX
 *  escribe "Covia – Pronto" (guion largo) y Targets "Covia - Pronto": la terminal principal de
 *  Olgin (166 cargas) salía como AJENA en diag.foreign_terminals y con terminals_strict se
 *  habría excluido completa. Aplica también al match de pads del Status. (2) designTerminals:
 *  prefijo → nombre de cada terminal de diseño, leído de los encabezados "— TERMINAL · nombre —"
 *  de Targets. El portal lista TODAS las terminales del diseño (cualquier cantidad) aunque
 *  todavía no tengan cargas, y liga cada terminal real con su prefijo sin depender de term_map.
 *  (3) hourlyByTerm: ciclo por hora POR TERMINAL (solo horas con cargas): al filtrar UN día por
 *  terminal en Cycle Times, la vista por hora ya no mezcla todas las terminales.
 *  v10.6 RELOJ = LO QUE MUESTRA LA CELDA: Delivered / At Terminal / In Transit / At Staging /
 *  At Dest. se leen con getDisplayValues() — el texto exacto del doc ("10/16/2026 9:04:31 p.m.")
 *  parseado directo como hora Central. En producción, convertir el valor de la celda (Date) con
 *  zonas horarias corría todo −5 h: las entregas de 12:00–4:59 AM caían en el día anterior
 *  (16-Oct = 63 en vez de 85). Sale el modo de conversión automática (ya no hace falta) y se
 *  limpia su marca guardada. diag.value_shift_h dice cuántas horas estaba corrido el valor.
 *  v10.5 CERO DATOS DE VERSIONES VIEJAS: el snapshot de un pozo Live solo se sirve si lo
 *  calculó ESTA versión (antes un snapshot de v10.2 hecho minutos antes del deploy se seguía
 *  sirviendo con su día corrido −5 h); la caché corta usa llaves por versión; el portafolio
 *  (Overview / Active Wells) se reconstruye si viene de otra versión o tiene >15 min con pozos
 *  Live (antes: hasta 6 h). congelarCierres re-calcula los cierres de versiones viejas con
 *  presupuesto de tiempo (avanza por tandas sin chocar con el límite de 6 min).
 *  Peso capturado en miles de lbs (47.16) o tons (23.5) se lee como lbs — ya no se vuelve "asset".
 *  v10.4 RELOJ CENTRAL AUTOMÁTICO — un día = 12:00 AM–11:59 PM hora Central, siempre:
 *   · Cada timestamp se lee como el reloj que MUESTRA la celda (Date → en la tz del propio
 *     workbook; texto → parseado directo: "10/16/2026 9:04:31 p.m.", "a. m.", PM, 24 h,
 *     ISO, D/M inequívoco) y ese reloj ES Central. Ya no importa la tz del workbook ni la
 *     del script. Fecha y HORA salen del mismo reloj (antes la hora usaba la tz del script).
 *   · Red de seguridad: si un workbook en otra zona guarda INSTANTES (sus horas van ADELANTE
 *     de Central), se convierte a Central y la decisión queda fija para ese workbook.
 *   · Lector blindado: un encabezado "Load #" repetido (export pegado debajo) YA NO corta la
 *     lectura; un pie "Transferred" solo se salta hasta el siguiente bloque real; cargas
 *     duplicadas por pegados encimados se cuentan una vez (gana la fila con Delivered).
 *   · Fechas D/M mal interpretadas por Sheets (locale es-MX) se reparan si caen fuera de la
 *     ventana posible del pozo. Snapshot de pozos Live: máx. 10 min aunque Drive no avise.
 *   · diag: day_tz, tz_sheet, tz_mode, header_repeats, dupes_removed, text_dates,
 *     unparsed_dates, dm_repaired, ct_today + day_audit en reloj Central.
 *  v10.3 AUDITORÍA DE CORTE DE DÍA: diag gana tz (zona horaria con la que se bucketizan
 *  los días — la del workbook, u override con la key `timezone` en Targets, p. ej.
 *  America/Chicago), day_audit (últimos 4 días con loads y primera/última hora de
 *  entrega) y dates_normalized. fmtDate ahora normaliza celdas de fecha en TEXTO
 *  ("10/16/2026 ...") a ISO — antes esas cargas caían en un bucket huérfano que el
 *  portal no podía mostrar.
 *  v10.2 OVERWEIGHT DETAIL: wt gana ovL — la lista de cargas >80k lbs del rango
 *  [fecha, terminal, driver, gross lbs, load #] (cap 80) para que el portal
 *  muestre al pasar el cursor QUÉ trucks van pasados y de quién son.
 *  v10.1 PESOS (Sourcing): lee la columna "Gross Weight" del Loads Report (col R
 *  como fallback literal) y publica wt{days,hrs,dd}: promedios NET/GROSS por día×
 *  terminal y por hora×terminal, overweight (>80k) / light (<70k) por load, y la
 *  base de Income/Truck·Day (drivers únicos + revenue + FSC por día). byDriver y
 *  el roster ganan avg NET y avg GROSS por driver. Guard: gross válido 30k–120k.
 *  v10.0 AUTH / USUARIOS: hoja "Users" en el Hub (se crea sola), login con hash
 *  salteado, token HMAC de 7 días y 3 roles: admin · operative · customer. Con un
 *  admin activo creado, TODA acción de datos exige token; sin admin aún, la API
 *  queda abierta (bootstrap) y el portal ofrece crear el primer admin. Emergencia:
 *  Script property AUTH_OFF=1 la reabre sin tocar código. Cero scopes nuevos.
 *  v9.8 UN PUMPING DAY YA ENSEÑA: con historia (no-NEW: 3+ días calendario y 2+
 *  turnos), UN solo día bombeado CERRADO posterior al día-1 de ESTE pozo ya define
 *  la ventana del driver y gana a prefill y a la herencia cross-well. NEW sigue
 *  igual (2 turnos para promediar; si no, 12 h); prefill ≥2 turnos y el veto del
 *  día-1 quedan tal cual.
 *  v9.7 HERENCIA ENTRE POZOS (cross-well): si un driver no tiene historia útil en
 *  ESTE pozo (ni pump post día-1 ni prefill), su ventana/mapa horario se hereda del
 *  pozo donde cargó más recientemente — pozos Live del registry + el último Closed —
 *  vía una caché ligera de rosters (6 h), SIN abrir libros ajenos. Match por nombre
 *  normalizado (acentos fuera) con desempate por carrier; datos de >14 días no se
 *  heredan; sin cadenas (xwell no re-hereda). Todo auditable: src:'xwell' + pozo de
 *  origen (xw) + su último load allá (xwL). Si nada aplica, la regla NEW de 12 h
 *  sigue garantizando ventana a CUALQUIER driver — nadie queda sin proyección.
 *  v9.6 REGLAS DE APRENDIZAJE DE VENTANAS:
 *   · El DÍA 1 del pozo (downhole/arranque) nunca enseña — el aprendizaje pump
 *     empieza del día operativo 2 en adelante.
 *   · Pozo en prefill o recién arrancado sin historia pump suficiente → las
 *     ventanas se toman del TRABAJO PREVIO del driver (sus turnos de prefill),
 *     marcadas src:'prefill' para auditar.
 *   · Driver NUEVO = sus primeros 2 días calendario en el pad → proyecta 12 h
 *     desde el inicio REAL de su último turno (nwS); al 3er día entra a patrones.
 *  v9.5 CACHÉ DE SERVIDOR: well (75 s), status (60 s) y portfolio (120 s) se sirven
 *  desde CacheService comprimidos (gzip, con chunking para libros grandes) — cambiar
 *  de pozo o recargar el portal responde al instante para TODOS los usuarios y el
 *  workbook solo se lee de verdad una vez por ventana. Live sync (fresh=1) salta la
 *  caché y la reescribe. Un libro gigantesco que no quepa ni en 5 chunks simplemente
 *  no se cachea (sigue funcionando igual que hoy).
 *  v9.4.5 PERFIL HORARIO (hw): por driver se publica un mapa de 24 horas con la
 *  frecuencia real de actividad (0-9 = en cuántos de sus días trabajó esa hora).
 *  El portal lo usa para pesar la proyección de crew hora por hora y para marcar
 *  en su línea del roster las horas en las que MÁS activo está.
 *  v9.4.4 HORAS POR DÍA: si un driver trabaja VARIOS bloques el mismo día (split por
 *  huecos ≥6 h — típico en cajas/Fasken esperando swaps), los bloques se SUMAN y la
 *  media de horas es por DÍA trabajado, no por bloque; el arranque (aS) es el primer
 *  bloque de cada día. Los bloques individuales siguen publicados en shd para auditar.
 *  v9.4.3 MÉTRICAS OPERATIVAS: loads (n) y días (days) del roster cuentan SOLO días
 *  operativos — desde la primera etapa del pozo en adelante; el prefill queda fuera.
 *  Un pozo que sigue en prefill (sin etapas) cuenta su prefill tal cual.
 *  v9.4.2 TURNOS CERRADOS: además del filtro de pumping days, la ventana ya NO toma el día
 *  actual del dato (turnos truncados a medias) ni el turno aún abierto (fin a <3 h del último
 *  load del pad) — el stub de hoy no arrastra la media de horas hacia abajo.
 *  v9.4.1 VENTANAS SOLO DE PUMPING DAYS: la ventana media de cada driver se aprende de sus
 *       turnos en días CON etapas (el prefill ya no diluye las horas); si un driver no
 *       tiene turnos en días pump, cae a todos. Publica shd[] (últimos ≤4 turnos usados:
 *       [día, hora inicio, horas]) para auditar la matriz driver por driver.
 *  v9.4 TRUCK ROSTER APRENDIDO: getWell publica roster[] por driver con su ventana de
 *       turno REAL aprendida de los Delivered del pozo — los loads se segmentan en turnos
 *       por huecos ≥6 h (maneja turnos nocturnos que cruzan medianoche), y de ahí salen
 *       hora media de arranque (media circular), duración media, TR medio en pumping
 *       days, días trabajados y último load. Drivers nuevos (<2 turnos) van marcados
 *       nw:true con fs = su primer load (regla operativa: activación + 12 h).
 *  v9.3.3 INVENTARIO REAL, NO LA ÚLTIMA FILA: el inventario publicado es el de la última
 *       etapa cuya captura de pila/cajas SÍ está escrita (por display: celda vacía ≠ 0
 *       escrito). Las etapas recién cerradas sin captura todavía ya no publican ceros.
 *       Nuevos campos: inventory_stage, inventory_day, inventory_stale (true si hay
 *       etapas más nuevas que la última captura).
 *  v9.3.2 RÁPIDO Y TOLERANTE: (1) probe barato — antes de leer el STATUS_LOG completo del
 *       board solo mira la columna G de sus últimas filas; sin turnos ahí, no lee nada más
 *       y cachea el resultado 5 min (el ?action=status vuelve a su velocidad normal).
 *       (2) El STATUS_LOG del board puede venir SIN fila de encabezados (layout fijo
 *       Timestamp/Date/Hour/Pad/Status/Count/Shift): se detecta y se lee igual.
 *  v9.3.1 CERO MANUAL: si la hoja status del Hub aún no trae columna shift, el API detecta
 *       el IMPORTRANGE de esa hoja, abre el STATUS_LOG del BOARD y lo lee DIRECTO (con su
 *       columna Shift del StatusTracker v2). No hay que tocar ninguna fórmula del Hub.
 *  v9.3 CREW POR TURNO: si el Status Log trae columna "shift" (DAY/NIGHT/COVERING por
 *       driver-fila), cada pad publica sbrk = {DAY:{status:n},NIGHT:{...},COVER:{...}}
 *       del último snapshot — el Forecast arma los niveles de crew por turno EXACTOS
 *       (next shift = night/day reales + covering en ambos). Sin esa columna, sbrk=null
 *       y el portal usa su fallback. Nada más cambia.
 *  v9.2 SERIE POR HORA: nuevo campo hourly[] por día (hora del Delivered) con loads,
 *    drivers únicos, revenue, fsc, tons y promedios de ciclo (terminal/transit OW/offload)
 *    por hora — el portal lo usa para la vista por hora al filtrar UN día. El portfolio
 *    slim NO lo incluye (sin peso extra en el Resumen).
 *  v9.1 DESGLOSE: byDriver[] ahora trae revenue y fsc EXACTOS por driver (facturado =
 *    rate + FSC de cada carga suya) y byTerminal[] trae fsc por arenera — el portal los
 *    usa para el desglose rate + FSC en Roster y Sourcing. Sin cambios de estructura.
 *  v9.0 FSC (Fuel Surcharge): la hoja Rates acepta columna opcional `fsc` ($/ton por bracket
 *    y vigencia — hoy solo BW 21-30 nuevo a $1.18). Cada carga factura rate + FSC: el revenue
 *    reportado ES la suma, con desglose en totals.revenue_base / totals.revenue_fsc y
 *    daily[].revenue_fsc. Pozos/tarifas sin fsc: cero cambios. diag.fsc_total audita.
 *  v8.9 ALMACÉN: respaldo automático Drive → pestaña _SNAP_CACHE del Hub si faltan permisos.
 *  + PORTAFOLIO: nuevo endpoint ?action=portfolio — el Resumen completo en UNA llamada
 *    (paquete ligero guardado en Drive y regenerado por el trigger cada 6 h). Arranque del
 *    portal sin importar cuántos pozos tenga el Registry.
 *  v8.7 EXPORT LIMPIO: corta las secciones de pie del reporte ("Transferred",
 *    "Load #/From Job/To Job", totales) que se contaban como cargas fantasma. diag.footer_rows_cut.
 *  v8.6 FIX: el match de terminales declaradas ahora es por SUBSTRING en ambos sentidos —
 *    "Nomad-Big Springs TX" cruza con "Nomad-Big Springs" del term_map (antes exigia igualdad
 *    exacta y marcaba falsos positivos).
 *  v8.5 ANTI-CONTAMINACION: detecta cargas cuya Terminal NO pertenece al pad (filas de otro job
 *    pegadas en el Loads Report) usando las terminales declaradas en Targets (term_map/terminals).
 *    Siempre las reporta en diag.foreign_terminals; las EXCLUYE de todas las metricas si Targets
 *    trae terminals_strict = TRUE. Caso real: 48 cargas de Bayswater dentro del workbook Fasken.
 *  v8.4 STATUS MATCH: log_match ahora es TOLERANTE — normaliza mayúsculas, guiones, puntos y
 *    espacios en ambos lados ("26. (BAYSWATER) - Far Country" cruza con "Bayswater - Far").
 *    + status.unmatched_wells: nombres del Status Log que no cruzaron ningún Registry, para
 *    depurar sin adivinar. Resuelve pads Live que no aparecian en Status Live.
 *  v8.3 AUDITORIA DE TARIFAS: cada dia emite daily[].rates = {tarifa: {loads,tons,revenue}} —
 *    el portal muestra el DESGLOSE real (ej. 1,719t @ $17.76 + 521t @ $19.00) en vez de un
 *    promedio ponderado que parecia una tarifa inventada. El dinero siempre fue exacto.
 *  v8.2 TARIFAS VERSIONADAS: la columna effective de la hoja Rates ahora es FUNCIONAL — cada
 *    carga se tarifica con la vigencia correcta segun su fecha Delivered. Aumentos de rate se
 *    registran como FILA NUEVA (mismo cliente/bracket, nuevo effective): el historico conserva
 *    su tarifa y lo nuevo toma la vigente. DNR: 17.76 hasta 07/21 · 19.00 desde 07/22/2026.
 *  v8.1 STAGES: stages_planned = Targets.total_stages (el DISEÑO manda) — el max de la columna
 *    "Total Stage" de la hoja es fragil (depende de filas precargadas: BC23N1 traia 464 vs 616
 *    de diseño) y queda como stages_sheet_max solo para auditoria.
 *  v8.0 RATES: alias TITAN→DNR en rateFor (el pad de Titan factura tarifa DNR sin renombrar
 *    el customer del Registry) + diag.rate_fallback: cualquier cliente SIN tarifa queda contado
 *    y visible en vez de facturar FASKEN en silencio.
 *  v7.9 STAGES: emite change_min (wireline/transition) por etapa — gap end(N)→start(N+1)
 *    recomputado con wrap de medianoche; null en pausas multi-dia; fallback a la columna
 *    solo en la ultima etapa. El portal evalua stage, wireline y stage+wl vs SU design.
 *  v7.8 VELOCIDAD: snapshot-si-fresco UNIVERSAL — pozos LIVE tambien se sirven desde snapshot
 *    cuando el workbook no ha cambiado (lastUpdated). Cargas de 20-60s bajan a ~1-2s; solo el
 *    primer request tras una edicion de dispatch recalcula. El trigger precalienta todos.
 *  v7.7 CONGELADOR: pozos Closed se sirven desde snapshot en Drive (~1-2s vs 20-60s), con
 *    auto-invalidación si editan el workbook. Correr UNA VEZ: instalarCongelador() (autorizar
 *    Drive) → trigger cada 6h precalienta todo. ?fresh=1 fuerza regeneración de un pozo.
 *  v7.6 ROSTER: identidad de driver unificada — "Ricardo Garcia JE" y "Ricardo Garcia MD" son
 *    la MISMA persona (sufijo de carrier al final del nombre). Clave = nombre sin sufijo;
 *    emite carriers:[...] + switched para trazar cambios de carrier en el pad.
 *  v7.5 STAGES: Day por DISPLAY VALUE (sin fantasma de TZ — las etapas de HOY ya aparecen en
 *    su dia real) + duracion recomputada de Start/End con wrap de medianoche (la hoja produce
 *    negativos tipo -21:17 al cruzar las 12am). TESTSTG() audita la data cruda.
 *  v7.4 STATUS: ACTIVE = Active·Pad·Well·Truck Stop·Waiting for Load·Terminal·Transit·Loading.
 *    Empty pasa a INACTIVE. Regla "Resting +2d": driver con Resting continuo >=48h se
 *    reclasifica a Inactive (racha real por driver — requiere columna driver en Status Log;
 *    si no existe, resting2d.supported=false y todo lo demas funciona igual).
 *  v7.3: breakdown crudo del ultimo snapshot por pad (brk) para chips del portal.
 *  v7.2 TONS ENTREGADAS = Σ Load Weight (col O del Load Report) ÷ 2000. Fuente única.
 *    · daily.tons ahora es SIEMPRE tons entregadas (loads) — Used Tons de Stages va aparte en tons_frac.
 *    · Filas Equipment/Generator (Load Weight ≤ 1000, típicamente "1") = asset move, NUNCA arena:
 *      ya no reciben el fallback de 21.8t ni inflan loads/tons/revenue.
 *    · diag trae tons_delivered y loads_skipped para auditar contra la hoja.
 *  v7.1: parsers de fecha/hora blindados (M/D · D/M · a.m./p.m.) + end_date (+1d).
 *  v7.0: lectura por DISPLAY VALUE — sin TZ, sin +17h30m fantasma. TESTDT() audita Downtimes. */
/***** MEDS · PropX Hub — API de datos vivos (v3) *****/

const CFG = {
  registrySheet:'Registry', ratesSheet:'Rates', statusSheet:'Status Log',
  tabs: { loads:'Loads Report', stages:'Stages', downtimes:'Downtimes', targets:'Targets' },
  tonsPerLoadFallback: 21.8,
  loadCapMin: 90,   // tope de min de CARGA productiva · lo que exceda = espera en fila (detención), no infla ciclo
  // Clasificación por KEYWORD (case-insensitive, por inclusión) — cubre variantes tipo "Truck Stop - Pilot".
  // ACTIVE = Active · Empty · Pad · Well · Truck Stop · Waiting for Load (definición operativa MEDS).
  activeStatuses: ['ACTIVE','PAD','WELL','TRUCK STOP','WAITING FOR LOAD','TERMINAL','TRANSIT','LOADING'],
  restingStatuses: ['RESTING'],        // el resto = Inactive (Empty · Truck Down · Didn't Report · Day Off · Home…)
  resting2dHours: 48,                  // Resting continuo >= estas horas -> Inactive:"Resting +2d" (requiere col. driver en Status Log)
  statusOnlyRegistry: true,            // Status Live: solo pads que crucen con log_match del Registry (tu HUB manda)
  snapshotFn: 'logStatusSnapshot',     // nombre de TU función que toma el snapshot horario (para ?action=snapshot / botón ▶ del portal)
  assetMarkers: ['ASSET','EQUIP','GENERATOR']      // respaldo — la regla principal: Load # que empieza con 'A' (A1, A2…) = asset
};

const API_VERSION='v11.2';

/* ═══ CONGELADOR DE CIERRES — automático, sin tocar Netlify ═══
 * Pozo Closed → su JSON se congela en Drive (carpeta MEDS_Snapshots) la primera vez que se pide
 * y se sirve congelado en ~1-2s (vs 20-60s de recalcular el workbook). Se AUTO-INVALIDA si alguien
 * edita el workbook después del cierre (lastUpdated del spreadsheet > fecha del snapshot → regenera).
 * ?fresh=1 fuerza regeneración manual. instalarCongelador() precalienta todos los cierres cada 6h. */
/* ═══════════ ALMACÉN DE SNAPSHOTS — con respaldo automático ═══════════
   Preferencia 1: carpeta en Drive (rápida, sin límites).
   Preferencia 2: pestaña OCULTA del propio Hub (_SNAP_CACHE) — usa el mismo permiso de Sheets
   con el que ya corre el script, así que funciona aunque el proyecto no tenga Drive autorizado.
   El cambio es automático: si Drive lanza error de permisos, se degrada sola y el congelador,
   el portafolio y los cierres siguen trabajando igual.                                      */
var _WBU_OFF=false; /* v10.8: Drive falló una vez en esta ejecución → no se reintenta por cada pozo */
function _wbUpdated(id){ if(!id||_WBU_OFF)return 0;
  try{ return DriveApp.getFileById(id).getLastUpdated().getTime(); }catch(e){ _WBU_OFF=true; return 0; } }
/* v10.8 · FIRMA DE CONTENIDO — detecta ediciones del workbook SIN Drive.
   MD5 de los VALORES de las 4 pestañas que lee getWell (Loads Report · Stages · Downtimes · Targets)
   + los campos del pozo en el Registry. Al calcular se toma de la MISMA lectura de getWell (sin
   carrera con ediciones a media corrida); para revisar se releen solo valores (1-3 s vs 20-60 s). */
const _SIG_RECENT=7*864e5;  // cierre RECIENTE: hasta 7 días después de end_date (la captura final sigue entrando)
const _SIG_REG=['well_id','name','customer','equipment','status','spreadsheet_id','sheet_name','log_match','start_date','end_date'];
var _SIG=null;              // buffer de firma: lo abre wellFrozen alrededor de getWell
function _md5(s){ return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5,String(s),Utilities.Charset.UTF_8)); }
function _sigTabs(reg){ return [reg.sheet_name||CFG.tabs.loads,CFG.tabs.stages,CFG.tabs.downtimes,CFG.tabs.targets]; }
function _sigTap(name,v){ if(_SIG&&_SIG.want[name]&&!(name in _SIG.p))_SIG.p[name]=v?_md5(JSON.stringify(v)):'-'; }
function _sigJoin(P,reg){
  return _md5(_sigTabs(reg).map(function(n){return n+'='+(P[n]||'-');}).join('|')
    +'|reg='+JSON.stringify(_SIG_REG.map(function(k){return reg[k]==null?'':reg[k];}))
    +'|rates='+_ratesSig(reg)); } /* v11.0: un cambio de rate/FSC con vigencia hacia atrás refresca el cierre */
var _RATES_MEMO=null;
function _ratesSig(reg){try{const R=_RATES_MEMO||(_RATES_MEMO=getRates());const k=_rateAlias(R,(reg&&reg.customer)||'FASKEN');
  return _md5(JSON.stringify([k,R[k]||R.FASKEN||[],R.ASSETS||[]]));}catch(_){return '-';}}
function _wbSigNow(reg){
  const ss=SpreadsheetApp.openById(reg.spreadsheet_id), P={};
  _sigTabs(reg).forEach(function(n){const sh=ss.getSheetByName(n); P[n]=sh?_md5(JSON.stringify(sh.getDataRange().getValues())):'-';});
  return _sigJoin(P,reg); }
function _recentClose(reg){ const e=reg&&reg.end_date?new Date(reg.end_date).getTime():0;
  return !(e>0)||Date.now()-e<_SIG_RECENT; }
// ¿El snapshot sigue sirviendo?  j = snapshot ya parseado · lite = portafolio (cierre viejo: ventana de 24 h sin revisar)
//  · Con Drive: exacto — última edición del workbook ≤ INICIO de la lectura del cálculo (t0).
//  · Sin Drive: <10 min sirve · Live >10 min recalcula · Closed: compara la FIRMA del contenido,
//    máx. cada 10 min si el cierre es reciente y cada 6 h si es viejo (marca en CacheService).
//    v10.7 le daba 24 h a ciegas a un cierre: State Scarab se quedó en 200/201 stages todo el día.
function _snapFresh(reg,s,closed,j,lite){
  if(!s||!j||!reg)return false;
  const sm=j.snapshot||{}, tPut=+s.time||0, t0=+sm.t0||tPut, age=Date.now()-tPut;
  if(j.diag&&j.diag.cross_pad&&j.diag.cross_pad.incomplete&&age>216e5&&(!closed||_recentClose(reg)))return false; /* v10.9: un vecino no abrió al calcular → reintenta a las 6 h (Live y cierres recientes) */
  const ssT=_wbUpdated(reg.spreadsheet_id);
  if(ssT){ if(!closed&&age>6e5)return false; /* v10.4: Live nunca > 10 min (lag de Drive / IMPORTRANGE) */
    return ssT<=t0; }
  if(age<6e5)return true;
  if(!closed)return false;
  const old=!_recentClose(reg);
  if(old&&(lite||!sm.sig)&&age<864e5)return true;   // cierre viejo: portafolio o snapshot ≤v10.7 sin firma
  if(!sm.sig)return false;                          // sin firma → se recalcula una vez para tenerla
  const C=CacheService.getScriptCache(), ck='sg:'+reg.well_id;
  try{ if(C.get(ck)===sm.sig)return true; }catch(_){}
  let now=''; try{ now=_wbSigNow(reg); }catch(e){ return old&&age<864e5; }
  if(now!==sm.sig)return false;
  try{ C.put(ck,sm.sig,old?21600:600); }catch(_){}
  return true; }
var _STORE_MODE=null;
function _storeMode(){
  if(_STORE_MODE)return _STORE_MODE;
  try{ DriveApp.getRootFolder(); _STORE_MODE='drive'; }
  catch(e){ _STORE_MODE='sheet'; Logger.log('Drive sin permiso → almacén en pestaña del Hub'); }
  return _STORE_MODE; }
const _SNAP_TAB='_SNAP_CACHE';
function _snapSheet(){
  const ss=SpreadsheetApp.getActive();
  let sh=ss.getSheetByName(_SNAP_TAB);
  if(!sh){ sh=ss.insertSheet(_SNAP_TAB); sh.getRange(1,1,1,4).setValues([['key','chunk','data','ts']]);
    try{sh.hideSheet();}catch(_){} }
  return sh; }
function _storeGet(name){
  if(_storeMode()==='drive'){
    try{ const it=_snapFolder().getFilesByName(name);
      if(!it.hasNext())return null; const f=it.next();
      return {text:f.getBlob().getDataAsString('UTF-8'), time:f.getLastUpdated().getTime()};
    }catch(e){ _STORE_MODE='sheet'; } }
  /* v10.8: solo la versión MÁS NUEVA de la llave (renglones duplicados de escrituras simultáneas ya
     no se mezclan) y solo SUS celdas de datos — antes se leía la pestaña completa (MB) por pozo. */
  try{ const sh=_snapSheet(), n=sh.getLastRow()-1; if(n<1)return null;
    const kb=sh.getRange(2,1,n,2).getValues(), ts=sh.getRange(2,4,n,1).getValues();
    const G={}; let best=-1;
    for(let i=0;i<n;i++){ if(String(kb[i][0])!==name)continue; const t=+ts[i][0]||0;
      (G[t]=G[t]||[]).push([+kb[i][1]||0,i]); if(t>best)best=t; }
    if(best<0)return null;
    const R=G[best]; let lo=n,hi=-1; R.forEach(function(r){if(r[1]<lo)lo=r[1]; if(r[1]>hi)hi=r[1];});
    const dat=sh.getRange(2+lo,3,hi-lo+1,1).getValues(), parts=[];
    R.forEach(function(r){const c=dat[r[1]-lo][0]; parts[r[0]]=String(c==null?'':c);});
    for(let k=0;k<parts.length;k++)if(parts[k]==null)return null;   // versión incompleta → se recalcula
    return {text:parts.join(''), time:best};
  }catch(e){ return null; } }
function _storePut(name,text){
  if(_storeMode()==='drive'){
    try{ const fo=_snapFolder(), it=fo.getFilesByName(name);
      if(it.hasNext())it.next().setContent(text); else fo.createFile(name,text,'application/json');
      return true;
    }catch(e){ _STORE_MODE='sheet'; } }
  /* v10.8: con CANDADO — dos pedidos simultáneos del mismo pozo dejaban la llave duplicada (y un
     borrado por índice viejo podía tocar renglones de otra llave). Solo se lee la columna de llaves. */
  const lk=LockService.getScriptLock(); let got=false; try{ got=lk.tryLock(20000); }catch(_){}
  if(!got){ Logger.log('storePut '+name+': ocupado (otra escritura en curso) — se omite'); return false; }
  try{ const sh=_snapSheet(), n=sh.getLastRow()-1;
    if(n>0){ const k=sh.getRange(2,1,n,1).getValues();
      for(let i=n-1;i>=0;){ if(String(k[i][0])!==name){i--;continue;}
        let j=i; while(j>0&&String(k[j-1][0])===name)j--;
        sh.deleteRows(2+j,i-j+1); i=j-1; } }
    const CH=45000, rows=[], now=Date.now();          // 45k < límite de 50k caracteres por celda
    for(let i=0;i<text.length;i+=CH) rows.push([name, rows.length, text.substr(i,CH), now]);
    if(rows.length) sh.getRange(sh.getLastRow()+1,1,rows.length,4).setValues(rows);
    SpreadsheetApp.flush();
    return true;
  }catch(e){ Logger.log('storePut '+name+': '+e); return false; }
  finally{ try{ lk.releaseLock(); }catch(_){} } }

function _snapFolder(){
  const P=PropertiesService.getScriptProperties();
  const fid=P.getProperty('SNAP_FOLDER_ID');
  if(fid){try{return DriveApp.getFolderById(fid);}catch(_){}}
  const it=DriveApp.getFoldersByName('MEDS_Snapshots');
  const f=it.hasNext()?it.next():DriveApp.createFolder('MEDS_Snapshots');
  P.setProperty('SNAP_FOLDER_ID',f.getId());
  return f;}
function _snapGet(id){ return _storeGet('well_'+id+'.json'); }
function _snapPut(id,text){ _storePut('well_'+id+'.json',text); }
function wellFrozen(id,fresh,lite){ return _regScope(function(){ return _wellFrozen(id,fresh,lite); }); }
function _wellFrozen(id,fresh,lite){
  let reg=null; try{reg=(getRegistry().wells||[]).filter(function(w){return String(w.well_id)===String(id);})[0];}catch(_){ }
  const closed=reg&&String(reg.status).toLowerCase()==='closed';
  // v7.8 UNIVERSAL: sirve snapshot si el workbook NO cambio desde el ultimo calculo — valido
  // tambien para pozos LIVE (entre ediciones de dispatch, el snapshot ES el dato actual).
  // Live: de 20-60s por request a ~1-2s; solo el PRIMER request tras una edicion recalcula.
  if(!fresh&&reg&&reg.spreadsheet_id){
    const s=_snapGet(id); let j=null;
    if(s&&s.text){ try{ j=JSON.parse(s.text); }catch(_){ j=null; /* corrupto → regenerar */ } }
    /* v10.5: un Live calculado por otra versión NO se sirve (reglas de día/lectura cambian) */
    if(j&&(closed||j.api_version===API_VERSION)&&_snapFresh(reg,s,closed,j,lite))return j;}
  /* v10.8: t0 = INICIO de la lectura · la firma sale de los mismos valores que usa getWell */
  const t0=Date.now(); let SG=null;
  if(reg){ _SIG={want:{},p:{}}; _sigTabs(reg).forEach(function(n){_SIG.want[n]=1;}); }
  let w; try{ w=getWell(id); }finally{ SG=_SIG; _SIG=null; }
  if(w&&!w.error){
    let sig=''; try{ if(SG&&reg)sig=_sigJoin(SG.p,reg); }catch(_){}
    w.snapshot={frozen:true,at:new Date().toISOString(),live:!closed,t0:t0,sig:sig};
    _snapPut(id,JSON.stringify(w));
    try{ if(sig)CacheService.getScriptCache().put('sg:'+id,sig,_recentClose(reg)?600:21600); }catch(_){} }
  return w;}
/** ▶ CONGELAR AHORA — corre una vez para precalentar todos los cierres (y cada 6h vía trigger). */
function congelarCierres(){ return _regScope(_congelarCierres); }
function _congelarCierres(){
  const reg=(getRegistry().wells||[]).filter(function(w){return !!w.spreadsheet_id;}); // v7.8: precalienta TODOS (Live incluido)
  let hechos=0,frescos=0,pend=0; const t0=Date.now();
  reg.forEach(function(w){
    if(Date.now()-t0>270000){pend++;return;} /* v10.8: el presupuesto cubre también la revisión de firma */
    const s=_snapGet(w.well_id); let j=null;
    try{ j=(s&&s.text)?JSON.parse(s.text):null; }catch(_){ j=null; }
    const curV=!!(j&&j.api_version===API_VERSION);
    if(curV&&_snapFresh(w,s,String(w.status).toLowerCase()==='closed',j,false)){frescos++;return;}
    if(Date.now()-t0>270000){pend++;return;} /* v10.5: presupuesto 4.5 min — la siguiente corrida sigue */
    const wj=wellFrozen(w.well_id,true); if(wj&&!wj.error)hechos++;});
  if(pend)Logger.log('congelarCierres: '+pend+' pozos pendientes para la siguiente corrida');
  let _pf=0; try{ _pf=buildPortfolio().count; }catch(e){ Logger.log('portfolio: '+e); } // el Resumen queda precocido
  Logger.log('congelarCierres: '+hechos+' regenerados · '+frescos+' ya frescos · '+reg.length+' pozos · portafolio: '+_pf);
  return {ok:true,regenerados:hechos,frescos:frescos,total:reg.length,portafolio:_pf};}
/** ▶ INSTALAR — corre UNA sola vez: crea el trigger cada 6h (idempotente). */
function instalarCongelador(){
  ScriptApp.getProjectTriggers().forEach(function(t){if(t.getHandlerFunction()==='congelarCierres')ScriptApp.deleteTrigger(t);});
  ScriptApp.newTrigger('congelarCierres').timeBased().everyHours(6).create();
  congelarCierres();
  return 'Congelador instalado: cada 6h + precalentado inicial.';}

/* ═══════════ PORTAFOLIO — una sola llamada para TODO el Resumen ═══════════
   Antes el portal pedía un pozo a la vez (19 ejecuciones pesadas por arranque → colas y 404).
   Ahora este endpoint arma un paquete LIGERO (solo lo que el Resumen necesita: ~7 KB por pozo
   en vez de 72 KB) y lo guarda en Drive. El trigger lo regenera junto con los cierres, así que
   el portal siempre recibe algo ya construido: 1 petición, 1-2 s, sin importar cuántos pozos haya. */
function _portfolioSlim(w,r){
  if(!w||w.error)return null;
  return { id:r.well_id, name:w.name||r.name, customer:w.customer||r.customer, status:r.status,
    equipment:r.equipment, area:r.area, start:r.start_date, end:r.end_date,
    totals:w.totals, targets:w.targets, daily:w.daily, byTerminal:w.byTerminal,
    cycleDaily:w.cycleDaily, downtimeEvents:w.downtimeEvents, assets:w.assets, slim:true };
}
function buildPortfolio(){ return _regScope(_buildPortfolio); }
function _buildPortfolio(){
  const reg=(getRegistry().wells||[]); const out=[]; let ok=0,fail=0;
  reg.forEach(function(r){ if(!r.spreadsheet_id)return;
    try{ const s=_portfolioSlim(wellFrozen(r.well_id,false,true),r);
      if(s){out.push(s);ok++;} else fail++; }catch(e){fail++;} });
  const pack={ generated:new Date().toISOString(), api_version:API_VERSION, store:_storeMode(), count:out.length, failed:fail, wells:out };
  try{ _storePut('portfolio.json', JSON.stringify(pack)); }catch(e){ Logger.log('portfolio save: '+e); }
  Logger.log('buildPortfolio: '+ok+' pozos · '+fail+' fallidos');
  return pack;
}
function getPortfolio(fresh){
  if(!fresh){ try{ const s=_storeGet('portfolio.json'); if(s&&s.text){const P=JSON.parse(s.text);
      /* v10.5: misma versión y, si hay pozos Live, menos de 15 min — si no, se reconstruye.
         v10.8: un cierre RECIENTE (≤7 días de end_date) cuenta como Live (su captura final sigue
         entrando) y sin pozos vivos el paquete ya no se reusa para siempre: máx. 6 h. */
      const live=(P.wells||[]).some(function(w){return String(w.status||'').toLowerCase()!=='closed'||_recentClose({end_date:w.end});});
      const age=Date.now()-new Date(P.generated||0).getTime();
      if(P.api_version===API_VERSION&&age<(live?9e5:216e5))return P;}}catch(e){} }
  return buildPortfolio();
}

/* ── v9.5 · caché comprimida (gzip+base64, chunked ≤5×98KB) ── */
const _CK={well:75,status:60,portfolio:120};
function _cPut(key,obj,ttl){try{
  const raw=JSON.stringify(obj);
  const gz=Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(raw,'application/json')).getBytes());
  const C=CacheService.getScriptCache();
  if(gz.length<=98000){C.put(key,gz,ttl);C.remove(key+':n');}
  else{const n=Math.ceil(gz.length/98000);
    if(n>5)return; /* libro gigante: mejor sin caché que a medias */
    const kv={};for(let i=0;i<n;i++)kv[key+':'+i]=gz.substr(i*98000,98000);
    kv[key+':n']=String(n);C.putAll(kv,ttl);C.remove(key);}
}catch(_){}}
function _cGet(key){try{
  const C=CacheService.getScriptCache();
  let gz=C.get(key);
  if(!gz){const n=+(C.get(key+':n')||0);if(!n)return null;
    const ks=[];for(let i=0;i<n;i++)ks.push(key+':'+i);
    const parts=C.getAll(ks);gz='';
    for(let i=0;i<n;i++){const p=parts[key+':'+i];if(!p)return null;gz+=p;}}
  const raw=Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(gz),'application/x-gzip')).getDataAsString();
  return JSON.parse(raw);
}catch(_){return null;}}
/* ══════════ v10.0 · AUTH — usuarios, login y token (hoja "Users" del Hub) ══════════
 *  Roles: admin (todo + Access) · operative (todo el dashboard) · customer (solo Forecast).
 *  El password viaja SOLO por HTTPS como parámetro; se guarda hash salteado (SHA-256 ×800).
 *  Token = payload.b64 + '.' + HMAC-SHA256(payload, AUTH_SECRET) · vigencia 7 días.     */
const AUTH_ROLES=['admin','operative','customer'];
function _aB64(b){return Utilities.base64EncodeWebSafe(b);}
function _aHash(pass,salt){let b=Utilities.newBlob(String(salt)+'\u0000'+String(pass),'application/octet-stream').getBytes();
  for(let i=0;i<800;i++)b=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,b);
  return _aB64(b);}
function _aSecret(){const P=PropertiesService.getScriptProperties();
  let s=P.getProperty('AUTH_SECRET');
  if(!s){s=Utilities.getUuid()+'.'+Utilities.getUuid();P.setProperty('AUTH_SECRET',s);}
  return s;}
function _aSheet(){const hub=SpreadsheetApp.getActive();
  let sh=hub.getSheetByName('Users');
  if(!sh){sh=hub.insertSheet('Users');
    sh.appendRow(['email','name','role','status','salt','hash','created','last_login','note']);
    try{sh.setFrozenRows(1);}catch(_){}}
  return sh;}
function _aAll(){const v=_aSheet().getDataRange().getValues();const out=[];
  for(let i=1;i<v.length;i++){const em=String(v[i][0]||'').trim().toLowerCase();if(!em)continue;
    out.push({row:i+1,email:em,name:String(v[i][1]||''),role:String(v[i][2]||'').toLowerCase(),
      status:String(v[i][3]||'').toLowerCase(),salt:String(v[i][4]||''),hash:String(v[i][5]||''),
      created:String(v[i][6]||''),last:String(v[i][7]||''),note:String(v[i][8]||'')});}
  return out;}
function _aIdxBust(){try{CacheService.getScriptCache().remove('au1');}catch(_){}}
function _aIdx(){ /* índice 120 s: email → rol/estado + candado activo (hay admin activo) */
  try{const c=CacheService.getScriptCache().get('au1');if(c)return JSON.parse(c);}catch(_){}
  const m={};let on=false;
  _aAll().forEach(function(u){m[u.email]={r:u.role,s:u.status};
    if(u.role==='admin'&&u.status==='active')on=true;});
  const idx={on:on,map:m};
  try{CacheService.getScriptCache().put('au1',JSON.stringify(idx),120);}catch(_){}
  return idx;}
function _aToken(u){const pl=_aB64(Utilities.newBlob(JSON.stringify({e:u.email,r:u.role,x:Date.now()+7*864e5})).getBytes());
  const sg=_aB64(Utilities.computeHmacSha256Signature(pl,_aSecret()));
  return pl+'.'+sg;}
function _aVerify(tk){try{
  if(!tk)return null;const p=String(tk).split('.');if(p.length!==2)return null;
  const sg=_aB64(Utilities.computeHmacSha256Signature(p[0],_aSecret()));
  if(sg!==p[1])return null;
  const pl=JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(p[0])).getDataAsString());
  if(!(pl&&pl.e&&pl.x>Date.now()))return null;
  return pl;}catch(_){return null;}}
function _aGate(e,a){ /* null = pasa · objeto = respuesta de error (se evalúa ANTES de la caché) */
  const DATA={well:1,status:1,portfolio:1,registry:1,snapshot:1};
  if(!DATA[a])return null;
  try{if(PropertiesService.getScriptProperties().getProperty('AUTH_OFF')==='1')return null;}catch(_){}
  let idx;try{idx=_aIdx();}catch(_){return null;}
  if(!idx.on)return null;
  const v=_aVerify(e&&e.parameter&&e.parameter.tk);
  if(!v)return {error:'auth_required',api_version:API_VERSION};
  const u=idx.map[String(v.e).toLowerCase()];
  if(!u||u.s!=='active')return {error:'auth_required',api_version:API_VERSION};
  return null;}
function _aAdmin(e){const v=_aVerify(e&&e.parameter&&e.parameter.tk);
  if(!v)return null;
  const me=_aAll().filter(function(u){return u.email===String(v.e).toLowerCase();})[0];
  return (me&&me.role==='admin'&&me.status==='active')?me:null;}
function _aLogin(e){
  const em=String((e&&e.parameter&&e.parameter.email)||'').trim().toLowerCase();
  const pw=String((e&&e.parameter&&e.parameter.pass)||'');
  const all=_aAll();
  if(!all.some(function(u){return u.role==='admin'&&u.status==='active';}))return {error:'no_users'};
  const u=all.filter(function(x){return x.email===em;})[0];
  Utilities.sleep(250);
  if(!u||_aHash(pw,u.salt)!==u.hash)return {error:'bad_credentials'};
  if(u.status==='pending'||u.role==='pending')return {error:'pending_approval'};
  if(u.status!=='active')return {error:'account_disabled'};
  try{_aSheet().getRange(u.row,8).setValue(new Date().toISOString());}catch(_){}
  return {ok:true,token:_aToken(u),role:u.role,name:u.name,email:u.email,exp:Date.now()+7*864e5};}
function _aRegister(e){
  const nm=String((e&&e.parameter&&e.parameter.name)||'').trim().slice(0,60);
  const em=String((e&&e.parameter&&e.parameter.email)||'').trim().toLowerCase();
  const pw=String((e&&e.parameter&&e.parameter.pass)||'');
  if(!nm||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)||pw.length<8)return {error:'bad_request'};
  const lock=LockService.getScriptLock();try{lock.waitLock(5000);}catch(_){return {error:'busy'};}
  try{const all=_aAll();
    if(all.length>500)return {error:'user_limit'};
    if(all.some(function(x){return x.email===em;}))return {error:'exists'};
    const salt=Utilities.getUuid();
    _aSheet().appendRow([em,nm,'pending','pending',salt,_aHash(pw,salt),new Date().toISOString(),'','self-register']);
    _aIdxBust();return {ok:true,pending:true};
  }finally{try{lock.releaseLock();}catch(_){}}}
function _aBootstrap(e){
  const all=_aAll();
  if(all.some(function(u){return u.role==='admin';}))return {error:'already_setup'};
  const nm=String((e&&e.parameter&&e.parameter.name)||'Admin').trim().slice(0,60);
  const em=String((e&&e.parameter&&e.parameter.email)||'').trim().toLowerCase();
  const pw=String((e&&e.parameter&&e.parameter.pass)||'');
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)||pw.length<8)return {error:'bad_request'};
  const salt=Utilities.getUuid();
  _aSheet().appendRow([em,nm,'admin','active',salt,_aHash(pw,salt),new Date().toISOString(),'','bootstrap']);
  _aIdxBust();
  return {ok:true,token:_aToken({email:em,role:'admin'}),role:'admin',name:nm,email:em,exp:Date.now()+7*864e5};}
function _aMe(e){const v=_aVerify(e&&e.parameter&&e.parameter.tk);
  if(!v)return {error:'auth_required'};
  const u=_aIdx().map[String(v.e).toLowerCase()];
  if(!u||u.s!=='active')return {error:'auth_required'};
  return {ok:true,role:u.r,email:v.e};}
function _aChpass(e){const v=_aVerify(e&&e.parameter&&e.parameter.tk);
  if(!v)return {error:'auth_required'};
  const u=_aAll().filter(function(x){return x.email===String(v.e).toLowerCase();})[0];
  if(!u||u.status!=='active')return {error:'auth_required'};
  const op=String((e&&e.parameter&&e.parameter.old)||'');
  const np=String((e&&e.parameter&&e.parameter.pass)||'');
  if(_aHash(op,u.salt)!==u.hash)return {error:'bad_credentials'};
  if(np.length<8)return {error:'bad_request'};
  const salt=Utilities.getUuid();
  _aSheet().getRange(u.row,5,1,2).setValues([[salt,_aHash(np,salt)]]);
  _aIdxBust();return {ok:true};}
function _aUsersList(e){if(!_aAdmin(e))return {error:'forbidden'};
  return {ok:true,users:_aAll().map(function(u){return {email:u.email,name:u.name,role:u.role,status:u.status,created:u.created,last:u.last,note:u.note};})};}
function _aUserSet(e){const me=_aAdmin(e);if(!me)return {error:'forbidden'};
  const p=(e&&e.parameter)||{};const op=String(p.op||'');
  const em=String(p.email||'').trim().toLowerCase();
  const sh=_aSheet();const all=_aAll();
  const admins=all.filter(function(u){return u.role==='admin'&&u.status==='active';}).length;
  const u=all.filter(function(x){return x.email===em;})[0];
  const lastAdmin=!!(u&&u.role==='admin'&&u.status==='active'&&admins<=1);
  if(op==='create'){
    if(all.some(function(x){return x.email===em;}))return {error:'exists'};
    const rl=String(p.role||'operative').toLowerCase();
    if(AUTH_ROLES.indexOf(rl)<0)return {error:'bad_request'};
    const pw=String(p.pass||'');if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)||pw.length<8)return {error:'bad_request'};
    const salt=Utilities.getUuid();
    sh.appendRow([em,String(p.name||'').slice(0,60),rl,'active',salt,_aHash(pw,salt),new Date().toISOString(),'','created by '+me.email]);
    _aIdxBust();return {ok:true};}
  if(!u)return {error:'not_found'};
  if(op==='role'){const rl=String(p.role||'').toLowerCase();
    if(AUTH_ROLES.indexOf(rl)<0)return {error:'bad_request'};
    if(lastAdmin&&rl!=='admin')return {error:'last_admin'};
    sh.getRange(u.row,3,1,2).setValues([[rl,'active']]);_aIdxBust();return {ok:true};}
  if(op==='status'){const st=String(p.status||'').toLowerCase();
    if(st!=='active'&&st!=='disabled')return {error:'bad_request'};
    if(lastAdmin&&st!=='active')return {error:'last_admin'};
    sh.getRange(u.row,4).setValue(st);_aIdxBust();return {ok:true};}
  if(op==='resetpass'){const pw=String(p.pass||'');if(pw.length<8)return {error:'bad_request'};
    const salt=Utilities.getUuid();
    sh.getRange(u.row,5,1,2).setValues([[salt,_aHash(pw,salt)]]);_aIdxBust();return {ok:true};}
  if(op==='delete'){if(lastAdmin)return {error:'last_admin'};
    sh.deleteRow(u.row);_aIdxBust();return {ok:true};}
  return {error:'bad_request'};}
function doGet(e){
  const a=(e&&e.parameter&&e.parameter.action)||'registry';
  const fresh=!!(e&&e.parameter&&e.parameter.fresh);
  /* v10.0: el candado va ANTES de la caché — sin token válido no se sirve ni cache */
  const AERR=_aGate(e,a);
  if(AERR)return ContentService.createTextOutput(JSON.stringify(AERR)).setMimeType(ContentService.MimeType.JSON);
  const ck=(a==='well')?('w5:'+API_VERSION+':'+((e&&e.parameter&&e.parameter.id)||''))   /* v10.5: llave por versión */
          :(a==='status')?('s5:'+API_VERSION+':'+((e&&e.parameter&&e.parameter.days)||''))
          :(a==='portfolio')?('p5:'+API_VERSION):null;
  if(ck&&!fresh){const hit=_cGet(ck);
    if(hit&&typeof hit==='object'){hit.api_version=API_VERSION;hit.action_received=a;hit.served='cache';
      return ContentService.createTextOutput(JSON.stringify(hit)).setMimeType(ContentService.MimeType.JSON);}}
  let out;
  try{
    out=(a==='ping')?{ok:true,time:new Date().toISOString()}
       :(a==='login')?_aLogin(e)
       :(a==='register')?_aRegister(e)
       :(a==='bootstrap_admin')?_aBootstrap(e)
       :(a==='me')?_aMe(e)
       :(a==='chpass')?_aChpass(e)
       :(a==='users_list')?_aUsersList(e)
       :(a==='user_set')?_aUserSet(e)
       :(a==='snapshot')?runSnapshot()
       :(a==='portfolio')?getPortfolio(e&&e.parameter&&e.parameter.fresh)
       :(a==='well')?wellFrozen(e&&e.parameter&&e.parameter.id, e&&e.parameter&&e.parameter.fresh)
       :(a==='status')?getStatus(e&&e.parameter&&e.parameter.days)
       :getRegistry();
  }catch(err){ out={error:String(err)}; }
  if(out&&typeof out==='object')out.api_version=API_VERSION;
  out.action_received=a;
  if(ck&&out&&!out.error)_cPut(ck,out,_CK[a]);
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function runSnapshot(){
  try{
    const g=(typeof globalThis!=='undefined')?globalThis:this;
    const f=g[CFG.snapshotFn];
    if(typeof f!=='function') return {ok:false,error:'No existe la función "'+CFG.snapshotFn+'". Ajusta CFG.snapshotFn al nombre real de tu función de snapshot horario.'};
    f();
    return {ok:true,ran:CFG.snapshotFn,time:new Date().toISOString()};
  }catch(err){return {ok:false,error:String(err)};}
}

/** ▶ Corre esta función desde el editor (selecciónala arriba y presiona Ejecutar).
 *  Luego abre "Registro de ejecución" — te dice TODO sin usar URLs. */
function TEST(){
  Logger.log('API '+API_VERSION);
  const r=getRegistry();
  Logger.log('registry → '+r.count+' pozo(s): '+(r.wells||[]).map(function(w){return w.well_id;}).join(', '));
  if(r.wells&&r.wells.length){
    const id=r.wells[0].well_id;
    const w=getWell(id);
    if(w.error){Logger.log('getWell('+id+') ERROR → '+w.error);return;}
    Logger.log('getWell('+id+') → loads:'+(w.totals?w.totals.loads:'?')+' | daily:'+(w.daily?w.daily.length:0)+' días | drivers:'+(w.byDriver?w.byDriver.length:0)+' | stages:'+(w.stages?w.stages.length:0)+' | assets:'+(w.assets?w.assets.moves:0));
    if(w.diag)Logger.log('diag → archivo: "'+w.diag.file+'" | pestañas: ['+w.diag.sheets.join(' | ')+'] | tab loads buscada: "'+w.diag.loads_tab+'" encontrada:'+w.diag.loads_found+' filas:'+w.diag.loads_rows+' | targets:'+w.diag.targets_keys+' llaves | stages_rows:'+w.diag.stages_rows);
  }
}

/** ▶ DIAGNÓSTICO STAGES — selecciona TESTSTG, Ejecutar, abre "Registro de ejecución".
 *  Imprime Day (display→ISO) y la duración recomputada de Start/End vs la columna de la hoja. */
function TESTSTG(){
  const reg=getRegistry().wells; if(!reg.length){Logger.log('sin pozos');return;}
  reg.forEach(function(w){ if(!w.spreadsheet_id)return; let ss; try{ss=SpreadsheetApp.openById(w.spreadsheet_id);}catch(e){return;}
    const S=readTabD(ss,CFG.tabs.stages,'Stage #'); if(!S){Logger.log(w.well_id+': sin Stages');return;}
    const si=colmap(S.H,['Well','Stage #','Stage Start Time','Stage End Time','Stage Duration','Day','Used Tons']);
    Logger.log('== '+w.well_id+' == ultimas 12 filas con Day:');
    let shown=0;
    for(let i=S.rows.length-1;i>=0&&shown<12;i--){const rd=S.disp[i];
      const dD=si.Day>=0?rd[si.Day]:''; if(!String(dD).trim())continue; shown++;
      const iso=dateOfDisp(dD), sT=timeOfDisp(rd[si['Stage Start Time']]), eT=timeOfDisp(rd[si['Stage End Time']]);
      let dm=null; if(sT&&eT){const a=(+sT.slice(0,2))*60+(+sT.slice(3)),b=(+eT.slice(0,2))*60+(+eT.slice(3));dm=b-a;if(dm<0)dm+=1440;}
      Logger.log('  '+String(rd[si.Well]||'')+' stg'+String(rd[si['Stage #']]||'')+' Day="'+dD+'"→'+iso+' | '+sT+'→'+eT+' = '+(dm!=null?(Math.floor(dm/60)+'h'+('0'+dm%60).slice(-2)):'—')+' (col: "'+String(rd[si['Stage Duration']]||'')+'")');}
  });
}

/** ▶ DIAGNÓSTICO DOWNTIMES — selecciona TESTDT arriba, Ejecutar, abre "Registro de ejecución".
 *  Imprime, por pozo, el TEXTO CRUDO de START/END/TOTAL HOURS de cada celda y los minutos parseados.
 *  Si TOTAL dice "0:57:00" → era fantasma de lectura (ya arreglado). Si dice "18:27:00" → dato en la hoja. */
function TESTDT(){
  const reg=getRegistry().wells; if(!reg.length){Logger.log('sin pozos en Registry');return;}
  reg.forEach(function(w){ if(!w.spreadsheet_id)return; let ss; try{ss=SpreadsheetApp.openById(w.spreadsheet_id);}catch(e){Logger.log(w.well_id+': no abre workbook');return;}
    const D=readTabD(ss,CFG.tabs.downtimes,'DUE TO (RESPONSIBLE)'); if(!D){Logger.log(w.well_id+': sin pestaña Downtimes o sin header');return;}
    const di=colmap(D.H,['DUE TO (RESPONSIBLE)','TOTAL HOURS','START','END','DATE','WHY?']);
    if(di.START<0){const s=D.H.findIndex(h=>/start\s*date/i.test(String(h)));if(s>=0)di.START=s;}
    if(di.END<0){const e=D.H.findIndex(h=>/end\s*date/i.test(String(h)));if(e>=0)di.END=e;}
    Logger.log('── '+w.well_id+' · '+ss.getName()+' — '+D.rows.length+' downtimes ──');
    let tot=0;
    for(let i=0;i<Math.min(D.rows.length,40);i++){const rd=D.disp[i];
      const totDisp=di['TOTAL HOURS']>=0?rd[di['TOTAL HOURS']]:'', mn=hmsToMin(totDisp); tot+=mn;
      Logger.log('  '+String(rd[di['WHY?']]||'').slice(0,24).padEnd(24)+
        ' | START="'+(di.START>=0?rd[di.START]:'')+'" END="'+(di.END>=0?rd[di.END]:'')+'"'+
        ' | TOTAL="'+totDisp+'" → '+(mn/60).toFixed(2)+'h');}
    Logger.log('  Σ TOTAL (display) = '+(tot/60).toFixed(1)+'h en '+D.rows.length+' eventos'); });
}

// ---------- Hub: Registry / Rates ----------
var _REG_MEMO=null; /* v10.8: memo SOLO dentro de un lote (portafolio · congelador · un pozo) — se leía 2 veces por pozo */
function getRegistry(){
  if(_REG_MEMO)return _REG_MEMO;
  const v=SpreadsheetApp.getActive().getSheetByName(CFG.registrySheet).getDataRange().getValues();
  const h=findHeader(v,'well_id'); const H=v[h].map(x=>String(x).trim());
  const wells=v.slice(h+1).filter(r=>r[0]).map(r=>{const o={};H.forEach((k,i)=>o[k]=r[i]);return o;});
  return { generated:new Date().toISOString(), count:wells.length, wells };
}
function _regScope(fn){ const own=!_REG_MEMO; if(own){ try{ _REG_MEMO=getRegistry(); }catch(_){ _REG_MEMO=null; } }
  try{ return fn(); }finally{ if(own)_REG_MEMO=null; } }
function getRates(){
  const sh=SpreadsheetApp.getActive().getSheetByName(CFG.ratesSheet); if(!sh) return {};
  const v=sh.getDataRange().getValues(); const h=findHeader(v,'customer'); if(h<0) return {};
  const H=v[h].map(x=>String(x).trim().toLowerCase()); const ix=n=>H.indexOf(n);
  const iC=ix('customer'), iLo=ix('mile_min')>=0?ix('mile_min'):1, iHi=ix('mile_max')>=0?ix('mile_max'):2,
        iB=ix('rate_billing')>=0?ix('rate_billing'):3,
        iP=ix('pay_omma')>=0?ix('pay_omma'):(ix('filial_85')>=0?ix('filial_85'):4), iU=ix('unit'), iE=ix('effective'), iF=ix('fsc');
  const out={};
  for(let r=h+1;r<v.length;r++){const row=v[r]; if(!row[iC])continue;
    const c=String(row[iC]).toUpperCase().trim(); const bill=num(row[iB]); if(!bill)continue;
    (out[c]=out[c]||[]).push({lo:num(row[iLo]),hi:num(row[iHi]),bill:bill,pay:num(row[iP]),unit:iU>=0?String(row[iU]||'ton').toLowerCase():'ton',eff:iE>=0?_effISO(row[iE]):'',fsc:iF>=0?num(row[iF]):0});}
  return out;
}
function _effISO(v){ if(v==null||v==='')return '';
  if(v instanceof Date){const y=v.getFullYear(); return y>1990?Utilities.formatDate(v,Session.getScriptTimeZone(),'yyyy-MM-dd'):'';}
  const t=String(v).trim();
  let m=t.match(/(\d{4})-(\d{2})-(\d{2})/); if(m)return m[0];
  m=t.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if(m){let a=+m[1],b=+m[2],y=m[3]; if(y.length===2)y='20'+y; let mo=a,da=b; if(a>12&&b<=12){mo=b;da=a;}
    return y+'-'+('0'+mo).slice(-2)+'-'+('0'+da).slice(-2);}
  return ''; } // '2025' u otro texto = tarifa base sin vigencia (aplica desde siempre)
var RATE_MISS={}; // clientes sin tarifa detectados en el ultimo calculo (visibles en diag.rate_fallback)
/* v11.0: alias de cliente → llave de Rates (misma regla que siempre usó rateFor; la firma la reusa) */
function _rateAlias(rates,client){
  let key=(client||'').toUpperCase().trim();
  if(!rates[key]){
    if(key.indexOf('FASKEN')>=0)key='FASKEN';
    else if(key.indexOf('OXY')>=0)key='OXY';
    else if(key.indexOf('TITAN')>=0||/(^|[^A-Z])DNR([^A-Z]|$)/.test(key))key='DNR'; // v8.0: pad Titan factura tarifa DNR
    else if(key.indexOf('HIGH')>=0||/(^|[^A-Z])HP([^A-Z]|$)/.test(key))key='HP';
    else if(key.indexOf('BAYSWATER')>=0||/(^|[^A-Z])BW([^A-Z]|$)/.test(key))key='BW';
    else if(key.indexOf('ASSET')>=0)key='ASSETS';
  }
  return key;}
function rateFor(rates,client,miles,dateISO){
  const key=_rateAlias(rates,client);
  if(!rates[key]){RATE_MISS[key||'(vacio)']=(RATE_MISS[key||'(vacio)']||0)+1;} // fallback = GRITAR, no callar
  const t=rates[key]||rates.FASKEN||[];
  if(!t.length)return {bill:0,pay:0,unit:'ton'};
  // 1) candidatos por bracket de millas (fuera de rango → el bracket más alto, comportamiento histórico)
  let cand=t.filter(function(b){return miles>=b.lo&&miles<=b.hi;});
  if(!cand.length){const mx=Math.max.apply(null,t.map(function(b){return b.hi||0;}));cand=t.filter(function(b){return (b.hi||0)===mx;});}
  if(!cand.length)return {bill:0,pay:0,unit:'ton'};
  if(cand.length===1)return cand[0];
  // 2) VIGENCIAS: la fila con effective mas reciente que sea <= fecha de la carga.
  //    Carga anterior a toda vigencia → la mas antigua (respeta el record historico).
  //    Sin fecha de carga → la vigente actual. eff vacio = tarifa base (aplica siempre).
  cand.sort(function(a,b){return String(a.eff||'').localeCompare(String(b.eff||''));});
  const d=String(dateISO||'').slice(0,10);
  if(!d)return cand[cand.length-1];
  const ok=cand.filter(function(b){return !b.eff||b.eff<=d;});
  return ok.length?ok[ok.length-1]:cand[0];
}

// ---------- Detalle de pozo ----------
// Terminales DECLARADAS del pad (Targets: "terminals" explícito, o las llaves de term_map).
// Sirve para detectar/excluir cargas de OTRO pad pegadas por error en el Loads Report.
function declaredTerms(T){
  const out=[];
  const push=s=>{const v=_mnorm(s); if(v&&out.indexOf(v)<0)out.push(v);};
  if(T&&T.terminals)String(T.terminals).split(/[;,\n]/).forEach(push);
  if(T&&T.term_map)String(T.term_map).split(/[;\n]/).forEach(function(p){const kv=String(p).split('=');if(kv[0])push(kv[0]);});
  return out;
}
/* v10.9: match tolerante de una terminal contra una lista normalizada (guiones Unicode, sufijo "TX"…) ·
   una terminal que se normaliza a vacío ("-", "#") cuenta como conocida, igual que en v10.8 */
function _termKnown(term,list){const tn=_mnorm(term);if(!tn)return true;
  return (list||[]).some(function(dt){return dt&&(tn.indexOf(dt)>=0||dt.indexOf(tn)>=0);});}
function _regNow(){return _REG_MEMO||_regCached();}
/* v10.9 · CROSS-PAD — pozos que pudieron ser dueños de esas filas: su periodo activo (inicio −15 d …
   cierre o hoy) se cruza con las fechas de las filas ajenas · Live primero, luego el cierre más
   reciente · máximo 12 (el que consulta para en cuanto todas las filas tienen dueño) */
function _xpadCands(selfId,selfReg,minD,maxD){
  const reg=_regNow();const out=[];if(!reg||!reg.wells)return out;const today=_ctToday();
  const sid=String((selfReg&&selfReg.spreadsheet_id)||''),ssh=String((selfReg&&selfReg.sheet_name)||CFG.tabs.loads);
  (reg.wells||[]).forEach(function(w){
    const wid=String(w.well_id||'');if(!wid||wid===String(selfId)||!w.spreadsheet_id)return;
    if(String(w.spreadsheet_id)===sid&&String(w.sheet_name||CFG.tabs.loads)===ssh)return; /* misma pestaña = mismo dato */
    const st=String(w.status||'').toLowerCase();if(st!=='live'&&st!=='closed')return;
    const sd=_effISO(w.start_date||''),ed=st==='live'?today:_effISO(w.end_date||'');if(!ed)return;
    if(maxD&&sd&&_isoAdd(sd,-15)>maxD)return;   /* empezó después de la última fila ajena */
    if(minD&&_isoAdd(ed,1)<minD)return;          /* cerró antes de la primera */
    out.push({w:w,live:st==='live'?1:0,ed:ed});});
  out.sort(function(a,b){return (b.live-a.live)||(a.ed<b.ed?1:a.ed>b.ed?-1:0);});
  return out.slice(0,12).map(function(x){return x.w;});}
/* Load IDs entregados (con driver) + terminales declaradas de un pozo vecino · caché 15 min (también
   el fallo: un libro que no abre no se reintenta en cada pedido) · solo lectura, por columnas */
function _xpInfo(w){const wid=String(w.well_id);const ck='xp11:'+wid; /* v11.1: ids[lid] = terminal */const c0=_cGet(ck);if(c0&&c0.fail)return null;if(c0&&c0.ids)return c0;
  try{const ss=SpreadsheetApp.openById(w.spreadsheet_id);let terms=[];
    try{const tsh=ss.getSheetByName(CFG.tabs.targets);if(tsh){const v=tsh.getDataRange().getValues();const h=findHeader(v,'key');
      if(h>=0){const H=v[h].map(function(x){return String(x).trim();});const ki=H.indexOf('key'),vi=H.indexOf('value');const tg={};
        for(let i=h+1;i<v.length;i++){const k=String(v[i][ki]||'').trim();if(k)tg[k]=v[i][vi];}terms=declaredTerms(tg);}}}catch(_){}
    const ids={};let n=0;const sh=ss.getSheetByName(w.sheet_name||CFG.tabs.loads);
    if(sh){const lr=sh.getLastRow(),lc=sh.getLastColumn();
      if(lr>1&&lc>0){const top=sh.getRange(1,1,Math.min(25,lr),lc).getValues();const h=findHeader(top,'Load #');
        if(h>=0&&lr>h+1){const c=colmap(top[h].map(function(x){return String(x).trim();}),['Load #','Load ID','Driver Name','Delivered','Terminal']);
          const nR=lr-h-1,col=function(j){return j>=0?sh.getRange(h+2,j+1,nR,1).getValues():null;};
          const B=col(c['Load ID']);
          if(B){const A=col(c['Load #']),Dn=col(c['Driver Name']),Dl=col(c['Delivered']),Tm=col(c['Terminal']);
            for(let i=0;i<nR;i++){const lid=String(B[i][0]==null?'':B[i][0]).trim();if(!/^\d{4,}$/.test(lid))continue;
              const ln=A?String(A[i][0]==null?'':A[i][0]).trim():'x';if(!ln||/^A/i.test(ln))continue;
              if(Dl&&(Dl[i][0]===''||Dl[i][0]==null))continue;
              if(Dn&&!String(Dn[i][0]==null?'':Dn[i][0]).trim())continue;
              if(!ids[lid]){ids[lid]=(Tm?String(Tm[i][0]==null?'':Tm[i][0]).trim():'')||1;n++;}}}}}}
    const o={id:wid,name:String(w.name||wid),terms:terms,ids:ids,n:n};_cPut(ck,o,900);return o;}
  catch(_){_cPut(ck,{fail:1,id:wid},900);return null;}}
function getWell(id){
  const reg=getRegistry().wells.find(w=>String(w.well_id)===String(id));
  if(!reg) return {error:'well_id no encontrado: '+id};
  const rates=getRates(); RATE_MISS={}; _FMT_BAD=0; const hub=SpreadsheetApp.getActive();
  var FOREIGN_T={}; // terminales AJENAS al pad detectadas en el Loads Report (contaminación cruzada)
  var _DT=[], _STRICT=false;
  if(!reg.spreadsheet_id) return {error:'sin spreadsheet_id en Registry para '+id, well_id:id, name:reg.name, status:reg.status};
  let ss; try{ ss=SpreadsheetApp.openById(reg.spreadsheet_id); }
  catch(e){ return {error:'no pude abrir el workbook ('+String(e).slice(0,80)+') — revisa spreadsheet_id o permisos', well_id:id, name:reg.name, customer:reg.customer, status:reg.status, spreadsheet_id_tail:String(reg.spreadsheet_id).slice(-6)}; }
  const client=reg.customer||'FASKEN';
  let TZS=(ss.getSpreadsheetTimeZone&&ss.getSpreadsheetTimeZone())||Session.getScriptTimeZone();

  // Targets
  const targets={}; const _tNotes={}; const T=readTab(ss,CFG.tabs.targets,'key');
  const _dTerm={}; /* v10.7: prefijo → nombre de la terminal de diseño (encabezado "— TERMINAL · X —") */
  if(T){const ki=colmap(T.H,['key','value']); let _curT='';
    /* v10.8: notas de Targets (columna "unit / notas") → targets_notes (p. ej. mezcla de diseño por etapa) */
    const ni=T.H.findIndex(function(h,i){return i!==ki.key&&i!==ki.value&&/nota|note|unit/i.test(h);});
  for(const r of T.rows){const k=String(r[ki.key]||'').trim(); if(!k)continue;
    if(k.charAt(0)==='—'){const mh=k.match(/terminal\s*[·:\-\u2013]\s*(.+?)\s*[\u2014\u2013-]*\s*$/i);_curT=mh?mh[1].trim():'';continue;}
    targets[k]=r[ki.value];
    if(ni>=0){const nt=String(r[ni]==null?'':r[ni]).trim(); if(nt)_tNotes[k]=nt.slice(0,300);}
    const mp=_curT?k.match(/^([A-Za-z0-9]+)_(mix_pct|mix|rate_ton|miles|ct_total|ct_load|ct_transit|ct_unload|drivers_shift)$/):null;
    if(mp&&!_dTerm[mp[1]])_dTerm[mp[1]]=_curT;}}
  _DT=declaredTerms(targets); _STRICT=/^(1|true|si|sí|yes)$/i.test(String((targets&&targets.terminals_strict)||''));
  const designTonsStage=(+targets.lbs_per_stage||0)/2000;

  // Loads Report → loads, drivers, tons, etapas, ciclos, terminales, carriers, products, drivers
  const L=readTabD(ss,reg.sheet_name||CFG.tabs.loads,'Load #'); /* v10.6: + texto mostrado (disp) */
  const _sheetNames=ss.getSheets().map(function(x){return x.getName();});
  const ix=L?colmap(L.H,['Load #','Load ID','Carrier Name','Truck #','Driver Name','Product','Stage#','At Terminal','In Transit','At Staging','At Dest.','Delivered','Delivered Offline','Terminal','Mileage','Load Weight','Gross Weight']):{};
  const gwIx=(ix['Gross Weight']!=null&&ix['Gross Weight']>=0)?ix['Gross Weight']:17; /* v10.1: header literal o col R */
  /* v10.6 · RELOJ = LO QUE MUESTRA LA CELDA. getDisplayValues() da el texto exacto del doc
     ("10/16/2026 9:04:31 p.m.") → se parsea directo como hora Central, sin zonas horarias.
     Si el formato oculta la hora, la fecha sale de lo mostrado y la hora del valor. */
  const _shift={};let _dispN=0;
  const _wd=function(ri,c){
    const j=ix[c];if(!(j>=0)||!L)return null;
    const ds=(L.disp&&L.disp[ri])?String(L.disp[ri][j]==null?'':L.disp[ri][j]).trim():'';
    const wDs=ds?_wall(ds,TZS,'wall'):null;
    const val=L.rows[ri][j];
    if(wDs&&/\d{1,2}:\d{2}/.test(ds)){
      if(c==='Delivered'&&val instanceof Date){const wv=_wall(val,TZS,'wall');
        if(wv){const k=String(Math.round((wv.k-wDs.k)/36e5));_shift[k]=(_shift[k]||0)+1;}}
      wDs.src='disp';return wDs;}
    const wv=_wall(val,TZS,'wall');
    if(wDs&&wv){const m=wDs.d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      const r=m?_wp(+m[1],+m[2],+m[3],wv.h,wv.mi,0,'disp+value'):null;return r||wDs;}
    if(wDs){wDs.src='disp';return wDs;}
    if(wv)wv.src='value';
    return wv;};
  /* v10.4 PRE-PASE: clasifica filas (carga / encabezado repetido / pie) y deduplica pegados
     encimados. v10.6: sin modo de conversión — el reloj es el que muestra la celda. */
  const _KIND=[],_DUP={};let _hdrRep=0,_footRows=0,_dupN=0;
  (function(){
    if(!L)return;
    const HDR=/^load\s*#$/i, FOOT=/^(transferred|from\s*job|to\s*job|total|totals|grand\s*total|summary|resumen|subtotal)$/i;
    let foot=false; const keep={};
    const hasDel=function(r){return r[ix['Delivered']]!==''&&r[ix['Delivered']]!=null;};
    L.rows.forEach(function(r,i){
      const ln=String(r[ix['Load #']]||'').trim();
      /* encabezado REAL repetido (export pegado debajo) = "Load #" + "Delivered" en su columna;
         el mini-encabezado del pie ("Load # | From Job | To Job") NO lo es → sigue siendo pie */
      if(HDR.test(ln)&&ix['Delivered']>=0&&String(r[ix['Delivered']]||'').trim()==='Delivered'){_KIND[i]='hdr';_hdrRep++;foot=false;return;}
      if(HDR.test(ln)||FOOT.test(ln)){_KIND[i]='foot';_footRows++;foot=true;return;}  // inicio/cuerpo de pie de reporte
      if(foot){ /* dentro del pie: solo una carga REAL (delivered legible + driver) reabre la lectura */
        if(_wd(i,'Delivered')&&String(r[ix['Driver Name']]||'').trim())foot=false;
        else{_KIND[i]='foot';_footRows++;return;}}
      _KIND[i]='load';
      const lid=(ix['Load ID']>=0)?String(r[ix['Load ID']]||'').trim():'';
      const key=lid||ln;
      if(key&&!/^A/i.test(ln)){
        if(keep[key]!=null){const j=keep[key];
          if(hasDel(r)||!hasDel(L.rows[j])){_DUP[j]=1;keep[key]=i;} else _DUP[i]=1; /* gana la fila con Delivered; empate → la más reciente */
          _dupN++;}
        else keep[key]=i;}
    });
    try{const PS=PropertiesService.getScriptProperties();if(PS.getProperty('tzct:'+reg.spreadsheet_id))PS.deleteProperty('tzct:'+reg.spreadsheet_id);}catch(_){} /* v10.6: limpia la marca del modo viejo */
  })();
  const _WIN_HI=_isoAdd(_ctToday(),1), _WIN_LO=reg.start_date?_isoAdd(fmtDate(reg.start_date,TZS),-15):'';
  let _txtD=0,_badD=0,_swpD=0;
  const _delW=function(ri){ /* v10.6: Delivered = reloj mostrado, con reparación D/M si la fecha es imposible */
    let w=_wd(ri,'Delivered');if(w)_dispN++;
    if(w&&(w.d>_WIN_HI||(_WIN_LO&&w.d<_WIN_LO))){const sw=_swapDM(w);
      if(sw&&sw.d<=_WIN_HI&&(!_WIN_LO||sw.d>=_WIN_LO)){w=sw;_swpD++;}}
    return w;};
  /* v10.9 · CROSS-PAD — una fila cuya terminal es AJENA a este pad y cuyo Load ID está en el Loads Report
     de un pozo vecino (Live o cerrado ≤7 días) que SÍ declara esa terminal es de ESE pozo (bloque pegado
     aquí o transferido). Sale ANTES de contar nada: loads, tons, revenue, drivers, roster. */
  const _XP={},_xpS={n:0,t:0,peers:{},blocks:[],checked:[],failed:[],cand:0,ms:0};let _xpRun=null;
  const _wdq=function(ri){const j=ix['Delivered'];if(!(j>=0))return null; /* fecha sin efectos laterales (no toca value_shift) */
    const ds=(L.disp&&L.disp[ri])?String(L.disp[ri][j]==null?'':L.disp[ri][j]).trim():'';
    return (ds?_wall(ds,TZS,'wall'):null)||_wall(L.rows[ri][j],TZS,'wall');};
  (function(){
    if(!L||!_DT.length||!(ix['Load ID']>=0))return;
    const cand=[];let minD='',maxD='';
    L.rows.forEach(function(r,i){if(_KIND[i]!=='load'||_DUP[i])return;
      const ln=String(r[ix['Load #']]||'').trim();if(!ln||/^A/i.test(ln))return;
      let nwA=num(r[ix['Load Weight']]);if(nwA>=30&&nwA<=60)nwA*=1000;else if(nwA>=18&&nwA<30)nwA*=2000;
      if(nwA>0&&nwA<=1000)return;                                   /* asset (Equipment/Generator) */
      const pr=String(r[ix['Product']]||'').toUpperCase(),term=String(r[ix['Terminal']]||'').trim();
      if(CFG.assetMarkers.some(function(m){return pr.indexOf(m)>=0||term.toUpperCase().indexOf(m)>=0;}))return;
      if(!term||_termKnown(term,_DT))return;
      if(!String(r[ix['Load ID']]==null?'':r[ix['Load ID']]).trim())return;
      cand.push(i);const w=_wdq(i);if(w){if(!minD||w.d<minD)minD=w.d;if(!maxD||w.d>maxD)maxD=w.d;}});
    _xpS.cand=cand.length;if(!cand.length)return;
    const t0=Date.now();let left=cand.slice(),C=[];
    try{C=_xpadCands(id,reg,minD,maxD);}catch(_){C=[];}
    for(let k=0;k<C.length&&left.length;k++){let p=null;try{p=_xpInfo(C[k]);}catch(_){p=null;}
      if(!p){_xpS.failed.push(String(C[k].well_id));continue;}
      _xpS.checked.push(p.id);
      if(!p.terms.length)continue;                                 /* solo reclama un pozo que DECLARA esa terminal */
      left=left.filter(function(i){const r=L.rows[i];const lid=String(r[ix['Load ID']]).trim(),term=String(r[ix['Terminal']]||'').trim();
        if(p.ids[lid]&&_termKnown(term,p.terms)){_XP[i]=p;return false;}return true;});}
    _xpS.ms=Date.now()-t0;
  })();
  /* v11.1 · LOAD ID DUPLICADO EN OTRO POZO (aviso, NO excluye): un Load ID propio que también está en el Loads
     Report de un pozo vecino (Live o cerrado, fechas que se cruzan) — aunque comparta terminal — sale en
     diag.dup_ids para revisarlo (bloque pegado dos veces, transferencia mal cerrada, captura repetida).
     Lectura por columnas con la misma caché del cross-pad (15 min); tope de 8 vecinos y 8 s. */
  const _dpS={n:0,own:0,peers:{},blocks:[],checked:[],failed:[],ms:0};
  (function(){
    if(!L||!(ix['Load ID']>=0))return;
    if(String(reg.status||'').toLowerCase()==='closed'&&!_recentClose(reg))return; /* cierre viejo: dato final, no se abren vecinos */
    const own=[];let minD='',maxD='';
    L.rows.forEach(function(r,i){if(_KIND[i]!=='load'||_DUP[i]||_XP[i])return;
      if(_STRICT&&!_termKnown(String(r[ix['Terminal']]||'').trim(),_DT))return; /* terminals_strict: esa fila no cuenta aquí */
      const ln=String(r[ix['Load #']]||'').trim();if(!ln||/^A/i.test(ln))return;
      const lid=String(r[ix['Load ID']]==null?'':r[ix['Load ID']]).trim();if(!/^\d{4,}$/.test(lid))return;
      const w=_wdq(i);if(!w)return;own.push([i,lid,w.d,String(r[ix['Terminal']]||'').trim()]);if(!minD||w.d<minD)minD=w.d;if(!maxD||w.d>maxD)maxD=w.d;});
    _dpS.own=own.length;if(!own.length)return;
    const t0=Date.now();let C=[];try{C=_xpadCands(id,reg,minD,maxD).slice(0,8);}catch(_){C=[];}
    const hit={};
    for(let k=0;k<C.length;k++){if(Date.now()-t0>8000){_dpS.failed.push('time budget');break;}
      let p=null;try{p=_xpInfo(C[k]);}catch(_){p=null;}
      if(!p){_dpS.failed.push(String(C[k].well_id));continue;}
      _dpS.checked.push(p.id);
      own.forEach(function(o){if(!p.ids[o[1]])return;
        const P0=_dpS.peers[p.id]=_dpS.peers[p.id]||{id:p.id,name:p.name,loads:0,ex:0,d0:'',d1:'',s:[]};
        const pt=p.ids[o[1]],tq=(typeof pt==='string'&&pt)?pt:o[3]; /* terminal de LA COPIA del vecino */
        P0.loads++;if(_DT.length&&p.terms.length&&tq&&!_termKnown(tq,p.terms)&&_termKnown(tq,_DT))P0.ex++; /* el vecino ya excluye su copia: allá es terminal ajena y aquí es propia */if(!P0.d0||o[2]<P0.d0)P0.d0=o[2];if(!P0.d1||o[2]>P0.d1)P0.d1=o[2];if(P0.s.length<5)P0.s.push(o[1]);
        hit[o[0]]=1;});}
    const rws=Object.keys(hit).map(Number).sort(function(a,b){return a-b;});_dpS.n=rws.length;
    let run=null;rws.forEach(function(i){const rn=(L.rn&&L.rn[i])||(i+1);
      if(run&&rn===run.b+1){run.b=rn;run.n++;}else{run={a:rn,b:rn,n:1};_dpS.blocks.push(run);}});
    _dpS.ms=Date.now()-t0;
  })();
  const _xpTake=function(ri,row){const p=_XP[ri];
    const P0=_xpS.peers[p.id]=_xpS.peers[p.id]||{id:p.id,name:p.name,loads:0,tons:0,drv:{},d0:'',d1:'',terms:{}};
    let nwX=num(row[ix['Load Weight']]);if(nwX>=30&&nwX<=60)nwX*=1000;else if(nwX>=18&&nwX<30)nwX*=2000;
    const tX=nwX>1000?nwX/2000:(+CFG.tonsPerLoadFallback);
    P0.loads++;P0.tons+=tX;_xpS.n++;_xpS.t+=tX;
    const dk=driverKey(row[ix['Driver Name']]);if(dk.key)P0.drv[dk.key]=dk.name;
    const wX=_wdq(ri);if(wX){if(!P0.d0||wX.d<P0.d0)P0.d0=wX.d;if(!P0.d1||wX.d>P0.d1)P0.d1=wX.d;}
    const tm=String(row[ix['Terminal']]||'').trim();P0.terms[tm]=(P0.terms[tm]||0)+1;
    const rn=(L.rn&&L.rn[ri])||(ri+1);
    if(_xpRun&&!_xpRun.c){_xpRun.b=rn;_xpRun.n++;}else{_xpRun={a:rn,b:rn,n:1};_xpS.blocks.push(_xpRun);}};
  const byDay={},drvByDay={},tonsByDay={},maxStageByDay={},revByDay={},cycDay={},byTerm={},byTermDay={},cycDayT={},byCarrier={},byProd={},byDriver={},driversAll=new Set(),cyc={},byHourDay={},rosterEv={};
  const wtDay={},wtHr={},ovList=[],_dayAud={},byHourTerm={},_HQ=[]; /* v11.1 _HQ: cola de la serie por hora */ /* v10.7 byHourTerm */let gwTot=0,gwN=0,ovTot=0,lwTot=0; /* v10.1 pesos · v10.2 ovL · v10.3 audit */
  let aMoves=0,aRev=0,aCost=0; const aByDay={},aRevByDay={},aEvents=[];
  const partDay={}; let gMinNo=9e15,gMaxNo=-9e15;
  const rateMixDay={}; // {fecha: {"17.76":{loads,tons,revenue}, "19.00":{...}}} — qué tarifa cobró cada carga
  let loads=0,tons=0,revenue=0,cost=0,miles=0,maxStage=0;
  let revenueBase=0,fscTot=0; const fscByDay={}; // FSC (fuel surcharge) por ton: separado del rate, sumado al revenue facturado
  let _skipNoNum=0, _wFix=0;
  // CORTE DE PIE DE REPORTE: secciones extra al final del export ("Transferred",
  // "Load # / From Job / To Job", totales) entraban como cargas fantasma sin terminal ni millas.
  /* v10.4: el pie y los encabezados repetidos ya NO cortan la lectura — los clasifica el pre-pase */
  if(L) for(let _ri=0;_ri<L.rows.length;_ri++){
    const row=L.rows[_ri];
    if(_KIND[_ri]!=='load'||_DUP[_ri])continue;
    if(!row[ix['Load #']]) {_skipNoNum++; continue;}
    if(_XP[_ri]){_xpTake(_ri,row);continue;} /* v10.9: carga de OTRO pozo → fuera antes de contar nada */
    if(_xpRun)_xpRun.c=1;                     /* una fila propia cierra el bloque pegado */
    const prodS=String(row[ix['Product']]||'').trim()||'—';
    const loadNo=String(row[ix['Load #']]||'').trim();
    let netW=num(row[ix['Load Weight']]); // col O — libras netas entregadas (arena real: 40–46k lbs)
    /* v10.5: peso capturado en MILES de lbs (47.16) o en TONS (23.5) → lbs. Antes caía en la regla
       "≤1000 = asset" y una carga de arena se contaba como asset. Equipment/Generator siguen en "1". */
    if(netW>=30&&netW<=60){netW=Math.round(netW*1000);_wFix++;} else if(netW>=18&&netW<30){netW=Math.round(netW*2000);_wFix++;}
    // ASSET = Load# 'A…' | Product/Terminal con marker | Load Weight ≤ 1000 (Equipment/Generator ponen "1").
    // Regla de peso: NUNCA tratar peso ≤1000 como arena — antes recibía fallback 21.8t e inflaba tons+revenue.
    const isAsset=/^A/i.test(loadNo)||( netW>0&&netW<=1000)||CFG.assetMarkers.some(function(m){return prodS.toUpperCase().indexOf(m)>=0||String(row[ix['Terminal']]||'').toUpperCase().indexOf(m)>=0;});
    if(isAsset){
      const miA=num(row[ix['Mileage']]);
      const _wA=_delW(_ri); const dA=_wA?_wA.d:''; /* v10.6 */
      const ra=(rates.ASSETS&&rates.ASSETS.length)?rateFor(rates,'ASSETS',miA,dA):{bill:0,pay:0,unit:'load'};
      const tA=netW>1000?netW/2000:+CFG.tonsPerLoadFallback; // solo para tarifas por ton de assets (si existen); no toca tons entregadas
      const revA=(ra.unit==='load')?ra.bill:ra.bill*tA, payA=(ra.unit==='load')?ra.pay:ra.pay*tA;
      aMoves++; aRev+=revA; aCost+=payA;
      if(dA){aByDay[dA]=(aByDay[dA]||0)+1; aRevByDay[dA]=(aRevByDay[dA]||0)+revA;}
      aEvents.push({date:dA,load_no:loadNo,load_id:String(row[ix['Load ID']]||''),driver:driverKey(row[ix['Driver Name']]).name,miles:miA,revenue:Math.round(revA)});
      continue;
    }
    // TONS ENTREGADAS = col O ÷ 2000. netW>1000 garantizado aquí (pesos ≤1000 ya salieron como asset);
    // fallback 21.8 solo si la celda viene VACÍA (hueco de captura, no equipment).
    const t=netW>1000?netW/2000:(+CFG.tonsPerLoadFallback);
    const term=String(row[ix['Terminal']]||'').trim()||'—';
    // GUARD ANTI-CONTAMINACIÓN: carga desde una terminal que NO es del pad (filas de otro job
    // pegadas por error). Se cuenta aparte SIEMPRE; se excluye si Targets trae terminals_strict.
    // v10.9: la exclusión estricta ocurre ANTES de acumular (antes se escapaban FSC, revenue base y pesos).
    if(_DT.length && term!=='—' && !_termKnown(term,_DT)){ // tolerante: "nomad big springs" ≈ "nomad big springs tx"
      const f=FOREIGN_T[term]=FOREIGN_T[term]||{loads:0,tons:0}; f.loads++; f.tons+=t;
      if(_STRICT)continue;
    }
    loads++; tons+=t;
    const gwL=num(row[gwIx]); const gwOk=gwL>30000&&gwL<120000; /* v10.1: gross plausible de unidad cargada */
    if(gwOk){gwTot+=gwL;gwN++;if(gwL>80000)ovTot++;else if(gwL<70000)lwTot++;}
    const mi=num(row[ix['Mileage']]); miles+=mi;
    const dl=row[ix['Delivered']]; const _wD=_delW(_ri); const dDel=_wD?_wD.d:''; /* v10.6 reloj = lo que muestra la celda */
    if(typeof dl==='string'&&dl.trim())_txtD++; if(!_wD&&dl!==''&&dl!=null)_badD++;
    const rb=rateFor(rates,client,mi,dDel); /* tarifa VIGENTE en la fecha de esta carga */
    const _rbase=(rb.unit==='load')?rb.bill:rb.bill*t;
    const fscL=(rb.unit==='load')?(+rb.fsc||0):(+rb.fsc||0)*t; // FSC de la tarifa vigente (0 si el bracket no trae)
    const revL=_rbase+fscL; // revenue FACTURADO = rate + FSC — byTerm/daily/rateMix heredan la suma
    const payL=(rb.unit==='load')?rb.pay:rb.pay*t;
    revenue+=revL; revenueBase+=_rbase; fscTot+=fscL; cost+=payL;
    if(fscL&&dDel)fscByDay[dDel]=(fscByDay[dDel]||0)+fscL;
    byTerm[term]=byTerm[term]||{loads:0,miles:0,revenue:0,tons:0,fsc:0}; byTerm[term].loads++; byTerm[term].miles+=mi; byTerm[term].revenue+=revL; byTerm[term].tons+=t; byTerm[term].fsc+=fscL;
    const code=(String(row[ix['Truck #']]||'').match(/^[A-Za-z]+/)||['—'])[0].toUpperCase(); byCarrier[code]=(byCarrier[code]||0)+1;
    const _dk=driverKey(row[ix['Driver Name']]);
    const drv=_dk.key; // clave unificada: mismo humano aunque cambie el sufijo de carrier
    if(drv){ driversAll.add(drv);
      const D=byDriver[drv]=byDriver[drv]||{name:_dk.name,loads:0,revenue:0,fsc:0,nw:0,nn:0,gw:0,gn:0,dates:{},carriers:{},sufs:{}};
      D.loads++; D.revenue+=revL; D.fsc+=fscL; /* v9.1: facturado exacto por driver (rate+FSC) */
      if(netW>1000){D.nw+=netW;D.nn++;} if(gwOk){D.gw+=gwL;D.gn++;} /* v10.1 */
      if(code&&code!=='—')D.carriers[code]=(D.carriers[code]||0)+1;
      if(_dk.suf)D.sufs[_dk.suf]=(D.sufs[_dk.suf]||0)+1; }
    byProd[prodS]=(byProd[prodS]||0)+1;
    const stg=num(row[ix['Stage#']]); if(stg>maxStage) maxStage=stg;
    if(dDel){const _rk=(+rb.bill||0).toFixed(2); const _RM=rateMixDay[dDel]=rateMixDay[dDel]||{};
      const _e=_RM[_rk]=_RM[_rk]||{loads:0,tons:0,revenue:0,fsc:0}; _e.loads++; _e.tons+=t; _e.revenue+=revL; _e.fsc+=fscL;}
    if(dDel){const d=dDel; byDay[d]=(byDay[d]||0)+1;
      (function(){const A=_dayAud[d]=_dayAud[d]||{l:0,f:'',t:''};A.l++; /* v10.3 · v10.4 reloj Central */
        const h=('0'+_wD.h).slice(-2)+':'+('0'+_wD.mi).slice(-2);
        if(!A.f||h<A.f)A.f=h;if(!A.t||h>A.t)A.t=h;})();
      const btk=d+'|'+term; byTermDay[btk]=byTermDay[btk]||{date:d,terminal:term,loads:0,tons:0,revenue:0}; byTermDay[btk].loads++; byTermDay[btk].tons+=t; byTermDay[btk].revenue+=revL;
      const wk2=d+'|'+term; const WD=wtDay[wk2]=wtDay[wk2]||{d:d,t:term,l:0,nw:0,nn:0,gw:0,gn:0,ov:0,lw:0,rev:0,fsc:0};
      WD.l++; WD.rev+=revL; WD.fsc+=fscL; if(netW>1000){WD.nw+=netW;WD.nn++;}
      if(gwOk){WD.gw+=gwL;WD.gn++; if(gwL>80000)WD.ov++; else if(gwL<70000)WD.lw++;}
      if(gwOk&&gwL>80000&&ovList.length<80)ovList.push([dDel,term,(_dk.name||'—'),Math.round(gwL),loadNo]); /* v10.2 */
      const _no=parseInt(loadNo,10);
      if(isFinite(_no)&&_no>0){const pn=partDay[d]=partDay[d]||{min:_no,max:_no}; if(_no<pn.min)pn.min=_no; if(_no>pn.max)pn.max=_no; if(_no<gMinNo)gMinNo=_no; if(_no>gMaxNo)gMaxNo=_no;} (drvByDay[d]=drvByDay[d]||new Set()).add(drv); tonsByDay[d]=(tonsByDay[d]||0)+t; revByDay[d]=(revByDay[d]||0)+revL; if(stg>(maxStageByDay[d]||0))maxStageByDay[d]=stg; if(drv)byDriver[drv].dates[d]=(byDriver[drv].dates[d]||0)+1;}
    // tiempos de ciclo (min) por terminal
    const _K=function(c){const w=_wd(_ri,c);return w?w.k:null;}; /* v10.6: reloj mostrado */
    const aT=_K('At Terminal'),iT=_K('In Transit'),aS=_K('At Staging'),aD=_K('At Dest.'),dv=_wD?_wD.k:null;
    cyc[term]=cyc[term]||{load:[0,0],transit:[0,0],unload:[0,0],full:[0,0],stage_wait:[0,0]};
    // MODELO DE CICLO (con staging pad):
    //   At Terminal →[CARGA c/espera]→ In Transit →[TRÁNSITO]→ At Staging →[ESPERA POZO]→ At Dest →[DESCARGA]→ Delivered
    // CARGA = In Transit − At Terminal COMPLETA (incluye espera por cargar → más exacto).
    if(aT&&iT){const m=(iT-aT)/6e4; if(m>0&&m<1200){cyc[term].load[0]+=m;cyc[term].load[1]++;}}
    // TRÁNSITO = hasta At Staging si existe, sino hasta At Dest.
    {const eol=aS||aD; if(iT&&eol){const m=(eol-iT)/6e4; if(m>0&&m<1200){cyc[term].transit[0]+=m;cyc[term].transit[1]++;}}}
    // DESCARGA = (Delivered − At Dest) + tiempo en STAGING (At Dest − At Staging) si hay staging pad.
    {let un=0; if(aD&&dv){const m=(dv-aD)/6e4; if(m>0&&m<1200)un+=m;}
     if(aS&&aD){const sw=(aD-aS)/6e4; if(sw>0&&sw<1200){un+=sw; cyc[term].stage_wait[0]+=sw;cyc[term].stage_wait[1]++;}}
     if(un>0){cyc[term].unload[0]+=un;cyc[term].unload[1]++;}}
    // CICLO TOTAL = carga + tránsito×2 (ida+vuelta) + descarga(c/staging). Timestamp mide un sentido; regreso vacío se duplica.
    {const L=(aT&&iT)?(iT-aT)/6e4:0, eol=aS||aD, TR=(iT&&eol)?(eol-iT)/6e4:0,
       UN=((aD&&dv)?(dv-aD)/6e4:0)+((aS&&aD)?(aD-aS)/6e4:0);
       const prod=L+TR*2+UN; if(prod>0&&prod<4000){cyc[term].full[0]+=prod;cyc[term].full[1]++;}}
    if(dDel){const dD=dDel; const cd=cycDay[dD]=cycDay[dD]||{te:[0,0],tr:[0,0],of:[0,0]};
      const ck=dD+'|'+term; const ct2=cycDayT[ck]=cycDayT[ck]||{date:dD,terminal:term,te:[0,0],tr:[0,0],of:[0,0],n:0};
      if(aT&&iT){const m=(iT-aT)/6e4; if(m>0&&m<1200){cd.te[0]+=m;cd.te[1]++;ct2.te[0]+=m;ct2.te[1]++;}}
      {const eol=aS||aD; if(iT&&eol){const m=(eol-iT)/6e4; if(m>0&&m<1200){cd.tr[0]+=m;cd.tr[1]++;ct2.tr[0]+=m;ct2.tr[1]++;}}}
      {let un=0; if(aD&&dv){const m=(dv-aD)/6e4; if(m>0&&m<1200)un+=m;} if(aS&&aD){const sw=(aD-aS)/6e4; if(sw>0&&sw<1200)un+=sw;} if(un>0){cd.of[0]+=un;cd.of[1]++;ct2.of[0]+=un;ct2.of[1]++;}}
      ct2.n++;}
    // v9.2 SERIE POR HORA · v11.1: se ENCOLA y se reparte después del bucle en RELOJ REAL (offline a su hora real)
    if(dDel&&_wD){
      const _off=(ix['Delivered Offline']>=0&&/^(yes|y|true|1|si|sí)$/i.test(String(row[ix['Delivered Offline']]||'').trim()))?1:0;
      _HQ.push({d:dDel,k:_wD.k,h:_wD.h,rv:revL,fs:fscL,t:t,term:term,drv:drv,aT:aT,iT:iT,aS:aS,aD:aD,dv:dv,nw:netW,gw:gwL,gwOk:gwOk,off:_off});
      if(drv)(rosterEv[drv]=rosterEv[drv]||[]).push({dv:_wD.k/36e5,at:aT!=null?aT/36e5:null,it:iT!=null?iT/36e5:null,as:aS!=null?aS/36e5:null,ad:aD!=null?aD/36e5:null,tm:term,off:_off}); /* v10.9: reloj real · v11.1 + At Staging y terminal */
    }
  }
  /* v11.1 · SERIE POR HORA EN RELOJ REAL — la entrega OFFLINE ("Delivered Offline" = Yes: el sello llega al
     sincronizar, horas tarde) va a su hora REAL con la misma regla del roster (In Transit + tránsito típico
     del pad, o At Terminal + tramo típico) SIN salir del día oficial del Delivered: la suma por hora sigue
     cuadrando con el total del día. Aplica a loads, drivers, revenue, FSC, tons, ciclo y pesos por hora. */
  const _LG=_legOf(rosterEv);let _hrMv=0,_hrOff=0;
  _HQ.forEach(function(q){let _hh=q.h;
    if(q.off){_hrOff++;const e=_realEnd({dv:q.k/36e5,at:q.aT!=null?q.aT/36e5:null,it:q.iT!=null?q.iT/36e5:null,as:q.aS!=null?q.aS/36e5:null,tm:q.term,off:1},_LG);
      if(e<q.k/36e5-0.05){const hI=Math.floor(e+1e-9),h2=(_hD(hI)===q.d)?Math.round(_clk(hI)):0;if(h2!==_hh){_hh=h2;_hrMv++;}}} /* día y hora del MISMO entero (sin redondeo al minuto) */
    const dDel=q.d,term=q.term,drv=q.drv,aT=q.aT,iT=q.iT,aS=q.aS,aD=q.aD,dv=q.dv,netW=q.nw,gwL=q.gw,gwOk=q.gwOk;
    const HD=byHourDay[dDel]=byHourDay[dDel]||{l:Array(24).fill(0),rv:Array(24).fill(0),fs:Array(24).fill(0),tn:Array(24).fill(0),dr:{},te:Array(24).fill(0),ten:Array(24).fill(0),trh:Array(24).fill(0),trn:Array(24).fill(0),de:Array(24).fill(0),den:Array(24).fill(0)};
    HD.l[_hh]++; HD.rv[_hh]+=q.rv; HD.fs[_hh]+=q.fs; HD.tn[_hh]+=q.t;
    const _hk=dDel+'|'+term; const HT=byHourTerm[_hk]=byHourTerm[_hk]||{d:dDel,t:term,l:{},dr:{},te:{},ten:{},tr:{},trn:{},de:{},den:{}}; /* v10.7 */
    HT.l[_hh]=(HT.l[_hh]||0)+1; if(drv)(HT.dr[_hh]=HT.dr[_hh]||{})[drv]=1;
    const wh2=dDel+'|'+_hh+'|'+term; const WH=wtHr[wh2]=wtHr[wh2]||{d:dDel,h:_hh,t:term,l:0,nw:0,nn:0,gw:0,gn:0,ov:0};
    WH.l++; if(netW>1000){WH.nw+=netW;WH.nn++;} if(gwOk){WH.gw+=gwL;WH.gn++;if(gwL>80000)WH.ov++;}
    if(drv)(HD.dr[_hh]=HD.dr[_hh]||{})[drv]=1;
    if(aT&&iT){const m=(iT-aT)/6e4; if(m>0&&m<1200){HD.te[_hh]+=m;HD.ten[_hh]++;HT.te[_hh]=(HT.te[_hh]||0)+m;HT.ten[_hh]=(HT.ten[_hh]||0)+1;}}
    {const eol=aS||aD; if(iT&&eol){const m=(eol-iT)/6e4; if(m>0&&m<1200){HD.trh[_hh]+=m;HD.trn[_hh]++;HT.tr[_hh]=(HT.tr[_hh]||0)+m;HT.trn[_hh]=(HT.trn[_hh]||0)+1;}}}
    {let un=0; if(aD&&dv){const m=(dv-aD)/6e4; if(m>0&&m<1200)un+=m;} if(aS&&aD){const sw=(aD-aS)/6e4; if(sw>0&&sw<1200)un+=sw;} if(un>0){HD.de[_hh]+=un;HD.den[_hh]++;HT.de[_hh]=(HT.de[_hh]||0)+un;HT.den[_hh]=(HT.den[_hh]||0)+1;}}
  });
  // Stages (per-pozo) — etapa por etapa + inventario (cajas/pila)
  const isBelly=String(reg.equipment||'').toLowerCase().indexOf('belly')>=0;
  // v7.5 STAGES por DISPLAY VALUE: Day sin fantasma de TZ (mismo fix que Downtimes) · duración
  // recomputada de Start/End con wrap de medianoche — la hoja produce negativos tipo -21:17.
  const ST_=readTabD(ss,CFG.tabs.stages,'Stage #'); const stages=[]; const stagesByDay={},tonsByDayS={},maxStageByDayS={}; let stagesDone=0;
  let invLatest=null, totalStageMax=0;
  if(ST_){const si=colmap(ST_.H,['Well','Stage #','Total Stage','Used Tons','Stage Start Time','Stage End Time','Stage Duration','Change Stage Duration','Full boxes at destination','Empty boxes','Damged boxes','Drivers at location','Day']);
    for(let _ri=0;_ri<ST_.rows.length;_ri++){const r=ST_.rows[_ri],rd=ST_.disp[_ri];
      const tot=num(r[si['Total Stage']]); if(!tot)continue; if(tot>totalStageMax)totalStageMax=tot;
      const day=(si.Day>=0?dateOfDisp(rd[si.Day]):'')||((si.Day>=0&&!isBlankDate(r[si.Day]))?fmtDate(r[si.Day],TZS):'');
      const ut=num(r[si['Used Tons']]), full=num(r[si['Full boxes at destination']]);
      const sT=si['Stage Start Time']>=0?timeOfDisp(rd[si['Stage Start Time']]):'';
      const eT=si['Stage End Time']>=0?timeOfDisp(rd[si['Stage End Time']]):'';
      const durDisp=si['Stage Duration']>=0?String(rd[si['Stage Duration']]||'').trim():'';
      const _hasDur=!!durDisp&&durDisp!=='0:00:00';
      // FILA VACÍA (plan futuro): sin Day, sin tons y sin duración → NO es etapa hecha, se omite.
      if(!day && ut<=0 && !_hasDur){ continue; }
      const durMin=(function(){ // 1º Start→End (wrap medianoche) · 2º columna solo si es positiva y sana
        if(sT&&eT){const a=(+sT.slice(0,2))*60+(+sT.slice(3)),b=(+eT.slice(0,2))*60+(+eT.slice(3));let d=b-a;if(d<0)d+=1440;if(d>0&&d<1440)return d;}
        const d2=hmsToMin(durDisp); return (d2>0&&d2<1440)?Math.round(d2):null;})();
      const chDisp=si['Change Stage Duration']>=0?String(rd[si['Change Stage Duration']]||'').trim():'';
      const rec={well:String(r[si.Well]||''),stage:num(r[si['Stage #']]),total_stage:tot,day:day,used_tons:+ut.toFixed(1),
        start:sT,end:eT,duration:durDisp,change:chDisp,
        duration_min:durMin,
        full_or_pila:full,empty:num(r[si['Empty boxes']]),damaged:num(r[si['Damged boxes']]),drivers_loc:num(r[si['Drivers at location']])};
      stages.push(rec);
      // v9.3.3: solo cuenta como captura de inventario si ALGUNA celda está ESCRITA
      // (display '' = aún no capturan; '0' escrito sí cuenta como cero real)
      const _wrote=function(ci){return ci>=0&&String(rd[ci]==null?'':rd[ci]).trim()!=='';};
      if(_wrote(si['Full boxes at destination'])||_wrote(si['Empty boxes'])||_wrote(si['Damged boxes'])){invLatest=rec;}
      if(ut>0 && day)stagesDone++;
      if(day){stagesByDay[day]=(stagesByDay[day]||0)+1; tonsByDayS[day]=(tonsByDayS[day]||0)+ut; if(tot>(maxStageByDayS[day]||0))maxStageByDayS[day]=tot;}
    }
    // v7.9 WIRELINE/TRANSITION: change_min = gap end(N)→start(N+1) RECOMPUTADO con wrap de
    // medianoche. La columna de la hoja produce negativos (-22:40) al cruzar 12am y valores
    // FALSOS en pausas multi-dia (calcula same-day 6:14 donde hay 2 dias) → si los dias
    // difieren >1, la transicion no es medible: null. Fallback a la columna SOLO cuando no
    // hay etapa siguiente (ultima fila) y el display es sano.
    const _dUTC=function(x){const m2=String(x||'').match(/(\d{4})-(\d{2})-(\d{2})/);return m2?Date.UTC(+m2[1],+m2[2]-1,+m2[3]):0;};
    for(let _i=0;_i<stages.length;_i++){const A=stages[_i],B=stages[_i+1]||null;let ch=null;
      if(B&&A.end&&B.start&&A.day&&B.day){
        const da=_dUTC(A.day),db2=_dUTC(B.day);
        const dd=(da&&db2)?Math.round((db2-da)/86400000):99;
        if(dd>=0&&dd<=1){
          const a=(+A.end.slice(0,2))*60+(+A.end.slice(3)),b=(+B.start.slice(0,2))*60+(+B.start.slice(3));
          let d=b-a; if(d<0)d+=1440; if(d>=0&&d<1440)ch=d;
        } // dd>1 → pausa multi-dia: ch queda null a proposito (la columna tambien miente ahi)
      } else if(!B){
        const d2=hmsToMin(String(A.change||'')); if(d2>0&&d2<1440)ch=Math.round(d2);
      }
      A.change_min=ch;
    }}
  const _lastStg=stages.length?stages[stages.length-1].stage:0;
  const inventory=invLatest?(isBelly
    ?{type:'pila',pila:invLatest.full_or_pila,drivers_location:invLatest.drivers_loc,
      stage:invLatest.stage,day:invLatest.day,stale:_lastStg>invLatest.stage}
    :{type:'boxes',full:invLatest.full_or_pila,empty:invLatest.empty,damaged:invLatest.damaged,drivers_location:invLatest.drivers_loc,
      stage:invLatest.stage,day:invLatest.day,stale:_lastStg>invLatest.stage}):null;

  // daily = unión (Loads → loads/drivers ; Stages → etapas/tons/eficiencia)
  const allDays=Array.from(new Set(Object.keys(byDay).concat(Object.keys(stagesByDay)))).sort();
  let prev=0; const daily=allDays.map(d=>{
    const sc=maxStageByDayS[d]||maxStageByDay[d]||prev; const sd=(stagesByDay[d]!=null)?stagesByDay[d]:Math.max(0,sc-prev); prev=Math.max(prev,sc);
    // v7.2: tons = ENTREGADAS (Load Report col O ÷ 2000, por fecha Delivered). Used Tons de Stages va en tons_frac.
    const dt=tonsByDay[d]||0;
    const dtF=tonsByDayS[d]!=null?+tonsByDayS[d].toFixed(1):null;
    const eff=designTonsStage&&sd>0?+(dt/(sd*designTonsStage)*100).toFixed(1):0;
    const pn=partDay[d]; const ours=byDay[d]||0;
    const span=pn?Math.max(pn.max-pn.min,ours):0;
    const _rm=rateMixDay[d]||null; let _rmO=null;
    if(_rm){_rmO={}; Object.keys(_rm).forEach(function(k){_rmO[k]={loads:_rm[k].loads,tons:+_rm[k].tons.toFixed(1),revenue:Math.round(_rm[k].revenue)};});}
    return { date:d, rates:_rmO, loads:ours, drivers:drvByDay[d]?drvByDay[d].size:0, tons:Math.round(dt), tons_frac:dtF, revenue:Math.round(revByDay[d]||0), revenue_fsc:Math.round(fscByDay[d]||0), assets_moves:aByDay[d]||0, assets_revenue:Math.round(aRevByDay[d]||0), pad_span:span||null, participation:span?+(ours/span*100).toFixed(1):null, stages_day:sd, stage_cum:sc, efficiency:eff };
  });

  // Downtimes (categoría = DUE TO (RESPONSIBLE), duración = TOTAL HOURS)
  // v7.0 FIX: START/END/TOTAL HOURS/DATE se leen del DISPLAY (texto de la celda) → sin fantasma de TZ.
  const D=readTabD(ss,CFG.tabs.downtimes,'DUE TO (RESPONSIBLE)'); const dCat={}; let dMin=0,dtOpen=0; const dtEvents=[];
  if(D){const di=colmap(D.H,['DUE TO (RESPONSIBLE)','TOTAL HOURS','STAGE','WHY?','START','END','DATE']);
    // La columna de fecha puede llamarse 'START DATE' (plantilla) o 'DATE'. Resolver flexible:
    if(di.DATE<0){const _dc=D.H.findIndex(h=>/start\s*date|^date$/i.test(String(h).trim())); if(_dc>=0)di.DATE=_dc;}
    // START/END pueden traer fecha+hora en 'START DATE'/'END DATE':
    if(di.START<0){const _s=D.H.findIndex(h=>/start\s*date/i.test(String(h).trim())); if(_s>=0)di.START=_s;}
    if(di.END<0){const _e=D.H.findIndex(h=>/end\s*date/i.test(String(h).trim())); if(_e>=0)di.END=_e;}
    for(let ri=0;ri<D.rows.length;ri++){const r=D.rows[ri], rd=D.disp[ri];
      const c=String(r[di['DUE TO (RESPONSIBLE)']]||'').trim(); if(!c)continue;
      const totDisp=di['TOTAL HOURS']>=0?rd[di['TOTAL HOURS']]:''; const m=hmsToMin(totDisp); // minutos REALES desde el texto
      const startDisp=di.START>=0?rd[di.START]:'', endDisp=di.END>=0?rd[di.END]:'';
      const sT=timeOfDisp(startDisp), eT=timeOfDisp(endDisp); // hora del reloj o '' si la celda es solo-fecha
      const hasStart=(di.START>=0)&&!isBlankDate(r[di.START]);
      const hasEnd=(di.END>=0)&&!isBlankDate(r[di.END]);
      const dateStr=(di.DATE>=0?dateOfDisp(rd[di.DATE]):'')||(di.DATE>=0&&!isBlankDate(r[di.DATE])?fmtDate(r[di.DATE],TZS):'');
      // EVENTO ABIERTO: tiene inicio pero NO fin registrado → downtime en curso, no se contabiliza aún.
      const isOpen=(hasStart&&!hasEnd); // sin END = en curso, NO cuenta (aunque TOTAL HOURS traiga algo)
      if(isOpen){dtOpen++;
        dtEvents.push({date:dateStr, stage:di.STAGE>=0?String(r[di.STAGE]||''):'', why:(di['WHY?']>=0?String(r[di['WHY?']]||''):'')+' (en curso)', responsible:c, start:sT, end:'', hours:0, open:true}); continue;}
      dCat[c]=(dCat[c]||0)+m; dMin+=m;
      dtEvents.push({date:dateStr, stage:di.STAGE>=0?String(r[di.STAGE]||''):'', why:di['WHY?']>=0?String(r[di['WHY?']]||''):'', responsible:c, start:sT, end:eT, end_date:dateOfDisp(endDisp)||'', hours:+(m/60).toFixed(2)});}}

  // Status Log (Hub, filtrado por log_match) → board + por hora
  const match=String(reg.log_match||reg.name||'').trim();
  const SL=readTab(hub,CFG.statusSheet,'status'); const actHr={},statusByHour={}; let lastK='',lastTs=-1;
  const _mN=_mnorm(match);
  if(SL&&match){const li=colmap(SL.H,['date_iso','hour','well','status','count']);
    for(const r of SL.rows){const wl=String(r[li.well]||''); if(_mnorm(wl).indexOf(_mN)<0)continue;
      const di=String(r[li.date_iso]||'').trim(), hh=('0'+num(r[li.hour])).slice(-2), key=di+' '+hh;
      const st=String(r[li.status]||'').trim(), n=num(r[li.count]);
      statusByHour[key]=statusByHour[key]||{}; statusByHour[key][st]=(statusByHour[key][st]||0)+n;
      if(CFG.activeStatuses.indexOf(st)>=0) actHr[key]=(actHr[key]||0)+n;
      const ts=new Date(di+'T'+hh+':00').getTime(); if(ts>lastTs){lastTs=ts;lastK=key;}
    }}
  const hours=Object.keys(statusByHour).sort();
  const _rsS={v:'v11.2'}; /* lo llena el roster (reloj real: tramo típico, entregas offline corregidas) */
  const statusBoard=lastK?Object.entries(statusByHour[lastK]).map(([s,n])=>({status:s,count:n})).sort((a,b)=>b.count-a.count):[];
  /* v11.1: roster ANTES del objeto — sus bloques (1er At Terminal → última entrega) dan ac = drivers EN TURNO por hora */
  const _AC={},_LOC={};let _ROS=[];
  try{_ROS=_rosterBuild(rosterEv,byDriver,new Set(Object.keys(stagesByDay||{})),{pool:_xwPoolLazy(id),loc:_LOC,stats:_rsS,nowH:_ctNowK()/36e5,lg:_LG,acc:_AC});}
  catch(e){_rsS.err=String((e&&e.message)||e).slice(0,160);_ROS=[];}
  try{_xrPut(id,_LOC);}catch(_){}

  return {
    api_version:API_VERSION, well_id:reg.well_id, name:reg.name, customer:client, status:reg.status, targets, targets_notes:_tNotes,
    diag:{ file:ss.getName(), sheets:ss.getSheets().map(function(x){return x.getName();}),
      loads_tab:(reg.sheet_name||CFG.tabs.loads), loads_found:!!L, loads_rows:L?L.rows.length:0,
      tons_delivered:Math.round(tons), loads_skipped_no_loadnum:_skipNoNum, footer_rows_cut:_footRows,
      fsc_total:Math.round(fscTot), fsc_applied:fscTot>0,
      rate_fallback:RATE_MISS,
      tz:CT_TZ, day_tz:'Central (America/Chicago) · 12:00 AM–11:59 PM', tz_sheet:TZS, tz_mode:'display', ct_today:_ctToday(), /* v10.4 */
      clock_source:'display', display_read:_dispN, /* v10.6 */
      value_shift_h:(function(){let b=0,c=-1;Object.keys(_shift).forEach(function(k){if(_shift[k]>c){c=_shift[k];b=+k;}});return b;})(),
      dates_normalized:_FMT_BAD, text_dates:_txtD, unparsed_dates:_badD, dm_repaired:_swpD,
      header_repeats:_hdrRep, dupes_removed:_dupN, weight_units_fixed:_wFix, /* v10.5 */
      day_audit:Object.keys(_dayAud).sort().slice(-4).map(function(k){var A=_dayAud[k];return {d:k,loads:A.l,first:A.f,last:A.t};}),
      declared_terminals:_DT, terminals_strict:_STRICT, foreign_terminals:FOREIGN_T,
      cross_pad:_xpS.n?{loads:_xpS.n,tons:Math.round(_xpS.t),blocks:_xpS.blocks.map(function(b){return [b.a,b.b,b.n];}),
        peers:Object.keys(_xpS.peers).map(function(k){const P0=_xpS.peers[k];const ks=Object.keys(P0.drv);
          return {id:P0.id,name:P0.name,loads:P0.loads,tons:Math.round(P0.tons),first:P0.d0,last:P0.d1,terminals:P0.terms,
            drivers:ks.length,only:ks.filter(function(x){return !byDriver[x];}).map(function(x){return P0.drv[x];}).sort()};}),
        checked:_xpS.checked,failed:_xpS.failed,incomplete:_xpS.failed.length?1:0,ms:_xpS.ms}
        :(_xpS.cand?{loads:0,candidates:_xpS.cand,checked:_xpS.checked,failed:_xpS.failed,incomplete:_xpS.failed.length?1:0,ms:_xpS.ms}:null), /* v10.9 */
      roster_clock:_rsS,
      hourly_clock:{mode:'real',offline:_hrOff,moved:_hrMv,leg:_r1(_LG.LEG),leg_it:_r1(_LG.LEGI)}, /* v11.1 */
      dup_ids:(_dpS.n||_dpS.checked.length||_dpS.failed.length)?{loads:_dpS.n,own:_dpS.own,
        peers:Object.keys(_dpS.peers).map(function(k){const P0=_dpS.peers[k];return {id:P0.id,name:P0.name,loads:P0.loads,excl_there:P0.ex,first:P0.d0,last:P0.d1,sample:P0.s};}).sort(function(a,b){return b.loads-a.loads;}),
        blocks:_dpS.blocks.slice(0,12).map(function(b){return [b.a,b.b,b.n];}),checked:_dpS.checked,failed:_dpS.failed,ms:_dpS.ms}:null, /* v11.1 */
      targets_found:!!T, targets_keys:Object.keys(targets).length,
      loads_sheet_looked:(reg.sheet_name||CFG.tabs.loads), sheets_available:_sheetNames,
      stages_found:!!ST_, stages_rows:ST_?ST_.rows.length:0,
      downtimes_found:!!D, downtimes_rows:D?D.rows.length:0 },
    totals:{ loads, tons:Math.round(tons), revenue:Math.round(revenue), revenue_base:Math.round(revenueBase), revenue_fsc:Math.round(fscTot), cost:Math.round(cost), margin:Math.round(revenue-cost),
             rev_per_load:loads?+(revenue/loads).toFixed(2):0, unique_drivers:driversAll.size, miles:Math.round(miles),
             avg_net_lbs:loads?Math.round(tons*2000/loads):0, avg_gross_lbs:gwN?Math.round(gwTot/gwN):0,
             gross_loads:gwN, gross_over80:ovTot, gross_under70:lwTot,
             max_stage:stagesDone||Math.max(maxStage,totalStageMax), stages_completed:stagesDone, stages_planned:(+targets.total_stages||totalStageMax), stages_sheet_max:totalStageMax, downtime_minutes:+dMin.toFixed(1),
             assets_moves:aMoves, assets_revenue:Math.round(aRev),
             pad_span:(gMaxNo>gMinNo)?Math.max(gMaxNo-gMinNo,loads):null,
             participation_pct:(gMaxNo>gMinNo&&loads)?+(loads/Math.max(gMaxNo-gMinNo,loads)*100).toFixed(1):null },
    daily,
    hourly:Object.keys(byHourDay).sort().map(function(d){var H=byHourDay[d];return {date:d,
      l:H.l, dr:H.l.map(function(_,h){return H.dr[h]?Object.keys(H.dr[h]).length:0;}),
      rv:H.rv.map(function(v){return Math.round(v);}), fs:H.fs.map(function(v){return Math.round(v);}),
      tn:H.tn.map(function(v){return Math.round(v*10)/10;}),
      te:H.te.map(function(v,h){return H.ten[h]?Math.round(v/H.ten[h]*10)/10:0;}),
      tr:H.trh.map(function(v,h){return H.trn[h]?Math.round(v/H.trn[h]*10)/10:0;}),
      de:H.de.map(function(v,h){return H.den[h]?Math.round(v/H.den[h]*10)/10:0;}),
      ac:(_AC[d]||new Array(24).fill(0)).map(function(v){return Math.round(v*10)/10;})};}), /* v11.1: drivers EN TURNO por hora (reloj real) */
    hourlyByTerm:Object.keys(byHourTerm).sort().map(function(k){var H=byHourTerm[k];
      var hs=Object.keys(H.l).map(Number).sort(function(a,b){return a-b;});
      var av=function(sm,nn){return hs.map(function(h){return nn[h]?Math.round(sm[h]/nn[h]*10)/10:0;});};
      return {date:H.d,terminal:H.t,h:hs,l:hs.map(function(h){return H.l[h];}),dr:hs.map(function(h){return H.dr[h]?Object.keys(H.dr[h]).length:0;}),
        te:av(H.te,H.ten),tr:av(H.tr,H.trn),de:av(H.de,H.den)};}), /* v10.7: ciclo por hora por terminal (solo horas con cargas) */
    stageWaitByTerminal:Object.entries(cyc).map(([k,v])=>({terminal:k,avg_stage_min:v.stage_wait[1]?+(v.stage_wait[0]/v.stage_wait[1]).toFixed(1):0,events:v.stage_wait[1]})).filter(x=>x.avg_stage_min>0).sort((a,b)=>b.avg_stage_min-a.avg_stage_min),
    byTerminal:Object.entries(byTerm).map(([k,v])=>({terminal:k,loads:v.loads,avg_miles:v.loads?+(v.miles/v.loads).toFixed(1):0,revenue:Math.round(v.revenue),fsc:Math.round(v.fsc),tons:Math.round(v.tons)})).sort((a,b)=>b.revenue-a.revenue),
    designTerminals:Object.keys(_dTerm).map(function(p){return {prefix:p,name:_dTerm[p]};}), /* v10.7 */
    byTerminalDaily:Object.values(byTermDay).map(v=>({date:v.date,terminal:v.terminal,loads:v.loads,tons:Math.round(v.tons),revenue:Math.round(v.revenue)})).sort((a,b)=>a.date<b.date?-1:1),
    byCarrier:Object.entries(byCarrier).map(([k,v])=>({carrier:k,loads:v})).sort((a,b)=>b.loads-a.loads),
    byProduct:Object.entries(byProd).map(([k,v])=>({product:k,loads:v})).sort((a,b)=>b.loads-a.loads),
    byDriver:Object.entries(byDriver).map(function(e){const v=e[1];
      const cars=Object.keys(v.carriers).sort(function(a,b){return v.carriers[b]-v.carriers[a];});
      const sufs=Object.keys(v.sufs).sort(function(a,b){return v.sufs[b]-v.sufs[a];});
      const hist=cars.length?cars:sufs;
      return {driver:v.name,carrier:hist[0]||'',carriers:hist,switched:hist.length>1,
        loads:v.loads,revenue:Math.round(v.revenue),fsc:Math.round(v.fsc),avg_net:(v.nn?Math.round(v.nw/v.nn):0),avg_gross:(v.gn?Math.round(v.gw/v.gn):0),days:Object.keys(v.dates).length,dates:v.dates};
    }).sort((a,b)=>b.loads-a.loads),
    downtimes:Object.entries(dCat).map(([k,v])=>({category:k,minutes:+v.toFixed(1)})).sort((a,b)=>b.minutes-a.minutes),
    cycleTimes:Object.entries(cyc).map(([k,v])=>({terminal:k,load:avg2(v.load),transit:avg2(v.transit),unload:avg2(v.unload),full:avg2(v.full)})),
    wt:{days:Object.values(wtDay).map(function(v){return [v.d,v.t,v.l,v.nn?Math.round(v.nw/v.nn):0,v.gn?Math.round(v.gw/v.gn):0,v.ov,v.lw,Math.round(v.rev),Math.round(v.fsc)];}).sort(function(a,b){return a[0]<b[0]?-1:a[0]>b[0]?1:(a[1]<b[1]?-1:1);}),
        hrs:Object.values(wtHr).map(function(v){return [v.d,v.h,v.t,v.l,v.nn?Math.round(v.nw/v.nn):0,v.gn?Math.round(v.gw/v.gn):0,v.ov];}).sort(function(a,b){return a[0]<b[0]?-1:a[0]>b[0]?1:(a[1]-b[1]);}),
        dd:Object.keys(revByDay).sort().map(function(d){return [d,(drvByDay[d]?drvByDay[d].size:0),Math.round(revByDay[d]||0),Math.round(fscByDay[d]||0)];}),
        ovL:ovList},
    stages, inventory,
    roster:_ROS, /* v10.9: horas reales (At Terminal → entrega, offline corregido) + estimador ponderado + pozos pasados · v11.1: armado antes */
    assets:{ moves:aMoves, revenue:Math.round(aRev), cost:Math.round(aCost), margin:Math.round(aRev-aCost),
      events:aEvents.sort((a,b)=>String(b.date).localeCompare(String(a.date))) },
    downtime_open_events:dtOpen,
    downtimeEvents:dtEvents.sort((a,b)=>b.hours-a.hours),
    cycleDaily:Object.keys(cycDay).sort().map(d=>({date:d,terminal:avg2(cycDay[d].te),transit:avg2(cycDay[d].tr),offload:avg2(cycDay[d].of)})),
    cycleDailyByTerm:Object.values(cycDayT).map(v=>({date:v.date,terminal:v.terminal,load_min:avg2(v.te),transit_min:avg2(v.tr),offload_min:avg2(v.of),loads:v.n})).sort((a,b)=>a.date<b.date?-1:(a.date>b.date?1:(a.terminal<b.terminal?-1:1))),
    statusBoard,
    statusByHour:hours.map(h=>({hour:h,statuses:statusByHour[h],active:actHr[h]||0}))
  };
}

// ---------- v10.9 · Truck roster aprendido — horas REALES por driver ----------
/* Reloj del roster: cada carga es un intervalo [arranque, fin] en horas absolutas de pared (Central).
   arranque = At Terminal (validado: 0.2–5 h antes del fin; p98 real = 4–4.6 h) · fin = Delivered; si la entrega fue
   OFFLINE ("Delivered Offline" = Yes) el sello llega cuando el teléfono sincroniza (hasta 6 h tarde)
   → fin = In Transit + tránsito típico del pad. BLOQUE = cargas encadenadas (espera <4 h cuenta);
   JORNADA = bloques con descanso <6 h (split shift: se suman, la pausa no) fechada por su ARRANQUE
   (el nocturno que cruza medianoche es UNA jornada; v11.0: si arranca de 22:00 en adelante cuenta
   para el día siguiente). Dato real: los descansos están en 8–10 h y
   10 h+, casi nada entre 4 y 6 h. v11.2 · UN driver por camión (la flota no corre con dos drivers): un
   bloque corrido de >24 h (sin pausa de 4 h) es una CORRIDA CONTINUA — sus horas reales se reparten por día
   calendario y se marcan (dh[7]=1 · cx) para revisar HOS (14 h de ventana · 10 h de descanso); NO enseñan su
   patrón y nunca se proyecta 24/7.
   ENSEÑAN: jornadas CERRADAS de operación después del día-1 del pozo y después de la PRIMERA
   jornada del driver en el pad (nunca la jornada en curso). PRECEDENCIA: ≥3 jornadas que enseñan
   → este pad · 1–2 → este pad mezclado con su historial (pozo pasado, prefill o 12 h) · 0
   (prefill, día-1, su primer día) → POZOS PASADOS · prefill · todas sus jornadas · NUEVO (primer
   viaje sin historial) = 12 h desde su arranque real. Estimador ponderado _hrsEst, no promedio simple. */
const _RS={GAPB:4,GAPD:6,LAGMAX:5,CONT:24,ODAY:2,END:0.25,OPEN:3,DAYMAX:20,BLKMAX:17,LEG:1.5,LEGIT:1.2,AGE:0.7,WIN:8,XWD:14};
/* v11.1 · tramo típico del pad (h): Delivered − At Terminal y Delivered − In Transit de entregas EN LÍNEA */
function _medN(a){if(!a.length)return null;const s=a.slice().sort(function(x,y){return x-y;});const k=s.length>>1;return s.length%2?s[k]:(s[k-1]+s[k])/2;}
/* tramos de entregas EN LÍNEA: At Terminal→Delivered, In Transit→Delivered, At Staging→Delivered y el tránsito
   In Transit→At Staging — del pad y POR TERMINAL (≥5 cargas): una terminal a 99 mi no usa el tramo de la de 20 mi */
function _legOf(rosterEv){const G={a:[],i:[],s:[],t:[]},TT={};
  const add=function(k,tm,v){G[k].push(v);if(tm){const T=TT[tm]=TT[tm]||{a:[],i:[],s:[],t:[]};T[k].push(v);}};
  Object.keys(rosterEv||{}).forEach(function(k){(rosterEv[k]||[]).forEach(function(x){if(!x||typeof x==='number'||x.off||x.dv==null)return;
    if(x.at!=null){const g=x.dv-x.at;if(g>=0.2&&g<=8)add('a',x.tm,g);}
    if(x.it!=null){const g=x.dv-x.it;if(g>=0.05&&g<=6)add('i',x.tm,g);}
    if(x.as!=null){const g=x.dv-x.as;if(g>=0&&g<=3)add('s',x.tm,g);if(x.it!=null){const t2=x.as-x.it;if(t2>=0.05&&t2<=8)add('t',x.tm,t2);}}});});
  const M=function(a){return a.length>=5?_medN(a):null;},T={};
  Object.keys(TT).forEach(function(tm){const Q=TT[tm];T[tm]={LEG:M(Q.a),LEGI:M(Q.i),LEGS:M(Q.s),TRS:M(Q.t)};});
  return {LEG:_medN(G.a)||_RS.LEG,LEGI:_medN(G.i)||_RS.LEGIT,LEGS:M(G.s),TRS:M(G.t),T:T};}
/* fin REAL de una entrega (h absolutas). OFFLINE ("Delivered Offline" = Yes: el sello — y casi siempre el At Dest —
   llegan al sincronizar): At Staging + su tramo típico a Delivered (si el At Staging es real: tránsito creíble desde
   In Transit) → In Transit + tránsito típico → At Terminal + tramo típico; por terminal cuando hay ≥5 cargas en
   línea, si no el del pad. Nunca después del sello. */
function _realEnd(x,LG){let e=+x.dv;if(!x.off)return e;
  const T=(x.tm&&LG.T&&LG.T[x.tm])||{};const lgA=T.LEG||LG.LEG,lgI=T.LEGI||LG.LEGI,lgS=T.LEGS!=null?T.LEGS:LG.LEGS,trS=T.TRS||LG.TRS;
  const itOk=x.it!=null&&x.it<=x.dv&&(x.at==null||x.it>=x.at-0.05), atOk=x.at!=null&&x.at<=x.dv;
  const asOk=lgS!=null&&x.as!=null&&x.as<=x.dv-0.05&&(x.at==null||x.as>=x.at)&&(x.it==null||(x.as>=x.it-0.05&&x.as-x.it<=(trS?Math.max(trS*1.6,trS+1.5):6)));
  const b=asOk?x.as+lgS:(itOk?x.it+lgI:(atOk?x.at+lgA:null));if(b!=null&&b<e-0.05)e=b;
  return e;}
/* reparte [s,e) (h absolutas) en horas de pared: A['YYYY-MM-DD'][hora] += fracción de esa hora */
function _acAdd(A,s,e){if(!(e>s))return;for(let h=Math.floor(s);h<e;h++){const a=Math.max(s,h),b=Math.min(e,h+1);if(b<=a)continue;
  const d=_hD(h),hh=Math.floor(_clk(h)+1e-9);const R=A[d]=A[d]||new Array(24).fill(0);R[hh]+=b-a;}}
function _absH(d){const m=String(d||'').match(/(\d{4})-(\d{2})-(\d{2})/);
  return m?Date.UTC(+m[1],+m[2]-1,+m[3])/3600000:0;}
function _nrm(n){return String(n||'').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Z ]/g,' ').replace(/\s+/g,' ').trim();}
/* 'YYYY-MM-DD HH' o 'YYYY-MM-DD HH:MM' → hora absoluta */
function _lastH(s){const m=String(s||'').match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2})(?::(\d{2}))?/);
  if(!m)return null;return Date.UTC(+m[1],+m[2]-1,+m[3])/3600000+(+m[4])+(m[5]?(+m[5])/60:0);}
function _r1(x){return Math.round((+x||0)*10)/10;}
function _clk(hA){return ((hA%24)+24)%24;}
/* hora absoluta → 'YYYY-MM-DD HH' (o 'YYYY-MM-DD HH:MM' con wm) */
function _hTo(hA,wm){const mins=Math.round(hA*60);const dd=Math.floor(mins/1440);const dt=new Date(dd*86400000);
  const p=function(n){return ('0'+n).slice(-2);};const r=mins-dd*1440;
  return dt.getUTCFullYear()+'-'+p(dt.getUTCMonth()+1)+'-'+p(dt.getUTCDate())+' '+p(Math.floor(r/60))+(wm?':'+p(r%60):'');}
function _hD(hA){return _hTo(hA).slice(0,10);}
/* ESTIMADOR PONDERADO de horas/día (días en orden cronológico; prior = su historial o 12 h):
   · patrón repetido (≥3 días a ±1 h y ≥ la mitad) → 50% el valor repetido + 25% último día + 25% media
   · días bajos (< 65% de la mediana) y el último día SOBRE la media → 50% último día + 50% media
   · el último día es el bajo (día parcial) → 50% mediana + 50% media de los días completos
   · dos días bajos seguidos al final → media con peso por recencia (el cambio es real)
   · días parejos → 50% media por recencia + 50% mediana
   · 1–2 días → se mezcla con el prior (1 día = 50%, 25% si fue un día muy corto · 2 días = 67%) */
function _hrsEst(days,prior,cap){cap=cap||18;
  const xs=(days||[]).map(Number).filter(function(x){return isFinite(x)&&x>0;}).map(function(x){return Math.min(24,Math.max(0.5,x));});
  const n=xs.length, P=(prior!=null&&isFinite(+prior)&&+prior>0)?Math.min(cap,Math.max(4,+prior)):12;
  if(!n)return {v:_r1(P),m:'prior',n:0,pr:_r1(P),w:0};
  const sum=function(a){return a.reduce(function(s,x){return s+x;},0);};
  const mean=sum(xs)/n, srt=xs.slice().sort(function(a,b){return a-b;});
  const med=n%2?srt[(n-1)/2]:(srt[n/2-1]+srt[n/2])/2, L=xs[n-1];
  let ws=0,wx=0;for(let i=0;i<n;i++){const w=Math.pow(0.6,n-1-i);ws+=w;wx+=w*xs[i];}const ew=wx/ws;
  let C=null,cn=0;
  if(n>=3)for(let i=n-1;i>=0;i--){const c=xs.filter(function(x){return Math.abs(x-xs[i])<=1;});
    if(c.length>cn){cn=c.length;C=sum(c)/c.length;}}
  const ref=n>=2?med:P, lowT=0.65*ref;
  const lowN=xs.filter(function(x){return x<lowT;}).length;
  let v,m;
  if(C!=null&&cn>=Math.max(3,Math.ceil(n/2))){v=0.5*C+0.25*L+0.25*mean;m='pattern';}
  else if(lowN&&lowN<n){
    const Llow=L<lowT;
    if(!Llow&&L>mean){v=0.5*L+0.5*mean;m='dip-last';}
    else if(Llow&&n>=3&&xs[n-2]<lowT){v=ew;m='trend-down';}
    else{const full=xs.filter(function(x){return x>=lowT;});v=0.5*med+0.5*(sum(full)/full.length);m='dip-skip';}}
  else{v=0.5*ew+0.5*med;m='trend';}
  let w=1;
  if(n<=2){w=n/(n+1);if(n===1&&L<0.65*P)w=0.25;v=w*v+(1-w)*P;}
  v=Math.min(cap,Math.max(4,v));
  return {v:_r1(v),m:m,n:n,mean:_r1(mean),med:_r1(med),last:_r1(L),mode:m==='pattern'?_r1(C):null,low:lowN,
    w:Math.round(w*100)/100,pr:n<=2?_r1(P):null};}
/* arranque típico: media CIRCULAR con peso por recencia; descarta arranques a >5 h del centro */
function _startEst(xs,ws){const n=xs.length;if(!n)return {h:0,R:0};
  const run=function(ix){let vx=0,vy=0,W=0;ix.forEach(function(i){const a=xs[i]/24*2*Math.PI,w=ws?ws[i]:1;
      vx+=w*Math.cos(a);vy+=w*Math.sin(a);W+=w;});
    let h=Math.atan2(vy,vx)/(2*Math.PI)*24;if(h<0)h+=24;return {h:h,R:W?Math.sqrt(vx*vx+vy*vy)/W:0};};
  const all=xs.map(function(_,i){return i;});let r=run(all);
  if(n>=3){const keep=all.filter(function(i){let d=Math.abs(xs[i]-r.h)%24;if(d>12)d=24-d;return d<=5;});
    if(keep.length>=2&&keep.length<n)r=run(keep);}
  return r;}
function _cblend(h1,h2,w){const a1=h1/24*2*Math.PI,a2=h2/24*2*Math.PI;
  let h=Math.atan2(w*Math.sin(a1)+(1-w)*Math.sin(a2),w*Math.cos(a1)+(1-w)*Math.cos(a2))/(2*Math.PI)*24;
  if(h<0)h+=24;return h;}
/* mapa horario: cuánto de cada hora cubrieron sus días (fracción de la hora, peso por recencia) */
function _hwOf(recs,ws){const p=new Array(24).fill(0);let W=0;
  recs.forEach(function(r,i){const w=ws?ws[i]:1;W+=w;const cov={};
    r.bl.forEach(function(t){const e=t.e+_RS.END;for(let H=Math.floor(t.s);H<e;H++){
      const ov=Math.min(H+1,e)-Math.max(H,t.s);if(ov>0){const h=_clk(H);cov[h]=Math.min(1,(cov[h]||0)+ov);}}});
    Object.keys(cov).forEach(function(h){p[+h]+=w*cov[h];});});
  return W?p.map(function(x){return x/W;}):p;}
/* calibra el mapa para que sume sus horas estimadas (tope 1 por hora) — forma = historia, volumen =
   estimador: escala uniforme, reparte lo que pase de 1 y, si aún faltan horas, alarga la ventana por
   sus bordes (primero al final del turno, luego antes del arranque) */
function _hwCal(p,target){const q0=p.slice();const S=q0.reduce(function(a,x){return a+x;},0);
  if(!(target>0)||!(S>0))return q0;
  let q=q0.map(function(x){return x*target/S;});
  for(let it=0;it<10;it++){let ex=0,fr=0;q.forEach(function(x){if(x>1)ex+=x-1;else if(x<1)fr+=x;});
    if(ex<=1e-9)break;q=q.map(function(x){return x>=1?1:(fr>0?x+ex*x/fr:x);});}
  q=q.map(function(x){return Math.min(1,x);});
  let def=target-q.reduce(function(a,x){return a+x;},0);
  for(let g=0;g<48&&def>0.05;g++){let k=-1;
    for(let h=0;h<24&&k<0;h++)if(q[h]<0.999&&q[(h+23)%24]>=0.999)k=h;          /* justo después de una hora llena */
    for(let h=0;h<24&&k<0;h++)if(q[h]<0.999&&q[(h+1)%24]>=0.999)k=h;           /* justo antes */
    if(k<0){let bi=-1,bv=-1;for(let h=0;h<24;h++)if(q[h]<0.999&&q[h]>bv){bv=q[h];bi=h;}k=bi;}
    if(k<0)break;const add=Math.min(1-q[k],def);q[k]+=add;def-=add;}
  return q;}
function _hwEnc(p){return p.map(function(x){return Math.max(0,Math.min(9,Math.round(x*9)));}).join('');}
function _hwDec(s){return String(s||'').split('').map(function(c){return (+c||0)/9;});}
/* ── herencia entre pozos (pozos pasados): rosters LOCALES cacheados de pozos Live y cerrados ≤14 días ── */
function _xrSlim(rows){return (rows||[]).filter(function(r){return r&&r.d&&+r.sp>0&&(+r.sh||0)>=2&&r.src!=='xwell'&&!r.tm&&!(r.hx&&r.hx.ps==='xwell'&&(+r.ln||0)<3);})
  .map(function(r){return {d:r.d,c:r.c||'',aS:+r.aS,sp:+r.sp,sh:+r.sh,hw:r.hw||'',last:r.last,src:r.src,q:(r.src==='pump'?2:1)};});}
function _xrPut(id,loc){try{
  const slim=Array.isArray(loc)?_xrSlim(loc):Object.keys(loc||{}).map(function(k){return loc[k];});
  if(slim.length)_cPut('xr9:'+id,{at:new Date().toISOString(),roster:slim},21600);
}catch(_){}}
function _xrGet(id){const o=_cGet('xr9:'+id);return (o&&o.roster)?o.roster:null;} /* v10.9: la caché vieja (xr:) pudo traer drivers pegados de otro pozo */
function _verN(v){const m=String(v||'').match(/v(\d+)\.(\d+)/);return m?(+m[1])*100+(+m[2]):0;}
function _xrFromSnap(id){try{const s=_snapGet(id);if(!(s&&s.text))return null;const j=JSON.parse(s.text);
  if(!(j&&_verN(j.api_version)>=_verN('v10.9')))return null; /* rosters viejos pudieron traer drivers pegados de otro pozo */
  const slim=_xrSlim(j&&j.roster);if(slim.length)_cPut('xr9:'+id,{at:new Date().toISOString(),roster:slim,snap:1},21600);
  return slim;}catch(_){return null;}}
function _regCached(){let r=_cGet('rg5');if(r)return r;
  try{r=getRegistry();_cPut('rg5',r,600);return r;}catch(_){return null;}}
function _xwPool(selfId,gMax){
  const reg=_regNow();const lim=(+gMax||0)-_RS.XWD*24;const pool={};let snapN=0;
  const ws=((reg&&reg.wells)||[]).filter(function(w){const wid=String(w.well_id||'');if(!wid||wid===String(selfId))return false;
    const st=String(w.status||'').toLowerCase();if(st==='live')return true;
    if(st==='closed'){const e=_effISO(w.end_date||'');return !!e&&_absH(e)+24>=lim;}return false;})
    .sort(function(a,b){const ea=String(a.status).toLowerCase()==='live'?'9999':_effISO(a.end_date||''),eb=String(b.status).toLowerCase()==='live'?'9999':_effISO(b.end_date||'');return ea<eb?1:ea>eb?-1:0;});
  ws.forEach(function(w){const wid=String(w.well_id);let rows=_xrGet(wid);
    if(!rows&&String(w.status).toLowerCase()==='closed'&&snapN<2){snapN++;rows=_xrFromSnap(wid);}
    (rows||[]).forEach(function(d){if(!(d&&d.d&&+d.sp>0&&(+d.sh||0)>=2)||d.src==='xwell')return;
      const lh=_lastH(d.last);if(lh==null||lh<lim)return;
      const k=_nrm(d.d);(pool[k]=pool[k]||[]).push({id:wid,aS:+d.aS||0,sp:+d.sp,hw:(typeof d.hw==='string'&&d.hw.length===24)?d.hw:'',
        lh:lh,c:String(d.c||''),last:d.last,q:+d.q||(d.src==='pump'?2:1)});});});
  return pool;}
function _xwFind(pool,name,carrier){const list=pool&&pool[_nrm(name)];if(!list||!list.length)return null;const lc=String(carrier||'');
  return list.slice().sort(function(a,b){return (b.q-a.q)||(((b.c===lc)?1:0)-((a.c===lc)?1:0))||(b.lh-a.lh);})[0];}
function _xwPoolLazy(selfId){let P=null,done=false;
  return function(gMax){if(done)return P;done=true;try{P=_xwPool(selfId,gMax);}catch(_){P=null;}return P;};}
/* rosterEv[drv] = [{dv,at,it,ad,off}] (horas absolutas de pared, minutos) · v9.x pasaba horas enteras de Delivered */
function _rosterBuild(rosterEv,byDriver,pumpSet,opt){
  opt=opt||{};const out=[];
  const med=function(a){if(!a.length)return null;const s=a.slice().sort(function(x,y){return x-y;});const k=s.length>>1;return s.length%2?s[k]:(s[k-1]+s[k])/2;};
  const N=function(x){return (typeof x==='number')?{dv:x+0.5,at:null,it:null,ad:null,off:0}:x;};
  const _LG=opt.lg||_legOf(rosterEv);const LEG=_LG.LEG, LEGI=_LG.LEGI; /* v11.1: el mismo tramo típico que la serie por hora */
  let offFix=0,hvN=0;
  const toSE=function(x0){const x=N(x0);const e=_realEnd(x,_LG);if(e<+x.dv-0.05)offFix++; /* v11.1: At Staging + tramo típico POR TERMINAL */
    let s=null;if(x.at!=null){const g=e-x.at;
      if(g>=0.2&&g<=_RS.LAGMAX)s=+x.at;
      /* espera larga EN EL POZO: llegó a tiempo (carga ≤3 h, tránsito ≤3 h) y esperó para descargar → esas horas cuentan */
      else if(g>_RS.LAGMAX&&g<=8&&x.it!=null&&x.ad!=null&&x.it>=x.at-0.05&&x.it-x.at<=3&&x.ad>=x.it-0.05&&x.ad-x.it<=3&&e>=x.ad-0.05)s=+x.at;}
    if(s==null)s=e-((x.tm&&_LG.T&&_LG.T[x.tm]&&_LG.T[x.tm].LEG)||LEG); /* v11.1: tramo de SU terminal */
    return {s:s,e:e};};
  const EV={};let gMax=-1e15,fut=0;const NOWH=(opt.nowH!=null&&isFinite(+opt.nowH))?+opt.nowH:null;
  Object.keys(rosterEv).forEach(function(drv){const ev=(rosterEv[drv]||[]).map(toSE).filter(function(x){
        if(!(isFinite(x.s)&&isFinite(x.e)))return false;
        if(NOWH!=null&&x.e>NOWH+1){fut++;return false;}   /* entrega con fecha FUTURA = error de captura: no mueve el reloj */
        return true;}).sort(function(a,b){return a.s-b.s;});
    if(ev.length){EV[drv]=ev;ev.forEach(function(x){if(x.e>gMax)gMax=x.e;});}});
  if(NOWH!=null&&gMax>NOWH)gMax=NOWH;
  const nowH=NOWH!=null?NOWH:gMax;
  let startDay=null;pumpSet.forEach(function(dd){if(!startDay||dd<startDay)startDay=dd;});
  const poolF=(typeof opt.pool==='function')?opt.pool:function(){return opt.pool||null;};
  Object.keys(EV).forEach(function(drv){
    const ev=EV[drv];
    /* BLOQUES: intervalos fusionados; un hueco < GAPB es espera dentro del turno (cuenta) */
    const bl=[];let cur={s:ev[0].s,e:ev[0].e,n:1};
    for(let i=1;i<ev.length;i++){const x=ev[i];
      if(x.s-cur.e>=_RS.GAPB){bl.push(cur);cur={s:x.s,e:x.e,n:1};}else{if(x.e>cur.e)cur.e=x.e;cur.n++;}}
    bl.push(cur);
    const isCont=function(b){return (b.e-b.s)>_RS.CONT;}; /* v11.2 · >24 h sin una pausa de 4 h = CORRIDA CONTINUA de un driver (revisar HOS) */
    if(opt.acc)bl.forEach(function(b,bi){const cxB=isCont(b); /* v11.1: horas EN TURNO por hora · v11.2: la corrida cuenta completa (es lo que registró su app) */
      let z=cxB?b.e:Math.min(b.e+_RS.END,b.s+_RS.BLKMAX);
      if(bi===bl.length-1&&(gMax-b.e)<_RS.OPEN&&(nowH-b.e)<12)z=Math.max(z,cxB?gMax:Math.min(gMax,b.s+_RS.BLKMAX)); /* turno ABIERTO: en turno hasta el reloj del dato (va con su siguiente carga) */
      _acAdd(opt.acc,b.s,z);});
    /* JORNADAS: bloques con descanso < GAPD = misma jornada (split shift: se suman, la pausa no) ·
       la jornada se fecha con el día de su ARRANQUE (el nocturno que cruza medianoche es UNA jornada) */
    const dps=[];let J={bl:[bl[0]]};
    for(let i=1;i<bl.length;i++){const b=bl[i];
      if(b.s-J.bl[J.bl.length-1].e>=_RS.GAPD||(b.e-J.bl[0].s)>24){dps.push(J);J={bl:[b]};}else J.bl.push(b);} /* jornada nunca >24 h */
    dps.push(J);
    const recs=[],runs=[];
    dps.forEach(function(J2,ji){const s0=J2.bl[0].s,e0=J2.bl[J2.bl.length-1].e;
      const cl=ji<dps.length-1||(gMax-e0)>=_RS.GAPD||(nowH-e0)>=12;  /* cerrada: hubo otra después, ya pasó un descanso o el dato se detuvo */
      const cont=J2.bl.some(isCont); /* v11.2 · un BLOQUE corrido de >24 h (sin pausa de 4 h) = corrida continua de UN driver */
      if(!cont){let h=0,n=0;J2.bl.forEach(function(b){h+=Math.min(_RS.BLKMAX,(b.e-b.s)+_RS.END);n+=b.n||0;});
        /* v11.0 · día OPERATIVO: la jornada que arranca de 22:00 en adelante cuenta para el día siguiente
           (quien entra 23:54 trabaja ESE día) — el resto se fecha por su arranque */
        recs.push({d:_hD(s0+_RS.ODAY),h:Math.min(_RS.DAYMAX,h),st:_clk(s0),bl:J2.bl,cl:cl,cx:0,s0:s0,e0:e0,n:n});return;}
      /* v11.2 · CORRIDA CONTINUA: sus horas reales por día calendario, marcadas para revisar HOS — no es un turno legal,
         así que no enseña su patrón (ni su arranque ni su largo) */
      const rid=runs.length+1,nR=J2.bl.reduce(function(a,b){return a+(b.n||0);},0);
      runs.push([_hTo(s0,1),_hTo(e0,1),_r1(e0-s0),nR,cl?0:1]);
      for(let d0=Math.floor(s0/24)*24;d0<e0;d0+=24){const d1=d0+24,parts=[];let h=0;
        J2.bl.forEach(function(b){const a2=Math.max(b.s,d0),z=Math.min(b.e,d1);if(z>a2){parts.push({s:a2,e:z});h+=z-a2;}});
        if(!parts.length)continue;
        const pn=ev.filter(function(x){return x.e>=d0&&(x.e<d1||d1>=e0)&&x.e>=s0-1e-6&&x.e<=e0+1e-6;}).length; /* v11.2: solo las cargas de la corrida (no las de otra jornada del mismo día) */
        recs.push({d:_hD(d0),h:Math.min(24,h),st:_clk(parts[0].s),bl:parts,cl:cl||d1<=e0,cx:rid,s0:parts[0].s,e0:parts[parts.length-1].e,n:pn});}});
    const firstDay=recs[0].d;
    recs.forEach(function(r){r.k=!r.cl?'open':(r.d===firstDay?'f':(startDay&&r.d===startDay?'d1':((!startDay||r.d<startDay)?'pf':'p')));});
    const P=recs.filter(function(r){return r.k==='p'&&!r.cx;}).slice(-_RS.WIN); /* v11.2: la corrida continua no enseña */
    const PF=recs.filter(function(r){return r.k==='pf'&&!r.cx;}).slice(-_RS.WIN);
    const A=recs.filter(function(r){return r.cl&&!r.cx;}).slice(-_RS.WIN);
    const D=byDriver[drv]||{name:drv,dates:{},loads:ev.length,carriers:{}};
    const nm=D.name||drv;
    const cars=Object.keys(D.carriers||{}).sort(function(a,b){return D.carriers[b]-D.carriers[a];});
    const H=function(a){return a.map(function(r){return r.h;});};
    const lastJ=dps[dps.length-1],ls={s:lastJ.bl[0].s,e:lastJ.bl[lastJ.bl.length-1].e};
    const CX=runs.length>0; /* v11.2: tuvo una corrida continua (alerta HOS) — su proyección sigue siendo la de UN driver */
    if(CX)hvN++;
    const CAP=18, P12=12;
    let xw=null;if(P.length<3){const pool=poolF(gMax);xw=pool?_xwFind(pool,nm,cars[0]):null;}
    let src,base,est,prior=null,ps='';
    if(P.length>=3){src='pump';base=P;est=_hrsEst(H(P),null,CAP);}
    else{
      if(xw){prior=xw.sp;ps='xwell';}
      else if(PF.length>=2){prior=_hrsEst(H(PF),P12,CAP).v;ps='prefill';}
      else{prior=P12;ps='12h';}
      if(P.length){src='pump';base=P;est=_hrsEst(H(P),prior,CAP);}
      else if(xw){src='xwell';base=[];est={v:_r1(Math.min(18,Math.max(4,xw.sp))),m:'xwell',n:0,pr:_r1(xw.sp),w:0};}
      else if(PF.length>=2){src='prefill';base=PF;est=_hrsEst(H(PF),P12,CAP);ps='12h';}
      else if(A.length){src='all';base=A;est=_hrsEst(H(A),P12,CAP);ps='12h';}
      else if(CX){src='cx';base=[];est={v:P12,m:'cx',n:0,pr:P12,w:0};ps='12h';} /* v11.2: solo tiene la corrida continua → 12 h legales (no es "nuevo") */
      else{src='new';base=[];est={v:P12,m:'new',n:0,pr:P12,w:0};ps='12h';}}
    const ws=base.map(function(_,i){return Math.pow(_RS.AGE,base.length-1-i);});
    let aS=_clk(ls.s),R=0,p=null;
    if(base.length){const se=_startEst(base.map(function(r){return r.st;}),ws);aS=se.h;R=se.R;p=_hwOf(base,ws);}
    if(src==='pump'&&P.length<3&&ps==='xwell'){const wL=est.w!=null?est.w:1;aS=_cblend(aS,xw.aS,wL);
      if(xw.hw){const q=_hwDec(xw.hw);p=p.map(function(v,i){return wL*v+(1-wL)*q[i];});}}
    if(src==='xwell'){aS=xw.aS;p=xw.hw?_hwDec(xw.hw):null;}
    const sp=est.v;
    const hw=(p&&src!=='new')?_hwEnc(_hwCal(p,sp)):'';
    /* roster LOCAL puro para los demás pozos (sin herencia: no hay cadenas) · v11.2: sin la corrida continua (P y A ya la excluyen) */
    if(opt.loc){let lb=null,lq=0;if(P.length>=2){lb=P;lq=2;}else if(A.length>=2){lb=A;lq=1;}
      if(lb){const le=_hrsEst(H(lb),lb.length>=3?null:12),lw=lb.map(function(_,i){return Math.pow(_RS.AGE,lb.length-1-i);});
        opt.loc[_nrm(nm)]={d:nm,c:cars[0]||'',aS:_r1(_startEst(lb.map(function(r){return r.st;}),lw).h),sp:le.v,sh:lb.length,
          hw:_hwEnc(_hwCal(_hwOf(lb,lw),le.v)),last:_hTo(ls.e),src:lq===2?'pump':'all',q:lq};}}
    let pl=0,pdd=0,ol=0,odd=0;const dates=Object.keys(D.dates||{});
    dates.forEach(function(dd){if(pumpSet.has(dd)){pl+=D.dates[dd];pdd++;}
      if(!startDay||dd>=startDay){ol+=(+D.dates[dd]||0);odd++;}});
    if(!dates.length){ol=ev.length;odd=0;}
    const sk=recs.filter(function(r){return base.indexOf(r)<0&&(r.k!=='p'||r.cx);}).slice(-5).map(function(r){return [r.d.slice(5),r.cx?'cx':r.k];}); /* v11.2: la corrida continua se anota 'cx' */
    const lastE=ev.reduce(function(m,x){return x.e>m?x.e:m;},-1e15);
    out.push({d:nm,c:cars[0]||'',n:ol,sh:base.length,
      aS:_r1(aS),sp:sp,
      tp:pdd?+(pl/pdd).toFixed(2):0,days:odd,pd:pdd,
      fs:_hTo(ev[0].s),last:_hTo(lastE),
      nwA:(D.nn?Math.round(D.nw/D.nn):0),gwA:(D.gn?Math.round(D.gw/D.gn):0),
      nw:src==='new',nwS:_hTo(ls.s,1),src:src,
      shd:base.slice(-6).map(function(r){return [r.d.slice(5),_r1(r.st),_r1(r.h)];}),
      /* v11.0 · TODAS sus jornadas en este pad: [día, arranque, fin (h desde las 00:00 de ese día),
         horas, loads, clase (p enseña · f su 1er día · d1 día-1 · pf prefill · open en curso),
         descanso previo (h), corrida continua] — el portal las muestra por día y saca la media ·
         v11.2: el descanso se mide también antes y después de una corrida (dentro de ella no hay descanso) */
      dh:recs.slice(-60).map(function(r,ri,A2){const D0=_absH(r.d),pv=ri>0?A2[ri-1]:null;
        return [r.d,Math.round((r.s0-D0)*100)/100,Math.round((r.e0-D0)*100)/100,_r1(r.h),r.n||0,r.k,(pv&&!(r.cx&&pv.cx===r.cx))?_r1(r.s0-pv.e0):null,r.cx?1:0];}),
      hw:hw,pw:src==='pump',
      cx:runs.slice(-3), /* v11.2 · corridas continuas [inicio, fin, horas, loads, abierta] → alerta HOS en el portal */
      xw:(src==='xwell'||ps==='xwell')?xw.id:'',xwL:(src==='xwell'||ps==='xwell')?xw.last:'',
      cs:_hTo(ls.s,1),lm:_hTo(lastE,1),op:((gMax-lastE)<_RS.OPEN&&(nowH-lastE)<12)?1:0,ch:_r1(Math.min(24,(lastE-ls.s)+_RS.END)),ln:P.length,
      hx:{m:est.m,n:est.n,mean:est.mean!=null?est.mean:null,med:est.med!=null?est.med:null,last:est.last!=null?est.last:null,
        mode:est.mode!=null?est.mode:null,low:est.low||0,w:est.w!=null?est.w:1,pr:est.pr!=null?est.pr:null,ps:ps,R:Math.round(R*100)/100,sk:sk}});});
  if(opt.stats){opt.stats.leg=_r1(LEG);opt.stats.legIT=_r1(LEGI);opt.stats.legST=_LG.LEGS!=null?_r1(_LG.LEGS):null;opt.stats.off_fixed=offFix;opt.stats.hos=hvN;opt.stats.future=fut;
    opt.stats.data_at=gMax>-1e15?_hTo(gMax,1):'';opt.stats.gapB=_RS.GAPB;opt.stats.gapD=_RS.GAPD;opt.stats.oday=_RS.ODAY;}
  return out.sort(function(a,b){return b.n-a.n;});}

// ---------- Status Live (?action=status · todos los pads del Hub) ----------
// Normaliza para matching de pads: minúsculas, sin acentos, guiones/puntuación→espacio, espacios colapsados.
// "26. (BAYSWATER) - Far Country" y "Bayswater - Far" → ambos contienen "bayswater far".
function _mnorm(s){return String(s||'').toLowerCase()
  .replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g,'-') /* v10.7: guiones Unicode (– — −) = guion normal */
  .replace(/[().,#/\\_-]+/g,' ').replace(/\s+/g,' ').trim();}
// v9.3.1 — localiza el spreadsheet del BOARD desde el IMPORTRANGE de la hoja status del Hub
// y lee su STATUS_LOG directo (headers Timestamp/Date/Hour/Pad/Status/Count/Shift del
// StatusTracker v2). Devuelve null si no hay IMPORTRANGE, no hay STATUS_LOG o no trae Shift.
function _statusDirect(hub){
  const sh=hub.getSheetByName(CFG.statusSheet); if(!sh)return null;
  // probe negativo cacheado 5 min: no reabrir el board en cada ?action=status
  let cache=null; try{cache=CacheService.getScriptCache();}catch(_c){}
  if(cache&&cache.get('fpcc_sd_no')==='1')return null;
  const R=Math.min(4,sh.getMaxRows()), C=Math.min(4,sh.getMaxColumns());
  const fml=sh.getRange(1,1,R,C).getFormulas();
  let id=null;
  for(let r=0;r<fml.length&&!id;r++)for(let c=0;c<fml[r].length&&!id;c++){
    const m=String(fml[r][c]||'').match(/IMPORTRANGE\s*\(\s*"([^"]+)"/i);
    if(m){const mm=m[1].match(/[-\w]{25,}/); if(mm)id=mm[0];}
  }
  const NO=function(){if(cache)try{cache.put('fpcc_sd_no','1',300);}catch(_e){} return null;};
  if(!id)return NO();
  const bs=SpreadsheetApp.openById(id);
  const bsh=bs.getSheetByName('STATUS_LOG'); if(!bsh)return NO();
  const lastR=bsh.getLastRow(); if(lastR<2)return NO();
  // PROBE BARATO: ¿las últimas filas traen turno en la columna G? (sin leer el log completo)
  const pn=Math.min(60,lastR);
  const tail=bsh.getRange(lastR-pn+1,7,pn,1).getValues();
  const isShift=function(x){const u=String(x==null?'':x).trim().toUpperCase();
    return !!u&&(u.indexOf('DAY')>=0||u.indexOf('NIGHT')>=0||u.indexOf('COVE')>=0||u==='SHIFT');};
  if(!tail.some(function(r){return isShift(r[0]);}))return NO();
  const v=bsh.getDataRange().getValues(); if(!v.length)return NO();
  let hr=-1;
  for(let i=0;i<Math.min(v.length,5);i++)
    if(v[i].some(function(c){return String(c).trim().toLowerCase()==='status';})){hr=i;break;}
  let H,li,rows;
  if(hr>=0){
    H=v[hr].map(function(x){return String(x).trim();});
    const HL=H.map(function(x){return x.toLowerCase();});
    const pick=function(){for(var i=0;i<arguments.length;i++){var j=HL.indexOf(arguments[i]);if(j>=0)return j;}return -1;};
    li={date_iso:pick('date','date_iso'),hour:pick('hour'),well:pick('pad','well'),
        status:pick('status'),count:pick('count')};
    if(li.date_iso<0||li.hour<0||li.well<0||li.status<0||li.count<0)return NO();
    if(pick('shift')<0)return NO();
    rows=v.slice(hr+1);
  }else{
    // v9.3.2: log SIN fila de header (histórico limpiado a mano) → layout fijo del tracker:
    // A Timestamp · B Date · C Hour · D Pad · E Status · F Count · G Shift
    H=['Timestamp','Date','Hour','Pad','Status','Count','Shift'];
    li={date_iso:1,hour:2,well:3,status:4,count:5};
    rows=v;
  }
  rows=rows.filter(function(r){return r.some(function(c){return c!=='';})&&!/^SHIFT$/i.test(String(r[4]||'').trim());});
  return {SL:{H:H,rows:rows},li:li};
}
function getStatus(days){
  days=Math.max(1,Math.min(180,+days||45));
  const hub=SpreadsheetApp.getActive();
  let SL=readTab(hub,CFG.statusSheet,'status');
  if(!SL) return {generated:new Date().toISOString(), latest:null, days:days, pads:[], error:'Status Log vacío o sin header "status"'};
  let li=colmap(SL.H,['date_iso','hour','well','status','count']);
  /* v9.3.1 CERO MANUAL: sin columna shift en el Hub -> leer el STATUS_LOG del board directo */
  if(!SL.H.some(function(hh){return /^shift/i.test(String(hh).trim());})){
    try{const dd=_statusDirect(hub); if(dd){SL=dd.SL; li=dd.li;}}
    catch(eD){Logger.log('statusDirect: '+eD);}
  }
  const cutISO=Utilities.formatDate(new Date(Date.now()-days*86400000),Session.getScriptTimeZone(),'yyyy-MM-dd');
  const _nrm=s=>String(s||'').toUpperCase().trim();
  const isAct=s=>{const u=_nrm(s);return CFG.activeStatuses.some(function(k){return u.indexOf(k)>=0;});};
  const isRest=s=>{const u=_nrm(s);return CFG.restingStatuses.some(function(k){return u.indexOf(k)>=0;});};
  // Racha Resting >2d — solo posible si el Status Log trae columna driver (snapshot por driver):
  const dIdx=SL.H.findIndex(function(hh){return /^driver/i.test(String(hh).trim());});
  // v9.3: columna shift opcional (DAY / NIGHT / COVERING por fila) → crew por turno exacto
  const sIdx=SL.H.findIndex(function(hh){return /^shift/i.test(String(hh).trim());});
  const shK=function(v){const u=String(v||'').toUpperCase();
    if(u.indexOf('COVER')>=0)return 'COVER';
    if(u.indexOf('NIGHT')>=0||u.indexOf('PM')===0)return 'NIGHT';
    if(u.indexOf('DAY')>=0||u.indexOf('AM')===0)return 'DAY';
    return '';};
  const R2H=+CFG.resting2dHours||48; const drv={};
  const kMs=function(k){const m=String(k).match(/(\d{4})-(\d{2})-(\d{2}) (\d{2})/);return m?new Date(+m[1],+m[2]-1,+m[3],+m[4]).getTime():0;};
  const wells={}; let latest='';
  for(const r of SL.rows){
    const wl=String(r[li.well]||'').trim(); if(!wl)continue;
    const di=fmtDate(r[li.date_iso]); if(!di||di<cutISO)continue;
    const hh=Math.max(0,Math.min(23,Math.round(num(r[li.hour]))));
    const st=String(r[li.status]||'').trim(); const n=num(r[li.count]); if(!st)continue;
    const key=di+' '+('0'+hh).slice(-2);
    if(key>latest)latest=key;
    const W=wells[wl]=wells[wl]||{k:{}};
    const c=W.k[key]=W.k[key]||{a:0,r:0,i:0};
    if(isAct(st))c.a+=n; else if(isRest(st))c.r+=n; else c.i+=n;
    const S2=W.s=W.s||{}; const bs=S2[key]=S2[key]||{}; bs[st]=(bs[st]||0)+n; // breakdown crudo por estado (chips del portal)
    if(sIdx>=0){const sk=shK(r[sIdx]); if(sk){const SB=W.sb=W.sb||{}; const bb=SB[key]=SB[key]||{};
      const o2=bb[sk]=bb[sk]||{}; o2[st]=(o2[st]||0)+n;}} // v9.3: por turno
    if(dIdx>=0){const dn=String(r[dIdx]||'').trim(); if(dn){const D=drv[dn]=drv[dn]||{};
      if(!D.firstKey||key<D.firstKey)D.firstKey=key;
      if(!D.lastKey||key>=D.lastKey){D.lastKey=key;D.lastRest=isRest(st);D.well=wl;}
      if(!isRest(st)&&(!D.lastNonRest||key>D.lastNonRest))D.lastNonRest=key;}}
  }
  // Reclasificacion "Resting +2d": drivers cuyo estado ACTUAL es Resting con racha >= R2H horas -> Inactive
  let r2moved=0;
  if(dIdx>=0&&latest){const lms=kMs(latest);
    Object.keys(drv).forEach(function(dn){const D=drv[dn];
      if(D.lastKey!==latest||!D.lastRest)return;
      const anchor=D.lastNonRest||D.firstKey; if(!anchor)return;
      const hrs=(lms-kMs(anchor))/3600000;
      if(hrs>=R2H){const W=wells[D.well]; if(!W)return;
        const c=W.k[latest]; if(c&&c.r>0){c.r-=1;c.i+=1;}
        const bs=(W.s&&W.s[latest])||null;
        if(bs){Object.keys(bs).forEach(function(st){if(isRest(st)&&bs[st]>0&&st.indexOf('+2d')<0){bs[st]-=1;if(bs[st]<=0)delete bs[st];}});
          bs['Resting +2d']=(bs['Resting +2d']||0)+1;}
        r2moved++;}});}
  let reg=[]; try{ reg=(getRegistry().wells)||[]; }catch(e){}
  const _regN=reg.map(function(w){return {w:w,n:w.log_match?_mnorm(w.log_match):''};});
  const pads=Object.keys(wells).map(wl=>{
    const K=Object.keys(wells[wl].k).sort();
    const ts=[],a=[],r=[],ii=[];
    K.forEach(k=>{const c=wells[wl].k[k];ts.push(k);a.push(c.a);r.push(c.r);ii.push(c.i);});
    const _wN=_mnorm(wl);
    const _mm=_regN.find(function(x){return x.n && _wN.indexOf(x.n)>=0;}); const m=_mm?_mm.w:null;
    if(CFG.statusOnlyRegistry && !m) return null;
    const lastK=K[K.length-1]||'';
    return { well:wl, well_id:m?m.well_id:null, name:m?m.name:null, reg_status:m?m.status:null,
      live:(lastK===latest), first:K[0]||'', last:lastK,
      on_duty_now:(a[a.length-1]||0)+(r[r.length-1]||0)+(ii[ii.length-1]||0),
      brk:(wells[wl].s&&wells[wl].s[lastK])||{},
      sbrk:(wells[wl].sb&&wells[wl].sb[lastK])||null, // v9.3: {DAY:{status:n},NIGHT:{...},COVER:{...}} o null
      ts:ts, a:a, r:r, i:ii };
  }).filter(Boolean).sort((x,y)=>(y.live-x.live)||(y.on_duty_now-x.on_duty_now));
  // Nombres crudos del Status Log que no cruzaron NINGÚN pad del Registry (para depurar log_match)
  const _unmatched=[];
  Object.keys(wells).forEach(function(wl){const _wN=_mnorm(wl);
    const hit=_regN.some(function(x){return x.n && _wN.indexOf(x.n)>=0;});
    if(!hit)_unmatched.push(wl);});
  return { generated:new Date().toISOString(), latest:latest, days:days, only_registry:!!CFG.statusOnlyRegistry,
    resting2d:{supported:dIdx>=0, hours:R2H, moved:r2moved},
    unmatched_wells:_unmatched.slice(0,20), pads:pads };
}

// Identidad de driver: el Load Report trae "Nombre Apellido XX" (XX = sufijo de carrier, 2-4
// MAYUSCULAS). El mismo driver aparece con sufijos distintos si cambia de carrier a mitad del pad
// ("Ricardo Garcia JE" vs "Ricardo Garcia MD") y el roster lo fragmentaba en dos filas con loads
// que "no cuadran" entre filtros de fecha. Clave = nombre SIN sufijo; el sufijo queda como
// respaldo de carrier cuando la columna Truck/Carrier viene vacia.
function driverKey(raw){
  const t=String(raw||'').replace(/\s+/g,' ').trim();
  if(!t)return {key:'',name:'',suf:''};
  const m=t.match(/^(.*?)\s+([A-Z]{2,4})$/);
  const name=m?m[1].trim():t, suf=m?m[2]:'';
  return {key:name.toUpperCase(), name:name, suf:suf};
}

// ---------- helpers ----------
function toMin(v){ if(v==null||v==='')return null;
  if(v instanceof Date) return v.getHours()*60+v.getMinutes();
  if(typeof v==='number') return v<=2? Math.round(v*1440): Math.round(v);
  const t=String(v).trim();
  let m=t.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/); if(m) return +m[1]*60+ +m[2];
  m=t.match(/(\d+)\s*h(?:rs?)?\.?\s*(\d+)?\s*m?/i); if(m) return +m[1]*60+(+m[2]||0);
  const n=parseFloat(t); return isFinite(n)?Math.round(n):null; }
function fmtT(v){ if(v instanceof Date) return ('0'+v.getHours()).slice(-2)+':'+('0'+v.getMinutes()).slice(-2);
  if(typeof v==='number'&&v<=2){const m=Math.round(v*1440);return ('0'+Math.floor(m/60)).slice(-2)+':'+('0'+(m%60)).slice(-2);}
  return String(v==null?'':v); }

function readTab(ss,name,keyword){const sh=ss.getSheetByName(name); if(!sh){_sigTap(name,null);return null;} const v=sh.getDataRange().getValues(); _sigTap(name,v); const h=findHeader(v,keyword); if(h<0)return null; return {H:v[h].map(x=>String(x).trim()),rows:v.slice(h+1).filter(r=>r.some(c=>c!==''))};}
// v7.0 — lee la pestaña con VALORES typed + DISPLAY strings alineados fila a fila.
// Los DISPLAY son el texto exacto que ves en la celda → inmunes a la zona horaria.
function readTabD(ss,name,keyword){const sh=ss.getSheetByName(name); if(!sh){_sigTap(name,null);return null;} const rg=sh.getDataRange(); const v=rg.getValues(),dv=rg.getDisplayValues(); _sigTap(name,v); const h=findHeader(v,keyword); if(h<0)return null;
  const keep=[]; for(let i=h+1;i<v.length;i++){ if(v[i].some(c=>c!=='')) keep.push(i); }
  return {H:v[h].map(x=>String(x).trim()), rows:keep.map(i=>v[i]), disp:keep.map(i=>dv[i]), rn:keep.map(i=>i+1)};} /* v10.9 rn = fila real de la hoja */
// Duración desde string de celda "0:57:00" | "18:27" | "1:36:30" → minutos. NUNCA usa TZ.
function hmsToMin(s){ if(s==null)return 0; const t=String(s).trim(); if(!t)return 0;
  const p=t.split(':'); if(p.length>=2){const h=+p[0]||0,mn=+p[1]||0,se=p.length>=3?(+p[2]||0):0; if(isFinite(h)&&isFinite(mn))return h*60+mn+se/60;}
  const n=parseFloat(t.replace(/[^\d.]/g,'')); return isFinite(n)?(n<48?n*60:n):0; } // decimal <48 = horas
// Hora del reloj desde el display: "19:33" · "22:42:26" · "7:48 a.m." · "1:42 p. m." · "12:01 AM". Solo-fecha → ''.
function timeOfDisp(s){ if(s==null)return ''; const t=String(s).trim(); if(!t)return '';
  const m=t.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*(?:([AaPp])\s*\.?\s*[Mm]\.?)?/); if(!m)return '';
  let h=+m[1]; const mn=m[2], ap=(m[3]||'').toUpperCase();
  if(ap==='P'&&h<12)h+=12; if(ap==='A'&&h===12)h=0;
  if(h===0&&mn==='00'&&!ap)return ''; // 0:00 sin am/pm = celda solo-fecha con formato hora → no inventar medianoche
  return ('0'+h).slice(-2)+':'+mn; }
// Fecha ISO desde display "6/28/2026" (M/D) o "28/6/2026" (D/M locale) o "2026-07-02". Sin TZ → sin off-by-one.
function dateOfDisp(s){ if(s==null)return ''; const t=String(s).trim(); if(!t)return '';
  let m=t.match(/(\d{4})-(\d{1,2})-(\d{1,2})/); if(m)return m[1]+'-'+('0'+m[2]).slice(-2)+'-'+('0'+m[3]).slice(-2);
  m=t.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if(m){let a=+m[1],b=+m[2],y=m[3]; if(y.length===2)y='20'+y;
    let mo=a,da=b; if(a>12&&b<=12){mo=b;da=a;} // "28/6/2026" → primer número >12 = día → voltear a M/D
    return y+'-'+('0'+mo).slice(-2)+'-'+('0'+da).slice(-2);}
  return ''; }
function findHeader(v,kw){for(let i=0;i<Math.min(v.length,25);i++) if(v[i].some(c=>String(c).trim()===kw)) return i; return -1;}
function colmap(H,names){const o={}; names.forEach(n=>o[n]=H.indexOf(n)); return o;}
function num(v){if(v==null||v==='')return 0; const n=parseFloat(String(v).replace(/[$,%]/g,'')); return isNaN(n)?0:n;}
function isBlankDate(v){ // Google Sheets pone 12/30/1899 en celdas de fecha vacías
  if(v===''||v==null)return true;
  if(v instanceof Date){const y=v.getFullYear(); return y<1901;}
  const sv=String(v).trim(); if(sv==='')return true;
  if(/1899|1900/.test(sv)&&/12\/30|12\/31|1\/1/.test(sv))return true;
  const d=new Date(sv); return !isNaN(d)&&d.getFullYear()<1901;}
function parseTS(v){if(!v)return null; if(isBlankDate(v))return null; const d=(v instanceof Date)?v:new Date(v); return isNaN(d)?null:d;}
function parseHMS(v,tz){if(v==null||v==='')return 0;
  // Celdas de duración: Sheets las entrega como Date de 1899 EN LA TZ DE LA HOJA.
  // getHours() usa la tz del SCRIPT → si difieren, mete un offset fantasma (+17h30m). Formatear en la tz correcta:
  if(v instanceof Date){const f=Utilities.formatDate(v,tz||Session.getScriptTimeZone(),'HH:mm:ss').split(':').map(Number);return f[0]*60+f[1]+f[2]/60;}
  if(typeof v==='number')return v<2?v*1440:v; const p=String(v).trim().split(':').map(Number); if(p.length===3)return p[0]*60+p[1]+p[2]/60; if(p.length===2)return p[0]*60+p[1]; return num(v);}
function avg2(a){return a[1]?+(a[0]/a[1]).toFixed(1):0;}
function fmtHM(v,tz){if(v==null||v==='')return ''; if(v instanceof Date)return Utilities.formatDate(v,tz||Session.getScriptTimeZone(),'HH:mm'); const s2=String(v).trim(); const mm=s2.match(/^(\d{1,2}):(\d{2})/); return mm?('0'+mm[1]).slice(-2)+':'+mm[2]:s2;}
var _FMT_BAD=0; /* v10.3: celdas de fecha en TEXTO detectadas y normalizadas en la corrida */
/* ══ v10.4 · RELOJ CENTRAL ══ reloj de pared → {d:'YYYY-MM-DD', h, mi, k (ms de pared), src} */
const CT_TZ='America/Chicago';
const _CT_EQ=/^(America\/(Chicago|Matamoros|Menominee|Indiana\/(Knox|Tell_City)|North_Dakota\/[A-Za-z_]+)|US\/Central|CST6CDT)$/;
function _wp(y,mo,d,h,mi,se,src){
  if(!(y>1990&&y<2100&&mo>=1&&mo<=12&&d>=1&&d<=31&&h>=0&&h<=23&&mi>=0&&mi<=59))return null;
  const p=function(n){return ('0'+n).slice(-2);};
  return {d:y+'-'+p(mo)+'-'+p(d),h:h,mi:mi,k:Date.UTC(y,mo-1,d,h,mi,se||0),src:src};}
function _wall(v,tz,mode){
  if(v==null||v==='')return null;
  if(v instanceof Date){
    if(isNaN(v)||v.getFullYear()<1901)return null; /* celdas de duración / solo-hora (1899) */
    const f=Utilities.formatDate(v,(mode==='ct')?CT_TZ:(tz||CT_TZ),'yyyy-MM-dd HH:mm:ss').match(/(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
    return f?_wp(+f[1],+f[2],+f[3],+f[4],+f[5],+f[6],'date'):null;}
  if(typeof v==='number'){if(v>30000&&v<80000){const t=new Date(Date.UTC(1899,11,30)+Math.round(v*864e5));
      return _wp(t.getUTCFullYear(),t.getUTCMonth()+1,t.getUTCDate(),t.getUTCHours(),t.getUTCMinutes(),t.getUTCSeconds(),'serial');}return null;}
  const s=String(v).trim().replace(/\s+/g,' ');if(!s)return null;
  let m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if(m)return _wp(+m[1],+m[2],+m[3],m[4]!=null?+m[4]:0,m[5]!=null?+m[5]:0,+(m[6]||0),'text');
  m=s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})(?:[ ,T]+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s?([ap])\.?\s?m\.?)?)?/i);
  if(!m)return null;
  const a=+m[1],b=+m[2];let y=+m[3];if(y<100)y+=2000;
  let mo=a,d=b;if(a>12&&b<=12){d=a;mo=b;} /* US (PropX) por defecto; D/M solo si es inequívoco */
  let h=0,mi=0;
  if(m[4]!=null){h=+m[4];mi=+m[5];const mk=String(m[7]||'').toLowerCase();
    if(mk==='p'&&h<12)h+=12;else if(mk==='a'&&h===12)h=0;}
  return _wp(y,mo,d,h,mi,+(m[6]||0),'text');}
function _swapDM(w){const m=String(w&&w.d||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!m||+m[3]>12)return null;
  const r=_wp(+m[1],+m[3],+m[2],w.h,w.mi,0,'swap');return r;}
function _ctToday(){return Utilities.formatDate(new Date(),CT_TZ,'yyyy-MM-dd');}
function _ctNowK(){const f=Utilities.formatDate(new Date(),CT_TZ,'yyyy-MM-dd HH:mm:ss').match(/(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
  return Date.UTC(+f[1],+f[2]-1,+f[3],+f[4],+f[5],+f[6]);}
function _isoAdd(iso,n){const m=String(iso||'').match(/^(\d{4})-(\d{2})-(\d{2})/);if(!m)return '';
  const t=new Date(Date.UTC(+m[1],+m[2]-1,+m[3])+n*864e5);const p=function(x){return ('0'+x).slice(-2);};
  return t.getUTCFullYear()+'-'+p(t.getUTCMonth()+1)+'-'+p(t.getUTCDate());}
function _tzOffMin(tz){try{const z=Utilities.formatDate(new Date(),tz,'Z');const m=z.match(/([+-])(\d{2})(\d{2})/);
  return m?(m[1]==='-'?-1:1)*(+m[2]*60+ +m[3]):0;}catch(_){return 0;}}
function _tzAheadOfCT(tz){return _tzOffMin(tz)>_tzOffMin(CT_TZ);}
function fmtDate(v,tz){
  if(v instanceof Date)return Utilities.formatDate(v,tz||Session.getScriptTimeZone(),'yyyy-MM-dd');
  const w=_wall(v,tz,'wall'); /* v10.4: texto parseado directo — sin viajes de zona horaria */
  if(w){if(!/^\d{4}-\d{2}-\d{2}/.test(String(v).trim()))_FMT_BAD++;return w.d;}
  const s=String(v).split(' ')[0];_FMT_BAD++;return s;}
