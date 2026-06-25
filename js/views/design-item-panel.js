// operator-web/js/views/design-item-panel.js
// 현재 항목의 메인 패널 DOM 빌더(순수 빌더 — 콜백으로 액션 위임).
import { el } from "../ui.js";
import {
  PRODUCT_CATEGORIES, groupsForCategory, conditionControls, optionOf, CONDITION_VALUE_LABELS,
  sortProductsRecommendedFirst,
  isGalleryItem, artwallImage, isRecommendedArtwall, galleryPriceLabel,
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
function productCard(p, selected, onPick, recommended = false) {
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
    recommended ? el("span", { class: "badge approved", text: "추천", style: "margin-bottom:6px" }) : null,
    el("div", { style: `width:100%;height:64px;border-radius:8px;${previewStyle};margin-bottom:8px` }),
    el("div", { text: p.name, style: "font-size:13px;font-weight:600" }),
    el("div", { class: "muted", text: [p.brand, p.code, p.size, p.색, p.마감].filter(Boolean).join(" · ") }),
  ]);
}

// 조건 컨트롤 1개(segment/toggle/number)
function conditionControl(ctrl, onSet, recommendedValue = null) {
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
      const isRec = recommendedValue != null && v === recommendedValue;
      return el("button", {
        class: ctrl.current === v ? "primary" : "ghost",
        style: (dot ? "display:inline-flex;align-items:center;" : "") + (isRec ? "box-shadow:0 0 0 2px #4a90d9" : ""),
        title: isRec ? "컨셉 추천" : null,
        onClick: () => onSet(ctrl.key, v),
      }, [dot, (CONDITION_VALUE_LABELS[v] ?? v) + (isRec ? " ⭐" : "")]);
    }));
  const tag = ctrl.klass === "designOnly" ? "디자인 전용·가격 불변" : ctrl.klass === "costCondition" ? "가격 영향(현장 확정)" : "견적 수량";
  return el("div", {}, [el("label", { text: `${ctrl.label} (${tag})` }), seg]);
}

// 아트월 갤러리 카드 1개 (이미지 주인공, 1열 큰 카드)
function galleryCard(opt, selected, imageUrl, recommended, priceText, onPick) {
  const disabled = !onPick; // 확정 상태 등 클릭 불가
  const cursor = disabled ? "default" : "pointer";
  const preview = imageUrl
    ? el("div", { style: `position:relative;width:100%;aspect-ratio:7/4;background:url(${imageUrl}) center/cover no-repeat` },
        [recommended ? el("span", { class: "badge approved", style: "position:absolute;top:10px;left:10px", text: "⭐ 추천" }) : null])
    : el("div", { style: "position:relative;width:100%;aspect-ratio:7/4;background:#e7f0fb;display:flex;align-items:center;justify-content:center" },
        [el("span", { class: "muted", text: opt.name })]);
  return el("div", {
    class: `card${disabled ? " option-disabled" : ""}`,
    "aria-disabled": disabled ? "true" : null,
    style: `width:100%;margin:0 0 12px;padding:0;overflow:hidden;cursor:${cursor};border-color:${selected ? "#4a90d9" : "#e3ebf5"};border-width:${selected ? "2px" : "1px"}`,
    onClick: onPick,
  }, [
    preview,
    el("div", { style: "padding:10px 13px;display:flex;justify-content:space-between;align-items:center" }, [
      el("b", { text: opt.name }),
      el("span", { class: selected ? "" : "muted", text: selected ? `✓ ${priceText}` : priceText }),
    ]),
  ]);
}

// 아트월 갤러리 패널(1열 큰 이미지 카드 목록)
function buildGalleryPanel(item, line, cbs) {
  const conceptId = cbs.conceptId ?? null;
  const cards = item.options.map((opt) => galleryCard(
    opt,
    opt.code === line.optionCode,
    artwallImage(opt, conceptId),
    isRecommendedArtwall(opt, conceptId),
    galleryPriceLabel(opt),
    cbs.confirmed ? undefined : () => cbs.onOption(opt.code),
  ));
  return el("div", { class: "card" }, [el("h2", { text: item.name }), ...cards]);
}

// item: 카탈로그 DTO 항목 / line: 현재 줄 /
// cbs: {confirmed, onOption, onProduct, onCondition, recommendedProductId?, recommendedDoorColor?, conceptId?}
//   recommendedProductId/recommendedDoorColor = 컨셉 추천(있으면 정렬 앞+배지/문색 ⭐, 없으면 기존 거동)
export function buildItemPanel(item, line, cbs) {
  if (isGalleryItem(item)) return buildGalleryPanel(item, line, cbs);
  const isProduct = PRODUCT_CATEGORIES.includes(item.category);
  const children = [el("h2", { text: item.name })];

  if (isProduct) {
    // 종류(group) 탭 → 등급 칩
    for (const g of groupsForCategory(item)) {
      children.push(el("div", { class: "muted", text: g.group, style: "margin-top:12px;font-weight:600" }));
      children.push(el("div", { class: "row", style: "flex-wrap:wrap;gap:8px" },
        g.options.map((o) => optionChip(o, o.code === line.optionCode, cbs.confirmed ? undefined : () => cbs.onOption(o.code)))));
    }
    // 현재 옵션 제품 카드(컨셉 추천을 맨 앞 + 배지)
    const opt = optionOf(item, line.optionCode);
    if (opt && opt.products.length) {
      const recId = cbs.recommendedProductId ?? null;
      const products = sortProductsRecommendedFirst(opt.products, recId);
      children.push(el("div", { class: "muted", text: "제품", style: "margin-top:16px;font-weight:600" }));
      children.push(el("div", { class: "row", style: "flex-wrap:wrap;gap:12px" },
        products.map((p) => productCard(
          p, p.id === line.productId,
          cbs.confirmed ? undefined : () => cbs.onProduct(p.id),
          recId != null && p.id === recId,
        ))));
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
    for (const c of ctrls) children.push(conditionControl(
      c,
      cbs.confirmed ? () => {} : cbs.onCondition,
      c.key === "doorColor" ? (cbs.recommendedDoorColor ?? null) : null,
    ));
  }

  return el("div", { class: "card" }, children);
}
