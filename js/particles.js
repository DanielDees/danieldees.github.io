/* ---------------- soft particles & debris ----------------
   The cutscene dust was 210 Sprites: 210 draws, each an unlit square that
   cut a hard line wherever it met the carpet, and every one lit exactly as
   brightly as every other. This is one instanced quad for the whole pool,
   billboarded in the vertex shader, and the fragment shader does the three
   things a sprite cannot:
     · it MELTS into the floor — alpha falls off over the last `soft` metres
       above y=0, so a ground shroud reads as dust lying on the carpet
       instead of as panes stood up in it;
     · it is lit from above — a lighter crown and a darker belly on every
       puff, which is what gives a cloud of them a volume at all;
     · it is sorted back to front every frame on the CPU (a few hundred
       floats), so overlapping billows composite in the right order.
   Debris is two InstancedMeshes (clods and carpet shreds) that fly, bounce
   once and LIE WHERE THEY LAND — the dig leaves its spoil on the floor. */
import { makeCanvas } from "./textures.js";
import { rand } from "./utils.js";
import { markShared } from "./scene.js";

let ATLAS=null;
/* four puffs on one 2×2 atlas: soft lumps plus a coarse grain, because a
   smooth radial falloff is fog and dust has dirty edges */
function puffAtlas(){
  if(ATLAS) return ATLAS;
  ATLAS=makeCanvas(512,512,(g,w,h)=>{
    g.clearRect(0,0,w,h);
    for(let v=0;v<4;v++){
      const ox=(v%2)*256, oy=Math.floor(v/2)*256, c=128;
      g.save(); g.beginPath(); g.rect(ox,oy,256,256); g.clip();
      const lumps=6+v*3;
      for(let i=0;i<lumps;i++){
        const a=Math.random()*Math.PI*2, rr=Math.random()*(30+v*12);
        const x=ox+c+Math.cos(a)*rr, y=oy+c+Math.sin(a)*rr, r=40+Math.random()*(34+v*8);
        const gr=g.createRadialGradient(x,y,0,x,y,r);
        gr.addColorStop(0,"rgba(255,255,255,0.30)"); gr.addColorStop(0.55,"rgba(255,255,255,0.13)");
        gr.addColorStop(1,"rgba(255,255,255,0)");
        g.fillStyle=gr; g.beginPath(); g.arc(x,y,r,0,Math.PI*2); g.fill();
      }
      for(let i=0;i<900;i++){
        const a=Math.random()*Math.PI*2, rr=Math.pow(Math.random(),0.6)*112, fall=1-rr/112;
        g.fillStyle=`rgba(255,255,255,${(0.04+Math.random()*0.18)*fall*fall})`;
        g.fillRect(ox+c+Math.cos(a)*rr,oy+c+Math.sin(a)*rr,1+Math.random()*3,1+Math.random()*3);
      }
      g.restore();
    }
  });
  ATLAS.wrapS=ATLAS.wrapT=THREE.ClampToEdgeWrapping;
  markShared(ATLAS);                  // cached for the tab, reused by every build
  return ATLAS;
}
const VS=`
attribute vec3 iPos; attribute vec4 iPar; attribute vec3 iCol;
uniform vec3 uCamR; uniform vec3 uCamU;
varying vec2 vUv; varying vec4 vCol; varying float vWY; varying float vUp;
#include <fog_pars_vertex>
void main(){
  float c=cos(iPar.y), s=sin(iPar.y);
  vec2 q=position.xy;
  vec2 r=vec2(c*q.x-s*q.y, s*q.x+c*q.y)*iPar.x;
  vec3 wp=iPos+uCamR*r.x+uCamU*r.y;
  vWY=wp.y; vUp=q.y;
  vUv=(uv+vec2(mod(iPar.w,2.0),floor(iPar.w/2.0)))*0.5;
  vCol=vec4(iCol,iPar.z);
  vec4 mvPosition=viewMatrix*vec4(wp,1.0);
  gl_Position=projectionMatrix*mvPosition;
  #include <fog_vertex>
}`;
const FS=`
uniform sampler2D uMap; uniform float uLight; uniform float uSoft; uniform float uFloor;
varying vec2 vUv; varying vec4 vCol; varying float vWY; varying float vUp;
#include <fog_pars_fragment>
void main(){
  float a=texture2D(uMap,vUv).a;
  float soft=smoothstep(uFloor,uFloor+uSoft,vWY);
  float lit=mix(0.6,1.14,smoothstep(-0.5,0.5,vUp));
  gl_FragColor=vec4(vCol.rgb*lit*uLight,a*vCol.a*soft);
  #include <fog_fragment>
}`;
/* the pool. spawn() takes a position, a velocity, a size that grows from
   s0 to s0*grow over `life`, a peak alpha, a fade shape (>1 holds the
   plateau longer) and a tint; update() moves, ages, sorts and uploads. */
