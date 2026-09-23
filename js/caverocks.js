/* ---------------- loose stone: pebbles, cobbles, breakdown ----------------
   A floor map can suggest a pebble; it cannot stand one up. Grit painted
   into the silt reads as grit from a standing height and as a stain from
   anywhere else, and the scree — the one surface in the level that is LOUDER
   underfoot — looked exactly like the silt beside it.

   So the loose stone is geometry: a handful of shapes (a displaced
   icosahedron, knocked flat by random plane cuts for the angular breakdown
   and left round for what the water has worked), instanced by the thousand
   in a few draws. They wear the cave's own rock material, which is mapped by
   world position, so every stone carries the same limestone at the same
   scale as the wall it fell from. */
import { markShared } from "./scene.js";
import { rand } from "./utils.js";

/* a closed stone, unit-ish radius. Every displacement is a function of the
   vertex's POSITION: an icosahedron's corners are duplicated per face, and
   anything keyed on the index opens the stone at its seams. */
export function stoneGeo({detail=1, cuts=3, round=0.5, squash=0.7, seed=Math.random()*50}={}){
  const g=new THREE.IcosahedronGeometry(1,detail);
  const p=g.attributes.position;
  const planes=[];
  for(let i=0;i<cuts;i++){
    const a=Math.random()*Math.PI*2, e=Math.acos(rand(-1,1));
    planes.push({n:[Math.sin(e)*Math.cos(a),Math.cos(e),Math.sin(e)*Math.sin(a)], d:rand(0.55,0.82)});
  }
  for(let i=0;i<p.count;i++){
    let x=p.getX(i), y=p.getY(i), z=p.getZ(i);
    const n=1+0.22*Math.sin(x*2.1+y*1.7+seed)*Math.cos(z*1.9-x*0.7+seed*1.3)
             +0.10*Math.sin(x*4.7-z*3.9+y*2.3+seed*2.1)*(1-round*0.6);
    x*=n; y*=n; z*=n;
    for(const pl of planes){                  // a fracture face: flatten onto the plane
      const d=x*pl.n[0]+y*pl.n[1]+z*pl.n[2];
      if(d>pl.d){ const k=(d-pl.d)*(1-round*0.5); x-=pl.n[0]*k; y-=pl.n[1]*k; z-=pl.n[2]*k; }
    }
    p.setXYZ(i,x,y*squash,z);
  }
  /* weld by position so round stones shade round; cut faces keep their edge */
  g.computeVertexNormals();
  const N=g.attributes.normal, groups=new Map();
  for(let i=0;i<p.count;i++){
    const k=Math.round(p.getX(i)*1e4)+","+Math.round(p.getY(i)*1e4)+","+Math.round(p.getZ(i)*1e4);
    let a=groups.get(k); if(!a) groups.set(k,a=[]); a.push(i);
  }
  const src=Float32Array.from(N.array), crease=round>0.6? -1 : 0.55;
  for(const ids of groups.values()) for(const i of ids){
    let x=0,y=0,z=0;
    for(const j of ids){
      if(src[i*3]*src[j*3]+src[i*3+1]*src[j*3+1]+src[i*3+2]*src[j*3+2]<crease) continue;
      x+=src[j*3]; y+=src[j*3+1]; z+=src[j*3+2];
    }
    const l=Math.hypot(x,y,z)||1; N.setXYZ(i,x/l,y/l,z/l);
  }
  g.computeBoundingSphere();
  return g;
}

/* the shared shapes, built once for the tab */
let SHAPES=null;
function shapes(){
  if(SHAPES) return SHAPES;
  SHAPES={
    pebble:[0,1,2].map(()=>stoneGeo({detail:0, cuts:1, round:0.85, squash:0.62})),
    chip:[0,1,2].map(()=>stoneGeo({detail:0, cuts:4, round:0.15, squash:0.55})),
    block:[0,1,2].map(()=>stoneGeo({detail:1, cuts:5, round:0.1, squash:0.72})),
  };
  for(const k in SHAPES) SHAPES[k].forEach(g=>markShared(g));
  return SHAPES;
}

/* scatter loose stone over the whole cave. `q` carries the cave's own
   queries (grid, cell→world, the ground field, the keep-outs), so this
   module needs nothing from cave.js at load time. Returns the meshes and
   the obstacles it added (the few blocks big enough to walk into).

   Instances are grouped by SECTOR (6×6 cells), one InstancedMesh per kind
   per sector, each on a geometry clone whose bounding sphere is the
   sector's: three culls an InstancedMesh by its geometry's sphere, and one
   mesh for the whole cave would be drawn in full — every pebble behind you
   — from anywhere. Each sector draws its own variant of each shape, so the
   variety costs no draws. */
