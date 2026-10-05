"""Clean up the user's player model (OBJ from Blender) and cut it into rig parts for Hook & Ring.

Fixes: turned to face +X (the game's forward), chest lean straightened, arms moved out to the shoulders
with hands added, legs separated and lengthened, the lump on the face pulled in, centred and scaled to 1.78 m.

Writes:
  player.json             parts for the game: {part: {pivot:[x,y,z], p:[flat triangle positions relative to pivot]}}
  player_rigged.glb       the same model with a skeleton (hips, spine, head, arms, legs) for Blender
  player_fixed.obj        the fixed mesh, unrigged
Run: python3 player_build.py "<path to obj>" <output dir for glb/obj>
"""
import json, math, os, struct, sys

src = sys.argv[1]
outdir = sys.argv[2] if len(sys.argv) > 2 else '.'
here = os.path.dirname(os.path.abspath(__file__))

V, F = [], []
for line in open(src):
    p = line.split()
    if not p: continue
    if p[0] == 'v': V.append([float(x) for x in p[1:4]])
    elif p[0] == 'f':
        idx = [int(x.split('/')[0]) - 1 for x in p[1:]]
        for i in range(1, len(idx) - 1): F.append((idx[0], idx[i], idx[i + 1]))

# 1. face +X: turn 180 degrees about Y
V = [[-x, y, -z] for x, y, z in V]

def centroid(f): return [sum(V[i][k] for i in f)/3 for k in range(3)]

# 2. sort every triangle into a body part (before moving anything)
HIP_Y, NECK_Y = 1.21, 10.0
def part_of(f):
    x, y, z = centroid(f)
    if y >= NECK_Y: return 'head'
    if y < HIP_Y - .01: return 'legR' if z > 0 else 'legL'
    if 4.6 < y < 9.55 and abs(z) > 1.85: return 'armR' if z > 0 else 'armL'
    return 'body'
parts = {}
for f in F: parts.setdefault(part_of(f), []).append(f)

# work on per-part copies of the vertices so each part can be moved on its own
P = {k: {i: list(V[i]) for f in fs for i in f} for k, fs in parts.items()}

# 3. straighten the chest: rings above the waist lean back; shift them forward to sit over the hips
pelvis = [v for v in V if abs(v[1] - 3.26) < .05]
cx0 = sum(v[0] for v in pelvis)/len(pelvis); cz0 = sum(v[2] for v in pelvis)/len(pelvis)
def ring_cx(y): r = [v for v in V if abs(v[1] - y) < .05]; return sum(v[0] for v in r)/len(r)
lean = [(7.19, cx0 - ring_cx(7.19)), (8.49, cx0 - ring_cx(8.49)), (9.59, cx0 - ring_cx(9.59))]
def lean_at(y):
    if y <= 3.26: return 0
    pts = [(3.26, 0)] + lean
    for (y0, a), (y1, b) in zip(pts, pts[1:]):
        if y <= y1: return a + (b - a)*(y - y0)/(y1 - y0)
    return lean[-1][1]
# 4. head: centre it over the hips. Above the shoulders the shift blends from the chest's to the head's,
#    using the same function for torso and head so the neck triangles they share line up.
top = [v for v in V if abs(v[1] - 14.16) < .05]
hx = sum(v[0] for v in top)/len(top)
def shift_at(y):
    if y <= 9.59: return lean_at(y)
    k = min(1, max(0, (y - 9.59)/(11.5 - 9.59)))
    return lean[-1][1]*(1 - k) + (cx0 - hx)*k
for key in ('body', 'head'):
    for v in P[key].values(): v[0] += shift_at(v[1])
for v in P['head'].values():
    dx = v[0] - cx0
    if dx > 1.25: v[0] = cx0 + 1.25 + (dx - 1.25)*.35

# 5. arms: centre them front-to-back on the shoulders and move them out so they don't sink into the chest
for side, key in ((1, 'armR'), (-1, 'armL')):
    a = P[key].values()
    ax = (min(v[0] for v in a) + max(v[0] for v in a))/2
    inner = min(abs(v[2]) for v in a)
    for v in a: v[0] += cx0 - ax; v[2] += side*(1.7 - inner)

# 6. legs: stretch the shins 1.6x, keep the feet the same size, open a small gap between the legs
STRETCH, FOOT_TOP = 1.6, -1.74
for side, key in ((1, 'legR'), (-1, 'legL')):
    for v in P[key].values():
        if v[1] >= FOOT_TOP: v[1] = HIP_Y - (HIP_Y - v[1])*STRETCH
        else: v[1] = v[1] - (HIP_Y - FOOT_TOP)*(STRETCH - 1)
        v[2] += side*.15

