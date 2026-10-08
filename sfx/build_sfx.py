"""Cut, mix and level the game's sound effects, then write them three ways:
  sfx/out/<name>.wav  44.1 kHz mono, for the trailer's audio.py
  sfx/out/<name>.mp3  what the game plays
  sfx/sfx-data.js     `const SFX_DATA = {name: base64 mp3}`, inlined into the game by patch-sfx.py
Sources: the user's Pixabay downloads in ~/Downloads (Pixabay Content License: free for commercial use, no attribution)
and Kenney's Impact, Sci-fi and Interface packs in sfx/src (CC0). Run: python3 sfx/build_sfx.py"""
import base64, os, subprocess, wave
import numpy as np

SR = 44100
here = os.path.dirname(os.path.abspath(__file__))
DL = os.path.expanduser('~/Downloads')
OUT = os.path.join(here, 'out'); os.makedirs(OUT, exist_ok=True)

def load(path):
    if not os.path.isabs(path):
        for root, _, files in os.walk(os.path.join(here, 'src')):
            if path in files: path = os.path.join(root, path); break
    raw = subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', path, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).astype(np.float64)
def cut(x, a, b=None): return x[int(a*SR):(int(b*SR) if b else None)].copy()
def fade(x, fin=.003, fout=.04):
    x = x.copy(); n = len(x); a = min(n, int(fin*SR)); b = min(n, int(fout*SR))
    if a: x[:a] *= np.linspace(0, 1, a)
    if b: x[-b:] *= np.linspace(1, 0, b)**2
    return x
def rate(x, r):
    """speed up (r > 1) or slow down (r < 1), pitch follows, like a tape"""
    n = int(len(x)/r); return np.interp(np.arange(n)*r, np.arange(len(x)), x)
def lowpass(x, hz):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1/SR); return np.fft.irfft(X/(1 + (f/hz)**4), len(x))
def highpass(x, hz):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1/SR); return np.fft.irfft(X/(1 + (hz/np.maximum(f, 1))**4), len(x))
def mix(*parts):
    """parts: (signal, gain, offset_s)"""
    n = max(int(o*SR) + len(s) for s, g, o in parts); out = np.zeros(n)
    for s, g, o in parts: i = int(o*SR); out[i:i + len(s)] += s*g
    return out
def trim_silence(x, th=.004):
    idx = np.where(np.abs(x) > th*np.abs(x).max())[0]
    return x[max(0, idx[0] - int(.002*SR)):idx[-1] + int(.01*SR)] if len(idx) else x
def level(x, peak): x = x - np.mean(x); return x/max(1e-9, np.abs(x).max())*peak

slashkut = load(f'{DL}/freesound_community-slashkut-108175.mp3')
knife_out = load(f'{DL}/u_dtbxmnju4i-taking-out-knife-217793.mp3')
shot_reload = load(f'{DL}/freesound_community-shot-and-reload-6158.mp3')
gunshot = load(f'{DL}/freesound_community-single-gunshot-54-40780.mp3')

