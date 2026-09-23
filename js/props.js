/* ---------------- props ---------------- */
import { rand } from "./utils.js";
import { W, H, CELL, WALL_H as WALL_H0, cellToWorld, randomOpenCell, isWall, losCells } from "./map.js";
import { makeCanvas, texWall, scaleBoxUV, makeCrackTexture, envMetal, makeSpillTexture, texGalv } from "./textures.js";
import { STATE } from "./state.js";
import { scene, renderer, wallMeshes, removeDecalsOnWall, mergeWallMeshes, mergeDecals, freezeStaticScene,
         markShared, mergeStatic } from "./scene.js";

export let interactables=[];    // {kind, mesh, label, taken}
export let exitDoor=null;
/* level changes rebuild the prop set from scratch */
export function clearInteractables(){ interactables.length=0; exitDoor=null; }
export function addInteractable(it){ interactables.push(it); }

/* ---------------- the three things you are sent to find ----------------
   All of them were untextured primitives: the almond water was three stacked
   cylinders, the fuse a red box with two white pegs, the panel a grey slab
   with a red ball on it. That was survivable while the walls were a flat
   gradient; against papered walls and a real ceiling grid they are the only
   placeholder geometry left on the floor.
   Their canvases are module-level and markShared'd — placeProps runs again on
   every respawn, and a per-build canvas per bottle is pure churn (worse, the
   level teardown disposes anything not marked, so a rebuilt level would come
   back wearing dead textures). */
/* the almond water label: the one piece of branding in the backrooms */
const texAlmond=makeCanvas(384,96,(g,w,h)=>{
  g.fillStyle="#e7dfc4";g.fillRect(0,0,w,h);
  for(let i=0;i<1400;i++){                         // paper stock
    const v=Math.random()<0.5;
    g.fillStyle=`rgba(${v?196:255},${v?186:250},${v?150:230},${0.08+Math.random()*0.14})`;
    g.fillRect(Math.random()*w,Math.random()*h,1+Math.random()*2,1);
  }
  g.fillStyle="#8d7a34";g.fillRect(0,0,w,4);g.fillRect(0,h-4,w,4);     // the rules
  g.fillStyle="rgba(141,122,52,0.55)";g.fillRect(0,9,w,1.5);g.fillRect(0,h-11,w,1.5);
  g.fillStyle="#2e2a1c";g.textAlign="center";g.textBaseline="middle";
  g.font="bold 30px Arial Narrow, Arial";
  g.fillText("ALMOND WATER",w*0.42,h*0.44);
  g.font="9px Courier New";g.fillStyle="#5f5738";
  g.fillText("· STILL · 500ml · BOTTLED AT SOURCE ·",w*0.42,h*0.72);
  g.font="7px Courier New";g.textAlign="left";
  g.fillText("BEST BEFORE",w*0.80,h*0.30);
  g.fillStyle="#3a3524";g.font="bold 9px Courier New";
  g.fillText("--/--/--",w*0.80,h*0.44);
  for(let i=0,x=w*0.80;i<26;i++){                  // the barcode nobody scanned
    const bw=1+Math.random()*2.5;
    g.fillStyle="#26221a";g.fillRect(x,h*0.58,bw,h*0.26);
    x+=bw+1+Math.random()*2;
  }
  for(let i=0;i<9;i++){                            // age, damp, thumbs
    const x=Math.random()*w,y=Math.random()*h,r=8+Math.random()*26;
    const gr=g.createRadialGradient(x,y,0,x,y,r);
    gr.addColorStop(0,`rgba(126,98,44,${0.05+Math.random()*0.12})`);
    gr.addColorStop(1,"rgba(126,98,44,0)");
    g.fillStyle=gr;g.fillRect(x-r,y-r,r*2,r*2);
  }
  for(let i=0;i<4;i++){                            // creases from being handled
    const x=Math.random()*w;
    g.fillStyle="rgba(120,108,72,0.16)";g.fillRect(x,0,1.5,h);
    g.fillStyle="rgba(255,252,238,0.20)";g.fillRect(x+1.5,0,1,h);
  }
});
/* the fuse's printed face — everything else on it is glazed ceramic */
const texFuseFace=makeCanvas(128,160,(g,w,h)=>{
  g.clearRect(0,0,w,h);
  g.fillStyle="#1b1a17";g.textAlign="center";g.textBaseline="middle";
  g.font="bold 27px Arial";           g.fillText("30",w/2,h*0.24);
  g.font="bold 15px Arial";           g.fillText("AMP",w/2,h*0.40);
  g.fillStyle="rgba(27,26,23,0.75)";g.fillRect(w*0.16,h*0.50,w*0.68,1.5);
  g.font="10px Courier New";          g.fillText("250V  AC",w/2,h*0.60);
  g.font="7px Courier New";g.fillStyle="rgba(27,26,23,0.7)";
  g.fillText("CARTRIDGE TYPE D",w/2,h*0.72);
  g.fillText("DO NOT REPLACE",w/2,h*0.82);
  for(let i=0;i<40;i++){                            // the print has worn
    g.fillStyle=`rgba(206,196,176,${0.10+Math.random()*0.30})`;
    g.fillRect(Math.random()*w,Math.random()*h,2+Math.random()*9,1+Math.random()*2);
  }
});
const texCeramic=makeCanvas(128,128,(g,w,h)=>{
  g.fillStyle="#cfc6ae";g.fillRect(0,0,w,h);
  for(let i=0;i<2200;i++){                          // glaze speckle
    const v=Math.random()<0.5;
    g.fillStyle=`rgba(${v?164:238},${v?156:232},${v?134:212},${0.08+Math.random()*0.16})`;
    g.fillRect(Math.random()*w,Math.random()*h,1+Math.random()*2,1+Math.random()*2);
  }
  for(let i=0;i<9;i++){                              // the scorch of a hard life
    const x=Math.random()*w,y=Math.random()*h,r=10+Math.random()*26;
    const gr=g.createRadialGradient(x,y,0,x,y,r);
    gr.addColorStop(0,`rgba(74,60,42,${0.06+Math.random()*0.12})`);
    gr.addColorStop(1,"rgba(74,60,42,0)");
    g.fillStyle=gr;g.fillRect(x-r,y-r,r*2,r*2);
  }
});
/* painted steel, for the panel. Every face of the cabinet and door wears the
   whole canvas, so its border IS the edge of a face: that is where paint
   wears through to bare metal and where rust starts, and rust RUNS — down
   from the top edge and the hardware in streaks, and blooms along the bottom
   where the damp sits. Round rust dots scattered over a face are polka dots. */
const texPanel=makeCanvas(512,512,(g,w,h)=>{
  g.fillStyle="#5b666a";g.fillRect(0,0,w,h);
  for(let i=0;i<9000;i++){                          // orange peel in the paint
    const v=Math.random()<0.5;
    g.fillStyle=`rgba(${v?68:126},${v?76:136},${v?80:140},${0.07+Math.random()*0.12})`;
    g.beginPath();g.arc(Math.random()*w,Math.random()*h,0.8+Math.random()*1.6,0,7);g.fill();
  }
  for(let i=0;i<16;i++){                            // broad tone: the paint was brushed on site
    const x=Math.random()*w,y=Math.random()*h,r=40+Math.random()*120;
    const gr=g.createRadialGradient(x,y,1,x,y,r);
    gr.addColorStop(0,Math.random()<0.5?"rgba(120,132,136,0.08)":"rgba(30,36,38,0.10)");gr.addColorStop(1,"rgba(0,0,0,0)");
    g.fillStyle=gr;g.beginPath();g.arc(x,y,r,0,7);g.fill();
  }
  g.lineCap="round";
  for(let i=0;i<46;i++){                            // scratches down to bare metal
    const x=Math.random()*w,y=Math.random()*h,a=Math.random()*Math.PI,l=10+Math.random()*80;
    g.strokeStyle=`rgba(178,186,190,${0.10+Math.random()*0.22})`;g.lineWidth=0.7+Math.random()*1.2;
    g.beginPath();g.moveTo(x,y);g.quadraticCurveTo(x+Math.cos(a)*l*0.5+(Math.random()-0.5)*6,y+Math.sin(a)*l*0.5,
      x+Math.cos(a)*l,y+Math.sin(a)*l);g.stroke();
  }
  /* worn edges: bare steel where hands and hinges have rubbed the paint off */
  for(let i=0;i<700;i++){
    const side=(Math.random()*4)|0, t=Math.random(), d=Math.pow(Math.random(),2.2)*16;
    const x=side===0?d: side===1?w-d: t*w, y=side===2?d: side===3?h-d: t*h;
    g.fillStyle=`rgba(150,158,160,${0.08+Math.random()*0.2})`;
    g.beginPath();g.ellipse(x,y,1+Math.random()*4,1+Math.random()*3,Math.random()*3,0,7);g.fill();
  }
  /* rust runs from the top edge and the fastener line */
  for(let i=0;i<22;i++){
    let x=Math.random()*w, y=Math.random()<0.6? Math.random()*14 : h*(0.12+Math.random()*0.2);
    const len=30+Math.random()*170, ww=2+Math.random()*5, a=0.08+Math.random()*0.16;
    const L=[],R=[];
    for(let k=0;k<=24;k++){ const t=k/24; x+=(Math.random()-0.5)*1.4;
      const wk=ww*(1-t*0.8); L.push([x-wk/2,y+t*len]); R.push([x+wk/2,y+t*len]); }
    const gr=g.createLinearGradient(0,y,0,y+len);
    gr.addColorStop(0,`rgba(116,58,24,${a})`);gr.addColorStop(1,"rgba(116,58,24,0)");
    g.fillStyle=gr;g.beginPath();g.moveTo(L[0][0],L[0][1]);
    for(const q of L) g.lineTo(q[0],q[1]); for(let k=R.length-1;k>=0;k--) g.lineTo(R[k][0],R[k][1]);
    g.closePath();g.fill();
  }
  /* and the bloom along the bottom rail (v=0 is the bottom under flipY) */
  for(let i=0;i<30;i++){
    const x=Math.random()*w, y=h-Math.pow(Math.random(),1.8)*h*0.28, r=6+Math.random()*30;
    const p1=Math.random()*7, a=0.10+Math.random()*0.22;
    g.fillStyle=`rgba(122,62,26,${a})`;
    g.beginPath();
    for(let t=0;t<=Math.PI*2+0.01;t+=0.3){
      const rr=r*(1+0.3*Math.sin(t*3+p1)+0.18*Math.sin(t*5+p1*2));
      const px=x+Math.cos(t)*rr, py=y+Math.sin(t)*rr*0.6;
      t? g.lineTo(px,py):g.moveTo(px,py);
    }
    g.closePath();g.fill();
  }
  const gr=g.createLinearGradient(0,h*0.7,0,h);   // grime settling toward the bottom
  gr.addColorStop(0,"rgba(28,30,26,0)");gr.addColorStop(1,"rgba(28,30,26,0.22)");
  g.fillStyle=gr;g.fillRect(0,h*0.7,w,h*0.3);
});
/* the two bits of paper on the door: the maker's plate, and the circuit
   directory that was never filled in past the first two lines */
const texPlate=makeCanvas(256,72,(g,w,h)=>{
  g.fillStyle="#8d949a";g.fillRect(0,0,w,h);
  g.fillStyle="rgba(226,232,236,0.30)";g.fillRect(0,0,w,2);
  g.fillStyle="rgba(28,32,34,0.35)";g.fillRect(0,h-2,w,2);
  g.fillStyle="#1a1e20";g.textAlign="center";g.textBaseline="middle";
  g.font="bold 20px Arial Narrow, Arial";g.fillText("LOAD CENTRE",w/2,h*0.32);
  g.font="10px Courier New";g.fillText("225A  120/240V  1PH  3W",w/2,h*0.62);
  g.font="8px Courier New";g.fillStyle="rgba(26,30,32,0.7)";
  g.fillText("CAT. No. ——————",w/2,h*0.84);
  for(let i=0;i<26;i++){                            // etched, then scoured
    g.fillStyle=`rgba(210,218,222,${0.06+Math.random()*0.16})`;
    g.fillRect(Math.random()*w,Math.random()*h,4+Math.random()*24,1);
  }
});
const texCard=makeCanvas(160,180,(g,w,h)=>{
  g.fillStyle="#c9c4ac";g.fillRect(0,0,w,h);
  for(let i=0;i<900;i++){
    g.fillStyle=`rgba(${150+Math.random()*90|0},${146+Math.random()*86|0},${120+Math.random()*80|0},0.10)`;
    g.fillRect(Math.random()*w,Math.random()*h,1+Math.random()*2,1);
  }
  g.fillStyle="#7a2a22";g.fillRect(0,0,w,13);
  g.fillStyle="#efe9d6";g.font="bold 9px Courier New";
  g.textAlign="center";g.textBaseline="middle";g.fillText("CIRCUIT DIRECTORY",w/2,7);
  g.strokeStyle="rgba(90,80,50,0.45)";g.lineWidth=1;
  for(let i=0;i<11;i++){ const y=24+i*14;
    g.beginPath();g.moveTo(6,y);g.lineTo(w-6,y);g.stroke(); }
  g.beginPath();g.moveTo(30,20);g.lineTo(30,h-8);g.stroke();
  g.fillStyle="#3a3524";g.font="7px Courier New";g.textAlign="left";
  g.fillText("1",12,31);g.fillText("LEVEL 0  N",36,31);
  g.fillText("2",12,45);g.fillText("LEVEL 0  S",36,45);
  g.fillStyle="rgba(58,53,36,0.5)";g.font="7px Courier New";
  g.fillText("3",12,59);
  for(let i=0;i<4;i++){                              // a hand that gave up
    let x=36; const y=59+i*14;
    while(x<w-14){ const ww=3+Math.random()*7;
      g.fillStyle="rgba(58,53,36,0.30)";g.fillRect(x,y-2,ww,1); x+=ww+3+Math.random()*5; }
  }
  for(let i=0;i<6;i++){                              // damp, and thirty years
    const x=Math.random()*w,y=Math.random()*h,r=10+Math.random()*30;
    const gr=g.createRadialGradient(x,y,0,x,y,r);
    gr.addColorStop(0,`rgba(118,92,42,${0.06+Math.random()*0.13})`);
    gr.addColorStop(1,"rgba(118,92,42,0)");
    g.fillStyle=gr;g.fillRect(x-r,y-r,r*2,r*2);
  }
});
/* ================= the elevator's finishes =================
   Every one of these used to be built INSIDE makeElevator, so both levels
   paid for a fresh set of canvases on every respawn, and the cab's own wall
   map carried its panel seams and kick plate PRINTED INTO a texture that
   then got tiled onto boxes of four different sizes — a unique feature in a
   tiling map, the mistake level 0's wallpaper had to be reverted for. The
   seams and the kick are geometry now, so what is left in the map is only
   the FINISH, and the finish is true everywhere. */
/* stainless, satin no.4: a vertical grain, and nothing else that repeats.
   Bright and near-neutral because every metal in the elevator is this one
   map under a different material tint — bright for the doors and jambs,
   mid for the cab lining, dark for the trim. Tiled at a fixed world scale
   (scaleBoxUV) at 0.5m, so a 2.5m door leaf and a 20mm bezel wear the same
   steel at the same grain size. */
