/* ---------------- light flicker & fixture pool ---------------- */
/* Flicker is event-driven: panels sit steady for long stretches, then
   misbehave in a short burst with a randomly chosen pattern. The entity's
   proximity slashes calm time and lets even healthy panels act up. */
import { clamp, lerp, rand } from "./utils.js";
import { STATE, monster, spider } from "./state.js";
import { lights, lightPool, hemi, LIGHT_BIND_RADIUS, LIGHT_FADE_START } from "./scene.js";
import { AU, panTo, sfxFlickTick } from "./audio.js";
import { WALL_H } from "./map.js";

const hash=n=>{const s=Math.sin(n)*43758.5453;return s-Math.floor(s);};
const FLICKER_PATTERNS=5; // 0 strobe · 1 stutter · 2 brown-out sag · 3 blink-off · 4 dying sputter
function panelValue(L,t){
  if(L.mode==="steady") return 0.92+Math.sin(t*1.7+L.phase)*0.06;
  if(L.warm){
    /* end-of-life cycle in three acts: a ~2s hilly dim-down (the arc keeps
       half-catching, so brightness recovers a little in sub-second steps on
       the way down, never back to full), a normal-style strobe pinned at the
       dim floor, then a ~0.5s flickering climb back to full brightness */
    const e=L.burstDur-L.burstT;                      // elapsed burst time
    if(e<L.descT){                                    // act 1: the descent
      const d=e/L.descT;
      const sag=1-0.62*d;                                          // slide toward ~0.38
      const hill=Math.max(0,Math.sin(d*23+L.phase))*0.34*d*(1-d);  // brief partial recoveries
      const jit=(hash(Math.floor(t*7)+L.seed)-0.5)*0.05;           // fine instability
      return clamp(sag+hill+jit,0.3,1);
    }
    const riseAt=L.burstDur-L.riseT;
    if(e<riseAt)                                      // act 2: strobe at the floor
      return hash(Math.floor(t*L.rate)+L.seed)>0.45? 0.38:0.05;
    const q=clamp((e-riseAt)/L.riseT,0,1);            // act 3: flicker back up
    const env=lerp(0.38,1,q);
    return hash(Math.floor(t*22)+L.seed)<0.35? env*0.25:env;
  }
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
  /* spawn shockwave: a slow ring expands from the wake point and slams
     every panel it crosses red-orange for 2.1s. Recovery isn't managed —
     each panel's effect simply wears off 2.1s after impact, which reads as
     a natural second ring rolling out behind the first. */
  const sh=monster.shock;
  if(sh){
    if(!sh.init){ sh.init=true; for(const L of lights){ L.shocked=false; L.shockT=0; } }  // arm a fresh wave
    sh.t+=dt;
    const R=sh.t*19.23;                    // faster spread; the wide hold band keeps it a thick ring
    for(const L of lights)
      if(!L.shocked && Math.hypot(L.world.x-sh.x,L.world.z-sh.z)<=R){ L.shocked=true; L.shockT=3.5; }
    if(R>sh.maxR+25) monster.shock=null;   // ring has cleared the far corner
  }
  const escD = 1 + 0.10*monster.escalation;   // disruption AOE & hue deepen +10% per objective
  /* whichever thing haunts the current level is the disruption source —
     in THE END the librarian carries the same tell */
  const disPos = STATE.level===1? (spider.active? spider.pos:null)
                                : (monster.active? monster.pos:null);
  for(const L of lights){
    const dl=Math.hypot(L.world.x-px,L.world.z-pz);
    /* the AOE is centered on the ENTITY: panels near IT misbehave,
       wherever it is — distant flickering is how you spot it coming */
    let near=0;
    if(disPos){
      const dm=Math.hypot(L.world.x-disPos.x,L.world.z-disPos.z);
      near=clamp(1-dm/(22*escD),0,1);   // disruption AOE, widening per objective
    }
    L.near=near;                 // pool dimming reads this below
    L.timer-=dt;
    if(near>0.2) L.timer-=dt*near*7.7;     // its approach collapses calm periods already in progress
    if(L.mode==="steady"){
      if(L.timer<=0){
        const canBurst = L.flickery || L.warm || near>0.2;   // healthy panels only misbehave near the entity
        if(canBurst){
          L.mode="burst";
          L.pattern=Math.floor(Math.random()*FLICKER_PATTERNS);
          L.rate=rand(14,30);
          if(L.warm){
            // dying cycle: ~2s hilly descent, a strobe at the bottom, ~0.5s flickering climb back
            L.descT=rand(1.7,2.3); L.riseT=rand(0.4,0.6);
            L.burstDur=L.burstT=L.descT+rand(0.7,1.6)*(1+near*0.88)+L.riseT;
          } else {
            // everyone bursts longer near the entity
            L.burstDur=L.burstT=rand(0.25,1.4)*(1+near*0.88);
          }
        }
        // long natural calms; the entity's presence shreds them
        L.timer = (L.warm? rand(6,12) : L.flickery? rand(4,14) : rand(7,20)) * clamp(1-near*0.99, 0.05, 1);
      }
    } else {
      L.burstT-=dt;
      if(L.burstT<=0) L.mode="steady";
    }
    let v=panelValue(L,t);
    /* warmth 0→1 drags the tube color toward end-of-life orange. Dying
       fixtures sit at 1 permanently; healthy ones get pushed there by the
       entity's proximity — an extra tell on top of the flickering */
    let warmth = L.warm? 1 : clamp(near*1.7*escD,0,1);   // hue push, deepening per objective
    if(STATE.level===1){
      /* intro: −2 holds the whole grid dark while you wake in the cab,
         then the wave (≥0) wakes fixtures in distance order */
      if(STATE.libWakeT===-2) v=0;
      else if(STATE.libWakeT>=0){
        if(STATE.libWakeT<L.wakeAt) v=0;
        else if(STATE.libWakeT<L.wakeAt+0.35) v=hash(Math.floor(t*24)+L.seed)>0.4? v:0.05;
      }
      /* the answer to the first stolen disk: brightness drops to a quarter
         and every strip takes its assigned burn — orange at its very best,
         and a third to a half of the grid driven past orange into deep red
         (warmth >1 extrapolates the same gradient the shockwave uses) */
      if(STATE.libDim){ v*=0.25; warmth=Math.max(warmth,L.burnW||0.95); }
      /* the building's lights sometimes shut off temporarily, all of them */
      if(STATE.libBlackout>0) v*=1-0.97*STATE.libBlackout;
    }
    if(L.shockT>0){
      /* the wake shockwave passing through: a hard strobe on impact, then
         held dim and DEEP — dimness drags the hue past orange into red,
         so full-bright flashes stay at the normal max orange and the held
         glow sits redder beneath it. The last half second eases back to
         the panel's normal state: recovery is the effect wearing off. */
      L.shockT-=dt;
      /* deep blood-red the whole span (warmth >1 extrapolates the gradient
         past orange into red); bright like a dim healthy panel (~0.85) but
         violently unstable — fast hard strobe on impact, then a rapid
         stepped sputter with frequent hard dropouts */
      const wS = 1.85;
      const vS = L.shockT>3.1
        ? (hash(Math.floor(t*30)+L.seed)>0.5? 0.9:0.02)            // impact strobe
        : (hash(Math.floor(t*20)+L.seed*1.3)<0.30? 0.05            // dropout
           : 0.72+hash(Math.floor(t*15)+L.seed)*0.22);            // ~0.85 mean
      const k = L.shockT<0.5? L.shockT/0.5 : 1;                    // ease back at the end
      v=lerp(v,vS,k); warmth=lerp(warmth,wS,k);
    }
    if(Math.abs(v-L.on)>0.04 || Math.abs(warmth-L.warmth)>0.02){
      /* ballast tick fires WITH the visible transition, from the fixture's
         direction, fading with distance — classic fluorescent static */
      if(Math.abs(v-L.on)>0.35 && dl<27 && t-L.lastTick>0.09 && Math.random()<0.75){
        L.lastTick=t;
        const fall=Math.pow(clamp(1-dl/27,0,1),1.4);
        sfxFlickTick(0.075*fall, panTo(L.world.x,L.world.z));
      }
      L.on=v; L.warmth=warmth;
      /* backplate is spill: dimmer than the tubes it reflects, but on healthy
         fixtures a bright near-white wash (less saturated hue than the tubes)
         so the interior reads painted white steel, not grey.
         dimY drags the white point of a below-max panel faintly yellow. */
      const bp = L.warm? 0.30 : 0.72;
      const vb = v*L.bright;
      L.glowMat.color.setRGB(vb*bp,
        lerp(lerp(0.97,0.90,L.dimY),0.60,warmth)*vb*bp,
        lerp(lerp(0.88,0.62,L.dimY),0.26,warmth)*vb*bp);
      if(L.warm) L.tubeMat.color.setRGB(v,v,v);   // gradient map supplies the hue
      else L.tubeMat.color.setRGB(vb,
        lerp(lerp(0.965,0.89,L.dimY),0.60,warmth)*vb,
        lerp(lerp(0.81,0.56,L.dimY),0.26,warmth)*vb);
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
  /* THE END's strips hang low over the stacks and run a poorer current */
  const base = STATE.level===1? 1.39 : STATE.powerOn? 1.43 : 1.19;
  const band = LIGHT_BIND_RADIUS-LIGHT_FADE_START;
  /* each fixture holds two tubes 0.64m apart. Near the player that split is
     visible, so close fixtures get one pool light PER TUBE at just over half
     power; far ones collapse to a single centered light so the pool still
     stretches across the bind radius. */
  const TUBE_SPLIT_D=10;
  const jobs=[];
  for(const [d2,L] of cand){
    if(jobs.length>=lightPool.length) break;
    const dist=Math.sqrt(d2);
    let fade=clamp((LIGHT_BIND_RADIUS-dist)/band,0,1);
    fade=fade*fade*(3-2*fade); // smoothstep
    /* dying tubes cast half the light; the entity's aura physically dims
       fixtures around it so floor & walls darken with it in true 3D */
    const I=base*L.on*fade*(L.warm? 0.5:L.bright)*(1-(L.near||0)*0.35);
    const fy=L.fixY||WALL_H-0.5;
    if(!L.fixY && dist<TUBE_SPLIT_D && jobs.length+2<=lightPool.length){
      jobs.push({x:L.world.x, z:L.world.z-0.32, y:fy, I:I*0.55, L:L});
      jobs.push({x:L.world.x, z:L.world.z+0.32, y:fy, I:I*0.55, L:L});
    } else jobs.push({x:L.world.x, z:L.world.z, y:fy, I:I, L:L});
  }
  for(let i=0;i<lightPool.length;i++){
    const pl=lightPool[i];
    if(i<jobs.length){
      const j=jobs[i];
      pl.position.x=j.x; pl.position.z=j.z; pl.position.y=j.y;
      pl.intensity=j.I;
      /* warmth >1 (shockwave) extrapolates the gradient into red — clamp so
         the channels never go negative and subtract light */
      pl.color.setRGB(1,
        Math.max(0, lerp(lerp(0.933,0.875,j.L.dimY),0.55,j.L.warmth)),
        Math.max(0, lerp(lerp(0.753,0.55,j.L.dimY),0.20,j.L.warmth)));
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
        /* falloff radius trimmed 10% (16 → 14.4): the steeper roll-off makes
           walking past a fixture read more clearly as approach/retreat */
        const att=Math.pow(clamp(1-dist/14.4,0,1),1.6);
        hv.g.gain.setTargetAtTime(0.85*att*L.on, tN, 0.07);
        if(hv.p) hv.p.pan.setTargetAtTime(panTo(L.world.x,L.world.z), tN, 0.09);
      } else hv.g.gain.setTargetAtTime(0, tN, 0.15);
    }
  }
  /* murk floor: THE END's minimum ambient is HALF of level 0's, and it
     sinks further once the lights drop */
  const hemiTgt = (STATE.level===1? (STATE.libDim? 0.032:0.048)
                                  : (STATE.powerOn? 0.10:0.08)) * STATE.ambDim;
  hemi.intensity = lerp(hemi.intensity, hemiTgt, 0.1);
}
