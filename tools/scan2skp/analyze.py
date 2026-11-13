"""LiDAR room scan (OBJ) -> clean architectural model (model.json) + diagnostic images.

Pipeline
  1. load + units + up axis  -> Z-up meters
  2. floor / ceiling heights from horizontal-face area histogram
  3. wall heading (Manhattan) from vertical-face normals, rotate plan to axes
  4. dense surface sampling
  5. room footprint: walls in the band under the ceiling (door/window headers close the loop)
     -> flood fill -> contour -> snap edges to detected wall planes
  6. openings per wall: no wall hits + see-through hits behind the wall + no occluder in front
Coordinates written to model.json are millimetres, Z-up, origin at the plan's min corner.
"""
import argparse
import json
import math
import os

import numpy as np
import trimesh
from scipy import ndimage, signal
from skimage import measure

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402



def log(*a):
    print("[analyze]", *a, flush=True)


# ---------------------------------------------------------------- loading
def load_mesh(path, up, scale):
    m = trimesh.load(path, force="mesh", process=False, skip_materials=True)
    V = np.asarray(m.vertices, float)
    F = np.asarray(m.faces)
    if up == "y":
        V = np.c_[V[:, 0], -V[:, 2], V[:, 1]]
    elif up == "-y":
        V = np.c_[V[:, 0], V[:, 2], -V[:, 1]]
    elif up == "x":
        V = np.c_[V[:, 1], V[:, 2], V[:, 0]]
    if scale == "auto":
        e = (np.percentile(V, 99, 0) - np.percentile(V, 1, 0)).max()
        s = 1.0 if e < 60 else (0.01 if e < 6000 else 0.001)
    else:
        s = float(scale)
    log(f"faces={len(F):,} verts={len(V):,} up={up} unit-scale={s}")
    return V * s, F


def face_props(V, F):
    tri = V[F]
    cr = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
    a2 = np.linalg.norm(cr, axis=1)
    ok = a2 > 1e-12
    N = np.zeros_like(cr)
    N[ok] = cr[ok] / a2[ok, None]
    return tri.mean(1), N, a2 / 2


def hist_peaks(values, weights, binw=0.01, sigma=1.5, prom=0.02, wrap=False, rng=None):
    lo, hi = rng if rng else (values.min() - binw, values.max() + binw)
    nb = max(3, int(math.ceil((hi - lo) / binw)))
    h, edges = np.histogram(values, bins=nb, range=(lo, lo + nb * binw), weights=weights)
    hs = ndimage.gaussian_filter1d(h.astype(float), sigma, mode="wrap" if wrap else "constant")
    c = (edges[:-1] + edges[1:]) / 2
    if hs.max() <= 0:
        return np.array([]), np.array([])
    if wrap:  # allow peaks at the ends
        ext = np.r_[hs[-3:], hs, hs[:3]]
        pk, _ = signal.find_peaks(ext, prominence=hs.max() * prom)
        pk = pk - 3
        pk = np.unique(pk[(pk >= 0) & (pk < nb)])
    else:
        pk, _ = signal.find_peaks(np.r_[0, hs, 0], prominence=hs.max() * prom)
        pk = pk - 1
    k = max(1, int(round(0.03 / binw))) if not wrap else 2
    mass = np.array([h[np.arange(p - k, p + k + 1) % nb].sum() if wrap else h[max(0, p - k):p + k + 1].sum() for p in pk])
    return c[pk], mass


def wmedian(x, w):
    o = np.argsort(x)
    cw = np.cumsum(w[o])
    return x[o][np.searchsorted(cw, cw[-1] / 2)]


# ---------------------------------------------------------------- levels
def find_levels(C, N, A):
    hor = np.abs(N[:, 2]) > 0.95
    z, w = C[hor, 2], A[hor]
    pos, mass = hist_peaks(z, w, 0.01)
    if len(pos) == 0:
        raise SystemExit("no horizontal surfaces found - wrong up axis? try --up z")
    sig = mass >= max(0.3, 0.04 * mass.max())
    lv = sorted(zip(pos[sig], mass[sig]))
    floor_z = lv[0][0]
    ceil_z = lv[-1][0]
    ref = lambda c: wmedian(z[np.abs(z - c) < 0.03], w[np.abs(z - c) < 0.03])
    floor_z, ceil_z = ref(floor_z), ref(ceil_z)
    levels = [(float(p - floor_z), float(m)) for p, m in lv]
    return floor_z, ceil_z, levels


