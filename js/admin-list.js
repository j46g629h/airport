/**
 * admin-list.js — 班表列表與篩選（階段 2c，唯讀）
 *
 * ══ 篩選分兩層 ═══════════════════════════════════════════
 *
 * 第一層：**日期區間** → 打後端 API。它決定要讀多少資料，一趟 3~8 秒。
 * 第二層：其餘全部 → 在瀏覽器裡做，打字就即時反應，一次 API 都不打。
 *
 * 全部都送後端的話，管理者調一次條件等五秒——他會改回去直接開 Google 試算表。
 *
 * ══ 為什麼不快取查詢結果 ═════════════════════════════════
 *
 * `_INDEX` 每 5 分鐘才重建一次，本來就有落差了。前端再壓一層快取，
 * 管理者剛在 Sheet 上改完、回來按重新整理還是看到舊的，他會判定「系統壞了」。
 *
 * 所以**只把篩選條件存起來**（重新整理後條件還在），資料一律重抓，
 * 並且在畫面下方明講「資料更新於幾點」與那 5 分鐘的落差。
 *
 * ⚠️ 條件存 sessionStorage 不存 localStorage：裡面可能有人名或信箱關鍵字，
 *    而這是工廠的共用電腦（設計約定第 8 條）。
 */

/** 一次畫幾筆。⚠️ 上限不是為了後端，是為了工廠配的中低階手機——
    幾百個 <tr> 一次塞進 DOM 會卡到看起來像當機。 */
const LIST_PAGE_SIZE = 50;

/** 篩選條件存這裡（sessionStorage，關掉分頁就沒了） */
const SS_FILTER = 'airport.admin.listFilter';

/** 後端回來的原始資料。語言切換與即時篩選都重用它，不重打 API。 */
let allItems = [];
let viewItems = [];          // 套完篩選與排序之後的
let shownCount = 0;          // 目前畫了幾筆
let meta = {};               // total / truncated / index_built_at …
let openDetails = {};        // 哪幾筆的「詳細」是展開的（重畫後要還原）

/**
 * 還原篩選條件時，廠別／部門／上車地點三個下拉的選項還沒建好
 * （選項是從資料萃取的，要等 API 回來）。先記在這裡，
 * buildSelectOptions() 建完選項再套上去。
 */
let pendingSelects = null;


/* ══════════════════ 初始化 ══════════════════ */

document.addEventListener('DOMContentLoaded', async function () {
  initLangSwitch();

  setApiRetryNotice(function () { showMsg(t('err.retrying'), 'info'); });

  wireEvents();

  const profile = await requireLogin();
  if (!profile) return;                       // requireLogin 已經在導頁了

  document.getElementById('content').hidden = false;

  // 存過條件就照他上次的，沒有就給預設區間（今天起未來 14 天）
  if (!restoreFilters()) setQuickRange('next14');
  syncPickedDates();

  loadData();
});


function wireEvents() {
  document.getElementById('searchBtn').addEventListener('click', loadData);
  document.getElementById('reloadBtn').addEventListener('click', loadData);
  document.getElementById('resetBtn').addEventListener('click', resetFilters);

  // 日期欄位下方那一行確認文字（一定是 dd/mm/yyyy，由我們控制）
  ['fFrom', 'fTo'].forEach(function (id) {
    const el = document.getElementById(id);
    el.addEventListener('change', syncPickedDates);
    el.addEventListener('input', syncPickedDates);
  });

  document.querySelectorAll('#quickRange button').forEach(function (btn) {
    btn.addEventListener('click', function () {
      setQuickRange(btn.dataset.range);
      syncPickedDates();
      loadData();
    });
  });

  // 接／送：單選
  document.querySelectorAll('#fArah button').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('#fArah button').forEach(function (b) {
        b.setAttribute('aria-pressed', String(b === btn));
      });
      onFilterChanged();
    });
  });

  // 狀態：可複選。按「全部」把其餘清掉；按任一個狀態就取消「全部」
  document.querySelectorAll('#fStatus button').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const all = document.querySelector('#fStatus button[data-val=""]');
      if (btn === all) {
        document.querySelectorAll('#fStatus button').forEach(function (b) {
          b.setAttribute('aria-pressed', String(b === all));
        });
      } else {
        btn.setAttribute('aria-pressed', String(btn.getAttribute('aria-pressed') !== 'true'));
        const anyOn = [...document.querySelectorAll('#fStatus button[data-val]:not([data-val=""])')]
          .some(function (b) { return b.getAttribute('aria-pressed') === 'true'; });
        all.setAttribute('aria-pressed', String(!anyOn));
      }
      onFilterChanged();
    });
  });

  ['fKeyword', 'fFlight'].forEach(function (id) {
    document.getElementById(id).addEventListener('input', onFilterChanged);
  });
  ['fFactory', 'fDept', 'fTitik', 'fSort'].forEach(function (id) {
    document.getElementById(id).addEventListener('change', onFilterChanged);
  });
  document.getElementById('fNeed').addEventListener('change', onFilterChanged);

  document.getElementById('toggleMore').addEventListener('click', function () {
    const box = document.getElementById('moreBox');
    box.hidden = !box.hidden;
  });
}


