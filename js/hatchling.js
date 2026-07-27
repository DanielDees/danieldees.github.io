/* ---------------- the brood — THE NEST's alarm system with legs ----------------
   A handful of cat-sized, photophobic hatchlings. Each patrols its own
   territory in the dark and hunts by sound. One that reaches you LATCHES:
   screen shake, stamina drain — and a continuous screech that tells the
   matriarch exactly where its child is. They are not the death in this
   level; they are the alarm. The lantern's beam physically drives them back. */
import { clamp, lerp, rand } from "./utils.js";
import { STATE, spider } from "./state.js";
import { CELL } from "./map.js";
import { scene, markShared, mergeStatic } from "./scene.js";
import { CAVE, cellAt3, hatchBlocked, worldToCell3, cellToWorld3, surfaceNoiseGain,
         floorYAt } from "./cave.js";
import { inBeam } from "./lantern.js";
import { AU, panTo, sfxHatchTap, startLatchScreech } from "./audio.js";

export const HATCH=[];
const paleMat=new THREE.MeshPhongMaterial({color:0xcfc4b0, specular:0x3a362c, shininess:20});
const paleDark=new THREE.MeshPhongMaterial({color:0x9a9080, specular:0x2a261e, shininess:14});
markShared(paleMat,paleDark);

const BODY_Y=0.19;
/* A spider leg is a KNEE, not a stick: the femur rises out of the hip, the
   tibia comes back down and the foot ends ON THE GROUND. The old leg was a
   single straight cylinder rotated +0.55 about z — positive z is UP, so
   every leg pointed at the vault and the walk cycle only ever raised them
   further. The whole brood was swimming on its back.
   Built as ONE geometry (a cylinder bent along a two-segment polyline) so a
   leg is still a single draw: 10 per hatchling, same as before. */
const FEM_L=0.20, FEM_A=0.50;                 // femur: length, radians ABOVE horizontal
const KNEE_H=Math.cos(FEM_A)*FEM_L, KNEE_V=Math.sin(FEM_A)*FEM_L;
const TIB_L=0.32, TIB_A=-Math.asin(Math.min(1,(BODY_Y+KNEE_V-0.017)/TIB_L));
function hatchLegGeo(){
  const L=FEM_L+TIB_L;
  const g=new THREE.CylinderGeometry(0.0125,0.005,L,5,9);
  const pos=g.attributes.position;
  const d1=[Math.cos(FEM_A),Math.sin(FEM_A)], d2=[Math.cos(TIB_A),Math.sin(TIB_A)];
  for(let i=0;i<pos.count;i++){
    const x=pos.getX(i), y=pos.getY(i)+L/2, z=pos.getZ(i);
    const s=clamp(y,0,L);
    /* walk the polyline: out along the femur, then down the tibia */
    let h,v,d;
    if(s<=FEM_L){ h=d1[0]*s; v=d1[1]*s; d=d1; }
    else { const k=s-FEM_L; h=KNEE_H+d2[0]*k; v=KNEE_V+d2[1]*k; d=d2; }
    /* the radial offset rides the segment's own normal, so the tube keeps
       its section through the bend instead of pinching at the knee */
    pos.setXYZ(i, h+x*d[1], v-x*d[0], z);
  }
  g.computeVertexNormals();
  return g;
}
/* module-level and reused by every hatchling of every visit — clearLevelScene
   disposes anything it isn't told to keep */
const LEG_GEO=markShared(hatchLegGeo());

/* ---- the face ----------------------------------------------------------
   They used to be built with nothing where eyes should be, and at hatchling
   scale that left two pale spheres with legs: a blob. They have their
   mother's eight eyes now, in her two rows, scaled down — and the eight of
   them are what makes a shape in the dark resolve as an ANIMAL. It costs
   the lore nothing: the eyes are why the light hurts, and a spider that
   hunts by sound in a cave 60m down has no more use for them than it ever
   did. They still catch the lantern from across a chamber, which is the
   point — a faint eyeshine emissive so a distant one is eight pinpricks
   before it is anything else.

   Head parts are placed by a POINT and a DIRECTION, the same rule the
   matriarch's face follows: an eye is seated by projecting its direction
   onto the cephalothorax ellipsoid (p = c + R·d̂), never by hand-picked
   xyz, and every spike is built along +Y from its base and then aimed — so
   a part cannot come out inside-out or buried under the skin.
   All of it merges into TWO geometries (one per material), so the whole
   face costs 2 draws, not 14. */
const eyeMat=new THREE.MeshPhongMaterial({color:0x14100e, emissive:0x1c0a05,
  specular:0xe8dcc4, shininess:110});
