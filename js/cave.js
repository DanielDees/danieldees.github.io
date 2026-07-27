/* ---------------- THE NEST — the cave below the library ----------------
   Level 8, wrong side out: a karst network of chambers and winding tunnels
   under a varied ceiling — crawl-squeezes, a black stream, loud scree, one
   rock bridge over a chasm — lit only by bioluminescent fungus. The webs
   are cosmetic, and they thicken toward what they protect.

   Grid cell codes (grid3):
     0 open · 1 rock · 2 squeeze (crouch-only; the matriarch can't follow)
     3 stream (wading masks your noise) · 4 scree (twice as loud)
     5 void (the chasm — nothing under your feet) · 6 bridge (over it)
     7 rubble (a collapsed tunnel; rockfalls may open it later)

   Passability: the player crosses 0/3/4/6 upright and adds 2 crouched
   (5 is "passable" the way open air is). The matriarch treats 2/5/7 as
   solid. Hatchlings pass squeezes but not the chasm. */
import { rand, clamp, lerp, srand, hash } from "./utils.js";
import { CELL } from "./map.js";
import { STATE } from "./state.js";
import { scene, camera, renderer, lights, makeLightRecord, markShared,
         mergeStatic, freezeStaticScene } from "./scene.js";
import { makeCanvas, texCaveRock, texCaveFloor, texDripstone,
         makeWebSheetTexture, makeCobwebTexture, makeStrandTexture, makeFunnelTexture,
         makeFungusSkin, scaleBoxUV, texEggSac, makeFlameTexture, texCocoon,
         texCloth, texBone, texJournalPages } from "./textures.js";
import { addInteractable } from "./props.js";
import { die } from "./lifecycle.js";
import { renderObjectives, toast } from "./ui.js";
import { AU, sfxRockfall, sfxIgnite, startClutchFire, panTo } from "./audio.js";

export const CW=47, CH=47, CAVE_H_MAX=20;
export const CAVE_SPAN=CW*CELL;
export let grid3=null;
let ceilH=null;                               // per-cell nominal ceiling height
let cH=null;                                  // corner-shared ceiling heights (CH+1 × CW+1)
let fH=null;                                  // corner-shared floor heights
let fW=null;                                  // per-corner floor-detail weight (0 = locked flat)
export const cellToWorld3=(cx,cy)=>({x:(cx-CW/2+0.5)*CELL, z:(cy-CH/2+0.5)*CELL});
export const worldToCell3=(x,z)=>({cx:Math.floor(x/CELL+CW/2), cy:Math.floor(z/CELL+CH/2)});
const K=(cx,cy)=>cy*CW+cx;
const inB=(cx,cy)=>cx>0&&cy>0&&cx<CW-1&&cy<CH-1;

/* shared level handles: the AI, cutscenes and audio read these */
export const CAVE={
  spawn:null, spawnYaw:0,
  chambers:[],                 // {cx,cy,r,h}
  broods:[],                   // {cx,cy,center:{x,z}, clutch, burned:false}
  obstacles:[],                // free-standing circle colliders (stalagmites, boulders, cocoons)
  silk:new Set(),              // silk-laced floor cells (the matriarch feels footfalls: 2× hearing)
  reach:null, reachList:[],    // crouch-player reachable cells
  mReachList:[],               // matriarch-reachable cells (wander targets)
  events:[],                   // rockfall stages: {openCells, pile, closed:{cells,mesh}|null}
  fires:[],                    // active clutch fires: {x,z,T,light,handle}
  lastBurn:null,               // {x,z,idx,at} — the matriarch polls this
  fissure:null,                // {x,z,r,stair,group,lights,open}
  stairMouth:null,             // {x,z,rCut,lip} — the arrival bore's mouth in the vault
  corpseP:null,                // {x,z} — fixed before placement so nothing grows through it
  regionDim:[1,1,1,1],         // per-brood fungus dim targets (burns kill the local glow)
  corpse:null, entrance:null,
  approachC:null, bridgeC:[],  // the fissure doorstep + bridge cells (rockfall protects these)
  streamCells:[], dripT:2.5,
  waterMat:null, causticMat:null,   // the stream's two drifting layers (surface / bed)
  shakeT:0,
};

/* ---------------- queries ---------------- */
export const cellAt3=(wx,wz)=>{
  const c=worldToCell3(wx,wz);
  return (c.cx<0||c.cy<0||c.cx>=CW||c.cy>=CH)? 1 : grid3[c.cy][c.cx];
};
const codeAt=(cx,cy)=> (cx<0||cy<0||cx>=CW||cy>=CH)? 1 : grid3[cy][cx];
/* the matriarch: rock, squeezes, rubble and the chasm are all walls to it */
export const isBlockedSpider3=(cx,cy)=>{
  const t=codeAt(cx,cy); return t===1||t===2||t===5||t===7;
};
/* hatchlings: small enough for the squeezes, smart enough for the chasm */
export const hatchBlocked=(cx,cy)=>{
  const t=codeAt(cx,cy); return t===1||t===5||t===7;
};
/* A BANK cell: standable ground with the water against it. Two passes have to
   agree on exactly this set — genCave lifts the rock here clear of the water
   line, and buildCave laps the water onto it — so both ask the same question
   instead of each keeping its own list. */
const isBankCell=(cx,cy)=>{
  const t=codeAt(cx,cy);
  if(t!==0&&t!==4) return false;
  for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]) if(codeAt(cx+dx,cy+dy)===3) return true;
  return false;
};
const playerBlocked=(cx,cy,crouched)=>{
  const t=codeAt(cx,cy);
  if(t===1||t===7) return true;
  if(t===2&&!crouched) return true;
  return false;
};
export function losCells3(ax,az,bx,bz){
  const steps=Math.ceil(Math.hypot(bx-ax,bz-az)/(CELL*0.4));
  for(let i=1;i<steps;i++){
    const t=i/steps, c=worldToCell3(lerp(ax,bx,t),lerp(az,bz,t));
    const g=codeAt(c.cx,c.cy);
    if(g===1||g===2||g===7) return false;       // rock & low squeezes block sight
  }
  return true;
}
export const underRock=(x,z)=> cellAt3(x,z)===2;   // a squeeze overhead: no standing up
export function caveCollide(px,pz,r,crouched){
  const c=worldToCell3(px,pz);
  let nx=px, nz=pz;
  for(let gy=c.cy-1;gy<=c.cy+1;gy++)for(let gx=c.cx-1;gx<=c.cx+1;gx++){
    if(!playerBlocked(gx,gy,crouched)) continue;
    const wp=cellToWorld3(gx,gy);
    const minX=wp.x-CELL/2-r, maxX=wp.x+CELL/2+r;
    const minZ=wp.z-CELL/2-r, maxZ=wp.z+CELL/2+r;
    if(nx>minX&&nx<maxX&&nz>minZ&&nz<maxZ){
      const dxl=nx-minX, dxr=maxX-nx, dzl=nz-minZ, dzr=maxZ-nz;
      const m=Math.min(dxl,dxr,dzl,dzr);
      if(m===dxl)nx=minX; else if(m===dxr)nx=maxX;
      else if(m===dzl)nz=minZ; else nz=maxZ;
    }
  }
  for(const o of CAVE.obstacles){
    const dx=nx-o.x, dz=nz-o.z, d=Math.hypot(dx,dz), min=o.r+r;
    if(d<min){
      if(d>1e-4){ nx=o.x+dx/d*min; nz=o.z+dz/d*min; }
      else nx=o.x+min;
    }
  }
  return {x:nx,z:nz};
}
/* ---------------- the surface fields ----------------
   The cave's floor, ceiling and wall relief are deterministic functions of
   world position, shared by EVERYTHING: the meshes sample them per vertex,
   the player/AI stand on them, and every web/fungus/dripstone anchor asks
   them where the rock actually is. One source of truth — geometry and
   placement cannot drift apart. */
/* bilinear over a corner grid (fH or cH) */
function cornerLerp(G,wx,wz){
  const fx=clamp(wx/CELL+CW/2,0,CW-0.001), fz=clamp(wz/CELL+CH/2,0,CH-0.001);
  const i=Math.floor(fx), j=Math.floor(fz), u=fx-i, v=fz-j;
  return lerp(lerp(G[j][i],G[j][i+1],u), lerp(G[j+1][i],G[j+1][i+1],u), v);
}
/* the floor: rolling corner noise + fine ripple, damped to dead flat where
   gameplay needs it (spawn, brood pads, stream bed, bridge, squeezes) */
export function floorYAt(wx,wz){
  if(!fH) return 0;
  const h=cornerLerp(fH,wx,wz), w=cornerLerp(fW,wx,wz);
  return h + w*(Math.sin(wx*1.31+wz*0.97)*0.07+Math.sin(wx*2.53-wz*1.71)*0.05
               +Math.sin(wx*0.53+wz*0.61)*0.08);
}
/* the floor's TRUE normal, straight off the height field.
   The walls and the vault are faceted on purpose — fractured rock ought to
   read as planes — but the ground is sediment, and giving it the same flat
   per-triangle normals made every 1.3 m sub-quad a separate shade of brown.
   Walking over it looked like crumpled paper. Sampling the gradient here
   costs three extra floorYAt calls per vertex at BUILD time only, and the
   floor becomes what the field always said it was: rolling. */
const _FN_EPS=0.12;
export function floorNormalAt(wx,wz){
  const dx=(floorYAt(wx+_FN_EPS,wz)-floorYAt(wx-_FN_EPS,wz))/(2*_FN_EPS);
  const dz=(floorYAt(wx,wz+_FN_EPS)-floorYAt(wx,wz-_FN_EPS))/(2*_FN_EPS);
  const l=Math.hypot(dx,1,dz)||1;
  return [-dx/l, 1/l, -dz/l];
}
/* the ceiling: corner vault + crag detail. The hard rule lives here — over
   any cell you can stand in, the rock never dips below twice your height
   (3.62m over the local floor); only the squeezes crawl, and their mouths
   ramp down INSIDE the squeeze cell so an upright head never hits stone. */
export function ceilYAt(wx,wz){
  if(!cH) return 4;
  let h=cornerLerp(cH,wx,wz);
  const d=Math.sin(wx*1.13+wz*0.87)*0.16+Math.sin(wx*2.71-wz*2.03)*0.10
         +Math.sin(wx*0.47-wz*0.55)*0.14;
  const c=worldToCell3(wx,wz);
  if(codeAt(c.cx,c.cy)===2){
    /* the crawl: past a short mouth ramp the bore closes to ~1.5m */
    const p=cellToWorld3(c.cx,c.cy);
    let de=1e9;
    for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){
      const n=codeAt(c.cx+dx,c.cy+dy);
      if(n===1||n===7||n===2) continue;               // only true mouths ramp
      de=Math.min(de, CELL/2-(dx? (wx-p.x)*dx : (wz-p.z)*dy));
    }
    const lint=1.5+d*0.2;
    return de>=1e9? lint : lerp(Math.max(h+d,3.62), lint, clamp(de/1.3,0,1));
  }
  return Math.max(h+d, floorYAt(wx,wz)+3.62);
}
/* lateral rock relief for walls (and crag jitter for the ceiling): a smooth
   3D vector field, zero at the floor line (so wall feet weld to the floor
   mesh), modest through the body band (the camera can never clip in), and
   swelling toward the vault into real overhangs. */
export function wallField(x,y,z){
  const a=0.26*clamp((y-floorYAt(x,z))/1.1,0,1) * (1+1.9*clamp((y-2.6)/3.6,0,1));
  return {
    x:a*(Math.sin(x*0.83+z*0.61+y*0.53)*0.55+Math.sin(x*2.09-z*1.67+y*1.31)*0.30
        +Math.sin(x*4.13+z*3.71-y*2.47)*0.15),
    z:a*(Math.sin(x*0.71-z*0.89+y*0.47+2.1)*0.55+Math.sin(x*1.87+z*2.23-y*1.13+1.3)*0.30
        +Math.sin(x*3.79-z*4.31+y*2.11+0.7)*0.15),
  };
}

/* ground height. The stream is a shallow wade; the chasm is nothing at all;
   the opened fissure's chimney treads spiral UP (the mirror of the library's
   stair — the lap is still disambiguated by the player's own height). */
export function caveGroundY(x,z,curY){
  const f=CAVE.fissure;
  if(f&&f.open){
    const dx=x-f.x, dz=z-f.z, r=Math.hypot(dx,dz);
    if(r<f.r-0.05&&curY>-0.5){
      const st=f.stair;
      if(r>=st.rc-0.72){
        const stepA=Math.PI*2/st.steps, stepH=st.rise/st.steps;
        const a=Math.atan2(dz,dx);
        const thTarget=st.a0+Math.PI*2*((curY+0.02)/st.rise);
        let k=Math.round((thTarget-a)/(Math.PI*2));
        for(let guard=0;guard<3;guard++){
          const i=Math.floor((a+Math.PI*2*k-st.a0)/stepA);
          if(i<0) return 0;                     // below the first tread: alcove floor
          const y=0.02+i*stepH;
          if(y>curY+0.75){ k--; continue; }     // that lap is overhead — the one below
          return Math.min(y, 0.02+(st.n-1)*stepH);
        }
        return 0;
      }
      return 0;                                 // the open throat: back to the floor
    }
  }
  const t=cellAt3(x,z);
  if(t===5) return -999;
  if(t===3) return -0.14;                       // wading the flat black water
  return floorYAt(x,z);
}
/* the chimney's bore is the only wall above the alcove ceiling */
export function caveShaftClamp(x,z,py,pr){
  const f=CAVE.fissure;
  if(!f||!f.open||py<2.2) return null;
  const dx=x-f.x, dz=z-f.z, r=Math.hypot(dx,dz);
  if(r>f.r+2.0) return null;                    // nowhere near the bore
  const max=f.r-pr+0.05;
  if(r<=max||r<1e-4) return null;
  return {x:f.x+dx/r*max, z:f.z+dz/r*max};
}
/* what's underfoot, for footsteps and for how far they carry */
export function surfaceAt(x,z){
  const t=cellAt3(x,z);
  if(t===3) return "stream";
  if(t===4) return "scree";
  return "stone";
}
export function surfaceNoiseGain(x,z){
  const t=cellAt3(x,z);
  if(t===3) return 0.35;                        // the water argues over you
  if(t===4) return 1.6;                         // scree roars underfoot
  return 1;
}
export const silkGainAt=(x,z)=>{
  const c=worldToCell3(x,z);
  return CAVE.silk.has(K(c.cx,c.cy))? 2.0 : 1;
};
/* best-effort BFS (the library's trick): unreachable targets route to the
   nearest standable cell. `small` walks the hatchlings' grid. */
export function bfsPath3(sx,sy,tx,ty,small=false){
  const blocked=small? hatchBlocked : isBlockedSpider3;
  if(blocked(sx,sy)) return null;
  const prev=new Map(), q=[[sx,sy]];
  prev.set(K(sx,sy),-1);
  let best=[sx,sy], bestD=Math.hypot(sx-tx,sy-ty);
  while(q.length){
    const [x,y]=q.shift();
    const d=Math.hypot(x-tx,y-ty);
    if(d<bestD){ bestD=d; best=[x,y]; }
    if(x===tx&&y===ty){ best=[x,y]; break; }
    for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){
      const nx=x+dx, ny=y+dy, nk=K(nx,ny);
      if(!blocked(nx,ny)&&!prev.has(nk)){prev.set(nk,K(x,y));q.push([nx,ny]);}
    }
  }
  const path=[]; let k=K(best[0],best[1]);
  while(k!==-1){path.push({cx:k%CW,cy:(k/CW)|0}); k=prev.get(k);}
  return path.reverse();
}
export function randomReachCell3(){
  const l=CAVE.mReachList;
  return l[Math.floor(Math.random()*l.length)];
}

/* ---------------- generation ---------------- */
function carveBlob(cx,cy,r){
  for(let y=Math.floor(cy-r);y<=Math.ceil(cy+r);y++)
    for(let x=Math.floor(cx-r);x<=Math.ceil(cx+r);x++){
      if(!inB(x,y)) continue;
      const d=Math.hypot(x-cx,y-cy);
      if(d<=r-0.4 || (d<=r+0.4&&srand()<0.55)) grid3[y][x]=0;
    }
}
/* a winding corridor biased toward its goal; `wide` carves it two cells
   across (8m — you could drive a bus through it) with occasional 3-cell
   bulges. Returns the cells it NEWLY opened (so alternate routes can be
   re-sealed as rubble). */
function carveTunnel(ax,ay,bx,by,wobble=0.42,wide=true){
  const opened=[];
  const open=(x,y)=>{ if(inB(x,y)&&grid3[y][x]===1){ grid3[y][x]=0; opened.push({x,y}); } };
  let x=ax, y=ay, guard=700, ldx=0, ldy=1;
  while((x!==bx||y!==by)&&guard-->0){
    open(x,y);
    if(wide){
      open(x-ldy,y+ldx);                       // one perpendicular neighbor: 2 wide
      if(srand()<0.18) open(x+ldy,y-ldx);      // and the odd 3-wide bulge
    }
    let dx=Math.sign(bx-x), dy=Math.sign(by-y);
    if(srand()<wobble){                        // drift sideways
      if(srand()<0.5&&dx!==0) dy=(srand()<0.5?1:-1);
      else if(dy!==0) dx=(srand()<0.5?1:-1);
    }
    if(dx!==0&&dy!==0){ if(srand()<0.5)dy=0; else dx=0; }
    if(dx||dy){ ldx=dx; ldy=dy; }
    x=clamp(x+dx,1,CW-2); y=clamp(y+dy,1,CH-2);
    if(srand()<0.14) open(x+1,y);
  }
  open(x,y);
  if(wide) open(x-ldy,y+ldx);
  return opened;
}
function flood(startX,startY,blocked){
  const seen=new Set(), q=[[startX,startY]];
  if(blocked(startX,startY)) return seen;
  seen.add(K(startX,startY));
  while(q.length){
    const [x,y]=q.shift();
    for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){
      const nx=x+dx, ny=y+dy;
      if(nx<0||ny<0||nx>=CW||ny>=CH) continue;
      if(blocked(nx,ny)||seen.has(K(nx,ny))) continue;
      seen.add(K(nx,ny)); q.push([nx,ny]);
    }
  }
  return seen;
}
const crouchBlocked=(cx,cy)=>playerBlocked(cx,cy,true);

