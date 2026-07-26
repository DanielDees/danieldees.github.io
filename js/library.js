/* ---------------- THE END — the infinite library (level ∞) ----------------
   A single vast room rather than a maze: open areas and wide corridors,
   bookshelf runs that converge with one another and connect into the
   perimeter walls, tables the player can crouch under, and the librarian's
   desk at the heart of it with the one terminal that matters.

   Grid cell codes (grid2):
     0 open · 1 wall · 2 shelf run along x · 3 shelf run along z
     4 table (passable only while crouched; opaque to the spider)
     5 desk (solid to everyone, but low — it never blocks sight)

   Collision is type-aware (libCollide): shelves are slabs thinner than
   their cell across the run, tables are a smaller square island, walls and
   the desk fill their cells. The spider treats every nonzero cell as solid
   — it cannot crawl under the tables. */
import { rand, clamp, lerp, srand, hash } from "./utils.js";
import { CELL } from "./map.js";
import { STATE } from "./state.js";
import { scene, camera, renderer, lights, hemi, amb, makeLightRecord, markShared, mergeStatic, freezeStaticScene, tubeTex } from "./scene.js";
import { makeCanvas, texLibWall, texLibCarpet, texLibCarpetBump, texLibCeil, texShelfWood, texDeskWood,
         texCaveRock, texGalv, texBeige, makeKeyboardTexture, makeFloppyTexture,
         makeCrackTexture, makeEndTextTexture, makePosterTexture, makeArtTexture,
         makeWrapTexture, texTape, texCartPaint, texMannequin,
         makeBookCoverTexture, BOOK_TITLES, BOOK_BASES,
         makeArchiveBoxTexture, BOX_LABELS,
         texPages, texPagesAged, makeOpenPagesTexture, scaleBoxUV } from "./textures.js";
import { makeElevator, ELEV, addInteractable } from "./props.js";
import { sfxLightsOut, escalateLibraryAmbience, sfxComputerBoot, sfxComputerStatic } from "./audio.js";

export const LW=25, LH=25, LIB_WALL_H=24.0;      // −30% footprint; tall ceiling gives the spider room to climb
export const ROOM_SPAN=LW*CELL;                  // 100m — reaction times scale off this
export let grid2=null;
export const cellToWorld2=(cx,cy)=>({x:(cx-LW/2+0.5)*CELL, z:(cy-LH/2+0.5)*CELL});
export const worldToCell2=(x,z)=>({cx:Math.floor(x/CELL+LW/2), cy:Math.floor(z/CELL+LH/2)});
const inB=(cx,cy)=>cx>0&&cy>0&&cx<LW-1&&cy<LH-1;
const K=(cx,cy)=>cy*LW+cx;

/* shared level handles: the cutscenes and the spider read these */
export const LIB={
  elev:null, spawn:null, spawnYaw:0,
  deskPos:null, term:null,            // term: {group, screen} — the objective terminal
  reach:null,                         // Set of reachable open-cell keys
  runs:[],                            // shelf segments (visual + browse targets)
  obstacles:[],                       // free-standing circle colliders (chairs, lecterns, ladders)
  pcAnims:[],                         // decor computers mid-boot
  blackActive:false, blackElapsed:0, blackDur:0, nextBlack:35,   // periodic light failures (staggered 2s wave)
  webs:[], webGroup:null,             // the spider's silk: live rappel strands + shrivelled coils left on the ceiling
  hole:null,                          // the dug way down: {x,z,r,group,plug,lights,glow,stair} (see buildHole)
  weeping:false, weepT:0, weepPaint:0,// the terminal's last face, still crying after the cutscene hands you back
};
/* the stacks' shared dimensions: collision, the ladders and the disc sites
   all derive from these so a resize can never strand them again */
export const SHELF_H=1.84, SHELF_D=1.02;         // depth −15% per feedback
/* board centres, bottom → top; a board is 0.055 thick, so its top surface
   sits at BOARD_TOP(lv). The boards themselves, the books/accents standing
   on them AND the disc spawn sites all derive from this one table — these
   used to be three hardcoded copies that had already drifted a few mm. */
const BOARD_Y=[0.10,0.53,0.96,1.39,1.82];
const BOARD_TOP=lv=>BOARD_Y[lv]+0.0275;
const LADDER_H=2.0, LADDER_LEAN=0.28;
/* base setback from a shelf-run cell centre that rests the rails exactly on
   the stack's top edge (minus a hair so they visibly press into the wood) */
const LADDER_B=SHELF_D/2+SHELF_H*Math.tan(LADDER_LEAN)-0.04;

/* ---------------- queries ---------------- */
export const isBlockedSpider=(cx,cy)=> cx<0||cy<0||cx>=LW||cy>=LH||grid2[cy][cx]!==0;
/* sight: walls and shelf runs are tall; tables and the desk are waist-high */
const blocksSight=(cx,cy)=>{
  if(cx<0||cy<0||cx>=LW||cy>=LH) return true;
  const t=grid2[cy][cx]; return t===1||t===2||t===3;
};
export function losCells2(ax,az,bx,bz){
  const steps=Math.ceil(Math.hypot(bx-ax,bz-az)/(CELL*0.4));
  for(let i=1;i<steps;i++){
    const t=i/steps, c=worldToCell2(lerp(ax,bx,t),lerp(az,bz,t));
    if(blocksSight(c.cx,c.cy)) return false;
  }
  return true;
}
export const underTable=(x,z)=>{
  const c=worldToCell2(x,z);
  return c.cx>=0&&c.cy>=0&&c.cx<LW&&c.cy<LH&&grid2[c.cy][c.cx]===4;
};
/* type-aware player collision (crouching slips under the tables) */
export function libCollide(px,pz,r,crouched){
  const c=worldToCell2(px,pz);
  let nx=px, nz=pz;
  for(let gy=c.cy-1;gy<=c.cy+1;gy++)for(let gx=c.cx-1;gx<=c.cx+1;gx++){
    let t = (gx<0||gy<0||gx>=LW||gy>=LH)? 1 : grid2[gy][gx];
    if(t===0) continue;
    if(t===4&&crouched) continue;                  // under the table
    let hx=CELL/2, hz=CELL/2;
    const shr=SHELF_D/2+0.02;                      // shelf slab across the run (+ margin)
    if(t===2) hz=shr; else if(t===3) hx=shr;
    else if(t===4){ hx=1.55; hz=1.55; }            // table island
    else if(t===5) hz=1.0;                         // the desk counter (runs along x)
    const wp=cellToWorld2(gx,gy);
    const minX=wp.x-hx-r, maxX=wp.x+hx+r;
    const minZ=wp.z-hz-r, maxZ=wp.z+hz+r;
    if(nx>minX&&nx<maxX&&nz>minZ&&nz<maxZ){
      const dxl=nx-minX, dxr=maxX-nx, dzl=nz-minZ, dzr=maxZ-nz;
      const m=Math.min(dxl,dxr,dzl,dzr);
      if(m===dxl)nx=minX; else if(m===dxr)nx=maxX;
      else if(m===dzl)nz=minZ; else nz=maxZ;
    }
  }
  /* free-standing furniture: simple radial push-out */
  for(const o of LIB.obstacles){
    const dx=nx-o.x, dz=nz-o.z, d=Math.hypot(dx,dz), min=o.r+r;
    if(d<min){
      if(d>1e-4){ nx=o.x+dx/d*min; nz=o.z+dz/d*min; }
      else nx=o.x+min;                  // dead-centre (teleport) — pick a side
    }
  }
  return {x:nx,z:nz};
}
/* grid code at a world point — the spider's legs read the terrain with it */
export function cellAt(wx,wz){
  const c=worldToCell2(wx,wz);
  return (c.cx<0||c.cy<0||c.cx>=LW||c.cy>=LH)? 1 : grid2[c.cy][c.cx];
}
/* personal space around the tables: the spider refuses to press itself
   against furniture it can't reach under — margin in metres past the slab */
export function pushFromTables(px,pz,margin){
  const c=worldToCell2(px,pz);
  let nx=px, nz=pz;
  for(let gy=c.cy-1;gy<=c.cy+1;gy++)for(let gx=c.cx-1;gx<=c.cx+1;gx++){
    if(gx<0||gy<0||gx>=LW||gy>=LH||grid2[gy][gx]!==4) continue;
    const wp=cellToWorld2(gx,gy), hx=1.55+margin, hz=1.55+margin;
    const minX=wp.x-hx, maxX=wp.x+hx, minZ=wp.z-hz, maxZ=wp.z+hz;
    if(nx>minX&&nx<maxX&&nz>minZ&&nz<maxZ){
      const dxl=nx-minX, dxr=maxX-nx, dzl=nz-minZ, dzr=maxZ-nz;
      const m=Math.min(dxl,dxr,dzl,dzr);
      if(m===dxl)nx=minX; else if(m===dxr)nx=maxX;
      else if(m===dzl)nz=minZ; else nz=maxZ;
    }
  }
  return {x:nx,z:nz};
}
/* ---- the open hole: ground height & shaft containment (player physics) ----
   Once the dig has happened the stair is a real walkable level component.
   The spiral passes every bearing once per turn, so which lap you are on is
   disambiguated by your own height — it never picks a tread overhead. */
export function libGroundY(x,z,curY){
  const h=LIB.hole;
  if(!h||!STATE.holeOpen) return 0;
  const dx=x-h.x, dz=z-h.z, r=Math.hypot(dx,dz);
  if(r>=h.r-0.05) return 0;                       // carpet & the rim lip
  const st=h.stair;
  if(r<st.rc-0.72) return -999;                   // the open throat: nothing but the drop
  const stepA=Math.PI*2/st.steps, stepH=st.rise/st.steps;
  const a=Math.atan2(dz,dx);
  /* the lap whose tread height sits nearest the feet */
  const thTarget=st.a0+Math.PI*2*(-(curY+0.02)/st.rise);
  let k=Math.round((thTarget-a)/(Math.PI*2));
  for(let guard=0;guard<3;guard++){
    const i=Math.floor((a+Math.PI*2*k-st.a0)/stepA);
    if(i<0){ k++; continue; }                     // behind the entry seam: use the lap below
    const y=-0.02-i*stepH;
    if(y>curY+0.75){ k++; continue; }             // that lap is overhead — the next one down
    return i>=st.n? -999 : y;                     // past the last tread the stair is long gone
  }
  return -999;
}
/* below floor level the shaft wall is the only wall there is */
export function shaftClamp(x,z,py,pr){
  const h=LIB.hole;
  if(!h||!STATE.holeOpen||py>-0.05) return null;
  const dx=x-h.x, dz=z-h.z, r=Math.hypot(dx,dz), max=h.r-pr+0.05;
  if(r<=max||r<1e-4) return null;
  return {x:h.x+dx/r*max, z:h.z+dz/r*max};
}
/* spider pathfinding: best-effort BFS — an unreachable target (say, the
   player under a table) routes to the closest cell it CAN stand in, so the
   spider always closes distance instead of standing inert */
export function bfsPath2(sx,sy,tx,ty){
  if(isBlockedSpider(sx,sy)) return null;
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
      if(!isBlockedSpider(nx,ny)&&!prev.has(nk)){prev.set(nk,K(x,y));q.push([nx,ny]);}
    }
  }
  const path=[]; let k=K(best[0],best[1]);
  while(k!==-1){path.push({cx:k%LW,cy:(k/LW)|0}); k=prev.get(k);}
  return path.reverse();
}
export function randomReachCell(){
  const keys=LIB.reachList;
  return keys[Math.floor(Math.random()*keys.length)];
}

/* ---------------- generation ---------------- */
function genLibrary(){
  grid2=Array.from({length:LH},()=>Array(LW).fill(0));
  for(let x=0;x<LW;x++){ grid2[0][x]=1; grid2[LH-1][x]=1; }
  for(let y=0;y<LH;y++){ grid2[y][0]=1; grid2[y][LW-1]=1; }
  const cx0=LW>>1, cy0=LH>>1;
  /* protected zones: the desk clearing and the arrival-elevator apron */
  const prot=new Set();
  for(let y=cy0-3;y<=cy0+3;y++)for(let x=cx0-3;x<=cx0+3;x++) prot.add(K(x,y));
  for(let y=LH-4;y<=LH-2;y++)for(let x=cx0-2;x<=cx0+2;x++) prot.add(K(x,y));
  /* the librarian's desk: a 3-cell counter across the heart of the room */
  for(let x=cx0-1;x<=cx0+1;x++) grid2[cy0][x]=5;
  /* shelf runs: random lengths, some anchored to the perimeter walls,
     free to converge with one another. Carving only marks grid cells —
     the visual/browse segments are derived from the FINAL grid below, so
     collision and graphics can never drift apart. */
  for(let t=0;t<32;t++){             // fewer runs → fewer disc-search spots (faster pace)
    /* the wall-hugging ring (cells 1 / LW-2) stays shelf-free: there is
       always a clear lap around the edge of the room */
    const fromWall=srand()<0.30;
    let ax,ay,axis;                      // start cell + run axis (0=x, 1=z)
    if(fromWall){
      /* "anchored" runs start one clear cell off the perimeter */
      const side=Math.floor(srand()*4);
      if(side===0){ ax=2;            ay=2+Math.floor(srand()*(LH-4)); axis=0; }
      else if(side===1){ ax=LW-3;    ay=2+Math.floor(srand()*(LH-4)); axis=0; }
      else if(side===2){ ax=2+Math.floor(srand()*(LW-4)); ay=2;       axis=1; }
      else            { ax=2+Math.floor(srand()*(LW-4)); ay=LH-3;     axis=1; }
    } else {
      ax=2+Math.floor(srand()*(LW-4)); ay=2+Math.floor(srand()*(LH-4));
      axis=srand()<0.5?0:1;
    }
    const len=2+Math.floor(srand()*5);   // 2–6 cells (runs ~20% shorter)
    const dir=fromWall? (axis===0?(ax===2?1:-1):(ay===2?1:-1)) : (srand()<0.5?1:-1);
    for(let i=0;i<len;i++){
      const x=axis===0? ax+dir*i : ax, y=axis===0? ay : ay+dir*i;
      if(x<2||y<2||x>LW-3||y>LH-3) break;
      if(prot.has(K(x,y))) break;
      const cur=grid2[y][x];
      if(cur===1||cur===4||cur===5) break;
      if(cur===0) grid2[y][x]=axis===0?2:3;
    }
  }
  /* tables: stratified over a coarse zone grid so every quarter of the
     room gets at least a refuge or two — pure uniform rolls clumped them
     and left whole stretches of open floor with nowhere to hide */
  const tables=[];
  const farFromTables=(x,y,min)=>tables.every(t=>Math.hypot(t.x-x,t.y-y)>=min);
  const tryTable=(x0,x1,y0,y1,minD)=>{
    for(let t=0;t<26;t++){
      const x=Math.floor(x0+srand()*(x1-x0)), y=Math.floor(y0+srand()*(y1-y0));
      if(x<2||y<2||x>=LW-2||y>=LH-2) continue;
      if(grid2[y][x]!==0||prot.has(K(x,y))) continue;
      if(!farFromTables(x,y,minD)) continue;
      /* the spider must be able to circle every table: the full ring of
         eight neighbours stays open, so no shelf can pinch the lap below
         a whole cell (≈3m clear — well over 1.3× its body width) */
      let ringOpen=true;
      for(let oy=-1;oy<=1&&ringOpen;oy++)for(let ox=-1;ox<=1;ox++)
        if(grid2[y+oy][x+ox]!==0){ ringOpen=false; break; }
      if(!ringOpen) continue;
      grid2[y][x]=4; tables.push({x,y}); return true;
    }
    return false;
  };
  const ZN=4, zw=(LW-4)/ZN, zh=(LH-4)/ZN;
  for(let zy=0;zy<ZN;zy++)for(let zx=0;zx<ZN;zx++)
    tryTable(2+zx*zw, 2+(zx+1)*zw, 2+zy*zh, 2+(zy+1)*zh, 3);
  for(let i=0;i<7;i++) tryTable(2,LW-2,2,LH-2,4);   // a few free-roaming extras
  /* connectivity repair: flood the open floor from the spawn apron; any
     shelf or table cutting off an open pocket gets a cell knocked out
     ("some shelves may collapse under slight pressure") */
  const spawnC={cx:cx0, cy:LH-3};
  const flood=()=>{
    const seen=new Set([K(spawnC.cx,spawnC.cy)]), q=[[spawnC.cx,spawnC.cy]];
    while(q.length){
      const [x,y]=q.shift();
      for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){
        const nx=x+dx, ny=y+dy;
        if(nx<0||ny<0||nx>=LW||ny>=LH) continue;
        if(grid2[ny][nx]!==0||seen.has(K(nx,ny))) continue;
        seen.add(K(nx,ny)); q.push([nx,ny]);
      }
    }
    return seen;
  };
  for(let iter=0;iter<60;iter++){
    const seen=flood();
    let fixed=false;
    outer:
    for(let y=1;y<LH-1;y++)for(let x=1;x<LW-1;x++){
      if(grid2[y][x]!==0||seen.has(K(x,y))) continue;
      /* unreachable open cell: open a neighbouring blocker that touches
         the reachable region */
      for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){
        const bx=x+dx, by=y+dy, t=grid2[by]&&grid2[by][bx];
        if(t!==2&&t!==3&&t!==4) continue;
        for(const[ex,ey]of[[1,0],[-1,0],[0,1],[0,-1]]){
          if(seen.has(K(bx+ex,by+ey))){
            grid2[by][bx]=0; fixed=true;
            break outer;
          }
        }
      }
    }
    if(!fixed) break;
  }
  /* the repair may have knocked out table cells too — drop their visuals */
  const liveTables=tables.filter(t=>grid2[t.y][t.x]===4);
  /* derive shelf segments from the final grid: every maximal contiguous
     row of type-2 (along x) or type-3 (along z) cells becomes exactly one
     visual unit, so the boards always cover precisely the cells that
     collide — no offsets, no phantom walls */
  LIB.runs=[];
  for(let y=1;y<LH-1;y++){
    let x=1;
    while(x<LW-1){
      if(grid2[y][x]===2){
        const cells=[];
        while(x<LW-1&&grid2[y][x]===2){ cells.push({x,y}); x++; }
        LIB.runs.push({axis:0,cells});
      } else x++;
    }
  }
  for(let x=1;x<LW-1;x++){
    let y=1;
    while(y<LH-1){
      if(grid2[y][x]===3){
        const cells=[];
        while(y<LH-1&&grid2[y][x]===3){ cells.push({x,y}); y++; }
        LIB.runs.push({axis:1,cells});
      } else y++;
    }
  }
  const seen=flood();
  LIB.reach=seen;
  LIB.reachList=[...seen].map(k=>({cx:k%LW, cy:(k/LW)|0}));
  return {cx0,cy0,spawnC,tables:liveTables};
}

/* ---------------- prop builders ---------------- */
/* THE GRAIN HAS A DIRECTION. Both wood canvases are drawn with the grain
   running down the image (v), which is right for an upright — a stile, a
   leg, a shelf end — and wrong for everything that lies along its length.
   Left alone with world-scaled UVs, a 3.6m tabletop wore its grain running
   across the 90mm edge and smeared flat over the face, which is what made
   every board in the building read as painted board rather than timber.
   A rotated CLONE fixes it for nothing: the same image, u and v swapped,
   so horizontal members get grain that runs the way they were cut. */
const grainH=t=>{ const c=t.clone(); c.center.set(0.5,0.5); c.rotation=Math.PI/2; c.needsUpdate=true; return c; };
const texShelfWoodH=grainH(texShelfWood), texDeskWoodH=grainH(texDeskWood);
const shelfMat=new THREE.MeshPhongMaterial({map:texShelfWood, specular:0x16100a, shininess:8});
const deskMat =new THREE.MeshPhongMaterial({map:texDeskWood,  specular:0x1c1408, shininess:12});
const shelfMatH=new THREE.MeshPhongMaterial({map:texShelfWoodH, specular:0x16100a, shininess:8});
const deskMatH =new THREE.MeshPhongMaterial({map:texDeskWoodH,  specular:0x1c1408, shininess:12});
/* every wooden member is a box with world-scaled UVs — one grain density
   across the whole building, whatever the member's size */
const woodBox=(w,h,d,x,y,z,m)=>{
  const b=new THREE.Mesh(scaleBoxUV(new THREE.BoxGeometry(w,h,d),w,h,d,m||0.9));
  b.position.set(x,y,z);
  return b;
};
/* a box that narrows toward its LOW end on `axis` — the vertices past zero
   pulled in by k. A leg that tapers to the floor and a CRT that isn't a
   perfect cuboid are most of the distance between furniture and crates.
   Box vertices are per-face duplicates, so recomputing normals afterwards
   keeps the facets hard instead of rounding the whole thing off. */
function taperBox(w,h,d,k,axis){
  const g=scaleBoxUV(new THREE.BoxGeometry(w,h,d),w,h,d,0.9);
  const p=g.attributes.position, byZ=axis==="z";
  for(let i=0;i<p.count;i++){
    if((byZ? p.getZ(i):p.getY(i))>0) continue;      // the wide end stays put
    p.setX(i,p.getX(i)*k);
    if(byZ) p.setY(i,p.getY(i)*k); else p.setZ(i,p.getZ(i)*k);
  }
  g.computeVertexNormals();
  return g;
}
const darkMetalMat=new THREE.MeshPhongMaterial({color:0x474b50, specular:0x303336, shininess:36});
const beigePlastic=new THREE.MeshPhongMaterial({map:texBeige, specular:0x2a2822, shininess:18});
const beigePlasticDark=new THREE.MeshPhongMaterial({map:texBeige, color:0x6f6a5b,
  specular:0x222018, shininess:14});
