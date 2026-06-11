/* ---------------- props ---------------- */
import { rand } from "./utils.js";
import { W, H, CELL, cellToWorld, randomOpenCell, isWall } from "./map.js";
import { makeCanvas } from "./textures.js";
import { scene } from "./scene.js";

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
  const g=new THREE.Group();
  const box=new THREE.Mesh(new THREE.BoxGeometry(0.9,1.3,0.18),
    new THREE.MeshLambertMaterial({color:0x4f5a5e}));
  g.add(box);
  const lamp=new THREE.Mesh(new THREE.SphereGeometry(0.06,8,8),
    new THREE.MeshBasicMaterial({color:0xff3020}));
  lamp.position.set(0.28,0.45,0.1); g.add(lamp); g.userData.lamp=lamp;
  const lever=new THREE.Mesh(new THREE.BoxGeometry(0.1,0.4,0.1),new THREE.MeshLambertMaterial({color:0x202428}));
  lever.position.set(0,-0.1,0.12); g.add(lever); g.userData.lever=lever;
  g.position.copy(p); g.rotation.y=facing;
  return g;
}
function makeExitDoor(p,facing){
  const g=new THREE.Group();
  const frame=new THREE.Mesh(new THREE.BoxGeometry(1.7,2.6,0.22),new THREE.MeshLambertMaterial({color:0x2c2c2e}));
  frame.position.y=1.3; g.add(frame);
  const door=new THREE.Mesh(new THREE.BoxGeometry(1.4,2.4,0.1),
    new THREE.MeshLambertMaterial({color:0x3a3f46}));
  door.position.set(0,1.25,0.08); g.add(door);
  const signC=makeCanvas(128,48,(gx,w,h)=>{gx.fillStyle="#101010";gx.fillRect(0,0,w,h);
    gx.fillStyle="#39d24a";gx.font="bold 30px Courier New";gx.textAlign="center";gx.fillText("EXIT",w/2,34);});
  const sign=new THREE.Mesh(new THREE.PlaneGeometry(0.8,0.3),
    new THREE.MeshBasicMaterial({map:signC}));
  sign.position.set(0,2.75,0.13); g.add(sign); g.userData.sign=sign;
  sign.material.color.set(0x333333);
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
    const dp=new THREE.Vector3(p.x+best.dx*(CELL/2-0.18),0,p.z+best.dy*(CELL/2-0.18));
    exitDoor=makeExitDoor(dp,best.fy);
    scene.add(exitDoor);
    interactables.push({kind:"exit",mesh:exitDoor,label:"OPEN EXIT DOOR",taken:false});
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