def find_heading(N, A):
    vert = np.abs(N[:, 2]) < 0.15
    th = np.arctan2(N[vert, 1], N[vert, 0])
    w = A[vert]
    phi = np.mod(th, np.pi / 2)
    nb = 360
    h, e = np.histogram(phi, bins=nb, range=(0, np.pi / 2), weights=w)
    hs = ndimage.gaussian_filter1d(h, 3, mode="wrap")
    a0 = (e[np.argmax(hs)] + e[np.argmax(hs) + 1]) / 2
    a = a0
    for _ in range(6):  # iterated windowed circular mean (unbiased once centred)
        dev = np.angle(np.exp(4j * (th - a))) / 4
        sel = np.abs(dev) < np.radians(15)
        a = a + np.angle(np.sum(w[sel] * np.exp(4j * (th[sel] - a)))) / 4
    return float(a)


def find_dirs(N, A, min_frac=0.04):
    """Wall directions (deg, mod 180) after Manhattan alignment; always includes 0 and 90."""
    vert = np.abs(N[:, 2]) < 0.15
    # wall direction = normal angle + 90
    th = np.degrees(np.arctan2(N[vert, 1], N[vert, 0])) + 90
    d = np.mod(th, 180)
    pos, mass = hist_peaks(d, A[vert], 1.0, 1.5, 0.02, wrap=True, rng=(0, 180))
    dirs = [0.0, 90.0]
    tot = A[vert].sum()
    for p, m in zip(pos, mass):
        if m / tot < min_frac:
            continue
        if min(abs(p - 0), abs(p - 90), abs(p - 180)) < 4:
            continue
        if all(min(abs(p - q), 180 - abs(p - q)) > 4 for q in dirs):
            dirs.append(float(round(p, 1)))
    return dirs


# ---------------------------------------------------------------- footprint
class Grid:
    def __init__(self, xy, res):
        self.res = res
        self.lo = np.percentile(xy, 0.2, 0) - 0.6
        hi = np.percentile(xy, 99.8, 0) + 0.6
        self.shape = tuple(np.ceil((hi - self.lo) / res).astype(int))

    def raster(self, pts):
        img = np.zeros(self.shape, bool)
        ij = np.floor((pts - self.lo) / self.res).astype(int)
        ok = (ij[:, 0] >= 0) & (ij[:, 1] >= 0) & (ij[:, 0] < self.shape[0]) & (ij[:, 1] < self.shape[1])
        img[ij[ok, 0], ij[ok, 1]] = True
        return img

    def to_world(self, rc):
        return self.lo + (np.asarray(rc) + 0.5) * self.res


def footprint(P, Nr, H, grid, log_notes):
    xy, z = P[:, :2], P[:, 2]
    hor = np.abs(Nr[:, 2]) > 0.9
    vert = np.abs(Nr[:, 2]) < 0.3
    cov = grid.raster(xy[hor & (np.abs(z) < 0.05)]) | grid.raster(xy[hor & (np.abs(z - H) < 0.08)])
    cov = ndimage.binary_closing(cov, iterations=2)
    band = vert & (z > H - 0.30) & (z < H - 0.04)
    bnd = grid.raster(xy[band])
    r = 3
    bnd_d = ndimage.binary_dilation(bnd, iterations=r)
    free = ~bnd_d
    dist = ndimage.distance_transform_edt(free)
    dist[~cov] = 0
    seed = np.unravel_index(np.argmax(dist), dist.shape)
    lab, _ = ndimage.label(free)
    comp = lab == lab[seed]
    leak = comp[0, :].any() or comp[-1, :].any() or comp[:, 0].any() or comp[:, -1].any()
    if not leak and comp.sum() * grid.res ** 2 > 2.0:
        R = ndimage.binary_dilation(comp, iterations=r)
        method = "ceiling-band walls"
    else:
        log_notes.append("천장 아래 벽 띠가 닫혀 있지 않음(개방형 구조 또는 스캔 누락) - 바닥/천장 커버리지로 외곽 추정")
        cc = ndimage.binary_fill_holes(ndimage.binary_closing(cov, iterations=3))
        lab, n = ndimage.label(cc)
        sizes = ndimage.sum(cc, lab, range(1, n + 1))
        R = lab == (np.argmax(sizes) + 1)
        method = "floor/ceiling coverage"
    R = ndimage.binary_fill_holes(R)
    cs = measure.find_contours(np.pad(R, 1).astype(float), 0.5)
    c = max(cs, key=len) - 1
    approx = measure.approximate_polygon(c, tolerance=2.5)
    pts = grid.to_world(approx[:-1])
    if signed_area(pts) < 0:
        pts = pts[::-1]
    return pts, R, cov, bnd, method


