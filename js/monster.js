/* ---------------- the entity ---------------- */
import { clamp, lerp, angLerp, rand } from "./utils.js";
import { STATE, monster } from "./state.js";
import { W, H, cellToWorld, worldToCell, isWall, losCells, bfsPath, randomOpenCell, farOpenWorldPoint } from "./map.js";
import { AU, panTo, sfxAlert, sfxStinger, sfxGroan, sfxHeartbeat, sfxKnock } from "./audio.js";
import { ui, toast } from "./ui.js";
import { die } from "./lifecycle.js";

export function makeMonster(){
  const skin=new THREE.MeshPhongMaterial({color:0x5d513a, specular:0x131008, shininess:10});
  const dark=new THREE.MeshPhongMaterial({color:0x2c2418, specular:0x000000, shininess:1});
  const g=new THREE.Group();
  const torso=new THREE.Mesh(new THREE.CylinderGeometry(0.22,0.3,1.5,8),skin);
  torso.position.y=1.9; torso.scale.z=0.7; g.add(torso);
  g.userData.torso=torso;
  const head=new THREE.Mesh(new THREE.SphereGeometry(0.24,10,10),skin);
  head.scale.set(0.8,1.9,0.85); head.position.y=3.0; head.rotation.z=0.16; g.add(head);
  g.userData.head=head;
  const mouth=new THREE.Mesh(new THREE.SphereGeometry(0.09,8,8),dark);
  mouth.scale.set(0.8,1.6,0.5); mouth.position.set(0,2.86,0.17); g.add(mouth);
  const armG=new THREE.CylinderGeometry(0.055,0.045,1.8,6);
  armG.translate(0,-0.9,0); // shoulder pivot (shared by both arms)
  const aL=new THREE.Mesh(armG,skin), aR=new THREE.Mesh(armG,skin);
  aL.position.set(-0.34,2.6,0); aR.position.set(0.34,2.6,0);
  g.add(aL); g.add(aR);
  g.userData.armL=aL; g.userData.armR=aR;
  const legG=new THREE.CylinderGeometry(0.08,0.06,1.3,6);
  legG.translate(0,-0.65,0); // hip pivot
  const lL=new THREE.Mesh(legG,skin), lR=new THREE.Mesh(legG,skin);
  lL.position.set(-0.13,1.3,0); lR.position.set(0.13,1.3,0);
  g.add(lL); g.add(lR);
  g.userData.legL=lL; g.userData.legR=lR;
  g.scale.setScalar(1.12);
  g.visible=false;
  return g;
}

