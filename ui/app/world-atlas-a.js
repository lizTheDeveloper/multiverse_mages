// Civilization World Atlas — illustrated renderer, variant A.
// Copyright (C) 2026 Ann Kelner. AGPL-3.0-or-later.
//
// This program is free software: you can redistribute it and/or modify it
// under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or (at your
// option) any later version.

import {
  BRIDGE,
  DISTANT_HOUSE_CANDIDATES,
  LANDMARK_SOCKETS,
  REGION_ANCHORS,
  RIVER_LEFT,
  RIVER_RIGHT,
  ROAD_SEGMENTS,
  footprintIntersectsRiver,
  isValidSocket,
} from './world-atlas-geometry.js';
import { WORLD_ASSETS, loadWorldAssets } from './world-assets.js';

const TAU = Math.PI * 2;
const BW = 704;
const BH = 862;

const WORLD_ASSET_IMAGES = loadWorldAssets();

const ARTS = {
  gateway:             { glyph: 'gate', color: '#a68ee0', label: 'GATEWAYS' },
  manifestation:       { glyph: 'spark', color: '#e08b69', label: 'MANIFEST' },
  'population-field':  { glyph: 'people', color: '#dc8290', label: 'VITAL' },
  'knowledge-network': { glyph: 'book', color: '#63c9bd', label: 'KNOWLEDGE' },
  'civic-industry':    { glyph: 'hammer', color: '#d5a468', label: 'CIVIC ARTS' },
  'devotion-field':    { glyph: 'halo', color: '#e4c168', label: 'DEVOTION' },
  'mobility-link':     { glyph: 'road', color: '#78aee0', label: 'PASSAGE' },
  'concealment-veil':  { glyph: 'veil', color: '#98a6b9', label: 'VEILS' },
  'protective-ward':   { glyph: 'shield', color: '#7bb7a9', label: 'WARDS' },
  transformation:      { glyph: 'turn', color: '#d28e79', label: 'CHANGE' },
  perception:          { glyph: 'eye', color: '#75bad0', label: 'PERCEPTION' },
  destruction:         { glyph: 'rift', color: '#d96c67', label: 'DISSOLUTION' },
  control:             { glyph: 'knot', color: '#9894df', label: 'GOVERNANCE' },
  restoration:         { glyph: 'leaf', color: '#83bf79', label: 'RESTORATION' },
  default:              { glyph: 'rune', color: '#b29bd2', label: 'OTHER ARTS' },
};

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function clamp(value, low, high) { return Math.max(low, Math.min(high, value)); }
function hash(value) {
  let h = 2166136261;
  for (const c of String(value ?? '')) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function noise(value) {
  let x = hash(value); x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  return (x >>> 0) / 4294967296;
}
function path(ctx, points, close = false) {
  if (!points.length) return;
  ctx.beginPath(); ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i][0], points[i][1]);
  if (close) ctx.closePath();
}
function text(ctx, value, x, y, options = {}) {
  ctx.save();
  ctx.font = options.font || '600 11px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillStyle = options.color || '#efe5c8';
  ctx.textAlign = options.align || 'left'; ctx.textBaseline = options.baseline || 'alphabetic';
  if (options.shadow) { ctx.shadowColor = options.shadow; ctx.shadowBlur = options.blur || 3; }
  ctx.fillText(String(value), x, y, options.maxWidth);
  ctx.restore();
}

