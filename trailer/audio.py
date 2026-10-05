"""Soundtrack for the trailer: synthesized music (120 BPM, A minor) plus the game's sound effects at the times the
director logged them (cues.json). Usage: python3 audio.py <cues.json> <out.wav> [length_s]"""
import json, sys, wave
import numpy as np

SR = 44100
cues = json.load(open(sys.argv[1]))
OUT = sys.argv[2]
LEN = float(sys.argv[3]) if len(sys.argv) > 3 else 48.0
N = int(SR*LEN)
rng = np.random.default_rng(7)
BPM = 120; BEAT = 60/BPM; BAR = 4*BEAT
CUTS = [3, 8, 14, 18, 24, 28, 32, 38, 42]

def t_(sec): return np.arange(int(sec*SR))/SR
def env(n, a=.005, r=None, curve=4.0):
    e = np.ones(n)
    na = max(1, int(a*SR)); e[:na] = np.linspace(0, 1, na)
    if r is None: e *= np.exp(-curve*np.linspace(0, 1, n))
    return e
def saw(f, n, phase=0.0):
    f = np.broadcast_to(np.asarray(f, float), (n,))
    ph = (phase + np.cumsum(f)/SR) % 1.0
    return 2*ph - 1
def sine(f, n):
    f = np.broadcast_to(np.asarray(f, float), (n,))
    return np.sin(2*np.pi*np.cumsum(f)/SR)
def noise(n): return rng.uniform(-1, 1, n)
def fft_filter(x, lo=None, hi=None):
    X = np.fft.rfft(x); fr = np.fft.rfftfreq(len(x), 1/SR); m = np.ones_like(fr)
    if lo: m *= 1/(1 + (lo/np.maximum(fr, 1))**4)
    if hi: m *= 1/(1 + (fr/hi)**4)
    return np.fft.irfft(X*m, len(x))
def sweep_filter(x, lo_fn=None, hi_fn=None, win=2048):
    """time-varying filter: overlap-add of short windows, each with its own cutoffs (fn of 0..1 progress)"""
    out = np.zeros(len(x) + win); hop = win//2; w = np.hanning(win)
    fr = np.fft.rfftfreq(win, 1/SR)
    for s in range(0, len(x), hop):
        seg = np.zeros(win); chunk = x[s:s + win]; seg[:len(chunk)] = chunk
        p = min(1, s/max(1, len(x) - 1)); m = np.ones_like(fr)
        if lo_fn: lo = lo_fn(p); m *= 1/(1 + (lo/np.maximum(fr, 1))**4)
        if hi_fn: hi = hi_fn(p); m *= 1/(1 + (fr/hi)**4)
        out[s:s + win] += np.fft.irfft(np.fft.rfft(seg*w)*m, win)
    return out[:len(x)]
def add(buf, at, sig, gain=1.0):
    i = int(at*SR)
    if i >= len(buf) or i + len(sig) <= 0: return
    j = min(len(buf), i + len(sig)); k0 = max(0, -i)
    buf[max(0, i):j] += sig[k0:k0 + j - max(0, i)]*gain
def note(n): return 440*2**((n - 69)/12)

music = np.zeros(N); sfx = np.zeros(N)

# ---------- drums ----------
def kick():
    n = int(.42*SR); f = 48 + 120*np.exp(-np.linspace(0, 1, n)*18)
    return np.tanh(sine(f, n)*env(n, .002, curve=5)*1.6)*.9 + fft_filter(noise(n), hi=3000)*env(n, .001, curve=60)*.25
def snare():
    n = int(.3*SR)
    return fft_filter(noise(n), lo=1200, hi=9000)*env(n, .001, curve=9)*.55 + sine(190 - 40*np.linspace(0, 1, n), n)*env(n, .001, curve=14)*.35
def hat(open_=False):
    n = int((.22 if open_ else .05)*SR)
    return fft_filter(noise(n), lo=7000)*env(n, .001, curve=6 if open_ else 30)*.22
def impact():
    n = int(2.2*SR)
    return np.tanh(sine(55*np.exp(-np.linspace(0, 1, n)*1.6), n)*env(n, .002, curve=3)*2)*.9 + fft_filter(noise(n), hi=1800)*env(n, .002, curve=6)*.5
def riser(sec):
    n = int(sec*SR); p = np.linspace(0, 1, n)
    return sweep_filter(noise(n), lo_fn=lambda q: 300 + 6000*q**2, hi_fn=lambda q: 900 + 12000*q**2)*p**2*.45
