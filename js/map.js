/* ---------------- map generation ---------------- */
import { lerp, srand } from "./utils.js";

export const W=33, H=33, CELL=4, WALL_H=3.97;
export let grid;                // 1 = wall, 0 = open
export function genMap(){
  grid = Array.from({length:H},()=>Array(W).fill(1));
  let x=(W>>1), y=(H>>1), carved=0, target=Math.floor(W*H*0.52);
  while(carved<target){
    if(grid[y][x]===1){grid[y][x]=0;carved++;}
    const d=Math.floor(srand()*4);
    if(d===0&&x>1)x--; else if(d===1&&x<W-2)x++;
    else if(d===2&&y>1)y--; else if(d===3&&y<H-2)y++;
    if(srand()<0.018){
      for(let ry=-1;ry<=1;ry++)for(let rx=-1;rx<=1;rx++){
        const nx=x+rx, ny=y+ry;
        if(nx>0&&nx<W-1&&ny>0&&ny<H-1&&grid[ny][nx]===1){grid[ny][nx]=0;carved++;}
      }
    }
  }
  for(let i=0;i<46;i++){
    const px=2+Math.floor(srand()*(W-4)), py=2+Math.floor(srand()*(H-4));
    if(grid[py][px]===0){
      let open=0;
      for(let ry=-1;ry<=1;ry++)for(let rx=-1;rx<=1;rx++) if(grid[py+ry][px+rx]===0) open++;
      if(open>=8 && !(Math.abs(px-(W>>1))<3 && Math.abs(py-(H>>1))<3)) grid[py][px]=1;
    }
  }
}
export const cellToWorld = (cx,cy)=>({x:(cx-W/2+0.5)*CELL, z:(cy-H/2+0.5)*CELL});
export const worldToCell = (x,z)=>({cx:Math.floor(x/CELL+W/2), cy:Math.floor(z/CELL+H/2)});
export const isWall=(cx,cy)=> cx<0||cy<0||cx>=W||cy>=H||grid[cy][cx]===1;

export function losCells(ax,az,bx,bz){
  const steps = Math.ceil(Math.hypot(bx-ax,bz-az)/(CELL*0.4));
  for(let i=1;i<steps;i++){
    const t=i/steps, c=worldToCell(lerp(ax,bx,t),lerp(az,bz,t));
    if(isWall(c.cx,c.cy)) return false;
  }
  return true;
}
export function bfsPath(sx,sy,tx,ty){
  if(isWall(tx,ty)||isWall(sx,sy)) return null;
  const prev=new Map(), key=(x,y)=>y*W+x, q=[[sx,sy]];
  prev.set(key(sx,sy),-1);
  while(q.length){
    const [x,y]=q.shift();
    if(x===tx&&y===ty){
      const path=[]; let k=key(x,y);
      while(k!==-1){path.push({cx:k%W,cy:(k/W)|0}); k=prev.get(k);}
      return path.reverse();
    }
    for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){
      const nx=x+dx, ny=y+dy, nk=key(nx,ny);
      if(!isWall(nx,ny)&&!prev.has(nk)){prev.set(nk,key(x,y));q.push([nx,ny]);}
    }
  }
  return null;
}
export function randomOpenCell(minDistFromCenter=0){
  for(let t=0;t<500;t++){
    const cx=1+Math.floor(Math.random()*(W-2)), cy=1+Math.floor(Math.random()*(H-2));
    if(grid[cy][cx]===0){
      const d=Math.hypot(cx-(W>>1),cy-(H>>1));
      if(d>=minDistFromCenter) return {cx,cy};
    }
  }
  return {cx:W>>1,cy:H>>1};
}
export function farOpenWorldPoint(fromX,fromZ,minDist){
  let p=cellToWorld(W>>1,H>>1);
  for(let t=0;t<500;t++){
    const c=randomOpenCell(0), q=cellToWorld(c.cx,c.cy);
    if(Math.hypot(q.x-fromX,q.z-fromZ)>minDist){p=q;break;}
  }
  return p;
}
