# Sound effects

`python3 sfx/build_sfx.py` cuts and levels the sounds into `sfx/out/` (wav for the trailer, mp3 for the game) and writes `sfx/sfx-data.js`; `python3 patch-sfx.py` then inlines it into index.html and claude.html (re-run to refresh). The game plays these samples and falls back to its synth sounds until they decode (the bullet whiz is still synth).

Sources:
- Kenney Impact Sounds, Sci-fi Sounds, Interface Sounds (kenney.nl), CC0. The zips live in `sfx/src/` (not committed; re-download from kenney.nl).
- Pixabay (user downloads in ~/Downloads): `freesound_community-slashkut-108175`, `u_dtbxmnju4i-taking-out-knife-217793`, `freesound_community-shot-and-reload-6158`, `freesound_community-single-gunshot-54-40780`. Pixabay Content License: free for commercial use, no attribution needed.
- Not used: `awp_02.mp3` (unknown source, likely a CS:GO rip) and the Roblox hook sounds.

| sound | made from |
|---|---|
| slash, stab, dash | slashkut (first swoosh; slowed + punch for stab; second swoosh slowed for dash) |
| draw (knife swap / inspect) | taking-out-knife |
| awp | single-gunshot-54 + Kenney low explosion |
| bolt | shot-and-reload (the clacks) |
| hit, kill, hurt, thud | Kenney impactPunch / impactBell / impactSoft |
| crash (cars hitting things) | Kenney impactMetal_heavy + impactPlate_heavy |
| door, pop, boom | Kenney impactMetal, explosionCrunch, lowFrequency_explosion |
| click, zoom | Kenney interface click / switch |
