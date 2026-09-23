/* ---------------- procedural textures ---------------- */
import { readSettings } from "./settings.js";
/* the few maps big enough to matter drop a size on the low graphics setting */
const LOW_TEX=(()=>{ const s=readSettings(); return !!(s&&s.quality==="low"); })();
export function makeCanvas(w,h,fn){const c=document.createElement("canvas");c.width=w;c.height=h;fn(c.getContext("2d"),w,h);
  const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;return t;}


/* signed per-pixel grain without reading the canvas back: the positive half
   is ADDED (lighter) and the negative half taken away (difference, exact while
   every pixel is brighter than the grain is deep). Reading a 2048² GPU canvas
   back to walk it pixel by pixel was nine-tenths of the wallpaper's startup
   cost. The grain is one 512² block of white noise laid edge to edge — noise
   has no feature to repeat. `amp` is the full spread per channel. */
function addGrain(g,w,h,amp){
  const T=Math.min(512,w), mk=()=>{ const c=document.createElement("canvas"); c.width=c.height=T; return c; };
  const pc=mk(), nc=mk(), pi=pc.getContext("2d").createImageData(T,T), ni=nc.getContext("2d").createImageData(T,T);
  const P=pi.data, N=ni.data;
  for(let i=0;i<P.length;i+=4){
    const n=Math.random()-0.5;
    for(let c=0;c<3;c++){ const v=Math.round(n*amp[c]); P[i+c]=v>0?v:0; N[i+c]=v<0?-v:0; }
    P[i+3]=N[i+3]=255;
  }
  pc.getContext("2d").putImageData(pi,0,0); nc.getContext("2d").putImageData(ni,0,0);
  g.save();
  g.globalCompositeOperation="lighter";    g.fillStyle=g.createPattern(pc,"repeat"); g.fillRect(0,0,w,h);
  g.globalCompositeOperation="difference"; g.fillStyle=g.createPattern(nc,"repeat"); g.fillRect(0,0,w,h);
  g.restore();
}
/* ================= LEVEL 0 — the yellow backrooms =================
   These three maps were rebuilt once before with drops, seams, batch tones,
   berber flecks, tide rings and printed grime, and every one of those came
   out as a defect — veneered plywood, ceramic tile, crop circles — and went
   back to the originals. So this pass keeps the originals' DESIGN exactly
   (the same eight stripes, the same mottle and fleck, the same stains) and
   raises only the resolution and the MATERIAL: what paper, print and pile
   look like up close. Anything nameable that would repeat every four metres
   down a corridor is still forbidden. */
/* the wall: 2048² over one 4m face, 512 px/m (the original was 64; 1024² on
   the low setting). The eight stripes are the original's; what is new is
   what real wallpaper has and a drawn wall does not — a faint PRINT (a
   floral sprig on a half-drop in the pale stripes, a double pinstripe in the
   dark ones, at a contrast that averages out to the plain stripe from across
   a room), the paper's tooth, dirt that is SOFT, a skirting with a lip, and
   the ceiling's wall angle along the top. Every horizontal pitch divides the
   canvas, so the print runs unbroken from one wall box into the next.
   No mark in here is a filled shape with an edge: at this resolution a
   solid dab is a visible rectangle or oval from a metre away, so dirt is
   radial falloff and the grain is a per-pixel pass. */
export const texWall = makeCanvas(LOW_TEX?1024:2048, LOW_TEX?1024:2048, (g,w,h)=>{
  const S=w/256, K=w/1024, SK=14*S, WA=7*K;        // skirting, wall-angle heights (px)
  g.fillStyle="#b3a04a";g.fillRect(0,0,w,h);
  for(let x=0;x<w;x+=32*S){ if((x/(32*S))%2){ g.fillStyle="#a99440"; g.fillRect(x,0,32*S,h); } }
  /* the print, drawn in 1024-canvas units and scaled: FIVE rounded petals,
     one pointing up. A four-petal rosette turned 45° is an X, and columns of
     little X's down a wall in this place read as a message, not a paper. */
  /* a sprig spans −8.2…+15 of its own units: top/bot keep the petals off the
     wall angle and the stem out of the skirting */
  const PK=2.25*K, P=101*K, top=WA+24*K, bot=h-SK-40*K;
  const sprig=(x,y,a)=>{
    g.save(); g.translate(x+(Math.random()-0.5)*1.4*K,y+(Math.random()-0.5)*1.4*K); g.scale(PK,PK);
    g.fillStyle=`rgba(118,96,34,${a})`;
    for(let k=0;k<5;k++){
      g.save(); g.rotate(k*Math.PI*2/5);
      g.beginPath(); g.ellipse(0,-4.6,3.0,3.6,0,0,7); g.fill(); g.restore();
    }
    g.beginPath(); g.moveTo(0,5.5); g.quadraticCurveTo(2.2,10,0.6,15);
    g.lineWidth=1.1; g.strokeStyle=`rgba(118,96,34,${a*0.9})`; g.stroke();
    g.beginPath(); g.ellipse(3.4,11,1.7,3.4,0.95,0,7); g.fill();   // one leaf, on the stem's outer curve
    g.fillStyle=`rgba(226,208,138,${a*1.1})`;      // the pale eye of it
    g.beginPath(); g.arc(0,0,1.8,0,7); g.fill();
    g.restore();
  };
  for(let i=0;i<8;i+=2){
    const cx=i*32*S+16*S, off=((i/2)%2)*P/2;
    for(let y=top+off;y<bot;y+=P){
      sprig(cx,y,0.10+Math.random()*0.035);
      const da=0.08+Math.random()*0.03, dx=(Math.random()-0.5)*K;
      if(y+P/2<h-SK-8*K){
        g.fillStyle=`rgba(118,96,34,${da})`;                          // the dot between
        g.beginPath(); g.arc(cx+dx,y+P/2,1.4*PK,0,7); g.fill();
      }
    }
  }
  for(let i=1;i<8;i+=2){
    for(const dx of[40,44,84,88]){
      g.fillStyle="rgba(206,186,106,0.075)";
      g.fillRect(i*32*S+dx*K,0,1.6*K,h);
    }
  }
  /* dirt: soft spots and faint vertical runs, all radial falloff */
  const blot=(x,y,r,ey,rgba)=>{
    g.save(); g.translate(x,y); g.scale(1,ey);
    const gr=g.createRadialGradient(0,0,0,0,0,r);
    gr.addColorStop(0,rgba); gr.addColorStop(1,"rgba(0,0,0,0)");
    g.fillStyle=gr; g.beginPath(); g.arc(0,0,r,0,7); g.fill(); g.restore();
  };
  for(let i=0;i<1600;i++)
    blot(Math.random()*w,Math.random()*h,(1.5+Math.random()*7)*K,1+Math.random()*2.2,
      `rgba(${60+Math.random()*40|0},${50+Math.random()*35|0},20,${0.02+Math.random()*0.05})`);
  for(let i=0;i<7;i++)
    blot(Math.random()*w,Math.random()*h,(20+Math.random()*40)*S,1,"rgba(70,58,20,0.18)");
  /* floor dirt kicked up the bottom of the paper */
  const kick=g.createLinearGradient(0,h-SK-70*K,0,h-SK);
  kick.addColorStop(0,"rgba(58,46,16,0)");kick.addColorStop(1,"rgba(58,46,16,0.20)");
  g.fillStyle=kick;g.fillRect(0,h-SK-70*K,w,70*K);
  /* the skirting: the original band, with the lip its top edge catches the
     light on and the shadow under that lip */
  g.fillStyle="rgba(40,32,12,.35)";g.fillRect(0,h-SK,w,SK);
  g.fillStyle="rgba(214,196,128,0.22)";g.fillRect(0,h-SK,w,2*K);
  g.fillStyle="rgba(24,18,6,0.28)";g.fillRect(0,h-SK+2*K,w,4*K);
  /* scuffs: rubber dragged along it by shoes — a streak, darkest in the
     middle, gone at both ends. Filled ovals here read as a row of spots. */
  g.lineCap="round";
  for(let i=0;i<46;i++){
    const x=Math.random()*w, y=h-SK+10*K+Math.random()*(SK-16*K), l=(14+Math.random()*50)*K;
    const lt=Math.random()<0.3, a=lt? 0.04+Math.random()*0.05 : 0.05+Math.random()*0.09;
    const c=lt? "150,132,80":"14,10,4";
    const gr=g.createLinearGradient(x-l/2,0,x+l/2,0);
    gr.addColorStop(0,`rgba(${c},0)`);gr.addColorStop(0.5,`rgba(${c},${a})`);gr.addColorStop(1,`rgba(${c},0)`);
    g.strokeStyle=gr; g.lineWidth=(1.5+Math.random()*3.5)*K;
    g.beginPath(); g.moveTo(x-l/2,y+(Math.random()-0.5)*3*K); g.lineTo(x+l/2,y+(Math.random()-0.5)*3*K); g.stroke();
  }
  /* the wall angle: the drop ceiling's L-trim, and the dust that settles
     in the shadow just under it */
  g.fillStyle="#b3a98c";g.fillRect(0,0,w,WA);
  g.fillStyle="rgba(255,250,228,0.25)";g.fillRect(0,WA-2*K,w,K);
  g.fillStyle="rgba(40,34,18,0.45)";g.fillRect(0,WA,w,1.5*K);
  const dust=g.createLinearGradient(0,WA,0,WA+26*K);
  dust.addColorStop(0,"rgba(62,52,24,0.22)");dust.addColorStop(1,"rgba(62,52,24,0)");
  g.fillStyle=dust;g.fillRect(0,WA,w,26*K);
  /* the paper's tooth: a per-pixel grain, finer than any drawn mark */
  addGrain(g,w,h,[9,9,5.4]);
});
/* ---- the carpet ----
   Also back to the original — flat mustard, a fine speckle, eleven soft
   stains, 512² over an 8m tile. The upgrade attempt on this floor went the
   whole way to ceramic tile before it came back, and what it proved is only
   what the floor must NOT have: no half-metre lattice, no tuft grid, no
   embossed grout in a bump map, no pale flecks (that is terrazzo aggregate),
   no roll seam.
   What the original is genuinely missing is not detail, it is VARIATION. An
   even speckle at one alpha over one flat colour is a product swatch; what
   makes a floor look LAID is that it is blotchy at the metre scale and the
   yarn is flecked rather than flipped between two values. Those two things,
   and nothing else, are the difference from the original here. */
export const texCarpet = makeCanvas(512,512,(g,w,h)=>{
  g.fillStyle="#7a6c35";g.fillRect(0,0,w,h);
  /* the broad mottle goes down FIRST: traffic lanes, old damp and thirty
     years of one bulb over one patch, at 0.6–2.5m across. Stamped wrapped so
     nothing ends at the tile seam. */
  for(let i=0;i<54;i++){
    const x=Math.random()*w, y=Math.random()*h, r=40+Math.random()*120;
    const col=Math.random()<0.45? "146,132,78":"48,41,17";
    const a=0.05+Math.random()*0.07;
    for(const ox of[-w,0,w])for(const oy of[-h,0,h]){
      if(Math.abs(x+ox-w/2)>w/2+r || Math.abs(y+oy-h/2)>h/2+r) continue;
      const gr=g.createRadialGradient(x+ox,y+oy,2,x+ox,y+oy,r);
      gr.addColorStop(0,`rgba(${col},${a})`);gr.addColorStop(1,`rgba(${col},0)`);
      g.fillStyle=gr;g.fillRect(x+ox-r,y+oy-r,r*2,r*2);
    }
  }
  /* the pile: the original's scatter, with the yarn flecked across five tones
     instead of flipped between two. The brightest stays 120 short of white and
     the darkest well short of black — at 64 px/m a 2px dab is 3cm of floor, so
     a hard dark speck at that size is not a fibre, it is GRIT, and the whole
     floor goes over to wet sand. The metre-scale mottle above carries the
     variation; the fleck only has to break the field. */
  const YARN=["58,50,22","110,96,46","76,66,30","128,114,58","92,78,34"];
  for(let i=0;i<30000;i++){
    const s=1.0+Math.random()*1.5;
    g.fillStyle=`rgba(${YARN[(Math.random()*YARN.length)|0]},${0.13+Math.random()*0.14})`;
    g.fillRect(Math.random()*w,Math.random()*h,s,s);
  }
  /* varied stains: random rotation, squash, size, and strength */
  for(let i=0;i<11;i++){
    const x=Math.random()*w,y=Math.random()*h,r=18+Math.random()*70;
    g.save();g.translate(x,y);g.rotate(Math.random()*Math.PI);g.scale(1,0.45+Math.random()*0.9);
    const a=0.10+Math.random()*0.22;
    const gr=g.createRadialGradient(0,0,2,0,0,r);
    gr.addColorStop(0,`rgba(35,28,8,${a})`);gr.addColorStop(1,"rgba(35,28,8,0)");
    g.fillStyle=gr;g.fillRect(-r,-r,r*2,r*2);g.restore();
  }
});
/* ---- the pile ----
   Why the upgraded carpet read as sealed concrete: a sharper colour map and
   a damp SHEEN is exactly what a smooth, sealed floor is — and carpet has no
   sheen at all; it has DEPTH, a field of tuft tips catching light over dark
   gaps between them. This is that field: a 0.5m tile (512 px/m) of tufts
   that the floor shader (scene.js) both multiplies into the colour and uses
   as its bump map, at its own fine repeat over the original carpet. It
   carries no colour and no feature, and past a few metres the mip chain
   averages it to its mean, which the shader divides back out — so from
   across a room the floor is exactly the original. */
export const texCarpetPile = makeCanvas(256,256,(g,w,h)=>{
  g.fillStyle="#3c3c3c";g.fillRect(0,0,w,h);
  for(let i=0;i<7200;i++){
    const x=Math.random()*w, y=Math.random()*h, r=1.3+Math.random()*1.9;
    const v=150+Math.random()*90|0;
    for(const ox of[-w,0,w])for(const oy of[-h,0,h]){
      const X=x+ox, Y=y+oy;
      if(X<-r||X>w+r||Y<-r||Y>h+r) continue;
      const gr=g.createRadialGradient(X,Y,0,X,Y,r);
      gr.addColorStop(0,`rgba(${v},${v},${v},0.9)`);gr.addColorStop(1,`rgba(${v},${v},${v},0)`);
      g.fillStyle=gr;g.beginPath();g.arc(X,Y,r,0,7);g.fill();
    }
  }
});
texCarpetPile.mean=(()=>{
  const c=texCarpetPile.image, d=c.getContext("2d").getImageData(0,0,c.width,c.height).data;
  let t=0; for(let i=0;i<d.length;i+=4) t+=d[i];
  return t/(d.length/4)/255;
})();
/* sparse large-scale stain overlay, tiled at a different (non-integer)
   rate than the carpet so the two layers never line up — kills the
   visible repeat without true uniqueness. Restored: at 1024² with tide
   rings on it, the field stamps ran three metres across and every one of
   them grew a closed dark loop, i.e. a crop circle on the floor. Eight
   soft washes and four drag streaks is the whole brief. */
export const texStains = makeCanvas(512,512,(g,w,h)=>{
  g.clearRect(0,0,w,h);
  for(let i=0;i<8;i++){
    const x=Math.random()*w,y=Math.random()*h,r=40+Math.random()*120;
    g.save();g.translate(x,y);g.rotate(Math.random()*Math.PI);g.scale(1,0.35+Math.random()*1.1);
    const a=0.05+Math.random()*0.13;
    const gr=g.createRadialGradient(0,0,4,0,0,r);
    gr.addColorStop(0,`rgba(28,22,7,${a})`);gr.addColorStop(0.7,`rgba(28,22,7,${a*0.5})`);
    gr.addColorStop(1,"rgba(28,22,7,0)");
    g.fillStyle=gr;g.fillRect(-r,-r,r*2,r*2);g.restore();
  }
  /* a few long drag streaks */
  for(let i=0;i<4;i++){
    const x=Math.random()*w,y=Math.random()*h,len=80+Math.random()*160;
    g.save();g.translate(x,y);g.rotate(Math.random()*Math.PI);
    const gr=g.createLinearGradient(-len/2,0,len/2,0);
    const a=0.04+Math.random()*0.08;
    gr.addColorStop(0,"rgba(30,24,8,0)");gr.addColorStop(0.5,`rgba(30,24,8,${a})`);gr.addColorStop(1,"rgba(30,24,8,0)");
    g.fillStyle=gr;g.fillRect(-len/2,-9-Math.random()*10,len,18+Math.random()*20);g.restore();
  }
});
/* ---- the suspended ceiling ----
   1024² over a 4m repeat: 256 px/m, one metre per tile, sixteen tiles a
   canvas. It was a 256² at 64 px/m holding a flat cream fill, a 3px grey grid
   and 1800 dots — from the floor that is a drawn grid on paper, and it is the
   single largest surface in the level.

   Three things make a drop ceiling read, and it had none of them:
     · the GRID IS HARDWARE. A T-bar is a narrow metal cap with the tile edge
       falling away into shadow either side of it. That reveal — a dark line
       flanking a lit one — is the whole illusion of depth; one grey stroke is
       a pencil line.
     · every tile is a slightly different tone. They were cut from different
       batches and have been up there for decades under different leaks.
     · the FACE IS MINERAL FIBRE — see ceilFace below, which is where the
       first version of this went wrong: it got the grid right and left the
       face as smooth plaster with a few scratches in it. */
const CEIL_TILES=4;                              // 1m tiles across the 4m repeat
const CAP=7, REV=3;                              // T-bar face / the reveal each side
/* every tile is clipped to its own edges: a fissure that crawls across a grid
   bar instantly stops being a tile and becomes wallpaper on a plane */
const ceilTiles=(g,w,fn)=>{
  const T=w/CEIL_TILES;
  for(let ty=0;ty<CEIL_TILES;ty++)for(let tx=0;tx<CEIL_TILES;tx++){
    g.save();g.beginPath();g.rect(tx*T,ty*T,T,T);g.clip();
    fn(tx*T,ty*T,T,ty*CEIL_TILES+tx);
    g.restore();
  }
};
/* ---- the tile FACE: mineral fibre, not plaster ----
   The grid was right and the face was wrong: a fine even stipple over a flat
   fill with a few faint scratches in it is smooth troweled PLASTER, and a
   plaster ceiling doesn't take the brown tide rings and mold this level hangs
   on it. This map carries what reads from across a room:
     · the PERFORATION. A needle-punched field. At 256 px/m a real 1.5mm hole
       is under half a pixel, so these run 2px and read as the pattern rather
       than as holes — which is what you actually see from four metres.
     · the WOOL. It is a pressed mat and it is LUMPY at the centimetre scale
       before any fine detail goes on. Plaster is not.
   The FISSURES are texCeilFoam's, at 1 px/mm. Drawn here, at 4mm a pixel, a
   fissure is a 10–40cm slit — long straight lines across the tile that read
   as scratches (and with a lip, as bark); a real one is 1–3cm and wormy.

   Both maps are drawn from one per-tile SEEDED sequence. They used to roll
   their own randoms, so the relief and the print described two different
   tiles — a slit shaded dark in one place and a groove pressed in another,
   which is most of why the face read as a drawing rather than a surface.
   Every random below is therefore drawn UNCONDITIONALLY and up front: the
   two passes must walk the same sequence or they diverge. */
const seeded=s=>()=>{ s=(s*1664525+1013904223)>>>0; return s/4294967296; };
function ceilFace(g,x0,y0,T,i,relief){
  const R=seeded((0x51ed+i*7919)>>>0);
  const wool=[],perf=[],fib=[];
  for(let k=0;k<70;k++)  wool.push([x0+R()*T, y0+R()*T, 6+R()*30, R()<0.5, R()]);
  for(let k=0;k<700;k++) perf.push([x0+2+R()*(T-4), y0+2+R()*(T-4), 0.9+R()*0.8, R(), R()<0.34]);
  for(let k=0;k<900;k++){
    const x=x0+R()*T, y=y0+R()*T, a=R()*Math.PI, l=1.6+R()*4.2;
    fib.push([x,y,x+Math.cos(a)*l,y+Math.sin(a)*l,R()]);
  }
  /* the mat */
  for(const[x,y,r,up]of wool){
    const c=relief? (up?"172,172,172":"78,78,78") : (up?"240,234,210":"138,128,96");
    const gr=g.createRadialGradient(x,y,0.5,x,y,r);
    gr.addColorStop(0,`rgba(${c},${relief?0.07:0.075})`);gr.addColorStop(1,`rgba(${c},0)`);
    g.fillStyle=gr;g.beginPath();g.arc(x,y,r,0,7);g.fill();
  }
  /* the fibre in it — batched by tone, or 900 separate strokes a tile is most
     of this module's load time on its own */
  const FTONE=relief? ["74,74,74","168,168,168","88,88,88"]
                    : ["104,95,68","250,246,226","70,64,44"];
  for(let b=0;b<3;b++){
    g.strokeStyle=`rgba(${FTONE[b]},${relief?0.10:0.13})`;
    g.lineWidth=b===1? 1.0:1.3;
    g.beginPath();
    for(const f of fib){ const t=f[4]<0.42?0:f[4]<0.80?1:2; if(t!==b) continue;
      g.moveTo(f[0],f[1]); g.lineTo(f[2],f[3]); }
    g.stroke();
  }
  /* the punch: the burr the needle pushed up, then the hole */
  g.fillStyle=relief? "rgba(198,198,198,0.11)":"rgba(250,246,228,0.13)";
  g.beginPath();
  for(const p of perf) if(p[4]){ g.moveTo(p[0]+p[2]+0.9,p[1]); g.arc(p[0],p[1],p[2]+0.9,0,7); }
  g.fill();
  for(let b=0;b<3;b++){                           // three depth buckets
    g.fillStyle=relief? `rgba(56,56,56,${0.14+b*0.07})`:`rgba(84,76,52,${0.17+b*0.09})`;
    g.beginPath();
    for(const p of perf){ if(((p[3]*3)|0)!==b) continue; g.moveTo(p[0]+p[2],p[1]); g.arc(p[0],p[1],p[2],0,7); }
    g.fill();
  }
}
/* the bars, drawn wrapped so the one on the seam arrives whole */
const ceilBars=(g,w,h,fn)=>{
  const T=w/CEIL_TILES;
  for(let i=0;i<CEIL_TILES;i++){
    for(const o of(i===0? [0,w]:[0])){ fn(i*T+o,true); fn(i*T+o,false); }
  }
};
export const texCeil = makeCanvas(1024,1024,(g,w,h)=>{
  g.fillStyle="#c9c0a0";g.fillRect(0,0,w,h);
  ceilTiles(g,w,(x0,y0,T,ti)=>{
    const v=(Math.random()-0.5)*24;                        // this tile's batch
    g.fillStyle=`rgb(${206+v|0},${199+v|0},${170+v*0.8|0})`;
    g.fillRect(x0,y0,T,T);
    ceilFace(g,x0,y0,T,ti,false);
    for(let i=0;i<5;i++){                                  // age blotching within the tile
      const x=x0+Math.random()*T, y=y0+Math.random()*T, r=24+Math.random()*70;
      const gr=g.createRadialGradient(x,y,2,x,y,r);
      gr.addColorStop(0,`rgba(120,108,74,${0.04+Math.random()*0.06})`);
      gr.addColorStop(1,"rgba(120,108,74,0)");
      g.fillStyle=gr;g.fillRect(x-r,y-r,r*2,r*2);
    }
    /* it sits DOWN in the grid: its own edges fall into shadow */
    for(const[gx,gy,gw,gh]of[[x0,y0,T,10],[x0,y0+T-10,T,10],[x0,y0,10,T],[x0+T-10,y0,10,T]]){
      const vert=gw<gh;
      const gr=vert? g.createLinearGradient(gx,0,gx+gw,0) : g.createLinearGradient(0,gy,0,gy+gh);
      const near=(vert? gx===x0 : gy===y0);
      gr.addColorStop(near?0:1,"rgba(46,42,28,0.30)");
      gr.addColorStop(near?1:0,"rgba(46,42,28,0)");
      g.fillStyle=gr;g.fillRect(gx,gy,gw,gh);
    }
  });
  ceilBars(g,w,h,(p,vert)=>{
    const R=(off,thick)=>vert? g.fillRect(p+off,0,thick,h) : g.fillRect(0,p+off,w,thick);
    g.fillStyle="rgba(24,22,15,0.55)";  R(-CAP/2-REV,CAP+REV*2);     // the reveal
    g.fillStyle="#b9ad8a";              R(-CAP/2,CAP);               // the cap
    g.fillStyle="rgba(255,252,236,0.30)";R(-CAP/2,1.5);              // lit edge / shadowed edge
    g.fillStyle="rgba(38,35,24,0.40)";  R(CAP/2-1.5,1.5);
    for(let i=0;i<70;i++){                                           // dirt in the runners
      const t=Math.random()*h, l=6+Math.random()*40;
      g.fillStyle=`rgba(62,56,38,${0.05+Math.random()*0.14})`;
      if(vert) g.fillRect(p-CAP/2,t,CAP,l); else g.fillRect(t,p-CAP/2,l,CAP);
    }
  });
  ceilJoints(g,w,(x,y)=>{
    g.fillStyle="rgba(34,30,20,0.55)";g.fillRect(x-CAP/2-2,y-CAP/2-2,CAP+4,CAP+4);   // the cross tee's cut end
    g.fillStyle="#bdb18f";g.fillRect(x-CAP/2,y-CAP/2,CAP,CAP);
    g.fillStyle="rgba(255,250,230,0.35)";g.fillRect(x-CAP/2,y-CAP/2,CAP,1.2);
  });
});
/* every point where a cross tee butts into a main runner, wrapped like the
   bars so the ones on the seam arrive whole */
function ceilJoints(g,w,fn){
  const T=w/CEIL_TILES;
  for(let i=0;i<=CEIL_TILES;i++)for(let j=0;j<=CEIL_TILES;j++) fn(i*T,j*T);
}
/* the grid's relief. From underneath the T-bar cap is the LOWEST thing up
   there — nearest your eye — and the tile face is recessed behind it, so the
   cap reads bright and the fissures cut into the dark. */
export const texCeilBump = makeCanvas(1024,1024,(g,w,h)=>{
  g.fillStyle="#6e6e6e";g.fillRect(0,0,w,h);
  ceilTiles(g,w,(x0,y0,T,ti)=>{ ceilFace(g,x0,y0,T,ti,true); });
  ceilBars(g,w,h,(p,vert)=>{
    const R=(off,thick)=>vert? g.fillRect(p+off,0,thick,h) : g.fillRect(0,p+off,w,thick);
    g.fillStyle="rgba(26,26,26,0.9)"; R(-CAP/2-REV,CAP+REV*2);
    g.fillStyle="rgba(246,246,246,0.95)"; R(-CAP/2,CAP);
  });
  ceilJoints(g,w,(x,y)=>{ g.fillStyle="rgba(255,255,255,0.9)";g.fillRect(x-CAP/2-1,y-CAP/2-1,CAP+2,CAP+2); });
});
/* a soft round dab — alpha falling linearly to the rim, which is exactly what
   a radial gradient to transparent gives — laid straight into a float field
   and wrapped at its edges. Tens of thousands of them through canvas
   gradients cost a third of a second at startup. `max` lays a cone instead
   (the lighten blend). */
function dab(F,w,h,x,y,r,v,a,max){
  const ir=1/r, x0=Math.floor(x-r), x1=Math.ceil(x+r), y0=Math.floor(y-r), y1=Math.ceil(y+r);
  for(let py=y0;py<y1;py++){
    const dy=py+0.5-y, row=(((py%h)+h)%h)*w;
    for(let px=x0;px<x1;px++){
      const dx=px+0.5-x, d=Math.sqrt(dx*dx+dy*dy);
      if(d>=r) continue;
      const k=row+(((px%w)+w)%w), f=1-d*ir;
      if(max){ const q=v*f; if(q>F[k]) F[k]=q; }
      else F[k]+=(v-F[k])*a*f;
    }
  }
}
/* one canvas stroke() of round-capped polylines, into the field: coverage is
   the UNION of the segments (a path does not darken where it crosses itself),
   anti-aliased over a pixel, and the colour is laid at `al` times that */
const _cov=[], _hit=[];
function strokeField(F,w,h,lines,lw,v,al){
  const n=w*h, C=_cov[n]||(_cov[n]=new Float32Array(n)), H=_hit[n]||(_hit[n]=new Int32Array(n));
  let nh=0; const r=lw/2;
  for(const L of lines)for(let k=0;k+3<L.length;k+=2){
    const ax=L[k], ay=L[k+1], bx=L[k+2], by=L[k+3], ex=bx-ax, ey=by-ay, ee=ex*ex+ey*ey||1e-9;
    const x0=Math.floor(Math.min(ax,bx)-r-1), x1=Math.ceil(Math.max(ax,bx)+r+1);
    const y0=Math.floor(Math.min(ay,by)-r-1), y1=Math.ceil(Math.max(ay,by)+r+1);
    for(let py=y0;py<y1;py++){
      const cy=py+0.5, row=(((py%h)+h)%h)*w;
      for(let px=x0;px<x1;px++){
        const cx=px+0.5, t=Math.max(0,Math.min(1,((cx-ax)*ex+(cy-ay)*ey)/ee));
        const dx=cx-ax-ex*t, dy=cy-ay-ey*t, c=r+0.5-Math.sqrt(dx*dx+dy*dy);
        if(c<=0) continue;
        const q=row+(((px%w)+w)%w), cv=c>1?1:c;
        if(C[q]===0) H[nh++]=q;
        if(cv>C[q]) C[q]=cv;
      }
    }
  }
  for(let i=0;i<nh;i++){ const q=H[i]; F[q]+=(v-F[q])*al*C[q]; C[q]=0; }
}
const fieldToCanvas=(g,F,w,h)=>{
  const img=g.createImageData(w,h), d=img.data;
  for(let i=0,j=0;i<F.length;i++,j+=4){ d[j]=d[j+1]=d[j+2]=F[i]; d[j+3]=255; }
  g.putImageData(img,0,0);
};
/* ---- the tile's FOAM ----
   What a mineral-fibre tile is at arm's length, which 256 px/m cannot hold:
   an orange-peel mat full of pits and short WORM fissures running every
   way. One 1m tile of it at 1 px/mm, laid by the ceiling shader (scene.js)
   over each tile at its own quarter-turn and offset, so no two neighbours
   match — the tee hides the cut. Grey height, used as both tone and bump.
   Laid out in 1024 units into a float field (`dab`, `strokeField`), which
   wraps at its edges; the canvas only receives the result. */
let foamMean=0.55;
export const texCeilFoam = makeCanvas(LOW_TEX?512:1024, LOW_TEX?512:1024, (g,w,h)=>{
  const U=1024, s=w/U, F=new Float32Array(w*h).fill(156);
  const soft=(x,y,r,v,a)=>dab(F,w,h,x*s,y*s,r*s,v,a);
  /* the mat: lumpy at the centimetre scale before anything is cut into it */
  for(let i=0;i<2400;i++){
    const up=Math.random()<0.5;
    soft(Math.random()*U,Math.random()*U,3+Math.random()*13,up?196:112,0.10+Math.random()*0.14);
  }
  /* worm fissures: short, bent, every direction. Each is a soft trough with
     a dark floor — never a lip, which is what turned the long slits to bark */
  const worms=[];
  for(let i=0;i<2800;i++){
    let x=Math.random()*U, y=Math.random()*U, a=Math.random()*Math.PI*2;
    const n=3+(Math.random()*3|0), l=(6+Math.random()*22)/n, pts=[x*s,y*s];
    for(let k=0;k<n;k++){ a+=(Math.random()-0.5)*1.2; x+=Math.cos(a)*l; y+=Math.sin(a)*l; pts.push(x*s,y*s); }
    worms.push({pts, wd:1.0+Math.random()*1.5});
  }
  for(const[mul,v,al]of[[2.4,118,0.22],[1,54,0.62]])
    for(let b=0;b<3;b++)
      strokeField(F,w,h,worms.filter(q=>Math.min(2,((q.wd-1.0)/0.5)|0)===b).map(q=>q.pts),(1.0+b*0.6)*mul*s,v,al);
  /* the pits: a soft dished rim, then the hole */
  for(let i=0;i<11000;i++){
    const r=0.6+Math.pow(Math.random(),2.2)*1.9;
    soft(Math.random()*U,Math.random()*U,r*2.2,40+Math.random()*50,0.55+Math.random()*0.35);
  }
  /* the pinholes: fewer, deeper */
  for(let i=0;i<700;i++) soft(Math.random()*U,Math.random()*U,2.6+Math.random()*2.2,24,0.85);
  /* loose wool on the face catching the light */
  const wool=[];
  for(let i=0;i<3200;i++){
    const x=Math.random()*U, y=Math.random()*U, a=Math.random()*Math.PI, l=1.5+Math.random()*3.5;
    wool.push([x*s,y*s,(x+Math.cos(a)*l)*s,(y+Math.sin(a)*l)*s]);
  }
  strokeField(F,w,h,wool,0.7*s,214,0.28);
  { let t=0; for(let i=0;i<F.length;i++) t+=Math.min(255,Math.max(0,Math.round(F[i]))); foamMean=t/F.length/255; }
  fieldToCanvas(g,F,w,h);
  addGrain(g,w,h,[12,12,12]);
});
/* the grain is zero-mean, so the field it went onto is the map's mean — no
   read-back */
texCeilFoam.mean=foamMean;
/* ---- the filament: the one asset every electric light in the game shares ----
   Level 0's troffers and THE END's hanging strips run the same tubes, so
   they get the same map. CylinderGeometry's v axis runs end-to-end, so this
   canvas's HEIGHT is the length of the tube — which is what makes the two
   details that sell a fluorescent lamp possible at all:

     · END BLACKENING. A tube that has been burning since before you were
       born has its mercury baked onto the glass at the electrodes. Without
       it a "tube" is a uniformly glowing stick, i.e. a neon rod.
     · the cathode caps themselves, and the faint mottle of worn phosphor
       between them.

   It must stay BRIGHT on average: lights.js drives tubeMat.color every
   frame and the map multiplies it, so anything dark here comes straight
   off the fixture's output. The blackening is deliberately short. */
