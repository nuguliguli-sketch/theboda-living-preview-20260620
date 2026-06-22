import { describe, it, expect } from "vitest";
import { buildCompositePlan, layerToStyle, checkManifestCatalogSync, resolveRenderPreset } from "../js/room-visualizer-helpers.js";
import { wallIsPremium, visibleItemOrder, LIVING_ITEM_ORDER } from "../js/design-view-helpers.js";

const catalog = { spaces: [{ code: "living", name: "거실", items: [
  { category: "floor", name: "바닥", options: [
    { code: "laminate_std", group: "강마루", name: "강마루 일반", products: [
      { id: "p_floor_oak_natural", name: "내추럴 오크" }, { id: "p_floor_oak_grey", name: "그레이 오크" },
    ] },
  ], lineConditions: {} },
  { category: "ceiling", name: "천장", options: [
    { code: "flat", name: "평천장", products: [] }, { code: "coffered", name: "우물천장", products: [] },
  ], lineConditions: {} },
  { category: "sash", name: "샷시", options: [{ code: "alu", name: "알루미늄", products: [] }],
    lineConditions: { frameColor: { values: ["white", "gray", "black", "wood"] } } },
] }] };

const manifest = { living: {
  base: "rooms/living/base.jpg", size: { w: 1600, h: 1067 },
  layers: [
    { item: "floor", by: "product", zone: "z/floor.png", z: 10, assets: { p_floor_oak_natural: "f/oak.png", p_floor_oak_grey: "f/grey.png" } },
    { item: "ceiling", by: "option", zone: "z/ceil.png", z: 30, assets: { flat: "c/flat.png", coffered: "c/coff.png" } },
    { item: "sash", by: "condition", conditionKey: "frameColor", zone: "z/sash.png", z: 60, kind: "tint", tints: { white: "#f3f4f6", gray: "#9aa3ad", black: "#2b2f36", wood: "#b08552" } },
  ],
} };

const sel = (lines) => ({ status: "draft", lines });

const renderPresetManifest = { living: {
  base: "rooms/living/base.jpg",
  size: { w: 1280, h: 664 },
  renderPresetSize: { w: 3840, h: 2160 },
  defaultRenderPreset: "flat_main_basic_floor-gujung-a",
  focusRenderPresets: {
    ceiling: {
      defaultRenderPreset: "ceiling_flat_no-light_floor-gujung-a",
      renderPresets: [
        {
          key: "ceiling_flat_no-light_floor-gujung-a",
          src: "rooms/living/presets/render_ceiling_flat_no-light_floor-gujung-a.png",
          match: { ceiling: "flat", floor: { product: ["p_floor_oak_natural"] } },
        },
        {
          key: "ceiling_coffered_no-light_floor-gujung-a",
          src: "rooms/living/presets/render_ceiling_coffered_no-light_floor-gujung-a.png",
          match: { ceiling: "coffered", floor: { product: ["p_floor_oak_natural"] } },
          pending: [{ item: "renderPreset", label: "preview", choiceLabel: "temporary no-light render" }],
        },
      ],
    },
  },
  renderPresets: [
    {
      key: "flat_main_basic_floor-gujung-a",
      src: "rooms/living/presets/render_flat_main-led_basic-casing_floor-gujung-a.png",
      match: { ceiling: "flat", lighting: "main", door: "casing_basic", floor: { product: ["p_floor_oak_natural"] } },
    },
    {
      key: "flat_main_basic_floor-dongwha-b",
      src: "rooms/living/presets/render_flat_main-led_basic-casing_floor-dongwha-b.png",
      match: { ceiling: "flat", lighting: "main", door: "casing_basic", floor: { product: ["p_floor_oak_grey"] } },
    },
    {
      key: "dropped_down_inbang_floor-gujung-a",
      src: "rooms/living/presets/render_dropped_downlight_inbang-casing_floor-gujung-a.png",
      match: { ceiling: "dropped", lighting: "downlight", door: "casing_full", floor: { product: ["p_floor_oak_natural"] } },
    },
    {
      key: "coffered_nearest_floor-gujung-a",
      src: "rooms/living/presets/render_coffered_downlight_inbang-casing_floor-gujung-a.png",
      priority: 5,
      match: { ceiling: "coffered", floor: { product: ["p_floor_oak_natural"] } },
      pending: [{ item: "renderPreset", label: "preview", choiceLabel: "nearest coffered render" }],
    },
  ],
  layers: [
    { item: "floor", by: "product", zone: "z/floor.png", z: 10, assets: { p_floor_oak_natural: "f/oak.png" } },
    { item: "ceiling", by: "option", zone: "z/ceiling-flat.png", z: 30, assets: {
      flat: { src: "c/flat.png", zone: "z/ceiling-flat.png" },
      coffered: { src: "c/coff.png", zone: "z/ceiling-coff.png" },
    } },
  ],
} };