const texElevSteel=makeCanvas(1024,1024,(g,w,h)=>{
  g.fillStyle="#c2c7ca";g.fillRect(0,0,w,h);
  /* the tone of the sheet drifts across its width — soft, wrapped, and far
     broader than any one grain line. There used to be two dozen round
     fingerprint smudges in here too, and a map that repeats every half
     metre turned them into POLKA DOTS on every door in the building; the
     doors' own wear is a fitted overlay now (texLeafWear). */
  for(let i=0;i<12;i++){
    const x=Math.random()*w, ww=60+Math.random()*240, a=0.03+Math.random()*0.05;
    const c=Math.random()<0.5?"120,126,130":"238,242,244";
    for(const ox of[-w,0,w]){
      const gr=g.createLinearGradient(x+ox-ww/2,0,x+ox+ww/2,0);
      gr.addColorStop(0,`rgba(${c},0)`);gr.addColorStop(0.5,`rgba(${c},${a})`);gr.addColorStop(1,`rgba(${c},0)`);
      g.fillStyle=gr;g.fillRect(x+ox-ww/2,0,ww,h);
    }
  }
  /* the satin, vertical always: long, fine, many — it is also this map's
     job to be the BUMP, and grooves running down the sheet are what smear a
     lamp's highlight sideways across it the way brushed steel does */
  for(let i=0;i<38000;i++){
    const v=Math.random();
    g.fillStyle=`rgba(${v<0.5?150:238},${v<0.5?156:243},${v<0.5?160:246},${0.035+Math.random()*0.11})`;
    const y=Math.random()*h, l=40+Math.random()*280;
    g.fillRect(Math.random()*w,y,1,l);
    if(y+l>h) g.fillRect(Math.random()*w,y+l-h-l,1,l);
  }
  for(let i=0;i<260;i++){                        // the longer draw marks
    const x=Math.random()*w;
    g.fillStyle=`rgba(${Math.random()<0.5?128:250},${Math.random()<0.5?134:252},${Math.random()<0.5?138:254},${0.04+Math.random()*0.07})`;
    g.fillRect(x,0,1+Math.random()*1.4,h);
  }
  for(let i=0;i<700;i++){                        // micro-scratches, every angle
    const x=Math.random()*w,y=Math.random()*h,a=Math.random()*7,l=6+Math.random()*50;
    g.strokeStyle=`rgba(${Math.random()<0.5?110:252},${Math.random()<0.5?116:254},${Math.random()<0.5?120:255},${0.06+Math.random()*0.14})`;
    g.lineWidth=0.6+Math.random()*0.5;
    g.beginPath();g.moveTo(x,y);g.lineTo(x+Math.cos(a)*l,y+Math.sin(a)*l);g.stroke();
  }
});
texElevSteel.wrapS=texElevSteel.wrapT=THREE.RepeatWrapping;
texElevSteel.anisotropy=8;
/* the wear a pair of doors actually carries, which a tiling map can't: palm
   smudges at hand height by the meeting edge (u=0 is that edge), a cloth's
   wipe, dust settled toward the foot and black scuffs off shoes and carts
   along the kick. Fitted once per leaf, mirrored for the left one. */
const texLeafWear=makeCanvas(256,640,(g,w,h)=>{
  g.clearRect(0,0,w,h);
  const soft=(x,y,rx,ry,rot,rgba)=>{
    g.save();g.translate(x,y);g.rotate(rot);g.scale(1,ry/rx);
    const gr=g.createRadialGradient(0,0,0,0,0,rx);
    gr.addColorStop(0,rgba);gr.addColorStop(1,"rgba(0,0,0,0)");
    g.fillStyle=gr;g.beginPath();g.arc(0,0,rx,0,7);g.fill();g.restore();
  };
  for(let i=0;i<26;i++){                          // hands, at the edge people push
    const y=h*(0.40+Math.random()*0.26), x=Math.pow(Math.random(),1.8)*w*0.34;
    soft(x,y,6+Math.random()*16,10+Math.random()*20,(Math.random()-0.5)*0.6,
      `rgba(62,58,50,${0.06+Math.random()*0.10})`);
  }
  for(let k=0;k<2;k++){                           // a cloth dragged across, once
    const y0=h*(0.25+Math.random()*0.4);
    g.strokeStyle=`rgba(210,214,216,${0.05+Math.random()*0.04})`;g.lineWidth=18+Math.random()*16;g.lineCap="round";
    g.beginPath();g.moveTo(w*0.1,y0);g.quadraticCurveTo(w*0.5,y0-40-Math.random()*50,w*0.92,y0+10);g.stroke();
  }
  const foot=g.createLinearGradient(0,h*0.84,0,h);
  foot.addColorStop(0,"rgba(46,40,30,0)");foot.addColorStop(1,"rgba(46,40,30,0.22)");
  g.fillStyle=foot;g.fillRect(0,h*0.84,w,h*0.16);
  g.lineCap="round";
  for(let i=0;i<22;i++){                           // black scuffs along the kick
    const x=Math.random()*w, y=h*(0.905+Math.random()*0.08), l=10+Math.random()*44;
    const gr=g.createLinearGradient(x-l/2,0,x+l/2,0), a=0.08+Math.random()*0.16;
    gr.addColorStop(0,"rgba(12,12,12,0)");gr.addColorStop(0.5,`rgba(12,12,12,${a})`);gr.addColorStop(1,"rgba(12,12,12,0)");
    g.strokeStyle=gr;g.lineWidth=1.2+Math.random()*2.6;
    g.beginPath();g.moveTo(x-l/2,y);g.lineTo(x+l/2,y+(Math.random()-0.5)*4);g.stroke();
  }
  const top=g.createLinearGradient(0,0,0,h*0.08);  // dust along the head
  top.addColorStop(0,"rgba(80,74,60,0.14)");top.addColorStop(1,"rgba(80,74,60,0)");
  g.fillStyle=top;g.fillRect(0,0,w,h*0.08);
});
/* the hall position indicator's figure: the car is here, on this floor */
const texHallDigit=makeCanvas(96,72,(g,w,h)=>{
  g.fillStyle="#070605";g.fillRect(0,0,w,h);
  const seg=(x,y,sw,sh)=>{ g.fillRect(x,y,sw,sh); };
  g.fillStyle="#ff9d2e";
  const X=34,Y=10,T=5,L=24,H2=24;                    // a 7-segment 0: six of seven lit
  seg(X+T,Y,L,T); seg(X+T,Y+2*H2+T,L,T);
  seg(X,Y+T,T,H2); seg(X+L+T,Y+T,T,H2);
  seg(X,Y+H2+2*T,T,H2-T); seg(X+L+T,Y+H2+2*T,T,H2-T);
  g.fillStyle="rgba(255,157,46,0.08)";              // the dead segment still ghosts
  seg(X+T,Y+H2+T,L,T);
});
/* the EXIT legend: stencil letters, a chevron either side, a border — lit
   from behind, so the whole face is drawn as what the diffuser shows */
const texExitFace=makeCanvas(384,144,(g,w,h)=>{
  g.fillStyle="#0c100c";g.fillRect(0,0,w,h);
  g.strokeStyle="rgba(57,210,74,0.55)";g.lineWidth=3;g.strokeRect(9,9,w-18,h-18);
  g.fillStyle="#39d24a";g.font="bold 84px Arial Narrow, Arial";g.textAlign="center";g.textBaseline="middle";
  g.fillText("EXIT",w/2,h/2+4);
  for(const s of[-1,1]){
    g.beginPath();
    const cx=w/2+s*148, cy=h/2;
    g.moveTo(cx-s*14,cy-22);g.lineTo(cx+s*8,cy);g.lineTo(cx-s*14,cy+22);g.lineTo(cx-s*6,cy+22);g.lineTo(cx+s*16,cy);g.lineTo(cx-s*6,cy-22);
    g.closePath();g.fill();
  }
  for(let i=0;i<380;i++){                          // the grime of a diffuser nobody cleans
    g.fillStyle=`rgba(${18+Math.random()*30|0},${22+Math.random()*30|0},${18+Math.random()*26|0},${0.06+Math.random()*0.22})`;
    g.beginPath();g.arc(Math.random()*w,Math.random()*h,0.6+Math.random()*1.8,0,7);g.fill();
  }
  const dead=g.createLinearGradient(0,0,0,h);       // and the tube behind it, sagging
  dead.addColorStop(0,"rgba(0,0,0,0.30)");dead.addColorStop(0.5,"rgba(0,0,0,0)");dead.addColorStop(1,"rgba(0,0,0,0.40)");
  g.fillStyle=dead;g.fillRect(0,0,w,h);
});
const texExitGlow=makeSpillTexture(0.62,0.5,0.0);
/* the cab floor: studded rubber, the floor every service car in the world
   stands on. The studs are the one regular pattern allowed down here — they
   are moulded, and this is a cab, not the carpet — and the map doubles as
   the bump so each one catches the car light on its crown. Under them,
   the METRE-scale blotch of a sheet that has been walked on for decades.
   Tiled at 1m: sixteen studs a metre. */
const texElevFloor=makeCanvas(512,512,(g,w,h)=>{
  g.fillStyle="#2c2e32";g.fillRect(0,0,w,h);
  const wrap=fn=>{ for(const ox of[0,-w,w])for(const oy of[0,-h,h]) fn(ox,oy); };
  for(let i=0;i<30;i++){                         // the blotch
    const x=Math.random()*w,y=Math.random()*h,r=60+Math.random()*180;
    const lite=Math.random()<0.5;
    wrap((ox,oy)=>{
      const gr=g.createRadialGradient(x+ox,y+oy,r*0.1,x+ox,y+oy,r);
      gr.addColorStop(0,lite?`rgba(84,88,94,${0.08+Math.random()*0.08})`
                           :`rgba(14,15,18,${0.08+Math.random()*0.10})`);
      gr.addColorStop(1,"rgba(0,0,0,0)");
      g.fillStyle=gr;g.beginPath();g.arc(x+ox,y+oy,r,0,7);g.fill();
    });
  }
  const P=w/16;
  for(let j=0;j<16;j++)for(let i=0;i<16;i++){     // the studs: a crown, a shadowed foot
    const x=(i+0.5+(j%2)*0.5)*P, y=(j+0.5)*P;
    wrap((ox,oy)=>{
      const X=x+ox, Y=y+oy; if(X<-P||X>w+P||Y<-P||Y>h+P) return;
      const gr=g.createRadialGradient(X-2,Y-2,1,X,Y,P*0.36);
      gr.addColorStop(0,"rgba(122,126,132,0.9)");gr.addColorStop(0.7,"rgba(70,73,78,0.9)");
      gr.addColorStop(0.86,"rgba(18,19,22,0.8)");gr.addColorStop(1,"rgba(18,19,22,0)");
      g.fillStyle=gr;g.beginPath();g.arc(X,Y,P*0.36,0,7);g.fill();
    });
  }
  for(let i=0;i<5000;i++){                       // grit ground into it
    const v=Math.random();
    g.fillStyle=v<0.5?"rgba(10,10,12,0.35)":"rgba(120,116,104,0.18)";
    g.beginPath();g.arc(Math.random()*w,Math.random()*h,0.5+Math.random()*0.9,0,7);g.fill();
  }
  g.lineCap="round";
  for(let i=0;i<40;i++){                         // scuffed by whatever was rolled in
    const x=Math.random()*w,y=Math.random()*h,a=Math.random()*7,l=20+Math.random()*100;
    g.strokeStyle=`rgba(${Math.random()<0.5?20:140},${Math.random()<0.5?22:144},${Math.random()<0.5?26:148},${0.05+Math.random()*0.10})`;
    g.lineWidth=2+Math.random()*4;
    g.beginPath();g.moveTo(x,y);
    g.quadraticCurveTo(x+l*0.5,y+(Math.random()-0.5)*20,x+Math.cos(a)*l,y+Math.sin(a)*l);
    g.stroke();
  }
});
texElevFloor.wrapS=texElevFloor.wrapT=THREE.RepeatWrapping;
texElevFloor.anisotropy=4;
/* ---- the printed hardware. All ENGRAVING: a dark cut with a bright lip
   under it, on a transparent ground, so the steel plate the plane sits on
   shows through and the legend reads as cut into it rather than stuck on. */
const engrave=(g,txt,x,y,font,al)=>{
  g.font=font; g.textAlign=al||"center";
  g.fillStyle="rgba(26,28,30,0.82)"; g.fillText(txt,x,y);
  g.fillStyle="rgba(242,248,250,0.42)"; g.fillText(txt,x,y+1);
};
/* the car operating panel. Its layout is a shared table — the canvas and
   the button meshes both read COP, so a numeral can never drift off the
   button it belongs to. u runs along +z (toward the doors), v is height. */
/* y0 was 0.90, which put the plate's bottom band — the alarm button and the
   IN CASE OF FIRE legend — behind the handrail: the rail runs the side wall
   at 0.95 and its brackets reach 0.99, and the plate started 0.14m under
   that. The whole table (plate, buttons, print, and the indicator above it,
   which reads y0+h) is lifted clear in one number. */
export const COP={y0:1.06, h:0.92, z0:-0.70, w:0.26,
                  btnU:0.31, lblU:0.63, btnY:[1.78,1.65,1.52,1.39],
                  dcY:1.26, alarmY:1.18};
const texCOP=makeCanvas(128,448,(g,w,h)=>{
  g.clearRect(0,0,w,h);
  /* u runs along +z (toward the doors), v is height. Anything that has to
     line up with a BUTTON is placed through CY() off the same table the
     button meshes read; the loose copy at the foot of the plate is placed
     in canvas pixels, because nothing out there has to meet hardware. */
  const CX=u=>u*w, CY=y=>(1-(y-COP.y0)/COP.h)*h;
  g.textBaseline="middle";
  engrave(g,"CAR ∅",CX(0.5),22,"bold 11px Courier New");
  /* the floors this car serves, including the ones it does not come back
     from — and beside each, six braille cells that spell nothing */
  const names=["0","−1","−2","−3"];
  COP.btnY.forEach((by,i)=>{
    engrave(g,names[i],CX(COP.lblU),CY(by),"bold 24px Courier New");
    for(let d=0;d<6;d++){
      if(Math.random()<0.45) continue;
      g.fillStyle="rgba(30,32,34,0.6)";
      g.beginPath();g.arc(CX(COP.lblU)+18+(d%2)*5,CY(by)-6+((d/2)|0)*5,1.7,0,7);g.fill();
    }
  });
  engrave(g,"◀▶",CX(COP.btnU),CY(COP.dcY)-16,"11px Courier New");
  engrave(g,"▶◀",CX(COP.lblU),CY(COP.dcY)-16,"11px Courier New");
  engrave(g,"ALARM",CX(0.5),CY(COP.alarmY)-22,"bold 10px Courier New");
  /* the fireman's keyway, cut as a slot */
  g.fillStyle="rgba(20,22,24,0.85)";g.fillRect(CX(0.5)-8,414,16,4);
  g.fillStyle="rgba(242,248,250,0.3)";g.fillRect(CX(0.5)-8,418,16,1);
  engrave(g,"IN CASE OF FIRE",CX(0.5),431,"7px Courier New");
  engrave(g,"DO NOT USE THIS LIFT",CX(0.5),441,"7px Courier New");
});
/* the capacity plate, screwed to the back wall where nobody reads it */
const texCapPlate=makeCanvas(192,88,(g,w,h)=>{
  g.clearRect(0,0,w,h);
  g.textBaseline="middle";
  engrave(g,"CAPACITY",w/2,16,"bold 13px Courier New");
  engrave(g,"1000 LB · 13 PERSONS",w/2,34,"9px Courier New");
  g.fillStyle="rgba(26,28,30,0.5)";g.fillRect(24,44,w-48,1);
  engrave(g,"LAST INSPECTED",w/2,58,"8px Courier New");
  engrave(g,"— / — / —",w/2,72,"bold 11px Courier New");
});
/* ---- the cab's dimensions, shared with the cutscenes and THE END ----
   The opening is 2.2 × 2.73: every other number in the elevator derives from
   these three, which is the only reason a resize can be a three-line change
   rather than a hunt through eighty literals.
   The leaves are half the opening plus a 30mm overlap at the meeting stile.
   TRAVEL is CAPPED: a full retraction wants a pocket as wide as a leaf, and
   at a 2.2m opening in a 4m cell the flank is only 0.9m — an uncapped slide
   drives 0.23m of door out of the far side of the wall, into whatever is
   standing there. The leaf stops at the cell edge instead. */
