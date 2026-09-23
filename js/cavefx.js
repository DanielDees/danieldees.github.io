/* ---------------- THE NEST: water that moves ----------------
   The cave had a drip SOUND on a timer and not one drop of water you could
   see. Now every hanging formation is catalogued as it is built (its tip),
   the drip scheduler picks one near you, and the sound belongs to a drop:
   a bead of water swells on the tip, lets go, falls as a glinting streak,
   and lands — a ripple ring spreading on the floor or the stream, a few
   droplets kicked up — and the plink plays from where it landed, panned and
   attenuated, when it lands.

   The tips also carry a STANDING bead each, merged into one mesh: the thing
   that makes a stalactite read as wet from across a chamber is the pinpoint
   of lantern caught at its end. */
import { rand, clamp } from "./utils.js";
import { scene, camera, markShared } from "./scene.js";
import { STATE } from "./state.js";
import { AU, panTo } from "./audio.js";
import { makeMoteSystem, makeDustSystem } from "./particles.js";

const beadMat=new THREE.MeshPhongMaterial({color:0x0b1215, specular:0xe8f4f8, shininess:120,
  emissive:0x061012});
/* a drop in flight is a streak of caught light, not a lit sphere: at a
   centimetre across it is three pixels, and dark water between two lamps is
   simply not there */
const fallMat=new THREE.MeshBasicMaterial({color:0x9cc4ce, transparent:true, opacity:0.55,
  blending:THREE.AdditiveBlending, depthWrite:false});
const ringMat=new THREE.MeshBasicMaterial({color:0x9fc0c8, transparent:true, opacity:0,
  blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.DoubleSide});
markShared(beadMat,fallMat);
const BEAD=markShared(new THREE.SphereGeometry(1,8,6));

const W={tips:[], drops:null, dropArr:[], rings:[], floorAt:null, waterAt:null};
const _o=new THREE.Object3D();
const N_DROP=18, N_RING=6;

/* `tips` [{x,y,z}] are the hanging tips; floorAt(x,z) is where a drop lands
   and waterAt(x,z) says whether it lands in the stream */
export function initDrips(tips,floorAt,waterAt){
  W.tips=tips; W.floorAt=floorAt; W.waterAt=waterAt;
  /* the standing beads: most tips carry one */
  const beads=[];
  for(const t of tips){
    if(Math.random()<0.3) continue;
    const r=rand(0.008,0.014), m=new THREE.Mesh(BEAD);
    m.scale.set(r,r*1.35,r); m.position.set(t.x,t.y-r*1.1,t.z);
    beads.push(m);
  }
  if(beads.length){
    const geo=new THREE.BufferGeometry();
    const pos=[], nor=[], idx=[];
    const P=BEAD.attributes.position, Nn=BEAD.attributes.normal, I=BEAD.index;
    for(const m of beads){
      m.updateMatrix(); const o=pos.length/3;
      for(let i=0;i<P.count;i++){
        const v=new THREE.Vector3(P.getX(i),P.getY(i),P.getZ(i)).applyMatrix4(m.matrix);
        pos.push(v.x,v.y,v.z); nor.push(Nn.getX(i),Nn.getY(i),Nn.getZ(i));
      }
      for(let i=0;i<I.count;i++) idx.push(I.getX(i)+o);
    }
    geo.setAttribute("position",new THREE.Float32BufferAttribute(pos,3));
    geo.setAttribute("normal",new THREE.Float32BufferAttribute(nor,3));
    geo.setIndex(idx);
    scene.add(new THREE.Mesh(geo,beadMat));
  }
  /* the falling drops (and the spray a landing kicks up) */
  W.drops=new THREE.InstancedMesh(BEAD,fallMat,N_DROP);
  W.drops.frustumCulled=false; W.drops.userData.animated=true;
  W.dropArr=[];
  for(let i=0;i<N_DROP;i++){ W.dropArr.push({on:false}); park(i); }
  W.drops.instanceMatrix.needsUpdate=true;
  scene.add(W.drops);
  /* ripple rings, parked invisible (a hidden mesh costs no draw) */
  W.rings=[];
  const rg=new THREE.RingGeometry(0.8,1,28);
  rg.rotateX(-Math.PI/2);
  for(let i=0;i<N_RING;i++){
    const m=new THREE.Mesh(rg,ringMat.clone());
    m.visible=false; m.userData.animated=true; m.renderOrder=-1;
    scene.add(m); W.rings.push({m,t:0,on:false});
  }
}
function park(i){ _o.position.set(0,-80,0); _o.scale.setScalar(0.0001); _o.updateMatrix(); W.drops.setMatrixAt(i,_o.matrix); }
function freeDrop(){ const i=W.dropArr.findIndex(d=>!d.on); return i; }