def downlift(sec=1.2):
    n = int(sec*SR); p = np.linspace(0, 1, n)
    return sweep_filter(noise(n), hi_fn=lambda q: 9000*(1 - q) + 300)*(1 - p)**2*.25

K, SN, H, HO, IMP = kick(), snare(), hat(), hat(True), impact()
# ---------- harmony: Am - F - C - G ----------
ROOTS = [57, 53, 60, 55]   # A3 F3 C4 G3 (bass two octaves down)
def bass_note(midi, sec):
    n = int(sec*SR); f = note(midi)
    s = saw(f, n)*.6 + saw(f*1.005, n)*.4 + sine(f/2, n)*.6
    return fft_filter(s, hi=700)*env(n, .004, curve=3)*.38
def pad(midi_list, sec, bright=1400):
    n = int(sec*SR); s = np.zeros(n)
    for m in midi_list:
        for det in (-.12, .0, .13): s += saw(note(m + det), n)*.18
    a = np.minimum(1, np.linspace(0, sec/1.2, n)); r = np.minimum(1, np.linspace(sec/.8, 0, n))
    return fft_filter(s, hi=bright)*a*r*.35
def stab(midi_list, sec=.35):
    n = int(sec*SR); s = sum(saw(note(m), n) + saw(note(m)*1.007, n) for m in midi_list)
    return fft_filter(s, lo=200, hi=3500)*env(n, .002, curve=7)*.12

