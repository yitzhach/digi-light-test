# DigiLight
A static, local-in-browser painting relighter. No API keys, uploads to a server,
package installation or build step are required. Requires WebGL2 and floating-point
render targets; graphics acceleration must be enabled.

## Use
Open your painting (JPEG, PNG or WebP). Drag a light, or use Horizontal/Vertical.
Power changes intensity; Distance controls height above the painting; Cone varies
from flood to spot. Add up to eight lights, choose Kelvin or custom colours.
Tune Source azimuth to the original photo's lighting direction, then adjust surface
strength and relief. Use Original to compare. Export renders the relit result even
when a diagnostic view is selected. PNG is lossless; JPEG uses quality 95.

Single-photo geometry is estimated, not a measured reconstruction. Pigment edges
can resemble relief, and flat copy lighting suppresses texture information.
Photometric mode supports matching photos with varied, known light directions;
use more than four shots with varied elevation when fitting ambient.

## Manual hosting
This folder is the complete static site. index.html must be at the deployment
root beside src/ and _headers. Upload the ZIP as a Cloudflare Pages direct upload,
or extract it and upload the folder using your existing static-assets workflow.
No npm build is needed. The public site has not been changed by this repair.
For a local preview: python3 -m http.server 8000, then visit http://localhost:8000.
Do not double-click index.html; ES modules require an HTTP server.

## Repair notes — September 18, 2026
- Stable pointer capture while dragging; pointer cancellation cleanup.
- Horizontal/vertical light controls and a prominent photo-open button.
- Coalesced interactive rendering; recoverable image decode messages and URL cleanup.
- Capture texture preview capped to match preview resolution and GPU limits.
- Truth preview no longer overwrites recovered normals; Original shows the first photo.
- Fit verdict thresholds corrected from fractions to percentages.
- Export locks editing and suspends preview draws during shared-GPU tile rendering.
- Export uses relit view, output-resolution shadow/depth parameters and corrected
  normal-strength scaling; restores controls and preview after completion/failure.

## Validation / remaining checks
All JavaScript modules passed syntax checks. Solver checks passed for a valid rig,
singular rig, insufficient shots, colour values and export margin.
Live entry-page HTML matched the original supplied ZIP.
Browser/WebGL interaction and visual export checks were NOT completed: this
execution environment has no browser and browser downloads timed out.
Before relying on outputs, check upload, dragging, multiple lights, PNG/JPEG export,
preview restoration, mobile layout and photometric mode in your browser.
Very large exports remain subject to browser canvas/memory limits; lower Export
Scale if encoding fails. Existing blur/integration shader caps can change detail
at resolutions substantially above the preview; export reports those caps.
