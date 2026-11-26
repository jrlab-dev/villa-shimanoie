'use strict';
const canvas = document.querySelector('#scene');
const statusBox = document.querySelector('#status');
const T = window.THREE;
const spots = {
  coast: [-3.80, 2.29, -5.70, 2.69],
  clerestory: [-1.58, .68, -1.58, -1.12],
  kitchen: [-1.24, -.90, -.18, 2.36],
  window: [-3.51, .53, -1.6, 4.8],
  deck: [.62, 3.48, -1.7, .45]
};
const held = new Set();
let updateMirror,seaTime;
let renderer, scene, camera, yaw = 0, pitch = -.12, ready = false, last = 0;
const eyeHeight = 1.51;
function selectSpot(name) {
  const [x,z,tx,tz] = spots[name];
  camera.position.set(x,eyeHeight - (z>1.2?.15:0),z);
  yaw = Math.atan2(x-tx,z-tz); pitch = name==='coast'?-.32:name==='clerestory'?.035:name==='deck'?-.095:-.152;
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
function resize(){const w=canvas.clientWidth,h=canvas.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.fov=w<h?87:75;camera.updateProjectionMatrix();}
function frame(time){if(!ready)return;step(Math.min(.045,(time-last)/1000));last=time;seaTime.value=time*.001;updateMirror();renderer.render(scene,camera);requestAnimationFrame(frame);}
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
function addClerestories(roadsidePanels,sky){
  const vertices=roadsidePanels.geometry.attributes.position;
  const aluminium=new T.MeshStandardMaterial({color:0xa5aaa7,metalness:.33,roughness:.46});
  const lining=new T.MeshStandardMaterial({color:0xe6e3da,roughness:.75});
  const gasket=new T.MeshStandardMaterial({color:0x353c3b,roughness:.78});
  const glass=new T.ShaderMaterial({side:T.DoubleSide,uniforms:{environment:{value:sky}},
    vertexShader:`varying vec3 world;varying vec2 pane;
    void main(){world=(modelMatrix*vec4(position,1.)).xyz;pane=uv;gl_Position=projectionMatrix*viewMatrix*vec4(world,1.);}`,
    fragmentShader:`uniform samplerCube environment;varying vec3 world;varying vec2 pane;
    void main(){
      vec3 sight=normalize(world-cameraPosition);
      vec3 axis=normalize(vec3(.26*sight.xy,sign(sight.z)));
      vec3 side=normalize(cross(axis,vec3(0.,1.,0.))),up=cross(side,axis);
      vec3 scattered=vec3(0.);
      for(int i=0;i<24;i++){
        float n=float(i)+.5,angle=n*2.3999632,r=sqrt(n/24.)*.9;
        vec3 sampleDir=normalize(axis+r*(cos(angle)*side+sin(angle)*up));
        scattered+=textureCube(environment,vec3(-sampleDir.x,sampleDir.yz)).rgb;
      }
      float edge=min(min(pane.x,1.-pane.x)*1.2,min(pane.y,1.-pane.y)*.26);
      float grain=fract(sin(dot(floor(world.xy*2400.),vec2(14.73,71.29)))*4357.37)-.5;
      vec3 light=mix(scattered/24.,vec3(.87,.91,.90),.66);
      light=mix(light,vec3(.92,.95,.94),.12+.19*smoothstep(0.,1.,pane.y));
      light*=.93+.07*smoothstep(.03,.85,pane.y);
      light*=.91+.09*smoothstep(0.,.014,edge);
      light+=grain*.019*(1.-smoothstep(.55,1.4,fwidth(world.x)*1600.));
      gl_FragColor=vec4(light,1.);
    }`});
  function frame(x,y,z,w,h,d,m){
    const part=new T.Mesh(new T.BoxGeometry(w,h,d),m);
    part.position.set(x,y,z);part.castShadow=part.receiveShadow=true;scene.add(part);
  }
  for(let offset=0;offset<vertices.count;offset+=24){
    const bounds=new T.Box3(),v=new T.Vector3();
    for(let i=offset;i<offset+24;i++)bounds.expandByPoint(v.fromBufferAttribute(vertices,i));
    const {min,max}=bounds,x=(min.x+max.x)/2,y=(min.y+max.y)/2,w=max.x-min.x,h=max.y-min.y;
    for(const yy of [min.y,max.y]){
      frame(x,yy,-1.129,w,.012,.166,lining);
      
      frame(x,yy+(yy<y?.013:-.013),-1.116,w,.014,.017,gasket);
    }
    for(const xx of [min.x,max.x]){
      frame(xx,y,-1.129,.012,h,.166,lining);
      
      frame(xx+(xx<x?.013:-.013),y,-1.116,.014,h,.017,gasket);
    }
    // One continuous bevelled extrusion keeps the four sash corners flush.
    const border=new T.Shape(),cutout=new T.Path();
    function rectangle(path,left,bottom,right,top){
      path.moveTo(left,bottom);path.lineTo(right,bottom);path.lineTo(right,top);
      path.lineTo(left,top);path.closePath();
    }
    rectangle(border,-w/2-.020,-h/2-.020,w/2+.020,h/2+.020);
    rectangle(cutout,-w/2+.007,-h/2+.007,w/2-.007,h/2-.007);
    border.holes.push(cutout);
    const sash=new T.Mesh(new T.ExtrudeGeometry(border,{depth:.013,bevelEnabled:true,bevelSize:.0015,bevelThickness:.0015,bevelSegments:2}),aluminium);
    sash.position.set(x,y,-1.041);sash.receiveShadow=sash.castShadow=true;scene.add(sash);
    const pane=new T.Mesh(new T.PlaneGeometry(w-.019,h-.019),glass);
    pane.position.set(x,y,-1.117);scene.add(pane);
  }
}

function addInteriorDetails(env) {
  const surface=(color,roughness,metalness=0)=>new T.MeshStandardMaterial({color,roughness,metalness,envMap:metalness?env:null,envMapIntensity:.75});
  const timber=surface(0xad8258,.55),stone=surface(0xe3dfd7,.37),steel=surface(0xe1ded8,.185,.94),dark=surface(0x343d40,.27,.58);
  steel.name="Brushed basin";
  const cloth=surface(0xf6efe3,.96);cloth.name="Bedding";timber.name="Cabinet oak";
  function box(x,y,z,w,h,d,mat){const m=new T.Mesh(new T.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);m.castShadow=m.receiveShadow=true;scene.add(m);return m;}
  // A continuous tabletop covers the old planter recess and its two round fittings.
  box(-4.576,.2515,3.079,.910,.016,.510,surface(0xd9d6c9,.54));
  function rod(a,b,r,mat){const start=new T.Vector3(...a),end=new T.Vector3(...b),dir=end.clone().sub(start);const m=new T.Mesh(new T.CylinderGeometry(r,r,dir.length(),18),mat);m.position.copy(start).lerp(end,.5);m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),dir.normalize());m.castShadow=true;scene.add(m);}
  // Four pieces of worktop around the actual stainless-steel recess.
  box(-.623,.87,-.335,.088,.04,1.43,stone);box(-.154,.87,-.335,.094,.04,1.43,stone);
  box(-.39,.87,-.606,.378,.04,.89,stone);box(-.39,.87,.313,.378,.04,.134,stone);
  // Concentric rounded rings form the pressed steel lip, sloping sides and basin floor.
  const basinVertices=[],basinFaces=[];
  const rings=[[.197,.214,.008,.893],[.185,.201,.034,.895],[.177,.193,.037,.888],[.171,.187,.041,.875],[.152,.167,.045,.785],[.14,.151,.047,.771],[.119,.132,.048,.766],[.069,.072,.049,.758],[.030,.030,.029,.751]];
  rings.forEach(([w,d,r,y],row)=>{
    for(let corner=0;corner<4;corner++){
      const sx=corner===0||corner===3?1:-1,sz=corner<2?1:-1;
      for(let j=0;j<=8;j++){
        const angle=(corner+j/8)*Math.PI/2;
        const offset=Math.max(0,(row-5)/3);
        basinVertices.push(-.39+.043*offset+sx*(w-r)+r*Math.cos(angle),y,.043+.047*offset+sz*(d-r)+r*Math.sin(angle));
        const col=corner*9+j,i=row*36+col,next=row*36+(col+1)%36;
        if(row)basinFaces.push(i-36,i,next-36,next-36,i,next);
      }
    }
  });
  const bowlGeometry=new T.BufferGeometry();
  bowlGeometry.setAttribute('position',new T.Float32BufferAttribute(basinVertices,3));
  bowlGeometry.setIndex(basinFaces);bowlGeometry.computeVertexNormals();steel.side=T.DoubleSide;
  const bowl=new T.Mesh(bowlGeometry,steel);bowl.receiveShadow=true;scene.add(bowl);
  // The pressed base falls into a perforated basket, visible from the prep position.
  const drainCenter=new T.Vector3(-.347,.753,.09);
  const drainMetal=surface(0xc7c8c4,.26,.73);
  const basket=new T.Mesh(new T.CylinderGeometry(.033,.028,.005,48),drainMetal);
  basket.position.copy(drainCenter);scene.add(basket);
  const apertures=new T.InstancedMesh(new T.CircleGeometry(.0036,12),surface(0x202324,.66),12);
  const hole=new T.Object3D();hole.rotation.x=-Math.PI/2;
  for(let i=0;i<12;i++){
    const a=i*Math.PI/6;
    hole.position.set(drainCenter.x+.021*Math.cos(a),.756,drainCenter.z+.021*Math.sin(a));hole.updateMatrix();
    apertures.setMatrixAt(i,hole.matrix);
  }
  scene.add(apertures);
  // Graphite square-section mixer and an inset aerator, matched to the approved kitchen view.
  const graphite=surface(0x262626,.30,.51);
  box(-.158,1.03,.045,.033,.278,.036,graphite);
  box(-.25,1.168,.045,.217,.032,.036,graphite);
  box(-.347,1.149,.045,.024,.027,.033,graphite);
  box(-.158,.897,.045,.054,.012,.056,graphite);
  rod([-.158,.927,.064],[-.158,.976,.096],.005,graphite);
  const strainer=new T.Mesh(new T.TorusGeometry(.033,.0025,10,48),drainMetal);
  strainer.rotation.x=Math.PI/2;strainer.position.copy(drainCenter);strainer.position.y=.757;scene.add(strainer);
  const plug=new T.Mesh(new T.SphereGeometry(.006,12,8),drainMetal);
  plug.scale.y=.60;plug.position.copy(drainCenter);plug.position.y=.758;scene.add(plug);
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
  const files={bounce:'room-bounce.png',fabric:'linen-weave.jpg',oak:'oak-grain.jpg',oakNormal:'oak-normal.jpg',deck:'deck-plank.jpg',deckNormal:'deck-normal.jpg',linen:'linen-normal.jpg',daylight:'daylight.png'};
  const entries=await Promise.all(Object.entries(files).map(async ([key,file])=>{
    const texture=await loader.loadAsync(file);
    if(key==='daylight'||key==='bounce'){texture.flipY=false;texture.generateMipmaps=false;texture.minFilter=T.LinearFilter;}
    else{texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());}
    if(key==='oak'||key==='deck')texture.encoding=T.sRGBEncoding;
    if(key==='linen'||key==='fabric')texture.repeat.set(3,3);
    if(key==='fabric')texture.encoding=T.sRGBEncoding;
    return [key,texture];
  }));
  return Object.fromEntries(entries);
}
// The offline visibility field gives broad surfaces indirect shade at walls and under furniture.
function shadeFromRoom(material,daylight,bounce){
  material.onBeforeCompile=shader=>{
    shader.uniforms.daylightField={value:daylight};shader.uniforms.bounceField={value:bounce};
    shader.vertexShader='varying vec3 roomPoint;\n'+shader.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\nroomPoint=(modelMatrix*vec4(transformed,1.)).xyz;');
    shader.fragmentShader=`varying vec3 roomPoint;
uniform sampler2D daylightField;uniform sampler2D bounceField;
vec3 bounceSlice(vec3 probe,float layer){
 vec2 tile=vec2(mod(layer,8.)*64.,floor(layer/8.)*32.);
 return texture2D(bounceField,(tile+probe.xz+.5)/vec2(512.,96.)).rgb;
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
reflectedLight.directDiffuse*=.84+.16*contact;
if(roomPoint.z<1.14 && abs(roomPoint.x)<5.85 && roomPoint.y>0. && roomPoint.y<2.15){
 float nearFloor=smoothstep(.02,1.04,roomPoint.y);
 float roofShade=1.-smoothstep(1.46,2.1,roomPoint.y);
 float reveal=.65+.35*nearFloor*roofShade;
 reflectedLight.indirectDiffuse*=mix(vec3(.81,.80,.77),vec3(1.05,1.01,.96),reveal*vis.g);
 vec3 probe=clamp(grid*vec3(1./3.,23./63.,1./3.),vec3(0.),vec3(63.,23.,31.));
 vec3 field=mix(bounceSlice(probe,floor(probe.y)),bounceSlice(probe,min(23.,floor(probe.y)+1.)),fract(probe.y));
 vec3 bounced=field*vec3(.64,.52,.41)*contact;
 reflectedLight.indirectDiffuse+=diffuseColor.rgb*bounced;
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
    m.map=assets.oak;m.normalMap=assets.oakNormal;m.normalScale.set(.23,.23);m.color.setHex(0xffffff);m.roughness=.49;if(m.name==='Cabinet oak')m.color.setHex(0xffc993);
  }
  if(mesh.name.includes('クッション')||m.name==='Bedding'){
    m.normalMap=assets.linen;m.normalScale.set(.16,.16);m.roughness=.93;
  }
  if(!m.transparent)shadeFromRoom(m,assets.daylight,assets.bounce);
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
      float brushing=fract(sin(dot(floor(roomPoint.xz*vec2(750.,2800.)),vec2(13.3,39.8)))*2746.2);
      vec3 satin=vec3(.25,.254,.256)*(.94+.06*brushing);
      float skyBand=smoothstep(-.45,.73,reflectedRay.y);
      outgoingLight=outgoingLight*.43+satin*(.16+.33*skyBand);
      outgoingLight+=vec3(.11,.10,.08)*pow(1.-abs(dot(worldN,normalize(cameraPosition-roomPoint))),4.);
      outgoingLight+=vec3(.32,.30,.275)*opening*(.48+.52*mullion);
      #include <output_fragment>`);
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
function buildCoast(environment,shoreline,clouds,reef,reefEdge){
  reefEdge.wrapS=T.MirroredRepeatWrapping;reefEdge.generateMipmaps=false;reefEdge.minFilter=T.LinearFilter;
  clouds.wrapS=T.MirroredRepeatWrapping;reef.wrapS=T.MirroredRepeatWrapping;
  // Use the same sightline for distant terrain, sky and animated water, including mirrors.
  const sky=new T.Mesh(new T.SphereGeometry(94,48,28),new T.ShaderMaterial({
    side:T.BackSide,depthWrite:false,uniforms:{land:{value:environment},outline:{value:shoreline},clouds:{value:clouds}},
    vertexShader:`varying vec3 dir;void main(){dir=position;gl_Position=projectionMatrix*vec4(mat3(viewMatrix)*position,1.);}`,
    fragmentShader:`uniform samplerCube land;uniform sampler2D clouds;varying vec3 dir;
    uniform samplerCube outline;
    void main(){
      vec3 d=normalize(dir);float a=atan(d.x,d.z),h=asin(d.y);
      vec3 landColor=textureCube(land,vec3(-d.x,d.yz)).rgb;
      vec3 sky=mix(vec3(.54,.76,.94),vec3(.18,.50,.85),smoothstep(.02,.85,h));
      vec3 bank=texture2D(clouds,vec2(a/2.85+.52,clamp(h/.16,.008,.992))).rgb;
      sky=mix(bank,sky,smoothstep(.09,.17,h));
      sky=mix(vec3(.125,.38,.61),sky,smoothstep(-.004,.002,h));
      float coast=textureCube(outline,vec3(-d.x,d.yz)).r;
      gl_FragColor=vec4(mix(landColor,sky,coast),1.);
    }`
  }));
  sky.renderOrder=-100;sky.frustumCulled=false;scene.add(sky);
  // Sea coordinates are fixed to the coast, so nearby reef patches shift against the horizon as one walks.
  const surface=new T.ShaderMaterial({side:T.DoubleSide,uniforms:{shore:{value:environment},outline:{value:shoreline},reef:{value:reef},reefEdge:{value:reefEdge},seconds:{value:0}},
    vertexShader:`uniform float seconds;uniform sampler2D reefEdge;varying float offshore;varying vec3 world;varying vec3 seaNormal;varying float crest;
    void swell(vec2 dir,float wavelength,float amplitude,float period,float phase,vec2 base,float fade,
               inout vec3 pt,inout vec3 tx,inout vec3 tz,inout float ridge){
      dir=normalize(dir);
      float k=6.283185/wavelength;
      float theta=k*dot(dir,base)-6.283185*seconds/period+phase;
      float a=amplitude*fade,s=sin(theta),c=cos(theta),q=.56;
      pt+=vec3(q*a*dir.x*c,a*s,q*a*dir.y*c);
      vec3 deriv=k*a*vec3(-q*dir.x*s,c,-q*dir.y*s);
      tx+=dir.x*deriv;tz+=dir.y*deriv;ridge+=a*s;
    }
    void main(){
      vec3 pt=(modelMatrix*vec4(position,1.)).xyz;
      vec2 base=pt.xz;
      vec2 coast=base-vec2(-1.24,-.91);
      float edgeDepth=texture2D(reefEdge,vec2(.51-atan(coast.x,coast.y)/1.74,.5)).r;
      float radius=11.8/max(.085,edgeDepth);
      offshore=smoothstep(-.12*radius,.045*radius,length(coast)-radius);
      float fade=(1.-smoothstep(38.,104.,length(base)))*mix(.035,1.,offshore);
      vec3 tx=vec3(1.,0.,0.),tz=vec3(0.,0.,1.);float ridge=0.;
      swell(vec2(.12,-1.),6.8,.073,6.7,.4,base,fade,pt,tx,tz,ridge);
      swell(vec2(-.27,-1.),4.1,.033,4.85,1.8,base,fade,pt,tx,tz,ridge);
      swell(vec2(.46,-1.),2.9,.019,3.92,.72,base,fade,pt,tx,tz,ridge);
      world=pt;seaNormal=normalize(cross(tz,tx));crest=ridge;
      gl_Position=projectionMatrix*viewMatrix*vec4(pt,1.);
    }`,
    fragmentShader:`uniform samplerCube shore;
    uniform samplerCube outline;
    varying float offshore;uniform sampler2D reef;uniform sampler2D reefEdge;uniform float seconds;varying vec3 world;varying vec3 seaNormal;varying float crest;
    void main(){
      vec2 p=world.xz-vec2(-1.24,-.91);float distanceFromRoom=length(p);
      float direction=atan(p.x,p.y);
      float nearer=clamp(11.8/max(11.8,distanceFromRoom),0.,1.);
      float ripple=sin(dot(world.xz,vec2(.83,3.8))+seconds*1.65)
                  +.42*sin(dot(world.xz,vec2(-2.35,5.3))+seconds*2.);
      vec3 n=normalize(seaNormal+vec3(.009*ripple,0.,.018*ripple)*nearer*mix(.08,1.,offshore));
      vec2 uv=vec2(.51-direction/1.74,1.-nearer)+nearer*vec2(.023*n.x,.049*n.z);
      vec3 color=texture2D(reef,uv).rgb;
      color=mix(vec3(.125,.38,.61),color,smoothstep(.008,.12,nearer));
      vec3 eye=normalize(cameraPosition-world);
      float grazing=pow(1.-max(0.,dot(eye,n)),3.);
      float slope=smoothstep(-.105,.12,n.z);
      float shimmer=smoothstep(.035,.103,crest)*smoothstep(.05,1.29,ripple);
      color*=1.+nearer*.29*(slope-.5);
      color=mix(color,vec3(.65,.84,.92),nearer*(.025+.15*slope)*grazing);
      // Only travelling wave crests brighten; reef markings stay on the seabed.
      float broken=.52+.20*sin(.57*p.x+.12*p.y)+.17*sin(1.27*p.x-.34*p.y)+.11*sin(2.8*p.x+.25*p.y);
      float lip=smoothstep(.042,.098,crest)*smoothstep(-.018,.070,n.z);
      color=mix(color,vec3(.70,.89,.88),nearer*broken*lip*.53);
      color+=vec3(.045,.064,.066)*shimmer*nearer;
      // Trace the photographed shelf contour. Distances are in scene metres.
      float edgeDepth=texture2D(reefEdge,vec2(.51-direction/1.74,.5)).r;
      float reefRadius=11.8/max(.085,edgeDepth);
      float across=reefRadius-distanceFromRoom;
      float along=direction*reefRadius;
      float phase=seconds/6.7+.075*sin(along*.23)+along*.019+.10*sin(along*.48);
      float age=fract(phase);
      float reach=clamp(reefRadius*.125,2.8,8.);
      float head=reach*(age-.18);
      float local=across-head+.25*sin(along*1.64+seconds*.31);
      float group=.5+.25*sin(along*.64-seconds*.33)+.25*sin(along*.23+seconds*.45);
      float life=smoothstep(0.,.18,age)*(1.-smoothstep(.50,.97,age));
      float width=clamp(reefRadius*.021,.50,1.35);
      float cap=exp(-pow(abs(local)/width,2.));
      float wake=exp(-pow(abs(local+1.45*width)/(width*1.62),2.));
      float lace=.5+.25*sin(along*3.1+across*2.1+seconds*.64)+.25*sin(along*1.4-across*3.7);
      float foam=life*smoothstep(.13,.74,group)*(cap*.95+wake*.40*smoothstep(.21,.72,lace));
      // Water spills over scattered reef heads in thin patches after the outer break.
      float stone=.48*sin(p.x*.74+.81*sin(p.y*.5))+.35*cos(p.y*1.17-p.x*.28)+.17*sin(dot(p,vec2(1.8,.68)));
      float washAge=fract(seconds/7.4+.082*p.y+.035*p.x+.13*stone);
      float surge=smoothstep(.02,.24,washAge)*(1.-smoothstep(.28,.9,washAge));
      float rim=1.-smoothstep(.09,.32,abs(stone-(.53-.23*washAge)));
      float flecks=.54+.23*sin(3.9*p.x+1.8*p.y+seconds*.57)+.18*cos(3.5*p.y-.47*seconds);
      float wash=(1.-offshore)*smoothstep(1.,5.,across)*surge*rim*smoothstep(.23,.78,flecks)*.64;
      foam=max(foam,wash);
      color=mix(color,vec3(.95,.985,.975),clamp(foam,0.,.97));
      vec3 ray=normalize(world-cameraPosition);
      vec3 panorama=textureCube(shore,vec3(-ray.x,ray.yz)).rgb;
      gl_FragColor=vec4(mix(panorama,color,mix(1.,textureCube(outline,vec3(-ray.x,ray.yz)).r,smoothstep(.71,1.10,abs(atan(ray.x,ray.z))))),1.);
    }`});
  // Concentrate vertices along the visible reef. The far, flat water shares its last row.
  const geometry=new T.PlaneGeometry(1,1,170,116),points=geometry.attributes.position;
  for(let i=0;i<points.count;i++){
    const u=points.getX(i)*2,v=.5-points.getY(i),a=Math.abs(u);
    const x=Math.sign(u)*(a<.80?38*a/.80:38+762*Math.pow((a-.80)/.20,2));
    const z=v<.07?-14-810*Math.pow(1.-v/.07,2.):v<.84?-14+73*Math.pow((v-.07)/.77,1.28):59+770*Math.pow((v-.84)/.16,2);
    points.setXYZ(i,x,-1.13,z);
  }
  geometry.computeBoundingSphere();
  const water=new T.Mesh(geometry,surface);scene.add(water);return surface.uniforms.seconds;
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
  const bytes=await (await fetchAsset('room-frost.bin.gz')).arrayBuffer();
  if(new Uint8Array(bytes)[0]!==31)return bytes;
  return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
}
async function fetchAsset(file){const r=await fetch(file);if(!r.ok)throw Error(file);return r;}
async function load(){
  renderer=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.outputEncoding=T.sRGBEncoding;
  renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.94;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;
  scene=new T.Scene();camera=new T.PerspectiveCamera(75,1,.035,1450);
  const loader=new T.TextureLoader();
  const [rows,buffer,env]=await Promise.all([fetchAsset('room-frost.json').then(r=>r.json()),fetchModel(),new T.CubeTextureLoader().loadAsync([1,0,2,3,4,5].map(i=>'view-'+i+'.jpg'))]);
  env.encoding=T.sRGBEncoding;scene.background=env;
  const shoreline=await new T.CubeTextureLoader().loadAsync([1,0,2,3,4,5].map(i=>'shore-'+i+'.png'));
  const textures={};await Promise.all(rows.filter(r=>r.map).map(async r=>{const m=r.map,t=await loader.loadAsync('surface-'+m.index+'.jpg');t.encoding=T.sRGBEncoding;t.wrapS=t.wrapT=T.RepeatWrapping;t.repeat.fromArray(m.repeat);t.flipY=m.flipY;t.anisotropy=4;textures[m.index]=t;}));
  const finishes=await loadFinishes(loader);
  const nullPanel=new T.MeshBasicMaterial();
  rows.forEach(r=>{
    if(['1b2730','葉','植え込みの土'].includes(r.name))return;
    if(r.name==='bcd3df'){const original=meshFrom(r,buffer,nullPanel);addClerestories(original,env);original.geometry.dispose();return;}
    const mat=r.name==='Clear glazing'?architecturalGlass():r.name==='テーブル_ガラス天板'?architecturalGlass(true):material(r,textures,env);scene.add(meshFrom(r,buffer,mat));});nullPanel.dispose();
    const grass=await loader.loadAsync('lawn.jpg');grass.encoding=T.sRGBEncoding;grass.wrapS=grass.wrapT=T.RepeatWrapping;grass.repeat.set(8,6);
  const garden=new T.Mesh(new T.PlaneGeometry(21,9.5),new T.MeshStandardMaterial({map:grass,color:0xa6bd79,roughness:1}));garden.rotation.x=-Math.PI/2;garden.position.set(0,-.95,6.2);garden.receiveShadow=true;scene.add(garden);
  garden.material.name='Lawn';
  addInteriorDetails(env);seaTime=buildCoast(env,shoreline,...await Promise.all(["cloud-bank.jpg","reef-bed.jpg","reef-edge.png"].map(f=>loader.loadAsync(f))));
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
  renderer.shadowMap.needsUpdate=true;selectSpot(({'#small-window':'clerestory','#deck-coast':'coast'})[location.hash] || 'kitchen');resize();inputs();window.addEventListener('resize',resize);
  statusBox.hidden=true;ready=true;last=performance.now();requestAnimationFrame(frame);
}
load().catch(e=>{console.error(e);statusBox.innerHTML='3D内覧を読み込めませんでした。<br><a href="../room.html#equipment">客室の写真を見る</a>';});
