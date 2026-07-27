/* ---------------- props ---------------- */
import { rand } from "./utils.js";
import { W, H, CELL, WALL_H as WALL_H0, cellToWorld, randomOpenCell, isWall, losCells } from "./map.js";
import { makeCanvas, texWall, scaleBoxUV, makeCrackTexture } from "./textures.js";
import { scene, wallMeshes, removeDecalsOnWall, mergeWallMeshes, freezeStaticScene,
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
/* painted steel, for the panel: orange peel, old scratches, rust creeping up
   from the bottom edge (v=0 is the bottom of the door under flipY) */
const texPanel=makeCanvas(256,256,(g,w,h)=>{
  g.fillStyle="#5b666a";g.fillRect(0,0,w,h);
  for(let i=0;i<3000;i++){                          // orange peel in the paint
    const v=Math.random()<0.5;
    g.fillStyle=`rgba(${v?68:126},${v?76:136},${v?80:140},${0.10+Math.random()*0.16})`;
    g.fillRect(Math.random()*w,Math.random()*h,1+Math.random()*2.4,1+Math.random()*2);
  }
  for(let i=0;i<26;i++){                            // scratches down to bare metal
    g.save();g.translate(Math.random()*w,Math.random()*h);g.rotate(Math.random()*Math.PI);
    g.fillStyle=`rgba(178,186,190,${0.10+Math.random()*0.22})`;
    g.fillRect(0,0,6+Math.random()*40,1);g.restore();
  }
  for(let i=0;i<14;i++){                            // rust blooming off the bottom rail
    const x=Math.random()*w, y=h-Math.pow(Math.random(),1.7)*h*0.45;
    const r=5+Math.random()*20;
    const gr=g.createRadialGradient(x,y,0,x,y,r);
    gr.addColorStop(0,`rgba(122,62,26,${0.14+Math.random()*0.26})`);
    gr.addColorStop(1,"rgba(122,62,26,0)");
    g.fillStyle=gr;g.fillRect(x-r,y-r,r*2,r*2);
  }
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
const texElevSteel=makeCanvas(256,256,(g,w,h)=>{
  g.fillStyle="#c2c7ca";g.fillRect(0,0,w,h);
  for(let i=0;i<2400;i++){                       // the satin: vertical, always
    const v=Math.random();
    g.fillStyle=`rgba(${v<0.5?150:238},${v<0.5?156:243},${v<0.5?160:246},${0.05+Math.random()*0.16})`;
    g.fillRect(Math.random()*w,Math.random()*h,1,10+Math.random()*70);
  }
  for(let i=0;i<70;i++){                         // the longer draw marks
    const x=Math.random()*w;
    g.fillStyle=`rgba(${Math.random()<0.5?128:250},${Math.random()<0.5?134:252},${Math.random()<0.5?138:254},${0.06+Math.random()*0.1})`;
    g.fillRect(x,0,1+Math.random(),h);
  }
  for(let i=0;i<26;i++){                         // hands, forty years of them
    const x=Math.random()*w,y=Math.random()*h,r=8+Math.random()*22;
    const gr=g.createRadialGradient(x,y,1,x,y,r);
    gr.addColorStop(0,`rgba(96,100,102,${0.05+Math.random()*0.1})`);
    gr.addColorStop(1,"rgba(96,100,102,0)");
    g.fillStyle=gr;g.beginPath();g.ellipse(x,y,r*0.7,r,0,0,7);g.fill();
  }
  for(let i=0;i<110;i++){                        // micro-scratches, every angle
    const x=Math.random()*w,y=Math.random()*h,a=Math.random()*7,l=3+Math.random()*16;
    g.strokeStyle=`rgba(${Math.random()<0.5?110:252},${Math.random()<0.5?116:254},${Math.random()<0.5?120:255},${0.10+Math.random()*0.2})`;
    g.lineWidth=0.7;
    g.beginPath();g.moveTo(x,y);g.lineTo(x+Math.cos(a)*l,y+Math.sin(a)*l);g.stroke();
  }
});
texElevSteel.wrapS=texElevSteel.wrapT=THREE.RepeatWrapping;
texElevSteel.anisotropy=4;
/* the cab floor: resilient sheet, and what reads on one is the METRE-scale
   blotch of a poured/rolled sheet, not the speckle — the carpet had to
   learn the same thing twice. Tiled at 1m. */
const texElevFloor=makeCanvas(256,256,(g,w,h)=>{
  g.fillStyle="#3a3d42";g.fillRect(0,0,w,h);
  const wrap=fn=>{ for(const ox of[0,-w,w])for(const oy of[0,-h,h]) fn(ox,oy); };
  for(let i=0;i<30;i++){                         // the blotch
    const x=Math.random()*w,y=Math.random()*h,r=30+Math.random()*90;
    const lite=Math.random()<0.5;
    wrap((ox,oy)=>{
      const gr=g.createRadialGradient(x+ox,y+oy,r*0.1,x+ox,y+oy,r);
      gr.addColorStop(0,lite?`rgba(94,99,106,${0.08+Math.random()*0.09})`
                           :`rgba(22,24,28,${0.08+Math.random()*0.09})`);
      gr.addColorStop(1,"rgba(0,0,0,0)");
      g.fillStyle=gr;g.beginPath();g.arc(x+ox,y+oy,r,0,7);g.fill();
    });
  }
  for(let i=0;i<3000;i++){                       // then the chip, over five tones
    const v=Math.random();
    g.fillStyle=v<0.25?"rgba(18,20,24,0.5)":v<0.5?"rgba(120,124,130,0.4)":
                v<0.7?"rgba(78,72,60,0.35)":v<0.88?"rgba(56,60,66,0.4)":"rgba(150,152,150,0.28)";
    g.fillRect(Math.random()*w,Math.random()*h,1.6,1.6);
  }
  for(let i=0;i<44;i++){                         // scuffed by whatever was rolled in
    const x=Math.random()*w,y=Math.random()*h,a=Math.random()*7,l=10+Math.random()*50;
    g.strokeStyle=`rgba(${Math.random()<0.5?26:142},${Math.random()<0.5?28:146},${Math.random()<0.5?32:150},${0.06+Math.random()*0.14})`;
    g.lineWidth=1+Math.random()*2;
    g.beginPath();g.moveTo(x,y);
    g.bezierCurveTo(x+l*0.3,y+(Math.random()-0.5)*10,x+l*0.7,y+(Math.random()-0.5)*10,
                    x+Math.cos(a)*l,y+Math.sin(a)*l);
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
markShared(texAlmond,texFuseFace,texCeramic,texPanel,texPlate,texCard,
           texElevSteel,texElevFloor,texCOP,texCapPlate,texHallFace,texJambNum);
const glassMat=new THREE.MeshPhongMaterial({color:0xd6e4ea, transparent:true, opacity:0.40,
  specular:0xffffff, shininess:96, side:THREE.DoubleSide});
const almondMat=new THREE.MeshPhongMaterial({color:0xeadfbe, emissive:0x1a1610,
  specular:0x9a9280, shininess:34});
const capMat=new THREE.MeshPhongMaterial({color:0x2b2b2d, specular:0x4a4a4e, shininess:44});
const labelMat=new THREE.MeshPhongMaterial({map:texAlmond, specular:0x1a1814, shininess:8,
  side:THREE.DoubleSide});
const brassMat=new THREE.MeshPhongMaterial({color:0xb59a52, specular:0xe4d49a, shininess:82});
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
function makeBreaker(p,facing){
  /* A load centre, not a grey slab with a red ball on it: a recessed steel
     cabinet behind a folded flange, a door on real knuckle hinges with a
     latch, a maker's plate and the directory card nobody filled in, and a row
     of dead breakers inside flanking the one slot that matters.
     The cutscene's contract is unchanged and load-bearing: `doorPivot` is a
     Group at (−0.45,0,0.2) swung about y, `lamp` is a single mesh whose own
     material gets recoloured, `lever` is a single mesh moved in y from −0.1 to
     +0.1, and `fuse` is a Group flown into the slot with every material in it
     faded up from 0. */
  const g=new THREE.Group();
  const steel=new THREE.MeshPhongMaterial({map:texPanel, specular:0x2c3336, shininess:26});
  const steelDark=new THREE.MeshPhongMaterial({color:0x333c40, specular:0x1c2124, shininess:18});
  const bright=new THREE.MeshPhongMaterial({color:0x9aa2a8, specular:0x5c6468, shininess:52});
  const add=(geo,mat,x,y,z)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);g.add(m);return m;};
  /* the cabinet, and the flange folded out around its mouth */
  add(new THREE.BoxGeometry(0.9,1.3,0.1),steel,0,0,0);
  for(const[sw,sh,sx,sy]of[[0.98,0.05,0,0.645],[0.98,0.05,0,-0.645],
                           [0.05,1.3,0.465,0],[0.05,1.3,-0.465,0]])
    add(new THREE.BoxGeometry(sw,sh,0.14),steel,sx,sy,0.12);
  /* interior — only visible while the door hangs open */
  add(new THREE.BoxGeometry(0.78,1.18,0.02),steelDark,0,0,0.05);
  add(new THREE.BoxGeometry(0.09,1.0,0.03),bright,0,0.02,0.065);      // the bus bar
  /* the dead breakers either side of the slot: this panel fed a whole floor */
  for(const sx of[-0.235,0.235])for(let i=0;i<4;i++){
    add(new THREE.BoxGeometry(0.2,0.1,0.05),steelDark,sx,0.44-i*0.13,0.08);
    add(new THREE.BoxGeometry(0.05,0.05,0.04),new THREE.MeshPhongMaterial(
      {color:i%3?0x1d2124:0x6b2a22, specular:0x3a4044, shininess:30}),
      sx+(i%2?0.05:-0.05),0.44-i*0.13,0.105);
  }
  add(new THREE.BoxGeometry(0.3,0.44,0.06),
    new THREE.MeshPhongMaterial({color:0x14171a, specular:0x25292c, shininess:20}),0,0.08,0.08);
  for(const sy of[-0.13,0.13])             // contact clips waiting for the fuse
    add(new THREE.BoxGeometry(0.16,0.04,0.05),bright,0,0.08+sy,0.11);
  /* the cutscene fuse: hidden until the animation conjures it in */
  const fuse=makeFuse(); fuse.scale.setScalar(0.9);
  fuse.visible=false;
  fuse.traverse(o=>{ if(o.isMesh){ o.material=o.material.clone();
    o.material.transparent=true; o.material.opacity=0; }});
  fuse.position.set(0,-0.25,0.55);
  g.add(fuse); g.userData.fuse=fuse;
  /* hinged door (left edge) carrying the status lamp & lever; pivot sits
     proud of the flange so the closed panel clears the seated fuse */
  const pivot=new THREE.Group(); pivot.position.set(-0.45,0,0.2); g.add(pivot);
  g.userData.doorPivot=pivot;
  const door=new THREE.Group(); door.position.x=0.45; pivot.add(door);
  const dAdd=(geo,mat,x,y,z)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);door.add(m);return m;};
  dAdd(new THREE.BoxGeometry(0.88,1.28,0.04),steel,0,0,0);
  for(const sy of[0.5,-0.5])               // knuckle hinges down the hung edge
    dAdd(new THREE.CylinderGeometry(0.024,0.024,0.14,10),bright,-0.44,sy,-0.02);
  /* the maker's plate and the directory card, both PRINTED — a bare bright
     bar on a door catching a troffer is a blown-out white rectangle, which is
     all either of them was. The plate keeps its map on the front face only
     (the box's other five wear the same canvas, but nothing ever sees them). */
  const plateMat=new THREE.MeshPhongMaterial({map:texPlate, specular:0x2e3336, shininess:24});
  const cardMat=new THREE.MeshPhongMaterial({map:texCard, specular:0x1c1c18, shininess:5});
  dAdd(new THREE.BoxGeometry(0.36,0.1,0.006),plateMat,-0.20,0.54,0.023);
  dAdd(new THREE.BoxGeometry(0.26,0.30,0.006),cardMat,-0.26,0.02,0.023);
  dAdd(new THREE.BoxGeometry(0.29,0.02,0.014),bright,-0.26,-0.14,0.026);  // its holder lip
  /* the latch: an escutcheon with a quarter-turn handle standing off it */
  dAdd(new THREE.BoxGeometry(0.11,0.16,0.016),bright,0.36,-0.36,0.026);
  dAdd(new THREE.BoxGeometry(0.03,0.12,0.05),steelDark,0.36,-0.36,0.052);
  /* the status lamp: a bezel with the lens seated in it. `lamp` stays the
     LENS — the cutscene sets its material colour on power-up. */
  dAdd(new THREE.CylinderGeometry(0.055,0.055,0.03,14),bright,0.28,0.45,0.03)
    .rotation.x=Math.PI/2;
  const lamp=new THREE.Mesh(new THREE.SphereGeometry(0.042,10,8),
    new THREE.MeshBasicMaterial({color:0xff3020}));
  lamp.position.set(0.28,0.45,0.05); lamp.scale.z=0.7; door.add(lamp);
  g.userData.lamp=lamp;
  /* the main throw: a slotted plate with the handle riding it, kept clear of
     the directory card on the other side of the door. `lever` is the HANDLE
     and nothing else — the cutscene slides it 0.2m up the plate. */
  dAdd(new THREE.BoxGeometry(0.14,0.5,0.014),steelDark,0.16,-0.1,0.024);
  const lever=new THREE.Mesh(new THREE.BoxGeometry(0.09,0.17,0.07),
    new THREE.MeshPhongMaterial({color:0x1b1f22, specular:0x40464a, shininess:36}));
  lever.position.set(0.16,-0.1,0.06); door.add(lever); g.userData.lever=lever;
  g.position.copy(p); g.rotation.y=facing;
  g.userData.animated=true;                 // the cutscene swings its door / conjures the fuse
  return g;
}
/* ---- the elevator's material set, module-level and shared ----
   One brushed map under four tints does every metal in it; the trim is
   painted rather than brushed, so it takes a flat dark colour. Merging is
   done BY these materials, which is what keeps a cab this detailed to
   roughly the draw count of the six-box one it replaces. */
const elevBrightMat=new THREE.MeshPhongMaterial({map:texElevSteel, color:0xbcc2c6,
  specular:0x9aa2a8, shininess:70});                 // doors, jambs, sills, bezels
const elevLineMat  =new THREE.MeshPhongMaterial({map:texElevSteel, color:0x8b9198,
  specular:0x5a6066, shininess:40});                 // the cab's lining
const elevPanelMat =new THREE.MeshPhongMaterial({map:texElevSteel, color:0x767c83,
  specular:0x4c5258, shininess:34});                 // its raised panels
/* the dark panel that stands in for a mirror. Held OFF both extremes on
   purpose: at a near-black base under a shininess of 110 it flipped between
   a black rectangle — which in the middle of a back wall reads as a doorway
   — and a blown-out white blob, depending only on where the car light was. */
const elevSmokeMat =new THREE.MeshPhongMaterial({map:texElevSteel, color:0x53595f,
  specular:0x6e767c, shininess:64});
const elevDarkMat  =new THREE.MeshPhongMaterial({color:0x33373b, specular:0x22262a, shininess:26});
const elevRubberMat=new THREE.MeshPhongMaterial({color:0x141517, specular:0x1e2022, shininess:10});
const elevAlarmMat =new THREE.MeshPhongMaterial({color:0x6e1a12, specular:0xd05a40, shininess:60});
const elevVoidMat  =new THREE.MeshBasicMaterial({color:0x050505});   // the hole above the hatch
const elevFloorMat =new THREE.MeshPhongMaterial({map:texElevFloor, specular:0x1a1c20, shininess:16});
const copFaceMat   =new THREE.MeshPhongMaterial({map:texCOP, transparent:true,
  specular:0x000000, shininess:1});
const capPlateMat  =new THREE.MeshPhongMaterial({map:texCapPlate, transparent:true,
  specular:0x000000, shininess:1});
const hallFaceMat  =new THREE.MeshPhongMaterial({map:texHallFace, transparent:true,
  specular:0x000000, shininess:1});
const jambNumMat   =new THREE.MeshPhongMaterial({map:texJambNum, transparent:true,
  specular:0x000000, shininess:1});
markShared(elevBrightMat,elevLineMat,elevPanelMat,elevSmokeMat,elevDarkMat,elevRubberMat,
           elevAlarmMat,elevVoidMat,elevFloorMat,copFaceMat,capPlateMat,hallFaceMat,jambNumMat);
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
  const wallGeo=(w,h,d)=>{
    const geo=new THREE.BoxGeometry(w,h,d);
    if(opts.uvTile) scaleBoxUV(geo,w,h,d,opts.uvTile);
    return geo;
  };
  const flankW=(CELL-OPEN_W)/2;
  put(wallM,wallGeo(flankW,WALL_H,CELL),-(HW+flankW/2),WALL_H/2,-CELL/2);
  put(wallM,wallGeo(flankW,WALL_H,CELL), (HW+flankW/2),WALL_H/2,-CELL/2);
  put(wallM,wallGeo(OPEN_W,WALL_H-OPEN_H,CELL),0,(WALL_H+OPEN_H)/2,-CELL/2);
  put(wallM,wallGeo(OPEN_W,OPEN_H,CELL-DEPTH),0,OPEN_H/2,-(DEPTH+(CELL-DEPTH)/2));
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
    for(const pz of[-1.94,-0.72]) sbox(elevPanelMat, 0.016,PH,1.06, s*(IN-0.038),PCY,pz);
  /* three boards across the back wall — the middle one stands in for the
     mirror. Their width is solved from the lining rather than written down,
     so the 65mm margin at the corners and the 125mm gap between boards hold
     at any cab width instead of leaving a bare strip beside the kick posts. */
  const BPW=(2*(IN-0.065)-0.25)/3, BPX=BPW+0.125;
  for(const px of[-BPX,0,BPX])
    sbox(px===0? elevSmokeMat:elevPanelMat, BPW,PH,0.016, px,PCY,-DEPTH+0.068);
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
  sbox(elevBrightMat,0.15,OPEN_H+0.20,0.13, -(HW+0.075),(OPEN_H+0.20)/2,0.065);
  sbox(elevBrightMat,0.15,OPEN_H+0.20,0.13,  (HW+0.075),(OPEN_H+0.20)/2,0.065);
  sbox(elevBrightMat,OPEN_W+0.45,0.17,0.13, 0,OPEN_H+0.085,0.065);
  /* the floor designation, cut into a plate on the jamb — the only place
     in the building that names the floor you are standing on */
  sbox(elevBrightMat,0.12,0.19,0.012, -(HW+0.075),1.95,0.136);
  /* the hall station, and the hall lantern over the head */
  sbox(elevBrightMat,HALL.w+0.03,HALL.h+0.05,0.014, HALL.x+0.038,HALL.y,0.014);
  for(const[sx,sy]of[[-1,1],[1,1],[-1,-1],[1,-1]])          // its four screws
    rod(elevBrightMat,0.007,0.007, HALL.x+0.038+sx*0.088,HALL.y+sy*0.15,0.024, Math.PI/2,0,0);
  for(const cy of[HALL.upC,HALL.dnC])                       // and the two bezels
    rod(elevBrightMat,0.040,0.008, HALL.x,hallY(cy),0.030, Math.PI/2,0,0);
  pbox(elevDarkMat,0.42,0.21,0.09, 0,OPEN_H+0.42,0.085);
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
    const tri=new THREE.Mesh(new THREE.CircleGeometry(0.055,3),lm);
    tri.position.set(rz? 0.10:-0.10,ly,0.132); tri.rotation.z=rz+Math.PI/2;
    g.add(tri); g.userData.hallLamps.push(lm);
  }
  /* ---------- the EXIT sign: a real box, not a decal ---------- */
  const signC=makeCanvas(256,96,(gx,w,h)=>{
    gx.fillStyle="#0e120e";gx.fillRect(0,0,w,h);
    gx.fillStyle="#39d24a";gx.font="bold 58px Courier New";
    gx.textAlign="center";gx.textBaseline="middle";gx.fillText("EXIT",w/2,h/2+2);
    for(let i=0;i<260;i++){                  // the grime of a diffuser nobody cleans
      gx.fillStyle=`rgba(${18+Math.random()*30|0},${22+Math.random()*30|0},${18+Math.random()*26|0},${0.1+Math.random()*0.3})`;
      gx.fillRect(Math.random()*w,Math.random()*h,1+Math.random()*3,1+Math.random()*3);
    }
    const dead=gx.createLinearGradient(0,0,0,h);      // and the tube behind it, sagging
    dead.addColorStop(0,"rgba(0,0,0,0.35)");dead.addColorStop(0.5,"rgba(0,0,0,0)");
    dead.addColorStop(1,"rgba(0,0,0,0.45)");
    gx.fillStyle=dead;gx.fillRect(0,0,w,h);
  });
  {
    const sh=[];
    const hb=new THREE.Mesh(new THREE.BoxGeometry(0.92,0.38,0.11));
    hb.position.set(0,OPEN_H+0.82,0.075); sh.push(hb);
    for(const s of[-1,1]){                    // the brackets it hangs off
      const br=new THREE.Mesh(new THREE.BoxGeometry(0.05,0.16,0.10));
      br.position.set(s*0.30,OPEN_H+1.03,0.045); sh.push(br);
    }
    g.add(mergeStatic(sh,elevDarkMat));
    for(const m of sh) m.geometry.dispose();
  }
  const sign=new THREE.Mesh(new THREE.PlaneGeometry(0.82,0.29),
    new THREE.MeshBasicMaterial({map:signC}));
  sign.position.set(0,OPEN_H+0.82,0.131); g.add(sign); g.userData.sign=sign;
  sign.material.color.set(0x333333);
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
    interactables.push({kind:"breaker",mesh:br,label:"INSERT FUSE & RESTORE POWER",taken:false});
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
  mergeWallMeshes();
  freezeStaticScene();
}

/* ---------------- prop idle ---------------- */
export function updateProps(t){
  for(const it of interactables){
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
