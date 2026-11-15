# CyberNav design handoff

Everything designed in this chat, written so another chat (or developer) can integrate it without reading the conversation. Paste this whole file into the new chat as context.

Date: 15 Nov 2026 · Project: cyberNAV (`FaradayMicrosystems/cyberNAV`, public) · Current version: `0.0.2` (pre-alpha)

---

## 1. Aesthetic

- **Name of the look:** *cassette futurism* (also "used future"): 1970s–80s imagined-future computer displays, as in the bridge screens of *Alien* (1979).
- **Display style:** vector / wireframe graphics on a monochrome phosphor CRT. One glowing colour per screen, hidden-line removal (back edges erased), scanlines and a vignette, seven-segment digits for numbers.
- **Rule:** every screen uses a single phosphor colour plus the ground colour. No gradients, no fills except the ground colour used to hide lines.

### Phosphor colours (match `docs/phosphor-hud/tokens.css` in the repo)

| Theme | `--phosphor` | Notes |
| --- | --- | --- |
| Green (default, "nostromo") | `#b8ff7a` | Ground `#020503` |
| Amber | `#ffb000` | |
| Ice | `#9fe8ff` | |
| White | `#e6eef5` | |

The concept screens used these HUD colours: green `#6dff9e`, amber `#ffb347`, cyan `#86ecff` (highlight `#eafcff`), alert red `#ff6b3d` (highlight `#ffd2a8`). For the real app use the token values above. Red/alert is the token `--signal-alert` (`#ff5a44`).

### Fonts

- Data / HUD text: **Share Tech Mono**
- Headings: **Chakra Petch** (600)
- Both are on Google Fonts and already referenced by the style guide.

---

## 2. Navigation screen (HUD) — concept v0.0.1

Live concept: https://claude.ai/artifact/LpwHz2VUJwZj6UuaKc9GHz (private to the owner)
In the repo: `docs/concepts/cyberNAV-v0.0.1/` (`index.html` + 4 screenshots + README). Pushed to `main` in commit `f291e86`.

### Layout (960 × 600 reference canvas)

```
+----------------+-----------------------------------------------+
| [logo] CyberNav| NEXT MANEUVER            (heading tape) HDG 012|
| route / mode   |  ↱ 086 M                                      |
|----------------|  RIGHT ▸ KESTREL AVE                          |
| LOCAL TIME     |                                               |
| 22:46:35       |          large 3D chase-view map              |
| SUN 15 NOV 2026|          (vehicle near bottom centre)         |
|----------------|                                               |
| SPEED LIMIT    |                                               |
| (60) HARLAN BLVD                                               |
| NEXT 40 · ...  |                                  ETA   23:04  |
|----------------|                                  DIST  06.2 KM|
| PLAN  1:2500   |                                               |
| [mini map]     |            > FOLLOW ROUTE_                    |
+----------------+-----------------------------------------------+
```

- **Left sidebar** (250 px wide, solid ground-colour panel, 1 px divider), top to bottom:
  1. **CyberNav logo:** diamond mark with two chevrons + wordmark "CyberNav" (30 px). Under it, two small lines of trip context (e.g. `ROUTE 07 · SECTOR 4-C`, `MODE GROUND`).
  2. **Time and date:** label `LOCAL TIME`, clock `HH:MM:SS` (40 px), date line `SUN 15 NOV 2026`.
  3. **Speed limit + current street:** round limit sign (radius 22 px, double ring, seven-segment digits), street name beside it, then `NEXT <limit> · <street>` and `IN <distance>`.
  4. **Mini map (lowest):** plan view, about 206 × 190 px, scale 0.6 px per metre, north-up relative to travel (vehicle heading = up). City blocks as outlines, route as a thick line, vehicle as a triangle near the bottom. Shows the destination (blinking circle) and closures (blinking ✕). Old routes are dashed.
- **Main map** (rest of the screen): 3D chase view, projection centred on the map area (x = 250 + 710/2).
- **Route alerts** (upper left of the map, **transparent background**, text outlined in the ground colour so it reads over the wireframe):
  - Next turn: label `NEXT MANEUVER`, turn arrow glyph, big distance (`086 M`), instruction (`RIGHT ▸ KESTREL AVE`).
  - Arriving: `ARRIVING` (blinking, 42 px), `DESTINATION 108 M ON RIGHT`, `▸ PULL TO CURB`.
  - Reroute: `ROUTE OBSTRUCTED` (blinking), cause line, new-turn arrow + distance, `LEFT ◂ VANCE ROW · +2 MIN`, spinner + `RECALCULATING · 2 ALT ROUTES`.
- **Secondary readouts** (transparent): heading tape top right, ETA / distance / traffic bottom right, altitude ladder on the right edge for the hover/sky mode, status prompt bottom centre.
- The speedometer was **removed** on request; speed limit replaces it.

### Map camera (final, approved)

