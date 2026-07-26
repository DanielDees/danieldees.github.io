/* ---------------- three.js scene & level geometry ---------------- */
import { rand, clamp } from "./utils.js";
import { W, H, CELL, WALL_H, grid, genMap, cellToWorld, isWall } from "./map.js";
import { texWall, texCarpet, texStains, texCeil, texCeilBump, texCeilStains,
         makeMoldTextures, makeDripTextures, sliceTexture,
         makeTubeTexture, texGalv, texReflector, texLouvre, scaleBoxUV } from "./textures.js";
import { $ } from "./utils.js";
import { readSettings } from "./settings.js";

export const FOG_COLOR = 0x050402;       // ~98% black, a whisper of yellow: full darkness, never backlit
export const scene = new THREE.Scene();
/* linear fog: explicit start/end so the transition band is tunable.
   Start 5.4m (two 10% pulls from the original ≈6.7m exp2 onset), end 55m
   (two 20% stretches) — a long readable band where a silhouette survives
   deep into the murk before it's swallowed. */
scene.fog = new THREE.Fog(FOG_COLOR, 5.4, 55);
scene.background = new THREE.Color(FOG_COLOR);
export const camera = new THREE.PerspectiveCamera(72, innerWidth/innerHeight, 0.1, 200);
/* graphics quality is read straight from saved settings HERE: antialias can only
   be chosen when the GL context is created, so ui.js can't flip it live — it
   reads back at construction and a change takes effect on the next reload. The
   pixel ratio, by contrast, can be set live (setRenderQuality below). */
const _sv=readSettings();
const _lowQ = !!(_sv && _sv.quality==="low");
const _maxDPR=()=>Math.min(devicePixelRatio,2);
export const renderer = new THREE.WebGLRenderer({antialias:!_lowQ, powerPreference:"high-performance"});
renderer.setSize(innerWidth,innerHeight);
renderer.setPixelRatio(_lowQ?1:_maxDPR());
$("game").appendChild(renderer.domElement);
/* live quality switch — pixel ratio applies immediately (1× on low-end halves the
   fragment load), antialias waits for a reload */
export function setRenderQuality(low){ renderer.setPixelRatio(low?1:_maxDPR()); }
addEventListener("resize",()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight);});

/* modest base light — the fixture pool below does the real work.
   Kept LOW: this pair is the brightness floor for corridors far from any
   fixture, and those should sit in real murk (another −40% from v1.2). */
export const hemi = new THREE.HemisphereLight(0xffe9b0, 0x2c2414, 0.08);
scene.add(hemi);
export const amb = new THREE.AmbientLight(0x6b5d35, 0.05);
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

/* everything added so far survives a level change; buildLevel/buildLibrary
   meshes (and the entities/props added later) don't get the tag, so
   clearLevelScene sweeps them all without each module keeping lists */
for(const o of scene.children) o.userData.persist=true;

/* ---------------- GPU-resource disposal ----------------
   scene.remove() only detaches from the graph — geometry/material/texture GPU
   buffers persist until .dispose(). Per-build assets (decal canvases, the
   per-fixture flicker materials, wall geometry, …) are created fresh every
   build, so without this they leak on every respawn and level change and
   eventually exhaust VRAM. We dispose by traversal on teardown, skipping the
   SHARED singletons (module-level materials/textures + the cached book pool),
   which are reused across builds and must survive. Each module registers its
   own shared assets via markShared. */
export const SHARED=new Set();
export function markShared(...res){ for(const r of res) if(r) SHARED.add(r); return res[0]; }
// level-0 tileable textures (repeat is mutated per build, and they're reused)
markShared(texWall,texCarpet,texStains,texCeil,texCeilBump,texCeilStains);
const _MAT_MAPS=["map","alphaMap","aoMap","bumpMap","displacementMap","emissiveMap",
  "envMap","lightMap","metalnessMap","normalMap","roughnessMap","specularMap","gradientMap"];
function disposeMaterial(m,done){
  if(!m||SHARED.has(m)||done.has(m)) return;
  done.add(m);
  for(const k of _MAT_MAPS){ const t=m[k]; if(t&&!SHARED.has(t)&&!done.has(t)){ done.add(t); t.dispose(); } }
  m.dispose();
}
function disposeNode(o,done){
  const g=o.geometry;
  if(g&&!SHARED.has(g)&&!done.has(g)){ done.add(g); g.dispose(); }
  const m=o.material;
  if(Array.isArray(m)) for(const mm of m) disposeMaterial(mm,done);
  else if(m) disposeMaterial(m,done);
}
export function clearLevelScene(){
  const done=new Set();                              // dedupe assets shared across many meshes in this build
  for(const o of [...scene.children]){
    if(o.userData.persist) continue;
    o.traverse(c=>{ if(c.isMesh||c.isSprite||c.isLine) disposeNode(c,done); });
    scene.remove(o);
  }
  lights.length=0;
  wallMeshes=new Map();
  wallDecals.length=0;
}

