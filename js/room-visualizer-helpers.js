// operator-web/js/room-visualizer-helpers.js
// 순수 헬퍼: (catalog, selection, manifest) → 합성 계획. DOM 없음, vitest 가능.
import { LIVING_ITEM_ORDER, itemOf, lineOf, optionOf, productOf } from "./design-view-helpers.js";

// 매니페스트 레이어가 보는 선택 키(제품ID / 옵션코드 / 조건값)
function layerKey(layer, line) {
  if (!line) return null;
  if (layer.by === "product") return line.productId ?? null;
  if (layer.by === "option") return line.optionCode ?? null;
  if (layer.by === "condition") return (line.conditions ?? {})[layer.conditionKey] ?? null;
  return null;
}

// 배지용 사람 라벨
function choiceLabel(catalog, space, layer, line) {
  const item = itemOf(catalog, space, layer.item);
  if (layer.by === "product") {
    const opt = optionOf(item, line?.optionCode);
    const p = opt && productOf(opt, line?.productId);
    return p?.name ?? line?.productId ?? "-";
  }
  if (layer.by === "option") {
    const opt = optionOf(item, line?.optionCode);
    return opt?.name ?? line?.optionCode ?? "-";
  }
  const v = (line?.conditions ?? {})[layer.conditionKey];
  return v == null ? "-" : String(v);
}

// 레이어 객체 → 인라인 CSS 문자열(position:absolute 오버레이 기준)
function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function optionMatches(line, expected) {
  if (expected == null) return true;
  return asArray(expected).includes(line?.optionCode);
}

function productMatches(line, expected) {
  if (expected == null) return true;
  return asArray(expected).includes(line?.productId);
}

function conditionMatches(line, expected) {
  if (!expected) return true;
  const actual = line?.conditions ?? {};
  return Object.entries(expected).every(([key, value]) => {
    if (value === false && actual[key] == null) return true;
    return asArray(value).includes(actual[key]);
  });
}

function presetRuleMatches({ selection, space, category, rule }) {
  const line = lineOf(selection, space, category);
  if (typeof rule === "string" || Array.isArray(rule)) return optionMatches(line, rule);
  if (!rule || typeof rule !== "object") return true;
  return optionMatches(line, rule.option)
    && productMatches(line, rule.product)
    && conditionMatches(line, rule.conditions);
}

function ruleSpecificity(rule) {
  if (rule == null) return 0;
  if (typeof rule === "string") return 3;
  if (Array.isArray(rule)) return 1;
  if (typeof rule !== "object") return 0;
  let score = 0;
  if (rule.option != null) score += Array.isArray(rule.option) ? 1 : 3;
  if (rule.product != null) score += Array.isArray(rule.product) ? 1 : 3;
  if (rule.conditions) score += Object.keys(rule.conditions).length;
  return score;
}

function presetPriority(preset) {
  if (Number.isFinite(preset?.priority)) return preset.priority;
  return Object.values(preset?.match ?? {}).reduce((score, rule) => score + ruleSpecificity(rule), 0);
}

function presetPending(preset) {
  return asArray(preset?.pending).map((pending) => {
    if (typeof pending === "string") {
      return { item: "renderPreset", label: "preview", choiceLabel: pending };
    }
    return {
      item: pending?.item ?? "renderPreset",
      label: pending?.label ?? "preview",
      choiceLabel: pending?.choiceLabel ?? "render preset pending",
    };
  });
}

export function resolveRenderPreset({ selection, room, space = "living" }) {
  const presets = room?.renderPresets ?? [];
  if (!presets.length || !selection?.lines?.length) return null;
  const matches = presets.filter((preset) =>
    Object.entries(preset.match ?? {}).every(([category, rule]) =>
      presetRuleMatches({ selection, space, category, rule })));
  matches.sort((a, b) => presetPriority(b) - presetPriority(a));
  return matches[0] ?? null;
}

