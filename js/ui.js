/* ---------------- HUD, overlays, settings & mixer ---------------- */
import { $, clamp } from "./utils.js";
import { STATE } from "./state.js";
import { AU, applyVolumes, audioInit } from "./audio.js";
import { renderer, setRenderQuality } from "./scene.js";
import { SETTINGS_KEY, readSettings } from "./settings.js";
import { startGame, respawn } from "./lifecycle.js";

/* ---------------- DOM refs ---------------- */
export const ui={
  hud:$("hud"), objList:$("objList"), stats:$("stats"),
  objBox:$("objectives"), objFloor:$("objFloor"), objPlace:$("objPlace"),
  stamWrap:$("staminaWrap"), stam:$("stamina"), stamPct:$("stamPct"), stamName:$("stamName"),
  lantWrap:$("lanternWrap"), lant:$("lantern"),
  prompt:$("prompt"), hidden:$("hiddenTag"), toast:$("toast"),
  dread:$("dread"), flash:$("flash"), staticfx:$("staticfx"), vignette:$("vignette"),
  deathfx:$("deathfx"),
  start:$("startOverlay"), how:$("howOverlay"), pause:$("pauseOverlay"),
  sound:$("soundOverlay"), death:$("deathOverlay"), win:$("winOverlay"),
};
let toastTimer=null;
export function toast(msg,ms=3200){
  ui.toast.textContent=msg; ui.toast.style.opacity=1;
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>ui.toast.style.opacity=0,ms);
}

/* ---------------- level chrome ----------------
   the whole interface takes the colour of the floor you're standing on
   (body.lvl0/1/2 → the --accent family in main.css) and the objectives log
   says where you are, which nothing used to. */
export const FLOORS=[
  {floor:"LEVEL 0",  place:"THE BACKROOMS"},
  {floor:"THE END",  place:"THE INFINITE LIBRARY"},
  {floor:"THE NEST", place:"THE CAVE BELOW"},
];
export function setLevelChrome(level){
  const f=FLOORS[level]||FLOORS[0];
  document.body.classList.remove("lvl0","lvl1","lvl2");
  document.body.classList.add("lvl"+level);
  if(ui.objFloor) ui.objFloor.textContent=f.floor;
  if(ui.objPlace) ui.objPlace.textContent=f.place;
  syncGuide();
}

/* ---------------- the objectives log ----------------
   rows are a small data model, not markup: {txt, done, active, have, total}.
   A counter draws as PIPS while the total is small enough to read at a
   glance and as a METER once it isn't (the disk hunt runs to twenty-odd —
   twenty-two pips in a HUD corner is a barcode, not a count). */
const fmtClock=s=>{const t=Math.floor(s);
  return `${String(Math.floor(t/60)).padStart(2,"0")}:${String(t%60).padStart(2,"0")}`;};

const ARROWS=["↑","↗","→","↘","↓","↙","←","↖"];
/* where a place is, relative to where you are looking. Forward is
   (−sin yaw, −cos yaw) — the same basis player.js and the cutscenes use. */
