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
import { scene, camera, renderer, lights, hemi, amb, makeLightRecord, markShared, mergeStatic, freezeStaticScene, batchStatic, tubeTex } from "./scene.js";
import { makeCanvas, texLibWall, texLibCarpet, texLibCarpetBump, texLibCeil, texShelfWood, texDeskWood,
         texCaveRock, texGalv, texBeige, makeKeyboardTexture, KB_LAYOUT, makeFloppyTexture,
         makeCrackTexture, makeEndTextTexture, makePosterTexture, makeArtTexture,
         makeWrapTexture, texStretchFilm, FILM_BANDS, texTape, texCartPaint, texMannequin,
         makeBookCoverTexture, BOOK_TITLES, BOOK_BASES,
         makeArchiveBoxTexture, BOX_LABELS,
         texPages, texPagesAged, makeOpenPagesTexture, scaleBoxUV,
         texCork, texGhost, texClockFace, makePlaqueAtlas, texExitSign, texStaffSign,
         texWetFloor, makeCatalogTexture, CATALOG_COLS, CATALOG_ROWS, texPaperSheets, PAPER_UV,
         texShaftMasonry, texShaftMasonryBump, texSpoil, texSlabSection } from "./textures.js";
import { makeElevator, ELEV, addInteractable } from "./props.js";
import { makeDustSystem, makeDebris } from "./particles.js";
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
/* …and on the inside, the rail: nothing but the drop past it. Only the body
   is kept out (not its full radius) — the treads are a narrow flight. */
