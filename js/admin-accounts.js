/**
 * admin-accounts.js — 帳號管理（只有超級管理者看得到）
 *
 * ⚠️ 這一頁把「不能做的動作」的按鈕變灰並附上原因，
 *    但那**只是體驗**。真正的把關在後端 gas/Admins.js——
 *    任何人都能繞過前端直接打 API，前端的判斷等同沒有判斷。
 */

let accounts = [];
let myAccount = '';


document.addEventListener('DOMContentLoaded', async function () {
  initLangSwitch();

  setApiRetryNotice(function () { showMsg(t('err.retrying'), 'info'); });

  document.getElementById('logoutBtn').addEventListener('click', function () { doLogout(); });
  document.getElementById('createForm').addEventListener('submit', onCreate);
  document.getElementById('toggleCreate').addEventListener('click', function () {
    const box = document.getElementById('createBox');
    box.hidden = !box.hidden;
    if (!box.hidden) document.getElementById('newAccount').focus();
  });

  const profile = await requireLogin();
  if (!profile) return;                       // requireLogin 已經在導頁了

  // 不是超管就不該待在這一頁。後端也會擋，這裡只是不要讓他看到空畫面
  if (!profile.is_super) {
    document.getElementById('content').hidden = true;
    showMsg(t('adm.err.forbidden'), 'error');
    return;
  }
  myAccount = profile.account || '';
  document.getElementById('content').hidden = false;
  renderPageNav('accounts');
  loadList();
});


/* ══════════════════ 讀取與繪製 ══════════════════ */

async function loadList() {
  const box = document.getElementById('list');
  box.innerHTML = '<div class="skeleton"><div class="bar"></div><div class="bar"></div></div>';
  try {
    const res = await apiAuth('manageAdmin', { op: 'list' }, true);   // 純讀取，可以重試
    if (!res || !res.ok) { showMsg(tAdminError(res), 'error'); box.innerHTML = ''; return; }
    accounts = res.data.items || [];
    myAccount = res.data.me || myAccount;
    render();
  } catch (err) {
    box.innerHTML = '';
    showMsg(connErr(err), 'error');
  }
}


function render() {
  const box = document.getElementById('list');
  // 超管排前面，停用的排後面
  const sorted = accounts.slice().sort(function (a, b) {
    if (a.active !== b.active) return a.active ? -1 : 1;
    if (a.role !== b.role) return a.role === 'SUPER' ? -1 : 1;
    return a.account < b.account ? -1 : 1;
  });
  box.innerHTML = sorted.map(card).join('');

  box.querySelectorAll('button[data-op]').forEach(function (btn) {
    btn.addEventListener('click', function () { onAction(btn.dataset.op, btn.dataset.account); });
  });
}


function card(a) {
  const activeSupers = accounts.filter(function (x) { return x.role === 'SUPER' && x.active; }).length;
  const isLastSuper = a.role === 'SUPER' && a.active && activeSupers <= 1;

  // 三條安全規則對應的「為什麼這顆按鈕不能按」
  const noSelf = a.is_me ? t('acc.guard.self') : '';
  const noLast = isLastSuper ? t('acc.guard.lastSuper') : '';
  const blockDisable = noSelf || noLast;

  const tags = [];
  tags.push('<span class="badge badge--role">' +
            esc(t(a.role === 'SUPER' ? 'adm.role.super' : 'adm.role.admin')) + '</span>');
  if (!a.active) tags.push('<span class="badge badge--cancelled">' + esc(t('acc.disabled')) + '</span>');
  if (a.locked_minutes > 0) {
    tags.push('<span class="badge badge--pending">' +
              esc(t('acc.locked', { n: a.locked_minutes })) + '</span>');
  }
  if (a.must_change_password) {
    tags.push('<span class="badge badge--postponed">' + esc(t('acc.pendingPw')) + '</span>');
  }

  const rows = [];
  if (a.email_notif) kv(rows, t('acc.emailNotif'), a.email_notif);
  kv(rows, t('acc.pwChanged'), a.password_changed_at || t('acc.never'));
  kv(rows, t('acc.lastLogin'), a.last_login_at || t('acc.never'));

  const acts = [];
  acts.push(btn('resetPassword', a.account, 'acc.act.reset', a.is_me ? t('acc.guard.resetSelf') : ''));
  acts.push(btn(a.active ? 'disable' : 'enable', a.account,
                a.active ? 'acc.act.disable' : 'acc.act.enable', a.active ? blockDisable : ''));
  acts.push(btn(a.role === 'SUPER' ? 'toAdmin' : 'toSuper', a.account,
                a.role === 'SUPER' ? 'acc.act.toAdmin' : 'acc.act.toSuper',
                a.role === 'SUPER' ? blockDisable : ''));
  if (a.locked_minutes > 0) acts.push(btn('unlock', a.account, 'acc.act.unlock', ''));
  acts.push(btn('remove', a.account, 'acc.act.remove', blockDisable, true));

  return '<article class="booking' + (a.active ? '' : ' booking--cancelled') + '">' +
         '<div class="booking-top"><span class="booking-date">' + esc(a.name) + '</span>' +
         tags.join('') + '</div>' +
         '<div class="booking-name">' + esc(a.account) + '</div>' +
         '<dl class="kv">' + rows.join('') + '</dl>' +
         '<div class="acts">' + acts.join('') + '</div></article>';
}

function kv(arr, label, value) {
  arr.push('<dt>' + esc(label) + '</dt><dd>' + esc(value) + '</dd>');
}

