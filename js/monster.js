/* ---------------- the entity ---------------- */
import { clamp, lerp, angLerp, rand, hash } from "./utils.js";
import { STATE, monster } from "./state.js";
import { scene, markShared } from "./scene.js";
import { W, H, CELL, cellToWorld, worldToCell, isWall, losCells, bfsPath, randomOpenCell, farOpenWorldPoint } from "./map.js";
import { AU, panTo, sfxAlert, sfxStinger, sfxGroan, sfxHeartbeat, sfxKnock, sfxShockwave,
         sfxTeleport } from "./audio.js";
import { makeCanvas } from "./textures.js";
import { ui } from "./ui.js";
import { die } from "./lifecycle.js";

/* one cached puff texture for every steam sprite and fold-poof: rasterizing
   a fresh canvas per sprite (4 per space-fold, every ~7–13s) was a recurring
   allocation + GPU upload for visually identical smoke */
let _smokeTex=null;
function smokeTex(){
  if(!_smokeTex) _smokeTex=markShared(makeCanvas(128,128,(c,w,h)=>{
    c.clearRect(0,0,w,h);
    for(let i=0;i<60;i++){
      const a=Math.random()*Math.PI*2, rr=Math.pow(Math.random(),0.7)*w*0.36;
      const x=w/2+Math.cos(a)*rr, y=h/2+Math.sin(a)*rr;
      const r=8+Math.random()*18;
      const al=(0.16+0.42*(1-rr/(w*0.4)))*(0.7+Math.random()*0.5);
      const gr=c.createRadialGradient(x,y,0.4,x,y,r);
      gr.addColorStop(0,`rgba(4,3,5,${al})`);gr.addColorStop(1,"rgba(4,3,5,0)");
      c.fillStyle=gr;c.beginPath();c.arc(x,y,r,0,7);c.fill();
    }
  }));
  return _smokeTex;
}

/* ================= the body: a man-shape made of black wire =================
   The classic Lifeform: 3.3m of twisted black cable in the rough shape of a
   person, arms that reach the floor, fingers that are just the wire running
   out, and no face — the head is a knot. It is ONE SkinnedMesh on a 21-bone
   skeleton. Every strand is a tube weighted down the joint chain it runs
   along, so a wire BENDS through an elbow instead of breaking at it, and a
   bundle can twist, pinch at the joints and fray without a single seam.
   The strands also WRITHE: a wave travels down each one in the vertex shader,
   loudest on the loose ends, so the figure is never quite still even when it
   is standing in a corridor doing nothing. */
const WIRE_PAL=[0x0c0b0a,0x100e0c,0x15120e,0x0a0a0b,0x1a1510,0x0e0d0d,0x13100d];
const _wt=new THREE.Vector3(), _wo=new THREE.Vector3();

/* bind pose, model space, facing +z. Every rotation the pose writes is
   relative to this, so the bind pose IS the rest silhouette. */
function wireBones(){
  const B={}, list=[];
  const mk=(name,parent,x,y,z)=>{
    const b=new THREE.Bone(); b.name=name;
    b.userData.wp=new THREE.Vector3(x,y,z);
    if(parent){ B[parent].add(b); b.position.set(x,y,z).sub(B[parent].userData.wp); }
    else b.position.set(x,y,z);
    b.userData.i=list.length; B[name]=b; list.push(b);
  };
  mk("hips",null,0,1.62,0);
  mk("spine","hips",0,1.72,0);
  mk("chest","spine",0,2.08,0);
  mk("neck","chest",0,2.74,0.01);
  mk("head","neck",0,2.95,0.03);
  for(const [s,k] of [[1,"L"],[-1,"R"]]){
    mk("clav"+k,"chest",s*0.05,2.64,0);
    mk("upper"+k,"clav"+k,s*0.29,2.70,0);
    mk("fore"+k,"upper"+k,s*0.35,1.78,0);
    mk("hand"+k,"fore"+k,s*0.37,0.87,0.02);
    mk("fing"+k,"hand"+k,s*0.375,0.68,0.02);
    mk("thigh"+k,"hips",s*0.13,1.56,0);
    mk("shin"+k,"thigh"+k,s*0.14,0.84,0.02);
    mk("foot"+k,"shin"+k,s*0.14,0.10,0);
  }
  return {B,list};
}

/* every wire in the body goes through here: a polyline of {p,r,b0,b1,w,a}
   becomes a 4-sided tube (parallel-transport frames, so it never twists
   about itself) carrying its skin weights and its writhe */
class WireAcc{
  constructor(){ this.P=[]; this.N=[]; this.C=[]; this.SI=[]; this.SW=[]; this.WR=[]; this.PH=[]; this.I=[]; this.n=0; }
  strand(pts,col,dir,ph){
    const n=pts.length, S=4; if(n<2) return;
    const base=this.n, Nv=new THREE.Vector3(), Bv=new THREE.Vector3();
    let arc=0;
    for(let i=0;i<n;i++){
      _wt.copy(pts[Math.min(n-1,i+1)].p).sub(pts[Math.max(0,i-1)].p).normalize();
      if(i===0){ Nv.set(0,1,0); if(Math.abs(_wt.y)>0.9) Nv.set(1,0,0); }
      Nv.addScaledVector(_wt,-Nv.dot(_wt)).normalize();
      Bv.crossVectors(_wt,Nv);
      if(i>0) arc+=pts[i].p.distanceTo(pts[i-1].p);
      const q=pts[i];
      for(let k=0;k<S;k++){
        const th=k/S*Math.PI*2, c=Math.cos(th), s=Math.sin(th);
        _wo.set(Nv.x*c+Bv.x*s, Nv.y*c+Bv.y*s, Nv.z*c+Bv.z*s);
        this.P.push(q.p.x+_wo.x*q.r, q.p.y+_wo.y*q.r, q.p.z+_wo.z*q.r);
        this.N.push(_wo.x,_wo.y,_wo.z);
        this.C.push(col.r,col.g,col.b);
        this.SI.push(q.b0,q.b1,0,0); this.SW.push(1-q.w,q.w,0,0);
        this.WR.push(dir.x,dir.y,dir.z,q.a); this.PH.push(ph+arc*8.5);
      }
    }
    for(let i=0;i<n-1;i++) for(let k=0;k<S;k++){
      const a=base+i*S+k, b=base+i*S+(k+1)%S;
      this.I.push(a,b,a+S, b,b+S,a+S);
    }
    this.n+=n*S;
  }
  geometry(){
    const g=new THREE.BufferGeometry();
    g.setAttribute("position",new THREE.Float32BufferAttribute(this.P,3));
    g.setAttribute("normal",new THREE.Float32BufferAttribute(this.N,3));
    g.setAttribute("color",new THREE.Float32BufferAttribute(this.C,3));
    g.setAttribute("skinIndex",new THREE.Uint16BufferAttribute(this.SI,4));
    g.setAttribute("skinWeight",new THREE.Float32BufferAttribute(this.SW,4));
    g.setAttribute("aWr",new THREE.Float32BufferAttribute(this.WR,4));
    g.setAttribute("aPh",new THREE.Float32BufferAttribute(this.PH,1));
    g.setIndex(this.I);
    return g;
  }
}