/* ---------------- static draw-call merging & matrix freezing ----------------
   r128 has no auto-batching: every Mesh is a draw call, and matrixAutoUpdate
   (default true) recomputes every static object's world matrix each frame.
   mergeStatic collapses many identical-material static meshes into one; freeze
   stops their per-frame matrix work. */
function concatGeos(geos){
  let vc=0, ic=0;
  for(const g of geos){ vc+=g.attributes.position.count; ic+=g.index.count; }
  const pos=new Float32Array(vc*3), nor=new Float32Array(vc*3), uv=new Float32Array(vc*2);
  const idx=(vc>65535? new Uint32Array(ic):new Uint16Array(ic));
  let vo=0, io=0;
  for(const g of geos){
    pos.set(g.attributes.position.array, vo*3);
    nor.set(g.attributes.normal.array, vo*3);
    uv.set(g.attributes.uv.array, vo*2);
    const gi=g.index.array;
    for(let i=0;i<gi.length;i++) idx[io+i]=gi[i]+vo;
    vo+=g.attributes.position.count; io+=gi.length;
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute("position",new THREE.BufferAttribute(pos,3));
  geo.setAttribute("normal",new THREE.BufferAttribute(nor,3));
  geo.setAttribute("uv",new THREE.BufferAttribute(uv,2));
  geo.setIndex(new THREE.BufferAttribute(idx,1));
  return geo;
}
/* bake each mesh's world transform into a clone of its geometry, concat into
   one geometry, return a single static Mesh (the inputs are NOT added). */
export function mergeStatic(meshes,material){
  const geos=[];
  for(const m of meshes){ m.updateMatrixWorld(true); const g=m.geometry.clone(); g.applyMatrix4(m.matrixWorld); geos.push(g); }
  const merged=concatGeos(geos);
  for(const g of geos) g.dispose();
  return freezeStatic(new THREE.Mesh(merged,material));
}
/* stop per-frame matrix recompute on a positioned static object (+ subtree) */
export function freezeStatic(o){
  o.updateMatrixWorld(true);
  o.traverse(c=>{ c.matrixAutoUpdate=false; });
  return o;
}
/* sweep the freshly built level: freeze every static top-level object. Skips
   persistent rig, animated props (idle-spinning pickups), and anything a
   cutscene drives by transform (elevators, the breaker) — all tagged
   userData.animated. Entities are added AFTER this runs, so they're untouched. */
export function freezeStaticScene(){
  for(const o of scene.children){
    if(o.userData.persist||o.userData.animated) continue;
    freezeStatic(o);
  }
}
/* level 0 only: the elevator carve (placeProps) removes one wall cell's mesh,
   so walls are merged AFTER props — collapsing ~400 draw calls to one. */
export function mergeWallMeshes(){
  const arr=[]; for(const m of wallMeshes.values()) if(m.parent) arr.push(m);
  if(!arr.length) return;
  const srcGeo=arr[0].geometry, mat=arr[0].material;
  const merged=mergeStatic(arr,mat);
  for(const m of arr) scene.remove(m);
  srcGeo.dispose();                                  // the shared box geo is now baked into `merged`
  scene.add(merged);
}
/* fog & ambient floor per level. THE END sits in a cooler, deeper murk:
   its minimum ambient light level is roughly HALF of level 0's. */
export function setLevelEnvironment(level){
  if(level===1){
    scene.background.setHex(0x030404);
    /* linear fog, pinned at both ends: clear within 10m, ~50% at the 100m far wall.
       three's linear fog is a smoothstep over [10,190], so 50% sits at the midpoint —
       far=190 puts that midpoint at (10+190)/2 = 100m. */
    scene.fog = new THREE.Fog(0x030404, 10, 190);
    hemi.color.setHex(0xe8e2d0); hemi.groundColor.setHex(0x14161c);
    hemi.intensity=0.048;
    amb.color.setHex(0x4a5060); amb.intensity=0.03;
  } else if(level===2){
    /* THE NEST: close air, blue-black dark — the fog eats a tunnel in ~50m
       (stretched with the caverns: the far side of the central vault is a
       silhouette, not a wall of black at arm's length) */
    scene.background = new THREE.Color(0x020506);
    scene.fog = new THREE.Fog(0x020506, 6, 66);
    hemi.color.setHex(0x9fc4d2); hemi.groundColor.setHex(0x0a1114);
    hemi.intensity=0.030;
    amb.color.setHex(0x24404a); amb.intensity=0.026;
  }
}
/* one fixture record, one behavior: every light in the game — level-0
   troffer or library hanging strip — is driven by the same lights.js
   pipeline (panelValue flicker patterns, warmth hue, dimY yellowing,
   pool binding, buzz voices). Builders only choose the knobs.
   dimDen: how hard a below-max `bright` yellows the tube (level 0: 0.15;
   the library's poorer current uses a wider band, so its strips idle a
   deeper yellow before the burnout pushes them orange-red). */
export function makeLightRecord(glowMat,tubeMat,cx,cy,world,opts={}){
  const warm = opts.warm!==undefined? opts.warm : Math.random()<0.10;
  const bright = opts.bright!==undefined? opts.bright : (warm?1:rand(0.85,1));
  const dimDen = opts.dimDen||0.15;
  return {glowMat, tubeMat, cx, cy, world,
    louvMat:opts.louvMat,                    // level-0 troffers only; lights.js dims the blades
    fixY:opts.fixY, wakeAt:opts.wakeAt||0,
    flickery: opts.flickery!==undefined? opts.flickery : Math.random()<0.22,
    warm, warmth:warm?1:0, bright, dimY:warm?0:(1-bright)/dimDen,
    phase:Math.random()*100, on:1, blackMul:1, blackStart:0,
    mode:"steady", timer:rand(1,12), pattern:0, rate:20,
    burstDur:0, burstT:0, descT:2, riseT:0.5, seed:Math.random()*1000, lastTick:0,
    near:0, shocked:false, shockT:0};
}

/* build level meshes */
export let lights=[];           // {glowMat, cx, cy, world, flickery, phase, on, ...}
export let wallMeshes=new Map(); // cell key (cy*W+cx) → wall box mesh; props.js carves the elevator out of one
/* every mold/drip decal, tagged with the wall cell(s) it lies against —
   so carving a wall (the elevator) can take its decals with it instead of
   leaving them floating in the doorway */
export let wallDecals=[];
export function removeDecalsOnWall(key){
  /* the decals carved out here leave the scene mid-build, so clearLevelScene
     never sees them — dispose their (per-decal) texture/material/geometry now
     and drop them from the registry instead of leaving dead entries */
  for(let i=wallDecals.length-1;i>=0;i--){
    const m=wallDecals[i];
    if(!m.userData.wallKeys || !m.userData.wallKeys.includes(key)) continue;
    scene.remove(m);
    m.geometry.dispose();
    if(m.material.map) m.material.map.dispose();
    m.material.dispose();
    wallDecals.splice(i,1);
  }
}
/* ---------------- the level-0 troffer fixture ----------------
   A recessed housing with an OPEN bottom, the lamps hung inside it and a real
   egg-crate louvre below them. The record driving it (makeLightRecord) is the
   shared one; only the shell differs from the library's hanging strip.
   Assets live at module level and are markShared'd: buildLevel runs on every
   respawn, and regenerating identical canvases/geometry each time was pure
   churn (the library's makeFixture already worked this way).

   THE GRID UNDER THE LAMPS IS ROUND BAR, and it has to be. It was twenty
   single quads — a real egg-crate louvre blade, 1.4mm of steel — and that is
   an object that DISAPPEARS from the one place everybody looks at a ceiling
   light from, straight up at it, then reappears as graph paper the moment you
   step aside. Round bar presents the same 16mm from every angle. The housing
   was also six draws (a box with a six-material array); merged, the shell is
   one, and the guard grid is still one.

   IT IS RECESSED, half its depth up inside the ceiling — which needs a real
   HOLE in the ceiling, not just a shift. Everything above WALL_H (the pan,
   the reflector, both lamps) is otherwise occluded by the very plane it is
   set into: the fixture would come out as a dark slot with a grid over it.
   scene.js cuts the openings (see ceilingGeometry), and the TRIM FLANGE stays
   down at the ceiling line lapping over the cut edge — that flange is the
   only thing hiding the 6mm clearance the opening is cut with. */
const FW=CELL*0.66, FD=CELL*0.34;    // the fixture's footprint
const HOUSE_D=0.165;                 // deep enough to actually recess the lamps
const RISE=HOUSE_D*0.5;              // half of that goes up inside the ceiling
const FLANGE=0.035;                  // the trim's reach onto the tile (was 0.05)
const OPEN_C=0.006;                  // clearance the ceiling opening is cut with
const TUBE_Y=-0.068, TUBE_Z=FD/6, TUBE_L=CELL*0.55, TUBE_R=0.042;
const ROD_R=0.008, ROD_Y=-HOUSE_D+0.005+ROD_R;
const SHEET=0.014;                   // the steel's thickness
/* the tubes themselves are the shared filament asset (textures.js): burnt
   electrodes, worn phosphor, and — on the dying ones — the end-of-life hue
   drift toward orange at the centre. The library's hanging strips import
   the same two maps. */
export const tubeTex = makeTubeTexture(false), warmTubeTex = makeTubeTexture(true);
/* galvanized-steel fixture frame — clearly a piece of metal hardware,
   not a patch of ceiling; faint emissive keeps it readable right next
   to its own glowing tubes */
const housingSide=new THREE.MeshPhongMaterial({map:texGalv,color:0xb4b2aa,emissive:0x0d0d0b,
  specular:0x6a6960,shininess:55});
/* build a set of positioned boxes and hand back ONE geometry. mergeStatic
   returns a Mesh (and freezes it) — the geometry is what's wanted here, so
   every fixture can hang its own Mesh on the same buffers. */
function bakeParts(parts,mat){
  const mg=mergeStatic(parts,mat);
  for(const p of parts) p.geometry.dispose();
  return mg.geometry;
}
const shellGeo=(()=>{
  const parts=[], P=(w,hh,d,x,y,z)=>{
    const m=new THREE.Mesh(scaleBoxUV(new THREE.BoxGeometry(w,hh,d),w,hh,d,0.5));
    m.position.set(x,y,z); parts.push(m);
  };
  P(FW,0.012,FD, 0,-0.006,0);                              // the pan closes the top
  const H2=HOUSE_D-0.012, CY=-0.012-H2/2;
  for(const s of[-1,1]) P(SHEET,H2,FD, s*(FW/2-SHEET/2),CY,0);
  for(const s of[-1,1]) P(FW-2*SHEET,H2,SHEET, 0,CY,s*(FD/2-SHEET/2));
  /* the trim flange: a RING, at the ceiling line, lapping outward over the cut
     tile edge. Its top sits 1.5mm proud of the ceiling plane so the two
     intersect rather than fight for the same depth, and it must never be a
     solid plate — that would close the opening it is trimming. */
  const FY=-RISE-0.0075;
  for(const s of[-1,1]) P(FW+2*FLANGE,0.018,FLANGE, 0,FY,s*(FD/2+FLANGE/2));
  for(const s of[-1,1]) P(FLANGE,0.018,FD, s*(FW/2+FLANGE/2),FY,0);
  for(const s of[-1,1]) P(0.028,0.018,FD, s*(FW/2-0.014),-HOUSE_D+0.009,0);   // the rim the
  for(const s of[-1,1]) P(FW-0.056,0.018,0.028, 0,-HOUSE_D+0.009,s*(FD/2-0.014)); // grid sits in
  return bakeParts(parts,housingSide);
})();
/* lampholders. Ivory plastic, not steel — and they are the detail that says
   the tube is SEATED in something rather than floating in a box. */
const holderMat=new THREE.MeshPhongMaterial({color:0xcfc8b2,emissive:0x131208,
  specular:0x3a382c,shininess:24});
const holderGeo=(()=>{
  const parts=[];
  for(const sx of[-1,1])for(const sz of[-1,1]){
    const m=new THREE.Mesh(new THREE.BoxGeometry(0.042,0.088,0.058));
    m.position.set(sx*(TUBE_L/2+0.024),TUBE_Y+0.004,sz*TUBE_Z); parts.push(m);
  }
  return bakeParts(parts,holderMat);
})();
const tubeGeo=(()=>{
  const parts=[];
  for(const sz of[-1,1]){
    const g=new THREE.CylinderGeometry(TUBE_R,TUBE_R,TUBE_L,8);
    g.rotateZ(Math.PI/2);                              // lie along x
    const m=new THREE.Mesh(g); m.position.set(0,TUBE_Y,sz*TUBE_Z); parts.push(m);
  }
  return bakeParts(parts,null);
})();
/* the guard grid: 12 × 6 cells at a ~0.22m pitch of 16mm round bar, all twenty
   rods merged into one buffer. Every rod is turned the SAME way about its own
   axis — rotateZ then rotateY for the cross runs — so that texLouvre's wrap
   puts u=0.25 (its bright side) on top of every one of them, facing the lamps.
   Getting that inconsistent lights half the grid from underneath. */
const louvreGeo=(()=>{
  const NX=12, NY=6, parts=[];
  const rod=(len,cross)=>{
    const g=new THREE.CylinderGeometry(ROD_R,ROD_R,len,8,1,true);
    g.rotateZ(Math.PI/2);                              // lie along x
    if(cross) g.rotateY(Math.PI/2);                    // …or along z, same way up
    return g;
  };
  /* the two families are one bar-diameter apart in y, because a welded grid is
     welded: bars at the same height interpenetrate, and every crossing then
     eats a bite out of whichever run is behind it — the long runs came out
     visibly DASHED. Long runs up against the lamps, cross bars under them. */
  for(let i=0;i<=NX;i++){
    const m=new THREE.Mesh(rod(FD,true)); m.position.set(-FW/2+i*(FW/NX),ROD_Y,0); parts.push(m);
  }
  for(let j=0;j<=NY;j++){
    const m=new THREE.Mesh(rod(FW,false)); m.position.set(0,ROD_Y+2*ROD_R,-FD/2+j*(FD/NY)); parts.push(m);
  }
  return bakeParts(parts,null);
})();
/* the backplate stops short of the side walls so its edge can't poke through
   them; the walls close the gap from below */
const glowGeo=new THREE.PlaneGeometry(FW-2*SHEET,FD-2*SHEET);
markShared(tubeTex,warmTubeTex,texGalv,texReflector,texLouvre,
           shellGeo,holderGeo,tubeGeo,louvreGeo,glowGeo,housingSide,holderMat);
/* the TUBES are the light source — the housing interior only catches spill,
   so every backplate sits darker than its tubes: a faint glow on dying
   fixtures, a brighter (but still secondary) wash on healthy ones.
   glowMat = backplate, tubeMat = tubes, louvMat = the guard rods; all three
   stay per-fixture (lights.js drives their colors every frame), created fresh
   here and disposed with the level. */
function makeTroffer(warm){
  const glowMat=new THREE.MeshBasicMaterial({map:texReflector,
    color: warm?0x4d3419:0xb8b2a2});
  const tubeMat=new THREE.MeshBasicMaterial({map: warm? warmTubeTex:tubeTex,
                                             color: warm?0xffffff:0xfff6cf});
  /* painted steel a few centimetres under a burning lamp: lights.js drives
     the emissive so the rods go dark WITH the fixture instead of hanging
     there lit under a dead one */
  const louvMat=new THREE.MeshPhongMaterial({map:texLouvre,emissiveMap:texLouvre,
    color:0x33322d,emissive:0x000000,specular:0x8e8b80,shininess:70});
  const fix=new THREE.Group();
  /* the whole fixture rides up by RISE — see the header: the ceiling has a
     hole cut for it, so everything above WALL_H is seen THROUGH that hole */
  const add=(geo,mat,y)=>{ const m=new THREE.Mesh(geo,mat); m.position.y=WALL_H+RISE+(y||0); fix.add(m); return m; };
  add(shellGeo,housingSide);
  add(holderGeo,holderMat);
  const backplate=add(glowGeo,glowMat,-0.016);   // right under the pan
  backplate.rotation.x=Math.PI/2;
  add(tubeGeo,tubeMat);
  add(louvreGeo,louvMat);
  return {fix, glowMat, tubeMat, louvMat};
}
/* ---------------- the ceiling field ----------------
   One plane with a texture on it can't hold a recessed fixture: the plane is
   opaque and 8cm of the troffer lives above it. So the field is emitted as a
   quad grid — one quad per cell, and the cells carrying a fixture emit the
   four border strips around a cut opening instead. UVs come straight from
   world position, so the tiling runs across the joins exactly as the single
   plane's did, and the whole thing is still one draw call.
   Winding: (B−A)×(C−A) has to come out (0,−1,0) or the field faces up into
   the void and the level has no ceiling at all. */
function ceilingGeometry(SZ,openings){
  const pos=[],uv=[],nor=[],idx=[];
  const quad=(x0,z0,x1,z1)=>{
    const b=pos.length/3;
    for(const[x,z]of[[x0,z0],[x1,z0],[x1,z1],[x0,z1]]){
      pos.push(x,0,z); nor.push(0,-1,0);
      uv.push((x+SZ/2)/SZ,(z+SZ/2)/SZ);
    }
    idx.push(b,b+1,b+2, b,b+2,b+3);
  };
  const half=SZ/2;
  for(let cz=0;cz<H;cz++)for(let cx=0;cx<W;cx++){
    const x0=-half+cx*CELL, z0=-half+cz*CELL, x1=x0+CELL, z1=z0+CELL;
    const o=openings.get(cz*W+cx);
    if(!o){ quad(x0,z0,x1,z1); continue; }
    const ox0=o.x-o.w/2, ox1=o.x+o.w/2, oz0=o.z-o.d/2, oz1=o.z+o.d/2;
    quad(x0,z0,x1,oz0);            // the four strips around the hole
    quad(x0,oz1,x1,z1);
    quad(x0,oz0,ox0,oz1);
    quad(ox1,oz0,x1,oz1);
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute("position",new THREE.Float32BufferAttribute(pos,3));
  geo.setAttribute("normal",new THREE.Float32BufferAttribute(nor,3));
  geo.setAttribute("uv",new THREE.Float32BufferAttribute(uv,2));
  geo.setIndex(idx);
  return geo;
}

export function buildLevel(){
  genMap();
  wallMeshes=new Map();
  wallDecals=[];
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
      wallMeshes.set(y*W+x,m);
    }
  }
  const SZ=W*CELL;
  /* The ceiling repeats once per CELL, which puts its four tiles at 1m — the
     classic drop-tile size. The carpet keeps its original 8m tile. */
  texCarpet.repeat.set(W/2,H/2);
  texCeil.repeat.set(W,H); texCeilBump.repeat.set(W,H);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(SZ,SZ),
    new THREE.MeshPhongMaterial({map:texCarpet, specular:0x000000, shininess:1}));
  floor.rotation.x=-Math.PI/2; scene.add(floor);
  /* stain overlay tiles at a non-integer rate so it never aligns with the carpet */
  texStains.repeat.set(5.13,4.71);
  const stains=new THREE.Mesh(new THREE.PlaneGeometry(SZ,SZ),
    new THREE.MeshPhongMaterial({map:texStains, transparent:true, depthWrite:false,
      specular:0x000000, shininess:1}));
  stains.rotation.x=-Math.PI/2; stains.position.y=0.015; scene.add(stains);
  /* ---- where the troffers go ----
     Decided BEFORE the ceiling is built, because each one needs an opening cut
     for it. ~30% of fixture slots stay dark. A truly independent per-slot roll
     produces runs of adjacent misses, which read as whole missing ROWS at this
     8m slot spacing — so a slot may only go dark if its left and up neighbors
     spawned, and the base rate is raised to keep net density near 30%. Same
     average, no long gaps. */
  const slots=[], openings=new Map();
  const darkSlots=new Set(), slotKey=(sx,sy)=>sy*W+sx;
  for(let y=1;y<H-1;y+=2)for(let x=1;x<W-1;x+=2){
    if(grid[y][x]!==0) continue;
    if(Math.random()<0.55 && !darkSlots.has(slotKey(x-2,y)) && !darkSlots.has(slotKey(x,y-2))){
      darkSlots.add(slotKey(x,y));
      continue;
    }
    /* ~10% of fixtures are end-of-life: warm orange, half brightness,
       slower dim-down cycles instead of random flicker bursts */
    const p=cellToWorld(x,y);
    slots.push({x,y,p,warm:Math.random()<0.10});
    openings.set(y*W+x,{x:p.x,z:p.z,w:FW+2*OPEN_C,d:FD+2*OPEN_C});
  }
  const ceil=new THREE.Mesh(ceilingGeometry(SZ,openings),
    /* 0.008, down from 0.012: with the tile face carrying real fibre relief
       now, the old scale turned the fissures into raised veins */
    new THREE.MeshPhongMaterial({map:texCeil, bumpMap:texCeilBump, bumpScale:0.008,
      specular:0x050503, shininess:2}));
  ceil.position.y=WALL_H; scene.add(ceil);
  /* rare water stains: overlay tiled at a non-integer rate (same trick as
     the carpet stains) so they never line up with the tile grid. It takes the
     same openings — a full sheet 12mm under the ceiling would hang across
     every fixture's mouth as a translucent film. */
  texCeilStains.repeat.set(4.07,3.77);
  const ceilStains=new THREE.Mesh(ceilingGeometry(SZ,openings),
    new THREE.MeshPhongMaterial({map:texCeilStains, transparent:true, depthWrite:false,
      specular:0x000000, shininess:1}));
  ceilStains.position.y=WALL_H-0.012; scene.add(ceilStains);

  /* ---- slime-mold at the baseboards ----
     Each colony is a UNIQUE procedural growth on a paired wall+floor
     texture (width 20–80% of a wall section, height locked to 3.3–5.5:1).
     Placement is a global lottery: shuffled candidate faces are taken until
     the quota is met, skipping any face whose 3×3 cell neighbourhood
     already hosts a colony — spreads mold across the map instead of
     clustering while raising the total count (a skipped face simply
     re-rolls to the next shuffled candidate).
     A colony may sit anywhere along its section, INCLUDING overhanging an
     edge: it then continues onto the co-planar neighbour wall, or wraps
     around a convex/concave corner — the texture is sliced at the fold so
     it reads as one organism bending around the geometry. */
  const moldMat=t=>new THREE.MeshPhongMaterial({map:t,
    transparent:true, depthWrite:false, specular:0x000000, shininess:1});
  const E=CELL/2;
  const moldFaces=[];
  for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){
    if(grid[y][x]!==0) continue;
    for(const[dx,dz]of[[1,0],[-1,0],[0,1],[0,-1]])
      if(isWall(x+dx,y+dz)) moldFaces.push({x,y,dx,dz});
  }
  for(let i=moldFaces.length-1;i>0;i--){
    const j=(Math.random()*(i+1))|0; [moldFaces[i],moldFaces[j]]=[moldFaces[j],moldFaces[i]];
  }
  const moldCells=new Set(), mKey=(cx,cy)=>cy*W+cx;
  let quota=Math.round(moldFaces.length*0.5);
  for(const fc of moldFaces){
    if(quota<=0) break;
    let near=false;
    for(let by=-1;by<=1&&!near;by++)for(let bx=-1;bx<=1&&!near;bx++)
      if(moldCells.has(mKey(fc.x+bx,fc.y+by))) near=true;
    if(near) continue;
    const {x,y,dx,dz}=fc;
    const p=cellToWorld(x,y);
    const wid=CELL*rand(0.20,0.80);
    const hgt=clamp(wid*rand(0.18,0.30), WALL_H*0.04, WALL_H*0.18);
    const dep=WALL_H*rand(0.025,0.06);
    /* anywhere along the section — overhang past the edge becomes the
       continued/wrapped part */
    let off=rand(-1,1)*(E-0.3);
    const s=off>=0?1:-1;                                  // side it may overhang
    let o=s*off+wid/2-E;                                  // overhang length
    const lcx=dx?0:s, lcy=dx?s:0;                         // lateral cell step
    let mode="none";
    if(o>0.12){
      o=Math.min(o,CELL*0.45);
      if(isWall(x+lcx,y+lcy)) mode="concave";             // wall turns INTO the room
      else if(isWall(x+dx+lcx,y+dz+lcy)) mode="coplanar"; // wall plane keeps going
      else mode="convex";                                 // wall ends — wrap its side
    } else { off-=s*Math.max(0,o); o=0; }                 // tuck fully inside
    const tex=makeMoldTextures(wid,hgt,dep);
    const ry = dx? (dx>0?-Math.PI/2:Math.PI/2) : (dz>0?Math.PI:0);
    const fzMain = dx>0?-Math.PI/2 : dx<0?Math.PI/2 : dz>0?Math.PI : 0;
    const addWall=(t,wd,wx,wz,rot,keys)=>{
      const mm=new THREE.Mesh(new THREE.PlaneGeometry(wd,hgt),moldMat(t));
      mm.position.set(wx,hgt/2,wz); mm.rotation.y=rot;
      mm.userData.wallKeys=keys; wallDecals.push(mm); scene.add(mm);
    };
    const addFloor=(t,wd,wx,wz,rot,keys)=>{
      const ff=new THREE.Mesh(new THREE.PlaneGeometry(wd,dep),moldMat(t));
      /* Euler XYZ applies Z first: spin so the dense edge meets its wall,
         then X lays it flat on the carpet */
      ff.rotation.x=-Math.PI/2; ff.rotation.z=rot;
      ff.position.set(wx,0.022,wz);
      ff.userData.wallKeys=keys; wallDecals.push(ff); scene.add(ff);
    };
    /* main segment, clipped at the fold when wrapping */
    const wrap = mode==="convex"||mode==="concave";
    const w1 = wrap? wid-o : wid;
    const t1 = wrap? s*(E-w1/2) : off;
    /* which texture-u end the overhang lives on: u runs +z,−z,−x,+x for the
       four face directions (plane local +x after its Y-rotation) */
    const overAtU1 = (dx? dx*s : -dz*s) > 0;
    const q=o/wid;
    const wallT = wrap? sliceTexture(tex.wall,  overAtU1?0:q, overAtU1?1-q:1) : tex.wall;
    const floorT= wrap? sliceTexture(tex.floor, overAtU1?0:q, overAtU1?1-q:1) : tex.floor;
    /* wall-cell tags: the main face; a coplanar overhang also lies on the
       neighbour's wall */
    const kMain=mKey(x+dx,y+dz);
    const keysMain = mode==="coplanar"? [kMain,mKey(x+lcx+dx,y+lcy+dz)] : [kMain];
    if(dx){ addWall(wallT,w1, p.x+dx*(E-0.02), p.z+t1, ry, keysMain);
            addFloor(floorT,w1, p.x+dx*(E-dep/2-0.025), p.z+t1, fzMain, keysMain); }
    else  { addWall(wallT,w1, p.x+t1, p.z+dz*(E-0.02), ry, keysMain);
            addFloor(floorT,w1, p.x+t1, p.z+dz*(E-dep/2-0.025), fzMain, keysMain); }
    if(wrap){
      /* the wrapped remainder on the perpendicular face */
      const Sx=dx?0:s, Sz=dx?s:0;                         // lateral world axis
      const conv = mode==="convex";
      const Nx=conv?Sx:-Sx, Nz=conv?Sz:-Sz;               // wrap plane normal
      const Cx=conv?dx:-dx, Cz=conv?dz:-dz;               // direction away from the fold
      const ryW = Nx>0? Math.PI/2 : Nx<0? -Math.PI/2 : Nz>0? 0 : Math.PI;
      const fzW = -Nx>0? -Math.PI/2 : -Nx<0? Math.PI/2 : -Nz>0? Math.PI : 0;
      /* u-axis of the wrap plane in world; mirror the strip if it runs back
         toward the fold so the cut edges stay glued together */
      const Ux=Nz, Uz=-Nx;
      const flip = overAtU1? (Ux*Cx+Uz*Cz)<0 : (Ux*Cx+Uz*Cz)>0;
      const wallW = sliceTexture(tex.wall,  overAtU1?1-q:0, overAtU1?1:q, flip);
      const floorW= sliceTexture(tex.floor, overAtU1?1-q:0, overAtU1?1:q, flip);
      const dA = conv? E+o/2 : E-o/2;                     // distance along the face direction
      const sWall = conv? E+0.02 : E-0.02;                // wrap plane offsets on the lateral axis
      const sFloor= conv? E+dep/2+0.012 : E-dep/2-0.012;
      /* convex wraps stay on the same wall box (its side face); concave
         wraps land on the lateral wall cell */
      const keysWrap = conv? [kMain] : [mKey(x+lcx,y+lcy)];
      addWall(wallW,o, p.x+dx*dA+Sx*sWall, p.z+dz*dA+Sz*sWall, ryW, keysWrap);
      addFloor(floorW,o, p.x+dx*dA+Sx*sFloor, p.z+dz*dA+Sz*sFloor, fzW, keysWrap);
      if(conv) moldCells.add(mKey(x+dx+lcx,y+dz+lcy));    // the wrap lives in that open cell
    }
    if(mode==="coplanar") moldCells.add(mKey(x+lcx,y+lcy));
    moldCells.add(mKey(x,y));
    quota--;
  }

  /* ---- ceiling-leak drips ----
     periodic brown water stains running from the ceiling seam down the
     wall, each with its own small feed blotch on the ceiling above it.
     Reuses the shuffled face lottery; the 3×3 spacing rule keeps leaks
     scattered rather than clustered. Mold and drips may share a wall —
     one lives at the baseboard, the other at the ceiling. */
  const dripMat=t=>new THREE.MeshPhongMaterial({map:t,
    transparent:true, depthWrite:false, specular:0x000000, shininess:1});
  const dripCells=new Set();
  let dQuota=Math.max(40,Math.round(moldFaces.length*0.20));   // 4× the original count
  for(const fc of moldFaces){
    if(dQuota<=0) break;
    let near=false;
    for(let by=-1;by<=1&&!near;by++)for(let bx=-1;bx<=1&&!near;bx++)
      if(dripCells.has(mKey(fc.x+bx,fc.y+by))) near=true;
    if(near) continue;
    const {x,y,dx,dz}=fc;
    const p=cellToWorld(x,y);
    const wid=rand(0.5,1.56);                                  // 2× base, +30% max width
    const len=Math.min(WALL_H*0.99, rand(1.98,5.72));          // 2× base, +10% height
    const off=rand(-1,1)*(E-wid/2-0.2);          // anywhere along the section, fully inside
    const tex=makeDripTextures(wid,len);
    const ry = dx? (dx>0?-Math.PI/2:Math.PI/2) : (dz>0?Math.PI:0);
    const wp=new THREE.Mesh(new THREE.PlaneGeometry(wid,len),dripMat(tex.wall));
    wp.position.set(dx? p.x+dx*(E-0.03) : p.x+off,
                    WALL_H-len/2,
                    dx? p.z+off : p.z+dz*(E-0.03));
    wp.rotation.y=ry;
    wp.userData.wallKeys=[mKey(x+dx,y+dz)]; wallDecals.push(wp);
    scene.add(wp);
    /* the ceiling blotch sits against the wall, directly over the run */
    const cw=wid*rand(1.1,1.6), cd=rand(0.36,0.8);
    const cp=new THREE.Mesh(new THREE.PlaneGeometry(cw,cd),dripMat(tex.ceil));
    cp.rotation.x=Math.PI/2;
    cp.rotation.z = dx? (dx>0?-Math.PI/2:Math.PI/2) : (dz>0?Math.PI:0);
    cp.position.set(dx? p.x+dx*(E-cd/2-0.04) : p.x+off,
                    WALL_H-0.022,
                    dx? p.z+off : p.z+dz*(E-cd/2-0.04));
    cp.userData.wallKeys=[mKey(x+dx,y+dz)]; wallDecals.push(cp);
    scene.add(cp);
    dripCells.add(mKey(x,y));
    dQuota--;
  }

  /* fluorescent troffers (built by makeTroffer above) into the slots chosen
     up at the top of the build, where the ceiling took its openings from */
  for(const {x,y,p,warm} of slots){
    const f=makeTroffer(warm);
    f.fix.position.set(p.x,0,p.z);
    scene.add(f.fix);
    /* healthy panels idle at 85–100% of max; dimY (0 at full, 1 at the
       floor) faintly yellows the dimmer ones — same idea as the dying
       tubes' orange gradient, far subtler */
    lights.push(makeLightRecord(f.glowMat,f.tubeMat,x,y,p,{warm,louvMat:f.louvMat}));
  }
}
