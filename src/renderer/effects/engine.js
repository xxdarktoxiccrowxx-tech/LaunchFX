import { VERTEX, fragmentFor, SAFE_FRAGMENT, SHADERS } from './shaders.js';
import { renderFallback } from './fallback.js';

export const EFFECT_IDS = Object.freeze(Object.keys(SHADERS));
const DEFAULTS = Object.freeze({effectId:'singularity',quality:'auto',intensity:.75,accent:'#86a8ff',seed:42});
const finite = (n,fallback) => Number.isFinite(Number(n)) ? Number(n) : fallback;
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
function normalize(next,previous=DEFAULTS){
 const value={...previous,...next};
 value.effectId=EFFECT_IDS.includes(value.effectId)?value.effectId:'singularity';
 value.quality=['auto','high','eco'].includes(value.quality)?value.quality:'auto';
 value.intensity=clamp(finite(value.intensity,.75),0,1);
 value.accent=/^#[0-9a-f]{6}$/i.test(value.accent)?value.accent:'#86a8ff';
 value.seed=Math.abs(finite(value.seed,42))%4096;
 return value;
}

/** A caller-clocked, offline animation renderer. It never captures or fetches images. */
export class EffectPlayer {
 constructor(canvas,options={}){
  if(!canvas||typeof canvas.getContext!=='function')throw new TypeError('EffectPlayer requires a canvas.');
  this.canvas=canvas;this.options=normalize(options);this.supported=false;this.backend='none';this.error=null;
  this.fallbackWidth=canvas.width||640;this.fallbackHeight=canvas.height||360;
  this.destroyed=false;this.lost=false;this.programs=new Map();this.desktopImage=null;this.hasDesktop=false;this.imageRequest=0;
  this._lost=event=>{event.preventDefault();this.lost=true;this.supported=false;this.error='Graphics context temporarily unavailable.';};
  this._restored=()=>{if(!this.destroyed){this.lost=false;this.programs.clear();this._initializeGL();if(this.desktopImage)this._uploadDesktop(this.desktopImage)}};
  canvas.addEventListener('webglcontextlost',this._lost);canvas.addEventListener('webglcontextrestored',this._restored);
  // Retained studio previews remain visible while their caller pauses its frame clock.
  // Full-screen overlays default to the cheaper disposable drawing buffer.
  try{this.gl=canvas.getContext('webgl',{alpha:false,antialias:false,depth:false,stencil:false,preserveDrawingBuffer:options.retainFrame===true,powerPreference:options.quality==='eco'?'low-power':'default'});}catch(error){this.error=error.message;}
  if(this.gl)this._initializeGL();
  else{this.ctx=canvas.getContext('2d',{alpha:false});this.backend='canvas2d';this.supported=!!this.ctx;this.error=this.supported?null:'No graphics context is available.';this.resize();}
 }
 _compile(kind,source){
  const gl=this.gl,shader=gl.createShader(kind);gl.shaderSource(shader,source);gl.compileShader(shader);
  if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){const message=gl.getShaderInfoLog(shader);gl.deleteShader(shader);throw new Error(message||'Shader compilation failed.');}
  return shader;
 }
 _makeProgram(source){
  const gl=this.gl;let vertex,fragment,program;
  try{
   vertex=this._compile(gl.VERTEX_SHADER,VERTEX);fragment=this._compile(gl.FRAGMENT_SHADER,source);program=gl.createProgram();gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.linkProgram(program);
   if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program)||'Shader linking failed.');
   const uniforms={};for(const key of ['uResolution','uTime','uProgress','uIntensity','uSeed','uAccent','uDesktop','uHasDesktop'])uniforms[key]=gl.getUniformLocation(program,key);
   return {program,uniforms,position:gl.getAttribLocation(program,'aPosition')};
  }catch(error){if(program)gl.deleteProgram(program);throw error}
  finally{if(vertex)gl.deleteShader(vertex);if(fragment)gl.deleteShader(fragment)}
 }
 _initializeGL(){
  const gl=this.gl;
  try{
   const precision=gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER,gl.HIGH_FLOAT);this.highPrecision=!!precision?.precision;
   this.buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
   this.texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([0,0,0,255]));
   gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);gl.clearColor(0,0,0,1);
   this.backend='webgl';this.supported=true;this.hasDesktop=false;this.error=null;this.resize();this._program();
  }catch(error){this.supported=false;this.error=error.message;}
 }
 _program(){
  const id=this.options.effectId;if(this.programs.has(id)){const existing=this.programs.get(id);this.error=existing.error||null;return existing;}
  let source=fragmentFor(id);if(!this.highPrecision)source=source.replace('precision highp float;','precision mediump float;');
  let program;
  try{program=this._makeProgram(source);program.error=null;}catch(error){program=this._makeProgram(SAFE_FRAGMENT);program.error=`${id}: ${error.message}`;}
  this.error=program.error;
  this.programs.set(id,program);return program;
 }
 resize(){
  if(this.destroyed)return;
  const rect=this.canvas.getBoundingClientRect?.()||{};
  const width=Math.max(1,finite(rect.width||this.canvas.clientWidth||this.fallbackWidth,640));
  const height=Math.max(1,finite(rect.height||this.canvas.clientHeight||this.fallbackHeight,360));
  if(rect.width>0)this.fallbackWidth=rect.width;if(rect.height>0)this.fallbackHeight=rect.height;
  const quality=this.options.quality;let dpr=Math.min(globalThis.devicePixelRatio||1,quality==='high'?1.75:quality==='eco'?.85:1.25);
  const maxPixels=quality==='high'?3500000:quality==='eco'?1000000:2100000;
  dpr=Math.min(dpr,Math.sqrt(maxPixels/(width*height)));
  this.width=Math.max(1,Math.round(width*dpr));this.height=Math.max(1,Math.round(height*dpr));
  if(this.canvas.width!==this.width||this.canvas.height!==this.height){this.canvas.width=this.width;this.canvas.height=this.height}
  if(this.gl&&!this.lost){
   this.gl.viewport(0,0,this.width,this.height);
   // Paint an opaque frame before compilation or the next caller-owned animation tick.
   this.gl.clearColor(0,0,0,1);this.gl.clear(this.gl.COLOR_BUFFER_BIT);
  }
 }
 setEffect(effectId){this.setOptions({effectId});}
 setOptions(next={}){
  if(this.destroyed)return;const oldQuality=this.options.quality;this.options=normalize(next,this.options);
  if(oldQuality!==this.options.quality)this.resize();
 }
 async setDesktopImage(dataUrl){
  if(this.destroyed||typeof dataUrl!=='string'||!/^data:image\/(?:png|jpeg|jpg|webp);base64,/i.test(dataUrl)||dataUrl.length>24000000)return false;
  const request=++this.imageRequest,image=new Image();
  const loaded=await new Promise(resolve=>{const timer=setTimeout(()=>{image.onload=null;image.onerror=null;image.src='';resolve(false)},3000);const finish=value=>{clearTimeout(timer);resolve(value)};image.onload=()=>finish(true);image.onerror=()=>finish(false);image.src=dataUrl;});
  image.onload=null;image.onerror=null;
  if(!loaded||this.destroyed||request!==this.imageRequest){image.src='';return false}
  if(this.desktopImage)this.desktopImage.src='';this.desktopImage=image;
  if(this.ctx){this.hasDesktop=true;return true}
  return this._uploadDesktop(image);
 }
 _uploadDesktop(image){
  if(!this.supported||this.lost||!this.gl)return false;const gl=this.gl;
  try{
   let source=image;const maximum=Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE),4096);
   if(image.naturalWidth>maximum||image.naturalHeight>maximum){const small=document.createElement('canvas'),factor=maximum/Math.max(image.naturalWidth,image.naturalHeight);small.width=Math.round(image.naturalWidth*factor);small.height=Math.round(image.naturalHeight*factor);small.getContext('2d').drawImage(image,0,0,small.width,small.height);source=small}
   gl.bindTexture(gl.TEXTURE_2D,this.texture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);this.hasDesktop=true;return true;
  }catch{this.hasDesktop=false;return false}
 }
 render(timeSeconds,progress=0){
  if(this.destroyed||this.lost||!this.supported)return;
  const time=finite(timeSeconds,0),p=clamp(finite(progress,0),0,1);
  if(this.ctx){renderFallback(this.ctx,this.width,this.height,time,p,this.options,this.desktopImage);return}
  const gl=this.gl,{program,uniforms:u,position}=this._program();gl.useProgram(program);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.texture);gl.uniform1i(u.uDesktop,0);gl.uniform1f(u.uHasDesktop,this.hasDesktop?1:0);
  gl.uniform2f(u.uResolution,this.width,this.height);gl.uniform1f(u.uTime,time);gl.uniform1f(u.uProgress,p);gl.uniform1f(u.uIntensity,this.options.intensity);gl.uniform1f(u.uSeed,this.options.seed);
  const hex=this.options.accent;gl.uniform3f(u.uAccent,parseInt(hex.slice(1,3),16)/255,parseInt(hex.slice(3,5),16)/255,parseInt(hex.slice(5,7),16)/255);
  gl.drawArrays(gl.TRIANGLES,0,3);
 }
 destroy(){
  if(this.destroyed)return;this.destroyed=true;this.imageRequest++;this.canvas.removeEventListener('webglcontextlost',this._lost);this.canvas.removeEventListener('webglcontextrestored',this._restored);
  if(this.desktopImage){this.desktopImage.src='';this.desktopImage=null}
  if(this.gl&&!this.lost){for(const {program} of this.programs.values())this.gl.deleteProgram(program);this.gl.deleteTexture(this.texture);this.gl.deleteBuffer(this.buffer);this.gl.getExtension('WEBGL_lose_context')?.loseContext()}
  this.programs.clear();this.supported=false;this.hasDesktop=false;
 }
}
