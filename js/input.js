/* ---------------- input ---------------- */
import { clamp } from "./utils.js";
import { STATE, KEYS } from "./state.js";
import { renderer } from "./scene.js";
import { ui, setPaused, toggleSound } from "./ui.js";
import { tryInteract } from "./interact.js";
import { debugSkipToElevator, debugSkipToTheEnd, debugWarpToTerminal } from "./lifecycle.js";

let dbg6=0, dbg6T=0;   // hidden debug chord: [6] ×3 warps to the endgame
let dbg7=0, dbg7T=0;   // [7] ×3 drops into THE END / pockets every disk
let typed="", typedT=0; // typing "the end" warps to the terminal for cutscene testing
addEventListener("keydown",e=>{
  KEYS[e.code]=true;
  if(e.code==="Space") e.preventDefault();
  if(!STATE.playing||STATE.dead||STATE.won) return;
  if(e.code==="KeyO") toggleSound();
  if(e.code==="KeyE") tryInteract();
  /* toggle-mode crouch: each fresh press of a crouch key flips the latch */
  if((e.code==="KeyC"||e.code==="ControlLeft")&&!e.repeat&&STATE.crouchToggle)
    STATE.crouchLatch=!STATE.crouchLatch;
  if(e.code==="Digit6"){
    const now=performance.now();
    dbg6 = (now-dbg6T<1500)? dbg6+1 : 1; dbg6T=now;
    if(dbg6>=3){ dbg6=0; debugSkipToElevator(); }
  }
  if(e.code==="Digit7"){
    const now=performance.now();
    dbg7 = (now-dbg7T<1500)? dbg7+1 : 1; dbg7T=now;
    if(dbg7>=3){ dbg7=0; debugSkipToTheEnd(); }
  }
  /* typed "the end" (space optional): warp to the terminal, set up for the
     ending cutscene. A rolling buffer of recent printable keys, reset after
     a 2s pause so it only fires on a deliberate phrase. */
  if(e.key&&e.key.length===1){
    const now=performance.now();
    if(now-typedT>2000) typed="";
    typedT=now;
    typed=(typed+e.key.toLowerCase()).slice(-8);
    if(typed.endsWith("the end")||typed.endsWith("theend")){ typed=""; debugWarpToTerminal(); }
  }
});
addEventListener("keyup",e=>KEYS[e.code]=false);
document.addEventListener("mousemove",e=>{
  if(document.pointerLockElement!==renderer.domElement) return;
  STATE.yaw -= e.movementX*0.0022*STATE.sens;
  STATE.pitch = clamp(STATE.pitch - e.movementY*0.0022*STATE.sens, -1.45, 1.45);
});
document.addEventListener("pointerlockchange",()=>{
  const locked = document.pointerLockElement===renderer.domElement;
  if(!locked && STATE.playing && !STATE.dead && !STATE.won &&
     ui.how.classList.contains("hide") && ui.pause.classList.contains("hide") &&
     ui.sound.classList.contains("hide")){
    setPaused(true); ui.pause.classList.remove("hide");
  }
});
/* keep Space as jump only: never let it re-trigger a focused button */
document.addEventListener("click",e=>{ if(e.target.tagName==="BUTTON") e.target.blur(); },true);