/* let one go from a tip near the player (called by the drip scheduler) */
export function releaseDrip(){
  if(!W.drops||!W.tips.length) return false;
  const px=STATE.pos.x, pz=STATE.pos.z;
  let pick=null;
  for(let k=0;k<14;k++){
    const t=W.tips[Math.floor(Math.random()*W.tips.length)];
    const d=Math.hypot(t.x-px,t.z-pz);
    if(d<16&&d>0.6){ pick=t; break; }
  }
  if(!pick) return false;
  const i=freeDrop(); if(i<0) return false;
  W.dropArr[i]={on:true, kind:"drop", x:pick.x, y:pick.y-0.012, z:pick.z, vx:0, vy:0, vz:0,
    swell:0.35, r:0.011, ground:W.floorAt(pick.x,pick.z), water:W.waterAt(pick.x,pick.z)};
  return true;
}
function splash(d){
  const ring=W.rings.find(r=>!r.on);
  if(ring){
    ring.on=true; ring.t=0; ring.water=d.water;
    ring.m.position.set(d.x,d.ground+(d.water?0.012:0.006),d.z);
    ring.m.visible=true;
  }
  for(let k=0;k<(d.water?4:3);k++){
    const i=freeDrop(); if(i<0) break;
    const a=Math.random()*Math.PI*2, v=rand(0.3,0.8);
    W.dropArr[i]={on:true, kind:"spray", x:d.x, y:d.ground+0.01, z:d.z,
      vx:Math.cos(a)*v, vy:rand(0.9,1.6), vz:Math.sin(a)*v, r:rand(0.003,0.006), ground:d.ground, life:0.6};
  }
  /* the plink belongs to where it landed */
  if(AU.cave&&AU.cave.drip){
    const dist=Math.hypot(d.x-STATE.pos.x,d.z-STATE.pos.z);
    AU.cave.drip(panTo(d.x,d.z), clamp(1.15-dist/17,0.12,1));
  }
}
export function updateDrips(dt){
  if(!W.drops) return;
  let dirty=false;
  W.dropArr.forEach((d,i)=>{
    if(!d.on) return;
    dirty=true;
    if(d.kind==="drop"&&d.swell>0){               // the bead fattens, then lets go
      d.swell-=dt;
      const k=1+0.5*(1-Math.max(0,d.swell)/0.35);
      _o.position.set(d.x,d.y-d.r*k*0.3,d.z); _o.scale.set(d.r*k,d.r*k*1.3,d.r*k);
    } else {
      d.vy-=9.8*dt; d.x+=d.vx*dt; d.y+=d.vy*dt; d.z+=d.vz*dt;
      if(d.kind==="spray"){ d.life-=dt; if(d.life<=0||d.y<d.ground){ d.on=false; park(i); return; } }
      else if(d.y<=d.ground){ d.on=false; park(i); splash(d); return; }
      /* a falling drop is a streak: stretched along its own speed */
      const st=d.kind==="drop"? clamp(-d.vy*0.02,1,7) : 1;
      _o.position.set(d.x,d.y,d.z); _o.scale.set(d.r*0.8,d.r*1.3*st,d.r*0.8);
    }
    _o.rotation.set(0,0,0); _o.updateMatrix(); W.drops.setMatrixAt(i,_o.matrix);
  });
  if(dirty) W.drops.instanceMatrix.needsUpdate=true;
  for(const r of W.rings){
    if(!r.on) continue;
    r.t+=dt;
    const k=r.t/(r.water? 1.3:0.7);
    if(k>=1){ r.on=false; r.m.visible=false; continue; }
    const s=0.03+k*(r.water? 0.42:0.22);
    r.m.scale.set(s,1,s);
    r.m.material.opacity=Math.pow(1-k,1.5)*(r.water? 0.55:0.4);
  }
}