def signed_area(p):
    x, y = p[:, 0], p[:, 1]
    return 0.5 * np.sum(x * np.roll(y, -1) - np.roll(x, -1) * y)


def wall_lines(P, Nr, H, dirs, pt_area, min_area=0.15):
    xy, z = P[:, :2], P[:, 2]
    v = (np.abs(Nr[:, 2]) < 0.3) & (z > 0.1) & (z < H - 0.05)
    out = []
    for b in dirs:
        br = math.radians(b)
        n = np.array([-math.sin(br), math.cos(br)])
        sel = v & (np.abs(Nr[:, :2] @ n) > 0.95)
        if sel.sum() < 50:
            continue
        s = xy[sel] @ n
        pos, mass = hist_peaks(s, np.full(sel.sum(), pt_area), 0.01, 1.0, 0.01)
        for p, m in zip(pos, mass):
            if m >= min_area:
                near = np.abs(s - p) < 0.02
                out.append(dict(beta=b, off=float(np.median(s[near])), area=float(m)))
    return out


def snap_polygon(pts, dirs, lines, notes):
    k = len(pts)
    segs = []
    for i in range(k):
        a, b = pts[i], pts[(i + 1) % k]
        v = b - a
        L = np.linalg.norm(v)
        ang = math.degrees(math.atan2(v[1], v[0])) % 180
        dd = [min(abs(ang - q), 180 - abs(ang - q)) for q in dirs]
        j = int(np.argmin(dd))
        snapped = dd[j] <= 12
        beta = dirs[j] if snapped else ang
        br = math.radians(beta)
        n = np.array([-math.sin(br), math.cos(br)])
        s0 = float(((a + b) / 2) @ n)
        cands = [ln for ln in lines if snapped and abs(ln["beta"] - beta) < 0.5 and abs(ln["off"] - s0) < 0.15]
        if cands:
            off = min(cands, key=lambda ln: abs(ln["off"] - s0))["off"]
        else:
            off = s0
        segs.append(dict(beta=beta, off=off, L=L, snapped=snapped, a=a, b=b, plane=bool(cands)))
    # merge consecutive collinear
    changed = True
    while changed and len(segs) > 3:
        changed = False
        for i in range(len(segs)):
            s1, s2 = segs[i], segs[(i + 1) % len(segs)]
            if abs(s1["beta"] - s2["beta"]) < 0.5 and abs(s1["off"] - s2["off"]) < 0.03:
                w = s1["L"] + s2["L"]
                s1.update(off=(s1["off"] * s1["L"] + s2["off"] * s2["L"]) / w if not (s1["plane"] or s2["plane"]) else
                          (s1["off"] if s1["plane"] else s2["off"]), L=w, b=s2["b"], plane=s1["plane"] or s2["plane"])
                segs.pop((i + 1) % len(segs))
                changed = True
                break
    # insert connectors between parallel neighbours with different offsets (jogs)
    out = []
    for i in range(len(segs)):
        s1, s2 = segs[i], segs[(i + 1) % len(segs)]
        out.append(s1)
        if abs(s1["beta"] - s2["beta"]) < 0.5:
            b = s1["beta"] + 90
            br = math.radians(b)
            n = np.array([-math.sin(br), math.cos(br)])
            out.append(dict(beta=b % 180, off=float(s1["b"] @ n), L=0.1, snapped=True, a=s1["b"], b=s2["a"], plane=False))
    segs = out

    def verts(segs):
        V = []
        for i in range(len(segs)):
            s1, s2 = segs[i - 1], segs[i]
            n1 = np.array([-math.sin(math.radians(s1["beta"])), math.cos(math.radians(s1["beta"]))])
            n2 = np.array([-math.sin(math.radians(s2["beta"])), math.cos(math.radians(s2["beta"]))])
            M = np.array([n1, n2])
            V.append(np.linalg.solve(M, [s1["off"], s2["off"]]))
        return np.array(V)

    # drop tiny / unsnapped short edges
    for _ in range(50):
        V = verts(segs)
        lens = [np.linalg.norm(V[(i + 1) % len(V)] - V[i]) for i in range(len(V))]
        bad = [i for i, L in enumerate(lens) if L < 0.03 or (not segs[i]["snapped"] and L < 0.25)]
        if not bad or len(segs) <= 3:
            break
        i = min(bad, key=lambda j: lens[j])
        segs.pop(i)
        # re-merge collinear neighbours
        j = i % len(segs)
        s1, s2 = segs[j - 1], segs[j]
        if abs(s1["beta"] - s2["beta"]) < 0.5:
            if abs(s1["off"] - s2["off"]) < 0.03:
                segs.pop(j)
            else:  # parallel with jog: connector
                b = (s1["beta"] + 90) % 180
                br = math.radians(b)
                n = np.array([-math.sin(br), math.cos(br)])
                segs.insert(j, dict(beta=b, off=float(s1["b"] @ n), L=0.1, snapped=True, a=s1["b"], b=s2["a"], plane=False))
    V = verts(segs)
    nplane = sum(s["plane"] for s in segs)
    if nplane < len(segs):
        notes.append(f"벽 {len(segs)}개 중 {len(segs) - nplane}개는 뚜렷한 벽 평면이 없어 외곽 윤곽 기준으로 배치")
    return V, segs