function genCave(){
  grid3=Array.from({length:CH},()=>Array(CW).fill(1));
  /* the rooms of the warren — scaled to cave, not corridor: the central
     vault is ~50m across under an 18m dome, the brood chambers 30m+, and
     every tending route is two cells (8m) wide */
  const entrance={cx:23,cy:39,r:4.0,h:9.0};
  const central ={cx:23,cy:21,r:6.5,h:18.0};
  const broods=[
    {cx:9, cy:9, r:4.5,h:13.0},
    {cx:37,cy:9, r:4.5,h:13.0},
    {cx:7, cy:29,r:4.0,h:12.0},
    {cx:39,cy:30,r:4.0,h:12.0},
  ];
  CAVE.chambers=[entrance,central,...broods];
  for(const c of CAVE.chambers) carveBlob(c.cx,c.cy,c.r);
  /* main spokes (the matriarch's tending routes — wide, never squeezed) */
  carveTunnel(entrance.cx,entrance.cy,central.cx,central.cy,0.3);
  for(const b of broods) carveTunnel(central.cx,central.cy,b.cx,b.cy,0.42);
  /* the north approach: central → the fissure's doorstep (single file) */
  carveTunnel(central.cx,central.cy-4,23,5,0.12,false);
  /* loops (player shortcuts; these are where the squeezes live) */
  const loops=[
    carveTunnel(broods[0].cx,broods[0].cy,broods[1].cx,broods[1].cy,0.5),
    carveTunnel(broods[2].cx,broods[2].cy,entrance.cx-5,entrance.cy,0.5),
    carveTunnel(broods[3].cx,broods[3].cy,entrance.cx+5,entrance.cy,0.5),
  ];
  for(const cells of loops){
    if(cells.length<8) continue;
    /* the crawl seals the loop's whole cross-section: a 3×3 stamp around a
       mid cell, so the widened bore can't be walked around upright */
    let mid=null;
    for(let k=0;k<cells.length&&!mid;k++){
      const c=cells[Math.floor(cells.length/2)+((k%2)? k:-k)/2|0];
      if(c&&grid3[c.y][c.x]===0) mid=c;
    }
    if(!mid) continue;
    for(let oy=-1;oy<=1;oy++)for(let ox=-1;ox<=1;ox++){
      const xx=mid.x+ox, yy=mid.y+oy;
      if(inB(xx,yy)&&(grid3[yy][xx]===0||grid3[yy][xx]===4)) grid3[yy][xx]=2;
    }
  }
  /* the chasm: a strip across the north exit of the central chamber, with
     one rock bridge carrying the fissure approach over it */
  for(let y=12;y<=14;y++)for(let x=17;x<=29;x++)
    if(inB(x,y)) grid3[y][x]=5;
  for(let y=12;y<=14;y++) grid3[y][23]=6;
  /* make sure the approach lines up with the bridge */
  for(const y of[9,10,11,15,16]) if(grid3[y][23]===1) grid3[y][23]=0;
  /* the stream: west edge → under the central chamber's south half → east */
  {
    const way=[[1,25],[8,26],[15,24],[23,26],[30,24],[38,26],[45,25]];
    for(let i=0;i<way.length-1;i++){
      let [x,y]=way[i]; const [bx,by]=way[i+1];
      let guard=140;
      while((x!==bx||y!==by)&&guard-->0){
        if(x>0&&y>0&&x<CW-1&&y<CH-1&&grid3[y][x]!==5&&grid3[y][x]!==6) grid3[y][x]=3;
        const dx=Math.sign(bx-x), dy=Math.sign(by-y);
        if(dx!==0&&dy!==0){ if(srand()<0.5)x+=dx; else y+=dy; }
        else { x+=dx; y+=dy; }
        if(srand()<0.22&&y+1<CH-1&&grid3[y+1][x]===1) grid3[y+1][x]=3;
      }
    }
  }
  /* scree: loud gravel aprons along the chamber rims */
  for(const c of CAVE.chambers){
    let n=Math.round(c.r*1.6)+Math.floor(srand()*4);
    for(let t=0;t<60&&n>0;t++){
      const a=srand()*Math.PI*2, rr=c.r*(0.55+srand()*0.45);
      const x=Math.round(c.cx+Math.cos(a)*rr), y=Math.round(c.cy+Math.sin(a)*rr);
      if(inB(x,y)&&grid3[y][x]===0){ grid3[y][x]=4; n--; }
    }
  }
  /* sealed alternate tunnels — one per brood, opened by that brood's burn */
  CAVE.events=[];
  const seal=(cells)=>{
    const sealed=[];
    for(const c of cells) if(grid3[c.y][c.x]===0){
      /* only cells this carve opened get resealed; crossings stay open */
      grid3[c.y][c.x]=7; sealed.push(c);
    }
    return sealed;
  };
  const altWays=[
    carveTunnel(broods[0].cx+1,broods[0].cy+3, 16,17, 0.55, false),
    carveTunnel(broods[1].cx-1,broods[1].cy+3, 30,17, 0.55, false),
    carveTunnel(broods[2].cx+1,broods[2].cy-3, 16,24, 0.55, false),
    carveTunnel(broods[3].cx-1,broods[3].cy-3, 30,24, 0.55, false),
  ];
  for(const w of altWays) CAVE.events.push({openCells:seal(w), pile:null, closed:null});
  /* the fissure pocket: two cells behind a rubble choke at the very north */
  for(const y of[2,3]) grid3[y][23]=0;
  grid3[4][23]=7;
  for(const y of[5,6]) if(grid3[y][23]===1) grid3[y][23]=0;
  CAVE.fissurePocket={cx:23,cy:2};
  CAVE.fissureChoke={cx:23,cy:4};
  CAVE.approachC={cx:23,cy:6};
  CAVE.bridgeC=[{cx:23,cy:12},{cx:23,cy:13},{cx:23,cy:14}];
  /* ---- connectivity repair (crouched player, from the spawn) ---- */
  const spawnC={cx:entrance.cx, cy:entrance.cy+1};
  for(let iter=0;iter<160;iter++){
    const seen=flood(spawnC.cx,spawnC.cy,crouchBlocked);
    let fixed=false;
    outer:
    for(let y=1;y<CH-1;y++)for(let x=1;x<CW-1;x++){
      const t=grid3[y][x];
      if(t===1||t===5||t===7||seen.has(K(x,y))) continue;
      for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){
        const bx=x+dx, by=y+dy;
        if(codeAt(bx,by)!==1) continue;
        for(const[ex,ey]of[[1,0],[-1,0],[0,1],[0,-1]]){
          if(seen.has(K(bx+ex,by+ey))){ grid3[by][bx]=0; fixed=true; break outer; }
        }
      }
    }
    if(!fixed) break;
  }
  /* the matriarch must be able to tend every brood: if a squeeze severed a
     spoke, it reverts (the loops keep theirs) */
  const mOK=()=>{
    const seen=flood(central.cx,central.cy,isBlockedSpider3);
    return broods.every(b=>seen.has(K(b.cx,b.cy)))&&seen.has(K(entrance.cx,entrance.cy));
  };
  if(!mOK()){
    for(let y=1;y<CH-1&&!mOK();y++)for(let x=1;x<CW-1&&!mOK();x++)
      if(grid3[y][x]===2) grid3[y][x]=0;
  }
  /* ceiling heights: tunnels vary 4.8–6.6m, chambers dome to their h */
  ceilH=Array.from({length:CH},()=>Array(CW).fill(5.0));
  for(let y=0;y<CH;y++)for(let x=0;x<CW;x++){
    if(grid3[y][x]===2){ ceilH[y][x]=1.35; continue; }
    ceilH[y][x]=4.8+hash(x*31.7+y*17.3)*1.8;
    for(const c of CAVE.chambers){
      const d=Math.hypot(x-c.cx,y-c.cy);
      if(d<=c.r+0.6) ceilH[y][x]=Math.max(ceilH[y][x], lerp(c.h,c.h*0.5,clamp(d/(c.r+0.6),0,1)));
    }
  }
  /* ---- the corner grids the surface fields sample ----
     Ceiling corners take the MIN of their adjacent open cells (chambers
     slope into tunnel mouths) plus jitter — then the hard clamp: any
     corner touching a cell you can stand in never dips below 3.95m, so
     with worst-case crag detail the vault still clears twice a standing
     player. Corners buried in all-squeeze stay at crawl height. */
  cH=[];
  for(let cy=0;cy<=CH;cy++){
    cH[cy]=[];
    for(let cx=0;cx<=CW;cx++){
      let mn=1e9, any=false, sqOnly=true;
      for(const[ox,oy]of[[-1,-1],[0,-1],[-1,0],[0,0]]){
        const x=cx+ox, y=cy+oy;
        if(x<0||y<0||x>=CW||y>=CH||grid3[y][x]===1) continue;
        any=true; mn=Math.min(mn,ceilH[y][x]);
        if(grid3[y][x]!==2) sqOnly=false;
      }
      if(!any){ cH[cy][cx]=0; continue; }
      const h=mn+(hash(cx*13.37+cy*7.77)-0.5)*0.9;
      cH[cy][cx]= sqOnly? clamp(h,1.3,1.6) : Math.max(h,3.95);
    }
  }
  /* floor corners: rolling stone, damped flat where gameplay stands on the
     numbers — stream bed, bridge & chasm lips, squeezes, the spawn (and
     the corpse beside it), the brood pads, the fissure's alcove floor */
  fH=[]; fW=[];
  const fissureFlats=[{cx:23,cy:2},{cx:23,cy:3},{cx:23,cy:4},{cx:23,cy:5},{cx:23,cy:6}];
  for(let cy=0;cy<=CH;cy++){
    fH[cy]=[]; fW[cy]=[];
    for(let cx=0;cx<=CW;cx++){
      let allRock=true, nearStream=false, nearFlat=false, nearBank=false;
      for(const[ox,oy]of[[-1,-1],[0,-1],[-1,0],[0,0]]){
        const x=cx+ox, y=cy+oy;
        const t=(x<0||y<0||x>=CW||y>=CH)? 1 : grid3[y][x];
        if(t!==1) allRock=false;
        if(t===3) nearStream=true;
        if(t===5||t===6||t===2) nearFlat=true;
        if(x>=0&&y>=0&&x<CW&&y<CH&&isBankCell(x,y)) nearBank=true;
      }
      if(allRock){ fH[cy][cx]=0; fW[cy][cx]=0; continue; }
      if(nearStream){ fH[cy][cx]=-0.25; fW[cy][cx]=0; continue; }
      /* THE BANK RISES. Every corner around the water used to be locked at
         the bed height, which meant there was no bank at all — the ground was
         dead flat across the waterline and the surface had to begin somewhere
         abrupt, so it read as a sheet with a hem cut on the 4m grid. One ring
         out the rock lifts clear of the water line instead, and the shoreline
         becomes what a shoreline is: the contour where the bank crosses the
         water. Checked AFTER nearStream so the bed's own corners keep their
         depth — and it KEEPS its detail weight, unlike every other damped
         corner here. A bank with fW 0 is pure bilinear, so the contour across
         it comes out smooth and very nearly axis-aligned: a shoreline with
         90° jogs in it. The ripple is what makes it wander, and since fW
         lerps to 0 at the bed corners the bed stays as flat as it needs to. */
      if(nearBank){
        fH[cy][cx]=0.30+(hash(cx*4.41+cy*8.13)-0.5)*0.16; fW[cy][cx]=0.55; continue;
      }
      if(nearFlat){ fH[cy][cx]=0; fW[cy][cx]=0; continue; }
      let h=(hash(cx*9.13+cy*5.71)-0.5)*0.62+(hash(cx*2.11+cy*3.07)-0.5)*0.5;
      let w=1;
      /* radial flats: k=0 dead center, 1 at the rim */
      const flat=(bx,by,r)=>{
        const k=clamp(Math.hypot(cx-0.5-bx,cy-0.5-by)/r,0,1);
        h*=k*k; w=Math.min(w,k);
      };
      flat(spawnC.cx,spawnC.cy,3.4);
      for(const b of broods) flat(b.cx,b.cy,2.6);
      for(const f of fissureFlats) flat(f.cx,f.cy,1.8);
      fH[cy][cx]=h; fW[cy][cx]=w;
    }
  }
  /* silk-laced floors around the nests */
  CAVE.silk.clear();
  for(const b of broods)
    for(let y=b.cy-3;y<=b.cy+3;y++)for(let x=b.cx-3;x<=b.cx+3;x++)
      if(inB(x,y)&&Math.hypot(x-b.cx,y-b.cy)<=3.3) CAVE.silk.add(K(x,y));
  /* reach caches */
  const seen=flood(spawnC.cx,spawnC.cy,crouchBlocked);
  CAVE.reach=seen;
  CAVE.reachList=[...seen].map(k=>({cx:k%CW,cy:(k/CW)|0}))
    .filter(c=>grid3[c.cy][c.cx]!==5);
  const mSeen=flood(central.cx,central.cy,isBlockedSpider3);
  CAVE.mReachList=[...mSeen].map(k=>({cx:k%CW,cy:(k/CW)|0}));
  CAVE.broods=broods.map(b=>({cx:b.cx, cy:b.cy, center:cellToWorld3(b.cx,b.cy), clutch:null, burned:false}));
  CAVE.entrance=entrance;
  const sp=cellToWorld3(spawnC.cx,spawnC.cy);
  CAVE.spawn=new THREE.Vector3(sp.x,0,sp.z-1.2);
  CAVE.spawnYaw=Math.PI;                         // facing +z? no: face the cave (−z is north)
  CAVE.spawnYaw=0;                               // yaw 0 faces −z, into the warren
  CAVE.streamCells=[];
  for(let y=0;y<CH;y++)for(let x=0;x<CW;x++)
    if(grid3[y][x]===3) CAVE.streamCells.push(cellToWorld3(x,y));
  /* the clearance audit: the fields guarantee ≥2× player height over every
     upright-walkable cell by construction — this tripwire only fires if a
     future edit breaks that invariant */
  let low=0;
  for(let y=1;y<CH-1;y++)for(let x=1;x<CW-1;x++){
    const t=grid3[y][x];
    if(t!==0&&t!==3&&t!==4&&t!==6) continue;
    const p=cellToWorld3(x,y);
    for(const[ox,oz]of[[0,0],[-1.4,0],[1.4,0],[0,-1.4],[0,1.4]])
      if(ceilYAt(p.x+ox,p.z+oz)-floorYAt(p.x+ox,p.z+oz)<3.55) low++;
  }
  if(low) console.warn(`[cave] ${low} low-clearance samples slipped the clamp`);
  return {entrance, central, broods, spawnC};
}

/* ---------------- materials (module singletons) ---------------- */
/* the rock's own canvas doubles as its bump map: under the lantern's
   spotlight the joints, pits and grain become real surface relief. The
   bumpScale is up from 0.055 — the old map had almost nothing at close
   range to make relief OUT of, so the walls read as smooth card. */
/* every rock wall face is subdivided into this many rows, regardless of
   how tall it is — see the wall builder for why it has to be global */
const WALL_ROWS=10;
const rockMat=new THREE.MeshPhongMaterial({map:texCaveRock, bumpMap:texCaveRock, bumpScale:0.14,
  specular:0x1a1a16, shininess:10, emissive:0x010101});
const floorMat=new THREE.MeshPhongMaterial({map:texCaveFloor, bumpMap:texCaveFloor, bumpScale:0.07,
  specular:0x0a0a08, shininess:4});
/* Dripstone is pale calcite, not the parent rock; the streaked skin is its
   own bump map so runnels read as ridges in the beam.
   Damp calcite, NOT wet chrome. specular 0x3e4a52 at shininess 46 put a
   single tight highlight down each lathe, and against the lantern's orange
   that read as polished brass — the formations looked die-cast. Real
   dripstone is a chalky body with a broad, weak sheen, so the highlight is
   now wide and dim and the base colour is warmer and darker than the
   texture suggests (the map itself is already pale). */
const wetMat=new THREE.MeshPhongMaterial({map:texDripstone, bumpMap:texDripstone, bumpScale:0.10,
  color:0x6d6d67, specular:0x14171a, shininess:9, emissive:0x020303});
/* flowstone curtains hang free of the wall — both faces show */
const curtainMat=new THREE.MeshPhongMaterial({map:texDripstone, bumpMap:texDripstone, bumpScale:0.105,
  color:0x62625d, specular:0x101315, shininess:7, emissive:0x020303, side:THREE.DoubleSide});
const pitMat=new THREE.MeshPhongMaterial({color:0x070605, specular:0x000000, shininess:1});
/* a soft radial glow, shared by every halo in the level */
const HALO_TEX=makeCanvas(64,64,(g,w,h)=>{
  const gr=g.createRadialGradient(w/2,h/2,2,w/2,h/2,w/2);
  gr.addColorStop(0,"rgba(255,255,255,0.9)");
  gr.addColorStop(0.45,"rgba(255,255,255,0.28)");
  gr.addColorStop(1,"rgba(255,255,255,0)");
  g.fillStyle=gr; g.fillRect(0,0,w,h);
});
/* ================= the stream =================
   The old water was one flat quad per cell at a fixed y, 0–1 UVs, and a 128²
   skin of ten full-width sine curves. Three independent ways of reading as a
   sheet of blue plastic laid down the tunnel:

     · it HOVERED. The bed under a stream cell is locked flat at −0.25 and
       the plane sat at −0.06, so the water ended against the rock in a hard
       straight line 0.19m up in the air, on the 4m grid, with a visible
       polygon edge. Water in a channel has a shoreline; this had a hem.
     · every cell showed the same 0–1 tile, and the streaks don't wrap, so
       there was a seam every 4m in both axes at 32 px/m.
     · a dead-flat plane under a point light has exactly ONE broad highlight.
       Water has a thousand small ones, and that is most of what tells you it
       is a liquid rather than a painted floor.

   What replaces it is a LENS whose surface comes down to meet the rock at
   the channel edge, a separate caustic net lying on the bed beneath it, and
   the two drifting at different rates and headings — the parallax between
   them is where the depth comes from. */
const WATER_Y=-0.06;
/* draw fn wrapped, but only for shapes that actually straddle an edge */
const wwrap=(x,y,r,w,h,fn)=>{
  for(const ox of (x-r<0? [0,w] : x+r>w? [0,-w] : [0]))
    for(const oy of (y-r<0? [0,h] : y+r>h? [0,-h] : [0])) fn(ox,oy);
};
/* the caustic net cast on the BED. A real caustic is a web of bright lines
   enclosing darker cells, with the light piling up where the web crosses —
   so that is what this is: wobbled loops at three scales whose crossings sum
   into bright nodes. Nothing in it is a long smooth curve and everything is
   drawn wrapped, which is the lesson texCaveRock's header spells out and the
   sine-streak version never learned. Left DARK on average: this is water
   over stone, and it should dim the bed everywhere the light isn't focused. */
const texCaustic=makeCanvas(256,256,(g,w,h)=>{
  g.fillStyle="#04141a"; g.fillRect(0,0,w,h);
  for(const[n,rMin,rSpan,lw,a]of[[24,26,34,2.4,0.10],[44,12,20,1.7,0.13],[66,5,10,1.2,0.15]]){
    for(let i=0;i<n;i++){
      const x=Math.random()*w, y=Math.random()*h, r=rMin+Math.random()*rSpan;
      const sq=0.55+Math.random()*0.8, rot=Math.random()*Math.PI;
      const p1=Math.random()*7, p2=Math.random()*7;
      const h1=0.20+Math.random()*0.30, h2=0.10+Math.random()*0.22;
      wwrap(x,y,r*1.6,w,h,(ox,oy)=>{
        g.strokeStyle=`rgba(150,224,236,${a})`; g.lineWidth=lw;
        g.beginPath();
        for(let k=0;k<=28;k++){
          const th=k/28*Math.PI*2;
          const rr=r*(1+h1*Math.sin(th*2+p1)+h2*Math.sin(th*3+p2));
          const ex=Math.cos(th)*rr, ey=Math.sin(th)*rr*sq;
          const px=x+ox+ex*Math.cos(rot)-ey*Math.sin(rot);
          const py=y+oy+ex*Math.sin(rot)+ey*Math.cos(rot);
          k?g.lineTo(px,py):g.moveTo(px,py);
        }
        g.stroke();
      });
    }
  }
  for(let i=0;i<150;i++){            // the focused cusps themselves
    const x=Math.random()*w, y=Math.random()*h, r=1.6+Math.random()*4.4;
    const a=0.14+Math.random()*0.2;
    wwrap(x,y,r,w,h,(ox,oy)=>{
      const gr=g.createRadialGradient(x+ox,y+oy,0,x+ox,y+oy,r);
      gr.addColorStop(0,`rgba(198,241,250,${a})`); gr.addColorStop(1,"rgba(198,241,250,0)");
      g.fillStyle=gr; g.beginPath(); g.arc(x+ox,y+oy,r,0,7); g.fill();
    });
  }
  for(let i=0;i<20;i++){             // silt shadow, so the bed is never one tone
    const x=Math.random()*w, y=Math.random()*h, r=30+Math.random()*70;
    const a=0.10+Math.random()*0.12;
    wwrap(x,y,r,w,h,(ox,oy)=>{
      const gr=g.createRadialGradient(x+ox,y+oy,r*0.1,x+ox,y+oy,r);
      gr.addColorStop(0,`rgba(2,10,14,${a})`); gr.addColorStop(1,"rgba(2,10,14,0)");
      g.fillStyle=gr; g.beginPath(); g.arc(x+ox,y+oy,r,0,7); g.fill();
    });
  }
});
/* the surface skin: what the lantern glints off. Kept LIGHT and near-neutral
   — the water's colour is carried by the per-vertex depth tint, not by this —
   and every mark on it is SHORT and kinked. Long smooth streaks are exactly
   what turned the old map into worms crawling downstream. */
const texWaterSurf=makeCanvas(256,256,(g,w,h)=>{
  g.fillStyle="#c2d2d5"; g.fillRect(0,0,w,h);
  for(let i=0;i<24;i++){             // the slow shear of a current
    const x=Math.random()*w, y=Math.random()*h, r=34+Math.random()*76;
    const lite=Math.random()<0.5, a=0.06+Math.random()*0.09;
    wwrap(x,y,r,w,h,(ox,oy)=>{
      const gr=g.createRadialGradient(x+ox,y+oy,r*0.1,x+ox,y+oy,r);
      gr.addColorStop(0,lite?`rgba(232,246,248,${a})`:`rgba(112,136,142,${a})`);
      gr.addColorStop(1,"rgba(0,0,0,0)");
      g.fillStyle=gr; g.beginPath(); g.arc(x+ox,y+oy,r,0,7); g.fill();
    });
  }
  for(let fam=0;fam<3;fam++){        // ripple striations, a couple of headings
    const base=Math.random()*Math.PI;
    for(let i=0;i<130;i++){
      const x=Math.random()*w, y=Math.random()*h;
      const len=6+Math.random()*22, segs=2+Math.floor(Math.random()*2);
      const lite=Math.random()<0.55, a=0.08+Math.random()*0.14;
      let aa=base+(Math.random()-0.5)*0.6;
      wwrap(x,y,len,w,h,(ox,oy)=>{
        g.strokeStyle=lite?`rgba(240,251,252,${a})`:`rgba(96,120,128,${a})`;
        g.lineWidth=0.8+Math.random()*1.5;
        g.beginPath(); g.moveTo(x+ox,y+oy);
        let cx=x+ox, cy=y+oy, an=aa;
        for(let s=0;s<segs;s++){
          an+=(Math.random()-0.5)*0.7;
          cx+=Math.cos(an)*len/segs; cy+=Math.sin(an)*len/segs;
          g.lineTo(cx,cy);
        }
        g.stroke();
      });
    }
  }
  for(let i=0;i<1100;i++){           // glitter: the specular chips
    const v=Math.random()<0.6;
    g.fillStyle=v?`rgba(255,255,255,${0.10+Math.random()*0.18})`
                 :`rgba(84,106,114,${0.08+Math.random()*0.14})`;
    g.fillRect(Math.random()*w,Math.random()*h,1+Math.random()*2,1+Math.random()*2);
  }
});
markShared(HALO_TEX,texCaustic,texWaterSurf,wetMat,curtainMat,texDripstone);
const silkFloorMat=new THREE.MeshPhongMaterial({color:0xb8bcc0, specular:0x222222, shininess:8,
  transparent:true, opacity:0.34, depthWrite:false});
const cocoonMat=new THREE.MeshPhongMaterial({map:texCocoon, bumpMap:texCocoon, bumpScale:0.02,
  color:0x909698, specular:0x2a2c2c, shininess:12});
const TEX_MOUND=texCocoon.clone(); TEX_MOUND.center.set(0.5,0.5);
TEX_MOUND.rotation=Math.PI/2; TEX_MOUND.repeat.set(2,2); TEX_MOUND.needsUpdate=true;
const moundMat=new THREE.MeshPhongMaterial({map:TEX_MOUND, bumpMap:TEX_MOUND, bumpScale:0.02,
  color:0x8a9092, specular:0x242626, shininess:10});
const eggMat=()=>new THREE.MeshPhongMaterial({map:texEggSac, color:0x8fa8b2,
  specular:0x40565f, shininess:44, emissive:0x123540});
const boneMat=new THREE.MeshPhongMaterial({map:texBone, bumpMap:texBone, bumpScale:0.006,
  color:0x8e8778, specular:0x2c2a24, shininess:16});
const clothMat=new THREE.MeshPhongMaterial({map:texCloth, bumpMap:texCloth, bumpScale:0.008,
  color:0x585048, specular:0x0c0b0a, shininess:4});
/* the outer layer reads darker and slightly greener than the shirt under
   it, so the coat separates from the body instead of merging into one
   uniform tan mass; boots and belt are near-black oiled leather */
const coatMat=new THREE.MeshPhongMaterial({map:texCloth, bumpMap:texCloth, bumpScale:0.012,
  color:0x3e4038, specular:0x100f0c, shininess:5});
const bootMat=new THREE.MeshPhongMaterial({map:texCloth, color:0x2a2724,
  specular:0x1a1714, shininess:22});
const beltMat=new THREE.MeshPhongMaterial({map:texCloth, color:0x33291f,
  specular:0x241d14, shininess:18});
const brassMat=new THREE.MeshPhongMaterial({color:0x6e5a2e, specular:0x8a7340, shininess:55});
markShared(rockMat,floorMat,pitMat,silkFloorMat,cocoonMat,boneMat,clothMat,brassMat,
           texCaveRock,texCaveFloor,texCocoon,TEX_MOUND,moundMat,texCloth,texBone,texJournalPages,
           coatMat,bootMat,beltMat);
/* silk is LIT (Phong, not Basic): it glistens where the lantern rakes it
   and takes the fungus tint near the broods, instead of glowing flat white
   in the dark. A faint emissive keeps it readable at the threshold.
   The specular is deliberately softer than it looks like it should be —
   the maps are thread-shaped now, so the highlight lands on the threads
   themselves; at the old strength every sheet turned into wet glass. */
const silkMat=t=>new THREE.MeshPhongMaterial({map:t, transparent:true, depthWrite:false,
  side:THREE.DoubleSide, color:0xc8ccce, emissive:0x141618, specular:0x5c6268, shininess:22});
const webSheetMats=[silkMat(makeWebSheetTexture(false)),silkMat(makeWebSheetTexture(false))];
const webTornMat  = silkMat(makeWebSheetTexture(true));
const webFanMats  =[silkMat(makeCobwebTexture()),silkMat(makeCobwebTexture())];
const webStrandMat= silkMat(makeStrandTexture());
const webFunnelMat= silkMat(makeFunnelTexture());
webStrandMat.color.set(0xa8aeb2); webStrandMat.opacity=0.75;   // guys read as silk, not wire
const webAllMats=[...webSheetMats,webTornMat,...webFanMats,webStrandMat,webFunnelMat];
webAllMats.forEach(m=>{markShared(m); markShared(m.map);});
/* the mushroom skin atlas (diffuse + emissive) shared by every colony */
const FSKIN=makeFungusSkin();
markShared(FSKIN.map,FSKIN.emit);

