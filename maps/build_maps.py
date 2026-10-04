"""Builds Hook & Ring's built-in maps in Bay Forge's map format.

Each map is a grid of 2 m cells that starts solid. `open` rectangles are carved out as walkable
floor; whatever stays solid is merged into as few wall boxes as possible. `cover` adds crates,
`spawn_a` / `spawn_b` are team spawns (free-for-all uses all of them) and `lamps` hang lights.
Run: python3 build_maps.py  ->  builtin.json (all maps) and one <id>.json per map for Bay Forge.
"""
import json, os, random

CELL = 2.0
BUILTINS = [
    ('concrete', 'Concrete', 'concrete', 2, .92, 0), ('concrete-dark', 'Dark concrete', 'concreteDark', 2, .9, 0),
    ('crate', 'Steel crate', 'crate', 2.4, .75, .15), ('hazard', 'Hazard stripes', 'hazard', 1, .8, 0),
    ('diamond', 'Diamond plate', 'diamond', 1, .45, .6), ('steel-wall', 'Steel wall', 'steelWall', 3, .8, .2),
    ('brick', 'Brick', 'brick', 1.2, .9, 0), ('wood', 'Wood planks', 'wood', 1.6, .85, 0),
    ('tile', 'Floor tile', 'tile', 1, .5, 0), ('grass', 'Grass', 'grass', 2, 1, 0), ('plain', 'Plain (tint me)', 'plain', 1, .8, 0),
]
MATERIALS = [dict(id=i, name=n, type='builtin', gen=g, tile=t, rough=r, metal=m) for i, n, g, t, r, m in BUILTINS]
# shared texture library (maps/textures.json, CC0 Screaming Brain Studios): name -> (label, metres per repeat, roughness, metalness)
TEX = {
    'sand': ('Sand', 3, 1, 0), 'rock': ('Mossy rock', 3, .95, 0), 'planks': ('Planks', 1.6, .85, 0), 'plate': ('Steel plate', 1.5, .5, .55),
    'ribbed': ('Ribbed metal', 2, .55, .5), 'pavers': ('Pavers', 2, .85, 0), 'plaster': ('Plaster', 3, .95, 0), 'redbrick': ('Red brick', 2, .9, 0),
    'cobble': ('Cobblestone', 2, .9, 0), 'lightwood': ('Light wood', 1.6, .8, 0), 'lava': ('Lava', 2, .6, 0), 'snow': ('Snow', 3, 1, 0),
    'ice': ('Ice', 3, .3, 0), 'logs': ('Dark wood', 1.6, .85, 0), 'labtile': ('Lab tile', 1.5, .45, 0), 'labwall': ('Lab wall', 3, .9, 0),
    'darkcobble': ('Dark cobble', 1.5, .85, 0), 'darkstone': ('Dark stone', 3, .9, 0), 'yard': ('Yard concrete', 4, .9, .1),
}
def tex_mat(ref):
    name = ref[4:]; label, tile, rough, metal = TEX[name]
    return dict(id='t-' + name, name=label, type='image', src='tex:' + name, tile=tile, rough=rough, metal=metal)


def merge_solid(grid):
    """Greedy rectangles over solid cells: grow right, then down while the whole row span is solid."""
    h, w = len(grid), len(grid[0])
    used = [[False]*w for _ in range(h)]
    out = []
    for y in range(h):
        for x in range(w):
            if not grid[y][x] or used[y][x]:
                continue
            x1 = x
            while x1 + 1 < w and grid[y][x1+1] and not used[y][x1+1]:
                x1 += 1
            y1 = y
            while y1 + 1 < h and all(grid[y1+1][i] and not used[y1+1][i] for i in range(x, x1+1)):
                y1 += 1
            for yy in range(y, y1+1):
                for xx in range(x, x1+1):
                    used[yy][xx] = True
            out.append((x, y, x1-x+1, y1-y+1))
    return out


