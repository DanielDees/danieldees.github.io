/* ---------------- scripted cinematics: breaker fix & exit elevator ----------------
   Both sequences take the camera away from the player (main.js skips
   updatePlayer/updateFocus while CINE.active) and drive props, audio and
   the entity on a fixed timeline. The breaker scene keeps the entity AI
   running (it rushes the panel, freezing at a 30m ring); the elevator
   scene scripts the entity entirely. */
import { clamp, lerp, angLerp, hash, rand } from "./utils.js";
import { STATE, monster, spider } from "./state.js";
import { worldToCell, isWall, losCells } from "./map.js";
import { scene, camera, playerLight, amb, lights, markShared } from "./scene.js";
import { makeCanvas } from "./textures.js";
import { AU, panTo, sfxAlert, sfxStinger, sfxClunk, sfxPowerOn,
         sfxBoxOpen, sfxBoxClose, sfxFuseHum,
         sfxElevButton, sfxElevDing, sfxElevDoors, sfxElevThud, sfxElevJolt, sfxFloorBlip,
         startElevDescend, sfxElevRattle, sfxElevGrind, sfxLightsOut,
         sfxComputerBoot, sfxComputerStatic, sfxSpiderShriek, sfxSpiderTap,
         sfxSpiderScratch, sfxSpiderDig, sfxHoleRumble, sfxStoneStep } from "./audio.js";
import { ui, renderObjectives } from "./ui.js";
import { monsterRushTo } from "./monster.js";
import { exitDoor, ELEV } from "./props.js";
import { win, enterTheEnd, enterTheNest } from "./lifecycle.js";
import { LIB, losCells2, revealHole } from "./library.js";
import { CAVE } from "./cave.js";
import { spiderPose, spiderDigPose } from "./spider.js";
import { startUpdraftWind, sfxHatchTap } from "./audio.js";

export const CINE={active:false, kind:null, t:0};
let D=null;                                   // per-cutscene working data

const ease=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
const seg=(t,a,b)=>ease((t-a)/(b-a));
const lookAngles=(ex,ey,ez,tx,ty,tz)=>{
  const dx=tx-ex, dy=ty-ey, dz=tz-ez;
  return {yaw:Math.atan2(-dx,-dz), pitch:Math.atan2(dy,Math.hypot(dx,dz))};
};
function cue(key,at,fn){ if(CINE.t>=at && !D.fired.has(key)){ D.fired.add(key); fn(); } }
function setCam(x,y,z,yaw,pitch){
  camera.position.set(x,y,z);
  camera.rotation.order="YXZ";
  camera.rotation.y=yaw; camera.rotation.x=pitch; camera.rotation.z=0;
}

export function updateCinematic(dt){
  if(!CINE.active) return;
  if(STATE.dead||STATE.won){                  // safety: nothing to script anymore
    if(CINE.kind==="breaker"&&D) playerLight.intensity=D.savedPL;
    if(CINE.kind==="elev"){ STATE.ambDim=1; playerLight.intensity=0.12; }
    CINE.active=false; CINE.kind=null; D=null;
    monster.holdAt30=false; monster.held=false;
    return;
  }
  CINE.t+=dt;
  if(CINE.kind==="breaker") updateBreaker();
  else if(CINE.kind==="elev") updateElevator(dt);
  else if(CINE.kind==="libIntro") updateLibIntro(dt);
  else if(CINE.kind==="terminal") updateTerminal(dt);
  else if(CINE.kind==="descend") updateDescend(dt);
  else if(CINE.kind==="nestIntro") updateNestIntro(dt);
  else if(CINE.kind==="ascend") updateAscend(dt);
}

/* ================= breaker: the fuse seats itself ================= */
/* ~4.6s: door swings open, the fuse fades in hovering and glides into the
   slot, the lever flips with the power surge, the door claps shut. The
   player can't move — deliberately long enough for a distant entity to
   close in; one inside 30m freezes there until control returns. */
export function startBreakerCine(item){
  CINE.active=true; CINE.kind="breaker"; CINE.t=0;
  ui.prompt.classList.remove("show");
  const mesh=item.mesh, bp=mesh.position;
  const ex=STATE.pos.x, ey=STATE.y+STATE.curEyeH, ez=STATE.pos.z;
  D={fired:new Set(), u:mesh.userData,
     eye:{x:ex,y:ey,z:ez},
     yaw0:STATE.yaw, pitch0:STATE.pitch,
     tgt:lookAngles(ex,ey,ez,bp.x,bp.y,bp.z),
     fuseFrom:new THREE.Vector3(0,-0.25,0.55),
     fuseTo:new THREE.Vector3(0,-0.055,0.08),
     savedPL:playerLight.intensity};
  /* enough fill light to actually read the animation in the murk */
  playerLight.intensity=0.8;
  /* the entity drops everything and sprints for this spot */
  monsterRushTo(bp.x,bp.z);
  monster.holdAt30=true;
}
function updateBreaker(){
  const t=CINE.t, u=D.u;
  const k=seg(t,0,0.6);                       // the panel pulls your eyes to it
  STATE.yaw=angLerp(D.yaw0,D.tgt.yaw,k);
  STATE.pitch=lerp(D.pitch0,D.tgt.pitch,k);
  setCam(D.eye.x,D.eye.y,D.eye.z,STATE.yaw,STATE.pitch);
  /* door open ramps 0→1, the close envelope multiplies it back down */
  cue("open",0.15,()=>sfxBoxOpen());
  u.doorPivot.rotation.y = -2.05*seg(t,0.15,0.95)*(1-seg(t,3.55,4.25));
  const fuse=u.fuse;
  cue("conjure",1.0,()=>{ fuse.visible=true; sfxFuseHum(2.1); });
  if(t>=1.0){
    const fk=seg(t,1.05,3.0);
    fuse.position.lerpVectors(D.fuseFrom,D.fuseTo,fk);
    fuse.position.x+=Math.sin(t*5)*0.012*(1-fk);          // unsteady hover
    fuse.position.y+=Math.sin(t*3.3)*0.01*(1-fk);
    fuse.rotation.y=(1-fk)*0.5*Math.sin(t*2.1);
    const op=seg(t,1.0,1.35);
    fuse.traverse(o=>{ if(o.isMesh) o.material.opacity=op; });
  }
  cue("seat",3.05,()=>{
    sfxClunk(); sfxPowerOn();
    STATE.powerOn=true;
    u.lamp.material.color.set(0x39d24a);
    if(exitDoor) exitDoor.userData.sign.material.color.set(0xffffff);
    renderObjectives();                                 // the objective box says it
  });
  if(t>=3.05) u.lever.position.y=lerp(-0.1,0.1,seg(t,3.05,3.3));
  cue("close",4.1,()=>sfxBoxClose());
  if(t>=4.6){
    playerLight.intensity=D.savedPL;
    CINE.active=false; CINE.kind=null; D=null;
    /* control returns; a held entity announces itself and comes loose */
    monster.holdAt30=false;
    if(monster.held){
      monster.held=false;
      sfxAlert(panTo(monster.pos.x,monster.pos.z));
    }
  }
}

/* ================= elevator: the way down ================= */
/* call button → ding → doors open → walk in → turn → IT is sprinting at
   you → doors seal just in time → a real ride: departure jolt, floors
   ticking by on the indicator, a first warning rattle, a violent one with
   the light strobing red, the lurch and blackout, the brakes grinding
   themselves to death → fade to black → next level (the win sheet, for now). */
const T_PRESS=0.75, T_DING=2.65, T_DOORS_O=3.65, T_WALK0=5.25, T_WALK1=7.05,
      T_TURN1=8.05, T_DOORS_C=8.65, T_THUD=10.2,
      T_START=11.85,                               // ding, jolt, motor spins up
      T_F1=13.75, T_F2=15.15, T_F3=16.55,          // floors going by
      T_WARN=T_F3+0.5,                             // the −3 button sours to yellow
      T_POP=T_F3+1.0,                              // the pop; the brakes start to sing
      T_HAY=T_POP+0.5,                             // 0.5s later: indicator, panel & brakes go to hell
      T_LURCH=20.25,                               // drop + blackout
      T_FADE0=23.95, T_FADE1=26.45, T_END=27.15;
