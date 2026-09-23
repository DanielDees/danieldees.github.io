/* ---------------- the lantern, in the world and in your hand ----------------
   The level's one tool was a light with nothing holding it: the glow moved
   with you and there was no lantern anywhere in the frame, and the one lying
   by the corpse was a brass drum with four sticks for a cage.

   makeLanternModel() is a hand-crank storm lantern — a steel fuel drum with a
   rolled lip, a glass globe on a wire guard, a brass chimney cap and bail,
   and the dynamo's crank on the side — and it is the SAME model on the floor
   by the body and in your hand. The held one is drawn in its own pass after
   the world (depth cleared), with its own light at the mantle, so it never
   sinks into a wall you walk up to and its flame lights its own glass. It
   sways with your step, lags a turn of the head, and the crank turns while
   you wind it. */
import { clamp, lerp } from "./utils.js";
import { camera, renderer, markShared, mergeStatic } from "./scene.js";
import { STATE } from "./state.js";
import { makeCanvas, texCloth } from "./textures.js";

const brassMat=new THREE.MeshPhongMaterial({color:0x7a5c2c, specular:0x8e7446, shininess:52});
const steelMat=new THREE.MeshPhongMaterial({color:0x2b2c2c, specular:0x4a4c4e, shininess:34});
const knobMat=new THREE.MeshPhongMaterial({color:0x3a2616, specular:0x2a1e14, shininess:20});
const glassMat=new THREE.MeshPhongMaterial({color:0xcfe0de, specular:0xffffff, shininess:96,
  transparent:true, opacity:0.2, depthWrite:false, side:THREE.DoubleSide});
/* the glove and the sleeve: worn dark leather and oiled canvas, kept low in
   contrast — the eye should find the flame, not the hand */
const gloveMat=new THREE.MeshPhongMaterial({map:texCloth, color:0x3a2e24, specular:0x1a1510, shininess:14});
const sleeveMat=new THREE.MeshPhongMaterial({map:texCloth, color:0x2e302a, specular:0x0e0e0c, shininess:6});
markShared(brassMat,steelMat,knobMat,glassMat,gloveMat,sleeveMat);
const GLOW_TEX=markShared(makeCanvas(64,64,(g,w,h)=>{
  const gr=g.createRadialGradient(32,32,0,32,32,32);
  gr.addColorStop(0,"rgba(255,236,190,1)"); gr.addColorStop(0.2,"rgba(255,190,110,0.55)");
  gr.addColorStop(0.55,"rgba(255,140,60,0.12)"); gr.addColorStop(1,"rgba(255,120,40,0)");
  g.fillStyle=gr; g.fillRect(0,0,w,h);
}));
const lathe=(pts,seg=20)=>new THREE.LatheGeometry(pts.map(([r,y])=>new THREE.Vector2(Math.max(r,0.0005),y)),seg);
/* a bent wire: a thin tube along a polyline */
function wire(pts,r){
  const curve=new THREE.CatmullRomCurve3(pts.map(p=>new THREE.Vector3(...p)));
  return new THREE.TubeGeometry(curve,24,r,5,false);
}
let PARTS=null;
function parts(){
  if(PARTS) return PARTS;
  const P={};
  /* steel: the fuel drum, the guard wires, the crank's housing */
  const steel=[];
  steel.push(new THREE.Mesh(lathe([[0.001,0],[0.083,0],[0.090,0.004],[0.092,0.012],[0.092,0.044],
    [0.088,0.050],[0.070,0.056],[0.058,0.060],[0.056,0.066],[0.001,0.066]],28)));
  for(let i=0;i<4;i++){
    const a=i/4*Math.PI*2+Math.PI/4, c=Math.cos(a), s=Math.sin(a);
    steel.push(new THREE.Mesh(wire([[c*0.060,0.064,s*0.060],[c*0.074,0.10,s*0.074],[c*0.076,0.13,s*0.076],
      [c*0.072,0.165,s*0.072],[c*0.058,0.192,s*0.058]],0.0026)));
  }
  const hub=new THREE.Mesh(new THREE.CylinderGeometry(0.022,0.022,0.018,16));
  hub.rotation.z=Math.PI/2; hub.position.set(0.099,0.03,0); steel.push(hub);
  P.steel=mergeStatic(steel,steelMat).geometry;
  /* brass: the rolled trim, the guard rings, the chimney cap, the bail */
  const brass=[];
  const ring=(r,y,t)=>{ const m=new THREE.Mesh(new THREE.TorusGeometry(r,t,6,28)); m.rotation.x=Math.PI/2; m.position.y=y; return m; };
  brass.push(ring(0.091,0.047,0.0045), ring(0.074,0.118,0.0028), ring(0.058,0.192,0.004));
  brass.push(new THREE.Mesh(lathe([[0.001,0.188],[0.060,0.188],[0.064,0.196],[0.052,0.214],[0.034,0.232],
    [0.024,0.236],[0.024,0.252],[0.030,0.256],[0.001,0.258]],24)));
  const bail=new THREE.Mesh(new THREE.TorusGeometry(0.066,0.0032,6,24,Math.PI));
  bail.position.y=0.236; brass.push(bail);
  P.brass=mergeStatic(brass,brassMat).geometry;
  /* the globe */
  P.glass=lathe([[0.050,0.064],[0.060,0.080],[0.066,0.110],[0.064,0.150],[0.054,0.180],[0.046,0.190]],24);
  /* the crank: arm and knob, pivoting on the hub's axis (x) */
  const arm=new THREE.Mesh(new THREE.BoxGeometry(0.008,0.062,0.012)); arm.position.set(0,-0.026,0);
  P.crankArm=mergeStatic([arm],steelMat).geometry;
  const knob=new THREE.Mesh(new THREE.CylinderGeometry(0.008,0.009,0.034,10));
  knob.rotation.z=Math.PI/2; knob.position.set(0.018,-0.052,0);
  P.crankKnob=mergeStatic([knob],knobMat).geometry;
  /* the mantle: a small bright teardrop */
  P.mantle=lathe([[0.001,0.090],[0.012,0.098],[0.016,0.110],[0.012,0.124],[0.005,0.134],[0.001,0.140]],12);
  for(const k in P) markShared(P[k]);
  PARTS=P;
  return P;
}
/* a lantern: {group, crank, mantleMat, glow} — the group's origin is the
   drum's base; `glow` is an additive sprite at the mantle */
