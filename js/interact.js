/* ---------------- interaction ---------------- */
import { STATE, monster } from "./state.js";
import { scene } from "./scene.js";
import { interactables } from "./props.js";
import { sfxPickup, sfxClunk, sfxDiscPickup, sfxDiscInsert } from "./audio.js";
import { ui, toast, renderObjectives } from "./ui.js";
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
    if(STATE.bottles>=3 && STATE.objective===0){
      STATE.objective=1; toast("Hydrated. Now find a fuse for the breaker.");
    } else toast(`Almond water ${STATE.bottles}/3.`);
  } else if(it.kind==="fuse"){
    if(STATE.objective<1){toast("You don't need this yet. Water first.");return;}
    it.taken=true; scene.remove(it.mesh); sfxPickup();
    STATE.hasFuse=true; STATE.objective=2; escalateMonster();
    toast("Fuse acquired. Find the breaker panel.");
  } else if(it.kind==="breaker"){
    if(STATE.objective<2){toast("Dead panel. It needs a fuse — and you're not ready.");sfxClunk();return;}
    it.taken=true; STATE.objective=3; escalateMonster();
    /* the cutscene flips STATE.powerOn, the lamp, lever & exit sign itself —
       and sends the entity sprinting for this exact spot */
    startBreakerCine(it);
  } else if(it.kind==="exit"){
    if(STATE.objective<3){sfxClunk();toast("Dead. The call button does nothing — restore the power first.");return;}
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
    toast(STATE.discsFound===1
      ? `Floppy disk 1/${STATE.discTotal}. Somewhere, the scratching stopped.`
      : `Floppy disk ${STATE.discsFound}/${STATE.discTotal}.`);
  } else if(it.kind==="terminal"){
    if(STATE.discsCarried<=0){
      sfxClunk();
      toast(STATE.discsDelivered>0? "It wants the rest of them." : "The drive bay is empty. It is waiting.");
      return;
    }
    const n=STATE.discsCarried;
    for(let i=0;i<Math.min(n,8);i++) sfxDiscInsert(i*0.16);
    STATE.discsDelivered+=n; STATE.discsCarried=0;
    if(STATE.discsDelivered>=STATE.discTotal) startTerminalCine();
    else toast(`The terminal swallows ${n===1?"the disk":n+" disks"}. ${STATE.discsDelivered}/${STATE.discTotal}.`);
  } else if(it.kind==="deadpc"){
    startDeadPC(it);
    toast("It wakes — says its piece — and dies for good.");
  } else if(it.kind==="deadElev"){
    sfxClunk();
    toast("Dead. It brought you down here; it owes you nothing more.");
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