/** 語言切換後由 i18n.js 呼叫：用手上的資料重畫，不必重打 API */
function onLangChanged() {
  if (!allItems.length && !meta.now) return;
  buildSelectOptions();
  applyFilters();
}


/* ══════════════════ 日期區間 ══════════════════ */

/**
 * 「今天」——以**雅加達**為準，不是看的人那台裝置。
 *
 * ⚠️ 台灣的手機比雅加達快一小時：台北時間 00:30 時，雅加達還在前一天 23:30。
 *    直接用裝置的日期，那一個小時裡按「本週」會整段位移一天，
 *    而且畫面上完全看不出哪裡不對。
 *
 * 印尼西部時間固定 UTC+7 且**沒有日光節約時間**，所以直接位移就是準的。
 */
function todayJakarta() {
  const now = new Date();
  const shift = (7 * 60 + now.getTimezoneOffset()) * 60000;
  return new Date(now.getTime() + shift);
}

/** Date → 'YYYY-MM-DD'（<input type="date"> 只吃這個格式，HTML 規格規定） */
function isoOf(d) {
  return d.getFullYear() + '-' +
         String(d.getMonth() + 1).padStart(2, '0') + '-' +
         String(d.getDate()).padStart(2, '0');
}

function addDays(d, n) {
  const x = new Date(d.getTime());
  x.setDate(x.getDate() + n);
  return x;
}

/**
 * 快捷區間。
 * ⚠️ 「本週」是**週二～週一**，跟 Google Sheet 的週分頁同一個切法
 *    （gas/Config.js 的 WEEK_START_DOW = 2，沿用 airport.xls 的慣例）。
 *    這裡切成週日起算的話，管理者拿畫面對照 Sheet 分頁會發現兩邊差一天。
 */
function setQuickRange(kind) {
  const today = todayJakarta();
  let from = '', to = '';

  if (kind === 'week') {
    const offset = (today.getDay() - 2 + 7) % 7;       // 2 = 星期二
    const start = addDays(today, -offset);
    from = isoOf(start);
    to   = isoOf(addDays(start, 6));
  } else if (kind === 'next14') {
    from = isoOf(today);
    to   = isoOf(addDays(today, 13));
  } else if (kind === 'month') {
    from = isoOf(new Date(today.getFullYear(), today.getMonth(), 1));
    to   = isoOf(new Date(today.getFullYear(), today.getMonth() + 1, 0));
  } else if (kind === 'past30') {
    from = isoOf(addDays(today, -30));
    to   = isoOf(today);
  }
  // kind === 'all' → 兩邊留空＝不限

  document.getElementById('fFrom').value = from;
  document.getElementById('fTo').value = to;
}


/**
 * 日期欄位下方的確認文字。
 * ⚠️ <input type="date"> 的顯示順序跟著裝置地區設定走，HTML 和 CSS 都改不了：
 *    印尼手機顯示 18/09/2026、美式設定的電腦顯示 09/18/2026。
 *    送出的值永遠是 YYYY-MM-DD，所以查詢一定是對的，差別純粹在畫面上——
 *    這一行由我們控制，一律 dd/mm/yyyy。
 */
function syncPickedDates() {
  [['fFrom', 'pickedFrom'], ['fTo', 'pickedTo']].forEach(function (pair) {
    const v = document.getElementById(pair[0]).value;
    const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    document.getElementById(pair[1]).textContent = m ? ('→ ' + m[3] + '/' + m[2] + '/' + m[1]) : '';
  });
}


