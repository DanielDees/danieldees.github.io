/* ---------------- THE NEST's stone: baked surfaces, mapped in world space ----------------
   The cave was dressed in 512² canvases on per-face UVs, with the colour map
   doubling as its own bump. Up close the bump showed its texels as a grid —
   bilinear height has a flat slope per texel — and the lathes wore one map
   stretched over formations from a hand's height to eighteen metres.

   Every stone surface here samples a GPU-baked set (albedo, normal, fine
   normal) by WORLD POSITION: rock and dripstone triplanar, the floor
   straight down. Nothing stretches, a stalagmite a metre tall and a column
   eighteen tall carry calcite at the same scale, and a facet you press your
   face against still has a fine map under the coarse one. The albedo's
   alpha is wetness and the normal's alpha is cavity; wetness drives the
   specular, so seeps, flowstone and puddles glisten under the lantern and
   dry rock does not.

   Built lazily on the first descent: the bakes and their programs cost a
   few hundred milliseconds, and that belongs behind the black, not on the
   start screen. */
import { bakeTexture, bakeFlush, LOW_BAKE } from "./bake.js";
import { markShared } from "./scene.js";

/* ---- limestone: a 4m tile ----
   Knobbly at the hand scale, with phreatic scallops (the spoon-shaped dishes
   moving water carves), a vertical joint set, iron and manganese staining,
   pale flowstone coats that smooth what they cover, dark wet seeps running
   straight down, and — on the WALL set only — bedding.
   Bedding is the easiest thing here to overdo. Evenly spaced dark lines at
   any contrast are planks: the first bake turned every wall into a boarded
   fence and, seen from below, every vault into a plank ceiling. So the beds
   are irregular, most of them barely there, and they read as a change of
   tone and a slight step rather than as a line; and the set the vault and
   the tops of things wear (NO_BEDS) has none at all. */