export function shaftClamp(x,z,py,pr){
  const h=LIB.hole;
  if(!h||!STATE.holeOpen||py>-0.05) return null;
  const dx=x-h.x, dz=z-h.z, r=Math.hypot(dx,dz), max=h.r-pr+0.05, min=STAIR.RAIL_R+0.28;
  if(r<1e-4) return {x:h.x+min, z:h.z};
  if(r>max) return {x:h.x+dx/r*max, z:h.z+dz/r*max};
  if(r<min) return {x:h.x+dx/r*min, z:h.z+dz/r*min};
  return null;
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
/* Film is clear face-on and goes silvery where it turns away from you — the
   thinner the angle, the more sheet the eye looks through. Without that edge
   the wrap had no surface at all, only its creases, and a chair in film read
   as a chair with a few scratches floating round it. The sheen is scaled by
   the light actually falling on the film, so in the dark it stays dark. */
function filmCompile(sh){
  sh.uniforms.uFilmEdge={value:this.userData.filmEdge};
  sh.fragmentShader=sh.fragmentShader
    .replace("#include <common>","#include <common>\nuniform float uFilmEdge;")
    .replace("#include <tonemapping_fragment>",
`{ float fres=pow(1.0-abs(dot(normalize(vViewPosition),normal)),2.2);
  float lit=dot(reflectedLight.directDiffuse+reflectedLight.indirectDiffuse,vec3(0.3333));
  gl_FragColor.a=clamp(gl_FragColor.a+fres*uFilmEdge,0.0,0.9);
  gl_FragColor.rgb+=fres*lit*0.6; }
#include <tonemapping_fragment>`);
}
plasticWrap.userData.filmEdge=0.3; plasticWrap.onBeforeCompile=filmCompile;
/* stretch film is two sheets to the eye — the near face and the far one
   seen through it — so it draws as two meshes, the inside first */
const filmMat=side=>{
  const m=new THREE.MeshPhongMaterial({map:texStretchFilm, color:0xe4ecef, specular:0xd0dadd,
    shininess:110, transparent:true, depthWrite:false, side});
  m.userData.filmEdge=side===THREE.BackSide? 0.32 : 0.5; m.onBeforeCompile=filmCompile;
  return m;
};
const filmBack=filmMat(THREE.BackSide), filmFront=filmMat(THREE.FrontSide);
/* A chair in stretch film. Not a bag: film WOUND round it, so it takes the
   chair's own shape — tight round the seat, drawn diagonally from the top
   of the back down to the seat's front edge, folded over the top rail —
   and it stops short of the floor in a ragged hem with the legs showing
   under it. The sections follow the chair built by makeChair. */
function makeChairWrap(){
  const g=new THREE.Group();
  const NU=40, NV=24, Y0=0.13, YS=0.5, YT=1.06, YF=1.1, N=5;
  const ph=Math.random()*9, ph2=Math.random()*9;
  const sect=y=>{
    if(y<=YS) return {a:0.262, zf:0.245, zb:-0.24, t:0};
    if(y<=YT){ const t=(y-YS)/(YT-YS); return {a:lerp(0.262,0.25,t), zf:lerp(0.245,-0.135,t), zb:-0.235, t}; }
    const t=(y-YT)/(YF-YT); return {a:lerp(0.25,0.235,t), zf:lerp(-0.135,-0.19,t), zb:lerp(-0.235,-0.19,t), t:1};
  };
  const pos=[], uv=[], idx=[];
  for(let j=0;j<=NV;j++)for(let i=0;i<=NU;i++){
    const u=i/NU, th=u*Math.PI*2, c=Math.cos(th), s=Math.sin(th);
    let y=Y0+(YF-Y0)*j/NV;
    if(j===0) y+=0.025*Math.sin(th*4+ph)+0.015*Math.sin(th*9+ph2);     // the ragged hem
    const S=sect(y), zc=(S.zf+S.zb)/2, b=(S.zf-S.zb)/2;
    const sx=Math.sign(c)*Math.pow(Math.abs(c),2/N), sz=Math.sign(s)*Math.pow(Math.abs(s),2/N);
    /* slack: the drape sags in toward the chair, the turns stand a hair
       proud at their edges, and nothing is perfectly true */
    const v=j/NV, band=((v*FILM_BANDS-u)%1+1)%1;
    let d=0.005*Math.sin(th*3+ph+y*7)+0.003*Math.sin(th*7+y*13+ph2)+0.003*Math.exp(-Math.pow(Math.min(band,1-band)*14,2));
    if(y>YS&&y<YT) d-=0.03*Math.sin(Math.PI*S.t)*Math.pow(Math.max(0,s),2);
    const k=1+d/Math.max(0.05,Math.hypot(S.a*sx,b*sz));
    pos.push(S.a*sx*k, y, zc+b*sz*k);
    uv.push(u, v);
  }
  const R=NU+1;
  for(let j=0;j<NV;j++)for(let i=0;i<NU;i++){
    const A=j*R+i, B=A+1, C=A+R, D=C+1;
    idx.push(A,C,B, B,C,D);                       // outward-facing
  }
  /* the cut tail of the last turn, hanging off one side */
  {
    const tx=(Math.random()<0.5?-1:1)*0.268, y0=rand(0.36,0.5), len=rand(0.28,0.42), o=pos.length/3;
    for(let k=0;k<=6;k++){
      const t=k/6, tw=Math.sin(t*2.2)*0.03;
      for(const e of[-1,1]){
        pos.push(tx+Math.sign(tx)*(0.006+t*0.03)+tw, y0-t*len, rand(-0.02,0.02)+e*(0.065-t*0.02));
        uv.push(e>0?0.08:0.0, 0.5-t*0.4);
      }
    }
    for(let k=0;k<6;k++){ const A=o+k*2; idx.push(A,A+1,A+2, A+1,A+3,A+2); }
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute("position",new THREE.Float32BufferAttribute(pos,3));
  geo.setAttribute("uv",new THREE.Float32BufferAttribute(uv,2));
  geo.setIndex(idx); geo.computeVertexNormals();
  const back=new THREE.Mesh(geo,filmBack), front=new THREE.Mesh(geo,filmFront);
  back.renderOrder=1; front.renderOrder=2;
  g.add(back,front);
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
/* every dimension of every volume — closed, open, and the ones riding a
   returns trolley — runs through this one factor. The base numbers describe a
   book that photographs correctly and reads a size too small in the room, and
   the tightest clearance in the building is the 0.375m between shelf boards:
   at 1.21 the tallest design stands 0.363, which is the ceiling on this.
   The trolley (CART_S) is scaled with it — a book truck whose decks are
   0.34 apart cannot carry a 0.363 volume. */
const BOOK_S=1.21;
let BOOKS=null;                 // [{geo, mats, h, tx, d}] — the design pool
let OPEN_BOOK=null;             // prototype group, cloned per placement
let pageMats=null;
/* four kinds of binding: tooled cloth and leather with gilt, dust jackets,
   and paperbacks — which are a different OBJECT, not a different print:
   flush-trimmed card covers and a flat spine, shorter and thinner */
function buildBookDesign(title,author,vol){
  const r=Math.random();
  const style=r<0.50?"cloth":r<0.64?"leather":r<0.82?"jacket":"paperback";
  const pb=style==="paperback";
  let base=BOOK_BASES[Math.floor(Math.random()*BOOK_BASES.length)];
  if(style==="leather") base=base.map(c=>Math.round(c*0.66));
  const h=(pb? 0.178+Math.random()*0.03 : 0.20+Math.random()*0.10)*BOOK_S;  // page length (standing height)
  const tx=(pb? 0.014+Math.random()*0.022 : 0.025+Math.random()*0.04)*BOOK_S; // thickness
  const d=(pb? 0.108+Math.random()*0.012 : 0.14+Math.random()*0.05)*BOOK_S;  // cover width (depth on the shelf)
  const {tex,uv:UV}=makeBookCoverTexture(title,author,base,
    Math.floor(Math.random()*6),pb?null:vol,h,tx,d,style);
  const cover=new GeoAcc(), pages=new GeoAcc();
  const plainAll=geo=>{for(let f=0;f<6;f++)
    setFaceUV(geo,f,UV.plain[0]+0.02,0.3,UV.plain[1]-0.02,0.7);};
  if(pb){
    for(const sx of[-1,1]){
      const b=new THREE.BoxGeometry(0.0016,h,d);
      plainAll(b);
      if(sx>0) setFaceUV(b,0,UV.front[0],0,UV.front[1],1);
      b.translate(sx*(tx/2-0.0008),h/2,0);
      cover.add(b);
    }
    const sp=new THREE.BoxGeometry(tx,h,0.0016);
    plainAll(sp);
    setFaceUV(sp,5,UV.spine[0],0,UV.spine[1],1);
    sp.translate(0,h/2,-d/2+0.0008);
    cover.add(sp);
    const pg=new THREE.BoxGeometry(tx-0.0034,h-0.002,d-0.002);
    pg.translate(0,h/2,0.0009);
    pages.add(pg);
  } else {
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
  }
  /* printed stock takes a hard little highlight; cloth and leather don't */
  const coverMat=new THREE.MeshPhongMaterial({map:tex,
    specular: pb? 0x3c3a34 : style==="jacket"? 0x2a2822 : style==="leather"? 0x2a2018 : 0x1a1610,
    shininess: pb? 36 : style==="jacket"? 24 : style==="leather"? 26 : 14});
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
  for(let i=0;i<28;i++){
    const [title,author]=titles[i%titles.length];
    const vol=Math.random()<0.2? "VOL. "+["I","II","III","IV","VII"][Math.floor(Math.random()*5)] : null;
    BOOKS.push(buildBookDesign(title,author,vol));
  }
  /* the open book: covers splayed flat, two page slabs meeting at a gutter */
  /* the open book is sized off the SAME base numbers the closed designs use
     (mid of the cover-width and page-length ranges) times BOOK_S, so it can
     never drift away from the volumes lying open beside it */
  const od=0.165*BOOK_S, oh=0.238*BOOK_S;
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
const jarGlassMat=new THREE.MeshPhongMaterial({color:0x7e8a80, specular:0x8a9690, shininess:80,
  transparent:true, opacity:0.42, depthWrite:false});
const jarDregsMat=new THREE.MeshPhongMaterial({color:0x4a4632, specular:0x111111, shininess:6});
const hourGlassMat=new THREE.MeshPhongMaterial({color:0x9aa496, specular:0x6a7468,
  shininess:70, transparent:true, opacity:0.45, depthWrite:false});
const sandMat=new THREE.MeshPhongMaterial({color:0x9a8358, specular:0x111111, shininess:4});
const candleMat=new THREE.MeshPhongMaterial({color:0xd8d2c0, specular:0x222018, shininess:14});
const JAR_GEO=new THREE.LatheGeometry([[0.001,0],[0.07,0],[0.078,0.012],[0.08,0.17],
  [0.07,0.2],[0.052,0.215],[0.052,0.232]].map(([r,y])=>new THREE.Vector2(r,y)),14);
const JAR_LID_GEO=new THREE.CylinderGeometry(0.058,0.058,0.026,14).translate(0,0.244,0);
const JAR_DREGS_GEO=new THREE.CylinderGeometry(0.068,0.07,0.012,14);
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
    /* a specimen jar: turned glass with a shoulder and a lid, the liquid long
       since gone to a cloudy stain at the bottom */
    const jar=new THREE.Mesh(JAR_GEO,jarGlassMat);
    jar.position.set(sx,yTop,sz); g.add(jar);
    const lid=new THREE.Mesh(JAR_LID_GEO,accentBrass);
    lid.position.set(sx,yTop,sz); g.add(lid);
    const dregs=new THREE.Mesh(JAR_DREGS_GEO,jarDregsMat);
    dregs.position.set(sx,yTop+0.006,sz); g.add(dregs);
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
    for(const[cy,flip]of[[0.085,0],[0.195,Math.PI]]){
      const cone=new THREE.Mesh(new THREE.ConeGeometry(0.055,0.105,10),hourGlassMat);
      cone.position.y=cy; cone.rotation.x=flip; hg.add(cone);
    }
    /* the sand, all of it, in the bottom bulb */
    const sand=new THREE.Mesh(new THREE.ConeGeometry(0.042,0.05,10),sandMat);
    sand.position.y=0.057; hg.add(sand);
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
    const candle=new THREE.Mesh(new THREE.CylinderGeometry(0.017,0.019,ch,8),candleMat);
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
  /* every run has a character: a third are nearly stripped, a fifth are
     still stocked, and the rest sit between — the same thinning on every
     board read as one decorator's hand, not as years of neglect. Stocking
     scales with the board's LENGTH, and it is kept LOW: the disks the level
     sends you after lie on these boards, and at ~7,000 volumes (13 a metre
     on a full run) they were lost among the spines. */
  const rc=Math.random(), rate= rc<0.3? 0.18 : rc<0.8? 0.52 : 1.95, full=rate>1;
  for(let lv=0;lv<4;lv++){
  let budget=Math.round(len*rate*(0.6+Math.random()*0.8));
  let tries=Math.round(budget*1.5)+30;
  const yTop=BOARD_TOP(lv);
  while(budget>0&&tries-->0){
    const s=Math.random()<0.5?1:-1;
    const occ=occAt(s,lv), z=s*0.20;
    const x=rand(-len/2+0.35,len/2-0.35);
    const r=Math.random();
    if(r<(full?0.5:0.2)&&budget>=6){
      /* a proper shelf of them, spine to spine — sometimes with one gone,
         and the gap left where it was taken */
      const n=Math.min(budget,6+Math.floor(Math.random()*(full?14:8)));
      const row=[];let w=0;
      for(let i=0;i<n;i++){const des=pickBook();row.push(des);w+=des.tx;}
      const gapAt=Math.random()<0.4? 1+Math.floor(Math.random()*(n-2)) : -1;
      if(gapAt>=0) w+=0.05;
      if(!claim(occ,x-w/2-0.02,x+w/2+0.02)) continue;
      let bx=x-w/2;
      row.forEach((des,i)=>{
        if(i===gapAt) bx+=0.05;
        spawnBook(g,des,bx+des.tx/2,yTop,z+rand(-0.012,0.012),s,{yaw:(Math.random()-0.5)*0.03});
        bx+=des.tx;
      });
      budget-=n;
    } else if(r<0.40){
      /* a lone survivor, sometimes slumped sideways */
      const des=pickBook();
      if(!claim(occ,x-des.tx/2-0.02,x+des.tx/2+0.02)) continue;
      spawnBook(g,des,x,yTop,z,s,{lean:Math.random()<0.3?(Math.random()-0.5)*0.4:0});
      budget--;
    } else if(r<0.58){
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
      /* abandoned open, mid-read — the spread is 2·od wide, so the claim has
         to carry BOOK_S with it or the next arrangement lands on top of it */
      if(!claim(occ,x-0.23,x+0.23)) continue;
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
  if(wrapped) g.add(makeChairWrap());
  return g;
}
/* a library ladder: tapered stiles, round rungs let into them, brass hooks
   over the top of the stack and rubber shoes at the foot. It was two
   planks and five more planks across them. */
function makeLadder(){
  const g=new THREE.Group(), H=LADDER_H; g.userData.prop="ladder";
  for(const sx of[-0.27,0.27]){
    const r=new THREE.Mesh(taperBox(0.05,H,0.085,0.82),deskMat); r.position.set(sx,H/2,0); g.add(r);
    const shoe=new THREE.Mesh(new THREE.BoxGeometry(0.066,0.05,0.1),cartRubberMat);
    shoe.position.set(sx,0.025,0); g.add(shoe);
    /* the hook is a half-torus arcing from the stile's top out over the crown */
    const hk=new THREE.Mesh(new THREE.TorusGeometry(0.05,0.011,6,10,Math.PI),accentBrass);
    hk.rotation.y=-Math.PI/2; hk.position.set(sx,H-0.02,0.05); g.add(hk);
  }
  for(let i=0;i<6;i++){
    const rung=new THREE.Mesh(new THREE.CylinderGeometry(0.017,0.017,0.54,8),deskMatH);
    rung.rotation.z=Math.PI/2; rung.position.y=0.24+i*0.31; g.add(rung);
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
/* the truck grows with the books. Its decks are 0.36 apart, which leaves
   0.34 of clear height between them — a volume standing on one at the new
   BOOK_S is 0.363 and would push its head straight through the deck above.
   Rather than re-typing thirty literals, the whole structure is scaled at
   the merge (positions AND geometry), and the load is placed in the scaled
   frame; the books themselves are already at BOOK_S and must NOT be scaled
   a second time, which is why they go on after the merge, unscaled. */
const CART_S=1.10;
const CART_R=0.52*CART_S;                     // its floor-population keep-out
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
  /* blow the structure up to CART_S before anything is baked. The castor
     groups are real parents, so they take the factor on their own transform
     and their children ride it; every other part is still unparented, so it
     takes both its offset and its size directly. */
  for(const c of g.children){ c.position.multiplyScalar(CART_S); c.scale.setScalar(CART_S); }
  for(const arr of[paint,rubber,steel])
    for(const m of arr) if(!m.parent){ m.position.multiplyScalar(CART_S); m.scale.setScalar(CART_S); }
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
    const sy=(DECKS[Math.floor(Math.random()*DECKS.length)]+0.010)*CART_S;
    const s=Math.random()<0.5?1:-1;
    const des=pickBook();
    const flat=Math.random()<0.35;
    const hw=flat? des.h/2+0.02 : des.tx/2+0.02;
    const half=0.36*CART_S;
    if(hw>=half) continue;                        // nothing this long lies across a deck
    const bx=rand(-half+hw,half-hw);
    if(used.some(([uy,a,b])=>uy===sy&&a<bx+hw&&b>bx-hw)) continue;
    used.push([sy,bx-hw,bx+hw]);
    spawnBook(g,des,bx,sy,rand(-0.08,0.08)*CART_S,s,
      flat? {flat:true,yaw:(Math.random()-0.5)*0.5}
          : {lean:Math.random()<0.5?(Math.random()-0.5)*0.5:0});
    load--;
  }
  /* the RETURNS card, in a real holder screwed to the end panel */
  const hold=new THREE.Mesh(new THREE.BoxGeometry(0.010,0.13*CART_S,0.44*CART_S),cartSteelMat);
  hold.position.set(0.474*CART_S,0.72*CART_S,0); g.add(hold);
  const plq=new THREE.Mesh(new THREE.PlaneGeometry(0.40*CART_S,0.10*CART_S),
    new THREE.MeshPhongMaterial({map:makeEndTextTexture("RETURNS"), transparent:true,
      specular:0x000000, shininess:1}));
  plq.position.set(0.480*CART_S,0.72*CART_S,0); plq.rotation.y=Math.PI/2;
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
  /* rubbed back to the red bole — small and few, or at this repeat the
     moulding comes out polka-dotted */
  for(let i=0;i<16;i++){
    const x=Math.random()*w,y=Math.random()*h,r=1+Math.random()*2.5;
    g.beginPath();
    for(let k=0;k<=8;k++){
      const a=k/8*Math.PI*2, rr=r*(0.5+Math.random()*0.8);
      const px=x+Math.cos(a)*rr, py=y+Math.sin(a)*rr;
      k? g.lineTo(px,py) : g.moveTo(px,py);
    }
    g.closePath();
    g.fillStyle=`rgba(${118+Math.random()*30|0},${62+Math.random()*24|0},${40+Math.random()*20|0},${0.2+Math.random()*0.25})`;
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
/* opt: {land, frame, full} — `land` forces the plate's orientation (a pair
   or a row hangs matched), `frame` the moulding, `full` forbids an empty one */
function makeFramedArt(sw,opt={}){
  const g=new THREE.Group();
  const bulk=[];                                  // [mesh, material] — merged later
  const empty=!opt.full&&Math.random()<0.08;
  const art=empty? null : makeArtTexture(sw<0.7?"s":sw<1.25?"m":"l",opt.land);
  const land=art? art.land : !!opt.land;
  const sh=sw*(land?0.78:1.25);                   // the plate's own proportion
  const oil=!!(art&&art.paint);
  /* a canvas is framed straight into its moulding and hung bare; paper
     goes behind a mat and glass */
  const matted=!empty&&(oil? Math.random()<0.15 : Math.random()<0.85);
  const mb=matted? sw*(0.09+Math.random()*0.07) : 0;
  const oval=matted&&Math.random()<0.22;
  const glazed=!empty&&(oil? Math.random()<0.2 : Math.random()<0.85);
  const ow=sw+2*mb, oh=sh+2*mb;                   // the frame's opening
  const mw=(oil?0.05:0.030)+Math.random()*0.045, md=(oil?0.045:0.032)+Math.random()*0.036;
  const fm=opt.frame||FRAME_MATS[Math.floor(Math.random()*FRAME_MATS.length)];
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
    /* varnished oil takes a soft sheen off the strips; paper is dead matt */
    const plate=new THREE.Mesh(new THREE.PlaneGeometry(sw,sh),
      new THREE.MeshPhongMaterial({map:art.tex, specular:oil?0x26221a:0x0a0a0a, shininess:oil?22:8}));
    plate.position.z=0.016; g.add(plate);         // its own canvas: never merged
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
      /* the side strips hinge about Y: turned about Z, a strip the height of
         the picture swings diagonally right across it */
      const bv=mb*0.30;
      for(const[w2,h2,x2,y2,rx,ry]of[
        [sw,bv,0, (sh+bv*0.7)/2, Math.PI/4,0],[sw,bv,0,-(sh+bv*0.7)/2, -Math.PI/4,0],
        [bv,sh,(sw+bv*0.7)/2,0, 0,-Math.PI/4],[bv,sh,-(sw+bv*0.7)/2,0, 0,Math.PI/4]]){
        const m=fbox(w2,h2,0.004, x2,y2,MZ,artMatMat);
        m.rotation.x=rx; m.rotation.y=ry;
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
  /* the shell is a moulding, not a box: radiused corners, one corner cut
     off at 45° (the chamfer that stops it going in the drive the wrong way
     round), and a soft bevel on every edge for the light to run along.
     Shape y becomes world −z, so the shutter end (+y) is the −z end the
     print puts its shutter on. */
  const W=0.27, Dp=0.28, T=0.019, R=0.008, C=0.024;
  const s=new THREE.Shape();
  s.moveTo(-W/2+R,-Dp/2); s.lineTo(W/2-R,-Dp/2); s.quadraticCurveTo(W/2,-Dp/2,W/2,-Dp/2+R);
  s.lineTo(W/2,Dp/2-C); s.lineTo(W/2-C,Dp/2);
  s.lineTo(-W/2+R,Dp/2); s.quadraticCurveTo(-W/2,Dp/2,-W/2,Dp/2-R);
  s.lineTo(-W/2,-Dp/2+R); s.quadraticCurveTo(-W/2,-Dp/2,-W/2+R,-Dp/2);
  const body=new THREE.ExtrudeGeometry(s,{depth:T,bevelEnabled:true,bevelThickness:0.0016,
    bevelSize:0.0016,bevelSegments:1,curveSegments:3});
  body.rotateX(-Math.PI/2); body.translate(0,-T/2,0);
  {
    const p=body.attributes.position, n=body.attributes.normal, u=body.attributes.uv;
    const [t0,t1,t2,t3]=uv.top, [p0,p1,p2,p3]=uv.plain;
    for(let i=0;i<p.count;i++){
      const fx=(p.getX(i)+W/2)/W, fz=(-p.getZ(i)+Dp/2)/Dp;
      if(n.getY(i)>0.6) u.setXY(i,t0+fx*(t2-t0),t1+fz*(t3-t1));      // the label face
      else u.setXY(i,p0+fx*(p2-p0),p1+fz*(p3-p1));
    }
  }
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
  for(const [w,hh,d,dx,dz] of [[0.185,0.0245,0.045,0,0],[0.042,0.0255,0.052,-0.072,0],
                            [0.042,0.0255,0.052,0.072,0],[0.185,0.0245,0.004,0,-0.0245]]){
    const m=new THREE.Mesh(new THREE.BoxGeometry(w,hh,d));
    m.position.set(SX+dx,SY,SZ+dz); sh.push(m);                 // the last one wraps the edge
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
const roundRect=(p,x,y,w,h,r)=>{
  p.moveTo(x+r,y); p.lineTo(x+w-r,y); p.quadraticCurveTo(x+w,y,x+w,y+r);
  p.lineTo(x+w,y+h-r); p.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  p.lineTo(x+r,y+h); p.quadraticCurveTo(x,y+h,x,y+h-r);
  p.lineTo(x,y+r); p.quadraticCurveTo(x,y,x+r,y);
};
const BEZEL_GEO=(()=>{
  const s=new THREE.Shape(); roundRect(s,-0.28,-0.23,0.56,0.46,0.045);
  const h=new THREE.Path(); roundRect(h,-0.228,-0.172,0.456,0.344,0.03); s.holes.push(h);
  const g=new THREE.ExtrudeGeometry(s,{depth:0.026,bevelEnabled:true,bevelThickness:0.007,
    bevelSize:0.007,bevelSegments:2,curveSegments:5});
  const uv=g.attributes.uv; for(let i=0;i<uv.count;i++) uv.setXY(i,uv.getX(i)/0.34,uv.getY(i)/0.34);
  return g;
})();
const MOUSE_GEO=new THREE.SphereGeometry(0.032,12,8).scale(0.95,0.5,1.45);
/* the board's caps: the canvas layout (KB_LAYOUT) laid out on the deck at
   0.48 × 0.175m, every cap tapered toward its top and printed with its
   own window of the keyboard canvas */
let KB_MAT=null, KB_GEO=null;
const keycapMat=()=>{
  if(!KB_MAT){ KB_MAT=new THREE.MeshPhongMaterial({map:makeKeyboardTexture(), specular:0x2a2620, shininess:22});
    markShared(KB_MAT,KB_MAT.map); }
  return KB_MAT;
};
function keycapGeo(){
  if(KB_GEO) return KB_GEO;
  const sx=0.48/256, sz=0.175/96, parts=[];
  for(const [x,y,w,h] of KB_LAYOUT){
    const bw=w*sx-0.0012, bd=h*sz-0.0012;
    const b=new THREE.BoxGeometry(bw,0.009,bd);
    const p=b.attributes.position;
    for(let i=0;i<p.count;i++) if(p.getY(i)>0){ p.setX(i,p.getX(i)*0.84); p.setZ(i,p.getZ(i)*0.82); }
    b.computeVertexNormals();
    for(let f=0;f<6;f++) setFaceUV(b,f,(x+1)/256,1-(y+h-1)/96,(x+w-1)/256,1-(y+1)/96);
    b.translate((x+w/2)*sx-0.24,0.0215+0.0045,(y+h/2)*sz-0.0875+0.004);
    parts.push(new THREE.Mesh(b));
  }
  KB_GEO=markShared(mergeStatic(parts,null).geometry);
  for(const m of parts) m.geometry.dispose();
  return KB_GEO;
}
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
  /* the bezel is one moulding with rounded corners and a radiused lip —
     four butted boxes read as a picture frame round a photograph of a
     screen */
  {
    const b=new THREE.Mesh(BEZEL_GEO); b.position.set(0,0.41,0.2445); pale.push(b);
  }
  /* the swivel foot the tube sits on */
  {
    const f=new THREE.Mesh(new THREE.CylinderGeometry(0.17,0.19,0.018,20)); f.position.set(0,0.183,-0.02); pale.push(f);
  }
  /* the screen: its own canvas so each machine can boot/static/die alone */
  const cv=document.createElement("canvas"); cv.width=192; cv.height=144;
  const tex=new THREE.CanvasTexture(cv); tex.minFilter=THREE.LinearFilter; tex.generateMipmaps=false;
  const ctx=cv.getContext("2d");
  const screen={
    tex,
    /* dead glass still reflects: a soft window of the room across the top
       and dust on the curve — a flat black quad is a hole, not a screen */
    off(){ ctx.fillStyle="#0a0d0b"; ctx.fillRect(0,0,192,144);
      const gr=ctx.createRadialGradient(96,66,6,96,66,110);
      gr.addColorStop(0,"rgba(70,80,76,0.10)"); gr.addColorStop(1,"rgba(70,80,76,0)");
      ctx.fillStyle=gr; ctx.fillRect(0,0,192,144);
      const sh=ctx.createLinearGradient(40,0,120,70);
      sh.addColorStop(0,"rgba(150,160,156,0)"); sh.addColorStop(0.5,"rgba(150,160,156,0.07)"); sh.addColorStop(1,"rgba(150,160,156,0)");
      ctx.fillStyle=sh; ctx.beginPath(); ctx.moveTo(30,0); ctx.lineTo(110,0); ctx.lineTo(60,80); ctx.lineTo(0,80); ctx.closePath(); ctx.fill();
      ctx.fillStyle="rgba(120,124,118,0.05)";
      for(let i=0;i<120;i++) ctx.fillRect(Math.random()*192,Math.random()*144,1,1);
      tex.needsUpdate=true; },
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
  /* real keycaps now, a hundred of them in one mesh, each capped with its
     own patch of the printed board */
  kb.add(new THREE.Mesh(keycapGeo(),keycapMat()));
  /* and the mouse, on its cord */
  {
    const ms=new THREE.Mesh(MOUSE_GEO,beigePlastic); ms.position.set(0.37,0.018,0.47); ms.rotation.y=rand(-0.4,0.3); g.add(ms);
    const pts=[new THREE.Vector3(0.37,0.02,0.43),new THREE.Vector3(0.36,0.008,0.34),new THREE.Vector3(0.3,0.006,0.28),new THREE.Vector3(0.22,0.03,0.24)];
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),10,0.004,4,false),beigePlasticDark));
  }
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
const deskShadeMat=new THREE.MeshPhongMaterial({color:0x3a3d40, specular:0x404448, shininess:40, side:THREE.DoubleSide});
const closedCardMat=new THREE.MeshPhongMaterial({specular:0x111111, shininess:4, side:THREE.DoubleSide,
  map:makeCanvas(256,96,(g,w,h)=>{
    g.fillStyle="#e4dcc4"; g.fillRect(0,0,w,h);
    g.strokeStyle="#2a2620"; g.lineWidth=3; g.strokeRect(6,6,w-12,h-12);
    g.fillStyle="#2a2620"; g.textAlign="center"; g.textBaseline="middle";
    g.font="bold 30px Georgia"; g.fillText("POSITION",w/2,34);
    g.font="bold 30px Georgia"; g.fillText("CLOSED",w/2,66);
  })});
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
  /* the one dependable lamp in the building: a weighted foot, two jointed
     arms and a spun shade turned down over the machine, open end toward it */
  const CT=1.19;                                                  // the counter's top
  const rod=(a,b,r,mat)=>{
    const d=new THREE.Vector3().subVectors(b,a), m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,d.length(),8),mat);
    m.position.copy(a).addScaledVector(d,0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());
    g.add(m); return m;
  };
  const foot=new THREE.Mesh(LAMP_BASE_GEO,darkMetalMat); foot.scale.set(1.1,1.4,1.1); foot.position.set(0.95,CT,-0.2); g.add(foot);
  const elbow=new THREE.Vector3(0.93,1.62,-0.2), apex=new THREE.Vector3(0.7,1.95,-0.2);
  rod(new THREE.Vector3(0.95,CT+0.06,-0.2),elbow,0.013,darkMetalMat);
  rod(elbow,apex,0.011,darkMetalMat);
  const knuckle=new THREE.Mesh(new THREE.SphereGeometry(0.022,8,6),darkMetalMat); knuckle.position.copy(elbow); g.add(knuckle);
  const shade=new THREE.Mesh(new THREE.ConeGeometry(0.13,0.17,14,1,true),darkMetalMat);
  shade.material=deskShadeMat;
  shade.position.set(0.66,1.88,-0.2); shade.rotation.z=-0.5; g.add(shade);
  const bulb=new THREE.Mesh(new THREE.SphereGeometry(0.05,8,8),
    new THREE.MeshBasicMaterial({color:0xffd9a0}));
  bulb.position.set(0.6,1.82,-0.2); g.add(bulb);
  const lamp=new THREE.PointLight(0xffcf92,0.85,9,1.9);
  lamp.position.set(0.55,2.0,-0.1); g.add(lamp);
  /* the rest of the counter: returns nobody checked in, a bell nobody
     answers, the stamp still set to a date, and a sign on the only
     position in the building */
  const tray=new THREE.Mesh(new THREE.BoxGeometry(0.5,0.07,0.34),beigePlasticDark);
  tray.position.set(-1.4,1.23,0.2); g.add(tray);
  scatterPapers(g,-1.4,1.265,0.2,4,0.06);
  for(const [x,z,n] of[[-2.5,0.3,5],[-2.9,-0.2,3],[2.3,0.35,4]]){
    let lift=0;
    for(let i=0;i<n;i++){ const des=pickBook();
      spawnBook(g,des,x+rand(-0.02,0.02),CT,z+rand(-0.02,0.02),1,{flat:true,lift,yaw:rand(-0.25,0.25)+Math.PI/2}); lift+=des.tx; }
  }
  {
    const bell=new THREE.Group(); bell.position.set(1.35,CT,0.55); g.add(bell);
    const bb=new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.055,0.018,16),darkMetalMat); bb.position.y=0.009; bell.add(bb);
    const dome=new THREE.Mesh(new THREE.SphereGeometry(0.045,16,8,0,Math.PI*2,0,Math.PI/2),accentBrass); dome.position.y=0.018; bell.add(dome);
    const btn=new THREE.Mesh(new THREE.CylinderGeometry(0.006,0.006,0.02,8),accentBrass); btn.position.y=0.07; bell.add(btn);
    const stamp=new THREE.Group(); stamp.position.set(-0.75,CT,0.45); g.add(stamp);
    const sb=new THREE.Mesh(new THREE.BoxGeometry(0.07,0.03,0.04),darkMetalMat); sb.position.y=0.015; stamp.add(sb);
    const sh=new THREE.Mesh(new THREE.CylinderGeometry(0.014,0.018,0.08,8),darkWoodMat); sh.position.y=0.07; stamp.add(sh);
    const pad=new THREE.Mesh(new THREE.BoxGeometry(0.12,0.012,0.08),bakeliteMat); pad.position.set(-0.92,CT+0.006,0.42); g.add(pad);
    /* POSITION CLOSED, on a tent card, facing whoever walks up */
    const card=new THREE.Group(); card.position.set(0.55,CT,0.62); g.add(card);
    for(const s of[-1,1]){
      const p=new THREE.Mesh(new THREE.PlaneGeometry(0.3,0.12),closedCardMat);
      p.rotation.order="YXZ"; p.rotation.set(-0.35,s<0?Math.PI:0,0);
      p.position.set(0,0.056,s*0.02); card.add(p);
    }
    /* a card file with its lid up */
    const fb=new THREE.Mesh(new THREE.BoxGeometry(0.2,0.12,0.3),darkWoodMat); fb.position.set(-2.0,CT+0.06,-0.35); g.add(fb);
    const cards=new THREE.Mesh(new THREE.BoxGeometry(0.18,0.1,0.26),cardMat); cards.position.set(-2.0,CT+0.07,-0.35); g.add(cards);
  }
  /* the librarian's chair, pushed back from the counter */
  {
    const ch=makeChair(false); ch.position.set(0.35,0,-1.35); ch.rotation.y=rand(-0.5,0.5); g.add(ch);
  }
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
   A round shaft behind the desk: the floor torn open in section, the earth
   the librarian clawed through, and under that the dressed stone of a stair
   that was down here long before the library was built on top of it —
   wedge treads let into the wall, worn hollow in the middle, an iron rail
   spiralling down the open well, and a blue light below that fills the
   depth like water. Built with the level, hidden under a carpet plug until
   the terminal ending digs it open. */
const HOLE_R=2.7, HOLE_DEPTH=22;
const STAIR_RISE=4.48, STAIR_STEPS=16;           // rise per revolution / steps per revolution
/* the treads run from the well's edge right into the masonry */
export const STAIR={RISE:STAIR_RISE, STEPS:STAIR_STEPS, IN:1.36, OUT:2.9, T:0.32, RAIL_R:1.47};
const STEP_A=Math.PI*2/STAIR_STEPS;
/* One tread, in its own frame: an annular sector from angle 0 to one step
   (plus a nosing), top at y=0. Placed with rotation.y=−θ its span starts at
   world angle θ — the same convention libGroundY reads the stair with, so
   what you see under your feet is what you are standing on. */
let TREAD_GEO=null;
export function stairTreadGeo(){
  if(TREAD_GEO) return TREAD_GEO;
  const {IN,OUT,T}=STAIR, NOSE=0.045/2, CH=0.035, CHA=0.03/2;
  const phiF=STEP_A+NOSE, top=phiF-CHA;
  const pos=[],nor=[],uv=[];
  const P=(r,f,y)=>new THREE.Vector3(r*Math.cos(f),y,r*Math.sin(f));
  const e1=new THREE.Vector3(), e2=new THREE.Vector3(), n=new THREE.Vector3();
  const quad=(a,b,c,d,want,uvf)=>{
    e1.subVectors(b,a); e2.subVectors(c,a); n.crossVectors(e1,e2).normalize();
    let q=[a,b,c,d]; if(n.dot(want)<0){ q=[a,d,c,b]; n.negate(); }
    const tri=[q[0],q[1],q[2],q[0],q[2],q[3]];
    for(const p of tri){ pos.push(p.x,p.y,p.z); nor.push(n.x,n.y,n.z); const t=uvf(p); uv.push(t[0],t[1]); }
  };
  const uvTop=p=>[p.x*0.5,p.z*0.5];
  const up=new THREE.Vector3(0,1,0), dn=new THREE.Vector3(0,-1,0);
  const RS=3, AS=4;
  /* the top, worn into a shallow hollow where the feet went */
  const wear=(r,f)=>0.014*Math.sin(Math.PI*(r-IN)/(OUT-0.4-IN))*Math.sin(Math.PI*f/top)*(r<OUT-0.4?1:0);
  for(let j=0;j<RS;j++)for(let k=0;k<AS;k++){
    const r0=IN+(OUT-IN)*j/RS, r1=IN+(OUT-IN)*(j+1)/RS, f0=top*k/AS, f1=top*(k+1)/AS;
    quad(P(r0,f0,-wear(r0,f0)),P(r1,f0,-wear(r1,f0)),P(r1,f1,-wear(r1,f1)),P(r0,f1,-wear(r0,f1)),up,uvTop);
  }
  for(let j=0;j<RS;j++){
    const r0=IN+(OUT-IN)*j/RS, r1=IN+(OUT-IN)*(j+1)/RS;
    const mid=(r0+r1)/2, front=new THREE.Vector3(-Math.sin(phiF),0,Math.cos(phiF));
    /* the chamfered nosing, the riser, the back and the soffit */
    quad(P(r0,top,0),P(r1,top,0),P(r1,phiF,-CH),P(r0,phiF,-CH),front.clone().add(up).normalize(),p=>[Math.hypot(p.x,p.z)*0.5,p.y*0.5]);
    quad(P(r0,phiF,-CH),P(r1,phiF,-CH),P(r1,phiF,-T),P(r0,phiF,-T),front,p=>[Math.hypot(p.x,p.z)*0.5,p.y*0.5]);
    quad(P(r0,0,0),P(r1,0,0),P(r1,0,-T),P(r0,0,-T),new THREE.Vector3(0,0,-1),p=>[Math.hypot(p.x,p.z)*0.5,p.y*0.5]);
    for(let k=0;k<AS;k++){
      const f0=phiF*k/AS, f1=phiF*(k+1)/AS;
      quad(P(r0,f0,-T),P(r1,f0,-T),P(r1,f1,-T),P(r0,f1,-T),dn,uvTop);
    }
    void mid;
  }
  /* the inner end, the face you see across the well */
  for(let k=0;k<AS;k++){
    const f0=phiF*k/AS, f1=phiF*(k+1)/AS, fm=(f0+f1)/2;
    const ytop=f1>top? -CH : 0;
    quad(P(IN,f0,f0>top?-CH:0),P(IN,f1,ytop),P(IN,f1,-T),P(IN,f0,-T),
      new THREE.Vector3(-Math.cos(fm),0,-Math.sin(fm)),p=>[Math.atan2(p.z,p.x)*IN*0.5,p.y*0.5]);
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute("position",new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute("normal",new THREE.Float32BufferAttribute(nor,3));
  g.setAttribute("uv",new THREE.Float32BufferAttribute(uv,2));
  TREAD_GEO=markShared(g);
  return g;
}
/* The iron rail: a post on every other tread and a handrail and mid-rail
   following the treads down. `list` is the treads it runs over, each
   {th, y} (span start angle, top height), about the centre (cx,cz). */
export function stairRailMeshes(cx,cz,list,mat){
  const R=STAIR.RAIL_R, posts=[], hi=[], lo=[];
  list.forEach((t,i)=>{
    const a=t.th+STEP_A*0.5, x=cx+Math.cos(a)*R, z=cz+Math.sin(a)*R;
    hi.push(new THREE.Vector3(x,t.y+0.95,z)); lo.push(new THREE.Vector3(x,t.y+0.45,z));
    if(i%2===0){
      const p=new THREE.Mesh(new THREE.CylinderGeometry(0.015,0.018,0.96,6),mat);
      p.position.set(x,t.y+0.47,z); posts.push(p);
      const f=new THREE.Mesh(new THREE.CylinderGeometry(0.035,0.04,0.02,8),mat);
      f.position.set(x,t.y+0.01,z); posts.push(f);
    }
  });
  const out=[];
  if(posts.length){ out.push(mergeStatic(posts,mat)); for(const p of posts) p.geometry.dispose(); }
  if(hi.length>1){
    out.push(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(hi),hi.length*3,0.022,6,false),mat));
    out.push(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(lo),lo.length*3,0.011,5,false),mat));
  }
  return out;
}
/* The shaft's own weather: every surface in it drifts toward the blue of
   the light below the deeper it sits, so from the rim the stair fades into
   glow rather than into black, and nothing has to be a plane stood across
   the shaft for the camera to walk through. */
const HAZE_COL={value:new THREE.Color(0x1d5374)};
function hazeCompile(sh){
  sh.uniforms.uHaze=HAZE_COL;
  sh.vertexShader=sh.vertexShader.replace("#include <common>","#include <common>\nvarying float vHzY;")
    .replace("#include <project_vertex>","#include <project_vertex>\n  vHzY=(modelMatrix*vec4(transformed,1.0)).y;");
  sh.fragmentShader=sh.fragmentShader.replace("#include <common>","#include <common>\nuniform vec3 uHaze; varying float vHzY;")
    .replace("#include <fog_fragment>","gl_FragColor.rgb=mix(gl_FragColor.rgb,uHaze,smoothstep(-2.5,-18.0,vHzY)*0.8);\n#include <fog_fragment>");
}
const hazed=m=>{ m.onBeforeCompile=hazeCompile; return m; };
const ironMat=hazed(new THREE.MeshPhongMaterial({color:0x2c2a28, specular:0x5a5652, shininess:40}));
const rootMat=new THREE.MeshPhongMaterial({color:0x3a2a1c, specular:0x0a0806, shininess:6});
const jutelMat=new THREE.MeshPhongMaterial({color:0x6a5a40, specular:0x080604, shininess:3, side:THREE.BackSide});
const shaftSilkMat=new THREE.MeshBasicMaterial({color:0xb8c4c8, transparent:true, opacity:0.14, depthWrite:false});
const concreteMat=new THREE.MeshPhongMaterial({map:texSlabSection, color:0x77736c, specular:0x151515, shininess:6});
let dotTex=null;
function motesTex(){
  if(dotTex) return dotTex;
  dotTex=makeCanvas(32,32,(g,w,h)=>{ const gr=g.createRadialGradient(16,16,0,16,16,16);
    gr.addColorStop(0,"rgba(255,255,255,1)"); gr.addColorStop(0.4,"rgba(255,255,255,0.35)"); gr.addColorStop(1,"rgba(255,255,255,0)");
    g.fillStyle=gr; g.fillRect(0,0,w,h); });
  markShared(dotTex);
  return dotTex;
}
/* a lump of spoil: an icosphere pushed about by a few octaves of sines,
   flattened, and cut off at the floor so it sits ON the carpet */
function spoilHeap(sx,sy,sz){
  const g=new THREE.IcosahedronGeometry(1,2), p=g.attributes.position, ph=Math.random()*9;
  for(let i=0;i<p.count;i++){
    let x=p.getX(i), y=p.getY(i), z=p.getZ(i);
    const k=1+0.22*Math.sin(x*3.1+ph)*Math.sin(z*2.7+ph*1.3)+0.12*Math.sin(x*7+z*6+ph)+0.06*Math.sin(y*11+x*9);
    x*=sx*k; z*=sz*k; y=Math.max(0,y)*sy*k;
    p.setXYZ(i,x,y,z);
  }
  g.computeVertexNormals();
  const uv=g.attributes.uv; for(let i=0;i<uv.count;i++) uv.setXY(i,p.getX(i)*0.8,p.getZ(i)*0.8+p.getY(i)*0.8);
  return g;
}
function buildHole(hc,carpetMat){
  const SZ=LW*CELL;
  const g=new THREE.Group();
  g.visible=false;
  const {IN,OUT,T}=STAIR, RC=HOLE_R-0.62;
  /* ---- the shaft wall, top down: floor section, earth, masonry ---- */
  /* the shaft is walked at arm's length and seen along its curve, the
     grazing angle an isotropic mip chain smears worst */
  const ANI=Math.min(8,renderer.capabilities.getMaxAnisotropy());
  const aniso=t=>{ t.anisotropy=ANI; t.needsUpdate=true; return t; };
  const secTex=aniso(texSlabSection.clone()); secTex.repeat.set(4,1); secTex.wrapT=THREE.ClampToEdgeWrapping;
  /* the top two bands sit above where the haze begins; left plain they share programs */
  const secMat=new THREE.MeshPhongMaterial({map:secTex, specular:0x0c0c0c, shininess:4, side:THREE.BackSide});
  const SEC_H=0.5;
  {
    const geo=new THREE.CylinderGeometry(HOLE_R,HOLE_R+0.02,SEC_H,56,1,true);
    const p=geo.attributes.position;
    for(let i=0;i<p.count;i++){ const a=Math.atan2(p.getZ(i),p.getX(i)), k=1+0.012*Math.sin(a*13)+0.008*Math.sin(a*29);
      p.setX(i,p.getX(i)*k); p.setZ(i,p.getZ(i)*k); }
    geo.computeVertexNormals();
    const m=new THREE.Mesh(geo,secMat); m.position.set(hc.x,-SEC_H/2+0.001,hc.z); g.add(m);
  }
  const earthTex=aniso(texSpoil.clone()); earthTex.repeat.set(7,2);
  const earthMat=new THREE.MeshPhongMaterial({map:earthTex, bumpMap:earthTex, bumpScale:0.05,
    specular:0x0a0806, shininess:4, side:THREE.BackSide});
  const EARTH_B=-2.7;
  {
    /* claw-dug: gouged in long vertical grooves, and bulging where it slumped */
    const geo=new THREE.CylinderGeometry(HOLE_R+0.02,HOLE_R+0.1,-SEC_H-EARTH_B,64,10,true);
    const p=geo.attributes.position, ph=Math.random()*9;
    for(let i=0;i<p.count;i++){
      const a=Math.atan2(p.getZ(i),p.getX(i)), y=p.getY(i);
      const edge=Math.abs(y)>(-SEC_H-EARTH_B)/2-0.01? 0 : 1;
      const k=1+edge*(0.03*Math.pow(Math.abs(Math.sin(a*19+ph)),3)+0.02*Math.sin(a*5+y*2+ph)+0.012*Math.sin(y*9+a*3));
      p.setX(i,p.getX(i)*k); p.setZ(i,p.getZ(i)*k);
    }
    geo.computeVertexNormals();
    const m=new THREE.Mesh(geo,earthMat); m.position.set(hc.x,(-SEC_H+EARTH_B)/2,hc.z); g.add(m);
  }
  /* The masonry is built course by course, not as one smooth tube: each
     course its own ring, stood a few millimetres in or out of the next and
     bellied a little round its length, so the light running down the shaft
     catches every joint. Its bottom sits on a tread's rise, so every course
     line is a tread line and the stair climbs the wall on the coursing. */
  const COURSE=STAIR_RISE/STAIR_STEPS, NC=78, MAS_B=-0.02-NC*COURSE, MAS_T=EARTH_B+0.05, MAS_H=MAS_T-MAS_B;
  const masTex=aniso(texShaftMasonry.clone()), masBump=aniso(texShaftMasonryBump.clone());
  for(const t of[masTex,masBump]) t.repeat.set(6,MAS_H/(8*COURSE));
  const masMat=hazed(new THREE.MeshPhongMaterial({map:masTex, bumpMap:masBump, bumpScale:0.045,
    color:0x8c8a86, specular:0x1a1e24, shininess:14, emissive:0x03060a, side:THREE.BackSide}));
  {
    const SEG=64, pos=[], uv=[], idx=[];
    for(let c=0;c*COURSE<MAS_H;c++){
      const y0=MAS_B+c*COURSE, y1=Math.min(MAS_T,y0+COURSE);
      const rc=2.8+(Math.random()-0.5)*0.018, ph=Math.random()*9, amp=0.004+Math.random()*0.006;
      const o=pos.length/3;
      for(let i=0;i<=SEG;i++){
        const u=i/SEG, a=u*Math.PI*2;
        const r=rc+amp*Math.sin(a*3+ph)+amp*0.6*Math.sin(a*7+ph*1.7);
        for(const y of[y0,y1]){ pos.push(hc.x+Math.cos(a)*r, y, hc.z+Math.sin(a)*r); uv.push(u,(y-MAS_B)/MAS_H); }
      }
      for(let i=0;i<SEG;i++){ const A=o+i*2; idx.push(A,A+1,A+2, A+1,A+3,A+2); }   // faces out: the material draws BackSide
    }
    const geo=new THREE.BufferGeometry();
    geo.setAttribute("position",new THREE.Float32BufferAttribute(pos,3));
    geo.setAttribute("uv",new THREE.Float32BufferAttribute(uv,2));
    geo.setIndex(idx); geo.computeVertexNormals();
    g.add(new THREE.Mesh(geo,masMat));
  }
  /* ---- the stair ---- */
  const stepTex=aniso(texCaveRock.clone());
  const stepMat=hazed(new THREE.MeshPhongMaterial({map:stepTex, bumpMap:stepTex,
    bumpScale:0.05, color:0x6a6e70, emissive:0x070b10, specular:0x181c22, shininess:10}));
  const stair={a0:Math.PI/2, dir:1, rc:RC, rise:STAIR_RISE, steps:STAIR_STEPS,
               n:Math.round(4.5*STAIR_STEPS)};
  const treads=[], list=[];
  const TG=stairTreadGeo();
  for(let i=0;i<stair.n;i++){
    const th=stair.a0+i*STEP_A, y=-0.02-i*(STAIR_RISE/STAIR_STEPS);
    const m=new THREE.Mesh(TG,stepMat);
    m.position.set(hc.x,y,hc.z); m.rotation.y=-th;
    treads.push(m); list.push({th,y});
  }
  g.add(mergeStatic(treads,stepMat));
  for(const r of stairRailMeshes(hc.x,hc.z,list,ironMat)) g.add(r);
  /* ---- the light below, filling the well ---- */
  const glow=[];
  [[-3,0.05],[-5.5,0.10],[-8,0.17],[-10.5,0.28],[-13,0.46],[-16,0.68],[-19,0.9]]
  .forEach(([y,op],i,arr)=>{
    const c=new THREE.Color(0x2b4c66).lerp(new THREE.Color(0x63ccff),i/(arr.length-1));
    const m=new THREE.MeshBasicMaterial({color:c, transparent:true, opacity:op,
      depthWrite:false, side:THREE.DoubleSide});
    const d=new THREE.Mesh(new THREE.CircleGeometry(IN-0.06,36),m);
    d.rotation.x=-Math.PI/2; d.position.set(hc.x,y,hc.z);
    glow.push({mat:m, baseOp:op}); g.add(d);
  });
  const cap=new THREE.Mesh(new THREE.CircleGeometry(2.85,40),
    new THREE.MeshBasicMaterial({color:0x2a6f94}));
  cap.rotation.x=-Math.PI/2; cap.position.set(hc.x,-HOLE_DEPTH+0.1,hc.z); g.add(cap);
  /* dust hanging in the light */
  const motes=(()=>{
    const N=420, pos=new Float32Array(N*3);
    for(let i=0;i<N;i++){ const a=Math.random()*Math.PI*2, r=Math.sqrt(Math.random())*2.55;
      pos[i*3]=Math.cos(a)*r; pos[i*3+1]=-0.4-Math.random()*19; pos[i*3+2]=Math.sin(a)*r; }
    const geo=new THREE.BufferGeometry(); geo.setAttribute("position",new THREE.BufferAttribute(pos,3));
    const pts=new THREE.Points(geo,new THREE.PointsMaterial({map:motesTex(), color:0x9ed4f0, size:0.045,
      transparent:true, opacity:0.55, depthWrite:false, blending:THREE.AdditiveBlending}));
    pts.position.set(hc.x,0,hc.z); pts.userData.animated=true;
    return pts;
  })();
  g.add(motes);
  /* its silk: the lines it went down on, still hanging in the shaft */
  for(let i=0;i<4;i++){
    const a=Math.random()*Math.PI*2, r0=rand(1.9,2.5), len=rand(7,15), pts=[];
    for(let k=0;k<=8;k++){ const t=k/8; pts.push(new THREE.Vector3(hc.x+Math.cos(a)*(r0-t*rand(0.3,0.8)), -t*len, hc.z+Math.sin(a)*(r0-t*0.5))); }
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),16,0.006,4,false),shaftSilkMat));
  }
  /* roots, hanging out of the earth it cut */
  {
    const roots=[];
    for(let i=0;i<16;i++){
      const a=Math.random()*Math.PI*2, y0=rand(-0.7,-2.4), len=rand(0.4,1.3), pts=[];
      for(let k=0;k<=5;k++){ const t=k/5, rr=HOLE_R+0.06-t*rand(0.2,0.5);
        pts.push(new THREE.Vector3(hc.x+Math.cos(a+t*0.1)*rr, y0-t*len, hc.z+Math.sin(a+t*0.1)*rr)); }
      roots.push(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),8,rand(0.006,0.014),4,false)));
    }
    g.add(mergeStatic(roots,rootMat)); for(const r of roots) r.geometry.dispose();
  }
  /* ---- the rim ---- */
  const dirtTex=texSpoil.clone(); dirtTex.needsUpdate=true; dirtTex.repeat.set(1,1);
  const dirtMat=new THREE.MeshPhongMaterial({map:dirtTex, bumpMap:dirtTex, bumpScale:0.04,
    specular:0x0a0806, shininess:4});
  /* spoil flung back behind the digger (it faced the desk, south) — heaps
     to the north, and a thinner scatter everywhere else */
  {
    const heaps=[];
    for(let i=0;i<9;i++){
      const north=i<6, a=north? -Math.PI/2+rand(-1.1,1.1) : Math.random()*Math.PI*2;
      const rr=HOLE_R+rand(0.5,north?2.6:1.4), s=north? rand(0.6,1.2):rand(0.3,0.6);
      const m=new THREE.Mesh(spoilHeap(s,s*rand(0.28,0.45),s*rand(0.7,1.1)),dirtMat);
      m.position.set(hc.x+Math.cos(a)*rr,0,hc.z+Math.sin(a)*rr); m.rotation.y=Math.random()*6.28;
      heaps.push(m);
    }
    for(let i=0;i<40;i++){
      const a=Math.random()*Math.PI*2, rr=HOLE_R+rand(0.2,4.5), s=rand(0.05,0.16);
      const m=new THREE.Mesh(spoilHeap(s,s*0.7,s),dirtMat);
      m.position.set(hc.x+Math.cos(a)*rr,0,hc.z+Math.sin(a)*rr); heaps.push(m);
    }
    g.add(mergeStatic(heaps,dirtMat)); for(const h of heaps) h.geometry.dispose();
  }
  /* the carpet torn back from the edge: flaps curling up and over, the
     grey face up on some and the jute backing on the others */
  {
    const flaps=[];
    for(let i=0;i<24;i++){
      const a=i/24*Math.PI*2+rand(-0.1,0.1), w=rand(0.25,0.55), len=rand(0.3,0.75), curl=Math.random()<0.7? rand(0.25,0.9) : rand(1.6,2.6);
      const geo=new THREE.PlaneGeometry(w,len,2,8), p=geo.attributes.position, uv=geo.attributes.uv;
      for(let k=0;k<p.count;k++){
        const t=(p.getY(k)+len/2)/len, ang=t*curl, R=len/curl;
        /* rolled outward from the hole's edge: along the flap is along the radius */
        const along=R*Math.sin(ang), rise=R*(1-Math.cos(ang));
        const x=p.getX(k)*(1-t*0.65);
        p.setXYZ(k,x,rise+0.006,-along);
        uv.setXY(k,(x+hc.x)/SZ+0.5,(along)/SZ+0.5);
      }
      geo.computeVertexNormals();
      const m=new THREE.Mesh(geo,carpetMat);
      m.position.set(hc.x+Math.cos(a)*(HOLE_R-0.02),0,hc.z+Math.sin(a)*(HOLE_R-0.02));
      m.rotation.y=-a-Math.PI/2;
      flaps.push(m);
    }
    const top=mergeStatic(flaps,carpetMat), back=new THREE.Mesh(top.geometry,jutelMat);
    back.matrixAutoUpdate=false; back.matrix.copy(top.matrix);
    g.add(top); g.add(back);
    for(const f of flaps) f.geometry.dispose();
  }
  /* slab broken out of the floor */
  {
    const chunks=[];
    for(let i=0;i<9;i++){
      const geo=new THREE.BoxGeometry(rand(0.15,0.45),rand(0.08,0.2),rand(0.15,0.4),1,1,1);
      const p=geo.attributes.position;
      for(let k=0;k<p.count;k++) p.setXYZ(k,p.getX(k)*rand(0.7,1.2),p.getY(k)*rand(0.7,1.2),p.getZ(k)*rand(0.7,1.2));
      geo.computeVertexNormals();
      const a=Math.random()*Math.PI*2, rr=HOLE_R+rand(0.3,2.2), m=new THREE.Mesh(geo,concreteMat);
      m.position.set(hc.x+Math.cos(a)*rr,0.06,hc.z+Math.sin(a)*rr); m.rotation.set(rand(-0.3,0.3),Math.random()*6.28,rand(-0.3,0.3));
      chunks.push(m);
    }
    g.add(mergeStatic(chunks,concreteMat)); for(const c of chunks) c.geometry.dispose();
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
  for(const t of[secTex,earthTex,masTex,masBump,dirtTex,stepTex,texSpoil]) renderer.initTexture(t);
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
  plug.userData.noBatch=true;         // revealHole takes it away; baked into the floor's batch it would stay
  scene.add(plug);
  LIB.hole={x:hc.x, z:hc.z, r:HOLE_R, depth:HOLE_DEPTH, group:g, plug, lights:holeLights, glow, stair, motes};
}
/* the dig breaks through: swap the carpet plug for the open shaft. The
   cutscene calls this at peak dust, so the pop is never seen; it also owns
   ramping LIB.hole.lights[].l.intensity up to their .I targets. */
