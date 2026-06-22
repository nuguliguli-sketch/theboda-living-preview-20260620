import { el, mount, errorText } from "../ui.js";

// ctx = { api, go } (go(hash))
export async function renderCustomers(root, ctx) {
  const listBox = el("div", {}, [el("p", { class: "muted", text: "불러오는 중…" })]);
  const errBox = el("div", { class: "error" });

  const name = el("input", { placeholder: "고객 이름" });
  const phone = el("input", { placeholder: "전화번호" });
  const addBtn = el("button", { class: "primary", text: "새 고객 추가" });

  async function load() {
    try {
      const { items } = await ctx.api.listCustomers();
      if (!items.length) { mount(listBox, el("p", { class: "muted", text: "아직 고객이 없습니다." })); return; }
      const rows = items.map((c) =>
        el("div", { class: "list-item" }, [
          el("span", { text: `${c.name}${c.phone ? " · " + c.phone : ""}` }),
          el("span", { class: "muted", text: c.customerId }),
        ]));
      mount(listBox, el("div", {}, rows));
    } catch (e) { errBox.textContent = errorText(e); }
  }

  addBtn.addEventListener("click", async () => {
    errBox.textContent = "";
    if (!name.value.trim()) { errBox.textContent = "이름을 입력해 주세요."; return; }
    addBtn.disabled = true;
    try {
      await ctx.api.createCustomer({ name: name.value.trim(), phone: phone.value.trim() || null });
      name.value = ""; phone.value = "";
      await load();
    } catch (e) { errBox.textContent = errorText(e); }
    finally { addBtn.disabled = false; }
  });

  const view = el("div", {}, [
    el("div", { class: "row", style: "justify-content:space-between" }, [
      el("h1", { text: "고객" }),
      el("button", { class: "ghost", text: "프로젝트 →", onClick: () => ctx.go("#/projects") }),
    ]),
    el("div", { class: "card" }, [
      el("h2", { text: "새 고객" }),
      el("label", { text: "이름" }), name,
      el("label", { text: "전화번호" }), phone,
      el("div", { class: "row", style: "margin-top:12px" }, [addBtn]),
      errBox,
    ]),
    el("div", { class: "card" }, [el("h2", { text: "고객 목록" }), listBox]),
  ]);
  mount(root, view);
  await load();
}