/* a BUNDLE runs down a joint chain: the axis is a centripetal Catmull-Rom
   through the joints (so a strand rounds a shoulder instead of folding at
   it), R is the bundle's radius at each joint, E its [x,z] ellipse, `bulge`
   swells a span in the middle (thigh, forearm). `ref` is the frame's
   reference axis and must never run parallel to the chain. */
class WireChain{
  constructor(J,bones,R,o={}){
    this.J=J; this.bones=bones; this.R=R;
    this.E=o.E||J.map(()=>[1,1]); this.bulge=o.bulge||bones.map(()=>0);
    this.ref=o.ref||new THREE.Vector3(0,0,1);
    this.curve=new THREE.CatmullRomCurve3(J,false,"centripetal");
    let len=0; for(let i=1;i<J.length;i++) len+=J[i].distanceTo(J[i-1]);
    this.lenPer=len/(J.length-1);
  }
  at(s,out){
    const nS=this.J.length-1, t=clamp(s/nS,0,1);
    out.A=this.curve.getPoint(t,out.A||new THREE.Vector3());
    out.D=this.curve.getTangent(t,out.D||new THREE.Vector3()).normalize();
    out.U=(out.U||new THREE.Vector3()).copy(this.ref).addScaledVector(out.D,-this.ref.dot(out.D)).normalize();
    out.V=(out.V||new THREE.Vector3()).crossVectors(out.D,out.U);
    const k=Math.min(Math.floor(s),nS-1), f=clamp(s-k,0,1);
    const R=lerp(this.R[k],this.R[k+1],f)*(1+this.bulge[k]*Math.sin(Math.PI*f));
    out.R=R;
    out.xs=lerp(this.E[k][0],this.E[k+1][0],f); out.zs=lerp(this.E[k][1],this.E[k+1][1],f);
    /* skin: the span's bone, blended half-and-half into its neighbour
       across the last fifth either side of a joint */
    out.b0=this.bones[k]; out.b1=this.bones[k]; out.w=0;
    if(f<0.22&&k>0){ out.b1=this.bones[k-1]; out.w=0.5*(1-f/0.22); }
    else if(f>0.78&&k<nS-1){ out.b1=this.bones[k+1]; out.w=0.5*(f-0.78)/0.22; }
    return out;
  }
}
const _fr={};
/* one strand down a chain. o: {s0,s1,ang,twist,rho,rad,kink,peel,fray,wr,tipR} */
function chainStrand(acc,ch,o){
  const col=new THREE.Color(WIRE_PAL[Math.floor(Math.random()*WIRE_PAL.length)]);
  const span=o.s1-o.s0, n=Math.max(4,Math.ceil(span*ch.lenPer/0.035)+1);
  const kp=[rand(0,7),rand(0,7),rand(0,7)], kf=[rand(2.5,5),rand(2.5,5),rand(2.5,5)];
  const wob=rand(0,7), pts=[];
  for(let i=0;i<n;i++){
    const u=i/(n-1), s=o.s0+span*u, F=ch.at(s,_fr);
    /* peel: a stretch where the strand lifts off the bundle and loops out */
    let lift=0, amp=o.wr;
    for(const pl of o.peel||[]){
      const e=Math.exp(-Math.pow((s-pl.s)/pl.w,2));
      lift+=pl.h*e; amp+=0.03*e;
    }
    /* fray: a strand that quits early curls away from the bundle at its end */
    if(o.fray){ const e=clamp((u-0.72)/0.28,0,1); lift+=o.fray*e*e; amp+=0.045*e; }
    const th=o.ang+o.twist*s+0.35*Math.sin(s*1.7+wob);
    const rr=F.R*(o.rho+lift);
    const p=F.A.clone()
      .addScaledVector(F.U,Math.cos(th)*rr*F.zs)
      .addScaledVector(F.V,Math.sin(th)*rr*F.xs);
    p.x+=Math.sin(s*kf[0]+kp[0])*o.kink; p.y+=Math.sin(s*kf[1]+kp[1])*o.kink*0.5; p.z+=Math.sin(s*kf[2]+kp[2])*o.kink;
    /* wires taper to a point where they end — hidden in the body at the
       root, bare at a fingertip */
    const tip=Math.min(1,u/0.08,(1-u)/0.12);
    const r=o.rad*lerp(o.tipR||0.18,1,clamp(tip,0,1));
    pts.push({p,r,b0:F.b0,b1:F.b1,w:F.w,a:amp});
  }
  acc.strand(pts,col,new THREE.Vector3(rand(-1,1),rand(-1,1),rand(-1,1)).normalize(),rand(0,7));
}
/* a closed-ish free wire (rib, girdle, head knot) bound to one or two bones */
function looseStrand(acc,pts,rad,bone,wr,blend){
  const col=new THREE.Color(WIRE_PAL[Math.floor(Math.random()*WIRE_PAL.length)]);
  const n=pts.length;
  acc.strand(pts.map((p,i)=>{
    const u=i/(n-1), tip=Math.min(1,u/0.1,(1-u)/0.1);
    const bw=blend? blend(p):null;
    return {p, r:rad*lerp(0.25,1,clamp(tip,0,1)), b0:bone, b1:bw?bw.b:bone, w:bw?bw.w:0, a:wr};
  }),col,new THREE.Vector3(rand(-1,1),rand(-1,1),rand(-1,1)).normalize(),rand(0,7));
}
const peelMaybe=(p,s0,s1)=> Math.random()<p? [{s:rand(s0,s1), w:rand(0.16,0.3), h:rand(0.8,2.0)}] : [];

