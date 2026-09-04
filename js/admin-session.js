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


/* ══════════════════════════════════════════════════════════════════
   閒置自動登出（v2.8）

   使用者指定：管理者登入後閒置 1 小時就自動登出。

   ⚠️ **這裡是體驗，不是把關。** 真正的把關在後端（gas/Auth.js 的
      withAuth）——它只認「距離上一次呼叫 API 有多久」，任何人關掉
      JavaScript、直接打 API 都繞不過去。前端這一層的用途是：
        ① 人真的離開座位時，畫面自己回到登入頁（共用電腦看不到資料）
        ② 到期前先警告，不要讓人打到一半才發現已經登出

   ⚠️ **兩個時鐘要對得起來。** 前端算的是「有沒有動手」（點擊、打字），
      後端算的是「有沒有呼叫 API」。這兩件事不一樣——列表頁的篩選是
      純前端的，可以連按半小時而一次 API 都沒打。所以下面會在
      「人還在動、但 API 很久沒打」的時候補一次無聲的續期。
      少了這一段，使用者會在畫面上明明還在操作時被後端判定閒置。

   ⚠️ 分鐘數**跟後端拿**（profile.idle_minutes），不在前端寫死。
      兩邊各寫一個數字，改了一邊忘了另一邊，就會出現
      「畫面說還有 10 分鐘，按下去卻說登入已過期」。
   ══════════════════════════════════════════════════════════════════ */

const SS_SEEN = 'airport.admin.seen';   // 最後一次「動手」的時間
const SS_PING = 'airport.admin.ping';   // 最後一次成功呼叫 API 的時間

const IDLE_WARN_MS  = 5 * 60 * 1000;    // 到期前幾分鐘開始警告
const IDLE_CHECK_MS = 20 * 1000;        // 多久檢查一次

/* ⚠️ sessionStorage 存不進去時（無痕視窗、空間滿了）用的備援。
      設計約定第 8 條：所有讀寫都要包 try/catch，而且**壞掉時要還能用**——
      這裡整個功能是安全機制，不能因為存不進去就整個失效。 */
let _idleMemo = {};
let _idleTimer = 0;
let _idleLimitMs = 60 * 60 * 1000;

function idleGet_(key) {
  try {
    const v = sessionStorage.getItem(key);
    if (v) return Number(v) || 0;
  } catch (e) { /* 落到備援 */ }
  return _idleMemo[key] || 0;
}

function idleSet_(key, ms) {
  _idleMemo[key] = ms;
  try { sessionStorage.setItem(key, String(ms)); } catch (e) { /* 備援已經寫好了 */ }
}


/** 記下「人有動作」。點擊、打字、觸控都算。 */
function markActivity() {
  idleSet_(SS_SEEN, Date.now());
  idleBanner_(false);
}


/**
 * 全頁的動作監聽。
 *
 * ⚠️ **警告條裡面的動作要跳過。** 監聽的是 pointerdown，它比 click 早——
 *    不跳過的話，手指按在「繼續使用」上的那一瞬間 markActivity() 就先
 *    把警告條收起來了，等 click 要送達時按鈕已經不在畫面上，
 *    **那顆按鈕於是永遠按不到**。而畫面上看起來完全正常（警告條確實消失了），
 *    只有「向後端續期」那件事會安靜地不發生。這是實際踩到的。
 */
function onDocActivity_(e) {
  if (e && e.target && e.target.closest && e.target.closest('#idleBar')) return;
  markActivity();
}


/**
 * 開始盯著閒置時間。需要登入的頁面在 requireLogin() 之後呼叫。
 *
 * ⚠️ **登入頁（admin.html）不要呼叫它。** 那一頁本來就沒登入，
 *    盯著只會在使用者慢慢打密碼時把他導回同一頁。
 */
function startIdleWatch() {
  const mins = Number(getProfile().idle_minutes);
  if (mins > 0) _idleLimitMs = mins * 60 * 1000;

  const now = Date.now();
  if (!idleGet_(SS_SEEN)) idleSet_(SS_SEEN, now);
  idleSet_(SS_PING, now);            // 剛剛才通過 requireLogin，等於打過 API

  ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) {
    document.addEventListener(ev, onDocActivity_, { passive: true });
  });

  /* ⚠️ 一定要在「回到這個分頁」時再算一次，不能只靠 setInterval。
     手機鎖屏或分頁切到背景時，瀏覽器會把計時器**降速甚至停掉**——
     手機睡了三小時再打開，計時器可能一次都沒跑到。
     而我們是拿時間戳相減，不是數計時器跑了幾次，所以補這一次檢查就準了。 */
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) idleCheck_();
  });
  window.addEventListener('focus', idleCheck_);

  if (_idleTimer) clearInterval(_idleTimer);
  _idleTimer = setInterval(idleCheck_, IDLE_CHECK_MS);
}


