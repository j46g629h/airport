/**
 * Query.js — 使用者端查詢
 *
 * 三種查法，全部只讀 _INDEX（見 Index.js 說明）：
 *   1. email     → 自己的行程。眷屬與員工共用同一個 email，所以會一起出現
 *   2. 航班日期  → 當天所有人
 *   3. 航班號    → 同班機所有人
 *
 * ── 使用者端的三條規則 ────────────────────────────────────
 *
 * 1. **不遮蔽個資。** 這是使用者明確的決定：知道當天同班機有誰、幾點出發、
 *    能不能一起搭車，是實際需求。補強措施是前端加 noindex 讓 Google 搜不到。
 *
 * 2. **只看得到今天（含）以後的行程。** 過去的一律不顯示。
 *
 *    ⚠️ 判斷依據是**航班日期**，不是 STATUS。
 *       用「狀態不是已完成」當條件的話，只要有人忘記把上個月那筆改成
 *       「已完成」，它就會一直掛在使用者的清單上——而狀態是人手動維護的，
 *       這種漏掉一定會發生。日期不會漏。
 *
 *    管理者端沒有這個限制，看得到全部歷史。
 *    這同時也是一層保護：就算網址外流，也翻不到任何過去的紀錄。
 *
 * 3. **「待定」的行程不顯示原本的日期。** 只回傳「日期待定」。
 *    顯示舊日期的話，使用者會照那個日期去等車——那比看不到更糟。
 *
 *    已取消、已改期的**未來**行程仍然會顯示（帶狀態徽章）。
 *    藏起來的話，被取消的人會照原訂時間去機場。
 */

/** email 至少要打幾個字才查。太短的話等於把整份名單倒出來。 */
var EMAIL_MIN_CHARS = 3;


/* ══════════════════════════════════════════════════════════════
   對外的三支
   ══════════════════════════════════════════════════════════════ */

/**
 * 用 email 查，**部分符合就算**（不必打完整的信箱）。
 *
 * 手機上打完整信箱很痛苦，打 `kyle` 或 `kyle.ma` 就找得到才實用。
 * ⚠️ 但要有最低字數：打一個 `a` 會把幾乎整份名單倒出來，
 *    那就不是「查詢」而是「匯出全部」了。
 */
function queryByEmail(params) {
  var q = String(params.email || '').trim().toLowerCase();
  if (!q) return fail_('BAD_INPUT', 'EMAIL_REQUIRED');
  if (q.length < EMAIL_MIN_CHARS) return fail_('EMAIL_TOO_SHORT', String(EMAIL_MIN_CHARS));

  var items = filterForUser_(readIndex_(), function (r) {
    return String(r.email).indexOf(q) >= 0 || String(r.email_kontak).indexOf(q) >= 0;
  });
  return ok_({ mode: 'email', keyword: q, items: items, total: items.length });
}


/**
 * ⚠️ 錯誤訊息回「代碼」，不回中文句子。
 *    後端不知道使用者現在把介面切成印尼文還是中文，
 *    回中文句子的話，印尼籍使用者會突然看到一句他看不懂的話。
 *    翻譯是前端的事（js/i18n.js）。
 */
function queryByDate(params) {
  var raw = String(params.date || '').trim();
  var d = parseDMY_(raw) || parseIsoDate_(raw);
  if (!d) return fail_('BAD_INPUT', 'DATE_INVALID');

  var iso = isoDate_(d);
  var items = filterForUser_(readIndex_(), function (r) { return r.tanggal_iso === iso; });

  // ⚠️ 查過去的日期一定是 0 筆（規則 2），但「查不到資料」這句話會讓人
  //    以為系統壞了。明講「那一天已經過去了」才對得上他實際遇到的事。
  var past = (iso < isoDate_(today_()));

  return ok_({ mode: 'date', keyword: isoToDisplay_(iso), past: past,
               items: items, total: items.length });
}


