"""model.json (clean room spec, mm) -> SketchUp Ruby builder (.rb), COLLADA (.dae), plan/3D previews, report.

Walls are one closed solid group (inner polygon offset outward by each wall's thickness), openings cut
through with reveals; floor / ceiling are separate groups; windows get frame + glass, doors frame + leaf.
"""
import argparse
import json
import math
import os
from xml.sax.saxutils import escape

import mapbox_earcut as earcut
import numpy as np
import shapely
from shapely.geometry import Polygon, MultiPolygon, box
from shapely.ops import unary_union

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from mpl_toolkits.mplot3d.art3d import Poly3DCollection  # noqa: E402

plt.rcParams["font.family"] = ["NanumGothic", "DejaVu Sans"]
plt.rcParams["axes.unicode_minus"] = False

MATERIALS = {  # name: (rgb 0-255, alpha)
    "wall": ((236, 234, 228), 1.0),
    "floor": ((196, 164, 124), 1.0),
    "ceiling": ((248, 248, 246), 1.0),
    "frame": ((70, 72, 76), 1.0),
    "glass": ((170, 205, 230), 0.35),
    "door": ((214, 196, 170), 1.0),
}
MAT_KO = {"wall": "벽", "floor": "바닥", "ceiling": "천장", "frame": "창틀", "glass": "유리", "door": "문"}
TAGS = {"walls": "벽", "floor": "바닥", "ceiling": "천장", "openings": "창호"}


class Face:
    __slots__ = ("group", "mat", "outer", "holes", "normal")

    def __init__(self, group, mat, outer, holes, normal):
        self.group, self.mat = group, mat
        self.outer = [tuple(map(float, p)) for p in outer]
        self.holes = [[tuple(map(float, p)) for p in h] for h in holes]
        self.normal = tuple(float(x) for x in normal)


def signed_area(p):
    p = np.asarray(p)
    return 0.5 * np.sum(p[:, 0] * np.roll(p[:, 1], -1) - np.roll(p[:, 0], -1) * p[:, 1])


def polys(geom, min_area=1.0):
    geom = shapely.set_precision(geom, 0.01)
    if geom.is_empty:
        return []
    gs = list(geom.geoms) if hasattr(geom, "geoms") else [geom]
    out = []
    for g in gs:
        if isinstance(g, Polygon) and g.area > min_area:
            g = shapely.geometry.polygon.orient(g.simplify(0.0), 1.0)
            out.append((list(g.exterior.coords)[:-1], [list(r.coords)[:-1] for r in g.interiors]))
    return out


def line_x(n1, o1, n2, o2, fallback):
    M = np.array([n1, n2])
    if abs(np.linalg.det(M)) < 1e-9:
        return fallback
    return np.linalg.solve(M, [o1, o2])