export const ELEV={OPEN_W:2.2, OPEN_H:2.73, DEPTH:2.6};
ELEV.LEAF_W=ELEV.OPEN_W/2+0.03;
ELEV.LEAF_X=ELEV.LEAF_W/2;                          // closed centre, ±
ELEV.TRAVEL=Math.min(ELEV.OPEN_W/2, CELL/2-ELEV.LEAF_W);
/* the hall station. HALL is the shared table again: the plate, the print and
   the two buttons all come off it, so the engraved arrow beside a button
   cannot end up behind it. Canvas y is measured DOWN from the plate's top,
   which is what hallY() converts.
   Its x is measured off the OPENING, not written down flat: the jamb runs out
   to OPEN_W/2+0.15 and a fixed 1.222 left the plate's edge sitting exactly on
   that line — so the first time the cab grew, a third of the station slid
   under the jamb's steel. 0.28 keeps ~60mm of wall visible between them. */
export const HALL={x:ELEV.OPEN_W/2+0.28, y:1.16, w:0.19, h:0.33,
                   cw:96, ch:168, upC:50, dnC:104};
const hallY=cy=>HALL.y+HALL.h/2-(cy/HALL.ch)*HALL.h;
const texHallFace=makeCanvas(HALL.cw,HALL.ch,(g,w,h)=>{
  g.clearRect(0,0,w,h);
  g.textBaseline="middle";
  engrave(g,"▲",68,HALL.upC,"bold 22px Courier New");
  engrave(g,"▼",68,HALL.dnC,"bold 22px Courier New");
  engrave(g,"PRESS ONCE",w/2,148,"7px Courier New");
});
/* the floor designation on the jamb — the only place this level is named */
const texJambNum=makeCanvas(80,120,(g,w,h)=>{
  g.clearRect(0,0,w,h);
  g.textBaseline="middle";
  engrave(g,"0",w/2,52,"bold 46px Courier New");
  engrave(g,"LEVEL",w/2,92,"bold 10px Courier New");
});
/* a screw cap is RIBBED — sixty ridges round it, which is the whole read at
   arm's length; flat black plastic is a rubber stopper */
const texCapRibs=makeCanvas(128,16,(g,w,h)=>{
  for(let x=0;x<w;x+=2){ g.fillStyle=(x/2)%2? "#6a6a6e":"#e6e6ea"; g.fillRect(x,0,2,h); }
});
markShared(texAlmond,texFuseFace,texCeramic,texPanel,texPlate,texCard,texCapRibs,envMetal,
           texElevSteel,texElevFloor,texCOP,texCapPlate,texHallFace,texJambNum);
const glassMat=new THREE.MeshPhongMaterial({color:0xd6e4ea, transparent:true, opacity:0.40,
  specular:0xffffff, shininess:96, side:THREE.DoubleSide,
  envMap:envMetal, combine:THREE.MixOperation, reflectivity:0.14});
const almondMat=new THREE.MeshPhongMaterial({color:0xeadfbe, emissive:0x1a1610,
  specular:0x9a9280, shininess:34});
const capMat=new THREE.MeshPhongMaterial({color:0x2b2b2d, specular:0x4a4a4e, shininess:44,
  bumpMap:texCapRibs, bumpScale:0.004});
const labelMat=new THREE.MeshPhongMaterial({map:texAlmond, specular:0x1a1814, shininess:8,
  side:THREE.DoubleSide});
const brassMat=new THREE.MeshPhongMaterial({color:0xb59a52, specular:0xe4d49a, shininess:82,
  envMap:envMetal, combine:THREE.MultiplyOperation, reflectivity:0.7});
const ceramicMat=new THREE.MeshPhongMaterial({map:texCeramic, specular:0x3a382e, shininess:26});
const fuseFaceMat=new THREE.MeshPhongMaterial({map:texFuseFace, transparent:true,
  specular:0x000000, shininess:1});
markShared(glassMat,almondMat,capMat,labelMat,brassMat,ceramicMat,fuseFaceMat);
/* ---- almond water ----
   A bottle is a PROFILE — heel, straight side, shoulder, neck, lip — and
   turning that profile on a lathe is the whole difference between a bottle
   and a tin can, which is what three stacked cylinders read as. It closes at
   radius 0 on the base (an open ring there shows straight through a
   backface-culled shell) and stays open at the lip, where the cap covers it.
   The liquid is its own inner lathe filled to the shoulder: a transparent
   bottle you cannot see a level in is just a solid. */
function makeBottle(){
  const g=new THREE.Group();
  const V=(x,y)=>new THREE.Vector2(x,y);
  const shell=[V(0,0),V(0.055,0),V(0.078,0.011),V(0.088,0.032),V(0.09,0.055),
               V(0.09,0.235),V(0.088,0.262),V(0.072,0.30),V(0.05,0.331),
               V(0.041,0.352),V(0.041,0.393),V(0.047,0.402),V(0.047,0.414)];
  const body=new THREE.Mesh(new THREE.LatheGeometry(shell,22),glassMat);
  g.add(body);
  const fill=[V(0,0.008),V(0.05,0.008),V(0.072,0.018),V(0.082,0.036),V(0.084,0.056),
              V(0.084,0.239),V(0,0.243)];          // filled to just under the shoulder
  g.add(new THREE.Mesh(new THREE.LatheGeometry(fill,22),almondMat));
  /* the cap: a ribbed screw closure over a tamper ring */
  const cap=new THREE.Mesh(new THREE.CylinderGeometry(0.052,0.052,0.062,18),capMat);
  cap.position.y=0.408; g.add(cap);
  const ring=new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.05,0.011,18),capMat);
  ring.position.y=0.370; g.add(ring);
  const label=new THREE.Mesh(
    new THREE.CylinderGeometry(0.0915,0.0915,0.145,26,1,true),labelMat);
  label.position.y=0.145; g.add(label);
  g.scale.setScalar(1.2);
  g.userData.animated=true;                 // idle-spins in updateProps — keep its matrix live
  return g;
}
/* ---- the fuse ----
   A ceramic cartridge with flat brass BLADES, not a red box with two square
   pegs. Its origin stays at the base and its overall height stays ~0.3: the
   breaker cutscene flies this exact group from (0,−0.25,0.55) to (0,−0.055,
   0.08) and expects it to land inside the slot. */
function makeFuse(){
  const g=new THREE.Group();
  const b=new THREE.Mesh(new THREE.BoxGeometry(0.22,0.3,0.115),ceramicMat);
  b.position.y=0.15; g.add(b);
  for(const sy of[0.038,0.262]){                   // the ferrule bands
    const f=new THREE.Mesh(new THREE.BoxGeometry(0.228,0.03,0.122),brassMat);
    f.position.y=sy; g.add(f);
  }
  /* the printed face, on both sides the way a real one is stamped */
  for(const sz of[-1,1]){
    const face=new THREE.Mesh(new THREE.PlaneGeometry(0.15,0.19),fuseFaceMat);
    face.position.set(0,0.155,sz*0.0585); face.rotation.y=sz>0?0:Math.PI;
    g.add(face);
  }
  /* blades: FLAT, and that is the whole tell that this is a contact and not a
     peg. They stand proud so the breaker's clips have something to grip. */
  for(const sx of[-0.062,0.062]){
    const blade=new THREE.Mesh(new THREE.BoxGeometry(0.052,0.115,0.014),brassMat);
    blade.position.set(sx,0.345,0); g.add(blade);
  }
  g.scale.setScalar(1.2);
  g.userData.animated=true;                 // idle-spins as a pickup / driven inside the breaker
  return g;
}
/* ---- the distribution board ----
   Every canvas here is FITTED to the one part it dresses: nothing tiles, so
   the wear, the print and the damp can each be where they would really be. */
const texGlow=makeCanvas(64,64,(g,w,h)=>{
  const gr=g.createRadialGradient(w/2,h/2,0,w/2,h/2,w/2);
  gr.addColorStop(0,"rgba(255,255,255,1)");gr.addColorStop(0.22,"rgba(255,255,255,0.42)");
  gr.addColorStop(1,"rgba(255,255,255,0)");
  g.fillStyle=gr;g.fillRect(0,0,w,h);
});
/* the door's warning label, sun-faded and damp, one corner torn away */
const texHazard=makeCanvas(256,176,(g,w,h)=>{
  const Y="#d2a91c", K="#15130f";
  g.fillStyle=Y;g.fillRect(0,0,w,h);
  g.fillStyle=K;g.fillRect(0,0,w,46);
  g.strokeStyle=K;g.lineWidth=6;g.strokeRect(3,3,w-6,h-6);
  g.fillStyle=Y;g.textAlign="center";g.textBaseline="middle";
  g.font="bold 34px Arial Narrow, Arial";g.fillText("DANGER",w/2,25);
  const tx=58,ty=112;
  g.fillStyle=K;g.beginPath();g.moveTo(tx,ty-44);g.lineTo(tx+46,ty+36);g.lineTo(tx-46,ty+36);g.closePath();g.fill();
  g.fillStyle=Y;g.beginPath();g.moveTo(tx,ty-30);g.lineTo(tx+34,ty+28);g.lineTo(tx-34,ty+28);g.closePath();g.fill();
  g.fillStyle=K;g.beginPath();
  g.moveTo(tx+5,ty-20);g.lineTo(tx-11,ty+5);g.lineTo(tx-1,ty+5);g.lineTo(tx-7,ty+25);
  g.lineTo(tx+11,ty-2);g.lineTo(tx+1,ty-2);g.closePath();g.fill();
  g.textAlign="left";
  g.font="bold 22px Arial Narrow, Arial";g.fillText("HIGH",116,76);g.fillText("VOLTAGE",116,100);
  g.font="bold 12px Arial";g.fillText("KEEP OUT",116,124);
  g.font="8px Courier New";g.fillText("AUTHORISED PERSONNEL",116,143);g.fillText("ONLY",116,153);
  g.fillStyle="rgba(250,240,205,0.16)";g.fillRect(0,0,w,h);          // the sun has had it
  const dm=g.createLinearGradient(0,h*0.55,0,h);
  dm.addColorStop(0,"rgba(96,74,30,0)");dm.addColorStop(1,"rgba(96,74,30,0.30)");
  g.fillStyle=dm;g.fillRect(0,0,w,h);
  g.lineCap="round";
  for(let i=0;i<22;i++){
    const x=Math.random()*w,y=Math.random()*h,a=Math.random()*Math.PI,l=8+Math.random()*40;
    g.strokeStyle=`rgba(240,232,206,${0.15+Math.random()*0.25})`;g.lineWidth=0.6+Math.random();
    g.beginPath();g.moveTo(x,y);g.lineTo(x+Math.cos(a)*l,y+Math.sin(a)*l);g.stroke();
  }
  g.globalCompositeOperation="destination-out";                      // torn off, not cut
  g.beginPath();g.moveTo(w,h-58);
  for(let k=1;k<=9;k++) g.lineTo(w-k*7-Math.random()*4,h-58+k*6.4+(Math.random()-0.5)*5);
  g.lineTo(w,h);g.closePath();g.fill();
  g.globalCompositeOperation="source-over";
});
/* the voltmeter's dial: 0–300 over 240°, clockwise from 0 at lower left */
const METER_V=300, METER_ARC=240*Math.PI/180;
const texMeter=makeCanvas(256,256,(g,w,h)=>{
  const cx=128,cy=128;
  const face=g.createRadialGradient(cx,cy-20,10,cx,cy,128);
  face.addColorStop(0,"#efe8d2");face.addColorStop(1,"#d3c9ab");
  g.fillStyle=face;g.fillRect(0,0,w,h);
  const A=v=>-METER_ARC/2+METER_ARC*v/METER_V;                       // from up, clockwise
  const P=(v,r)=>[cx+Math.sin(A(v))*r, cy-Math.cos(A(v))*r];
  g.strokeStyle="#a8261c";g.lineWidth=9;
  g.beginPath();g.arc(cx,cy,100,A(250)-Math.PI/2,A(300)-Math.PI/2);g.stroke();
  g.strokeStyle="#1b1a16";g.lineWidth=1.6;
  g.beginPath();g.arc(cx,cy,94,A(0)-Math.PI/2,A(300)-Math.PI/2);g.stroke();
  for(let v=0;v<=300;v+=10){
    const major=v%50===0, [x0,y0]=P(v,94), [x1,y1]=P(v,94+(major?13:6));
    g.lineWidth=major?2:1;g.beginPath();g.moveTo(x0,y0);g.lineTo(x1,y1);g.stroke();
  }
  g.fillStyle="#1b1a16";g.textAlign="center";g.textBaseline="middle";
  for(const v of[0,100,200,300]){ const[x,y]=P(v,72); g.font="bold 21px Arial";g.fillText(String(v),x,y); }
  for(const v of[50,150,250]){ const[x,y]=P(v,76); g.font="13px Arial";g.fillText(String(v),x,y); }
  g.font="bold 30px Arial";g.fillText("V",cx,cy+46);
  g.font="11px Courier New";g.fillText("AC",cx,cy+70);
  g.font="8px Courier New";g.fillText("CLASS 1.5",cx,cy+84);
  g.fillText("E.M.I.",cx,cy-44);
  /* condensation dried inside the glass: a tide line along the bottom */
  g.strokeStyle="rgba(120,92,44,0.28)";g.lineWidth=2.5;
  g.beginPath();g.arc(cx,cy+6,112,Math.PI*0.2,Math.PI*0.8);g.stroke();
  const yl=g.createLinearGradient(0,cy+60,0,h);
  yl.addColorStop(0,"rgba(150,120,60,0)");yl.addColorStop(1,"rgba(150,120,60,0.22)");
  g.fillStyle=yl;g.fillRect(0,0,w,h);
});
/* the instrument band's legends, engraved; laid out off BAND so they sit
   under the lamps they name */
const BAND={w:0.9,h:0.28,y:0.605, meterX:-0.2, redX:0.12, grnX:0.28, lampY:0.632};
const texBand=makeCanvas(512,160,(g,w,h)=>{
  g.clearRect(0,0,w,h);
  g.textBaseline="middle";
  const CX=x=>(x+BAND.w/2)/BAND.w*w, CY=y=>(BAND.y+BAND.h/2-y)/BAND.h*h;
  engrave(g,"FAULT",CX(BAND.redX),CY(BAND.lampY-0.052),"bold 12px Courier New");
  engrave(g,"MAINS",CX(BAND.grnX),CY(BAND.lampY-0.052),"bold 12px Courier New");
  engrave(g,"DB-0",CX(0.2),CY(0.718),"bold 15px Courier New");
  engrave(g,"MAIN DISTRIBUTION · LEVEL 0",CX(0.2),CY(0.492),"9px Courier New");
  engrave(g,"SUPPLY",CX(BAND.meterX),CY(0.492),"9px Courier New");
});
/* the dead-front: light grey paint, handled around the fuse holder, and the
   circuit numbers on paper strips beside each column */
