"""Build trailer.html: the real game plus a virtual clock, a free camera, a sound log and the director script.
Run: python3 build_page.py  ->  ~/Downloads/hr-shot/trailer.html"""
import os
here = os.path.dirname(os.path.abspath(__file__))
s = open(os.path.join(here, '..', 'index.html')).read()
def rep(a, b, n=1):
    global s
    c = s.count(a)
    assert c == n, (a[:70], c)
    s = s.replace(a, b)
VT = r"""<script>
// virtual clock: every frame is exactly 1/30 s of game time, however slowly the recorder renders
(() => {
  let vnow = 1000, tid = 1; const timers = [], rafs = [];
  const st = setTimeout.bind(window), si = setInterval.bind(window), ct = clearTimeout.bind(window);
  window.__vt = { on:false, now:() => vnow };
  performance.now = () => vnow;
  window.requestAnimationFrame = f => { rafs.push(f); return rafs.length; };
  window.cancelAnimationFrame = () => {};
  window.setTimeout = (fn, ms, ...a) => { if (!__vt.on) return st(fn, ms, ...a); const id = tid++; timers.push({ id, at:vnow + (+ms || 0), fn, a }); return id; };
  window.setInterval = (fn, ms, ...a) => { if (!__vt.on) return si(fn, ms, ...a); const id = tid++; timers.push({ id, at:vnow + (+ms || 16), fn, a, every:+ms || 16 }); return id; };
  window.clearTimeout = window.clearInterval = id => { const i = timers.findIndex(t => t.id === id); if (i >= 0) timers.splice(i, 1); else ct(id); };
  __vt.step = ms => {
    vnow += ms;
    for (let k = 0; k < 200; k++) {
      timers.sort((a, b) => a.at - b.at); const t = timers[0];
      if (!t || t.at > vnow) break;
      if (t.every) t.at += t.every; else timers.shift();
      try { typeof t.fn === 'function' && t.fn(...t.a); } catch (e) {}
    }
    // CSS animations (callouts, kill feed) follow the virtual clock too
    for (const an of document.getAnimations()) { if (an.__v0 === undefined) { an.__v0 = vnow; an.pause(); } an.currentTime = vnow - an.__v0; if (an.currentTime >= (an.effect.getComputedTiming().endTime || 0)) an.finish(); }
    const fs = rafs.splice(0); for (const f of fs) f(vnow);
  };
})();
</script>
<style>#aimPrompt,#lockHint,#cheatTag,#touch,#menu,#pause,#end,#netStatus{display:none!important}
#tt{position:fixed;inset:0;pointer-events:none;z-index:50;font-family:"Saira Stencil One",Impact,sans-serif;color:#ece6da}
#tt .shade{position:absolute;inset:0;background:#000}
#tt .logo{position:absolute;left:50%;top:44%;transform:translate(-50%,-50%);font-size:124px;letter-spacing:.02em;white-space:nowrap;text-shadow:0 6px 0 rgba(0,0,0,.55),0 0 40px rgba(0,0,0,.6)}
#tt .tag{position:absolute;left:50%;top:62%;transform:translateX(-50%);font:700 26px "Chakra Petch",sans-serif;letter-spacing:.42em;color:#f0a23b;white-space:nowrap;text-shadow:0 2px 6px #000}
#tt .word{position:absolute;left:64px;bottom:150px;font-size:96px;letter-spacing:.04em;text-shadow:0 5px 0 rgba(0,0,0,.6)}
#tt .word i{display:block;height:10px;width:100%;background:#f0a23b;margin-top:4px}
#tt .small{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font:700 30px "Chakra Petch",sans-serif;letter-spacing:.5em;white-space:nowrap}
#tt .line{position:absolute;left:50%;bottom:110px;transform:translateX(-50%);font:700 30px "Chakra Petch",sans-serif;letter-spacing:.22em;white-space:nowrap;text-shadow:0 2px 8px #000;background:rgba(10,11,13,.55);padding:10px 22px}
#tt .url{position:absolute;left:50%;top:70%;transform:translateX(-50%);font:600 30px "Chakra Petch",sans-serif;letter-spacing:.08em;color:#ece6da;white-space:nowrap}
</style>"""
rep('<head>', '<head>' + VT)
# free camera and no first-person arms in cinematic shots
rep("renderer.clear(); renderer.render(scene, camera);", "if (window.__cam) window.__cam(camera); renderer.clear(); renderer.render(scene, camera);", 3)
rep("renderer.clearDepth(); renderer.render(vmScene, vmCam);", "if (!window.__cam) { renderer.clearDepth(); renderer.render(vmScene, vmCam); }")
# log every sound with its (virtual) time so the audio can be rebuilt in sync
rep("function sfx(t, vol = 1) {", "function sfx(t, vol = 1) {\n  if (window.__cue) window.__cue(t, vol);")
rep("const touchMode = ", """window.__g = () => ({ player, ents, CARS, CHEAT, keys, mouse, camera, startMatch, attack, dash, playerFire, carDamage, enterCar, carBoost,
  placeBuild, pickBuild, toggleBuild, BLD, addBuild, applyCheatVisuals, S, setMap:v => { mapChoice = v; }, setTeams:(n, d) => { TEAM = n; DUOS = !!d; },
  setCars:v => { carsOn = v; }, setState:v => { state = v; }, groundAt, GFX });
const touchMode = """)
# the director sets the time of day per shot
rep("SKY.tod = SKY.mode === 'day'", "SKY.tod = window.__tod != null ? window.__tod : SKY.mode === 'day'")
rep('</body>', '<div id="tt"></div>\n<script>' + open(os.path.join(here, 'director.js')).read() + '</script>\n</body>')
out = os.path.expanduser('~/Downloads/hr-shot/trailer.html')
open(out, 'w').write(s); print('wrote', out, len(s))
