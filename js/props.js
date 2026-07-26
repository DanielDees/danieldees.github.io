/* ---------------- props ---------------- */
import { rand } from "./utils.js";
import { W, H, CELL, WALL_H as WALL_H0, cellToWorld, randomOpenCell, isWall, losCells } from "./map.js";
import { makeCanvas, texWall, scaleBoxUV } from "./textures.js";
import { scene, wallMeshes, removeDecalsOnWall, mergeWallMeshes, freezeStaticScene,
         markShared } from "./scene.js";

export let interactables=[];    // {kind, mesh, label, taken}
export let exitDoor=null;
/* level changes rebuild the prop set from scratch */
export function clearInteractables(){ interactables.length=0; exitDoor=null; }
export function addInteractable(it){ interactables.push(it); }

/* ---------------- the three things you are sent to find ----------------
   All of them were untextured primitives: the almond water was three stacked
   cylinders, the fuse a red box with two white pegs, the panel a grey slab
   with a red ball on it. That was survivable while the walls were a flat
   gradient; against papered walls and a real ceiling grid they are the only
   placeholder geometry left on the floor.
   Their canvases are module-level and markShared'd — placeProps runs again on
   every respawn, and a per-build canvas per bottle is pure churn (worse, the
   level teardown disposes anything not marked, so a rebuilt level would come
   back wearing dead textures). */
/* the almond water label: the one piece of branding in the backrooms */
const texAlmond=makeCanvas(384,96,(g,w,h)=>{
  g.fillStyle="#e7dfc4";g.fillRect(0,0,w,h);
  for(let i=0;i<1400;i++){                         // paper stock
    const v=Math.random()<0.5;
    g.fillStyle=`rgba(${v?196:255},${v?186:250},${v?150:230},${0.08+Math.random()*0.14})`;
    g.fillRect(Math.random()*w,Math.random()*h,1+Math.random()*2,1);
  }
  g.fillStyle="#8d7a34";g.fillRect(0,0,w,4);g.fillRect(0,h-4,w,4);     // the rules
  g.fillStyle="rgba(141,122,52,0.55)";g.fillRect(0,9,w,1.5);g.fillRect(0,h-11,w,1.5);
  g.fillStyle="#2e2a1c";g.textAlign="center";g.textBaseline="middle";
  g.font="bold 30px Arial Narrow, Arial";
  g.fillText("ALMOND WATER",w*0.42,h*0.44);
  g.font="9px Courier New";g.fillStyle="#5f5738";
  g.fillText("· STILL · 500ml · BOTTLED AT SOURCE ·",w*0.42,h*0.72);
  g.font="7px Courier New";g.textAlign="left";
  g.fillText("BEST BEFORE",w*0.80,h*0.30);
  g.fillStyle="#3a3524";g.font="bold 9px Courier New";
  g.fillText("--/--/--",w*0.80,h*0.44);
  for(let i=0,x=w*0.80;i<26;i++){                  // the barcode nobody scanned
    const bw=1+Math.random()*2.5;
    g.fillStyle="#26221a";g.fillRect(x,h*0.58,bw,h*0.26);
    x+=bw+1+Math.random()*2;
  }
  for(let i=0;i<9;i++){                            // age, damp, thumbs
    const x=Math.random()*w,y=Math.random()*h,r=8+Math.random()*26;
    const gr=g.createRadialGradient(x,y,0,x,y,r);
    gr.addColorStop(0,`rgba(126,98,44,${0.05+Math.random()*0.12})`);
    gr.addColorStop(1,"rgba(126,98,44,0)");
    g.fillStyle=gr;g.fillRect(x-r,y-r,r*2,r*2);
  }
  for(let i=0;i<4;i++){                            // creases from being handled
    const x=Math.random()*w;
    g.fillStyle="rgba(120,108,72,0.16)";g.fillRect(x,0,1.5,h);
    g.fillStyle="rgba(255,252,238,0.20)";g.fillRect(x+1.5,0,1,h);
  }
});
/* the fuse's printed face — everything else on it is glazed ceramic */
const texFuseFace=makeCanvas(128,160,(g,w,h)=>{
  g.clearRect(0,0,w,h);
  g.fillStyle="#1b1a17";g.textAlign="center";g.textBaseline="middle";
  g.font="bold 27px Arial";           g.fillText("30",w/2,h*0.24);
  g.font="bold 15px Arial";           g.fillText("AMP",w/2,h*0.40);
  g.fillStyle="rgba(27,26,23,0.75)";g.fillRect(w*0.16,h*0.50,w*0.68,1.5);
  g.font="10px Courier New";          g.fillText("250V  AC",w/2,h*0.60);
  g.font="7px Courier New";g.fillStyle="rgba(27,26,23,0.7)";
  g.fillText("CARTRIDGE TYPE D",w/2,h*0.72);
  g.fillText("DO NOT REPLACE",w/2,h*0.82);
  for(let i=0;i<40;i++){                            // the print has worn
    g.fillStyle=`rgba(206,196,176,${0.10+Math.random()*0.30})`;
    g.fillRect(Math.random()*w,Math.random()*h,2+Math.random()*9,1+Math.random()*2);
  }
});
const texCeramic=makeCanvas(128,128,(g,w,h)=>{
  g.fillStyle="#cfc6ae";g.fillRect(0,0,w,h);
  for(let i=0;i<2200;i++){                          // glaze speckle
    const v=Math.random()<0.5;
    g.fillStyle=`rgba(${v?164:238},${v?156:232},${v?134:212},${0.08+Math.random()*0.16})`;
    g.fillRect(Math.random()*w,Math.random()*h,1+Math.random()*2,1+Math.random()*2);
  }
  for(let i=0;i<9;i++){                              // the scorch of a hard life
    const x=Math.random()*w,y=Math.random()*h,r=10+Math.random()*26;
    const gr=g.createRadialGradient(x,y,0,x,y,r);
    gr.addColorStop(0,`rgba(74,60,42,${0.06+Math.random()*0.12})`);
    gr.addColorStop(1,"rgba(74,60,42,0)");
    g.fillStyle=gr;g.fillRect(x-r,y-r,r*2,r*2);
  }
});
/* painted steel, for the panel: orange peel, old scratches, rust creeping up
   from the bottom edge (v=0 is the bottom of the door under flipY) */