# ---------------------------------------------------------------- openings
def detect_openings(P, Nr, poly, H, res=0.02):
    xy, z = P[:, :2], P[:, 2]
    k = len(poly)
    res_walls = []
    for i in range(k):
        a, b = poly[i], poly[(i + 1) % k]
        L = float(np.linalg.norm(b - a))
        d = (b - a) / L
        nout = np.array([d[1], -d[0]])
        rel = xy - a
        t = rel @ d
        s = rel @ nout
        inz = (z > 0.02) & (z < H - 0.02)
        sel = (t > -0.02) & (t < L + 0.02) & inz
        nt, nz = int(math.ceil(L / res)), int(math.ceil(H / res))

        def rast(m):
            img = np.zeros((nt, nz), bool)
            ti = np.clip((t[m] / res).astype(int), 0, nt - 1)
            zi = np.clip((z[m] / res).astype(int), 0, nz - 1)
            img[ti, zi] = True
            return img

        Wm = sel & (np.abs(s) < 0.035)
        Wi = ndimage.binary_closing(rast(Wm), iterations=2)
        Bi = ndimage.binary_dilation(rast(sel & (s > 0.05) & (s < 4.0)), iterations=2)
        Fi = ndimage.binary_dilation(rast(sel & (s < -0.06) & (s > -1.2) & (z > 0.03) & (z < H - 0.03)), iterations=2)
        cand = ~Wi & Bi & ~Fi
        cand = ndimage.binary_opening(cand, iterations=3)
        lab, n = ndimage.label(cand)
        ops = []
        for j in range(1, n + 1):
            m = lab == j
            if m.sum() * res * res < 0.12:
                continue
            ti, zi = np.nonzero(m)
            t0i, t1i, z0i, z1i = ti.min(), ti.max() + 1, zi.min(), zi.max() + 1
            sub = m[t0i:t1i, z0i:z1i]
            cols = np.nonzero(sub.mean(1) > 0.5)[0]
            rows = np.nonzero(sub.mean(0) > 0.5)[0]
            if len(cols) == 0 or len(rows) == 0:
                continue
            t0, t1 = (t0i + cols.min()) * res, (t0i + cols.max() + 1) * res
            z0, z1 = (z0i + rows.min()) * res, (z0i + rows.max() + 1) * res
            if z0 < 0.08:
                z0 = 0.0
            if z1 > H - 0.08:
                z1 = H
            t0 = 0.0 if t0 < 0.05 else t0
            t1 = L if t1 > L - 0.05 else t1
            if t1 - t0 < 0.35 or z1 - z0 < 0.35:
                continue
            if z0 == 0 and z1 - z0 >= 1.6:
                typ = "opening" if z1 >= H else "door"
            else:
                typ = "window"
            ops.append(dict(t0=t0, t1=t1, z0=z0, z1=z1, type=typ))
        # residual of wall plane fit
        wpts = Wm & (np.abs(Nr[:, :2] @ nout) > 0.9)
        dev = float(np.median(np.abs(s[wpts]))) if wpts.sum() > 20 else None
        covf = float(Wi.mean())
        res_walls.append(dict(openings=ops, dev=dev, coverage=covf, img=(Wi, Bi, Fi, cand), L=L))
    return res_walls


