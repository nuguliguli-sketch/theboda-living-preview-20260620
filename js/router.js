// 해시 → { name, params }. 라우트: customers(기본), projects, project-detail, project-design, login.
export function parseHash(hash) {
  const h = (hash || "").replace(/^#/, "").replace(/^\//, "");
  const parts = h.split("/").filter(Boolean);
  if (parts.length === 0) return { name: "customers", params: {} };
  if (parts[0] === "login") return { name: "login", params: {} };
  if (parts[0] === "customers") return { name: "customers", params: {} };
  if (parts[0] === "projects") {
    if (parts[1] && parts[2] === "design") return { name: "project-design", params: { projectId: parts[1] } };
    if (parts[1]) return { name: "project-detail", params: { projectId: parts[1] } };
    return { name: "projects", params: {} };
  }
  return { name: "customers", params: {} };
}