/* ---------------- fungus geometry: real mushrooms, lathe-built ----------------
   Every variety is a LatheGeometry whose profile points are hand-mapped into
   the skin atlas strips (stem fibers / glowing gills / banded cap / speckled
   bulb), so caps read as caps and undersides actually radiate. All meshes of
   a colony merge into ONE draw on the colony's Phong material — the glow is
   emissive (lights.js cold branch drives it), so shapes keep their shading. */
const F_STEM=[0.05,0.21], F_GILL=[0.30,0.46], F_CAP=[0.55,0.71], F_BULB=[0.79,0.96];
const fv=(s,f)=>s[0]+(s[1]-s[0])*f;
function latheFungus(P,B,segs){
  const g=new THREE.LatheGeometry(P.map(p=>new THREE.Vector2(p[0],p[1])),segs);
  const uv=g.attributes.uv, N=P.length;
  for(let i=0;i<uv.count;i++) uv.setY(i, B[Math.round(uv.getY(i)*(N-1))]);
  return g;
}
/* a classic toadstool: flared stem, radiating gill underside, domed cap.
   The cap is now a real DOME — a cosine shoulder instead of the old
   straight taper — and its margin curls under with actual thickness, so
   the silhouette is a mushroom rather than a disc balanced on a pin. */
function toadstoolGeo(rc,rs,hs,ch){
  const P=[],B=[];
  P.push([rs*1.4,0]);            B.push(fv(F_STEM,0.02));
  P.push([rs*1.05,hs*0.3]);      B.push(fv(F_STEM,0.35));
  P.push([rs*0.92,hs*0.8]);      B.push(fv(F_STEM,0.75));
  P.push([rs,hs]);               B.push(fv(F_STEM,0.98));
  P.push([rs*1.15,hs+0.004]);    B.push(fv(F_GILL,0.03));
  P.push([rc*0.55,hs+0.010]);    B.push(fv(F_GILL,0.42));
  P.push([rc*0.90,hs+0.030]);    B.push(fv(F_GILL,0.86));
  P.push([rc*0.99,hs+0.058]);    B.push(fv(F_GILL,0.99));   // up into the curled margin
  P.push([rc,hs+0.088]);         B.push(fv(F_CAP,0.02));    // the rim's outer edge
  for(let i=1;i<=5;i++){                                    // the dome itself
    const t=i/5;
    P.push([rc*Math.cos(t*Math.PI/2)*(1-0.04*t), hs+0.088+ch*Math.sin(t*Math.PI/2)]);
    B.push(fv(F_CAP,0.08+t*0.9));
  }
  P.push([0.001,hs+0.088+ch*1.01]); B.push(fv(F_CAP,1));
  return latheFungus(P,B,11);
}
/* a shelf conk: stemless cap, half of it buried in the rock face */
function conkGeo(rc){
  const P=[],B=[];
  P.push([0.02,0.0]);            B.push(fv(F_GILL,0.02));
  P.push([rc*0.50,0.010]);       B.push(fv(F_GILL,0.44));
  P.push([rc*0.88,0.034]);       B.push(fv(F_GILL,0.84));
  P.push([rc*0.98,0.070]);       B.push(fv(F_GILL,0.99));   // the margin has a lip
  P.push([rc,0.105]);            B.push(fv(F_CAP,0.02));
  for(let i=1;i<=5;i++){                                    // a swollen shelf, not a wedge
    const t=i/5;
    P.push([rc*Math.cos(t*Math.PI/2)*(1-0.05*t), 0.105+rc*0.40*Math.sin(t*Math.PI/2)]);
    B.push(fv(F_CAP,0.08+t*0.9));
  }
  P.push([0.001,0.105+rc*0.405]); B.push(fv(F_CAP,1));
  return latheFungus(P,B,12);
}
/* one coral finger: a tapered spindle, tip mapped to the bright bulb crown */
function fingerGeo(r,hgt){
  const P=[[r,0],[r*0.9,hgt*0.35],[r*0.68,hgt*0.65],[r*0.38,hgt*0.86],[0.001,hgt]];
  const B=[fv(F_BULB,0.03),fv(F_BULB,0.3),fv(F_BULB,0.6),fv(F_BULB,0.85),fv(F_BULB,1)];
  return latheFungus(P,B,10);
}
/* a puffball: squashed sphere remapped into the pore-speckled bulb strip */
function puffGeo(r){
  const g=new THREE.SphereGeometry(r,16,12);
  const uv=g.attributes.uv;
  for(let i=0;i<uv.count;i++) uv.setY(i, fv(F_BULB, uv.getY(i)*0.85+0.05));
  return g;
}
/* a mycelium cord: a thin tapering ribbon that follows the DISPLACED rock
   surface point by point — real geometry, not a decal (it undulates with
   the relief it grows over).
   IT IS SKINNED AS STIPE, NOT AS BULB. Mycelium is the same pale flesh
   the stalk is made of, and the stem strip's emissive is what that wants:
   near-dark, a few threads of glow running through it. Mapped into the
   BULB strip — which is the pore skin, the brightest thing on the atlas —
   a branching system stopped being a root and became a bolt of white
   lightning painted across the rock, brighter than the mushrooms it was
   supposed to be feeding. The glow belongs to the fruiting body. */
function cordGeo(pts){
  const pos=[],nor=[],uv=[],idx=[];
  const N=pts.length;
  for(let i=0;i<N;i++){
    const p=pts[i], q=pts[Math.min(i+1,N-1)], o=pts[Math.max(i-1,0)];
    let dx=q.x-o.x, dy=q.y-o.y, dz=q.z-o.z;
    const dl=Math.hypot(dx,dy,dz)||1; dx/=dl; dy/=dl; dz/=dl;
    /* ribbon side = path direction × surface normal */
    let sx=dy*p.nz-dz*p.ny, sy=dz*p.nx-dx*p.nz, sz=dx*p.ny-dy*p.nx;
    const sl=Math.hypot(sx,sy,sz)||1, w=p.w/2;
    sx*=w/sl; sy*=w/sl; sz*=w/sl;
    pos.push(p.x-sx,p.y-sy,p.z-sz, p.x+sx,p.y+sy,p.z+sz);
    nor.push(p.nx,p.ny,p.nz, p.nx,p.ny,p.nz);
    uv.push(i*0.8, fv(F_STEM,0.25), i*0.8, fv(F_STEM,0.75));
    if(i<N-1){ const a=i*2; idx.push(a,a+1,a+3, a,a+3,a+2); }
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute("position",new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute("normal",new THREE.Float32BufferAttribute(nor,3));
  g.setAttribute("uv",new THREE.Float32BufferAttribute(uv,2));
  g.setIndex(idx);
  return g;
}

/* ---------------- rhizomorphs: the colony's ROOT SYSTEM ---------------
   A mycelial cord is not a line, and a root system is not a starburst.
   The first pass drew 2-4 unbranched ribbons of even weight leaving the
   colony's CENTRE and running off in straight-ish sweeps — five strokes
   from a point, growing out of nothing in particular. Three things are
   what make a growth read as ROOT rather than as paint:

     · it LEAVES A MUSHROOM. Cords start at the base of an actual
       fruiting body — the stipe of a toadstool, the underside of a
       bracket shelf — never at the group's average position.
     · it FORKS, and every daughter is markedly thinner than its parent.
       Equal-weight children are a fishbone. The hierarchy — trunk, two
       or three primaries, their own branches, hair-fine tips — is the
       whole silhouette; a cord that only tapers is still one line.
     · it CLINGS. Every point is placed on the real displaced surface,
       and a wall system that reaches the skirting LAYS OVER onto the
       floor and keeps going: the ribbon rolls from standing in the wall
       plane to lying flat, over about a third of a metre. Stopping dead
       at the foot is what left the old cords looking stuck on.

   One walker does both surfaces. `mode` flips from wall to floor when a
   branch reaches the foot, and the heading it was carrying down the face
   becomes the heading it carries out across the ground. Cost is held by
   a per-colony segment BUDGET, and the whole system merges into the
   colony's single mesh — twenty branches still cost zero extra draws. */
function rhizoSystem(cfg){
  const out=[];
  let budget=cfg.budget;
  const UPX=cfg.onWall? ((cfg.fdy!==0)?1:0) : 0;      // the wall-parallel axis
  const UPZ=cfg.onWall? ((cfg.fdx!==0)?1:0) : 0;
  const wnx=-cfg.fdx, wnz=-cfg.fdy;                   // wall normal, into the room

  const emit=(br,pts)=>{
    if(br.mode==="wall"){
      const wx=cfg.ax+UPX*br.u, wz=cfg.az+UPZ*br.u;
      const fy=floorYAt(wx,wz), y=Math.max(br.y,fy+0.03);
      /* t: 1 well up the face, 0 at the foot. It rolls the ribbon's plane
         from the wall's onto the floor's, and takes the stand-off out
         with it, so the lay-over has no crease in it. */
      const t=clamp((y-fy-0.04)/0.34,0,1);
      const nx=wnx*t, nz=wnz*t, ny=1-t, nl=Math.hypot(nx,ny,nz)||1;
      const F=wallField(wx,y,wz);
      pts.push({x:wx+F.x+wnx*0.03*t, y:y, z:wz+F.z+wnz*0.03*t,
                nx:nx/nl, ny:ny/nl, nz:nz/nl, w:br.w});
    } else {
      pts.push({x:br.x, y:floorYAt(br.x,br.z)+0.03, z:br.z, nx:0,ny:1,nz:0, w:br.w});
    }
  };
  /* one step along the surface. A DRIFTING heading, never an independent
     kick per step — that came out as neon lightning scribbled on the rock */
  const step=(br)=>{
    if(br.bias) br.head-=br.head*br.bias;        // a cord with somewhere to be
    br.head+=(srand()-0.5)*br.wob; br.head*=0.94;
    if(br.mode==="wall"){
      br.u+=Math.sin(br.head)*br.step;
      br.y-=Math.cos(br.head)*br.step;
      const wx=cfg.ax+UPX*br.u, wz=cfg.az+UPZ*br.u;
      if(br.y<=floorYAt(wx,wz)+0.05){                  // the foot: lay over and run on
        br.mode="floor"; br.x=wx; br.z=wz;
        br.head=Math.atan2(wnz,wnx)+br.head*0.7;       // out into the room, keeping its lean
      }
    } else {
      br.x+=Math.cos(br.head)*br.step;
      br.z+=Math.sin(br.head)*br.step;
    }
  };
  const grow=(br,depth)=>{
    const pts=[];
    emit(br,pts);
    for(let n=0;n<br.len&&budget>0;n++){
      step(br); budget--;
      br.w*=br.taper;
      emit(br,pts);
      if(depth<3&&n>0&&n<br.len-1&&budget>12&&srand()<br.fork){
        /* the daughter leaves from exactly where the parent stands, so a
           fork can never open a gap; the parent leans off it and thins */
        const div=rand(0.45,1.15)*(srand()<0.5?-1:1);
        const d=Object.assign({},br,{head:br.head+div, w:br.w*rand(0.50,0.68),
          len:Math.max(3,Math.round(br.len*rand(0.45,0.70))),
          step:br.step*rand(0.70,0.90), fork:br.fork*0.7, wob:br.wob*1.15});
        const dp=grow(d,depth+1);
        if(dp.length>1) out.push(dp);
        br.head-=div*0.28; br.w*=0.86;
      }
    }
    /* the tips run out as HAIRS — a branch that just stops has a cut end */
    if(depth<3&&budget>9&&br.w<0.030){
      const nh=2+(srand()<0.5?1:0);
      for(let i=0;i<nh;i++){
        if(budget<4) break;
        const h=Object.assign({},br,{head:br.head+rand(-0.95,0.95),
          w:Math.min(br.w,0.013), len:3, step:br.step*0.55, taper:0.86, fork:0});
        const hp=grow(h,9);
        if(hp.length>1) out.push(hp);
      }
    }
    return pts;
  };
  /* SEVERAL primaries leave each body, not one. A single trunk that then
     divides is a TREE — and a tree drawn on a wall is what the first pass
     of this rewrite looked like. What leaves a stipe is a FAN of cords of
     roughly equal order, which then branch. */
  cfg.anchors.forEach((a,ai)=>{
    const prim=3+Math.floor(srand()*2);
    for(let k=0;k<prim;k++){
      if(budget<10) return;
      const br=cfg.onWall
        ? {mode:"wall", u:a.u, y:a.y, head:rand(-0.85,0.85)}
        : {mode:"floor", x:a.x, z:a.z, head:Math.random()*Math.PI*2};
      /* SHORT steps and EARLY forks. Long strides and a late first fork
         spend the whole budget on reach, and what comes out is three or
         four lone wires wandering two metres off across the floor. What
         a colony sits in is a MAT — densest at the stipe, thinning to
         hairs inside a metre — so the branches are short and there are
         many of them. */
      br.step=rand(0.10,0.16); br.w=cfg.w0*rand(0.72,1); br.taper=0.960;
      br.fork=0.30; br.wob=cfg.onWall?0.28:0.38; br.bias=0;
      br.len=6+Math.floor(srand()*4);
      /* the leader: one cord off the first body runs the WHOLE way to the
         foot of the wall and lays over onto the floor. Grown first so it
         gets the budget, biased toward straight down so it arrives, and
         forking less than the rest so it stays legible as the trunk. */
      if(cfg.onWall&&ai===0&&k===0){
        br.step=rand(0.15,0.20);
        br.len=Math.ceil((a.y-floorYAt(cfg.ax,cfg.az))/br.step)+5;
        br.w=cfg.w0; br.bias=0.16; br.fork=0.14;
      }
      const pts=grow(br,0);
      if(pts.length>1) out.push(pts);
    }
  });
  return out;
}

/* ---------------- dripstone geometry: grown, not turned ----------------
   Every formation starts as a lathe profile with drip-ring bulges (annual
   flowstone swells), then gets pushed out of rotational symmetry by
   per-vertex radial noise and a slow lean — so nothing reads as a cone.
   All builders grow from y=0 upward; hangers are placed rotated π. */
function dripNoise(g,seed,leanAmt){
  const pos=g.attributes.position;
  const la=Math.random()*7, lx=Math.cos(la)*leanAmt, lz=Math.sin(la)*leanAmt;
  for(let i=0;i<pos.count;i++){
    const x=pos.getX(i), y=pos.getY(i), z=pos.getZ(i);
    const a=Math.atan2(z,x);
    const n=1+0.13*Math.sin(a*3+y*2.2+seed)+0.08*Math.sin(a*5-y*3.1+seed*1.7)
             +0.05*Math.sin(a*8+y*7+seed*2.6);
    pos.setX(i, x*n+lx*y); pos.setZ(i, z*n+lz*y);
  }
  g.computeVertexNormals();
  return g;
}
/* a spire: blunt drip-ringed taper — the standard stalagmite/stalactite.
   Per-point radius jitter stacks the profile into uneven lumps, the way
   dripstone actually accretes — without it the lathe reads as a vase. */
function spireGeo(r,h,lean){
  const N=13, seed=Math.random()*10, pts=[];
  const rings=2+Math.floor(Math.random()*3), ph=Math.random()*7;
  for(let i=0;i<=N;i++){
    const t=i/N;
    let rad=r*(0.30+0.70*Math.pow(1-t,1.4));
    rad*=1+0.15*Math.sin(t*Math.PI*2*rings+ph)*Math.sin(t*Math.PI);
    if(i>0&&i<N) rad*=rand(0.86,1.16);
    pts.push(new THREE.Vector2(Math.max(rad,0.013), t*h));
  }
  return dripNoise(new THREE.LatheGeometry(pts,9),seed,lean===undefined?0.10:lean);
}
/* a full column: stalagmite and stalactite met in the middle — waisted */
function columnGeo(r,h){
  const N=16, seed=Math.random()*10, pts=[];
  const waist=rand(0.4,0.6);
  for(let i=0;i<=N;i++){
    const t=i/N;
    const d=Math.abs(t-waist)/Math.max(waist,1-waist);
    let rad=r*(0.42+0.58*Math.pow(d,1.25));
    rad*=1+0.10*Math.sin(t*Math.PI*9+seed)*Math.sin(t*Math.PI);
    if(i>0&&i<N) rad*=rand(0.90,1.10);
    pts.push(new THREE.Vector2(Math.max(rad,0.05), t*h));
  }
  return dripNoise(new THREE.LatheGeometry(pts,10),seed,0.02);
}
/* a snapped-off stump: broad, barely tapered, sheared ragged at the top */
function stumpGeo(r,h){
  const N=8, seed=Math.random()*10, pts=[];
  for(let i=0;i<=N;i++){
    const t=i/N;
    let rad=r*(0.85+0.15*(1-t))*(1+0.12*Math.sin(t*9+seed));
    if(t>0.86) rad*=Math.max(0.12,(1-t)/0.14*0.85);
    pts.push(new THREE.Vector2(Math.max(rad,0.02), t*h));
  }
  return dripNoise(new THREE.LatheGeometry(pts,8),seed,0.05);
}
/* a flowstone mound: noisy squashed dome (spire bases, stream cascades) */
function moundGeo(r,squash){
  const g=new THREE.SphereGeometry(r,9,5,0,Math.PI*2,0,Math.PI/2);
  g.scale(1,squash,1);
  return dripNoise(g,Math.random()*10,0);
}
/* a drapery curtain: wave-folded sheet, folds deepening to a scalloped hem.
   Built in the XY plane, top edge at y=+hgt/2, hanging root pinned there. */
function curtainGeo(wdt,hgt){
  const g=new THREE.PlaneGeometry(wdt,hgt,12,7);
  const pos=g.attributes.position, seed=Math.random()*10;
  for(let i=0;i<pos.count;i++){
    const x=pos.getX(i), y=pos.getY(i);
    const t=y/hgt+0.5;                    // 1 = root at the ceiling, 0 = free hem
    const fold=Math.sin(x*4.6+seed)*0.14+Math.sin(x*9.3+seed*2.1)*0.06;
    pos.setZ(i,(fold+0.03*Math.sin(y*5+seed))*(1.25-t));
    if(t<0.18) pos.setY(i, y+(0.5+0.5*Math.sin(x*5.2+seed*3))*hgt*0.16);
  }
  g.computeVertexNormals();
  return g;
}

/* ---------------- silk geometry: webs are structures, not decals ----------------
   Every web is a displaced surface strung between real anchor points —
   sheets sag off the edge they're pinned to, funnels dive into the floor
   junctions, strands are quads strung point-to-point in 3D. Nothing sits
   flat against a wall. All planes are built in XY, top edge at +hgt/2. */
/* a sagging sheet: top edge and both sides pinned, belly bulging +z and
   drooping under its own weight — the corner webs and junction fans */
function webSheetGeo(wdt,hgt,sag){
  const g=new THREE.PlaneGeometry(wdt,hgt,6,4);
  const pos=g.attributes.position, seed=Math.random()*9;
  for(let i=0;i<pos.count;i++){
    const x=pos.getX(i), y=pos.getY(i);
    const u=x/wdt+0.5, v=y/hgt+0.5;
    const belly=Math.sin(u*Math.PI)*Math.sin((1-v)*Math.PI*0.62);
    pos.setZ(i, belly*sag*(1+0.3*Math.sin(u*7+seed)));
    pos.setY(i, y-belly*sag*0.8);
    pos.setX(i, x+0.05*sag*Math.sin(v*9+seed));
  }
  g.computeVertexNormals();
  return g;
}
/* a hammock: corners pinned to its guy-lines, everything else drooping.
   Laid flat by rotation.x=-π/2, so local -z is down. */
function webHammockGeo(wdt,dep,sag){
  const g=new THREE.PlaneGeometry(wdt,dep,6,4);
  const pos=g.attributes.position, seed=Math.random()*9;
  for(let i=0;i<pos.count;i++){
    const u=pos.getX(i)/wdt+0.5, v=pos.getY(i)/dep+0.5;
    pos.setZ(i, -Math.sin(u*Math.PI)*Math.sin(v*Math.PI)*sag*(1+0.25*Math.sin(u*6+v*5+seed)));
  }
  g.computeVertexNormals();
  return g;
}
/* THE SLINGING RULE, and every slung sheet in the level obeys it.
   A hammock is pinned only at its four corners, so what the eye reads as
   "the ceiling" is the plane of those corners MINUS the belly's sag — and
   the belly is the part you actually see from underneath. Sizing the sag
   off the sheet's own footprint (up to 0.9m) and the hang off the local
   vault height (the brood canopy hung at up to 0.4×a 13m dome — FIVE
   METRES down) put big flat sheets floating in open air with four hair-thin
   guys nobody reads as load-bearing. The stalactites were never involved.
   Given the vault height, return the corner height and a sag such that the
   LOWEST point of the sheet is never more than ~1.05m under the rock. */
function slung(cv,wdt,dep){
  const gap=rand(0.12,0.45);
  const sag=Math.min(Math.min(wdt,dep)*rand(0.18,0.32), 1.05-gap);
  return {hy:cv-gap, sag:Math.max(0.08,sag)};
}
/* a funnel-weaver's retreat: ragged sheet rim sloping into a throat that
   dives toward the wall/floor junction. Rim up; throat at y=0. */
function funnelWebGeo(r,dep){
  const N=8, seed=Math.random()*10, pts=[];
  for(let i=0;i<N;i++){
    const t=i/(N-1);
    const rad=r*(0.12+0.88*Math.pow(t,1.7))*(1+0.15*Math.sin(t*9+seed));
    pts.push(new THREE.Vector2(Math.max(rad,0.02), dep*t));
  }
  /* 16 segments, not 9: at 9 the silhouette read as a faceted cone, and a
     funnel retreat is the one web the player gets close enough to count */
  return dripNoise(new THREE.LatheGeometry(pts,16),seed,0.22);
}
/* an old silk skirt wrapped around a stalagmite's base — flared at the
   floor, cinched where the wrapping gave out */
function webWrapGeo(r,hgt){
  const N=5, seed=Math.random()*10, pts=[];
  for(let i=0;i<N;i++){
    const t=i/(N-1);
    pts.push(new THREE.Vector2(r*(1.25-0.55*t)*(1+0.1*Math.sin(t*7+seed)), hgt*t));
  }
  return dripNoise(new THREE.LatheGeometry(pts,14),seed,0.05);
}
/* a veil hanging free from the vault: pinned ONLY along its top edge, so
   it tapers, sags and frays as it falls. webSheetGeo is pinned on all four
   sides — correct for a sheet strung across a corner, but hung loose from
   a ceiling it reads as a flat billboard floating in mid-air, which is
   exactly what it looked like. A hanging web has to narrow. */
function webVeilGeo(wdt,hgt){
  const g=new THREE.PlaneGeometry(wdt,hgt,5,5);
  const pos=g.attributes.position, seed=Math.random()*9;
  for(let i=0;i<pos.count;i++){
    const x=pos.getX(i), y=pos.getY(i);
    const v=0.5-y/hgt;                            // 0 at the pinned top, 1 at the hem
    const taper=1-0.60*v*v;                       // it narrows as it falls
    pos.setX(i, x*taper+Math.sin(v*3.1+seed)*0.16*v*wdt);
    pos.setY(i, y-v*v*hgt*0.12);                  // the hem sags under its own weight
    pos.setZ(i, Math.sin(x/Math.max(wdt,0.01)*2.4+seed)*0.10*v*wdt
               +Math.sin(v*4.3+seed)*0.06);
  }
  g.computeVertexNormals();
  return g;
}
/* a hanging streamer: tall narrow strip, rooted at the top, tapering and
   twisting as it falls — the thing that brushes your face in a tunnel */
function webStreamerGeo(wdt,len){
  const g=new THREE.PlaneGeometry(wdt,len,2,6);
  const pos=g.attributes.position, seed=Math.random()*9;
  const tw=rand(-1.6,1.6);
  for(let i=0;i<pos.count;i++){
    const x=pos.getX(i), v=pos.getY(i)/len+0.5;      // 1 = root at the ceiling
    const a=tw*(1-v);
    const xx=x*(0.35+0.65*v);                        // taper toward the tail
    pos.setX(i, xx*Math.cos(a)+Math.sin(v*9+seed)*0.05*(1-v));
    pos.setZ(i, xx*Math.sin(a)+Math.sin(v*6+seed*2)*0.04*(1-v));
  }
  g.computeVertexNormals();
  return g;
}
/* a guy-line: one thin quad strung between two world points, randomly
   rolled about its own axis so merged strands never share a plane */
const _sUP=new THREE.Vector3(0,1,0), _sDir=new THREE.Vector3();
function strandMesh(ax,ay,az,bx,by,bz,wdt){
  _sDir.set(bx-ax,by-ay,bz-az);
  const L=_sDir.length();
  const m=new THREE.Mesh(new THREE.PlaneGeometry(wdt,L,1,1));
  m.position.set((ax+bx)/2,(ay+by)/2,(az+bz)/2);
  m.quaternion.setFromUnitVectors(_sUP,_sDir.normalize());
  m.rotateY(Math.random()*Math.PI);
  return m;
}

/* one quad accumulator (positions/uv/normals) merged into a single mesh */
class QuadAcc{
  constructor(){this.pos=[];this.nor=[];this.uv=[];this.col=[];this.idx=[];this.vc=0;}
  quad(p1,p2,p3,p4,n,uvs){
    for(const p of[p1,p2,p3,p4]) this.pos.push(p[0],p[1],p[2]);
    for(let i=0;i<4;i++) this.nor.push(n[0],n[1],n[2]);
    for(const u of uvs) this.uv.push(u[0],u[1]);
    this.idx.push(this.vc,this.vc+1,this.vc+2, this.vc,this.vc+2,this.vc+3);
    this.vc+=4;
  }
  /* one triangle carrying per-vertex normals — the floor, which is smooth */
  triN(p1,p2,p3,n1,n2,n3,uvs){
    for(const p of[p1,p2,p3]) this.pos.push(p[0],p[1],p[2]);
    for(const n of[n1,n2,n3]) this.nor.push(n[0],n[1],n[2]);
    for(const u of uvs) this.uv.push(u[0],u[1]);
    this.idx.push(this.vc,this.vc+1,this.vc+2);
    this.vc+=3;
  }
  /* triN plus a per-vertex colour — the stream's depth tint, the one thing
     in the level that needs to vary smoothly across a surface without a
     texture to carry it. The colour attribute is attached only if something
     actually pushed one, so every other accumulator is untouched. */
  triNC(p1,p2,p3,n1,n2,n3,uvs,cols){
    this.triN(p1,p2,p3,n1,n2,n3,uvs);
    for(const c of cols) this.col.push(c[0],c[1],c[2]);
  }
  /* one triangle with its own computed face normal — the vault's facets */
  tri(p1,p2,p3,uvs){
    const ux=p2[0]-p1[0],uy=p2[1]-p1[1],uz=p2[2]-p1[2];
    const vx=p3[0]-p1[0],vy=p3[1]-p1[1],vz=p3[2]-p1[2];
    let nx=uy*vz-uz*vy, ny=uz*vx-ux*vz, nz=ux*vy-uy*vx;
    const l=Math.hypot(nx,ny,nz)||1; nx/=l; ny/=l; nz/=l;
    for(const p of[p1,p2,p3]) this.pos.push(p[0],p[1],p[2]);
    for(let i=0;i<3;i++) this.nor.push(nx,ny,nz);
    for(const u of uvs) this.uv.push(u[0],u[1]);
    this.idx.push(this.vc,this.vc+1,this.vc+2);
    this.vc+=3;
  }
  mesh(mat){
    const g=new THREE.BufferGeometry();
    g.setAttribute("position",new THREE.Float32BufferAttribute(this.pos,3));
    g.setAttribute("normal",new THREE.Float32BufferAttribute(this.nor,3));
    g.setAttribute("uv",new THREE.Float32BufferAttribute(this.uv,2));
    if(this.col.length) g.setAttribute("color",new THREE.Float32BufferAttribute(this.col,3));
    g.setIndex(this.idx);
    return new THREE.Mesh(g,mat);
  }
}

/* ---------------- prop builders ---------------- */
function makeCocoon(){
  const m=new THREE.Mesh(new THREE.SphereGeometry(rand(0.28,0.44),8,7),cocoonMat);
  m.scale.set(1,rand(1.6,2.3),1);
  m.rotation.z=(Math.random()-0.5)*0.5; m.rotation.x=(Math.random()-0.5)*0.4;
  return m;
}
/* a hand-crank lantern: brass cage, glass core, folded handle */
export function makeLanternProp(){
  const g=new THREE.Group();
  const base=new THREE.Mesh(new THREE.CylinderGeometry(0.09,0.11,0.05,10),brassMat);
  base.position.y=0.025; g.add(base);
  const glass=new THREE.Mesh(new THREE.CylinderGeometry(0.065,0.065,0.13,10),
    new THREE.MeshPhongMaterial({color:0xd8e4dc, emissive:0x0a0c0a, specular:0x889088,
      shininess:70, transparent:true, opacity:0.7}));
  glass.position.y=0.115; g.add(glass);
  for(let i=0;i<4;i++){
    const a=i/4*Math.PI*2;
    const rib=new THREE.Mesh(new THREE.BoxGeometry(0.014,0.13,0.014),brassMat);
    rib.position.set(Math.cos(a)*0.068,0.115,Math.sin(a)*0.068); g.add(rib);
  }
  const cap=new THREE.Mesh(new THREE.CylinderGeometry(0.075,0.09,0.045,10),brassMat);
  cap.position.y=0.2; g.add(cap);
  const crank=new THREE.Mesh(new THREE.BoxGeometry(0.02,0.1,0.02),brassMat);
  crank.position.set(0.1,0.06,0); crank.rotation.z=0.7; g.add(crank);
  return g;
}
/* the one who got this far: prone, face down, the lantern still clipped on */
/* The one who came before. It used to be six boxes and a sphere in two
   flat colours — the first thing the level shows you, reading as crates.
   Limbs are tapered capsules now, the ribcage shows through the rotted
   canvas, the skull has a face, and the whole body is slumped rather than
   laid out square. */
function makeCorpse(){
  const g=new THREE.Group();
  /* cloth does not run smooth over a limb — it creases, bunches at the
     joints and hangs slack. Without this the tapered cylinders read as a
     wooden artist's mannequin, which is exactly what the last pass looked
     like: correct proportions, no material truth. */
  const wrinkle=(geo,amp)=>{
    const pos=geo.attributes.position, sd=Math.random()*10;
    for(let i=0;i<pos.count;i++){
      const x=pos.getX(i), y=pos.getY(i), z=pos.getZ(i);
      const r=Math.hypot(x,z)||1e-6;
      const k=1+amp*(Math.sin(y*11+sd)*0.5+Math.sin(y*23+sd*2)*0.3
                    +Math.sin(Math.atan2(z,x)*4+y*7+sd)*0.45);
      pos.setXYZ(i, x/r*r*k, y, z/r*r*k);
    }
    geo.computeVertexNormals();
    return geo;
  };
  const limb=(x,y,z, dx,dy,dz, len, r0,r1, mat, amp)=>{
    const geo=new THREE.CylinderGeometry(r1,r0,len,9);
    geo.translate(0,len/2,0);
    if(amp!==0) wrinkle(geo, amp===undefined? 0.10:amp);
    const m=new THREE.Mesh(geo,mat);
    m.position.set(x,y,z);
    const L=Math.hypot(dx,dy,dz)||1;
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),
      new THREE.Vector3(dx/L,dy/L,dz/L));
    g.add(m);
    return [x+dx/L*len, y+dy/L*len, z+dz/L*len];
  };
  const blob=(x,y,z, r, sx,sy,sz, mat, amp)=>{
    const geo=new THREE.SphereGeometry(r,10,8);
    if(amp) wrinkle(geo,amp);
    const m=new THREE.Mesh(geo,mat);
    m.scale.set(sx,sy,sz); m.position.set(x,y,z); g.add(m); return m;
  };
  /* torso: collapsed onto one shoulder, the chest fallen in */
  const torso=blob(0,0.14,0, 0.30, 0.80,0.52,1.32, clothMat, 0.07);
  torso.rotation.set(0.10,0.12,0.22);
  /* the coat over it: a looser shell, split down the front, with the collar
     standing up behind the neck — the silhouette that says "dressed" */
  const coat=blob(0,0.155,0.04, 0.325, 0.86,0.50,1.24, coatMat, 0.11);
  coat.rotation.set(0.10,0.12,0.22);
  for(const sx of[-1,1]){                            // the front panels, fallen open
    const flap=new THREE.Mesh(wrinkle(new THREE.SphereGeometry(0.20,9,7),0.13),coatMat);
    flap.scale.set(0.42,0.30,1.05);
    flap.position.set(sx*0.24,0.075,0.02); flap.rotation.set(0.1,0,sx*0.5);
    g.add(flap);
  }
  const collar=new THREE.Mesh(new THREE.TorusGeometry(0.115,0.045,5,11,Math.PI*1.25),coatMat);
  collar.position.set(0.01,0.185,-0.30); collar.rotation.set(1.30,0,0.15); g.add(collar);
  const belt=new THREE.Mesh(new THREE.TorusGeometry(0.175,0.026,5,13),beltMat);
  belt.position.set(-0.01,0.125,0.34); belt.rotation.set(1.44,0,0.10); g.add(belt);
  /* the ribs the cloth has rotted off, showing through the split coat */
  for(let i=0;i<4;i++){
    const rib=new THREE.Mesh(new THREE.TorusGeometry(0.135-i*0.012,0.010,4,9,Math.PI*0.9),boneMat);
    rib.position.set(0.02,0.215-i*0.004,-0.16+i*0.085);
    rib.rotation.set(Math.PI/2,0,0.20+i*0.03); g.add(rib);
  }
  blob(-0.03,0.115,0.50, 0.20, 1.0,0.62,0.86, clothMat, 0.08);
  /* legs: one folded under, one thrown out — trousers, then a boot */
  let k=limb(-0.10,0.11,0.60,  -0.16,-0.12,1.0, 0.44,0.105,0.085, clothMat);
  k=limb(k[0],k[1],k[2],       -0.05,-0.05,1.0, 0.40,0.082,0.062, clothMat);
  blob(k[0],k[1]+0.01,k[2]+0.05, 0.085, 1.05,0.95,1.85, bootMat, 0.05);
  k=limb(0.12,0.11,0.60,        0.52,-0.10,0.85,0.42,0.105,0.085, clothMat);
  k=limb(k[0],k[1],k[2],        0.16,-0.06,1.0, 0.38,0.082,0.060, clothMat);
  blob(k[0]+0.02,k[1]+0.01,k[2]+0.04, 0.082, 1.05,0.95,1.85, bootMat, 0.05);
  /* arms: one flung back toward the stair, one folded under the chest */
  k=limb(-0.24,0.16,-0.10,     -0.72,-0.10,-0.68,0.34,0.070,0.055, clothMat);
  k=limb(k[0],k[1],k[2],       -0.42,-0.14,-0.90,0.28,0.052,0.040, clothMat);
  blob(k[0]-0.02,k[1],k[2]-0.03, 0.055, 1.0,0.75,1.25, boneMat, 0.10);   // the hand
  k=limb(0.24,0.16,-0.08,       0.62,-0.12,0.42, 0.32,0.070,0.055, clothMat);
  k=limb(k[0],k[1],k[2],       -0.10,-0.16,0.86, 0.26,0.052,0.040, clothMat);
  blob(k[0],k[1],k[2]+0.03, 0.052, 1.0,0.75,1.25, boneMat, 0.10);
  /* skull: turned to the side, jaw fallen open, sockets sunk */
  const sk=new THREE.Group();
  const cran=new THREE.Mesh(new THREE.SphereGeometry(0.105,12,10),boneMat);
  cran.scale.set(0.88,0.94,1.06); sk.add(cran);
  const face=new THREE.Mesh(new THREE.SphereGeometry(0.075,10,8),boneMat);
  face.scale.set(0.82,0.72,0.80); face.position.set(0,-0.035,-0.075); sk.add(face);
  for(const sx of[-0.042,0.042]){                    // the sockets
    const soc=new THREE.Mesh(new THREE.SphereGeometry(0.032,8,7),pitMat);
    soc.scale.set(1,0.9,0.75); soc.position.set(sx,0.008,-0.094); sk.add(soc);
  }
  const nas=new THREE.Mesh(new THREE.SphereGeometry(0.018,6,5),pitMat);
  nas.scale.set(0.8,1.3,0.7); nas.position.set(0,-0.038,-0.118); sk.add(nas);
  const jaw=new THREE.Mesh(new THREE.TorusGeometry(0.058,0.014,4,9,Math.PI*1.1),boneMat);
  jaw.position.set(0,-0.082,-0.050); jaw.rotation.set(1.28,0,0); sk.add(jaw);
  sk.position.set(0.03,0.10,-0.46); sk.rotation.set(0.25,0.85,0.30); g.add(sk);
  /* the pack that came down with them, strap still over the shoulder */
  const pack=new THREE.Mesh(wrinkle(new THREE.SphereGeometry(0.22,10,8),0.12),coatMat);
  pack.scale.set(0.86,0.62,0.70); pack.position.set(-0.44,0.10,0.16);
  pack.rotation.set(0.2,0.5,0.35); g.add(pack);
  const strap=new THREE.Mesh(new THREE.TorusGeometry(0.155,0.020,4,11,Math.PI*0.8),beltMat);
  strap.position.set(-0.26,0.14,0.02); strap.rotation.set(1.2,0.7,0.3); g.add(strap);
  /* a scatter of what the dark left */
  for(let i=0;i<5;i++){
    const b=new THREE.Mesh(new THREE.CylinderGeometry(rand(0.014,0.024),rand(0.014,0.024),rand(0.13,0.28),6),boneMat);
    b.position.set(rand(-0.6,0.6),0.02,rand(-0.8,1.3));
    b.rotation.set(Math.PI/2+rand(-0.2,0.2),Math.random()*Math.PI,rand(-0.3,0.3));
    g.add(b);
  }
  return g;
}
/* an egg clutch: a silk mound crowned with blue-glowing eggs */
/* the flame material family — built ONCE at module scope and reused by
   every clutch, so igniting one never compiles a shader mid-frame */