export function revealHole(){
  const h=LIB.hole;
  if(!h||STATE.holeOpen) return;
  STATE.holeOpen=true;
  STATE.guide={x:h.x, z:h.z};       // the HUD's one legitimate pointer (see ui.js)
  h.group.visible=true;
  if(h.plug){ scene.remove(h.plug); h.plug.geometry.dispose(); h.plug=null; }
}

/* ================= the walls =================
   Twenty-four metres of bare plaster with pictures scattered over it at
   random heights read as a warehouse somebody had hung pictures in. What
   makes a room a READING ROOM is architecture you can measure it by:
   pilasters marching round it on one pitch, an oak wainscot at hand height,
   and a picture rail the frames hang from on wires. The hang then follows
   the architecture — one bay, one arrangement, at one height, all the way
   round — which is what an institution does, and the REPETITION is what
   makes the room liminal. Then it goes wrong in small ways: a bay where
   only the wires are left and the paint is paler where the frame was,
   every clock stopped at the same minute, doors that don't open.
   Everything is built in each wall's own frame (x along the wall, z out
   into the room) and left for batchStatic to merge. */
const BAYS=11, PIL_W=0.72, PIL_D=0.22, WAIN_H=1.12, RAIL_Y=3.3;
const WALL_IN=ROOM_SPAN/2-CELL;                  // the inner wall plane
const BAY_W=2*WALL_IN/BAYS;
const bayS=b=>-WALL_IN+(b+0.5)*BAY_W;
const pilS=k=>-WALL_IN+k*BAY_W;
/* clockwise from the north wall; `ry` turns local +z into the room */
const WALLS=[{id:"A",ry:0,cx:0,cz:-WALL_IN},{id:"B",ry:-Math.PI/2,cx:WALL_IN,cz:0},
             {id:"C",ry:Math.PI,cx:0,cz:WALL_IN},{id:"D",ry:Math.PI/2,cx:-WALL_IN,cz:0}];
