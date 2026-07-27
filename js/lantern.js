/* ---------------- the hand-crank lantern ----------------
   THE NEST's core resource. [F] toggles the flame; holding [R] cranks the
   charge back up — loudly. This is a LANTERN, not a flashlight: an
   all-round pool of warm orange flame-light centred on your hands, with
   the slow uneven breathing of a real mantle, plus a soft wide forward
   wash (no tunnel beam). The glow physically repels the hatchlings
   (hatchling.js runs the radius test via inBeam); a flame held burning in
   open cave is a beacon the matriarch reads fluently (spider.js).

   Both of its lights are created at module init and live in the scene from
   the very first frame at intensity 0 — the light COUNT never changes, so
   switching the lantern on can never trigger a shader recompile (the v2.6
   lesson). */
import { clamp, lerp, hash } from "./utils.js";
import { STATE, KEYS } from "./state.js";
import { scene, camera } from "./scene.js";
import { losCells3 } from "./cave.js";
import { AU, sfxCrankNotch, sfxLanternClick } from "./audio.js";
import { ui } from "./ui.js";

export const LANT={
  spot:null, target:null, point:null,
  crankPhase:0, flick:1,
};
/* a soft, very wide forward wash — enough that the way you face reads a
   little further, never a cone edge on the rock */
LANT.spot=new THREE.SpotLight(0xffb26a, 0, 20, 1.08, 0.95, 1.6);
LANT.target=new THREE.Object3D();
LANT.spot.target=LANT.target;
LANT.spot.userData.persist=true; LANT.target.userData.persist=true;
scene.add(LANT.spot); scene.add(LANT.target);
/* the flame itself: the dominant light, an all-round warm pool */
LANT.point=new THREE.PointLight(0xffa257, 0, 14, 1.5);
LANT.point.userData.persist=true;
scene.add(LANT.point);

export function toggleLantern(){
  if(STATE.level!==2||!STATE.hasLantern) return;
  if(!STATE.lanternOn&&STATE.lanternCharge<=0.01){ sfxLanternClick(0.4); return; }  // dead cell
  STATE.lanternOn=!STATE.lanternOn;
  sfxLanternClick(1);
}
export function updateLantern(dt){
  if(STATE.level!==2||!STATE.hasLantern){
    LANT.spot.intensity=0; LANT.point.intensity=0;
    STATE.cranking=false;
    if(ui.lantWrap) ui.lantWrap.classList.remove("show");
    return;
  }
  /* cranking: grounded, holding [R]; the grind carries (AI reads STATE.cranking) */
  STATE.cranking = !!KEYS["KeyR"] && STATE.grounded && !STATE.dead;
  if(STATE.cranking){
    STATE.lanternCharge=Math.min(1, STATE.lanternCharge+dt/22);
    LANT.crankPhase+=dt;
    if(LANT.crankPhase>=0.34){
      LANT.crankPhase=0;
      sfxCrankNotch(1);
    }
  } else LANT.crankPhase=0.2;                    // first notch lands fast
  /* the burn */
  if(STATE.lanternOn){
    STATE.lanternCharge=Math.max(0, STATE.lanternCharge-dt/95);
    if(STATE.lanternCharge<=0){ STATE.lanternOn=false; sfxLanternClick(0.5); }
  }
  /* drive the lights from the camera (called after updatePlayer set it) */
  const on=STATE.lanternOn? 1:0;
  const low=STATE.lanternCharge<0.18;
  /* a real flame breathes: two slow incommensurate waves under everything,
     and a hard gutter only when the charge is nearly gone */
  const t=performance.now()*0.001;
  const breathe=0.90+0.055*Math.sin(t*1.9+Math.sin(t*0.73)*1.4)
                    +0.045*Math.sin(t*3.17+1.7)
                    +0.03*(hash(Math.floor(t*5)*0.47)-0.5);
  LANT.flick = low? (hash(Math.floor(performance.now()*0.02))<0.25? 0.25:0.9)*breathe : breathe;
  const I=on*(0.55+0.85*Math.pow(STATE.lanternCharge,0.45))*LANT.flick;
  LANT.point.intensity=I*1.35;
  LANT.spot.intensity=I*0.5;
  LANT.spot.position.copy(camera.position);
  LANT.spot.position.y-=0.18;
  const fx=-Math.sin(STATE.yaw)*Math.cos(STATE.pitch),
        fy=Math.sin(STATE.pitch),
        fz=-Math.cos(STATE.yaw)*Math.cos(STATE.pitch);
  LANT.target.position.set(camera.position.x+fx*8, camera.position.y-0.18+fy*8, camera.position.z+fz*8);
  LANT.point.position.set(STATE.pos.x+fx*0.25, STATE.y+1.15, STATE.pos.z+fz*0.25);
  /* HUD: the charge bar */
  if(ui.lantWrap){
    ui.lantWrap.classList.toggle("show", true);
    ui.lantWrap.classList.toggle("on", STATE.lanternOn);
    ui.lantWrap.classList.toggle("low", low);
    const pct=Math.round(STATE.lanternCharge*100)+"%";
    if(ui.lant.style.width!==pct) ui.lant.style.width=pct;
  }
}
/* is a world point inside the flame's glow right now? (the hatchlings'
   sun). AOE, not a cone: the lantern pushes them back all around you, as
   long as the rock doesn't shadow them. */
export function inBeam(x,y,z){
  if(!STATE.lanternOn) return false;
  const d=Math.hypot(x-camera.position.x,y-camera.position.y,z-camera.position.z);
  if(d>9||d<0.01) return false;
  return losCells3(camera.position.x,camera.position.z,x,z);
}
