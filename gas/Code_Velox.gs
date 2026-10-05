/** MEDS LOGISTICS · VELOX Command Center — API (Apps Script). PEGAR TAL CUAL → Implementar → Nueva versión.
 *  + PORTAFOLIO: nuevo endpoint ?action=portfolio — el Resumen completo en UNA llamada
 *    (paquete ligero guardado en Drive y regenerado por el trigger cada 6 h). Arranque del
 *    portal sin importar cuántos pozos tenga el Registry.
 *  velox-v1.1 — corta las secciones de pie del export ("Transferred", "Load #/From Job/To Job",
 *    totales) que entraban como cargas fantasma. Ver diag.footer_rows_cut.
 *  velox-v1.0 — heredado del motor PropX v8.6 con todas sus lecciones ya incorporadas:
 *    · Lectura por DISPLAY VALUES (sin fantasmas de zona horaria) en fechas, horas y duraciones.
 *    · Identidad de driver unificada (ignora el sufijo de filial: COM, OP, RTL, JE…).
 *    · Tarifas VERSIONADAS por fecha: cada carga se factura con la vigencia de SU día.
 *    · Congelador de pozos: snapshots en Drive, auto-invalidados si editas el workbook.
 *    · Wireline/transición por etapa, anti-contaminación por terminal, match tolerante de pads.
 *  INSTALACIÓN: pegar en el Apps Script del Hub de Velox → Implementar como app web
 *    (ejecutar como: yo · acceso: cualquier persona) → copiar la URL /exec al portal.
 *  FUNCIONES ÚTILES: instalarCongelador() una sola vez · congelarCierres() para precalentar ·
 *    TESTSTG() y TESTDT() para auditar la data cruda.
 */

/***** MEDS · PropX Hub — API de datos vivos (v3) *****/

// ═══ HUB DE VELOX ═══ (si pegas este script DENTRO del Hub, puedes dejarlo vacío)
const HUB_ID = '17FEStksMG6yekL2pAnh1o8H7NSiv4BgS-2TzXlW_gW0';
var _HUB_CACHE=null;
function hubSS(){
  if(_HUB_CACHE)return _HUB_CACHE;
  try{ _HUB_CACHE = HUB_ID ? SpreadsheetApp.openById(HUB_ID) : SpreadsheetApp.getActiveSpreadsheet(); }
  catch(e){ _HUB_CACHE = SpreadsheetApp.getActiveSpreadsheet(); }
  return _HUB_CACHE; }

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

const API_VERSION='velox-v1.3';

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
function _wbUpdated(id){ if(!id)return 0;
  try{ return DriveApp.getFileById(id).getLastUpdated().getTime(); }catch(e){ return 0; } }
// ¿El snapshot sigue sirviendo? Con Drive: comparación exacta contra la última edición del
// workbook. Sin Drive: ventana por tiempo (los cierres no cambian; los live los refresca el
// trigger cada 6 h y el portal revalida por su cuenta).
function _snapFresh(ssId,s,closed){
  if(!s)return false;
  const ssT=_wbUpdated(ssId);
  if(ssT)return ssT<=s.time;
  const age=Date.now()-(s.time||0);
  return closed ? age<864e5 : age<6e5; }   // 24 h cierres · 10 min lives
var _STORE_MODE=null;
function _storeMode(){
  if(_STORE_MODE)return _STORE_MODE;
  try{ DriveApp.getRootFolder(); _STORE_MODE='drive'; }
  catch(e){ _STORE_MODE='sheet'; Logger.log('Drive sin permiso → almacén en pestaña del Hub'); }
  return _STORE_MODE; }
const _SNAP_TAB='_SNAP_CACHE';
function _snapSheet(){
  const ss=hubSS();
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
  try{ const v=_snapSheet().getDataRange().getValues(); const parts=[]; let t=0,found=false;
    for(let i=1;i<v.length;i++){ if(String(v[i][0])!==name)continue;
      found=true; parts[+v[i][1]||0]=String(v[i][2]||''); t=Math.max(t,+v[i][3]||0); }
    return found?{text:parts.join(''), time:t}:null;
  }catch(e){ return null; } }