const FLAME_TEX=makeFlameTexture();
const flameMat=new THREE.MeshBasicMaterial({map:FLAME_TEX, transparent:true,
  blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.DoubleSide, opacity:0});
markShared(FLAME_TEX,flameMat,texEggSac);

function makeClutch(){
  const g=new THREE.Group();
  /* the mass the eggs are bedded in: a lumpy silk-bound mound, not the
     smooth grey dome it used to be. Radial noise on a squashed sphere is
     enough — this thing is meant to look secreted, not moulded. */
  const moundGeo=new THREE.SphereGeometry(1.3,24,16);
  {
    const pos=moundGeo.attributes.position, sd=Math.random()*9;
    for(let i=0;i<pos.count;i++){
      const x=pos.getX(i), y=pos.getY(i), z=pos.getZ(i);
      const k=1+0.09*Math.sin(x*2.7+sd)+0.07*Math.sin(z*3.1-sd)+0.05*Math.sin(y*4.3+sd*2);
      pos.setXYZ(i,x*k,y*k,z*k);
    }
    moundGeo.computeVertexNormals();
  }
  /* the mound needs the wrap running the OTHER way. texCocoon's bands are
     horizontal so that they ring a bundle — correct on a cocoon, but on a
     dome squashed to 0.42 they stack into contour terraces and the nest
     looks like a stepped clay model. Rotated a quarter turn they run over
     the mound instead, which is how silk would actually be laid on it. */
  const mound=new THREE.Mesh(moundGeo,moundMat);
  mound.scale.set(1.15,0.42,1.15); mound.position.y=0.1; g.add(mound);

  /* the eggs: piled toward the middle rather than scattered flat, sizes
     graded so the pile has a crown, and each one now carries the sac map */
  const mats=[], eggs=[];
  const n=15+Math.floor(Math.random()*7);
  for(let i=0;i<n;i++){
    const a=Math.random()*Math.PI*2;
    const rr=Math.pow(Math.random(),0.65)*0.95;      // denser at the centre
    const r=rand(0.15,0.30)*(1-rr*0.25);             // and bigger there too
    const m=eggMat(); mats.push(m);
    const egg=new THREE.Mesh(new THREE.SphereGeometry(r,10,8),m);
    egg.scale.set(1,1.28,1);
    egg.rotation.set(rand(-0.5,0.5),Math.random()*6,rand(-0.5,0.5));
    egg.position.set(Math.cos(a)*rr, 0.40+r*0.9+(1-rr)*0.20, Math.sin(a)*rr);
    egg.userData.y0=egg.position.y;
    g.add(egg); eggs.push(egg);
  }
  /* silk: guys staking it down, plus strands lashed OVER the pile */
  for(let i=0;i<5;i++){
    const a=i/5*Math.PI*2+rand(-0.2,0.2);
    const guy=new THREE.Mesh(new THREE.CylinderGeometry(0.005,0.005,1.5,4),cocoonMat);
    guy.position.set(Math.cos(a)*1.35,0.5,Math.sin(a)*1.35);
    guy.rotation.z=Math.cos(a)*0.85; guy.rotation.x=-Math.sin(a)*0.85;
    g.add(guy);
  }
  for(let i=0;i<7;i++){
    const a=Math.random()*Math.PI*2, L=rand(1.6,2.4);
    const lash=new THREE.Mesh(new THREE.CylinderGeometry(0.004,0.004,L,4),cocoonMat);
    lash.position.set(0,rand(0.55,0.85),0);
    lash.rotation.z=Math.PI/2; lash.rotation.y=a;
    g.add(lash);
  }
  /* nest-glow: an additive pool of egg-light on the ground under it */
  const haloMat=new THREE.MeshBasicMaterial({map:HALO_TEX, color:0x3f93ac,
    transparent:true, opacity:0.2, blending:THREE.AdditiveBlending, depthWrite:false});
  const halo=new THREE.Mesh(new THREE.PlaneGeometry(4.8,4.8),haloMat);
  halo.rotation.x=-Math.PI/2; halo.position.y=0.07;
  g.add(halo);

  /* ---- the fire, built now and hidden ----
     Burning used to be a recolour of the eggs and an orange smear on the
     ground: there were no flames in the scene. These are crossed quads
     (three planes per tongue, so no per-frame billboarding is needed),
     created at build time on a shared material and revealed on ignite —
     making them at ignite time would compile a shader mid-frame. */
  const flames=[];
  for(let i=0;i<7;i++){
    const a=Math.random()*Math.PI*2, rr=Math.random()*1.05;
    const hgt=rand(0.7,1.35), wdt=hgt*rand(0.46,0.66);
    const tongue=new THREE.Group();
    for(let k=0;k<3;k++){
      const q=new THREE.Mesh(new THREE.PlaneGeometry(wdt,hgt),flameMat);
      q.position.y=hgt/2; q.rotation.y=k*Math.PI/3;
      tongue.add(q);
    }
    tongue.position.set(Math.cos(a)*rr,0.25,Math.sin(a)*rr);
    tongue.userData={h0:hgt, ph:Math.random()*9, sp:rand(0.8,1.5)};
    tongue.visible=false;
    g.add(tongue); flames.push(tongue);
  }
  g.userData.haloMat=haloMat;
  g.userData.eggMats=mats;
  g.userData.eggs=eggs;
  g.userData.flames=flames;
  return g;
}