# 7. hands: a chunky box under each arm
tris = {k: [tuple(tuple(P[k][i]) for i in f) for f in fs] for k, fs in parts.items()}
def box(cx, cy, cz, sx, sy, sz):
    c = [(cx + dx*sx/2, cy + dy*sy/2, cz + dz*sz/2) for dx in (-1, 1) for dy in (-1, 1) for dz in (-1, 1)]
    q = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
    return [t for a, b, c2, d in q for t in ((c[a], c[b], c[c2]), (c[a], c[c2], c[d]))]
for key in ('armR', 'armL'):
    pts = [p for t in tris[key] for p in t]
    lo = min(p[1] for p in pts)
    bottom = [p for p in pts if p[1] < lo + .3]
    bx = sum(p[0] for p in bottom)/len(bottom); bz = sum(p[2] for p in bottom)/len(bottom)
    tris[key] += box(bx, lo - .55, bz, 1.1, 1.1, 1.1)

# 8. centre on the hips, feet on the floor, scale to 1.78 m
allp = [p for ts in tris.values() for t in ts for p in t]
miny, maxy = min(p[1] for p in allp), max(p[1] for p in allp)
k = 1.78/(maxy - miny)
def T(p): return ((p[0] - cx0)*k, (p[1] - miny)*k, (p[2] - cz0)*k)
tris = {key: [tuple(T(p) for p in t) for t in ts] for key, ts in tris.items()}

# make every triangle face outward (some came in wound the wrong way): compare its normal with centre->triangle
def fix_winding(ts):
    pts = [p for t in ts for p in t]
    c = [sum(p[i] for p in pts)/len(pts) for i in range(3)]
    out = []
    for a, b, d in ts:
        u = [b[i] - a[i] for i in range(3)]; w = [d[i] - a[i] for i in range(3)]
        n = (u[1]*w[2] - u[2]*w[1], u[2]*w[0] - u[0]*w[2], u[0]*w[1] - u[1]*w[0])
        m = [(a[i] + b[i] + d[i])/3 - c[i] for i in range(3)]
        out.append((a, b, d) if sum(n[i]*m[i] for i in range(3)) >= 0 else (a, d, b))
    return out
tris = {key: fix_winding(ts) for key, ts in tris.items()}

# 9. joints
def bbox(key):
    pts = [p for t in tris[key] for p in t]
    return [min(p[i] for p in pts) for i in range(3)], [max(p[i] for p in pts) for i in range(3)]
hip_y = (HIP_Y - miny)*k
pivots = {'body': (0, 0, 0)}
for key in ('legR', 'legL'):
    topv = [p for t in tris[key] for p in t if p[1] > hip_y - .05]
    pivots[key] = (round(sum(p[0] for p in topv)/len(topv), 4), round(hip_y, 4), round(sum(p[2] for p in topv)/len(topv), 4))
for key in ('armR', 'armL'):
    lo, hi = bbox(key); pivots[key] = (round((lo[0] + hi[0])/2, 4), round(hi[1] - .05, 4), round((lo[2] + hi[2])/2, 4))
lo, hi = bbox('head'); pivots['head'] = (0, round(lo[1] + .02, 4), 0)

out = {}
for key, ts in tris.items():
    px, py, pz = pivots[key]
    out[key] = dict(pivot=list(pivots[key]), p=[round(c, 4) for t in ts for (x, y, z) in t for c in (x - px, y - py, z - pz)])
info = {key: dict(tris=len(ts)) for key, ts in tris.items()}
lo, hi = bbox('armR'); out['meta'] = dict(height=1.78, armLen=round(hi[1] - lo[1], 4), hipY=round(hip_y, 4))
json.dump(out, open(os.path.join(here, 'player.json'), 'w'), separators=(',', ':'))
print('parts', info, 'meta', out['meta'], 'pivots', pivots)

# ---------- fixed OBJ ----------
with open(os.path.join(outdir, 'player_fixed.obj'), 'w') as f:
    f.write('# Hook & Ring player, cleaned up\n')
    n = 1
    for key, ts in tris.items():
        f.write(f'o {key}\n')
        for t in ts:
            for p in t: f.write('v %.4f %.4f %.4f\n' % p)
            f.write(f'f {n} {n+1} {n+2}\n'); n += 3

# ---------- rigged GLB: one skinned mesh, each part weighted fully to its bone ----------
bones = [('hips', None, (0, hip_y, 0)), ('spine', 'hips', (0, hip_y + .3, 0)), ('head', 'spine', pivots['head']),
         ('arm.R', 'spine', pivots['armR']), ('arm.L', 'spine', pivots['armL']), ('leg.R', 'hips', pivots['legR']), ('leg.L', 'hips', pivots['legL'])]