const ROCK_GLSL=`
struct RS { vec3 col; float h; float wet; float ao; };
RS rockAt(vec2 t){
  RS r;
  vec2 w=vec2(fbm4(t*3.0,vec2(3.0)), fbm4(t*3.0+vec2(5.2,1.3),vec2(3.0)));
  vec2 q=t+w*0.06;
  float mac=fbm5(q*4.0,vec2(4.0));
  float knob=fbm4(q*12.0+w*3.0,vec2(12.0));
  float ledge=0.0, bedTone=0.5;
#ifndef NO_BEDS
  float bc=q.y*7.0+fbm3(q*2.0+7.7,vec2(2.0))*1.6;
  float bid=mod(floor(bc),7.0), bf=fract(bc);
  float bedS=smoothstep(0.55,0.95,h21(vec2(bid,3.0)));
  ledge=(smoothstep(0.0,0.22,bf)-1.0)*bedS*smoothstep(-0.25,0.2,gn(vec2(q.x*5.0,bid),vec2(5.0,7.0)));
  bedTone=h21(vec2(bid,9.0));
#endif
  vec3 sc=cell(q*vec2(11.0,16.0)+w*2.0,vec2(11.0,16.0));
  float scal=smoothstep(0.0,0.8,sc.x);
  float scMask=smoothstep(-0.1,0.3,fbm3(q*2.0+3.3,vec2(2.0)));
#ifdef NO_BEDS
  vec3 fr=cell(q*vec2(3.0,3.0)+w*1.2,vec2(3.0,3.0));
#else
  vec3 fr=cell(q*vec2(5.0,1.0)+w*vec2(0.6,0.3),vec2(5.0,1.0));
#endif
  float fe=fr.y-fr.x;
  float frOpen=smoothstep(0.15,0.4,gn(q*5.0+1.7,vec2(5.0)));
  float crack=(1.0-smoothstep(0.0,0.018,fe))*frOpen;
  float lip=max(0.0,(1.0-smoothstep(0.018,0.05,fe))*frOpen-crack);
  vec3 vn=cell(q*vec2(5.0,6.0)+w*3.0+9.1,vec2(5.0,6.0));
  float vein=(1.0-smoothstep(0.0,0.010,vn.y-vn.x))*smoothstep(0.25,0.45,gn(q*3.0+4.4,vec2(3.0)));
  vec3 pt=cell(q*30.0,vec2(30.0));
  float pitZ=smoothstep(0.2,0.45,fbm3(q*3.0+17.0,vec2(3.0)));
  float pit=(1.0-smoothstep(0.0,0.10+0.14*pt.z,pt.x))*step(pt.z,0.22)*pitZ;
  float rough=fbm4(q*32.0,vec2(32.0));
  float flow=smoothstep(0.16,0.42,fbm4(vec2(q.x*6.0,q.y)+2.2,vec2(6.0,1.0))+0.18*gn(q*3.0,vec2(3.0)));
  float seepN=gn(vec2(q.x*22.0,q.y)+5.5,vec2(22.0,1.0))+0.5*gn(vec2(q.x*44.0,q.y*2.0),vec2(44.0,2.0));
  float seep=smoothstep(0.30,0.55,seepN)*smoothstep(-0.2,0.3,gn(q*2.0+8.8,vec2(2.0)));
  float h=0.55+mac*0.26+knob*0.16+ledge*0.07+(scal-0.5)*0.22*scMask+rough*0.05-crack*0.22-pit*0.08;
  h=mix(h,0.55+mac*0.24+rough*0.012,flow*0.7);
  vec3 c=mix(vec3(0.29,0.265,0.235),vec3(0.24,0.235,0.225),bedTone);
  c*=0.82+0.36*(mac+0.5);
  c=mix(c,vec3(0.20,0.21,0.22),smoothstep(0.0,0.4,fbm4(q*3.0+40.0,vec2(3.0)))*0.5);
  c=mix(c,vec3(0.36,0.25,0.16),smoothstep(0.1,0.45,fbm4(q*2.5+12.1,vec2(2.5)))*0.5);
  c=mix(c,vec3(0.09,0.085,0.08),smoothstep(0.25,0.55,fbm4(q*5.0+21.7,vec2(5.0)))*0.45);
  c*=0.88+0.24*mix(1.0,scal,scMask);
  c*=0.9+0.2*(knob+0.5);
  c=mix(c,vec3(0.08,0.075,0.07),crack*0.55);
  c+=vec3(0.07,0.065,0.06)*lip*0.5;
  c=mix(c,vec3(0.56,0.54,0.50),vein*0.6);
  c=mix(c,vec3(0.46,0.42,0.36),flow*0.7);
  c*=1.0-seep*0.32;
  c*=1.0-pit*0.35;
  c*=0.93+0.14*(rough+0.5);
  r.col=c; r.h=clamp(h,0.0,1.0);
  r.wet=clamp(seep*0.9+flow*0.45+(1.0-smoothstep(0.1,0.35,h))*0.25,0.0,1.0);
  r.ao=clamp(1.0-crack*0.7-pit*0.4-(1.0-scal)*0.3*scMask+ledge*0.25,0.0,1.0);
  return r;
}
vec4 OUT(vec2 uv,float m){ RS r=rockAt(uv); return m<0.5? vec4(r.col,r.wet) : vec4(r.h,r.ao,0.0,1.0); }`;
/* the close-up layer every stone shares: grain, granules, pinholes */
const FINE_GLSL=`
vec2 fineAt(vec2 uv){
  float g1=fbm5(uv*8.0,vec2(8.0));
  vec3 c=cell(uv*20.0,vec2(20.0));
  vec3 c2=cell(uv*46.0,vec2(46.0));
  float pits=(1.0-smoothstep(0.0,0.25,c2.x))*step(c2.z,0.25);
  float h=0.5+g1*0.45+smoothstep(0.0,0.5,c.x)*0.12-pits*0.35;
  float a=0.5+fbm3(uv*16.0+3.3,vec2(16.0))*0.8+(c.z-0.5)*0.25-pits*0.3;
  return vec2(clamp(h,0.0,1.0),clamp(a,0.0,1.0));
}
vec4 OUT(vec2 uv,float m){ return vec4(fineAt(uv),0.0,1.0); }`;
/* ---- the floor: packed silt, a 4m tile ----
   Broad damp and dry patches (the metre scale is what makes a floor look
   LAID rather than printed), sediment ripples where water last ran, gravel
   bedded in the silt, patches of polygonal drying cracks, and RIMSTONE:
   calcite dams a few centimetres high around shallow pools, pale on their
   crests and glossy with the water they hold. */