function buildWireBody(B){
  const acc=new WireAcc(), V=(x,y,z)=>new THREE.Vector3(x,y,z), I=n=>B[n].userData.i;
  const X=V(1,0,0);
  /* ---- the trunk: a braid pinched thin at the waist, barrelled at the ribs ---- */
  const torso=new WireChain(
    [V(0,1.40,0),V(0,1.60,0),V(0,2.02,0.01),V(0,2.40,0.02),V(0,2.70,0)],
    [I("hips"),I("spine"),I("chest"),I("chest")],
    [0.05,0.12,0.062,0.15,0.11],
    {E:[[1,1],[1.2,0.72],[1.05,0.8],[1.2,0.72],[1.35,0.6]], bulge:[0.1,0,0.15,0]});
  for(let i=0;i<22;i++){
    chainStrand(acc,torso,{s0:rand(0,0.6), s1:rand(3.3,4), ang:rand(0,7),
      twist:(Math.random()<0.5?-1:1)*rand(0.6,1.6), rho:Math.sqrt(rand(0.12,1)),
      rad:i<4? rand(0.017,0.022):rand(0.007,0.015), kink:rand(0.004,0.014), wr:rand(0.003,0.008),
      peel:peelMaybe(0.3,0.8,3.6)});
  }
  wrapStrand(acc,torso,1.1,2.1); wrapStrand(acc,torso,0.4,1.2);
  /* ribs: half-hoops round the chest, sloping down to the front, some of
     them broken off short — you can see into it between them */
  for(const y0 of [2.15,2.24,2.33,2.42,2.51]) for(const s of [-1,1]){
    const a1=rand(0.18,0.48)*Math.PI, pts=[];
    const rx=0.19*rand(0.98,1.1), rz=0.115*rand(0.98,1.1);
    for(let a=-Math.PI/2;a<=a1;a+=0.16){
      const k=(a+Math.PI/2)/Math.PI;
      pts.push(V(s*rx*Math.cos(a), y0+0.03-0.08*k+Math.sin(a*5+y0*9)*0.006, rz*Math.sin(a)+0.02));
    }
    looseStrand(acc,pts,rand(0.006,0.01),I("chest"),0.006);
  }
  /* the girdle: two loose loops slung round the hips */
  for(const y0 of [1.55,1.65]){
    const pts=[], rx=0.15, rz=0.095, ph=rand(0,7);
    for(let a=0;a<=Math.PI*2.15;a+=0.2)
      pts.push(V(rx*Math.cos(a+ph), y0+Math.sin(a*2+ph)*0.03, rz*Math.sin(a+ph)));
    looseStrand(acc,pts,0.009,I("hips"),0.006);
  }
  /* ---- the neck: eight wires, thinner than a wrist ---- */
  const neck=new WireChain(
    [V(0,2.36,0.02),V(0,2.66,0),V(0,2.80,0.02),V(0,2.97,0.04),V(0,3.12,0.05)],
    [I("chest"),I("chest"),I("neck"),I("head")],
    [0.08,0.06,0.04,0.05,0.07]);
  for(let i=0;i<8;i++)
    chainStrand(acc,neck,{s0:rand(0,0.8), s1:rand(3.2,4), ang:rand(0,7),
      twist:(Math.random()<0.5?-1:1)*rand(1,2.2), rho:rand(0.3,1), rad:rand(0.007,0.012),
      kink:0.006, wr:0.005});
  /* ---- the head: a knot. Loops wound round an egg whose axis drifts as
     it goes, so no two lie in the same plane — there is no face in it ---- */
  const C=V(0,3.13,0.05), HR=V(0.12,0.185,0.14);
  const neckBlend=p=> p.y<C.y-0.1? {b:I("neck"),w:0.35} : null;
  for(let L=0;L<14;L++){
    const n0=V(rand(-1,1),rand(-1,1),rand(-1,1)).normalize();
    const n1=V(rand(-1,1),rand(-1,1),rand(-1,1)).normalize();
    const big=L<3? 1.22:1, turns=rand(0.9,1.4), ph=rand(0,7), pts=[];
    const e1=new THREE.Vector3(), e2=new THREE.Vector3(), nn=new THREE.Vector3();
    const N=Math.ceil(28*turns);
    for(let i=0;i<=N;i++){
      const u=i/N, th=u*turns*Math.PI*2;
      nn.copy(n0).lerp(n1,u).normalize();
      e1.set(0,1,0).addScaledVector(nn,-nn.y); if(e1.lengthSq()<1e-4) e1.set(1,0,0);
      e1.normalize(); e2.crossVectors(nn,e1);
      const d=e1.multiplyScalar(Math.cos(th)).addScaledVector(e2,Math.sin(th));
      const r=big*(0.84+0.14*Math.sin(th*3+ph));
      pts.push(V(C.x+d.x*HR.x*r, C.y+d.y*HR.y*r, C.z+d.z*HR.z*r));
    }
    looseStrand(acc,pts,rand(0.006,0.011),I("head"),L<3?0.02:0.01,neckBlend);
  }
  /* and a few loose ends trailing off the back of the knot */
  for(let i=0;i<5;i++){
    const a=rand(-1.6,1.6), drop=rand(0.22,0.42), pts=[];
    for(let k=0;k<=10;k++){
      const u=k/10;
      pts.push(V(C.x+Math.sin(a)*(0.09+u*0.06)+Math.sin(u*7+a*3)*0.015,
                 C.y+0.05-u*drop, C.z-0.08-u*0.07+Math.cos(u*6+a)*0.012));
    }
    looseStrand(acc,pts,0.006,I("head"),0.05);
  }
  for(const [s,k] of [[1,"L"],[-1,"R"]]){
    /* ---- the arm: out of the ribs, over the shoulder, down to the floor,
       and splitting four ways at the wrist. The fingers ARE the wire ---- */
    const F=[0,1,2,3].map(f=>{
      const z=(f-1.5);
      return [V(s*0.375,0.68,0.02+z*0.035), V(s*(0.38+0.008*f),0.46,0.03+z*0.055),
              V(s*0.372,0.26+0.035*Math.abs(z),0.05+z*0.07)];
    });
    const armChain=f=>new WireChain(
      [V(s*rand(0,0.1),rand(2.42,2.64),rand(-0.1,0.1)),
       V(s*rand(0.1,0.18),2.64+rand(-0.04,0.02),rand(-0.07,0.07)),
       V(s*0.29,2.67,0),V(s*0.35,1.78,0),V(s*0.37,0.87,0.02),...F[f]],
      [I("chest"),I("clav"+k),I("upper"+k),I("fore"+k),I("hand"+k),I("fing"+k),I("fing"+k)],
      [0.04,0.045,0.052,0.036,0.026,0.012,0.009,0.004],
      {bulge:[0,0,0.25,0.18,0,0,0]});
    const arms=[0,1,2,3].map(armChain);
    for(let i=0;i<14;i++){
      const ch=armChain(i%4), early=i>=11;
      chainStrand(acc,ch,{s0:rand(0,0.9), s1:early? rand(3.4,4.1):7-rand(0,0.12),
        ang:rand(0,7), twist:(Math.random()<0.5?-1:1)*rand(0.9,2.0), rho:Math.sqrt(rand(0.1,1)),
        rad:i<2? rand(0.014,0.017):rand(0.006,0.012), kink:rand(0.004,0.012), wr:rand(0.003,0.007),
        peel:peelMaybe(0.35,2.3,4.6), fray:early? rand(1.4,2.8):0, tipR:early?0.3:0.12});
    }
    wrapStrand(acc,arms[1],rand(2.2,2.6),rand(3.0,3.4)); wrapStrand(acc,arms[2],rand(3.3,3.6),rand(3.9,4.2));
    /* ---- the leg: out of the pelvis, down, and three toes of wire ---- */
    const T=[-1,0,1].map(t=>{
      const a=t*0.42+s*0.12, d=V(Math.sin(a),0,Math.cos(a));
      return [V(s*0.14,0.10,0).addScaledVector(d,0.16).add(V(0,-0.05,0)),
              V(s*0.14,0.10,0).addScaledVector(d,0.34).add(V(0,-0.088,0))];
    });
    const legs=T.map(tj=>new WireChain(
      [V(s*0.05,1.48,0),V(s*0.13,1.56,0),V(s*0.14,0.84,0.02),V(s*0.14,0.10,0),...tj],
      [I("hips"),I("thigh"+k),I("shin"+k),I("foot"+k),I("foot"+k)],
      [0.05,0.068,0.038,0.03,0.012,0.004],
      {bulge:[0,0.3,0.2,0,0], ref:X}));
    for(let i=0;i<13;i++){
      chainStrand(acc,legs[i%3],{s0:rand(0,0.9), s1:5-rand(0,0.1), ang:rand(0,7),
        twist:(Math.random()<0.5?-1:1)*rand(0.8,1.9), rho:Math.sqrt(rand(0.1,1)),
        rad:i<3? rand(0.015,0.019):rand(0.007,0.014), kink:rand(0.004,0.01), wr:rand(0.003,0.007),
        peel:peelMaybe(0.35,1.5,2.6), tipR:0.12});
    }
    wrapStrand(acc,legs[0],rand(1.1,1.4),rand(1.8,2.1)); wrapStrand(acc,legs[1],rand(2.2,2.4),rand(2.7,2.95));
  }
  return acc.geometry();
}
/* a wire WOUND round a bundle over part of its length — the binding that
   stops a limb reading as a neat hank of parallel cable */
