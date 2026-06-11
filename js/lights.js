/* ---------------- light flicker & fixture pool ---------------- */
/* Flicker is event-driven: panels sit steady for long stretches, then
   misbehave in a short burst with a randomly chosen pattern. The entity's
   proximity slashes calm time and lets even healthy panels act up. */
import { clamp, lerp, rand } from "./utils.js";
import { STATE, monster } from "./state.js";
import { lights, lightPool, hemi, LIGHT_BIND_RADIUS, LIGHT_FADE_START } from "./scene.js";
import { AU, panTo, sfxFlickTick } from "./audio.js";

const hash=n=>{const s=Math.sin(n)*43758.5453;return s-Math.floor(s);};
const FLICKER_PATTERNS=5; // 0 strobe · 1 stutter · 2 brown-out sag · 3 blink-off · 4 dying sputter
function panelValue(L,t){
  if(L.mode==="steady") return 0.92+Math.sin(t*1.7+L.phase)*0.06;
  const p=clamp(1-L.burstT/L.burstDur,0,1);   // burst progress 0→1
  switch(L.pattern){
    case 0: return hash(Math.floor(t*L.rate)+L.seed)>0.45? 1:0.07;          // hard strobe
    case 1: return hash(Math.floor(t*24)+L.seed)<0.3? 0.12:1;               // irregular stutter
    case 2: return 1-0.65*Math.sin(p*Math.PI);                              // brown-out sag & recover
    case 3: return p<0.6? 0.06:1;                                           // dead, then snaps back
    default:return hash(Math.floor(t*30)+L.seed)<(0.15+p*0.6)? 0.08:1;      // sputters out, worse and worse
  }
}
export function updateLights(dt,t){
  const px=STATE.pos.x, pz=STATE.pos.z;
  for(const L of lights){
    const dl=Math.hypot(L.world.x-px,L.world.z-pz);
    /* the AOE is centered on the ENTITY: panels near IT misbehave,
       wherever it is — distant flickering is how you spot it coming */
    let near=0;
    if(monster.active){
      const dm=Math.hypot(L.world.x-monster.pos.x,L.world.z-monster.pos.z);
      near=clamp(1-dm/14,0,1);
    }
    L.timer-=dt;
    if(near>0.2) L.timer-=dt*near*7;       // its approach collapses calm periods already in progress
    if(L.mode==="steady"){
      if(L.timer<=0){
        const canBurst = L.flickery || near>0.2;   // healthy panels only misbehave near the entity
        if(canBurst){
          L.mode="burst";
          L.pattern=Math.floor(Math.random()*FLICKER_PATTERNS);
          L.rate=rand(14,30);
          L.burstDur=L.burstT=rand(0.25,1.4)*(1+near*0.8);
        }
        // long natural calms; the entity's presence shreds them
        L.timer = (L.flickery? rand(4,14) : rand(7,20)) * clamp(1-near*0.9, 0.06, 1);
      }
    } else {
      L.burstT-=dt;
      if(L.burstT<=0) L.mode="steady";
    }
    const v=panelValue(L,t);
    if(Math.abs(v-L.on)>0.04){
      /* ballast tick fires WITH the visible transition, from the fixture's
         direction, fading with distance — classic fluorescent static */
      if(Math.abs(v-L.on)>0.35 && dl<30 && t-L.lastTick>0.09 && Math.random()<0.75){
        L.lastTick=t;
        const fall=Math.pow(clamp(1-dl/30,0,1),1.4);
        sfxFlickTick(0.075*fall, panTo(L.world.x,L.world.z));
      }
      L.on=v;
      L.glowMat.color.setRGB(v, 0.965*v, 0.81*v);
    }
  }

  /* bind the point-light pool to the nearest panels. Each fixture's
     intensity fades smoothly across the outer band of the bind radius,
     so lights ease in/out with distance rather than popping on. */
  const cand=[];
  const R2=LIGHT_BIND_RADIUS*LIGHT_BIND_RADIUS;
  for(const L of lights){
    const d2=(L.world.x-px)**2+(L.world.z-pz)**2;
    if(d2<R2) cand.push([d2,L]);
  }
  cand.sort((a,b)=>a[0]-b[0]);
  const base = STATE.powerOn? 1.43 : 1.19;   // −5% peak fixture brightness
  const band = LIGHT_BIND_RADIUS-LIGHT_FADE_START;
  for(let i=0;i<lightPool.length;i++){
    const pl=lightPool[i];
    if(i<cand.length){
      const L=cand[i][1];
      const dist=Math.sqrt(cand[i][0]);
      let fade=clamp((LIGHT_BIND_RADIUS-dist)/band,0,1);
      fade=fade*fade*(3-2*fade); // smoothstep
      pl.position.x=L.world.x; pl.position.z=L.world.z;
      pl.intensity=base*L.on*fade;
    } else pl.intensity=0;
  }

  /* positional fluorescent buzz: bind hum voices to the nearest fixtures.
     Volume falls off with distance, pans to the fixture's direction, and
     follows L.on — a tube that flickers dark goes silent with it. */
  if(AU.humVoices&&AU.ctx){
    const tN=AU.ctx.currentTime;
    for(let i=0;i<AU.humVoices.length;i++){
      const hv=AU.humVoices[i];
      if(i<cand.length){
        const L=cand[i][1], dist=Math.sqrt(cand[i][0]);
        const att=Math.pow(clamp(1-dist/16,0,1),1.6);
        hv.g.gain.setTargetAtTime(0.85*att*L.on, tN, 0.07);
        if(hv.p) hv.p.pan.setTargetAtTime(panTo(L.world.x,L.world.z), tN, 0.09);
      } else hv.g.gain.setTargetAtTime(0, tN, 0.15);
    }
  }
  hemi.intensity = lerp(hemi.intensity, STATE.powerOn? 0.50:0.42, 0.1);
}
