// 매니페스트·카탈로그가 참조하는 렌더 자산 파일이 실제 존재하는지 검증.
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = (rel) => fileURLToPath(new URL("../" + rel, import.meta.url));
const manifest = JSON.parse(readFileSync(root("rooms/manifest.json"), "utf8"));
const catalog = JSON.parse(readFileSync(root("mock/catalog.json"), "utf8"));

// 매니페스트의 모든 자산 경로 수집(src/zone/base 문자열 + renderPresets src), 이미지 확장자만.
function collectAssetPaths(room) {
  const paths = new Set();
  const isAsset = (v) => typeof v === "string" && /\.(png|jpg|jpeg)$/i.test(v);
  const walk = (node) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    for (const [k, v] of Object.entries(node)) {
      if ((k === "src" || k === "zone" || k === "base") && isAsset(v)) paths.add(v);
      else walk(v);
    }
  };
  walk(room);
  for (const p of (room.renderPresets ?? [])) if (isAsset(p.src)) paths.add(p.src);
  return [...paths];
}

describe("렌더 자산 파일 존재", () => {
  // 알려진 미렌더 자산(스펙 §8: 샷시 비주얼라이저 레이어 후속/Phase 2).
  // 마스크가 렌더되면 이 목록에서 제거해야 테스트가 통과한다(자기정리).
  const KNOWN_PENDING = [
    "rooms/living/zones/sash.png",
  ].sort();

  it("매니페스트 참조 자산은 알려진 미렌더(KNOWN_PENDING) 외 모두 존재한다", () => {
    const refs = collectAssetPaths(manifest.living);
    expect(refs.length).toBeGreaterThan(20); // 수집기 동작 보장
    const missing = refs.filter((p) => !existsSync(root(p))).sort();
    // missing이 KNOWN_PENDING와 정확히 일치해야 함:
    //  - 새 자산 누락 → 실패(회귀 검출)
    //  - 미렌더 자산이 렌더됨 → missing 축소 → 실패 → KNOWN_PENDING에서 제거하라는 신호
    expect(missing).toEqual(KNOWN_PENDING);
  });

  it("카탈로그 제품 image 경로가 모두 디스크에 존재한다", () => {
    const missing = [];
    for (const s of catalog.spaces) for (const it of s.items) for (const o of it.options) for (const p of (o.products ?? []))
      if (p.image && !existsSync(root(p.image))) missing.push(p.image);
    expect(missing).toEqual([]);
  });

  // 아트월 갤러리 이미지(9종×3무드). 사장님 8K 가이드에서 추출 완료 → 전부 존재.
  // 자기정리: 새 conceptImages가 추가됐는데 파일이 없으면 그 경로를 여기에 넣어야 통과(자산 대기 표시).
  const KNOWN_PENDING_ARTWALL = [].sort();

  it("아트월 conceptImages는 KNOWN_PENDING_ARTWALL 외 모두 존재한다", () => {
    const refs = new Set();
    for (const s of catalog.spaces) for (const it of s.items) for (const o of (it.options ?? []))
      if (o.conceptImages) for (const p of Object.values(o.conceptImages)) refs.add(p);
    expect(refs.size).toBe(27); // 9종 × 3무드
    const missing = [...refs].filter((p) => !existsSync(root(p))).sort();
    expect(missing).toEqual(KNOWN_PENDING_ARTWALL);
  });
});