function glyph(ctx, kind, x, y, size, color) {
  const s = size;
  ctx.save(); ctx.translate(x, y); ctx.strokeStyle = color; ctx.fillStyle = color;
  ctx.lineWidth = Math.max(1.2, s * .105); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath();
  switch (kind) {
    case 'gate': ctx.arc(0,s*.1,s*.52,Math.PI,0);ctx.lineTo(s*.52,s*.6);ctx.moveTo(-s*.52,s*.6);ctx.lineTo(-s*.52,s*.1);ctx.moveTo(-s*.25,s*.58);ctx.lineTo(-s*.25,s*.06);ctx.arc(0,s*.06,s*.25,Math.PI,0);ctx.lineTo(s*.25,s*.58); break;
    case 'spark': for(let i=0;i<8;i+=1){const a=i*TAU/8;ctx.moveTo(Math.cos(a)*s*.22,Math.sin(a)*s*.22);ctx.lineTo(Math.cos(a)*s*.7,Math.sin(a)*s*.7);}ctx.stroke();ctx.beginPath();ctx.arc(0,0,s*.14,0,TAU);ctx.fill();ctx.restore();return;
    case 'people': ctx.arc(-s*.24,-s*.22,s*.17,0,TAU);ctx.moveTo(s*.41,-s*.22);ctx.arc(s*.24,-s*.22,s*.17,0,TAU);ctx.moveTo(-s*.55,s*.52);ctx.quadraticCurveTo(-s*.25,s*.02,0,s*.52);ctx.quadraticCurveTo(s*.25,s*.02,s*.55,s*.52); break;
    case 'book': ctx.moveTo(0,-s*.52);ctx.quadraticCurveTo(-s*.25,-s*.68,-s*.58,-s*.44);ctx.lineTo(-s*.58,s*.45);ctx.quadraticCurveTo(-s*.25,s*.25,0,s*.48);ctx.quadraticCurveTo(s*.25,s*.25,s*.58,s*.45);ctx.lineTo(s*.58,-s*.44);ctx.quadraticCurveTo(s*.25,-s*.68,0,-s*.52);ctx.lineTo(0,s*.48); break;
    case 'hammer': ctx.moveTo(-s*.4,-s*.48);ctx.lineTo(s*.12,-s*.48);ctx.lineTo(s*.3,-s*.25);ctx.lineTo(-s*.2,-s*.25);ctx.closePath();ctx.moveTo(-s*.02,-s*.25);ctx.lineTo(s*.38,s*.58); break;
    case 'halo': ctx.arc(0,0,s*.58,0,TAU);ctx.moveTo(-s*.28,s*.08);ctx.quadraticCurveTo(0,-s*.18,s*.28,s*.08);ctx.moveTo(0,-s*.18);ctx.lineTo(0,s*.34); break;
    case 'road': ctx.moveTo(-s*.62,s*.42);ctx.bezierCurveTo(-s*.2,-s*.6,s*.1,s*.6,s*.62,-s*.42);ctx.moveTo(-s*.5,s*.52);ctx.bezierCurveTo(-s*.08,-s*.5,s*.2,s*.7,s*.72,-s*.32); break;
    case 'veil': ctx.arc(0,-s*.12,s*.52,Math.PI*1.08,Math.PI*1.92);ctx.moveTo(-s*.5,-s*.02);ctx.quadraticCurveTo(-s*.3,s*.62,0,s*.38);ctx.quadraticCurveTo(s*.3,s*.62,s*.5,-s*.02); break;
    case 'shield': ctx.moveTo(0,-s*.62);ctx.lineTo(s*.52,-s*.38);ctx.lineTo(s*.42,s*.25);ctx.quadraticCurveTo(0,s*.7,-s*.42,s*.25);ctx.lineTo(-s*.52,-s*.38);ctx.closePath(); break;
    case 'turn': ctx.arc(0,0,s*.48,-Math.PI*.15,Math.PI*1.25);ctx.moveTo(-s*.5,-s*.15);ctx.lineTo(-s*.62,s*.25);ctx.lineTo(-s*.22,s*.18); break;
    case 'eye': ctx.moveTo(-s*.65,0);ctx.quadraticCurveTo(0,-s*.55,s*.65,0);ctx.quadraticCurveTo(0,s*.55,-s*.65,0);ctx.moveTo(s*.2,0);ctx.arc(0,0,s*.2,0,TAU); break;
    case 'rift': ctx.moveTo(-s*.25,-s*.68);ctx.lineTo(s*.08,-s*.18);ctx.lineTo(-s*.08,s*.08);ctx.lineTo(s*.28,s*.68); break;
    case 'knot': ctx.arc(-s*.22,0,s*.34,0,TAU);ctx.moveTo(s*.56,0);ctx.arc(s*.22,0,s*.34,0,TAU); break;
    case 'leaf': ctx.moveTo(-s*.5,s*.45);ctx.quadraticCurveTo(-s*.5,-s*.55,s*.55,-s*.5);ctx.quadraticCurveTo(s*.5,s*.5,-s*.5,s*.45);ctx.moveTo(-s*.42,s*.38);ctx.lineTo(s*.35,-s*.32); break;
    default: ctx.moveTo(0,-s*.65);ctx.lineTo(s*.55,s*.35);ctx.lineTo(-s*.55,s*.35);ctx.closePath();ctx.moveTo(-s*.42,-s*.22);ctx.lineTo(s*.42,-s*.22);
  }
  ctx.stroke(); ctx.restore();
}

function colors(dark) {
  return dark ? {
    sky0:'#091724', sky1:'#173342', horizon:'#385450', ground0:'#253e33', ground1:'#172a25',
    far:'#50645a', hill:'#354b40', ridge:'#677269', cliff:'#6a6760', forest:'#173a2e', tree:'#2e5b43',
    fieldA:'#716b3c', fieldB:'#746043', fieldC:'#4d673e', river:'#347f91', water:'#54a9b7', road:'#b18f58',
    wall:'#baa66f', stone:'#918a76', roof:'#9b5845', roof2:'#b17b4e', ink:'#f1e5c4', muted:'#c4b899', glow:'#ead274'
  } : {
    sky0:'#a9c9d1', sky1:'#d7d6b4', horizon:'#ddd1a5', ground0:'#99a86f', ground1:'#6f8760',
    far:'#879a79', hill:'#71875f', ridge:'#73766b', cliff:'#857e6d', forest:'#315d45', tree:'#4d7652',
    fieldA:'#c5ae65', fieldB:'#b68c59', fieldC:'#829a59', river:'#438fa3', water:'#8bc1c7', road:'#95703f',
    wall:'#e3d3a2', stone:'#aaa18c', roof:'#8f4e3d', roof2:'#a76b42', ink:'#2f342b', muted:'#515846', glow:'#8c712f'
  };
}

