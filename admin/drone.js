/* ----- drone camera: the free camera as a tablet in the world, with its own renderer -----
   Start recording (F8) while in free camera and the recording keeps coming from the drone after you go back to
   first person; the drone then stays put or follows you, depending on the options. */
const DR_OPTS = [
  ['follow', 'Follow me'], ['look', 'Look at me'], ['orbit', 'Orbit me'], ['smooth', 'Smooth movement'], ['shake', 'Handheld shake'],
  ['zoom', 'Auto-zoom'], ['tablet', 'Show tablet'], ['screen', 'Live screen'], ['pip', 'Picture-in-picture'], ['bars', 'Cinematic bars'], ['walls', 'Avoid walls'],
];
const DR = { on:false, rec:false, r:null, canvas:null, cam:new THREE.PerspectiveCamera(60, 16/9, .05, 300), pos:new THREE.Vector3(), quat:new THREE.Quaternion(), fov:60,
  offset:new THREE.Vector3(), orbitA:0, tablet:null, screen:null, screenCtx:null, screenTex:null, light:null, pip:null, t:0,
  opt:(() => { try { return { follow:false, look:false, orbit:false, smooth:true, shake:false, zoom:false, tablet:true, screen:true, pip:false, bars:false, walls:true, ...JSON.parse(store.get('adm-drone', '{}')) }; } catch (e) { return { tablet:true, screen:true, smooth:true, walls:true }; } })() };
