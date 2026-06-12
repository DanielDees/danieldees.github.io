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
import { rand, clamp, lerp, srand } from "./utils.js";
import { CELL } from "./map.js";
import { STATE } from "./state.js";
import { scene, lights, hemi, amb, makeLightRecord } from "./scene.js";
import { makeCanvas, texLibWall, texLibCarpet, texLibCeil, texShelfWood, texDeskWood,
         makeCrackTexture, makeEndTextTexture, makePosterTexture, scaleBoxUV } from "./textures.js";
import { makeElevator, ELEV, addInteractable } from "./props.js";
import { sfxLightsOut, escalateLibraryAmbience, sfxComputerBoot, sfxComputerStatic } from "./audio.js";
import { toast } from "./ui.js";

export const LW=35, LH=35, LIB_WALL_H=8.0;
export const ROOM_SPAN=LW*CELL;                  // 140m — reaction times scale off this
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
  blackT:0, nextBlack:45,             // temporary whole-floor light failures
};

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
    if(t===2) hz=0.78; else if(t===3) hx=0.78;     // shelf slab across the run
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
  for(let t=0;t<48;t++){
    const fromWall=srand()<0.30;
    let ax,ay,axis;                      // start cell + run axis (0=x, 1=z)
    if(fromWall){
      const side=Math.floor(srand()*4);
      if(side===0){ ax=1;            ay=1+Math.floor(srand()*(LH-2)); axis=0; }
      else if(side===1){ ax=LW-2;    ay=1+Math.floor(srand()*(LH-2)); axis=0; }
      else if(side===2){ ax=1+Math.floor(srand()*(LW-2)); ay=1;       axis=1; }
      else            { ax=1+Math.floor(srand()*(LW-2)); ay=LH-2;     axis=1; }
    } else {
      ax=2+Math.floor(srand()*(LW-4)); ay=2+Math.floor(srand()*(LH-4));
      axis=srand()<0.5?0:1;
    }
    const len=3+Math.floor(srand()*6);   // 3–8 cells
    const dir=fromWall? (axis===0?(ax===1?1:-1):(ay===1?1:-1)) : (srand()<0.5?1:-1);
    for(let i=0;i<len;i++){
      const x=axis===0? ax+dir*i : ax, y=axis===0? ay : ay+dir*i;
      if(!inB(x,y)) break;
      if(prot.has(K(x,y))) break;
      const cur=grid2[y][x];
      if(cur===1||cur===4||cur===5) break;
      if(cur===0) grid2[y][x]=axis===0?2:3;
    }
  }
  /* tables: scattered islands, never in the protected clearings */
  const tables=[];
  for(let t=0;t<60&&tables.length<15;t++){
    const x=2+Math.floor(srand()*(LW-4)), y=2+Math.floor(srand()*(LH-4));
    if(grid2[y][x]!==0||prot.has(K(x,y))) continue;
    grid2[y][x]=4; tables.push({x,y});
  }
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
const shelfMat=new THREE.MeshPhongMaterial({map:texShelfWood, specular:0x16100a, shininess:8});
const deskMat =new THREE.MeshPhongMaterial({map:texDeskWood,  specular:0x1c1408, shininess:12});
const darkMetalMat=new THREE.MeshPhongMaterial({color:0x474b50, specular:0x303336, shininess:36});
const beigePlastic=new THREE.MeshPhongMaterial({color:0xb6ad97, specular:0x2a2822, shininess:18});
const beigePlasticDark=new THREE.MeshPhongMaterial({color:0x8e8672, specular:0x222018, shininess:14});
/* untouched objects "wrapped in plastic packaging" */
const plasticWrap=new THREE.MeshPhongMaterial({color:0xcfd6da, specular:0x888d92, shininess:60,
  transparent:true, opacity:0.18, depthWrite:false});