export function makeTubeTexture(warm){
  return makeCanvas(16,256,(g,w,h)=>{
    if(warm){
      const gr=g.createLinearGradient(0,0,0,h);      // end-of-life hue drift
      gr.addColorStop(0,"#ffdf94"); gr.addColorStop(0.5,"#ff9742"); gr.addColorStop(1,"#ffdf94");
      g.fillStyle=gr;
    } else g.fillStyle="#fffaf0";
    g.fillRect(0,0,w,h);
    /* worn phosphor: faint rings of uneven coating along the bore */
    for(let i=0;i<70;i++){
      const y=Math.random()*h, hh=1+Math.random()*5;
      g.fillStyle=`rgba(${warm?"255,214,150":"236,240,255"},${0.05+Math.random()*0.10})`;
      g.fillRect(0,y,w,hh);
    }
    for(let i=0;i<26;i++){                            // and its cold spots
      const y=Math.random()*h, hh=1+Math.random()*4;
      g.fillStyle=`rgba(150,140,120,${0.04+Math.random()*0.07})`;
      g.fillRect(0,y,w,hh);
    }
    /* the burn at each end, then the metal cap over it */
    for(const end of[0,1]){
      const y0=end? h:0, y1=end? h*0.86:h*0.14;
      const gr=g.createLinearGradient(0,y0,0,y1);
      gr.addColorStop(0,"rgba(38,30,24,0.92)");
      gr.addColorStop(0.35,"rgba(96,80,62,0.55)");
      gr.addColorStop(1,"rgba(150,132,110,0)");
      g.fillStyle=gr; g.fillRect(0,Math.min(y0,y1),w,Math.abs(y1-y0));
      g.fillStyle="#3b3a36";
      g.fillRect(0,end? h-9:0,w,9);
    }
  });
}
/* ---- the troffer's painted-steel reflector ----
   Lives on the backplate, whose material lights.js repaints every frame, so
   like the tube map this MULTIPLIES the driven colour and has to stay bright
   on average — anything dark in here comes straight off the fixture's output.
   What it buys is SHAPE: a MeshBasic backplate is one flat value, so a
   trough pressed out of it would look identical to a flat sheet. The two
   bright lanes under the lamps, the shadow the side walls throw, and thirty
   years of dust and grime all have to be printed. */
export const texReflector = makeCanvas(256,128,(g,w,h)=>{
  g.fillStyle="#efece2";g.fillRect(0,0,w,h);
  /* the lamps sit on the thirds (v = 1/3 and 2/3); the sheet is brightest
     right under each one and falls off toward the side walls */
  for(const c of[1/3,2/3]){
    const gr=g.createLinearGradient(0,(c-0.30)*h,0,(c+0.30)*h);
    gr.addColorStop(0,"rgba(255,255,255,0)");
    gr.addColorStop(0.5,"rgba(255,255,255,0.65)");
    gr.addColorStop(1,"rgba(255,255,255,0)");
    g.fillStyle=gr;g.fillRect(0,(c-0.30)*h,w,0.6*h);
  }
  for(const e of[0,1]){                                    // the side walls' shadow
    const gr=g.createLinearGradient(0,e?h:0,0,e?h*0.86:h*0.14);
    gr.addColorStop(0,"rgba(72,68,58,0.5)");gr.addColorStop(1,"rgba(72,68,58,0)");
    g.fillStyle=gr;g.fillRect(0,e?h*0.86:0,w,h*0.14);
  }
  for(let i=0;i<420;i++){                                  // dust film
    const v=Math.random()<0.5? 176:236;
    g.fillStyle=`rgba(${v},${v-3},${v-14},${0.05+Math.random()*0.12})`;
    g.fillRect(Math.random()*w,Math.random()*h,1+Math.random()*4,1+Math.random()*2);
  }
  for(let i=0;i<7;i++){                                    // grime run off the pan
    const x=Math.random()*w, ww=6+Math.random()*22;
    const gr=g.createLinearGradient(x,0,x+ww,0);
    gr.addColorStop(0,"rgba(112,104,84,0)");
    gr.addColorStop(0.5,`rgba(112,104,84,${0.06+Math.random()*0.10})`);
    gr.addColorStop(1,"rgba(112,104,84,0)");
    g.fillStyle=gr;g.fillRect(x,0,ww,h);
  }
  /* and a whisper of rust where the damp got into the paint. It had dead
     flies printed on it — the legs and all — which from below is a scatter of
     small dark bodies in a lit tray, i.e. cockroaches, and there is no such
     thing anywhere else in this world. A stain has no legs and no symmetry:
     wobbling closed blobs at the edge of visible, and no more than that. */
  for(let i=0,n=3+Math.random()*4;i<n;i++){
    const x=Math.random()*w, y=6+Math.random()*(h-12), r=3+Math.random()*7;
    const a=0.05+Math.random()*0.07, p1=Math.random()*7, p2=Math.random()*7;
    g.fillStyle=`rgba(146,104,58,${a})`;
    g.beginPath();
    for(let t=0;t<=Math.PI*2+0.01;t+=0.25){
      const rr=r*(1+0.34*Math.sin(t*2+p1)+0.22*Math.sin(t*3+p2));
      const px=x+Math.cos(t)*rr, py=y+Math.sin(t)*rr*0.8;
      t? g.lineTo(px,py) : g.moveTo(px,py);
    }
    g.closePath();g.fill();
    g.fillStyle=`rgba(122,84,44,${a*0.9})`;                // a darker core to it
    g.beginPath();g.ellipse(x,y,r*0.45,r*0.34,0,0,7);g.fill();
  }
});
/* ---- the guard grid's rod ----
   The grid under the lamps was 20 single quads wearing a top-to-bottom
   gradient, which is a real louvre blade and a bad object: 1.4mm of steel
   seen edge-on from directly underneath is NOTHING, so the grid vanished
   exactly where you look at a ceiling light from, and reappeared as graph
   paper from anywhere else. It is round bar now — 16mm rods, always the same
   16mm from every angle — and this map wraps one.
   So u runs AROUND the rod, not down a face: the geometry is turned (see
   scene.js) so that u=0.25 is the top of the bar, facing the tube 90mm above
   it, and u=0.75 is the underside you actually stand below. A cosine keeps
   both edges of the canvas at the same mid value, so the wrap is seamless. */
export const texLouvre = makeCanvas(64,8,(g,w,h)=>{
  for(let x=0;x<w;x++){
    const k=Math.cos((x/w-0.25)*Math.PI*2);          // +1 at the top, −1 below
    const v=142+k*96;
    g.fillStyle=`rgb(${v|0},${v*0.99|0},${v*0.94|0})`;
    g.fillRect(x,0,1,h);
  }
  for(let i=0;i<70;i++){                             // dust along the top of the bar
    const x=Math.random()*w;
    const lit=Math.cos((x/w-0.25)*Math.PI*2);
    g.fillStyle=`rgba(${Math.random()<0.5?"92,86,70":"222,218,202"},${0.05+Math.random()*0.11*Math.max(0,lit)})`;
    g.fillRect(x,Math.random()*h,1+Math.random()*3,1);
  }
});
/* galvanized sheet for every fixture shell — spangle crystals, a scatter of
   dust and old water runs. Non-directional and seam-safe, because it maps
   at a fixed world scale (scaleBoxUV) across members of wildly different
   sizes: a 2.2m reflector spine and a 0.09m end cap wear the same steel. */
export const texGalv = makeCanvas(256,256,(g,w,h)=>{
  g.fillStyle="#8e918c";g.fillRect(0,0,w,h);
  for(let i=0;i<440;i++){                 // spangle: the frozen-crystal facets
    const x=Math.random()*w, y=Math.random()*h, r=5+Math.random()*20;
    const v=Math.random()<0.5? 168:120;
    g.fillStyle=`rgba(${v},${v+3},${v-2},${0.07+Math.random()*0.12})`;
    g.beginPath();
    for(let a=0;a<Math.PI*2;a+=Math.PI/3) g.lineTo(x+Math.cos(a)*r*(0.6+Math.random()*0.6),
                                                   y+Math.sin(a)*r*(0.6+Math.random()*0.6));
    g.closePath();g.fill();
  }
  g.lineWidth=0.8;
  for(let i=0;i<3600;i++){                 // mill grain, along the roll
    const x=Math.random()*w, y=Math.random()*h, l=2+Math.random()*7;
    g.strokeStyle=`rgba(${60+Math.random()*120|0},${62+Math.random()*120|0},${58+Math.random()*118|0},${0.05+Math.random()*0.09})`;
    g.beginPath();g.moveTo(x,y);g.lineTo(x+l,y+(Math.random()-0.5)*0.6);g.stroke();
  }
  for(let i=0;i<18;i++){                    // dust settled in the pressings
    const x=Math.random()*w, ww=5+Math.random()*16;
    const gr=g.createLinearGradient(x,0,x+ww,0);
    gr.addColorStop(0,"rgba(52,46,36,0)");
    gr.addColorStop(0.5,`rgba(52,46,36,${0.08+Math.random()*0.12})`);
    gr.addColorStop(1,"rgba(52,46,36,0)");
    g.fillStyle=gr;g.fillRect(x,0,ww,h);
  }
});
/* ceiling stains: a mixed population of irregular dried rings, soft filled
   blotches, and dark mold clusters. Lives on its own overlay plane tiled at
   a non-integer rate so a tile's stains never visibly repeat on the grid.
   Shapes come from a wobbling closed loop (radius varies with angle by a
   couple of sine harmonics) rather than perfect circles. */
export const texCeilStains = makeCanvas(512,512,(g,w,h)=>{
  g.clearRect(0,0,w,h);
  /* stamp soft dabs along (or inside) one irregular loop */
  const stampLoop=(x,y,r,sx,col,alpha,thick,fill)=>{
    const p1=Math.random()*7,p2=Math.random()*7;
    const h1=0.10+Math.random()*0.20, h2=0.06+Math.random()*0.16;
    const rot=Math.random()*Math.PI;
    for(let a=0;a<Math.PI*2;a+=0.09){
      const rr=r*(1+h1*Math.sin(a*2+p1)+h2*Math.sin(a*3+p2))*(fill? Math.sqrt(Math.random()):1);
      const ex=Math.cos(a)*rr*sx, ey=Math.sin(a)*rr;
      const px=x+ex*Math.cos(rot)-ey*Math.sin(rot), py=y+ex*Math.sin(rot)+ey*Math.cos(rot);
      const sr=thick*(0.7+Math.random()*0.6);
      const gr=g.createRadialGradient(px,py,0.4,px,py,sr);
      gr.addColorStop(0,`rgba(${col},${alpha*(0.7+Math.random()*0.5)})`);
      gr.addColorStop(1,`rgba(${col},0)`);
      g.fillStyle=gr;g.beginPath();g.arc(px,py,sr,0,7);g.fill();
    }
  };
  for(let i=0;i<18;i++){
    const r=16+Math.random()*64, sx=0.55+Math.random()*0.8;
    const kind=Math.random();
    /* keep every stamp fully inside the canvas: a stain crossing the wrap
       seam reappears in-game as a hard cut line along a tile boundary */
    const m=(kind<0.45? 34 : r*1.5)+4;
    const x=m+Math.random()*(w-2*m), y=m+Math.random()*(h-2*m);
    if(kind<0.45){            // dried water ring: dark crinkled rim, faint wash inside
      /* rings run far smaller than the blotches (max −80%): big tide lines
         read as massive on the ceiling, real ones stay under a metre */
      const rr=5+Math.random()*11;
      const a=0.13+Math.random()*0.14;
      stampLoop(x,y,rr,sx,"94,68,28",a*1.5,rr*0.22+1,false);
      stampLoop(x,y,rr*0.85,sx,"118,92,44",a*0.5,rr*0.3+1,true);
      if(Math.random()<0.6)   // older inner tide line
        stampLoop(x,y,rr*(0.4+Math.random()*0.25),sx,"94,68,28",a,rr*0.16+1,false);
    } else if(kind<0.8){      // soft filled blotch — kept faint, it covers a lot of area
      const a=0.045+Math.random()*0.06;
      stampLoop(x,y,r*0.9,sx,"108,84,40",a,r*0.34,true);
      stampLoop(x+r*0.25,y+r*0.15,r*0.5,sx,"88,66,28",a*0.9,r*0.22,true);
    } else {                  // mold cluster: tight dark speckles, greenish-black
      const n=24+Math.random()*26;
      for(let j=0;j<n;j++){
        const aa=Math.random()*Math.PI*2, rr=Math.pow(Math.random(),1.6)*r*0.8;
        const px=x+Math.cos(aa)*rr*sx, py=y+Math.sin(aa)*rr;
        const sr=1.2+Math.random()*3.4;
        const col=Math.random()<0.4? "34,40,22":"26,24,14";
        const gr=g.createRadialGradient(px,py,0.3,px,py,sr);
        gr.addColorStop(0,`rgba(${col},${0.16+Math.random()*0.2})`);
        gr.addColorStop(1,`rgba(${col},0)`);
        g.fillStyle=gr;g.beginPath();g.arc(px,py,sr,0,7);g.fill();
      }
    }
  }
});

/* slime-mold for the baseboards: blackish with hints of dark green. Each
   call grows ONE unique colony and renders it onto a paired wall canvas and
   floor canvas: the same lobes appear in both, so the growth visibly wraps
   the wall/floor seam instead of reading as two unrelated decals.
   Wall canvas: dense at the bottom edge (= wall base, flipY).
   Floor canvas: dense at the top edge (= laid against the wall).
   Canvas resolution tracks the decal's WORLD size, so the colony is grown at
   its final aspect ratio — stretching a fixed canvas onto an arbitrary
   rectangle squashed the blobs into a photoshop-resize look.
   THE GROWTH IS THE ORIGINAL'S and must stay so: lobes, walks, counts and
   placement are untouched. It is drawn at 1.5× the old 72 px/m, with every
   pixel constant in it scaled by the same K so the colony comes out the same
   shape, only sharper — and each dab is a colony now, a dense core under a
   soft margin, instead of one even blur. */
const DECAL_K=1.5;
/* ---- the mold's GRAIN ----
   A colony canvas is a soft coverage field, and a soft field is an airbrushed
   smudge — up close the mold was a blur. Mold is SPOTS: round colonies that
   appear, swell and merge as it gets denser. This is that as a threshold
   field, R = how early each point is covered: a scatter of cones (a big
   colony with satellites round it, then medium and fine spatter). The mold
   shader (scene.js) shows a point once coverage + R clears 1, so a thin
   dusting is a few isolated specks and a dense core is solid. G is a tone
   grain. One 0.7m tile world-mapped over every decal: the colony shapes stay
   the canvases', and nothing is added per decal. */
export const texMoldGrain = makeCanvas(LOW_TEX?256:512, LOW_TEX?256:512, (g,w,h)=>{
  const U=512, s=w/U, F=new Float32Array(w*h);
  const cone=(x,y,r,p)=>dab(F,w,h,x*s,y*s,r*s,Math.round(p*255),0,true);
  for(let i=0;i<120;i++) cone(Math.random()*U,Math.random()*U,10+Math.random()*22,0.12+Math.random()*0.16);
  for(let i=0;i<240;i++){
    const x=Math.random()*U, y=Math.random()*U, r=4+Math.random()*4.5;
    cone(x,y,r,0.78+Math.random()*0.22);
    for(let k=0,n=5+(Math.random()*8|0);k<n;k++){
      const a=Math.random()*7, d=r*(1.1+Math.random()*1.6);
      cone(x+Math.cos(a)*d,y+Math.sin(a)*d,0.9+Math.random()*2.6,0.45+Math.random()*0.45);
    }
  }
  for(let i=0;i<1300;i++) cone(Math.random()*U,Math.random()*U,2+Math.random()*2.4,0.40+Math.random()*0.55);
  for(let i=0;i<4200;i++) cone(Math.random()*U,Math.random()*U,0.9+Math.random()*1.3,0.30+Math.random()*0.55);
  const img=g.createImageData(w,h), d=img.data;
  for(let i=0,j=0;i<F.length;i++,j+=4){
    d[j]=Math.max(F[i],Math.random()*40);
    d[j+1]=150+(Math.random()-0.5)*150;
    d[j+2]=d[j]; d[j+3]=255;
  }
  g.putImageData(img,0,0);
});
export function makeMoldTextures(wid,hgt,dep){
  const K=DECAL_K, PPM=72*K;
  const wW=Math.round(Math.min(256*K,Math.max(48*K,wid*PPM)));
  const wH=Math.round(Math.min(128*K,Math.max(20*K,hgt*PPM)));
  const fH=Math.round(Math.min(64*K, Math.max(12*K,dep*PPM)));
  /* lobes: anchors along the seam, CHAINED outward from one colony centre
     in small steps so neighbouring lobes always overlap — independent
     scatter let big colonies split into separate-looking growths */
  const cx0=0.3+Math.random()*0.4;
  /* d = per-lobe vigor: some patches of a colony are dense rot, others a
     thin dusting — uniform density read as a homogeneous stamp */
  const lobes=[{x:cx0, s:0.75+Math.random()*0.25, d:0.7+Math.random()*0.3}];
  const nL=Math.max(3,Math.round(wid*2.2+Math.random()*2));
  let xL=cx0, xR=cx0;
  for(let i=1;i<nL;i++){
    const step=0.06+Math.random()*0.10;
    let x;
    if(Math.random()<0.5){ xL=Math.max(0.08,xL-step); x=xL; }
    else                 { xR=Math.min(0.92,xR+step); x=xR; }
    lobes.push({x, s:(0.45+Math.random()*0.55)*(1-Math.abs(x-cx0)*0.45),
                d:0.35+Math.random()*0.65});
  }
  /* this colony's own cast: some are greener, some are near-black */
  const tint=Math.random();
  const dab=(g,x,y,r,boost=1)=>{
    /* clamp sideways so no blob crosses the canvas border — a clipped blob
       leaves a dead-straight cut along the decal edge. Top/bottom edges are
       left alone: they meet the floor seam / fade out by design. */
    x=Math.min(g.canvas.width-r,Math.max(r,x));
    const green=Math.random()<0.25+tint*0.3;
    const col=green? "26,46,22" : "10,14,9";
    const a=(0.16+Math.random()*0.46)*boost;     // wide alpha spread: patchy, not uniform
    const gr=g.createRadialGradient(x,y,0.3,x,y,r);
    gr.addColorStop(0,`rgba(${col},${Math.min(1,a*1.35)})`);
    gr.addColorStop(0.42,`rgba(${col},${a*0.9})`);
    gr.addColorStop(1,`rgba(${col},0)`);
    g.fillStyle=gr;g.beginPath();g.arc(x,y,r,0,7);g.fill();
  };
  const wall=makeCanvas(wW,wH,(g,w,h)=>{
    g.clearRect(0,0,w,h);
    for(const lo of lobes){
      /* branching walk climbing up from the seam; a wide angle fan lets it
         also creep sideways so neighboring lobes knit together */
      const nodes=[{x:lo.x*w, y:h, r:h*(0.11+Math.random()*0.13)*lo.s+3*K}];
      const nN=Math.round((28+Math.random()*44)*lo.d);
      for(let i=0;i<nN;i++){
        /* parent choice biased to early (big, low) nodes: growth stays
           bottom-heavy instead of spraying fine speckles up the wall */
        const n=nodes[Math.floor(Math.pow(Math.random(),1.6)*nodes.length)];
        const r=n.r*(0.55+Math.random()*0.4);
        if(r<K) continue;
        const a=-Math.PI/2+(Math.random()-0.5)*2.8;     // climbs, creeps sideways
        nodes.push({x:Math.min(w-r,Math.max(r,n.x+Math.cos(a)*n.r*1.4)),
                    y:Math.min(h,Math.max(r,n.y+Math.sin(a)*n.r*1.4)), r});
      }
      for(const n of nodes){
        if(Math.random()<0.22) continue;                // dropout: gaps inside the mass
        dab(g,n.x,n.y,n.r, (0.45+0.75*lo.d)*(0.55+0.45*(n.y/h)));   // thins with height
      }
      /* heavier rot right at the seam, only under this lobe — never a
         uniform full-width band (that read as a hard slab edge) */
      for(let i=0,nC=3+5*lo.d;i<nC;i++)
        dab(g, lo.x*w+(Math.random()-0.5)*w*0.16*lo.s, h-Math.random()*3*K, (2.5+Math.random()*4*lo.s)*h/64+K, 1.25*lo.d);
    }
    /* connective crust: low dabs strung between the outermost lobes so the
       colony stays one organism, thinning toward its edges */
    const lx=lobes.map(l=>l.x), x0=Math.min(...lx), x1=Math.max(...lx);
    const span=(x1-x0)*w;
    for(let i=0,n=10+span/(9*K);i<n;i++){
      const t=Math.random(), x=(x0+(x1-x0)*t)*w;
      const edge=1-Math.abs(t-0.5)*1.2;
      dab(g, x+(Math.random()-0.5)*6*K, h-Math.random()*h*0.16*edge,
          (1.5+Math.random()*3.5)*edge*h/40+K, 0.8*edge);
    }
  });
  const floor=makeCanvas(wW,fH,(g,w,h)=>{
    g.clearRect(0,0,w,h);
    for(const lo of lobes){
      /* the same lobe spilling outward: speckles crowd the wall edge and
         thin out across the carpet */
      const n=(24+Math.random()*18)*lo.d;
      for(let i=0;i<n;i++){
        const y=Math.pow(Math.random(),2)*h*lo.s;
        const x=lo.x*w+(Math.random()-0.5)*w*(0.10+0.14*lo.s)*(0.4+y/h);
        dab(g, x, y, (1.2+Math.random()*4.2*lo.s)*(1.1-y/h*0.6)*K, 0.7+0.6*lo.d);
      }
      for(let i=0,nC=2+4*lo.d;i<nC;i++)   // seam crust mirroring the wall side
        dab(g, lo.x*w+(Math.random()-0.5)*w*0.14*lo.s, Math.random()*2.5*K, (2+Math.random()*3.5*lo.s)*K, 1.2*lo.d);
    }
  });
  /* decals never tile and their canvases aren't power-of-two: clamp +
     mipmap-free filtering keeps WebGL1 from resizing (and blurring) them */
  for(const t of [wall,floor]){
    t.wrapS=t.wrapT=THREE.ClampToEdgeWrapping;
    t.minFilter=THREE.LinearFilter;
    t.generateMipmaps=false;
  }
  return {wall,floor};
}
/* brown ceiling-leak drips: each call grows ONE unique stain pair — a
   stalactite-shaped run of rivulets bleeding down the wall from the ceiling
   seam, plus the small ceiling blotch feeding it from above. Same world-size
   canvas policy and the same K as the mold.
   The runs themselves are unchanged — where each one goes, how far, how it
   wanders — but they are drawn as ONE tapering ribbon each. They used to be
   stacked 3px rectangles, and up close a leak was a column of bricks with a
   sawtooth down both edges. */
export function makeDripTextures(wid,len){
  const K=DECAL_K, PPM=72*K;
  const wW=Math.round(Math.min(128*K,Math.max(24*K,wid*PPM)));
  const wH=Math.round(Math.min(256*K,Math.max(48*K,len*PPM)));
  const wall=makeCanvas(wW,wH,(g,w,h)=>{
    g.clearRect(0,0,w,h);
    /* contact smudge where the water exits the ceiling seam */
    for(let i=0,n=6+Math.random()*6;i<n;i++){
      const x=w*(0.2+Math.random()*0.6), r=(2.5+Math.random()*5)*K;
      const gr=g.createRadialGradient(x,1.5*K,0.3,x,1.5*K,r);
      gr.addColorStop(0,`rgba(86,58,24,${0.3+Math.random()*0.22})`);
      gr.addColorStop(1,"rgba(86,58,24,0)");
      g.fillStyle=gr;g.beginPath();g.arc(x,1.5*K,r,0,7);g.fill();
    }
    /* the wet sheet: a faint wash widest at the seam, narrowing downward —
       it's what makes the rivulet cluster read as one stalactite shape */
    const sheetH=h*(0.3+Math.random()*0.25);
    const sg=g.createLinearGradient(0,0,0,sheetH);
    sg.addColorStop(0,"rgba(92,62,26,0.06)");sg.addColorStop(1,"rgba(92,62,26,0)");
    g.fillStyle=sg;
    g.beginPath();g.moveTo(w*0.14,0);g.lineTo(w*0.86,0);
    g.quadraticCurveTo(w*0.7,sheetH*0.6,w*0.61,sheetH);g.lineTo(w*0.39,sheetH);
    g.quadraticCurveTo(w*0.3,sheetH*0.6,w*0.14,0);g.fill();
    /* rivulets: wandering tapering streaks; the first is the long center
       run, the rest hang shorter at its sides */
    const nR=2+Math.floor(Math.random()*4);
    for(let i=0;i<nR;i++){
      const long=i===0;
      let x=w*(0.5+(long?(Math.random()-0.5)*0.2:(Math.random()-0.5)*0.6));
      const yEnd=h*(long? 0.78+Math.random()*0.22 : 0.25+Math.random()*0.5);
      const baseW=(long?1.6:1.0)*(1.2+Math.random()*1.6)*(w/40+0.4*K);
      const col=Math.random()<0.5? "96,64,26" : "74,50,22";
      const a=0.28+Math.random()*0.22;
      const steps=Math.max(10,Math.floor(yEnd/(3*K)));
      const L=[], R=[], flecks=[];
      for(let s=0;s<steps;s++){
        const t=s/(steps-1), y=t*yEnd;
        x+=(Math.random()-0.5)*1.5*K;
        const ww=Math.max(0.6*K,baseW*(1-t*0.85));   // taper to a point
        L.push([x-ww/2,y]); R.push([x+ww/2,y]);
        if(Math.random()<0.06)                       // dried tide flecks beside the run
          flecks.push([x+(Math.random()<0.5?-1:1)*(ww/2+(1+Math.random()*2)*K),y]);
      }
      const rg=g.createLinearGradient(0,0,0,yEnd);
      rg.addColorStop(0,`rgba(${col},${a})`);rg.addColorStop(1,`rgba(${col},${a*0.55})`);
      g.fillStyle=rg;
      g.beginPath();g.moveTo(L[0][0],L[0][1]);
      for(const p of L) g.lineTo(p[0],p[1]);
      for(let k=R.length-1;k>=0;k--) g.lineTo(R[k][0],R[k][1]);
      g.closePath();g.fill();
      g.fillStyle=`rgba(${col},${a*0.8})`;
      for(const[fx,fy]of flecks){ g.beginPath();g.ellipse(fx,fy,0.6*K,1.1*K,0,0,7);g.fill(); }
      /* the hanging droplet bead at the tip */
      const br=baseW*(0.5+Math.random()*0.45);
      const gr=g.createRadialGradient(x,yEnd,0.3,x,yEnd,br);
      gr.addColorStop(0,`rgba(${col},${a*1.25})`);gr.addColorStop(1,`rgba(${col},0)`);
      g.fillStyle=gr;g.beginPath();g.arc(x,yEnd,br,0,7);g.fill();
    }
  });
  /* the small feed stain on the ceiling above the run: an irregular brown
     blotch with a darker waterlogged core */
  const ceil=makeCanvas(Math.round(48*K),Math.round(48*K),(g,w,h)=>{
    g.clearRect(0,0,w,h);
    const p1=Math.random()*7,p2=Math.random()*7;
    for(let a=0;a<Math.PI*2;a+=0.16){
      const rr=(w*0.27)*(1+0.22*Math.sin(a*2+p1)+0.16*Math.sin(a*3+p2))*Math.sqrt(Math.random()*0.6+0.4);
      const px=w/2+Math.cos(a)*rr, py=h/2+Math.sin(a)*rr;
      const sr=(3+Math.random()*5)*K;
      const gr=g.createRadialGradient(px,py,0.4,px,py,sr);
      gr.addColorStop(0,`rgba(88,60,26,${0.2+Math.random()*0.18})`);
      gr.addColorStop(1,"rgba(88,60,26,0)");
      g.fillStyle=gr;g.beginPath();g.arc(px,py,sr,0,7);g.fill();
    }
    const core=g.createRadialGradient(w/2,h/2,0.5,w/2,h/2,w*0.18);
    core.addColorStop(0,"rgba(58,38,16,0.4)");core.addColorStop(1,"rgba(58,38,16,0)");
    g.fillStyle=core;g.beginPath();g.arc(w/2,h/2,w*0.18,0,7);g.fill();
  });
  for(const t of [wall,ceil]){
    t.wrapS=t.wrapT=THREE.ClampToEdgeWrapping;
    t.minFilter=THREE.LinearFilter;
    t.generateMipmaps=false;
  }
  return {wall,ceil};
}
/* ---- the light a troffer throws back onto the tiles around it ----
   The pool lights hang half a metre under the ceiling, so they light the
   tiles only at a grazing angle and the ceiling beside a burning fixture sat
   as dark as the one beside a dead one. A drop ceiling in a lit room is
   brightest right around its lights. This is that spill: a soft
   rounded-rectangle falloff, drawn additively under every lit fixture (see
   scene.js) and driven by its tube colour, so it flickers with it.
   (cu,cv) is the fraction of the quad the fixture itself covers, per axis:
   the falloff starts at the trim and reaches zero at the quad's edge, and
   over the fixture's own mouth it holds at `core` so the lamps aren't
   washed flat. */
export function makeSpillTexture(cu,cv,core){
  const t=makeCanvas(256,128,(g,w,h)=>{
    const img=g.createImageData(w,h), d=img.data;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const u=Math.abs(x+0.5-w/2)/(w/2), v=Math.abs(y+0.5-h/2)/(h/2);
      const ex=Math.max(0,u-cu)/(1-cu), ey=Math.max(0,v-cv)/(1-cv);
      const e=Math.min(1,Math.hypot(ex,ey));
      const k=(u<cu&&v<cv)? core : Math.pow(1-e,2.4);
      const c=Math.round(255*k);
      const i=(y*w+x)*4; d[i]=d[i+1]=d[i+2]=c; d[i+3]=255;
    }
    g.putImageData(img,0,0);
  });
  t.wrapS=t.wrapT=THREE.ClampToEdgeWrapping;
  return t;
}
/* ---- what polished metal reflects down here ----
   A tiny cube map of the level as a mirror sees it: a pale ceiling with two
   bright lamps in it, walls at the horizon, a dark floor. It is used with
   MULTIPLY blending, so it never adds light a surface doesn't already have —
   steel in a dark corridor stays dark — it only puts the floor-to-ceiling
   falloff of a reflection into a lit face. That falloff is what stainless
   steel looks like; without it a door is grey paint with a hotspot on it.
   Kept close to neutral so it also serves THE END's crashed cab. */
export const envMetal=(()=>{
  const face=(fn)=>{ const c=document.createElement("canvas"); c.width=c.height=64; fn(c.getContext("2d"),64); return c; };
  const side=face((g,n)=>{
    const gr=g.createLinearGradient(0,0,0,n);
    gr.addColorStop(0,"#e6e2d6");gr.addColorStop(0.46,"#b8b09a");gr.addColorStop(0.54,"#6e6858");gr.addColorStop(1,"#3a372f");
    g.fillStyle=gr;g.fillRect(0,0,n,n);
    for(let i=0;i<5;i++){ g.fillStyle=`rgba(255,255,255,${0.05+Math.random()*0.08})`; g.fillRect(Math.random()*n,0,2+Math.random()*6,n*0.5); }
  });
  const top=face((g,n)=>{
    g.fillStyle="#d6d2c6";g.fillRect(0,0,n,n);
    g.fillStyle="#ffffff";g.fillRect(n*0.3,n*0.18,n*0.4,n*0.12);g.fillRect(n*0.3,n*0.70,n*0.4,n*0.12);
  });
  const bottom=face((g,n)=>{ g.fillStyle="#34312a";g.fillRect(0,0,n,n); });
  const t=new THREE.CubeTexture([side,side,top,bottom,side,side]);
  t.needsUpdate=true;
  return t;
})();
/* ================= THE END — the infinite library ================= */
/* aged institutional plaster, TILEABLE: the walls are 8m boxes mixed with
   odd-sized elevator flanks, so the texture must map at a fixed world
   scale (scaleBoxUV below) and wrap seamlessly — no baked-in baseboard
   (that's real geometry now), no features that betray the tile seam. */
export const texLibWall = makeCanvas(256,256,(g,w,h)=>{
  g.fillStyle="#878173";g.fillRect(0,0,w,h);
  for(let i=0;i<700;i++){               // plaster mottling, low contrast
    const v=Math.random();
    g.fillStyle=`rgba(${v<0.5?100:134},${v<0.5?94:128},${v<0.5?82:112},${0.04+Math.random()*0.06})`;
    g.fillRect(Math.random()*w,Math.random()*h,Math.random()*5+2,Math.random()*10+3);
  }
  for(let i=0;i<8;i++){                 // faint grime bands that fade in AND out (seam-safe)
    const x=Math.random()*w, ww=2+Math.random()*6, y0=Math.random()*h*0.5;
    const gr=g.createLinearGradient(0,y0,0,y0+h*0.45);
    const a=0.04+Math.random()*0.07;
    gr.addColorStop(0,"rgba(60,56,46,0)");
    gr.addColorStop(0.5,`rgba(60,56,46,${a})`);
    gr.addColorStop(1,"rgba(60,56,46,0)");
    g.fillStyle=gr;g.fillRect(x,y0,ww,h*0.45);
  }
});
/* rescale a BoxGeometry's per-face UVs so a RepeatWrapping texture maps at
   `m` meters per tile on every face, whatever the box dimensions — adjacent
   odd-sized boxes (walls, elevator flanks, headers) then share one scale.
   `skip` lists face indices (±x, ±y, ±z = 0..5) to leave alone: a box with
   one FITTED face — the troffer's trim flange, a printed label — must keep
   that face's 0–1 mapping while the rest of it tiles. */
export function scaleBoxUV(geo,w,h,d,m,skip){
  const uv=geo.attributes.uv;
  const dims=[[d,h],[d,h],[w,d],[w,d],[w,h],[w,h]];   // ±x, ±y, ±z face sizes
  for(let f=0;f<6;f++){
    if(skip&&skip.includes(f)) continue;
    const [fw,fh]=dims[f];
    for(let i=0;i<4;i++){
      const idx=f*4+i;
      uv.setXY(idx, uv.getX(idx)*fw/m, uv.getY(idx)*fh/m);
    }
  }
  uv.needsUpdate=true;
  return geo;
}
/* ---- the thick grey-blue carpet that mutes every footstep ----
   It tiles at 4m, so the pile itself is sub-pixel and drawing 26 000 dots
   only ever averaged back out to the flat field it started from. What
   actually READS at this scale is what a real commercial broadloom is
   recognisable by: BERBER FLECKS — a scatter of contrasting fibre in rust
   and ochre and bone, dense enough to break the field at your feet and
   fine enough to blur into tone across the room — plus the loop rows, a
   tone-on-tone lattice, and the wear the building has walked into it.
   It carries a matching bump map (below), which is what finally lets a
   point light rake across the pile instead of sliding over a flat plane. */
