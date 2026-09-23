/* ---------------- THE NEST's clutches: what you came down here to burn ----------------
   It was a squashed grey sphere wearing the cocoon's wound bands — which on
   a mound that flat stacked into WICKER, so each brood sat in a basket — with
   fifteen glossy blue marbles on top and seven crossed cards for a fire.

   A clutch is now:
     · a mass of FELTED silk, fibre laid every way (felt, not winding: bands
       are what made the basket), lumpy where eggs sit under it;
     · a pile of eggs that actually stacks (each one comes to rest on the
       mound or on the eggs already there), instanced — one draw — and lit
       from INSIDE: the glow is strongest through the middle of each sac and
       a thin membrane sheen rides the rim, the veins and the curled shadow of
       the thing in there darken it;
     · a veil of fresh silk thrown over the pile, and guy lines staking it
       to the floor;
     · a fire of hundreds of licking flame particles, embers climbing out of
       it and smoke rolling off the top — and afterwards the eggs charred
       black with their veins still glowing orange for a while, shrunk into
       the mound, and a scorch on the floor round it. */
import { rand, clamp, hash } from "./utils.js";
import { scene, markShared, mergeStatic, concatGeos } from "./scene.js";
import { makeCanvas } from "./textures.js";
import { makeFlameSystem, makeMoteSystem, makeDustSystem } from "./particles.js";
import { normalFromHeight } from "./cavemats.js";

