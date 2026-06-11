/* ---------------- input ---------------- */
import { clamp } from "./utils.js";
import { STATE, KEYS } from "./state.js";
import { renderer } from "./scene.js";
import { ui, setPaused, toggleHow, toggleSound } from "./ui.js";
import { tryInteract } from "./interact.js";

addEventListener("keydown",e=>{
  KEYS[e.code]=true;
  if(e.code==="Space") e.preventDefault();
  if(!STATE.playing||STATE.dead||STATE.won) return;
  if(e.code==="KeyH") toggleHow();
  if(e.code==="KeyO") toggleSound();
  if(e.code==="KeyE") tryInteract();
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
