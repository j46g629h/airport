/**
 * AdminList.js — 管理端的班表查詢（階段 2c）
 *
 * ⚠️ 這一支跟 Query.js（使用者端）是**兩套規則**，不要合併：
 *
 * | 差別 | 使用者端 Query.js | 管理端（這裡） |
 * |---|---|---|
 * | 日期範圍 | 只給今天以後 | **看得到全部歷史** |
 * | 待定的日期 | 藏起來（怕他照舊日期去等車） | **一定要顯示** |
 * | 需要登入 | 不用 | 要，走 ROUTES 的 withAuth() |
 * | 回傳欄位 | 只有畫得出卡片的那些 | 多帶 sheet_name / row_num（2d 修改要用） |
 *
 * 合成一支再用參數切換的話，總有一天會有人把「今天以後」那個判斷
 * 加到共用的地方，使用者端就會突然看得到歷史紀錄——
 * 而那不會報錯，要等到有人反映才會發現。
 *
 * ── 為什麼是「後端粗篩、前端細篩」 ──────────────────────
 *
 * Apps Script 一次來回 3~8 秒。管理者調篩選條件是連續動作
 * （先看接機、再改看某個廠別、再打個名字），每按一次等 5 秒等於不能用。
 *
 * 所以後端**只做日期區間**這一刀（它決定了要讀多少資料），
 * 接／送、廠別、部門、狀態、關鍵字、航班號全部在瀏覽器裡做，打字就即時反應。
 * 只有換日期區間才會重新打 API。
 *
 * ⚠️ 因此回傳的資料含全體台幹的手機、房號、信箱——
 *    前端只能存 sessionStorage，不可以存 localStorage（設計約定第 8 條）。
 */

/**
 * 一次最多回傳幾筆。
 *
 * ⚠️ 這個上限是必要的，但不是為了 Apps Script——是為了手機。
 *    一年 250~400 筆、三年後上千筆，全部塞進 JSON 再畫成 DOM，
 *    工廠配的中低階手機會直接卡死，而且**看起來像當機不像資料太多**。
 *
 * 截斷時保留「離今天最近的 N 筆」，不是「最舊的 N 筆」——
 * 管理者查全部歷史時，想看的絕不會是三年前那幾筆。
 */
var ADMIN_LIST_MAX_ROWS = 800;


/**
 * 班表列表。
 *
 * @param {string} params.from 起日，'dd/mm/yyyy' 或 'YYYY-MM-DD'，可省略（＝不限）
 * @param {string} params.to   迄日，同上，可省略
 */
function listBookings(params, session) {
  var fromIso = adminDateArg_(params.from);
  var toIso   = adminDateArg_(params.to);

  // ⚠️ 「解析不出來」跟「沒有填」要分開。兩者都當成不限的話，
  //    使用者打錯日期會查到一整年的資料卻沒有任何提示。
  if (fromIso === null) return fail_('DATE_INVALID', 'from');
  if (toIso   === null) return fail_('DATE_INVALID', 'to');
  if (fromIso && toIso && fromIso > toIso) return fail_('DATE_RANGE_REVERSED');

  var matched = [];
  var index = readIndex_();

  /* ── 逾期未處理：**全部期間**的筆數（v3.3）────────────────────────
   *
   * ⚠️ 這個數字刻意**不跟著查詢範圍走**，跟畫面上其他統計都不一樣。
   *
   *    為什麼：預設範圍是「未來 14 天」，而逾期的一定在**過去**——
   *    只算範圍內的話，管理者在預設檢視下**永遠看到 0**。
   *    v2.9 做的逾期提醒就是這樣，等於做了卻沒有作用。
   *    三個月前沒敲定的行程，今天一樣要處理，被範圍藏起來就永遠沒人發現。
   *
   * ⚠️ 在這裡算是**免費的**——listBookings 本來就讀了整張 _INDEX。
   *    另外開一支 API 會多一趟 3~8 秒的往返，換到的是同一個數字。
   */
  var todayIso = isoDate_(today_());
  var overdue = 0;

  for (var i = 0; i < index.length; i++) {
    var r = index[i];

    // 逾期：日期已經過了，狀態卻還停在「待定」或「待改期」。
    // ⚠️ 這一段在範圍過濾**之前**，才會是全部期間的數字。
    if (r.tanggal_iso && r.tanggal_iso < todayIso &&
        (r.status_code === 'PENDING' || r.status_code === 'INCOMPLETE')) {
      overdue++;
    }

    if (fromIso && r.tanggal_iso < fromIso) continue;
    if (toIso   && r.tanggal_iso > toIso)   continue;
    matched.push(r);
  }

  var total = matched.length;
  var truncated = false;
  if (total > ADMIN_LIST_MAX_ROWS) {
    matched = nearestToToday_(matched, ADMIN_LIST_MAX_ROWS);
    truncated = true;
  }

  // 日期由舊到新、同一天再依出車時間。
  // ⚠️ _INDEX 存的是由新到舊（使用者端要「下一趟排最上面」），
  //    管理端相反——他是照時間順序把一週的車排下去的。
  matched.sort(function (a, b) {
    if (a.tanggal_iso !== b.tanggal_iso) return a.tanggal_iso < b.tanggal_iso ? -1 : 1;
    return comparePickup_(a.pickup_iso, b.pickup_iso);
  });

  return ok_({
    items:     matched.map(toAdminItem_),
    total:     matched.length,
    matched:   total,                 // 截斷前的筆數
    truncated: truncated,
    limit:     ADMIN_LIST_MAX_ROWS,
    from:      fromIso ? isoToDisplay_(fromIso) : '',
    to:        toIso   ? isoToDisplay_(toIso)   : '',
    // 資料新鮮度。⚠️ _INDEX 每 5 分鐘才重建一次，管理者剛在 Sheet 上改完
    //    可能還沒進來——不講清楚的話他會以為是 app 壞了（見 Index.js 說明）
    index_built_at: indexBuiltAtText_(),
    now:            nowStampText_(),
    // ⚠️ 全部期間的逾期筆數，不受 from/to 影響（見上方說明）
    overdue_all:    overdue
  });
}


