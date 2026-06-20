import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { checkManifestCatalogSync } from "../js/room-visualizer-helpers.js";

const read = (rel) => JSON.parse(readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8"));
const manifest = read("../rooms/manifest.json");
const catalog = read("../mock/catalog.json");

describe("rooms/manifest.json ↔ mock/catalog.json", () => {
  it("거실 7항목 전부 레이어가 있고, 자산 키 오류 없음", () => {
    const r = checkManifestCatalogSync({ catalog, manifest, space: "living" });
    expect(r.missingItems).toEqual([]);
    expect(r.unknownKeys).toEqual([]);
  });
});