const FLOOR_GLSL=`
struct FS { vec3 col; float h; float wet; float ao; };
FS floorAt(vec2 t){
  FS f;
  vec2 w=vec2(fbm4(t*2.0,vec2(2.0)),fbm4(t*2.0+4.1,vec2(2.0)));
  vec2 q=t+w*0.08;
  float lob=fbm5(q*3.0,vec2(3.0));
  float damp=smoothstep(-0.15,0.3,fbm4(q*2.0+50.0,vec2(2.0)));
  vec3 mc=cell(q*9.0+w*2.0,vec2(9.0));
  float mudZ=smoothstep(0.22,0.42,fbm3(q*2.0+6.6,vec2(2.0)))*(1.0-damp);
  float mcr=(1.0-smoothstep(0.0,0.03,mc.y-mc.x))*mudZ*smoothstep(-0.2,0.2,gn(q*7.0+2.9,vec2(7.0)));
  float plate=smoothstep(0.02,0.3,mc.y-mc.x)*mudZ;
  vec3 gv=cell(q*40.0+w*4.0,vec2(40.0));
  float gravZ=smoothstep(0.05,0.35,fbm3(q*2.5+14.2,vec2(2.5)));
  float gs=0.14+0.36*fract(gv.z*7.3);
  float stone=(1.0-smoothstep(gs*0.55,gs,gv.x))*step(gv.z,0.42)*gravZ;
  float ripZ=smoothstep(0.1,0.4,gn(q*2.0+9.9,vec2(2.0)))*(1.0-mudZ);
  float rip=(sin(6.2831853*(q.x*11.0+q.y*14.0)+fbm3(q*4.0,vec2(4.0))*5.0)*0.5+0.5)*ripZ;
  /* rimstone: cells whose EDGES are the dams and whose centres hold water */
  vec3 rc=cell(q*vec2(7.0)+w*3.0,vec2(7.0));
  float rimZ=smoothstep(0.30,0.45,fbm3(q*1.5+71.0,vec2(1.5)));
  float rim=(1.0-smoothstep(0.0,0.07,rc.y-rc.x))*rimZ;
  float pool=smoothstep(0.08,0.16,rc.y-rc.x)*rimZ;
  float low=fbm4(q*2.0+30.3,vec2(2.0));
  float pud=max(smoothstep(0.24,0.29,low),pool*0.9);
  float grit=fbm3(q*40.0,vec2(40.0));
  float h=0.5+lob*0.28+stone*0.26+rip*0.05-mcr*0.12+grit*0.04+plate*0.02+rim*0.18;
  h=mix(h,0.30+rim*0.1,pud*(1.0-rim));
  vec3 c=mix(vec3(0.15,0.135,0.115),vec3(0.29,0.26,0.215),smoothstep(-0.35,0.45,lob));
  c*=mix(1.08,0.72,damp);
  c=mix(c,vec3(0.21,0.21,0.20),smoothstep(0.1,0.45,fbm4(q*1.5+50.0,vec2(1.5)))*0.35);
  c=mix(c,vec3(0.30,0.27,0.22),plate*0.45);
  c=mix(c,vec3(0.10,0.09,0.08),mcr*0.7);
  vec3 st=mix(vec3(0.18,0.17,0.16),vec3(0.40,0.37,0.33),fract(gv.z*13.1))*(0.75+0.45*(1.0-smoothstep(0.0,gs,gv.x)));
  c=mix(c,st,stone);
  c=mix(c,vec3(0.46,0.42,0.35),rim*0.8);
  c*=0.9+0.2*(grit+0.5);
  c=mix(c,c*0.5,pud*(1.0-rim));
  f.col=c; f.h=clamp(h,0.0,1.0);
  f.wet=clamp(pud*(1.0-rim*0.5)+damp*0.18+rim*0.35,0.0,1.0);
  f.ao=clamp(1.0-mcr*0.7-(1.0-smoothstep(gs,gs*1.5,gv.x))*step(gv.z,0.42)*gravZ*(1.0-stone)*0.5,0.0,1.0);
  return f;
}
vec4 OUT(vec2 uv,float m){ FS f=floorAt(uv); return m<0.5? vec4(f.col,f.wet) : vec4(f.h,f.ao,0.0,1.0); }`;
/* sand and grit at arm's length, for the floor's fine layer */
const GRIT_GLSL=`
vec2 gritAt(vec2 uv){
  vec3 c=cell(uv*38.0,vec2(38.0));
  vec3 c2=cell(uv*90.0,vec2(90.0));
  float grain=(1.0-smoothstep(0.1,0.6,c.x))*step(c.z,0.45);
  float sand=(1.0-smoothstep(0.1,0.55,c2.x));
  float h=0.35+grain*0.45+sand*0.15+fbm3(uv*12.0,vec2(12.0))*0.2;
  float a=0.5+(c.z-0.5)*grain*0.9+(c2.z-0.5)*0.35+fbm3(uv*6.0+2.0,vec2(6.0))*0.4;
  return vec2(clamp(h,0.0,1.0),clamp(a,0.0,1.0));
}
vec4 OUT(vec2 uv,float m){ return vec4(gritAt(uv),0.0,1.0); }`;
/* ---- dripstone: calcite, a 2m tile ----
   runnels straight down (the X/Z projections keep texture-v on world-y, so
   down the map is down the formation), growth rings as fine wavy terraces,
   popcorn nodules, iron-tinted bands; wet nearly everywhere */
