/* ---------------- the librarian — THE END's protector ----------------
   An eldritch spider the size of a small horse. It pads between the
   stacks, scratching at shelves as it peruses. It is nearly blind and it
   does not need to see you: it hears.

   The rules (from the design TODO):
   · Picking up a floppy disk alerts it to that spot after a flat 1s
     reaction, any distance. Beyond 45% of the room span it commits to a
     wall/ceiling transit instead of a floor seek.
   · Every further pickup BEFORE it starts moving: −1s off the countdown,
     +0.25× speed. Every pickup before it REACHES the latest pickup spot:
     +0.25× speed (it re-routes to the newest one). Speed base = your walk
     (4.6 m/s), capped at 2×.
   · Moving while not crouched alerts it strongly within 17m, mildly
     within 25.5m. Crouched movement is silent.
   · It cannot reach or crawl under the tables. */
import { clamp, lerp, rand } from "./utils.js";
import { CELL } from "./map.js";
import { STATE, spider } from "./state.js";
import { LIB, ROOM_SPAN, LIB_WALL_H, cellToWorld2, worldToCell2, isBlockedSpider, bfsPath2,
         losCells2, underTable, randomReachCell, cellAt, pushFromTables,
         spawnWeb, updateWeb, removeWeb, severWeb } from "./library.js";
import { AU, panTo, sfxHeartbeat, sfxSpiderTap, sfxSpiderScratch, sfxSpiderSniff,
         sfxSpiderShriek, sfxWebSplat, sfxWebSnap } from "./audio.js";
import { ui } from "./ui.js";
import { die } from "./lifecycle.js";

const RUN_BASE=7.28;                    // base run speed (chase/seekRun) = ×1.4 of browse
const FEM=1.35, TIB=2.25, PITCH=0.42, KNEE=-1.62;   // leg chain dimensions

/* ================= the body ================= */
export function makeSpider(){
  const chitin=new THREE.MeshPhongMaterial({color:0x12100d, specular:0x2e261c, shininess:24});
  const chitinD=new THREE.MeshPhongMaterial({color:0x0b0a08, specular:0x1c160f, shininess:18});
  const eyeMat=new THREE.MeshPhongMaterial({color:0x050202, emissive:0x3a0805,
    specular:0x000000, shininess:2});
  const g=new THREE.Group();
  const BODY_Y=1.5;
  const abd=new THREE.Mesh(new THREE.SphereGeometry(0.8,14,12),chitin);
  abd.scale.set(1.0,0.9,1.35); abd.position.set(0,BODY_Y+0.12,-0.95); g.add(abd);
  /* the whole head rides one group so the sniff dip carries the eyes and
     fangs down with the carapace instead of leaving them floating */
  const head=new THREE.Group(); g.add(head);
  const ceph=new THREE.Mesh(new THREE.SphereGeometry(0.55,12,10),chitin);
  ceph.scale.set(1.05,0.78,1.0); ceph.position.set(0,BODY_Y,0.42); head.add(ceph);
  /* a crown of dim ember eyes */
  for(const[ex,ey,ez]of[[-0.12,0.16,0.9],[0.12,0.16,0.9],[-0.24,0.10,0.82],[0.24,0.10,0.82],
                        [-0.07,0.04,0.94],[0.07,0.04,0.94]]){
    const eye=new THREE.Mesh(new THREE.SphereGeometry(0.05,8,8),eyeMat);
    eye.position.set(ex,BODY_Y+ey,ez); head.add(eye);
  }
  /* chelicerae */
  for(const sx of[-0.1,0.1]){
    const fang=new THREE.Mesh(new THREE.ConeGeometry(0.07,0.34,6),chitinD);
    fang.position.set(sx,BODY_Y-0.34,0.86); fang.rotation.x=Math.PI; head.add(fang);
  }
  /* ---- 8 legs: hip yaw + femur pitch + fixed knee, animated as two
     alternating tetrapods ---- */
  const femGeo=new THREE.CylinderGeometry(0.075,0.055,FEM,7);
  femGeo.rotateZ(-Math.PI/2); femGeo.translate(FEM/2,0,0);      // extends along +x
  const tibGeo=new THREE.CylinderGeometry(0.05,0.022,TIB,7);
  tibGeo.rotateZ(-Math.PI/2); tibGeo.translate(TIB/2,0,0);
  const legs=[];
  const PHI_R=[0.96,0.35,-0.26,-0.87];           // splay angles, right side
  for(let side=0;side<2;side++){
    for(let i=0;i<4;i++){
      const phi = side===0? PHI_R[i] : Math.PI-PHI_R[i];
      const hip=new THREE.Group();
      hip.position.set((side===0?1:-1)*0.42, BODY_Y, 0.55-i*0.37);
      hip.rotation.y=-phi;
      const femG=new THREE.Group(); femG.rotation.z=PITCH; hip.add(femG);
      femG.add(new THREE.Mesh(femGeo,chitin));
      const kneeJ=new THREE.Mesh(new THREE.SphereGeometry(0.095,8,8),chitinD);
      kneeJ.position.x=FEM; femG.add(kneeJ);
      const tibG=new THREE.Group(); tibG.position.x=FEM; tibG.rotation.z=KNEE; femG.add(tibG);
      tibG.add(new THREE.Mesh(tibGeo,chitinD));
      g.add(hip);
      legs.push({hip, femG, basePhi:phi, phase:(i%2===0)===(side===0)? 0:Math.PI,
                 front:i===0, fold:0});
    }
  }
  g.userData={legs, eyeMat, abd, head, BODY_Y, scratchAnim:0, sniffAnim:0, abdTilt:0};
  g.visible=false;
  return g;
}

/* ================= hearing ================= */
/* a floppy disk just left its shelf at (x,z) */
export function spiderHearDisc(x,z){
  if(!spider.active) return;
  const s=spider;
  const here=new THREE.Vector3(x,0,z);
  const d=s.pos.distanceTo(here);
  const reaction = 1;                                    // flat 1s, any distance (simpler, more consistent)
  s.lastKnown=here;
  s.discFar = d>DISC_FAR;                                 // far enough to be worth a wall/ceiling transit
  if(s.state==="chase"||s.state==="stalk") return;       // already on you
  if(!s.stacking){
    /* first pickup of this episode: start the countdown */
    s.stacking=true; s.speedMult=1;
    s.pendingT=reaction;
  } else if(s.pendingT>0){
    /* it hasn't started moving yet: each pickup carves a second off the
       wait and winds its speed up another quarter-step */
    s.pendingT=Math.max(0.25, Math.min(s.pendingT-1, reaction));
    s.speedMult=Math.min(2.0, s.speedMult+0.25);
  } else {
    /* already moving for an earlier pickup: re-route to the newest one */
    s.speedMult=Math.min(2.0, s.speedMult+0.25);
    const descending = s.surf.phase==="drop"||s.surf.phase==="dropAttack"
                     ||s.surf.phase==="fromWall"||s.surf.phase==="fromWallS";
    if(s.surf.mode!=="floor"){
      /* up on a wall/ceiling: keep using the surface and just retarget the
         glide to the newest disc — unless it has already committed to a drop
         or a dismount (mid-descent), which runs to completion */
      if(!descending) s.surf.goal=(s.surf.goal||new THREE.Vector3()).set(x,0,z);
    } else if(s.discFar){
      if(s.surf.goal) s.surf.goal.set(x,0,z);            // already transiting → just retarget
      else startDiscTransit(x,z);
    } else { s.state="seek"; s.seekRun=true; s.repath=0; }
  }
}

