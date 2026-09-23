/* ---------------- silk as thread ----------------
   Every web in the level was a TEXTURE: sheets, fans and streamers of
   thread-shaped alpha on quads. That is right for the dense old sheets, but
   a spider's web is not a surface you see — it is threads you see when a
   light catches them, and a textured quad never catches the light like a
   thread does: it lights up all over, or not at all.

   These are real threads: one-pixel line segments (thin at every distance,
   the way silk is), in one draw per region, lit in their own shader the way
   a fibre is lit — Kajiya-Kay: bright where the light runs ACROSS the
   thread, a sharp glint where the half-vector does — by the lantern, whose
   position and strength are pushed in every frame, over a faint cold
   ambient. So a web is nearly nothing until you bring the flame to it, and
   then its threads flare and slide as you move. They fade out with distance,
   where a web of one-pixel lines would only alias into a grey smear.

   What is built with them (cave.js): orb webs strung across corners and
   tunnel bays, tangle webs among the stalactites, and the tents the brood
   have spun over their clutches. */
import { rand } from "./utils.js";
import { scene, markShared } from "./scene.js";

const VS=`
attribute vec3 aT; attribute float aW; attribute float aB;
varying vec3 vW; varying vec3 vT; varying float vA; varying float vB;
#include <fog_pars_vertex>
void main(){
  vec4 wp=modelMatrix*vec4(position,1.0);
  vW=wp.xyz; vT=aT; vA=aW; vB=aB;
  vec4 mvPosition=viewMatrix*wp;
  gl_Position=projectionMatrix*mvPosition;
  #include <fog_vertex>
}`;
const FS=`
uniform vec3 uLP; uniform float uLI; uniform vec3 uLC; uniform vec3 uAmb; uniform vec2 uFade;
varying vec3 vW; varying vec3 vT; varying float vA; varying float vB;
#include <fog_pars_fragment>
void main(){
  vec3 T=normalize(vT), V=normalize(cameraPosition-vW);
  vec3 Ld=uLP-vW; float d=length(Ld); vec3 L=Ld/max(d,1e-3);
  float tl=dot(T,L), diff=sqrt(max(0.0,1.0-tl*tl));
  vec3 H=normalize(L+V); float th=dot(T,H);
  float spec=pow(sqrt(max(0.0,1.0-th*th)),90.0);
  float att=uLI/(1.0+0.28*d*d);
  /* mostly GLINT: a thread is seen where the light slides along it, and
     lit evenly all over a web is a line drawing of one */
  /* the capture spiral is BEADED — glue droplets strung along it, each its
     own glint — so it sparkles in dots where the radials run smooth. Past a
     few metres a bead is under a pixel and would only shimmer: it settles
     to its average */
  float dist=length(cameraPosition-vW), bead=1.0;
  if(vB>0.5){ float n=fract(sin(dot(floor(vW*70.0),vec3(12.9898,78.233,37.719)))*43758.5453);
    bead=mix(n>0.72? 2.6 : 0.28, 0.93, smoothstep(3.0,8.0,dist)); }
  vec3 c=uAmb+uLC*att*(0.05*diff+1.9*spec*bead);
  float fade=1.0-smoothstep(uFade.x,uFade.y,dist);
  gl_FragColor=vec4(c*vA*fade,1.0);
  #include <fog_fragment>
}`;
/* one shared material: the lantern is pushed into it once a frame */
export const SILK_LINE_MAT=markShared(new THREE.ShaderMaterial({
  uniforms:THREE.UniformsUtils.merge([THREE.UniformsLib.fog,{
    uLP:{value:new THREE.Vector3()}, uLI:{value:0}, uLC:{value:new THREE.Color(1.0,0.78,0.52)},
    uAmb:{value:new THREE.Color(0.030,0.040,0.046)}, uFade:{value:new THREE.Vector2(13,30)}}]),
  vertexShader:VS, fragmentShader:FS, fog:true, transparent:true, depthWrite:false,
  blending:THREE.AdditiveBlending}));

/* collects segments by region, then builds one LineSegments per region */
export class SilkLines{
  constructor(region=48){ this.region=region; this.b=new Map(); }
  seg(a,b,w=1,bead=0){
    const k=Math.floor((a[0]+b[0])*0.5/this.region)+","+Math.floor((a[2]+b[2])*0.5/this.region);
    let r=this.b.get(k); if(!r) this.b.set(k,r={p:[],t:[],w:[],bd:[]});
    const tx=b[0]-a[0], ty=b[1]-a[1], tz=b[2]-a[2];
    r.p.push(a[0],a[1],a[2],b[0],b[1],b[2]); r.t.push(tx,ty,tz,tx,ty,tz); r.w.push(w,w); r.bd.push(bead,bead);
  }
  /* a line that sags between two points (a catenary, near enough) */
  sag(a,b,drop,n=5,w=1,bead=0){
    let prev=a;
    for(let i=1;i<=n;i++){ const t=i/n, s=4*t*(1-t)*drop;
      const p=[a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t-s, a[2]+(b[2]-a[2])*t];
      this.seg(prev,p,w,bead); prev=p; }
  }
  build(){
    const out=[];
    for(const r of this.b.values()){
      const g=new THREE.BufferGeometry();
      g.setAttribute("position",new THREE.Float32BufferAttribute(r.p,3));
      g.setAttribute("aT",new THREE.Float32BufferAttribute(r.t,3));
      g.setAttribute("aW",new THREE.Float32BufferAttribute(r.w,1));
      g.setAttribute("aB",new THREE.Float32BufferAttribute(r.bd,1));
      g.computeBoundingSphere();
      const m=new THREE.LineSegments(g,SILK_LINE_MAT); m.renderOrder=1;
      scene.add(m); out.push(m);
    }
    return out;
  }
}
/* an ORB WEB: `c` its hub, `u`/`v` unit vectors spanning its plane, `rad`
   its size, `frame` optional anchor points (else a ragged polygon). Radials
   run hub to frame, the capture spiral winds in from the frame sagging
   between them, the hub is a dense little mesh, and some of it is broken. */