/** @param {string} why 有值就把按鈕變灰，並用 title 說明原因 */
function btn(op, account, labelKey, why, danger) {
  return '<button type="button" class="chip' + (danger ? ' chip--danger' : '') + '"' +
         ' data-op="' + esc(op) + '" data-account="' + esc(account) + '"' +
         (why ? ' disabled title="' + esc(why) + '"' : '') +
         '>' + esc(t(labelKey)) + '</button>';
}


/* ══════════════════ 動作 ══════════════════ */

async function onAction(op, account) {
  const a = accounts.filter(function (x) { return x.account === account; })[0];
  if (!a) return;

  const confirmKey = {
    resetPassword: 'acc.confirm.reset',
    disable: 'acc.confirm.disable',
    enable: null,
    toSuper: 'acc.confirm.toSuper',
    toAdmin: 'acc.confirm.toAdmin',
    unlock: null,
    remove: 'acc.confirm.remove'
  }[op];

  // ⚠️ 會影響別人登入狀態的動作都要二次確認。
  //    停用、改角色、重設密碼都會把對方手上的 token 作廢——他會當場被登出。
  if (confirmKey && !confirm(t(confirmKey, { name: a.name, account: a.account }))) return;

  const body = { op: op, account: account };
  if (op === 'disable') { body.op = 'setStatus'; body.active = false; }
  if (op === 'enable') { body.op = 'setStatus'; body.active = true; }
  if (op === 'toSuper') { body.op = 'setRole'; body.role = 'SUPER'; }
  if (op === 'toAdmin') { body.op = 'setRole'; body.role = 'ADMIN'; }

  showMsg(t('adm.working'), 'info');
  try {
    // ⚠️ 這些都**不是冪等的**，一律不重試。
    //    重設密碼重試會產生第二組密碼，而畫面上顯示的是第一組。
    const res = await apiAuth('manageAdmin', body, false);
    if (!res || !res.ok) { showMsg(tAccountError(res), 'error'); return; }

    if (res.data.initial_password) {
      showPassword(res.data.account, res.data.initial_password);
    } else {
      showMsg(t('acc.done'), 'ok');
    }
    loadList();
  } catch (err) {
    showMsg(connErr(err), 'error');
  }
}


async function onCreate(e) {
  e.preventDefault();
  const account = document.getElementById('newAccount').value.trim().toLowerCase();
  const name = document.getElementById('newName').value.trim();
  const role = document.getElementById('newRole').value;
  const emailNotif = document.getElementById('newEmailNotif').value.trim().toLowerCase();

  if (!account || !name) return showMsg(t('adm.err.required'), 'error');

  const btnEl = document.getElementById('createBtn');
  btnEl.disabled = true;
  btnEl.textContent = t('adm.working');
  try {
    const res = await apiAuth('manageAdmin',
      { op: 'create', account: account, name: name, role: role, email_notif: emailNotif }, false);
    if (!res || !res.ok) { showMsg(tAccountError(res), 'error'); return; }

    document.getElementById('createForm').reset();
    document.getElementById('createBox').hidden = true;
    showPassword(res.data.account, res.data.initial_password);
    loadList();
  } catch (err) {
    showMsg(connErr(err), 'error');
  } finally {
    btnEl.disabled = false;
    btnEl.textContent = t('acc.create.submit');
  }
}


/**
 * 顯示新密碼。
 *
 * ⚠️ 這組密碼**只會出現這一次**。Sheet 上存的是雜湊，單向不可逆——
 *    不是系統不給看，是連系統自己都算不回去。
 *    所以這個區塊要夠明顯，而且不會被下一個訊息蓋掉。
 */
function showPassword(account, password) {
  const box = document.getElementById('pwBox');
  document.getElementById('pwAccount').textContent = account;
  document.getElementById('pwValue').textContent = password;
  box.hidden = false;
  showMsg('', '');
  box.scrollIntoView({ behavior: 'smooth', block: 'center' });
}


/* ══════════════════ 小工具 ══════════════════ */

function showMsg(text, kind) {
  const el = document.getElementById('adminMsg');
  el.textContent = text || '';
  el.className = text ? ('msg msg--' + (kind || 'info')) : '';
  el.hidden = !text;
}

function connErr(err) {
  if (err && err.name === 'ApiConnectionError') {
    return err.message === 'TIMEOUT' ? t('err.timeout') : t('err.network');
  }
  return t('err.server');
}

function tAccountError(res) {
  const code = res && res.error;
  switch (code) {
    case 'FIELD_REQUIRED':      return t('adm.err.required');
    case 'ACCOUNT_INVALID':     return t('acc.err.badAccount');
    // v2.4 以前的舊代碼。後端已經不會再回它了，留著是為了部署空窗期——
    // 前端先上線、後端還沒 redeploy 的那幾分鐘，舊代碼還會回來
    case 'ACCOUNT_NOT_EMAIL':   return t('acc.err.badAccount');
    case 'EMAIL_NOT_VALID':     return t('acc.err.badEmail');
    case 'EMAIL_NOTIF_REQUIRED':return t('acc.err.notifReq');
    case 'ACCOUNT_EXISTS':      return t('acc.err.exists');
    case 'ACCOUNT_NOT_FOUND':   return t('acc.err.notFound');
    case 'CANNOT_DISABLE_SELF': return t('acc.guard.self');
    case 'CANNOT_DEMOTE_SELF':  return t('acc.guard.self');
    case 'CANNOT_RESET_SELF':   return t('acc.guard.resetSelf');
    case 'LAST_SUPER':          return t('acc.guard.lastSuper');
    case 'BUSY':                return t('acc.err.busy');
    default:                    return tAdminError(res);
  }
}

/** ⚠️ 所有進 innerHTML 的值都要過這一關（姓名、帳號都是人打進去的） */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
