#!/usr/bin/env python3
"""cyberNAV vehicle markers: the ten wireframe vehicles of the "CyberNav Vehicle Select" design
as OsmAnd 3D location / navigation models.

Usage: make_vehicles.py <OsmAnd-resources checkout>

Writes models/cybernav_<id>/cybernav_<id>.obj + .mtl for each vehicle and registers them in
bundled_assets.json, so the app copies them to its models/ folder (re-copied on every update).

Each model is the vehicle's solid parts in near-black plus a square phosphor-green beam along
every crease edge and detail line, so on the map it reads as a glowing hidden-line wireframe.
Axes as OsmAnd's own models: x = width, y = up, z = forward. Scaled so the longest side is
6 units (OsmAnd draws one unit as 6 dp at icon size 1, like its stock car arrow).
"""
import json, math, os, sys

PHOSPHOR = (0.722, 1.0, 0.478)   # #B8FF7A (the model shader uses colours as-is, no gamma)
FACE = (0.012, 0.03, 0.016)       # near-black with a hint of green, like the building faces
SIZE = 6.0                        # longest side, model units
BEAM = 0.03                       # beam width as a fraction of SIZE (about 1.1 dp at icon size 1)
VERSION = "16.11.2026"

# ---------------------------------------------------------------- shapes (as in the artifact)
HF = [[0, 1, 2, 3], [5, 4, 7, 6], [4, 5, 1, 0], [3, 2, 6, 7], [4, 0, 3, 7], [1, 5, 6, 2]]
def hexa(v): return {"v": v, "faces": HF}
def box(x0, x1, y0, y1, z0, z1):
    return hexa([[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]])
def shape(zb0, zb1, wb, y0, zt0, zt1, wt, y1):
    return hexa([[-wb, y0, zb0], [wb, y0, zb0], [wt, y1, zt0], [-wt, y1, zt0], [-wb, y0, zb1], [wb, y0, zb1], [wt, y1, zt1], [-wt, y1, zt1]])
def slab(w, y0, yb, yf, zb0, zb1, zt0, zt1):
    return hexa([[-w, y0, zb0], [w, y0, zb0], [w, yb, zt0], [-w, yb, zt0], [-w, y0, zb1], [w, y0, zb1], [w, yf, zt1], [-w, yf, zt1]])
def wheel(cx, cy, cz, r, wd, n=14):
    v, faces = [], [[], []]
    for si, sd in enumerate((-1, 1)):
        for k in range(n):
            a = (k + .5) / n * math.pi * 2
            v.append([cx + sd * wd / 2, cy + r * math.sin(a), cz + r * math.cos(a)])
            faces[si].append(si * n + k)
    for k in range(n):
        faces.append([k, (k + 1) % n, n + (k + 1) % n, n + k])
    return {"v": v, "faces": faces}
def wheels4(x, r, wd, zf, zr): return [wheel(-x, r, zf, r, wd), wheel(x, r, zf, r, wd), wheel(-x, r, zr, r, wd), wheel(x, r, zr, r, wd)]
def mirror(s): return {"v": [[-p[0], p[1], p[2]] for p in s["v"]], "faces": s["faces"]}
def L(a, b, n=None): return (a, b, n)
def rear_lights(w, y, z): return [L([-w, y, z], [-w + .35, y, z], [0, 0, -1]), L([w - .35, y, z], [w, y, z], [0, 0, -1])]