# ------------------------------------------------------------------ geometry
def make_geometry(m):
    H = float(m["height"])
    P = np.array(m["floor_polygon"], float)
    if signed_area(P) < 0:
        raise SystemExit("floor_polygon must be counter-clockwise (walls are indexed by its edges)")
    k = len(P)
    walls = m.get("walls") or [{} for _ in range(k)]
    if len(walls) != k:
        raise SystemExit(f"walls ({len(walls)}) must match polygon edges ({k})")
    T0 = float(m.get("wall_thickness", 150))
    thk = [float(w.get("thickness") or T0) for w in walls]
    ids = [w.get("id", f"W{i + 1}") for i, w in enumerate(walls)]

    A = P
    B = np.roll(P, -1, 0)
    L = np.linalg.norm(B - A, axis=1)
    D = (B - A) / L[:, None]
    Nout = np.c_[D[:, 1], -D[:, 0]]
    off_out = np.einsum("ij,ij->i", A, Nout) + np.array(thk)
    O = np.array([line_x(Nout[i - 1], off_out[i - 1], Nout[i], off_out[i], A[i] + Nout[i] * thk[i]) for i in range(k)])
    O_next = np.roll(O, -1, 0)
    delta = np.einsum("ij,ij->i", O - A, D)  # outer start along d, relative to inner start
    Lout = np.linalg.norm(O_next - O, axis=1)

    ops = {i: [] for i in range(k)}
    warnings = []
    for o in m.get("openings", []):
        i = ids.index(o["wall"])
        t0, t1 = float(o["offset"]), float(o["offset"]) + float(o["width"])
        z0, z1 = float(o.get("sill", 0)), float(o.get("sill", 0)) + float(o["height"])
        t0, t1 = max(0.0, t0), min(L[i], t1)
        z0, z1 = max(0.0, z0), min(H, z1)
        if t1 - t0 < 50 or z1 - z0 < 50:
            warnings.append(f"{o['id']}: too small, skipped")
            continue
        for q in ops[i]:
            if t0 < q["t1"] and q["t0"] < t1 and z0 < q["z1"] and q["z0"] < z1:
                warnings.append(f"{o['id']} overlaps {q['id']}")
        ops[i].append(dict(id=o["id"], type=o.get("type", "window"), t0=t0, t1=t1, z0=z0, z1=z1))

    faces = []

    def inner3(i, t, z):
        p = A[i] + D[i] * t
        return (p[0], p[1], z)

    def outer3(i, t, z):  # t measured along the inner wall
        p = A[i] + D[i] * t + Nout[i] * thk[i]
        return (p[0], p[1], z)

    def local3(i, t, s, z):
        p = A[i] + D[i] * t + Nout[i] * s
        return (p[0], p[1], z)

    def footprint(i, q):
        return Polygon([A[i] + D[i] * q["t0"], A[i] + D[i] * q["t1"],
                        A[i] + D[i] * q["t1"] + Nout[i] * thk[i], A[i] + D[i] * q["t0"] + Nout[i] * thk[i]])

    # --- wall faces
    for i in range(k):
        holes = unary_union([box(q["t0"], q["z0"], q["t1"], q["z1"]) for q in ops[i]]) if ops[i] else None
        g_in = box(0, 0, L[i], H)
        g_out = box(delta[i], 0, delta[i] + Lout[i], H)
        if holes is not None:
            g_in, g_out = g_in.difference(holes), g_out.difference(holes)
        for ext, ints in polys(g_in):
            faces.append(Face("walls", "wall", [inner3(i, t, z) for t, z in ext],
                              [[inner3(i, t, z) for t, z in r] for r in ints], (-Nout[i][0], -Nout[i][1], 0)))
        for ext, ints in polys(g_out):
            faces.append(Face("walls", "wall", [outer3(i, t, z) for t, z in ext],
                              [[outer3(i, t, z) for t, z in r] for r in ints], (Nout[i][0], Nout[i][1], 0)))
        for q in ops[i]:
            t0, t1, z0, z1 = q["t0"], q["t1"], q["z0"], q["z1"]
            faces.append(Face("walls", "wall", [inner3(i, t0, z0), inner3(i, t0, z1), outer3(i, t0, z1), outer3(i, t0, z0)],
                              [], tuple(D[i]) + (0,)))
            faces.append(Face("walls", "wall", [inner3(i, t1, z0), outer3(i, t1, z0), outer3(i, t1, z1), inner3(i, t1, z1)],
                              [], tuple(-D[i]) + (0,)))
            if z1 < H:
                faces.append(Face("walls", "wall", [inner3(i, t0, z1), inner3(i, t1, z1), outer3(i, t1, z1), outer3(i, t0, z1)],
                                  [], (0, 0, -1)))
            if z0 > 0:
                faces.append(Face("walls", "wall", [inner3(i, t0, z0), outer3(i, t0, z0), outer3(i, t1, z0), inner3(i, t1, z0)],
                                  [], (0, 0, 1)))
    # --- top / bottom rings
    ring = Polygon(O).difference(Polygon(P))
    cut_bot = [footprint(i, q) for i in range(k) for q in ops[i] if q["z0"] <= 0]
    cut_top = [footprint(i, q) for i in range(k) for q in ops[i] if q["z1"] >= H]
    for geom, z, nz in ((ring.difference(unary_union(cut_bot)) if cut_bot else ring, 0.0, -1),
                        (ring.difference(unary_union(cut_top)) if cut_top else ring, H, 1)):
        for ext, ints in polys(geom):
            faces.append(Face("walls", "wall", [(x, y, z) for x, y in ext], [[(x, y, z) for x, y in r] for r in ints],
                              (0, 0, nz)))
    # --- floor & ceiling
    fl = Polygon(P)
    door_fp = [footprint(i, q) for i in range(k) for q in ops[i] if q["z0"] <= 0]
    if door_fp:
        fl = unary_union([fl] + door_fp)
    for ext, ints in polys(fl):
        faces.append(Face("floor", "floor", [(x, y, 0.0) for x, y in ext], [[(x, y, 0.0) for x, y in r] for r in ints],
                          (0, 0, 1)))
    for ext, ints in polys(Polygon(P)):
        faces.append(Face("ceiling", "ceiling", [(x, y, H) for x, y in ext], [[(x, y, H) for x, y in r] for r in ints],
                          (0, 0, -1)))

    # --- windows / doors
    def add_box(group, mat, i, t0, t1, s0, s1, z0, z1):
        c = {(a, b, cc): local3(i, (t0, t1)[a], (s0, s1)[b], (z0, z1)[cc]) for a in (0, 1) for b in (0, 1) for cc in (0, 1)}
        d, n = tuple(D[i]) + (0,), tuple(Nout[i]) + (0,)
        neg = lambda v: tuple(-x for x in v)
        quads = [
            ([c[0, 0, 0], c[0, 0, 1], c[0, 1, 1], c[0, 1, 0]], neg(d)),
            ([c[1, 0, 0], c[1, 1, 0], c[1, 1, 1], c[1, 0, 1]], d),
            ([c[0, 0, 0], c[1, 0, 0], c[1, 0, 1], c[0, 0, 1]], neg(n)),
            ([c[0, 1, 0], c[0, 1, 1], c[1, 1, 1], c[1, 1, 0]], n),
            ([c[0, 0, 0], c[0, 1, 0], c[1, 1, 0], c[1, 0, 0]], (0, 0, -1)),
            ([c[0, 0, 1], c[1, 0, 1], c[1, 1, 1], c[0, 1, 1]], (0, 0, 1)),
        ]
        for q, nn in quads:
            faces.append(Face(group, mat, q, [], nn))

    fw, fd = 50.0, 70.0
    for i in range(k):
        for q in ops[i]:
            t0, t1, z0, z1 = q["t0"], q["t1"], q["z0"], q["z1"]
            g = f"openings/{q['id']}"
            sc = thk[i] / 2
            if q["type"] == "window":
                s0, s1 = sc - fd / 2, sc + fd / 2
                add_box(g, "frame", i, t0, t1, s0, s1, z0, z0 + fw)
                add_box(g, "frame", i, t0, t1, s0, s1, z1 - fw, z1)
                add_box(g, "frame", i, t0, t0 + fw, s0, s1, z0 + fw, z1 - fw)
                add_box(g, "frame", i, t1 - fw, t1, s0, s1, z0 + fw, z1 - fw)
                panes = [(t0 + fw, t1 - fw)]
                if t1 - t0 > 1200:  # sliding window: centre mullion, two panes
                    tm = (t0 + t1) / 2
                    add_box(g, "frame", i, tm - fw / 2, tm + fw / 2, s0, s1, z0 + fw, z1 - fw)
                    panes = [(t0 + fw, tm - fw / 2), (tm + fw / 2, t1 - fw)]
                for a, b in panes:
                    faces.append(Face(g, "glass", [local3(i, a, sc, z0 + fw), local3(i, a, sc, z1 - fw),
                                                   local3(i, b, sc, z1 - fw), local3(i, b, sc, z0 + fw)],
                                      [], (-Nout[i][0], -Nout[i][1], 0)))
            elif q["type"] == "door":
                jw = 40.0
                add_box(g, "frame", i, t0, t0 + jw, 0, thk[i], z0, z1 - jw)
                add_box(g, "frame", i, t1 - jw, t1, 0, thk[i], z0, z1 - jw)
                add_box(g, "frame", i, t0, t1, 0, thk[i], z1 - jw, z1)
                add_box(g, "door", i, t0 + jw + 3, t1 - jw - 3, 0, 40.0, z0 + 10, z1 - jw - 3)
    info = dict(H=H, P=P, O=O, L=L, D=D, Nout=Nout, thk=thk, ids=ids, ops=ops, warnings=warnings)
    return faces, info