/* ══════════════════ 讀取 ══════════════════ */

async function loadData() {
  const from = document.getElementById('fFrom').value.trim();
  const to   = document.getElementById('fTo').value.trim();

  // 前端先擋一次，省掉一趟 3~8 秒的 API（後端也會擋）
  if (from && to && from > to) return showMsg(t('err.dateRange'), 'error');

  const btn = document.getElementById('searchBtn');
  btn.disabled = true;
  showMsg('', '');
  showSkeleton();

  try {
    // 純讀取，重複做不會出事 → 可以開自動重試
    const res = await apiAuth('listBookings', { from: from, to: to }, true);
    if (!res || !res.ok) {
      resultBox().innerHTML = '';
      showMsg(tListError(res), 'error');
      return;
    }
    allItems = res.data.items || [];
    meta = res.data;
    openDetails = {};                    // 換一批資料，展開狀態不再對得上
    saveFilters();
    buildSelectOptions();
    applyFilters();

    // 截斷警告要顯眼，不能混在灰色小字裡——他必須知道自己看到的不是全部。
    // ⚠️ 放在這裡而不是 render()：render() 每動一次篩選就跑一次，
    //    警告會一直把其他訊息蓋掉，而資料有沒有被截斷跟篩選無關
    if (meta.truncated) {
      showMsg(t('list.truncated', { n: meta.limit, total: meta.matched }), 'info');
    }
  } catch (err) {
    resultBox().innerHTML = '';
    showMsg(connErr(err), 'error');
  } finally {
    btn.disabled = false;
  }
}


/**
 * 廠別／部門／上車地點的下拉選項，直接從這批資料裡萃取。
 *
 * ⚠️ 刻意不去讀 PENGATURAN 分頁：那要多一趟 API，而且會列出這個區間裡
 *    根本沒有資料的選項——選了之後畫面一片空白，看起來像壞掉。
 *    從資料萃取的話，選單上出現的每一個選項都一定篩得到東西。
 */
function buildSelectOptions() {
  fillSelect('fFactory', distinctOf('factory'));
  fillSelect('fDept',    distinctOf('dept'));
  fillSelect('fTitik',   distinctOf('titik_jemput'));

  // 上次存下來的選擇，等選項建好才套得上去。
  // ⚠️ 套完就清掉，不然之後每次重畫（例如切語言）都會把使用者當下的選擇拉回舊值
  if (pendingSelects) {
    Object.keys(pendingSelects).forEach(function (id) {
      const el = document.getElementById(id);
      const want = pendingSelects[id];
      // 那個值在這批資料裡不存在的話就維持「全部」——
      // 硬設一個選項清單裡沒有的值，select 會顯示空白，看起來像壞掉
      if (want && [...el.options].some(function (o) { return o.value === want; })) el.value = want;
    });
    pendingSelects = null;
  }
}

function distinctOf(key) {
  const seen = {};
  allItems.forEach(function (it) {
    const v = (it[key] || '').trim();
    if (v) seen[v] = true;
  });
  return Object.keys(seen).sort();
}

function fillSelect(id, values) {
  const el = document.getElementById(id);
  const keep = el.value;                       // 重畫（例如切語言）後要保住原本的選擇
  el.innerHTML = '<option value="">' + esc(t('list.all')) + '</option>' +
    values.map(function (v) {
      return '<option value="' + esc(v) + '">' + esc(v) + '</option>';
    }).join('');
  if (keep && values.indexOf(keep) >= 0) el.value = keep;
}


/* ══════════════════ 即時篩選與排序 ══════════════════ */

function onFilterChanged() {
  saveFilters();
  applyFilters();
}

function currentArah() {
  const on = document.querySelector('#fArah button[aria-pressed="true"]');
  return on ? (on.dataset.val || '') : '';
}

function currentStatuses() {
  return [...document.querySelectorAll('#fStatus button[aria-pressed="true"]')]
    .map(function (b) { return b.dataset.val || ''; })
    .filter(function (v) { return v; });        // 空的那顆是「全部」
}