const CARPET_PX=(g,w,h)=>{
  g.fillStyle="#333c4a";g.fillRect(0,0,w,h);
  /* the loop pile: rows of tufts, every other row offset half a gauge */
  for(let y=0;y<h;y+=4){
    const off=(y/4)%2? 2:0;
    for(let x=0;x<w;x+=4){
      const v=Math.random();
      g.fillStyle=`rgba(${v<.5?26:78},${v<.5?32:90},${v<.5?44:110},${0.16+Math.random()*0.22})`;
      g.fillRect(x+off,y,2.6,2.6);
    }
  }
  /* berber flecks — the thing that says "carpet" from any distance */
  const FLECK=["190,150,92","150,86,52","206,198,176","74,96,120","112,74,60"];
  for(let i=0;i<2600;i++){
    g.fillStyle=`rgba(${FLECK[Math.floor(Math.random()*FLECK.length)]},${0.10+Math.random()*0.30})`;
    g.fillRect(Math.random()*w,Math.random()*h,1+Math.random()*2.4,1+Math.random()*2);
  }
  /* a tone-on-tone lattice woven into it at 64px = half a metre. Kept
     FAINT on purpose: at any real contrast this stops reading as a weave
     and starts reading as grout, and the floor turns to ceramic tile. */
  g.strokeStyle="rgba(24,29,38,0.09)";g.lineWidth=2;
  for(let k=0;k<=w;k+=64){
    g.beginPath();g.moveTo(k,0);g.lineTo(k,h);g.stroke();
    g.beginPath();g.moveTo(0,k);g.lineTo(w,k);g.stroke();
  }
  /* the last vacuum anyone ran, and what has been dragged over it since */
  for(let i=0;i<7;i++){
    const x=Math.random()*w, ww=26+Math.random()*54;
    g.fillStyle=`rgba(${Math.random()<0.5?"20,25,34":"92,104,126"},0.05)`;
    g.fillRect(x,0,ww,h);
  }
  for(let i=0;i<11;i++){                // pressure stains, dust shadows
    const x=Math.random()*w,y=Math.random()*h,r=20+Math.random()*70;
    g.save();g.translate(x,y);g.rotate(Math.random()*Math.PI);g.scale(1,0.5+Math.random()*0.8);
    const gr=g.createRadialGradient(0,0,2,0,0,r);
    gr.addColorStop(0,`rgba(14,16,22,${0.10+Math.random()*0.16})`);gr.addColorStop(1,"rgba(14,16,22,0)");
    g.fillStyle=gr;g.fillRect(-r,-r,r*2,r*2);g.restore();
  }
};
export const texLibCarpet = makeCanvas(512,512,CARPET_PX);
/* the pile's relief: the same tuft grid in greyscale, with the worn lanes
   pressed flat. Kept SHALLOW — carpet is soft, and a hard bump on a floor
   plane this big reads as gravel. */
export const texLibCarpetBump = makeCanvas(512,512,(g,w,h)=>{
  g.fillStyle="#808080";g.fillRect(0,0,w,h);
  for(let y=0;y<h;y+=4){
    const off=(y/4)%2? 2:0;
    for(let x=0;x<w;x+=4){
      const v=140+Math.random()*90|0;
      g.fillStyle=`rgb(${v},${v},${v})`;
      g.fillRect(x+off,y,2.6,2.6);
    }
  }
  g.fillStyle="rgba(48,48,48,0.20)";     // the lattice sits low in the weave
  for(let k=0;k<=w;k+=64){ g.fillRect(k-1,0,2,h); g.fillRect(0,k-1,w,2); }
  for(let i=0;i<9;i++){                  // walked flat
    const x=Math.random()*w, ww=26+Math.random()*54;
    g.fillStyle="rgba(96,96,96,0.30)";
    g.fillRect(x,0,ww,h);
  }
});
/* high dark ceiling: old planks, swallowed by the murk anyway */
export const texLibCeil = makeCanvas(256,256,(g,w,h)=>{
  g.fillStyle="#241f1a";g.fillRect(0,0,w,h);
  for(let y=0;y<=h;y+=32){g.fillStyle="rgba(10,8,6,0.7)";g.fillRect(0,y,w,2);}
  for(let i=0;i<1200;i++){
    g.fillStyle=`rgba(${40+Math.random()*26|0},${34+Math.random()*20|0},${24+Math.random()*14|0},${Math.random()*0.16})`;
    g.fillRect(Math.random()*w,Math.random()*h,Math.random()*22+4,1.5);
  }
});
/* worn dark walnut for the stacks; a warmer oak for tables & the desk.
   Grain runs down the image (v). It was 420 straight dashes, which is what
   made every board read as painted MDF: timber grain is continuous and it
   WANDERS, so each line here is one stroke the full height of the canvas,
   drifting on whole sine cycles so it meets itself across the v seam. No
   knots — this tiles every 0.9m, and a knot would stamp itself down every
   board in the building on that pitch. */
function woodTex(base,dark,light){
  return makeCanvas(512,512,(g,w,h)=>{
    g.fillStyle=base;g.fillRect(0,0,w,h);
    const wrapX=(x,fn)=>{ fn(x); if(x<60) fn(x+w); if(x>w-60) fn(x-w); };
    /* board-to-board tone: planks cut from different trees */
    for(let i=0;i<6;i++){
      const x0=Math.random()*w, bw=50+Math.random()*140, a=0.04+Math.random()*0.07;
      const col=Math.random()<0.5? dark:light;
      wrapX(x0,x=>{
        const gr=g.createLinearGradient(x-bw/2,0,x+bw/2,0);
        gr.addColorStop(0,`rgba(${col},0)`); gr.addColorStop(0.5,`rgba(${col},${a})`); gr.addColorStop(1,`rgba(${col},0)`);
        g.fillStyle=gr; g.fillRect(x-bw/2,0,bw,h);
      });
    }
    /* the grain itself */
    for(let i=0;i<300;i++){
      const x0=Math.random()*w, amp=1+Math.random()*5, cyc=1+Math.floor(Math.random()*2),
            ph=Math.random()*7, ph2=Math.random()*7;
      const col=Math.random()<0.6? dark:light;
      g.strokeStyle=`rgba(${col},${0.05+Math.random()*0.16})`;
      g.lineWidth=0.6+Math.random()*1.8;
      wrapX(x0,xx=>{
        g.beginPath();
        for(let y=0;y<=h;y+=8){
          const x=xx+Math.sin(y/h*Math.PI*2*cyc+ph)*amp+Math.sin(y/h*Math.PI*2*(cyc+2)+ph2)*amp*0.35;
          y? g.lineTo(x,y) : g.moveTo(x,y);
        }
        g.stroke();
      });
    }
    /* pores, laid along the grain */
    for(let i=0;i<3200;i++){
      g.fillStyle=`rgba(${dark},${0.05+Math.random()*0.12})`;
      g.fillRect(Math.random()*w,Math.random()*h,1,2+Math.random()*6);
    }
    /* handling: soft lighter wear and darker grime, no edges anywhere */
    for(let i=0;i<10;i++){
      const x0=Math.random()*w, y0=Math.random()*h, r=30+Math.random()*90;
      const col=Math.random()<0.5? "16,11,7" : light;
      wrapX(x0,x=>{
        const gr=g.createRadialGradient(x,y0,1,x,y0,r);
        gr.addColorStop(0,`rgba(${col},${0.04+Math.random()*0.06})`); gr.addColorStop(1,`rgba(${col},0)`);
        g.fillStyle=gr; g.fillRect(x-r,y0-r,r*2,r*2);
      });
    }
    /* scratches across the grain, thin and pale */
    for(let i=0;i<40;i++){
      g.strokeStyle=`rgba(${light},${0.06+Math.random()*0.1})`; g.lineWidth=0.7;
      const x=Math.random()*w, y=Math.random()*h, a=(Math.random()-0.5)*1.2+Math.PI/2, l=6+Math.random()*30;
      g.beginPath(); g.moveTo(x,y); g.lineTo(x+Math.sin(a)*l,y+Math.cos(a)*l*0.3); g.stroke();
    }
  });
}
export const texShelfWood = woodTex("#43321f","26,17,9","96,74,46");
export const texDeskWood  = woodTex("#5a452c","36,24,12","122,96,58");
/* ---- the machines ----
   Moulded beige ABS, thirty years yellowed. Flat colour was doing the whole
   job before, which is why every computer in the building read as a stack
   of untextured primitives: no mould grain, no dust in the corners, and —
   worst — no sign that the plastic near the vents has cooked browner than
   the plastic on the sides. */
export const texBeige = makeCanvas(128,128,(g,w,h)=>{
  g.fillStyle="#b6ad97";g.fillRect(0,0,w,h);
  for(let i=0;i<2600;i++){              // moulding grain
    const v=Math.random()<0.5? 150:196;
    g.fillStyle=`rgba(${v},${v-6},${v-24},${0.05+Math.random()*0.10})`;
    g.fillRect(Math.random()*w,Math.random()*h,1+Math.random()*2,1+Math.random()*2);
  }
  for(let i=0;i<14;i++){                // sun and cigarette smoke, unevenly
    const x=Math.random()*w,y=Math.random()*h,r=14+Math.random()*40;
    const gr=g.createRadialGradient(x,y,1,x,y,r);
    gr.addColorStop(0,`rgba(154,126,66,${0.06+Math.random()*0.10})`);
    gr.addColorStop(1,"rgba(154,126,66,0)");
    g.fillStyle=gr;g.fillRect(x-r,y-r,r*2,r*2);
  }
  for(let i=0;i<20;i++){                // scuffs
    g.fillStyle=`rgba(84,76,60,${0.06+Math.random()*0.12})`;
    g.save();g.translate(Math.random()*w,Math.random()*h);g.rotate(Math.random()*Math.PI);
    g.fillRect(0,0,3+Math.random()*16,1);g.restore();
  }
});
/* a keyboard, drawn rather than built: ~90 keycaps of real geometry on a
   prop you only ever see from standing height is ninety draws of nothing */
/* the board's layout in canvas px ([x,y,w,h] per key, on a 256×96 canvas):
   the keycaps in makeVintagePC are built from this same table, so a legend
   can never sit off the cap it is printed on */
export const KB_LAYOUT=(()=>{
  const k=[];
  for(let i=0;i<12;i++) k.push([6+i*15,5,13,9]);                 // function row
  for(let r=0;r<4;r++){                                            // the main block, stepped
    const x0=6+[0,4,7,10][r], n=[13,12,11,10][r];
    for(let i=0;i<n;i++) k.push([x0+i*13,18+r*13,12,12]);
    const xe=x0+n*13; k.push([xe,18+r*13,186-xe,12]);              // backspace, enter, shift
  }
  k.push([6,70,20,12],[28,70,16,12],[46,70,94,12],[142,70,16,12],[160,70,26,12]);
  for(let i=0;i<5;i++)for(let j=0;j<4;j++) k.push([194+j*15,18+i*13,14,12]);   // the pad
  return k;
})();
const KB_LEGEND="1234567890QWERTYUIOPASDFGHJKLZXCVBNM";
export function makeKeyboardTexture(){
  return makeCanvas(256,96,(g,w,h)=>{
    g.fillStyle="#8e8672";g.fillRect(0,0,w,h);
    g.textAlign="center"; g.textBaseline="middle";
    KB_LAYOUT.forEach(([x,y,kw,kh],i)=>{
      g.fillStyle="#2b2822";g.fillRect(x,y,kw,kh);                // the well
      const dark=kw>20||i<12;
      g.fillStyle=dark?"#9e9580":"#bdb49c";g.fillRect(x+1,y+1,kw-2,kh-2);   // the cap
      g.fillStyle="rgba(255,252,242,0.35)";g.fillRect(x+1,y+1,kw-2,1);
      g.fillStyle="rgba(40,36,28,0.35)";g.fillRect(x+1,y+kh-2,kw-2,1);
      /* legends, and the shine on the ones people used */
      if(kw<20&&i>=12){
        g.fillStyle="rgba(40,36,28,0.75)"; g.font="bold 7px Arial";
        g.fillText(KB_LEGEND[(i-12)%KB_LEGEND.length],x+kw/2,y+kh/2);
      }
      if(Math.random()<0.25){ g.fillStyle="rgba(255,250,230,0.12)"; g.fillRect(x+2,y+2,kw-4,kh-4); }
    });
    for(let i=0;i<3;i++){                                          // status LEDs
      g.fillStyle=["#2a3a24","#2a3a24","#3a3320"][i];
      g.fillRect(202+i*12,7,7,4);
    }
  });
}
/* a 3.5" disk, top down: the shell, the label somebody wrote on, and the
   write-protect window. The only object in this library worth taking, and
   it was three untextured boxes.

   256², not 128²: the label band is 0.75 of the canvas mapped onto a 0.38m
   face, so at 128 the print sat at ~250 px/m and its 7px header was three
   texels of stroke — a grey smear at the range you read it from, which is
   arm's length. Doubling puts the same physical lettering on twice the
   texels in each axis. The other half of the blur was ANISOTROPY: a disk
   lies FLAT and you look down its length at maybe 30°, the worst case for
   an isotropic mip chain, so it was fetching from a level chosen for the
   squashed axis and throwing away the sharp one. */
export function makeFloppyTexture(){
  const scrawl=["BACKUP 7","DO NOT COPY","ROOMS 0-9","INDEX ??","LAST ONE",
                "FLOOR PLAN","MY NOTES","RETURN TO","AUDIT 4","DIAGNOSTIC"];
  const tex=makeCanvas(256,256,(g,w,h)=>{
    const LB=192;                                 // label band: rows 0–191
    /* --- the label face --- */
    g.fillStyle="#1b1e25";g.fillRect(0,0,w,LB);
    for(let i=0;i<1600;i++){                      // moulded plastic sheen
      g.fillStyle=`rgba(${60+Math.random()*60|0},${64+Math.random()*60|0},${74+Math.random()*60|0},0.05)`;
      g.fillRect(Math.random()*w,Math.random()*LB,2+Math.random()*6,2);
    }
    g.fillStyle="rgba(150,160,178,0.22)";g.fillRect(0,0,w,4);   // top bevel highlight
    g.fillStyle="rgba(0,0,0,0.35)";g.fillRect(0,LB-6,w,6);
    /* the shutter end sits at the top of this face */
    g.fillStyle="#7d848c";g.fillRect(40,6,176,40);
    g.fillStyle="#5e666e";g.fillRect(48,12,160,28);
    g.fillStyle="#3a4046";g.fillRect(92,12,72,28);             // the window under it
    for(let i=0;i<5;i++){                                      // the shutter's drawn ribs
      g.fillStyle="rgba(28,32,36,0.45)";g.fillRect(52+i*7,14,2,24);
    }
    /* the label. Its printed header sits at the end FURTHEST from the
       shutter, the way a real one does — the shutter end is the end you
       hold, and nobody prints under their own thumb. */
    g.fillStyle="#cdc6ae";g.fillRect(18,58,220,116);
    g.fillStyle="rgba(120,104,72,0.30)";g.fillRect(18,58,220,6);
    g.fillStyle="#8f2b22";g.fillRect(18,156,220,18);
    g.fillStyle="#e8e2ce";g.font="bold 14px Courier New";g.textBaseline="middle";
    g.fillText("THE END  ·  ARCHIVE",26,166);
    g.fillStyle="rgba(70,60,40,0.55)";                          // ruled lines
    for(let i=0;i<3;i++) g.fillRect(26,100+i*22,204,2);
    g.fillStyle="#23232c";g.font="bold 19px Courier New";
    g.fillText(scrawl[Math.floor(Math.random()*scrawl.length)],30,84);
    /* a hand nobody can read. Kept THIN and broken: at full stroke it
       mipped down into one navy bar across the label and read as a sticker */
    g.fillStyle="rgba(52,50,62,0.50)";
    for(let i=0;i<2;i++){
      let x=30+Math.random()*20;
      while(x<208){ const ww=6+Math.random()*16; g.fillRect(x,114+i*22,ww,2); x+=ww+8+Math.random()*12; }
    }
    for(let i=0;i<7;i++){                                       // coffee, age, thumbs
      const x=Math.random()*w,y=58+Math.random()*116,r=8+Math.random()*26;
      const gr=g.createRadialGradient(x,y,0,x,y,r);
      gr.addColorStop(0,`rgba(96,72,36,${0.05+Math.random()*0.12})`);
      gr.addColorStop(1,"rgba(96,72,36,0)");
      g.fillStyle=gr;g.fillRect(x-r,y-r,r*2,r*2);
    }
    /* --- plain shell for every other face --- */
    g.fillStyle="#171a20";g.fillRect(0,LB,w,h-LB);
    for(let i=0;i<900;i++){
      g.fillStyle=`rgba(${58+Math.random()*54|0},${62+Math.random()*54|0},${72+Math.random()*54|0},0.06)`;
      g.fillRect(Math.random()*w,LB+Math.random()*(h-LB),2+Math.random()*6,2);
    }
  });
  tex.anisotropy=8;              // read at a grazing angle; clamped to the GPU max at upload
  /* The label lives in the upper v band (canvas y=0 is v=1 under flipY), and
     `top` hands setFaceUV that band the RIGHT WAY UP: v0 < v1.
     It used to be reversed, to drag the printed shutter down to the end the
     steel shutter mesh actually sits on. That works on the block layout and
     is fatal to the print: flipping v mirrors the canvas about its
     horizontal axis, so every glyph came out upside-down while still
     running left-to-right. Nobody caught it because at 128² the lettering
     was an illegible smear either way — it only surfaced once the print got
     sharp enough to read. The end-for-end problem is fixed where it belongs
     instead, by putting the steel shutter on the end the print gives it
     (makeDisc). */
  return {tex, uv:{top:[0,0.25,1,1], plain:[0.05,0.02,0.95,0.22]}};
}
/* ---- proper 3D books ----
   Each book DESIGN gets its own cover canvas: a cloth/leather base shared
   across the whole canvas (so mipmap bleed between regions is invisible),
   with three UV regions — the spine strip, the front-cover plate, and a
   plain patch for back cover, board edges and endpapers. Titles are real,
   legible, and very much of this place. */
/* (regions are computed per design — see makeBookCoverTexture) */
export const BOOK_TITLES=[
  ["HOW TO LEAVE","ANON"],
  ["ROOMS WITHOUT DOORS","E. VOSS"],
  ["THE LOWER FLOORS","M. ASHWORTH"],
  ["THE SILENT PATRON","L. HALE"],
  ["WHAT THE WALLS REMEMBER","I. MERCER"],
  ["NOTES ON THE HUM","DR. P. FINCH"],
  ["EXIT","ANON"],
  ["THE ART OF STANDING STILL","B. QUILL"],
  ["BELOW THE BELOW","M. ASHWORTH"],
  ["THE LAST BORROWER","C. WREN"],
  ["INDEX OF UNMARKED HOURS","THE DESK"],
  ["MAPS FOR LOST PLACES","T. LOOM"],
  ["THE SECOND SILENCE","L. HALE"],
  ["ON BEING FOLLOWED","J. KEEN"],
  ["THE YELLOW MAZE","S. OKEN"],
  ["DO NOT READ ALOUD","ANON"],
  ["EIGHT QUIET FEET","DR. P. FINCH"],
  ["WHERE THE CARPET ENDS","T. LOOM"],
  ["LIGHT MAINTENANCE","FACILITIES"],
  ["FORGOTTEN RETURNS","C. WREN"],
  ["A FIELD GUIDE TO ABSENCE","I. MERCER"],
  ["THE SHELVER'S HYMNAL","CHOIR OF ∅"],
  ["ROOMS I HAVE WAITED IN","A. PELL"],
  ["AFTER HOURS","N. GRAYE"],
  ["THE EMPTY POOL","R. SAYLE"],
  ["A HISTORY OF CORRIDORS","T. LOOM"],
  ["FLUORESCENCE","DR. P. FINCH"],
  ["THE WAITING ROOM","E. VOSS"],
  ["CARPET, A MEMOIR","S. OKEN"],
  ["STILL LIFE WITH CHAIR","A. PELL"],
];
/* Dewey-ish classes for the spine labels, keyed loosely to nothing */
const CALL_CLASS=["001.9","028.1","133.2","152.4","153.7","306.4","364.1","398.2",
  "720.9","747.8","808.8","823.9","910.4","914.2","028.7","616.8"];
/* muted cloth and leather bindings */
export const BOOK_BASES=[[110,44,38],[84,36,32],[52,74,54],[40,58,70],[66,54,90],
  [112,86,46],[72,52,36],[48,42,38],[120,104,70],[58,66,82],[96,62,50],[44,54,44]];
/* fit-and-draw a line of text, shrinking the font until it fits maxW */
function fitText(g,txt,x,y,maxW,size,minSize,font){
  for(let s=size;s>=minSize;s--){
    g.font=`${font[0]} ${s}px ${font[1]}`;
    if(g.measureText(txt).width<=maxW){ g.fillText(txt,x,y); return s; }
  }
  g.font=`${font[0]} ${minSize}px ${font[1]}`;
  g.fillText(txt,x,y); return minSize;
}
/* The canvas is laid out PER DESIGN at a uniform pixels-per-meter, so the
   spine strip matches the spine's real arc width and the front plate
   matches the board's real aspect — text maps 1:1 with no stretching.
   Returns {tex, uv} with the design's own region windows. */
/* the library's own mark on a spine: a typed class number and the first
   letters of the author, on a sticker gone the colour of old teeth. It is
   the one detail that says LIBRARY rather than bookshop. */
function callLabel(g,author,x0,sw,yBot,sans){
  const lw=sw-8, lh=Math.min(46,Math.max(30,Math.round(sw*0.9)));
  const x=x0+4, y=yBot-lh;
  const age=Math.random();
  g.save();
  g.shadowColor="rgba(0,0,0,0)";
  g.fillStyle=age<0.5?"#e6dfcb":age<0.85?"#d8cba4":"#c9b98a";
  g.fillRect(x,y,lw,lh);
  g.fillStyle="rgba(90,70,40,0.18)"; g.fillRect(x,y+lh-3,lw,3);          // grime along its foot
  g.strokeStyle="rgba(60,48,28,0.35)"; g.lineWidth=1; g.strokeRect(x+0.5,y+0.5,lw-1,lh-1);
  const surname=author.replace(/^(DR\.|[A-Z]\.)\s*/g,"").replace(/[^A-Z]/g,"")||"ANO";
  g.fillStyle="rgba(30,26,20,0.9)"; g.textAlign="center"; g.textBaseline="middle";
  const fs=Math.max(9,Math.min(13,Math.round(lw*0.27)));
  g.font=`bold ${fs}px ${sans? "Arial":"Courier New"}`;
  g.fillText(CALL_CLASS[Math.floor(Math.random()*CALL_CLASS.length)],x+lw/2,y+lh*0.32);
  g.fillText(surname.slice(0,3),x+lw/2,y+lh*0.70);
  g.restore();
  return y;
}
export function makeBookCoverTexture(title,author,base,motif,vol,bh,btx,bd,style="cloth"){
  if(style==="paperback"||style==="jacket") return makePrintedCoverTexture(title,author,base,motif,bh,btx,bd,style);
  const H=384, ppm=H/bh;
  const spineW=Math.max(30,Math.round(btx*1.3*ppm));   // ≈ the arc's unrolled width
  const frontW=Math.round(bd*ppm), plainW=40, gd=8;
  const W=spineW+gd+frontW+gd+plainW;
  const t=makeCanvas(W,H,(g,w,h)=>{
    const [br,bg,bb]=base;
    g.fillStyle=`rgb(${br},${bg},${bb})`;g.fillRect(0,0,w,h);
    for(let i=0;i<w*h/180;i++){                   // cloth weave / leather grain
      const v=Math.random()<0.5?-18:14;
      g.fillStyle=`rgba(${br+v},${bg+v},${bb+v},${0.05+Math.random()*0.10})`;
      g.fillRect(Math.random()*w,Math.random()*h,1+Math.random()*4,2+Math.random()*6);
    }
    const gilt="rgba(206,172,96,0.92)", giltDim="rgba(206,172,96,0.55)";
    const shadow="rgba(0,0,0,0.4)";
    const serif=["bold","Georgia, 'Times New Roman', serif"];
    /* ---- spine strip (x 0..spineW) ---- */
    g.save();g.beginPath();g.rect(0,0,spineW,h);g.clip();
    g.fillStyle="rgba(0,0,0,0.18)";g.fillRect(0,0,spineW,h);     // spine sits darker
    for(const by of[24,50,h-50,h-24]){                           // raised bands
      g.fillStyle="rgba(0,0,0,0.35)";g.fillRect(5,by+3,spineW-10,3);
      g.fillStyle=giltDim;g.fillRect(5,by,spineW-10,3);
    }
    g.fillStyle=gilt;g.textAlign="center";g.textBaseline="middle";
    g.save();g.translate(spineW*0.52,h/2-16);g.rotate(Math.PI/2);
    g.shadowColor=shadow;g.shadowOffsetX=1;g.shadowOffsetY=1;g.shadowBlur=0;
    fitText(g,title,0,1,h-200,Math.min(32,Math.round(spineW*0.5)),14,serif);   // clear of the call label
    g.restore();
    const labelTop=Math.random()<0.85? callLabel(g,author,0,spineW,h-56,false) : h-56;
    if(vol){
      g.font=`bold ${Math.min(20,Math.round(spineW*0.34))}px Georgia`;
      g.fillStyle=giltDim;g.fillText(vol,spineW/2,labelTop-14);
    }
    g.restore();
    /* ---- front cover plate ---- */
    const fx=spineW+gd,fw=frontW;
    g.save();g.beginPath();g.rect(fx,0,fw,h);g.clip();
    g.strokeStyle=giltDim;g.lineWidth=3;
    g.strokeRect(fx+12,15,fw-24,h-30);
    g.strokeStyle="rgba(206,172,96,0.3)";g.lineWidth=1.5;
    g.strokeRect(fx+19,22,fw-38,h-44);
    g.fillStyle=gilt;g.textAlign="center";g.textBaseline="alphabetic";
    g.shadowColor=shadow;g.shadowOffsetX=1;g.shadowOffsetY=1;
    /* wrap the title into the plate */
    const tSize=Math.min(30,Math.round(fw*0.15));
    g.font=`bold ${tSize}px Georgia`;
    const words=title.split(" "),lines=[];let ln="";
    for(const wd of words){
      const tl=ln? ln+" "+wd:wd;
      if(g.measureText(tl).width>fw-56&&ln){lines.push(ln);ln=wd;}else ln=tl;
    }
    if(ln)lines.push(ln);
    let ty=66;
    for(const l of lines){ fitText(g,l,fx+fw/2,ty,fw-52,tSize,15,serif); ty+=tSize+10; }
    if(vol){ g.font="bold 18px Georgia";g.fillText(vol,fx+fw/2,ty+4); ty+=24; }
    g.strokeStyle=giltDim;g.lineWidth=2;
    g.beginPath();g.moveTo(fx+fw*0.25,ty+4);g.lineTo(fx+fw*0.75,ty+4);g.stroke();
    /* central gilt motif, scaled to the plate */
    const mx=fx+fw/2,my=h*0.62,ms=fw/180;
    g.strokeStyle=gilt;g.lineWidth=2.5;g.shadowColor="rgba(0,0,0,0)";
    g.save();g.translate(mx,my);g.scale(ms,ms);
    if(motif===0){            // an eye
      g.beginPath();g.ellipse(0,0,32,17,0,0,7);g.stroke();
      g.beginPath();g.arc(0,0,8,0,7);g.stroke();
    } else if(motif===1){     // a door, ajar
      g.strokeRect(-19,-29,38,58);
      g.beginPath();g.moveTo(-19,-29);g.lineTo(5,-21);g.lineTo(5,37);g.lineTo(-19,29);g.closePath();g.stroke();
    } else if(motif===2){     // a spiral
      g.beginPath();
      for(let a=0;a<Math.PI*5;a+=0.25) g.lineTo(Math.cos(a)*a*2.1,Math.sin(a)*a*2.1);
      g.stroke();
    } else if(motif===3){     // an hourglass
      g.beginPath();g.moveTo(-21,-26);g.lineTo(21,-26);g.lineTo(-21,26);g.lineTo(21,26);g.closePath();g.stroke();
    } else if(motif===4){     // a key
      g.beginPath();g.arc(-13,0,12,0,7);g.stroke();
      g.beginPath();g.moveTo(-1,0);g.lineTo(26,0);g.moveTo(17,0);g.lineTo(17,10);g.moveTo(25,0);g.lineTo(25,10);g.stroke();
    } else {                  // a stair descending
      g.beginPath();let sx=-26,sy=-21;
      for(let i=0;i<4;i++){g.lineTo(sx,sy);sx+=13;g.lineTo(sx,sy);sy+=12;}
      g.lineTo(sx,sy);g.stroke();
    }
    g.restore();
    g.shadowColor=shadow;
    const aSize=Math.min(17,Math.round(fw*0.1));
    g.font=`bold ${aSize}px Georgia`;g.fillStyle=giltDim;
    fitText(g,author,mx,h-32,fw-56,aSize,11,serif);
    g.restore();
    /* corner & edge wear over everything */
    g.shadowColor="rgba(0,0,0,0)";
    for(let i=0;i<90;i++){
      g.fillStyle=`rgba(${br+30},${bg+30},${bb+26},${0.08+Math.random()*0.14})`;
      const ex=Math.random()<0.5? Math.random()*30 : w-Math.random()*30;
      g.fillRect(ex,Math.random()*h,1+Math.random()*4,2+Math.random()*8);
    }
    const vg=g.createRadialGradient(w/2,h/2,h*0.35,w/2,h/2,h*0.78);
    vg.addColorStop(0,"rgba(0,0,0,0)");vg.addColorStop(1,"rgba(0,0,0,0.22)");
    g.fillStyle=vg;g.fillRect(0,0,w,h);
  });
  /* non-power-of-two by design: clamp + mipmap-free filtering keeps WebGL1
     from resampling (and blurring) the text */
  t.wrapS=t.wrapT=THREE.ClampToEdgeWrapping;
  t.minFilter=THREE.LinearFilter;
  t.generateMipmaps=false;
  return {tex:t, uv:{
    spine:[0,spineW/W],
    front:[(spineW+gd)/W,(spineW+gd+frontW)/W],
    plain:[(W-plainW+4)/W,(W-4)/W],
  }};
}
/* paperbacks and dust jackets: PRINTED, not tooled — flat ink on coated
   stock, bleached along the spine where the shelf light fell on it, and on
   a paperback the white creases a read spine gets, which are most of what
   says it was ever opened. Same canvas layout and return shape as the cloth
   bindings, so buildBookDesign maps either the same way. */
const PRINT_BASES=[[196,160,70],[70,120,126],[192,112,92],[214,200,168],
  [112,140,170],[150,70,60],[60,70,90],[176,176,150],[120,150,110]];
function makePrintedCoverTexture(title,author,base,motif,bh,btx,bd,style){
  const H=384, ppm=H/bh;
  const spineW=Math.max(24,Math.round(btx*(style==="paperback"?1.02:1.3)*ppm));
  const frontW=Math.round(bd*ppm), plainW=40, gd=8;
  const W=spineW+gd+frontW+gd+plainW;
  const pb=style==="paperback";
  const [br,bg,bb]=PRINT_BASES[Math.floor(Math.random()*PRINT_BASES.length)];
  const t=makeCanvas(W,H,(g,w,h)=>{
    g.fillStyle=`rgb(${br},${bg},${bb})`; g.fillRect(0,0,w,h);
    for(let i=0;i<w*h/90;i++){
      const v=Math.random()<0.5?-12:12;
      g.fillStyle=`rgba(${br+v},${bg+v},${bb+v},0.08)`; g.fillRect(Math.random()*w,Math.random()*h,1,1);
    }
    const ink="rgba(24,22,20,0.9)", paper="rgba(236,228,206,0.96)";
    const acc=`rgb(${Math.max(0,br-80)},${Math.max(0,bg-80)},${Math.max(0,bb-70)})`;
    const font=pb? ["bold","Arial, Helvetica, sans-serif"] : ["bold","Georgia, 'Times New Roman', serif"];
    /* ---- spine ---- */
    g.save(); g.beginPath(); g.rect(0,0,spineW,h); g.clip();
    if(!pb){ g.fillStyle=acc; g.fillRect(0,0,spineW,38); g.fillRect(0,h-34,spineW,34); }
    g.fillStyle=pb? ink : paper; g.textAlign="center"; g.textBaseline="middle";
    g.save(); g.translate(spineW*0.52,h/2-18); g.rotate(Math.PI/2);
    fitText(g,title,0,1,h-190,Math.min(26,Math.round(spineW*0.55)),11,font);
    g.restore();
    /* the publisher's mark */
    g.fillStyle=pb? ink : paper;
    g.beginPath(); g.arc(spineW/2,20,Math.min(8,spineW*0.22),0,7); g.fill();
    if(pb) for(let i=0,n=3+Math.floor(Math.random()*6);i<n;i++){
      const y=26+Math.random()*(h-52);
      g.strokeStyle=`rgba(242,238,226,${0.35+Math.random()*0.35})`; g.lineWidth=1+Math.random();
      g.beginPath(); g.moveTo(0,y); g.lineTo(spineW,y+(Math.random()-0.5)*8); g.stroke();
    }
    if(Math.random()<0.85) callLabel(g,author,0,spineW,h-44,true);
    g.restore();
    /* ---- front ---- */
    const fx=spineW+gd, fw=frontW, cx=fx+fw/2;
    g.save(); g.beginPath(); g.rect(fx,0,fw,h); g.clip();
    const lines=t=>{ const out=[]; let ln="";
      for(const wd of t.split(" ")){ const tl=ln? ln+" "+wd:wd;
        if(g.measureText(tl).width>fw-44&&ln){ out.push(ln); ln=wd; } else ln=tl; }
      if(ln) out.push(ln); return out; };
    if(pb){
      g.fillStyle=paper; g.fillRect(fx+10,24,fw-20,112);
      g.fillStyle=ink; g.font=`bold 24px Arial`;
      let y=58; for(const l of lines(title).slice(0,3)){ fitText(g,l,cx,y,fw-40,24,12,font); y+=27; }
      g.font="bold 13px Arial"; g.fillStyle="rgba(24,22,20,0.7)"; fitText(g,author,cx,y+4,fw-40,13,9,font);
    } else {
      g.fillStyle=acc; g.fillRect(fx,0,fw,46); g.fillRect(fx,h-46,fw,46);
      g.fillStyle=paper; g.font="bold 28px Georgia";
      let y=100; for(const l of lines(title).slice(0,4)){ fitText(g,l,cx,y,fw-36,28,13,font); y+=32; }
      g.fillRect(cx-fw*0.2,y-8,fw*0.4,2);
      g.font="bold 15px Georgia"; fitText(g,author,cx,h-22,fw-36,15,10,font);
    }
    /* one flat graphic, the kind a paperback line used for a whole series */
    const my=pb? h*0.66 : h*0.63, s=fw/190;
    g.save(); g.translate(cx,my); g.scale(s,s);
    g.strokeStyle=pb? ink : paper; g.fillStyle=pb? ink : paper; g.lineWidth=3;
    if(motif===0){ for(let r=10;r<=46;r+=12){ g.beginPath(); g.arc(0,0,r,0,7); g.stroke(); } }
    else if(motif===1){ g.strokeRect(-18,-40,36,72); g.fillRect(-18,-40,36,72*0.12); }
    else if(motif===2){ for(let i=0;i<5;i++) g.fillRect(-50,-36+i*16,100,6); }
    else if(motif===3){ for(let i=0;i<4;i++)for(let j=0;j<4;j++) if((i+j)%2) g.fillRect(-40+i*20,-40+j*20,20,20); }
    else if(motif===4){ g.fillRect(-2,-50,4,90); g.beginPath(); g.arc(0,-50,9,0,7); g.fill(); }
    else { g.beginPath(); let sx=-44,sy=-34; for(let i=0;i<5;i++){ g.lineTo(sx,sy); sx+=18; g.lineTo(sx,sy); sy+=16; } g.stroke(); }
    g.restore();
    g.restore();
    /* sun on the spine for thirty years */
    const fade=g.createLinearGradient(0,0,spineW*1.8,0);
    fade.addColorStop(0,"rgba(238,228,204,0.22)"); fade.addColorStop(1,"rgba(238,228,204,0)");
    g.fillStyle=fade; g.fillRect(0,0,spineW*1.8,h);
    if(!pb) for(let i=0;i<7;i++){                         // the jacket has torn along its head
      const x=Math.random()*w, ww=6+Math.random()*22;
      g.fillStyle="rgba(38,30,22,0.6)";
      g.beginPath(); g.moveTo(x,0); g.lineTo(x+ww,0); g.lineTo(x+ww*(0.3+Math.random()*0.5),3+Math.random()*12); g.closePath(); g.fill();
    }
    for(let i=0;i<60;i++){                                // rubbed corners and edges
      g.fillStyle=`rgba(240,234,220,${0.06+Math.random()*0.12})`;
      const ex=Math.random()<0.5? Math.random()*16 : w-Math.random()*16;
      g.fillRect(ex,Math.random()*h,1+Math.random()*3,2+Math.random()*7);
    }
  });
  t.wrapS=t.wrapT=THREE.ClampToEdgeWrapping;
  t.minFilter=THREE.LinearFilter;
  t.generateMipmaps=false;
  return {tex:t, gloss:pb, uv:{
    spine:[0,spineW/W],
    front:[(spineW+gd)/W,(spineW+gd+frontW)/W],
    plain:[(W-plainW+4)/W,(W-4)/W],
  }};
}
/* ---- archive boxes: banker's boxes done to the books' standard ----
   Per-design canvas at uniform px/m (no stretching), kraft cardboard with
   fiber, a pasted label on the front, oval handle holes in the ends, and a
   creased lid. Returns {tex, uv} with 2D face windows. */
