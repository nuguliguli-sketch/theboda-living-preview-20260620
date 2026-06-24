export class ApiError extends Error {
  constructor(status, code, message, field) {
    super(message || code || `HTTP ${status}`);
    this.name = "ApiError"; this.status = status; this.code = code; this.field = field;
  }
}

export function makeApi({ baseUrl, tenantId, getToken, fetchImpl = fetch }) {
  const base = `${baseUrl}/tenants/${tenantId}`;

  function safeJson(t) { try { return JSON.parse(t); } catch { return null; } }

  async function request(path, { method = "GET", body } = {}) {
    const headers = {};
    const token = getToken?.();
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    let res;
    try {
      res = await fetchImpl(base + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    } catch {
      throw new ApiError(0, "network_error", "인터넷 연결을 확인하고 다시 시도해 주세요.");
    }
    const text = await res.text();
    const data = text ? safeJson(text) : null;
    if (!res.ok) throw new ApiError(res.status, data?.error, data?.message, data?.field);
    return data;
  }

  return {
    request,
    listCustomers: () => request("/customers"),
    createCustomer: (b) => request("/customers", { method: "POST", body: b }),
    listProjects: () => request("/projects"),
    createProject: (b) => request("/projects", { method: "POST", body: b }),
    listStages: (projectId) => request(`/projects/${projectId}/stages`),
    listPhotos: (projectId, stageId) => request(`/projects/${projectId}/photos${stageId ? `?stageId=${encodeURIComponent(stageId)}` : ""}`),
    createPhoto: (projectId, b) => request(`/projects/${projectId}/photos`, { method: "POST", body: b }),
    confirmPhoto: (projectId, photoId) => request(`/projects/${projectId}/photos/${photoId}/confirm`, { method: "POST" }),
    approvePhoto: (projectId, photoId) => request(`/projects/${projectId}/photos/${photoId}/approve`, { method: "POST" }),
    hidePhoto: (projectId, photoId) => request(`/projects/${projectId}/photos/${photoId}/hide`, { method: "POST" }),
    updatePhoto: (projectId, photoId, b) => request(`/projects/${projectId}/photos/${photoId}`, { method: "PATCH", body: b }),
    // 디자인 선택(④) — 4단 모델
    getDesignCatalog: (projectId) => request(`/projects/${projectId}/design/catalog`).then((r) => r.catalog),
    getDesign: (projectId) => request(`/projects/${projectId}/design`),
    startDesign: (projectId) => request(`/projects/${projectId}/design`, { method: "POST" }).then((r) => r.selection),
    chooseOption: (projectId, b) => request(`/projects/${projectId}/design/option`, { method: "POST", body: b }).then((r) => r.selection),
    chooseProduct: (projectId, b) => request(`/projects/${projectId}/design/product`, { method: "POST", body: b }).then((r) => r.selection),
    setCondition: (projectId, b) => request(`/projects/${projectId}/design/condition`, { method: "POST", body: b }).then((r) => r.selection),
    confirmDesign: (projectId, b) => request(`/projects/${projectId}/design/confirm`, { method: "POST", body: b }),
    applyConcept: (projectId, b) => request(`/projects/${projectId}/design/concept/apply`, { method: "POST", body: b }),
  };
}

// S3 presigned POST 업로드(브라우저 전용). presigned 응답 { url, fields } + File.
export async function uploadToS3(upload, file, fetchImpl = fetch) {
  const form = new FormData();
  Object.entries(upload.fields || {}).forEach(([k, v]) => form.append(k, v));
  form.append("file", file);
  let res;
  try { res = await fetchImpl(upload.url, { method: "POST", body: form }); }
  catch { throw new ApiError(0, "network_error", "사진 업로드 중 연결이 끊겼어요."); }
  if (!res.ok) throw new ApiError(res.status, "upload_failed", "사진 업로드에 실패했어요.");
}