export function startElevatorCine(item){
  CINE.active=true; CINE.kind="elev"; CINE.t=0;
  ui.prompt.classList.remove("show");
  const g=item.mesh, u=g.userData;
  g.updateMatrixWorld(true);
  const l2w=(x,y,z)=>g.localToWorld(new THREE.Vector3(x,y,z));
  const org=l2w(0,0,0), outP=l2w(0,0,1);
  const out={x:outP.x-org.x, z:outP.z-org.z};               // unit outward
  const eye0={x:STATE.pos.x, y:STATE.y+STATE.curEyeH, z:STATE.pos.z};
  const btn=l2w(u.btnLocal.x,u.btnLocal.y,u.btnLocal.z);
  const doorCtr=l2w(0,1.4,0.0);                   // centre of the doorway, from outside
  const cabEye=l2w(0,1.55,-1.7);
  const backLook=l2w(0,1.3,-2.5);
  D={fired:new Set(), u, g, org, out, eye0,
     yaw0:STATE.yaw, pitch0:STATE.pitch,
     aBtn:lookAngles(eye0.x,eye0.y,eye0.z,btn.x,btn.y,btn.z),
     aDoors:lookAngles(eye0.x,eye0.y,eye0.z,doorCtr.x,doorCtr.y,doorCtr.z),
     aIn:lookAngles(eye0.x,eye0.y,eye0.z,backLook.x,backLook.y,backLook.z),
     aOut:{yaw:Math.atan2(-out.x,-out.z), pitch:-0.06},   // camera fwd = (-sin,-cos) → this faces +out
     aDisp:(()=>{ const dl=u.dispLocal, dw=l2w(dl.x,dl.y,dl.z);
       const a=lookAngles(cabEye.x,cabEye.y,cabEye.z,dw.x,dw.y,dw.z);
       const aOutY=Math.atan2(-out.x,-out.z), restP=-0.06;
       /* ease the glance: pull the yaw partway back toward the doors so more
          of them stay in frame, and tilt further down so the bottom of the
          button column is visible under the indicator */
       let yaw=angLerp(a.yaw,aOutY,0.42), pitch=a.pitch-0.16;
       /* then trim the pan relative to the door-rest direction: up by a
          further 25%, left by a further 10% */
       pitch=lerp(restP,pitch,0.75);
       yaw=angLerp(aOutY,yaw,0.90);
       return {yaw,pitch}; })(),
     cabEye, descend:null, monRun:null, sparks:makeSparks(g)};
  /* the emergency lamp gets a REAL point source parked at the fixture —
     the same dim, distance-falloff red as the crashed cab in THE END —
     instead of recoloring the bright ceiling panel into a screen wash */
  const eml=new THREE.PointLight(0xff2515,0,5,2);
  eml.position.copy(u.emerg.position); eml.position.z+=0.25; eml.position.y-=0.08;
  g.add(eml); D.emergLight=eml;
  /* the entity is wherever its AI left it — vanish it until the script
     conjures it sprinting down the corridor */
  monster.mesh.visible=false;
  if(AU.ctx){
    const tA=AU.ctx.currentTime;
    AU.breathGain.gain.setTargetAtTime(0,tA,0.3);
    AU.proxGain.gain.setTargetAtTime(0,tA,0.3);
  }
  ui.dread.style.opacity=0; ui.staticfx.style.opacity=0;
}
/* ---- brake sparks: friction spray forced through the door seam, ramping
   with the cab's fall. Simulated in the elevator group's local frame so
   the doorway orientation comes for free. ---- */