describe("render presets", () => {
  it("resolves a same-camera render preset from selected options", () => {
    const selection = sel([
      { space: "living", category: "floor", optionCode: "laminate_std", productId: "p_floor_oak_natural", conditions: {} },
      { space: "living", category: "ceiling", optionCode: "dropped", productId: null, conditions: {} },
      { space: "living", category: "lighting", optionCode: "downlight", productId: null, conditions: {} },
      { space: "living", category: "door", optionCode: "casing_full", productId: "d_white_matt", conditions: {} },
    ]);
    const preset = resolveRenderPreset({ selection, room: renderPresetManifest.living });
    expect(preset.key).toBe("dropped_down_inbang_floor-gujung-a");

    const plan = buildCompositePlan({ catalog, selection, manifest: renderPresetManifest, space: "living" });
    expect(plan).toMatchObject({
      base: "rooms/living/presets/render_dropped_downlight_inbang-casing_floor-gujung-a.png",
      size: { w: 3840, h: 2160 },
      layers: [],
      pending: [],
      preset: "dropped_down_inbang_floor-gujung-a",
    });
  });

  it("prefers the floor-specific render preset over a similar default floor", () => {
    const selection = sel([
      { space: "living", category: "floor", optionCode: "laminate_std", productId: "p_floor_oak_grey", conditions: {} },
      { space: "living", category: "ceiling", optionCode: "flat", productId: null, conditions: {} },
      { space: "living", category: "lighting", optionCode: "main", productId: null, conditions: {} },
      { space: "living", category: "door", optionCode: "casing_basic", productId: "d_white_matt", conditions: {} },
    ]);
    const plan = buildCompositePlan({ catalog, selection, manifest: renderPresetManifest, space: "living" });
    expect(plan.base).toBe("rooms/living/presets/render_flat_main-led_basic-casing_floor-dongwha-b.png");
    expect(plan.preset).toBe("flat_main_basic_floor-dongwha-b");
  });

  it("keeps a pending badge when a nearest render preset is used", () => {
    const selection = sel([
      { space: "living", category: "floor", optionCode: "laminate_std", productId: "p_floor_oak_natural", conditions: {} },
      { space: "living", category: "ceiling", optionCode: "coffered", productId: null, conditions: {} },
      { space: "living", category: "lighting", optionCode: "main", productId: null, conditions: {} },
      { space: "living", category: "door", optionCode: "casing_basic", productId: "d_white_matt", conditions: {} },
    ]);
    const plan = buildCompositePlan({ catalog, selection, manifest: renderPresetManifest, space: "living" });
    expect(plan.preset).toBe("coffered_nearest_floor-gujung-a");
    expect(plan.pending).toEqual([{ item: "renderPreset", label: "preview", choiceLabel: "nearest coffered render" }]);
  });

  it("uses layered floor and ceiling assets while editing the ceiling category", () => {
    const selection = sel([
      { space: "living", category: "floor", optionCode: "laminate_std", productId: "p_floor_oak_natural", conditions: {} },
      { space: "living", category: "ceiling", optionCode: "coffered", productId: null, conditions: {} },
      { space: "living", category: "lighting", optionCode: "downlight", productId: null, conditions: {} },
      { space: "living", category: "door", optionCode: "casing_full", productId: "d_white_matt", conditions: {} },
    ]);
    const plan = buildCompositePlan({
      catalog,
      selection,
      manifest: renderPresetManifest,
      space: "living",
      activeCategory: "ceiling",
    });
    // 베이스 = 선택한 천장의 풀룸 렌더(평천장 베이스+다른 천장 레이어 혼합 시 생기는 경계 톤단차 방지)
    expect(plan.base).toBe("c/coff.png");
    expect(plan.preset).toBeUndefined();
    expect(plan.layers.map((layer) => layer.item)).toEqual(["floor", "ceiling"]);
    expect(plan.layers[0]).toMatchObject({ item: "floor", src: "f/oak.png", zone: "z/floor.png" });
    expect(plan.layers[1]).toMatchObject({ item: "ceiling", src: "c/coff.png", zone: "z/ceiling-coff.png" });
    expect(plan.pending).toEqual([]);
  });

  it("keeps the wall (wallpaper) layer visible while editing the ceiling", () => {
    // 회귀: 벽지 선택 후 천장 단계로 넘어가도 벽지가 미리보기에서 사라지면 안 됨.
    const roomManifest = { living: { base: "b.jpg", size: { w: 16, h: 9 }, layers: [
      { item: "floor", by: "product", zone: "z/floor.png", z: 10, assets: { p_floor_oak_natural: "f/oak.png" } },
      { item: "ceiling", by: "option", zone: "z/ceil.png", z: 30, assets: { coffered: "c/coff.png" } },
      { item: "wall", by: "product", zone: "z/wall.png", z: 35, assets: {
        p_wall_diamang: { src: "w/diamang.jpg", zone: "z/wall.png", backgroundRepeat: "repeat", mixBlendMode: "multiply" },
      } },
    ] } };
    const selection = sel([
      { space: "living", category: "floor", optionCode: "laminate_std", productId: "p_floor_oak_natural", conditions: {} },
      { space: "living", category: "wall", optionCode: "wallpaper", productId: "p_wall_diamang", conditions: {} },
      { space: "living", category: "ceiling", optionCode: "coffered", productId: null, conditions: {} },
    ]);
    const plan = buildCompositePlan({ catalog, selection, manifest: roomManifest, space: "living", activeCategory: "ceiling" });
    expect(plan.layers.map((layer) => layer.item)).toContain("wall");
    expect(plan.layers.find((l) => l.item === "wall")).toMatchObject({ src: "w/diamang.jpg", zone: "z/wall.png" });
  });

  it("falls back to the default render preset when a structural combo is not rendered yet", () => {
    const selection = sel([
      { space: "living", category: "ceiling", optionCode: "coffered", productId: null, conditions: {} },
      { space: "living", category: "lighting", optionCode: "line", productId: null, conditions: {} },
      { space: "living", category: "door", optionCode: "hidden", productId: "d_white_matt", conditions: {} },
    ]);
    const plan = buildCompositePlan({ catalog, selection, manifest: renderPresetManifest, space: "living" });
    expect(plan.base).toBe("rooms/living/presets/render_flat_main-led_basic-casing_floor-gujung-a.png");
    expect(plan.preset).toBe("flat_main_basic_floor-gujung-a");
    expect(plan.pending).toEqual([{ item: "renderPreset", label: "preview", choiceLabel: "render preset pending" }]);
  });
});