/* ---------------- build ---------------- */
export function buildCave(){
  CAVE.obstacles=[]; CAVE.fires=[]; CAVE.lastBurn=null; CAVE.regionDim=[1,1,1,1];
  CAVE.shakeT=0; CAVE.dripT=2.5;
  const {entrance,central,broods,spawnC}=genCave();
  /* the arrival bore's mouth: where the library's shaft breaks through the
     entrance vault. Fixed before any mesh is laid so the ceiling pass can
     cut around it and every ceiling-hung placement can keep clear. The lip
     hangs below the lowest local ceiling so the collar hides the cut edge. */
  {
    const mx=CAVE.spawn.x, mz=CAVE.spawn.z+2.6;
    let lip=1e9;
    for(let a=0;a<24;a++)for(const rr of[0,1.7,3.4,5.1]){
      const th=a/24*Math.PI*2;
      lip=Math.min(lip,ceilYAt(mx+Math.cos(th)*rr, mz+Math.sin(th)*rr));
    }
    CAVE.stairMouth={x:mx, z:mz, rCut:3.0, lip:lip-0.6};
    CAVE.obstacles.push({x:mx, z:mz, r:1.9});   // the debris field at the stair's foot
    /* the corpse lies beside the dead stair (the wanderer never got far).
       Fixed HERE, before the dripstone/web passes run, so nothing grows
       through the body or the lantern — its obstacle is respected by
       every later clearOf. */
    {
      let px=mx-3.2, pz=mz+0.6;
      if(cellAt3(px,pz)===1){ px=mx+3.2; pz=mz-0.6; }
      CAVE.corpseP={x:px, z:pz};
      CAVE.obstacles.push({x:px, z:pz, r:1.0});
    }
    /* the clutches, for the same reason. Their keep-out used to be pushed
       with the clutch itself — the last build step — so the dripstone pass
       had already run and a full floor-to-vault column could be, and was,
       growing straight up through the middle of an egg pile. The brood
       centres are known from genCave, so reserve them now. */
    for(const b of CAVE.broods) CAVE.obstacles.push({x:b.center.x, z:b.center.z, r:1.5});
  }
  /* ---- floor, vault, walls & the pit: every surface is the shared field
     sampled per vertex — floorYAt underfoot, ceilYAt overhead, wallField
     for the lateral relief — faceted at sub-cell resolution so nothing
     planes off flat and nothing can drift from where gameplay thinks the
     rock is. Wall feet weld to the floor (the field is zero at the floor
     line) and wall crowns weld to the vault (same nominal points, same
     field), so the skin is watertight without a single box. ---- */
  const fAcc=new QuadAcc(), cAcc=new QuadAcc(), pAcc=new QuadAcc(), wAcc=new QuadAcc();
  const E=CELL/2, UVm=4;
  const fpc=CAVE.fissurePocket;
  for(let y=0;y<CH;y++)for(let x=0;x<CW;x++){
    const t=grid3[y][x];
    if(t===1) continue;
    const p=cellToWorld3(x,y);
    if(t===5){
      /* the chasm: a floor far below, walls falling to it (the rim floor
         corners are locked to 0, so the lip meets the ground exactly) */
      const u0=(p.x-E)/UVm, u1=(p.x+E)/UVm, v0=(p.z-E)/UVm, v1=(p.z+E)/UVm;
      pAcc.quad([p.x-E,-14,p.z+E],[p.x+E,-14,p.z+E],[p.x+E,-14,p.z-E],[p.x-E,-14,p.z-E],
        [0,1,0],[[u0,v1],[u1,v1],[u1,v0],[u0,v0]]);
      for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){
        const nt=codeAt(x+dx,y+dy);
        if(nt===5) continue;
        const sx=p.x+dx*E, sz=p.z+dy*E;
        const ax=dy!==0? p.x-E : sx, az=dx!==0? p.z-E : sz;
        const bx=dy!==0? p.x+E : sx, bz=dx!==0? p.z+E : sz;
        pAcc.quad([ax,0,az],[bx,0,bz],[bx,-14,bz],[ax,-14,az],
          [-dx,0,-dy],[[0,0],[1,0],[1,3.5],[0,3.5]]);
      }
    } else {
      /* the floor: 3×3 sub-quads riding floorYAt (fine enough that the mesh
         and the exact ground function never visibly disagree), SMOOTH-shaded
         from the field's own gradient — see floorNormalAt. The rock above
         stays faceted; only the ground you walk on rolls.
         A squeeze goes to 4×4 to match ITS vault and wall count — at a fixed
         3 the wall's bottom edge and the floor's edge sampled the same line
         at different x/z and split open along the crawl. */
      const S=t===2? 4:3;
      for(let j=0;j<S;j++)for(let i=0;i<S;i++){
        const x0=p.x-E+i*CELL/S, x1=x0+CELL/S;
        const z0=p.z-E+j*CELL/S, z1=z0+CELL/S;
        const q=(xx,zz)=>[xx,floorYAt(xx,zz),zz];
        const nq=(xx,zz)=>floorNormalAt(xx,zz);
        const uv=(xx,zz)=>[xx/UVm,zz/UVm];
        fAcc.triN(q(x0,z1),q(x1,z1),q(x1,z0), nq(x0,z1),nq(x1,z1),nq(x1,z0),
                  [uv(x0,z1),uv(x1,z1),uv(x1,z0)]);
        fAcc.triN(q(x0,z1),q(x1,z0),q(x0,z0), nq(x0,z1),nq(x1,z0),nq(x0,z0),
                  [uv(x0,z1),uv(x1,z0),uv(x0,z0)]);
      }
      if(t===6){
        /* low stone lips so the bridge reads as a bridge */
        for(const sx of[-1,1]){
          const lip=p.x+sx*(E-0.16);
          wAcc.quad([lip,0,p.z-E],[lip,0.34,p.z-E],[lip,0.34,p.z+E],[lip,0,p.z+E],
            [-sx,0,0],[[0,0],[0,0.1],[1,0.1],[1,0]]);
        }
      }
    }
    /* the vault over this cell: faceted sub-tris on ceilYAt, crag-jittered
       laterally by the same field the walls use so the crowns weld. (The
       fissure pocket's cell stays open — its bore runs up through here.) */
    if(!(fpc&&x===fpc.cx&&y===fpc.cy)){
      const S=t===2? 4:3;
      const cq=(xx,zz)=>{
        const h=ceilYAt(xx,zz), F=wallField(xx,h,zz);
        return [xx+F.x,h,zz+F.z];
      };
      const uv=(xx,zz)=>[xx/UVm,zz/UVm];
      const M=CAVE.stairMouth;
      for(let j=0;j<S;j++)for(let i=0;i<S;i++){
        const x0=p.x-E+i*CELL/S, x1=x0+CELL/S;
        const z0=p.z-E+j*CELL/S, z1=z0+CELL/S;
        /* the arrival bore cut its own mouth through this vault */
        if(Math.hypot((x0+x1)/2-M.x,(z0+z1)/2-M.z)<M.rCut) continue;
        cAcc.tri(cq(x0,z0),cq(x1,z0),cq(x1,z1),[uv(x0,z0),uv(x1,z0),uv(x1,z1)]);
        cAcc.tri(cq(x0,z0),cq(x1,z1),cq(x0,z1),[uv(x0,z0),uv(x1,z1),uv(x0,z1)]);
      }
    }
    /* rock walls: one displaced faceted sheet per exposed face, floor to
       vault. Vertices are functions of world position alone, so faces
       meeting at a corner column agree vertex for vertex. */
    for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){
      if(codeAt(x+dx,y+dy)!==1) continue;
      const rx=-dy, rz=dx;                       // traverse dir: normal faces the room
      /* COLS must match the SUB-QUAD COUNT of the floor and vault over this
         cell (3, or 4 in a squeeze). At COLS=4 against a 3-sub-quad ceiling
         the two edges sampled the same curve at different x/z, so between
         shared points the polylines drifted apart and opened slivers you
         could see the void through. Same story at the floor line. */
      const COLS=t===2? 4:3;
      const pts=[];
      for(let i=0;i<=COLS;i++){
        const tt=i/COLS*2-1;
        const px=p.x+dx*E+rx*E*tt, pz=p.z+dy*E+rz*E*tt;
        pts.push({px,pz, yb:floorYAt(px,pz), yt:ceilYAt(px,pz)});
      }
      /* ROWS is GLOBAL, not per-face. It used to be ceil(span/1.1) off the
         face's own height, so two faces meeting at a corner column — or two
         coplanar faces either side of a cell boundary — subdivided that
         shared column into different numbers of steps. wallField is
         evaluated per vertex and varies with height, so the two edges
         approximated the same curve at different y and split apart. Any
         constant works as long as every face uses the same one. */
      const ROWS=WALL_ROWS;
      const V=[];
      for(let r=0;r<=ROWS;r++){
        V[r]=[];
        for(let i=0;i<=COLS;i++){
          const q=pts[i], yy=lerp(q.yb,q.yt,r/ROWS);
          const F=wallField(q.px,yy,q.pz);
          V[r][i]=[q.px+F.x,yy,q.pz+F.z];
        }
      }
      for(let r=0;r<ROWS;r++)for(let i=0;i<COLS;i++){
        const p00=V[r][i], p10=V[r][i+1], p11=V[r+1][i+1], p01=V[r+1][i];
        const u=(pt)=>((rx? pt[0]:pt[2]))/UVm;
        wAcc.tri(p00,p10,p11,[[u(p00),p00[1]/UVm],[u(p10),p10[1]/UVm],[u(p11),p11[1]/UVm]]);
        wAcc.tri(p00,p11,p01,[[u(p00),p00[1]/UVm],[u(p11),p11[1]/UVm],[u(p01),p01[1]/UVm]]);
      }
    }
  }
  const floor=fAcc.mesh(floorMat); scene.add(floor);
  const ceil=cAcc.mesh(rockMat); scene.add(ceil);
  const pit=pAcc.mesh(pitMat); scene.add(pit);
  const walls=wAcc.mesh(rockMat); scene.add(walls);
  /* ---- the stream's water: a lens, not a sheet (see texCaustic above) ---- */
  {
    const S=6;                                  // sub-quads per cell each way
    /* The surface is simply the water LINE, rippling — there is no shore case
       in it at all. Both layers are emitted across the whole footprint and
       the DEPTH BUFFER cuts them, each by its own arrangement with the rock:
       the surface passes under the rising bank, and the bed layer is clamped
       to stay below the surface so past the shoreline it sinks beneath the
       floor mesh. Either way the boundary is the exact contour where water
       meets rock, to the pixel. Every version of this that tried to decide
       per sub-quad which ones to emit put 0.67m stair-steps along the shore. */
    const ripple=(xx,zz)=>0.016*Math.sin(xx*1.9+zz*0.7)
                         +0.011*Math.sin(xx*0.8-zz*2.3+1.7)
                         +0.006*Math.sin(xx*4.3+zz*3.1+0.6);
    /* The surface is the water line and NOTHING else — it is not clamped up
       onto the rock past the shoreline. Where the bank rises through it the
       plane simply passes underneath, and the floor mesh (opaque, drawn
       first, writing depth) clips it exactly along the intersection contour.
       That is pixel-exact and free, where lifting the vertices onto the rock
       instead left a thin glossy film lying on the bank — invisible in colour
       but flaring a huge pale specular next to any fungus colony, in
       hard-edged patches the shape of the sub-quad grid. */
    const wy=(xx,zz)=>WATER_Y+ripple(xx,zz);
    const depthAt=(xx,zz)=>wy(xx,zz)-floorYAt(xx,zz);
    /* normals by finite difference of the surface — the ripple's own gradient,
       which is what breaks the one broad highlight a flat plane gives into
       the many small glints that read as water */
    const wn=(xx,zz)=>{ const d=0.07;
      const gx=(wy(xx+d,zz)-wy(xx-d,zz))/(2*d), gz=(wy(xx,zz+d)-wy(xx,zz-d))/(2*d);
      const l=Math.hypot(gx,1,gz)||1; return [-gx/l,1/l,-gz/l]; };
    /* the depth tint, carried on the vertices. There is no alpha to fade in
       r128's Phong, so the fade is done in COLOUR: at zero depth the water
       is the wet rock's own tone, and the shoreline disappears instead of
       ending in a bright cold rim against warm stone. */
    const DEEP=[0.21,0.35,0.42], SHORE=[0.46,0.40,0.34];
    const wc=(xx,zz)=>{ const k=clamp(depthAt(xx,zz)/0.15,0,1);
      return [lerp(SHORE[0],DEEP[0],k),lerp(SHORE[1],DEEP[1],k),lerp(SHORE[2],DEEP[2],k)]; };
    const sAcc=new QuadAcc(), kAcc=new QuadAcc();
    const UVs=3, UVc=4.5;                       // different scales: they must not beat
    for(let y=0;y<CH;y++)for(let x=0;x<CW;x++){
      /* the water's footprint: the channel, plus the banks it laps onto */
      if(grid3[y][x]!==3 && !isBankCell(x,y)) continue;
      const p=cellToWorld3(x,y);
      for(let j=0;j<S;j++)for(let i=0;i<S;i++){
        const x0=p.x-E+i*CELL/S, x1=x0+CELL/S;
        const z0=p.z-E+j*CELL/S, z1=z0+CELL/S;
        const sq=(xx,zz)=>[xx,wy(xx,zz),zz];
        const su=(xx,zz)=>[xx/UVs,zz/UVs];
        sAcc.triNC(sq(x0,z1),sq(x1,z1),sq(x1,z0), wn(x0,z1),wn(x1,z1),wn(x1,z0),
          [su(x0,z1),su(x1,z1),su(x1,z0)], [wc(x0,z1),wc(x1,z1),wc(x1,z0)]);
        sAcc.triNC(sq(x0,z1),sq(x1,z0),sq(x0,z0), wn(x0,z1),wn(x1,z0),wn(x0,z0),
          [su(x0,z1),su(x1,z0),su(x0,z0)], [wc(x0,z1),wc(x1,z0),wc(x0,z0)]);
        /* the caustic net rides the BED, a hair above the floor mesh — but
           never above the SURFACE, and that one clamp is what cuts it at the
           shore: past the waterline `wy` is the lower of the two, so the layer
           drops beneath the floor and the floor occludes it. Gating it on
           whole submerged sub-quads instead is what put the steps in. */
        const bq=(xx,zz)=>[xx,Math.min(floorYAt(xx,zz)+0.012,wy(xx,zz)-0.004),zz];
        const bu=(xx,zz)=>[xx/UVc,zz/UVc];
        kAcc.tri(bq(x0,z1),bq(x1,z1),bq(x1,z0),[bu(x0,z1),bu(x1,z1),bu(x1,z0)]);
        kAcc.tri(bq(x0,z1),bq(x1,z0),bq(x0,z0),[bu(x0,z1),bu(x1,z0),bu(x0,z0)]);
      }
    }
    /* Lit, not additive: caustics are focused LIGHT, so they belong on a
       material that goes dark when nothing is shining on the water. An
       emissive net would have lit the stream up from across the cave. */
    const causticMat=new THREE.MeshPhongMaterial({map:texCaustic, color:0x8aafb6,
      specular:0x10202a, shininess:18, transparent:true, opacity:0.86,
      depthWrite:false});
    /* the body tint knocked back to 0x8a949a on top of the vertex depth
       colour: at full brightness the two layers together read as a lit
       swimming pool, and this is meant to be the flat black water. Dimming
       the CAUSTICS instead just put the flat sheet back — the depth has to
       come from light in dark water, not from a dim bed. */
    const waterMat=new THREE.MeshPhongMaterial({map:texWaterSurf, vertexColors:true,
      color:0x8a949a, specular:0x9fd0dc, shininess:150,
      transparent:true, opacity:0.62, emissive:0x03090c,
      /* biased toward the camera: along the shoreline the plane runs nearly
         tangent to the bank, and without this the two z-fight into a band of
         shimmer instead of the water simply winning up to its own edge */
      polygonOffset:true, polygonOffsetFactor:-1, polygonOffsetUnits:-1});
    CAVE.waterMat=waterMat; CAVE.causticMat=causticMat;
    const bed=kAcc.mesh(causticMat);
    bed.renderOrder=-1;                         // under the surface, which keeps depthWrite
    bed.userData.animated=true;
    scene.add(bed);
    const water=sAcc.mesh(waterMat);
    water.userData.animated=true;               // its matrix never moves; its maps do
    scene.add(water);
  }
  /* ---- the chasm breathes a cold haze with no bottom in it ---- */
  {
    for(const[hy,op,col]of[[-2.5,0.10,0x143843],[-6,0.24,0x11333f],[-10,0.45,0x0d2b36]]){
      const acc=new QuadAcc();
      for(let y=0;y<CH;y++)for(let x=0;x<CW;x++){
        if(grid3[y][x]!==5&&grid3[y][x]!==6) continue;
        const p=cellToWorld3(x,y);
        acc.quad([p.x-E,hy,p.z+E],[p.x+E,hy,p.z+E],[p.x+E,hy,p.z-E],[p.x-E,hy,p.z-E],
          [0,1,0],[[0,1],[1,1],[1,0],[0,0]]);
      }
      if(!acc.vc) continue;
      scene.add(acc.mesh(new THREE.MeshBasicMaterial({color:col, transparent:true,
        opacity:op, depthWrite:false, side:THREE.DoubleSide})));
    }
  }
  /* ---- silk floor sheets around the nests: a skin over the real floor ---- */
  {
    const sq=new QuadAcc();
    for(const k of CAVE.silk){
      const x=k%CW, y=(k/CW)|0;
      if(grid3[y][x]===1||grid3[y][x]===5) continue;
      const p=cellToWorld3(x,y);
      const q=(xx,zz)=>[xx,floorYAt(xx,zz)+0.04,zz];
      for(let j=0;j<3;j++)for(let i=0;i<3;i++){
        const x0=p.x-E+i*CELL/3, x1=x0+CELL/3, z0=p.z-E+j*CELL/3, z1=z0+CELL/3;
        sq.tri(q(x0,z1),q(x1,z1),q(x1,z0),[[0,1],[1,1],[1,0]]);
        sq.tri(q(x0,z1),q(x1,z0),q(x0,z0),[[0,1],[1,0],[0,0]]);
      }
    }
    scene.add(sq.mesh(silkFloorMat));
  }
  /* ---- dripstone: wet, glossy, grown in matching pairs — merged into a
     single mesh each way (floor spires / ceiling hangers), plus one merged
     sheet of drapery curtains (their own DoubleSide material) ---- */
  const clearOf=(x,z,r)=>CAVE.obstacles.every(o=>Math.hypot(x-o.x,z-o.z)>=o.r+r+0.3)
    && Math.hypot(x-CAVE.spawn.x,z-CAVE.spawn.z)>2.2;
  /* nothing hangs inside the arrival bore's mouth — the cut is open sky */
  const inMouth=(wx,wz,pad=0.6)=>
    Math.hypot(wx-CAVE.stairMouth.x,wz-CAVE.stairMouth.z)<CAVE.stairMouth.rCut+pad;
  const stalUp=[], stalDown=[], curtains=[];
  for(const c of CAVE.chambers){
    const n=Math.round(c.r*3.6);
    for(let t=0,placed=0;t<85&&placed<n;t++){
      const a=srand()*Math.PI*2, rr=c.r*Math.sqrt(srand())*0.9;
      const x=Math.round(c.cx+Math.cos(a)*rr), y=Math.round(c.cy+Math.sin(a)*rr);
      if(!inB(x,y)||grid3[y][x]!==0) continue;
      const p=cellToWorld3(x,y);
      const px=p.x+rand(-1.2,1.2), pz=p.z+rand(-1.2,1.2);
      if(!clearOf(px,pz,0.5)) continue;
      const vault=Math.min(cH[y][x],cH[y][x+1],cH[y+1][x],cH[y+1][x+1]);
      const fy=floorYAt(px,pz);
      /* some pairs have had the ages they needed to meet: a full column,
         girth scaled to the height it had to bridge — under a chamber dome
         these are pillars you shelter behind, not furniture */
      if(srand()<0.16){
        const cv=ceilYAt(px,pz);
        const rCol=Math.min(1.6,(cv-fy)*rand(0.07,0.11));
        const col=new THREE.Mesh(columnGeo(rCol,cv-fy+0.3));
        col.position.set(px,fy-0.05,pz); col.rotation.y=Math.random()*7;
        stalUp.push(col);
        placed++;
        CAVE.obstacles.push({x:px,z:pz,r:Math.max(0.55,rCol*0.85)});
        continue;
      }
      const h=rand(0.9,Math.min(5.5,vault*0.42));
      /* a flowstone stack: noisy mound base, drip-ringed spire, a lean child */
      const base=new THREE.Mesh(moundGeo(h*0.36,0.34));
      base.position.set(px,fy-0.02,pz); base.rotation.y=Math.random()*7;
      stalUp.push(base);
      const spire=new THREE.Mesh(spireGeo(h*rand(0.17,0.24),h));
      spire.position.set(px,fy,pz); spire.rotation.y=Math.random()*7;
      stalUp.push(spire);
      if(Math.random()<0.6){
        const h2=h*rand(0.35,0.6);
        const kx=px+rand(-0.55,0.55), kz=pz+rand(-0.55,0.55);
        const kid=new THREE.Mesh(spireGeo(h2*rand(0.2,0.26),h2,0.16));
        kid.position.set(kx,floorYAt(kx,kz),kz);
        kid.rotation.y=Math.random()*7;
        stalUp.push(kid);
      }
      placed++;
      CAVE.obstacles.push({x:px,z:pz,r:0.45});
      /* its answer overhead — often directly above (they grow toward each other) */
      if(Math.random()<0.9){
        const above=Math.random()<0.5;
        const sx2=above? px+rand(-0.3,0.3) : px+rand(-1.6,1.6);
        const sz2=above? pz+rand(-0.3,0.3) : pz+rand(-1.6,1.6);
        if(!inMouth(sx2,sz2,0.9)){
          const hh=rand(0.7,Math.min(4.6,vault*0.4));
          const st=new THREE.Mesh(spireGeo(hh*rand(0.14,0.2),hh,0.06));
          st.position.set(sx2, ceilYAt(sx2,sz2)+0.18, sz2);
          st.rotation.x=Math.PI; st.rotation.y=Math.random()*7;
          stalDown.push(st);
        }
      }
    }
    /* the domes keep their own stalactite fields besides the pairs: hanger
       clusters with no floor partner, thickest where the vault is highest —
       purely overhead, so they cost no floor space and no obstacles */
    const k=Math.round(c.r*5.2);
    for(let t=0,placed=0;t<150&&placed<k;t++){
      const a=srand()*Math.PI*2, rr=c.r*Math.sqrt(srand())*0.92;
      const x=Math.round(c.cx+Math.cos(a)*rr), y=Math.round(c.cy+Math.sin(a)*rr);
      if(!inB(x,y)) continue;
      const code=grid3[y][x];
      if(code===1||code===2||code===5||code===7) continue;
      const p=cellToWorld3(x,y);
      const hx=p.x+rand(-1.4,1.4), hz=p.z+rand(-1.4,1.4);
      if(inMouth(hx,hz,1.0)) continue;
      const vault=Math.min(cH[y][x],cH[y][x+1],cH[y+1][x],cH[y+1][x+1]);
      const n2=1+Math.floor(srand()*3);
      for(let i=0;i<n2;i++){
        const qx=hx+rand(-0.8,0.8), qz=hz+rand(-0.8,0.8);
        const hh=rand(0.5,Math.min(4.2,vault*0.38));
        const st=new THREE.Mesh(spireGeo(hh*rand(0.13,0.2),hh,0.06));
        st.position.set(qx, ceilYAt(qx,qz)+0.18, qz);
        st.rotation.x=Math.PI; st.rotation.y=Math.random()*7;
        stalDown.push(st);
      }
      placed++;
    }
  }
  /* ---- tunnel country: soda straws, wall curtains, stream-bank
     cascades, and the scree's broken dead ---- */
  for(let y=1;y<CH-1;y++)for(let x=1;x<CW-1;x++){
    const code=grid3[y][x];
    if(code!==0&&code!==3&&code!==4) continue;
    const p=cellToWorld3(x,y);
    const vault=Math.min(cH[y][x],cH[y][x+1],cH[y+1][x],cH[y+1][x+1]);
    /* soda straws cluster around a shared seep point in the ceiling */
    if((code===0||code===3)&&srand()<0.38){
      const cx0=p.x+rand(-1.3,1.3), cz0=p.z+rand(-1.3,1.3);
      const n=inMouth(cx0,cz0,1.0)? 0 : 4+Math.floor(srand()*5);
      for(let i=0;i<n;i++){
        const hh=rand(0.25,0.85);
        const sx=cx0+rand(-0.5,0.5), sz=cz0+rand(-0.5,0.5);
        const st=new THREE.Mesh(new THREE.ConeGeometry(rand(0.03,0.07),hh,5));
        st.position.set(sx, ceilYAt(sx,sz)+0.12-hh/2, sz);
        st.rotation.x=Math.PI; st.rotation.z=(Math.random()-0.5)*0.06;
        stalDown.push(st);
      }
      /* a patient seep gets an answering nub on the floor below */
      if(n&&code===0&&Math.random()<0.4&&clearOf(cx0,cz0,0.2)){
        const nub=new THREE.Mesh(spireGeo(rand(0.06,0.11),rand(0.12,0.3),0.05));
        nub.position.set(cx0,floorYAt(cx0,cz0),cz0);
        stalUp.push(nub);
      }
    }
    /* NO wall drapery here any more. It anchored at E−0.30, i.e. 0.30m in
       from the wall face, and then took another ~0.2m of wallField and
       fold depth on top — so a broad, shallowly-folded calcite sheet hung
       somewhere between a few inches and a foot clear of a wall that was
       already there. It did not read as a formation; it read as a stray
       slab of wall floating in the room. Flowstone that still exists is
       the kind that has somewhere real to attach: the stream-bank cascades
       below, and the collar around the arrival bore. */
    /* flowstone cascades spilling down the banks into the stream */
    if(code===0&&srand()<0.22){
      let sdx=0,sdy=0;
      for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]) if(codeAt(x+dx,y+dy)===3){sdx=dx;sdy=dy;break;}
      if(sdx||sdy){
        const bx=p.x+sdx*rand(0.6,1.2), bz=p.z+sdy*rand(0.6,1.2);
        const n=2+Math.floor(Math.random()*3);
        for(let i=0;i<n;i++){
          const f=i/n;
          const mx=bx+sdx*(f*1.5+rand(-0.2,0.2)), mz=bz+sdy*(f*1.5+rand(-0.2,0.2));
          const m=new THREE.Mesh(moundGeo(rand(0.28,0.5)*(1-f*0.4),rand(0.4,0.6)));
          m.position.set(mx, floorYAt(mx,mz)+0.02-f*0.16, mz);
          m.rotation.y=Math.random()*7;
          stalUp.push(m);
        }
      }
    }
    /* the scree keeps its dead: snapped stumps and toppled spires */
    if(code===4&&srand()<0.14){
      const sx=p.x+rand(-1.2,1.2), sz=p.z+rand(-1.2,1.2);
      if(clearOf(sx,sz,0.4)){
        const h=rand(0.3,0.9);
        const st=new THREE.Mesh(stumpGeo(rand(0.14,0.28),h));
        st.position.set(sx,floorYAt(sx,sz),sz);
        st.rotation.y=Math.random()*7; st.rotation.z=(Math.random()-0.5)*0.2;
        stalUp.push(st);
        if(h>0.5) CAVE.obstacles.push({x:sx,z:sz,r:0.35});
        if(Math.random()<0.5){         // its top half, lying where it fell
          const fa=Math.random()*7;
          const fx=sx+Math.cos(fa)*rand(0.5,1.1), fz=sz+Math.sin(fa)*rand(0.5,1.1);
          const frag=new THREE.Mesh(spireGeo(rand(0.09,0.15),rand(0.4,0.9),0.02));
          frag.position.set(fx, floorYAt(fx,fz)+0.10, fz);
          frag.rotation.z=Math.PI/2+rand(-0.2,0.2); frag.rotation.y=fa;
          stalUp.push(frag);
        }
      }
    }
  }
  if(stalUp.length){ scene.add(mergeStatic(stalUp,wetMat)); for(const m of stalUp) m.geometry.dispose(); }
  if(stalDown.length){ scene.add(mergeStatic(stalDown,wetMat)); for(const m of stalDown) m.geometry.dispose(); }
  if(curtains.length){ scene.add(mergeStatic(curtains,curtainMat)); for(const m of curtains) m.geometry.dispose(); }
  /* ---- the webs: generations of brood have silked every junction ----
     No flat pasted quads. Corner sheets bridge two wall faces, junction
     fans hang off the wall-ceiling line, floor skirts slope from the wall
     base onto the floor, funnels dive into the junctions, hammocks hang
     from real guy-lines, streamers brush your face in low tunnels, torn
     veils choke the squeeze mouths, and the oldest stalagmites are
     wrapped. Density is still the wayfinding: it thickens toward broods. */
  {
    const sheets=[[],[]], fans=[[],[]], tornV=[], strands=[], funnels=[];
    const pickSheet=m=>sheets[Math.floor(Math.random()*2)].push(m);
    const pickFan=m=>fans[Math.floor(Math.random()*2)].push(m);
    const broodDist=(x,y)=>Math.min(...broods.map(b=>Math.hypot(x-b.cx,y-b.cy)));
    const solid=c=>c===1||c===7;
    const faceYaw=(dx,dy)=> dx? (dx>0?-Math.PI/2:Math.PI/2) : (dy>0?Math.PI:0);
    for(let y=1;y<CH-1;y++)for(let x=1;x<CW-1;x++){
      const code=grid3[y][x];
      if(code===1||code===5||code===7) continue;
      const p=cellToWorld3(x,y);
      const vault=Math.min(cH[y][x],cH[y][x+1],cH[y+1][x],cH[y+1][x+1]);
      const density=clamp(1-broodDist(x,y)/16,0.12,1);
      const sq=code===2;                       // squeeze interiors: light silk only
      /* corner sheets: strung across the chord where two wall faces meet,
         pinned at both walls, bellying out into the room. The corner's own
         wall relief carries the pins with the rock. */
      for(const[dx,dy]of[[1,1],[1,-1],[-1,1],[-1,-1]]){
        if(!solid(codeAt(x+dx,y))||!solid(codeAt(x,y+dy))) continue;
        if(Math.random()>density*(sq?0.5:0.85)) continue;
        const cV=cH[y+(dy>0?1:0)][x+(dx>0?1:0)];
        const cx0=p.x+dx*(E-0.05), cz0=p.z+dy*(E-0.05);
        const fy=floorYAt(cx0,cz0);
        const n=1+(Math.random()<density*0.5?1:0);
        for(let i=0;i<n;i++){
          const d=rand(0.5,1.3);
          const hgt=rand(0.35,0.8);
          const hh=i===0? cV-rand(0.1,0.5) : fy+rand(0.7,1.5);
          const yy=Math.min(hh,cV-0.15)-hgt/2;
          const F=wallField(cx0,yy,cz0);
          const w=new THREE.Mesh(webSheetGeo(d*1.41,hgt,d*rand(0.12,0.28)));
          w.position.set(cx0-dx*d/2+F.x*0.8, yy, cz0-dy*d/2+F.z*0.8);
          w.rotation.y=Math.atan2(-dx,-dy);
          (i===0?pickFan:pickSheet)(w);
        }
      }
      for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){
        if(!solid(codeAt(x+dx,y+dy))) continue;
        const jx=p.x+dx*(E-0.04)+(dx?0:rand(-1.2,1.2));
        const jz=p.z+dy*(E-0.04)+(dy?0:rand(-1.2,1.2));
        /* junction fans: top edge pinned along the wall-ceiling line —
           ceilYAt at the anchor, ridden out on the wall's own relief */
        if(!sq&&Math.random()<density*0.75){
          const eV=ceilYAt(jx,jz);
          const wdt=rand(0.8,2.0), hgt=rand(0.45,0.95), tilt=rand(0.5,1.0);
          const F=wallField(jx,eV-0.1,jz);
          const w=new THREE.Mesh(webSheetGeo(wdt,hgt,rand(0.08,0.18)));
          w.rotation.order="YXZ"; w.rotation.y=faceYaw(dx,dy); w.rotation.x=-tilt;
          w.position.set(jx+F.x-dx*Math.sin(tilt)*hgt/2, eV-0.03-Math.cos(tilt)*hgt/2,
                         jz+F.z-dy*Math.sin(tilt)*hgt/2);
          pickFan(w);
        }
        /* floor skirts: rooted low on the wall, radiating onto the floor */
        if(!sq&&code!==3&&Math.random()<density*0.35){
          const fy0=floorYAt(jx,jz);
          const h0=rand(0.25,0.6), tilt=rand(0.75,1.15);
          const hgt=Math.min(1.2,h0/Math.cos(tilt)), wdt=rand(0.6,1.4);
          const F=wallField(jx,fy0+h0,jz);
          const w=new THREE.Mesh(webSheetGeo(wdt,hgt,rand(0.05,0.12)));
          w.rotation.order="YXZ"; w.rotation.y=faceYaw(dx,dy); w.rotation.x=-tilt;
          w.position.set(jx+F.x-dx*Math.sin(tilt)*hgt/2, fy0+h0-Math.cos(tilt)*hgt/2,
                         jz+F.z-dy*Math.sin(tilt)*hgt/2);
          pickFan(w);
        }
        /* funnel retreats diving into the wall-floor junction */
        if(!sq&&code!==3&&funnels.length<140&&Math.random()<density*0.3){
          const r=rand(0.25,0.5), dep=rand(0.28,0.55);
          const fx0=p.x+dx*(E-0.15-r*0.5)+(dx?0:rand(-1.2,1.2));
          const fz0=p.z+dy*(E-0.15-r*0.5)+(dy?0:rand(-1.2,1.2));
          const f=new THREE.Mesh(funnelWebGeo(r,dep));
          f.position.set(fx0, floorYAt(fx0,fz0)+0.02, fz0);
          f.rotation.x=dy*0.3; f.rotation.z=-dx*0.3;      // throat leans into the wall
          funnels.push(f);
        }
      }
      /* torn veils choking the squeeze mouths — the brood's doors.
         (Separate scan: the loop above only visits SOLID neighbors.) */
      if(!sq) for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){
        if(codeAt(x+dx,y+dy)!==2||Math.random()>0.55) continue;
        const vx=p.x+dx*(E-0.10), vz=p.z+dy*(E-0.10);
        const eV=ceilYAt(vx-dx*0.25,vz-dy*0.25);
        const room=Math.max(1.3, eV-floorYAt(vx,vz));
        const hgt=Math.min(rand(1.2,Math.max(1.3,room*0.62)), room-0.30);
        const wdt=rand(2.0,3.1);
        const w=new THREE.Mesh(webSheetGeo(wdt,hgt,rand(0.15,0.3)));
        w.position.set(vx, eV-0.02-hgt/2, vz);
        w.rotation.y=faceYaw(dx,dy);
        tornV.push(w);
        const ax_=dx?0:1, az_=dx?1:0;                     // wall-parallel axis
        for(let i=2+Math.floor(Math.random()*3);i--;)
          strands.push(strandMesh(
            p.x+dx*(E-0.1)-ax_*rand(1.0,1.7), rand(0.25,1.1), p.z+dy*(E-0.1)-az_*rand(1.0,1.7),
            p.x+dx*(E-0.1)+ax_*rand(1.0,1.7), rand(0.25,1.1), p.z+dy*(E-0.1)+az_*rand(1.0,1.7),
            rand(0.03,0.06)));
      }
      /* hammocks slung under the vault on real guy-lines — each guy runs
         to the actual ceiling above its own corner */
      if(!sq&&density>0.3&&Math.random()<(density-0.18)*0.9
         &&!inMouth(p.x,p.z,1.2)){
        const wdt=rand(1.1,2.4), dep=rand(1.0,2.2);
        const hx=p.x+rand(-0.9,0.9), hz=p.z+rand(-0.9,0.9);
        const yaw=Math.random()*Math.PI;
        const {hy,sag}=slung(ceilYAt(hx,hz),wdt,dep);
        const w=new THREE.Mesh(webHammockGeo(wdt,dep,sag));
        w.rotation.order="YXZ"; w.rotation.y=yaw; w.rotation.x=-Math.PI/2;
        w.position.set(hx,hy,hz);
        pickSheet(w);
        const cs=Math.cos(yaw), sn=Math.sin(yaw);
        for(const[lx,ly]of[[wdt/2,dep/2],[wdt/2,-dep/2],[-wdt/2,dep/2],[-wdt/2,-dep/2]]){
          const gx=hx+lx*cs-ly*sn+rand(-0.4,0.4), gz=hz-lx*sn-ly*cs+rand(-0.4,0.4);
          strands.push(strandMesh(hx+lx*cs-ly*sn, hy, hz-lx*sn-ly*cs,
            gx, Math.max(ceilYAt(gx,gz)+0.05,hy+0.25), gz, rand(0.03,0.06)));
        }
        if(Math.random()<0.4)
          strands.push(strandMesh(hx,hy-sag,hz, hx+rand(-0.2,0.2), hy-sag-rand(0.4,1.1),
            hz+rand(-0.2,0.2), 0.04));
      }
      /* streamers hanging from the vault — thickest in the low tunnels */
      {
        const pr= sq? 0.4 : density*(vault<5.4?0.75:0.6);
        let n=(Math.random()<pr?1:0)+(Math.random()<pr*0.55?1:0)+(Math.random()<pr*0.3?1:0);
        while(n--){
          const wx2=p.x+rand(-0.9,0.9), wz2=p.z+rand(-0.9,0.9);
          if(inMouth(wx2,wz2,0.5)) continue;
          const rootY=ceilYAt(wx2,wz2)+0.1;
          const len=rand(0.5,Math.min(3.4,rootY*0.55)), wdt=rand(0.12,0.35);
          const w=new THREE.Mesh(webStreamerGeo(wdt,len));
          w.position.set(wx2, rootY-len/2, wz2);
          w.rotation.y=Math.random()*Math.PI;
          pickSheet(w);
        }
      }
    }
    /* the oldest stalagmites near the broods are wrapped and staked */
    for(const o of CAVE.obstacles){
      if(o.r!==0.45&&o.r!==0.55) continue;
      const c=worldToCell3(o.x,o.z);
      if(broodDist(c.cx,c.cy)>9||Math.random()>0.30) continue;
      const hgt=rand(0.5,1.0);
      const fyW=floorYAt(o.x,o.z);
      const w=new THREE.Mesh(webWrapGeo(o.r+0.16,hgt));
      w.position.set(o.x,fyW+0.02,o.z); w.rotation.y=Math.random()*7;
      pickSheet(w);
      for(let i=2+Math.floor(Math.random()*2);i--;){
        const a=Math.random()*Math.PI*2;
        const ex=o.x+Math.cos(a)*(o.r+rand(0.7,1.3)), ez=o.z+Math.sin(a)*(o.r+rand(0.7,1.3));
        strands.push(strandMesh(o.x+Math.cos(a)*o.r*0.7, fyW+hgt*rand(0.7,1.0), o.z+Math.sin(a)*o.r*0.7,
          ex, floorYAt(ex,ez)+0.02, ez, rand(0.03,0.05)));
      }
    }
    /* the canopy: directly over every brood, generations of layered
       hammocks and long streamer tails. The DEPTH here comes from the
       streamer tails reaching for the clutch, not from dropping the sheets
       — under a 13m dome "two-thirds height on long guys" put flat silk
       five metres out in open air. The sheets ride the rock (see slung). */
    for(const b of broods){
      const bp=cellToWorld3(b.cx,b.cy);
      for(let i=0;i<8;i++){
        const hx=bp.x+rand(-6,6), hz=bp.z+rand(-6,6);
        const c=worldToCell3(hx,hz), cc=codeAt(c.cx,c.cy);
        if(cc===1||cc===5||cc===7) continue;
        const wdt=rand(1.6,3.4), dep=rand(1.4,3.0);
        const yaw=Math.random()*Math.PI;
        const {hy,sag}=slung(ceilYAt(hx,hz),wdt,dep);
        const w=new THREE.Mesh(webHammockGeo(wdt,dep,sag));
        w.rotation.order="YXZ"; w.rotation.y=yaw; w.rotation.x=-Math.PI/2;
        w.position.set(hx,hy,hz);
        pickSheet(w);
        const cs=Math.cos(yaw), sn=Math.sin(yaw);
        for(const[lx,ly]of[[wdt/2,dep/2],[wdt/2,-dep/2],[-wdt/2,dep/2],[-wdt/2,-dep/2]]){
          const gx=hx+lx*cs-ly*sn+rand(-0.5,0.5), gz=hz-lx*sn-ly*cs+rand(-0.5,0.5);
          strands.push(strandMesh(hx+lx*cs-ly*sn, hy, hz-lx*sn-ly*cs,
            gx, Math.max(ceilYAt(gx,gz)+0.05,hy+0.3), gz, rand(0.03,0.06)));
        }
      }
      for(let i=0;i<12;i++){
        const hx=bp.x+rand(-5.5,5.5), hz=bp.z+rand(-5.5,5.5);
        const c=worldToCell3(hx,hz), cc=codeAt(c.cx,c.cy);
        if(cc===1||cc===5||cc===7) continue;
        const lv=ceilYAt(hx,hz);
        const len=rand(1.2,Math.max(1.3,Math.min(5.5,(lv-floorYAt(hx,hz))*0.5)));
        const w=new THREE.Mesh(webStreamerGeo(rand(0.15,0.4),len));
        w.position.set(hx, lv+0.1-len/2, hz);
        w.rotation.y=Math.random()*Math.PI;
        pickSheet(w);
      }
    }
    /* the den reads from the CEILING: every chamber dome is rigged —
       sheets slung under the vault, veils hanging off the stalactite
       line, long streamers, and lines crisscrossing between vault points.
       Heaviest over the broods, but even the entrance is webbed: this is
       their house, all of it. */
    for(const c of CAVE.chambers){
      const bd=Math.min(...broods.map(b=>Math.hypot(c.cx-b.cx,c.cy-b.cy)));
      const dens=clamp(1-bd/16,0.4,1);
      /* ×3 placements, and the roll re-weighted hard toward SHEETS: the
         vault is where the den reads from, and it was too sparse. Net
         effect is roughly 5× the ceiling sheets, with streamers about
         level and the free-strung lines down a little — every slung sheet
         now brings its own guy-lines, which more than replaces them. */
      const k=Math.round(c.r*c.r*2.1*dens*3);
      for(let t=0,placed=0;t<k*3&&placed<k;t++){
        const a=srand()*Math.PI*2, rr=c.r*Math.sqrt(srand())*0.95;
        const x=Math.round(c.cx+Math.cos(a)*rr), y=Math.round(c.cy+Math.sin(a)*rr);
        if(!inB(x,y)) continue;
        const code=grid3[y][x];
        if(code===1||code===5||code===7) continue;
        const p=cellToWorld3(x,y);
        const hx=p.x+rand(-1.6,1.6), hz=p.z+rand(-1.6,1.6);
        if(inMouth(hx,hz,0.8)) continue;
        const cv=ceilYAt(hx,hz);
        const roll=Math.random();
        if(roll<0.47){                     // a slung sheet under the vault
          /* slung CLOSE to the vault (see slung) and trussed to it on four
             corner guys — nothing visibly holding it and it reads as a
             sheet floating under a ceiling that isn't there */
          const wdt=rand(1.4,3.2), dep=rand(1.2,2.8);
          const yaw=Math.random()*Math.PI;
          const {hy,sag}=slung(cv,wdt,dep);
          const w=new THREE.Mesh(webHammockGeo(wdt,dep,sag));
          w.rotation.order="YXZ"; w.rotation.y=yaw;
          w.rotation.x=-Math.PI/2+rand(-0.18,0.18);
          w.position.set(hx,hy,hz);
          pickSheet(w);
          const cs=Math.cos(yaw), sn=Math.sin(yaw);
          for(const[lx,ly]of[[wdt/2,dep/2],[wdt/2,-dep/2],[-wdt/2,dep/2],[-wdt/2,-dep/2]]){
            const gx=hx+lx*cs-ly*sn, gz=hz-lx*sn-ly*cs;
            strands.push(strandMesh(gx,hy,gz, gx+rand(-0.25,0.25),
              Math.max(ceilYAt(gx,gz)+0.04,hy+0.22), gz+rand(-0.25,0.25), rand(0.025,0.05)));
          }
        } else if(roll<0.90){              // a veil hanging off the stalactite line
          /* sized against the LOCAL floor-to-vault room, never an absolute
             height: a veil that reaches the ground stops reading as silk
             and starts reading as a wall */
          const room=Math.max(1.2, cv-floorYAt(hx,hz));
          const wdt=rand(0.8,1.9), hgt=Math.min(rand(0.8,2.0), room*0.42);
          const w=new THREE.Mesh(webVeilGeo(wdt,hgt));
          w.rotation.y=Math.random()*Math.PI;
          w.position.set(hx,cv-0.15-hgt/2,hz);
          pickFan(w);
        } else if(roll<0.965){             // long streamers
          const len=rand(1.2,Math.max(1.3,Math.min(4.5,(cv-floorYAt(hx,hz))*0.45)));
          const w=new THREE.Mesh(webStreamerGeo(rand(0.15,0.4),len));
          w.position.set(hx,cv+0.05-len/2,hz);
          w.rotation.y=Math.random()*Math.PI;
          pickSheet(w);
        } else {                           // a line strung between vault points
          const a2=Math.random()*Math.PI*2, L2=rand(2.2,5.2);
          const ex=hx+Math.cos(a2)*L2, ez=hz+Math.sin(a2)*L2;
          if(!inMouth(ex,ez,0.5))
            strands.push(strandMesh(hx,cv-rand(0.1,0.5),hz,
              ex,ceilYAt(ex,ez)-rand(0.1,0.6),ez,rand(0.03,0.06)));
        }
        placed++;
      }
    }
    /* the way back up, silked shut: a torn lid across the bore's mouth,
       drapes down its flowstone collar, anchor lines radiating out along
       the vault, and guys trussing the broken flight that hangs below */
    {
      const M=CAVE.stairMouth, sx=M.x, sz=M.z, sh=M.lip;
      const lid=new THREE.Mesh(webHammockGeo(4.4,4.4,0.7));
      lid.rotation.order="YXZ"; lid.rotation.y=Math.random()*Math.PI; lid.rotation.x=-Math.PI/2;
      lid.position.set(sx,sh+0.25,sz);
      tornV.push(lid);
      for(let i=0;i<7;i++){
        const a=i/7*Math.PI*2+rand(-0.3,0.3), len=rand(1.4,2.6);
        const w=new THREE.Mesh(webSheetGeo(rand(1.1,1.9),len,rand(0.2,0.45)));
        w.position.set(sx+Math.cos(a)*2.5, sh+0.2-len/2, sz+Math.sin(a)*2.5);
        w.rotation.y=-a+Math.PI/2;
        pickSheet(w);
      }
      for(let i=0;i<10;i++){
        const a=Math.random()*Math.PI*2;
        const ex=sx+Math.cos(a)*rand(4.0,6.5), ez=sz+Math.sin(a)*rand(4.0,6.5);
        strands.push(strandMesh(sx+Math.cos(a)*2.3, sh+rand(0,0.4), sz+Math.sin(a)*2.3,
          ex, ceilYAt(ex,ez)-rand(0,0.6), ez, rand(0.03,0.07)));
      }
      /* the collapsed flight never fell all the way — the brood hung it back */
      for(let i=0;i<6;i++){
        const a=Math.random()*Math.PI*2;
        strands.push(strandMesh(sx+Math.cos(a)*2.1, rand(3.1,5.2), sz+Math.sin(a)*2.1,
          sx+Math.cos(a)*rand(2.6,4.6), rand(0.3,1.2), sz+Math.sin(a)*rand(2.6,4.6),
          rand(0.03,0.06)));
      }
    }
    /* cocoon bundles near the nests — almost all of them perfectly still.
       A hung one gets REAL SILK: two lines running the whole way up to the
       vault. Half of them used to be parked at floor+0.4..1.8 with nothing
       attached, which is just a wrapped body hovering at waist height.
       (Built here, before the flush, so the lines merge with the strands.) */
    {
      const cocoons=[];
      for(const b of broods){
        const n=2+Math.floor(srand()*2);
        for(let i=0;i<n;i++){
          const p=cellToWorld3(b.cx,b.cy);
          const px=p.x+rand(-5,5), pz=p.z+rand(-5,5);
          if(cellAt3(px,pz)===1||!clearOf(px,pz,0.4)) continue;
          const co=makeCocoon();
          const r=co.geometry.parameters.radius;
          const fy=floorYAt(px,pz), cv=ceilYAt(px,pz);
          if(cv-fy>3.2&&Math.random()<0.5){
            /* dangling: the long axis stays roughly vertical, as a bundle
               on a thread would hang */
            const hy=fy+r*co.scale.y+rand(0.5,1.4);
            co.position.set(px,hy,pz);
            co.rotation.set(rand(-0.25,0.25),Math.random()*7,rand(-0.25,0.25));
            for(let k=0;k<2;k++){
              const ox=rand(-0.16,0.16), oz=rand(-0.16,0.16);
              strands.push(strandMesh(px+ox, hy+r*co.scale.y*0.85, pz+oz,
                px+ox*3+rand(-0.4,0.4), cv-0.05, pz+oz*3+rand(-0.4,0.4), rand(0.03,0.055)));
            }
          }
          else {
            /* on the ground: it LIES DOWN. These are 1.5–2m bundles stood
               on end at floor+0.45, so half of each one was underneath the
               rock — seat them on their side, settled into the silt. */
            co.rotation.set(rand(-0.13,0.13), Math.random()*7,
              Math.PI/2+rand(-0.28,0.28));
            co.position.set(px, fy+r*0.86, pz);
            CAVE.obstacles.push({x:px,z:pz,r:0.5});
          }
          cocoons.push(co);
        }
      }
      if(cocoons.length){
        scene.add(mergeStatic(cocoons,cocoonMat));
        for(const m of cocoons) m.geometry.dispose();
      }
    }
    const flush=(arr,mat)=>{ if(arr.length){ scene.add(mergeStatic(arr,mat));
      for(const m of arr) m.geometry.dispose(); } };
    flush(sheets[0],webSheetMats[0]); flush(sheets[1],webSheetMats[1]);
    flush(fans[0],webFanMats[0]);     flush(fans[1],webFanMats[1]);
    flush(tornV,webTornMat);          flush(strands,webStrandMat);
    flush(funnels,webFunnelMat);
  }
  /* ---- fungus: the level's light grid (cold records; silent; no buzz) ----
     Real mushrooms now, in location-driven varieties: shelf CONKS climb the
     chamber walls, TOADSTOOL families crowd the floors, green coral FINGERS
     line the stream banks, pale PUFFBALLS dot the scree — and every colony
     blushes violet as it nears a brood chamber. One light record + one
     merged mesh + halo + vein per colony (3 draws, same as the old blobs). */
  {
    const streamNear=(x,y)=>{
      for(let yy=y-2;yy<=y+2;yy++)for(let xx=x-2;xx<=x+2;xx++)
        if(codeAt(xx,yy)===3) return true;
      return false;
    };
    let placedCells=new Set();
    /* per-variety glow: e drives the emissive tint (lights.js cold branch),
       pool colors the bound point light, halo colors the additive bloom.
       e runs >1 because the emissive MAP averages well under white. */
    const TINTS={
      conk:  {e:[0.42,1.30,1.50], halo:0x58c8e6, pool:[0.36,0.86,1.00]},
      shroom:{e:[0.40,1.45,1.25], halo:0x54dcc4, pool:[0.34,0.95,0.85]},
      finger:{e:[0.45,1.50,1.00], halo:0x5ee6a8, pool:[0.36,1.00,0.70]},
      puff:  {e:[0.70,1.25,1.50], halo:0x86c8f0, pool:[0.50,0.85,1.00]},
    };
    const VIOLET={e:[1.05,0.85,1.65], halo:0x8d8af0, pool:[0.62,0.60,1.00]};
    const tryFungus=(x,y,bright,kind)=>{
      if(placedCells.has(K(x,y))) return;
      let faces=[];
      for(const[dx0,dy0]of[[1,0],[-1,0],[0,1],[0,-1]])
        if(codeAt(x+dx0,y+dy0)===1) faces.push([dx0,dy0]);
      /* conks need a wall: slide to the nearest cell that has one (the
         "dependable" spawn clusters rely on this), else become a floor family */
      if(kind==="conk"&&!faces.length){
        outer:
        for(let r=1;r<=3;r++)for(let oy=-r;oy<=r;oy++)for(let ox=-r;ox<=r;ox++){
          const nx=x+ox, ny=y+oy;
          if(!inB(nx,ny)||grid3[ny][nx]===1||grid3[ny][nx]===5||placedCells.has(K(nx,ny))) continue;
          for(const[dx0,dy0]of[[1,0],[-1,0],[0,1],[0,-1]])
            if(codeAt(nx+dx0,ny+dy0)===1){ x=nx; y=ny; faces.push([dx0,dy0]); }
          if(faces.length) break outer;
        }
        if(!faces.length) kind="shroom";
      }
      if(kind!=="conk"&&grid3[y][x]===3) return;   // nothing sprouts mid-stream
      const p=cellToWorld3(x,y);
      /* brood proximity first: the tint needs it */
      let region=-1, best=1e9;
      broods.forEach((b,i)=>{ const d=Math.hypot(x-b.cx,y-b.cy); if(d<best){best=d;region=i;} });
      const vk=clamp(1-best/5,0,1)*0.85;
      const T=TINTS[kind];
      const mix=(a,b)=>[lerp(a[0],b[0],vk),lerp(a[1],b[1],vk),lerp(a[2],b[2],vk)];
      const eTint=mix(T.e,VIOLET.e), poolCol=mix(T.pool,VIOLET.pool);
      const haloCol=new THREE.Color(T.halo).lerp(new THREE.Color(VIOLET.halo),vk);
      const g=new THREE.Group();
      /* Phong + the skin atlas: diffuse gives mushroom flesh under the
         lantern, emissiveMap gives gill-lines/rims/pores their own glow
         while lights.js drives the emissive COLOR (so shapes keep shading) */
      const glowMat=new THREE.MeshPhongMaterial({color:0xc9d2cf, map:FSKIN.map,
        emissive:0x081418, emissiveMap:FSKIN.emit, specular:0x2a4a50, shininess:30,
        side:THREE.DoubleSide});           // the mycelium cords are open ribbons
      const parts=[];
      /* every fruiting body books the point its cords leave from: a root
         system that starts at the group's average position starts inside
         thin air between the mushrooms */
      const anchors=[];
      let ax=p.x, az=p.z, hh=0.55, fdx=0, fdy=0, faceRot=0, onWall=false;
      const fy0=floorYAt(p.x,p.z);
      if(kind==="conk"){
        const [dx,dy]=faces[Math.floor(srand()*faces.length)];
        fdx=dx; fdy=dy; onWall=true;
        const bx=p.x+dx*(E-0.10), bz=p.z+dy*(E-0.10);
        const fyc=floorYAt(bx,bz);
        /* the colony's size class: nothing smaller than 2× the old
           shelves, the rare ancient one a metre-plus across (heavily
           skewed — most sit 2-4×). The big ones ride HIGH on the face,
           above head height, like real bracket giants. */
        const sf=2+8*Math.pow(srand(),2.6);
        hh=fyc+rand(0.5+sf*0.22, Math.max(1.4+sf*0.22, Math.min(ceilH[y][x]-0.5, 1.6+sf*0.55)));
        faceRot = dx? (dx>0?-Math.PI/2:Math.PI/2) : (dy>0?Math.PI:0);
        ax=bx; az=bz;
        /* 1-2 shelf runs climbing the rock face, conks shrinking as they
           go — each shelf rides the wall's own relief so it stays socketed */
        const runs=1+(srand()<0.6?1:0);
        let maxRc=0, lowY=1e9;
        for(let rI=0;rI<runs;rI++){
          const off=(srand()-0.5)*1.7;                    // slide along the wall
          const cx2=bx+(dy!==0?off:0), cz2=bz+(dx!==0?off:0);
          let yy=Math.max(fyc+0.35,hh-rand(0.3,0.8));
          const n=sf>4? 2+Math.floor(srand()*2) : 3+Math.floor(srand()*3);
          for(let i=0;i<n;i++){
            if(yy>ceilYAt(cx2,cz2)-0.35) break;
            const rc=rand(0.16,0.3)*sf*(1-0.4*i/n);
            maxRc=Math.max(maxRc,rc); lowY=Math.min(lowY,yy);
            const F=wallField(cx2,yy,cz2);
            const m=new THREE.Mesh(conkGeo(rc));
            /* half-buried in the face: only the shelf protrudes */
            m.position.set(cx2+F.x+dx*rand(0.02,0.16)+(dy!==0?rand(-0.12,0.12):0),
                           yy,
                           cz2+F.z+dy*rand(0.02,0.16)+(dx!==0?rand(-0.12,0.12):0));
            m.rotation.set(rand(-0.14,0.14),Math.random()*Math.PI*2,rand(-0.14,0.14));
            m.scale.y=rand(0.6,0.85);
            parts.push(m);
            /* cords leave from UNDER a shelf, where the bracket meets the
               rock — `off` is already this run's offset along the face,
               which is exactly the wall walker's u */
            anchors.push({u:off+rand(-0.10,0.10), y:yy-rc*0.30});
            yy+=rc*rand(0.9,1.6)+0.08;
          }
        }
        /* a low shelf big enough to walk into is solid */
        if(maxRc>0.5&&lowY<fyc+2.25)
          CAVE.obstacles.push({x:ax-dx*0.3, z:az-dy*0.3, r:Math.min(1.3,maxRc*0.8)});
        /* juveniles sprouting from the floor at the wall's foot */
        const nb=1+Math.floor(srand()*3);
        for(let i=0;i<nb;i++){
          const rc=rand(0.05,0.1);
          const jx=bx-dx*rand(0.25,0.7)+(dy!==0?rand(-0.5,0.5):0);
          const jz=bz-dy*rand(0.25,0.7)+(dx!==0?rand(-0.5,0.5):0);
          const m=new THREE.Mesh(toadstoolGeo(rc,rc*0.32,rand(0.05,0.14),rc*rand(0.6,1)));
          m.position.set(jx, floorYAt(jx,jz), jz);
          m.rotation.y=Math.random()*Math.PI*2;
          parts.push(m);
        }
      } else if(kind==="shroom"){
        /* a toadstool family: one or two elders ringed by juveniles */
        const nBig=1+(srand()<0.35?1:0), nSmall=3+Math.floor(srand()*4);
        for(let i=0;i<nBig+nSmall;i++){
          const big=i<nBig;
          const rc=big?rand(0.15,0.28):rand(0.05,0.12);
          const hs=big?rand(0.2,0.42):rand(0.07,0.18);
          const m=new THREE.Mesh(toadstoolGeo(rc,rc*rand(0.24,0.36),hs,rc*rand(0.55,1.35)));
          const a=Math.random()*Math.PI*2, rr=big?Math.random()*0.35:0.3+Math.random()*0.75;
          const mx=p.x+Math.cos(a)*rr, mz=p.z+Math.sin(a)*rr;
          m.position.set(mx,floorYAt(mx,mz),mz);
          m.rotation.set(rand(-0.09,0.09),Math.random()*Math.PI*2,rand(-0.09,0.09));
          parts.push(m);
          if(big||srand()<0.4) anchors.push({x:mx,z:mz});   // cords leave the stipe
        }
        hh=fy0+0.55;
      } else if(kind==="finger"){
        /* coral clumps: spindles leaning outward, tips alight */
        const clumps=2+(srand()<0.5?1:0);
        for(let c=0;c<clumps;c++){
          const a0=Math.random()*Math.PI*2, rr=c===0?Math.random()*0.3:0.45+Math.random()*0.7;
          const cx2=p.x+Math.cos(a0)*rr, cz2=p.z+Math.sin(a0)*rr;
          anchors.push({x:cx2,z:cz2});                      // one system per clump
          const n=5+Math.floor(Math.random()*5);
          for(let i=0;i<n;i++){
            const fa=Math.random()*Math.PI*2, fr=Math.random()*0.16;
            const mx=cx2+Math.cos(fa)*fr, mz=cz2+Math.sin(fa)*fr;
            const m=new THREE.Mesh(fingerGeo(rand(0.02,0.045),rand(0.14,0.42)));
            m.position.set(mx,floorYAt(mx,mz),mz);
            m.rotation.set(Math.sin(fa)*rand(0.05,0.35),0,-Math.cos(fa)*rand(0.05,0.35));
            parts.push(m);
          }
        }
        hh=fy0+0.4;
      } else {
        /* puffballs half-sunk in the grit */
        const n=5+Math.floor(srand()*5);
        for(let i=0;i<n;i++){
          const r=rand(0.05,0.15);
          const a=Math.random()*Math.PI*2, rr=Math.random()*0.85;
          const mx=p.x+Math.cos(a)*rr, mz=p.z+Math.sin(a)*rr;
          const m=new THREE.Mesh(puffGeo(r));
          m.position.set(mx, floorYAt(mx,mz)+r*0.72, mz);
          m.scale.y=0.85; m.rotation.y=Math.random()*Math.PI*2;
          parts.push(m);
          if(srand()<0.5) anchors.push({x:mx,z:mz});
        }
        hh=fy0+0.35;
      }
      /* the root system: branching cords leaving the fruiting bodies
         themselves and riding the displaced surface they grow over */
      {
        if(!anchors.length) anchors.push(onWall? {u:0,y:hh} : {x:ax,z:az});
        /* two or three SYSTEMS, each off a different mushroom — one per
           body would carpet the cell, and a colony's cords come off the
           big ones. Trunks are heavier than the old single cords were,
           because a trunk here is the thing that all the forks come out
           of; the tips end up finer than anything the old pass drew. */
        const pick=[];
        const want=Math.min(anchors.length, 2+Math.floor(srand()*2));
        while(pick.length<want){
          const a=anchors[Math.floor(srand()*anchors.length)];
          if(!pick.includes(a)) pick.push(a);
        }
        const sys=rhizoSystem({anchors:pick, onWall, fdx, fdy, ax, az,
                               w0:rand(0.050,0.072), budget:onWall?190:150});
        for(const pts of sys) parts.push(new THREE.Mesh(cordGeo(pts)));
      }
      g.add(mergeStatic(parts,glowMat));
      for(const m of parts) m.geometry.dispose();
      /* the glow on the ground: a small soft pool under floor colonies
         only — wall shelves rely on their own emissive faces + the bound
         pool light (no painted blobs on the rock anymore) */
      let haloMat=null;
      if(!onWall){
        haloMat=new THREE.MeshBasicMaterial({map:HALO_TEX, color:haloCol,
          transparent:true, opacity:0.16, blending:THREE.AdditiveBlending, depthWrite:false});
        const halo=new THREE.Mesh(new THREE.PlaneGeometry(rand(0.8,1.3),rand(0.8,1.3)),haloMat);
        halo.rotation.x=-Math.PI/2;
        halo.position.set(ax,floorYAt(ax,az)+0.05,az);
        g.add(halo);
      }
      scene.add(g);
      const rec=makeLightRecord(glowMat,glowMat,x,y,{x:ax,y:0,z:az},
        {warm:false, bright:bright, dimDen:0.5, flickery:Math.random()<0.35, fixY:hh});
      rec.cold=true; rec.buzz=false; rec.mul2=1;
      rec.tint=eTint; rec.poolCol=poolCol;
      rec.haloMat=haloMat;                       // may be null: wall colonies keep no decal
      rec.region = best<9? region : -1;
      lights.push(rec);
      placedCells.add(K(x,y));
    };
    for(let y=2;y<CH-2;y+=1)for(let x=2;x<CW-2;x+=1){
      const code=grid3[y][x];
      if(code===1||code===5||code===2) continue;
      const nearWater=streamNear(x,y);
      const inChamber=CAVE.chambers.some(c=>Math.hypot(x-c.cx,y-c.cy)<=c.r);
      let kind, pp;
      /* the map has ~2× the open cells now — per-cell odds come down so the
         colony count (and its light records) stays in the same band */
      if(code===3){ pp=0.07; kind="conk"; }                       // wall growth over the water
      else if(nearWater){ pp=0.20; kind=srand()<0.55?"finger":"shroom"; }
      else if(code===4){ pp=0.11; kind="puff"; }                  // scree fields
      else if(inChamber){ pp=0.15; kind=srand()<0.5?"conk":"shroom"; }
      else { pp=0.07; kind=srand()<0.65?"conk":"puff"; }          // tunnels
      if(srand()<pp) tryFungus(x,y, nearWater? rand(0.85,1):rand(0.6,0.9), kind);
    }
    /* the spawn is never pitch black: one dependable colony over the wreck
       of a stair, and a toadstool family beside it */
    tryFungus(spawnC.cx,spawnC.cy+0,1,"conk");
    tryFungus(spawnC.cx-1,spawnC.cy,0.95,"shroom");
  }
  /* ---- rubble piles over the sealed tunnels (and the fissure choke) ---- */
  const boulderGeo=new THREE.SphereGeometry(1,7,6);
  const makePile=(cells)=>{
    const g=new THREE.Group();
    for(const c of cells){
      const cx=c.x!==undefined?c.x:c.cx, cy=c.y!==undefined?c.y:c.cy;
      const p=cellToWorld3(cx,cy);
      /* the core reaches the local vault — a collapse seals its tunnel */
      const hC=Math.min(cH[cy][cx],cH[cy][cx+1],cH[cy+1][cx],cH[cy+1][cx+1])+0.6;
      const core=new THREE.Mesh(scaleBoxUV(new THREE.BoxGeometry(CELL*0.98,hC,CELL*0.98),CELL,hC,CELL,UVm),rockMat);
      core.position.set(p.x,hC/2-0.4,p.z); g.add(core);
      for(let i=0;i<7;i++){
        const b=new THREE.Mesh(boulderGeo,rockMat);
        const s=rand(0.3,0.85);
        const bx=p.x+rand(-2.1,2.1), bz=p.z+rand(-2.1,2.1);
        b.scale.set(s,s*rand(0.6,0.9),s*rand(0.7,1.2));
        b.position.set(bx, floorYAt(bx,bz)+s*0.4, bz);
        b.rotation.set(Math.random()*7,Math.random()*7,Math.random()*7);
        g.add(b);
      }
    }
    scene.add(g);
    return g;
  };
  for(const ev of CAVE.events) ev.pile=makePile(ev.openCells);
  const chokePile=makePile([CAVE.fissureChoke]);
  /* ---- the fissure: a chimney of cold air behind the choke ---- */
  {
    const pc=cellToWorld3(CAVE.fissurePocket.cx,CAVE.fissurePocket.cy);
    const R=2.0, RISE=4.4, STEPS=16, N=58;
    const stair={a0:Math.PI/2, dir:1, rc:R-0.58, rise:RISE, steps:STEPS, n:N};
    const g=new THREE.Group(); g.visible=false;
    const boreTex=texCaveRock;
    const boreMat=new THREE.MeshPhongMaterial({map:boreTex, specular:0x10141a, shininess:6,
      emissive:0x060a0c, side:THREE.BackSide});
    const TOP=18;
    const bore=new THREE.Mesh(new THREE.CylinderGeometry(R+0.05,R+0.3,TOP+2,32,1,true),boreMat);
    bore.position.set(pc.x,TOP/2-1,pc.z); g.add(bore);
    /* treads: the mirror of the library's — these go UP */
    {
      /* stays cooler than the cave — this is the library's stone, and the
         contrast is the point — but nowhere near the old 0xc8d2d8, which
         lit up as painted concrete. The UVs are world-scaled too: raw box
         UVs crammed a whole 4 m tile onto a 1.25 m tread, which averaged
         out to a flat grey slab with no grain at all. */
      const stepMat=new THREE.MeshPhongMaterial({map:texCaveRock, bumpMap:texCaveRock,
        bumpScale:0.06, color:0x4e565e, emissive:0x03060a, specular:0x0e1218, shininess:6});
      const stepGeo=scaleBoxUV(new THREE.BoxGeometry(1.25,0.24,1.0),1.25,0.24,1.0,2);
      const steps=[];
      for(let i=0;i<N;i++){
        const th=stair.a0+i*(Math.PI*2/STEPS);
        const m=new THREE.Mesh(stepGeo,stepMat);
        m.position.set(pc.x+Math.cos(th)*stair.rc, 0.02+i*(RISE/STEPS)-0.12,
                       pc.z+Math.sin(th)*stair.rc);
        m.rotation.y=-th;
        steps.push(m);
      }
      g.add(mergeStatic(steps,stepMat));
      stepGeo.dispose();
    }
    /* pale daylight-that-can't-be bleeding down the bore */
    const sky=new THREE.Mesh(new THREE.CircleGeometry(R+0.1,28),
      new THREE.MeshBasicMaterial({color:0x9fb6be}));
    sky.rotation.x=Math.PI/2; sky.position.set(pc.x,TOP+0.9,pc.z); g.add(sky);
    const hazes=[];
    [[5,0.05],[9,0.10],[12,0.2],[15,0.36],[17,0.6]].forEach(([y,op])=>{
      const m=new THREE.MeshBasicMaterial({color:0xb9c9ce, transparent:true, opacity:op,
        depthWrite:false, side:THREE.DoubleSide});
      const d=new THREE.Mesh(new THREE.CircleGeometry(R+0.02,28),m);
      d.rotation.x=-Math.PI/2; d.position.set(pc.x,y,pc.z);
      hazes.push({mat:m,baseOp:op}); g.add(d);
    });
    scene.add(g);
    /* its lights live in the scene from build, dark — the reveal must never
       change the light count (the v2.6 shader-recompile lesson) */
    const fLights=[];
    [[16.5,1.3,16],[9,0.7,12],[3,0.5,10]].forEach(([y,I,dist])=>{
      const l=new THREE.PointLight(0xcfe2ea,0,dist,1.6);
      l.position.set(pc.x,y,pc.z); scene.add(l);
      fLights.push({l,I});
    });
    CAVE.fissure={x:pc.x, z:pc.z, r:R, stair, group:g, lights:fLights, hazes,
                  choke:chokePile, open:false};
  }
  /* ---- clutch fire lights: parked dark from the first frame ---- */
  for(const b of CAVE.broods){
    const l=new THREE.PointLight(0xff8c3a,0,11,1.7);
    l.position.set(b.center.x,1.2,b.center.z); scene.add(l);
    b.fireLight=l;
  }
  /* ---- the arrival: the library's shaft, seen from the wrong end ----
     The bore you rode down comes THROUGH the vault: a stone throat ringed
     in flowstone, and the same stair — same treads, same pitch, the same
     helix you descended — winding up into a haze that swallows it (the
     library is a long way up). Its lowest flight collapsed under ages of
     silk: the way back reads, and refuses. */
  {
    const M=CAVE.stairMouth, sx=M.x, sz=M.z, yL=M.lip;
    /* the flowstone collar: welds the vault's jagged cut edge to the bore.
       Inner lip tucked inside the bore's foot, outer skirt carried up past
       the surrounding ceiling — no seam can ever show from below. */
    {
      const SEG=26, acc=new QuadAcc();
      const rows=[[2.55,0,0.10],[3.6,0.55,0.22],[5.05,1,0.12]]; // [radius, lift, drip jitter]
      const cols=[];
      for(let s=0;s<=SEG;s++){
        const th=(s%SEG)/SEG*Math.PI*2;          // s=SEG re-samples s=0: the seam closes
        const col=[];
        for(const[rBase,k,dj]of rows){
          const rr=rBase+Math.sin(th*7+rBase*3)*dj+Math.sin(th*3+rBase)*dj*0.7;
          const px=sx+Math.cos(th)*rr, pz=sz+Math.sin(th)*rr;
          col.push([px, lerp(yL+Math.sin(th*5+1.3)*0.14, ceilYAt(px,pz)+0.5, k), pz]);
        }
        cols.push(col);
      }
      for(let s=0;s<SEG;s++)for(let r=0;r<2;r++){
        const a=cols[s][r], b=cols[s+1][r], c=cols[s+1][r+1], d=cols[s][r+1];
        const u0=s/SEG*10, u1=(s+1)/SEG*10;
        acc.tri(a,b,c,[[u0,r],[u1,r],[u1,r+1]]);
        acc.tri(a,c,d,[[u0,r],[u1,r+1],[u0,r+1]]);
      }
      scene.add(acc.mesh(curtainMat));           // DoubleSide calcite, like the drapery
    }
    /* the bore: earth-stained stone, slightly belled at the break like the
       library's, rising into a stacked haze that goes lightless — the dark
       up there is the library's, not the cave's */
    {
      const bt=texCaveRock.clone(); bt.needsUpdate=true; bt.repeat.set(5,3);
      const boreMat=new THREE.MeshPhongMaterial({map:bt, color:0xa6988a,
        emissive:0x04060a, specular:0x0c0e12, shininess:8, side:THREE.BackSide});
      const BLEN=14.5;
      const bore=new THREE.Mesh(new THREE.CylinderGeometry(2.75,2.95,BLEN,32,1,true),boreMat);
      bore.position.set(sx, yL-0.3+BLEN/2, sz); scene.add(bore);
      const cap=new THREE.Mesh(new THREE.CircleGeometry(2.9,32),
        new THREE.MeshBasicMaterial({color:0x020508}));
      cap.rotation.x=Math.PI/2; cap.position.set(sx,yL+13.4,sz); scene.add(cap);
      [[1.4,0.08],[3.4,0.16],[5.6,0.28],[7.8,0.45],[10.0,0.68],[12.2,0.9]]
      .forEach(([dy,op],i,arr)=>{
        const c=new THREE.Color(0x24404e).lerp(new THREE.Color(0x02040a),i/(arr.length-1));
        const m=new THREE.MeshBasicMaterial({color:c, transparent:true, opacity:op,
          depthWrite:false, side:THREE.DoubleSide});
        const d=new THREE.Mesh(new THREE.CircleGeometry(2.72,32),m);
        d.rotation.x=-Math.PI/2; d.position.set(sx,yL+dy,sz); scene.add(d);
      });
      /* one cold breath in the throat so the collar and the silk lid read */
      const l=new THREE.PointLight(0x6e94a6,0.5,9,1.7);
      l.position.set(sx,yL+1.4,sz); scene.add(l);
    }
    /* the stair: the library's own numbers (rise 4.48/turn, 16 treads,
       radius 2.08) so it IS that stair, continued — phase locked to height
       so the helix runs unbroken from the haze down to the break */
    {
      const stepMat=new THREE.MeshPhongMaterial({map:texCaveRock, bumpMap:texCaveRock,
        bumpScale:0.06, color:0x474e56, emissive:0x020508, specular:0x0c1016, shininess:6});
      const stepGeo=scaleBoxUV(new THREE.BoxGeometry(1.3,0.24,1.05),1.3,0.24,1.05,2);
      const RISE=4.48, STEPS=16, rc=2.08;
      const steps=[];
      const yTop=yL+12.6, yBreak=3.3;
      const n=Math.ceil((yTop-yBreak)/(RISE/STEPS));
      for(let i=0;i<n;i++){
        const yy=yBreak+i*(RISE/STEPS);
        const th=Math.PI/2+(yTop-yy)/RISE*Math.PI*2;
        const m=new THREE.Mesh(stepGeo,stepMat);
        m.position.set(sx+Math.cos(th)*rc, yy, sz+Math.sin(th)*rc);
        m.rotation.y=-th;
        if(i<3){                       // the break: the last treads sag toward the fall
          m.position.y-=(3-i)*0.08;
          m.rotation.z=(Math.random()-0.5)*0.3; m.rotation.x=(Math.random()-0.5)*0.22;
        }
        steps.push(m);
      }
      /* the fallen flight, where it landed: snapped treads half-sunk at the foot */
      for(let i=0;i<8;i++){
        const a=Math.random()*Math.PI*2, rr=rand(0.3,1.8);
        const m=new THREE.Mesh(stepGeo,stepMat);
        const bx=sx+Math.cos(a)*rr, bz=sz+Math.sin(a)*rr;
        const s=rand(0.55,1);
        m.scale.set(s,s,s*rand(0.5,1));
        m.position.set(bx, floorYAt(bx,bz)+rand(0.0,0.28), bz);
        m.rotation.set(rand(-0.5,0.5),Math.random()*Math.PI*2,rand(-0.6,0.6));
        steps.push(m);
      }
      scene.add(mergeStatic(steps,stepMat));
      stepGeo.dispose();
    }
    /* (the silk sealing this mouth is built with the web pass above;
       the debris obstacle was pushed with the mouth, before placement) */
  }
  /* ---- the corpse, the lantern, the journal ----
     Beside the dead stair, and it announces itself: the dropped lantern
     still holds a dying ember — a faint warm breath in all the fungus
     blue — with the journal lying open where it slid. */
  {
    const p=CAVE.corpseP;
    const body=makeCorpse();
    body.position.set(p.x+0.4,floorYAt(p.x+0.4,p.z),p.z);
    body.rotation.y=rand(0,Math.PI*2);
    scene.add(body);
    const lant=makeLanternProp();
    lant.position.set(p.x-0.55,floorYAt(p.x-0.55,p.z+0.3)+0.06,p.z+0.3);
    lant.rotation.z=1.35;                          // knocked over where it was dropped
    lant.rotation.y=rand(0,7);
    lant.userData.animated=true;
    /* the ember: the mantle still glows inside the glass */
    const ember=new THREE.Mesh(new THREE.SphereGeometry(0.045,7,6),
      new THREE.MeshBasicMaterial({color:0xffc06a}));
    ember.position.y=0.13; lant.add(ember);
    scene.add(lant);
    /* the journal, fallen open beside it */
    const jr=new THREE.Group();
    /* fallen OPEN: two boards splayed off a spine with the page block
       swollen between them, instead of two stacked slabs */
    const leather=new THREE.MeshPhongMaterial({map:texCloth, color:0x6e5236,
      specular:0x1a140c, shininess:10});
    const paper=new THREE.MeshPhongMaterial({map:texJournalPages, color:0x6e6858,
      specular:0x111111, shininess:3});
    const spine=new THREE.Mesh(new THREE.BoxGeometry(0.045,0.030,0.35),leather);
    spine.position.y=0.015; jr.add(spine);
    for(const sx of[-1,1]){
      const board=new THREE.Mesh(new THREE.BoxGeometry(0.25,0.016,0.35),leather);
      board.position.set(sx*0.145,0.012,0); board.rotation.z=sx*0.055; jr.add(board);
      const leaf=new THREE.Mesh(new THREE.BoxGeometry(0.225,0.026,0.315),paper);
      leaf.position.set(sx*0.142,0.031,0.004);
      leaf.rotation.set(0,sx*0.03,sx*0.075); jr.add(leaf);
    }
    /* a couple of leaves torn loose and lying nearby */
    for(let i=0;i<3;i++){
      const lf=new THREE.Mesh(new THREE.BoxGeometry(0.20,0.003,0.27),paper);
      lf.position.set(rand(-0.45,0.45),0.004,rand(-0.4,0.5));
      lf.rotation.set(rand(-0.05,0.05),Math.random()*Math.PI,rand(-0.05,0.05));
      jr.add(lf);
    }
    const jx=p.x-0.15, jz=p.z+0.75;
    jr.position.set(jx,floorYAt(jx,jz),jz);
    jr.rotation.y=rand(0,7); jr.rotation.z=0.05;
    scene.add(jr);
    /* the ember's light — warm, small, breathing (updateCave flickers it);
       killed (not removed: light count) when the lantern is taken */
    const glowL=new THREE.PointLight(0xffb46a,0.8,7,1.7);
    glowL.position.set(lant.position.x,lant.position.y+0.35,lant.position.z);
    scene.add(glowL);
    CAVE.corpse={body,lant,journal:jr,glowL};
    addInteractable({kind:"corpse", mesh:lant, journal:jr, glowL,
      label:()=>"TAKE THE LANTERN & JOURNAL", taken:false});
  }
  /* ---- the clutches ---- */
  CAVE.broods.forEach((b,i)=>{
    const cl=makeClutch();
    cl.position.set(b.center.x,0,b.center.z);
    cl.rotation.y=srand()*Math.PI*2;
    cl.userData.animated=true;                     // the eggs breathe
    scene.add(cl);
    b.clutch=cl; b.burned=false;
    /* (the keep-out circle for this spot was reserved before the dripstone
       and web passes, up with the stair mouth and the corpse) */
    addInteractable({kind:"clutch", mesh:cl, idx:i, taken:false,
      label:()=> STATE.hasLantern? "IGNITE THE CLUTCH — HOLD [E]" : "EGGS. YOU NEED FIRE."});
  });
  /* freeze all the static matrices, then pre-warm every shader (the hidden
     fissure included) while the level is still behind the intro's black */
  freezeStaticScene();
  CAVE.fissure.group.visible=true;
  renderer.compile(scene,camera);
  CAVE.fissure.group.visible=false;
}

