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
         makeFungusTexture, makeFungusSkin, scaleBoxUV } from "./textures.js";
import { addInteractable } from "./props.js";
import { die } from "./lifecycle.js";
import { renderObjectives, toast } from "./ui.js";
import { AU, sfxRockfall, sfxIgnite, startClutchFire } from "./audio.js";

export const CW=33, CH=33, CAVE_H_MAX=9.5;
export const CAVE_SPAN=CW*CELL;
export let grid3=null;
let ceilH=null;                               // per-cell ceiling height
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
  regionDim:[1,1,1,1],         // per-brood fungus dim targets (burns kill the local glow)
  corpse:null, entrance:null,
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
  if(t===3) return -0.14;
  return 0;
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
/* a winding width-1 corridor biased toward its goal; returns the cells it
   NEWLY opened (so alternate routes can be re-sealed as rubble) */
function carveTunnel(ax,ay,bx,by,wobble=0.42){
  const opened=[];
  let x=ax, y=ay, guard=400;
  while((x!==bx||y!==by)&&guard-->0){
    if(grid3[y][x]===1&&inB(x,y)){ grid3[y][x]=0; opened.push({x,y}); }
    let dx=Math.sign(bx-x), dy=Math.sign(by-y);
    if(srand()<wobble){                        // drift sideways
      if(srand()<0.5&&dx!==0) dy=(srand()<0.5?1:-1);
      else if(dy!==0) dx=(srand()<0.5?1:-1);
    }
    if(dx!==0&&dy!==0){ if(srand()<0.5)dy=0; else dx=0; }
    const nx=clamp(x+dx,1,CW-2), ny=clamp(y+dy,1,CH-2);
    x=nx; y=ny;
    if(srand()<0.14&&inB(x+1,y)&&grid3[y][x+1]===1){ grid3[y][x+1]=0; opened.push({x:x+1,y}); }
  }
  if(inB(x,y)&&grid3[y][x]===1){ grid3[y][x]=0; opened.push({x,y}); }
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
  /* the rooms of the warren */
  const entrance={cx:16,cy:27,r:2.8,h:6.5};
  const central ={cx:16,cy:15,r:4.6,h:9.0};
  const broods=[
    {cx:6, cy:6, r:3.2,h:7.0},
    {cx:26,cy:6, r:3.2,h:7.0},
    {cx:5, cy:20,r:2.8,h:6.5},
    {cx:27,cy:21,r:2.8,h:6.5},
  ];
  CAVE.chambers=[entrance,central,...broods];
  for(const c of CAVE.chambers) carveBlob(c.cx,c.cy,c.r);
  /* main spokes (the matriarch's tending routes — never squeezed) */
  carveTunnel(entrance.cx,entrance.cy,central.cx,central.cy,0.3);
  for(const b of broods) carveTunnel(central.cx,central.cy,b.cx,b.cy,0.42);
  /* the north approach: central → the fissure's doorstep */
  carveTunnel(central.cx,central.cy-3,16,5,0.2);
  /* loops (player shortcuts; these are where the squeezes live) */
  const loops=[
    carveTunnel(broods[0].cx,broods[0].cy,broods[1].cx,broods[1].cy,0.5),
    carveTunnel(broods[2].cx,broods[2].cy,entrance.cx-3,entrance.cy,0.5),
    carveTunnel(broods[3].cx,broods[3].cy,entrance.cx+3,entrance.cy,0.5),
  ];
  for(const cells of loops){
    if(cells.length<5) continue;
    const mid=cells[Math.floor(cells.length/2)];
    grid3[mid.y][mid.x]=2;                       // one tight crawl per loop
    if(srand()<0.5&&cells.length>7){
      const m2=cells[Math.floor(cells.length/2)+1];
      grid3[m2.y][m2.x]=2;
    }
  }
  /* the chasm: a strip across the north exit of the central chamber, with
     one rock bridge carrying the fissure approach over it */
  for(let y=11;y<=12;y++)for(let x=14;x<=18;x++)
    if(inB(x,y)) grid3[y][x]=5;
  grid3[11][16]=6; grid3[12][16]=6;
  /* make sure the approach lines up with the bridge */
  for(const y of[9,10,13]) if(grid3[y][16]===1) grid3[y][16]=0;
  /* the stream: west edge → under the central chamber's south half → east */
  {
    const way=[[1,17],[6,18],[11,17],[16,18],[21,17],[26,18],[31,17]];
    for(let i=0;i<way.length-1;i++){
      let [x,y]=way[i]; const [bx,by]=way[i+1];
      let guard=90;
      while((x!==bx||y!==by)&&guard-->0){
        if(x>0&&y>0&&x<CW-1&&y<CH-1&&grid3[y][x]!==5&&grid3[y][x]!==6) grid3[y][x]=3;
        const dx=Math.sign(bx-x), dy=Math.sign(by-y);
        if(dx!==0&&dy!==0){ if(srand()<0.5)x+=dx; else y+=dy; }
        else { x+=dx; y+=dy; }
        if(srand()<0.20&&y+1<CH-1&&grid3[y+1][x]===1) grid3[y+1][x]=3;
      }
    }
  }
  /* scree: loud gravel aprons along the chamber rims */
  for(const c of CAVE.chambers){
    let n=4+Math.floor(srand()*4);
    for(let t=0;t<30&&n>0;t++){
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
    carveTunnel(broods[0].cx+1,broods[0].cy+2, 11,13, 0.55),
    carveTunnel(broods[1].cx-1,broods[1].cy+2, 21,13, 0.55),
    carveTunnel(broods[2].cx+1,broods[2].cy-2, 12,17, 0.55),
    carveTunnel(broods[3].cx-1,broods[3].cy-2, 22,17, 0.55),
  ];
  for(const w of altWays) CAVE.events.push({openCells:seal(w), pile:null, closed:null});
  /* the fissure pocket: two cells behind a rubble choke at the very north */
  for(const y of[2,3]) grid3[y][16]=0;
  grid3[4][16]=7;
  CAVE.fissurePocket={cx:16,cy:2};
  CAVE.fissureChoke={cx:16,cy:4};
  /* ---- connectivity repair (crouched player, from the spawn) ---- */
  const spawnC={cx:entrance.cx, cy:entrance.cy+1};
  for(let iter=0;iter<80;iter++){
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
  /* ceiling heights */
  ceilH=Array.from({length:CH},()=>Array(CW).fill(2.9));
  for(let y=0;y<CH;y++)for(let x=0;x<CW;x++){
    if(grid3[y][x]===2){ ceilH[y][x]=1.35; continue; }
    ceilH[y][x]=2.8+hash(x*31.7+y*17.3)*0.35;
    for(const c of CAVE.chambers){
      const d=Math.hypot(x-c.cx,y-c.cy);
      if(d<=c.r+0.6) ceilH[y][x]=Math.max(ceilH[y][x], lerp(c.h,c.h*0.72,clamp(d/(c.r+0.6),0,1)));
    }
  }
  /* silk-laced floors around the nests */
  CAVE.silk.clear();
  for(const b of broods)
    for(let y=b.cy-2;y<=b.cy+2;y++)for(let x=b.cx-2;x<=b.cx+2;x++)
      if(inB(x,y)&&Math.hypot(x-b.cx,y-b.cy)<=2.3) CAVE.silk.add(K(x,y));
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
const fungusTexes=[makeFungusTexture(),makeFungusTexture(),makeFungusTexture()];
fungusTexes.forEach(t=>markShared(t));
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
  const openish=t=>t!==1;                        // every non-rock cell gets floor & ceiling
  /* ---- floor & ceiling & the pit ---- */
  const fAcc=new QuadAcc(), cAcc=new QuadAcc(), pAcc=new QuadAcc(), wAcc=new QuadAcc();
  const E=CELL/2, UVm=4;
  /* ---- the vault: corner-shared ceiling heights, so the rock flows ----
     Each grid corner takes the MIN of its adjacent open cells' ceilings
     (chambers slope naturally down into their tunnel mouths, tunnels pinch
     into the squeezes), clamped so a standing head never pokes through
     near a squeeze mouth, plus per-corner jitter so it never planes off.
     Shared corners make the surface continuous — no more panel skirts. */
  const cH=[];
  for(let cy=0;cy<=CH;cy++){
    cH[cy]=[];
    for(let cx=0;cx<=CW;cx++){
      let mn=1e9, mx=0;
      for(const[ox,oy]of[[-1,-1],[0,-1],[-1,0],[0,0]]){
        const x=cx+ox, y=cy+oy;
        if(x<0||y<0||x>=CW||y>=CH||grid3[y][x]===1) continue;
        mn=Math.min(mn,ceilH[y][x]); mx=Math.max(mx,ceilH[y][x]);
      }
      if(mn===1e9){ cH[cy][cx]=0; continue; }
      let h=mn;
      if(mn<1.9&&mx>2.2) h=1.9;                  // squeeze mouths dip INSIDE the squeeze
      h+=(hash(cx*13.37+cy*7.77)-0.5)*0.45;
      cH[cy][cx]=Math.max(h,1.15);
    }
  }
  for(let y=0;y<CH;y++)for(let x=0;x<CW;x++){
    const t=grid3[y][x];
    if(t===1) continue;
    const p=cellToWorld3(x,y);
    const u0=(p.x-E)/UVm, u1=(p.x+E)/UVm, v0=(p.z-E)/UVm, v1=(p.z+E)/UVm;
    if(t===5){
      /* the chasm: a floor far below, walls falling to it */
      pAcc.quad([p.x-E,-14,p.z+E],[p.x+E,-14,p.z+E],[p.x+E,-14,p.z-E],[p.x-E,-14,p.z-E],
        [0,1,0],[[u0,v1],[u1,v1],[u1,v0],[u0,v0]]);
      for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){
        const nt=codeAt(x+dx,y+dy);
        if(nt===5) continue;
        /* a dark wall on the chasm side of the seam, from floor level down */
        const sx=p.x+dx*E, sz=p.z+dy*E;
        const ax=dy!==0? p.x-E : sx, az=dx!==0? p.z-E : sz;
        const bx=dy!==0? p.x+E : sx, bz=dx!==0? p.z+E : sz;
        pAcc.quad([ax,0,az],[bx,0,bz],[bx,-14,bz],[ax,-14,az],
          [-dx,0,-dy],[[0,0],[1,0],[1,3.5],[0,3.5]]);
      }
    } else {
      const fy = t===3? -0.22 : 0;
      fAcc.quad([p.x-E,fy,p.z+E],[p.x+E,fy,p.z+E],[p.x+E,fy,p.z-E],[p.x-E,fy,p.z-E],
        [0,1,0],[[u0,v1],[u1,v1],[u1,v0],[u0,v0]]);
      if(t===6){
        /* low stone lips so the bridge reads as a bridge */
        for(const sx of[-1,1]){
          const lip=p.x+sx*(E-0.16);
          wAcc.quad([lip,0,p.z-E],[lip,0.34,p.z-E],[lip,0.34,p.z+E],[lip,0,p.z+E],
            [-sx,0,0],[[0,0],[0,0.1],[1,0.1],[1,0]]);
        }
      }
    }
    /* the vault over this cell: two faceted triangles on the shared
       corner heights. (The fissure pocket's cell stays open — its bore
       runs up through where a ceiling would be.) */
    if(!(CAVE.fissurePocket&&x===CAVE.fissurePocket.cx&&y===CAVE.fissurePocket.cy)){
      const h00=cH[y][x],   h10=cH[y][x+1],
            h01=cH[y+1][x], h11=cH[y+1][x+1];
      cAcc.tri([p.x-E,h00,p.z-E],[p.x+E,h10,p.z-E],[p.x+E,h11,p.z+E],
        [[u0,v0],[u1,v0],[u1,v1]]);
      cAcc.tri([p.x-E,h00,p.z-E],[p.x+E,h11,p.z+E],[p.x-E,h01,p.z+E],
        [[u0,v0],[u1,v1],[u0,v1]]);
    }
  }
  const floor=fAcc.mesh(floorMat); scene.add(floor);
  const ceil=cAcc.mesh(rockMat); scene.add(ceil);
  const pit=pAcc.mesh(pitMat); scene.add(pit);
  const skirts=wAcc.mesh(rockMat); scene.add(skirts);
  /* ---- rock walls: boxes as tall as the tallest neighbouring ceiling ---- */
  {
    const geoCache=new Map(), boxes=[];
    for(let y=0;y<CH;y++)for(let x=0;x<CW;x++){
      if(grid3[y][x]!==1) continue;
      let hMax=0;
      for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){
        const nx=x+dx, ny=y+dy;
        if(nx<0||ny<0||nx>=CW||ny>=CH) continue;
        if(grid3[ny][nx]!==1) hMax=Math.max(hMax, ceilH[ny][nx]);
      }
      if(hMax<=0) continue;                       // fully enclosed
      const h=Math.ceil((hMax+0.6)*2)/2;
      let geo=geoCache.get(h);
      if(!geo){ geo=scaleBoxUV(new THREE.BoxGeometry(CELL,h,CELL),CELL,h,CELL,UVm); geoCache.set(h,geo); }
      const m=new THREE.Mesh(geo,rockMat);
      const p=cellToWorld3(x,y);
      m.position.set(p.x,h/2,p.z);
      boxes.push(m);
    }
    scene.add(mergeStatic(boxes,rockMat));
    for(const g of geoCache.values()) g.dispose();
  }
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
  /* ---- silk floor sheets around the nests ---- */
  {
    const sq=new QuadAcc();
    for(const k of CAVE.silk){
      const x=k%CW, y=(k/CW)|0;
      if(grid3[y][x]===1||grid3[y][x]===5) continue;
      const p=cellToWorld3(x,y);
      sq.quad([p.x-E,0.02,p.z+E],[p.x+E,0.02,p.z+E],[p.x+E,0.02,p.z-E],[p.x-E,0.02,p.z-E],
        [0,1,0],[[0,1],[1,1],[1,0],[0,0]]);
    }
    scene.add(sq.mesh(silkFloorMat));
  }
  /* ---- dripstone: wet, glossy, grown in matching pairs — merged into a
     single mesh each way (floor spires / ceiling hangers), plus one merged
     sheet of drapery curtains (their own DoubleSide material) ---- */
  const clearOf=(x,z,r)=>CAVE.obstacles.every(o=>Math.hypot(x-o.x,z-o.z)>=o.r+r+0.3)
    && Math.hypot(x-CAVE.spawn.x,z-CAVE.spawn.z)>2.2;
  const stalUp=[], stalDown=[], curtains=[];
  for(const c of CAVE.chambers){
    const n=Math.round(c.r*2.4);
    for(let t=0,placed=0;t<44&&placed<n;t++){
      const a=srand()*Math.PI*2, rr=c.r*Math.sqrt(srand())*0.9;
      const x=Math.round(c.cx+Math.cos(a)*rr), y=Math.round(c.cy+Math.sin(a)*rr);
      if(!inB(x,y)||grid3[y][x]!==0) continue;
      const p=cellToWorld3(x,y);
      const px=p.x+rand(-1.2,1.2), pz=p.z+rand(-1.2,1.2);
      if(!clearOf(px,pz,0.5)) continue;
      const vault=Math.min(cH[y][x],cH[y][x+1],cH[y+1][x],cH[y+1][x+1]);
      /* some pairs have had the ages they needed to meet: a full column,
         girth scaled to the height it had to bridge */
      if(srand()<0.16){
        const col=new THREE.Mesh(columnGeo(vault*rand(0.07,0.11),vault+0.2));
        col.position.set(px,-0.05,pz); col.rotation.y=Math.random()*7;
        stalUp.push(col);
        placed++;
        CAVE.obstacles.push({x:px,z:pz,r:0.55});
        continue;
      }
      const h=rand(0.9,Math.min(2.8,vault*0.5));
      /* a flowstone stack: noisy mound base, drip-ringed spire, a lean child */
      const base=new THREE.Mesh(moundGeo(h*0.36,0.34));
      base.position.set(px,-0.02,pz); base.rotation.y=Math.random()*7;
      stalUp.push(base);
      const spire=new THREE.Mesh(spireGeo(h*rand(0.17,0.24),h));
      spire.position.set(px,0,pz); spire.rotation.y=Math.random()*7;
      stalUp.push(spire);
      if(Math.random()<0.6){
        const h2=h*rand(0.35,0.6);
        const kid=new THREE.Mesh(spireGeo(h2*rand(0.2,0.26),h2,0.16));
        kid.position.set(px+rand(-0.55,0.55),0,pz+rand(-0.55,0.55));
        kid.rotation.y=Math.random()*7;
        stalUp.push(kid);
      }
      placed++;
      CAVE.obstacles.push({x:px,z:pz,r:0.45});
      /* its answer overhead — often directly above (they grow toward each other) */
      if(Math.random()<0.75){
        const above=Math.random()<0.5;
        const sx2=above? px+rand(-0.3,0.3) : px+rand(-1.6,1.6);
        const sz2=above? pz+rand(-0.3,0.3) : pz+rand(-1.6,1.6);
        const hh=rand(0.7,Math.min(2.4,vault*0.45));
        const st=new THREE.Mesh(spireGeo(hh*rand(0.14,0.2),hh,0.06));
        st.position.set(sx2, vault+0.18, sz2);
        st.rotation.x=Math.PI; st.rotation.y=Math.random()*7;
        stalDown.push(st);
      }
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
    if((code===0||code===3)&&srand()<0.14&&vault>=2.2){
      const cx0=p.x+rand(-1.3,1.3), cz0=p.z+rand(-1.3,1.3);
      const n=2+Math.floor(srand()*4);
      for(let i=0;i<n;i++){
        const hh=rand(0.25,0.85);
        const st=new THREE.Mesh(new THREE.ConeGeometry(rand(0.03,0.07),hh,5));
        st.position.set(cx0+rand(-0.5,0.5), vault-hh/2+0.12, cz0+rand(-0.5,0.5));
        st.rotation.x=Math.PI; st.rotation.z=(Math.random()-0.5)*0.06;
        stalDown.push(st);
      }
      /* a patient seep gets an answering nub on the floor below */
      if(code===0&&Math.random()<0.4&&clearOf(cx0,cz0,0.2)){
        const nub=new THREE.Mesh(spireGeo(rand(0.06,0.11),rand(0.12,0.3),0.05));
        nub.position.set(cx0,0,cz0);
        stalUp.push(nub);
      }
    }
    /* drapery curtains where a wall meets a high vault — hung from the
       ceiling line at THAT wall face (its two edge corners), not the
       cell's lowest corner, so no bare wall shows above the root */
    if(code===0&&vault>=2.7&&srand()<0.06){
      for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){
        if(codeAt(x+dx,y+dy)!==1) continue;
        const eV = dx>0? Math.min(cH[y][x+1],cH[y+1][x+1])
                 : dx<0? Math.min(cH[y][x],cH[y+1][x])
                 : dy>0? Math.min(cH[y+1][x],cH[y+1][x+1])
                 :       Math.min(cH[y][x],cH[y][x+1]);
        const hgt=rand(0.8,Math.min(2.0,eV*0.55));
        const ct=new THREE.Mesh(curtainGeo(rand(1.1,2.4),hgt));
        ct.position.set(p.x+dx*(E-0.30), eV+0.22-hgt/2, p.z+dy*(E-0.30));
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
          const m=new THREE.Mesh(moundGeo(rand(0.28,0.5)*(1-f*0.4),rand(0.4,0.6)));
          m.position.set(bx+sdx*(f*1.5+rand(-0.2,0.2)), 0.02-f*0.16, bz+sdy*(f*1.5+rand(-0.2,0.2)));
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
        st.position.set(sx,0,sz);
        st.rotation.y=Math.random()*7; st.rotation.z=(Math.random()-0.5)*0.2;
        stalUp.push(st);
        if(h>0.5) CAVE.obstacles.push({x:sx,z:sz,r:0.35});
        if(Math.random()<0.5){         // its top half, lying where it fell
          const frag=new THREE.Mesh(spireGeo(rand(0.09,0.15),rand(0.4,0.9),0.02));
          const fa=Math.random()*7;
          frag.position.set(sx+Math.cos(fa)*rand(0.5,1.1), 0.10, sz+Math.sin(fa)*rand(0.5,1.1));
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
    const faceV=(x,y,dx,dy)=> dx>0? Math.min(cH[y][x+1],cH[y+1][x+1])
             : dx<0? Math.min(cH[y][x],cH[y+1][x])
             : dy>0? Math.min(cH[y+1][x],cH[y+1][x+1])
             :       Math.min(cH[y][x],cH[y][x+1]);
    const faceYaw=(dx,dy)=> dx? (dx>0?-Math.PI/2:Math.PI/2) : (dy>0?Math.PI:0);
    for(let y=1;y<CH-1;y++)for(let x=1;x<CW-1;x++){
      const code=grid3[y][x];
      if(code===1||code===5||code===7) continue;
      const p=cellToWorld3(x,y);
      const vault=Math.min(cH[y][x],cH[y][x+1],cH[y+1][x],cH[y+1][x+1]);
      const density=clamp(1-broodDist(x,y)/16,0.12,1);
      const sq=code===2;                       // squeeze interiors: light silk only
      /* corner sheets: strung across the chord where two wall faces meet,
         pinned at both walls, bellying out into the room */
      for(const[dx,dy]of[[1,1],[1,-1],[-1,1],[-1,-1]]){
        if(!solid(codeAt(x+dx,y))||!solid(codeAt(x,y+dy))) continue;
        if(Math.random()>density*(sq?0.5:0.85)) continue;
        const cV=cH[y+(dy>0?1:0)][x+(dx>0?1:0)];
        const cx0=p.x+dx*(E-0.05), cz0=p.z+dy*(E-0.05);
        const n=1+(Math.random()<density*0.5?1:0);
        for(let i=0;i<n;i++){
          const d=rand(0.5,1.3);
          const hgt=rand(0.35,0.8);
          const hh=i===0? cV-rand(0.1,0.5) : rand(0.7,1.5);
          const w=new THREE.Mesh(webSheetGeo(d*1.41,hgt,d*rand(0.12,0.28)));
          w.position.set(cx0-dx*d/2, Math.min(hh,cV-0.15)-hgt/2, cz0-dy*d/2);
          w.rotation.y=Math.atan2(-dx,-dy);
          (i===0?pickFan:pickSheet)(w);
        }
      }
      for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){
        if(!solid(codeAt(x+dx,y+dy))) continue;
        const jx=p.x+dx*(E-0.04)+(dx?0:rand(-1.2,1.2));
        const jz=p.z+dy*(E-0.04)+(dy?0:rand(-1.2,1.2));
        /* junction fans: top edge pinned along the wall-ceiling line,
           the panel sagging down and out into the room */
        if(!sq&&Math.random()<density*0.65){
          const eV=faceV(x,y,dx,dy);
          const wdt=rand(0.8,2.0), hgt=rand(0.45,0.95), tilt=rand(0.5,1.0);
          const w=new THREE.Mesh(webSheetGeo(wdt,hgt,rand(0.08,0.18)));
          w.rotation.order="YXZ"; w.rotation.y=faceYaw(dx,dy); w.rotation.x=-tilt;
          w.position.set(jx-dx*Math.sin(tilt)*hgt/2, eV-0.03-Math.cos(tilt)*hgt/2,
                         jz-dy*Math.sin(tilt)*hgt/2);
          pickFan(w);
        }
        /* floor skirts: rooted low on the wall, radiating onto the floor */
        if(!sq&&code!==3&&Math.random()<density*0.35){
          const h0=rand(0.25,0.6), tilt=rand(0.75,1.15);
          const hgt=Math.min(1.2,h0/Math.cos(tilt)), wdt=rand(0.6,1.4);
          const w=new THREE.Mesh(webSheetGeo(wdt,hgt,rand(0.05,0.12)));
          w.rotation.order="YXZ"; w.rotation.y=faceYaw(dx,dy); w.rotation.x=-tilt;
          w.position.set(jx-dx*Math.sin(tilt)*hgt/2, h0-Math.cos(tilt)*hgt/2,
                         jz-dy*Math.sin(tilt)*hgt/2);
          pickFan(w);
        }
        /* funnel retreats diving into the wall-floor junction */
        if(!sq&&code!==3&&funnels.length<90&&Math.random()<density*0.3){
          const r=rand(0.25,0.5), dep=rand(0.28,0.55);
          const f=new THREE.Mesh(funnelWebGeo(r,dep));
          f.position.set(p.x+dx*(E-0.15-r*0.5)+(dx?0:rand(-1.2,1.2)), 0.02,
                         p.z+dy*(E-0.15-r*0.5)+(dy?0:rand(-1.2,1.2)));
          f.rotation.x=dy*0.3; f.rotation.z=-dx*0.3;      // throat leans into the wall
          funnels.push(f);
        }
      }
      /* torn veils choking the squeeze mouths — the brood's doors.
         (Separate scan: the loop above only visits SOLID neighbors.) */
      if(!sq) for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){
        if(codeAt(x+dx,y+dy)!==2||Math.random()>0.55) continue;
        const eV=faceV(x,y,dx,dy);
        const hgt=rand(0.55,Math.max(0.6,eV*0.62)), wdt=rand(2.0,3.1);
        const w=new THREE.Mesh(webSheetGeo(wdt,hgt,rand(0.15,0.3)));
        w.position.set(p.x+dx*(E-0.10), eV-0.02-hgt/2, p.z+dy*(E-0.10));
        w.rotation.y=faceYaw(dx,dy);
        tornV.push(w);
        const ax_=dx?0:1, az_=dx?1:0;                     // wall-parallel axis
        for(let i=2+Math.floor(Math.random()*3);i--;)
          strands.push(strandMesh(
            p.x+dx*(E-0.1)-ax_*rand(1.0,1.7), rand(0.25,1.1), p.z+dy*(E-0.1)-az_*rand(1.0,1.7),
            p.x+dx*(E-0.1)+ax_*rand(1.0,1.7), rand(0.25,1.1), p.z+dy*(E-0.1)+az_*rand(1.0,1.7),
            rand(0.03,0.06)));
      }
      /* hammocks slung under the vault on real guy-lines */
      if(!sq&&density>0.35&&Math.random()<(density-0.2)*0.8){
        const wdt=rand(1.1,2.4), dep=rand(1.0,2.2), sag=Math.min(wdt,dep)*rand(0.16,0.3);
        const yaw=Math.random()*Math.PI, hy=vault-rand(0.35,0.95);
        const hx=p.x+rand(-0.9,0.9), hz=p.z+rand(-0.9,0.9);
        const w=new THREE.Mesh(webHammockGeo(wdt,dep,sag));
        w.rotation.order="YXZ"; w.rotation.y=yaw; w.rotation.x=-Math.PI/2;
        w.position.set(hx,hy,hz);
        pickSheet(w);
        const cs=Math.cos(yaw), sn=Math.sin(yaw);
        for(const[lx,ly]of[[wdt/2,dep/2],[wdt/2,-dep/2],[-wdt/2,dep/2],[-wdt/2,-dep/2]])
          strands.push(strandMesh(hx+lx*cs-ly*sn, hy, hz-lx*sn-ly*cs,
            hx+lx*cs-ly*sn+rand(-0.4,0.4), vault+0.05, hz-lx*sn-ly*cs+rand(-0.4,0.4),
            rand(0.03,0.06)));
        if(Math.random()<0.4)
          strands.push(strandMesh(hx,hy-sag,hz, hx+rand(-0.2,0.2), hy-sag-rand(0.4,1.1),
            hz+rand(-0.2,0.2), 0.04));
      }
      /* streamers hanging from the vault — thickest in the low tunnels */
      {
        const pr= sq? 0.4 : density*(vault<3.4?0.75:0.45);
        let n=(Math.random()<pr?1:0)+(Math.random()<pr*0.5?1:0)+(Math.random()<pr*0.25?1:0);
        while(n--){
          const len=rand(0.5,Math.min(2.2,vault*0.55)), wdt=rand(0.12,0.35);
          const w=new THREE.Mesh(webStreamerGeo(wdt,len));
          w.position.set(p.x+rand(-0.9,0.9), vault+0.1-len/2, p.z+rand(-0.9,0.9));
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
      const w=new THREE.Mesh(webWrapGeo(o.r+0.16,hgt));
      w.position.set(o.x,0.02,o.z); w.rotation.y=Math.random()*7;
      pickSheet(w);
      for(let i=2+Math.floor(Math.random()*2);i--;){
        const a=Math.random()*Math.PI*2;
        strands.push(strandMesh(o.x+Math.cos(a)*o.r*0.7, hgt*rand(0.7,1.0), o.z+Math.sin(a)*o.r*0.7,
          o.x+Math.cos(a)*(o.r+rand(0.7,1.3)), 0.02, o.z+Math.sin(a)*(o.r+rand(0.7,1.3)),
          rand(0.03,0.05)));
      }
    }
    /* the canopy: directly over every brood, generations of layered
       hammocks and long streamer tails — the nest has a ceiling of silk */
    const vaultAt=(cx,cy)=>Math.min(cH[cy][cx],cH[cy][cx+1],cH[cy+1][cx],cH[cy+1][cx+1]);
    for(const b of broods){
      const bp=cellToWorld3(b.cx,b.cy);
      for(let i=0;i<6;i++){
        const hx=bp.x+rand(-4.5,4.5), hz=bp.z+rand(-4.5,4.5);
        const c=worldToCell3(hx,hz), cc=codeAt(c.cx,c.cy);
        if(cc===1||cc===5||cc===7) continue;
        const lv=vaultAt(c.cx,c.cy);
        const wdt=rand(1.6,3.2), dep=rand(1.4,2.8), sag=Math.min(wdt,dep)*rand(0.2,0.34);
        const yaw=Math.random()*Math.PI, hy=lv-rand(0.25,1.4);
        const w=new THREE.Mesh(webHammockGeo(wdt,dep,sag));
        w.rotation.order="YXZ"; w.rotation.y=yaw; w.rotation.x=-Math.PI/2;
        w.position.set(hx,hy,hz);
        pickSheet(w);
        const cs=Math.cos(yaw), sn=Math.sin(yaw);
        for(const[lx,ly]of[[wdt/2,dep/2],[wdt/2,-dep/2],[-wdt/2,dep/2],[-wdt/2,-dep/2]])
          strands.push(strandMesh(hx+lx*cs-ly*sn, hy, hz-lx*sn-ly*cs,
            hx+lx*cs-ly*sn+rand(-0.5,0.5), lv+0.05, hz-lx*sn-ly*cs+rand(-0.5,0.5),
            rand(0.03,0.06)));
      }
      for(let i=0;i<9;i++){
        const hx=bp.x+rand(-4,4), hz=bp.z+rand(-4,4);
        const c=worldToCell3(hx,hz), cc=codeAt(c.cx,c.cy);
        if(cc===1||cc===5||cc===7) continue;
        const lv=vaultAt(c.cx,c.cy);
        const len=rand(0.9,Math.min(3.0,lv*0.6));
        const w=new THREE.Mesh(webStreamerGeo(rand(0.15,0.4),len));
        w.position.set(hx, lv+0.1-len/2, hz);
        w.rotation.y=Math.random()*Math.PI;
        pickSheet(w);
      }
    }
    /* the way back up, silked shut: a torn lid over the stair mouth,
       drapes down its collar, anchor lines radiating into the cave */
    {
      const sx=CAVE.spawn.x, sz=CAVE.spawn.z+2.6, sh=ceilH[spawnC.cy][spawnC.cx];
      const lid=new THREE.Mesh(webHammockGeo(3.0,3.0,0.5));
      lid.rotation.order="YXZ"; lid.rotation.y=Math.random()*Math.PI; lid.rotation.x=-Math.PI/2;
      lid.position.set(sx,sh-0.35,sz);
      tornV.push(lid);
      for(let i=0;i<5;i++){
        const a=i/5*Math.PI*2+rand(-0.3,0.3), len=rand(1.1,2.0);
        const w=new THREE.Mesh(webSheetGeo(rand(0.9,1.5),len,rand(0.2,0.4)));
        w.position.set(sx+Math.cos(a)*1.5, sh-0.3-len/2, sz+Math.sin(a)*1.5);
        w.rotation.y=-a+Math.PI/2;
        pickSheet(w);
      }
      for(let i=0;i<8;i++){
        const a=Math.random()*Math.PI*2;
        strands.push(strandMesh(sx+Math.cos(a)*0.9, sh-rand(0.1,0.5), sz+Math.sin(a)*0.9,
          sx+Math.cos(a)*rand(2.5,4.0), rand(0.4,sh*0.7), sz+Math.sin(a)*rand(2.5,4.0),
          rand(0.03,0.07)));
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
        if(Math.random()<0.5){ co.position.set(px,rand(0.4,1.6),pz); }
        else { co.position.set(px,0.45,pz); CAVE.obstacles.push({x:px,z:pz,r:0.38}); }
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
        emissive:0x081418, emissiveMap:FSKIN.emit, specular:0x2a4a50, shininess:30});
      const parts=[];
      let ax=p.x, az=p.z, hh=0.55, fdx=0, fdy=0, faceRot=0, onWall=false;
      if(kind==="conk"){
        const [dx,dy]=faces[Math.floor(srand()*faces.length)];
        fdx=dx; fdy=dy; onWall=true;
        hh=rand(0.6,Math.min(2.6,ceilH[y][x]-0.6));
        const bx=p.x+dx*(E-0.10), bz=p.z+dy*(E-0.10);
        faceRot = dx? (dx>0?-Math.PI/2:Math.PI/2) : (dy>0?Math.PI:0);
        ax=bx; az=bz;
        /* 1-2 shelf runs climbing the rock face, conks shrinking as they go */
        const runs=1+(srand()<0.6?1:0);
        for(let rI=0;rI<runs;rI++){
          const off=(srand()-0.5)*1.7;                    // slide along the wall
          const cx2=bx+(dy!==0?off:0), cz2=bz+(dx!==0?off:0);
          let yy=Math.max(0.35,hh-rand(0.3,0.8));
          const n=3+Math.floor(srand()*3);
          for(let i=0;i<n;i++){
            if(yy>ceilH[y][x]-0.35) break;
            const rc=rand(0.16,0.3)*(1-0.4*i/n);
            const m=new THREE.Mesh(conkGeo(rc));
            /* half-buried in the face: only the shelf protrudes */
            m.position.set(cx2+dx*rand(0.02,0.16)+(dy!==0?rand(-0.12,0.12):0),
                           yy,
                           cz2+dy*rand(0.02,0.16)+(dx!==0?rand(-0.12,0.12):0));
            m.rotation.set(rand(-0.14,0.14),Math.random()*Math.PI*2,rand(-0.14,0.14));
            m.scale.y=rand(0.6,0.85);
            parts.push(m);
            yy+=rc*rand(0.9,1.6)+0.08;
          }
        }
        /* juveniles sprouting from the floor at the wall's foot */
        const nb=1+Math.floor(srand()*3);
        for(let i=0;i<nb;i++){
          const rc=rand(0.05,0.1);
          const m=new THREE.Mesh(toadstoolGeo(rc,rc*0.32,rand(0.05,0.14),rc*rand(0.6,1)));
          m.position.set(bx-dx*rand(0.25,0.7)+(dy!==0?rand(-0.5,0.5):0), 0,
                         bz-dy*rand(0.25,0.7)+(dx!==0?rand(-0.5,0.5):0));
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
          m.position.set(p.x+Math.cos(a)*rr,0,p.z+Math.sin(a)*rr);
          m.rotation.set(rand(-0.09,0.09),Math.random()*Math.PI*2,rand(-0.09,0.09));
          parts.push(m);
        }
      } else if(kind==="finger"){
        /* coral clumps: spindles leaning outward, tips alight */
        const clumps=2+(srand()<0.5?1:0);
        for(let c=0;c<clumps;c++){
          const a0=Math.random()*Math.PI*2, rr=c===0?Math.random()*0.3:0.45+Math.random()*0.7;
          const cx2=p.x+Math.cos(a0)*rr, cz2=p.z+Math.sin(a0)*rr;
          const n=5+Math.floor(Math.random()*5);
          for(let i=0;i<n;i++){
            const m=new THREE.Mesh(fingerGeo(rand(0.02,0.045),rand(0.14,0.42)));
            const fa=Math.random()*Math.PI*2, fr=Math.random()*0.16;
            m.position.set(cx2+Math.cos(fa)*fr,0,cz2+Math.sin(fa)*fr);
            m.rotation.set(Math.sin(fa)*rand(0.05,0.35),0,-Math.cos(fa)*rand(0.05,0.35));
            parts.push(m);
          }
        }
        hh=0.4;
      } else {
        /* puffballs half-sunk in the grit */
        const n=5+Math.floor(srand()*5);
        for(let i=0;i<n;i++){
          const r=rand(0.05,0.15);
          const m=new THREE.Mesh(puffGeo(r));
          const a=Math.random()*Math.PI*2, rr=Math.random()*0.85;
          m.position.set(p.x+Math.cos(a)*rr, r*0.72, p.z+Math.sin(a)*rr);
          m.scale.y=0.85; m.rotation.y=Math.random()*Math.PI*2;
          parts.push(m);
        }
        hh=0.35;
      }
      g.add(mergeStatic(parts,glowMat));
      for(const m of parts) m.geometry.dispose();
      /* the halo: additive light pooled on the rock (wall) or floor */
      const haloMat=new THREE.MeshBasicMaterial({map:HALO_TEX, color:haloCol,
        transparent:true, opacity:0.25, blending:THREE.AdditiveBlending, depthWrite:false});
      const halo=new THREE.Mesh(new THREE.PlaneGeometry(rand(1.3,2.1),rand(1.3,2.1)),haloMat);
      /* a vein decal wandering out of the colony — additive, alive */
      const vt=fungusTexes[Math.floor(Math.random()*3)];
      const vm=new THREE.Mesh(new THREE.PlaneGeometry(rand(1.4,2.6),rand(0.7,1.3)),
        new THREE.MeshBasicMaterial({map:vt, transparent:true, depthWrite:false,
          opacity:0.8, blending:THREE.AdditiveBlending}));
      vm.material.color.copy(haloCol).lerp(new THREE.Color(0xffffff),0.35);
      if(onWall){
        halo.position.set(ax+fdx*0.06, hh, az+fdy*0.06);
        halo.rotation.y=faceRot;
        vm.position.set(ax+fdx*0.03, hh, az+fdy*0.03);
        vm.rotation.y=faceRot;
      } else {
        halo.rotation.x=-Math.PI/2;
        halo.position.set(ax,0.05,az);
        vm.rotation.x=-Math.PI/2; vm.rotation.z=Math.random()*Math.PI*2;
        vm.position.set(ax+rand(-0.4,0.4),0.045,az+rand(-0.4,0.4));
      }
      g.add(halo); g.add(vm);
      scene.add(g);
      const rec=makeLightRecord(glowMat,glowMat,x,y,{x:ax,y:0,z:az},
        {warm:false, bright:bright, dimDen:0.5, flickery:Math.random()<0.35, fixY:hh});
      rec.cold=true; rec.buzz=false; rec.mul2=1;
      rec.tint=eTint; rec.poolCol=poolCol;
      rec.veinMat=vm.material;
      rec.haloMat=haloMat;
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
      if(code===3){ pp=0.10; kind="conk"; }                       // wall growth over the water
      else if(nearWater){ pp=0.30; kind=srand()<0.55?"finger":"shroom"; }
      else if(code===4){ pp=0.16; kind="puff"; }                  // scree fields
      else if(inChamber){ pp=0.22; kind=srand()<0.5?"conk":"shroom"; }
      else { pp=0.10; kind=srand()<0.65?"conk":"puff"; }          // tunnels
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
      const p=cellToWorld3(c.x!==undefined?c.x:c.cx, c.y!==undefined?c.y:c.cy);
      const core=new THREE.Mesh(scaleBoxUV(new THREE.BoxGeometry(CELL*0.98,2.5,CELL*0.98),CELL,2.5,CELL,UVm),rockMat);
      core.position.set(p.x,1.25,p.z); g.add(core);
      for(let i=0;i<7;i++){
        const b=new THREE.Mesh(boulderGeo,rockMat);
        const s=rand(0.3,0.85);
        b.scale.set(s,s*rand(0.6,0.9),s*rand(0.7,1.2));
        b.position.set(p.x+rand(-2.1,2.1), s*0.4, p.z+rand(-2.1,2.1));
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
  /* ---- the arrival: a stair out of the ceiling that goes nowhere now ---- */
  {
    const p=CAVE.spawn;
    const sx=p.x, sz=p.z+2.6;
    const h=ceilH[spawnC.cy][spawnC.cx];
    const stepGeo=new THREE.BoxGeometry(1.2,0.22,0.95);
    const stepMat=new THREE.MeshPhongMaterial({map:texCaveRock, color:0xb6c2ca,
      emissive:0x0a1014, specular:0x141a20, shininess:10});
    const steps=[];
    const n=Math.floor(h/0.28);
    for(let i=0;i<n;i++){
      const th=Math.PI/2+i*0.42;
      const m=new THREE.Mesh(stepGeo,stepMat);
      m.position.set(sx+Math.cos(th)*1.35, h-0.2-i*0.28, sz+Math.sin(th)*1.35);
      m.rotation.y=-th;
      steps.push(m);
    }
    scene.add(mergeStatic(steps,stepMat));
    stepGeo.dispose();
    /* (the silk sealing this mouth is built with the web pass above) */
    CAVE.obstacles.push({x:sx, z:sz, r:1.5});
  }
  /* ---- the corpse, the lantern, the journal ---- */
  {
    const c={cx:spawnC.cx-2, cy:spawnC.cy-2};
    let p=cellToWorld3(c.cx,c.cy);
    if(cellAt3(p.x,p.z)===1){ p=cellToWorld3(spawnC.cx-1,spawnC.cy-1); }
    const body=makeCorpse();
    body.position.set(p.x+0.4,0,p.z);
    body.rotation.y=rand(0,Math.PI*2);
    scene.add(body);
    const lant=makeLanternProp();
    lant.position.set(p.x-0.55,0,p.z+0.3);
    lant.rotation.z=1.35;                          // knocked over where it was dropped
    lant.rotation.y=rand(0,7);
    lant.userData.animated=true;
    scene.add(lant);
    CAVE.corpse={body,lant};
    CAVE.obstacles.push({x:body.position.x, z:body.position.z, r:0.5});
    addInteractable({kind:"corpse", mesh:lant,
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
  mark(16,5,2); mark(16,11,1); mark(16,12,1);     // the fissure approach & the bridge
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
    {cx:16,cy:5},
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
  const h=Math.min(ceilH[cy][cx],3.2);
  const core=new THREE.Mesh(scaleBoxUV(new THREE.BoxGeometry(CELL*0.96,h,CELL*0.96),CELL,h,CELL,4),rockMat);
  core.position.set(p.x,h/2,p.z); g.add(core);
  const bg=new THREE.SphereGeometry(1,7,6);
  for(let i=0;i<8;i++){
    const b=new THREE.Mesh(bg,rockMat);
    const s=rand(0.3,0.9);
    b.scale.set(s,s*rand(0.55,0.85),s*rand(0.7,1.2));
    b.position.set(p.x+rand(-2.2,2.2), s*0.38, p.z+rand(-2.2,2.2));
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
