/* ---------------- audio (all synthesized) ---------------- */
import { clamp, rand } from "./utils.js";
import { STATE } from "./state.js";

export const AU = {
  ctx:null, started:false,
  master:null, music:null, sfx:null,
  vol:{master:0.90, music:0.75, sound:0.90},
  humVoices:null, proxGain:null, proxOsc:null, proxPan:null,
  breathGain:null, breathPan:null,
  heartTimer:0, stepTimer:0,
};
export function applyVolumes(){
  if(!AU.ctx) return;
  const t=AU.ctx.currentTime;
  AU.master.gain.setTargetAtTime(AU.vol.master, t, 0.03);
  AU.music.gain.setTargetAtTime(AU.vol.music, t, 0.03);
  AU.sfx.gain.setTargetAtTime(AU.vol.sound, t, 0.03);
}
export function audioInit(){
  if(AU.started) return;
  AU.started=true;
  const C = AU.ctx = new (window.AudioContext||window.webkitAudioContext)();
  AU.master=C.createGain(); AU.master.connect(C.destination);
  AU.music=C.createGain();  AU.music.connect(AU.master);
  AU.sfx=C.createGain();    AU.sfx.connect(AU.master);
  applyVolumes();

  /* fluorescent buzz comes FROM the fixtures: one shared 3-layer harmonic
     source fanned out to a pool of positional voices (gain + pan each),
     bound to the nearest lights every frame in updateLights. A fixture's
     buzz dies with it when it flickers off. */
  {
    const mix=C.createGain(); mix.gain.value=1;
    [[105,"triangle",0.0202],[210,"sawtooth",0.0069],[52.5,"sine",0.016]].forEach(([f,type,g])=>{
      const o=C.createOscillator(); o.type=type; o.frequency.value=f;
      const og=C.createGain(); og.gain.value=g;
      o.connect(og); og.connect(mix); o.start();
    });
    AU.humVoices=[];
    for(let i=0;i<6;i++){
      const g=C.createGain(); g.gain.value=0;
      const p=C.createStereoPanner?C.createStereoPanner():null;
      mix.connect(g);
      if(p){ g.connect(p); p.connect(AU.sfx); } else g.connect(AU.sfx);
      AU.humVoices.push({g,p});
    }
  }

  /* drone pad (MUSIC bus) */
  const dg=C.createGain(); dg.gain.value=0.192;
  const lp=C.createBiquadFilter(); lp.type="lowpass"; lp.frequency.value=300; lp.Q.value=2;
  lp.connect(dg); dg.connect(AU.music);
  [[55,"sine",0.5],[55.7,"sine",0.4],[82.4,"triangle",0.22],[110.6,"sine",0.13]].forEach(([f,t,g])=>{
    const o=C.createOscillator(); o.type=t; o.frequency.value=f;
    const og=C.createGain(); og.gain.value=g; o.connect(og); og.connect(lp); o.start();
  });
  const lfo=C.createOscillator(); lfo.frequency.value=0.05;
  const lfoG=C.createGain(); lfoG.gain.value=160;
  lfo.connect(lfoG); lfoG.connect(lp.frequency); lfo.start();

  /* entity proximity bed (SOUND bus) — panned toward the entity each frame */
  const pg=AU.proxGain=C.createGain(); pg.gain.value=0;
  const po=AU.proxOsc=C.createOscillator(); po.type="sawtooth"; po.frequency.value=46;
  const po2=C.createOscillator(); po2.type="square"; po2.frequency.value=49.3;
  const pf=C.createBiquadFilter(); pf.type="lowpass"; pf.frequency.value=240;
  po.connect(pf); po2.connect(pf); pf.connect(pg);
  const pp=AU.proxPan=C.createStereoPanner?C.createStereoPanner():null;
  if(pp){ pg.connect(pp); pp.connect(AU.sfx); } else pg.connect(AU.sfx);
  po.start(); po2.start();

  /* entity breathing loop (SOUND bus): looped noise, slow LFO amplitude */
  {
    const len=C.sampleRate*2, buf=C.createBuffer(1,len,C.sampleRate);
    const d=buf.getChannelData(0);
    for(let i=0;i<len;i++) d[i]=Math.random()*2-1;
    const src=C.createBufferSource(); src.buffer=buf; src.loop=true;
    const bp=C.createBiquadFilter(); bp.type="bandpass"; bp.frequency.value=420; bp.Q.value=0.8;
    const breathe=C.createGain(); breathe.gain.value=0.5;
    const blfo=C.createOscillator(); blfo.frequency.value=0.45;
    const blfoG=C.createGain(); blfoG.gain.value=0.45;
    blfo.connect(blfoG); blfoG.connect(breathe.gain); blfo.start();
    const bg=AU.breathGain=C.createGain(); bg.gain.value=0;
    src.connect(bp); bp.connect(breathe); breathe.connect(bg);
    const bpan=AU.breathPan=C.createStereoPanner?C.createStereoPanner():null;
    if(bpan){ bg.connect(bpan); bpan.connect(AU.sfx); } else bg.connect(AU.sfx);
    src.start();
  }

  /* faint melodic layer: slow sour phrases that never resolve */
  setInterval(()=>{ if(STATE.playing&&!STATE.paused&&Math.random()<0.7) musicPhrase(); },8000);
  /* rare slow minor-chord swell underneath everything */
  setInterval(()=>{ if(STATE.playing&&!STATE.paused&&Math.random()<0.4) chordSwell(); },26000);
  /* secondary layers: distant air movement & a sub-bass throb */
  setInterval(()=>{ if(STATE.playing&&!STATE.paused&&Math.random()<0.5) airSwell(); },21000);
  setInterval(()=>{ if(STATE.playing&&!STATE.paused&&Math.random()<0.35) subPulse(); },33000);
  /* the drone bed slowly wanders in level so it never sits still */
  setInterval(()=>{ if(STATE.playing&&!STATE.paused)
    dg.gain.setTargetAtTime(rand(0.15,0.23), C.currentTime, 6); },18000);
}
const SCALE=[110, 130.8, 146.8, 164.8, 174.6, 220]; // A minor-ish, low
let lastNote=-1;
function playTone(f,at,peak,len,type,cutAbrupt=false){
  const C=AU.ctx,t=C.currentTime+at;
  [[0,f],[0.02,f*1.005]].forEach(([dt,fr])=>{   // two slightly detuned voices
    const o=C.createOscillator(); o.type=type; o.frequency.value=fr;
    const g=C.createGain();
    g.gain.setValueAtTime(0.0001,t+dt);
    if(cutAbrupt){ // long swell, sudden stop — feels played in reverse
      g.gain.linearRampToValueAtTime(peak,t+dt+len*0.92);
      g.gain.linearRampToValueAtTime(0.0001,t+dt+len);
    } else {
      g.gain.linearRampToValueAtTime(peak,t+dt+len*0.33);
      g.gain.exponentialRampToValueAtTime(0.0001,t+dt+len);
    }
    const p=C.createStereoPanner?C.createStereoPanner():null;
    if(p){p.pan.value=rand(-0.6,0.6);o.connect(g);g.connect(p);p.connect(AU.music);}
    else {o.connect(g);g.connect(AU.music);}
    o.start(t+dt); o.stop(t+dt+len+0.1);
  });
}
function musicPhrase(){
  const nNotes=1+Math.floor(Math.random()*3);            // 1–3 note phrases
  const octave=Math.random()<0.3?2:1;                    // sometimes a register up
  const type=Math.random()<0.35?"triangle":"sine";       // varied timbre
  const reversed=Math.random()<0.18;                     // occasional reverse-feel swell
  let at=0;
  for(let i=0;i<nNotes;i++){
    let n; do{n=Math.floor(Math.random()*SCALE.length);}while(n===lastNote);
    lastNote=n;
    const len=rand(4.5,7.5);
    playTone(SCALE[n]*octave, at, 0.054, len, type, reversed);
    if(i===0&&Math.random()<0.3)                          // occasional hollow fifth beneath
      playTone(SCALE[n]*octave*0.667, at, 0.034, len*1.2, "sine");
    if(Math.random()<0.15)                                // rare grinding minor-second shadow
      playTone(SCALE[n]*octave*1.06, at+0.3, 0.024, len*0.8, "sine");
    at+=rand(1.2,2.4);
  }
}
function chordSwell(){
  // root + minor third + fifth, very quiet, ~10s swell — unease, not melody
  const root=SCALE[Math.floor(Math.random()*3)];        // keep it low
  [[1,0.030],[1.189,0.022],[1.498,0.025]].forEach(([ratio,v])=>{
    playTone(root*ratio, rand(0,0.6), v, rand(8,11), "sine");
  });
}
function airSwell(){
  /* distant air handling waking up: a quiet band of noise that drifts across the stereo field */
  const C=AU.ctx,t=C.currentTime, dur=rand(6,11);
  const len=Math.floor(C.sampleRate*dur), buf=C.createBuffer(1,len,C.sampleRate);
  const d=buf.getChannelData(0);
  for(let i=0;i<len;i++) d[i]=Math.random()*2-1;
  const src=C.createBufferSource(); src.buffer=buf;
  const bp=C.createBiquadFilter(); bp.type="bandpass"; bp.Q.value=1.4;
  bp.frequency.setValueAtTime(rand(2200,3800),t);
  bp.frequency.linearRampToValueAtTime(rand(1200,5200),t+dur);   // the band drifts
  const g=C.createGain(); env(g,t,dur*0.45,rand(0.012,0.022),dur*0.55);
  const p=C.createStereoPanner?C.createStereoPanner():null;
  if(p){p.pan.setValueAtTime(rand(-0.8,0.8),t);p.pan.linearRampToValueAtTime(rand(-0.8,0.8),t+dur);
    src.connect(bp);bp.connect(g);g.connect(p);p.connect(AU.music);}
  else {src.connect(bp);bp.connect(g);g.connect(AU.music);}
  src.start(t);
}
function subPulse(){
  /* something enormous, floors away: a slow sub-bass throb that swells and fades */
  const C=AU.ctx,t=C.currentTime, dur=rand(7,12);
  const o=C.createOscillator(); o.type="sine"; o.frequency.value=rand(34,44);
  const throb=C.createGain(); throb.gain.value=0.5;
  const lfo=C.createOscillator(); lfo.frequency.value=rand(0.7,1.3);
  const lfoG=C.createGain(); lfoG.gain.value=0.45;
  lfo.connect(lfoG); lfoG.connect(throb.gain);
  const g=C.createGain(); env(g,t,dur*0.4,0.05,dur*0.6);
  o.connect(throb); throb.connect(g); g.connect(AU.music);
  o.start(t); o.stop(t+dur+0.5); lfo.start(t); lfo.stop(t+dur+0.5);
}
function env(g,t0,a,peak,d){
  g.gain.cancelScheduledValues(t0); g.gain.setValueAtTime(0.0001,t0);
  g.gain.linearRampToValueAtTime(peak,t0+a); g.gain.exponentialRampToValueAtTime(0.0001,t0+a+d);
}
function noiseBurst(dur,filterFreq,peak,type="lowpass"){
  if(!AU.ctx) return;
  const C=AU.ctx,t=C.currentTime;
  const len=Math.floor(C.sampleRate*dur), buf=C.createBuffer(1,len,C.sampleRate);
  const d=buf.getChannelData(0);
  for(let i=0;i<len;i++) d[i]=(Math.random()*2-1)*(1-i/len);
  const src=C.createBufferSource(); src.buffer=buf;
  const f=C.createBiquadFilter(); f.type=type; f.frequency.value=filterFreq;
  const g=C.createGain(); g.gain.value=peak;
  src.connect(f); f.connect(g); g.connect(AU.sfx); src.start(t);
}
export function sfxStep(crouched,sprinting){
  /* feet on damp carpet: a muffled brush + soft pad thump, no hard click */
  if(!AU.ctx)return;
  const C=AU.ctx,t=C.currentTime;
  const peak=crouched?0.022:(sprinting?0.12:0.065);
  noiseBurst(0.13, crouched?200:300, peak);          // low-passed fiber brush
  const o=C.createOscillator();o.type="sine";o.frequency.setValueAtTime(74,t);
  o.frequency.exponentialRampToValueAtTime(44,t+0.07);
  const g=C.createGain();env(g,t,0.005,peak*0.5,0.1);
  o.connect(g);g.connect(AU.sfx);o.start(t);o.stop(t+0.18);
}
export function sfxJump(){ noiseBurst(0.07,700,0.06); }
export function sfxLand(){
  noiseBurst(0.12,420,0.13);
  if(!AU.ctx)return; const C=AU.ctx,t=C.currentTime;
  const o=C.createOscillator();o.type="sine";o.frequency.setValueAtTime(90,t);
  o.frequency.exponentialRampToValueAtTime(50,t+0.1);
  const g=C.createGain();env(g,t,0.004,0.08,0.12);o.connect(g);g.connect(AU.sfx);o.start(t);o.stop(t+0.2);
}
export function sfxPickup(){
  if(!AU.ctx)return; const C=AU.ctx,t=C.currentTime;
  [660,880,1320].forEach((f,i)=>{const o=C.createOscillator();o.type="sine";o.frequency.value=f;
    const g=C.createGain();env(g,t+i*0.07,0.01,0.12,0.35);o.connect(g);g.connect(AU.sfx);o.start(t+i*0.07);o.stop(t+i*0.07+0.5);});
}
export function sfxClunk(){
  noiseBurst(0.25,300,0.4);
  if(!AU.ctx)return;
  const C=AU.ctx,t=C.currentTime,o=C.createOscillator();o.type="square";o.frequency.value=70;
  o.frequency.exponentialRampToValueAtTime(40,t+0.3);
  const g=C.createGain();env(g,t,0.005,0.3,0.35);o.connect(g);g.connect(AU.sfx);o.start(t);o.stop(t+0.5);
}
export function sfxPowerOn(){
  if(!AU.ctx)return; const C=AU.ctx,t=C.currentTime;
  const o=C.createOscillator();o.type="sawtooth";o.frequency.setValueAtTime(60,t);
  o.frequency.exponentialRampToValueAtTime(240,t+1.2);
  const g=C.createGain();env(g,t,0.4,0.2,1.4);
  const f=C.createBiquadFilter();f.type="lowpass";f.frequency.value=800;
  o.connect(f);f.connect(g);g.connect(AU.sfx);o.start(t);o.stop(t+2);
}
export function sfxAlert(pan=0){ // the entity notices you: short guttural rising cry
  if(!AU.ctx)return; const C=AU.ctx,t=C.currentTime;
  const p=C.createStereoPanner?C.createStereoPanner():null;
  const out=C.createGain(); out.gain.value=1;
  if(p){p.pan.value=pan*0.8; out.connect(p); p.connect(AU.sfx);} else out.connect(AU.sfx);
  [[70,180,"sawtooth",0.22],[105,290,"square",0.10]].forEach(([f0,f1,type,v])=>{
    const o=C.createOscillator();o.type=type;
    o.frequency.setValueAtTime(f0,t);
    o.frequency.exponentialRampToValueAtTime(f1,t+0.55);
    const bp=C.createBiquadFilter();bp.type="bandpass";bp.frequency.value=300;bp.Q.value=2.5;
    const g=C.createGain();env(g,t,0.05,v,0.75);
    o.connect(bp);bp.connect(g);g.connect(out);o.start(t);o.stop(t+1);
  });
  noiseBurst(0.4,1200,0.08,"highpass");
}
export function sfxStinger(){ // the chase begins
  if(!AU.ctx)return; const C=AU.ctx,t=C.currentTime;
  for(let i=0;i<4;i++){
    const o=C.createOscillator();o.type="sawtooth";
    o.frequency.setValueAtTime(rand(400,700)+i*180,t);
    o.frequency.exponentialRampToValueAtTime(rand(900,1600)+i*220,t+0.7);
    const g=C.createGain();env(g,t,0.03,0.10,0.9);
    o.connect(g);g.connect(AU.sfx);o.start(t);o.stop(t+1.2);
  }
  noiseBurst(0.6,2400,0.18,"highpass");
}
export function sfxGroan(vol,pan=0){ // distant wandering vocalization, panned to its source
  if(!AU.ctx)return; const C=AU.ctx,t=C.currentTime;
  const o=C.createOscillator();o.type="sawtooth";
  o.frequency.setValueAtTime(rand(64,86),t);
  o.frequency.exponentialRampToValueAtTime(rand(40,52),t+1.4);
  const o2=C.createOscillator();o2.type="triangle";o2.frequency.value=rand(96,130);
  const bp=C.createBiquadFilter();bp.type="bandpass";bp.frequency.value=210;bp.Q.value=3.5;
  const g=C.createGain();env(g,t,0.18,vol,1.6);
  const p=C.createStereoPanner?C.createStereoPanner():null;
  o.connect(bp);o2.connect(bp);bp.connect(g);
  if(p){p.pan.value=pan; g.connect(p); p.connect(AU.sfx);} else g.connect(AU.sfx);
  o.start(t);o.stop(t+2);o2.start(t);o2.stop(t+2);
}
export function sfxShockwave(dur=9){
  /* the wake announcement, held for as long as the light ring travels:
     a deep pressure swell under a staggered cluster of detuned voices —
     minor seconds and tritones across four octaves, each with its own slow
     attack, stereo position and pitch drift, smearing into one wrong chord */
  if(!AU.ctx)return; const C=AU.ctx,t=C.currentTime;
  const out=C.createGain(); out.gain.value=1; out.connect(AU.sfx);
  // sub pressure: swells up, then bends down and away
  const o=C.createOscillator();o.type="sine";o.frequency.setValueAtTime(30,t);
  o.frequency.linearRampToValueAtTime(50,t+dur*0.3);
  o.frequency.exponentialRampToValueAtTime(22,t+dur);
  const g=C.createGain();env(g,t,dur*0.45,0.5,dur*0.55);
  o.connect(g);g.connect(out);o.start(t);o.stop(t+dur+0.4);
  // the cluster: [freq, peak, wave, entry delay]
  [[55,0.20,"sine",0],[82.4,0.13,"triangle",0.5],[110,0.11,"sine",0.9],
   [155.6,0.085,"sine",1.5],[164.8,0.07,"triangle",2.2],[311.1,0.05,"sine",1.1],
   [466.2,0.035,"sine",2.8],[392,0.06,"sine",0.4],[415.3,0.055,"sine",0.4]
  ].forEach(([f,v,type,at])=>{
    const o2=C.createOscillator();o2.type=type;
    o2.frequency.setValueAtTime(f*(1+rand(-0.008,0.008)),t+at);
    o2.frequency.linearRampToValueAtTime(f*(Math.random()<0.5?0.94:1.06),t+dur);
    const g2=C.createGain();env(g2,t+at,(dur-at)*0.65,v,(dur-at)*0.35);   // rises late, holds through the sweep
    const p2=C.createStereoPanner?C.createStereoPanner():null;
    o2.connect(g2);
    if(p2){p2.pan.value=rand(-0.7,0.7);g2.connect(p2);p2.connect(out);}
    else g2.connect(out);
    o2.start(t+at);o2.stop(t+dur+0.4);
  });
  // airy rising sweep across the whole span
  const len=Math.floor(C.sampleRate*dur),buf=C.createBuffer(1,len,C.sampleRate);
  const d=buf.getChannelData(0);for(let i=0;i<len;i++)d[i]=Math.random()*2-1;
  const src=C.createBufferSource();src.buffer=buf;
  const f=C.createBiquadFilter();f.type="bandpass";f.Q.value=1.1;
  f.frequency.setValueAtTime(260,t);f.frequency.exponentialRampToValueAtTime(2600,t+dur);
  const g3=C.createGain();env(g3,t,dur*0.3,0.07,dur*0.7);
  src.connect(f);f.connect(g3);g3.connect(out);src.start(t);
}
export function sfxDeath(){
  if(!AU.ctx)return; const C=AU.ctx,t=C.currentTime;
  const o=C.createOscillator();o.type="sawtooth";o.frequency.setValueAtTime(300,t);
  o.frequency.exponentialRampToValueAtTime(35,t+1.4);
  const g=C.createGain();env(g,t,0.01,0.5,1.6);
  o.connect(g);g.connect(AU.sfx);o.start(t);o.stop(t+2);
  noiseBurst(1.0,500,0.5);
}
export function sfxHeartbeat(){
  if(!AU.ctx)return; const C=AU.ctx,t=C.currentTime;
  [[0,0.4],[0.18,0.28]].forEach(([dt,v])=>{
    const o=C.createOscillator();o.type="sine";o.frequency.setValueAtTime(55,t+dt);
    o.frequency.exponentialRampToValueAtTime(38,t+dt+0.12);
    const g=C.createGain();env(g,t+dt,0.005,v,0.16);
    o.connect(g);g.connect(AU.sfx);o.start(t+dt);o.stop(t+dt+0.3);
  });
}
export function sfxDoor(){
  noiseBurst(0.9,180,0.3);
  if(!AU.ctx)return;
  const C=AU.ctx,t=C.currentTime,o=C.createOscillator();o.type="sawtooth";
  o.frequency.setValueAtTime(90,t);o.frequency.linearRampToValueAtTime(160,t+0.9);
  const g=C.createGain();env(g,t,0.05,0.07,1.0);o.connect(g);g.connect(AU.sfx);o.start(t);o.stop(t+1.2);
}
export function panTo(x,z){
  /* stereo pan (-1..1) of a world point relative to where the player is facing.
     A sub-linear power curve widens oblique angles: raw sin clusters
     anything not hard-left/right near the centre, which made sources
     hard to localize. */
  const rel=((Math.atan2(x-STATE.pos.x,z-STATE.pos.z)-(STATE.yaw+Math.PI))%(Math.PI*2)+Math.PI*3)%(Math.PI*2)-Math.PI;
  const s=Math.sin(rel);
  return clamp(-Math.sign(s)*Math.pow(Math.abs(s),0.62),-1,1)*0.95;
}
export function sfxFlickTick(vol,pan){
  /* fluorescent ballast tick: tiny band-passed static snap, panned to the fixture */
  if(!AU.ctx)return; const C=AU.ctx,t=C.currentTime;
  const len=Math.floor(C.sampleRate*0.025), buf=C.createBuffer(1,len,C.sampleRate);
  const d=buf.getChannelData(0); for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*(1-i/len);
  const src=C.createBufferSource(); src.buffer=buf;
  const f=C.createBiquadFilter(); f.type="bandpass"; f.frequency.value=rand(1700,3300); f.Q.value=2.2;
  const g=C.createGain(); g.gain.value=vol;
  const p=C.createStereoPanner?C.createStereoPanner():null;
  src.connect(f); f.connect(g);
  if(p){p.pan.value=pan; g.connect(p); p.connect(AU.sfx);} else g.connect(AU.sfx);
  src.start(t);
}
export function sfxKnock(vol,raps,pan=0){
  /* knuckles on wood/drywall: two fast-decaying mid partials + a sharp tap,
     rather than a bassy thump */
  if(!AU.ctx)return; const C=AU.ctx;
  const p=C.createStereoPanner?C.createStereoPanner():null;
  const out=C.createGain(); out.gain.value=1;
  if(p){p.pan.value=pan; out.connect(p); p.connect(AU.sfx);} else out.connect(AU.sfx);
  for(let i=0;i<raps;i++){
    const t=C.currentTime + 0.05 + i*0.27 + rand(-0.02,0.03);
    // wood body resonances — short, dry
    [[185+rand(-12,18),0.9,0.075],[322+rand(-20,28),0.5,0.05],[96,0.3,0.09]].forEach(([f,v,dec])=>{
      const o=C.createOscillator();o.type="sine";o.frequency.setValueAtTime(f,t);
      o.frequency.exponentialRampToValueAtTime(f*0.92,t+dec);
      const g=C.createGain();env(g,t,0.002,vol*v,dec);
      o.connect(g);g.connect(out);o.start(t);o.stop(t+dec+0.08);
    });
    // sharp tap transient
    const len=Math.floor(C.sampleRate*0.018), buf=C.createBuffer(1,len,C.sampleRate);
    const dd=buf.getChannelData(0); for(let j=0;j<len;j++)dd[j]=(Math.random()*2-1)*(1-j/len);
    const src=C.createBufferSource();src.buffer=buf;
    const f=C.createBiquadFilter();f.type="bandpass";f.frequency.value=1350;f.Q.value=1.4;
    const g2=C.createGain();g2.gain.value=vol*0.7;
    src.connect(f);f.connect(g2);g2.connect(out);src.start(t);
  }
}
