/* ---------------- the librarian — THE END's protector ----------------
   An eldritch spider the size of a small horse. It pads between the
   stacks, scratching at shelves as it peruses. It is nearly blind and it
   does not need to see you: it hears.

   The rules (from the design TODO, implemented verbatim):
   · Picking up a floppy disk alerts it to that spot after a reaction time
     set by your distance: ≤10m ⇒ 1s, scaling to 10s at 60% of the room
     span.
   · Every further pickup BEFORE it starts moving: −1s off the countdown,
     +0.5× speed. Every pickup before it REACHES the latest pickup spot:
     +0.5× speed (it re-routes to the newest one). Speed base = your sprint
     (8 m/s), capped at 3×.
   · Moving while not crouched alerts it strongly within 20m, mildly
     within 30m. Crouched movement is silent.
   · It cannot reach or crawl under the tables. */
import { clamp, lerp, angLerp, rand } from "./utils.js";
import { CELL } from "./map.js";
import { STATE, spider } from "./state.js";
import { LIB, ROOM_SPAN, cellToWorld2, worldToCell2, isBlockedSpider, bfsPath2,
         losCells2, underTable, randomReachCell, cellAt } from "./library.js";
import { AU, panTo, sfxHeartbeat, sfxSpiderTap, sfxSpiderScratch, sfxSpiderSniff,
         sfxSpiderShriek } from "./audio.js";
import { ui, toast } from "./ui.js";
import { die } from "./lifecycle.js";

