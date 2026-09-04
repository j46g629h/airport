/**
 * query.js — 查詢頁
 *
 * 三種查法共用同一個結果區：email / 航班日期 / 航班號。
 *
 * ⚠️ 渲染函式一律包 try/catch、讀 API 回傳值一律防禦性存取（item.remark || ''）。
 *    前後端版本不一致時（使用者的瀏覽器快取了舊的 JS），
 *    這樣最多只是少顯示一段，不會整頁空白又沒有任何訊息——
 *    「畫面全白」是最難查的一種故障，因為主控台以外看不到任何線索。
 */

let currentMode = 'email';
let lastResult = null;      // 語言切換時要用原資料重畫，不必重打 API


/* ══════════════════ 初始化 ══════════════════ */

document.addEventListener('DOMContentLoaded', function () {
  initLangSwitch();

  // 連線層要重試時，把載入文字換掉。
  // 少了這行，使用者看到骨架卡住不動 25 秒，會以為當掉而重新整理——
  // 那反而讓他從頭再等一次。
  setApiRetryNotice(function () {
    const note = document.getElementById('loadingNote');
    if (note) note.textContent = t('err.retrying');
  });

  document.querySelectorAll('.tabs button').forEach(function (btn) {
    btn.addEventListener('click', function () { switchMode(btn.dataset.mode); });
  });

  document.getElementById('searchForm').addEventListener('submit', function (e) {
    e.preventDefault();
    doSearch();
  });

  // 日期欄位的確認文字
  const dateInput = document.getElementById('inputDate');
  dateInput.addEventListener('change', showPickedDate);
  dateInput.addEventListener('input', showPickedDate);

  // 上次查詢成功的信箱先填好，省得每次重打
  try {
    const last = localStorage.getItem(LS_EMAIL);
    if (last) document.getElementById('inputEmail').value = last;
  } catch (e) { /* 讀不到就空白，不影響功能 */ }

  // 網址帶 ?mode=date 之類的話直接切過去（首頁的第二個入口會用）
  const m = new URLSearchParams(location.search).get('mode');
  switchMode(m === 'date' || m === 'flight' ? m : 'email');
});


/** 語言切換後由 i18n.js 呼叫：把已經查到的結果用新語言重畫 */
function onLangChanged() {
  if (lastResult) renderResult(lastResult);
}


/**
 * 日期欄位下方的確認文字。
 *
 * ⚠️ <input type="date"> 的**顯示格式跟著看的人那台裝置的地區設定走**，
 *    HTML 和 CSS 都改不了：印尼的手機顯示 18/09/2026，美式設定的電腦顯示 09/18/2026。
 *    但送出去的值永遠是 YYYY-MM-DD（HTML 規格規定），所以查詢結果一定是對的，
 *    差別純粹在畫面上。
 *
 *    這一行由我們自己控制，一定是 dd/mm/yyyy——使用者就算看到輸入框上是
 *    美式順序，也能對照這一行確認自己選對了日子。
 */
function showPickedDate() {
  const el = document.getElementById('pickedDate');
  const v = document.getElementById('inputDate').value;      // 一律是 YYYY-MM-DD
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  el.textContent = m ? ('→ ' + m[3] + '/' + m[2] + '/' + m[1]) : '';
}


function switchMode(mode) {
  currentMode = mode;
  document.querySelectorAll('.tabs button').forEach(function (btn) {
    btn.setAttribute('aria-pressed', String(btn.dataset.mode === mode));
  });
  ['email', 'date', 'flight'].forEach(function (m) {
    document.getElementById('field-' + m).hidden = (m !== mode);
  });
  clearResult();
}


/* ══════════════════ 查詢 ══════════════════ */