const wallPt=(W,s,d)=>({x:W.cx+Math.cos(W.ry)*s+Math.sin(W.ry)*d, z:W.cz-Math.sin(W.ry)*s+Math.cos(W.ry)*d});
const wainPanelMat=new THREE.MeshPhongMaterial({map:texDeskWood, color:0x8c7c66, specular:0x16100a, shininess:10});
const skirtMat=new THREE.MeshPhongMaterial({map:texDeskWoodH, color:0x6e5e4c, specular:0x16100a, shininess:10});
const wireMat=new THREE.MeshPhongMaterial({color:0x5a5448, specular:0x6a6456, shininess:50});
const ghostMat=new THREE.MeshPhongMaterial({map:texGhost, transparent:true, depthWrite:false,
  specular:0x000000, shininess:1, polygonOffset:true, polygonOffsetFactor:-2, polygonOffsetUnits:-2});
const corkMat=new THREE.MeshPhongMaterial({map:texCork, specular:0x080604, shininess:3});
const clockFaceMat=new THREE.MeshPhongMaterial({map:texClockFace, specular:0x2a2a26, shininess:30});
const bakeliteMat=new THREE.MeshPhongMaterial({color:0x1c1a17, specular:0x3a3834, shininess:60});
const exitSignMat=new THREE.MeshBasicMaterial({map:texExitSign, color:0x9a9a9a});
const staffSignMat=new THREE.MeshPhongMaterial({map:texStaffSign, specular:0x111111, shininess:6});
const darkWoodMat=new THREE.MeshPhongMaterial({map:texDeskWood, color:0x3a2e22, specular:0x0a0806, shininess:6});
const doorGlassMat=new THREE.MeshPhongMaterial({color:0x0b0d0e, specular:0x8a9296, shininess:110});
const pinMats=[0xa02820,0x2a5a9a,0xd8c030,0x2a7a40].map(c=>new THREE.MeshPhongMaterial({color:c, specular:0x444444, shininess:60}));
let plaqueMat=null;
const wallBox=(g,mat,w,h,d,x,y,z,m)=>{
  const b=new THREE.Mesh(scaleBoxUV(new THREE.BoxGeometry(w,h,d),w,h,d,m||0.9),mat);
  b.position.set(x,y,z); g.add(b); return b;
};
/* a stopped clock: every one of them reads 3:17 */
function makeWallClock(){
  const g=new THREE.Group(), R=0.34;
  /* a bezel ring standing proud of a recessed dial */
  const rim=new THREE.Mesh(new THREE.TorusGeometry(R+0.02,0.035,8,32),bakeliteMat);
  rim.position.z=0.06; g.add(rim);
  const back=new THREE.Mesh(new THREE.CylinderGeometry(R+0.03,R+0.05,0.05,28),bakeliteMat);
  back.rotation.x=Math.PI/2; back.position.z=0.025; g.add(back);
  const face=new THREE.Mesh(new THREE.CircleGeometry(R+0.004,28),clockFaceMat);
  face.position.z=0.052; g.add(face);
  const hand=(len,w,ang)=>{
    const m=new THREE.Mesh(new THREE.BoxGeometry(w,len,0.006),bakeliteMat);
    m.geometry.translate(0,len/2-0.03,0);
    m.rotation.z=-ang; m.position.z=0.06; g.add(m);
  };
  hand(R*0.58,0.026,(3+17/60)/12*Math.PI*2);
  hand(R*0.86,0.016,17/60*Math.PI*2);
  const cap=new THREE.Mesh(new THREE.CylinderGeometry(0.02,0.02,0.012,10),bakeliteMat);
  cap.rotation.x=Math.PI/2; cap.position.z=0.066; g.add(cap);
  return g;
}
/* a panelled pair of doors in an oak architrave. Locked. */
function makeLockedDoor(exit){
  const g=new THREE.Group();
  const DW=2.0, DH=2.44;
  for(const s of[-1,1]) wallBox(g,deskMat,0.15,DH+0.08,0.06, s*(DW/2+0.075),(DH+0.08)/2,0.03);
  wallBox(g,deskMatH,DW+0.42,0.17,0.07, 0,DH+0.16,0.035);
  wallBox(g,darkWoodMat,DW,DH,0.02, 0,DH/2,0.01);
  for(const s of[-1,1]){
    const lx=s*(DW/4+0.005);
    wallBox(g,deskMat,DW/2-0.02,DH-0.02,0.045, lx,DH/2,0.03);
    for(const[py,ph]of[[0.62,0.78],[1.7,0.9]]) wallBox(g,deskMatH,DW/2-0.26,ph,0.012, lx,py,0.058);
    const win=new THREE.Mesh(new THREE.PlaneGeometry(0.22,0.46),doorGlassMat);
    win.position.set(lx,1.72,0.0655); g.add(win);
    wallBox(g,accentBrass,0.09,0.32,0.006, s*0.12,1.1,0.056);
    wallBox(g,accentBrass,DW/2-0.12,0.2,0.004, lx,0.13,0.054);
  }
  wallBox(g,accentBrass,DW+0.1,0.02,0.14, 0,0.01,0.07);
  if(exit){
    wallBox(g,darkMetalMat,0.66,0.26,0.1, 0,DH+0.52,0.05);
    const f=new THREE.Mesh(new THREE.PlaneGeometry(0.6,0.22),exitSignMat);
    f.position.set(0,DH+0.52,0.101); g.add(f);
  } else {
    const f=new THREE.Mesh(new THREE.PlaneGeometry(0.62,0.23),staffSignMat);
    f.position.set(0,DH+0.46,0.075); g.add(f);
  }
  return g;
}
/* a cork noticeboard in an oak frame, with what is left pinned to it */
function makeNoticeBoard(){
  const g=new THREE.Group(), BW=1.7, BH=1.1;
  const cork=new THREE.Mesh(new THREE.PlaneGeometry(BW,BH),corkMat);
  cork.position.z=0.022; g.add(cork);
  wallBox(g,darkWoodMat,BW,BH,0.02, 0,0,0.01);
  for(const s of[-1,1]){
    wallBox(g,deskMatH,BW+0.12,0.06,0.04, 0,s*(BH/2+0.03),0.02);
    wallBox(g,deskMat,0.06,BH,0.04, s*(BW/2+0.03),0,0.02);
  }
  const n=2+Math.floor(Math.random()*4), taken=[];
  for(let i=0;i<n;i++){
    const pw=0.34, ph=0.46;
    let x=0,y=0,ok=false;
    for(let t=0;t<12&&!ok;t++){
      x=rand(-BW/2+0.24,BW/2-0.24); y=rand(-BH/2+0.28,BH/2-0.28);
      ok=taken.every(q=>Math.abs(q[0]-x)>0.3||Math.abs(q[1]-y)>0.36);
    }
    if(!ok) continue;
    taken.push([x,y]);
    const po=new THREE.Mesh(new THREE.PlaneGeometry(pw,ph),
      new THREE.MeshPhongMaterial({map:makePosterTexture(), specular:0x000000, shininess:2}));
    po.position.set(x,y,0.026+i*0.0015); po.rotation.z=(Math.random()-0.5)*0.12; g.add(po);
    const pin=new THREE.Mesh(new THREE.SphereGeometry(0.012,6,5),pinMats[Math.floor(Math.random()*pinMats.length)]);
    pin.position.set(x+(Math.random()-0.5)*0.04,y+ph/2-0.03,0.04); g.add(pin);
  }
  return g;
}
/* The architecture: pilasters, wainscot, picture rail, entablature. `cut`
   lists the stretches each wall must leave bare (doorways). */