/* ---- untouched objects, still in their packaging ----
   This was a BoxGeometry at 0.18 opacity wearing a flat blue-grey, and from
   any angle that is a cube of fog: a solid you can see a little way into,
   with six hard corners and not one fold. Three things had to change, and
   all three matter equally.
   1. A SHEET IS NOT A BOX. `wrapShape` is a closed surface of revolution
      about the bundle's axis with a rounded-rectangle section, standing off
      the object by the slack the film actually has, tucked under at the
      floor and GATHERED into a twist at the top — plus a fold field that
      pushes it out of symmetry. Nothing in it is straight.
   2. The alpha is CREASE-shaped (makeWrapTexture), so what you read is the
      white lines where the sheet has doubled, not a tinted volume.
   3. DoubleSide. Seeing the far wall of the bag THROUGH the near one is
      most of what says "bag" rather than "block" — and with depthWrite off
      the object inside still occludes the film behind it correctly.
   And flatShading, which is worth as much as the other three together:
   crumpled polythene is FACETS meeting at creases, and a smooth-shaded
   shell of the same silhouette is a bell jar. Each panel takes its own
   specular, so the bundle breaks up the moment any light moves. */
const texWrapFilm=makeWrapTexture();
const plasticWrap=new THREE.MeshPhongMaterial({map:texWrapFilm, color:0xdde6ea,
  specular:0xb8c4c8, shininess:88, transparent:true, opacity:0.62,
  depthWrite:false, side:THREE.DoubleSide, flatShading:true});
/* the tape is DULL and nearly grey: at any real saturation two bands round
   a wrapped chair read as brass hoops floating in the air, which is the
   opposite of the thing they are meant to be holding shut */
const wrapTapeMat=new THREE.MeshPhongMaterial({map:texTape, color:0x8c8a80,
  specular:0x3a3830, shininess:18, transparent:true, opacity:0.62,
  depthWrite:false, side:THREE.DoubleSide});
/* the bundle's surface, as a function of (u around, v base→gather). Both the
   film and the tape bands sample this one shape, so a band can never float
   off the sheet it is supposed to be holding shut. */
function wrapShape(w,d,h){
  const n=3.2;                                   // rounded-rectangle section
  const slack=0.035+Math.random()*0.02;          // how far off the object it stands
  const a=w/2+slack, b=d/2+slack;
  /* Fold harmonics. k is an INTEGER on purpose — u wraps, and a fractional
     wavelength puts a hard crease down the seam. The LOW orders carry most
     of the amplitude and that is the whole point: what makes a bundle read
     as crumpled is its SILHOUETTE, and the first pass spent its amplitude
     on k=5 and 7, which is surface ripple you cannot see against the sky.
     k=1 is the big asymmetric lobe — the side the sheet was pulled from. */
  const harm=[];
  for(const[k,a]of[[1,0.150],[2,0.165],[3,0.105],[5,0.045],[7,0.024]])
    harm.push({k, amp:a*(0.65+Math.random()*0.7),
               ph:Math.random()*7, vq:(Math.random()-0.5)*9});
  /* the vq spread above is the other half of it: with a small drift every
     ridge runs the full height of the bag and the thing comes out FLUTED,
     like a column. At this spread a fold wanders most of the way round as
     it rises, which is what a sheet gathered at one end actually does. */
  const vph=Math.random()*7, vph2=Math.random()*7;
  const lean=(Math.random()-0.5)*0.05;           // nothing hangs plumb
  /* envelope: tucked under at the foot, slack and uneven through the body,
     pinched into the twist at the top — but never to a POINT, which is a
     cone. It closes on a stub, and the knot sits on that. */
  const env=v=>{
    const lump=1+0.055*Math.sin(v*Math.PI*2.6+vph)+0.03*Math.sin(v*Math.PI*4.3+vph2);
    if(v<0.10) return (0.62+0.38*(v/0.10))*lump;
    if(v>0.80){ const k=(v-0.80)/0.20; return (1-0.80*(k*k*(3-2*k)))*lump; }
    return lump;
  };
  return (u,v,off)=>{
    const th=u*Math.PI*2;
    const e=env(v), taper=Math.min(1,e*1.6);     // folds die into the gather
    let f=0;
    for(const q of harm) f+=q.amp*Math.sin(th*q.k+q.ph+v*q.vq);
    f=f*taper+0.022*Math.sin(v*Math.PI*5+th*2)*taper;
    const s=(1+f)*e+(off||0);
    const ct=Math.cos(th), st=Math.sin(th);
    const r=Math.pow(Math.pow(Math.abs(ct/a),n)+Math.pow(Math.abs(st/b),n),-1/n);
    return [ct*r*s+lean*h*v, v*h, st*r*s];
  };
}
/* the sheet: a (NU+1)×(NV+1) grid closed with a fan at each pole. It CLOSES
   at both ends for the lathe reason — an open ring on a DoubleSide surface
   is a rim you can see the inside of the bag through end-on. */