async function doSearch() {
  const btn = document.getElementById('submitBtn');

  const EMAIL_MIN = 3;      // ⚠️ 要跟 gas/Query.js 的 EMAIL_MIN_CHARS 一致

  let promise, keyword;
  if (currentMode === 'email') {
    keyword = document.getElementById('inputEmail').value.trim();
    if (!keyword) return showError(t('err.emailReq'));
    // 前端先擋一次，省掉一趟 3~8 秒的 API。後端也會擋（前端擋不住惡意呼叫）
    if (keyword.length < EMAIL_MIN) return showError(t('err.emailShort', { n: EMAIL_MIN }));
    promise = Api.queryByEmail(keyword);
  } else if (currentMode === 'date') {
    keyword = document.getElementById('inputDate').value.trim();
    if (!keyword) return showError(t('err.dateReq'));
    promise = Api.queryByDate(keyword);          // <input type="date"> 送出 YYYY-MM-DD，後端兩種都吃
  } else {
    keyword = document.getElementById('inputFlight').value.trim();
    if (!keyword) return showError(t('err.flightReq'));
    promise = Api.queryByFlight(keyword);
  }

  btn.disabled = true;
  btn.textContent = t('query.searching');
  showSkeleton();

  try {
    const res = await promise;
    if (!res || !res.ok) {
      // 後端回的是代碼不是句子，翻譯在這裡做（見 js/i18n.js 的 tError）
      showError(tError(res && res.error, res && res.message));
      return;
    }
    lastResult = res.data;
    renderResult(res.data);

    // ⚠️ 只存「查得到資料」的那一次，而且只留一筆。
    //    存了查無資料的，等資料補上之後他還要看到舊的空白結果；
    //    留多筆的話，借手機給同事用會把別人的信箱累積在這台裝置上。
    if (currentMode === 'email' && res.data.total > 0) {
      try { localStorage.setItem(LS_EMAIL, keyword); } catch (e) { /* 存不進去只是下次要重打 */ }
    }
  } catch (err) {
    if (err && err.name === 'ApiConnectionError') {
      showError(err.message === 'TIMEOUT' ? t('err.timeout') : t('err.network'));
    } else {
      showError(t('err.server'));
    }
  } finally {
    btn.disabled = false;
    btn.textContent = t('query.submit');
  }
}


/* ══════════════════ 畫面 ══════════════════ */

function resultBox() { return document.getElementById('result'); }

function clearResult() {
  lastResult = null;
  resultBox().innerHTML = '';
}

function showSkeleton() {
  resultBox().innerHTML =
    '<div class="skeleton"><div class="bar"></div><div class="bar"></div><div class="bar"></div></div>' +
    '<p class="loading-note" id="loadingNote">' + esc(t('query.searching')) + '</p>';
}

function showError(msg) {
  lastResult = null;
  resultBox().innerHTML = '<div class="msg msg--error">' + esc(msg) + '</div>';
}


function renderResult(data) {
  try {
    const items = (data && data.items) || [];
    const box = resultBox();

    if (!items.length) {
      // 查過去的日期一定是 0 筆。這時候講「查不到資料」會讓人以為系統壞了，
      // 要直接說「那一天已經過去了」——訊息要對得上他實際遇到的事。
      var hint = data.past ? t('result.past')
               : (data.mode === 'email' ? t('result.emailHint') : '');
      box.innerHTML =
        '<div class="msg msg--empty"><p>' + esc(t('result.empty')) + '</p>' +
        (hint ? '<p>' + esc(hint) + '</p>' : '') +
        '</div>';
      return;
    }

    box.innerHTML =
      '<div class="result-head"><h2>' + esc(t('result.title')) + '</h2>' +
      '<span class="count">' + esc(t('result.count', { n: items.length })) + '</span></div>' +
      items.map(bookingCard).join('') +
      '<p class="loading-note">' + esc(t('result.range')) + '</p>';
  } catch (err) {
    // 這裡出錯只會少顯示結果，不要讓整頁變白
    showError(t('err.server'));
    if (window.console) console.error('renderResult 失敗', err);
  }
}


