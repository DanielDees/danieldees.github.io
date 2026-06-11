/* ---------------- three.js scene & level geometry ---------------- */
import { rand, clamp } from "./utils.js";
import { W, H, CELL, WALL_H, grid, genMap, cellToWorld, isWall } from "./map.js";
import { makeCanvas, texWall, texCarpet, texStains, texCeil, texCeilStains,
         makeMoldTextures } from "./textures.js";
import { $ } from "./utils.js";

export const FOG_COLOR = 0x050402;       // ~98% black, a whisper of yellow: full darkness, never backlit
export const scene = new THREE.Scene();
/* linear fog: explicit start/end so the transition band is tunable.
   Start 5.4m (two 10% pulls from the original ≈6.7m exp2 onset), end 55m
   (two 20% stretches) — a long readable band where a silhouette survives
   deep into the murk before it's swallowed. */
scene.fog = new THREE.Fog(FOG_COLOR, 5.4, 55);
scene.background = new THREE.Color(FOG_COLOR);
export const camera = new THREE.PerspectiveCamera(72, innerWidth/innerHeight, 0.1, 200);
export const renderer = new THREE.WebGLRenderer({antialias:true});
renderer.setSize(innerWidth,innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
$("game").appendChild(renderer.domElement);
addEventListener("resize",()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight);});

/* modest base light — the fixture pool below does the real work.
   Kept LOW: this pair is the brightness floor for corridors far from any
   fixture, and those should sit in real murk (another −40% from v1.2). */
export const hemi = new THREE.HemisphereLight(0xffe9b0, 0x2c2414, 0.08);
scene.add(hemi);
const amb = new THREE.AmbientLight(0x6b5d35, 0.05);
scene.add(amb);
export const playerLight = new THREE.PointLight(0xffeeb0, 0.12, 9, 1.8); // faint readability fill
scene.add(playerLight);

/* pool of real point lights bound to the nearest ceiling panels.
   Per-pixel (Phong) materials + decay give a smooth radial gradient that
   reaches the carpet; intensity fades out across the outer band of the
   bind radius so fixtures ease in at a distance instead of popping. */
export const LIGHT_POOL_N = 30, LIGHT_BIND_RADIUS = 27, LIGHT_FADE_START = 17;
export const lightPool=[];
for(let i=0;i<LIGHT_POOL_N;i++){
  /* tight falloff (range 11, decay 2.2): each fixture owns a pool a few
     meters wide. Long ranges made every floor point sit inside many
     overlapping radii — contributions summed past 1.0 and the whole
     carpet clipped to uniform max. Tight pools keep visible gradients
     between fixtures even when several are lit. */
  const pl=new THREE.PointLight(0xffeec0, 0, 11, 2.2);
  pl.position.y=WALL_H-0.5;
  scene.add(pl); lightPool.push(pl);
}

