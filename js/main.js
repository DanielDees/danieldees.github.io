/* =====================================================================
   NOCLIP — Escape the Backrooms (v3.0)
   - Three levels now: LEVEL 0 (the backrooms), THE END (the infinite
     library) below the failed elevator, and THE NEST (the cave) below the
     library's stair. STATE.level picks which update path runs; the light
     pool, audio buses, interaction and cutscene systems are shared.
   - Lighting originates from fixtures: a pool of point lights is bound to
     the nearest sources each frame — troffers, hanging strips, or the
     cave's fungus. Flicker is the hunter-radar on every floor.
   - Player: jumping w/ gravity; sprint stamina drains at half rate while
     airborne; crouching slips under the library's tables and through the
     cave's squeezes; the crank lantern is THE NEST's other heartbeat.
   ===================================================================== */
import { STATE, monster, spider } from "./state.js";
import { scene, camera, renderer, lights } from "./scene.js";
import { updatePlayer } from "./player.js";
import { updateMonster } from "./monster.js";
import { updateSpider, updateSpiderCave, debugSpiderToWall, debugSpiderToCeiling, spiderHearDisc, debugSpiderDiscTransit } from "./spider.js";
import { updateLights } from "./lights.js";
import { updateProps, interactables, exitDoor } from "./props.js";
import { updateFocus, updateInteractHold } from "./interact.js";
import { CINE, updateCinematic, startBreakerCine, startElevatorCine,
         startTheEndIntro, startTerminalCine, startDescentEnd, startAscentEnd } from "./cutscene.js";
import { W, H, CELL, grid, cellToWorld } from "./map.js";
import { updateLibrary, LIB, grid2, revealHole } from "./library.js";
import { updateCave, CAVE, grid3 } from "./cave.js";
import { updateHatchlings, HATCH } from "./hatchling.js";
import { updateLantern, LANT } from "./lantern.js";
import { enterTheEnd, enterTheNest, debugSkipToTheEnd, debugWarpToTerminal, debugWarpToNest, respawn } from "./lifecycle.js";
import { ui, renderObjectives } from "./ui.js";
import "./input.js";

/* ---------------- main loop ---------------- */
let last=performance.now(), uiTick=0;
function loop(now){
  requestAnimationFrame(loop);
  const dt=Math.min((now-last)/1000,0.05); last=now;
  if(STATE.playing&&!STATE.paused&&!STATE.dead&&!STATE.won){
    STATE.time+=dt;
    /* the HUD fades out (CSS, ~1s) whenever a cinematic owns the camera */
    ui.hud.classList.toggle("cine",CINE.active);
    if(CINE.active){
      /* a cinematic owns the camera; the breaker scene keeps the entity AI
         alive (it's sprinting for the panel), the others script their cast */
      updateCinematic(dt);
      if(CINE.kind==="breaker") updateMonster(dt);
    } else {
      updatePlayer(dt);
      if(STATE.level===2){ updateSpiderCave(dt); updateHatchlings(dt); }
      else if(STATE.level===1) updateSpider(dt);
      else updateMonster(dt);
      updateFocus();
      if(STATE.level===2) updateInteractHold(dt);
      /* THE END's stairs are real and yours to walk — the dark only takes
         over a couple of turns down, once the fog has already won */
      if(STATE.level===1&&STATE.holeOpen&&STATE.y<-8.5) startDescentEnd();
      /* …and THE NEST's chimney is the same climb in the other direction */
      if(STATE.level===2&&CAVE.fissure&&CAVE.fissure.open&&STATE.y>9) startAscentEnd();
    }
    if(STATE.level===1) updateLibrary(dt);        // light drop, blackouts, old machines
    else if(STATE.level===2) updateCave(dt);      // frenzy clock, fires, fungus, drips
    updateLantern(dt);                            // no-op outside THE NEST
    updateLights(dt,now/1000);
    updateProps(now/1000);
    uiTick-=dt;
    if(uiTick<=0){ renderObjectives(); uiTick=1; }
  }
  renderer.render(scene,camera);
}
requestAnimationFrame(loop);

/* console/debug handle (also used by automated smoke tests) */
window.NOCLIP_DEBUG={STATE, monster, spider, CINE, scene, camera, renderer,
  startBreakerCine, startElevatorCine, startTheEndIntro, startTerminalCine,
  startDescentEnd, startAscentEnd, revealHole,
  enterTheEnd, enterTheNest, debugSkipToTheEnd, debugWarpToTerminal, debugWarpToNest, respawn,
  debugSpiderToWall, debugSpiderToCeiling, spiderHearDisc, debugSpiderDiscTransit,
  W, H, CELL, cellToWorld,
  get interactables(){ return interactables; },
  get exitDoor(){ return exitDoor; },
  get grid(){ return grid; },                   // level 0's, for parity with grid2/grid3
  get LIB(){ return LIB; },
  get grid2(){ return grid2; },
  get CAVE(){ return CAVE; },
  get grid3(){ return grid3; },
  get HATCH(){ return HATCH; },
  get LANT(){ return LANT; },
  get lights(){ return lights; }};
