/* ---------------- game lifecycle ---------------- */
import { $ } from "./utils.js";
import { STATE, monster, spider } from "./state.js";
import { W, H, cellToWorld, farOpenWorldPoint } from "./map.js";
import { scene, buildLevel, clearLevelScene, setLevelEnvironment } from "./scene.js";
import { placeProps, interactables, exitDoor, clearInteractables } from "./props.js";
import { makeMonster, wakeMonster, escalateMonster, clearMonsterFx } from "./monster.js";
import { buildLibrary, LIB } from "./library.js";
import { makeSpider, resetSpider, spiderHearDisc } from "./spider.js";
import { CINE, startTheEndIntro } from "./cutscene.js";
import { AU, sfxDeath, startLibraryAmbience } from "./audio.js";
import { ui, toast, renderObjectives, setPaused, lockPointer } from "./ui.js";

export function startGame(){
  buildLevel(); placeProps();
  monster.mesh=makeMonster(); scene.add(monster.mesh);
  const s=cellToWorld(W>>1,H>>1);
  STATE.pos.set(s.x,0,s.z);
  STATE.playing=true;
  ui.hud.classList.add("on");
  renderObjectives();
  lockPointer();
}
/* ---------------- the descent: level 0 → THE END ---------------- */
/* reached from the end of the elevator cutscene, under a black screen:
   tear the backrooms down, raise the infinite library, and wake the
   player up inside the wreck */
