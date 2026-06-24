// operator-web/js/views/design-journey-nav.js
// 상단 디자인 여정 6단계 바(순수 DOM 빌더). steps = buildJourneySteps() 결과.
import { el } from "../ui.js";

function stepNode(s, onStep) {
  const clickable = s.active && !s.locked && s.status !== "current";
  let circBg, labColor;
  if (s.status === "current") { circBg = "#1a3669"; labColor = "#0a1628;font-weight:800"; }
  else if (s.status === "done") { circBg = "#4a90d9"; labColor = "#0a1628;font-weight:700"; }
  else if (s.status === "available") { circBg = "#cdd8e6"; labColor = "#4a6a8a;font-weight:600"; }
  else { circBg = "#e3e9f1"; labColor = "#9fb0c4;font-weight:600"; } // locked

  const circle = el("div", {
    style: `width:34px;height:34px;border-radius:9999px;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:800;color:#fff;background:${circBg}`,
    text: s.status === "done" ? "✓" : String(s.num),
  });

  const subText = s.locked ? "확정됨 🔒"
    : s.key === "moodboard" && s.concept ? s.concept.name
    : s.active ? (s.status === "current" ? "현재" : "")
    : "준비중";

  const label = el("div", { style: "text-align:center" }, [
    el("div", { text: s.label + (s.key === "moodboard" && s.concept ? " ▾" : ""), style: `font-size:13px;${labColor}` }),
    subText ? el("div", { text: subText, style: "font-size:11px;color:#7d93ab" }) : null,
  ]);

  return el("div", {
    class: s.active ? "" : "option-disabled",
    style: `display:flex;flex-direction:column;align-items:center;gap:6px;min-width:84px;${clickable ? "cursor:pointer" : ""}`,
    "aria-disabled": s.active ? null : "true",
    onClick: clickable ? () => onStep?.(s.key) : undefined,
  }, [circle, label]);
}

// steps: buildJourneySteps() 결과, cbs: { onStep(key) }
export function buildJourneyNav(steps, { onStep } = {}) {
  const children = [];
  steps.forEach((s, i) => {
    if (i > 0) children.push(el("div", { style: "flex:1;height:2px;background:#dce4ee;margin:0 2px;margin-bottom:28px" }));
    children.push(stepNode(s, onStep));
  });
  return el("div", {
    class: "card",
    style: "display:flex;align-items:flex-start;justify-content:center;gap:0;padding:14px 16px;margin-bottom:16px;overflow-x:auto",
  }, children);
}
