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