/* build level meshes */
export let lights=[];           // {glowMat, cx, cy, world, flickery, phase, on, ...}
export function buildLevel(){
  genMap();
  /* Phong = per-fragment lighting. Lambert is per-vertex in three r128,
     which is why huge planes/boxes lit "all or nothing" — the floor's only
     vertices are its corners. Near-black specular keeps it matte. */
  const wallMat = new THREE.MeshPhongMaterial({map:texWall, specular:0x0d0c07, shininess:6});
  const wallGeo = new THREE.BoxGeometry(CELL,WALL_H,CELL);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    if(grid[y][x]===1){
      if(isWall(x-1,y)&&isWall(x+1,y)&&isWall(x,y-1)&&isWall(x,y+1)) continue;
      const m=new THREE.Mesh(wallGeo,wallMat);
      const p=cellToWorld(x,y);
      m.position.set(p.x,WALL_H/2,p.z);
      scene.add(m);
    }
  }
  const SZ=W*CELL;
  /* ceiling tiles at W,H (not W*2,H*2): doubles the grid squares to 1m —
     exactly two wall-paper stripes wide, the classic drop-tile size */
  texCarpet.repeat.set(W/2,H/2); texCeil.repeat.set(W,H);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(SZ,SZ),
    new THREE.MeshPhongMaterial({map:texCarpet, specular:0x000000, shininess:1}));
  floor.rotation.x=-Math.PI/2; scene.add(floor);
  /* stain overlay tiles at a non-integer rate so it never aligns with the carpet */
  texStains.repeat.set(5.13,4.71);
  const stains=new THREE.Mesh(new THREE.PlaneGeometry(SZ,SZ),
    new THREE.MeshPhongMaterial({map:texStains, transparent:true, depthWrite:false,
      specular:0x000000, shininess:1}));
  stains.rotation.x=-Math.PI/2; stains.position.y=0.015; scene.add(stains);
  const ceil=new THREE.Mesh(new THREE.PlaneGeometry(SZ,SZ),
    new THREE.MeshPhongMaterial({map:texCeil, specular:0x050503, shininess:2}));
  ceil.rotation.x=Math.PI/2; ceil.position.y=WALL_H; scene.add(ceil);
  /* rare water stains: overlay tiled at a non-integer rate (same trick as
     the carpet stains) so they never line up with the tile grid */
  texCeilStains.repeat.set(4.07,3.77);
  const ceilStains=new THREE.Mesh(new THREE.PlaneGeometry(SZ,SZ),
    new THREE.MeshPhongMaterial({map:texCeilStains, transparent:true, depthWrite:false,
      specular:0x000000, shininess:1}));
  ceilStains.rotation.x=Math.PI/2; ceilStains.position.y=WALL_H-0.012; scene.add(ceilStains);

  /* ---- slime-mold at the baseboards: decals on random wall faces, each a
     UNIQUE procedurally grown colony rendered onto a paired wall+floor
     texture so the growth wraps the seam. Width 20–80% of a wall section
     (averaging ~50%); height FOLLOWS width at a 3.3–5.5:1 ratio (clamped to
     4–18% of the wall) so colonies read low and wide, never square. */
  const moldMat=t=>new THREE.MeshPhongMaterial({map:t,
    transparent:true, depthWrite:false, specular:0x000000, shininess:1});
  for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){
    if(grid[y][x]!==0) continue;
    for(const[dx,dz]of[[1,0],[-1,0],[0,1],[0,-1]]){
      if(!isWall(x+dx,y+dz)||Math.random()>=0.30) continue;
      const p=cellToWorld(x,y);
      const wid=CELL*rand(0.20,0.80);
      const hgt=clamp(wid*rand(0.18,0.30), WALL_H*0.04, WALL_H*0.18);
      const dep=WALL_H*rand(0.025,0.06);
      const tex=makeMoldTextures(wid,hgt,dep);
      const off=rand(-1,1)*(CELL/2-wid/2-0.15);
      const inset=CELL/2-0.02;
      const wallM=new THREE.Mesh(new THREE.PlaneGeometry(wid,hgt), moldMat(tex.wall));
      if(dx){ wallM.position.set(p.x+dx*inset, hgt/2, p.z+off); wallM.rotation.y=dx>0? -Math.PI/2: Math.PI/2; }
      else  { wallM.position.set(p.x+off, hgt/2, p.z+dz*inset); wallM.rotation.y=dz>0? Math.PI: 0; }
      scene.add(wallM);
      /* the same colony's spill, flush against the wall base */
      const f=new THREE.Mesh(new THREE.PlaneGeometry(wid,dep), moldMat(tex.floor));
      /* Euler XYZ applies Z first: spin the decal so its dense edge meets
         the wall, then X lays it flat on the carpet */
      f.rotation.x=-Math.PI/2;
      f.rotation.z = dx>0? -Math.PI/2 : dx<0? Math.PI/2 : dz>0? Math.PI : 0;
      const fInset=CELL/2-dep/2-0.025;
      if(dx) f.position.set(p.x+dx*fInset, 0.022, p.z+off);
      else   f.position.set(p.x+off, 0.022, p.z+dz*fInset);
      scene.add(f);
    }
  }

  /* fluorescent fixtures: a shallow housing with an OPEN bottom face —
     tubes and diffuse backplate sit recessed inside it, and the grille is
     inset flush with the bottom rim, exactly like a real troffer */
  /* single full-cover texture (no tiling) so the grate can close with a
     rail on ALL four edges — a repeating tile always ends on a gap at the
     far side, leaving the grate visually open on two sides */
  const grateTex = makeCanvas(256,128,(g,w,h)=>{
    g.clearRect(0,0,w,h);
    g.fillStyle="rgba(22,19,11,0.96)";
    /* exact division: rails on both edges with N uniform cells between,
       so the pattern closes flush on every side — fixed-step spacing left
       a partial sliver cell against the far rails */
    const NX=32, NY=8;
    for(let i=0;i<=NX;i++) g.fillRect(i*(w-2)/NX,0,2,h);   // grille vanes
    for(let j=0;j<=NY;j++) g.fillRect(0,j*(h-2)/NY,w,2);   // cross ribs
  });
  /* end-of-life tubes: a gentle hue drift — yellower at the ends, a touch
     more orange at the center where the phosphor has worn the most.
     CylinderGeometry's v axis runs end-to-end, so a vertical gradient maps
     along the tube. */
  const warmTubeTex = makeCanvas(4,64,(g,w,h)=>{
    const gr=g.createLinearGradient(0,0,0,h);
    gr.addColorStop(0,  "#ffdf94");
    gr.addColorStop(0.5,"#ff9742");
    gr.addColorStop(1,  "#ffdf94");
    g.fillStyle=gr; g.fillRect(0,0,w,h);
  });
  const HOUSE_D=0.096;                               // 20% shallower than before
  const housingGeo=new THREE.BoxGeometry(CELL*0.66,HOUSE_D,CELL*0.34);
  /* galvanized-steel fixture frame — clearly a piece of metal hardware,
     not a patch of ceiling; faint emissive keeps it readable right next
     to its own glowing tubes */
  const housingSide=new THREE.MeshPhongMaterial({color:0xb4b2aa,emissive:0x0d0d0b,
    specular:0x6a6960,shininess:55});
  /* bottom face: metallic trim flange with the centre punched out via
     alphaTest so the grate & glow show through — keeps the fixture visible
     from directly underneath without transparency-sorting issues */
  const rimTex=makeCanvas(256,128,(g,w,h)=>{
    g.clearRect(0,0,w,h);
    g.fillStyle="#a8a69d";
    g.fillRect(0,0,w,8);g.fillRect(0,h-8,w,8);g.fillRect(0,0,8,h);g.fillRect(w-8,0,8,h);
    g.fillStyle="rgba(30,28,22,0.85)";                 // shadowed inner lip
    g.fillRect(8,8,w-16,2);g.fillRect(8,h-10,w-16,2);g.fillRect(8,8,2,h-16);g.fillRect(w-10,8,2,h-16);
  });
  const housingRim=new THREE.MeshPhongMaterial({map:rimTex,alphaTest:0.5,
    specular:0x55534a,shininess:45});
  // box face order: +x,-x,+y,-y,+z,-z — bottom (-y) carries the trim flange
  const housingMats=[housingSide,housingSide,housingSide,housingRim,housingSide,housingSide];
  const tubeGeo=new THREE.CylinderGeometry(0.042,0.042,CELL*0.55,8);
  tubeGeo.rotateZ(Math.PI/2);                        // lie along x
  /* backplate fills the housing opening edge-to-edge: the box's top face is
     back-face culled from below, so any gap around the backplate would show
     straight through to the ceiling plane — ceiling texture inside the
     fixture. Full coverage seals the interior. */
  const glowGeo=new THREE.PlaneGeometry(CELL*0.66,CELL*0.34);
  /* the grate must line up with the rim flange's inner opening
     (0.61875 × 0.2975 of CELL — the rim border is 8px of its 256×128
     texture). Sized a hair larger so the grate's outer rails tuck just
     under the rim: the first visible cell inside the rim is then always
     a full one. A larger grate hides its rails deeper under the rim and
     exposes a glowing sliver of part-cell instead. */
  const grateGeo=new THREE.PlaneGeometry(CELL*0.625,CELL*0.305);
  const grateMat=new THREE.MeshBasicMaterial({map:grateTex,transparent:true});
  /* ~30% of fixture slots stay dark. A truly independent per-slot roll
     produces runs of adjacent misses, which read as whole missing ROWS at
     this 8m slot spacing — so a slot may only go dark if its left and up
     neighbors spawned, and the base rate is raised to keep net density
     near 30%. Same average, no long gaps. */
  const darkSlots=new Set(), slotKey=(sx,sy)=>sy*W+sx;
  for(let y=1;y<H-1;y+=2)for(let x=1;x<W-1;x+=2){
    if(grid[y][x]!==0) continue;
    if(Math.random()<0.55 && !darkSlots.has(slotKey(x-2,y)) && !darkSlots.has(slotKey(x,y-2))){
      darkSlots.add(slotKey(x,y));
      continue;
    }
    /* ~10% of fixtures are end-of-life: warm orange, half brightness,
       slower dim-down cycles instead of random flicker bursts */
    {
      const warm=Math.random()<0.10;
      /* the TUBES are the light source — the housing interior only catches
         spill, so every backplate sits darker than its tubes: a faint glow
         on dying fixtures, a brighter (but still secondary) wash on healthy
         ones. glowMat = backplate, tubeMat = tubes. */
      const glowMat=new THREE.MeshBasicMaterial({color: warm?0x4d3419:0xb8b2a2});
      const tubeMat=warm? new THREE.MeshBasicMaterial({map:warmTubeTex})
                        : new THREE.MeshBasicMaterial({color:0xfff6cf});
      const p=cellToWorld(x,y);
      const fix=new THREE.Group();
      const housing=new THREE.Mesh(housingGeo,housingMats);
      housing.position.y=WALL_H-HOUSE_D/2; fix.add(housing);
      const backplate=new THREE.Mesh(glowGeo,glowMat);
      backplate.rotation.x=Math.PI/2; backplate.position.y=WALL_H-0.014; fix.add(backplate);
      for(const tz of[-0.32,0.32]){
        const tube=new THREE.Mesh(tubeGeo,tubeMat);
        tube.position.set(0,WALL_H-0.05,tz); fix.add(tube);   // recessed inside the housing
      }
      const grate=new THREE.Mesh(grateGeo,grateMat);
      grate.rotation.x=Math.PI/2; grate.position.y=WALL_H-HOUSE_D+0.004; fix.add(grate); // flush with the rim
      fix.position.set(p.x,0,p.z);
      scene.add(fix);
      /* healthy panels idle at 85–100% of max; dimY (0 at full, 1 at the
         floor) faintly yellows the dimmer ones — same idea as the dying
         tubes' orange gradient, far subtler */
      const bright=warm? 1 : rand(0.85,1);
      lights.push({glowMat:glowMat, tubeMat:tubeMat, cx:x, cy:y, world:p,
        flickery:Math.random()<0.22,
        warm:warm, warmth:warm?1:0, bright:bright, dimY:warm?0:(1-bright)/0.15,
        phase:Math.random()*100, on:1,
        mode:"steady", timer:rand(1,12), pattern:0, rate:20,
        burstDur:0, burstT:0, descT:2, riseT:0.5, seed:Math.random()*1000, lastTick:0});
    }
  }
}
