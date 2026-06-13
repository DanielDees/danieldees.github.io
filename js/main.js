/* =====================================================================
   NOCLIP — Escape the Backrooms (v2.0)
   - Two levels now: LEVEL 0 (the backrooms) and, below the failed
     elevator, THE END — the infinite library. STATE.level picks which
     update path runs; the light pool, audio buses, interaction and
     cutscene systems are shared.
   - Lighting originates from ceiling fixtures: a pool of point lights is
     bound to the nearest panels each frame, so flicker is local and unlit
     corridors fall into murk. In THE END the librarian is the flicker
     radar instead of the entity.
   - Player: jumping w/ gravity; sprint stamina drains at half rate while
     airborne; crouching slips under the library's tables.
   ===================================================================== */
import { STATE, monster, spider } from "./state.js";
import { scene, camera, renderer } from "./scene.js";
import { updatePlayer } from "./player.js";
import { updateMonster } from "./monster.js";
import { updateSpider } from "./spider.js";
import { updateLights } from "./lights.js";
import { updateProps, interactables, exitDoor } from "./props.js";
import { updateFocus } from "./interact.js";
import { CINE, updateCinematic, startBreakerCine, startElevatorCine,
         startTheEndIntro, startTerminalCine } from "./cutscene.js";
import { updateLibrary, LIB, grid2 } from "./library.js";
import { enterTheEnd, debugSkipToTheEnd } from "./lifecycle.js";
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
      if(STATE.level===1) updateSpider(dt); else updateMonster(dt);
      updateFocus();
    }
    if(STATE.level===1) updateLibrary(dt);   // light drop, blackouts, old machines
    updateLights(dt,now/1000);
    updateProps(now/1000);
    uiTick-=dt;
    if(uiTick<=0){ renderObjectives(); uiTick=1; }
  }
  renderer.render(scene,camera);
}
requestAnimationFrame(loop);

/* console/debug handle (also used by automated smoke tests) */
window.NOCLIP_DEBUG={STATE, monster, spider, CINE, scene, camera,
  startBreakerCine, startElevatorCine, startTheEndIntro, startTerminalCine,
  enterTheEnd, debugSkipToTheEnd,
  get interactables(){ return interactables; },
  get exitDoor(){ return exitDoor; },
  get LIB(){ return LIB; },
  get grid2(){ return grid2; }};
