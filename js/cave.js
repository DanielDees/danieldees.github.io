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
         makeFungusSkin, scaleBoxUV } from "./textures.js";
import { addInteractable } from "./props.js";
import { die } from "./lifecycle.js";
import { renderObjectives, toast } from "./ui.js";
import { AU, sfxRockfall, sfxIgnite, startClutchFire } from "./audio.js";

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
  streamCells:[], dripT:2.5, waterMat:null,
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
      let allRock=true, nearStream=false, nearFlat=false;
      for(const[ox,oy]of[[-1,-1],[0,-1],[-1,0],[0,0]]){
        const x=cx+ox, y=cy+oy;
        const t=(x<0||y<0||x>=CW||y>=CH)? 1 : grid3[y][x];
        if(t!==1) allRock=false;
        if(t===3) nearStream=true;
        if(t===5||t===6||t===2) nearFlat=true;
      }
      if(allRock){ fH[cy][cx]=0; fW[cy][cx]=0; continue; }
      if(nearStream){ fH[cy][cx]=-0.25; fW[cy][cx]=0; continue; }
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
   spotlight the strata seams and mottling become real surface relief */
const rockMat=new THREE.MeshPhongMaterial({map:texCaveRock, bumpMap:texCaveRock, bumpScale:0.055,
  specular:0x1a1a16, shininess:10, emissive:0x010101});
const floorMat=new THREE.MeshPhongMaterial({map:texCaveFloor, bumpMap:texCaveFloor, bumpScale:0.035,
  specular:0x0a0a08, shininess:4});
/* dripstone grows wet and glossy — pale calcite, not the parent rock; the
   streaked skin is its own bump map so runnels read as ridges in the beam */
const wetMat=new THREE.MeshPhongMaterial({map:texDripstone, bumpMap:texDripstone, bumpScale:0.08,
  color:0x878f93, specular:0x3e4a52, shininess:46, emissive:0x020303});
/* flowstone curtains hang free of the wall — both faces show */
const curtainMat=new THREE.MeshPhongMaterial({map:texDripstone, bumpMap:texDripstone, bumpScale:0.085,
  color:0x767d7f, specular:0x2e383e, shininess:30, emissive:0x020303, side:THREE.DoubleSide});
const pitMat=new THREE.MeshPhongMaterial({color:0x070605, specular:0x000000, shininess:1});
/* a soft radial glow, shared by every halo in the level */
const HALO_TEX=makeCanvas(64,64,(g,w,h)=>{
  const gr=g.createRadialGradient(w/2,h/2,2,w/2,h/2,w/2);
  gr.addColorStop(0,"rgba(255,255,255,0.9)");
  gr.addColorStop(0.45,"rgba(255,255,255,0.28)");
  gr.addColorStop(1,"rgba(255,255,255,0)");
  g.fillStyle=gr; g.fillRect(0,0,w,h);
});
/* the stream's skin: caustic streaks that drift in updateCave */
const texWater=makeCanvas(128,128,(g,w,h)=>{
  g.fillStyle="#0a181e"; g.fillRect(0,0,w,h);
  for(let i=0;i<10;i++){
    g.strokeStyle=`rgba(${60+Math.random()*40|0},${130+Math.random()*50|0},${150+Math.random()*50|0},${0.10+Math.random()*0.14})`;
    g.lineWidth=1+Math.random()*1.6;
    g.beginPath();
    const y0=Math.random()*h;
    for(let x=0;x<=w;x+=6) g.lineTo(x, y0+Math.sin(x*0.08+i*3)*6+Math.sin(x*0.021+i)*9);
    g.stroke();
  }
  for(let i=0;i<26;i++){
    g.fillStyle=`rgba(150,220,235,${0.05+Math.random()*0.10})`;
    g.fillRect(Math.random()*w,Math.random()*h,1.5+Math.random()*2.5,1);
  }
});
texWater.wrapS=texWater.wrapT=THREE.RepeatWrapping;
markShared(HALO_TEX,texWater,wetMat,curtainMat,texDripstone);
const silkFloorMat=new THREE.MeshPhongMaterial({color:0xb8bcc0, specular:0x222222, shininess:8,
  transparent:true, opacity:0.34, depthWrite:false});