- Camera **100 m above the ground**, about **15–22 m behind** the vehicle (same horizontal offset as the first close-up drafts).
- Looks at a point about 95–105 m ahead of the vehicle, so pitch is roughly 45° down.
- **Wide lens:** focal length 330 px on a 600 px tall view (≈ 85° vertical field of view).
- Vehicle drawn at **2.2× true size** so it stays visible from that height.
- Buildings kept **low** (4–16 m; 10–42 m in the sky-lane mode) so streets stay readable.
- **Route drawn on top of buildings** (never hidden), as a ribbon about 3.6 m wide with chevrons every 7 m, 2.4 px line.
- Distance fade: line alpha = clamp(1.25 − d / 520, 0.12, 1).

Rejected along the way (so the next chat does not retry them): the original low chase cam (too close), pulling back 300 m along the same shallow angle (vehicle hidden behind buildings, about 8 px long), 60 m pull-back (buildings fill the frame).

### Four example screens in the concept

| # | Mode | Phosphor | Content |
| --- | --- | --- | --- |
| 1 | Ground car, next turn | green | Right turn in 86 m onto Kestrel Ave, limit 60 → 40 |
| 2 | Sky corridor (hover) | amber | Bank left 131 m, corridor K-12 → K-9, limit 240 → 180, altitude ladder 090 m |
| 3 | Arriving | cyan | Destination 108 m on the right, beacon with rising rings, highlighted block, limit 30 |
| 4 | Reroute alert | red | Intersection closed (✕ on the ground, barriers, floating warning sign), old route dashed, new route left in 45 m, limit 50 → 40 (HGV) |

All street names, limits and readouts are placeholders.

### Rendering approach used in the HUD concept

Plain Canvas 2D, no libraries. Perspective camera (yaw from look-at, pitch from look-at), segments clipped at a near plane. Buildings are boxes drawn far-to-near with their visible faces filled in the ground colour, then stroked with a glow (`shadowBlur` 4–8 px in the phosphor colour). The full source is in the repo at `docs/concepts/cyberNAV-v0.0.1/index.html`.

---

## 3. Vehicle select — 10 user vehicles

Live page: https://claude.ai/artifact/NYxELCT3qJ6qcMq8zNJGmg (private to the owner)
In the repo: `docs/concepts/vehicle-select/index.html` (+ `all-vehicles.png`), committed as `0.0.2`.

### Behaviour

- Grid of 10 cards, each showing its vehicle **static** at a front-three-quarter angle (camera yaw 0.8 rad, elevation 0.5 rad).
- Large preview at the top shows the selected vehicle, turning slowly (0.3 rad/s), and can be **dragged** to turn by hand.
- Turntable under each vehicle: circular grid, ring, and a **notch at the front** showing heading.
- Selecting a vehicle shows name, class, length, wheels and a one-line use, and saves the choice (`localStorage` key `cybernav.vehicle`; theme key `cybernav.phosphor`, same key the Simulator uses).
- Theme switch: Green / Amber / Ice / White.
- `prefers-reduced-motion`: preview does not turn.

### The vehicles

| id | Name | Class | Length | Wheels | Use |
| --- | --- | --- | --- | --- | --- |
| `meridian` | Meridian | Sedan | 4.5 m | 4 | Everyday city driving |
| `talon` | Talon | Reverse trike (2 front, 1 rear) | 3.4 m | 3 | Three-wheel road racers and trikes |
| `rancher` | Rancher | Pickup / ute | 5.3 m | 4 | Utes and pickups |
| `courier` | Courier | Van | 5.0 m | 4 | Delivery and work vans |
| `strider` | Strider | Motorcycle | 2.1 m | 2 | Bikes and scooters |
| `shuttle` | Shuttle | Shuttlecraft (hovers) | 5.3 m | 0 | Short-range shuttle, hovers above the road |
| `prospector` | Prospector | Six-wheel rover | 4.6 m | 6 | Off-road and 4WD |
| `haulmaster` | Haulmaster | Semi tractor | 6.4 m | 6 | Trucks and heavy haulage |
| `lancet` | Lancet | Sports car | 4.4 m | 4 | Low, fast cars |
| `metro` | Metro | Bus | 10.5 m | 4 | Buses and coaches |

History: Pip (hatchback) was replaced by Talon; Skiff (hovercraft) was replaced by Shuttle.

**Design / IP rule:** all vehicles are original generic shapes. Talon is a generic reverse trike (not a Can-Am Spyder/Ryker). Shuttle is a generic boxy sci-fi shuttlecraft (not a replica of any Star Trek ship). Keep brand and franchise names out of the app.

### Model format

- Units are metres. Axes: **x = width (right +), y = up, z = forward (+z is the front)**. Ground is y = 0.
- A model is `{ parts: Solid[], lines: Line[] }`.
  - `Solid = { v: [x,y,z][], faces: number[][] }`, each a **convex** polyhedron. Parts may overlap.
  - `Line = { a, b, n? }`: a detail line (lights, door seams, antennas). If `n` is set, the line is drawn only when that side faces the camera.