# ------------------------------------------------------------------ triangulation (DAE / checks / preview)
def triangulate(f):
    n = np.array(f.normal)
    ref = np.array([0, 0, 1.0]) if abs(n[2]) < 0.9 else np.array([1.0, 0, 0])
    u = np.cross(n, ref)
    u /= np.linalg.norm(u)
    v = np.cross(n, u)
    rings = [f.outer] + f.holes
    pts3 = np.array([p for r in rings for p in r])
    pts2 = np.c_[pts3 @ u, pts3 @ v]
    ends = np.cumsum([len(r) for r in rings]).astype(np.uint32)
    idx = earcut.triangulate_float64(pts2, ends).reshape(-1, 3)
    out = []
    for a, b, c in idx:
        tri = pts3[[a, b, c]]
        if np.dot(np.cross(tri[1] - tri[0], tri[2] - tri[0]), n) < 0:
            tri = tri[[0, 2, 1]]
        out.append(tri)
    return out


def check_solid(faces):
    import trimesh
    tris = [t for f in faces if f.group == "walls" for t in triangulate(f)]
    mesh = trimesh.Trimesh(np.array(tris).reshape(-1, 3), np.arange(len(tris) * 3).reshape(-1, 3), process=True,
                           merge_tex=True, merge_norm=True)
    mesh.merge_vertices(digits_vertex=2)
    return dict(watertight=bool(mesh.is_watertight), winding=bool(mesh.is_winding_consistent),
                volume_m3=round(float(mesh.volume) / 1e9, 3))


# ------------------------------------------------------------------ Ruby
def rb_num(x):
    s = f"{x:.2f}".rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s


def rb_pts(pts):
    return "[" + ",".join(f"[{rb_num(p[0])},{rb_num(p[1])},{rb_num(p[2])}]" for p in pts) + "]"


