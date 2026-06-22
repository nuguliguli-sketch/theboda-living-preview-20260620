import { el, mount, errorText } from "../ui.js";

const PYEONG_BANDS = ["10평대", "20평대", "30평대", "40평대", "50평대 이상"];

// ctx = { api, go }
export async function renderProjects(root, ctx) {
  const listBox = el("div", {}, [el("p", { class: "muted", text: "불러오는 중…" })]);
  const errBox = el("div", { class: "error" });

  const customerSel = el("select", {}, [el("option", { value: "", text: "고객 선택…" })]);
  const title = el("input", { placeholder: "프로젝트 제목 (예: 32평 리모델링)" });
  const band = el("select", {}, PYEONG_BANDS.map((b) => el("option", { value: b, text: b })));
  const addBtn = el("button", { class: "primary", text: "새 프로젝트 추가" });

  async function loadCustomers() {
    try {
      const { items } = await ctx.api.listCustomers();
      items.forEach((c) => customerSel.appendChild(el("option", { value: c.customerId, text: c.name })));
    } catch (e) { errBox.textContent = errorText(e); }
  }
  async function loadProjects() {
    try {
      const { items } = await ctx.api.listProjects();
      if (!items.length) { mount(listBox, el("p", { class: "muted", text: "아직 프로젝트가 없습니다." })); return; }
      const rows = items.map((p) =>
        el("div", { class: "list-item", onClick: () => ctx.go(`#/projects/${p.projectId}`) }, [
          el("span", { text: `${p.title}${p.pyeongBand ? " · " + p.pyeongBand : ""}` }),
          el("span", { class: "muted", text: "열기 →" }),
        ]));
      mount(listBox, el("div", {}, rows));
    } catch (e) { errBox.textContent = errorText(e); }
  }

  addBtn.addEventListener("click", async () => {
    errBox.textContent = "";
    if (!customerSel.value) { errBox.textContent = "고객을 선택해 주세요."; return; }
    if (!title.value.trim()) { errBox.textContent = "제목을 입력해 주세요."; return; }
    addBtn.disabled = true;
    try {
      await ctx.api.createProject({ customerId: customerSel.value, title: title.value.trim(), pyeongBand: band.value });
      title.value = "";
      await loadProjects();
    } catch (e) { errBox.textContent = errorText(e); }
    finally { addBtn.disabled = false; }
  });

  const view = el("div", {}, [
    el("div", { class: "row", style: "justify-content:space-between" }, [
      el("h1", { text: "프로젝트" }),
      el("button", { class: "ghost", text: "← 고객", onClick: () => ctx.go("#/customers") }),
    ]),
    el("div", { class: "card" }, [
      el("h2", { text: "새 프로젝트" }),
      el("label", { text: "고객" }), customerSel,
      el("label", { text: "제목" }), title,
      el("label", { text: "평형대" }), band,
      el("div", { class: "row", style: "margin-top:12px" }, [addBtn]),
      errBox,
    ]),
    el("div", { class: "card" }, [el("h2", { text: "프로젝트 목록" }), listBox]),
  ]);
  mount(root, view);
  await loadCustomers();
  await loadProjects();
}
