import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildCompositePlan, checkManifestCatalogSync } from "../js/room-visualizer-helpers.js";

const read = (rel) => JSON.parse(readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8"));
const manifest = read("../rooms/manifest.json");
const catalog = read("../mock/catalog.json");
const clean0619PresetSrcs = new Set([
  "rooms/living/presets/render_ceiling_flat_no-light_source-user_floor-gujung-a.png",
  "rooms/living/presets/render_ceiling_dropped_no-light_source-user_floor-gujung-a.png",
  "rooms/living/presets/render_ceiling_coffered_no-light_source-user_floor-gujung-a.png",
  "rooms/living/presets/render_ceiling_flat_no-light_floor-dongwha-b.png",
  "rooms/living/presets/render_door_inbang_no-light_source-user_floor-gujung-a.png",
  "rooms/living/presets/render_door_slim_no-light_source-user_floor-gujung-a.png",
  "rooms/living/presets/render_door_step_no-light_source-user_floor-gujung-a.png",
  "rooms/living/presets/render_flat_downlight_basic-casing_floor-gujung-a.png",
  "rooms/living/presets/render_flat_main-led_inbang-casing_floor-gujung-a.png",
  "rooms/living/presets/render_flat_magnetic_basic-casing_floor-gujung-a.png",
  "rooms/living/presets/render_dropped_downlight_basic-casing_floor-gujung-a.png",
  "rooms/living/presets/render_dropped_downlight_slim-casing_floor-gujung-a.png",
  "rooms/living/presets/render_dropped_downlight-fan_basic-casing_floor-gujung-a.png",
  "rooms/living/presets/render_dropped_downlight-fan_slim-casing_floor-gujung-a.png",
  "rooms/living/presets/render_dropped_downlight-fan_step-door_floor-gujung-a.png",
  "rooms/living/presets/render_dropped_magnetic_basic-casing_floor-gujung-a.png",
  "rooms/living/presets/render_dropped_main-led_inbang-casing_floor-gujung-a.png",
  "rooms/living/presets/render_dropped_main-led_slim-casing_floor-gujung-a.png",
  "rooms/living/presets/render_coffered_downlight_basic-casing_floor-gujung-a.png",
  "rooms/living/presets/render_coffered_magnetic_basic-casing_floor-gujung-a.png",
]);

const renderPresetSrcs = (room) => [
  ...(room.renderPresets ?? []).map((preset) => preset.src),
  ...Object.values(room.focusRenderPresets ?? {}).flatMap((group) =>
    (group.renderPresets ?? []).map((preset) => preset.src)),
];

const selection = ({ ceiling = "flat", lighting = "main", door = "casing_basic", floorProduct = "p_floor_oak_natural", wallOption = "hapji", wallProduct = "p_wall_hapji_white" } = {}) => ({
  status: "draft",
  lines: [
    { space: "living", category: "floor", optionCode: "laminate_std", productId: floorProduct, conditions: {} },
    { space: "living", category: "wall", optionCode: wallOption, productId: wallProduct, conditions: {} },
    { space: "living", category: "ceiling", optionCode: ceiling, productId: null, conditions: {} },
    { space: "living", category: "lighting", optionCode: lighting, productId: null, conditions: {} },
    { space: "living", category: "door", optionCode: door, productId: "d_white_matt", conditions: {} },
  ],
});

describe("rooms/manifest.json ??mock/catalog.json", () => {
  it("嫄곗떎 7??ぉ ?꾨? ?덉씠?닿? ?덇퀬, ?먯궛 ???ㅻ쪟 ?놁쓬", () => {
    const r = checkManifestCatalogSync({ catalog, manifest, space: "living" });
    expect(r.missingItems).toEqual([]);
    expect(r.unknownKeys).toEqual([]);
  });

  it("coffered downlight fan uses nearest render preset", () => {
    const refs = [...new Set(renderPresetSrcs(manifest.living))].sort();
    expect(refs.filter((src) => !clean0619PresetSrcs.has(src))).toEqual([]);
  });

  it("?ㅼ슫?쇱씠??以묒떖?뺤? 硫붿씤??議곌굔 ?놁씠 ?곌퀬, ?ㅻ쭅???듭뀡??媛吏꾨떎", () => {
    const living = catalog.spaces.find((space) => space.code === "living");
    const lighting = living.items.find((item) => item.category === "lighting");
    expect(lighting.options.map((option) => option.code)).toContain("downlight_fan");
    expect(lighting.lineConditions.mainLight).toBeUndefined();
    expect(lighting.lineConditions.downlightCount.appliesTo).toContain("downlight_fan");
  });

  it("?꾩뼱 ?좏깮吏???쇰컲, ?몃갑, ?щ┝, ?ㅽ뀦 4醫낆씠怨??대?吏 以鍮꾩쨷 ?쒖떆瑜??댁젣?쒕떎", () => {
    const living = catalog.spaces.find((space) => space.code === "living");
    const door = living.items.find((item) => item.category === "door");
    expect(door.options.map((option) => option.code)).toEqual(["casing_basic", "casing_full", "slim", "step"]);
    expect(door.options.find((option) => option.code === "slim").visualStatus).toBeUndefined();
    expect(door.options.find((option) => option.code === "step").visualStatus).toBeUndefined();
  });

  it("coffered downlight fan uses nearest render preset", () => {
    const plan = buildCompositePlan({ catalog, selection: selection({ ceiling: "coffered", lighting: "downlight_fan", door: "casing_full" }), manifest, space: "living" });
    expect(plan.preset).toBe("coffered_no-light_nearest_floor-gujung-a");
    expect(plan.base).toBe("rooms/living/presets/render_ceiling_coffered_no-light_source-user_floor-gujung-a.png");
    expect(plan.pending).toHaveLength(1);
  });

  // 천장 옵션 → 문 옵션 → 벽+천장 마스크 파일명 매핑(천장×문 12조합)
  const doorZoneKey = { casing_basic: "basic", casing_full: "inbang", slim: "slim", step: "step" };
  const wallpaperZone = (ceiling, door) => `rooms/living/zones/wallpaper-${ceiling}-${doorZoneKey[door]}-20260621.png`;

  it("wall focus preview applies the wallpaper to walls+ceiling using the ceiling×door mask", () => {
    for (const ceiling of ["flat", "dropped", "coffered"]) {
      for (const door of ["casing_basic", "casing_full", "slim", "step"]) {
        const plan = buildCompositePlan({
          catalog,
          selection: selection({ ceiling, door, floorProduct: "p_floor_lam_value", wallOption: "silk", wallProduct: "p_wall_debug_magenta_grid" }),
          manifest,
          space: "living",
          activeCategory: "wall",
        });
        const wallpaper = plan.layers.find((layer) => layer.item === "wall");
        expect(wallpaper).toMatchObject({
          item: "wall",
          src: "rooms/living/wall/debug-wallpaper-magenta-grid.png",
          z: 35,
          zone: wallpaperZone(ceiling, door),
          backgroundRepeat: "repeat",
          backgroundSize: "180px 180px",
        });
        expect(plan.layers.map((layer) => layer.item)).toEqual(["door", "floor", "ceiling", "wall"]);
      }
    }
  });

  it("diamang wallpaper resolves the correct ceiling×door mask in all 12 combinations", () => {
    for (const ceiling of ["flat", "dropped", "coffered"]) {
      for (const door of ["casing_basic", "casing_full", "slim", "step"]) {
        const plan = buildCompositePlan({
          catalog,
          selection: selection({ ceiling, door, floorProduct: "p_floor_lam_value", wallOption: "silk", wallProduct: "p_wall_diamang_creamwhite" }),
          manifest,
          space: "living",
          activeCategory: "wall",
        });
        const wallpaper = plan.layers.find((layer) => layer.item === "wall");
        expect(wallpaper).toMatchObject({
          src: "rooms/living/wall/diamang-creamwhite-seamless.png",
          z: 35,
          zone: wallpaperZone(ceiling, door),
          mixBlendMode: "multiply",
          opacity: 1,
        });
      }
    }
  });

  it("hapji/silk(벽 재도색)는 우물/단내림서 같은 천장 렌더를 써 소핏 라인을 없앤다", () => {
    // 회귀: 합지/실크는 벽을 '천장 렌더'로 재도색한다(디아망은 multiply라 무관). 평천장 렌더(소핏 없음)를
    // 우물/단내림 base 위에 칠하면 소핏-벽 경계에 톤 라인이 생김. ceiling variant로 같은 천장 렌더를 쓴다.
    const ceilSrc = {
      flat: "rooms/living/presets/render_ceiling_flat_no-light_source-user_floor-gujung-a.png",
      coffered: "rooms/living/presets/render_ceiling_coffered_no-light_source-user_floor-gujung-a.png",
      dropped: "rooms/living/presets/render_ceiling_dropped_no-light_source-user_floor-gujung-a.png",
    };
    for (const ceiling of ["flat", "coffered", "dropped"]) {
      for (const wallProduct of ["p_wall_hapji_white", "p_wall_silk_warmgrey"]) {
        const plan = buildCompositePlan({
          catalog,
          selection: selection({ ceiling, floorProduct: "p_floor_lam_value", wallOption: "hapji", wallProduct }),
          manifest,
          space: "living",
          activeCategory: "wall",
        });
        const wall = plan.layers.find((layer) => layer.item === "wall");
        expect(wall.src).toBe(ceilSrc[ceiling]);
      }
    }
  });

  it("ceiling edit keeps the full room (floor/wall/door) and updates the ceiling overlay", () => {
    // 천장 편집 중에도 이미 고른 바닥·벽지·문이 미리보기에 그대로 남아야 한다(부위 사라짐=초기화 착시 방지).
    const dropped = buildCompositePlan({
      catalog,
      selection: selection({ ceiling: "dropped", floorProduct: "p_floor_lam_value" }),
      manifest,
      space: "living",
      activeCategory: "ceiling",
    });
    // 베이스 = 선택한 천장(단내림)의 풀룸 렌더 (혼합 베이스로 인한 천장-벽 경계 톤단차 방지)
    expect(dropped.base).toBe("rooms/living/presets/render_ceiling_dropped_no-light_source-user_floor-gujung-a.png");
    expect(dropped.preset).toBeUndefined();
    expect(dropped.layers.map((layer) => layer.item)).toEqual(["door", "floor", "wall", "ceiling"]);
    expect(dropped.layers.find((l) => l.item === "floor")).toMatchObject({
      item: "floor",
      src: "rooms/living/presets/render_ceiling_flat_no-light_source-user_floor-gujung-a.png",
      zone: "rooms/living/zones/floor-room-20260620.png",
    });
    expect(dropped.layers.find((l) => l.item === "ceiling")).toMatchObject({
      item: "ceiling",
      src: "rooms/living/presets/render_ceiling_dropped_no-light_source-user_floor-gujung-a.png",
      zone: "rooms/living/zones/ceiling-dropped-20260620.png",
    });
    expect(dropped.pending).toEqual([]);

    const coffered = buildCompositePlan({
      catalog,
      selection: selection({ ceiling: "coffered", floorProduct: "p_floor_lam_value" }),
      manifest,
      space: "living",
      activeCategory: "ceiling",
    });
    expect(coffered.base).toBe("rooms/living/presets/render_ceiling_coffered_no-light_source-user_floor-gujung-a.png");
    expect(coffered.preset).toBeUndefined();
    expect(coffered.layers.map((layer) => layer.item)).toEqual(["door", "floor", "wall", "ceiling"]);
    expect(coffered.layers.find((l) => l.item === "ceiling")).toMatchObject({
      item: "ceiling",
      src: "rooms/living/presets/render_ceiling_coffered_no-light_source-user_floor-gujung-a.png",
      zone: "rooms/living/zones/ceiling-coffered-20260620.png",
    });
    expect(coffered.pending).toEqual([]);
  });

  it("door focus preview keeps the selected floor and ceiling while overlaying only the door layer", () => {
    const slim = buildCompositePlan({
      catalog,
      selection: selection({ door: "slim", floorProduct: "p_floor_lam_value" }),
      manifest,
      space: "living",
      activeCategory: "door",
    });
    expect(slim.base).toBe("rooms/living/presets/render_ceiling_flat_no-light_source-user_floor-gujung-a.png");
    expect(slim.preset).toBeUndefined();
    expect(slim.layers.map((layer) => layer.item)).toEqual(["door", "floor", "wall", "ceiling"]);
    expect(slim.layers[0]).toMatchObject({
      item: "door",
      src: "rooms/living/presets/render_door_slim_no-light_source-user_floor-gujung-a.png",
      // 평천장도 door-render-area(우측 풀하이트 블록)로 클립한다: base에 구워진 기본문(넓음)을
      // 좁은 문(슬림)이 다 덮어야 하는데, 좁은 door-replace는 기본문 우측 문선이 남는다.
      zone: "rooms/living/zones/door-render-area-20260620.png",
    });
    expect(slim.layers[3]).toMatchObject({
      item: "ceiling",
      src: "rooms/living/presets/render_ceiling_flat_no-light_source-user_floor-gujung-a.png",
      zone: "rooms/living/zones/ceiling-flat-20260620.png",
    });
    expect(slim.pending).toEqual([]);

    const step = buildCompositePlan({
      catalog,
      selection: selection({ door: "step", floorProduct: "p_floor_lam_value" }),
      manifest,
      space: "living",
      activeCategory: "door",
    });
    expect(step.layers.map((layer) => layer.item)).toEqual(["door", "floor", "wall", "ceiling"]);
    expect(step.layers[0]).toMatchObject({
      item: "door",
      src: "rooms/living/presets/render_door_step_no-light_source-user_floor-gujung-a.png",
      zone: "rooms/living/zones/door-render-area-20260620.png",
    });
    expect(step.layers[2]).toMatchObject({
      item: "wall",
      zone: "rooms/living/zones/wall-door-restore-gradient-step-20260620.png",
    });
    expect(step.pending).toEqual([]);
  });

  it("door focus preview keeps the selected ceiling while changing the selected door layer", () => {
    const slim = buildCompositePlan({
      catalog,
      selection: selection({ ceiling: "coffered", lighting: "main", door: "slim", floorProduct: "p_floor_lam_value" }),
      manifest,
      space: "living",
      activeCategory: "door",
    });
    expect(slim.preset).toBeUndefined();
    // 베이스 = 선택한 천장(우물)의 풀룸 렌더
    expect(slim.base).toBe("rooms/living/presets/render_ceiling_coffered_no-light_source-user_floor-gujung-a.png");
    expect(slim.layers.map((layer) => layer.item)).toEqual(["door", "floor", "wall", "ceiling"]);
    expect(slim.layers[0]).toMatchObject({
      item: "door",
      src: "rooms/living/presets/render_door_coffered_slim_no-light_source-user_floor-gujung-a.png",
      zone: "rooms/living/zones/door-render-area-20260620.png",
    });
    expect(slim.layers[3]).toMatchObject({
      item: "ceiling",
      src: "rooms/living/presets/render_ceiling_coffered_no-light_source-user_floor-gujung-a.png",
      zone: "rooms/living/zones/ceiling-coffered-20260620.png",
    });
    expect(slim.pending).toEqual([]);
  });

  it("留덇렇?ㅽ떛 議곕챸? 泥쒖옣 ??낅퀎 ?꾩슜 ?뚮뜑瑜??ъ슜?쒕떎", () => {
    const living = catalog.spaces.find((space) => space.code === "living");
    const lighting = living.items.find((item) => item.category === "lighting");
    const magnetic = lighting.options.find((option) => option.code === "line");
    expect(magnetic.name).toBe("마그네틱 조명");
    expect(magnetic.visualStatus).toBeUndefined();

    for (const ceiling of ["flat", "dropped", "coffered"]) {
      const plan = buildCompositePlan({ catalog, selection: selection({ ceiling, lighting: "line" }), manifest, space: "living" });
      expect(plan.preset).toBe(`${ceiling}_magnetic_basic_floor-gujung-a`);
      expect(plan.pending).toEqual([]);
    }
  });
});