S = {}
# knife: the first swoosh of slashkut is the slash; slowed and darker it becomes the heavier stab
S['slash'] = level(fade(cut(slashkut, .045, .36), .002, .08), .55)
S['stab'] = level(fade(mix((lowpass(rate(cut(slashkut, .045, .36), .82), 5000), 1, 0), (load('impactPunch_medium_001.ogg'), .35, .14)), .002, .08), .6)
# the second, softer swoosh, slowed down, is the dash whoosh
S['dash'] = level(fade(rate(cut(slashkut, .37, .55), .7), .01, .08), .4)
# drawing / inspecting the knife: the metallic "shing"
S['draw'] = level(fade(cut(knife_out, .05, .98), .004, .25), .45)
# AWP: a big crack with a short tail, plus a low thump for weight
crack = fade(cut(gunshot, 0, .95), .0005, .45)
S['awp'] = level(mix((crack, 1, 0), (lowpass(load('lowFrequency_explosion_000.ogg'), 180)[:int(.6*SR)], .35, 0)), .95)
# bolt action: the clacks after the shot in shot-and-reload
S['bolt'] = level(fade(cut(shot_reload, .82, 1.56), .002, .06), .5)
S['click'] = level(trim_silence(load('click_002.ogg')), .35)
S['zoom'] = level(trim_silence(load('switch_002.ogg')), .3)
# hits: a punch on the target, a heavier punch plus a bright tick when it kills
S['hit'] = level(trim_silence(load('impactPunch_medium_000.ogg')), .55)
tick = load('impactBell_heavy_001.ogg'); tick = highpass(rate(trim_silence(tick), 1.6), 1500)[:int(.35*SR)]
S['kill'] = level(fade(mix((trim_silence(load('impactPunch_heavy_000.ogg')), 1, 0), (tick, .28, .02)), .001, .12), .6)
S['hurt'] = level(trim_silence(load('impactSoft_heavy_001.ogg')), .5)
S['thud'] = level(trim_silence(load('impactSoft_heavy_003.ogg')), .55)
# cars
S['crash'] = level(fade(mix((trim_silence(load('impactMetal_heavy_001.ogg')), 1, 0), (trim_silence(load('impactPlate_heavy_002.ogg')), .6, .015)), .001, .15), .75)
S['door'] = level(fade(mix((trim_silence(load('impactMetal_medium_002.ogg')), 1, 0), (trim_silence(load('click_004.ogg')), .4, 0)), .001, .08), .45)
# tire pop: a sharp bang that dies fast, then a short hiss of air
bang = trim_silence(load('explosionCrunch_002.ogg'))[:int(.5*SR)]; bang *= np.exp(-np.arange(len(bang))/SR*14)
hiss = highpass(np.random.default_rng(3).uniform(-1, 1, int(.45*SR)), 3500)*np.exp(-np.arange(int(.45*SR))/SR*6)
S['pop'] = level(fade(mix((bang, 1, 0), (hiss, .12, .03), (highpass(trim_silence(load('impactGlass_light_001.ogg')), 2000), .25, 0)), .001, .1), .65)
# car explosion: a slowed low blast, two crunches and a long rumbling tail
n = int(2.2*SR); rumble = lowpass(np.random.default_rng(5).uniform(-1, 1, n), 140)*np.exp(-np.arange(n)/SR*1.8)
rumble = rumble/np.abs(rumble).max()
S['boom'] = level(fade(mix((rate(load('lowFrequency_explosion_000.ogg'), .75), 1, 0), (trim_silence(load('explosionCrunch_000.ogg')), .7, 0),
                           (trim_silence(load('explosionCrunch_003.ogg')), .45, .09), (rumble, .55, .05)), .001, .5), .95)

datajs = ['/* ---------- sound effects (generated by sfx/build_sfx.py; Pixabay + Kenney CC0 sources) ---------- */', 'const SFX_DATA = {']
for name, x in S.items():
    pcm = (np.clip(x, -1, 1)*32767).astype(np.int16)
    w = os.path.join(OUT, name + '.wav')
    with wave.open(w, 'wb') as f: f.setnchannels(1); f.setsampwidth(2); f.setframerate(SR); f.writeframes(pcm.tobytes())
    m = os.path.join(OUT, name + '.mp3')
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', w, '-ac', '1', '-ar', '44100', '-b:a', '80k', m], check=True)
    datajs.append(f"  {name}:'{base64.b64encode(open(m, 'rb').read()).decode()}',")
    print(f'{name:6s} {len(x)/SR:5.2f} s  {os.path.getsize(m)/1024:5.1f} KB')
datajs.append('};')
open(os.path.join(here, 'sfx-data.js'), 'w').write('\n'.join(datajs) + '\n')
print('sfx-data.js', round(os.path.getsize(os.path.join(here, 'sfx-data.js'))/1024), 'KB')