/* ---------------- spores and lantern dust ----------------
   The fungus breathes: every colony near you lets go of a few glowing spores
   that climb slowly on the cave's air and wander as they go, tinted by the
   colony that shed them and dimming with it when a burned brood's region
   dies back. And the lantern shows the air: specks of dust hang in its
   light, and only there. One pool of additive motes carries both. */
const M={sys:null, cols:[], dust:[]};
/* colonies: [{x,y,z, tint:[r,g,b], wall, rec}] — rec is the colony's light
   record, whose mul2 is the region die-back */
export function initSpores(colonies){
  M.sys=makeMoteSystem(320);
  scene.add(M.sys.mesh);
  M.cols=colonies.map(c=>({...c, t:Math.random()*3, owner:{mul:1}}));
}
const _c=new THREE.Color();
export function updateSpores(dt,camera,lantern){
  if(!M.sys) return;
  const now=performance.now()*0.001, px=STATE.pos.x, pz=STATE.pos.z;
  for(const c of M.cols){
    const d=Math.hypot(c.x-px,c.z-pz);
    c.owner.mul=c.rec&&c.rec.mul2!==undefined? c.rec.mul2 : 1;
    if(d>24) continue;
    c.t-=dt;
    if(c.t>0) continue;
    c.t=rand(0.3,1.0)/(c.big||1);
    _c.setRGB(Math.min(1,c.tint[0]*0.9),Math.min(1,c.tint[1]*0.9),Math.min(1,c.tint[2]*0.9));
    const sx=c.x+rand(-0.7,0.7), sz=c.z+rand(-0.7,0.7), sy=c.y+rand(-0.4,0.3);
    M.sys.spawn(sx,sy,sz,{life:rand(6,11), size:rand(0.026,0.048), alpha:rand(0.6,1.0),
      tint:_c.getHex(), vy:rand(0.05,0.14), wob:rand(0.04,0.10), drag:1, fin:0.25, fout:0.45,
      tw:0.35, owner:c.owner});
  }
  /* lantern dust: a small cloud that follows your head and shows only in
     the flame's light */
  if(lantern>0.05&&Math.random()<dt*14){
    const a=Math.random()*Math.PI*2, r=rand(0.35,2.4);
    const fx=-Math.sin(STATE.yaw), fz=-Math.cos(STATE.yaw);
    const x=camera.position.x+fx*1.1+Math.cos(a)*r, z=camera.position.z+fz*1.1+Math.sin(a)*r;
    M.sys.spawn(x,camera.position.y+rand(-1.1,0.6),z,{life:rand(2.5,5), size:rand(0.006,0.012),
      alpha:rand(0.25,0.55)*lantern, tint:0xffc58a, vy:rand(-0.02,0.03), wob:rand(0.02,0.06), drag:1,
      fin:0.35, fout:0.4, tw:0.5});
  }
  M.sys.update(dt,camera,now);
}

/* ---------------- rock dust ----------------
   A collapse is heard from across the cave; where it happened, it hangs in
   the air. Big slow billows of pale rock flour roll out of the heap's faces,
   settle, and thin over half a minute — so a player who goes to look finds
   the place still smoking with it. */
