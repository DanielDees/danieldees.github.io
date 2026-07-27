/* ---------------- game lifecycle ---------------- */
import { $ } from "./utils.js";
import { STATE, monster, spider } from "./state.js";
import { W, H, cellToWorld, farOpenWorldPoint } from "./map.js";
import { scene, lights, buildLevel, clearLevelScene, setLevelEnvironment } from "./scene.js";
import { placeProps, interactables, exitDoor, clearInteractables } from "./props.js";
import { makeMonster, wakeMonster, escalateMonster, clearMonsterFx } from "./monster.js";
import { buildLibrary, LIB } from "./library.js";
import { buildCave, CAVE } from "./cave.js";
import { makeSpider, resetSpider, spiderHearDisc, resetSpiderCave } from "./spider.js";
import { makeHatchlings, resetHatchlings, silenceHatchlings } from "./hatchling.js";
import { CINE, updateCinematic, startTheEndIntro, startNestIntro,
         startDeathCam, endDeathCam } from "./cutscene.js";
import { AU, sfxDeath, startLibraryAmbience, startCaveAmbience } from "./audio.js";
import { ui, toast, renderObjectives, setPaused, lockPointer, setLevelChrome, FLOORS } from "./ui.js";
import { igniteClutch, hushCave } from "./cave.js";

export function startGame(){
  buildLevel(); placeProps();
  monster.mesh=makeMonster(); scene.add(monster.mesh);
  const s=cellToWorld(W>>1,H>>1);
  STATE.pos.set(s.x,0,s.z);
  STATE.playing=true;
  ui.hud.classList.add("on");
  setLevelChrome(0);
  renderObjectives(true);
  lockPointer();
}
/* ---------------- the descent: level 0 → THE END ---------------- */
/* reached from the end of the elevator cutscene, under a black screen:
   tear the backrooms down, raise the infinite library, and wake the
   player up inside the wreck */
export function enterTheEnd(){
  STATE.level=1;
  STATE.libT0=STATE.time;
  STATE.holeOpen=false;
  STATE.guide=null;
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
  ui.vignette.style.opacity=0.16;      // THE END is dark enough; the edge vignette reads as obscuring here (−80%)
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
  setLevelChrome(1);
  renderObjectives(true);
  startTheEndIntro();
}
/* ---------------- the second descent: THE END → THE NEST ---------------- */
/* reached from the end of the stair-descent fade, under a black screen:
   tear the library down, raise the cave, and set the player down where the
   cut stone gave up and the rock took over */
