import { describe, it, expect } from "vitest";
import { parseHash } from "../js/router.js";

describe("router", () => {
  it("빈 해시는 customers", () => {
    expect(parseHash("")).toEqual({ name: "customers", params: {} });
    expect(parseHash("#")).toEqual({ name: "customers", params: {} });
  });
  it("#/projects", () => {
    expect(parseHash("#/projects")).toEqual({ name: "projects", params: {} });
  });
  it("#/projects/p_1는 project-detail + projectId", () => {
    expect(parseHash("#/projects/p_1")).toEqual({ name: "project-detail", params: { projectId: "p_1" } });
  });
  it("#/login", () => {
    expect(parseHash("#/login")).toEqual({ name: "login", params: {} });
  });
});
