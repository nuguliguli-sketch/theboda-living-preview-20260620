// operator-web/js/design-view-helpers.js
// 순수 파생 헬퍼(DOM 없음, node 테스트 가능). 카탈로그 DTO + selection → 화면 데이터.

export const LIVING_ITEM_ORDER = ["floor", "wall", "ceiling", "door", "sash", "tv_wall", "lighting"];
export const PRODUCT_CATEGORIES = ["floor", "wall", "door"]; // 제품 카드가 있는 항목

export const CONDITION_LABELS = {
  demolition: "천장 철거", includeIndirect: "간접조명 포함",
  colorTemp: "색온도", mainLight: "메인등", dimmingRequested: "디밍 요청",
  downlightCount: "다운라이트 개수", lineRunCount: "마그네틱 구간", tvWidth: "TV 가로(mm)",
  tvHeight: "TV 세로(mm)", tvDepth: "TV 두께(mm)",
  frameColor: "프레임 색", division: "창 분할", glass: "유리",
};
export const CONDITION_VALUE_LABELS = {
  keep: "유지", partial: "부분철거", rebuild: "전체철거후재시공",
  warm: "전구색", neutral: "주백색", on: "켜기", off: "끄기",
  white: "화이트", gray: "그레이", black: "블랙", wood: "우드",
  full: "통창", divided: "분할(격자)", pair: "복층", lowe: "로이", triple: "삼중",
};

export const isConfirmed = (selection) => selection?.status === "confirmed";
export const lineOf = (selection, space, category) =>
  (selection?.lines ?? []).find((l) => l.space === space && l.category === category) ?? null;
export const itemOf = (catalog, space, category) => {
  const s = (catalog?.spaces ?? []).find((x) => x.code === space);
  return (s?.items ?? []).find((i) => i.category === category) ?? null;
};
export const optionOf = (item, optionCode) =>
  (item?.options ?? []).find((o) => o.code === optionCode) ?? null;
export const productOf = (option, productId) =>
  (option?.products ?? []).find((p) => p.id === productId) ?? null;

// 바닥·벽지·문: 종류(group)별 옵션 묶음.
export function groupsForCategory(item) {
  const groups = [];
  for (const opt of item?.options ?? []) {
    let g = groups.find((x) => x.group === opt.group);
    if (!g) { g = { group: opt.group, options: [] }; groups.push(g); }
    g.options.push(opt);
  }
  return groups;
}

// 현재 옵션에 적용되는 라인조건 컨트롤 기술.
export function conditionControls(item, line) {
  const specs = item?.lineConditions ?? {};
  const out = [];
  for (const [key, spec] of Object.entries(specs)) {
    const applies = !spec.appliesTo || spec.appliesTo.includes(line?.optionCode);
    if (!applies) continue;
    let kind = "segment";
    if (!spec.values && spec.type === "boolean") kind = "toggle";
    else if (!spec.values && spec.type === "number") kind = "number";
    const current = (line?.conditions ?? {})[key];
    out.push({
      key, label: CONDITION_LABELS[key] ?? key, kind,
      values: spec.values ?? null, klass: spec.class,
      current: current === undefined ? null : current,
    });
  }
  return out;
}

export function summarizeConditions(conditions) {
  const parts = [];
  for (const [k, v] of Object.entries(conditions ?? {})) {
    if (v === null || v === undefined) continue;
    const label = CONDITION_LABELS[k] ?? k;
    const valLabel = typeof v === "boolean" ? (v ? "예" : "아니오") : (CONDITION_VALUE_LABELS[v] ?? String(v));
    parts.push(`${label}: ${valLabel}`);
  }
  return parts.join(" · ");
}

export function summaryRows(catalog, selection) {
  const rows = [];
  for (const category of LIVING_ITEM_ORDER) {
    const line = lineOf(selection, "living", category);
    if (!line) continue;
    const item = itemOf(catalog, "living", category);
    const opt = optionOf(item, line.optionCode);
    const prod = opt && productOf(opt, line.productId);
    rows.push({
      category, categoryName: item?.name ?? category,
      optionName: opt?.name ?? line.optionCode,
      priceLabel: opt?.priceLabel ?? "",
      pricingStatus: opt?.pricingStatus ?? null,
      productName: prod?.name ?? null,
      conditionSummary: summarizeConditions(line.conditions),
    });
  }
  return rows;
}
