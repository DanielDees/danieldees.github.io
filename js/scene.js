/* ---------------- three.js scene & level geometry ---------------- */
import { rand } from "./utils.js";
import { W, H, CELL, WALL_H, grid, genMap, cellToWorld, isWall } from "./map.js";
import { makeCanvas, texWall, texCarpet, texStains, texCeil } from "./textures.js";
import { $ } from "./utils.js";

export const FOG_COLOR = 0x26241b;       // blackish-grey murk with a trace of yellow
export const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(FOG_COLOR, 0.048);
scene.background = new THREE.Color(FOG_COLOR);
export const camera = new THREE.PerspectiveCamera(72, innerWidth/innerHeight, 0.1, 200);
export const renderer = new THREE.WebGLRenderer({antialias:true});
renderer.setSize(innerWidth,innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
$("game").appendChild(renderer.domElement);
addEventListener("resize",()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight);});

/* modest base light — the fixture pool below does the real work */
export const hemi = new THREE.HemisphereLight(0xffe9b0, 0x2c2414, 0.42);
scene.add(hemi);
const amb = new THREE.AmbientLight(0x6b5d35, 0.25);
scene.add(amb);
export const playerLight = new THREE.PointLight(0xffeeb0, 0.12, 9, 1.8); // faint readability fill
scene.add(playerLight);

/* pool of real point lights bound to the nearest ceiling panels.
   Per-pixel (Phong) materials + decay give a smooth radial gradient that
   reaches the carpet; intensity fades out across the outer band of the
   bind radius so fixtures ease in at a distance instead of popping. */
export const LIGHT_POOL_N = 20, LIGHT_BIND_RADIUS = 27, LIGHT_FADE_START = 17;
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
  texCarpet.repeat.set(W/2,H/2); texCeil.repeat.set(W*2,H*2);
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
  for(let y=1;y<H-1;y+=2)for(let x=1;x<W-1;x+=2){
    if(grid[y][x]===0 && Math.random()<0.85){
      const glowMat=new THREE.MeshBasicMaterial({color:0xfff6cf});
      const p=cellToWorld(x,y);
      const fix=new THREE.Group();
      const housing=new THREE.Mesh(housingGeo,housingMats);
      housing.position.y=WALL_H-HOUSE_D/2; fix.add(housing);
      const backplate=new THREE.Mesh(glowGeo,glowMat);
      backplate.rotation.x=Math.PI/2; backplate.position.y=WALL_H-0.014; fix.add(backplate);
      for(const tz of[-0.32,0.32]){
        const tube=new THREE.Mesh(tubeGeo,glowMat);
        tube.position.set(0,WALL_H-0.05,tz); fix.add(tube);   // recessed inside the housing
      }
      const grate=new THREE.Mesh(grateGeo,grateMat);
      grate.rotation.x=Math.PI/2; grate.position.y=WALL_H-HOUSE_D+0.004; fix.add(grate); // flush with the rim
      fix.position.set(p.x,0,p.z);
      scene.add(fix);
      lights.push({glowMat:glowMat, cx:x, cy:y, world:p, flickery:Math.random()<0.22,
        phase:Math.random()*100, on:1,
        mode:"steady", timer:rand(1,12), pattern:0, rate:20,
        burstDur:0, burstT:0, seed:Math.random()*1000, lastTick:0});
    }
  }
}