export const BOX_LABELS=[
  ["ARCHIVE","BOX ∅∅7 — DO NOT SORT"],
  ["RETURNS","UNSORTED · NEVER"],
  ["LOST & FOUND","UNCLAIMED, ALL"],
  ["CARD CATALOG","A–? (OLD SYSTEM)"],
  ["CIRCULATION","RECORDS, 19∅∅–"],
  ["HOURS","UNMARKED — KEEP SEALED"],
  ["PATRON FILES","SEE FRONT DESK"],
  ["DO NOT OPEN","(IT PREFERS THE DARK)"],
];
export function makeArchiveBoxTexture(label,bw,bh,bd,lidH){
  const ppm=560;
  const fw=Math.round(bw*ppm), fh=Math.round(bh*ppm);     // front
  const sw=Math.round(bd*ppm);                            // end (handle)
  const td=Math.round(bd*ppm);                            // lid top depth
  const rh=Math.max(14,Math.round(lidH*ppm));             // lid rim
  const gd=6, plW=34;
  const W=Math.max(fw+gd+sw+gd+plW, fw+gd+fw), H=fh+gd+Math.max(td,rh+gd+rh);
  const t=makeCanvas(W,H,(g,w,h)=>{
    /* kraft base + paper fiber everywhere (regions can bleed harmlessly) */
    g.fillStyle="#8f7146";g.fillRect(0,0,w,h);
    for(let i=0;i<w*h/120;i++){
      const v=Math.random()<0.5?-16:14;
      g.fillStyle=`rgba(${143+v},${113+v},${70+v},${0.06+Math.random()*0.10})`;
      g.fillRect(Math.random()*w,Math.random()*h,2+Math.random()*9,1);
    }
    const edge=(x,y,ww,hh)=>{          // darkened border = worn box edges
      g.strokeStyle="rgba(52,38,20,0.5)";g.lineWidth=3;g.strokeRect(x+1.5,y+1.5,ww-3,hh-3);
      g.strokeStyle="rgba(40,28,14,0.25)";g.lineWidth=7;g.strokeRect(x+3.5,y+3.5,ww-7,hh-7);
    };
    /* ---- front (0,0,fw,fh): pasted label ---- */
    edge(0,0,fw,fh);
    const lw=fw*0.62, lh=fh*0.52, lx=fw*0.19+(Math.random()-0.5)*8, ly=fh*0.2+(Math.random()-0.5)*6;
    g.save();g.translate(lx+lw/2,ly+lh/2);g.rotate((Math.random()-0.5)*0.05);
    g.fillStyle="rgba(0,0,0,0.25)";g.fillRect(-lw/2+3,-lh/2+3,lw,lh);     // peel shadow
    g.fillStyle="#d9d2bc";g.fillRect(-lw/2,-lh/2,lw,lh);
    g.strokeStyle="rgba(150,52,40,0.75)";g.lineWidth=2.5;
    g.strokeRect(-lw/2+5,-lh/2+5,lw-10,lh-10);
    g.fillStyle="rgba(46,40,30,0.9)";g.textAlign="center";
    g.font=`bold ${Math.round(lh*0.24)}px Courier New`;
    g.fillText(label[0],0,-lh*0.08);
    g.font=`${Math.round(lh*0.15)}px Courier New`;g.fillStyle="rgba(46,40,30,0.7)";
    g.fillText(label[1],0,lh*0.18);
    g.strokeStyle="rgba(46,40,30,0.5)";g.lineWidth=1.5;
    g.beginPath();g.moveTo(-lw*0.32,lh*0.3);g.lineTo(lw*0.32,lh*0.3);g.stroke();
    g.restore();
    /* coffee-ring stain, sometimes */
    if(Math.random()<0.5){
      const cx=fw*(0.15+Math.random()*0.7), cy=fh*(0.15+Math.random()*0.7);
      g.strokeStyle="rgba(92,58,26,0.3)";g.lineWidth=3;
      g.beginPath();g.arc(cx,cy,9+Math.random()*8,0,7);g.stroke();
    }
    /* ---- end with handle (fw+gd,0,sw,fh) ---- */
    const sx=fw+gd;
    edge(sx,0,sw,fh);
    g.fillStyle="#241a0e";
    g.beginPath();g.ellipse(sx+sw/2,fh*0.34,sw*0.17,fh*0.10,0,0,7);g.fill();
    g.strokeStyle="rgba(30,22,12,0.6)";g.lineWidth=4;
    g.beginPath();g.ellipse(sx+sw/2,fh*0.34+2,sw*0.17,fh*0.10,0,0,Math.PI);g.stroke();
    /* ---- lid top (0,fh+gd,fw,td): creases & dust ---- */
    const ty=fh+gd;
    edge(0,ty,fw,td);
    g.strokeStyle="rgba(58,42,22,0.45)";g.lineWidth=2;
    g.beginPath();g.moveTo(fw/2,ty+3);g.lineTo(fw/2,ty+td-3);g.stroke();   // fold seam
    for(let i=0;i<3;i++){                                                   // stress creases
      const cy2=ty+td*(0.2+Math.random()*0.6);
      g.strokeStyle=`rgba(58,42,22,${0.15+Math.random()*0.2})`;g.lineWidth=1.5;
      g.beginPath();g.moveTo(fw*Math.random()*0.4,cy2);
      g.lineTo(fw*(0.6+Math.random()*0.4),cy2+(Math.random()-0.5)*14);g.stroke();
    }
    const dg=g.createRadialGradient(fw/2,ty+td/2,4,fw/2,ty+td/2,fw*0.6);
    dg.addColorStop(0,"rgba(190,176,150,0.16)");dg.addColorStop(1,"rgba(190,176,150,0)");
    g.fillStyle=dg;g.fillRect(0,ty,fw,td);                                  // settled dust
    /* ---- lid rim (fw+gd,fh+gd,fw,rh): corrugation hint ---- */
    const rx=fw+gd;
    g.fillStyle="rgba(0,0,0,0.10)";g.fillRect(rx,ty,fw,rh);
    for(let x=rx;x<rx+fw;x+=5){
      g.fillStyle=`rgba(58,42,22,${0.10+Math.random()*0.14})`;
      g.fillRect(x,ty+2,2,rh-4);
    }
    g.fillStyle="rgba(40,28,14,0.4)";g.fillRect(rx,ty+rh-3,fw,3);
  });
  t.wrapS=t.wrapT=THREE.ClampToEdgeWrapping;
  t.minFilter=THREE.LinearFilter;
  t.generateMipmaps=false;
  const u=(x)=>x/W, v=(y)=>1-y/H;       // canvas y → flipY v
  return {tex:t, uv:{
    front:[u(2),v(fh-2),u(fw-2),v(2)],
    side:[u(fw+gd+2),v(fh-2),u(fw+gd+sw-2),v(2)],
    top:[u(2),v(fh+gd+td-2),u(fw-2),v(fh+gd+2)],
    rim:[u(fw+gd+2),v(fh+gd+rh-2),u(fw+gd+fw-2),v(fh+gd+2)],
    plain:[u(W-plW+4),v(fh-6),u(W-6),v(6)],
  }};
}

/* page-block edges: fine layered striations. The leaves laminate through
   the book's THICKNESS, which maps to u on the exposed faces — so the
   lines run vertically in the canvas. */
export const texPages = makeCanvas(64,64,(g,w,h)=>{
  g.fillStyle="#cfc4a4";g.fillRect(0,0,w,h);
  for(let x=0;x<w;x+=2){
    g.fillStyle=`rgba(96,82,58,${0.08+Math.random()*0.2})`;g.fillRect(x,0,1,h);
  }
  for(let i=0;i<40;i++){
    g.fillStyle=`rgba(70,58,38,${0.1+Math.random()*0.2})`;
    g.fillRect(Math.random()*w,Math.random()*h,1,3+Math.random()*9);
  }
});
export const texPagesAged = makeCanvas(64,64,(g,w,h)=>{
  g.fillStyle="#a89a76";g.fillRect(0,0,w,h);
  for(let x=0;x<w;x+=2){
    g.fillStyle=`rgba(70,58,38,${0.1+Math.random()*0.24})`;g.fillRect(x,0,1,h);
  }
  for(let i=0;i<60;i++){
    g.fillStyle=`rgba(54,42,26,${0.12+Math.random()*0.2})`;
    g.fillRect(Math.random()*w,Math.random()*h,1,3+Math.random()*9);
  }
});
/* an open spread: two columns of unreadable lines under one legible epigraph */
export function makeOpenPagesTexture(){
  const t=makeCanvas(256,160,(g,w,h)=>{
    g.fillStyle="#d4c9a8";g.fillRect(0,0,w,h);
    for(let i=0;i<500;i++){
      g.fillStyle=`rgba(120,104,72,${Math.random()*0.1})`;
      g.fillRect(Math.random()*w,Math.random()*h,2,2);
    }
    g.fillStyle="rgba(60,50,34,0.35)";g.fillRect(w/2-1,8,2,h-16);   // gutter
    const phrases=["and the lights went out.","no one was shelving.","the hum stopped.",
      "it reads us back.","quiet, quiet, quiet.","the floor forgot us."];
    const ph=phrases[Math.floor(Math.random()*phrases.length)];
    g.fillStyle="rgba(54,44,30,0.8)";g.font="italic 11px Georgia";g.textAlign="center";
    g.fillText("— "+ph,w*0.25,24);
    for(const x0 of[14,w/2+10]){
      let y=x0<w/2? 36:20;
      while(y<h-14){
        g.fillStyle=`rgba(58,48,34,${0.4+Math.random()*0.25})`;
        g.fillRect(x0,y,(w/2-26)*(0.6+Math.random()*0.4),1.6);
        y+=6+Math.random()*3;
      }
    }
    /* a margin note nobody signed */
    if(Math.random()<0.5){
      g.fillStyle="rgba(70,44,30,0.6)";g.font="italic 9px Georgia";
      g.save();g.translate(w-10,h*0.55);g.rotate(-0.16);g.fillText("why",0,0);g.restore();
    }
  });
  /* non-POT: keep WebGL1 from resampling it blurry */
  t.wrapS=t.wrapT=THREE.ClampToEdgeWrapping;
  t.minFilter=THREE.LinearFilter;
  t.generateMipmaps=false;
  return t;
}
/* temporal decay: a jagged dark crack wandering down a wall, with branches.
   Alpha decal — each call grows a unique one. */
export function makeCrackTexture(){
  const t=makeCanvas(96,224,(g,w,h)=>{
    g.clearRect(0,0,w,h);
    const branch=(x,y,ang,len,wid)=>{
      while(len>0&&y<h&&x>2&&x<w-2){
        const nx=x+Math.sin(ang)*3, ny=y+Math.cos(ang)*3;
        g.strokeStyle=`rgba(22,18,12,${0.5+Math.random()*0.4})`;
        g.lineWidth=wid;
        g.beginPath();g.moveTo(x,y);g.lineTo(nx,ny);g.stroke();
        /* hairline halo */
        g.strokeStyle="rgba(60,54,42,0.18)";g.lineWidth=wid+2;
        g.beginPath();g.moveTo(x,y);g.lineTo(nx,ny);g.stroke();
        x=nx;y=ny;len-=3;
        ang+=(Math.random()-0.5)*0.7;
        ang=ang*0.86;                       // keep falling mostly downward
        if(Math.random()<0.06&&wid>0.8) branch(x,y,ang+(Math.random()<0.5?-0.9:0.9),len*0.45,wid*0.6);
        wid*=0.995;
      }
    };
    branch(w*(0.3+Math.random()*0.4),2,(Math.random()-0.5)*0.6,h*1.2,2.2+Math.random()*1.4);
  });
  t.wrapS=t.wrapT=THREE.ClampToEdgeWrapping; t.minFilter=THREE.LinearFilter; t.generateMipmaps=false;
  return t;
}
/* short texts and labels, meaninglessly placed — most just say the level's
   name. Stenciled paint, eroded. */
export function makeEndTextTexture(txt="THE END"){
  const t=makeCanvas(512,128,(g,w,h)=>{
    g.clearRect(0,0,w,h);
    g.fillStyle="rgba(28,24,18,0.88)";
    g.font="bold 86px Courier New";g.textAlign="center";g.textBaseline="middle";
    g.fillText(txt,w/2,h/2+4);
    /* erosion: eat random holes out of the paint */
    g.globalCompositeOperation="destination-out";
    for(let i=0;i<260;i++){
      g.fillStyle=`rgba(0,0,0,${0.3+Math.random()*0.7})`;
      g.beginPath();g.arc(Math.random()*w,Math.random()*h,Math.random()*3.2,0,7);g.fill();
    }
    g.globalCompositeOperation="source-over";
  });
  t.wrapS=t.wrapT=THREE.ClampToEdgeWrapping; t.minFilter=THREE.LinearFilter; t.generateMipmaps=false;
  return t;
}
/* faded posters: aged notices and clippings. Most of the copy now reads
   like real signage for THIS place — rules, warnings, half-useful advice —
   with roughly one line in five still sliding off into the old nonsense. */
const P_HEAD=["DO NOT RUN IN THE STACKS","QUIET HOURS NOW PERMANENT","ELEVATOR OUT OF SERVICE",
  "RETURN ALL ARCHIVE DISKS","REPORT MISSING PATRONS TO THE DESK","STAY LOW DURING OUTAGES",
  "THE LIBRARIAN IS LISTENING","KEEP THE AISLES CLEAR","NO OPEN FLAMES IN THE STACKS",
  "READING TABLES ARE FOR EVERYONE","ALL RETURNS ARE FINAL","THE STACKS CLOSE AT NEVER",
  "LATE FEES ACCRUE INWARD"];
const P_MAST=["THE DAILY STACK","THE CIRCULAR","END TIMES","THE RETURNS DESK","THE QUIET PAGE"];
/* coherent body copy — house rules for a library at the end of everything;
   several double as honest gameplay advice */
const P_SENSE=[
  "Please keep your voice down. Sound carries farther in the stacks than you expect.",
  "Do not run between the aisles. Footsteps disturb the other residents.",
  "If the lights go out, stay where you are and wait. They usually come back.",
  "During a disturbance, crouch beneath the nearest reading table and stay still.",
  "Archive disks are library property. Return every disk to the front terminal.",
  "The elevator is out of service. Maintenance has been notified.",
  "The librarian is large, patient, and listens for footsteps. Do not give it any.",
  "Ladders are provided for reaching the upper shelves. Climb quietly.",
  "Lost patrons should remain calm and stop moving. Staff will come to you.",
  "Food, candles, and open flames are strictly forbidden in the stacks.",
  "Report damaged books to the front desk before leaving.",
  "Power conservation begins at dusk. There are no windows to tell you when.",
  "Do not shelve anything yourself. Leave returns on the carts provided.",
  "The reading room closes when the last patron leaves. No patron has left.",
  "Keep the aisles clear at all times. You may need them in a hurry.",
  "Unattended belongings will be reshelved and never found again.",
  "If you hear more than two footsteps, none of them should be yours.",
  "Section ∅ remains closed for repairs.",
  "Floppy disks found between the books belong to the archive. The archive wants them back.",
  "In the event of total darkness, do not light matches near the shelves.",
  "Overdue materials must be returned in person, during whatever hours remain.",
  "New patrons are asked to register at the front desk. The desk remembers everyone.",
];
const P_SUBJ=["Patrons","Borrowers","The shelves","All visitors","Lost items","The hours",
  "Quiet readers","Overdue persons","The aisles","Returning members","Unattended books"];
const P_VERB=["must remain","will be considered","are reminded to become","may not exceed",
  "should report","have always been","will be shelved as","must not describe",
  "are encouraged to misplace","remain the property of","were never issued"];
const P_OBJ=["the library","their own absence","section ∅","the second silence",
  "whatever is missing","the front desk","themselves","the floor below the floor",
  "unmarked hours","the last page","a quieter shape"];
const P_TAIL=["until further notice.","before closing.","at all times.","without exception.",
  "upon request.","in alphabetical order.","quietly.","as scheduled.","for your safety.","again."];
const pick=a=>a[Math.floor(Math.random()*a.length)];
const nonsense=()=>`${pick(P_SUBJ)} ${pick(P_VERB)} ${pick(P_OBJ)} ${pick(P_TAIL)}`;
/* the 80/20 mix: mostly sensible, one line in five still slips */
const sentence=()=>Math.random()<0.8? pick(P_SENSE) : nonsense();
/* word-wrap a string into lines that fit `maxW` with the current font */
function wrapText(g,txt,maxW){
  const words=txt.split(" "), lines=[]; let line="";
  for(const wd of words){
    const t=line? line+" "+wd : wd;
    if(g.measureText(t).width>maxW&&line){ lines.push(line); line=wd; }
    else line=t;
  }
  if(line) lines.push(line);
  return lines;
}
export function makePosterTexture(){
  const t=makeCanvas(256,344,(g,w,h)=>{
    const tone=204+Math.random()*26|0;
    g.fillStyle=`rgb(${tone-22},${tone-26},${tone-52})`;g.fillRect(0,0,w,h);
    g.strokeStyle="rgba(40,34,22,0.55)";g.lineWidth=5;g.strokeRect(6,6,w-12,h-12);
    const ink="rgba(34,30,20,0.85)", inkSoft="rgba(40,36,26,0.66)";
    const layout=Math.random();
    if(layout<0.42){
      /* ---- official notice: header, ruled line, numbered directives ---- */
      g.fillStyle=ink; g.textAlign="center";
      g.font="bold 19px Courier New";
      const head=wrapText(g,pick(P_HEAD),w-44);
      let y=40;
      for(const ln of head){ g.fillText(ln,w/2,y); y+=22; }
      g.fillRect(24,y-8,w-48,2); y+=18;
      g.textAlign="left"; g.font="11px Courier New"; g.fillStyle=inkSoft;
      const n=3+Math.floor(Math.random()*3);
      for(let i=0;i<n&&y<h-46;i++){
        for(const ln of wrapText(g,`${i+1}. ${sentence()}`,w-52)){
          if(y>h-40) break;
          g.fillText(ln,26,y); y+=14;
        }
        y+=7;
      }
      g.textAlign="center"; g.font="bold 11px Courier New"; g.fillStyle=ink;
      g.fillText("— BY ORDER OF THE DESK —",w/2,h-26);
    } else if(layout<0.62){
      /* ---- missing-patron notice: silhouette, particulars, a plea ---- */
      g.fillStyle=ink; g.textAlign="center";
      g.font="bold 20px Courier New";
      g.fillText("MISSING",w/2,38);
      g.font="bold 12px Courier New";
      g.fillText("HAVE YOU SEEN THIS PATRON?",w/2,56);
      /* head-and-shoulders silhouette in a thin frame */
      const fx=w/2-46, fy=68, fw=92, fh=104;
      g.strokeStyle=ink; g.lineWidth=2; g.strokeRect(fx,fy,fw,fh);
      g.fillStyle="rgba(52,48,38,0.55)"; g.fillRect(fx+2,fy+2,fw-4,fh-4);
      g.fillStyle="rgba(24,22,16,0.9)";
      g.beginPath();g.ellipse(w/2,fy+42,17,21,0,0,7);g.fill();
      g.beginPath();g.ellipse(w/2,fy+fh-6,34,30,0,Math.PI,0);g.fill();
      let y=fy+fh+20;
      g.textAlign="left"; g.font="11px Courier New"; g.fillStyle=inkSoft;
      const lines=[
        `Last seen: section ${"ABCDEFGH"[Math.floor(Math.random()*8)]}, aisle ${1+Math.floor(Math.random()*9)}, reading.`,
        ["Did not check anything out.","Left their belongings at a table.",
         "Was asked to keep their voice down.","Was last heard, not seen."][Math.floor(Math.random()*4)],
        Math.random()<0.8? "If found, do not call out to them. Notify the front desk."
                         : nonsense(),
      ];
      for(const txt of lines){
        for(const ln of wrapText(g,txt,w-52)){
          if(y>h-40) break;
          g.fillText(ln,26,y); y+=14;
        }
        y+=6;
      }
      g.textAlign="center"; g.font="bold 11px Courier New"; g.fillStyle=ink;
      g.fillText("REWARD: ONE QUIET HOUR",w/2,h-26);
    } else {
      /* ---- newspaper clipping: masthead, dateline, headline, columns ---- */
      g.fillStyle=ink; g.textAlign="center";
      g.font="bold 22px Courier New"; g.fillText(pick(P_MAST),w/2,34);
      g.font="9px Courier New"; g.fillStyle=inkSoft;
      g.fillText(`VOL. ∅ · NO. ${1000+Math.floor(Math.random()*9000)} · PRICE: ONE HOUR`,w/2,48);
      g.fillStyle=ink; g.fillRect(20,54,w-40,2);
      g.font="bold 15px Courier New";
      let y=74;
      for(const ln of wrapText(g,pick(P_HEAD),w-44)){ g.fillText(ln,w/2,y); y+=17; }
      y+=8;
      /* two columns of small print */
      g.textAlign="left"; g.font="9px Courier New"; g.fillStyle=inkSoft;
      const colW=(w-56)/2, x1=22, x2=22+colW+12;
      for(const x of[x1,x2]){
        let cy=y;
        while(cy<h-30){
          for(const ln of wrapText(g,sentence(),colW)){
            if(cy>h-30) break;
            g.fillText(ln,x,cy); cy+=11;
          }
          cy+=5;
        }
      }
    }
    /* foxing stains */
    for(let i=0;i<6;i++){
      const x=Math.random()*w,y=Math.random()*h,r=10+Math.random()*28;
      const gr=g.createRadialGradient(x,y,2,x,y,r);
      gr.addColorStop(0,"rgba(110,82,40,0.16)");gr.addColorStop(1,"rgba(110,82,40,0)");
      g.fillStyle=gr;g.beginPath();g.arc(x,y,r,0,7);g.fill();
    }
    /* torn corner */
    g.globalCompositeOperation="destination-out";
    g.beginPath();g.moveTo(w,0);g.lineTo(w-22-Math.random()*36,0);g.lineTo(w,26+Math.random()*36);g.closePath();g.fill();
    g.globalCompositeOperation="source-over";
  });
  t.wrapS=t.wrapT=THREE.ClampToEdgeWrapping; t.minFilter=THREE.LinearFilter; t.generateMipmaps=false;
  return t;
}

/* ================= the paintings =================
   Most of what hangs here is OIL PAINTINGS OF EMPTY PLACES: a reading room
   with every lamp lit and nobody at the tables, a corridor of shut doors, a
   drained pool, a stair going down, a field with one pole in it. That is the
   aesthetic of the floor in one sentence — a place built for people with
   none in it — and a wall of them reads as the building remembering itself.
   The old set was mostly jokes (an acuity chart that says HUSH), and a joke
   on a wall stops being unsettling the second time you read it.
   A painting is not a drawing: the composition is laid in flat, then the
   FINISH does the work (oilFinish) — brush marks laid by soft-light strokes
   that lighten and darken whatever paint is under them without having to
   read the canvas back, a canvas weave, varnish gone amber and thicker at
   the edges, and craquelure. `size` picks the canvas: at 0.5–2.4m of sight
   size a single resolution was either wasted or smeared. `land` turns the
   canvas to landscape; makeFramedArt sizes the plate off it. */
const ART_PX={s:[256,320],m:[384,480],l:[512,640]};
const rgbs=(c,a)=>`rgba(${c[0]|0},${c[1]|0},${c[2]|0},${a})`;
const mix3=(a,b,k)=>[a[0]+(b[0]-a[0])*k,a[1]+(b[1]-a[1])*k,a[2]+(b[2]-a[2])*k];
function poly(g,pts,fill){ g.beginPath(); pts.forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y)); g.closePath(); g.fillStyle=fill; g.fill(); }
function glow(g,x,y,r,c,a){
  const gr=g.createRadialGradient(x,y,0,x,y,r);
  gr.addColorStop(0,rgbs(c,a)); gr.addColorStop(1,rgbs(c,0));
  g.fillStyle=gr; g.fillRect(x-r,y-r,r*2,r*2);
}
/* the brush, the weave, the varnish and the cracks — over any composition */
function oilFinish(g,w,h,flow){
  const k=w/256;
  g.save();
  g.globalCompositeOperation="soft-light";
  for(let i=0;i<Math.round(1100*k*k);i++){
    const x=Math.random()*w, y=Math.random()*h;
    const a=flow(x/w,y/h)+(Math.random()-0.5)*0.35, l=(4+Math.random()*14)*k;
    g.strokeStyle=Math.random()<0.5? `rgba(255,248,230,${0.04+Math.random()*0.08})`
                                    : `rgba(10,8,6,${0.04+Math.random()*0.08})`;
    g.lineWidth=(1.5+Math.random()*3)*k; g.lineCap="round";
    g.beginPath(); g.moveTo(x,y); g.lineTo(x+Math.cos(a)*l,y+Math.sin(a)*l); g.stroke();
  }
  g.globalCompositeOperation="source-over";
  /* canvas weave, fine and even */
  g.fillStyle="rgba(0,0,0,0.045)";
  for(let x=0;x<w;x+=2*k) g.fillRect(x,0,0.7*k,h);
  for(let y=0;y<h;y+=2*k) g.fillRect(0,y,w,0.7*k);
  /* varnish: amber, pooled thicker toward the frame */
  g.globalCompositeOperation="multiply";
  g.fillStyle="rgba(236,206,150,0.32)"; g.fillRect(0,0,w,h);
  const vg=g.createRadialGradient(w/2,h/2,Math.min(w,h)*0.3,w/2,h/2,Math.hypot(w,h)*0.6);
  vg.addColorStop(0,"rgba(255,255,255,1)"); vg.addColorStop(1,"rgba(178,154,116,1)");
  g.fillStyle=vg; g.fillRect(0,0,w,h);
  g.globalCompositeOperation="source-over";
  /* craquelure: short kinked cells, barely there */
  for(let i=0;i<Math.round(220*k);i++){
    let px=Math.random()*w, py=Math.random()*h, a=Math.random()*7;
    g.strokeStyle=`rgba(30,22,12,${0.08+Math.random()*0.12})`; g.lineWidth=0.6*k;
    g.beginPath(); g.moveTo(px,py);
    for(let s=0;s<3;s++){ a+=(Math.random()-0.5)*1.8; px+=Math.cos(a)*(3+Math.random()*7)*k; py+=Math.sin(a)*(3+Math.random()*7)*k; g.lineTo(px,py); }
    g.stroke();
  }
  g.restore();
}
/* one-point perspective for the interiors: X across, Y down from the eye,
   Z into the picture */
const persp=(vx,vy,f)=>(X,Y,Z)=>[vx+X*f/Z, vy+Y*f/Z];