function buildWallArchitecture(libWallMat,cut){
  const labels=[];
  for(const W of WALLS) for(let k=1;k<BAYS;k++) labels.push(["SECTION",`${W.id} ${String(k).padStart(2,"0")}`]);
  const atlas=makePlaqueAtlas(labels);
  plaqueMat=new THREE.MeshPhongMaterial({map:atlas.tex, specular:0x3a3a36, shininess:40});
  let li=0;
  const shaftH=LIB_WALL_H-1.6-(WAIN_H+0.1);
  for(const W of WALLS){
    const g=new THREE.Group(); g.position.set(W.cx,0,W.cz); g.rotation.y=W.ry; scene.add(g);
    W.group=g;
    const cuts=cut[W.id]||[];
    const inCut=s=>cuts.some(([a,b])=>s>a&&s<b);
    /* the pilasters */
    for(let k=1;k<BAYS;k++,li++){
      const s=pilS(k);
      if(inCut(s)) continue;
      wallBox(g,deskMat,PIL_W+0.14,WAIN_H+0.06,PIL_D+0.1, s,(WAIN_H+0.06)/2,(PIL_D+0.1)/2);
      wallBox(g,deskMatH,PIL_W+0.2,0.06,PIL_D+0.16, s,WAIN_H+0.08,(PIL_D+0.16)/2);
      wallBox(g,libWallMat,PIL_W,shaftH,PIL_D, s,WAIN_H+0.1+shaftH/2,PIL_D/2,4);
      wallBox(g,libWallMat,PIL_W+0.2,0.5,PIL_D+0.12, s,LIB_WALL_H-1.35,(PIL_D+0.12)/2,4);
      wallBox(g,libWallMat,PIL_W+0.36,0.16,PIL_D+0.22, s,LIB_WALL_H-1.02,(PIL_D+0.22)/2,4);
      const pq=new THREE.PlaneGeometry(0.34,0.21);
      setFaceUVPlane(pq,...atlas.uv(li));
      const plate=new THREE.Mesh(pq,plaqueMat);
      plate.position.set(s,2.55,PIL_D+0.004); g.add(plate);
      const p=wallPt(W,s,PIL_D/2);
      LIB.obstacles.push({x:p.x, z:p.z, r:0.36});
    }
    /* the entablature the pilasters carry, far up in the dark */
    wallBox(g,libWallMat,2*WALL_IN,0.55,0.3, 0,LIB_WALL_H-0.66,0.15,4);
    wallBox(g,libWallMat,2*WALL_IN,0.22,0.46, 0,LIB_WALL_H-0.28,0.23,4);
    /* the wainscot and the picture rail, bay by bay between the pilasters */
    const ends=[-WALL_IN]; for(let k=1;k<BAYS;k++) ends.push(pilS(k)); ends.push(WALL_IN);
    for(let i=0;i<ends.length-1;i++){
      let a=ends[i]+(i>0? (PIL_W+0.14)/2 : 0), b=ends[i+1]-(i<ends.length-2? (PIL_W+0.14)/2 : 0);
      /* split the stretch around any cut */
      let spans=[[a,b]];
      for(const[c0,c1]of cuts) spans=spans.flatMap(([p,q])=> c1<=p||c0>=q? [[p,q]] : [[p,Math.min(q,c0)],[Math.max(p,c1),q]].filter(([u,v])=>v-u>0.2));
      for(const[p,q]of spans) wainscot(g,p,q);
      /* the rail only has to clear the elevator, not a doorway */
      let rails=[[a,b]];
      for(const[c0,c1]of cuts.filter(c=>c.rail)) rails=rails.flatMap(([p,q])=> c1<=p||c0>=q? [[p,q]] : [[p,Math.min(q,c0)],[Math.max(p,c1),q]].filter(([u,v])=>v-u>0.2));
      for(const[p,q]of rails){
        const L=q-p, m=(p+q)/2;
        wallBox(g,skirtMat,L,0.05,0.036, m,RAIL_Y,0.018);
        wallBox(g,deskMatH,L,0.016,0.024, m,RAIL_Y-0.033,0.012);
      }
    }
  }
}
function wainscot(g,a,b){
  const L=b-a, m=(a+b)/2;
  wallBox(g,wainPanelMat,L,WAIN_H-0.2,0.016, m,0.2+(WAIN_H-0.2)/2,0.008);
  wallBox(g,skirtMat,L,0.2,0.045, m,0.1,0.0225);
  wallBox(g,deskMatH,L,0.022,0.055, m,0.205,0.0275);
  wallBox(g,deskMatH,L,0.07,0.032, m,0.255,0.016);
  wallBox(g,deskMatH,L,0.09,0.032, m,WAIN_H-0.085,0.016);
  wallBox(g,deskMatH,L,0.05,0.07, m,WAIN_H-0.015,0.035);
  wallBox(g,deskMatH,L,0.02,0.05, m,WAIN_H-0.05,0.025);
  const n=Math.max(1,Math.round(L/1.15)), pw=L/n;
  for(let i=0;i<=n;i++) wallBox(g,deskMat,0.075,WAIN_H-0.39,0.032, a+i*pw,0.29+(WAIN_H-0.39)/2,0.016);
  for(let i=0;i<n;i++) wallBox(g,deskMat,pw-0.16,WAIN_H-0.47,0.012, a+(i+0.5)*pw,0.29+(WAIN_H-0.39)/2,0.022);
}
/* PlaneGeometry is (u0,v1)(u1,v1)(u0,v0)(u1,v0) in vertex order */
function setFaceUVPlane(geo,u0,v0,u1,v1){
  const uv=geo.attributes.uv;
  uv.setXY(0,u0,v1); uv.setXY(1,u1,v1); uv.setXY(2,u0,v0); uv.setXY(3,u1,v0);
}
/* two wires down from hooks on the rail to a frame's top corners — or to
   nothing at all */
