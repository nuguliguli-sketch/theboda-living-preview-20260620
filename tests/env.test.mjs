import { describe, it, expect } from "vitest";
import { resolveConfig } from "../js/env.js";

describe("env", () => {
  it("localhost는 dev API + dev 설정", () => {
    const c = resolveConfig("localhost");
    expect(c.apiBaseUrl).toMatch(/execute-api|localhost/);
    expect(c.tenantId).toBeTruthy();
    expect(c.cognito.userPoolId).toBeTruthy();
    expect(c.cognito.clientId).toBeTruthy();
  });
  it("알 수 없는 호스트는 dev로 폴백", () => {
    const c = resolveConfig("whatever.example");
    expect(c.stage).toBe("dev");
  });
});
