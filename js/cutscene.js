/* ---------------- scripted cinematics: restoring the power & exit elevator ----------------
   Both sequences take the camera away from the player (main.js skips
   updatePlayer/updateFocus while CINE.active) and drive props, audio and
   the entity on a fixed timeline. The breaker scene keeps the entity AI
   running (it rushes the panel, freezing at a 30m ring); the elevator
   scene scripts the entity entirely. */
import { clamp, lerp, angLerp, hash, rand } from "./utils.js";
import { STATE, monster, spider } from "./state.js";
import { worldToCell, isWall, losCells } from "./map.js";
import { scene, camera, playerLight, amb, lights } from "./scene.js";
import { AU, panTo, sfxAlert, sfxStinger, sfxClunk, sfxPowerOn,
         sfxBoxOpen, sfxLatchTurn, sfxFuseSeat, FUSE_SEAT_AT, sfxLeverStrain, sfxMainThrow, sfxBreakerClick,
         sfxElevButton, sfxElevDing, sfxElevDoors, sfxElevThud, sfxElevJolt, sfxFloorBlip,
         startElevDescend, sfxElevRattle, sfxElevGrind, sfxLightsOut,
         sfxComputerBoot, sfxComputerStatic, sfxSpiderShriek, sfxSpiderTap,
         sfxSpiderScratch, sfxSpiderDig, sfxHoleRumble, sfxStoneStep } from "./audio.js";
import { ui, renderObjectives } from "./ui.js";
import { monsterRushTo, poseMonster } from "./monster.js";
import { exitDoor, ELEV } from "./props.js";
import { win, enterTheEnd, enterTheNest } from "./lifecycle.js";
import { LIB, losCells2, revealHole } from "./library.js";
import { CAVE } from "./cave.js";
import { spiderPose, spiderDigPose, spiderFootWorld } from "./spider.js";
import { startUpdraftWind, sfxHatchTap, sfxBodyFall } from "./audio.js";

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
    if(CINE.kind==="breaker"&&D){ playerLight.intensity=D.savedPL; playerLight.color.set(PL_WARM); }
    if(CINE.kind==="elev"){ STATE.ambDim=1; playerLight.intensity=0.12; }
    CINE.active=false; CINE.kind=null; D=null;
    monster.holdAt30=false; monster.held=false;
    return;
  }
  CINE.t+=dt;
  if(CINE.kind==="breaker") updateBreaker(dt);
  else if(CINE.kind==="elev") updateElevator(dt);
  else if(CINE.kind==="libIntro") updateLibIntro(dt);
  else if(CINE.kind==="terminal") updateTerminal(dt);
  else if(CINE.kind==="descend") updateDescend(dt);
  else if(CINE.kind==="nestIntro") updateNestIntro(dt);
  else if(CINE.kind==="ascend") updateAscend(dt);
}

/* ================= breaker: restoring the power ================= */
/* ~7s, all of it done by hand: the latch, the door, the fuse pushed up into
   its jaws, the main switch thrown against its spring. The contacts close
   with an arc, the whole floor browns out, and the tubes strike back up in a
   ring rolling out from the board (lights.js, STATE.surge) while the camera
   turns to watch it come on down the corridor. The player can't move — long
   enough for a distant entity to close in; one inside 30m freezes there
   until control returns. */
const BK={LATCH:0.5, OPEN:0.72, OPEN_END:1.38, FUSE0:1.5, FUSE1:2.42, SEAT:2.7,
          SWING0:3.0, SWING1:3.7, STRAIN:3.72, THROW:4.08, LIVE:4.45,
          BACK0:5.2, BACK1:6.3, END:7.0};
const PL_WARM=0xffeeb0;
/* the way to look when it is done: the longest open run from the cell the
   board faces into, so the lights have somewhere to come on */