const RD={sys:null};
export function initRockDust(){
  RD.sys=makeDustSystem(200);
  RD.sys.mesh.material.uniforms.uLight.value=0.75;
  scene.add(RD.sys.mesh);
}
/* x,z the heap's cell centre; faces the open sides it spills out of */
export function puffRockDust(x,z,top,faces){
  if(!RD.sys||!faces||!faces.length) return;
  for(let i=0;i<80;i++){
    const [dx,dy]=faces[i%faces.length];
    const out=rand(2.2,4.2), along=rand(-2,2), h=rand(0.3,Math.min(3.5,top*0.6));
    const v=rand(0.4,1.6);
    RD.sys.spawn(x+dx*out+(dy?along:0),h,z+dy*out+(dx?along:0), dx*v+rand(-0.3,0.3),rand(-0.05,0.2),dy*v+rand(-0.3,0.3),
      rand(0.9,1.8),rand(2.2,3.6),rand(14,30),rand(0.22,0.4),2.2,
      Math.random()<0.5?0x7a7266:0x8a8174,0.55,0.02);
  }
}
export function updateRockDust(dt,camera){ if(RD.sys) RD.sys.update(dt,camera); }

/* ---------------- the chasm's breath ----------------
   It was three flat translucent sheets laid across the pit, which from the
   lip read exactly as what they were: panes. Now cold mist rises out of the
   dark in slow soft billows that thin as they near the lip, so the depth is
   something the air is doing rather than a colour at the bottom. */
const MI={sys:null, voids:[], t:0};
export function initMist(voids){
  MI.voids=voids; MI.t=0;
  if(!voids.length) return;
  MI.sys=makeDustSystem(110);
  const u=MI.sys.mesh.material.uniforms;
  u.uLight.value=0.5; u.uFloor.value=-40;             // it lives below the floor line
  scene.add(MI.sys.mesh);
  /* already breathing when you arrive: run it forward before the first frame */
  for(let i=0;i<60;i++){ mistPuff(); mistPuff(); MI.sys.update(0.4,camera); }
}
function mistPuff(){
  const c=MI.voids[Math.floor(Math.random()*MI.voids.length)];
  const x=c.x+rand(-2,2), z=c.z+rand(-2,2), y=rand(-9,-2.5);
  const life=rand(14,24);
  MI.sys.spawn(x,y,z, rand(-0.12,0.12),rand(0.12,0.3),rand(-0.12,0.12),
    rand(3.6,6.0),rand(1.3,1.7),life,rand(0.035,0.07),1.6,
    Math.random()<0.5?0x6f9aa6:0x5d8a96,0.9,0.04);
}
export function updateMist(dt,camera){
  if(!MI.sys) return;
  const near=MI.voids.some(c=>Math.hypot(c.x-STATE.pos.x,c.z-STATE.pos.z)<45);
  if(!near) return;
  MI.t-=dt;
  while(MI.t<=0){ MI.t+=0.22; mistPuff(); }
  MI.sys.update(dt,camera);
}

/* ---------------- dust in the chimney's light ----------------
   The way out is a shaft of pale light, and light like that is only visible
   because of what hangs in it: slow specks turning in the draught, rising
   and falling, brightest where the light is. */
const SM={sys:null, x:0, z:0, r:1, top:10, t:0};
export function initShaftMotes(x,z,r,top){
  SM.sys=makeMoteSystem(150); SM.x=x; SM.z=z; SM.r=r; SM.top=top; SM.t=0;
  scene.add(SM.sys.mesh);
}
export function updateShaftMotes(dt,camera){
  if(!SM.sys) return;
  SM.t-=dt;
  while(SM.t<=0){ SM.t+=0.06;
    const a=Math.random()*Math.PI*2, rr=Math.sqrt(Math.random())*SM.r, y=rand(0.5,SM.top);
    SM.sys.spawn(SM.x+Math.cos(a)*rr,y,SM.z+Math.sin(a)*rr,{life:rand(5,9), size:rand(0.012,0.024),
      alpha:rand(0.35,0.75)*(0.4+0.6*y/SM.top), tint:0xd4e6ec, vy:rand(-0.05,0.08), wob:rand(0.05,0.14),
      drag:1, fin:0.3, fout:0.4, tw:0.4});
  }
  SM.sys.update(dt,camera,performance.now()*0.001);
}
