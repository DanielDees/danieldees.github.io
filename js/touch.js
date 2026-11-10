/* ---------------- touch controls ----------------
   Phones and tablets have no keyboard, no mouse and no pointer lock, so the
   whole control scheme is drawn on the glass: the left thumb walks, the
   right thumb looks, and the handful of actions sit under the right thumb.

   Nothing here knows about the game's rules. It writes the same inputs the
   keyboard does — KEYS for anything held, TOUCH for the analog stick and
   the sprint latch, STATE.yaw/pitch for the view — and player.js, lantern.js
   and interact.js read them exactly as they always have.

   Three decisions worth keeping:
   · the stick FLOATS: it appears under the thumb wherever it lands in the
     left part of the screen, because a thumb that has to find a fixed pad
     without looking misses it, and missing it in this game is walking when
     you meant to stand still.
   · RUN and CROUCH are LATCHES, not holds. Both are things you keep doing
     while the same thumb has to look around, and hiding means staying
     crouched with your hands off the screen. Sprinting is the loudest thing
     you can do, so it is a button you press on purpose, never the outer
     ring of the stick; letting go of the stick drops the latch.
   · a touch that starts ON a button still steers the view when it is
     dragged. Winding the lantern and burning a clutch are both long holds,
     and a hold that froze the camera would be a hold nobody could afford. */
import { $, clamp } from "./utils.js";
import { STATE, KEYS, TOUCH } from "./state.js";
import { tryInteract, hasFocus } from "./interact.js";
import { toggleLantern } from "./lantern.js";
import { CINE } from "./cutscene.js";

const layer=$("touchUI"), stick=$("tStick"), knob=stick&&stick.firstElementChild;
const btn={use:$("tUse"), run:$("tRun"), crouch:$("tCrouch"), jump:$("tJump"),
           light:$("tLight"), wind:$("tWind")};

const STICK_R=54;            // px of throw from the stick's centre to its rim
const DEAD=0.16;             // fraction of the throw that is still "standing still"
const LOOK=0.0052;           // radians per CSS pixel at 1.0× sensitivity
const STICK_ZONE=0.44;       // the left part of the screen that belongs to the walking thumb

let stickId=null, ox=0, oy=0;        // the walking touch and where its stick is centred
const looks=new Map();               // every other live touch → its last position (they all steer)
const held=new Map();                // touch id → the button it is holding

const live=()=> STATE.playing && !STATE.paused && !STATE.dead && !STATE.won && !CINE.active;

function setStick(dx,dy){
  let m=Math.hypot(dx,dy);
  if(m>STICK_R){
    /* past the rim the stick trails the thumb, so reversing never has to
       drag back across a stretch of dead travel first */
    ox+=dx*(1-STICK_R/m); oy+=dy*(1-STICK_R/m);
    dx*=STICK_R/m; dy*=STICK_R/m; m=STICK_R;
  }
  const f=m/STICK_R;
  if(f<DEAD){ TOUCH.str=0; TOUCH.fwd=0; }
  else{
    /* a light push is a careful walk, a full one is full pace; the last
       fifth of the throw is all "full" so the rim is not a balancing act */
    const pace=0.4+0.6*clamp((f-DEAD)/(0.8-DEAD),0,1);
    TOUCH.str= dx/m*pace; TOUCH.fwd=-dy/m*pace;
  }
  if(stick){
    stick.style.transform=`translate3d(${ox}px,${oy}px,0)`;
    knob.style.transform=`translate3d(${dx}px,${dy}px,0)`;
  }
}
function endStick(){
  stickId=null; TOUCH.str=0; TOUCH.fwd=0;
  TOUCH.sprint=false;                 // you stopped: the next step is a walk again
  if(stick) stick.classList.remove("on");
}
function look(dx,dy){
  if(!live()) return;
  STATE.yaw -= dx*LOOK*STATE.sens;
  STATE.pitch = clamp(STATE.pitch - dy*LOOK*STATE.sens, -1.45, 1.45);
}