function wrapSheetGeo(P,h){
  /* COARSE on purpose: with flatShading the panel count IS the fold count,
     and a 32×20 grid gives facets too small to read as anything but a
     smooth shell */
  const NU=20, NV=14, pos=[], uv=[], idx=[];
  const push=(p,u,v)=>{ pos.push(p[0],p[1],p[2]); uv.push(u,v); };
  for(let j=0;j<=NV;j++)for(let i=0;i<=NU;i++){
    const u=i/NU, v=j/NV;
    push(P(u===1?0:u,v),u,v);
  }
  const R=NU+1;
  for(let j=0;j<NV;j++)for(let i=0;i<NU;i++){
    const A=j*R+i, B=A+1, C=A+R, D=C+1;
    idx.push(A,C,B, B,C,D);
  }
  /* the foot: a fan closing onto the floor, just clear of it */
  const foot=pos.length/3;
  push([0,0.004,0],0.5,0);
  for(let i=0;i<NU;i++) idx.push(foot,i,i+1);
  /* the knot: the gather twisted up into a short stub, leaning off plumb */
  const knot=pos.length/3;
  push([(Math.random()-0.5)*0.05,h+0.055,(Math.random()-0.5)*0.05],0.5,1);
  const last=NV*R;
  for(let i=0;i<NU;i++) idx.push(knot,last+i+1,last+i);
  const g=new THREE.BufferGeometry();
  g.setAttribute("position",new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute("uv",new THREE.Float32BufferAttribute(uv,2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
/* a tape band riding the sheet, standing 6mm proud of it */
function wrapBandGeo(P,v0,v1){
  const NU=20, pos=[], uv=[], idx=[];
  for(let j=0;j<2;j++)for(let i=0;i<=NU;i++){
    const u=i/NU, p=P(u===1?0:u, j?v1:v0, 0.006);
    pos.push(p[0],p[1],p[2]); uv.push(u*5,j);
  }
  const R=NU+1;
  for(let i=0;i<NU;i++){ const A=i,B=A+1,C=A+R,D=C+1; idx.push(A,C,B, B,C,D); }
  const g=new THREE.BufferGeometry();
  g.setAttribute("position",new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute("uv",new THREE.Float32BufferAttribute(uv,2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
/* w×d footprint, h tall — the film clears the object on every side */
function makeWrap(w,d,h){
  const g=new THREE.Group();
  const P=wrapShape(w,d,h);
  g.add(new THREE.Mesh(wrapSheetGeo(P,h),plasticWrap));
  const bands=[];
  for(const v of[0.24+Math.random()*0.1, 0.58+Math.random()*0.1])
    if(Math.random()<0.45) bands.push(new THREE.Mesh(wrapBandGeo(P,v,v+0.022),wrapTapeMat));
  if(bands.length){
    g.add(mergeStatic(bands,wrapTapeMat));
    for(const b of bands) b.geometry.dispose();
  }
  g.rotation.y=Math.random()*Math.PI*2;          // the fold pattern faces anywhere
  return g;
}

/* ---- the books: a pool of distinct, properly 3D volumes ----
   Every design is a real closed book — two cover boards with fore-edge
   overhang, a shallow rounded spine wrapped in its own legible title strip,
   and a recessed page block — merged into one two-material geometry that
   each spawned copy shares. The pool is built once, lazily, on the first
   visit to THE END. */
/* rewrite one BoxGeometry face's UVs to a [u0,v0]-[u1,v1] window
   (face order: +x,−x,+y,−y,+z,−z; default per-face vertex pattern) */
function setFaceUV(geo,f,u0,v0,u1,v1){
  const uv=geo.attributes.uv;
  uv.setXY(f*4  ,u0,v1); uv.setXY(f*4+1,u1,v1);
  uv.setXY(f*4+2,u0,v0); uv.setXY(f*4+3,u1,v0);
}
/* accumulates translated geometries into one indexed BufferGeometry */
class GeoAcc{
  constructor(){this.pos=[];this.nor=[];this.uv=[];this.idx=[];this.vc=0;}
  add(geo){
    const p=geo.attributes.position,n=geo.attributes.normal,u=geo.attributes.uv,ix=geo.index;
    for(let i=0;i<p.count;i++){
      this.pos.push(p.getX(i),p.getY(i),p.getZ(i));
      this.nor.push(n.getX(i),n.getY(i),n.getZ(i));
      this.uv.push(u.getX(i),u.getY(i));
    }
    for(let i=0;i<ix.count;i++) this.idx.push(ix.getX(i)+this.vc);
    this.vc+=p.count; geo.dispose();
  }
  build(){
    const g=new THREE.BufferGeometry();
    g.setAttribute("position",new THREE.Float32BufferAttribute(this.pos,3));
    g.setAttribute("normal",new THREE.Float32BufferAttribute(this.nor,3));
    g.setAttribute("uv",new THREE.Float32BufferAttribute(this.uv,2));
    g.setIndex(this.idx);
    return g;
  }
}
/* concat two accumulators into one geometry with two material groups */
function mergeGroups(a,b){
  const g=new THREE.BufferGeometry();
  g.setAttribute("position",new THREE.Float32BufferAttribute([...a.pos,...b.pos],3));
  g.setAttribute("normal",new THREE.Float32BufferAttribute([...a.nor,...b.nor],3));
  g.setAttribute("uv",new THREE.Float32BufferAttribute([...a.uv,...b.uv],2));
  g.setIndex([...a.idx,...b.idx.map(i=>i+a.vc)]);
  g.addGroup(0,a.idx.length,0);
  g.addGroup(a.idx.length,b.idx.length,1);
  return g;
}
let BOOKS=null;                 // [{geo, mats, h, tx, d}] — the design pool
let OPEN_BOOK=null;             // prototype group, cloned per placement
let pageMats=null;
function buildBookDesign(title,author,vol){
  const base=BOOK_BASES[Math.floor(Math.random()*BOOK_BASES.length)];
  const h=(0.20+Math.random()*0.10)*1.1;  // page length (standing height)
  const tx=(0.025+Math.random()*0.04)*1.1;// thickness
  const d=(0.14+Math.random()*0.05)*1.1;  // cover width (depth on the shelf)
  const {tex,uv:UV}=makeBookCoverTexture(title,author,base,
    Math.floor(Math.random()*6),vol,h,tx,d);
  const cover=new GeoAcc(), pages=new GeoAcc();
  const plainAll=geo=>{for(let f=0;f<6;f++)
    setFaceUV(geo,f,UV.plain[0]+0.02,0.3,UV.plain[1]-0.02,0.7);};
  /* boards: the front (+x) carries the cover plate, the back stays plain */
  for(const sx of[-1,1]){
    const b=new THREE.BoxGeometry(0.006,h,d);
    plainAll(b);
    if(sx>0) setFaceUV(b,0,UV.front[0],0,UV.front[1],1);
    b.translate(sx*(tx/2-0.003),h/2,0.004);
    cover.add(b);
  }
  /* rounded spine: a shallow half-ellipse wrapped in the title strip,
     hugging the boards' back edge */
  const sp=new THREE.CylinderGeometry(tx/2+0.0015,tx/2+0.0015,h,10,1,true,Math.PI/2,Math.PI);
  {
    const uv=sp.attributes.uv;
    for(let i=0;i<uv.count;i++) uv.setX(i,UV.spine[0]+uv.getX(i)*(UV.spine[1]-UV.spine[0]));
  }
  sp.scale(1,1,0.42);
  sp.translate(0,h/2,-d/2+0.004);
  cover.add(sp);
  /* page block, recessed behind every cover edge */
  const pg=new THREE.BoxGeometry(tx-0.014,h-0.012,d-0.014);
  pg.translate(0,h/2,0.001);
  pages.add(pg);
  const coverMat=new THREE.MeshPhongMaterial({map:tex, specular:0x1a1610, shininess:14});
  return {geo:mergeGroups(cover,pages),
          mats:[coverMat,pageMats[Math.floor(Math.random()*pageMats.length)]],
          h,tx,d};
}
function ensureBooks(){
  if(BOOKS) return;
  pageMats=[texPages,texPagesAged,texPagesAged].map(t=>
    new THREE.MeshPhongMaterial({map:t, specular:0x1c1812, shininess:8}));
  const titles=[...BOOK_TITLES];
  for(let i=titles.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));[titles[i],titles[j]]=[titles[j],titles[i]];
  }
  BOOKS=[];
  for(let i=0;i<16;i++){
    const [title,author]=titles[i%titles.length];
    const vol=Math.random()<0.2? "VOL. "+["I","II","III","IV","VII"][Math.floor(Math.random()*5)] : null;
    BOOKS.push(buildBookDesign(title,author,vol));
  }
  /* the open book: covers splayed flat, two page slabs meeting at a gutter */
  const od=0.18, oh=0.26;
  const leather=new THREE.MeshPhongMaterial({color:0x3a2c20, specular:0x161208, shininess:12});
  OPEN_BOOK=new THREE.Group();
  const cov=new THREE.Mesh(new THREE.BoxGeometry(od*2+0.012,0.006,oh+0.006),leather);
  cov.position.y=0.003; OPEN_BOOK.add(cov);
  const openTex=makeOpenPagesTexture();
  for(const sx of[-1,1]){
    const slab=new THREE.BoxGeometry(od-0.008,0.013,oh-0.01);
    setFaceUV(slab,2, sx<0?0:0.5,0, sx<0?0.5:1,1);     // top face = its half of the spread
    const m=new THREE.Mesh(slab,[
      pageMats[0],pageMats[0],
      new THREE.MeshPhongMaterial({map:openTex, specular:0x14100a, shininess:4}),
      pageMats[0],pageMats[0],pageMats[0]]);
    m.position.set(sx*(od/2-0.001),0.013,0);
    m.rotation.z=sx*-0.045;                            // both halves dip to the gutter
    OPEN_BOOK.add(m);
  }
  /* the archive boxes share the books' design-pool treatment */
  const labels=[...BOX_LABELS];
  for(let i=labels.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));[labels[i],labels[j]]=[labels[j],labels[i]];
  }
  BOXES=[];
  for(let i=0;i<4;i++) BOXES.push(buildBoxDesign(labels[i%labels.length]));
  markPoolShared();
}
/* the book/box/open-book pool is built once and cached for the lifetime of the
   tab, then cloned per placement — so its geometries, materials and cover
   canvases must survive every level teardown */
function markPoolShared(){
  for(const m of pageMats) markShared(m,m.map);
  for(const b of BOOKS) markShared(b.geo,b.mats[0],b.mats[0].map);
  for(const b of BOXES) markShared(b.geo,b.mat,b.mat.map);
  OPEN_BOOK.traverse(o=>{
    if(!o.isMesh) return;
    markShared(o.geometry);
    const mm=o.material;
    if(Array.isArray(mm)) mm.forEach(x=>markShared(x,x.map)); else markShared(mm,mm.map);
  });
}
const pickBook=()=>BOOKS[Math.floor(Math.random()*BOOKS.length)];
/* archive boxes built to the books' standard: textured body + creased lid */
let BOXES=null;
function buildBoxDesign(label){
  const bw=0.31+Math.random()*0.06, bh=0.19+Math.random()*0.04;
  const bd=0.24+Math.random()*0.05, lidH=0.045;
  const {tex,uv}=makeArchiveBoxTexture(label,bw,bh,bd,lidH);
  const acc=new GeoAcc();
  const body=new THREE.BoxGeometry(bw,bh,bd);
  for(const f of[0,1]) setFaceUV(body,f,...uv.side);     // handle holes in the ends
  for(const f of[2,3]) setFaceUV(body,f,...uv.plain);
  for(const f of[4,5]) setFaceUV(body,f,...uv.front);    // label both long faces
  body.translate(0,bh/2,0); acc.add(body);
  const lid=new THREE.BoxGeometry(bw+0.014,lidH,bd+0.014);
  setFaceUV(lid,2,...uv.top);
  setFaceUV(lid,3,...uv.plain);
  for(const f of[0,1,4,5]) setFaceUV(lid,f,...uv.rim);
  lid.translate(0,bh+lidH/2-0.012,0); acc.add(lid);
  return {geo:acc.build(),
          mat:new THREE.MeshPhongMaterial({map:tex, specular:0x131008, shininess:6})};
}
/* drop one copy of a design. Canonical pose: standing, base at y=0, spine
   facing −z; side s yaws it so the spine faces the aisle. flat lays it
   cover-up (the roll happens in local space — order YXZ, like the ladders) */
function spawnBook(g,des,x,yTop,z,s,opts={}){
  const m=new THREE.Mesh(des.geo,des.mats);
  m.rotation.order="YXZ";
  const yaw=(s>0?Math.PI:0)+(opts.yaw!==undefined?opts.yaw:(Math.random()-0.5)*0.07);
  if(opts.flat){
    m.rotation.set(0,yaw,Math.PI/2);
    m.position.set(x-s*des.h/2, yTop+(opts.lift||0)+des.tx/2, z);
  } else {
    m.rotation.set(0,yaw,opts.lean||0);
    m.position.set(x,yTop+(opts.lift||0),z);
  }
  g.add(m);
  return m;
}

/* brushed gunmetal for the bookends — a real texture, so the plates can
   never read as untextured "ghost books" again */
const texBrushed=makeCanvas(64,64,(g,w,h)=>{
  g.fillStyle="#3a3e44";g.fillRect(0,0,w,h);
  for(let y=0;y<h;y+=1){
    g.fillStyle=`rgba(${120+Math.random()*60|0},${126+Math.random()*60|0},${134+Math.random()*60|0},${0.05+Math.random()*0.12})`;
    g.fillRect(0,y,w,1);
  }
  for(let i=0;i<30;i++){                       // worn streaks and dings
    g.fillStyle=`rgba(16,18,20,${0.15+Math.random()*0.25})`;
    g.fillRect(Math.random()*w,Math.random()*h,2+Math.random()*10,1);
  }
});
const bookendMat=new THREE.MeshPhongMaterial({map:texBrushed, specular:0x6a6e74, shininess:64});
const accentWood=new THREE.MeshPhongMaterial({color:0x4a3522, specular:0x161208, shininess:10});
const accentBrass=new THREE.MeshPhongMaterial({color:0x6e5a2e, specular:0x8a7340, shininess:55});
/* a non-book accent sitting in line with the books: archive boxes, dusty
   jars, hourglasses, candle stubs — library things, abandoned mid-task.
   (sx,yTop,sz) = spot on the board. */
function placeAccent(g,sx,yTop,sz){
  const r=Math.random();
  if(r<0.32){
    const bd=BOXES[Math.floor(Math.random()*BOXES.length)];
    const box=new THREE.Mesh(bd.geo,bd.mat);
    box.position.set(sx,yTop,sz); box.rotation.y=(Math.random()-0.5)*0.5;
    g.add(box);
  } else if(r<0.52){
    const jar=new THREE.Mesh(new THREE.CylinderGeometry(0.085,0.085,0.24,10),
      new THREE.MeshPhongMaterial({color:0x5e665c, specular:0x3a4038, shininess:50,
        transparent:true, opacity:0.85}));
    jar.position.set(sx,yTop+0.12,sz);
    g.add(jar);
  } else if(r<0.78){
    /* an hourglass, long since run out */
    const hg=new THREE.Group();
    for(const cy of[0.01,0.27]){
      const cap=new THREE.Mesh(new THREE.CylinderGeometry(0.075,0.075,0.02,10),accentWood);
      cap.position.y=cy; hg.add(cap);
    }
    for(let i=0;i<3;i++){
      const a=i/3*Math.PI*2;
      const rod=new THREE.Mesh(new THREE.CylinderGeometry(0.008,0.008,0.26,5),accentWood);
      rod.position.set(Math.cos(a)*0.062,0.14,Math.sin(a)*0.062); hg.add(rod);
    }
    const glassMat=new THREE.MeshPhongMaterial({color:0x9aa496, specular:0x6a7468,
      shininess:70, transparent:true, opacity:0.5});
    for(const[cy,flip]of[[0.085,0],[0.195,Math.PI]]){
      const cone=new THREE.Mesh(new THREE.ConeGeometry(0.055,0.105,10),glassMat);
      cone.position.y=cy; cone.rotation.x=flip; hg.add(cone);
    }
    hg.position.set(sx,yTop,sz); hg.rotation.y=Math.random()*Math.PI*2;
    g.add(hg);
  } else {
    /* a candlestick, burnt to a stub or never lit at all */
    const cs=new THREE.Group();
    const dish=new THREE.Mesh(new THREE.CylinderGeometry(0.055,0.07,0.018,10),accentBrass);
    dish.position.y=0.009; cs.add(dish);
    const stem=new THREE.Mesh(new THREE.CylinderGeometry(0.012,0.018,0.09,8),accentBrass);
    stem.position.y=0.062; cs.add(stem);
    const ch=0.04+Math.random()*0.11;
    const candle=new THREE.Mesh(new THREE.CylinderGeometry(0.017,0.019,ch,8),
      new THREE.MeshPhongMaterial({color:0xd8d2c0, specular:0x222018, shininess:14}));
    candle.position.y=0.107+ch/2; candle.rotation.z=(Math.random()-0.5)*0.12; cs.add(candle);
    cs.position.set(sx,yTop,sz); cs.rotation.y=Math.random()*Math.PI*2;
    g.add(cs);
  }
}

function makeShelfRun(run){
  /* one continuous double-sided open stack: uprights at every cell seam,
     boards spanning the whole run — and, as of v2.1.0, properly stocked:
     row after row of spines with gaps, strays and library clutter between.
     v3.1: it is joinery now rather than five slabs. A plinth it stands on,
     a crown rail across the top, a lipped front edge on every board (that
     shadow line under the lip is most of what tells your eye a shelf is a
     shelf), and a brass card holder on each end. The whole carcass merges
     to THREE draws — grain-along, grain-up, and the brass — where the five
     bare slabs alone used to cost ten. */
  const g=new THREE.Group();
  const len=run.cells.length*CELL, H=SHELF_H, D=SHELF_D;
  const along=[], upright=[], brass=[];
  for(const by of BOARD_Y){
    along.push(woodBox(len,0.055,D, 0,by,0));
    /* the front lip, both faces — proud of the board and a touch deeper */
    for(const s of[-1,1]) along.push(woodBox(len,0.075,0.022, 0,by-0.006,s*(D/2-0.011)));
  }
  for(let i=0;i<=run.cells.length;i++)
    upright.push(woodBox(0.09,H,D, -len/2+i*CELL,H/2,0));
  if(Math.random()<0.75)                       // a thin centre back panel, most runs
    along.push(woodBox(len,H-0.2,0.04, 0,H/2,0));
  /* plinth and crown are held flush with the collision slab (SHELF_D/2 +
     0.02) — anything proud of that is something you can walk your face
     through */
  along.push(woodBox(len+0.05,0.10,D+0.04, 0,0.05,0));        // plinth
  along.push(woodBox(len+0.06,0.07,D+0.04, 0,H+0.035,0));     // crown rail
  /* the card holders: what shelf this is, if anyone still filed by it */
  for(const s of[-1,1])for(const f of[-1,1]){
    const p=new THREE.Mesh(new THREE.BoxGeometry(0.075,0.05,0.006));
    p.position.set(s*(len/2-0.045),1.34,f*(D/2+0.004));
    brass.push(p);
  }
  for(const arr of[[along,shelfMatH],[upright,shelfMat],[brass,accentBrass]]){
    if(!arr[0].length) continue;
    g.add(mergeStatic(arr[0],arr[1]));
    for(const m of arr[0]) m.geometry.dispose();
  }
  /* ---- the books ----
     Thinned out, not stripped: every board keeps 0–20 volumes (≈8 on
     average) in small arrangements — lone survivors, short rows, a leaner,
     books left flat or open mid-read. Every occupied interval is recorded
     in run.occ so the floppy disks can later pick spots the books left
     open. */
  run.occ={};
  const occAt=(s,lv)=>run.occ[s+"|"+lv]||(run.occ[s+"|"+lv]=[]);
  const claim=(occ,x0,x1)=>{
    if(x0<-len/2+0.10||x1>len/2-0.10) return false;
    if(occ.some(([a,b])=>a<x1+0.06&&b>x0-0.06)) return false;
    occ.push([x0,x1]); return true;
  };
  for(let lv=0;lv<4;lv++){
  let budget=Math.floor(Math.pow(Math.random(),1.55)*21);   // 0–20 per board, avg ≈8
  let tries=50;
  const yTop=BOARD_TOP(lv);
  while(budget>0&&tries-->0){
    const s=Math.random()<0.5?1:-1;
    const occ=occAt(s,lv), z=s*0.20;
    const x=rand(-len/2+0.35,len/2-0.35);
    const r=Math.random();
    if(r<0.32){
      /* a lone survivor, sometimes slumped sideways */
      const des=pickBook();
      if(!claim(occ,x-des.tx/2-0.02,x+des.tx/2+0.02)) continue;
      spawnBook(g,des,x,yTop,z,s,{lean:Math.random()<0.3?(Math.random()-0.5)*0.4:0});
      budget--;
    } else if(r<0.56){
      /* a tight little row, often with one more leaning on its end */
      const n=Math.min(budget,2+Math.floor(Math.random()*3));
      const row=[];let w=0;
      for(let i=0;i<n;i++){const des=pickBook();row.push(des);w+=des.tx;}
      const leanOne=budget>n&&Math.random()<0.55;
      const lw=leanOne? 0.14:0;
      if(!claim(occ,x-w/2-0.02,x+w/2+lw+0.02)) continue;
      let bx=x-w/2;
      for(const des of row){ spawnBook(g,des,bx+des.tx/2,yTop,z,s,{yaw:0}); bx+=des.tx; }
      budget-=n;
      if(leanOne){
        /* tilts back onto the row's end — the local lean sign flips with
           the side yaw so it always falls TOWARD the row in world space */
        const des=pickBook(), th=0.32+Math.random()*0.12;
        spawnBook(g,des,bx+des.tx/2+des.h*Math.sin(th)*0.85,yTop,z,s,{lean:-s*th,yaw:0});
        budget--;
      }
    } else if(r<0.72){
      /* left lying flat, cover up */
      const des=pickBook();
      if(!claim(occ,x-des.h/2-0.02,x+des.h/2+0.02)) continue;
      spawnBook(g,des,x,yTop,z,s,{flat:true,yaw:(Math.random()-0.5)*0.3});
      budget--;
    } else if(r<0.85){
      /* a small abandoned stack */
      const n=Math.min(budget,2+Math.floor(Math.random()*2));
      if(!claim(occ,x-0.17,x+0.17)) continue;
      let lift=0;
      for(let i=0;i<n;i++){
        const des=pickBook();
        spawnBook(g,des,x+rand(-0.02,0.02),yTop,z+rand(-0.02,0.02),s,
          {flat:true,lift,yaw:(Math.random()-0.5)*0.4});
        lift+=des.tx;
      }
      budget-=n;
    } else if(r<0.94&&budget>=2){
      /* bookends still clamping the last few spines upright: thin brushed
         plates, each with a foot tongue the end books actually stand on */
      const n=Math.min(budget,2+Math.floor(Math.random()*3));
      const row=[];let w=0;
      for(let i=0;i<n;i++){const des=pickBook();row.push(des);w+=des.tx;}
      if(!claim(occ,x-w/2-0.06,x+w/2+0.06)) continue;
      for(const side of[-1,1]){
        const ex=x+side*(w/2+0.006);
        const up=new THREE.Mesh(new THREE.BoxGeometry(0.012,0.16,0.125),bookendMat);
        up.position.set(ex,yTop+0.004+0.08,z); g.add(up);
        const ft=new THREE.Mesh(new THREE.BoxGeometry(0.10,0.004,0.125),bookendMat);
        ft.position.set(ex-side*0.044,yTop+0.002,z); g.add(ft);
      }
      let bx=x-w/2;
      for(const des of row){
        spawnBook(g,des,bx+des.tx/2,yTop,z,s,{yaw:0,lift:0.004});
        bx+=des.tx;
      }
      budget-=n;
    } else {
      /* abandoned open, mid-read */
      if(!claim(occ,x-0.20,x+0.20)) continue;
      const ob=OPEN_BOOK.clone();
      ob.position.set(x,yTop,z);
      ob.rotation.y=(s>0?Math.PI:0)+(Math.random()-0.5)*0.5;
      g.add(ob);
      budget--;
    }
  }
  }
  /* sparse non-book clutter — a couple of things per run at most */
  const nAcc=Math.random()<0.7? 1+Math.floor(Math.random()*2):0;
  for(let i=0;i<nAcc;i++){
    const s=Math.random()<0.5?1:-1, lv=1+Math.floor(Math.random()*3);
    const occ=occAt(s,lv), yTop=BOARD_TOP(lv);
    const x=rand(-len/2+0.35,len/2-0.35);
    if(!claim(occ,x-0.18,x+0.18)) continue;
    placeAccent(g,x,yTop,s*0.20+rand(-0.03,0.03));
  }
  /* temporal decay: a collapsed board leaning inside the frame */
  if(Math.random()<0.30){
    const fall=new THREE.Mesh(new THREE.BoxGeometry(CELL*0.9,0.05,D*0.9),shelfMat);
    fall.position.set(rand(-len/2+2,len/2-2),0.5,0);
    fall.rotation.z=0.36+Math.random()*0.2; fall.rotation.y=(Math.random()-0.5)*0.2;
    g.add(fall);
  }
  /* world placement: centre of the run */
  const a=run.cells[0], b=run.cells[run.cells.length-1];
  const pa=cellToWorld2(a.x,a.y), pb=cellToWorld2(b.x,b.y);
  g.position.set((pa.x+pb.x)/2,0,(pa.z+pb.z)/2);
  if(run.axis===1) g.rotation.y=Math.PI/2;
  return g;
}
/* a heavy reading table: just tall enough, easily wide and long enough to
   crouch under. Now built like one — a plank top with real board seams and
   a bullnose edge band, a deep apron all four sides carrying a bead, and
   square legs that taper to a chamfered foot.
   NOTHING GOES UNDER IT. The obvious next move is stretchers between the
   legs, and it is wrong: a table cell is passable to a crouched player and
   the collision island is a plain 3.1m square, so a bar down at shin height
   is a bar you crawl straight through while hiding under the only cover in
   the room. The apron carries the visual weight instead. */
const TABLE_W=3.6, TABLE_D=3.0, TABLE_Y=1.3;
function makeTable(){
  const g=new THREE.Group();
  const flat=[], upright=[];
  /* the top, as five boards with the seams showing */
  const nb=5, bw=TABLE_D/nb;
  for(let i=0;i<nb;i++)
    flat.push(woodBox(TABLE_W,0.075,bw-0.008, 0,TABLE_Y,-TABLE_D/2+bw*(i+0.5)));
  /* bullnose band around the whole edge, proud of the boards */
  flat.push(woodBox(TABLE_W+0.05,0.095,0.055, 0,TABLE_Y-0.004, TABLE_D/2+0.005));
  flat.push(woodBox(TABLE_W+0.05,0.095,0.055, 0,TABLE_Y-0.004,-TABLE_D/2-0.005));
  for(const s of[-1,1]){
    flat.push(woodBox(0.055,0.095,TABLE_D+0.05, s*(TABLE_W/2+0.005),TABLE_Y-0.004,0));
    /* the apron, and the bead that catches the light along its bottom edge */
    flat.push(woodBox(0.055,0.19,TABLE_D-0.30, s*(TABLE_W/2-0.09),TABLE_Y-0.15,0));
    flat.push(woodBox(0.075,0.028,TABLE_D-0.30, s*(TABLE_W/2-0.09),TABLE_Y-0.245,0));
    flat.push(woodBox(TABLE_W-0.34,0.19,0.055, 0,TABLE_Y-0.15,s*(TABLE_D/2-0.09)));
    flat.push(woodBox(TABLE_W-0.34,0.028,0.075, 0,TABLE_Y-0.245,s*(TABLE_D/2-0.09)));
  }
  for(const[sx,sz]of[[-1,-1],[1,-1],[-1,1],[1,1]]){
    const lx=sx*(TABLE_W/2-0.18), lz=sz*(TABLE_D/2-0.18);
    upright.push(woodBox(0.14,0.30,0.14, lx,TABLE_Y-0.20,lz));        // the block at the apron
    const leg=new THREE.Mesh(taperBox(0.125,0.94,0.125,0.68));        // tapering to the floor
    leg.position.set(lx,0.05+0.47,lz); upright.push(leg);
    upright.push(woodBox(0.135,0.05,0.135, lx,0.025,lz));             // and a foot pad
  }
  for(const arr of[[flat,deskMatH],[upright,deskMat]]){
    g.add(mergeStatic(arr[0],arr[1]));
    for(const m of arr[0]) m.geometry.dispose();
  }
  return g;
}
function makeChair(wrapped){
  const g=new THREE.Group();
  const flat=[], upright=[];
  flat.push(woodBox(0.46,0.045,0.44, 0,0.47,0));                      // seat
  flat.push(woodBox(0.48,0.022,0.46, 0,0.446,0));                     // and its underframe
  /* three slats between two stiles — the stiles stand on the back legs */
  for(const s of[-1,1]) upright.push(woodBox(0.05,0.56,0.05, s*0.205,0.75,-0.19));
  for(const[by,bh]of[[0.66,0.10],[0.85,0.13],[1.00,0.06]])
    flat.push(woodBox(0.36,bh,0.028, 0,by,-0.19));
  for(const[sx,sz]of[[-1,-1],[1,-1],[-1,1],[1,1]]){
    const leg=new THREE.Mesh(taperBox(0.05,0.45,0.05,0.7));
    leg.position.set(sx*0.19,0.225,sz*0.18); upright.push(leg);
  }
  /* stretchers between the front and back legs — a chair is not cover, so
     these are free, and they are most of what stops it reading as a stool */
  for(const s of[-1,1]) flat.push(woodBox(0.028,0.028,0.34, s*0.19,0.15,0));
  flat.push(woodBox(0.36,0.026,0.026, 0,0.13,0.18));
  for(const arr of[[flat,deskMatH],[upright,deskMat]]){
    g.add(mergeStatic(arr[0],arr[1]));
    for(const m of arr[0]) m.geometry.dispose();
  }
  if(wrapped) g.add(makeWrap(0.58,0.58,1.10));
  return g;
}
function makeLadder(){
  const g=new THREE.Group(), H=LADDER_H; g.userData.prop="ladder";
  const railGeo=new THREE.BoxGeometry(0.06,H,0.1);
  for(const sx of[-0.3,0.3]){
    const r=new THREE.Mesh(railGeo,shelfMat); r.position.set(sx,H/2,0); g.add(r);
  }
  for(let i=0;i<5;i++){
    const rung=new THREE.Mesh(new THREE.BoxGeometry(0.6,0.05,0.05),shelfMat);
    rung.position.y=0.26+i*0.36; g.add(rung);
  }
  /* leant against the stack. YXZ so the lean happens AFTER the yaw — in
     the default XYZ order the tilt lands in world space and every ladder
     leans toward world −z whichever way it faces */
  g.rotation.order="YXZ";
  g.rotation.x=LADDER_LEAN;
  return g;
}
/* the reading stands. Three boxes on a stick before — a plinth, a turned
   column and a slanted desk with a real ledge to stop the book sliding off
   it now, which is the detail that makes a lectern read as a lectern. */
function makeLectern(){
  const g=new THREE.Group();
  const dark=[], light=[];
  light.push(woodBox(0.50,0.05,0.50, 0,0.025,0));                 // the plinth,
  light.push(woodBox(0.42,0.05,0.42, 0,0.068,0));                 // stepped
  light.push(woodBox(0.16,0.06,0.16, 0,0.118,0));
  const col=new THREE.Mesh(new THREE.CylinderGeometry(0.055,0.075,0.94,10));
  col.position.y=0.62; light.push(col);
  for(const[cy,r0,r1,ch]of[[0.17,0.09,0.075,0.045],[1.06,0.075,0.10,0.05]]){   // collars
    const c=new THREE.Mesh(new THREE.CylinderGeometry(r1,r0,ch,10));
    c.position.y=cy; light.push(c);
  }
  const top=woodBox(0.62,0.04,0.48, 0,1.16,0);
  top.rotation.x=-0.25; dark.push(top);
  const ledge=woodBox(0.62,0.045,0.035, 0,1.10,0.222);            // the book stop
  ledge.rotation.x=-0.25; dark.push(ledge);
  for(const[arr,mat]of[[light,shelfMat],[dark,deskMatH]]){
    g.add(mergeStatic(arr,mat));
    for(const m of arr) m.geometry.dispose();
  }
  /* some still hold what their reader walked away from */
  if(OPEN_BOOK&&Math.random()<0.4){
    const ob=OPEN_BOOK.clone();
    ob.position.set(0,1.185,0);
    ob.rotation.x=-0.25; ob.rotation.z=(Math.random()-0.5)*0.1;
    g.add(ob);
  }
  return g;
}
/* ---- the display forms ----
   A cylinder with a sphere on it, a sphere for a head and a stick for an
   arm: a snowman on a pole, and the least convincing thing on the floor.
   A dress form is a PROFILE — hip, waist, bust, the shoulder slope and the
   sharp cut at the neck — and turning that profile is the whole difference,
   exactly as it was for the almond water bottle. Everything here is turned:
   the body, the head, the cast base, the collars on the pole. The arms are
   the one exception, and they are jointed rather than a single peg, because
   a straight stick hanging off a shoulder is a broom handle.
   Every lathe CLOSES at both poles (radius 0.001): an open ring on a
   backface-culled shell is a hole you see straight through, which is what
   put a window in the spider's face.
   texMannequin is fitted, u around and v base→neck, so its two mould
   parting seams land where a real two-part shell's do. */
/* the shell is a MATT painted fibreglass: at the old specular a warm light
   turned every form in the room into polished brass */
const mannequinMat=new THREE.MeshPhongMaterial({map:texMannequin, color:0x9a958d,
  specular:0x1c1b18, shininess:9});
const mannequinDark=new THREE.MeshPhongMaterial({map:texMannequin, color:0x5c564c,
  specular:0x141310, shininess:7});
const mannequinIron=new THREE.MeshPhongMaterial({color:0x3b3a37, specular:0x2a2c2e, shininess:26});
/* r at t up the body, as a fraction of the widest point. The SHOULDER is
   the load-bearing part of this list: the first pass ran the radius down
   smoothly from the chest to the neck, and a smooth taper to a point is a
   chess piece. A form holds its width to t≈0.86 and then falls off a
   cliff, and that cliff is the shoulder line. */
const FORM_PROFILE=[[0.001,0.00],[0.62,0.004],[0.94,0.030],[1.00,0.085],[0.97,0.19],
                    [0.88,0.30],[0.79,0.40],[0.82,0.49],[0.93,0.59],[1.00,0.68],
                    [1.00,0.78],[0.97,0.845],[0.86,0.875],[0.58,0.905],[0.33,0.94],
                    [0.26,0.975],[0.001,1.00]];
/* the head: an egg with a jaw, closed top and bottom */
const HEAD_PROFILE=[[0.001,0.00],[0.30,0.03],[0.52,0.12],[0.68,0.26],[0.78,0.44],
                    [0.80,0.60],[0.72,0.76],[0.52,0.90],[0.28,0.975],[0.001,1.00]];
const lathe=(prof,R,H,seg)=>new THREE.LatheGeometry(
  prof.map(([r,t])=>new THREE.Vector2(r*R,t*H)), seg||18);
function makeMannequin(){
  const g=new THREE.Group(); g.userData.prop="mannequin";
  const mat=Math.random()<0.76? mannequinMat : mannequinDark;
  const poleH=0.58+Math.random()*0.22, torsoH=0.66+Math.random()*0.13;
  const build=0.90+Math.random()*0.28;             // slender → broad
  /* a real form is ~0.42m across the shoulders. At the old 0.168 base it
     was 0.34 wide over a 0.7m body, which is a skittle. */
  const R=0.208*build;
  const iron=[], skin=[];
  /* the cast base: a turned disc with a cove rising into the pole boss */
  iron.push(new THREE.Mesh(new THREE.LatheGeometry([
    new THREE.Vector2(0.001,0),new THREE.Vector2(0.255,0),new THREE.Vector2(0.262,0.012),
    new THREE.Vector2(0.245,0.026),new THREE.Vector2(0.14,0.036),new THREE.Vector2(0.075,0.058),
    new THREE.Vector2(0.055,0.088),new THREE.Vector2(0.001,0.092)],20)));
  /* two-stage pole with a knurled collar and the thumbscrew nobody undid */
  const lower=new THREE.Mesh(new THREE.CylinderGeometry(0.021,0.023,poleH*0.55,10));
  lower.position.y=0.05+poleH*0.275; iron.push(lower);
  const upper=new THREE.Mesh(new THREE.CylinderGeometry(0.016,0.016,poleH*0.52,10));
  upper.position.y=0.05+poleH*0.74; iron.push(upper);
  const collar=new THREE.Mesh(new THREE.CylinderGeometry(0.030,0.030,0.036,12));
  collar.position.y=0.05+poleH*0.55; iron.push(collar);
  const screw=new THREE.Mesh(new THREE.CylinderGeometry(0.008,0.008,0.05,8));
  screw.rotation.z=Math.PI/2; screw.position.set(0.03,0.05+poleH*0.55,0); iron.push(screw);
  const wing=new THREE.Mesh(new THREE.BoxGeometry(0.008,0.028,0.014));
  wing.position.set(0.054,0.05+poleH*0.55,0); iron.push(wing);
  /* the body, on its own slump */
  const tg=new THREE.Group(); tg.position.y=0.05+poleH; g.add(tg);
  tg.rotation.x=(Math.random()-0.5)*0.14; tg.rotation.z=(Math.random()-0.5)*0.18;
  tg.rotation.y=Math.random()*Math.PI*2;
  const torso=new THREE.Mesh(lathe(FORM_PROFILE,R,torsoH,22));
  torso.scale.z=0.63; tg.add(torso); skin.push(torso);
  /* arms: shoulder → elbow → wrist, each joint a real break in the line.
     Each one independently still attached. */
  const shY=torsoH*0.855, shR=R*0.93;
  for(const sx of[-1,1]) if(Math.random()<0.6){
    const ag=new THREE.Group();
    ag.position.set(sx*shR,shY,0);
    ag.rotation.order="YXZ";
    ag.rotation.z=sx*(0.10+Math.random()*0.18);
    ag.rotation.x=(Math.random()-0.5)*0.3;
    tg.add(ag);
    const uL=0.27+Math.random()*0.04;
    const ball=new THREE.Mesh(new THREE.SphereGeometry(0.056,10,8));
    ball.scale.set(1,0.86,1); ag.add(ball); skin.push(ball);
    const up=new THREE.Mesh(new THREE.CylinderGeometry(0.050,0.038,uL,9));
    up.position.y=-uL/2; ag.add(up); skin.push(up);
    const eg=new THREE.Group(); eg.position.y=-uL; ag.add(eg);
    eg.rotation.x=-(0.14+Math.random()*0.55);      // the elbow, never locked
    const el=new THREE.Mesh(new THREE.SphereGeometry(0.040,9,8));
    eg.add(el); skin.push(el);
    const fL=0.25+Math.random()*0.04;
    const fore=new THREE.Mesh(new THREE.CylinderGeometry(0.037,0.026,fL,9));
    fore.position.y=-fL/2; eg.add(fore); skin.push(fore);
    /* and a bare wrist peg where the hand should have gone */
    const wr=new THREE.Mesh(new THREE.CylinderGeometry(0.018,0.014,0.055,8));
    wr.position.y=-fL-0.022; eg.add(wr); skin.push(wr);
  }
  /* the head. Turned, closed, faceless — with just enough of a nose that an
     egg on a neck resolves as looking somewhere. It has to be SMALL and
     sunk into the skull: at 22×55mm and standing clear of the surface it
     stopped being a nose and became a beak. */
  const makeHead=()=>{
    const hg=new THREE.Group();
    const hd=new THREE.Mesh(lathe(HEAD_PROFILE,0.118,0.245,18));
    hd.scale.set(0.90,1,0.96); hg.add(hd); skin.push(hd);
    const nose=new THREE.Mesh(new THREE.ConeGeometry(0.017,0.032,7));
    nose.rotation.x=Math.PI/2*0.86; nose.position.set(0,0.140,0.083); hg.add(nose); skin.push(nose);
    return hg;
  };
  const neck=new THREE.Mesh(new THREE.CylinderGeometry(0.030,0.048,0.105,10));
  neck.position.y=torsoH+0.042; tg.add(neck); skin.push(neck);
  /* the packaging is decided FIRST, because it constrains the head: a form
     still sealed in its film cannot have its head lying on the floor
     outside the bag, and the two rolled independently the first time */
  const wrapped=Math.random()<0.24;
  const r=wrapped? Math.random()*0.84 : Math.random();
  if(r<0.66){
    const hg=makeHead();
    hg.position.y=torsoH+0.088;
    hg.rotation.y=(Math.random()-0.5)*1.7;         // looking somewhere. Not at you. Probably.
    hg.rotation.z=(Math.random()-0.5)*0.22;
    tg.add(hg);
  } else if(r<0.84){
    /* the head came off, and lies on the floor beside the base. It rests on
       its own widest radius — parked at a fixed 0.115 it floated, and an
       egg hovering 2cm off a carpet reads as a dropped plate. */
    const hg=makeHead();
    const a=Math.random()*Math.PI*2, dd=0.34+Math.random()*0.26;
    hg.position.set(Math.sin(a)*dd,0.118*0.90,Math.cos(a)*dd);
    hg.rotation.set(Math.PI*0.5,Math.random()*7,(Math.random()-0.5)*0.5);
    g.add(hg);
  } else {
    /* neither: a turned finial capping the neck, the way an unused form
       leaves the factory */
    const fin=new THREE.Mesh(new THREE.LatheGeometry([
      new THREE.Vector2(0.001,0),new THREE.Vector2(0.034,0.004),new THREE.Vector2(0.024,0.022),
      new THREE.Vector2(0.038,0.048),new THREE.Vector2(0.022,0.070),new THREE.Vector2(0.001,0.078)],12));
    fin.position.y=torsoH+0.092; tg.add(fin); iron.push(fin);
  }
  /* two merged meshes, whatever the variant rolled: the shell and the iron.
     mergeStatic bakes each part's world matrix, so the slump, the arm poses
     and the non-uniform torso scale all come along — but ONLY if the pose
     groups above them are current. Object3D.updateMatrixWorld reads its
     PARENT's matrixWorld and does not walk up to build it, so without this
     one call every limb merges at the body's origin. */
  g.updateMatrixWorld(true);
  const merged=[];
  for(const[arr,m]of[[skin,mat],[iron,mannequinIron]]){
    if(!arr.length) continue;
    merged.push(mergeStatic(arr,m));
    for(const p of arr) p.geometry.dispose();
  }
  for(const c of[...g.children]) g.remove(c);      // the pose groups have done their job
  for(const m of merged) g.add(m);
  /* a few are still in their packaging */
  if(wrapped) g.add(makeWrap(0.60,0.48,poleH+torsoH+0.30));
  return g;
}
/* ---- the returns trolley ----
   It was eleven bare boxes wearing one flat grey — no finish, no formed
   edges, and four discs lying on their sides for castors, which is the
   detail that decided the whole object read as a shelf unit somebody had
   drawn wheels on. A book truck is SHEET STEEL: every edge of it is folded
   over, which is both how it gets its stiffness and the only reason it
   catches a light at all. So each deck here is a plate with a hemmed lip
   turned down on both long edges, the ends are pressed panels with a swage
   across them, the corners take real rubber bumpers, and each castor is a
   top plate + swivel + fork + a rubber tyre on a hub.
   Three merged draws (paint · rubber · bright steel) plus the load, where
   the old one cost eleven before a single book went on it. */
/* Institutional enamel, and DESATURATED — the first pass offered an oxide
   red, and a warm saturated tint over a bright map turns a hemmed steel
   deck into an orange plank: the whole truck read as joinery, in a room
   that is already made of joinery. Nothing here can be mistaken for wood. */
const cartPaintMats=[0x9aa39c,0x7c848c,0xa5a29a].map(c=>new THREE.MeshPhongMaterial(
  {map:texCartPaint, color:c, specular:0x35383a, shininess:34}));
const cartRubberMat=new THREE.MeshPhongMaterial({color:0x1b1c1e, specular:0x2a2c2e, shininess:14});
const cartSteelMat=new THREE.MeshPhongMaterial({map:texBrushed, color:0xa8aeb4,
  specular:0x8a9096, shininess:70});
const DECKS=[0.175,0.535,0.895];
function makeBookCart(){
  const g=new THREE.Group(); g.userData.prop="cart";
  const paint=[], rubber=[], steel=[];
  /* every painted box maps its finish at one world scale, so a 0.9m panel
     and an 18mm lip carry the same enamel */
  const pbox=(w,h,d,x,y,z)=>{
    const m=new THREE.Mesh(scaleBoxUV(new THREE.BoxGeometry(w,h,d),w,h,d,0.5));
    m.position.set(x,y,z); paint.push(m); return m;
  };
  const FRAME_B=0.115, TOP=0.965;                 // frame underside / top of the ends
  /* the two end panels: a skin, a rolled rib all the way round it, and a
     pressed swage across the middle. The rib is what stops a 3mm plate
     reading as card. */
  for(const sx of[-1,1]){
    const ex=sx*0.455;
    pbox(0.028,TOP-FRAME_B,0.50, ex,(TOP+FRAME_B)/2,0);
    for(const ey of[FRAME_B+0.022,TOP-0.022])     // top & bottom rails of the rib
      pbox(0.040,0.044,0.50, ex,ey,0);
    for(const ez of[-0.23,0.23])                  // and its stiles
      pbox(0.040,TOP-FRAME_B,0.044, ex,(TOP+FRAME_B)/2,ez);
    pbox(0.038,0.030,0.46, ex,(TOP+FRAME_B)/2,0); // the swage
  }
  /* the decks. Plate + a hem folded DOWN on each long edge — the shadow
     under that hem is most of what says "formed" rather than "cut". */
  for(const sy of DECKS){
    pbox(0.88,0.020,0.50, 0,sy,0);
    for(const sz of[-0.24,0.24]) pbox(0.88,0.046,0.018, 0,sy-0.031,sz);
  }
  /* the top deck alone gets retaining rails, standing proud */
  for(const sz of[-0.245,0.245]) pbox(0.88,0.052,0.020, 0,DECKS[2]+0.036,sz);
  /* a bottom apron tying the ends together under the lowest deck */
  for(const sz of[-0.235,0.235]) pbox(0.90,0.055,0.020, 0,FRAME_B+0.030,sz);
  /* corner bumpers: rubber, full height, and the reason a real truck can be
     driven into a shelf end for thirty years without marking either */
  for(const sx of[-1,1])for(const sz of[-1,1]){
    const b=new THREE.Mesh(new THREE.CylinderGeometry(0.019,0.019,TOP-FRAME_B,10));
    b.position.set(sx*0.452,(TOP+FRAME_B)/2,sz*0.245); rubber.push(b);
  }
  /* the push handle: a bent tube, so the corners are ELBOWS. Two uprights,
     two quarter-torus bends and a crossbar, with a grip sleeve on it. */
  const HX=0.455, HZ=0.20, HY=TOP+0.20, EB=0.055;   // elbow radius
  for(const sz of[-1,1]){
    const pl=HY-EB-TOP;
    const post=new THREE.Mesh(new THREE.CylinderGeometry(0.016,0.016,pl,10));
    post.position.set(HX,TOP+pl/2,sz*HZ); steel.push(post);
    /* a TorusGeometry sweeps in its own XY plane from +x toward +y. Turning
       it about Y by ∓90° swings that +x end onto ±z: the arc then leaves the
       upright travelling vertically and arrives at the crossbar travelling
       along z, which is exactly a bend. Get the sign wrong on one side and
       that elbow curls out into the room. */
    const el=new THREE.Mesh(new THREE.TorusGeometry(EB,0.016,7,9,Math.PI/2));
    el.rotation.y=sz>0? -Math.PI/2 : Math.PI/2;
    el.position.set(HX,HY-EB,sz*(HZ-EB));
    steel.push(el);
  }
  const bar=new THREE.Mesh(new THREE.CylinderGeometry(0.016,0.016,2*(HZ-EB),10));
  bar.rotation.x=Math.PI/2; bar.position.set(HX,HY,0); steel.push(bar);
  const grip=new THREE.Mesh(new THREE.CylinderGeometry(0.023,0.023,0.26,12));
  grip.rotation.x=Math.PI/2; grip.position.set(HX,HY,0); rubber.push(grip);
  /* castors. Two rigid under the far end, two swivel under the handle —
     and the swivel pair is left wherever it was last shoved. */
  for(const[sx,sz]of[[-1,-1],[-1,1],[1,-1],[1,1]]){
    const cg=new THREE.Group();
    cg.position.set(sx*0.375,0,sz*0.19);
    cg.rotation.y=sx>0? (Math.random()-0.5)*2.4 : 0;   // only the swivels wander
    g.add(cg);
    const plate=new THREE.Mesh(new THREE.BoxGeometry(0.072,0.008,0.072));
    plate.position.y=FRAME_B-0.004; cg.add(plate); steel.push(plate);
    const king=new THREE.Mesh(new THREE.CylinderGeometry(0.020,0.024,0.030,10));
    king.position.y=FRAME_B-0.023; cg.add(king); steel.push(king);
    const off=sx>0? 0.016:0;                      // a swivel castor trails its axle
    for(const fs of[-1,1]){                       // the fork cheeks
      const ch=new THREE.Mesh(new THREE.BoxGeometry(0.012,0.060,0.046));
      ch.position.set(fs*0.033,0.062,-off); cg.add(ch); steel.push(ch);
    }
    const axle=new THREE.Mesh(new THREE.CylinderGeometry(0.006,0.006,0.078,6));
    axle.rotation.z=Math.PI/2; axle.position.set(0,0.050,-off); cg.add(axle); steel.push(axle);
    const tyre=new THREE.Mesh(new THREE.CylinderGeometry(0.050,0.050,0.030,14));
    tyre.rotation.z=Math.PI/2; tyre.position.set(0,0.050,-off); cg.add(tyre); rubber.push(tyre);
    for(const hs of[-1,1]){
      const hub=new THREE.Mesh(new THREE.CylinderGeometry(0.024,0.024,0.006,10));
      hub.rotation.z=Math.PI/2; hub.position.set(hs*0.017,0.050,-off); cg.add(hub); steel.push(hub);
    }
  }
  g.updateMatrixWorld(true);                      // the castor groups carry a pose
  const tint=cartPaintMats[Math.floor(Math.random()*cartPaintMats.length)];
  const built=[];
  for(const[arr,m]of[[paint,tint],[rubber,cartRubberMat],[steel,cartSteelMat]]){
    built.push(mergeStatic(arr,m));
    for(const p of arr) p.geometry.dispose();
  }
  for(const c of[...g.children]) g.remove(c);
  for(const m of built) g.add(m);
  /* its last load: 2–12 real volumes nobody reshelved — some standing
     (one usually slumped), the rest lying flat on the decks */
  let load=2+Math.floor(Math.random()*11);
  let guard=40;
  const used=[];                       // [deckY, x0, x1] claims
  while(load>0&&guard-->0){
    const sy=DECKS[Math.floor(Math.random()*DECKS.length)]+0.010;
    const s=Math.random()<0.5?1:-1;
    const des=pickBook();
    const flat=Math.random()<0.35;
    const hw=flat? des.h/2+0.02 : des.tx/2+0.02;
    const bx=rand(-0.36+hw,0.36-hw);
    if(used.some(([uy,a,b])=>uy===sy&&a<bx+hw&&b>bx-hw)) continue;
    used.push([sy,bx-hw,bx+hw]);
    spawnBook(g,des,bx,sy,rand(-0.08,0.08),s,
      flat? {flat:true,yaw:(Math.random()-0.5)*0.5}
          : {lean:Math.random()<0.5?(Math.random()-0.5)*0.5:0});
    load--;
  }
  /* the RETURNS card, in a real holder screwed to the end panel */
  const hold=new THREE.Mesh(new THREE.BoxGeometry(0.010,0.13,0.44),cartSteelMat);
  hold.position.set(0.474,0.72,0); g.add(hold);
  const plq=new THREE.Mesh(new THREE.PlaneGeometry(0.40,0.10),
    new THREE.MeshPhongMaterial({map:makeEndTextTexture("RETURNS"), transparent:true,
      specular:0x000000, shininess:1}));
  plq.position.set(0.480,0.72,0); plq.rotation.y=Math.PI/2;
  g.add(plq);
  g.rotation.z=(Math.random()-0.5)*0.02;
  return g;
}
/* ================= framed artwork =================
   Fourteen flat planes with a brown border drawn into the canvas. A picture
   on a wall is not an image — it is a MOULDING with an image inside it, and
   the three things that say so are all things a print cannot do: the frame
   is a profile that steps forward out of the wall and catches the strip
   lights along its top edge, the mat has a bevel cut through it that takes
   a different angle of light than the board around it, and there is GLASS,
   which is most of what anyone actually looks at on a picture.
   All of it is real geometry here, and none of it is expensive, because
   every piece's frame/mat/glass is merged ACROSS the whole room by material
   at the end of the hang: 34 pictures cost ~40 draws, where the 14 flat
   planes cost 14. The art plates stay individual — each is its own canvas. */
const texGilt=makeCanvas(128,128,(g,w,h)=>{
  g.fillStyle="#b89a54";g.fillRect(0,0,w,h);
  for(let i=0;i<420;i++){                        // the burnish, laid one way
    g.fillStyle=`rgba(${Math.random()<0.5?142:236},${Math.random()<0.5?116:214},${Math.random()<0.5?58:148},${0.06+Math.random()*0.16})`;
    g.fillRect(Math.random()*w,Math.random()*h,3+Math.random()*22,1);
  }
  for(let i=0;i<40;i++){                         // rubbed back to the red bole
    const x=Math.random()*w,y=Math.random()*h,r=2+Math.random()*7;
    g.beginPath();
    for(let k=0;k<=8;k++){
      const a=k/8*Math.PI*2, rr=r*(0.5+Math.random()*0.8);
      const px=x+Math.cos(a)*rr, py=y+Math.sin(a)*rr;
      k? g.lineTo(px,py) : g.moveTo(px,py);
    }
    g.closePath();
    g.fillStyle=`rgba(${118+Math.random()*30|0},${62+Math.random()*24|0},${40+Math.random()*20|0},${0.35+Math.random()*0.4})`;
    g.fill();
  }
  for(let i=0;i<150;i++){                        // craquelure: short and kinked
    let px=Math.random()*w, py=Math.random()*h, a=Math.random()*7;
    g.strokeStyle=`rgba(74,54,26,${0.14+Math.random()*0.24})`;g.lineWidth=0.7;
    g.beginPath();g.moveTo(px,py);
    for(let s=0;s<3;s++){
      a+=(Math.random()-0.5)*1.6;
      px+=Math.cos(a)*(3+Math.random()*6); py+=Math.sin(a)*(3+Math.random()*6);
      g.lineTo(px,py);
    }
    g.stroke();
  }
  for(let i=0;i<300;i++){                        // dust in the hollows
    g.fillStyle=`rgba(58,48,30,${0.05+Math.random()*0.14})`;
    g.fillRect(Math.random()*w,Math.random()*h,1,1);
  }
});
texGilt.wrapS=texGilt.wrapT=THREE.RepeatWrapping;
/* mat board: paper, so almost featureless on purpose — a fibre tooth and
   the foxing forty damp years puts on rag board, and nothing else */
const texMatBoard=makeCanvas(128,128,(g,w,h)=>{
  g.fillStyle="#cdc4ac";g.fillRect(0,0,w,h);
  for(let i=0;i<1800;i++){
    const v=Math.random()<0.5;
    g.fillStyle=`rgba(${v?176:236},${v?168:230},${v?142:206},${0.05+Math.random()*0.1})`;
    g.fillRect(Math.random()*w,Math.random()*h,1+Math.random()*2,1);
  }
  for(let i=0;i<14;i++){
    const x=Math.random()*w,y=Math.random()*h,r=3+Math.random()*13;
    const gr=g.createRadialGradient(x,y,0.5,x,y,r);
    gr.addColorStop(0,`rgba(122,90,42,${0.06+Math.random()*0.13})`);
    gr.addColorStop(1,"rgba(122,90,42,0)");
    g.fillStyle=gr;g.beginPath();g.arc(x,y,r,0,7);g.fill();
  }
});
texMatBoard.wrapS=texMatBoard.wrapT=THREE.RepeatWrapping;
/* the glazing's own dirt — alpha-shaped, so it is wipe MARKS and dust, never
   a translucent sheet. Without it a pane with no light on it is invisible. */
const texGlassFilm=makeCanvas(128,128,(g,w,h)=>{
  g.clearRect(0,0,w,h);
  for(let i=0;i<16;i++){                         // the arcs of a cloth, long ago
    const y=Math.random()*h, a=(Math.random()-0.5)*0.5;
    g.save();g.translate(w/2,y);g.rotate(a);
    const gr=g.createLinearGradient(-w/2,0,w/2,0);
    gr.addColorStop(0,"rgba(226,232,234,0)");
    gr.addColorStop(0.5,`rgba(226,232,234,${0.06+Math.random()*0.1})`);
    gr.addColorStop(1,"rgba(226,232,234,0)");
    g.fillStyle=gr;g.fillRect(-w/2,-1.5-Math.random()*3,w,3+Math.random()*6);
    g.restore();
  }
  for(let i=0;i<420;i++){
    g.fillStyle=`rgba(212,216,214,${0.05+Math.random()*0.16})`;
    g.fillRect(Math.random()*w,Math.random()*h,1,1);
  }
});
texGlassFilm.wrapS=texGlassFilm.wrapT=THREE.RepeatWrapping;
const frameGiltMat =new THREE.MeshPhongMaterial({map:texGilt, specular:0xa08850, shininess:58});
const frameEbonyMat=new THREE.MeshPhongMaterial({map:texDeskWood, color:0x4a4038,
  specular:0x2a241c, shininess:26});
const frameOakMat  =new THREE.MeshPhongMaterial({map:texShelfWood, color:0x9a8a70,
  specular:0x241c12, shininess:14});
const artMatMat  =new THREE.MeshPhongMaterial({map:texMatBoard, specular:0x141210, shininess:4});
const artBackMat =new THREE.MeshPhongMaterial({color:0x2a251f, specular:0x0a0908, shininess:3});
const artGlassMat=new THREE.MeshPhongMaterial({map:texGlassFilm, color:0xcdd6da,
  specular:0xffffff, shininess:120, transparent:true, opacity:0.55, depthWrite:false});
const FRAME_MATS=[frameGiltMat,frameEbonyMat,frameOakMat];
/* the hang rejects pieces that will not fit their wall; these are the
   materials it must NOT dispose on the way out (every piece owns its own
   art canvas and crack decal, and those it must) */
const SHARED_ART=new Set([frameGiltMat,frameEbonyMat,frameOakMat,
                          artMatMat,artBackMat,artGlassMat]);
/* one hung picture. Everything is built in the piece's own frame with the
   wall at z=0 and the room at +z; the caller places the group, and the bulk
   parts are merged room-wide afterwards. */
function makeFramedArt(sw){
  const g=new THREE.Group();
  const bulk=[];                                  // [mesh, material] — merged later
  const sh=sw*1.25;                               // the plate's own proportion
  const empty=Math.random()<0.10;
  const matted=!empty&&Math.random()<0.6;
  const mb=matted? sw*(0.09+Math.random()*0.07) : 0;
  const oval=matted&&Math.random()<0.22;
  const glazed=!empty&&Math.random()<0.78;
  const ow=sw+2*mb, oh=sh+2*mb;                   // the frame's opening
  const mw=0.030+Math.random()*0.045, md=0.032+Math.random()*0.036;
  const fm=FRAME_MATS[Math.floor(Math.random()*FRAME_MATS.length)];
  const put=(geo,mat,x,y,z)=>{
    const m=new THREE.Mesh(geo,mat); m.position.set(x,y,z); g.add(m);
    bulk.push([m,mat]); return m;
  };
  const fbox=(w,h,d,x,y,z,mat)=>
    put(scaleBoxUV(new THREE.BoxGeometry(w,h,d),w,h,d,0.35),mat,x,y,z);
  /* the backing board fills the rebate — and IS the picture once the plate
     has gone, which is what an empty frame in this building looks like */
  fbox(ow+2*mw*0.7,oh+2*mw*0.7,0.014, 0,0,0.007, artBackMat);
  /* the moulding: three courses stepping FORWARD as they step OUT, so the
     top member throws a shadow line down the wall and the outer bead is the
     first thing any light finds */
  for(const[cw,a,b]of[[mw,0,0.30],[mw*0.70,0.30,0.66],[mw*0.34,0.66,1.0]]){
    const inW=ow+2*(mw-cw), inH=oh+2*(mw-cw);
    const z0=a*md, z1=b*md, t=z1-z0, cz=(z0+z1)/2;
    fbox(inW+2*cw, cw, t, 0, (inH+cw)/2, cz, fm);
    fbox(inW+2*cw, cw, t, 0,-(inH+cw)/2, cz, fm);
    fbox(cw, inH, t,  (inW+cw)/2, 0, cz, fm);
    fbox(cw, inH, t, -(inW+cw)/2, 0, cz, fm);
  }
  if(!empty){
    const art=new THREE.Mesh(new THREE.PlaneGeometry(sw,sh),
      new THREE.MeshPhongMaterial({map:makeArtTexture(), specular:0x0a0a0a, shininess:8}));
    art.position.z=0.016; g.add(art);             // its own canvas: never merged
  }
  if(matted){
    const MZ=md*0.30-0.004;
    if(oval){
      /* an oval opening cannot be made of boxes, and the oval IS the point
         of it — a ShapeGeometry with an elliptical hole instead */
      const s=new THREE.Shape();
      s.moveTo(-ow/2,-oh/2); s.lineTo(ow/2,-oh/2); s.lineTo(ow/2,oh/2);
      s.lineTo(-ow/2,oh/2); s.closePath();
      const hole=new THREE.Path();
      hole.absellipse(0,0,sw*0.46,sh*0.46,0,Math.PI*2,true);
      s.holes.push(hole);
      put(new THREE.ShapeGeometry(s,32),artMatMat,0,0,MZ);
    } else {
      for(const[w2,h2,x2,y2]of[[ow,mb,0,(sh+mb)/2],[ow,mb,0,-(sh+mb)/2],
                               [mb,sh,(sw+mb)/2,0],[mb,sh,-(sw+mb)/2,0]])
        fbox(w2,h2,0.006, x2,y2,MZ+0.003, artMatMat);
      /* the BEVEL: a strip turned 45° at the sight edge. It is the same
         board as the mat and reads as a different tone purely because it
         faces somewhere else, which is exactly what a cut bevel does. */
      const bv=mb*0.30;
      for(const[w2,h2,x2,y2,rx,rz]of[
        [sw,bv,0, (sh+bv*0.7)/2, -Math.PI/4,0],[sw,bv,0,-(sh+bv*0.7)/2, Math.PI/4,0],
        [bv,sh,(sw+bv*0.7)/2,0, 0,Math.PI/4],[bv,sh,-(sw+bv*0.7)/2,0, 0,-Math.PI/4]]){
        const m=fbox(w2,h2,0.004, x2,y2,MZ,artMatMat);
        m.rotation.x=rx; m.rotation.z=rz;
      }
    }
  }
  if(glazed){
    const gz=md*0.66-0.004;
    put(new THREE.PlaneGeometry(ow*0.99,oh*0.99),artGlassMat,0,0,gz);
    if(Math.random()<0.16){
      /* and some of it has gone. makeCrackTexture grows a crack for a 3m
         wall — stretched over the whole pane it comes out as one black
         branch the size of the picture. It runs at a THIRD of the opening
         and off-centre, so it reads as a break from one impact instead. */
      const cs=Math.min(ow,oh)*0.62;
      const cr=new THREE.Mesh(new THREE.PlaneGeometry(cs*0.55,cs),
        new THREE.MeshPhongMaterial({map:makeCrackTexture(), transparent:true,
          opacity:0.6, depthWrite:false, specular:0x000000, shininess:1}));
      cr.position.set((Math.random()-0.5)*ow*0.34,(Math.random()-0.5)*oh*0.3,gz+0.002);
      cr.rotation.z=Math.random()*Math.PI*2;
      g.add(cr);
    }
  }
  return {g, bulk, w:ow+2*mw, h:oh+2*mw};
}

/* ---- a floor globe on a wooden stand — the geography is long gone ----
   The old sphere wore seven wobbly blobs on a 128×64 canvas and read, at
   any distance, as a mouldy ball. It is a real cartographic surface now:
   graticule at proper 15° spacing, a warm ocean plate with depth banding,
   plausible continental masses grown from lobed blobs at plate scale, an
   equator and tropics picked out heavier than the rest, and the varnish
   gone amber and crazed. You still cannot find anywhere you have been on
   it, which is the point. */
const globeTex=()=>makeCanvas(512,256,(c,w,h)=>{
  c.fillStyle="#3c5566";c.fillRect(0,0,w,h);
  for(let i=0;i<34;i++){                       // ocean depth plates
    const x=Math.random()*w,y=Math.random()*h,r=24+Math.random()*90;
    const gr=c.createRadialGradient(x,y,2,x,y,r);
    gr.addColorStop(0,`rgba(${Math.random()<0.5?"30,58,74":"86,116,132"},0.20)`);
    gr.addColorStop(1,"rgba(40,64,80,0)");
    c.fillStyle=gr;c.fillRect(x-r,y-r,r*2,r*2);
  }
  /* landmasses: a few seeds each grown from overlapping lobes, so the
     coastline comes out ragged instead of round */
  const land=(cx,cy,sc,n)=>{
    c.fillStyle="#8a8054";
    for(let i=0;i<n;i++){
      const a=Math.random()*Math.PI*2, rr=Math.random()*sc*0.8;
      const x=cx+Math.cos(a)*rr, y=cy+Math.sin(a)*rr*0.62;
      const r=sc*(0.20+Math.random()*0.34);
      c.beginPath();
      for(let t=0;t<Math.PI*2;t+=0.4)
        c.lineTo(x+Math.cos(t)*r*(0.6+Math.random()*0.8), y+Math.sin(t)*r*(0.5+Math.random()*0.8));
      c.closePath();c.fill();
    }
  };
  land(80,80,58,9); land(150,170,44,7); land(250,70,70,11);
  land(300,180,40,6); land(410,110,62,10); land(455,205,28,5);
  c.globalCompositeOperation="source-atop";     // relief, only on the land
  for(let i=0;i<900;i++){
    const v=Math.random();
    c.fillStyle=v<0.4? "rgba(112,96,58,0.30)" : v<0.7? "rgba(150,142,104,0.22)"
                                               : "rgba(74,86,52,0.22)";
    c.fillRect(Math.random()*w,Math.random()*h,2+Math.random()*7,1+Math.random()*4);
  }
  c.globalCompositeOperation="source-over";
  /* the graticule: 15° everywhere, the equator and tropics heavier */
  for(let i=1;i<12;i++){
    c.strokeStyle=i===6? "rgba(50,38,22,0.55)" : (i===4||i===8)? "rgba(60,46,26,0.32)"
                                               : "rgba(214,206,178,0.13)";
    c.lineWidth=i===6? 2:1;
    c.beginPath();c.moveTo(0,h*i/12);c.lineTo(w,h*i/12);c.stroke();
  }
  for(let i=0;i<24;i++){
    c.strokeStyle=i%6===0? "rgba(60,46,26,0.30)":"rgba(214,206,178,0.11)";
    c.lineWidth=1;
    c.beginPath();c.moveTo(w*i/24,0);c.lineTo(w*i/24,h);c.stroke();
  }
  /* varnish: gone amber, and crazed with age */
  const am=c.createLinearGradient(0,0,0,h);
  am.addColorStop(0,"rgba(120,88,34,0.26)");
  am.addColorStop(0.5,"rgba(150,116,52,0.10)");
  am.addColorStop(1,"rgba(120,88,34,0.26)");
  c.fillStyle=am;c.fillRect(0,0,w,h);
  c.strokeStyle="rgba(58,44,24,0.14)";c.lineWidth=1;
  for(let i=0;i<70;i++){
    c.beginPath();
    let x=Math.random()*w,y=Math.random()*h;
    c.moveTo(x,y);
    for(let k=0;k<4;k++){ x+=(Math.random()-0.5)*26; y+=(Math.random()-0.5)*20; c.lineTo(x,y); }
    c.stroke();
  }
});
function makeGlobe(){
  const g=new THREE.Group(); g.userData.prop="globe";
  const wood=new THREE.MeshPhongMaterial({map:texDeskWood, color:0x8a7050,
    specular:0x161208, shininess:12});
  /* a three-legged cradle rather than a post in a dinner plate */
  const parts=[];
  const ring=new THREE.Mesh(new THREE.TorusGeometry(0.205,0.016,6,18));
  ring.rotation.x=Math.PI/2; ring.position.y=0.055; parts.push(ring);
  for(let i=0;i<3;i++){
    const a=i/3*Math.PI*2;
    const leg=new THREE.Mesh(new THREE.CylinderGeometry(0.019,0.028,0.12,7));
    leg.position.set(Math.cos(a)*0.205,0.0,Math.sin(a)*0.205);
    parts.push(leg);
    const brace=new THREE.Mesh(new THREE.CylinderGeometry(0.013,0.013,0.30,6));
    brace.position.set(Math.cos(a)*0.105,0.24,Math.sin(a)*0.105);
    brace.rotation.z=-Math.cos(a)*0.36; brace.rotation.x=Math.sin(a)*0.36;
    parts.push(brace);
  }
  const col=new THREE.Mesh(new THREE.CylinderGeometry(0.030,0.048,0.44,8));
  col.position.y=0.31; parts.push(col);
  const knop=new THREE.Mesh(new THREE.SphereGeometry(0.052,9,7));
  knop.scale.y=0.7; knop.position.y=0.52; parts.push(knop);
  g.add(mergeStatic(parts,wood));
  for(const m of parts) m.geometry.dispose();
  /* the meridian and its yoke, in brass */
  const br=[];
  const mer=new THREE.Mesh(new THREE.TorusGeometry(0.305,0.014,6,26));
  mer.rotation.x=Math.PI/2-0.41; mer.position.y=0.85; br.push(mer);
  for(const s of[-1,1]){                        // the axle pins through the poles
    const pin=new THREE.Mesh(new THREE.CylinderGeometry(0.012,0.012,0.07,6));
    pin.position.set(s*Math.sin(0.41)*0.29,0.85+s*Math.cos(0.41)*0.29,0);
    pin.rotation.z=0.41; br.push(pin);
  }
  g.add(mergeStatic(br,accentBrass));
  for(const m of br) m.geometry.dispose();
  const globe=new THREE.Mesh(new THREE.SphereGeometry(0.27,20,16),
    new THREE.MeshPhongMaterial({map:globeTex(), specular:0x2a3038, shininess:44}));
  globe.position.y=0.85; globe.rotation.z=0.41; globe.rotation.y=Math.random()*Math.PI*2;
  g.add(globe);
  return g;
}
/* ---- a 3.5" floppy disk — the only thing in this library worth taking ----
   It was three untextured boxes, and it is the ONE prop the whole level
   asks you to look for: it earns a printed label somebody actually wrote
   on, the shutter with its window, the hub ring on the underside and the
   write-protect tab. The label keeps its faint phosphor sheen — that
   emissive is what makes it findable on a murky shelf and it is a gameplay
   property, not a decorative one. */
let FLOPPY=null;
function ensureFloppy(){
  if(FLOPPY) return FLOPPY;
  /* four labels, one geometry. The UV regions are identical across the
     variants, so the box is built once and only the map differs — twenty
     disks in one room all carrying the same handwriting reads as one prop
     copied twenty times, which is exactly what they are otherwise. */
  const mats=[];
  let uv=null;
  for(let i=0;i<4;i++){
    const f=makeFloppyTexture();
    uv=f.uv;
    const m=new THREE.MeshPhongMaterial({map:f.tex, emissive:0x1a1c14,
      specular:0x3a3e46, shininess:34});
    markShared(f.tex,m);
    mats.push(m);
  }
  const body=new THREE.BoxGeometry(0.27,0.022,0.28);
  setFaceUV(body,2,...uv.top);                            // +y: the label face
  for(const f of[0,1,3,4,5]) setFaceUV(body,f,...uv.plain);
  FLOPPY={mats, geo:markShared(body)};
  return FLOPPY;
}
const shutterMat=new THREE.MeshPhongMaterial({color:0x9aa0a6, emissive:0x0a0c0e,
  specular:0x70757c, shininess:74});
const discHubMat=new THREE.MeshPhongMaterial({color:0x5f666d, specular:0x40454a, shininess:40});
function makeDisc(){
  const F=ensureFloppy();
  const g=new THREE.Group();
  g.add(new THREE.Mesh(F.geo,F.mats[Math.floor(Math.random()*F.mats.length)]));
  /* the sprung steel shutter, standing a hair proud of the shell, with the
     window cut through it.
     −z, because that is the end the LABEL's printed shutter lands on with
     the top face's v mapped upright (makeFloppyTexture) — steel on one end
     and the printed slot on the other is the kind of mismatch nobody names
     but everybody sees, and the old cure for it was flipping v, which
     mirrored every letter on the label.
     The placement is baked into the PARTS, not applied to the merged mesh:
     mergeStatic ends in freezeStatic, so a .position.set afterwards writes a
     matrix that is never recomposed and the steel silently renders at the
     group's origin — which is where it has been sitting, dead centre on the
     label, since the merge went in. */
  const SX=-0.008, SY=0.001, SZ=-0.116;
  const sh=[];
  for(const [w,hh,d,dx] of [[0.185,0.026,0.045,0],[0.042,0.027,0.052,-0.072],
                            [0.042,0.027,0.052,0.072]]){
    const m=new THREE.Mesh(new THREE.BoxGeometry(w,hh,d));
    m.position.set(SX+dx,SY,SZ); sh.push(m);
  }
  g.add(mergeStatic(sh,shutterMat));
  for(const m of sh) m.geometry.dispose();
  /* the hub, underneath, at the other end */
  const hub=new THREE.Mesh(new THREE.CylinderGeometry(0.043,0.043,0.006,12),discHubMat);
  hub.position.set(0,-0.012,0.03); g.add(hub);
  g.scale.setScalar(1.35);                       // readable from a few metres out
  g.userData.animated=true;                      // idle-spins/hovers in updateProps
  return g;
}
/* ---- vintage personal computer: CRT + case + keyboard ----
   The one machine you are sent to feed, and eight more scattered on the
   tables, so it is worth building properly: the CRT genuinely TAPERS to
   its neck now (a cuboid monitor is the single loudest "this is a box with
   a picture on it" tell), the tube is recessed behind a real bezel and
   bulges the way glass does, the case has vents and a drive bay and a
   badge, and the keyboard is a drawn keyfield rather than a dark slab.
   Everything static merges by material — 4 draws, down from 9 — and the
   pieces the cutscenes drive (the screen canvas, the drive LED) stay their
   own meshes because their materials are written to at runtime. */
export function makeVintagePC(scale=1){
  const g=new THREE.Group();
  const pale=[], dark=[];
  const paleBox=(w,h,d,x,y,z)=>{ pale.push(woodBox(w,h,d,x,y,z,0.34)); };
  const darkBox=(w,h,d,x,y,z)=>{ dark.push(woodBox(w,h,d,x,y,z,0.34)); };
  const CASE_W=0.62, CASE_H=0.16, CASE_D=0.5;
  paleBox(CASE_W,CASE_H,CASE_D, 0,CASE_H/2,0);            // the case
  paleBox(0.66,0.022,0.54, 0,0.163,0);                    // its lid overhang
  /* louvred cooling slots down each FLANK. They were spread along x (the
     case's WIDTH) and extruded 0.24 along z at z=±0.251 — i.e. jammed
     through the front and back faces, poking 0.12m out into the air over
     the keyboard. Fourteen of them, and from the seat they read as a row
     of brown tabs standing on a plate attached to nothing. A flank slot
     runs front-to-back: long in z, thin in y, a hair proud of the x face
     it is cut into (the drive bay's idiom, one axis over). */
  for(const sx of[-1,1])for(let i=0;i<3;i++)
    darkBox(0.012,0.009,0.30, sx*(CASE_W/2-0.002),0.052+i*0.032,0.02);
  /* the drive bay: a recessed face, the slot, the eject button */
  darkBox(0.30,0.075,0.014, -0.1,0.085,0.249);
  darkBox(0.245,0.012,0.02, -0.1,0.092,0.252);
  paleBox(0.03,0.022,0.018, 0.03,0.062,0.252);
  const led=new THREE.Mesh(new THREE.BoxGeometry(0.02,0.02,0.012),
    new THREE.MeshBasicMaterial({color:0x201008}));
  led.position.set(0.18,0.08,0.252); g.add(led); g.userData.led=led.material;
  /* the badge nobody has read in thirty years */
  const badge=new THREE.Mesh(new THREE.PlaneGeometry(0.17,0.028),
    new THREE.MeshPhongMaterial({map:makeEndTextTexture("ARCHIVE"), transparent:true,
      specular:0x000000, shininess:1}));
  badge.position.set(0.16,0.128,0.2515); g.add(badge);
  /* CRT: a real frustum, wide at the glass and pinched at the neck */
  const CRT_W=0.56, CRT_H=0.46, CRT_D=0.52, CRT_K=0.72, CRT_Y=CASE_H+0.25, CRT_Z=-0.01;
  const crt=new THREE.Mesh(taperBox(CRT_W,CRT_H,CRT_D,CRT_K,"z"));
  crt.position.set(0,CRT_Y,CRT_Z); pale.push(crt);
  paleBox(0.30,0.26,0.10, 0,0.40,-0.31);                  // the neck housing
  /* Vents on the crown, and the crown SLOPES: taperBox pinches the −z end,
     so the top face runs from (+D/2, +H/2) down to (−D/2, +H/2·k). Seat
     each vent on that line at its own z. Stacking them in y instead — the
     first pass climbed 0.615→0.685 at one fixed z — put all six of them in
     the air ABOVE the monitor, up to 0.1m clear of the glass, and a 0.34m
     plate floating over a CRT is the largest unattached thing in the room. */
  const crownY=z=>CRT_Y+CRT_H/2*(CRT_K+(1-CRT_K)*((z-CRT_Z)/CRT_D+0.5));
  for(let i=0;i<6;i++){
    const vz=-0.21+i*0.04;
    darkBox(0.34,0.008,0.016, 0,crownY(vz)+0.002,vz);
  }
  /* The bezel and the glass stack in front of the CRT's own front face, at
     z 0.25. Getting this order wrong is not subtle: with the glass BEHIND
     that face, the only part of the screen that showed was the patch where
     the tube's bulge cleared it — a black OVAL floating on a beige box. */
  darkBox(0.50,0.38,0.008, 0,0.41,0.2465);                // the dark surround
  paleBox(0.56,0.055,0.03, 0,0.605,0.262);                // moulding, four sides
  paleBox(0.56,0.055,0.03, 0,0.215,0.262);
  for(const s of[-1,1]) paleBox(0.055,0.44,0.03, s*0.2525,0.41,0.262);
  /* the screen: its own canvas so each machine can boot/static/die alone */
  const cv=document.createElement("canvas"); cv.width=192; cv.height=144;
  const tex=new THREE.CanvasTexture(cv); tex.minFilter=THREE.LinearFilter; tex.generateMipmaps=false;
  const ctx=cv.getContext("2d");
  const screen={
    tex,
    off(){ ctx.fillStyle="#0a0d0b"; ctx.fillRect(0,0,192,144);
      const gr=ctx.createRadialGradient(96,66,6,96,66,110);
      gr.addColorStop(0,"rgba(70,80,76,0.10)"); gr.addColorStop(1,"rgba(70,80,76,0)");
      ctx.fillStyle=gr; ctx.fillRect(0,0,192,144); tex.needsUpdate=true; },
    boot(alpha=1){ ctx.fillStyle="#05070a"; ctx.fillRect(0,0,192,144);
      ctx.fillStyle=`rgba(244,248,252,${alpha})`;
      ctx.font="bold 30px Courier New"; ctx.textAlign="center"; ctx.textBaseline="middle";
      ctx.fillText("THE END",96,72);
      ctx.fillStyle=`rgba(244,248,252,${alpha*0.25})`; ctx.fillText("THE END",96,72); // soft bloom
      tex.needsUpdate=true; },
    static(bright=1){ const d=ctx.createImageData(192,144);
      for(let i=0;i<d.data.length;i+=4){
        const v=Math.random()*255*bright;
        d.data[i]=d.data[i+1]=d.data[i+2]=v; d.data[i+3]=255;
      }
      ctx.putImageData(d,0,0); tex.needsUpdate=true; },
    dead(){ ctx.fillStyle="#060707"; ctx.fillRect(0,0,192,144);
      ctx.fillStyle="rgba(120,128,126,0.05)";       // the faintest burn-in ghost
      ctx.font="bold 30px Courier New"; ctx.textAlign="center"; ctx.textBaseline="middle";
      ctx.fillText("THE END",96,72); tex.needsUpdate=true; },
    /* the machine's last word, burning red — and it doesn't use words.
       A crying face, drawn on the coarsest grid the glass can hold: 8px
       cells, nothing off-grid, no antialiasing anywhere. The tears run on
       their own clock (`t`), so the thing goes on weeping for as long as
       you stand there. */
    warn(alpha=1,t=0){
      ctx.fillStyle="#0a0202"; ctx.fillRect(0,0,192,144);
      const gr=ctx.createRadialGradient(96,72,8,96,72,112);
      gr.addColorStop(0,`rgba(140,14,8,${0.55*alpha})`);
      gr.addColorStop(1,"rgba(30,3,2,0)");
      ctx.fillStyle=gr; ctx.fillRect(0,0,192,144);
      /* 24×18 cells of 8px. The grid's centre is the SEAM between columns
         11 and 12, so every feature is stamped as a mirrored pair and the
         face cannot come out lopsided.

         EVERY FEATURE HAS TO CLEAR THE OUTLINE. At this resolution the
         head is only about seven cells of radius and a one-cell ring, so
         anything drawn near the top of the face touches it — the first
         pass put a lid over each eye at r 7.1 straight through a ring that
         runs 6.5–7.5, and under the tube's bloom the whole top half fused
         into one lump with two dark holes in it. The head is an ELLIPSE
         (a face is taller than it is wide), the ring is tested in the
         ellipse's own normalised radius, and there is a clear cell of
         black between it and everything inside. */
      const P=8, CX=11.5, CY=8.5, RX=7.5, RY=8.0;
      const er=(x,y)=>Math.sqrt(((x-CX)/RX)**2+((y-CY)/RY)**2);
      const px=(x,y,w=1,h=1)=>{
        const yy=Math.round(y);
        if(yy>17||yy+h<0) return;
        ctx.fillRect(Math.round(x)*P,yy*P,w*P,h*P);
      };
      const mir=(x,y,w=1,h=1)=>{ px(x,y,w,h); px(23-x-(w-1),y,w,h); };
      const face=()=>{
        for(let y=0;y<18;y++)for(let x=0;x<24;x++){
          const r=er(x,y);
          if(r>0.875&&r<=1) px(x,y);
        }
        mir(8,6,2,2);                 // eyes
        /* THE STREAK IS THE WHOLE THING. Three loose drops under an eye
           read as noise on the tube; a standing wet line down the cheek is
           what makes the face crying rather than merely sad, and the drops
           below it are then legible as drops. */
        mir(8,9,1,3);
        /* the mouth: corners turned down — in screen space a frown is the
           middle riding HIGHEST, so the row grows with the offset. It is
           kept clear of column 8, which the tears own all the way down. */
        mir(11,13); mir(10,14); mir(9,14);
        for(let k=0;k<2;k++){
          const y0=12+((t*3.2+k*3.0)%6.2), y1=12+((t*3.2+k*3.0+1.5)%6.2);
          px(8,y0,1,y0>15?2:1); px(15,y1,1,y1>15?2:1);   // stretching as they fall
        }
      };
      /* the glass blooms: one soft halo pass under one hard one. Two blur
         passes closed every gap the layout just bought. */
      ctx.save();
      ctx.shadowColor=`rgba(255,58,34,${alpha})`; ctx.shadowBlur=5;
      ctx.fillStyle=`rgba(226,46,28,${alpha*0.8})`;
      face();
      ctx.restore();
      ctx.fillStyle=`rgba(255,138,112,${alpha})`;
      face();
      ctx.fillStyle="rgba(10,2,2,0.26)";            // the tube's own scanlines
      for(let y=0;y<144;y+=3) ctx.fillRect(0,y,192,1);
      tex.needsUpdate=true; },
  };
  screen.off();
  const scrMat=new THREE.MeshBasicMaterial({map:tex});
  /* the glass BULGES. A CRT face is a section of a very large sphere, and a
     dead-flat quad behind a bezel reads as a photograph in a frame */
  const glass=new THREE.PlaneGeometry(0.44,0.32,6,6);
  {
    const p=glass.attributes.position;
    for(let i=0;i<p.count;i++){
      const x=p.getX(i)/0.22, y=p.getY(i)/0.16;
      p.setZ(i, 0.019*Math.max(0,1-(x*x+y*y)*0.5));
    }
    glass.computeVertexNormals();
  }
  const scr=new THREE.Mesh(glass,scrMat);
  scr.position.set(0,0.41,0.2515); g.add(scr);   // clear of the tube face, under the bezel's lip
  g.userData.screen=screen; g.userData.scrMat=scrMat;
  /* the keyboard: a wedge with the keyfield printed on its top face */
  const kb=new THREE.Group();
  kb.position.set(0,0.012,0.46); kb.rotation.x=0.07; g.add(kb);
  const kbGeo=taperBox(0.52,0.042,0.21,0.86,"z");
  const kbody=new THREE.Mesh(kbGeo,beigePlastic); kb.add(kbody);
  const keys=new THREE.Mesh(new THREE.PlaneGeometry(0.48,0.175),
    new THREE.MeshPhongMaterial({map:makeKeyboardTexture(), specular:0x18160f, shininess:8}));
  keys.rotation.x=-Math.PI/2; keys.position.set(0,0.0215,0.004); kb.add(keys);
  /* the coil back to the case, in two dropping arcs */
  {
    const c=[];
    for(let i=0;i<7;i++){
      const k=i/6, seg=new THREE.Mesh(new THREE.BoxGeometry(0.012,0.012,0.05));
      seg.position.set(-0.02+Math.sin(k*4.2)*0.03, 0.006+Math.sin(k*Math.PI)*0.012, 0.32-k*0.075);
      c.push(seg);
    }
    g.add(mergeStatic(c,beigePlasticDark));
    for(const m of c) m.geometry.dispose();
  }
  for(const arr of[[pale,beigePlastic],[dark,beigePlasticDark]]){
    g.add(mergeStatic(arr[0],arr[1]));
    for(const m of arr[0]) m.geometry.dispose();
  }
  g.scale.setScalar(scale);
  return g;
}
function makeDesk(cx0,cy0){
  /* the circulation desk: a long counter spanning its three cells, the
     terminal at its middle under the one dependable lamp in the building */
  const g=new THREE.Group();
  const p=cellToWorld2(cx0,cy0);
  g.position.set(p.x,0,p.z);
  /* An eleven-metre slab with one 4m tile smeared over it was the largest
     untextured surface in the building. It is panelled now: a recessed
     field between stiles on the public face, a counter with a nosing and a
     raised transaction ledge, and a plinth it stands on. */
  const len=3*CELL-1.2, front=[], up=[];
  up.push(woodBox(len,1.12,1.7, 0,0.56,0));                       // the carcass
  const nP=7, pw=(len-0.2)/nP;
  for(let i=0;i<nP;i++){                                          // stiles between panels
    const x=-len/2+0.1+pw*i;
    up.push(woodBox(0.10,1.04,0.05, x,0.60,0.868));
  }
  up.push(woodBox(0.10,1.04,0.05, len/2-0.1,0.60,0.868));
  front.push(woodBox(len,0.07,0.055, 0,1.09,0.868));              // top and bottom rails
  front.push(woodBox(len,0.09,0.055, 0,0.145,0.868));
  front.push(woodBox(len+0.30,0.07,1.95, 0,1.155,0));             // the counter
  front.push(woodBox(len+0.34,0.035,1.99, 0,1.108,0));            // its nosing
  front.push(woodBox(len-1.0,0.09,0.40, 0,1.235,-0.62));          // the transaction ledge
  for(const arr of[[front,deskMatH],[up,deskMat]]){
    g.add(mergeStatic(arr[0],arr[1]));
    for(const m of arr[0]) m.geometry.dispose();
  }
  const kick=new THREE.Mesh(scaleBoxUV(new THREE.BoxGeometry(len,0.16,1.74),len,0.16,1.74,0.9),
    new THREE.MeshPhongMaterial({map:texShelfWood, color:0x6a5238, specular:0x000000, shininess:2}));
  kick.position.y=0.08; g.add(kick);
  /* the terminal, facing the south approach (toward the elevator) */
  const pc=makeVintagePC(1);
  pc.position.set(0,1.19,0.1); g.add(pc);
  /* a gooseneck lamp pooled over it — the heart of the library stays lit */
  const lampArm=new THREE.Mesh(new THREE.CylinderGeometry(0.02,0.02,0.7,6),darkMetalMat);
  lampArm.position.set(0.85,1.54,-0.2); lampArm.rotation.z=0.5; g.add(lampArm);
  const shade=new THREE.Mesh(new THREE.ConeGeometry(0.14,0.18,10,1,true),darkMetalMat);
  shade.position.set(0.62,1.86,-0.2); shade.rotation.z=0.5; g.add(shade);
  const bulb=new THREE.Mesh(new THREE.SphereGeometry(0.05,8,8),
    new THREE.MeshBasicMaterial({color:0xffd9a0}));
  bulb.position.set(0.6,1.82,-0.2); g.add(bulb);
  const lamp=new THREE.PointLight(0xffcf92,0.85,9,1.9);
  lamp.position.set(0.55,2.0,-0.1); g.add(lamp);
  /* scattered returns: a tray and a stack of slips */
  const tray=new THREE.Mesh(new THREE.BoxGeometry(0.5,0.07,0.34),beigePlasticDark);
  tray.position.set(-1.4,1.23,0.2); g.add(tray);
  /* lamp + bulb ride out with the handle: the terminal cutscene kills them
     at the blackout beat (they were unreachable locals before — the one
     dependable light in the building used to survive "every light lets go") */
  return {group:g, pc, lamp, bulbMat:bulb.material};
}
/* ---- a hanging twin-tube strip light, chained down from the high dark ----
   It used to be a flat slab with two sticks under it: from directly below —
   which is how you see a hundred of them — a lit rectangle with no depth,
   and from the side a floating plank. It is a REFLECTOR now: a pressed
   spine with two wings splayed down and out to throw the tubes' light, end
   caps closing the trough, sockets over the glass ends, and a guard cage
   slung underneath. All of that is galvanized sheet, so it merges to ONE
   mesh; only the backplate and the tubes stay separate, because lights.js
   repaints their materials every frame. Three draws a fixture — half of
   what the flat slab cost, with five times the hardware on it.

   The wings are placed by their EDGES, not by eye: a plate's local +z under
   a rotation θ about x points at (y=−sinθ, z=cosθ), so hinging one at the
   spine's z edge and running it out along that direction lands the outer
   edge exactly where the trough should open. */
const tubeGeo2=new THREE.CylinderGeometry(0.036,0.036,2.0,8,1,true); tubeGeo2.rotateZ(Math.PI/2);
const housingMat2=new THREE.MeshPhongMaterial({map:texGalv,color:0x7c8078,emissive:0x070706,
  specular:0x3a3c36,shininess:40});
const FIX_LEN=2.2, WING_A=0.5, WING_W=0.115;
/* the turned hardware, built once for the whole building */
const SOCK_GEO=new THREE.CylinderGeometry(0.052,0.052,0.07,8); SOCK_GEO.rotateZ(Math.PI/2);
const GUARD_GEO=new THREE.CylinderGeometry(0.009,0.009,FIX_LEN-0.06,4); GUARD_GEO.rotateZ(Math.PI/2);
const RIB_GEO=new THREE.CylinderGeometry(0.009,0.009,0.40,4); RIB_GEO.rotateX(Math.PI/2);
const CORD_GEO=new THREE.CylinderGeometry(0.013,0.013,1,5);
const EYE_GEO=new THREE.TorusGeometry(0.032,0.008,4,10);
const SHELL_GEOS=new Set([SOCK_GEO,GUARD_GEO,RIB_GEO,CORD_GEO,EYE_GEO]);
/* every shell member: [w,h,d, x,y,z, rotX] with y measured from the hang line */
const boxAt=(w,h,d,x,y,z,rx,m)=>{
  const b=new THREE.Mesh(scaleBoxUV(new THREE.BoxGeometry(w,h,d),w,h,d,m||0.5));
  b.position.set(x,y,z); if(rx) b.rotation.x=rx;
  return b;
};
function fixtureShell(FY){
  const parts=[];
  parts.push(boxAt(FIX_LEN,0.06,0.30, 0,FY+0.125,0));                       // reflector spine
  for(const s of[-1,1]){                                                     // the two wings
    const cz=s*(0.15+WING_W/2*Math.cos(WING_A)), cy=FY+0.095-WING_W/2*Math.sin(WING_A);
    parts.push(boxAt(FIX_LEN,0.016,WING_W, 0,cy,cz, s*WING_A));
    parts.push(boxAt(0.05,0.24,0.46, s*(FIX_LEN/2+0.02),FY+0.055,0));        // end cap
  }
  /* sockets: the lampholders the glass plugs into, one per tube end */
  for(const sx of[-1,1])for(const tz of[-0.09,0.09]){
    const m=new THREE.Mesh(SOCK_GEO); m.position.set(sx*1.015,FY-0.02,tz); parts.push(m);
  }
  /* the guard: four rods the length of the trough on three cross ribs */
  for(const rz of[-0.16,-0.055,0.055,0.16]){
    const m=new THREE.Mesh(GUARD_GEO); m.position.set(0,FY-0.115,rz); parts.push(m);
  }
  for(const rx of[-0.72,0,0.72]){
    const m=new THREE.Mesh(RIB_GEO); m.position.set(rx,FY-0.113,0); parts.push(m);
  }
  /* the drop: a rod to the ceiling off each end, with an eye at the fixture
     and a fixing plate where it meets the dark */
  const cordLen=LIB_WALL_H-(FY+0.16);
  for(const sx of[-0.95,0.95]){
    const c=new THREE.Mesh(CORD_GEO);
    c.scale.y=cordLen; c.position.set(sx,FY+0.16+cordLen/2,0); parts.push(c);
    const e=new THREE.Mesh(EYE_GEO); e.position.set(sx,FY+0.17,0); parts.push(e);
    parts.push(boxAt(0.14,0.02,0.14, sx,LIB_WALL_H-0.01,0));
  }
  const shell=mergeStatic(parts,housingMat2);
  /* only the boxes were built for this fixture; the turned parts are
     module-level and shared by every strip in the building */
  const own=new Set(); for(const p of parts) if(!SHELL_GEOS.has(p.geometry)) own.add(p.geometry);
  for(const gg of own) gg.dispose();
  return shell;
}
function makeFixture(wx,wz,alongZ,fy=3.78){     // base layer hung +20% higher (3.15→3.78) to widen each pool against the new dropoff
  const g=new THREE.Group();
  const glowMat=new THREE.MeshBasicMaterial({color:0x111008});
  const tubeMat=new THREE.MeshBasicMaterial({map:tubeTex, color:0x111008});
  const FY=fy;                                     // hung this high; the cord reaches up from here to the ceiling
  g.add(fixtureShell(FY));
  const plate=new THREE.Mesh(new THREE.PlaneGeometry(2.14,0.29),glowMat);
  plate.rotation.x=Math.PI/2; plate.position.y=FY+0.088; g.add(plate);
  {
    const t=[];
    for(const tz of[-0.09,0.09]){
      const tube=new THREE.Mesh(tubeGeo2); tube.position.set(0,FY-0.02,tz); t.push(tube);
    }
    g.add(mergeStatic(t,tubeMat));                 // both tubes, one draw, one material
  }
  g.position.set(wx,0,wz);
  if(alongZ) g.rotation.y=Math.PI/2;
  return {group:g, glowMat, tubeMat, fixY:FY-0.35};
}

/* ---------------- the way down ----------------
   A round shaft behind the desk with a stone spiral stair winding down its
   wall and a blue glow/fog swallowing the depth: you can read 2–3 turns of
   stair before the light gives out. Built with the level and kept invisible
   under the carpet plug; the terminal ending's dig reveals it. */
const HOLE_R=2.7, HOLE_DEPTH=22;
const STAIR_RISE=4.48, STAIR_STEPS=16;           // rise per revolution / steps per revolution
function buildHole(hc,carpetMat){
  const SZ=LW*CELL;
  /* packed earth & old stone — local to the shaft, nothing above ever uses it */
  const texStone=makeCanvas(128,128,(g,w,h)=>{
    g.fillStyle="#242019"; g.fillRect(0,0,w,h);
    for(let i=0;i<900;i++){
      const v=18+Math.random()*30;
      g.fillStyle=`rgba(${v+10|0},${v+5|0},${v|0},${0.25+Math.random()*0.4})`;
      g.fillRect(Math.random()*w,Math.random()*h,1+Math.random()*3,1+Math.random()*2);
    }
    for(let i=0;i<22;i++){                       // strata seams
      g.strokeStyle=`rgba(8,7,5,${0.2+Math.random()*0.3})`; g.lineWidth=1;
      const y=Math.random()*h; g.beginPath(); g.moveTo(0,y);
      for(let x=0;x<=w;x+=8) g.lineTo(x,y+Math.sin(x*0.2+i)*2+Math.random()*2);
      g.stroke();
    }
  });
  texStone.wrapS=texStone.wrapT=THREE.RepeatWrapping;
  const g=new THREE.Group();
  g.visible=false;
  /* shaft wall, seen from inside; slightly belled so the depths read wider.
     THE NEST's rock, like the treads, and for the same reason: this is the
     bore you walk down and step off the bottom of onto the cave's own
     continuation of it. The local packed-earth canvas it used to wear was
     128² at repeat(6,4) — 44 px/m around and 23 px/m down, the lowest
     resolution of any surface in the game — and its "strata" were fourteen
     full-width sine curves, which is precisely the pass texCaveRock's own
     header was written to bury: at tiling scale they read as dark worms
     crawling round the shaft. texCaveRock is 512², seam-safe (everything in
     it is drawn wrapped), fractures instead of undulating, and carries the
     grain that lets it double as its own bump map. repeat.x stays an
     INTEGER — the cylinder's u wraps, and a fractional rate puts a hard
     vertical cut down the full 22m of wall. */
  const shaftTex=texCaveRock.clone(); shaftTex.needsUpdate=true; shaftTex.repeat.set(6,7.6);
  /* No colour tint: texCaveRock is a dark, deliberately low-contrast map
     (built to be read at arm's length under a fungus colony), and the only
     things lighting 22m of shaft are four dim blue points. Multiplying it
     down as well left a flat teal field with the detail buried. The bump is
     carried hard (0.16) because raking blue light across the joints is the
     only thing here that says how far away the far wall is. */
  const shaftMat=new THREE.MeshPhongMaterial({map:shaftTex, bumpMap:shaftTex, bumpScale:0.16,
    specular:0x14181e, shininess:10,
    emissive:0x070c11, side:THREE.BackSide});
  const shaft=new THREE.Mesh(
    new THREE.CylinderGeometry(HOLE_R+0.05,HOLE_R+0.4,HOLE_DEPTH,40,1,true),shaftMat);
  shaft.position.set(hc.x,-HOLE_DEPTH/2,hc.z); g.add(shaft);
  /* the stair: chunky stone treads hugging the wall, one merged mesh.
     Entry tread on the south rim (the desk side — where you arrive from).
     These are THE NEST's slabs: the same rock map, the same bump, the same
     world-scaled UVs. They have to be — you walk down this flight and step
     off the bottom of it onto the cave's own continuation of it, and the
     old local packed-earth canvas at raw box UVs crammed a 4m tile onto a
     1.25m tread, which averaged out to a flat grey slab with no grain. */
  const stepMat=new THREE.MeshPhongMaterial({map:texCaveRock, bumpMap:texCaveRock,
    bumpScale:0.06, color:0x525a63, emissive:0x0a1017, specular:0x141a22, shininess:8});
  const stair={a0:Math.PI/2, dir:1, rc:HOLE_R-0.62, rise:STAIR_RISE, steps:STAIR_STEPS,
               n:Math.round(4.5*STAIR_STEPS)};
  {
    const stepGeo=scaleBoxUV(new THREE.BoxGeometry(1.3,0.24,1.05),1.3,0.24,1.05,2);
    const steps=[];
    const n=stair.n;                             // ~4½ turns; the glow takes the rest
    for(let i=0;i<n;i++){
      const th=stair.a0+stair.dir*i*(Math.PI*2/STAIR_STEPS);
      const m=new THREE.Mesh(stepGeo,stepMat);
      m.position.set(hc.x+Math.cos(th)*stair.rc, -0.14-i*(STAIR_RISE/STAIR_STEPS),
                     hc.z+Math.sin(th)*stair.rc);
      m.rotation.y=-th;                          // tread runs tangentially
      steps.push(m);
    }
    g.add(mergeStatic(steps,stepMat));
    stepGeo.dispose();
  }
  /* the blue glow/fog: stacked translucent discs, denser with depth — from
     above they composite into a luminous murk that swallows the stair */
  const glow=[];
  [[-2.5,0.05],[-5,0.10],[-7.5,0.17],[-10,0.28],[-13,0.46],[-16,0.68],[-19,0.9]]
  .forEach(([y,op],i,arr)=>{
    const c=new THREE.Color(0x2b4c66).lerp(new THREE.Color(0x63ccff),i/(arr.length-1));
    const m=new THREE.MeshBasicMaterial({color:c, transparent:true, opacity:op,
      depthWrite:false, side:THREE.DoubleSide});
    const d=new THREE.Mesh(new THREE.CircleGeometry(HOLE_R+0.04,36),m);
    d.rotation.x=-Math.PI/2; d.position.set(hc.x,y,hc.z);
    glow.push({mat:m, baseOp:op}); g.add(d);
  });
  const cap=new THREE.Mesh(new THREE.CircleGeometry(HOLE_R+0.45,40),
    new THREE.MeshBasicMaterial({color:0x0c2836}));
  cap.rotation.x=-Math.PI/2; cap.position.set(hc.x,-HOLE_DEPTH+0.1,hc.z); g.add(cap);
  /* the rim: a ring of disturbed earth and flung dirt breaking the carpet edge */
  const dirtMat=new THREE.MeshPhongMaterial({map:texStone, color:0x9a7c56,
    specular:0x0c0a08, shininess:4});
  const ring=new THREE.Mesh(new THREE.RingGeometry(HOLE_R-0.02,HOLE_R+0.95,40),dirtMat);
  ring.rotation.x=-Math.PI/2; ring.position.set(hc.x,0.02,hc.z); g.add(ring);
  {
    const moundGeo=new THREE.SphereGeometry(1,7,5);
    const mounds=[];
    for(let i=0;i<14;i++){
      const a=i/14*Math.PI*2+rand(-0.25,0.25), rr=HOLE_R+rand(0.25,1.05);
      const m=new THREE.Mesh(moundGeo,dirtMat);
      const s=rand(0.16,0.42);
      m.scale.set(s,s*rand(0.32,0.5),s*rand(0.8,1.3));
      m.position.set(hc.x+Math.cos(a)*rr, 0.02, hc.z+Math.sin(a)*rr);
      m.rotation.y=rand(0,Math.PI*2);
      mounds.push(m);
    }
    g.add(mergeStatic(mounds,dirtMat));
    moundGeo.dispose();
  }
  /* the glow leaks: lights in the throat and one washing up over the rim.
     They live OUTSIDE the hidden group, in the scene and awake-but-dark from
     the first frame: revealing the hole must never change the scene's light
     count, because that forces three.js to recompile every shader program at
     once — a hard mid-cutscene hitch right as the dust began to clear. The
     reveal cutscene breathes their intensity up from 0. */
  const holeLights=[];
  [[1.6,0.55,9],[-2.6,1.35,11],[-8.5,1.2,12],[-14,0.9,12]].forEach(([y,I,dist])=>{
    const l=new THREE.PointLight(0x54bcf2,0,dist,1.7);
    l.position.set(hc.x,y,hc.z); scene.add(l);
    holeLights.push({l,I});
  });
  /* a dormant sprite keeps the dig dust's shader program in the pre-warmed
     set (the FX pool is created mid-cutscene, too late to compile cheaply) */
  const spr=new THREE.Sprite(new THREE.SpriteMaterial({map:texStone, transparent:true, opacity:0}));
  spr.scale.set(0.001,0.001,1); spr.position.set(hc.x,-2,hc.z); g.add(spr);
  renderer.initTexture(texStone); renderer.initTexture(shaftTex);
  renderer.initTexture(texCaveRock);         // the treads' map — first upload here, not at the reveal
  scene.add(g);
  /* the plug: a carpet-matched disc hiding all of it until the dig */
  const plugGeo=new THREE.CircleGeometry(HOLE_R+0.14,44);
  {
    const uv=plugGeo.attributes.uv, ps=plugGeo.attributes.position;
    for(let i=0;i<uv.count;i++)
      uv.setXY(i,(hc.x+ps.getX(i)+SZ/2)/SZ,(SZ/2-hc.z+ps.getY(i))/SZ);
  }
  const plug=new THREE.Mesh(plugGeo,carpetMat);
  plug.rotation.x=-Math.PI/2; plug.position.set(hc.x,0.006,hc.z);
  scene.add(plug);
  LIB.hole={x:hc.x, z:hc.z, r:HOLE_R, depth:HOLE_DEPTH, group:g, plug, lights:holeLights, glow, stair};
}
/* the dig breaks through: swap the carpet plug for the open shaft. The
   cutscene calls this at peak dust, so the pop is never seen; it also owns
   ramping LIB.hole.lights[].l.intensity up to their .I targets. */
export function revealHole(){
  const h=LIB.hole;
  if(!h||STATE.holeOpen) return;
  STATE.holeOpen=true;
  h.group.visible=true;
  if(h.plug){ scene.remove(h.plug); h.plug.geometry.dispose(); h.plug=null; }
}

/* ---------------- build ---------------- */
export function buildLibrary(){
  ensureBooks();                       // the design pool, built on first visit
  LIB.hole=null;
  LIB.weeping=false; LIB.weepT=0; LIB.weepPaint=0;
  LIB.obstacles=[]; LIB.pcAnims=[]; LIB.blackActive=false; LIB.blackElapsed=0; LIB.nextBlack=35;
  LIB.webs=[]; LIB.webGroup=new THREE.Group(); LIB.webGroup.userData.animated=true;   // strands spawn/reskin at runtime
  scene.add(LIB.webGroup);
  const {cx0,cy0,spawnC,tables}=genLibrary();
  const SZ=LW*CELL;
  /* a very faint warm self-glow on the walls & ceiling: not light to see BY,
     just enough that the dark spider reads as a silhouette against them */
  const libWallMat=new THREE.MeshPhongMaterial({map:texLibWall, specular:0x0c0b09, shininess:5,
    emissive:0x010101});
  /* floor & high ceiling. The carpet is cast with a circular hole already cut
     two cells behind the desk (the protected clearing keeps those cells open)
     — the librarian's way down. A carpet plug covers it seamlessly until the
     terminal ending digs it open (revealHole). */
  texLibCarpet.repeat.set(LW,LH); texLibCarpetBump.repeat.set(LW,LH);
  /* a whisper of specular: real broadloom is not matte, it just isn't shiny —
     without it the pile's bump has nothing to catch and the floor stays the
     flat plane it always was */
  const carpetMat=new THREE.MeshPhongMaterial({map:texLibCarpet,
    bumpMap:texLibCarpetBump, bumpScale:0.022, specular:0x0a0c10, shininess:3});
  const holeC=cellToWorld2(cx0,cy0-2);
  {
    const shape=new THREE.Shape();
    shape.moveTo(-SZ/2,-SZ/2); shape.lineTo(SZ/2,-SZ/2);
    shape.lineTo(SZ/2,SZ/2);   shape.lineTo(-SZ/2,SZ/2);
    const hp=new THREE.Path();
    hp.absarc(holeC.x,-holeC.z,HOLE_R,0,Math.PI*2,true);   // shape y = −world z (the −π/2 roll)
    shape.holes.push(hp);
    const fg=new THREE.ShapeGeometry(shape,48);
    /* remap UVs to the mapping a full SZ×SZ plane had, so the plug and the
       surrounding carpet tile as one uninterrupted surface */
    const uv=fg.attributes.uv, ps=fg.attributes.position;
    for(let i=0;i<uv.count;i++) uv.setXY(i,(ps.getX(i)+SZ/2)/SZ,(ps.getY(i)+SZ/2)/SZ);
    const floor=new THREE.Mesh(fg,carpetMat);
    floor.rotation.x=-Math.PI/2; scene.add(floor);
  }
  buildHole(holeC,carpetMat);
  texLibCeil.repeat.set(LW/2,LH/2);
  const ceilMat=new THREE.MeshPhongMaterial({map:texLibCeil, specular:0x000000, shininess:1, emissive:0x020100});
  ceilMat.emissive.setRGB(1.25/255, 1.0/255, 0.75/255);  // hue nudged 75% from warm 0x020100 toward the neutral wall backlight (0x010101)
  ceilMat.emissiveIntensity=3.00;     // ceiling backlight brightness (renderer scales the emissive)
  const ceil=new THREE.Mesh(new THREE.PlaneGeometry(SZ,SZ), ceilMat);
  ceil.rotation.x=Math.PI/2; ceil.position.y=LIB_WALL_H; scene.add(ceil);
  /* perimeter walls — one cell is the crashed elevator's. UVs are scaled
     to 4m-per-tile world space so the plaster maps at one density on every
     box, however it's sized (this is what un-distorts the walls). */
  const exC=cx0, eyC=LH-1;
  const wallGeo2=scaleBoxUV(new THREE.BoxGeometry(CELL,LIB_WALL_H,CELL),CELL,LIB_WALL_H,CELL,4);
  const wallBoxes=[];
  for(let y=0;y<LH;y++)for(let x=0;x<LW;x++){
    if(grid2[y][x]!==1) continue;
    if(x===exC&&y===eyC) continue;
    const m=new THREE.Mesh(wallGeo2,libWallMat);
    const p=cellToWorld2(x,y);
    m.position.set(p.x,LIB_WALL_H/2,p.z);
    wallBoxes.push(m);
  }
  /* one merged mesh instead of ~80 wall draw calls (the elevator cell is
     already excluded above, so no post-build carve is needed here) */
  scene.add(mergeStatic(wallBoxes,libWallMat));
  wallGeo2.dispose();                        // its shape is now baked into the merged geometry
  /* the baseboard is real geometry now (a texture band can't survive
     world-scaled tiling): dark skirting strips along the inner perimeter,
     parted at the elevator doorway */
  {
    const bbMat=new THREE.MeshPhongMaterial({color:0x39301f, specular:0x0c0a06, shininess:8});
    const inner=ROOM_SPAN/2-CELL;                 // inner wall plane
    const bb=(w,d,x,z)=>{
      const m=new THREE.Mesh(new THREE.BoxGeometry(w,0.42,d),bbMat);
      m.position.set(x,0.21,z); scene.add(m);
    };
    const L=inner*2;
    bb(L,0.09, 0,-(inner-0.045));                 // north
    bb(0.09,L, -(inner-0.045),0);                 // west
    bb(0.09,L,  (inner-0.045),0);                 // east
    const door=ELEV.OPEN_W/2+0.45;                // skip the elevator portal
    const sw=(inner-door);
    bb(sw,0.09, -(door+sw/2), inner-0.045);       // south, left of the doors
    bb(sw,0.09,  (door+sw/2), inner-0.045);       // south, right of the doors
  }
  /* the crashed arrival cab, carved into the south wall */
  {
    const p=cellToWorld2(exC,eyC);
    const dp=new THREE.Vector3(p.x,0,p.z-CELL/2);
    /* `wrecked` is what makes this cab the one the brakes failed on rather
       than a second working elevator: the inspection hatch forced open and
       hanging into the car, the egg-crate short two bars, the back panel
       broken, one leaf out of its track. The 0.022 lean was all the damage
       it used to carry, and a lean on its own just reads as sloppy build. */
    const elev=makeElevator(dp,Math.PI,{wallH:LIB_WALL_H, wallMat:libWallMat, uvTile:4,
                                        wrecked:true});
    elev.rotation.z=0.022;                       // it did not land well
    scene.add(elev);
    LIB.elev=elev;
    addInteractable({kind:"deadElev", mesh:elev, label:"CALL ELEVATOR", taken:false});
    LIB.spawn=new THREE.Vector3(dp.x, 0, dp.z-2.6);
    LIB.spawnYaw=0;                              // facing -z: into the library
  }
  /* shelf runs */
  for(const run of LIB.runs) scene.add(makeShelfRun(run));
  /* free-standing prop spacing: nothing may spawn touching (or inside)
     anything already placed — a clear hand-span between colliders. The dig
     zone stays bare too: nothing may sit over (or lean into) the hidden hole. */
  const clearOf=(x,z,r)=>Math.hypot(x-holeC.x,z-holeC.z)>=HOLE_R+r+0.7 &&
    LIB.obstacles.every(o=>Math.hypot(x-o.x,z-o.z)>=o.r+r+0.25);
  /* tables + chairs + the occasional vintage machine */
  const pcTables=new Set();
  while(pcTables.size<Math.min(8,tables.length)) pcTables.add(Math.floor(srand()*tables.length));
  let eggArmed=false;
  tables.forEach((tc,i)=>{
    const p=cellToWorld2(tc.x,tc.y);
    const tb=makeTable();
    tb.position.set(p.x,0,p.z); tb.rotation.y=Math.floor(srand()*2)*Math.PI/2;
    scene.add(tb);
    const nCh=srand()<0.85? 1+Math.floor(srand()*3) : 0;
    for(let c=0;c<nCh;c++){
      const ang=srand()*Math.PI*2;
      const cx=p.x+Math.sin(ang)*2.2, cz=p.z+Math.cos(ang)*2.2;
      if(!clearOf(cx,cz,0.34)) continue;           // a chair already sits there
      const ch=makeChair(srand()<0.35);
      ch.position.set(cx,0,cz);
      ch.rotation.y=ang+Math.PI+(srand()-0.5)*0.6;
      scene.add(ch);
      LIB.obstacles.push({x:cx, z:cz, r:0.34});
    }
    if(pcTables.has(i)){
      const pc=makeVintagePC(0.85);
      pc.position.set(p.x+rand(-0.7,0.7),1.345,p.z+rand(-0.5,0.5));
      pc.rotation.y=srand()*Math.PI*2;
      scene.add(pc);
      if(!eggArmed){
        /* exactly one of them still has a breath left in it */
        eggArmed=true;
        addInteractable({kind:"deadpc", mesh:pc, label:"PRESS THE POWER SWITCH", taken:false});
      }
    }
  });
  /* the librarian's desk + terminal */
  {
    const d=makeDesk(cx0,cy0);
    scene.add(d.group);
    LIB.deskPos=new THREE.Vector3().copy(d.group.position);
    LIB.term={group:d.group, pc:d.pc, screen:d.pc.userData.screen,
              lamp:d.lamp, bulbMat:d.bulbMat};
    addInteractable({kind:"terminal", mesh:d.group,
      label:()=> STATE.discsCarried>0
        ? `FEED THE TERMINAL (${STATE.discsCarried} DISK${STATE.discsCarried>1?"S":""})`
        : "THE TERMINAL IS DARK", taken:false});
  }
  /* ladders: leant against the stacks, base set back exactly far enough
     that the rails rest on the top edge */
  let placed=0;
  for(let t=0;t<900&&placed<24;t++){
    const run=LIB.runs[Math.floor(srand()*LIB.runs.length)];
    if(!run) break;
    const c=run.cells[Math.floor(srand()*run.cells.length)];
    const [dx,dy]=run.axis===0? [0,srand()<0.5?1:-1] : [srand()<0.5?1:-1,0];
    if(!LIB.reach.has(K(c.x+dx,c.y+dy))) continue;
    const p=cellToWorld2(c.x,c.y);
    const lx=p.x+dx*LADDER_B, lz=p.z+dy*LADDER_B;
    if(!clearOf(lx,lz,0.42)) continue;
    const lad=makeLadder();
    lad.position.set(lx,0,lz);
    lad.rotation.y=Math.atan2(-dx,-dy);
    scene.add(lad); placed++;
    LIB.obstacles.push({x:lx, z:lz, r:0.42});
  }
  /* free-standing floor population: lecterns, mannequins, return carts,
     dead globes — the smaller floor is the denser one now */
  const dropFloor=(maker,n,r)=>{
    for(let i=0;i<n;i++){
      /* a handful of tries per object: skip rather than overlap */
      let px=null,pz=null;
      for(let t=0;t<12;t++){
        const c=LIB.reachList[Math.floor(srand()*LIB.reachList.length)];
        const p=cellToWorld2(c.cx,c.cy);
        const x=p.x+rand(-1,1), z=p.z+rand(-1,1);
        if(!clearOf(x,z,r)) continue;
        px=x; pz=z; break;
      }
      if(px===null) continue;
      const o=maker();
      o.position.set(px,0,pz);
      o.rotation.y=srand()*Math.PI*2;
      scene.add(o);
      LIB.obstacles.push({x:px, z:pz, r});
    }
  };
  dropFloor(makeLectern,12,0.36);
  dropFloor(makeMannequin,9,0.3);
  dropFloor(makeBookCart,8,0.52);
  dropFloor(makeGlobe,5,0.34);
  /* wall dressing: posters, cracks, and the level's name — meaninglessly.
     The stretch of south wall holding the crashed cab stays bare: nothing
     may spawn over (or hang beside) the elevator. */
  const wallFaces=[];
  /* a face is only dressable if the cell in FRONT of it is open: a shelf run
     that anchors into the perimeter fills the cell against the wall, and
     anything hung there — a poster, and now a 70mm-deep frame — grows out
     through the end of the stack */
  const faceOK=(cx,cy)=>grid2[cy]&&grid2[cy][cx]===0;
  for(let x=1;x<LW-1;x++){
    if(faceOK(x,1))
      wallFaces.push({x:cellToWorld2(x,0).x,      z:cellToWorld2(x,0).z+CELL/2+0.03,  ry:0});
    if(Math.abs(x-exC)>1&&faceOK(x,LH-2))
      wallFaces.push({x:cellToWorld2(x,LH-1).x,   z:cellToWorld2(x,LH-1).z-CELL/2-0.03, ry:Math.PI});
  }
  for(let y=1;y<LH-1;y++){
    if(faceOK(1,y))
      wallFaces.push({x:cellToWorld2(0,y).x+CELL/2+0.03,  z:cellToWorld2(0,y).z, ry:Math.PI/2});
    if(faceOK(LW-2,y))
      wallFaces.push({x:cellToWorld2(LW-1,y).x-CELL/2-0.03, z:cellToWorld2(LW-1,y).z, ry:-Math.PI/2});
  }
  for(let i=wallFaces.length-1;i>0;i--){
    const j=Math.floor(srand()*(i+1)); [wallFaces[i],wallFaces[j]]=[wallFaces[j],wallFaces[i]];
  }
  let fi=0;
  const take=()=>wallFaces[fi++%wallFaces.length];
  for(let i=0;i<7;i++){
    const f=take();
    const txt=new THREE.Mesh(new THREE.PlaneGeometry(3.4,0.85),
      new THREE.MeshPhongMaterial({map:makeEndTextTexture(), transparent:true,
        specular:0x000000, shininess:1}));
    txt.position.set(f.x,rand(1.4,5.2),f.z);
    txt.rotation.y=f.ry;
    const r=srand();
    if(r<0.14) txt.rotation.z=Math.PI;            // upside-down
    else if(r<0.24) txt.rotation.z=Math.PI/2;     // sideways
    else txt.rotation.z=(srand()-0.5)*0.06;
    scene.add(txt);
  }
  for(let i=0;i<12;i++){
    const f=take();
    const po=new THREE.Mesh(new THREE.PlaneGeometry(0.92,1.24),
      new THREE.MeshPhongMaterial({map:makePosterTexture(), specular:0x000000, shininess:2}));
    po.position.set(f.x,rand(1.3,2.6),f.z);
    po.rotation.y=f.ry; po.rotation.z=(srand()-0.5)*0.12;
    scene.add(po);
  }
  /* ---- the hang ----
     Nine families of almost-library pieces — donor portraits with no face,
     collection maps to nowhere, acuity charts that test something else,
     a staff photograph where the faces never developed — and twice as many
     of them as before, because 14 pictures spread evenly round a 400m
     perimeter is one every 28m, which is not a dressed wall, it is a wall
     with a picture on it.
     They go up in CLUSTERS, which is how a reading room actually hangs
     pictures and the only way the eye reads a wall as furnished: 2–5 pieces
     sharing a face, either on a common centre line or stacked in a block.
     Every cluster gets one piece well over a metre, and a few go up HIGH —
     the room is 24m to the ceiling and the old band stopped at 3.2m, which
     dressed the bottom eighth of it and left the rest bare plaster. */
  {
    const hung=[];                              // {x,z,y,w,h} — placed sight rects
    const bulk=new Map();                       // material → parts, merged room-wide
    /* 0.045, not 0.22: the cursor deliberately leaves a 0.10–0.19m gap
       between neighbours, so a separation margin wider than the gap it is
       checking rejects every second piece in every cluster — which is how
       a 34-picture hang quietly became a 10-picture one */
    const free=(f,t,y,w,h)=>{
      const x=f.dx*t+f.x, z=f.dz*t+f.z;
      return !hung.some(q=>Math.hypot(q.x-x,q.z-z)<(q.w+w)/2+0.045&&
                            Math.abs(q.y-y)<(q.h+h)/2+0.045);
    };
    let hangs=0;
    for(let c=0;c<18&&hangs<34;c++){
      const f=take();
      /* the wall's own tangent: forward is (sin ry, 0, cos ry), so the run
         along the face is (cos ry, 0, −sin ry) */
      f.dx=Math.cos(f.ry); f.dz=-Math.sin(f.ry);
      const n=2+Math.floor(srand()*4);
      const tall=srand()<0.30;                  // this cluster hangs high
      const midY=tall? rand(4.4,7.6) : rand(1.75,2.9);
      const line=srand()<0.5;                   // a common centre line, or a block
      /* the pieces are laid out with a running CURSOR, not on a fixed pitch:
         a salon hang leaves a hand's width between frames, and stepping by
         a constant ~1.5m scattered five pictures over five metres of wall,
         which is not a cluster, it is five pictures */
      const half=[];                            // signed order: 0, −1, +1, −2, +2 …
      for(let i=0;i<n;i++) half.push(i? (i%2? -Math.ceil(i/2) : Math.ceil(i/2)) : 0);
      let lft=0, rgt=0;                         // how far the hang already reaches each way
      for(let i=0;i<n&&hangs<34;i++){
        /* one piece per cluster is the big one; the rest are its company */
        const sw=i===0? (tall? rand(1.5,2.4) : rand(0.95,1.45))
                      : (srand()<0.35? rand(0.42,0.62) : rand(0.62,1.0));
        const p=makeFramedArt(sw);
        const gap=0.10+srand()*0.09;
        const tx=i===0? 0 : (half[i]<0? -(lft+gap+p.w/2) : (rgt+gap+p.w/2));
        const y=(line? midY : midY+rand(-0.55,0.55)*(tall?2.2:1))+(line?rand(-0.05,0.05):0);
        if(Math.abs(tx)+p.w/2>1.86||y-p.h/2<0.75||!free(f,tx,y,p.w,p.h)){
          p.g.traverse(o=>{ if(o.isMesh){ o.geometry.dispose();
            if(!SHARED_ART.has(o.material)){ if(o.material.map) o.material.map.dispose(); o.material.dispose(); } } });
          continue;
        }
        p.g.position.set(f.x+f.dx*tx, y, f.z+f.dz*tx);
        p.g.rotation.y=f.ry;
        p.g.rotation.z=(srand()-0.5)*0.045;     // nothing in this building is level
        scene.add(p.g);
        p.g.updateMatrixWorld(true);
        for(const[m,mat]of p.bulk){
          if(!bulk.has(mat)) bulk.set(mat,[]);
          bulk.get(mat).push(m);
        }
        hung.push({x:p.g.position.x, z:p.g.position.z, y, w:p.w, h:p.h});
        if(tx<=0) lft=Math.max(lft,-tx+p.w/2);   // the centre piece sets BOTH
        if(tx>=0) rgt=Math.max(rgt, tx+p.w/2);
        hangs++;
      }
    }
    /* collapse every frame, mat, backing and pane in the room down to one
       mesh per material — the whole reason a real moulding is affordable */
    for(const[mat,arr]of bulk){
      scene.add(mergeStatic(arr,mat));
      for(const m of arr){ if(m.parent) m.parent.remove(m); m.geometry.dispose(); }
    }
  }
  for(let i=0;i<11;i++){
    const f=take();
    const cr=new THREE.Mesh(new THREE.PlaneGeometry(rand(0.7,1.2),rand(2.2,3.6)),
      new THREE.MeshPhongMaterial({map:makeCrackTexture(), transparent:true,
        depthWrite:false, specular:0x000000, shininess:1}));
    cr.position.set(f.x,rand(2.2,6.2),f.z);
    cr.rotation.y=f.ry;
    scene.add(cr);
  }
  /* hanging lights: faulty and uneven, but no longer rare — and every one
     of them is a standard makeLightRecord, the same self-contained
     filament asset as level 0's troffers. The wider dimDen band means the
     strips idle a deep yellow; the burnout's warmth push drags the same
     pipeline on into orange-red. */
  for(let gy=2;gy<LH-2;gy+=3)for(let gx=2;gx<LW-2;gx+=3){
    /* marginal jitter: mostly grid-true, an occasional ±1 — softens the lattice without clustering */
    const x=clamp(gx+(srand()<0.6?0:(srand()<0.5?-1:1)),1,LW-2), y=clamp(gy+(srand()<0.6?0:(srand()<0.5?-1:1)),1,LH-2);
    if(grid2[y][x]!==0) continue;
    if(Math.abs(x-cx0)<2&&Math.abs(y-cy0)<2) continue;     // the desk gets its own
    if(x===cx0&&y===LH-3) continue;                         // …and so does the wreck apron
    if(srand()<0.19) continue;                              // a few dark slots remain
    const p=cellToWorld2(x,y);
    const fx=makeFixture(p.x,p.z,srand()<0.5);
    scene.add(fx.group);
    const warm=Math.random()<0.12;
    lights.push(makeLightRecord(fx.glowMat,fx.tubeMat,x,y,p,
      {warm, bright:warm?1:rand(0.72,0.92), dimDen:0.28,
       flickery:Math.random()<0.40, fixY:fx.fixY}));
  }
  /* v2.3: a second, higher tier of strips — same count, but scattered UP
     through the new air so the tall space doesn't read as empty. Elevations
     run from ~50% above the low strips (4.7m) to within a floor-to-strip gap
     of the ceiling. Offset half a grid step to intersperse with the low set. */
  {
    const HI_LO=3.15*1.5, HI_HI=LIB_WALL_H-3.15;
    for(let gy=3;gy<LH-2;gy+=3)for(let gx=3;gx<LW-2;gx+=3){
      /* fully even grid, NO xz jitter and NO random skip — every interior cell gets a
         strip, floating free above everything (clips nothing, never clusters). Only the
         elevation varies, so the layer reads as an even canopy at mixed heights. */
      if(Math.abs(gx-cx0)<2&&Math.abs(gy-cy0)<2) continue;     // the desk has its own beacon
      const fy=HI_LO+srand()*(HI_HI-HI_LO);
      const p=cellToWorld2(gx,gy);
      const fx=makeFixture(p.x,p.z,srand()<0.5,fy);
      scene.add(fx.group);
      const warm=Math.random()<0.12;
      lights.push(makeLightRecord(fx.glowMat,fx.tubeMat,gx,gy,p,
        {warm, bright:warm?1:rand(0.72,0.92), dimDen:0.28,
         flickery:Math.random()<0.40, fixY:fx.fixY}));
    }
  }
  /* two strips are never left dark or faulty: one over the desk (the beacon
     you steer by) and one over the wreck apron (the first to wake) */
  for(const[fcx,fcy]of[[cx0,cy0+1],[cx0,LH-3]]){
    const p=cellToWorld2(fcx,fcy);
    const fx=makeFixture(p.x,p.z,false);
    scene.add(fx.group);
    lights.push(makeLightRecord(fx.glowMat,fx.tubeMat,fcx,fcy,p,
      {warm:false, bright:1, flickery:false, fixY:fx.fixY}));
  }
  /* the intro wakes the grid in a wave rolling away from the elevator */
  for(const L of lights)
    L.wakeAt=0.4+Math.hypot(L.world.x-LIB.spawn.x,L.world.z-LIB.spawn.z)*0.055+Math.random()*0.3;
  /* ---- the floppy disks ---- */
  STATE.discTotal=15+Math.floor(srand()*6);                 // 15–20 (−3 min/max for a shorter hunt)
  const sites=[];
  for(const run of LIB.runs){
    const [dx,dy]=run.axis===0? [0,1] : [1,0];
    const n=run.cells.length;
    run.cells.forEach((c,i)=>{
      /* the cell centre in the run group's LOCAL frame (the axis-1 group is
         yawed +90°, which flips the along-run direction) */
      const lx=run.axis===0? (i-(n-1)/2)*CELL : ((n-1)/2-i)*CELL;
      for(const s of[1,-1]){
        if(!LIB.reach.has(K(c.x+dx*s,c.y+dy*s))) continue;
        /* only boards the books left open at this spot may hold a disk —
           a collectible buried inside a packed row is unfindable */
        const freeLv=[1,2,3].filter(lv=>{
          const occ=(run.occ&&run.occ[s+"|"+lv])||[];
          return !occ.some(([a,b])=>a<lx+0.17&&b>lx-0.17);
        });
        if(!freeLv.length) continue;
        const lv=freeLv[Math.floor(srand()*freeLv.length)];
        const p=cellToWorld2(c.x,c.y);
        sites.push({cx:c.x, cy:c.y,
          x:p.x+dx*s*(SHELF_D/2-0.18), z:p.z+dy*s*(SHELF_D/2-0.18),
          y:BOARD_TOP(lv)+0.02, kind:"shelf"});
      }
    });
  }
  for(const tc of tables){
    let near=false;
    for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]])
      if(LIB.reach.has(K(tc.x+dx,tc.y+dy))) near=true;
    if(!near) continue;
    const p=cellToWorld2(tc.x,tc.y);
    sites.push({cx:tc.x, cy:tc.y, x:p.x+rand(-0.8,0.8), z:p.z+rand(-0.6,0.6), y:1.37, kind:"table"});
  }
  for(let i=sites.length-1;i>0;i--){
    const j=Math.floor(srand()*(i+1)); [sites[i],sites[j]]=[sites[j],sites[i]];
  }
  const chosen=[];
  for(const s of sites){
    if(chosen.length>=STATE.discTotal) break;
    if(chosen.some(c=>Math.hypot(c.cx-s.cx,c.cy-s.cy)<2.5)) continue;
    chosen.push(s);
  }
  /* if spacing starved us below the minimum, relax it */
  for(const s of sites){
    if(chosen.length>=STATE.discTotal) break;
    if(chosen.includes(s)) continue;
    if(chosen.some(c=>Math.hypot(c.cx-s.cx,c.cy-s.cy)<1.5)) continue;
    chosen.push(s);
  }
  STATE.discTotal=chosen.length;                  // honest count if the map ran tight
  for(const s of chosen){
    const d=makeDisc();
    d.position.set(s.x,s.y,s.z);
    d.rotation.y=Math.random()*Math.PI*2;
    scene.add(d);
    addInteractable({kind:"disc", mesh:d, label:"TAKE FLOPPY DISK", taken:false, baseY:s.y});
  }
  /* freeze every static object's matrix (shelves, furniture, dressing,
     fixtures, merged walls). The spider is added after this returns; the discs
     and the elevator are tagged animated, so the sweep skips them. */
  freezeStaticScene();
  /* pre-warm every shader program and texture — the hidden hole's included —
     while the level is still behind the intro's black. First-use compilation
     at reveal time was a visible frame stall in the ending cutscene. */
  LIB.hole.group.visible=true;
  renderer.compile(scene,camera);
  LIB.hole.group.visible=false;
}

/* ---------------- per-frame level logic ---------------- */
/* ---------------- the librarian's silk ----------------
   Webs hang from the ceiling. A LIVE strand follows the spider as it shoots
   up to / rappels down from the ceiling; on severing it shrivels into a
   shorter, wavy coil that stays forever (they accumulate). None of them
   collide — they are pure dressing. */
const webMat=new THREE.MeshBasicMaterial({color:0xd9dee1, transparent:true,
  opacity:0.32, depthWrite:false});
/* a strand hanging from ceiling point `top`, `len` metres long. `wavy` (0..1)
   bows it out of plumb so a settled coil reads as silk, not wire. */
function buildStrand(top,len,wavy,seed){
  const N=10, pts=[];
  for(let i=0;i<=N;i++){
    const f=i/N;
    let ox=0, oz=0;
    if(wavy>0){
      const amp=wavy*0.22*Math.sin(f*Math.PI);          // bows most at the middle
      ox=Math.sin(seed*1.7+f*8.5)*amp;
      oz=Math.cos(seed*2.3+f*7.1)*amp;
    }
    pts.push(new THREE.Vector3(top.x+ox, top.y-len*f, top.z+oz));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),14,0.013,4,false);
}
function reskin(rec,len,wavy){
  if(rec.mesh.geometry) rec.mesh.geometry.dispose();
  rec.mesh.geometry=buildStrand(rec.top,len,wavy,rec.seed);
}
/* begin a live strand from ceiling `top` down to world point `bottom` */
export function spawnWeb(top,bottom){
  const rec={top:top.clone(), len:Math.max(0.1,top.y-bottom.y), botY:bottom.y,
             seed:Math.random()*99, live:true, dirty:false, sever:false,
             shrivelT:0, fullLen:0, finalLen:0};
  rec.mesh=new THREE.Mesh(buildStrand(rec.top,rec.len,0,rec.seed),webMat);
  LIB.webGroup.add(rec.mesh); LIB.webs.push(rec);
  return rec;
}
/* the spider has moved: re-anchor the live strand's lower end */
export function updateWeb(rec,bottomY){ if(rec&&rec.live){ rec.botY=bottomY; rec.dirty=true; } }
/* pull the strand back in (floor→ceiling ascent leaves no trace) */
export function removeWeb(rec){
  if(!rec) return;
  if(rec.mesh.geometry) rec.mesh.geometry.dispose();
  LIB.webGroup.remove(rec.mesh);
  LIB.webs=LIB.webs.filter(w=>w!==rec);
}
/* cut it loose at the floor: it shrivels to 40–70% length, bows, and stays */
export function severWeb(rec){
  if(!rec||!rec.live) return;
  rec.live=false; rec.sever=true; rec.shrivelT=0;
  rec.fullLen=Math.max(0.1,rec.top.y-rec.botY);
  rec.finalLen=rec.fullLen*rand(0.4,0.7);
}