function makeSparks(g){
  const pool=[];
  const geo=new THREE.BoxGeometry(0.008,0.008,1);   // unit streak, z-scaled per spark
  for(let i=0;i<36;i++){
    const m=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({color:0xffb86b,
      transparent:true, opacity:0, blending:THREE.AdditiveBlending, depthWrite:false}));
    m.visible=false; g.add(m);
    pool.push({m,vx:0,vy:0,vz:0,life:0,max:1});
  }
  const light=new THREE.PointLight(0xff9540,0,3.5,2);
  light.position.set(0,1.3,-0.35); g.add(light);
  return {pool,light,acc:0};
}
function updateSparks(dt,t){
  const S=D.sparks; if(!S) return;
  /* a few sparks once the brakes start to sing; a torrent as the cab
     picks up speed after the lurch */
  const rate = t<T_FADE1? 0.3*seg(t,T_HAY,T_LURCH)+0.7*seg(t,T_LURCH,T_LURCH+2.4) : 0;
  if(rate>0){
    S.acc+=dt*(6+46*rate);
    while(S.acc>=1){
      S.acc-=1;
      const p=S.pool.find(p=>p.life<=0);
      if(!p) break;
      /* short hops only: the camera stands 1.7m in — sparks must die well
         before they reach it or they blow up into slabs at the near plane */
      const sp=0.7+Math.random()*1.3, a=(Math.random()-0.5)*1.2;
      p.vx=Math.sin(a)*sp*0.5+(Math.random()-0.5)*0.5;
      p.vy=Math.random()*1.2-0.5;
      p.vz=-Math.cos(a)*sp;                          // sprays INTO the cab
      p.life=p.max=0.16+Math.random()*0.3;
      p.m.position.set((Math.random()-0.5)*0.05, 0.25+Math.random()*2.1, -0.1);
      p.m.visible=true;
    }
  }
  for(const p of S.pool){
    if(p.life<=0) continue;
    p.life-=dt;
    if(p.life<=0){ p.m.visible=false; p.m.material.opacity=0; continue; }
    p.vy-=7.5*dt;                                    // sparks arc and die
    p.m.position.x+=p.vx*dt; p.m.position.y+=p.vy*dt; p.m.position.z+=p.vz*dt;
    const v=Math.hypot(p.vx,p.vy,p.vz);
    p.m.scale.set(1,1,Math.max(0.025,v*0.04));       // streak length rides velocity
    p.m.rotation.y=Math.atan2(p.vx,p.vz);
    p.m.rotation.x=-Math.asin(clamp(p.vy/v,-1,1));
    p.m.material.opacity=Math.min(1,p.life/p.max*2);
  }
  /* the spark streaks stay bright, but the orange wash they throw across
     the whole cab is dimmed 70% — it was flooding the interior */
  S.light.intensity = rate>0? rate*(0.5+Math.random()*1.6)*0.3 : 0;
}
function spawnRunner(){
  /* farthest open straight-line point down the facing corridor, max 26m */
  const P0={x:D.org.x+D.out.x*0.6, z:D.org.z+D.out.z*0.6};
  let far=4;
  for(let s=4;s<=26;s+=0.5){
    const x=P0.x+D.out.x*s, z=P0.z+D.out.z*s;
    const c=worldToCell(x,z);
    if(isWall(c.cx,c.cy)) break;
    if(losCells(P0.x,P0.z,x,z)) far=s;
  }
  monster.pos.set(P0.x+D.out.x*far,0,P0.z+D.out.z*far);
  monster.faceAng=Math.atan2(-D.out.x,-D.out.z);
  monster.mesh.visible=true;
  /* arrive a beat AFTER the doors seal, whatever the corridor length */
  D.monRun={speed:Math.max(3,(far-0.6))/(T_THUD-CINE.t)};
}
function runMonster(dt){
  const m=monster, u=m.mesh.userData;
  const stopX=D.org.x+D.out.x*1.0, stopZ=D.org.z+D.out.z*1.0;
  const rx=stopX-m.pos.x, rz=stopZ-m.pos.z, rem=Math.hypot(rx,rz);
  if(rem>0.05){
    const step=Math.min(D.monRun.speed*dt,rem);
    m.pos.x+=rx/rem*step; m.pos.z+=rz/rem*step;
  }
  /* sprint cycle (mirrors updateMonster's walk animation) */
  m.anim+=dt*(1.5+D.monRun.speed*1.6);
  const sw=Math.sin(m.anim)*0.7;
  u.armL.rotation.x=sw;       u.armR.rotation.x=-sw;
  u.legL.rotation.x=-sw*0.85; u.legR.rotation.x=sw*0.85;
  u.head.rotation.y=(hash(Math.floor(CINE.t*16))-0.5)*0.7;   // frantic jolts
  m.mesh.position.set(m.pos.x,Math.abs(Math.sin(m.anim))*0.07,m.pos.z);
  m.mesh.rotation.y=m.faceAng;
  /* fear channels track its approach until the doors seal */
  const d=Math.hypot(m.pos.x-D.cabEye.x,m.pos.z-D.cabEye.z);
  const prox=clamp(1-d/22,0,1);
  ui.dread.style.opacity=0.35+prox*0.6;
  ui.staticfx.style.opacity=Math.pow(prox,1.6)*0.4;
  if(AU.ctx){
    const tA=AU.ctx.currentTime;
    AU.breathGain.gain.setTargetAtTime(clamp(1-d/28,0,1)*0.54,tA,0.2);
    AU.proxGain.gain.setTargetAtTime(prox*0.36,tA,0.2);
  }
}
function updateElevator(dt){
  const t=CINE.t, u=D.u;
  /* ---- doors: open ramp minus close ramp. Closed centre and travel both
     come off ELEV — they are the leaf's own geometry, and a copy of them
     here silently detached the doors from the cab the first time it grew. */
  const slide=seg(t,T_DOORS_O,T_DOORS_O+1.4)-seg(t,T_DOORS_C,T_DOORS_C+1.3);
  u.doorL.position.x=-(ELEV.LEAF_X+ELEV.TRAVEL*slide);
  u.doorR.position.x= (ELEV.LEAF_X+ELEV.TRAVEL*slide);
  /* ---- cab light: the main panel stays WHITE — its level sags and
     stutters as the power fails, and it dies outright at the lurch. The
     red lives where it belongs: the emergency lamp at the back of the cab,
     a dim point source with the same falloff as the crashed cab in THE
     END, sputtering awake through the haywire phase and settling into a
     slow breathe once it is the only light left. ---- */
  let inten=0.72*seg(t,3.5,4.3);
  const col=[1,0.93,0.78];
  let em=0;                                   // emergency lamp drive 0..1
  if(t>=T_HAY && t<T_LURCH){
    const st=Math.floor(t*6);                 // ≈6/s sputter: dread, not a strobe
    inten=0.78*(0.55+hash(st*1.7+9)*0.45);    // brown-out level swings, still white
    if(hash(st)< 0.35+0.3*seg(t,T_HAY,T_LURCH)) em=1;
  }
  if(t>=T_LURCH){ inten=0; em=1; }            // panel dead; emergency lamp only
  u.cabLight.intensity=inten;
  u.cabLight.color.setRGB(col[0],col[1],col[2]);
  const pb=clamp(inten/0.72,0,1)*0.85+0.08;
  u.cabLightMat.color.setRGB(col[0]*pb,col[1]*pb,col[2]*pb);
  if(D.emergLight){
    D.emergLight.intensity=em*(t>=T_LURCH? 0.42+0.05*Math.sin(t*2.6) : 0.5);
    u.emergMat.color.setHex(em? 0xff2515 : 0x1c0404);
  }
  /* the ambient floor drains away through the failure — by the lurch the
     cab is ~50% darker and what light remains is the lamp and the sparks.
     hemi follows via STATE.ambDim (lights.js owns that lerp). */
  const dimA=1-0.5*seg(t,T_POP,T_LURCH);
  STATE.ambDim=dimA;
  amb.intensity=0.05*dimA; playerLight.intensity=0.12*dimA;
  /* ---- floor indicator & button panel going haywire: self-lit, so they
     keep glitching through the dark fall, all the way to full black ---- */
  if(t>=T_HAY && t<T_FADE1){
    /* the climb starts slow and accelerates with each step, then the full
       random run settles into a faster steady chatter */
    if(D.nextFloor===undefined) D.nextFloor=T_HAY;
    if(t>=D.nextFloor){
      const n=D.hayN||0;                        // climbing, then unhinged
      const seq=["-4","-5","-7","-10"];         // -4 shows once, then never again
      const txt = n<seq.length? seq[n]
        : "-"+(12+Math.floor(hash(n*97.13+3.1)*121));   // random -12 … -132
      D.hayN=n+1;
      u.drawFloor(txt, hash(n*1.7)<0.5? "#ff4030":"#ffb347");
      sfxFloorBlip(300+hash(n*2.9)*350);       // wrong dings, kept lower so they aren't goofy
      /* ramp the cadence: ~0.55s between the first changes down to ~0.26s by
         −10, then a slightly quicker steady 0.17s through the random run */
      D.nextFloor += n<4? lerp(0.55,0.26,n/3) : 0.17;
    }
    if(t>=T_HAY+0.2){
      const bst=Math.floor(t*9);
      if(D.bStep!==bst){
        D.bStep=bst;
        u.panelBtns.forEach((bm,i)=>{
          const r=hash(bst*5.1+i*13);
          bm.color.set(r<0.34? 0xff3020 : r<0.68? 0xffc832 : 0x2a2014);
        });
      }
    }
  }
  /* one lit floor button at a time, walking down the column */
  const litBtn=(idx,color)=>u.panelBtns.forEach((bm,i)=>bm.color.set(i===idx?color:0x2a2014));
  /* ---- cues ---- */
  cue("press",T_PRESS,()=>{ sfxElevButton(); u.btnMat.color.set(0x39d24a); });
  /* the ding IS the hall lantern: a car has answered, and the down arrow
     over the head is how a lobby says so before the doors move */
  cue("ding",T_DING,()=>{ sfxElevDing(); if(u.hallLamps) u.hallLamps[1].color.set(0xffb347); });
  cue("doorsO",T_DOORS_O,()=>sfxElevDoors(1.4));
  cue("cabOn",3.9,()=>{ u.drawFloor("0"); litBtn(0,0x39e052); });
  cue("spawn",T_WALK1,()=>spawnRunner());
  cue("cry",T_WALK1+0.55,()=>{ sfxAlert(0); sfxStinger(); });
  cue("doorsC",T_DOORS_C,()=>sfxElevDoors(1.3));
  cue("thud",T_THUD,()=>sfxElevThud());
  cue("gone",T_THUD+0.8,()=>{                  // sealed out — and no longer needed
    monster.mesh.visible=false;
    if(AU.ctx){
      const tA=AU.ctx.currentTime;
      AU.breathGain.gain.setTargetAtTime(0,tA,0.5);
      AU.proxGain.gain.setTargetAtTime(0,tA,0.5);
    }
  });
  cue("start",T_START,()=>{ sfxElevDing(); sfxElevJolt(); D.descend=startElevDescend(); });
  cue("f1",T_F1,()=>{ u.drawFloor("-1"); litBtn(1,0x39e052); sfxFloorBlip(); });
  cue("f2",T_F2,()=>{ u.drawFloor("-2"); litBtn(2,0x39e052); sfxFloorBlip(); });
  cue("f3",T_F3,()=>{ u.drawFloor("-3"); litBtn(3,0x39e052); sfxFloorBlip(); });
  /* the held beat at −3: half a second in, the bottom button sours to
     yellow; half a second later the pop — and the brakes start to sing,
     BEFORE the indicator goes haywire */
  cue("warn",T_WARN,()=>litBtn(3,0xffc832));
  cue("pop",T_POP,()=>sfxLightsOut());          // the break — then a half-second beat
  cue("hay",T_HAY,()=>{
    /* the brakes start to sing as everything goes to hell. Swells in over
       the haywire phase, full force by the lurch, holds until the screen is
       black, then dies out under the dark */
    sfxElevGrind(T_FADE1-T_HAY, T_LURCH-T_HAY);
  });
  cue("rattle",T_HAY+0.3,()=>sfxElevRattle(1.9));
  cue("lurch",T_LURCH,()=>{
    sfxElevThud();
    u.emergMat.color.set(0xff2515);
    if(D.descend) D.descend.stop(0.8);         // the motor cuts; only momentum now
    /* indicator & buttons keep glitching in the dark — see the haywire block */
  });
  /* ---- brake sparks through the door seam ---- */
  updateSparks(dt,t);
  /* ---- the sprinter ---- */
  if(D.monRun && t<T_THUD+0.2) runMonster(dt);
  if(t>=T_THUD+0.5){                           // fear drains once it's locked out
    const k=seg(t,T_THUD+0.5,T_START+0.8);
    ui.dread.style.opacity=0.8*(1-k); ui.staticfx.style.opacity=0.45*(1-k);
  }
  /* ---- camera ---- */
  let cx,cy,cz,yaw,pitch;
  if(t<T_WALK0){
    cx=D.eye0.x; cy=D.eye0.y; cz=D.eye0.z;
    const kb=seg(t,0,0.6);                       // glance down at the call button
    yaw=angLerp(D.yaw0,D.aBtn.yaw,kb); pitch=lerp(D.pitch0,D.aBtn.pitch,kb);
    /* then, ~0.75s after the press, turn back to face the doors and wait */
    const kr=seg(t,T_PRESS+0.75,T_PRESS+1.6);
    yaw=angLerp(yaw,D.aDoors.yaw,kr); pitch=lerp(pitch,D.aDoors.pitch,kr);
  } else {
    const k=seg(t,T_WALK0,T_WALK1);
    cx=lerp(D.eye0.x,D.cabEye.x,k);
    cy=lerp(D.eye0.y,D.cabEye.y,k)+Math.sin(k*Math.PI*3)*0.03*(1-k);
    cz=lerp(D.eye0.z,D.cabEye.z,k);
    if(t<T_WALK1){
      const ki=seg(t,T_WALK0,T_WALK0+0.8);       // walk-in starts from the doors-facing gaze
      yaw=angLerp(D.aDoors.yaw,D.aIn.yaw,ki); pitch=lerp(D.aDoors.pitch,D.aIn.pitch,ki);
    } else {
      const kt=seg(t,T_WALK1,T_TURN1);
      yaw=angLerp(D.aIn.yaw,D.aOut.yaw,kt); pitch=lerp(D.aIn.pitch,D.aOut.pitch,kt);
    }
  }
  /* the ride: a departure dip, idle sway, the gaze drifting up-left to the
     floor indicator over the buttons — then the lurch slams it back to the
     doors */
  if(t>=T_START){
    cy+=Math.sin(t*2.1)*0.006;
    cy-=0.035*seg(t,T_START,T_START+0.4)*(1-seg(t,T_START+0.4,T_START+1.2));
    yaw+=Math.sin(t*0.7)*0.01*seg(t,T_START,T_START+2);
  }
  const kd=seg(t,T_START+1.1,T_START+2.5)-seg(t,T_LURCH,T_LURCH+0.5);
  if(kd>0){ yaw=angLerp(yaw,D.aDisp.yaw,kd); pitch=lerp(pitch,D.aDisp.pitch,kd); }
  cy-=0.06*seg(t,T_LURCH,T_LURCH+0.25)*(1-seg(t,T_LURCH+0.25,T_LURCH+0.9));
  let amp=0;
  if(t>=T_THUD&&t<T_THUD+0.4) amp=0.025*(1-(t-T_THUD)/0.4);
  if(t>=T_HAY&&t<T_LURCH) amp=Math.max(amp,0.011);          // the brakes start to bite
  if(t>=T_LURCH&&t<T_LURCH+0.5) amp=Math.max(amp,0.03);
  if(t>=T_LURCH) amp=Math.max(amp,0.014+0.028*seg(t,T_LURCH+0.5,T_LURCH+2.5));
  cx+=(Math.random()-0.5)*2*amp; cy+=(Math.random()-0.5)*2*amp; cz+=(Math.random()-0.5)*2*amp;
  STATE.yaw=yaw; STATE.pitch=pitch;
  setCam(cx,cy,cz,yaw,pitch);
  /* ---- fade to black under the grinding ---- */
  if(t>=T_FADE0){
    ui.flash.style.transition="none";
    ui.flash.style.background="#000";
    ui.flash.style.opacity=String(seg(t,T_FADE0,T_FADE1));
  }
  if(t>=T_END){
    CINE.active=false; CINE.kind=null; D=null;
    ui.dread.style.opacity=0; ui.staticfx.style.opacity=0;
    /* hand the lighting rig back: THE END sets its own hemi/amb profile,
       but the dim multiplier and player fill are ours to restore */
    STATE.ambDim=1;
    playerLight.intensity=0.12;
    /* the brakes never caught. The screen is already black: the crash IS
       the transition — you wake up somewhere much quieter. */
    enterTheEnd();
  }
}