const texPanel=makeCanvas(256,256,(g,w,h)=>{
  g.fillStyle="#5b666a";g.fillRect(0,0,w,h);
  for(let i=0;i<3000;i++){                          // orange peel in the paint
    const v=Math.random()<0.5;
    g.fillStyle=`rgba(${v?68:126},${v?76:136},${v?80:140},${0.10+Math.random()*0.16})`;
    g.fillRect(Math.random()*w,Math.random()*h,1+Math.random()*2.4,1+Math.random()*2);
  }
  for(let i=0;i<26;i++){                            // scratches down to bare metal
    g.save();g.translate(Math.random()*w,Math.random()*h);g.rotate(Math.random()*Math.PI);
    g.fillStyle=`rgba(178,186,190,${0.10+Math.random()*0.22})`;
    g.fillRect(0,0,6+Math.random()*40,1);g.restore();
  }
  for(let i=0;i<14;i++){                            // rust blooming off the bottom rail
    const x=Math.random()*w, y=h-Math.pow(Math.random(),1.7)*h*0.45;
    const r=5+Math.random()*20;
    const gr=g.createRadialGradient(x,y,0,x,y,r);
    gr.addColorStop(0,`rgba(122,62,26,${0.14+Math.random()*0.26})`);
    gr.addColorStop(1,"rgba(122,62,26,0)");
    g.fillStyle=gr;g.fillRect(x-r,y-r,r*2,r*2);
  }
});
/* the two bits of paper on the door: the maker's plate, and the circuit
   directory that was never filled in past the first two lines */
const texPlate=makeCanvas(256,72,(g,w,h)=>{
  g.fillStyle="#8d949a";g.fillRect(0,0,w,h);
  g.fillStyle="rgba(226,232,236,0.30)";g.fillRect(0,0,w,2);
  g.fillStyle="rgba(28,32,34,0.35)";g.fillRect(0,h-2,w,2);
  g.fillStyle="#1a1e20";g.textAlign="center";g.textBaseline="middle";
  g.font="bold 20px Arial Narrow, Arial";g.fillText("LOAD CENTRE",w/2,h*0.32);
  g.font="10px Courier New";g.fillText("225A  120/240V  1PH  3W",w/2,h*0.62);
  g.font="8px Courier New";g.fillStyle="rgba(26,30,32,0.7)";
  g.fillText("CAT. No. ——————",w/2,h*0.84);
  for(let i=0;i<26;i++){                            // etched, then scoured
    g.fillStyle=`rgba(210,218,222,${0.06+Math.random()*0.16})`;
    g.fillRect(Math.random()*w,Math.random()*h,4+Math.random()*24,1);
  }
});
const texCard=makeCanvas(160,180,(g,w,h)=>{
  g.fillStyle="#c9c4ac";g.fillRect(0,0,w,h);
  for(let i=0;i<900;i++){
    g.fillStyle=`rgba(${150+Math.random()*90|0},${146+Math.random()*86|0},${120+Math.random()*80|0},0.10)`;
    g.fillRect(Math.random()*w,Math.random()*h,1+Math.random()*2,1);
  }
  g.fillStyle="#7a2a22";g.fillRect(0,0,w,13);
  g.fillStyle="#efe9d6";g.font="bold 9px Courier New";
  g.textAlign="center";g.textBaseline="middle";g.fillText("CIRCUIT DIRECTORY",w/2,7);
  g.strokeStyle="rgba(90,80,50,0.45)";g.lineWidth=1;
  for(let i=0;i<11;i++){ const y=24+i*14;
    g.beginPath();g.moveTo(6,y);g.lineTo(w-6,y);g.stroke(); }
  g.beginPath();g.moveTo(30,20);g.lineTo(30,h-8);g.stroke();
  g.fillStyle="#3a3524";g.font="7px Courier New";g.textAlign="left";
  g.fillText("1",12,31);g.fillText("LEVEL 0  N",36,31);
  g.fillText("2",12,45);g.fillText("LEVEL 0  S",36,45);
  g.fillStyle="rgba(58,53,36,0.5)";g.font="7px Courier New";
  g.fillText("3",12,59);
  for(let i=0;i<4;i++){                              // a hand that gave up
    let x=36; const y=59+i*14;
    while(x<w-14){ const ww=3+Math.random()*7;
      g.fillStyle="rgba(58,53,36,0.30)";g.fillRect(x,y-2,ww,1); x+=ww+3+Math.random()*5; }
  }
  for(let i=0;i<6;i++){                              // damp, and thirty years
    const x=Math.random()*w,y=Math.random()*h,r=10+Math.random()*30;
    const gr=g.createRadialGradient(x,y,0,x,y,r);
    gr.addColorStop(0,`rgba(118,92,42,${0.06+Math.random()*0.13})`);
    gr.addColorStop(1,"rgba(118,92,42,0)");
    g.fillStyle=gr;g.fillRect(x-r,y-r,r*2,r*2);
  }
});
markShared(texAlmond,texFuseFace,texCeramic,texPanel,texPlate,texCard);
const glassMat=new THREE.MeshPhongMaterial({color:0xd6e4ea, transparent:true, opacity:0.40,
  specular:0xffffff, shininess:96, side:THREE.DoubleSide});
