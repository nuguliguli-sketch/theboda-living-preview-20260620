// operator-web/js/mock-api.js
// 백엔드 없는 브라우저 미리보기. 실 api.js와 같은 design 메서드 표면. 규칙은 단순화(시각 확인용).
const LIVING_ORDER = ["floor", "wall", "ceiling_paper", "ceiling", "door", "sash", "tv_wall", "lighting"];

function appliesTo(spec, optionCode) { return !spec.appliesTo || spec.appliesTo.includes(optionCode); }
function defaultConditions(item, optionCode) {
  const out = {};
  for (const [k, spec] of Object.entries(item.lineConditions ?? {})) if (appliesTo(spec, optionCode)) out[k] = spec.default;
  return out;
}
function firstOption(item) { return item.options[0]; }
function firstProductId(opt) { return (opt.products ?? []).find((p) => p.enabled !== false)?.id ?? opt.products[0]?.id ?? null; }

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
      const item = itemOf(cat); const opt = firstOption(item);
      return { space: "living", category: cat, optionCode: opt.code, productId: firstProductId(opt), conditions: defaultConditions(item, opt.code) };
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
      line.optionCode = optionCode; line.productId = firstProductId(opt); line.conditions = defaultConditions(item, optionCode);
      return sel;
    },
    chooseProduct: async (_p, { category, productId }) => { requireSel(); lineOf(category).productId = productId; return sel; },
    setCondition: async (_p, { category, ...attrs }) => { requireSel(); Object.assign(lineOf(category).conditions, attrs); return sel; },
    confirmDesign: async () => { requireSel(); sel = { ...sel, status: "confirmed", version: 1 }; return { selection: sel, spec: { lines: sel.lines } }; },
  };
}