markShared(eyeMat);
const CEPH_C=[0,BODY_Y,0.08], CEPH_R=[0.09,0.072,0.09];
/* [dx,dy,dz, radius] — anterior median pair biggest, then the laterals,
   then the posterior row set higher and further back on the dome */
const EYES=[[0.22,0.16,0.96,0.017],[-0.22,0.16,0.96,0.017],
            [0.62,0.10,0.78,0.012],[-0.62,0.10,0.78,0.012],
            [0.28,0.62,0.74,0.013],[-0.28,0.62,0.74,0.013],
            [0.70,0.52,0.50,0.011],[-0.70,0.52,0.50,0.011]];
const _v=(a)=>new THREE.Vector3(a[0],a[1],a[2]);
/* the ellipsoid surface point in the direction d, and its outward normal */
function onCeph(d){
  const u=_v(d).normalize();
  return new THREE.Vector3(CEPH_C[0]+u.x*CEPH_R[0], CEPH_C[1]+u.y*CEPH_R[1],
                           CEPH_C[2]+u.z*CEPH_R[2]);
}
/* a tapered spike: built along +Y with its BASE at the origin, then aimed
   down `dir` — so it can only ever grow outward from where it is rooted */
function spike(r0,r1,len,from,dir){
  const geo=new THREE.CylinderGeometry(r1,r0,len,6);
  geo.translate(0,len/2,0);
  const m=new THREE.Mesh(geo);
  m.position.copy(from);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),_v(dir).normalize());
  return m;
}
function buildFace(){
  /* the dark set: eight lenses + the fang tips */
  const dark=[];
  const lensGeo=new THREE.SphereGeometry(1,7,6);
  for(const[dx,dy,dz,r]of EYES){
    const p=onCeph([dx,dy,dz]);
    const m=new THREE.Mesh(lensGeo);
    m.position.copy(p);
    m.lookAt(p.clone().add(_v([dx,dy,dz]).normalize()));   // local +z = the surface normal
    m.scale.set(r,r*0.86,r*0.5);                           // a flattened lens, not a bead
    dark.push(m);
  }
  /* the pale set: chelicerae under the front eyes, a pedipalp either side,
     and the low dorsal ridge that breaks the abdomen's bare sphere */
  const pale=[];
  for(const s of[-1,1]){
    const ch=spike(0.015,0.006,0.052,onCeph([s*0.28,-0.35,0.90]),[s*0.10,-0.86,0.50]);
    pale.push(ch);
    /* the fang hangs off the chelicera's tip, curling back under the mouth */
    const tip=ch.position.clone().add(_v([s*0.10,-0.86,0.50]).normalize().multiplyScalar(0.052));
    dark.push(spike(0.0055,0.0012,0.022,tip,[s*0.05,-0.93,0.36]));
    pale.push(spike(0.011,0.0065,0.088,onCeph([s*0.72,-0.20,0.64]),[s*0.52,-0.50,0.69]));
  }
  const ridge=new THREE.Mesh(new THREE.SphereGeometry(1,8,6));
  ridge.scale.set(0.062,0.030,0.115); ridge.position.set(0,BODY_Y+0.115,-0.145);
  pale.push(ridge);
  const dg=mergeStatic(dark,eyeMat).geometry, pg=mergeStatic(pale,paleDark).geometry;
  /* the eight lenses all share lensGeo — dedupe or it gets disposed nine times */
  const src=new Set(); for(const m of[...dark,...pale]) src.add(m.geometry);
  for(const s of src) s.dispose();
  return [markShared(dg),markShared(pg)];
}
const [EYE_GEO,FACE_GEO]=buildFace();

function makeHatchMesh(){
  const g=new THREE.Group();
  const abd=new THREE.Mesh(new THREE.SphereGeometry(0.13,10,8),paleMat);
  abd.scale.set(1,0.9,1.3); abd.position.set(0,BODY_Y+0.02,-0.13); g.add(abd);
  const ceph=new THREE.Mesh(new THREE.SphereGeometry(0.09,9,7),paleMat);
  ceph.scale.set(1,0.8,1); ceph.position.set(0,BODY_Y,0.08); g.add(ceph);
  g.add(new THREE.Mesh(EYE_GEO,eyeMat));
  g.add(new THREE.Mesh(FACE_GEO,paleDark));
  const legs=[];
  const PHI=[0.9,0.35,-0.25,-0.8];
  for(let side=0;side<2;side++)for(let i=0;i<4;i++){
    const phi=side===0? PHI[i] : Math.PI-PHI[i];
    const hip=new THREE.Group();
    hip.position.set((side===0?1:-1)*0.07, BODY_Y, 0.09-i*0.065);
    hip.rotation.y=-phi;
    /* the pose lives in the geometry now; fem only lifts the foot clear */
    const fem=new THREE.Group(); hip.add(fem);
    fem.add(new THREE.Mesh(LEG_GEO,paleDark));
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
      stepAcc:0, stepNext:rand(1.3,2.4), tapCD:0, screech:null,
    });
  }
}
export const anyLatched=()=>HATCH.some(h=>h.state==="latched");

