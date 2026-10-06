/* ---------- sky and day/night ----------
   Outdoor maps get a procedural sky dome (gradient, sun, moon, stars, drifting clouds). A full day takes 20 real
   minutes, driven by the real clock so every player sees the same time without any network traffic.
   The scene's directional light becomes the sun (or the moon at night); ambient light and fog follow the sky. */
const SKY = { mode:store.get('hr-tod', 'cycle'), mesh:null, mat:null, mapKey:'', outdoor:false, base:null, tod:12, sunDir:new THREE.Vector3(0, 1, 0), lightDir:new THREE.Vector3(-10, 20, -6).normalize() };
const DAY_SECONDS = 20*60;
function skyMaterial() {
  return new THREE.ShaderMaterial({
    side:THREE.BackSide, depthWrite:false, fog:false,
    uniforms:{ sunDir:{ value:new THREE.Vector3() }, top:{ value:new THREE.Color() }, horizon:{ value:new THREE.Color() }, sunCol:{ value:new THREE.Color() }, night:{ value:0 }, time:{ value:0 }, cloud:{ value:new THREE.Color() } },
    vertexShader:'varying vec3 vDir; void main() { vDir = normalize(position); vec4 p = projectionMatrix*modelViewMatrix*vec4(position, 1.0); gl_Position = p.xyww; }',
    fragmentShader:`uniform vec3 sunDir, top, horizon, sunCol, cloud; uniform float night, time; varying vec3 vDir;
      float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7)))*43758.5453); }
      float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f*f*(3.0 - 2.0*f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      float fbm(vec2 p) { float v = 0.0, a = .5; for (int i = 0; i < 4; i++) { v += a*n(p); p *= 2.03; a *= .5; } return v; }
      void main() {
        vec3 d = normalize(vDir); float y = max(d.y, 0.0);
        vec3 col = mix(horizon, top, pow(y, .55));
        col = mix(col, horizon*.55, smoothstep(0.0, -.25, d.y));                       // below the horizon
        float s = max(dot(d, sunDir), 0.0);
        col += sunCol*(pow(s, 900.0)*6.0 + pow(s, 12.0)*.35);                           // sun disc and glow
        float m = max(dot(d, -sunDir), 0.0);
        col += vec3(.85, .9, 1.0)*smoothstep(.9994, .9997, m)*night*1.4;               // moon
        vec2 sp = d.xz/(d.y + .05);
        float st = step(.9965, h(floor(sp*90.0)))*smoothstep(.05, .3, d.y);
        col += vec3(st)*night*(.6 + .4*sin(time*3.0 + h(floor(sp*90.0))*40.0));        // twinkling stars
        if (d.y > 0.0) {
          vec2 cp = d.xz/(d.y + .12)*1.4 + vec2(time*.012, time*.004);
          float c = smoothstep(.5, .78, fbm(cp));
          col = mix(col, cloud, c*.75*smoothstep(0.0, .18, d.y));
        }
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}
const lerpC = (a, b, k) => new THREE.Color(a).lerp(new THREE.Color(b), k);
function skyUpdate(t) {
  // which map are we on? indoor maps (Bay 4, or anything with a solid roof) keep their own lighting
  const key = currentMap.id + '|' + (currentMap.code || '').length;
  if (!SKY.orig) SKY.orig = { hemiCol:hemi.color.clone(), hemiGround:hemi.groundColor.clone(), moon:moon.intensity, moonCol:moon.color.clone() };
  if (key !== SKY.mapKey) {
    SKY.mapKey = key;
    // back to the map's own light before deciding (a previous outdoor map changed it)
    hemi.color.copy(SKY.orig.hemiCol); hemi.groundColor.copy(SKY.orig.hemiGround); moon.intensity = SKY.orig.moon; moon.color.copy(SKY.orig.moonCol);
    SKY.outdoor = !!(currentMap.data && (!currentMap.data.env || currentMap.data.env.roof !== 'solid'));
    SKY.base = { hemi:hemi.intensity, moon:moon.intensity, moonCol:moon.color.clone(), bg:scene.background, fog:scene.fog ? { near:scene.fog.near, far:scene.fog.far, col:scene.fog.color.clone() } : null };
  }
  if (!SKY.mesh) { SKY.mat = skyMaterial(); SKY.mesh = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), SKY.mat); SKY.mesh.frustumCulled = false; SKY.mesh.renderOrder = -1; SKY.mesh.userData.noShadow = true; scene.add(SKY.mesh); }
  SKY.mesh.visible = SKY.outdoor;
  if (!SKY.outdoor) { SKY.lightDir.set(-10, 20, -6).normalize(); return; }
  SKY.tod = SKY.mode === 'day' ? 13 : SKY.mode === 'sunset' ? 18.15 : SKY.mode === 'night' ? 0.5 : (Date.now()/1000/DAY_SECONDS*24 + 9) % 24;
  const a = (SKY.tod - 6)/24*Math.PI*2, sunH = Math.sin(a);
  SKY.sunDir.set(Math.cos(a)*.85, sunH, .45).normalize();
  const day = THREE.MathUtils.smoothstep(sunH, -.12, .3), dusk = Math.max(0, 1 - Math.abs(sunH)/.28)*(1 - Math.max(0, -sunH)*3), night = 1 - THREE.MathUtils.smoothstep(sunH, -.25, -.02);
  const top = lerpC('#060a18', '#3f7fd2', day), hor = lerpC('#111a30', '#b9d3ea', day).lerp(new THREE.Color('#ff8a4a'), Math.max(0, dusk)*.65);
  const U = SKY.mat.uniforms;
  U.sunDir.value.copy(SKY.sunDir); U.top.value.copy(top); U.horizon.value.copy(hor); U.night.value = night; U.time.value = t;
  U.sunCol.value.copy(lerpC('#ff7a3c', '#fff1d0', THREE.MathUtils.clamp(sunH*3, 0, 1))).multiplyScalar(sunH > -.05 ? 1 : 0);
  U.cloud.value.copy(lerpC('#1a2238', '#f4f7fb', day).lerp(new THREE.Color('#ffb48a'), Math.max(0, dusk)*.6));
  SKY.mesh.position.copy(camera.position);
  // the light: the sun by day, a dim blue moon at night (always from above so shadows stay sensible)
  const sunUp = sunH > -.05;
  SKY.lightDir.copy(sunUp ? SKY.sunDir : SKY.sunDir.clone().negate()); SKY.lightDir.y = Math.max(.25, SKY.lightDir.y); SKY.lightDir.normalize();
  moon.color.copy(sunUp ? lerpC('#ffb070', '#fff4e2', THREE.MathUtils.clamp(sunH*3, 0, 1)) : new THREE.Color('#9db4e0'));
  moon.intensity = sunUp ? .25 + .85*THREE.MathUtils.clamp(sunH*2, 0, 1) : .22;
  hemi.intensity = SKY.base.hemi*(.48 + .52*day);
  hemi.color.copy(lerpC('#5a6c96', '#c9d8ea', day)); hemi.groundColor.copy(lerpC('#141820', '#4a4034', day));
  if (scene.fog) scene.fog.color.copy(hor);
  scene.background = hor;
  const c = camera.position; moon.position.set(c.x + SKY.lightDir.x*60, c.y + SKY.lightDir.y*60, c.z + SKY.lightDir.z*60);
}