def build(spec):
    rnd = random.Random(spec['id'])
    cw, ch = spec['size']
    grid = [[True]*cw for _ in range(ch)]
    for x0, y0, x1, y1 in spec['open']:
        for y in range(max(0, y0), min(ch, y1+1)):
            for x in range(max(0, x0), min(cw, x1+1)):
                grid[y][x] = False
    objs, n = [], 0

    def add(o):
        nonlocal n
        n += 1
        o['id'] = f"{spec['id']}-{n}"
        objs.append(o)

    wall_h, wm, wt = spec.get('wall_h', 5), spec.get('wall_mat', 'plain'), spec.get('wall_tint', '#ffffff')
    for i, (x, y, w, h) in enumerate(merge_solid(grid)):
        add(dict(name=f'Wall {i+1}', kind='solid', shape='box', pos=[(x + w/2)*CELL, 0, (y + h/2)*CELL],
                 size=[w*CELL, wall_h, h*CELL], rotY=0, mat=wm, tint=wt))
    for i, c in enumerate(spec.get('cover', [])):
        kind, x, y, w, h = c[:5]
        tall = {'c': 1.2, 'C': 2.4, 'P': 3.6, 'R': 4.5, 'L': .6}[kind]
        mat = c[5] if len(c) > 5 else spec.get('cover_mat', 'crate')
        tint = c[6] if len(c) > 6 else spec.get('cover_tint', '#ffffff')
        add(dict(name=f'Cover {i+1}', kind='solid', shape='box', pos=[(x + w/2)*CELL, 0, (y + h/2)*CELL],
                 size=[w*CELL*.9, tall, h*CELL*.9], rotY=0, mat=mat, tint=tint))
    cx, cy = cw*CELL/2, ch*CELL/2
    # keep every spawn at least 2 cells (4 m) from the others: nudge crowded ones to a nearby open cell
    blocked = {(c[1] + dx, c[2] + dy) for c in spec.get('cover', []) for dx in range(c[3]) for dy in range(c[4])}
    placed = []
    def spread(x, y):
        best = None
        for r in range(0, 6):
            for dy in range(-r, r+1):
                for dx in range(-r, r+1):
                    nx, ny = x + dx, y + dy
                    if not (0 <= nx < cw and 0 <= ny < ch) or grid[ny][nx] or (nx, ny) in blocked:
                        continue
                    if all(max(abs(nx - px), abs(ny - py)) >= 2 for px, py in placed):
                        best = (nx, ny); break
                if best: break
            if best: break
        best = best or (x, y)
        placed.append(best)
        return best
    for team, key in (('A', 'spawn_a'), ('B', 'spawn_b')):
        for i, (x, y) in enumerate([spread(*p) for p in spec[key]]):
            px, pz = (x + .5)*CELL, (y + .5)*CELL
            # face the middle of the map (Bay Forge yaw: forward is -z)
            import math
            yaw = math.atan2(-(cx - px), -(cy - pz))
            add(dict(name=f'Spawn {team}{i+1}', kind='spawn', team=team, pos=[px, 0, pz], rotY=round(yaw, 3)))
    for i, (x, y) in enumerate(spec.get('lamps', [])):
        add(dict(name=f'Lamp {i+1}', kind='lamp', pos=[(x + .5)*CELL, spec.get('lamp_y', 4.5), (y + .5)*CELL],
                 light=dict(color=spec.get('lamp_color', '#ffd7a0'), int=1.5, range=24)))
    env = dict(floorMat=spec.get('floor_mat', 'concrete'), wallMat=wm, ceilMat='concrete-dark', ambient=spec.get('ambient', 1.0),
               sky=spec.get('sky', '#a9c8e8'), fog=spec.get('fog', 150), roof=spec.get('roof', 'none'))
    mats = json.loads(json.dumps(MATERIALS))
    used = {o.get('mat') for o in objs if o.get('mat')} | {env['floorMat'], env['wallMat']}
    for ref in sorted(u for u in used if isinstance(u, str) and u.startswith('tex:')):
        mats.append(tex_mat(ref))
    for o in objs:
        if isinstance(o.get('mat'), str) and o['mat'].startswith('tex:'): o['mat'] = 't-' + o['mat'][4:]
    for k in ('floorMat', 'wallMat'):
        if env[k].startswith('tex:'): env[k] = 't-' + env[k][4:]
    # tinted floor: a dedicated material so the floor colour doesn't depend on object tints
    if spec.get('floor_tint'):
        base = next(m for m in mats if m['id'] == spec.get('floor_mat', 'concrete'))
        mats.append(dict(base, id='floor-tinted', name='Map floor'))
        env['floorMat'] = 'floor-tinted'
    m = dict(v=1, name=spec['name'], w=cw*CELL, d=ch*CELL, wallH=wall_h, walls=True,
             wallSides=dict(n=True, s=True, w=True, e=True), floor=True, fallDepth=25, env=env,
             materials=mats, models=[], objects=objs, about=spec['about'])
    if spec.get('floor_tint'):
        m['floorTint'] = spec['floor_tint']
    return m


