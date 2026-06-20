// operator-web/tests/design-view-helpers.test.mjs
import { describe, it, expect } from "vitest";
import {
  groupsForCategory, conditionControls, summaryRows, summarizeConditions,
  LIVING_ITEM_ORDER, PRODUCT_CATEGORIES,
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
    expect(LIVING_ITEM_ORDER).toEqual(["floor", "wall", "ceiling", "door", "sash", "tv_wall", "lighting"]);
    expect(PRODUCT_CATEGORIES).toEqual(["floor", "wall", "door"]);
  });
});