function wrapStrand(acc,ch,s0,s1){
  chainStrand(acc,ch,{s0, s1, ang:rand(0,7), twist:(Math.random()<0.5?-1:1)*rand(7,12),
    rho:rand(1.02,1.2), rad:rand(0.005,0.008), kink:0.003, wr:0.006, tipR:0.4});
}

export function makeMonster(){
  /* The wire is near-black by vertex colour; what draws it is the SPECULAR
     — a thin hot line down every strand wherever a fixture rakes across it,
     which is exactly how cable reads in a dim room. */
  const WR={t:{value:0}, a:{value:1}};
  const mat=new THREE.MeshPhongMaterial({color:0xffffff, vertexColors:true,
    specular:0x33302c, shininess:52, skinning:true});
  mat.onBeforeCompile=sh=>{
    sh.uniforms.uWT=WR.t; sh.uniforms.uWA=WR.a;
    sh.vertexShader=sh.vertexShader
      .replace("#include <common>","#include <common>\nattribute vec4 aWr;\nattribute float aPh;\nuniform float uWT;\nuniform float uWA;")
      .replace("#include <begin_vertex>",
        "#include <begin_vertex>\n  float wv=aPh-uWT;\n  transformed+=aWr.xyz*(sin(wv)*0.65+sin(wv*2.37+1.3)*0.35)*aWr.w*uWA;");
  };
  const g=new THREE.Group();
  const {B,list}=wireBones();
  const body=new THREE.SkinnedMesh(buildWireBody(B),mat);
  body.add(B.hips);
  body.updateMatrixWorld(true);
  body.bind(new THREE.Skeleton(list));
  body.frustumCulled=false;                 // the bind-pose bounds don't follow a flailing arm
  g.add(body);
  g.userData.B=B; g.userData.WR=WR; g.userData.body=body;
  g.userData.head=B.head;
  /* smoothed pose knobs (see poseMonster) */
  g.userData.P={hunch:0.26, flare:0.06, rise:0, kill:0, knock:0, agit:0, tilt:0};
  /* ---- darkness aura ----
     aura: nested transparent black shells spanning the light-disruption
     radius. TRUE 3D — it darkens floor, walls and air around it from any
     angle (a single billboard read as a flat band clipped by floor and
     ceiling). Per-shell alphas are tiny; the view ray stacks more shells
     the closer it passes to the body, giving an exponential-feeling ramp
     that tops out ≈20% through the centre. Black-on-black compositing is
     order-independent, so the shells need no manual sorting. */
  const auraMat=op=>new THREE.MeshBasicMaterial({color:0x000000, transparent:true,
    opacity:op, side:THREE.DoubleSide, depthWrite:false});
  /* 20 concentric shells (was 10) for a smoother ramp: opacity rises linearly
     outer→inner. Doubling the shell count halves the per-step increase, so the
     cumulative darkening through the centre stays a smooth gradient instead of
     stacking up — tuned here to ~44% at the core (another +20%). */
  g.userData.aura=[];
  const AURA_N=20, R_OUT=52.86, R_IN=8.99, OP_OUT=0.00875, OP_IN=0.02025;
  for(let i=0;i<AURA_N;i++){
    const f=i/(AURA_N-1);                                   // 0 outer … 1 inner
    const r=R_OUT+(R_IN-R_OUT)*f, op=OP_OUT+(OP_IN-OP_OUT)*f;
    const s=new THREE.Mesh(new THREE.SphereGeometry(r,18,12), auraMat(op));
    s.position.y=1.9; s.userData.baseOp=op; g.add(s); g.userData.aura.push(s);
  }
  g.userData.animated=true;                  // walks/animates every frame — never freeze its matrices
  g.visible=false;
  return g;
}

/* ================= the pose =================
   One function drives the skeleton for the AI, the breaker cutscene and the
   kill. `mode` is calm | alert | chase | kill; v is the ground speed
   it actually covered this frame, so the stride never outruns the body.
   Slow knobs (hunch, flare, reach…) ease toward their targets; the gait and
   the jitter are written raw on top of them every frame. */
const rot=(b,x,y,z)=>{ b.rotation.set(x,y,z); };
/* stepped noise: holds a value for 1/hz s then jumps — the Lifeform does not
   move smoothly, it RE-POSES, and that is most of what makes it wrong */
