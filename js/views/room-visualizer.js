// operator-web/js/views/room-visualizer.js
// ?⑹꽦 怨꾪쉷??DOM?쇰줈: base ?ъ쭊 ?꾩뿉 遺??留덉뒪???덉씠?대? 寃뱀튂怨? 誘몄?鍮???ぉ? 諛곗?濡?
import { el } from "../ui.js";
import { buildCompositePlan, layerToStyle } from "../room-visualizer-helpers.js";

const VISUAL_ASSET_VERSION = "0620-wall-test-v1";
const visualAssetUrl = (url) => {
  if (!url?.startsWith("rooms/living/presets/") && !url?.startsWith("rooms/living/floor/") && !url?.startsWith("rooms/living/wall/")) return url;
  return `${url}${url.includes("?") ? "&" : "?"}v=${VISUAL_ASSET_VERSION}`;
};

// ctx: { catalog, selection, manifest, space, activeCategory }
export function buildRoomVisualizer({ catalog, selection, manifest, space = "living", activeCategory = null }) {
  const plan = buildCompositePlan({ catalog, selection, manifest, space, activeCategory });
  const children = [el("h3", { text: "거실 미리보기" })];

  if (!plan.base) {
    children.push(el("p", {
      class: "muted",
      text: plan.pending.length ? "선택한 조합의 미리보기 준비 중입니다." : "아직 미리보기 이미지가 없습니다.",
    }));
  } else {
    const isDoorFocus = activeCategory === "door" && Boolean(plan.preset);
    const ar = isDoorFocus ? "4 / 3" : (plan.size ? `${plan.size.w} / ${plan.size.h}` : "3 / 2");
    const baseBackground = isDoorFocus
      ? `background-image:url(${visualAssetUrl(plan.base)});background-position:100% 52%;background-size:235% auto;background-repeat:no-repeat`
      : `background:url(${visualAssetUrl(plan.base)}) center/cover no-repeat`;
    const baseNode = el("div", { style: `position:absolute;inset:0;z-index:0;${baseBackground}` });
    const layerNodes = plan.layers.map((layer) => el("div", {
      style: layerToStyle(layer.src ? { ...layer, src: visualAssetUrl(layer.src) } : layer),
    }));
    const stage = el("div",
      { style: `position:relative;width:100%;aspect-ratio:${ar};border-radius:14px;overflow:hidden;background:#f4f7fb` },
      [baseNode, ...layerNodes]);
    children.push(stage);
  }

  if (plan.pending.length) {
    children.push(el("div", { class: "muted", style: "margin-top:10px;font-weight:600", text: "미리보기 준비 중" }));
    children.push(el("div", { class: "row", style: "flex-wrap:wrap;gap:6px" },
      plan.pending.map((p) => el("span", { class: "badge draft", text: `${p.label}: ${p.choiceLabel}` }))));
  }
  return el("div", { class: "card" }, children);
}