/* ================= THE END: stepping out of the wreck ================= */
/* The screen is black when this starts (the crash fade). You come to on
   the floor of the cab under the emergency lamp, the doors grind open in
   two tries, you walk out into total dark — and the library's faulty grid
   wakes in a slow wave rolling away from you. Title, objectives, control. */
const LI_LIFT=0.9, LI_DOOR1=3.3, LI_STUCK=4.35, LI_DOOR2=5.3, LI_OPEN=6.5,
      LI_WALK0=6.9, LI_WALK1=9.7, LI_WAKE=7.3, LI_LOOKUP=9.9,
      LI_TITLE=10.6, LI_TITLE_OFF=14.8, LI_OBJ=14.9, LI_END=16.4;
export function startTheEndIntro(){
  CINE.active=true; CINE.kind="libIntro"; CINE.t=0;
  ui.prompt.classList.remove("show");
  const g=LIB.elev, u=g.userData;
  g.updateMatrixWorld(true);
  const l2w=(x,y,z)=>g.localToWorld(new THREE.Vector3(x,y,z));
  const org=l2w(0,0,0), outP=l2w(0,0,1);
  const out={x:outP.x-org.x, z:outP.z-org.z};
  const cabEye=l2w(0,1.42,-1.6);
  const aOut={yaw:Math.atan2(-out.x,-out.z), pitch:-0.04};
  D={fired:new Set(), u, g, out, cabEye, aOut,
     spawn:LIB.spawn.clone()};
  /* the wreck: doors shut, lit only by the emergency lamp — a REAL point
     source parked at the lamp itself, with distance falloff like every
     other light in the game, not a screen wash */
  u.doorL.position.x=-ELEV.LEAF_X; u.doorR.position.x=ELEV.LEAF_X;
  u.emergMat.color.set(0xff2515);
  u.cabLight.position.set(0,ELEV.OPEN_H-0.30,-2.35);
  u.cabLight.distance=5; u.cabLight.decay=2;
  u.cabLight.intensity=0.42; u.cabLight.color.setRGB(1,0.15,0.09);
  u.cabLightMat.color.setRGB(0.02,0.004,0.003);   // the main panel is dead
  u.drawFloor("--","#ff4030");
  /* hold the screen black; the first cue lifts it onto the red-lit cab */
  ui.flash.style.transition="none"; ui.flash.style.background="#000";
  ui.flash.style.opacity=1;
}
function updateLibIntro(dt){
  const t=CINE.t, u=D.u;
  cue("lift",LI_LIFT,()=>{
    ui.flash.style.transition="opacity 2.4s"; ui.flash.style.opacity=0;
  });
  cue("settle",1.6,()=>sfxElevRattle(1.1));
  /* doors: first try jams at a third; the second shove forces them */
  cue("doors1",LI_DOOR1,()=>sfxElevDoors(1.0));
  cue("stuck",LI_STUCK,()=>sfxClunk());
  cue("doors2",LI_DOOR2,()=>{ sfxElevDoors(1.2); sfxElevRattle(0.8); });
  const slide = 0.34*seg(t,LI_DOOR1,LI_STUCK) + 0.66*seg(t,LI_DOOR2,LI_OPEN);
  u.doorL.position.x=-(ELEV.LEAF_X+ELEV.TRAVEL*slide);
  u.doorR.position.x= (ELEV.LEAF_X+ELEV.TRAVEL*slide);
  /* the emergency lamp breathes, slow and red, from its corner of the cab;
     the dead main panel gives exactly TWO brief dying-white blinks as the
     doors fight their track — discrete events, never a strobe */
  const blink=(t>=LI_DOOR1+0.25&&t<LI_DOOR1+0.37)||(t>=LI_DOOR2+0.45&&t<LI_DOOR2+0.55);
  if(blink){
    u.cabLight.intensity=0.5;
    u.cabLight.color.setRGB(1,0.85,0.62);
    u.cabLightMat.color.setRGB(0.32,0.28,0.2);
  } else {
    u.cabLight.intensity=(t>=LI_OPEN?0.3:0.42)+0.05*Math.sin(t*2.6);
    u.cabLight.color.setRGB(1,0.14,0.08);
    u.cabLightMat.color.setRGB(0.02,0.004,0.003);
  }
  /* the library wakes in a wave rolling out from the doorway */
  cue("wake",LI_WAKE,()=>{ STATE.libWakeT=0; });
  cue("scratch",LI_END-0.6,()=>{
    /* somewhere out in the dark, the first slow scrape down a shelf */
    sfxSpiderScratch(0.5,panTo(spider.pos.x,spider.pos.z));
  });
  cue("title",LI_TITLE,()=>{
    const el=document.getElementById("levelTitle");
    if(el){ el.querySelector("#ltMain").textContent="THE END";
      el.querySelector("#ltSub").textContent="the infinite library";
      el.classList.add("show"); }
  });
  cue("titleOff",LI_TITLE_OFF,()=>{
    const el=document.getElementById("levelTitle");
    if(el) el.classList.remove("show");
  });
  cue("obj",LI_OBJ,()=>{
    renderObjectives();                                 // the objective box says it
  });
  /* ---- camera ---- */
  let cx,cy,cz,yaw=D.aOut.yaw,pitch=D.aOut.pitch;
  if(t<LI_WALK0){
    /* getting up off the cab floor */
    const up=seg(t,LI_LIFT,2.6);
    cx=D.cabEye.x; cz=D.cabEye.z;
    cy=lerp(0.7,1.55,up);
    pitch=lerp(0.35,-0.04,up);
    yaw=D.aOut.yaw+Math.sin(t*0.9)*0.05*(1-up);
    /* a head-sway as the cab settles */
    if(t<2.4) cy+=Math.sin(t*7)*0.01*(1-t/2.4);
  } else {
    const k=seg(t,LI_WALK0,LI_WALK1);
    cx=lerp(D.cabEye.x,D.spawn.x,k);
    cz=lerp(D.cabEye.z,D.spawn.z,k);
    cy=1.55+Math.sin(k*Math.PI*3.2)*0.035*(1-k*0.5);
    /* one unsteady stumble on the threshold */
    cy-=0.05*seg(t,LI_WALK0+0.9,LI_WALK0+1.15)*(1-seg(t,LI_WALK0+1.15,LI_WALK0+1.7));
    /* one brief glance up at the hanging lights, then back to level */
    const upk=seg(t,LI_LOOKUP,LI_LOOKUP+1.0)*(1-seg(t,LI_LOOKUP+1.6,LI_LOOKUP+2.6));
    pitch=lerp(-0.04,0.18,upk);
    /* the real reveal is lateral: a slow left-then-right scan across the
       stacks — someone getting their bearings, not studying the ceiling */
    const lp=seg(t,LI_LOOKUP+0.2,LI_END-0.2);
    yaw=D.aOut.yaw+0.55*Math.sin(lp*Math.PI*2)*Math.sin(lp*Math.PI);
  }
  STATE.yaw=yaw; STATE.pitch=pitch;
  setCam(cx,cy,cz,yaw,pitch);
  if(t>=LI_END){
    CINE.active=false; CINE.kind=null; D=null;
    /* the librarian begins its rounds */
    spider.active=true;
    if(spider.mesh) spider.mesh.visible=true;
    renderObjectives();
  }
}

