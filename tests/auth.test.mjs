import { describe, it, expect } from "vitest";
import { makeAuth } from "../js/auth.js";

function memStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
}

describe("auth", () => {
  it("로그인 성공 시 토큰 저장 + getIdToken 반환", async () => {
    const storage = memStorage();
    const auth = makeAuth({
      storage,
      authenticate: async () => ({ idToken: "ID", refreshToken: "RF" }),
    });
    await auth.login("op@x", "pw");
    expect(auth.getIdToken()).toBe("ID");
    expect(auth.isLoggedIn()).toBe(true);
  });

  it("로그아웃은 토큰을 지운다", async () => {
    const storage = memStorage();
    const auth = makeAuth({ storage, authenticate: async () => ({ idToken: "ID", refreshToken: "RF" }) });
    await auth.login("op@x", "pw");
    auth.logout();
    expect(auth.getIdToken()).toBe(null);
    expect(auth.isLoggedIn()).toBe(false);
  });

  it("로그인 실패는 그대로 던진다", async () => {
    const auth = makeAuth({ storage: memStorage(), authenticate: async () => { throw new Error("bad creds"); } });
    await expect(auth.login("a", "b")).rejects.toThrow(/bad creds/);
  });

  it("저장된 토큰을 새 인스턴스가 복원한다", async () => {
    const storage = memStorage();
    const a1 = makeAuth({ storage, authenticate: async () => ({ idToken: "ID2", refreshToken: "RF2" }) });
    await a1.login("op@x", "pw");
    const a2 = makeAuth({ storage, authenticate: async () => ({}) });
    expect(a2.getIdToken()).toBe("ID2");
  });
});
