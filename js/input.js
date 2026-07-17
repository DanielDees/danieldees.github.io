/* ---------------- input ---------------- */
import { clamp } from "./utils.js";
import { STATE, KEYS } from "./state.js";
import { renderer } from "./scene.js";
import { ui, setPaused, toggleSound } from "./ui.js";
import { tryInteract } from "./interact.js";
import { debugSkipToElevator, debugSkipToTheEnd, debugWarpToTerminal } from "./lifecycle.js";

let dbg6=0, dbg6T=0;   // hidden debug chord: [6] ×3 warps to the endgame
let dbg7=0, dbg7T=0;   // [7] ×3 drops into THE END / pockets every disk
let dbg8=0, dbg8T=0;   // [8] ×3 warps to the terminal, disks in hand, ready for the ending
addEventListener("keydown",e=>{
  KEYS[e.code]=true;
  if(e.code==="Space") e.preventDefault();
  /* swallow CTRL while in game: it is no longer a crouch key, and letting
     browser chords through (Ctrl+W closes the tab, Ctrl+N/T spawn windows…)
     was killing runs mid-play. preventDefault on the modifier and on any
     ctrl-combo keeps those shortcuts from firing while you're focused. */
  if(STATE.playing && !STATE.dead && !STATE.won &&
     (e.code==="ControlLeft"||e.code==="ControlRight"||e.ctrlKey)) e.preventDefault();
  if(!STATE.playing||STATE.dead||STATE.won) return;
  if(e.code==="KeyO") toggleSound();
  if(e.code==="KeyE") tryInteract();
  /* toggle-mode crouch: each fresh press of [C] flips the latch */
  if(e.code==="KeyC"&&!e.repeat&&STATE.crouchToggle)
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
  if(e.code==="Digit8"){
    const now=performance.now();
    dbg8 = (now-dbg8T<1500)? dbg8+1 : 1; dbg8T=now;
    if(dbg8>=3){ dbg8=0; debugWarpToTerminal(); }
  }
});
addEventListener("keyup",e=>KEYS[e.code]=false);
/* stuck-input guard: when the window loses focus (alt-tab, a browser chord,
   the OS stealing focus) the browser never fires the matching keyup, so a
   held movement key stays latched true and the player drifts forever. Wipe
   every raw key whenever focus or visibility is lost. */
const clearKeys=()=>{ for(const k in KEYS) KEYS[k]=false; };
addEventListener("blur",clearKeys);
document.addEventListener("visibilitychange",()=>{ if(document.hidden) clearKeys(); });
document.addEventListener("mousemove",e=>{
  if(document.pointerLockElement!==renderer.domElement) return;
  STATE.yaw -= e.movementX*0.0022*STATE.sens;
  STATE.pitch = clamp(STATE.pitch - e.movementY*0.0022*STATE.sens, -1.45, 1.45);
});
document.addEventListener("pointerlockchange",()=>{
  const locked = document.pointerLockElement===renderer.domElement;
  if(!locked) clearKeys();      // releasing the mouse can also eat a keyup
  if(!locked && STATE.playing && !STATE.dead && !STATE.won &&
     ui.how.classList.contains("hide") && ui.pause.classList.contains("hide") &&
     ui.sound.classList.contains("hide")){
    setPaused(true); ui.pause.classList.remove("hide");
  }
});
/* keep Space as jump only: never let it re-trigger a focused button */
document.addEventListener("click",e=>{ if(e.target.tagName==="BUTTON") e.target.blur(); },true);