function applyFilters() {
  const kw     = document.getElementById('fKeyword').value.trim().toLowerCase();
  const flight = document.getElementById('fFlight').value.replace(/\s+/g, '').toUpperCase();
  const arah   = currentArah();
  const stats  = currentStatuses();
  const fac    = document.getElementById('fFactory').value;
  const dept   = document.getElementById('fDept').value;
  const titik  = document.getElementById('fTitik').value;
  const needOnly = document.getElementById('fNeed').checked;

  viewItems = allItems.filter(function (it) {
    if (arah && it.arah !== arah) return false;
    if (stats.length && stats.indexOf(it.status) < 0) return false;
    if (fac && it.factory !== fac) return false;
    if (dept && it.dept !== dept) return false;
    if (titik && it.titik_jemput !== titik) return false;
    // 航班號部分比對：打 CI 就跳出所有 CI 開頭的
    if (flight && String(it.flight || '').replace(/\s+/g, '').toUpperCase().indexOf(flight) < 0) return false;
    // 「有未處理的需求」＝ T 欄有值。處理完的做法是把它併進 REMARK 再清空（2d）
    if (needOnly && !String(it.permintaan || '').trim()) return false;

    if (kw) {
      // 姓名、中文名、信箱、聯絡人信箱、房號一起比。
      // 管理者記得的可能是任何一個，逼他選欄位只是多一個步驟
      const hay = [it.name, it.nama_cina, it.email, it.email_kontak, it.dorm]
        .map(function (v) { return String(v || '').toLowerCase(); }).join(' ');
      if (hay.indexOf(kw) < 0) return false;
    }
    return true;
  });

  sortView(document.getElementById('fSort').value);
  shownCount = 0;
  render();
}


/**
 * ⚠️ 排序一律用後端給的 *_iso / *_sort 字串（字串比大小＝比時間），
 *    不可以 new Date()——那會用看的人那台裝置的時區重算。
 *    解析不出來的排到最後，不是排到最前面（空字串在字串比較裡最小，要特別處理）。
 */
function sortView(mode) {
  // ⚠️ 同一天之內，沒有出車時間的排**最後**不是最前面
  //    （空字串在字串比較裡最小，直接比會把「時間不明」的那幾筆頂到當天最上面）。
  //    要跟後端 gas/AdminList.js 的 comparePickup_() 同一套規則，
  //    不然「重新整理」跟「換排序再換回來」會得到不同的順序。
  const byDate = function (a, b) {
    if (a.tanggal_iso !== b.tanggal_iso) return a.tanggal_iso < b.tanggal_iso ? -1 : 1;
    const x = a.pickup_iso || '', y = b.pickup_iso || '';
    if (!x && !y) return 0;
    if (!x) return 1;
    if (!y) return -1;
    return x < y ? -1 : (x > y ? 1 : 0);
  };

  if (mode === 'name') {
    viewItems.sort(function (a, b) {
      const x = String(a.name || '').toLowerCase(), y = String(b.name || '').toLowerCase();
      if (x !== y) return x < y ? -1 : 1;
      return byDate(a, b);
    });
  } else if (mode === 'flight') {
    viewItems.sort(function (a, b) {
      const x = String(a.flight || ''), y = String(b.flight || '');
      if (x !== y) return x < y ? -1 : 1;
      return byDate(a, b);
    });
  } else if (mode === 'updated') {
    // 最近改過的排最上面。沒有更新紀錄的（手動貼進去的舊資料）排最後
    viewItems.sort(function (a, b) {
      const x = a.updated_sort || '', y = b.updated_sort || '';
      if (x !== y) {
        if (!x) return 1;
        if (!y) return -1;
        return x < y ? 1 : -1;
      }
      return byDate(a, b);
    });
  } else {
    viewItems.sort(byDate);
  }
}


/* ══════════════════ 畫面 ══════════════════ */

function resultBox() { return document.getElementById('result'); }

function showSkeleton() {
  resultBox().innerHTML =
    '<div class="skeleton"><div class="bar"></div><div class="bar"></div><div class="bar"></div></div>';
  document.getElementById('statLine').textContent = '';
}


