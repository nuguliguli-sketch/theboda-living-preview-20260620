// operator-web/js/mock-api.js
// 백엔드 없는 브라우저 미리보기. 실 api.js와 같은 design 메서드 표면. 규칙은 단순화(시각 확인용).
const LIVING_ORDER = ["floor", "wall", "ceiling_paper", "ceiling", "door", "sash", "tv_wall", "lighting"];

function appliesTo(spec, optionCode) { return !spec.appliesTo || spec.appliesTo.includes(optionCode); }
function defaultConditions(item, optionCode) {
  const out = {};
  for (const [k, spec] of Object.entries(item.lineConditions ?? {})) if (appliesTo(spec, optionCode)) out[k] = spec.default;
  return out;
}
function baselineOption(item) { return item.options.find((o) => o.code === item.baselineOptionCode) ?? item.options[0]; }
function baselineProductIdOf(opt) { return opt.products?.length ? (opt.baselineProductId ?? null) : null; }

export function makeMockApi() {
  let catalog = null;
  let sel = null;

  async function ensureCatalog() {
    if (!catalog) catalog = await fetch("./mock/catalog.json").then((r) => r.json());
    return catalog;
  }
  const itemOf = (cat) => catalog.spaces.find((s) => s.code === "living").items.find((i) => i.category === cat);
  const lineOf = (cat) => sel.lines.find((l) => l.category === cat);
  // 실 백엔드 404(selection_not_found) 계약과 동형 가드 — startDesign 전 변이 호출 방어.
  const requireSel = () => { if (!sel) throw Object.assign(new Error("선택이 없습니다."), { code: "selection_not_found" }); };

  function draft() {
    const lines = LIVING_ORDER.map((cat) => {
      const item = itemOf(cat); const opt = baselineOption(item);
      return { space: "living", category: cat, optionCode: opt.code, productId: baselineProductIdOf(opt), conditions: defaultConditions(item, opt.code) };
    });
    return { status: "draft", version: 0, lines };
  }

  return {
    getDesignCatalog: async () => { await ensureCatalog(); return catalog; },
    getDesign: async () => { await ensureCatalog(); return { selection: sel, spec: null }; },
    startDesign: async () => { await ensureCatalog(); sel = draft(); return sel; },
    chooseOption: async (_p, { category, optionCode }) => {
      requireSel();
      const item = itemOf(category); const opt = item.options.find((o) => o.code === optionCode);
      const line = lineOf(category);
      line.optionCode = optionCode; line.productId = baselineProductIdOf(opt); line.conditions = defaultConditions(item, optionCode);
      return sel;
    },
    chooseProduct: async (_p, { category, productId }) => { requireSel(); lineOf(category).productId = productId; return sel; },
    setCondition: async (_p, { category, ...attrs }) => { requireSel(); Object.assign(lineOf(category).conditions, attrs); return sel; },
    confirmDesign: async () => { requireSel(); sel = { ...sel, status: "confirmed", version: 1 }; return { selection: sel, spec: { lines: sel.lines } }; },
    applyConcept: async (_p, { conceptId }) => {
      requireSel();
      const concept = (catalog.concepts ?? []).find((c) => c.id === conceptId);
      if (!concept) throw Object.assign(new Error("존재하지 않는 컨셉입니다."), { code: "concept_not_found" });
      // 사전 검증(백엔드 미러, 단순화: 옵션/제품만 — 조건 유효성/appliesTo는 백엔드가 권위)
      for (const t of concept.targets) {
        const item = itemOf(t.category);
        if (t.setOption) {
          const opt = item.options.find((o) => o.code === t.setOption);
          if (!opt || opt.enabled === false) throw Object.assign(new Error("옵션 불가"), { code: "option_not_allowed" });
          if (t.setProduct && !(opt.products ?? []).some((p) => p.id === t.setProduct && p.enabled !== false))
            throw Object.assign(new Error("제품 불가"), { code: "product_not_allowed" });
        }
      }
      const snap = new Map(sel.lines.map((l) => [l.category, { optionCode: l.optionCode, productId: l.productId, conditions: JSON.stringify(l.conditions ?? {}) }]));
      // 적용(옵션→제품; 문은 setOption 없음=케이싱 보존, doorColor만)
      for (const t of concept.targets) {
        const line = lineOf(t.category); if (!line) continue;
        const item = itemOf(t.category);
        if (t.setOption && t.setOption !== line.optionCode) { line.optionCode = t.setOption; line.conditions = defaultConditions(item, t.setOption); }
        if (t.setProduct) line.productId = t.setProduct;
        if (t.setCondition) line.conditions = { ...line.conditions, [t.setCondition.key]: t.setCondition.value };
      }
      sel.previousConceptId = sel.conceptId ?? null;
      sel.conceptId = conceptId;
      // diff: 변경된 라인만, 백엔드 applyConcept과 동일 shape
      const applied = sel.lines.filter((l) => {
        const b = snap.get(l.category);
        return b && (b.optionCode !== l.optionCode || b.productId !== l.productId || b.conditions !== JSON.stringify(l.conditions ?? {}));
      }).map((l) => ({ space: l.space, category: l.category, optionCode: l.optionCode, productId: l.productId, conditions: { ...l.conditions } }));
      return { selection: sel, applied };
    },
  };
}
