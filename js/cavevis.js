/* ---------------- THE NEST: what the rock hides is not drawn ----------------
   The cave is 188m of tunnels and chambers cut through solid rock, and every
   frame used to send most of it to the GPU: 1.25 million triangles on
   average and all 2.3 million from the worst spots, nearly all of them
   behind a wall. three culls by the view frustum only, and a 115° frustum
   in a maze still contains almost everything in front of you.

   The level already knows what is solid: a grid3 cell of rock is rock from
   floor to vault. So visibility is a 2-D question, and this answers it the
   blunt way — a fan of rays from the eye across the grid, marking every
   cell a ray crosses until it is stopped — and then skips every static mesh
   none of whose cells was reached.

   IT MUST NEVER HIDE ANYTHING YOU COULD SEE, so every approximation leans
   the same way:
     · a ray is stopped only by the CORE of the rock — rock at least a metre
       from any open cell on a 1m grid. The walls are sheets displaced off
       the cell faces by wallField, up to 0.75m near the vault; a metre of
       skin left transparent is more than they can ever recede, so a
       sightline that really grazes round a corner is never cut short.
     · only rock (code 1) stops a ray. Squeezes, rubble, the chasm, the
       stream — and every formation, heap and web — are treated as air.
     · the reached cells are widened by one cell all round before anything
       is tested against them, which covers the gap between two rays at
       range and anything overhanging its own cell.
     · a mesh is tested by the square its whole bounding sphere covers.
     · it is recomputed before the eye has moved 15cm, and on the frame the
       grid changes (a rockfall, the fissure opening).
     · an eye that is somehow inside rock, or off the grid, hides nothing.
   Only static meshes are on the list (a frozen matrix all the way up); the
   matriarch, the brood, the eggs, particles and anything added after the
   build are always drawn. It works through the mesh's LAYER mask, never
   `.visible`, which belongs to the game (see updateFogCull in scene.js),
   and it never touches a light.

   Unlike a fog-distance cull this is exact: something behind rock was
   already losing the depth test at every pixel, so the frame is the same
   frame — checked by rendering random standpoints with the cull on and off
   and comparing every pixel. */
import { CELL } from "./map.js";
import { scene, camera } from "./scene.js";
import { CW, CH, grid3 } from "./cave.js";

const FX=CW*CELL, FZ=CH*CELL;            // the fine grid: one metre a cell (CELL is 4)
const RAYS=2048;                         // 0.18° apart: under half a metre at the far end of the cave
const COS=new Float32Array(RAYS), SIN=new Float32Array(RAYS);
for(let i=0;i<RAYS;i++){ const a=(i+0.5)/RAYS*Math.PI*2; COS[i]=Math.cos(a); SIN[i]=Math.sin(a); }

let solid=null, core=null, rockSig=-1;
const reach=new Uint8Array(CW*CH), wide=new Uint8Array(CW*CH), sat=new Int32Array((CW+1)*(CH+1));
const objs=[], rects=[];                 // rects: x0,z0,x1,z1 in cells, per object
let lastX=1e9, lastZ=1e9, all=true;

function rockCount(){
  let n=0;
  for(let y=0;y<CH;y++){ const row=grid3[y]; for(let x=0;x<CW;x++) if(row[x]===1) n+=x+y*CW+1; }
  return n;
}
function buildCore(){
  solid=new Uint8Array(FX*FZ); core=new Uint8Array(FX*FZ);
  for(let cy=0;cy<CH;cy++)for(let cx=0;cx<CW;cx++){
    if(grid3[cy][cx]!==1) continue;
    for(let j=0;j<CELL;j++){ const o=(cy*CELL+j)*FX+cx*CELL; for(let i=0;i<CELL;i++) solid[o+i]=1; }
  }
  /* erode by one fine cell: what is left is at least a metre inside the rock.
     Past the edge of the grid counts as rock. */
  for(let z=0;z<FZ;z++)for(let x=0;x<FX;x++){
    const o=z*FX+x; if(!solid[o]) continue;
    let ok=1;
    for(let dz=-1;dz<=1&&ok;dz++)for(let dx=-1;dx<=1;dx++){
      const xx=x+dx, zz=z+dz;
      if(xx<0||zz<0||xx>=FX||zz>=FZ) continue;
      if(!solid[zz*FX+xx]){ ok=0; break; }
    }
    core[o]=ok;
  }
}
/* the static meshes of the freshly built cave go on the list (lifecycle.js
   calls this right after buildCave) */