export function makeDustSystem(N=320){
  const geo=new THREE.InstancedBufferGeometry();
  geo.setAttribute("position",new THREE.Float32BufferAttribute([-0.5,-0.5,0, 0.5,-0.5,0, 0.5,0.5,0, -0.5,0.5,0],3));
  geo.setAttribute("uv",new THREE.Float32BufferAttribute([0,0,1,0,1,1,0,1],2));
  geo.setIndex([0,1,2,0,2,3]);
  const aPos=new THREE.InstancedBufferAttribute(new Float32Array(N*3),3);
  const aPar=new THREE.InstancedBufferAttribute(new Float32Array(N*4),4);
  const aCol=new THREE.InstancedBufferAttribute(new Float32Array(N*3),3);
  for(const a of[aPos,aPar,aCol]) a.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute("iPos",aPos); geo.setAttribute("iPar",aPar); geo.setAttribute("iCol",aCol);
  geo.instanceCount=0;
  const mat=new THREE.ShaderMaterial({
    uniforms:THREE.UniformsUtils.merge([THREE.UniformsLib.fog,{
      uMap:{value:null}, uCamR:{value:new THREE.Vector3(1,0,0)}, uCamU:{value:new THREE.Vector3(0,1,0)},
      uLight:{value:0.74}, uSoft:{value:0.45}, uFloor:{value:0}}]),
    vertexShader:VS, fragmentShader:FS, transparent:true, depthWrite:false, fog:true});
  mat.uniforms.uMap.value=puffAtlas();
  const mesh=new THREE.Mesh(geo,mat);
  mesh.frustumCulled=false;
  mesh.userData.animated=true;
  const P=[];
  for(let i=0;i<N;i++) P.push({life:0,max:1,x:0,y:0,z:0,vx:0,vy:0,vz:0,s0:1,grow:1,peak:0.5,fade:1,
    rot:0,rotV:0,cell:0,r:1,g:1,b:1,drag:0.42,lift:0.09,d:0});
  const col=new THREE.Color();
  const sys={mesh, env:1,
    spawn(x,y,z,vx,vy,vz,s0,grow,life,peak,fade,tint,drag=0.42,lift=0.09){
      const p=P.find(q=>q.life<=0); if(!p) return;
      Object.assign(p,{life,max:life,x,y,z,vx,vy,vz,s0,grow,peak,fade:fade||1,drag,lift,
        rot:Math.random()*6.28,rotV:rand(-0.7,0.7),cell:Math.floor(Math.random()*4)});
      col.set(tint); p.r=col.r; p.g=col.g; p.b=col.b;
    },
    alive(){ return P.some(p=>p.life>0); },
    clear(){ for(const p of P) p.life=0; geo.instanceCount=0; },
    update(dt,camera){
      const act=[];
      for(const p of P){
        if(p.life<=0) continue;
        p.life-=dt; if(p.life<=0) continue;
        const k=1-p.life/p.max, dr=Math.pow(p.drag,dt);
        p.vx*=dr; p.vz*=dr; p.vy*=Math.pow(0.55,dt);
        p.x+=p.vx*dt; p.y+=p.vy*dt+p.lift*(1-k)*dt; p.z+=p.vz*dt;
        p.rot+=p.rotV*dt;
        p.d=(p.x-camera.position.x)**2+(p.y-camera.position.y)**2+(p.z-camera.position.z)**2;
        act.push(p);
      }
      act.sort((a,b)=>b.d-a.d);
      const pa=aPos.array, pr=aPar.array, pc=aCol.array;
      act.forEach((p,i)=>{
        const k=1-p.life/p.max;
        pa[i*3]=p.x; pa[i*3+1]=p.y; pa[i*3+2]=p.z;
        pr[i*4]=p.s0*(1+(p.grow-1)*k); pr[i*4+1]=p.rot;
        pr[i*4+2]=p.peak*Math.min(1,k*5)*Math.max(0,1-Math.pow(k,2*p.fade))*sys.env;
        pr[i*4+3]=p.cell;
        pc[i*3]=p.r; pc[i*3+1]=p.g; pc[i*3+2]=p.b;
      });
      geo.instanceCount=act.length;
      aPos.needsUpdate=aPar.needsUpdate=aCol.needsUpdate=true;
      camera.updateMatrixWorld();
      const e=camera.matrixWorld.elements;
      mat.uniforms.uCamR.value.set(e[0],e[1],e[2]).normalize();
      mat.uniforms.uCamU.value.set(e[4],e[5],e[6]).normalize();
    },
  };
  return sys;
}
/* the thrown spoil: clods of earth and torn shreds of carpet. `floorAt`
   says where the ground is under a point (-Infinity over an open shaft). */
