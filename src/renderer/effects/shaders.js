// Original procedural artwork, with one readable focal form per scene.
export const VERTEX = `attribute vec2 aPosition;
void main(){gl_Position=vec4(aPosition,0.0,1.0);}`;

const COMMON = `
precision highp float;
uniform vec2 uResolution;
uniform float uTime;
uniform float uProgress;
uniform float uIntensity;
uniform float uSeed;
uniform vec3 uAccent;
uniform sampler2D uDesktop;
uniform float uHasDesktop;
const float PI=3.14159265359;
const float TAU=6.28318530718;
mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
float sat(float x){return clamp(x,0.0,1.0);}
float sq(float x){return x*x;}
float enter(float p){return smoothstep(0.0,.20,p);}
float leave(float p){return smoothstep(.64,.96,p);}
float hash(vec2 p){p=fract(mod(p,127.0)*vec2(123.34,456.21));p+=dot(p,p+45.32+uSeed*.013);return fract(p.x*p.y);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float v=0.0,a=.5;for(int i=0;i<4;i++){v+=a*noise(p);p=rot(.55)*p*2.03+vec2(3.2,1.7);a*=.5;}return v;}
float line(float d,float sharpness){return exp(-abs(d)*sharpness);}
float segment(vec2 p,vec2 a,vec2 b){vec2 pa=p-a,ba=b-a;float h=clamp(dot(pa,ba)/max(dot(ba,ba),.0001),0.0,1.0);return length(pa-ba*h);}
vec3 tint(vec3 color,float amount){return mix(color,color*mix(vec3(1),uAccent*1.6,.35),amount);}
float stars(vec2 p){vec2 z=p*15.0,c=floor(z),f=fract(z);vec2 o=vec2(hash(c+5.0),hash(c+19.0));return exp(-length(f-o)*70.0)*step(.986,hash(c));}
vec3 field(vec2 uv){vec2 f=abs(fract(uv*vec2(22.0,14.0))-.5);float g=1.0-smoothstep(.008,.025,min(f.x,f.y));return vec3(.003,.006,.012)+g*vec3(.010,.018,.030);}
vec3 desktopAt(vec2 uv){float e=min(min(uv.x,uv.y),min(1.0-uv.x,1.0-uv.y));return texture2D(uDesktop,clamp(uv,0.0,1.0)).rgb*smoothstep(-.003,.01,e);}
vec3 effect(vec2 q,vec2 uv,float p,float t);
void main(){
 vec2 uv=gl_FragCoord.xy/uResolution;
 vec2 q=(uv-.5)*2.0;q.x*=uResolution.x/uResolution.y;
 float p=clamp(uProgress,0.0,1.0);
 // Intensity changes drift speed, while keeping the silhouette readable.
 float t=uTime*mix(.28,.82,uIntensity);
 vec3 color=effect(q,uv,p,t);
 float envelope=smoothstep(0.0,.055,p)*(1.0-smoothstep(.88,1.0,p));
 color*=envelope*mix(.88,1.08,uIntensity);
 color*=1.0-.3*smoothstep(.65,1.8,length(q));
 color=1.0-exp(-max(color,vec3(0)));
 if(p<=0.0||p>=.999)color=vec3(0);
 gl_FragColor=vec4(color,1.0);
}`;