const jolt=(t,hz,k)=>(hash(Math.floor(t*hz)*1.37+k*17.9)-0.5)*2;
export function poseMonster(dt,v,mode){
  const m=monster, u=m.mesh.userData, B=u.B, P=u.P;
  const tNow=performance.now()/1000;
  const chase=mode==="chase", alert=mode==="alert", kill=mode==="kill";
  const walk01=clamp(v/2.2,0,1), run01=clamp((v-2.2)/4.8,0,1);
  /* ---- slow knobs ---- */
  const tg={
    hunch: kill?0.62 : chase?0.46 : alert?0.0 : 0.24+0.06*walk01,
    flare: kill?0.22 : chase?0.30 : alert?0.26 : 0.06,
    rise:  alert?1:0,
    kill:  kill?1:0,
    knock: m.knockAnim>0?1:0,
    agit:  chase||kill?1 : alert?0.6 : 0,
  };
  const k=kill? 1 : 1-Math.exp(-dt*(chase?6:3.2));
  for(const key in tg) P[key]+= (tg[key]-P[key])*k;
  /* the wires crawl faster when it is coming for you */
  u.WR.t.value+=dt*(1.6+2.8*P.agit);
  u.WR.a.value=1+1.2*P.agit;

  /* ---- gait: phase from real ground speed ---- */
  m.anim+=dt*(1.5+v*1.6);
  const ph=m.anim, A=(0.20+0.44*run01)*walk01;
  const legs={L:ph+Math.PI, R:ph};
  const stand={};
  for(const s of ["L","R"]){
    const p=legs[s];
    const tx=-A*Math.sin(p)-0.04*P.hunch;
    const bend=0.10+0.12*P.hunch+(0.45+0.5*run01)*walk01*Math.pow(Math.max(0,Math.cos(p)),1.5);
    rot(B["thigh"+s], tx, 0, (s==="L"?1:-1)*0.03);
    rot(B["shin"+s], bend, 0, 0);
    rot(B["foot"+s], -(tx+bend)*0.8, 0, 0);
    stand[s]=0.72*Math.cos(tx)+0.74*Math.cos(tx+bend)+0.10;
  }
  /* hips ride the longer (planted) leg so the feet neither float nor sink */
  B.hips.position.y=Math.max(stand.L,stand.R)+0.06;
  const sway=Math.sin(ph)*walk01;
  rot(B.hips, 0, 0.14*A*Math.sin(ph), 0.05*sway+0.02*Math.sin(tNow*0.7)*(1-walk01));
  /* ---- spine: the stoop, rising to its full height when it notices you ---- */
  const J=P.agit*(chase?1:0.4);
  rot(B.spine, P.hunch*0.45, -B.hips.rotation.y*0.6, -0.03*sway);
  rot(B.chest, P.hunch*0.55+0.05*jolt(tNow,7,1)*J, -B.hips.rotation.y*0.8+0.16*jolt(tNow,6,2)*J,
      0.04*sway+0.08*jolt(tNow,5,3)*J);
  const lookUp=-(P.hunch*0.72);
  rot(B.neck, lookUp*0.45+P.kill*0.35, 0, 0);
  /* the head keeps the twitch the AI owns (head.rotation is overwritten by
     the twitch block in updateMonster when it fires; this is the rest) */
  const tilt=0.16+0.34*P.rise+Math.sin(tNow*0.6)*0.07*(1-walk01);
  B.head.userData.rest=[lookUp*0.55+P.kill*0.4, 0, tilt];

  /* ---- arms: they HANG. Whatever the chest does, the upper arm is
     counter-rotated back toward the vertical, then swung, flared, flung ---- */
  const trunk=B.spine.rotation.x+B.chest.rotation.x;
  const armA=(0.28+0.85*run01)*walk01;
  for(const s of ["L","R"]){
    const sg=s==="L"?1:-1, opp=s==="L"?legs.R:legs.L;
    const swing=-armA*Math.sin(opp);
    let ux=-trunk*0.9+swing+0.12*P.hunch, uz=sg*(P.flare+0.12*run01*Math.abs(Math.sin(opp)));
    let fx=-(0.18+0.35*run01*Math.max(0,Math.sin(opp+0.6))), hx=0.05, fg=-0.25;
    /* chase: flung arms — the stride's swing plus stepped jolts per arm */
    ux+=0.35*jolt(tNow,9,sg*5)*J; uz+=sg*0.22*Math.abs(jolt(tNow,8,sg*7))*J;
    fx+=0.3*jolt(tNow,11,sg*9)*J;
    /* the reach: over you, both arms out, fingers open */
    ux=lerp(ux,-1.45-trunk*0.35,P.kill); uz=lerp(uz,sg*0.16,P.kill);
    fx=lerp(fx,-0.35,P.kill); fg=lerp(fg,0.3,P.kill);
    /* the knock: the right arm raised to the wall, the forearm rapping */
    if(s==="R"&&P.knock>0.01){
      ux=lerp(ux,-1.25-trunk*0.5,P.knock);
      fx=lerp(fx,-1.0+0.32*Math.sin(tNow*26),P.knock);
      fg=lerp(fg,-0.9,P.knock);
    }
    rot(B["clav"+s], 0, 0, sg*(0.05*P.rise+0.06*P.kill));
    rot(B["upper"+s], ux, 0, uz);
    rot(B["fore"+s], fx, 0, 0);
    rot(B["hand"+s], hx, 0, -sg*0.05);
    rot(B["fing"+s], fg+0.12*Math.sin(tNow*1.3+sg), 0, 0);
  }
  if(m.knockAnim>0) m.knockAnim-=dt;
}
/* head twitch: snappy stepped jolts of the knot — occasional bursts when
   it's alone, near-constant while it's coming for you. Written as an offset
   on the rest the pose just set, and settling back onto it. */
export function twitchHead(dt,agitated){
  const m=monster, H=m.mesh.userData.B.head, r=H.userData.rest||[0,0,0.16];
  const tw=H.userData.tw||(H.userData.tw=[0,0,0]);
  if(m.twitchDur>0){
    m.twitchDur-=dt;
    const j=Math.floor(performance.now()/1000*16)+m.twitchSeed;
    tw[0]=(hash(j*2.3+71)-0.5)*0.35; tw[1]=(hash(j)-0.5)*1.0; tw[2]=(hash(j*1.7+13)-0.5)*0.6;
    if(m.twitchDur<=0) m.twitchT = agitated? rand(0.12,0.55) : rand(3.5,9);
  } else {
    const settle=Math.pow(0.001,dt);          // snap back to rest fast
    tw[0]*=settle; tw[1]*=settle; tw[2]*=settle;
    m.twitchT-=dt;
    if(m.twitchT<=0){
      m.twitchDur = agitated? rand(0.5,1.3) : rand(0.25,0.7);
      m.twitchSeed = Math.floor(Math.random()*1e4);
    }
  }
  H.rotation.set(r[0]+tw[0], r[1]+tw[1], r[2]+tw[2]);
}

/* ---------------- monster AI ---------------- */
/* a slow two-phase ring of light-disruption rolls out from (x,z), swept in
   lights.js, under a layered sinister drone held until the farthest panel
   has recovered. Fires at wake, then recurs from wherever it now stands. */
function triggerShockwave(x,z){
  const SZ2=W*CELL/2;
  const mdx=Math.max(x+SZ2, SZ2-x), mdz=Math.max(z+SZ2, SZ2-z);
  monster.shock={t:0, x, z, maxR:Math.hypot(mdx,mdz)};
  sfxShockwave(monster.shock.maxR/19.23 + 3.5);   // the lights + drone say it all — no toast
}
/* the disruption pulse starts at 60s and tightens by 5s per objective
   cleared (down to a floor of 20s); the entity also sees ~5% farther and
   drifts toward the player more eagerly with each step */
const SHOCK_BASE=60, SHOCK_STEP=5, SHOCK_MIN=20;
export function shockPeriod(){ return Math.max(SHOCK_MIN, SHOCK_BASE-SHOCK_STEP*monster.escalation); }
export const sightMult=()=> 1+0.05*monster.escalation;     // +5% detection per objective
/* called on every objective progression after the first bottle */
export function escalateMonster(){
  monster.escalation++;
  monster.shockTimer=Math.min(monster.shockTimer, shockPeriod());  // pull in an in-flight wait
  /* the darkness aura grows 5% wider and 5% deeper each step */
  if(monster.mesh){
    const k=1+0.05*monster.escalation;
    for(const s of monster.mesh.userData.aura){
      s.scale.setScalar(k);
      s.material.opacity=s.userData.baseOp*k;
    }
  }
}
/* ---- the space-fold: every ~15s (tightening 2s per objective, floored)
   it teleports 2–4 wall segments along its current route, never landing
   closer than one segment to the destination. Both ends of the fold poof
   into a knot of dark fog crossed with shear lines that dissipates over a
   second. The fold itself carries its own speed; the entity's legs were
   never the threat. ---- */