function idleCheck_() {
  if (!getToken()) return;

  const now  = Date.now();
  const idle = now - (idleGet_(SS_SEEN) || now);

  if (idle >= _idleLimitMs) {
    idleLogout_();
    return;
  }

  if (idle >= _idleLimitMs - IDLE_WARN_MS) {
    idleBanner_(true, Math.max(1, Math.ceil((_idleLimitMs - idle) / 60000)));
    return;
  }

  idleBanner_(false);

  /* 人還在動、但很久沒打 API → 補一次無聲的續期（見檔頭「兩個時鐘」）。
     ⚠️ 門檻要明顯小於 1 小時，否則後端已經到期了才來續期。 */
  if (now - (idleGet_(SS_PING) || 0) > _idleLimitMs * 0.6) {
    apiAuth('getAdminProfile', {}, true).catch(function () { /* 網路不好就下次再說 */ });
  }
}


function idleLogout_() {
  if (_idleTimer) { clearInterval(_idleTimer); _idleTimer = 0; }
  idleBanner_(false);
  doLogout('admin.html?idle=1');
}


/**
 * 到期前的警告條。
 *
 * ⚠️ 用 JS 生出來、不寫進各頁的 HTML：這樣新增管理頁時不必記得補一段
 *    markup，漏掉的那一頁就會是「沒有警告、直接被登出」——
 *    而那正是最容易漏、也最不容易發現的一頁。
 */
function idleBanner_(show, mins) {
  let bar = document.getElementById('idleBar');

  /* ⚠️ 收起來是用 hidden，**不是 remove()**。整條拿掉的話，按鈕在
     pointerdown 與 click 之間就從 DOM 消失，click 永遠送不到它身上
     （見上面 onDocActivity_ 的說明）。留著的元素也省掉每次重掛監聽。
     hidden 會被 css/style.css 最上面的第 4 條防禦規則
     `[hidden]{display:none!important}` 確實藏起來。 */
  if (!show) { if (bar) bar.hidden = true; return; }

  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'idleBar';
    bar.className = 'idlebar';
    bar.setAttribute('role', 'status');
    bar.innerHTML = '<span id="idleBarText"></span>' +
                    '<button type="button" id="idleBarBtn"></button>';
    document.body.appendChild(bar);
    document.getElementById('idleBarBtn').addEventListener('click', function () {
      markActivity();
      idleSet_(SS_PING, 0);        // 逼下一次檢查馬上向後端續期
      idleCheck_();
    });
  }
  bar.hidden = false;
  document.getElementById('idleBarText').textContent = t('idle.warn', { n: mins });
  document.getElementById('idleBarBtn').textContent = t('idle.stay');
}


/**
 * 帶著 token 呼叫管理端 API。
 *
 * ⚠️ 順手做兩件跟閒置登出有關的事，**放在這裡是刻意的**——
 *    每一支管理端 API 都走這一支，寫在這裡就不可能有哪一頁漏掉。
 *      ① 記下「最後一次成功打 API 的時間」，前端的續期判斷要用
 *      ② 後端說這支憑證死了，就當場回登入頁
 */
function apiAuth(action, body, canRetry) {
  const payload = Object.assign({ action: action, token: getToken() }, body || {});
  return Api.post(payload, canRetry === true).then(function (res) {
    if (res && res.ok) {
      idleSet_(SS_PING, Date.now());
    } else if (res && (res.error === 'SESSION_IDLE' || res.error === 'UNAUTHORIZED')) {
      sessionBounce_(res.error === 'SESSION_IDLE' ? 'idle=1' : 'expired=1');
    }
    return res;
  });
}


/**
 * 憑證已經沒用了 → 清掉本機的、回登入頁。
 *
 * ⚠️ 已經在登入頁時**什麼都不做**。admin.html 的「強制改密碼」也走 apiAuth，
 *    在那裡再導一次 admin.html 等於重新整理，使用者剛打的新密碼會不見。
 *
 * @return {boolean} 有沒有真的導頁
 */
function sessionBounce_(query) {
  if (/(^|\/)admin\.html$/.test(location.pathname)) return false;
  clearSession();
  location.href = 'admin.html?' + query;
  return true;
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
    // v2.8 閒置到期。跟「登入已過期」分開講，使用者才知道是自己離開太久，
    // 不是系統把他踢掉——不然他會以為是壞了，而不是照著重新登入
    case 'SESSION_IDLE':        return t('adm.err.idle', { n: detail || 60 });
    case 'FORBIDDEN':           return t('adm.err.forbidden');
    case 'PASSWORD_REQUIRED':   return t('adm.err.required');
    case 'PASSWORD_TOO_SHORT':  return t('adm.err.tooShort', { n: detail || 8 });
    case 'PASSWORD_SAME':       return t('adm.err.same');
    case 'OLD_PASSWORD_WRONG':  return t('adm.err.oldWrong');
    default:                    return t('err.server');
  }
}
