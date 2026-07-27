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
     +0.25× speed (it re-routes to the newest one). Run base = RUN_BASE
     (7.28 m/s, 1.4× its browse pace), multiplier capped at 2×.
   · Moving while not crouched alerts it strongly within ~16.5m walking /
     ~17m sprinting, mildly out to ~25m (base radii 13.6/20.4 × movement &
     surface gains below). Crouched movement is silent.
   · It cannot reach or crawl under the tables. */
import { clamp, lerp, rand } from "./utils.js";
import { CELL } from "./map.js";
import { STATE, spider } from "./state.js";
import { LIB, ROOM_SPAN, LIB_WALL_H, cellToWorld2, worldToCell2, isBlockedSpider, bfsPath2,
         losCells2, underTable, randomReachCell, cellAt, pushFromTables,
         spawnWeb, updateWeb, removeWeb, severWeb } from "./library.js";
import { AU, panTo, sfxHeartbeat, sfxSpiderTap, sfxSpiderScratch, sfxSpiderSniff,
         sfxSpiderShriek, sfxWebSplat, sfxWebSnap } from "./audio.js";
import { texSpiderAbd, texSpiderCarapace, texSpiderLimb } from "./textures.js";
import { mergeStatic, markShared } from "./scene.js";
import { ui } from "./ui.js";
import { die } from "./lifecycle.js";

const RUN_BASE=7.28;                    // base run speed (chase/seekRun) = ×1.4 of browse
const FEM=1.35, TIB=2.25, PITCH=0.42, KNEE=-1.62;   // leg chain dimensions

/* ---- sniff fits ----------------------------------------------------
   The cooldown is armed the moment a fit STARTS, not when it ends. It
   used to be armed only on the last puff, which left `sniffCD<=0` true
   for the whole fit — and every trigger site is guarded by exactly that.
   A player moving without line of sight close to the spider re-forces
   `seek` every frame (the hearing block outranks `investigate`), so the
   seek→investigate transition re-fired every frame, refilled `sniffsLeft`
   before it could ever reach 0, and the huffing never stopped. Arming up
   front makes the guard mean what it says; the drain below re-arms from
   the fit's end so the long quiet is still measured from the last puff. */
function startSniffFit(s,n,t0){
  if(s.sniffCD>0) return;
  s.sniffsLeft=n; s.sniffT=t0; s.sniffCD=rand(22,38);
}

/* ================= the body =================
   Rebuilt as an animal rather than an assembly of primitives. What changed,
   and why each part is where it is:

   · The abdomen and carapace are LATHES turned onto the body axis instead
     of scaled spheres, so they can be shaped (a teardrop that swells behind
     the waist, a carapace that slopes down to the eye shield) and, more
     importantly, so their UVs run around-the-body / front-to-rear and the
     folium and striae in textures.js land where they belong.
   · 8 eyes in the real two-row arrangement, not a crown of 6 — the anterior
     medians large and forward, the laterals small and set out on the
     shoulders. This is most of what makes a shape read as SPIDER.
   · Pedipalps. The old mesh had none, and their absence is why it read as
     a body with legs stuck on.
   · Legs gain a tarsus and a claw, joint bulbs, and bristles. The chain
     still measures FEM then TIB and the knee is still fixed at KNEE, so
     the gait's terrain probe (which reaches FEM·cos + TIB·cos) is unchanged
     — the tarsus is carved OUT of the tibia's length, not added past it.

   Draw calls go DOWN despite all of it: everything below femG is rigid
   (tibG's rotation is fixed at build and never animated), so each leg
   merges from 3 meshes into 1. 34 draws before, 12 now. */
const _SPIDER_MATS=()=>({
  /* Near-black and waxy. The abdomen especially wants a BROAD, weak sheen:
     it is a big smooth surface, and a tight bright highlight on one turns
     the animal into a balloon under any light that gets near it. The
     carapace is the one hard glossy plate, so it keeps a tighter lobe. */
  /* Near-neutral, near-black. Warm browns here plus the lantern's orange
     multiplied out to BRONZE — the thing looked cast, not grown. A real
     spider under a warm light stays black with the barest brown lift, so
     the maps and these tints are both pulled toward neutral. */
  body:new THREE.MeshPhongMaterial({map:texSpiderAbd, color:0x413f3b,
    specular:0x0a0806, shininess:6}),
  car:new THREE.MeshPhongMaterial({map:texSpiderCarapace, color:0x4a4844,
    specular:0x1a1712, shininess:22}),
  limb:new THREE.MeshPhongMaterial({map:texSpiderLimb, color:0x35332f,
    specular:0x0c0a08, shininess:8}),
  eye:new THREE.MeshPhongMaterial({color:0x050202, emissive:0x3a0805,
    specular:0x181818, shininess:60}),
});
markShared(texSpiderAbd,texSpiderCarapace,texSpiderLimb);
/* a lathe turned onto the body axis: profile runs front(t=0) → rear(t=1),
   u wraps the body with u=0.5 on the dorsal midline, v runs front → rear */
function bodyLathe(prof,len,rad,seg){
  const pts=prof.map(([t,r])=>new THREE.Vector2(Math.max(r*rad,0.004), t*len));
  const g=new THREE.LatheGeometry(pts,seg,-Math.PI,Math.PI*2);
  g.rotateX(-Math.PI/2);            // +Y (profile axis) → −Z (toward the rear)
  g.translate(0,0,len/2);           // centre it on its own origin
  return g;
}
/* one bristle: a hair-fine spike from p along dir. They cost almost nothing
   merged, and they are the whole difference between chitin and plastic. */
/* Everything on the head is placed by a POINT and a DIRECTION, never by
   Euler angles. Hand-written rotations are how the first pass ended up
   with the chelicerae inverted — tip welded to the face and the fat base
   swinging free — and with the pedipalps buried in the carapace. With
   these two helpers a part cannot be inside-out: the geometry is built
   from its attachment at the origin outward along +Y, and then +Y is
   simply aimed where the part should go. `end()` returns the far end so
   the next segment starts exactly where the last one stopped. */