const TELE_BASE=13, TELE_STEP=2, TELE_MIN=7;
const telePeriod=()=>Math.max(TELE_MIN, TELE_BASE-TELE_STEP*monster.escalation);
const poofs=[];
function spawnPoof(x,z,big=1){
  const g=new THREE.Group(); g.position.set(x,0,z);
  const sprites=[], lines=[];
  for(let i=0;i<4;i++){
    const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:smokeTex(),
      transparent:true, opacity:(0.55+Math.random()*0.3), depthWrite:false}));
    const s=(1.6+Math.random()*1.6)*big;
    sp.scale.set(s,s*(1.1+Math.random()*0.6),1);
    sp.position.set(rand(-0.4,0.4),1.0+Math.random()*1.6,rand(-0.4,0.4));
    sp.userData={op:sp.material.opacity, grow:0.6+Math.random()*0.8};
    g.add(sp); sprites.push(sp);
  }
  /* the shear lines: thin dark slashes through the fog, each sliding along
     its own axis as the poof dies */
  for(let i=0;i<10;i++){
    const m=new THREE.Mesh(new THREE.PlaneGeometry((0.9+Math.random()*1.7)*big,0.02+Math.random()*0.035),
      new THREE.MeshBasicMaterial({color:0x05040a, transparent:true,
        opacity:0.5+Math.random()*0.3, side:THREE.DoubleSide, depthWrite:false}));
    m.position.set(rand(-0.7,0.7),0.5+Math.random()*2.2,rand(-0.7,0.7));
    m.rotation.set(rand(-0.5,0.5),Math.random()*Math.PI,rand(-1.0,1.0));
    m.userData={op:m.material.opacity,
      slide:new THREE.Vector3(rand(-1,1),rand(-0.3,0.6),rand(-1,1)).multiplyScalar(0.5)};
    g.add(m); lines.push(m);
  }
  scene.add(g);
  poofs.push({g,t:0,sprites,lines});
}
function updatePoofs(dt){
  for(let i=poofs.length-1;i>=0;i--){
    const p=poofs[i]; p.t+=dt;
    if(p.t>=1){
      scene.remove(p.g);
      /* materials & geometry are per-poof; the smoke map is the shared one */
      p.g.traverse(o=>{ if(o.material) o.material.dispose();
        if(o.geometry) o.geometry.dispose(); });
      poofs.splice(i,1); continue;
    }
    for(const sp of p.sprites){
      sp.material.opacity=sp.userData.op*(1-p.t);
      const gr=1+sp.userData.grow*dt;
      sp.scale.x*=gr; sp.scale.y*=gr;
      sp.position.y+=dt*0.5;
    }
    for(const m of p.lines){
      m.material.opacity=m.userData.op*Math.max(0,1-p.t*1.25);  // the shears die first
      m.position.addScaledVector(m.userData.slide,dt);
      m.rotation.z+=dt*0.6;
    }
  }
}
export function clearMonsterFx(){
  for(const p of poofs) scene.remove(p.g);
  poofs.length=0;
}
/* fold along the current path. Returns false when there is nowhere to go
   (no route, or already within two segments of the destination). */
function teleportAlongPath(m){
  if(!m.path.length) return false;
  const pts=[{x:m.pos.x,z:m.pos.z},...m.path];
  let total=0;
  for(let i=1;i<pts.length;i++) total+=Math.hypot(pts[i].x-pts[i-1].x,pts[i].z-pts[i-1].z);
  const maxJump=total-CELL;                  // always leave one segment of approach
  if(maxJump<CELL) return false;
  let jump=Math.min(rand(2,4)*CELL,maxJump);
  const fx=m.pos.x, fz=m.pos.z;
  let i=1;
  while(i<pts.length-1){
    const seg=Math.hypot(pts[i].x-pts[i-1].x,pts[i].z-pts[i-1].z);
    if(jump<=seg) break;
    jump-=seg; i++;
  }
  const a=pts[i-1], b=pts[i], L=Math.hypot(b.x-a.x,b.z-a.z)||1, f=Math.min(1,jump/L);
  const nx=lerp(a.x,b.x,f), nz=lerp(a.z,b.z,f);
  const cc=worldToCell(nx,nz);
  if(isWall(cc.cx,cc.cy)) return false;      // never fold into a wall
  spawnPoof(fx,fz,1.0);
  m.pos.x=nx; m.pos.z=nz;
  m.path=m.path.slice(i-1);                  // resume from the landing segment
  m.faceAng=Math.atan2(b.x-nx,b.z-nz);
  m.mesh.position.set(nx,m.mesh.position.y,nz);
  spawnPoof(nx,nz,0.8);
  /* the fold's voice rises from whichever end is nearer the player */
  const dF=Math.hypot(STATE.pos.x-fx,STATE.pos.z-fz);
  const dN=Math.hypot(STATE.pos.x-nx,STATE.pos.z-nz);
  const [sx,sz]=dF<=dN? [fx,fz]:[nx,nz];
  sfxTeleport(clamp(1-Math.min(dF,dN)/52,0.06,1), panTo(sx,sz));
  return true;
}
export function wakeMonster(){
  monster.active=true; monster.mesh.visible=true;
  const p=farOpenWorldPoint(STATE.pos.x,STATE.pos.z,40);
  monster.pos.set(p.x,0,p.z);
  monster.groanT=2.5;
  monster.teleT=telePeriod()*rand(0.9,1.2);
  triggerShockwave(p.x,p.z);            // announce it from the spawn point
  monster.shockTimer=shockPeriod();     // …then recurring, tightening per objective
}
/* final-objective rush: it bolts for the spot at full chase speed using the
   normal last-known-location hunt logic — but running, not walking. The
   search budget covers the whole trip so it never gives up en route. */
export function monsterRushTo(x,z){
  if(!monster.active) return;
  monster.lastSeen=new THREE.Vector3(x,0,z);
  monster.state="hunt";
  monster.searchT=monster.pos.distanceTo(monster.lastSeen)/SPEED_TARGETS.chase+6;
  monster.repath=0;
  monster.rush=true;
}
export function monsterCanSee(){
  const d=monster.pos.distanceTo(STATE.pos);
  const chasing = monster.state==="chase";
  /* crouching cuts detection range 60% (19 → 7.6) — but only while it hasn't
     committed to you yet. Once it's chasing, dropping low no longer shrinks
     the range, so you can't crouch-juke an active pursuer; you still have to
     break line of sight and hold still (the d>7 rule below). */
  let range = (STATE.crouch && !chasing)? 19*0.4 : 19;
  if(STATE.sprinting&&STATE.moving) range=27.3;   // max chase reach +5%
  range *= sightMult();                            // grows 5% per objective cleared
  if(d>range) return false;
  if(STATE.crouch && d>7 && !STATE.moving) return false;
  return losCells(monster.pos.x,monster.pos.z,STATE.pos.x,STATE.pos.z);
}
function monsterHears(){
  if(!STATE.moving) return false;
  const d=monster.pos.distanceTo(STATE.pos);
  if(STATE.sprinting) return d<26;
  if(!STATE.crouch) return d<8;
  return false;
}
/* clearance test for path straightening: samples the line at 1m steps with
   a body-width shoulder either side, so a shortcut never clips a corner */
function corridorClear(ax,az,bx,bz){
  const dx=bx-ax, dz=bz-az, len=Math.hypot(dx,dz);
  if(len<0.001) return true;
  const ox=-dz/len*0.5, oz=dx/len*0.5;
  const steps=Math.ceil(len);
  for(let i=1;i<=steps;i++){
    const t=i/steps, x=lerp(ax,bx,t), z=lerp(az,bz,t);
    for(const[sx,sz]of[[0,0],[ox,oz],[-ox,-oz]]){
      const c=worldToCell(x+sx,z+sz);
      if(isWall(c.cx,c.cy)) return false;
    }
  }
  return true;
}
/* BFS is 4-connected, so raw paths stair-step diagonally cell by cell.
   Pull the string taut: greedily keep only the farthest waypoint reachable
   in a straight walk from the previous kept one. */
