/* ---------------- the librarian — THE END's protector ----------------
   An eldritch spider the size of a small horse. It pads between the
   stacks, scratching at shelves as it peruses. It is nearly blind and it
   does not need to see you: it hears.

   The rules (from the design TODO):
   · Picking up a floppy disk alerts it to that spot after a flat 1s
     reaction, any distance. Beyond 45% of the room span it commits to a
     wall/ceiling transit instead of a floor seek.
   · Every further pickup BEFORE it starts moving: −1s off the countdown,
     +0.25× speed. Every pickup before it REACHES the latest pickup spot:
     +0.25× speed (it re-routes to the newest one). Run base = RUN_BASE
     (7.28 m/s, 1.4× its browse pace), multiplier capped at 2×.
   · Moving while not crouched alerts it strongly within ~16.5m walking /
     ~17m sprinting, mildly out to ~25m (base radii 13.6/20.4 × movement &
     surface gains below). Crouched movement is silent.
   · It cannot reach or crawl under the tables. */
import { clamp, lerp, rand } from "./utils.js";
import { CELL } from "./map.js";
import { STATE, spider } from "./state.js";
import { LIB, ROOM_SPAN, LIB_WALL_H, cellToWorld2, worldToCell2, isBlockedSpider, bfsPath2,
         losCells2, underTable, randomReachCell, cellAt, pushFromTables,
         spawnWeb, updateWeb, removeWeb, severWeb } from "./library.js";
import { AU, panTo, sfxHeartbeat, sfxSpiderTap, sfxSpiderScratch, sfxSpiderSniff,
         sfxSpiderShriek, sfxWebSplat, sfxWebSnap } from "./audio.js";
import { texSpiderAbd, texSpiderCarapace, texSpiderLimb, texSpiderFur } from "./textures.js";
import { markShared } from "./scene.js";
import { ui } from "./ui.js";
import { die } from "./lifecycle.js";

const RUN_BASE=7.28;                    // base run speed (chase/seekRun) = ×1.4 of browse

/* ---- sniff fits ----------------------------------------------------
   The cooldown is armed the moment a fit STARTS, not when it ends. It
   used to be armed only on the last puff, which left `sniffCD<=0` true
   for the whole fit — and every trigger site is guarded by exactly that.
   A player moving without line of sight close to the spider re-forces
   `seek` every frame (the hearing block outranks `investigate`), so the
   seek→investigate transition re-fired every frame, refilled `sniffsLeft`
   before it could ever reach 0, and the huffing never stopped. Arming up
   front makes the guard mean what it says; the drain below re-arms from
   the fit's end so the long quiet is still measured from the last puff. */
function startSniffFit(s,n,t0){
  if(s.sniffCD>0) return;
  s.sniffsLeft=n; s.sniffT=t0; s.sniffCD=rand(22,38);
}

/* ================= the body =================
   A horse-sized hunting spider, built as an animal rather than an assembly
   of primitives. What each part is for:

   · Every leg is ONE swept tube through all seven segments — coxa,
     trochanter, femur, patella, tibia, metatarsus, tarsus — swollen
     mid-segment, pinched at each joint, pale at the articular membrane and
     darkening to the distal end, the way a real leg is annulated. Nothing
     below femG moves, so the bends are baked into the sweep and a joint is
     never a gap between two pipes.
   · The KNEE is the highest point of the animal: the femur rises steeply
     and the patella turns the leg down, so eight knees stand over the body.
     That silhouette is most of the fear.
   · The legs are not one length (I and IV long, III short). Each leg solves
     its own resting pitch to put its claws on the floor, and carries its
     own foot vector for the gait's terrain probe.
   · All eight legs leave the PROSOMA, and the prosoma, eyes, mouthparts and
     legs all hang off the head group, which pitches about the pedicel to
     sniff — so nothing detaches when it puts its face to the floor. Each
     leg carries the pitch that keeps its foot planted at a full sniff.
   · Hair is geometry, merged into the part it grows on: fine setae over
     every segment, stout spines down the tibia and metatarsus, the
     trichobothria — long listening hairs, for a thing that hunts by
     sound — standing off the tops of the shins, scopula tufts under the
     feet. The abdomen wears a velvet undercoat as SHELL FUR under its
     long bristles.
   · The face: a raised ocular mound with eight lenses in two rows and an
     eyeshine that only shows when they face you; heavy hairy chelicerae
     whose fangs unfold when it commits; five-segment pedipalps that feel
     the air and reach down when it sniffs.

   Contract with the gait: userData {legs, eyeMat, abd, head, BODY_Y, ABD_Z,
   scratchAnim, sniffAnim, abdTilt}; each leg {hip, femG, basePhi, phase,
   front, row, fold, pitch0, tipX, tipY, sniffComp}. `abd.scale` is
   overwritten every frame to (1, 0.9, ABD_SZ), and TAIL_LOCAL is derived
   from the same numbers. */
const SP_BODY_Y=1.5, HIP_Y=SP_BODY_Y-0.06;
const ABD_HALF=0.72, ABD_R=0.74, ABD_SZ=1.35, ABD_Z=-1.25;
const CAR_LEN=1.34, CAR_R=0.60, CAR_Z=0.30;
const PIV_Z=-0.36;                        // the pedicel: the head group pitches about it
const SNIFF_TILT=0.30, SNIFF_DROP=0.06;
/* per row, front to back: splay (radians toward the head), length scale,
   hip position on the prosoma's margin */
const LEG_ROWS=[
  {phi:1.00, k:1.06, z:0.64, x:0.44},
  {phi:0.36, k:1.00, z:0.40, x:0.53},
  {phi:-0.30,k:0.90, z:0.14, x:0.54},
  {phi:-0.95,k:1.08, z:-0.10,x:0.47},
];
/* the leg in femG's frame (femur along +x before pitch):
   [length, bend from the previous segment, r0, r1, mid-segment swell] */
const LEG_SEGS=[
  [0.22, 0,    0.120,0.114,0.15],     // coxa — starts inside the body
  [0.10, 0,    0.096,0.094,0.10],     // trochanter
  [1.14, 0,    0.112,0.090,0.12],     // femur, to the knee
  [0.22,-1.15, 0.089,0.080,0.22],     // patella: the knee's cap, the high point
  [1.35,-0.85, 0.077,0.058,0.06],     // tibia
  [1.10, 0.15, 0.052,0.035,0.00],     // metatarsus
  [0.34, 0.50, 0.030,0.011,0.00],     // tarsus: the foot
];
const LEG_J=(()=>{
  const J=[new THREE.Vector2(-0.06,0)]; let a=0;
  for(const [len,bend] of LEG_SEGS){
    a+=bend; const p=J[J.length-1];
    J.push(new THREE.Vector2(p.x+Math.cos(a)*len, p.y+Math.sin(a)*len));
  }
  return J;
})();
const sstep=(a,b,x)=>{ const t=clamp((x-a)/(b-a),0,1); return t*t*(3-2*t); };

const _SPIDER_MATS=()=>({
  /* Near-neutral, near-black. Warm browns here times the lantern's orange
     multiply out to BRONZE and the animal looks cast, not grown. The
     abdomen wants a BROAD weak sheen (a tight bright one on a big smooth
     surface is a balloon); the carapace is the one hard glossy plate. */
  body:new THREE.MeshPhongMaterial({map:texSpiderAbd, color:0x524e49, vertexColors:true,
    specular:0x0c0a08, shininess:7}),
  car:new THREE.MeshPhongMaterial({map:texSpiderCarapace, color:0x4c4a48, vertexColors:true,
    specular:0x1a1918, shininess:44}),
  limb:new THREE.MeshPhongMaterial({map:texSpiderLimb, color:0x3c3b3a, vertexColors:true,
    specular:0x0e0d0c, shininess:30}),
  /* the chelicerae carry a faint cold sheen, the fangs a hard glassy one */
  cheli:new THREE.MeshPhongMaterial({map:texSpiderLimb, color:0x4a4845, vertexColors:true,
    specular:0x1c2322, shininess:34}),
  fang:new THREE.MeshPhongMaterial({color:0x22120e, vertexColors:true,
    specular:0x6a6866, shininess:110}),
  /* the lens is black glass; what the gait drives is `eye`, a control the
     lens and the eyeshine both read — written straight onto the lens, the
     red flooded all eight into glowing beads */
  lens:new THREE.MeshPhongMaterial({color:0x040303, emissive:0x000000,
    specular:0xd8d8d8, shininess:160}),
  eye:{emissive:new THREE.Color(0x3a0805)},
});
markShared(texSpiderAbd,texSpiderCarapace,texSpiderLimb,texSpiderFur);

/* ---- geometry accumulation ----
   Every part of the body is poured into one of these and comes out as one
   BufferGeometry per material: position, normal, uv and a grey vertex
   colour that multiplies the map (annulation, hair tips, the sternum). */
const _hA=new THREE.Vector3(), _hB=new THREE.Vector3(), _hC=new THREE.Vector3(),
      _hX=new THREE.Vector3(1,0,0), _hY=new THREE.Vector3(0,1,0), _hN=new THREE.Vector3();
class PartAcc{
  constructor(){ this.P=[]; this.N=[]; this.U=[]; this.C=[]; this.I=[]; }
  get n(){ return this.P.length/3; }
  vert(x,y,z,nx,ny,nz,u,v,c){ this.P.push(x,y,z); this.N.push(nx,ny,nz); this.U.push(u,v); this.C.push(c,c,c); }
  /* a hair: a three-sided spike from p along unit d. Flat-shaded — it is
     too thin for a smooth normal to mean anything, and a flat facet is
     what catches a glint. c0 at the root, c1 at the tip. */
  hair(p,d,len,r,c0,c1){
    _hA.crossVectors(d,Math.abs(d.y)<0.9? _hY:_hX).normalize();
    _hB.crossVectors(d,_hA);
    const tx=p.x+d.x*len, ty=p.y+d.y*len, tz=p.z+d.z*len, B=[];
    for(let i=0;i<3;i++){
      const a=i/3*Math.PI*2, c=Math.cos(a)*r, s=Math.sin(a)*r;
      B.push([p.x+_hA.x*c+_hB.x*s, p.y+_hA.y*c+_hB.y*s, p.z+_hA.z*c+_hB.z*s]);
    }
    for(let i=0;i<3;i++){
      const b0=B[i], b1=B[(i+1)%3];
      _hC.set(b1[0]-b0[0],b1[1]-b0[1],b1[2]-b0[2]);
      _hN.set(tx-b0[0],ty-b0[1],tz-b0[2]).cross(_hC).negate().normalize();
      const k=this.n;
      this.vert(b0[0],b0[1],b0[2],_hN.x,_hN.y,_hN.z,0.5,0.5,c0);
      this.vert(b1[0],b1[1],b1[2],_hN.x,_hN.y,_hN.z,0.5,0.5,c0);
      this.vert(tx,ty,tz,_hN.x,_hN.y,_hN.z,0.5,0.5,c1);
      this.I.push(k,k+1,k+2);
    }
  }
  /* bake a finished geometry in, through matrix m, tinted c */
  add(geo,m,c=1){
    const p=geo.attributes.position, nr=geo.attributes.normal, uv=geo.attributes.uv;
    const nm=new THREE.Matrix3().getNormalMatrix(m), base=this.n;
    for(let i=0;i<p.count;i++){
      _hA.fromBufferAttribute(p,i).applyMatrix4(m);
      _hB.fromBufferAttribute(nr,i).applyMatrix3(nm).normalize();
      this.vert(_hA.x,_hA.y,_hA.z,_hB.x,_hB.y,_hB.z, uv?uv.getX(i):0.5, uv?uv.getY(i):0.5, c);
    }
    if(geo.index) for(let i=0;i<geo.index.count;i++) this.I.push(base+geo.index.getX(i));
    else for(let i=0;i<p.count;i++) this.I.push(base+i);
  }
  /* a tube swept along a path lying in this part's xy-plane. z is square to
     every tangent, so the frame is exact and never twists. R/C per sample,
     `vRep` metres per texture repeat; u=0 is the dorsal (convex) side. */
  sweep(path,R,C,radial,vRep){
    const n=path.length, base=this.n; let arc=0;
    for(let i=0;i<n;i++){
      const a=path[Math.max(0,i-1)], b=path[Math.min(n-1,i+1)];
      const tl=Math.hypot(b.x-a.x,b.y-a.y)||1, Tx=(b.x-a.x)/tl, Ty=(b.y-a.y)/tl;
      if(i>0) arc+=Math.hypot(path[i].x-path[i-1].x,path[i].y-path[i-1].y);
      for(let k=0;k<=radial;k++){
        const th=k/radial*Math.PI*2, c=Math.cos(th), s=Math.sin(th);
        const nx=-Ty*c, ny=Tx*c, nz=s;
        this.vert(path[i].x+nx*R[i], path[i].y+ny*R[i], nz*R[i], nx,ny,nz, k/radial, arc/vRep, C[i]);
      }
    }
    for(let i=0;i<n-1;i++) for(let k=0;k<radial;k++){
      const a=base+i*(radial+1)+k, b=a+1, c=a+radial+1, d=c+1;
      this.I.push(a,b,c, b,d,c);
    }
  }
  geometry(){
    const g=new THREE.BufferGeometry();
    g.setAttribute("position",new THREE.Float32BufferAttribute(this.P,3));
    g.setAttribute("normal",new THREE.Float32BufferAttribute(this.N,3));
    g.setAttribute("uv",new THREE.Float32BufferAttribute(this.U,2));
    g.setAttribute("color",new THREE.Float32BufferAttribute(this.C,3));
    g.setIndex(this.I);
    return g;
  }
}
/* a lathe's seam and poles duplicate vertices; after a deformation and
   computeVertexNormals they shade as creases. Average every coincident set. */
function weldNormals(g){
  const p=g.attributes.position, n=g.attributes.normal, map=new Map();
  for(let i=0;i<p.count;i++){
    const k=`${Math.round(p.getX(i)*1e4)},${Math.round(p.getY(i)*1e4)},${Math.round(p.getZ(i)*1e4)}`;
    let a=map.get(k); if(!a) map.set(k,a=[]); a.push(i);
  }
  for(const a of map.values()){
    if(a.length<2) continue;
    _hA.set(0,0,0);
    for(const i of a) _hA.x+=n.getX(i), _hA.y+=n.getY(i), _hA.z+=n.getZ(i);
    _hA.normalize();
    for(const i of a) n.setXYZ(i,_hA.x,_hA.y,_hA.z);
  }
}
/* a lathe turned onto the body axis: profile runs front(t=0) → rear(t=1),
   u wraps the body with u=0.5 on the dorsal midline, v runs front → rear */
function bodyLathe(prof,len,rad,seg){
  const pts=prof.map(([t,r])=>new THREE.Vector2(Math.max(r*rad,0.001), t*len));
  const g=new THREE.LatheGeometry(pts,seg,-Math.PI,Math.PI*2);
  g.rotateX(-Math.PI/2);            // +Y (profile axis) → −Z (toward the rear)
  g.translate(0,0,len/2);           // centre it on its own origin
  return g;
}
/* a profile smoothed to n samples, and a lookup into it */
function smoothProf(pts,n){
  const c=new THREE.SplineCurve(pts.map(([t,r])=>new THREE.Vector2(t,r)));
  const out=c.getPoints(n).map(v=>[clamp(v.x,0,1),Math.max(v.y,0.001)]);
  out[0]=[0,0.001]; out[out.length-1]=[1,0.001];
  return out;
}
function profAt(prof,t){
  let i=0; while(i<prof.length-2 && prof[i+1][0]<t) i++;
  const [t0,r0]=prof[i], [t1,r1]=prof[i+1];
  return r0+(r1-r0)*clamp((t-t0)/Math.max(t1-t0,1e-6),0,1);
}
/* a straight tapered tube from p along d (a spinneret, a claw) */
function tube(acc,p,d,len,r0,r1,c,radial=8){
  const geo=new THREE.CylinderGeometry(r1,r0,len,radial,1);
  geo.translate(0,len/2,0);
  const m=new THREE.Matrix4().compose(p,new THREE.Quaternion().setFromUnitVectors(_hY,d.clone().normalize()),
    new THREE.Vector3(1,1,1));
  acc.add(geo,m,c); geo.dispose();
}

/* ---- the carapace: a lathe, flattened, then SCULPTED — the head region
   standing higher than the thorax, a mound under the eyes, the fovea, the
   cervical groove and the radial striae running out toward the coxae ---- */
const CAR_PROF=smoothProf([[0,0.001],[0.02,0.26],[0.06,0.46],[0.12,0.62],[0.2,0.76],[0.3,0.88],
  [0.42,0.97],[0.55,1],[0.68,0.97],[0.8,0.87],[0.9,0.68],[0.96,0.44],[1,0.001]],44);
const _dSeg=(px,pz,ax,az,bx,bz)=>{
  const vx=bx-ax, vz=bz-az, t=clamp(((px-ax)*vx+(pz-az)*vz)/(vx*vx+vz*vz),0,1);
  return Math.hypot(px-ax-vx*t, pz-az-vz*t);
};
function carDeform(x,y,z){
  let yy=y>0? y*0.62 : y*0.48;
  /* pear-shaped from above: the head region narrower than the thorax */
  x*=0.95-0.16*sstep(0.0,0.75,z/(CAR_LEN/2));
  if(y>0){
    const w=y/(Math.hypot(x,y)||1);                 // 1 on the top, 0 at the margin
    const zf=z/(CAR_LEN/2), ax=Math.abs(x);
    yy+=0.10*w*sstep(-0.25,0.45,zf);                 // the cephalic region stands up
    yy+=0.05*w*Math.exp(-(x*x)/(0.15*0.15)-((z-0.47)*(z-0.47))/(0.13*0.13));   // ocular mound
    yy-=0.06*w*Math.exp(-(x*x)/(0.024*0.024)-((z+0.10)*(z+0.10))/(0.075*0.075)); // the fovea
    const dv=_dSeg(ax,z,0,-0.06,0.34,0.24);          // cervical groove
    yy-=0.035*w*Math.exp(-dv*dv/(0.03*0.03));
    const df=Math.hypot(x,z+0.10);
    for(const r of LEG_ROWS){                        // striae to each coxa
      const d=_dSeg(ax,z,0,-0.10,r.x+0.1,r.z-CAR_Z);
      yy-=0.026*w*Math.exp(-d*d/(0.026*0.026))*sstep(0.1,0.24,df);
    }
  }
  return [x,yy,z];
}
/* a point on the sculpted shell: t down the profile from the snout, `ang`
   from the dorsal midline. Eyes are seated with this, so they sit ON the
   skin the mesh actually has. */