function defaultRenderPreset(room) {
  const presets = room?.renderPresets ?? [];
  if (!presets.length) return null;
  return presets.find((preset) => preset.key === room.defaultRenderPreset) ?? presets[0];
}

function planFromPreset(preset, room) {
  return {
    base: preset.src,
    size: room.renderPresetSize ?? room.size ?? null,
    layers: [],
    pending: presetPending(preset),
    preset: preset.key ?? null,
  };
}

function resolveLayerAsset(asset, { selection, space }) {
  if (!asset || typeof asset !== "object") return asset;
  let resolved = asset;
  for (const category of ["ceiling", "door"]) {
    const optionCode = lineOf(selection, space, category)?.optionCode;
    const variant = optionCode ? resolved.variants?.[category]?.[optionCode] : null;
    if (variant) resolved = { ...resolved, ...variant };
  }
  return resolved;
}

function previewRoom(room, activeCategory) {
  const focus = activeCategory ? room?.focusRenderPresets?.[activeCategory] : null;
  if (!focus) return room;
  return {
    ...room,
    renderPresets: focus.renderPresets ?? [],
    defaultRenderPreset: focus.defaultRenderPreset,
    renderPresetSize: focus.renderPresetSize ?? room.renderPresetSize,
  };
}

export function layerToStyle(layer) {
  const base = `position:absolute;inset:0;z-index:${layer.z ?? 0};`;
  const mask = layer.zone
    ? `-webkit-mask:url(${layer.zone}) center/cover no-repeat;mask:url(${layer.zone}) center/cover no-repeat;`
    : "";
  const opacity = layer.opacity == null ? "" : `opacity:${layer.opacity};`;
  const blend = layer.mixBlendMode ? `mix-blend-mode:${layer.mixBlendMode};` : "";
  if (layer.kind === "image") {
    const position = layer.backgroundPosition ?? "center";
    const size = layer.backgroundSize ?? "cover";
    const repeat = layer.backgroundRepeat ?? "no-repeat";
    return `${base}background-image:url(${layer.src});background-position:${position};background-size:${size};background-repeat:${repeat};${opacity}${blend}${mask}`;
  }
  if (layer.kind === "tint") return `${base}background:${layer.color};mix-blend-mode:multiply;opacity:.55;${mask}`;
  if (layer.kind === "globalTone") return `${base}background:${layer.color};mix-blend-mode:multiply;opacity:.4;pointer-events:none;`;
  return base;
}