# ---------------------------------------------------------------- diagnostics
def plot_plan(path, P, Nr, H, grid, R, cov, bnd, poly, walls, title):
    fig, ax = plt.subplots(figsize=(11, 11 * grid.shape[1] / max(grid.shape) + 1))
    ext = [grid.lo[0], grid.lo[0] + grid.shape[0] * grid.res, grid.lo[1], grid.lo[1] + grid.shape[1] * grid.res]
    img = np.zeros(grid.shape + (3,))
    img[...] = 1
    img[cov] = (0.85, 0.92, 1.0)
    img[bnd] = (0.35, 0.35, 0.35)
    ax.imshow(np.transpose(img, (1, 0, 2)), origin="lower", extent=ext, interpolation="nearest")
    pc = np.vstack([poly, poly[:1]])
    ax.plot(pc[:, 0], pc[:, 1], "-", color="crimson", lw=2)
    for i, w in enumerate(walls):
        a, b = poly[i], poly[(i + 1) % len(poly)]
        d = (b - a) / np.linalg.norm(b - a)
        nin = np.array([-d[1], d[0]])
        mid = (a + b) / 2 + nin * 0.25
        ax.text(*mid, f"W{i + 1}\n{w['L'] * 1000:.0f}", ha="center", va="center", fontsize=8, color="crimson")
        for o in w["openings"]:
            p0, p1 = a + d * o["t0"], a + d * o["t1"]
            col = {"window": "dodgerblue", "door": "darkorange", "opening": "seagreen"}[o["type"]]
            ax.plot([p0[0], p1[0]], [p0[1], p1[1]], "-", color=col, lw=6, alpha=0.8)
    ax.set_aspect("equal")
    ax.set_title(title)
    ax.set_xlabel("x [m]")
    ax.set_ylabel("y [m]")
    fig.tight_layout()
    fig.savefig(path, dpi=110)
    plt.close(fig)


def plot_walls(path, walls, H, res=0.02):
    n = len(walls)
    Lmax = max(w["L"] for w in walls)
    fig, axs = plt.subplots(n, 1, figsize=(12, (12 * H / Lmax + 0.45) * n + 0.6))
    axs = np.atleast_1d(axs)
    for i, (ax, w) in enumerate(zip(axs, walls)):
        Wi, Bi, Fi, cand = w["img"]
        img = np.ones(Wi.shape + (3,))
        img[Bi] = (1.0, 0.8, 0.55)
        img[Fi] = (0.8, 0.7, 0.95)
        img[Wi] = (0.55, 0.55, 0.55)
        ax.imshow(np.transpose(img, (1, 0, 2)), origin="lower", extent=[0, Wi.shape[0] * res, 0, Wi.shape[1] * res],
                  interpolation="nearest", aspect="equal")
        for o in w["openings"]:
            ax.add_patch(plt.Rectangle((o["t0"], o["z0"]), o["t1"] - o["t0"], o["z1"] - o["z0"], fill=False,
                                       ec="green", lw=2))
        dv = f"{w['dev'] * 1000:.0f}mm" if w["dev"] is not None else "-"
        ax.set_title(f"W{i + 1}  L={w['L'] * 1000:.0f}mm  coverage={w['coverage'] * 100:.0f}%  dev={dv}", fontsize=9)
        ax.set_yticks([0, H])
        ax.set_xlim(0, Lmax)
    fig.suptitle("wall elevations (seen from inside) - gray: wall hit, orange: behind wall, purple: occluder, green: opening",
                 fontsize=9)
    fig.tight_layout()
    fig.savefig(path, dpi=100)
    plt.close(fig)


