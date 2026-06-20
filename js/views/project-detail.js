import { el, mount, errorText } from "../ui.js";
import { uploadToS3 } from "../api.js";

// ctx = { api, go, projectId }
export async function renderProjectDetail(root, ctx) {
  const { api, projectId } = ctx;
  const stagesBox = el("div", {}, [el("p", { class: "muted", text: "공정 불러오는 중…" })]);
  const photosBox = el("div", {}, [el("p", { class: "muted", text: "사진 불러오는 중…" })]);
  const errBox = el("div", { class: "error" });

  let stages = [];

  function stageName(stageId) {
    const s = stages.find((x) => x.stageId === stageId);
    return s ? s.name : "(공정 없음)";
  }

  async function loadStages() {
    try {
      const { items } = await api.listStages(projectId);
      stages = items;
      mount(stagesBox, el("div", {}, items.map((s) =>
        el("div", { class: "list-item" }, [
          el("span", { text: `${s.order}. ${s.name}` }),
          el("span", { class: "badge", text: s.status }),
        ]))));
      rebuildStageOptions();
    } catch (e) { errBox.textContent = errorText(e); }
  }

  const fileInput = el("input", { type: "file", accept: "image/jpeg,image/png,image/webp" });
  const stageSel = el("select", {}, [el("option", { value: "", text: "공정 미지정" })]);
  const takenDate = el("input", { type: "date" });
  const memo = el("input", { placeholder: "메모 (선택)" });
  const upBtn = el("button", { class: "primary", text: "사진 업로드" });

  function rebuildStageOptions() {
    [...stageSel.querySelectorAll("option")].slice(1).forEach((o) => o.remove());
    stages.forEach((s) => stageSel.appendChild(el("option", { value: s.stageId, text: `${s.order}. ${s.name}` })));
  }

  upBtn.addEventListener("click", async () => {
    errBox.textContent = "";
    const file = fileInput.files && fileInput.files[0];
    if (!file) { errBox.textContent = "사진 파일을 선택해 주세요."; return; }
    upBtn.disabled = true; upBtn.textContent = "업로드 중…";
    try {
      const { photo, upload } = await api.createPhoto(projectId, {
        mimeType: file.type,
        stageId: stageSel.value || null,
        takenDate: takenDate.value || null,
        memo: memo.value.trim() || null,
      });
      await uploadToS3(upload, file);
      await api.confirmPhoto(projectId, photo.photoId);
      fileInput.value = ""; memo.value = "";
      await loadPhotos();
    } catch (e) { errBox.textContent = errorText(e); }
    finally { upBtn.disabled = false; upBtn.textContent = "사진 업로드"; }
  });

  async function loadPhotos() {
    try {
      const { items } = await api.listPhotos(projectId);
      if (!items.length) { mount(photosBox, el("p", { class: "muted", text: "아직 사진이 없습니다." })); return; }
      const rows = items.map((p) => {
        const badge = el("span", { class: `badge ${p.reviewStatus}`, text: p.reviewStatus });
        const approveBtn = el("button", { class: "ghost", text: "승인", onClick: () => act(() => api.approvePhoto(projectId, p.photoId)) });
        const hideBtn = el("button", { class: "ghost", text: "숨김", onClick: () => act(() => api.hidePhoto(projectId, p.photoId)) });
        return el("div", { class: "list-item" }, [
          el("span", { text: `${p.takenDate} · ${stageName(p.stageId)}${p.memo ? " · " + p.memo : ""}` }),
          el("span", { class: "row" }, [badge, approveBtn, hideBtn]),
        ]);
      });
      mount(photosBox, el("div", {}, rows));
    } catch (e) { errBox.textContent = errorText(e); }
  }

  async function act(fn) {
    errBox.textContent = "";
    try { await fn(); await loadPhotos(); }
    catch (e) { errBox.textContent = errorText(e); }
  }

  const view = el("div", {}, [
    el("div", { class: "row", style: "justify-content:space-between" }, [
      el("h1", { text: "프로젝트 상세" }),
      el("div", { class: "row", style: "gap:8px" }, [
        el("button", { class: "ghost", text: "디자인 선택 →", onClick: () => ctx.go(`#/projects/${projectId}/design`) }),
        el("button", { class: "ghost", text: "← 프로젝트 목록", onClick: () => ctx.go("#/projects") }),
      ]),
    ]),
    el("div", { class: "card" }, [el("h2", { text: "공정" }), stagesBox]),
    el("div", { class: "card" }, [
      el("h2", { text: "사진 업로드" }),
      el("label", { text: "파일 (jpg/png/webp)" }), fileInput,
      el("label", { text: "공정" }), stageSel,
      el("label", { text: "촬영일" }), takenDate,
      el("label", { text: "메모" }), memo,
      el("div", { class: "row", style: "margin-top:12px" }, [upBtn]),
      errBox,
    ]),
    el("div", { class: "card" }, [el("h2", { text: "사진 (승인 전엔 고객 비공개)" }), photosBox]),
  ]);
  mount(root, view);
  await loadStages();
  await loadPhotos();
}