function render() {
  try {
    renderStatLine();
    renderFreshLine();

    const box = resultBox();
    if (!viewItems.length) {
      const hint = allItems.length ? t('list.emptyHint') : t('list.emptyRange');
      box.innerHTML = '<div class="msg msg--empty"><p>' + esc(t('list.empty')) + '</p>' +
                      '<p>' + esc(hint) + '</p></div>';
      return;
    }

    shownCount = Math.min(viewItems.length, shownCount || LIST_PAGE_SIZE);
    const rows = viewItems.slice(0, shownCount).map(rowHtml).join('');

    const left = viewItems.length - shownCount;
    const more = left > 0
      ? '<button type="button" class="btn btn--quiet" id="moreBtn">' +
        esc(t('list.showMore', { n: Math.min(left, LIST_PAGE_SIZE) })) + '</button>'
      : '';

    box.innerHTML =
      '<div class="tablewrap"><table class="dtable"><thead><tr>' +
        th('th.date') + th('th.arah') + th('th.name') + th('th.flight') +
        th('th.pickup') + th('th.titik') + th('th.status') + th('th.detail') +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>' + more;

    box.querySelectorAll('button[data-detail]').forEach(function (btn) {
      btn.addEventListener('click', function () { toggleDetail(btn.dataset.detail); });
    });
    const moreBtn = document.getElementById('moreBtn');
    if (moreBtn) {
      moreBtn.addEventListener('click', function () {
        shownCount += LIST_PAGE_SIZE;
        render();
      });
    }
  } catch (err) {
    // 這裡出錯只會少顯示列表，不要讓整頁變白（那是最難查的一種故障）
    resultBox().innerHTML = '';
    showMsg(t('err.server'), 'error');
    if (window.console) console.error('render 失敗', err);
  }
}

function th(key) { return '<th>' + esc(t(key)) + '</th>'; }


function renderStatLine() {
  const pick = viewItems.filter(function (i) { return i.arah === 'PICKUP'; }).length;
  const drop = viewItems.filter(function (i) { return i.arah === 'DROPOFF'; }).length;
  document.getElementById('statLine').textContent =
    t('list.countOf', { n: viewItems.length, total: allItems.length }) +
    '　' + t('list.stat', { a: pick, b: drop });
}


/**
 * 資料新鮮度那一行。
 * ⚠️ 這一行不是裝飾。_INDEX 每 5 分鐘才重建，管理者剛在 Sheet 上改完
 *    回來一看沒變，第一個念頭一定是「app 壞了」——講清楚就不會有這通電話。
 */
function renderFreshLine() {
  const el = document.getElementById('freshLine');
  const lines = [];
  if (meta.index_built_at) lines.push(t('list.fresh', { t: meta.index_built_at }));
  lines.push(t('list.lag'));
  el.textContent = lines.join('　');
}


