/* ---------------- interaction ---------------- */
import { STATE, monster } from "./state.js";
import { scene } from "./scene.js";
import { interactables, exitDoor } from "./props.js";
import { sfxPickup, sfxClunk, sfxPowerOn } from "./audio.js";
import { ui, toast, renderObjectives } from "./ui.js";
import { wakeMonster } from "./monster.js";
import { win } from "./lifecycle.js";

let focusedItem=null;
export function tryInteract(){
  if(!STATE.playing||STATE.paused||STATE.dead||!focusedItem) return;
  const it=focusedItem;
  if(it.kind==="bottle"){
    it.taken=true; scene.remove(it.mesh); sfxPickup();
    STATE.bottles++;
    if(STATE.bottles===1 && !monster.active) wakeMonster();
    if(STATE.bottles>=3 && STATE.objective===0){
      STATE.objective=1; toast("Hydrated. Now find a fuse for the breaker.");
    } else toast(`Almond water ${STATE.bottles}/3.`);
  } else if(it.kind==="fuse"){
    if(STATE.objective<1){toast("You don't need this yet. Water first.");return;}
    it.taken=true; scene.remove(it.mesh); sfxPickup();
    STATE.hasFuse=true; STATE.objective=2;
    toast("Fuse acquired. Find the breaker panel.");
  } else if(it.kind==="breaker"){
    if(STATE.objective<2){toast("Dead panel. It needs a fuse — and you're not ready.");sfxClunk();return;}
    it.taken=true; STATE.powerOn=true; STATE.objective=3;
    sfxClunk(); sfxPowerOn();
    it.mesh.userData.lamp.material.color.set(0x39d24a);
    it.mesh.userData.lever.position.y=0.1;
    if(exitDoor) exitDoor.userData.sign.material.color.set(0xffffff);
    toast("POWER RESTORED. The exit door is unsealed — find it.");
  } else if(it.kind==="exit"){
    if(STATE.objective<3){sfxClunk();toast("Sealed. The sign is dark. Restore the power first.");return;}
    win();
  }
  renderObjectives();
}
export function updateFocus(){
  focusedItem=null;
  let best=2.7;
  const fwd=new THREE.Vector3(-Math.sin(STATE.yaw),0,-Math.cos(STATE.yaw));
  for(const it of interactables){
    if(it.taken&&it.kind!=="exit") continue;
    const d=it.mesh.position.clone().sub(STATE.pos); d.y=0;
    const dist=d.length();
    if(dist<best && d.normalize().dot(fwd)>0.45){ best=dist; focusedItem=it; }
  }
  if(focusedItem){
    ui.prompt.innerHTML=`<b>[E]</b> ${focusedItem.label}`;
    ui.prompt.classList.add("show");
  } else ui.prompt.classList.remove("show");
}
