// operator-web/tests/design-view-helpers.test.mjs
import { describe, it, expect } from "vitest";
import {
  groupsForCategory, conditionControls, summaryRows, summarizeConditions,
  LIVING_ITEM_ORDER, LIVING_VISUAL_ITEMS, PRODUCT_CATEGORIES,
  CONDITION_LABELS, CONDITION_VALUE_LABELS,
  conceptById, activeConcept, activeConceptId, needsConceptGate,
  buildJourneySteps, JOURNEY_STEPS,
  recommendedProductId, recommendedDoorColor, sortProductsRecommendedFirst,
  artwallImage, isRecommendedArtwall, galleryPriceLabel, isGalleryItem,
} from "../js/design-view-helpers.js";

const floorItem = {
  category: "floor", name: "바닥", quantityDriver: "floor_area",
  options: [
    { code: "laminate_value", group: "강마루", grade: "실속", name: "강마루 실속", pricingStatus: "known", priceLabel: "90,000원/평", products: [{ id: "a", name: "기본", swatch: "#1" }] },
    { code: "sheet_value", group: "장판", grade: "실속", name: "장판 실속", pricingStatus: "known", priceLabel: "40,000원/평", products: [{ id: "b", name: "장판", swatch: "#2" }] },
  ],
  lineConditions: {},
};
const ceilingItem = {
  category: "ceiling", name: "천장", quantityDriver: "ceiling_area",
  options: [{ code: "dropped", group: "천장", grade: "단내림", name: "단내림", pricingStatus: "known", priceLabel: "기본 단가 적용", products: [] }],
  lineConditions: {
    demolition: { class: "costCondition", default: "keep", values: ["keep", "partial", "rebuild"] },
    includeIndirect: { class: "costCondition", default: true, type: "boolean", appliesTo: ["dropped", "coffered"] },
  },
};
const catalog = { catalogVersion: "v1", spaces: [{ code: "living", name: "거실", items: [floorItem, ceilingItem] }] };

describe("design-view-helpers", () => {
  it("groupsForCategory: group별로 옵션 묶음", () => {
    const gs = groupsForCategory(floorItem);
    expect(gs.map((g) => g.group)).toEqual(["강마루", "장판"]);
    expect(gs[0].options[0].code).toBe("laminate_value");
  });

  it("conditionControls: 적용되는 조건만, kind 매핑", () => {
    const line = { space: "living", category: "ceiling", optionCode: "dropped", conditions: { demolition: "keep", includeIndirect: true } };
    const cs = conditionControls(ceilingItem, line);
    expect(cs.map((c) => c.key)).toEqual(["demolition", "includeIndirect"]);
    expect(cs.find((c) => c.key === "demolition").kind).toBe("segment");
    expect(cs.find((c) => c.key === "includeIndirect").kind).toBe("toggle");
    expect(cs.find((c) => c.key === "demolition").current).toBe("keep");
  });

  it("conditionControls: appliesTo 미적용 옵션은 includeIndirect 제외", () => {
    const line = { space: "living", category: "ceiling", optionCode: "flat", conditions: { demolition: "keep" } };
    const cs = conditionControls(ceilingItem, line);
    expect(cs.map((c) => c.key)).toEqual(["demolition"]);
  });

  it("summarizeConditions: 라벨·값 한글", () => {
    expect(summarizeConditions({ demolition: "rebuild", includeIndirect: true }))
      .toBe("천장 철거: 전체철거후재시공 · 간접조명 포함: 예");
  });

  it("summaryRows: 항목 순서 + 옵션명·priceLabel·제품명", () => {
    const selection = { status: "draft", lines: [
      { space: "living", category: "floor", optionCode: "laminate_value", productId: "a", conditions: {} },
      { space: "living", category: "ceiling", optionCode: "dropped", productId: null, conditions: { demolition: "keep", includeIndirect: true } },
    ] };
    const rows = summaryRows(catalog, selection);
    const floor = rows.find((r) => r.category === "floor");
    expect(floor.optionName).toBe("강마루 실속");
    expect(floor.priceLabel).toBe("90,000원/평");
    expect(floor.productName).toBe("기본");
    const ceil = rows.find((r) => r.category === "ceiling");
    expect(ceil.productName).toBeNull();
    expect(ceil.conditionSummary).toContain("간접조명 포함: 예");
  });

  it("상수 노출", () => {
    expect(LIVING_ITEM_ORDER).toEqual(["floor", "wall", "ceiling_paper", "ceiling", "door", "sash", "tv_wall", "lighting"]);
    expect(PRODUCT_CATEGORIES).toEqual(["floor", "wall", "door"]);
  });
});