function paintReadingRoom(g,w,h){
  const vx=w*(0.44+Math.random()*0.12), vy=h*0.44, P=persp(vx,vy,w*0.8);
  const Zb=26, eye=1.6, Wd=5.2, Ht=3.4;
  const wall=[74,62,46], ceil=[30,26,22], floor=[46,56,66];
  poly(g,[P(-Wd,-Ht+eye,1.2),P(Wd,-Ht+eye,1.2),P(Wd,-Ht+eye,Zb),P(-Wd,-Ht+eye,Zb)],rgbs(ceil,1));
  poly(g,[P(-Wd,eye,1.2),P(Wd,eye,1.2),P(Wd,eye,Zb),P(-Wd,eye,Zb)],rgbs(floor,1));
  for(const s of[-1,1]) poly(g,[P(s*Wd,-Ht+eye,1.2),P(s*Wd,-Ht+eye,Zb),P(s*Wd,eye,Zb),P(s*Wd,eye,1.2)],rgbs(mix3(wall,[0,0,0],0.25),1));
  const [bx0,by0]=P(-Wd,-Ht+eye,Zb), [bx1,by1]=P(Wd,eye,Zb);
  g.fillStyle=rgbs(mix3(wall,[0,0,0],0.4),1); g.fillRect(bx0,by0,bx1-bx0,by1-by0);
  /* shelves down both walls: dark bands of spines */
  for(const s of[-1,1]) for(let z=2;z<Zb;z+=1.6){
    poly(g,[P(s*Wd*0.995,-Ht+eye+0.5,z),P(s*Wd*0.995,-Ht+eye+0.5,z+1.4),P(s*Wd*0.995,eye-0.2,z+1.4),P(s*Wd*0.995,eye-0.2,z)],"rgba(26,18,12,0.7)");
    for(let b=0;b<4;b++){ const yy=-Ht+eye+0.7+b*0.62;
      poly(g,[P(s*Wd*0.99,yy,z),P(s*Wd*0.99,yy,z+1.4),P(s*Wd*0.99,yy+0.05,z+1.4),P(s*Wd*0.99,yy+0.05,z)],"rgba(120,90,52,0.35)"); }
  }
  /* the tables, back to front, each with its lamp still on */
  const rows=[-2.2,2.2];
  for(let z=Zb-2;z>=3;z-=3.2) for(const X of rows){
    const tY=eye-0.76;
    poly(g,[P(X-0.9,tY,z-0.7),P(X+0.9,tY,z-0.7),P(X+0.9,tY,z+0.7),P(X-0.9,tY,z+0.7)],"rgba(86,58,32,1)");
    poly(g,[P(X-0.9,tY,z-0.7),P(X+0.9,tY,z-0.7),P(X+0.9,tY+0.08,z-0.7),P(X-0.9,tY+0.08,z-0.7)],"rgba(46,30,16,1)");
    for(const lx of[-0.7,0.7]){ const[a,b]=P(X+lx,tY+0.08,z-0.66),[c,d]=P(X+lx,eye,z-0.66); g.strokeStyle="rgba(30,20,12,0.9)"; g.lineWidth=Math.max(1,w*0.3/z/10); g.beginPath(); g.moveTo(a,b); g.lineTo(c,d); g.stroke(); }
    const [lx,ly]=P(X,tY-0.35,z), rr=w*0.5/z;
    glow(g,lx,ly+rr*0.6,rr*4.2,[255,210,140],0.35);
    g.fillStyle="rgba(40,110,70,1)"; g.beginPath(); g.ellipse(lx,ly,rr*0.9,rr*0.42,0,0,7); g.fill();
    g.fillStyle="rgba(255,232,170,0.9)"; g.fillRect(lx-rr*0.5,ly+rr*0.25,rr,rr*0.15);
  }
  oilFinish(g,w,h,(u,v)=>v>0.46? 0 : Math.PI/2*(u<0.5?1:-1)*0.3);
}
function paintCorridor(g,w,h){
  const vx=w*(0.47+Math.random()*0.06), vy=h*0.47, P=persp(vx,vy,w*0.7);
  const Zb=46, eye=1.6, Wd=1.3, Ht=2.7;
  const paper=[150,138,78], ceil=[118,112,82], floor=[92,80,50];
  poly(g,[P(-Wd,-Ht+eye,0.9),P(Wd,-Ht+eye,0.9),P(Wd,-Ht+eye,Zb),P(-Wd,-Ht+eye,Zb)],rgbs(ceil,1));
  poly(g,[P(-Wd,eye,0.9),P(Wd,eye,0.9),P(Wd,eye,Zb),P(-Wd,eye,Zb)],rgbs(floor,1));
  for(const s of[-1,1]) poly(g,[P(s*Wd,-Ht+eye,0.9),P(s*Wd,-Ht+eye,Zb),P(s*Wd,eye,Zb),P(s*Wd,eye,0.9)],rgbs(mix3(paper,[0,0,0],s<0?0.12:0.22),1));
  /* the far end, a door, a crack of light under it */
  const [bx0,by0]=P(-Wd,-Ht+eye,Zb), [bx1,by1]=P(Wd,eye,Zb);
  g.fillStyle=rgbs(mix3(paper,[0,0,0],0.35),1); g.fillRect(bx0,by0,bx1-bx0,by1-by0);
  const [dx0,dy0]=P(-0.45,eye-2.05,Zb), [dx1,dy1]=P(0.45,eye,Zb);
  g.fillStyle="rgba(58,44,26,1)"; g.fillRect(dx0,dy0,dx1-dx0,dy1-dy0);
  g.fillStyle="rgba(255,244,200,0.8)"; g.fillRect(dx0,dy1-Math.max(1,(dy1-dy0)*0.03),dx1-dx0,Math.max(1,(dy1-dy0)*0.03));
  /* doors down both sides, all shut */
  for(const s of[-1,1]) for(let z=3+Math.random()*2;z<Zb-3;z+=5.5){
    poly(g,[P(s*Wd*0.99,eye-2.05,z),P(s*Wd*0.99,eye-2.05,z+0.95),P(s*Wd*0.99,eye,z+0.95),P(s*Wd*0.99,eye,z)],"rgba(84,62,36,0.95)");
    const [kx,ky]=P(s*Wd*0.98,eye-1.0,z+(s>0?0.15:0.8)); g.fillStyle="rgba(200,170,90,0.9)"; g.fillRect(kx-1,ky-1,2,2);
  }
  /* the ceiling panels, every one of them lit */
  for(let z=2;z<Zb;z+=4){
    const q=[P(-0.45,-Ht+eye,z),P(0.45,-Ht+eye,z),P(0.45,-Ht+eye,z+1.2),P(-0.45,-Ht+eye,z+1.2)];
    poly(g,q,"rgba(250,246,214,0.95)");
    const [cx,cy]=P(0,-Ht+eye,z+0.6); glow(g,cx,cy,w*0.6/z*3,[255,248,200],0.25);
  }
  oilFinish(g,w,h,(u,v)=>Math.abs(v-0.47)>Math.abs(u-0.5)*0.9? 0 : Math.PI/2);
}
function paintPool(g,w,h){
  const vx=w*(0.4+Math.random()*0.2), vy=h*0.34, P=persp(vx,vy,w*0.75);
  const eye=1.7, Zb=30, Wd=6;
  const tile=[196,214,210], deep=[112,150,154];
  g.fillStyle=rgbs([150,160,158],1); g.fillRect(0,0,w,h);
  /* the back wall with its high windows full of flat white */
  const [bx0,by0]=P(-Wd,eye-7,Zb), [bx1,by1]=P(Wd,eye,Zb);
  g.fillStyle="rgba(170,178,172,1)"; g.fillRect(bx0,by0,bx1-bx0,by1-by0);
  for(let i=0;i<5;i++){ const x0=-Wd+0.8+i*2.3; const[a,b]=P(x0,eye-6.5,Zb),[c,d]=P(x0+1.4,eye-3.8,Zb);
    g.fillStyle="rgba(240,244,236,0.95)"; g.fillRect(a,b,c-a,d-b); }
  /* the deck, then the basin cut into it — drained */
  poly(g,[P(-Wd,eye,1),P(Wd,eye,1),P(Wd,eye,Zb),P(-Wd,eye,Zb)],rgbs(tile,1));
  const bd=eye+1.8, x0=-3.6, x1=3.6, z0=4, z1=24;
  poly(g,[P(x0,bd,z0),P(x1,bd,z0),P(x1,bd,z1),P(x0,bd,z1)],rgbs(deep,1));
  poly(g,[P(x0,eye,z1),P(x1,eye,z1),P(x1,bd,z1),P(x0,bd,z1)],rgbs(mix3(deep,[255,255,255],0.2),1));
  for(const s of[-1,1]){ const X=s<0?x0:x1; poly(g,[P(X,eye,z0),P(X,eye,z1),P(X,bd,z1),P(X,bd,z0)],rgbs(mix3(deep,[0,0,0],s<0?0.1:0.25),1)); }
  /* the grout, in perspective, on everything */
  g.strokeStyle="rgba(60,80,82,0.35)"; g.lineWidth=Math.max(0.6,w/512);
  for(let x=x0;x<=x1;x+=0.6){ const[a,b]=P(x,bd,z0),[c,d]=P(x,bd,z1); g.beginPath(); g.moveTo(a,b); g.lineTo(c,d); g.stroke(); }
  for(let z=z0;z<=z1;z+=0.6){ const[a,b]=P(x0,bd,z),[c,d]=P(x1,bd,z); g.beginPath(); g.moveTo(a,b); g.lineTo(c,d); g.stroke(); }
  for(let z=1.5;z<Zb;z+=0.9){ const[a,b]=P(-Wd,eye,z),[c,d]=P(Wd,eye,z); if(z>z0&&z<z1){ const[e,f]=P(x0,eye,z),[gx,hy]=P(x1,eye,z); g.beginPath(); g.moveTo(a,b); g.lineTo(e,f); g.moveTo(gx,hy); g.lineTo(c,d); g.stroke(); } else { g.beginPath(); g.moveTo(a,b); g.lineTo(c,d); g.stroke(); } }
  /* one ladder, down into nothing */
  const lz=9, lx=x1;
  for(const dz of[-0.25,0.25]){ const[a,b]=P(lx-0.1,eye-0.9,lz+dz),[c,d]=P(lx-0.25,bd,lz+dz); g.strokeStyle="rgba(210,214,212,0.95)"; g.lineWidth=Math.max(1.2,w*0.6/lz/10); g.beginPath(); g.moveTo(a,b); g.lineTo(c,d); g.stroke(); }
  /* a little standing water in the deep end, reflecting the windows */
  const[wa,wb]=P(x0+0.4,bd-0.01,z1-4),[wc,wd]=P(x1-0.4,bd-0.01,z1-0.3);
  g.fillStyle="rgba(210,226,222,0.35)"; g.fillRect(wa,wb,wc-wa,Math.max(2,wd-wb));
  oilFinish(g,w,h,(u,v)=>v<0.34? 0 : Math.PI/2);
}
function paintField(g,w,h){
  const hy=h*(0.6+Math.random()*0.08);
  const sky=g.createLinearGradient(0,0,0,hy);
  sky.addColorStop(0,"#2c3440"); sky.addColorStop(0.6,"#6a6c70"); sky.addColorStop(1,"#c8a888");
  g.fillStyle=sky; g.fillRect(0,0,w,hy);
  const gnd=g.createLinearGradient(0,hy,0,h);
  gnd.addColorStop(0,"#3a3e2c"); gnd.addColorStop(1,"#1c1e16");
  g.fillStyle=gnd; g.fillRect(0,hy,w,h-hy);
  /* a far tree line, flat as a cut-out */
  g.fillStyle="rgba(34,38,34,0.95)"; g.beginPath(); g.moveTo(0,hy);
  for(let x=0;x<=w;x+=w/60) g.lineTo(x,hy-(3+Math.random()*9)*w/256*(0.5+0.5*Math.sin(x*0.02)));
  g.lineTo(w,hy); g.closePath(); g.fill();
  /* the pole, the wires, and the one light */
  const px=w*(0.6+Math.random()*0.2), top=hy-h*0.42;
  g.strokeStyle="rgba(22,20,18,0.95)"; g.lineWidth=w*0.012;
  g.beginPath(); g.moveTo(px,hy+h*0.06); g.lineTo(px,top); g.stroke();
  g.lineWidth=w*0.008; g.beginPath(); g.moveTo(px-w*0.07,top+h*0.03); g.lineTo(px+w*0.07,top+h*0.03); g.stroke();
  g.lineWidth=Math.max(0.8,w*0.0025);
  for(const dx of[-0.07,0.07]){ g.beginPath(); g.moveTo(px+dx*w,top+h*0.03);
    g.quadraticCurveTo(px+dx*w-w*0.35,top+h*0.09,-w*0.05,top+h*0.06); g.stroke(); }
  glow(g,px+w*0.04,top+h*0.07,w*0.22,[255,200,120],0.35);
  g.fillStyle="rgba(255,226,170,0.95)"; g.beginPath(); g.arc(px+w*0.04,top+h*0.07,w*0.012,0,7); g.fill();
  oilFinish(g,w,h,(u,v)=>v<0.6? 0 : (Math.random()-0.5)*0.4);
}
function paintStairwell(g,w,h){
  /* looking down a stone stair into the dark — and there is a colour at the bottom */
  g.fillStyle="#1c1a18"; g.fillRect(0,0,w,h);
  const vx=w*0.5, vy=h*0.88, n=16;
  for(let i=n-1;i>=0;i--){
    const t=i/n, y=h*0.05+t*(vy-h*0.05)*0.96, hw=w*(0.46-t*0.34), th=h*0.05*(1-t*0.7);
    const c=Math.round(118-t*96);
    g.fillStyle=`rgb(${c},${c-6},${c-14})`; g.fillRect(vx-hw,y,hw*2,th);
    g.fillStyle=`rgba(0,0,0,${0.35+t*0.4})`; g.fillRect(vx-hw,y+th*0.75,hw*2,th*0.4);
  }
  for(const s of[-1,1]){
    g.fillStyle="rgba(58,52,44,0.95)";
    g.beginPath(); g.moveTo(s<0?0:w,0); g.lineTo(vx+s*w*0.46,h*0.05); g.lineTo(vx+s*w*0.12,vy); g.lineTo(s<0?0:w,h); g.closePath(); g.fill();
  }
  glow(g,vx,vy,w*0.3,[70,150,200],0.45);
  const dark=g.createLinearGradient(0,h*0.45,0,h); dark.addColorStop(0,"rgba(0,0,0,0)"); dark.addColorStop(1,"rgba(0,0,0,0.55)");
  g.fillStyle=dark; g.fillRect(0,0,w,h);
  glow(g,vx,vy,w*0.12,[120,200,240],0.35);
  oilFinish(g,w,h,()=>0);
}
function paintDoorway(g,w,h){
  /* a room papered in yellow stripes, a doorway, and nothing through it */
  const stripe=[188,170,96], dk=[160,142,78];
  for(let x=0;x<w;x+=w/12){ g.fillStyle=rgbs((x/(w/12))%2<1? stripe:dk,1); g.fillRect(x,0,w/12+1,h); }
  const fl=h*0.8;
  g.fillStyle="#6c6040"; g.fillRect(0,fl,w,h-fl);
  g.fillStyle="#3c3220"; g.fillRect(0,fl-h*0.025,w,h*0.025);
  const dw=w*0.3, dx=w*(0.35+Math.random()*0.1), dt=h*0.3;
  g.fillStyle="#8a7a50"; g.fillRect(dx-w*0.02,dt-h*0.02,dw+w*0.04,fl-dt+h*0.02);
  const dg=g.createLinearGradient(0,dt,0,fl); dg.addColorStop(0,"#0a0906"); dg.addColorStop(1,"#1a160e");
  g.fillStyle=dg; g.fillRect(dx,dt,dw,fl-dt);
  glow(g,w*0.5,0,w*0.6,[255,250,210],0.4);
  oilFinish(g,w,h,()=>Math.PI/2);
}
function paintChair(g,w,h){
  /* an empty chair in an empty room, and the light from a window you can't see */
  const hz=h*0.62;
  g.fillStyle="#5a5448"; g.fillRect(0,0,w,hz);
  g.fillStyle="#3a3228"; g.fillRect(0,hz,w,h-hz);
  g.fillStyle="#2a241c"; g.fillRect(0,hz-h*0.02,w,h*0.02);
  poly(g,[[w*0.08,hz+h*0.02],[w*0.46,hz+h*0.02],[w*0.72,h],[w*0.02,h]],"rgba(240,226,190,0.30)");
  poly(g,[[w*0.1,h*0.1],[w*0.38,h*0.12],[w*0.36,hz-h*0.08],[w*0.12,hz-h*0.1]],"rgba(240,230,200,0.22)");
  const cx=w*(0.55+Math.random()*0.1), cy=hz+h*0.2, s=w/256;
  g.fillStyle="#2a1c10"; g.strokeStyle="#2a1c10"; g.lineWidth=4*s;
  g.fillRect(cx-26*s,cy-6*s,52*s,8*s);
  for(const lx of[-24,22]){ g.beginPath(); g.moveTo(cx+lx*s,cy); g.lineTo(cx+lx*s,cy+44*s); g.stroke(); }
  for(const lx of[-16,16]){ g.beginPath(); g.moveTo(cx+lx*s,cy); g.lineTo(cx+lx*s*1.1,cy+36*s); g.stroke(); }
  g.beginPath(); g.moveTo(cx-22*s,cy); g.lineTo(cx-24*s,cy-60*s); g.moveTo(cx+18*s,cy); g.lineTo(cx+20*s,cy-60*s); g.stroke();
  g.fillRect(cx-24*s,cy-62*s,44*s,7*s); g.fillRect(cx-23*s,cy-40*s,42*s,4*s);
  g.fillStyle="rgba(0,0,0,0.3)"; g.beginPath(); g.ellipse(cx-10*s,cy+46*s,44*s,6*s,0,0,7); g.fill();
  oilFinish(g,w,h,(u,v)=>v<0.62? Math.PI/2 : 0);
}
function paintPortrait(g,w,h){
  /* a donor portrait, with nothing where the face goes */
  const cx=w/2;
  const bg=g.createRadialGradient(cx,h*0.36,4,cx,h*0.4,h*0.7);
  bg.addColorStop(0,"#4a3e2c"); bg.addColorStop(1,"#15110c");
  g.fillStyle=bg; g.fillRect(0,0,w,h);
  g.fillStyle="#120e0a";
  g.beginPath(); g.ellipse(cx,h*0.86,w*0.40,h*0.34,0,Math.PI,0); g.fill();
  g.beginPath(); g.moveTo(cx-w*0.07,h*0.46); g.lineTo(cx+w*0.07,h*0.46); g.lineTo(cx+w*0.09,h*0.58); g.lineTo(cx-w*0.09,h*0.58); g.fill();
  g.beginPath(); g.ellipse(cx,h*0.33,w*0.14,h*0.14,0,0,7); g.fill();
  g.fillStyle="rgba(206,196,172,0.7)";
  for(const s of[-1,1]){ g.beginPath(); g.moveTo(cx,h*0.52); g.lineTo(cx+s*w*0.12,h*0.58); g.lineTo(cx+s*w*0.03,h*0.70); g.closePath(); g.fill(); }
  glow(g,cx,h*0.33,w*0.16,[168,146,108],0.32);
  const hands=Math.random()<0.5;
  if(hands){ g.fillStyle="rgba(150,126,96,0.5)"; g.beginPath(); g.ellipse(cx,h*0.9,w*0.09,h*0.03,0,0,7); g.fill(); }
  oilFinish(g,w,h,(u,v)=>v<0.55? Math.PI/2+(u-0.5)*0.8 : 0.3*(u-0.5));
}
function paintNocturne(g,w,h){
  const gr=g.createLinearGradient(0,0,0,h);
  gr.addColorStop(0,"#11151d"); gr.addColorStop(0.65,"#2a3140"); gr.addColorStop(1,"#3a4252");
  g.fillStyle=gr; g.fillRect(0,0,w,h);
  const mx=w*(0.25+Math.random()*0.5), my=h*0.24;
  glow(g,mx,my,w*0.2,[214,210,190],0.34);
  g.fillStyle="rgba(214,210,190,0.9)"; g.beginPath(); g.arc(mx,my,w*0.05,0,7); g.fill();
  for(let i=0;i<4;i++){
    g.fillStyle=`rgba(${10+i*6},${12+i*6},${16+i*7},0.95)`;
    g.beginPath(); g.moveTo(0,h);
    for(let xx=0;xx<=w;xx+=w/40) g.lineTo(xx,h*(0.52+i*0.11)+Math.sin(xx/w*11+i*9)*h*0.03+Math.sin(xx/w*36+i*3)*h*0.01);
    g.lineTo(w,h); g.closePath(); g.fill();
  }
  /* one lit window, far off, on nothing */
  const lx=w*(0.2+Math.random()*0.6), ly=h*0.63;
  g.fillStyle="rgba(255,214,140,0.9)"; g.fillRect(lx,ly,w*0.012,w*0.012);
  glow(g,lx,ly,w*0.05,[255,200,120],0.25);
  oilFinish(g,w,h,()=>0);
}
/* the few documents that stay: the collection map, the building in
   section with one floor too many, the staff photograph whose faces never
   developed, and a certificate nobody was ever given */
function docMap(g,w,h,k){
  const ink="rgba(40,34,24,0.85)";
  g.fillStyle="#a89c80"; g.fillRect(0,0,w,h);
  g.strokeStyle="rgba(60,50,34,0.7)"; g.lineWidth=1.6*k;
  const pts=[]; for(let i=0;i<13;i++) pts.push([18*k+Math.random()*(w-36*k),40*k+Math.random()*(h-76*k)]);
  for(let i=0;i<16;i++){ const a=pts[Math.floor(Math.random()*pts.length)],b=pts[Math.floor(Math.random()*pts.length)];
    g.beginPath(); g.moveTo(a[0],a[1]); g.lineTo(b[0],a[1]); g.lineTo(b[0],b[1]); g.stroke(); }
  g.strokeStyle="rgba(60,50,34,0.45)"; g.lineWidth=k;
  for(let i=0;i<7;i++){ const rx=16*k+Math.random()*(w-70*k), ry=38*k+Math.random()*(h-100*k), rw=(22+Math.random()*44)*k, rh=(18+Math.random()*36)*k;
    g.strokeRect(rx,ry,rw,rh); for(let hx=rx+4*k;hx<rx+rw;hx+=5*k){ g.beginPath(); g.moveTo(hx,ry+rh); g.lineTo(hx+rh*0.5,ry); g.stroke(); } }
  for(const p of pts){ g.fillStyle="rgba(60,50,34,0.85)"; g.beginPath(); g.arc(p[0],p[1],3.4*k,0,7); g.fill(); }
  g.fillStyle=ink; g.textAlign="center"; g.font=`bold ${15*k}px Courier New`;
  g.fillText("MAP OF THE COLLECTION",w/2,22*k);
  g.font=`${9*k}px Courier New`; g.fillStyle="rgba(40,34,24,0.55)";
  g.fillText("SCALE: ONE FLOOR TO ONE FLOOR",w/2,h-12*k);
}
function docSection(g,w,h,k){
  const ink="rgba(40,34,24,0.85)";
  g.fillStyle="#dbd3bc"; g.fillRect(0,0,w,h);
  const bx=26*k, bw=w-52*k, top=44*k, fl=7, fh=(h-96*k)/fl;
  g.strokeStyle="rgba(40,34,24,0.8)"; g.lineWidth=1.4*k; g.strokeRect(bx,top,bw,fh*fl);
  for(let i=1;i<fl;i++){ g.beginPath(); g.moveTo(bx,top+fh*i); g.lineTo(bx+bw,top+fh*i); g.stroke(); }
  g.strokeStyle="rgba(40,34,24,0.35)"; g.lineWidth=0.8*k;
  for(let i=0;i<fl-1;i++) for(let sx=bx+8*k;sx<bx+bw-8*k;sx+=9*k){ g.beginPath(); g.moveTo(sx,top+fh*i+fh-4*k); g.lineTo(sx,top+fh*i+5*k); g.stroke(); }
  g.strokeStyle="rgba(40,34,24,0.75)"; g.lineWidth=1.2*k;
  for(let i=0;i<fl-1;i++){ g.beginPath(); g.moveTo(bx+bw*0.62,top+fh*(i+1)); g.lineTo(bx+bw*0.80,top+fh*i); g.stroke(); }
  g.fillStyle=ink; g.font=`${10*k}px Courier New`; g.textAlign="right";
  for(let i=0;i<fl-1;i++) g.fillText(`${fl-1-i}`,bx-6*k,top+fh*i+fh*0.62);
  g.fillStyle="rgba(150,40,30,0.8)"; g.fillText("?",bx-6*k,top+fh*(fl-1)+fh*0.62);
  g.textAlign="center"; g.fillStyle=ink; g.font=`bold ${13*k}px Courier New`;
  g.fillText("LONGITUDINAL SECTION",w/2,24*k);
  g.font=`${9*k}px Courier New`; g.fillStyle="rgba(40,34,24,0.55)";
  g.fillText("DRAWING ∅ OF ∅ · NOT TO SCALE",w/2,h-14*k);
}
function docStaff(g,w,h,k){
  g.fillStyle="#3a3126"; g.fillRect(0,0,w,h);
  glow(g,w/2,h*0.45,h*0.62,[178,158,120],0.5);
  for(let row=0;row<3;row++){
    const n=5+row, by=h*(0.34+row*0.19), sc=1+row*0.1;
    for(let i=0;i<n;i++){
      const px=w*(i+0.5)/n+(Math.random()-0.5)*5*k;
      g.fillStyle="rgba(24,20,15,0.92)";
      g.beginPath(); g.ellipse(px,by+26*k*sc,w*0.075*sc,h*0.075*sc,0,Math.PI,0); g.fill();
      g.beginPath(); g.ellipse(px,by,w*0.036*sc,h*0.034*sc,0,0,7); g.fill();
      glow(g,px,by,w*0.034*sc,[196,176,138],0.62);
    }
  }
  g.fillStyle="rgba(232,222,196,0.85)"; g.font=`italic ${12*k}px Courier New`; g.textAlign="center";
  g.fillText("STAFF OF THE READING ROOM",w/2,26*k);
  /* silver gone to mirror at the edges, the way old prints do */
  const sv=g.createRadialGradient(w/2,h/2,Math.min(w,h)*0.3,w/2,h/2,Math.hypot(w,h)*0.55);
  sv.addColorStop(0,"rgba(160,170,180,0)"); sv.addColorStop(1,"rgba(150,160,170,0.28)");
  g.fillStyle=sv; g.fillRect(0,0,w,h);
}
function docCertificate(g,w,h,k){
  g.fillStyle="#e2d9bd"; g.fillRect(0,0,w,h);
  g.strokeStyle="rgba(122,98,48,0.8)"; g.lineWidth=2.5*k; g.strokeRect(14*k,14*k,w-28*k,h-28*k);
  g.lineWidth=0.9*k; g.strokeRect(21*k,21*k,w-42*k,h-42*k);
  g.fillStyle="rgba(60,50,28,0.9)"; g.textAlign="center"; g.font=`bold ${17*k}px Courier New`;
  g.fillText("AWARDED",w/2,58*k);
  g.font=`italic ${12*k}px Courier New`; g.fillStyle="rgba(60,50,28,0.7)";
  ["for service to the collection,","rendered without interruption,","for the whole of the hours."]
    .forEach((ln,i)=>g.fillText(ln,w/2,(84+i*17)*k));
  g.strokeStyle="rgba(60,50,28,0.6)"; g.lineWidth=k;
  g.beginPath(); g.moveTo(34*k,164*k); g.lineTo(w-34*k,164*k); g.stroke();
  g.beginPath(); g.moveTo(52*k,h-52*k); g.lineTo(w-52*k,h-52*k); g.stroke();
  const sx=w*0.28, sy=h-92*k;
  g.fillStyle="rgba(126,44,32,0.85)"; g.beginPath();
  for(let q=0;q<=28;q++){ const a=q/28*Math.PI*2, rr=22*k*(q%2?0.86:1); q? g.lineTo(sx+Math.cos(a)*rr,sy+Math.sin(a)*rr) : g.moveTo(sx+Math.cos(a)*rr,sy+Math.sin(a)*rr); }
  g.closePath(); g.fill();
}
const PAINTINGS=[paintReadingRoom,paintCorridor,paintPool,paintField,paintStairwell,
                 paintDoorway,paintChair,paintPortrait,paintNocturne];
/* landscape-shaped subjects, which want a landscape plate */
const LANDSCAPE=new Set([paintReadingRoom,paintPool,paintField,paintNocturne,paintCorridor]);
const DOCS=[docMap,docSection,docStaff,docCertificate];
/* {tex, land}. `land` says which way round the plate wants hanging. */
export function makeArtTexture(size="m",pickLand){
  const paint=Math.random()<0.8;
  const fn=paint? PAINTINGS[Math.floor(Math.random()*PAINTINGS.length)] : DOCS[Math.floor(Math.random()*DOCS.length)];
  const land=pickLand===undefined? LANDSCAPE.has(fn) : pickLand;
  const [pw,ph]=ART_PX[size]||ART_PX.m;
  const [w,h]=land? [ph,pw] : [pw,ph];
  const t=makeCanvas(w,h,(g,W,H)=>{
    if(paint) fn(g,W,H);
    else {
      fn(g,W,H,Math.min(W,H)/256);
      /* paper under glass for decades: foxing and a bloom of dust */
      for(let i=0;i<9;i++) glow(g,Math.random()*W,Math.random()*H,(8+Math.random()*30)*W/256,[108,80,38],0.05+Math.random()*0.11);
      const dust=g.createLinearGradient(0,0,0,H);
      dust.addColorStop(0,"rgba(196,190,172,0.12)"); dust.addColorStop(0.4,"rgba(196,190,172,0.02)"); dust.addColorStop(1,"rgba(60,54,44,0.10)");
      g.fillStyle=dust; g.fillRect(0,0,W,H);
    }
  });
  t.wrapS=t.wrapT=THREE.ClampToEdgeWrapping; t.minFilter=THREE.LinearFilter; t.generateMipmaps=false;
  return {tex:t, land, paint};
}

/* ================= THE END: the room's furniture =================
   Everything the reading room is furnished with that isn't a book: the
   noticeboards, the clocks, the section plaques on the pilasters, the one
   EXIT sign, the card catalogue, the wet-floor sign, and the paper. */
export const texCork=makeCanvas(256,256,(g,w,h)=>{
  g.fillStyle="#8a6a44"; g.fillRect(0,0,w,h);
  for(let i=0;i<5200;i++){
    const v=Math.random();
    g.fillStyle=v<0.4? `rgba(60,42,24,${0.2+Math.random()*0.3})` : v<0.8? `rgba(170,136,92,${0.2+Math.random()*0.3})`
                     : `rgba(40,28,16,${0.3+Math.random()*0.4})`;
    const r=0.6+Math.random()*1.8;
    g.beginPath(); g.arc(Math.random()*w,Math.random()*h,r,0,7); g.fill();
  }
  for(let i=0;i<60;i++){                        // pin holes where notices used to be
    g.fillStyle="rgba(20,14,8,0.7)"; g.fillRect(Math.random()*w,Math.random()*h,1.4,1.4);
  }
});
/* where a frame hung for forty years and doesn't any more: the paint under
   it stayed the colour the room used to be, and dust drew the top edge */
export const texGhost=makeCanvas(128,160,(g,w,h)=>{
  g.clearRect(0,0,w,h);
  for(let i=0;i<14;i++){
    const inset=i*1.1;
    g.fillStyle=`rgba(222,214,190,${0.02})`;
    g.fillRect(8+inset,8+inset,w-16-inset*2,h-16-inset*2);
  }
  g.fillStyle="rgba(48,40,30,0.30)"; g.fillRect(9,8,w-18,2);
  g.fillStyle="rgba(48,40,30,0.12)"; g.fillRect(9,10,w-18,3);
});
texGhost.wrapS=texGhost.wrapT=THREE.ClampToEdgeWrapping;
/* the clock face. Every clock in the building is stopped at the same
   minute — the hands are geometry, so this carries only the dial. */
export const texClockFace=makeCanvas(256,256,(g,w,h)=>{
  const c=w/2;
  g.fillStyle="#1a1814"; g.fillRect(0,0,w,h);
  const dial=g.createRadialGradient(c,c*0.9,10,c,c,c);
  dial.addColorStop(0,"#e8e0c8"); dial.addColorStop(1,"#c8bc98");
  g.fillStyle=dial; g.beginPath(); g.arc(c,c,c-4,0,7); g.fill();
  g.strokeStyle="#1c1a16";
  for(let i=0;i<60;i++){
    const a=i/60*Math.PI*2, r0=i%5? c-18 : c-28;
    g.lineWidth=i%5? 1.5:4;
    g.beginPath(); g.moveTo(c+Math.sin(a)*r0,c-Math.cos(a)*r0); g.lineTo(c+Math.sin(a)*(c-12),c-Math.cos(a)*(c-12)); g.stroke();
  }
  g.fillStyle="#1c1a16"; g.font="bold 26px Arial"; g.textAlign="center"; g.textBaseline="middle";
  for(let i=1;i<=12;i++){ const a=i/12*Math.PI*2; g.fillText(String(i),c+Math.sin(a)*(c-48),c-Math.cos(a)*(c-48)); }
  g.font="bold 11px Arial"; g.fillStyle="rgba(28,26,22,0.7)"; g.fillText("STANDARD TIME",c,c+40);
  const age=g.createRadialGradient(c,c,c*0.4,c,c,c);
  age.addColorStop(0,"rgba(120,96,50,0)"); age.addColorStop(1,"rgba(120,96,50,0.3)");
  g.fillStyle=age; g.beginPath(); g.arc(c,c,c-4,0,7); g.fill();
});
texClockFace.wrapS=texClockFace.wrapT=THREE.ClampToEdgeWrapping;
/* enamel section plates for the pilasters, all in one atlas so forty of
   them draw as one. PLAQUE_UV(i) gives cell i's window. */
export const PLAQUE_COLS=8, PLAQUE_ROWS=6;
export function makePlaqueAtlas(labels){
  const cw=128, ch=80;
  const t=makeCanvas(cw*PLAQUE_COLS,ch*PLAQUE_ROWS,(g,w,h)=>{
    g.fillStyle="#1f2e28"; g.fillRect(0,0,w,h);
    labels.forEach((lb,i)=>{
      const x=(i%PLAQUE_COLS)*cw, y=Math.floor(i/PLAQUE_COLS)*ch;
      g.fillStyle="#24382f"; g.fillRect(x+2,y+2,cw-4,ch-4);
      g.strokeStyle="rgba(214,204,170,0.8)"; g.lineWidth=2.5; g.strokeRect(x+7,y+7,cw-14,ch-14);
      g.fillStyle="rgba(222,212,178,0.92)"; g.textAlign="center"; g.textBaseline="middle";
      g.font="bold 11px Arial"; g.fillText(lb[0],x+cw/2,y+23);
      g.font="bold 30px Arial"; g.fillText(lb[1],x+cw/2,y+50);
      for(let k=0;k<30;k++){                     // chipped enamel
        g.fillStyle=`rgba(${Math.random()<0.6?"70,58,40":"20,18,14"},${0.3+Math.random()*0.5})`;
        const ex=Math.random()<0.5? x+3+Math.random()*10 : x+cw-13+Math.random()*10;
        g.fillRect(ex,y+3+Math.random()*(ch-6),1+Math.random()*3,1+Math.random()*3);
      }
    });
  });
  t.wrapS=t.wrapT=THREE.ClampToEdgeWrapping; t.anisotropy=4;
  return {tex:t, uv:i=>{ const c=i%PLAQUE_COLS, r=Math.floor(i/PLAQUE_COLS);
    return [c/PLAQUE_COLS, 1-(r+1)/PLAQUE_ROWS, (c+1)/PLAQUE_COLS, 1-r/PLAQUE_ROWS]; }};
}
/* an EXIT sign over a door that doesn't open */
export const texExitSign=makeCanvas(256,96,(g,w,h)=>{
  g.fillStyle="#140404"; g.fillRect(0,0,w,h);
  g.fillStyle="#ff3a26"; g.font="bold 64px Arial"; g.textAlign="center"; g.textBaseline="middle";
  g.fillText("EXIT",w/2,h/2+3);
  g.fillStyle="rgba(0,0,0,0.35)";
  for(let y=0;y<h;y+=3) g.fillRect(0,y,w,1);
});
texExitSign.wrapS=texExitSign.wrapT=THREE.ClampToEdgeWrapping;
export const texStaffSign=makeCanvas(256,96,(g,w,h)=>{
  g.fillStyle="#d8d0b8"; g.fillRect(0,0,w,h);
  g.strokeStyle="#2a2620"; g.lineWidth=4; g.strokeRect(6,6,w-12,h-12);
  g.fillStyle="#2a2620"; g.font="bold 34px Arial"; g.textAlign="center"; g.textBaseline="middle";
  g.fillText("STAFF ONLY",w/2,h/2+2);
  for(let i=0;i<8;i++){ const x=Math.random()*w,y=Math.random()*h,r=6+Math.random()*20;
    const gr=g.createRadialGradient(x,y,1,x,y,r); gr.addColorStop(0,"rgba(110,82,40,0.18)"); gr.addColorStop(1,"rgba(110,82,40,0)");
    g.fillStyle=gr; g.fillRect(x-r,y-r,r*2,r*2); }
});
texStaffSign.wrapS=texStaffSign.wrapT=THREE.ClampToEdgeWrapping;
/* the wet-floor sign: the most out-of-place object in a carpeted library,
   which is exactly why it is here */
export const texWetFloor=makeCanvas(256,384,(g,w,h)=>{
  g.fillStyle="#d8b020"; g.fillRect(0,0,w,h);
  g.fillStyle="#141414"; g.font="bold 40px Arial"; g.textAlign="center"; g.textBaseline="middle";
  g.fillText("CAUTION",w/2,52);
  g.beginPath(); g.moveTo(w/2,92); g.lineTo(w/2+70,212); g.lineTo(w/2-70,212); g.closePath();
  g.lineWidth=9; g.strokeStyle="#141414"; g.stroke();
  g.font="bold 64px Arial"; g.fillText("!",w/2,172);
  g.font="bold 32px Arial"; g.fillText("WET FLOOR",w/2,262);
  g.font="bold 16px Arial"; g.fillText("PISO MOJADO",w/2,300);
  for(let i=0;i<40;i++){ g.fillStyle=`rgba(90,70,20,${0.1+Math.random()*0.2})`;
    g.fillRect(Math.random()*w,Math.random()*h,2+Math.random()*16,1+Math.random()*2); }
  const dirt=g.createLinearGradient(0,h*0.6,0,h); dirt.addColorStop(0,"rgba(60,48,20,0)"); dirt.addColorStop(1,"rgba(60,48,20,0.35)");
  g.fillStyle=dirt; g.fillRect(0,0,w,h);
});
/* the card catalogue's drawer bank: sixty drawers in oak, each with its
   brass label frame and pull. Drawn, not built — sixty real drawers are
   sixty boxes you only ever see from a metre away */
export const CATALOG_COLS=6, CATALOG_ROWS=10;
export function makeCatalogTexture(){
  return makeCanvas(384,512,(g,w,h)=>{
    const dw=w/CATALOG_COLS, dh=h/CATALOG_ROWS;
    g.fillStyle="#3a2816"; g.fillRect(0,0,w,h);
    const L="ABCDEFGHIJKLMNOPRSTW";
    for(let r=0;r<CATALOG_ROWS;r++)for(let c=0;c<CATALOG_COLS;c++){
      const x=c*dw+3, y=r*dh+3, ww=dw-6, hh=dh-6;
      const tone=0.9+Math.random()*0.2;
      g.fillStyle=`rgb(${118*tone|0},${84*tone|0},${50*tone|0})`; g.fillRect(x,y,ww,hh);
      for(let k=0;k<14;k++){ g.fillStyle=`rgba(40,26,12,${0.08+Math.random()*0.12})`; g.fillRect(x+Math.random()*ww,y,1,hh); }
      g.fillStyle="rgba(255,230,190,0.18)"; g.fillRect(x,y,ww,2);
      g.fillStyle="rgba(0,0,0,0.35)"; g.fillRect(x,y+hh-2,ww,2);
      /* the brass frame, the card in it, and the pull under it */
      const fx=x+ww*0.22, fy=y+hh*0.18, fw=ww*0.56, fh=hh*0.3;
      g.fillStyle="#8a7038"; g.fillRect(fx-2,fy-2,fw+4,fh+4);
      g.fillStyle=Math.random()<0.12? "#2a1e10" : "#ddd2b4"; g.fillRect(fx,fy,fw,fh);
      const i=(r*CATALOG_COLS+c)%L.length;
      g.fillStyle="rgba(40,34,24,0.85)"; g.font="bold 10px Courier New"; g.textAlign="center"; g.textBaseline="middle";
      g.fillText(`${L[i]}–${L[Math.min(L.length-1,i+1)]}`,fx+fw/2,fy+fh/2+1);
      g.fillStyle="#6c5628"; g.beginPath(); g.ellipse(x+ww/2,y+hh*0.72,ww*0.14,hh*0.1,0,0,7); g.fill();
      g.fillStyle="#2a2010"; g.beginPath(); g.ellipse(x+ww/2,y+hh*0.75,ww*0.1,hh*0.05,0,0,7); g.fill();
    }
  });
}
/* loose paper: four kinds on one canvas — a typed page, a ruled form, an
   index card, a torn notebook sheet. PAPER_UV[i] is each one's window. */