def write_ruby(path, faces, info, name, m):
    gset = set()
    for f in faces:
        parts = f.group.split("/")
        gset.update("/".join(parts[:j]) for j in range(1, len(parts) + 1))
    groups = sorted(gset, key=lambda g: (g.count("/"), g))
    lines = []
    for f in faces:
        holes = "[" + ",".join(rb_pts(h) for h in f.holes) + "]"
        n = ",".join(rb_num(x) for x in f.normal)
        lines.append(f'  ["{f.group}","{f.mat}",{rb_pts(f.outer)},{holes},[{n}]]')
    group_names = {"walls": "벽체", "floor": "바닥", "ceiling": "천장", "openings": "창호"}
    for i in range(len(info["P"])):
        for q in info["ops"][i]:
            group_names[f"openings/{q['id']}"] = f"{q['id']} {'창' if q['type'] == 'window' else '문'} ({info['ids'][i]})"
    dims = []
    P, D, Nout = info["P"], info["D"], info["Nout"]
    for i in range(len(P)):
        a, b = P[i], P[(i + 1) % len(P)]
        nin = -Nout[i]
        dims.append(f"  [[{rb_num(a[0])},{rb_num(a[1])},0],[{rb_num(b[0])},{rb_num(b[1])},0],"
                    f"[{rb_num(nin[0] * 350)},{rb_num(nin[1] * 350)},0]]")
    mats = ",\n".join(f'  "{k}" => ["{MAT_KO[k]}", [{c[0]},{c[1]},{c[2]}], {a}]' for k, (c, a) in MATERIALS.items())
    gtags = ",\n".join(f'  "{g}" => ["{group_names.get(g, g)}", "{TAGS[g.split("/")[0]]}"]' for g in groups)
    src = f'''# encoding: UTF-8
# ---------------------------------------------------------------------------
#  {name} - LiDAR 스캔 정리 모델 (자동 생성: scan2skp)
#
#  사용법 (SketchUp 2017 이상):
#   1) SketchUp에서 새 파일(템플릿: 밀리미터)을 엽니다.
#   2) 창 > Ruby 콘솔 (2024 이상: 확장 > 개발자 > Ruby 콘솔) 을 엽니다.
#   3) 아래처럼 이 파일 경로를 넣고 Enter:
#        load "C:/경로/{name}.rb"        (Mac: load "/Users/이름/경로/{name}.rb")
#   4) 모델이 그려지고, 이 .rb 파일과 같은 폴더에 {name}.skp 로 자동 저장됩니다.
#
#  층고 {rb_num(info["H"])}mm / 벽 {len(P)}면 / 개구부 {sum(len(v) for v in info["ops"].values())}개
#  태그: 벽, 바닥, 천장, 창호, 치수  (천장 태그를 끄면 실내가 보입니다)
# ---------------------------------------------------------------------------
module Scan2Skp
  NAME = "{name}"
  MATS = {{
{mats}
  }}
  GROUPS = {{
{gtags}
  }}
  DIMS = [
{",\n".join(dims)}
  ]
  FACES = [
{",\n".join(lines)}
  ]

  def self.pt(a)
    Geom::Point3d.new(a[0].mm, a[1].mm, a[2].mm)
  end

  def self.run
    model = Sketchup.active_model
    model.start_operation("LiDAR 스캔 모델", true)
    uo = model.options["UnitsOptions"]
    uo["LengthUnit"] = 2      # mm
    uo["LengthFormat"] = 0    # decimal
    uo["LengthPrecision"] = 0

    mats = {{}}
    MATS.each do |key, (nm, rgb, alpha)|
      mt = model.materials[nm] || model.materials.add(nm)
      mt.color = Sketchup::Color.new(*rgb)
      mt.alpha = alpha if alpha < 1.0
      mats[key] = mt
    end
    tags = {{}}
    tag_of = lambda {{ |nm| tags[nm] ||= (model.layers[nm] || model.layers.add(nm)) }}

    groups = {{}}
    GROUPS.each do |path, (label, tag)|
      parent_path = path.include?("/") ? path.split("/")[0..-2].join("/") : nil
      parent = parent_path ? groups[parent_path].entities : model.active_entities
      g = parent.add_group
      g.name = label
      g.layer = tag_of.call(tag)
      groups[path] = g
    end

    FACES.each do |gpath, mkey, outer, holes, n|
      ents = groups[gpath].entities
      f = ents.add_face(outer.map {{ |p| pt(p) }})
      next unless f
      holes.each do |h|
        hf = ents.add_face(h.map {{ |p| pt(p) }})
        hf.erase! if hf && hf.valid?
      end
      next unless f.valid?
      f.reverse! if f.normal.dot(Geom::Vector3d.new(*n)) < 0
      f.material = mats[mkey]
    end

    groups.each_value do |g|
      stray = g.entities.grep(Sketchup::Edge).select {{ |e| e.faces.empty? }}
      g.entities.erase_entities(stray) unless stray.empty?
    end

    dim_tag = tag_of.call("치수")
    DIMS.each do |a, b, off|
      d = model.active_entities.add_dimension_linear(pt(a), pt(b), Geom::Vector3d.new(off[0].mm, off[1].mm, 0))
      d.layer = dim_tag if d
    end

    model.commit_operation
    walls = groups["walls"]
    puts "[scan2skp] 벽체 솔리드: #{{walls.manifold? ? 'OK' : '확인 필요'}}"

    dir = File.file?(__FILE__) ? File.dirname(__FILE__) : nil
    path = dir ? File.join(dir, NAME + ".skp") : UI.savepanel("SketchUp 파일 저장", "", NAME + ".skp")
    if path
      model.save(path)
      puts "[scan2skp] 저장됨: #{{path}}"
    end
    Sketchup.active_model.active_view.zoom_extents
  end
end

Scan2Skp.run
'''
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(src)


