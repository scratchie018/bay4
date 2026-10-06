/* ---------- shaders: post-processing and shadows ----------
   Off: plain rendering. Lite: the frame (world + first-person arms) is drawn into an HDR buffer, then one pass adds
   bloom, filmic tone mapping, colour grading, FXAA anti-aliasing, a vignette and a little grain.
   Ultra: Lite plus stronger bloom, slight lens fringing, and real-time shadows from the sun/moon light. */
const GFX = { mode:store.get('hr-gfx', 'off'), rt:null, b0:null, b1:null, b2:null, quad:null, mats:null, w:0, h:0, shadowT:0 };
function gfxTargets() {
  const sz = new THREE.Vector2(); renderer.getDrawingBufferSize(sz);
  if (GFX.rt && GFX.w === sz.x && GFX.h === sz.y) return;
  for (const k of ['rt', 'b0', 'b1', 'b2']) if (GFX[k]) GFX[k].dispose();
  const type = renderer.capabilities.isWebGL2 ? THREE.HalfFloatType : THREE.UnsignedByteType;
  GFX.w = sz.x; GFX.h = sz.y;
  GFX.rt = new THREE.WebGLRenderTarget(sz.x, sz.y, { type, depthBuffer:true });
  const bw = Math.max(1, sz.x >> 2), bh = Math.max(1, sz.y >> 2);
  GFX.b0 = new THREE.WebGLRenderTarget(bw, bh, { type }); GFX.b1 = new THREE.WebGLRenderTarget(bw, bh, { type }); GFX.b2 = new THREE.WebGLRenderTarget(bw, bh, { type });
}
const GFX_VERT = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
function gfxInit() {
  if (GFX.quad) return;
  const sh = (frag, uniforms) => new THREE.ShaderMaterial({ vertexShader:GFX_VERT, fragmentShader:frag, uniforms, depthTest:false, depthWrite:false });
  GFX.mats = {
    // keep only what's brighter than the threshold (that's what glows)
    bright: sh(`uniform sampler2D tex; uniform float threshold; varying vec2 vUv;
      void main() { vec3 c = texture2D(tex, vUv).rgb; float l = max(c.r, max(c.g, c.b)); gl_FragColor = vec4(c*smoothstep(threshold, threshold + .35, l), 1.0); }`,
      { tex:{ value:null }, threshold:{ value:.72 } }),
    // 9-tap gaussian blur in one direction
    blur: sh(`uniform sampler2D tex; uniform vec2 dir; varying vec2 vUv;
      void main() { vec3 c = texture2D(tex, vUv).rgb*.227;
        c += (texture2D(tex, vUv + dir*1.385).rgb + texture2D(tex, vUv - dir*1.385).rgb)*.316;
        c += (texture2D(tex, vUv + dir*3.231).rgb + texture2D(tex, vUv - dir*3.231).rgb)*.070;
        gl_FragColor = vec4(c, 1.0); }`,
      { tex:{ value:null }, dir:{ value:new THREE.Vector2() } }),
    // the final look
    final: sh(`uniform sampler2D tex; uniform sampler2D bloom; uniform vec2 px; uniform float bloomK, grain, fringe, time, sat, contrast, exposure; uniform vec3 tint; varying vec2 vUv;
      vec3 aces(vec3 x) { return clamp((x*(2.51*x + .03))/(x*(2.43*x + .59) + .14), 0.0, 1.0); }
      float luma(vec3 c) { return dot(c, vec3(.299, .587, .114)); }
      vec3 fxaa(vec2 uv) {
        vec3 m = texture2D(tex, uv).rgb, n = texture2D(tex, uv + vec2(0.0, -px.y)).rgb, s = texture2D(tex, uv + vec2(0.0, px.y)).rgb,
             e = texture2D(tex, uv + vec2(px.x, 0.0)).rgb, w = texture2D(tex, uv + vec2(-px.x, 0.0)).rgb;
        float lm = luma(m), ln = luma(n), ls = luma(s), le = luma(e), lw = luma(w);
        float range = max(lm, max(max(ln, ls), max(le, lw))) - min(lm, min(min(ln, ls), min(le, lw)));
        if (range < max(.03, lm*.12)) return m;
        vec2 d = normalize(vec2(abs(ln - ls) - .0001, abs(le - lw)) + 1e-5);
        vec3 a = texture2D(tex, uv + d*px*.75).rgb + texture2D(tex, uv - d*px*.75).rgb;
        return mix(m, a*.5, .55);
      }
      void main() {
        vec2 uv = vUv, c = uv - .5;
        vec3 col = fxaa(uv);
        if (fringe > 0.0) { col.r = mix(col.r, texture2D(tex, uv + c*fringe).r, .9); col.b = mix(col.b, texture2D(tex, uv - c*fringe).b, .9); }
        col += texture2D(bloom, uv).rgb*bloomK;
        // tone-map brightness only, so colours (like a blue sky) keep their saturation
        col *= exposure; float L0 = max(luma(col), 1e-4); col *= aces(vec3(L0)).r/L0; col = min(col, vec3(1.0));
        float l = luma(col); col = mix(vec3(l), col, sat); col = (col - .5)*contrast + .5; col *= tint;
        col *= 1.0 - smoothstep(.45, .95, length(c*vec2(1.15, 1.0)))*.42;
        col += (fract(sin(dot(uv*1000.0 + time, vec2(12.9898, 78.233)))*43758.5453) - .5)*grain;
        gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
      }`,
      { tex:{ value:null }, bloom:{ value:null }, px:{ value:new THREE.Vector2() }, bloomK:{ value:.7 }, grain:{ value:.025 }, fringe:{ value:0 }, time:{ value:0 },
        sat:{ value:1.08 }, contrast:{ value:1.06 }, exposure:{ value:.92 }, tint:{ value:new THREE.Vector3(1.02, 1.0, .97) } }),
  };
  GFX.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), GFX.mats.final); GFX.quad.frustumCulled = false;
  GFX.scene = new THREE.Scene(); GFX.scene.add(GFX.quad); GFX.cam = new THREE.Camera();
}
function gfxPass(mat, target) { GFX.quad.material = mat; renderer.setRenderTarget(target); renderer.render(GFX.scene, GFX.cam); }
// called around every frame
function gfxBegin() {
  if (GFX.mode === 'off') return;
  gfxInit(); gfxTargets();
  renderer.setRenderTarget(GFX.rt);
}
function gfxEnd(t) {
  if (GFX.mode === 'off') return;
  const M = GFX.mats, ultra = GFX.mode === 'ultra';
  M.bright.uniforms.tex.value = GFX.rt.texture; M.bright.uniforms.threshold.value = ultra ? .86 : .93; gfxPass(M.bright, GFX.b0);
  const bw = GFX.b0.width, bh = GFX.b0.height;
  for (let i = 0; i < (ultra ? 3 : 2); i++) {
    M.blur.uniforms.tex.value = GFX.b0.texture; M.blur.uniforms.dir.value.set((1 + i)/bw, 0); gfxPass(M.blur, GFX.b1);
    M.blur.uniforms.tex.value = GFX.b1.texture; M.blur.uniforms.dir.value.set(0, (1 + i)/bh); gfxPass(M.blur, GFX.b0);
  }
  const F = M.final.uniforms;
  F.tex.value = GFX.rt.texture; F.bloom.value = GFX.b0.texture; F.px.value.set(1/GFX.w, 1/GFX.h); F.time.value = t % 100;
  F.bloomK.value = ultra ? .9 : .6; F.grain.value = ultra ? .035 : .02; F.fringe.value = ultra ? .0035 : 0;
  gfxPass(M.final, null);
}
// Ultra: the scene's directional light casts shadows around the player; everything solid casts and receives
function gfxShadows(dt) {
  const on = GFX.mode === 'ultra';
  if (renderer.shadowMap.enabled !== on) {
    renderer.shadowMap.enabled = on; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
  }
  moon.castShadow = on;
  if (GFX.moonBase === undefined) { GFX.moonBase = moon.intensity; scene.add(moon.target); }
  if (!on) { if (!SKY.outdoor) moon.intensity = GFX.moonBase; moon.target.position.set(0, 0, 0); moon.target.updateMatrixWorld(); return; }
  if ((GFX.shadowT -= dt) <= 0) {
    GFX.shadowT = 1;
    const s = moon.shadow; s.mapSize.set(2048, 2048); s.bias = -.0006; s.normalBias = .02;
    Object.assign(s.camera, { left:-30, right:30, top:30, bottom:-30, near:1, far:120 }); s.camera.updateProjectionMatrix();
    scene.traverse(o => { if (o.isMesh && !o.userData.noShadow && o.visible && o.material && !o.material.transparent && o.geometry && o.geometry.type !== 'PlaneGeometry') { o.castShadow = true; o.receiveShadow = true; } if (o.isMesh && o.geometry && o.geometry.type === 'PlaneGeometry') o.receiveShadow = true; });
  }
  // keep the shadow area centred on whoever is watching
  const c = camera.position, dir = SKY.lightDir;
  moon.position.set(c.x + dir.x*50, c.y + dir.y*50, c.z + dir.z*50); moon.target.position.set(c.x, 0, c.z); moon.target.updateMatrixWorld();
  if (!SKY.outdoor) moon.intensity = Math.max(GFX.moonBase, .45);
}