function _storePut(name,text){
  if(_storeMode()==='drive'){
    try{ const fo=_snapFolder(), it=fo.getFilesByName(name);
      if(it.hasNext())it.next().setContent(text); else fo.createFile(name,text,'application/json');
      return true;
    }catch(e){ _STORE_MODE='sheet'; } }
  try{ const sh=_snapSheet(), v=sh.getDataRange().getValues();
    for(let i=v.length-1;i>=1;i--) if(String(v[i][0])===name) sh.deleteRow(i+1);
    const CH=45000, rows=[], now=Date.now();          // 45k < límite de 50k caracteres por celda
    for(let i=0;i<text.length;i+=CH) rows.push([name, rows.length, text.substr(i,CH), now]);
    if(rows.length) sh.getRange(sh.getLastRow()+1,1,rows.length,4).setValues(rows);
    return true;
  }catch(e){ Logger.log('storePut '+name+': '+e); return false; } }

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
function wellFrozen(id,fresh){
  let reg=null; try{reg=(getRegistry().wells||[]).filter(function(w){return String(w.well_id)===String(id);})[0];}catch(_){ }
  const closed=reg&&String(reg.status).toLowerCase()==='closed';
  // v7.8 UNIVERSAL: sirve snapshot si el workbook NO cambio desde el ultimo calculo — valido
  // tambien para pozos LIVE (entre ediciones de dispatch, el snapshot ES el dato actual).
  // Live: de 20-60s por request a ~1-2s; solo el PRIMER request tras una edicion recalcula.
  if(!fresh&&reg&&reg.spreadsheet_id){
    const s=_snapGet(id);
    if(_snapFresh(reg.spreadsheet_id,s,closed)){try{return JSON.parse(s.text);}catch(_){/* corrupto → regenerar */}}}
  const w=getWell(id);
  if(w&&!w.error){
    w.snapshot={frozen:true,at:new Date().toISOString(),live:!closed};
    _snapPut(id,JSON.stringify(w));}
  return w;}
