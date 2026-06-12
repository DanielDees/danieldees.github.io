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
   odd-sized boxes (walls, elevator flanks, headers) then share one scale */
export function scaleBoxUV(geo,w,h,d,m){
  const uv=geo.attributes.uv;
  const dims=[[d,h],[d,h],[w,d],[w,d],[w,h],[w,h]];   // ±x, ±y, ±z face sizes
  for(let f=0;f<6;f++){
    const [fw,fh]=dims[f];
    for(let i=0;i<4;i++){
      const idx=f*4+i;
      uv.setXY(idx, uv.getX(idx)*fw/m, uv.getY(idx)*fh/m);
    }
  }
  uv.needsUpdate=true;
  return geo;
}
/* the thick grey-blue carpet that mutes every footstep */
export const texLibCarpet = makeCanvas(512,512,(g,w,h)=>{
  g.fillStyle="#3a4250";g.fillRect(0,0,w,h);
  for(let i=0;i<26000;i++){const v=Math.random();
    g.fillStyle=`rgba(${v<.5?24:74},${v<.5?28:84},${v<.5?38:104},0.28)`;
    g.fillRect(Math.random()*w,Math.random()*h,1.5,1.5);}
  /* faint herringbone weave bands */
  for(let y=0;y<h;y+=24){
    g.fillStyle=`rgba(${(y/24)%2?28:60},${(y/24)%2?34:68},${(y/24)%2?46:88},0.07)`;
    g.fillRect(0,y,w,12);
  }
  for(let i=0;i<9;i++){                 // old pressure-stains, dust shadows
    const x=Math.random()*w,y=Math.random()*h,r=20+Math.random()*70;
    g.save();g.translate(x,y);g.rotate(Math.random()*Math.PI);g.scale(1,0.5+Math.random()*0.8);
    const gr=g.createRadialGradient(0,0,2,0,0,r);
    gr.addColorStop(0,`rgba(14,16,22,${0.10+Math.random()*0.16})`);gr.addColorStop(1,"rgba(14,16,22,0)");
    g.fillStyle=gr;g.fillRect(-r,-r,r*2,r*2);g.restore();
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
/* ---- proper 3D books ----
   Each book DESIGN gets its own cover canvas: a cloth/leather base shared
   across the whole canvas (so mipmap bleed between regions is invisible),
   with three UV regions — the spine strip, the front-cover plate, and a
   plain patch for back cover, board edges and endpapers. Titles are real,
   legible, and very much of this place. */
export const BOOK_COVER_UV={
  spine:[0.0,52/256],
  front:[56/256,192/256],
  plain:[200/256,250/256],
};
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
export function makeBookCoverTexture(title,author,base,motif,vol){
  const t=makeCanvas(256,256,(g,w,h)=>{
    const [br,bg,bb]=base;
    g.fillStyle=`rgb(${br},${bg},${bb})`;g.fillRect(0,0,w,h);
    for(let i=0;i<900;i++){                       // cloth weave / leather grain
      const v=Math.random()<0.5?-18:14;
      g.fillStyle=`rgba(${br+v},${bg+v},${bb+v},${0.05+Math.random()*0.10})`;
      g.fillRect(Math.random()*w,Math.random()*h,1+Math.random()*3,1+Math.random()*4);
    }
    const gilt="rgba(206,172,96,0.92)", giltDim="rgba(206,172,96,0.55)";
    const shadow="rgba(0,0,0,0.4)";
    const serif=["bold","Georgia, 'Times New Roman', serif"];
    /* ---- spine strip (x 0..52) ---- */
    g.save();g.beginPath();g.rect(0,0,52,h);g.clip();
    g.fillStyle="rgba(0,0,0,0.18)";g.fillRect(0,0,52,h);         // spine sits darker
    /* raised bands: highlight over shadow */
    for(const by of[16,34,h-34,h-16]){
      g.fillStyle="rgba(0,0,0,0.35)";g.fillRect(4,by+2,44,2);
      g.fillStyle=giltDim;g.fillRect(4,by,44,2);
    }
    /* title reading top-to-bottom */
    g.fillStyle=gilt;g.textAlign="center";g.textBaseline="middle";
    g.save();g.translate(27,h/2);g.rotate(Math.PI/2);
    g.shadowColor=shadow;g.shadowOffsetX=1;g.shadowOffsetY=1;g.shadowBlur=0;
    fitText(g,title,0,1,h-110,22,11,serif);
    g.restore();
    if(vol){ g.font="bold 13px Georgia";g.fillStyle=giltDim;g.fillText(vol,26,h-44); }
    g.restore();
    /* ---- front cover plate (x 56..192) ---- */
    const fx=56,fw=136;
    g.save();g.beginPath();g.rect(fx,0,fw,h);g.clip();
    g.strokeStyle=giltDim;g.lineWidth=2;
    g.strokeRect(fx+8,10,fw-16,h-20);
    g.strokeStyle="rgba(206,172,96,0.3)";g.lineWidth=1;
    g.strokeRect(fx+13,15,fw-26,h-30);
    g.fillStyle=gilt;g.textAlign="center";g.textBaseline="alphabetic";
    g.shadowColor=shadow;g.shadowOffsetX=1;g.shadowOffsetY=1;
    /* wrap the title into the plate */
    g.font="bold 19px Georgia";
    const words=title.split(" "),lines=[];let ln="";
    for(const wd of words){
      const tl=ln? ln+" "+wd:wd;
      if(g.measureText(tl).width>fw-40&&ln){lines.push(ln);ln=wd;}else ln=tl;
    }
    if(ln)lines.push(ln);
    let ty=46;
    for(const l of lines){ fitText(g,l,fx+fw/2,ty,fw-36,19,12,serif); ty+=24; }
    if(vol){ g.font="bold 13px Georgia";g.fillText(vol,fx+fw/2,ty+2); ty+=18; }
    g.strokeStyle=giltDim;g.lineWidth=1.5;
    g.beginPath();g.moveTo(fx+34,ty+2);g.lineTo(fx+fw-34,ty+2);g.stroke();
    /* central gilt motif */
    const mx=fx+fw/2,my=h*0.62;
    g.strokeStyle=gilt;g.lineWidth=2;g.shadowColor="rgba(0,0,0,0)";
    if(motif===0){            // an eye
      g.beginPath();g.ellipse(mx,my,24,13,0,0,7);g.stroke();
      g.beginPath();g.arc(mx,my,6,0,7);g.stroke();
    } else if(motif===1){     // a door, ajar
      g.strokeRect(mx-14,my-22,28,44);
      g.beginPath();g.moveTo(mx-14,my-22);g.lineTo(mx+4,my-16);g.lineTo(mx+4,my+28);g.lineTo(mx-14,my+22);g.closePath();g.stroke();
    } else if(motif===2){     // a spiral
      g.beginPath();
      for(let a=0;a<Math.PI*5;a+=0.25) g.lineTo(mx+Math.cos(a)*a*1.6,my+Math.sin(a)*a*1.6);
      g.stroke();
    } else if(motif===3){     // an hourglass
      g.beginPath();g.moveTo(mx-16,my-20);g.lineTo(mx+16,my-20);g.lineTo(mx-16,my+20);g.lineTo(mx+16,my+20);g.closePath();g.stroke();
    } else if(motif===4){     // a key
      g.beginPath();g.arc(mx-10,my,9,0,7);g.stroke();
      g.beginPath();g.moveTo(mx-1,my);g.lineTo(mx+20,my);g.moveTo(mx+13,my);g.lineTo(mx+13,my+8);g.moveTo(mx+19,my);g.lineTo(mx+19,my+8);g.stroke();
    } else {                  // a stair descending
      g.beginPath();let sx=mx-20,sy=my-16;
      for(let i=0;i<4;i++){g.lineTo(sx,sy);sx+=10;g.lineTo(sx,sy);sy+=9;}
      g.lineTo(sx,sy);g.stroke();
    }
    g.shadowColor=shadow;
    g.font="bold 12px Georgia";g.fillStyle=giltDim;
    fitText(g,author,mx,h-22,fw-40,12,9,serif);
    g.restore();
    /* corner & edge wear over everything */
    g.shadowColor="rgba(0,0,0,0)";
    for(let i=0;i<70;i++){
      g.fillStyle=`rgba(${br+30},${bg+30},${bb+26},${0.08+Math.random()*0.14})`;
      const ex=Math.random()<0.5? Math.random()*22 : w-Math.random()*22;
      g.fillRect(ex,Math.random()*h,1+Math.random()*3,1+Math.random()*6);
    }
    const vg=g.createRadialGradient(w/2,h/2,h*0.35,w/2,h/2,h*0.75);
    vg.addColorStop(0,"rgba(0,0,0,0)");vg.addColorStop(1,"rgba(0,0,0,0.22)");
    g.fillStyle=vg;g.fillRect(0,0,w,h);
  });
  return t;
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
  return makeCanvas(256,160,(g,w,h)=>{
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