const _o=new THREE.Object3D();
const SECTOR=6;
export function scatterStones(scene,mat,q){
  const S=shapes();
  const sectors=new Map();
  const put=(kind,x,z,s,sink,tilt)=>{
    const c=q.worldToCell3(x,z), key=Math.floor(c.cx/SECTOR)+","+Math.floor(c.cy/SECTOR);
    let sec=sectors.get(key);
    if(!sec){ sec={pebble:[],chip:[],block:[],cx:Math.floor(c.cx/SECTOR),cy:Math.floor(c.cy/SECTOR)}; sectors.set(key,sec); }
    sec[kind].push({x,y:q.floorYAt(x,z)-s*sink,z,s,rx:rand(-tilt,tilt),ry:Math.random()*7,rz:rand(-tilt,tilt),
      sx:rand(0.8,1.25),sz:rand(0.8,1.25)});
  };
  const E=q.CELL/2, added=[];
  const blocked=(x,z,r)=>!q.clearOf(x,z,r);
  for(let cy=1;cy<q.CH-1;cy++)for(let cx=1;cx<q.CW-1;cx++){
    const t=q.codeAt(cx,cy);
    if(t!==0&&t!==4&&t!==3) continue;
    const p=q.cellToWorld3(cx,cy);
    /* which faces of this cell are rock: breakdown piles up at the foot */
    const walls=[[1,0],[-1,0],[0,1],[0,-1]].filter(([dx,dy])=>{ const n=q.codeAt(cx+dx,cy+dy); return n===1||n===7; });
    const rnd=()=>[p.x+rand(-E,E),p.z+rand(-E,E)];
    const foot=()=>{
      const [dx,dy]=walls[Math.floor(Math.random()*walls.length)];
      const along=rand(-E,E), off=E-rand(0.15,0.9);
      return [p.x+dx*off+(dy?along:0), p.z+dy*off+(dx?along:0)];
    };
    if(t===3){                                 // a few worked stones break the water
      for(let i=0;i<2;i++) if(Math.random()<0.55){
        const [x,z]=rnd(); put("pebble",x,z,rand(0.10,0.24),0.45,0.25);
      }
      continue;
    }
    const scree=t===4;
    /* pebbles gather in drifts, not an even sprinkle: a cell draws a
       clump centre or two and most of its stones fall near them */
    const clumps=[rnd(),rnd()];
    const near=()=>{ const c=clumps[Math.random()<0.5?0:1], r=Math.pow(Math.random(),1.6)*1.3, a=Math.random()*7;
      return [c[0]+Math.cos(a)*r, c[1]+Math.sin(a)*r]; };
    const nPeb=scree? 170 : 16+Math.floor(Math.random()*18);
    for(let i=0;i<nPeb;i++){
      const [x,z]=walls.length&&Math.random()<0.35? foot() : (scree? rnd() : near());
      const cc=q.worldToCell3(x,z);
      if(blocked(x,z,0.05)||q.codeAt(cc.cx,cc.cy)===1) continue;
      put(scree&&Math.random()<0.6? "chip":"pebble",x,z,scree? rand(0.03,0.10):rand(0.025,0.075),0.3,0.4);
    }
    const nCob=scree? 40 : (walls.length? 6:2)+Math.floor(Math.random()*4);
    for(let i=0;i<nCob;i++){
      const [x,z]=walls.length&&(scree||Math.random()<0.75)? foot() : near();
      if(blocked(x,z,0.15)) continue;
      put("chip",x,z,rand(0.08,0.20),0.28,0.5);
    }
    /* breakdown: blocks fallen from the vault, at the wall's foot */
    const nBlk=walls.length? (scree? 4:(Math.random()<0.7?1+(Math.random()<0.3?1:0):0)) : 0;
    for(let i=0;i<nBlk;i++){
      const [x,z]=foot(); const s=rand(0.18,scree?0.5:0.4);
      if(blocked(x,z,s)) continue;
      put("block",x,z,s,0.3,0.35);
      if(s>0.3) added.push({x,z,r:s*0.85});
    }
  }
  const meshes=[];
  for(const sec of sectors.values()){
    const c0=q.cellToWorld3(sec.cx*SECTOR,sec.cy*SECTOR);
    const cxw=c0.x+(SECTOR-1)*q.CELL/2, czw=c0.z+(SECTOR-1)*q.CELL/2;
    for(const kind of["pebble","chip","block"]){
      const arr=sec[kind]; if(!arr.length) continue;
      const geo=S[kind][Math.floor(Math.random()*S[kind].length)].clone();
      geo.boundingSphere=new THREE.Sphere(new THREE.Vector3(cxw,0,czw),SECTOR*q.CELL*0.75+2);
      const m=new THREE.InstancedMesh(geo,mat,arr.length);
      arr.forEach((a,k)=>{
        _o.position.set(a.x,a.y,a.z); _o.rotation.set(a.rx,a.ry,a.rz);
        _o.scale.set(a.s*a.sx,a.s,a.s*a.sz); _o.updateMatrix(); m.setMatrixAt(k,_o.matrix);
      });
      m.instanceMatrix.needsUpdate=true;
      scene.add(m); meshes.push(m);
    }
  }
  return {meshes, obstacles:added};
}
