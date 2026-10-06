"""Build the CrazyGames HTML5 bundle from index.html.
Output: ~/src/drift-crazy/ (index.html, car.glb, lib/, fonts/) and ~/Downloads/drift-and-bolt-crazygames.zip
Run: python3 build_crazy.py"""
import os, re, shutil, subprocess, urllib.request, zipfile
here = os.path.dirname(os.path.abspath(__file__)); root = os.path.join(here, '..')
out = os.path.expanduser('~/src/drift-crazy')
os.makedirs(os.path.join(out, 'lib'), exist_ok=True); os.makedirs(os.path.join(out, 'fonts'), exist_ok=True)
UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36'
def get(url, path):
    if os.path.exists(path) and os.path.getsize(path) > 0: return
    req = urllib.request.Request(url, headers={'User-Agent':UA})
    with urllib.request.urlopen(req, timeout=60) as r, open(path, 'wb') as f: f.write(r.read())
# bundle the libraries and fonts (relative paths only)
get('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js', os.path.join(out, 'lib/three.min.js'))
get('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js', os.path.join(out, 'lib/GLTFLoader.js'))
get('https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js', os.path.join(out, 'lib/peerjs.min.js'))
css_url = 'https://fonts.googleapis.com/css2?family=Saira+Stencil+One&family=Chakra+Petch:wght@400;500;600;700&display=swap'
req = urllib.request.Request(css_url, headers={'User-Agent':UA}); css = urllib.request.urlopen(req, timeout=60).read().decode()
blocks = re.findall(r'/\* ([\w-]+) \*/\s*(@font-face\s*\{.*?\})', css, re.S)
local = []
for subset, block in blocks:
    if subset not in ('latin', 'latin-ext'): continue
    url = re.search(r'url\((https://[^)]+)\)', block).group(1)
    name = re.sub(r'[^\w.-]', '_', url.split('/')[-1]); fam = re.search(r"font-family: '([^']+)'", block).group(1).replace(' ', ''); wt = re.search(r'font-weight: (\d+)', block).group(1)
    fn = f'{fam}-{wt}-{subset}-{name}'; get(url, os.path.join(out, 'fonts', fn))
    local.append(block.replace(url, fn))
open(os.path.join(out, 'fonts/fonts.css'), 'w').write('\n'.join(local))

s = open(os.path.join(root, 'index.html')).read()
def rep(a, b, n=1):
    global s
    c = s.count(a); assert c == n, (a[:80], c); s = s.replace(a, b)
# libraries and fonts from the bundle; the CrazyGames SDK from CrazyGames
s, n = re.subn(r'<link rel="preconnect" href="https://fonts.googleapis.com">\s*<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\s*<link rel="stylesheet" href="https://fonts.googleapis.com/css2[^"]*">', '<link rel="stylesheet" href="fonts/fonts.css">', s); assert n == 1
rep('<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"', '<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>\n<script src="lib/three.min.js"')
rep('src="https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js"', 'src="lib/peerjs.min.js"')
rep('src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js"', 'src="lib/GLTFLoader.js"')
# no custom fullscreen / orientation lock (the platform handles it)
rep("function phoneScreen() {\n  if (!touchMode) return;", "function phoneScreen() {\n  return;")
# PEGI 12: hit sparks and scorch marks instead of blood
rep("new THREE.PointsMaterial({ color:0x8e1222, size:.06 })", "new THREE.PointsMaterial({ color:0xffb35c, size:.05 })")
rep("fx.fillStyle = `rgba(${110+rand(0,30)|0},10,20,${a})`;", "fx.fillStyle = `rgba(22,20,18,${a*.55})`;")
# original names, no outbound links, no cross-promotion
s = s.replace("'AMG GT-R · BOOST' : 'AMG GT-R'", "'SPORTS CAR · BOOST' : 'SPORTS CAR'")
s = re.sub(r'<p class="ver">Car: .*?</p>', '<p class="ver">Car model: "Low Poly Mercedes-AMG GT-R" by kulonee (Sketchfab), CC BY 4.0. Textures: Screaming Brain Studios, CC0.</p>', s, count=1, flags=re.S)
s = re.sub(r"<p class=\"rule\">Play against friends\. Send them this page's link.*?</p>", '<p class="rule">Play with friends: press <b>Invite</b> on CrazyGames, or share a room code. Everyone with the same room code and settings plays together.</p>', s, count=1, flags=re.S)
s = s.replace('<p class="ver" id="ver">', '<p class="ver" id="ver" hidden>')
# features this build leaves out: voice chat, custom maps, clip downloads
rep('<div class="netrow">\n          <div class="seg" id="voicePick">', '<div class="netrow" hidden>\n          <div class="seg" id="voicePick">')
rep('<div class="group"><span class="lbl">CLIPS</span>', '<div class="group" hidden><span class="lbl">CLIPS</span>')
for line in ['        <div>Talk / team radio (online) <span><kbd>V</kbd><kbd>G</kbd></span></div>\n', '        <div>Record / save replay <span><kbd>F8</kbd><kbd>F9</kbd></span></div>\n']: rep(line, '')
rep('<button class="ghost" type="button" id="mapLoadBtn">Load map (.glb)</button>', '<button class="ghost" type="button" id="mapLoadBtn" hidden>Load map (.glb)</button>')
rep('<button class="ghost" id="recTouch" type="button">Rec</button>', '<button class="ghost" id="recTouch" type="button" hidden>Rec</button>')
# its own rooms (never mixes with the GitHub version), names filtered
s = s.replace("${carsOn ? '' : '-nc'}-${NET.code}", "${carsOn ? '' : '-nc'}-cg-${NET.code}")
rep("e = mk(cleanText(pr.n, 14) || 'Player',", "e = mk(cgClean(cleanText(pr.n, 14)) || 'Player',")
rep("e.name = (cleanText(pr.n, 14) || 'Player')", "e.name = (cgClean(cleanText(pr.n, 14)) || 'Player')")
rep("function update(dt) {", open(os.path.join(here, 'crazy.js')).read() + "\nfunction update(dt) {")
open(os.path.join(out, 'index.html'), 'w').write(s)
shutil.copy(os.path.join(root, 'car.glb'), os.path.join(out, 'car.glb'))
z = os.path.expanduser('~/Downloads/drift-and-bolt-crazygames.zip')
with zipfile.ZipFile(z, 'w', zipfile.ZIP_DEFLATED) as zf:
    for dp, _, fs in os.walk(out):
        for f in fs:
            if f.startswith('.'): continue
            p = os.path.join(dp, f); zf.write(p, os.path.relpath(p, out))
print('wrote', out, 'and', z, f'{os.path.getsize(z)/1048576:.1f} MB')