function hangWires(g,x,halfW,yTop,loose){
  const hx=halfW*0.62;
  for(const s of[-1,1]){
    wallBox(g,accentBrass,0.03,0.05,0.035, x+s*hx*0.75,RAIL_Y+0.02,0.045);
    const x0=x+s*hx*0.75, y0=RAIL_Y-0.01, x1=x+s*hx, y1=loose? RAIL_Y-rand(0.35,0.9) : yTop;
    const len=Math.hypot(x1-x0,y1-y0);
    const w=new THREE.Mesh(new THREE.BoxGeometry(0.004,len,0.004),wireMat);
    w.position.set((x0+x1)/2,(y0+y1)/2,0.05);
    w.rotation.z=Math.atan2(x1-x0,y0-y1);
    g.add(w);
    if(loose) wallBox(g,wireMat,0.02,0.035,0.008, x1,y1-0.015,0.05);
  }
}
function dressWalls(elevS){
  const occ={A:[],B:[],C:[],D:[]};
  occ.C.push({s:elevS,y:(ELEV.OPEN_H+1.6)/2,w:ELEV.OPEN_W+1.6,h:ELEV.OPEN_H+1.6});
  const free=(W,s,y,w,h)=>Math.abs(s)+w/2<WALL_IN-0.3 &&
    !occ[W.id].some(q=>Math.abs(q.s-s)<(q.w+w)/2+0.06&&Math.abs(q.y-y)<(q.h+h)/2+0.06);
  const book=(W,s,y,w,h)=>occ[W.id].push({s,y,w,h});
  const front=(W,s)=>{ const p=wallPt(W,s,2.0), c=worldToCell2(p.x,p.z);
    return c.cx>=0&&c.cy>=0&&c.cx<LW&&c.cy<LH&&grid2[c.cy][c.cx]===0; };
  const hangFramed=(W,s,sw,yc,opt,maxH)=>{
    const p=makeFramedArt(sw,opt);
    const k=Math.min(1,maxH/p.h);
    const w=p.w*k, h=p.h*k;
    const y=yc===null? Math.max(WAIN_H+0.25+h/2,2.2) : yc;
    if(!free(W,s,y,w,h)){ disposeArt(p); return null; }
    p.g.scale.setScalar(k);
    p.g.position.set(s,y,0.012); p.g.rotation.z=(Math.random()-0.5)*0.03;
    W.group.add(p.g); book(W,s,y,w,h);
    return {p,w,h,y};
  };
  for(const W of WALLS){
    W.frame=FRAME_MATS[Math.floor(Math.random()*FRAME_MATS.length)];
    for(let b=0;b<BAYS;b++){
      if(W.doorBay===b) continue;
      if(W.id==="C"&&Math.abs(b-(BAYS>>1))<1) continue;
      const s=bayS(b);
      if(!front(W,s)) continue;
      const wide=front(W,s-2.4)&&front(W,s+2.4);
      const fm=Math.random()<0.8? W.frame : null;
      const r=Math.random();
      const yTopMax=RAIL_Y-0.14;
      if(r<0.34||(!wide&&r<0.6)){
        const q=hangFramed(W,s,rand(1.05,1.55),null,{frame:fm,full:true},yTopMax-WAIN_H-0.25);
        if(q) hangWires(W.group,s,q.w/2,q.y+q.h/2,false);
      } else if(r<0.54&&wide){
        const land=Math.random()<0.4, sw=rand(0.72,0.95);
        for(const side of[-1,1]){
          const q=hangFramed(W,s+side*1.35,sw,2.25,{frame:fm||W.frame,land},1.7);
          if(q) hangWires(W.group,s+side*1.35,q.w/2,q.y+q.h/2,false);
        }
      } else if(r<0.64&&wide){
        const sw=rand(0.5,0.6);
        for(const side of[-1,0,1]){
          const q=hangFramed(W,s+side*1.3,sw,2.2,{frame:fm||W.frame,land:false},0.95);
          if(q) hangWires(W.group,s+side*1.3,q.w/2,q.y+q.h/2,false);
        }
      } else if(r<0.76){
        /* the frame has gone; the paint under it hasn't forgotten */
        const gw=rand(0.9,1.4), gh=rand(1.1,1.5), y=2.25;
        if(free(W,s,y,gw,gh)){
          const gp=new THREE.Mesh(new THREE.PlaneGeometry(gw,gh),ghostMat);
          gp.position.set(s,y,0.004); W.group.add(gp);
          hangWires(W.group,s,gw/2,0,true);
          book(W,s,y,gw,gh);
        }
      } else if(r<0.84){
        if(free(W,s,2.05,1.84,1.24)){
          const nb=makeNoticeBoard(); nb.position.set(s,2.05,0); W.group.add(nb);
          book(W,s,2.05,1.84,1.24);
        }
      }
      /* the rest of the bays stay bare, which is the point of them */
    }
    /* one clock per wall, over the rail — all of them at the same minute */
    for(let t=0;t<8;t++){
      const b=Math.floor(Math.random()*BAYS), s=bayS(b)+(Math.random()<0.5?0:BAY_W/2);
      if(!free(W,s,4.3,0.9,0.9)) continue;
      const c=makeWallClock(); c.position.set(s,4.3,0); W.group.add(c);
      book(W,s,4.3,0.9,0.9); break;
    }
    /* and one very large canvas, hung too high to see properly */
    for(let t=0;t<6;t++){
      const b=Math.floor(Math.random()*BAYS), s=bayS(b);
      if(W.id==="C"&&Math.abs(s)<BAY_W) continue;
      const q=hangFramed(W,s,rand(2.3,3.1),6.6,{frame:frameGiltMat,land:true,full:true},3.2);
      if(q) break;
    }
  }
  /* the level's own name, lettered big and high the way a stack hall's
     section headers are — and twice where it has no business being */
  const lettering=(W,s,y,rot,scale)=>{
    const txt=new THREE.Mesh(new THREE.PlaneGeometry(3.4*scale,0.85*scale),
      new THREE.MeshPhongMaterial({map:makeEndTextTexture(), transparent:true, specular:0x000000, shininess:1}));
    txt.position.set(s,y,0.02); txt.rotation.z=rot; W.group.add(txt);
  };
  const order=[...WALLS].sort(()=>Math.random()-0.5);
  for(const W of order.slice(0,3)){
    const b=1+Math.floor(Math.random()*(BAYS-2)), s=bayS(b);
    if(W.id==="C"&&Math.abs(s)<BAY_W) continue;
    if(free(W,s,10.2,6.4,1.6)){ lettering(W,s,10.2,0,1.9); book(W,s,10.2,6.4,1.6); }
  }
  for(let i=0;i<2;i++){
    const W=WALLS[Math.floor(Math.random()*4)], s=bayS(Math.floor(Math.random()*BAYS));
    const side=Math.random()<0.5, y=rand(4.8,8);
    if(free(W,s,y,side?0.85:3.4,side?3.4:0.85)){ lettering(W,s,y,side?Math.PI/2:Math.PI,1); book(W,s,y,side?0.85:3.4,side?3.4:0.85); }
  }
  /* cracks in the plaster, up where nothing else is */
  for(let i=0;i<10;i++){
    const W=WALLS[Math.floor(Math.random()*4)];
    const cw=rand(0.8,1.3), ch=rand(2.4,3.8), s=rand(-WALL_IN+2,WALL_IN-2), y=rand(4.6,15);
    if(!free(W,s,y,cw,ch)) continue;
    const cr=new THREE.Mesh(new THREE.PlaneGeometry(cw,ch),
      new THREE.MeshPhongMaterial({map:makeCrackTexture(), transparent:true,
        depthWrite:false, specular:0x000000, shininess:1}));
    cr.position.set(s,y,0.012); W.group.add(cr); book(W,s,y,cw,ch);
  }
}
function disposeArt(p){
  p.g.traverse(o=>{ if(o.isMesh){ o.geometry.dispose();
    if(!SHARED_ART.has(o.material)){ if(o.material.map) o.material.map.dispose(); o.material.dispose(); } } });
}
/* the doors are chosen before any wainscot is cut: at most one a wall, in
   a bay the stacks leave open, and never beside the arrival */
