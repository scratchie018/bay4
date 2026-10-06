"""Build the admin site: the GitHub game + admin.js (debug, creator and admin tools).
Run: python3 build_admin.py  ->  ~/src/drift-admin/index.html (+ car.glb)"""
import os, shutil
here = os.path.dirname(os.path.abspath(__file__)); root = os.path.join(here, '..')
out = os.path.expanduser('~/src/drift-admin'); os.makedirs(out, exist_ok=True)
s = open(os.path.join(root, 'index.html')).read()
def rep(a, b, n=1):
    global s
    c = s.count(a); assert c == n, (a[:70], c); s = s.replace(a, b)
rep('<title>Drift And Bolt</title>', '<title>Drift And Bolt · Admin</title><meta name="robots" content="noindex">')
rep("renderer.clear(); renderer.render(scene, camera);", "if (window.__cam) window.__cam(camera); renderer.clear(); renderer.render(scene, camera);", 3)
rep("renderer.clearDepth(); renderer.render(vmScene, vmCam);", "if (!window.__cam) { renderer.clearDepth(); renderer.render(vmScene, vmCam); }")
rep("const dt = Math.min(1/30, (now - last)/1000)*(cheat('slowmo') && state === 'play' ? .4 : 1);", "const dt = Math.min(1/30, (now - last)/1000)*(cheat('slowmo') && state === 'play' ? .4 : 1)*ADM.timeScale;")
rep("""  render(now/1000, dt);
  // clips:""", """  render(now/1000, dt);
  admShot(); admFrame(Math.max(dt, (now - (frame.prev || now))/1000)); frame.prev = now;
  // clips:""")
# your own body (shown in free camera) jumps with you
rep("M.g.position.set(e.x*S, e.remote ? Math.max(-30, e.jumpY || 0) : 0, e.y*S);", "M.g.position.set(e.x*S, e.remote || e.isPlayer ? Math.max(-30, e.jumpY || 0) : 0, e.y*S);")
rep("function update(dt) {", open(os.path.join(here, 'admin.js')).read() + "\nfunction update(dt) {")
CSS = """<style>
#adm{position:fixed;right:0;top:0;bottom:0;width:min(380px,100vw);background:rgba(14,16,19,.94);border-left:1px solid #343a44;z-index:60;color:#e9ecf1;font:13px/1.35 system-ui,sans-serif;display:flex;flex-direction:column}
#adm .head{display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-bottom:1px solid #2a2e36}
#adm .tabs{display:flex;gap:2px;padding:6px 8px;border-bottom:1px solid #2a2e36;flex-wrap:wrap}
#adm .body{overflow:auto;padding:8px 12px 20px}
#adm h4{margin:12px 0 6px;font-size:11px;letter-spacing:.1em;color:#8f99a6}
#adm .g{display:flex;flex-wrap:wrap;gap:5px;margin:4px 0}
#adm button{appearance:none;border:1px solid #343a44;background:#20242b;color:#e9ecf1;border-radius:6px;padding:5px 8px;font:inherit;cursor:pointer}
#adm button.on{background:#2d8cff;border-color:#2d8cff}#adm button:disabled{opacity:.4;cursor:not-allowed}
#adm .k{color:#8f99a6;font-size:12px}#adm .lock{color:#e5484d;font-size:10px;margin-left:6px}
#adm label{display:flex;gap:8px;align-items:center;margin:6px 0;color:#b9c1cb}#adm input[type=range]{flex:1}
#adm input:not([type]),#adm #admSay{flex:1;background:#0d0f12;border:1px solid #343a44;color:#e9ecf1;padding:5px 8px;border-radius:6px}
#adm pre{white-space:pre-wrap;font:11px/1.4 ui-monospace,monospace;max-height:70vh;overflow:auto;background:#0b0c0f;padding:8px;border-radius:6px}
#adm table{width:100%;font-size:11px;border-collapse:collapse}#adm td,#adm th{padding:3px 4px;border-bottom:1px solid #22262d;text-align:left}
#adm .pl{padding:6px 0;border-bottom:1px solid #22262d}#adm .pl .g button{padding:3px 6px;font-size:11px}
#admStats{position:fixed;left:16px;top:180px;z-index:55;background:rgba(10,11,13,.8);color:#9ff0a8;font:11px/1.4 ui-monospace,monospace;padding:6px 9px;white-space:pre;pointer-events:none}
#admToast{position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:70;background:#2d8cff;color:#fff;padding:7px 14px;border-radius:8px;font:13px system-ui,sans-serif}
#admOpen{position:fixed;right:10px;top:10px;z-index:58;appearance:none;border:1px solid #2d8cff;background:rgba(14,16,19,.85);color:#9cc8ff;font:700 11px system-ui,sans-serif;letter-spacing:.1em;padding:6px 10px;border-radius:6px;cursor:pointer}
[hidden]{display:none!important}
</style>"""
rep('</head>', CSS + '</head>')
rep('<div id="recInd" hidden>', '<div id="adm" hidden></div><pre id="admStats" hidden></pre><div id="admToast" hidden></div><button id="admOpen" type="button" onclick="dispatchEvent(new KeyboardEvent(\'keydown\',{code:\'F2\'}))">ADMIN · F2</button><div id="recInd" hidden>')
open(os.path.join(out, 'index.html'), 'w').write(s)
shutil.copy(os.path.join(root, 'car.glb'), os.path.join(out, 'car.glb'))
open(os.path.join(out, 'README.md'), 'w').write("# Drift And Bolt · Admin\n\nThe same game as https://scratchie018.github.io/bay4/ with debug, creator and admin tools (F2).\nWorld-changing tools only work offline, in cheats rooms or with the owner key; player commands are signed with the owner key.\nBuilt from scratchie018/bay4 by `admin/build_admin.py` — don't edit this copy by hand.\n")
print('wrote', out)