/* ================= THE END: the terminal accepts ================= */
/* The last disk goes in. The machine prints the level's name and dies into
   static — and the camera lifts away to watch the answer: the librarian
   comes, not for you, but for the floor behind its own desk. It digs. The
   dust of carpet and old earth swallows it, and when the air clears there
   is a round hole with a stone stair winding down into blue. The camera
   settles back into your eyes; the screen is red. It warned you. */
const TC_BOOT=0.7, TC_TEXT=1.6, TC_SHRIEK=3.3, TC_STATIC=5.6,
      TC_PULL=6.4, TC_LIFT=8.0, TC_AIR=10.4,     // view → straight lift → crane out to the aerial mark
      TC_RUN=6.9, TC_DIG=11.0,                   // the sprinter is placed / reaches the dig spot
      TC_SINK0=14.4, TC_SWAP=16.4, TC_SINK1=18.4,// it digs itself under; the plug swaps out at peak dust
      TC_CLEAR0=18.8, TC_CLEAR1=21.4,            // the dust settles off the open hole
      TC_BACK=22.0, TC_BACK_MID=24.0, TC_BACK_END=25.8,   // crane back down into your eyes
      TC_WARN=22.8, TC_END=26.6;
export function startTerminalCine(){
  CINE.active=true; CINE.kind="terminal"; CINE.t=0;
  ui.prompt.classList.remove("show");
  const term=LIB.term, g=term.group;
  g.updateMatrixWorld(true);
  const scr=g.localToWorld(new THREE.Vector3(0,1.6,0.36));
  const eye0={x:STATE.pos.x, y:STATE.y+STATE.curEyeH, z:STATE.pos.z};
  /* a viewing mark just south of the screen, eye level with it */
  const view={x:scr.x, y:1.52, z:scr.z+1.5};
  /* the crane: straight up off the view mark, then out to an aerial seat
     south of the desk. The seat is CHOSEN, not fixed — the canopy of
     hanging strips is random, so candidate seats are scored by their
     clearance from every fixture along the whole crane path and the first
     comfortable one wins. */
  const lift={x:view.x, y:8.2, z:view.z+0.8};
  const clearance=c=>{
    let m=1e9;
    const seg2=(a,b,n)=>{
      for(let i=0;i<=n;i++){
        const k=i/n, px=lerp(a.x,b.x,k), py=lerp(a.y,b.y,k), pz=lerp(a.z,b.z,k);
        for(const L of lights){
          const d=Math.hypot(L.world.x-px,(L.fixY||3.78)-py,L.world.z-pz);
          if(d<m) m=d;
        }
      }
    };
    seg2(view,lift,6); seg2(lift,c,12);
    return m;
  };
  let aerial=null, best=-1;
  outer:
  for(const dz of[15,13,17,11]) for(const dx of[0,2.5,-2.5,5,-5]) for(const dy of[14.5,12.5,16.5]){
    const c={x:scr.x+dx, y:dy, z:scr.z+dz};
    const m=clearance(c);
    if(m>best){ best=m; aerial=c; }
    if(m>2.2) break outer;                       // clear enough — take it
  }
  const hole=LIB.hole;
  /* the aerial gaze rests between the machine and the spot it is about to
     lose — the computer roughly centred, the dig in the upper frame */
  const focus={x:scr.x, y:0.9, z:scr.z-2.6};
  D={fired:new Set(), term, scr, eye0, view, lift, aerial, hole,
     yaw0:STATE.yaw, pitch0:STATE.pitch,
     aScr:lookAngles(view.x,view.y,view.z,scr.x,scr.y,scr.z),
     aAir:lookAngles(aerial.x,aerial.y,aerial.z,focus.x,focus.y,focus.z),
     aEye:lookAngles(eye0.x,eye0.y,eye0.z,scr.x,scr.y,scr.z),
     lastStatic:0, lastTap:0, lastDig:0, rush:null, digFx:null};
  if(AU.ctx&&AU.spiderBedGain)
    AU.spiderBedGain.gain.setTargetAtTime(0,AU.ctx.currentTime,0.4);
}
/* ---- dig FX: flung debris + a churning shroud of soft dust ----
   The dust is pooled billboard sprites wearing a mottled radial-falloff
   puff texture, tinted across carpet blues and earth browns. Three
   emitters share the pool: a churn boiling up out of the work, a heavy
   ground shroud rolling out along the carpet (this is what swallows the
   floor), and one violent ring burst when the floor lets go. Debris is
   small tumbling clods that raise their own little puff where they land. */
let puffTex=null;
function ensurePuffTex(){
  if(puffTex) return;
  /* THREE puffs, not one. A single sprite map repeated 150 times reads as
     150 copies of the same blob however you tint it — the eye finds the
     repeat immediately. And each one is built from soft lumps AND a coarse
     grain pass: a smooth radial falloff is fog. Dust is particulate, and
     what makes it read as dust is that its edges are dirty. */
  puffTex=[0,1,2].map(v=>makeCanvas(128,128,(g,w,h)=>{
    g.clearRect(0,0,w,h);
    const lumps=6+v*3;
    for(let i=0;i<lumps;i++){
      const a=Math.random()*Math.PI*2, rr=Math.random()*(16+v*7);
      const x=64+Math.cos(a)*rr, y=64+Math.sin(a)*rr, r=20+Math.random()*(18+v*4);
      const gr=g.createRadialGradient(x,y,0,x,y,r);
      gr.addColorStop(0,"rgba(255,255,255,0.30)");
      gr.addColorStop(0.55,"rgba(255,255,255,0.14)");
      gr.addColorStop(1,"rgba(255,255,255,0)");
      g.fillStyle=gr;
      g.beginPath(); g.arc(x,y,r,0,Math.PI*2); g.fill();
    }
    /* the grain: motes punched through the body, thinning to nothing at
       the rim so the sprite still has no edge of its own */
    for(let i=0;i<340;i++){
      const a=Math.random()*Math.PI*2, rr=Math.pow(Math.random(),0.6)*58;
      const fall=1-rr/58;
      g.fillStyle=`rgba(255,255,255,${(0.05+Math.random()*0.20)*fall*fall})`;
      g.fillRect(64+Math.cos(a)*rr,64+Math.sin(a)*rr,1+Math.random()*2.5,1+Math.random()*2.5);
    }
  }));
  markShared(...puffTex);              // module-level, reused across every ending
}
/* carpet blues and subsoil browns, with two near-black entries in the mix.
   Sprites are UNLIT, so every puff renders at full strength in a room this
   dark and a cloud of uniformly mid-tone ones turns into a cotton ball
   hanging over the desk. The darks are what give the mass its shadow side
   once the billows start overlapping. */
const PUFF_TINTS=[0x6a543c,0x54432e,0x4a5666,0x3a4756,0x5d4d3a,0x435264,
                  0x7a6448,0x3a2e20,0x252d38];