describe("doorColor 조건 레이블/스와치", () => {
  const doorItem = { category: "door", lineConditions: { doorColor: {
    class: "designOnly", values: ["white", "warmwhite", "wood"],
    swatches: { white: "#ECECEC", warmwhite: "#F0EBE3", wood: "#C2A982" },
  } } };
  it("doorColor 레이블과 값레이블이 한국어", () => {
    expect(CONDITION_LABELS.doorColor).toBe("문 색");
    expect(CONDITION_VALUE_LABELS.warmwhite).toBe("웜화이트");
    expect(CONDITION_VALUE_LABELS.charcoal).toBe("차콜");
  });
  it("conditionControls가 swatches를 컨트롤 기술에 통과시킨다", () => {
    const line = { optionCode: "casing_basic", conditions: { doorColor: "warmwhite" } };
    const ctrls = conditionControls(doorItem, line);
    const dc = ctrls.find((c) => c.key === "doorColor");
    expect(dc).toMatchObject({ kind: "segment", current: "warmwhite", swatches: { white: "#ECECEC", warmwhite: "#F0EBE3", wood: "#C2A982" } });
  });
});

describe("컨셉/진입 헬퍼", () => {
  const cat = { concepts: [
    { id: "warm_natural", name: "웜 내추럴", targets: [] },
    { id: "soft_modern", name: "소프트 모던", targets: [] },
  ] };
  it("conceptById: id로 컨셉 조회(없으면 null)", () => {
    expect(conceptById(cat, "soft_modern").name).toBe("소프트 모던");
    expect(conceptById(cat, "nope")).toBe(null);
    expect(conceptById(null, "x")).toBe(null);
  });
  it("activeConceptId/activeConcept: selection.conceptId 기준", () => {
    expect(activeConceptId(null)).toBe(null);
    expect(activeConceptId({ conceptId: "warm_natural" })).toBe("warm_natural");
    expect(activeConcept(cat, { conceptId: "warm_natural" }).id).toBe("warm_natural");
    expect(activeConcept(cat, {})).toBe(null);
  });
  it("needsConceptGate: selection 없음 또는 conceptId 없음이면 true", () => {
    expect(needsConceptGate(null)).toBe(true);
    expect(needsConceptGate({ status: "draft", lines: [] })).toBe(true);
    expect(needsConceptGate({ status: "draft", conceptId: "warm_natural" })).toBe(false);
  });
});

describe("디자인 여정 단계", () => {
  const cat = { concepts: [{ id: "warm_natural", name: "웜 내추럴", boardImage: "concepts/warm_natural.jpg", targets: [] }] };
  it("6단계, 무드보드·거실만 active", () => {
    const steps = buildJourneySteps(cat, null, "moodboard");
    expect(steps.map((s) => s.key)).toEqual(["moodboard", "living", "bathroom", "kitchen", "etc", "quote"]);
    expect(steps.filter((s) => s.active).map((s) => s.key)).toEqual(["moodboard", "living"]);
    expect(steps.filter((s) => !s.active).every((s) => s.status === "locked")).toBe(true);
  });
  it("컨셉 없음: 무드보드=current, 컨셉 객체 없음", () => {
    const steps = buildJourneySteps(cat, null, "moodboard");
    const mb = steps.find((s) => s.key === "moodboard");
    expect(mb.status).toBe("current");
    expect(mb.concept).toBe(null);
  });
  it("컨셉 있음 + 거실 보는 중: 무드보드=done(+컨셉), 거실=current", () => {
    const sel = { status: "draft", conceptId: "warm_natural" };
    const steps = buildJourneySteps(cat, sel, "living");
    expect(steps.find((s) => s.key === "moodboard").status).toBe("done");
    expect(steps.find((s) => s.key === "moodboard").concept.id).toBe("warm_natural");
    expect(steps.find((s) => s.key === "living").status).toBe("current");
  });
  it("확정 시 무드보드 locked=true", () => {
    const sel = { status: "confirmed", conceptId: "warm_natural" };
    const steps = buildJourneySteps(cat, sel, "living");
    expect(steps.find((s) => s.key === "moodboard").locked).toBe(true);
  });
});

