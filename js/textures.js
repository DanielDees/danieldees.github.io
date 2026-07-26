/* ---------------- procedural textures ---------------- */
export function makeCanvas(w,h,fn){const c=document.createElement("canvas");c.width=w;c.height=h;fn(c.getContext("2d"),w,h);
  const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;return t;}

export const texWall = makeCanvas(256,256,(g,w,h)=>{
  g.fillStyle="#b3a04a";g.fillRect(0,0,w,h);
  for(let x=0;x<w;x+=32){g.fillStyle = (x/32)%2? "#a99440":"#b3a04a"; g.fillRect(x,0,32,h);}
  for(let i=0;i<900;i++){g.fillStyle=`rgba(${60+Math.random()*40|0},${50+Math.random()*35|0},20,${Math.random()*0.07})`;
    g.fillRect(Math.random()*w,Math.random()*h,Math.random()*4+1,Math.random()*10+2);}
  for(let i=0;i<7;i++){const x=Math.random()*w,y=Math.random()*h,r=20+Math.random()*40;
    const gr=g.createRadialGradient(x,y,2,x,y,r);gr.addColorStop(0,"rgba(70,58,20,0.18)");gr.addColorStop(1,"rgba(70,58,20,0)");
    g.fillStyle=gr;g.fillRect(x-r,y-r,r*2,r*2);}
  g.fillStyle="rgba(40,32,12,.35)";g.fillRect(0,h-14,w,14);
});
export const texCarpet = makeCanvas(512,512,(g,w,h)=>{
  g.fillStyle="#7a6c35";g.fillRect(0,0,w,h);
  for(let i=0;i<26000;i++){const v=Math.random();
    g.fillStyle=`rgba(${v<.5?40:110},${v<.5?34:96},${v<.5?14:46},0.25)`;
    g.fillRect(Math.random()*w,Math.random()*h,1.5,1.5);}
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
/* sparse large-scale stain overlay, tiled at a different (non-integer)
   rate than the carpet so the two layers never line up — kills the
   visible repeat without true uniqueness */
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
export const texCeil = makeCanvas(256,256,(g,w,h)=>{
  g.fillStyle="#cfc6a0";g.fillRect(0,0,w,h);
  g.strokeStyle="rgba(90,80,45,.55)";g.lineWidth=3;
  for(let x=0;x<=w;x+=64){g.beginPath();g.moveTo(x,0);g.lineTo(x,h);g.stroke();}
  for(let y=0;y<=h;y+=64){g.beginPath();g.moveTo(0,y);g.lineTo(w,y);g.stroke();}
  for(let i=0;i<1800;i++){g.fillStyle=`rgba(90,80,50,${Math.random()*0.1})`;
    g.fillRect(Math.random()*w,Math.random()*h,2,2);}
});
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
/* galvanized sheet for every fixture shell — spangle crystals, a scatter of
   dust and old water runs. Non-directional and seam-safe, because it maps
   at a fixed world scale (scaleBoxUV) across members of wildly different
   sizes: a 2.2m reflector spine and a 0.09m end cap wear the same steel. */
export const texGalv = makeCanvas(128,128,(g,w,h)=>{
  g.fillStyle="#8e918c";g.fillRect(0,0,w,h);
  for(let i=0;i<110;i++){                 // spangle: the frozen-crystal facets
    const x=Math.random()*w, y=Math.random()*h, r=4+Math.random()*13;
    const v=Math.random()<0.5? 168:120;
    g.fillStyle=`rgba(${v},${v+3},${v-2},${0.08+Math.random()*0.13})`;
    g.beginPath();
    for(let a=0;a<Math.PI*2;a+=Math.PI/3) g.lineTo(x+Math.cos(a)*r*(0.6+Math.random()*0.6),
                                                   y+Math.sin(a)*r*(0.6+Math.random()*0.6));
    g.closePath();g.fill();
  }
  for(let i=0;i<900;i++){                 // mill grain
    g.fillStyle=`rgba(${60+Math.random()*120|0},${62+Math.random()*120|0},${58+Math.random()*118|0},${0.05+Math.random()*0.10})`;
    g.fillRect(Math.random()*w,Math.random()*h,1+Math.random()*3,1);
  }
  for(let i=0;i<9;i++){                    // dust settled in the pressings
    const x=Math.random()*w, ww=3+Math.random()*9;
    const gr=g.createLinearGradient(x,0,x+ww,0);
    gr.addColorStop(0,"rgba(52,46,36,0)");
    gr.addColorStop(0.5,`rgba(52,46,36,${0.10+Math.random()*0.14})`);
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
   Canvas resolution tracks the decal's WORLD size (~72 px/m), so the colony
   is grown at its final aspect ratio — stretching a fixed canvas onto an
   arbitrary rectangle squashed the blobs into a photoshop-resize look. */
export function makeMoldTextures(wid,hgt,dep){
  const PPM=72;
  const wW=Math.round(Math.min(256,Math.max(48,wid*PPM)));
  const wH=Math.round(Math.min(128,Math.max(20,hgt*PPM)));
  const fH=Math.round(Math.min(64, Math.max(12,dep*PPM)));
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
  const dab=(g,x,y,r,boost=1)=>{
    /* clamp sideways so no blob crosses the canvas border — a clipped blob
       leaves a dead-straight cut along the decal edge. Top/bottom edges are
       left alone: they meet the floor seam / fade out by design. */
    x=Math.min(g.canvas.width-r,Math.max(r,x));
    const col=Math.random()<0.4? "26,46,22" : "10,14,9";
    const a=(0.16+Math.random()*0.46)*boost;     // wide alpha spread: patchy, not uniform
    const gr=g.createRadialGradient(x,y,0.3,x,y,r);
    gr.addColorStop(0,`rgba(${col},${a})`);gr.addColorStop(1,`rgba(${col},0)`);
    g.fillStyle=gr;g.beginPath();g.arc(x,y,r,0,7);g.fill();
  };
  const wall=makeCanvas(wW,wH,(g,w,h)=>{
    g.clearRect(0,0,w,h);
    for(const lo of lobes){
      /* branching walk climbing up from the seam; a wide angle fan lets it
         also creep sideways so neighboring lobes knit together */
      const nodes=[{x:lo.x*w, y:h, r:h*(0.11+Math.random()*0.13)*lo.s+3}];
      const nN=Math.round((28+Math.random()*44)*lo.d);
      for(let i=0;i<nN;i++){
        /* parent choice biased to early (big, low) nodes: growth stays
           bottom-heavy instead of spraying fine speckles up the wall */
        const n=nodes[Math.floor(Math.pow(Math.random(),1.6)*nodes.length)];
        const r=n.r*(0.55+Math.random()*0.4);
        if(r<1) continue;
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
        dab(g, lo.x*w+(Math.random()-0.5)*w*0.16*lo.s, h-Math.random()*3, (2.5+Math.random()*4*lo.s)*h/64+1, 1.25*lo.d);
    }
    /* connective crust: low dabs strung between the outermost lobes so the
       colony stays one organism, thinning toward its edges */
    const lx=lobes.map(l=>l.x), x0=Math.min(...lx), x1=Math.max(...lx);
    const span=(x1-x0)*w;
    for(let i=0,n=10+span/9;i<n;i++){
      const t=Math.random(), x=(x0+(x1-x0)*t)*w;
      const edge=1-Math.abs(t-0.5)*1.2;
      dab(g, x+(Math.random()-0.5)*6, h-Math.random()*h*0.16*edge,
          (1.5+Math.random()*3.5)*edge*h/40+1, 0.8*edge);
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
        dab(g, x, y, (1.2+Math.random()*4.2*lo.s)*(1.1-y/h*0.6), 0.7+0.6*lo.d);
      }
      for(let i=0,nC=2+4*lo.d;i<nC;i++)   // seam crust mirroring the wall side
        dab(g, lo.x*w+(Math.random()-0.5)*w*0.14*lo.s, Math.random()*2.5, 2+Math.random()*3.5*lo.s, 1.2*lo.d);
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
   canvas policy as the mold (~72 px/m) so rivulets keep their aspect. */
export function makeDripTextures(wid,len){
  const PPM=72;
  const wW=Math.round(Math.min(128,Math.max(24,wid*PPM)));
  const wH=Math.round(Math.min(256,Math.max(48,len*PPM)));
  const wall=makeCanvas(wW,wH,(g,w,h)=>{
    g.clearRect(0,0,w,h);
    /* contact smudge where the water exits the ceiling seam */
    for(let i=0,n=6+Math.random()*6;i<n;i++){
      const x=w*(0.2+Math.random()*0.6), r=2.5+Math.random()*5;
      const gr=g.createRadialGradient(x,1.5,0.3,x,1.5,r);
      gr.addColorStop(0,`rgba(86,58,24,${0.3+Math.random()*0.22})`);
      gr.addColorStop(1,"rgba(86,58,24,0)");
      g.fillStyle=gr;g.beginPath();g.arc(x,1.5,r,0,7);g.fill();
    }
    /* the wet sheet: a faint wash widest at the seam, narrowing downward —
       it's what makes the rivulet cluster read as one stalactite shape */
    const sheetH=h*(0.3+Math.random()*0.25);
    for(let y=0;y<sheetH;y+=2){
      const t=y/sheetH, ww=w*(0.72-0.5*t)*(0.9+Math.random()*0.2);
      g.fillStyle=`rgba(92,62,26,${0.06*(1-t)})`;
      g.fillRect(w/2-ww/2+(Math.random()-0.5)*2,y,ww,2.4);
    }
    /* rivulets: wandering tapering streaks; the first is the long center
       run, the rest hang shorter at its sides */
    const nR=2+Math.floor(Math.random()*4);
    for(let i=0;i<nR;i++){
      const long=i===0;
      let x=w*(0.5+(long?(Math.random()-0.5)*0.2:(Math.random()-0.5)*0.6));
      const yEnd=h*(long? 0.78+Math.random()*0.22 : 0.25+Math.random()*0.5);
      const baseW=(long?1.6:1.0)*(1.2+Math.random()*1.6)*(w/40+0.4);
      const col=Math.random()<0.5? "96,64,26" : "74,50,22";
      const a=0.28+Math.random()*0.22;
      const steps=Math.max(10,Math.floor(yEnd/3));
      for(let s=0;s<steps;s++){
        const t=s/(steps-1), y=t*yEnd;
        x+=(Math.random()-0.5)*1.5;
        const ww=Math.max(0.6,baseW*(1-t*0.85));   // taper to a point
        g.fillStyle=`rgba(${col},${a*(1-t*0.45)})`;
        g.fillRect(x-ww/2,y,ww,3.4);
        if(Math.random()<0.06)                     // dried tide flecks beside the run
          g.fillRect(x+(Math.random()<0.5?-1:1)*(ww/2+1+Math.random()*2),y,1,2);
      }
      /* the hanging droplet bead at the tip */
      const br=baseW*(0.5+Math.random()*0.45);
      const gr=g.createRadialGradient(x,yEnd,0.3,x,yEnd,br);
      gr.addColorStop(0,`rgba(${col},${a*1.25})`);gr.addColorStop(1,`rgba(${col},0)`);
      g.fillStyle=gr;g.beginPath();g.arc(x,yEnd,br,0,7);g.fill();
    }
  });
  /* the small feed stain on the ceiling above the run: an irregular brown
     blotch with a darker waterlogged core */
  const ceil=makeCanvas(48,48,(g,w,h)=>{
    g.clearRect(0,0,w,h);
    const p1=Math.random()*7,p2=Math.random()*7;
    for(let a=0;a<Math.PI*2;a+=0.16){
      const rr=(w*0.27)*(1+0.22*Math.sin(a*2+p1)+0.16*Math.sin(a*3+p2))*Math.sqrt(Math.random()*0.6+0.4);
      const px=w/2+Math.cos(a)*rr, py=h/2+Math.sin(a)*rr;
      const sr=3+Math.random()*5;
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
/* worn dark walnut for the stacks; a warmer oak for tables & the desk */
function woodTex(base,dark,light){
  return makeCanvas(256,256,(g,w,h)=>{
    g.fillStyle=base;g.fillRect(0,0,w,h);
    for(let i=0;i<420;i++){             // long vertical grain
      const x=Math.random()*w, l=20+Math.random()*120;
      g.fillStyle=`rgba(${Math.random()<0.5?dark:light},${0.10+Math.random()*0.18})`;
      g.fillRect(x,Math.random()*h,1+Math.random()*1.6,l);
    }
    for(let i=0;i<26;i++){              // scuffs and chips
      g.fillStyle=`rgba(16,11,7,${0.08+Math.random()*0.16})`;
      g.save();g.translate(Math.random()*w,Math.random()*h);g.rotate((Math.random()-0.5)*0.8);
      g.fillRect(0,0,4+Math.random()*22,1+Math.random()*2);g.restore();
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
export function makeKeyboardTexture(){
  return makeCanvas(256,96,(g,w,h)=>{
    g.fillStyle="#8e8672";g.fillRect(0,0,w,h);
    const key=(x,y,kw,kh)=>{
      g.fillStyle="#2b2822";g.fillRect(x,y,kw,kh);            // the well
      g.fillStyle="#b9b099";g.fillRect(x+1,y+1,kw-2,kh-3);    // the cap
      g.fillStyle="rgba(255,252,242,0.35)";g.fillRect(x+1,y+1,kw-2,1);
      g.fillStyle="rgba(40,36,28,0.30)";g.fillRect(x+1,y+kh-3,kw-2,1);
    };
    /* function row, then the four main rows stepped like a real board */
    for(let i=0;i<12;i++) key(8+i*14,7,11,9);
    const rows=[[8,20,15,13],[8,34,14,14],[12,48,13,14],[8,62,13,13]];
    rows.forEach(([x0,y,n,kw])=>{ for(let i=0;i<n;i++) key(x0+i*(kw+2),y,kw,12); });
    key(70,77,86,12);                                          // spacebar
    key(30,77,26,12); key(170,77,26,12);
    for(let i=0;i<4;i++)for(let j=0;j<4;j++) key(196+j*14,20+i*14,12,12);  // the pad
    for(let i=0;i<3;i++){                                      // status LEDs
      g.fillStyle=["#2a3a24","#2a3a24","#3a3320"][i];
      g.fillRect(200+i*10,8,6,4);
    }
  });
}
/* a 3.5" disk, top down: the shell, the label somebody wrote on, and the
   write-protect window. The only object in this library worth taking, and
   it was three untextured boxes. */
export function makeFloppyTexture(){
  const scrawl=["BACKUP 7","DO NOT COPY","ROOMS 0-9","INDEX ??","LAST ONE",
                "FLOOR PLAN","MY NOTES","RETURN TO","AUDIT 4","DIAGNOSTIC"];
  const tex=makeCanvas(128,128,(g,w,h)=>{
    /* --- rows 0–95: the label face --- */
    g.fillStyle="#1b1e25";g.fillRect(0,0,w,96);
    for(let i=0;i<500;i++){                       // moulded plastic sheen
      g.fillStyle=`rgba(${60+Math.random()*60|0},${64+Math.random()*60|0},${74+Math.random()*60|0},0.05)`;
      g.fillRect(Math.random()*w,Math.random()*96,1+Math.random()*3,1);
    }
    g.fillStyle="rgba(150,160,178,0.22)";g.fillRect(0,0,w,2);   // top bevel highlight
    g.fillStyle="rgba(0,0,0,0.35)";g.fillRect(0,93,w,3);
    /* the shutter end sits at the top of this face */
    g.fillStyle="#7d848c";g.fillRect(20,3,88,20);
    g.fillStyle="#5e666e";g.fillRect(24,6,80,14);
    g.fillStyle="#3a4046";g.fillRect(46,6,36,14);              // the window under it
    /* the label. Its printed header sits at the end FURTHEST from the
       shutter, the way a real one does — the shutter end is the end you
       hold, and nobody prints under their own thumb. */
    g.fillStyle="#cdc6ae";g.fillRect(9,29,110,58);
    g.fillStyle="rgba(120,104,72,0.30)";g.fillRect(9,29,110,3);
    g.fillStyle="#8f2b22";g.fillRect(9,78,110,9);
    g.fillStyle="#e8e2ce";g.font="bold 7px Courier New";g.textBaseline="middle";
    g.fillText("THE END  ·  ARCHIVE",13,83);
    g.fillStyle="rgba(70,60,40,0.55)";                          // ruled lines
    for(let i=0;i<3;i++) g.fillRect(13,50+i*11,102,1);
    g.fillStyle="#2a2a34";g.font="9px Courier New";
    g.fillText(scrawl[Math.floor(Math.random()*scrawl.length)],15,42);
    /* a hand nobody can read. Kept THIN and broken: at 1.5px solid it
       mipped down into one navy bar across the label and read as a sticker */
    g.fillStyle="rgba(52,50,62,0.50)";
    for(let i=0;i<2;i++){
      let x=15+Math.random()*10;
      while(x<104){ const ww=3+Math.random()*8; g.fillRect(x,57+i*11,ww,1); x+=ww+4+Math.random()*6; }
    }
    for(let i=0;i<7;i++){                                       // coffee, age, thumbs
      const x=Math.random()*w,y=29+Math.random()*58,r=4+Math.random()*13;
      const gr=g.createRadialGradient(x,y,0,x,y,r);
      gr.addColorStop(0,`rgba(96,72,36,${0.05+Math.random()*0.12})`);
      gr.addColorStop(1,"rgba(96,72,36,0)");
      g.fillStyle=gr;g.fillRect(x-r,y-r,r*2,r*2);
    }
    /* --- rows 96–127: plain shell for every other face --- */
    g.fillStyle="#171a20";g.fillRect(0,96,w,32);
    for(let i=0;i<260;i++){
      g.fillStyle=`rgba(${58+Math.random()*54|0},${62+Math.random()*54|0},${72+Math.random()*54|0},0.06)`;
      g.fillRect(Math.random()*w,96+Math.random()*32,1+Math.random()*3,1);
    }
  });
  /* The label lives in the upper v band (canvas y=0 is v=1 under flipY).
     `top` hands setFaceUV its v range REVERSED, because a box's +y face
     runs v toward +z: without the swap the disk comes out end-for-end —
     printed shutter at the tail, header band under the ruled lines it is
     supposed to head. */
  return {tex, uv:{top:[0,1,1,0.25], plain:[0.05,0.02,0.95,0.22]}};
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
];
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
export function makeBookCoverTexture(title,author,base,motif,vol,bh,btx,bd){
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
    g.save();g.translate(spineW*0.52,h/2);g.rotate(Math.PI/2);
    g.shadowColor=shadow;g.shadowOffsetX=1;g.shadowOffsetY=1;g.shadowBlur=0;
    fitText(g,title,0,1,h-160,Math.min(32,Math.round(spineW*0.5)),14,serif);
    g.restore();
    if(vol){
      g.font=`bold ${Math.min(20,Math.round(spineW*0.34))}px Georgia`;
      g.fillStyle=giltDim;g.fillText(vol,spineW/2,h-66);
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

/* framed wall art: five families of almost-library artwork, each grown
   fresh per call — things that COULD hang in a library, off by just one
   degree. Frame + mat are shared; the plate inside picks a type. */
export function makeArtTexture(){
  const type=Math.floor(Math.random()*5);
  const t=makeCanvas(224,288,(g,w,h)=>{
    /* dark wood frame + aged mat */
    g.fillStyle="#382a1a";g.fillRect(0,0,w,h);
    g.fillStyle="rgba(140,110,70,0.35)";g.fillRect(3,3,w-6,2);g.fillRect(3,3,2,h-6);
    g.fillStyle="#b3ab94";g.fillRect(12,12,w-24,h-24);
    const x0=26,y0=26,iw=w-52,ih=h-52;
    const ink="rgba(40,34,24,0.85)";
    if(type===0){
      /* MAP OF THE COLLECTION: floor-plan dots and corridors to nowhere */
      g.fillStyle="#a89c80";g.fillRect(x0,y0,iw,ih);
      g.strokeStyle="rgba(60,50,34,0.7)";g.lineWidth=1.5;
      const pts=[];
      for(let i=0;i<9;i++) pts.push([x0+14+Math.random()*(iw-28),y0+26+Math.random()*(ih-52)]);
      for(let i=0;i<10;i++){
        const a=pts[Math.floor(Math.random()*pts.length)],b=pts[Math.floor(Math.random()*pts.length)];
        g.beginPath();g.moveTo(a[0],a[1]);g.lineTo(b[0],a[1]);g.lineTo(b[0],b[1]);g.stroke();
      }
      for(const p of pts){ g.fillStyle="rgba(60,50,34,0.8)";g.beginPath();g.arc(p[0],p[1],3,0,7);g.fill(); }
      g.fillStyle="rgba(150,40,30,0.85)";g.font="bold 11px Courier New";g.textAlign="center";
      const yx=x0+14+Math.random()*(iw-28), yy=y0+30+Math.random()*(ih-60);
      g.fillText("✕",yx,yy);
      g.fillText("YOU WERE HERE",yx,yy+12);
      g.fillStyle=ink;g.font="bold 12px Courier New";
      g.fillText("MAP OF THE COLLECTION",x0+iw/2,y0+14);
    } else if(type===1){
      /* a donor portrait with nothing where the face goes */
      g.fillStyle="#2a241d";g.fillRect(x0,y0,iw,ih);
      const cx=x0+iw/2;
      const gr=g.createRadialGradient(cx,y0+ih*0.38,8,cx,y0+ih*0.38,ih*0.45);
      gr.addColorStop(0,"rgba(120,104,76,0.35)");gr.addColorStop(1,"rgba(120,104,76,0)");
      g.fillStyle=gr;g.fillRect(x0,y0,iw,ih);
      g.fillStyle="#13100c";
      g.beginPath();g.ellipse(cx,y0+ih*0.34,iw*0.16,ih*0.15,0,0,7);g.fill();   // head
      g.beginPath();g.ellipse(cx,y0+ih*0.78,iw*0.32,ih*0.3,0,Math.PI,0);g.fill(); // shoulders
      g.fillStyle="#8a7340";g.fillRect(x0+iw*0.2,y0+ih-22,iw*0.6,14);          // brass plaque
      g.fillStyle="#241c10";g.font="bold 9px Courier New";g.textAlign="center";
      g.fillText(["THE FIRST LIBRARIAN","HEAD ARCHIVIST, 19∅∅","OUR FOUNDER","PATRON OF QUIET"][Math.floor(Math.random()*4)],
        x0+iw/2,y0+ih-12);
    } else if(type===2){
      /* botanical plate: a specimen with labels pointing at nothing */
      g.fillStyle="#cfc6a8";g.fillRect(x0,y0,iw,ih);
      g.strokeStyle="rgba(50,70,40,0.8)";g.lineWidth=2;
      const sx=x0+iw/2;
      g.beginPath();g.moveTo(sx,y0+ih-20);
      g.bezierCurveTo(sx-10,y0+ih*0.6,sx+12,y0+ih*0.4,sx-4,y0+24);g.stroke();
      g.fillStyle="rgba(58,82,46,0.75)";
      for(let i=0;i<5;i++){
        const ly=y0+30+i*(ih-70)/5, s=(i%2?1:-1);
        g.save();g.translate(sx+s*6,ly);g.rotate(s*(0.5+Math.random()*0.4));
        g.beginPath();g.ellipse(0,0,16+Math.random()*8,6,0,0,7);g.fill();g.restore();
      }
      g.strokeStyle="rgba(40,34,24,0.6)";g.lineWidth=1;
      g.fillStyle=ink;g.font="9px Courier New";g.textAlign="left";
      const labels=["fig. ∅","leaf (?)","hrs.","stem, late","do not water"];
      for(let i=0;i<4;i++){
        const ly=y0+34+Math.random()*(ih-80), tx=Math.random()<0.5? x0+4: x0+iw-44;
        g.beginPath();g.moveTo(tx<sx?tx+38:tx,ly);
        g.lineTo(sx+(Math.random()-0.5)*60,ly+(Math.random()-0.5)*30);g.stroke();
        g.fillText(labels[Math.floor(Math.random()*labels.length)],tx,ly+3);
      }
      g.textAlign="center";g.font="italic 10px Courier New";
      g.fillText("SPECIMEN: HOURS, PERENNIAL",x0+iw/2,y0+ih-8);
    } else if(type===3){
      /* an acuity chart that tests something else */
      g.fillStyle="#d8d2c0";g.fillRect(x0,y0,iw,ih);
      const rows=["SH","HUSH","QUIETLY","RETURNALL","THEENDTHEEND","sshhhhhhhhhhh"];
      let yy=y0+34;
      g.fillStyle=ink;g.textAlign="center";
      rows.forEach((r,i)=>{
        g.font=`bold ${Math.max(6,30-i*5)}px Courier New`;
        g.fillText(r.split("").join(" "),x0+iw/2,yy);
        yy+=Math.max(14,36-i*4);
      });
      g.strokeStyle="rgba(40,34,24,0.4)";g.lineWidth=1;
      g.beginPath();g.moveTo(x0+12,y0+ih-26);g.lineTo(x0+iw-12,y0+ih-26);g.stroke();
      g.font="8px Courier New";
      g.fillText("IF YOU CAN READ THIS ROW IT HEARD YOU",x0+iw/2,y0+ih-12);
    } else {
      /* nocturne: hills, a moon, no library anywhere in sight */
      const gr=g.createLinearGradient(0,y0,0,y0+ih);
      gr.addColorStop(0,"#11151d");gr.addColorStop(0.65,"#2a3140");gr.addColorStop(1,"#3a4252");
      g.fillStyle=gr;g.fillRect(x0,y0,iw,ih);
      g.fillStyle="rgba(214,210,190,0.85)";
      g.beginPath();g.arc(x0+iw*(0.25+Math.random()*0.5),y0+ih*0.25,11,0,7);g.fill();
      for(let i=0;i<3;i++){
        g.fillStyle=`rgba(${10+i*6},${12+i*6},${16+i*7},0.95)`;
        g.beginPath();g.moveTo(x0,y0+ih);
        for(let xx=0;xx<=iw;xx+=8)
          g.lineTo(x0+xx,y0+ih*(0.55+i*0.13)+Math.sin(xx*0.05+i*9)*8);
        g.lineTo(x0+iw,y0+ih);g.closePath();g.fill();
      }
      g.fillStyle="#8a7340";g.fillRect(x0+iw*0.25,y0+ih-16,iw*0.5,11);
      g.fillStyle="#241c10";g.font="bold 8px Courier New";g.textAlign="center";
      g.fillText("VIEW FROM THE STACKS",x0+iw/2,y0+ih-8);
    }
  });
  t.wrapS=t.wrapT=THREE.ClampToEdgeWrapping; t.minFilter=THREE.LinearFilter; t.generateMipmaps=false;
  return t;
}

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
   Chitin is not plastic. It is layered and waxy, banded where the cuticle
   hardened in stages, darker along the sclerotised seams, and pitted with
   the sockets every bristle grows out of. The old mesh was flat-coloured
   Phong on smooth primitives, which is exactly how you get a black balloon
   on copper pipes; these three maps are most of the fix.
   UV contract (the mesh builds to match):
     · abdomen / carapace are LATHES rotated onto the body axis, so u runs
       around the body with u=0.5 on the DORSAL midline, and v runs
       front → rear.
     · limbs are cylinders, so v runs along the segment and u around it. */
const chitinSpeck=(g,w,h,n,al)=>{
  for(let i=0;i<n;i++){
    const v=Math.random();
    g.fillStyle=`rgba(${v<0.5?6:70},${v<0.5?5:66},${v<0.5?4:60},${al*(0.4+Math.random())})`;
    g.fillRect(Math.random()*w,Math.random()*h,1+Math.random()*1.6,1+Math.random()*1.6);
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
/* the abdomen: near-black cuticle carrying a folium — the pale jagged
   heart-marking down the dorsal midline that every orb-weaver wears. */
export const texSpiderAbd = makeCanvas(256,256,(g,w,h)=>{
  g.fillStyle="#0e0c08";g.fillRect(0,0,w,h);
  /* ventral half (u at the edges) is darker and duller than the back */
  for(const x0 of[0,w*0.82]){
    const gr=g.createLinearGradient(x0,0,x0+w*0.18,0);
    const a=x0? "rgba(0,0,0,0)":"rgba(0,0,0,0.5)";
    gr.addColorStop(0,x0?"rgba(0,0,0,0)":"rgba(0,0,0,0.5)");
    gr.addColorStop(1,x0?"rgba(0,0,0,0.5)":"rgba(0,0,0,0)");
    g.fillStyle=gr;g.fillRect(x0,0,w*0.18,h);
  }
  /* the folium: a chain of chevrons narrowing toward the spinnerets */
  const cx=w*0.5;
  for(let i=0;i<13;i++){
    const t=i/12, y=h*(0.10+t*0.76);
    const half=w*(0.20*Math.sin(Math.PI*(0.15+t*0.8))+0.035);
    g.fillStyle=`rgba(${96-t*30|0},${90-t*28|0},${78-t*24|0},${0.16+0.10*Math.sin(t*Math.PI)})`;
    g.beginPath();
    g.moveTo(cx-half,y);
    g.lineTo(cx,y-h*0.035);
    g.lineTo(cx+half,y);
    g.lineTo(cx,y+h*0.045);
    g.closePath();g.fill();
    /* the dark rim that makes the marking read at a distance */
    g.strokeStyle=`rgba(6,5,3,${0.24+Math.random()*0.14})`;g.lineWidth=1.4;g.stroke();
  }
  /* paired muscle dimples flanking the midline */
  for(let i=0;i<4;i++){
    const y=h*(0.18+i*0.17);
    for(const sx of[-1,1]){
      const x=cx+sx*w*0.085;
      const gr=g.createRadialGradient(x,y,0.5,x,y,7);
      gr.addColorStop(0,"rgba(2,2,1,0.55)");gr.addColorStop(1,"rgba(0,0,0,0)");
      g.fillStyle=gr;g.beginPath();g.arc(x,y,7,0,7);g.fill();
    }
  }
  /* a broad waxy sheen along the dorsal ridge */
  const sh=g.createLinearGradient(cx-w*0.14,0,cx+w*0.14,0);
  sh.addColorStop(0,"rgba(112,108,100,0)");
  sh.addColorStop(0.5,"rgba(112,108,100,0.08)");
  sh.addColorStop(1,"rgba(112,108,100,0)");
  g.fillStyle=sh;g.fillRect(cx-w*0.14,0,w*0.28,h);
  chitinSpeck(g,w,h,2600,0.12);
  chitinPores(g,w,h,220);
});
/* the carapace: hard, glossy, with striae fanning back from the fovea and
   a darker cephalic region where the eyes sit */
export const texSpiderCarapace = makeCanvas(256,128,(g,w,h)=>{
  /* ORIENTATION MATTERS HERE. This dresses a lathe: u wraps around the
     body, v runs front→rear. So a horizontal stroke (constant v) becomes a
     RING — the first pass drew its striae that way and the carapace read
     as a cut tree stump. Striae must run along v, i.e. VERTICAL strokes on
     this canvas, which come out as lines radiating from the midline the
     way a real carapace's do. */
  g.fillStyle="#100c07";g.fillRect(0,0,w,h);
  for(let i=0;i<54;i++){                 // striae, running front→rear
    const x=Math.random()*w;
    const y0=h*(0.18+Math.random()*0.30), y1=h*(0.62+Math.random()*0.36);
    g.strokeStyle=`rgba(${74+Math.random()*34|0},${68+Math.random()*28|0},${56+Math.random()*22|0},${0.05+Math.random()*0.08})`;
    g.lineWidth=0.6+Math.random()*1.1;
    g.beginPath();g.moveTo(x,y0);
    g.quadraticCurveTo(x+(Math.random()-0.5)*7,(y0+y1)/2, x+(Math.random()-0.5)*13, y1);
    g.stroke();
  }
  /* the fovea: a small dark pit on the dorsal midline (u=0.5), NOT a ring —
     it stays a compact blob so it never wraps the body */
  const cx=w*0.5;
  const fg=g.createRadialGradient(cx,h*0.62,1,cx,h*0.62,13);
  fg.addColorStop(0,"rgba(0,0,0,0.65)");fg.addColorStop(1,"rgba(0,0,0,0)");
  g.fillStyle=fg;g.beginPath();g.arc(cx,h*0.62,13,0,7);g.fill();
  /* the cephalic shield, darker, where the eyes are set — a gradient in v
     is legitimate: it darkens the front of the head, which is the point */
  const cg=g.createLinearGradient(0,0,0,h*0.34);
  cg.addColorStop(0,"rgba(0,0,0,0.5)");cg.addColorStop(1,"rgba(0,0,0,0)");
  g.fillStyle=cg;g.fillRect(0,0,w,h*0.34);
  chitinSpeck(g,w,h,1400,0.09);
  chitinPores(g,w,h,150);
});
/* the limbs: banded cuticle. v runs along the segment, so the bands are
   rows; the dark rings land where the joints flex. */
export const texSpiderLimb = makeCanvas(64,256,(g,w,h)=>{
  g.fillStyle="#100d09";g.fillRect(0,0,w,h);
  for(let i=0;i<7;i++){                  // the bands
    const y=h*(0.05+i*0.135), th=h*(0.028+Math.random()*0.05);
    g.fillStyle=`rgba(3,2,1,${0.44+Math.random()*0.30})`;
    g.fillRect(0,y,w,th);
    g.fillStyle=`rgba(${58+Math.random()*18|0},${56+Math.random()*16|0},${52+Math.random()*14|0},${0.045+Math.random()*0.05})`;
    g.fillRect(0,y+th,w,th*0.6);         // the pale edge below each band
  }
  for(let i=0;i<26;i++){                 // longitudinal fibres
    const x=Math.random()*w;
    g.strokeStyle=`rgba(${62+Math.random()*24|0},${60+Math.random()*20|0},${56+Math.random()*16|0},${0.05+Math.random()*0.07})`;
    g.lineWidth=0.6+Math.random();
    g.beginPath();g.moveTo(x,0);
    for(let y=12;y<=h;y+=12) g.lineTo(x+Math.sin(y*0.05+i)*1.4,y);
    g.stroke();
  }
  /* a specular ridge down one side so a cylinder reads as round even flat-lit */
  const sh=g.createLinearGradient(w*0.18,0,w*0.5,0);
  sh.addColorStop(0,"rgba(84,82,78,0)");
  sh.addColorStop(1,"rgba(84,82,78,0.055)");
  g.fillStyle=sh;g.fillRect(w*0.18,0,w*0.32,h);
  chitinSpeck(g,w,h,700,0.12);
  chitinPores(g,w,h,90);
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
