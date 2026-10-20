import { EffectPlayer, EFFECT_IDS } from '../src/renderer/effects/engine.js';

const catalog=await (await fetch('../src/shared/catalog.json')).json();
const $=id=>document.getElementById(id);
const forceCanvas2D=new URLSearchParams(location.search).get('backend')==='canvas2d';
if(forceCanvas2D){
  for(const canvas of [$('poster-source'),$('live')]){
    const getContext=canvas.getContext.bind(canvas);
    canvas.getContext=(kind,...args)=>/^(webgl2?|experimental-webgl)$/.test(kind)?null:getContext(kind,...args);
  }
}
$('backend-mode').textContent=forceCanvas2D?'Backend test: Canvas 2D forced':'Backend test: automatic WebGL';
$('backend-link').textContent=forceCanvas2D?'Test WebGL renderer':'Test Canvas 2D fallback';
$('backend-link').href=forceCanvas2D?'./visual-effects.html':'./visual-effects.html?backend=canvas2d';
const source=$('poster-source'),poster=new EffectPlayer(source,{quality:'eco'});
const live=new EffectPlayer($('live'),{effectId:'singularity',quality:'auto'});
let selected='singularity',paused=false,cycle=false,useDesktop=false,finalFrame=false;
let last=performance.now(),sceneTime=2.8,frames=0,fpsStart=last,cycleStart=last;
for(const entry of catalog){const option=document.createElement('option');option.value=entry.id;option.textContent=`${entry.nameEn} · ${entry.name}`;$('effect').append(option)}