const DRIP_GLSL=`
struct DS { vec3 col; float h; float wet; float ao; };
DS dripAt(vec2 t){
  DS d;
  vec2 w=vec2(fbm3(t*3.0,vec2(3.0)),fbm3(t*3.0+2.7,vec2(3.0)))*0.05;
  vec2 q=t+w;
  float run=gn(vec2(q.x*18.0,q.y),vec2(18.0,1.0))*0.6+gn(vec2(q.x*40.0,q.y*2.0),vec2(40.0,2.0))*0.4;
  float ring=sin(6.2831853*q.y*22.0+fbm3(q*vec2(4.0,2.0),vec2(4.0,2.0))*4.0)*0.5+0.5;
  vec3 pc=cell(q*24.0,vec2(24.0));
  float popZ=smoothstep(0.1,0.4,fbm3(q*3.0+5.0,vec2(3.0)));
  float pop=(1.0-smoothstep(0.1,0.5,pc.x))*step(pc.z,0.35)*popZ;
  float mac=fbm4(q*4.0,vec2(4.0));
  float h=0.5+run*0.30+ring*0.02+pop*0.18+mac*0.15;
  vec3 c=mix(vec3(0.44,0.42,0.38),vec3(0.56,0.54,0.49),smoothstep(-0.3,0.3,mac));
  c=mix(c,vec3(0.46,0.36,0.26),smoothstep(0.2,0.5,fbm3(vec2(q.x*2.0,q.y*6.0)+11.0,vec2(2.0,6.0)))*0.55);
  c*=0.84+0.26*(run+0.5);
  c*=0.97+0.03*ring;
  c=mix(c,c*1.12,pop);
  d.col=c; d.h=clamp(h,0.0,1.0);
  d.wet=clamp(0.35+smoothstep(0.0,0.45,run+0.25*mac)*0.65,0.0,1.0);
  d.ao=clamp(1.0-(1.0-smoothstep(0.35,0.5,pc.x))*popZ*0.2-(1.0-ring)*0.08,0.0,1.0);
  return d;
}
vec4 OUT(vec2 uv,float m){ DS d=dripAt(uv); return m<0.5? vec4(d.col,d.wet) : vec4(d.h,d.ao,0.0,1.0); }`;

/* one program per surface, run twice: mode 0 writes albedo + wetness, mode
   1 writes height + cavity into a FLOAT target. The normal map is then taken
   off that height by a tiny shared pass — an 8-bit height differenced would
   terrace every gentle slope into steps, and evaluating the whole surface
   four more times per texel for its normal was most of the bake. */
const BAKE_MAIN=`
uniform float uMode;
vec4 bake(vec2 uv){ return OUT(uv,uMode); }`;
const NORMAL_BODY=`
uniform sampler2D uH;
uniform vec2 uNrm;   // relief per tile (m/m), one texel in uv
vec4 bake(vec2 uv){
  float e=uNrm.y;
  float hx=texture2D(uH,uv+vec2(e,0.0)).r-texture2D(uH,uv-vec2(e,0.0)).r;
  float hy=texture2D(uH,uv+vec2(0.0,e)).r-texture2D(uH,uv-vec2(0.0,e)).r;
  vec3 n=normalize(vec3(-hx/(2.0*e)*uNrm.x,-hy/(2.0*e)*uNrm.x,1.0));
  return vec4(n*0.5+0.5,texture2D(uH,uv).g);
}`;

/* ---------------- the runtime shader ----------------
   Rides on MeshPhongMaterial so the lights, fog and the patched point-light
   loop are all three's own. The relief is a NORMAL map, not a bump: a bump
   differentiates bilinear height, which is flat across each texel, and at
   arm's length that shows every texel as a facet. Normals interpolate.
   Triplanar normals use the whiteout blend: each projection's tangent-space
   normal is swizzled onto the world axes its uv runs along (X plane: u→z,
   v→y; Y plane: u→x, v→z; Z plane: u→x, v→y) and summed by weight. */