function smoothPath(path){
  if(path.length<3) return path;
  const out=[];
  let cx=monster.pos.x, cz=monster.pos.z, i=0;
  while(i<path.length){
    let j=path.length-1;
    while(j>i && !corridorClear(cx,cz,path[j].x,path[j].z)) j--;
    out.push(path[j]); cx=path[j].x; cz=path[j].z; i=j+1;
  }
  return out;
}
function setPathTo(wx,wz){
  let a=worldToCell(monster.pos.x,monster.pos.z);
  /* recovery: if it somehow ended up inside a wall cell, BFS can never
     start and it stands inert forever — snap to the nearest open cell */
  if(isWall(a.cx,a.cy)){
    for(const[ox,oy]of[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
      if(!isWall(a.cx+ox,a.cy+oy)){
        const q=cellToWorld(a.cx+ox,a.cy+oy);
        monster.pos.x=q.x; monster.pos.z=q.z;
        a=worldToCell(q.x,q.z);
        break;
      }
    }
  }
  const b=worldToCell(wx,wz);
  const p=bfsPath(a.cx,a.cy,clamp(b.cx,0,W-1),clamp(b.cy,0,H-1));
  monster.path = p? p.map(c=>cellToWorld(c.cx,c.cy)) : [];
  if(monster.path.length>1) monster.path.shift();
  monster.path=smoothPath(monster.path);
}
/* marginal awareness: pick a wander destination in the player's general
   direction — a cone around the bearing to them, not their position */
function openCellToward(from,to){
  const base=Math.atan2(to.x-from.x,to.z-from.z);
  for(let t=0;t<24;t++){
    const a=base+rand(-0.8,0.8), r=rand(10,28);
    const c=worldToCell(from.x+Math.sin(a)*r, from.z+Math.cos(a)*r);
    if(!isWall(c.cx,c.cy)) return c;
  }
  return randomOpenCell(0);
}
function startAlert(){
  monster.state="alert";
  monster.alertT=rand(0.55,0.9);
  monster.path=[];
  sfxAlert(panTo(monster.pos.x,monster.pos.z));
}
const SPEED_TARGETS={wander:2.0, investigate:3.4, alert:0, chase:7.04, hunt:3.4};  // chase +10% (was 6.4)
/* write-on-change for the per-frame fear overlays: identical opacity writes
   still dirty style; quantizing to 0.01 also skips imperceptible deltas.
   Read-compare (not a cache) — cutscenes/lifecycle write these directly too. */
const setFx=(el,v)=>{ const s=String(Math.round(v*100)/100); if(el.style.opacity!==s) el.style.opacity=s; };
export function updateMonster(dt){
  updatePoofs(dt);
  /* delayed first wake: the almond-water grab lights a short fuse */
  if(!monster.active && monster.wakeT>0 && !STATE.dead && !STATE.won){
    monster.wakeT-=dt;
    if(monster.wakeT<=0) wakeMonster();
  }
  if(!monster.active||STATE.dead||STATE.won) return;
  const m=monster;
  /* breaker cinematic: once it crosses a 30m ring around the player it
     roots in place — frozen mid-stride, breath still in your ears — until
     the cutscene returns control and lets it loose with a cry */
  if(m.holdAt30 && m.pos.distanceTo(STATE.pos)<30) m.held=true;
  if(m.held){ m.mesh.userData.WR.t.value+=dt*3; return; }   // frozen mid-stride; the wire still crawls
  /* the disruption pulse recurs from its current position */
  m.shockTimer-=dt;
  if(m.shockTimer<=0){
    triggerShockwave(m.pos.x,m.pos.z); m.shockTimer=shockPeriod();
    /* every pulse after the wake one doubles as a sounding: the building
       hands it your position at this instant and it walks the echo down */
    if(!m.rush && m.state!=="chase" && m.state!=="alert"){
      m.lastSeen=STATE.pos.clone();
      m.state="hunt";
      m.searchT=m.pos.distanceTo(m.lastSeen)/SPEED_TARGETS.hunt+6;
      m.repath=0; m.pauseT=0; m.knockMove=null;
    }
  }
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
        if(sees){ m.state="chase"; sfxStinger(); }
        else    { m.state="hunt"; m.searchT=6; }
      }
      break;
    case "chase":
      if(!sees){ m.state="hunt"; m.searchT=6; }
      break;
    case "hunt":
      if(sees){ m.state="chase"; m.rush=false; }    // re-acquire without a fresh alert
      else {
        const arrived = m.lastSeen && m.pos.distanceTo(m.lastSeen)<1.5;
        m.searchT -= dt*(arrived?2.5:1);
        if(m.searchT<=0){ m.state="wander"; m.rush=false; m.path=[]; }
      }
      break;
  }

  /* ---- speed ramps: accelerate into a chase, wind down out of one ---- */
  let tgtSpeed=SPEED_TARGETS[m.state];
  if(m.rush && m.state==="hunt") tgtSpeed=SPEED_TARGETS.chase;   // running, not walking
  const rate = tgtSpeed>m.curSpeed? 3.6 : 5.0;      // ~1.8s 0→full, quicker to slow
  m.curSpeed += clamp(tgtSpeed-m.curSpeed, -rate*dt, rate*dt);

  /* ---- pathing ---- */
  if(m.state==="chase"){
    if(m.repath<=0){ setPathTo(STATE.pos.x,STATE.pos.z); m.repath=0.4; }
  } else if(m.state==="hunt"||m.state==="investigate"){
    if(m.repath<=0&&m.lastSeen){ setPathTo(m.lastSeen.x,m.lastSeen.z); m.repath=0.8; }
  } else if(m.state==="wander"){
    if(m.pauseT>0){ m.pauseT-=dt; }                 // it sometimes just… stands there
    else if(m.path.length===0&&m.repath<=0&&!m.knockMove){
      const cc=worldToCell(m.pos.x,m.pos.z);
      const byWall=isWall(cc.cx+1,cc.cy)||isWall(cc.cx-1,cc.cy)||isWall(cc.cx,cc.cy+1)||isWall(cc.cx,cc.cy-1);
      /* each objective cleared makes it linger less (−15% per step) */
      const pauseK=Math.pow(0.85,m.escalation);
      if(Math.random()<(byWall?0.6:0.4)*pauseK){ m.pauseT=rand(2,5.5); m.repath=0.2; }
      else {
        /* marginal awareness: it drifts toward the player's side of the map
           more often than chance — strongly so from very far away. It never
           paths AT the player, just into their general direction. */
        const farAway = d > W*CELL*0.65;
        /* each objective cleared raises the toward-player bias another 5% */
        const esc=sightMult();
        const c = Math.random()<(farAway? Math.min(0.95,0.78*esc) : Math.min(0.88,0.34*esc))
          ? openCellToward(m.pos,STATE.pos) : randomOpenCell(0);
        const p=cellToWorld(c.cx,c.cy);
        setPathTo(p.x,p.z); m.repath=1.5;
      }
    }
  }

  /* ---- the space-fold: it periodically poofs ahead along its route ---- */
  m.teleT-=dt;
  if(m.teleT<=0){
    /* a failed fold (nowhere to go) retries soon; a real one waits a period */
    m.teleT = teleportAlongPath(m)? telePeriod()*rand(0.85,1.25) : rand(2,4);
  }

  /* ---- movement (real displacement drives the animation) ---- */
  const prevX=m.pos.x, prevZ=m.pos.z;
  if(m.knockMove && !m.path.length){
    /* sidle up to the wall it intends to rap on (animated like any walk).
       Checked before curSpeed: in wander the speed target never drops, so
       a paused entity still carries a nonzero curSpeed. */
    const kx=m.knockMove.x-m.pos.x, kz=m.knockMove.z-m.pos.z, kl=Math.hypot(kx,kz);
    if(kl>0.15){
      const step=Math.min(1.1*dt,kl);
      m.pos.x+=kx/kl*step; m.pos.z+=kz/kl*step; m.faceAng=Math.atan2(kx,kz);
    }
  } else if(m.curSpeed>0.05){
    if(m.path.length){
      /* live straightening: hop to the next waypoint as soon as the walk
         there is clear — repaths mid-chase otherwise re-introduce zig-zag */
      if(m.path.length>1 && corridorClear(m.pos.x,m.pos.z,m.path[1].x,m.path[1].z)) m.path.shift();
      const wp=m.path[0], wx=wp.x-m.pos.x, wz=wp.z-m.pos.z, wl=Math.hypot(wx,wz);
      if(wl<0.5) m.path.shift();
      else { m.pos.x+=wx/wl*m.curSpeed*dt; m.pos.z+=wz/wl*m.curSpeed*dt; m.faceAng=Math.atan2(wx,wz); }
    } else if(m.state==="chase"){
      const dl=d||1;
      /* never beeline into a wall cell — ending up inside one used to brick
         every later BFS start (the "spawned but never pathing" bug) */
      const nx=m.pos.x+dx/dl*m.curSpeed*dt, nz=m.pos.z+dz/dl*m.curSpeed*dt;
      const cc=worldToCell(nx,nz);
      if(!isWall(cc.cx,cc.cy)){ m.pos.x=nx; m.pos.z=nz; }
      m.faceAng=Math.atan2(dx,dz);
    }
  }
  const movedSpeed=Math.hypot(m.pos.x-prevX,m.pos.z-prevZ)/Math.max(dt,1e-5);

  /* ---- the body: gait from the ground it actually covered ---- */
  poseMonster(dt, movedSpeed, m.state==="chase"? "chase" : m.state==="alert"? "alert" : "calm");
  twitchHead(dt, m.state==="chase"||m.state==="alert");
  m.mesh.position.set(m.pos.x, 0, m.pos.z);
  const turnRate = m.state==="alert"? 0.16 : 0.1;   // deliberate, unsettling turn
  m.mesh.rotation.y = angLerp(m.mesh.rotation.y, m.faceAng, 1-Math.pow(1-turnRate,dt*60));

  /* kill reach +25% (was 1.25) — it can actually land the grab now. The world
     freezes on this frame, so the pose it is left in is what the death camera
     looks up at: squared to you, bent over you, both arms out. */
  if(d<1.5625){
    m.faceAng=Math.atan2(dx,dz); m.mesh.rotation.y=m.faceAng;
    poseMonster(0,0,"kill");
    const H=m.mesh.userData.B.head, r=H.userData.rest; H.rotation.set(r[0],r[1],r[2]);
    die();
  }

  /* ---- wall knocking: when it lingers, it walks up close to the nearest
     wall and raps on it ---- */
  const calm = m.state==="wander"||m.state==="hunt";
  if(!calm) m.knockMove=null;
  if(m.knockMove){
    if(Math.hypot(m.knockMove.x-m.pos.x,m.knockMove.z-m.pos.z)<=0.15){
      m.faceAng=m.knockMove.face;
      /* near-global volume: gentle falloff keeps a sense of distance &
         direction without ever making the knocks easy to miss */
      const vol=0.72*(0.45+0.55*clamp(1-d/80,0,1));
      sfxKnock(vol, 2+Math.floor(Math.random()*3), panTo(m.pos.x,m.pos.z));
      m.knockAnim=0.9;                        // the arm comes up and raps with it
      m.knockMove=null;
      m.knockT=rand(1.7,4.0);
    }
  } else if(calm && movedSpeed<0.25){
    m.knockT-=dt;
    if(m.knockT<=0){
      m.knockT=rand(1.7,4.0);
      const c=worldToCell(m.pos.x,m.pos.z);
      let wallDir=null;
      for(const[wx,wy]of[[1,0],[-1,0],[0,1],[0,-1]])
        if(isWall(c.cx+wx,c.cy+wy)){wallDir=[wx,wy];break;}
      if(wallDir){
        /* step in close to the wall face before rapping on it */
        const cw=cellToWorld(c.cx,c.cy);
        m.knockMove={x:cw.x+wallDir[0]*(CELL/2-0.55), z:cw.z+wallDir[1]*(CELL/2-0.55),
                     face:Math.atan2(wallDir[0],wallDir[1])};
      }
    }
  } else m.knockT=Math.max(m.knockT,1.4);   // brief settle time after it stops

  /* ---- continuous audio: breathing, groans, proximity bed, heartbeat ----
     NOT while dead. The kill above calls die(), which ramps the bed and the
     breathing to zero — and then this frame carried on and wrote them both
     straight back at point-blank range. main.js stops calling this function
     the instant STATE.dead is set, so that value was the LAST one either
     gain ever received: the entity's drone sat under the death card, under
     the menu and straight through the respawn, forever. A sustained gain
     may only be written by a frame the world is still running in. */
  const prox = clamp(1 - d/22, 0, 1);
  if(AU.ctx && !STATE.dead){
    const t=AU.ctx.currentTime;
    /* all entity noise +20% in v1.5 (bed 0.30→0.36 / 0.17→0.204) */
    const bedGain = (m.state==="chase"||m.state==="alert")? prox*0.36 : prox*0.204;
    AU.proxGain.gain.setTargetAtTime(bedGain, t, 0.25);
    AU.proxOsc.frequency.setTargetAtTime(46+prox*30, t, 0.4);
    const breathTarget = (m.state==="chase")? clamp(1-d/28,0,1)*0.54 : clamp(1-d/18,0,1)*0.29;
    AU.breathGain.gain.setTargetAtTime(breathTarget, t, 0.35);
    /* keep its constant sounds glued to its true direction */
    const entPan=panTo(m.pos.x,m.pos.z);
    if(AU.breathPan) AU.breathPan.pan.setTargetAtTime(entPan, t, 0.15);
    if(AU.proxPan)   AU.proxPan.pan.setTargetAtTime(entPan*0.7, t, 0.2);
  }
  m.groanT-=dt;
  if(m.groanT<=0){
    m.groanT=rand(4.2,9.2);                  // 30% more frequent
    if(d<48) sfxGroan(clamp(1-d/48,0.04,1)*(m.state==="chase"?0.54:0.36),   // +20% louder
                      panTo(m.pos.x,m.pos.z));
  }
  setFx(ui.dread, m.state==="chase"? (0.35+prox*0.6) : prox*0.55);
  /* analogue static climbs as it closes in — strongest when it could touch you */
  setFx(ui.staticfx, prox<=0? 0
    : Math.pow(prox,1.6)*0.4 + (d<2.6? (1-d/2.6)*0.26 : 0));
  AU.heartTimer-=dt;
  if(prox>0.25 && AU.heartTimer<=0){ sfxHeartbeat(); AU.heartTimer = lerp(1.4,0.45,prox); }
}