function breakerLookBack(g){
  const n=new THREE.Vector3(0,0,1).applyQuaternion(g.quaternion);
  const nx=Math.round(n.x), nz=Math.round(n.z);
  const c=worldToCell(g.position.x+nx*1.2,g.position.z+nz*1.2);
  let best=[nx,nz], bestN=-1;
  for(const[dx,dz]of[[nx,nz],[nz,-nx],[-nz,nx]]){
    let k=0; while(k<9 && !isWall(c.cx+dx*(k+1),c.cy+dz*(k+1))) k++;
    if(k>bestN){ bestN=k; best=[dx,dz]; }
  }
  return {yaw:Math.atan2(-best[0],-best[1]), pitch:0.1};
}
export function startBreakerCine(item){
  CINE.active=true; CINE.kind="breaker"; CINE.t=0;
  ui.prompt.classList.remove("show");
  const g=item.mesh, u=g.userData;
  g.updateMatrixWorld(true);
  const L=(x,y,z)=>g.localToWorld(new THREE.Vector3(x,y,z));
  const pose=(p,q)=>({p, ...lookAngles(p.x,p.y,p.z,q.x,q.y,q.z)});
  const eye=new THREE.Vector3(STATE.pos.x,STATE.y+STATE.curEyeH,STATE.pos.z);
  D={fired:new Set(), g, u,
     poses:[{p:eye.clone(), yaw:STATE.yaw, pitch:STATE.pitch},
            pose(L(0.1,0.14,1.25),L(0,-0.02,0.1)),              // the board
            pose(L(0.06,0.1,0.62),L(0,0,0)),                    // the fuse holder
            pose(L(0.34,0.2,1.08),L(0.3,0.16,0.02)),            // the main switch, under the meter
            {p:eye.clone(), ...breakerLookBack(g)}],            // back down the corridor
     n:new THREE.Vector3(0,0,1).applyQuaternion(g.quaternion),
     arcW:L(0,0.33,0.3),
     shake:0, flash:0, fuseFrom:null, fusePre:null, trip:0, tagA:0, tagV:0,
     savedPL:playerLight.intensity};
  playerLight.intensity=0.8;
  /* the entity drops everything and sprints for this spot */
  monsterRushTo(g.position.x,g.position.z);
  monster.holdAt30=true;
}
function updateBreaker(dt){
  const t=CINE.t, u=D.u, g=D.g, P=D.poses;
  /* ---- the camera: four moves, handheld throughout ---- */
  const cp=P[0].p.clone(); let yaw=P[0].yaw, pitch=P[0].pitch;
  const ks=[seg(t,0,0.8), seg(t,1.05,1.85), seg(t,BK.SWING0,BK.SWING1), seg(t,BK.BACK0,BK.BACK1)];
  ks.forEach((k,i)=>{ const q=P[i+1]; cp.lerp(q.p,k); yaw=angLerp(yaw,q.yaw,k); pitch=lerp(pitch,q.pitch,k); });
  /* leaning into the switch, and the recoil when it goes */
  cp.addScaledVector(D.n,-0.05*seg(t,BK.STRAIN,BK.THROW)*(1-seg(t,BK.THROW,BK.THROW+0.35)));
  const hh=1-seg(t,BK.BACK1,BK.END);
  cp.x+=Math.sin(t*1.7)*0.004*hh; cp.y+=Math.sin(t*2.3+1)*0.003*hh;
  yaw+=Math.sin(t*1.3)*0.005*hh; pitch+=Math.sin(t*1.9+2)*0.004*hh;
  D.shake*=Math.exp(-dt*6);
  const sk=Math.floor(t*60);
  cp.x+=(hash(sk)-0.5)*0.03*D.shake; cp.y+=(hash(sk+7)-0.5)*0.03*D.shake;
  yaw+=(hash(sk+3)-0.5)*0.025*D.shake; pitch+=(hash(sk+5)-0.5)*0.025*D.shake;
  STATE.yaw=yaw; STATE.pitch=pitch;
  setCam(cp.x,cp.y,cp.z,yaw,pitch);
  /* ---- the latch, then the door flung back against its stop ---- */
  cue("latch",BK.LATCH,()=>sfxLatchTurn());
  u.latch.rotation.z=-Math.PI/2*seg(t,BK.LATCH,BK.LATCH+0.2);
  cue("open",BK.OPEN,()=>sfxBoxOpen());
  const knock=t>BK.OPEN_END? Math.sin(clamp((t-BK.OPEN_END)/0.32,0,1)*Math.PI)*0.07 : 0;
  u.doorPivot.rotation.y=u.DOOR_OPEN*seg(t,BK.OPEN,BK.OPEN_END)+knock;
  /* ---- the fuse: up from the bottom of the frame, into its jaws ---- */
  const f=u.fuse;
  if(t>=BK.FUSE0 && !D.fuseFrom){
    /* it rises into frame from below, near the board — brought in from the
       lens it filled the screen and its blades read as planks */
    D.fusePre=u.FUSE_SEAT.clone().add(new THREE.Vector3(0,-0.12,0.03));
    D.fuseFrom=D.fusePre.clone().add(new THREE.Vector3(0.04,-0.36,0.2));
    f.visible=true;
  }
  if(D.fuseFrom){
    if(t<BK.FUSE1){
      const k=seg(t,BK.FUSE0,BK.FUSE1);
      f.position.lerpVectors(D.fuseFrom,D.fusePre,k); f.position.y+=Math.sin(k*Math.PI)*0.03;
      f.rotation.set((1-k)*0.22,(1-k)*-0.3,(1-k)*0.15);
    } else if(t<BK.SEAT){
      /* worked in against the springs, harder toward the end */
      const k=(t-BK.FUSE1)/(BK.SEAT-BK.FUSE1);
      f.position.lerpVectors(D.fusePre,u.FUSE_SEAT,k*k);
      f.position.x+=Math.sin(k*Math.PI*4)*0.004*(1-k);
      f.rotation.set(0,0,Math.sin(k*Math.PI*3)*0.03*(1-k));
    } else { f.position.copy(u.FUSE_SEAT); f.rotation.set(0,0,0); }
  }
  cue("seatSfx",BK.SEAT-FUSE_SEAT_AT,()=>sfxFuseSeat());
  cue("seat",BK.SEAT,()=>{
    u.sparks.emit(10,u.socket,0.05,{x:0,y:-0.3,z:0.6});
    D.shake=Math.max(D.shake,0.35); D.flash=0.35;
  });
  /* half a circuit: the FAULT lamp stutters until the main is closed */
  if(t>=BK.SEAT && t<BK.LIVE) u.setLamp(u.lampR, hash(Math.floor(t*14)+3)>0.35? 1:0.2);
  /* ---- the main switch, pulled back and then thrown ---- */
  cue("strain",BK.STRAIN,()=>sfxLeverStrain());
  let a=u.LEVER_OFF+0.1*seg(t,BK.STRAIN,BK.THROW-0.05);
  if(t>=BK.THROW-0.05){
    const k=clamp((t-(BK.THROW-0.05))/0.11,0,1);
    a=lerp(u.LEVER_OFF+0.1,u.LEVER_ON-0.14,k*k);
    if(k>=1){ const e=t-(BK.THROW+0.06); a=u.LEVER_ON-0.14*Math.exp(-e*9)*Math.cos(e*30); }
  }
  u.lever.rotation.x=a;
  /* the lockout tag hangs off it and swings when it goes */
  D.tagV+=(-D.tagA*55-D.tagV*2.2)*dt; D.tagA+=D.tagV*dt;
  u.tag.rotation.x=-a+D.tagA;
  cue("throw",BK.THROW,()=>{
    sfxMainThrow();
    u.sparks.emit(22,u.switchAt,0.06,{x:0.5,y:0.2,z:0.7});
    u.sparks.emit(20,u.lugs,0.1,{x:0,y:0.1,z:1});
    D.shake=1; D.flash=1; D.tagV=-9;
    STATE.surge={x:g.position.x, z:g.position.z, t:0, maxR:190};
  });
  /* the arc: blue-white, in the cabinet and on everything near it */
  D.flash*=Math.exp(-dt*9);
  const fl=D.flash>0.02? D.flash*(hash(Math.floor(t*40))>0.3? 1:0.25) : 0;
  u.arc.material.opacity=Math.min(1,fl*1.1);
  const fk=Math.min(1,fl);
  playerLight.color.setRGB(1-0.28*fk, 0.933-0.09*fk, 0.69+0.31*fk);
  /* the fill goes with the building when the load comes on */
  const dip=seg(t,BK.THROW+0.1,BK.THROW+0.2)*(1-seg(t,BK.LIVE,BK.LIVE+0.3));
  playerLight.intensity=0.8*(1-0.7*dip)+fl*3.5;
  if(fl>0.05) playerLight.position.copy(D.arcW);
  else playerLight.position.set(cp.x,cp.y+0.3,cp.z);
  /* ---- the building takes the load ---- */
  cue("live",BK.LIVE,()=>{
    sfxPowerOn();
    STATE.powerOn=true;
    if(exitDoor) exitDoor.userData.sign.material.color.set(0xffffff);
    renderObjectives();                                 // the objective box says it
  });
  if(t>=BK.LIVE){
    const e=t-BK.LIVE;
    u.setLamp(u.lampR,0);
    u.setLamp(u.lampG, e<0.25? (hash(Math.floor(t*30)+9)>0.4? 1:0.2) : 1);
    u.needle.rotation.z=u.needleAng(Math.max(0,230*(1-Math.exp(-e*4.2)*Math.cos(e*7.5))));
  }
  /* the tripped breakers snap themselves back on, one after another */
  while(D.trip<u.trips.length && t>=BK.LIVE+0.2+D.trip*0.09){
    const tr=u.trips[D.trip++];
    tr.piv.rotation.x=u.TOG_ON; tr.flag.visible=false;
    sfxBreakerClick(clamp(tr.x*2.5,-0.6,0.6));
  }
  u.sparks.update(dt);
  if(t>=BK.END){
    playerLight.intensity=D.savedPL; playerLight.color.set(PL_WARM);
    u.powered=true;
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
  D.emergLight=u.emergLight;
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
  return {pool,light:g.userData.sparkLight,acc:0};
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
  /* the same body the AI drives, flat out */
  poseMonster(dt,rem>0.05? D.monRun.speed:0,"chase");
  const hr=u.B.head.userData.rest;
  u.B.head.rotation.set(hr[0],(hash(Math.floor(CINE.t*16))-0.5)*0.7,hr[2]);   // frantic jolts
  m.mesh.position.set(m.pos.x,0,m.pos.z);
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
      el.querySelector("#ltSub").textContent="The Infinite Library";
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
     lastStatic:0, lastTap:0, lastDig:0, rush:null, fx:null, kick:0};
  if(AU.ctx&&AU.spiderBedGain)
    AU.spiderBedGain.gain.setTargetAtTime(0,AU.ctx.currentTime,0.4);
}
/* ---- dig FX: a churning shroud, and spoil thrown by the claws ----
   The dust and the debris are LIB.digFx (particles.js), built with the
   level so their programs are compiled behind the intro instead of in the
   middle of this shot. Four emitters share the dust pool: a gusting churn
   boiling out of the work, a heavy ground shroud rolling out along the
   carpet, a fine VEIL that climbs and hangs (it gives the aerial camera
   something to look down THROUGH), and the breakthrough when the floor
   lets go. The spoil comes off the CLAWS: every front leg that finishes a
   drag flicks a spray of clods out behind the body — carpet shreds and
   carpet-grey dust at first, earth once it is through the floor — and all
   of it lands and stays where it lands. */