def talon():
    fender = hexa([[.64, .6, .78], [.96, .6, .78], [.96, .68, .78], [.64, .68, .78], [.7, .5, 1.5], [.9, .5, 1.5], [.9, .55, 1.5], [.7, .55, 1.5]])
    wing = hexa([[.38, .5, .7], [.38, .5, 1.3], [.38, .57, 1.3], [.38, .57, .7], [.7, .52, .92], [.7, .52, 1.25], [.7, .57, 1.25], [.7, .57, .92]])
    return dict(parts=[wheel(-.8, .3, 1.1, .3, .22), wheel(.8, .3, 1.1, .3, .22), wheel(0, .33, -1.05, .33, .26),
        box(-.24, .24, .18, .42, -.3, .4),
        hexa([[-.42, .28, .4], [.42, .28, .4], [.42, .84, .4], [-.42, .84, .4], [-.2, .3, 1.85], [.2, .3, 1.85], [.2, .42, 1.85], [-.2, .42, 1.85]]),
        hexa([[-.07, .66, -1.5], [.07, .66, -1.5], [.05, .76, -1.5], [-.05, .76, -1.5], [-.38, .4, .4], [.38, .4, .4], [.38, .84, .4], [-.38, .84, .4]]),
        shape(-.85, -.2, .2, .78, -.78, -.38, .13, .9), shape(.36, .48, .24, .82, .1, .18, .17, 1.02),
        fender, mirror(fender), wing, mirror(wing)],
        lines=[L([-.15, .33, -1.05], [-.18, .45, -.4]), L([.15, .33, -1.05], [.18, .45, -.4]), L([-.3, .86, .24], [.3, .86, .24]),
            L([-.18, .36, 1.86], [-.06, .38, 1.86], [0, 0, 1]), L([.06, .38, 1.86], [.18, .36, 1.86], [0, 0, 1]),
            L([-.04, .71, -1.51], [.04, .71, -1.51], [0, 0, -1])])

def shuttle():
    nac = hexa([[1.3, .35, -2.45], [1.72, .35, -2.45], [1.72, .82, -2.45], [1.3, .82, -2.45], [1.3, .42, 1.25], [1.72, .42, 1.25], [1.72, .66, 1.25], [1.3, .66, 1.25]])
    pylon = box(1.08, 1.32, .52, .72, -1.6, .4)
    lines = [L([-.98, 1.52, 1.93], [.98, 1.52, 1.93], [0, .75, .66]), L([-.96, 1.3, 2.17], [.96, 1.3, 2.17], [0, .75, .66]),
             L([-.33, 1.3, 2.17], [-.33, 1.52, 1.93], [0, .75, .66]), L([.33, 1.3, 2.17], [.33, 1.52, 1.93], [0, .75, .66])]
    for sd in (-1, 1):
        lines += [L([sd * 1.11, .8, -.9], [sd * 1.11, 1.62, -.9], [sd, 0, 0]), L([sd * 1.11, .8, .3], [sd * 1.11, 1.62, .3], [sd, 0, 0]),
                  L([sd * 1.11, 1.62, -.9], [sd * 1.11, 1.62, .3], [sd, 0, 0]), L([sd * 1.73, .6, -2.2], [sd * 1.73, .58, 1.0], [sd, 0, 0]),
                  L([sd * 1.1, 1.3, -1.9], [sd * 1.1, 1.3, -1.2], [sd, 0, 0])]
    lines += [L([-.7, 1.2, -2.41], [.7, 1.2, -2.41], [0, 0, -1]), L([-.7, 1.1, -2.41], [.7, 1.1, -2.41], [0, 0, -1]),
              L([1.35, .6, -2.46], [1.67, .6, -2.46], [0, 0, -1]), L([-1.67, .6, -2.46], [-1.35, .6, -2.46], [0, 0, -1])]
    return dict(parts=[box(-1.1, 1.1, .5, 1.85, -2.0, 1.55),
        hexa([[-1.1, .5, 1.55], [1.1, .5, 1.55], [1.1, 1.85, 1.55], [-1.1, 1.85, 1.55], [-.9, .5, 2.5], [.9, .5, 2.5], [.9, 1.0, 2.5], [-.9, 1.0, 2.5]]),
        box(-.95, .95, .62, 1.72, -2.4, -2.0), nac, mirror(nac), pylon, mirror(pylon)], lines=lines)

def haulmaster():
    tank = box(-1.2, -.95, .55, .95, -.6, .2)
    parts = [w for z in (2.15, -1.4, -2.5) for w in (wheel(-1.0, .5, z, .5, .42), wheel(1.0, .5, z, .5, .42))]
    return dict(parts=parts + [box(-.5, .5, .55, .9, -3.0, 1.4), tank, mirror(tank), box(-.6, .6, .9, 1.05, -2.4, -1.3),
        box(-1.15, 1.15, .6, 2.7, .2, 1.3), shape(1.3, 3.2, 1.2, .55, 1.3, 3.0, 1.15, 2.9)],
        lines=[L([-1.25, .9, .15], [-1.25, 3.25, .15]), L([1.25, .9, .15], [1.25, 3.25, .15]), L([-1.2, 1.8, 3.08], [1.2, 1.8, 3.08], [0, 0, 1])])