/* ══════════════════════════════════════════════════════════════
   共用
   ══════════════════════════════════════════════════════════════ */

/**
 * 日期參數 → ISO 字串。
 * 沒填回 ''（不限），填了但看不懂回 null（呼叫端要當成錯誤）。
 */
function adminDateArg_(raw) {
  var s = str_(raw);
  if (!s) return '';
  var d = parseDMY_(s) || parseIsoDate_(s);
  return d ? isoDate_(d) : null;
}


/**
 * 同一天之內比出車時間。
 *
 * ⚠️ **沒有出廠時間的排最後，不是最前面。**
 *    直接拿字串比大小的話，空字串最小，那幾筆會被推到當天的最上面——
 *    而管理者看一天的班表是照出車順序看的，開頭卡著幾筆「時間不明」，
 *    真正要排的車全被擠到下面去。排最後反而剛好：它們就是還沒排進去的那幾筆。
 */
function comparePickup_(a, b) {
  var x = str_(a), y = str_(b);
  if (!x && !y) return 0;
  if (!x) return 1;
  if (!y) return -1;
  return x < y ? -1 : (x > y ? 1 : 0);
}


/** 取離今天最近的 n 筆（截斷用，見 ADMIN_LIST_MAX_ROWS 說明） */
function nearestToToday_(rows, n) {
  var todayIso = isoDate_(today_());
  return rows.slice().sort(function (a, b) {
    var da = dayGap_(a.tanggal_iso, todayIso);
    var db = dayGap_(b.tanggal_iso, todayIso);
    if (da !== db) return da - db;
    return a.tanggal_iso < b.tanggal_iso ? 1 : -1;   // 一樣遠的話未來優先
  }).slice(0, n);
}

/**
 * 兩個 ISO 日期差幾天（絕對值）。
 * ⚠️ 用 Date 相減而不是字串比對——跨月時 '2026-09-30' 與 '2026-10-01'
 *    字串差很多，實際上只差一天。
 */
function dayGap_(isoA, isoB) {
  var a = parseIsoDate_(isoA), b = parseIsoDate_(isoB);
  if (!a || !b) return 1e9;
  return Math.abs(a.getTime() - b.getTime()) / 86400000;
}


/**
 * 'dd/MM/yyyy HH:mm' → 'yyyy-MM-ddTHH:mm'（只給前端排序用的鍵）。
 *
 * ⚠️ 為什麼不讓前端自己轉：那一欄是**純文字**，內容可能是人手打的。
 *    前端拿 new Date() 去解析的話，一來會用看的人那台裝置的時區，
 *    二來解析不出來時會得到 Invalid Date，排序結果會隨機亂跳而不會報錯。
 *    在這裡用正規表示式轉，看不懂就回空字串，排序時一律排到最後。
 */