/* ---------------- the burns ---------------- */
export function igniteClutch(it){
  const b=CAVE.broods[it.idx];
  if(!b||b.burned) return;
  b.burned=true; it.taken=true;
  STATE.clutchesLit++;
  sfxIgnite();
  /* the eggs die: ember out over a few seconds (updateCave animates) */
  b.burnT=0;
  /* fire — the one light the brood will not cross */
  const handle=startClutchFire();
  CAVE.fires.push({x:b.center.x, z:b.center.z, T:75, light:b.fireLight, handle, idx:it.idx});
  /* the level answers */
  STATE.frenzyT=rand(60,90);
  CAVE.lastBurn={x:b.center.x, z:b.center.z, idx:it.idx, at:STATE.time};
  CAVE.regionDim[it.idx]=0.30;                    // the local glow dies with the heat
  rockfall(STATE.clutchesLit-1);
  if(STATE.clutchesLit>=4) openFissure();
  renderObjectives();
}
/* each burn reshapes the maze: one sealed tunnel opens; one open corridor
   closes — but never one that would cut the player off from what's left */
function rockfall(evIdx){
  CAVE.shakeT=1.6;
  sfxRockfall();
  const ev=CAVE.events[evIdx];
  if(ev){
    for(const c of ev.openCells) grid3[c.y][c.x]=0;
    if(ev.pile) ev.pile.visible=false;
  }
  /* choose a corridor to bring down */
  const protect=new Set();
  const mark=(cx,cy,r)=>{ for(let y=cy-r;y<=cy+r;y++)for(let x=cx-r;x<=cx+r;x++) protect.add(K(x,y)); };
  for(const b of CAVE.broods) if(!b.burned) mark(b.cx,b.cy,2);
  mark(CAVE.entrance.cx,CAVE.entrance.cy,2);
  mark(CAVE.approachC.cx,CAVE.approachC.cy,2);    // the fissure approach…
  for(const b of CAVE.bridgeC) mark(b.cx,b.cy,1); // …and the bridge
  const pc=worldToCell3(STATE.pos.x,STATE.pos.z);
  mark(pc.cx,pc.cy,2);
  const cands=[];
  for(let y=2;y<CH-2;y++)for(let x=2;x<CW-2;x++){
    if(grid3[y][x]!==0||protect.has(K(x,y))) continue;
    const open=[[1,0],[-1,0],[0,1],[0,-1]].filter(([dx,dy])=>!crouchBlocked(x+dx,y+dy));
    if(open.length!==2) continue;                 // a true corridor cell
    const p=cellToWorld3(x,y);
    if(Math.hypot(p.x-STATE.pos.x,p.z-STATE.pos.z)<10) continue;
    cands.push({x,y});
  }
  for(let i=cands.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1)); [cands[i],cands[j]]=[cands[j],cands[i]];
  }
  const targets=[
    {cx:CAVE.entrance.cx, cy:CAVE.entrance.cy},
    CAVE.approachC,
    ...CAVE.broods.filter(b=>!b.burned).map(b=>({cx:b.cx,cy:b.cy})),
  ];
  for(const c of cands){
    grid3[c.y][c.x]=1;                            // tentatively down
    const seen=flood(pc.cx,pc.cy,crouchBlocked);
    const ok=targets.every(t=>seen.has(K(t.cx,t.cy)));
    if(!ok){ grid3[c.y][c.x]=0; continue; }
    /* it holds: raise the rubble */
    const pile=makeRubbleAt(c.x,c.y);
    if(ev) ev.closed={cells:[c], mesh:pile};
    break;
  }
  /* reach caches shift with the ground */
  const seen=flood(pc.cx,pc.cy,crouchBlocked);
  CAVE.reach=seen;
  CAVE.reachList=[...seen].map(k=>({cx:k%CW,cy:(k/CW)|0})).filter(c=>grid3[c.cy][c.cx]!==5);
  const mSeen=flood(CAVE.chambers[1].cx,CAVE.chambers[1].cy,isBlockedSpider3);
  if(mSeen.size>10) CAVE.mReachList=[...mSeen].map(k=>({cx:k%CW,cy:(k/CW)|0}));
}
function makeRubbleAt(cx,cy){
  const g=new THREE.Group();
  const p=cellToWorld3(cx,cy);
  const h=Math.min(cH[cy][cx],cH[cy][cx+1],cH[cy+1][cx],cH[cy+1][cx+1])+0.6;
  const core=new THREE.Mesh(scaleBoxUV(new THREE.BoxGeometry(CELL*0.96,h,CELL*0.96),CELL,h,CELL,4),rockMat);
  core.position.set(p.x,h/2-0.4,p.z); g.add(core);
  const bg=new THREE.SphereGeometry(1,7,6);
  for(let i=0;i<8;i++){
    const b=new THREE.Mesh(bg,rockMat);
    const s=rand(0.3,0.9);
    const bx=p.x+rand(-2.2,2.2), bz=p.z+rand(-2.2,2.2);
    b.scale.set(s,s*rand(0.55,0.85),s*rand(0.7,1.2));
    b.position.set(bx, floorYAt(bx,bz)+s*0.38, bz);
    b.rotation.set(Math.random()*7,Math.random()*7,Math.random()*7);
    g.add(b);
  }
  scene.add(g);
  return g;
}
function openFissure(){
  const f=CAVE.fissure;
  if(!f||f.open) return;
  f.open=true;
  grid3[CAVE.fissureChoke.cy][CAVE.fissureChoke.cx]=0;
  f.choke.visible=false;
  f.group.visible=true;
  f.revealT=0;
  /* the last thing this level has to tell you is WHERE, and 188m of cave is
     too much to sweep on a hunch: the draught it opened is the objectives
     log's one legitimate pointer (see STATE.guide / the bearing row in ui.js) */
  STATE.guide={x:f.x, z:f.z};
  toast("The rubble lets go somewhere to the north. Cold air — from above.",5200);
}