const _o=new THREE.Object3D(), _c=new THREE.Color();
function clodGeo(){
  const g=new THREE.IcosahedronGeometry(1,0);
  const p=g.attributes.position;
  /* the icosahedron's corners are duplicated per face, so the knock-about
     has to be a function of where a corner IS, or the clod opens at the seams */
  for(let i=0;i<p.count;i++){
    const x=p.getX(i), y=p.getY(i), z=p.getZ(i);
    const n=Math.sin(x*12.9898+y*78.233+z*37.719)*43758.5453, k=0.7+0.5*(n-Math.floor(n));
    p.setXYZ(i,x*k,y*k*0.8,z*k);
  }
  g.computeVertexNormals();
  return g;
}
function shredGeo(){
  const g=new THREE.PlaneGeometry(1,1,3,1);
  const p=g.attributes.position;
  for(let i=0;i<p.count;i++) p.setZ(i,Math.sin((p.getX(i)+0.5)*Math.PI)*0.18);
  g.computeVertexNormals();
  return g;
}
export function makeDebris(N,carpetTint){
  const clodMat=new THREE.MeshPhongMaterial({color:0xffffff, specular:0x0a0806, shininess:4, flatShading:true});
  const shredMat=new THREE.MeshPhongMaterial({color:carpetTint, specular:0x080a0c, shininess:3, side:THREE.DoubleSide});
  const clods=new THREE.InstancedMesh(clodGeo(),clodMat,N);
  const shreds=new THREE.InstancedMesh(shredGeo(),shredMat,Math.floor(N/2));
  for(const m of[clods,shreds]){ m.frustumCulled=false; m.userData.animated=true; }
  const CLOD_TONES=[0x5a3f24,0x42301b,0x6b5334,0x3a2a18,0x4e3a26];
  const hasColor=typeof clods.setColorAt==="function";
  const D=[];
  const mk=(mesh,i,shred)=>({mesh,i,shred,on:false,rest:false,x:0,y:-50,z:0,vx:0,vy:0,vz:0,
    rx:0,ry:0,rz:0,sx:0,sy:0,sz:0,s:1,hs:0.02,bounced:false});
  for(let i=0;i<clods.count;i++){
    D.push(mk(clods,i,false));
    if(hasColor) clods.setColorAt(i,_c.set(CLOD_TONES[i%CLOD_TONES.length]));
  }
  for(let i=0;i<shreds.count;i++) D.push(mk(shreds,i,true));
  const park=d=>{ _o.position.set(0,-60,0); _o.scale.setScalar(0.0001); _o.updateMatrix(); d.mesh.setMatrixAt(d.i,_o.matrix); };
  for(const d of D) park(d);
  const sys={clods, shreds,
    /* throw one: `shred` picks a carpet strip, otherwise a clod */
    toss(shred,x,y,z,vx,vy,vz,size){
      const d=D.find(q=>q.shred===shred&&!q.on);
      if(!d) return;
      Object.assign(d,{on:true,rest:false,bounced:false,x,y,z,vx,vy,vz,s:size,
        rx:Math.random()*6,ry:Math.random()*6,rz:Math.random()*6,
        sx:rand(-9,9),sy:rand(-7,7),sz:rand(-9,9)});
      d.hs=shred? 0.004 : size*0.7;
    },
    update(dt,floorAt){
      let dirty=false;
      for(const d of D){
        if(!d.on||d.rest) continue;
        dirty=true;
        d.vy-=(d.shred?3.4:9.5)*dt;
        if(d.shred){ const k=Math.pow(0.45,dt); d.vx*=k; d.vz*=k; d.vy=Math.max(d.vy,-1.6); }
        d.x+=d.vx*dt; d.y+=d.vy*dt; d.z+=d.vz*dt;
        d.rx+=d.sx*dt; d.ry+=d.sy*dt; d.rz+=d.sz*dt;
        const fy=floorAt(d.x,d.z);
        if(d.y-d.hs<=fy){
          if(!d.bounced&&!d.shred&&d.vy<-2.2){                  // one hop, then it stays
            d.bounced=true; d.y=fy+d.hs; d.vy*=-0.28; d.vx*=0.45; d.vz*=0.45; d.sx*=0.4; d.sy*=0.4; d.sz*=0.4;
          } else {
            d.rest=true; d.y=fy+d.hs*0.6; d.vx=d.vy=d.vz=0;
            if(d.shred){ d.rx=(Math.random()<0.5?0:Math.PI)+rand(-0.15,0.15); d.rz=rand(-0.15,0.15); }
          }
        }
        if(d.y<-6){ d.on=false; park(d); continue; }
        _o.position.set(d.x,d.y,d.z); _o.rotation.set(d.shred? Math.PI/2+d.rx : d.rx,d.ry,d.rz);
        if(d.shred) _o.scale.set(d.s*1.4,d.s,1); else _o.scale.setScalar(d.s);
        _o.updateMatrix(); d.mesh.setMatrixAt(d.i,_o.matrix);
      }
      if(dirty){ clods.instanceMatrix.needsUpdate=true; shreds.instanceMatrix.needsUpdate=true; }
    },
  };
  return sys;
}
