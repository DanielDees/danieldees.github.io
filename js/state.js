/* ---------------- game state ---------------- */
export const STATE={
  playing:false, paused:false, dead:false, won:false,
  pos:new THREE.Vector3(0,0,0), yaw:0, pitch:0,
  y:0, vy:0, grounded:true, velX:0, velZ:0,
  crouch:false, sprinting:false, stamina:1, sens:1,
  curEyeH:1.62,
  bottles:0, hasFuse:false, powerOn:false, objective:0,
  deaths:0, time:0,
  bob:0, moving:false,
};
export const KEYS={};
export const monster={
  active:false, mesh:null, pos:new THREE.Vector3(),
  state:"wander", path:[], repath:0,
  lastSeen:null, searchT:0, alertT:0, pauseT:0, knockT:4,
  curSpeed:0, faceAng:0, anim:0, groanT:6,
};