- Helpers: `box`, `hexa` (any 8-corner block), `shape` (trapezoid prism), `slab` (sloped roof), `wheel` (14-sided prism along x), `mirror` (flip x), `shift` (translate).

### Rendering rule (this is what fixed the "popping")

Do **not** draw parts back-to-front by part. Instead, per frame:

1. Fill a **depth buffer** (`Float32Array`, one value per CSS pixel, storing 1/z) by rasterising every front-facing face of every part.
2. Draw only **crease edges** (faces meet at more than 30°) and **silhouette edges** (one face toward the camera, one away). Smooth wheel facets are skipped.
3. Depth-test each edge along its length (1.2 px steps, check a 3 × 3 neighbourhood, tolerance 1.2 % of 1/z) and draw only the visible runs.
4. Detail lines use the same test (tolerance 2 %). Ground grid and turntable lines are tested too, so the vehicle hides them.

Result: each vehicle reads as one solid object seen from outside, at any angle.

For the in-app map marker, a native/GPU version would do the same thing with a normal depth buffer: render faces depth-only, then draw edge lines with depth testing and a small polygon offset.

### Full vehicle source (geometry + renderer)

Copied verbatim from the vehicle-select page. Self-contained apart from a `<canvas>` and a draw call: `draw(view, vehicle, angleRadians, phosphorColour, groundColour, isLarge)`.

