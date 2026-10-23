# The user's test photos (real paintings, real light)

Photos of the user's own plaster pieces, sent 10-21 for testing. Use them for any test of
relief, looks, the guard, measured relief or exactness on real work, instead of only the
samples. Details and every number measured on them: docs/real-light-test.md. Machine-readable
facts: manifest.json. Not deployed with the app (only index.html, studio.css, src/, samples/,
_headers are).

| file | what |
|---|---|
| door-flat.jpg | "Plaster door", indoors, flat light (as sent, leaning on a door) |
| door-flat-crop.jpg | the same cropped to the board (1280 × 1805): **use this one** |
| door-sun.jpg | the door outdoors in raking sun from the upper left, handheld from another spot |
| door-sun-lined.jpg | door-sun lined up onto door-flat-crop (tools/realref/register.py, median 0.75 px) |
| lintel-flat.jpg | panel with a wooden lintel, flat light against a grey wall (as sent) |
| lintel-flat-crop.jpg | cropped to the plaster panel, wooden base left out (1288 × 1670): **use this one** |
| lintel-sun.jpg | the same panel outdoors in low sun from the upper right (10.3° up) |
| lintel-sun-lined.jpg | lintel-sun lined up onto lintel-flat-crop (median 0.9 px) |
| band-outdoor.jpg | banded panel (grey / white / orange / black), outdoors, even daylight (as sent) |
| band-outdoor-crop.jpg | cropped to the panel (896 × 1900) |
| closeup-flat.jpg | close-up of another piece (grey / white / black band), indoors, flat light |

Pairs (flat + sun of the same piece, lined up): door, lintel. A flat crop plus its "-lined" sun
photo is what tools/realref/score.py and measure_sun.cjs take; the app also takes the raw sun
photo and lines it up itself (src/lineup.js, tests/lineup.cjs). manifest.json `sunToFlat`:
register.py's homography from the raw sun photo to the flat crop, to check that against. The door and the lintel panel
are different pieces (checked: 6–7 feature matches between them against 174–491 within a pair).