export function initCaveVis(){
  objs.length=0; rects.length=0; rockSig=-1; lastX=lastZ=1e9; all=true;
  scene.updateMatrixWorld(true);
  const s=new THREE.Sphere();
  for(const root of scene.children){
    if(root.userData.persist) continue;
    root.traverse(o=>{
      if(!(o.isMesh||o.isLine||o.isPoints)||o.isSkinnedMesh||o.frustumCulled===false) return;
      for(let p=o;p&&p!==scene;p=p.parent) if(p.matrixAutoUpdate||p.userData.animated) return;
      const g=o.geometry; if(!g||!g.attributes.position) return;
      if(!g.boundingSphere) g.computeBoundingSphere();
      s.copy(g.boundingSphere).applyMatrix4(o.matrixWorld);
      const r=s.radius+0.25;
      const x0=Math.max(0,Math.floor((s.center.x-r)/CELL+CW/2)), x1=Math.min(CW-1,Math.floor((s.center.x+r)/CELL+CW/2));
      const z0=Math.max(0,Math.floor((s.center.z-r)/CELL+CH/2)), z1=Math.min(CH-1,Math.floor((s.center.z+r)/CELL+CH/2));
      /* a skin that spans the cave (the water, the web sheets) is in sight from everywhere */
      if((x1-x0+1)*(z1-z0+1)>CW*CH*0.5||x1<x0||z1<z0) return;
      objs.push(o); rects.push(x0,z0,x1,z1);
    });
  }
}
function showAll(){ if(all) return; all=true; for(const o of objs) o.layers.mask=1; }
/* every rendered frame, before the render (main.js) — the death camera and
   the cutscenes move the eye too */
export function updateCaveVis(){
  if(!objs.length) return;
  const sig=rockCount();
  if(sig!==rockSig){ rockSig=sig; buildCore(); lastX=1e9; }
  const px=camera.position.x, pz=camera.position.z;
  if(Math.abs(px-lastX)<0.15&&Math.abs(pz-lastZ)<0.15) return;
  lastX=px; lastZ=pz;
  const ox=px+FX/2, oz=pz+FZ/2, fx0=Math.floor(ox), fz0=Math.floor(oz);
  if(fx0<0||fz0<0||fx0>=FX||fz0>=FZ||solid[fz0*FX+fx0]){ showAll(); return; }
  reach.fill(0);
  for(let i=0;i<RAYS;i++){
    const dx=COS[i], dz=SIN[i], sx=dx>0?1:-1, sz=dz>0?1:-1;
    const tdx=Math.abs(1/dx), tdz=Math.abs(1/dz);
    let fx=fx0, fz=fz0, tx=(dx>0? fx+1-ox : ox-fx)*tdx, tz=(dz>0? fz+1-oz : oz-fz)*tdz;
    for(;;){
      reach[(fz>>2)*CW+(fx>>2)]=1;
      if(core[fz*FX+fx]) break;
      if(tx<tz){ tx+=tdx; fx+=sx; if(fx<0||fx>=FX) break; }
      else     { tz+=tdz; fz+=sz; if(fz<0||fz>=FZ) break; }
    }
  }
  /* widen by one cell, then a summed-area table so each mesh is one lookup */
  for(let y=0;y<CH;y++)for(let x=0;x<CW;x++){
    let v=0;
    for(let dy=-1;dy<=1&&!v;dy++){ const yy=y+dy; if(yy<0||yy>=CH) continue;
      for(let dx=-1;dx<=1;dx++){ const xx=x+dx; if(xx>=0&&xx<CW&&reach[yy*CW+xx]){ v=1; break; } } }
    wide[y*CW+x]=v;
  }
  const W1=CW+1;
  for(let y=0;y<CH;y++){ let row=0;
    for(let x=0;x<CW;x++){ row+=wide[y*CW+x]; sat[(y+1)*W1+x+1]=sat[y*W1+x+1]+row; } }
  for(let i=0,j=0;i<objs.length;i++,j+=4){
    const x0=rects[j], z0=rects[j+1], x1=rects[j+2]+1, z1=rects[j+3]+1;
    const mask= sat[z1*W1+x1]-sat[z0*W1+x1]-sat[z1*W1+x0]+sat[z0*W1+x0]>0? 1 : 0;
    const L=objs[i].layers;
    if(L.mask!==mask) L.mask=mask;
  }
  all=false;
}
/* for tests: the cull's own numbers */
export function caveVisStats(){
  let hidden=0; for(const o of objs) if(!o.layers.mask) hidden++;
  return {listed:objs.length, hidden};
}