function drawSky(ctx, p, dark) {
  const g = ctx.createLinearGradient(0,0,0,226);
  g.addColorStop(0,p.sky0); g.addColorStop(.72,p.sky1); g.addColorStop(1,p.horizon);
  ctx.fillStyle=g;ctx.fillRect(0,0,BW,226);
  // Horizon haze band softens the seam between sky and far country.
  const hz=ctx.createLinearGradient(0,168,0,232);hz.addColorStop(0,'rgba(0,0,0,0)');hz.addColorStop(.6,p.horizon+'66');hz.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=hz;ctx.fillRect(0,168,BW,64);
  ctx.save(); ctx.globalAlpha=dark?.045:.13; ctx.fillStyle=dark?'#7fa3b8':'#efe6ca';
  for(let i=0;i<9;i+=1){const x=34+i*89+noise(`cloud${i}`)*28,y=38+noise(`cy${i}`)*112;ctx.beginPath();ctx.ellipse(x,y,60+noise(`cw${i}`)*50,8+noise(`ch${i}`)*11,-.08,0,TAU);ctx.fill();}
  ctx.restore();
}

function drawAurora(ctx, model, p, dark) {
  const groups = compileMagic(model), shown = groups.slice(0, 7);
  ctx.save();
  const aurora=ctx.createLinearGradient(0,12,BW,154);aurora.addColorStop(0,'rgba(79,197,179,0)');aurora.addColorStop(.35,dark?'rgba(85,200,182,.16)':'rgba(66,152,145,.11)');aurora.addColorStop(.66,dark?'rgba(170,117,219,.20)':'rgba(131,90,174,.12)');aurora.addColorStop(1,'rgba(170,117,219,0)');
  ctx.strokeStyle=aurora;ctx.lineWidth=24;ctx.beginPath();ctx.moveTo(-30,71);ctx.bezierCurveTo(164,6,326,131,734,38);ctx.stroke();
  text(ctx,groups.length?'THE KNOWN ARTS':'THE QUIET FIRMAMENT',22,28,{font:'700 12px Georgia, serif',color:dark?'rgba(235,224,205,.78)':'rgba(48,55,52,.75)'});
  if(groups.length>shown.length)text(ctx,`+${groups.length-shown.length} ART GROUPS`,BW-22,28,{align:'right',font:'700 9px ui-monospace, monospace',color:p.muted});
  shown.forEach((group,i)=>{
    const meta=ARTS[group.archetype]||ARTS.default;
    const x=54+i*(596/Math.max(1,shown.length-1)), y=72+Math.sin(i*1.63)*20;
    if(i){const px=54+(i-1)*(596/Math.max(1,shown.length-1)),py=72+Math.sin((i-1)*1.63)*20;ctx.strokeStyle=dark?'rgba(226,219,197,.18)':'rgba(53,65,60,.18)';ctx.lineWidth=1;ctx.setLineDash([2,5]);path(ctx,[[px,py],[x,y]]);ctx.stroke();ctx.setLineDash([]);}
    ctx.shadowColor=meta.color;ctx.shadowBlur=10;ctx.fillStyle=dark?'rgba(10,24,34,.76)':'rgba(235,226,190,.72)';ctx.strokeStyle=meta.color;ctx.lineWidth=1.7;ctx.beginPath();ctx.arc(x,y,11,0,TAU);ctx.fill();ctx.stroke();ctx.shadowBlur=0;glyph(ctx,meta.glyph,x,y,5.5,meta.color);
    text(ctx,`${meta.label} ×${group.count}`,x,y+24,{align:'center',font:'700 8px ui-monospace, monospace',color:dark?'#e8dec7':'#38413a',maxWidth:82});
    if(group.goals){ctx.fillStyle=p.glow;ctx.beginPath();ctx.arc(x+9,y-9,2.5,0,TAU);ctx.fill();}
  });
  ctx.restore();
}

function drawFarCountry(ctx, p, dark) {
  // Distant mountain chain gives the view continental depth rather than a flat diagram plane.
  const back=[[0,232],[0,203],[55,165],[96,198],[151,151],[207,201],[274,157],[322,195],[382,143],[435,194],[501,155],[550,195],[622,147],[704,190],[704,247]];
  path(ctx,back,true);ctx.fillStyle=p.far;ctx.fill();
  ctx.fillStyle=dark?'rgba(201,207,191,.16)':'rgba(239,231,197,.46)';
  [[151,151,126,195,180,188],[382,143,357,184,407,177],[622,147,595,185,642,176]].forEach(q=>{path(ctx,[[q[0],q[1]],[q[2],q[3]],[q[4],q[5]]],true);ctx.fill();});
  const near=[[0,252],[0,222],[86,193],[134,225],[232,186],[307,230],[394,192],[469,229],[558,183],[630,219],[704,190],[704,279]];
  path(ctx,near,true);ctx.fillStyle=p.hill;ctx.fill();
  ctx.save();ctx.globalAlpha=dark?.22:.3;ctx.strokeStyle=p.ridge;ctx.lineWidth=2;
  for(let i=0;i<18;i+=1){const x=i*43;path(ctx,[[x,230+noise(`r${i}`)*25],[x+25,216+noise(`rr${i}`)*24],[x+47,241+noise(`rrr${i}`)*12]]);ctx.stroke();}
  ctx.restore();
}

