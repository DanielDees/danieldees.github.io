/* ---------------- tiny helpers ---------------- */
export const $ = id => document.getElementById(id);
export const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
export const lerp = (a,b,t)=>a+(b-a)*t;
export const angLerp=(a,b,t)=>{const d=((b-a+Math.PI*3)%(Math.PI*2))-Math.PI;return a+d*t;};
export const rand = (a,b)=>a+Math.random()*(b-a);
let RNGseed = 1337;
export function srand(){ RNGseed = (RNGseed*1103515245+12345)&0x7fffffff; return RNGseed/0x7fffffff; }