def metro():
    lines = []
    for s in (-1, 1):
        lines += [L([s * 1.28, 1.6, -4.9], [s * 1.28, 1.6, 4.9], [s, 0, 0]), L([s * 1.28, 2.75, -4.9], [s * 1.28, 2.75, 4.9], [s, 0, 0])]
    for a, b in ((3.9, 4.8), (-.3, .6)):
        for z in (a, b, (a + b) / 2):
            lines.append(L([1.28, .45, z], [1.28, 2.75, z], [1, 0, 0]))
    lines += [L([-1.2, 1.3, 5.26], [1.2, 1.3, 5.26], [0, 0, 1])] + rear_lights(1.25, .9, -5.26)
    return dict(parts=wheels4(1.18, .5, .3, 3.6, -3.0) + [box(-1.27, 1.27, .35, 3.1, -5.25, 5.25), box(-.8, .8, 3.1, 3.35, -2.5, 1.0)], lines=lines)

VEHICLES = [
    ("meridian", "Meridian", "Sedan", lambda: dict(
        parts=wheels4(.84, .34, .24, 1.38, -1.38) + [slab(.9, .26, .8, .7, -2.25, 2.25, -2.2, 2.05), shape(-1.25, .7, .84, .78, -.95, .2, .66, 1.3)],
        lines=rear_lights(.88, .62, -2.26) + [L([-.9, .55, -2.2], [-.9, .55, 2.2], [-1, 0, 0]), L([.9, .55, -2.2], [.9, .55, 2.2], [1, 0, 0])])),
    ("talon", "Talon", "Reverse trike", talon),
    ("rancher", "Rancher", "Pickup / ute", lambda: dict(
        parts=wheels4(.9, .42, .3, 1.65, -1.6) + [slab(.95, .35, 1.0, .92, -.1, 2.65, -.1, 2.45), shape(-.1, 1.35, .9, .98, 0, 1.0, .78, 1.75),
            box(-.95, .95, .35, .6, -2.65, -.1), box(-.95, -.85, .6, 1.0, -2.65, -.1), box(.85, .95, .6, 1.0, -2.65, -.1), box(-.85, .85, .6, 1.0, -2.65, -2.55)],
        lines=rear_lights(.93, .85, -2.66))),
    ("courier", "Courier", "Van", lambda: dict(
        parts=wheels4(.9, .38, .28, 1.55, -1.6) + [box(-1, 1, .32, 2.15, -2.5, 1.5), shape(1.5, 2.5, 1, .32, 1.5, 1.95, .95, 1.5)],
        lines=rear_lights(.98, .9, -2.51) + [L([1.01, .5, -.2], [1.01, 1.9, -.2], [1, 0, 0]), L([1.01, .5, 1.1], [1.01, 1.9, 1.1], [1, 0, 0]),
            L([-1.01, 1.5, -2.3], [-1.01, 1.5, 1.3], [-1, 0, 0]), L([1.01, 1.5, -2.3], [1.01, 1.5, -.2], [1, 0, 0]), L([0, .4, -2.51], [0, 2.05, -2.51], [0, 0, -1])])),
    ("strider", "Strider", "Motorcycle", lambda: dict(
        parts=[wheel(0, .33, -.72, .33, .12, 12), wheel(0, .33, .72, .33, .12, 12), box(-.17, .17, .22, .55, -.25, .3), shape(0, .6, .2, .55, .08, .52, .14, .78),
               shape(-.75, 0, .14, .58, -.7, -.05, .12, .68), box(-.08, .08, .82, .98, .55, .63)],
        lines=[L([-.07, .33, .72], [-.07, .95, .52]), L([.07, .33, .72], [.07, .95, .52]), L([-.36, 1.0, .5], [.36, 1.0, .5]), L([.2, .3, 0], [.2, .4, -.85]), L([.17, .32, -.2], [.2, .3, 0])])),
    ("shuttle", "Shuttle", "Shuttlecraft", shuttle),
    ("prospector", "Prospector", "Six-wheel rover", lambda: dict(
        parts=[w for z in (-1.45, 0, 1.45) for w in (wheel(-1.05, .45, z, .45, .34), wheel(1.05, .45, z, .45, .34))]
              + [box(-.9, .9, .45, .85, -2.2, 2.2), shape(0, 2.0, .85, .85, .3, 1.5, .7, 1.75), box(-.85, .85, .85, 1.6, -2.15, -.05)],
        lines=[L([.6, 1.6, -1.8], [.6, 2.6, -1.8]), L([.45, 2.45, -1.8], [.75, 2.45, -1.8]), L([-.7, 1.7, -2.0], [-.7, 1.7, -.2]), L([.2, 1.7, -2.0], [.2, 1.7, -.2]),
               L([-.7, 1.7, -2.0], [.2, 1.7, -2.0])] + rear_lights(.88, .72, -2.21))),
    ("haulmaster", "Haulmaster", "Semi tractor", haulmaster),
    ("lancet", "Lancet", "Sports car", lambda: dict(
        parts=[wheel(-.9, .34, 1.35, .34, .26), wheel(.9, .34, 1.35, .34, .26), wheel(-.9, .36, -1.3, .36, .3), wheel(.9, .36, -1.3, .36, .3),
               hexa([[-.98, .22, -2.2], [.98, .22, -2.2], [.98, .85, -2.2], [-.98, .85, -2.2], [-.9, .22, 2.25], [.9, .22, 2.25], [.9, .42, 2.25], [-.9, .42, 2.25]]),
               shape(-1.0, .6, .78, .62, -.85, 0, .55, 1.12), box(-.95, .95, 1.08, 1.14, -2.25, -1.85)],
        lines=[L([-.6, .82, -2.0], [-.6, 1.08, -2.0]), L([.6, .82, -2.0], [.6, 1.08, -2.0])] + rear_lights(.96, .7, -2.21))),
    ("metro", "Metro", "Bus", metro),
]