function chooseDoors(){
  const cut={A:[],B:[],C:[],D:[]}, doors=[];
  const front=(W,s)=>{ const p=wallPt(W,s,2.0), c=worldToCell2(p.x,p.z);
    return c.cx>=0&&c.cy>=0&&c.cx<LW&&c.cy<LH&&grid2[c.cy][c.cx]===0&&LIB.reach.has(c.cy*LW+c.cx); };
  const elevS=0;
  cut.C.push([elevS-ELEV.OPEN_W/2-0.62,elevS+ELEV.OPEN_W/2+0.62]);
  cut.C[0].rail=true;
  for(const W of WALLS){
    W.doorBay=-1;
    if(Math.random()<0.2&&doors.length>1) continue;
    for(let t=0;t<10;t++){
      const b=1+Math.floor(Math.random()*(BAYS-2));
      if(W.id==="C"&&Math.abs(b-(BAYS>>1))<=1) continue;
      const s=bayS(b);
      if(!front(W,s)||!front(W,s-1.2)||!front(W,s+1.2)) continue;
      W.doorBay=b; cut[W.id].push([s-1.18,s+1.18]);
      doors.push({W,s});
      break;
    }
  }
  return {cut,doors};
}

/* ================= the floor's furniture =================
   The reading room's other furniture: the card catalogue (the one object
   that says LIBRARY louder than a book does), green banker's lamps on the
   tables, the rope stanchions somebody closed a section with, a wet-floor
   sign on carpet — the most out-of-place object in the building, which is
   why it is here — and paper, everywhere, the way a place that emptied in
   a hurry leaves it. */
let catalogFaceMat=null;
const drawerHoleMat=new THREE.MeshBasicMaterial({color:0x080604});
const cardMat=new THREE.MeshPhongMaterial({color:0xd8cfb4, specular:0x111111, shininess:4});
const wetFloorMat=new THREE.MeshPhongMaterial({map:texWetFloor, specular:0x3a3420, shininess:40});
const ropeMat=new THREE.MeshPhongMaterial({color:0x5a1418, specular:0x1a0808, shininess:10});
const paperMat=new THREE.MeshPhongMaterial({map:texPaperSheets, side:THREE.DoubleSide, specular:0x111111, shininess:4});
const greenGlassMat=new THREE.MeshPhongMaterial({color:0x1d5a3c, specular:0x9ab8a8, shininess:90,
  emissive:0x02100a, side:THREE.DoubleSide});
const pencilMat=new THREE.MeshPhongMaterial({color:0xc89a2a, specular:0x3a3020, shininess:30});
const LAMP_BASE_GEO=new THREE.LatheGeometry([[0.001,0],[0.095,0],[0.1,0.012],[0.075,0.03],
  [0.03,0.042],[0.018,0.05],[0.001,0.052]].map(([r,y])=>new THREE.Vector2(r,y)),16);
function makeCardCatalog(){
  if(!catalogFaceMat){
    catalogFaceMat=new THREE.MeshPhongMaterial({map:makeCatalogTexture(), specular:0x2a2010, shininess:18});
    markShared(catalogFaceMat,catalogFaceMat.map);
  }
  const g=new THREE.Group(); g.userData.prop="catalog";
  const W=1.28, H=1.04, D=0.54, LEG=0.34;
  wallBox(g,deskMat,W,H,D, 0,LEG+H/2,0);
  wallBox(g,deskMatH,W+0.07,0.045,D+0.07, 0,LEG+H+0.0225,0);
  wallBox(g,deskMatH,W+0.02,0.07,D+0.02, 0,LEG-0.035,0);
  for(const sx of[-1,1])for(const sz of[-1,1]){
    const leg=new THREE.Mesh(taperBox(0.07,LEG-0.07,0.07,0.7),deskMat);
    leg.position.set(sx*(W/2-0.05),(LEG-0.07)/2,sz*(D/2-0.05)); g.add(leg);
  }
  const face=new THREE.Mesh(new THREE.PlaneGeometry(W-0.02,H-0.02),catalogFaceMat);
  face.position.set(0,LEG+H/2,D/2+0.002); g.add(face);
  /* somebody was looking something up */
  const dw=(W-0.02)/CATALOG_COLS, dh=(H-0.02)/CATALOG_ROWS;
  const n=Math.floor(Math.random()*3.2);
  for(let i=0;i<n;i++){
    const c=Math.floor(Math.random()*CATALOG_COLS), r=Math.floor(Math.random()*CATALOG_ROWS);
    const x=-W/2+0.01+(c+0.5)*dw, y=LEG+H-0.01-(r+0.5)*dh, out=rand(0.12,0.34);
    const hole=new THREE.Mesh(new THREE.PlaneGeometry(dw-0.012,dh-0.012),drawerHoleMat);
    hole.position.set(x,y,D/2+0.003); g.add(hole);
    const zf=D/2+out;
    wallBox(g,deskMat,dw-0.012,dh-0.012,0.014, x,y,zf-0.007);
    wallBox(g,deskMat,dw-0.02,0.008,0.4, x,y-dh/2+0.012,zf-0.2);
    for(const s of[-1,1]) wallBox(g,deskMat,0.008,dh-0.03,0.4, x+s*(dw/2-0.014),y-0.004,zf-0.2);
    wallBox(g,cardMat,dw-0.04,dh-0.04,0.3, x,y-0.01,zf-0.2);
    wallBox(g,accentBrass,0.03,0.012,0.012, x,y-0.006,zf+0.006);
  }
  /* and one drawer never went back in */
  if(Math.random()<0.3){
    const x=rand(-0.5,0.5), z=D/2+rand(0.4,0.8);
    const dr=new THREE.Group(); dr.position.set(x,0,z); dr.rotation.y=Math.random()*6.28; g.add(dr);
    wallBox(dr,deskMat,dw-0.012,dh-0.012,0.4, 0,(dh-0.012)/2,0);
    for(let k=0;k<12;k++){
      const cd=new THREE.Mesh(new THREE.BoxGeometry(0.125,0.0008,0.076),cardMat);
      cd.position.set(rand(-0.3,0.3),0.001+k*0.0009,rand(-0.1,0.45)); cd.rotation.y=Math.random()*6.28; dr.add(cd);
    }
  }
  return g;
}
function makeWetFloorSign(){
  const g=new THREE.Group(); g.userData.prop="wetfloor";
  const PW=0.3, PH=0.62, A=0.2;
  for(const s of[-1,1]){
    const geo=new THREE.BoxGeometry(PW,PH,0.012); geo.translate(0,-PH/2,0);
    const p=new THREE.Mesh(geo,wetFloorMat);
    p.position.y=PH*Math.cos(A)+0.004; p.rotation.x=s*A; g.add(p);
  }
  wallBox(g,wetFloorMat,0.14,0.05,0.035, 0,PH*Math.cos(A)+0.03,0);
  return g;
}
/* brass posts and a velvet rope — and one end of it let down */
function makeStanchions(n){
  const g=new THREE.Group(); g.userData.prop="stanchion";
  const xs=[]; for(let i=0;i<n;i++) xs.push((i-(n-1)/2)*1.6);
  for(const x of xs){
    const base=new THREE.Mesh(new THREE.CylinderGeometry(0.15,0.17,0.035,16),accentBrass); base.position.set(x,0.0175,0); g.add(base);
    const pole=new THREE.Mesh(new THREE.CylinderGeometry(0.024,0.024,0.9,10),accentBrass); pole.position.set(x,0.48,0); g.add(pole);
    const knob=new THREE.Mesh(new THREE.SphereGeometry(0.045,10,8),accentBrass); knob.position.set(x,0.95,0); g.add(knob);
  }
  const dropAt=Math.random()<0.5? Math.floor(Math.random()*(n-1)) : -1;
  for(let i=0;i<n-1;i++){
    const a=new THREE.Vector3(xs[i]+0.03,0.9,0), b=new THREE.Vector3(xs[i+1]-0.03,0.9,0), pts=[];
    for(let k=0;k<=12;k++){
      const t=k/12;
      if(i===dropAt){ const hang=new THREE.Vector3(xs[i]+0.06,0.02,0.05); pts.push(a.clone().lerp(hang,t).add(new THREE.Vector3(Math.sin(t*Math.PI)*0.1,0,0))); }
      else pts.push(a.clone().lerp(b,t).add(new THREE.Vector3(0,-Math.sin(t*Math.PI)*0.2,0)));
    }
    if(i===dropAt) pts.push(new THREE.Vector3(xs[i]+0.25,0.02,0.1),new THREE.Vector3(xs[i]+0.5,0.02,0.02));
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),24,0.02,6,false),ropeMat));
  }
  return {g,xs};
}
/* one sheet, curling off whatever it landed on */
function paperSheet(){
  const geo=new THREE.PlaneGeometry(0.21,0.297,2,2);
  const [u0,v0,u1,v1]=PAPER_UV[Math.floor(Math.random()*PAPER_UV.length)];
  const uv=geo.attributes.uv, ps=geo.attributes.position;
  for(let i=0;i<uv.count;i++){ uv.setXY(i,u0+uv.getX(i)*(u1-u0),v0+uv.getY(i)*(v1-v0)); }
  const lift=[0,2,6,8][Math.floor(Math.random()*4)];
  ps.setZ(lift,0.012+Math.random()*0.025); ps.setZ(4,0.003);
  geo.rotateX(-Math.PI/2); geo.computeVertexNormals();
  return new THREE.Mesh(geo,paperMat);
}
function scatterPapers(parent,x,y,z,n,spread){
  for(let i=0;i<n;i++){
    const p=paperSheet();
    p.position.set(x+rand(-spread,spread),y+0.002+i*0.0012,z+rand(-spread,spread));
    p.rotation.y=Math.random()*6.28; parent.add(p);
  }
}
function makeBankersLamp(){
  const g=new THREE.Group();
  g.add(new THREE.Mesh(LAMP_BASE_GEO,accentBrass));
  const stem=new THREE.Mesh(new THREE.CylinderGeometry(0.011,0.011,0.34,8),accentBrass);
  stem.position.y=0.21; g.add(stem);
  const yoke=new THREE.Mesh(new THREE.BoxGeometry(0.2,0.012,0.012),accentBrass);
  yoke.position.set(0,0.37,0); g.add(yoke);
  const shade=new THREE.Mesh(new THREE.CylinderGeometry(0.1,0.1,0.36,18,1,false,0,Math.PI),greenGlassMat);
  shade.rotation.z=Math.PI/2; shade.rotation.y=0.18; shade.position.set(0,0.40,0.02); g.add(shade);
  const chain=new THREE.Mesh(new THREE.CylinderGeometry(0.002,0.002,0.12,4),accentBrass);
  chain.position.set(0.08,0.33,0.06); g.add(chain);
  return g;
}
/* what the last readers left on a table: a lamp, a stack, an open book,
   paper. Kept to the ENDS of the table — the middle is where the disks go */