const almondMat=new THREE.MeshPhongMaterial({color:0xeadfbe, emissive:0x1a1610,
  specular:0x9a9280, shininess:34});
const capMat=new THREE.MeshPhongMaterial({color:0x2b2b2d, specular:0x4a4a4e, shininess:44});
const labelMat=new THREE.MeshPhongMaterial({map:texAlmond, specular:0x1a1814, shininess:8,
  side:THREE.DoubleSide});
const brassMat=new THREE.MeshPhongMaterial({color:0xb59a52, specular:0xe4d49a, shininess:82});
const ceramicMat=new THREE.MeshPhongMaterial({map:texCeramic, specular:0x3a382e, shininess:26});
const fuseFaceMat=new THREE.MeshPhongMaterial({map:texFuseFace, transparent:true,
  specular:0x000000, shininess:1});
markShared(glassMat,almondMat,capMat,labelMat,brassMat,ceramicMat,fuseFaceMat);
/* ---- almond water ----
   A bottle is a PROFILE — heel, straight side, shoulder, neck, lip — and
   turning that profile on a lathe is the whole difference between a bottle
   and a tin can, which is what three stacked cylinders read as. It closes at
   radius 0 on the base (an open ring there shows straight through a
   backface-culled shell) and stays open at the lip, where the cap covers it.
   The liquid is its own inner lathe filled to the shoulder: a transparent
   bottle you cannot see a level in is just a solid. */
function makeBottle(){
  const g=new THREE.Group();
  const V=(x,y)=>new THREE.Vector2(x,y);
  const shell=[V(0,0),V(0.055,0),V(0.078,0.011),V(0.088,0.032),V(0.09,0.055),
               V(0.09,0.235),V(0.088,0.262),V(0.072,0.30),V(0.05,0.331),
               V(0.041,0.352),V(0.041,0.393),V(0.047,0.402),V(0.047,0.414)];
  const body=new THREE.Mesh(new THREE.LatheGeometry(shell,22),glassMat);
  g.add(body);
  const fill=[V(0,0.008),V(0.05,0.008),V(0.072,0.018),V(0.082,0.036),V(0.084,0.056),
              V(0.084,0.239),V(0,0.243)];          // filled to just under the shoulder
  g.add(new THREE.Mesh(new THREE.LatheGeometry(fill,22),almondMat));
  /* the cap: a ribbed screw closure over a tamper ring */
  const cap=new THREE.Mesh(new THREE.CylinderGeometry(0.052,0.052,0.062,18),capMat);
  cap.position.y=0.408; g.add(cap);
  const ring=new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.05,0.011,18),capMat);
  ring.position.y=0.370; g.add(ring);
  const label=new THREE.Mesh(
    new THREE.CylinderGeometry(0.0915,0.0915,0.145,26,1,true),labelMat);
  label.position.y=0.145; g.add(label);
  g.scale.setScalar(1.2);
  g.userData.animated=true;                 // idle-spins in updateProps — keep its matrix live
  return g;
}
/* ---- the fuse ----
   A ceramic cartridge with flat brass BLADES, not a red box with two square
   pegs. Its origin stays at the base and its overall height stays ~0.3: the
   breaker cutscene flies this exact group from (0,−0.25,0.55) to (0,−0.055,
   0.08) and expects it to land inside the slot. */