# ---------------------------------------------------------------- geometry
def sub(a, b): return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
def add(a, b): return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
def mul(a, s): return [a[0] * s, a[1] * s, a[2] * s]
def dot(a, b): return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
def cross(a, b): return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
def norm(a):
    l = math.sqrt(dot(a, a)) or 1.0
    return [a[0] / l, a[1] / l, a[2] / l]
def avg(ps): return [sum(p[i] for p in ps) / len(ps) for i in range(3)]

def face_normal(v, f, cen):
    n = [0.0, 0.0, 0.0]
    for k in range(len(f)):
        a, b = v[f[k]], v[f[(k + 1) % len(f)]]
        n[0] += (a[1] - b[1]) * (a[2] + b[2]); n[1] += (a[2] - b[2]) * (a[0] + b[0]); n[2] += (a[0] - b[0]) * (a[1] + b[1])
    if dot(n, sub(avg([v[i] for i in f]), cen)) < 0:
        n = mul(n, -1)
    return norm(n)

def crease_edges(p):
    """Edges where the surface folds by more than 30 degrees (the artifact's crease rule)."""
    cen = avg(p["v"])
    normals = [face_normal(p["v"], f, cen) for f in p["faces"]]
    edges = {}
    for fi, f in enumerate(p["faces"]):
        for k in range(len(f)):
            a, b = f[k], f[(k + 1) % len(f)]
            edges.setdefault((min(a, b), max(a, b)), []).append(fi)
    out = []
    for (a, b), fs in edges.items():
        if len(fs) != 2 or dot(normals[fs[0]], normals[fs[1]]) < math.cos(math.pi / 6):
            out.append((p["v"][a], p["v"][b]))
    return normals, out

