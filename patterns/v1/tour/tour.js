'use strict';
const canvas = document.querySelector('#scene');
const statusBox = document.querySelector('#status');
const T = window.THREE;
const spots = {
  kitchen: [-1.24, -.74, -.3, 2.55],
  window: [-3.51, .53, -1.6, 4.8],
  deck: [.62, 3.48, -1.7, .45]
};
const held = new Set();
let renderer, scene, camera, yaw = 0, pitch = -.12, ready = false, last = 0;
const eyeHeight = 1.51;
function selectSpot(name) {
  const [x,z,tx,tz] = spots[name];
  camera.position.set(x,eyeHeight - (z>1.2?.15:0),z);
  yaw = Math.atan2(x-tx,z-tz); pitch = name==='deck'?-.095:-.14;
  document.querySelectorAll('[data-spot]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.spot===name)));
}
function clearSelection(){document.querySelector('[data-spot][aria-pressed=true]')?.setAttribute('aria-pressed','false');}
function allowed(x,z){
  if(x < -5.78 || x > 5.78 || z < -.91 || z > 3.54) return false;
  if(z < 1.28 && Math.abs(x)>3.60) return false; // beds
  if(x>-.82 && x<3.06 && z<.54) return false; // kitchenette and bathroom
  if(z>.99 && z<1.32 && (x < -1.57 || x > -.65)) return false; // open sliding panel
  if(z>1.35 && z<3.05 && x>3.47) return false; // bath
  if(z>1.77 && z<3.32 && x>-3.54 && x<.14) return false; // outdoor seating
  if(z>1.68 && z<3.1 && x < -4.47) return false; // outdoor sink
  return true;
}
function step(dt){
  if(held.has('turnLeft'))yaw+=1.35*dt;
  if(held.has('turnRight'))yaw-=1.35*dt;
  const f=Number(held.has('up'))-Number(held.has('down'));
  const side=Number(held.has('right'))-Number(held.has('left'));
  if(f||side){
    const speed=dt*1.35/Math.hypot(f,side),p=camera.position;
    const dx=(-Math.sin(yaw)*f+Math.cos(yaw)*side)*speed;
    const dz=(-Math.cos(yaw)*f-Math.sin(yaw)*side)*speed;
    if(allowed(p.x+dx,p.z))p.x+=dx;
    if(allowed(p.x,p.z+dz))p.z+=dz;
    p.y=eyeHeight-.15*Math.max(0,Math.min(1,(p.z-1.08)/.26));clearSelection();
  }
  camera.rotation.set(pitch,yaw,0,'YXZ');
}
function resize(){const w=canvas.clientWidth,h=canvas.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.fov=w<h?87:69;camera.updateProjectionMatrix();}
function frame(time){if(!ready)return;step(Math.min(.045,(time-last)/1000));last=time;renderer.render(scene,camera);requestAnimationFrame(frame);}
function inputs(){
  let drag=null;
  canvas.onpointerdown=e=>{drag={id:e.pointerId,x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);canvas.focus({preventScroll:true});};
  canvas.onpointermove=e=>{if(!drag||drag.id!==e.pointerId)return;yaw-=(e.clientX-drag.x)*.004;pitch=Math.max(-1.2,Math.min(1.2,pitch-(e.clientY-drag.y)*.004));drag.x=e.clientX;drag.y=e.clientY;};
  canvas.onlostpointercapture=()=>drag=null;
  const keys={ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right',KeyW:'up',KeyS:'down',KeyA:'turnLeft',KeyD:'turnRight'};
  window.addEventListener('keydown',e=>{if(keys[e.code]){e.preventDefault();held.add(keys[e.code]);}});
  window.addEventListener('keyup',e=>held.delete(keys[e.code]));
  window.addEventListener('blur',()=>held.clear());
  document.querySelectorAll('[data-dir]').forEach(b=>{
    b.onpointerdown=e=>{e.preventDefault();b.setPointerCapture(e.pointerId);held.add(b.dataset.dir);};
    b.onlostpointercapture=()=>held.delete(b.dataset.dir);
    b.onclick=e=>{if(e.detail===0){held.add(b.dataset.dir);step(.15);held.delete(b.dataset.dir);}};
  });
  document.querySelectorAll('[data-spot]').forEach(b=>b.onclick=()=>selectSpot(b.dataset.spot));
}
function material(row, textures, env){
  const glass=row.name==='Clear glazing';
  if(glass || row.name.includes('ガラス天板') || row.name.includes('バスタブ_湯')){
    const water=row.name.includes('湯');
    return new T.MeshPhysicalMaterial({color:water?0xbfe1dc:0xf5fbff,metalness:0,roughness:water?.09:.035,transparent:true,opacity:water?.55:glass?.12:.24,depthWrite:false,side:T.FrontSide,envMap:env,envMapIntensity:glass?.9:.75});
  }
  const m=new T.MeshStandardMaterial({color:row.color,roughness:Math.max(.22,row.rough),metalness:Math.min(.75,row.metal),side:T.DoubleSide});
  if(row.map)m.map=textures[row.map.index];
  if(row.name.includes('linen')){m.color.setHex(0xfffaf1);m.roughness=.96;}
  if(row.name.includes('oak furniture'))m.color.setHex(0xb48d63);
  if(row.name.includes('Brushed steel')){m.envMap=env;m.envMapIntensity=.72;}
  if(row.name.includes('downlight'))m.emissive.setHex(0xffdbac);
  return m;
}
function meshFrom(row,buffer,mat){
  const v=new Int16Array(buffer,row.verts,row.vc*8),pos=new Float32Array(row.vc*3),norm=new Float32Array(row.vc*3),uv=new Float32Array(row.vc*2);
  for(let i=0;i<row.vc;i++){
    for(let k=0;k<3;k++){pos[i*3+k]=v[i*8+k]/2000;norm[i*3+k]=v[i*8+3+k]/4096;}
    uv[i*2]=v[i*8+6]/256;uv[i*2+1]=v[i*8+7]/256;
  }
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.BufferAttribute(pos,3));geo.setAttribute('normal',new T.BufferAttribute(norm,3));geo.setAttribute('uv',new T.BufferAttribute(uv,2));
  geo.setIndex(new T.BufferAttribute(row.wide?new Uint32Array(buffer,row.inds,row.ic):new Uint16Array(buffer,row.inds,row.ic),1));
  const mesh=new T.Mesh(geo,mat);mesh.name=row.name;mesh.castShadow=!mat.transparent;mesh.receiveShadow=true;return mesh;
}
function addInteriorDetails(env) {
  const surface=(color,roughness,metalness=0)=>new T.MeshStandardMaterial({color,roughness,metalness,envMap:metalness?env:null,envMapIntensity:.75});
  const timber=surface(0xad8258,.55),stone=surface(0xe3dfd7,.37),steel=surface(0x9aabad,.29,.72),dark=surface(0x343d40,.27,.58);
  const cloth=surface(0xe9e3d6,.96);
  function box(x,y,z,w,h,d,mat){const m=new T.Mesh(new T.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);m.castShadow=m.receiveShadow=true;scene.add(m);return m;}
  function rod(a,b,r,mat){const start=new T.Vector3(...a),end=new T.Vector3(...b),dir=end.clone().sub(start);const m=new T.Mesh(new T.CylinderGeometry(r,r,dir.length(),18),mat);m.position.copy(start).lerp(end,.5);m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),dir.normalize());m.castShadow=true;scene.add(m);}
  // Four pieces of worktop around the actual stainless-steel recess.
  box(-.623,.87,-.335,.088,.04,1.43,stone);box(-.154,.87,-.335,.094,.04,1.43,stone);
  box(-.39,.87,-.606,.378,.04,.89,stone);box(-.39,.87,.313,.378,.04,.134,stone);
  box(-.39,.705,.043,.378,.01,.41,steel);box(-.579,.79,.043,.008,.185,.41,steel);box(-.201,.79,.043,.008,.185,.41,steel);
  box(-.39,.79,-.162,.378,.185,.008,steel);box(-.39,.79,.248,.378,.185,.008,steel);
  const drain=new T.Mesh(new T.CylinderGeometry(.026,.026,.002,24),dark);drain.position.set(-.39,.712,.05);scene.add(drain);
  rod([-.158,.89,.045],[-.158,1.159,.045],.015,dark);rod([-.158,1.159,.045],[-.371,1.159,.045],.015,dark);rod([-.371,1.159,.045],[-.371,1.116,.045],.015,dark);
  // Open cabinet shell underneath the basin, keeping the plan dimensions.
  box(-.383,.345,-.335,.54,.69,1.43,timber);box(-.651,.425,-.335,.012,.85,1.43,timber);
  function bedding(x,y,z,w,h,d,r,pillow){
    const g=new T.BoxGeometry(w,h,d,24,8,20),a=g.attributes.position,half=new T.Vector3(w/2,h/2,d/2),v=new T.Vector3(),c=new T.Vector3();
    for(let i=0;i<a.count;i++){v.fromBufferAttribute(a,i);c.set(T.MathUtils.clamp(v.x,-half.x+r,half.x-r),T.MathUtils.clamp(v.y,-half.y+r,half.y-r),T.MathUtils.clamp(v.z,-half.z+r,half.z-r));v.sub(c).normalize().multiplyScalar(r).add(c);const u=v.x/half.x,k=v.z/half.z;
      if(v.y>0)v.y+=(pillow?.055:.013)*(1-u*u)*(1-k*k)+.006*Math.sin(21*u+3*Math.sin(3*k))*Math.cos(8*k)*(1-u*u);
      a.setXYZ(i,v.x,v.y,v.z);}
    g.computeVertexNormals();const m=new T.Mesh(g,cloth);m.position.set(x,y,z);m.castShadow=m.receiveShadow=true;scene.add(m);
  }
  for(const sign of [-1,1]){bedding(sign*4.757,.41,.115,1.96,.22,1.76,.07,false);bedding(sign*4.387,.555,.115,1.28,.11,1.81,.05,false);for(const z of [-.315,.545])bedding(sign*5.467,.598,z,.45,.15,.70,.073,true);}
}
function oakTexture(){
  const c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d'),p=ctx.createImageData(256,256);
  for(let y=0;y<256;y++)for(let x=0;x<256;x++){const i=4*(256*y+x),g=7*Math.sin(.38*y+1.2*Math.sin(x*.023)+.55*Math.sin(.11*y)) + 4*Math.cos(1.17*y+.8*Math.sin(.03*x));p.data.set([191+g,157+g,120+g,255],i);}
  ctx.putImageData(p,0,0);const tex=new T.CanvasTexture(c);tex.encoding=T.sRGBEncoding;tex.wrapS=tex.wrapT=T.RepeatWrapping;return tex;
}
function seaBackdrop(env,photo){
  const sphere=new T.Mesh(new T.SphereGeometry(95,40,24),new T.ShaderMaterial({
    side:T.BackSide,depthWrite:false,uniforms:{sky:{value:env},sea:{value:photo}},
    vertexShader:`varying vec3 dir;void main(){dir=position;gl_Position=projectionMatrix*viewMatrix*modelMatrix*vec4(position,1.);}`,
    fragmentShader:`uniform samplerCube sky;uniform sampler2D sea;varying vec3 dir;void main(){vec3 d=normalize(dir);vec3 bg=textureCube(sky,vec3(-d.x,d.yz)).rgb;float a=atan(d.x,d.z);float y=asin(d.y);vec2 uv=vec2(.5-a/3.15,.507+y/1.45);float mixSea=(1.-smoothstep(.94,1.52,abs(a)))*(1.-smoothstep(.53,.71,abs(y)));gl_FragColor=vec4(mix(bg,texture2D(sea,clamp(uv,0.,1.)).rgb,mixSea),1.);}`
  }));sphere.renderOrder=-100;sphere.frustumCulled=false;sphere.onBeforeRender=()=>sphere.position.copy(camera.position);scene.add(sphere);
}
function facadeGlass(env){
  return new T.ShaderMaterial({transparent:true,depthWrite:false,side:T.DoubleSide,uniforms:{sky:{value:env}},vertexShader:`varying vec3 world;varying vec3 normalW;void main(){vec4 w=modelMatrix*vec4(position,1.);world=w.xyz;normalW=mat3(modelMatrix)*normal;gl_Position=projectionMatrix*viewMatrix*w;}`,fragmentShader:`uniform samplerCube sky;varying vec3 world;varying vec3 normalW;void main(){vec3 ray=normalize(world-cameraPosition);vec3 n=normalize(normalW);vec3 refl=reflect(ray,n);vec3 color=textureCube(sky,vec3(-refl.x,refl.yz)).rgb;float grazing=pow(1.-abs(dot(n,ray)),3.);gl_FragColor=vec4(color,0.065+.21*grazing);}`});
}
async function fetchModel(){
  const bytes=await (await fetchAsset('room.bin.gz')).arrayBuffer();
  if(new Uint8Array(bytes)[0]!==31)return bytes;
  return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
}
async function fetchAsset(file){const r=await fetch(file);if(!r.ok)throw Error(file);return r;}
async function load(){
  renderer=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.outputEncoding=T.sRGBEncoding;
  renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.94;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;
  scene=new T.Scene();camera=new T.PerspectiveCamera(69,1,.035,160);
  const loader=new T.TextureLoader();
  const [rows,buffer,env]=await Promise.all([fetchAsset('room.json').then(r=>r.json()),fetchModel(),new T.CubeTextureLoader().loadAsync([1,0,2,3,4,5].map(i=>'view-'+i+'.jpg'))]);
  env.encoding=T.sRGBEncoding;scene.background=env;
  const textures={};await Promise.all(rows.filter(r=>r.map).map(async r=>{const m=r.map,t=await loader.loadAsync('surface-'+m.index+'.jpg');t.encoding=T.sRGBEncoding;t.wrapS=t.wrapT=T.RepeatWrapping;t.repeat.fromArray(m.repeat);t.flipY=m.flipY;t.anisotropy=4;textures[m.index]=t;}));
    const wood=oakTexture();rows.forEach(r=>{const m=r.name==='Clear glazing'?facadeGlass(env):material(r,textures,env);if(r.name==='Light oak furniture'){m.color.setHex(0xffffff);m.map=wood;}scene.add(meshFrom(r,buffer,m));});
    const grass=await loader.loadAsync('lawn.jpg');grass.encoding=T.sRGBEncoding;grass.wrapS=grass.wrapT=T.RepeatWrapping;grass.repeat.set(8,6);
  const garden=new T.Mesh(new T.PlaneGeometry(21,13),new T.MeshStandardMaterial({map:grass,color:0xa6bd79,roughness:1}));garden.rotation.x=-Math.PI/2;garden.position.set(0,-.95,8);garden.receiveShadow=true;scene.add(garden);
  addInteriorDetails(env);seaBackdrop(env,await loader.loadAsync("reef.jpg"));
  scene.add(new T.HemisphereLight(0xfff6e5,0x839397,.83));
  const sun=new T.DirectionalLight(0xffedce,1.18);sun.position.set(-4,7,6);sun.castShadow=true;Object.assign(sun.shadow.camera,{left:-9,right:9,top:8,bottom:-8,near:.1,far:25});sun.shadow.mapSize.set(2048,2048);sun.shadow.normalBias=.012;sun.shadow.bias=-.00018;scene.add(sun);
  const fill=new T.DirectionalLight(0xc1eaff,.67);fill.position.set(2,2,5);scene.add(fill);
  renderer.shadowMap.needsUpdate=true;selectSpot('kitchen');resize();inputs();window.addEventListener('resize',resize);
  statusBox.hidden=true;ready=true;last=performance.now();requestAnimationFrame(frame);
}
load().catch(e=>{console.error(e);statusBox.innerHTML='3D内覧を読み込めませんでした。<br><a href="../room.html#equipment">客室の写真を見る</a>';});