# ------------------------------------------------------------------ COLLADA
def write_dae(path, faces, name):
    by = {}
    for f in faces:
        by.setdefault(f.group, {}).setdefault(f.mat, []).extend(triangulate(f))
    used = sorted({f.mat for f in faces})
    x = ['<?xml version="1.0" encoding="utf-8"?>',
         '<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">',
         '<asset><contributor><authoring_tool>scan2skp</authoring_tool></contributor>',
         '<unit name="meter" meter="1"/><up_axis>Z_UP</up_axis></asset>', "<library_effects>"]
    for mname in used:
        (r, g, b), a = MATERIALS[mname]
        x.append(f'<effect id="fx-{mname}"><profile_COMMON><technique sid="common"><lambert>'
                 f'<diffuse><color>{r / 255:.4f} {g / 255:.4f} {b / 255:.4f} 1</color></diffuse>'
                 + (f'<transparent opaque="A_ONE"><color>1 1 1 {a}</color></transparent><transparency><float>1</float></transparency>' if a < 1 else "")
                 + "</lambert></technique></profile_COMMON></effect>")
    x.append("</library_effects><library_materials>")
    for mname in used:
        x.append(f'<material id="mat-{mname}" name="{escape(MAT_KO[mname])}"><instance_effect url="#fx-{mname}"/></material>')
    x.append("</library_materials><library_geometries>")
    gids = {}
    for gi, (grp, mats) in enumerate(sorted(by.items())):
        gid = f"geom{gi}"
        gids[grp] = gid
        allt = [t for ts in mats.values() for t in ts]
        pos = np.array(allt).reshape(-1, 3) / 1000.0
        x.append(f'<geometry id="{gid}"><mesh><source id="{gid}-pos"><float_array id="{gid}-pos-a" count="{pos.size}">'
                 + " ".join(f"{v:.5f}" for v in pos.ravel()) + "</float_array>"
                 f'<technique_common><accessor source="#{gid}-pos-a" count="{len(pos)}" stride="3">'
                 '<param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/>'
                 f'</accessor></technique_common></source><vertices id="{gid}-v"><input semantic="POSITION" source="#{gid}-pos"/></vertices>')
        base = 0
        for mname, ts in mats.items():
            nidx = len(ts) * 3
            x.append(f'<triangles material="{mname}" count="{len(ts)}"><input semantic="VERTEX" source="#{gid}-v" offset="0"/><p>'
                     + " ".join(str(i) for i in range(base, base + nidx)) + "</p></triangles>")
            base += nidx
        x.append("</mesh></geometry>")
    x.append('</library_geometries><library_visual_scenes><visual_scene id="scene">')

    def node(grp, label):
        mats = by.get(grp, {})
        bm = "".join(f'<instance_material symbol="{mn}" target="#mat-{mn}"/>' for mn in mats)
        return (f'<node name="{escape(label)}"><instance_geometry url="#{gids[grp]}"><bind_material><technique_common>{bm}'
                "</technique_common></bind_material></instance_geometry></node>")

    labels = {"walls": "벽체", "floor": "바닥", "ceiling": "천장"}
    x.append(f'<node name="{escape(name)}">')
    for grp in ("walls", "floor", "ceiling"):
        if grp in by:
            x.append(node(grp, labels[grp]))
    subs = sorted(g for g in by if g.startswith("openings/"))
    if subs:
        x.append('<node name="창호">' + "".join(node(g, g.split("/")[1]) for g in subs) + "</node>")
    x.append('</node></visual_scene></library_visual_scenes><scene><instance_visual_scene url="#scene"/></scene></COLLADA>')
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(x))