const EARTH_TINTS=[0x6a543c,0x54432e,0x5d4d3a,0x7a6448,0x3a2e20,0x46382a];
const CARPET_TINTS=[0x4a5666,0x3a4756,0x435264,0x252d38,0x55606e];
const dustTint=k=>{ const p=Math.random()<k? EARTH_TINTS : CARPET_TINTS; return p[Math.floor(Math.random()*p.length)]; };
function startDigFx(){
  const F=LIB.digFx;
  F.group.visible=true; F.dust.mesh.visible=true; F.dust.clear();
  spider.digT=0;
  D.fx={accP:0,accG:0,accV:0,accC:0,burst:false};
}
/* dust comes off a dig in BILLOWS — two or three at once, at different
   sizes and a little out of step — not one puff at a time */
function billow(n,x,y,z,vx,vy,vz,s0,grow,life,peak,k){
  const F=LIB.digFx;
  for(let i=0;i<n;i++){
    const q=0.7+Math.random()*0.7;
    F.dust.spawn(x+rand(-0.22,0.22),y+rand(-0.08,0.14),z+rand(-0.22,0.22),
      vx*q+rand(-0.25,0.25),vy*q,vz*q+rand(-0.25,0.25),
      s0*q,grow,life*(0.8+Math.random()*0.45),peak*(0.75+Math.random()*0.5),1,dustTint(k));
  }
}
const _tip=new THREE.Vector3();
function updateDigFx(dt,t){
  const F=LIB.digFx, h=D.hole, fx=D.fx;
  F.dust.env=seg(t,TC_DIG+0.3,TC_DIG+2.0)*(1-seg(t,TC_CLEAR0,TC_CLEAR1));
  const earth=seg(t,TC_DIG+0.8,TC_DIG+3.2);          // through the carpet into what is under it
  const digging=t>=TC_DIG&&t<TC_SINK1-0.3;
  const back={x:-Math.sin(spider.faceAng), z:-Math.cos(spider.faceAng)};
  if(digging){
    const gust=0.72+0.55*Math.pow(Math.abs(Math.sin(t*4.1)),1.6)+0.25*hash(Math.floor(t*7));
    fx.accP+=dt*11*gust;
    while(fx.accP>=1){
      fx.accP-=1;
      const a=Math.random()*Math.PI*2, rr=Math.random()*0.9, dir=Math.random()*Math.PI*2, sp=rand(0.5,1.9);
      billow(2+(Math.random()<0.45?1:0), h.x+Math.cos(a)*rr, rand(0.15,0.8), h.z+Math.sin(a)*rr,
        Math.cos(dir)*sp, rand(0.4,1.4), Math.sin(dir)*sp, rand(0.8,1.3), rand(2.0,2.9), rand(1.2,2.0), rand(0.34,0.54), earth);
    }
    fx.accG+=dt*16;
    while(fx.accG>=1){
      fx.accG-=1;
      const a=Math.random()*Math.PI*2, rr=rand(0.3,3.0), drift=a+rand(-0.6,0.6);
      F.dust.spawn(h.x+Math.cos(a)*rr, rand(0.05,0.4), h.z+Math.sin(a)*rr,
        Math.cos(drift)*rand(0.15,0.5), rand(0.02,0.1), Math.sin(drift)*rand(0.15,0.5),
        rand(2.0,3.2), rand(1.4,1.8), rand(2.4,3.6), rand(0.5,0.7), 1, dustTint(earth));
    }
    fx.accV+=dt*5;
    while(fx.accV>=1){
      fx.accV-=1;
      const a=Math.random()*Math.PI*2, rr=rand(0.6,2.6);
      F.dust.spawn(h.x+Math.cos(a)*rr, rand(0.5,2.4), h.z+Math.sin(a)*rr,
        Math.cos(a)*rand(0.05,0.35), rand(0.28,0.62), Math.sin(a)*rand(0.05,0.35),
        rand(2.4,3.8), rand(2.2,3.2), rand(4.5,6.5), rand(0.12,0.2), 1.8, dustTint(earth));
    }
    /* the spoil, off the end of each claw as it finishes its drag */
    const flicks=spider.mesh&&spider.mesh.userData.digFlick;
    if(flicks) for(const leg of flicks){
      spiderFootWorld(leg,_tip);
      const y=Math.max(0.08,_tip.y);
      for(let i=0;i<3;i++){
        const sp=rand(1.6,3.6), side=rand(-1.2,1.2);
        F.debris.toss(Math.random()>earth*0.85, _tip.x,y,_tip.z,
          back.x*sp+back.z*side, rand(2.2,4.4), back.z*sp-back.x*side, rand(0.03,0.07));
      }
      billow(1,_tip.x,y+0.1,_tip.z, back.x*1.2,0.6,back.z*1.2, rand(0.5,0.8),2.2,rand(0.9,1.4),0.4,earth);
      D.kick=Math.max(D.kick||0,0.5);
    }
    /* and a thinner spray all round, where the other legs are scrabbling */
    fx.accC+=dt*9;
    while(fx.accC>=1){
      fx.accC-=1;
      const a=Math.random()*Math.PI*2, sp=rand(1.2,3.4);
      F.debris.toss(Math.random()>earth*0.85, h.x+rand(-0.5,0.5),rand(0.15,0.5),h.z+rand(-0.5,0.5),
        Math.cos(a)*sp,rand(2,4.6),Math.sin(a)*sp,rand(0.025,0.055));
    }
  }
  /* the breakthrough: the floor lets go. A ring blown out along the carpet,
     a column punched up out of the shaft it just opened, and a last throw
     of everything it had loose */
  if(t>=TC_SWAP&&!fx.burst){
    fx.burst=true;
    for(let i=0;i<24;i++){
      const a=i/24*Math.PI*2+rand(-0.15,0.15);
      billow(2, h.x+Math.cos(a)*rand(0.8,2.0), rand(0.2,0.9), h.z+Math.sin(a)*rand(0.8,2.0),
        Math.cos(a)*rand(1.1,2.2), rand(0.3,0.9), Math.sin(a)*rand(1.1,2.2),
        rand(1.3,2.0), rand(1.8,2.4), rand(1.8,2.8), rand(0.42,0.62), 1);
    }
    for(let i=0;i<14;i++){
      const a=Math.random()*Math.PI*2, rr=Math.random()*h.r*0.8;
      F.dust.spawn(h.x+Math.cos(a)*rr, rand(0.1,0.6), h.z+Math.sin(a)*rr,
        Math.cos(a)*rand(0.1,0.6), rand(2.2,4.4), Math.sin(a)*rand(0.1,0.6),
        rand(1.5,2.6), rand(2.4,3.4), rand(2.6,3.8), rand(0.32,0.5), 1, dustTint(1));
    }
    for(let i=0;i<30;i++){
      const a=Math.random()*Math.PI*2, sp=rand(2.2,5.2), rr=rand(h.r*0.6,h.r);
      F.debris.toss(Math.random()<0.25, h.x+Math.cos(a)*rr,rand(0.1,0.5),h.z+Math.sin(a)*rr,
        Math.cos(a)*sp,rand(3,6.4),Math.sin(a)*sp,rand(0.03,0.08));
    }
  }
  F.dust.update(dt,camera);
  F.debris.update(dt,(x,z)=> STATE.holeOpen&&Math.hypot(x-h.x,z-h.z)<h.r-0.08? -1e9 : 0);
}
/* the dust goes; the spoil stays on the carpet where it fell */
function endDigFx(){
  const F=LIB.digFx;
  if(!F) return;
  F.dust.clear(); F.dust.mesh.visible=false;
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
    startDigFx();
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
  if(D.fx) updateDigFx(dt,t);
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
  if(t>=TC_DIG&&t<TC_SINK1) amp=0.006+0.012*(D.kick||0);
  D.kick=(D.kick||0)*Math.exp(-dt*10);
  if(t>=TC_SWAP&&t<TC_SWAP+1.2) amp=Math.max(amp,0.02*(1-(t-TC_SWAP)/1.2));
  yaw+=(Math.random()-0.5)*amp; pitch+=(Math.random()-0.5)*amp;
  STATE.yaw=yaw; STATE.pitch=pitch;
  setCam(cx,cy,cz,yaw,pitch);
  if(t>=TC_END){
    screen.warn(1,t);                  // the face stays on the glass for good…
    LIB.weeping=true; LIB.weepT=t;     // …and updateLibrary keeps the tears running
    endDigFx();
    CINE.active=false; CINE.kind=null; D=null;
    ui.dread.style.opacity=0;
    renderObjectives();                                   // ENTER THE HOLE
  }
}