const SURF_PARS=`
uniform sampler2D uSA; uniform sampler2D uSN; uniform sampler2D uSF;
uniform sampler2D uSAY; uniform sampler2D uSNY;   // what the up/down-facing projection wears
uniform vec4 uSP;   // tile, fine tile, coarse normal strength, fine normal strength
uniform vec4 uSQ;   // dry specular, wet darkening, fine albedo, cavity strength
uniform vec4 uSR;   // depth fade: y it starts, y it is total, strength
uniform vec3 uSDeep;
varying vec3 vCW; varying vec3 vCN;
vec3 cW; float cWet;
vec4 tri(sampler2D T,sampler2D TY,vec3 p,float s,vec3 w){
#ifdef CAVE_PLANAR
  return texture2D(TY,p.xz/s);
#else
  return texture2D(T,p.zy/s)*w.x+texture2D(TY,p.xz/s)*w.y+texture2D(T,p.xy/s)*w.z;
#endif
}
vec3 tnrm(sampler2D N,vec2 uv,vec2 fuv){
  vec4 a=texture2D(N,uv), b=texture2D(uSF,fuv);
  return vec3((a.xy*2.0-1.0)*uSP.z+(b.xy*2.0-1.0)*uSP.w, a.z*2.0-1.0);
}
`;
function surfCompile(sh){
  const s=this.userData.surf;
  sh.uniforms.uSA={value:s.A};
  sh.uniforms.uSN={value:s.N}; sh.uniforms.uSF={value:s.F};
  sh.uniforms.uSAY={value:s.AY||s.A}; sh.uniforms.uSNY={value:s.NY||s.N};
  sh.uniforms.uSP={value:new THREE.Vector4(s.tile,s.ftile,s.nA,s.nF)};
  sh.uniforms.uSQ={value:new THREE.Vector4(s.dry,s.wetDark,s.fineK,s.aoK)};
  sh.uniforms.uSR={value:new THREE.Vector4(s.fade? s.fade[0]:0, s.fade? s.fade[1]:-1, s.fade? s.fade[2]:0, 0)};
  sh.uniforms.uSDeep={value:new THREE.Color(s.deep||0x000000)};
  sh.vertexShader=sh.vertexShader
    .replace("#include <common>","#include <common>\nvarying vec3 vCW; varying vec3 vCN;")
    .replace("#include <project_vertex>",`#include <project_vertex>
  { vec4 cwp=vec4(transformed,1.0); vec3 cwn=objectNormal;
  #ifdef USE_INSTANCING
    cwp=instanceMatrix*cwp; cwn=mat3(instanceMatrix)*cwn;
  #endif
    cwp=modelMatrix*cwp; vCW=cwp.xyz; vCN=mat3(modelMatrix)*cwn; }`);
  sh.fragmentShader=sh.fragmentShader
    .replace("#include <common>","#include <common>\n"+SURF_PARS)
    .replace("#include <map_fragment>",`{
    vec3 n=normalize(vCN); cW=pow(abs(n),vec3(4.0)); cW/=cW.x+cW.y+cW.z;
    vec4 A=tri(uSA,uSAY,vCW,uSP.x,cW);
    float ao=tri(uSN,uSNY,vCW,uSP.x,cW).a;
    float fa=tri(uSF,uSF,vCW,uSP.y,cW).a;
    vec3 al=A.rgb; cWet=A.a;
    al*=mix(1.0,0.6+0.8*fa,uSQ.z);
    al*=1.0-uSQ.y*cWet;
    al*=mix(1.0,ao,uSQ.w);
    diffuseColor.rgb*=al;
  }`)
    .replace("#include <specularmap_fragment>","float specularStrength=mix(uSQ.x,1.0,cWet);")
    .replace("#include <normal_fragment_maps>",`{
    vec3 g=normalize(vCN)*faceDirection;
#ifdef CAVE_PLANAR
    vec3 tY=tnrm(uSNY,vCW.xz/uSP.x,vCW.xz/uSP.y);
    vec3 nw=normalize(vec3(tY.x+g.x, abs(tY.z)*g.y, tY.y+g.z));
#else
    vec3 tX=tnrm(uSN,vCW.zy/uSP.x,vCW.zy/uSP.y);
    vec3 tY=tnrm(uSNY,vCW.xz/uSP.x,vCW.xz/uSP.y);
    vec3 tZ=tnrm(uSN,vCW.xy/uSP.x,vCW.xy/uSP.y);
    vec3 nX=vec3(tX.xy+g.zy, abs(tX.z)*g.x);
    vec3 nY=vec3(tY.xy+g.xz, abs(tY.z)*g.y);
    vec3 nZ=vec3(tZ.xy+g.xy, abs(tZ.z)*g.z);
    vec3 nw=normalize(nX.zyx*cW.x+nY.xzy*cW.y+nZ.xyz*cW.z);
#endif
    normal=normalize(mat3(viewMatrix)*nw);
  }`)
    .replace("#include <fog_fragment>",`{ float dk=uSR.z*(1.0-smoothstep(uSR.y,uSR.x,vCW.y));
    gl_FragColor.rgb=mix(gl_FragColor.rgb,uSDeep,dk); }
  #include <fog_fragment>`);
}
function surfMat(set,o){
  const m=new THREE.MeshPhongMaterial({color:o.color!==undefined? o.color:0xffffff,
    specular:o.spec, shininess:o.shin, emissive:o.emissive||0x000000,
    side:o.side||THREE.FrontSide});
  m.defines=o.planar? {CAVE_PLANAR:""} : {};
  m.userData.surf={A:set.A, N:set.N, F:set.F, AY:set.AY, NY:set.NY, tile:o.tile, ftile:o.ftile,
    nA:o.nA===undefined? 1:o.nA, nF:o.nF===undefined? 1:o.nF,
    dry:o.dry, wetDark:o.wetDark||0, fineK:o.fineK, aoK:o.aoK, fade:o.fade, deep:o.deep};
  m.onBeforeCompile=surfCompile;
  return markShared(m);
}