function makeShelfRun(run){
  /* one continuous double-sided open stack: uprights at every cell seam,
     long bare boards spanning the whole run, the occasional lone book or
     sagging board — virtually devoid of books, exactly as described */
  const g=new THREE.Group();
  const len=run.cells.length*CELL, H=2.3, D=1.5;   // capped a row lower for sightlines
  const boardGeo=new THREE.BoxGeometry(len,0.055,D);
  for(const by of[0.12,0.66,1.2,1.74,2.28]){
    const b=new THREE.Mesh(boardGeo,shelfMat); b.position.y=by; g.add(b);
  }
  const upGeo=new THREE.BoxGeometry(0.09,H,D);
  for(let i=0;i<=run.cells.length;i++){
    const u=new THREE.Mesh(upGeo,shelfMat);
    u.position.set(-len/2+i*CELL,H/2,0); g.add(u);
  }
  if(Math.random()<0.5){                       // a thin centre spine on some runs
    const sp=new THREE.Mesh(new THREE.BoxGeometry(len,H-0.2,0.04),shelfMat);
    sp.position.y=H/2; g.add(sp);
  }
  /* lone forgotten books */
  const nB=Math.random()<0.55? 1+Math.floor(Math.random()*3) : 0;
  for(let i=0;i<nB;i++){
    const bw=0.05+Math.random()*0.2;
    const book=new THREE.Mesh(new THREE.BoxGeometry(bw,0.30,0.2),
      new THREE.MeshPhongMaterial({color:[0x5a3a2a,0x32402e,0x3a3046,0x53503c][Math.floor(Math.random()*4)],
        specular:0x111111, shininess:6}));
    const lean=Math.random()<0.5? (Math.random()-0.5)*0.5 : 0;
    book.position.set(rand(-len/2+0.4,len/2-0.4), [0.66,1.2,1.74][Math.floor(Math.random()*3)]+0.155, rand(-0.4,0.4));
    book.rotation.z=lean;
    g.add(book);
  }
  /* temporal decay: a collapsed board leaning inside the frame */
  if(Math.random()<0.30){
    const fall=new THREE.Mesh(new THREE.BoxGeometry(CELL*0.9,0.05,D*0.9),shelfMat);
    fall.position.set(rand(-len/2+2,len/2-2),0.62,0);
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
function makeTable(){
  /* just tall enough, easily wide and long enough to crouch under */
  const g=new THREE.Group();
  const top=new THREE.Mesh(new THREE.BoxGeometry(3.6,0.09,3.0),deskMat);
  top.position.y=1.3; g.add(top);
  const skirtL=new THREE.Mesh(new THREE.BoxGeometry(3.3,0.12,0.06),deskMat);
  skirtL.position.set(0,1.2,1.32); g.add(skirtL);
  const skirtR=skirtL.clone(); skirtR.position.z=-1.32; g.add(skirtR);
  const legGeo=new THREE.BoxGeometry(0.12,1.26,0.12);
  for(const[sx,sz]of[[-1,-1],[1,-1],[-1,1],[1,1]]){
    const l=new THREE.Mesh(legGeo,deskMat);
    l.position.set(sx*1.62,0.63,sz*1.32); g.add(l);
  }
  return g;
}
function makeChair(wrapped){
  const g=new THREE.Group();
  const seat=new THREE.Mesh(new THREE.BoxGeometry(0.46,0.05,0.44),deskMat);
  seat.position.y=0.47; g.add(seat);
  const back=new THREE.Mesh(new THREE.BoxGeometry(0.46,0.5,0.05),deskMat);
  back.position.set(0,0.74,-0.21); g.add(back);
  const legGeo=new THREE.BoxGeometry(0.05,0.46,0.05);
  for(const[sx,sz]of[[-1,-1],[1,-1],[-1,1],[1,1]]){
    const l=new THREE.Mesh(legGeo,deskMat);
    l.position.set(sx*0.19,0.23,sz*0.18); g.add(l);
  }
  if(wrapped){
    const wrap=new THREE.Mesh(new THREE.BoxGeometry(0.56,1.04,0.56),plasticWrap);
    wrap.position.y=0.52; g.add(wrap);
  }
  return g;
}
function makeLadder(){
  const g=new THREE.Group(), H=2.5;
  const railGeo=new THREE.BoxGeometry(0.06,H,0.1);
  for(const sx of[-0.3,0.3]){
    const r=new THREE.Mesh(railGeo,shelfMat); r.position.set(sx,H/2,0); g.add(r);
  }
  for(let i=0;i<6;i++){
    const rung=new THREE.Mesh(new THREE.BoxGeometry(0.6,0.05,0.05),shelfMat);
    rung.position.y=0.28+i*0.37; g.add(rung);
  }
  g.rotation.x=-0.22;                            // leant against the stack
  return g;
}
function makeLectern(){
  const g=new THREE.Group();
  const col=new THREE.Mesh(new THREE.BoxGeometry(0.14,1.1,0.14),shelfMat);
  col.position.y=0.55; g.add(col);
  const foot=new THREE.Mesh(new THREE.BoxGeometry(0.5,0.06,0.5),shelfMat);
  foot.position.y=0.03; g.add(foot);
  const top=new THREE.Mesh(new THREE.BoxGeometry(0.62,0.04,0.48),deskMat);
  top.position.y=1.16; top.rotation.x=-0.25; g.add(top);
  return g;
}
/* a 3.5" floppy disk — the only thing in this library worth taking */
function makeDisc(){
  const g=new THREE.Group();
  const body=new THREE.Mesh(new THREE.BoxGeometry(0.27,0.022,0.27),
    new THREE.MeshPhongMaterial({color:0x181b22, emissive:0x0e1424, specular:0x30343c, shininess:30}));
  g.add(body);
  /* the label carries a faint phosphor sheen — findable in the murk */
  const label=new THREE.Mesh(new THREE.BoxGeometry(0.2,0.024,0.13),
    new THREE.MeshPhongMaterial({color:0xcfc8b4, emissive:0x2a2618, specular:0x111111, shininess:4}));
  label.position.set(0,0.002,0.05); g.add(label);
  const shutter=new THREE.Mesh(new THREE.BoxGeometry(0.16,0.026,0.07),
    new THREE.MeshPhongMaterial({color:0x9aa0a6, specular:0x55585c, shininess:60}));
  shutter.position.set(-0.01,0,-0.09); g.add(shutter);
  g.scale.setScalar(1.35);                       // readable from a few metres out
  return g;
}
/* vintage personal computer: CRT + case + keyboard, in pristine condition.
   Returns the group plus a tiny screen-painting API the boot sequences use. */
export function makeVintagePC(scale=1){
  const g=new THREE.Group();
  const cse=new THREE.Mesh(new THREE.BoxGeometry(0.62,0.16,0.5),beigePlastic);
  cse.position.y=0.08; g.add(cse);
  /* drive bays + the slot the discs go into */
  const slot=new THREE.Mesh(new THREE.BoxGeometry(0.26,0.035,0.02),beigePlasticDark);
  slot.position.set(-0.1,0.08,0.251); g.add(slot);
  const led=new THREE.Mesh(new THREE.BoxGeometry(0.02,0.02,0.012),
    new THREE.MeshBasicMaterial({color:0x201008}));
  led.position.set(0.18,0.08,0.252); g.add(led); g.userData.led=led.material;
  /* CRT body, slightly tapered toward the back */
  const crt=new THREE.Mesh(new THREE.BoxGeometry(0.56,0.46,0.5),beigePlastic);
  crt.position.y=0.16+0.25; crt.scale.z=1;
  g.add(crt);
  const back=new THREE.Mesh(new THREE.BoxGeometry(0.4,0.34,0.12),beigePlasticDark);
  back.position.set(0,0.41,-0.3); g.add(back);
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
  };
  screen.off();
  const scrMat=new THREE.MeshBasicMaterial({map:tex});
  const scr=new THREE.Mesh(new THREE.PlaneGeometry(0.42,0.3),scrMat);
  scr.position.set(0,0.41,0.252); g.add(scr);
  g.userData.screen=screen; g.userData.scrMat=scrMat;
  const kb=new THREE.Mesh(new THREE.BoxGeometry(0.5,0.035,0.2),beigePlastic);
  kb.position.set(0,0.018,0.45); kb.rotation.x=0.06; g.add(kb);
  const keys=new THREE.Mesh(new THREE.BoxGeometry(0.44,0.02,0.15),beigePlasticDark);
  keys.position.set(0,0.042,0.448); keys.rotation.x=0.06; g.add(keys);
  g.scale.setScalar(scale);
  return g;
}
function makeDesk(cx0,cy0){
  /* the circulation desk: a long counter spanning its three cells, the
     terminal at its middle under the one dependable lamp in the building */
  const g=new THREE.Group();
  const p=cellToWorld2(cx0,cy0);
  g.position.set(p.x,0,p.z);
  const len=3*CELL-1.2;
  const body=new THREE.Mesh(new THREE.BoxGeometry(len,1.12,1.7),deskMat);
  body.position.y=0.56; g.add(body);
  const top=new THREE.Mesh(new THREE.BoxGeometry(len+0.3,0.07,1.95),deskMat);
  top.position.y=1.155; g.add(top);
  const kick=new THREE.Mesh(new THREE.BoxGeometry(len,0.16,1.74),
    new THREE.MeshPhongMaterial({color:0x241a10, specular:0x000000, shininess:2}));
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
  return {group:g, pc};
}
/* a hanging twin-tube strip light, chained down from the high dark */
const tubeGeo2=new THREE.CylinderGeometry(0.038,0.038,2.0,8); tubeGeo2.rotateZ(Math.PI/2);
const housingGeo2=new THREE.BoxGeometry(2.2,0.1,0.34);
const housingMat2=new THREE.MeshPhongMaterial({color:0x6a6e66,emissive:0x070706,
  specular:0x3a3c36,shininess:40});
const cordGeo=new THREE.CylinderGeometry(0.012,0.012,1,4);
function makeFixture(wx,wz,alongZ){
  const g=new THREE.Group();
  const glowMat=new THREE.MeshBasicMaterial({color:0x111008});
  const tubeMat=new THREE.MeshBasicMaterial({color:0x111008});
  const FY=3.15;                                   // hung 3.15m up, far below the 8m ceiling
  const housing=new THREE.Mesh(housingGeo2,housingMat2);
  housing.position.y=FY+0.05; g.add(housing);
  const plate=new THREE.Mesh(new THREE.PlaneGeometry(2.1,0.3),glowMat);
  plate.rotation.x=Math.PI/2; plate.position.y=FY+0.01; g.add(plate);
  for(const tz of[-0.09,0.09]){
    const tube=new THREE.Mesh(tubeGeo2,tubeMat);
    tube.position.set(0,FY-0.045,tz); g.add(tube);
  }
  const cordLen=LIB_WALL_H-(FY+0.1);
  for(const sx of[-0.95,0.95]){
    const c=new THREE.Mesh(cordGeo,darkMetalMat);
    c.scale.y=cordLen; c.position.set(sx,FY+0.1+cordLen/2,0); g.add(c);
  }
  g.position.set(wx,0,wz);
  if(alongZ) g.rotation.y=Math.PI/2;
  return {group:g, glowMat, tubeMat, fixY:FY-0.35};
}

/* ---------------- build ---------------- */
export function buildLibrary(){
  LIB.obstacles=[]; LIB.pcAnims=[]; LIB.blackT=0; LIB.nextBlack=45;
  const {cx0,cy0,spawnC,tables}=genLibrary();
  const SZ=LW*CELL;
  const libWallMat=new THREE.MeshPhongMaterial({map:texLibWall, specular:0x0c0b09, shininess:5});
  /* floor & high ceiling */
  texLibCarpet.repeat.set(LW,LH);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(SZ,SZ),
    new THREE.MeshPhongMaterial({map:texLibCarpet, specular:0x000000, shininess:1}));
  floor.rotation.x=-Math.PI/2; scene.add(floor);
  texLibCeil.repeat.set(LW/2,LH/2);
  const ceil=new THREE.Mesh(new THREE.PlaneGeometry(SZ,SZ),
    new THREE.MeshPhongMaterial({map:texLibCeil, specular:0x000000, shininess:1}));
  ceil.rotation.x=Math.PI/2; ceil.position.y=LIB_WALL_H; scene.add(ceil);
  /* perimeter walls — one cell is the crashed elevator's. UVs are scaled
     to 4m-per-tile world space so the plaster maps at one density on every
     box, however it's sized (this is what un-distorts the walls). */
  const exC=cx0, eyC=LH-1;
  const wallGeo2=scaleBoxUV(new THREE.BoxGeometry(CELL,LIB_WALL_H,CELL),CELL,LIB_WALL_H,CELL,4);
  for(let y=0;y<LH;y++)for(let x=0;x<LW;x++){
    if(grid2[y][x]!==1) continue;
    if(x===exC&&y===eyC) continue;
    const m=new THREE.Mesh(wallGeo2,libWallMat);
    const p=cellToWorld2(x,y);
    m.position.set(p.x,LIB_WALL_H/2,p.z);
    scene.add(m);
  }
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
    const elev=makeElevator(dp,Math.PI,{wallH:LIB_WALL_H, wallMat:libWallMat, uvTile:4});
    elev.rotation.z=0.022;                       // it did not land well
    scene.add(elev);
    LIB.elev=elev;
    addInteractable({kind:"deadElev", mesh:elev, label:"CALL ELEVATOR", taken:false});
    LIB.spawn=new THREE.Vector3(dp.x, 0, dp.z-2.6);
    LIB.spawnYaw=0;                              // facing -z: into the library
  }
  /* shelf runs */
  for(const run of LIB.runs) scene.add(makeShelfRun(run));
  /* tables + chairs + the occasional vintage machine */
  const pcTables=new Set();
  while(pcTables.size<Math.min(3,tables.length)) pcTables.add(Math.floor(srand()*tables.length));
  let eggArmed=false;
  tables.forEach((tc,i)=>{
    const p=cellToWorld2(tc.x,tc.y);
    const tb=makeTable();
    tb.position.set(p.x,0,p.z); tb.rotation.y=Math.floor(srand()*2)*Math.PI/2;
    scene.add(tb);
    const nCh=srand()<0.6? 1+Math.floor(srand()*2) : 0;
    for(let c=0;c<nCh;c++){
      const ang=srand()*Math.PI*2;
      const ch=makeChair(srand()<0.35);
      ch.position.set(p.x+Math.sin(ang)*2.2,0,p.z+Math.cos(ang)*2.2);
      ch.rotation.y=ang+Math.PI+(srand()-0.5)*0.6;
      scene.add(ch);
      LIB.obstacles.push({x:ch.position.x, z:ch.position.z, r:0.34});
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
    LIB.term={group:d.group, pc:d.pc, screen:d.pc.userData.screen};
    addInteractable({kind:"terminal", mesh:d.group,
      label:()=> STATE.discsCarried>0
        ? `FEED THE TERMINAL (${STATE.discsCarried} DISK${STATE.discsCarried>1?"S":""})`
        : "THE TERMINAL IS DARK", taken:false});
  }
  /* ladders & lecterns */
  let placed=0;
  for(let t=0;t<200&&placed<6;t++){
    const run=LIB.runs[Math.floor(srand()*LIB.runs.length)];
    if(!run) break;
    const c=run.cells[Math.floor(srand()*run.cells.length)];
    const [dx,dy]=run.axis===0? [0,srand()<0.5?1:-1] : [srand()<0.5?1:-1,0];
    if(!LIB.reach.has(K(c.x+dx,c.y+dy))) continue;
    const p=cellToWorld2(c.x,c.y);
    const lad=makeLadder();
    lad.position.set(p.x+dx*1.05,0,p.z+dy*1.05);
    lad.rotation.y=Math.atan2(-dx,-dy);
    scene.add(lad); placed++;
    LIB.obstacles.push({x:lad.position.x, z:lad.position.z, r:0.42});
  }
  for(let i=0;i<8;i++){
    const c=LIB.reachList[Math.floor(srand()*LIB.reachList.length)];
    const p=cellToWorld2(c.cx,c.cy);
    const lec=makeLectern();
    lec.position.set(p.x+rand(-1,1),0,p.z+rand(-1,1));
    lec.rotation.y=srand()*Math.PI*2;
    scene.add(lec);
    LIB.obstacles.push({x:lec.position.x, z:lec.position.z, r:0.36});
  }
  /* wall dressing: posters, cracks, and the level's name — meaninglessly */
  const wallFaces=[];
  for(let x=1;x<LW-1;x++){
    wallFaces.push({x:cellToWorld2(x,0).x,        z:cellToWorld2(x,0).z+CELL/2+0.03,  ry:0});
    wallFaces.push({x:cellToWorld2(x,LH-1).x,     z:cellToWorld2(x,LH-1).z-CELL/2-0.03, ry:Math.PI});
  }
  for(let y=1;y<LH-1;y++){
    wallFaces.push({x:cellToWorld2(0,y).x+CELL/2+0.03,  z:cellToWorld2(0,y).z, ry:Math.PI/2});
    wallFaces.push({x:cellToWorld2(LW-1,y).x-CELL/2-0.03, z:cellToWorld2(LW-1,y).z, ry:-Math.PI/2});
  }
  for(let i=wallFaces.length-1;i>0;i--){
    const j=Math.floor(srand()*(i+1)); [wallFaces[i],wallFaces[j]]=[wallFaces[j],wallFaces[i]];
  }
  let fi=0;
  const take=()=>wallFaces[fi++%wallFaces.length];
  for(let i=0;i<10;i++){
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
  for(let i=0;i<13;i++){
    const f=take();
    const po=new THREE.Mesh(new THREE.PlaneGeometry(0.92,1.24),
      new THREE.MeshPhongMaterial({map:makePosterTexture(), specular:0x000000, shininess:2}));
    po.position.set(f.x,rand(1.3,2.6),f.z);
    po.rotation.y=f.ry; po.rotation.z=(srand()-0.5)*0.12;
    scene.add(po);
  }
  for(let i=0;i<16;i++){
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
    const x=clamp(gx+Math.floor(srand()*3)-1,1,LW-2), y=clamp(gy+Math.floor(srand()*3)-1,1,LH-2);
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
  STATE.discTotal=16+Math.floor(srand()*7);                 // 16–22
  const sites=[];
  for(const run of LIB.runs){
    const [dx,dy]=run.axis===0? [0,1] : [1,0];
    for(const c of run.cells){
      for(const s of[1,-1]){
        if(!LIB.reach.has(K(c.x+dx*s,c.y+dy*s))) continue;
        const p=cellToWorld2(c.x,c.y);
        sites.push({cx:c.x, cy:c.y,
          x:p.x+dx*s*0.55, z:p.z+dy*s*0.55,
          y:[0.685,1.225,1.765][Math.floor(srand()*3)]+0.02, kind:"shelf"});
      }
    }
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
}

/* ---------------- per-frame level logic ---------------- */
export function updateLibrary(dt){
  /* the intro's wake-up wave clock */
  if(STATE.libWakeT>=0){
    STATE.libWakeT+=dt;
    if(STATE.libWakeT>14) STATE.libWakeT=-1;      // every fixture is long awake
  }
  /* 70 seconds after the first disk leaves its shelf, the building answers:
     every light drops to a quarter of its brightness and goes sodium-warm */
  if(!STATE.libDim && STATE.libFirstPickup>=0 && STATE.time-STATE.libFirstPickup>=70){
    STATE.libDim=true;
    sfxLightsOut();
    escalateLibraryAmbience();
    hemi.color.setHex(0xffc890); hemi.groundColor.setHex(0x191008);
    amb.color.setHex(0x584024);
    toast("The lights sink to embers.",2600);
  }
  /* post-drop: an almost unnoticeable, slow sway in the world */
  STATE.shakeAmp=lerp(STATE.shakeAmp, STATE.libDim?0.013:0, Math.min(1,dt*0.5));
  /* the lights sometimes shut off temporarily, all of them */
  if(LIB.blackT>0){
    LIB.blackT-=dt;
    STATE.libBlackout=Math.min(1,STATE.libBlackout+dt*9);
    if(LIB.blackT<=0){ STATE.libBlackout=0; LIB.nextBlack=rand(55,115); }
  } else if(STATE.libWakeT<0){
    LIB.nextBlack-=dt;
    if(LIB.nextBlack<=0){ LIB.blackT=rand(1.3,2.6); sfxLightsOut(); }
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
}
/* the one decor machine that still turns on — once */
export function startDeadPC(it){
  it.taken=true;
  sfxComputerBoot(0.5);
  const screen=it.mesh.userData.screen;
  LIB.pcAnims.push({screen, phase:"boot", t:0});
}