function carSurf(t,ang){
  const r=profAt(CAR_PROF,t)*CAR_R;
  return carDeform(r*Math.sin(ang), r*Math.cos(ang), CAR_LEN/2-t*CAR_LEN);
}
function carNormal(t,ang){
  const p=carSurf(t,ang), a=carSurf(t+0.004,ang), b=carSurf(t,ang+0.01);
  _hA.set(a[0]-p[0],a[1]-p[1],a[2]-p[2]);
  _hB.set(b[0]-p[0],b[1]-p[1],b[2]-p[2]);
  const n=new THREE.Vector3().crossVectors(_hB,_hA).normalize();
  if(n.x*p[0]+n.y*p[1]<0) n.negate();
  return n;
}
function buildProsoma(M){
  const acc=new PartAcc();
  const g=bodyLathe(CAR_PROF,CAR_LEN,CAR_R,44);
  const p=g.attributes.position;
  for(let i=0;i<p.count;i++){ const [x,y,z]=carDeform(p.getX(i),p.getY(i),p.getZ(i)); p.setXYZ(i,x,y,z); }
  g.computeVertexNormals(); weldNormals(g);
  acc.add(g,new THREE.Matrix4(),1); g.dispose();
  /* the sternum and labium, dark plates under the belly of the prosoma */
  const st=new THREE.SphereGeometry(0.27,22,10);
  acc.add(st,new THREE.Matrix4().compose(new THREE.Vector3(0,-0.235,-0.02),new THREE.Quaternion(),
    new THREE.Vector3(1,0.16,1.3)),0.5); st.dispose();
  const lb=new THREE.SphereGeometry(0.1,12,8);
  acc.add(lb,new THREE.Matrix4().compose(new THREE.Vector3(0,-0.24,0.45),new THREE.Quaternion(),
    new THREE.Vector3(1,0.35,0.8)),0.45); lb.dispose();
  /* the pelt: a fringe round the margin, a short coat laid back over the
     thorax, and a few long bristles standing up among the eyes */
  const d=new THREE.Vector3(), q=new THREE.Vector3();
  for(let i=0;i<150;i++){
    const t=rand(0.12,0.95), ang=(Math.random()<0.5?-1:1)*rand(1.25,1.6);
    const s=carSurf(t,ang), n=carNormal(t,ang);
    d.set(n.x,n.y-0.8,n.z-0.35).normalize();
    acc.hair(q.set(s[0],s[1],s[2]),d,rand(0.05,0.11),0.005,0.7,1.5);
  }
  for(let i=0;i<120;i++){
    const t=rand(0.3,0.9), ang=rand(-1.2,1.2);
    const s=carSurf(t,ang), n=carNormal(t,ang);
    d.set(n.x*0.5,n.y*0.5,-1).normalize();
    acc.hair(q.set(s[0],s[1],s[2]),d,rand(0.04,0.08),0.004,0.8,1.5);
  }
  for(let i=0;i<9;i++){
    const t=rand(0.1,0.24), ang=rand(-0.5,0.5);
    const s=carSurf(t,ang), n=carNormal(t,ang);
    d.set(n.x*0.6,n.y+0.4,0.7).normalize();
    acc.hair(q.set(s[0],s[1],s[2]),d,rand(0.12,0.2),0.005,0.6,1.3);
  }
  return new THREE.Mesh(acc.geometry(),M.car);
}
/* ---- eight eyes, two rows, seated on the sculpted shell ----
   Anterior row low on the face (the medians the big forward pair), the
   posterior row recurved over it, the laterals out on the shoulders of the
   mound. Lenses, not beads: flattened along their own normal. */
const EYES=[[0.050,0.30,0.05],[0.068,0.78,0.032],[0.108,0.26,0.038],[0.140,0.74,0.036]];
function buildEyes(M){
  const acc=new PartAcc(), P=[], Nn=[], Rr=[];
  for(const [t,ang,r] of EYES) for(const s of[-1,1]){
    const a=s*ang, sp=carSurf(t,a), n=carNormal(t,a);
    const c=new THREE.Vector3(sp[0],sp[1],sp[2]).addScaledVector(n,r*0.04);
    const geo=new THREE.SphereGeometry(r,16,12);
    const m=new THREE.Matrix4().compose(c,new THREE.Quaternion().setFromUnitVectors(_hY,n),
      new THREE.Vector3(1,0.52,1));
    acc.add(geo,m,1); geo.dispose();
    P.push(c.x+n.x*r*0.45,c.y+n.y*r*0.45,c.z+n.z*r*0.45); Nn.push(n.x,n.y,n.z); Rr.push(r);
  }
  const eyes=new THREE.Mesh(acc.geometry(),M.lens);
  eyes.onBeforeRender=()=>{ M.lens.emissive.copy(M.eye.emissive).multiplyScalar(0.28); };
  /* eyeshine: a retroreflection, so it shows only when the lens is turned
     toward you and fades with the fog. Additive, depth-tested, one draw. */
  const gg=new THREE.BufferGeometry();
  gg.setAttribute("position",new THREE.Float32BufferAttribute(P,3));
  gg.setAttribute("eyeN",new THREE.Float32BufferAttribute(Nn,3));
  gg.setAttribute("eyeR",new THREE.Float32BufferAttribute(Rr,1));
  const gm=new THREE.ShaderMaterial({
    uniforms:{uCol:{value:new THREE.Color()}, uScale:{value:400}, uFog:{value:new THREE.Vector2(10,60)}},
    vertexShader:`attribute vec3 eyeN; attribute float eyeR;
      uniform float uScale; uniform vec2 uFog; varying float vA;
      void main(){
        vec4 wp=modelMatrix*vec4(position,1.0);
        vec3 wn=normalize(mat3(modelMatrix)*eyeN);
        vec4 mv=viewMatrix*wp;
        float face=smoothstep(0.15,0.85,dot(wn,normalize(cameraPosition-wp.xyz)));
        vA=face*(1.0-smoothstep(uFog.x,uFog.y,-mv.z));
        gl_PointSize=uScale*eyeR*1.6/max(-mv.z,0.05);
        gl_Position=projectionMatrix*mv;
      }`,
    fragmentShader:`uniform vec3 uCol; varying float vA;
      void main(){
        vec2 c=gl_PointCoord-0.5; float d=dot(c,c)*4.0;
        float a=(exp(-d*14.0)+0.12*exp(-d*2.5))*vA;
        gl_FragColor=vec4(uCol*a,1.0);
      }`,
    transparent:true, depthWrite:false, blending:THREE.AdditiveBlending});
  const glow=new THREE.Points(gg,gm);
  const _sz=new THREE.Vector2();
  glow.onBeforeRender=(r,sc,cam)=>{
    r.getDrawingBufferSize(_sz);
    gm.uniforms.uScale.value=_sz.y/(2*Math.tan((cam.fov||60)*Math.PI/360));
    if(sc.fog) gm.uniforms.uFog.value.set(sc.fog.near,sc.fog.far);
    gm.uniforms.uCol.value.copy(M.eye.emissive).multiplyScalar(2.2);
  };
  glow.frustumCulled=false;
  return [eyes,glow];
}
/* ---- a limb: joints in the part's own xy-plane, swept through a
   centripetal spline that runs straight down each segment and turns tight
   at each joint. Returns the samples with their segment and fraction. ---- */
function limbPath(J,step){
  const ctrl=[J[0]];
  for(let i=0;i<J.length-1;i++){
    const a=J[i], b=J[i+1];
    ctrl.push(a.clone().lerp(b,0.06), a.clone().lerp(b,0.94), b.clone());
  }
  const curve=new THREE.SplineCurve(ctrl), cl=curve.getLength();
  const pts=curve.getSpacedPoints(Math.max(8,Math.ceil(cl/step)));
  const cum=[0]; for(let i=1;i<J.length;i++) cum.push(cum[i-1]+J[i].distanceTo(J[i-1]));
  const k=cum[cum.length-1]/cl;
  return pts.map((p,i)=>{
    const s=i/(pts.length-1)*cl*k;
    let seg=0; while(seg<J.length-2 && cum[seg+1]<s) seg++;
    const t=clamp((s-cum[seg])/Math.max(cum[seg+1]-cum[seg],1e-6),0,1);
    return {p,seg,t,m:s-cum[seg], left:cum[seg+1]-s};
  });
}
/* where on the limb a hair grows: the surface point for a sample and an
   angle round it (0 = dorsal), plus the tangent and outward radial there */
function limbSite(S,i,th,R){
  const a=S[Math.max(0,i-1)].p, b=S[Math.min(S.length-1,i+1)].p;
  const tl=Math.hypot(b.x-a.x,b.y-a.y)||1, T=new THREE.Vector3((b.x-a.x)/tl,(b.y-a.y)/tl,0);
  const rad=new THREE.Vector3(-T.y*Math.cos(th),T.x*Math.cos(th),Math.sin(th));
  const p=new THREE.Vector3(S[i].p.x,S[i].p.y,0).addScaledVector(rad,R*0.92);
  return {p,T,rad};
}
function buildLeg(M,k){
  const acc=new PartAcc();
  const J=LEG_J.map(v=>v.clone().multiplyScalar(k));
  const S=limbPath(J,0.045*k);
  const R=[], C=[];
  for(const q of S){
    const [len,,r0,r1,bul]=LEG_SEGS[q.seg];
    let r=lerp(r0,r1,q.t)*(1+bul*Math.sin(Math.PI*q.t));
    /* the articular membrane: a pinch either side of every joint */
    const dj=Math.min(q.m,q.left)/k;
    if(q.seg>0||q.m>0.05) r*=1-0.13*Math.exp(-(dj*dj)/(0.045*0.045));
    R.push(r*k);
    /* annulation: pale at the membrane, darkening down each segment */
    let c=1-0.34*sstep(0.55,1,q.t);
    if(q.seg>=3) c+=1.2*Math.exp(-Math.pow((q.m/k-0.035)/0.03,2));
    C.push(c);
  }
  acc.sweep(S.map(q=>q.p),R,C,11,1.5);
  const at=(seg,t)=>{ let i=S.findIndex(q=>q.seg===seg&&q.t>=t); return i<0? S.length-1:i; };
  const d=new THREE.Vector3();
  /* fine setae over everything past the trochanter, laid toward the foot */
  for(let n=0;n<80;n++){
    const seg=2+Math.floor(Math.random()*5), i=at(seg,rand(0.05,0.95));
    const {p,T,rad}=limbSite(S,i,rand(0,Math.PI*2),R[i]);
    const e=rand(0.35,0.75); d.copy(T).multiplyScalar(Math.cos(e)).addScaledVector(rad,Math.sin(e));
    acc.hair(p,d,rand(0.05,0.12)*k,0.0045*k,0.55,1.6);
  }
  /* macrosetae: stout spines, ventral and lateral, down the shin */
  for(let n=0;n<14;n++){
    const seg=n<3? 2 : 4+(n%2), i=at(seg,rand(0.12,0.9));
    const th=seg===2? rand(-0.5,0.5) : Math.PI+(Math.random()<0.5?-1:1)*rand(0.35,1.1);
    const {p,T,rad}=limbSite(S,i,th,R[i]);
    const e=rand(0.4,0.65); d.copy(T).multiplyScalar(Math.cos(e)).addScaledVector(rad,Math.sin(e));
    acc.hair(p,d,rand(0.10,0.19)*k,0.011*k,0.3,0.75);
  }
  /* trichobothria: long, fine, standing straight off the top of the shin */
  for(let n=0;n<6;n++){
    const i=at(4+(n%2),rand(0.2,0.8));
    const {p,T,rad}=limbSite(S,i,rand(-0.35,0.35),R[i]);
    const e=rand(1.15,1.45); d.copy(T).multiplyScalar(Math.cos(e)).addScaledVector(rad,Math.sin(e));
    acc.hair(p,d,rand(0.16,0.27)*k,0.003*k,0.8,1.4);
  }
  /* scopula: the dense pad under the foot */
  for(let n=0;n<18;n++){
    const i=at(n<12?6:5,n<12? rand(0.05,0.9):rand(0.7,0.98));
    const {p,T,rad}=limbSite(S,i,Math.PI+rand(-0.9,0.9),R[i]);
    const e=rand(0.9,1.3); d.copy(T).multiplyScalar(Math.cos(e)).addScaledVector(rad,Math.sin(e));
    acc.hair(p,d,rand(0.03,0.055)*k,0.005*k,0.6,1.0);
  }
  /* the claws: a pair of hooks off the end of the tarsus */
  const tip=S[S.length-1].p, pre=S[S.length-3].p;
  const T=new THREE.Vector3(tip.x-pre.x,tip.y-pre.y,0).normalize();
  for(const s of[-1,1]){
    const base=new THREE.Vector3(tip.x,tip.y,s*0.008*k);
    const d1=new THREE.Vector3(T.x+T.y*0.5,T.y-T.x*0.5,s*0.25).normalize();
    tube(acc,base,d1,0.05*k,0.010*k,0.006*k,0.4,5);
    const b2=base.clone().addScaledVector(d1,0.05*k);
    const d2=new THREE.Vector3(T.x+T.y*1.4,T.y-T.x*1.4,s*0.2).normalize();
    tube(acc,b2,d2,0.04*k,0.006*k,0.001,0.4,5);
  }
  return {mesh:new THREE.Mesh(acc.geometry(),M.limb), tip:J[J.length-1]};
}
/* the resting pitch that puts a foot (tip in femG's frame) on the floor */
function footPitch(tip,hipH){
  const R=tip.length(), phi=Math.atan2(tip.y,tip.x);
  const s=Math.asin(clamp(-(hipH-0.02)/R,-1,1));
  const p=s-phi;
  return (p>-0.2&&p<1.5)? p : Math.PI-s-phi;
}
/* ---- a pedipalp: a small leg, five segments, ending in a hairy tarsus ---- */
function buildPalp(M){
  const acc=new PartAcc();
  const segs=[[0.12,-0.2,0.052,0.048],[0.07,0.2,0.046,0.044],[0.34,0.35,0.046,0.040],
              [0.12,-0.75,0.040,0.038],[0.26,-0.7,0.036,0.032],[0.24,-0.25,0.032,0.018]];
  const J=[new THREE.Vector2(-0.04,0)]; let a=0;
  for(const [len,bend] of segs){ a+=bend; const p=J[J.length-1]; J.push(new THREE.Vector2(p.x+Math.cos(a)*len,p.y+Math.sin(a)*len)); }
  const S=limbPath(J,0.03), R=[], C=[];
  for(const q of S){
    const [,,r0,r1]=segs[q.seg];
    const dj=Math.min(q.m,q.left);
    R.push(lerp(r0,r1,q.t)*(1-0.12*Math.exp(-dj*dj/(0.03*0.03))));
    C.push(1-0.3*sstep(0.6,1,q.t)+(q.seg>=2? 0.6*Math.exp(-Math.pow((q.m-0.025)/0.022,2)):0));
  }
  acc.sweep(S.map(q=>q.p),R,C,9,1.5);
  const d=new THREE.Vector3();
  for(let n=0;n<44;n++){
    const i=Math.floor(rand(0.25,1)*(S.length-1));
    const {p,T,rad}=limbSite(S,i,rand(0,Math.PI*2),R[i]);
    const e=rand(0.35,0.8); d.copy(T).multiplyScalar(Math.cos(e)).addScaledVector(rad,Math.sin(e));
    acc.hair(p,d,rand(0.04,0.1)*(S[i].seg===5?1.3:1),0.004,0.55,1.6);
  }
  return new THREE.Mesh(acc.geometry(),M.limb);
}
/* ---- a chelicera: a heavy hairy basal segment, built along +y in its own
   group, and the fang articulated off its end ---- */
function buildChelicera(M){
  const acc=new PartAcc();
  const prof=[[0,0.075],[0.1,0.1],[0.26,0.112],[0.45,0.104],[0.7,0.082],[0.88,0.06],[0.97,0.035],[1,0.001]];
  const L=0.33;
  const geo=new THREE.LatheGeometry(prof.map(([t,r])=>new THREE.Vector2(Math.max(r,0.001),t*L)),20);
  geo.scale(0.86,1,1);                                  // flattened where the pair meet
  acc.add(geo,new THREE.Matrix4(),1); geo.dispose();
  const d=new THREE.Vector3(), p=new THREE.Vector3();
  for(let n=0;n<130;n++){
    const t=rand(0.05,0.9), th=rand(-2.2,2.2);        // the front and outer faces
    const r=profAt(prof,t)*0.95;
    p.set(Math.sin(th)*r*0.86,t*L,Math.cos(th)*r);
    d.set(Math.sin(th)*0.6,0.7,Math.cos(th)*0.7).normalize();
    acc.hair(p,d,rand(0.04,0.10),0.004,0.5,1.4);
  }
  return {mesh:new THREE.Mesh(acc.geometry(),M.cheli), len:L};
}
function buildFang(M){
  /* a curved horn: out along +y, curling toward +x (the group mirrors it) */
  const acc=new PartAcc(), n=16, pts=[], R=[], C=[];
  let x=0,y=0,a=Math.PI/2;
  for(let i=0;i<=n;i++){
    const u=i/n;
    pts.push(new THREE.Vector2(x,y));
    R.push(lerp(0.036,0.0025,Math.pow(u,0.85)));
    C.push(lerp(0.7,2.2,Math.pow(u,1.6)));              // black at the root, the tip gone to red horn
    const step=0.30/n; a-=1.05/n;
    x+=Math.cos(a)*step; y+=Math.sin(a)*step;
  }
  acc.sweep(pts,R,C,9,1);
  return new THREE.Mesh(acc.geometry(),M.fang);
}
/* ---- the abdomen: a teardrop lathe, spinnerets, and the long bristles ---- */
const ABD_PROF=smoothProf([[0,0.001],[0.03,0.28],[0.08,0.52],[0.16,0.72],[0.28,0.88],[0.42,0.98],
  [0.55,1],[0.68,0.97],[0.8,0.87],[0.89,0.7],[0.95,0.48],[0.985,0.22],[1,0.001]],44);
