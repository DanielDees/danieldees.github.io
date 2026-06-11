/* ---------------- HUD, overlays, settings & mixer ---------------- */
import { $, clamp } from "./utils.js";
import { STATE } from "./state.js";
import { AU, applyVolumes, audioInit } from "./audio.js";
import { renderer } from "./scene.js";
import { startGame, respawn } from "./lifecycle.js";

/* ---------------- DOM refs ---------------- */
export const ui={
  hud:$("hud"), objList:$("objList"), stats:$("stats"),
  stamWrap:$("staminaWrap"), stam:$("stamina"), stamPct:$("stamPct"),
  prompt:$("prompt"), hidden:$("hiddenTag"), toast:$("toast"),
  dread:$("dread"), flash:$("flash"), staticfx:$("staticfx"),
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
  ()=>`Locate the exit door and escape`,
];
export function renderObjectives(){
  ui.objList.innerHTML="";
  OBJ_DEFS.forEach((f,i)=>{
    const li=document.createElement("li");
    li.textContent=f();
    li.className = i<STATE.objective? "done" : i===STATE.objective? "active" : "";
    ui.objList.appendChild(li);
  });
  const t=Math.floor(STATE.time);
  ui.stats.textContent=`TIME ${String(Math.floor(t/60)).padStart(2,"0")}:${String(t%60).padStart(2,"0")}  ·  DEATHS ${STATE.deaths}  ·  STAGE ${Math.min(STATE.objective+1,4)}/4`;
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

/* ---- settings persistence (volumes + mouse sensitivity) ---- */
const SETTINGS_KEY="noclip_settings_v1";
export function saveSettings(){
  try{ localStorage.setItem(SETTINGS_KEY, JSON.stringify({vol:AU.vol, sens:STATE.sens})); }catch(e){}
}
export function loadSettings(){
  try{
    const s=JSON.parse(localStorage.getItem(SETTINGS_KEY)||"null");
    if(s){
      if(s.vol) for(const k of["master","music","sound"]) if(typeof s.vol[k]==="number") AU.vol[k]=clamp(s.vol[k],0,1);
      if(typeof s.sens==="number") STATE.sens=clamp(s.sens,0.1,4);
    }
  }catch(e){}
}
loadSettings();
/* sync slider UI to loaded values */
[["volMaster","master"],["volMusic","music"],["volSound","sound"]].forEach(([id,key])=>{
  $(id).value=Math.round(AU.vol[key]*100); $(id+"V").value=Math.round(AU.vol[key]*100);
});
$("sensSlider").value=Math.round(STATE.sens*100);
$("sensV").value=STATE.sens.toFixed(1)+"x";

/* mixer wiring */
[["volMaster","master"],["volMusic","music"],["volSound","sound"]].forEach(([id,key])=>{
  const el=$(id), out=$(id+"V");
  el.addEventListener("input",()=>{
    AU.vol[key]=el.value/100; out.value=el.value;
    applyVolumes(); saveSettings();
  });
});
/* mouse sensitivity: 0.1x – 4x */
{
  const el=$("sensSlider"), out=$("sensV");
  el.addEventListener("input",()=>{
    STATE.sens=el.value/100;
    out.value=STATE.sens.toFixed(1)+"x";
    saveSettings();
  });
}