bone_of = {'body': 1, 'head': 2, 'armR': 3, 'armL': 4, 'legR': 5, 'legL': 6}
mats = [('Shirt', (0.55, 0.42, 0.25, 1)), ('Pants', (0.14, 0.15, 0.17, 1)), ('Head', (0.11, 0.12, 0.13, 1))]
mat_of = {'body': 0, 'armR': 0, 'armL': 0, 'legR': 1, 'legL': 1, 'head': 2}
binbuf = bytearray(); views = []; accs = []
def add(data, target=None):
    while len(binbuf) % 4: binbuf.append(0)
    off = len(binbuf); binbuf.extend(data)
    v = dict(buffer=0, byteOffset=off, byteLength=len(data))
    if target: v['target'] = target
    views.append(v); return len(views) - 1
prims = []
for mi in range(len(mats)):
    pos, nor, jo, we = [], [], [], []
    for key, ts in tris.items():
        if mat_of[key] != mi: continue
        for a, b, c in ts:
            u = [b[i] - a[i] for i in range(3)]; w = [c[i] - a[i] for i in range(3)]
            n = [u[1]*w[2] - u[2]*w[1], u[2]*w[0] - u[0]*w[2], u[0]*w[1] - u[1]*w[0]]; l = math.sqrt(sum(x*x for x in n)) or 1
            for p in (a, b, c): pos.append(p); nor.append([x/l for x in n]); jo.append((bone_of[key], 0, 0, 0)); we.append((1, 0, 0, 0))
    if not pos: continue
    def acc(view, ctype, count, typ, mn=None, mx=None):
        a = dict(bufferView=view, componentType=ctype, count=count, type=typ)
        if mn is not None: a['min'] = mn; a['max'] = mx
        accs.append(a); return len(accs) - 1
    pv = add(b''.join(struct.pack('<3f', *p) for p in pos), 34962)
    a_pos = acc(pv, 5126, len(pos), 'VEC3', [min(p[i] for p in pos) for i in range(3)], [max(p[i] for p in pos) for i in range(3)])
    a_nor = acc(add(b''.join(struct.pack('<3f', *n) for n in nor), 34962), 5126, len(nor), 'VEC3')
    a_jo = acc(add(b''.join(struct.pack('<4B', *j) for j in jo), 34962), 5121, len(jo), 'VEC4')
    a_we = acc(add(b''.join(struct.pack('<4f', *x) for x in we), 34962), 5126, len(we), 'VEC4')
    prims.append(dict(attributes=dict(POSITION=a_pos, NORMAL=a_nor, JOINTS_0=a_jo, WEIGHTS_0=a_we), material=mi))
world = {name: pos for name, _, pos in bones}
nodes = [dict(name='Player', mesh=0, skin=0)]
for name, parent, pos in bones:
    pp = world[parent] if parent else (0, 0, 0)
    nodes.append(dict(name=name, translation=[pos[i] - pp[i] for i in range(3)]))
for bi, (name, parent, _) in enumerate(bones):
    kids = [ci + 1 for ci, (_, p2, _) in enumerate(bones) if p2 == name]
    if kids: nodes[bi + 1]['children'] = kids
ibm = b''.join(struct.pack('<16f', 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -p[0], -p[1], -p[2], 1) for _, _, p in bones)
a_ibm = len(accs); accs.append(dict(bufferView=add(ibm), componentType=5126, count=len(bones), type='MAT4'))
armature = dict(name='Armature', children=[1])
nodes.append(armature)
gltf = dict(asset=dict(version='2.0', generator='Hook & Ring player_build.py'), scene=0, scenes=[dict(nodes=[0, len(nodes) - 1])],
            nodes=nodes, meshes=[dict(name='Player', primitives=prims)], skins=[dict(joints=list(range(1, len(bones) + 1)), inverseBindMatrices=a_ibm, skeleton=1)],
            materials=[dict(name=n, pbrMetallicRoughness=dict(baseColorFactor=list(c), metallicFactor=0, roughnessFactor=.8)) for n, c in mats],
            accessors=accs, bufferViews=views, buffers=[dict(byteLength=len(binbuf))])
js = json.dumps(gltf, separators=(',', ':')).encode()
while len(js) % 4: js += b' '
while len(binbuf) % 4: binbuf.append(0)
glb = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(binbuf)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(binbuf), 0x004E4942) + bytes(binbuf)
open(os.path.join(outdir, 'player_rigged.glb'), 'wb').write(glb)
print('wrote', os.path.join(outdir, 'player_rigged.glb'), len(glb), 'bytes')