function bearing(x,z){
  const dx=x-STATE.pos.x, dz=z-STATE.pos.z;
  const dist=Math.hypot(dx,dz);
  const ahead=-dx*Math.sin(STATE.yaw)-dz*Math.cos(STATE.yaw);
  const right= dx*Math.cos(STATE.yaw)-dz*Math.sin(STATE.yaw);
  const a=Math.atan2(right,ahead);
  const i=((Math.round(a/(Math.PI/4))%8)+8)%8;
  return {arrow:ARROWS[i], dist:Math.round(dist)};
}
function objRows(){
  if(STATE.level===2){
    const allLit=STATE.clutchesLit>=4;
    const rows=[
      {txt:"Find a light", done:STATE.hasLantern, active:!STATE.hasLantern},
      {txt:"Burn the brood", have:STATE.clutchesLit, total:4,
       done:allLit, active:STATE.hasLantern&&!allLit},
    ];
    /* the fissure only exists once the cave has opened it — no spoilers */
    if(allLit) rows.push({txt:"Climb the fissure", done:STATE.won, active:!STATE.won,
                          guide:STATE.guide, guideName:"COLD AIR"});
    return rows;
  }
  if(STATE.level===1){
    const total=STATE.discTotal||0;
    const allFound=total>0&&STATE.discsFound>=total;
    const allFed=total>0&&STATE.discsDelivered>=total;
    const rows=[
      {txt:"Find the floppy disks", have:STATE.discsFound, total,
       done:allFound, active:!allFound},
      {txt:"Feed them to the terminal", have:STATE.discsDelivered, total,
       done:allFed, active:(allFound&&!allFed)||STATE.discsCarried>0},
    ];
    /* the dig only exists once it has happened — no spoilers in the log */
    if(STATE.holeOpen) rows.push({txt:"Enter the hole", done:STATE.won, active:!STATE.won,
                                  guide:STATE.guide, guideName:"THE HOLE"});
    return rows;
  }
  const L0=[
    {txt:"Collect almond water", have:STATE.bottles, total:3},
    {txt:"Find a fuse for the breaker"},
    {txt:"Restore power at the breaker"},
    {txt:"Call the exit elevator"},
  ];
  L0.forEach((r,i)=>{ r.done=i<STATE.objective; r.active=i===STATE.objective; });
  return L0;
}
function counterHTML(have,total){
  if(!total) return "";
  if(total<=8){
    let s="";
    for(let i=0;i<total;i++) s+=`<i class="pip${i<have?" on":""}"></i>`;
    return `${s}<span>${have}/${total}</span>`;
  }
  const p=Math.round(clamp(have/total,0,1)*100);
  return `<span class="ometer"><i style="width:${p}%"></i></span><span>${have}/${total}</span>`;
}
let objSig="", activeSig="";
export function renderObjectives(force=false){
  const rows=objRows();
  /* a live bearing changes constantly; keep it out of the redraw signature
     and rewrite only that one row's text when nothing else moved */
  const sig=STATE.level+"|"+rows.map(r=>
    `${r.txt}:${r.done?1:0}${r.active?"a":""}:${r.have||0}/${r.total||0}`).join("|");
  const act=rows.filter(r=>r.active).map(r=>r.txt).join("|");
  if(sig!==objSig||force){
    objSig=sig;
    let html="";
    for(const r of rows){
      const cls=r.done?"done":r.active?"active":"";
      const mark=r.done?"✓":r.active?"▸":"·";
      html+=`<li class="${cls}"><span class="omark">${mark}</span>`+
            `<span class="otext">${r.txt}</span>`+
            `<span class="ocount">${counterHTML(r.have,r.total)}</span></li>`;
      if(r.active&&r.guide) html+=`<li class="sub" data-guide="1"></li>`;
    }
    ui.objList.innerHTML=html;
    /* a new objective just went live: the panel takes one breath */
    if(act!==activeSig&&activeSig!==""){
      ui.objBox.classList.remove("flash");
      void ui.objBox.offsetWidth;            // restart the animation
      ui.objBox.classList.add("flash");
    }
    activeSig=act;
  }
  /* the bearing row: a direction you can feel, refreshed every tick */
  const sub=ui.objList.querySelector('li.sub[data-guide]');
  if(sub){
    const r=rows.find(x=>x.active&&x.guide);
    if(r){ const b=bearing(r.guide.x,r.guide.z);
      sub.innerHTML=`${r.guideName} <b>${b.arrow}</b> ${b.dist} m`; }
  }
  /* the status strip */
  let chips="";
  if(STATE.level===2&&STATE.frenzyT>0) chips+=`<span class="chip warn">FRENZY</span>`;
  if(STATE.level===1&&STATE.discsCarried>0) chips+=`<span class="chip">CARRYING ${STATE.discsCarried}</span>`;
  if(STATE.level===0&&STATE.powerOn) chips+=`<span class="chip">POWER ON</span>`;
  const strip=`<span>${fmtClock(STATE.time)}</span><span>DEATHS ${STATE.deaths}</span>${chips}`;
  if(ui.stats.innerHTML!==strip) ui.stats.innerHTML=strip;
}