function bookingCard(it) {
  const arah = it.arah || '';
  const status = it.status || 'SCHEDULED';
  /* 兩種狀態要把日期藏起來（v2.9）：
       PENDING    待改期——要改期，新日期還沒定
       INCOMPLETE 待定——資訊不完整，畫面上那個日期只是暫定的
     ⚠️ 後端已經把日期清空了（gas/Query.js），這裡只是決定改顯示哪一句。
        兩層都要做：後端不清的話，關掉 JavaScript 直接看 API 回應就露出來了。 */
  const isPending = (status === 'PENDING');
  const isIncomplete = (status === 'INCOMPLETE');

  const cls = ['booking'];
  cls.push(arah === 'PICKUP' ? 'booking--pickup' : 'booking--dropoff');
  if (status === 'CANCELLED') cls.push('booking--cancelled');

  // 標題列：日期 + 接/送 + 狀態徽章
  let head = '<div class="booking-top">';
  head += '<span class="booking-date">' +
          esc(isIncomplete ? t('f.incomplete')
              : (isPending ? t('f.pending') : (it.tanggal || ''))) + '</span>';
  head += '<span class="booking-arah ' + (arah === 'PICKUP' ? 'arah--pickup' : 'arah--dropoff') + '">' +
          esc(t('arah.' + arah)) + '</span>';
  /* 狀態一律顯示，**包含「已排定」**（v2.9.2，使用者要求）。
   *
   * 先前「已排定」是刻意不顯示的（想法是：預設值，畫出來只是噪音）。
   * 但那個想法把使用者的處境想錯了——他打開這一頁是要確認
   * 「我的車安排好了沒有」，而**沒有徽章不等於沒問題，只等於沒有訊息**。
   * 一顆綠色的「已排定」是一句明確的回答：資訊齊了，照這個時間出來就好。
   *
   * ⚠️ 這顆徽章等於系統對使用者承諾「資訊都備齊了」，
   *    所以資料健檢加了一條「已排定卻沒有出廠時間」的檢查（gas/Health.js），
   *    讓管理者在使用者照著一個空的時間出來等車之前先看到。 */
  head += '<span class="badge badge--' + status.toLowerCase() + '">' +
          esc(t('status.' + status)) + '</span>';
  head += '</div>';

  const name = '<div class="booking-name">' + esc(it.name || '') +
               (it.nama_cina ? ' <span class="cn">' + esc(it.nama_cina) + '</span>' : '') +
               '</div>';

  // 欄位。空的一律不顯示——留一排「—」只是噪音
  const rows = [];
  /* ⚠️ 「原訂 …」看的是 W 欄有沒有值，**不看狀態**（v2.9）。
     「已改期」這個狀態退役了，改期的事實由 W 欄表達——
     綁在狀態上的話，搬遷之後那些改過期的資料就再也不會顯示原訂日期。 */
  if (it.tanggal_asal) row(rows, t('f.asal'), it.tanggal_asal);
  if (it.pickup)       row(rows, t('f.pickup'), it.pickup, true);
  else if (it.dari_pci) row(rows, t('f.pickup'), it.dari_pci, true);
  if (it.titik_jemput) row(rows, t('f.titik'), it.titik_jemput);
  if (it.flight)       row(rows, t('f.flight'), it.flight + (it.etd_eta ? '　' + it.etd_eta : ''));
  else if (it.etd_eta) row(rows, t('f.etd'), it.etd_eta);
  if (it.dorm)         row(rows, t('f.dorm'), it.dorm);
  if (it.dept)         row(rows, t('f.dept'), it.dept);
  if (it.hp)           row(rows, t('f.hp'), it.hp);
  if (it.email)        row(rows, t('f.email'), it.email);
  if (it.bagasi)       row(rows, t('f.bagasi'), it.bagasi);

  // 派車：介面已經備好，只是目前資料是空的所以整塊不會出現。
  // 日後管理者開始填車號，這一塊就自動長出來，前端不必再改。
  let vehicle = '';
  const vrows = [];
  if (it.kendaraan) row(vrows, t('f.kendaraan'), it.kendaraan, true);
  if (it.sopir)     row(vrows, t('f.sopir'), it.sopir);
  if (it.hp_sopir)  row(vrows, t('f.hpSopir'), it.hp_sopir);
  if (vrows.length) vehicle = '<div class="booking-vehicle"><dl class="kv">' + vrows.join('') + '</dl></div>';

  let notes = '';
  if (it.remark)     notes += '<div class="booking-note">' + esc(t('f.remark')) + esc(colon()) + esc(it.remark) + '</div>';
  if (it.permintaan) notes += '<div class="booking-note">' + esc(t('f.permintaan')) + esc(colon()) + esc(it.permintaan) + '</div>';

  return '<article class="' + cls.join(' ') + '">' + head + name +
         (rows.length ? '<dl class="kv">' + rows.join('') + '</dl>' : '') +
         vehicle + notes + '</article>';
}


function row(arr, label, value, big) {
  arr.push('<dt>' + esc(label) + '</dt><dd' + (big ? ' class="big"' : '') + '>' + esc(value) + '</dd>');
}


/** ⚠️ 所有進到 innerHTML 的值都要過這一關。
    姓名、備註是人打進 Sheet 的，裡面有 < 或 & 會把版面弄壞。 */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