function stampToSortable_(text) {
  var m = str_(text).match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (!m) return '';
  return m[3] + '-' + pad2_(Number(m[2])) + '-' + pad2_(Number(m[1])) +
         'T' + pad2_(Number(m[4] || 0)) + ':' + pad2_(Number(m[5] || 0));
}


/** _INDEX 上次重建的時間，格式化好的字串。沒有紀錄就回空字串。 */
function indexBuiltAtText_() {
  try {
    var ms = Number(PropertiesService.getScriptProperties().getProperty(PROP_INDEX_BUILT) || 0);
    if (!ms) return '';
    return Utilities.formatDate(new Date(ms), tz_(), 'dd/MM/yyyy HH:mm');
  } catch (e) {
    return '';                       // 讀不到只是少顯示一行字，不影響列表
  }
}


/**
 * _INDEX 的一列 → 管理端前端可以直接用的物件。
 *
 * ⚠️ 日期時間一律在後端格式化成字串（dd/mm/yyyy、24 小時、雅加達時間）。
 *    另外附 *_iso 純粹給前端「排序與比大小」用——那是字串比較，
 *    前端**不可以**拿它去 new Date()，那會用看的人那台裝置的時區重算。
 */
function toAdminItem_(r) {
  return {
    id:         r.booking_id,

    // 2d 的修改功能要靠這兩個定位到 Sheet 上的哪一列。
    // ⚠️ row_num 隨時可能因為有人插列／刪列而失效，**只能當提示**，
    //    真正寫入時一律用 booking_id 重新找一次（設計約定第 3 條）。
    sheet_name: r.sheet_name,
    row_num:    r.row_num,

    // ⚠️ 待定（PENDING）的日期在使用者端要藏起來，管理端一定要給——
    //    管理者就是那個要去把日期敲定的人，看不到原訂日期他無從追起。
    tanggal:     isoToDisplay_(r.tanggal_iso),
    tanggal_iso: r.tanggal_iso,                       // 前端排序／篩選用（字串比較）

    arah:   r.arah_code,
    // 依時間算出來的狀態（飛機飛走了就是已完成），跟使用者端同一套邏輯
    status: effectiveStatus_(r.status_code, r.tanggal_iso, r.etd_eta),
    // Sheet 上實際存的那個值。兩者不同時前端會標示出來——
    // 管理者才知道「畫面顯示已完成，但 Sheet 上還寫著已排定」不是 bug
    status_raw: r.status_code,

    flight:      r.flight,
    etd_eta:     r.etd_eta,
    dari_pci:    r.dari_pci,
    pickup:      isoToDisplayTime_(r.pickup_iso),
    pickup_iso:  r.pickup_iso,                        // 前端排序用
    tanggal_asal: r.tanggal_asal ? isoToDisplay_(r.tanggal_asal) : '',

    name:      r.name,
    nama_cina: r.nama_cina,
    dept:      r.dept,
    factory:   r.factory,
    dorm:      r.dorm,
    email:     r.email,
    email_kontak: r.email_kontak,
    hp:        r.hp,

    titik_jemput: r.titik_jemput,
    custom:    r.custom,
    bagasi:    r.bagasi,
    povs:      r.povs,
    remark:    r.remark,
    permintaan: r.permintaan,
    group_id:  r.group_id,

    // 派車。介面還沒做，資料先傳出去（設計約定第 12 條的成本不對稱）
    kendaraan: r.kendaraan,
    sopir:     r.sopir,
    hp_sopir:  r.hp_sopir,

    updated_at:   r.updated_at,
    updated_sort: stampToSortable_(r.updated_at)      // 前端「依最後更新排序」用
  };
}


/* ══════════════════════════════════════════════════════════════
   本機測試用（在編輯器直接執行，不必部署也不必開瀏覽器）
   ══════════════════════════════════════════════════════════════ */

function testListBookings() {
  var out = listBookings({ from: '01/09/2026', to: '30/09/2026' }, { account: 'test' });
  var o = JSON.parse(out.getContent());
  Logger.log('ok=' + o.ok + '　筆數=' + (o.data && o.data.total) +
             '　索引更新於 ' + (o.data && o.data.index_built_at));
  if (o.data && o.data.items && o.data.items.length) {
    Logger.log(JSON.stringify(o.data.items[0], null, 2));
  }
}

function testListBookingsAll() {
  var out = listBookings({}, { account: 'test' });
  var o = JSON.parse(out.getContent());
  Logger.log('全部：' + (o.data && o.data.total) + ' 筆，截斷=' + (o.data && o.data.truncated));
}