/* ---------------- monster AI ---------------- */
export function wakeMonster(){
  monster.active=true; monster.mesh.visible=true;
  const p=farOpenWorldPoint(STATE.pos.x,STATE.pos.z,40);
  monster.pos.set(p.x,0,p.z);
  monster.groanT=2.5;
  toast("…Something, far off, has shifted. It knows things are being moved.",4200);
}
export function monsterCanSee(){
  const d=monster.pos.distanceTo(STATE.pos);
  let range = STATE.crouch? 9 : 16;
  if(STATE.sprinting&&STATE.moving) range=22;
  if(d>range) return false;
  if(STATE.crouch && d>6 && !STATE.moving) return false;
  return losCells(monster.pos.x,monster.pos.z,STATE.pos.x,STATE.pos.z);
}
function monsterHears(){
  if(!STATE.moving) return false;
  const d=monster.pos.distanceTo(STATE.pos);
  if(STATE.sprinting) return d<26;
  if(!STATE.crouch) return d<8;
  return false;
}
function setPathTo(wx,wz){
  const a=worldToCell(monster.pos.x,monster.pos.z), b=worldToCell(wx,wz);
  const p=bfsPath(a.cx,a.cy,clamp(b.cx,0,W-1),clamp(b.cy,0,H-1));
  monster.path = p? p.map(c=>cellToWorld(c.cx,c.cy)) : [];
  if(monster.path.length>1) monster.path.shift();
}
function startAlert(){
  monster.state="alert";
  monster.alertT=rand(0.55,0.9);
  monster.path=[];
  sfxAlert();
}
const SPEED_TARGETS={wander:2.0, investigate:3.4, alert:0, chase:6.4, hunt:3.4};
export function updateMonster(dt){
  if(!monster.active||STATE.dead||STATE.won) return;
  const m=monster;
  const dx=STATE.pos.x-m.pos.x, dz=STATE.pos.z-m.pos.z;
  const d=Math.hypot(dx,dz);
  m.repath-=dt;
  const sees=monsterCanSee(), hears=monsterHears();
  if(sees) m.lastSeen=STATE.pos.clone();

  /* ---- state transitions ---- */
  switch(m.state){
    case "wander":
      if(sees) startAlert();
      else if(hears){ m.state="investigate"; m.lastSeen=STATE.pos.clone(); m.repath=0; }
      break;
    case "investigate":
      if(sees) startAlert();
      else if(m.lastSeen && m.pos.distanceTo(m.lastSeen)<1.5){ m.state="wander"; m.path=[]; }
      break;
    case "alert":
      m.alertT-=dt;
      m.faceAng=Math.atan2(dx,dz);                  // turn toward the player
      if(m.alertT<=0){
        if(sees){ m.state="chase"; sfxStinger(); toast("RUN.",1500); }
        else    { m.state="hunt"; m.searchT=6; }
      }
      break;
    case "chase":
      if(!sees){ m.state="hunt"; m.searchT=6; }
      break;
    case "hunt":
      if(sees){ m.state="chase"; }                  // re-acquire without a fresh alert
      else {
        const arrived = m.lastSeen && m.pos.distanceTo(m.lastSeen)<1.5;
        m.searchT -= dt*(arrived?2.5:1);
        if(m.searchT<=0){ m.state="wander"; m.path=[]; toast("…it gave up. Breathe.",2600); }
      }
      break;
  }

  /* ---- speed ramps: accelerate into a chase, wind down out of one ---- */
  const tgtSpeed=SPEED_TARGETS[m.state];
  const rate = tgtSpeed>m.curSpeed? 3.6 : 5.0;      // ~1.8s 0→full, quicker to slow
  m.curSpeed += clamp(tgtSpeed-m.curSpeed, -rate*dt, rate*dt);

  /* ---- pathing ---- */
  if(m.state==="chase"){
    if(m.repath<=0){ setPathTo(STATE.pos.x,STATE.pos.z); m.repath=0.4; }
  } else if(m.state==="hunt"||m.state==="investigate"){
    if(m.repath<=0&&m.lastSeen){ setPathTo(m.lastSeen.x,m.lastSeen.z); m.repath=0.8; }
  } else if(m.state==="wander"){
    if(m.pauseT>0){ m.pauseT-=dt; }                 // it sometimes just… stands there
    else if(m.path.length===0&&m.repath<=0){
      const cc=worldToCell(m.pos.x,m.pos.z);
      const byWall=isWall(cc.cx+1,cc.cy)||isWall(cc.cx-1,cc.cy)||isWall(cc.cx,cc.cy+1)||isWall(cc.cx,cc.cy-1);
      if(Math.random()<(byWall?0.6:0.4)){ m.pauseT=rand(2,5.5); m.repath=0.2; }
      else {
        const c=randomOpenCell(0), p=cellToWorld(c.cx,c.cy);
        setPathTo(p.x,p.z); m.repath=1.5;
      }
    }
  }

  /* ---- movement (real displacement drives the animation) ---- */
  const prevX=m.pos.x, prevZ=m.pos.z;
  if(m.curSpeed>0.05){
    if(m.path.length){
      const wp=m.path[0], wx=wp.x-m.pos.x, wz=wp.z-m.pos.z, wl=Math.hypot(wx,wz);
      if(wl<0.5) m.path.shift();
      else { m.pos.x+=wx/wl*m.curSpeed*dt; m.pos.z+=wz/wl*m.curSpeed*dt; m.faceAng=Math.atan2(wx,wz); }
    } else if(m.state==="chase"){
      const dl=d||1;
      m.pos.x+=dx/dl*m.curSpeed*dt; m.pos.z+=dz/dl*m.curSpeed*dt; m.faceAng=Math.atan2(dx,dz);
    }
  }
  const movedSpeed=Math.hypot(m.pos.x-prevX,m.pos.z-prevZ)/Math.max(dt,1e-5);

  /* ---- animation: walk cycle scales with actual velocity, idle breathes ---- */
  const u=m.mesh.userData, sp01=clamp(movedSpeed/6.4,0,1);
  m.anim += dt*(1.5+movedSpeed*1.6);
  const swingAmp=clamp(movedSpeed/2.5,0,1)*0.7;
  const sw=Math.sin(m.anim)*swingAmp;
  u.armL.rotation.x =  sw; u.armR.rotation.x = -sw;
  u.legL.rotation.x = -sw*0.85; u.legR.rotation.x =  sw*0.85;
  const tNow=performance.now()/1000;
  const breath=1+Math.sin(tNow*1.1)*0.025*(1-sp01); // idle breathing only when still
  u.torso.scale.set(1,breath,0.7);
  u.head.rotation.z = 0.16 + Math.sin(tNow*0.6)*0.07*(1-sp01) + Math.sin(m.anim*0.5)*0.08*sp01;
  m.mesh.position.set(m.pos.x, Math.abs(Math.sin(m.anim))*0.06*sp01, m.pos.z);
  const turnRate = m.state==="alert"? 0.16 : 0.1;   // deliberate, unsettling turn
  m.mesh.rotation.y = angLerp(m.mesh.rotation.y, m.faceAng, 1-Math.pow(1-turnRate,dt*60));

  if(d<1.25) die();

  /* ---- wall knocking: when it lingers, it raps on the nearest wall ---- */
  const stationary = movedSpeed<0.25 && (m.state==="wander"||m.state==="hunt");
  if(stationary){
    m.knockT-=dt;
    if(m.knockT<=0){
      m.knockT=rand(2.5,6);
      const c=worldToCell(m.pos.x,m.pos.z);
      let wallDir=null;
      for(const[wx,wy]of[[1,0],[-1,0],[0,1],[0,-1]])
        if(isWall(c.cx+wx,c.cy+wy)){wallDir=[wx,wy];break;}
      if(wallDir){
        m.faceAng=Math.atan2(wallDir[0],wallDir[1]);     // turns to the wall first
        /* near-global volume: gentle falloff keeps a sense of distance &
           direction without ever making the knocks easy to miss */
        const vol=0.5*(0.45+0.55*clamp(1-d/80,0,1));
        sfxKnock(vol, 2+Math.floor(Math.random()*3), panTo(m.pos.x,m.pos.z));
      }
    }
  } else m.knockT=Math.max(m.knockT,1.4);   // brief settle time after it stops

  /* ---- continuous audio: breathing, groans, proximity bed, heartbeat ---- */
  const prox = clamp(1 - d/22, 0, 1);
  if(AU.ctx){
    const t=AU.ctx.currentTime;
    const bedGain = (m.state==="chase"||m.state==="alert")? prox*0.30 : prox*0.14;
    AU.proxGain.gain.setTargetAtTime(bedGain, t, 0.25);
    AU.proxOsc.frequency.setTargetAtTime(46+prox*30, t, 0.4);
    const breathTarget = (m.state==="chase")? clamp(1-d/28,0,1)*0.45 : clamp(1-d/18,0,1)*0.20;
    AU.breathGain.gain.setTargetAtTime(breathTarget, t, 0.35);
  }
  m.groanT-=dt;
  if(m.groanT<=0){
    m.groanT=rand(7,15);
    if(d<48) sfxGroan(clamp(1-d/48,0.04,1)*(m.state==="chase"?0.45:0.25));
  }
  ui.dread.style.opacity = m.state==="chase"? (0.35+prox*0.6) : prox*0.55;
  AU.heartTimer-=dt;
  if(prox>0.25 && AU.heartTimer<=0){ sfxHeartbeat(); AU.heartTimer = lerp(1.4,0.45,prox); }
}
