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
let updateMirror;
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
function frame(time){if(!ready)return;step(Math.min(.045,(time-last)/1000));last=time;updateMirror();renderer.render(scene,camera);requestAnimationFrame(frame);}
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
    return new T.MeshPhysicalMaterial({color:water?0xbfe1dc:0xf5fbff,metalness:0,roughness:water?.09:.035,transparent:true,opacity:water?.55:glass?.12:.30,depthWrite:false,side:T.FrontSide,envMap:env,envMapIntensity:glass?.9:.75});
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
  const timber=surface(0xad8258,.55),stone=surface(0xe3dfd7,.37),steel=surface(0xe1ded8,.185,.94),dark=surface(0x343d40,.27,.58);
  steel.name="Brushed basin";
  const cloth=surface(0xf6efe3,.96);cloth.name="Bedding";timber.name="Cabinet oak";
  function box(x,y,z,w,h,d,mat){const m=new T.Mesh(new T.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);m.castShadow=m.receiveShadow=true;scene.add(m);return m;}
  function rod(a,b,r,mat){const start=new T.Vector3(...a),end=new T.Vector3(...b),dir=end.clone().sub(start);const m=new T.Mesh(new T.CylinderGeometry(r,r,dir.length(),18),mat);m.position.copy(start).lerp(end,.5);m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),dir.normalize());m.castShadow=true;scene.add(m);}
  // Four pieces of worktop around the actual stainless-steel recess.
  box(-.623,.87,-.335,.088,.04,1.43,stone);box(-.154,.87,-.335,.094,.04,1.43,stone);
  box(-.39,.87,-.606,.378,.04,.89,stone);box(-.39,.87,.313,.378,.04,.134,stone);
  // Concentric rounded rings form the pressed steel lip, sloping sides and basin floor.
  const basinVertices=[],basinFaces=[];
  const rings=[[.197,.214,.008,.893],[.185,.201,.034,.895],[.177,.193,.037,.888],[.171,.187,.041,.875],[.152,.167,.045,.746],[.142,.157,.047,.727],[.126,.141,.048,.721],[.021,.021,.019,.713]];
  rings.forEach(([w,d,r,y],row)=>{
    for(let corner=0;corner<4;corner++){
      const sx=corner===0||corner===3?1:-1,sz=corner<2?1:-1;
      for(let j=0;j<=8;j++){
        const angle=(corner+j/8)*Math.PI/2;
        basinVertices.push(-.39+sx*(w-r)+r*Math.cos(angle),y,.043+sz*(d-r)+r*Math.sin(angle));
        const col=corner*9+j,i=row*36+col,next=row*36+(col+1)%36;
        if(row)basinFaces.push(i-36,i,next-36,next-36,i,next);
      }
    }
  });
  const bowlGeometry=new T.BufferGeometry();
  bowlGeometry.setAttribute('position',new T.Float32BufferAttribute(basinVertices,3));
  bowlGeometry.setIndex(basinFaces);bowlGeometry.computeVertexNormals();steel.side=T.DoubleSide;
  const bowl=new T.Mesh(bowlGeometry,steel);bowl.receiveShadow=true;scene.add(bowl);
  const drain=new T.Mesh(new T.CylinderGeometry(.023,.023,.003,32),dark);drain.position.set(-.39,.712,.043);scene.add(drain);
  const spout=new T.CurvePath(),point=(x,y)=>new T.Vector3(x,y,.045);
  spout.add(new T.LineCurve3(point(-.158,.892),point(-.158,1.079)));
  spout.add(new T.CubicBezierCurve3(point(-.158,1.079),point(-.158,1.227),point(-.365,1.227),point(-.365,1.107)));
  const tap=new T.Mesh(new T.TubeGeometry(spout,64,.013,20,false),steel);tap.castShadow=true;scene.add(tap);
  rod([-.158,.89,.045],[-.158,.962,.045],.020,steel);
  rod([-.158,.947,.045],[-.158,.979,.105],.005,steel);
  // Open cabinet shell underneath the basin, keeping the plan dimensions.
  box(-.383,.345,-.335,.54,.69,1.43,timber);box(-.651,.425,-.335,.012,.85,1.43,timber);
  // A rounded pull and slim door reveals read at the closest kitchen viewpoint.
  const trim=surface(0x4a4034,.66);
  // Close the cabinet front up to the underside of the counter.
  box(-.381,.765,.373,.531,.169,.012,timber);
  box(-.381,.41,.373,.531,.54,.012,timber);
  box(-.381,.074,.356,.49,.145,.012,trim);
  box(-.660,.43,-.24,.003,.76,.005,trim);
  rod([-.676,.753,-.43],[-.676,.753,-.63],.005,dark);
  for(const z of [-.43,-.63])rod([-.661,.753,z],[-.676,.753,z],.004,dark);
  // Mortised doors in the existing openings, with slim jambs and a lever at hand height.
  for(const start of [.068,1.011]){
    for(const x of [start-.012,start+.742])box(x,.982,.349,.023,1.96,.018,timber);
    box(start+.365,1.964,.349,.777,.024,.018,timber);
    const handleX=start+.622;
    rod([handleX,.96,.345],[handleX,.96,.388],.016,dark);
    rod([handleX,.96,.388],[handleX-.098,.96,.388],.009,dark);
  }
  // Polished cut glass is darker along the thickness of the slab.
  const glassEdge=new T.MeshPhysicalMaterial({color:0x729694,transparent:true,opacity:.70,roughness:.17,metalness:.12});
  for(const x of [-2.071,-1.431])box(x,.444,2.679,.003,.012,1.47,glassEdge);
  for(const z of [1.944,3.414])box(-1.751,.444,z,.64,.012,.003,glassEdge);
  // A removable cutting board and lime give the compact worktop an everyday scale.
  const board=box(-.392,.901,-.39,.29,.018,.34,timber);board.rotation.y=.055;
  const peel=surface(0x809438,.7);
  const fruit=new T.Mesh(new T.SphereGeometry(.030,24,16),peel);
  fruit.position.set(-.429,.94,-.40);fruit.scale.set(1.13,1,.97);fruit.rotation.z=.24;fruit.castShadow=fruit.receiveShadow=true;scene.add(fruit);

  function bedding(x,y,z,w,h,d,r,pillow){
    const g=new T.BoxGeometry(w,h,d,24,8,20),a=g.attributes.position,half=new T.Vector3(w/2,h/2,d/2),v=new T.Vector3(),c=new T.Vector3();
    for(let i=0;i<a.count;i++){v.fromBufferAttribute(a,i);c.set(T.MathUtils.clamp(v.x,-half.x+r,half.x-r),T.MathUtils.clamp(v.y,-half.y+r,half.y-r),T.MathUtils.clamp(v.z,-half.z+r,half.z-r));v.sub(c).normalize().multiplyScalar(r).add(c);const u=v.x/half.x,k=v.z/half.z;
      if(v.y>0)v.y+=(pillow?.085:.027)*(1-u*u)*(1-k*k)+.011*Math.sin(19*u+2.6*Math.sin(4*k)+1.8*k)*Math.cos(6*k)*(1-u*u)+.006*Math.sin(13*k+4*u)*(1-k*k);
      a.setXYZ(i,v.x,v.y,v.z);}
    g.computeVertexNormals();const m=new T.Mesh(g,cloth);m.position.set(x,y,z);m.castShadow=m.receiveShadow=true;scene.add(m);
  }
  for(const sign of [-1,1]){bedding(sign*4.757,.41,.115,1.96,.22,1.76,.07,false);bedding(sign*4.387,.555,.115,1.28,.11,1.81,.05,false);for(const z of [-.315,.545])bedding(sign*5.467,.615,z,.49,.18,.72,.087,true);}
}
async function loadFinishes(loader){
  const files={fabric:'linen-weave.jpg',oak:'oak-grain.jpg',oakNormal:'oak-normal.jpg',deck:'deck-plank.jpg',deckNormal:'deck-normal.jpg',linen:'linen-normal.jpg',daylight:'daylight.png'};
  const entries=await Promise.all(Object.entries(files).map(async ([key,file])=>{
    const texture=await loader.loadAsync(file);
    if(key==='daylight'){texture.flipY=false;texture.generateMipmaps=false;texture.minFilter=T.LinearFilter;}
    else{texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());}
    if(key==='oak'||key==='deck')texture.encoding=T.sRGBEncoding;
    if(key==='linen'||key==='fabric')texture.repeat.set(3,3);
    if(key==='fabric')texture.encoding=T.sRGBEncoding;
    return [key,texture];
  }));
  return Object.fromEntries(entries);
}
// The offline visibility field gives broad surfaces indirect shade at walls and under furniture.
function shadeFromRoom(material,daylight){
  material.onBeforeCompile=shader=>{
    shader.uniforms.daylightField={value:daylight};
    shader.vertexShader='varying vec3 roomPoint;\n'+shader.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\nroomPoint=(modelMatrix*vec4(transformed,1.)).xyz;');
    shader.fragmentShader=`varying vec3 roomPoint;
uniform sampler2D daylightField;
float lightNoise(vec2 p){
 vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);
 return mix(mix(fract(sin(dot(i,vec2(41.7,157.3)))*4375.2),fract(sin(dot(i+vec2(1,0),vec2(41.7,157.3)))*4375.2),f.x),
 mix(fract(sin(dot(i+vec2(0,1),vec2(41.7,157.3)))*4375.2),fract(sin(dot(i+1.,vec2(41.7,157.3)))*4375.2),f.x),f.y);
}
vec3 lightSlice(vec3 grid,float layer){
  vec2 tile=vec2(mod(layer,8.)*192.,floor(layer/8.)*96.);
  return texture2D(daylightField,(tile+grid.xz+.5)/vec2(1536.,768.)).rgb;
}
`+shader.fragmentShader.replace('#include <lights_fragment_end>',`#include <lights_fragment_end>
vec3 worldN=inverseTransformDirection(normal,viewMatrix);
vec3 grid=clamp((roomPoint+worldN*.085-vec3(-6.69,-1.17,-1.71))/.07,vec3(0.),vec3(191.,63.,95.));
vec3 vis=mix(lightSlice(grid,floor(grid.y)),lightSlice(grid,min(63.,floor(grid.y)+1.)),fract(grid.y));
float contact=mix(.45,1.,smoothstep(.08,.96,vis.r));
reflectedLight.indirectDiffuse*=contact*(.32+.40*vis.g+.28*vis.b);
reflectedLight.indirectSpecular*=.61+.39*vis.g;
vec2 sunPlane=roomPoint.xz-vec2(-.8,1.4)*roomPoint.y;
float canopyNoise=.50*lightNoise(sunPlane*1.35)+.29*lightNoise(sunPlane*3.5)+.15*lightNoise(sunPlane*8.)+.06*lightNoise(sunPlane*15.);
float branch=smoothstep(.43,.66,canopyNoise)*(1.-smoothstep(2.5,6.3,abs(sunPlane.x+2.)));
float sunTransmission=1.-mix(.63,.24,smoothstep(3.55,4.15,roomPoint.z))*branch;
reflectedLight.directDiffuse*=(.84+.16*contact)*sunTransmission;
reflectedLight.directSpecular*=sunTransmission;
if(roomPoint.z<1.14 && abs(roomPoint.x)<5.85 && roomPoint.y>0. && roomPoint.y<2.15){
 float nearFloor=smoothstep(.02,1.04,roomPoint.y);
 float roofShade=1.-smoothstep(1.46,2.1,roomPoint.y);
 float reveal=.65+.35*nearFloor*roofShade;
 reflectedLight.indirectDiffuse*=mix(vec3(.77,.83,.91),vec3(1.),reveal*vis.g);
}`);
  };
}
// Rebuild the soft pieces on the footprint of each cushion in the source model.
function tailorCushions(mesh,assets){
  const p=mesh.geometry.attributes.position,blue=mesh.name.includes('藍');
  const cloth=mesh.material.clone();cloth.color.setHex(blue?0x304768:0xe0d5bf);
  cloth.map=assets.fabric;cloth.normalMap=assets.linen;cloth.roughness=.96;cloth.normalScale.set(.29,.29);
  const seam=cloth.clone();seam.color.multiplyScalar(.74);
  const count=332,group=new T.Group();group.name='Upholstery';
  for(let first=0;first<p.count;first+=count){
    const bounds=new T.Box3(),point=new T.Vector3();
    for(let i=first;i<first+count;i++)bounds.expandByPoint(point.fromBufferAttribute(p,i));
    const center=bounds.getCenter(new T.Vector3()),extent=bounds.getSize(new T.Vector3());
    const seat=extent.x>.4,w=seat?extent.x:extent.y,h=seat?extent.y:extent.x,d=extent.z;
    const sign=center.x<-1.75?1:-1,seed=first/count+.72;
    const panel=new T.Group();panel.position.copy(center);
    if(!seat)panel.rotation.z=-sign*(Math.PI/2+(blue?.18:.095));
    if(blue){panel.rotation.x=.055*Math.sin(seed*3);panel.rotation.y=.045*Math.cos(seed*2);}
    const g=new T.BoxGeometry(w,h,d,24,12,26),a=g.attributes.position,n=new T.Vector3(),v=new T.Vector3();
    const r=Math.min(h*.42,.052);
    for(let i=0;i<a.count;i++){
      v.fromBufferAttribute(a,i);
      n.set(T.MathUtils.clamp(v.x,-w/2+r,w/2-r),T.MathUtils.clamp(v.y,-h/2+r,h/2-r),T.MathUtils.clamp(v.z,-d/2+r,d/2-r));
      v.sub(n).normalize().multiplyScalar(r).add(n);
      const u=2*v.x/w,k=2*v.z/d,edge=Math.max(0,1-u*u)*Math.max(0,1-k*k);
      const tuck=.008*Math.cos(k*23+seed+4*u)*Math.pow(Math.abs(u),3)*(1-k*k);
      v.y+=Math.sign(v.y)*Math.min(1,2*Math.abs(v.y)/h)*((blue?.055:.026)*edge+tuck);
      a.setXYZ(i,v.x,v.y,v.z);
    }
    g.computeVertexNormals();const cushion=new T.Mesh(g,cloth);cushion.castShadow=cushion.receiveShadow=true;panel.add(cushion);
    const loop=[];
    for(let corner=0;corner<4;corner++){
      const sx=corner===0||corner===3?1:-1,sz=corner<2?1:-1;
      for(let j=0;j<=5;j++){const ang=(corner+j/5)*Math.PI/2;
        loop.push(new T.Vector3(sx*(w/2-r)+r*Math.cos(ang),h*.19,sz*(d/2-r)+r*Math.sin(ang)));}
    }
    const path=new T.CurvePath();loop.forEach((v,i)=>path.add(new T.LineCurve3(v,loop[(i+1)%loop.length])));
    panel.add(new T.Mesh(new T.TubeGeometry(path,112,.0024,5,true),seam));group.add(panel);
  }
  scene.add(group);mesh.visible=false;
}