export function makeLanternModel(){
  const P=parts(), g=new THREE.Group();
  g.add(new THREE.Mesh(P.steel,steelMat));
  g.add(new THREE.Mesh(P.brass,brassMat));
  const crank=new THREE.Group(); crank.position.set(0.108,0.03,0);
  crank.add(new THREE.Mesh(P.crankArm,steelMat), new THREE.Mesh(P.crankKnob,knobMat));
  g.add(crank);
  const mantleMat=new THREE.MeshBasicMaterial({color:0x3a2a1a});
  g.add(new THREE.Mesh(P.mantle,mantleMat));
  const glass=new THREE.Mesh(P.glass,glassMat); glass.renderOrder=2; g.add(glass);
  const glow=new THREE.Sprite(new THREE.SpriteMaterial({map:GLOW_TEX, color:0xffffff, transparent:true,
    blending:THREE.AdditiveBlending, depthWrite:false, opacity:0}));
  glow.position.y=0.112; glow.scale.setScalar(0.2); glow.renderOrder=3; g.add(glow);
  return {group:g, crank, mantleMat, glow};
}

/* the hand that holds it, closed round the bail from above: a palm, four
   curled fingers, a thumb, and the forearm running down and back out of
   frame. Built in the lantern's own frame (the bail's crown at y≈0.30). */
function makeHand(){
  const G=[], S=[];
  const cap=(r,len,x,y,z,rx,ry,rz)=>{ const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r*0.9,len+2*r,8));   // r128 has no capsule
    m.position.set(x,y,z); m.rotation.set(rx,ry,rz); return m; };
  const palm=new THREE.Mesh(new THREE.SphereGeometry(0.042,14,10));
  palm.scale.set(1.25,0.8,0.95); palm.position.set(0.012,0.322,0.006); G.push(palm);
  for(let i=0;i<4;i++){                         // the fingers, curled under the wire
    const z=-0.027+i*0.018;
    G.push(cap(0.0105,0.028,-0.030,0.305,z,0,0,0.9));
    G.push(cap(0.0095,0.020,-0.038,0.284,z,0,0,-0.3));
  }
  G.push(cap(0.012,0.03,0.018,0.300,-0.040,0.9,0.2,0.4));    // the thumb over the top
  /* the forearm leaves the hand back toward you — out of the bottom right of
     the frame (in the lantern's frame, which the pose turns ~0.4 rad) */
  const arm=new THREE.Vector3(0.64,-0.30,0.70).normalize(), down=new THREE.Vector3(0,-1,0);
  const along=(m,len,at)=>{ m.geometry.translate(0,-len/2,0); m.position.set(...at);
    m.quaternion.setFromUnitVectors(down,arm); return m; };
  G.push(along(new THREE.Mesh(new THREE.CylinderGeometry(0.030,0.033,0.09,12)),0.09,[0.030,0.330,0.012]));
  S.push(along(new THREE.Mesh(new THREE.CylinderGeometry(0.044,0.058,0.7,14,1,true)),0.7,[0.085,0.322,0.068]));
  const g=new THREE.Group();
  g.add(mergeStatic(G,gloveMat), mergeStatic(S,sleeveMat));
  for(const m of[...G,...S]) m.geometry.dispose();
  return g;
}

