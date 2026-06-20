import { describe, it, expect } from "vitest";
import { buildCompositePlan, layerToStyle, checkManifestCatalogSync } from "../js/room-visualizer-helpers.js";

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
});

describe("layerToStyle", () => {
  it("image: 렌더를 부위 마스크로 클립", () => {
    const s = layerToStyle({ kind: "image", z: 10, src: "f/oak.png", zone: "z/floor.png" });
    expect(s).toContain("z-index:10");
    expect(s).toContain("background:url(f/oak.png)");
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