```js
/* ---------- 3D ---------- */
function camera(eye,target,f,cx,cy){
  const dx=target[0]-eye[0],dy=target[1]-eye[1],dz=target[2]-eye[2];
  const yaw=Math.atan2(dx,dz),pitch=Math.atan2(-dy,Math.hypot(dx,dz));
  return {x:eye[0],y:eye[1],z:eye[2],cy:Math.cos(yaw),sy:Math.sin(yaw),cp:Math.cos(pitch),sp:Math.sin(pitch),f,ox:cx,oy:cy};
}
function toCam(c,p){const dx=p[0]-c.x,dy=p[1]-c.y,dz=p[2]-c.z;const x1=dx*c.cy-dz*c.sy,z1=dx*c.sy+dz*c.cy;return [x1,dy*c.cp+z1*c.sp,-dy*c.sp+z1*c.cp];}
function proj(c,q){return [c.ox+c.f*q[0]/q[2],c.oy-c.f*q[1]/q[2]];}
function seg(ctx,c,a,b){const p=toCam(c,a),q=toCam(c,b);if(p[2]<NEAR||q[2]<NEAR)return;const s=proj(c,p),e=proj(c,q);ctx.moveTo(s[0],s[1]);ctx.lineTo(e[0],e[1]);}
function avg(ps){const s=[0,0,0];ps.forEach(p=>{s[0]+=p[0];s[1]+=p[1];s[2]+=p[2]});return s.map(v=>v/ps.length);}
function drawSolid(ctx,c,s,col,fill,lw,blur){
  const qs=s.v.map(p=>toCam(c,p));if(qs.some(q=>q[2]<NEAR))return;
  const ps=qs.map(q=>proj(c,q)),cen=avg(s.v),vis=[];
  for(const f of s.faces){
    let n=[0,0,0];
    for(let k=0;k<f.length;k++){const a=s.v[f[k]],b=s.v[f[(k+1)%f.length]];n[0]+=(a[1]-b[1])*(a[2]+b[2]);n[1]+=(a[2]-b[2])*(a[0]+b[0]);n[2]+=(a[0]-b[0])*(a[1]+b[1]);}
    const fc=avg(f.map(i=>s.v[i]));
    if(n[0]*(fc[0]-cen[0])+n[1]*(fc[1]-cen[1])+n[2]*(fc[2]-cen[2])<0)n=n.map(v=>-v);
    if(n[0]*(c.x-fc[0])+n[1]*(c.y-fc[1])+n[2]*(c.z-fc[2])>1e-6)vis.push(f);
  }
  const path=()=>{ctx.beginPath();for(const f of vis){f.forEach((i,k)=>k?ctx.lineTo(ps[i][0],ps[i][1]):ctx.moveTo(ps[i][0],ps[i][1]));ctx.closePath();}};
  ctx.shadowBlur=0;ctx.globalAlpha=1;ctx.fillStyle=fill;path();ctx.fill();
  ctx.strokeStyle=col;ctx.lineWidth=lw;ctx.shadowColor=col;ctx.shadowBlur=blur*DPR;path();ctx.stroke();
}

/* ---------- shape helpers (x = width, y = up, z = forward) ---------- */
const HF=[[0,1,2,3],[5,4,7,6],[4,5,1,0],[3,2,6,7],[4,0,3,7],[1,5,6,2]];
const hexa=v=>({v,faces:HF});
const box=(x0,x1,y0,y1,z0,z1)=>hexa([[x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0],[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]]);
// trapezoid prism: base rectangle at y0 (z zb0..zb1, half-width wb), top rectangle at y1 (z zt0..zt1, half-width wt)
const shape=(zb0,zb1,wb,y0,zt0,zt1,wt,y1)=>hexa([[-wb,y0,zb0],[wb,y0,zb0],[wt,y1,zt0],[-wt,y1,zt0],[-wb,y0,zb1],[wb,y0,zb1],[wt,y1,zt1],[-wt,y1,zt1]]);
// slab with a sloping roof: rear top height yb, front top height yf
const slab=(w,y0,yb,yf,zb0,zb1,zt0,zt1)=>hexa([[-w,y0,zb0],[w,y0,zb0],[w,yb,zt0],[-w,yb,zt0],[-w,y0,zb1],[w,y0,zb1],[w,yf,zt1],[-w,yf,zt1]]);
function wheel(cx,cy,cz,r,wd,n){
  n=n||14;const v=[],faces=[[],[]];
  [-1,1].forEach((sd,si)=>{for(let k=0;k<n;k++){const a=(k+.5)/n*Math.PI*2;v.push([cx+sd*wd/2,cy+r*Math.sin(a),cz+r*Math.cos(a)]);faces[si].push(si*n+k);}});
  for(let k=0;k<n;k++)faces.push([k,(k+1)%n,n+(k+1)%n,n+k]);
  return {v,faces};
}
const wheels4=(x,r,wd,zf,zr)=>[wheel(-x,r,zf,r,wd),wheel(x,r,zf,r,wd),wheel(-x,r,zr,r,wd),wheel(x,r,zr,r,wd)];
const shift=(s,dx,dy,dz)=>({v:s.v.map(p=>[p[0]+dx,p[1]+dy,p[2]+dz]),faces:s.faces});
const mirror=s=>({v:s.v.map(p=>[-p[0],p[1],p[2]]),faces:s.faces});
// a line with an outward normal: drawn only when that side faces the camera
const L=(a,b,n)=>({a,b,n});
const rearLights=(w,y,z)=>[L([-w,y,z],[-w+.35,y,z],[0,0,-1]),L([w-.35,y,z],[w,y,z],[0,0,-1])];

/* ---------- the ten vehicles ---------- */
const VEHICLES=[
{id:'meridian',name:'Meridian',cls:'Sedan',len:'4.5 m',wh:4,use:'Everyday city driving.',build:()=>({
  parts:[...wheels4(.84,.34,.24,1.38,-1.38),slab(.9,.26,.8,.7,-2.25,2.25,-2.2,2.05),shape(-1.25,.7,.84,.78,-.95,.2,.66,1.3)],
  lines:[...rearLights(.88,.62,-2.26),L([-.9,.55,-2.2],[-.9,.55,2.2],[-1,0,0]),L([.9,.55,-2.2],[.9,.55,2.2],[1,0,0])]})},
{id:'talon',name:'Talon',cls:'Reverse trike',len:'3.4 m',wh:3,use:'Three-wheel road racers and trikes.',build:()=>{
  const fender=hexa([[.64,.6,.78],[.96,.6,.78],[.96,.68,.78],[.64,.68,.78],[.7,.5,1.5],[.9,.5,1.5],[.9,.55,1.5],[.7,.55,1.5]]);
  const wing=hexa([[.38,.5,.7],[.38,.5,1.3],[.38,.57,1.3],[.38,.57,.7],[.7,.52,.92],[.7,.52,1.25],[.7,.57,1.25],[.7,.57,.92]]);
  return {parts:[wheel(-.8,.3,1.1,.3,.22),wheel(.8,.3,1.1,.3,.22),wheel(0,.33,-1.05,.33,.26),
    box(-.24,.24,.18,.42,-.3,.4),
    hexa([[-.42,.28,.4],[.42,.28,.4],[.42,.84,.4],[-.42,.84,.4],[-.2,.3,1.85],[.2,.3,1.85],[.2,.42,1.85],[-.2,.42,1.85]]),
    hexa([[-.07,.66,-1.5],[.07,.66,-1.5],[.05,.76,-1.5],[-.05,.76,-1.5],[-.38,.4,.4],[.38,.4,.4],[.38,.84,.4],[-.38,.84,.4]]),
    shape(-.85,-.2,.2,.78,-.78,-.38,.13,.9),
    shape(.36,.48,.24,.82,.1,.18,.17,1.02),
    fender,mirror(fender),wing,mirror(wing)],
    lines:[L([-.15,.33,-1.05],[-.18,.45,-.4]),L([.15,.33,-1.05],[.18,.45,-.4]),
      L([-.3,.86,.24],[.3,.86,.24]),
      L([-.18,.36,1.86],[-.06,.38,1.86],[0,0,1]),L([.06,.38,1.86],[.18,.36,1.86],[0,0,1]),
      L([-.04,.71,-1.51],[.04,.71,-1.51],[0,0,-1])]};}},
{id:'rancher',name:'Rancher',cls:'Pickup / ute',len:'5.3 m',wh:4,use:'Utes and pickups.',build:()=>({
  parts:[...wheels4(.9,.42,.3,1.65,-1.6),slab(.95,.35,1.0,.92,-.1,2.65,-.1,2.45),shape(-.1,1.35,.9,.98,0,1.0,.78,1.75),
    box(-.95,.95,.35,.6,-2.65,-.1),box(-.95,-.85,.6,1.0,-2.65,-.1),box(.85,.95,.6,1.0,-2.65,-.1),box(-.85,.85,.6,1.0,-2.65,-2.55)],
  lines:[...rearLights(.93,.85,-2.66)]})},
{id:'courier',name:'Courier',cls:'Van',len:'5.0 m',wh:4,use:'Delivery and work vans.',build:()=>({
  parts:[...wheels4(.9,.38,.28,1.55,-1.6),box(-1,1,.32,2.15,-2.5,1.5),shape(1.5,2.5,1,.32,1.5,1.95,.95,1.5)],
  lines:[...rearLights(.98,.9,-2.51),L([1.01,.5,-.2],[1.01,1.9,-.2],[1,0,0]),L([1.01,.5,1.1],[1.01,1.9,1.1],[1,0,0]),L([-1.01,1.5,-2.3],[-1.01,1.5,1.3],[-1,0,0]),L([1.01,1.5,-2.3],[1.01,1.5,-.2],[1,0,0]),L([0,.4,-2.51],[0,2.05,-2.51],[0,0,-1])]})},
{id:'strider',name:'Strider',cls:'Motorcycle',len:'2.1 m',wh:2,use:'Bikes and scooters.',build:()=>({
  parts:[wheel(0,.33,-.72,.33,.12,12),wheel(0,.33,.72,.33,.12,12),box(-.17,.17,.22,.55,-.25,.3),shape(0,.6,.2,.55,.08,.52,.14,.78),shape(-.75,0,.14,.58,-.7,-.05,.12,.68),box(-.08,.08,.82,.98,.55,.63)],
  lines:[L([-.07,.33,.72],[-.07,.95,.52]),L([.07,.33,.72],[.07,.95,.52]),L([-.36,1.0,.5],[.36,1.0,.5]),L([.2,.3,0],[.2,.4,-.85]),L([.17,.32,-.2],[.2,.3,0])]})},
{id:'shuttle',name:'Shuttle',cls:'Shuttlecraft',len:'5.3 m',wh:0,use:'Short-range shuttle. Hovers just above the road.',hover:true,build:()=>{
  const nac=hexa([[1.3,.35,-2.45],[1.72,.35,-2.45],[1.72,.82,-2.45],[1.3,.82,-2.45],[1.3,.42,1.25],[1.72,.42,1.25],[1.72,.66,1.25],[1.3,.66,1.25]]);
  const pylon=box(1.08,1.32,.52,.72,-1.6,.4);
  return {parts:[box(-1.1,1.1,.5,1.85,-2.0,1.55),
    hexa([[-1.1,.5,1.55],[1.1,.5,1.55],[1.1,1.85,1.55],[-1.1,1.85,1.55],[-.9,.5,2.5],[.9,.5,2.5],[.9,1.0,2.5],[-.9,1.0,2.5]]),
    box(-.95,.95,.62,1.72,-2.4,-2.0),nac,mirror(nac),pylon,mirror(pylon)],
    lines:[L([-.98,1.52,1.93],[.98,1.52,1.93],[0,.75,.66]),L([-.96,1.3,2.17],[.96,1.3,2.17],[0,.75,.66]),
      L([-.33,1.3,2.17],[-.33,1.52,1.93],[0,.75,.66]),L([.33,1.3,2.17],[.33,1.52,1.93],[0,.75,.66]),
      ...[-1,1].flatMap(sd=>[L([sd*1.11,.8,-.9],[sd*1.11,1.62,-.9],[sd,0,0]),L([sd*1.11,.8,.3],[sd*1.11,1.62,.3],[sd,0,0]),L([sd*1.11,1.62,-.9],[sd*1.11,1.62,.3],[sd,0,0]),
        L([sd*1.73,.6,-2.2],[sd*1.73,.58,1.0],[sd,0,0]),L([sd*1.1,1.3,-1.9],[sd*1.1,1.3,-1.2],[sd,0,0])]),
      L([-.7,1.2,-2.41],[.7,1.2,-2.41],[0,0,-1]),L([-.7,1.1,-2.41],[.7,1.1,-2.41],[0,0,-1]),
      L([1.35,.6,-2.46],[1.67,.6,-2.46],[0,0,-1]),L([-1.67,.6,-2.46],[-1.35,.6,-2.46],[0,0,-1])]};}},
{id:'prospector',name:'Prospector',cls:'Six-wheel rover',len:'4.6 m',wh:6,use:'Off-road and 4WD.',build:()=>({
  parts:[...[-1.45,0,1.45].flatMap(z=>[wheel(-1.05,.45,z,.45,.34),wheel(1.05,.45,z,.45,.34)]),box(-.9,.9,.45,.85,-2.2,2.2),shape(0,2.0,.85,.85,.3,1.5,.7,1.75),box(-.85,.85,.85,1.6,-2.15,-.05)],
  lines:[L([.6,1.6,-1.8],[.6,2.6,-1.8]),L([.45,2.45,-1.8],[.75,2.45,-1.8]),L([-.7,1.7,-2.0],[-.7,1.7,-.2]),L([.2,1.7,-2.0],[.2,1.7,-.2]),L([-.7,1.7,-2.0],[.2,1.7,-2.0]),...rearLights(.88,.72,-2.21)]})},
{id:'haulmaster',name:'Haulmaster',cls:'Semi tractor',len:'6.4 m',wh:6,use:'Trucks and heavy haulage.',build:()=>{
  const tank=box(-1.2,-.95,.55,.95,-.6,.2);
  return {parts:[...[2.15,-1.4,-2.5].flatMap(z=>[wheel(-1.0,.5,z,.5,.42),wheel(1.0,.5,z,.5,.42)]),box(-.5,.5,.55,.9,-3.0,1.4),tank,mirror(tank),
    box(-.6,.6,.9,1.05,-2.4,-1.3),box(-1.15,1.15,.6,2.7,.2,1.3),shape(1.3,3.2,1.2,.55,1.3,3.0,1.15,2.9)],
    lines:[L([-1.25,.9,.15],[-1.25,3.25,.15]),L([1.25,.9,.15],[1.25,3.25,.15]),L([-1.2,1.8,3.08],[1.2,1.8,3.08],[0,0,1])]};}},
{id:'lancet',name:'Lancet',cls:'Sports car',len:'4.4 m',wh:4,use:'Low, fast cars.',build:()=>({
  parts:[wheel(-.9,.34,1.35,.34,.26),wheel(.9,.34,1.35,.34,.26),wheel(-.9,.36,-1.3,.36,.3),wheel(.9,.36,-1.3,.36,.3),
    hexa([[-.98,.22,-2.2],[.98,.22,-2.2],[.98,.85,-2.2],[-.98,.85,-2.2],[-.9,.22,2.25],[.9,.22,2.25],[.9,.42,2.25],[-.9,.42,2.25]]),
    shape(-1.0,.6,.78,.62,-.85,0,.55,1.12),box(-.95,.95,1.08,1.14,-2.25,-1.85)],
  lines:[L([-.6,.82,-2.0],[-.6,1.08,-2.0]),L([.6,.82,-2.0],[.6,1.08,-2.0]),...rearLights(.96,.7,-2.21)]})},
{id:'metro',name:'Metro',cls:'Bus',len:'10.5 m',wh:4,use:'Buses and coaches.',build:()=>({
  parts:[...wheels4(1.18,.5,.3,3.6,-3.0),box(-1.27,1.27,.35,3.1,-5.25,5.25),box(-.8,.8,3.1,3.35,-2.5,1.0)],
  lines:[...[-1,1].flatMap(s=>[L([s*1.28,1.6,-4.9],[s*1.28,1.6,4.9],[s,0,0]),L([s*1.28,2.75,-4.9],[s*1.28,2.75,4.9],[s,0,0])]),
    ...[[3.9,4.8],[-.3,.6]].flatMap(([a,b])=>[L([1.28,.45,a],[1.28,2.75,a],[1,0,0]),L([1.28,.45,b],[1.28,2.75,b],[1,0,0]),L([1.28,.45,(a+b)/2],[1.28,2.75,(a+b)/2],[1,0,0])]),
    L([-1.2,1.3,5.26],[1.2,1.3,5.26],[0,0,1]),...rearLights(1.25,.9,-5.26)]})},
];
function prep(p){
  const cen=avg(p.v);
  p.n=p.faces.map(f=>{let n=[0,0,0];for(let k=0;k<f.length;k++){const a=p.v[f[k]],b=p.v[f[(k+1)%f.length]];n[0]+=(a[1]-b[1])*(a[2]+b[2]);n[1]+=(a[2]-b[2])*(a[0]+b[0]);n[2]+=(a[0]-b[0])*(a[1]+b[1]);}
    const fc=avg(f.map(i=>p.v[i]));if(n[0]*(fc[0]-cen[0])+n[1]*(fc[1]-cen[1])+n[2]*(fc[2]-cen[2])<0)n=n.map(v=>-v);
    const l=Math.hypot(...n)||1;return {n:n.map(v=>v/l),c:fc};});
  const map=new Map();
  p.faces.forEach((f,fi)=>f.forEach((a,k)=>{const b=f[(k+1)%f.length],key=a<b?a+'-'+b:b+'-'+a;if(!map.has(key))map.set(key,{a,b,f:[]});map.get(key).f.push(fi);}));
  p.edges=[...map.values()].map(e=>{
    if(e.f.length!==2)return {a:e.a,b:e.b,crease:true,f:e.f};
    const n1=p.n[e.f[0]].n,n2=p.n[e.f[1]].n;
    return {a:e.a,b:e.b,f:e.f,crease:n1[0]*n2[0]+n1[1]*n2[1]+n1[2]*n2[2]<Math.cos(Math.PI/6)};
  });
}
VEHICLES.forEach(V=>{
  V.m=V.build();V.m.parts.forEach(prep);
  let r=0,h=0;V.m.parts.forEach(p=>p.v.forEach(q=>{r=Math.max(r,Math.hypot(q[0],q[2]));h=Math.max(h,q[1]);}));
  V.r=r;V.h=h;
});

/* ---------- renderer: depth buffer + hidden-line edges ---------- */
function makeView(cv,w,h){cv.width=w*DPR;cv.height=h*DPR;const ctx=cv.getContext('2d');ctx.setTransform(DPR,0,0,DPR,0,0);return {ctx,w,h,D:new Float32Array(w*h)};}
function rasterTri(D,w,h,A,B,C){
  const ar=(B[0]-A[0])*(C[1]-A[1])-(B[1]-A[1])*(C[0]-A[0]);if(Math.abs(ar)<1e-6)return;
  const x0=Math.max(0,Math.floor(Math.min(A[0],B[0],C[0]))),x1=Math.min(w-1,Math.ceil(Math.max(A[0],B[0],C[0])));
  const y0=Math.max(0,Math.floor(Math.min(A[1],B[1],C[1]))),y1=Math.min(h-1,Math.ceil(Math.max(A[1],B[1],C[1])));
  for(let y=y0;y<=y1;y++){const py=y+.5;for(let x=x0;x<=x1;x++){const px=x+.5;
    const w0=((C[0]-B[0])*(py-B[1])-(C[1]-B[1])*(px-B[0]))/ar,w1=((A[0]-C[0])*(py-C[1])-(A[1]-C[1])*(px-C[0]))/ar,w2=1-w0-w1;
    if(w0<-1e-4||w1<-1e-4||w2<-1e-4)continue;
    const iz=w0*A[2]+w1*B[2]+w2*C[2],i=y*w+x;if(iz>D[i])D[i]=iz;}}
}
function P3(c,p){const q=toCam(c,p);return q[2]<NEAR?null:[c.ox+c.f*q[0]/q[2],c.oy-c.f*q[1]/q[2],1/q[2]];}
// add the visible pieces of a 3D segment to the current path
function visSeg(ctx,view,c,a,b,eps){
  const P=P3(c,a),Q=P3(c,b);if(!P||!Q)return;
  const {D,w,h}=view,len=Math.hypot(Q[0]-P[0],Q[1]-P[1]),n=Math.max(2,Math.ceil(len/1.2));
  let start=null,prev=null;
  for(let i=0;i<=n;i++){
    const t=i/n,x=P[0]+(Q[0]-P[0])*t,y=P[1]+(Q[1]-P[1])*t,iz=P[2]+(Q[2]-P[2])*t;
    const xi=Math.floor(x),yi=Math.floor(y);let vis=true;
    if(xi>=1&&yi>=1&&xi<w-1&&yi<h-1){let d=Infinity;for(let oy=-1;oy<=1;oy++)for(let ox=-1;ox<=1;ox++){const v=D[(yi+oy)*w+xi+ox];if(v<d)d=v;}vis=iz*(1+eps)>=d;}
    if(vis){if(!start)start=[x,y];prev=[x,y];}
    else if(start){ctx.moveTo(start[0],start[1]);ctx.lineTo(prev[0],prev[1]);start=null;}
  }
  if(start){ctx.moveTo(start[0],start[1]);ctx.lineTo(prev[0],prev[1]);}
}
function draw(view,V,ang,col,bg,big){
  const {ctx,w,h,D}=view;
  ctx.shadowBlur=0;ctx.globalAlpha=1;ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);
  const R=Math.max(V.r,V.h*.9,1.4),elev=big?.42:.5,dist=R*3.4;
  const eye=[Math.sin(ang)*dist*Math.cos(elev),dist*Math.sin(elev),Math.cos(ang)*dist*Math.cos(elev)];
  const f=Math.min(w,h*1.25)*0.5*dist/(R*1.25)*(big?.72:.88);
  const c=camera(eye,[0,V.h*.32,0],f,w/2,h*(big?.52:.56));
  // 1. depth buffer of every front-facing face
  D.fill(0);
  const faceFront=[];
  V.m.parts.forEach((p,pi)=>{
    const sp=p.v.map(v=>P3(c,v));
    faceFront[pi]=p.n.map(({n,c:fc})=>n[0]*(c.x-fc[0])+n[1]*(c.y-fc[1])+n[2]*(c.z-fc[2])>0);
    p.faces.forEach((fa,fi)=>{if(!faceFront[pi][fi])return;for(let k=1;k<fa.length-1;k++){const A=sp[fa[0]],B=sp[fa[k]],C=sp[fa[k+1]];if(A&&B&&C)rasterTri(D,w,h,A,B,C);}});
  });
  // 2. turntable grid, ring and heading notch (hidden where the vehicle covers them)
  const gr=R*1.18,step=R>4?1:.5;
  ctx.strokeStyle=col;ctx.shadowColor=col;
  for(let g=-Math.floor(gr/step)*step;g<=gr;g+=step){
    const s2=Math.sqrt(Math.max(0,gr*gr-g*g));ctx.globalAlpha=Math.abs(g)<1e-6?.28:.12;ctx.lineWidth=.8;ctx.shadowBlur=0;
    ctx.beginPath();visSeg(ctx,view,c,[g,0,-s2],[g,0,s2],.004);visSeg(ctx,view,c,[-s2,0,g],[s2,0,g],.004);ctx.stroke();
  }
  ctx.globalAlpha=.6;ctx.lineWidth=1.2;ctx.shadowBlur=3*DPR;ctx.beginPath();
  for(let k=0;k<64;k++){const a0=k/64*Math.PI*2,a1=(k+1)/64*Math.PI*2;visSeg(ctx,view,c,[Math.sin(a0)*gr,0,Math.cos(a0)*gr],[Math.sin(a1)*gr,0,Math.cos(a1)*gr],.004);}
  ctx.stroke();
  const t=R*.12;ctx.globalAlpha=1;ctx.lineWidth=1.6;ctx.beginPath();
  visSeg(ctx,view,c,[-t,0,gr],[0,0,gr+t*1.6],.004);visSeg(ctx,view,c,[0,0,gr+t*1.6],[t,0,gr],.004);ctx.stroke();
  if(V.hover){ctx.globalAlpha=.45;ctx.lineWidth=1;ctx.shadowBlur=0;ctx.setLineDash([3,4]);ctx.beginPath();
    for(let k=0;k<40;k++){const a0=k/40*Math.PI*2,a1=(k+1)/40*Math.PI*2;visSeg(ctx,view,c,[Math.sin(a0)*1.9,.02,Math.cos(a0)*2.9],[Math.sin(a1)*1.9,.02,Math.cos(a1)*2.9],.004);}
    ctx.stroke();ctx.setLineDash([]);}
  // 3. vehicle edges: creases and silhouettes only, depth-tested
  ctx.globalAlpha=1;ctx.lineWidth=big?1.5:1.3;ctx.shadowBlur=(big?5:4)*DPR;ctx.beginPath();
  V.m.parts.forEach((p,pi)=>{
    const ff=faceFront[pi];
    p.edges.forEach(e=>{
      const fr=e.f.map(fi=>ff[fi]);
      if(!fr.some(Boolean))return;                       // both faces turned away
      if(!e.crease&&fr[0]===fr[1])return;                // smooth edge that is not a silhouette
      visSeg(ctx,view,c,p.v[e.a],p.v[e.b],.012);
    });
  });
  ctx.stroke();
  // 4. detail lines on the side they belong to
  ctx.lineWidth=big?1.4:1.2;ctx.shadowBlur=(big?7:5)*DPR;ctx.beginPath();
  V.m.lines.forEach(l=>{if(l.n&&l.n[0]*(c.x-l.a[0])+l.n[1]*(c.y-l.a[1])+l.n[2]*(c.z-l.a[2])<=0)return;visSeg(ctx,view,c,l.a,l.b,.02);});
  ctx.stroke();ctx.shadowBlur=0;
}

```