function makeDigFx(){
  ensurePuffTex();
  const g=new THREE.Group();
  scene.add(g);
  const puffs=[];
  for(let i=0;i<210;i++){
    const m=new THREE.SpriteMaterial({map:puffTex[i%3], color:PUFF_TINTS[i%PUFF_TINTS.length],
      transparent:true, opacity:0, depthWrite:false});
    const s=new THREE.Sprite(m);
    s.visible=false; g.add(s);
    puffs.push({s,m,vx:0,vy:0,vz:0,life:0,max:1,scale0:1,grow:1,peak:0.6,rotV:0,fade:1});
  }
  /* debris: clods of earth and shreds of carpet backing, tumbling as they
     fly. Two shapes — lumps and flat torn strips, which flutter */
  const mats=[0x5a3f24,0x42301b,0x37424e,0x2b3542,0x6b5334].map(c=>new THREE.MeshBasicMaterial({color:c}));
  const chipGeo=new THREE.BoxGeometry(1,1,1);
  const chips=[];
  for(let i=0;i<88;i++){
    const m=new THREE.Mesh(chipGeo,mats[i%mats.length]);
    m.visible=false;
    const flat=i%3===0;                              // a third are carpet shreds
    m.scale.set(flat? rand(0.05,0.11):rand(0.025,0.06),
                flat? 0.006:rand(0.02,0.045),
                flat? rand(0.04,0.10):rand(0.025,0.07));
    g.add(m);
    chips.push({m,vx:0,vy:0,vz:0,life:0,spin:rand(-9,9),flat,spin2:rand(-7,7)});
  }
  return {g,puffs,chips,chipGeo,mats,accP:0,accG:0,accC:0,accV:0,burstDone:false};
}
function spawnPuff(F,x,y,z,vx,vy,vz,scale0,grow,life,peak,fade){
  const p=F.puffs.find(p=>p.life<=0);
  if(!p) return;
  p.life=p.max=life; p.scale0=scale0; p.grow=grow; p.peak=peak;
  p.fade=fade||1;                                  // >1 = sinks away faster than it swelled
  p.vx=vx; p.vy=vy; p.vz=vz; p.rotV=rand(-0.7,0.7);
  p.m.rotation=Math.random()*Math.PI*2;
  p.s.position.set(x,y,z);
  p.s.scale.set(scale0,scale0,1);
  p.s.visible=true;
}
/* dust does not come off a dig one puff at a time — it comes off in
   BILLOWS. Two or three at once, at different sizes and slightly out of
   step, is the difference between a churn and a bead curtain. */