function drawGround(ctx, p) {
  const g=ctx.createLinearGradient(0,214,0,BH);g.addColorStop(0,p.ground0);g.addColorStop(1,p.ground1);ctx.fillStyle=g;ctx.fillRect(0,214,BW,BH-214);
  ctx.save();ctx.globalAlpha=.09;ctx.strokeStyle=p.ink;ctx.lineWidth=1;
  for(let y=278;y<850;y+=42){ctx.beginPath();ctx.moveTo(0,y);for(let x=0;x<=BW;x+=44)ctx.lineTo(x,y+(noise(`${x}-${y}`)-.5)*10);ctx.stroke();}
  ctx.restore();
}

function drawHighlands(ctx, p, dark) {
  const mass=[[473,206],[521,177],[563,211],[601,171],[648,218],[704,198],[704,476],[658,458],[618,422],[568,436],[528,383],[487,356]];
  path(ctx,mass,true);ctx.fillStyle=dark?'#323d39':'#8c8d70';ctx.fill();
  ctx.strokeStyle=dark?'#77786e':'#6f6c59';ctx.lineWidth=2;
  for(let i=0;i<11;i+=1){const x=500+i*21,y=239+noise(`peak${i}`)*150;path(ctx,[[x-21,y+31],[x,y],[x+23,y+34]]);ctx.stroke();}
  // Quarry terraces, visibly carved into the highland rather than contained by a card.
  // The generated quarry sprite replaces them once its matte passed acceptance.
  if (!WORLD_ASSETS.quarry.enabled) {
    ctx.save();ctx.strokeStyle=dark?'#aaa08c':'#665f51';ctx.lineWidth=3;
    for(let i=0;i<4;i+=1){ctx.beginPath();ctx.ellipse(588,329+i*13,71-i*10,29-i*4,0,Math.PI*.08,Math.PI*.94);ctx.stroke();}
    ctx.fillStyle=p.stone;for(let i=0;i<18;i+=1){const x=535+noise(`qx${i}`)*106,y=328+noise(`qy${i}`)*66;ctx.fillRect(x,y,5+noise(`qw${i}`)*9,3+noise(`qh${i}`)*5);}
    ctx.restore();
  }
}

function drawForests(ctx, p, dark) {
  ctx.save();
  const groves=[[65,297,36],[126,345,40],[51,430,31],[666,474,26],[94,527,30],[649,566,32],[32,620,26]];
  for(const [gx,gy,count] of groves){
    for(let i=0;i<count;i+=1){const x=gx+(noise(`tx${gx}-${i}`)-.5)*116,y=gy+(noise(`ty${gy}-${i}`)-.5)*100;const s=5+noise(`ts${gx}-${i}`)*8;ctx.fillStyle=dark?'rgba(7,28,21,.25)':'rgba(42,70,38,.16)';ctx.beginPath();ctx.ellipse(x+3,y+5,s*.85,s*.42,.4,0,TAU);ctx.fill();ctx.fillStyle=i%3?p.tree:p.forest;path(ctx,[[x,y-s],[x-s*.7,y+s*.55],[x+s*.7,y+s*.55]],true);ctx.fill();ctx.fillStyle=dark?'#191f1a':'#5f513a';ctx.fillRect(x-.7,y+s*.45,1.4,s*.55);}
  }
  ctx.restore();
}

function fieldPatch(ctx, x, y, w, h, angle, fill, lineColor) {
  ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.fillStyle=fill;ctx.strokeStyle=lineColor;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(-w/2,-h/2);ctx.lineTo(w/2,-h*.42);ctx.lineTo(w*.44,h/2);ctx.lineTo(-w*.52,h*.38);ctx.closePath();ctx.fill();ctx.globalAlpha=.34;ctx.clip();
  for(let k=-w;k<w;k+=7){ctx.beginPath();ctx.moveTo(k,-h);ctx.lineTo(k+h*.45,h);ctx.stroke();}ctx.restore();
}
function drawFarmland(ctx, p, dark) {
  const patches=[[164,608,86,53,-.10,p.fieldA],[250,622,72,65,.08,p.fieldC],[132,681,92,54,.05,p.fieldB],[232,704,92,72,-.08,p.fieldA],[337,663,77,53,.13,p.fieldB],[318,744,93,58,-.04,p.fieldC],[423,713,82,64,.08,p.fieldA],[185,773,105,61,.06,p.fieldB],[454,795,112,52,-.06,p.fieldC],[69,742,72,60,-.03,p.fieldA]];
  for(let i=0;i<patches.length;i+=1){const q=patches[i];fieldPatch(ctx,q[0],q[1],q[2],q[3],q[4],q[5],dark?'#d3c47a':'#766132',`f${i}`);}
}