/* ---- what each button does: down / up ---- */
const ACT={
  use:   {down(){ KEYS.KeyE=true; tryInteract(); },      up(){ KEYS.KeyE=false; }},
  jump:  {down(){ KEYS.Space=true; },                    up(){ KEYS.Space=false; }},
  wind:  {down(){ KEYS.KeyR=true; },                     up(){ KEYS.KeyR=false; }},
  light: {down(){ toggleLantern(); },                    up(){}},
  run:   {down(){ TOUCH.sprint=!TOUCH.sprint; },         up(){}},
  crouch:{down(){ STATE.crouchLatch=!STATE.crouchLatch; },up(){}},
};
function release(){
  for(const [,b] of held){ ACT[b.name].up(); b.el.classList.remove("down"); }
  held.clear(); looks.clear();
  KEYS.KeyE=false; KEYS.Space=false; KEYS.KeyR=false;
  if(stickId!==null) endStick();
}

if(layer){
  const opt={passive:false};
  layer.addEventListener("touchstart",e=>{
    e.preventDefault();               // no scroll, no zoom, no text callout, no synthetic mouse
    if(!live()) return;
    for(const t of e.changedTouches){
      const name=t.target&&t.target.dataset? t.target.dataset.act : null;
      if(name&&ACT[name]){
        held.set(t.identifier,{name,el:t.target});
        t.target.classList.add("down");
        ACT[name].down();
        looks.set(t.identifier,{x:t.clientX,y:t.clientY});
      } else if(stickId===null && t.clientX<innerWidth*STICK_ZONE){
        stickId=t.identifier; ox=t.clientX; oy=t.clientY;
        if(stick) stick.classList.add("on");
        setStick(0,0);
      } else looks.set(t.identifier,{x:t.clientX,y:t.clientY});
    }
  },opt);
  layer.addEventListener("touchmove",e=>{
    e.preventDefault();
    for(const t of e.changedTouches){
      if(t.identifier===stickId){ setStick(t.clientX-ox,t.clientY-oy); continue; }
      const p=looks.get(t.identifier);
      if(p){ look(t.clientX-p.x,t.clientY-p.y); p.x=t.clientX; p.y=t.clientY; }
    }
  },opt);
  const end=e=>{
    e.preventDefault();
    for(const t of e.changedTouches){
      if(t.identifier===stickId){ endStick(); continue; }
      looks.delete(t.identifier);
      const b=held.get(t.identifier);
      if(b){ ACT[b.name].up(); b.el.classList.remove("down"); held.delete(t.identifier); }
    }
  };
  layer.addEventListener("touchend",end,opt);
  layer.addEventListener("touchcancel",end,opt);
}

/* a device whose PRIMARY pointer is a finger gets these controls from the
   start (state.js). One that reports no fine pointer at all but did not
   match that query gets them at its first real touch. A laptop with a
   touchscreen AND a mouse keeps the keyboard and the pointer lock: a stray
   finger on the glass must not take mouse-look away for the rest of the run. */
function enable(){
  if(TOUCH.on) return;
  TOUCH.on=true; document.body.classList.add("touch");
}
if(TOUCH.on) document.body.classList.add("touch");
else if(typeof matchMedia==="function"&&!matchMedia("(any-pointer: fine)").matches)
  addEventListener("touchstart",enable,{once:true,passive:true});

/* Safari's own pinch (gesture*) zooms the whole page out from under the
   HUD. Its double-tap zoom is switched off in CSS (touch-action), not here:
   swallowing a second quick touchend also swallows the click of anyone
   tapping through the menus at speed. */
for(const ev of ["gesturestart","gesturechange","gestureend"])
  document.addEventListener(ev,e=>e.preventDefault(),{passive:false});

/* ---- per-frame: the layer follows the game's state (write-on-change) ---- */
let wasLive=false;
const flag=(el,cls,on)=>{ if(el&&el.classList.contains(cls)!==on) el.classList.toggle(cls,on); };
export function updateTouch(){
  if(!TOUCH.on||!layer) return;
  const on=live();
  if(on!==wasLive){
    wasLive=on;
    flag(layer,"live",on);
    if(!on) release();               // a menu, a cutscene or a death lets go of everything
  }
  if(!on) return;
  flag(btn.use,"show",hasFocus());
  const lant=STATE.level===2&&STATE.hasLantern;
  flag(btn.light,"show",lant); flag(btn.wind,"show",lant);
  flag(btn.light,"on",lant&&STATE.lanternOn);
  flag(btn.run,"on",TOUCH.sprint);
  flag(btn.run,"spent",TOUCH.sprint&&!STATE.sprinting&&STATE.stamina<=0.02);
  flag(btn.crouch,"on",STATE.crouch);
}