describe("buildCompositePlan", () => {
  it("선택된 제품/옵션의 자산을 z순 레이어로", () => {
    const plan = buildCompositePlan({ catalog, manifest, space: "living", selection: sel([
      { space: "living", category: "floor", optionCode: "laminate_std", productId: "p_floor_oak_grey", conditions: {} },
      { space: "living", category: "ceiling", optionCode: "coffered", productId: null, conditions: {} },
    ]) });
    expect(plan.base).toBe("rooms/living/base.jpg");
    expect(plan.layers.map((l) => l.item)).toEqual(["floor", "ceiling"]);
    expect(plan.layers[0]).toMatchObject({ kind: "image", src: "f/grey.png", zone: "z/floor.png", z: 10 });
    expect(plan.layers[1]).toMatchObject({ kind: "image", src: "c/coff.png", z: 30 });
  });

  it("자산 없는 선택은 pending 배지로(라벨 포함)", () => {
    const plan = buildCompositePlan({ catalog, manifest, space: "living", selection: sel([
      { space: "living", category: "floor", optionCode: "laminate_std", productId: "p_floor_oak_natural", conditions: {} },
      { space: "living", category: "ceiling", optionCode: "flat", productId: null, conditions: {} },
      { space: "living", category: "sash", optionCode: "alu", productId: null, conditions: {} },
    ]) });
    expect(plan.layers.map((l) => l.item)).toEqual(["floor", "ceiling"]);
    expect(plan.pending).toEqual([{ item: "sash", label: "샷시", choiceLabel: "-" }]);
  });

  it("frameColor 선택 시 틴트 레이어", () => {
    const plan = buildCompositePlan({ catalog, manifest, space: "living", selection: sel([
      { space: "living", category: "sash", optionCode: "alu", productId: null, conditions: { frameColor: "black" } },
    ]) });
    const sash = plan.layers.find((l) => l.item === "sash");
    expect(sash).toMatchObject({ kind: "tint", color: "#2b2f36", zone: "z/sash.png" });
  });

  it("선택 없음/매니페스트 없음 → 빈 계획", () => {
    expect(buildCompositePlan({ catalog, manifest: {}, space: "living", selection: sel([]) }))
      .toEqual({ base: null, size: null, layers: [], pending: [] });
    const empty = buildCompositePlan({ catalog, manifest, space: "living", selection: null });
    expect(empty.base).toBe("rooms/living/base.jpg");
    expect(empty.layers).toEqual([]);
  });

  it("globalTone: 색온도 선택 시 전체 톤 레이어", () => {
    const m = { living: { layers: [
      { item: "lighting", by: "option", z: 90, kind: "globalTone", colorTempTint: { warm: "#ffd9a0", neutral: "#ffffff" } },
    ] } };
    const plan = buildCompositePlan({ catalog, manifest: m, space: "living", selection: sel([
      { space: "living", category: "lighting", optionCode: "downlight", productId: null, conditions: { colorTemp: "warm" } },
    ]) });
    const tone = plan.layers.find((l) => l.item === "lighting");
    expect(tone).toMatchObject({ kind: "globalTone", color: "#ffd9a0", z: 90 });
    expect(plan.pending).toEqual([]);
  });

  it("buildCompositePlan: backgroundColor만 있는 wall 자산도 레이어로 push", () => {
    const manifest = { living: { size: { w: 10, h: 10 }, base: "b.png", layers: [
      { item: "wall", by: "product", z: 20, zone: "z/wall.png", assets: {
        p_tint: { backgroundColor: "#859185", zone: "z/wall.png", z: 35, mixBlendMode: "multiply", opacity: 1 },
      } },
    ] } };
    const catalog = { spaces: [{ code: "living", items: [{ category: "wall", name: "벽지", options: [
      { code: "silk", products: [{ id: "p_tint", name: "틴트" }] },
    ] }] }] };
    const selection = { status: "draft", lines: [{ space: "living", category: "wall", optionCode: "silk", productId: "p_tint", conditions: {} }] };
    const plan = buildCompositePlan({ catalog, selection, manifest, space: "living" });
    const wall = plan.layers.find((l) => l.item === "wall");
    expect(wall).toMatchObject({ item: "wall", backgroundColor: "#859185", z: 35, mixBlendMode: "multiply" });
    expect(wall.src).toBeFalsy();
    expect(plan.pending).toEqual([]);
  });
});

