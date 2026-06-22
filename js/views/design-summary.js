// operator-web/js/views/design-summary.js
// 사이드: 거실 선택 요약 + 예산안 점선 자리(Spec2) + 확정 버튼.
import { el } from "../ui.js";
import { summaryRows } from "../design-view-helpers.js";

export function buildSummary(catalog, selection, { confirmed, onConfirm, onJump, canJump = () => true }) {
  const rows = summaryRows(catalog, selection).map((r) => {
    const enabled = canJump(r.category);
    return el("div", {
      class: `list-item${enabled ? "" : " option-disabled"}`,
      "aria-disabled": enabled ? null : "true",
      onClick: enabled ? () => onJump?.(r.category) : undefined,
    }, [
      el("div", {}, [
        el("div", { text: r.categoryName, style: "font-weight:600;font-size:13px" }),
        el("div", { class: "muted", text: `${r.optionName}${r.productName ? " · " + r.productName : ""}` }),
        r.conditionSummary ? el("div", { class: "muted", text: r.conditionSummary }) : null,
      ]),
      el("span", { class: `badge ${r.pricingStatus === "pending" ? "draft" : ""}`, text: r.priceLabel }),
    ]);
  });

  const budget = el("div", {
    style: "border:2px dashed #cdd8e6;border-radius:14px;padding:16px;text-align:center;color:#4a6a8a;margin:12px 0",
  }, [el("div", { text: "1차 예산안" }), el("div", { class: "muted", text: "산출식 대시보드 연결 시 표시(Spec 2)" })]);

  const footer = confirmed
    ? el("p", { class: "muted", text: `확정됨 (v${selection.version}). 자재 사양서가 견적으로 넘어갑니다.` })
    : el("button", { class: "primary", text: "샘플 확정 →", onClick: onConfirm });

  return el("div", { class: "card" }, [
    el("h3", { text: "거실 선택 요약" }),
    el("div", {}, rows),
    budget,
    footer,
  ]);
}
