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

/* 目前的檢視範圍代號（week / next14 / month / past14 / all / custom）。
   ⚠️ 只是**畫面上的標籤**，真正去查的還是 #fFrom / #fTo 的值——
      這兩者一定要一起改，不然標籤寫「本週」而查的是別的區間。 */
let rangeKind = 'next14';

/* 統計卡選了哪一張（'' / TODO / SCHEDULED / DONE）。
   ⚠️ 它跟下面「其他篩選」裡的狀態按鈕是**同一個東西的兩個入口**，
      所以按卡片時要把那些按鈕也同步過去，不然兩邊會顯示不一致。 */
let statPick = '';


/* ══════════════════ 初始化 ══════════════════ */

document.addEventListener('DOMContentLoaded', function () {
  initLangSwitch();

  setApiRetryNotice(function () { showMsg(t('err.retrying'), 'info'); });

  wireEvents();
  wireEditForm();                     // v3.0 修改表單

  // 連 token 都沒有就不必發 API，直接回登入頁
  if (!getToken()) { location.href = 'admin.html'; return; }

  /* ⚠️ 篩選條件要在發 API **之前**準備好——loadData() 是讀
     #fFrom / #fTo 的值去查的。先前這兩行排在 requireLogin() 後面，
     所以查資料只能等驗證回來才開始。它們其實完全不需要等。 */
  if (!restoreFilters()) setQuickRange('next14');   // 沒存過就給今天起未來 14 天
  syncPickedDates();

  /* ⚠️ 畫面立刻顯示，不要等驗證回來（那是 3~8 秒的空白）。
     使用者這段時間就看得到篩選條件、可以先調，資料區顯示骨架。

     ⚠️ 所以這一頁**不放整頁的轉圈圈**。v3.3 一度加了一個 #bootView，
        但它在 DOMContentLoaded 當下就被關掉，等於永遠不會出現——
        等待的那幾秒是由 showSkeleton() 在資料區畫骨架來交代的。 */
  document.getElementById('content').hidden = false;
  document.getElementById('adminBar').hidden = false;
  renderPeriodBar();

  /* ⚠️ 先用 sessionStorage 裡既有的 profile 畫導覽列——那是登入時存的，
     所以進到這一頁的當下就有，不必等 API。requireLogin 回來後再畫一次，
     萬一角色剛被超管改掉，畫面會跟著更正。 */
  renderPageNav('list');

  /* ── 兩支 API 同時發（v2.5）────────────────────────────────
   *
   * 先前是串起來等的：
   *     await requireLogin();   // 3~8 秒
   *     loadData();             // 再 3~8 秒
   *   → 合計 6~16 秒，而 Apps Script 的冷啟動就是這麼久，省不掉。
   *
   * 但這兩件事**互不相依**：查資料本身就會驗 token（後端的 withAuth），
   * requireLogin 只是為了拿到姓名／角色並在失效時導頁。
   * 同時發之後，總時間變成兩者的**最大值**而不是總和。
   *
   * ⚠️ 不要 await 它們。這裡刻意不等——各自處理各自的結果就好，
   *    誰先回來誰先更新畫面。
   * ⚠️ token 失效時兩支都會失敗：listBookings 會先閃一下錯誤訊息，
   *    接著 requireLogin 把人導回登入頁。順序不保證，但結果一樣是導頁。
   */
  requireLogin().then(function () {
    renderPageNav('list');
    renderWho();                      // v3.3 姓名／角色
    startIdleWatch();                 // v2.8 閒置自動登出
  });
  loadData();
});


