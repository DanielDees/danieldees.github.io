/* ---------------- scripted cinematics: breaker fix & exit elevator ----------------
   Both sequences take the camera away from the player (main.js skips
   updatePlayer/updateFocus while CINE.active) and drive props, audio and
   the entity on a fixed timeline. The breaker scene keeps the entity AI
   running (it rushes the panel, freezing at a 30m ring); the elevator
   scene scripts the entity entirely. */
import { clamp, lerp, angLerp } from "./utils.js";
import { STATE, monster } from "./state.js";
import { worldToCell, isWall, losCells } from "./map.js";
import { camera, playerLight } from "./scene.js";
import { AU, panTo, sfxAlert, sfxStinger, sfxClunk, sfxPowerOn,
         sfxBoxOpen, sfxBoxClose, sfxFuseHum,
         sfxElevButton, sfxElevDing, sfxElevDoors, sfxElevThud, sfxElevJolt, sfxFloorBlip,
         startElevDescend, sfxElevRattle, sfxElevGrind, sfxLightsOut } from "./audio.js";
import { ui, toast, renderObjectives } from "./ui.js";
import { monsterRushTo } from "./monster.js";
import { exitDoor } from "./props.js";
import { win } from "./lifecycle.js";

export const CINE={active:false, kind:null, t:0};
let D=null;                                   // per-cutscene working data

const ease=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
const seg=(t,a,b)=>ease((t-a)/(b-a));
const hash=n=>{const s=Math.sin(n)*43758.5453;return s-Math.floor(s);};
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
    CINE.active=false; CINE.kind=null; D=null;
    monster.holdAt30=false; monster.held=false;
    return;
  }
  CINE.t+=dt;
  if(CINE.kind==="breaker") updateBreaker();
  else if(CINE.kind==="elev") updateElevator(dt);
}

/* ================= breaker: the fuse seats itself ================= */
/* ~3.6s: door swings open, the fuse fades in hovering and glides into the
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
  u.doorPivot.rotation.y = -2.05*seg(t,0.15,0.95)*(1-seg(t,2.55,3.25));
  const fuse=u.fuse;
  cue("conjure",1.0,()=>{ fuse.visible=true; sfxFuseHum(1.15); });
  if(t>=1.0){
    const fk=seg(t,1.05,2.0);
    fuse.position.lerpVectors(D.fuseFrom,D.fuseTo,fk);
    fuse.position.x+=Math.sin(t*5)*0.012*(1-fk);          // unsteady hover
    fuse.position.y+=Math.sin(t*3.3)*0.01*(1-fk);
    fuse.rotation.y=(1-fk)*0.5*Math.sin(t*2.1);
    const op=seg(t,1.0,1.35);
    fuse.traverse(o=>{ if(o.isMesh) o.material.opacity=op; });
  }
  cue("seat",2.05,()=>{
    sfxClunk(); sfxPowerOn();
    STATE.powerOn=true;
    u.lamp.material.color.set(0x39d24a);
    if(exitDoor) exitDoor.userData.sign.material.color.set(0xffffff);
    toast("POWER RESTORED. The exit elevator is live — find it.");
    renderObjectives();
  });
  if(t>=2.05) u.lever.position.y=lerp(-0.1,0.1,seg(t,2.05,2.3));
  cue("close",3.1,()=>sfxBoxClose());
  if(t>=3.6){
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
  /* ---- doors: open ramp minus close ramp; ±0.515 closed, 1.0m of travel
     pockets each leaf fully behind the flank walls ---- */
  const slide=seg(t,T_DOORS_O,T_DOORS_O+1.4)-seg(t,T_DOORS_C,T_DOORS_C+1.3);
  u.doorL.position.x=-(0.515+1.0*slide);
  u.doorR.position.x= (0.515+1.0*slide);
  /* ---- cab light: hue strobes only until the lights die at the lurch ---- */
  let inten=0.72*seg(t,3.5,4.3), col=[1,0.93,0.78];
  if(t>=T_HAY && t<T_LURCH){
    /* the hue snaps between blood-red and normal, faster and harder */
    const st=Math.floor(t*16);
    if(hash(st)< 0.35+0.3*seg(t,T_HAY,T_LURCH)) col=[1,0.16,0.10];
    inten=0.78*(0.55+hash(st*1.7+9)*0.55);
  }
  if(t>=T_LURCH){ col=[1,0.13,0.07]; inten=0.18; }            // emergency light only
  u.cabLight.intensity=inten;
  u.cabLight.color.setRGB(col[0],col[1],col[2]);
  const pb=clamp(inten/0.72,0,1)*0.85+0.08;
  u.cabLightMat.color.setRGB(col[0]*pb,col[1]*pb,col[2]*pb);
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
  cue("ding",T_DING,()=>sfxElevDing());
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
    win();
    /* hold black a beat under the win sheet, then let it lift */
    setTimeout(()=>{ ui.flash.style.transition="opacity 2.5s";
      ui.flash.style.opacity=0; },600);
  }
}