/* The main loop stops calling updateCave the instant you die, so every loop
   the cave is holding open freezes exactly where it was — a clutch fire at
   full crackle, the stream at whatever bank you drowned on. Nothing runs
   again until the respawn, so they have to be closed by hand here. */
export function hushCave(){
  for(const f of CAVE.fires) if(f.handle&&f.handle.hush) f.handle.hush();
  if(AU.ctx&&AU.cave&&AU.cave.streamGain)
    AU.cave.streamGain.gain.setTargetAtTime(0.0001,AU.ctx.currentTime,0.25);
}

/* ---------------- per-frame ---------------- */
export function updateCave(dt){
  const tN=performance.now()/1000;
  /* falling into the dark under the bridge is its own ending */
  if(STATE.y<-9&&!STATE.dead) die("fall");
  /* and once you are dead this function must not run another line. die()
     calls hushCave() to close the fires and the stream — but main.js still
     has updateCave queued behind updateSpiderCave in the very frame she
     catches you, and the fall death kills two lines above this one. Either
     way the rest of the pass re-raised every gain hushCave had just let go,
     and since the world stops updating the moment STATE.dead is set, those
     writes were final: the loops droned on under the death card. */
  if(STATE.dead) return;
  /* rockfall shake, wearing off */
  if(CAVE.shakeT>0){
    CAVE.shakeT-=dt;
    STATE.shakeAmp=Math.max(STATE.shakeAmp, 0.05*clamp(CAVE.shakeT/1.6,0,1));
  } else {
    STATE.shakeAmp=lerp(STATE.shakeAmp, STATE.frenzyT>0? 0.008:0.004, Math.min(1,dt*0.8));
  }
  /* the frenzy clock */
  if(STATE.frenzyT>0) STATE.frenzyT=Math.max(0,STATE.frenzyT-dt);
  /* the dropped lantern's ember breathes until it's taken */
  if(CAVE.corpse&&CAVE.corpse.glowL&&!STATE.hasLantern){
    CAVE.corpse.glowL.intensity=
      0.75+0.16*Math.sin(tN*1.7+Math.sin(tN*0.6)*1.3)+0.14*hash(Math.floor(tN*6)*0.31);
  }
  /* fungus regions dim after their clutch burns (mul2 feeds lights.js's v,
     which owns the halo/vein opacity — one pipeline, no fighting) */
  for(const L of lights){
    if(L.region===undefined||L.region<0) continue;
    const tgt=CAVE.regionDim[L.region];
    if(Math.abs((L.mul2||1)-tgt)>0.002)
      L.mul2=lerp(L.mul2||1, tgt, Math.min(1,dt*0.35));
  }
  /* egg glow: unburned clutches breathe; burned ones ember out */
  CAVE.broods.forEach((b,i)=>{
    if(!b.clutch) return;
    const mats=b.clutch.userData.eggMats;
    const hm=b.clutch.userData.haloMat;
    const fl=b.clutch.userData.flames;
    /* the flames: alive only while the fire has fuel. Each tongue breathes
       on its own incommensurate sine so the group never pulses in unison,
       and the whole set sinks and dims as the burn runs out. */
    if(fl){
      const burning=b.burned? clamp(1-(b.burnT||0)/26,0,1) : 0;
      if(burning<=0){ if(fl[0].visible) for(const t of fl) t.visible=false; }
      else{
        for(const t of fl){
          const u=t.userData;
          const f=0.62+0.38*Math.sin(tN*(5.1*u.sp)+u.ph)
                      *0.5+0.5*hash(Math.floor(tN*19)+u.ph);
          t.visible=true;
          const s=burning*(0.55+0.65*f);
          t.scale.set(0.8+0.35*f, s, 0.8+0.35*f);
          t.rotation.y=u.ph+Math.sin(tN*1.7+u.ph)*0.35;
        }
        flameMat.opacity=clamp(0.30+0.09*Math.sin(tN*7.3)+0.14*burning,0,0.58);
      }
    }
    if(!b.burned){
      const k=0.7+0.3*Math.sin(tN*0.9+i*1.7);
      for(const m of mats) m.emissive.setRGB(0.07*k,0.21*k,0.25*k);
      if(hm) hm.opacity=0.14+0.08*k;
    } else {
      b.burnT=(b.burnT||0)+dt;
      const k=clamp(1-b.burnT/6,0,1);
      for(const m of mats){
        m.emissive.setRGB(0.35*(1-k)+0.07*k, 0.10*(1-k)+0.21*k, 0.02*(1-k)+0.25*k);
        if(b.burnT>6){
          const e=clamp(1-(b.burnT-6)/14,0.06,1);
          m.emissive.setRGB(0.35*e,0.10*e,0.02*e);
          m.color.setRGB(0.10*e+0.055, 0.075*e+0.048, 0.055*e+0.042);
        }
      }
      /* THE EGGS COLLAPSE, and stay collapsed. Once the embers went out
         the old burned clutch was a full pile of plump eggs in a slightly
         darker brown — from two metres away, under an orange lantern, it
         was indistinguishable from a live one, and since it's already
         `taken` there's no prompt to tell you otherwise. Now the pile
         visibly shrivels and settles into the mound: a burned brood reads
         as burned from across the chamber, permanently, and a respawn
         doesn't have to explain itself. */
      const eg=b.clutch.userData.eggs;
      if(eg){
        const sh=clamp((b.burnT-3)/9,0,1);           // shrivel 0→1 over ~9s
        const sx=1-0.42*sh, sy=1-0.58*sh;
        for(const e of eg){
          e.scale.set(sx,1.28*sy,sx);
          e.position.y=e.userData.y0-(e.userData.y0-0.42)*0.55*sh;
        }
      }
      /* the pool of light under it turns fire-orange, then embers down */
      if(hm){
        hm.color.setRGB(1,0.45+0.2*k,0.18+0.4*k);
        const life=clamp(1-b.burnT/80,0.04,1);
        hm.opacity=(0.22+0.10*hash(Math.floor(tN*13)+i*7))*life;
      }
    }
  });
  /* the fires burn down */
  for(let i=CAVE.fires.length-1;i>=0;i--){
    const f=CAVE.fires[i];
    f.T-=dt;
    const life=clamp(f.T/75,0,1);
    const flick=0.75+0.25*hash(Math.floor(tN*17)+i*31);
    f.light.intensity=1.5*Math.pow(life,0.6)*flick;
    /* the crackle belongs to the fire's position, not to the whole level */
    if(f.handle) f.handle.set(Math.pow(life,0.7),
      Math.hypot(f.x-STATE.pos.x, f.z-STATE.pos.z), panTo(f.x,f.z));
    if(f.T<=0){
      f.light.intensity=0;
      if(f.handle) f.handle.stop();
      CAVE.fires.splice(i,1);
    }
  }
  /* the opened fissure breathes cold light */
  const fis=CAVE.fissure;
  if(fis&&fis.open){
    fis.revealT=Math.min(6,(fis.revealT||0)+dt);
    const k=clamp(fis.revealT/4,0,1);
    for(const rec of fis.lights) rec.l.intensity=rec.I*k*(0.92+0.08*Math.sin(tN*0.6));
    for(const hz of fis.hazes) hz.mat.opacity=hz.baseOp*k*(1+0.08*Math.sin(tN*0.5));
  }
  /* water: the surface slides one way, the caustic net on the bed slides
     slower and off-heading. Neither of them alone reads as depth — the
     PARALLAX between the two is the whole effect. */
  if(CAVE.waterMat){
    CAVE.waterMat.opacity=0.60+0.045*Math.sin(tN*0.7);
    const m=CAVE.waterMat.map;
    if(m){ m.offset.x=(tN*0.030)%1; m.offset.y=(tN*0.019)%1; }
  }
  if(CAVE.causticMat){
    CAVE.causticMat.opacity=0.83+0.05*Math.sin(tN*0.51+1.2);
    const m=CAVE.causticMat.map;
    if(m){ m.offset.x=(tN*0.013)%1; m.offset.y=(tN*0.0072)%1; }
  }
  /* the stream's voice, by distance */
  if(AU.cave&&AU.cave.streamGain&&AU.ctx){
    let best=1e9;
    for(const p of CAVE.streamCells){
      const d=(p.x-STATE.pos.x)*(p.x-STATE.pos.x)+(p.z-STATE.pos.z)*(p.z-STATE.pos.z);
      if(d<best) best=d;
    }
    const d=Math.sqrt(best);
    /* LOCAL. At the old 26m you heard the water from two chambers away as a
       featureless wash that never let up — and brood rooms 3 and 4 sit 12
       and 14m off it, so it played through every ignite. Squared falloff
       inside 11m: you hear it when you're at the water, and nowhere else. */
    const k=clamp(1-d/11,0,1);
    AU.cave.streamGain.gain.setTargetAtTime(k*k*0.15, AU.ctx.currentTime, 0.35);
  }
  /* dripwater percussion — and skitters that sound just like it */
  CAVE.dripT-=dt;
  if(CAVE.dripT<=0){
    CAVE.dripT=rand(1.6,6.5);
    if(AU.cave&&AU.cave.drip) AU.cave.drip();
  }
}