const _bA=new THREE.Vector3(), _bB=new THREE.Vector3(0,1,0);
function aim(m,dx,dy,dz){
  _bA.set(dx,dy,dz).normalize();
  m.quaternion.setFromUnitVectors(_bB,_bA);
  return m;
}
function end(px,py,pz,dx,dy,dz,len){
  const l=Math.hypot(dx,dy,dz)||1;
  return [px+dx/l*len, py+dy/l*len, pz+dz/l*len];
}
/* a cone whose BASE sits at the attachment and whose TIP points along dir */
function spike(px,py,pz,dx,dy,dz,len,thick,mat,seg){
  const geo=new THREE.ConeGeometry(thick,len,seg||5);
  geo.translate(0,len/2,0);
  const m=new THREE.Mesh(geo,mat); m.position.set(px,py,pz);
  return aim(m,dx,dy,dz);
}
/* a tapered limb segment: r0 at the attachment, r1 at the far end */
function seg(px,py,pz,dx,dy,dz,len,r0,r1,mat){
  const geo=new THREE.CylinderGeometry(r1,r0,len,8);
  geo.translate(0,len/2,0);
  const m=new THREE.Mesh(geo,mat); m.position.set(px,py,pz);
  return aim(m,dx,dy,dz);
}
function bristle(px,py,pz,dx,dy,dz,len,thick,mat){
  return spike(px,py,pz,dx,dy,dz,len,thick,mat,4);
}
export function makeSpider(){
  const M=_SPIDER_MATS();
  const eyeMat=M.eye;
  const g=new THREE.Group();
  const BODY_Y=1.5;

  /* ---- abdomen ----------------------------------------------------
     Built at radius 0.8 / half-length 0.8 because the gait overwrites
     abd.scale to (1, 0.9, 1.35) every frame — and TAIL_LOCAL depends on
     the tail landing at local z −0.8 (→ −1.08 scaled → −2.03 in mesh
     space, where the silk anchors). Do not resize without moving both. */
  const abdParts=[];
  /* NOTE the 0.001 at both ends. A lathe profile that starts at a non-zero
     radius leaves an OPEN RING there — the geometry is a tube, not a solid
     — and with backfaces culled you see straight through it. That is what
     put a hole in the middle of the spider's face. Every body lathe closes
     at both poles now. */
  const abdGeo=bodyLathe([[0,0.001],[0.04,0.30],[0.10,0.58],[0.22,0.79],[0.36,0.93],[0.50,1.00],
                          [0.64,0.99],[0.76,0.91],[0.86,0.75],[0.94,0.49],[0.985,0.16],[1,0.001]],
                         1.6,0.8,20);
  abdParts.push(new THREE.Mesh(abdGeo,M.body));
  /* spinnerets, clustered at the tail where the silk actually leaves */
  for(const[sx,sy]of[[-0.07,0.05],[0.07,0.05],[-0.05,-0.07],[0.05,-0.07]]){
    const sp=new THREE.Mesh(new THREE.ConeGeometry(0.055,0.20,6),M.limb);
    sp.geometry.translate(0,0.10,0);
    sp.position.set(sx,sy,-0.74); sp.rotation.x=-Math.PI/2;
    abdParts.push(sp);
  }
  /* the coat: bristles over the back and flanks, swept toward the tail */
  for(let i=0;i<64;i++){
    const th=Math.random()*Math.PI*2, tz=Math.random();
    const rr=0.30+0.70*Math.sin(Math.PI*(0.10+tz*0.84));
    const z=0.8-tz*1.6, r=0.8*rr;
    const nx=Math.cos(th), ny=Math.sin(th);
    if(ny<-0.35) continue;                       // the belly is bald
    abdParts.push(bristle(nx*r*0.97, ny*r*0.97, z,
                          nx, ny+0.25, -0.55,     // swept back and up
                          0.12+Math.random()*0.20, 0.012, M.limb));
  }
  const abd=mergeStatic(abdParts,M.body);
  for(const p of abdParts) p.geometry.dispose();
  abd.matrixAutoUpdate=true;                     // the gait drives it every frame
  abd.scale.set(1.0,0.9,1.35); abd.position.set(0,BODY_Y+0.12,-0.95); g.add(abd);

  /* ---- the head group: carapace, eyes, chelicerae, pedipalps ----
     one group so the sniff dip carries all of it down together */
  const head=new THREE.Group(); g.add(head);
  const CAR_PROF=[[0,0.001],[0.03,0.30],[0.08,0.52],[0.16,0.71],[0.28,0.87],
                  [0.42,0.97],[0.58,1.00],[0.74,0.95],[0.88,0.82],[1,0.60]];
  const CAR_LEN=1.10, CAR_R=0.58, CAR_FLAT=0.74, CAR_Z=0.42;
  const carGeo=bodyLathe(CAR_PROF,CAR_LEN,CAR_R,18);
  carGeo.scale(1,CAR_FLAT,1);                    // a carapace is flat, not round
  const ceph=new THREE.Mesh(carGeo,M.car);
  ceph.position.set(0,BODY_Y,CAR_Z); head.add(ceph);

  /* ---- 8 eyes, two rows ----
     Placed ON the carapace by evaluating the SAME profile the mesh is
     lathed from, rather than by hand-picked xyz. The hand-picked set sat
     inside the shell — the laterals especially, which the skin then cut in
     half — because guessing a point on a scaled lathe by eye does not
     work. `carSurf(t,th)` returns the surface point and its outward
     normal for a profile parameter t (0 = snout) and an angle th measured
     from the dorsal midline, so an eye can be seated on the skin and
     pushed just proud of it. They are lenses, not balls: flattened along
     the normal so they read as set INTO the carapace the way real eyes
     are, without popping out of it. */
  const carRadiusAt=(z)=>{
    const t=clamp((CAR_Z+CAR_LEN/2-z)/CAR_LEN,0,1);
    let i=0; while(i<CAR_PROF.length-2 && CAR_PROF[i+1][0]<t) i++;
    const [t0,r0]=CAR_PROF[i], [t1,r1]=CAR_PROF[i+1];
    return (r0+(r1-r0)*(t-t0)/Math.max(t1-t0,1e-6))*CAR_R;
  };
  /* Keep the arrangement — it read correctly — and just push each eye OUT
     along its own direction until it meets the shell. Parametrising by
     angle instead spread them around the whole dome like a ring of beads. */
  const eyeParts=[];
  /* Seating them on the shell spreads them — the carapace flares fast
     behind the snout — so they are pulled FORWARD onto the face and cut
     right down in size. At the old radii, eight lenses on the shell read
     as a ring of red lozenges stuck to a helmet. */
  for(const[ex,ey,ez,er] of [[-0.055,0.070,0.906,0.034],[0.055,0.070,0.906,0.034],
                             [-0.070,0.150,0.866,0.028],[0.070,0.150,0.866,0.028],
                             [-0.150,0.050,0.884,0.022],[0.150,0.050,0.884,0.022],
                             [-0.175,0.115,0.848,0.020],[0.175,0.115,0.848,0.020]]){
    const r=carRadiusAt(ez), ry=r*CAR_FLAT;
    /* scale the (x,y) offset out onto the shell's ellipse at this z */
    const q=Math.hypot(ex/r, ey/ry) || 1e-6;
    const sx=ex/q, sy=ey/q;
    const n=[sx/(r*r), sy/(ry*ry), 0];                       // ellipse normal
    const L=Math.hypot(n[0],n[1])||1; n[0]/=L; n[1]/=L;
    const e=new THREE.Mesh(new THREE.SphereGeometry(er,10,8),eyeMat);
    e.scale.set(1,0.62,1);                                   // a lens, not a bead
    e.position.set(sx+n[0]*er*0.28, BODY_Y+sy+n[1]*er*0.28, ez);
    aim(e,n[0],n[1],n[2]);                                   // flatten ALONG the normal
    eyeParts.push(e);
  }
  const eyes=mergeStatic(eyeParts,eyeMat);
  for(const p of eyeParts) p.geometry.dispose();
  head.add(eyes);

  /* chelicerae: a stout basal segment hanging under the clypeus, the fang
     folded down and BACK off its end (a resting spider's fangs tuck under,
     they do not stick out forward). Pedipalps sit OUTSIDE the jaws and
     stop short of them, so nothing intersects the carapace. Everything
     here is deliberately smaller than the first pass — at that size the
     mouthparts were the only thing you could see of the face. */
  const jaw=[];
  for(const sx of[-1,1]){
    /* --- chelicera --- */
    const bx=sx*0.115, by=BODY_Y-0.20, bz=0.78;
    const bd=[sx*0.10,-1,0.16], bl=0.26;
    jaw.push(seg(bx,by,bz, bd[0],bd[1],bd[2], bl, 0.095,0.072, M.limb));
    const [fx,fy,fz]=end(bx,by,bz, bd[0],bd[1],bd[2], bl);
    jaw.push(spike(fx,fy,fz, sx*0.04,-1,-0.42, 0.22, 0.048, M.limb, 7));
    /* --- pedipalp: two short segments, elbowed, clear of the jaws --- */
    const px=sx*0.31, py=BODY_Y-0.14, pz=0.60;
    const pd=[sx*0.62,-0.74,0.36], pl=0.26;
    jaw.push(seg(px,py,pz, pd[0],pd[1],pd[2], pl, 0.052,0.042, M.limb));
    const [qx,qy,qz]=end(px,py,pz, pd[0],pd[1],pd[2], pl);
    jaw.push(seg(qx,qy,qz, sx*0.12,-0.96,0.24, 0.22, 0.042,0.024, M.limb));
    /* a few bristles on the palps, pointing away from the body */
    for(let i=0;i<4;i++)
      jaw.push(bristle(sx*(0.34+Math.random()*0.10), BODY_Y-0.20-Math.random()*0.18,
                       0.58+Math.random()*0.14, sx*0.8, -0.35, 0.4,
                       0.07+Math.random()*0.05, 0.009, M.limb));
  }
  const jawM=mergeStatic(jaw,M.limb);
  for(const p of jaw) p.geometry.dispose();
  head.add(jawM);

  /* ---- 8 legs: hip yaw + femur pitch + fixed knee, animated as two
     alternating tetrapods. Everything below femG is rigid, so it merges. ---- */
  const legs=[];
  const PHI_R=[0.96,0.35,-0.26,-0.87];           // splay angles, right side
  const TIBL=TIB*0.60, TARL=TIB-TIBL;            // tibia / tarsus split of the same reach
  for(let side=0;side<2;side++){
    for(let i=0;i<4;i++){
      const phi = side===0? PHI_R[i] : Math.PI-PHI_R[i];
      const hip=new THREE.Group();
      hip.position.set((side===0?1:-1)*0.42, BODY_Y, 0.55-i*0.37);
      hip.rotation.y=-phi;
      const femG=new THREE.Group(); femG.rotation.z=PITCH; hip.add(femG);

      const parts=[];
      /* coxa/trochanter: the thick stub where the leg meets the body */
      const cox=new THREE.Mesh(new THREE.SphereGeometry(0.115,9,7),M.limb);
      cox.scale.set(1.25,0.95,0.95); parts.push(cox);
      const fem=new THREE.Mesh(new THREE.CylinderGeometry(0.088,0.058,FEM,8),M.limb);
      fem.geometry.rotateZ(-Math.PI/2); fem.geometry.translate(FEM/2,0,0);
      parts.push(fem);
      const knee=new THREE.Mesh(new THREE.SphereGeometry(0.082,9,7),M.limb);
      knee.position.x=FEM; parts.push(knee);
      /* femur bristles */
      for(let b=0;b<5;b++){
        const t=0.18+Math.random()*0.7, a=Math.random()*Math.PI*2;
        parts.push(bristle(FEM*t, Math.sin(a)*0.06, Math.cos(a)*0.06,
                           -0.35, Math.sin(a), Math.cos(a),
                           0.13+Math.random()*0.13, 0.010, M.limb));
      }
      /* everything past the knee rides a fixed-rotation frame — build it
         under a temp group so mergeStatic bakes that transform in */
      const tibG=new THREE.Group(); tibG.position.x=FEM; tibG.rotation.z=KNEE;
      tibG.updateMatrixWorld(true);
      const tibParts=[];
      const tib=new THREE.Mesh(new THREE.CylinderGeometry(0.056,0.030,TIBL,8),M.limb);
      tib.geometry.rotateZ(-Math.PI/2); tib.geometry.translate(TIBL/2,0,0);
      tibParts.push(tib);
      const ank=new THREE.Mesh(new THREE.SphereGeometry(0.036,8,6),M.limb);
      ank.position.x=TIBL; tibParts.push(ank);
      /* the tarsus, angled a little further down — the foot */
      const tar=new THREE.Mesh(new THREE.CylinderGeometry(0.030,0.014,TARL,7),M.limb);
      tar.geometry.rotateZ(-Math.PI/2); tar.geometry.translate(TARL/2,0,0);
      tar.position.x=TIBL; tar.rotation.z=-0.30; tibParts.push(tar);
      /* the claw */
      const claw=new THREE.Mesh(new THREE.ConeGeometry(0.020,0.10,5),M.limb);
      claw.geometry.rotateZ(-Math.PI/2); claw.geometry.translate(0.05,0,0);
      claw.position.set(TIBL+Math.cos(-0.30)*TARL, Math.sin(-0.30)*TARL, 0);
      claw.rotation.z=-0.95; tibParts.push(claw);
      /* tibial bristles — the spiny ones, longest on a spider's shin */
      for(let b=0;b<7;b++){
        const t=0.10+Math.random()*0.82, a=Math.random()*Math.PI*2;
        tibParts.push(bristle(TIBL*t, Math.sin(a)*0.04, Math.cos(a)*0.04,
                              -0.30, Math.sin(a), Math.cos(a),
                              0.14+Math.random()*0.16, 0.009, M.limb));
      }
      for(const p of tibParts){ tibG.add(p); }
      tibG.updateMatrixWorld(true);
      parts.push(...tibParts);

      const legMesh=mergeStatic(parts,M.limb);
      for(const p of parts) p.geometry.dispose();
      femG.add(legMesh);
      g.add(hip);
      legs.push({hip, femG, basePhi:phi, phase:(i%2===0)===(side===0)? 0:Math.PI,
                 front:i===0, row:i, fold:0});
    }
  }
  g.userData={legs, eyeMat, abd, head, BODY_Y, scratchAnim:0, sniffAnim:0, abdTilt:0, animated:true};
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
  const range=(STATE.crouch||!STATE.moving)? 4.2 : 11.44*(STATE.sprinting?1.15:1.10);   // still/crouched (unchanged); moving = walk ×1.10 / run ×1.15, +10% floor sight
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
      if(s.sniffsLeft<=0) s.sniffCD=rand(22,38);      // re-arm: the quiet runs from the last puff
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
    const floorGain = s.surf.mode==="floor" ? 1.10 : 1;   // +10% floor detection (wall/ceiling keep their own gain)
    const strongR = 13.6*moveGain*wallGain*floorGain, mildR = 20.4*moveGain*wallGain*floorGain;
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
        if(Math.random()<0.1) startSniffFit(s,1+Math.floor(Math.random()*2),rand(0.8,1.6));
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
         within a stride of the spot counts as arriving.
         A spot ON a table needs its own radius: pushFromTables holds the
         body at exactly 2.0m (CELL/2) from the cell centre, so the 2.0m
         close-approach can NEVER fire there — without this, arrival hangs
         entirely on the path running dry, and a spider pinned at the
         keep-out re-pathing the same unreachable spot seeks forever */
      const dLK=s.lastKnown? s.pos.distanceTo(s.lastKnown) : 1e9;
      const lkOnTable=s.lastKnown && cellAt(s.lastKnown.x,s.lastKnown.z)===4;
      if(dLK<2.0||(lkOnTable&&dLK<3.2)||(s.path.length===0&&dLK<CELL*1.5)){
        if(hiding&&d<5.5){ startStalk(s); break; }
        if(s.lastKnown){ s.faceAng=Math.atan2(s.lastKnown.x-s.pos.x,s.lastKnown.z-s.pos.z); }
        s.state="investigate"; s.searchT=rand(1.82,3.22); s.path=[];   // −30%: it lingers less over a scent
        /* a clustered fit of questioning sniffs — only if it has been quiet */
        startSniffFit(s,2+Math.floor(Math.random()*3),rand(0.4,0.9));
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
     the state machine pick a fresh one. Chase already repaths on its own.
     A pinned SEEK escalates: seek would just re-path the same unreachable
     spot 3×/s forever (the table-edge softlock), so if it's already within
     a stride and a half of the spot, that IS arrival — inspect from here,
     which also ends the episode and resets the stacked speed. */
  if(s.path.length&&s.curSpeed>0.5&&movedSpeed<0.3){
    s.stuckT+=dt;
    if(s.stuckT>1.2){
      s.stuckT=0; s.path=[]; s.repath=0;
      if(s.state==="seek"&&s.lastKnown&&s.pos.distanceTo(s.lastKnown)<CELL*1.5){
        s.faceAng=Math.atan2(s.lastKnown.x-s.pos.x,s.lastKnown.z-s.pos.z);
        s.state="investigate"; s.searchT=rand(1.82,3.22);
        startSniffFit(s,2+Math.floor(Math.random()*3),rand(0.4,0.9));
      }
    }
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
  /* the bed is silent while dead for the same reason level 0's is: the catch
     above calls die(), which ramps it out, and a write later in the SAME
     frame is the last one it ever gets — main.js has stopped the world by
     the next one. See the note in monster.js's continuous-audio block. */
  if(AU.ctx&&AU.spiderBedGain&&!STATE.dead){
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
/* scripted digging: the terminal ending parks it over the dig spot and calls
   this every frame. The front two leg pairs strike downward in a violent
   flurry, the back pairs brace, the head stays buried in the work — and the
   whole body rides `sink` metres below the floor as it digs itself under. */
export function spiderDigPose(dt,sink=0){
  const s=spider, u=s.mesh.userData;
  const tNow=performance.now()/1000;
  s.anim+=dt*3;
  /* burrowing, not descending on a rope: as the pit deepens the whole body
     pitches nose-first (to ~55°) and slides FORWARD into the dark — the
     front goes under while the abdomen is still working the surface */
  const dive=clamp(sink/1.6,0,1);
  for(const leg of u.legs){
    if(leg.row<2){
      /* alternating downward strikes, fast and deep */
      leg.hip.rotation.y=-leg.basePhi+Math.sin(tNow*22+leg.phase)*0.24;
      leg.femG.rotation.z=0.95+Math.sin(tNow*26+leg.phase*2.3)*0.55;
    } else {
      /* braced low — scrambling harder the steeper it tips, shoving it down */
      leg.hip.rotation.y=-leg.basePhi+Math.sin(tNow*(3+dive*15)+leg.phase)*(0.04+dive*0.16);
      leg.femG.rotation.z=PITCH+0.14+dive*0.30;
    }
  }
  u.sniffAnim=Math.min(1,u.sniffAnim+dt*3);      // head down into the work
  u.head.position.y=-u.sniffAnim*0.55;
  u.head.position.z=u.sniffAnim*0.25;
  u.abd.rotation.x=0.22-dive*0.12;                // abdomen cocked up, throwing spoil
  u.abd.position.y=(u.BODY_Y+0.12)+0.18;
  u.eyeMat.emissive.setHex(0x8a1410);
  const fwd=0.9*dive, pitch=0.16+dive*0.8;
  s.mesh.position.set(s.pos.x+Math.sin(s.faceAng)*fwd,
                      Math.abs(Math.sin(tNow*9))*0.05*(1-dive*0.6)-sink,
                      s.pos.z+Math.cos(s.faceAng)*fwd);
  s.mesh.rotation.order="YXZ";
  s.mesh.rotation.set(pitch,s.faceAng,0);
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

/* ================= THE NEST — the librarian, at home ================= */
/* Down here it is a parent. It circulates between the brood chambers on a
   tending patrol; near the nests the silk-laced ground carries your
   footfalls to it at twice the range, while out in the open cave it is
   duller than you remember. It cannot follow you through the squeezes.
   Burn a clutch and it comes at a dead run — and once the last one burns,
   it never goes back to tending anything. */
import { CAVE, cellToWorld3, worldToCell3, isBlockedSpider3, bfsPath3, losCells3,
         cellAt3, randomReachCell3, surfaceNoiseGain, silkGainAt, CAVE_SPAN,
         floorYAt } from "./cave.js";
import { anyLatched } from "./hatchling.js";

const inSqueeze=()=>cellAt3(STATE.pos.x,STATE.pos.z)===2;
function corridorClear3(ax,az,bx,bz){
  const dx=bx-ax, dz=bz-az, len=Math.hypot(dx,dz);
  if(len<0.001) return true;
  const ox=-dz/len*0.7, oz=dx/len*0.7;
  const steps=Math.ceil(len);
  for(let i=1;i<=steps;i++){
    const t=i/steps, x=lerp(ax,bx,t), z=lerp(az,bz,t);
    for(const[sx,sz]of[[0,0],[ox,oz],[-ox,-oz]]){
      const c=worldToCell3(x+sx,z+sz);
      if(isBlockedSpider3(c.cx,c.cy)) return false;
    }
  }
  return true;
}
/* `setPath3` REPORTS WHETHER IT COULD ACTUALLY GET THERE, and every caller
   that measures arrival against its own mark has to read that.

   `bfsPath3` is best-effort: handed a cell it cannot stand in — a squeeze,
   the far side of a rubble choke, anything the flood never reached — it
   returns the route to the nearest cell it CAN stand in and says nothing.
   Left unchecked that is a hard softlock, and it is the exact library bug
   in a new costume: she walks to the doorstep of the crawl you are hiding
   in, her path runs dry two or three cells short of the mark, and an
   arrival test written against the MARK never fires. She then re-paths the
   same impossible cell every 0.35–0.8s forever, standing perfectly still.
   The movement watchdog cannot save her either, because that one only
   fires while a path EXISTS and here the path is empty.

   The fix is the library's: THE DOORSTEP IS THE DESTINATION. Callers snap
   their mark onto `end` when `reached` is false, so every radius below is
   measured against a place she can physically stand, the episode arrives,
   and `investigate` closes it out the way it always did. */
function setPath3(wx,wz){
  const s=spider;
  let a=worldToCell3(s.pos.x,s.pos.z);
  if(isBlockedSpider3(a.cx,a.cy)){
    for(const[ox,oy]of[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
      if(!isBlockedSpider3(a.cx+ox,a.cy+oy)){
        const q=cellToWorld3(a.cx+ox,a.cy+oy);
        s.pos.x=q.x; s.pos.z=q.z;
        a=worldToCell3(q.x,q.z);
        break;
      }
    }
  }
  const b=worldToCell3(clamp(wx,-CAVE_SPAN/2+CELL,CAVE_SPAN/2-CELL),
                       clamp(wz,-CAVE_SPAN/2+CELL,CAVE_SPAN/2-CELL));
  const p=bfsPath3(a.cx,a.cy,b.cx,b.cy,false);
  s.path = p? p.map(c=>cellToWorld3(c.cx,c.cy)) : [];
  /* read the endpoint off the RAW route, before the shift and the smoothing
     chew on the copy: an exhausted path is [] and would report nothing */
  const endC = (p&&p.length)? p[p.length-1] : null;
  const reached = !!endC && endC.cx===b.cx && endC.cy===b.cy;
  if(s.path.length>1) s.path.shift();
  /* smooth */
  if(s.path.length>=3){
    const out=[]; let cx=s.pos.x, cz=s.pos.z, i=0;
    while(i<s.path.length){
      let j=s.path.length-1;
      while(j>i && !corridorClear3(cx,cz,s.path[j].x,s.path[j].z)) j--;
      out.push(s.path[j]); cx=s.path[j].x; cz=s.path[j].z; i=j+1;
    }
    s.path=out;
  }
  return {reached, end: endC? cellToWorld3(endC.cx,endC.cy) : null};
}
/* move a mark onto the closest ground she can actually stand on. Only ever
   called when the route came back short — an unreachable pocket becomes its
   own doorstep, which is what "she got as near as the cave allows" means. */
function snapMark(mark,r){
  if(mark&&r&&!r.reached&&r.end) mark.set(r.end.x,0,r.end.z);
}
/* ---- what a NOISE tells it ------------------------------------------
   THE GAINS MULTIPLY, AND FIVE OF THEM MULTIPLY TO TELEPATHY. Each one is
   defensible on its own — a sprint is louder than a walk, scree roars, a
   silk-laced nest floor carries a footfall straight to her, a burning
   clutch has her listening for you — and the code multiplied all five
   together. Measured in a built cave: standing on a nest floor and simply
   WALKING put the strong (sprint-at-you) radius at 22.4m and the mild one
   at 33.7m, and one clutch alight took those to 35.9m and 53.8m. The cave
   is 188m across, 22% of its walkable cells are silk — and they are the
   22% the level REQUIRES you to stand on, four times, to win. So from a
   third of the map away, through solid rock, with no line of sight and no
   hatchling on your shoulder, she knew where you were and came. That is
   the "it just knows" the level shipped with.
   The product is CAPPED. One number, and it is the loudest the cave is
   ever allowed to be: 17.3m sprinting to you, 26.0m walking. Every plain
   case is well under it and unchanged (stone 9.0/13.5, scree 15.0/22.5) —
   the cap only bites where the stack was compounding.

   And what hearing gives you is a PLACE, NOT A PIN. Even inside the
   radius the old code copied STATE.pos exactly, so she did not walk
   toward the noise, she walked onto your head — which is the other half
   of what reads as telepathy. `heardSpot` scatters the mark by an error
   that grows with range, held steady for a second or so at a time so it
   drifts with you rather than jittering per frame. She arrives NEAR you
   and starts sniffing, which is what `investigate` was always for. The
   two channels that legitimately have you pinned keep the pin: sight
   (`chase`), and a child of hers screaming from your shoulder. */
const GAIN_CAP=1.7;
function heardSpot(s,d){
  if(s.hearT<=0){
    s.hearT=rand(0.9,1.6);
    s.hearA=Math.random()*Math.PI*2;
    s.hearF=Math.random();
  }
  const err=clamp(d*0.16,0,3.0)*s.hearF;
  return new THREE.Vector3(STATE.pos.x+Math.cos(s.hearA)*err, 0,
                           STATE.pos.z+Math.sin(s.hearA)*err);
}
function caveCanSee(){
  if(inSqueeze()) return false;                    // the crawl hides you whole
  const d=spider.pos.distanceTo(STATE.pos);
  const range=(STATE.crouch||!STATE.moving)? 3.6 : 9.4*(STATE.sprinting?1.15:1.05);
  if(d>range) return false;
  return losCells3(spider.pos.x,spider.pos.z,STATE.pos.x,STATE.pos.z);
}
function nextBrood(){
  const s=spider;
  const alive=CAVE.broods.map((b,i)=>({b,i})).filter(e=>!e.b.burned);
  if(!alive.length) return null;
  /* the tending round: the next unburned nest along, never the one it's at */
  const cur=s.nestIdx===undefined? -1 : s.nestIdx;
  const next=alive.find(e=>e.i>cur) || alive[0];
  s.nestIdx=next.i;
  return next.b;
}

/* ---- the room ledger ----------------------------------------------
   `hunt` quarters the cave around the cell YOU are standing in, so every
   target it picks for itself lands in your room — and with a crouched,
   stationary player it cannot see or hear, that is a camp, not a hunt: it
   circles the same chamber indefinitely, shrieking, never closing. Worse,
   it never released `lastKnown` after working it, so even the quartering
   was tethered — drift 3m off the old spot and it walked straight back.

   So the player-anchored rolls are COUNTED: three in a row and the next
   target must be another room entirely, and it is COMMITTED to — it has to
   arrive before it may quarter again. That spreads its routes across the
   warren and guarantees a stationary player a window.

   Count the ROLLS, not the room the target lands in. Booking targets
   against a room key was the first attempt and it silently did nothing:
   the quartering throws targets ±6 cells, most of which fall in tunnel
   cells outside the chamber, so consecutive picks kept landing in
   different buckets and reset the counter. A player-anchored roll is the
   camp by construction — that is the thing to cap. */
function roomOf3(x,z){
  const c=worldToCell3(x,z);
  let best=-1, bd=1e9;
  for(let i=0;i<CAVE.chambers.length;i++){
    const ch=CAVE.chambers[i];
    const dd=Math.hypot(c.cx-ch.cx,c.cy-ch.cy);
    if(dd<=ch.r+1.5&&dd<bd){ bd=dd; best=i; }
  }
  return best>=0? "c"+best : "t"+(c.cx>>2)+","+(c.cy>>2);
}
const ROOM_CAP=3;
/* somewhere it is NOT: a chamber (those are this level's rooms), never the
   one it is standing in and never the one you are in */
function otherRoomCell3(){
  const s=spider;
  const mine=roomOf3(s.pos.x,s.pos.z), yours=roomOf3(STATE.pos.x,STATE.pos.z);
  const opts=[];
  for(let i=0;i<CAVE.chambers.length;i++){
    const key="c"+i;
    if(key===mine||key===yours) continue;
    const ch=CAVE.chambers[i];
    if(isBlockedSpider3(ch.cx,ch.cy)) continue;
    opts.push(cellToWorld3(ch.cx,ch.cy));
  }
  if(opts.length) return opts[Math.floor(Math.random()*opts.length)];
  for(let t=0;t<24;t++){                     // no chamber free: anywhere far
    const c=randomReachCell3(), q=cellToWorld3(c.cx,c.cy);
    if(Math.hypot(q.x-STATE.pos.x,q.z-STATE.pos.z)>25) return q;
  }
  return null;
}

export function updateSpiderCave(dt){
  if(!spider.active||STATE.dead||STATE.won) return;
  const s=spider, u=s.mesh.userData;
  const dx=STATE.pos.x-s.pos.x, dz=STATE.pos.z-s.pos.z;
  const d=Math.hypot(dx,dz);
  const frenzy=STATE.frenzyT>0;
  const allBurned=STATE.clutchesLit>=4;
  s.repath-=dt; s.mildCD-=dt; s.screechCD-=dt; s.scratchCD-=dt; s.sniffCD-=dt;
  s.hearT=(s.hearT||0)-dt;

  /* sniff fits (same voice as upstairs) */
  if(s.sniffsLeft>0){
    s.sniffT-=dt;
    if(s.sniffT<=0){
      s.sniffsLeft--;
      s.sniffT=rand(0.25,0.95);
      if(s.sniffsLeft<=0) s.sniffCD=rand(22,38);   // re-arm from the last puff
      sfxSpiderSniff(clamp(1-d/34,0.06,1)*0.55, panTo(s.pos.x,s.pos.z));
    }
  }

  /* ---- a clutch just went up ---- */
  if(CAVE.lastBurn && s.burnSeen!==CAVE.lastBurn.at){
    s.burnSeen=CAVE.lastBurn.at;
    s.state="frenzy";
    s.lastKnown=new THREE.Vector3(CAVE.lastBurn.x,0,CAVE.lastBurn.z);
    s.repath=0; s.path=[];
    sfxSpiderShriek(1.0,panTo(s.pos.x,s.pos.z));
  }

  /* ---- hearing ---- */
  const latched=anyLatched();
  if(latched){
    /* its child is screaming from your shoulder */
    s.lastKnown=STATE.pos.clone();
    if(s.state!=="chase"&&s.state!=="frenzy"){ s.state="seek"; s.seekRun=true; if(s.repath>0.35)s.repath=0.35; }
  } else if(STATE.cranking){
    /* the ratchet grind carries clean through stone */
    if(d<18){
      s.lastKnown=heardSpot(s,d);
      if(s.state!=="chase"&&s.state!=="frenzy"){ s.state="seek"; s.seekRun=d<10; s.repath=Math.min(s.repath,0.5); }
    }
  } else if(STATE.moving&&!STATE.crouch){
    const moveGain=STATE.sprinting? 1.15:1.10;
    const surfGain=surfaceNoiseGain(STATE.pos.x,STATE.pos.z);
    const silk=silkGainAt(STATE.pos.x,STATE.pos.z);
    const dull=silk>1? 1:0.8;                     // open cave: duller than the library
    const sense=frenzy? 1.6 : allBurned? 1.25 : 1;
    const gain=Math.min(moveGain*surfGain*silk*dull*sense, GAIN_CAP);
    const strongR=10.2*gain, mildR=15.3*gain;
    if(d<strongR){
      s.lastKnown=heardSpot(s,d);
      if(s.state!=="chase"&&s.state!=="frenzy"){
        if(s.state!=="seek"||!s.seekRun) s.repath=0;
        s.state="seek"; s.seekRun=true;
      }
    } else if(d<mildR&&s.mildCD<=0&&(s.state==="tend"||s.state==="tending"||s.state==="rampage")){
      s.mildCD=2;
      s.lastKnown=heardSpot(s,d);
      s.state="seek"; s.seekRun=false; s.repath=0;
    }
  }
  /* ---- the lantern is a beacon ---- */
  if(STATE.lanternOn){
    s.glowT=(s.glowT||0)+dt;
    s.glowCD=(s.glowCD||0)-dt;
    if(s.glowT>5&&s.glowCD<=0&&d<40&&losCells3(s.pos.x,s.pos.z,STATE.pos.x,STATE.pos.z)
       &&s.state!=="chase"&&s.state!=="frenzy"){
      s.glowCD=3;
      s.lastKnown=heardSpot(s,d);          // a glow at range is a bearing, not a pin
      s.state="seek"; s.seekRun=d<16; s.repath=0;
    }
  } else s.glowT=0;

  const sees=caveCanSee();
  let movedSpeed=0;

  /* ---- state machine ---- */
  switch(s.state){
    case "tend":{
      if(sees){ s.state="chase"; s.repath=0; if(s.screechCD<=0){s.screechCD=6;sfxSpiderShriek(1,panTo(s.pos.x,s.pos.z));} break; }
      if(!s.tendTgt){
        const b=allBurned? null : nextBrood();
        if(!b){ s.state="hunt"; break; }
        s.tendTgt=b.center;
        setPath3(s.tendTgt.x,s.tendTgt.z); s.repath=2;
      }
      if(s.path.length===0&&s.repath<=0&&s.tendTgt){ setPath3(s.tendTgt.x,s.tendTgt.z); s.repath=2; }
      if(s.tendTgt&&Math.hypot(s.tendTgt.x-s.pos.x,s.tendTgt.z-s.pos.z)<2.6){
        s.state="tending"; s.pauseT=rand(4,7); s.scratchT=rand(0.4,1.0);
        s.faceAng=Math.atan2(s.tendTgt.x-s.pos.x,s.tendTgt.z-s.pos.z);
        s.tendTgt=null; s.path=[];
      }
      break;
    }
    case "tending":
      if(sees){ s.state="chase"; s.repath=0; break; }
      s.pauseT-=dt; s.scratchT-=dt;
      if(s.scratchT<=0&&s.scratchCD<=0){
        s.scratchT=rand(3,6); s.scratchCD=rand(4,8);
        u.scratchAnim=1.0;
        sfxSpiderScratch(clamp(1-d/60,0.05,1)*0.7, panTo(s.pos.x,s.pos.z));
      }
      if(s.pauseT<=0){ s.state="tend"; s.repath=0; }
      break;
    case "seek":{
      if(sees){ s.state="chase"; s.repath=0; if(s.screechCD<=0){s.screechCD=6;sfxSpiderShriek(1,panTo(s.pos.x,s.pos.z));} break; }
      if(s.lastKnown&&s.repath<=0){
        /* the mark is usually YOU, and you are allowed to be somewhere she
           is not: crouched down a squeeze, past a choke. Snap it to where
           the route actually ends or she seeks that spot forever. */
        snapMark(s.lastKnown, setPath3(s.lastKnown.x,s.lastKnown.z));
        s.repath=s.seekRun?0.35:0.8;
      }
      const dLK=s.lastKnown? s.pos.distanceTo(s.lastKnown) : 1e9;
      if(dLK<2.0||(s.path.length===0&&dLK<CELL*1.5)){
        if(s.lastKnown) s.faceAng=Math.atan2(s.lastKnown.x-s.pos.x,s.lastKnown.z-s.pos.z);
        s.state="investigate"; s.searchT=rand(1.8,3.2); s.path=[];
        startSniffFit(s,1+Math.floor(Math.random()*2),rand(0.4,0.9));  // half the library's fit: down here it huffs less
      }
      break;
    }
    case "investigate":
      if(sees){ s.state="chase"; s.repath=0; break; }
      s.searchT-=dt;
      u.sniffAnim=Math.min(1,u.sniffAnim+dt*3);
      s.faceAng+=dt*0.9;
      if(s.searchT<=0){
        s.seekRun=false;
        s.state = frenzy? "rampage" : allBurned? "hunt" : "tend";
        s.tendTgt=null; s.repath=0;
      }
      break;
    case "chase":
      if(!sees){
        s.lastKnown=STATE.pos.clone();
        s.state="seek"; s.seekRun=true; s.repath=0;
      } else {
        s.lastKnown=STATE.pos.clone();
        if(s.repath<=0){ setPath3(STATE.pos.x,STATE.pos.z); s.repath=0.3; }
      }
      break;
    case "frenzy":{
      /* coming for the fire at a dead run */
      if(sees){ s.state="chase"; s.repath=0; break; }
      if(s.lastKnown&&s.repath<=0){
        snapMark(s.lastKnown, setPath3(s.lastKnown.x,s.lastKnown.z));
        s.repath=0.4;
      }
      const dB=s.lastKnown? s.pos.distanceTo(s.lastKnown):0;
      if(dB<3.4||(s.path.length===0&&dB<CELL*1.6)){
        s.state="rampage"; s.path=[]; s.repath=0;
        s.rageC=s.lastKnown? s.lastKnown.clone() : s.pos.clone();
        startSniffFit(s,2,0.3);
      }
      break;
    }
    case "rampage":{
      /* circling the murdered nest until the rage clock runs out */
      if(sees){ s.state="chase"; s.repath=0; break; }
      if(!frenzy){ s.state=allBurned? "hunt":"tend"; s.tendTgt=null; s.repath=0; break; }
      if(s.path.length===0&&s.repath<=0){
        const c=worldToCell3(s.rageC.x,s.rageC.z);
        let px=null,pz=null;
        for(let t=0;t<10;t++){
          const ox=Math.floor(rand(-4,5)), oy=Math.floor(rand(-4,5));
          if(!isBlockedSpider3(c.cx+ox,c.cy+oy)){
            const q=cellToWorld3(c.cx+ox,c.cy+oy); px=q.x; pz=q.z; break;
          }
        }
        if(px!==null) setPath3(px,pz);
        s.repath=rand(0.8,1.5);
        if(Math.random()<0.3&&s.screechCD<=0){ s.screechCD=5; sfxSpiderShriek(0.6,panTo(s.pos.x,s.pos.z)); }
      }
      break;
    }
    case "hunt":{
      /* nothing left to tend. There is only you. */
      if(sees){ s.state="chase"; s.repath=0; break; }
      s.huntT=(s.huntT||0)-dt;
      if(s.lastKnown&&s.pos.distanceTo(s.lastKnown)>3){
        /* a real cue outranks anything it invented for itself */
        s.roamTgt=null;
        if(s.repath<=0){
          /* same snap as `seek`: unsnapped, a mark she cannot reach never
             falls inside the 3m release below, so the hunt parks on it */
          snapMark(s.lastKnown, setPath3(s.lastKnown.x,s.lastKnown.z));
          s.repath=0.5;
        }
      } else {
        /* it has worked that spot — release it, or the quartering below is
           just a tether that keeps snapping back to one corner */
        s.lastKnown=null;
        if(s.roamTgt){
          /* a roam is COMMITTED: it walks the target down instead of
             re-rolling one every couple of seconds. Re-rolling is what let
             the old hunt orbit you forever — and, once the cap existed, it
             also burned the room's three picks in five seconds of travel,
             so it turned around before it ever arrived anywhere. */
          s.roamT-=dt;
          if(Math.hypot(s.roamTgt.x-s.pos.x,s.roamTgt.z-s.pos.z)<3.5||s.roamT<=0) s.roamTgt=null;
          else if(s.repath<=0){
            setPath3(s.roamTgt.x,s.roamTgt.z); s.repath=rand(1.2,2.2);
            if(!s.path.length) s.roamTgt=null;      // unreachable: don't stall on it
          }
        }
        if(!s.roamTgt&&s.repath<=0){
          let q=null;
          if((s.roomN||0)>=ROOM_CAP&&(q=otherRoomCell3())) s.roomN=0;   // go somewhere else
          if(!q){
            /* a hunch: it quarters the cave toward where you breathe */
            const pc=worldToCell3(STATE.pos.x,STATE.pos.z);
            for(let t=0;t<12;t++){
              const ox=Math.floor(rand(-6,7)), oy=Math.floor(rand(-6,7));
              if(!isBlockedSpider3(pc.cx+ox,pc.cy+oy)){ q=cellToWorld3(pc.cx+ox,pc.cy+oy); break; }
            }
            if(!q){ const c=randomReachCell3(); q=cellToWorld3(c.cx,c.cy); }
            s.roomN=(s.roomN||0)+1;
          }
          s.roamTgt={x:q.x,z:q.z}; s.roamT=18;
          setPath3(q.x,q.z); s.repath=rand(1.2,2.2);
          if(!s.path.length) s.roamTgt=null;
        }
      }
      if(s.huntT===undefined||s.huntT<=0){
        s.huntT=rand(12,20);
        sfxSpiderShriek(0.55,panTo(s.pos.x,s.pos.z));
      }
      break;
    }
    default:
      s.state="tend"; s.tendTgt=null;
  }

  /* ---- speed ---- */
  let tgt=0;
  /* the warren is half again as wide now: the unhurried gaits cover more
     ground so the tending rounds and hunts keep their old pacing — but the
     first pass overshot by ~20%. At 7.2 the hunt was within a whisker of
     the 7.28 run and read as a chase that never resolved; every UNHURRIED
     gait (tend/mild seek/rampage/hunt) is 20% off those numbers now. The
     run speeds — chase, frenzy, seekRun — are untouched: those ARE the
     chase, and they are what the escape is measured against. */
  if(s.state==="tend") tgt=4.5;
  else if(s.state==="seek") tgt=s.seekRun? RUN_BASE*(frenzy?1.15:allBurned?1.05:1) : 4.58;
  else if(s.state==="chase") tgt=RUN_BASE*(frenzy?1.15:1.05);
  else if(s.state==="frenzy") tgt=RUN_BASE*1.15;
  else if(s.state==="rampage") tgt=5.4;
  else if(s.state==="hunt") tgt=5.8;
  const rate = tgt>s.curSpeed? 6:11;
  s.curSpeed += clamp(tgt-s.curSpeed, -rate*dt, rate*dt);

  /* ---- movement ---- */
  const prevX=s.pos.x, prevZ=s.pos.z;
  if(s.curSpeed>0.05&&s.path.length){
    if(s.path.length>1 && corridorClear3(s.pos.x,s.pos.z,s.path[1].x,s.path[1].z)) s.path.shift();
    const wp=s.path[0], wx=wp.x-s.pos.x, wz=wp.z-s.pos.z, wl=Math.hypot(wx,wz);
    if(wl<0.6) s.path.shift();
    else { s.pos.x+=wx/wl*s.curSpeed*dt; s.pos.z+=wz/wl*s.curSpeed*dt; s.faceAng=Math.atan2(wx,wz); }
  } else if(s.curSpeed>0.05&&s.state==="chase"){
    const dl=d||1;
    const nx=s.pos.x+dx/dl*s.curSpeed*dt, nz=s.pos.z+dz/dl*s.curSpeed*dt;
    const cc=worldToCell3(nx,nz);
    if(!isBlockedSpider3(cc.cx,cc.cy)){ s.pos.x=nx; s.pos.z=nz; }
    s.faceAng=Math.atan2(dx,dz);
  }
  movedSpeed=Math.hypot(s.pos.x-prevX,s.pos.z-prevZ)/Math.max(dt,1e-5);
  s.headDir.set(Math.sin(s.faceAng),0,Math.cos(s.faceAng));

  /* watchdog: pinned → give up the path (same trap-safety as upstairs) */
  if(s.path.length&&s.curSpeed>0.5&&movedSpeed<0.3){
    s.stuckT+=dt;
    if(s.stuckT>1.2){
      s.stuckT=0; s.path=[]; s.repath=0;
      s.roamTgt=null;                       // a crossing it cannot physically close
      if(s.state==="seek"&&s.lastKnown&&s.pos.distanceTo(s.lastKnown)<CELL*1.5){
        s.faceAng=Math.atan2(s.lastKnown.x-s.pos.x,s.lastKnown.z-s.pos.z);
        s.state="investigate"; s.searchT=rand(1.8,3.2);
      }
    }
  } else s.stuckT=0;

  /* THE WATCHDOG ABOVE ONLY FIRES WHILE A PATH EXISTS, AND THE CAVE'S
     FAILURE IS THE OPPOSITE ONE: the path is EMPTY. Upstairs a pinned
     spider is pinned by `pushFromTables` cancelling movement along a route
     the grid still believes in, so there is always a path to drop. Down
     here `bfsPath3` hands back the doorstep, she stands on it, the route
     runs out and she is left commanded, pathless and motionless — moving
     at 0 m/s with `curSpeed` sitting at the full seek pace, forever.
     The snaps above close every case we know of; this closes the shape.
     Any pursuit that cannot move and has nowhere to go ENDS. */
  if(!s.path.length&&s.curSpeed>0.5&&movedSpeed<0.3&&
     (s.state==="seek"||s.state==="frenzy"||s.state==="hunt"||s.state==="tend")){
    s.idleT=(s.idleT||0)+dt;
    if(s.idleT>1.5){
      s.idleT=0; s.repath=0; s.roamTgt=null;
      if(s.state==="tend") s.tendTgt=null;          // that nest is not reachable from here: take the next one
      else if(s.state==="hunt") s.lastKnown=null;   // stop working a mark she can't close on
      else {
        if(s.lastKnown) s.faceAng=Math.atan2(s.lastKnown.x-s.pos.x,s.lastKnown.z-s.pos.z);
        s.state="investigate"; s.searchT=rand(1.8,3.2);
        startSniffFit(s,1,rand(0.4,0.9));
      }
    }
  } else s.idleT=0;

  /* ---- the catch: the squeezes are the tables of this level ---- */
  const lethal = s.state==="chase"||s.state==="frenzy"||s.state==="hunt"||(s.state==="seek"&&s.seekRun);
  if(!inSqueeze() && d<(lethal?2.1:1.5)) die();

  /* ---- taps ---- */
  s.stepAcc+=movedSpeed*dt;
  const strideLen=movedSpeed>5? 0.95:0.55;
  if(s.stepAcc>=strideLen&&d<46){
    s.stepAcc=0;
    sfxSpiderTap(clamp(1-d/42,0,1)*(movedSpeed>5?0.6:0.34), panTo(s.pos.x,s.pos.z));
  }

  /* ---- animation (floor gait; there is no climbing down here) ---- */
  const sp01=clamp(movedSpeed/10,0,1);
  s.anim += dt*(1.2+movedSpeed*1.35);
  const tNow=performance.now()/1000;
  const cosY=Math.cos(s.faceAng), sinY=Math.sin(s.faceAng);
  for(const leg of u.legs){
    const sw=Math.sin(s.anim+leg.phase);
    const lift=Math.max(0,Math.sin(s.anim+leg.phase+1.3));
    let yaw=-leg.basePhi+sw*0.30*clamp(movedSpeed/3,0,1);
    let pitch=PITCH+lift*0.34*clamp(movedSpeed/3,0,1);
    if(u.scratchAnim>0&&leg.front){
      yaw=-leg.basePhi+Math.sin(tNow*30+leg.phase)*0.18;
      pitch=0.85+Math.sin(tNow*34+leg.phase*2)*0.4;
    }
    let foldTgt=0;
    {
      const phiEff=-yaw;
      const horiz=FEM*Math.cos(pitch)+TIB*Math.cos(-KNEE-pitch);
      const lx=leg.hip.position.x+Math.cos(phiEff)*horiz;
      const lz=leg.hip.position.z+Math.sin(phiEff)*horiz;
      const ct=cellAt3(s.pos.x+lx*cosY+lz*sinY, s.pos.z-lx*sinY+lz*cosY);
      foldTgt = (ct===1||ct===2||ct===7)? 0.55 : 0;
    }
    leg.fold+=(foldTgt-leg.fold)*Math.min(1,dt*7);
    leg.hip.rotation.y=yaw;
    leg.femG.rotation.z=pitch+leg.fold;
  }
  if(u.scratchAnim>0) u.scratchAnim-=dt;
  if(s.state!=="investigate") u.sniffAnim=Math.max(0,u.sniffAnim-dt*2);
  u.head.position.y=-u.sniffAnim*0.55;
  u.head.position.z=u.sniffAnim*0.25;
  u.abd.rotation.x=0;
  const breath=1+Math.sin(tNow*0.9)*0.04*(1-sp01);
  u.abd.scale.set(1.0*breath,0.9,1.35/breath);
  u.abd.position.y=u.BODY_Y+0.12;
  const aggressive=s.state==="chase"||s.state==="frenzy"||s.state==="hunt"||s.state==="rampage";
  u.eyeMat.emissive.setHex(aggressive? 0x8a1410:0x3a0805);
  const bob=Math.abs(Math.sin(s.anim*2))*0.07*sp01;
  s.mesh.position.set(s.pos.x,floorYAt(s.pos.x,s.pos.z)+bob,s.pos.z);
  s.mesh.quaternion.setFromEuler(new THREE.Euler(0,s.faceAng,0));

  /* ---- dread ----
     NO SKITTER BED DOWN HERE. THE END's librarian gets one — bandpassed
     noise under an 11Hz tremolo — and in a library it works. In the cave it
     was the sustained hiss/rattle that never ended: the matriarch's tending
     round is a patrol BETWEEN THE CLUTCHES, so it parks near a brood for
     minutes at a time and the bed just sits there at a constant level while
     you work. Its proximity is carried by the dread vignette, the
     heartbeat, and its own footfalls/scratches/sniffs — all of which are
     either silent or discrete. */
  const prox=clamp(1-d/20,0,1);
  ui.dread.style.opacity = aggressive? (0.09+prox*0.18):prox*0.135;
  if(AU.ctx&&AU.spiderBedGain)
    AU.spiderBedGain.gain.setTargetAtTime(0, AU.ctx.currentTime, 0.4);
  AU.heartTimer-=dt;
  if(prox>0.3&&AU.heartTimer<=0){ sfxHeartbeat(); AU.heartTimer=lerp(1.4,0.5,prox); }
}
/* drop it at its rounds, far from a point (the arrival / a respawn) */
export function resetSpiderCave(farFromX,farFromZ,minDist=30){
  const s=spider;
  const ctr=CAVE.chambers[1]||CAVE.chambers[0];
  let p=ctr? cellToWorld3(ctr.cx,ctr.cy) : {x:0,z:0};
  for(let t=0;t<400;t++){
    const c=randomReachCell3(), q=cellToWorld3(c.cx,c.cy);
    if(Math.hypot(q.x-farFromX,q.z-farFromZ)>minDist){ p=q; break; }
  }
  s.pos.set(p.x,0,p.z);
  s.state="tend"; s.tendTgt=null; s.nestIdx=-1; s.path=[]; s.repath=0; s.curSpeed=0;
  s.pendingT=0; s.speedMult=1; s.stacking=false; s.seekRun=false;
  s.lastKnown=null; s.target=null; s.mildCD=0; s.screechCD=0; s.stepAcc=0;
  s.sniffsLeft=0; s.scratchCD=0; s.sniffCD=0; s.stuckT=0; s.idleT=0;
  s.roomLast=null; s.roomN=0; s.roamTgt=null; s.roamT=0;
  s.glowT=0; s.glowCD=0; s.hearT=0; s.burnSeen=CAVE.lastBurn? CAVE.lastBurn.at : null;
  s.huntT=rand(8,14);
  if(s.mesh){
    s.mesh.position.set(p.x,floorYAt(p.x,p.z),p.z); s.mesh.quaternion.identity();
    const u=s.mesh.userData;
    u.abdTilt=0; u.sniffAnim=0; u.abd.rotation.x=0; u.abd.position.set(0,u.BODY_Y+0.12,-0.95);
  }
}