export function buildCompositePlan({ catalog, selection, manifest, space = "living", activeCategory = null }) {
  const rawRoom = manifest?.[space] ?? null;
  if (!rawRoom) return { base: null, size: null, layers: [], pending: [] };

  const layerPreviewItems = ["floor", "ceiling"].includes(activeCategory)
    ? new Set(["floor", "ceiling"])
    : activeCategory === "wall"
      ? new Set(["door", "floor", "wall", "ceiling"])
      : activeCategory === "door"
        ? new Set(["floor", "wall", "ceiling", "door"])
        : null;
  const focusRoom = activeCategory && !layerPreviewItems ? previewRoom(rawRoom, activeCategory) : null;
  const focusPreset = focusRoom && focusRoom !== rawRoom
    ? resolveRenderPreset({ selection, room: focusRoom, space })
    : null;
  if (focusPreset) {
    return planFromPreset(focusPreset, focusRoom);
  }

  const room = layerPreviewItems
    ? { ...rawRoom, renderPresets: [], defaultRenderPreset: null, layers: (rawRoom.layers ?? []).filter((layer) => layerPreviewItems.has(layer.item)) }
    : rawRoom;
  const renderPreset = resolveRenderPreset({ selection, room, space });
  if (renderPreset) {
    return planFromPreset(renderPreset, room);
  }
  const fallbackPreset = selection?.lines?.length ? defaultRenderPreset(room) : null;
  if (fallbackPreset) {
    return {
      base: fallbackPreset.src,
      size: room.renderPresetSize ?? room.size ?? null,
      layers: [],
      pending: [{ item: "renderPreset", label: "preview", choiceLabel: "render preset pending" }],
      preset: fallbackPreset.key ?? null,
    };
  }
  const layers = [];
  const pending = [];
  for (const layer of room.layers ?? []) {
    const item = itemOf(catalog, space, layer.item);
    const line = lineOf(selection, space, layer.item);
    const key = layerKey(layer, line);
    const label = item?.name ?? layer.item;
    const kind = layer.kind ?? "image";
    const markPending = () => pending.push({ item: layer.item, label, choiceLabel: choiceLabel(catalog, space, layer, line) });

    if (kind === "tint") {
      const color = key != null ? (layer.tints ?? {})[key] : null;
      if (color) layers.push({ item: layer.item, z: layer.z ?? 0, kind: "tint", zone: layer.zone ?? null, color, label });
      else markPending();
    } else if (kind === "globalTone") {
      const ct = (line?.conditions ?? {}).colorTemp;
      const color = ct != null ? (layer.colorTempTint ?? {})[ct] : null;
      if (color) layers.push({ item: layer.item, z: layer.z ?? 0, kind: "globalTone", color, label });
      // 조명 색온도 미선택은 배지 없이 조용히 생략(전체 톤은 선택사항, 방식 자산은 Phase 2)
    } else {
      const configuredAsset = key != null ? (layer.assets ?? {})[key] : null;
      const asset = resolveLayerAsset(configuredAsset, { selection, space });
      const src = typeof asset === "string" ? asset : asset?.src;
      if (src) layers.push({
        item: layer.item,
        z: layer.z ?? 0,
        kind: "image",
        zone: layer.zone ?? null,
        src,
        label,
        ...(asset && typeof asset === "object" ? asset : {}),
      });
      else markPending();
    }
  }
  layers.sort((a, b) => a.z - b.z);
  return { base: room.base ?? null, size: room.size ?? null, layers, pending };
}

// 매니페스트의 자산 키가 카탈로그에 실제로 존재하는지 교차 검증
export function checkManifestCatalogSync({ catalog, manifest, space = "living", itemOrder = LIVING_ITEM_ORDER }) {
  const room = manifest?.[space] ?? { layers: [] };
  const layerItems = new Set((room.layers ?? []).map((l) => l.item));
  const missingItems = itemOrder.filter((c) => !layerItems.has(c));
  const unknownKeys = [];
  for (const layer of room.layers ?? []) {
    const item = itemOf(catalog, space, layer.item);
    if (!item) { unknownKeys.push({ item: layer.item, key: "(항목 없음)" }); continue; }
    const validProducts = new Set((item.options ?? []).flatMap((o) => (o.products ?? []).map((p) => p.id)));
    const validOptions = new Set((item.options ?? []).map((o) => o.code));
    const cond = layer.conditionKey ? (item.lineConditions ?? {})[layer.conditionKey] : null;
    const validCondVals = new Set(cond?.values ?? []);
    for (const k of [...Object.keys(layer.assets ?? {}), ...Object.keys(layer.tints ?? {})]) {
      let ok = false;
      if (layer.by === "product") ok = validProducts.has(k);
      else if (layer.by === "option") ok = validOptions.has(k);
      else if (layer.by === "condition") ok = validCondVals.has(k);
      if (!ok) unknownKeys.push({ item: layer.item, key: k });
    }
    // colorTempTint 키는 colorTemp 조건값과 독립 검증 (by 기반 루프와 별도)
    for (const k of Object.keys(layer.colorTempTint ?? {})) {
      const ctVals = new Set(((item.lineConditions ?? {}).colorTemp?.values) ?? []);
      if (!ctVals.has(k)) unknownKeys.push({ item: layer.item, key: k });
    }
  }
  return { missingItems, unknownKeys };
}