/* ---- the held lantern: its own little scene, drawn over the world ---- */
const VM={scene:new THREE.Scene(), cam:new THREE.PerspectiveCamera(camera.fov,camera.aspect,0.02,4),
  model:null, light:null, raise:0, sway:0, lagYaw:0, lagPitch:0, lastYaw:0, lastPitch:0, crankA:0, ready:false};
export function initViewmodel(){
  if(VM.ready) return;
  const m=makeLanternModel();
  VM.model=m; VM.scene.add(m.group);
  m.group.add(makeHand());
  /* the flame lights its own lantern; a cold ambient stands in for the cave */
  VM.light=new THREE.PointLight(0xffa257,0,1.2,1.6); VM.light.position.set(0,0.112,0); m.group.add(VM.light);
  VM.scene.add(new THREE.AmbientLight(0x2a3a40,0.55));
  const rim=new THREE.DirectionalLight(0x5aa0b0,0.25); rim.position.set(-1,1.5,0.5); VM.scene.add(rim);
  m.group.scale.setScalar(0.82);
  renderer.compile(VM.scene,VM.cam);
  VM.ready=true;
}
/* flick: the lantern's breathing (LANT.flick); a cutscene owns the camera,
   and the hands go down for it */
export function updateViewmodel(dt,flick,cine){
  if(!VM.ready) return;
  const want=STATE.level===2&&STATE.hasLantern&&STATE.playing&&!STATE.dead&&!STATE.won&&!cine;
  VM.raise=clamp(VM.raise+(want?dt/0.5:-dt/0.3),0,1);
  if(VM.raise<=0) return;
  const m=VM.model, on=STATE.lanternOn? 1:0;
  /* the head turns and the lantern lags it, then swings back */
  let dy=STATE.yaw-VM.lastYaw; dy=Math.atan2(Math.sin(dy),Math.cos(dy));
  const dp=STATE.pitch-VM.lastPitch;
  VM.lastYaw=STATE.yaw; VM.lastPitch=STATE.pitch;
  VM.lagYaw=clamp(lerp(VM.lagYaw,0,Math.min(1,dt*5))+dy*0.6,-0.25,0.25);
  VM.lagPitch=clamp(lerp(VM.lagPitch,0,Math.min(1,dt*5))+dp*0.5,-0.2,0.2);
  const walk=STATE.moving&&STATE.grounded? 1:0;
  VM.sway=lerp(VM.sway,walk,Math.min(1,dt*4));
  const b=STATE.bob, crank=STATE.cranking? 1:0;
  const e=1-Math.pow(1-VM.raise,3);
  const x=0.285+Math.sin(b*0.5)*0.014*VM.sway+VM.lagYaw*0.12;
  const y=-0.345-(1-e)*0.35+Math.abs(Math.cos(b*0.5))*0.010*VM.sway-crank*0.03+VM.lagPitch*0.08
          +(crank? Math.sin(performance.now()*0.03)*0.003:0);
  m.group.position.set(x,y,-0.56);
  m.group.rotation.set(0.10+VM.lagPitch*0.6, -0.42+VM.lagYaw*1.1, Math.sin(b*0.5)*0.05*VM.sway-VM.lagYaw*0.4);
  if(crank){ VM.crankA+=dt*11; } m.crank.rotation.x=VM.crankA;
  /* the flame */
  const I=on*(0.55+0.85*Math.pow(STATE.lanternCharge,0.45))*flick;
  m.mantleMat.color.setRGB(0.20+0.85*I,0.12+0.50*I,0.06+0.16*I);
  m.glow.material.opacity=clamp(I*0.95,0,1);
  m.glow.scale.setScalar(0.18+0.12*I);
  VM.light.intensity=I*1.6;
}
export function renderViewmodel(){
  if(!VM.ready||VM.raise<=0) return;
  if(VM.cam.aspect!==camera.aspect||VM.cam.fov!==camera.fov){
    VM.cam.aspect=camera.aspect; VM.cam.fov=camera.fov; VM.cam.updateProjectionMatrix();
  }
  const ac=renderer.autoClear;
  renderer.autoClear=false; renderer.clearDepth();
  renderer.render(VM.scene,VM.cam);
  renderer.autoClear=ac;
}
