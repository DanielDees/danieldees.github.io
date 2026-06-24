/* ---------------- tiny helpers ---------------- */
export const $ = id => document.getElementById(id);
export const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
export const lerp = (a,b,t)=>a+(b-a)*t;
/* shortest-arc angular lerp. The modulo is FLOORED (JS `%` keeps the sign of
   the dividend, so a naive ((b-a+3π)%2π) goes the LONG way around once the
   accumulated yaw is large/negative — which made cutscenes spin ~360° to face
   their mark). Adding 2π before the mod forces a non-negative remainder. */
export const angLerp=(a,b,t)=>{const TAU=Math.PI*2;const d=(((b-a)%TAU+TAU+Math.PI)%TAU)-Math.PI;return a+d*t;};
export const rand = (a,b)=>a+Math.random()*(b-a);
let RNGseed = 1337;
export function srand(){ RNGseed = (RNGseed*1103515245+12345)&0x7fffffff; return RNGseed/0x7fffffff; }