/* ================= THE END: down the stair ================= */
/* The stair is a real level component — you walk it yourself, the fog
   thickening with every turn. A couple of turns down the walk is taken off
   you WITHOUT A CUT: the camera starts exactly where your eyes are, eases
   onto the line of the treads at the pace you were already keeping, and
   carries on down them — turning with the spiral, the head dipping with
   every step, looking at the treads ahead the way anyone on a stair does —
   while the dark closes. The footfalls land on the treads it steps on, and
   keep landing a while after there is nothing left to see. */
const DE_FADE0=1.5, DE_FADE1=4.4, DE_END=6.0;
const DE_PACE=1.3;                                 // m/s along the treads once it has you
export function startDescentEnd(){
  if(CINE.active) return;
  CINE.active=true; CINE.kind="descend"; CINE.t=0;
  ui.prompt.classList.remove("show");
  const h=LIB.hole, st=h.stair, stepA=Math.PI*2/st.steps, stepH=st.rise/st.steps;
  const px=STATE.pos.x-h.x, pz=STATE.pos.z-h.z, r0=Math.max(1.8,Math.hypot(px,pz));
  /* unwrap the bearing onto the lap the feet are on */
  const cFeet=-(STATE.y+0.02)/stepH;
  let th=Math.atan2(pz,px);
  const want=st.a0+cFeet*stepA;
  th+=Math.round((want-th)/(Math.PI*2))*Math.PI*2;
  const vT=STATE.velX*-Math.sin(th)+STATE.velZ*Math.cos(th);
  D={fired:new Set(), h, st, stepA, stepH, th, r0, lastStep:null,
     w0:Math.max(0.35,Math.min(vT,4.6))/r0,
     eye0:{x:camera.position.x, y:camera.position.y, z:camera.position.z},
     yaw0:STATE.yaw, pitch0:STATE.pitch, off:null};
}
function descendAt(th,r){
  const c=(th-D.st.a0)/D.stepA, f=c-Math.floor(c);
  const feet=-0.02-(c-0.5)*D.stepH;
  return {c, feet, eye:feet+1.6+0.022*Math.cos(f*Math.PI*2),
          x:D.h.x+Math.cos(th)*r, z:D.h.z+Math.sin(th)*r};
}
function updateDescend(dt){
  const t=CINE.t, rc=D.st.rc-0.08;
  const k=seg(t,0,0.9);
  const w=lerp(D.w0,DE_PACE/rc,k);
  D.th+=w*dt;
  const r=lerp(D.r0,rc,seg(t,0,1.1));
  const p=descendAt(D.th,r);
  /* where the eyes were, fading out over the first steps */
  if(!D.off) D.off={x:D.eye0.x-p.x, y:D.eye0.y-p.eye, z:D.eye0.z-p.z};
  const hold=1-seg(t,0,0.8);
  const cx=p.x+D.off.x*hold, cy=p.eye+D.off.y*hold, cz=p.z+D.off.z*hold;
  /* look at the treads a little way ahead, just inside the line you walk */
  const ah=descendAt(D.th+0.75,rc-0.15);
  const aim=lookAngles(cx,cy,cz,ah.x,ah.feet+0.95,ah.z);
  const ka=seg(t,0,1.2);
  const yaw=angLerp(D.yaw0,aim.yaw,ka), pitch=lerp(D.pitch0,aim.pitch,ka);
  setCam(cx,cy,cz,yaw,pitch);
  camera.rotation.z=0.01*Math.sin(p.c*Math.PI);    // weight onto each foot in turn
  STATE.pos.x=p.x; STATE.pos.z=p.z; STATE.y=p.feet;  // the shaft's fog reads the depth
  STATE.yaw=yaw; STATE.pitch=pitch;
  playerLight.position.set(cx,cy+0.4,cz);
  /* a footfall on every tread it lands on */
  const tread=Math.floor(p.c);
  if(D.lastStep!==null&&tread!==D.lastStep) sfxStoneStep((0.9+Math.random()*0.15)*(1-0.55*seg(t,DE_FADE1,DE_END)));
  D.lastStep=tread;
  ui.flash.style.transition="none"; ui.flash.style.background="#000";
  ui.flash.style.opacity=seg(t,DE_FADE0,DE_FADE1);
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
      el.querySelector("#ltSub").textContent="The Cave Below";
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

/* ================= death: you go down, and the dark comes in =================
   Death used to be a red screen and a menu in the same frame, which read as a
   UI event rather than as something that happened to a body. This is the same
   camera language as every other cutscene, only it runs OUTSIDE CINE: the main
   loop stops updating the world the instant STATE.dead is set, so the death
   camera is driven from its own branch and nothing else in the scene moves —
   which is exactly right. Whatever killed you is standing where it killed you,
   and the camera falls to the floor and looks up at it while the iris closes.

   Two causes, two shots:
     "caught" — the hit, the collapse, the landing, the thing standing over you.
     "fall"   — nothing to look at: the drop continues, spinning, into the dark. */
export const DEATH={active:false, t:0};
let DX=null;
const DTH_HIT=0.22, DTH_LAND=1.28, DTH_CARD=2.8;

export function startDeathCam(cause,onCard){
  DEATH.active=true; DEATH.t=0;
  const fall=cause==="fall";
  /* who did it — the position is read LIVE each frame, so if a mesh is still
     where it caught you the camera finds it however it was posed */
  let killer=null, lookH=1.35;
  if(!fall){
    /* the wire thing is bent over you: look up into the knot, not its hips */
    if(STATE.level===0&&monster.mesh){ killer=monster.pos; lookH=2.55; }
    else if(spider.mesh) killer=spider.mesh.position;
  }
  DX={fall, killer, lookH, onCard, carded:false, landed:false,
      x:camera.position.x, y:camera.position.y, z:camera.position.z,
      yaw0:STATE.yaw, pitch0:STATE.pitch,
      roll:(Math.random()<0.5?-1:1)*(fall?1:0.62),
      spin:(Math.random()<0.5?-1:1)*rand(0.9,1.6)};
  /* the hit itself: a dark red slap, not a white flash */
  ui.flash.style.transition="none";
  ui.flash.style.background=fall? "#05070a":"#4d0a06";
  ui.flash.style.opacity=fall? 0.35:0.72;
  setTimeout(()=>{ ui.flash.style.transition="opacity .85s"; ui.flash.style.opacity=0; },110);
  /* the world drains and the iris opens wide, ready to close */
  document.body.classList.add("dying");
  ui.dread.style.opacity=fall? 0.3:0.7;
  if(ui.deathfx){
    ui.deathfx.style.setProperty("--r","170%");
    ui.deathfx.style.opacity=1;
  }
}
/* respawn (or any restart) hands the screen back */
export function endDeathCam(){
  DEATH.active=false; DX=null;
  document.body.classList.remove("dying");
  if(ui.deathfx){ ui.deathfx.style.opacity=0; ui.deathfx.style.setProperty("--r","170%"); }
  ui.dread.style.opacity=0;
}
export function updateDeathCam(dt){
  if(!DEATH.active||!DX) return;
  DEATH.t+=dt;
  const t=DEATH.t;
  let x=DX.x, y=DX.y, z=DX.z, yaw=DX.yaw0, pitch=DX.pitch0, roll=0;
  /* forward, in the basis the rest of the game uses */
  const fx=-Math.sin(DX.yaw0), fz=-Math.cos(DX.yaw0);
  if(DX.fall){
    /* nothing caught you — the floor did not either. Keep going. */
    const f=t*6+t*t*5;
    y=DX.y-f;
    x=DX.x+fx*Math.min(t,1.2)*0.7;
    z=DX.z+fz*Math.min(t,1.2)*0.7;
    yaw=DX.yaw0+DX.spin*t*0.55;
    pitch=lerp(DX.pitch0,-1.05,seg(t,0,1.5));
    roll=DX.roll*0.5*seg(t,0.2,2.2);
    if(ui.deathfx) ui.deathfx.style.setProperty("--r",(170*(1-seg(t,0.3,2.3)))+"%");
  } else {
    /* the hit shoves you back off your feet… */
    const kick=seg(t,0,DTH_HIT);
    const back=0.42*kick+0.30*seg(t,DTH_HIT,DTH_LAND);
    x=DX.x-fx*back; z=DX.z-fz*back;
    /* …and then the legs go. A short bounce off the floor, then the sink. */
    const down=seg(t,DTH_HIT,DTH_LAND);
    y=lerp(DX.y,0.36,down)+0.10*kick*(1-kick)*4;
    if(t>DTH_LAND){
      const b=Math.max(0,1-(t-DTH_LAND)*3.4);
      y=0.36+0.085*b*Math.abs(Math.sin((t-DTH_LAND)*11))-0.07*seg(t,DTH_LAND,DTH_CARD+1.2);
    }
    roll=DX.roll*ease(down)+DX.roll*0.16*seg(t,DTH_LAND,DTH_CARD+1.4);
    /* the head turns to whatever is standing over you */
    const turn=seg(t,0.12,DTH_LAND+0.35);
    let kyaw=DX.yaw0, kpitch=0.42;
    if(DX.killer){
      const dx=DX.killer.x-x, dz=DX.killer.z-z;
      const hd=Math.max(0.6,Math.hypot(dx,dz));
      const ky=(DX.killer.y!==undefined? DX.killer.y:0)+DX.lookH;
      kyaw=Math.atan2(-dx,-dz);
      kpitch=clamp(Math.atan2(ky-y,hd),0.05,1.32);
    }
    yaw=angLerp(DX.yaw0,kyaw,turn);
    pitch=lerp(DX.pitch0,kpitch,turn);
    if(ui.deathfx) ui.deathfx.style.setProperty("--r",(170*(1-seg(t,0.9,2.75)))+"%");
    if(!DX.landed&&t>=DTH_LAND){ DX.landed=true; sfxBodyFall(); }
  }
  /* a dying body does not hold its head level */
  const jit=hash(Math.floor(t*9)*0.37)*0.012*(1-seg(t,0,2.4));
  camera.position.set(x,y,z);
  camera.rotation.order="YXZ";
  camera.rotation.y=yaw+jit; camera.rotation.x=pitch; camera.rotation.z=roll;
  if(!DX.carded&&t>=DTH_CARD){ DX.carded=true; if(DX.onCard) DX.onCard(); }
}
