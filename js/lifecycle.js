/* ---------------- game lifecycle ---------------- */
import { $ } from "./utils.js";
import { STATE, monster } from "./state.js";
import { W, H, cellToWorld, farOpenWorldPoint } from "./map.js";
import { scene, buildLevel } from "./scene.js";
import { placeProps } from "./props.js";
import { makeMonster } from "./monster.js";
import { AU, sfxDeath, sfxDoor } from "./audio.js";
import { ui, toast, renderObjectives, setPaused, lockPointer } from "./ui.js";

export function startGame(){
  buildLevel(); placeProps();
  monster.mesh=makeMonster(); scene.add(monster.mesh);
  const s=cellToWorld(W>>1,H>>1);
  STATE.pos.set(s.x,0,s.z);
  STATE.playing=true;
  ui.hud.classList.add("on");
  renderObjectives();
  toast("Find 3 bottles of almond water. Stay quiet.");
  lockPointer();
}
export function respawn(){
  const s=cellToWorld(W>>1,H>>1);
  STATE.pos.set(s.x,0,s.z);
  STATE.y=0; STATE.vy=0; STATE.grounded=true; STATE.velX=0; STATE.velZ=0;
  STATE.dead=false; STATE.stamina=1;
  if(monster.active){
    const p=farOpenWorldPoint(STATE.pos.x,STATE.pos.z,44);
    monster.pos.set(p.x,0,p.z);
    monster.state="wander"; monster.path=[]; monster.lastSeen=null; monster.curSpeed=0;
  }
  ui.dread.style.opacity=0;
}
export function die(){
  if(STATE.dead) return;
  STATE.dead=true; STATE.deaths++;
  sfxDeath();
  if(AU.ctx){
    const t=AU.ctx.currentTime;
    AU.proxGain.gain.setTargetAtTime(0,t,0.2);
    AU.breathGain.gain.setTargetAtTime(0,t,0.2);
  }
  ui.flash.style.transition="none"; ui.flash.style.background="#1a0000"; ui.flash.style.opacity=0.95;
  setTimeout(()=>{ui.flash.style.transition="opacity 1.2s";ui.flash.style.opacity=0;},120);
  const quotes=["YOU SHOULDN'T HAVE LET IT SEE YOU","IT WAS FASTER THAN YOU THOUGHT","THE HUM SWALLOWED YOUR SCREAM","NEXT TIME, CROUCH SOONER"];
  $("deathQuote").textContent=quotes[Math.floor(Math.random()*quotes.length)];
  setPaused(true,true);            // keep audio so the death sound plays out
  if(document.pointerLockElement) document.exitPointerLock();
  ui.death.classList.remove("hide");
  renderObjectives();
}
export function win(){
  STATE.won=true; sfxDoor();
  if(AU.ctx){
    const t=AU.ctx.currentTime;
    AU.proxGain.gain.setTargetAtTime(0,t,0.3);
    AU.breathGain.gain.setTargetAtTime(0,t,0.3);
  }
  setPaused(true,true);
  if(document.pointerLockElement) document.exitPointerLock();
  const t=Math.floor(STATE.time);
  $("winStats").innerHTML=
    `<div class="statrow"><span>TIME IN LEVEL 0</span><span>${String(Math.floor(t/60)).padStart(2,"0")}:${String(t%60).padStart(2,"0")}</span></div>`+
    `<div class="statrow"><span>ALMOND WATER FOUND</span><span>${STATE.bottles}/3</span></div>`+
    `<div class="statrow"><span>TIMES CAUGHT</span><span>${STATE.deaths}</span></div>`+
    `<div class="statrow"><span>OBJECTIVES CLEARED</span><span>4/4</span></div>`;
  ui.win.classList.remove("hide");
}