function abdSurf(t,th){
  const r=profAt(ABD_PROF,t)*ABD_R;
  const y=Math.cos(th)*r;
  return new THREE.Vector3(Math.sin(th)*r, y<0? y*0.9:y, ABD_HALF-t*ABD_HALF*2);
}
function abdBase(){
  const g=bodyLathe(ABD_PROF,ABD_HALF*2,ABD_R,44);
  const p=g.attributes.position;
  for(let i=0;i<p.count;i++) if(p.getY(i)<0) p.setY(i,p.getY(i)*0.9);   // a flatter belly
  g.computeVertexNormals(); weldNormals(g);
  return g;
}
function buildAbdomen(M,base){
  const acc=new PartAcc();
  acc.add(base,new THREE.Matrix4(),1);
  /* spinnerets at the tail: the posterior laterals long and two-jointed,
     cocked up and out — the "fingers" at the back of the animal */
  for(const s of[-1,1]){
    tube(acc,new THREE.Vector3(s*0.055,-0.09,-0.66),new THREE.Vector3(s*0.3,-0.6,-1),0.12,0.05,0.03,0.7);
    const b=new THREE.Vector3(s*0.08,-0.03,-0.68), d1=new THREE.Vector3(s*0.45,0.1,-1);
    tube(acc,b,d1,0.16,0.045,0.035,0.8);
    tube(acc,b.clone().addScaledVector(d1.clone().normalize(),0.16),new THREE.Vector3(s*0.55,0.35,-1),0.13,0.035,0.012,0.9);
    tube(acc,new THREE.Vector3(s*0.025,-0.07,-0.69),new THREE.Vector3(s*0.1,-0.3,-1),0.08,0.025,0.01,0.6);
  }
  /* the long bristles, swept back and up, off the back and flanks */
  const d=new THREE.Vector3();
  for(let i=0;i<260;i++){
    const t=rand(0.04,0.95), th=rand(-2.5,2.5);
    const p=abdSurf(t,th);
    d.set(Math.sin(th)*0.6,Math.cos(th)*0.6+0.15,-1).normalize();
    acc.hair(p,d,rand(0.07,0.2),0.0055,0.5,1.7);
  }
  return new THREE.Mesh(acc.geometry(),M.body);
}
/* the velvet: NS copies of the abdomen shell pushed out along the normal and
   combed toward the tail, each keeping only the strands taller than itself
   (texSpiderFur). One draw, alpha-TESTED so it needs no sorting. */
function buildFur(M,base){
  const NS=12, FL=0.05, p=base.attributes.position, nr=base.attributes.normal, uv=base.attributes.uv;
  const P=[],N=[],U=[],H=[],I=[], n=p.count, idx=base.index;
  for(let s=1;s<=NS;s++){
    const h=s/NS, comb=h*h*FL*0.9;
    for(let i=0;i<n;i++){
      const nx=nr.getX(i), ny=nr.getY(i), nz=nr.getZ(i);
      P.push(p.getX(i)+nx*h*FL, p.getY(i)+ny*h*FL-comb*0.25, p.getZ(i)+nz*h*FL-comb);
      N.push(nx,ny,nz); U.push(uv.getX(i),uv.getY(i)); H.push(h);
    }
    const o=(s-1)*n;
    for(let i=0;i<idx.count;i++) I.push(o+idx.getX(i));
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute("position",new THREE.Float32BufferAttribute(P,3));
  g.setAttribute("normal",new THREE.Float32BufferAttribute(N,3));
  g.setAttribute("uv",new THREE.Float32BufferAttribute(U,2));
  g.setAttribute("aShell",new THREE.Float32BufferAttribute(H,1));
  g.setIndex(I);
  const mat=new THREE.MeshPhongMaterial({map:texSpiderAbd, color:0x57534e, specular:0x0a0907, shininess:5});
  mat.onBeforeCompile=sh=>{
    sh.uniforms.uFur={value:texSpiderFur};
    sh.vertexShader=sh.vertexShader
      .replace("#include <common>","#include <common>\nattribute float aShell;\nvarying float vShell;")
      .replace("#include <begin_vertex>","#include <begin_vertex>\n  vShell=aShell;");
    sh.fragmentShader=sh.fragmentShader
      .replace("#include <common>","#include <common>\nuniform sampler2D uFur;\nvarying float vShell;")
      .replace("#include <map_fragment>",
        "#include <map_fragment>\n  if(texture2D(uFur,vUv*vec2(3.0,2.0)).r<vShell) discard;\n  diffuseColor.rgb*=mix(0.45,1.45,vShell);");
  };
  return new THREE.Mesh(g,mat);
}

export function makeSpider(){
  const M=_SPIDER_MATS();
  const eyeMat=M.eye;
  const g=new THREE.Group();
  const BODY_Y=SP_BODY_Y;

  /* ---- abdomen: in g, not the head — it stays put while the front sniffs */
  const base=abdBase();
  const abd=buildAbdomen(M,base);
  abd.add(buildFur(M,base));
  base.dispose();
  abd.scale.set(1.0,0.9,ABD_SZ); abd.position.set(0,BODY_Y+0.12,ABD_Z); g.add(abd);

  /* ---- the head group, pivoting at the pedicel: prosoma, face, legs ---- */
  const head=new THREE.Group(); head.position.set(0,BODY_Y,PIV_Z); g.add(head);
  const at=(x,y,z)=>new THREE.Vector3(x,y-BODY_Y,z-PIV_Z);      // mesh space → head space
  const pro=buildProsoma(M); pro.position.copy(at(0,BODY_Y,CAR_Z)); head.add(pro);
  const [eyes,glow]=buildEyes(M);
  eyes.position.copy(pro.position); glow.position.copy(pro.position);
  head.add(eyes); head.add(glow);

  /* chelicerae hang under the clypeus, basis built by hand: +y down the
     jaw, +z its front face, +x toward world −x on both. The fang is built
     curling toward its own +x and mirrored for the left, so its rotation
     z is negated there (a mirror about x flips a rotation about z). */
  const fangs=[], palps=[];
  for(const sx of[-1,1]){
    const {mesh,len}=buildChelicera(M);
    const cg=new THREE.Group();
    const Y=new THREE.Vector3(sx*0.12,-1,0.42).normalize();
    const X=new THREE.Vector3(-1,0,0); X.addScaledVector(Y,-X.dot(Y)).normalize();
    const Z=new THREE.Vector3().crossVectors(X,Y);
    cg.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X,Y,Z));
    cg.position.copy(at(sx*0.105,BODY_Y-0.10,CAR_Z+CAR_LEN/2-0.09));
    cg.add(mesh);
    const fg=new THREE.Group(); fg.position.set(0,len*0.9,0.02);
    const fm=buildFang(M); fg.add(fm);
    fg.userData.sx=sx; fg.scale.x=sx; fg.rotation.set(0.5,0,-sx*1.35);
    cg.add(fg); fangs.push(fg);
    head.add(cg);
    /* the palp: yawed to reach forward and a little out */
    const pm=buildPalp(M), pg=new THREE.Group();
    const fx=sx*Math.sin(0.38), fz=Math.cos(0.38);
    pg.position.copy(at(sx*0.24,BODY_Y-0.15,CAR_Z+CAR_LEN/2-0.2));
    pg.rotation.set(0,Math.atan2(-fz,fx),0);
    pg.add(pm); pg.userData={sx, ry:pg.rotation.y};
    head.add(pg); palps.push(pg);
  }

  /* ---- 8 legs: hip yaw + femur pitch; everything below femG is rigid ---- */
  const legs=[];
  head.updateMatrixWorld(true);
  for(let side=0;side<2;side++){
    for(let i=0;i<4;i++){
      const R=LEG_ROWS[i], sgn=side===0?1:-1;
      const phi = side===0? R.phi : Math.PI-R.phi;
      const hip=new THREE.Group();
      hip.position.copy(at(sgn*R.x,HIP_Y,R.z));
      hip.rotation.y=-phi;
      const {mesh,tip}=buildLeg(M,R.k);
      const pitch0=footPitch(tip,HIP_Y);
      const femG=new THREE.Group(); femG.rotation.z=pitch0; hip.add(femG);
      femG.add(mesh);
      head.add(hip);
      legs.push({hip, femG, basePhi:phi, phase:(i%2===0)===(side===0)? 0:Math.PI,
                 front:i===0, row:i, fold:0, pitch0, tipX:tip.x, tipY:tip.y, sniffComp:0,
                 hx:sgn*R.x, hz:R.z});         // the hip in mesh space, for the terrain probe
    }
  }
  /* each leg's pitch at a full sniff, solved against the tilted head so the
     foot stays down: the tip's height in the group is monotonic in pitch */
  const tipV=new THREE.Vector3();
  const footY=(leg,p)=>{ leg.femG.rotation.z=p; leg.hip.updateMatrixWorld(true);
    return tipV.set(leg.tipX,leg.tipY,0).applyMatrix4(leg.femG.matrixWorld).y; };
  head.rotation.x=SNIFF_TILT; head.position.y=BODY_Y-SNIFF_DROP; g.updateMatrixWorld(true);
  for(const leg of legs){
    let lo=leg.pitch0-0.9, hi=leg.pitch0+0.9;
    for(let it=0;it<30;it++){ const mid=(lo+hi)/2; if(footY(leg,mid)<0.02) lo=mid; else hi=mid; }
    leg.sniffComp=(lo+hi)/2-leg.pitch0;
    leg.femG.rotation.z=leg.pitch0;
  }
  head.rotation.x=0; head.position.y=BODY_Y;

  g.userData={legs, eyeMat, abd, head, BODY_Y, ABD_Z, fangs, palps, fangOpen:0,
              scratchAnim:0, sniffAnim:0, abdTilt:0, animated:true};
  g.visible=false;
  return g;
}
/* the sniff: the whole front pitches down about the pedicel */
function sniffPose(u){
  u.head.rotation.x=u.sniffAnim*SNIFF_TILT;
  u.head.position.y=u.BODY_Y-u.sniffAnim*SNIFF_DROP;
}
/* the face between strides: fangs unfold when it commits, palps feel the
   air as it walks and reach for the floor when it sniffs */
function faceAnim(u,dt,tNow,moved,aggr){
  u.fangOpen+=((aggr?1:0)-u.fangOpen)*Math.min(1,dt*(aggr?6:2));
  for(const f of u.fangs){
    const sx=f.userData.sx, o=u.fangOpen;
    f.rotation.set(lerp(0.5,0.95,o), 0, sx*(lerp(-1.35,0.32,o)+Math.sin(tNow*14+sx)*0.12*o));
  }
  const walk=clamp(moved/3,0,1);
  for(const p of u.palps){
    const sx=p.userData.sx;
    p.rotation.z=0.10*Math.sin(tNow*2.1+sx*1.7)+0.18*walk*Math.sin(tNow*7+sx*2)-u.sniffAnim*0.45;
    p.rotation.y=p.userData.ry+0.08*Math.sin(tNow*1.3+sx);
  }
}
/* the terrain probe's reach for a leg at a femur pitch */
const legReach=(leg,pitch)=>leg.tipX*Math.cos(pitch)-leg.tipY*Math.sin(pitch);

/* ================= hearing ================= */
/* a floppy disk just left its shelf at (x,z) */
export function spiderHearDisc(x,z){
  if(!spider.active) return;
  const s=spider;
  const here=new THREE.Vector3(x,0,z);
  const d=s.pos.distanceTo(here);
  const reaction = 1;                                    // flat 1s, any distance (simpler, more consistent)
  s.lastKnown=here;
  s.discFar = d>DISC_FAR;                                 // far enough to be worth a wall/ceiling transit
  if(s.state==="chase"||s.state==="stalk") return;       // already on you
  if(!s.stacking){
    /* first pickup of this episode: start the countdown */
    s.stacking=true; s.speedMult=1;
    s.pendingT=reaction;
  } else if(s.pendingT>0){
    /* it hasn't started moving yet: each pickup carves a second off the
       wait and winds its speed up another quarter-step */
    s.pendingT=Math.max(0.25, Math.min(s.pendingT-1, reaction));
    s.speedMult=Math.min(2.0, s.speedMult+0.25);
  } else {
    /* already moving for an earlier pickup: re-route to the newest one */
    s.speedMult=Math.min(2.0, s.speedMult+0.25);
    const descending = s.surf.phase==="drop"||s.surf.phase==="dropAttack"
                     ||s.surf.phase==="fromWall"||s.surf.phase==="fromWallS";
    if(s.surf.mode!=="floor"){
      /* up on a wall/ceiling: keep using the surface and just retarget the
         glide to the newest disc — unless it has already committed to a drop
         or a dismount (mid-descent), which runs to completion */
      if(!descending) s.surf.goal=(s.surf.goal||new THREE.Vector3()).set(x,0,z);
    } else if(s.discFar){
      if(s.surf.goal) s.surf.goal.set(x,0,z);            // already transiting → just retarget
      else startDiscTransit(x,z);
    } else { s.state="seek"; s.seekRun=true; s.repath=0; }
  }
}

