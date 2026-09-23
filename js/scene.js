/* ---------------- three.js scene & level geometry ---------------- */
import { rand, clamp } from "./utils.js";
import { W, H, CELL, WALL_H, grid, genMap, cellToWorld, isWall } from "./map.js";
import { texWall, texCarpet, texCarpetPile, texStains, texCeil, texCeilBump, texCeilStains, texCeilFoam, texMoldGrain,
         makeMoldTextures, makeDripTextures, sliceTexture, makeSpillTexture,
         makeTubeTexture, texGalv, texReflector, texLouvre, scaleBoxUV } from "./textures.js";
import { $ } from "./utils.js";
import { readSettings } from "./settings.js";

/* every lit pixel walked all thirty pool lights, though each reaches 11m and
   the unbound ones are dark. Past its distance a light's falloff is exactly
   zero and a black one adds nothing, so skipping them changes no pixel and
   roughly halves the lighting cost. three unrolls this loop, which cannot
   branch round a light, so it is kept a loop (nothing here casts shadows,
   the only other thing the block did), and three's own irradiance function
   is written out in it: called inside a real loop, its early return makes
   the D3D compiler warn on every shader. */
{
  const c=THREE.ShaderChunk.lights_fragment_begin;
  const a=c.indexOf("\t#pragma unroll_loop_start\n\tfor ( int i = 0; i < NUM_POINT_LIGHTS; i ++ ) {");
  const b=a<0? -1 : c.indexOf("\t#pragma unroll_loop_end",a);
  if(b>0) THREE.ShaderChunk.lights_fragment_begin=c.slice(0,a)+
`	for ( int i = 0; i < NUM_POINT_LIGHTS; i ++ ) {
		pointLight = pointLights[ i ];
		vec3 lv = pointLight.position - geometry.position;
		float ld = length( lv );
		if ( ( pointLight.distance <= 0.0 || ld <= pointLight.distance ) && pointLight.color != vec3( 0.0 ) ) {
		#if defined( PHYSICALLY_CORRECT_LIGHTS )
			getPointDirectLightIrradiance( pointLight, geometry, directLight );
		#else
			directLight.direction = normalize( lv );
			directLight.color = pointLight.color * ( ( pointLight.distance > 0.0 && pointLight.decay > 0.0 )
				? pow( saturate( -ld / pointLight.distance + 1.0 ), pointLight.decay ) : 1.0 );
			directLight.visible = ( directLight.color != vec3( 0.0 ) );
		#endif
			RE_Direct( directLight, geometry, material, reflectedLight );
		}
	}
`+c.slice(b+"\t#pragma unroll_loop_end".length);
}
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
markShared(texWall,texCarpet,texCarpetPile,texStains,texCeil,texCeilBump,texCeilStains,texCeilFoam,texMoldGrain);
/* the walls and ceiling are mostly seen at a grazing angle, which is
   exactly where an isotropic mip chain smears a 1024² map into mud */
const ANISO=Math.min(_lowQ?4:8, renderer.capabilities.getMaxAnisotropy());
for(const t of[texWall,texCarpetPile,texCeil,texCeilBump,texCeilStains,texCeilFoam,texMoldGrain]) t.anisotropy=ANISO;
const _MAT_MAPS=["map","alphaMap","aoMap","bumpMap","displacementMap","emissiveMap",
  "envMap","lightMap","metalnessMap","normalMap","roughnessMap","specularMap","gradientMap"];
/* the material itself is NOT disposed. Disposing releases its shader
   program, three destroys a program with its last material, and so every
   rebuild recompiled every shader — 35–60ms apiece, one after another, which
   was most of a respawn. Left to the garbage collector, the program stays
   linked and the rebuilt level's materials pick it straight back up. */