export const SHADERS = {
 singularity: `
vec3 effect(vec2 q,vec2 uv,float p,float t){
 float arrival=enter(p),pull=leave(p),r=length(q);
 float horizon=mix(.230,.263,arrival)+pow(pull,2.5)*3.4;
 float gravity=smoothstep(.16,.88,p);
 float scale=mix(1.0,.045,pow(gravity,2.6));
 vec2 warped=rot(gravity*gravity*.64/(r+.16)+pull*.7)*q/max(scale,.025);
 warped.x/=uResolution.x/uResolution.y;warped=warped*.5+.5;
 vec3 c=mix(field(warped),desktopAt(warped)*.62,uHasDesktop)*(1.0-smoothstep(.78,.94,p));
 c+=vec3(.025,.042,.075)*exp(-r*2.7)+stars(q)*vec3(.26,.36,.5)*(1.0-pull);
 vec2 disk=rot(-.18)*q;disk.y*=4.2;
 float dr=length(disk),da=atan(disk.y,disk.x+.000001);
 float radius=.74+pull*.78;
 float body=exp(-sq((dr-radius)/.17));
 float filament=.68+.18*sin(dr*77.0+da*3.0-t*.65);
 float front=.38+.62*sat(.5-.5*sin(da));
 c+=tint(mix(vec3(.28,.42,.65),vec3(.88,.95,1),front),.35)*body*filament*front*.8;
 c+=vec3(.62,.77,.98)*line(dr-radius,145.0)*front*.45;
 float mask=smoothstep(horizon-.003,horizon+.006,r);c*=mask;
 float rim=line(r-horizon,220.0/(1.0+horizon));
 float rimGlow=line(r-horizon,26.0/(1.0+horizon));
 c+=vec3(.88,.94,1)*rim*1.6+vec3(.17,.32,.62)*rimGlow*.23;
 float arc=length(vec2(q.x,q.y*.83));
 c+=vec3(.38,.58,.9)*line(arc-horizon*1.13,155.0)*smoothstep(.02,.15,q.y)*.46;
 float a=atan(q.y,q.x+.000001);
 vec2 dust=vec2((a/TAU+gravity*.08/(r+.2))*34.0,log(max(r-horizon,.004)+.09)*9.0+t*.32);
 vec2 cell=floor(dust);
 float particle=exp(-length(fract(dust)-vec2(hash(cell+2.0),hash(cell+7.0)))*55.0)*step(.95,hash(cell));
 c+=vec3(.64,.78,1)*particle*mask*exp(-max(r-horizon,0.0)*3.0)*.35;
 return c;
}`,
 quantum: `
vec3 effect(vec2 q,vec2 uv,float p,float t){
 q*=mix(1.12,1.0,enter(p))*(1.0+leave(p)*4.0);
 float r=length(q),a=atan(q.y,q.x+.000001);
 float shellRadius=.45+.026*sin(a*3.0+t*.35)+.018*cos(a*5.0-t*.2);
 float shell=line(r-shellRadius,40.0);
 float cloud=exp(-sq((r-.34)/.23))*(.58+.42*sin(a*2.0+t*.2));
 vec2 grid=(q+vec2(sin(q.y*3.0+t*.25),cos(q.x*3.0-t*.2))*.025)*36.0;
 vec2 cell=floor(grid),f=fract(grid)-.5;
 vec2 jitter=(vec2(hash(cell+3.0),hash(cell+11.0))-.5)*.5;
 float point=exp(-length(f-jitter)*32.0)*step(.78,hash(cell));
 float density=exp(-sq((r-.38)/.15));
 vec3 c=vec3(.003,.006,.018)+tint(vec3(.15,.28,.79),.3)*(cloud*.18+shell*.22);
 c+=mix(vec3(.35,.53,1),vec3(.82,.9,1),hash(cell))*point*density*1.9;
 c+=vec3(.64,.78,1)*exp(-r*32.0)*2.5;
 c+=vec3(.18,.31,.72)*exp(-r*9.0)*.23;
 vec2 orbit=rot(.45)*q;orbit.y*=2.7;
 c+=vec3(.36,.49,.86)*line(length(orbit)-.47,170.0)*.13;
 return c;
}`,
 aurora: `
vec3 effect(vec2 q,vec2 uv,float p,float t){
 q.y-=leave(p)*1.8;
 q.x*=mix(1.14,1.0,enter(p));
 vec3 c=vec3(.002,.008,.014);
 float span=exp(-pow(abs(q.x)*.78,4.0));
 for(int i=0;i<3;i++){
  float fi=float(i);
  float path=.19*sin(q.x*2.0+t*.18+fi*.22)+.055*sin(q.x*4.3-t*.12)+fi*.062-.065;
  float d=q.y-path;
  float silk=exp(-sq((d-.07)/.13));
  float edge=line(d,115.0);
  float folds=.78+.22*sin(q.x*6.0+fi*.65+t*.13);
  vec3 hue=mix(vec3(.13,.73,.48),vec3(.22,.38,.91),fi*.5);
  c+=tint(hue,.18)*(silk*.13*folds+edge*.40)*span;
 }
 c+=vec3(.06,.29,.27)*exp(-sq(q.x*.75)-sq((q.y-.1)*3.2))*.12;
 return c;
}`,
 warp: `
vec3 effect(vec2 q,vec2 uv,float p,float t){
 float acceleration=leave(p),r=max(length(q),.006),a=atan(q.y,q.x+.000001);
 float angleCell=floor((a/TAU+.5)*84.0),lane=fract((a/TAU+.5)*84.0)-.5;
 float travel=log(r)*1.55-t*(.42+acceleration*.8)-acceleration*1.6+hash(vec2(angleCell,1))*12.0;
 float z=fract(travel),thin=pow(max(0.0,1.0-abs(lane)*2.0),18.0);
 float trail=smoothstep(.55,.96,z)*thin*step(.70,hash(vec2(angleCell,floor(travel))));
 trail*=smoothstep(.18,.6,r)*exp(-r*.35);
 float aperture=.125+acceleration*.36;
 vec3 c=vec3(.002,.005,.017)+tint(vec3(.17,.30,.83),.35)*trail*.7;
 c+=vec3(.7,.84,1)*trail*pow(z,12.0)*.85;
 c+=vec3(.60,.75,1)*line(r-aperture,130.0)*1.25;
 c+=vec3(.12,.23,.61)*line(r-aperture,28.0)*.32;
 c+=vec3(.24,.42,.83)*exp(-abs(q.y)*65.0-abs(q.x)*4.4)*.16;
 c+=vec3(.025,.065,.19)*exp(-r*4.0);
 return c;
}`,
 matrix: `
float glyph(vec2 f,float id){
 vec2 b=floor(f*vec2(5,7));float x=b.x,y=b.y,outp=0.0;
 if(id<1.0)outp=max(step(abs(x-2.0),1.5)*max(step(y,.1),step(5.9,y)),step(abs(y-3.0),2.5)*max(step(x,.1),step(3.9,x)));
 else if(id<2.0)outp=max(step(abs(x-2.0),.1),step(5.9,y)*step(abs(x-2.0),1.5));
 else if(id<3.0)outp=max(step(abs(x-2.0),.1)*step(abs(y-3.0),2.1),step(abs(y-3.0),.1));
 else if(id<4.0)outp=step(abs(abs(y-3.0)-x+1.0),.1);
 else if(id<5.0)outp=max(step(abs(y-2.0),.1),step(abs(y-4.0),.1));
 else outp=max(step(x,.1),max(step(y,.1),step(5.9,y))*step(x,2.1));
 vec2 pix=fract(f*vec2(5,7));return outp*step(.13,pix.x)*step(.13,pix.y)*step(pix.x,.9)*step(pix.y,.9);
}
vec3 effect(vec2 q,vec2 uv,float p,float t){
 float departure=leave(p);
 vec2 grid=vec2(q.x*9.0,(q.y+departure*2.0+1.0)*12.0);
 vec2 cell=floor(grid),f=fract(grid);float seed=hash(vec2(cell.x,2));
 float head=fract(t*(.07+seed*.055)+seed)*30.0,tail=mod(head+cell.y+30.0,30.0);
 float trail=exp(-tail*.25)*step(tail,12.0)*step(.48,seed);
 float id=floor(hash(vec2(cell.x,cell.y+floor(t*.7)))*6.0);
 float g=glyph(f*vec2(.83,.88),id)*step(f.x,.9)*step(f.y,.95);
 float surround=smoothstep(.18,.54,length(q))*exp(-dot(q,q)*1.0);
 vec3 c=vec3(.002,.008,.006)+vec3(.15,.67,.37)*g*trail*surround*.32;
 vec2 mark=q*mix(1.08,1.0,enter(p));mark.x*=1.0+departure*5.0;
 float chevron=min(segment(mark,vec2(-.29,.19),vec2(-.08,0)),segment(mark,vec2(-.08,0),vec2(-.29,-.19)));
 float cursor=segment(mark,vec2(.06,-.17),vec2(.30,-.17));
 float symbol=min(chevron,cursor);
 c+=vec3(.64,1,.78)*line(symbol,180.0)*1.5;
 c+=tint(vec3(.15,.69,.37),.15)*line(symbol,25.0)*.17;
 c+=vec3(.02,.18,.085)*exp(-length(q)*5.0)*.2;
 return c;
}`,
 portal: `
float roundedBox(vec2 p,vec2 b,float r){vec2 d=abs(p)-b+r;return min(max(d.x,d.y),0.0)+length(max(d,0.0))-r;}
vec3 effect(vec2 q,vec2 uv,float p,float t){
 q=rot(.055*sin(t*.16))*q;
 q/=mix(.88,1.0,enter(p))+leave(p)*2.4;
 vec3 c=vec3(.007,.003,.018);
 for(int i=0;i<4;i++){
  float fi=float(i),scale=1.0-fi*.19;
  vec2 v=rot(fi*.055)*q;
  float d=roundedBox(v,vec2(.43,.58)*scale,.12*scale);
  float edge=line(d,190.0)*mix(1.1,.22,fi/3.0);
  float glow=line(d,24.0)*.075;
  vec3 hue=mix(vec3(.60,.38,.96),vec3(.28,.55,.91),fi/3.0);
  c+=tint(hue,.18)*(edge+glow);
 }
 c+=vec3(.32,.17,.63)*exp(-sq(q.x*3.3)-sq(q.y*1.8))*.10;
 c+=vec3(.81,.71,1)*exp(-abs(q.x)*140.0-abs(q.y)*6.0)*.12;
 return c;
}`,
 eclipse: `
vec3 effect(vec2 q,vec2 uv,float p,float t){
 q*=1.0+leave(p)*3.6;
 float r=length(q),sun=.39,angle=atan(q.y,q.x+.000001);
 float rays=.88+.08*sin(angle*11.0+t*.12)+.04*sin(angle*23.0-t*.09);
 float corona=exp(-max(r-sun,0.0)*13.0)*step(sun,r)*rays;
 vec3 c=vec3(.007,.005,.008)+tint(vec3(.94,.47,.13),.10)*corona*.43;
 c+=vec3(1,.84,.53)*line(r-sun,220.0)*1.6;
 float offset=mix(-.11,.004,smoothstep(.02,.64,p));
 vec2 moon=q-vec2(offset,.003);float moonMask=smoothstep(.377,.381,length(moon));
 c*=moonMask;
 vec2 point=vec2(.388,.027);
 float diamond=exp(-length(q-point)*110.0)*(1.0-smoothstep(.49,.76,p));
 c+=vec3(1,.92,.75)*diamond*2.2;
 c+=vec3(.92,.64,.30)*exp(-abs(q.y-.027)*170.0-abs(q.x-.388)*14.0)*.055*(1.0-smoothstep(.49,.76,p));
 return c;
}`,
 nebula: `
vec3 effect(vec2 q,vec2 uv,float p,float t){
 vec2 v=rot(-.38+.03*sin(t*.12))*q;
 v*=mix(1.1,1.0,enter(p))*(1.0+leave(p)*3.0);
 float r=length(v*vec2(.88,1.13)),a=atan(v.y,v.x+.000001);
 float n=fbm(v*2.7+vec2(t*.025,-t*.018));
 float foldedRadius=.43+.085*sin(a*3.0+t*.15)+.055*sin(a*2.0-t*.1);
 float boundary=r-foldedRadius;
 float veil=exp(-sq(boundary/.16))*(.45+.55*n);
 float edge=line(boundary+(n-.5)*.1,55.0);
 float inner=exp(-dot(v,v)*7.0);
 vec3 hue=mix(vec3(.60,.18,.43),vec3(.27,.31,.81),smoothstep(-.45,.55,v.x+.3*v.y));
 vec3 c=vec3(.005,.004,.014)+tint(hue,.18)*(veil*.75+edge*.32);
 c+=vec3(.47,.27,.68)*inner*.12;
 vec2 core=v-vec2(.10,.025);
 c+=vec3(.90,.63,.72)*exp(-length(core)*35.0)*.75;
 return c;
}`,
 ripple: `
vec3 effect(vec2 q,vec2 uv,float p,float t){
 vec2 surface=q;surface.y*=1.3;
 float r=length(surface),a=atan(surface.y,surface.x+.000001);
 float departure=leave(p),wave=sin((r-departure*.9)*15.0-t*.72);
 float crests=pow(max(wave,0.0),24.0)*smoothstep(.14,.3,r)*exp(-r*1.9);
 float light=.24+.76*pow(max(.5+.5*cos(a-.85),0.0),4.0);
 vec2 d=uv+(surface/max(r,.01))*wave*.009*exp(-r*1.4);
 vec3 c=vec3(.002,.010,.017)+desktopAt(d)*uHasDesktop*.18;
 c+=tint(vec3(.18,.61,.73),.2)*crests*.67;
 c+=vec3(.71,.94,1)*crests*light*.48;
 float bead=.105*(1.0-departure*.92),sphere=1.0-smoothstep(bead-.003,bead+.003,r);
 vec2 highlight=surface-vec2(-.035,.035);
 c+=sphere*(vec3(.035,.14,.20)+vec3(.70,.94,1)*exp(-length(highlight)*40.0)*1.35);
 c+=vec3(.34,.75,.88)*line(r-bead,190.0)*.7;
 c+=vec3(.09,.32,.43)*exp(-r*8.0)*.09;
 return c;
}`,
 orbit: `
vec3 effect(vec2 q,vec2 uv,float p,float t){
 q*=mix(1.12,1.0,enter(p))*(1.0+leave(p)*3.2);
 float r=length(q);vec3 c=vec3(.003,.006,.014);
 for(int i=0;i<3;i++){
  float fi=float(i),radius=.50+fi*.075;
  vec2 v=rot(fi*.86+.22+t*.025)*q;v.y*=2.5;
  float rr=length(v),a=atan(v.y,v.x+.000001),phase=t*(.31+fi*.035)+fi*2.1;
  float ring=line(rr-radius,140.0)*.40+line(rr-radius,32.0)*.028;
  float head=pow(max(.5+.5*cos(a-phase),0.0),220.0);
  float tail=pow(max(.5+.5*cos(a-phase+.22),0.0),38.0);
  vec3 hue=mix(vec3(.31,.54,.90),vec3(.69,.43,.77),fi*.5);
  c+=tint(hue,.22)*(ring+line(rr-radius,145.0)*(head*1.7+tail*.27));
 }
 float sphere=1.0-smoothstep(.12,.125,r);
 c=mix(c,vec3(.018,.037,.075),sphere);
 c+=sphere*vec3(.42,.60,.86)*exp(-length(q-vec2(-.045,.05))*20.0)*.82;
 c+=vec3(.60,.73,.92)*line(r-.124,170.0)*.60;
 return c;
}`,
 ink: `
vec3 effect(vec2 q,vec2 uv,float p,float t){
 vec2 v=rot(.24)*q;
 v*=mix(1.08,1.0,enter(p))*(1.0+leave(p)*3.4);
 v.y*=1.16;
 float r=length(v),a=atan(v.y,v.x+.000001);
 float fold=.43+.080*sin(a*3.0+t*.12)+.035*cos(a*5.0-t*.09);
 float distance=r-fold;
 float ribbon=exp(-sq(distance/.095));
 float sheen=.25+.75*pow(max(.5+.5*sin(a*2.0+distance*18.0+t*.08),0.0),2.0);
 float fibers=.90+.10*sin(distance*170.0+a*2.0);
 vec3 c=vec3(.004,.005,.009);
 c+=vec3(.73,.77,.84)*ribbon*sheen*fibers*.95;
 c+=vec3(.93,.96,1)*line(distance+.036,180.0)*sheen*.22;
 c+=vec3(.14,.17,.23)*exp(-sq(distance/.22))*.075;
 return c;
}`,
 constellation: `
vec2 node(float id,float t){
 vec2 pos=vec2(0);
 if(id<.5)pos=vec2(-.52,.08);
 else if(id<1.5)pos=vec2(-.29,.45);
 else if(id<2.5)pos=vec2(.14,.55);
 else if(id<3.5)pos=vec2(.52,.16);
 else if(id<4.5)pos=vec2(.37,-.35);
 else if(id<5.5)pos=vec2(-.08,-.45);
 else pos=vec2(-.45,-.25);
 return pos+vec2(sin(id*1.7+t*.15),cos(id*2.3+t*.13))*.012;
}
vec3 effect(vec2 q,vec2 uv,float p,float t){
 q=rot(.03*sin(t*.1))*q;
 q*=mix(1.08,1.0,enter(p))*(1.0+leave(p)*4.0);
 float edges=0.0,points=0.0;
 for(int i=0;i<7;i++){
  float fi=float(i);vec2 a=node(fi,t),b=node(mod(fi+1.0,7.0),t);
  edges+=line(segment(q,a,b),170.0)*.38;
  if(i==0||i==2||i==4)edges+=line(segment(q,a,vec2(.015,.04)),170.0)*.23;
  float d=length(q-a);
  points+=exp(-d*115.0)*1.8+exp(-d*27.0)*.07;
 }
 vec3 c=vec3(.003,.006,.015)+tint(vec3(.34,.54,.83),.2)*edges;
 c+=vec3(.72,.85,1)*points;
 float core=length(q-vec2(.015,.04));
 c+=vec3(.84,.93,1)*exp(-core*110.0)*2.5+vec3(.21,.38,.72)*exp(-core*20.0)*.11;
 c+=vec3(.45,.65,.95)*exp(-abs(q.x-.015)*180.0-abs(q.y-.04)*40.0)*.15;
 return c;
}`
};

export function fragmentFor(effectId) { return COMMON + (SHADERS[effectId] || SHADERS.singularity); }

export const SAFE_FRAGMENT = `precision mediump float;uniform vec2 uResolution;uniform float uTime;uniform float uProgress;uniform vec3 uAccent;
void main(){vec2 q=(gl_FragCoord.xy/uResolution-.5)*2.0;q.x*=uResolution.x/uResolution.y;float r=length(q);float g=exp(-abs(r-.42-.01*sin(uTime*.2))*100.0);float e=smoothstep(0.0,.055,uProgress)*(1.0-smoothstep(.88,1.0,uProgress));if(uProgress>=.999)e=0.0;gl_FragColor=vec4(uAccent*g*e,1.0);}`;
