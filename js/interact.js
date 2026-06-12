/* ---------------- interaction ---------------- */
import { STATE, monster } from "./state.js";
import { scene } from "./scene.js";
import { interactables } from "./props.js";
import { sfxPickup, sfxClunk, sfxDiscPickup, sfxDiscInsert } from "./audio.js";
import { ui, renderObjectives } from "./ui.js";
import { escalateMonster } from "./monster.js";
import { CINE, startBreakerCine, startElevatorCine, startTerminalCine } from "./cutscene.js";
import { spiderHearDisc } from "./spider.js";
import { startDeadPC } from "./library.js";

let focusedItem=null;
export function tryInteract(){
  if(!STATE.playing||STATE.paused||STATE.dead||CINE.active||!focusedItem) return;
  const it=focusedItem;
  if(it.kind==="bottle"){
    it.taken=true; scene.remove(it.mesh); sfxPickup();
    STATE.bottles++;
    /* the first bottle lights a ~4s fuse instead of waking it instantly —
       updateMonster runs the countdown and fires wakeMonster. Every later
       pickup is an objective step, so the entity escalates. */
    if(STATE.bottles===1){
      if(!monster.active && monster.wakeT<=0) monster.wakeT=4;
    } else escalateMonster();
    if(STATE.bottles>=3 && STATE.objective===0) STATE.objective=1;
  } else if(it.kind==="fuse"){
    if(STATE.objective<1){sfxClunk();return;}            // not yet — water first
    it.taken=true; scene.remove(it.mesh); sfxPickup();
    STATE.hasFuse=true; STATE.objective=2; escalateMonster();
  } else if(it.kind==="breaker"){
    if(STATE.objective<2){sfxClunk();return;}            // dead panel, no fuse yet
    it.taken=true; STATE.objective=3; escalateMonster();
    /* the cutscene flips STATE.powerOn, the lamp, lever & exit sign itself —
       and sends the entity sprinting for this exact spot */
    startBreakerCine(it);
  } else if(it.kind==="exit"){
    if(STATE.objective<3){sfxClunk();return;}            // call button dead until power's on
    it.taken=true;
    startElevatorCine(it);
  }
  /* ---- THE END ---- */
  else if(it.kind==="disc"){
    it.taken=true; scene.remove(it.mesh); sfxDiscPickup();
    STATE.discsCarried++; STATE.discsFound++;
    if(STATE.libFirstPickup<0) STATE.libFirstPickup=STATE.time;
    /* the sound carries. It ALWAYS carries. */
    spiderHearDisc(it.mesh.position.x,it.mesh.position.z);
  } else if(it.kind==="terminal"){
    if(STATE.discsCarried<=0){ sfxClunk(); return; }     // empty-handed
    const n=STATE.discsCarried;
    for(let i=0;i<Math.min(n,8);i++) sfxDiscInsert(i*0.16);
    STATE.discsDelivered+=n; STATE.discsCarried=0;
    if(STATE.discsDelivered>=STATE.discTotal) startTerminalCine();
  } else if(it.kind==="deadpc"){
    startDeadPC(it);
  } else if(it.kind==="deadElev"){
    sfxClunk();
  }
  renderObjectives();
}
export function updateFocus(){
  focusedItem=null;
  let best=2.7;
  const fwd=new THREE.Vector3(-Math.sin(STATE.yaw),0,-Math.cos(STATE.yaw));
  for(const it of interactables){
    if(it.taken&&it.kind!=="exit"&&it.kind!=="terminal"&&it.kind!=="deadElev") continue;
    const d=it.mesh.position.clone().sub(STATE.pos); d.y=0;
    const dist=d.length();
    if(dist<best && d.normalize().dot(fwd)>0.45){ best=dist; focusedItem=it; }
  }
  if(focusedItem){
    const lbl = typeof focusedItem.label==="function"? focusedItem.label() : focusedItem.label;
    ui.prompt.innerHTML=`<b>[E]</b> ${lbl}`;
    ui.prompt.classList.add("show");
  } else ui.prompt.classList.remove("show");
}