function disposeMaterial(m,done){
  if(!m||SHARED.has(m)||done.has(m)) return;
  done.add(m);
  for(const k of _MAT_MAPS){ const t=m[k]; if(t&&!SHARED.has(t)&&!done.has(t)){ done.add(t); t.dispose(); } }
}
function disposeNode(o,done){
  const g=o.geometry;
  if(g&&!SHARED.has(g)&&!done.has(g)){ done.add(g); g.dispose(); }
  /* a skeleton owns a float texture of its bone matrices */
  if(o.isSkinnedMesh&&o.skeleton&&!done.has(o.skeleton)){ done.add(o.skeleton); if(o.skeleton.dispose) o.skeleton.dispose(); }
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
  /* extrusions and lathes arrive non-indexed; they index themselves in order */
  for(const g of geos){ vc+=g.attributes.position.count; ic+=g.index? g.index.count : g.attributes.position.count; }
  const pos=new Float32Array(vc*3), nor=new Float32Array(vc*3), uv=new Float32Array(vc*2);
  const idx=(vc>65535? new Uint32Array(ic):new Uint16Array(ic));
  let vo=0, io=0;
  for(const g of geos){
    pos.set(g.attributes.position.array, vo*3);
    nor.set(g.attributes.normal.array, vo*3);
    uv.set(g.attributes.uv.array, vo*2);
    const n=g.attributes.position.count;
    if(g.index){ const gi=g.index.array; for(let i=0;i<gi.length;i++) idx[io+i]=gi[i]+vo; io+=gi.length; }
    else { for(let i=0;i<n;i++) idx[io+i]=vo+i; io+=n; }
    vo+=n;
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
/* Regroup every static opaque mesh left standing on its own by material and
   merge each group — books, bookends, ladders, fixture shells, furniture —
   so a room of two thousand small meshes draws in a couple of hundred calls.
   `region` (metres) optionally splits the buckets by floor area so a far
   corner can still be frustum-culled. A mesh only goes in if EVERY material it wears
   is opaque and shared by at least one other mesh; transparent layers keep
   their own draw order, and anything tagged persist/animated/noBatch (or
   hidden) is left exactly where it is, subtree and all. */
const _bv=new THREE.Vector3(), _bn=new THREE.Vector3(), _nm=new THREE.Matrix3();
export function batchStatic(root,region=0){
  root.updateMatrixWorld(true);
  const cand=[];
  const walk=o=>{
    if(o.userData.persist||o.userData.animated||o.userData.noBatch||!o.visible) return;
    if(o.isMesh&&!o.isInstancedMesh&&!o.isSkinnedMesh&&o.geometry.attributes.normal){
      const mats=Array.isArray(o.material)? o.material : [o.material];
      if(mats.every(m=>m&&!m.transparent&&!m.userData.noBatch&&!m.vertexColors)) cand.push(o);
    }
    for(const c of o.children) walk(c);
  };
  walk(root);
  /* how many meshes wear each material: a singleton gains nothing */
  const uses=new Map();
  for(const o of cand){
    const mats=Array.isArray(o.material)? o.material : [o.material];
    for(const m of new Set(mats)) uses.set(m,(uses.get(m)||0)+1);
  }
  const buckets=new Map();
  const taken=[];
  for(const o of cand){
    const mats=Array.isArray(o.material)? o.material : [o.material];
    if(!mats.every(m=>uses.get(m)>1)) continue;
    const g=o.geometry;
    const groups=Array.isArray(o.material)&&g.groups.length? g.groups
      : [{start:0, count:g.index? g.index.count : g.attributes.position.count, materialIndex:0}];
    const e=o.matrixWorld.elements;
    const rk=region>0? Math.floor(e[12]/region)+":"+Math.floor(e[14]/region) : "";
    for(const gr of groups){
      const m=mats[gr.materialIndex||0]; if(!m) continue;
      const key=m.uuid+"|"+rk;
      let b=buckets.get(key);
      if(!b){ b={mat:m, parts:[], vc:0, ic:0}; buckets.set(key,b); }
      b.parts.push({o,gr}); b.ic+=gr.count;
    }
    taken.push(o);
  }
  const takenSet=new Set(taken), keep=new Set();
  root.traverse(o=>{ if(o.isMesh&&!takenSet.has(o)) keep.add(o.geometry); });
  let made=0;
  for(const b of buckets.values()){
    /* vertices are remapped per part, so the merge stays indexed */
    const pos=[], nor=[], uv=[], idx=new Uint32Array(b.ic);
    let vc=0, io=0;
    for(const {o,gr} of b.parts){
      const g=o.geometry, P=g.attributes.position, N=g.attributes.normal, U=g.attributes.uv, I=g.index;
      _nm.getNormalMatrix(o.matrixWorld);
      const remap=new Int32Array(P.count).fill(-1);
      const flip=o.matrixWorld.determinant()<0;          // a mirror turns every triangle inside out
      for(let k=gr.start;k<gr.start+gr.count;k++){
        const i=I? I.getX(k) : k;
        if(remap[i]<0){
          remap[i]=vc++;
          _bv.fromBufferAttribute(P,i).applyMatrix4(o.matrixWorld);
          _bn.fromBufferAttribute(N,i).applyMatrix3(_nm).normalize();
          pos.push(_bv.x,_bv.y,_bv.z); nor.push(_bn.x,_bn.y,_bn.z);
          uv.push(U? U.getX(i):0, U? U.getY(i):0);
        }
        idx[io++]=remap[i];
        if(flip&&(k-gr.start)%3===2){ const t=idx[io-1]; idx[io-1]=idx[io-2]; idx[io-2]=t; }
      }
    }
    const geo=new THREE.BufferGeometry();
    geo.setAttribute("position",new THREE.Float32BufferAttribute(pos,3));
    geo.setAttribute("normal",new THREE.Float32BufferAttribute(nor,3));
    geo.setAttribute("uv",new THREE.Float32BufferAttribute(uv,2));
    geo.setIndex(new THREE.BufferAttribute(vc>65535? idx : Uint16Array.from(idx),1));
    geo.computeBoundingSphere();
    scene.add(freezeStatic(new THREE.Mesh(geo,b.mat)));
    made++;
  }
  for(const o of taken){
    if(o.parent) o.parent.remove(o);
    const g=o.geometry;
    if(!SHARED.has(g)&&!keep.has(g)){ keep.add(g); g.dispose(); }
  }
  return {merged:taken.length, draws:made};
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
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(SZ,SZ),carpetMaterial());
  floor.rotation.x=-Math.PI/2; scene.add(floor);
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
  const ceil=new THREE.Mesh(ceilingGeometry(SZ,openings),ceilingMaterial());
  ceil.position.y=WALL_H; scene.add(ceil);
  /* rare water stains: overlay tiled at a non-integer rate (same trick as
     the carpet stains) so they never line up with the tile grid. It takes the
     same openings — a full sheet 12mm under the ceiling would hang across
     every fixture's mouth as a translucent film. */

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
  const spill=[];
  for(const {x,y,p,warm} of slots){
    const f=makeTroffer(warm);
    f.fix.position.set(p.x,0,p.z);
    scene.add(f.fix);
    /* healthy panels idle at 85–100% of max; dimY (0 at full, 1 at the
       floor) faintly yellows the dimmer ones — same idea as the dying
       tubes' orange gradient, far subtler */
    lights.push(makeLightRecord(f.glowMat,f.tubeMat,x,y,p,{warm,louvMat:f.louvMat}));
    spill.push({p,mat:f.tubeMat,warm});
  }
  const sp=spillMesh(spill); sp.renderOrder=LAYER_SPILL; scene.add(sp);
}
/* ---- the carpet ----
   The original map, and over it the PILE (texCarpetPile) at its own 0.5m
   repeat: multiplied into the colour and used as the bump map, both at that
   fine scale, so the tufts shade as tufts under a lamp. three's maps all
   share the colour map's UVs, so the bump chunk is rewritten to sample the
   pile's own coordinates. Divided by its mean, the pile is a no-op wherever
   the mip chain has averaged it out. Matte, deliberately: a sheen on carpet
   is what turns it into sealed concrete. */
const PILE_REP=16;                           // per carpet tile (8m) → 0.5m of pile
/* the water stains, floor and ceiling, repeat at non-integer rates across the
   level so they never line up with the carpet's tile or the ceiling grid. They
   were transparent sheets laid over both surfaces, which shaded every floor and
   ceiling pixel twice — about half the frame once the lighting was trimmed —
   so each is blended into its surface's own shader instead: the same mix, and
   under a stain the ceiling's faint sheen is covered as the sheet covered it. */
const STAIN_REP=[5.13,4.71], CSTAIN_REP=[4.07,3.77];
function carpetMaterial(){
  const m=new THREE.MeshPhongMaterial({map:texCarpet, bumpMap:texCarpetPile, bumpScale:0.0035,
    specular:0x000000, shininess:1});
  m.onBeforeCompile=sh=>{
    sh.uniforms.uPile={value:texCarpetPile};
    sh.uniforms.uPileRep={value:PILE_REP};
    sh.uniforms.uPileMean={value:texCarpetPile.mean};
    sh.uniforms.uStains={value:texStains};
    sh.uniforms.uStainRep={value:new THREE.Vector2(STAIN_REP[0]/(W/2),STAIN_REP[1]/(H/2))};
    sh.vertexShader=sh.vertexShader
      .replace("#include <common>","#include <common>\nuniform float uPileRep;\nvarying vec2 vPileUv;")
      .replace("#include <uv_vertex>","#include <uv_vertex>\n  vPileUv=vUv*uPileRep;");
    sh.fragmentShader=sh.fragmentShader
      .replace("#include <common>","#include <common>\nuniform sampler2D uPile;\nuniform float uPileMean;\nuniform sampler2D uStains;\nuniform vec2 uStainRep;\nvarying vec2 vPileUv;")
      .replace("#include <bumpmap_pars_fragment>",THREE.ShaderChunk.bumpmap_pars_fragment.replace(/vUv/g,"vPileUv"))
      .replace("#include <map_fragment>",
        "#include <map_fragment>\n  diffuseColor.rgb*=mix(1.0,texture2D(uPile,vPileUv).r/uPileMean,0.42);\n"+
        "  { vec4 st=texture2D(uStains,vUv*uStainRep); diffuseColor.rgb=mix(diffuseColor.rgb,st.rgb,st.a); }");
  };
  return m;
}
/* three's bump chunk with the height's derivative supplied by the caller:
   the stock one can only read bumpMap at the colour map's UVs */
const bumpChunk=dH=>{
  const c=THREE.ShaderChunk.bumpmap_pars_fragment;
  const a=c.indexOf("vec2 dHdxy_fwd()"), b=c.indexOf("vec3 perturbNormalArb");
  return c.slice(0,a)+"vec2 dHdxy_fwd(){\n"+dH+"\n}\n"+c.slice(b);
};
/* ---- the ceiling ----
   texCeil/texCeilBump carry the grid and each tile's tone; texCeilFoam is
   the face at 1 px/mm. Every 1m tile takes the foam at its own quarter-turn
   and offset (hashed off its index) so no two tiles match, and it is masked
   off the tee, which is steel and which hides the cut between tiles. */
const FOAM_REV=0.034;                        // tee + reveal half-width, in tiles
function ceilingMaterial(){
  const m=new THREE.MeshPhongMaterial({map:texCeil, bumpMap:texCeilBump, bumpScale:0.008,
    specular:0x050503, shininess:2});
  m.onBeforeCompile=sh=>{
    sh.uniforms.uFoam={value:texCeilFoam};
    sh.uniforms.uFoamMean={value:texCeilFoam.mean};
    sh.uniforms.uStains={value:texCeilStains};
    sh.uniforms.uStainRep={value:new THREE.Vector2(CSTAIN_REP[0]/W,CSTAIN_REP[1]/H)};
    sh.fragmentShader=sh.fragmentShader
      .replace("#include <common>",`#include <common>
uniform sampler2D uFoam;
uniform float uFoamMean;
uniform sampler2D uStains;
uniform vec2 uStainRep;
vec2 foamUv;
float foamK;
float stainA;`)
      .replace("#include <lights_fragment_end>",
        "#include <lights_fragment_end>\n  reflectedLight.directSpecular*=1.0-stainA;")
      .replace("#include <bumpmap_pars_fragment>",bumpChunk(`
  vec2 dSTdx=dFdx(vUv), dSTdy=dFdy(vUv);
  float Hll=bumpScale*texture2D(bumpMap,vUv).x;
  float dBx=bumpScale*texture2D(bumpMap,vUv+dSTdx).x-Hll;
  float dBy=bumpScale*texture2D(bumpMap,vUv+dSTdy).x-Hll;
  vec2 fx=dFdx(foamUv), fy=dFdy(foamUv);
  float F=texture2D(uFoam,foamUv).r, fb=0.008*foamK;
  return vec2(dBx+fb*(texture2D(uFoam,foamUv+fx).r-F), dBy+fb*(texture2D(uFoam,foamUv+fy).r-F));`))
      .replace("#include <map_fragment>",`{
    vec2 t=vUv*4.0, id=floor(t), l=fract(t);
    float hs=fract(sin(dot(id,vec2(12.9898,78.233)))*43758.5453);
    float k=floor(hs*4.0);
    vec2 r=k<1.0? l : k<2.0? vec2(1.0-l.y,l.x) : k<3.0? 1.0-l : vec2(l.y,1.0-l.x);
    foamUv=r+vec2(fract(hs*7.13),fract(hs*3.71));
    float de=min(min(l.x,1.0-l.x),min(l.y,1.0-l.y));
    foamK=smoothstep(${FOAM_REV.toFixed(3)},${(FOAM_REV+0.01).toFixed(3)},de);
  }
  #include <map_fragment>
  diffuseColor.rgb*=mix(1.0,texture2D(uFoam,foamUv).r/uFoamMean,0.3*foamK);
  { vec4 cs=texture2D(uStains,vUv*uStainRep); stainA=cs.a; diffuseColor.rgb=mix(diffuseColor.rgb,cs.rgb,stainA); }`);
  };
  return m;
}
/* slime is wet: a tight dull glint where a lamp catches it, on every colony
   crown the grain raises */
function moldMat(t){
  const m=new THREE.MeshPhongMaterial({map:t, bumpMap:texMoldGrain, bumpScale:0.004,
    transparent:true, depthWrite:false, specular:0x1c2216, shininess:38});
  m.onBeforeCompile=moldCompile;
  return m;
}
const dripMat=t=>new THREE.MeshPhongMaterial({map:t,
  transparent:true, depthWrite:false, specular:0x000000, shininess:1});
/* transparent layers that lie ON a surface draw before everything that
   floats in front of one: the ceiling spill, then the decals, then (at 0,
   depth-sorted) the entity's aura, glass and the rest. The merged decals and
   the spill both sit at the origin, so a depth sort alone would put them in
   front of or behind the aura depending on where you stood. */
const LAYER_SPILL=-2, LAYER_DECAL=-1;
/* ---- the decals, packed ----
   Every colony and leak grows on its own canvas, and drawn that way each was
   its own material: ~300 draws a frame, each re-uploading the whole 30-light
   uniform block — half the frame, CPU and GPU — and ~300 texture uploads at
   build. Once the elevator has carved its wall they are packed into shared
   atlas pages, each canvas ringed by copies of its own edge pixels (which is
   what ClampToEdge gave it on its own), and merged into one mesh a page. */
const ATLAS=2048, APAD=2;
export function mergeDecals(){
  const kinds={mold:[], drip:[]};
  for(const m of wallDecals) kinds[m.material.onBeforeCompile===moldCompile? "mold":"drip"].push(m);
  for(const[kind,list]of Object.entries(kinds)){
    list.sort((a,b)=>b.material.map.image.height-a.material.map.image.height);
    /* lay out first, so each page is only as tall as what went on it */
    const pages=[]; let pg=null, x=0, y=0, rowH=0;
    const newPage=()=>{ pg={items:[], h:0}; pages.push(pg); x=0; y=0; rowH=0; };
    newPage();
    for(const m of list){
      const src=m.material.map.image, w=src.width, h=src.height;
      if(x+w+2*APAD>ATLAS){ x=0; y+=rowH; rowH=0; }
      if(y+h+2*APAD>ATLAS) newPage();
      pg.items.push({m,src,w,h,X:x+APAD,Y:y+APAD});
      x+=w+2*APAD; rowH=Math.max(rowH,h+2*APAD); pg.h=Math.max(pg.h,y+rowH);
    }
    for(const p of pages){
      if(!p.items.length) continue;
      const c=document.createElement("canvas"); c.width=ATLAS; c.height=p.h;
      const g=c.getContext("2d"); g.imageSmoothingEnabled=false;
      for(const{m,src,w,h,X,Y}of p.items){
        g.drawImage(src,X,Y);
        g.drawImage(src,0,0,1,h,X-APAD,Y,APAD,h);   g.drawImage(src,w-1,0,1,h,X+w,Y,APAD,h);
        g.drawImage(src,0,0,w,1,X,Y-APAD,w,APAD);   g.drawImage(src,0,h-1,w,1,X,Y+h,w,APAD);
        g.drawImage(src,0,0,1,1,X-APAD,Y-APAD,APAD,APAD);   g.drawImage(src,w-1,0,1,1,X+w,Y-APAD,APAD,APAD);
        g.drawImage(src,0,h-1,1,1,X-APAD,Y+h,APAD,APAD);    g.drawImage(src,w-1,h-1,1,1,X+w,Y+h,APAD,APAD);
        /* v runs up the canvas (flipY), in the decal and in the page alike */
        const uv=m.geometry.attributes.uv;
        for(let i=0;i<uv.count;i++) uv.setXY(i,(X+uv.getX(i)*w)/ATLAS, 1-(Y+(1-uv.getY(i))*h)/p.h);
      }
      const t=new THREE.CanvasTexture(c);
      t.wrapS=t.wrapT=THREE.ClampToEdgeWrapping; t.minFilter=THREE.LinearFilter; t.generateMipmaps=false;
      const merged=mergeStatic(p.items.map(it=>it.m), kind==="mold"? moldMat(t):dripMat(t));
      merged.renderOrder=LAYER_DECAL;
      scene.add(merged);
    }
    for(const m of list){ scene.remove(m); m.geometry.dispose(); m.material.map.dispose(); m.material.dispose(); }
  }
  wallDecals.length=0;
}
/* ---- the mold's grain ----
   Coverage (the colony canvas's alpha) plus texMoldGrain's R must clear 1
   for a point to show, so the soft field comes out as round colonies that
   swell and merge toward the core, over a faint stain of the soft field
   itself. Grain is world-mapped (0.7m a repeat) off whichever axis the decal
   faces, so a colony runs on unbroken across a wrap. It fades back to the
   plain field once a grain texel is smaller than a few pixels — thresholded
   there it only shimmers. */
const MOLD_REP=1/0.7;
function moldCompile(sh){
  sh.uniforms.uMold={value:texMoldGrain};
  sh.vertexShader=sh.vertexShader
    .replace("#include <common>","#include <common>\nvarying vec2 vMoldP;")
    .replace("#include <project_vertex>",`#include <project_vertex>
  {
    vec3 wn=abs(mat3(modelMatrix)*objectNormal);
    vec3 wp=(modelMatrix*vec4(transformed,1.0)).xyz;
    vMoldP=(wn.y>0.5? wp.xz : wn.x>0.5? wp.zy : wp.xy)*${MOLD_REP.toFixed(4)};
  }`);
  sh.fragmentShader=sh.fragmentShader
    .replace("#include <common>","#include <common>\nuniform sampler2D uMold;\nvarying vec2 vMoldP;\nfloat moldH;")
    .replace("#include <bumpmap_pars_fragment>",bumpChunk("  return bumpScale*vec2(dFdx(moldH),dFdy(moldH));"))
    .replace("#include <map_fragment>",`#include <map_fragment>
  {
    vec4 D=texture2D(uMold,vMoldP);
    float C=diffuseColor.a;
    float e=D.r*0.92+C*1.25-1.0+(D.g-0.59)*0.1;   // the grain roughs up every edge
    float dots=smoothstep(-0.04,0.05,e);
    vec2 fw=fwidth(vMoldP)*512.0;
    float far=smoothstep(2.5,6.0,sqrt(fw.x*fw.y));   // geometric mean: anisotropic filtering holds the grazing axis
    float body=smoothstep(0.0,0.45,e);
    vec3 rim=diffuseColor.rgb*mix(1.35,mix(1.15,0.45,D.r),body)*(0.8+0.4*D.g);
    rim=mix(rim,vec3(dot(rim,vec3(0.3,0.5,0.2)))*vec3(1.0,1.0,0.8),0.45);
    diffuseColor.rgb=mix(diffuseColor.rgb,mix(diffuseColor.rgb,rim,dots),1.0-far);
    diffuseColor.a=mix(max(dots*mix(0.78,1.0,C)*mix(0.82,1.0,D.r),C*0.62),C,far);
    moldH=dots*(0.35+0.65*D.r)*(1.0-far);
  }`);
}
/* ---- the ceiling spill ----
   Every lit troffer's glow on the tiles around it, as ONE mesh: a quad per
   fixture carrying a vertex colour that is re-read from that fixture's tube
   material every frame (lights.js already drives those), so each patch
   flickers, dies, and goes red in the shockwave with its own lamp. */
const SPILL_M=1.35;                         // how far past the trim the glow reaches (m)
const SPILL_W=FW+2*SPILL_M, SPILL_D=FD+2*SPILL_M;
const spillTex=markShared(makeSpillTexture(FW/SPILL_W,FD/SPILL_D,0.35));
function spillMesh(list){
  const pos=[],uv=[],col=[],idx=[];
  for(const{p}of list){
    const b=pos.length/3, y=WALL_H-0.02;
    for(const[dx,dz,u,v]of[[-1,-1,0,0],[1,-1,1,0],[1,1,1,1],[-1,1,0,1]]){
      pos.push(p.x+dx*SPILL_W/2,y,p.z+dz*SPILL_D/2); uv.push(u,v); col.push(0,0,0);
    }
    idx.push(b,b+1,b+2, b,b+2,b+3);
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute("position",new THREE.Float32BufferAttribute(pos,3));
  geo.setAttribute("uv",new THREE.Float32BufferAttribute(uv,2));
  geo.setAttribute("color",new THREE.Float32BufferAttribute(col,3));
  geo.setIndex(idx);
  const mesh=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({map:spillTex, vertexColors:true,
    transparent:true, depthWrite:false, blending:THREE.AdditiveBlending}));
  const ca=geo.attributes.color, K=0.24;
  mesh.onBeforeRender=()=>{
    for(let i=0;i<list.length;i++){
      const c=list[i].mat.color, w=list[i].warm;
      const r=c.r*K, g=c.g*K*(w?0.62:0.97), b=c.b*K*(w?0.3:0.86);
      for(let k=0;k<4;k++) ca.setXYZ(i*4+k,r,g,b);
    }
    ca.needsUpdate=true;
  };
  mesh.renderOrder=1;
  return mesh;
}