export const texPaperSheets=makeCanvas(512,512,(g,w,h)=>{
  const cell=(x,y,cw,ch,fn)=>{ g.save(); g.beginPath(); g.rect(x,y,cw,ch); g.clip(); fn(x,y,cw,ch); g.restore(); };
  cell(0,0,256,256,(x,y,cw,ch)=>{
    g.fillStyle="#d6ceb6"; g.fillRect(x,y,cw,ch);
    g.fillStyle="rgba(40,36,30,0.55)";
    for(let l=0;l<22;l++) g.fillRect(x+26,y+30+l*9,(cw-52)*(l%7===6?0.4:0.8+Math.random()*0.2),2);
  });
  cell(256,0,256,256,(x,y,cw,ch)=>{
    g.fillStyle="#cfd2c4"; g.fillRect(x,y,cw,ch);
    g.strokeStyle="rgba(60,80,110,0.45)"; g.lineWidth=1;
    for(let l=0;l<14;l++){ g.beginPath(); g.moveTo(x+14,y+40+l*14); g.lineTo(x+cw-14,y+40+l*14); g.stroke(); }
    g.beginPath(); g.moveTo(x+cw*0.4,y+34); g.lineTo(x+cw*0.4,y+ch-20); g.stroke();
    g.fillStyle="rgba(40,36,30,0.7)"; g.font="bold 12px Arial"; g.fillText("RETURN SLIP",x+14,y+22);
  });
  cell(0,256,256,256,(x,y,cw,ch)=>{
    g.fillStyle="#e2dcc6"; g.fillRect(x,y,cw,ch);
    g.strokeStyle="rgba(170,60,50,0.5)"; g.beginPath(); g.moveTo(x+10,y+46); g.lineTo(x+cw-10,y+46); g.stroke();
    g.strokeStyle="rgba(60,90,130,0.3)";
    for(let l=0;l<10;l++){ g.beginPath(); g.moveTo(x+10,y+66+l*18); g.lineTo(x+cw-10,y+66+l*18); g.stroke(); }
    g.fillStyle="rgba(30,28,24,0.75)"; g.font="bold 14px Courier New"; g.fillText("823.9  VOS",x+14,y+32);
  });
  cell(256,256,256,256,(x,y,cw,ch)=>{
    g.fillStyle="#d8d4c2"; g.fillRect(x,y,cw,ch);
    g.strokeStyle="rgba(80,110,150,0.35)";
    for(let l=0;l<16;l++){ g.beginPath(); g.moveTo(x,y+24+l*14); g.lineTo(x+cw,y+24+l*14); g.stroke(); }
    g.fillStyle="rgba(30,34,60,0.55)";
    for(let l=0;l<8;l++){ let px=x+20; while(px<x+cw-30){ const ww=6+Math.random()*24; g.fillRect(px,y+36+l*28,ww,1.6); px+=ww+6+Math.random()*10; } }
  });
  for(let i=0;i<20;i++){ const x=Math.random()*w,y=Math.random()*h,r=8+Math.random()*30;
    const gr=g.createRadialGradient(x,y,1,x,y,r); gr.addColorStop(0,"rgba(110,82,40,0.14)"); gr.addColorStop(1,"rgba(110,82,40,0)");
    g.fillStyle=gr; g.fillRect(x-r,y-r,r*2,r*2); }
});
export const PAPER_UV=[[0.02,0.52,0.48,0.98],[0.52,0.52,0.98,0.98],[0.02,0.02,0.48,0.48],[0.52,0.02,0.98,0.48]];
/* ================= the way down =================
   The shaft behind the desk, from the top: the floor in SECTION (carpet,
   underlay, screed, a slab with its rebar cut), then the earth the
   librarian dug through, then the dressed stone of a stair that was down
   there long before the library was built over it. */
/* ashlar: eight courses to the tile, each course one tread's rise, so the
   stair climbs the wall on the coursing. 1024² — you walk the stair an arm's
   length from this, and at 512 it was soft. The colour map and the height
   map are drawn from ONE layout (every random drawn up front into it), the
   ceiling foam's lesson: two maps that roll their own randoms describe two
   different walls. The relief is its own map because the colour's shading
   used as a bump tilted every block the same way and left the faces flat.
   Blocks are polygons with softened, chipped arrises, dressed with chisel
   striations and pitted — a rectangle with a gradient in it is a tile. */
const MAS_S=1024, MAS_C=8;
const MAS_LAYOUT=(()=>{
  const W=MAS_S, CH=MAS_S/MAS_C, blocks=[];
  for(let c=0;c<MAS_C;c++){
    let x=Math.random()*W; const x0=x;
    while(x<x0+W-60){
      const bw=Math.min(200+Math.random()*220,x0+W-x);
      const y0=c*CH, j=()=>2+Math.random()*5;
      /* the face, inset from the joint by an uneven margin */
      const poly=[[x+j(),y0+j()],[x+bw*0.5,y0+2+Math.random()*3],[x+bw-j(),y0+j()],
                  [x+bw-2-Math.random()*3,y0+CH*0.5],[x+bw-j(),y0+CH-j()],[x+bw*0.5,y0+CH-2-Math.random()*3],
                  [x+j(),y0+CH-j()],[x+2+Math.random()*3,y0+CH*0.5]];
      const chips=[];
      for(let k=0,n=Math.floor(Math.random()*4);k<n;k++){
        const top=Math.random()<0.5, cx=x+10+Math.random()*(bw-20), cy=top? y0+4 : y0+CH-4, r=6+Math.random()*16;
        const pts=[]; for(let q=0;q<7;q++){ const a=q/7*Math.PI*2; pts.push([cx+Math.cos(a)*r*(0.5+Math.random()*0.6), cy+Math.sin(a)*r*(0.35+Math.random()*0.4)]); }
        chips.push(pts);
      }
      const ang=(Math.random()-0.5)*1.2+(Math.random()<0.5?0.6:-0.6), strokes=[];
      for(let k=0;k<70;k++){
        const sx=x+Math.random()*bw, sy=y0+6+Math.random()*(CH-12), l=6+Math.random()*16;
        strokes.push([sx,sy,sx+Math.cos(ang)*l,sy+Math.sin(ang)*l,Math.random()]);
      }
      const pits=[]; for(let k=0;k<30;k++) pits.push([x+Math.random()*bw,y0+4+Math.random()*(CH-8),0.6+Math.random()*1.8]);
      const mottle=[]; for(let k=0;k<14;k++) mottle.push([x+Math.random()*bw,y0+Math.random()*CH,10+Math.random()*34,(Math.random()-0.5)*0.24]);
      blocks.push({x,bw,y0,poly,chips,strokes,pits,mottle,t:44+Math.random()*26,warm:Math.random()*8,
                   cx:x+bw*(0.3+Math.random()*0.4), cy:y0+CH*(0.3+Math.random()*0.4)});
      x+=bw;
    }
  }
  const damp=[]; for(let i=0;i<14;i++) damp.push([Math.random()*W,Math.random()*W,14+Math.random()*50,160+Math.random()*400]);
  const salts=[]; for(let i=0;i<50;i++) salts.push([Math.random()*W,Math.random()*W,4+Math.random()*18]);
  return {blocks,damp,salts,CH};
})();
function drawMasonry(g,w,h,bump){
  const L=MAS_LAYOUT;
  const wrapX=fn=>{ for(const ox of[0,-w,w]) fn(ox); };
  const path=(pts,ox)=>{ g.beginPath(); pts.forEach(([px,py],i)=>i?g.lineTo(px+ox,py):g.moveTo(px+ox,py)); g.closePath(); };
  g.fillStyle=bump? "#3a3a3a" : "#3a352e"; g.fillRect(0,0,w,h);
  for(let i=0;i<(bump?4000:9000);i++){                           // the joints are sand and lime, not paint
    const v=Math.random();
    g.fillStyle=bump? `rgba(${v<0.5?20:70},${v<0.5?20:70},${v<0.5?20:70},0.5)`
                    : (v<0.5? `rgba(30,27,22,0.3)` : `rgba(96,90,78,0.22)`);
    g.fillRect(Math.random()*w,Math.random()*h,1+Math.random()*2,1+Math.random()*2);
  }
  for(const b of L.blocks) wrapX(ox=>{
    if(b.x+b.bw+ox<0||b.x+ox>w) return;
    g.save(); path(b.poly,ox); g.clip();
    /* the face: pillowed in relief, mottled in colour, a little lighter
       toward its top where the light down the shaft falls */
    const r=Math.max(b.bw,L.CH);
    const gr=g.createRadialGradient(b.cx+ox,b.cy,4,b.cx+ox,b.cy,r*0.75);
    if(bump){ gr.addColorStop(0,"#d8d8d8"); gr.addColorStop(1,"#a4a4a4"); }
    else { const t=b.t; gr.addColorStop(0,`rgb(${t+10+b.warm|0},${t+6|0},${t-2|0})`); gr.addColorStop(1,`rgb(${t-10+b.warm|0},${t-14|0},${t-22|0})`); }
    g.fillStyle=gr; g.fillRect(b.x+ox,b.y0,b.bw,L.CH);
    /* stone: a mottle of soft patches and a fine grain, so the face is
       rock and not a flat fill */
    for(const [mx,my,mr,mv] of b.mottle){
      const mg=g.createRadialGradient(mx+ox,my,0,mx+ox,my,mr);
      const c=bump? (mv>0?"255,255,255":"0,0,0") : (mv>0?"150,140,122":"10,9,7");
      mg.addColorStop(0,`rgba(${c},${Math.abs(mv)})`); mg.addColorStop(1,`rgba(${c},0)`);
      g.fillStyle=mg; g.fillRect(mx+ox-mr,my-mr,mr*2,mr*2);
    }
    if(!bump){
      const lg=g.createLinearGradient(0,b.y0,0,b.y0+L.CH);
      lg.addColorStop(0,"rgba(255,240,210,0.06)"); lg.addColorStop(1,"rgba(0,0,0,0.12)");
      g.fillStyle=lg; g.fillRect(b.x+ox,b.y0,b.bw,L.CH);
    }
    /* the dressing: parallel chisel strokes and the pits between them */
    for(const [x0,y0,x1,y1,k] of b.strokes){
      g.strokeStyle= bump? `rgba(${k<0.6?90:210},${k<0.6?90:210},${k<0.6?90:210},0.22)`
                         : (k<0.6? `rgba(14,12,10,0.07)` : `rgba(170,160,140,0.05)`);
      g.lineWidth=0.9;
      g.beginPath(); g.moveTo(x0+ox,y0); g.lineTo(x1+ox,y1); g.stroke();
    }
    for(const [px,py,pr] of b.pits){
      g.fillStyle=bump? "rgba(60,60,60,0.6)" : "rgba(12,10,8,0.22)";
      g.beginPath(); g.arc(px+ox,py,pr*0.6,0,7); g.fill();
    }
    g.restore();
    /* spalled arrises: bites out of the edge, down toward the joint */
    for(const c of b.chips){
      path(c,ox);
      g.fillStyle=bump? "rgba(78,78,78,1)" : `rgba(${b.t-18|0},${b.t-20|0},${b.t-24|0},1)`;
      g.fill();
    }
  });
  /* the fine grain of the stone: noise, not dots, and cheap */
  addGrain(g,w,h,bump?[46,46,46]:[16,15,13]);
  if(bump) return;
  for(const [x,y,wd,ln] of L.damp) for(const ox of[0,-w,w]) for(const oy of[0,-h]){
    const gr=g.createLinearGradient(0,y+oy,0,y+oy+ln);
    gr.addColorStop(0,"rgba(10,12,12,0)"); gr.addColorStop(0.3,"rgba(10,12,12,0.24)"); gr.addColorStop(1,"rgba(10,12,12,0)");
    g.fillStyle=gr; g.fillRect(x+ox-wd/2,y+oy,wd,ln);
  }
  for(const [x,y,r] of L.salts){
    const gr=g.createRadialGradient(x,y,0,x,y,r);
    gr.addColorStop(0,"rgba(200,204,196,0.2)"); gr.addColorStop(1,"rgba(200,204,196,0)");
    g.fillStyle=gr; g.fillRect(x-r,y-r,r*2,r*2);
  }
}
export const texShaftMasonry=makeCanvas(MAS_S,MAS_S,(g,w,h)=>drawMasonry(g,w,h,false));
export const texShaftMasonryBump=makeCanvas(MAS_S,MAS_S,(g,w,h)=>drawMasonry(g,w,h,true));
/* loose earth: soft blotches under clods lit on top, pebbles, root hairs,
   all drawn wrapped. 512² for the same reason as the stone. */
export const texSpoil=makeCanvas(512,512,(g,w,h)=>{
  g.fillStyle="#3a2b1c"; g.fillRect(0,0,w,h);
  const wrap=(x,y,fn)=>{ for(const ox of[0,-w,w]) for(const oy of[0,-h,h]) fn(x+ox,y+oy); };
  for(let i=0;i<34;i++){
    const x=Math.random()*w, y=Math.random()*h, r=40+Math.random()*100, dk=Math.random()<0.5;
    wrap(x,y,(px,py)=>{ const gr=g.createRadialGradient(px,py,1,px,py,r);
      gr.addColorStop(0,dk?"rgba(20,14,8,0.35)":"rgba(96,74,48,0.3)"); gr.addColorStop(1,"rgba(40,30,20,0)");
      g.fillStyle=gr; g.fillRect(px-r,py-r,r*2,r*2); });
  }
  for(let i=0;i<5000;i++){                                       // the fine grain of it
    const v=Math.random();
    g.fillStyle=v<0.5? `rgba(18,12,6,${0.15+Math.random()*0.2})` : `rgba(110,86,58,${0.1+Math.random()*0.15})`;
    g.fillRect(Math.random()*w,Math.random()*h,1+Math.random()*1.5,1+Math.random()*1.5);
  }
  for(let i=0;i<1300;i++){
    const x=Math.random()*w, y=Math.random()*h, r=1.2+Math.random()*4.5;
    const t=Math.random();
    wrap(x,y,(px,py)=>{
      g.fillStyle=`rgba(18,12,6,${0.2+Math.random()*0.2})`; g.beginPath(); g.ellipse(px+1,py+1.5,r,r*0.7,0,0,7); g.fill();
      g.fillStyle=t<0.8? `rgba(${70+Math.random()*24|0},${52+Math.random()*16|0},${34+Math.random()*12|0},0.7)`
                       : `rgba(${74+Math.random()*16|0},${66+Math.random()*14|0},${54+Math.random()*12|0},0.6)`;
      g.beginPath(); g.ellipse(px,py,r,r*0.7,Math.random()*3,0,7); g.fill();
    });
  }
  for(let i=0;i<26;i++){                                         // stones, each with a lit crown
    const x=Math.random()*w, y=Math.random()*h, r=4+Math.random()*9, t=58+Math.random()*24;
    wrap(x,y,(px,py)=>{
      g.fillStyle="rgba(16,12,8,0.6)"; g.beginPath(); g.ellipse(px+1.5,py+2.5,r,r*0.75,0,0,7); g.fill();
      const gr=g.createRadialGradient(px-r*0.3,py-r*0.4,1,px,py,r);
      gr.addColorStop(0,`rgb(${t+14|0},${t+10|0},${t+4|0})`); gr.addColorStop(1,`rgb(${t-24|0},${t-26|0},${t-30|0})`);
      g.fillStyle=gr; g.beginPath(); g.ellipse(px,py,r,r*0.75,Math.random()*3,0,7); g.fill();
    });
  }
  g.strokeStyle="rgba(150,120,80,0.35)"; g.lineWidth=1;
  for(let i=0;i<50;i++){
    let x=Math.random()*w, y=Math.random()*h, a=Math.random()*7;
    g.beginPath(); g.moveTo(x,y);
    for(let k=0;k<10;k++){ a+=(Math.random()-0.5)*0.9; x+=Math.cos(a)*9; y+=Math.sin(a)*9; g.lineTo(x,y); }
    g.stroke();
  }
});
/* the floor in section, top to bottom over the canvas height: carpet pile,
   underlay, screed, the structural slab with its rebar cut through, and the
   earth under it */
export const texSlabSection=makeCanvas(1024,128,(g,w,h)=>{
  g.fillStyle="#4a4a48"; g.fillRect(0,0,w,h);
  for(let x=0;x<w;x++){ g.fillStyle=`rgba(${60+Math.random()*30|0},${70+Math.random()*30|0},${86+Math.random()*30|0},1)`; g.fillRect(x,0,1,6+Math.random()*4); }
  g.fillStyle="#1e1a16"; g.fillRect(0,10,w,6);
  g.fillStyle="#7a766c"; g.fillRect(0,16,w,18);
  for(let i=0;i<9600;i++){
    g.fillStyle=Math.random()<0.5? "rgba(40,38,34,0.5)" : "rgba(160,154,140,0.4)";
    g.fillRect(Math.random()*w,34+Math.random()*72,1+Math.random()*3,1+Math.random()*3);
  }
  for(let i=0;i<260;i++){                                         // aggregate, cut through
    const x=Math.random()*w, y=36+Math.random()*68, r=1.5+Math.random()*3.5;
    g.fillStyle=`rgba(${110+Math.random()*50|0},${104+Math.random()*44|0},${92+Math.random()*40|0},0.9)`;
    g.beginPath(); g.ellipse(x,y,r,r*0.7,Math.random()*3,0,7); g.fill();
  }
  g.fillStyle="rgba(20,18,16,0.6)"; g.fillRect(0,34,w,2);
  for(let x=36;x<w;x+=76){
    const rx=x+Math.random()*12;
    g.fillStyle="rgba(120,60,20,0.45)"; g.beginPath(); g.arc(rx,76,9,0,7); g.fill();
    g.fillStyle="#3a2210"; g.beginPath(); g.arc(rx,72,5.2,0,7); g.fill();
  }
  const e=g.createLinearGradient(0,100,0,128); e.addColorStop(0,"rgba(62,46,30,0)"); e.addColorStop(1,"rgba(62,46,30,1)");
  g.fillStyle=e; g.fillRect(0,100,w,28);
  for(let i=0;i<120;i++){ const x=Math.random()*w; g.fillStyle="rgba(20,16,12,0.5)"; g.fillRect(x,34,1+Math.random()*2,Math.random()*60); }
});
/* ================= polythene: the film things are left wrapped in ==========
   The wrap was a box at 0.18 opacity with a flat blue-grey on it, which from
   any angle is a CUBE OF FOG — a solid you can partly see through, not a
   sheet. What makes film read as film is never the tint: it is the CREASES.
   A sheet of polythene is optically almost nothing across its faces and goes
   milk-white exactly where it has folded back on itself, so the alpha here is
   CREASE-SHAPED — the cave's silk rule again, and for the same reason. Break
   it with one broad translucent fill and the bundle turns back into frosted
   glass. u wraps the bundle, v runs base → gather at the top.
   POT + mipmapped: distant wrapped chairs must soften to haze rather than
   alias their creases into a field of scratches. */
export function makeWrapTexture(){
  const t=makeCanvas(256,256,(g,w,h)=>{
    g.clearRect(0,0,w,h);
    /* the body of the sheet: barely there at all */
    g.fillStyle="rgba(222,230,234,0.045)";g.fillRect(0,0,w,h);
    const wrapX=fn=>{ for(const ox of[0,-w,w]) fn(ox); };
    /* THERE ARE NO SOFT BLOOMS HERE, and there must never be. The first pass
       laid down nine radial gradients up to a third of the canvas across as
       "where the sheet lies doubled" — and a 60px soft ellipse at 0.12 alpha
       is not a fold, it is a milky PATCH, which on the bag came out as a
       glowing oval floating over the object inside. Same rule, same reason
       as the cave's silk: alpha is CREASE-shaped, full stop. Everything
       below is a stroke. */
    /* a crease is a WALK, not a line — but an ANGULAR one. The polythene
       here folds and folds back; smooth arcs across a translucent shell read
       as scratches on glass, which is what turned the first bundle into a
       bell jar. Big heading jitter, long steps, hard kinks. */
    const crease=(x,y,ang,len,a,wid)=>{
      const pts=[[x,y]];
      let cx=x, cy=y, ca=ang;
      for(let s=0;s<len;s+=11){
        ca+=(Math.random()-0.5)*1.15;
        cx+=Math.sin(ca)*11; cy+=Math.cos(ca)*11;
        pts.push([cx,cy]);
      }
      wrapX(ox=>{
        for(const[lw,al]of[[wid+2.6,a*0.16],[wid,a]]){
          g.strokeStyle=`rgba(244,249,251,${al})`;g.lineWidth=lw;
          g.lineJoin="miter";g.lineCap="butt";     // a fold has a corner on it
          g.beginPath();g.moveTo(pts[0][0]+ox,pts[0][1]);
          for(let i=1;i<pts.length;i++) g.lineTo(pts[i][0]+ox,pts[i][1]);
          g.stroke();
        }
      });
    };
    /* Heading matters more than count. A field of long near-parallel
       verticals is a HAIRNET, which is what the first pass came out as — so
       most of these run at a real angle, and they are short: a crease is
       where the sheet folded once, not a thread running the height of the
       bundle. */
    for(let i=0;i<26;i++){
      const diag=Math.random()<0.6;
      crease(Math.random()*w, Math.random()*h,
        diag? (Math.random()<0.5?1:-1)*(0.6+Math.random()*0.8) : (Math.random()-0.5)*0.5,
        34+Math.random()*90, 0.22+Math.random()*0.32, 0.8+Math.random()*1.4);
    }
    /* the gather: a few converging on the twist at the top, and no more —
       this family IS parallel by construction, so it has to stay small */
    const apex=Math.random()*w;
    for(let i=0;i<7;i++){
      const x0=Math.random()*w;
      let dx=apex-x0; if(dx>w/2) dx-=w; if(dx<-w/2) dx+=w;
      crease(x0,h*(0.5+Math.random()*0.26),Math.atan2(dx*0.55,-h*0.4),
        40+Math.random()*60, 0.18+Math.random()*0.26, 0.7+Math.random());
    }
    /* fine wrinkle: short, every angle, well under the crease alpha */
    for(let i=0;i<300;i++){
      const x=Math.random()*w,y=Math.random()*h,a=Math.random()*7,l=4+Math.random()*18;
      wrapX(ox=>{
        g.strokeStyle=`rgba(238,244,246,${0.06+Math.random()*0.13})`;g.lineWidth=1;
        g.beginPath();g.moveTo(x+ox,y);g.lineTo(x+ox+Math.cos(a)*l,y+Math.sin(a)*l);g.stroke();
      });
    }
    /* dust settled on the outside, and the grey of a storeroom */
    for(let i=0;i<380;i++){
      wrapX(ox=>{
        g.fillStyle=`rgba(198,202,201,${0.06+Math.random()*0.16})`;
        g.fillRect(Math.random()*w+ox,Math.random()*h,1,1);
      });
    }
    /* storeroom grime, as SMEARS rather than blooms — same rule again */
    for(let i=0;i<26;i++){
      const x=Math.random()*w,y=Math.random()*h,a=Math.random()*7,l=8+Math.random()*26;
      wrapX(ox=>{
        g.strokeStyle=`rgba(112,120,124,${0.05+Math.random()*0.1})`;
        g.lineWidth=1+Math.random()*2.4;
        g.beginPath();g.moveTo(x+ox,y);g.lineTo(x+ox+Math.cos(a)*l,y+Math.sin(a)*l);g.stroke();
      });
    }
    /* somebody started opening one: torn holes, ragged, never a rectangle */
    g.globalCompositeOperation="destination-out";
    for(let i=0;i<3;i++){
      const x=Math.random()*w, y=h*(0.15+Math.random()*0.45);
      wrapX(ox=>{
        g.beginPath();g.moveTo(x+ox,y);
        let tx=x+ox, ty=y, ta=Math.random()*7;
        for(let s=0;s<9;s++){
          ta+=(Math.random()-0.5)*1.6;
          tx+=Math.cos(ta)*(4+Math.random()*11); ty+=Math.sin(ta)*(4+Math.random()*11);
          g.lineTo(tx,ty);
        }
        g.closePath();g.fillStyle="rgba(0,0,0,1)";g.fill();
      });
    }
    g.globalCompositeOperation="source-over";
  });
  t.wrapS=THREE.RepeatWrapping; t.wrapT=THREE.ClampToEdgeWrapping;
  t.anisotropy=4;
  return t;
}
/* the tape holding it shut: frosted, stretched along its length, and dull
   where the adhesive has crept out past the edge */
/* stretch film, as it comes off the roll and round a chair. It is WOUND,
   so what you see is the winding: each turn's edge a crisp pale line where
   the film doubles over the turn below, climbing one band a turn (a helix,
   so it meets itself across the u seam), and the fine streaks stretching
   leaves running along the wind. The body is near-clear — the material's
   edge term (filmCompile) is what gives the sheet a surface. u runs round
   the chair, v from the hem to the fold over the top. */
export const FILM_BANDS=5;
export const texStretchFilm=makeCanvas(512,512,(g,w,h)=>{
  g.clearRect(0,0,w,h);
  g.fillStyle="rgba(230,236,238,0.05)"; g.fillRect(0,0,w,h);
  const bandH=h/FILM_BANDS, rise=bandH/w;           // one band a turn
  const helix=(fn)=>{ for(let b=-1;b<=FILM_BANDS;b++) fn(b*bandH); };
  /* the doubled strip under each turn's edge, and the edge itself */
  helix(y0=>{
    for(const ox of[0,-w,w]){
      g.save(); g.translate(ox,0);
      g.beginPath(); g.moveTo(0,h-y0); g.lineTo(w,h-y0-bandH); g.lineTo(w,h-y0-bandH+bandH*0.32); g.lineTo(0,h-y0+bandH*0.32); g.closePath();
      g.fillStyle="rgba(232,238,240,0.07)"; g.fill();
      g.strokeStyle="rgba(244,248,250,0.5)"; g.lineWidth=1.6;
      g.beginPath(); g.moveTo(0,h-y0); g.lineTo(w,h-y0-bandH); g.stroke();
      g.strokeStyle="rgba(244,248,250,0.14)"; g.lineWidth=5;
      g.beginPath(); g.moveTo(0,h-y0+1.5); g.lineTo(w,h-y0-bandH+1.5); g.stroke();
      g.restore();
    }
  });
  /* stretch streaks, running with the wind */
  for(let i=0;i<900;i++){
    const x=Math.random()*w, y=Math.random()*h, l=10+Math.random()*70;
    for(const ox of[0,-w,w]){
      g.strokeStyle=`rgba(240,246,248,${0.04+Math.random()*0.1})`; g.lineWidth=0.5+Math.random()*0.9;
      g.beginPath(); g.moveTo(x+ox,y); g.lineTo(x+ox+l,y-l*rise); g.stroke();
    }
  }
  /* where it folds over the top rail, the sheet bunches */
  for(let i=0;i<60;i++){
    const x=Math.random()*w, y=Math.random()*h*0.12, a=(Math.random()-0.5)*1.6+Math.PI/2, l=8+Math.random()*30;
    g.strokeStyle=`rgba(244,248,250,${0.12+Math.random()*0.2})`; g.lineWidth=0.8+Math.random();
    g.beginPath(); g.moveTo(x,y); g.lineTo(x+Math.cos(a)*l,y+Math.sin(a)*l); g.stroke();
  }
  /* dust on the outside of it */
  for(let i=0;i<500;i++){ g.fillStyle=`rgba(200,196,184,${0.08+Math.random()*0.16})`; g.fillRect(Math.random()*w,Math.random()*h,1,1); }
});
texStretchFilm.wrapT=THREE.ClampToEdgeWrapping;
texStretchFilm.anisotropy=4;
export const texTape=makeCanvas(128,32,(g,w,h)=>{
  g.fillStyle="rgba(212,204,182,0.72)";g.fillRect(0,0,w,h);
  for(let i=0;i<180;i++){                        // adhesive drawn out into fibres
    const y=Math.random()*h;
    g.fillStyle=`rgba(${Math.random()<0.5?168:238},${Math.random()<0.5?160:234},${Math.random()<0.5?138:214},${0.10+Math.random()*0.2})`;
    g.fillRect(Math.random()*w,y,6+Math.random()*40,1);
  }
  for(let i=0;i<8;i++){                          // trapped air, in lens shapes
    const x=Math.random()*w,y=Math.random()*h,r=2+Math.random()*5;
    const gr=g.createRadialGradient(x,y,0,x,y,r);
    gr.addColorStop(0,"rgba(252,250,240,0.55)");gr.addColorStop(1,"rgba(252,250,240,0)");
    g.fillStyle=gr;g.beginPath();g.ellipse(x,y,r*1.9,r,0,0,7);g.fill();
  }
  g.fillStyle="rgba(150,142,120,0.35)";g.fillRect(0,0,w,1.5);g.fillRect(0,h-1.5,w,1.5);
});
texTape.wrapS=THREE.RepeatWrapping; texTape.wrapT=THREE.ClampToEdgeWrapping;

/* ================= the returns trolley's paintwork =================
   Institutional enamel over sheet steel, TILEABLE at a fixed world scale
   (scaleBoxUV), so an end panel and a 20mm deck lip carry the same finish.
   It is kept BRIGHT and near-neutral on purpose: three cart colours are the
   same map under three different material tints, and a map that multiplies a
   colour has to average high or every truck comes out black.
   Chips are PATHS, never fillRect — a rectangular chip is a decal, not
   damage — and nothing here is unique enough to notice repeating. */
export const texCartPaint=makeCanvas(256,256,(g,w,h)=>{
  g.fillStyle="#c8cbc8";g.fillRect(0,0,w,h);
  /* orange peel: the fine roll of a sprayed enamel */
  for(let i=0;i<2600;i++){
    const v=Math.random()<0.5;
    g.fillStyle=`rgba(${v?176:236},${v?180:240},${v?176:238},${0.05+Math.random()*0.12})`;
    g.beginPath();g.arc(Math.random()*w,Math.random()*h,0.8+Math.random()*1.8,0,7);g.fill();
  }
  /* broad tonal drift so no facet is ever one flat value */
  for(let i=0;i<20;i++){
    const x=Math.random()*w,y=Math.random()*h,r=30+Math.random()*80;
    const gr=g.createRadialGradient(x,y,r*0.1,x,y,r);
    gr.addColorStop(0,Math.random()<0.5?"rgba(160,164,162,0.10)":"rgba(246,248,246,0.10)");
    gr.addColorStop(1,"rgba(0,0,0,0)");
    g.fillStyle=gr;g.beginPath();g.arc(x,y,r,0,7);g.fill();
  }
  /* scratches down to the primer — thin, short, at every angle */
  for(let i=0;i<130;i++){
    const x=Math.random()*w,y=Math.random()*h,a=Math.random()*7,l=4+Math.random()*26;
    g.strokeStyle=`rgba(${118+Math.random()*30|0},${104+Math.random()*26|0},${92+Math.random()*24|0},${0.16+Math.random()*0.3})`;
    g.lineWidth=0.7+Math.random();
    g.beginPath();g.moveTo(x,y);g.lineTo(x+Math.cos(a)*l,y+Math.sin(a)*l);g.stroke();
    g.strokeStyle="rgba(250,252,250,0.18)";g.lineWidth=0.6;
    g.beginPath();g.moveTo(x,y+1);g.lineTo(x+Math.cos(a)*l,y+Math.sin(a)*l+1);g.stroke();
  }
  /* chips: a ragged loop of oxide primer with a bright lifted lip, and a
     bare-steel eye in the deepest few. Sparse — at 512 px/m an end panel
     covers about two tiles, and 58 a tile put a hundred dark specks on it,
     which reads as sandpaper rather than as a truck that has been shoved
     into a shelf end a few thousand times. */
  for(let i=0;i<24;i++){
    const x=Math.random()*w,y=Math.random()*h,r=1.6+Math.random()*3.6;
    const path=()=>{
      g.beginPath();
      for(let k=0;k<=9;k++){
        const a=k/9*Math.PI*2, rr=r*(0.55+Math.random()*0.75);
        const px=x+Math.cos(a)*rr, py=y+Math.sin(a)*rr;
        k? g.lineTo(px,py) : g.moveTo(px,py);
      }
      g.closePath();
    };
    g.fillStyle=`rgba(${128+Math.random()*26|0},${106+Math.random()*22|0},${88+Math.random()*20|0},0.7)`;
    path();g.fill();
    g.strokeStyle="rgba(252,254,252,0.3)";g.lineWidth=0.8;path();g.stroke();
    if(Math.random()<0.35){
      g.fillStyle="rgba(158,164,168,0.65)";
      g.beginPath();g.arc(x,y,r*0.42,0,7);g.fill();
    }
  }
});
texCartPaint.wrapS=texCartPaint.wrapT=THREE.RepeatWrapping;
texCartPaint.anisotropy=4;

/* ================= the display forms' fibreglass =================
   A FITTED map, not a tiling one: u wraps the body, v runs base → neck, so
   the two MOULD PARTING SEAMS are VERTICAL strokes at u=0 and u=0.5 — the
   lathe orientation contract the spider's carapace had to learn. Everything
   else is what forty years does to a painted shell: crazing (short and
   angular; long smooth curves tile into worms and, on a body, read as
   veins), chips down to the dark core, dust caught on the upward faces.
   Bright and near-neutral — two materials tint it light and dark. */