export function lockPointer(){ renderer.domElement.requestPointerLock(); }

/* ---------------- overlay logic ---------------- */
export function setPaused(p,keepAudio=false){
  STATE.paused=p;
  if(AU.ctx){ if(p&&!keepAudio) AU.ctx.suspend(); else AU.ctx.resume(); }
}
export function anyOverlayOpen(){
  return !ui.how.classList.contains("hide")||!ui.pause.classList.contains("hide")||
         !ui.sound.classList.contains("hide")||!ui.death.classList.contains("hide")||
         !ui.win.classList.contains("hide");
}

/* ---------------- the field notes ----------------
   a tabbed guide: one screen of one topic beats five screens of prose, and
   the floors you have not reached keep their pages sealed so the guide can
   never spoil a level transition. */
function syncGuide(){
  document.querySelectorAll("#guideTabs .tab").forEach(t=>{
    const need=t.dataset.need? +t.dataset.need : 0;
    const reached=STATE.level>=need;
    t.classList.toggle("locked",!reached);
    if(need){
      t.textContent = reached? (need===1?"THE END":"THE NEST") : "■ ■ ■";
      const pane=$(t.dataset.pane);
      if(pane) pane.classList.toggle("sealed",!reached);
    }
  });
}
function showPane(id){
  document.querySelectorAll("#guideTabs .tab").forEach(t=>t.classList.toggle("on",t.dataset.pane===id));
  document.querySelectorAll(".sheet.guide .pane").forEach(p=>p.classList.toggle("on",p.id===id));
  const sheet=document.querySelector(".sheet.guide");
  if(sheet) sheet.scrollTop=0;
}
{
  const tabs=$("guideTabs");
  if(tabs) tabs.addEventListener("click",e=>{
    const t=e.target.closest(".tab");
    if(t) showPane(t.dataset.pane);
  });
}
let howFrom="game";                 // "start" | "pause" | "game"
export function openHow(from="game"){
  howFrom=from;
  syncGuide(); showPane("gControls");
  ui.pause.classList.add("hide"); ui.sound.classList.add("hide");
  ui.how.classList.remove("hide");
  if(from!=="start"){
    setPaused(true);
    if(document.pointerLockElement) document.exitPointerLock();
  }
}
export function closeHow(){
  ui.how.classList.add("hide");
  if(howFrom==="start") return;                       // the title screen is still behind it
  if(howFrom==="pause"){ ui.pause.classList.remove("hide"); setPaused(true); return; }
  setPaused(false); lockPointer();
}
export function toggleHow(){
  if(ui.how.classList.contains("hide")) openHow(STATE.playing?"game":"start");
  else closeHow();
}
let soundFromPause=false;
export function toggleSound(fromPause=false){
  if(ui.sound.classList.contains("hide")){
    soundFromPause=fromPause;
    ui.pause.classList.add("hide"); ui.how.classList.add("hide");
    ui.sound.classList.remove("hide");
    setPaused(true,true);                 // pause logic, keep audio audible for mixing
    if(document.pointerLockElement) document.exitPointerLock();
  } else {
    ui.sound.classList.add("hide");
    if(soundFromPause){ ui.pause.classList.remove("hide"); setPaused(true); }
    else { setPaused(false); lockPointer(); }
  }
}
/* the single MENU [ESC] HUD button opens the pause sheet, which already
   links out to the field notes and Options */
export function openPause(){
  ui.how.classList.add("hide"); ui.sound.classList.add("hide");
  const st=$("pauseStats");
  if(st){
    const f=FLOORS[STATE.level]||FLOORS[0];
    st.innerHTML=
      `<div class="statrow"><span>FLOOR</span><span>${f.floor}</span></div>`+
      `<div class="statrow"><span>TIME</span><span>${fmtClock(STATE.time)}</span></div>`+
      `<div class="statrow"><span>TIMES CAUGHT</span><span>${STATE.deaths}</span></div>`;
  }
  ui.pause.classList.remove("hide");
  setPaused(true);
  if(document.pointerLockElement) document.exitPointerLock();
}
/* fail-soft wiring: a missing button logs a warning instead of throwing —
   one stale file in a partial deploy (html/js out of sync) used to crash
   this whole module graph and brick the page */
