// operator-web/js/views/concept-carousel.js
// 무드보드 보드 캐러셀(순수 DOM 빌더). 진입 게이트 + 단계 재오픈 공용.
import { el } from "../ui.js";

// concepts: [{id,name,description,boardImage}], cbs: { current, onSelect(id), onCancel?, showCancel? }
export function buildConceptCarousel(concepts, { current = null, onSelect, onCancel, showCancel = false } = {}) {
  const list = concepts ?? [];
  let idx = Math.max(0, list.findIndex((c) => c.id === current));
  if (idx < 0) idx = 0;

  const img = el("img", { style: "max-width:100%;max-height:64vh;border-radius:10px;display:block;box-shadow:0 6px 24px rgba(0,0,0,.4)" });
  const cname = el("div", { style: "font-size:20px;font-weight:800;color:#fff" });
  const cdesc = el("div", { style: "font-size:13px;color:#aebfd6" });
  const dots = el("div", { style: "display:flex;gap:7px" });

  const navBtnStyle = "position:absolute;top:50%;transform:translateY(-50%);z-index:2;width:54px;height:54px;border-radius:9999px;border:none;background:rgba(255,255,255,.30);color:#1a3669;font-size:24px;cursor:pointer;opacity:.18;transition:opacity .2s ease,background .2s ease";
  const prev = el("button", { "aria-label": "이전", style: navBtnStyle + ";left:14px", text: "◀" });
  const next = el("button", { "aria-label": "다음", style: navBtnStyle + ";right:14px", text: "▶" });
  prev.addEventListener("mouseenter", () => { prev.style.opacity = "1"; prev.style.background = "rgba(255,255,255,.96)"; });
  prev.addEventListener("mouseleave", () => { prev.style.opacity = ".18"; prev.style.background = "rgba(255,255,255,.30)"; });
  next.addEventListener("mouseenter", () => { next.style.opacity = "1"; next.style.background = "rgba(255,255,255,.96)"; });
  next.addEventListener("mouseleave", () => { next.style.opacity = ".18"; next.style.background = "rgba(255,255,255,.30)"; });

  function render() {
    const c = list[idx] ?? {};
    img.src = c.boardImage ?? "";
    img.alt = c.name ?? "";
    cname.textContent = c.name ?? "";
    cdesc.textContent = c.description ?? "";
    dots.replaceChildren(...list.map((_, i) =>
      el("span", { style: `width:9px;height:9px;border-radius:9999px;background:${i === idx ? "#4a90d9" : "rgba(255,255,255,.35)"}` })));
  }
  function go(d) { idx = (idx + d + list.length) % list.length; render(); }
  prev.onclick = () => go(-1);
  next.onclick = () => go(1);

  const pickBtn = el("button", {
    style: "background:#4a90d9;color:#fff;border:none;border-radius:8px;padding:11px 22px;font-size:14px;font-weight:700;cursor:pointer",
    text: "이 컨셉으로 선택 →",
    onClick: () => onSelect?.(list[idx]?.id),
  });

  const bar = el("div", { style: "display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:16px;flex-wrap:wrap" }, [
    el("div", {}, [cname, cdesc]),
    el("div", { style: "display:flex;align-items:center;gap:14px" }, [dots, pickBtn]),
  ]);

  const stage = el("div", { style: "position:relative;display:flex;align-items:center;justify-content:center;min-height:52vh" }, [prev, img, next]);

  const headerChildren = [el("h2", { text: "어떤 분위기로 시작할까요?", style: "color:#fff;margin:0 0 4px" }),
    el("p", { text: "보드를 보고 고르세요. 이후 자유롭게 바꿀 수 있어요.", style: "color:#aebfd6;margin:0 0 12px;font-size:13px" })];
  if (showCancel) headerChildren.push(el("button", {
    class: "ghost", style: "position:absolute;top:14px;right:14px;color:#fff;border-color:#ffffff55", text: "← 취소", onClick: () => onCancel?.(),
  }));

  const wrap = el("div", {
    tabindex: "0",
    style: "position:relative;background:#0a1628;border-radius:16px;padding:18px;outline:none",
  }, [...headerChildren, stage, bar]);
  wrap.addEventListener("keydown", (e) => { if (e.key === "ArrowLeft") go(-1); if (e.key === "ArrowRight") go(1); });

  render();
  setTimeout(() => wrap.focus(), 0);
  return wrap;
}