// District names are the top layer: no tree, road, sprite, or seal may sit on
// a district title. One pass, one type system.
function drawDistrictLabels(ctx, p, dark) {
  const title={align:'center',font:'700 11px ui-monospace, monospace',color:p.ink,shadow:dark?'#172520':'#d8cda8'};
  const sub={align:'center',font:'600 9px ui-monospace, monospace',color:p.muted,shadow:dark?'#172520':'#d8cda8'};
  text(ctx,'THE SYLVAN WORKS',76,489,{...title,align:'left'});
  text(ctx,'TIMBER · HERBS',76,503,{...sub,align:'left'});
  text(ctx,'QUARRY HIGHLANDS',612,470,title);
  text(ctx,'STONE · ORE',612,484,sub);
  text(ctx,'CULTIVATED COMMONS',214,827,title);
  text(ctx,'FIELDS · ORCHARDS · WATERMEADOWS',214,841,{...sub,font:'600 8px ui-monospace, monospace'});
}

function drawRiver(ctx, p, dark) {
  const river=[...RIVER_LEFT,[425,862],...RIVER_RIGHT.slice(0,-1).reverse()];path(ctx,river,true);
  const g=ctx.createLinearGradient(302,0,476,0);g.addColorStop(0,dark?'#245969':'#397f91');g.addColorStop(.5,p.water);g.addColorStop(1,p.river);ctx.fillStyle=g;ctx.fill();
  // Bank shading gives the water depth instead of a flat ribbon.
  ctx.save();ctx.clip();
  ctx.strokeStyle=dark?'rgba(6,26,32,.55)':'rgba(24,64,74,.38)';ctx.lineWidth=7;path(ctx,river,true);ctx.stroke();
  ctx.strokeStyle=dark?'rgba(120,205,205,.16)':'rgba(255,255,240,.30)';ctx.lineWidth=2.5;
  ctx.beginPath();ctx.moveTo(398,214);for(let y=214;y<862;y+=26)ctx.lineTo(398+Math.sin(y*.021)*26,y);ctx.stroke();
  ctx.restore();
  ctx.save();ctx.strokeStyle=dark?'rgba(164,219,218,.30)':'rgba(233,235,205,.52)';ctx.lineWidth=1.4;
  for(let i=0;i<24;i+=1){const y=250+i*25,x=372+Math.sin(i*.8)*34;ctx.beginPath();ctx.moveTo(x-14,y);ctx.quadraticCurveTo(x,y-4,x+17,y);ctx.stroke();}
  ctx.restore();
  // Three islands make the river a place, not a route line. Each gets a bank
  // ring, ground fill, and a couple of trees so it never reads as a void.
  [[394,353,22,11],[373,533,28,12],[381,725,31,14]].forEach((q,i)=>{
    ctx.fillStyle=dark?'rgba(140,220,215,.35)':'rgba(255,255,240,.5)';ctx.beginPath();ctx.ellipse(q[0],q[1],q[2]+3,q[3]+3,0,0,TAU);ctx.fill();
    ctx.fillStyle=i===1?(dark?'#5d7a44':p.fieldC):(dark?'#4f7350':p.ground0);ctx.beginPath();ctx.ellipse(q[0],q[1],q[2],q[3],0,0,TAU);ctx.fill();
    ctx.strokeStyle=dark?'#4d7652':'#4d7652';ctx.lineWidth=1;
    for(let k=0;k<3;k+=1){const tx=q[0]-q[2]/2+4+k*(q[2]-8)/2,ty=q[1]-2;path(ctx,[[tx,ty-8],[tx-4.4,ty+2.5],[tx+4.4,ty+2.5]],true);ctx.fillStyle=i%2?p.tree:p.forest;ctx.fill();}
  });
  text(ctx,'THE BROADWATER',375,590,{align:'center',font:'italic 600 10px Georgia, serif',color:dark?'rgba(204,229,220,.7)':'rgba(31,80,87,.74)'});
}

