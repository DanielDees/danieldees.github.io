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
/* faded posters: aged notices and clippings with REAL, readable text that
   almost parses — headline, dateline, body copy, the works — and means
   nothing at all if you actually try to follow it. */
const P_HEAD=["ALL RETURNS ARE FINAL","THE STACKS CLOSE AT NEVER","SILENCE IS DUE BACK",
  "RENEW YOUR SELF TODAY","LATE FEES ACCRUE INWARD","SHELVING IS A PRIVILEGE",
  "THE CATALOG KNOWS","MIND THE AISLES","REPORT MISSING HOURS","QUIET IS MANDATORY"];
const P_MAST=["THE DAILY STACK","THE CIRCULAR","END TIMES","THE RETURNS DESK","THE QUIET PAGE"];
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
    if(Math.random()<0.5){
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
        for(const ln of wrapText(g,`${i+1}. ${nonsense()}`,w-52)){
          if(y>h-40) break;
          g.fillText(ln,26,y); y+=14;
        }
        y+=7;
      }
      g.textAlign="center"; g.font="bold 11px Courier New"; g.fillStyle=ink;
      g.fillText("— BY ORDER OF THE DESK —",w/2,h-26);
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
          for(const ln of wrapText(g,nonsense(),colW)){
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