export function enterTheNest(){
  STATE.level=2;
  STATE.caveT0=STATE.time;
  STATE.hasLantern=false; STATE.lanternOn=false; STATE.lanternCharge=0.65; STATE.cranking=false;
  STATE.clutchesLit=0; STATE.frenzyT=0;
  STATE.holeOpen=false;                 // the library is above and behind you now
  STATE.guide=null;
  clearLevelScene();
  clearInteractables();
  spider.active=false; spider.mesh=null;   // the library build owned that mesh
  if(AU.ctx){
    const t=AU.ctx.currentTime;
    AU.proxGain.gain.setTargetAtTime(0,t,0.3);
    AU.breathGain.gain.setTargetAtTime(0,t,0.3);
    if(AU.spiderBedGain) AU.spiderBedGain.gain.setTargetAtTime(0,t,0.3);
  }
  ui.dread.style.opacity=0; ui.staticfx.style.opacity=0;
  ui.vignette.style.opacity=0.16;
  setLevelEnvironment(2);
  buildCave();
  spider.mesh=makeSpider(); scene.add(spider.mesh);
  resetSpiderCave(CAVE.spawn.x,CAVE.spawn.z,34);
  spider.active=false;                  // it starts tending when the intro ends
  makeHatchlings();
  STATE.pos.copy(CAVE.spawn);
  STATE.y=0; STATE.vy=0; STATE.grounded=true; STATE.velX=0; STATE.velZ=0;
  STATE.yaw=CAVE.spawnYaw; STATE.pitch=0; STATE.stamina=1; STATE.crouch=false;
  const hint=$("keysHint");
  if(hint) hint.textContent="WASD MOVE · SHIFT SPRINT · C CROUCH · E USE · F LAMP · R CRANK";
  startCaveAmbience();
  setLevelChrome(2);
  renderObjectives(true);
  startNestIntro();
}
export function respawn(){
  endDeathCam();                     // the iris opens, the world takes its colour back
  if(STATE.level===2){
    /* you wake back under the stair that no longer goes anywhere. The
       lantern (and everything already burned) stays yours. */
    STATE.pos.copy(CAVE.spawn);
    STATE.yaw=CAVE.spawnYaw; STATE.pitch=0;
    STATE.y=0; STATE.vy=0; STATE.grounded=true; STATE.velX=0; STATE.velZ=0;
    STATE.dead=false; STATE.stamina=1; STATE.crouch=false; STATE.crouchLatch=false;
    STATE.lanternOn=false; STATE.cranking=false;
    STATE.lanternCharge=Math.max(0.4,STATE.lanternCharge);
    STATE.frenzyT=0;
    resetSpiderCave(CAVE.spawn.x,CAVE.spawn.z,30);
    resetHatchlings();
    ui.dread.style.opacity=0;
    ui.staticfx.style.opacity=0;
    return;
  }
  if(STATE.level===1){
    /* you wake back at the wreck; the disks you fed the terminal stay fed,
       the ones in your pockets are somehow still there */
    STATE.pos.copy(LIB.spawn);
    STATE.yaw=LIB.spawnYaw; STATE.pitch=0;
    STATE.y=0; STATE.vy=0; STATE.grounded=true; STATE.velX=0; STATE.velZ=0;
    STATE.dead=false; STATE.stamina=1; STATE.crouch=false; STATE.crouchLatch=false;
    STATE.libBlackout=0;
    /* end any in-flight periodic blackout: the level isn't rebuilt here, so
       each strip's blackMul would otherwise stay stuck where death left it */
    LIB.blackActive=false; LIB.blackElapsed=0; LIB.nextBlack=35;
    for(const L of lights) L.blackMul=1;
    resetSpider(LIB.spawn.x,LIB.spawn.z,36);
    ui.dread.style.opacity=0;
    ui.staticfx.style.opacity=0;
    return;
  }
  /* death restarts level 0 from scratch: the backrooms reshuffle, every
     objective resets, and the entity goes back to sleep. Progress is no
     longer carried across a death down here — you start the floor over. */
  clearLevelScene();
  clearInteractables();
  clearMonsterFx();
  monster.active=false; monster.mesh=null; monster.shock=null; monster.shockTimer=0;
  monster.escalation=0; monster.state="wander"; monster.path=[]; monster.lastSeen=null;
  monster.curSpeed=0; monster.rush=false; monster.held=false; monster.holdAt30=false;
  monster.wakeT=0; monster.knockMove=null;
  STATE.bottles=0; STATE.hasFuse=false; STATE.powerOn=false; STATE.objective=0;
  STATE.time=0; STATE.ambDim=1; STATE.shakeAmp=0;
  buildLevel(); placeProps();
  monster.mesh=makeMonster(); scene.add(monster.mesh);
  const s=cellToWorld(W>>1,H>>1);
  STATE.pos.set(s.x,0,s.z);
  STATE.y=0; STATE.vy=0; STATE.grounded=true; STATE.velX=0; STATE.velZ=0;
  STATE.dead=false; STATE.stamina=1; STATE.crouch=false; STATE.crouchLatch=false;
  STATE.yaw=0; STATE.pitch=0;
  ui.dread.style.opacity=0;
  ui.staticfx.style.opacity=0;
  renderObjectives();
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
/* debug warp (triple-tap [9]): drop straight into THE NEST with the lantern
   already in hand; already there, burn the brood down to one and stand the
   player at the survivor — ready to play the ending. */
export function debugWarpToNest(){
  if(!STATE.playing||STATE.dead||STATE.won) return;
  if(STATE.level!==2){
    if(CINE.active){ CINE.active=false; CINE.kind=null; }
    STATE.bottles=3; STATE.hasFuse=true; STATE.powerOn=true; STATE.objective=3;
    if(STATE.level===0) STATE.libT0=STATE.time;
    enterTheNest();                      // builds the cave + starts the intro
    /* skip the intro: lift the black, wake the cave */
    if(CINE.active){ CINE.active=false; CINE.kind=null; }
    ui.flash.style.transition="none"; ui.flash.style.opacity=0;
    spider.active=true;
    if(spider.mesh) spider.mesh.visible=true;
    for(const it of interactables){
      if(it.kind!=="corpse"||it.taken) continue;
      it.taken=true; scene.remove(it.mesh);
    }
    STATE.hasLantern=true; STATE.lanternCharge=0.85;
    renderObjectives();
    toast("DEBUG: dropped into THE NEST, lantern in hand.",2200);
  } else {
    const un=interactables.filter(it=>it.kind==="clutch"&&!it.taken);
    if(un.length<=1){ toast("DEBUG: one clutch (or none) left already.",2000); return; }
    const keep=un[un.length-1];
    for(const it of un) if(it!==keep) igniteClutch(it);
    STATE.frenzyT=0;                     // calm the room for the test
    const bp=keep.mesh.position;
    STATE.pos.set(bp.x, 0, bp.z+2.2);      // inside the 2.7m interact-focus radius
    STATE.y=0; STATE.vy=0; STATE.grounded=true; STATE.velX=0; STATE.velZ=0;
    STATE.yaw=0; STATE.pitch=-0.05;      // yaw 0 faces −z: straight at the clutch
    resetSpiderCave(bp.x,bp.z,34);
    renderObjectives();
    toast("DEBUG: brood burned down to one — it's right there.",2400);
  }
}
/* ---------------- death ----------------
   die() no longer paints a red screen and opens a menu in the same frame.
   It hands the camera to the death sequence in cutscene.js (the body goes
   down, the dark closes in around whatever is standing over you) and that
   sequence calls back ~2.8s later to raise the card. Everything the card
   has to say — what killed you, what you keep, what to do differently — is
   decided here, where the state lives. */
const fmtT=s=>`${String(Math.floor(s/60)).padStart(2,"0")}:${String(Math.floor(s)%60).padStart(2,"0")}`;
const pick=a=>a[Math.floor(Math.random()*a.length)];
export function die(cause="caught"){
  if(STATE.dead) return;
  STATE.dead=true; STATE.deaths++; STATE.deathCause=cause;
  sfxDeath();
  if(AU.ctx){
    const t=AU.ctx.currentTime;
    AU.proxGain.gain.setTargetAtTime(0,t,0.2);
    AU.breathGain.gain.setTargetAtTime(0,t,0.2);
    if(AU.spiderBedGain) AU.spiderBedGain.gain.setTargetAtTime(0,t,0.2);
  }
  /* THE NEST holds live loops that only the (now-halted) update path can
     close: the clutch fires, the stream, a latched hatchling's screech */
  if(STATE.level===2){ hushCave(); silenceHatchlings(); }
  /* dying mid-cinematic (the breaker scene keeps the entity live) used to
     leave CINE.active latched: main.js stops calling updateCinematic while
     dead, so its own dead/won teardown never ran and the scene resumed
     after the respawn. One call with dt 0 takes that branch and cleans up. */
  if(CINE.active) updateCinematic(0);
  startDeathCam(cause, showDeathCard);
}
function showDeathCard(){
  const lvl=STATE.level, fell=STATE.deathCause==="fall";
  const title = fell? "YOU FELL"
    : lvl===2? "SHE FOUND YOU"
    : lvl===1? "THE LIBRARIAN FOUND YOU"
    : "IT FOUND YOU";
  const quote = fell
    ? pick(["THE DARK UNDER THE BRIDGE GOES A LONG WAY DOWN","THERE WAS NO FLOOR TO FIND",
            "YOU RAN AT A GAP AND THE GAP WON"])
    : lvl===2
    ? pick(["LIGHT FOR THE CHILDREN, DARK FOR THE MOTHER","THE SILK FELT YOUR HEARTBEAT",
            "YOU CRANKED IT ONE NOTCH TOO MANY","THE DRIP HAD LEGS","SHE WON'T FORGIVE THIS"])
    : lvl===1
    ? pick(["IT HEARD THE DISK LEAVE THE SHELF","EIGHT LEGS ARE FASTER THAN TWO",
            "THE TABLES WERE RIGHT THERE","NEXT TIME, CRAWL","SILENCE IS A CURRENCY — YOU OVERSPENT"])
    : pick(["YOU SHOULDN'T HAVE LET IT SEE YOU","IT WAS FASTER THAN YOU THOUGHT",
            "THE HUM SWALLOWED YOUR SCREAM","NEXT TIME, CROUCH SOONER"]);
  const body = fell
    ? "The chasm does not keep what it takes. You wake back at the dead stair with everything you were carrying, and the climb down here to do again."
    : lvl===2
    ? "You wake at the foot of the stair that no longer goes anywhere, the lantern beside you as if placed there. What burned stays burned. The tending has resumed."
    : lvl===1
    ? "You wake on the floor of the wrecked cab. Your pockets are, somehow, still full — and the terminal keeps what it was fed. The librarian has gone back to its shelves."
    : "You wake at the place you first fell through — but the backrooms have already rearranged themselves, and whatever you'd gathered is gone. Start the floor again. Quieter, this time.";
  const tip = fell
    ? "The rock bridge is the only way over the chasm, and it is narrower than it looks. Walk it — momentum from a sprint carries you off the lip."
    : lvl===2
    ? pick(["The squeezes are the only ground she cannot follow you onto. Know where the nearest one is before you strike a light.",
            "A lit lantern makes you invisible to the brood and obvious to their mother. Light it to move through them, kill it to move past her.",
            "Wade the stream when you have to cross open cave: running water eats your footfalls. Scree does the opposite."])
    : lvl===1
    ? pick(["Standing perfectly still reads as safe — even upright, even turning to look. When you don't know where it is, stop.",
            "Get under a reading table. It cannot reach you there, it will circle, and it will lose interest.",
            "It goes up. If it vanishes, look at the ceiling — a drop is telegraphed, and you escape it only by moving out from under."])
    : pick(["Break its line of sight first, then crouch and hold still. Searching is a timer; sprinting restarts it.",
            "It stops and cries out before it commits to a chase. Spend that pause getting round a corner, not watching it.",
            "Flickering lights are its position. Distant flicker is information; flicker on you is the last warning you get."]);
  const t0 = lvl===2? STATE.caveT0 : lvl===1? STATE.libT0 : 0;
  const kept = lvl===2? `LANTERN + ${STATE.clutchesLit}/4 BURNED`
             : lvl===1? `${STATE.discsDelivered}/${STATE.discTotal||"?"} RETURNED`
             : "NOTHING — THE FLOOR RESETS";
  $("deathTitle").textContent=title;
  $("deathQuote").textContent=quote;
  const b=$("deathBody"); if(b) b.textContent=body;
  const tp=$("deathTip"); if(tp) tp.innerHTML=`<b>TRY THIS</b>${tip}`;
  const st=$("deathStats");
  if(st) st.innerHTML=
    `<div class="statrow"><span>FLOOR</span><span>${(FLOORS[lvl]||FLOORS[0]).floor}</span></div>`+
    `<div class="statrow"><span>TIME ON THIS FLOOR</span><span>${fmtT(Math.max(0,STATE.time-t0))}</span></div>`+
    `<div class="statrow"><span>YOU KEEP</span><span>${kept}</span></div>`+
    `<div class="statrow"><span>TIMES CAUGHT</span><span>${STATE.deaths}</span></div>`;
  setPaused(true,true);            // keep audio so the death sound plays out
  if(document.pointerLockElement) document.exitPointerLock();
  ui.death.classList.remove("hide");
  renderObjectives(true);
}
export function win(){
  STATE.won=true;
  if(AU.ctx){
    const t=AU.ctx.currentTime;
    AU.proxGain.gain.setTargetAtTime(0,t,0.3);
    AU.breathGain.gain.setTargetAtTime(0,t,0.3);
    if(AU.spiderBedGain) AU.spiderBedGain.gain.setTargetAtTime(0,t,0.3);
  }
  if(STATE.level===2){ hushCave(); silenceHatchlings(); }
  setPaused(true,true);
  if(document.pointerLockElement) document.exitPointerLock();
  const fmt=fmtT;
  const wT=$("winTitle"), wS=$("winSub"), wB=$("winBadge"), wN=$("winNote"), wA=$("btnAgain");
  /* only THE NEST's ending is the END of the game as it currently stands.
     The other two are level transitions that fell through to this sheet, so
     they keep the plain treatment and say so. */
  const finale = STATE.level===2;
  ui.win.classList.toggle("finale",finale);
  if(wB) wB.classList.toggle("hide",!finale);
  if(finale){
    if(wB) wB.textContent="RUN COMPLETE · ALL THREE FLOORS";
    if(wT) wT.textContent="OUT";
    if(wS) wS.textContent="YOU BURNED HER BROOD AND CLIMBED INTO THE PALE.";
    $("winStats").innerHTML=
      `<div class="statrow"><span>LEVEL 0 · THE BACKROOMS</span><span>${fmt(STATE.libT0)}</span></div>`+
      `<div class="statrow"><span>THE END · THE LIBRARY</span><span>${fmt(Math.max(0,STATE.caveT0-STATE.libT0))}</span></div>`+
      `<div class="statrow"><span>THE NEST · THE CAVE</span><span>${fmt(Math.max(0,STATE.time-STATE.caveT0))}</span></div>`+
      `<div class="statrow"><span>TOTAL TIME</span><span>${fmt(STATE.time)}</span></div>`+
      `<div class="statrow"><span>CLUTCHES BURNED</span><span>${STATE.clutchesLit}/4</span></div>`+
      `<div class="statrow"><span>DISKS RETURNED</span><span>${STATE.discsDelivered}/${STATE.discTotal||0}</span></div>`+
      `<div class="statrow"><span>TIMES CAUGHT</span><span>${STATE.deaths}</span></div>`;
    if(wN) wN.innerHTML="You have reached the end of NOCLIP <b>v3.1.0</b> — three floors, "+
      "three keepers, and one chimney out. Nothing has been built above the fissure yet: "+
      "whatever the pale is, it is the next version's problem.<br>Thank you for playing.";
    if(wA) wA.textContent="FALL THROUGH AGAIN";
  } else if(STATE.level===1){
    if(wT) wT.textContent="THE END";
    if(wS) wS.textContent="IT WARNED YOU. YOU WENT DOWN ANYWAY.";
    $("winStats").innerHTML=
      `<div class="statrow"><span>TIME IN LEVEL 0</span><span>${fmt(STATE.libT0)}</span></div>`+
      `<div class="statrow"><span>TIME IN THE END</span><span>${fmt(STATE.time-STATE.libT0)}</span></div>`+
      `<div class="statrow"><span>FLOPPY DISKS RETURNED</span><span>${STATE.discsDelivered}/${STATE.discTotal}</span></div>`+
      `<div class="statrow"><span>TIMES CAUGHT</span><span>${STATE.deaths}</span></div>`;
    if(wN) wN.textContent="The stair below the library goes somewhere. This sheet means it didn't take you.";
    if(wA) wA.textContent="DESCEND AGAIN";
  } else {
    /* level 0's ending now leads DOWN, not out — this stays as a fallback */
    if(wT) wT.textContent="GOING DOWN";
    if(wS) wS.textContent="THE DOORS SAVED YOU. THE BRAKES DID NOT.";
    $("winStats").innerHTML=
      `<div class="statrow"><span>TIME IN LEVEL 0</span><span>${fmt(STATE.time)}</span></div>`+
      `<div class="statrow"><span>ALMOND WATER FOUND</span><span>${STATE.bottles}/3</span></div>`+
      `<div class="statrow"><span>TIMES CAUGHT</span><span>${STATE.deaths}</span></div>`+
      `<div class="statrow"><span>OBJECTIVES CLEARED</span><span>4/4</span></div>`;
    if(wN) wN.textContent="";
    if(wA) wA.textContent="DESCEND AGAIN";
  }
  ui.win.classList.remove("hide");
}
