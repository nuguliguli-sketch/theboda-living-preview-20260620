import { config } from "./env.js";
import { makeApi } from "./api.js";
import { makeMockApi } from "./mock-api.js";
import { makeAuth } from "./auth.js";
import { parseHash } from "./router.js";
import { renderLogin } from "./views/login.js";
import { renderCustomers } from "./views/customers.js";
import { renderProjects } from "./views/projects.js";
import { renderProjectDetail } from "./views/project-detail.js";
import { renderProjectDesign } from "./views/project-design.js";

// Cognito SDK는 로그인 시점에 동적 로드(설정·네트워크 없이도 화면은 뜨도록). 풀은 1회 생성.
const COGNITO_CDN = "https://esm.sh/amazon-cognito-identity-js@6";
let userPool = null;
async function authenticate({ email, password }) {
  const { CognitoUserPool, CognitoUser, AuthenticationDetails } = await import(COGNITO_CDN);
  if (!userPool) userPool = new CognitoUserPool({ UserPoolId: config.cognito.userPoolId, ClientId: config.cognito.clientId });
  return new Promise((resolve, reject) => {
    const user = new CognitoUser({ Username: email, Pool: userPool });
    const details = new AuthenticationDetails({ Username: email, Password: password });
    user.authenticateUser(details, {
      onSuccess: (session) => resolve({
        idToken: session.getIdToken().getJwtToken(),
        refreshToken: session.getRefreshToken().getToken(),
      }),
      onFailure: (err) => reject(new Error(err.message || "로그인에 실패했어요. 이메일·비밀번호를 확인해 주세요.")),
      newPasswordRequired: () => reject(new Error("최초 비밀번호 변경이 필요합니다. 관리자에게 문의해 주세요.")),
    });
  });
}

const auth = makeAuth({ storage: window.sessionStorage, authenticate });
// ?mock — 백엔드 없이 디자인 화면 미리보기(인메모리). 로그인 게이트도 우회.
const useMock = typeof location !== "undefined" && location.search.includes("mock");
const api = useMock
  ? makeMockApi()
  : makeApi({ baseUrl: config.apiBaseUrl, tenantId: config.tenantId, getToken: () => auth.getIdToken() });

const root = document.getElementById("app");
const logoutBtn = document.getElementById("logout");
function go(hash) { location.hash = hash; }

logoutBtn.addEventListener("click", () => { auth.logout(); go("#/login"); render(); });

async function render() {
  const route = parseHash(location.hash);
  const loggedIn = useMock || auth.isLoggedIn();
  logoutBtn.classList.toggle("hidden-view", !loggedIn);
  // 페이지 전환마다 상단바 컨텍스트 슬롯 초기화(뷰가 필요 시 다시 채움)
  document.getElementById("topbar-nav")?.replaceChildren();

  if (!loggedIn && route.name !== "login") { go("#/login"); return; }
  if (loggedIn && route.name === "login") { go("#/customers"); return; }

  try {
    if (route.name === "login") return renderLogin(root, { auth, onSuccess: () => go("#/customers") });
    if (route.name === "customers") return await renderCustomers(root, { api, go });
    if (route.name === "projects") return await renderProjects(root, { api, go });
    if (route.name === "project-detail") return await renderProjectDetail(root, { api, go, projectId: route.params.projectId });
    if (route.name === "project-design") return await renderProjectDesign(root, { api, go, projectId: route.params.projectId });
  } catch (e) {
    root.replaceChildren(Object.assign(document.createElement("p"), { className: "error", textContent: e.message || "오류" }));
  }
}

window.addEventListener("hashchange", render);
render();
