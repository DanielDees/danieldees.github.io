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
  stamWrap:$("staminaWrap"), stam:$("stamina"), stamPct:$("stamPct"), stamName:$("stamName"),
  lantWrap:$("lanternWrap"), lant:$("lantern"),
  prompt:$("prompt"), hidden:$("hiddenTag"), toast:$("toast"),
  dread:$("dread"), flash:$("flash"), staticfx:$("staticfx"), vignette:$("vignette"),
  start:$("startOverlay"), how:$("howOverlay"), pause:$("pauseOverlay"),
  sound:$("soundOverlay"), death:$("deathOverlay"), win:$("winOverlay"),
};
let toastTimer=null;
export function toast(msg,ms=3200){
  ui.toast.textContent=msg; ui.toast.style.opacity=1;
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>ui.toast.style.opacity=0,ms);
}
const OBJ_DEFS=[
  ()=>`Collect almond water (${STATE.bottles}/3)`,
  ()=>`Find a fuse for the breaker`,
  ()=>`Restore power at the breaker panel`,
  ()=>`Locate the exit elevator and escape`,
];
export function renderObjectives(){
  ui.objList.innerHTML="";
  const t=Math.floor(STATE.time);
  const clock=`TIME ${String(Math.floor(t/60)).padStart(2,"0")}:${String(t%60).padStart(2,"0")}`;
  if(STATE.level===2){
    /* THE NEST: light, fire, and the way up */
    const allLit=STATE.clutchesLit>=4;
    const rows=[
      [`Find a light`, STATE.hasLantern, !STATE.hasLantern],
      [`Burn the brood (${STATE.clutchesLit}/4)`, allLit, STATE.hasLantern&&!allLit],
    ];
    /* the fissure only exists once the cave has opened it — no spoilers */
    if(allLit) rows.push([`Climb toward the cold air`, STATE.won, !STATE.won]);
    rows.forEach(([txt,done,active])=>{
      const li=document.createElement("li");
      li.textContent=txt;
      li.className = done? "done" : active? "active" : "";
      ui.objList.appendChild(li);
    });
    ui.stats.textContent=`${clock}  ·  DEATHS ${STATE.deaths}  ·  FRENZY ${STATE.frenzyT>0?"⚠":"—"}`;
    return;
  }
  if(STATE.level===1){
    /* THE END: find the disks, feed the terminal */
    const total=STATE.discTotal||"?";
    const allFound=STATE.discTotal>0&&STATE.discsFound>=STATE.discTotal;
    const allFed=STATE.discTotal>0&&STATE.discsDelivered>=STATE.discTotal;
    const rows=[
     [`Find the floppy disks (${STATE.discsFound}/${total})`, allFound, !allFound],
     [`Feed them to the librarian's terminal (${STATE.discsDelivered}/${total})`, allFed, allFound&&!allFed||STATE.discsCarried>0],
    ];
    /* the dig only exists once it has happened — no spoilers in the log */
    if(STATE.holeOpen) rows.push([`Enter the hole`, STATE.won, !STATE.won]);
    rows.forEach(([txt,done,active])=>{
      const li=document.createElement("li");
      li.textContent=txt;
      li.className = done? "done" : active? "active" : "";
      ui.objList.appendChild(li);
    });
    ui.stats.textContent=`${clock}  ·  DEATHS ${STATE.deaths}  ·  CARRYING ${STATE.discsCarried} 💾`;
    return;
  }
  OBJ_DEFS.forEach((f,i)=>{
    const li=document.createElement("li");
    li.textContent=f();
    li.className = i<STATE.objective? "done" : i===STATE.objective? "active" : "";
    ui.objList.appendChild(li);
  });
  ui.stats.textContent=`${clock}  ·  DEATHS ${STATE.deaths}  ·  STAGE ${Math.min(STATE.objective+1,4)}/4`;
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
export function toggleHow(){
  if(ui.how.classList.contains("hide")){
    ui.pause.classList.add("hide"); ui.sound.classList.add("hide");
    ui.how.classList.remove("hide");
    setPaused(true);
    if(document.pointerLockElement) document.exitPointerLock();
  } else {
    ui.how.classList.add("hide");
    setPaused(false); lockPointer();
  }
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
   links out to HOW TO PLAY and SOUND */
export function openPause(){
  ui.how.classList.add("hide"); ui.sound.classList.add("hide");
  ui.pause.classList.remove("hide");
  setPaused(true);
  if(document.pointerLockElement) document.exitPointerLock();
}
/* fail-soft wiring: a missing button logs a warning instead of throwing —
   one stale file in a partial deploy (html/js out of sync) used to crash
   this whole module graph and brick the page */
const wire=(id,fn)=>{const el=$(id); if(el) el.onclick=fn; else console.warn(`[ui] missing #${id}`);};
wire("btnMenu",()=>openPause());
wire("btnHow2",()=>{ui.pause.classList.add("hide");ui.how.classList.remove("hide");});
wire("btnSound2",()=>toggleSound(true));
wire("btnSoundClose",()=>toggleSound(soundFromPause));
wire("btnResume",()=>{ui.how.classList.add("hide");setPaused(false);lockPointer();});
wire("btnUnpause",()=>{ui.pause.classList.add("hide");setPaused(false);lockPointer();});
wire("btnStart",()=>{
  audioInit();
  ui.start.classList.add("hide");
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