function rowHtml(it) {
  const id = it.id || (it.sheet_name + '#' + it.row_num);
  const arah = it.arah || '';
  const status = it.status || 'SCHEDULED';

  const cls = ['drow'];
  cls.push(arah === 'PICKUP' ? 'drow--pickup' : 'drow--dropoff');
  if (status === 'CANCELLED') cls.push('drow--cancelled');

  const arahTag = '<span class="booking-arah ' +
    (arah === 'PICKUP' ? 'arah--pickup' : 'arah--dropoff') + '">' +
    esc(t('arah.' + arah)) + '</span>';

  let statusTag = '<span class="badge badge--' + status.toLowerCase() + '">' +
                  esc(t('status.' + status)) + '</span>';
  // 畫面算出來的狀態跟 Sheet 上存的不一樣時要標出來（例如飛機飛走了但 Sheet 還寫已排定）。
  // 不標的話，管理者對照 Sheet 會以為其中一邊是錯的
  if (it.status_raw && it.status_raw !== status) {
    statusTag += '<span class="subtle">' +
                 esc(t('list.sheetRaw', { s: t('status.' + it.status_raw) })) + '</span>';
  }

  const name = esc(it.name || '') +
    (it.nama_cina ? ' <span class="cn">' + esc(it.nama_cina) + '</span>' : '') +
    (String(it.permintaan || '').trim()
      ? ' <span class="badge badge--pending">' + esc(t('list.hasReq')) + '</span>' : '');

  const flight = esc(it.flight || '') + (it.etd_eta ? ' <span class="subtle">' + esc(it.etd_eta) + '</span>' : '');

  // 出廠時間的顯示規則跟 Sheet 上那一欄一樣（CLAUDE.md 設計約定第 3 條）：
  //   航班當天出車 → 只寫時間      跨天出車 → 連日期一起寫
  //
  // ⚠️ 同一天還印一次完整日期是有害的：左邊「日期」那一欄已經有了，
  //    重複的日期會把欄寬吃掉，更糟的是**凌晨航班那幾筆就不顯眼了**——
  //    而「表上是隔天、車子前一天晚上就要出發」正是這個表最需要一眼看出來的事。
  //
  // 這裡只做字串切割，不碰 new Date()（那會用看的人那台裝置的時區重算）
  let pickup;
  if (it.pickup_iso && it.tanggal_iso) {
    pickup = (it.pickup_iso.slice(0, 10) === it.tanggal_iso)
      ? it.pickup_iso.slice(11)        // 'YYYY-MM-DDTHH:mm' → 'HH:mm'
      : (it.pickup || '');             // 'dd/mm/yyyy HH:mm'
  } else {
    pickup = it.dari_pci || '';        // 後端看不懂那格寫什麼，原樣顯示讓管理者自己判斷
  }

  const open = !!openDetails[id];
  const summary =
    '<tr class="' + cls.join(' ') + '">' +
    td('th.date', esc(it.tanggal || '') +
       (it.tanggal_asal ? '<span class="subtle">' + esc(t('f.asal')) + ' ' + esc(it.tanggal_asal) + '</span>' : '')) +
    td('th.arah', arahTag) +
    td('th.name', name) +
    td('th.flight', flight) +
    td('th.pickup', esc(pickup)) +
    td('th.titik', esc(it.titik_jemput || '')) +
    td('th.status', statusTag) +
    '<td data-label="" class="cell-act">' +
      '<button type="button" class="chip" data-detail="' + esc(id) + '">' +
      esc(open ? t('list.close') : t('list.detail')) + '</button>' +
    '</td></tr>';

  return summary + detailRowHtml(it, id, open);
}

function td(labelKey, html) {
  return '<td data-label="' + esc(t(labelKey)) + '">' + html + '</td>';
}


function detailRowHtml(it, id, open) {
  const rows = [];
  kv(rows, t('f.factory'), it.factory);
  kv(rows, t('f.dept'), it.dept);
  kv(rows, t('f.dorm'), it.dorm);
  kv(rows, t('f.hp'), it.hp);
  kv(rows, t('f.email'), it.email);
  kv(rows, t('f.emailKontak'), it.email_kontak);
  kv(rows, t('f.etd'), it.etd_eta);
  kv(rows, t('f.bagasi'), it.bagasi);
  kv(rows, t('f.custom'), it.custom);
  kv(rows, t('f.povs'), it.povs);
  kv(rows, t('f.group'), it.group_id);
  kv(rows, t('f.remark'), it.remark);
  kv(rows, t('f.permintaan'), it.permintaan);
  // 派車：介面還沒做，資料先接上——管理者開始在 Sheet 上填車號，這幾行就自己長出來
  kv(rows, t('f.kendaraan'), it.kendaraan);
  kv(rows, t('f.sopir'), it.sopir);
  kv(rows, t('f.hpSopir'), it.hp_sopir);
  kv(rows, t('f.updated'), it.updated_at);
  kv(rows, t('f.booking'), it.id);
  kv(rows, t('f.sheet'), it.sheet_name ? (it.sheet_name + '　' + it.row_num) : '');

  return '<tr class="drow-detail" data-for="' + esc(id) + '"' + (open ? '' : ' hidden') + '>' +
         '<td colspan="8"><dl class="kv">' + rows.join('') + '</dl></td></tr>';
}

/** 空欄位一律不顯示——留一排「—」只是噪音，會把真正有值的那幾行淹掉 */
function kv(arr, label, value) {
  const v = String(value == null ? '' : value).trim();
  if (!v) return;
  arr.push('<dt>' + esc(label) + '</dt><dd>' + esc(v) + '</dd>');
}


function toggleDetail(id) {
  const row = document.querySelector('.drow-detail[data-for="' + cssEscape(id) + '"]');
  if (!row) return;
  row.hidden = !row.hidden;
  openDetails[id] = !row.hidden;

  const btn = document.querySelector('button[data-detail="' + cssEscape(id) + '"]');
  if (btn) btn.textContent = row.hidden ? t('list.detail') : t('list.close');
}

