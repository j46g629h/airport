/**
 * admin-login.js — 登入頁
 *
 * ⚠️ 登入、忘記密碼、強制改密碼**三個畫面都在同一頁**（切換顯示，不換網址）。
 *
 *    強制改密碼如果做成另一頁，使用者按「上一頁」就能繞過它——
 *    他會停在一個「已經登入、但密碼還是別人給的那組」的狀態。
 *    同一頁就沒有上一頁可以按。
 */

let panelNow = 'login';


document.addEventListener('DOMContentLoaded', function () {
  initLangSwitch();

  setApiRetryNotice(function () {
    const el = document.getElementById('adminMsg');
    if (el) showMsg(t('err.retrying'), 'info');
  });

  document.getElementById('loginForm').addEventListener('submit', onLogin);
  document.getElementById('forgotForm').addEventListener('submit', onForgot);
  document.getElementById('changeForm').addEventListener('submit', onChange);

  document.getElementById('toForgot').addEventListener('click', function (e) {
    e.preventDefault();
    // 登入時打的帳號帶過去，省得再打一次
    document.getElementById('forgotAccount').value = document.getElementById('loginAccount').value.trim();
    showPanel('forgot');
  });
  document.getElementById('backToLogin').addEventListener('click', function (e) {
    e.preventDefault();
    showPanel('login');
  });
  document.getElementById('logoutBtn').addEventListener('click', function () { doLogout(); });

  /* ⚠️ 一定要等 boot() 跑完才顯示原因。showPanel() 的最後一行是
     showMsg('', '')——先顯示的話會被它清掉，而且畫面上完全看不出
     訊息曾經出現過。 */
  boot().then(showBounceReason);      // v2.8：講清楚「為什麼會回到這一頁」
});


/**
 * 被系統送回登入頁時，把原因講出來（v2.8）。
 *
 * ⚠️ 沒有這一段的話，閒置到期的人只會看到「登入畫面又出現了」，
 *    完全不知道發生什麼事——多數人的第一個反應是「系統壞了」，
 *    而不是「我離開太久了」。
 *
 * ⚠️ 讀完就把網址上的參數擦掉（history.replaceState）。留著的話
 *    使用者按重新整理會再看到一次同樣的訊息，會以為又被登出了。
 */
function showBounceReason() {
  let q = '';
  try { q = new URLSearchParams(location.search).get('idle') ? 'idle'
          : (new URLSearchParams(location.search).get('expired') ? 'expired' : ''); }
  catch (e) { return; }
  if (!q) return;

  showMsg(t(q === 'idle' ? 'adm.msg.idleOut' : 'adm.msg.expiredOut'), 'info');
  try { history.replaceState(null, '', location.pathname); } catch (e) { /* 舊瀏覽器就留著 */ }
}


/** 重新整理後，如果 token 還有效就直接進到對應的畫面 */
async function boot() {
  if (!getToken()) { showPanel('login'); return; }
  showPanel('loading');
  try {
    const res = await apiAuth('getAdminProfile', {}, true);
    if (!res || !res.ok) { clearSession(); showPanel('login'); return; }
    setSession(getToken(), res.data);
    showPanel(res.data.must_change_password ? 'change' : 'done');
  } catch (e) {
    clearSession();
    showPanel('login');
  }
}


/* ══════════════════ 三個動作 ══════════════════ */

async function onLogin(e) {
  e.preventDefault();
  const account = document.getElementById('loginAccount').value.trim();
  const password = document.getElementById('loginPassword').value;
  if (!account || !password) return showMsg(t('adm.err.required'), 'error');

  await withBusy('loginBtn', 'adm.login.submit', async function () {
    // ⚠️ 登入**絕對不可以自動重試**——重試會多算一次登入失敗次數，
    //    使用者只按了一次卻被扣兩次機會，五次很快就用完了。
    const res = await Api.post({ action: 'adminLogin', account: account, password: password }, false);

    if (!res || !res.ok) { showMsg(tAdminError(res), 'error'); return; }

    setSession(res.data.token, res.data);
    document.getElementById('changeOld').value = password;   // 強制改密碼時舊密碼就是這一組
    showMsg('', '');
    showPanel(res.data.must_change_password ? 'change' : 'done');
  });
}


async function onForgot(e) {
  e.preventDefault();
  const account = document.getElementById('forgotAccount').value.trim();
  if (!account) return showMsg(t('adm.err.required'), 'error');

  await withBusy('forgotBtn', 'adm.forgot.submit', async function () {
    const res = await Api.post({ action: 'requestPasswordReset', account: account }, false);
    // ⚠️ 後端不論帳號存不存在都回成功（避免變成帳號查詢器），
    //    所以這裡的訊息也要寫成「如果這個帳號存在，信已經寄出去了」。
    if (res && res.ok) {
      showPanel('login');
      showMsg(t('adm.forgot.sent'), 'ok');
    } else {
      showMsg(tAdminError(res), 'error');
    }
  });
}


async function onChange(e) {
  e.preventDefault();
  const oldPw = document.getElementById('changeOld').value;
  const newPw = document.getElementById('changeNew').value;
  const confirmPw = document.getElementById('changeConfirm').value;

  if (!oldPw || !newPw) return showMsg(t('adm.err.required'), 'error');
  if (newPw !== confirmPw) return showMsg(t('adm.err.notMatch'), 'error');
  // 前端先擋一次，省掉一趟 3~8 秒的 API。後端也會擋
  if (newPw.length < 8) return showMsg(t('adm.err.tooShort', { n: 8 }), 'error');

  await withBusy('changeBtn', 'adm.change.submit', async function () {
    const res = await apiAuth('adminChangePassword',
                              { old_password: oldPw, new_password: newPw }, false);
    if (!res || !res.ok) { showMsg(tAdminError(res), 'error'); return; }

    const p = getProfile();
    p.must_change_password = false;
    setSession(getToken(), p);
    showMsg(t('adm.change.done'), 'ok');
    showPanel('done');
  });
}


/* ══════════════════ 畫面 ══════════════════ */

function showPanel(name) {
  panelNow = name;
  ['loading', 'login', 'forgot', 'change', 'done'].forEach(function (p) {
    const el = document.getElementById('panel-' + p);
    if (el) el.hidden = (p !== name);
  });
  if (name === 'done') {
    const p = getProfile();
    document.getElementById('doneName').textContent = p.name || '';
    document.getElementById('doneAccount').textContent = p.account || '';
    document.getElementById('doneRole').textContent =
      t(p.is_super ? 'adm.role.super' : 'adm.role.admin');
    // 帳號管理只有超管進得去（後端 withAuth(..., true) 會擋，這裡只是不要讓人白點）
    document.getElementById('adminNav').hidden = !p.is_super;
  }
  showMsg('', '');
}


function showMsg(text, kind) {
  const el = document.getElementById('adminMsg');
  el.textContent = text || '';
  el.className = text ? ('msg msg--' + (kind || 'info')) : '';
  el.hidden = !text;
}


/** 按鈕在等 API 的時候變成不可按，避免連按送出兩次 */
async function withBusy(btnId, labelKey, fn) {
  const btn = document.getElementById(btnId);
  btn.disabled = true;
  btn.textContent = t('adm.working');
  try {
    await fn();
  } catch (err) {
    if (err && err.name === 'ApiConnectionError') {
      showMsg(err.message === 'TIMEOUT' ? t('err.timeout') : t('err.network'), 'error');
    } else {
      showMsg(t('err.server'), 'error');
    }
  } finally {
    btn.disabled = false;
    btn.textContent = t(labelKey);
  }
}