# intro drone 0-8, rising pulse 3-8, riser into the drop
add(music, 0, pad([45, 52, 57], 8.2, bright=500), .9)
for i in range(int((8 - 3)/(BEAT/2))):
    t = 3 + i*BEAT/2; add(music, t, bass_note(33 if (i//8) % 2 == 0 else 29, BEAT/2*.9), .25 + .6*i/((8 - 3)/(BEAT/2)))
add(music, 6.0, riser(2.0), 1.0)
# main groove 8-38 (breakdown-free), then breakdown 38-42 with a riser, final hit at 42
def groove(t0, t1, half=False):
    t = t0
    while t < t1 - 1e-6:
        b = int(round((t - 8)/BEAT)); bar = int((t - 8)//BAR) % 4; pos = b % 4
        if not half or pos in (0,): add(music, t, K, .95)
        if pos in (1, 3) and not half: add(music, t, SN, .9)
        if half and pos == 2: add(music, t, SN, .8)
        for h in range(4):
            if not half or h % 2 == 0: add(music, t + h*BEAT/4, HO if (h == 2 and pos == 3) else H, .9 if h % 2 == 0 else .6)
        root = ROOTS[bar]
        for e in range(2):
            pat = [0, 0, 12, 0][(pos*2 + e) % 4]
            if not half: add(music, t + e*BEAT/2, bass_note(root - 24 + pat, BEAT/2*.92), 1.0)
        if pos == 0: add(music, t, stab([root, root + 3 if bar == 0 else root + 4, root + 7]), 1.0)
        t += BEAT
groove(8, 38)
for b in range(int(30/BAR)): add(music, 8 + b*BAR, pad([ROOTS[b % 4], ROOTS[b % 4] + (3 if b % 4 == 0 else 4), ROOTS[b % 4] + 7], BAR, bright=2200), .5)
add(music, 38, pad([45, 52, 57, 60], 4.2, bright=900), .9)
groove(38, 42, half=True)
add(music, 40.0, riser(2.0), 1.1)
add(music, 42, pad([45, 52, 57, 64], 6.0, bright=1600), 1.0)
for c in CUTS[2:]:
    add(music, c, IMP, .8 if c != 42 else 1.2)
    add(music, c - 1.0, riser(1.0)*.5, .6)
add(music, 8, IMP, 1.3)

# ---------- game sounds from the director's log ----------
def s_slash(): n = int(.16*SR); return sweep_filter(noise(n), lo_fn=lambda q: 900 + 2500*q, hi_fn=lambda q: 3000 + 4000*q, win=512)*env(n, .002, curve=6)*.8
def s_stab(): n = int(.22*SR); return sweep_filter(noise(n), lo_fn=lambda q: 500 + 1300*q, hi_fn=lambda q: 1800 + 2500*q, win=512)*env(n, .002, curve=5)*.8
def s_dash(): n = int(.25*SR); return sweep_filter(noise(n), lo_fn=lambda q: 250 + 700*q, hi_fn=lambda q: 1200 + 1500*q, win=512)*env(n, .02, curve=4)*.6
def s_hit(): n = int(.14*SR); return sine(170*np.exp(-np.linspace(0, 1, n)*1.1), n)*env(n, .001, curve=6)*.9
def s_kill(): n = int(.3*SR); return (sine(320*np.exp(-np.linspace(0, 1, n)*1.27), n)*.5 + np.sign(sine(640, n))*.08)*env(n, .002, curve=5)
def s_awp():
    n = int(.9*SR)
    return fft_filter(noise(n), hi=4000)*env(n, .0005, curve=7)*1.1 + np.tanh(sine(90*np.exp(-np.linspace(0, 1, n)*1), n)*2)*env(n, .001, curve=5)*.8
def s_click(): n = int(.04*SR); return fft_filter(noise(n), lo=2500, hi=4000)*env(n, .0005, curve=12)*.5
def s_bolt(): return np.concatenate([s_click(), np.zeros(int(.15*SR)), s_click()])
def s_thud(): n = int(.35*SR); return fft_filter(noise(n), hi=700)*env(n, .001, curve=6)*.9 + sine(80*np.exp(-np.linspace(0, 1, n)*.8), n)*env(n, .001, curve=6)*.7
def s_pop(): n = int(.3*SR); return fft_filter(noise(n), lo=1200)*env(n, .0005, curve=10)*.8 + fft_filter(noise(n), hi=500)*env(n, .001, curve=6)*.5
def s_boom():
    n = int(2.6*SR)
    return np.tanh((fft_filter(noise(n), hi=2500)*env(n, .002, curve=4)*1.4 + sine(60*np.exp(-np.linspace(0, 1, n)*1.2), n)*env(n, .002, curve=3)*1.2)*1.5)*.95
def s_door(): n = int(.2*SR); return fft_filter(noise(n), lo=300, hi=1500)*env(n, .002, curve=8)*.6
def s_zoom(): n = int(.03*SR); return fft_filter(noise(n), lo=3500)*env(n, .0005, curve=10)*.4
SFX = { 'slash':(s_slash, 1), 'stab':(s_stab, 1), 'dash':(s_dash, .9), 'hit':(s_hit, .8), 'kill':(s_kill, .8), 'awp':(s_awp, 1.1), 'click':(s_click, .7),
        'bolt':(s_bolt, .6), 'thud':(s_thud, .9), 'pop':(s_pop, 1), 'boom':(s_boom, 1.3), 'door':(s_door, .7), 'zoom':(s_zoom, .7), 'whiz':(s_dash, .5), 'hurt':(s_hit, .4) }
cache = {}
eng = []
for c in cues:
    if c['name'] == 'engine': eng.append((c['t'], c['vol'])); continue
    if c['name'] not in SFX: continue
    fn, g = SFX[c['name']]
    if c['name'] not in cache: cache[c['name']] = fn()
    vol = max(.35, min(1.0, c['vol'])) if c['name'] != 'boom' else 1.0
    add(sfx, c['t'], cache[c['name']], g*vol)
# engine: a saw that follows the logged speed
if eng:
    ts = np.array([e[0] for e in eng]); sp = np.array([e[1] for e in eng])
    t0, t1 = ts[0], ts[-1] + 1/30; n = int((t1 - t0)*SR); tt = t0 + np.arange(n)/SR
    s = np.interp(tt, ts, sp); r = np.clip(s, 0, 1.5); gear = (r*4) % 1
    f = 34 + r*55 + gear*38
    e = saw(f, n)*.6 + saw(f*2.01, n)*.25
    e = sweep_filter(e, hi_fn=lambda q: 400 + 900*np.interp(t0 + q*(t1 - t0), ts, sp))
    fade = np.minimum(1, np.minimum(np.arange(n)/(.15*SR), (n - np.arange(n))/(.3*SR)))
    add(sfx, t0, e*fade*.55, 1.0)

# ---------- mix ----------
mix = music*.8 + sfx*.9
# duck the music a little under big sounds
env_s = np.convolve(np.abs(sfx), np.ones(2048)/2048, mode='same')
mix = music*.8*(1 - np.clip(env_s*1.5, 0, .45)) + sfx*.9
fade_in = np.minimum(1, np.arange(N)/(.5*SR)); mix *= fade_in
fade_out = np.ones(N); fo = int(1.2*SR); fade_out[-fo:] = np.linspace(1, 0, fo); mix *= fade_out
mix = np.tanh(mix*1.1)*.9
mix /= max(1e-9, np.max(np.abs(mix)))/.95
st = np.stack([mix, np.roll(mix, int(.012*SR))*.96 + mix*.04], axis=1)   # a touch of width
pcm = (np.clip(st, -1, 1)*32767).astype(np.int16)
with wave.open(OUT, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print('wrote', OUT, f'{LEN:.1f} s')