export const texMannequin=makeCanvas(256,512,(g,w,h)=>{
  g.fillStyle="#d6d0c4";g.fillRect(0,0,w,h);
  const wrapX=fn=>{ for(const ox of[0,-w,w]) fn(ox); };
  for(let i=0;i<40;i++){                          // the mottle of an old finish
    const x=Math.random()*w,y=Math.random()*h,r=18+Math.random()*70;
    wrapX(ox=>{
      const gr=g.createRadialGradient(x+ox,y,r*0.1,x+ox,y,r);
      gr.addColorStop(0,Math.random()<0.5?`rgba(168,158,142,${0.05+Math.random()*0.08})`
                                         :`rgba(240,236,226,${0.05+Math.random()*0.08})`);
      gr.addColorStop(1,"rgba(0,0,0,0)");
      g.fillStyle=gr;g.beginPath();g.arc(x+ox,y,r,0,7);g.fill();
    });
  }
  /* dust on the shoulders (high v), grime gathered at the hip cut (low v) */
  let gr=g.createLinearGradient(0,h*0.72,0,h);
  gr.addColorStop(0,"rgba(228,224,214,0)");gr.addColorStop(1,"rgba(228,224,214,0.22)");
  g.fillStyle=gr;g.fillRect(0,h*0.72,w,h*0.28);
  gr=g.createLinearGradient(0,h*0.16,0,0);
  gr.addColorStop(0,"rgba(96,88,74,0)");gr.addColorStop(1,"rgba(96,88,74,0.20)");
  g.fillStyle=gr;g.fillRect(0,0,w,h*0.16);
  /* crazing: a mesh of SHORT kinked hairlines, never a long sweep */
  for(let i=0;i<220;i++){
    const x=Math.random()*w, y=Math.random()*h;
    let cx=x, cy=y, a=Math.random()*7;
    wrapX(ox=>{
      g.strokeStyle=`rgba(122,112,96,${0.14+Math.random()*0.26})`;g.lineWidth=0.7;
      g.beginPath();g.moveTo(cx+ox,cy);
      let px=cx, py=cy, pa=a;
      for(let s=0;s<4;s++){
        pa+=(Math.random()-0.5)*1.5;
        px+=Math.cos(pa)*(3+Math.random()*7); py+=Math.sin(pa)*(3+Math.random()*7);
        g.lineTo(px+ox,py);
      }
      g.stroke();
    });
  }
  /* chips down to the darker core, with a lifted lip. Sparse: 34 of them
     drawn three times each for the u-wrap put a hundred dark specks on a
     body, and a hundred dark specks on a pale shell is not damage, it is
     flies. */
  for(let i=0;i<15;i++){
    const x=Math.random()*w,y=Math.random()*h,r=2+Math.random()*4;
    wrapX(ox=>{
      g.beginPath();
      for(let k=0;k<=8;k++){
        const a=k/8*Math.PI*2, rr=r*(0.5+Math.random()*0.8);
        const px=x+ox+Math.cos(a)*rr, py=y+Math.sin(a)*rr;
        k? g.lineTo(px,py) : g.moveTo(px,py);
      }
      g.closePath();
      g.fillStyle=`rgba(${128+Math.random()*26|0},${118+Math.random()*22|0},${102+Math.random()*20|0},0.52)`;g.fill();
      g.strokeStyle="rgba(252,250,244,0.30)";g.lineWidth=0.7;g.stroke();
    });
  }
  /* the two mould seams, wavering slightly the way a hand-finished one does */
  for(const sx of[0,w/2]){
    let x=sx;
    for(let y=0;y<h;y+=4){
      x+=(Math.random()-0.5)*0.7; x=sx+Math.max(-2,Math.min(2,x-sx));
      wrapX(ox=>{
        g.fillStyle="rgba(128,118,102,0.36)";g.fillRect(x+ox,y,1.1,4.2);
        g.fillStyle="rgba(250,248,242,0.24)";g.fillRect(x+ox+1.1,y,0.9,4.2);
      });
    }
  }
  /* the maker's stamp, low on the hip where a real form carries it */
  g.save();
  g.translate(w*0.22,h*0.07);g.rotate(-0.05);
  g.fillStyle="rgba(96,88,74,0.5)";g.font="bold 11px Courier New";g.textAlign="center";
  g.fillText("FORM 7 · SIZE ∅",0,0);
  g.restore();
});
texMannequin.wrapS=THREE.RepeatWrapping; texMannequin.wrapT=THREE.ClampToEdgeWrapping;
texMannequin.anisotropy=4;

/* cut a vertical strip [u0,u1] out of a colony texture — used when a colony
   overhangs its wall section and continues around a corner. flip mirrors the
   strip for wrap planes whose u-axis runs back toward the fold, so the
   growth stays pixel-continuous across the corner. */
export function sliceTexture(tex,u0,u1,flip=false){
  const src=tex.image;
  const sw=Math.max(2,Math.round(src.width*(u1-u0)));
  const c=document.createElement("canvas"); c.width=sw; c.height=src.height;
  const g=c.getContext("2d");
  if(flip){ g.translate(sw,0); g.scale(-1,1); }
  g.drawImage(src, src.width*u0,0,src.width*(u1-u0),src.height, 0,0,sw,src.height);
  const t=new THREE.CanvasTexture(c);
  t.wrapS=t.wrapT=THREE.ClampToEdgeWrapping;
  t.minFilter=THREE.LinearFilter;
  t.generateMipmaps=false;
  return t;
}

/* ================= THE NEST — the cave below ================= */
/* wet karst rock, TILEABLE at a fixed world scale (scaleBoxUV again):
   dark limestone with mineral mottling and seep-streaks that fade in and
   out so the tile seam never betrays itself */
export const texCaveRock = makeCanvas(512,512,(g,w,h)=>{
  /* 512, not 256: the walls are UV'd at 4 m per tile, so 256 gave only
     64 px/m and a facet you stand next to was a smooth gradient. The old
     pass also drew 14 full-width sine curves as "strata" — at this scale
     they tiled into unmistakable dark worms crawling across every wall.
     Rock does not undulate: it fractures. Everything below is either
     multi-scale blotching (so no magnification is ever smooth) or SHORT
     angular joints that carry no repeating rhythm. */
  g.fillStyle="#332f2b";g.fillRect(0,0,w,h);
  const wrap=(fn)=>{ for(const ox of[0,-w,w]) for(const oy of[0,-h,h]) fn(ox,oy); };
  /* 1. broad tonal drift — the biggest scale, keeps whole facets from
     reading as one flat colour. Soft and low-contrast on purpose. */
  for(let i=0;i<26;i++){
    const x=Math.random()*w, y=Math.random()*h, r=60+Math.random()*130;
    const lite=Math.random()<0.45;
    wrap((ox,oy)=>{
      const gr=g.createRadialGradient(x+ox,y+oy,r*0.1,x+ox,y+oy,r);
      gr.addColorStop(0,lite?`rgba(86,79,66,${0.07+Math.random()*0.06})`
                           :`rgba(20,18,15,${0.08+Math.random()*0.07})`);
      gr.addColorStop(1,"rgba(0,0,0,0)");
      g.fillStyle=gr;g.beginPath();g.arc(x+ox,y+oy,r,0,7);g.fill();
    });
  }
  /* 2. mid-scale mineral patches — the mottling you read as "stone" */
  for(let i=0;i<300;i++){
    const x=Math.random()*w, y=Math.random()*h, r=6+Math.random()*26;
    const v=Math.random();
    g.fillStyle=`rgba(${v<0.5?30:82},${v<0.5?28:75},${v<0.5?24:63},${0.05+Math.random()*0.08})`;
    g.beginPath();
    /* irregular blob, not a disc */
    for(let k=0;k<=9;k++){ const a=k/9*Math.PI*2, rr=r*(0.6+Math.random()*0.7);
      const px=x+Math.cos(a)*rr, py=y+Math.sin(a)*rr;
      k?g.lineTo(px,py):g.moveTo(px,py); }
    g.closePath();g.fill();
  }
  /* 3. joints and fractures: short, straight-ish, angular, in a couple of
     dominant directions like real bedding — drawn wrapped so the tile
     seam never cuts one in half */
  for(let fam=0;fam<3;fam++){
    const base=Math.random()*Math.PI;
    for(let i=0;i<26;i++){
      const a=base+(Math.random()-0.5)*0.55;
      const len=w*(0.06+Math.random()*0.20);
      const x0=Math.random()*w, y0=Math.random()*h;
      const segs=2+Math.floor(Math.random()*3);
      const dark=0.10+Math.random()*0.16;
      wrap((ox,oy)=>{
        g.strokeStyle=`rgba(14,12,10,${dark})`;
        g.lineWidth=0.6+Math.random()*1.3;
        g.beginPath();g.moveTo(x0+ox,y0+oy);
        let cx=x0+ox, cy=y0+oy, aa=a;
        for(let s=0;s<segs;s++){                 // kinked, never curved
          aa+=(Math.random()-0.5)*0.5;
          cx+=Math.cos(aa)*len/segs; cy+=Math.sin(aa)*len/segs;
          g.lineTo(cx,cy);
        }
        g.stroke();
        /* the pale lip where the fracture face catches light */
        g.strokeStyle=`rgba(122,114,96,${dark*0.5})`;
        g.lineWidth=0.5; g.beginPath();
        g.moveTo(x0+ox+1,y0+oy+1); g.lineTo(cx+1,cy+1); g.stroke();
      });
    }
  }
  /* 4. seep streaks (fade both ends — seam-safe), fewer and fainter */
  for(let i=0;i<9;i++){
    const x=Math.random()*w, ww=4+Math.random()*16, y0=Math.random()*h*0.5;
    const gr=g.createLinearGradient(0,y0,0,y0+h*0.5);
    const a=0.05+Math.random()*0.08;
    gr.addColorStop(0,"rgba(14,16,14,0)");
    gr.addColorStop(0.5,`rgba(14,16,14,${a})`);
    gr.addColorStop(1,"rgba(14,16,14,0)");
    g.fillStyle=gr;g.fillRect(x,y0,ww,h*0.5);
  }
  /* 5. grain: the close-up layer. Cheap, and the reason a facet you press
     your face against still has something to look at. */
  for(let i=0;i<7000;i++){
    const v=Math.random();
    g.fillStyle=`rgba(${v<0.5?24:96},${v<0.5?22:88},${v<0.5?18:74},${0.05+Math.random()*0.12})`;
    g.fillRect(Math.random()*w,Math.random()*h,1+Math.random()*2,1+Math.random()*2);
  }
  /* 6. pits and chips — small dark spots with a bright lower lip */
  for(let i=0;i<220;i++){
    const x=Math.random()*w, y=Math.random()*h, r=1+Math.random()*3.5;
    g.fillStyle=`rgba(16,14,12,${0.14+Math.random()*0.2})`;
    g.beginPath();g.arc(x,y,r,0,7);g.fill();
    g.fillStyle=`rgba(120,112,94,${0.08+Math.random()*0.12})`;
    g.beginPath();g.arc(x+r*0.4,y+r*0.5,r*0.55,0,7);g.fill();
  }
});
/* the cave floor: packed sediment, bone-dry dust, scattered grit */
export const texCaveFloor = makeCanvas(512,512,(g,w,h)=>{
  /* The old floor was 9000 1.5px dots plus a few soft blotches — all of it
     below the size the eye resolves at walking distance, so it averaged
     out to flat brown and gave the bump map nothing to bite on. A cave
     floor is deposited: sheets of sediment laid over each other, drying
     cracks, channels where water ran, and stones sitting proud of it.
     Those are all MID-scale features, and that is the scale that was
     missing. Everything is drawn wrapped so the 4m tile never seams. */
  const wrap=(fn)=>{ for(const ox of[0,-w,w]) for(const oy of[0,-h,h]) fn(ox,oy); };
  g.fillStyle="#2b2723";g.fillRect(0,0,w,h);
  /* 1. sediment sheets: broad overlapping lobes of slightly different silt */
  for(let i=0;i<34;i++){
    const x=Math.random()*w, y=Math.random()*h, r=45+Math.random()*120;
    const warm=Math.random()<0.5;
    const col=warm? [72,64,50] : [38,36,31];
    g.fillStyle=`rgba(${col[0]},${col[1]},${col[2]},${0.05+Math.random()*0.07})`;
    wrap((ox,oy)=>{
      g.beginPath();
      for(let k=0;k<=11;k++){ const a=k/11*Math.PI*2, rr=r*(0.62+Math.random()*0.62);
        const px=x+ox+Math.cos(a)*rr, py=y+oy+Math.sin(a)*rr;
        k?g.lineTo(px,py):g.moveTo(px,py); }
      g.closePath();g.fill();
    });
  }
  /* 2. runoff channels: shallow darker lines where water last moved */
  for(let i=0;i<12;i++){
    let x=Math.random()*w, y=Math.random()*h, a=Math.random()*Math.PI*2;
    const pts=[[x,y]];
    for(let k=0;k<14;k++){ a+=(Math.random()-0.5)*0.7; x+=Math.cos(a)*22; y+=Math.sin(a)*22; pts.push([x,y]); }
    wrap((ox,oy)=>{
      g.strokeStyle=`rgba(16,15,12,${0.07+Math.random()*0.08})`;
      g.lineWidth=5+Math.random()*11; g.lineJoin="round"; g.lineCap="round";
      g.beginPath(); pts.forEach(([px,py],k)=>k?g.lineTo(px+ox,py+oy):g.moveTo(px+ox,py+oy)); g.stroke();
      g.strokeStyle=`rgba(96,88,70,${0.05+Math.random()*0.05})`;   // the dry lip alongside
      g.lineWidth=1.6; g.stroke();
    });
  }
  /* 3. drying cracks: polygonal, the signature of silt that dried out */
  for(let i=0;i<26;i++){
    const cx=Math.random()*w, cy=Math.random()*h, n=3+Math.floor(Math.random()*3);
    const R=12+Math.random()*30;
    wrap((ox,oy)=>{
      g.strokeStyle=`rgba(12,11,9,${0.14+Math.random()*0.16})`;
      g.lineWidth=0.7+Math.random()*0.9;
      for(let k=0;k<n;k++){
        const a=Math.random()*Math.PI*2;
        g.beginPath(); g.moveTo(cx+ox,cy+oy);
        let px=cx+ox, py=cy+oy, aa=a;
        for(let s=0;s<3;s++){ aa+=(Math.random()-0.5)*0.9;
          px+=Math.cos(aa)*R/3; py+=Math.sin(aa)*R/3; g.lineTo(px,py); }
        g.stroke();
      }
    });
  }
  /* 4. the grain, and stones sitting proud with a lit top and a cast shade */
  for(let i=0;i<11000;i++){const v=Math.random();
    g.fillStyle=`rgba(${v<.5?22:62},${v<.5?20:56},${v<.5?17:46},0.28)`;
    g.fillRect(Math.random()*w,Math.random()*h,1.5,1.5);}
  for(let i=0;i<420;i++){
    const x=Math.random()*w, y=Math.random()*h, r=1.2+Math.random()*4.2;
    g.fillStyle=`rgba(10,9,7,${0.16+Math.random()*0.2})`;          // the shade it casts
    g.beginPath();g.ellipse(x+r*0.4,y+r*0.45,r,r*0.8,0,0,7);g.fill();
    g.fillStyle=`rgba(${74+Math.random()*44|0},${68+Math.random()*36|0},${56+Math.random()*28|0},${0.30+Math.random()*0.35})`;
    g.beginPath();g.ellipse(x,y,r*0.92,r*0.72,Math.random()*3,0,7);g.fill();
    g.fillStyle=`rgba(${118+Math.random()*40|0},${110+Math.random()*34|0},${92+Math.random()*26|0},${0.14+Math.random()*0.2})`;
    g.beginPath();g.ellipse(x-r*0.22,y-r*0.24,r*0.42,r*0.30,0,0,7);g.fill();   // its lit crown
  }
});
/* wet dripstone: pale calcite laid down in growth bands, drip streaks
   running the length of the formation. Doubles as its own bump map, so
   the streaks become real ridges under the lantern's raking beam. */
export const texDripstone = makeCanvas(128,256,(g,w,h)=>{
  const grd=g.createLinearGradient(0,0,0,h);
  grd.addColorStop(0,"#82888a"); grd.addColorStop(0.5,"#909692"); grd.addColorStop(1,"#7e8482");
  g.fillStyle=grd; g.fillRect(0,0,w,h);
  for(let i=0;i<10;i++){                 // damp staining: broad soft blotches
    const x=Math.random()*w, y=Math.random()*h, r=18+Math.random()*44;
    const gr=g.createRadialGradient(x,y,2,x,y,r);
    const dark=Math.random()<0.6;
    gr.addColorStop(0,dark?`rgba(48,54,52,${0.14+Math.random()*0.14})`
                          :`rgba(198,202,190,${0.10+Math.random()*0.10})`);
    gr.addColorStop(1,"rgba(0,0,0,0)");
    g.fillStyle=gr; g.fillRect(x-r,y-r,r*2,r*2);
  }
  for(let i=0;i<26;i++){                 // growth bands: rings of drier/wetter seasons
    const y=Math.random()*h, th=1+Math.random()*4;
    g.fillStyle=Math.random()<0.5?`rgba(54,58,54,${0.10+Math.random()*0.14})`
                                 :`rgba(200,196,180,${0.08+Math.random()*0.11})`;
    g.fillRect(0,y,w,th);
  }
  for(let i=0;i<34;i++){                 // drip streaks: full-height runnels, slightly wandering
    const x0=Math.random()*w, ww=1+Math.random()*3;
    g.strokeStyle=Math.random()<0.45?`rgba(212,218,212,${0.14+Math.random()*0.16})`
                                    :`rgba(38,43,41,${0.15+Math.random()*0.18})`;
    g.lineWidth=ww;
    for(const off of [0,-w,w]){          // drawn thrice so the wrap seam stays seamless
      g.beginPath(); g.moveTo(x0+off,0);
      for(let y=0;y<=h;y+=12) g.lineTo(x0+off+Math.sin(y*0.05+i)*2.5,y);
      g.stroke();
    }
  }
  for(let i=0;i<900;i++){                // crystalline mottle
    const v=Math.random();
    g.fillStyle=`rgba(${v<0.5?96:186},${v<0.5?101:190},${v<0.5?97:182},${0.07+Math.random()*0.10})`;
    g.fillRect(Math.random()*w,Math.random()*h,1+Math.random()*2.5,1+Math.random()*2);
  }
  for(let i=0;i<60;i++){                 // wet sparkle pinpoints
    g.fillStyle=`rgba(226,234,232,${0.18+Math.random()*0.28})`;
    g.fillRect(Math.random()*w,Math.random()*h,1,1);
  }
});
/* ---- the silk family: four textures for THE NEST's web system ----
   All alpha-on-transparency; the geometry they dress is 3D (sagging
   sheets, fans, funnels, strands), so these only carry the weave.

   The rule these all obey: ALPHA IS THREAD-SHAPED. Nothing here paints a
   broad translucent fill — a fill is what turned a sheet web into a pane
   of dirty glass hanging in the air. Every pixel that is not on a thread
   is fully clear, and the sheets fade out at their border so the quad's
   own rectangle never shows up as an edge. Mipmaps are ON (these are all
   power-of-two): a metre of 1px threads seen from 20m should soften into
   grey haze the way a real web does, not crawl and sparkle. */
const silkClamp=t=>{
  t.wrapS=t.wrapT=THREE.ClampToEdgeWrapping;
  t.minFilter=THREE.LinearMipmapLinearFilter; t.magFilter=THREE.LinearFilter;
  t.generateMipmaps=true; t.anisotropy=4; return t;
};
/* one slightly wavering thread from a to b — silk never runs dead straight */
function silkThread(g,x0,y0,x1,y1,a,lw,waver){
  const dx=x1-x0, dy=y1-y0, L=Math.hypot(dx,dy)||1;
  const nx=-dy/L, ny=dx/L, ph=Math.random()*9;
  g.strokeStyle=`rgba(228,233,236,${a})`; g.lineWidth=lw;
  g.beginPath(); g.moveTo(x0,y0);
  const seg=Math.max(3,Math.round(L/9));
  for(let i=1;i<=seg;i++){
    const t=i/seg, s=Math.sin(t*Math.PI)*(waver||0)*Math.sin(ph+t*4.1);
    g.lineTo(x0+dx*t+nx*s, y0+dy*t+ny*s);
  }
  g.stroke();
}
/* fade the border so a sheet dissolves instead of ending on the quad's edge */
function silkFeather(g,w,h,inset){
  g.globalCompositeOperation="destination-out";
  const band=(x,y,ww,hh,x0,y0,x1,y1)=>{
    const gr=g.createLinearGradient(x0,y0,x1,y1);
    gr.addColorStop(0,"rgba(0,0,0,1)"); gr.addColorStop(1,"rgba(0,0,0,0)");
    g.fillStyle=gr; g.fillRect(x,y,ww,hh);
  };
  band(0,0,w,inset, 0,0,0,inset);            // top
  band(0,h-inset,w,inset, 0,h,0,h-inset);    // bottom
  band(0,0,inset,h, 0,0,inset,0);            // left
  band(w-inset,0,inset,h, w,0,w-inset,0);    // right
  g.globalCompositeOperation="source-over";
}
/* a woven silk sheet: a real tangle — long anchor lines spanning the panel,
   a dense drift of cross-threads caught between them, and the small snarls
   where the weave doubled back on itself. torn=true punches the big ragged
   pass-through something left when it went through (the squeeze veils). */
export function makeWebSheetTexture(torn){
  return silkClamp(makeCanvas(256,256,(g,w,h)=>{
    g.clearRect(0,0,w,h);
    g.lineCap="round";
    /* 1. anchor lines: long, taut, spanning the sheet in two loose families */
    for(let L=0;L<2;L++){
      const baseA=Math.random()*Math.PI;
      for(let i=0;i<11;i++){
        const a=baseA+(Math.random()-0.5)*0.42, len=w*(1.1+Math.random()*0.5);
        const cx=Math.random()*w, cy=Math.random()*h;
        silkThread(g, cx-Math.cos(a)*len/2, cy-Math.sin(a)*len/2,
                      cx+Math.cos(a)*len/2, cy+Math.sin(a)*len/2,
                   0.20+Math.random()*0.22, 0.7+Math.random()*0.5, 5+Math.random()*7);
      }
    }
    /* 2. the drift: many fine cross-threads at every angle — this is the
       body of the web, and it is all line, no fill */
    for(let i=0;i<150;i++){
      const a=Math.random()*Math.PI*2, len=w*(0.16+Math.random()*0.5);
      const cx=Math.random()*w, cy=Math.random()*h;
      silkThread(g, cx, cy, cx+Math.cos(a)*len, cy+Math.sin(a)*len,
                 0.07+Math.random()*0.14, 0.45+Math.random()*0.45, 3+Math.random()*6);
    }
    /* 3. snarls: little knots where the weave is old and doubled */
    for(let k=0;k<9;k++){
      const sx=Math.random()*w, sy=Math.random()*h, r=7+Math.random()*17;
      for(let i=0;i<11;i++){
        const a0=Math.random()*7, a1=a0+1.4+Math.random()*3;
        silkThread(g, sx+Math.cos(a0)*r*Math.random(), sy+Math.sin(a0)*r*Math.random(),
                      sx+Math.cos(a1)*r, sy+Math.sin(a1)*r,
                   0.10+Math.random()*0.16, 0.5+Math.random()*0.5, 2);
      }
    }
    /* 4. what the web caught: motes strung ON the threads, tiny and few */
    for(let i=0;i<26;i++){
      g.fillStyle=`rgba(196,199,196,${0.14+Math.random()*0.22})`;
      g.beginPath();g.arc(Math.random()*w,Math.random()*h,0.6+Math.random()*1.5,0,7);g.fill();
    }
    /* 5. bite holes and the torn pass-through */
    g.globalCompositeOperation="destination-out";
    const bite=(x,y,r)=>{const gr=g.createRadialGradient(x,y,r*0.25,x,y,r);
      gr.addColorStop(0,"rgba(0,0,0,1)");gr.addColorStop(1,"rgba(0,0,0,0)");
      g.fillStyle=gr;g.beginPath();g.arc(x,y,r,0,7);g.fill();};
    for(let i=0;i<(torn?5:9);i++) bite(Math.random()*w,Math.random()*h,7+Math.random()*17);
    let hx=0,hy=0;
    if(torn){
      hx=w*(0.35+Math.random()*0.3); hy=h*(0.35+Math.random()*0.3);
      for(let i=0;i<11;i++) bite(hx+(Math.random()-0.5)*62, hy+(Math.random()-0.5)*54, 20+Math.random()*30);
    }
    g.globalCompositeOperation="source-over";
    /* 6. frayed ends waving into the hole */
    if(torn) for(let i=0;i<14;i++){
      const a=Math.random()*Math.PI*2, r0=52+Math.random()*22;
      silkThread(g, hx+Math.cos(a)*r0, hy+Math.sin(a)*r0,
                    hx+Math.cos(a)*(r0-18-Math.random()*16)+(Math.random()-0.5)*12,
                    hy+Math.sin(a)*(r0-18-Math.random()*16)+(Math.random()-0.5)*12,
                 0.24+Math.random()*0.2, 0.6, 3);
    }
    silkFeather(g,w,h,26);
  }));
}
/* a corner cobweb fan: anchored along the TOP edge, radial anchor threads
   dropping into sagging capture rows — the geometry pins that edge into a
   wall/ceiling junction, so the fan genuinely hangs off it. */
export function makeCobwebTexture(){
  return silkClamp(makeCanvas(256,256,(g,w,h)=>{
    g.clearRect(0,0,w,h);
    g.lineCap="round";
    const cx=w*(0.35+Math.random()*0.3), cy=0;
    const n=11+Math.floor(Math.random()*6), angs=[];
    for(let i=0;i<n;i++) angs.push((i+0.5)/n*Math.PI*0.94+0.03*Math.PI+(Math.random()-0.5)*0.1);
    const maxR=h*(0.82+Math.random()*0.22);
    const rr=[];
    for(const a of angs){                         // radial anchor threads
      const len=maxR*(0.72+Math.random()*0.36); rr.push(len);
      silkThread(g,cx,cy,cx+Math.cos(a)*len,cy+Math.sin(a)*len,
                 0.22+Math.random()*0.2, 0.7+Math.random()*0.5, 5);
    }
    for(let r=10;r<maxR;r+=6+Math.random()*9+r*0.05){   // sagging capture rows
      for(let i=0;i<angs.length-1;i++){
        if(Math.random()<0.2) continue;           // gaps where rows broke
        if(r>rr[i]||r>rr[i+1]) continue;          // rows stop with their anchors
        const x0=cx+Math.cos(angs[i])*r,   y0=cy+Math.sin(angs[i])*r;
        const x1=cx+Math.cos(angs[i+1])*r, y1=cy+Math.sin(angs[i+1])*r;
        const mx=(x0+x1)/2, my=(y0+y1)/2+r*0.14;  // the sag between anchors
        g.strokeStyle=`rgba(226,231,234,${0.09+Math.random()*0.13})`;
        g.lineWidth=0.5+Math.random()*0.35;
        g.beginPath();g.moveTo(x0,y0);g.quadraticCurveTo(mx,my,x1,y1);g.stroke();
      }
    }
    for(let i=0;i<10;i++){                        // broken threads curling off the rim
      const j=Math.floor(Math.random()*angs.length), a=angs[j];
      const r=rr[j]*(0.8+Math.random()*0.22);
      const x=cx+Math.cos(a)*r, y=cy+Math.sin(a)*r;
      silkThread(g,x,y,x+(Math.random()-0.5)*22,y+12+Math.random()*20,
                 0.12+Math.random()*0.12, 0.55, 4);
    }
    for(let i=0;i<14;i++){                        // dust caught in the rows
      g.fillStyle=`rgba(190,193,190,${0.12+Math.random()*0.16})`;
      g.beginPath();g.arc(cx+(Math.random()-0.5)*w*0.8, Math.random()*h*0.75, 0.6+Math.random()*1.5,0,7);g.fill();
    }
    silkFeather(g,w,h,20);
  }));
}
/* guy-line strands: a couple of wavering threads with silk-wrapped beads,
   drawn tall for thin quads strung point-to-point in 3D. Kept dim — a lit
   guy-line at full white reads as a wire, or worse, a scratch on the lens. */
export function makeStrandTexture(){
  return silkClamp(makeCanvas(32,256,(g,w,h)=>{
    g.clearRect(0,0,w,h);
    g.lineCap="round";
    const n=2+Math.floor(Math.random()*2);
    for(let i=0;i<n;i++){
      const x0=w*(0.36+Math.random()*0.28);
      /* a soft halo under the core so the thread has a little body */
      for(const[lw,al]of[[2.6,0.07],[1.1,0.30+Math.random()*0.16]]){
        g.strokeStyle=`rgba(224,229,231,${al})`; g.lineWidth=lw;
        g.beginPath();g.moveTo(x0,0);
        for(let y=8;y<=h;y+=8) g.lineTo(x0+Math.sin(y*0.03+i*3)*2.4,y);
        g.stroke();
      }
    }
    for(let i=0;i<7;i++){                         // beads of wrapped debris
      g.fillStyle=`rgba(206,210,210,${0.20+Math.random()*0.22})`;
      g.beginPath();g.arc(w*0.5+(Math.random()-0.5)*7,Math.random()*h,0.7+Math.random()*1.5,0,7);g.fill();
    }
  }));
}
/* the funnel weave: wraps a lathe (u repeats around it), dense circular
   rows at the throat (v=0, canvas bottom) fraying apart toward the rim.
   Deliberately open: this dresses a closed lathe, so anything approaching
   a solid alpha turns a funnel retreat into a ceramic cone. */
export function makeFunnelTexture(){
  const t=makeCanvas(256,128,(g,w,h)=>{
    g.clearRect(0,0,w,h);
    g.lineCap="round";
    for(let i=0;i<64;i++){               // circular rows, throat-dense
      const y0=h-Math.pow(Math.random(),1.9)*h;
      const dens=y0/h;                   // 1 at the throat, 0 at the rim
      g.strokeStyle=`rgba(228,233,236,${0.03+dens*(0.07+Math.random()*0.13)})`;
      g.lineWidth=0.45+Math.random()*0.6;
      g.beginPath();g.moveTo(0,y0+Math.sin(i)*2.2);
      for(let x=8;x<=w;x+=8) g.lineTo(x, y0+Math.sin(x*(Math.PI*4/w)+i)*2.2);
      g.stroke();
    }
    for(let i=0;i<18;i++){               // radial support strands (wrap-safe)
      const x0=Math.random()*w, drift=(Math.random()-0.5)*16;
      g.strokeStyle=`rgba(226,231,234,${0.08+Math.random()*0.09})`; g.lineWidth=0.55;
      for(const off of[0,-w,w]){
        g.beginPath();g.moveTo(x0+off,h);g.lineTo(x0+off+drift,0);g.stroke();
      }
    }
    /* the rim frays away to nothing — no hard lathe edge in the air */
    g.globalCompositeOperation="destination-out";
    const gr=g.createLinearGradient(0,0,0,h*0.46);
    gr.addColorStop(0,"rgba(0,0,0,1)"); gr.addColorStop(1,"rgba(0,0,0,0)");
    g.fillStyle=gr; g.fillRect(0,0,w,h*0.46);
    for(let i=0;i<14;i++){
      g.fillStyle="rgba(0,0,0,0.9)";
      g.beginPath();g.arc(Math.random()*w,h*0.42+Math.random()*20,7+Math.random()*13,0,7);g.fill();
    }
    g.globalCompositeOperation="source-over";
  });
  t.wrapT=THREE.ClampToEdgeWrapping; t.minFilter=THREE.LinearMipmapLinearFilter;
  t.generateMipmaps=true; t.anisotropy=4;   // wrapS stays repeating for the lathe
  return t;
}
/* bioluminescent fungus veins: a wandering glow-thread decal for the rock */
export function makeFungusTexture(){
  const t=makeCanvas(128,64,(g,w,h)=>{
    g.clearRect(0,0,w,h);
    let x=0, y=h*(0.3+Math.random()*0.4);
    while(x<w){                          // the main vein
      const nx=x+4+Math.random()*7, ny=Math.max(4,Math.min(h-4,y+(Math.random()-0.5)*10));
      const gr=g.createLinearGradient(x,y,nx,ny);
      gr.addColorStop(0,"rgba(78,190,205,0.55)");gr.addColorStop(1,"rgba(64,170,190,0.5)");
      g.strokeStyle=gr;g.lineWidth=1.4+Math.random()*1.6;
      g.beginPath();g.moveTo(x,y);g.lineTo(nx,ny);g.stroke();
      if(Math.random()<0.4){             // side threads
        g.strokeStyle="rgba(70,180,196,0.35)";g.lineWidth=0.9;
        g.beginPath();g.moveTo(nx,ny);
        g.lineTo(nx+(Math.random()-0.5)*14, ny+(Math.random()-0.5)*18);g.stroke();
      }
      if(Math.random()<0.5){             // glow nodes
        const r=1.5+Math.random()*3;
        const ng=g.createRadialGradient(nx,ny,0.5,nx,ny,r*2.6);
        ng.addColorStop(0,"rgba(140,235,255,0.85)");ng.addColorStop(1,"rgba(60,160,190,0)");
        g.fillStyle=ng;g.beginPath();g.arc(nx,ny,r*2.6,0,7);g.fill();
      }
      x=nx; y=ny;
    }
  });
  t.wrapS=t.wrapT=THREE.ClampToEdgeWrapping; t.minFilter=THREE.LinearFilter; t.generateMipmaps=false;
  return t;
}
/* the fungus SKIN atlas: one diffuse + one emissive canvas, laid out as four
   horizontal strips that the cave's lathe-built mushrooms UV into —
     v 0.03..0.22  STEM  (pale fibrous flesh; faint glow threads)
     v 0.28..0.47  GILL  (radial slits under the caps; the brightest glow)
     v 0.53..0.72  CAP   (banded conk top; glow concentrated at the rim, v=0.53 edge)
     v 0.78..0.97  BULB  (speckled puffball / fingertip; glow pores + bright crown)
   Strips tile horizontally (u wraps around the lathe); mipmaps are off so the
   guard gaps between strips never bleed at distance. */