# ---------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("obj")
    ap.add_argument("-o", "--out", default="out")
    ap.add_argument("--up", default="y", choices=["y", "z", "-y", "x"])
    ap.add_argument("--scale", default="auto")
    ap.add_argument("--thickness", type=float, default=150, help="default wall thickness [mm]")
    ap.add_argument("--spacing", type=float, default=0.015, help="surface sample spacing [m]")
    ap.add_argument("--round", type=float, default=5, help="round dimensions to [mm]")
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    notes = []

    V, F = load_mesh(args.obj, args.up, args.scale)
    C, N, A = face_props(V, F)
    floor_z, ceil_z, levels = find_levels(C, N, A)
    H = ceil_z - floor_z
    log(f"floor={floor_z:.3f} ceiling={ceil_z:.3f} height={H:.3f} m")
    if not (1.9 <= H <= 4.5):
        notes.append(f"층고 {H:.2f}m - 비정상, 위쪽 축(--up) 확인 필요")
    alpha = find_heading(N, A)
    log(f"heading {math.degrees(alpha):.2f} deg")
    Rz = trimesh.transformations.rotation_matrix(-alpha, [0, 0, 1])[:3, :3]
    V2 = (V - [0, 0, floor_z]) @ Rz.T
    C2, N2, A2 = face_props(V2, F)
    dirs = find_dirs(N2, A2)
    log("wall directions", dirs)

    mesh = trimesh.Trimesh(V2, F, process=False)
    total = A2.sum()
    count = int(np.clip(total / args.spacing ** 2, 2e5, 5e6))
    P, fi = trimesh.sample.sample_surface(mesh, count, seed=0)
    Nr = N2[fi]
    pt_area = total / count
    log(f"sampled {count:,} pts, surface {total:.1f} m2")

    grid = Grid(P[:, :2], 0.02)
    pts, R, cov, bnd, method = footprint(P, Nr, H, grid, notes)
    lines = wall_lines(P, Nr, H, dirs, pt_area)
    poly, segs = snap_polygon(pts, dirs, lines, notes)
    log(f"footprint via {method}: {len(poly)} corners, area {signed_area(poly):.2f} m2")

    # rounding (mm) in the aligned frame, origin at min corner
    rnd = args.round / 1000
    shift = np.floor(poly.min(0) / rnd) * rnd
    poly = poly - shift
    if all(abs((s["beta"] % 90)) < 1e-6 for s in segs):
        poly = np.round(poly / rnd) * rnd
    shift = shift + poly.min(0)
    poly = poly - poly.min(0)
    P[:, :2] -= shift
    Hr = round(H / rnd) * rnd

    walls = detect_openings(P, Nr, poly, Hr)
    for w in walls:
        for o in w["openings"]:
            for kk in ("t0", "t1", "z0", "z1"):
                o[kk] = round(o[kk] / rnd) * rnd

    grid.lo = grid.lo - shift
    plot_plan(os.path.join(args.out, "diag_plan.png"), P, Nr, Hr, grid, R, cov, bnd, poly, walls,
              f"plan  H={Hr * 1000:.0f}mm  ({method})")
    plot_walls(os.path.join(args.out, "diag_walls.png"), walls, Hr)

    mm = lambda x: round(float(x) * 1000, 1)
    model = dict(
        units="mm",
        height=mm(Hr),
        wall_thickness=args.thickness,
        floor_polygon=[[mm(x), mm(y)] for x, y in poly],
        walls=[dict(id=f"W{i + 1}", length=mm(w["L"]), thickness=args.thickness,
                    scan_deviation_mm=None if w["dev"] is None else mm(w["dev"]),
                    scan_coverage=round(w["coverage"], 2)) for i, w in enumerate(walls)],
        openings=[],
        ceiling_levels_mm=[dict(z=mm(z), area_m2=round(m, 2)) for z, m in levels if z > 1.8],
        notes=notes,
        source=dict(file=os.path.basename(args.obj), up=args.up, heading_deg=round(math.degrees(alpha), 3),
                    floor_z=round(float(floor_z), 4), shift_m=[round(float(s), 4) for s in shift],
                    footprint_method=method),
    )
    k = 1
    for i, w in enumerate(walls):
        for o in w["openings"]:
            model["openings"].append(dict(id=f"O{k}", wall=f"W{i + 1}", type=o["type"], offset=mm(o["t0"]),
                                          width=mm(o["t1"] - o["t0"]), sill=mm(o["z0"]), height=mm(o["z1"] - o["z0"])))
            k += 1
    with open(os.path.join(args.out, "model.json"), "w") as f:
        json.dump(model, f, indent=1, ensure_ascii=False)
    log(f"walls={len(walls)} openings={len(model['openings'])} -> {args.out}/model.json")
    for nt in notes:
        log("NOTE", nt)


if __name__ == "__main__":
    main()