function realFinishes(mesh,assets){
  const m=mesh.material;
  if(!m.isMeshStandardMaterial)return;
  if(mesh.name==='人工木_グレー_WPC'||mesh.name==='Charcoal composite boards'){
    const g=mesh.geometry,p=g.attributes.position,n=g.attributes.normal,uv=g.attributes.uv;
    for(let i=0;i<p.count;i++){
      const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
      if(Math.abs(n.getY(i))>.65)uv.setXY(i,x/2.5,z/1.25);
      else if(Math.abs(n.getZ(i))>.65)uv.setXY(i,x/2.5,y/1.25);
      else uv.setXY(i,z/2.5,y/1.25);
    }
    m.map=assets.deck;m.normalMap=assets.deckNormal;m.normalScale.set(.42,.42);m.color.setHex(mesh.name==='Charcoal composite boards'?0xbbaca2:0xffffff);m.roughness=.79;
  }
  if(mesh.name==='Light oak furniture'||m.name==='Cabinet oak'){
    m.map=assets.oak;m.normalMap=assets.oakNormal;m.normalScale.set(.23,.23);m.color.setHex(0xffffff);m.roughness=.53;
  }
  if(mesh.name.includes('クッション')||m.name==='Bedding'){
    m.normalMap=assets.linen;m.normalScale.set(.16,.16);m.roughness=.93;
  }
  if(!m.transparent)shadeFromRoom(m,assets.daylight);
  if(m.name==='Brushed basin'){
    const lighting=m.onBeforeCompile;
    m.onBeforeCompile=shader=>{
      lighting(shader);
      shader.fragmentShader=shader.fragmentShader.replace('#include <output_fragment>',`
      vec3 reflectedRay=reflect(normalize(roomPoint-cameraPosition),worldN);
      float distanceToWindow=(1.15-roomPoint.z)/max(.001,reflectedRay.z);
      vec3 hit=roomPoint+reflectedRay*distanceToWindow;
      float opening=smoothstep(.06,.27,hit.y)*(1.-smoothstep(1.75,2.01,hit.y))*(1.-smoothstep(5.5,5.8,abs(hit.x)))*smoothstep(.02,.16,reflectedRay.z);
      float mullion=smoothstep(.016,.07,abs(fract((hit.x+.17)/1.17)-.5));
      outgoingLight+=vec3(.76,.85,.96)*opening*(.3+.7*mullion);
      #include <output_fragment>`);
    };
  }
  if(['Porcelain white FRP','f5f4ef','Matching white satin canopy'].includes(mesh.name)){
    const lighting=m.onBeforeCompile;
    m.onBeforeCompile=shader=>{
      lighting(shader);
      shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
      vec2 face=vec2(roomPoint.x+roomPoint.z,roomPoint.y);
      float stipple=.55*lightNoise(face*56.)+.45*lightNoise(face*203.);
      float bloom=lightNoise(face*2.18);
      diffuseColor.rgb*=vec3(.956,.946,.929)*(.90+.095*stipple+.067*bloom);
      `);
    };
  }
  if(m.name==='Lawn'){
    const lighting=m.onBeforeCompile;
    m.onBeforeCompile=shader=>{
      lighting(shader);
      shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
      vec2 g=roomPoint.xz;
      float mottling=.45*sin(g.x*1.17+.8*sin(g.y*.63))+.32*sin(g.y*1.75+g.x*.38)+.23*cos(g.x*2.8-g.y*.92);
      diffuseColor.rgb*=vec3(.98+.064*mottling,.95+.045*mottling,.85+.055*mottling);
      `);
    };
  }
}
function seaBackdrop(env,photo){
  const sphere=new T.Mesh(new T.SphereGeometry(95,40,24),new T.ShaderMaterial({
    side:T.BackSide,depthWrite:false,uniforms:{sky:{value:env},sea:{value:photo}},
    vertexShader:`varying vec3 dir;void main(){dir=position;gl_Position=projectionMatrix*viewMatrix*modelMatrix*vec4(position,1.);}`,
    fragmentShader:`uniform samplerCube sky;uniform sampler2D sea;varying vec3 dir;void main(){vec3 d=normalize(dir);vec3 bg=textureCube(sky,vec3(-d.x,d.yz)).rgb;float a=atan(d.x,d.z);float y=asin(d.y);vec2 uv=vec2(.5-a/3.15,max(.205,.507+y/1.10));float mixSea=(1.-smoothstep(.94,1.52,abs(a)))*(1.-smoothstep(.53,.71,abs(y)));gl_FragColor=vec4(mix(bg,texture2D(sea,clamp(uv,0.,1.)).rgb,mixSea),1.);}`
  }));sphere.renderOrder=-100;sphere.frustumCulled=false;scene.add(sphere);
}
function architecturalGlass(horizontal=false){
  return new T.ShaderMaterial({
    transparent:true,depthWrite:false,side:T.FrontSide,
    uniforms:{mirror:{value:null},viewport:{value:new T.Vector2(1,1)},horizontal:{value:horizontal?1:0}},
    vertexShader:`varying vec3 world;void main(){world=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(world,1.);}`,
    fragmentShader:`uniform sampler2D mirror;uniform vec2 viewport;uniform float horizontal;varying vec3 world;void main(){
      vec2 uv=gl_FragCoord.xy/viewport; vec3 ray=normalize(cameraPosition-world);
      float fresnel=mix(.033,.105,step(1.16,cameraPosition.z))+.58*pow(1.-abs(ray.z),5.);
      vec3 reflection=texture2D(mirror,vec2(1.-uv.x,uv.y)).rgb;
      if(horizontal>.5){
        fresnel=.115+.77*pow(1.-abs(ray.y),2.65);
        reflection=mix(reflection,vec3(.66,.83,.89),.10);
      }
      gl_FragColor=vec4(reflection,fresnel);
    }`
  });
}
// Render the observer's side of the facade only. The real room is reflected from indoors.
function installPlanarMirror(glass,axis,planePosition){
  const target=new T.WebGLRenderTarget(1,1),mirror=new T.PerspectiveCamera();
  const front=new T.Vector3(),up=new T.Vector3(),size=new T.Vector2();
  const clip=new T.Plane(),previous=new T.Matrix4(),previousProjection=new T.Matrix4();
  target.texture.encoding=T.sRGBEncoding;
  glass.material.uniforms.mirror.value=target.texture;
  return ()=>{
    camera.updateMatrixWorld();
    renderer.getDrawingBufferSize(size);
    const w=Math.max(1,Math.round(size.x*.55)),h=Math.max(1,Math.round(size.y*.55));
    if(target.width===w && target.height===h && previous.equals(camera.matrixWorld) && previousProjection.equals(camera.projectionMatrix))return;
    previous.copy(camera.matrixWorld);previousProjection.copy(camera.projectionMatrix);
    target.setSize(w,h);glass.material.uniforms.viewport.value.copy(size);
    mirror.position.copy(camera.position);mirror.position[axis]=2*planePosition-camera.position[axis];
    camera.getWorldDirection(front);front[axis]*=-1;
    up.set(0,1,0).applyQuaternion(camera.quaternion);up[axis]*=-1;
    mirror.up.copy(up);mirror.lookAt(front.add(mirror.position));
    mirror.projectionMatrix.copy(camera.projectionMatrix);mirror.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
    const sign=camera.position[axis]>planePosition?1:-1;
    clip.setComponents(0,axis==='y'?sign:0,axis==='z'?sign:0,-sign*planePosition+.004);
    glass.visible=false;renderer.clippingPlanes=[clip];renderer.setRenderTarget(target);
    renderer.render(scene,mirror);renderer.setRenderTarget(null);renderer.clippingPlanes=[];glass.visible=true;
  };
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
  const finishes=await loadFinishes(loader);
  rows.forEach(r=>{const mat=r.name==='Clear glazing'?architecturalGlass():r.name==='テーブル_ガラス天板'?architecturalGlass(true):material(r,textures,env);scene.add(meshFrom(r,buffer,mat));});
    const grass=await loader.loadAsync('lawn.jpg');grass.encoding=T.sRGBEncoding;grass.wrapS=grass.wrapT=T.RepeatWrapping;grass.repeat.set(8,6);
  const garden=new T.Mesh(new T.PlaneGeometry(21,9.5),new T.MeshStandardMaterial({map:grass,color:0xa6bd79,roughness:1}));garden.rotation.x=-Math.PI/2;garden.position.set(0,-.95,6.2);garden.receiveShadow=true;scene.add(garden);
  garden.material.name='Lawn';
  addInteriorDetails(env);seaBackdrop(env,await loader.loadAsync("reef.jpg"));
  scene.add(new T.HemisphereLight(0xfff6e5,0x839397,.83));
  const sun=new T.DirectionalLight(0xffecd3,1.46);sun.position.set(-4,5,7);sun.castShadow=true;Object.assign(sun.shadow.camera,{left:-9,right:9,top:8,bottom:-8,near:.1,far:25});sun.shadow.mapSize.set(2048,2048);sun.shadow.normalBias=.012;sun.shadow.bias=-.00018;scene.add(sun);
  const fill=new T.DirectionalLight(0xc1eaff,.31);fill.position.set(2,2,5);scene.add(fill);
  for(const piece of scene.children.slice())if(piece.name.includes('クッション'))tailorCushions(piece,finishes);
  scene.traverse(o=>{if(o.isMesh)realFinishes(o,finishes);});
  sun.shadow.camera.updateProjectionMatrix();
  // Capture the actual room once for metal reflections; no per-frame cube rendering.
  const probeTarget=new T.WebGLCubeRenderTarget(128,{generateMipmaps:true,minFilter:T.LinearMipmapLinearFilter});
  const probe=new T.CubeCamera(.04,115,probeTarget);probe.position.set(-1.0,1.32,-.31);
  renderer.shadowMap.needsUpdate=true;probe.update(renderer,scene);
  const pmrem=new T.PMREMGenerator(renderer);const reflection=pmrem.fromCubemap(probeTarget.texture);
  scene.traverse(o=>{const m=o.material;if(m?.isMeshStandardMaterial && m.metalness>.37){m.envMap=reflection.texture;m.envMapIntensity=1.25;m.needsUpdate=true;}});
  pmrem.dispose();probeTarget.dispose();
  const facadeMirror=installPlanarMirror(scene.getObjectByName("Clear glazing"),'z',1.156);
  const tableMirror=installPlanarMirror(scene.getObjectByName("テーブル_ガラス天板"),'y',.45);
  updateMirror=()=>{facadeMirror();tableMirror();};
  renderer.shadowMap.needsUpdate=true;selectSpot('kitchen');resize();inputs();window.addEventListener('resize',resize);
  statusBox.hidden=true;ready=true;last=performance.now();requestAnimationFrame(frame);
}
load().catch(e=>{console.error(e);statusBox.innerHTML='3D内覧を読み込めませんでした。<br><a href="../room.html#equipment">客室の写真を見る</a>';});
