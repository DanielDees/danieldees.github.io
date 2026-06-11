/* ---------------- player movement, jumping & collision ---------------- */
import { lerp } from "./utils.js";
import { STATE, KEYS, monster } from "./state.js";
import { CELL, cellToWorld, worldToCell, isWall } from "./map.js";
import { AU, sfxStep, sfxJump, sfxLand } from "./audio.js";
import { camera, playerLight } from "./scene.js";
import { ui } from "./ui.js";
import { monsterCanSee } from "./monster.js";

const GRAV=13.5, JUMP_V=4.9;
function collide(px,pz,r){
  const c=worldToCell(px,pz);
  let nx=px, nz=pz;
  for(let gy=c.cy-1;gy<=c.cy+1;gy++)for(let gx=c.cx-1;gx<=c.cx+1;gx++){
    if(!isWall(gx,gy)) continue;
    const wp=cellToWorld(gx,gy);
    const minX=wp.x-CELL/2-r, maxX=wp.x+CELL/2+r;
    const minZ=wp.z-CELL/2-r, maxZ=wp.z+CELL/2+r;
    if(nx>minX&&nx<maxX&&nz>minZ&&nz<maxZ){
      const dxl=nx-minX, dxr=maxX-nx, dzl=nz-minZ, dzr=maxZ-nz;
      const m=Math.min(dxl,dxr,dzl,dzr);
      if(m===dxl)nx=minX; else if(m===dxr)nx=maxX;
      else if(m===dzl)nz=minZ; else nz=maxZ;
    }
  }
  return {x:nx,z:nz};
}
export function updatePlayer(dt){
  STATE.crouch = STATE.grounded && !!(KEYS["KeyC"]||KEYS["ControlLeft"]);
  const wantSprint = !!(KEYS["ShiftLeft"]||KEYS["ShiftRight"]);
  let fwd=0,str=0;
  if(KEYS["KeyW"])fwd++; if(KEYS["KeyS"])fwd--;
  if(KEYS["KeyD"])str++; if(KEYS["KeyA"])str--;
  const movingInput = fwd!==0||str!==0;
  STATE.sprinting = wantSprint && movingInput && !STATE.crouch && STATE.stamina>0.02;

  /* jump + gravity */
  if(KEYS["Space"] && STATE.grounded && !STATE.crouch){
    STATE.vy=JUMP_V; STATE.grounded=false; sfxJump();
  }
  if(!STATE.grounded){
    STATE.vy-=GRAV*dt;
    STATE.y+=STATE.vy*dt;
    if(STATE.y<=0){ STATE.y=0; STATE.vy=0; STATE.grounded=true; sfxLand(); }
  }

  let speed = STATE.crouch? 2.2 : STATE.sprinting? 8.0 : 4.6;
  const sin=Math.sin(STATE.yaw),cos=Math.cos(STATE.yaw);
  let vx=(-sin*fwd + cos*str), vz=(-cos*fwd - sin*str);
  const vl=Math.hypot(vx,vz)||1; vx/=vl; vz/=vl;

  /* momentum: grounded movement is direct; airborne, velocity persists and
     input (incl. starting/stopping sprint) only steers ~20% over a full jump */
  const desX=vx*speed*(movingInput?1:0), desZ=vz*speed*(movingInput?1:0);
  if(STATE.grounded){
    STATE.velX=desX; STATE.velZ=desZ;
  } else {
    const k=Math.min(1,dt*0.28);
    STATE.velX+=(desX-STATE.velX)*k;
    STATE.velZ+=(desZ-STATE.velZ)*k;
  }
  const tx=STATE.pos.x+STATE.velX*dt, tz=STATE.pos.z+STATE.velZ*dt;
  const solved=collide(tx,tz,0.42);
  STATE.moving = (movingInput||!STATE.grounded) &&
    (Math.abs(solved.x-STATE.pos.x)>1e-4||Math.abs(solved.z-STATE.pos.z)>1e-4);
  STATE.pos.x=solved.x; STATE.pos.z=solved.z;

  /* stamina: airborne sprinting drains at half rate */
  if(STATE.sprinting&&STATE.moving){
    const drain = 0.30 * (STATE.grounded? 1 : 0.5);
    STATE.stamina=Math.max(0,STATE.stamina-dt*drain);
  } else {
    STATE.stamina=Math.min(1,STATE.stamina+dt*0.16);
  }
  ui.stam.style.width=(STATE.stamina*100)+"%";
  ui.stamPct.textContent=Math.round(STATE.stamina*100)+"%";
  ui.stamWrap.classList.toggle("show", STATE.stamina<0.999);
  ui.stamWrap.classList.toggle("low", STATE.stamina<0.25);

  /* footsteps + bob, only with feet on the carpet */
  if(STATE.moving&&STATE.grounded){
    STATE.bob += dt*(STATE.sprinting?13:STATE.crouch?6:9);
    AU.stepTimer-=dt*speed;
    if(AU.stepTimer<=0){ sfxStep(STATE.crouch,STATE.sprinting); AU.stepTimer=2.4; }
  }
  const targetEye = STATE.crouch? 0.85 : 1.62;
  STATE.curEyeH = lerp(STATE.curEyeH, targetEye, dt*9);
  const bobY = (STATE.moving&&STATE.grounded)? Math.sin(STATE.bob)*0.045 : 0;
  camera.position.set(STATE.pos.x, STATE.y+STATE.curEyeH+bobY, STATE.pos.z);
  camera.rotation.order="YXZ";
  camera.rotation.y=STATE.yaw; camera.rotation.x=STATE.pitch;
  playerLight.position.set(STATE.pos.x,2.4,STATE.pos.z);

  const hidden = STATE.crouch && monster.active && !monsterCanSee();
  ui.hidden.classList.toggle("show", hidden && monster.pos.distanceTo(STATE.pos)<20);
}