class Obj:
    def __init__(self):
        self.v, self.vn, self.faces = [], [], {"cybernav_face": [], "cybernav_edge": []}

    def poly(self, mat, pts, n):
        base = len(self.v) + 1
        self.v += pts
        self.vn.append(n)
        ni = len(self.vn)
        idx = list(range(base, base + len(pts)))
        for k in range(1, len(idx) - 1):  # triangles: the engine's loader expects them
            self.faces[mat].append([(idx[0], ni), (idx[k], ni), (idx[k + 1], ni)])

    def solid(self, p):
        cen = avg(p["v"])
        for f in p["faces"]:
            n = face_normal(p["v"], f, cen)
            pts = [p["v"][i] for i in f]
            # keep the winding counter-clockwise seen from outside
            if dot(cross(sub(pts[1], pts[0]), sub(pts[2], pts[0])), n) < 0:
                pts = pts[::-1]
            self.poly("cybernav_face", pts, n)

    def beam(self, a, b, w, out=None):
        """A square tube of width w along a-b; with an outward normal it sits on that side."""
        d = sub(b, a)
        if math.sqrt(dot(d, d)) < 1e-6:
            return
        d = norm(d)
        up = [0, 1, 0] if abs(d[1]) < .9 else [1, 0, 0]
        u = norm(cross(d, up)); v = cross(d, u)
        if out is not None:
            o = norm(out)
            a = add(a, mul(o, w * .45)); b = add(b, mul(o, w * .45))
        h = w / 2
        a, b = sub(a, mul(d, h)), add(b, mul(d, h))  # overlap the corners
        c = [add(add(p, mul(u, su * h)), mul(v, sv * h)) for p in (a, b) for su, sv in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
        self.solid({"v": c, "faces": HF})
        # HF assumes box order; recolour the faces just added as edges
        added = self.faces["cybernav_face"][-12:]
        del self.faces["cybernav_face"][-12:]
        self.faces["cybernav_edge"] += added

    def write(self, path, name):
        with open(path + ".mtl", "w") as m:
            m.write("# cyberNAV vehicle marker\n")
            m.write("newmtl cybernav_face\nKd %.3f %.3f %.3f\nd 1\n\n" % FACE)
            m.write("newmtl cybernav_edge\nKd %.3f %.3f %.3f\nd 1\n" % PHOSPHOR)
        with open(path + ".obj", "w") as o:
            o.write("# cyberNAV vehicle marker: %s\nmtllib %s.mtl\no %s\n" % (name, os.path.basename(path), os.path.basename(path)))
            for p in self.v:
                o.write("v %.4f %.4f %.4f\n" % tuple(p))
            for n in self.vn:
                o.write("vn %.4f %.4f %.4f\n" % tuple(n))
            for mat in ("cybernav_face", "cybernav_edge"):
                o.write("usemtl %s\n" % mat)
                for f in self.faces[mat]:
                    o.write("f " + " ".join("%d//%d" % t for t in f) + "\n")

def build(vid, name, make):
    m = make()
    pts = [q for p in m["parts"] for q in p["v"]]
    span = max(max(q[0] for q in pts) - min(q[0] for q in pts), max(q[2] for q in pts) - min(q[2] for q in pts))
    s = SIZE / span
    zc = (max(q[2] for q in pts) + min(q[2] for q in pts)) / 2   # centre on the vehicle's middle
    T = lambda q: [q[0] * s, q[1] * s, (q[2] - zc) * s]
    w = BEAM * SIZE
    obj = Obj()
    for p in m["parts"]:
        p = {"v": [T(q) for q in p["v"]], "faces": p["faces"]}
        obj.solid(p)
        _, edges = crease_edges(p)
        for a, b in edges:
            obj.beam(a, b, w)
    for a, b, n in m["lines"]:
        obj.beam(T(a), T(b), w * .8, n)
    return obj

def main(res):
    assets_path = os.path.join(res, "bundled_assets.json")
    assets = json.load(open(assets_path, encoding="utf-8"))
    entries = assets["assets"] if isinstance(assets, dict) else assets
    entries[:] = [e for e in entries if not e.get("source", "").startswith("models/cybernav_")]
    for vid, name, cls, make in VEHICLES:
        key = "cybernav_" + vid
        folder = os.path.join(res, "models", key)
        os.makedirs(folder, exist_ok=True)
        obj = build(vid, name, make)
        obj.write(os.path.join(folder, key), name)
        for ext in (".obj", ".mtl"):
            rel = "models/%s/%s%s" % (key, key, ext)
            entries.append({"source": rel, "destination": rel, "mode": "alwaysOverwriteOrCopy", "version": VERSION})
        tris = sum(len(f) for f in obj.faces.values())
        print("  %-11s %-16s %5d triangles" % (name, cls, tris))
    json.dump(assets, open(assets_path, "w", encoding="utf-8"), indent=4)
    print("  bundled_assets.json: %d vehicle files registered" % (2 * len(VEHICLES)))

if __name__ == "__main__":
    main(sys.argv[1])
