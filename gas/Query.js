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
 * 2. **只看得到近 3 個月**（航班日期 >= 今天往前推 3 個月）。未來的不設限。
 *    管理者端沒有這個限制。這同時也是一層保護：就算網址外流，
 *    也只翻得到最近三個月，不是整個歷史。
 *
 * 3. **「待定」的行程不顯示原本的日期。** 只回傳「日期待定」。
 *    顯示舊日期的話，使用者會照那個日期去等車——那比看不到更糟。
 */

var USER_MONTHS_BACK = 3;


/* ══════════════════════════════════════════════════════════════
   對外的三支
   ══════════════════════════════════════════════════════════════ */

function queryByEmail(params) {
  var email = String(params.email || '').trim().toLowerCase();
  if (!email) return fail_('BAD_INPUT', '請輸入電子郵件');
  if (email.indexOf('@') < 0) return fail_('BAD_INPUT', '電子郵件格式不正確');

  var items = filterForUser_(readIndex_(), function (r) {
    return r.email === email || r.email_kontak === email;
  });
  return ok_({ mode: 'email', keyword: email, items: items, total: items.length });
}


function queryByDate(params) {
  var raw = String(params.date || '').trim();
  var d = parseDMY_(raw) || parseIsoDate_(raw);
  if (!d) return fail_('BAD_INPUT', '日期格式請用 dd/mm/yyyy，例如 18/09/2026');

  var iso = isoDate_(d);
  var items = filterForUser_(readIndex_(), function (r) { return r.tanggal_iso === iso; });
  return ok_({ mode: 'date', keyword: isoToDisplay_(iso), items: items, total: items.length });
}


function queryByFlight(params) {
  // 使用者打字時很容易多打空格或用小寫，這裡跟寫入時用同一套正規化
  var code = String(params.flight || '').replace(/\s+/g, '').toUpperCase();
  if (!code) return fail_('BAD_INPUT', '請輸入航班號');

  var items = filterForUser_(readIndex_(), function (r) {
    return String(r.flight).replace(/\s+/g, '').toUpperCase() === code;
  });
  return ok_({ mode: 'flight', keyword: code, items: items, total: items.length });
}


/* ══════════════════════════════════════════════════════════════
   共用
   ══════════════════════════════════════════════════════════════ */

/** 套用「近 3 個月」規則，再轉成前端要的格式 */
function filterForUser_(index, match) {
  var cutoff = isoDate_(monthsAgo_(USER_MONTHS_BACK));
  var out = [];
  for (var i = 0; i < index.length; i++) {
    var r = index[i];
    if (r.tanggal_iso < cutoff) continue;
    if (!match(r)) continue;
    out.push(toPublicItem_(r));
  }
  return out;
}


/**
 * _INDEX 的一列 → 前端直接可以畫出來的物件。
 *
 * ⚠️ 日期時間一律在這裡格式化成字串（dd/mm/yyyy、24 小時、雅加達時間）。
 *    傳 ISO 讓前端自己轉的話，台灣的手機會用台北時區多算一小時。
 */
function toPublicItem_(r) {
  var pending = (r.status_code === 'PENDING');

  return {
    id:          r.booking_id,
    // 待定的不給日期，只給狀態（規則 3）
    tanggal:     pending ? '' : isoToDisplay_(r.tanggal_iso),
    arah:        r.arah_code,                       // PICKUP / DROPOFF，文字由前端依語言決定
    status:      r.status_code,
    flight:      r.flight,
    etd_eta:     r.etd_eta,
    dari_pci:    pending ? '' : r.dari_pci,
    pickup:      pending ? '' : isoToDisplayTime_(r.pickup_iso),
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