const SPRINT=8.0;                       // the player's sprint speed — its base unit
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
  const ceph=new THREE.Mesh(new THREE.SphereGeometry(0.55,12,10),chitin);
  ceph.scale.set(1.05,0.78,1.0); ceph.position.set(0,BODY_Y,0.42); g.add(ceph);
  /* a crown of dim ember eyes */
  for(const[ex,ey,ez]of[[-0.12,0.16,0.9],[0.12,0.16,0.9],[-0.24,0.10,0.82],[0.24,0.10,0.82],
                        [-0.07,0.04,0.94],[0.07,0.04,0.94]]){
    const eye=new THREE.Mesh(new THREE.SphereGeometry(0.05,8,8),eyeMat);
    eye.position.set(ex,BODY_Y+ey,ez); g.add(eye);
  }
  /* chelicerae */
  for(const sx of[-0.1,0.1]){
    const fang=new THREE.Mesh(new THREE.ConeGeometry(0.07,0.34,6),chitinD);
    fang.position.set(sx,BODY_Y-0.34,0.86); fang.rotation.x=Math.PI; g.add(fang);
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
  g.userData={legs, eyeMat, abd, ceph, BODY_Y, scratchAnim:0, sniffAnim:0};
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
  const farD=0.6*ROOM_SPAN;
  const reaction = d<=10? 1 : lerp(1,10,clamp((d-10)/(farD-10),0,1));
  s.lastKnown=here;
  if(s.state==="chase"||s.state==="stalk") return;       // already on you
  if(!s.stacking){
    /* first pickup of this episode: start the countdown */
    s.stacking=true; s.speedMult=1;
    s.pendingT=reaction;
  } else if(s.pendingT>0){
    /* it hasn't started moving yet: each pickup carves a second off the
       wait and winds its speed another half-sprint tighter */
    s.pendingT=Math.max(0.25, Math.min(s.pendingT-1, reaction));
    s.speedMult=Math.min(3, s.speedMult+0.5);
  } else {
    /* already running for an earlier pickup: it re-routes to the newest
       one, faster again */
    s.speedMult=Math.min(3, s.speedMult+0.5);
    s.state="seek"; s.seekRun=true; s.repath=0;
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
/* nearly blind, but not blind: it spots open movement at short range */
function spiderCanSee(){
  if(underTable(STATE.pos.x,STATE.pos.z)) return false;
  const d=spider.pos.distanceTo(STATE.pos);
  const range=STATE.crouch? 6:13;
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

/* ================= per-frame ================= */
const SPD={browse:2.6, peruse:0, investigate:0, stalk:4.2, mildSeek:3.6};
export function updateSpider(dt){
  if(!spider.active||STATE.dead||STATE.won) return;
  const s=spider, u=s.mesh.userData;
  const dx=STATE.pos.x-s.pos.x, dz=STATE.pos.z-s.pos.z;
  const d=Math.hypot(dx,dz);
  const hiding=underTable(STATE.pos.x,STATE.pos.z)&&STATE.crouch;
  s.repath-=dt; s.mildCD-=dt; s.screechCD-=dt;

  /* ---- investigative sniffing: a couple of questioning puffs whenever it
     stops to inspect a spot (armed by investigate/peruse), never a
     proximity loop ---- */
  if(s.sniffsLeft>0){
    s.sniffT-=dt;
    if(s.sniffT<=0){
      s.sniffsLeft--;
      s.sniffT=rand(1.8,3.0);
      sfxSpiderSniff(clamp(1-d/34,0.06,1)*0.55, panTo(s.pos.x,s.pos.z));
    }
  }

  /* ---- the reaction countdown from disc pickups ---- */
  if(s.pendingT>0){
    s.pendingT-=dt;
    if(s.pendingT<=0){
      s.pendingT=0;
      s.state="seek"; s.seekRun=true; s.repath=0;
      sfxSpiderShriek(0.4,panTo(s.pos.x,s.pos.z));     // it has the scent
    }
  }

  /* ---- hearing your feet ---- */
  if(STATE.moving&&!STATE.crouch){
    if(d<20){
      s.lastKnown=STATE.pos.clone();
      if(s.state!=="chase"&&s.state!=="stalk"){
        if(s.state!=="seek"||!s.seekRun) s.repath=0;
        s.state="seek"; s.seekRun=true;
      }
    } else if(d<30&&s.mildCD<=0&&(s.state==="browse"||s.state==="peruse")){
      s.mildCD=2;
      s.lastKnown=STATE.pos.clone();
      s.state="seek"; s.seekRun=false; s.repath=0;
    }
  }

  const sees=spiderCanSee();

  /* ---- state machine ---- */
  switch(s.state){
    case "browse":
      if(sees){ startChase(s); break; }
      if(s.path.length===0&&s.repath<=0){
        const t=browseTarget();
        s.target=t; setPath2(t.x,t.z); s.repath=1.2;
      }
      if(s.target&&Math.hypot(s.target.x-s.pos.x,s.target.z-s.pos.z)<1.2){
        s.state="peruse"; s.pauseT=rand(3,7); s.scratchT=rand(0.6,1.6);
        s.faceAng=s.target.face; s.path=[];
        /* sometimes it noses the shelf before it starts to scratch */
        if(Math.random()<0.3){ s.sniffsLeft=1; s.sniffT=rand(0.8,1.6); }
      }
      break;
    case "peruse":
      if(sees){ startChase(s); break; }
      s.pauseT-=dt;
      s.scratchT-=dt;
      if(s.scratchT<=0&&s.target&&s.target.shelf){
        s.scratchT=rand(1.6,3.4);
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
        s.state="investigate"; s.searchT=rand(2.6,4.6); s.path=[];
        s.sniffsLeft=2; s.sniffT=rand(0.4,0.9);   // a couple of questioning sniffs, no more
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
        if(Math.random()<0.55){
          u.scratchAnim=1.0;
          sfxSpiderScratch(clamp(1-d/30,0.2,1)*0.9, panTo(s.pos.x,s.pos.z));
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

  /* ---- speed: walks are walks; runs scale with the stacked multiplier ---- */
  let tgt=0;
  if(s.state==="browse") tgt=SPD.browse;
  else if(s.state==="stalk") tgt=SPD.stalk;
  else if(s.state==="seek") tgt=s.seekRun? SPRINT*s.speedMult : SPD.mildSeek;
  else if(s.state==="chase") tgt=SPRINT*Math.max(1,s.speedMult);
  const rate = tgt>s.curSpeed? 9:11;             // a pounce, not a wind-up
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
  const movedSpeed=Math.hypot(s.pos.x-prevX,s.pos.z-prevZ)/Math.max(dt,1e-5);

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
  const cosY=Math.cos(s.mesh.rotation.y), sinY=Math.sin(s.mesh.rotation.y);
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
    const phiEff=-yaw;
    const horiz=FEM*Math.cos(pitch)+TIB*Math.cos(-KNEE-pitch);
    const lx=leg.hip.position.x+Math.cos(phiEff)*horiz;
    const lz=leg.hip.position.z+Math.sin(phiEff)*horiz;
    const ct=cellAt(s.pos.x+lx*cosY+lz*sinY, s.pos.z-lx*sinY+lz*cosY);
    const foldTgt = (ct===1||ct===2||ct===3)? 0.55 : (ct===4||ct===5)? 0.30 : 0;
    leg.fold+=(foldTgt-leg.fold)*Math.min(1,dt*7);
    leg.hip.rotation.y=yaw;
    leg.femG.rotation.z=pitch+leg.fold;
  }
  if(u.scratchAnim>0) u.scratchAnim-=dt;
  if(s.state!=="investigate") u.sniffAnim=Math.max(0,u.sniffAnim-dt*2);
  /* the cephalothorax dips to the carpet when it sniffs */
  u.ceph.position.y=u.BODY_Y-u.sniffAnim*0.55;
  u.ceph.position.z=0.42+u.sniffAnim*0.25;
  const breath=1+Math.sin(tNow*0.9)*0.04*(1-sp01);
  u.abd.scale.set(1.0*breath,0.9,1.35/breath);
  /* ember eyes flare when it commits */
  u.eyeMat.emissive.setHex(s.state==="chase"||s.state==="stalk"? 0x8a1410:0x3a0805);
  s.mesh.position.set(s.pos.x, Math.abs(Math.sin(s.anim*2))*0.07*sp01, s.pos.z);
  s.mesh.rotation.y=angLerp(s.mesh.rotation.y, s.faceAng, 1-Math.pow(0.86,dt*60));

  /* ---- the catch: it cannot reach under a table; anywhere else it can ---- */
  const lethal = s.state==="chase"||s.state==="stalk"||(s.state==="seek"&&s.seekRun);
  if(!underTable(STATE.pos.x,STATE.pos.z) && d<(lethal?2.1:1.5)) die();

  /* ---- proximity dressing: dread, heartbeat, the skitter bed ---- */
  const prox=clamp(1-d/20,0,1);
  ui.dread.style.opacity = (s.state==="chase"||s.state==="stalk")? (0.3+prox*0.6):prox*0.45;
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
      toast("IT KNOWS.",1500);
    }
  }
}
function startStalk(s){
  s.state="stalk"; s.stalkT=rand(7,10); s.path=[]; s.repath=0;
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
  s.mesh.rotation.y=s.faceAng;
}
/* drop it into the far stacks, calm */
export function resetSpider(farFromX,farFromZ,minDist=46){
  const s=spider;
  let p=cellToWorld2(2,2);
  for(let t=0;t<400;t++){
    const c=randomReachCell(), q=cellToWorld2(c.cx,c.cy);
    if(Math.hypot(q.x-farFromX,q.z-farFromZ)>minDist){ p=q; break; }
  }
  s.pos.set(p.x,0,p.z);
  s.state="browse"; s.path=[]; s.repath=0; s.curSpeed=0;
  s.pendingT=0; s.speedMult=1; s.stacking=false; s.seekRun=false;
  s.lastKnown=null; s.target=null; s.mildCD=0; s.screechCD=0; s.stepAcc=0; s.sniffsLeft=0;
  if(s.mesh) s.mesh.position.set(p.x,0,p.z);
}