/* try to move; slide along blocked cells. Returns the distance ACTUALLY
   covered — a hatchling wedged against rock has not taken a step, and the
   skitter scheduler must not think it has. */
function hatchMove(h,dx,dz,dt,spd){
  const l=Math.hypot(dx,dz)||1;
  const x0=h.pos.x, z0=h.pos.z;
  const nx=x0+dx/l*spd*dt, nz=z0+dz/l*spd*dt;
  const c=worldToCell3(nx,nz);
  if(!hatchBlocked(c.cx,c.cy)){ h.pos.x=nx; h.pos.z=nz; }
  else {
    const cx=worldToCell3(nx,h.pos.z), cz=worldToCell3(h.pos.x,nz);
    if(!hatchBlocked(cx.cx,cx.cy)) h.pos.x=nx;
    else if(!hatchBlocked(cz.cx,cz.cy)) h.pos.z=nz;
  }
  if(Math.abs(dx)>1e-4||Math.abs(dz)>1e-4) h.faceAng=Math.atan2(dx,dz);
  return Math.hypot(h.pos.x-x0, h.pos.z-z0);
}
/* one shared gate across the whole brood: six of them tapping independently
   is what turned the skitter bed into a bag of beads */
let tapGate=0;

export function updateHatchlings(dt){
  if(STATE.level!==2||STATE.dead||STATE.won) return;
  const frenzy=STATE.frenzyT>0;
  const px=STATE.pos.x, pz=STATE.pos.z;
  tapGate-=dt;
  /* A LIT LANTERN IS INVISIBILITY. They are eyeless and photophobic: the
     glow isn't something they see you by, it's something they get away
     from. So while it burns they cannot acquire you at all, and anything
     already coming breaks off and takes itself somewhere else. */
  const lampOn=STATE.lanternOn;
  /* the player's noise, as the small ones hear it */
  let hearR=0;
  if(STATE.cranking) hearR=20;
  else if(STATE.moving){
    const gain=surfaceNoiseGain(px,pz);
    hearR = STATE.crouch? 2.5 : (STATE.sprinting? 14:9)*gain;
  }
  if(frenzy) hearR*=2;
  if(lampOn) hearR=0;
  for(const h of HATCH){
    h.latchCD=Math.max(0,h.latchCD-dt);
    const dx=px-h.pos.x, dz=pz-h.pos.z, d=Math.hypot(dx,dz);
    /* the beam is the sun and they hate it */
    const beamed = h.state!=="latched" && inBeam(h.pos.x,floorYAt(h.pos.x,h.pos.z)+0.25,h.pos.z);
    /* lit up while hunting: break off now, and don't re-latch immediately */
    if(h.state==="approach"&&(beamed||lampOn)){
      h.state="flee";
      h.latchCD=Math.max(h.latchCD,1.5);
    }
    /* fire is a wall */
    let fireDx=0, fireDz=0, inFire=false;
    for(const f of CAVE.fires){
      const fdx=h.pos.x-f.x, fdz=h.pos.z-f.z, fd=Math.hypot(fdx,fdz);
      if(fd<6.5){ inFire=true; fireDx+=fdx/(fd||1); fireDz+=fdz/(fd||1); }
    }
    let movedSpd=0, moved=0;
    /* THE GLOW IS A PLACE THEY WILL NOT BE. While it burns, anything inside
       ~11.5m is walking out of it — recoiling hard inside the beam radius,
       drifting out beyond it — and the state machine is skipped entirely for
       that frame. That last part is the fix: the old code ran the pursuit
       move AND the shove, which summed to a 0.9 m/s creep away and left them
       orbiting the edge of the light with aggro still live. */
    const shy = lampOn && h.state!=="latched" && h.state!=="stun" && d<11.5;
    if(shy){
      const spd = beamed? 4.6:2.6;
      moved=hatchMove(h,-dx,-dz,dt,spd); movedSpd=spd;
      h.state="flee";
      /* NO RECOIL HISS. This used to fire sfxHatchHiss every 0.8–1.6s for
         as long as a hatchling stood in the glow — and that cue is five
         bright 5.2kHz ticks inside 200ms, so a couple of them backing out
         of the lantern was a bag of beads being shaken, at close to full
         volume, continuously. The brood gets two voices and no more: their
         footfalls, and the screech of one that's on you. Their reaction to
         the light is something you SEE. */
    }
    else switch(h.state){
      case "lurk":{
        h.wanderT-=dt;
        if(h.wanderT<=0){
          h.wanderT=rand(1.5,4.5);
          const a=Math.random()*Math.PI*2, rr=rand(0,8.5);   // wider chambers, wider rounds
          /* rounds are anchored on the nest — except while the lamp burns,
             when the nest itself may be sitting inside the glow. Anchoring
             there anyway walks it straight back into the light and it ends
             up pacing the keep-out radius, which is the standoff we just
             took out of the pursuit. Wander from where it is instead, and
             never pick a spot in the lit half. */
          const ax=lampOn? h.pos.x:h.home.x, az=lampOn? h.pos.z:h.home.z;
          let tx=ax+Math.cos(a)*rr, tz=az+Math.sin(a)*rr;
          if(lampOn&&Math.hypot(tx-px,tz-pz)<12.5){
            const b=Math.atan2(h.pos.z-pz,h.pos.x-px);
            tx=px+Math.cos(b)*rand(13,17); tz=pz+Math.sin(b)*rand(13,17);
          }
          h.tgt={x:tx, z:tz};
        }
        if(h.tgt){
          const tdx=h.tgt.x-h.pos.x, tdz=h.tgt.z-h.pos.z;
          if(Math.hypot(tdx,tdz)>0.4){ moved=hatchMove(h,tdx,tdz,dt,1.4); movedSpd=1.4; }
        }
        if(d<hearR&&h.latchCD<=0){ h.state="approach"; }
        break;
      }
      case "approach":{
        const spd=(frenzy?4.6:3.3);
        moved=hatchMove(h,dx,dz,dt,spd); movedSpd=spd;
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
          /* the screech cutting out IS the confirmation you got it off —
             the old one-shot here was the same five-tick rattle at 0.9 and
             dead-centre pan, i.e. the worst instance of it in the game */
          if(h.screech){ h.screech.stop(); h.screech=null; }
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
        /* clear of the light but the lamp is still burning: DON'T run the
           beeline home — half the nests sit inside the glow, and a
           hatchling sprinting back into it just bounced off the radius
           again. Go idle instead and wander; the shy rule keeps it out. */
        if(lampOn){ h.state="lurk"; h.wanderT=rand(0.6,1.8); h.tgt=null; }
        else if(hd<2.5) h.state="lurk";
        else { moved=hatchMove(h,hdx,hdz,dt,3.6); movedSpd=3.6; }
        if(!lampOn&&frenzy&&d<hearR&&h.latchCD<=0&&hd<8) h.state="approach";
        break;
      }
    }
    /* fire is still a wall even in the dark (never while latched) */
    if(h.state!=="latched"&&inFire){
      moved=Math.max(moved,hatchMove(h,fireDx,fireDz,dt,3.8));
      movedSpd=Math.max(movedSpd,3.8);
    }
    /* ---- render ---- */
    const u=h.mesh.userData;
    h.anim+=dt*(2+movedSpd*4.5);
    for(const leg of u.legs){
      const sw=Math.sin(h.anim+leg.phase);
      leg.hip.rotation.y=-leg.basePhi+sw*0.4*clamp(movedSpd/2,0,1);
      /* the stance pose is baked into the leg; this only picks the foot up
         off the rock on the swing half of the cycle (+z is UP, so it can
         only ever lift — a resting leg stays planted) */
      leg.fem.rotation.z=Math.max(0,Math.sin(h.anim+leg.phase+1.2))*0.30*clamp(movedSpd/2,0.06,1);
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
    /* Skitters: at distance, indistinguishable from dripwater — as long as
       they stay SPARSE. This used to accumulate intended speed, so a
       hatchling grinding against rock still "stepped", and it fired every
       0.15s while approaching; six of them at once was a bag of beads
       being shaken. Now it accumulates ground actually covered, over a
       randomized stride, behind a per-hatchling cooldown and one shared
       gate for the whole brood. */
    h.stepAcc+=moved;
    h.tapCD-=dt;
    if(h.stepAcc>=h.stepNext&&h.tapCD<=0&&tapGate<=0&&d<15){
      h.stepAcc=0; h.stepNext=rand(1.3,2.4); tapGate=0.22;
      /* the cooldown scales with range, so a hatchling three metres off in
         the dark still ticks often enough to be a warning while the ones
         across the chamber stay occasional. Flat and frequent is what made
         six of them sound like one bag of beads. */
      h.tapCD=rand(0.35,0.8)*(1+d*0.28);
      sfxHatchTap(Math.pow(clamp(1-d/15,0,1),1.6)*0.5, panTo(h.pos.x,h.pos.z));
    }
  }
}
/* death freezes the update loop, so any loop a hatchling is holding open
   would drone on under the death screen with nothing left to close it */
export function silenceHatchlings(){
  for(const h of HATCH) if(h.screech){ h.screech.stop(); h.screech=null; }
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