const wire=(id,fn)=>{const el=$(id); if(el) el.onclick=fn; else console.warn(`[ui] missing #${id}`);};
wire("btnMenu",()=>openPause());
wire("btnHow1",()=>openHow("start"));
wire("btnHow2",()=>openHow("pause"));
wire("btnSound2",()=>toggleSound(true));
wire("btnSoundClose",()=>toggleSound(soundFromPause));
wire("btnResume",()=>closeHow());
wire("btnUnpause",()=>{ui.pause.classList.add("hide");setPaused(false);lockPointer();});
wire("btnStart",()=>{
  audioInit();
  ui.start.classList.add("hide");
  ui.how.classList.add("hide");
  startGame();
});
wire("btnRespawn",()=>{
  ui.death.classList.add("hide");
  respawn(); setPaused(false); lockPointer();
});
wire("btnAgain",()=>location.reload());

/* ---- settings persistence (volumes + mouse sensitivity) ----
   the key and the reader live in settings.js (scene.js needs the saved
   quality at renderer construction, long before this module runs) */
export function saveSettings(){
  try{ localStorage.setItem(SETTINGS_KEY, JSON.stringify(
    {vol:AU.vol, sens:STATE.sens, crouchToggle:STATE.crouchToggle, quality:STATE.quality})); }catch(e){}
}
export function loadSettings(){
  const s=readSettings();
  if(!s) return;
  if(s.vol) for(const k of["master","music","sound"]) if(typeof s.vol[k]==="number") AU.vol[k]=clamp(s.vol[k],0,1);
  if(typeof s.sens==="number") STATE.sens=clamp(s.sens,0.1,4);
  STATE.crouchToggle=!!s.crouchToggle;
  if(s.quality==="low"||s.quality==="high") STATE.quality=s.quality;
}
loadSettings();

/* mixer wiring — fail-soft like the buttons above: a missing slider warns
   instead of bricking the module graph on a partial deploy */
[["volMaster","master"],["volMusic","music"],["volSound","sound"]].forEach(([id,key])=>{
  const el=$(id), out=$(id+"V");
  if(!el||!out){ console.warn(`[ui] missing #${id}`); return; }
  el.value=Math.round(AU.vol[key]*100); out.value=Math.round(AU.vol[key]*100);
  el.addEventListener("input",()=>{
    AU.vol[key]=el.value/100; out.value=el.value;
    applyVolumes(); saveSettings();
  });
});
/* mouse sensitivity: 0.1x – 4x */
{
  const el=$("sensSlider"), out=$("sensV");
  if(el&&out){
    el.value=Math.round(STATE.sens*100);
    out.value=STATE.sens.toFixed(1)+"x";
    el.addEventListener("input",()=>{
      STATE.sens=el.value/100;
      out.value=STATE.sens.toFixed(1)+"x";
      saveSettings();
    });
  } else console.warn("[ui] missing #sensSlider");
}
/* crouch mode: hold (default) vs toggle */
{
  const el=$("crouchToggle"), out=$("crouchToggleV");
  if(el){
    const show=()=>out.value=STATE.crouchToggle? "TOGGLE":"HOLD";
    el.checked=STATE.crouchToggle; show();
    el.addEventListener("change",()=>{
      STATE.crouchToggle=el.checked;
      STATE.crouchLatch=false;            // never carry a stale latch across modes
      show(); saveSettings();
    });
  }
}
/* graphics quality: HIGH (default) vs LOW — caps the pixel ratio live; the
   antialias change is read at renderer construction, so it lands next reload */
{
  const el=$("qualityLow"), out=$("qualityV");
  if(el){
    const show=()=>out.value=STATE.quality==="low"? "LOW":"HIGH";
    el.checked=STATE.quality==="low"; show();
    el.addEventListener("change",()=>{
      STATE.quality=el.checked? "low":"high";
      show(); setRenderQuality(el.checked); saveSettings();
    });
  }
}
syncGuide();
