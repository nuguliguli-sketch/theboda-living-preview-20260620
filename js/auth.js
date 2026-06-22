const KEY_ID = "theboda_op_id";
const KEY_RF = "theboda_op_rf";

// authenticate({ email, password }) => { idToken, refreshToken } 를 주입.
// 브라우저에서는 app.js가 Cognito SRP 구현을 주입한다.
export function makeAuth({ storage, authenticate }) {
  function getIdToken() { return storage.getItem(KEY_ID); }
  function isLoggedIn() { return !!getIdToken(); }
  function logout() { storage.removeItem(KEY_ID); storage.removeItem(KEY_RF); }

  async function login(email, password) {
    const { idToken, refreshToken } = await authenticate({ email, password });
    if (!idToken) throw new Error("no idToken from auth");
    storage.setItem(KEY_ID, idToken);
    if (refreshToken) storage.setItem(KEY_RF, refreshToken);
    return true;
  }

  return { getIdToken, isLoggedIn, logout, login };
}