function road(ctx, points, p, dark, width=3.5) {
  ctx.save();ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle=dark?'rgba(27,25,20,.42)':'rgba(62,48,29,.24)';ctx.lineWidth=width+2;path(ctx,points);ctx.stroke();ctx.strokeStyle=p.road;ctx.lineWidth=width;path(ctx,points);ctx.stroke();ctx.strokeStyle=dark?'rgba(234,210,160,.20)':'rgba(255,236,181,.31)';ctx.lineWidth=1;ctx.setLineDash([4,9]);path(ctx,points);ctx.stroke();ctx.restore();
}
// Roads stop at the banks; the only water crossing is the declared bridge
// corridor (BRIDGE from world-atlas-geometry.js), so no route floats
// longitudinally through the Broadwater.
function drawRoads(ctx, p, dark) {
  for (const segment of ROAD_SEGMENTS) road(ctx,segment.points,p,dark,segment.width);
  ctx.save();ctx.translate(BRIDGE.x,BRIDGE.y);ctx.rotate(BRIDGE.angle);
  ctx.fillStyle=p.wall;ctx.strokeStyle=dark?'#4c4434':'#756342';ctx.lineWidth=1;
  ctx.fillRect(-BRIDGE.width/2,-BRIDGE.height/2,BRIDGE.width,BRIDGE.height);
  ctx.strokeRect(-BRIDGE.width/2,-BRIDGE.height/2,BRIDGE.width,BRIDGE.height);
  for(let x=-BRIDGE.width/2+10;x<BRIDGE.width/2;x+=12){ctx.beginPath();ctx.moveTo(x,-BRIDGE.height/2);ctx.lineTo(x,BRIDGE.height/2);ctx.stroke();}
  ctx.restore();
}

function house(ctx,x,y,s,p,roof=p.roof) {
  ctx.fillStyle=p.wall;ctx.fillRect(x-s*.48,y-s*.05,s*.96,s*.68);ctx.fillStyle=roof;path(ctx,[[x-s*.62,y],[x,y-s*.48],[x+s*.62,y]],true);ctx.fill();ctx.fillStyle='#32271c';ctx.fillRect(x-s*.1,y+s*.28,s*.2,s*.35);
}
function settlement(ctx,x,y,scale,count,p,dark,seed,labelValue,coreRadius=0) {
  const shown=clamp(Math.ceil(Math.log2(Math.max(1,count)+1))+2,4,11);
  ctx.save();ctx.fillStyle=dark?'rgba(239,204,123,.12)':'rgba(255,232,160,.25)';ctx.beginPath();ctx.ellipse(x,y+7,45*scale,25*scale,0,0,TAU);ctx.fill();
  let placed=0,attempt=0;
  while(placed<shown&&attempt<shown*12){const i=attempt++,a=noise(`${seed}a${i}`)*TAU,r=coreRadius?coreRadius+2+noise(`${seed}r${i}`)*22*scale:(9+noise(`${seed}r${i}`)*28)*scale,hx=x+Math.cos(a)*r,hy=y+Math.sin(a)*r*.56,s=(7+noise(`${seed}s${i}`)*4)*scale;
    if(coreRadius&&Math.hypot(hx-x,(hy-y)/.56)<coreRadius)continue;
    if(footprintIntersectsRiver({x:hx,y:hy,width:s*1.24,height:s*1.11},5))continue;house(ctx,hx,hy,s,p,placed%3?p.roof:p.roof2);placed+=1;}
  if(labelValue){text(ctx,labelValue,x,y+35*scale,{align:'center',font:`700 ${Math.max(8,10*scale)}px ui-monospace, monospace`,color:p.ink,shadow:dark?'#17241e':'#c4b989'});}
  ctx.restore();
}

function drawSettlements(ctx,model,p,dark) {
  const mages=Math.max(0,finite(model.populace?.mages));
  const share=Math.max(1,Math.round(mages/6));
  // Where a generated town sprite holds the core, procedural houses form only
  // the outer hamlet ring so the town never renders twice.
  const core=WORLD_ASSETS.town.enabled?30:0;
  settlement(ctx,148,551,.75,share,p,dark,'west','WESTERFORD',core);
  settlement(ctx,507,580,.72,share,p,dark,'mill','MILLWARD',core);
  settlement(ctx,585,652,.62,share,p,dark,'east','EASTMARCH');
  settlement(ctx,108,692,.56,share,p,dark,'south','SOUTH HAMLET');
  settlement(ctx,484,759,.52,share,p,dark,'vale','VALESTEAD');
  // Tiny roofs across the horizon imply the wider population without asserting one house per mage.
  ctx.save();ctx.globalAlpha=dark?.64:.72;
  DISTANT_HOUSE_CANDIDATES.forEach((candidate,i)=>{if(candidate.x>485||!isValidSocket(candidate))return;house(ctx,candidate.x,candidate.y,candidate.width/1.24,p,i%2?p.roof:p.roof2);});
  ctx.restore();
  text(ctx,`${Math.round(mages)} LIVING MAGES · SETTLEMENT TEXTURE REPRESENTATIVE`,22,851,{font:'600 8px ui-monospace, monospace',color:dark?'rgba(225,216,192,.62)':'rgba(42,49,39,.62)'});
}