function samples(player){
  const bytes=new Uint8Array(player.width*player.height*4);
  if(player.gl)player.gl.readPixels(0,0,player.width,player.height,player.gl.RGBA,player.gl.UNSIGNED_BYTE,bytes);
  else bytes.set(player.ctx.getImageData(0,0,player.width,player.height).data);
  let brightness=0,maximum=0,hash=2166136261,nonBlack=0;
  for(let i=0;i<bytes.length;i+=16){
    const light=(bytes[i]+bytes[i+1]+bytes[i+2])/3;
    brightness+=light;maximum=Math.max(maximum,light);if(light>5)nonBlack++;
    hash=Math.imul(hash^bytes[i],16777619);hash=Math.imul(hash^bytes[i+1],16777619);hash=Math.imul(hash^bytes[i+2],16777619);
  }
  const count=Math.ceil(bytes.length/16);
  return {brightness:Number((brightness/count).toFixed(2)),maximum:Number(maximum.toFixed(2)),nonBlackPercent:Number((nonBlack/count*100).toFixed(1)),hash:(hash>>>0).toString(16)};
}
function verify(){
  const results=[];$('grid').replaceChildren();
  for(const entry of catalog){
    poster.setEffect(entry.id);poster.setOptions({accent:entry.accent,seed:42});
    const stages=[.08,.45,.8].map(progress=>{poster.render(progress*6,progress);return {progress,...samples(poster)}});
    poster.render(2.8,.45);
    const pixels=samples(poster),error=poster.error,src=source.toDataURL('image/png');
    poster.render(2.8,1);const final=samples(poster);
    const stageMotion=new Set(stages.map(stage=>stage.hash)).size===stages.length;
    const passed=poster.supported&&!error&&pixels.brightness>.3&&stages.every(stage=>stage.maximum>2)&&stageMotion&&final.maximum===0;
    const result={id:entry.id,backend:poster.backend,passed,error,pixels,stages,stageMotion,finalBlack:final.maximum===0};results.push(result);
    const card=document.createElement('article');card.className='card'+(passed?'':' fail');
    const img=document.createElement('img');img.src=src;img.alt=`${entry.nameEn} at 45 percent progress`;
    const info=document.createElement('div');info.className='info';const title=document.createElement('h2');title.textContent=`${entry.nameEn} / ${entry.name}`;
    const details=document.createElement('pre');details.textContent=`${passed?'PASS':'FAIL'} · ${poster.backend}\nMean ${pixels.brightness} · lit ${pixels.nonBlackPercent}%\nEntry / hold / handoff: ${stageMotion?'distinct':'FAIL'}\nFinal black: ${result.finalBlack}\n${error||(poster.backend==='webgl'?'Shader compiled successfully':'Canvas 2D fallback rendered')}`;
    info.append(title,details);card.append(img,info);$('grid').append(card);
  }
  const passed=results.filter(r=>r.passed).length,unique=new Set(results.map(r=>r.pixels.hash)).size;
  $('summary').textContent=`${passed}/${EFFECT_IDS.length} passed · ${unique} distinct frames`;
  $('summary').className=passed===12&&unique===12?'pass':'fail';
  const report={passed,total:12,distinctFrames:unique,backend:poster.backend,forcedCanvas2D:forceCanvas2D,pixelSize:[poster.width,poster.height],results};
  $('report').textContent=JSON.stringify(report,null,2);
  document.documentElement.dataset.qaPassed=String(passed);document.documentElement.dataset.qaDistinct=String(unique);
  return report;
}
function choose(id){
  selected=id;finalFrame=false;const effect=catalog.find(item=>item.id===id);live.setEffect(id);live.setOptions({accent:effect.accent});
  $('effect').value=id;$('live-name').textContent=effect.nameEn;$('live-note').textContent=useDesktop?'Synthetic desktop fixture · no actual screen read':'Live synthetic preview';
}
async function syntheticDesktop(){
  const canvas=document.createElement('canvas');canvas.width=1440;canvas.height=900;const ctx=canvas.getContext('2d');
  const g=ctx.createLinearGradient(0,0,1440,900);g.addColorStop(0,'#1a385c');g.addColorStop(.55,'#466384');g.addColorStop(1,'#c69684');ctx.fillStyle=g;ctx.fillRect(0,0,1440,900);
  ctx.fillStyle='#ffffff22';ctx.fillRect(0,0,1440,32);ctx.fillStyle='#f3f6ff';ctx.font='16px system-ui';ctx.fillText('SYNTHETIC DESKTOP — NO SCREEN CAPTURE',22,22);
  ctx.fillStyle='#151d2bdd';ctx.fillRect(160,150,780,490);ctx.fillStyle='#2a384c';ctx.fillRect(160,150,780,38);
  ['#ee8179','#e6bf70','#79cda3'].forEach((color,i)=>{ctx.fillStyle=color;ctx.beginPath();ctx.arc(183+i*24,169,6,0,Math.PI*2);ctx.fill()});
  ctx.fillStyle='#eff3ff';ctx.font='48px system-ui';ctx.fillText('Hello, universe.',210,290);
  ctx.fillStyle='#b4c4d9';ctx.font='22px system-ui';ctx.fillText('A texture for testing gravitational distortion.',210,343);
  for(let i=0;i<6;i++){ctx.fillStyle='#8ba8ce44';ctx.fillRect(210,395+i*30,480-i*35,10)}
  ctx.fillStyle='#ffffff22';ctx.fillRect(465,805,510,64);for(let i=0;i<8;i++){ctx.fillStyle=['#a5c8dc','#989bcf','#d5a293'][i%3];ctx.fillRect(482+i*61,816,42,42)}
  return await live.setDesktopImage(canvas.toDataURL('image/png'));
}
$('effect').addEventListener('change',event=>choose(event.target.value));
$('pause').addEventListener('click',()=>{paused=!paused;$('pause').setAttribute('aria-pressed',String(paused));$('pause').textContent=paused?'Resume':'Pause'});
$('cycle').addEventListener('click',()=>{cycle=!cycle;cycleStart=performance.now();$('cycle').setAttribute('aria-pressed',String(cycle))});
$('desktop').addEventListener('click',async()=>{
  const success=await syntheticDesktop();useDesktop=success;choose('singularity');
  $('desktop').setAttribute('aria-pressed',String(success));$('desktop').textContent=success?'Synthetic desktop loaded: true':'Synthetic desktop loaded: false';
  $('desktop-result').textContent=`setDesktopImage returned ${success} · ${live.backend} · synthetic texture only`;
  document.documentElement.dataset.qaDesktopLoaded=String(success);
});
$('finish').addEventListener('click',()=>{finalFrame=!finalFrame;$('finish').textContent=finalFrame?'Return to animation':'Check final black frame'});
$('rerun').addEventListener('click',verify);
window.addEventListener('resize',()=>live.resize());
window.addEventListener('pagehide',()=>{poster.destroy();live.destroy()});
verify();choose('singularity');
function tick(now){
  const dt=Math.min((now-last)/1000,.08);last=now;
  if(!document.hidden){
    if(!paused)sceneTime+=dt;
    live.render(sceneTime,finalFrame ? 1 : useDesktop ? .45 : .45+.12*Math.sin(sceneTime*.2));
    frames++;if(now-fpsStart>=1500){$('fps').textContent=`${Math.round(frames*1000/(now-fpsStart))} FPS · ${live.backend}${live.error?' · ERROR':''}`;frames=0;fpsStart=now}
    if(cycle&&now-cycleStart>3500){cycleStart=now;choose(EFFECT_IDS[(EFFECT_IDS.indexOf(selected)+1)%EFFECT_IDS.length])}
  }else{frames=0;fpsStart=now}
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
