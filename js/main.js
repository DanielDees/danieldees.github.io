/* =====================================================================
   NOCLIP — Escape the Backrooms (v2)
   - Lighting now originates from ceiling fixtures: a pool of point
     lights is bound to the nearest panels each frame, so flicker is
     local and unlit corridors fall into murk.
   - Entity: idle/walk animation driven by real velocity, alert turn +
     cry before chasing, speed ramps up and down, continuous breathing
     loop and distant groans.
   - Player: jumping w/ gravity; sprint stamina drains at half rate
     while airborne.
   - Audio: master/music/sound buses with an in-game mixer; faint
     eerie melodic layer over the drone.
   ===================================================================== */
import { STATE } from "./state.js";
import { scene, camera, renderer } from "./scene.js";
import { updatePlayer } from "./player.js";
import { updateMonster } from "./monster.js";
import { updateLights } from "./lights.js";
import { updateProps } from "./props.js";
import { updateFocus } from "./interact.js";
import { renderObjectives } from "./ui.js";
import "./input.js";

/* ---------------- main loop ---------------- */
let last=performance.now(), uiTick=0;
function loop(now){
  requestAnimationFrame(loop);
  const dt=Math.min((now-last)/1000,0.05); last=now;
  if(STATE.playing&&!STATE.paused&&!STATE.dead&&!STATE.won){
    STATE.time+=dt;
    updatePlayer(dt);
    updateMonster(dt);
    updateLights(dt,now/1000);
    updateProps(now/1000);
    updateFocus();
    uiTick-=dt;
    if(uiTick<=0){ renderObjectives(); uiTick=1; }
  }
  renderer.render(scene,camera);
}
requestAnimationFrame(loop);