function drawAcademy(ctx,model,p,dark) {
  const inst=model.institutions||{},universities=Math.max(0,finite(inst.universities));
  const {x,y,width}=LANDMARK_SOCKETS.academy;
  ctx.save();ctx.fillStyle=dark?'rgba(225,199,111,.12)':'rgba(229,204,116,.22)';ctx.beginPath();ctx.ellipse(x,y+27,52,17,0,0,TAU);ctx.fill();
  drawAsset(ctx,'academy',x,y,width,1);
  text(ctx,universities?`${universities} ACADEM${universities===1?'Y':'IES'}`:'ACADEMIC COMMONS',x,y+39,{align:'center',font:'700 10px ui-monospace, monospace',color:dark?'#fff0bd':'#4b391c'});
  const cap=Math.max(0,finite(inst.capacity)),lib=Math.max(0,finite(inst.libraryDepth)),grim=Math.max(0,finite(inst.grimoires));
  text(ctx,`CAP ${cap} · LIB ${lib} · GR ${grim}`,x,y+67,{align:'center',font:'700 9px ui-monospace, monospace',color:p.ink});ctx.restore();
}

function drawAssetGroundShadow(ctx,asset,x,y,w,alpha) {
  const shadow=asset.groundShadow;
  if(!shadow)return;
  ctx.save();ctx.globalAlpha=shadow.alpha*alpha;ctx.fillStyle='#0b1510';ctx.beginPath();
  ctx.ellipse(x,y+shadow.offsetY,w*shadow.widthRatio/2,w*shadow.heightRatio/2,0,0,TAU);ctx.fill();ctx.restore();
}

function drawAsset(ctx,name,x,y,w=undefined,alpha=1) {
  const asset=WORLD_ASSETS[name],image=WORLD_ASSET_IMAGES[name];
  if(!asset||!image?.complete||!image.naturalWidth)return;
  const width=w??asset.displayWidth,h=width*(image.naturalHeight/image.naturalWidth);
  const left=x-width*asset.anchor.x,top=y-h*asset.anchor.y;
  drawAssetGroundShadow(ctx,asset,x,y,width,alpha);
  ctx.save();ctx.globalAlpha=alpha;ctx.drawImage(image,left,top,width,h);ctx.restore();
}

function drawGeneratedLandmarks(ctx,model,dark) {
  // Generated candidates remain in the manifest but are disabled until their
  // near-full-canvas alpha mattes are cleaned and the assets are re-accepted.
  const placements=[
    ['farm',204,718,90,dark?.64:.76],
    ['quarry',592,336,88,dark?.64:.78],
    ['scriptorium',449,518,66,dark?.66:.80],
    ['shrine',531,678,54,dark?.66:.82],
    ['town',147,551,56,dark?.62:.76],
    ['town',507,580,50,dark?.58:.70],
  ];
  const known=model.knownNodeIds instanceof Set?model.knownNodeIds.size:0;
  const wardCount=compileMagic(model).find(group=>group.archetype==='protective-ward')?.count||0;
  if(wardCount>0)placements.push(['ward',LANDMARK_SOCKETS.ward.x,LANDMARK_SOCKETS.ward.y,132,dark?.16:.14]);
  placements.filter(([name])=>WORLD_ASSETS[name].enabled).sort((a,b)=>WORLD_ASSETS[a[0]].z-WORLD_ASSETS[b[0]].z).forEach(([name,x,y,w,alpha])=>drawAsset(ctx,name,x,y,w,alpha));
  // The ley nexus is vector magic language, not a pixel emblem: teal rays and
  // a thin ring where held knowledge meets the land.
  if(known>0){
    const {x,y}=LANDMARK_SOCKETS.ley;
    ctx.save();ctx.globalAlpha=dark?.5:.42;ctx.strokeStyle=dark?'#63c9bd':'#2f7f78';ctx.lineWidth=1.2;ctx.lineCap='round';
    for(let i=0;i<6;i+=1){const a=i*TAU/6+.35;ctx.beginPath();ctx.moveTo(x+Math.cos(a)*6,y+Math.sin(a)*4);ctx.lineTo(x+Math.cos(a)*(20+noise(`ley${i}`)*8),y+Math.sin(a)*(13+noise(`leyr${i}`)*6));ctx.stroke();}
    ctx.beginPath();ctx.ellipse(x,y,10,6.5,0,0,TAU);ctx.stroke();
    ctx.globalAlpha=dark?.28:.22;ctx.fillStyle=dark?'#63c9bd':'#2f7f78';ctx.beginPath();ctx.ellipse(x,y,26,17,0,0,TAU);ctx.fill();
    ctx.restore();
  }
}

