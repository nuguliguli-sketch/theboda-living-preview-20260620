"""Generate a synthetic, noisy LiDAR-like room scan (OBJ, Y-up, meters) with known ground truth.

L-shaped living room, one big window (balcony visible behind), one door (hallway behind),
a sofa against a wall (occludes wall + floor), a table (occludes floor), partial ceiling.
"""
import json
import sys

import numpy as np
import trimesh

rng = np.random.default_rng(7)
H = 2.35
POLY = [(0, 0), (6.0, 0), (6.0, 3.0), (4.2, 3.0), (4.2, 4.5), (0, 4.5)]  # CCW, inner faces
WINDOW = dict(edge=0, t0=1.5, t1=3.9, z0=0.45, z1=2.15)
DOOR = dict(edge=3, t0=0.3, t1=1.2, z0=0.0, z1=2.1)
CELL = 0.04
NOISE = 0.004

verts, faces = [], []


def surface(origin, u, v, lu, lv, keep=None, noise=NOISE, normal=None):
    """Grid-triangulated rectangle origin + a*u + b*v, a in [0,lu], b in [0,lv]."""
    origin, u, v = map(np.asarray, (origin, u, v))
    nu, nv = max(1, int(round(lu / CELL))), max(1, int(round(lv / CELL)))
    a = np.linspace(0, lu, nu + 1)
    b = np.linspace(0, lv, nv + 1)
    A, B = np.meshgrid(a, b, indexing="ij")
    P = origin + A[..., None] * u + B[..., None] * v
    n = np.cross(u, v) if normal is None else np.asarray(normal, float)
    n = n / np.linalg.norm(n)
    P = P + rng.normal(0, noise, A.shape)[..., None] * n
    base = sum(len(x) for x in verts)
    verts.append(P.reshape(-1, 3))
    idx = np.arange((nu + 1) * (nv + 1)).reshape(nu + 1, nv + 1) + base
    for i in range(nu):
        for j in range(nv):
            ca, cb = (a[i] + a[i + 1]) / 2, (b[j] + b[j + 1]) / 2
            if keep is not None and not keep(ca, cb):
                continue
            faces.append([idx[i, j], idx[i + 1, j], idx[i + 1, j + 1]])
            faces.append([idx[i, j], idx[i + 1, j + 1], idx[i, j + 1]])


def in_rect(x, y, r):
    return r[0] <= x <= r[1] and r[2] <= y <= r[3]


# --- walls (inner faces, normals into room) ---
sofa = dict(x0=0.0, x1=0.9, y0=1.0, y1=3.2, z1=0.8)
for i, (p, q) in enumerate(zip(POLY, POLY[1:] + POLY[:1])):
    p, q = np.array(p + (0,), float), np.array(q + (0,), float)
    L = np.linalg.norm(q - p)
    d = (q - p) / L
    holes = []
    for o in (WINDOW, DOOR):
        if o["edge"] == i:
            holes.append((o["t0"], o["t1"], o["z0"], o["z1"]))
    if i == 5:  # wall x=0 from y=4.5 to 0: t = 4.5 - y ; sofa occludes y in [1,3.2], z<0.8
        holes.append((4.5 - sofa["y1"], 4.5 - sofa["y0"], 0, sofa["z1"]))

    def keep(t, z, holes=holes):
        if any(in_rect(t, z, h) for h in holes):
            return False
        return not (z > H - 0.25 and rng.random() < 0.15)  # spotty top band

    inward = np.array([-d[1], d[0], 0])
    surface(p, d, [0, 0, 1], L, H, keep, normal=inward)

# --- floor (missing under sofa & table) ---
table = (2.0, 3.2, 1.5, 2.3)


def in_poly(x, y, poly=POLY):
    from matplotlib.path import Path
    return Path(poly).contains_point((x, y))


surface([0, 0, 0], [1, 0, 0], [0, 1, 0], 6.0, 4.5,
        keep=lambda x, y: in_poly(x, y) and not in_rect(x, y, (sofa["x0"], sofa["x1"], sofa["y0"], sofa["y1"]))
        and not in_rect(x, y, table))
# --- ceiling: ~65% coverage in blobs ---
blob = rng.random((20, 20))
surface([0, 0, H], [0, 1, 0], [1, 0, 0], 4.5, 6.0,
        keep=lambda y, x: in_poly(x, y) and blob[min(19, int(x / 6.0 * 20)), min(19, int(y / 4.5 * 20))] < 0.65)

# --- sofa box (top, front, ends) ---
surface([0.0, 1.0, sofa["z1"]], [1, 0, 0], [0, 1, 0], 0.9, 2.2)
surface([0.9, 1.0, 0], [0, 1, 0], [0, 0, 1], 2.2, sofa["z1"])
surface([0.0, 1.0, 0], [0, 0, 1], [1, 0, 0], sofa["z1"], 0.9)
surface([0.0, 3.2, 0], [1, 0, 0], [0, 0, 1], 0.9, sofa["z1"])
# table top
surface([2.0, 1.5, 0.45], [1, 0, 0], [0, 1, 0], 1.2, 0.8)

# --- behind window: balcony floor + far wall + window reveals ---
surface([1.0, -1.6, 0], [1, 0, 0], [0, 1, 0], 4.4, 1.45, keep=lambda a, b: rng.random() < 0.7)
surface([1.0, -1.6, 0], [0, 0, 1], [1, 0, 0], H, 4.4, keep=lambda a, b: rng.random() < 0.6)
surface([1.5, 0, 0.45], [0, -1, 0], [1, 0, 0], 0.18, 2.4)  # sill reveal
surface([1.5, 0, 2.15], [1, 0, 0], [0, -1, 0], 2.4, 0.18)  # head reveal
# glass speckle
for _ in range(60):
    x, z = rng.uniform(1.6, 3.8), rng.uniform(0.5, 2.1)
    surface([x, -0.09, z], [1, 0, 0], [0, 0, 1], 0.04, 0.04)

# --- behind door: hallway floor + far wall ---
surface([4.2, 3.3, 0], [1, 0, 0], [0, 1, 0], 1.3, 0.9)
surface([5.5, 3.3, 0], [0, 1, 0], [0, 0, 1], 0.9, 2.2)

V = np.vstack(verts)
F = np.array(faces)
# drop unused verts handled by trimesh
m = trimesh.Trimesh(V, F, process=True)
m.remove_unreferenced_vertices()

# pose: rotate 17 deg about up, translate, then convert Z-up -> Y-up (x, z, -y)
ang = np.radians(17)
R = trimesh.transformations.rotation_matrix(ang, [0, 0, 1])
T = trimesh.transformations.translation_matrix([1.3, -0.7, -1.1])
m.apply_transform(T @ R)
yup = np.array([[1, 0, 0, 0], [0, 0, 1, 0], [0, -1, 0, 0], [0, 0, 0, 1]], float)
m.apply_transform(yup)
out = sys.argv[1]
m.export(out)
truth = dict(height=H, polygon=POLY, window=WINDOW, door=DOOR)
json.dump(truth, open(out.replace(".obj", "_truth.json"), "w"), indent=1)
print("faces", len(m.faces), "verts", len(m.vertices))