---

## 4. Versioning (from the owner's VERSIONING guide)

- File / build names: `ProjectName-v<version>` (e.g. `cyberNAV-v0.0.1`).
- Pre-alpha `0.0.N`, alpha `0.1.Na`, beta `0.2.Nb`, release candidate `1.0c`, full release `1.0` (no letter).
- Last number goes up by one with every build. No skipped numbers.
- Full releases go to the repo's `main` branch.
- Current state: `VERSION` file at the repo root says `0.0.2` (0.0.1 = HUD concept, 0.0.2 = vehicle select + this handoff).

## 5. Repo state (`FaradayMicrosystems/cyberNAV`, branch `main`)

| Path | What |
| --- | --- |
| `VERSION` | `0.0.2` |
| `docs/PLAN.md` | Android Auto build plan (pre-existing) |
| `docs/phosphor-hud/` | Phosphor HUD style guide: tokens, components (pre-existing) |
| `docs/concepts/cyberNAV-v0.0.1/` | HUD layout concept (committed) |
| `docs/concepts/vehicle-select/` | Vehicle picker page + screenshot (committed, 0.0.2) |
| `docs/concepts/CYBERNAV-HANDOFF.md` | This file (committed, 0.0.2) |

Related artifacts owned by the user: cyberNAV Simulator (the working browser prototype: phone + Android Auto mock, Göteborg demo city), Phosphor HUD style guide, cyberNAV for Android Auto build plan, VERSIONING.

## 6. Open next steps

1. Integrate into the Simulator / app:
   - Replace the Simulator's map layout with the sidebar + chase-view layout from section 2.
   - Add the vehicle picker to settings and draw the selected vehicle as the map marker (hidden-line renderer from section 3, scaled about 2.2×).
   - Speed limit comes from the Simulator's existing `snapshot().speedLimit` and street from `snapshot().street`.
2. Optional polish: Talon tail and windscreen variants; a still (non-turning) preview option.
