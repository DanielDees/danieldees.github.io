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
  droneGain:null,                       // level-0 drone bed (faded out in THE END)
  spiderBedGain:null, spiderBedPan:null, // the librarian's skitter, bound in spider.js
  lib:null,                             // THE END ambience handle
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
  AU.droneGain=dg;
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

  /* faint melodic layer: slow sour phrases that never resolve.
     All of these are LEVEL 0's voice — THE END keeps its own silence. */
  const lvl0=()=>STATE.playing&&!STATE.paused&&STATE.level===0;
  setInterval(()=>{ if(lvl0()&&Math.random()<0.7) musicPhrase(); },8000);
  /* rare slow minor-chord swell underneath everything */
  setInterval(()=>{ if(lvl0()&&Math.random()<0.4) chordSwell(); },26000);
  /* secondary layers: distant air movement & a sub-bass throb */
  setInterval(()=>{ if(lvl0()&&Math.random()<0.5) airSwell(); },21000);
  setInterval(()=>{ if(lvl0()&&Math.random()<0.35) subPulse(); },33000);
  /* the drone bed slowly wanders in level so it never sits still */
  setInterval(()=>{ if(lvl0())
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
export function sfxStep(crouched,sprinting,muted=false){
  /* feet on damp carpet: a muffled brush + soft pad thump, no hard click.
     muted = THE END's thick grey-blue pile, which swallows half of it */
  if(!AU.ctx)return;
  const C=AU.ctx,t=C.currentTime;
  let peak=crouched?0.022:(sprinting?0.12:0.065);
  if(muted) peak*=0.45;
  noiseBurst(0.13, muted?150:(crouched?200:300), peak);   // low-passed fiber brush
  const o=C.createOscillator();o.type="sine";o.frequency.setValueAtTime(muted?58:74,t);
  o.frequency.exponentialRampToValueAtTime(muted?36:44,t+0.07);
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
  [[70,180,"sawtooth",0.26],[105,290,"square",0.12]].forEach(([f0,f1,type,v])=>{
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
     attack, stereo position and pitch drift, smearing into one wrong chord.
     Every wave is tilted slightly — pitch, entries, voice levels and the
     sweep band all roll fresh — so the recurring pulse never plays twice
     the same. */
  if(!AU.ctx)return; const C=AU.ctx,t=C.currentTime;
  const pk=rand(0.93,1.07);                     // per-wave pitch tilt
  const out=C.createGain(); out.gain.value=1; out.connect(AU.sfx);
  // sub pressure: swells up, then bends down and away
  const o=C.createOscillator();o.type="sine";o.frequency.setValueAtTime(30*pk,t);
  o.frequency.linearRampToValueAtTime(50*pk,t+dur*0.3);
  o.frequency.exponentialRampToValueAtTime(22*pk,t+dur);
  const g=C.createGain();env(g,t,dur*0.45,rand(0.42,0.55),dur*0.55);
  o.connect(g);g.connect(out);o.start(t);o.stop(t+dur+0.4);
  // the cluster: [freq, peak, wave, entry delay]
  [[55,0.20,"sine",0],[82.4,0.13,"triangle",0.5],[110,0.11,"sine",0.9],
   [155.6,0.085,"sine",1.5],[164.8,0.07,"triangle",2.2],[311.1,0.05,"sine",1.1],
   [466.2,0.035,"sine",2.8],[392,0.06,"sine",0.4],[415.3,0.055,"sine",0.4]
  ].forEach(([f,v,type,at])=>{
    at+=rand(0,0.35); v*=rand(0.8,1.15);
    const o2=C.createOscillator();o2.type=type;
    o2.frequency.setValueAtTime(f*pk*(1+rand(-0.008,0.008)),t+at);
    o2.frequency.linearRampToValueAtTime(f*pk*(Math.random()<0.5?0.94:1.06),t+dur);
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
  const f=C.createBiquadFilter();f.type="bandpass";f.Q.value=rand(0.9,1.4);
  f.frequency.setValueAtTime(rand(220,320),t);
  f.frequency.exponentialRampToValueAtTime(rand(2200,3100),t+dur);
  const g3=C.createGain();env(g3,t,dur*0.3,rand(0.055,0.085),dur*0.7);
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
/* ---------------- cutscene one-shots & beds ---------------- */
/* schedule a filtered noise burst at an absolute context time */
function noiseAt(t,dur,freq,peak,type="lowpass",Q=1){
  const C=AU.ctx;
  const len=Math.floor(C.sampleRate*dur), buf=C.createBuffer(1,len,C.sampleRate);
  const d=buf.getChannelData(0);
  for(let i=0;i<len;i++) d[i]=(Math.random()*2-1)*(1-i/len);
  const src=C.createBufferSource(); src.buffer=buf;
  const f=C.createBiquadFilter(); f.type=type; f.frequency.value=freq; f.Q.value=Q;
  const g=C.createGain(); g.gain.value=peak;
  src.connect(f); f.connect(g); g.connect(AU.sfx); src.start(t);
}
export function sfxBoxOpen(){
  /* sheet-metal fusebox door: latch click, then a slow rising hinge squeal */
  if(!AU.ctx)return; const C=AU.ctx,t=C.currentTime;
  noiseAt(t,0.03,2200,0.10,"highpass");
  const o=C.createOscillator();o.type="sawtooth";
  o.frequency.setValueAtTime(480,t+0.06);
  o.frequency.linearRampToValueAtTime(760,t+0.5);
  const wob=C.createOscillator();wob.frequency.value=11;
  const wg=C.createGain();wg.gain.value=42; wob.connect(wg);wg.connect(o.frequency);
  const bp=C.createBiquadFilter();bp.type="bandpass";bp.frequency.value=900;bp.Q.value=4;
  const g=C.createGain();env(g,t+0.06,0.12,0.045,0.5);
  o.connect(bp);bp.connect(g);g.connect(AU.sfx);
  o.start(t+0.06);o.stop(t+0.7);wob.start(t);wob.stop(t+0.7);
}
export function sfxBoxClose(){
  /* the door claps shut: flat metal slap + latch snap */
  if(!AU.ctx)return; const C=AU.ctx,t=C.currentTime;
  noiseAt(t,0.07,1400,0.14,"bandpass",1.2);
  const o=C.createOscillator();o.type="sine";o.frequency.setValueAtTime(150,t);
  o.frequency.exponentialRampToValueAtTime(70,t+0.1);
  const g=C.createGain();env(g,t,0.004,0.16,0.14);
  o.connect(g);g.connect(AU.sfx);o.start(t);o.stop(t+0.25);
  noiseAt(t+0.09,0.025,2600,0.07,"highpass");
}
export function sfxFuseHum(dur=1.1){
  /* the conjured fuse: a faint shimmering hum that rises as it drifts in */
  if(!AU.ctx)return; const C=AU.ctx,t=C.currentTime;
  [[330,0.045],[336,0.035],[1320,0.012]].forEach(([f,v])=>{
    const o=C.createOscillator();o.type="sine";
    o.frequency.setValueAtTime(f,t);
    o.frequency.linearRampToValueAtTime(f*1.33,t+dur);
    const trem=C.createOscillator();trem.frequency.value=8;
    const tg=C.createGain();tg.gain.value=v*0.4;
    const g=C.createGain();env(g,t,dur*0.35,v,dur*0.65);
    trem.connect(tg);tg.connect(g.gain);
    o.connect(g);g.connect(AU.sfx);
    o.start(t);o.stop(t+dur+0.2);trem.start(t);trem.stop(t+dur+0.2);
  });
}
export function sfxElevButton(){
  /* call button: dry plastic click + a short confirmation beep */
  if(!AU.ctx)return; const C=AU.ctx,t=C.currentTime;
  noiseAt(t,0.02,3000,0.12,"highpass");
  const o=C.createOscillator();o.type="square";o.frequency.value=760;
  const g=C.createGain();env(g,t+0.05,0.008,0.09,0.14);
  o.connect(g);g.connect(AU.sfx);o.start(t+0.05);o.stop(t+0.3);
}
export function sfxElevDing(){
  /* arrival bell: one bright strike with a soft overtone, long decay */
  if(!AU.ctx)return; const C=AU.ctx,t=C.currentTime;
  [[932,0.2,1.6],[1244,0.13,1.3],[1864,0.06,0.7]].forEach(([f,v,dec])=>{
    const o=C.createOscillator();o.type="sine";o.frequency.value=f;
    const g=C.createGain();env(g,t,0.004,v,dec);
    o.connect(g);g.connect(AU.sfx);o.start(t);o.stop(t+dec+0.2);
  });
}
export function sfxElevDoors(dur=1.4){
  /* doors sliding on their track: low rolling rumble that ends in a thunk */
  if(!AU.ctx)return; const C=AU.ctx,t=C.currentTime;
  const len=Math.floor(C.sampleRate*dur), buf=C.createBuffer(1,len,C.sampleRate);
  const d=buf.getChannelData(0);
  for(let i=0;i<len;i++) d[i]=Math.random()*2-1;
  const src=C.createBufferSource(); src.buffer=buf;
  const lp=C.createBiquadFilter();lp.type="lowpass";lp.frequency.value=190;
  const g=C.createGain();env(g,t,dur*0.25,0.25,dur*0.75);
  src.connect(lp);lp.connect(g);g.connect(AU.sfx);src.start(t);
  const o=C.createOscillator();o.type="sine";o.frequency.value=36;
  const g2=C.createGain();env(g2,t,dur*0.3,0.12,dur*0.7);
  o.connect(g2);g2.connect(AU.sfx);o.start(t);o.stop(t+dur+0.2);
  // the end-of-travel thunk
  const o3=C.createOscillator();o3.type="sine";o3.frequency.setValueAtTime(95,t+dur);
  o3.frequency.exponentialRampToValueAtTime(52,t+dur+0.12);
  const g3=C.createGain();env(g3,t+dur,0.005,0.18,0.18);
  o3.connect(g3);g3.connect(AU.sfx);o3.start(t+dur);o3.stop(t+dur+0.35);
  noiseAt(t+dur,0.06,500,0.14);
}
export function sfxElevThud(){
  /* something heavy slamming into the closed doors from outside — the whole
     cab rings with it */
  if(!AU.ctx)return; const C=AU.ctx,t=C.currentTime;
  const o=C.createOscillator();o.type="sine";o.frequency.setValueAtTime(70,t);
  o.frequency.exponentialRampToValueAtTime(36,t+0.22);
  const g=C.createGain();env(g,t,0.004,0.85,0.45);
  o.connect(g);g.connect(AU.sfx);o.start(t);o.stop(t+0.7);
  noiseAt(t,0.18,280,0.65);
  noiseAt(t+0.02,0.35,750,0.2,"bandpass",2.5);  // panel ring
  noiseAt(t+0.03,0.5,180,0.3);                  // shell boom
  // a second weaker hit — it claws once more
  noiseAt(t+0.45,0.14,300,0.3);
}
export function sfxElevJolt(){
  /* the cab taking up the slack as it sets off: soft mechanical lurch */
  if(!AU.ctx)return; const C=AU.ctx,t=C.currentTime;
  const o=C.createOscillator();o.type="sine";o.frequency.setValueAtTime(64,t);
  o.frequency.exponentialRampToValueAtTime(42,t+0.16);
  const g=C.createGain();env(g,t,0.006,0.3,0.3);
  o.connect(g);g.connect(AU.sfx);o.start(t);o.stop(t+0.5);
  noiseAt(t,0.08,420,0.15);
  noiseAt(t+0.05,0.03,1500,0.06,"bandpass",2);
}
export function sfxFloorBlip(f=620){
  /* a floor going by: the indicator's polite little chirp (the haywire
     phase calls it with random pitches) */
  if(!AU.ctx)return; const C=AU.ctx,t=C.currentTime;
  const o=C.createOscillator();o.type="sine";o.frequency.value=f;
  const g=C.createGain();env(g,t,0.006,0.07,0.12);
  o.connect(g);g.connect(AU.sfx);o.start(t);o.stop(t+0.2);
}
export function startElevDescend(){
  /* the cab under way: motor drone + faint cable hiss; returns a stop handle */
  if(!AU.ctx) return {stop(){}};
  const C=AU.ctx,t=C.currentTime;
  const out=C.createGain(); out.gain.setValueAtTime(0.0001,t);
  out.gain.linearRampToValueAtTime(1,t+1.2); out.connect(AU.sfx);
  const lp=C.createBiquadFilter();lp.type="lowpass";lp.frequency.value=180;
  const g=C.createGain();g.gain.value=0.12;
  lp.connect(g);g.connect(out);
  const oscs=[];
  [[44,"sawtooth"],[88.7,"sawtooth"]].forEach(([f,ty])=>{
    const o=C.createOscillator();o.type=ty;o.frequency.value=f;
    o.connect(lp);o.start();oscs.push(o);
  });
  const lfo=C.createOscillator();lfo.frequency.value=1.6;          // mechanical wow
  const lg=C.createGain();lg.gain.value=0.02;
  lfo.connect(lg);lg.connect(g.gain);lfo.start();oscs.push(lfo);
  const len=C.sampleRate*2, buf=C.createBuffer(1,len,C.sampleRate);
  const d=buf.getChannelData(0);
  for(let i=0;i<len;i++) d[i]=Math.random()*2-1;
  const src=C.createBufferSource();src.buffer=buf;src.loop=true;
  const bp=C.createBiquadFilter();bp.type="bandpass";bp.frequency.value=900;bp.Q.value=0.9;
  const hg=C.createGain();hg.gain.value=0.018;
  src.connect(bp);bp.connect(hg);hg.connect(out);src.start();oscs.push(src);
  return { stop(fade=0.8){
    const tt=C.currentTime;
    out.gain.setTargetAtTime(0.0001,tt,fade/3);
    oscs.forEach(n=>n.stop(tt+fade+0.5));
  }};
}
export function sfxElevRattle(dur=1.8){
  /* the first wrongness: loose metal chattering + a low shudder */
  if(!AU.ctx)return; const C=AU.ctx,t=C.currentTime;
  let at=0.0;
  while(at<dur){
    const k=at/dur;                                    // builds as it goes
    noiseAt(t+at, 0.025, rand(700,2000), (0.04+0.07*k)*rand(0.6,1.3), "bandpass", 2);
    at+=rand(0.035,0.1);
  }
  const o=C.createOscillator();o.type="sine";o.frequency.value=29;
  const trem=C.createOscillator();trem.frequency.value=9;
  const tg=C.createGain();tg.gain.value=0.08;
  const g=C.createGain();env(g,t,dur*0.4,0.17,dur*0.6);
  trem.connect(tg);tg.connect(g.gain);
  o.connect(g);g.connect(AU.sfx);
  o.start(t);o.stop(t+dur+0.3);trem.start(t);trem.stop(t+dur+0.3);
}
export function sfxElevGrind(dur=5.9,attack=0.7){
  /* the brakes failing: metal on metal. No smooth pitch glides (those read
     as a slide whistle) — instead, noise forced through narrow high-Q
     resonances whose centres wander in irregular steps and slowly lose
     ground, the whole screech layer chopped by a jagged stick-slip gate,
     over a dark broadband roar and a sub rumble for the cab's mass.
     Holds full force for the entire `dur`, then releases over a tail so
     the sound is still dying out after the screen has gone black. */
  if(!AU.ctx)return; const C=AU.ctx,t=C.currentTime;
  const TAIL=1.4;
  const out=C.createGain();
  out.gain.setValueAtTime(0.0001,t);
  out.gain.linearRampToValueAtTime(1,t+attack);
  out.gain.setValueAtTime(1,t+dur);
  out.gain.exponentialRampToValueAtTime(0.0001,t+dur+TAIL);
  out.connect(AU.sfx);
  const full=dur+TAIL;
  const len=Math.floor(C.sampleRate*(full+0.3)), buf=C.createBuffer(1,len,C.sampleRate);
  const d=buf.getChannelData(0);
  for(let i=0;i<len;i++) d[i]=Math.random()*2-1;
  /* stick-slip chatter: the screech grabs and releases 12–40× a second */
  const gate=C.createGain(); gate.gain.setValueAtTime(0.6,t);
  for(let gt=t;gt<t+full;gt+=rand(0.025,0.09))
    gate.gain.setValueAtTime(rand(0.25,1),gt);
  gate.connect(out);
  /* inharmonic screech partials, each wandering on its own — two extra
     voices up high so the metal really shrieks */
  [[760,0.5],[1180,0.4],[480,0.44],[1900,0.28],[2600,0.22],[3400,0.14]].forEach(([f0,v])=>{
    const src=C.createBufferSource(); src.buffer=buf;
    const bp=C.createBiquadFilter(); bp.type="bandpass"; bp.Q.value=16;
    bp.frequency.setValueAtTime(f0*rand(0.95,1.05),t);
    for(let ft=t+rand(0.1,0.3);ft<t+full;ft+=rand(0.12,0.38))
      bp.frequency.linearRampToValueAtTime(
        f0*rand(0.78,1.12)*(1-0.3*(ft-t)/full), ft);  // losing the fight, drifting down
    const g=C.createGain(); g.gain.value=v;
    src.connect(bp); bp.connect(g); g.connect(gate); src.start(t);
  });
  /* shriek stabs: every half-second or so one resonance digs in HARD */
  {
    const src=C.createBufferSource(); src.buffer=buf;
    const bp=C.createBiquadFilter(); bp.type="bandpass"; bp.Q.value=22;
    const g=C.createGain(); g.gain.setValueAtTime(0.0001,t);
    for(let st=t+rand(0.4,1.0);st<t+dur;st+=rand(0.45,1.1)){
      bp.frequency.setValueAtTime(rand(2000,3600),st);
      g.gain.setValueAtTime(0.0001,st);
      g.gain.linearRampToValueAtTime(rand(0.4,0.6),st+0.06);
      g.gain.exponentialRampToValueAtTime(0.0001,st+rand(0.3,0.6));
    }
    src.connect(bp); bp.connect(g); g.connect(out); src.start(t);
  }
  /* mass: dark broadband roar + sub rumble */
  const roar=C.createBufferSource(); roar.buffer=buf;
  const lp=C.createBiquadFilter(); lp.type="lowpass"; lp.frequency.value=260;
  const rg=C.createGain(); rg.gain.value=0.8;
  roar.connect(lp); lp.connect(rg); rg.connect(out); roar.start(t);
  const o=C.createOscillator(); o.type="sawtooth"; o.frequency.setValueAtTime(52,t);
  o.frequency.linearRampToValueAtTime(40,t+full);
  const lp2=C.createBiquadFilter(); lp2.type="lowpass"; lp2.frequency.value=150;
  const og=C.createGain(); og.gain.value=0.34;
  o.connect(lp2); lp2.connect(og); og.connect(out); o.start(t); o.stop(t+full+0.2);
}
export function sfxLightsOut(){
  /* breaker-trip clack inside the cab — the moment something gives */
  if(!AU.ctx)return; const C=AU.ctx,t=C.currentTime;
  noiseAt(t,0.06,900,0.54,"bandpass",1.5);
  noiseAt(t,0.03,2200,0.27,"highpass");           // a sharper snap on top
  const o=C.createOscillator();o.type="square";o.frequency.value=65;
  const g=C.createGain();env(g,t,0.004,0.3,0.11);
  o.connect(g);g.connect(AU.sfx);o.start(t);o.stop(t+0.18);
}
/* ================= THE END — the infinite library ================= */
/* helper: filtered noise routed through a stereo pan */
function pannedNoise(t,dur,type,freq,Q,peak,pan,attack=0.004){
  const C=AU.ctx;
  const len=Math.floor(C.sampleRate*dur), buf=C.createBuffer(1,len,C.sampleRate);
  const d=buf.getChannelData(0);
  for(let i=0;i<len;i++) d[i]=(Math.random()*2-1)*(1-i/len);
  const src=C.createBufferSource(); src.buffer=buf;
  const f=C.createBiquadFilter(); f.type=type; f.frequency.value=freq; f.Q.value=Q;
  const g=C.createGain(); env(g,t,attack,peak,dur);
  const p=C.createStereoPanner?C.createStereoPanner():null;
  src.connect(f); f.connect(g);
  if(p){p.pan.value=pan; g.connect(p); p.connect(AU.sfx);} else g.connect(AU.sfx);
  src.start(t);
  return f;
}
/* the entity folds space: a soft fog-poof of band-limited noise under a
   muted 'vvwmp' — two detuned oscillators diving an octave through a closed
   lowpass — overlaid as one event */
export function sfxTeleport(vol=1,pan=0){
  if(!AU.ctx)return; const C=AU.ctx,t=C.currentTime;
  /* the poof */
  pannedNoise(t,0.34,"bandpass",rand(360,520),1.1,vol*0.30,pan,0.02);
  pannedNoise(t+0.04,0.5,"lowpass",230,0.8,vol*0.18,pan,0.07);
  /* the vvwmp */
  const lp=C.createBiquadFilter(); lp.type="lowpass";
  lp.frequency.setValueAtTime(420,t);
  lp.frequency.exponentialRampToValueAtTime(110,t+0.45);
  const g=C.createGain(); env(g,t,0.05,vol*0.42,0.48);
  const p=C.createStereoPanner?C.createStereoPanner():null;
  lp.connect(g);
  if(p){p.pan.value=pan; g.connect(p); p.connect(AU.sfx);} else g.connect(AU.sfx);
  [[168,"sine"],[84,"triangle"]].forEach(([f0,type])=>{
    const o=C.createOscillator(); o.type=type;
    o.frequency.setValueAtTime(f0*rand(0.97,1.03),t);
    o.frequency.exponentialRampToValueAtTime(f0*0.27,t+0.42);
    o.connect(lp); o.start(t); o.stop(t+0.6);
  });
}

/* the level's resting state: sound severely muted, a faint low rumble the
   only floor under the silence — plus the librarian's skitter bed, bound to
   its position every frame by spider.js */
export function startLibraryAmbience(){
  if(!AU.ctx||AU.lib) return;
  const C=AU.ctx, t=C.currentTime;
  const lib={subs:[],thunderInt:null};
  /* rumble: looped brown-ish noise crushed to the lowest register */
  {
    const len=C.sampleRate*3, buf=C.createBuffer(1,len,C.sampleRate);
    const d=buf.getChannelData(0);
    let v=0;
    for(let i=0;i<len;i++){ v=(v+(Math.random()*2-1)*0.04)*0.985; d[i]=v*6; }
    const src=C.createBufferSource(); src.buffer=buf; src.loop=true;
    const lp=C.createBiquadFilter(); lp.type="lowpass"; lp.frequency.value=62; lp.Q.value=0.6;
    const g=C.createGain(); g.gain.setValueAtTime(0.0001,t);
    g.gain.linearRampToValueAtTime(0.156,t+4);     // pre-burnout bed +30%
    src.connect(lp); lp.connect(g); g.connect(AU.music); src.start(t);
    lib.rumbleGain=g; lib.rumbleLP=lp; lib.rumbleSrc=src;
  }
  /* the spider's chitin rustle: silent until it is close */
  {
    const len=C.sampleRate*2, buf=C.createBuffer(1,len,C.sampleRate);
    const d=buf.getChannelData(0);
    for(let i=0;i<len;i++) d[i]=Math.random()*2-1;
    const src=C.createBufferSource(); src.buffer=buf; src.loop=true;
    const bp=C.createBiquadFilter(); bp.type="bandpass"; bp.frequency.value=2500; bp.Q.value=1.4;
    const trem=C.createOscillator(); trem.frequency.value=11;
    const tg=C.createGain(); tg.gain.value=0.5;
    const mid=C.createGain(); mid.gain.value=0.5;
    trem.connect(tg); tg.connect(mid.gain); trem.start();
    const g=AU.spiderBedGain=C.createGain(); g.gain.value=0;
    const p=AU.spiderBedPan=C.createStereoPanner?C.createStereoPanner():null;
    src.connect(bp); bp.connect(mid); mid.connect(g);
    if(p){ g.connect(p); p.connect(AU.sfx); } else g.connect(AU.sfx);
    src.start();
  }
  AU.lib=lib;
}
/* after the light-drop: the rumble swells and several deep tones harmonize
   with it — a distant thunderstorm crossed with a train miles away,
   constant and unending */
export function escalateLibraryAmbience(){
  if(!AU.ctx||!AU.lib||AU.lib.escalated) return;
  const C=AU.ctx, t=C.currentTime, lib=AU.lib;
  lib.escalated=true;
  lib.rumbleGain.gain.setTargetAtTime(0.34,t,1.2);
  lib.rumbleLP.frequency.setTargetAtTime(86,t,2);
  [[30.8,"sine",0.120,0.061],[38.9,"sine",0.092,0.083],[47.3,"triangle",0.068,0.057]]
  .forEach(([f,type,v,lf])=>{
    const o=C.createOscillator(); o.type=type; o.frequency.value=f;
    const g=C.createGain(); g.gain.setValueAtTime(0.0001,t);
    g.gain.linearRampToValueAtTime(v,t+5+Math.random()*3);
    const lfo=C.createOscillator(); lfo.frequency.value=lf;     // each tone slowly breathes
    const lg=C.createGain(); lg.gain.value=v*0.45;
    lfo.connect(lg); lg.connect(g.gain); lfo.start(t);
    o.connect(g); g.connect(AU.music); o.start(t);
    lib.subs.push(o,lfo);
  });
  /* far thunder: long soft swells rolling through every so often */
  lib.thunderInt=setInterval(()=>{
    if(!STATE.playing||STATE.paused||STATE.level!==1||Math.random()<0.35) return;
    const tt=C.currentTime, dur=rand(5,9);
    const len=Math.floor(C.sampleRate*dur), buf=C.createBuffer(1,len,C.sampleRate);
    const d=buf.getChannelData(0);
    for(let i=0;i<len;i++) d[i]=Math.random()*2-1;
    const src=C.createBufferSource(); src.buffer=buf;
    const lp=C.createBiquadFilter(); lp.type="lowpass"; lp.frequency.value=rand(90,150);
    const g=C.createGain(); env(g,tt,dur*0.45,rand(0.10,0.18),dur*0.55);
    src.connect(lp); lp.connect(g); g.connect(AU.music); src.start(tt);
  },11000);
}
/* one footfall of eight: a dry tick and the smallest pad thump */
export function sfxSpiderTap(vol,pan=0){
  if(!AU.ctx||vol<=0.003) return;
  const C=AU.ctx,t=C.currentTime;
  pannedNoise(t,0.022,"bandpass",rand(2300,3500),2.4,vol*0.5,pan,0.001);
  const o=C.createOscillator();o.type="sine";o.frequency.setValueAtTime(120,t);
  o.frequency.exponentialRampToValueAtTime(64,t+0.05);
  const g=C.createGain();env(g,t,0.002,vol*0.22,0.07);
  const p=C.createStereoPanner?C.createStereoPanner():null;
  o.connect(g);
  if(p){p.pan.value=pan;g.connect(p);p.connect(AU.sfx);}else g.connect(AU.sfx);
  o.start(t);o.stop(t+0.12);
}
/* claws raked along a shelf: a few descending resonant strokes */
export function sfxSpiderScratch(vol,pan=0){
  if(!AU.ctx)return; const C=AU.ctx,t=C.currentTime;
  const n=3+Math.floor(Math.random()*3);
  for(let i=0;i<n;i++){
    const at=t+i*rand(0.12,0.2);
    const f=pannedNoise(at,rand(0.14,0.26),"bandpass",rand(1100,1700),7,vol*rand(0.5,0.8),pan,0.01);
    f.frequency.setValueAtTime(f.frequency.value,at);
    f.frequency.exponentialRampToValueAtTime(rand(500,800),at+0.2);
    /* the shelf's wooden body answering */
    const o=C.createOscillator();o.type="sine";o.frequency.value=rand(150,210);
    const g=C.createGain();env(g,at,0.01,vol*0.12,0.18);
    const p=C.createStereoPanner?C.createStereoPanner():null;
    o.connect(g);
    if(p){p.pan.value=pan;g.connect(p);p.connect(AU.sfx);}else g.connect(AU.sfx);
    o.start(at);o.stop(at+0.3);
  }
}
/* wet questioning puffs, nose to the carpet */
export function sfxSpiderSniff(vol,pan=0){
  if(!AU.ctx)return; const C=AU.ctx,t=C.currentTime;
  const n=2+Math.floor(Math.random()*2);
  for(let i=0;i<n;i++)
    pannedNoise(t+i*rand(0.16,0.24),rand(0.08,0.14),"bandpass",rand(650,1050),2.2,
      vol*(0.5-i*0.1),pan,0.02);
}
/* the shriek: a falling, splintering chord that is nothing like a voice */
export function sfxSpiderShriek(vol=1,pan=0){
  if(!AU.ctx)return; const C=AU.ctx,t=C.currentTime;
  const p=C.createStereoPanner?C.createStereoPanner():null;
  const out=C.createGain(); out.gain.value=1;
  if(p){p.pan.value=pan*0.8; out.connect(p); p.connect(AU.sfx);} else out.connect(AU.sfx);
  [[1450,330,"sawtooth",0.16],[1090,270,"sawtooth",0.13],[720,190,"square",0.08]]
  .forEach(([f0,f1,type,v])=>{
    const o=C.createOscillator();o.type=type;
    o.frequency.setValueAtTime(f0*rand(0.94,1.06),t);
    o.frequency.exponentialRampToValueAtTime(f1,t+rand(0.6,0.85));
    const bp=C.createBiquadFilter();bp.type="bandpass";bp.frequency.value=900;bp.Q.value=1.6;
    const g=C.createGain();env(g,t,0.03,v*vol,0.85);
    o.connect(bp);bp.connect(g);g.connect(out);o.start(t);o.stop(t+1.1);
  });
  /* mandible chitter under it */
  for(let i=0;i<10;i++)
    pannedNoise(t+0.05+i*0.045,0.02,"highpass",2600,1,vol*0.07*(1-i/10),pan,0.001);
}
/* silk hits the ceiling: a wet, sticky slap with a short clinging resonance */
export function sfxWebSplat(vol=0.15,pan=0){
  if(!AU.ctx)return; const C=AU.ctx,t=C.currentTime;
  pannedNoise(t,0.08,"bandpass",rand(1300,1700),1.6,vol*0.4,pan,0.004);   // tacky slap
  const o=C.createOscillator();o.type="sine";o.frequency.setValueAtTime(190,t);
  o.frequency.exponentialRampToValueAtTime(110,t+0.15);                   // the surface giving
  const g=C.createGain();env(g,t,0.01,vol*0.25,0.2);
  const p=C.createStereoPanner?C.createStereoPanner():null;
  o.connect(g);
  if(p){p.pan.value=pan;g.connect(p);p.connect(AU.sfx);}else g.connect(AU.sfx);
  o.start(t);o.stop(t+0.4);
}
/* the silk parts: a sharp pluck unwinding through a few falling pitches */
export function sfxWebSnap(vol=0.12,pan=0){
  if(!AU.ctx)return; const C=AU.ctx,t=C.currentTime;
  pannedNoise(t,0.02,"highpass",3200,1.5,vol*0.5,pan,0.001);              // the pluck
  const p=C.createStereoPanner?C.createStereoPanner():null;
  const out=C.createGain(); out.gain.value=1;
  if(p){p.pan.value=pan;out.connect(p);p.connect(AU.sfx);}else out.connect(AU.sfx);
  [[240,160],[180,110],[120,65]].forEach(([f0,f1],i)=>{
    const o=C.createOscillator();o.type="sine";
    o.frequency.setValueAtTime(f0,t+i*0.03);
    o.frequency.exponentialRampToValueAtTime(f1,t+i*0.03+0.18);
    const g=C.createGain();env(g,t+i*0.03,0.005,vol*0.08,0.25);
    o.connect(g);g.connect(out);o.start(t+i*0.03);o.stop(t+i*0.03+0.4);
  });
}
/* a floppy disk leaving its shelf: quiet — but nothing here is quiet enough */
export function sfxDiscPickup(){
  if(!AU.ctx)return; const C=AU.ctx,t=C.currentTime;
  pannedNoise(t,0.02,"highpass",2700,1,0.07,0,0.001);          // plastic click
  pannedNoise(t+0.03,0.1,"bandpass",1500,1.8,0.05,0,0.02);     // the slide off the wood
  const o=C.createOscillator();o.type="sine";o.frequency.value=540;
  const g=C.createGain();env(g,t+0.08,0.01,0.05,0.25);
  o.connect(g);g.connect(AU.sfx);o.start(t+0.08);o.stop(t+0.4);
}
/* feeding the terminal, one disk after another */
export function sfxDiscInsert(at=0){
  if(!AU.ctx)return; const C=AU.ctx,t=C.currentTime+at;
  pannedNoise(t,0.03,"bandpass",1900,2,0.10,0,0.002);          // the slot taking it
  const o=C.createOscillator();o.type="sine";o.frequency.setValueAtTime(210,t+0.04);
  o.frequency.exponentialRampToValueAtTime(120,t+0.12);
  const g=C.createGain();env(g,t+0.04,0.004,0.12,0.12);        // the clunk home
  o.connect(g);g.connect(AU.sfx);o.start(t+0.04);o.stop(t+0.25);
  const w=C.createOscillator();w.type="sawtooth";w.frequency.setValueAtTime(85,t+0.1);
  w.frequency.linearRampToValueAtTime(140,t+0.3);
  const lp=C.createBiquadFilter();lp.type="lowpass";lp.frequency.value=500;
  const wg=C.createGain();env(wg,t+0.1,0.04,0.045,0.3);        // drive motor whirr
  w.connect(lp);lp.connect(wg);wg.connect(AU.sfx);w.start(t+0.1);w.stop(t+0.55);
}
/* an old machine waking: relay click, swelling buzz, the CRT's needle whine */
export function sfxComputerBoot(vol=1){
  if(!AU.ctx)return; const C=AU.ctx,t=C.currentTime;
  pannedNoise(t,0.025,"bandpass",1600,2,0.14*vol,0,0.002);
  const o=C.createOscillator();o.type="sawtooth";o.frequency.setValueAtTime(46,t);
  o.frequency.linearRampToValueAtTime(118,t+0.9);
  const lp=C.createBiquadFilter();lp.type="lowpass";lp.frequency.value=420;
  const g=C.createGain();env(g,t,0.5,0.16*vol,1.6);
  o.connect(lp);lp.connect(g);g.connect(AU.sfx);o.start(t);o.stop(t+2.2);
  /* degauss bwomp */
  const o2=C.createOscillator();o2.type="sine";o2.frequency.setValueAtTime(190,t+0.15);
  o2.frequency.exponentialRampToValueAtTime(42,t+0.5);
  const g2=C.createGain();env(g2,t+0.15,0.01,0.13*vol,0.45);
  o2.connect(g2);g2.connect(AU.sfx);o2.start(t+0.15);o2.stop(t+0.8);
  /* the 15.7kHz line whine, just at the edge of hearing */
  const o3=C.createOscillator();o3.type="sine";o3.frequency.value=15700;
  const g3=C.createGain();env(g3,t+0.3,0.4,0.015*vol,2.2);
  o3.connect(g3);g3.connect(AU.sfx);o3.start(t+0.3);o3.stop(t+3);
}
/* …and the fading static it dies into */
export function sfxComputerStatic(dur=2,vol=1){
  if(!AU.ctx)return; const C=AU.ctx,t=C.currentTime;
  const len=Math.floor(C.sampleRate*dur), buf=C.createBuffer(1,len,C.sampleRate);
  const d=buf.getChannelData(0);
  for(let i=0;i<len;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/len,1.4);
  const src=C.createBufferSource(); src.buffer=buf;
  const hp=C.createBiquadFilter();hp.type="highpass";hp.frequency.value=500;
  const g=C.createGain();g.gain.value=0.13*vol;
  src.connect(hp);hp.connect(g);g.connect(AU.sfx);src.start(t);
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
