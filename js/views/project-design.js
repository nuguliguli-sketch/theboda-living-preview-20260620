// operator-web/js/views/project-design.js
// 레이아웃 A: 항목 스텝퍼 + 메인 패널 + 사이드 요약. 상태·액션 오케스트레이션.
import { el, mount, errorText } from "../ui.js";
import {
  visibleItemOrder, itemOf, lineOf, isConfirmed,
  needsConceptGate, activeConceptId, conceptById,
  buildJourneySteps, recommendedProductId, recommendedDoorColor,
} from "../design-view-helpers.js";
import { buildItemPanel } from "./design-item-panel.js";
import { buildSummary } from "./design-summary.js";
import { buildRoomVisualizer } from "./room-visualizer.js";
import { buildJourneyNav } from "./design-journey-nav.js";
import { buildConceptCarousel } from "./concept-carousel.js";

const ENABLED_CATEGORIES = new Set(["floor", "wall", "ceiling_paper", "ceiling", "door", "tv_wall"]);

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
  let reopening = false; // 무드보드 단계 재오픈(전환) 플래그

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

  function drawCarousel() {
    mount(body, buildConceptCarousel(catalog.concepts ?? [], {
      current: activeConceptId(sel),
      showCancel: reopening,
      onCancel: () => { reopening = false; draw(); },
      onSelect: (conceptId) => onPickConcept(conceptId),
    }));
  }

  // 전환 확인 오버레이(Promise<boolean>). document.body에 부착.
  function confirmSwitch(concept) {
    return new Promise((resolve) => {
      const close = (val) => { overlay.remove(); resolve(val); };
      const card = el("div", { style: "background:#fff;border-radius:16px;max-width:440px;width:100%;box-shadow:0 8px 30px rgba(10,22,40,.18);overflow:hidden" }, [
        concept.boardImage ? el("img", { src: concept.boardImage, style: "width:100%;display:block" }) : null,
        el("div", { style: "padding:18px" }, [
          el("div", { text: `분위기를 '${concept.name}'으로 바꿀까요?`, style: "font-size:17px;font-weight:800;color:#0a1628" }),
          el("div", { class: "muted", style: "margin-top:8px;line-height:1.6", text: "바닥·벽·문 색이 새 컨셉 기준으로 다시 적용됩니다. 천장·문 모양·조명 등 구조는 유지돼요. 직접 바꾼 색은 사라집니다." }),
          el("div", { class: "row", style: "justify-content:flex-end;gap:8px;margin-top:18px" }, [
            el("button", { class: "ghost", text: "취소", onClick: () => close(false) }),
            el("button", { class: "primary", text: `${concept.name}으로 변경`, onClick: () => close(true) }),
          ]),
        ]),
      ]);
      const overlay = el("div", {
        style: "position:fixed;inset:0;background:rgba(10,22,40,.55);display:flex;align-items:center;justify-content:center;padding:24px;z-index:1000",
        onClick: (e) => { if (e.target === overlay) close(false); },
      }, [card]);
      document.body.appendChild(overlay);
    });
  }

  async function onPickConcept(conceptId) {
    const currentId = activeConceptId(sel);
    if (currentId === conceptId) { reopening = false; draw(); return; } // 같은 컨셉 = 닫기만
    if (currentId) {
      const ok = await confirmSwitch(conceptById(catalog, conceptId));
      if (!ok) return;
    }
    await guard(async () => {
      if (!sel) await api.startDesign(projectId);
      const res = await api.applyConcept(projectId, { conceptId });
      sel = res.selection;
      reopening = false;
      draw();
    });
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
      recommendedProductId: recommendedProductId(catalog, sel, current),
      recommendedDoorColor: current === "door" ? recommendedDoorColor(catalog, sel) : null,
      conceptId: activeConceptId(sel),
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

    const isArtwallActive = itemOf(catalog, "living", current)?.selectionStyle === "gallery";
    const previewBanner = isArtwallActive
      ? el("div", {
          style: "background:#f4f9ff;border:1px solid #cfe0f5;border-left:4px solid #4a90d9;border-radius:10px;padding:10px 12px;margin-bottom:10px;color:#1a3669;font-size:13px;line-height:1.45",
          text: "🛈 아트월은 이 실시간 미리보기에는 표시되지 않습니다 — 선택하신 디자인은 최종 렌더에 반영됩니다.",
        })
      : null;

    const journeyNav = buildJourneyNav(buildJourneySteps(catalog, sel, "living"), {
      onStep: (key) => { if (key === "moodboard" && !isConfirmed(sel)) { reopening = true; draw(); } },
    });
    // 좌(거실 이미지=sticky, 스크롤해도 유지)·우(항목 옵션+요약). 비주얼 없으면 옵션만.
    const cols = visual
      ? el("div", { class: "row", style: "align-items:flex-start;gap:20px;flex-wrap:wrap" }, [
          el("div", { style: "flex:3 1 520px;min-width:320px;position:sticky;top:16px;align-self:flex-start" }, [previewBanner, visual]),
          el("div", { style: "flex:2 1 360px;min-width:320px" }, [panel, summary]),
        ])
      : el("div", { class: "row", style: "align-items:flex-start;gap:20px;flex-wrap:wrap" }, [
          el("div", { style: "flex:1 1 460px;min-width:320px" }, [previewBanner, panel]),
          el("div", { style: "flex:0 1 340px;min-width:300px" }, [summary]),
        ]);
    mount(body, el("div", {}, [journeyNav, stepper(), cols]));
  }

  function draw() {
    if (needsConceptGate(sel) || reopening) drawCarousel();
    else drawSelection();
  }

  const view = el("div", {}, [body, errBox]);
  mount(root, view);
  // 백링크는 상단바(더보다 운영·로그아웃 줄)의 슬롯으로.
  document.getElementById("topbar-nav")?.replaceChildren(
    el("button", { class: "ghost", text: "← 프로젝트 상세", onClick: () => ctx.go(`#/projects/${projectId}`) }),
  );
  await guard(load);
}