# ---------------- maps ----------------
# coordinates are (x0, y0, x1, y1) in cells, inclusive. Team A spawns at the bottom, team B at the top.
MAPS = [
    dict(id='quarry', name='Quarry', about='Open stone quarry. Giant boulders split it into three lanes around a central rock.',
         size=(36, 30), wall_mat='tex:rock', floor_mat='tex:sand', cover_mat='tex:planks', ambient=1.1, sky='#bcd2e6', fog=170, wall_h=6,
         open=[(1, 1, 34, 28)],
         cover=[('R', 6, 4, 4, 6, 'tex:rock'), ('R', 6, 20, 4, 6, 'tex:rock'), ('R', 14, 1, 3, 7, 'tex:rock'), ('R', 14, 22, 3, 7, 'tex:rock'),
                ('R', 16, 12, 4, 6, 'tex:rock'), ('R', 25, 4, 4, 6, 'tex:rock'), ('R', 25, 20, 4, 6, 'tex:rock'), ('R', 11, 13, 2, 4, 'tex:rock'),
                ('R', 23, 13, 2, 4, 'tex:rock'), ('C', 4, 13, 1, 1), ('C', 31, 15, 1, 1), ('c', 12, 9, 1, 1), ('c', 23, 20, 1, 1),
                ('c', 20, 9, 1, 1), ('c', 15, 19, 1, 1), ('C', 19, 25, 2, 1, 'tex:plate'), ('C', 15, 3, 2, 1, 'tex:plate')],
         spawn_a=[(2, 3), (2, 7), (2, 11), (2, 15), (2, 19), (2, 23), (2, 26), (4, 9)],
         spawn_b=[(33, 3), (33, 7), (33, 11), (33, 15), (33, 19), (33, 23), (33, 26), (31, 21)]),
    dict(id='market', name='Market', about='Town square with a fountain and market stalls, streets on four sides and alleys around the edge.',
         size=(34, 34), wall_mat='tex:plaster', floor_mat='tex:pavers', cover_mat='tex:lightwood', ambient=1.05, sky='#c4d8ea', fog=160,
         open=[(10, 10, 23, 23), (15, 1, 18, 10), (15, 23, 18, 32), (1, 15, 10, 18), (23, 15, 32, 18),
               (3, 3, 30, 5), (3, 28, 30, 30), (3, 3, 5, 30), (28, 3, 30, 30), (10, 6, 12, 10), (21, 23, 23, 27)],
         cover=[('P', 16, 16, 2, 2, 'tex:cobble'), ('c', 12, 12, 2, 1), ('c', 20, 12, 2, 1), ('c', 12, 21, 2, 1), ('c', 20, 21, 2, 1),
                ('C', 11, 16, 1, 2, 'tex:redbrick'), ('C', 22, 16, 1, 2, 'tex:redbrick'), ('c', 16, 4, 1, 1), ('c', 17, 29, 1, 1),
                ('c', 4, 10, 1, 1), ('c', 29, 23, 1, 1), ('C', 8, 4, 1, 1), ('C', 25, 29, 1, 1), ('c', 7, 16, 1, 1), ('c', 26, 17, 1, 1)],
         spawn_a=[(4, 6), (4, 10), (4, 14), (4, 19), (4, 23), (4, 27), (7, 29), (7, 4)],
         spawn_b=[(29, 6), (29, 10), (29, 14), (29, 19), (29, 23), (29, 27), (26, 29), (26, 4)]),
    dict(id='foundry', name='Foundry', about='Steel works under orange lamps. Lava channels split the floor; cross on the central bridge or go around.',
         size=(30, 26), wall_mat='tex:ribbed', floor_mat='tex:plate', cover_mat='tex:ribbed', ambient=.5, sky='#120d0a', fog=70, roof='solid',
         wall_h=6, lamp_y=5, lamp_color='#ffb070',
         lamps=[(5, 4), (14, 4), (24, 4), (5, 12), (24, 12), (14, 12), (5, 21), (14, 21), (24, 21), (10, 8), (19, 17), (19, 8)],
         open=[(1, 1, 28, 24)],
         cover=[('L', 2, 12, 11, 2, 'tex:lava'), ('L', 17, 12, 11, 2, 'tex:lava'), ('P', 9, 1, 1, 6), ('P', 9, 19, 1, 6),
                ('P', 20, 1, 1, 6), ('P', 20, 19, 1, 6), ('C', 13, 5, 3, 2, 'tex:plate'), ('C', 13, 19, 3, 2, 'tex:plate'),
                ('C', 4, 7, 2, 2), ('C', 24, 16, 2, 2), ('c', 5, 17, 1, 1), ('c', 24, 8, 1, 1), ('P', 14, 9, 1, 1), ('P', 14, 16, 1, 1)],
         spawn_a=[(2, 2), (5, 2), (2, 5), (7, 3), (2, 9), (11, 3), (16, 2), (25, 2)],
         spawn_b=[(27, 23), (24, 23), (27, 20), (22, 22), (27, 16), (18, 23), (13, 23), (4, 23)]),
    dict(id='frost', name='Frost', about='Snowed-in outpost: log cabins, ice ridges and fences across a frozen yard.',
         size=(34, 28), wall_mat='tex:ice', floor_mat='tex:snow', cover_mat='tex:logs', ambient=1.2, sky='#d7e4ef', fog=110, wall_h=5,
         open=[(1, 1, 32, 26)],
         cover=[('P', 5, 5, 4, 3, 'tex:logs'), ('P', 25, 5, 4, 3, 'tex:logs'), ('P', 5, 20, 4, 3, 'tex:logs'), ('P', 25, 20, 4, 3, 'tex:logs'),
                ('P', 15, 11, 4, 5, 'tex:logs'), ('R', 11, 3, 1, 6, 'tex:ice'), ('R', 22, 19, 1, 6, 'tex:ice'), ('R', 11, 19, 1, 4, 'tex:ice'),
                ('R', 22, 5, 1, 4, 'tex:ice'), ('c', 1, 13, 6, 1, 'tex:planks'), ('c', 27, 14, 6, 1, 'tex:planks'), ('c', 16, 4, 2, 1),
                ('c', 16, 22, 2, 1), ('C', 8, 13, 1, 1), ('C', 25, 13, 1, 1)],
         spawn_a=[(3, 25), (7, 25), (11, 25), (15, 25), (19, 25), (23, 25), (27, 25), (31, 25)],
         spawn_b=[(3, 2), (7, 2), (11, 2), (15, 2), (19, 2), (23, 2), (27, 2), (31, 2)]),
    dict(id='shipyard', name='Shipyard', about='Container yard at the docks. Lots of cover, lanes between stacks.',
         size=(32, 24), wall_mat='tex:ribbed', floor_mat='tex:yard', cover_mat='tex:ribbed', ambient=.95, sky='#93a7bb', fog=120,
         open=[(1, 1, 30, 22)],
         cover=[('P', 5, 4, 3, 1, 'tex:ribbed', '#c0563f'), ('P', 5, 9, 1, 3, 'tex:ribbed', '#3f7fc0'), ('C', 9, 6, 2, 1, 'tex:ribbed', '#4f9a5c'),
                ('P', 12, 3, 1, 3, 'tex:ribbed', '#c9a33b'), ('C', 14, 9, 3, 1, 'tex:ribbed', '#c0563f'), ('c', 15, 6, 1, 1),
                ('P', 19, 3, 1, 3, 'tex:ribbed', '#3f7fc0'), ('C', 21, 6, 2, 1, 'tex:ribbed', '#4f9a5c'), ('P', 24, 4, 3, 1, 'tex:ribbed', '#c9a33b'),
                ('P', 26, 9, 1, 3, 'tex:ribbed', '#c0563f'), ('P', 5, 14, 3, 1, 'tex:ribbed', '#4f9a5c'), ('C', 9, 16, 2, 1, 'tex:ribbed', '#3f7fc0'),
                ('P', 12, 17, 1, 3, 'tex:ribbed', '#c0563f'), ('C', 15, 13, 3, 1, 'tex:ribbed', '#c9a33b'), ('c', 16, 16, 1, 1),
                ('P', 19, 17, 1, 3, 'tex:ribbed', '#4f9a5c'), ('C', 21, 16, 2, 1, 'tex:ribbed', '#c0563f'), ('P', 24, 19, 3, 1, 'tex:ribbed', '#3f7fc0'),
                ('c', 29, 12, 1, 1), ('c', 2, 11, 1, 1)],
         spawn_a=[(2, 3), (2, 6), (2, 9), (2, 14), (2, 17), (2, 20), (3, 12), (3, 7)],
         spawn_b=[(29, 3), (29, 6), (29, 9), (29, 14), (29, 17), (29, 20), (28, 11), (28, 16)]),
    dict(id='arena', name='Arena', about='Small mirrored arena for 1v1 and 2v2. Pillars and low walls, nowhere to hide for long.',
         size=(18, 18), wall_mat='tex:darkstone', floor_mat='tex:darkcobble', cover_mat='hazard', ambient=.7, sky='#1a1d22', fog=80,
         roof='solid', lamp_y=5.2, lamps=[(4, 4), (13, 4), (4, 13), (13, 13), (8, 8)],
         open=[(1, 1, 16, 16)],
         cover=[('P', 5, 5, 1, 1), ('P', 12, 5, 1, 1), ('P', 5, 12, 1, 1), ('P', 12, 12, 1, 1), ('c', 8, 3, 2, 1),
                ('c', 8, 14, 2, 1), ('c', 3, 8, 1, 2), ('c', 14, 8, 1, 2), ('C', 8, 8, 2, 2)],
         spawn_a=[(2, 15), (4, 15), (2, 13), (6, 15), (2, 11), (8, 15), (10, 15), (2, 9)],
         spawn_b=[(15, 2), (13, 2), (15, 4), (11, 2), (15, 6), (9, 2), (7, 2), (15, 8)]),
    dict(id='lab', name='Lab', about='Indoor research lab: offices, a server hall and long corridors under strip lights.',
         size=(30, 24), wall_mat='tex:labwall', floor_mat='tex:labtile', cover_mat='plain', cover_tint='#6f7b86',
         ambient=.45, sky='#0c0e11', fog=70, roof='solid', lamp_y=3.7, lamp_color='#e8f2ff', wall_h=4,
         lamps=[(4, 4), (14, 3), (25, 4), (4, 12), (14, 12), (25, 12), (4, 20), (14, 20), (25, 20), (9, 8), (20, 16)],
         open=[(1, 1, 8, 7), (11, 1, 18, 5), (21, 1, 28, 7), (1, 10, 28, 13), (1, 16, 8, 22), (11, 18, 18, 22),
               (21, 16, 28, 22), (4, 7, 5, 10), (14, 5, 15, 10), (24, 7, 25, 10), (4, 13, 5, 16), (14, 13, 15, 18),
               (24, 13, 25, 16), (8, 3, 11, 4), (18, 3, 21, 4), (8, 19, 11, 20), (18, 19, 21, 20)],
         cover=[('C', 12, 11, 1, 1), ('C', 17, 11, 1, 1), ('c', 7, 11, 1, 1), ('c', 22, 11, 1, 1), ('P', 13, 20, 1, 1),
                ('P', 16, 20, 1, 1), ('P', 13, 3, 1, 1), ('P', 16, 3, 1, 1), ('c', 3, 3, 2, 1), ('c', 25, 20, 2, 1),
                ('c', 3, 19, 1, 1), ('c', 26, 3, 1, 1)],
         spawn_a=[(2, 18), (2, 21), (5, 21), (7, 18), (12, 21), (17, 21), (22, 21), (27, 19)],
         spawn_b=[(2, 2), (7, 2), (12, 2), (17, 2), (22, 2), (27, 2), (27, 5), (2, 5)]),
]

if __name__ == '__main__':
    here = os.path.dirname(os.path.abspath(__file__))
    built = []
    for spec in MAPS:
        m = build(spec)
        built.append(dict(id=spec['id'], name=spec['name'], about=spec['about'], map=m))
        with open(os.path.join(here, spec['id'] + '.json'), 'w') as f:
            json.dump(m, f, separators=(',', ':'))
        print(f"{spec['id']:9s} {m['w']:.0f}x{m['d']:.0f} m  {len(m['objects'])} objects")
    with open(os.path.join(here, 'builtin.json'), 'w') as f:
        json.dump(built, f, separators=(',', ':'))
    print('builtin.json', os.path.getsize(os.path.join(here, 'builtin.json')), 'bytes')
