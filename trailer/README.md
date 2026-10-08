# Trailer

Makes `~/Downloads/drift-and-bolt-trailer.mp4` (52 s, 1280×720, 30 fps) from the real game.

1. `python3 build_page.py` — copies `../index.html` into `~/Downloads/hr-shot/trailer.html` with a virtual clock, a free camera, a sound log and `director.js` (the shot list).
2. Serve `~/Downloads/hr-shot` on port 8811 (`python3 srv.py 8811` there), then `nice -n 19 node record.mjs <frames dir>` (add `preview` to save only a few frames).
3. `python3 audio.py <frames dir>/cues.json trailer.wav 52` — music + the game's sounds at the logged times.
4. `ffmpeg -framerate 30 -i <frames dir>/%05d.jpg -i trailer.wav -c:v libx264 -crf 19 -pix_fmt yuv420p -c:a aac -b:a 192k -shortest out.mp4`

To use your own music, mix it in place of `music` in audio.py, or swap the audio track with ffmpeg.

## Thumbnail
`thumbnail/thumbs.json` stages the background shot in trailer.html (golden-hour highway, car + fighter; run with `~/Downloads/hr-shot/desk.mjs`, keep `th-stage2`), copy it to `~/Downloads/hr-shot/thumb-bg.png`, then screenshot `thumbnail/thumb.html` (needs `fonts/` from the CrazyGames build next to it) → `~/Downloads/drift-and-bolt-thumbnail.jpg`.
