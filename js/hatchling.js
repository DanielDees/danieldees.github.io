/* ---------------- the brood — THE NEST's alarm system with legs ----------------
   A handful of cat-sized, eyeless, photophobic hatchlings. Each patrols its
   own territory in the dark and hunts by sound. One that reaches you LATCHES:
   screen shake, stamina drain — and a continuous screech that tells the
   matriarch exactly where its child is. They are not the death in this
   level; they are the alarm. The lantern's beam physically drives them back. */
import { clamp, lerp, rand } from "./utils.js";
import { STATE, spider } from "./state.js";
import { CELL } from "./map.js";
import { scene, markShared } from "./scene.js";
import { CAVE, cellAt3, hatchBlocked, worldToCell3, cellToWorld3, surfaceNoiseGain,
         floorYAt } from "./cave.js";
import { inBeam } from "./lantern.js";
import { AU, panTo, sfxHatchTap, sfxHatchHiss, startLatchScreech } from "./audio.js";

export const HATCH=[];
const paleMat=new THREE.MeshPhongMaterial({color:0xcfc4b0, specular:0x3a362c, shininess:20});
const paleDark=new THREE.MeshPhongMaterial({color:0x9a9080, specular:0x2a261e, shininess:14});
markShared(paleMat,paleDark);

function makeHatchMesh(){
  const g=new THREE.Group();
  const BODY_Y=0.19;
  const abd=new THREE.Mesh(new THREE.SphereGeometry(0.13,10,8),paleMat);
  abd.scale.set(1,0.9,1.3); abd.position.set(0,BODY_Y+0.02,-0.13); g.add(abd);
  const ceph=new THREE.Mesh(new THREE.SphereGeometry(0.09,9,7),paleMat);
  ceph.scale.set(1,0.8,1); ceph.position.set(0,BODY_Y,0.08); g.add(ceph);
  /* no eyes. Nothing where eyes should be. */
  const legGeo=new THREE.CylinderGeometry(0.012,0.006,0.4,5);
  legGeo.rotateZ(-Math.PI/2); legGeo.translate(0.2,0,0);
  const legs=[];
  const PHI=[0.9,0.35,-0.25,-0.8];
  for(let side=0;side<2;side++)for(let i=0;i<4;i++){
    const phi=side===0? PHI[i] : Math.PI-PHI[i];
    const hip=new THREE.Group();
    hip.position.set((side===0?1:-1)*0.07, BODY_Y, 0.09-i*0.065);
    hip.rotation.y=-phi;
    const fem=new THREE.Group(); fem.rotation.z=0.55; hip.add(fem);
    fem.add(new THREE.Mesh(legGeo,paleDark));
    g.add(hip);
    legs.push({hip,fem,basePhi:phi,phase:(i%2===0)===(side===0)?0:Math.PI});
  }
  g.userData={legs, BODY_Y, animated:true};
  return g;
}

export function makeHatchlings(){
  HATCH.length=0;
  /* one per brood + a tunnel wanderer or two */
  const homes=CAVE.broods.map(b=>({x:b.center.x, z:b.center.z}));
  for(let i=0;i<2;i++){
    const c=CAVE.reachList[Math.floor(Math.random()*CAVE.reachList.length)];
    const p=cellToWorld3(c.cx,c.cy);
    homes.push({x:p.x, z:p.z});
  }
  for(const home of homes){
    const mesh=makeHatchMesh();
    /* spawn a little off the exact nest so a burn never strands it in fire */
    const a=Math.random()*Math.PI*2;
    const pos=new THREE.Vector3(home.x+Math.cos(a)*2.2, 0, home.z+Math.sin(a)*2.2);
    if(cellAt3(pos.x,pos.z)===1||cellAt3(pos.x,pos.z)===5){ pos.set(home.x,0,home.z); }
    mesh.position.copy(pos);
    scene.add(mesh);
    HATCH.push({
      pos, home, mesh,
      state:"lurk",                    // lurk | approach | latched | stun | flee
      wanderT:0, tgt:null, anim:Math.random()*7,
      faceAng:Math.random()*7, latchCD:0, stunT:0,
      burnT:0, shake:0, prevYaw:STATE.yaw,
      hissCD:0, stepAcc:0, screech:null,
    });
  }
}
export const anyLatched=()=>HATCH.some(h=>h.state==="latched");

