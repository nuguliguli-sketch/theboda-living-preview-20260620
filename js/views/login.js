import { el, mount, errorText } from "../ui.js";

// ctx = { auth, onSuccess }
export function renderLogin(root, ctx) {
  const errBox = el("div", { class: "error" });
  const email = el("input", { type: "email", placeholder: "이메일", autocomplete: "username" });
  const pw = el("input", { type: "password", placeholder: "비밀번호", autocomplete: "current-password" });
  const btn = el("button", { class: "primary", text: "로그인" });

  async function submit() {
    errBox.textContent = "";
    btn.disabled = true; btn.textContent = "로그인 중…";
    try {
      await ctx.auth.login(email.value.trim(), pw.value);
      ctx.onSuccess();
    } catch (e) {
      errBox.textContent = errorText(e);
    } finally {
      btn.disabled = false; btn.textContent = "로그인";
    }
  }
  btn.addEventListener("click", submit);
  pw.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });

  const card = el("div", { class: "card" }, [
    el("h1", { text: "더보다 운영 로그인" }),
    el("label", { text: "이메일" }), email,
    el("label", { text: "비밀번호" }), pw,
    el("div", { class: "row", style: "margin-top:16px" }, [btn]),
    errBox,
  ]);
  mount(root, card);
}