const DEAD={w:0.66,y0:-0.66,y1:0.44, colX:0.215, rowY0:0.34, pitch:0.1, rows:8};
const texDead=makeCanvas(256,420,(g,w,h)=>{
  g.fillStyle="#a2a59c";g.fillRect(0,0,w,h);
  for(let i=0;i<5000;i++){
    const v=Math.random()<0.5;
    g.fillStyle=`rgba(${v?120:196},${v?124:198},${v?116:190},${0.06+Math.random()*0.1})`;
    g.beginPath();g.arc(Math.random()*w,Math.random()*h,0.6+Math.random()*1.2,0,7);g.fill();
  }
  const CX=x=>(x+DEAD.w/2)/DEAD.w*w, CY=y=>(DEAD.y1-y)/(DEAD.y1-DEAD.y0)*h;
  for(let i=0;i<7;i++){                                            // thumbs, round the holder
    const x=CX((Math.random()-0.5)*0.26), y=CY(0.16+(Math.random()-0.5)*0.2), r=6+Math.random()*9;
    const gr=g.createRadialGradient(x,y,0,x,y,r);
    gr.addColorStop(0,`rgba(58,54,44,${0.10+Math.random()*0.12})`);gr.addColorStop(1,"rgba(58,54,44,0)");
    g.fillStyle=gr;g.beginPath();g.ellipse(x,y,r,r*1.3,Math.random(),0,7);g.fill();
  }
  const gm=g.createLinearGradient(0,h*0.65,0,h);
  gm.addColorStop(0,"rgba(40,38,30,0)");gm.addColorStop(1,"rgba(40,38,30,0.26)");
  g.fillStyle=gm;g.fillRect(0,0,w,h);
  g.textAlign="center";g.textBaseline="middle";
  for(const s of[-1,1]){
    const x=CX(s*0.305);
    g.fillStyle="rgba(226,220,196,0.92)";
    g.fillRect(x-9,CY(DEAD.rowY0+0.05),18,CY(DEAD.rowY0-DEAD.pitch*(DEAD.rows-0.5))-CY(DEAD.rowY0+0.05));
    g.fillStyle="#26241c";g.font="bold 9px Courier New";
    for(let i=0;i<DEAD.rows;i++) g.fillText(String(i*2+(s<0?1:2)),x,CY(DEAD.rowY0-i*DEAD.pitch));
  }
  g.fillStyle="rgba(38,36,28,0.7)";g.font="bold 8px Courier New";
  g.fillText("NEUTRAL",CX(0),CY(-0.585));
  g.fillText("MAIN FUSE",CX(0),CY(0.265));
});
/* ON / OFF, on the side of the switch housing */
const texSwPlate=makeCanvas(80,224,(g,w,h)=>{
  g.fillStyle="#8e949a";g.fillRect(0,0,w,h);
  g.fillStyle="rgba(230,236,240,0.3)";g.fillRect(0,0,w,2);
  g.fillStyle="#17191b";g.textAlign="center";g.textBaseline="middle";
  g.font="bold 24px Arial";g.fillText("ON",w/2,30);g.fillText("OFF",w/2,h-30);
  g.font="bold 18px Arial";g.fillText("▲",w/2,58);g.fillText("▼",w/2,h-58);
  g.font="bold 9px Courier New";g.fillText("MAIN",w/2,h/2-6);g.fillText("SWITCH",w/2,h/2+6);
  for(let i=0;i<18;i++){
    g.fillStyle=`rgba(212,220,224,${0.06+Math.random()*0.16})`;
    g.fillRect(Math.random()*w,Math.random()*h,3+Math.random()*18,1);
  }
});
/* a lockout tag on the main switch. Nobody who could have hung it is here. */
const texTag=makeCanvas(128,224,(g,w,h)=>{
  g.clearRect(0,0,w,h);
  g.fillStyle="#d9ccaa";
  g.beginPath();g.moveTo(18,0);g.lineTo(w-18,0);g.lineTo(w,18);g.lineTo(w,h);g.lineTo(0,h);g.lineTo(0,18);g.closePath();g.fill();
  g.fillStyle="#8c2119";g.fillRect(0,40,w,44);
  g.fillStyle="#f1e8d0";g.textAlign="center";g.textBaseline="middle";
  g.font="bold 25px Arial Narrow, Arial";g.fillText("DANGER",w/2,62);
  g.fillStyle="#1d1a14";g.font="bold 17px Arial Narrow, Arial";
  g.fillText("DO NOT",w/2,108);g.fillText("OPERATE",w/2,128);
  g.font="8px Courier New";g.textAlign="left";
  g.fillText("SIGNED",10,160);g.fillText("DATE",10,190);
  g.strokeStyle="rgba(29,26,20,0.5)";g.lineWidth=1;
  g.beginPath();g.moveTo(46,163);g.lineTo(w-10,163);g.moveTo(40,193);g.lineTo(w-10,193);g.stroke();
  g.strokeStyle="rgba(24,26,60,0.75)";g.lineWidth=1.4;                // a hand, and then no hand
  g.beginPath();g.moveTo(50,158);
  for(let x=50;x<108;x+=4) g.lineTo(x,156+Math.sin(x*0.7)*3+(Math.random()-0.5)*3);
  g.stroke();
  g.fillStyle="rgba(24,26,60,0.7)";g.font="9px Courier New";g.fillText("—/—/—",48,188);
  g.fillStyle="#b9ab86";g.beginPath();g.arc(w/2,20,11,0,7);g.fill();   // the reinforced eye
  g.globalCompositeOperation="destination-out";
  g.beginPath();g.arc(w/2,20,5,0,7);g.fill();
  const dm=g.createLinearGradient(0,h*0.6,0,h);
  dm.addColorStop(0,"rgba(110,84,40,0)");dm.addColorStop(1,"rgba(110,84,40,0.28)");
  g.globalCompositeOperation="source-atop";g.fillStyle=dm;g.fillRect(0,0,w,h);
  g.globalCompositeOperation="source-over";
});
/* the cabinet's shadow on the paper behind it. Soft to the edge, or it is a
   dark rectangle stuck to the wall. */
const texBoxShadow=makeCanvas(128,160,(g,w,h)=>{
  g.clearRect(0,0,w,h);
  g.filter="blur(12px)";
  g.fillStyle="rgba(10,8,4,0.58)";g.fillRect(12,14,w-24,h-24);
  g.filter="none";
});
markShared(texGlow,texHazard,texMeter,texBand,texDead,texSwPlate,texTag,texBoxShadow);
const galvMat=new THREE.MeshPhongMaterial({map:texGalv, color:0x7e807c, specular:0x3a3c3a, shininess:26,
  envMap:envMetal, combine:THREE.MultiplyOperation, reflectivity:0.55});
markShared(galvMat);
/* sparks as ONE draw: streak segments in a dynamic buffer, parked at zero
   length when idle. It is in the scene from the build, so its program is
   compiled long before the moment it is needed. */