/* try to move; slide along blocked cells */
function hatchMove(h,dx,dz,dt,spd){
  const l=Math.hypot(dx,dz)||1;
  const nx=h.pos.x+dx/l*spd*dt, nz=h.pos.z+dz/l*spd*dt;
  const c=worldToCell3(nx,nz);
  if(!hatchBlocked(c.cx,c.cy)){ h.pos.x=nx; h.pos.z=nz; }
  else {
    const cx=worldToCell3(nx,h.pos.z), cz=worldToCell3(h.pos.x,nz);
    if(!hatchBlocked(cx.cx,cx.cy)) h.pos.x=nx;
    else if(!hatchBlocked(cz.cx,cz.cy)) h.pos.z=nz;
  }
  if(Math.abs(dx)>1e-4||Math.abs(dz)>1e-4) h.faceAng=Math.atan2(dx,dz);
}

export function updateHatchlings(dt){
  if(STATE.level!==2||STATE.dead||STATE.won) return;
  const frenzy=STATE.frenzyT>0;
  const px=STATE.pos.x, pz=STATE.pos.z;
  /* the player's noise, as the small ones hear it */
  let hearR=0;
  if(STATE.cranking) hearR=20;
  else if(STATE.moving){
    const gain=surfaceNoiseGain(px,pz);
    hearR = STATE.crouch? 2.5 : (STATE.sprinting? 14:9)*gain;
  }
  if(frenzy) hearR*=2;
  for(const h of HATCH){
    h.latchCD=Math.max(0,h.latchCD-dt);
    h.hissCD-=dt;
    const dx=px-h.pos.x, dz=pz-h.pos.z, d=Math.hypot(dx,dz);
    /* the beam is the sun and they hate it */
    const beamed = h.state!=="latched" && inBeam(h.pos.x,floorYAt(h.pos.x,h.pos.z)+0.25,h.pos.z);
    /* fire is a wall */
    let fireDx=0, fireDz=0, inFire=false;
    for(const f of CAVE.fires){
      const fdx=h.pos.x-f.x, fdz=h.pos.z-f.z, fd=Math.hypot(fdx,fdz);
      if(fd<6.5){ inFire=true; fireDx+=fdx/(fd||1); fireDz+=fdz/(fd||1); }
    }
    let movedSpd=0;
    switch(h.state){
      case "lurk":{
        h.wanderT-=dt;
        if(h.wanderT<=0){
          h.wanderT=rand(1.5,4.5);
          const a=Math.random()*Math.PI*2, rr=rand(0,8.5);   // wider chambers, wider rounds
          h.tgt={x:h.home.x+Math.cos(a)*rr, z:h.home.z+Math.sin(a)*rr};
        }
        if(h.tgt){
          const tdx=h.tgt.x-h.pos.x, tdz=h.tgt.z-h.pos.z;
          if(Math.hypot(tdx,tdz)>0.4){ hatchMove(h,tdx,tdz,dt,1.4); movedSpd=1.4; }
        }
        if(d<hearR&&h.latchCD<=0){ h.state="approach"; }
        break;
      }
      case "approach":{
        const spd=(frenzy?4.6:3.3);
        hatchMove(h,dx,dz,dt,spd); movedSpd=spd;
        /* lost you: too quiet, too far, or too far from home */
        const leash=frenzy? 999 : 30;
        if((d>hearR+6&&d>7) || Math.hypot(h.pos.x-h.home.x,h.pos.z-h.home.z)>leash){
          h.state="flee";
        }
        if(d<0.7&&h.latchCD<=0&&!anyLatched()){
          /* it's on you */
          h.state="latched"; h.burnT=0; h.shake=0; h.prevYaw=STATE.yaw;
          h.screech=startLatchScreech();
        }
        break;
      }
      case "latched":{
        /* riding your shoulder: stamina bleeds (faster than rest restores
           it — a passenger is never free), and the parent listens */
        STATE.stamina=Math.max(0,STATE.stamina-dt*0.30);
        spider.lastKnown=STATE.pos.clone();
        /* shaking it: whip the view side to side */
        let dy=STATE.yaw-h.prevYaw;
        while(dy>Math.PI)dy-=Math.PI*2; while(dy<-Math.PI)dy+=Math.PI*2;
        h.prevYaw=STATE.yaw;
        h.shake=Math.max(0,h.shake+Math.abs(dy)-dt*2.4);
        /* burning it: the lantern's glass is right there */
        if(STATE.lanternOn) h.burnT+=dt; else h.burnT=Math.max(0,h.burnT-dt*0.5);
        if(h.shake>5.5||h.burnT>1.1){
          h.state="stun"; h.stunT=2.2; h.latchCD=16;
          if(h.screech){ h.screech.stop(); h.screech=null; }
          sfxHatchHiss(0.9,0);
          const a=Math.random()*Math.PI*2;
          h.pos.set(px+Math.cos(a)*1.6, 0, pz+Math.sin(a)*1.6);
          const c=worldToCell3(h.pos.x,h.pos.z);
          if(hatchBlocked(c.cx,c.cy)) h.pos.set(px,0,pz);
        }
        break;
      }
      case "stun":
        h.stunT-=dt;
        if(h.stunT<=0) h.state="flee";
        break;
      case "flee":{
        const hdx=h.home.x-h.pos.x, hdz=h.home.z-h.pos.z, hd=Math.hypot(hdx,hdz);
        if(hd<2.5) h.state="lurk";
        else { hatchMove(h,hdx,hdz,dt,3.6); movedSpd=3.6; }
        if(frenzy&&d<hearR&&h.latchCD<=0&&hd<8) h.state="approach";
        break;
      }
    }
    /* repulsion overrides (never while latched) */
    if(h.state!=="latched"){
      if(beamed){
        hatchMove(h,-dx,-dz,dt,4.2); movedSpd=Math.max(movedSpd,4.2);
        if(h.hissCD<=0){ h.hissCD=rand(0.8,1.6);
          sfxHatchHiss(clamp(1-d/12,0.1,1), panTo(h.pos.x,h.pos.z)); }
      }
      if(inFire){ hatchMove(h,fireDx,fireDz,dt,3.8); movedSpd=Math.max(movedSpd,3.8); }
    }
    /* ---- render ---- */
    const u=h.mesh.userData;
    h.anim+=dt*(2+movedSpd*4.5);
    for(const leg of u.legs){
      const sw=Math.sin(h.anim+leg.phase);
      leg.hip.rotation.y=-leg.basePhi+sw*0.4*clamp(movedSpd/2,0,1);
      leg.fem.rotation.z=0.55+Math.max(0,Math.sin(h.anim+leg.phase+1.2))*0.4*clamp(movedSpd/2,0.15,1);
    }
    if(h.state==="latched"){
      /* clinging at the edge of your vision */
      const ry=STATE.yaw;
      h.pos.set(px,0,pz);
      h.mesh.position.set(
        px-Math.sin(ry)*0.32+Math.cos(ry)*0.26,
        STATE.y+1.08+Math.sin(h.anim*3)*0.02,
        pz-Math.cos(ry)*0.32-Math.sin(ry)*0.26);
      h.mesh.rotation.set(rand(-0.1,0.1), ry+Math.PI+Math.sin(h.anim*2)*0.2, 0.4);
    } else {
      const bob=Math.abs(Math.sin(h.anim*2))*0.02*clamp(movedSpd/2,0,1);
      h.mesh.position.set(h.pos.x, floorYAt(h.pos.x,h.pos.z)+bob, h.pos.z);
      h.mesh.rotation.set(h.state==="stun"? 2.8:0, h.faceAng, 0);
    }
    /* skitters: at distance, indistinguishable from dripwater */
    h.stepAcc+=movedSpd*dt;
    if(h.stepAcc>0.5&&d<24){
      h.stepAcc=0;
      sfxHatchTap(clamp(1-d/22,0,1)*0.5, panTo(h.pos.x,h.pos.z));
    }
  }
}
export function resetHatchlings(){
  for(const h of HATCH){
    if(h.screech){ h.screech.stop(); h.screech=null; }
    h.state="lurk"; h.latchCD=8;
    h.pos.set(h.home.x,0,h.home.z);
    h.mesh.position.copy(h.pos);
    h.mesh.rotation.set(0,0,0);
  }
}