export function makeFungusSkin(){
  const S=256;
  /* band(): canvas-y region for a v-range, drawn with 4px bleed each side */
  const bandY=(v0,v1)=>{ const y0=(1-v1)*S-4, y1=(1-v0)*S+4; return [y0,y1-y0]; };
  const map=makeCanvas(S,S,(g,w,h)=>{
    g.fillStyle="#242a2b";g.fillRect(0,0,w,h);
    { /* STEM: pale grey-green flesh, vertical fibers */
      const [y,hh]=bandY(0.03,0.22);
      const gr=g.createLinearGradient(0,y,0,y+hh);
      gr.addColorStop(0,"#93a09b");gr.addColorStop(1,"#68716e");
      g.fillStyle=gr;g.fillRect(0,y,w,hh);
      for(let i=0;i<70;i++){
        const x=Math.random()*w, light=Math.random()<0.5;
        g.fillStyle=light?`rgba(178,190,184,${0.12+Math.random()*0.16})`
                         :`rgba(58,68,64,${0.14+Math.random()*0.2})`;
        g.fillRect(x,y,0.8+Math.random()*1.6,hh);
      }
    }
    { /* GILL: dense radial slits (vertical lines wrap to radial on the lathe) */
      const [y,hh]=bandY(0.28,0.47);
      g.fillStyle="#5c6b6d";g.fillRect(0,y,w,hh);
      for(let x=0;x<w;x+=2+Math.random()*2.5){
        g.fillStyle=`rgba(34,44,45,${0.55+Math.random()*0.3})`;
        g.fillRect(x,y,1+Math.random(),hh);
        if(Math.random()<0.3){ g.fillStyle="rgba(140,155,152,0.35)"; g.fillRect(x+1.4,y,0.8,hh); }
      }
    }
    { /* CAP: banded conk top — growth rings + mineral speckle */
      const [y,hh]=bandY(0.53,0.72);
      g.fillStyle="#4c4c42";g.fillRect(0,y,w,hh);
      let yy=y;
      while(yy<y+hh){
        const bh=3+Math.random()*6;
        g.fillStyle=Math.random()<0.5?`rgba(92,90,72,${0.3+Math.random()*0.3})`
                                     :`rgba(52,54,44,${0.3+Math.random()*0.3})`;
        g.fillRect(0,yy,w,bh); yy+=bh;
      }
      for(let i=0;i<110;i++){
        g.fillStyle=`rgba(128,132,112,${0.10+Math.random()*0.18})`;
        g.fillRect(Math.random()*w,y+Math.random()*hh,1+Math.random()*1.6,1);
      }
    }
    { /* BULB: speckled pore skin, paler toward the crown (strip top) */
      const [y,hh]=bandY(0.78,0.97);
      const gr=g.createLinearGradient(0,y,0,y+hh);
      gr.addColorStop(0,"#8d9793");gr.addColorStop(1,"#59615e");
      g.fillStyle=gr;g.fillRect(0,y,w,hh);
      for(let i=0;i<130;i++){
        g.fillStyle=`rgba(48,58,55,${0.25+Math.random()*0.3})`;
        g.beginPath();g.arc(Math.random()*w,y+Math.random()*hh,0.7+Math.random()*1.3,0,7);g.fill();
      }
    }
  });
  const emit=makeCanvas(S,S,(g,w,h)=>{
    g.fillStyle="#000";g.fillRect(0,0,w,h);
    { /* STEM: near-dark, a few rising glow threads, a bloom where gills meet */
      const [y,hh]=bandY(0.03,0.22);
      for(let i=0;i<12;i++){
        g.fillStyle=`rgba(40,130,150,${0.14+Math.random()*0.16})`;
        g.fillRect(Math.random()*w,y,0.8+Math.random(),hh);
      }
      const gr=g.createLinearGradient(0,y,0,y+7);
      gr.addColorStop(0,"rgba(70,180,200,0.4)");gr.addColorStop(1,"rgba(70,180,200,0)");
      g.fillStyle=gr;g.fillRect(0,y,w,7);
    }
    { /* GILL: the money glow — bright slits on a lit haze */
      const [y,hh]=bandY(0.28,0.47);
      g.fillStyle="rgba(42,115,135,0.5)";g.fillRect(0,y,w,hh);
      for(let x=0;x<w;x+=2+Math.random()*2.5){
        g.fillStyle=Math.random()<0.6?`rgba(170,242,255,${0.8+Math.random()*0.2})`
                                     :`rgba(110,210,235,${0.55+Math.random()*0.25})`;
        g.fillRect(x,y,0.9+Math.random()*0.8,hh);
      }
    }
    { /* CAP: dark flesh, glow pooling at the rim (bottom edge = v 0.53) + spore dots */
      const [y,hh]=bandY(0.53,0.72);
      g.fillStyle="rgba(10,30,38,0.35)";g.fillRect(0,y,w,hh);
      const gr=g.createLinearGradient(0,y+hh,0,y+hh*0.35);
      gr.addColorStop(0,"rgba(115,222,242,0.8)");gr.addColorStop(1,"rgba(115,222,242,0)");
      g.fillStyle=gr;g.fillRect(0,y,w,hh);
      for(let i=0;i<70;i++){
        const dy=y+hh*(0.35+Math.random()*0.65);   // denser toward the rim
        g.fillStyle=`rgba(150,238,255,${0.3+Math.random()*0.5})`;
        g.beginPath();g.arc(Math.random()*w,dy,0.6+Math.random(),0,7);g.fill();
      }
    }
    { /* BULB: bright crown (strip top) fading down, glowing pores throughout */
      const [y,hh]=bandY(0.78,0.97);
      const gr=g.createLinearGradient(0,y,0,y+hh);
      gr.addColorStop(0,"rgba(150,240,255,0.85)");
      gr.addColorStop(0.45,"rgba(60,150,175,0.3)");
      gr.addColorStop(1,"rgba(18,55,70,0.12)");
      g.fillStyle=gr;g.fillRect(0,y,w,hh);
      for(let i=0;i<120;i++){
        g.fillStyle=`rgba(180,250,255,${0.5+Math.random()*0.45})`;
        g.beginPath();g.arc(Math.random()*w,y+Math.random()*hh,0.6+Math.random()*0.9,0,7);g.fill();
      }
    }
  });
  for(const t of[map,emit]){
    t.wrapS=THREE.RepeatWrapping; t.wrapT=THREE.ClampToEdgeWrapping;
    t.minFilter=THREE.LinearFilter; t.generateMipmaps=false;
  }
  return {map,emit};
}

/* ================= the spider — shared by THE END and THE NEST =================
   Chitin is not plastic. It is layered and waxy, darker along the sclerotised
   seams, pitted with the sockets every bristle grows out of, and HAIRED — a
   short pile over everything that runs one way, like a pelt.
   UV contract (the mesh builds to match):
     · abdomen / carapace are LATHES rotated onto the body axis, so u runs
       around the body with u=0.5 on the DORSAL midline (u=0/1 is the belly),
       and v runs front → rear. A stroke along v is a line running nose to
       tail; a stroke along u is a RING.
     · the legs and palps are SWEEPS: v runs down the whole limb in metres
       (one repeat per 1.5m) and u around it, with u=0 on the dorsal side.
       Annulation lives in vertex colour, not here — a band printed into a
       map that repeats every 1.5m lands at the same place on every segment
       whatever its length. */
const chitinSpeck=(g,w,h,n,al)=>{
  for(let i=0;i<n;i++){
    const v=Math.random(), x=Math.random()*w, y=Math.random()*h, r=0.5+Math.random()*0.9;
    g.fillStyle=`rgba(${v<0.5?6:70},${v<0.5?5:66},${v<0.5?4:60},${al*(0.4+Math.random())})`;
    g.beginPath();g.arc(x,y,r,0,7);g.fill();
  }
};
/* bristle sockets: a dark pit with a pale rim, the texture that makes a
   carapace read as living cuticle instead of painted shell */
const chitinPores=(g,w,h,n)=>{
  for(let i=0;i<n;i++){
    const x=Math.random()*w, y=Math.random()*h, r=0.8+Math.random()*1.7;
    g.fillStyle=`rgba(4,3,2,${0.30+Math.random()*0.35})`;
    g.beginPath();g.arc(x,y,r,0,7);g.fill();
    g.fillStyle=`rgba(92,88,80,${0.10+Math.random()*0.16})`;
    g.beginPath();g.arc(x-r*0.35,y-r*0.4,r*0.5,0,7);g.fill();
  }
};
/* the pile: short strokes all laid the same way (along v, nose to tail) —
   what makes a dark surface read as hair rather than as rubber */
const chitinPile=(g,w,h,n,len,al)=>{
  g.lineCap="round";
  for(let i=0;i<n;i++){
    const x=Math.random()*w, y=Math.random()*h, l=len*(0.5+Math.random());
    const lt=Math.random()<0.55;
    g.strokeStyle=lt? `rgba(90,88,84,${al*(0.5+Math.random())})` : `rgba(2,2,1,${al*1.4*(0.5+Math.random())})`;
    g.lineWidth=0.6+Math.random()*0.8;
    g.beginPath();g.moveTo(x,y);g.lineTo(x+(Math.random()-0.5)*2,y+l);g.stroke();
  }
};
/* a soft blotch drawn wrapped in u, so the seam of the lathe never shows */
const wrapBlot=(g,w,x,y,r,rgba)=>{
  for(const ox of[-w,0,w]){
    const gr=g.createRadialGradient(x+ox,y,0.5,x+ox,y,r);
    gr.addColorStop(0,rgba);gr.addColorStop(1,"rgba(0,0,0,0)");
    g.fillStyle=gr;g.beginPath();g.arc(x+ox,y,r,0,7);g.fill();
  }
};
/* the abdomen: near-black cuticle under a folium — the pale jagged
   heart-marking down the dorsal midline — with the belly's anatomy on the
   ventral side where it belongs: book-lung covers and the epigastric
   furrow at the front, the spinneret field darkening at the tail. */
export const texSpiderAbd = makeCanvas(512,512,(g,w,h)=>{
  g.fillStyle="#100d0a";g.fillRect(0,0,w,h);
  /* metre-scale mottle first: an even field is a product swatch */
  for(let i=0;i<46;i++){
    const lt=Math.random()<0.5;
    wrapBlot(g,w,Math.random()*w,Math.random()*h,30+Math.random()*60,
      lt? `rgba(64,58,50,${0.05+Math.random()*0.06})` : `rgba(0,0,0,${0.10+Math.random()*0.12})`);
  }
  /* the belly (u at the edges) is darker and duller than the back */
  for(const x0 of[0,w*0.8]){
    const gr=g.createLinearGradient(x0,0,x0+w*0.2,0);
    gr.addColorStop(0,x0?"rgba(0,0,0,0)":"rgba(0,0,0,0.55)");
    gr.addColorStop(1,x0?"rgba(0,0,0,0.55)":"rgba(0,0,0,0)");
    g.fillStyle=gr;g.fillRect(x0,0,w*0.2,h);
  }
  const cx=w*0.5;
  /* flank stripes: faint dark obliques sweeping back and down */
  for(let i=0;i<7;i++){
    const y=h*(0.16+i*0.11);
    for(const s of[-1,1]){
      g.strokeStyle=`rgba(2,2,1,${0.20+Math.random()*0.1})`;g.lineWidth=5+Math.random()*4;g.lineCap="round";
      g.beginPath();g.moveTo(cx+s*w*0.13,y);
      g.quadraticCurveTo(cx+s*w*0.20,y+h*0.03,cx+s*w*0.27,y+h*0.075);g.stroke();
    }
  }
  /* the cardiac mark: a dark lance down the front of the back */
  const cg=g.createLinearGradient(cx-w*0.03,0,cx+w*0.03,0);
  cg.addColorStop(0,"rgba(0,0,0,0)");cg.addColorStop(0.5,"rgba(0,0,0,0.45)");cg.addColorStop(1,"rgba(0,0,0,0)");
  g.fillStyle=cg;
  g.beginPath();g.moveTo(cx,h*0.05);g.quadraticCurveTo(cx+w*0.035,h*0.2,cx,h*0.38);
  g.quadraticCurveTo(cx-w*0.035,h*0.2,cx,h*0.05);g.fill();
  /* the folium: a chain of chevrons narrowing toward the spinnerets */
  for(let i=0;i<13;i++){
    const t=i/12, y=h*(0.12+t*0.74);
    const half=w*(0.13*Math.sin(Math.PI*(0.15+t*0.8))+0.025);
    g.fillStyle=`rgba(${104-t*30|0},${98-t*28|0},${86-t*24|0},${0.13+0.09*Math.sin(t*Math.PI)})`;
    g.beginPath();
    g.moveTo(cx-half,y);
    g.quadraticCurveTo(cx-half*0.45,y-h*0.012,cx,y-h*0.03);
    g.quadraticCurveTo(cx+half*0.45,y-h*0.012,cx+half,y);
    g.quadraticCurveTo(cx+half*0.4,y+h*0.018,cx,y+h*0.04);
    g.quadraticCurveTo(cx-half*0.4,y+h*0.018,cx-half,y);
    g.fill();
    g.strokeStyle=`rgba(6,5,3,${0.26+Math.random()*0.14})`;g.lineWidth=2;g.stroke();
  }
  /* paired sigilla — the muscle attachment dimples flanking the midline */
  for(let i=0;i<4;i++){
    const y=h*(0.20+i*0.15);
    for(const s of[-1,1]) wrapBlot(g,w,cx+s*w*(0.055+i*0.004),y,9,"rgba(1,1,0,0.6)");
  }
  /* the belly: book-lung covers either side of the ventral midline (u=0),
     the epigastric furrow across behind them, the spinneret field at the tail */
  for(const x of[w*0.075,w*0.925]){
    g.save();g.translate(x,h*0.17);g.scale(1,1.6);
    const gr=g.createRadialGradient(0,0,1,0,0,16);
    gr.addColorStop(0,"rgba(92,84,70,0.32)");gr.addColorStop(1,"rgba(92,84,70,0)");
    g.fillStyle=gr;g.beginPath();g.arc(0,0,16,0,7);g.fill();g.restore();
  }
  g.strokeStyle="rgba(0,0,0,0.6)";g.lineWidth=3;
  for(const ox of[0,w]){
    g.beginPath();g.moveTo(ox-w*0.16,h*0.25);g.quadraticCurveTo(ox,h*0.21,ox+w*0.16,h*0.25);g.stroke();
  }
  const tg=g.createLinearGradient(0,h*0.86,0,h);
  tg.addColorStop(0,"rgba(0,0,0,0)");tg.addColorStop(1,"rgba(0,0,0,0.5)");
  g.fillStyle=tg;g.fillRect(0,h*0.86,w,h*0.14);
  /* a broad waxy sheen along the dorsal ridge */
  const sh=g.createLinearGradient(cx-w*0.14,0,cx+w*0.14,0);
  sh.addColorStop(0,"rgba(112,108,100,0)");
  sh.addColorStop(0.5,"rgba(112,108,100,0.07)");
  sh.addColorStop(1,"rgba(112,108,100,0)");
  g.fillStyle=sh;g.fillRect(cx-w*0.14,0,w*0.28,h);
  chitinPile(g,w,h,5200,7,0.10);
  chitinSpeck(g,w,h,2400,0.10);
  chitinPores(g,w,h,260);
});
/* the carapace: hard and glossy, striae fanning back from the fovea, a pale
   median band and pale margins — the wolf-spider livery — and a darker
   cephalic region where the eyes sit */
export const texSpiderCarapace = makeCanvas(512,256,(g,w,h)=>{
  /* ORIENTATION MATTERS HERE. u wraps the body, v runs front→rear, so a
     horizontal stroke is a RING — striae drawn that way turn the carapace
     into a cut tree stump. Striae are VERTICAL strokes on this canvas. */
  g.fillStyle="#110d09";g.fillRect(0,0,w,h);
  for(let i=0;i<30;i++)
    wrapBlot(g,w,Math.random()*w,Math.random()*h,18+Math.random()*34,
      Math.random()<0.5? `rgba(60,54,46,${0.05+Math.random()*0.05})` : `rgba(0,0,0,${0.12+Math.random()*0.1})`);
  const cx=w*0.5;
  /* median band down the thorax, and a pale margin where the shell rolls under */
  const mb=g.createLinearGradient(cx-w*0.05,0,cx+w*0.05,0);
  mb.addColorStop(0,"rgba(90,84,72,0)");mb.addColorStop(0.5,"rgba(90,84,72,0.13)");mb.addColorStop(1,"rgba(90,84,72,0)");
  g.fillStyle=mb;g.fillRect(cx-w*0.05,h*0.34,w*0.1,h*0.62);
  for(const x of[w*0.27,w*0.73]){
    const gr=g.createLinearGradient(x-w*0.04,0,x+w*0.04,0);
    gr.addColorStop(0,"rgba(84,78,68,0)");gr.addColorStop(0.5,"rgba(84,78,68,0.10)");gr.addColorStop(1,"rgba(84,78,68,0)");
    g.fillStyle=gr;g.fillRect(x-w*0.04,h*0.12,w*0.08,h*0.84);
  }
  for(let i=0;i<120;i++){                // striae, running front→rear
    const x=Math.random()*w;
    const y0=h*(0.22+Math.random()*0.28), y1=h*(0.64+Math.random()*0.34);
    g.strokeStyle=Math.random()<0.5
      ? `rgba(${74+Math.random()*30|0},${68+Math.random()*26|0},${58+Math.random()*20|0},${0.04+Math.random()*0.07})`
      : `rgba(0,0,0,${0.12+Math.random()*0.12})`;
    g.lineWidth=0.8+Math.random()*1.4;
    g.beginPath();g.moveTo(x,y0);
    g.quadraticCurveTo(x+(Math.random()-0.5)*9,(y0+y1)/2, x+(Math.random()-0.5)*16, y1);
    g.stroke();
  }
  /* the fovea: a compact dark pit on the dorsal midline, never a ring */
  wrapBlot(g,w,cx,h*0.6,15,"rgba(0,0,0,0.7)");
  /* the cephalic shield darkens toward the eyes */
  const cg=g.createLinearGradient(0,0,0,h*0.36);
  cg.addColorStop(0,"rgba(0,0,0,0.55)");cg.addColorStop(1,"rgba(0,0,0,0)");
  g.fillStyle=cg;g.fillRect(0,0,w,h*0.36);
  chitinPile(g,w,h,1600,5,0.07);
  chitinSpeck(g,w,h,1500,0.09);
  chitinPores(g,w,h,200);
});
/* the limbs: the pile running down the leg, a pair of faint pale lines
   along the dorsal side (u≈0.1 / 0.9 either side of the top), and the
   sockets of every hair that has been rubbed off */
export const texSpiderLimb = makeCanvas(128,512,(g,w,h)=>{
  g.fillStyle="#0e0d0b";g.fillRect(0,0,w,h);
  for(let i=0;i<20;i++)
    wrapBlot(g,w,Math.random()*w,Math.random()*h,10+Math.random()*24,
      Math.random()<0.5? "rgba(58,52,44,0.06)" : "rgba(0,0,0,0.14)");
  for(const x of[w*0.1,w*0.9]){
    const gr=g.createLinearGradient(x-5,0,x+5,0);
    gr.addColorStop(0,"rgba(92,86,76,0)");gr.addColorStop(0.5,"rgba(92,86,76,0.10)");gr.addColorStop(1,"rgba(92,86,76,0)");
    g.fillStyle=gr;g.fillRect(x-5,0,10,h);
  }
  chitinPile(g,w,h,2600,16,0.12);
  /* a specular ridge down one side so a tube reads as round even flat-lit */
  const sh=g.createLinearGradient(w*0.18,0,w*0.5,0);
  sh.addColorStop(0,"rgba(84,82,78,0)");
  sh.addColorStop(1,"rgba(84,82,78,0.05)");
  g.fillStyle=sh;g.fillRect(w*0.18,0,w*0.32,h);
  chitinSpeck(g,w,h,900,0.12);
  chitinPores(g,w,h,110);
});
/* the velvet: not a colour map — a field of strand cross-sections for the
   abdomen's shell fur. Each dot peaks at its strand's LENGTH and falls to
   zero at its edge, so a shell at height h keeps only what is taller than h
   and every strand thins toward its tip. Drawn wrapped both ways (it tiles). */
export const texSpiderFur = makeCanvas(512,512,(g,w,h)=>{
  g.fillStyle="#000";g.fillRect(0,0,w,h);
  g.globalCompositeOperation="lighten";
  for(let i=0;i<12000;i++){
    const x=Math.random()*w, y=Math.random()*h, r=1.8+Math.random()*1.8;
    const v=Math.round(255*(0.3+0.7*Math.pow(Math.random(),0.7)));
    for(const ox of[-w,0,w]) for(const oy of[-h,0,h]){
      const X=x+ox, Y=y+oy;
      if(X<-r||X>w+r||Y<-r||Y>h+r) continue;
      const gr=g.createRadialGradient(X,Y,0,X,Y,r);
      gr.addColorStop(0,`rgb(${v},${v},${v})`);gr.addColorStop(1,"rgb(0,0,0)");
      g.fillStyle=gr;g.beginPath();g.arc(X,Y,r,0,7);g.fill();
    }
  }
  g.globalCompositeOperation="source-over";
});

/* ---- THE NEST: the brood ----------------------------------------------
   A clutch was a grey dome with plain spheres on it, and burning one only
   recoloured those spheres — there was no fire in the scene at all. These
   two maps give the eggs a body and the burn an actual flame. */
/* an egg sac: waxy translucent shell with the dark curl of what is inside
   showing through, and the surface veining of the membrane */
export const texEggSac = makeCanvas(128,128,(g,w,h)=>{
  const gr=g.createRadialGradient(w*0.38,h*0.32,2,w*0.5,h*0.5,w*0.62);
  gr.addColorStop(0,"#b9d2da"); gr.addColorStop(0.45,"#8fadb9");
  gr.addColorStop(1,"#5d747f");
  g.fillStyle=gr;g.fillRect(0,0,w,h);
  /* the embryo: a dark comma coiled inside, blurred by the shell */
  g.globalAlpha=0.5;
  for(let i=0;i<3;i++){
    g.strokeStyle="rgba(24,40,48,0.5)"; g.lineWidth=9-i*2.4;
    g.beginPath();
    g.arc(w*0.52,h*0.58,w*0.20+i*1.5,0.7,3.5);
    g.stroke();
  }
  g.globalAlpha=1;
  for(let i=0;i<40;i++){          // membrane veins
    const x=Math.random()*w, y=Math.random()*h;
    g.strokeStyle=`rgba(${150+Math.random()*50|0},${180+Math.random()*40|0},${190+Math.random()*40|0},${0.10+Math.random()*0.14})`;
    g.lineWidth=0.6+Math.random()*0.9;
    g.beginPath();g.moveTo(x,y);
    let cx=x,cy=y;
    for(let k=0;k<4;k++){ cx+=(Math.random()-0.5)*22; cy+=(Math.random()-0.5)*22; g.lineTo(cx,cy); }
    g.stroke();
  }
  for(let i=0;i<200;i++){         // fine surface grain
    g.fillStyle=`rgba(${210+Math.random()*40|0},${230+Math.random()*25|0},${235+Math.random()*20|0},${0.05+Math.random()*0.12})`;
    g.fillRect(Math.random()*w,Math.random()*h,1+Math.random()*1.5,1+Math.random()*1.5);
  }
  /* the wet highlight that sells it as a sac and not a marble */
  const hl=g.createRadialGradient(w*0.36,h*0.28,1,w*0.36,h*0.28,w*0.20);
  hl.addColorStop(0,"rgba(240,252,255,0.5)");hl.addColorStop(1,"rgba(240,252,255,0)");
  g.fillStyle=hl;g.beginPath();g.arc(w*0.36,h*0.28,w*0.20,0,7);g.fill();
});
/* a flame tongue for additive blending: white-hot base, orange body,
   ragged tip, fully clear at the edges so the quad never shows */
export function makeFlameTexture(){
  const t=makeCanvas(64,128,(g,w,h)=>{
    /* Drawn as nested TONGUES, not a stack of soft circles — circles blur
       into one smooth ellipse, which is exactly what the first attempt
       rendered: a glowing egg hovering over the nest. A flame needs a
       silhouette that tapers and wavers, and layers that get smaller and
       hotter toward the core. */
    g.clearRect(0,0,w,h);
    const tongue=(scale,wob,seed,stops,alpha)=>{
      const gr=g.createLinearGradient(0,h,0,h*0.06);
      stops.forEach(([p,c])=>gr.addColorStop(p,c));
      g.fillStyle=gr; g.globalAlpha=alpha;
      g.beginPath();
      const N=26, pts=[];
      for(let i=0;i<=N;i++){
        const v=i/N;                                  // 0 root, 1 tip
        const half=w*0.44*scale*Math.sin(Math.PI*Math.pow(v,0.62))*(1-v*0.45);
        const drift=Math.sin(v*5.1+seed)*wob*w*0.10*v;
        pts.push([v,half,drift]);
      }
      g.moveTo(w/2+pts[0][2]-pts[0][1], h);
      for(const [v,half,drift] of pts) g.lineTo(w/2+drift-half, h-v*h);
      for(let i=pts.length-1;i>=0;i--){ const [v,half,drift]=pts[i];
        g.lineTo(w/2+drift+half, h-v*h); }
      g.closePath(); g.fill(); g.globalAlpha=1;
    };
    /* outer body: deep orange, the coolest and widest */
    tongue(1.00,1.0,1.7,[[0,"rgba(226,96,26,0.55)"],[0.55,"rgba(196,64,16,0.30)"],
                         [1,"rgba(140,36,8,0)"]],1);
    /* mid: the orange that reads as fire at a glance */
    tongue(0.68,1.4,4.2,[[0,"rgba(255,178,64,0.72)"],[0.6,"rgba(240,120,30,0.36)"],
                         [1,"rgba(200,70,18,0)"]],1);
    /* core: short, white-hot, sitting low */
    tongue(0.36,0.7,0.5,[[0,"rgba(255,248,214,0.88)"],[0.42,"rgba(255,206,110,0.42)"],
                         [1,"rgba(255,170,60,0)"]],1);
    /* the edges must reach zero INSIDE the quad or the plane shows */
    g.globalCompositeOperation="destination-out";
    for(const [x0,x1] of [[0,w*0.16],[w,w*0.84]]){
      const gr=g.createLinearGradient(x0,0,x1,0);
      gr.addColorStop(0,"rgba(0,0,0,1)"); gr.addColorStop(1,"rgba(0,0,0,0)");
      g.fillStyle=gr; g.fillRect(Math.min(x0,x1),0,w*0.16,h);
    }
    const tg=g.createLinearGradient(0,0,0,h*0.14);
    tg.addColorStop(0,"rgba(0,0,0,1)"); tg.addColorStop(1,"rgba(0,0,0,0)");
    g.fillStyle=tg; g.fillRect(0,0,w,h*0.14);
    g.globalCompositeOperation="source-over";
  });
  t.wrapS=t.wrapT=THREE.ClampToEdgeWrapping;
  t.minFilter=THREE.LinearFilter; t.generateMipmaps=false;
  return t;
}

/* a silk-wrapped bundle: whatever it used to be, bound in layered bands.
   On a sphere's UVs (u around, v pole-to-pole) horizontal strokes become
   rings, which is exactly how a cocoon is wound. Shared by the cocoons,
   the clutch mound and the silk lashings — all of which were flat grey
   Phong, and all of which read as smooth pale eggs because of it. */
export const texCocoon = makeCanvas(128,256,(g,w,h)=>{
  g.fillStyle="#7c8285";g.fillRect(0,0,w,h);
  /* the bulge inside: a broad soft light/dark so it isn't one flat tone */
  for(let i=0;i<9;i++){
    const y=Math.random()*h, r=20+Math.random()*54;
    const gr=g.createRadialGradient(w*0.5,y,2,w*0.5,y,r);
    const dark=Math.random()<0.55;
    gr.addColorStop(0,dark?`rgba(52,58,60,${0.10+Math.random()*0.12})`
                         :`rgba(196,202,204,${0.08+Math.random()*0.10})`);
    gr.addColorStop(1,"rgba(0,0,0,0)");
    g.fillStyle=gr;g.fillRect(0,y-r,w,r*2);
  }
  /* the winding: many overlapping bands, each with a lit crest and a
     shadowed trough, drawn full width so they ring the bundle */
  for(let i=0;i<70;i++){
    const y=Math.random()*h, th=1.2+Math.random()*4.5;
    const tilt=(Math.random()-0.5)*7;
    g.save(); g.beginPath(); g.rect(0,0,w,h); g.clip();
    g.strokeStyle=`rgba(222,228,230,${0.10+Math.random()*0.16})`;
    g.lineWidth=th;
    g.beginPath(); g.moveTo(-2,y); g.lineTo(w+2,y+tilt); g.stroke();
    g.strokeStyle=`rgba(44,50,52,${0.08+Math.random()*0.13})`;
    g.lineWidth=th*0.55;
    g.beginPath(); g.moveTo(-2,y+th*0.8); g.lineTo(w+2,y+tilt+th*0.8); g.stroke();
    g.restore();
  }
  /* loose ends and fibre fuzz escaping the wrap */
  for(let i=0;i<80;i++){
    const x=Math.random()*w, y=Math.random()*h;
    g.strokeStyle=`rgba(228,234,236,${0.10+Math.random()*0.2})`;
    g.lineWidth=0.5+Math.random()*0.6;
    g.beginPath(); g.moveTo(x,y);
    g.lineTo(x+(Math.random()-0.5)*16, y+(Math.random()-0.5)*7); g.stroke();
  }
  for(let i=0;i<140;i++){          // grime picked up off the cave
    g.fillStyle=`rgba(${86+Math.random()*36|0},${88+Math.random()*32|0},${84+Math.random()*28|0},${0.08+Math.random()*0.14})`;
    g.fillRect(Math.random()*w,Math.random()*h,1+Math.random()*2.2,1+Math.random()*1.6);
  }
});
texCocoon.wrapS=texCocoon.wrapT=THREE.RepeatWrapping;

/* ---- THE NEST: the one who came before -------------------------------
   The corpse was six boxes and a sphere in two flat colours, and the
   journal beside it two more boxes. It is the first thing the level shows
   you and the reason you have a lantern at all, so it earns real skin. */
/* rotted canvas workwear: weave, damp bloom, and the holes it has worn */
export const texCloth = makeCanvas(256,256,(g,w,h)=>{
  g.fillStyle="#2b2822";g.fillRect(0,0,w,h);
  for(let i=0;i<10;i++){          // damp blooms and dark staining
    const x=Math.random()*w,y=Math.random()*h,r=24+Math.random()*70;
    const gr=g.createRadialGradient(x,y,2,x,y,r);
    const dark=Math.random()<0.6;
    gr.addColorStop(0,dark?`rgba(12,11,9,${0.16+Math.random()*0.18})`
                         :`rgba(74,66,50,${0.10+Math.random()*0.12})`);
    gr.addColorStop(1,"rgba(0,0,0,0)");
    g.fillStyle=gr;g.beginPath();g.arc(x,y,r,0,7);g.fill();
  }
  for(let x=0;x<w;x+=3){          // the weave: warp and weft
    g.fillStyle=`rgba(${64+Math.random()*26|0},${58+Math.random()*22|0},${46+Math.random()*18|0},${0.10+Math.random()*0.10})`;
    g.fillRect(x,0,1.4,h);
  }
  for(let y=0;y<h;y+=3){
    g.fillStyle=`rgba(${16+Math.random()*14|0},${14+Math.random()*12|0},${11+Math.random()*10|0},${0.10+Math.random()*0.12})`;
    g.fillRect(0,y,w,1.4);
  }
  for(let i=0;i<26;i++){          // worn holes, with frayed pale edges
    const x=Math.random()*w,y=Math.random()*h,r=2+Math.random()*9;
    g.fillStyle=`rgba(6,5,4,${0.4+Math.random()*0.4})`;
    g.beginPath();g.arc(x,y,r,0,7);g.fill();
    g.strokeStyle=`rgba(96,88,70,${0.14+Math.random()*0.16})`;g.lineWidth=1;
    g.beginPath();g.arc(x,y,r+0.9,0,7);g.stroke();
  }
  for(let i=0;i<600;i++){         // grit worked into the fibres
    g.fillStyle=`rgba(${52+Math.random()*40|0},${46+Math.random()*32|0},${36+Math.random()*26|0},${0.06+Math.random()*0.12})`;
    g.fillRect(Math.random()*w,Math.random()*h,1+Math.random()*1.8,1+Math.random()*1.8);
  }
});
texCloth.wrapS=texCloth.wrapT=THREE.RepeatWrapping;
/* dry bone: porous, blotched with the cave's minerals, hairline cracks */
export const texBone = makeCanvas(128,128,(g,w,h)=>{
  g.fillStyle="#b3ab99";g.fillRect(0,0,w,h);
  for(let i=0;i<16;i++){          // mineral staining picked up off the rock
    const x=Math.random()*w,y=Math.random()*h,r=8+Math.random()*30;
    const gr=g.createRadialGradient(x,y,1,x,y,r);
    gr.addColorStop(0,Math.random()<0.6?`rgba(96,86,62,${0.12+Math.random()*0.18})`
                                       :`rgba(214,208,192,${0.12+Math.random()*0.14})`);
    gr.addColorStop(1,"rgba(0,0,0,0)");
    g.fillStyle=gr;g.beginPath();g.arc(x,y,r,0,7);g.fill();
  }
  for(let i=0;i<18;i++){          // hairline cracks along the grain
    const x=Math.random()*w, y=Math.random()*h, a=(Math.random()-0.5)*0.9+Math.PI/2;
    g.strokeStyle=`rgba(72,64,48,${0.14+Math.random()*0.2})`;g.lineWidth=0.5+Math.random()*0.7;
    g.beginPath();g.moveTo(x,y);
    let cx=x,cy=y,aa=a;
    for(let k=0;k<4;k++){ aa+=(Math.random()-0.5)*0.5; cx+=Math.cos(aa)*9; cy+=Math.sin(aa)*9; g.lineTo(cx,cy); }
    g.stroke();
  }
  for(let i=0;i<500;i++){         // the porosity
    g.fillStyle=`rgba(${86+Math.random()*30|0},${80+Math.random()*26|0},${62+Math.random()*22|0},${0.10+Math.random()*0.16})`;
    g.beginPath();g.arc(Math.random()*w,Math.random()*h,0.5+Math.random()*1.2,0,7);g.fill();
  }
});
texBone.wrapS=texBone.wrapT=THREE.RepeatWrapping;
/* a swollen page block: damp-rippled edges and the ghost of handwriting */
export const texJournalPages = makeCanvas(128,128,(g,w,h)=>{
  g.fillStyle="#c2b79a";g.fillRect(0,0,w,h);
  for(let y=0;y<h;y+=2+Math.random()*2){       // the leaves, seen edge-on
    g.fillStyle=`rgba(${132+Math.random()*46|0},${124+Math.random()*40|0},${100+Math.random()*34|0},${0.18+Math.random()*0.22})`;
    g.fillRect(0,y,w,0.9);
    g.fillStyle=`rgba(84,76,58,${0.10+Math.random()*0.14})`;
    g.fillRect(0,y+1,w,0.6);
  }
  for(let i=0;i<9;i++){                        // water damage creeping in
    const x=Math.random()*w,y=Math.random()*h,r=10+Math.random()*30;
    const gr=g.createRadialGradient(x,y,1,x,y,r);
    gr.addColorStop(0,`rgba(96,78,48,${0.14+Math.random()*0.16})`);
    gr.addColorStop(0.75,`rgba(120,100,64,${0.08})`);
    gr.addColorStop(1,"rgba(0,0,0,0)");
    g.fillStyle=gr;g.beginPath();g.arc(x,y,r,0,7);g.fill();
  }
  for(let i=0;i<40;i++){                       // the ghost of writing
    const y=Math.random()*h, x0=Math.random()*w*0.5, len=w*(0.2+Math.random()*0.4);
    g.strokeStyle=`rgba(48,40,30,${0.06+Math.random()*0.10})`;g.lineWidth=0.7;
    g.beginPath();g.moveTo(x0,y);
    for(let x=x0;x<x0+len;x+=4) g.lineTo(x,y+Math.sin(x*0.8)*0.9);
    g.stroke();
  }
});