function billow(F,n,x,y,z,vx,vy,vz,scale0,grow,life,peak){
  for(let i=0;i<n;i++){
    const k=0.7+Math.random()*0.7;
    spawnPuff(F, x+rand(-0.22,0.22), y+rand(-0.08,0.14), z+rand(-0.22,0.22),
      vx*k+rand(-0.25,0.25), vy*k, vz*k+rand(-0.25,0.25),
      scale0*k, grow, life*(0.8+Math.random()*0.45), peak*(0.75+Math.random()*0.5));
  }
}
function spawnChip(F,sp,up){
  const c=F.chips.find(c=>c.life<=0);
  if(!c) return;
  const h=D.hole, a=Math.random()*Math.PI*2;
  c.vx=Math.cos(a)*sp; c.vz=Math.sin(a)*sp; c.vy=up;
  c.life=rand(0.8,1.5);
  c.m.position.set(h.x+rand(-0.5,0.5),rand(0.15,0.5),h.z+rand(-0.5,0.5));
  c.m.rotation.set(Math.random()*7,Math.random()*7,Math.random()*7);
  c.m.visible=true;
}
function updateDigFx(dt,t){
  const F=D.digFx, h=D.hole;
  /* master envelope: swells with the dig, holds while it sinks, settles
     once the spider is gone — every puff's alpha rides it */
  const env=seg(t,TC_DIG+0.4,TC_SINK0)*(1-seg(t,TC_CLEAR0,TC_CLEAR1));
  const digging=t>=TC_DIG&&t<TC_SINK1-0.3;
  if(digging){
    /* churn: fresh dust boiling up out of the work, in billows. The legs
       are throwing it, so it comes in gusts rather than a steady stream */
    const gust=0.72+0.55*Math.pow(Math.abs(Math.sin(t*4.1)),1.6)+0.25*hash(Math.floor(t*7));
    F.accP+=dt*13*gust;
    while(F.accP>=1){
      F.accP-=1;
      const a=Math.random()*Math.PI*2, rr=Math.random()*0.9;
      const dir=Math.random()*Math.PI*2, sp=rand(0.5,1.9);
      billow(F, 2+(Math.random()<0.45?1:0),
        h.x+Math.cos(a)*rr, rand(0.15,0.8), h.z+Math.sin(a)*rr,
        Math.cos(dir)*sp, rand(0.4,1.4), Math.sin(dir)*sp,
        rand(0.7,1.2), rand(2.0,2.9), rand(1.2,2.0), rand(0.32,0.52));
    }
    /* the ground shroud: heavy dust rolling out along the carpet — this is
       the layer that swallows the floor (hole + rim included) at the sink */
    F.accG+=dt*20;
    while(F.accG>=1){
      F.accG-=1;
      const a=Math.random()*Math.PI*2, rr=rand(0.3,3.0);
      const drift=a+rand(-0.6,0.6);
      spawnPuff(F, h.x+Math.cos(a)*rr, rand(0.2,0.55), h.z+Math.sin(a)*rr,
        Math.cos(drift)*rand(0.15,0.5), rand(0.02,0.12), Math.sin(drift)*rand(0.15,0.5),
        rand(1.8,2.9), rand(1.4,1.8), rand(2.4,3.6), rand(0.50,0.68));
    }
    /* the VEIL: the fine fraction that never settles. It climbs slowly, way
       out past the shroud, and holds for six seconds at almost no opacity —
       this is what gives the shot a volume for the aerial camera to look
       down THROUGH, instead of a flat mat of dust on the floor. */
    F.accV+=dt*6;
    while(F.accV>=1){
      F.accV-=1;
      const a=Math.random()*Math.PI*2, rr=rand(0.6,2.6);
      spawnPuff(F, h.x+Math.cos(a)*rr, rand(0.5,2.4), h.z+Math.sin(a)*rr,
        Math.cos(a)*rand(0.05,0.35), rand(0.28,0.62), Math.sin(a)*rand(0.05,0.35),
        rand(2.2,3.6), rand(2.2,3.2), rand(4.5,6.5), rand(0.12,0.22), 1.8);
    }
    /* debris spray while the legs work */
    F.accC+=dt*26;
    while(F.accC>=1){ F.accC-=1; spawnChip(F,rand(1.4,4.2),rand(2.2,5.2)); }
  }
  /* the breakthrough: the floor lets go. A ring blown out along the carpet,
     a column punched straight up out of the shaft it just opened, and every
     clod it had left */
  if(t>=TC_SWAP&&!F.burstDone){
    F.burstDone=true;
    for(let i=0;i<24;i++){
      const a=i/24*Math.PI*2+rand(-0.15,0.15);
      billow(F, 2, h.x+Math.cos(a)*rand(0.8,2.0), rand(0.2,0.9), h.z+Math.sin(a)*rand(0.8,2.0),
        Math.cos(a)*rand(1.1,2.2), rand(0.3,0.9), Math.sin(a)*rand(1.1,2.2),
        rand(1.2,1.9), rand(1.8,2.4), rand(1.8,2.8), rand(0.42,0.62));
    }
    for(let i=0;i<14;i++){                        // the column out of the hole
      const a=Math.random()*Math.PI*2, rr=Math.random()*h.r*0.8;
      spawnPuff(F, h.x+Math.cos(a)*rr, rand(0.1,0.6), h.z+Math.sin(a)*rr,
        Math.cos(a)*rand(0.1,0.6), rand(2.2,4.4), Math.sin(a)*rand(0.1,0.6),
        rand(1.4,2.4), rand(2.4,3.4), rand(2.6,3.8), rand(0.32,0.50));
    }
    for(let i=0;i<30;i++) spawnChip(F,rand(2.2,5.2),rand(3.0,6.4));
  }
  /* dust: drag, slow rise, growth, spin; in fast, out slow. The rise is a
     buoyancy that DECAYS — a fresh puff is hot off the work and climbs,
     an old one has cooled and just hangs, which is what stops the whole
     cloud drifting away as one rigid body. */
  for(const p of F.puffs){
    if(p.life<=0) continue;
    p.life-=dt;
    if(p.life<=0){ p.s.visible=false; p.m.opacity=0; continue; }
    const k=1-p.life/p.max;
    const drag=Math.pow(0.42,dt);
    p.vx*=drag; p.vz*=drag; p.vy*=Math.pow(0.55,dt);
    p.s.position.x+=p.vx*dt;
    p.s.position.y+=p.vy*dt+0.09*(1-k)*dt;
    p.s.position.z+=p.vz*dt;
    const sc=p.scale0*(1+(p.grow-1)*k);
    p.s.scale.set(sc,sc,1);
    p.m.rotation+=p.rotV*dt;
    /* fade 1 is the old 1−k²; higher holds the plateau longer and drops it
       at the end, which is how the fine veil outlives the churn under it */
    p.m.opacity=p.peak*Math.min(1,k*5)*Math.max(0,1-Math.pow(k,2*p.fade))*env;
  }
  /* debris: gravity, tumble — and a little puff where each clod lands.
     Flat shreds of carpet backing flutter instead of dropping: they lose
     their fall speed and slew, which reads as WEIGHT on the lumps beside
     them, and it costs one line. */
  for(const c of F.chips){
    if(c.life<=0) continue;
    c.life-=dt;
    c.vy-=(c.flat? 3.6:9.5)*dt;
    if(c.flat){ c.vx*=Math.pow(0.45,dt); c.vz*=Math.pow(0.45,dt); c.vy=Math.max(c.vy,-1.5); }
    c.m.position.x+=c.vx*dt; c.m.position.y+=c.vy*dt; c.m.position.z+=c.vz*dt;
    c.m.rotation.x+=c.spin*dt; c.m.rotation.z+=c.spin*0.7*dt; c.m.rotation.y+=c.spin2*dt;
    if(c.life<=0||c.m.position.y<0.03){
      if(c.m.position.y<0.03&&Math.random()<0.6)
        spawnPuff(F, c.m.position.x, 0.12, c.m.position.z,
          c.vx*0.12, 0.14, c.vz*0.12, rand(0.3,0.5), 1.9, rand(0.4,0.7), 0.35);
      c.life=0; c.m.visible=false;
    }
  }
}
function disposeDigFx(){
  const F=D.digFx;
  if(!F) return;
  scene.remove(F.g);
  F.chipGeo.dispose();
  for(const m of F.mats) m.dispose();
  for(const p of F.puffs) p.m.dispose();         // sprite materials only — the puff texture is shared
  D.digFx=null;
}
function updateTerminal(dt){
  const t=CINE.t, term=D.term, screen=term.screen, hole=D.hole;
  cue("boot",TC_BOOT,()=>{
    sfxComputerBoot(1);
    if(term.pc.userData.led) term.pc.userData.led.color.set(0x39e052);
  });
  /* the white text types itself up to full brightness, holds, then drowns */
  if(t>=TC_TEXT&&t<TC_STATIC){
    if(t-D.lastStatic>0.09){ D.lastStatic=t; screen.boot(Math.min(1,(t-TC_TEXT)*1.3)); }
  }
  cue("shriek",TC_SHRIEK,()=>{
    /* it heard the machine wake from the far stacks */
    sfxSpiderShriek(1.2,panTo(spider.pos.x,spider.pos.z));
    ui.dread.style.opacity=0.45;
  });
  cue("static",TC_STATIC,()=>sfxComputerStatic(3.2,1.2));
  if(t>=TC_STATIC&&t<TC_SWAP){
    if(t-D.lastStatic>0.08){ D.lastStatic=t; screen.static(Math.max(0.12,1-(t-TC_STATIC)*0.3)); }
  }
  cue("dead",TC_SWAP,()=>{
    screen.dead();
    if(term.pc.userData.led) term.pc.userData.led.color.set(0x201008);
  });
  cue("calm",TC_PULL+1,()=>{ ui.dread.style.opacity=0.15; });
  cue("run",TC_RUN,()=>{
    /* place it at the far end of the clearest sight line to the dig spot —
       biased into the north stacks so it crosses the aerial frame — and let
       it eat the distance */
    const dirs=[[0,-1],[0.7,-0.7],[-0.7,-0.7],[1,-0.4],[-1,-0.4],[1,0],[-1,0]];
    let bx=hole.x, bz=hole.z-10, bestD=10;
    for(const[ddx,ddz]of dirs){
      const L=Math.hypot(ddx,ddz);
      for(let s=34;s>=10;s-=2){
        const x=hole.x+ddx/L*s, z=hole.z+ddz/L*s;
        if(losCells2(hole.x,hole.z,x,z)){
          if(s>bestD){ bestD=s; bx=x; bz=z; }
          break;
        }
      }
    }
    spider.pos.set(bx,0,bz);
    spider.surf.mode="floor"; spider.surf.phase="idle";   // the scripted run is always on the ground
    spider.faceAng=Math.atan2(hole.x-bx,hole.z-bz);
    if(spider.mesh){ spider.mesh.visible=true; spider.mesh.quaternion.identity(); }
    D.rush={speed:Math.max(4,bestD/(TC_DIG-TC_RUN-0.1))};
  });
  /* ---- the runner: full sprint to the spot behind the desk ---- */
  if(D.rush&&t<TC_DIG){
    const rx=hole.x-spider.pos.x, rz=hole.z-spider.pos.z, rem=Math.hypot(rx,rz);
    if(rem>0.15){
      const step=Math.min(D.rush.speed*dt,rem);
      spider.pos.x+=rx/rem*step; spider.pos.z+=rz/rem*step;
      spider.faceAng=Math.atan2(rx,rz);
      spiderPose(dt,D.rush.speed);
      if(t-D.lastTap>0.07){
        D.lastTap=t;
        sfxSpiderTap(0.5,panTo(spider.pos.x,spider.pos.z));
      }
    } else spiderPose(dt,0);
  }
  /* ---- the dig ---- */
  cue("dig",TC_DIG,()=>{
    D.digFx=makeDigFx();
    spider.pos.set(hole.x,0,hole.z);
    spider.faceAng=Math.atan2(D.scr.x-hole.x,D.scr.z-hole.z);   // face its desk while it works
  });
  if(t>=TC_DIG&&t<TC_SINK1){
    spiderDigPose(dt, 4.2*seg(t,TC_SINK0,TC_SINK1));
    if(t-D.lastDig>0.38){
      D.lastDig=t;
      sfxSpiderDig(0.9*(1-0.6*seg(t,TC_SINK0,TC_SINK1)),panTo(hole.x,hole.z));
    }
  }
  cue("swap",TC_SWAP,()=>{ revealHole(); sfxHoleRumble(3.4); });
  if(STATE.holeOpen){
    const k=seg(t,TC_SWAP,TC_SWAP+3);
    for(const rec of hole.lights) rec.l.intensity=rec.I*k;
  }
  cue("gone",TC_SINK1,()=>{
    /* the librarian is below the floor now — and it is not coming back */
    spider.mesh.visible=false;
    spider.active=false;
  });
  if(D.digFx) updateDigFx(dt,t);
  /* ---- the warning: the dead terminal comes back for one last line ---- */
  cue("warn",TC_WARN,()=>{
    if(term.pc.userData.led) term.pc.userData.led.color.set(0xff2418);
  });
  if(t>=TC_WARN){
    /* burns in over a second, held under an unsteady tube flicker */
    if(t-D.lastStatic>0.09){
      D.lastStatic=t;
      const a=Math.min(1,(t-TC_WARN)*1.1)*(0.82+0.18*hash(Math.floor(t*13)));
      screen.warn(a,t);
    }
  }
  /* ---- camera: onto the screen, up and out, hold, back into your eyes ---- */
  let cx,cy,cz,yaw,pitch;
  if(t<TC_PULL){
    const k=seg(t,0,1.6);
    cx=lerp(D.eye0.x,D.view.x,k); cy=lerp(D.eye0.y,D.view.y,k); cz=lerp(D.eye0.z,D.view.z,k);
    yaw=angLerp(D.yaw0,D.aScr.yaw,k); pitch=lerp(D.pitch0,D.aScr.pitch,k);
  } else if(t<TC_BACK){
    const k1=seg(t,TC_PULL,TC_LIFT), k2=seg(t,TC_LIFT,TC_AIR);
    cx=lerp(lerp(D.view.x,D.lift.x,k1),D.aerial.x,k2);
    cy=lerp(lerp(D.view.y,D.lift.y,k1),D.aerial.y,k2);
    cz=lerp(lerp(D.view.z,D.lift.z,k1),D.aerial.z,k2);
    const ka=seg(t,TC_PULL,TC_AIR);
    yaw=angLerp(D.aScr.yaw,D.aAir.yaw,ka); pitch=lerp(D.aScr.pitch,D.aAir.pitch,ka);
  } else {
    const k1=seg(t,TC_BACK,TC_BACK_MID), k2=seg(t,TC_BACK_MID,TC_BACK_END);
    cx=lerp(lerp(D.aerial.x,D.lift.x,k1),D.eye0.x,k2);
    cy=lerp(lerp(D.aerial.y,D.lift.y,k1),D.eye0.y,k2);
    cz=lerp(lerp(D.aerial.z,D.lift.z,k1),D.eye0.z,k2);
    const ka=seg(t,TC_BACK,TC_BACK_END);
    yaw=angLerp(D.aAir.yaw,D.aEye.yaw,ka); pitch=lerp(D.aAir.pitch,D.aEye.pitch,ka);
  }
  /* the work below shakes the view, just a little; the breakthrough thumps it */
  let amp=0;
  if(t>=TC_DIG&&t<TC_SINK1) amp=0.006;
  if(t>=TC_SWAP&&t<TC_SWAP+1.2) amp=Math.max(amp,0.02*(1-(t-TC_SWAP)/1.2));
  yaw+=(Math.random()-0.5)*amp; pitch+=(Math.random()-0.5)*amp;
  STATE.yaw=yaw; STATE.pitch=pitch;
  setCam(cx,cy,cz,yaw,pitch);
  if(t>=TC_END){
    screen.warn(1,t);                  // the face stays on the glass for good…
    LIB.weeping=true; LIB.weepT=t;     // …and updateLibrary keeps the tears running
    disposeDigFx();
    CINE.active=false; CINE.kind=null; D=null;
    ui.dread.style.opacity=0;
    renderObjectives();                                   // ENTER THE HOLE
  }
}