function queryByFlight(params) {
  // 使用者打字時很容易多打空格或用小寫，這裡跟寫入時用同一套正規化
  var code = String(params.flight || '').replace(/\s+/g, '').toUpperCase();
  if (!code) return fail_('BAD_INPUT', 'FLIGHT_REQUIRED');

  var items = filterForUser_(readIndex_(), function (r) {
    return String(r.flight).replace(/\s+/g, '').toUpperCase() === code;
  });
  return ok_({ mode: 'flight', keyword: code, items: items, total: items.length });
}


/* ══════════════════════════════════════════════════════════════
   共用
   ══════════════════════════════════════════════════════════════ */

/**
 * 套用「今天（含）以後」規則，再轉成前端要的格式。
 * 排序在 _INDEX 建立時就做好了（日期由新到舊），這裡反轉成由近到遠——
 * 使用者最關心的是「下一趟是什麼時候」，那應該排在最上面。
 */
function filterForUser_(index, match) {
  var todayIso = isoDate_(today_());
  var out = [];
  for (var i = 0; i < index.length; i++) {
    var r = index[i];
    if (r.tanggal_iso < todayIso) continue;      // 過去的一律不給使用者看
    if (!match(r)) continue;
    out.push(toPublicItem_(r));
  }
  return out.reverse();
}


/**
 * _INDEX 的一列 → 前端直接可以畫出來的物件。
 *
 * ⚠️ 日期時間一律在這裡格式化成字串（dd/mm/yyyy、24 小時、雅加達時間）。
 *    傳 ISO 讓前端自己轉的話，台灣的手機會用台北時區多算一小時。
 */
function toPublicItem_(r) {
  /* 使用者端要把日期與出車資訊藏起來的兩種狀態（v2.9）：
       PENDING    待改期——要改期，新日期還沒定
       INCOMPLETE 待定——資訊不完整（A 欄那個是暫定日期，不是真的）
     ⚠️ 兩種都**一定要藏**。露出來的話使用者會照那個日期去等車，
        而那台車根本不會來——這比「查不到」嚴重得多。 */
  var hide = (r.status_code === 'PENDING' || r.status_code === 'INCOMPLETE');
  // ⚠️ 用「算出來的」狀態，不是 Sheet 上存的那個。
  //    Sheet 上的狀態要靠人維護，時間過了不會自己變；
  //    Status.js 的排程每小時會把它寫回去，但那有最多一小時的落差，
  //    這裡即時算過就不會有「明明飛機飛走了還顯示已排定」的情況。
  var status = effectiveStatus_(r.status_code, r.tanggal_iso, r.etd_eta);

  return {
    id:          r.booking_id,
    // 待定的不給日期，只給狀態（規則 3）
    tanggal:     hide ? '' : isoToDisplay_(r.tanggal_iso),
    arah:        r.arah_code,                       // PICKUP / DROPOFF，文字由前端依語言決定
    status:      status,
    flight:      r.flight,
    etd_eta:     r.etd_eta,
    dari_pci:    hide ? '' : r.dari_pci,
    pickup:      hide ? '' : isoToDisplayTime_(r.pickup_iso),
    tanggal_asal: r.tanggal_asal ? isoToDisplay_(r.tanggal_asal) : '',

    name:        r.name,
    nama_cina:   r.nama_cina,
    dept:        r.dept,
    factory:     r.factory,
    dorm:        r.dorm,
    email:       r.email,
    hp:          r.hp,

    titik_jemput: r.titik_jemput,
    custom:      r.custom,
    bagasi:      r.bagasi,
    povs:        r.povs,
    remark:      r.remark,
    permintaan:  r.permintaan,
    group_id:    r.group_id,

    // 派車。介面還沒做，但先傳出去——啟用時前端只要決定畫不畫，後端一行都不用改。
    // 沒填的時候是空字串，前端就不顯示那一塊。
    kendaraan:   r.kendaraan,
    sopir:       r.sopir,
    hp_sopir:    r.hp_sopir
  };
}


/** 'YYYY-MM-DD' → Date（HTML 的 <input type="date"> 送出來的就是這個格式） */
function parseIsoDate_(s) {
  var m = String(s || '').trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return null;
  var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (d.getMonth() !== Number(m[2]) - 1 || d.getDate() !== Number(m[3])) return null;
  return d;
}