/** booking_id 只會是 AP2609001 這種格式，但屬性選擇器還是要跳脫引號才安全 */
function cssEscape(s) {
  return String(s == null ? '' : s).replace(/["\\]/g, '\\$&');
}


/* ══════════════════ 篩選條件的保存 ══════════════════ */

/** ⚠️ sessionStorage 在無痕視窗、空間滿了、關掉網站資料時都會丟例外，一律包起來 */
function saveFilters() {
  try {
    sessionStorage.setItem(SS_FILTER, JSON.stringify({
      from:    document.getElementById('fFrom').value,
      to:      document.getElementById('fTo').value,
      keyword: document.getElementById('fKeyword').value,
      flight:  document.getElementById('fFlight').value,
      arah:    currentArah(),
      status:  currentStatuses(),
      factory: document.getElementById('fFactory').value,
      dept:    document.getElementById('fDept').value,
      titik:   document.getElementById('fTitik').value,
      need:    document.getElementById('fNeed').checked,
      sort:    document.getElementById('fSort').value
    }));
  } catch (e) { /* 存不進去只是重新整理後條件要重設，不影響當下操作 */ }
}

/** @return {boolean} 有沒有還原成功（沒有的話呼叫端要給預設區間） */
function restoreFilters() {
  let f;
  try {
    f = JSON.parse(sessionStorage.getItem(SS_FILTER) || 'null');
  } catch (e) { return false; }
  if (!f || typeof f !== 'object') return false;

  try {
    document.getElementById('fFrom').value = f.from || '';
    document.getElementById('fTo').value = f.to || '';
    document.getElementById('fKeyword').value = f.keyword || '';
    document.getElementById('fFlight').value = f.flight || '';
    document.getElementById('fNeed').checked = !!f.need;
    if (f.sort) document.getElementById('fSort').value = f.sort;

    document.querySelectorAll('#fArah button').forEach(function (b) {
      b.setAttribute('aria-pressed', String((b.dataset.val || '') === (f.arah || '')));
    });

    const on = Array.isArray(f.status) ? f.status : [];
    document.querySelectorAll('#fStatus button').forEach(function (b) {
      const v = b.dataset.val || '';
      b.setAttribute('aria-pressed', String(v ? on.indexOf(v) >= 0 : on.length === 0));
    });

    // 廠別／部門／上車地點的選項還沒建（要等資料回來），先記著
    pendingSelects = { fFactory: f.factory || '', fDept: f.dept || '', fTitik: f.titik || '' };

    // 「更多篩選」裡有設定過的話就自動展開，不然他會找不到自己上次設了什麼
    if (f.flight || f.factory || f.dept || f.titik || f.need) {
      document.getElementById('moreBox').hidden = false;
    }
  } catch (e) { return false; }

  // ⚠️ 讀得到就算還原成功，即使日期兩邊都是空的——
  //    那是「全部」這個選項的正常長相，不是沒存過。
  //    在這裡判斷成「沒存過」的話，選了全部的人重新整理就會被打回未來 14 天。
  return true;
}


function resetFilters() {
  document.getElementById('fKeyword').value = '';
  document.getElementById('fFlight').value = '';
  document.getElementById('fNeed').checked = false;
  document.getElementById('fSort').value = 'date';
  ['fFactory', 'fDept', 'fTitik'].forEach(function (id) {
    document.getElementById(id).value = '';
  });
  document.querySelectorAll('#fArah button').forEach(function (b) {
    b.setAttribute('aria-pressed', String(!b.dataset.val));
  });
  document.querySelectorAll('#fStatus button').forEach(function (b) {
    b.setAttribute('aria-pressed', String(!b.dataset.val));
  });
  showMsg('', '');
  onFilterChanged();
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

/** 後端回的是代碼不是句子（它不知道使用者切成哪種語言），翻譯在這裡做 */
function tListError(res) {
  const code = res && res.error;
  switch (code) {
    case 'DATE_INVALID':         return t('err.dateInvalid');
    case 'DATE_RANGE_REVERSED':  return t('err.dateRange');
    default:                     return tAdminError(res);
  }
}

/** ⚠️ 所有進 innerHTML 的值都要過這一關（姓名、備註都是人打進 Sheet 的） */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