/* ================= THE END: the dark takes the stairs ================= */
/* The stair is a real level component — the player walks it themselves,
   the fog thickening with every turn (library.js drives that by depth).
   Only a couple of spirals down, with most vision already gone, does this
   take over: the view drifts on down the walk it was already making while
   the black closes, and the footsteps keep landing on stone a while after
   there is nothing left to see. (The next floor is TBD: for now, the win.) */
const DE_FADE=1.7, DE_END=5.0;
export function startDescentEnd(){
  if(CINE.active) return;
  CINE.active=true; CINE.kind="descend"; CINE.t=0;
  ui.prompt.classList.remove("show");
  D={fired:new Set(), stepAcc:0.25,
     eye:{x:camera.position.x, y:camera.position.y, z:camera.position.z},
     yaw0:STATE.yaw, pitch0:STATE.pitch};
}
function updateDescend(dt){
  const t=CINE.t;
  /* the walk carries on into the black: a slow drift down and forward */
  const drift=Math.min(t,DE_FADE+0.8);
  const cx=D.eye.x-Math.sin(D.yaw0)*drift*0.5;
  const cz=D.eye.z-Math.cos(D.yaw0)*drift*0.5;
  const cy=D.eye.y-drift*0.5+Math.sin(t*7)*0.02;
  setCam(cx,cy,cz,D.yaw0,D.pitch0);
  /* footfalls on stone, all the way down — and after */
  D.stepAcc+=dt;
  if(D.stepAcc>=0.42){ D.stepAcc=0; sfxStoneStep(0.8+Math.random()*0.2); }
  ui.flash.style.transition="none"; ui.flash.style.background="#000";
  ui.flash.style.opacity=seg(t,0,DE_FADE);
  if(t>=DE_END){
    CINE.active=false; CINE.kind=null; D=null;
    /* the stair was going somewhere after all */
    enterTheNest();
  }
}

/* ================= THE NEST: waking under the world ================= */
/* The black holds a beat, then lifts on rough rock and fungus-light. You
   look back UP at the stair you rode down — its last flight sheathed in
   fresh silk — then find your feet and the cave finds its name. */
const NI_LIFT=1.2, NI_STAND=4.2, NI_LEVEL=6.4, NI_TITLE=7.4,
      NI_TITLE_OFF=11.6, NI_END=12.4;
export function startNestIntro(){
  CINE.active=true; CINE.kind="nestIntro"; CINE.t=0;
  ui.prompt.classList.remove("show");
  D={fired:new Set(),
     eye:{x:CAVE.spawn.x, z:CAVE.spawn.z},
     yaw0:CAVE.spawnYaw};
  /* hold the screen black; the first cue lifts it */
  ui.flash.style.transition="none"; ui.flash.style.background="#000";
  ui.flash.style.opacity=1;
}
function updateNestIntro(dt){
  const t=CINE.t;
  cue("lift",NI_LIFT,()=>{
    ui.flash.style.transition="opacity 2.8s"; ui.flash.style.opacity=0;
  });
  cue("settle",2.0,()=>{ sfxStoneStep(0.5); });
  cue("drip",3.1,()=>{ if(AU.cave&&AU.cave.drip) AU.cave.drip(); });
  /* somewhere off in the dark, something small crosses loose stone */
  cue("skit",5.6,()=>{ for(let i=0;i<5;i++)
    setTimeout(()=>sfxHatchTap(0.22,-0.6),i*130); });
  cue("title",NI_TITLE,()=>{
    const el=document.getElementById("levelTitle");
    if(el){ el.querySelector("#ltMain").textContent="THE NEST";
      el.querySelector("#ltSub").textContent="level 8, wrong side out";
      el.classList.add("show"); }
  });
  cue("titleOff",NI_TITLE_OFF,()=>{
    const el=document.getElementById("levelTitle");
    if(el) el.classList.remove("show");
  });
  /* ---- camera: on your knees at the stair's foot, head craned up at it ---- */
  const up=seg(t,NI_LIFT,NI_STAND);
  const cy=lerp(0.8,1.62,up);
  /* the stair stub is behind the spawn (+z): look back and up at it first */
  const backYaw=D.yaw0+Math.PI;
  const level=seg(t,NI_STAND,NI_LEVEL);
  const yaw=angLerp(backYaw, D.yaw0, level);
  const pitch=lerp(1.15,-0.02,Math.max(up*0.35,level));  // high enough to catch the bore's mouth
  /* a slow scan once upright */
  const lp=seg(t,NI_LEVEL,NI_END-0.3);
  const scanYaw=yaw+0.5*Math.sin(lp*Math.PI*2)*Math.sin(lp*Math.PI);
  STATE.yaw=scanYaw; STATE.pitch=pitch;
  setCam(D.eye.x, cy+Math.sin(t*6.5)*0.012*(1-up), D.eye.z, scanYaw, pitch);
  if(t>=NI_END){
    CINE.active=false; CINE.kind=null; D=null;
    /* the tending resumes; the small ones take up their territories */
    spider.active=true;
    if(spider.mesh) spider.mesh.visible=true;
    renderObjectives();
  }
}

/* ================= THE NEST: the climb into the cold ================= */
/* The chimney is real and yours to climb — this only takes over a few
   turns up, where the pale light has already washed out the cave below:
   the view drifts on upward while the white closes in, the footsteps keep
   ringing on stone, and the updraft swallows everything. */
const AS_FADE=2.3, AS_END=6.2;
export function startAscentEnd(){
  if(CINE.active) return;
  CINE.active=true; CINE.kind="ascend"; CINE.t=0;
  ui.prompt.classList.remove("show");
  D={fired:new Set(), stepAcc:0.25,
     eye:{x:camera.position.x, y:camera.position.y, z:camera.position.z},
     yaw0:STATE.yaw, pitch0:STATE.pitch,
     wind:startUpdraftWind()};
  D.wind.swell(1,2);
}
function updateAscend(dt){
  const t=CINE.t;
  /* the climb carries on into the light: a slow spiral drift upward */
  const drift=Math.min(t,AS_FADE+1.0);
  const yaw=D.yaw0+drift*0.22;
  const cx=D.eye.x-Math.sin(yaw)*drift*0.35;
  const cz=D.eye.z-Math.cos(yaw)*drift*0.35;
  const cy=D.eye.y+drift*0.55+Math.sin(t*7)*0.02;
  const pitch=lerp(D.pitch0,0.35,seg(t,0,AS_FADE));   // eyes rising to the pale
  setCam(cx,cy,cz,yaw,pitch);
  D.stepAcc+=dt;
  if(D.stepAcc>=0.46){ D.stepAcc=0; sfxStoneStep(0.7+Math.random()*0.2); }
  /* not black this time — the cold pale of somewhere that is not this */
  ui.flash.style.transition="none"; ui.flash.style.background="#cdd7dc";
  ui.flash.style.opacity=seg(t,0,AS_FADE);
  if(t>=AS_END){
    if(D.wind) D.wind.stop(2);
    CINE.active=false; CINE.kind=null; D=null;
    win();
    setTimeout(()=>{ ui.flash.style.transition="opacity 3s";
      ui.flash.style.opacity=0; },800);
  }
}
