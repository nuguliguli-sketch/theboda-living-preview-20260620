// operator-web/js/views/design-item-panel.js
// 현재 항목의 메인 패널 DOM 빌더(순수 빌더 — 콜백으로 액션 위임).
import { el } from "../ui.js";
import {
  PRODUCT_CATEGORIES, groupsForCategory, conditionControls, optionOf, CONDITION_VALUE_LABELS,
} from "../design-view-helpers.js";

function pricingBadge(opt) {
  const cls = opt.pricingStatus === "pending" ? "draft" : opt.pricingStatus === "zero" ? "approved" : "";
  return el("span", { class: `badge ${cls}`, text: opt.priceLabel || "" });
}

// 등급/옵션 칩 1개
function optionChip(opt, selected, onPick) {
  const visualPending = opt.visualStatus === "pending";
  const disabled = opt.enabled === false;
  const cls = disabled ? "ghost option-disabled" : selected ? "primary" : visualPending ? "ghost visual-pending" : "ghost";
  return el("button", {
    class: cls,
    style: "display:flex;flex-direction:column;align-items:flex-start;gap:2px;min-width:120px",
    disabled: disabled ? true : null,
    onClick: disabled ? undefined : onPick,
  }, [
    el("span", { text: opt.name, style: "font-weight:600" }),
    pricingBadge(opt),
    ...(visualPending ? [el("span", { class: "badge visual-pending", text: "이미지 준비중" })] : []),
  ]);
}

// 제품 카드 1개
function productCard(p, selected, onPick) {
  const disabled = p.enabled === false;
  const previewStyle = p.image
    ? `background:url(${p.image}) center/cover no-repeat`
    : `background:${p.swatch || "#eee"}`;
  return el("div", {
    class: `card${disabled ? " option-disabled" : ""}`,
    style: `width:120px;margin:0;cursor:${disabled ? "not-allowed" : "pointer"};padding:10px;border-color:${selected ? "#4a90d9" : "#e3ebf5"};border-width:${selected ? "2px" : "1px"}`,
    "aria-disabled": disabled ? "true" : null,
    onClick: disabled ? undefined : onPick,
  }, [
    el("div", { style: `width:100%;height:64px;border-radius:8px;${previewStyle};margin-bottom:8px` }),
    el("div", { text: p.name, style: "font-size:13px;font-weight:600" }),
    el("div", { class: "muted", text: [p.brand, p.code, p.size, p.색, p.마감].filter(Boolean).join(" · ") }),
  ]);
}

// 조건 컨트롤 1개(segment/toggle/number)
function conditionControl(ctrl, onSet) {
  if (ctrl.kind === "toggle") {
    const btn = el("button", {
      class: ctrl.current ? "primary" : "ghost",
      text: ctrl.current ? "포함(ON)" : "제외(OFF)",
      onClick: () => onSet(ctrl.key, !ctrl.current),
    });
    return el("div", {}, [el("label", { text: ctrl.label }), btn]);
  }
  if (ctrl.kind === "number") {
    const input = el("input", { type: "number", value: ctrl.current ?? "", placeholder: "숫자 입력", style: "max-width:160px" });
    input.addEventListener("change", () => onSet(ctrl.key, input.value === "" ? null : Number(input.value)));
    return el("div", {}, [el("label", { text: ctrl.label }), input]);
  }
  // segment
  const seg = el("div", { class: "row", style: "flex-wrap:wrap;gap:6px" },
    (ctrl.values ?? []).map((v) => {
      const dot = ctrl.swatches?.[v]
        ? el("span", { style: `display:inline-block;width:12px;height:12px;border-radius:9999px;border:1px solid #00000022;background:${ctrl.swatches[v]};margin-right:6px;vertical-align:middle` })
        : null;
      return el("button", {
        class: ctrl.current === v ? "primary" : "ghost",
        style: dot ? "display:inline-flex;align-items:center" : null,
        onClick: () => onSet(ctrl.key, v),
      }, [dot, CONDITION_VALUE_LABELS[v] ?? v]);
    }));
  const tag = ctrl.klass === "designOnly" ? "디자인 전용·가격 불변" : ctrl.klass === "costCondition" ? "가격 영향(현장 확정)" : "견적 수량";
  return el("div", {}, [el("label", { text: `${ctrl.label} (${tag})` }), seg]);
}

// item: 카탈로그 DTO 항목 / line: 현재 줄 / cbs: {confirmed, onOption, onProduct, onCondition}
export function buildItemPanel(item, line, cbs) {
  const isProduct = PRODUCT_CATEGORIES.includes(item.category);
  const children = [el("h2", { text: item.name })];

  if (isProduct) {
    // 종류(group) 탭 → 등급 칩
    for (const g of groupsForCategory(item)) {
      children.push(el("div", { class: "muted", text: g.group, style: "margin-top:12px;font-weight:600" }));
      children.push(el("div", { class: "row", style: "flex-wrap:wrap;gap:8px" },
        g.options.map((o) => optionChip(o, o.code === line.optionCode, cbs.confirmed ? undefined : () => cbs.onOption(o.code)))));
    }
    // 현재 옵션 제품 카드
    const opt = optionOf(item, line.optionCode);
    if (opt && opt.products.length) {
      children.push(el("div", { class: "muted", text: "제품", style: "margin-top:16px;font-weight:600" }));
      children.push(el("div", { class: "row", style: "flex-wrap:wrap;gap:12px" },
        opt.products.map((p) => productCard(p, p.id === line.productId, cbs.confirmed ? undefined : () => cbs.onProduct(p.id)))));
    }
  } else {
    // 옵션 칩(제품 없음)
    children.push(el("div", { class: "row", style: "flex-wrap:wrap;gap:8px;margin-top:8px" },
      item.options.map((o) => optionChip(o, o.code === line.optionCode, cbs.confirmed ? undefined : () => cbs.onOption(o.code)))));
  }

  // 조건 컨트롤(현재 옵션에 적용되는 것만)
  const ctrls = conditionControls(item, line);
  if (ctrls.length) {
    children.push(el("div", { class: "muted", text: "조건", style: "margin-top:16px;font-weight:600" }));
    for (const c of ctrls) children.push(conditionControl(c, cbs.confirmed ? () => {} : cbs.onCondition));
  }

  return el("div", { class: "card" }, children);
}
