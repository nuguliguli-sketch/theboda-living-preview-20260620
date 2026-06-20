import { describe, it, expect } from "vitest";
import { makeApi, ApiError } from "../js/api.js";

function fakeFetch(record) {
  return async (url, options) => {
    record.url = url; record.options = options;
    return {
      ok: record.ok ?? true,
      status: record.status ?? 200,
      async text() { return record.bodyText ?? JSON.stringify(record.body ?? {}); },
    };
  };
}

describe("api", () => {
  it("토큰이 있으면 Authorization 헤더를 붙인다", async () => {
    const rec = { body: { items: [] } };
    const api = makeApi({ baseUrl: "https://x", tenantId: "t_1", getToken: () => "TOK", fetchImpl: fakeFetch(rec) });
    await api.listCustomers();
    expect(rec.options.headers.Authorization).toBe("Bearer TOK");
    expect(rec.url).toBe("https://x/tenants/t_1/customers");
  });

  it("실패 응답은 ApiError로 던진다", async () => {
    const rec = { ok: false, status: 403, body: { error: "forbidden", message: "권한 없음" } };
    const api = makeApi({ baseUrl: "https://x", tenantId: "t_1", getToken: () => "TOK", fetchImpl: fakeFetch(rec) });
    const err = await api.listCustomers().catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(403);
    expect(err.code).toBe("forbidden");
  });

  it("createProject는 POST + JSON 본문", async () => {
    const rec = { body: { projectId: "p_1" } };
    const api = makeApi({ baseUrl: "https://x", tenantId: "t_1", getToken: () => "T", fetchImpl: fakeFetch(rec) });
    await api.createProject({ customerId: "c_1", title: "32평", pyeongBand: "30평대" });
    expect(rec.options.method).toBe("POST");
    expect(rec.url).toBe("https://x/tenants/t_1/projects");
    expect(JSON.parse(rec.options.body)).toMatchObject({ customerId: "c_1", title: "32평" });
  });

  it("네트워크 오류는 network_error ApiError", async () => {
    const api = makeApi({ baseUrl: "https://x", tenantId: "t_1", getToken: () => "T", fetchImpl: async () => { throw new Error("down"); } });
    const err = await api.listCustomers().catch((e) => e);
    expect(err.code).toBe("network_error");
  });

  it("startDesign은 본문 없는 POST", async () => {
    const rec = { body: { selection: { status: "draft" } } };
    const api = makeApi({ baseUrl: "https://x", tenantId: "t_1", getToken: () => "T", fetchImpl: fakeFetch(rec) });
    const sel = await api.startDesign("p_1");
    expect(rec.options.method).toBe("POST");
    expect(rec.url).toBe("https://x/tenants/t_1/projects/p_1/design");
    expect(rec.options.body).toBeUndefined();
    expect(sel.status).toBe("draft");
  });

  it("chooseOption은 /design/option POST + 본문", async () => {
    const rec = { body: { selection: { lines: [] } } };
    const api = makeApi({ baseUrl: "https://x", tenantId: "t_1", getToken: () => "T", fetchImpl: fakeFetch(rec) });
    await api.chooseOption("p_1", { space: "living", category: "floor", optionCode: "laminate_std" });
    expect(rec.url).toBe("https://x/tenants/t_1/projects/p_1/design/option");
    expect(JSON.parse(rec.options.body)).toMatchObject({ category: "floor", optionCode: "laminate_std" });
  });

  it("chooseProduct·setCondition·confirmDesign 경로", async () => {
    const rec = { body: { selection: {}, spec: { lines: [] } } };
    const api = makeApi({ baseUrl: "https://x", tenantId: "t_1", getToken: () => "T", fetchImpl: fakeFetch(rec) });
    await api.chooseProduct("p_1", { space: "living", category: "floor", productId: "x" });
    expect(rec.url).toBe("https://x/tenants/t_1/projects/p_1/design/product");
    await api.setCondition("p_1", { space: "living", category: "ceiling", demolition: "rebuild" });
    expect(rec.url).toBe("https://x/tenants/t_1/projects/p_1/design/condition");
    const res = await api.confirmDesign("p_1", { diagnosisFindings: {} });
    expect(rec.url).toBe("https://x/tenants/t_1/projects/p_1/design/confirm");
    expect(res.spec.lines).toEqual([]);
  });

  it("getDesignCatalog은 catalog만 반환", async () => {
    const rec = { body: { catalog: { catalogVersion: "v1", spaces: [] } } };
    const api = makeApi({ baseUrl: "https://x", tenantId: "t_1", getToken: () => "T", fetchImpl: fakeFetch(rec) });
    const cat = await api.getDesignCatalog("p_1");
    expect(cat.catalogVersion).toBe("v1");
  });
});
