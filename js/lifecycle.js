/* ---------------- game lifecycle ---------------- */
import { $ } from "./utils.js";
import { STATE, monster } from "./state.js";
import { W, H, cellToWorld, farOpenWorldPoint } from "./map.js";
import { scene, buildLevel } from "./scene.js";
import { placeProps, interactables, exitDoor } from "./props.js";
import { makeMonster, wakeMonster, escalateMonster } from "./monster.js";
import { CINE } from "./cutscene.js";
import { AU, sfxDeath } from "./audio.js";
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
    monster.rush=false; monster.held=false; monster.holdAt30=false;
  }
  ui.dread.style.opacity=0;
  ui.staticfx.style.opacity=0;
}
/* debug warp (triple-tap [6] in game): every objective cleared, the player
   standing at the elevator with the call button live — [E] starts the ride */
export function debugSkipToElevator(){
  if(!STATE.playing||STATE.dead||STATE.won||CINE.active||!exitDoor) return;
  for(const it of interactables){
    if(it.taken) continue;
    if(it.kind==="bottle"||it.kind==="fuse"){ it.taken=true; scene.remove(it.mesh); }
    else if(it.kind==="breaker"){
      it.taken=true;
      it.mesh.userData.lamp.material.color.set(0x39d24a);
      it.mesh.userData.lever.position.y=0.1;
    }
  }
  STATE.bottles=3; STATE.hasFuse=true; STATE.powerOn=true; STATE.objective=3;
  exitDoor.userData.sign.material.color.set(0xffffff);
  if(!monster.active){ monster.wakeT=0; wakeMonster(); }
  while(monster.escalation<4) escalateMonster();
  /* park the entity far off so the warp itself isn't an ambush */
  const mp=farOpenWorldPoint(exitDoor.position.x,exitDoor.position.z,44);
  monster.pos.set(mp.x,0,mp.z);
  monster.state="wander"; monster.path=[]; monster.lastSeen=null;
  monster.curSpeed=0; monster.rush=false;
  /* stand 2.4m out from the doors, facing them */
  const out=new THREE.Vector3(0,0,1).applyQuaternion(exitDoor.quaternion);
  STATE.pos.set(exitDoor.position.x+out.x*2.4, 0, exitDoor.position.z+out.z*2.4);
  STATE.y=0; STATE.vy=0; STATE.grounded=true; STATE.velX=0; STATE.velZ=0;
  STATE.yaw=Math.atan2(out.x,out.z); STATE.pitch=0;
  renderObjectives();
  toast("DEBUG: warped to the elevator.",2000);
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
  /* reached from the end of the elevator cutscene — the ride down IS the
     transition; no extra sting here */
  STATE.won=true;
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