const FOG_LIB=new THREE.Color(0x030404), FOG_HOLE=new THREE.Color(0x11303f);
export function updateLibrary(dt){
  /* the intro's wake-up wave clock */
  if(STATE.libWakeT>=0){
    STATE.libWakeT+=dt;
    if(STATE.libWakeT>14) STATE.libWakeT=-1;      // every fixture is long awake
  }
  /* 125 seconds after the first disk leaves its shelf, the building answers:
     every light drops to a quarter of its brightness and goes sodium-warm */
  if(!STATE.libDim && STATE.libFirstPickup>=0 && STATE.time-STATE.libFirstPickup>=125){
    STATE.libDim=true;
    /* deal each strip its burn: most settle at orange (warmth ≈1 is the
       brightest hue the grid will reach again), ~40% burn past it into
       deep red */
    for(const L of lights)
      L.burnW = Math.random()<0.4? rand(1.45,1.8) : rand(0.9,1.1);
    sfxLightsOut();
    escalateLibraryAmbience();
    hemi.color.setHex(0xffc890); hemi.groundColor.setHex(0x191008);
    amb.color.setHex(0x584024);
  }
  /* post-drop: an almost unnoticeable, slow sway in the world */
  STATE.shakeAmp=lerp(STATE.shakeAmp, STATE.libDim?0.013:0, Math.min(1,dt*0.5));
  /* the lights sometimes shut off temporarily — not all at once: over a 2s
     window each strip flickers for 1s at its own random moment, drops dark for
     the failure's length, then flicks back on. Each strip's blackMul (read in
     lights.js) carries its state; STATE.libBlackout stays reserved for the
     scripted cutscene black. */
  if(LIB.blackActive){
    LIB.blackElapsed+=dt;
    const tN=performance.now()/1000;
    const total=2+1+LIB.blackDur;                       // onset window + 1s flicker + dark
    for(const L of lights){
      const e=LIB.blackElapsed-(L.blackStart||0);
      if(e<=0) L.blackMul=1;                                                  // not its turn yet
      else if(e<1) L.blackMul=(hash(Math.floor(tN*22)+(L.seed||0))<e*0.85)? 0.04:1;  // 1s dying flicker
      else if(e<1+LIB.blackDur) L.blackMul=0.03;                             // out cold
      else L.blackMul=1;                                                      // flicked back on
    }
    if(LIB.blackElapsed>=total){ LIB.blackActive=false; for(const L of lights) L.blackMul=1; LIB.nextBlack=rand(45,70); }
  } else if(STATE.libWakeT<0){
    LIB.nextBlack-=dt;
    if(LIB.nextBlack<=0){
      LIB.blackActive=true; LIB.blackElapsed=0; LIB.blackDur=rand(1.3,2.6)*0.7;   // −30% time fully dark
      for(const L of lights) L.blackStart=Math.random()*2;                   // stagger the onset across 2s
      sfxLightsOut();
    }
  }
  /* decor machines mid-boot: seconds of life, then static, then never again */
  for(const a of LIB.pcAnims){
    a.t+=dt;
    if(a.phase==="boot"){
      a.screen.boot(Math.min(1,a.t*2.5));
      if(a.t>=1.6){ a.phase="static"; a.t=0; sfxComputerStatic(2.0); }
    } else if(a.phase==="static"){
      if(a.t-(a.last||0)>0.08){ a.last=a.t; a.screen.static(Math.max(0.05,1-a.t/2)); }
      if(a.t>=2.0){ a.phase="dead"; a.screen.dead(); }
    }
  }
  LIB.pcAnims=LIB.pcAnims.filter(a=>a.phase!=="dead");
  /* the terminal keeps crying once the cutscene hands you back — a tear
     frozen halfway down the glass is a picture, not a face */
  if(LIB.weeping&&LIB.term){
    LIB.weepT+=dt;
    if(LIB.weepT-LIB.weepPaint>0.085){ LIB.weepPaint=LIB.weepT; LIB.term.screen.warn(1,LIB.weepT); }
  }
  /* the open hole breathes: its glow discs swell and settle, out of phase */
  if(STATE.holeOpen&&LIB.hole){
    const tN=performance.now()/1000;
    LIB.hole.glow.forEach((gl,i)=>{ gl.mat.opacity=gl.baseOp*(1+0.10*Math.sin(tN*0.7+i*1.7)); });
    /* the shaft's own weather: the deeper you walk the stairs, the bluer and
       denser the fog — a couple of turns down the world is nearly gone.
       Pure function of depth, so climbing back up restores the library. */
    const sink=clamp(-STATE.y/8,0,1);
    scene.fog.color.copy(FOG_LIB).lerp(FOG_HOLE,sink);
    if(scene.background&&scene.background.isColor) scene.background.copy(scene.fog.color);
    scene.fog.near=lerp(10,2,sink);
    scene.fog.far=lerp(190,18,sink);
  }
  /* silk: live strands track the spider; severed ones shrivel once, then rest */
  for(const rec of LIB.webs){
    if(rec.live){
      if(rec.dirty){ rec.len=Math.max(0.1,rec.top.y-rec.botY); reskin(rec,rec.len,0); rec.dirty=false; }
    } else if(rec.sever){
      rec.shrivelT+=dt;
      const p=Math.min(1,rec.shrivelT/0.5);
      reskin(rec, lerp(rec.fullLen,rec.finalLen,p), p);
      if(p>=1) rec.sever=false;                          // settled — it stays forever
    }
  }
}
/* the one decor machine that still turns on — once */
export function startDeadPC(it){
  it.taken=true;
  sfxComputerBoot(0.5);
  const screen=it.mesh.userData.screen;
  LIB.pcAnims.push({screen, phase:"boot", t:0});
}

/* ---- shared-asset registration (module-level singletons reused across every
   library build; teardown must never dispose these) ---- */
markShared(texLibWall,texLibCarpet,texLibCarpetBump,texLibCeil,texShelfWood,texDeskWood,texPages,texPagesAged,texBrushed,
           texCaveRock,   // the way down is cut in THE NEST's rock (cave.js marks it too — the Set dedupes)
           texGalv,housingMat2,tubeGeo2,
           SOCK_GEO,GUARD_GEO,RIB_GEO,CORD_GEO,EYE_GEO);   // the strip lights' shared hardware
markShared(shelfMat,deskMat,shelfMatH,deskMatH,texShelfWoodH,texDeskWoodH,texBeige,
           darkMetalMat,beigePlastic,beigePlasticDark,plasticWrap,shutterMat,discHubMat,
           bookendMat,accentWood,accentBrass,mannequinMat,mannequinDark,webMat);
markShared(texWrapFilm,texTape,texCartPaint,texMannequin,             // the graphics pass's own
           wrapTapeMat,cartRubberMat,cartSteelMat,mannequinIron,
           ...cartPaintMats, frameGiltMat,frameEbonyMat,frameOakMat,artGlassMat,artMatMat,artBackMat);
