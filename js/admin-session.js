/**
 * admin-session.js — 管理端的登入狀態
 *
 * 所有管理頁共用。管理頁的 <script> 一定要在 api.js 之後、
 * 該頁自己的邏輯之前載入它。
 *
 * ⚠️ token 存 sessionStorage，**不是 localStorage**。
 *    關掉分頁就失效——共用電腦上處理完直接關視窗，下一個人打不開。
 *    localStorage 會一直留著，那在工廠的共用電腦上是很危險的。
 *
 * ⚠️ token 一律放在 POST 的 body，不放在 header 也不放在網址。
 *    放網址會留在瀏覽器歷史與伺服器日誌；放 header 會觸發 CORS 預檢，
 *    而 Apps Script 不支援 doOptions（見 js/api.js 檔頭）。
 */

const SS_TOKEN   = 'airport.admin.token';
const SS_PROFILE = 'airport.admin.profile';


/** ⚠️ 無痕視窗、空間滿了、關掉網站資料都會讓 sessionStorage 丟例外，一律包起來 */
function getToken() {
  try { return sessionStorage.getItem(SS_TOKEN) || ''; }
  catch (e) { return ''; }
}

function setSession(token, profile) {
  try {
    sessionStorage.setItem(SS_TOKEN, token || '');
    sessionStorage.setItem(SS_PROFILE, JSON.stringify(profile || {}));
  } catch (e) { /* 存不進去只是重新整理後要重新登入，不影響當下操作 */ }
}

function getProfile() {
  try { return JSON.parse(sessionStorage.getItem(SS_PROFILE) || '{}'); }
  catch (e) { return {}; }
}

/**
 * 管理端的導覽列（v2.7）——登入後在每一頁切換，不必按上一頁。
 *
 * ⚠️ 只有一項可以去的時候整條不顯示。
 *    一般管理者目前只有「班表列表」，而他本來就在那一頁——
 *    畫一條只有一顆按鈕、而且按了還停在原地的導覽列，
 *    使用者會以為壞了。2d 加了「新增」之後就會自然有兩項。
 *
 * ⚠️ 前端把超管專屬的項目藏起來只是體驗，**真正的把關在後端**
 *    （gas/Admins.js 的權限檢查）。藏起來是為了不要讓一般管理者
 *    點進去撞一面「你沒有權限」的牆。
 *
 * @param {string} current  目前這一頁的代號（data-nav 的值）
 */
function renderPageNav(current) {
  const nav = document.getElementById('pageNav');
  if (!nav) return;

  const isSuper = !!getProfile().is_super;
  let usable = 0;

  nav.querySelectorAll('a[data-nav]').forEach(function (a) {
    const superOnly = a.hasAttribute('data-super');
    const show = !superOnly || isSuper;
    a.hidden = !show;
    if (show) usable++;
    // aria-current 讓螢幕閱讀器也知道「你在這一頁」，不是只有顏色不同
    if (a.dataset.nav === current) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });

  nav.hidden = usable < 2;
}


function clearSession() {
  try {
    sessionStorage.removeItem(SS_TOKEN);
    sessionStorage.removeItem(SS_PROFILE);
  } catch (e) { /* 清不掉就算了，token 6 小時後自己失效 */ }
}


/** 帶著 token 呼叫管理端 API */
function apiAuth(action, body, canRetry) {
  const payload = Object.assign({ action: action, token: getToken() }, body || {});
  return Api.post(payload, canRetry === true);
}


/**
 * 登出。
 * ⚠️ 一定要打後端那一支——token 存在 PropertiesService，是真的刪得掉的，
 *    所以這是真正的伺服器端登出，不是只把本機的清掉而已。
 *    只清本機的話，那支 token 在效期內（6 小時）仍然有效。
 */
async function doLogout(redirectTo) {
  const token = getToken();
  clearSession();
  if (token) {
    try { await Api.post({ action: 'adminLogout', token: token }, false); }
    catch (e) { /* 網路失敗也要讓他離開這一頁 */ }
  }
  location.href = redirectTo || 'admin.html';
}


/**
 * 其他管理頁在載入時呼叫：確認還登入著，順便取回姓名與角色。
 * 沒登入或已過期就導回登入頁。
 *
 * @return {Object|null} 通過回傳 profile，失敗回傳 null（此時已經在導頁了）
 */
async function requireLogin() {
  if (!getToken()) { location.href = 'admin.html'; return null; }
  try {
    const res = await apiAuth('getAdminProfile', {}, true);
    if (!res || !res.ok) { clearSession(); location.href = 'admin.html'; return null; }
    if (res.data.must_change_password) { location.href = 'admin.html'; return null; }
    setSession(getToken(), res.data);
    return res.data;
  } catch (e) {
    // 連線問題不要把人踢出去——他可能只是網路不穩，踢掉等於要他重打一次密碼
    return getProfile();
  }
}


/**
 * 後端回來的錯誤代碼 → 使用者看得懂的話。
 *
 * ⚠️ 放在這裡（而不是各頁自己一份）是因為登入頁和帳號管理頁都要用。
 *    複製兩份的結果一定是其中一份漏掉新的錯誤代碼，
 *    使用者就會看到「系統出了問題」這種毫無幫助的訊息。
 */
function tAdminError(res) {
  const code = res && res.error;
  const detail = res && res.message;
  switch (code) {
    case 'LOGIN_REQUIRED':      return t('adm.err.required');
    case 'LOGIN_FAILED':        return t('adm.err.failed', { n: detail || 0 });
    case 'LOGIN_LOCKED':        return t('adm.err.locked', { n: detail || 15 });
    case 'ACCOUNT_DISABLED':    return t('adm.err.disabled');
    case 'ACCOUNT_NOT_FOUND':   return t('adm.err.disabled');
    case 'UNAUTHORIZED':        return t('adm.err.expired');
    case 'FORBIDDEN':           return t('adm.err.forbidden');
    case 'PASSWORD_REQUIRED':   return t('adm.err.required');
    case 'PASSWORD_TOO_SHORT':  return t('adm.err.tooShort', { n: detail || 8 });
    case 'PASSWORD_SAME':       return t('adm.err.same');
    case 'OLD_PASSWORD_WRONG':  return t('adm.err.oldWrong');
    default:                    return t('err.server');
  }
}