describe("layerToStyle", () => {
  it("image: 렌더를 부위 마스크로 클립", () => {
    const s = layerToStyle({ kind: "image", z: 10, src: "f/oak.png", zone: "z/floor.png" });
    expect(s).toContain("z-index:10");
    expect(s).toContain("background-image:url(f/oak.png)");
    expect(s).toContain("mask:url(z/floor.png)");
  });
  it("tint: 색 + multiply + 마스크", () => {
    const s = layerToStyle({ kind: "tint", z: 60, color: "#2b2f36", zone: "z/sash.png" });
    expect(s).toContain("background:#2b2f36");
    expect(s).toContain("mix-blend-mode:multiply");
    expect(s).toContain("mask:url(z/sash.png)");
  });
  it("globalTone: 전체 톤(마스크 없음)", () => {
    const s = layerToStyle({ kind: "globalTone", z: 90, color: "#ffd9a0" });
    expect(s).toContain("background:#ffd9a0");
    expect(s).not.toContain("mask:url");
  });
  it("image: src 없이 backgroundColor면 단색으로 칠하고 마스크·blend 적용", () => {
    const s = layerToStyle({ kind: "image", z: 35, backgroundColor: "#859185", zone: "z/wall.png", mixBlendMode: "multiply", opacity: 1 });
    expect(s).toContain("background-color:#859185");
    expect(s).not.toContain("background-image:url");
    expect(s).toContain("mix-blend-mode:multiply");
    expect(s).toContain("mask:url(z/wall.png)");
  });
});