describe("컨셉 추천 정렬", () => {
  const cat = { concepts: [
    { id: "warm_natural", name: "웜 내추럴", targets: [
      { category: "floor", setOption: "laminate_std", setProduct: "p_floor_dongwha_natural" },
      { category: "door", setCondition: { key: "doorColor", value: "wood" } },
    ] },
    { id: "soft_modern", name: "소프트 모던", targets: [
      { category: "wall", setOption: "silk", setProduct: "p_wall_silk_lightgray" },
    ] },
  ] };
  it("recommendedProductId: 활성 컨셉 타깃 setProduct(없으면 null)", () => {
    const sel = { conceptId: "warm_natural" };
    expect(recommendedProductId(cat, sel, "floor")).toBe("p_floor_dongwha_natural");
    expect(recommendedProductId(cat, sel, "wall")).toBe(null);
    expect(recommendedProductId(cat, { conceptId: "soft_modern" }, "floor")).toBe(null);
    expect(recommendedProductId(cat, null, "floor")).toBe(null);
  });
  it("recommendedDoorColor: door doorColor 조건 값", () => {
    expect(recommendedDoorColor(cat, { conceptId: "warm_natural" })).toBe("wood");
    expect(recommendedDoorColor(cat, { conceptId: "soft_modern" })).toBe(null);
  });
  it("sortProductsRecommendedFirst: 추천을 맨 앞으로(나머지 순서 보존)", () => {
    const ps = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(sortProductsRecommendedFirst(ps, "c").map((p) => p.id)).toEqual(["c", "a", "b"]);
    expect(sortProductsRecommendedFirst(ps, null).map((p) => p.id)).toEqual(["a", "b", "c"]);
    expect(sortProductsRecommendedFirst(ps, "x").map((p) => p.id)).toEqual(["a", "b", "c"]);
  });
});

describe("아트월 갤러리 헬퍼", () => {
  const tile = { code: "tile", name: "02 대형타일", pricingStatus: "pending", priceLabel: "산출 예정",
    consultOnly: false, recommendedConcepts: ["urban_mood"],
    conceptImages: { warm_natural: "a_warm.jpg", soft_modern: "a_soft.jpg", urban_mood: "a_urban.jpg" } };
  const none = { code: "none", name: "선택 안함", pricingStatus: "zero", priceLabel: "추가 비용 없음",
    consultOnly: false, recommendedConcepts: [], conceptImages: null };
  const arch = { code: "arch", name: "08 아치형", pricingStatus: "advisory", priceLabel: "맞춤 상담",
    consultOnly: true, recommendedConcepts: [], conceptImages: { warm_natural: "x.jpg", soft_modern: "y.jpg", urban_mood: "z.jpg" } };

  it("artwallImage: conceptId의 이미지(없으면 null)", () => {
    expect(artwallImage(tile, "urban_mood")).toBe("a_urban.jpg");
    expect(artwallImage(tile, "warm_natural")).toBe("a_warm.jpg");
    expect(artwallImage(none, "urban_mood")).toBe(null);
    expect(artwallImage(tile, null)).toBe(null);
  });
  it("isRecommendedArtwall: recommendedConcepts 포함 여부", () => {
    expect(isRecommendedArtwall(tile, "urban_mood")).toBe(true);
    expect(isRecommendedArtwall(tile, "warm_natural")).toBe(false);
    expect(isRecommendedArtwall(none, "urban_mood")).toBe(false);
  });
  it("galleryPriceLabel: consult/zero/pending/known", () => {
    expect(galleryPriceLabel(arch)).toBe("맞춤 상담");
    expect(galleryPriceLabel(none)).toBe("추가 비용 없음");
    expect(galleryPriceLabel(tile)).toBe("가격 협의"); // pending → 협의
    expect(galleryPriceLabel({ pricingStatus: "known", priceLabel: "1,200,000원" })).toBe("1,200,000원");
  });
  it("isGalleryItem: selectionStyle 기준", () => {
    expect(isGalleryItem({ selectionStyle: "gallery" })).toBe(true);
    expect(isGalleryItem({ selectionStyle: null })).toBe(false);
    expect(isGalleryItem({})).toBe(false);
  });
  it("LIVING_VISUAL_ITEMS는 tv_wall을 포함하지 않는다(갤러리=합성 비참여)", () => {
    expect(LIVING_VISUAL_ITEMS).toEqual(["floor", "wall", "ceiling", "door", "sash", "lighting"]);
  });
});

describe("summaryRows 갤러리 가격", () => {
  const galleryItem = { category: "tv_wall", name: "TV벽(아트월)", selectionStyle: "gallery", options: [
    { code: "tile", name: "02 대형타일", pricingStatus: "pending", priceLabel: "산출 예정", consultOnly: false, products: [] },
  ], lineConditions: {} };
  const cat = { spaces: [{ code: "living", name: "거실", items: [galleryItem] }] };
  it("갤러리 항목은 galleryPriceLabel 사용(pending→가격 협의)", () => {
    const sel = { status: "draft", lines: [{ space: "living", category: "tv_wall", optionCode: "tile", productId: null, conditions: {} }] };
    const row = summaryRows(cat, sel).find((r) => r.category === "tv_wall");
    expect(row.optionName).toBe("02 대형타일");
    expect(row.priceLabel).toBe("가격 협의");
  });
});