/* ---- skins, built once for the tab ---- */
let SK=null;
function skins(){
  if(SK) return SK;
  /* felted silk: thousands of short fibres at every angle over a soft
     mottle, drawn wrapped so it tiles */
  const felt=makeCanvas(512,512,(g,w,h)=>{
    g.fillStyle="#a3a8aa"; g.fillRect(0,0,w,h);
    const wrap=fn=>{ for(const ox of[0,-w,w]) for(const oy of[0,-h,h]) fn(ox,oy); };
    for(let i=0;i<40;i++){
      const x=Math.random()*w, y=Math.random()*h, r=30+Math.random()*90, lite=Math.random()<0.5;
      wrap((ox,oy)=>{ const gr=g.createRadialGradient(x+ox,y+oy,2,x+ox,y+oy,r);
        gr.addColorStop(0,lite?`rgba(170,176,176,${0.12+Math.random()*0.12})`:`rgba(40,44,44,${0.14+Math.random()*0.12})`);
        gr.addColorStop(1,"rgba(0,0,0,0)"); g.fillStyle=gr; g.beginPath(); g.arc(x+ox,y+oy,r,0,7); g.fill(); });
    }
    g.lineCap="round";
    for(let i=0;i<5200;i++){
      const x=Math.random()*w, y=Math.random()*h, a=Math.random()*Math.PI, L=6+Math.random()*34;
      const lite=Math.random()<0.62, al=0.05+Math.random()*0.16;
      const bend=(Math.random()-0.5)*L*0.4;
      wrap((ox,oy)=>{
        if(x+ox<-40||x+ox>w+40||y+oy<-40||y+oy>h+40) return;
        g.strokeStyle=lite?`rgba(222,228,228,${al})`:`rgba(38,42,42,${al*0.9})`;
        g.lineWidth=0.5+Math.random()*1.1;
        g.beginPath(); g.moveTo(x+ox,y+oy);
        g.quadraticCurveTo(x+ox+Math.cos(a)*L/2-Math.sin(a)*bend, y+oy+Math.sin(a)*L/2+Math.cos(a)*bend,
          x+ox+Math.cos(a)*L, y+oy+Math.sin(a)*L);
        g.stroke(); });
    }
    /* what reads from a few metres: FOLDS where the matted sheet has
       creased (a dark crease with its lit ridge beside it) and POCKETS
       pulled into the mass — the fibre alone averages out to a smooth loaf */
    for(let i=0;i<46;i++){
      const x=Math.random()*w, y=Math.random()*h, a=Math.random()*Math.PI, L=50+Math.random()*150, bend=(Math.random()-0.5)*L*0.6;
      const cx=x+Math.cos(a)*L/2-Math.sin(a)*bend, cy=y+Math.sin(a)*L/2+Math.cos(a)*bend, ex=x+Math.cos(a)*L, ey=y+Math.sin(a)*L;
      const nx=-Math.sin(a)*2.2, ny=Math.cos(a)*2.2, al=0.14+Math.random()*0.16, lw=1.4+Math.random()*2.2;
      wrap((ox,oy)=>{
        g.lineWidth=lw;
        g.strokeStyle=`rgba(236,240,240,${al*0.8})`; g.beginPath(); g.moveTo(x+ox+nx,y+oy+ny);
        g.quadraticCurveTo(cx+ox+nx,cy+oy+ny,ex+ox+nx,ey+oy+ny); g.stroke();
        g.strokeStyle=`rgba(30,32,32,${al})`; g.beginPath(); g.moveTo(x+ox,y+oy);
        g.quadraticCurveTo(cx+ox,cy+oy,ex+ox,ey+oy); g.stroke(); });
    }
    for(let i=0;i<22;i++){
      const x=Math.random()*w, y=Math.random()*h, r=5+Math.random()*14;
      wrap((ox,oy)=>{
        const gr=g.createRadialGradient(x+ox,y+oy-r*0.2,0,x+ox,y+oy,r*1.5);
        gr.addColorStop(0,"rgba(18,20,20,0.55)"); gr.addColorStop(0.55,"rgba(30,32,32,0.25)");
        gr.addColorStop(0.8,"rgba(230,234,234,0.18)"); gr.addColorStop(1,"rgba(230,234,234,0)");
        g.fillStyle=gr; g.beginPath(); g.arc(x+ox,y+oy,r*1.5,0,7); g.fill(); });
    }
    for(let i=0;i<260;i++){              // grit and husk flakes caught in it
      g.fillStyle=`rgba(${60+Math.random()*40|0},${54+Math.random()*34|0},${44+Math.random()*28|0},${0.15+Math.random()*0.25})`;
      g.fillRect(Math.random()*w,Math.random()*h,1+Math.random()*2.5,1+Math.random()*2);
    }
  });
  felt.wrapS=felt.wrapT=THREE.RepeatWrapping; felt.anisotropy=4;
  const feltN=normalFromHeight(felt,512,0.8,0.007);
  /* the egg: R the membrane's brightness, G its veins, B the curled shadow
     of what is inside — read as data by the egg shader, not as colour */
  const egg=makeCanvas(256,256,(g,w,h)=>{
    g.fillStyle="rgb(210,0,0)"; g.fillRect(0,0,w,h);
    for(let i=0;i<30;i++){                   // membrane mottle (R)
      const x=Math.random()*w, y=Math.random()*h, r=10+Math.random()*40;
      const gr=g.createRadialGradient(x,y,1,x,y,r);
      gr.addColorStop(0,Math.random()<0.5?"rgba(255,0,0,0.25)":"rgba(150,0,0,0.25)"); gr.addColorStop(1,"rgba(0,0,0,0)");
      g.fillStyle=gr; g.fillRect(x-r,y-r,r*2,r*2);
    }
    g.globalCompositeOperation="lighter";
    const vein=(x,y,a,L,wd,depth)=>{        // a branching vein network (G)
      let cx=x, cy=y;
      for(let s=0;s<L;s++){
        const nx=cx+Math.cos(a)*6, ny=cy+Math.sin(a)*6;
        g.strokeStyle=`rgba(0,${120+Math.random()*80|0},0,1)`; g.lineWidth=wd;
        for(const ox of[0,-w,w]){ g.beginPath(); g.moveTo(cx+ox,cy); g.lineTo(nx+ox,ny); g.stroke(); }
        cx=nx; cy=ny; a+=(Math.random()-0.5)*0.7; wd*=0.94;
        if(depth<3&&Math.random()<0.16) vein(cx,cy,a+(Math.random()<0.5?-0.9:0.9),L*0.5|0,wd*0.7,depth+1);
      }
    };
    for(let i=0;i<7;i++) vein(Math.random()*w, h*(0.1+Math.random()*0.8), Math.random()*7, 18, 2.2, 0);
    /* the embryo (B): a curled body with the ghost of legs folded round it */
    const ex=w*0.5, ey=h*0.55;
    g.strokeStyle="rgba(0,0,255,0.9)"; g.lineCap="round";
    g.lineWidth=26; g.beginPath(); g.arc(ex,ey,30,0.4,3.9); g.stroke();
    g.fillStyle="rgba(0,0,255,0.9)"; g.beginPath(); g.ellipse(ex-24,ey-18,22,18,0.4,0,7); g.fill();
    g.lineWidth=5;
    for(let k=0;k<8;k++){ const a=0.6+k*0.42; g.beginPath();
      g.moveTo(ex+Math.cos(a)*30,ey+Math.sin(a)*30); g.quadraticCurveTo(ex+Math.cos(a)*58,ey+Math.sin(a)*52,ex+Math.cos(a+0.5)*50,ey+Math.sin(a+0.5)*44); g.stroke(); }
    g.globalCompositeOperation="source-over";
  });
  egg.wrapS=THREE.RepeatWrapping; egg.wrapT=THREE.ClampToEdgeWrapping;
  /* the egg: longer than wide, a little pointed at one end, never quite round */
  const eggGeo=new THREE.SphereGeometry(1,20,14);
  { const p=eggGeo.attributes.position;
    for(let i=0;i<p.count;i++){
      const x=p.getX(i), y=p.getY(i), z=p.getZ(i);
      const k=1+0.05*Math.sin(x*3.1+z*2.3)+0.035*Math.sin(y*4.7+x*1.9);
      p.setXYZ(i,x*k*(1-0.10*y),y*1.26,z*k*(1-0.10*y));
    }
    eggGeo.computeVertexNormals(); }
  /* a spent sac: the egg with its top fallen in and crumpled — faceted,
     because a smooth-shaded crumple is a pebble */
  const huskGeo=new THREE.SphereGeometry(1,12,9).toNonIndexed();
  { const p=huskGeo.attributes.position, key=new Map();
    for(let i=0;i<p.count;i++){
      const x=p.getX(i), y=p.getY(i), z=p.getZ(i), id=`${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
      let v=key.get(id);
      if(!v){ const a=Math.atan2(z,x), k=1+0.16*Math.sin(a*5+y*7)+0.1*Math.sin(a*3-y*11)+(Math.random()-0.5)*0.18;
        const yy=y>0? y*0.18-0.08*Math.abs(Math.sin(a*4)) : y*0.55;
        v=[x*k*1.05,yy*1.26,z*k*1.05]; key.set(id,v); }
      p.setXYZ(i,v[0],v[1],v[2]);
    }
    huskGeo.computeVertexNormals(); }
  /* a layer of LOOSE silk to drape over the mass and spread round it:
     threads every way, drifting into denser mats, and nothing else — alpha
     is thread-shaped, and it tiles (drawn wrapped) */
  const layer=makeCanvas(512,512,(g,w,h)=>{
    g.clearRect(0,0,w,h); g.lineCap="round";
    const wrap=fn=>{ for(const ox of[0,-w,w]) for(const oy of[0,-h,h]) fn(ox,oy); };
    const thread=(x,y,a,L,al,lw)=>{ const bend=(Math.random()-0.5)*L*0.5;
      wrap((ox,oy)=>{ if(x+ox<-90||x+ox>w+90||y+oy<-90||y+oy>h+90) return;
        g.strokeStyle=`rgba(232,236,238,${al})`; g.lineWidth=lw; g.beginPath(); g.moveTo(x+ox,y+oy);
        g.quadraticCurveTo(x+ox+Math.cos(a)*L/2-Math.sin(a)*bend,y+oy+Math.sin(a)*L/2+Math.cos(a)*bend,
          x+ox+Math.cos(a)*L,y+oy+Math.sin(a)*L); g.stroke(); }); };
    for(let i=0;i<1400;i++) thread(Math.random()*w,Math.random()*h,Math.random()*Math.PI,20+Math.random()*80,0.05+Math.random()*0.16,0.5+Math.random()*0.8);
    for(let m=0;m<7;m++){                    // drifts where the silk has matted
      const cx=Math.random()*w, cy=Math.random()*h, R=30+Math.random()*60;
      for(let i=0;i<220;i++){ const a=Math.random()*7, rr=Math.pow(Math.random(),0.7)*R;
        thread(cx+Math.cos(a)*rr,cy+Math.sin(a)*rr,Math.random()*Math.PI,6+Math.random()*22,0.08+Math.random()*0.2,0.5+Math.random()*0.6); }
    }
    for(let i=0;i<160;i++){ g.fillStyle=`rgba(${120+Math.random()*60|0},${116+Math.random()*50|0},${104+Math.random()*40|0},${0.25+Math.random()*0.35})`;
      g.beginPath(); g.arc(Math.random()*w,Math.random()*h,0.6+Math.random()*1.6,0,7); g.fill(); }
  });
  layer.wrapS=layer.wrapT=THREE.RepeatWrapping; layer.anisotropy=4;
  SK={felt,feltN,egg,eggGeo,huskGeo,layer};
  markShared(felt,feltN,egg,eggGeo,huskGeo,layer);
  return SK;
}

/* the loose silk, for the nest floors round the clutch */
export const silkLayerTex=()=>skins().layer;

/* the egg shader: three's Phong plus a light INSIDE the sac. The glow is a
   uniform the level drives (it breathes, then burns, then embers out) */
function eggCompile(sh){
  const U=this.userData.U;
  Object.assign(sh.uniforms,U);
  sh.fragmentShader=sh.fragmentShader
    .replace("#include <common>",`#include <common>
uniform vec3 uGlow; uniform float uChar; uniform float uEmber;`)
    .replace("#include <map_fragment>",`vec4 eggT=texture2D(map,vUv);
  diffuseColor.rgb*=mix(0.72,1.05,eggT.r)*(1.0-0.38*eggT.g)*(1.0-0.3*eggT.b);`)
    .replace("#include <emissivemap_fragment>",`#include <emissivemap_fragment>
  {
    vec3 V=normalize(vViewPosition); float nv=clamp(dot(normal,V),0.0,1.0);
    float inner=(0.25+0.75*pow(nv,1.4))*(1.0-0.62*eggT.b)*(1.0-0.35*eggT.g);
    totalEmissiveRadiance+=uGlow*inner*(1.0-uChar);
    totalEmissiveRadiance+=uGlow*0.55*pow(1.0-nv,3.0)*(1.0-uChar);   // the membrane rim
    diffuseColor.rgb=mix(diffuseColor.rgb,vec3(0.035,0.03,0.028)*(0.7+0.6*eggT.r),uChar);
    specularStrength*=1.0-0.8*uChar;
    totalEmissiveRadiance+=vec3(1.0,0.34,0.07)*uEmber*(eggT.g*1.4+0.12)*(0.6+0.4*nv);
  }`);
}
function eggMaterial(tex){
  const m=new THREE.MeshPhongMaterial({map:tex, color:0x6f8a94, specular:0x587884, shininess:88});
  m.userData.U={uGlow:{value:new THREE.Color(0x0e3848)}, uChar:{value:0}, uEmber:{value:0}};
  m.onBeforeCompile=eggCompile;
  return m;
}

/* ---- the fire: shared by every clutch, three draws for the whole level ---- */
let FIRE=null;
export function initClutchFire(){
  FIRE={flames:makeFlameSystem(300), embers:makeMoteSystem(220), smoke:makeDustSystem(120)};
  FIRE.smoke.mesh.material.uniforms.uLight.value=0.55;
  for(const k in FIRE) scene.add(FIRE[k].mesh);
}
const _o=new THREE.Object3D();
/* env: {halo, strandMat, strandMesh, floorAt} from cave.js */
export function makeClutch(env,x,z){
  const S=skins();
  const g=new THREE.Group();
  /* the silk mass is a HEAP, poured and piled: a height field lobed round
     its foot, clumped, pressed up where eggs sit under it, whose edge runs
     out UNDER the floor. It was a sphere squashed onto the floor, and a
     sphere's equator stands proud of the ground as a rim — a loaf on a plate. */
  const R=1.65, HM=0.72, sd=Math.random()*9, bumps=[];
  for(let i=0;i<10;i++){ const a=Math.random()*7, r=rand(0.1,0.8)*R; bumps.push([Math.cos(a)*r,Math.sin(a)*r,rand(0.2,0.4)]); }
  const foot=a=>R*(1+0.14*Math.sin(a*2+sd)+0.08*Math.sin(a*3-sd*1.7)+0.05*Math.sin(a*5+sd*0.6));
  const qAt=(px,pz)=>Math.hypot(px,pz)/foot(Math.atan2(pz,px));
  const moundTop=(px,pz)=>{
    const q=qAt(px,pz);
    let hh=HM*Math.pow(Math.max(0,1-q*q),0.8);
    hh*=1+0.14*Math.sin(px*4.1+sd)*Math.sin(pz*3.7-sd)+0.07*Math.sin(px*7.3-pz*6.1+sd*2);
    for(const[bx,bz,br]of bumps){ const d=Math.hypot(px-bx,pz-bz)/br; hh+=br*0.3*Math.exp(-d*d)*Math.max(0,1-q); }
    return hh-0.07;
  };
  const NA=64, NR=16;
  const polar=(fn)=>{                      // a polar grid over the heap's footprint
    const pos=[], uv=[], col=[], idx=[];
    for(let j=0;j<=NR;j++)for(let i=0;i<=NA;i++){
      const a=i/NA*Math.PI*2, rr=foot(a)*1.08*Math.pow(j/NR,0.85);
      fn(Math.cos(a)*rr,Math.sin(a)*rr,pos,uv,col);
    }
    for(let j=0;j<NR;j++)for(let i=0;i<NA;i++){ const q=j*(NA+1)+i, r=q+NA+1; idx.push(q,q+1,r, r,q+1,r+1); }   // wound to face UP
    const geo=new THREE.BufferGeometry();
    geo.setAttribute("position",new THREE.Float32BufferAttribute(pos,3));
    geo.setAttribute("uv",new THREE.Float32BufferAttribute(uv,2));
    if(col.length) geo.setAttribute("color",new THREE.Float32BufferAttribute(col,3));
    geo.setIndex(idx); geo.computeVertexNormals();
    return geo;
  };
  /* dirty at the foot where it drags on the silt, clean where it is fresh */
  const moundGeo=polar((px,pz,pos,uv,col)=>{
    const hh=moundTop(px,pz), fresh=clamp(hh/0.16,0,1);
    const m=0.9+0.1*Math.sin(px*5.3+sd*3)*Math.sin(pz*4.7-sd);
    pos.push(px,hh,pz); uv.push(px/0.8,pz/0.8);
    col.push((0.62+0.38*fresh)*m,(0.59+0.41*fresh)*m,(0.54+0.46*fresh)*m);
  });
  /* matte: silk in a mass has no glaze — a broad highlight made it a loaf */
  const feltMat=new THREE.MeshPhongMaterial({map:S.felt, normalMap:S.feltN, color:0x9fa4a6,
    specular:0x1a1e20, shininess:8, emissive:0x000000, vertexColors:true});
  const mound=new THREE.Mesh(moundGeo,feltMat);
  g.add(mound);
  /* and over it, loose silk in depth: shells of thread lifted off the heap,
     each turned so the threads never line up, closing back onto the heap at
     its foot so no shell edge floats over the floor. Inner to outer in one
     buffer: from outside, that IS back to front. */
  const layerMat=new THREE.MeshPhongMaterial({map:S.layer, transparent:true, depthWrite:false,
    side:THREE.DoubleSide, color:0xeef1f2, emissive:0x1a1d1f, specular:0x7a8288, shininess:34});
  /* the shells want their threads at full strength: the loose layer's alpha
     is set to lie flat over the floor, and over the pale heap it disappears */
  const fuzzMat=layerMat.clone();
  fuzzMat.color.setHex(0xd4d8da); fuzzMat.emissive.setHex(0x0a0b0c);
  fuzzMat.onBeforeCompile=sh=>{ sh.fragmentShader=sh.fragmentShader.replace("#include <map_fragment>",
    "#include <map_fragment>\n  diffuseColor.a=min(1.0,diffuseColor.a*1.9);"); };
  {
    const nrm=moundGeo.attributes.normal, P0=moundGeo.attributes.position, NS=6, parts=[];
    for(let s2=1;s2<=NS;s2++){
      const rot=s2*1.37+sd, cs=Math.cos(rot), sn=Math.sin(rot), off=0.032*s2;
      let vi=0;
      parts.push(polar((px,pz,pos,uv,col)=>{
        /* each sheet billows on its own, never parallel to the one under it */
        const bil=0.45+0.55*(Math.sin(px*3.3+pz*2.1+s2*1.7+sd)*Math.sin(pz*2.7-px*1.9+s2*2.3)+1);
        const q=qAt(px,pz), lift=off*bil*clamp((1.02-q)/0.3,0,1);
        pos.push(P0.getX(vi)+nrm.getX(vi)*lift, P0.getY(vi)+nrm.getY(vi)*lift, P0.getZ(vi)+nrm.getZ(vi)*lift);
        uv.push((px*cs-pz*sn)/1.1+s2*0.31,(px*sn+pz*cs)/1.1+s2*0.17); vi++;
      }));
    }
    const fz=new THREE.Mesh(concatGeos(parts),fuzzMat);
    for(const p2 of parts) p2.dispose();
    g.add(fz);
  }
  {
    const NA=44, NR=6, pos=[], uv=[], idx=[], sd=Math.random()*9;
    for(let i=0;i<=NA;i++){
      const a=i/NA*Math.PI*2, out=rand(2.1,2.8)*(1+0.18*Math.sin(a*3+sd)+0.1*Math.sin(a*7-sd));
      for(let j=0;j<=NR;j++){
        const rr=1.1+(out-1.1)*j/NR, px=Math.cos(a)*rr, pz=Math.sin(a)*rr;
        pos.push(px,0.025+0.03*Math.sin(px*3.1+pz*2.3)*(1-j/NR),pz); uv.push(px/1.3,pz/1.3);
      }
    }
    for(let i=0;i<NA;i++)for(let j=0;j<NR;j++){ const q=i*(NR+1)+j, r=q+NR+1; idx.push(q,r,q+1, r,r+1,q+1); }
    const ag=new THREE.BufferGeometry();
    ag.setAttribute("position",new THREE.Float32BufferAttribute(pos,3));
    ag.setAttribute("uv",new THREE.Float32BufferAttribute(uv,2));
    ag.setIndex(idx); ag.computeVertexNormals();
    const apron=new THREE.Mesh(ag,layerMat); apron.renderOrder=-1; g.add(apron);
  }
  /* the husks of the last brood: sacs gone slack and papery, sunk into
     the silk round the foot of the heap */
  const huskMat=new THREE.MeshPhongMaterial({map:S.felt, color:0x8c8a84, specular:0x1a1a18, shininess:10,
    flatShading:true, side:THREE.DoubleSide});
  {
    const nh=6+Math.floor(Math.random()*5), hk=new THREE.InstancedMesh(S.huskGeo,huskMat,nh);
    for(let i=0;i<nh;i++){
      const a=Math.random()*Math.PI*2, rr=foot(a)*rand(0.7,1.25), r=rand(0.12,0.2);
      const hx=Math.cos(a)*rr, hz=Math.sin(a)*rr;
      _o.position.set(hx,Math.max(0,moundTop(hx,hz))+r*0.3,hz);
      _o.rotation.set(rand(-0.35,0.35),Math.random()*6,rand(-0.35,0.35));
      _o.scale.set(r*rand(0.9,1.1),r*rand(0.8,1.0),r*rand(0.8,1.0)); _o.updateMatrix();
      hk.setMatrixAt(i,_o.matrix);
    }
    hk.instanceMatrix.needsUpdate=true; hk.frustumCulled=false;
    g.add(hk);
  }
  /* the eggs: each comes to rest on the mound or on the eggs under it */
  const eggMat=eggMaterial(S.egg);
  /* a clutch is laid in a low heap, not a tower: each egg tries a few spots
     and settles where it comes to rest lowest */
  const n=18+Math.floor(Math.random()*8), eggs=[];
  const rest=(ex,ez,r)=>{
    let y=moundTop(ex,ez)+r*0.55;
    for(const e of eggs){
      const d=Math.hypot(e.x-ex,e.z-ez), s=(e.r+r)*0.92;
      if(d<s) y=Math.max(y, e.y+Math.sqrt(s*s-d*d)*0.9);
    }
    return y;
  };
  for(let i=0;i<n;i++){
    const r=rand(0.13,0.25);
    let best=null;
    for(let t=0;t<7;t++){
      const a=Math.random()*Math.PI*2, rr=Math.pow(Math.random(),0.8)*1.05;
      const ex=Math.cos(a)*rr, ez=Math.sin(a)*rr, y=rest(ex,ez,r);
      if(!best||y-rr*0.12<best.y-best.rr*0.12) best={ex,ez,y,rr};
    }
    eggs.push({x:best.ex,y:best.y,z:best.ez,r,y0:best.y,rx:rand(-0.5,0.5),ry:Math.random()*6,rz:rand(-0.5,0.5),tone:rand(0.82,1.1)});
  }
  const inst=new THREE.InstancedMesh(S.eggGeo,eggMat,eggs.length);
  const col=new THREE.Color();
  eggs.forEach((e,i)=>{
    _o.position.set(e.x,e.y,e.z); _o.rotation.set(e.rx,e.ry,e.rz); _o.scale.setScalar(e.r); _o.updateMatrix();
    inst.setMatrixAt(i,_o.matrix);
    if(inst.setColorAt) inst.setColorAt(i,col.setScalar(e.tone));
  });
  inst.instanceMatrix.needsUpdate=true;
  if(inst.instanceColor) inst.instanceColor.needsUpdate=true;
  inst.frustumCulled=false;
  g.add(inst);
  /* fresh silk lashed OVER the pile, mound edge to mound edge, each line
     riding the tops of the eggs it crosses; and guy lines staking it down.
     (A dome of sheet silk over the heap read as a wire cage.) */
  const top=Math.max(...eggs.map(e=>e.y+e.r*1.26));
  const lines=[];
  const surf=(px,pz)=>{ let y=moundTop(px,pz);
    for(const e of eggs){ const d=Math.hypot(e.x-px,e.z-pz); if(d<e.r) y=Math.max(y,e.y+Math.sqrt(e.r*e.r-d*d)*1.22); }
    return y+0.015; };
  for(let i=0;i<13;i++){
    const a=Math.random()*Math.PI*2, b2=a+Math.PI+rand(-0.7,0.7), r0=rand(0.9,1.25), r1=rand(0.9,1.25);
    const ax=Math.cos(a)*r0, az=Math.sin(a)*r0, bx=Math.cos(b2)*r1, bz=Math.sin(b2)*r1;
    const N=10; let prev=null;
    for(let k=0;k<=N;k++){
      const t=k/N, px=ax+(bx-ax)*t, pz=az+(bz-az)*t, py=surf(px,pz);
      if(prev) lines.push(env.strandMesh(prev[0],prev[1],prev[2],px,py,pz,rand(0.025,0.045)));
      prev=[px,py,pz];
    }
  }
  for(let i=0;i<9;i++){
    const a=i/9*Math.PI*2+rand(-0.25,0.25), r0=rand(0.9,1.3), r1=rand(2.0,3.4);
    const x0=Math.cos(a)*r0, z0=Math.sin(a)*r0, x1=Math.cos(a+rand(-0.2,0.2))*r1, z1=Math.sin(a+rand(-0.2,0.2))*r1;
    lines.push(env.strandMesh(x0,moundTop(x0,z0)*rand(0.6,0.95),z0, x1,env.floorAt(x+x1,z+z1)+0.02,z1, rand(0.03,0.05)));
  }
  g.add(mergeStatic(lines,env.strandMat));
  /* what the brood were fed: small bundles bound into the edge of the mass */
  {
    const bundles=[];
    for(let i=0;i<3+Math.floor(Math.random()*3);i++){
      const a=Math.random()*Math.PI*2, rr=rand(1.25,1.7), r=rand(0.08,0.14), len=r*rand(3.2,4.5);
      const m=new THREE.Mesh(cocoonGeo(r,len));
      m.position.set(Math.cos(a)*rr, r*0.8, Math.sin(a)*rr);
      m.rotation.set(rand(-0.3,0.3), Math.random()*6, Math.PI/2+rand(-0.4,0.4));
      bundles.push(m);
    }
    addCocoons(g,bundles);
  }
  /* the egg-light pooled on the floor */
  const haloMat=new THREE.MeshBasicMaterial({map:env.halo, color:0x3f93ac,
    transparent:true, opacity:0.2, blending:THREE.AdditiveBlending, depthWrite:false});
  const halo=new THREE.Mesh(new THREE.PlaneGeometry(4.8,4.8),haloMat);
  halo.rotation.x=-Math.PI/2; halo.position.y=0.07; g.add(halo);
  /* the scorch a burn leaves, laid now and invisible */
  const scorchMat=new THREE.MeshBasicMaterial({map:env.halo, color:0x000000, transparent:true,
    opacity:0, depthWrite:false});
  const scorch=new THREE.Mesh(new THREE.PlaneGeometry(5.2,5.2),scorchMat);
  scorch.rotation.x=-Math.PI/2; scorch.position.y=0.05; scorch.renderOrder=-1; g.add(scorch);
  g.userData={eggMat, feltMat, layerMat, fuzzMat, huskMat, inst, eggs, haloMat, scorchMat, top, surf};
  return g;
}

/* per frame, per brood: the breathing, the burn, the embers going out.
   `b.burnT` is the clock (cave.js advances it); a respawn keeps it. */
export function updateClutch(b,i,dt,tN,camera){
  const u=b.clutch.userData, U=u.eggMat.userData.U, hm=u.haloMat;
  const wx=b.center.x, wz=b.center.z;
  if(!b.burned){
    const k=0.7+0.3*Math.sin(tN*0.9+i*1.7);
    U.uGlow.value.setRGB(0.12*k,0.40*k,0.52*k);
    if(hm) hm.opacity=0.14+0.08*k;
    return;
  }
  const T=b.burnT||0;
  /* the glow goes out of them as the fire takes them */
  const k=clamp(1-T/5,0,1);
  U.uGlow.value.setRGB(0.12*k+0.30*(1-k)*clamp(1-T/10,0,1), 0.40*k+0.08*(1-k)*clamp(1-T/10,0,1), 0.52*k);
  /* the silk goes first: it blackens, glows at its edges, and stays black */
  const ch=clamp((T-0.5)/8,0,1);
  /* to ASH, not to black: a black heap under the lantern has no shape left */
  u.feltMat.color.setRGB(0.62-0.42*ch,0.64-0.45*ch,0.65-0.47*ch);
  u.huskMat.color.setRGB(0.55-0.48*ch,0.52-0.46*ch,0.47-0.42*ch);
  for(const m of [u.layerMat,u.fuzzMat]){
    m.opacity=1-ch*0.85;
    m.color.setRGB(0.84-0.6*ch,0.855-0.62*ch,0.86-0.63*ch);
  }
  u.feltMat.emissive.setRGB(0.18*clamp(1-Math.abs(T-4)/5,0,1)*(0.7+0.3*hash(Math.floor(tN*11)+i)),0.05*clamp(1-Math.abs(T-4)/5,0,1),0);
  U.uChar.value=clamp((T-2)/8,0,1);
  U.uEmber.value=clamp((T-3)/3,0,1)*clamp(1-(T-26)/50,0,1)*(0.75+0.25*hash(Math.floor(tN*9)+i));
  /* the pile shrivels into the mound and stays that way */
  const sh=clamp((T-3)/9,0,1);
  if(sh<1||!u.settled){
    u.eggs.forEach((e,j)=>{
      _o.position.set(e.x,e.y0-(e.y0-0.4)*0.5*sh,e.z); _o.rotation.set(e.rx,e.ry,e.rz);
      _o.scale.set(e.r*(1-0.42*sh),e.r*(1-0.58*sh),e.r*(1-0.42*sh)); _o.updateMatrix();
      u.inst.setMatrixAt(j,_o.matrix);
    });
    u.inst.instanceMatrix.needsUpdate=true;
    u.settled=sh>=1;
  }
  u.scorchMat.opacity=clamp(T/12,0,1)*0.62;
  if(hm){
    hm.color.setRGB(1,0.45+0.2*k,0.18+0.4*k);
    hm.opacity=(0.22+0.10*hash(Math.floor(tN*13)+i*7))*clamp(1-T/80,0.04,1);
  }
  /* the fire itself */
  if(!FIRE) return;
  const burning=clamp(1-T/26,0,1), smoulder=clamp(1-(T-20)/60,0,1);
  const ramp=clamp(T/1.2,0,1);
  const d=Math.hypot(wx-camera.position.x,wz-camera.position.z);
  if(d>45) return;                                  // nobody sees it, nothing is spent
  const fl=burning*ramp;
  let nf=fl*60*dt; while(nf>0){ if(Math.random()<nf){
    /* flames rise off the heap's surface, not from inside it */
    const a=Math.random()*Math.PI*2, r=Math.sqrt(Math.random())*1.0*(0.6+0.4*fl);
    const lx=Math.cos(a)*r, lz=Math.sin(a)*r;
    const base=u.surf(lx,lz)*(1-0.35*clamp((T-3)/9,0,1))-0.05;
    FIRE.flames.spawn(wx+lx,base,wz+lz, rand(-0.15,0.15),rand(0.8,1.6)*(0.6+0.4*fl),rand(-0.15,0.15),
      rand(0.5,1.0)*(0.55+0.45*fl)*(1.1-r*0.35), rand(0.5,1.0), rand(0.6,0.95), 0.75+0.25*fl);
  } nf-=1; }
  let ne=(fl*14+smoulder*1.5)*dt; while(ne>0){ if(Math.random()<ne){
    const a=Math.random()*Math.PI*2, r=Math.random()*0.9;
    FIRE.embers.spawn(wx+Math.cos(a)*r,0.4+Math.random()*0.5,wz+Math.sin(a)*r,{life:rand(1.2,3.2),
      size:rand(0.018,0.034), alpha:rand(0.7,1), tint:Math.random()<0.5?0xff8a2a:0xffb050,
      vx:rand(-0.3,0.3), vy:rand(1.0,2.6)*(0.4+0.6*fl), vz:rand(-0.3,0.3), wob:rand(0.2,0.5), drag:0.7,
      grav:-0.2, fin:0.05, fout:0.5, tw:0.6});
  } ne-=1; }
  let ns=(fl*4+smoulder*0.8)*dt; while(ns>0){ if(Math.random()<ns){
    const a=Math.random()*Math.PI*2, r=Math.random()*0.6;
    FIRE.smoke.spawn(wx+Math.cos(a)*r,0.9+fl*0.9,wz+Math.sin(a)*r, rand(-0.1,0.1),rand(0.5,0.9),rand(-0.1,0.1),
      rand(0.5,0.9),rand(2.4,3.8),rand(3.5,6),rand(0.22,0.38)*(0.4+0.6*Math.max(fl,smoulder*0.5)),1.5,
      Math.random()<0.5?0x2a2622:0x3a3530,0.7,0.25);
  } ns-=1; }
}
/* the three pools run once a frame for the whole level */
export function updateClutchFire(dt,camera){
  if(!FIRE) return;
  FIRE.flames.update(dt,camera);
  FIRE.embers.update(dt,camera,performance.now()*0.001);
  FIRE.smoke.update(dt,camera);
}

/* ---------------- cocoons ----------------
   They were spheres stretched long under full-width bands, and a stack of
   parallel stripes round an egg shape is a WASP NEST. A cocoon is whatever
   it used to be, bound: a head and shoulders, a chest, the lumps of limbs
   pressed under the wrap, a tail of spun silk at the foot; and silk is wound
   round a bundle in CROSSING passes, never in rings. */
let CK=null;
export function cocoonMaterial(){
  if(CK) return CK;
  const wound=makeCanvas(256,512,(g,w,h)=>{
    g.fillStyle="#838a8c"; g.fillRect(0,0,w,h);
    const wrap=fn=>{ for(const ox of[0,-w,w]) for(const oy of[0,-h,h]) fn(ox,oy); };
    for(let i=0;i<24;i++){
      const x=Math.random()*w, y=Math.random()*h, r=20+Math.random()*60, lite=Math.random()<0.5;
      wrap((ox,oy)=>{ const gr=g.createRadialGradient(x+ox,y+oy,2,x+ox,y+oy,r);
        gr.addColorStop(0,lite?"rgba(190,196,198,0.16)":"rgba(40,44,46,0.18)"); gr.addColorStop(1,"rgba(0,0,0,0)");
        g.fillStyle=gr; g.beginPath(); g.arc(x+ox,y+oy,r,0,7); g.fill(); });
    }
    g.lineCap="round";
    /* passes of the wind: long strokes round the bundle (u), each pass at
       its own slant, so they cross */
    for(let pass=0;pass<9;pass++){
      const slant=(Math.random()-0.5)*0.9, y0=Math.random()*h, band=12+Math.random()*50;
      for(let i=0;i<70;i++){
        const yy=y0+(Math.random()-0.5)*band, lite=Math.random()<0.6, al=0.06+Math.random()*0.14;
        const lw=0.6+Math.random()*1.4;
        wrap((ox,oy)=>{
          g.strokeStyle=lite?`rgba(226,232,232,${al})`:`rgba(40,44,46,${al})`; g.lineWidth=lw;
          g.beginPath(); g.moveTo(ox,yy+oy);
          for(let x=0;x<=w;x+=16) g.lineTo(x+ox, yy+oy+x*slant+Math.sin(x*0.05+i)*2);
          g.stroke(); });
      }
    }
    for(let i=0;i<900;i++){                  // loose fibre between the passes
      const x=Math.random()*w, y=Math.random()*h, a=Math.random()*Math.PI, L=4+Math.random()*16;
      g.strokeStyle=`rgba(${Math.random()<0.6?220:40},${Math.random()<0.6?226:44},${Math.random()<0.6?226:46},${0.05+Math.random()*0.12})`;
      g.lineWidth=0.5+Math.random()*0.7;
      g.beginPath(); g.moveTo(x,y); g.lineTo(x+Math.cos(a)*L,y+Math.sin(a)*L); g.stroke();
    }
    for(let i=0;i<160;i++){                  // grime picked up off the cave
      g.fillStyle=`rgba(${70+Math.random()*30|0},${66+Math.random()*26|0},${56+Math.random()*22|0},${0.12+Math.random()*0.2})`;
      g.fillRect(Math.random()*w,Math.random()*h,1+Math.random()*2.5,1+Math.random()*2);
    }
  });
  wound.wrapS=wound.wrapT=THREE.RepeatWrapping; wound.anisotropy=4;
  const woundN=normalFromHeight(wound,256,0.5,0.004);
  /* matte, like the heap: glazed, a wound bundle is a brass spinning top */
  CK=new THREE.MeshPhongMaterial({map:wound, normalMap:woundN, color:0x9ca2a4,
    specular:0x161a1c, shininess:6});
  markShared(wound,woundN,CK);
  return CK;
}
/* the loose outer silk a bundle wears over its wind: the same bundle a
   little larger, in thread-shaped alpha, so its edges are fibre */
let CF=null;
export function cocoonFuzzMaterial(){
  if(CF) return CF;
  CF=markShared(new THREE.MeshPhongMaterial({map:skins().layer, transparent:true, depthWrite:false,
    color:0xe8ecee, emissive:0x15181a, specular:0x505860, shininess:24}));
  return CF;
}
/* a bundle's geometry and that outer silk, merged into two meshes on `parent` */
export function addCocoons(parent,list){
  if(!list.length) return;
  const fuzz=list.map(m=>{ const f=new THREE.Mesh(m.geometry); f.position.copy(m.position);
    f.rotation.copy(m.rotation); f.scale.copy(m.scale).multiplyScalar(1.07); return f; });
  parent.add(mergeStatic(list,cocoonMaterial()));
  parent.add(mergeStatic(fuzz,cocoonFuzzMaterial()));
  for(const m of list) m.geometry.dispose();
}
/* a wrapped body along y, centred; r its girth, len its length */
export function cocoonGeo(r,len){
  const N=18, pts=[];
  const prof=[[0,0.001],[0.05,0.22],[0.16,0.62],[0.34,0.84],[0.52,0.93],[0.68,1.0],[0.80,0.94],
              [0.88,0.84],[0.95,0.66],[1,0.001]];
  const at=t=>{ for(let i=1;i<prof.length;i++) if(t<=prof[i][0]){
    const [t0,a]=prof[i-1],[t1,b]=prof[i], k=(t-t0)/(t1-t0); return a+(b-a)*(k*k*(3-2*k)); } return 0.001; };
  for(let i=0;i<=N;i++){ const t=i/N; pts.push(new THREE.Vector2(Math.max(0.001,r*at(t)*rand(0.96,1.04)),(t-0.5)*len)); }
  const g=new THREE.LatheGeometry(pts,14);
  g.attributes.uv.array.forEach((v,i,a)=>{ if(i%2===1) a[i]=v*len*1.4; });   // the wind keeps its pitch on a long bundle
  const p=g.attributes.position, sd=Math.random()*9, limb=Math.random()*6.28, bend=rand(-0.5,0.5)*r;
  const lumps=[0,1,2,3].map(()=>[Math.random()*6.28,rand(0.2,0.85),rand(0.08,0.16)]);
  for(let i=0;i<p.count;i++){
    const x=p.getX(i), y=p.getY(i), z=p.getZ(i), a=Math.atan2(z,x), t=y/len+0.5;
    let k=1+0.09*Math.sin(a+sd+y*1.3)+0.06*Math.sin(a*2+sd+y*2.1)+0.04*Math.sin(a*3-y*3.3+sd);
    for(const[la,lt,ls]of lumps){ const da=Math.atan2(Math.sin(a-la),Math.cos(a-la)), dt=t-lt;
      k+=ls*Math.exp(-da*da/0.35-dt*dt/0.012); }
    /* limbs pressed under the wrap: two ridges down one side */
    for(const off of[-0.55,0.55]){ const da=Math.atan2(Math.sin(a-limb-off),Math.cos(a-limb-off));
      k+=0.14*Math.exp(-da*da/0.08)*Math.max(0,Math.sin(Math.min(1,Math.max(0,(t-0.08)/0.55))*Math.PI)); }
    p.setXYZ(i,x*k+bend*(2*t-1)*(2*t-1),y,z*k);
  }
  g.computeVertexNormals();
  return g;
}