// Known arts touch the realm where their archetype lives: a soft tint, a thin
// dashed thread from the sky seal, and a goal dot when the art is actively
// pursued. Known ≠ applied: tints mark held knowledge, dots mark live goals.
function drawRealmMagic(ctx, model, p, dark) {
  const groups = compileMagic(model).slice(0, 7);
  if (!groups.length) return;
  const river = [...RIVER_LEFT, [425, 862], ...RIVER_RIGHT.slice(0, -1).reverse()];
  ctx.save();
  groups.forEach((group, i) => {
    const meta = ARTS[group.archetype] || ARTS.default;
    const anchor = REGION_ANCHORS[group.archetype];
    if (!anchor) return;
    const sx = 54 + i * (596 / Math.max(1, groups.length - 1)), sy = 72 + Math.sin(i * 1.63) * 20;
    // Thread from the sky seal down to where the art works.
    ctx.save(); ctx.globalAlpha = dark ? .34 : .38; ctx.strokeStyle = meta.color; ctx.lineWidth = 1;
    ctx.setLineDash([3, 5]); ctx.beginPath(); ctx.moveTo(sx, sy + 12);
    ctx.bezierCurveTo(sx, sy + 90, anchor.x, anchor.y - 120, anchor.x, anchor.y - 26); ctx.stroke(); ctx.restore();
    // Tint, clipped off the water for land anchors.
    ctx.save();
    if (anchor.surface === 'land') {
      ctx.beginPath(); ctx.rect(0, 0, BW, BH); path(ctx, river, true); ctx.clip('evenodd');
    }
    const r = 34 + Math.min(36, group.count) / 36 * 14;
    const g = ctx.createRadialGradient(anchor.x, anchor.y, 2, anchor.x, anchor.y, r);
    g.addColorStop(0, meta.color + (dark ? '40' : '3a')); g.addColorStop(1, meta.color + '00');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(anchor.x, anchor.y, r, 0, TAU); ctx.fill();
    ctx.restore();
    // Small seal at the anchor; goal dot marks actively pursued arts.
    ctx.save(); ctx.globalAlpha = dark ? .88 : .82;
    ctx.fillStyle = dark ? 'rgba(10,24,34,.72)' : 'rgba(235,226,190,.72)'; ctx.strokeStyle = meta.color; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(anchor.x, anchor.y, 11, 0, TAU); ctx.fill(); ctx.stroke();
    glyph(ctx, meta.glyph, anchor.x, anchor.y, 5.5, meta.color);
    if (group.goals) { ctx.fillStyle = p.glow; ctx.beginPath(); ctx.arc(anchor.x + 9, anchor.y - 9, 2.4, 0, TAU); ctx.fill(); }
    ctx.restore();
  });
  ctx.restore();
}

function compileMagic(model) {
  const known=model.knownNodeIds instanceof Set?model.knownNodeIds:new Set(model.knownNodeIds||[]);
  const goals=model.activeGoalNodeIds instanceof Set?model.activeGoalNodeIds:new Set(model.activeGoalNodeIds||[]);
  const copies=model.copiesByNodeId instanceof Map?model.copiesByNodeId:new Map(Object.entries(model.copiesByNodeId||{}));
  const groups=new Map();
  for(const node of Array.isArray(model.auditNodes)?model.auditNodes:[]){
    if(!node||!known.has(String(node.id)))continue;
    const archetype=String(node.visualArchetype||'default');
    if(!groups.has(archetype))groups.set(archetype,{archetype,count:0,copies:0,goals:0});
    const group=groups.get(archetype);group.count+=1;group.copies+=Math.max(0,finite(copies.get(String(node.id))));if(goals.has(String(node.id)))group.goals+=1;
  }
  return [...groups.values()].sort((a,b)=>b.count-a.count||a.archetype.localeCompare(b.archetype));
}

/**
 * Draw a civilization-scale illustrated world. Geography is explicitly
 * schematic: simulation quantities are factual, while placement and distant
 * settlement texture communicate relationships and breadth, not coordinates.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} model
 */
export function drawCivilizationAtlas(ctx, model = {}) {
  if(!ctx)return;
  const W=Math.max(1,finite(model.W,ctx.canvas?.width||BW)),H=Math.max(1,finite(model.H,ctx.canvas?.height||BH));
  const dark=Boolean(model.dark),p=colors(dark);
  ctx.save();ctx.scale(W/BW,H/BH);
  drawSky(ctx,p,dark);drawAurora(ctx,model,p,dark);drawFarCountry(ctx,p,dark);drawGround(ctx,p);drawHighlands(ctx,p,dark);drawFarmland(ctx,p,dark);drawForests(ctx,p,dark);drawRiver(ctx,p,dark);drawRoads(ctx,p,dark);drawSettlements(ctx,model,p,dark);drawAcademy(ctx,model,p,dark);drawGeneratedLandmarks(ctx,model,dark);drawRealmMagic(ctx,model,p,dark);drawDistrictLabels(ctx,p,dark);
  const favor=Math.max(0,finite(model.resources?.favor??model.resources?.worship??model.resources?.devotion));
  glyph(ctx,'halo',655,822,10,dark?'#e5cc77':'#765d25');text(ctx,`FAVOR ${Math.round(favor)}`,638,826,{align:'right',font:'700 9px ui-monospace, monospace',color:p.ink});
  text(ctx,'CIVILIZATION ATLAS · SCHEMATIC GEOGRAPHY / LIVE COUNTS',BW-18,BH-11,{align:'right',font:'700 8px ui-monospace, monospace',color:dark?'rgba(231,221,197,.58)':'rgba(39,46,37,.58)'});
  ctx.restore();
}
