// operator-web/js/views/project-design.js
// 레이아웃 A: 항목 스텝퍼 + 메인 패널 + 사이드 요약. 상태·액션 오케스트레이션.
import { el, mount, errorText } from "../ui.js";
import { visibleItemOrder, itemOf, lineOf, isConfirmed } from "../design-view-helpers.js";
import { buildItemPanel } from "./design-item-panel.js";
import { buildSummary } from "./design-summary.js";
import { buildRoomVisualizer } from "./room-visualizer.js";

const ENABLED_CATEGORIES = new Set(["floor", "wall", "ceiling_paper", "ceiling", "door"]);

async function loadManifest() {
  try {
    const r = await fetch("rooms/manifest.json", { cache: "no-store" });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

// ctx = { api, go, projectId }
export async function renderProjectDesign(root, ctx) {
  const { api, projectId } = ctx;
  const errBox = el("div", { class: "error" });
  const body = el("div", {});
  let catalog = null;
  let sel = null;
  let current = "ceiling"; // 현재 편집 항목
  let manifest = null;

  async function load() {
    const [cat, cur, man] = await Promise.all([
      api.getDesignCatalog(projectId),
      api.getDesign(projectId),
      loadManifest(),
    ]);
    catalog = cat;
    sel = cur.selection;
    manifest = man;
    draw();
  }

  async function guard(fn) {
    errBox.textContent = "";
    try { await fn(); }
    catch (e) {
      // 확정 후 변경 시도(409) → 화면을 최신(확정)으로 새로고침(에러 문구는 생략).
      if (e && e.code === "already_confirmed") { await load(); return; }
      errBox.textContent = errorText(e);
    }
  }

  function drawStart() {
    mount(body, el("div", { class: "card" }, [
      el("h2", { text: "디자인 선택 시작" }),
      el("p", { class: "muted", text: "거실 7항목(바닥·벽지·천장·문·샷시·TV벽·조명)을 기본값으로 시작합니다." }),
      el("div", { class: "row", style: "margin-top:12px" }, [
        el("button", { class: "primary", text: "선택 시작", onClick: () => guard(async () => { sel = await api.startDesign(projectId); draw(); }) }),
      ]),
    ]));
  }

  function stepper() {
    const confirmed = isConfirmed(sel);
    return el("div", { class: "row", style: "flex-wrap:wrap;gap:6px;margin-bottom:12px" },
      visibleItemOrder(catalog, sel).map((cat) => {
        const item = itemOf(catalog, "living", cat);
        const enabled = ENABLED_CATEGORIES.has(cat);
        return el("button", {
          class: cat === current ? "primary" : enabled ? "ghost" : "ghost option-disabled",
          text: item?.name ?? cat,
          disabled: enabled ? null : true,
          onClick: enabled ? () => { current = cat; draw(); } : undefined,
        });
      }).concat(confirmed ? [el("span", { class: "badge approved", text: "확정됨" })] : []));
  }

  function drawSelection() {
    if (!visibleItemOrder(catalog, sel).includes(current)) current = "wall";
    const confirmed = isConfirmed(sel);
    const item = itemOf(catalog, "living", current);
    const line = lineOf(sel, "living", current);
    if (!item || !line) {
      mount(body, el("div", { class: "card" }, [el("p", { class: "muted", text: "항목을 찾을 수 없습니다." })]));
      return;
    }

    const panel = buildItemPanel(item, line, {
      confirmed,
      onOption: (optionCode) => guard(async () => { sel = await api.chooseOption(projectId, { space: "living", category: current, optionCode }); draw(); }),
      onProduct: (productId) => guard(async () => { sel = await api.chooseProduct(projectId, { space: "living", category: current, productId }); draw(); }),
      onCondition: (key, value) => guard(async () => { sel = await api.setCondition(projectId, { space: "living", category: current, [key]: value }); draw(); }),
    });

    const summary = buildSummary(catalog, sel, {
      confirmed,
      onConfirm: () => guard(async () => { const res = await api.confirmDesign(projectId, { diagnosisFindings: {} }); sel = res.selection; draw(); }),
      canJump: (cat) => ENABLED_CATEGORIES.has(cat),
      onJump: (cat) => { current = cat; draw(); },
    });

    const visual = manifest
      ? buildRoomVisualizer({ catalog, selection: sel, manifest, space: "living", activeCategory: current })
      : null;

    mount(body, el("div", {}, [
      stepper(),
      ...(visual ? [el("div", { style: "margin-bottom:16px" }, [visual])] : []),
      el("div", { class: "row", style: "align-items:flex-start;gap:16px;flex-wrap:wrap" }, [
        el("div", { style: "flex:1 1 460px;min-width:300px" }, [panel]),
        el("div", { style: "flex:0 1 320px;min-width:280px" }, [summary]),
      ]),
    ]));
  }

  function draw() {
    if (!sel) drawStart(); else drawSelection();
  }

  const view = el("div", {}, [
    el("div", { class: "row", style: "justify-content:space-between" }, [
      el("h1", { text: "디자인 선택 — 거실" }),
      el("button", { class: "ghost", text: "← 프로젝트 상세", onClick: () => ctx.go(`#/projects/${projectId}`) }),
    ]),
    body,
    errBox,
  ]);
  mount(root, view);
  await guard(load);
}