function makeFuse(){
  const g=new THREE.Group();
  const b=new THREE.Mesh(new THREE.BoxGeometry(0.22,0.3,0.115),ceramicMat);
  b.position.y=0.15; g.add(b);
  for(const sy of[0.038,0.262]){                   // the ferrule bands
    const f=new THREE.Mesh(new THREE.BoxGeometry(0.228,0.03,0.122),brassMat);
    f.position.y=sy; g.add(f);
  }
  /* the printed face, on both sides the way a real one is stamped */
  for(const sz of[-1,1]){
    const face=new THREE.Mesh(new THREE.PlaneGeometry(0.15,0.19),fuseFaceMat);
    face.position.set(0,0.155,sz*0.0585); face.rotation.y=sz>0?0:Math.PI;
    g.add(face);
  }
  /* blades: FLAT, and that is the whole tell that this is a contact and not a
     peg. They stand proud so the breaker's clips have something to grip. */
  for(const sx of[-0.062,0.062]){
    const blade=new THREE.Mesh(new THREE.BoxGeometry(0.052,0.115,0.014),brassMat);
    blade.position.set(sx,0.345,0); g.add(blade);
  }
  g.scale.setScalar(1.2);
  g.userData.animated=true;                 // idle-spins as a pickup / driven inside the breaker
  return g;
}
function makeBreaker(p,facing){
  /* A load centre, not a grey slab with a red ball on it: a recessed steel
     cabinet behind a folded flange, a door on real knuckle hinges with a
     latch, a maker's plate and the directory card nobody filled in, and a row
     of dead breakers inside flanking the one slot that matters.
     The cutscene's contract is unchanged and load-bearing: `doorPivot` is a
     Group at (−0.45,0,0.2) swung about y, `lamp` is a single mesh whose own
     material gets recoloured, `lever` is a single mesh moved in y from −0.1 to
     +0.1, and `fuse` is a Group flown into the slot with every material in it
     faded up from 0. */
  const g=new THREE.Group();
  const steel=new THREE.MeshPhongMaterial({map:texPanel, specular:0x2c3336, shininess:26});
  const steelDark=new THREE.MeshPhongMaterial({color:0x333c40, specular:0x1c2124, shininess:18});
  const bright=new THREE.MeshPhongMaterial({color:0x9aa2a8, specular:0x5c6468, shininess:52});
  const add=(geo,mat,x,y,z)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);g.add(m);return m;};
  /* the cabinet, and the flange folded out around its mouth */
  add(new THREE.BoxGeometry(0.9,1.3,0.1),steel,0,0,0);
  for(const[sw,sh,sx,sy]of[[0.98,0.05,0,0.645],[0.98,0.05,0,-0.645],
                           [0.05,1.3,0.465,0],[0.05,1.3,-0.465,0]])
    add(new THREE.BoxGeometry(sw,sh,0.14),steel,sx,sy,0.12);
  /* interior — only visible while the door hangs open */
  add(new THREE.BoxGeometry(0.78,1.18,0.02),steelDark,0,0,0.05);
  add(new THREE.BoxGeometry(0.09,1.0,0.03),bright,0,0.02,0.065);      // the bus bar
  /* the dead breakers either side of the slot: this panel fed a whole floor */
  for(const sx of[-0.235,0.235])for(let i=0;i<4;i++){
    add(new THREE.BoxGeometry(0.2,0.1,0.05),steelDark,sx,0.44-i*0.13,0.08);
    add(new THREE.BoxGeometry(0.05,0.05,0.04),new THREE.MeshPhongMaterial(
      {color:i%3?0x1d2124:0x6b2a22, specular:0x3a4044, shininess:30}),
      sx+(i%2?0.05:-0.05),0.44-i*0.13,0.105);
  }
  add(new THREE.BoxGeometry(0.3,0.44,0.06),
    new THREE.MeshPhongMaterial({color:0x14171a, specular:0x25292c, shininess:20}),0,0.08,0.08);
  for(const sy of[-0.13,0.13])             // contact clips waiting for the fuse
    add(new THREE.BoxGeometry(0.16,0.04,0.05),bright,0,0.08+sy,0.11);
  /* the cutscene fuse: hidden until the animation conjures it in */
  const fuse=makeFuse(); fuse.scale.setScalar(0.9);
  fuse.visible=false;
  fuse.traverse(o=>{ if(o.isMesh){ o.material=o.material.clone();
    o.material.transparent=true; o.material.opacity=0; }});
  fuse.position.set(0,-0.25,0.55);
  g.add(fuse); g.userData.fuse=fuse;
  /* hinged door (left edge) carrying the status lamp & lever; pivot sits
     proud of the flange so the closed panel clears the seated fuse */
  const pivot=new THREE.Group(); pivot.position.set(-0.45,0,0.2); g.add(pivot);
  g.userData.doorPivot=pivot;
  const door=new THREE.Group(); door.position.x=0.45; pivot.add(door);
  const dAdd=(geo,mat,x,y,z)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);door.add(m);return m;};
  dAdd(new THREE.BoxGeometry(0.88,1.28,0.04),steel,0,0,0);
  for(const sy of[0.5,-0.5])               // knuckle hinges down the hung edge
    dAdd(new THREE.CylinderGeometry(0.024,0.024,0.14,10),bright,-0.44,sy,-0.02);
  /* the maker's plate and the directory card, both PRINTED — a bare bright
     bar on a door catching a troffer is a blown-out white rectangle, which is
     all either of them was. The plate keeps its map on the front face only
     (the box's other five wear the same canvas, but nothing ever sees them). */
  const plateMat=new THREE.MeshPhongMaterial({map:texPlate, specular:0x2e3336, shininess:24});
  const cardMat=new THREE.MeshPhongMaterial({map:texCard, specular:0x1c1c18, shininess:5});
  dAdd(new THREE.BoxGeometry(0.36,0.1,0.006),plateMat,-0.20,0.54,0.023);
  dAdd(new THREE.BoxGeometry(0.26,0.30,0.006),cardMat,-0.26,0.02,0.023);
  dAdd(new THREE.BoxGeometry(0.29,0.02,0.014),bright,-0.26,-0.14,0.026);  // its holder lip
  /* the latch: an escutcheon with a quarter-turn handle standing off it */
  dAdd(new THREE.BoxGeometry(0.11,0.16,0.016),bright,0.36,-0.36,0.026);
  dAdd(new THREE.BoxGeometry(0.03,0.12,0.05),steelDark,0.36,-0.36,0.052);
  /* the status lamp: a bezel with the lens seated in it. `lamp` stays the
     LENS — the cutscene sets its material colour on power-up. */
  dAdd(new THREE.CylinderGeometry(0.055,0.055,0.03,14),bright,0.28,0.45,0.03)
    .rotation.x=Math.PI/2;
  const lamp=new THREE.Mesh(new THREE.SphereGeometry(0.042,10,8),
    new THREE.MeshBasicMaterial({color:0xff3020}));
  lamp.position.set(0.28,0.45,0.05); lamp.scale.z=0.7; door.add(lamp);
  g.userData.lamp=lamp;
  /* the main throw: a slotted plate with the handle riding it, kept clear of
     the directory card on the other side of the door. `lever` is the HANDLE
     and nothing else — the cutscene slides it 0.2m up the plate. */
  dAdd(new THREE.BoxGeometry(0.14,0.5,0.014),steelDark,0.16,-0.1,0.024);
  const lever=new THREE.Mesh(new THREE.BoxGeometry(0.09,0.17,0.07),
    new THREE.MeshPhongMaterial({color:0x1b1f22, specular:0x40464a, shininess:36}));
  lever.position.set(0.16,-0.1,0.06); door.add(lever); g.userData.lever=lever;
  g.position.copy(p); g.rotation.y=facing;
  g.userData.animated=true;                 // the cutscene swings its door / conjures the fuse
  return g;
}
export const ELEV={OPEN_W:2.0, OPEN_H:2.6, DEPTH:2.6};   // cab dimensions, shared with the cutscene
export function makeElevator(p,facing,opts={}){
  /* the exit elevator, carved INTO its wall cell: placeProps removes that
     cell's wall box and this rebuilds it as flanks + header around a
     recessed cab. Local frame: origin at the centre of the doorway face at
     floor level, +z pointing out into the room. The grid cell stays solid,
     so collision still keeps the player out — only the cutscene camera
     ever goes inside. THE END reuses this builder for the CRASHED arrival
     cab, passing its own (taller) wall height and wall material. */
  const {OPEN_W,OPEN_H,DEPTH}=ELEV;
  const WALL_H=opts.wallH||WALL_H0;
  const g=new THREE.Group();
  const wallM=opts.wallMat||new THREE.MeshPhongMaterial({map:texWall, specular:0x0d0c07, shininess:6});
  const metal=new THREE.MeshPhongMaterial({color:0x9aa0a4, specular:0x222426, shininess:22});
  const darkMetal=new THREE.MeshPhongMaterial({color:0x53585c, specular:0x303336, shininess:40});
  const add=(geo,mat,x,y,z)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);g.add(m);return m;};
  /* rebuilt wall around the opening. With opts.uvTile the odd-sized flank/
     header boxes map their wall texture at a fixed world scale, so they sit
     seamlessly beside the regular full-size cells (THE END); level 0 takes
     raw box UVs, like every other wall on that floor. */
  const wallGeo=(w,h,d)=>{
    const geo=new THREE.BoxGeometry(w,h,d);
    if(opts.uvTile) scaleBoxUV(geo,w,h,d,opts.uvTile);
    return geo;
  };
  const flankW=(CELL-OPEN_W)/2;
  add(wallGeo(flankW,WALL_H,CELL),wallM,-(OPEN_W/2+flankW/2),WALL_H/2,-CELL/2);
  add(wallGeo(flankW,WALL_H,CELL),wallM, (OPEN_W/2+flankW/2),WALL_H/2,-CELL/2);
  add(wallGeo(OPEN_W,WALL_H-OPEN_H,CELL),wallM,0,(WALL_H+OPEN_H)/2,-CELL/2);
  add(wallGeo(OPEN_W,OPEN_H,CELL-DEPTH),wallM,0,OPEN_H/2,-(DEPTH+(CELL-DEPTH)/2));
  /* ---- cab shell: brushed panelled walls, speckled vinyl floor ---- */
  const cabWallTex=makeCanvas(256,256,(gx,w,h)=>{
    gx.fillStyle="#878d91";gx.fillRect(0,0,w,h);
    for(let i=0;i<1100;i++){                                 // brushed vertical grain
      const v=Math.random()<0.5;
      gx.fillStyle=`rgba(${v?116:168},${v?122:174},${v?126:178},0.12)`;
      gx.fillRect(Math.random()*w,Math.random()*h,1,6+Math.random()*34);
    }
    for(let px=0;px<=w;px+=w/3){                             // panel seams
      gx.fillStyle="rgba(36,39,41,0.8)";gx.fillRect(px-1,0,2,h);
      gx.fillStyle="rgba(210,214,216,0.25)";gx.fillRect(px+1,0,1,h);
    }
    for(let i=0;i<26;i++){                                   // scuffs, worst low down
      const y=h-Math.pow(Math.random(),1.6)*h*0.7;
      gx.fillStyle=`rgba(40,42,44,${0.06+Math.random()*0.12})`;
      gx.save();gx.translate(Math.random()*w,y);gx.rotate((Math.random()-0.5)*0.6);
      gx.fillRect(0,0,8+Math.random()*36,1+Math.random()*2.5);gx.restore();
    }
    gx.fillStyle="rgba(26,28,30,0.92)";gx.fillRect(0,h-22,w,22);  // kick plate
    gx.fillStyle="rgba(150,154,158,0.5)";gx.fillRect(0,h-23,w,1);
  });
  const cabWallM=new THREE.MeshPhongMaterial({map:cabWallTex, specular:0x191b1d, shininess:18});
  const cabFloorTex=makeCanvas(128,128,(gx,w,h)=>{
    gx.fillStyle="#33353a";gx.fillRect(0,0,w,h);
    for(let i=0;i<2600;i++){                                 // vinyl speckle
      const v=Math.random();
      gx.fillStyle=`rgba(${v<0.5?20:90},${v<0.5?22:94},${v<0.5?26:100},0.5)`;
      gx.fillRect(Math.random()*w,Math.random()*h,1.5,1.5);
    }
    const wear=gx.createRadialGradient(w/2,h*0.4,4,w/2,h*0.4,w*0.42);  // foot-worn middle
    wear.addColorStop(0,"rgba(120,122,126,0.13)");wear.addColorStop(1,"rgba(120,122,126,0)");
    gx.fillStyle=wear;gx.fillRect(0,0,w,h);
  });
  const cabFloorM=new THREE.MeshPhongMaterial({map:cabFloorTex, specular:0x101113, shininess:12});
  add(new THREE.BoxGeometry(OPEN_W,0.05,DEPTH),cabFloorM,0,0.025,-DEPTH/2);
  add(new THREE.BoxGeometry(OPEN_W,0.06,DEPTH),new THREE.MeshPhongMaterial({color:0x9fa39f,
    specular:0x222426, shininess:20}),0,OPEN_H-0.03,-DEPTH/2);
  add(new THREE.BoxGeometry(OPEN_W,OPEN_H,0.06),cabWallM,0,OPEN_H/2,-DEPTH+0.03);
  add(new THREE.BoxGeometry(0.06,OPEN_H,DEPTH),cabWallM,-OPEN_W/2+0.03,OPEN_H/2,-DEPTH/2);
  add(new THREE.BoxGeometry(0.06,OPEN_H,DEPTH),cabWallM, OPEN_W/2-0.03,OPEN_H/2,-DEPTH/2);
  /* corner posts & door-side reveal posts break up the box read */
  for(const[px,pz]of[[-1,-DEPTH+0.05],[1,-DEPTH+0.05],[-1,-0.18],[1,-0.18]])
    add(new THREE.BoxGeometry(0.06,OPEN_H,0.06),darkMetal,px*(OPEN_W/2-0.05),OPEN_H/2,pz);
  /* threshold sill under the doors */
  add(new THREE.BoxGeometry(OPEN_W,0.025,0.14),darkMetal,0,0.038,-0.1);
  /* ---- ceiling light: diffuser panel in a dark trim frame ---- */
  const cabLightMat=new THREE.MeshBasicMaterial({color:0x2a2317});
  const backing=new THREE.Mesh(new THREE.PlaneGeometry(1.3,0.9),
    new THREE.MeshPhongMaterial({color:0x2c2e30, specular:0x000000, shininess:4}));
  backing.rotation.x=Math.PI/2; backing.position.set(0,OPEN_H-0.062,-DEPTH/2);
  g.add(backing);
  const lightPanel=new THREE.Mesh(new THREE.PlaneGeometry(1.1,0.7),cabLightMat);
  lightPanel.rotation.x=Math.PI/2; lightPanel.position.set(0,OPEN_H-0.075,-DEPTH/2);
  g.add(lightPanel); g.userData.cabLightMat=cabLightMat;
  const cabLight=new THREE.PointLight(0xffeecc,0,6,1.8);
  cabLight.position.set(0,OPEN_H-0.35,-DEPTH/2); g.add(cabLight); g.userData.cabLight=cabLight;
  /* red emergency lamp over the back wall */
  const emergMat=new THREE.MeshBasicMaterial({color:0x1c0404});
  const emerg=new THREE.Mesh(new THREE.SphereGeometry(0.045,8,8),emergMat);
  emerg.position.set(0,OPEN_H-0.22,-DEPTH+0.1); g.add(emerg);
  g.userData.emergMat=emergMat; g.userData.emerg=emerg;
  /* handrails on the back and both sides */
  const railM=darkMetal;
  const railB=new THREE.Mesh(new THREE.CylinderGeometry(0.025,0.025,OPEN_W-0.45,8),railM);
  railB.rotation.z=Math.PI/2; railB.position.set(0,0.95,-DEPTH+0.12); g.add(railB);
  for(const sx of[-1,1]){
    const r=new THREE.Mesh(new THREE.CylinderGeometry(0.025,0.025,DEPTH-0.6,8),railM);
    r.rotation.x=Math.PI/2; r.position.set(sx*(OPEN_W/2-0.085),0.95,-DEPTH/2-0.08); g.add(r);
  }
  /* interior button column near the doors (the +x wall — screen-left when
     facing out). One floor button lights at a time; the cutscene drives them. */
  add(new THREE.BoxGeometry(0.05,0.62,0.22),metal,OPEN_W/2-0.06,1.32,-0.55);
  g.userData.panelBtns=[];
  for(let i=0;i<4;i++){
    const bm=new THREE.MeshBasicMaterial({color:0x2a2014});
    const b=new THREE.Mesh(new THREE.CylinderGeometry(0.022,0.022,0.02,8),bm);
    b.rotation.z=Math.PI/2; b.position.set(OPEN_W/2-0.095,1.52-i*0.13,-0.55); g.add(b);
    g.userData.panelBtns.push(bm);
  }
  /* floor indicator high on the same wall, above the button column —
     the cutscene redraws it */
  const fdC=document.createElement("canvas"); fdC.width=96; fdC.height=44;
  const fdT=new THREE.CanvasTexture(fdC);
  const drawFloor=(txt,color="#ffb347")=>{
    const gx=fdC.getContext("2d");
    gx.fillStyle="#0a0a0c";gx.fillRect(0,0,96,44);
    gx.fillStyle=color;gx.font="bold 28px Courier New";gx.textAlign="center";
    gx.fillText(txt,48,32);
    fdT.needsUpdate=true;
  };
  drawFloor("");
  const fd=new THREE.Mesh(new THREE.PlaneGeometry(0.4,0.18),
    new THREE.MeshBasicMaterial({map:fdT}));
  fd.position.set(OPEN_W/2-0.065,2.2,-0.55); fd.rotation.y=-Math.PI/2; g.add(fd);
  g.userData.drawFloor=drawFloor; g.userData.dispLocal=fd.position.clone();
  /* sliding doors: brushed panels with darkened edges so the closed pair
     reads as two leaves with a centre seam, not one blank slab */
  const doorTex=makeCanvas(64,128,(gx,w,h)=>{
    gx.fillStyle="#9aa0a4";gx.fillRect(0,0,w,h);
    for(let i=0;i<260;i++){                                  // vertical brush grain
      const x=Math.random()*w, l=8+Math.random()*40;
      gx.fillStyle=`rgba(${Math.random()<0.5?120:170},${Math.random()<0.5?126:176},${Math.random()<0.5?130:180},0.18)`;
      gx.fillRect(x,Math.random()*h,1,l);
    }
    gx.fillStyle="rgba(28,30,32,0.85)";                      // stile edges = the seam
    gx.fillRect(0,0,3,h);gx.fillRect(w-3,0,3,h);
    gx.fillStyle="rgba(40,42,44,0.5)";
    gx.fillRect(0,h-6,w,6);gx.fillRect(0,0,w,3);
  });
  const doorMat=new THREE.MeshPhongMaterial({map:doorTex, specular:0x222426, shininess:22});
  const doorGeo=new THREE.BoxGeometry(OPEN_W/2+0.03,OPEN_H-0.06,0.05);
  const doorL=new THREE.Mesh(doorGeo,doorMat); doorL.position.set(-(OPEN_W/4+0.015),OPEN_H/2,-0.06);
  const doorR=new THREE.Mesh(doorGeo,doorMat); doorR.position.set( (OPEN_W/4+0.015),OPEN_H/2,-0.06);
  g.add(doorL); g.add(doorR); g.userData.doorL=doorL; g.userData.doorR=doorR;
  /* portal trim */
  add(new THREE.BoxGeometry(0.12,OPEN_H+0.14,0.1),darkMetal,-(OPEN_W/2+0.06),OPEN_H/2,0.01);
  add(new THREE.BoxGeometry(0.12,OPEN_H+0.14,0.1),darkMetal, (OPEN_W/2+0.06),OPEN_H/2,0.01);
  add(new THREE.BoxGeometry(OPEN_W+0.36,0.14,0.1),darkMetal,0,OPEN_H+0.07,0.01);
  /* EXIT sign above the lintel — dark until the power is restored */
  const signC=makeCanvas(128,48,(gx,w,h)=>{gx.fillStyle="#101010";gx.fillRect(0,0,w,h);
    gx.fillStyle="#39d24a";gx.font="bold 30px Courier New";gx.textAlign="center";gx.fillText("EXIT",w/2,34);});
  const sign=new THREE.Mesh(new THREE.PlaneGeometry(0.8,0.3),
    new THREE.MeshBasicMaterial({map:signC}));
  sign.position.set(0,OPEN_H+0.32,0.06); g.add(sign); g.userData.sign=sign;
  sign.material.color.set(0x333333);
  /* call button beside the doors */
  add(new THREE.BoxGeometry(0.16,0.24,0.04),metal,OPEN_W/2+0.21,1.15,0.02);
  const btnMat=new THREE.MeshBasicMaterial({color:0x3a1a08});
  const btn=new THREE.Mesh(new THREE.CylinderGeometry(0.035,0.035,0.03,10),btnMat);
  btn.rotation.x=Math.PI/2; btn.position.set(OPEN_W/2+0.21,1.15,0.05); g.add(btn);
  g.userData.btnMat=btnMat; g.userData.btnLocal=btn.position.clone();
  g.position.copy(p); g.rotation.y=facing;
  g.userData.animated=true;                 // doors slide, buttons/sign light during the ride cutscene
  return g;
}
export function placeProps(){
  const used=new Set(), spawn={cx:W>>1,cy:H>>1};
  const spawnW=cellToWorld(spawn.cx,spawn.cy);
  const DIRS=[[1,0,-Math.PI/2],[-1,0,Math.PI/2],[0,1,Math.PI],[0,-1,0]];   // [dx,dy,facing]
  /* bounded retry: on a pathological map, accept a reused cell over a hang */
  const pick=(minD)=>{
    let c=randomOpenCell(minD);
    for(let t=0;t<300&&used.has(c.cy*W+c.cx);t++) c=randomOpenCell(minD);
    used.add(c.cy*W+c.cx);
    return c;
  };
  /* almond water must NOT be visible from the fall-in point — a bottle sitting
     down a straight sightline from spawn is a free pickup that trivialises the
     opening. Reject any cell with line of sight to spawn; fall back to a plain
     pick if the map is too open to find a hidden spot. */
  const pickHidden=(minD)=>{
    for(let t=0;t<300;t++){
      const c=randomOpenCell(minD);
      if(used.has(c.cy*W+c.cx)) continue;
      const p=cellToWorld(c.cx,c.cy);
      if(losCells(spawnW.x,spawnW.z,p.x,p.z)) continue;
      used.add(c.cy*W+c.cx); return c;
    }
    return pick(minD);
  };
  for(let i=0;i<3;i++){
    const c=pickHidden(6+i*2), p=cellToWorld(c.cx,c.cy), b=makeBottle();
    b.position.set(p.x+rand(-1,1),0,p.z+rand(-1,1));
    scene.add(b);
    interactables.push({kind:"bottle",mesh:b,label:"TAKE ALMOND WATER",taken:false});
  }
  {
    const c=pick(10), p=cellToWorld(c.cx,c.cy), f=makeFuse();
    f.position.set(p.x+rand(-1,1),0,p.z+rand(-1,1));
    scene.add(f);
    interactables.push({kind:"fuse",mesh:f,label:"TAKE FUSE",taken:false});
  }
  {
    let c,dir;
    outer: for(let t=0;t<600;t++){
      c=randomOpenCell(9);
      for(const[dx,dy,fy]of DIRS){
        if(isWall(c.cx+dx,c.cy+dy)&&!used.has(c.cy*W+c.cx)){dir={dx,dy,fy};used.add(c.cy*W+c.cx);break outer;}
      }
    }
    /* failsafe: sweep the grid instead of crashing on `c.cx` if 600 random
       tries never landed on an unused open cell beside a wall */
    if(!dir) sweep: for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){
      if(isWall(x,y)||used.has(y*W+x)) continue;
      for(const[dx,dy,fy]of DIRS)
        if(isWall(x+dx,y+dy)){c={cx:x,cy:y};dir={dx,dy,fy};used.add(y*W+x);break sweep;}
    }
    const p=cellToWorld(c.cx,c.cy);
    const bp=new THREE.Vector3(p.x+dir.dx*(CELL/2-0.15),1.4,p.z+dir.dy*(CELL/2-0.15));
    const br=makeBreaker(bp,dir.fy);
    scene.add(br);
    interactables.push({kind:"breaker",mesh:br,label:"INSERT FUSE & RESTORE POWER",taken:false});
  }
  {
    let best=null,bestD=-1;
    for(let t=0;t<900;t++){
      const c=randomOpenCell(0);
      const d=Math.hypot(c.cx-spawn.cx,c.cy-spawn.cy);
      if(d<bestD) continue;
      for(const[dx,dy,fy]of DIRS){
        if(isWall(c.cx+dx,c.cy+dy)){best={c,dx,dy,fy};bestD=d;break;}
      }
    }
    /* failsafe: same grid sweep as the breaker — any wall-adjacent open cell
       beats a crash on `best.c` */
    if(!best) sweep: for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){
      if(isWall(x,y)) continue;
      for(const[dx,dy,fy]of DIRS)
        if(isWall(x+dx,y+dy)){best={c:{cx:x,cy:y},dx,dy,fy};break sweep;}
    }
    const p=cellToWorld(best.c.cx,best.c.cy);
    /* the elevator replaces the wall box behind the doorway with its own
       carved-out geometry (the grid cell itself stays solid). Any mold or
       drip decals on that wall would float over the opening — take them too. */
    const wallKey=(best.c.cy+best.dy)*W+(best.c.cx+best.dx);
    const wm=wallMeshes.get(wallKey);
    if(wm) scene.remove(wm);
    removeDecalsOnWall(wallKey);
    const dp=new THREE.Vector3(p.x+best.dx*(CELL/2),0,p.z+best.dy*(CELL/2));
    exitDoor=makeElevator(dp,best.fy);
    scene.add(exitDoor);
    interactables.push({kind:"exit",mesh:exitDoor,label:"CALL ELEVATOR",taken:false});
  }
  /* the elevator carve is done — collapse the surviving wall boxes into one
     mesh, then freeze every static object so it stops paying per-frame matrix
     cost (entities are added after this returns) */
  mergeWallMeshes();
  freezeStaticScene();
}

/* ---------------- prop idle ---------------- */
export function updateProps(t){
  for(const it of interactables){
    if(it.taken) continue;
    if(it.kind==="bottle"||it.kind==="fuse"){
      it.mesh.rotation.y=t*0.8;
      it.mesh.position.y=0.12+Math.sin(t*2+it.mesh.position.x)*0.05;
    } else if(it.kind==="disc"){
      /* a slow turn and a whisper of a hover — enough to read as takeable
         on a murky shelf without breaking the still-library mood */
      it.mesh.rotation.y=t*0.55+it.baseY;
      it.mesh.position.y=it.baseY+Math.sin(t*1.6+it.mesh.position.x*2)*0.018;
    }
  }
}