/** ▶ CONGELAR AHORA — corre una vez para precalentar todos los cierres (y cada 6h vía trigger). */
function congelarCierres(){
  const reg=(getRegistry().wells||[]).filter(function(w){return !!w.spreadsheet_id;}); // v7.8: precalienta TODOS (Live incluido)
  let hechos=0,frescos=0;
  reg.forEach(function(w){
    const s=_snapGet(w.well_id);
    if(_snapFresh(w.spreadsheet_id,s,String(w.status).toLowerCase()==='closed')){frescos++;return;}
    const wj=wellFrozen(w.well_id,true); if(wj&&!wj.error)hechos++;});
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
function buildPortfolio(){
  const reg=(getRegistry().wells||[]); const out=[]; let ok=0,fail=0;
  reg.forEach(function(r){ if(!r.spreadsheet_id)return;
    try{ const s=_portfolioSlim(wellFrozen(r.well_id,false),r);
      if(s){out.push(s);ok++;} else fail++; }catch(e){fail++;} });
  const pack={ generated:new Date().toISOString(), api_version:API_VERSION, store:_storeMode(), count:out.length, failed:fail, wells:out };
  try{ _storePut('portfolio.json', JSON.stringify(pack)); }catch(e){ Logger.log('portfolio save: '+e); }
  Logger.log('buildPortfolio: '+ok+' pozos · '+fail+' fallidos');
  return pack;
}
function getPortfolio(fresh){
  if(!fresh){ try{ const s=_storeGet('portfolio.json'); if(s&&s.text)return JSON.parse(s.text); }catch(e){} }
  return buildPortfolio();
}

function doGet(e){
  const a=(e&&e.parameter&&e.parameter.action)||'registry';
  let out;
  try{
    out=(a==='ping')?{ok:true,time:new Date().toISOString()}
       :(a==='snapshot')?runSnapshot()
       :(a==='portfolio')?getPortfolio(e&&e.parameter&&e.parameter.fresh)
       :(a==='well')?wellFrozen(e&&e.parameter&&e.parameter.id, e&&e.parameter&&e.parameter.fresh)
       :(a==='status')?getStatus(e&&e.parameter&&e.parameter.days)
       :getRegistry();
  }catch(err){ out={error:String(err)}; }
  if(out&&typeof out==='object')out.api_version=API_VERSION;
  out.action_received=a;
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
function getRegistry(){
  const v=hubSS().getSheetByName(CFG.registrySheet).getDataRange().getValues();
  const h=findHeader(v,'well_id'); const H=v[h].map(x=>String(x).trim());
  const wells=v.slice(h+1).filter(r=>r[0]).map(r=>{const o={};H.forEach((k,i)=>o[k]=r[i]);return o;});
  return { generated:new Date().toISOString(), count:wells.length, wells };
}
function getRates(){
  const sh=hubSS().getSheetByName(CFG.ratesSheet); if(!sh) return {};
  const v=sh.getDataRange().getValues(); const h=findHeader(v,'customer'); if(h<0) return {};
  const H=v[h].map(x=>String(x).trim().toLowerCase()); const ix=n=>H.indexOf(n);
  const iC=ix('customer'), iLo=ix('mile_min')>=0?ix('mile_min'):1, iHi=ix('mile_max')>=0?ix('mile_max'):2,
        iB=ix('rate_billing')>=0?ix('rate_billing'):3,
        iP=ix('pay_omma')>=0?ix('pay_omma'):(ix('filial_85')>=0?ix('filial_85'):4), iU=ix('unit'), iE=ix('effective');
  const out={};
  for(let r=h+1;r<v.length;r++){const row=v[r]; if(!row[iC])continue;
    const c=String(row[iC]).toUpperCase().trim(); const bill=num(row[iB]); if(!bill)continue;
    (out[c]=out[c]||[]).push({lo:num(row[iLo]),hi:num(row[iHi]),bill:bill,pay:num(row[iP]),unit:iU>=0?String(row[iU]||'ton').toLowerCase():'ton',eff:iE>=0?_effISO(row[iE]):''});}
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
function rateFor(rates,client,miles,dateISO){
  let key=(client||'').toUpperCase().trim();
  if(!rates[key]){
    if(key.indexOf('CRANE')>=0)key='VELOX-CRANE';
    else if(key.indexOf('ALPINE')>=0)key='VELOX-ALPINE';
    else if(key.indexOf('CAPITAL')>=0)key='VELOX-CAPITAL';
    else if(key.indexOf('VOCA')>=0)key='VELOX-VOCA';
    else if(key.indexOf('HOPPER')>=0||key.indexOf('MESH')>=0)key='VELOX-HOPPER';
    else if(key.indexOf('ASSET')>=0)key='ASSETS';
    else if(key.indexOf('VELOX')>=0||key.indexOf('BOX')>=0)key='VELOX';
  }
  if(!rates[key]){RATE_MISS[key||'(vacio)']=(RATE_MISS[key||'(vacio)']||0)+1;} // fallback = GRITAR, no callar
  const t=rates[key]||rates.VELOX||[];
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
function getWell(id){
  const reg=getRegistry().wells.find(w=>String(w.well_id)===String(id));
  if(!reg) return {error:'well_id no encontrado: '+id};
  const rates=getRates(); RATE_MISS={}; const hub=hubSS();
  var FOREIGN_T={}; // terminales AJENAS al pad detectadas en el Loads Report (contaminación cruzada)
  var _DT=[], _STRICT=false;
  if(!reg.spreadsheet_id) return {error:'sin spreadsheet_id en Registry para '+id, well_id:id, name:reg.name, status:reg.status};
  let ss; try{ ss=SpreadsheetApp.openById(reg.spreadsheet_id); }
  catch(e){ return {error:'no pude abrir el workbook ('+String(e).slice(0,80)+') — revisa spreadsheet_id o permisos', well_id:id, name:reg.name, customer:reg.customer, status:reg.status, spreadsheet_id_tail:String(reg.spreadsheet_id).slice(-6)}; }
  const client=reg.customer||'FASKEN';
  const TZS=(ss.getSpreadsheetTimeZone&&ss.getSpreadsheetTimeZone())||Session.getScriptTimeZone();

  // Targets
  const targets={}; const T=readTab(ss,CFG.tabs.targets,'key');
  if(T){const ki=colmap(T.H,['key','value']);
  for(const r of T.rows){const k=String(r[ki.key]||'').trim(); if(k&&k.charAt(0)!=='—') targets[k]=r[ki.value];}}
  _DT=declaredTerms(targets); _STRICT=/^(1|true|si|sí|yes)$/i.test(String((targets&&targets.terminals_strict)||''));
  const designTonsStage=(+targets.lbs_per_stage||0)/2000;

  // Loads Report → loads, drivers, tons, etapas, ciclos, terminales, carriers, products, drivers
  const L=readTab(ss,reg.sheet_name||CFG.tabs.loads,'Load #');
  const _sheetNames=ss.getSheets().map(function(x){return x.getName();});
  const ix=L?colmap(L.H,['Load #','Load ID','Carrier Name','Truck #','Driver Name','Product','Stage#','At Terminal','In Transit','At Staging','At Dest.','Delivered','Terminal','Mileage','Load Weight']):{};
  const byDay={},drvByDay={},tonsByDay={},maxStageByDay={},revByDay={},cycDay={},byTerm={},byTermDay={},cycDayT={},byCarrier={},byProd={},byDriver={},driversAll=new Set(),cyc={};
  let aMoves=0,aRev=0,aCost=0; const aByDay={},aRevByDay={},aEvents=[];
  const partDay={}; let gMinNo=9e15,gMaxNo=-9e15;
  const rateMixDay={}; // {fecha: {"17.76":{loads,tons,revenue}, "19.00":{...}}} — qué tarifa cobró cada carga
  let loads=0,tons=0,revenue=0,cost=0,miles=0,maxStage=0;
  let _skipNoNum=0, _footerCut=0;
  // CORTE DE PIE DE REPORTE: los exports traen secciones extra al final ("Transferred",
  // "Load # / From Job / To Job", totales…). Sus filas de titulo llevan texto en la columna
  // Load # y entraban como cargas fantasma sin terminal ni millas (tarifaban al bracket mas
  // bajo y ensuciaban el $/ton). Al toparnos con una, se corta la lectura ahi mismo.
  const _FOOT=/^(transferred|load\s*#|from\s*job|to\s*job|total|totals|grand\s*total|summary|resumen|subtotal)$/i;
  if(L) for(const row of L.rows){
    const _ln=String(row[ix['Load #']]||'').trim();
    if(_FOOT.test(_ln)){_footerCut=L.rows.length-L.rows.indexOf(row);break;} // fin de la tabla real
    if(!row[ix['Load #']]) {_skipNoNum++; continue;}
    const prodS=String(row[ix['Product']]||'').trim()||'—';
    const loadNo=String(row[ix['Load #']]||'').trim();
    const netW=num(row[ix['Load Weight']]); // col O — libras netas entregadas (arena real: 40–46k lbs)
    // ASSET = Load# 'A…' | Product/Terminal con marker | Load Weight ≤ 1000 (Equipment/Generator ponen "1").
    // Regla de peso: NUNCA tratar peso ≤1000 como arena — antes recibía fallback 21.8t e inflaba tons+revenue.
    const isAsset=/^A/i.test(loadNo)||( netW>0&&netW<=1000)||CFG.assetMarkers.some(function(m){return prodS.toUpperCase().indexOf(m)>=0||String(row[ix['Terminal']]||'').toUpperCase().indexOf(m)>=0;});
    if(isAsset){
      const miA=num(row[ix['Mileage']]);
      const dlA=row[ix['Delivered']]; const dA=dlA?fmtDate(dlA,TZS):'';
      const ra=(rates.ASSETS&&rates.ASSETS.length)?rateFor(rates,'ASSETS',miA,dA):{bill:0,pay:0,unit:'load'};
      const tA=netW>1000?netW/2000:+CFG.tonsPerLoadFallback; // solo para tarifas por ton de assets (si existen); no toca tons entregadas
      const revA=(ra.unit==='load')?ra.bill:ra.bill*tA, payA=(ra.unit==='load')?ra.pay:ra.pay*tA;
      aMoves++; aRev+=revA; aCost+=payA;
      if(dA){aByDay[dA]=(aByDay[dA]||0)+1; aRevByDay[dA]=(aRevByDay[dA]||0)+revA;}
      aEvents.push({date:dA,load_no:loadNo,load_id:String(row[ix['Load ID']]||''),driver:driverKey(row[ix['Driver Name']]).name,miles:miA,revenue:Math.round(revA)});
      continue;
    }
    loads++;
    // TONS ENTREGADAS = col O ÷ 2000. netW>1000 garantizado aquí (pesos ≤1000 ya salieron como asset);
    // fallback 21.8 solo si la celda viene VACÍA (hueco de captura, no equipment).
    const t=netW>1000?netW/2000:(+CFG.tonsPerLoadFallback); tons+=t;
    const mi=num(row[ix['Mileage']]); miles+=mi;
    const dl=row[ix['Delivered']]; const dDel=dl?fmtDate(dl,TZS):'';
    const rb=rateFor(rates,client,mi,dDel); /* tarifa VIGENTE en la fecha de esta carga */ const revL=(rb.unit==='load')?rb.bill:rb.bill*t; const payL=(rb.unit==='load')?rb.pay:rb.pay*t; revenue+=revL; cost+=payL;
    const term=String(row[ix['Terminal']]||'').trim()||'—';
    // GUARD ANTI-CONTAMINACIÓN: carga desde una terminal que NO es del pad (filas de otro job
    // pegadas por error). Se cuenta aparte SIEMPRE; se excluye si Targets trae terminals_strict.
    var _tn=_mnorm(term);
    var _known=_DT.some(function(dt){return _tn.indexOf(dt)>=0||dt.indexOf(_tn)>=0;}); // tolerante: "nomad big springs" ≈ "nomad big springs tx"
    if(_DT.length && term!=='—' && !_known){
      const f=FOREIGN_T[term]=FOREIGN_T[term]||{loads:0,tons:0}; f.loads++; f.tons+=t;
      if(_STRICT){ loads--; tons-=t; miles-=mi; revenue-=revL; cost-=payL; continue; }
    }
    byTerm[term]=byTerm[term]||{loads:0,miles:0,revenue:0,tons:0}; byTerm[term].loads++; byTerm[term].miles+=mi; byTerm[term].revenue+=revL; byTerm[term].tons+=t;
    const code=(String(row[ix['Truck #']]||'').match(/^[A-Za-z]+/)||['—'])[0].toUpperCase(); byCarrier[code]=(byCarrier[code]||0)+1;
    const _dk=driverKey(row[ix['Driver Name']]);
    const drv=_dk.key; // clave unificada: mismo humano aunque cambie el sufijo de carrier
    if(drv){ driversAll.add(drv);
      const D=byDriver[drv]=byDriver[drv]||{name:_dk.name,loads:0,dates:{},carriers:{},sufs:{}};
      D.loads++;
      if(code&&code!=='—')D.carriers[code]=(D.carriers[code]||0)+1;
      if(_dk.suf)D.sufs[_dk.suf]=(D.sufs[_dk.suf]||0)+1; }
    byProd[prodS]=(byProd[prodS]||0)+1;
    const stg=num(row[ix['Stage#']]); if(stg>maxStage) maxStage=stg;
    if(dDel){const _rk=(+rb.bill||0).toFixed(2); const _RM=rateMixDay[dDel]=rateMixDay[dDel]||{};
      const _e=_RM[_rk]=_RM[_rk]||{loads:0,tons:0,revenue:0}; _e.loads++; _e.tons+=t; _e.revenue+=revL;}
    if(dDel){const d=dDel; byDay[d]=(byDay[d]||0)+1;
      const btk=d+'|'+term; byTermDay[btk]=byTermDay[btk]||{date:d,terminal:term,loads:0,tons:0,revenue:0}; byTermDay[btk].loads++; byTermDay[btk].tons+=t; byTermDay[btk].revenue+=revL;
      const _no=parseInt(loadNo,10);
      if(isFinite(_no)&&_no>0){const pn=partDay[d]=partDay[d]||{min:_no,max:_no}; if(_no<pn.min)pn.min=_no; if(_no>pn.max)pn.max=_no; if(_no<gMinNo)gMinNo=_no; if(_no>gMaxNo)gMaxNo=_no;} (drvByDay[d]=drvByDay[d]||new Set()).add(drv); tonsByDay[d]=(tonsByDay[d]||0)+t; revByDay[d]=(revByDay[d]||0)+revL; if(stg>(maxStageByDay[d]||0))maxStageByDay[d]=stg; if(drv)byDriver[drv].dates[d]=(byDriver[drv].dates[d]||0)+1;}
    // tiempos de ciclo (min) por terminal
    const aT=parseTS(row[ix['At Terminal']]),iT=parseTS(row[ix['In Transit']]),aS=parseTS(row[ix['At Staging']]),aD=parseTS(row[ix['At Dest.']]),dv=parseTS(dl);
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
  }
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
      stages.push(rec); invLatest=rec;
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
  const inventory=invLatest?(isBelly
    ?{type:'pila',pila:invLatest.full_or_pila,drivers_location:invLatest.drivers_loc}
    :{type:'boxes',full:invLatest.full_or_pila,empty:invLatest.empty,damaged:invLatest.damaged,drivers_location:invLatest.drivers_loc}):null;

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
    return { date:d, rates:_rmO, loads:ours, drivers:drvByDay[d]?drvByDay[d].size:0, tons:Math.round(dt), tons_frac:dtF, revenue:Math.round(revByDay[d]||0), assets_moves:aByDay[d]||0, assets_revenue:Math.round(aRevByDay[d]||0), pad_span:span||null, participation:span?+(ours/span*100).toFixed(1):null, stages_day:sd, stage_cum:sc, efficiency:eff };
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
  const statusBoard=lastK?Object.entries(statusByHour[lastK]).map(([s,n])=>({status:s,count:n})).sort((a,b)=>b.count-a.count):[];

  return {
    api_version:API_VERSION, well_id:reg.well_id, name:reg.name, customer:client, status:reg.status, targets,
    diag:{ file:ss.getName(), sheets:ss.getSheets().map(function(x){return x.getName();}),
      loads_tab:(reg.sheet_name||CFG.tabs.loads), loads_found:!!L, loads_rows:L?L.rows.length:0,
      tons_delivered:Math.round(tons), loads_skipped_no_loadnum:_skipNoNum, footer_rows_cut:_footerCut,
      rate_fallback:RATE_MISS,
      declared_terminals:_DT, terminals_strict:_STRICT, foreign_terminals:FOREIGN_T,
      targets_found:!!T, targets_keys:Object.keys(targets).length,
      loads_sheet_looked:(reg.sheet_name||CFG.tabs.loads), sheets_available:_sheetNames,
      stages_found:!!ST_, stages_rows:ST_?ST_.rows.length:0,
      downtimes_found:!!D, downtimes_rows:D?D.rows.length:0 },
    totals:{ loads, tons:Math.round(tons), revenue:Math.round(revenue), cost:Math.round(cost), margin:Math.round(revenue-cost),
             rev_per_load:loads?+(revenue/loads).toFixed(2):0, unique_drivers:driversAll.size, miles:Math.round(miles),
             max_stage:stagesDone||Math.max(maxStage,totalStageMax), stages_completed:stagesDone, stages_planned:(+targets.total_stages||totalStageMax), stages_sheet_max:totalStageMax, downtime_minutes:+dMin.toFixed(1),
             assets_moves:aMoves, assets_revenue:Math.round(aRev),
             pad_span:(gMaxNo>gMinNo)?Math.max(gMaxNo-gMinNo,loads):null,
             participation_pct:(gMaxNo>gMinNo&&loads)?+(loads/Math.max(gMaxNo-gMinNo,loads)*100).toFixed(1):null },
    daily,
    stageWaitByTerminal:Object.entries(cyc).map(([k,v])=>({terminal:k,avg_stage_min:v.stage_wait[1]?+(v.stage_wait[0]/v.stage_wait[1]).toFixed(1):0,events:v.stage_wait[1]})).filter(x=>x.avg_stage_min>0).sort((a,b)=>b.avg_stage_min-a.avg_stage_min),
    byTerminal:Object.entries(byTerm).map(([k,v])=>({terminal:k,loads:v.loads,avg_miles:v.loads?+(v.miles/v.loads).toFixed(1):0,revenue:Math.round(v.revenue),tons:Math.round(v.tons)})).sort((a,b)=>b.revenue-a.revenue),
    byTerminalDaily:Object.values(byTermDay).map(v=>({date:v.date,terminal:v.terminal,loads:v.loads,tons:Math.round(v.tons),revenue:Math.round(v.revenue)})).sort((a,b)=>a.date<b.date?-1:1),
    byCarrier:Object.entries(byCarrier).map(([k,v])=>({carrier:k,loads:v})).sort((a,b)=>b.loads-a.loads),
    byProduct:Object.entries(byProd).map(([k,v])=>({product:k,loads:v})).sort((a,b)=>b.loads-a.loads),
    byDriver:Object.entries(byDriver).map(function(e){const v=e[1];
      const cars=Object.keys(v.carriers).sort(function(a,b){return v.carriers[b]-v.carriers[a];});
      const sufs=Object.keys(v.sufs).sort(function(a,b){return v.sufs[b]-v.sufs[a];});
      const hist=cars.length?cars:sufs;
      return {driver:v.name,carrier:hist[0]||'',carriers:hist,switched:hist.length>1,
        loads:v.loads,days:Object.keys(v.dates).length,dates:v.dates};
    }).sort((a,b)=>b.loads-a.loads),
    downtimes:Object.entries(dCat).map(([k,v])=>({category:k,minutes:+v.toFixed(1)})).sort((a,b)=>b.minutes-a.minutes),
    cycleTimes:Object.entries(cyc).map(([k,v])=>({terminal:k,load:avg2(v.load),transit:avg2(v.transit),unload:avg2(v.unload),full:avg2(v.full)})),
    stages, inventory,
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

// ---------- Status Live (?action=status · todos los pads del Hub) ----------
// Normaliza para matching de pads: minúsculas, sin acentos, guiones/puntuación→espacio, espacios colapsados.
// "26. (BAYSWATER) - Far Country" y "Bayswater - Far" → ambos contienen "bayswater far".
function _mnorm(s){return String(s||'').toLowerCase()
  .replace(/[().,#/\\_-]+/g,' ').replace(/\s+/g,' ').trim();}
function getStatus(days){
  days=Math.max(1,Math.min(180,+days||45));
  const hub=hubSS();
  const SL=readTab(hub,CFG.statusSheet,'status');
  if(!SL) return {generated:new Date().toISOString(), latest:null, days:days, pads:[], error:'Status Log vacío o sin header "status"'};
  const li=colmap(SL.H,['date_iso','hour','well','status','count']);
  const cutISO=Utilities.formatDate(new Date(Date.now()-days*86400000),Session.getScriptTimeZone(),'yyyy-MM-dd');
  const _nrm=s=>String(s||'').toUpperCase().trim();
  const isAct=s=>{const u=_nrm(s);return CFG.activeStatuses.some(function(k){return u.indexOf(k)>=0;});};
  const isRest=s=>{const u=_nrm(s);return CFG.restingStatuses.some(function(k){return u.indexOf(k)>=0;});};
  // Racha Resting >2d — solo posible si el Status Log trae columna driver (snapshot por driver):
  const dIdx=SL.H.findIndex(function(hh){return /^driver/i.test(String(hh).trim());});
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

function readTab(ss,name,keyword){const sh=ss.getSheetByName(name); if(!sh)return null; const v=sh.getDataRange().getValues(); const h=findHeader(v,keyword); if(h<0)return null; return {H:v[h].map(x=>String(x).trim()),rows:v.slice(h+1).filter(r=>r.some(c=>c!==''))};}
// v7.0 — lee la pestaña con VALORES typed + DISPLAY strings alineados fila a fila.
// Los DISPLAY son el texto exacto que ves en la celda → inmunes a la zona horaria.
function readTabD(ss,name,keyword){const sh=ss.getSheetByName(name); if(!sh)return null; const rg=sh.getDataRange(); const v=rg.getValues(),dv=rg.getDisplayValues(); const h=findHeader(v,keyword); if(h<0)return null;
  const keep=[]; for(let i=h+1;i<v.length;i++){ if(v[i].some(c=>c!=='')) keep.push(i); }
  return {H:v[h].map(x=>String(x).trim()), rows:keep.map(i=>v[i]), disp:keep.map(i=>dv[i])};}
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
function fmtDate(v,tz){if(v instanceof Date)return Utilities.formatDate(v,tz||Session.getScriptTimeZone(),'yyyy-MM-dd'); const d=new Date(v); if(isNaN(d))return String(v).split(' ')[0]; return Utilities.formatDate(d,Session.getScriptTimeZone(),'yyyy-MM-dd');}
