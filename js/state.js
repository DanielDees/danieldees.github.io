/* ---------------- game state ---------------- */
export const STATE={
  playing:false, paused:false, dead:false, won:false,
  level:0,                       // 0 = the backrooms · 1 = THE END (the infinite library)
  pos:new THREE.Vector3(0,0,0), yaw:0, pitch:0,
  y:0, vy:0, grounded:true, velX:0, velZ:0,
  crouch:false, sprinting:false, stamina:1, sens:1,
  crouchToggle:false,            // setting: [C] toggles crouch instead of holding
  crouchLatch:false,             // toggle-mode state: currently latched down

  curEyeH:1.62,
  bottles:0, hasFuse:false, powerOn:false, objective:0,
  deaths:0, time:0,
  bob:0, moving:false,
  ambDim:1,                      // ambient-floor multiplier (the elevator crash drains it)
  /* ---- THE END progression ---- */
  discsCarried:0, discsDelivered:0, discsFound:0, discTotal:0,
  libT0:0,                       // STATE.time at the moment the library was entered
  libFirstPickup:-1,             // STATE.time of the first disc pickup (-1 = none yet)
  libDim:false,                  // the 45s-later light drop has happened
  libBlackout:0,                 // 0..1: a temporary whole-floor light failure
  libWakeT:-1,                   // intro cutscene: seconds since the fixtures began waking (-1 = all awake)
  shakeAmp:0,                    // slow micro screen-shake (post-drop ambience)
};
export const KEYS={};
export const monster={
  active:false, mesh:null, pos:new THREE.Vector3(),
  wakeT:0, shock:null, shockTimer:0, escalation:0,
  state:"wander", path:[], repath:0,
  lastSeen:null, searchT:0, alertT:0, pauseT:0, knockT:4, knockMove:null,
  curSpeed:0, faceAng:0, anim:0, groanT:6,
  twitchT:5, twitchDur:0, twitchSeed:0,
  teleT:20,             // countdown to the next space-fold (see monster.js)
  rush:false,           // hunt at full chase speed (final-objective sprint)
  holdAt30:false,       // breaker cinematic: arm the 30m freeze ring
  held:false,           // frozen by the cinematic until control returns
};
/* ---- the librarian: THE END's spider ----
   Hearing-driven. Disc pickups start a reaction countdown scaled by
   distance; stacked pickups shorten it and ratchet its speed (see
   spider.js for the exact rules from the design TODO). */
export const spider={
  active:false, mesh:null, pos:new THREE.Vector3(),
  state:"browse",       // browse | peruse | seek | investigate | chase | stalk
  path:[], repath:0, curSpeed:0, faceAng:0, anim:0,
  target:null,          // world point it is walking/running to
  lastKnown:null,       // last heard position (disc pickup or movement)
  pendingT:0,           // reaction countdown before it starts pathing (0 = none)
  speedMult:1,          // 1..3 × player sprint speed while seeking/chasing
  stacking:false,       // true from a pickup until it reaches the latest pickup spot
  seekRun:false,        // seek at run speed (disc/strong alert) vs walk (mild)
  browseT:0, pauseT:0, scratchT:6, sniffT:0, sniffsLeft:0, searchT:0, stalkT:0,
  mildCD:0, stepAcc:0, screechCD:0, scratchCD:0, sniffCD:0,
  stuckT:0,             // anti-deadlock: seconds spent commanded-but-stationary
  /* ---- v2.3: it climbs ----
     a surface-locomotion layer above the floor AI: the spider can crawl the
     perimeter walls and web up to the ceiling to reposition, then drop. */
  headDir:new THREE.Vector3(0,0,1),    // unit travel heading (3-D, drives the body's orientation)
  floorPaths:0,                        // consecutive floor browses without climbing (capped → forces a climb)
  discFar:false,                       // the latest heard disc was beyond 60% of the map → take a surface transit
  surf:{
    mode:"floor",       // floor | wall | ceiling
    phase:"idle",       // idle | toWall | fromWall | toCeiling | drop | dropAttack
    t:0, dur:0, ramp:0, // transition clock + the 0→1 ramp toward 2× surface speed
    pursue:false, glideActive:false, glides:0,   // glides: repositioning count, capped before it must drop
    goal:null,          // Vector3 disc-transit target (surface route to a far disc), else null
    weaveBase:null, weaveP0:0,   // wall-traverse S-weave anchored to the entry elevation (no snap)
    pStart:0, pEnd:0, toH:0, lead:0,   // S-curve mount/dismount: perimeter endpoints, target height, along-lead
    wall:null,          // {axis,face,N,along} when on a wall
    targetN:new THREE.Vector3(0,1,0),  // surface outward normal the body rights itself to
    from:new THREE.Vector3(), mid:new THREE.Vector3(), to:new THREE.Vector3(),
    len1:0, len2:0,     // segment lengths for constant-speed wall climb/descent
    web:null, struck:false, killed:false,
    setup:0, fall:0, dropX:0, dropZ:0,
    hang:false, hangN:new THREE.Vector3(1,0,0),   // head-down web hang: body dangles below the tail (which rides s.pos)
  },
};