function wireEvents() {
  document.getElementById('searchBtn').addEventListener('click', function () {
    rangeKind = 'custom';              // 自己挑日期 → 範圍列顯示那兩個日期
    closeRangePick();
    loadData();
  });
  document.getElementById('reloadBtn').addEventListener('click', loadData);
  document.getElementById('resetBtn').addEventListener('click', resetFilters);

  // 日期欄位下方那一行確認文字（一定是 dd/mm/yyyy，由我們控制）
  ['fFrom', 'fTo'].forEach(function (id) {
    const el = document.getElementById(id);
    /* ⚠️ 手動改日期就不再是「本週／未來 14 天」了，範圍代號要跟著變成 custom。
       不改的話標籤會一直寫「本週」，而查的是別的區間——
       畫面說謊比查錯還糟，因為使用者不會去懷疑它。 */
    const onEdit = function () { rangeKind = 'custom'; syncPickedDates(); };
    el.addEventListener('change', onEdit);
    el.addEventListener('input', onEdit);
  });

  document.querySelectorAll('#quickRange button').forEach(function (btn) {
    btn.addEventListener('click', function () {
      setQuickRange(btn.dataset.range);
      rangeKind = btn.dataset.range;
      syncPickedDates();
      closeRangePick();
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
      syncStatFromChips();
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

  /* 篩選收合。⚠️ aria-expanded 要跟著改——螢幕閱讀器只看這個屬性，
     只改 hidden 的話它會一直說「收合中」 */
  document.getElementById('filterToggle').addEventListener('click', function () {
    const box = document.getElementById('filterBody');
    box.hidden = !box.hidden;
    this.setAttribute('aria-expanded', box.hidden ? 'false' : 'true');
  });

  // 範圍列
  document.getElementById('periodBar').addEventListener('click', function () {
    const box = document.getElementById('rangePick');
    box.hidden = !box.hidden;
    this.setAttribute('aria-expanded', box.hidden ? 'false' : 'true');
  });

  // 統計卡：點一下依那個狀態篩選，再點一下取消
  document.querySelectorAll('#statRow .stat-card').forEach(function (card) {
    card.addEventListener('click', function () {
      pickStat(statPick === card.dataset.stat ? '' : card.dataset.stat);
    });
  });

  document.getElementById('overdueNote').addEventListener('click', showOverdueOnly);
  document.getElementById('logoutBtn').addEventListener('click', function () { doLogout(); });
}


/** 登入者姓名與角色 */
function renderWho() {
  const p = getProfile();
  document.getElementById('adminName').textContent = p.name || p.account || '';
  document.getElementById('adminRole').textContent =
    t(p.is_super ? 'adm.role.super' : 'adm.role.admin');
}


/** 範圍列上的文字：目前是哪個區間、幾筆 */
function renderPeriodBar() {
  const key = {
    week: 'list.quick.week', next14: 'list.quick.14', month: 'list.quick.month',
    past14: 'list.quick.past', all: 'list.range.all'
  }[rangeKind];

  const label = document.getElementById('periodLabel');
  if (key) {
    label.textContent = t(key);
  } else {
    // 自訂區間：把兩個日期寫出來（⚠️ 一律 dd/mm/yyyy，不用裝置格式）
    const f = dmy(document.getElementById('fFrom').value);
    const to = dmy(document.getElementById('fTo').value);
    label.textContent = (f || '…') + ' – ' + (to || '…');
  }
  document.getElementById('periodCount').textContent =
    allItems.length ? t('list.countAll', { n: allItems.length }) : '';
}

/** 把範圍選單收起來（選完就收，不要擋住下面的資料） */
function closeRangePick() {
  document.getElementById('rangePick').hidden = true;
  document.getElementById('periodBar').setAttribute('aria-expanded', 'false');
}


/** 'YYYY-MM-DD' → 'dd/mm/yyyy'（空的回空字串） */
function dmy(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? (m[3] + '/' + m[2] + '/' + m[1]) : '';
}


/**
 * 按統計卡。
 *
 * ⚠️ 統計卡與「其他篩選」裡的狀態按鈕是**同一件事的兩個入口**。
 *    只改其中一邊的話，畫面上會出現「卡片是亮的、狀態按鈕卻寫全部」，
 *    使用者完全不知道現在到底篩了什麼。
 */
function pickStat(kind) {
  statPick = kind;

  // TODO ＝待定＋待改期（兩個狀態合起來才是「還沒定案、要去追的」）
  const want = kind === 'TODO' ? ['INCOMPLETE', 'PENDING']
             : kind ? [kind] : [];

  document.querySelectorAll('#fStatus button').forEach(function (b) {
    const v = b.dataset.val;
    b.setAttribute('aria-pressed', want.length ? (want.indexOf(v) >= 0 ? 'true' : 'false')
                                               : (v === '' ? 'true' : 'false'));
  });
  syncStatCards();
  onFilterChanged();
}


/**
 * 反方向：從「其他篩選」裡的狀態按鈕推回統計卡。
 *
 * ⚠️ pickStat() 只做了「卡片 → 按鈕」那一半。少了這一支，
 *    直接改狀態按鈕時卡片還亮著舊的那一張，畫面上會出現
 *    「卡片寫待處理、按鈕寫已取消」這種互相矛盾的狀態，
 *    而且**不會報錯**——使用者完全不知道現在到底篩了什麼。
 */
function syncStatFromChips() {
  const on = currentStatuses().slice().sort().join(',');
  statPick = on === 'INCOMPLETE,PENDING' ? 'TODO'
           : on === 'SCHEDULED' ? 'SCHEDULED'
           : on === 'DONE' ? 'DONE' : '';
  syncStatCards();
}


/** 讓統計卡的反白跟著狀態按鈕走（不管是從哪一邊改的） */
function syncStatCards() {
  document.querySelectorAll('#statRow .stat-card').forEach(function (c) {
    c.setAttribute('aria-pressed', c.dataset.stat === statPick ? 'true' : 'false');
  });
}


/**
 * 按逾期提示：切到「全部」範圍，並只留下逾期那些。
 *
 * ⚠️ 一定要順便把範圍切成「全部」——逾期的資料在過去，
 *    而預設範圍是未來 14 天，只改篩選的話按下去會是一片空白。
 */
function showOverdueOnly() {
  setQuickRange('all');
  rangeKind = 'all';
  syncPickedDates();
  pickStat('TODO');
  loadData();
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
  } else if (kind === 'past14') {
    from = isoOf(addDays(today, -14));
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
    renderPeriodBar();
    renderOverdueNote();

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
        /* v3.1：8 欄 → 6 欄。日期與姓名併一格、狀態與接／送併一格。
           省下來的寬度讓「出廠時間」與「上車地點」不再折行——
           那才是先前「留白很多、每一列卻很高」的真正原因。 */
        th('th.dateName') + th('th.flight') + th('th.pickup') +
        th('th.titik') + th('th.status') + th('th.detail') +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>' + more;

    box.querySelectorAll('button[data-detail]').forEach(function (btn) {
      btn.addEventListener('click', function () { toggleDetail(btn.dataset.detail); });
    });
    box.querySelectorAll('button[data-edit]').forEach(function (btn) {
      btn.addEventListener('click', function () { openEdit(btn.dataset.edit); });
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


/**
 * 「逾期未處理」＝ 日期已經過了，狀態卻還是待定或待改期（v2.9）。
 *
 * 為什麼要標出來：這兩種狀態的意思都是「這一筆還沒有定案」，
 * 而定案的人就是管理者本人。日期一過還停在這裡，代表**有一件事被忘記了**——
 * 它不會自己冒出來提醒你，混在幾十筆裡面很容易整週都沒被看到。
 *
 * ⚠️ 「已排定」不算逾期。時間過了它會自己變成「已完成」
 *    （effectiveStatus_，後端每小時也會寫回 Sheet），那是正常的流程。
 * ⚠️ 「已取消」也不算——那是已經定案的決定。
 *
 * ⚠️ 「今天」一定要換算成雅加達（todayJakarta），不可以直接用裝置日期。
 *    台灣的手機比雅加達快一小時，台北 00:30 時雅加達還在前一天 23:30——
 *    那一個小時裡，昨天的行程會被誤判成還沒到期，而畫面上完全看不出哪裡不對。
 */
function isOverdue(it) {
  const st = it.status || '';
  if (st !== 'PENDING' && st !== 'INCOMPLETE') return false;
  if (!it.tanggal_iso) return false;
  return it.tanggal_iso < isoOf(todayJakarta());     // 'YYYY-MM-DD' 字串比較就是日期比較
}


function renderStatLine() {
  const pick = viewItems.filter(function (i) { return i.arah === 'PICKUP'; }).length;
  const drop = viewItems.filter(function (i) { return i.arah === 'DROPOFF'; }).length;
  const late = viewItems.filter(isOverdue).length;
  const el = document.getElementById('statLine');
  /* ⚠️ 「接 N · 送 M」一定要留著。v3.3 的統計卡改成流程狀態（使用者選的方案 B），
     而派車調度要看的是方向——那個數字不能因為換了卡片就不見。 */
  el.textContent =
    t('list.countOf', { n: viewItems.length, total: allItems.length }) +
    '　' + t('list.stat', { a: pick, b: drop }) +
    // 0 筆的時候整段不出現。永遠掛一個「逾期 0」在那裡，
    // 看久了就變成背景，真的有 1 筆時也不會被注意到
    (late ? '　' + t('list.overdueN', { n: late }) : '');
  el.classList.toggle('statline--alert', late > 0);

  renderStatCards();
  renderFilterCount();
}


/**
 * 三張統計卡（方案 B：流程狀態）。
 *
 * ⚠️ 算的是 **allItems**（目前範圍的全部）不是 viewItems（篩選後）——
 *    卡片是拿來「決定要篩什麼」的，跟著篩選結果變的話，
 *    按下「待處理」之後另外兩張就變成 0，看起來像資料不見了。
 */
function renderStatCards() {
  const n = (fn) => allItems.filter(fn).length;
  document.getElementById('statTodo').textContent =
    n(function (i) { return i.status === 'INCOMPLETE' || i.status === 'PENDING'; });
  document.getElementById('statSched').textContent =
    n(function (i) { return i.status === 'SCHEDULED'; });
  document.getElementById('statDone').textContent =
    n(function (i) { return i.status === 'DONE'; });
  syncStatCards();
}


/**
 * 收合起來的篩選有幾個條件生效。
 *
 * ⚠️ 沒有這個數字的話，管理者把篩選收起來之後會忘記自己還開著條件，
 *    然後以為資料不見了——這是「預設收合」唯一的代價，一定要補上。
 */
function renderFilterCount() {
  let n = 0;
  if (document.getElementById('fKeyword').value.trim()) n++;
  if (document.getElementById('fFlight').value.trim()) n++;
  if (document.getElementById('fNeed').checked) n++;
  ['fFactory', 'fDept', 'fTitik'].forEach(function (id) {
    if (document.getElementById(id).value) n++;
  });
  if (document.querySelector('#fArah button[data-val=""]').getAttribute('aria-pressed') !== 'true') n++;
  if (document.querySelector('#fStatus button[data-val=""]').getAttribute('aria-pressed') !== 'true') n++;

  const tag = document.getElementById('filterCount');
  tag.textContent = n;
  tag.hidden = !n;
}


/**
 * 逾期提示。⚠️ 顯示的是後端算的**全部期間**筆數（overdue_all），
 * 不是目前範圍內的——理由見 admin-list.html 與 gas/AdminList.js 的說明。
 */
function renderOverdueNote() {
  const n = Number(meta.overdue_all || 0);
  const el = document.getElementById('overdueNote');
  el.textContent = n ? t('list.overdueAll', { n: n }) : '';
  el.hidden = !n;
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
  const overdue = isOverdue(it);
  if (overdue) cls.push('drow--overdue');

  const arahTag = '<span class="booking-arah ' +
    (arah === 'PICKUP' ? 'arah--pickup' : 'arah--dropoff') + '">' +
    esc(t('arah.' + arah)) + '</span>';

  let statusTag = '<span class="badge badge--' + status.toLowerCase() + '">' +
                  esc(t('status.' + status)) + '</span>';
  // 逾期的再加一顆紅標。整列的底色已經變了，但**列印出來是黑白的**——
  // 只靠顏色的話，印成紙本拿去開會時這件事就消失了
  if (overdue) statusTag += '<span class="badge badge--overdue">' +
                            esc(t('list.overdue')) + '</span>';
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
  /* 日期＋姓名同一格（v3.1）。桌機上並排、手機上放不下就自己折到第二行。
     ⚠️ 這是同一份 markup 在兩種版面下用，不是兩套——
        分成兩套的話，改了一邊忘了另一邊是遲早的事。 */
  const dateName =
    '<div class="cellmain">' +
      '<span class="rdate">' + esc(it.tanggal || '') + '</span>' +
      '<span class="rname">' + name + '</span>' +
      (it.tanggal_asal
        ? '<span class="subtle">' + esc(t('f.asal')) + ' ' + esc(it.tanggal_asal) + '</span>' : '') +
    '</div>';

  // 狀態＋接／送同一格，上下疊（v3.1）
  const statusCell = '<div class="cellstat">' + statusTag + arahTag + '</div>';

  const summary =
    '<tr class="' + cls.join(' ') + '">' +
    td('th.dateName', dateName) +
    td('th.flight', flight) +
    td('th.pickup', esc(pickup)) +
    td('th.titik', esc(it.titik_jemput || '')) +
    td('th.status', statusCell) +
    '<td data-label="" class="cell-act">' +
      '<button type="button" class="chip" data-detail="' + esc(id) + '">' +
      esc(open ? t('list.close') : t('list.detail')) + '</button>' +
      // v3.0：修改。⚠️ 帶的是 booking_id 不是列號——Sheet 上插一列，列號就全錯了
      '<button type="button" class="chip" data-edit="' + esc(id) + '">' +
      esc(t('list.edit')) + '</button>' +
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

  /* ⚠️ booking_id 與「分頁位置」刻意**不顯示**（v2.5，使用者要求）。
   *
   * 資料**沒有被拿掉**，只是列表上不畫出來——階段 2d 的修改／刪除
   * 要靠 it.id 認出是哪一筆（設計約定：一律用 id 查找，不可用列號）。
   * 2d 的修改畫面上會顯示編號：動別人的資料之前，先確認「我改的是這一筆」。
   *
   * i18n 的 f.booking / f.sheet 兩句也留著，2d 就要用。
   */

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
      sort:    document.getElementById('fSort').value,
      /* ⚠️ 範圍代號也要存。只存 from/to 的話，重新整理後範圍列會顯示
         那兩個日期而不是「本週」——查的是對的，但標籤退化了。 */
      rangeKind: rangeKind,
      statPick:  statPick
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

    if (f.rangeKind) rangeKind = f.rangeKind;
    statPick = f.statPick || '';

    /* 「其他篩選」裡有設定過的話就自動展開，不然他會找不到自己上次設了什麼。
       ⚠️ 這比 v3.3 之前更重要——現在**預設是收合的**，
          不展開的話上次設的條件完全看不見，只剩下右上角那個數字。 */
    if (f.flight || f.factory || f.dept || f.titik || f.need ||
        (Array.isArray(f.status) && f.status.length) || f.arah) {
      document.getElementById('filterBody').hidden = false;
      document.getElementById('filterToggle').setAttribute('aria-expanded', 'true');
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
  statPick = '';                       // 統計卡的反白也要跟著清掉
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


/* ══════════════════════════════════════════════════════════════
   修改表單（v3.0）

   ⚠️ 送出的一律是**欄位代碼**（SCHEDULED、PICKUP），不是畫面上的文字。
      後端只認代碼——送中文進去會被擋成 STATUS_INVALID。

   ⚠️ 前端的驗證只是**體驗**，把關在後端（gas/Bookings.js 的白名單與必填）。
      任何人都能繞過畫面直接打 API。
   ══════════════════════════════════════════════════════════════ */

/* 表單欄位 id ←→ 後端欄位代碼。**這一份就是能改哪些欄位的全部**，
   要跟 gas/Bookings.js 的 BOOKING_EDITABLE 對得上。 */
const EDIT_FIELDS = {
  eTanggal: 'tanggal', eArah: 'arah', eStatus: 'status',
  eFlight: 'flight', eEtd: 'etd_eta', eDariPci: 'dari_pci', eTitik: 'titik_jemput',
  eBagasi: 'bagasi', eRemark: 'remark',
  eKendaraan: 'kendaraan', eSopir: 'sopir', eHpSopir: 'hp_sopir',
  eName: 'name', eNamaCina: 'nama_cina', eFactory: 'factory', eDept: 'dept',
  eDorm: 'dorm', eHp: 'hp', eCustom: 'custom', eEmail: 'email',
  eEmailKontak: 'email_kontak', ePovs: 'povs', eGroup: 'group_id'
};

let editingId = '';
let editingBefore = null;      // 開啟時的原值，用來只送真的有改的欄位


function wireEditForm() {
  const wrap = document.getElementById('editWrap');
  if (!wrap) return;

  document.getElementById('editClose').addEventListener('click', closeEdit);
  document.getElementById('eCancel').addEventListener('click', closeEdit);
  document.getElementById('editForm').addEventListener('submit', onEditSubmit);
  document.getElementById('eDelete').addEventListener('click', onEditDelete);

  document.getElementById('ePersonToggle').addEventListener('click', function () {
    const box = document.getElementById('ePersonBox');
    box.hidden = !box.hidden;
  });

  /* ⚠️ 日期輸入框的顯示順序跟著裝置的地區設定走，HTML 和 CSS 都改不了
     （印尼手機 18/09/2026、美式設定 09/18/2026）。所以下面自己畫一行
     確認文字，那一行永遠是 dd/mm/yyyy。 */
  document.getElementById('eTanggal').addEventListener('change', showEditDate);

  /* 點灰色背景關掉。⚠️ 只認背景本身——不加這個判斷的話，
     在表單裡面點一下也會冒泡到這裡，填到一半整個關掉。 */
  wrap.addEventListener('click', function (e) { if (e.target === wrap) closeEdit(); });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !wrap.hidden) closeEdit();
  });
}


function showEditDate() {
  const v = document.getElementById('eTanggal').value;      // 一定是 YYYY-MM-DD（HTML 規格）
  const el = document.getElementById('ePickedDate');
  if (!v) { el.textContent = ''; return; }
  const p = v.split('-');
  el.textContent = '→ ' + p[2] + '/' + p[1] + '/' + p[0];
}


function openEdit(id) {
  const it = allItems.filter(function (x) { return (x.id || '') === id; })[0];
  if (!it) return;

  editingId = id;
  editingBefore = {};
  editMsg('', '');

  // 候選清單用目前載進來的資料組（不必多打一趟 API）
  fillDatalist('dlFlight', distinctOf('flight'));
  fillDatalist('dlTitik', distinctOf('titik_jemput'));
  fillDatalist('dlFactory', distinctOf('factory'));
  fillDatalist('dlDept', distinctOf('dept'));

  Object.keys(EDIT_FIELDS).forEach(function (elId) {
    const code = EDIT_FIELDS[elId];
    const el = document.getElementById(elId);
    let v;
    if (code === 'tanggal') {
      v = it.tanggal_iso || '';                 // <input type="date"> 只吃 YYYY-MM-DD
    } else if (code === 'status') {
      /* ⚠️ 帶 Sheet 上實際存的狀態（status_raw），不是畫面上算出來的。
         算出來的那個會把「時間過了的已排定」顯示成已完成——
         照著存回去等於把 Sheet 上的值改掉了，而管理者根本沒動它。 */
      v = it.status_raw || it.status || 'SCHEDULED';
    } else {
      v = it[code] == null ? '' : String(it[code]);
    }
    el.value = v;
    editingBefore[code] = v;
  });

  showEditDate();
  document.getElementById('ePersonBox').hidden = true;
  document.getElementById('editWho').textContent =
    (it.name || '') + (it.nama_cina ? '　' + it.nama_cina : '') +
    '　' + (it.tanggal || '') + '　' + t('arah.' + (it.arah || 'PICKUP'));

  document.getElementById('editWrap').hidden = false;
  /* ⚠️ 背後的列表不要跟著捲動。手機上不鎖的話，手指在表單邊緣一滑，
     捲的是後面那張長長的列表，看起來像表單自己跳掉了。 */
  document.body.classList.add('noscroll');
}


function closeEdit() {
  document.getElementById('editWrap').hidden = true;
  document.body.classList.remove('noscroll');
  editingId = '';
  editingBefore = null;
}


function fillDatalist(id, values) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = values.map(function (v) {
    return '<option value="' + esc(v) + '"></option>';
  }).join('');
}


/** 只收集**真的有改**的欄位。全部送的話，等於把畫面上看到的值原封蓋回去——
 *  中間如果別人改過同一筆，他的修改會被無聲地蓋掉。 */
function collectEditChanges() {
  const out = {};
  Object.keys(EDIT_FIELDS).forEach(function (elId) {
    const code = EDIT_FIELDS[elId];
    const now = document.getElementById(elId).value.trim();
    if (now !== (editingBefore[code] || '')) out[code] = now;
  });
  return out;
}


async function onEditSubmit(e) {
  e.preventDefault();
  const fields = collectEditChanges();
  if (!Object.keys(fields).length) { closeEdit(); return; }

  const btn = document.getElementById('eSave');
  btn.disabled = true;
  btn.textContent = t('adm.working');
  editMsg(t('adm.working'), 'info');
  try {
    /* ⚠️ 一律不重試。重試會把同一筆改兩次——改本身是冪等的，
       但「搬分頁」不是：第一次搬完舊列就沒了，第二次會找不到而報錯，
       管理者看到的是「失敗」，實際上第一次成功了。 */
    const res = await apiAuth('updateBooking',
      { booking_id: editingId, fields: JSON.stringify(fields) }, false);
    if (!res || !res.ok) { editMsg(tBookingError(res), 'error'); return; }

    applyUpdatedItem(res.data.item);
    closeEdit();
    showMsg(res.data.moved ? t('edit.savedMoved', { s: res.data.moved }) : t('edit.saved'), 'ok');
  } catch (err) {
    editMsg(connErr(err), 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = t('edit.save');
  }
}


async function onEditDelete() {
  const it = allItems.filter(function (x) { return (x.id || '') === editingId; })[0];
  if (!it) return;

  /* ⚠️ 確認文字裡一定要寫出**姓名與日期**。只寫「確定要刪除嗎」的話，
     管理者按下去的當下並不知道自己刪的是哪一筆——而這個動作無法復原。
     （使用者 2026-09-05 決定不做整列備份；誤刪要靠 Sheet 的「檔案 → 版本紀錄」救。） */
  const who = (it.name || '') + '　' + (it.tanggal || '') + '　' + t('arah.' + (it.arah || 'PICKUP'));
  if (!confirm(t('edit.confirmDelete', { s: who }))) return;

  const btn = document.getElementById('eDelete');
  btn.disabled = true;
  try {
    const res = await apiAuth('deleteBooking', { booking_id: editingId }, false);
    if (!res || !res.ok) { editMsg(tBookingError(res), 'error'); return; }

    const gone = editingId;
    closeEdit();
    allItems = allItems.filter(function (x) { return (x.id || '') !== gone; });
    applyFilters();
    showMsg(t('edit.deleted'), 'ok');
  } catch (err) {
    editMsg(connErr(err), 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = t('edit.delete');
  }
}


/**
 * 把後端回來的那一筆換掉畫面上的舊值。
 *
 * ⚠️ 用後端回傳的，不是用表單裡打的。兩者會不一樣——出廠時間會被重新解析、
 *    狀態會依時間算成已完成、搬過分頁的話位置也變了。
 *    照表單顯示的話，畫面跟 Sheet 上就對不起來了。
 */
function applyUpdatedItem(item) {
  if (!item) { loadData(); return; }        // 後端沒回（索引還沒補上）→ 整批重讀
  for (let i = 0; i < allItems.length; i++) {
    if ((allItems[i].id || '') === (item.id || '')) { allItems[i] = item; break; }
  }
  applyFilters();
}


function editMsg(text, kind) {
  const el = document.getElementById('editMsg');
  el.textContent = text || '';
  el.className = text ? ('msg msg--' + (kind || 'info')) : '';
  el.hidden = !text;
}


function tBookingError(res) {
  const code = res && res.error;
  switch (code) {
    case 'BOOKING_NOT_FOUND':    return t('edit.err.gone');
    case 'BOOKING_ID_REQUIRED':  return t('edit.err.gone');
    case 'FIELD_REQUIRED':       return t('edit.err.required');
    case 'DATE_INVALID':         return t('edit.err.date');
    case 'STATUS_INVALID':       return t('edit.err.status');
    case 'ARAH_INVALID':         return t('edit.err.status');
    case 'FIELDS_INVALID':       return t('err.server');
    case 'BUSY':                 return t('edit.err.busy');
    default:                     return tAdminError(res);
  }
}

