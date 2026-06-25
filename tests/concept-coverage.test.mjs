import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = (rel) => fileURLToPath(new URL("../" + rel, import.meta.url));
const manifest = JSON.parse(readFileSync(root("rooms/manifest.json"), "utf8"));
const catalog = JSON.parse(readFileSync(root("mock/catalog.json"), "utf8"));
const layers = manifest.living.layers ?? [];
const layerFor = (item, by) => layers.find((l) => l.item === item && l.by === by);

function productRenderable(item, productId) {
  const layer = layerFor(item, "product"); if (!layer) return false;
  const a = (layer.assets ?? {})[productId]; if (!a) return false;
  if (typeof a === "string") return existsSync(root(a));
  if (a.src) return existsSync(root(a.src));
  return typeof a.backgroundColor === "string";
}
function doorColorRenderable(value) {
  const layer = layerFor("door", "condition"); if (!layer) return false;
  if ((layer.tints ?? {})[value]) return true;
  const tex = (layer.textures ?? {})[value];
  return !!(tex && tex.src && existsSync(root(tex.src)));
}

describe("컨셉 타깃 렌더 커버리지", () => {
  it("컨셉 데이터가 mock 카탈로그에 존재(3종)", () => {
    expect((catalog.concepts ?? []).map((c) => c.id)).toEqual(["warm_natural", "soft_modern", "urban_mood"]);
  });
  it("모든 컨셉 타깃이 매니페스트에서 렌더 가능하다", () => {
    const unrenderable = [];
    for (const c of (catalog.concepts ?? [])) for (const t of c.targets) {
      if (t.setProduct && !productRenderable(t.category, t.setProduct)) unrenderable.push(`${c.id}/${t.category}/${t.setProduct}`);
      if (t.setCondition?.key === "doorColor" && !doorColorRenderable(t.setCondition.value)) unrenderable.push(`${c.id}/door/${t.setCondition.value}`);
    }
    expect(unrenderable).toEqual([]);
  });
  it("모든 컨셉이 boardImage(존재하는 파일) + description을 가진다", () => {
    const missing = [];
    for (const c of (catalog.concepts ?? [])) {
      if (!c.boardImage || !existsSync(root(c.boardImage))) missing.push(`${c.id}/boardImage`);
      if (!c.description || !c.description.trim()) missing.push(`${c.id}/description`);
    }
    expect(missing).toEqual([]);
  });
});