function makeSparkLines(n){
  const pos=new Float32Array(n*6), col=new Float32Array(n*6);
  const geo=new THREE.BufferGeometry();
  geo.setAttribute("position",new THREE.BufferAttribute(pos,3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute("color",new THREE.BufferAttribute(col,3).setUsage(THREE.DynamicDrawUsage));
  const mesh=new THREE.LineSegments(geo,new THREE.LineBasicMaterial({vertexColors:true,
    transparent:true, blending:THREE.AdditiveBlending, depthWrite:false}));
  mesh.frustumCulled=false;
  const P=[];
  for(let i=0;i<n;i++) P.push({x:0,y:0,z:0,vx:0,vy:0,vz:0,life:0,max:1});
  return {mesh,
    emit(k,o,sp,dir){
      for(const p of P){
        if(k<=0) break;
        if(p.life>0) continue;
        k--;
        p.x=o.x+(Math.random()-0.5)*sp; p.y=o.y+(Math.random()-0.5)*sp; p.z=o.z+(Math.random()-0.5)*sp*0.5;
        const s=0.6+Math.random()*1.6;
        p.vx=(dir.x+(Math.random()-0.5)*1.4)*s; p.vy=(dir.y+Math.random()*0.9-0.2)*s; p.vz=(dir.z+(Math.random()-0.5)*0.8)*s;
        p.life=p.max=0.14+Math.random()*0.32;
      }
    },
    update(dt){
      P.forEach((p,i)=>{
        const j=i*6;
        if(p.life>0){
          p.life-=dt; p.vy-=6.5*dt;
          p.x+=p.vx*dt; p.y+=p.vy*dt; p.z+=p.vz*dt;
        }
        const on=p.life>0, f=on? Math.min(1,p.life/p.max*1.6):0;
        pos[j]=p.x; pos[j+1]=p.y; pos[j+2]=p.z;
        pos[j+3]=on? p.x-p.vx*0.03:p.x; pos[j+4]=on? p.y-p.vy*0.03:p.y; pos[j+5]=on? p.z-p.vz*0.03:p.z;
        col[j]=f; col[j+1]=f*0.82; col[j+2]=f*0.5; col[j+3]=f*0.6; col[j+4]=f*0.3; col[j+5]=f*0.1;
      });
      geo.attributes.position.needsUpdate=true; geo.attributes.color.needsUpdate=true;
    }};
}
function makeBreaker(p,facing){
  /* A surface-mounted distribution board fed from the ceiling: a steel
     cabinet standing on the wall with its conduit running up into the tiles,
     an instrument band (supply voltmeter, FAULT and MAINS lamps) over a door
     on real hinges, and behind the door the dead-front — two columns of
     breakers, half of them tripped, the empty MAIN FUSE holder between them,
     the wiring in open gutters either side. The main switch is a lever on
     the cabinet's side, and someone has hung a lockout tag on it.
     Local frame: +z out of the wall, whose face is at z=−0.15. The cutscene
     reads everything it drives off userData (see startBreakerCine). */
  const WZ=-0.15, FZ=0.10;                                   // wall face, cabinet front
  const g=new THREE.Group();
  const steel=new THREE.MeshPhongMaterial({map:texPanel, specular:0x2c3336, shininess:26});
  const inner=new THREE.MeshPhongMaterial({map:texGalv, color:0x6c7072, specular:0x2a2c2e, shininess:20});
  const deadMat=new THREE.MeshPhongMaterial({map:texDead, specular:0x2a2a26, shininess:14});
  const black=new THREE.MeshPhongMaterial({color:0x17191b, specular:0x3a3e42, shininess:34});
  const bright=new THREE.MeshPhongMaterial({color:0x9aa2a8, specular:0x5c6468, shininess:52,
    envMap:envMetal, combine:THREE.MultiplyOperation, reflectivity:0.6});
  const copper=new THREE.MeshPhongMaterial({color:0x7c4c30, specular:0x5a3c28, shininess:34,
    envMap:envMetal, combine:THREE.MultiplyOperation, reflectivity:0.4});
  const bakelite=new THREE.MeshPhongMaterial({color:0x2b1e17, specular:0x3a302a, shininess:40});
  const redPaint=new THREE.MeshPhongMaterial({color:0x7a241c, specular:0x4a2a26, shininess:30});
  /* static parts go into per-(group, material) buckets and merge */
  const B=new Map();
  const put=(target,mat,geo,x,y,z,rx,ry,rz)=>{
    const m=new THREE.Mesh(geo); m.position.set(x||0,y||0,z||0);
    if(rx||ry||rz) m.rotation.set(rx||0,ry||0,rz||0);
    if(!B.has(target)) B.set(target,new Map());
    const M=B.get(target); if(!M.has(mat)) M.set(mat,[]); M.get(mat).push(m);
    return m;
  };
  const flush=()=>{
    for(const[target,mats]of B)
      for(const[mat,arr]of mats){ target.add(mergeStatic(arr,mat)); for(const m of arr) m.geometry.dispose(); }
    B.clear();
  };
  const box=(t,mat,w,h,d,x,y,z,rx,ry,rz)=>put(t,mat,new THREE.BoxGeometry(w,h,d),x,y,z,rx,ry,rz);
  const cyl=(t,mat,r,len,x,y,z,rx,ry,rz,seg)=>put(t,mat,new THREE.CylinderGeometry(r,r,len,seg||12),x,y,z,rx,ry,rz);
  /* a pressed plate: rounded corners and a rolled edge, its canvas fitted
     across it so edge wear lands on the edges; ry turns it onto a side */
  const plate=(t,mat,w,h,d,r,x,y,z,ry)=>{
    const sh=new THREE.Shape(), X=w/2, Y=h/2;
    sh.moveTo(-X+r,-Y);sh.lineTo(X-r,-Y);sh.quadraticCurveTo(X,-Y,X,-Y+r);sh.lineTo(X,Y-r);
    sh.quadraticCurveTo(X,Y,X-r,Y);sh.lineTo(-X+r,Y);sh.quadraticCurveTo(-X,Y,-X,Y-r);
    sh.lineTo(-X,-Y+r);sh.quadraticCurveTo(-X,-Y,-X+r,-Y);
    const b=Math.min(0.004,d*0.35);
    const geo=new THREE.ExtrudeGeometry(sh,{depth:d-b,bevelEnabled:true,bevelThickness:b,bevelSize:b,bevelSegments:2,curveSegments:4});
    const P=geo.attributes.position, U=geo.attributes.uv;
    for(let i=0;i<P.count;i++) U.setXY(i,P.getX(i)/w+0.5,P.getY(i)/h+0.5);
    return put(t,mat,geo,x,y,z,0,ry||0,0);
  };
  /* ---------- the cabinet ---------- */
  const CW=0.9, CH=1.5, CD=FZ-WZ, CZ=(FZ+WZ)/2;
  box(g,steel,CW,CH,0.012,0,0,WZ+0.006);                                  // back
  for(const s of[-1,1]) box(g,steel,0.014,CH,CD,s*(CW/2-0.007),0,CZ);     // sides
  for(const s of[-1,1]) box(g,steel,CW,0.014,CD,0,s*(CH/2-0.007),CZ);     // top, bottom
  box(g,inner,CW-0.03,CH-0.03,0.004,0,0,WZ+0.014);                         // the galvanised pan inside
  for(const s of[-1,1]) box(g,steel,0.03,1.21,0.02,s*0.435,-0.13,FZ-0.01); // the lips the door closes on
  box(g,steel,CW,0.03,0.02,0,-0.735,FZ-0.01);
  /* the instrument band */
  plate(g,steel,BAND.w,BAND.h,0.02,0.012,0,BAND.y,FZ);
  for(const sx of[-1,1])for(const sy of[-1,1])
    cyl(g,bright,0.007,0.006,sx*0.42,BAND.y+sy*0.112,FZ+0.022,Math.PI/2,0,0,8);
  const legends=new THREE.Mesh(new THREE.PlaneGeometry(BAND.w,BAND.h),
    new THREE.MeshPhongMaterial({map:texBand, transparent:true, depthWrite:false, specular:0x000000}));
  legends.position.set(0,BAND.y,FZ+0.0205); g.add(legends);
  /* the supply voltmeter: a case, a rim, the dial, the needle, the glass */
  const MX=BAND.meterX, MY=BAND.y+0.005;
  cyl(g,black,0.09,0.016,MX,MY,FZ+0.028,Math.PI/2,0,0,28);
  put(g,bright,new THREE.TorusGeometry(0.081,0.008,8,32),MX,MY,FZ+0.036);
  const dial=new THREE.Mesh(new THREE.CircleGeometry(0.076,40),
    new THREE.MeshPhongMaterial({map:texMeter, specular:0x222018, shininess:10}));
  dial.position.set(MX,MY,FZ+0.0365); g.add(dial);
  const needle=new THREE.Group(); needle.position.set(MX,MY,FZ+0.038); g.add(needle);
  const needleMat=new THREE.MeshPhongMaterial({color:0x151515, specular:0x222222, shininess:20});
  const nd=new THREE.Mesh(new THREE.BoxGeometry(0.0032,0.068,0.0012),needleMat);
  nd.position.y=0.03; needle.add(nd);
  const hub=new THREE.Mesh(new THREE.CylinderGeometry(0.008,0.008,0.004,12),needleMat);
  hub.rotation.x=Math.PI/2; needle.add(hub);
  const needleAng=v=>METER_ARC/2-METER_ARC*v/METER_V;                    // rotation.z for a reading
  needle.rotation.z=needleAng(0);
  const glass=new THREE.Mesh(new THREE.CircleGeometry(0.078,40),
    new THREE.MeshPhongMaterial({color:0x000000, transparent:true, opacity:0.22,
      specular:0xffffff, shininess:110, depthWrite:false}));
  glass.position.set(MX,MY,FZ+0.041); g.add(glass);
  /* the pilot lamps: a lens you can see is dark when it is dark, and a glow
     round it when it is lit */
  const lamp=(x,on,off)=>{
    put(g,bright,new THREE.TorusGeometry(0.026,0.007,8,24),x,BAND.lampY,FZ+0.024);
    const lens=new THREE.Mesh(new THREE.SphereGeometry(0.02,14,10),new THREE.MeshBasicMaterial({color:off}));
    lens.position.set(x,BAND.lampY,FZ+0.024); lens.scale.z=0.6; g.add(lens);
    const dome=new THREE.Mesh(new THREE.SphereGeometry(0.023,14,10),
      new THREE.MeshPhongMaterial({color:0x000000, transparent:true, opacity:0.3,
        specular:0xffffff, shininess:120, depthWrite:false}));
    dome.position.set(x,BAND.lampY,FZ+0.026); dome.scale.z=0.65; g.add(dome);
    const halo=new THREE.Mesh(new THREE.PlaneGeometry(0.15,0.15),new THREE.MeshBasicMaterial({map:texGlow,
      color:on, transparent:true, opacity:0, blending:THREE.AdditiveBlending, depthWrite:false}));
    halo.position.set(x,BAND.lampY,FZ+0.042); g.add(halo);
    return {lens,halo,on:new THREE.Color(on),off:new THREE.Color(off)};
  };
  const lampR=lamp(BAND.redX,0xff3a22,0x3a0c08), lampG=lamp(BAND.grnX,0x4cff62,0x0c2a12);
  const setLamp=(L,k)=>{ L.lens.material.color.copy(L.off).lerp(L.on,k); L.halo.material.opacity=0.6*k; };
  setLamp(lampR,1); setLamp(lampG,0);
  /* ---------- behind the door ---------- */
  const DZ=-0.07;                                                          // the dead-front's face
  plate(g,deadMat,DEAD.w,DEAD.y1-DEAD.y0,0.008,0.01,0,(DEAD.y0+DEAD.y1)/2,DZ-0.008);
  const rowY=i=>DEAD.rowY0-i*DEAD.pitch;
  const trips=[], tripped=new Set([1,4,6,9,10,13,15]), off=new Set([3,12]);
  const TOG_ON=-0.42, TOG_OFF=0.42, TOG_TRIP=0.02;
  for(let i=0;i<DEAD.rows;i++)for(const s of[-1,1]){
    const n=i*2+(s<0?0:1), x=s*DEAD.colX, y=rowY(i);
    box(g,black,0.13,0.085,0.05,x,y,DZ+0.018);
    box(g,black,0.05,0.03,0.012,x,y,DZ+0.049);                             // the handle's collar
    const piv=new THREE.Group(); piv.position.set(x,y,DZ+0.055); g.add(piv);
    const tog=new THREE.Mesh(new THREE.BoxGeometry(0.03,0.022,0.032),black);
    tog.position.z=0.012; piv.add(tog);
    piv.rotation.x= tripped.has(n)? TOG_TRIP : off.has(n)? TOG_OFF : TOG_ON;
    if(tripped.has(n)){
      /* a tripped breaker shows its flag */
      const flag=new THREE.Mesh(new THREE.BoxGeometry(0.018,0.008,0.004),
        new THREE.MeshBasicMaterial({color:0xd25a1c}));
      flag.position.set(x+s*0.04,y+0.018,DZ+0.0435); g.add(flag);
      trips.push({piv,flag,x});
    }
  }
  /* the main fuse holder: a phenolic block with its jaws on the underside,
     fed by two copper straps off the main lugs */
  const SOCK={y:0.16,h:0.11,z:0.0};
  box(g,black,0.25,0.012,0.12,0,SOCK.y+SOCK.h/2+0.006,SOCK.z-0.005);
  box(g,bakelite,0.26,SOCK.h,0.1,0,SOCK.y,SOCK.z);
  box(g,bakelite,0.23,0.08,0.006,0,SOCK.y,SOCK.z+0.052);                  // its moulded face
  for(const sx of[-0.09,0.09]) cyl(g,copper,0.008,0.006,sx,SOCK.y,SOCK.z+0.057,Math.PI/2,0,0,10);
  for(const sx of[-0.062,0.062]){
    box(g,copper,0.06,0.004,0.03,sx,SOCK.y-SOCK.h/2-0.001,SOCK.z);        // the jaw's mouth
    box(g,copper,0.028,0.13,0.004,sx,0.295,-0.04);                         // the strap up to the lugs
  }
  box(g,bakelite,0.24,0.07,0.05,0,0.38,-0.045);                            // main lugs
  for(const sx of[-0.07,0,0.07]){
    cyl(g,bright,0.011,0.012,sx,0.38,-0.014,Math.PI/2,0,0,6);
    cyl(g,black,0.012,0.12,sx,0.46,-0.05,0,0,0,10);                        // the feed, down from the conduit
  }
  box(g,copper,0.5,0.02,0.016,0,-0.52,-0.052);                             // neutral bar
  for(let k=0;k<9;k++) cyl(g,bright,0.0055,0.008,-0.2+k*0.05,-0.52,-0.041,Math.PI/2,0,0,8);
  for(const sx of[-0.27,0.27]) box(g,black,0.03,0.04,0.03,sx,-0.52,-0.06);
  /* the wiring: one conductor off each breaker out into the side gutter and
     up to the top, and the white neutrals down into the bar */
  const wireMats=[0x141414,0x6e1a14,0xb8b3a2,0x22325a].map(c=>
    new THREE.MeshPhongMaterial({color:c, specular:0x3a3a3a, shininess:40}));
  const wire=(mat,pts)=>put(g,mat,new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(pts.map(q=>new THREE.Vector3(q[0],q[1],q[2]))),20,0.0045,5,false));
  for(let i=0;i<DEAD.rows;i++)for(const s of[-1,1]){
    const y=rowY(i), j=(Math.random()-0.5)*0.02, zj=-0.1-Math.random()*0.03;
    wire(wireMats[(i+(s>0?1:0))%2===0?0:(Math.random()<0.5?1:3)],
      [[s*0.31,y,-0.085],[s*0.345,y+0.02,-0.095],[s*(0.37+j),y+0.09,zj],
       [s*(0.375+j*0.6),(y+0.72)/2+0.05,zj],[s*(0.38+j*0.3),0.73,zj]]);
  }
  for(let k=0;k<4;k++){
    const bx=-0.2+k*0.05;
    wire(wireMats[2],[[-0.39+k*0.008,-0.1,-0.12],[-0.37,-0.4,-0.1],[-0.34,-0.49,-0.06],[bx,-0.508,-0.05]]);
  }
  /* ---------- the main switch, on the cabinet's right side ---------- */
  const SWX=CW/2, SWY=-0.02, SWZ=-0.02;
  plate(g,steel,0.2,0.42,0.018,0.012,SWX,SWY,-0.025,Math.PI/2);
  const swPlate=new THREE.Mesh(new THREE.PlaneGeometry(0.08,0.22),
    new THREE.MeshPhongMaterial({map:texSwPlate, specular:0x2e3336, shininess:24}));
  swPlate.position.set(SWX+0.0185,SWY,-0.08); swPlate.rotation.y=Math.PI/2; g.add(swPlate);
  cyl(g,bright,0.034,0.04,SWX+0.036,SWY,SWZ+0.03,0,0,Math.PI/2,16);
  const lever=new THREE.Group(); lever.position.set(SWX+0.055,SWY,SWZ+0.03); g.add(lever);
  const arm=new THREE.Mesh(new THREE.BoxGeometry(0.026,0.27,0.032),redPaint);
  arm.position.y=0.125; lever.add(arm);
  const grip=new THREE.Mesh(new THREE.CylinderGeometry(0.021,0.021,0.11,14),black);
  grip.rotation.z=Math.PI/2; grip.position.set(0.05,0.25,0); lever.add(grip);
  const LEVER_OFF=Math.PI-0.55, LEVER_ON=0.55;
  lever.rotation.x=LEVER_OFF;
  const tag=new THREE.Group(); tag.position.set(0.085,0.25,0); lever.add(tag);
  const str=new THREE.Mesh(new THREE.CylinderGeometry(0.0013,0.0013,0.05,4),
    new THREE.MeshPhongMaterial({color:0x8a8168}));
  str.position.y=-0.025; tag.add(str);
  const card=new THREE.Mesh(new THREE.PlaneGeometry(0.065,0.114),
    new THREE.MeshPhongMaterial({map:texTag, alphaTest:0.5, side:THREE.DoubleSide, specular:0x111111, shininess:4}));
  card.position.y=-0.105; card.rotation.y=Math.PI/2+0.25; tag.add(card);
  tag.rotation.x=-LEVER_OFF;                                                // it hangs
  /* ---------- the conduit, up the wall into the ceiling ---------- */
  const TOP=WALL_H0-p.y;
  const pipe=(x,r)=>{
    const z=WZ+r+0.012, len=TOP-CH/2;
    const geo=new THREE.CylinderGeometry(r,r,len,14,1,true), U=geo.attributes.uv;
    for(let i=0;i<U.count;i++) U.setXY(i,U.getX(i)*(2*Math.PI*r)/0.5,U.getY(i)*len/0.5);
    put(g,galvMat,geo,x,CH/2+len/2,z);
    cyl(g,galvMat,r*1.4,0.04,x,CH/2+0.02,z);                               // the connector
    cyl(g,galvMat,r*1.18,0.05,x,CH/2+len*0.52,z);                          // a coupling
    for(const sy of[CH/2+len*0.28,CH/2+len*0.8]){                          // straps, screwed to the wall
      box(g,galvMat,2*r+0.012,0.018,0.004,x,sy,z+r+0.002);
      for(const sx of[-1,1]){
        box(g,galvMat,0.004,0.018,r+0.004,x+sx*(r+0.004),sy,z+0.001);
        box(g,galvMat,0.022,0.018,0.003,x+sx*(r+0.016),sy,WZ+0.0015);
        cyl(g,bright,0.004,0.004,x+sx*(r+0.02),sy,WZ+0.004,Math.PI/2,0,0,6);
      }
    }
    const hole=new THREE.Mesh(new THREE.RingGeometry(r*1.05,r*1.9,18),
      new THREE.MeshBasicMaterial({color:0x14120c}));
    hole.rotation.x=Math.PI/2; hole.position.set(x,TOP-0.016,z); g.add(hole);
  };
  pipe(-0.24,0.032); pipe(0.02,0.022); pipe(0.22,0.022);
  /* a pull box on the middle run */
  plate(g,steel,0.12,0.12,0.06,0.008,0.02,CH/2+0.62,WZ);
  for(const sy of[-1,1]) cyl(g,bright,0.006,0.005,0.02,CH/2+0.62+sy*0.045,WZ+0.062,Math.PI/2,0,0,8);
  /* the cabinet's shadow on the paper */
  const shade=new THREE.Mesh(new THREE.PlaneGeometry(CW+0.34,CH+0.4),
    new THREE.MeshBasicMaterial({map:texBoxShadow, transparent:true, depthWrite:false}));
  shade.position.set(0,-0.04,WZ+0.002); g.add(shade);
  /* ---------- the door ---------- */
  const DH=1.18, DY=-0.13;
  const pivot=new THREE.Group(); pivot.position.set(-0.43,DY,FZ); g.add(pivot);
  const door=new THREE.Group(); door.position.x=0.43; pivot.add(door);
  plate(door,steel,0.86,DH,0.026,0.01,0,0,0);
  for(const[w,h,x,y]of[[0.672,0.012,0,0.53],[0.672,0.012,0,-0.53],[0.012,1.072,0.33,0],[0.012,1.072,-0.33,0]])
    box(door,steel,w,h,0.004,x,y,0.028);                                    // the pressed rib
  for(const[w,h,x,y]of[[0.86,0.012,0,DH/2-0.006],[0.86,0.012,0,-DH/2+0.006],[0.012,DH,0.424,0],[0.012,DH,-0.424,0]])
    box(door,steel,w,h,0.014,x,y,-0.007);                                   // its folded returns
  for(let k=0;k<7;k++){                                                    // louvres, hooded
    const y=-0.30-k*0.03;
    box(door,black,0.3,0.009,0.002,-0.04,y,0.0265);
    box(door,steel,0.31,0.015,0.004,-0.04,y+0.004,0.03,0.55,0,0);
  }
  const plateMat=new THREE.MeshPhongMaterial({map:texPlate, specular:0x2e3336, shininess:24});
  box(door,plateMat,0.28,0.078,0.004,-0.19,0.46,0.028);
  for(const sx of[-1,1])for(const sy of[-1,1]) cyl(door,bright,0.004,0.004,-0.19+sx*0.128,0.46+sy*0.027,0.031,Math.PI/2,0,0,6);
  const hazard=new THREE.Mesh(new THREE.PlaneGeometry(0.24,0.165),
    new THREE.MeshPhongMaterial({map:texHazard, alphaTest:0.5, specular:0x1c1a14, shininess:8}));
  hazard.position.set(0.05,0.2,0.0275); door.add(hazard);
  for(const y of[-0.45,0,0.45]) cyl(door,bright,0.013,0.1,-0.436,y,0.013,0,0,0,10);   // knuckle hinges
  box(door,bright,0.06,0.15,0.004,0.38,-0.02,0.028);                        // the latch escutcheon
  const latch=new THREE.Group(); latch.position.set(0.38,-0.02,0.032); door.add(latch);
  const lh=new THREE.Mesh(new THREE.CylinderGeometry(0.014,0.014,0.012,12),bright);
  lh.rotation.x=Math.PI/2; latch.add(lh);
  const lt=new THREE.Mesh(new THREE.BoxGeometry(0.018,0.085,0.016),black);
  lt.position.z=0.012; latch.add(lt);
  /* inside the door: the directory, where it always is */
  const cardMat=new THREE.MeshPhongMaterial({map:texCard, specular:0x1c1c18, shininess:5});
  const dir=new THREE.Mesh(new THREE.PlaneGeometry(0.26,0.3),cardMat);
  dir.position.set(0.02,0.1,-0.0065); dir.rotation.y=Math.PI; door.add(dir);   // clear of the plate's bevel
  for(const[w,h,x,y]of[[0.28,0.012,0.02,-0.055],[0.012,0.3,0.155,0.1],[0.012,0.3,-0.115,0.1]])
    box(door,bright,w,h,0.004,x,y,-0.008);
  flush();
  /* ---------- what the cutscene drives ---------- */
  const fuse=makeFuse(); fuse.scale.setScalar(1);
  fuse.visible=false; g.add(fuse);
  const FUSE_SEAT=new THREE.Vector3(0,SOCK.y-SOCK.h/2-0.303,SOCK.z);
  const arc=new THREE.Mesh(new THREE.PlaneGeometry(0.9,0.9),new THREE.MeshBasicMaterial({map:texGlow,
    color:0xb8d4ff, transparent:true, opacity:0, blending:THREE.AdditiveBlending, depthWrite:false}));
  arc.position.set(0,0.33,0.05); g.add(arc);
  const sparks=makeSparkLines(48); g.add(sparks.mesh);
  const u=g.userData;
  Object.assign(u,{doorPivot:pivot, latch, fuse, FUSE_SEAT, lever, LEVER_OFF, LEVER_ON, tag,
    needle, needleAng, lampR, lampG, setLamp, trips, TOG_ON, arc, sparks,
    socket:new THREE.Vector3(0,SOCK.y-SOCK.h/2,SOCK.z+0.05),
    lugs:new THREE.Vector3(0,0.38,0.0),
    switchAt:new THREE.Vector3(SWX+0.03,SWY+0.06,SWZ+0.1),
    DOOR_OPEN:-2.02, powered:false});
  /* the state the cutscene leaves it in, for the debug warp */
  u.setPowered=()=>{
    pivot.rotation.y=u.DOOR_OPEN; latch.rotation.z=-Math.PI/2;
    fuse.visible=true; fuse.position.copy(FUSE_SEAT); fuse.rotation.set(0,0,0);
    lever.rotation.x=LEVER_ON; tag.rotation.x=-LEVER_ON;
    needle.rotation.z=needleAng(230); setLamp(lampR,0); setLamp(lampG,1);
    for(const t of trips){ t.piv.rotation.x=TOG_ON; t.flag.visible=false; }
    u.powered=true;
  };
  g.position.copy(p); g.rotation.y=facing;
  g.userData.animated=true;                 // the cutscene swings its door and throws its switch
  return g;
}
/* the cab's panels are EMBOSSED stainless — the fine woven pattern cars
   are lined with because it hides a thousand hands. As a bump on the
   brushed map it is invisible past a metre and makes the panel a
   different metal from the plain lining around it up close. */
const texLinen=makeCanvas(256,256,(g,w,h)=>{
  g.fillStyle="#808080";g.fillRect(0,0,w,h);
  for(let i=0;i<9000;i++){
    const x=Math.random()*w, y=Math.random()*h, horiz=((x/6|0)+(y/6|0))%2===0;
    const l=3+Math.random()*4, v=Math.random()<0.5? 170:70;
    g.strokeStyle=`rgba(${v},${v},${v},0.35)`;g.lineWidth=1;
    g.beginPath();
    if(horiz){ g.moveTo(x,y); g.lineTo(x+l,y+(Math.random()-0.5)); }
    else     { g.moveTo(x,y); g.lineTo(x+(Math.random()-0.5),y+l); }
    g.stroke();
  }
});
/* ---- the elevator's material set, module-level and shared ----
   One brushed map under four tints does every metal in it; the trim is
   painted rather than brushed, so it takes a flat dark colour. Merging is
   done BY these materials, which is what keeps a cab this detailed to
   roughly the draw count of the six-box one it replaces. */
/* every brushed metal takes the level's reflection by MULTIPLY (envMetal):
   the door darkens toward its foot where it would mirror the floor and holds
   its light toward the head where it would mirror the ceiling, which is what
   makes stainless read as stainless and not as grey paint with a hotspot */
const _elevBright=new THREE.MeshPhongMaterial({map:texElevSteel, color:0xbcc2c6,
  specular:0x9aa2a8, shininess:70, bumpMap:texElevSteel, bumpScale:0.0006,
  envMap:envMetal, combine:THREE.MultiplyOperation, reflectivity:0.75});   // doors, jambs, sills, bezels
const elevLineMat  =new THREE.MeshPhongMaterial({map:texElevSteel, color:0x8b9198,
  specular:0x5a6066, shininess:40, bumpMap:texElevSteel, bumpScale:0.0005,
  envMap:envMetal, combine:THREE.MultiplyOperation, reflectivity:0.5});    // the cab's lining
const elevPanelMat =new THREE.MeshPhongMaterial({map:texElevSteel, color:0x7c8289,
  specular:0x5a6066, shininess:38, bumpMap:texLinen, bumpScale:0.0009,
  envMap:envMetal, combine:THREE.MultiplyOperation, reflectivity:0.5});    // its raised panels
/* the dark panel that stands in for a mirror. Held OFF both extremes on
   purpose: at a near-black base under a shininess of 110 it flipped between
   a black rectangle — which in the middle of a back wall reads as a doorway
   — and a blown-out white blob, depending only on where the car light was. */
const elevSmokeMat =new THREE.MeshPhongMaterial({map:texElevSteel, color:0x53595f,
  specular:0x6e767c, shininess:64,
  envMap:envMetal, combine:THREE.MultiplyOperation, reflectivity:0.6});
const elevDarkMat  =new THREE.MeshPhongMaterial({color:0x33373b, specular:0x22262a, shininess:26});
const elevRubberMat=new THREE.MeshPhongMaterial({color:0x141517, specular:0x1e2022, shininess:10});
const elevAlarmMat =new THREE.MeshPhongMaterial({color:0x6e1a12, specular:0xd05a40, shininess:60});
const elevVoidMat  =new THREE.MeshBasicMaterial({color:0x050505});   // the hole above the hatch
const elevFloorMat =new THREE.MeshPhongMaterial({map:texElevFloor, bumpMap:texElevFloor, bumpScale:0.004,
  specular:0x2a2c30, shininess:22});
const copFaceMat   =new THREE.MeshPhongMaterial({map:texCOP, transparent:true,
  specular:0x000000, shininess:1});
const capPlateMat  =new THREE.MeshPhongMaterial({map:texCapPlate, transparent:true,
  specular:0x000000, shininess:1});
const hallFaceMat  =new THREE.MeshPhongMaterial({map:texHallFace, transparent:true,
  specular:0x000000, shininess:1});
const jambNumMat   =new THREE.MeshPhongMaterial({map:texJambNum, transparent:true,
  specular:0x000000, shininess:1});
/* the black acrylic of the hall lantern's window */
const elevGlassMat =new THREE.MeshPhongMaterial({color:0x050505, specular:0xb0b0b0, shininess:90});
markShared(texLeafWear,texHallDigit,texExitFace,texExitGlow,texLinen,elevGlassMat);
markShared(_elevBright,elevLineMat,elevPanelMat,elevSmokeMat,elevDarkMat,elevRubberMat,
           elevAlarmMat,elevVoidMat,elevFloorMat,copFaceMat,capPlateMat,hallFaceMat,jambNumMat);
/* ---- what the doors of the working car reflect: the hall itself ----
   envMetal gives every metal a floor-to-ceiling falloff, which is right for
   trim; the doors of the car you are sent to find want the ROOM — the paper,
   the lamp in the ceiling, the carpet — softly, in the steel. One small cube
   capture, taken the first time you come near (so the fixtures around it
   are bound and lit), mixed in at a fraction. 32² is small on purpose: a
   cube capture has no parallax, so a SHARP one bends the room into arcs
   across a flat door — blurred, it is only the room's light and colour,
   which is what brushed steel gives back anyway. Shared across builds and
   re-shot on each, so nothing leaks per respawn. */
const reflRT=new THREE.WebGLCubeRenderTarget(32,{generateMipmaps:true,minFilter:THREE.LinearMipmapLinearFilter});
const reflCam=new THREE.CubeCamera(0.05,60,reflRT);
reflCam.update(renderer,new THREE.Scene());          // allocate it (black) before any door samples it
markShared(reflRT.texture);
const _rp=new THREE.Vector3();
function reflectElevator(){
  const e=exitDoor;
  if(!e||!e.userData.reflPending||STATE.level!==0) return;
  e.localToWorld(_rp.set(0,1.45,0.9));
  if(Math.hypot(_rp.x-STATE.pos.x,_rp.z-STATE.pos.z)>16) return;
  e.userData.reflPending=false;
  e.visible=false;
  reflCam.position.copy(_rp); reflCam.update(renderer,scene);
  e.visible=true;
}
export function makeElevator(p,facing,opts={}){
  /* the exit elevator, carved INTO its wall cell: placeProps removes that
     cell's wall box and this rebuilds it as flanks + header around a
     recessed cab. Local frame: origin at the centre of the doorway face at
     floor level, +z pointing out into the room. The grid cell stays solid,
     so collision still keeps the player out — only the cutscene camera
     ever goes inside. THE END reuses this builder for the CRASHED arrival
     cab, passing its own (taller) wall height and wall material. */
  const {OPEN_W,OPEN_H,DEPTH}=ELEV;
  const WALL_H=opts.wallH||WALL_H0;
  /* IN is the CENTRE of the 60mm cab lining; the surface you can touch is
     IN−0.03. Everything mounted inside the car is set off IN rather than
     written down as a number, so a wider opening carries the panelling, the
     handrail, the egg-crate and the car panel out with it. */
  const HW=OPEN_W/2, IN=HW-0.03;
  const g=new THREE.Group();
  /* the working car's bright steel mixes in the captured hall; the wrecked
     one in THE END keeps the shared envMetal */
  const live=!opts.wrecked;
  const elevBrightMat=live? Object.assign(_elevBright.clone(),{envMap:reflRT.texture,
    combine:THREE.MixOperation, reflectivity:0.14}) : _elevBright;
  if(live) g.userData.reflPending=true;
  const wallM=opts.wallMat||new THREE.MeshPhongMaterial({map:texWall, specular:0x0d0c07, shininess:6});
  /* Everything static goes into a per-material bucket and comes out as one
     mesh each. This build has roughly five times the parts the old one had
     and costs FEWER draws than it did, which is the only way a cab can
     afford real panelling, a real sill, an egg-crate ceiling and a car
     panel you can read. Anything the cutscene drives — the leaves, the
     lamps, the buttons, the indicator — stays its own object. */
  const B=new Map();
  const put=(mat,geo,x,y,z,rx,ry,rz)=>{
    const m=new THREE.Mesh(geo);
    m.position.set(x||0,y||0,z||0);
    if(rx||ry||rz) m.rotation.set(rx||0,ry||0,rz||0);
    if(!B.has(mat)) B.set(mat,[]);
    B.get(mat).push(m);
    return m;
  };
  /* a box wearing its steel at a fixed world scale, so a 2.5m leaf and a
     20mm bezel carry the same grain */
  const sbox=(mat,w,h,d,x,y,z,tile)=>
    put(mat,scaleBoxUV(new THREE.BoxGeometry(w,h,d),w,h,d,tile||0.5),x,y,z);
  const pbox=(mat,w,h,d,x,y,z,rx)=>put(mat,new THREE.BoxGeometry(w,h,d),x,y,z,rx);
  const rod=(mat,r,len,x,y,z,rx,ry,rz)=>
    put(mat,new THREE.CylinderGeometry(r,r,len,9),x,y,z,rx,ry,rz);
  /* a moulding: a 2-D profile extruded along its length, UV'd so the grain
     runs down it. `vert` stands it up as a jamb (profile x across the face,
     y OUT of the wall, drawn negative); otherwise it lies along x as a head
     (profile x UP, y out). Both maps are proper rotations, so the faces keep
     their winding. */
  const moulding=(mat,pts,len,vert,x0,y0,z0)=>{
    const sh=new THREE.Shape();
    pts.forEach(([x,y,q],i)=>{ if(!i) sh.moveTo(x,y); else if(q) sh.quadraticCurveTo(q[0],q[1],x,y); else sh.lineTo(x,y); });
    const geo=new THREE.ExtrudeGeometry(sh,{depth:len,bevelEnabled:false,curveSegments:5});
    const P=geo.attributes.position, N=geo.attributes.normal, U=geo.attributes.uv;
    for(let i=0;i<P.count;i++){
      const px=P.getX(i), py=P.getY(i), pz=P.getZ(i), nx=N.getX(i), ny=N.getY(i), nz=N.getZ(i);
      U.setXY(i,(Math.abs(px)+Math.abs(py))/0.5,pz/0.5);
      if(vert){ P.setXYZ(i,x0+px,y0+pz,z0-py); N.setXYZ(i,nx,nz,-ny); }
      else    { P.setXYZ(i,x0+pz,y0+px,z0+py); N.setXYZ(i,nz,nx,ny); }
    }
    put(mat,geo);
  };
  /* a rounded plate, bevelled, standing proud of the wall by `d` */
  const plate=(mat,w,h,d,r,x,y,z)=>{
    const sh=new THREE.Shape(), X=w/2, Y=h/2;
    sh.moveTo(-X+r,-Y);sh.lineTo(X-r,-Y);sh.quadraticCurveTo(X,-Y,X,-Y+r);sh.lineTo(X,Y-r);
    sh.quadraticCurveTo(X,Y,X-r,Y);sh.lineTo(-X+r,Y);sh.quadraticCurveTo(-X,Y,-X,Y-r);
    sh.lineTo(-X,-Y+r);sh.quadraticCurveTo(-X,-Y,-X+r,-Y);
    const b=Math.min(0.004,d*0.4);
    const geo=new THREE.ExtrudeGeometry(sh,{depth:d-b,bevelEnabled:true,bevelThickness:b,bevelSize:b,bevelSegments:2,curveSegments:5});
    const P=geo.attributes.position, U=geo.attributes.uv;
    for(let i=0;i<P.count;i++) U.setXY(i,P.getX(i)/0.5,P.getY(i)/0.5);
    geo.translate(x,y,z);
    put(mat,geo);
  };
  /* the same plate, turned to face into the car from a side wall (ry) */
  const plateR=(mat,w,h,d,r,x,y,z,ry)=>{
    const sh=new THREE.Shape(), X=w/2, Y=h/2;
    sh.moveTo(-X+r,-Y);sh.lineTo(X-r,-Y);sh.quadraticCurveTo(X,-Y,X,-Y+r);sh.lineTo(X,Y-r);
    sh.quadraticCurveTo(X,Y,X-r,Y);sh.lineTo(-X+r,Y);sh.quadraticCurveTo(-X,Y,-X,Y-r);
    sh.lineTo(-X,-Y+r);sh.quadraticCurveTo(-X,-Y,-X+r,-Y);
    const b=Math.min(0.005,d*0.4);
    const geo=new THREE.ExtrudeGeometry(sh,{depth:d-b,bevelEnabled:true,bevelThickness:b,bevelSize:b,bevelSegments:3,curveSegments:5});
    const P=geo.attributes.position, U=geo.attributes.uv;
    for(let i=0;i<P.count;i++) U.setXY(i,P.getX(i)/0.5,P.getY(i)/0.5);
    put(mat,geo,x,y,z,0,ry||0,0);
  };
  const flushBuckets=(target)=>{
    for(const[mat,arr]of B){
      target.add(mergeStatic(arr,mat));
      for(const m of arr) m.geometry.dispose();
    }
    B.clear();
  };
  /* ---------- the wall rebuilt around the opening ----------
     With opts.uvTile the odd-sized flank/header boxes map their wall texture
     at a fixed world scale, so they sit seamlessly beside the regular
     full-size cells (THE END); level 0 takes raw box UVs, like every other
     wall on that floor. */
  /* Level 0's walls carry raw box UVs, one whole canvas per 4m face — so
     the flanks and header used to squeeze all eight stripes (and the
     skirting, and the wall angle) into whatever face they had. Their room
     face now maps its own slice of that same canvas instead: x across the
     cell, height up the wall, so the paper runs on from the neighbouring
     wall box and the header shows the top of the sheet, not a skirting
     hung over the door. (x0,y0) is the face's lower-left in the cell. */
  const wallGeo=(w,h,d,x0,y0)=>{
    const geo=new THREE.BoxGeometry(w,h,d);
    if(opts.uvTile) scaleBoxUV(geo,w,h,d,opts.uvTile);
    else{
      const uv=geo.attributes.uv;
      for(let i=16;i<20;i++)                       // +z: the face looking into the room
        uv.setXY(i,(x0+uv.getX(i)*w)/CELL,(y0+uv.getY(i)*h)/WALL_H);
      uv.needsUpdate=true;
    }
    return geo;
  };
  const flankW=(CELL-OPEN_W)/2;
  put(wallM,wallGeo(flankW,WALL_H,CELL,0,0),-(HW+flankW/2),WALL_H/2,-CELL/2);
  put(wallM,wallGeo(flankW,WALL_H,CELL,CELL-flankW,0), (HW+flankW/2),WALL_H/2,-CELL/2);
  put(wallM,wallGeo(OPEN_W,WALL_H-OPEN_H,CELL,flankW,OPEN_H),0,(WALL_H+OPEN_H)/2,-CELL/2);
  put(wallM,wallGeo(OPEN_W,OPEN_H,CELL-DEPTH,flankW,0),0,OPEN_H/2,-(DEPTH+(CELL-DEPTH)/2));
  /* ---------- cab shell ----------
     The floor's top sits 2mm UNDER the sill's, deliberately: the sill plates
     reach back into the cab's footprint, and two coplanar top faces at the
     same height is a 0.14×2m band of z-fighting right where the camera
     walks in. */
  sbox(elevFloorMat, OPEN_W,0.028,DEPTH, 0,0.014,-DEPTH/2, 1.0);
  sbox(elevLineMat, OPEN_W,0.06,DEPTH, 0,OPEN_H-0.03,-DEPTH/2);        // ceiling slab
  sbox(elevLineMat, OPEN_W,OPEN_H,0.06, 0,OPEN_H/2,-DEPTH+0.03);       // back
  for(const s of[-1,1]) sbox(elevLineMat, 0.06,OPEN_H,DEPTH, s*IN,OPEN_H/2,-DEPTH/2);
  /* the panelling. These seams were PRINTED into the old wall canvas, and
     that canvas then tiled onto boxes of four different sizes — so the
     "panels" were a different width on every surface and there were four
     of them on a 20mm post. They are raised boards between stiles now,
     which is also the only version that throws a shadow. */
  const PY0=0.24, PY1=OPEN_H-0.22, PH=PY1-PY0, PCY=(PY0+PY1)/2;
  for(const s of[-1,1])
    for(const pz of[-1.94,-0.72]) plateR(elevPanelMat,1.06,PH,0.016,0.02, s*(IN-0.030),PCY,pz, s>0?-Math.PI/2:Math.PI/2);
  /* three boards across the back wall — the middle one stands in for the
     mirror. Their width is solved from the lining rather than written down,
     so the 65mm margin at the corners and the 125mm gap between boards hold
     at any cab width instead of leaving a bare strip beside the kick posts. */
  const BPW=(2*(IN-0.065)-0.25)/3, BPX=BPW+0.125;
  for(const px of[-BPX,0,BPX])
    plateR(px===0? elevSmokeMat:elevPanelMat, BPW,PH,0.016,0.02, px,PCY,-DEPTH+0.060);
  /* the crashed car took the impact through the back panel */
  if(opts.wrecked)
    put(new THREE.MeshPhongMaterial({map:makeCrackTexture(), transparent:true, opacity:0.85,
        depthWrite:false, specular:0x000000, shininess:1}),
      new THREE.PlaneGeometry(0.44,1.5), 0.10,PCY+0.12,-DEPTH+0.078);
  /* kick and cove, both proud of the lining */
  for(const s of[-1,1]){
    pbox(elevDarkMat,0.022,0.20,DEPTH-0.08, s*(IN-0.041),0.10,-DEPTH/2);
    pbox(elevDarkMat,0.022,0.10,DEPTH-0.08, s*(IN-0.041),OPEN_H-0.12,-DEPTH/2);
  }
  pbox(elevDarkMat,OPEN_W-0.14,0.20,0.022, 0,0.10,-DEPTH+0.071);
  pbox(elevDarkMat,OPEN_W-0.14,0.10,0.022, 0,OPEN_H-0.12,-DEPTH+0.071);
  /* the front pair sit at −0.13, not −0.10: at −0.10 a post's box and the
     door leaf's own box share 2mm of z, so the leaf grinds through it for
     the whole slide */
  for(const[px,pz]of[[-1,-DEPTH+0.07],[1,-DEPTH+0.07],[-1,-0.13],[1,-0.13]])
    pbox(elevDarkMat,0.05,OPEN_H,0.05, px*(IN-0.05),OPEN_H/2,pz);
  /* ---------- the luminous ceiling ----------
     A dropped frame, the diffuser in it, an egg-crate under that and the
     inspection hatch beside it. The grid is ROUND BAR for the reason the
     troffer's guard had to learn: 1.5mm of blade seen edge-on is nothing,
     and straight up is the one angle anybody ever looks at a cab ceiling
     from — which in THE END is the first thing you do. */
  const LZ=-DEPTH/2, LW2=2*IN-0.50, LD=0.98, LY=OPEN_H-0.10;
  /* the crate's z-running bars are spaced ACROSS the frame, so their pitch
     has to be solved from its width — a fixed 0.295 leaves the whole family
     shunted to one side the moment the frame is not 1.44 wide */
  const CRX=(LW2-0.26)/4;
  pbox(elevDarkMat,LW2+0.14,0.08,0.07, 0,LY,LZ-LD/2-0.035);
  pbox(elevDarkMat,LW2+0.14,0.08,0.07, 0,LY,LZ+LD/2+0.035);
  pbox(elevDarkMat,0.07,0.08,LD, -LW2/2-0.035,LY,LZ);
  pbox(elevDarkMat,0.07,0.08,LD,  LW2/2+0.035,LY,LZ);
  for(let i=0;i<5;i++){
    /* a wrecked car has lost two bars out of the crate and bent a third —
       the cheapest damage in the whole cab and the one you look straight at */
    if(!(opts.wrecked&&i===3))
      rod(elevDarkMat,0.008,LW2-0.03, 0,LY-0.055,LZ-LD/2+0.10+i*0.195, 0,0,
          opts.wrecked&&i===1? Math.PI/2+0.16 : Math.PI/2);
    if(!(opts.wrecked&&i===1))
      rod(elevDarkMat,0.008,LD-0.03, -LW2/2+0.13+i*CRX,LY-0.071,LZ, Math.PI/2,0,0);
  }
  /* the inspection hatch. Its trim is BRIGHT, not dark: 18mm of dark trim
     on a dark ceiling is invisible, and this hatch is the single most
     evocative thing in the cab — in THE END you wake on the floor looking
     straight up at it. When the car is wrecked it is hanging open, and the
     hole above it is the way something got out. */
  const HZ=-DEPTH+0.44, HS=0.62, hatch=[];
  const hbox=(w,h,d,x,y,z)=>{
    const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d)); m.position.set(x,y,z);
    hatch.push(m); return m;
  };
  /* the aperture: an unlit black plane 2mm under the ceiling, which is all
     it takes for the opening to read as a hole rather than a lid lying on
     a solid slab */
  if(opts.wrecked)
    put(elevVoidMat,new THREE.PlaneGeometry(HS-0.03,HS-0.03), 0,OPEN_H-0.062,HZ, Math.PI/2);
  hbox(HS+0.07,0.022,0.045, 0,-0.010,-HS/2);
  hbox(HS+0.07,0.022,0.045, 0,-0.010, HS/2);
  hbox(0.045,0.022,HS, -HS/2,-0.010,0);
  hbox(0.045,0.022,HS,  HS/2,-0.010,0);
  hbox(HS-0.05,0.014,HS-0.05, 0,-0.004,0);                   // the leaf itself
  hbox(0.12,0.026,0.06, 0,-0.014, HS/2+0.03);                // the hasp
  if(opts.wrecked){
    /* forced from above and left hanging INTO the car off its rear knuckles.
       Down, not up: swung up it drives 0.5m of lid straight through the
       ceiling slab it is hinged to. */
    for(const m of hatch) m.position.z+=HS/2;                 // rebase onto the hinge
    const lid=mergeStatic(hatch,elevBrightMat);
    for(const m of hatch) m.geometry.dispose();
    const pv=new THREE.Group();
    pv.position.set(0,OPEN_H-0.058,HZ-HS/2);
    pv.rotation.x=-0.92;
    pv.add(lid); g.add(pv);
  } else {
    for(const m of hatch){ m.position.y+=OPEN_H-0.058; m.position.z+=HZ; }
    g.add(mergeStatic(hatch,elevBrightMat));
    for(const m of hatch) m.geometry.dispose();
  }
  for(const s of[-1,1]) rod(elevDarkMat,0.016,0.10, s*0.18,OPEN_H-0.070,HZ-HS/2, 0,0,Math.PI/2);
  /* ---------- handrail, on real brackets ---------- */
  const RY=0.95, RBX=(OPEN_W-0.44)/2-0.16;   // back-rail bracket spread
  rod(elevBrightMat,0.022,OPEN_W-0.44, 0,RY,-DEPTH+0.135, 0,0,Math.PI/2);
  for(const bx of[-RBX,0,RBX]){
    pbox(elevBrightMat,0.075,0.075,0.022, bx,RY,-DEPTH+0.078);
    rod(elevBrightMat,0.014,0.06, bx,RY,-DEPTH+0.105, Math.PI/2,0,0);
  }
  for(const s of[-1,1]){
    rod(elevBrightMat,0.022,DEPTH-0.62, s*(IN-0.105),RY,-DEPTH/2-0.05, Math.PI/2,0,0);
    for(const bz of[-2.10,-1.30,-0.52]){
      pbox(elevBrightMat,0.022,0.075,0.075, s*(IN-0.041),RY,bz);
      rod(elevBrightMat,0.014,0.06, s*(IN-0.065),RY,bz, 0,0,Math.PI/2);
    }
  }
  /* ---------- return-air grilles ----------
     In the KICK and the COVE, which are the only two bands of the back wall
     that are not panelled: anywhere between them and the grille's box and a
     raised panel's box fight over the same 16mm of z. */
  const GX=BPX-0.125;                        // rides with the board above it
  for(const[vy,vh]of[[0.105,0.13],[OPEN_H-0.12,0.075]]){
    pbox(elevDarkMat,0.50,vh+0.024,0.010, GX,vy,-DEPTH+0.083);
    const n=Math.max(3,Math.round(vh/0.028));
    for(let i=0;i<n;i++)
      pbox(elevBrightMat,0.46,0.012,0.024, GX,vy-vh/2+vh/(2*n)+i*(vh/n),-DEPTH+0.090, -0.55);
  }
  /* the capacity plate, proud of the panel it is screwed to — and CENTRED on
     that board, or a wider cab walks the board out from under it */
  const CAPX=-BPX;
  sbox(elevBrightMat,0.36,0.17,0.012, CAPX,1.62,-DEPTH+0.082);
  /* ---------- the portal, from the hall ---------- */
  const zg1=-0.062, zg2=-0.140;             // the two sill grooves; zg1 takes the leaves
  pbox(elevDarkMat,OPEN_W+0.14,0.018,0.26, 0,0.009,-0.098);            // the sill's pan
  for(const[z0,z1]of[[0.020,zg1+0.013],[zg1-0.013,zg2+0.013],[zg2-0.013,-0.215]])
    sbox(elevBrightMat,OPEN_W+0.10,0.014,z0-z1, 0,0.023,(z0+z1)/2);
  for(const s of[-1,1]) pbox(elevDarkMat,0.035,OPEN_H,0.14, s*(HW-0.018),OPEN_H/2,0.055);
  pbox(elevDarkMat,OPEN_W,0.06,0.14, 0,OPEN_H-0.03,0.055);
  /* the entrance frame: two side casings and a head casing that caps them,
     each a real profile — a rounded return into the opening, a flat face
     with a quirk cut in it, a rounded outer edge — so every edge catches the
     light instead of the frame reading as three boxes of grey */
  const JAMB=[[0,0],[0,-0.092],[0.022,-0.13,[0,-0.13]],[0.046,-0.13],[0.050,-0.124],[0.056,-0.124],[0.060,-0.13],
              [0.128,-0.13],[0.15,-0.108,[0.15,-0.13]],[0.15,0]];
  for(const s2 of[-1,1])
    moulding(elevBrightMat,JAMB.map(([x,y,q])=>[s2*x,y,q&&[s2*q[0],q[1]]]),OPEN_H,true,s2*HW,0,0);
  moulding(elevBrightMat,[[0,0],[0,0.098],[0.024,0.14,[0,0.14]],[0.056,0.14],[0.060,0.134],[0.066,0.134],[0.070,0.14],
                          [0.148,0.14],[0.17,0.118,[0.17,0.14]],[0.17,0]],OPEN_W+0.34,false,-(OPEN_W+0.34)/2,OPEN_H,0);
  /* the floor designation, cut into a plate on the jamb — the only place
     in the building that names the floor you are standing on */
  sbox(elevBrightMat,0.12,0.19,0.012, -(HW+0.075),1.95,0.136);
  /* the hall station, and the hall lantern over the head */
  plate(elevBrightMat,HALL.w+0.03,HALL.h+0.05,0.016,0.018, HALL.x+0.038,HALL.y,0.007);
  for(const[sx,sy]of[[-1,1],[1,1],[-1,-1],[1,-1]])          // its four screws
    rod(elevDarkMat,0.0065,0.006, HALL.x+0.038+sx*0.088,HALL.y+sy*0.15,0.025, Math.PI/2,0,0);
  for(const cy of[HALL.upC,HALL.dnC]){                      // and the two bezels
    const t=new THREE.TorusGeometry(0.036,0.006,8,24);
    put(elevBrightMat,t,HALL.x,hallY(cy),0.030);
  }
  /* the hall lantern and position indicator over the head: a rounded steel
     plate, a black acrylic window, the two arrows the ding lights and the
     figure of the floor the car is standing at */
  plate(elevBrightMat,0.66,0.25,0.04,0.03, 0,OPEN_H+0.42,0.012);
  put(elevGlassMat,new THREE.PlaneGeometry(0.60,0.19), 0,OPEN_H+0.42,0.0535);
  flushBuckets(g);
  /* ---------- the parts the cutscenes drive ---------- */
  const printed=(mat,w,h,x,y,z,ry)=>{
    const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),mat);
    m.position.set(x,y,z); if(ry) m.rotation.y=ry;
    g.add(m); return m;
  };
  printed(jambNumMat,0.10,0.15, -(HW+0.075),1.95,0.143);
  printed(hallFaceMat,HALL.w,HALL.h, HALL.x+0.038,HALL.y,0.0235);
  printed(capPlateMat,0.34,0.155, CAPX,1.62,-DEPTH+0.089);
  /* the ceiling diffuser. cabLightMat is the cutscene's handle on it: the
     panel it drives is the only thing in the cab that reads as "the light
     is on", quite apart from the point source. */
  const cabLightMat=new THREE.MeshBasicMaterial({color:0x2a2317});
  const backing=new THREE.Mesh(new THREE.PlaneGeometry(LW2,LD),
    new THREE.MeshPhongMaterial({color:0x2c2e30, specular:0x000000, shininess:4}));
  backing.rotation.x=Math.PI/2; backing.position.set(0,LY-0.008,LZ);
  g.add(backing);
  const lightPanel=new THREE.Mesh(new THREE.PlaneGeometry(LW2-0.06,LD-0.06),cabLightMat);
  lightPanel.rotation.x=Math.PI/2; lightPanel.position.set(0,LY-0.030,LZ);
  g.add(lightPanel); g.userData.cabLightMat=cabLightMat;
  const cabLight=new THREE.PointLight(0xffeecc,0,6,1.8);
  cabLight.position.set(0,OPEN_H-0.35,LZ); g.add(cabLight); g.userData.cabLight=cabLight;
  /* the emergency lamp, in a guarded fitting. `emerg` MUST stay a direct
     child of g — the elevator cutscene copies its .position straight into a
     PointLight in the group's frame, and nesting it under a housing would
     silently reinterpret that as an offset from the housing. */
  const emergMat=new THREE.MeshBasicMaterial({color:0x1c0404});
  const emerg=new THREE.Mesh(new THREE.SphereGeometry(0.05,10,8),emergMat);
  emerg.scale.z=0.75; emerg.position.set(0,OPEN_H-0.24,-DEPTH+0.12); g.add(emerg);
  g.userData.emergMat=emergMat; g.userData.emerg=emerg;
  /* the ride's red emergency light and the brake sparks' glow live in the
     scene from the build, dark: made when the ride started they changed the
     light count and recompiled every shader in view — a one-second freeze on
     the call button */
  if(live){
    const eml=new THREE.PointLight(0xff2515,0,5,2);
    eml.position.copy(emerg.position); eml.position.z+=0.25; eml.position.y-=0.08;
    g.add(eml); g.userData.emergLight=eml;
    const spk=new THREE.PointLight(0xff9540,0,3.5,2);
    spk.position.set(0,1.3,-0.35); g.add(spk); g.userData.sparkLight=spk;
  }
  {
    const gd=[];
    const gb=new THREE.Mesh(new THREE.BoxGeometry(0.22,0.14,0.05));
    gb.position.set(0,OPEN_H-0.24,-DEPTH+0.078); gd.push(gb);
    for(const[rx,ry]of[[0,-Math.PI/2],[Math.PI/2,0]]){
      const h2=new THREE.Mesh(new THREE.TorusGeometry(0.078,0.006,5,11,Math.PI));
      h2.rotation.set(rx,ry,0); h2.position.set(0,OPEN_H-0.24,-DEPTH+0.105); gd.push(h2);
    }
    g.add(mergeStatic(gd,elevDarkMat));
    for(const m of gd) m.geometry.dispose();
  }
  /* ---------- the car operating panel ----------
     Faceplate, print and buttons all read the one COP table, so a numeral
     can never drift off the button it belongs to — the same rule that put
     the vintage PC's vents back onto the surfaces they sit on. */
  const CPX=IN-0.041, PF=CPX-0.011;         // plate centre / its face into the cab
  sbox(elevBrightMat,0.022,COP.h+0.10,COP.w+0.06, CPX,COP.y0+COP.h/2,COP.z0+COP.w/2);
  const zAt=u=>COP.z0+u*COP.w;
  g.userData.panelBtns=[];
  COP.btnY.forEach((by,i)=>{
    put(elevDarkMat,new THREE.CylinderGeometry(0.031,0.031,0.009,14),
        PF-0.004,by,zAt(COP.btnU), 0,0,Math.PI/2);
    const bm=new THREE.MeshBasicMaterial({color:0x2a2014});
    const b=new THREE.Mesh(new THREE.CylinderGeometry(0.023,0.023,0.018,14),bm);
    b.rotation.z=Math.PI/2; b.position.set(PF-0.013,by,zAt(COP.btnU)); g.add(b);
    g.userData.panelBtns.push(bm);
  });
  for(const u of[COP.btnU,COP.lblU])        // door open / door close
    put(elevBrightMat,new THREE.CylinderGeometry(0.019,0.019,0.014,12),
        PF-0.007,COP.dcY,zAt(u), 0,0,Math.PI/2);
  put(elevDarkMat,new THREE.CylinderGeometry(0.026,0.026,0.010,14),
      PF-0.005,COP.alarmY,zAt(0.5), 0,0,Math.PI/2);
  put(elevAlarmMat,new THREE.CylinderGeometry(0.019,0.019,0.016,14),
      PF-0.013,COP.alarmY,zAt(0.5), 0,0,Math.PI/2);
  /* the indicator, in a recess of its own above the column */
  const DY=COP.y0+COP.h+0.20, DZ=zAt(0.5);
  sbox(elevBrightMat,0.022,0.30,0.50, CPX,DY,DZ);
  pbox(elevDarkMat,0.012,0.22,0.44, PF-0.006,DY,DZ);
  flushBuckets(g);
  printed(copFaceMat,COP.w,COP.h, PF-0.003,COP.y0+COP.h/2,COP.z0+COP.w/2,-Math.PI/2);
  const fdC=document.createElement("canvas"); fdC.width=128; fdC.height=56;
  const fdT=new THREE.CanvasTexture(fdC);
  const drawFloor=(txt,color="#ffb347")=>{
    const gx=fdC.getContext("2d");
    gx.fillStyle="#0a0a0c";gx.fillRect(0,0,128,56);
    gx.fillStyle=color;gx.font="bold 36px Courier New";gx.textAlign="center";
    gx.textBaseline="middle";gx.fillText(txt,64,31);
    fdT.needsUpdate=true;
  };
  drawFloor("");
  const fd=new THREE.Mesh(new THREE.PlaneGeometry(0.40,0.18),
    new THREE.MeshBasicMaterial({map:fdT}));
  fd.position.set(PF-0.014,DY,DZ); fd.rotation.y=-Math.PI/2; g.add(fd);
  g.userData.drawFloor=drawFloor; g.userData.dispLocal=fd.position.clone();
  /* ---------- the leaves ----------
     Two flat slabs before, with their meeting stiles PRINTED on. A door is
     a formed panel: a face sheet with the edges folded back at top and
     bottom, a dark astragal down the leading edge with the rubber safety
     shoe on it, a kick plate, and a gib underneath riding the sill groove.
     The groove and the gib share zg1 — one number, so the shoe can never
     hover over the slot it is supposed to run in. */
  const LWD=ELEV.LEAF_W, LHD=OPEN_H-0.06, LCY=OPEN_H/2;
  const makeLeaf=(side)=>{
    const d=new THREE.Group();
    const st=[], dk=[], rb=[];
    const lb=(arr,w,h,dp,x,y,z,tile)=>{
      const geo=new THREE.BoxGeometry(w,h,dp);
      if(tile) scaleBoxUV(geo,w,h,dp,tile);
      const m=new THREE.Mesh(geo); m.position.set(x,y,z); arr.push(m); return m;
    };
    const lead=-side*(LWD/2-0.014);          // the meeting edge faces the centre
    lb(st,LWD,LHD,0.030, 0,LCY,zg1, 0.5);                    // face sheet
    lb(st,LWD,0.048,0.056, 0,LCY+LHD/2-0.024,zg1+0.010, 0.5);// folded returns
    lb(st,LWD,0.048,0.056, 0,LCY-LHD/2+0.024,zg1+0.010, 0.5);
    lb(st,LWD-0.05,0.26,0.006, 0,0.20,zg1+0.018, 0.5);       // kick plates, both faces
    lb(st,LWD-0.05,0.26,0.006, 0,0.20,zg1-0.018, 0.5);
    lb(dk,0.028,LHD,0.062, lead,LCY,zg1);                    // astragal
    lb(rb,0.014,LHD,0.050, lead-side*0.017,LCY,zg1);         // safety shoe
    /* the gib: it rides IN zg1, the same number the sill's front groove is
       cut at, so the shoe can never hover beside the slot it runs in */
    for(const gx2 of[-0.30,0.30]) lb(dk,0.10,0.014,0.022, gx2,0.025,zg1);
    for(const[arr,mat]of[[st,elevBrightMat],[dk,elevDarkMat],[rb,elevRubberMat]]){
      d.add(mergeStatic(arr,mat));
      for(const m of arr) m.geometry.dispose();
    }
    /* the fitted wear, on the hall face, mirrored so both meeting edges
       carry the hands */
    const wear=new THREE.Mesh(new THREE.PlaneGeometry(LWD-0.03,LHD),
      new THREE.MeshPhongMaterial({map:texLeafWear, transparent:true, depthWrite:false,
        specular:0x000000, shininess:1}));
    wear.position.set(0,LCY,zg1+0.0215); if(side<0) wear.scale.x=-1;
    d.add(wear);
    d.position.set(side*ELEV.LEAF_X,0,0);
    /* one leaf came out of its track. This is a ROLL about z, not a
       translation: the cutscene owns .position.x on both leaves, so any
       damage that lives in x is wiped the first time the doors move. */
    if(opts.wrecked&&side>0){ d.rotation.z=-0.018; d.rotation.y=0.022; }
    return d;
  };
  const doorL=makeLeaf(-1), doorR=makeLeaf(1);
  g.add(doorL); g.add(doorR); g.userData.doorL=doorL; g.userData.doorR=doorR;
  /* ---------- the hall lantern: dark until a car answers ---------- */
  g.userData.hallLamps=[];
  for(const[ly,rz]of[[OPEN_H+0.42,0],[OPEN_H+0.42,Math.PI]]){
    const lm=new THREE.MeshBasicMaterial({color:0x241a06});
    const tri=new THREE.Mesh(new THREE.CircleGeometry(0.052,3),lm);
    tri.position.set(rz? 0.19:-0.19,ly,0.0545); tri.rotation.z=rz+Math.PI/2;
    g.add(tri); g.userData.hallLamps.push(lm);
  }
  const digit=new THREE.Mesh(new THREE.PlaneGeometry(0.16,0.12),
    new THREE.MeshBasicMaterial({map:texHallDigit, color:0x6a6a6a}));
  digit.position.set(0,OPEN_H+0.42,0.0545); g.add(digit);
  /* ---------- the EXIT sign: a real box, not a decal ----------
     A rounded housing on two hangers, the legend lit from behind, and the
     green it throws on the wall around it — driven off the sign's own
     material, so it wakes with the power exactly as the face does. */
  {
    const sh=[];
    for(const s2 of[-1,1]){
      const br=new THREE.Mesh(new THREE.BoxGeometry(0.04,0.16,0.08));
      br.position.set(s2*0.30,OPEN_H+1.03,0.04); sh.push(br);
    }
    g.add(mergeStatic(sh,elevDarkMat));
    for(const m of sh) m.geometry.dispose();
  }
  plate(elevDarkMat,0.94,0.38,0.11,0.035, 0,OPEN_H+0.82,0.02);
  const sign=new THREE.Mesh(new THREE.PlaneGeometry(0.84,0.30),
    new THREE.MeshBasicMaterial({map:texExitFace}));
  sign.position.set(0,OPEN_H+0.82,0.1315); g.add(sign); g.userData.sign=sign;
  sign.material.color.set(0x333333);
  const glowMat=new THREE.MeshBasicMaterial({map:texExitGlow, color:0x000000,
    transparent:true, depthWrite:false, blending:THREE.AdditiveBlending});
  const glow=new THREE.Mesh(new THREE.PlaneGeometry(1.5,0.76),glowMat);
  glow.position.set(0,OPEN_H+0.82,0.008); g.add(glow);
  glow.onBeforeRender=()=>{ const c=sign.material.color; glowMat.color.setRGB(c.r*0.05,c.g*0.30,c.b*0.08); };
  /* ---------- the call buttons ----------
     DOWN is the one that matters, so DOWN is `btnMat`/`btnLocal` — the ride
     cutscene lights that material and aims the camera at that position. */
  const btnMat=new THREE.MeshBasicMaterial({color:0x3a1a08});
  const btn=new THREE.Mesh(new THREE.CylinderGeometry(0.030,0.030,0.020,14),btnMat);
  btn.rotation.x=Math.PI/2; btn.position.set(HALL.x,hallY(HALL.dnC),0.040); g.add(btn);
  g.userData.btnMat=btnMat; g.userData.btnLocal=btn.position.clone();
  const up=new THREE.Mesh(new THREE.CylinderGeometry(0.030,0.030,0.020,14),
    new THREE.MeshBasicMaterial({color:0x231208}));
  up.rotation.x=Math.PI/2; up.position.set(HALL.x,hallY(HALL.upC),0.040); g.add(up);
  /* each button sits in a thin lit ring that answers with it */
  for(const[cy,mat]of[[HALL.dnC,btnMat],[HALL.upC,up.material]]){
    const ring=new THREE.Mesh(new THREE.RingGeometry(0.0302,0.0335,24),mat);
    ring.position.set(HALL.x,hallY(cy),0.0352); g.add(ring);
  }
  g.position.copy(p); g.rotation.y=facing;
  g.userData.animated=true;                 // doors slide, buttons/sign light during the ride cutscene
  return g;
}
export function placeProps(){
  const used=new Set(), spawn={cx:W>>1,cy:H>>1};
  const spawnW=cellToWorld(spawn.cx,spawn.cy);
  const DIRS=[[1,0,-Math.PI/2],[-1,0,Math.PI/2],[0,1,Math.PI],[0,-1,0]];   // [dx,dy,facing]
  /* bounded retry: on a pathological map, accept a reused cell over a hang */
  const pick=(minD)=>{
    let c=randomOpenCell(minD);
    for(let t=0;t<300&&used.has(c.cy*W+c.cx);t++) c=randomOpenCell(minD);
    used.add(c.cy*W+c.cx);
    return c;
  };
  /* almond water must NOT be visible from the fall-in point — a bottle sitting
     down a straight sightline from spawn is a free pickup that trivialises the
     opening. Reject any cell with line of sight to spawn; fall back to a plain
     pick if the map is too open to find a hidden spot. */
  const pickHidden=(minD)=>{
    for(let t=0;t<300;t++){
      const c=randomOpenCell(minD);
      if(used.has(c.cy*W+c.cx)) continue;
      const p=cellToWorld(c.cx,c.cy);
      if(losCells(spawnW.x,spawnW.z,p.x,p.z)) continue;
      used.add(c.cy*W+c.cx); return c;
    }
    return pick(minD);
  };
  for(let i=0;i<3;i++){
    const c=pickHidden(6+i*2), p=cellToWorld(c.cx,c.cy), b=makeBottle();
    b.position.set(p.x+rand(-1,1),0,p.z+rand(-1,1));
    scene.add(b);
    interactables.push({kind:"bottle",mesh:b,label:"TAKE ALMOND WATER",taken:false});
  }
  {
    const c=pick(10), p=cellToWorld(c.cx,c.cy), f=makeFuse();
    f.position.set(p.x+rand(-1,1),0,p.z+rand(-1,1));
    scene.add(f);
    interactables.push({kind:"fuse",mesh:f,label:"TAKE FUSE",taken:false});
  }
  {
    let c,dir;
    outer: for(let t=0;t<600;t++){
      c=randomOpenCell(9);
      for(const[dx,dy,fy]of DIRS){
        if(isWall(c.cx+dx,c.cy+dy)&&!used.has(c.cy*W+c.cx)){dir={dx,dy,fy};used.add(c.cy*W+c.cx);break outer;}
      }
    }
    /* failsafe: sweep the grid instead of crashing on `c.cx` if 600 random
       tries never landed on an unused open cell beside a wall */
    if(!dir) sweep: for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){
      if(isWall(x,y)||used.has(y*W+x)) continue;
      for(const[dx,dy,fy]of DIRS)
        if(isWall(x+dx,y+dy)){c={cx:x,cy:y};dir={dx,dy,fy};used.add(y*W+x);break sweep;}
    }
    const p=cellToWorld(c.cx,c.cy);
    const bp=new THREE.Vector3(p.x+dir.dx*(CELL/2-0.15),1.4,p.z+dir.dy*(CELL/2-0.15));
    const br=makeBreaker(bp,dir.fy);
    scene.add(br);
    interactables.push({kind:"breaker",mesh:br,label:"INSERT FUSE",taken:false});
  }
  {
    let best=null,bestD=-1;
    for(let t=0;t<900;t++){
      const c=randomOpenCell(0);
      const d=Math.hypot(c.cx-spawn.cx,c.cy-spawn.cy);
      if(d<bestD) continue;
      for(const[dx,dy,fy]of DIRS){
        if(isWall(c.cx+dx,c.cy+dy)){best={c,dx,dy,fy};bestD=d;break;}
      }
    }
    /* failsafe: same grid sweep as the breaker — any wall-adjacent open cell
       beats a crash on `best.c` */
    if(!best) sweep: for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){
      if(isWall(x,y)) continue;
      for(const[dx,dy,fy]of DIRS)
        if(isWall(x+dx,y+dy)){best={c:{cx:x,cy:y},dx,dy,fy};break sweep;}
    }
    const p=cellToWorld(best.c.cx,best.c.cy);
    /* the elevator replaces the wall box behind the doorway with its own
       carved-out geometry (the grid cell itself stays solid). Any mold or
       drip decals on that wall would float over the opening — take them too. */
    const wallKey=(best.c.cy+best.dy)*W+(best.c.cx+best.dx);
    const wm=wallMeshes.get(wallKey);
    if(wm) scene.remove(wm);
    removeDecalsOnWall(wallKey);
    const dp=new THREE.Vector3(p.x+best.dx*(CELL/2),0,p.z+best.dy*(CELL/2));
    exitDoor=makeElevator(dp,best.fy);
    scene.add(exitDoor);
    interactables.push({kind:"exit",mesh:exitDoor,label:"CALL ELEVATOR",taken:false});
  }
  /* the elevator carve is done — collapse the surviving wall boxes into one
     mesh, then freeze every static object so it stops paying per-frame matrix
     cost (entities are added after this returns) */
  mergeDecals();
  mergeWallMeshes();
  freezeStaticScene();
}

/* ---------------- prop idle ---------------- */
export function updateProps(t){
  reflectElevator();
  for(const it of interactables){
    if(it.kind==="breaker"&&it.mesh.userData.powered){
      const u=it.mesh.userData;                    // the supply is never quite steady
      u.needle.rotation.z=u.needleAng(230+Math.sin(t*1.3)*1.5+Math.sin(t*7.1)*0.6);
      continue;
    }
    if(it.taken) continue;
    if(it.kind==="bottle"||it.kind==="fuse"){
      it.mesh.rotation.y=t*0.8;
      it.mesh.position.y=0.12+Math.sin(t*2+it.mesh.position.x)*0.05;
    } else if(it.kind==="disc"){
      /* a slow turn and a whisper of a hover — enough to read as takeable
         on a murky shelf without breaking the still-library mood */
      it.mesh.rotation.y=t*0.55+it.baseY;
      it.mesh.position.y=it.baseY+Math.sin(t*1.6+it.mesh.position.x*2)*0.018;
    }
  }
}