describe("checkManifestCatalogSync", () => {
  const order = ["floor", "ceiling", "sash"];
  it("정상 매니페스트 → 누락·오류 없음", () => {
    const r = checkManifestCatalogSync({ catalog, manifest, space: "living", itemOrder: order });
    expect(r.missingItems).toEqual([]);
    expect(r.unknownKeys).toEqual([]);
  });
  it("존재하지 않는 자산 키 → unknownKeys", () => {
    const bad = { living: { layers: [
      { item: "floor", by: "product", assets: { p_floor_oak_natural: "x", NOPE: "y" } },
      { item: "ceiling", by: "option", assets: { flat: "x" } },
      { item: "sash", by: "condition", conditionKey: "frameColor", kind: "tint", tints: { white: "#fff" } },
    ] } };
    const r = checkManifestCatalogSync({ catalog, manifest: bad, space: "living", itemOrder: order });
    expect(r.unknownKeys).toEqual([{ item: "floor", key: "NOPE" }]);
  });
  it("항목 레이어 누락 → missingItems", () => {
    const bad = { living: { layers: [{ item: "floor", by: "product", assets: {} }] } };
    const r = checkManifestCatalogSync({ catalog, manifest: bad, space: "living", itemOrder: order });
    expect(r.missingItems).toEqual(["ceiling", "sash"]);
  });

  it("colorTempTint 잘못된 색온도 키 → unknownKeys", () => {
    const litCatalog = { spaces: [{ code: "living", items: [
      { category: "lighting", name: "조명", options: [{ code: "main", products: [] }],
        lineConditions: { colorTemp: { values: ["warm", "neutral"] } } },
    ] }] };
    const m = { living: { layers: [
      { item: "lighting", by: "option", kind: "globalTone", colorTempTint: { warm: "#ffd9a0", BADTEMP: "#000" } },
    ] } };
    const r = checkManifestCatalogSync({ catalog: litCatalog, manifest: m, space: "living", itemOrder: ["lighting"] });
    expect(r.unknownKeys).toEqual([{ item: "lighting", key: "BADTEMP" }]);
  });
});

describe("도배 항목 가시성", () => {
  const cat = { spaces: [{ code: "living", items: [{ category: "wall", options: [
    { code: "silk", products: [{ id: "p_a" }] }, { code: "premium", products: [{ id: "p_b" }] },
  ] }] }] };
  const sel = (opt) => ({ lines: [{ space: "living", category: "wall", optionCode: opt, productId: "p_a", conditions: {} }] });
  it("LIVING_ITEM_ORDER에 ceiling_paper가 wall 다음에 있다", () => {
    expect(LIVING_ITEM_ORDER).toEqual(["floor", "wall", "ceiling_paper", "ceiling", "door", "sash", "tv_wall", "lighting"]);
  });
  it("wallIsPremium: 벽지 premium 여부", () => {
    expect(wallIsPremium(cat, sel("premium"))).toBe(true);
    expect(wallIsPremium(cat, sel("silk"))).toBe(false);
  });
  it("visibleItemOrder: premium이면 천정지 숨김", () => {
    expect(visibleItemOrder(cat, sel("premium"))).not.toContain("ceiling_paper");
    expect(visibleItemOrder(cat, sel("silk"))).toContain("ceiling_paper");
  });
});