/* ================= helpers ================= */
function corridorClear2(ax,az,bx,bz){
  const dx=bx-ax, dz=bz-az, len=Math.hypot(dx,dz);
  if(len<0.001) return true;
  const ox=-dz/len*0.7, oz=dx/len*0.7;
  const steps=Math.ceil(len);
  for(let i=1;i<=steps;i++){
    const t=i/steps, x=lerp(ax,bx,t), z=lerp(az,bz,t);
    for(const[sx,sz]of[[0,0],[ox,oz],[-ox,-oz]]){
      const c=worldToCell2(x+sx,z+sz);
      if(isBlockedSpider(c.cx,c.cy)) return false;
    }
  }
  return true;
}
function smoothPath2(path){
  if(path.length<3) return path;
  const out=[];
  let cx=spider.pos.x, cz=spider.pos.z, i=0;
  while(i<path.length){
    let j=path.length-1;
    while(j>i && !corridorClear2(cx,cz,path[j].x,path[j].z)) j--;
    out.push(path[j]); cx=path[j].x; cz=path[j].z; i=j+1;
  }
  return out;
}
function setPath2(wx,wz){
  let a=worldToCell2(spider.pos.x,spider.pos.z);
  if(isBlockedSpider(a.cx,a.cy)){
    for(const[ox,oy]of[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
      if(!isBlockedSpider(a.cx+ox,a.cy+oy)){
        const q=cellToWorld2(a.cx+ox,a.cy+oy);
        spider.pos.x=q.x; spider.pos.z=q.z;
        a=worldToCell2(q.x,q.z);
        break;
      }
    }
  }
  const b=worldToCell2(clamp(wx,-ROOM_SPAN/2+CELL,ROOM_SPAN/2-CELL),
                       clamp(wz,-ROOM_SPAN/2+CELL,ROOM_SPAN/2-CELL));
  const p=bfsPath2(a.cx,a.cy,b.cx,b.cy);
  spider.path = p? p.map(c=>cellToWorld2(c.cx,c.cy)) : [];
  if(spider.path.length>1) spider.path.shift();
  spider.path=smoothPath2(spider.path);
}
/* nearly blind, but not blind: it spots open MOVEMENT at short range.
   Standing perfectly still reads the same as crouching — it keys on motion,
   not posture, so freezing in place (camera turns included) is safe down to
   the crouch radius. */
function spiderCanSee(){
  if(underTable(STATE.pos.x,STATE.pos.z)) return false;
  const d=spider.pos.distanceTo(STATE.pos);
  const range=(STATE.crouch||!STATE.moving)? 4.2 : 11.44*(STATE.sprinting?1.15:1.10);   // still/crouched (unchanged); moving = walk ×1.10 / run ×1.15, +10% floor sight
  if(d>range) return false;
  return losCells2(spider.pos.x,spider.pos.z,STATE.pos.x,STATE.pos.z);
}
function browseTarget(){
  /* most trips end at a shelf front; some are aimless drifting */
  if(LIB.runs.length&&Math.random()<0.7){
    for(let t=0;t<14;t++){
      const run=LIB.runs[Math.floor(Math.random()*LIB.runs.length)];
      const c=run.cells[Math.floor(Math.random()*run.cells.length)];
      const [dx,dy]=run.axis===0? [0,Math.random()<0.5?1:-1] : [Math.random()<0.5?1:-1,0];
      if(isBlockedSpider(c.x+dx,c.y+dy)) continue;
      const p=cellToWorld2(c.x+dx,c.y+dy);
      const sp=cellToWorld2(c.x,c.y);
      return {x:p.x, z:p.z, face:Math.atan2(sp.x-p.x,sp.z-p.z), shelf:true};
    }
  }
  const c=randomReachCell();
  const p=cellToWorld2(c.cx,c.cy);
  return {x:p.x, z:p.z, face:Math.random()*Math.PI*2, shelf:false};
}

/* ================= surface locomotion (walls & ceiling) =================
   The spider normally lives on the floor (the grid AI above). When calm it
   may crawl a perimeter wall or web up to the ceiling, reposition over long
   glides at up to 2× speed, and — once back over you — drop. s.pos is the 3-D
   contact point; orientSpider() rights the body to the surface normal. */
const UP=new THREE.Vector3(0,1,0), DOWN=new THREE.Vector3(0,-1,0);
const INNER=ROOM_SPAN/2-CELL;          // 46: the inner wall faces sit at ±INNER
const WALLLEN=INNER-CELL;              // 42: keep glides off the corners
const WALL_H=LIB_WALL_H;               // wall / ceiling height
const WBAND_LO=0.30*WALL_H, WBAND_HI=0.70*WALL_H;     // the height band it gravitates to
const WBAND_MIN=0.15*WALL_H, WBAND_MAX=0.85*WALL_H;   // the hard limits it stays within
const WVSTEP=0.30*WALL_H;              // vertical change per wall glide
const SURF_GLIDE_MIN=2;                // min repositioning glides before it may return to the floor
const SURF_GLIDE_CAP=4;                // max repositioning glides on a surface before it must drop
const FLOOR_PATH_MIN=1;               // min floor browses before a wall/ceiling move may be chosen
const FLOOR_PATH_CAP=5;               // max floor browses in a row before a wall/ceiling move is forced
const PIVOT_DIST=2.2;                 // metres over which the body pitches around the wall↔floor corner
const WALL_AREA=14;                   // within this of a wall → "wall-choosing area" (else ceiling area)
const DISC_FAR=0.45*ROOM_SPAN;        // disc picked up beyond this → surface transit instead of a floor seek
const WALL_TRAVERSE_MULT=2.55;        // wall mount/traverse/dismount speed (× browse) during a disc transit
const CEIL_TRAVERSE_MULT=2.25;        // ceiling disc-transit glide speed (× browse)
const S_LEAD=10;                      // along-the-wall lead of the S-curve mount/dismount (horizontal blend distance)
const SIDE=2*INNER, PERIM=4*SIDE;     // inner-perimeter loop length (wall transit)
const TAIL_LOCAL=new THREE.Vector3(0,SP_BODY_Y+0.12,ABD_Z-ABD_HALF*ABD_SZ);  // the abdomen tail tip in mesh-local space (web origin / hang anchor)
const HANG_LAND=3.7;                  // tail height when the head-down hang's face reaches you
const _tmp=new THREE.Vector3();

function nearestWall(x,z){
  const dxW=INNER-Math.abs(x), dzW=INNER-Math.abs(z);
  if(dxW<dzW){ const face=Math.sign(x||1)*INNER;
    return {axis:"x", face, N:new THREE.Vector3(-Math.sign(face),0,0), along:"z"}; }
  const face=Math.sign(z||1)*INNER;
  return {axis:"z", face, N:new THREE.Vector3(0,0,-Math.sign(face)), along:"x"};
}
const wallPoint=(w,u,v)=> w.axis==="x"? new THREE.Vector3(w.face,v,u) : new THREE.Vector3(u,v,w.face);
const wallU=(w,p)=> w.axis==="x"? p.z : p.x;
/* the inner perimeter as a 1-D loop W→S→E→N (each side length SIDE), for the
   wall route to a far disc. perimWall(p) → the wall + world point at param p */
function perimWall(p){
  p=((p%PERIM)+PERIM)%PERIM;
  const seg=Math.floor(p/SIDE), u=p-seg*SIDE;                 // u∈[0,SIDE]
  if(seg===0) return {x:-INNER, z:u-INNER, N:new THREE.Vector3(1,0,0),  axis:"x", face:-INNER, along:"z"}; // west
  if(seg===1) return {x:u-INNER, z:INNER,  N:new THREE.Vector3(0,0,-1), axis:"z", face:INNER,  along:"x"}; // south
  if(seg===2) return {x:INNER,  z:INNER-u, N:new THREE.Vector3(-1,0,0), axis:"x", face:INNER,  along:"z"}; // east
  return        {x:INNER-u, z:-INNER, N:new THREE.Vector3(0,0,1),  axis:"z", face:-INNER, along:"x"};      // north
}
const perimP=(pos,w)=> w.axis==="x"
  ? (w.face<0? pos.z+INNER : 2*SIDE+(INNER-pos.z))           // west / east
  : (w.face>0? SIDE+(pos.x+INNER) : 3*SIDE+(INNER-pos.x));   // south / north
function nearestWallP(x,z){                                   // perimeter param of the wall point closest to (x,z)
  const dW=x+INNER, dE=INNER-x, dN=z+INNER, dS=INNER-z, m=Math.min(dW,dE,dN,dS);
  if(m===dW) return z+INNER;
  if(m===dS) return SIDE+(x+INNER);
  if(m===dE) return 2*SIDE+(INNER-z);
  return 3*SIDE+(INNER-x);
}
/* in a square room two walls are the same (0 corners), adjacent (1 corner), or
   opposite (2 corners). Only opposite walls — same orientation, facing each
   other — force a route across more than one corner. */
function oppositeWalls(sx,sz,gx,gz){
  const ws=nearestWall(sx,sz), wt=nearestWall(gx,gz);
  return ws.axis===wt.axis && ws.face!==wt.face;
}
function calmEnough(){
  const s=spider;
  return (s.state==="browse"||s.state==="peruse") && s.pendingT<=0 && !s.stacking;
}
/* on completing a floor browse: maybe leave the ground entirely. A run of
   FLOOR_PATH_CAP browses without climbing forces the next one. */
function maybeClimb(){
  if(!calmEnough()) return false;
  const s=spider;
  s.floorPaths++;
  if(s.floorPaths<FLOOR_PATH_MIN) return false;       // wander a few floors first
  const forced=s.floorPaths>=FLOOR_PATH_CAP;
  const wallDist=Math.min(INNER-Math.abs(s.pos.x), INNER-Math.abs(s.pos.z));
  if(wallDist<WALL_AREA){ if(forced||Math.random()<0.25){ s.floorPaths=0; startToWall(); return true; } }
  else if(forced||Math.random()<0.10){ s.floorPaths=0; startToCeiling(); return true; }
  return false;
}
function startToWall(){
  const s=spider, S=s.surf, w=nearestWall(s.pos.x,s.pos.z);
  const u=clamp(wallU(w,s.pos), -WALLLEN, WALLLEN);
  S.wall=w;
  S.from.set(s.pos.x,0,s.pos.z);
  S.mid.copy(wallPoint(w,u,0));          // the wall base under us
  S.len1=S.from.distanceTo(S.mid);
  if(S.goal){
    /* disc transit: S-curve up onto the wall, leading into the traverse direction */
    S.pStart=perimP(S.mid,w);
    const dlt=((nearestWallP(S.goal.x,S.goal.z)-S.pStart+PERIM*1.5)%PERIM)-PERIM/2;
    S.toH=rand(WBAND_LO,WBAND_HI);
    S.lead=(Math.sign(dlt)||1)*Math.min(S_LEAD, Math.abs(dlt)*0.4);
    S.len2=S.toH+Math.abs(S.lead);       // approx S-curve arc length
  } else {
    S.to.copy(wallPoint(w,u,rand(WBAND_LO,WBAND_HI)));   // calm climb: straight up into the 30–70% band
    S.len2=S.mid.distanceTo(S.to);
  }
  S.phase=S.goal?"toWallS":"toWall"; S.t=0; S.ramp=0; S.glideActive=false; S.glides=0; S.targetN.copy(UP);  // upright until it reaches the wall
  s.path=[];
}
function startToCeiling(){
  const s=spider, S=s.surf;
  S.from.set(s.pos.x,0,s.pos.z);
  S.to.set(s.pos.x,WALL_H,s.pos.z);
  S.web=null; S.struck=false;
  S.phase="toCeiling"; S.t=0; S.dur=2.5; S.ramp=0; S.glideActive=false; S.glides=0; S.targetN.copy(DOWN);
  s.path=[];
}
/* a far disc was heard: take a surface route to it instead of a floor slog.
   Wall-area → climb & wall-walk (around corners) to the closest wall point,
   then drop off and walk in. Ceiling-area → web up, glide over it, drop. */
function startDiscTransit(gx,gz){
  const s=spider, S=s.surf;
  S.goal = (S.goal||new THREE.Vector3()).set(gx,0,gz); S.weaveBase=null;
  s.state="seek"; s.seekRun=true;                       // it's hunting toward the disc
  if(S.mode==="floor" && S.phase==="idle"){
    const wallDist=Math.min(INNER-Math.abs(s.pos.x), INNER-Math.abs(s.pos.z));
    /* wall route only if near a wall AND the disc's wall isn't the opposite one
       (which would force >1 corner); otherwise the ceiling is the cleaner path */
    if(wallDist<WALL_AREA && !oppositeWalls(s.pos.x,s.pos.z,gx,gz)) startToWall();
    else startToCeiling();
  }
  /* if already elevated, the surface AI picks up S.goal on its next frame */
}
function startFromWall(tx,tz){
  const s=spider, S=s.surf, w=S.wall;
  const u=wallU(w,s.pos);
  S.from.copy(s.pos);
  if(S.goal && tx==null){
    /* disc transit: S-curve down — keep running along to the closest wall point
       while curving down, then off onto the floor */
    S.pStart=perimP(s.pos,w);
    const dlt=((nearestWallP(S.goal.x,S.goal.z)-S.pStart+PERIM*1.5)%PERIM)-PERIM/2;
    S.pEnd=S.pStart+dlt; S.toH=s.pos.y;
    const pw=perimWall(S.pEnd);
    S.mid.set(pw.x,0,pw.z);                              // wall base at the closest point
    S.to.set(pw.x+pw.N.x*CELL, 0, pw.z+pw.N.z*CELL);     // one cell into the room
    S.len1=Math.abs(dlt)+S.toH; S.len2=S.mid.distanceTo(S.to);
    S.phase="fromWallS"; S.t=0;
    return;
  }
  S.mid.copy(wallPoint(w,u,0));           // straight down the face
  if(tx!=null){ S.to.set(tx,0,tz); }
  else if(w.axis==="x"){ S.to.set(w.face-Math.sign(w.face)*CELL, 0, u); }
  else { S.to.set(u, 0, w.face-Math.sign(w.face)*CELL); }
  S.len1=S.from.distanceTo(S.mid); S.len2=S.mid.distanceTo(S.to);
  S.phase="fromWall"; S.t=0; S.targetN.copy(w.N);     // stay flush to the wall until it reaches the floor
}
function startDrop(attack,dx,dz){
  const s=spider, S=s.surf;
  S.dropX=dx; S.dropZ=dz;
  S.from.copy(s.pos);
  S.to.set(dx,WALL_H,dz);                  // the ceiling point over the target
  S.web=null; S.struck=false; S.killed=false;
  if(attack){ S.phase="dropAttack"; S.setup=1.5; S.fall=1.75; }  // telegraphed: 1.5s setup + 1.75s rappel (−30%)
  else { S.phase="drop"; S.setup=0.0; S.fall=2.1; }              // casual return rappel (−30%)
  S.t=0; S.targetN.copy(UP); S.hang=false;
  S.hangN.set(s.headDir.x,0,s.headDir.z);                        // keep a horizontal dorsal facing while it dangles
  if(S.hangN.lengthSq()<1e-4) S.hangN.set(1,0,0);
  S.hangN.normalize();
}
/* land back on the floor; lift off any shelf/table it came down onto */
function landRecover(x,z){
  const s=spider, S=s.surf;
  const wasPursue=S.pursue || s.state==="seek" || s.state==="chase";
  s.pos.set(x,0,z);
  let a=worldToCell2(x,z);
  if(isBlockedSpider(a.cx,a.cy)){             // came down onto a shelf/table — step off it
    for(const[ox,oy]of[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
      if(!isBlockedSpider(a.cx+ox,a.cy+oy)){ const q=cellToWorld2(a.cx+ox,a.cy+oy); s.pos.set(q.x,0,q.z); break; }
    }
  }
  const goalPt = S.goal;                       // disc-transit target, if any (investigate it on landing)
  S.mode="floor"; S.phase="idle"; S.ramp=0; S.pursue=false; S.glideActive=false;
  S.wall=null; S.targetN.copy(UP); S.web=null; S.goal=null; S.hang=false; S.weaveBase=null; s.discFar=false;
  s.mesh.userData.abdTilt=0;
  s.curSpeed=0; s.path=[]; s.repath=0; s.floorPaths=0;
  if(goalPt){
    s.state="seek"; s.seekRun=true; s.lastKnown=new THREE.Vector3(goalPt.x,0,goalPt.z);
    /* if a newer disc retargeted the goal mid-descent, we landed far from it —
       take another surface hop rather than a long floor slog */
    if(Math.hypot(goalPt.x-s.pos.x, goalPt.z-s.pos.z)>DISC_FAR){ s.discFar=true; startDiscTransit(goalPt.x,goalPt.z); }
  }
  else if(wasPursue){ s.state="seek"; s.seekRun=true; s.lastKnown=STATE.pos.clone(); }                // keep hunting on the ground
  else { s.state="browse"; s.target=null; }
}
function applyHead(prev,dt){
  const s=spider;
  const dx=s.pos.x-prev.x, dy=s.pos.y-prev.y, dz=s.pos.z-prev.z;
  const L=Math.hypot(dx,dy,dz);
  if(L>1e-4) s.headDir.set(dx/L,dy/L,dz/L);
  return L/Math.max(dt,1e-5);
}
/* a single straight repositioning glide across the current surface */
function surfaceGlideStep(dt){
  const s=spider, to=s.surf.to;
  const dx=to.x-s.pos.x, dy=to.y-s.pos.y, dz=to.z-s.pos.z;
  const L=Math.hypot(dx,dy,dz);
  s.curSpeed=SPD.browse*(1+s.surf.ramp);   // ramps to 2× browse
  if(L<0.6) return {arrived:true, moved:0};
  const step=Math.min(L, s.curSpeed*dt);
  s.pos.x+=dx/L*step; s.pos.y+=dy/L*step; s.pos.z+=dz/L*step;
  s.headDir.set(dx/L,dy/L,dz/L);
  return {arrived:false, moved:s.curSpeed};
}
function newWallGlide(){
  const s=spider, w=s.surf.wall;
  const u=clamp(wallU(w,s.pos)+rand(-1,1)*WALLLEN, -WALLLEN, WALLLEN);   // ~50% of the length
  const v=clamp(lerp(s.pos.y+rand(-WVSTEP,WVSTEP), rand(WBAND_LO,WBAND_HI), 0.5), WBAND_MIN, WBAND_MAX);
  s.surf.to.copy(wallPoint(w,u,v));
}
function newCeilGlide(){
  const s=spider, lim=ROOM_SPAN/2-15;     // 35: stay ≥15m off the perimeter
  let tx,tz;
  if(Math.random()<0.5){ tx=clamp(s.pos.x+rand(-1,1)*0.55*ROOM_SPAN,-lim,lim); tz=clamp(s.pos.z+rand(-0.3,0.3)*ROOM_SPAN,-lim,lim); }
  else { tz=clamp(s.pos.z+rand(-1,1)*0.55*ROOM_SPAN,-lim,lim); tx=clamp(s.pos.x+rand(-0.3,0.3)*ROOM_SPAN,-lim,lim); }
  s.surf.to.set(tx,WALL_H,tz);
}

/* crawl the from→mid→to corner. Walking pace normally; full traverse speed
   during a disc transit so mount/dismount match the wall run (no speed jump). */
function transitWalk(dt){
  const s=spider, S=s.surf, prev=_tmp.copy(s.pos);
  const spd = S.goal? SPD.browse*WALL_TRAVERSE_MULT : SPD.browse;
  S.t+=spd*dt;                                             // S.t is distance travelled here
  if(S.t<S.len1) s.pos.lerpVectors(S.from,S.mid, S.t/Math.max(S.len1,1e-4));
  else s.pos.lerpVectors(S.mid,S.to, Math.min(1,(S.t-S.len1)/Math.max(S.len2,1e-4)));
  s.curSpeed=spd;
  return {moved:applyHead(prev,dt), done:S.t>=S.len1+S.len2};
}
/* floor → wall: cross the floor upright, then pitch up onto the face at the corner
   and finish the climb flush to the wall (head up) */
function transitClimb(dt){
  const s=spider, S=s.surf, w=S.wall, r=transitWalk(dt);
  if(S.t<S.len1){
    S.targetN.copy(UP); s.headDir.copy(w.N).multiplyScalar(-1);        // walk toward the wall, upright
  } else {
    const k=Math.min(1,(S.t-S.len1)/PIVOT_DIST);
    S.targetN.copy(UP).lerp(w.N,k).normalize();                       // up rolls floor → wall
    s.headDir.copy(w.N).multiplyScalar(-1).lerp(UP,k).normalize();    // head swings from into-wall to up-the-wall
  }
  if(r.done){ s.pos.copy(S.to); S.mode="wall"; S.phase="idle"; S.ramp=0;
              S.glideActive=false; S.targetN.copy(w.N); s.curSpeed=0; }
  return r.moved;
}
/* wall → floor: crawl head-first DOWN the face flush to the wall, then pitch off it
   onto the floor over the last corner stretch (like the real thing — no clipping) */
function transitDown(dt){
  const s=spider, S=s.surf, w=S.wall, r=transitWalk(dt);
  if(S.t<S.len1){
    S.targetN.copy(w.N); s.headDir.set(0,-1,0);                       // descend the wall, head down, body flush
  } else {
    const k=Math.min(1,(S.t-S.len1)/PIVOT_DIST);
    S.targetN.copy(w.N).lerp(UP,k).normalize();                      // up rolls wall → floor
    s.headDir.set(0,-1,0).lerp(w.N,k).normalize();                   // head swings from down to into-the-room
  }
  if(r.done) landRecover(S.to.x,S.to.z);
  return r.moved;
}
/* disc-transit S-curve mount: cross the floor, then arc up the wall (vertical
   first, curving horizontal into the traverse) — heading follows the path */
function transitClimbS(dt){
  const s=spider, S=s.surf, prev=_tmp.copy(s.pos);
  const spd=SPD.browse*WALL_TRAVERSE_MULT; s.curSpeed=spd;
  S.t+=spd*dt;
  if(S.t<S.len1){
    s.pos.lerpVectors(S.from,S.mid, S.t/Math.max(S.len1,1e-4));      // cross the floor to the wall base, upright
    S.targetN.copy(UP);
  } else {
    const kc=Math.min(1,(S.t-S.len1)/Math.max(S.len2,1e-4));
    const h=S.toH*(1-(1-kc)*(1-kc));                                 // ease-out: rises (vertical) early
    const pw=perimWall(S.pStart + S.lead*kc*kc);                     // ease-in: leads along (horizontal) late
    s.pos.set(pw.x, h, pw.z);
    S.wall={axis:pw.axis,face:pw.face,N:pw.N,along:pw.along};
    S.targetN.copy(UP).lerp(pw.N, clamp(h/PIVOT_DIST,0,1)).normalize();   // body rolls onto the wall as it rises
    if(kc>=1){
      S.mode="wall"; S.phase="idle"; S.ramp=0; S.glideActive=false;
      S.targetN.copy(pw.N); S.weaveBase=S.toH; S.weaveP0=S.pStart+S.lead;  // seamless handoff into the traverse weave
    }
  }
  return applyHead(prev,dt);
}
/* disc-transit S-curve dismount: keep running along (horizontal), curve down
   the wall (vertical), then pitch off onto the floor — the mirror of the mount */
function transitDownS(dt){
  const s=spider, S=s.surf, prev=_tmp.copy(s.pos);
  const spd=SPD.browse*WALL_TRAVERSE_MULT; s.curSpeed=spd;
  S.t+=spd*dt;
  if(S.t<S.len1){
    const kc=Math.min(1,S.t/Math.max(S.len1,1e-4));
    const h=S.toH*(1-kc*kc);                                         // ease-in descend: along first, drop late
    const pw=perimWall(S.pStart + (S.pEnd-S.pStart)*(1-(1-kc)*(1-kc)));   // ease-out along: advances fast early
    s.pos.set(pw.x, h, pw.z);
    S.wall={axis:pw.axis,face:pw.face,N:pw.N,along:pw.along};
    S.targetN.copy(UP).lerp(pw.N, clamp(h/PIVOT_DIST,0,1)).normalize();
  } else {
    const kc=Math.min(1,(S.t-S.len1)/Math.max(S.len2,1e-4));
    s.pos.lerpVectors(S.mid,S.to,kc);                               // wall base → one cell into the room
    S.targetN.copy(UP);
  }
  const moved=applyHead(prev,dt);
  if(S.t>=S.len1+S.len2) landRecover(S.to.x,S.to.z);
  return moved;
}
function transitCeilingUp(dt){
  const s=spider, S=s.surf, u=s.mesh.userData, prev=_tmp.copy(s.pos);
  S.t+=dt; const setup=1.0, rise=1.5;
  if(S.t<setup){
    s.pos.copy(S.from);                                     // braced on the floor, head down
    u.abdTilt=Math.min(1,u.abdTilt+dt*2.5); u.sniffAnim=Math.min(1,u.sniffAnim+dt*3);
  } else {
    if(!S.struck){ S.struck=true; S.web=spawnWeb(S.to,s.pos); sfxWebSplat(0.45,panTo(S.to.x,S.to.z)); }
    const k=Math.min(1,(S.t-setup)/rise);
    s.pos.set(S.from.x, lerp(0,WALL_H,k), S.from.z);        // reel up the silk
    if(S.web) updateWeb(S.web,s.pos.y);
    u.abdTilt=Math.max(0,u.abdTilt-dt*2); u.sniffAnim=Math.max(0,u.sniffAnim-dt*2);
  }
  const moved=applyHead(prev,dt);
  if(S.t>=setup+rise){
    if(S.web){ removeWeb(S.web); S.web=null; }              // ascent silk is reeled in
    s.pos.set(S.from.x,WALL_H,S.from.z);
    S.mode="ceiling"; S.phase="idle"; S.ramp=0; S.glideActive=false; S.targetN.copy(DOWN); s.curSpeed=0;
  }
  return moved;
}
function transitDrop(dt){
  const s=spider, S=s.surf, u=s.mesh.userData, prev=_tmp.copy(s.pos);
  if(!S.struck){ S.struck=true; S.web=spawnWeb(S.to,s.pos); sfxWebSplat(0.5,panTo(S.to.x,S.to.z)); }
  S.t+=dt; const total=S.setup+S.fall;
  if(S.t<S.setup){
    s.pos.lerpVectors(S.from,S.to, S.setup>0? S.t/S.setup:1);   // slide over the mark
    u.abdTilt=Math.min(1,u.abdTilt+dt*2.5); u.sniffAnim=Math.min(1,u.sniffAnim+dt*3);
  } else {
    /* rappel: it lowers itself head-down on the silk — the tail (web origin)
       rides s.pos, the body dangles below it */
    S.hang=true; S.targetN.copy(S.hangN); s.headDir.set(0,-1,0);
    const k=Math.min(1,(S.t-S.setup)/S.fall);
    s.pos.set(S.to.x, lerp(WALL_H,HANG_LAND,k), S.to.z);       // the tail descends to where the legs meet the floor
    if(S.web) updateWeb(S.web,s.pos.y);                        // web bottom rides the tail
    u.abdTilt=Math.max(0,u.abdTilt-dt*2); u.sniffAnim=Math.max(0,u.sniffAnim-dt*2);
    /* the touch: a drop lands a kill regardless of crouch — only getting clear
       of the mark saves you (a table overhead still shelters you) */
    if(!S.killed){
      const hd=Math.hypot(STATE.pos.x-s.pos.x, STATE.pos.z-s.pos.z);
      if(s.pos.y-HANG_LAND<0.7 && hd<2.1 && !underTable(STATE.pos.x,STATE.pos.z)){ S.killed=true; die(); }
    }
  }
  const moved=applyHead(prev,dt);
  if(S.t>=total){
    if(S.web){ severWeb(S.web); sfxWebSnap(0.4,panTo(S.to.x,S.to.z)); S.web=null; }
    landRecover(S.to.x,S.to.z);
  }
  return moved;
}
/* the surface frame: dispatch transitions, else crawl & decide */
function updateSurface(dt, dx, dz, d, sees){
  const s=spider, S=s.surf;
  if(S.phase==="idle") S.ramp=Math.min(1, S.ramp + dt/(S.mode==="ceiling"?5:4));
  switch(S.phase){
    case "toWall": return transitClimb(dt);
    case "toWallS": return transitClimbS(dt);
    case "fromWall": return transitDown(dt);
    case "fromWallS": return transitDownS(dt);
    case "toCeiling": return transitCeilingUp(dt);
    case "drop": case "dropAttack": return transitDrop(dt);
  }
  const alerted = s.state==="seek"||s.state==="chase"||s.pendingT>0||sees;
  if(S.mode==="wall"){
    const w=S.wall;
    if(S.goal && !sees){
      /* wall route to a far disc: glide the perimeter (round corners) to the
         closest wall point, then drop off and walk in */
      const prev=_tmp.copy(s.pos);
      s.curSpeed=SPD.browse*WALL_TRAVERSE_MULT;    // fixed traverse speed (× normal) while running to the disc
      const p=perimP(s.pos,w);
      if(S.weaveBase==null){ S.weaveBase=clamp(s.pos.y,WBAND_MIN,WBAND_MAX); S.weaveP0=p; }  // anchor the weave to the elevation it entered at
      const dlt=((nearestWallP(S.goal.x,S.goal.z)-p+PERIM*1.5)%PERIM)-PERIM/2;   // shorter signed loop distance
      if(Math.abs(dlt)<S_LEAD){ startFromWall(null,null); return s.curSpeed; }   // close enough → S-curve down off the wall
      const pNext=p + Math.sign(dlt)*s.curSpeed*dt;
      const pw=perimWall(pNext);
      const v=S.weaveBase + 2.4*Math.sin((pNext-S.weaveP0)*0.16);                // slight S-weave around the entry elevation — no snap, rounds corners at any height
      s.pos.set(pw.x, clamp(v, WBAND_MIN, WBAND_MAX), pw.z);
      S.wall={axis:pw.axis, face:pw.face, N:pw.N, along:pw.along};               // may flip faces at a corner
      S.targetN.copy(pw.N);
      return applyHead(prev,dt);
    }
    if(alerted){
      S.pursue=true;
      const pAlong=w.axis==="x"? STATE.pos.z : STATE.pos.x;
      S.to.copy(wallPoint(w, clamp(pAlong,-WALLLEN,WALLLEN), clamp(s.pos.y,WBAND_LO,WBAND_HI)));
      const r=surfaceGlideStep(dt);
      if(Math.abs(wallU(w,s.pos)-pAlong)<3) startFromWall(STATE.pos.x,STATE.pos.z);  // abreast → drop to the floor by you
      return r.moved;
    }
    if(!S.glideActive){ newWallGlide(); S.glideActive=true; }
    const r=surfaceGlideStep(dt);
    if(r.arrived){ S.glideActive=false; S.glides++;
      if(S.glides>=SURF_GLIDE_CAP || (S.glides>=SURF_GLIDE_MIN && Math.random()<0.30)) startFromWall(null,null); }
    return r.moved;
  }
  if(S.mode==="ceiling"){
    if(S.goal && !sees){
      /* ceiling route to a far disc: glide over it at a fixed 2× (no ramp-up), then drop on it */
      S.to.set(S.goal.x, WALL_H, S.goal.z);
      S.ramp=CEIL_TRAVERSE_MULT-1;                  // surfaceGlideStep speed = browse·(1+ramp) = 2× browse
      const r=surfaceGlideStep(dt);
      if(Math.hypot(S.goal.x-s.pos.x, S.goal.z-s.pos.z)<3) startDrop(false, S.goal.x, S.goal.z);
      return r.moved;
    }
    if(alerted && !underTable(STATE.pos.x,STATE.pos.z)){
      S.pursue=true;
      S.to.set(STATE.pos.x,WALL_H,STATE.pos.z);
      const r=surfaceGlideStep(dt);
      if(Math.hypot(STATE.pos.x-s.pos.x, STATE.pos.z-s.pos.z)<3) startDrop(true,STATE.pos.x,STATE.pos.z);
      return r.moved;
    }
    if(!S.glideActive){ newCeilGlide(); S.glideActive=true; }
    const r=surfaceGlideStep(dt);
    if(r.arrived){ S.glideActive=false; S.glides++;
      if(S.glides>=SURF_GLIDE_CAP || (S.glides>=SURF_GLIDE_MIN && Math.random()<0.30)) startDrop(false,s.pos.x,s.pos.z); }
    return r.moved;
  }
  return 0;
}
/* right the body to whatever surface it's on, and place it at the contact + bob */
const _q=new THREE.Quaternion(), _m=new THREE.Matrix4();
const _up=new THREE.Vector3(), _fwd=new THREE.Vector3(), _right=new THREE.Vector3(), _bob=new THREE.Vector3();
function orientSpider(dt, movedSpeed){
  const s=spider, S=s.surf;
  _up.copy(S.targetN).normalize();
  _fwd.copy(s.headDir); _fwd.addScaledVector(_up,-_fwd.dot(_up));
  if(_fwd.lengthSq()<1e-6){
    _fwd.set(s.mesh.matrix.elements[8],s.mesh.matrix.elements[9],s.mesh.matrix.elements[10]);
    _fwd.addScaledVector(_up,-_fwd.dot(_up));
    if(_fwd.lengthSq()<1e-6) _fwd.set(1,0,0);
  }
  _fwd.normalize();
  _right.copy(_up).cross(_fwd).normalize();
  _m.makeBasis(_right,_up,_fwd);
  _q.setFromRotationMatrix(_m);
  s.mesh.quaternion.slerp(_q, S.phase!=="idle"? 1-Math.pow(0.62,dt*60) : 1-Math.pow(0.86,dt*60));
  if(S.hang){
    /* dangling on silk: the abdomen tail rides s.pos (the web's lower end),
       the rest of the body hangs below it */
    _bob.copy(TAIL_LOCAL).applyQuaternion(s.mesh.quaternion);
    s.mesh.position.set(s.pos.x-_bob.x, s.pos.y-_bob.y, s.pos.z-_bob.z);
  } else {
    const bob=Math.abs(Math.sin(s.anim*2))*0.07*clamp(movedSpeed/10,0,1);
    _bob.copy(_up).multiplyScalar(bob);
    s.mesh.position.set(s.pos.x+_bob.x, s.pos.y+_bob.y, s.pos.z+_bob.z);
  }
}

/* ================= per-frame ================= */
const SPD={browse:5.2, peruse:0, investigate:0, stalk:6.5, mildSeek:5.72};   // ×1.25 / ×1.1 of browse
export function updateSpider(dt){
  if(!spider.active||STATE.dead||STATE.won) return;
  const s=spider, u=s.mesh.userData;
  const dx=STATE.pos.x-s.pos.x, dz=STATE.pos.z-s.pos.z;
  const d=Math.hypot(dx,dz);
  const hiding=underTable(STATE.pos.x,STATE.pos.z)&&STATE.crouch;
  s.repath-=dt; s.mildCD-=dt; s.screechCD-=dt; s.scratchCD-=dt; s.sniffCD-=dt;

  /* ---- investigative sniffing: rare fits, not a metronome — a short
     erratic cluster of puffs when it inspects a spot, then a long silence
     before it will huff again, however often it re-investigates ---- */
  if(s.sniffsLeft>0){
    s.sniffT-=dt;
    if(s.sniffT<=0){
      s.sniffsLeft--;
      s.sniffT=rand(0.25,0.95);                       // erratic spacing inside the fit
      if(s.sniffsLeft<=0) s.sniffCD=rand(22,38);      // re-arm: the quiet runs from the last puff
      sfxSpiderSniff(clamp(1-d/34,0.06,1)*0.55, panTo(s.pos.x,s.pos.z));
    }
  }

  /* ---- the reaction countdown from disc pickups ---- */
  if(s.pendingT>0){
    s.pendingT-=dt;
    if(s.pendingT<=0){
      s.pendingT=0;
      sfxSpiderShriek(0.4,panTo(s.pos.x,s.pos.z));     // it has the scent
      /* far disc: it realises a wall/ceiling route is faster than the floor */
      if(s.discFar && s.lastKnown) startDiscTransit(s.lastKnown.x,s.lastKnown.z);
      else { s.state="seek"; s.seekRun=true; s.repath=0; }
    }
  }

  /* ---- hearing your feet ---- d is horizontal (cylindrical), so detection
     works the same whether it's on the floor, a wall, or the ceiling. Ranges
     are −20% vs walking/sprinting (survivability); a wall-mounted spider only
     hears a semicircle, so its ranges stretch +40% to compensate. */
  if(STATE.moving&&!STATE.crouch){
    const moveGain = STATE.sprinting ? 1.15 : 1.10;   // running heard a touch farther than walking
    const wallGain = s.surf.mode==="wall" ? 1.4 : 1;
    const floorGain = s.surf.mode==="floor" ? 1.10 : 1;   // +10% floor detection (wall/ceiling keep their own gain)
    const strongR = 13.6*moveGain*wallGain*floorGain, mildR = 20.4*moveGain*wallGain*floorGain;
    if(d<strongR){
      s.lastKnown=STATE.pos.clone();
      if(s.surf.mode!=="floor") s.surf.goal=null;   // a near player overrides a disc errand while elevated
      if(s.state!=="chase"&&s.state!=="stalk"){
        if(s.state!=="seek"||!s.seekRun) s.repath=0;
        s.state="seek"; s.seekRun=true;
      }
    } else if(d<mildR&&s.mildCD<=0&&(s.state==="browse"||s.state==="peruse")){
      s.mildCD=2;
      s.lastKnown=STATE.pos.clone();
      s.state="seek"; s.seekRun=false; s.repath=0;
    }
  }

  const sees=spiderCanSee();
  let movedSpeed=0;

  /* ---- state machine (floor only; the surface layer drives walls/ceiling) ---- */
  if(s.surf.mode==="floor" && s.surf.phase==="idle")
  switch(s.state){
    case "browse":
      if(sees){ startChase(s); break; }
      if(s.path.length===0&&s.repath<=0){
        const t=browseTarget();
        s.target=t; setPath2(t.x,t.z); s.repath=1.2;
      }
      if(s.target&&Math.hypot(s.target.x-s.pos.x,s.target.z-s.pos.z)<1.2){
        if(maybeClimb()) break;            // it may leave the floor entirely instead
        s.state="peruse"; s.pauseT=rand(2,4); s.scratchT=rand(0.3,0.8);   // shorter pause, scratch fills most of it
        s.faceAng=s.target.face; s.path=[];
        /* rarely it noses the shelf before it starts to scratch */
        if(Math.random()<0.1) startSniffFit(s,1+Math.floor(Math.random()*2),rand(0.8,1.6));
      }
      break;
    case "peruse":
      if(sees){ startChase(s); break; }
      s.pauseT-=dt;
      s.scratchT-=dt;
      if(s.scratchT<=0&&s.target&&s.target.shelf&&s.scratchCD<=0){
        s.scratchT=rand(3.5,6.5);
        s.scratchCD=rand(4,8);
        u.scratchAnim=1.0;
        /* the scrape carries: your sound-map of the library */
        sfxSpiderScratch(clamp(1-d/70,0.05,1)*0.8, panTo(s.pos.x,s.pos.z));
      }
      if(s.pauseT<=0){ s.state="browse"; s.repath=0; }
      break;
    case "seek":{
      if(sees){ startChase(s); break; }
      if(s.lastKnown&&s.repath<=0){ setPath2(s.lastKnown.x,s.lastKnown.z); s.repath=s.seekRun?0.35:0.8; }
      /* arrival: the heard spot is often INSIDE a shelf or under a table —
         unreachable cells end the path one cell short, so an exhausted path
         within a stride of the spot counts as arriving.
         A spot ON a table needs its own radius: pushFromTables holds the
         body at exactly 2.0m (CELL/2) from the cell centre, so the 2.0m
         close-approach can NEVER fire there — without this, arrival hangs
         entirely on the path running dry, and a spider pinned at the
         keep-out re-pathing the same unreachable spot seeks forever */
      const dLK=s.lastKnown? s.pos.distanceTo(s.lastKnown) : 1e9;
      const lkOnTable=s.lastKnown && cellAt(s.lastKnown.x,s.lastKnown.z)===4;
      if(dLK<2.0||(lkOnTable&&dLK<3.2)||(s.path.length===0&&dLK<CELL*1.5)){
        if(hiding&&d<5.5){ startStalk(s); break; }
        if(s.lastKnown){ s.faceAng=Math.atan2(s.lastKnown.x-s.pos.x,s.lastKnown.z-s.pos.z); }
        s.state="investigate"; s.searchT=rand(1.82,3.22); s.path=[];   // −30%: it lingers less over a scent
        /* a clustered fit of questioning sniffs — only if it has been quiet */
        startSniffFit(s,2+Math.floor(Math.random()*3),rand(0.4,0.9));
      }
      break;
    }
    case "investigate":
      if(sees){ startChase(s); break; }
      s.searchT-=dt;
      u.sniffAnim=Math.min(1,u.sniffAnim+dt*3);
      s.faceAng+=dt*0.9;                       // slow scanning turn
      if(hiding&&d<5){ startStalk(s); break; }
      if(s.searchT<=0){
        /* the episode ends: stacked speed resets */
        s.stacking=false; s.speedMult=1; s.seekRun=false;
        s.state="browse"; s.repath=0;
      }
      break;
    case "chase":
      if(hiding&&d<6){ startStalk(s); break; }
      if(!sees){
        s.lastKnown=STATE.pos.clone();
        s.state="seek"; s.seekRun=true; s.repath=0;
      } else {
        s.lastKnown=STATE.pos.clone();
        if(s.repath<=0){ setPath2(STATE.pos.x,STATE.pos.z); s.repath=0.3; }
      }
      break;
    case "stalk":{
      /* it can NOT come under the table. It circles, and scrapes, and waits. */
      s.stalkT-=dt;
      if(!hiding){ startChase(s); break; }
      if(s.path.length===0&&s.repath<=0){
        const pc=worldToCell2(STATE.pos.x,STATE.pos.z);
        const opts=[];
        for(const[ox,oy]of[[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]])
          if(!isBlockedSpider(pc.cx+ox,pc.cy+oy)) opts.push([ox,oy]);
        if(opts.length){
          const [ox,oy]=opts[Math.floor(Math.random()*opts.length)];
          const p=cellToWorld2(pc.cx+ox,pc.cy+oy);
          setPath2(p.x,p.z);
        }
        s.repath=rand(0.9,1.6);
        if(Math.random()<0.25&&s.scratchCD<=0){
          s.scratchCD=rand(5,8);
          u.scratchAnim=1.0;
          sfxSpiderScratch(clamp(1-d/30,0.2,1)*0.8, panTo(s.pos.x,s.pos.z));
        }
      }
      if(s.path.length===0) s.faceAng=Math.atan2(dx,dz);   // glare at the table
      if(s.stalkT<=0){
        sfxSpiderSniff(0.5,panTo(s.pos.x,s.pos.z));
        s.stacking=false; s.speedMult=1; s.seekRun=false;
        s.state="browse"; s.repath=0;
      }
      break;
    }
  }

  if(s.surf.mode==="floor" && s.surf.phase==="idle"){
  /* ---- speed: walks are walks; runs scale with the stacked multiplier ---- */
  let tgt=0;
  if(s.state==="browse") tgt=SPD.browse;
  else if(s.state==="stalk") tgt=SPD.stalk;
  else if(s.state==="seek") tgt=s.seekRun? RUN_BASE*s.speedMult : SPD.mildSeek;
  else if(s.state==="chase") tgt=RUN_BASE*Math.max(1,s.speedMult);
  const rate = tgt>s.curSpeed? 6:11;             // a lunge with a wind-up (~+1s to top)
  s.curSpeed += clamp(tgt-s.curSpeed, -rate*dt, rate*dt);

  /* ---- movement ---- */
  const prevX=s.pos.x, prevZ=s.pos.z;
  if(s.curSpeed>0.05&&s.path.length){
    if(s.path.length>1 && corridorClear2(s.pos.x,s.pos.z,s.path[1].x,s.path[1].z)) s.path.shift();
    const wp=s.path[0], wx=wp.x-s.pos.x, wz=wp.z-s.pos.z, wl=Math.hypot(wx,wz);
    if(wl<0.6) s.path.shift();
    else { s.pos.x+=wx/wl*s.curSpeed*dt; s.pos.z+=wz/wl*s.curSpeed*dt; s.faceAng=Math.atan2(wx,wz); }
  } else if(s.curSpeed>0.05&&s.state==="chase"){
    const dl=d||1;
    const nx=s.pos.x+dx/dl*s.curSpeed*dt, nz=s.pos.z+dz/dl*s.curSpeed*dt;
    const cc=worldToCell2(nx,nz);
    if(!isBlockedSpider(cc.cx,cc.cy)){ s.pos.x=nx; s.pos.z=nz; }
    s.faceAng=Math.atan2(dx,dz);
  }
  /* it will not press its face against a table it can't reach under. The
     margin must keep the whole keep-out INSIDE the table's cell (1.55+0.45
     = CELL/2): an overhang into open cells used to cancel path segments
     that grid corridors had validated, pinning it in place forever */
  {
    const tb=pushFromTables(s.pos.x,s.pos.z,0.45);
    s.pos.x=tb.x; s.pos.z=tb.z;
  }
  movedSpeed=Math.hypot(s.pos.x-prevX,s.pos.z-prevZ)/Math.max(dt,1e-5);
  s.headDir.set(Math.sin(s.faceAng),0,Math.cos(s.faceAng));   // floor heading for orientSpider

  /* anti-deadlock watchdog: commanded to move but going nowhere for over a
     second (push-outs, any future geometry trap) → drop the path and let
     the state machine pick a fresh one. Chase already repaths on its own.
     A pinned SEEK escalates: seek would just re-path the same unreachable
     spot 3×/s forever (the table-edge softlock), so if it's already within
     a stride and a half of the spot, that IS arrival — inspect from here,
     which also ends the episode and resets the stacked speed. */
  if(s.path.length&&s.curSpeed>0.5&&movedSpeed<0.3){
    s.stuckT+=dt;
    if(s.stuckT>1.2){
      s.stuckT=0; s.path=[]; s.repath=0;
      if(s.state==="seek"&&s.lastKnown&&s.pos.distanceTo(s.lastKnown)<CELL*1.5){
        s.faceAng=Math.atan2(s.lastKnown.x-s.pos.x,s.lastKnown.z-s.pos.z);
        s.state="investigate"; s.searchT=rand(1.82,3.22);
        startSniffFit(s,2+Math.floor(Math.random()*3),rand(0.4,0.9));
      }
    }
  } else s.stuckT=0;

  /* ---- the catch: it cannot reach under a table; anywhere else it can ---- */
  const lethal = s.state==="chase"||s.state==="stalk"||(s.state==="seek"&&s.seekRun);
  if(!underTable(STATE.pos.x,STATE.pos.z) && d<(lethal?2.1:1.5)) die();
  } else {
    movedSpeed=updateSurface(dt,dx,dz,d,sees);     // walls & ceiling
  }

  /* ---- pitter-patter: a tap roughly every stride-length of travel ---- */
  s.stepAcc+=movedSpeed*dt;
  const strideLen=movedSpeed>5? 0.95:0.55;
  if(s.stepAcc>=strideLen&&d<46){
    s.stepAcc=0;
    sfxSpiderTap(clamp(1-d/42,0,1)*(movedSpeed>5?0.6:0.34), panTo(s.pos.x,s.pos.z));
  }

  /* ---- animation ---- */
  const sp01=clamp(movedSpeed/10,0,1);
  s.anim += dt*(1.2+movedSpeed*1.35);
  const tNow=performance.now()/1000;
  const onFloorNow = s.surf.mode==="floor" && s.surf.phase==="idle";
  const cosY=Math.cos(s.faceAng), sinY=Math.sin(s.faceAng);
  for(const leg of u.legs){
    const sw=Math.sin(s.anim+leg.phase);
    const lift=Math.max(0,Math.sin(s.anim+leg.phase+1.3));
    let yaw=-leg.basePhi+sw*0.30*clamp(movedSpeed/3,0,1);
    let pitch=leg.pitch0+lift*0.34*clamp(movedSpeed/3,0,1);
    if(u.scratchAnim>0&&leg.front){
      /* a flurry against the shelf face */
      yaw=-leg.basePhi+Math.sin(tNow*30+leg.phase)*0.18;
      pitch=leg.pitch0+0.43+Math.sin(tNow*34+leg.phase*2)*0.4;
    }
    /* terrain: where would this foot land? Tall things (walls, shelves)
       fold the leg up against the face instead of skewering it; low things
       (tables, the desk — under half its height) it simply steps onto */
    let foldTgt=0;
    if(onFloorNow){                                  // terrain-fold is a floor probe; walls/ceiling are flat
      const phiEff=-yaw;
      const horiz=legReach(leg,pitch);
      const lx=leg.hx+Math.cos(phiEff)*horiz;
      const lz=leg.hz+Math.sin(phiEff)*horiz;
      const ct=cellAt(s.pos.x+lx*cosY+lz*sinY, s.pos.z-lx*sinY+lz*cosY);
      foldTgt = (ct===1||ct===2||ct===3)? 0.55 : (ct===4||ct===5)? 0.30 : 0;
    }
    leg.fold+=(foldTgt-leg.fold)*Math.min(1,dt*7);
    leg.hip.rotation.y=yaw;
    leg.femG.rotation.z=pitch+leg.fold+u.sniffAnim*leg.sniffComp;
  }
  if(u.scratchAnim>0) u.scratchAnim-=dt;
  /* the head dips when it sniffs — and when it braces to fire silk (telegraph) */
  const telegraph = s.surf.phase==="toCeiling"||s.surf.phase==="drop"||s.surf.phase==="dropAttack";
  if(s.state!=="investigate" && !telegraph) u.sniffAnim=Math.max(0,u.sniffAnim-dt*2);
  sniffPose(u);
  faceAnim(u,dt,tNow,movedSpeed,s.state==="chase"||s.state==="stalk");
  /* the abdomen cocks up as it aims the spinnerets at the ceiling */
  u.abd.rotation.x=-u.abdTilt*0.6;
  const breath=1+Math.sin(tNow*0.9)*0.04*(1-sp01);
  u.abd.scale.set(1.0*breath,0.9,1.35/breath);
  u.abd.position.y=(u.BODY_Y+0.12)+u.abdTilt*0.45;
  /* ember eyes flare when it commits */
  u.eyeMat.emissive.setHex(s.state==="chase"||s.state==="stalk"? 0x8a1410:0x3a0805);
  orientSpider(dt, movedSpeed);             // body rights itself to the floor/wall/ceiling

  /* ---- proximity dressing: dread, heartbeat, the skitter bed ----
     the red press of it is kept faint (−70%): a tint, not a blindfold */
  const prox=clamp(1-d/20,0,1);
  ui.dread.style.opacity = (s.state==="chase"||s.state==="stalk")? (0.09+prox*0.18):prox*0.135;
  /* the bed is silent while dead for the same reason level 0's is: the catch
     above calls die(), which ramps it out, and a write later in the SAME
     frame is the last one it ever gets — main.js has stopped the world by
     the next one. See the note in monster.js's continuous-audio block. */
  if(AU.ctx&&AU.spiderBedGain&&!STATE.dead){
    const t=AU.ctx.currentTime;
    AU.spiderBedGain.gain.setTargetAtTime(clamp(1-d/16,0,1)*0.16*(0.4+sp01*0.6), t, 0.2);
    if(AU.spiderBedPan) AU.spiderBedPan.pan.setTargetAtTime(panTo(s.pos.x,s.pos.z), t, 0.15);
  }
  AU.heartTimer-=dt;
  if(prox>0.3&&AU.heartTimer<=0){ sfxHeartbeat(); AU.heartTimer=lerp(1.4,0.5,prox); }
}
function startChase(s){
  if(s.state!=="chase"){
    s.state="chase"; s.repath=0;
    if(s.screechCD<=0){
      s.screechCD=6;
      sfxSpiderShriek(1.0,panTo(s.pos.x,s.pos.z));
    }
  }
}
function startStalk(s){
  /* short and sharp: a hidden player buys back their tempo quickly */
  s.state="stalk"; s.stalkT=rand(3.5,5.5); s.path=[]; s.repath=0;
  if(s.screechCD<=0){ s.screechCD=4; sfxSpiderShriek(0.7,panTo(s.pos.x,s.pos.z)); }
}
/* scripted-run animation: the terminal cutscene drives position itself and
   borrows the gait so the sprint reads right */
export function spiderPose(dt,speed){
  const s=spider, u=s.mesh.userData;
  s.anim+=dt*(1.2+speed*1.35);
  for(const leg of u.legs){
    const sw=Math.sin(s.anim+leg.phase);
    const lift=Math.max(0,Math.sin(s.anim+leg.phase+1.3));
    leg.hip.rotation.y=-leg.basePhi+sw*0.30;
    leg.femG.rotation.z=leg.pitch0+lift*0.34;
  }
  u.sniffAnim=0; sniffPose(u);
  faceAnim(u,dt,performance.now()/1000,speed,true);
  u.eyeMat.emissive.setHex(0x8a1410);
  s.mesh.position.set(s.pos.x, Math.abs(Math.sin(s.anim*2))*0.07, s.pos.z);
  s.mesh.rotation.set(0,s.faceAng,0);     // clear any surface tilt before the scripted run
}
/* scripted digging: the terminal ending parks it over the dig spot and calls
   this every frame. The front two leg pairs strike downward in a violent
   flurry, the back pairs brace, the head stays buried in the work — and the
   whole body rides `sink` metres below the floor as it digs itself under. */
/* one scoop, as [cycle, swing back, pitch down]: reach forward with the
   claw up, drive it down, drag it back under the body, flick the spoil
   out behind, and bring it forward again high */
const SCOOP=[[0,-0.32,-0.05],[0.18,-0.34,0.58],[0.62,0.36,0.52],[0.72,0.46,-0.18],[1,-0.32,-0.05]];
const SCOOP_FLICK=0.64;
function scoopAt(c){
  for(let i=0;i<SCOOP.length-1;i++){
    const a=SCOOP[i], b=SCOOP[i+1];
    if(c<=b[0]){ let k=(c-a[0])/(b[0]-a[0]); k=k*k*(3-2*k); return [a[1]+(b[1]-a[1])*k, a[2]+(b[2]-a[2])*k]; }
  }
  return [SCOOP[0][1],SCOOP[0][2]];
}
const _foot=new THREE.Vector3();
/* where a claw is in the world (for the cutscene's thrown spoil) */
export function spiderFootWorld(leg,out=_foot){
  return out.set(leg.tipX,leg.tipY,0).applyMatrix4(leg.femG.matrixWorld);
}
export function spiderDigPose(dt,sink=0){
  const s=spider, u=s.mesh.userData;
  const tNow=performance.now()/1000;
  s.anim+=dt*3;
  /* burrowing, not descending on a rope: as the pit deepens the whole body
     pitches nose-first (to ~55°) and slides FORWARD into the dark — the
     front goes under while the abdomen is still working the surface */
  const dive=clamp(sink/1.6,0,1);
  const hz=2.0+dive*0.7;
  u.digFlick=u.digFlick||[]; u.digFlick.length=0;
  for(const leg of u.legs){
    if(leg.row<2){
      /* the front two pairs take turns: left and right half a stroke apart,
         the second pair a quarter behind the first, so there is always a
         claw going in and one coming out */
      const side=leg.hx>0? 1 : -1;
      const off=(side>0?0.5:0)+(leg.row?0.25:0);
      const c=(((s.digT||0)*hz+off)%1+1)%1;
      if(leg.digC!==undefined&&leg.digC<SCOOP_FLICK&&c>=SCOOP_FLICK) u.digFlick.push(leg);
      leg.digC=c;
      const [sw,pd]=scoopAt(c);
      leg.hip.rotation.y=-leg.basePhi+side*sw;
      leg.femG.rotation.z=leg.pitch0+0.3+pd;
    } else {
      /* braced low — scrambling harder the steeper it tips, shoving it down */
      leg.hip.rotation.y=-leg.basePhi+Math.sin(tNow*(3+dive*15)+leg.phase)*(0.04+dive*0.16);
      leg.femG.rotation.z=leg.pitch0+0.14+dive*0.30+u.sniffAnim*leg.sniffComp;
    }
  }
  u.sniffAnim=Math.min(1,u.sniffAnim+dt*3);      // head down into the work
  sniffPose(u);
  faceAnim(u,dt,tNow,0,true);
  u.abd.rotation.x=0.22-dive*0.12;                // abdomen cocked up, throwing spoil
  u.abd.position.y=(u.BODY_Y+0.12)+0.18;
  u.eyeMat.emissive.setHex(0x8a1410);
  s.digT=(s.digT||0)+dt;
  /* the body rides the strokes: it rocks into every drag and rolls toward
     whichever side is pulling */
  const st=s.digT*hz*Math.PI*2;
  const fwd=0.9*dive, pitch=0.16+dive*0.8+0.045*Math.sin(st*2)*(1-dive*0.5);
  s.mesh.position.set(s.pos.x+Math.sin(s.faceAng)*fwd,
                      Math.abs(Math.sin(st))*0.045*(1-dive*0.6)-sink,
                      s.pos.z+Math.cos(s.faceAng)*fwd);
  s.mesh.rotation.order="YXZ";
  s.mesh.rotation.set(pitch,s.faceAng,0.05*Math.sin(st)*(1-dive*0.5));
}
/* ---- debug hooks (smoke tests): force the new surface transitions ---- */
export function debugSpiderToWall(){
  const s=spider;
  s.pos.set(-(INNER-CELL),0,0);            // a cell off the west wall, for a clean short climb
  s.surf.mode="floor"; s.surf.phase="idle"; s.state="browse"; s.pendingT=0; s.stacking=false;
  startToWall();
}
export function debugSpiderDiscTransit(x,z){     // force an immediate surface route to (x,z)
  const s=spider;
  s.surf.mode="floor"; s.surf.phase="idle"; s.pendingT=0;
  s.lastKnown=new THREE.Vector3(x,0,z); s.discFar=true;
  startDiscTransit(x,z);
}
export function debugSpiderToCeiling(){
  const s=spider;
  s.surf.mode="floor"; s.surf.phase="idle"; s.state="browse"; s.pendingT=0; s.stacking=false;
  startToCeiling();
}

/* drop it into the far stacks, calm */
export function resetSpider(farFromX,farFromZ,minDist=33){
  const s=spider;
  let p=cellToWorld2(2,2);
  for(let t=0;t<400;t++){
    const c=randomReachCell(), q=cellToWorld2(c.cx,c.cy);
    if(Math.hypot(q.x-farFromX,q.z-farFromZ)>minDist){ p=q; break; }
  }
  s.pos.set(p.x,0,p.z);
  s.state="browse"; s.path=[]; s.repath=0; s.curSpeed=0;
  s.pendingT=0; s.speedMult=1; s.stacking=false; s.seekRun=false;
  s.lastKnown=null; s.target=null; s.mildCD=0; s.screechCD=0; s.stepAcc=0;
  s.sniffsLeft=0; s.scratchCD=0; s.sniffCD=0; s.stuckT=0; s.floorPaths=0; s.discFar=false;
  /* back on the floor, body upright; drop any silk it was mid-spinning */
  if(s.surf.web) removeWeb(s.surf.web);
  s.surf.mode="floor"; s.surf.phase="idle"; s.surf.t=0; s.surf.ramp=0; s.surf.goal=null; s.surf.hang=false; s.surf.weaveBase=null;
  s.surf.pursue=false; s.surf.glideActive=false; s.surf.glides=0; s.surf.wall=null;
  s.surf.web=null; s.surf.struck=false; s.surf.killed=false;
  s.surf.targetN.set(0,1,0);
  s.headDir.set(0,0,1);
  if(s.mesh){
    s.mesh.position.set(p.x,0,p.z); s.mesh.quaternion.identity();
    const u=s.mesh.userData;
    u.abdTilt=0; u.sniffAnim=0; u.abd.rotation.x=0; u.abd.position.set(0,u.BODY_Y+0.12,u.ABD_Z);
  }
}

/* ================= THE NEST — the librarian, at home ================= */
/* Down here it is a parent. It circulates between the brood chambers on a
   tending patrol; near the nests the silk-laced ground carries your
   footfalls to it at twice the range, while out in the open cave it is
   duller than you remember. It cannot follow you through the squeezes.
   Burn a clutch and it comes at a dead run — and once the last one burns,
   it never goes back to tending anything. */
import { CAVE, cellToWorld3, worldToCell3, isBlockedSpider3, bfsPath3, losCells3,
         cellAt3, randomReachCell3, surfaceNoiseGain, silkGainAt, CAVE_SPAN,
         floorYAt } from "./cave.js";
import { anyLatched } from "./hatchling.js";

const inSqueeze=()=>cellAt3(STATE.pos.x,STATE.pos.z)===2;
function corridorClear3(ax,az,bx,bz){
  const dx=bx-ax, dz=bz-az, len=Math.hypot(dx,dz);
  if(len<0.001) return true;
  const ox=-dz/len*0.7, oz=dx/len*0.7;
  const steps=Math.ceil(len);
  for(let i=1;i<=steps;i++){
    const t=i/steps, x=lerp(ax,bx,t), z=lerp(az,bz,t);
    for(const[sx,sz]of[[0,0],[ox,oz],[-ox,-oz]]){
      const c=worldToCell3(x+sx,z+sz);
      if(isBlockedSpider3(c.cx,c.cy)) return false;
    }
  }
  return true;
}
/* `setPath3` REPORTS WHETHER IT COULD ACTUALLY GET THERE, and every caller
   that measures arrival against its own mark has to read that.

   `bfsPath3` is best-effort: handed a cell it cannot stand in — a squeeze,
   the far side of a rubble choke, anything the flood never reached — it
   returns the route to the nearest cell it CAN stand in and says nothing.
   Left unchecked that is a hard softlock, and it is the exact library bug
   in a new costume: she walks to the doorstep of the crawl you are hiding
   in, her path runs dry two or three cells short of the mark, and an
   arrival test written against the MARK never fires. She then re-paths the
   same impossible cell every 0.35–0.8s forever, standing perfectly still.
   The movement watchdog cannot save her either, because that one only
   fires while a path EXISTS and here the path is empty.

   The fix is the library's: THE DOORSTEP IS THE DESTINATION. Callers snap
   their mark onto `end` when `reached` is false, so every radius below is
   measured against a place she can physically stand, the episode arrives,
   and `investigate` closes it out the way it always did. */
function setPath3(wx,wz){
  const s=spider;
  let a=worldToCell3(s.pos.x,s.pos.z);
  if(isBlockedSpider3(a.cx,a.cy)){
    for(const[ox,oy]of[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
      if(!isBlockedSpider3(a.cx+ox,a.cy+oy)){
        const q=cellToWorld3(a.cx+ox,a.cy+oy);
        s.pos.x=q.x; s.pos.z=q.z;
        a=worldToCell3(q.x,q.z);
        break;
      }
    }
  }
  const b=worldToCell3(clamp(wx,-CAVE_SPAN/2+CELL,CAVE_SPAN/2-CELL),
                       clamp(wz,-CAVE_SPAN/2+CELL,CAVE_SPAN/2-CELL));
  const p=bfsPath3(a.cx,a.cy,b.cx,b.cy,false);
  s.path = p? p.map(c=>cellToWorld3(c.cx,c.cy)) : [];
  /* read the endpoint off the RAW route, before the shift and the smoothing
     chew on the copy: an exhausted path is [] and would report nothing */
  const endC = (p&&p.length)? p[p.length-1] : null;
  const reached = !!endC && endC.cx===b.cx && endC.cy===b.cy;
  if(s.path.length>1) s.path.shift();
  /* smooth */
  if(s.path.length>=3){
    const out=[]; let cx=s.pos.x, cz=s.pos.z, i=0;
    while(i<s.path.length){
      let j=s.path.length-1;
      while(j>i && !corridorClear3(cx,cz,s.path[j].x,s.path[j].z)) j--;
      out.push(s.path[j]); cx=s.path[j].x; cz=s.path[j].z; i=j+1;
    }
    s.path=out;
  }
  return {reached, end: endC? cellToWorld3(endC.cx,endC.cy) : null};
}
/* move a mark onto the closest ground she can actually stand on. Only ever
   called when the route came back short — an unreachable pocket becomes its
   own doorstep, which is what "she got as near as the cave allows" means. */
function snapMark(mark,r){
  if(mark&&r&&!r.reached&&r.end) mark.set(r.end.x,0,r.end.z);
}
/* ---- what a NOISE tells it ------------------------------------------
   THE GAINS MULTIPLY, AND FIVE OF THEM MULTIPLY TO TELEPATHY. Each one is
   defensible on its own — a sprint is louder than a walk, scree roars, a
   silk-laced nest floor carries a footfall straight to her, a burning
   clutch has her listening for you — and the code multiplied all five
   together. Measured in a built cave: standing on a nest floor and simply
   WALKING put the strong (sprint-at-you) radius at 22.4m and the mild one
   at 33.7m, and one clutch alight took those to 35.9m and 53.8m. The cave
   is 188m across, 22% of its walkable cells are silk — and they are the
   22% the level REQUIRES you to stand on, four times, to win. So from a
   third of the map away, through solid rock, with no line of sight and no
   hatchling on your shoulder, she knew where you were and came. That is
   the "it just knows" the level shipped with.
   The product is CAPPED. One number, and it is the loudest the cave is
   ever allowed to be: 17.3m sprinting to you, 26.0m walking. Every plain
   case is well under it and unchanged (stone 9.0/13.5, scree 15.0/22.5) —
   the cap only bites where the stack was compounding.

   And what hearing gives you is a PLACE, NOT A PIN. Even inside the
   radius the old code copied STATE.pos exactly, so she did not walk
   toward the noise, she walked onto your head — which is the other half
   of what reads as telepathy. `heardSpot` scatters the mark by an error
   that grows with range, held steady for a second or so at a time so it
   drifts with you rather than jittering per frame. She arrives NEAR you
   and starts sniffing, which is what `investigate` was always for. The
   two channels that legitimately have you pinned keep the pin: sight
   (`chase`), and a child of hers screaming from your shoulder. */
const GAIN_CAP=1.7;
function heardSpot(s,d){
  if(s.hearT<=0){
    s.hearT=rand(0.9,1.6);
    s.hearA=Math.random()*Math.PI*2;
    s.hearF=Math.random();
  }
  const err=clamp(d*0.16,0,3.0)*s.hearF;
  return new THREE.Vector3(STATE.pos.x+Math.cos(s.hearA)*err, 0,
                           STATE.pos.z+Math.sin(s.hearA)*err);
}
function caveCanSee(){
  if(inSqueeze()) return false;                    // the crawl hides you whole
  const d=spider.pos.distanceTo(STATE.pos);
  const range=(STATE.crouch||!STATE.moving)? 3.6 : 9.4*(STATE.sprinting?1.15:1.05);
  if(d>range) return false;
  return losCells3(spider.pos.x,spider.pos.z,STATE.pos.x,STATE.pos.z);
}
function nextBrood(){
  const s=spider;
  const alive=CAVE.broods.map((b,i)=>({b,i})).filter(e=>!e.b.burned);
  if(!alive.length) return null;
  /* the tending round: the next unburned nest along, never the one it's at */
  const cur=s.nestIdx===undefined? -1 : s.nestIdx;
  const next=alive.find(e=>e.i>cur) || alive[0];
  s.nestIdx=next.i;
  return next.b;
}

/* ---- the room ledger ----------------------------------------------
   `hunt` quarters the cave around the cell YOU are standing in, so every
   target it picks for itself lands in your room — and with a crouched,
   stationary player it cannot see or hear, that is a camp, not a hunt: it
   circles the same chamber indefinitely, shrieking, never closing. Worse,
   it never released `lastKnown` after working it, so even the quartering
   was tethered — drift 3m off the old spot and it walked straight back.

   So the player-anchored rolls are COUNTED: three in a row and the next
   target must be another room entirely, and it is COMMITTED to — it has to
   arrive before it may quarter again. That spreads its routes across the
   warren and guarantees a stationary player a window.

   Count the ROLLS, not the room the target lands in. Booking targets
   against a room key was the first attempt and it silently did nothing:
   the quartering throws targets ±6 cells, most of which fall in tunnel
   cells outside the chamber, so consecutive picks kept landing in
   different buckets and reset the counter. A player-anchored roll is the
   camp by construction — that is the thing to cap. */
function roomOf3(x,z){
  const c=worldToCell3(x,z);
  let best=-1, bd=1e9;
  for(let i=0;i<CAVE.chambers.length;i++){
    const ch=CAVE.chambers[i];
    const dd=Math.hypot(c.cx-ch.cx,c.cy-ch.cy);
    if(dd<=ch.r+1.5&&dd<bd){ bd=dd; best=i; }
  }
  return best>=0? "c"+best : "t"+(c.cx>>2)+","+(c.cy>>2);
}
const ROOM_CAP=3;
/* somewhere it is NOT: a chamber (those are this level's rooms), never the
   one it is standing in and never the one you are in */
function otherRoomCell3(){
  const s=spider;
  const mine=roomOf3(s.pos.x,s.pos.z), yours=roomOf3(STATE.pos.x,STATE.pos.z);
  const opts=[];
  for(let i=0;i<CAVE.chambers.length;i++){
    const key="c"+i;
    if(key===mine||key===yours) continue;
    const ch=CAVE.chambers[i];
    if(isBlockedSpider3(ch.cx,ch.cy)) continue;
    opts.push(cellToWorld3(ch.cx,ch.cy));
  }
  if(opts.length) return opts[Math.floor(Math.random()*opts.length)];
  for(let t=0;t<24;t++){                     // no chamber free: anywhere far
    const c=randomReachCell3(), q=cellToWorld3(c.cx,c.cy);
    if(Math.hypot(q.x-STATE.pos.x,q.z-STATE.pos.z)>25) return q;
  }
  return null;
}

export function updateSpiderCave(dt){
  if(!spider.active||STATE.dead||STATE.won) return;
  const s=spider, u=s.mesh.userData;
  const dx=STATE.pos.x-s.pos.x, dz=STATE.pos.z-s.pos.z;
  const d=Math.hypot(dx,dz);
  const frenzy=STATE.frenzyT>0;
  const allBurned=STATE.clutchesLit>=4;
  s.repath-=dt; s.mildCD-=dt; s.screechCD-=dt; s.scratchCD-=dt; s.sniffCD-=dt;
  s.hearT=(s.hearT||0)-dt;

  /* sniff fits (same voice as upstairs) */
  if(s.sniffsLeft>0){
    s.sniffT-=dt;
    if(s.sniffT<=0){
      s.sniffsLeft--;
      s.sniffT=rand(0.25,0.95);
      if(s.sniffsLeft<=0) s.sniffCD=rand(22,38);   // re-arm from the last puff
      sfxSpiderSniff(clamp(1-d/34,0.06,1)*0.55, panTo(s.pos.x,s.pos.z));
    }
  }

  /* ---- a clutch just went up ---- */
  if(CAVE.lastBurn && s.burnSeen!==CAVE.lastBurn.at){
    s.burnSeen=CAVE.lastBurn.at;
    s.state="frenzy";
    s.lastKnown=new THREE.Vector3(CAVE.lastBurn.x,0,CAVE.lastBurn.z);
    s.repath=0; s.path=[];
    sfxSpiderShriek(1.0,panTo(s.pos.x,s.pos.z));
  }

  /* ---- hearing ---- */
  const latched=anyLatched();
  if(latched){
    /* its child is screaming from your shoulder */
    s.lastKnown=STATE.pos.clone();
    if(s.state!=="chase"&&s.state!=="frenzy"){ s.state="seek"; s.seekRun=true; if(s.repath>0.35)s.repath=0.35; }
  } else if(STATE.cranking){
    /* the ratchet grind carries clean through stone */
    if(d<18){
      s.lastKnown=heardSpot(s,d);
      if(s.state!=="chase"&&s.state!=="frenzy"){ s.state="seek"; s.seekRun=d<10; s.repath=Math.min(s.repath,0.5); }
    }
  } else if(STATE.moving&&!STATE.crouch){
    const moveGain=STATE.sprinting? 1.15:1.10;
    const surfGain=surfaceNoiseGain(STATE.pos.x,STATE.pos.z);
    const silk=silkGainAt(STATE.pos.x,STATE.pos.z);
    const dull=silk>1? 1:0.8;                     // open cave: duller than the library
    const sense=frenzy? 1.6 : allBurned? 1.25 : 1;
    const gain=Math.min(moveGain*surfGain*silk*dull*sense, GAIN_CAP);
    const strongR=10.2*gain, mildR=15.3*gain;
    if(d<strongR){
      s.lastKnown=heardSpot(s,d);
      if(s.state!=="chase"&&s.state!=="frenzy"){
        if(s.state!=="seek"||!s.seekRun) s.repath=0;
        s.state="seek"; s.seekRun=true;
      }
    } else if(d<mildR&&s.mildCD<=0&&(s.state==="tend"||s.state==="tending"||s.state==="rampage")){
      s.mildCD=2;
      s.lastKnown=heardSpot(s,d);
      s.state="seek"; s.seekRun=false; s.repath=0;
    }
  }
  /* ---- the lantern is a beacon ---- */
  if(STATE.lanternOn){
    s.glowT=(s.glowT||0)+dt;
    s.glowCD=(s.glowCD||0)-dt;
    if(s.glowT>5&&s.glowCD<=0&&d<40&&losCells3(s.pos.x,s.pos.z,STATE.pos.x,STATE.pos.z)
       &&s.state!=="chase"&&s.state!=="frenzy"){
      s.glowCD=3;
      s.lastKnown=heardSpot(s,d);          // a glow at range is a bearing, not a pin
      s.state="seek"; s.seekRun=d<16; s.repath=0;
    }
  } else s.glowT=0;

  const sees=caveCanSee();
  let movedSpeed=0;

  /* ---- state machine ---- */
  switch(s.state){
    case "tend":{
      if(sees){ s.state="chase"; s.repath=0; if(s.screechCD<=0){s.screechCD=6;sfxSpiderShriek(1,panTo(s.pos.x,s.pos.z));} break; }
      if(!s.tendTgt){
        const b=allBurned? null : nextBrood();
        if(!b){ s.state="hunt"; break; }
        s.tendTgt=b.center;
        setPath3(s.tendTgt.x,s.tendTgt.z); s.repath=2;
      }
      if(s.path.length===0&&s.repath<=0&&s.tendTgt){ setPath3(s.tendTgt.x,s.tendTgt.z); s.repath=2; }
      if(s.tendTgt&&Math.hypot(s.tendTgt.x-s.pos.x,s.tendTgt.z-s.pos.z)<2.6){
        s.state="tending"; s.pauseT=rand(4,7); s.scratchT=rand(0.4,1.0);
        s.faceAng=Math.atan2(s.tendTgt.x-s.pos.x,s.tendTgt.z-s.pos.z);
        s.tendTgt=null; s.path=[];
      }
      break;
    }
    case "tending":
      if(sees){ s.state="chase"; s.repath=0; break; }
      s.pauseT-=dt; s.scratchT-=dt;
      if(s.scratchT<=0&&s.scratchCD<=0){
        s.scratchT=rand(3,6); s.scratchCD=rand(4,8);
        u.scratchAnim=1.0;
        sfxSpiderScratch(clamp(1-d/60,0.05,1)*0.7, panTo(s.pos.x,s.pos.z));
      }
      if(s.pauseT<=0){ s.state="tend"; s.repath=0; }
      break;
    case "seek":{
      if(sees){ s.state="chase"; s.repath=0; if(s.screechCD<=0){s.screechCD=6;sfxSpiderShriek(1,panTo(s.pos.x,s.pos.z));} break; }
      if(s.lastKnown&&s.repath<=0){
        /* the mark is usually YOU, and you are allowed to be somewhere she
           is not: crouched down a squeeze, past a choke. Snap it to where
           the route actually ends or she seeks that spot forever. */
        snapMark(s.lastKnown, setPath3(s.lastKnown.x,s.lastKnown.z));
        s.repath=s.seekRun?0.35:0.8;
      }
      const dLK=s.lastKnown? s.pos.distanceTo(s.lastKnown) : 1e9;
      if(dLK<2.0||(s.path.length===0&&dLK<CELL*1.5)){
        if(s.lastKnown) s.faceAng=Math.atan2(s.lastKnown.x-s.pos.x,s.lastKnown.z-s.pos.z);
        s.state="investigate"; s.searchT=rand(1.8,3.2); s.path=[];
        startSniffFit(s,1+Math.floor(Math.random()*2),rand(0.4,0.9));  // half the library's fit: down here it huffs less
      }
      break;
    }
    case "investigate":
      if(sees){ s.state="chase"; s.repath=0; break; }
      s.searchT-=dt;
      u.sniffAnim=Math.min(1,u.sniffAnim+dt*3);
      s.faceAng+=dt*0.9;
      if(s.searchT<=0){
        s.seekRun=false;
        s.state = frenzy? "rampage" : allBurned? "hunt" : "tend";
        s.tendTgt=null; s.repath=0;
      }
      break;
    case "chase":
      if(!sees){
        s.lastKnown=STATE.pos.clone();
        s.state="seek"; s.seekRun=true; s.repath=0;
      } else {
        s.lastKnown=STATE.pos.clone();
        if(s.repath<=0){ setPath3(STATE.pos.x,STATE.pos.z); s.repath=0.3; }
      }
      break;
    case "frenzy":{
      /* coming for the fire at a dead run */
      if(sees){ s.state="chase"; s.repath=0; break; }
      if(s.lastKnown&&s.repath<=0){
        snapMark(s.lastKnown, setPath3(s.lastKnown.x,s.lastKnown.z));
        s.repath=0.4;
      }
      const dB=s.lastKnown? s.pos.distanceTo(s.lastKnown):0;
      if(dB<3.4||(s.path.length===0&&dB<CELL*1.6)){
        s.state="rampage"; s.path=[]; s.repath=0;
        s.rageC=s.lastKnown? s.lastKnown.clone() : s.pos.clone();
        startSniffFit(s,2,0.3);
      }
      break;
    }
    case "rampage":{
      /* circling the murdered nest until the rage clock runs out */
      if(sees){ s.state="chase"; s.repath=0; break; }
      if(!frenzy){ s.state=allBurned? "hunt":"tend"; s.tendTgt=null; s.repath=0; break; }
      if(s.path.length===0&&s.repath<=0){
        const c=worldToCell3(s.rageC.x,s.rageC.z);
        let px=null,pz=null;
        for(let t=0;t<10;t++){
          const ox=Math.floor(rand(-4,5)), oy=Math.floor(rand(-4,5));
          if(!isBlockedSpider3(c.cx+ox,c.cy+oy)){
            const q=cellToWorld3(c.cx+ox,c.cy+oy); px=q.x; pz=q.z; break;
          }
        }
        if(px!==null) setPath3(px,pz);
        s.repath=rand(0.8,1.5);
        if(Math.random()<0.3&&s.screechCD<=0){ s.screechCD=5; sfxSpiderShriek(0.6,panTo(s.pos.x,s.pos.z)); }
      }
      break;
    }
    case "hunt":{
      /* nothing left to tend. There is only you. */
      if(sees){ s.state="chase"; s.repath=0; break; }
      s.huntT=(s.huntT||0)-dt;
      if(s.lastKnown&&s.pos.distanceTo(s.lastKnown)>3){
        /* a real cue outranks anything it invented for itself */
        s.roamTgt=null;
        if(s.repath<=0){
          /* same snap as `seek`: unsnapped, a mark she cannot reach never
             falls inside the 3m release below, so the hunt parks on it */
          snapMark(s.lastKnown, setPath3(s.lastKnown.x,s.lastKnown.z));
          s.repath=0.5;
        }
      } else {
        /* it has worked that spot — release it, or the quartering below is
           just a tether that keeps snapping back to one corner */
        s.lastKnown=null;
        if(s.roamTgt){
          /* a roam is COMMITTED: it walks the target down instead of
             re-rolling one every couple of seconds. Re-rolling is what let
             the old hunt orbit you forever — and, once the cap existed, it
             also burned the room's three picks in five seconds of travel,
             so it turned around before it ever arrived anywhere. */
          s.roamT-=dt;
          if(Math.hypot(s.roamTgt.x-s.pos.x,s.roamTgt.z-s.pos.z)<3.5||s.roamT<=0) s.roamTgt=null;
          else if(s.repath<=0){
            setPath3(s.roamTgt.x,s.roamTgt.z); s.repath=rand(1.2,2.2);
            if(!s.path.length) s.roamTgt=null;      // unreachable: don't stall on it
          }
        }
        if(!s.roamTgt&&s.repath<=0){
          let q=null;
          if((s.roomN||0)>=ROOM_CAP&&(q=otherRoomCell3())) s.roomN=0;   // go somewhere else
          if(!q){
            /* a hunch: it quarters the cave toward where you breathe */
            const pc=worldToCell3(STATE.pos.x,STATE.pos.z);
            for(let t=0;t<12;t++){
              const ox=Math.floor(rand(-6,7)), oy=Math.floor(rand(-6,7));
              if(!isBlockedSpider3(pc.cx+ox,pc.cy+oy)){ q=cellToWorld3(pc.cx+ox,pc.cy+oy); break; }
            }
            if(!q){ const c=randomReachCell3(); q=cellToWorld3(c.cx,c.cy); }
            s.roomN=(s.roomN||0)+1;
          }
          s.roamTgt={x:q.x,z:q.z}; s.roamT=18;
          setPath3(q.x,q.z); s.repath=rand(1.2,2.2);
          if(!s.path.length) s.roamTgt=null;
        }
      }
      if(s.huntT===undefined||s.huntT<=0){
        s.huntT=rand(12,20);
        sfxSpiderShriek(0.55,panTo(s.pos.x,s.pos.z));
      }
      break;
    }
    default:
      s.state="tend"; s.tendTgt=null;
  }

  /* ---- speed ---- */
  let tgt=0;
  /* the warren is half again as wide now: the unhurried gaits cover more
     ground so the tending rounds and hunts keep their old pacing — but the
     first pass overshot by ~20%. At 7.2 the hunt was within a whisker of
     the 7.28 run and read as a chase that never resolved; every UNHURRIED
     gait (tend/mild seek/rampage/hunt) is 20% off those numbers now. The
     run speeds — chase, frenzy, seekRun — are untouched: those ARE the
     chase, and they are what the escape is measured against. */
  if(s.state==="tend") tgt=4.5;
  else if(s.state==="seek") tgt=s.seekRun? RUN_BASE*(frenzy?1.15:allBurned?1.05:1) : 4.58;
  else if(s.state==="chase") tgt=RUN_BASE*(frenzy?1.15:1.05);
  else if(s.state==="frenzy") tgt=RUN_BASE*1.15;
  else if(s.state==="rampage") tgt=5.4;
  else if(s.state==="hunt") tgt=5.8;
  const rate = tgt>s.curSpeed? 6:11;
  s.curSpeed += clamp(tgt-s.curSpeed, -rate*dt, rate*dt);

  /* ---- movement ---- */
  const prevX=s.pos.x, prevZ=s.pos.z;
  if(s.curSpeed>0.05&&s.path.length){
    if(s.path.length>1 && corridorClear3(s.pos.x,s.pos.z,s.path[1].x,s.path[1].z)) s.path.shift();
    const wp=s.path[0], wx=wp.x-s.pos.x, wz=wp.z-s.pos.z, wl=Math.hypot(wx,wz);
    if(wl<0.6) s.path.shift();
    else { s.pos.x+=wx/wl*s.curSpeed*dt; s.pos.z+=wz/wl*s.curSpeed*dt; s.faceAng=Math.atan2(wx,wz); }
  } else if(s.curSpeed>0.05&&s.state==="chase"){
    const dl=d||1;
    const nx=s.pos.x+dx/dl*s.curSpeed*dt, nz=s.pos.z+dz/dl*s.curSpeed*dt;
    const cc=worldToCell3(nx,nz);
    if(!isBlockedSpider3(cc.cx,cc.cy)){ s.pos.x=nx; s.pos.z=nz; }
    s.faceAng=Math.atan2(dx,dz);
  }
  movedSpeed=Math.hypot(s.pos.x-prevX,s.pos.z-prevZ)/Math.max(dt,1e-5);
  s.headDir.set(Math.sin(s.faceAng),0,Math.cos(s.faceAng));

  /* watchdog: pinned → give up the path (same trap-safety as upstairs) */
  if(s.path.length&&s.curSpeed>0.5&&movedSpeed<0.3){
    s.stuckT+=dt;
    if(s.stuckT>1.2){
      s.stuckT=0; s.path=[]; s.repath=0;
      s.roamTgt=null;                       // a crossing it cannot physically close
      if(s.state==="seek"&&s.lastKnown&&s.pos.distanceTo(s.lastKnown)<CELL*1.5){
        s.faceAng=Math.atan2(s.lastKnown.x-s.pos.x,s.lastKnown.z-s.pos.z);
        s.state="investigate"; s.searchT=rand(1.8,3.2);
      }
    }
  } else s.stuckT=0;

  /* THE WATCHDOG ABOVE ONLY FIRES WHILE A PATH EXISTS, AND THE CAVE'S
     FAILURE IS THE OPPOSITE ONE: the path is EMPTY. Upstairs a pinned
     spider is pinned by `pushFromTables` cancelling movement along a route
     the grid still believes in, so there is always a path to drop. Down
     here `bfsPath3` hands back the doorstep, she stands on it, the route
     runs out and she is left commanded, pathless and motionless — moving
     at 0 m/s with `curSpeed` sitting at the full seek pace, forever.
     The snaps above close every case we know of; this closes the shape.
     Any pursuit that cannot move and has nowhere to go ENDS. */
  if(!s.path.length&&s.curSpeed>0.5&&movedSpeed<0.3&&
     (s.state==="seek"||s.state==="frenzy"||s.state==="hunt"||s.state==="tend")){
    s.idleT=(s.idleT||0)+dt;
    if(s.idleT>1.5){
      s.idleT=0; s.repath=0; s.roamTgt=null;
      if(s.state==="tend") s.tendTgt=null;          // that nest is not reachable from here: take the next one
      else if(s.state==="hunt") s.lastKnown=null;   // stop working a mark she can't close on
      else {
        if(s.lastKnown) s.faceAng=Math.atan2(s.lastKnown.x-s.pos.x,s.lastKnown.z-s.pos.z);
        s.state="investigate"; s.searchT=rand(1.8,3.2);
        startSniffFit(s,1,rand(0.4,0.9));
      }
    }
  } else s.idleT=0;

  /* ---- the catch: the squeezes are the tables of this level ---- */
  const lethal = s.state==="chase"||s.state==="frenzy"||s.state==="hunt"||(s.state==="seek"&&s.seekRun);
  if(!inSqueeze() && d<(lethal?2.1:1.5)) die();

  /* ---- taps ---- */
  s.stepAcc+=movedSpeed*dt;
  const strideLen=movedSpeed>5? 0.95:0.55;
  if(s.stepAcc>=strideLen&&d<46){
    s.stepAcc=0;
    sfxSpiderTap(clamp(1-d/42,0,1)*(movedSpeed>5?0.6:0.34), panTo(s.pos.x,s.pos.z));
  }

  /* ---- animation (floor gait; there is no climbing down here) ---- */
  const sp01=clamp(movedSpeed/10,0,1);
  s.anim += dt*(1.2+movedSpeed*1.35);
  const tNow=performance.now()/1000;
  const cosY=Math.cos(s.faceAng), sinY=Math.sin(s.faceAng);
  for(const leg of u.legs){
    const sw=Math.sin(s.anim+leg.phase);
    const lift=Math.max(0,Math.sin(s.anim+leg.phase+1.3));
    let yaw=-leg.basePhi+sw*0.30*clamp(movedSpeed/3,0,1);
    let pitch=leg.pitch0+lift*0.34*clamp(movedSpeed/3,0,1);
    if(u.scratchAnim>0&&leg.front){
      yaw=-leg.basePhi+Math.sin(tNow*30+leg.phase)*0.18;
      pitch=leg.pitch0+0.43+Math.sin(tNow*34+leg.phase*2)*0.4;
    }
    let foldTgt=0;
    {
      const phiEff=-yaw;
      const horiz=legReach(leg,pitch);
      const lx=leg.hx+Math.cos(phiEff)*horiz;
      const lz=leg.hz+Math.sin(phiEff)*horiz;
      const ct=cellAt3(s.pos.x+lx*cosY+lz*sinY, s.pos.z-lx*sinY+lz*cosY);
      foldTgt = (ct===1||ct===2||ct===7)? 0.55 : 0;
    }
    leg.fold+=(foldTgt-leg.fold)*Math.min(1,dt*7);
    leg.hip.rotation.y=yaw;
    leg.femG.rotation.z=pitch+leg.fold+u.sniffAnim*leg.sniffComp;
  }
  if(u.scratchAnim>0) u.scratchAnim-=dt;
  if(s.state!=="investigate") u.sniffAnim=Math.max(0,u.sniffAnim-dt*2);
  sniffPose(u);
  u.abd.rotation.x=0;
  const breath=1+Math.sin(tNow*0.9)*0.04*(1-sp01);
  u.abd.scale.set(1.0*breath,0.9,1.35/breath);
  u.abd.position.y=u.BODY_Y+0.12;
  const aggressive=s.state==="chase"||s.state==="frenzy"||s.state==="hunt"||s.state==="rampage";
  u.eyeMat.emissive.setHex(aggressive? 0x8a1410:0x3a0805);
  faceAnim(u,dt,tNow,movedSpeed,aggressive);
  const bob=Math.abs(Math.sin(s.anim*2))*0.07*sp01;
  s.mesh.position.set(s.pos.x,floorYAt(s.pos.x,s.pos.z)+bob,s.pos.z);
  s.mesh.quaternion.setFromEuler(new THREE.Euler(0,s.faceAng,0));

  /* ---- dread ----
     NO SKITTER BED DOWN HERE. THE END's librarian gets one — bandpassed
     noise under an 11Hz tremolo — and in a library it works. In the cave it
     was the sustained hiss/rattle that never ended: the matriarch's tending
     round is a patrol BETWEEN THE CLUTCHES, so it parks near a brood for
     minutes at a time and the bed just sits there at a constant level while
     you work. Its proximity is carried by the dread vignette, the
     heartbeat, and its own footfalls/scratches/sniffs — all of which are
     either silent or discrete. */
  const prox=clamp(1-d/20,0,1);
  ui.dread.style.opacity = aggressive? (0.09+prox*0.18):prox*0.135;
  if(AU.ctx&&AU.spiderBedGain)
    AU.spiderBedGain.gain.setTargetAtTime(0, AU.ctx.currentTime, 0.4);
  AU.heartTimer-=dt;
  if(prox>0.3&&AU.heartTimer<=0){ sfxHeartbeat(); AU.heartTimer=lerp(1.4,0.5,prox); }
}
/* drop it at its rounds, far from a point (the arrival / a respawn) */
export function resetSpiderCave(farFromX,farFromZ,minDist=30){
  const s=spider;
  const ctr=CAVE.chambers[1]||CAVE.chambers[0];
  let p=ctr? cellToWorld3(ctr.cx,ctr.cy) : {x:0,z:0};
  for(let t=0;t<400;t++){
    const c=randomReachCell3(), q=cellToWorld3(c.cx,c.cy);
    if(Math.hypot(q.x-farFromX,q.z-farFromZ)>minDist){ p=q; break; }
  }
  s.pos.set(p.x,0,p.z);
  s.state="tend"; s.tendTgt=null; s.nestIdx=-1; s.path=[]; s.repath=0; s.curSpeed=0;
  s.pendingT=0; s.speedMult=1; s.stacking=false; s.seekRun=false;
  s.lastKnown=null; s.target=null; s.mildCD=0; s.screechCD=0; s.stepAcc=0;
  s.sniffsLeft=0; s.scratchCD=0; s.sniffCD=0; s.stuckT=0; s.idleT=0;
  s.roomLast=null; s.roomN=0; s.roamTgt=null; s.roamT=0;
  s.glowT=0; s.glowCD=0; s.hearT=0; s.burnSeen=CAVE.lastBurn? CAVE.lastBurn.at : null;
  s.huntT=rand(8,14);
  if(s.mesh){
    s.mesh.position.set(p.x,floorYAt(p.x,p.z),p.z); s.mesh.quaternion.identity();
    const u=s.mesh.userData;
    u.abdTilt=0; u.sniffAnim=0; u.abd.rotation.x=0; u.abd.position.set(0,u.BODY_Y+0.12,u.ABD_Z);
  }
}