const cocoonMat=new THREE.MeshPhongMaterial({color:0x7e8486, specular:0x2a2c2c, shininess:12});
const eggMat=()=>new THREE.MeshPhongMaterial({color:0x93aeb9, specular:0x2c3c44, shininess:30,
  emissive:0x123540});
const boneMat=new THREE.MeshPhongMaterial({color:0xb8b0a0, specular:0x2c2a24, shininess:16});
const clothMat=new THREE.MeshPhongMaterial({color:0x2c2a26, specular:0x0c0b0a, shininess:4});
const brassMat=new THREE.MeshPhongMaterial({color:0x6e5a2e, specular:0x8a7340, shininess:55});
markShared(rockMat,floorMat,pitMat,silkFloorMat,cocoonMat,boneMat,clothMat,brassMat,
           texCaveRock,texCaveFloor);
/* silk is LIT now (Phong, not Basic): it glistens where the lantern rakes
   it and takes the fungus tint near the broods, instead of glowing flat
   white in the dark. A faint emissive keeps it readable at the threshold. */
const silkMat=t=>new THREE.MeshPhongMaterial({map:t, transparent:true, depthWrite:false,
  side:THREE.DoubleSide, color:0xc8ccce, emissive:0x131517, specular:0x8a929a, shininess:34});
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
/* a classic toadstool: flared stem, radiating gill underside, domed cap */
function toadstoolGeo(rc,rs,hs,ch){
  const P=[],B=[];
  P.push([rs*1.4,0]);            B.push(fv(F_STEM,0.02));
  P.push([rs*1.05,hs*0.3]);      B.push(fv(F_STEM,0.35));
  P.push([rs*0.92,hs*0.8]);      B.push(fv(F_STEM,0.75));
  P.push([rs,hs]);               B.push(fv(F_STEM,0.98));
  P.push([rs*1.15,hs+0.004]);    B.push(fv(F_GILL,0.03));
  P.push([rc*0.6,hs+0.012]);     B.push(fv(F_GILL,0.5));
  P.push([rc*0.98,hs+0.03]);     B.push(fv(F_GILL,0.97));
  P.push([rc,hs+0.05]);          B.push(fv(F_CAP,0.02));
  P.push([rc*0.88,hs+ch*0.5]);   B.push(fv(F_CAP,0.38));
  P.push([rc*0.55,hs+ch*0.85]);  B.push(fv(F_CAP,0.7));
  P.push([rc*0.2,hs+ch]);        B.push(fv(F_CAP,0.9));
  P.push([0.001,hs+ch*1.02]);    B.push(fv(F_CAP,1));
  return latheFungus(P,B,9);
}
/* a shelf conk: stemless cap, half of it buried in the rock face */
function conkGeo(rc){
  const P=[],B=[];
  P.push([0.02,0.0]);            B.push(fv(F_GILL,0.02));
  P.push([rc*0.55,0.008]);       B.push(fv(F_GILL,0.5));
  P.push([rc*0.97,0.03]);        B.push(fv(F_GILL,0.96));
  P.push([rc,0.06]);             B.push(fv(F_CAP,0.02));
  P.push([rc*0.9,rc*0.24]);      B.push(fv(F_CAP,0.35));
  P.push([rc*0.55,rc*0.38]);     B.push(fv(F_CAP,0.7));
  P.push([rc*0.2,rc*0.44]);      B.push(fv(F_CAP,0.9));
  P.push([0.001,rc*0.46]);       B.push(fv(F_CAP,1));
  return latheFungus(P,B,10);
}
/* one coral finger: a tapered spindle, tip mapped to the bright bulb crown */
function fingerGeo(r,hgt){
  const P=[[r,0],[r*0.9,hgt*0.35],[r*0.68,hgt*0.65],[r*0.38,hgt*0.86],[0.001,hgt]];
  const B=[fv(F_BULB,0.03),fv(F_BULB,0.3),fv(F_BULB,0.6),fv(F_BULB,0.85),fv(F_BULB,1)];
  return latheFungus(P,B,7);
}
/* a puffball: squashed sphere remapped into the pore-speckled bulb strip */
function puffGeo(r){
  const g=new THREE.SphereGeometry(r,8,7);
  const uv=g.attributes.uv;
  for(let i=0;i<uv.count;i++) uv.setY(i, fv(F_BULB, uv.getY(i)*0.85+0.05));
  return g;
}
/* a mycelium cord: a thin tapering ribbon that follows the DISPLACED rock
   surface point by point — real geometry, not a decal (it undulates with
   the relief it grows over). UVs run through the glowing bulb strip, so
   the cords light up with the colony and blush violet with it. */
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
    uv.push(i*0.8, fv(F_BULB,0.12), i*0.8, fv(F_BULB,0.88));
    if(i<N-1){ const a=i*2; idx.push(a,a+1,a+3, a,a+3,a+2); }
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute("position",new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute("normal",new THREE.Float32BufferAttribute(nor,3));
  g.setAttribute("uv",new THREE.Float32BufferAttribute(uv,2));
  g.setIndex(idx);
  return g;
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
/* a funnel-weaver's retreat: ragged sheet rim sloping into a throat that
   dives toward the wall/floor junction. Rim up; throat at y=0. */
function funnelWebGeo(r,dep){
  const N=7, seed=Math.random()*10, pts=[];
  for(let i=0;i<N;i++){
    const t=i/(N-1);
    const rad=r*(0.12+0.88*Math.pow(t,1.7))*(1+0.15*Math.sin(t*9+seed));
    pts.push(new THREE.Vector2(Math.max(rad,0.02), dep*t));
  }
  return dripNoise(new THREE.LatheGeometry(pts,9),seed,0.22);
}
/* an old silk skirt wrapped around a stalagmite's base — flared at the
   floor, cinched where the wrapping gave out */
function webWrapGeo(r,hgt){
  const N=5, seed=Math.random()*10, pts=[];
  for(let i=0;i<N;i++){
    const t=i/(N-1);
    pts.push(new THREE.Vector2(r*(1.25-0.55*t)*(1+0.1*Math.sin(t*7+seed)), hgt*t));
  }
  return dripNoise(new THREE.LatheGeometry(pts,8),seed,0.05);
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
  constructor(){this.pos=[];this.nor=[];this.uv=[];this.idx=[];this.vc=0;}
  quad(p1,p2,p3,p4,n,uvs){
    for(const p of[p1,p2,p3,p4]) this.pos.push(p[0],p[1],p[2]);
    for(let i=0;i<4;i++) this.nor.push(n[0],n[1],n[2]);
    for(const u of uvs) this.uv.push(u[0],u[1]);
    this.idx.push(this.vc,this.vc+1,this.vc+2, this.vc,this.vc+2,this.vc+3);
    this.vc+=4;
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
function makeCorpse(){
  const g=new THREE.Group();
  const torso=new THREE.Mesh(new THREE.BoxGeometry(0.46,0.2,0.78),clothMat);
  torso.position.set(0,0.11,0); torso.rotation.y=0.12; g.add(torso);
  const hips=new THREE.Mesh(new THREE.BoxGeometry(0.4,0.17,0.4),clothMat);
  hips.position.set(-0.02,0.095,0.52); g.add(hips);
  for(const sx of[-0.11,0.13]){
    const leg=new THREE.Mesh(new THREE.BoxGeometry(0.15,0.13,0.82),clothMat);
    leg.position.set(sx,0.075,1.05); leg.rotation.y=(Math.random()-0.5)*0.3; g.add(leg);
  }
  const armL=new THREE.Mesh(new THREE.BoxGeometry(0.12,0.11,0.62),clothMat);
  armL.position.set(-0.34,0.07,-0.18); armL.rotation.y=0.5; g.add(armL);
  const armR=new THREE.Mesh(new THREE.BoxGeometry(0.12,0.11,0.5),clothMat);
  armR.position.set(0.32,0.07,-0.05); armR.rotation.y=-0.9; g.add(armR);
  const skull=new THREE.Mesh(new THREE.SphereGeometry(0.115,10,8),boneMat);
  skull.scale.set(0.86,0.9,1.1); skull.position.set(0.02,0.1,-0.5); g.add(skull);
  /* a scatter of what the dark left */
  for(let i=0;i<4;i++){
    const b=new THREE.Mesh(new THREE.BoxGeometry(0.05,0.04,rand(0.14,0.3)),boneMat);
    b.position.set(rand(-0.6,0.6),0.02,rand(-0.8,1.3)); b.rotation.y=Math.random()*Math.PI;
    g.add(b);
  }
  return g;
}
/* an egg clutch: a silk mound crowned with blue-glowing eggs */
function makeClutch(){
  const g=new THREE.Group();
  const mound=new THREE.Mesh(new THREE.SphereGeometry(1.3,10,8),cocoonMat);
  mound.scale.set(1.15,0.42,1.15); mound.position.y=0.1; g.add(mound);
  const mats=[];
  const n=11+Math.floor(Math.random()*5);
  for(let i=0;i<n;i++){
    const a=Math.random()*Math.PI*2, rr=Math.random()*0.95;
    const r=rand(0.17,0.33);
    const m=eggMat(); mats.push(m);
    const egg=new THREE.Mesh(new THREE.SphereGeometry(r,9,8),m);
    egg.scale.y=1.25;
    egg.position.set(Math.cos(a)*rr, 0.42+r*0.9-rr*0.22, Math.sin(a)*rr);
    g.add(egg);
  }
  /* silk guys staking it down */
  for(let i=0;i<5;i++){
    const a=i/5*Math.PI*2+rand(-0.2,0.2);
    const guy=new THREE.Mesh(new THREE.CylinderGeometry(0.012,0.012,1.5,4),cocoonMat);
    guy.position.set(Math.cos(a)*1.35,0.5,Math.sin(a)*1.35);
    guy.rotation.z=Math.cos(a)*0.85; guy.rotation.x=-Math.sin(a)*0.85;
    g.add(guy);
  }
  /* nest-glow: an additive pool of egg-light on the ground under it */
  const haloMat=new THREE.MeshBasicMaterial({map:HALO_TEX, color:0x3f93ac,
    transparent:true, opacity:0.2, blending:THREE.AdditiveBlending, depthWrite:false});
  const halo=new THREE.Mesh(new THREE.PlaneGeometry(4.8,4.8),haloMat);
  halo.rotation.x=-Math.PI/2; halo.position.y=0.07;
  g.add(halo);
  g.userData.haloMat=haloMat;
  g.userData.eggMats=mats;
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
      /* the floor: 3×3 faceted sub-quads riding floorYAt (fine enough that
         the mesh and the exact ground function never visibly disagree) */
      const S=3;
      for(let j=0;j<S;j++)for(let i=0;i<S;i++){
        const x0=p.x-E+i*CELL/S, x1=x0+CELL/S;
        const z0=p.z-E+j*CELL/S, z1=z0+CELL/S;
        const q=(xx,zz)=>[xx,floorYAt(xx,zz),zz];
        const uv=(xx,zz)=>[xx/UVm,zz/UVm];
        fAcc.tri(q(x0,z1),q(x1,z1),q(x1,z0),[uv(x0,z1),uv(x1,z1),uv(x1,z0)]);
        fAcc.tri(q(x0,z1),q(x1,z0),q(x0,z0),[uv(x0,z1),uv(x1,z0),uv(x0,z0)]);
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
      const COLS=4;
      const pts=[];
      let span=0;
      for(let i=0;i<=COLS;i++){
        const tt=i/COLS*2-1;
        const px=p.x+dx*E+rx*E*tt, pz=p.z+dy*E+rz*E*tt;
        const yb=floorYAt(px,pz), yt=ceilYAt(px,pz);
        span=Math.max(span,yt-yb);
        pts.push({px,pz,yb,yt});
      }
      const ROWS=Math.max(3,Math.ceil(span/1.1));
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
  /* ---- the stream's water ---- */
  {
    const wq=new QuadAcc();
    for(let y=0;y<CH;y++)for(let x=0;x<CW;x++){
      if(grid3[y][x]!==3) continue;
      const p=cellToWorld3(x,y);
      wq.quad([p.x-E,-0.06,p.z+E],[p.x+E,-0.06,p.z+E],[p.x+E,-0.06,p.z-E],[p.x-E,-0.06,p.z-E],
        [0,1,0],[[0,1],[1,1],[1,0],[0,0]]);
    }
    /* the skin drifts: caustic streaks on a map whose offset updateCave
       slides every frame — the stream visibly moves */
    const waterMat=new THREE.MeshPhongMaterial({map:texWater, color:0x4e666e,
      specular:0x4a6a76, shininess:110, transparent:true, opacity:0.82,
      emissive:0x040f14});
    CAVE.waterMat=waterMat;
    const water=wq.mesh(waterMat);
    water.userData.animated=true;                        // its matrix never moves, but keep it out of habit
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
    /* drapery curtains where a wall meets a high vault — hung from the
       real ceiling edge at that face (ceilYAt at the anchor), shifted with
       the wall's own relief so the root stays against the rock */
    if(code===0&&srand()<0.10){
      for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){
        if(codeAt(x+dx,y+dy)!==1) continue;
        const ax=p.x+dx*(E-0.30), az=p.z+dy*(E-0.30);
        const eV=ceilYAt(ax,az);
        const hgt=rand(1.0,Math.min(2.8,eV*0.5));
        const ct=new THREE.Mesh(curtainGeo(rand(1.1,2.6),hgt));
        const F=wallField(ax,eV-hgt*0.3,az);
        ct.position.set(ax+F.x*0.7, eV+0.22-hgt/2, az+F.z*0.7);
        ct.rotation.y = dx? (dx>0?-Math.PI/2:Math.PI/2) : (dy>0?Math.PI:0);
        curtains.push(ct);
        break;
      }
    }
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
        const hgt=rand(1.2,Math.max(1.3,eV*0.62)), wdt=rand(2.0,3.1);
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
        const wdt=rand(1.1,2.4), dep=rand(1.0,2.2), sag=Math.min(wdt,dep)*rand(0.16,0.3);
        const hx=p.x+rand(-0.9,0.9), hz=p.z+rand(-0.9,0.9);
        const yaw=Math.random()*Math.PI, hy=ceilYAt(hx,hz)-rand(0.35,1.1);
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
       hammocks and long streamer tails. The brood vaults are 12m domes
       now, so the layers hang DEEP — sheets down to two-thirds height on
       long guys, tails reaching for the clutch — a hanging city of silk. */
    for(const b of broods){
      const bp=cellToWorld3(b.cx,b.cy);
      for(let i=0;i<8;i++){
        const hx=bp.x+rand(-6,6), hz=bp.z+rand(-6,6);
        const c=worldToCell3(hx,hz), cc=codeAt(c.cx,c.cy);
        if(cc===1||cc===5||cc===7) continue;
        const lv=ceilYAt(hx,hz);
        const wdt=rand(1.6,3.4), dep=rand(1.4,3.0), sag=Math.min(wdt,dep)*rand(0.2,0.34);
        const yaw=Math.random()*Math.PI, hy=lv-rand(0.3,lv*0.4);
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
        const len=rand(1.2,Math.min(5.5,lv*0.55));
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
      const k=Math.round(c.r*c.r*2.1*dens);
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
        if(roll<0.30){                     // a slung sheet under the vault
          const wdt=rand(1.4,3.2), dep=rand(1.2,2.8);
          const w=new THREE.Mesh(webHammockGeo(wdt,dep,Math.min(wdt,dep)*rand(0.18,0.32)));
          w.rotation.order="YXZ"; w.rotation.y=Math.random()*Math.PI;
          w.rotation.x=-Math.PI/2+rand(-0.22,0.22);
          w.position.set(hx,cv-rand(0.25,0.9),hz);
          pickSheet(w);
        } else if(roll<0.55){              // a veil hanging off the stalactite line
          const wdt=rand(0.8,1.9), hgt=rand(0.8,2.0);
          const w=new THREE.Mesh(webSheetGeo(wdt,hgt,rand(0.1,0.25)));
          w.rotation.y=Math.random()*Math.PI;
          w.position.set(hx,cv-0.15-hgt/2,hz);
          pickFan(w);
        } else if(roll<0.80){              // long streamers
          const len=rand(1.2,Math.min(4.5,cv*0.45));
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
    const flush=(arr,mat)=>{ if(arr.length){ scene.add(mergeStatic(arr,mat));
      for(const m of arr) m.geometry.dispose(); } };
    flush(sheets[0],webSheetMats[0]); flush(sheets[1],webSheetMats[1]);
    flush(fans[0],webFanMats[0]);     flush(fans[1],webFanMats[1]);
    flush(tornV,webTornMat);          flush(strands,webStrandMat);
    flush(funnels,webFunnelMat);
  }
  /* cocoon bundles near the nests — almost all of them perfectly still.
     One merged mesh: they share a material and never move. */
  {
    const cocoons=[];
    for(const b of broods){
      const n=2+Math.floor(srand()*2);
      for(let i=0;i<n;i++){
        const p=cellToWorld3(b.cx,b.cy);
        const px=p.x+rand(-5,5), pz=p.z+rand(-5,5);
        if(cellAt3(px,pz)===1||!clearOf(px,pz,0.4)) continue;
        const co=makeCocoon();
        const fy=floorYAt(px,pz);
        if(Math.random()<0.5){ co.position.set(px,fy+rand(0.4,1.8),pz); }
        else { co.position.set(px,fy+0.45,pz); CAVE.obstacles.push({x:px,z:pz,r:0.38}); }
        cocoons.push(co);
      }
    }
    if(cocoons.length){
      scene.add(mergeStatic(cocoons,cocoonMat));
      for(const m of cocoons) m.geometry.dispose();
    }
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
        }
        hh=fy0+0.55;
      } else if(kind==="finger"){
        /* coral clumps: spindles leaning outward, tips alight */
        const clumps=2+(srand()<0.5?1:0);
        for(let c=0;c<clumps;c++){
          const a0=Math.random()*Math.PI*2, rr=c===0?Math.random()*0.3:0.45+Math.random()*0.7;
          const cx2=p.x+Math.cos(a0)*rr, cz2=p.z+Math.sin(a0)*rr;
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
        }
        hh=fy0+0.35;
      }
      /* mycelium cords crawling out of the colony — geometry, not paint:
         thin tapering ribbons that ride the displaced surface they grow
         over (wall cords run DOWN the face and pool at its foot; floor
         cords wander outward through the litter) */
      {
        const nCord=2+Math.floor(srand()*3);
        for(let cI=0;cI<nCord;cI++){
          const pts=[];
          const segs=6+Math.floor(srand()*4);
          if(onWall){
            const uX=(fdy!==0)?1:0, uZ=(fdx!==0)?1:0;    // wall-parallel axis
            let drift=(srand()<0.5?-1:1)*rand(0.10,0.30);
            let u=rand(-0.4,0.4), yy=hh+rand(-0.3,0.2);
            for(let i=0;i<=segs;i++){
              const wx2=ax+uX*u, wz2=az+uZ*u;
              const fyW=floorYAt(wx2,wz2);
              const wy=Math.max(fyW+0.05, yy);
              const F=wallField(wx2,wy,wz2);
              pts.push({x:wx2+F.x-fdx*0.03, y:wy, z:wz2+F.z-fdy*0.03,
                        nx:-fdx, ny:0, nz:-fdy,
                        w:rand(0.05,0.10)*(1-i/segs*0.6)});
              u+=drift*rand(0.6,1.4); drift+=(srand()-0.5)*0.12;
              yy-=rand(0.25,0.6)*(hh-0.2)/segs*2;
            }
          } else {
            let aa=Math.random()*Math.PI*2, rr=0.15;
            for(let i=0;i<=segs;i++){
              const mx=ax+Math.cos(aa)*rr, mz=az+Math.sin(aa)*rr;
              pts.push({x:mx, y:floorYAt(mx,mz)+0.03, z:mz,
                        nx:0, ny:1, nz:0,
                        w:rand(0.05,0.10)*(1-i/segs*0.6)});
              rr+=rand(0.14,0.30); aa+=(srand()-0.5)*0.55;
            }
          }
          parts.push(new THREE.Mesh(cordGeo(pts)));
        }
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
      const stepMat=new THREE.MeshPhongMaterial({map:texCaveRock, color:0xc8d2d8,
        emissive:0x0e161c, specular:0x161c22, shininess:12});
      const stepGeo=new THREE.BoxGeometry(1.25,0.24,1.0);
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
      const stepMat=new THREE.MeshPhongMaterial({map:texCaveRock, color:0xb6c2ca,
        emissive:0x0a1014, specular:0x141a20, shininess:10});
      const stepGeo=new THREE.BoxGeometry(1.3,0.24,1.05);
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
    const cover=new THREE.Mesh(new THREE.BoxGeometry(0.27,0.045,0.35),
      new THREE.MeshPhongMaterial({color:0x4a3826, specular:0x1a140c, shininess:8}));
    cover.position.y=0.022; jr.add(cover);
    const pages=new THREE.Mesh(new THREE.BoxGeometry(0.23,0.03,0.30),
      new THREE.MeshPhongMaterial({color:0xb9ac8e, specular:0x111111, shininess:4}));
    pages.position.y=0.052; pages.rotation.y=0.06; jr.add(pages);
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
    CAVE.obstacles.push({x:b.center.x, z:b.center.z, r:1.5});
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
  toast("Cold air. From above.",4200);
}

/* ---------------- per-frame ---------------- */
export function updateCave(dt){
  const tN=performance.now()/1000;
  /* falling into the dark under the bridge is its own ending */
  if(STATE.y<-9&&!STATE.dead) die();
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
          m.color.setRGB(0.18,0.14,0.11);
        }
      }
      /* the pool of light under it turns fire-orange, then embers down */
      if(hm){
        hm.color.setRGB(1,0.45+0.2*k,0.18+0.4*k);
        const life=clamp(1-b.burnT/80,0.05,1);
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
    if(f.handle) f.handle.set(Math.pow(life,0.7));
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
  /* water: a slow living sheen, and the caustic skin drifts downstream */
  if(CAVE.waterMat){
    CAVE.waterMat.opacity=0.80+0.05*Math.sin(tN*0.7);
    if(CAVE.waterMat.map){
      CAVE.waterMat.map.offset.x=(tN*0.022)%1;
      CAVE.waterMat.map.offset.y=(tN*0.013)%1;
    }
  }
  /* the stream's voice, by distance */
  if(AU.cave&&AU.cave.streamGain&&AU.ctx){
    let best=1e9;
    for(const p of CAVE.streamCells){
      const d=(p.x-STATE.pos.x)*(p.x-STATE.pos.x)+(p.z-STATE.pos.z)*(p.z-STATE.pos.z);
      if(d<best) best=d;
    }
    const d=Math.sqrt(best);
    AU.cave.streamGain.gain.setTargetAtTime(clamp(1-d/26,0,1)*0.16, AU.ctx.currentTime, 0.3);
  }
  /* dripwater percussion — and skitters that sound just like it */
  CAVE.dripT-=dt;
  if(CAVE.dripT<=0){
    CAVE.dripT=rand(1.6,6.5);
    if(AU.cave&&AU.cave.drip) AU.cave.drip();
  }
}