const droneSave = () => store.set('adm-drone', JSON.stringify(DR.opt));
function droneRenderer() {
  if (DR.r) return;
  DR.canvas = document.createElement('canvas');
  DR.r = new THREE.WebGLRenderer({ canvas:DR.canvas, antialias:true, powerPreference:'high-performance' });
  DR.r.setPixelRatio(1);
  // the tablet: a dark slab with a screen on the back (facing whoever is behind it) and a red REC light
  const g = DR.tablet = new THREE.Group(), body = new THREE.Mesh(new THREE.BoxGeometry(.34, .23, .025), new THREE.MeshStandardMaterial({ color:0x1a1c20, roughness:.4, metalness:.4 }));
  g.add(body);
  DR.screen = document.createElement('canvas'); DR.screen.width = 256; DR.screen.height = 144; DR.screenCtx = DR.screen.getContext('2d');
  DR.screenTex = new THREE.CanvasTexture(DR.screen);
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(.31, .2), new THREE.MeshBasicMaterial({ map:DR.screenTex })); scr.position.z = .0135; g.add(scr);
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(.018, .018, .01, 12), new THREE.MeshStandardMaterial({ color:0x05060a, metalness:.8, roughness:.2 })); lens.rotation.x = Math.PI/2; lens.position.set(.12, .08, -.017); g.add(lens);
  DR.light = new THREE.Mesh(new THREE.SphereGeometry(.009, 8, 6), new THREE.MeshBasicMaterial({ color:0xff2020 })); DR.light.position.set(-.14, .095, .014); g.add(DR.light);
  g.traverse(o => { o.userData.noShadow = true; }); g.visible = false; scene.add(g);
  DR.pip = document.createElement('canvas'); DR.pip.width = 320; DR.pip.height = 180;
  Object.assign(DR.pip.style, { position:'fixed', right:'16px', bottom:'120px', width:'320px', height:'180px', border:'2px solid #2d8cff', borderRadius:'6px', zIndex:57, display:'none', background:'#000' });
  document.body.append(DR.pip);
}
function droneStart(fromCamera) {
  if (!admLocal()) { admToast('Drone camera works offline, in cheats rooms, or with the owner key'); return false; }
  droneRenderer();
  DR.on = true;
  if (fromCamera) { DR.pos.copy(camera.position); DR.quat.copy(camera.quaternion); DR.fov = camera.fov; }
  if (player) DR.offset.copy(DR.pos).sub(new THREE.Vector3(player.x*S, (player.jumpY || 0), player.y*S));
  DR.orbitA = Math.atan2(DR.offset.z, DR.offset.x);
  return true;
}
function droneStop() { DR.on = false; DR.rec = false; REC.src = null; if (DR.tablet) DR.tablet.visible = false; if (DR.pip) DR.pip.style.display = 'none'; if (!FC.on) selfBody(false); }
// recording from free camera = recording from the drone
{ const rt0 = recToggle; recToggle = () => {
  if (!REC.on && (FC.on || DR.on) && admLocal()) { if (!DR.on && !droneStart(true)) return rt0(); DR.rec = true; droneSize(); REC.src = DR.canvas; }
  else if (REC.on) { DR.rec = false; REC.src = null; }
  rt0();
}; }
function droneSize() {
  const h = REC.height || 720, w = Math.round(h*(cv.width/cv.height || 16/9)/2)*2;
  if (DR.canvas.width !== w || DR.canvas.height !== h) { DR.r.setSize(w, h, false); DR.cam.aspect = w/h; DR.cam.updateProjectionMatrix(); }
}
const _v = new THREE.Vector3(), _m = new THREE.Matrix4();
function droneUpdate(dt) {
  if (!DR.on) return;
  if (!admLocal()) { droneStop(); return; }
  DR.t += dt;
  const O = DR.opt, me = player ? new THREE.Vector3(player.x*S, (player.jumpY || 0) + 1.3, player.y*S) : null;
  if (FC.on) { DR.pos.copy(camera.position); DR.quat.copy(camera.quaternion); DR.fov = camera.fov; if (me) DR.offset.copy(DR.pos).sub(me).add(new THREE.Vector3(0, 1.3, 0)); DR.orbitA = Math.atan2(DR.offset.z, DR.offset.x); }
  else if (me) {
    // where the drone wants to be
    const want = DR.pos.clone();
    if (O.orbit) { const r = Math.hypot(DR.offset.x, DR.offset.z) || 4; DR.orbitA += dt*.35; want.set(me.x + Math.cos(DR.orbitA)*r, me.y - 1.3 + DR.offset.y, me.z + Math.sin(DR.orbitA)*r); }
    else if (O.follow) want.copy(me).sub(new THREE.Vector3(0, 1.3, 0)).add(DR.offset);
    if (O.walls && (O.follow || O.orbit)) {
      const dir = want.clone().sub(me), len = dir.length(); dir.normalize();
      const h = castWorld(me, dir, false); if (h && h.distance < len) want.copy(me).addScaledVector(dir, Math.max(.6, h.distance - .4));
    }
    DR.pos.lerp(want, O.smooth ? 1 - Math.exp(-dt*2.5) : 1);
    // where it looks
    if (O.look || O.follow || O.orbit) {
      _m.lookAt(DR.pos, me, new THREE.Vector3(0, 1, 0)); const q = new THREE.Quaternion().setFromRotationMatrix(_m);
      DR.quat.slerp(q, O.smooth ? 1 - Math.exp(-dt*4) : 1);
    }
    if (O.zoom) { const d = DR.pos.distanceTo(me), f = THREE.MathUtils.clamp(2*Math.atan(1.7/d)*180/Math.PI, 14, 75); DR.fov += (f - DR.fov)*(1 - Math.exp(-dt*3)); }
  }
  DR.cam.position.copy(DR.pos); DR.cam.quaternion.copy(DR.quat); DR.cam.fov = DR.fov;
  if (O.shake) DR.cam.rotateX(Math.sin(DR.t*1.7)*.004 + Math.sin(DR.t*4.3)*.002).rotateY(Math.sin(DR.t*1.3)*.005 + Math.sin(DR.t*3.7)*.0015).rotateZ(Math.sin(DR.t*.9)*.003);
  DR.cam.updateProjectionMatrix();
  // the tablet sits where the drone is (hidden while you are looking through it)
  DR.tablet.visible = O.tablet && !FC.on;
  DR.tablet.position.copy(DR.pos); DR.tablet.quaternion.copy(DR.quat); DR.light.visible = DR.rec && Math.sin(DR.t*6) > 0;
  const need = DR.rec || O.pip || (O.screen && DR.tablet.visible);
  DR.pip.style.display = O.pip ? 'block' : 'none';
  if (!need) return;
  droneSize();
  // draw the drone's view: your body shows up in it, the tablet doesn't
  if (player && player.alive) selfBody(true);
  const tabV = DR.tablet.visible; DR.tablet.visible = false;
  if (player && player.mesh) player.mesh.g.visible = true;
  DR.r.render(scene, DR.cam);
  DR.tablet.visible = tabV;
  if (player && player.mesh && !FC.on) player.mesh.g.visible = false;
  if (O.bars) { /* drawn into the recording in __recPost */ }
  if (O.pip) DR.pip.getContext('2d').drawImage(DR.canvas, 0, 0, 320, 180);
  if (O.screen && DR.tablet.visible && (DR.screenN = (DR.screenN || 0) + 1) % 3 === 0) { DR.screenCtx.drawImage(DR.canvas, 0, 0, 256, 144); DR.screenTex.needsUpdate = true; }
}
// cinematic bars on drone recordings
window.__recPost = (c, W, H) => { if (REC.src && DR.opt.bars) { const b = Math.round((H - W/2.39)/2); if (b > 0) { c.fillStyle = '#000'; c.fillRect(0, 0, W, b); c.fillRect(0, H - b, W, b); } } };
// in first person your body stays hidden from you even while the drone needs it
window.__keepVM = true;