/* ================= helpers ================= */
function corridorClear2(ax,az,bx,bz){
  const dx=bx-ax, dz=bz-az, len=Math.hypot(dx,dz);
  if(len<0.001) return true;
  const ox=-dz/len*0.7, oz=dx/len*0.7;
  const steps=Math.ceil(len);
  for(let i=1;i<=steps;i++){
    const t=i/steps, x=lerp(ax,bx,t), z=lerp(az,bz,t);
    for(const[sx,sz]of[[0,0],[ox,oz],[-ox,-oz]]){
      const c=worldToCell2(x+sx,z+sz);
      if(isBlockedSpider(c.cx,c.cy)) return false;
    }
  }
  return true;
}
function smoothPath2(path){
  if(path.length<3) return path;
  const out=[];
  let cx=spider.pos.x, cz=spider.pos.z, i=0;
  while(i<path.length){
    let j=path.length-1;
    while(j>i && !corridorClear2(cx,cz,path[j].x,path[j].z)) j--;
    out.push(path[j]); cx=path[j].x; cz=path[j].z; i=j+1;
  }
  return out;
}
function setPath2(wx,wz){
  let a=worldToCell2(spider.pos.x,spider.pos.z);
  if(isBlockedSpider(a.cx,a.cy)){
    for(const[ox,oy]of[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
      if(!isBlockedSpider(a.cx+ox,a.cy+oy)){
        const q=cellToWorld2(a.cx+ox,a.cy+oy);
        spider.pos.x=q.x; spider.pos.z=q.z;
        a=worldToCell2(q.x,q.z);
        break;
      }
    }
  }
  const b=worldToCell2(clamp(wx,-ROOM_SPAN/2+CELL,ROOM_SPAN/2-CELL),
                       clamp(wz,-ROOM_SPAN/2+CELL,ROOM_SPAN/2-CELL));
  const p=bfsPath2(a.cx,a.cy,b.cx,b.cy);
  spider.path = p? p.map(c=>cellToWorld2(c.cx,c.cy)) : [];
  if(spider.path.length>1) spider.path.shift();
  spider.path=smoothPath2(spider.path);
}
/* nearly blind, but not blind: it spots open MOVEMENT at short range.
   Standing perfectly still reads the same as crouching — it keys on motion,
   not posture, so freezing in place (camera turns included) is safe down to
   the crouch radius. */
function spiderCanSee(){
  if(underTable(STATE.pos.x,STATE.pos.z)) return false;
  const d=spider.pos.distanceTo(STATE.pos);
  const range=(STATE.crouch||!STATE.moving)? 4.2 : 10.4*(STATE.sprinting?1.15:1.10);   // still/crouched; moving = walk ×1.10 / run ×1.15
  if(d>range) return false;
  return losCells2(spider.pos.x,spider.pos.z,STATE.pos.x,STATE.pos.z);
}
function browseTarget(){
  /* most trips end at a shelf front; some are aimless drifting */
  if(LIB.runs.length&&Math.random()<0.7){
    for(let t=0;t<14;t++){
      const run=LIB.runs[Math.floor(Math.random()*LIB.runs.length)];
      const c=run.cells[Math.floor(Math.random()*run.cells.length)];
      const [dx,dy]=run.axis===0? [0,Math.random()<0.5?1:-1] : [Math.random()<0.5?1:-1,0];
      if(isBlockedSpider(c.x+dx,c.y+dy)) continue;
      const p=cellToWorld2(c.x+dx,c.y+dy);
      const sp=cellToWorld2(c.x,c.y);
      return {x:p.x, z:p.z, face:Math.atan2(sp.x-p.x,sp.z-p.z), shelf:true};
    }
  }
  const c=randomReachCell();
  const p=cellToWorld2(c.cx,c.cy);
  return {x:p.x, z:p.z, face:Math.random()*Math.PI*2, shelf:false};
}

/* ================= surface locomotion (walls & ceiling) =================
   The spider normally lives on the floor (the grid AI above). When calm it
   may crawl a perimeter wall or web up to the ceiling, reposition over long
   glides at up to 2× speed, and — once back over you — drop. s.pos is the 3-D
   contact point; orientSpider() rights the body to the surface normal. */
const UP=new THREE.Vector3(0,1,0), DOWN=new THREE.Vector3(0,-1,0);
const INNER=ROOM_SPAN/2-CELL;          // 46: the inner wall faces sit at ±INNER
const WALLLEN=INNER-CELL;              // 42: keep glides off the corners
const WALL_H=LIB_WALL_H;               // wall / ceiling height
const WBAND_LO=0.30*WALL_H, WBAND_HI=0.70*WALL_H;     // the height band it gravitates to
const WBAND_MIN=0.15*WALL_H, WBAND_MAX=0.85*WALL_H;   // the hard limits it stays within
const WVSTEP=0.30*WALL_H;              // vertical change per wall glide
const SURF_GLIDE_MIN=2;                // min repositioning glides before it may return to the floor
const SURF_GLIDE_CAP=4;                // max repositioning glides on a surface before it must drop
const FLOOR_PATH_MIN=1;               // min floor browses before a wall/ceiling move may be chosen
const FLOOR_PATH_CAP=5;               // max floor browses in a row before a wall/ceiling move is forced
const PIVOT_DIST=2.2;                 // metres over which the body pitches around the wall↔floor corner
const WALL_AREA=14;                   // within this of a wall → "wall-choosing area" (else ceiling area)
const DISC_FAR=0.45*ROOM_SPAN;        // disc picked up beyond this → surface transit instead of a floor seek
const WALL_TRAVERSE_MULT=2.55;        // wall mount/traverse/dismount speed (× browse) during a disc transit
const CEIL_TRAVERSE_MULT=2.25;        // ceiling disc-transit glide speed (× browse)
const S_LEAD=10;                      // along-the-wall lead of the S-curve mount/dismount (horizontal blend distance)
const SIDE=2*INNER, PERIM=4*SIDE;     // inner-perimeter loop length (wall transit)
const TAIL_LOCAL=new THREE.Vector3(0,1.62,-2.03);  // the abdomen tail tip in mesh-local space (web origin / hang anchor)
const HANG_LAND=3.5;                  // tail height when the head-down hang's legs reach the floor
const _tmp=new THREE.Vector3();

function nearestWall(x,z){
  const dxW=INNER-Math.abs(x), dzW=INNER-Math.abs(z);
  if(dxW<dzW){ const face=Math.sign(x||1)*INNER;
    return {axis:"x", face, N:new THREE.Vector3(-Math.sign(face),0,0), along:"z"}; }
  const face=Math.sign(z||1)*INNER;
  return {axis:"z", face, N:new THREE.Vector3(0,0,-Math.sign(face)), along:"x"};
}
const wallPoint=(w,u,v)=> w.axis==="x"? new THREE.Vector3(w.face,v,u) : new THREE.Vector3(u,v,w.face);
const wallU=(w,p)=> w.axis==="x"? p.z : p.x;
/* the inner perimeter as a 1-D loop W→S→E→N (each side length SIDE), for the
   wall route to a far disc. perimWall(p) → the wall + world point at param p */
function perimWall(p){
  p=((p%PERIM)+PERIM)%PERIM;
  const seg=Math.floor(p/SIDE), u=p-seg*SIDE;                 // u∈[0,SIDE]
  if(seg===0) return {x:-INNER, z:u-INNER, N:new THREE.Vector3(1,0,0),  axis:"x", face:-INNER, along:"z"}; // west
  if(seg===1) return {x:u-INNER, z:INNER,  N:new THREE.Vector3(0,0,-1), axis:"z", face:INNER,  along:"x"}; // south
  if(seg===2) return {x:INNER,  z:INNER-u, N:new THREE.Vector3(-1,0,0), axis:"x", face:INNER,  along:"z"}; // east
  return        {x:INNER-u, z:-INNER, N:new THREE.Vector3(0,0,1),  axis:"z", face:-INNER, along:"x"};      // north
}
const perimP=(pos,w)=> w.axis==="x"
  ? (w.face<0? pos.z+INNER : 2*SIDE+(INNER-pos.z))           // west / east
  : (w.face>0? SIDE+(pos.x+INNER) : 3*SIDE+(INNER-pos.x));   // south / north
function nearestWallP(x,z){                                   // perimeter param of the wall point closest to (x,z)
  const dW=x+INNER, dE=INNER-x, dN=z+INNER, dS=INNER-z, m=Math.min(dW,dE,dN,dS);
  if(m===dW) return z+INNER;
  if(m===dS) return SIDE+(x+INNER);
  if(m===dE) return 2*SIDE+(INNER-z);
  return 3*SIDE+(INNER-x);
}
/* in a square room two walls are the same (0 corners), adjacent (1 corner), or
   opposite (2 corners). Only opposite walls — same orientation, facing each
   other — force a route across more than one corner. */
function oppositeWalls(sx,sz,gx,gz){
  const ws=nearestWall(sx,sz), wt=nearestWall(gx,gz);
  return ws.axis===wt.axis && ws.face!==wt.face;
}
function calmEnough(){
  const s=spider;
  return (s.state==="browse"||s.state==="peruse") && s.pendingT<=0 && !s.stacking;
}
/* on completing a floor browse: maybe leave the ground entirely. A run of
   FLOOR_PATH_CAP browses without climbing forces the next one. */
function maybeClimb(){
  if(!calmEnough()) return false;
  const s=spider;
  s.floorPaths++;
  if(s.floorPaths<FLOOR_PATH_MIN) return false;       // wander a few floors first
  const forced=s.floorPaths>=FLOOR_PATH_CAP;
  const wallDist=Math.min(INNER-Math.abs(s.pos.x), INNER-Math.abs(s.pos.z));
  if(wallDist<WALL_AREA){ if(forced||Math.random()<0.25){ s.floorPaths=0; startToWall(); return true; } }
  else if(forced||Math.random()<0.10){ s.floorPaths=0; startToCeiling(); return true; }
  return false;
}
function startToWall(){
  const s=spider, S=s.surf, w=nearestWall(s.pos.x,s.pos.z);
  const u=clamp(wallU(w,s.pos), -WALLLEN, WALLLEN);
  S.wall=w;
  S.from.set(s.pos.x,0,s.pos.z);
  S.mid.copy(wallPoint(w,u,0));          // the wall base under us
  S.len1=S.from.distanceTo(S.mid);
  if(S.goal){
    /* disc transit: S-curve up onto the wall, leading into the traverse direction */
    S.pStart=perimP(S.mid,w);
    const dlt=((nearestWallP(S.goal.x,S.goal.z)-S.pStart+PERIM*1.5)%PERIM)-PERIM/2;
    S.toH=rand(WBAND_LO,WBAND_HI);
    S.lead=(Math.sign(dlt)||1)*Math.min(S_LEAD, Math.abs(dlt)*0.4);
    S.len2=S.toH+Math.abs(S.lead);       // approx S-curve arc length
  } else {
    S.to.copy(wallPoint(w,u,rand(WBAND_LO,WBAND_HI)));   // calm climb: straight up into the 30–70% band
    S.len2=S.mid.distanceTo(S.to);
  }
  S.phase=S.goal?"toWallS":"toWall"; S.t=0; S.ramp=0; S.glideActive=false; S.glides=0; S.targetN.copy(UP);  // upright until it reaches the wall
  s.path=[];
}
function startToCeiling(){
  const s=spider, S=s.surf;
  S.from.set(s.pos.x,0,s.pos.z);
  S.to.set(s.pos.x,WALL_H,s.pos.z);
  S.web=null; S.struck=false;
  S.phase="toCeiling"; S.t=0; S.dur=2.5; S.ramp=0; S.glideActive=false; S.glides=0; S.targetN.copy(DOWN);
  s.path=[];
}
/* a far disc was heard: take a surface route to it instead of a floor slog.
   Wall-area → climb & wall-walk (around corners) to the closest wall point,
   then drop off and walk in. Ceiling-area → web up, glide over it, drop. */
function startDiscTransit(gx,gz){
  const s=spider, S=s.surf;
  S.goal = (S.goal||new THREE.Vector3()).set(gx,0,gz); S.weaveBase=null;
  s.state="seek"; s.seekRun=true;                       // it's hunting toward the disc
  if(S.mode==="floor" && S.phase==="idle"){
    const wallDist=Math.min(INNER-Math.abs(s.pos.x), INNER-Math.abs(s.pos.z));
    /* wall route only if near a wall AND the disc's wall isn't the opposite one
       (which would force >1 corner); otherwise the ceiling is the cleaner path */
    if(wallDist<WALL_AREA && !oppositeWalls(s.pos.x,s.pos.z,gx,gz)) startToWall();
    else startToCeiling();
  }
  /* if already elevated, the surface AI picks up S.goal on its next frame */
}
function startFromWall(tx,tz){
  const s=spider, S=s.surf, w=S.wall;
  const u=wallU(w,s.pos);
  S.from.copy(s.pos);
  if(S.goal && tx==null){
    /* disc transit: S-curve down — keep running along to the closest wall point
       while curving down, then off onto the floor */
    S.pStart=perimP(s.pos,w);
    const dlt=((nearestWallP(S.goal.x,S.goal.z)-S.pStart+PERIM*1.5)%PERIM)-PERIM/2;
    S.pEnd=S.pStart+dlt; S.toH=s.pos.y;
    const pw=perimWall(S.pEnd);
    S.mid.set(pw.x,0,pw.z);                              // wall base at the closest point
    S.to.set(pw.x+pw.N.x*CELL, 0, pw.z+pw.N.z*CELL);     // one cell into the room
    S.len1=Math.abs(dlt)+S.toH; S.len2=S.mid.distanceTo(S.to);
    S.phase="fromWallS"; S.t=0;
    return;
  }
  S.mid.copy(wallPoint(w,u,0));           // straight down the face
  if(tx!=null){ S.to.set(tx,0,tz); }
  else if(w.axis==="x"){ S.to.set(w.face-Math.sign(w.face)*CELL, 0, u); }
  else { S.to.set(u, 0, w.face-Math.sign(w.face)*CELL); }
  S.len1=S.from.distanceTo(S.mid); S.len2=S.mid.distanceTo(S.to);
  S.phase="fromWall"; S.t=0; S.targetN.copy(w.N);     // stay flush to the wall until it reaches the floor
}
function startDrop(attack,dx,dz){
  const s=spider, S=s.surf;
  S.dropX=dx; S.dropZ=dz;
  S.from.copy(s.pos);
  S.to.set(dx,WALL_H,dz);                  // the ceiling point over the target
  S.web=null; S.struck=false; S.killed=false;
  if(attack){ S.phase="dropAttack"; S.setup=1.5; S.fall=1.75; }  // telegraphed: 1.5s setup + 1.75s rappel (−30%)
  else { S.phase="drop"; S.setup=0.0; S.fall=2.1; }              // casual return rappel (−30%)
  S.t=0; S.targetN.copy(UP); S.hang=false;
  S.hangN.set(s.headDir.x,0,s.headDir.z);                        // keep a horizontal dorsal facing while it dangles
  if(S.hangN.lengthSq()<1e-4) S.hangN.set(1,0,0);
  S.hangN.normalize();
}
/* land back on the floor; lift off any shelf/table it came down onto */
function landRecover(x,z){
  const s=spider, S=s.surf;
  const wasPursue=S.pursue || s.state==="seek" || s.state==="chase";
  s.pos.set(x,0,z);
  let a=worldToCell2(x,z);
  if(isBlockedSpider(a.cx,a.cy)){             // came down onto a shelf/table — step off it
    for(const[ox,oy]of[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
      if(!isBlockedSpider(a.cx+ox,a.cy+oy)){ const q=cellToWorld2(a.cx+ox,a.cy+oy); s.pos.set(q.x,0,q.z); break; }
    }
  }
  const goalPt = S.goal;                       // disc-transit target, if any (investigate it on landing)
  S.mode="floor"; S.phase="idle"; S.ramp=0; S.pursue=false; S.glideActive=false;
  S.wall=null; S.targetN.copy(UP); S.web=null; S.goal=null; S.hang=false; S.weaveBase=null; s.discFar=false;
  s.mesh.userData.abdTilt=0;
  s.curSpeed=0; s.path=[]; s.repath=0; s.floorPaths=0;
  if(goalPt){
    s.state="seek"; s.seekRun=true; s.lastKnown=new THREE.Vector3(goalPt.x,0,goalPt.z);
    /* if a newer disc retargeted the goal mid-descent, we landed far from it —
       take another surface hop rather than a long floor slog */
    if(Math.hypot(goalPt.x-s.pos.x, goalPt.z-s.pos.z)>DISC_FAR){ s.discFar=true; startDiscTransit(goalPt.x,goalPt.z); }
  }
  else if(wasPursue){ s.state="seek"; s.seekRun=true; s.lastKnown=STATE.pos.clone(); }                // keep hunting on the ground
  else { s.state="browse"; s.target=null; }
}
function applyHead(prev,dt){
  const s=spider;
  const dx=s.pos.x-prev.x, dy=s.pos.y-prev.y, dz=s.pos.z-prev.z;
  const L=Math.hypot(dx,dy,dz);
  if(L>1e-4) s.headDir.set(dx/L,dy/L,dz/L);
  return L/Math.max(dt,1e-5);
}
/* a single straight repositioning glide across the current surface */
function surfaceGlideStep(dt){
  const s=spider, to=s.surf.to;
  const dx=to.x-s.pos.x, dy=to.y-s.pos.y, dz=to.z-s.pos.z;
  const L=Math.hypot(dx,dy,dz);
  s.curSpeed=SPD.browse*(1+s.surf.ramp);   // ramps to 2× browse
  if(L<0.6) return {arrived:true, moved:0};
  const step=Math.min(L, s.curSpeed*dt);
  s.pos.x+=dx/L*step; s.pos.y+=dy/L*step; s.pos.z+=dz/L*step;
  s.headDir.set(dx/L,dy/L,dz/L);
  return {arrived:false, moved:s.curSpeed};
}
function newWallGlide(){
  const s=spider, w=s.surf.wall;
  const u=clamp(wallU(w,s.pos)+rand(-1,1)*WALLLEN, -WALLLEN, WALLLEN);   // ~50% of the length
  const v=clamp(lerp(s.pos.y+rand(-WVSTEP,WVSTEP), rand(WBAND_LO,WBAND_HI), 0.5), WBAND_MIN, WBAND_MAX);
  s.surf.to.copy(wallPoint(w,u,v));
}
function newCeilGlide(){
  const s=spider, lim=ROOM_SPAN/2-15;     // 35: stay ≥15m off the perimeter
  let tx,tz;
  if(Math.random()<0.5){ tx=clamp(s.pos.x+rand(-1,1)*0.55*ROOM_SPAN,-lim,lim); tz=clamp(s.pos.z+rand(-0.3,0.3)*ROOM_SPAN,-lim,lim); }
  else { tz=clamp(s.pos.z+rand(-1,1)*0.55*ROOM_SPAN,-lim,lim); tx=clamp(s.pos.x+rand(-0.3,0.3)*ROOM_SPAN,-lim,lim); }
  s.surf.to.set(tx,WALL_H,tz);
}

/* crawl the from→mid→to corner. Walking pace normally; full traverse speed
   during a disc transit so mount/dismount match the wall run (no speed jump). */
function transitWalk(dt){
  const s=spider, S=s.surf, prev=_tmp.copy(s.pos);
  const spd = S.goal? SPD.browse*WALL_TRAVERSE_MULT : SPD.browse;
  S.t+=spd*dt;                                             // S.t is distance travelled here
  if(S.t<S.len1) s.pos.lerpVectors(S.from,S.mid, S.t/Math.max(S.len1,1e-4));
  else s.pos.lerpVectors(S.mid,S.to, Math.min(1,(S.t-S.len1)/Math.max(S.len2,1e-4)));
  s.curSpeed=spd;
  return {moved:applyHead(prev,dt), done:S.t>=S.len1+S.len2};
}
/* floor → wall: cross the floor upright, then pitch up onto the face at the corner
   and finish the climb flush to the wall (head up) */
function transitClimb(dt){
  const s=spider, S=s.surf, w=S.wall, r=transitWalk(dt);
  if(S.t<S.len1){
    S.targetN.copy(UP); s.headDir.copy(w.N).multiplyScalar(-1);        // walk toward the wall, upright
  } else {
    const k=Math.min(1,(S.t-S.len1)/PIVOT_DIST);
    S.targetN.copy(UP).lerp(w.N,k).normalize();                       // up rolls floor → wall
    s.headDir.copy(w.N).multiplyScalar(-1).lerp(UP,k).normalize();    // head swings from into-wall to up-the-wall
  }
  if(r.done){ s.pos.copy(S.to); S.mode="wall"; S.phase="idle"; S.ramp=0;
              S.glideActive=false; S.targetN.copy(w.N); s.curSpeed=0; }
  return r.moved;
}
/* wall → floor: crawl head-first DOWN the face flush to the wall, then pitch off it
   onto the floor over the last corner stretch (like the real thing — no clipping) */
function transitDown(dt){
  const s=spider, S=s.surf, w=S.wall, r=transitWalk(dt);
  if(S.t<S.len1){
    S.targetN.copy(w.N); s.headDir.set(0,-1,0);                       // descend the wall, head down, body flush
  } else {
    const k=Math.min(1,(S.t-S.len1)/PIVOT_DIST);
    S.targetN.copy(w.N).lerp(UP,k).normalize();                      // up rolls wall → floor
    s.headDir.set(0,-1,0).lerp(w.N,k).normalize();                   // head swings from down to into-the-room
  }
  if(r.done) landRecover(S.to.x,S.to.z);
  return r.moved;
}
/* disc-transit S-curve mount: cross the floor, then arc up the wall (vertical
   first, curving horizontal into the traverse) — heading follows the path */
function transitClimbS(dt){
  const s=spider, S=s.surf, prev=_tmp.copy(s.pos);
  const spd=SPD.browse*WALL_TRAVERSE_MULT; s.curSpeed=spd;
  S.t+=spd*dt;
  if(S.t<S.len1){
    s.pos.lerpVectors(S.from,S.mid, S.t/Math.max(S.len1,1e-4));      // cross the floor to the wall base, upright
    S.targetN.copy(UP);
  } else {
    const kc=Math.min(1,(S.t-S.len1)/Math.max(S.len2,1e-4));
    const h=S.toH*(1-(1-kc)*(1-kc));                                 // ease-out: rises (vertical) early
    const pw=perimWall(S.pStart + S.lead*kc*kc);                     // ease-in: leads along (horizontal) late
    s.pos.set(pw.x, h, pw.z);
    S.wall={axis:pw.axis,face:pw.face,N:pw.N,along:pw.along};
    S.targetN.copy(UP).lerp(pw.N, clamp(h/PIVOT_DIST,0,1)).normalize();   // body rolls onto the wall as it rises
    if(kc>=1){
      S.mode="wall"; S.phase="idle"; S.ramp=0; S.glideActive=false;
      S.targetN.copy(pw.N); S.weaveBase=S.toH; S.weaveP0=S.pStart+S.lead;  // seamless handoff into the traverse weave
    }
  }
  return applyHead(prev,dt);
}
/* disc-transit S-curve dismount: keep running along (horizontal), curve down
   the wall (vertical), then pitch off onto the floor — the mirror of the mount */
function transitDownS(dt){
  const s=spider, S=s.surf, prev=_tmp.copy(s.pos);
  const spd=SPD.browse*WALL_TRAVERSE_MULT; s.curSpeed=spd;
  S.t+=spd*dt;
  if(S.t<S.len1){
    const kc=Math.min(1,S.t/Math.max(S.len1,1e-4));
    const h=S.toH*(1-kc*kc);                                         // ease-in descend: along first, drop late
    const pw=perimWall(S.pStart + (S.pEnd-S.pStart)*(1-(1-kc)*(1-kc)));   // ease-out along: advances fast early
    s.pos.set(pw.x, h, pw.z);
    S.wall={axis:pw.axis,face:pw.face,N:pw.N,along:pw.along};
    S.targetN.copy(UP).lerp(pw.N, clamp(h/PIVOT_DIST,0,1)).normalize();
  } else {
    const kc=Math.min(1,(S.t-S.len1)/Math.max(S.len2,1e-4));
    s.pos.lerpVectors(S.mid,S.to,kc);                               // wall base → one cell into the room
    S.targetN.copy(UP);
  }
  const moved=applyHead(prev,dt);
  if(S.t>=S.len1+S.len2) landRecover(S.to.x,S.to.z);
  return moved;
}
function transitCeilingUp(dt){
  const s=spider, S=s.surf, u=s.mesh.userData, prev=_tmp.copy(s.pos);
  S.t+=dt; const setup=1.0, rise=1.5;
  if(S.t<setup){
    s.pos.copy(S.from);                                     // braced on the floor, head down
    u.abdTilt=Math.min(1,u.abdTilt+dt*2.5); u.sniffAnim=Math.min(1,u.sniffAnim+dt*3);
  } else {
    if(!S.struck){ S.struck=true; S.web=spawnWeb(S.to,s.pos); sfxWebSplat(0.45,panTo(S.to.x,S.to.z)); }
    const k=Math.min(1,(S.t-setup)/rise);
    s.pos.set(S.from.x, lerp(0,WALL_H,k), S.from.z);        // reel up the silk
    if(S.web) updateWeb(S.web,s.pos.y);
    u.abdTilt=Math.max(0,u.abdTilt-dt*2); u.sniffAnim=Math.max(0,u.sniffAnim-dt*2);
  }
  const moved=applyHead(prev,dt);
  if(S.t>=setup+rise){
    if(S.web){ removeWeb(S.web); S.web=null; }              // ascent silk is reeled in
    s.pos.set(S.from.x,WALL_H,S.from.z);
    S.mode="ceiling"; S.phase="idle"; S.ramp=0; S.glideActive=false; S.targetN.copy(DOWN); s.curSpeed=0;
  }
  return moved;
}
function transitDrop(dt){
  const s=spider, S=s.surf, u=s.mesh.userData, prev=_tmp.copy(s.pos);
  if(!S.struck){ S.struck=true; S.web=spawnWeb(S.to,s.pos); sfxWebSplat(0.5,panTo(S.to.x,S.to.z)); }
  S.t+=dt; const total=S.setup+S.fall;
  if(S.t<S.setup){
    s.pos.lerpVectors(S.from,S.to, S.setup>0? S.t/S.setup:1);   // slide over the mark
    u.abdTilt=Math.min(1,u.abdTilt+dt*2.5); u.sniffAnim=Math.min(1,u.sniffAnim+dt*3);
  } else {
    /* rappel: it lowers itself head-down on the silk — the tail (web origin)
       rides s.pos, the body dangles below it */
    S.hang=true; S.targetN.copy(S.hangN); s.headDir.set(0,-1,0);
    const k=Math.min(1,(S.t-S.setup)/S.fall);
    s.pos.set(S.to.x, lerp(WALL_H,HANG_LAND,k), S.to.z);       // the tail descends to where the legs meet the floor
    if(S.web) updateWeb(S.web,s.pos.y);                        // web bottom rides the tail
    u.abdTilt=Math.max(0,u.abdTilt-dt*2); u.sniffAnim=Math.max(0,u.sniffAnim-dt*2);
    /* the touch: a drop lands a kill regardless of crouch — only getting clear
       of the mark saves you (a table overhead still shelters you) */
    if(!S.killed){
      const hd=Math.hypot(STATE.pos.x-s.pos.x, STATE.pos.z-s.pos.z);
      if(s.pos.y-HANG_LAND<0.7 && hd<2.1 && !underTable(STATE.pos.x,STATE.pos.z)){ S.killed=true; die(); }
    }
  }
  const moved=applyHead(prev,dt);
  if(S.t>=total){
    if(S.web){ severWeb(S.web); sfxWebSnap(0.4,panTo(S.to.x,S.to.z)); S.web=null; }
    landRecover(S.to.x,S.to.z);
  }
  return moved;
}
/* the surface frame: dispatch transitions, else crawl & decide */
function updateSurface(dt, dx, dz, d, sees){
  const s=spider, S=s.surf;
  if(S.phase==="idle") S.ramp=Math.min(1, S.ramp + dt/(S.mode==="ceiling"?5:4));
  switch(S.phase){
    case "toWall": return transitClimb(dt);
    case "toWallS": return transitClimbS(dt);
    case "fromWall": return transitDown(dt);
    case "fromWallS": return transitDownS(dt);
    case "toCeiling": return transitCeilingUp(dt);
    case "drop": case "dropAttack": return transitDrop(dt);
  }
  const alerted = s.state==="seek"||s.state==="chase"||s.pendingT>0||sees;
  if(S.mode==="wall"){
    const w=S.wall;
    if(S.goal && !sees){
      /* wall route to a far disc: glide the perimeter (round corners) to the
         closest wall point, then drop off and walk in */
      const prev=_tmp.copy(s.pos);
      s.curSpeed=SPD.browse*WALL_TRAVERSE_MULT;    // fixed traverse speed (× normal) while running to the disc
      const p=perimP(s.pos,w);
      if(S.weaveBase==null){ S.weaveBase=clamp(s.pos.y,WBAND_MIN,WBAND_MAX); S.weaveP0=p; }  // anchor the weave to the elevation it entered at
      const dlt=((nearestWallP(S.goal.x,S.goal.z)-p+PERIM*1.5)%PERIM)-PERIM/2;   // shorter signed loop distance
      if(Math.abs(dlt)<S_LEAD){ startFromWall(null,null); return s.curSpeed; }   // close enough → S-curve down off the wall
      const pNext=p + Math.sign(dlt)*s.curSpeed*dt;
      const pw=perimWall(pNext);
      const v=S.weaveBase + 2.4*Math.sin((pNext-S.weaveP0)*0.16);                // slight S-weave around the entry elevation — no snap, rounds corners at any height
      s.pos.set(pw.x, clamp(v, WBAND_MIN, WBAND_MAX), pw.z);
      S.wall={axis:pw.axis, face:pw.face, N:pw.N, along:pw.along};               // may flip faces at a corner
      S.targetN.copy(pw.N);
      return applyHead(prev,dt);
    }
    if(alerted){
      S.pursue=true;
      const pAlong=w.axis==="x"? STATE.pos.z : STATE.pos.x;
      S.to.copy(wallPoint(w, clamp(pAlong,-WALLLEN,WALLLEN), clamp(s.pos.y,WBAND_LO,WBAND_HI)));
      const r=surfaceGlideStep(dt);
      if(Math.abs(wallU(w,s.pos)-pAlong)<3) startFromWall(STATE.pos.x,STATE.pos.z);  // abreast → drop to the floor by you
      return r.moved;
    }
    if(!S.glideActive){ newWallGlide(); S.glideActive=true; }
    const r=surfaceGlideStep(dt);
    if(r.arrived){ S.glideActive=false; S.glides++;
      if(S.glides>=SURF_GLIDE_CAP || (S.glides>=SURF_GLIDE_MIN && Math.random()<0.30)) startFromWall(null,null); }
    return r.moved;
  }
  if(S.mode==="ceiling"){
    if(S.goal && !sees){
      /* ceiling route to a far disc: glide over it at a fixed 2× (no ramp-up), then drop on it */
      S.to.set(S.goal.x, WALL_H, S.goal.z);
      S.ramp=CEIL_TRAVERSE_MULT-1;                  // surfaceGlideStep speed = browse·(1+ramp) = 2× browse
      const r=surfaceGlideStep(dt);
      if(Math.hypot(S.goal.x-s.pos.x, S.goal.z-s.pos.z)<3) startDrop(false, S.goal.x, S.goal.z);
      return r.moved;
    }
    if(alerted && !underTable(STATE.pos.x,STATE.pos.z)){
      S.pursue=true;
      S.to.set(STATE.pos.x,WALL_H,STATE.pos.z);
      const r=surfaceGlideStep(dt);
      if(Math.hypot(STATE.pos.x-s.pos.x, STATE.pos.z-s.pos.z)<3) startDrop(true,STATE.pos.x,STATE.pos.z);
      return r.moved;
    }
    if(!S.glideActive){ newCeilGlide(); S.glideActive=true; }
    const r=surfaceGlideStep(dt);
    if(r.arrived){ S.glideActive=false; S.glides++;
      if(S.glides>=SURF_GLIDE_CAP || (S.glides>=SURF_GLIDE_MIN && Math.random()<0.30)) startDrop(false,s.pos.x,s.pos.z); }
    return r.moved;
  }
  return 0;
}
/* right the body to whatever surface it's on, and place it at the contact + bob */
const _q=new THREE.Quaternion(), _m=new THREE.Matrix4();
const _up=new THREE.Vector3(), _fwd=new THREE.Vector3(), _right=new THREE.Vector3(), _bob=new THREE.Vector3();
function orientSpider(dt, movedSpeed){
  const s=spider, S=s.surf;
  _up.copy(S.targetN).normalize();
  _fwd.copy(s.headDir); _fwd.addScaledVector(_up,-_fwd.dot(_up));
  if(_fwd.lengthSq()<1e-6){
    _fwd.set(s.mesh.matrix.elements[8],s.mesh.matrix.elements[9],s.mesh.matrix.elements[10]);
    _fwd.addScaledVector(_up,-_fwd.dot(_up));
    if(_fwd.lengthSq()<1e-6) _fwd.set(1,0,0);
  }
  _fwd.normalize();
  _right.copy(_up).cross(_fwd).normalize();
  _m.makeBasis(_right,_up,_fwd);
  _q.setFromRotationMatrix(_m);
  s.mesh.quaternion.slerp(_q, S.phase!=="idle"? 1-Math.pow(0.62,dt*60) : 1-Math.pow(0.86,dt*60));
  if(S.hang){
    /* dangling on silk: the abdomen tail rides s.pos (the web's lower end),
       the rest of the body hangs below it */
    _bob.copy(TAIL_LOCAL).applyQuaternion(s.mesh.quaternion);
    s.mesh.position.set(s.pos.x-_bob.x, s.pos.y-_bob.y, s.pos.z-_bob.z);
  } else {
    const bob=Math.abs(Math.sin(s.anim*2))*0.07*clamp(movedSpeed/10,0,1);
    _bob.copy(_up).multiplyScalar(bob);
    s.mesh.position.set(s.pos.x+_bob.x, s.pos.y+_bob.y, s.pos.z+_bob.z);
  }
}

/* ================= per-frame ================= */
const SPD={browse:5.2, peruse:0, investigate:0, stalk:6.5, mildSeek:5.72};   // ×1.25 / ×1.1 of browse
export function updateSpider(dt){
  if(!spider.active||STATE.dead||STATE.won) return;
  const s=spider, u=s.mesh.userData;
  const dx=STATE.pos.x-s.pos.x, dz=STATE.pos.z-s.pos.z;
  const d=Math.hypot(dx,dz);
  const hiding=underTable(STATE.pos.x,STATE.pos.z)&&STATE.crouch;
  s.repath-=dt; s.mildCD-=dt; s.screechCD-=dt; s.scratchCD-=dt; s.sniffCD-=dt;

  /* ---- investigative sniffing: rare fits, not a metronome — a short
     erratic cluster of puffs when it inspects a spot, then a long silence
     before it will huff again, however often it re-investigates ---- */
  if(s.sniffsLeft>0){
    s.sniffT-=dt;
    if(s.sniffT<=0){
      s.sniffsLeft--;
      s.sniffT=rand(0.25,0.95);                       // erratic spacing inside the fit
      if(s.sniffsLeft<=0) s.sniffCD=rand(22,38);      // the long quiet between fits
      sfxSpiderSniff(clamp(1-d/34,0.06,1)*0.55, panTo(s.pos.x,s.pos.z));
    }
  }

  /* ---- the reaction countdown from disc pickups ---- */
  if(s.pendingT>0){
    s.pendingT-=dt;
    if(s.pendingT<=0){
      s.pendingT=0;
      sfxSpiderShriek(0.4,panTo(s.pos.x,s.pos.z));     // it has the scent
      /* far disc: it realises a wall/ceiling route is faster than the floor */
      if(s.discFar && s.lastKnown) startDiscTransit(s.lastKnown.x,s.lastKnown.z);
      else { s.state="seek"; s.seekRun=true; s.repath=0; }
    }
  }

  /* ---- hearing your feet ---- d is horizontal (cylindrical), so detection
     works the same whether it's on the floor, a wall, or the ceiling. Ranges
     are −20% vs walking/sprinting (survivability); a wall-mounted spider only
     hears a semicircle, so its ranges stretch +40% to compensate. */
  if(STATE.moving&&!STATE.crouch){
    const moveGain = STATE.sprinting ? 1.15 : 1.10;   // running heard a touch farther than walking
    const wallGain = s.surf.mode==="wall" ? 1.4 : 1;
    const strongR = 13.6*moveGain*wallGain, mildR = 20.4*moveGain*wallGain;
    if(d<strongR){
      s.lastKnown=STATE.pos.clone();
      if(s.surf.mode!=="floor") s.surf.goal=null;   // a near player overrides a disc errand while elevated
      if(s.state!=="chase"&&s.state!=="stalk"){
        if(s.state!=="seek"||!s.seekRun) s.repath=0;
        s.state="seek"; s.seekRun=true;
      }
    } else if(d<mildR&&s.mildCD<=0&&(s.state==="browse"||s.state==="peruse")){
      s.mildCD=2;
      s.lastKnown=STATE.pos.clone();
      s.state="seek"; s.seekRun=false; s.repath=0;
    }
  }

  const sees=spiderCanSee();
  let movedSpeed=0;

  /* ---- state machine (floor only; the surface layer drives walls/ceiling) ---- */
  if(s.surf.mode==="floor" && s.surf.phase==="idle")
  switch(s.state){
    case "browse":
      if(sees){ startChase(s); break; }
      if(s.path.length===0&&s.repath<=0){
        const t=browseTarget();
        s.target=t; setPath2(t.x,t.z); s.repath=1.2;
      }
      if(s.target&&Math.hypot(s.target.x-s.pos.x,s.target.z-s.pos.z)<1.2){
        if(maybeClimb()) break;            // it may leave the floor entirely instead
        s.state="peruse"; s.pauseT=rand(2,4); s.scratchT=rand(0.3,0.8);   // shorter pause, scratch fills most of it
        s.faceAng=s.target.face; s.path=[];
        /* rarely it noses the shelf before it starts to scratch */
        if(Math.random()<0.1&&s.sniffCD<=0){ s.sniffsLeft=1+Math.floor(Math.random()*2); s.sniffT=rand(0.8,1.6); }
      }
      break;
    case "peruse":
      if(sees){ startChase(s); break; }
      s.pauseT-=dt;
      s.scratchT-=dt;
      if(s.scratchT<=0&&s.target&&s.target.shelf&&s.scratchCD<=0){
        s.scratchT=rand(3.5,6.5);
        s.scratchCD=rand(4,8);
        u.scratchAnim=1.0;
        /* the scrape carries: your sound-map of the library */
        sfxSpiderScratch(clamp(1-d/70,0.05,1)*0.8, panTo(s.pos.x,s.pos.z));
      }
      if(s.pauseT<=0){ s.state="browse"; s.repath=0; }
      break;
    case "seek":{
      if(sees){ startChase(s); break; }
      if(s.lastKnown&&s.repath<=0){ setPath2(s.lastKnown.x,s.lastKnown.z); s.repath=s.seekRun?0.35:0.8; }
      /* arrival: the heard spot is often INSIDE a shelf or under a table —
         unreachable cells end the path one cell short, so an exhausted path
         within a stride of the spot counts as arriving */
      const dLK=s.lastKnown? s.pos.distanceTo(s.lastKnown) : 1e9;
      if(dLK<2.0||(s.path.length===0&&dLK<CELL*1.5)){
        if(hiding&&d<5.5){ startStalk(s); break; }
        if(s.lastKnown){ s.faceAng=Math.atan2(s.lastKnown.x-s.pos.x,s.lastKnown.z-s.pos.z); }
        s.state="investigate"; s.searchT=rand(1.82,3.22); s.path=[];   // −30%: it lingers less over a scent
        /* a clustered fit of questioning sniffs — only if it has been quiet */
        if(s.sniffCD<=0){ s.sniffsLeft=2+Math.floor(Math.random()*3); s.sniffT=rand(0.4,0.9); }
      }
      break;
    }
    case "investigate":
      if(sees){ startChase(s); break; }
      s.searchT-=dt;
      u.sniffAnim=Math.min(1,u.sniffAnim+dt*3);
      s.faceAng+=dt*0.9;                       // slow scanning turn
      if(hiding&&d<5){ startStalk(s); break; }
      if(s.searchT<=0){
        /* the episode ends: stacked speed resets */
        s.stacking=false; s.speedMult=1; s.seekRun=false;
        s.state="browse"; s.repath=0;
      }
      break;
    case "chase":
      if(hiding&&d<6){ startStalk(s); break; }
      if(!sees){
        s.lastKnown=STATE.pos.clone();
        s.state="seek"; s.seekRun=true; s.repath=0;
      } else {
        s.lastKnown=STATE.pos.clone();
        if(s.repath<=0){ setPath2(STATE.pos.x,STATE.pos.z); s.repath=0.3; }
      }
      break;
    case "stalk":{
      /* it can NOT come under the table. It circles, and scrapes, and waits. */
      s.stalkT-=dt;
      if(!hiding){ startChase(s); break; }
      if(s.path.length===0&&s.repath<=0){
        const pc=worldToCell2(STATE.pos.x,STATE.pos.z);
        const opts=[];
        for(const[ox,oy]of[[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]])
          if(!isBlockedSpider(pc.cx+ox,pc.cy+oy)) opts.push([ox,oy]);
        if(opts.length){
          const [ox,oy]=opts[Math.floor(Math.random()*opts.length)];
          const p=cellToWorld2(pc.cx+ox,pc.cy+oy);
          setPath2(p.x,p.z);
        }
        s.repath=rand(0.9,1.6);
        if(Math.random()<0.25&&s.scratchCD<=0){
          s.scratchCD=rand(5,8);
          u.scratchAnim=1.0;
          sfxSpiderScratch(clamp(1-d/30,0.2,1)*0.8, panTo(s.pos.x,s.pos.z));
        }
      }
      if(s.path.length===0) s.faceAng=Math.atan2(dx,dz);   // glare at the table
      if(s.stalkT<=0){
        sfxSpiderSniff(0.5,panTo(s.pos.x,s.pos.z));
        s.stacking=false; s.speedMult=1; s.seekRun=false;
        s.state="browse"; s.repath=0;
      }
      break;
    }
  }

  if(s.surf.mode==="floor" && s.surf.phase==="idle"){
  /* ---- speed: walks are walks; runs scale with the stacked multiplier ---- */
  let tgt=0;
  if(s.state==="browse") tgt=SPD.browse;
  else if(s.state==="stalk") tgt=SPD.stalk;
  else if(s.state==="seek") tgt=s.seekRun? RUN_BASE*s.speedMult : SPD.mildSeek;
  else if(s.state==="chase") tgt=RUN_BASE*Math.max(1,s.speedMult);
  const rate = tgt>s.curSpeed? 6:11;             // a lunge with a wind-up (~+1s to top)
  s.curSpeed += clamp(tgt-s.curSpeed, -rate*dt, rate*dt);

  /* ---- movement ---- */
  const prevX=s.pos.x, prevZ=s.pos.z;
  if(s.curSpeed>0.05&&s.path.length){
    if(s.path.length>1 && corridorClear2(s.pos.x,s.pos.z,s.path[1].x,s.path[1].z)) s.path.shift();
    const wp=s.path[0], wx=wp.x-s.pos.x, wz=wp.z-s.pos.z, wl=Math.hypot(wx,wz);
    if(wl<0.6) s.path.shift();
    else { s.pos.x+=wx/wl*s.curSpeed*dt; s.pos.z+=wz/wl*s.curSpeed*dt; s.faceAng=Math.atan2(wx,wz); }
  } else if(s.curSpeed>0.05&&s.state==="chase"){
    const dl=d||1;
    const nx=s.pos.x+dx/dl*s.curSpeed*dt, nz=s.pos.z+dz/dl*s.curSpeed*dt;
    const cc=worldToCell2(nx,nz);
    if(!isBlockedSpider(cc.cx,cc.cy)){ s.pos.x=nx; s.pos.z=nz; }
    s.faceAng=Math.atan2(dx,dz);
  }
  /* it will not press its face against a table it can't reach under. The
     margin must keep the whole keep-out INSIDE the table's cell (1.55+0.45
     = CELL/2): an overhang into open cells used to cancel path segments
     that grid corridors had validated, pinning it in place forever */
  {
    const tb=pushFromTables(s.pos.x,s.pos.z,0.45);
    s.pos.x=tb.x; s.pos.z=tb.z;
  }
  movedSpeed=Math.hypot(s.pos.x-prevX,s.pos.z-prevZ)/Math.max(dt,1e-5);
  s.headDir.set(Math.sin(s.faceAng),0,Math.cos(s.faceAng));   // floor heading for orientSpider

  /* anti-deadlock watchdog: commanded to move but going nowhere for over a
     second (push-outs, any future geometry trap) → drop the path and let
     the state machine pick a fresh one. Chase already repaths on its own. */
  if(s.path.length&&s.curSpeed>0.5&&movedSpeed<0.3){
    s.stuckT+=dt;
    if(s.stuckT>1.2){ s.stuckT=0; s.path=[]; s.repath=0; }
  } else s.stuckT=0;

  /* ---- the catch: it cannot reach under a table; anywhere else it can ---- */
  const lethal = s.state==="chase"||s.state==="stalk"||(s.state==="seek"&&s.seekRun);
  if(!underTable(STATE.pos.x,STATE.pos.z) && d<(lethal?2.1:1.5)) die();
  } else {
    movedSpeed=updateSurface(dt,dx,dz,d,sees);     // walls & ceiling
  }

  /* ---- pitter-patter: a tap roughly every stride-length of travel ---- */
  s.stepAcc+=movedSpeed*dt;
  const strideLen=movedSpeed>5? 0.95:0.55;
  if(s.stepAcc>=strideLen&&d<46){
    s.stepAcc=0;
    sfxSpiderTap(clamp(1-d/42,0,1)*(movedSpeed>5?0.6:0.34), panTo(s.pos.x,s.pos.z));
  }

  /* ---- animation ---- */
  const sp01=clamp(movedSpeed/10,0,1);
  s.anim += dt*(1.2+movedSpeed*1.35);
  const tNow=performance.now()/1000;
  const onFloorNow = s.surf.mode==="floor" && s.surf.phase==="idle";
  const cosY=Math.cos(s.faceAng), sinY=Math.sin(s.faceAng);
  for(const leg of u.legs){
    const sw=Math.sin(s.anim+leg.phase);
    const lift=Math.max(0,Math.sin(s.anim+leg.phase+1.3));
    let yaw=-leg.basePhi+sw*0.30*clamp(movedSpeed/3,0,1);
    let pitch=PITCH+lift*0.34*clamp(movedSpeed/3,0,1);
    if(u.scratchAnim>0&&leg.front){
      /* a flurry against the shelf face */
      yaw=-leg.basePhi+Math.sin(tNow*30+leg.phase)*0.18;
      pitch=0.85+Math.sin(tNow*34+leg.phase*2)*0.4;
    }
    /* terrain: where would this foot land? Tall things (walls, shelves)
       fold the leg up against the face instead of skewering it; low things
       (tables, the desk — under half its height) it simply steps onto */
    let foldTgt=0;
    if(onFloorNow){                                  // terrain-fold is a floor probe; walls/ceiling are flat
      const phiEff=-yaw;
      const horiz=FEM*Math.cos(pitch)+TIB*Math.cos(-KNEE-pitch);
      const lx=leg.hip.position.x+Math.cos(phiEff)*horiz;
      const lz=leg.hip.position.z+Math.sin(phiEff)*horiz;
      const ct=cellAt(s.pos.x+lx*cosY+lz*sinY, s.pos.z-lx*sinY+lz*cosY);
      foldTgt = (ct===1||ct===2||ct===3)? 0.55 : (ct===4||ct===5)? 0.30 : 0;
    }
    leg.fold+=(foldTgt-leg.fold)*Math.min(1,dt*7);
    leg.hip.rotation.y=yaw;
    leg.femG.rotation.z=pitch+leg.fold;
  }
  if(u.scratchAnim>0) u.scratchAnim-=dt;
  /* the head dips when it sniffs — and when it braces to fire silk (telegraph) */
  const telegraph = s.surf.phase==="toCeiling"||s.surf.phase==="drop"||s.surf.phase==="dropAttack";
  if(s.state!=="investigate" && !telegraph) u.sniffAnim=Math.max(0,u.sniffAnim-dt*2);
  u.head.position.y=-u.sniffAnim*0.55;
  u.head.position.z=u.sniffAnim*0.25;
  /* the abdomen cocks up as it aims the spinnerets at the ceiling */
  u.abd.rotation.x=-u.abdTilt*0.6;
  const breath=1+Math.sin(tNow*0.9)*0.04*(1-sp01);
  u.abd.scale.set(1.0*breath,0.9,1.35/breath);
  u.abd.position.y=(u.BODY_Y+0.12)+u.abdTilt*0.45;
  /* ember eyes flare when it commits */
  u.eyeMat.emissive.setHex(s.state==="chase"||s.state==="stalk"? 0x8a1410:0x3a0805);
  orientSpider(dt, movedSpeed);             // body rights itself to the floor/wall/ceiling

  /* ---- proximity dressing: dread, heartbeat, the skitter bed ----
     the red press of it is kept faint (−70%): a tint, not a blindfold */
  const prox=clamp(1-d/20,0,1);
  ui.dread.style.opacity = (s.state==="chase"||s.state==="stalk")? (0.09+prox*0.18):prox*0.135;
  if(AU.ctx&&AU.spiderBedGain){
    const t=AU.ctx.currentTime;
    AU.spiderBedGain.gain.setTargetAtTime(clamp(1-d/16,0,1)*0.16*(0.4+sp01*0.6), t, 0.2);
    if(AU.spiderBedPan) AU.spiderBedPan.pan.setTargetAtTime(panTo(s.pos.x,s.pos.z), t, 0.15);
  }
  AU.heartTimer-=dt;
  if(prox>0.3&&AU.heartTimer<=0){ sfxHeartbeat(); AU.heartTimer=lerp(1.4,0.5,prox); }
}
function startChase(s){
  if(s.state!=="chase"){
    s.state="chase"; s.repath=0;
    if(s.screechCD<=0){
      s.screechCD=6;
      sfxSpiderShriek(1.0,panTo(s.pos.x,s.pos.z));
    }
  }
}
function startStalk(s){
  /* short and sharp: a hidden player buys back their tempo quickly */
  s.state="stalk"; s.stalkT=rand(3.5,5.5); s.path=[]; s.repath=0;
  if(s.screechCD<=0){ s.screechCD=4; sfxSpiderShriek(0.7,panTo(s.pos.x,s.pos.z)); }
}
/* scripted-run animation: the terminal cutscene drives position itself and
   borrows the gait so the sprint reads right */
export function spiderPose(dt,speed){
  const s=spider, u=s.mesh.userData;
  s.anim+=dt*(1.2+speed*1.35);
  for(const leg of u.legs){
    const sw=Math.sin(s.anim+leg.phase);
    const lift=Math.max(0,Math.sin(s.anim+leg.phase+1.3));
    leg.hip.rotation.y=-leg.basePhi+sw*0.30;
    leg.femG.rotation.z=0.42+lift*0.34;
  }
  u.eyeMat.emissive.setHex(0x8a1410);
  s.mesh.position.set(s.pos.x, Math.abs(Math.sin(s.anim*2))*0.07, s.pos.z);
  s.mesh.rotation.set(0,s.faceAng,0);     // clear any surface tilt before the scripted run
}
/* ---- debug hooks (smoke tests): force the new surface transitions ---- */
export function debugSpiderToWall(){
  const s=spider;
  s.pos.set(-(INNER-CELL),0,0);            // a cell off the west wall, for a clean short climb
  s.surf.mode="floor"; s.surf.phase="idle"; s.state="browse"; s.pendingT=0; s.stacking=false;
  startToWall();
}
export function debugSpiderDiscTransit(x,z){     // force an immediate surface route to (x,z)
  const s=spider;
  s.surf.mode="floor"; s.surf.phase="idle"; s.pendingT=0;
  s.lastKnown=new THREE.Vector3(x,0,z); s.discFar=true;
  startDiscTransit(x,z);
}
export function debugSpiderToCeiling(){
  const s=spider;
  s.surf.mode="floor"; s.surf.phase="idle"; s.state="browse"; s.pendingT=0; s.stacking=false;
  startToCeiling();
}

/* drop it into the far stacks, calm */
export function resetSpider(farFromX,farFromZ,minDist=33){
  const s=spider;
  let p=cellToWorld2(2,2);
  for(let t=0;t<400;t++){
    const c=randomReachCell(), q=cellToWorld2(c.cx,c.cy);
    if(Math.hypot(q.x-farFromX,q.z-farFromZ)>minDist){ p=q; break; }
  }
  s.pos.set(p.x,0,p.z);
  s.state="browse"; s.path=[]; s.repath=0; s.curSpeed=0;
  s.pendingT=0; s.speedMult=1; s.stacking=false; s.seekRun=false;
  s.lastKnown=null; s.target=null; s.mildCD=0; s.screechCD=0; s.stepAcc=0;
  s.sniffsLeft=0; s.scratchCD=0; s.sniffCD=0; s.stuckT=0; s.floorPaths=0; s.discFar=false;
  /* back on the floor, body upright; drop any silk it was mid-spinning */
  if(s.surf.web) removeWeb(s.surf.web);
  s.surf.mode="floor"; s.surf.phase="idle"; s.surf.t=0; s.surf.ramp=0; s.surf.goal=null; s.surf.hang=false; s.surf.weaveBase=null;
  s.surf.pursue=false; s.surf.glideActive=false; s.surf.glides=0; s.surf.wall=null;
  s.surf.web=null; s.surf.struck=false; s.surf.killed=false;
  s.surf.targetN.set(0,1,0);
  s.headDir.set(0,0,1);
  if(s.mesh){
    s.mesh.position.set(p.x,0,p.z); s.mesh.quaternion.identity();
    const u=s.mesh.userData;
    u.abdTilt=0; u.sniffAnim=0; u.abd.rotation.x=0; u.abd.position.set(0,u.BODY_Y+0.12,-0.95);
  }
}
