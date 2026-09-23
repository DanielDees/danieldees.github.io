/* ---------------- GPU texture baking ----------------
   The canvas generators draw stroke by stroke on the CPU, and they top out
   at blotches and short strokes. Rock wants real noise — gradient fBm,
   cellular fracture networks, domain warping — at 1024², which is seconds
   of JavaScript and a few milliseconds of fragment shader. bakeTexture()
   renders one full-screen quad through a fragment shader into a render
   target, once, with mipmaps, and hands back the texture.

   Everything in NOISE_GLSL is PERIODIC: each call takes the lattice period
   (`per`) its coordinate wraps at, so a bake whose frequencies are whole
   numbers per tile tiles with no seam. Keep them whole.

   The octave count is baked into the function name (fbm3/4/5) on purpose.
   A loop with a variable exit is unrolled to its full bound at every call
   site by the D3D compiler ANGLE hands these to, and a surface with forty
   fBm calls took seconds to compile that way. */
import { renderer, markShared } from "./scene.js";
import { readSettings } from "./settings.js";

export const LOW_BAKE=(()=>{ const s=readSettings(); return !!(s&&s.quality==="low"); })();

export const NOISE_GLSL=`
uniform float uSeed;
vec2 h22(vec2 p){
  p+=uSeed*vec2(37.13,91.71);
  vec3 q=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973));
  q+=dot(q,q.yzx+33.33);
  return fract((q.xx+q.yz)*q.zy);
}
float h21(vec2 p){
  p+=uSeed*vec2(17.31,53.97);
  vec3 q=fract(vec3(p.xyx)*.1031);
  q+=dot(q,q.yzx+33.33);
  return fract((q.x+q.y)*q.z);
}
float _gr(vec2 i,vec2 o,vec2 f,vec2 per){ return dot(h22(mod(i+o,per))*2.0-1.0, f-o); }
/* gradient noise, about -0.7..0.7 */
float gn(vec2 p,vec2 per){
  vec2 i=floor(p), f=fract(p);
  vec2 u=f*f*f*(f*(f*6.0-15.0)+10.0);
  return mix(mix(_gr(i,vec2(0,0),f,per),_gr(i,vec2(1,0),f,per),u.x),
             mix(_gr(i,vec2(0,1),f,per),_gr(i,vec2(1,1),f,per),u.x),u.y);
}
float fbm3(vec2 p,vec2 per){ return 0.5*gn(p,per)+0.25*gn(p*2.0,per*2.0)+0.125*gn(p*4.0,per*4.0); }
float fbm4(vec2 p,vec2 per){ return fbm3(p,per)+0.0625*gn(p*8.0,per*8.0); }
float fbm5(vec2 p,vec2 per){ return fbm4(p,per)+0.03125*gn(p*16.0,per*16.0); }
/* cellular: x=F1, y=F2, z=the nearest cell's id */
vec3 cell(vec2 p,vec2 per){
  vec2 i=floor(p), f=fract(p);
  float d1=9.0, d2=9.0, id=0.0;
  for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
    vec2 o=vec2(float(x),float(y)), c=mod(i+o,per);
    vec2 r=o+h22(c+vec2(11.3,57.9))-f;
    float d=dot(r,r);
    if(d<d1){ d2=d1; d1=d; id=h21(c+13.7); } else if(d<d2) d2=d;
  }
  return vec3(sqrt(d1),sqrt(d2),id);
}
`;

const _cam=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
const _quad=new THREE.PlaneGeometry(2,2);
const _mats=new Map();
const VS="varying vec2 vUv;\nvoid main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }";
/* can we render heights at float precision? (WebGL2 + EXT_color_buffer_float) */
const FLOAT_OK=renderer.capabilities.isWebGL2&&!!renderer.extensions.get("EXT_color_buffer_float");
/* `body` must define  vec4 bake(vec2 uv).  Materials are cached by body, so
   two bakes of one body (a different seed, a different uniform) compile once.
   opts.float renders a nearest-filtered, unmipmapped float target meant to be
   read back by another bake; release it with its .bakeRT.dispose(). */
export function bakeTexture(size,body,opts={}){
  const w=size, h=opts.h||size, flt=!!opts.float;
  const rt=new THREE.WebGLRenderTarget(w,h,{
    wrapS:THREE.RepeatWrapping, wrapT:THREE.RepeatWrapping,
    type:flt&&FLOAT_OK? THREE.FloatType : THREE.UnsignedByteType,
    minFilter:flt? THREE.NearestFilter : THREE.LinearMipmapLinearFilter,
    magFilter:flt? THREE.NearestFilter : THREE.LinearFilter,
    depthBuffer:false, stencilBuffer:false});
  rt.texture.generateMipmaps=!flt;
  if(!flt) rt.texture.anisotropy=Math.min(opts.aniso||8, renderer.capabilities.getMaxAnisotropy());
  let mat=_mats.get(body);
  if(!mat){
    mat=new THREE.ShaderMaterial({uniforms:{uSeed:{value:0}}, vertexShader:VS,
      fragmentShader:"precision highp float;\nvarying vec2 vUv;\n"+NOISE_GLSL+body+
        "\nvoid main(){ gl_FragColor=bake(vUv); }",
      depthTest:false, depthWrite:false});
    _mats.set(body,mat);
  }
  mat.uniforms.uSeed.value=opts.seed!==undefined? opts.seed : Math.random()*97;
  for(const k in (opts.uniforms||{})){
    if(!mat.uniforms[k]) mat.uniforms[k]={value:null};
    mat.uniforms[k].value=opts.uniforms[k];
  }
  const sc=new THREE.Scene(); sc.add(new THREE.Mesh(_quad,mat));
  const prev=renderer.getRenderTarget();
  renderer.setRenderTarget(rt); renderer.render(sc,_cam); renderer.setRenderTarget(prev);
  rt.texture.bakeRT=rt;                        // r128 textures carry no userData
  if(!flt) markShared(rt.texture);
  return rt.texture;
}
/* the bake programs are one-shot: let them go once a set is done */
export function bakeFlush(){ for(const m of _mats.values()) m.dispose(); _mats.clear(); }