let SURF=null;
export function caveSurfaces(){
  if(SURF) return SURF;
  const S=LOW_BAKE? 512:1024, SF=LOW_BAKE? 256:512;
  /* relief is in METRES over the tile, so the normals come out at the
     slope the stone actually has */
  const normal=(H,size,tile,relief)=>{
    const N=bakeTexture(size,NORMAL_BODY,{uniforms:{uH:H, uNrm:new THREE.Vector2(relief/tile,1/size)}});
    H.bakeRT.dispose();
    return N;
  };
  const set=(glsl,size,tile,relief)=>{
    const seed=Math.random()*97, body=glsl+BAKE_MAIN;
    const A=bakeTexture(size,body,{seed,uniforms:{uMode:0}});
    const H=bakeTexture(size,body,{seed,uniforms:{uMode:1},float:true});
    return {A, N:normal(H,size,tile,relief)};
  };
  const fineN=(glsl,tile,relief)=>
    normal(bakeTexture(SF,glsl+BAKE_MAIN,{uniforms:{uMode:1},float:true}),SF,tile,relief);
  const rock=set(ROCK_GLSL,S,4.0,0.24);
  const top=set("#define NO_BEDS\n"+ROCK_GLSL,S,4.0,0.24);
  rock.AY=top.A; rock.NY=top.N;
  const floor=set(FLOOR_GLSL,S,4.0,0.11);
  const drip=set(DRIP_GLSL,S,2.0,0.06);
  rock.F=drip.F=fineN(FINE_GLSL,0.9,0.006);
  floor.F=fineN(GRIT_GLSL,0.6,0.004);
  bakeFlush();
  const rockOpts={tile:4.0, ftile:0.9, spec:0x30363a, shin:30,
    dry:0.10, wetDark:0.22, fineK:0.35, aoK:0.8, emissive:0x010101};
  SURF={rock, floor, drip,
    rockMat:surfMat(rock,rockOpts),
    /* the chasm's walls: the same rock, sinking into the cold as it falls */
    pitMat:surfMat(rock,Object.assign({},rockOpts,{fade:[-1.0,-11.0,1.0], deep:0x02070a})),
    floorMat:surfMat(floor,{planar:true, tile:4.0, ftile:0.6,
      spec:0x464c50, shin:80, dry:0.0, wetDark:0, fineK:0.4, aoK:0.75}),
    dripMat:surfMat(drip,{tile:2.0, ftile:0.9, spec:0x262c30, shin:26,
      dry:0.3, wetDark:0.15, fineK:0.3, aoK:0.6, emissive:0x020303}),
    curtainMat:surfMat(drip,{tile:2.0, ftile:0.9, spec:0x22282c, shin:22,
      dry:0.3, wetDark:0.15, fineK:0.3, aoK:0.6, emissive:0x020303, side:THREE.DoubleSide}),
  };
  return SURF;
}
