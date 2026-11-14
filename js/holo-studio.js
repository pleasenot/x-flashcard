/* Holo Card Studio official holographic viewer, adapted as a reusable stage.
 * Source: https://github.com/EverettFish/holo-card-studio (MIT, Copyright 2026 Holo Card Studio contributors).
 * Shaders, bloom, and card.glb come from the official pipeline; the surrounding chrome is this gallery.
 */
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';

const vertex=`varying vec2 vUv;
void main(){vUv=vec2(uv.x,1.0-uv.y);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`;
const shared=`precision highp float;
varying vec2 vUv;
uniform float uTime,uFoil,uScale,uDepth,uBgDepth,uSafeScale;
uniform vec2 uSafeOffset;
uniform vec3 uView;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
vec3 spectrum(float t){t=fract(t);vec3 pink=vec3(1.,.32,.62),yellow=vec3(1.,.85,.32),blue=vec3(.22,.62,1.);if(t<.35)return mix(pink,yellow,t/.35);if(t<.7)return mix(yellow,blue,(t-.35)/.35);return mix(blue,vec3(1.),(t-.7)/.3);}
vec3 overlay(vec3 b,vec3 f){return mix(2.*b*f,1.-2.*(1.-b)*(1.-f),step(vec3(.5),b));}
float inside(vec2 p){return step(0.,p.x)*step(0.,p.y)*step(p.x,1.)*step(p.y,1.);}
vec2 parallax(vec2 p,float s,float d){return (p-.5)*s+.5+uView.xy/max(abs(uView.z),.35)*d*.14;}
float wave(vec2 p){vec2 a=p+uView.xy*2.4;return .5+.5*sin((a.x*.848-a.y*.530)*6.283*.55+7.*noise(a*1.5));}
float star(vec2 p){vec2 q=p*105.,id=floor(q),f=fract(q);float first=9.,second=9.;for(int y=-1;y<=1;y++){for(int x=-1;x<=1;x++){vec2 g=vec2(float(x),float(y));vec2 o=vec2(hash(id+g),hash(id+g+43.3));float d=length(g+o-f);if(d<first){second=first;first=d;}else second=min(second,d);}}float edge=1.-smoothstep(.01,.035,second-first);float sparse=step(.90,hash(id+8.8));float twinkle=pow(.5+.5*sin(uTime*1.8+hash(id)*30.+uView.x*27.+uView.y*21.),6.);return edge*sparse*twinkle;}
`;
const fragment=shared+`
uniform sampler2D tSubject,tBackground,tText,tLine;
void main(){
 vec2 uv=vUv;
 vec2 su=parallax(uv,uScale,uDepth)*uSafeScale+uSafeOffset;
 vec2 bu=parallax(uv,1.,uBgDepth);
 vec4 sub=texture2D(tSubject,clamp(su,0.,1.));sub.a*=inside(su);
 vec3 bg=texture2D(tBackground,clamp(bu,0.,1.)).rgb;
 float w=wave(uv); vec3 foil=spectrum(w*.8+noise(uv*5.)*.12);
 vec3 subject=mix(sub.rgb,overlay(sub.rgb,foil),uFoil*.28);
 bg=mix(bg,overlay(bg,foil),uFoil*.36);
 vec3 col=mix(bg,subject,sub.a);
 float sweep=pow(max(0.,sin((uv.x*.83+uv.y*.35+uView.x*1.8+uView.y*.9)*6.283)),12.);
 col+=foil*sweep*uFoil*.28;
 float line=1.-smoothstep(.06,.25,texture2D(tLine,clamp(su,0.,1.)).r);
 col+=vec3(1.,.94,.78)*line*inside(su)*sub.a*sweep*uFoil*.22;
 col+=vec3(.66,.86,1.)*star(bu)*uFoil*.65*(1.-sub.a*.7);
 vec4 text=texture2D(tText,uv);col=mix(col,text.rgb,text.a);
 // Keep print saturation; the selective high luminance feeds the bloom pass.
 gl_FragColor=vec4(pow(max(col,vec3(0.)),vec3(2.2)),1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;
const edgeFragment=shared+`void main(){vec3 col=mix(vec3(.55,.34,.1),spectrum(wave(vUv)),.65+uFoil*.2);gl_FragColor=vec4(col*.8+.14,1.);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;
const backFragment=shared+`uniform sampler2D tBack;
void main(){vec4 art=texture2D(tBack,vec2(1.-vUv.x,vUv.y));vec2 p=vUv-.5;float filigree=.5+.5*sin(length(p*vec2(1.,1.5))*100.+noise(p*15.)*4.);vec3 col=mix(vec3(.025,.042,.064),vec3(.085,.092,.11),filigree*.35);float border=step(.465,max(abs(p.x),abs(p.y)));col=mix(col,spectrum(wave(vUv))*.55,border);col+=spectrum(wave(vUv))*uFoil*.08;col=mix(col,art.rgb,art.a);gl_FragColor=vec4(pow(col,vec3(2.2)),1.);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;

const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const CLEAR={light:0xE7ECF5,dark:0x0C1018};

function wrapCanvasText(ctx,text,x,y,maxWidth,lineHeight){
  const words=String(text||'').split(/\s+/);let line='';let row=0;
  for(const word of words){const probe=line?line+' '+word:word;if(ctx.measureText(probe).width>maxWidth&&line){ctx.fillText(line,x,y+row*lineHeight);line=word;row++;}else line=probe;}
  if(line)ctx.fillText(line,x,y+row*lineHeight);
}

function themeClear(){
  const theme=document.documentElement.dataset.theme;
  if(theme==='dark')return CLEAR.dark;
  if(theme==='light')return CLEAR.light;
  return matchMedia('(prefers-color-scheme: dark)').matches?CLEAR.dark:CLEAR.light;
}

const api={
  ready:false,
  flipped:false,
};

export default api;
window.HoloCard=api;

api.mount=async function mount(stage,{onSwipe,onFlip,onClick}={}){
  api.stage=stage;
  api.onSwipe=onSwipe;
  api.onFlip=onFlip;
  api.onClick=onClick;
  api.loading=stage.querySelector('.holo-loading')||stage.querySelector('#holo-loading');
  api.scene=new THREE.Scene();
  api.camera=new THREE.OrthographicCamera(-5,5,5.65,-5.65,.1,100);
  api.camera.position.set(0,0,20);
  api.camera.lookAt(0,0,0);
  api.renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});
  api.renderer.setClearColor(themeClear(),1);
  api.renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));
  api.renderer.outputColorSpace=THREE.SRGBColorSpace;
  api.renderer.toneMapping=THREE.NoToneMapping;
  api.renderer.toneMappingExposure=1;
  stage.append(api.renderer.domElement);
  api.composer=new EffectComposer(api.renderer);
  api.composer.addPass(new RenderPass(api.scene,api.camera));
  api.composer.addPass(new UnrealBloomPass(new THREE.Vector2(720,1000),.18,.35,1.0));
  api.composer.addPass(new OutputPass());
  api.loader=new THREE.TextureLoader();
  api.gltfLoader=new GLTFLoader();
  api.targetX=0.025;api.targetY=-0.13;api.targetZoom=1;
  api.rotationX=api.targetX;api.rotationY=api.targetY;
  api.auto=false;api.flipped=false;api.dragging=false;
  api.last={x:0,y:0};api.lastTime=0;api.elapsed=0;
  api.acc={x:0,y:0};
  bindPointer(stage);
  api.ro=new ResizeObserver(resize);api.ro.observe(stage);
  resize();
  api.renderer.setAnimationLoop(animate);
};

api.setTheme=function setTheme(){
  if(!api.renderer)return;
  api.renderer.setClearColor(themeClear(),1);
};

api.load=async function load(config){
  if(!api.renderer)throw new Error('Holo stage is not mounted.');
  api.config=config;
  if(api.loading){api.loading.hidden=false;api.loading.textContent='正在生成镭射卡';}
  const names=['subject','background','text','lineart'];
  const textures=await Promise.all(names.map(name=>api.loader.loadAsync(config.assets[name])));
  textures.forEach(t=>{t.colorSpace=THREE.NoColorSpace;t.anisotropy=Math.min(api.renderer.capabilities.getMaxAnisotropy(),8);});
  const prm=config.parameters||{};
  if(!api.uniforms){
    api.uniforms={
      tSubject:{value:textures[0]},tBackground:{value:textures[1]},tText:{value:textures[2]},tLine:{value:textures[3]},
      tBack:{value:backTexture(config)},uTime:{value:0},uView:{value:new THREE.Vector3(0,0,1)},
      uFoil:{value:prm.foil??1},uScale:{value:prm.subjectScale??1.08},uDepth:{value:prm.subjectDepth??.35},
      uBgDepth:{value:prm.backgroundDepth??-.22},uSafeScale:{value:config.safeArea?.scale??1.08},
      uSafeOffset:{value:new THREE.Vector2(...(config.safeArea?.offset??[0,0.02]))}
    };
    const frontMat=new THREE.ShaderMaterial({uniforms:api.uniforms,vertexShader:vertex,fragmentShader:fragment,side:THREE.FrontSide});
    const edgeMat=new THREE.ShaderMaterial({uniforms:api.uniforms,vertexShader:vertex,fragmentShader:edgeFragment});
    const backMat=new THREE.ShaderMaterial({uniforms:api.uniforms,vertexShader:vertex,fragmentShader:backFragment});
    const goldMat=new THREE.MeshBasicMaterial({color:0xbfa26b});
    const gltf=await api.gltfLoader.loadAsync(config.assets.model);
    api.root=new THREE.Group();api.root.add(gltf.scene);api.scene.add(api.root);
    gltf.scene.traverse(ob=>{
      if(!ob.isMesh)return;
      const role=ob.material?.name;
      if(role==='web_front'){ob.material=frontMat;api.face=ob;}
      else if(role==='web_back')ob.material=backMat;
      else if(role==='web_gold')ob.material=goldMat;
      else if(role==='web_text')ob.visible=false;
      else ob.material=edgeMat;
    });
    if(!api.face)throw new Error('The Blender model is missing the web_front material.');
    api.ready=true;
  }else{
    disposeTex(api.uniforms.tSubject.value);
    disposeTex(api.uniforms.tBackground.value);
    disposeTex(api.uniforms.tText.value);
    disposeTex(api.uniforms.tLine.value);
    disposeTex(api.uniforms.tBack.value);
    api.uniforms.tSubject.value=textures[0];
    api.uniforms.tBackground.value=textures[1];
    api.uniforms.tText.value=textures[2];
    api.uniforms.tLine.value=textures[3];
    api.uniforms.tBack.value=backTexture(config);
    api.uniforms.uFoil.value=prm.foil??1;
    api.uniforms.uScale.value=prm.subjectScale??1.08;
    api.uniforms.uDepth.value=prm.subjectDepth??.35;
    api.uniforms.uBgDepth.value=prm.backgroundDepth??-.22;
    api.uniforms.uSafeScale.value=config.safeArea?.scale??1.08;
    api.uniforms.uSafeOffset.value.set(...(config.safeArea?.offset??[0,0.02]));
  }
  api.reset();
  if(api.loading)api.loading.hidden=true;
};

api.reset=function reset(){
  api.targetX=.025;api.targetY=-.13;api.targetZoom=1;api.flipped=false;api.auto=false;
  resize();
};

api.flip=function flip(force){
  const next=typeof force==='boolean'?force:!api.flipped;
  if(next===api.flipped)return api.flipped;
  api.flipped=next;
  api.auto=false;
  api.targetY=api.flipped?Math.PI:0;
  api.targetX=0;
  if(api.onFlip)api.onFlip(api.flipped);
  return api.flipped;
};

api.setAuto=function setAuto(value){
  if(value && api.flipped)api.flip(false);
  api.auto=!!value;
  return api.auto;
};

function disposeTex(tex){if(tex&&tex.dispose)tex.dispose();}

function backTexture(config){
  const c=document.createElement('canvas');c.width=1024;c.height=1536;const ctx=c.getContext('2d');
  ctx.clearRect(0,0,1024,1536);
  ctx.fillStyle='rgba(255,255,255,.94)';ctx.fillRect(0,0,1024,1536);
  ctx.fillStyle='#161922';ctx.textAlign='left';
  ctx.font='700 28px "Noto Serif SC","Noto Sans SC",serif';
  ctx.fillText('X 帖子收藏卡',86,120);
  ctx.fillStyle='#2156A4';ctx.font='600 22px "Noto Sans SC",sans-serif';
  ctx.fillText(String(config.subtitle||''),86,180);
  ctx.fillStyle='#161922';ctx.font='700 64px "Noto Serif SC","Noto Sans SC",serif';
  wrapCanvasText(ctx,String(config.title||''),86,520,850,78);
  ctx.fillStyle='#5C6478';ctx.font='600 24px "Noto Sans SC",sans-serif';
  ctx.fillText(String(config.tagline||''),86,1280);
  ctx.fillText(String(config.technique||''),86,1328);
  ctx.font='600 20px "Noto Sans SC",sans-serif';
  ctx.fillText('编号 '+String(config.edition||''),86,1418);
  const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.NoColorSpace;return tex;
}

function bindPointer(stage){
  stage.addEventListener('pointerdown',e=>{
    if(e.button!==0)return;
    api.dragging=true;api.auto=false;
    api.last={x:e.clientX,y:e.clientY};api.acc={x:0,y:0};
    stage.setPointerCapture(e.pointerId);
    stage.focus({preventScroll:true});
  });
  stage.addEventListener('pointermove',e=>{
    if(!api.dragging)return;
    const dx=e.clientX-api.last.x,dy=e.clientY-api.last.y;
    api.acc.x+=dx;api.acc.y+=dy;
    const base=api.flipped?Math.PI:0;
    api.targetY=THREE.MathUtils.clamp(api.targetY+dx*.006,base-.65,base+.65);
    api.targetX=THREE.MathUtils.clamp(api.targetX+dy*.005,-.43,.43);
    api.last={x:e.clientX,y:e.clientY};
  });
  const up=e=>{
    if(!api.dragging)return;
    api.dragging=false;
    const ax=api.acc.x,ay=api.acc.y;
    if(Math.abs(ax)>72 && Math.abs(ax)>Math.abs(ay)*1.35){
      if(api.onSwipe)api.onSwipe(ax>0?-1:1);
      return;
    }
    if(Math.hypot(ax,ay)<8 && api.onClick)api.onClick();
  };
  stage.addEventListener('pointerup',up);
  stage.addEventListener('pointercancel',up);
  stage.addEventListener('lostpointercapture',up);
}

function resize(){
  const stage=api.stage,w=stage&&stage.clientWidth,h=stage&&stage.clientHeight;
  if(!w||!h||!api.renderer)return;
  const aspect=w/h;
  const halfH=5.65/api.targetZoom;
  api.camera.left=-halfH*aspect;api.camera.right=halfH*aspect;
  api.camera.top=halfH;api.camera.bottom=-halfH;
  api.camera.updateProjectionMatrix();
  api.renderer.setSize(w,h);api.composer.setSize(w,h);
}

function animate(now){
  if(!api.root||!api.uniforms)return;
  const dt=Math.min((now-api.lastTime)/1000,.1)||0;
  api.lastTime=now;
  if(!document.hidden)api.elapsed+=dt;
  if(api.auto){
    api.targetY=Math.sin(api.elapsed*.65)*.38;
    api.targetX=Math.sin(api.elapsed*.85)*.12;
  }
  const ease=reduced?1:1-Math.exp(-dt*8);
  api.rotationX+=(api.targetX-api.rotationX)*ease;
  api.rotationY+=(api.targetY-api.rotationY)*ease;
  api.root.rotation.set(api.rotationX,api.rotationY,0);
  api.root.updateMatrixWorld(true);
  api.uniforms.uView.value.copy(api.camera.position).applyMatrix4(new THREE.Matrix4().copy(api.root.matrixWorld).invert()).normalize();
  api.uniforms.uTime.value=reduced&&!api.auto?0:api.elapsed;
  api.composer.render();
}