const TABLE_TOP=TABLE_Y+0.0375;
function dressTable(tb,ends){
  for(const e of ends){
    const x=e*rand(1.1,1.45), z=rand(-1.0,1.0), r=Math.random();
    if(r<0.4&&!tb.userData.lamp){
      const l=makeBankersLamp(); l.position.set(x,TABLE_TOP,z); l.rotation.y=-e*Math.PI/2+rand(-0.4,0.4);
      tb.add(l); tb.userData.lamp=true;
      if(Math.random()<0.6) scatterPapers(tb,x-e*0.25,TABLE_TOP,z,1+Math.floor(Math.random()*2),0.12);
    } else if(r<0.65){
      let lift=0;
      for(let i=0,n=2+Math.floor(Math.random()*4);i<n;i++){
        const des=pickBook();
        spawnBook(tb,des,x+rand(-0.02,0.02),TABLE_TOP,z+rand(-0.02,0.02),1,{flat:true,lift,yaw:rand(-0.3,0.3)+Math.PI/2});
        lift+=des.tx;
      }
    } else if(r<0.82){
      const ob=OPEN_BOOK.clone(); ob.position.set(x,TABLE_TOP,z); ob.rotation.y=rand(-0.6,0.6)+(e>0?Math.PI/2:-Math.PI/2); tb.add(ob);
    } else scatterPapers(tb,x,TABLE_TOP,z,2+Math.floor(Math.random()*3),0.15);
    if(Math.random()<0.4){
      const pc=new THREE.Mesh(new THREE.CylinderGeometry(0.004,0.004,0.18,6),pencilMat);
      pc.rotation.z=Math.PI/2; pc.rotation.y=Math.random()*6.28; pc.position.set(x-e*0.3,TABLE_TOP+0.004,z+rand(-0.2,0.2)); tb.add(pc);
    }
  }
}
/* the wooden book truck: sloped shelves either side of a spine so the
   books lie back against it, and a load nobody reshelved */
function makeBookTruck(){
  const g=new THREE.Group(); g.userData.prop="cart";
  const L=0.9, W=0.5, B=0.13, TOP=1.02, SL=0.2;
  for(const s of[-1,1]) wallBox(g,deskMat,0.03,TOP-B,W, s*L/2,(TOP+B)/2,0);
  wallBox(g,deskMatH,L+0.06,0.035,W+0.04, 0,B,0);
  wallBox(g,deskMatH,L,TOP-B-0.05,0.018, 0,(TOP+B)/2,0);
  wallBox(g,deskMatH,L+0.08,0.03,0.08, 0,TOP+0.015,0);
  const levels=[B+0.05,B+0.36,B+0.66];
  for(const y of levels) for(const s of[-1,1]){
    const b=wallBox(g,deskMatH,L-0.01,0.016,W/2-0.02, 0,y,s*(W/4));
    b.rotation.x=-s*SL;                          // falling away toward the spine
    wallBox(g,deskMatH,L-0.01,0.05,0.012, 0,y+(W/4-0.01)*Math.tan(SL)+0.022,s*(W/2-0.012));
  }
  for(const sx of[-1,1])for(const sz of[-1,1]){
    const t=new THREE.Mesh(new THREE.CylinderGeometry(0.045,0.045,0.028,12),cartRubberMat);
    t.rotation.z=Math.PI/2; t.position.set(sx*(L/2-0.07),0.045,sz*(W/2-0.07)); g.add(t);
    wallBox(g,cartSteelMat,0.05,0.06,0.04, sx*(L/2-0.07),0.09,sz*(W/2-0.07));
  }
  /* the load, leaning back against the spine */
  for(const y of levels) for(const s of[-1,1]){
    if(Math.random()<0.25) continue;
    let x=-L/2+0.04+Math.random()*0.15;
    while(x<L/2-0.08){
      const des=pickBook();
      if(x+des.tx>L/2-0.04) break;
      if(des.d>W/2-0.03){ x+=des.tx; continue; }
      const m=new THREE.Mesh(des.geo,des.mats);
      m.rotation.order="YXZ"; m.rotation.set(SL,s>0?Math.PI:0,0);
      const zc=s*(W/2-0.03-des.d/2);
      m.position.set(x+des.tx/2, y+0.009+(Math.abs(zc)-W/4)*Math.tan(SL), zc);
      g.add(m);
      x+=des.tx+(Math.random()<0.1? 0.08:0.002);
    }
  }
  return g;
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
  /* the dig's dust and spoil are built now, hidden, so their programs are
     compiled with everything else rather than mid-cutscene */
  {
    const fxg=new THREE.Group(); fxg.visible=false; fxg.userData.animated=true;
    const dust=makeDustSystem(360), debris=makeDebris(140,0x3a4658);
    fxg.add(dust.mesh,debris.clods,debris.shreds); scene.add(fxg);
    LIB.digFx={group:fxg,dust,debris};
  }
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
  /* the architecture the hang follows, with its doorways cut first */
  const {cut,doors}=chooseDoors();
  buildWallArchitecture(libWallMat,cut);
  doors.forEach((d,i)=>{
    const dg=makeLockedDoor(i===0), p=wallPt(d.W,d.s,0);
    dg.position.set(p.x,0,p.z); dg.rotation.y=d.W.ry; scene.add(dg);
    addInteractable({kind:"lockedDoor", mesh:dg, label:"OPEN DOOR", taken:false});
  });
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
      const wrapped=srand()<0.35;
      const ch=makeChair(wrapped);
      ch.position.set(cx,0,cz);
      ch.rotation.y=ang+Math.PI+(srand()-0.5)*0.6;
      /* one in eight went over and nobody picked it up */
      if(!wrapped&&Math.random()<0.13){ ch.rotation.order="YXZ"; ch.rotation.z=Math.PI/2; ch.position.y=0.245; }
      scene.add(ch);
      LIB.obstacles.push({x:cx, z:cz, r:0.34});
    }
    /* a machine sits at one end of its table; the readers' leavings take
       the ends the machine left free */
    const pcEnd=pcTables.has(i)? (Math.random()<0.5?-1:1) : 0;
    dressTable(tb, pcEnd? [-pcEnd] : [-1,1]);
    if(pcTables.has(i)){
      const pc=makeVintagePC(0.85);
      const lp=new THREE.Vector3(pcEnd*rand(0.55,0.8),0,rand(-0.4,0.4)).applyAxisAngle(new THREE.Vector3(0,1,0),tb.rotation.y);
      pc.position.set(p.x+lp.x,1.345,p.z+lp.z);
      pc.rotation.y=srand()*Math.PI*2;
      scene.add(pc);
      tc.pc=true;
      if(!eggArmed){
        /* exactly one of them still has a breath left in it */
        eggArmed=true;
        addInteractable({kind:"deadpc", mesh:pc, label:"TURN ON", taken:false});
      }
    }
  });
  /* the librarian's desk + terminal */
  {
    const d=makeDesk(cx0,cy0);
    scene.add(d.group);
    LIB.deskPos=new THREE.Vector3().copy(d.group.position);
    LIB.obstacles.push({x:LIB.deskPos.x+0.35, z:LIB.deskPos.z-1.35, r:0.34});   // the librarian's chair
    LIB.term={group:d.group, pc:d.pc, screen:d.pc.userData.screen,
              lamp:d.lamp, bulbMat:d.bulbMat};
    addInteractable({kind:"terminal", mesh:d.group,
      label:()=> STATE.discsCarried>0
        ? `INSERT ${STATE.discsCarried} DISK${STATE.discsCarried>1?"S":""}`
        : "NO DISKS TO INSERT", taken:false});
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
  dropFloor(makeLectern,10,0.36);
  dropFloor(makeMannequin,9,0.3);
  dropFloor(makeBookCart,5,CART_R);
  dropFloor(makeBookTruck,4,0.55);
  dropFloor(makeGlobe,4,0.34);
  dropFloor(makeCardCatalog,6,0.72);
  dropFloor(makeWetFloorSign,3,0.26);
  /* a section roped off — from what, nobody says */
  for(let i=0;i<2;i++){
    const n=3+Math.floor(Math.random()*2), half=(n-1)*0.8;
    for(let t=0;t<14;t++){
      const c=LIB.reachList[Math.floor(srand()*LIB.reachList.length)], p=cellToWorld2(c.cx,c.cy);
      const yaw=Math.floor(Math.random()*2)*Math.PI/2, ax=Math.cos(yaw), az=-Math.sin(yaw);
      const posts=[]; for(let k=0;k<n;k++){ const o=(k-(n-1)/2)*1.6; posts.push({x:p.x+ax*o, z:p.z+az*o}); }
      if(!posts.every(q=>clearOf(q.x,q.z,0.22)&&LIB.reach.has(K(worldToCell2(q.x,q.z).cx,worldToCell2(q.x,q.z).cy)))) continue;
      const st=makeStanchions(n); st.g.position.set(p.x,0,p.z); st.g.rotation.y=yaw; scene.add(st.g);
      for(const q of posts) LIB.obstacles.push({x:q.x, z:q.z, r:0.2});
      break;
    }
  }
  /* paper on the carpet, in drifts, and books that came off the shelves */
  const floorFree=(x,z)=>Math.hypot(x-holeC.x,z-holeC.z)>HOLE_R+1.2;
  for(let i=0;i<14;i++){
    const c=LIB.reachList[Math.floor(srand()*LIB.reachList.length)], p=cellToWorld2(c.cx,c.cy);
    const x=p.x+rand(-1.4,1.4), z=p.z+rand(-1.4,1.4);
    if(floorFree(x,z)) scatterPapers(scene,x,0.001,z,1+Math.floor(Math.random()*4),0.5);
  }
  for(const run of LIB.runs){
    if(Math.random()>0.4) continue;
    const c=run.cells[Math.floor(Math.random()*run.cells.length)], p=cellToWorld2(c.x,c.y);
    const [dx,dz]=run.axis===0? [0,Math.random()<0.5?1:-1] : [Math.random()<0.5?1:-1,0];
    if(!LIB.reach.has(K(c.x+dx,c.y+dz))) continue;
    for(let k=0,n=1+Math.floor(Math.random()*3);k<n;k++){
      const off=SHELF_D/2+rand(0.25,0.9), along=rand(-1.4,1.4);
      const x=p.x+dx*off+(run.axis===0?along:0), z=p.z+dz*off+(run.axis===1?along:0);
      if(!floorFree(x,z)) continue;
      if(Math.random()<0.2){ const ob=OPEN_BOOK.clone(); ob.position.set(x,0.002,z); ob.rotation.y=Math.random()*6.28; scene.add(ob); }
      else spawnBook(scene,pickBook(),x,0.002,z,1,{flat:true,yaw:Math.random()*6.28});
    }
  }
  dressWalls(0);
  /* every pane of picture glass in the room, merged: it is transparent, so
     batchStatic leaves it alone */
  {
    scene.updateMatrixWorld(true);
    const panes=[];
    for(const W of WALLS) W.group.traverse(o=>{ if(o.isMesh&&o.material===artGlassMat) panes.push(o); });
    if(panes.length){
      scene.add(mergeStatic(panes,artGlassMat));
      for(const m of panes){ m.parent.remove(m); m.geometry.dispose(); }
    }
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
    /* the middle of the table: the machines and the readers' leavings
       have the ends, and a disk dropped onto a keyboard is a disk inside a PC */
    if(tc.pc) continue;
    sites.push({cx:tc.x, cy:tc.y, x:p.x+rand(-0.55,0.55), z:p.z+rand(-0.5,0.5), y:1.37, kind:"table"});
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
  /* ~2400 meshes, most of them books, drew one call each — two for a book.
     Regrouped by material the room draws in ~200-350. Splitting the batches
     by region to let far ones cull cost more calls than it saved triangles. */
  LIB.batch=batchStatic(scene);
  /* freeze every static object's matrix (shelves, furniture, dressing,
     fixtures, merged walls). The spider is added after this returns; the discs
     and the elevator are tagged animated, so the sweep skips them. */
  freezeStaticScene();
  /* pre-warm every shader program and texture — the hidden hole's included —
     while the level is still behind the intro's black. First-use compilation
     at reveal time was a visible frame stall in the ending cutscene. */
  LIB.hole.group.visible=true; LIB.digFx.group.visible=true;
  renderer.compile(scene,camera);
  LIB.hole.group.visible=false; LIB.digFx.group.visible=false;
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
    /* the discs are for looking DOWN the well from the rim; from inside the
       shaft you would see them edge-on as plates, so they go as you descend */
    const fromRim=clamp(1+camera.position.y/4,0,1);
    LIB.hole.glow.forEach((gl,i)=>{ gl.mat.opacity=gl.baseOp*(1+0.10*Math.sin(tN*0.7+i*1.7))*fromRim; });
    if(LIB.hole.motes){ LIB.hole.motes.rotation.y+=dt*0.03; LIB.hole.motes.position.y=Math.sin(tN*0.21)*0.25; }
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
markShared(jarGlassMat,jarDregsMat,hourGlassMat,sandMat,candleMat,JAR_GEO,JAR_LID_GEO,JAR_DREGS_GEO);
markShared(wainPanelMat,skirtMat,wireMat,ghostMat,corkMat,clockFaceMat,bakeliteMat,exitSignMat,
           staffSignMat,darkWoodMat,doorGlassMat,...pinMats,
           texCork,texGhost,texClockFace,texExitSign,texStaffSign);
markShared(deskShadeMat,closedCardMat,closedCardMat.map,MOUSE_GEO,BEZEL_GEO,filmBack,filmFront,texStretchFilm);
markShared(ironMat,rootMat,jutelMat,concreteMat,shaftSilkMat,texShaftMasonry,texShaftMasonryBump,texSpoil,texSlabSection);
markShared(drawerHoleMat,cardMat,wetFloorMat,ropeMat,paperMat,greenGlassMat,pencilMat,LAMP_BASE_GEO,
           texWetFloor,texPaperSheets);
markShared(texWrapFilm,texTape,texCartPaint,texMannequin,             // the graphics pass's own
           wrapTapeMat,cartRubberMat,cartSteelMat,mannequinIron,
           ...cartPaintMats, frameGiltMat,frameEbonyMat,frameOakMat,artGlassMat,artMatMat,artBackMat);
