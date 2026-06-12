/* ---------------- three.js scene & level geometry ---------------- */
import { rand, clamp } from "./utils.js";
import { W, H, CELL, WALL_H, grid, genMap, cellToWorld, isWall } from "./map.js";
import { makeCanvas, texWall, texCarpet, texStains, texCeil, texCeilStains,
         makeMoldTextures, makeDripTextures, sliceTexture } from "./textures.js";
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
export function clearLevelScene(){
  for(const o of [...scene.children])
    if(!o.userData.persist) scene.remove(o);
  lights.length=0;
  wallMeshes=new Map();
  wallDecals.length=0;
}
/* fog & ambient floor per level. THE END sits in a cooler, deeper murk:
   its minimum ambient light level is roughly HALF of level 0's. */
export function setLevelEnvironment(level){
  if(level===1){
    scene.fog.color.setHex(0x030404); scene.background.setHex(0x030404);
    scene.fog.near=6; scene.fog.far=62;
    hemi.color.setHex(0xe8e2d0); hemi.groundColor.setHex(0x14161c);
    hemi.intensity=0.048;
    amb.color.setHex(0x4a5060); amb.intensity=0.03;
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
    fixY:opts.fixY, wakeAt:opts.wakeAt||0,
    flickery: opts.flickery!==undefined? opts.flickery : Math.random()<0.22,
    warm, warmth:warm?1:0, bright, dimY:warm?0:(1-bright)/dimDen,
    phase:Math.random()*100, on:1,
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
  for(const m of wallDecals)
    if(m.userData.wallKeys && m.userData.wallKeys.includes(key)) scene.remove(m);
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
      lights.push(makeLightRecord(glowMat,tubeMat,x,y,p,{warm}));
    }
  }
}