# ------------------------------------------------------------------ previews
def plot_plan(path, info, m):
    P, O, H = info["P"], info["O"], info["H"]
    fig, ax = plt.subplots(figsize=(10, 9))
    ring = Polygon(O).difference(Polygon(P))
    cuts = []
    for i, qs in info["ops"].items():
        for q in qs:
            A, D, N, t = P[i], info["D"][i], info["Nout"][i], info["thk"][i]
            cuts.append(Polygon([A + D * q["t0"], A + D * q["t1"], A + D * q["t1"] + N * t, A + D * q["t0"] + N * t]))
    solid = ring.difference(unary_union(cuts)) if cuts else ring
    for ext, ints in polys(solid):
        ax.fill(*zip(*ext), color="#3a3a3a")
        for r in ints:
            ax.fill(*zip(*r), color="white")
    ax.fill(*P.T, color="#f3ede4", zorder=0)
    for i, qs in info["ops"].items():
        A, D, N, t = P[i], info["D"][i], info["Nout"][i], info["thk"][i]
        for q in qs:
            a, b = A + D * q["t0"] + N * t / 2, A + D * q["t1"] + N * t / 2
            if q["type"] == "window":
                ax.plot([a[0], b[0]], [a[1], b[1]], color="#2b7bd6", lw=3)
            elif q["type"] == "door":
                w = q["t1"] - q["t0"]
                hinge = A + D * q["t0"]
                nin = -N
                arc = [hinge + w * (math.cos(th) * D + math.sin(th) * nin) for th in np.linspace(0, math.pi / 2, 20)]
                ax.plot(*np.array(arc).T, color="#d6802b", lw=1)
                ax.plot(*np.array([hinge, hinge + nin * w]).T, color="#d6802b", lw=2)
            mid = (A + D * (q["t0"] + q["t1"]) / 2) - N * 220
            txt = f"{q['id']} {q['t1'] - q['t0']:.0f}"
            if q["type"] == "window":
                txt += f"\nH{q['z1'] - q['z0']:.0f} / sill {q['z0']:.0f}"
            else:
                txt += f"\nH{q['z1'] - q['z0']:.0f}"
            ax.text(*mid, txt, ha="center", va="center", fontsize=7, color="#555")
    span = np.ptp(O, 0).max()
    for i in range(len(P)):
        a, b = P[i], P[(i + 1) % len(P)]
        D, N = info["D"][i], info["Nout"][i]
        o = N * (info["thk"][i] + span * 0.05)
        pa, pb = a + o, b + o
        ax.annotate("", pa, pb, arrowprops=dict(arrowstyle="<->", lw=0.7, color="#c0392b"))
        ax.plot(*np.array([a + N * info["thk"][i], pa]).T, lw=0.4, color="#c0392b")
        ax.plot(*np.array([b + N * info["thk"][i], pb]).T, lw=0.4, color="#c0392b")
        mid = (pa + pb) / 2 + N * span * 0.02
        ang = math.degrees(math.atan2(D[1], D[0]))
        ang = ang - 180 if ang > 90 else (ang + 180 if ang < -90 else ang)
        ax.text(*mid, f"{info['ids'][i]}  {info['L'][i]:.0f}", rotation=ang, ha="center", va="center", fontsize=8,
                color="#c0392b")
    area = signed_area(P) / 1e6
    ax.set_title(f"평면 (내부 치수, mm)  면적 {area:.2f}㎡  층고 {H:.0f}", fontsize=11)
    ax.set_aspect("equal")
    ax.axis("off")
    fig.tight_layout()
    fig.savefig(path, dpi=130)
    plt.close(fig)


def plot_3d(path, faces, info):
    fig = plt.figure(figsize=(11, 8))
    ax = fig.add_subplot(111, projection="3d")
    cols = {k: tuple(np.array(c) / 255) + (a,) for k, (c, a) in MATERIALS.items()}
    for f in faces:
        if f.group == "ceiling":
            continue
        n = np.array(f.normal)
        light = 0.75 + 0.25 * abs(np.dot(n, [0.4, -0.6, 0.7]) / np.linalg.norm([0.4, -0.6, 0.7]))
        c = np.array(cols[f.mat])
        c[:3] *= light
        tris = triangulate(f)
        ax.add_collection3d(Poly3DCollection([t for t in tris], facecolors=[c] * len(tris), edgecolors="none"))
        outl = [f.outer + [f.outer[0]]] + [h + [h[0]] for h in f.holes]
        for r in outl:
            r = np.array(r)
            ax.plot(r[:, 0], r[:, 1], r[:, 2], color="#555", lw=0.3)
    O = info["O"]
    lo, hi = O.min(0), O.max(0)
    span = max(hi - lo)
    c = (lo + hi) / 2
    ax.set_xlim(c[0] - span / 2, c[0] + span / 2)
    ax.set_ylim(c[1] - span / 2, c[1] + span / 2)
    ax.set_zlim(0, span)
    ax.view_init(elev=38, azim=-60)
    ax.set_axis_off()
    fig.tight_layout()
    fig.savefig(path, dpi=120)
    plt.close(fig)


