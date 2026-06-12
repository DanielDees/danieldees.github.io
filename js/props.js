/* ---------------- props ---------------- */
import { rand } from "./utils.js";
import { W, H, CELL, WALL_H, cellToWorld, randomOpenCell, isWall } from "./map.js";
import { makeCanvas, texWall } from "./textures.js";
import { scene, wallMeshes, removeDecalsOnWall } from "./scene.js";

export let interactables=[];    // {kind, mesh, label, taken}
export let exitDoor=null;

function makeBottle(){
  const g=new THREE.Group();
  const body=new THREE.Mesh(new THREE.CylinderGeometry(0.09,0.09,0.34,10),
    new THREE.MeshLambertMaterial({color:0xd8e6ee,emissive:0x223340,transparent:true,opacity:0.92}));
  body.position.y=0.17; g.add(body);
  const cap=new THREE.Mesh(new THREE.CylinderGeometry(0.045,0.045,0.07,8),
    new THREE.MeshLambertMaterial({color:0x303030}));
  cap.position.y=0.39; g.add(cap);
  const label=new THREE.Mesh(new THREE.CylinderGeometry(0.092,0.092,0.13,10),
    new THREE.MeshLambertMaterial({color:0xc8b25a}));
  label.position.y=0.17; g.add(label);
  g.scale.setScalar(1.2);
  return g;
}
function makeFuse(){
  const g=new THREE.Group();
  const b=new THREE.Mesh(new THREE.BoxGeometry(0.22,0.3,0.12),
    new THREE.MeshLambertMaterial({color:0x8d2f23,emissive:0x2a0c08}));
  b.position.y=0.15; g.add(b);
  const prong=new THREE.Mesh(new THREE.BoxGeometry(0.05,0.12,0.05),new THREE.MeshLambertMaterial({color:0xcccccc}));
  prong.position.set(-0.06,0.34,0);g.add(prong);
  const prong2=prong.clone();prong2.position.x=0.06;g.add(prong2);
  g.scale.setScalar(1.2);
  return g;
}
function makeBreaker(p,facing){
  /* a hinged panel box: the cutscene swings the door open, conjures the
     fuse into the slot inside, and claps it shut again */
  const g=new THREE.Group();
  const steel=new THREE.MeshLambertMaterial({color:0x4f5a5e});
  /* back tray + skirt ring: an open cabinet the door closes over */
  const box=new THREE.Mesh(new THREE.BoxGeometry(0.9,1.3,0.1),steel);
  g.add(box);
  for(const[sw,sh,sx,sy]of[[0.9,0.03,0,0.635],[0.9,0.03,0,-0.635],
                           [0.03,1.3,0.435,0],[0.03,1.3,-0.435,0]]){
    const skirt=new THREE.Mesh(new THREE.BoxGeometry(sw,sh,0.14),steel);
    skirt.position.set(sx,sy,0.12); g.add(skirt);
  }
  /* interior — only visible while the door hangs open */
  const back=new THREE.Mesh(new THREE.BoxGeometry(0.78,1.18,0.02),
    new THREE.MeshLambertMaterial({color:0x3a4348}));
  back.position.z=0.05; g.add(back);
  const slot=new THREE.Mesh(new THREE.BoxGeometry(0.3,0.44,0.06),
    new THREE.MeshLambertMaterial({color:0x14171a}));
  slot.position.set(0,0.08,0.08); g.add(slot);
  for(const sy of[-0.13,0.13]){            // contact clips waiting for the fuse
    const clip=new THREE.Mesh(new THREE.BoxGeometry(0.16,0.04,0.05),
      new THREE.MeshLambertMaterial({color:0x8f969c}));
    clip.position.set(0,0.08+sy,0.11); g.add(clip);
  }
  /* the cutscene fuse: hidden until the animation conjures it in */
  const fuse=makeFuse(); fuse.scale.setScalar(0.9);
  fuse.visible=false;
  fuse.traverse(o=>{ if(o.isMesh){ o.material=o.material.clone();
    o.material.transparent=true; o.material.opacity=0; }});
  fuse.position.set(0,-0.25,0.55);
  g.add(fuse); g.userData.fuse=fuse;
  /* hinged door (left edge) carrying the status lamp & lever; pivot sits
     proud of the skirt ring so the closed panel clears the seated fuse */
  const pivot=new THREE.Group(); pivot.position.set(-0.45,0,0.2); g.add(pivot);
  g.userData.doorPivot=pivot;
  const door=new THREE.Group(); door.position.x=0.45; pivot.add(door);
  const panel=new THREE.Mesh(new THREE.BoxGeometry(0.88,1.28,0.04),
    new THREE.MeshLambertMaterial({color:0x49545a}));
  door.add(panel);
  const lamp=new THREE.Mesh(new THREE.SphereGeometry(0.06,8,8),
    new THREE.MeshBasicMaterial({color:0xff3020}));
  lamp.position.set(0.28,0.45,0.04); door.add(lamp); g.userData.lamp=lamp;
  const lever=new THREE.Mesh(new THREE.BoxGeometry(0.1,0.4,0.1),
    new THREE.MeshLambertMaterial({color:0x202428}));
  lever.position.set(0,-0.1,0.05); door.add(lever); g.userData.lever=lever;
  g.position.copy(p); g.rotation.y=facing;
  return g;
}
export const ELEV={OPEN_W:2.0, OPEN_H:2.6, DEPTH:2.6};   // cab dimensions, shared with the cutscene
function makeElevator(p,facing){
  /* the exit elevator, carved INTO its wall cell: placeProps removes that
     cell's wall box and this rebuilds it as flanks + header around a
     recessed cab. Local frame: origin at the centre of the doorway face at
     floor level, +z pointing out into the room. The grid cell stays solid,
     so collision still keeps the player out — only the cutscene camera
     ever goes inside. */
  const {OPEN_W,OPEN_H,DEPTH}=ELEV;
  const g=new THREE.Group();
  const wallM=new THREE.MeshPhongMaterial({map:texWall, specular:0x0d0c07, shininess:6});
  const metal=new THREE.MeshPhongMaterial({color:0x9aa0a4, specular:0x222426, shininess:22});
  const darkMetal=new THREE.MeshPhongMaterial({color:0x53585c, specular:0x303336, shininess:40});
  const add=(geo,mat,x,y,z)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);g.add(m);return m;};
  /* rebuilt wall around the opening */
  const flankW=(CELL-OPEN_W)/2;
  add(new THREE.BoxGeometry(flankW,WALL_H,CELL),wallM,-(OPEN_W/2+flankW/2),WALL_H/2,-CELL/2);
  add(new THREE.BoxGeometry(flankW,WALL_H,CELL),wallM, (OPEN_W/2+flankW/2),WALL_H/2,-CELL/2);
  add(new THREE.BoxGeometry(OPEN_W,WALL_H-OPEN_H,CELL),wallM,0,(WALL_H+OPEN_H)/2,-CELL/2);
  add(new THREE.BoxGeometry(OPEN_W,OPEN_H,CELL-DEPTH),wallM,0,OPEN_H/2,-(DEPTH+(CELL-DEPTH)/2));
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
  emerg.position.set(0,OPEN_H-0.22,-DEPTH+0.1); g.add(emerg); g.userData.emergMat=emergMat;
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
  return g;
}
export function placeProps(){
  const used=new Set(), spawn={cx:W>>1,cy:H>>1};
  const pick=(minD)=>{let c;do{c=randomOpenCell(minD);}while(used.has(c.cy*W+c.cx));used.add(c.cy*W+c.cx);return c;};
  for(let i=0;i<3;i++){
    const c=pick(6+i*2), p=cellToWorld(c.cx,c.cy), b=makeBottle();
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
      for(const[dx,dy,fy]of[[1,0,-Math.PI/2],[-1,0,Math.PI/2],[0,1,Math.PI],[0,-1,0]]){
        if(isWall(c.cx+dx,c.cy+dy)&&!used.has(c.cy*W+c.cx)){dir={dx,dy,fy};used.add(c.cy*W+c.cx);break outer;}
      }
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
      for(const[dx,dy,fy]of[[1,0,-Math.PI/2],[-1,0,Math.PI/2],[0,1,Math.PI],[0,-1,0]]){
        if(isWall(c.cx+dx,c.cy+dy)){best={c,dx,dy,fy};bestD=d;break;}
      }
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
}

/* ---------------- prop idle ---------------- */
export function updateProps(t){
  for(const it of interactables){
    if(it.taken) continue;
    if(it.kind==="bottle"||it.kind==="fuse"){
      it.mesh.rotation.y=t*0.8;
      it.mesh.position.y=0.12+Math.sin(t*2+it.mesh.position.x)*0.05;
    }
  }
}