export function enterTheEnd(){
  STATE.level=1;
  STATE.libT0=STATE.time;
  clearLevelScene();
  clearInteractables();
  clearMonsterFx();
  monster.active=false; monster.mesh=null; monster.shock=null;
  monster.holdAt30=false; monster.held=false;
  if(AU.ctx){
    const t=AU.ctx.currentTime;
    if(AU.droneGain) AU.droneGain.gain.setTargetAtTime(0.0001,t,1.5);  // level 0's voice dies away
    AU.proxGain.gain.setTargetAtTime(0,t,0.3);
    AU.breathGain.gain.setTargetAtTime(0,t,0.3);
  }
  ui.dread.style.opacity=0; ui.staticfx.style.opacity=0;
  setLevelEnvironment(1);
  buildLibrary();
  spider.mesh=makeSpider(); scene.add(spider.mesh);
  resetSpider(LIB.spawn.x,LIB.spawn.z,40);
  spider.active=false;                 // it starts its rounds when the intro ends
  STATE.pos.copy(LIB.spawn);
  STATE.y=0; STATE.vy=0; STATE.grounded=true; STATE.velX=0; STATE.velZ=0;
  STATE.yaw=LIB.spawnYaw; STATE.pitch=0; STATE.stamina=1; STATE.crouch=false;
  STATE.libWakeT=-2;                   // the whole grid held dark until the doors part
  startLibraryAmbience();
  renderObjectives();
  startTheEndIntro();
}
export function respawn(){
  if(STATE.level===1){
    /* you wake back at the wreck; the disks you fed the terminal stay fed,
       the ones in your pockets are somehow still there */
    STATE.pos.copy(LIB.spawn);
    STATE.yaw=LIB.spawnYaw; STATE.pitch=0;
    STATE.y=0; STATE.vy=0; STATE.grounded=true; STATE.velX=0; STATE.velZ=0;
    STATE.dead=false; STATE.stamina=1; STATE.crouch=false; STATE.crouchLatch=false;
    STATE.libBlackout=0; LIB.blackT=0;
    resetSpider(LIB.spawn.x,LIB.spawn.z,36);
    ui.dread.style.opacity=0;
    ui.staticfx.style.opacity=0;
    return;
  }
  const s=cellToWorld(W>>1,H>>1);
  STATE.pos.set(s.x,0,s.z);
  STATE.y=0; STATE.vy=0; STATE.grounded=true; STATE.velX=0; STATE.velZ=0;
  STATE.dead=false; STATE.stamina=1; STATE.crouchLatch=false;
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
  if(!STATE.playing||STATE.dead||STATE.won||CINE.active||!exitDoor||STATE.level!==0) return;
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
/* debug warp (triple-tap [7]): from level 0, drop straight into THE END;
   already there, pocket every remaining disk (the spider hears the last one) */
export function debugSkipToTheEnd(){
  if(!STATE.playing||STATE.dead||STATE.won||CINE.active) return;
  if(STATE.level===0){
    STATE.bottles=3; STATE.hasFuse=true; STATE.powerOn=true; STATE.objective=3;
    enterTheEnd();
    toast("DEBUG: dropped into THE END.",2000);
  } else {
    let last=null;
    for(const it of interactables){
      if(it.kind!=="disc"||it.taken) continue;
      it.taken=true; scene.remove(it.mesh);
      STATE.discsCarried++; STATE.discsFound++; last=it;
    }
    if(STATE.libFirstPickup<0) STATE.libFirstPickup=STATE.time;
    if(last) spiderHearDisc(last.mesh.position.x,last.mesh.position.z);
    renderObjectives();
    toast("DEBUG: every disk pocketed.",2000);
  }
}
/* debug warp (type "the end"): set THE END up for the final cutscene — every
   disk in your pockets, the librarian parked far off, and you standing right
   at the terminal. Press [E] to play the ending. Works from either level. */
export function debugWarpToTerminal(){
  if(!STATE.playing||STATE.dead||STATE.won) return;
  if(STATE.level===0){
    STATE.bottles=3; STATE.hasFuse=true; STATE.powerOn=true; STATE.objective=3;
    enterTheEnd();                       // builds the library + starts the intro
  }
  /* skip whatever cinematic is running and lift its black hold */
  if(CINE.active){ CINE.active=false; CINE.kind=null; }
  ui.flash.style.transition="none"; ui.flash.style.opacity=0;
  ui.dread.style.opacity=0; ui.staticfx.style.opacity=0;
  /* the level is fully awake and the librarian is on its rounds */
  STATE.libWakeT=-1;
  spider.active=true;
  if(spider.mesh) spider.mesh.visible=true;
  /* pocket every remaining disk so a single delivery clears the count */
  for(const it of interactables){
    if(it.kind!=="disc"||it.taken) continue;
    it.taken=true; scene.remove(it.mesh);
    STATE.discsCarried++; STATE.discsFound++;
  }
  if(STATE.libFirstPickup<0) STATE.libFirstPickup=STATE.time;
  /* park it far from the desk so it can't crash the test */
  resetSpider(LIB.deskPos.x, LIB.deskPos.z, 40);
  /* stand just south of the desk (the terminal faces that way), looking at it */
  STATE.pos.set(LIB.deskPos.x, 0, LIB.deskPos.z+1.9);
  STATE.y=0; STATE.vy=0; STATE.grounded=true; STATE.velX=0; STATE.velZ=0;
  STATE.yaw=0; STATE.pitch=-0.05; STATE.crouch=false; STATE.crouchLatch=false;
  renderObjectives();
  toast("DEBUG: at the terminal, disks in hand.",2200);
}
export function die(){
  if(STATE.dead) return;
  STATE.dead=true; STATE.deaths++;
  sfxDeath();
  if(AU.ctx){
    const t=AU.ctx.currentTime;
    AU.proxGain.gain.setTargetAtTime(0,t,0.2);
    AU.breathGain.gain.setTargetAtTime(0,t,0.2);
    if(AU.spiderBedGain) AU.spiderBedGain.gain.setTargetAtTime(0,t,0.2);
  }
  ui.flash.style.transition="none"; ui.flash.style.background="#1a0000"; ui.flash.style.opacity=0.95;
  setTimeout(()=>{ui.flash.style.transition="opacity 1.2s";ui.flash.style.opacity=0;},120);
  const quotes = STATE.level===1
    ? ["IT HEARD THE DISK LEAVE THE SHELF","EIGHT LEGS ARE FASTER THAN TWO",
       "THE TABLES WERE RIGHT THERE","NEXT TIME, CRAWL","SILENCE IS A CURRENCY — YOU OVERSPENT"]
    : ["YOU SHOULDN'T HAVE LET IT SEE YOU","IT WAS FASTER THAN YOU THOUGHT",
       "THE HUM SWALLOWED YOUR SCREAM","NEXT TIME, CROUCH SOONER"];
  $("deathQuote").textContent=quotes[Math.floor(Math.random()*quotes.length)];
  const body=$("deathBody");
  if(body) body.textContent = STATE.level===1
    ? "You wake on the floor of the wrecked cab. Your pockets are, somehow, still full — and the terminal keeps what it was fed. The librarian has gone back to its shelves."
    : "You wake at the place you first fell through. Your pockets are, somehow, still full. Your progress is kept. It has already forgotten you — for now.";
  setPaused(true,true);            // keep audio so the death sound plays out
  if(document.pointerLockElement) document.exitPointerLock();
  ui.death.classList.remove("hide");
  renderObjectives();
}
export function win(){
  STATE.won=true;
  if(AU.ctx){
    const t=AU.ctx.currentTime;
    AU.proxGain.gain.setTargetAtTime(0,t,0.3);
    AU.breathGain.gain.setTargetAtTime(0,t,0.3);
    if(AU.spiderBedGain) AU.spiderBedGain.gain.setTargetAtTime(0,t,0.3);
  }
  setPaused(true,true);
  if(document.pointerLockElement) document.exitPointerLock();
  const fmt=s=>`${String(Math.floor(s/60)).padStart(2,"0")}:${String(Math.floor(s)%60).padStart(2,"0")}`;
  const wT=$("winTitle"), wS=$("winSub");
  if(STATE.level===1){
    if(wT) wT.textContent="THE END";
    if(wS) wS.textContent="THE TERMINAL HAS WHAT IT WANTED. THE LIBRARY LETS YOU GO.";
    $("winStats").innerHTML=
      `<div class="statrow"><span>TIME IN LEVEL 0</span><span>${fmt(STATE.libT0)}</span></div>`+
      `<div class="statrow"><span>TIME IN THE END</span><span>${fmt(STATE.time-STATE.libT0)}</span></div>`+
      `<div class="statrow"><span>FLOPPY DISKS RETURNED</span><span>${STATE.discsDelivered}/${STATE.discTotal}</span></div>`+
      `<div class="statrow"><span>TIMES CAUGHT</span><span>${STATE.deaths}</span></div>`;
  } else {
    /* level 0's ending now leads DOWN, not out — this stays as a fallback */
    if(wT) wT.textContent="GOING DOWN";
    if(wS) wS.textContent="THE DOORS SAVED YOU. THE BRAKES DID NOT.";
    const t=Math.floor(STATE.time);
    $("winStats").innerHTML=
      `<div class="statrow"><span>TIME IN LEVEL 0</span><span>${fmt(t)}</span></div>`+
      `<div class="statrow"><span>ALMOND WATER FOUND</span><span>${STATE.bottles}/3</span></div>`+
      `<div class="statrow"><span>TIMES CAUGHT</span><span>${STATE.deaths}</span></div>`+
      `<div class="statrow"><span>OBJECTIVES CLEARED</span><span>4/4</span></div>`;
  }
  ui.win.classList.remove("hide");
}