def write_report(path, m, info, solid, name):
    P = info["P"]
    r = [f"# {name} — 스캔 정리 결과", "", f"- 층고: **{info['H']:.0f} mm**",
         f"- 바닥 면적(벽 안쪽): **{signed_area(P) / 1e6:.2f} ㎡**", f"- 벽 두께(기본): {m.get('wall_thickness', 150)} mm",
         f"- 벽체 솔리드 검사: {'정상(닫힌 솔리드)' if solid['watertight'] and solid['winding'] else '확인 필요'}", "",
         "## 벽", "", "| 벽 | 길이(mm) | 두께(mm) | 스캔 대비 편차 | 스캔 커버리지 |", "|---|---:|---:|---:|---:|"]
    for i, w in enumerate(m["walls"]):
        dv = w.get("scan_deviation_mm")
        cv = w.get("scan_coverage")
        r.append(f"| {info['ids'][i]} | {info['L'][i]:.0f} | {info['thk'][i]:.0f} | "
                 f"{'-' if dv is None else f'{dv:.0f} mm'} | {'-' if cv is None else f'{cv * 100:.0f}%'} |")
    r += ["", "## 창호", "", "| ID | 종류 | 벽 | 벽 시작점에서 거리 | 폭 | 높이 | 바닥에서 하단 |", "|---|---|---|---:|---:|---:|---:|"]
    ko = {"window": "창", "door": "문", "opening": "개구부"}
    for o in m.get("openings", []):
        r.append(f"| {o['id']} | {ko.get(o['type'], o['type'])} | {o['wall']} | {o['offset']:.0f} | {o['width']:.0f} | "
                 f"{o['height']:.0f} | {o.get('sill', 0):.0f} |")
    notes = list(m.get("notes", [])) + info["warnings"]
    if m.get("ceiling_levels_mm") and len(m["ceiling_levels_mm"]) > 1:
        notes.append("천장 높이가 여러 단으로 감지됨: " + ", ".join(f"{c['z']:.0f}mm({c['area_m2']}㎡)" for c in m["ceiling_levels_mm"])
                     + " — 현재 모델은 최고 높이 기준 평천장")
    if notes:
        r += ["", "## 참고 / 확인 필요", ""] + [f"- {n}" for n in notes]
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(r) + "\n")


# ------------------------------------------------------------------ three.js viewer
VIEWER_HTML = """<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>__TITLE__</title>
<style>
:root{--bg:#f4f3f0;--panel:#ffffffee;--ink:#1d1d1f;--muted:#6b6b70;--line:#d9d7d2;--accent:#2b6cb0}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#1b1c1e;--panel:#26272aee;--ink:#ececec;--muted:#a0a0a6;--line:#3a3b3f;--accent:#7fb2ea}}
:root[data-theme="dark"]{--bg:#1b1c1e;--panel:#26272aee;--ink:#ececec;--muted:#a0a0a6;--line:#3a3b3f;--accent:#7fb2ea}
html,body{margin:0;height:100%;background:var(--bg);color:var(--ink);font:14px/1.45 system-ui,-apple-system,"Apple SD Gothic Neo","Noto Sans KR",sans-serif}
#c{position:fixed;inset:0;width:100%;height:100%;display:block}
.panel{position:fixed;left:16px;top:16px;max-width:calc(100% - 32px);background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:12px 14px;box-sizing:border-box;backdrop-filter:blur(6px)}
.panel h1{font-size:15px;margin:0 0 4px}
.stats{color:var(--muted);font-size:12.5px;margin-bottom:8px}
.row{display:flex;flex-wrap:wrap;gap:6px}
button{font:inherit;font-size:12.5px;border:1px solid var(--line);background:transparent;color:var(--ink);border-radius:999px;padding:4px 11px;cursor:pointer}
button[aria-pressed="false"]{opacity:.45}
button.view{border-color:var(--accent);color:var(--accent)}
</style></head><body>
<canvas id="c"></canvas>
<div class="panel"><h1>__TITLE__</h1><div class="stats">__STATS__</div>
<div class="row" id="toggles"></div><div class="row" style="margin-top:6px">
<button class="view" data-view="persp">3D</button><button class="view" data-view="top">평면</button></div></div>
<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
const D = __DATA__;
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({canvas, antialias:true, preserveDrawingBuffer:true});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
const dark = matchMedia('(prefers-color-scheme: dark)').matches && document.documentElement.dataset.theme !== 'light';
scene.background = new THREE.Color(dark ? 0x1b1c1e : 0xf4f3f0);
scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8478, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(4, 9, 6); scene.add(sun);
const root = new THREE.Group(); root.rotation.x = -Math.PI/2; scene.add(root);
const layers = {};
const labels = {walls:'벽', floor:'바닥', ceiling:'천장', openings:'창호'};
for (const [grp, mats] of Object.entries(D.groups)) {
  const top = grp.split('/')[0];
  const g = layers[top] || (layers[top] = new THREE.Group());
  root.add(g);
  for (const [mk, arr] of Object.entries(mats)) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    geo.computeVertexNormals();
    const [r, gg, b, a] = D.materials[mk];
    const m = new THREE.MeshLambertMaterial({color:new THREE.Color(r/255, gg/255, b/255), side:THREE.DoubleSide,
      transparent:a < 1, opacity:a, depthWrite:a >= 1, polygonOffset:true, polygonOffsetFactor:1, polygonOffsetUnits:1});
    g.add(new THREE.Mesh(geo, m));
  }
  if (D.edges[grp]) {
    const eg = new THREE.BufferGeometry();
    eg.setAttribute('position', new THREE.Float32BufferAttribute(D.edges[grp], 3));
    g.add(new THREE.LineSegments(eg, new THREE.LineBasicMaterial({color: dark ? 0x9a9a9a : 0x4a4a4a})));
  }
}
const box = new THREE.Box3().setFromObject(root);
const ctr = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
const span = Math.max(size.x, size.z);
const persp = new THREE.PerspectiveCamera(40, 1, 0.05, 200);
const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.05, 200);
let cam = persp;
const controls = new OrbitControls(persp, canvas);
function setView(v) {
  if (v === 'top') {
    cam = ortho; ortho.position.set(ctr.x, ctr.y + 20, ctr.z + 0.0001); ortho.up.set(0, 0, -1); ortho.lookAt(ctr);
    controls.enabled = false;
  } else {
    cam = persp; persp.position.set(ctr.x + span*0.7, ctr.y + span*1.15, ctr.z + span*1.3);
    controls.target.copy(ctr); controls.enabled = true; controls.update();
  }
  resize();
}
function resize() {
  const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false);
  persp.aspect = w / h; persp.updateProjectionMatrix();
  const half = span * 0.62, asp = w / h;
  if (asp > 1) { ortho.left = -half*asp; ortho.right = half*asp; ortho.top = half; ortho.bottom = -half; }
  else { ortho.left = -half; ortho.right = half; ortho.top = half/asp; ortho.bottom = -half/asp; }
  ortho.updateProjectionMatrix();
}
const tg = document.getElementById('toggles');
for (const k of ['walls','floor','ceiling','openings']) if (layers[k]) {
  const b = document.createElement('button'); b.textContent = labels[k];
  const on = k !== 'ceiling'; layers[k].visible = on; b.setAttribute('aria-pressed', on);
  b.onclick = () => { layers[k].visible = !layers[k].visible; b.setAttribute('aria-pressed', layers[k].visible); };
  tg.appendChild(b);
}
document.querySelectorAll('button.view').forEach(b => b.onclick = () => setView(b.dataset.view));
addEventListener('resize', resize);
setView(new URLSearchParams(location.search).get('view') || 'persp');
renderer.setAnimationLoop(() => renderer.render(scene, cam));
window.__ready = true;
</script></body></html>
"""