export function orbWeb(L,c,u,v,rad,o={}){
  const n=o.radials||(16+Math.floor(Math.random()*11));
  /* it BILLOWS: a web is never a flat plate, the draught bellies it out */
  const nx=u[1]*v[2]-u[2]*v[1], ny=u[2]*v[0]-u[0]*v[2], nz=u[0]*v[1]-u[1]*v[0];
  const bil=rad*rand(0.06,0.16)*(Math.random()<0.5? -1:1), bph=Math.random()*7;
  const P=(r,a)=>{ const q=Math.min(1,r/rad), d=bil*(1-q*q)*(0.65+0.35*Math.sin(a*2+bph));
    return [c[0]+(u[0]*Math.cos(a)+v[0]*Math.sin(a))*r+nx*d, c[1]+(u[1]*Math.cos(a)+v[1]*Math.sin(a))*r+ny*d,
            c[2]+(u[2]*Math.cos(a)+v[2]*Math.sin(a))*r+nz*d]; };
  const ang=[], len=[];
  /* lopsided like the real thing: the hub sits high, the capture area hangs below */
  for(let i=0;i<n;i++){ const a=(i+rand(-0.3,0.3))/n*Math.PI*2; ang.push(a); len.push(rad*rand(0.8,1.12)*(1-0.22*Math.sin(a))); }
  const frame=ang.map((a,i)=>P(len[i],a));
  const W=(o.w||1)*0.7;
  for(let i=0;i<n;i++){                          // the frame, and the radials
    L.seg(frame[i],frame[(i+1)%n],W*rand(0.7,1.2));
    if(Math.random()>0.06) L.seg(P(rad*0.05,ang[i]),frame[i],W*rand(0.5,1));
  }
  const gap=rand(0.018,0.03)*Math.max(1,rad/0.8), broken=Math.random()*Math.PI*2;
  for(let r=rad*1.05;r>rad*0.18;r-=gap){         // the capture spiral, sagging between radials
    const wob=rand(0.97,1.03);
    for(let i=0;i<n;i++){
      const a0=ang[i], a1=ang[(i+1)%n]+(i===n-1? Math.PI*2:0);
      const s0=1-0.22*Math.sin(a0), s1=1-0.22*Math.sin(a1);   // the spiral follows the lopsided frame
      const rr0=Math.min(r*s0*wob,len[i]*0.96), rr1=Math.min((r-gap/n)*s1*wob,len[(i+1)%n]*0.96);
      const mid=(a0+a1)/2;
      if(Math.abs(Math.atan2(Math.sin(mid-broken),Math.cos(mid-broken)))<0.5&&r<rad*0.7&&Math.random()<0.85) continue;
      if(Math.random()<0.04) continue;
      const p0=P(rr0,a0), p1=P(rr1,a1);
      L.sag(p0,p1,rr0*0.02+0.005,2,W*0.8*rand(0.35,1),1);
    }
  }
  for(let r=rad*0.05;r<rad*0.14;r+=rad*0.025)     // the hub
    for(let i=0;i<n;i++) L.seg(P(r,ang[i]),P(r,ang[(i+1)%n]),W*0.9);
  if(o.anchors) o.anchors.forEach((p,i)=>L.seg(frame[Math.floor(i*n/o.anchors.length)],p,W*1.2));
}
/* a TANGLE — a cobweb: many SHORT threads, each from a point to one of its
   nearest neighbours, plus loose ends hanging off them. Threads strung
   between any two points of the set came out as big line-drawn triangles. */
export function tangleWeb(L,pts,count,w=1){
  if(pts.length<2) return;
  const near=pts.map(a=>pts.filter(b=>b!==a).sort((p,q)=>
    Math.hypot(p[0]-a[0],p[1]-a[1],p[2]-a[2])-Math.hypot(q[0]-a[0],q[1]-a[1],q[2]-a[2])).slice(0,4));
  for(let i=0;i<count;i++){
    const k=Math.floor(Math.random()*pts.length), a=pts[k], b=near[k][Math.floor(Math.random()*near[k].length)];
    const t=Math.random()*0.4, s=0.6+Math.random()*0.4;          // not always end to end
    const p=[a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t];
    const q=[a[0]+(b[0]-a[0])*s, a[1]+(b[1]-a[1])*s, a[2]+(b[2]-a[2])*s];
    const d=Math.hypot(q[0]-p[0],q[1]-p[1],q[2]-p[2]);
    L.sag(p,q,d*rand(0.03,0.1),Math.max(2,Math.round(d/0.3)),w*0.7*rand(0.4,1));
    if(Math.random()<0.3){ const e=[q[0]+rand(-0.1,0.1),q[1]-rand(0.1,0.45),q[2]+rand(-0.1,0.1)]; L.seg(q,e,w*0.5); }
  }
}
/* scatter the points a tangle is strung between through a volume */
export function cloudPts(c,sx,sy,sz,n){
  const out=[]; for(let i=0;i<n;i++) out.push([c[0]+rand(-sx,sx),c[1]+rand(-sy,sy),c[2]+rand(-sz,sz)]);
  return out;
}
