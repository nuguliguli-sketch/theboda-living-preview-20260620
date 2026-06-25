import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { makeMockApi } from "../js/mock-api.js";

const catalogJson = readFileSync(fileURLToPath(new URL("../mock/catalog.json", import.meta.url)), "utf8");

beforeAll(() => {
  // mock-api의 ensureCatalog()가 fetch("./mock/catalog.json")를 호출 → 디스크의 커밋된 카탈로그로 스텁
  globalThis.fetch = async () => ({ json: async () => JSON.parse(catalogJson) });
});

describe("mock applyConcept (백엔드 미러)", () => {
  it("warm_natural 적용: 벽 제품·문 색 변경, 문 케이싱(optionCode) 보존, applied는 diff 객체 배열", async () => {
    const api = makeMockApi();
    const draft = await api.startDesign("p_x");
    const doorBaseline = draft.lines.find((l) => l.category === "door").optionCode;

    const { selection, applied } = await api.applyConcept("p_x", { conceptId: "warm_natural" });

    const wall = selection.lines.find((l) => l.category === "wall");
    const door = selection.lines.find((l) => l.category === "door");

    expect(wall.productId).toBe("p_wall_silk_sand");
    // 문은 setOption 없음 → 케이싱(optionCode) 보존, doorColor만 변경
    expect(door.optionCode).toBe(doorBaseline);
    expect(door.conditions.doorColor).toBe("wood");
    expect(selection.conceptId).toBe("warm_natural");

    // applied = 백엔드와 동일 shape: 변경 라인의 객체 배열({space,category,optionCode,productId,conditions})
    expect(Array.isArray(applied)).toBe(true);
    expect(applied.every((a) => typeof a === "object" && a !== null && !!a.category)).toBe(true);
    const cats = applied.map((a) => a.category).sort();
    expect(cats).toContain("floor");
    expect(cats).toContain("wall");
    expect(cats).toContain("door");
    // 객체 모양 점검
    const appliedWall = applied.find((a) => a.category === "wall");
    expect(appliedWall.space).toBe("living");
    expect(appliedWall.productId).toBe("p_wall_silk_sand");
    expect(typeof appliedWall.conditions).toBe("object");
  });

  it("알 수 없는 conceptId는 concept_not_found로 던진다", async () => {
    const api = makeMockApi();
    await api.startDesign("p_x");
    await expect(api.applyConcept("p_x", { conceptId: "no_such" })).rejects.toMatchObject({ code: "concept_not_found" });
  });

  it("previousConceptId가 직전 conceptId로 채워진다", async () => {
    const api = makeMockApi();
    await api.startDesign("p_x");
    await api.applyConcept("p_x", { conceptId: "warm_natural" });
    const { selection } = await api.applyConcept("p_x", { conceptId: "soft_modern" });
    expect(selection.conceptId).toBe("soft_modern");
    expect(selection.previousConceptId).toBe("warm_natural");
  });
});