def write_viewer(path, faces, info, name):
    groups, edges = {}, {}
    for f in faces:
        tri = np.array(triangulate(f)).reshape(-1) / 1000.0
        groups.setdefault(f.group, {}).setdefault(f.mat, []).extend(np.round(tri, 4).tolist())
        segs = edges.setdefault(f.group, [])
        for r in [f.outer] + f.holes:
            for a, b in zip(r, r[1:] + r[:1]):
                segs.extend(np.round(np.array(a + b) / 1000.0, 4).tolist())
    data = dict(materials={k: list(c) + [a] for k, (c, a) in MATERIALS.items()}, groups=groups, edges=edges)
    n_ops = sum(len(v) for v in info["ops"].values())
    stats = (f"층고 {info['H']:.0f}mm · 면적 {signed_area(info['P']) / 1e6:.2f}㎡ · 벽 {len(info['P'])}면 · 창호 {n_ops}개"
             " · 드래그: 회전 / 휠: 확대")
    html = (VIEWER_HTML.replace("__TITLE__", escape(name)).replace("__STATS__", escape(stats))
            .replace("__DATA__", json.dumps(data, separators=(",", ":"))))
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(html)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("model")
    ap.add_argument("-o", "--out", default=None)
    ap.add_argument("-n", "--name", default="scan_model")
    args = ap.parse_args()
    m = json.load(open(args.model, encoding="utf-8"))
    out = args.out or os.path.dirname(os.path.abspath(args.model))
    os.makedirs(out, exist_ok=True)
    faces, info = make_geometry(m)
    solid = check_solid(faces)
    write_ruby(os.path.join(out, f"{args.name}.rb"), faces, info, args.name, m)
    write_dae(os.path.join(out, f"{args.name}.dae"), faces, args.name)
    plot_plan(os.path.join(out, f"{args.name}_plan.png"), info, m)
    write_report(os.path.join(out, f"{args.name}_report.md"), m, info, solid, args.name)
    write_viewer(os.path.join(out, f"{args.name}_viewer.html"), faces, info, args.name)
    print(f"[build] faces={len(faces)} solid={solid} warnings={info['warnings']}")


if __name__ == "__main__":
    main()
