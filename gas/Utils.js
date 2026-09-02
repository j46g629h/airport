/**
 * Utils.js — 全專案共用的小工具
 *
 * 這裡只放「不依賴任何特定功能」的東西：回應格式、欄位定位、日期解析、記錄。
 * 有功能相依的請放到各自的檔案。
 */


/* ══════════════════════════════════════════════════════════════
   API 回應
   ══════════════════════════════════════════════════════════════ */

/**
 * ⚠️ 一律回 HTTP 200 + JSON，錯誤也是。
 *    回 4xx/5xx 的話 Apps Script 會吐一頁 HTML，前端 JSON.parse 會炸開，
 *    使用者看到的錯誤訊息會跟他實際遇到的事完全對不上。
 */
function jsonOut_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function ok_(data)          { return jsonOut_({ ok: true, data: data, v: SYSTEM_INFO.version }); }
function fail_(code, msg)   { return jsonOut_({ ok: false, error: code, message: msg, v: SYSTEM_INFO.version }); }


/* ══════════════════════════════════════════════════════════════
   欄位定位
   ══════════════════════════════════════════════════════════════ */

/** 依 code 找欄號（1 起算）。找不到就是程式寫錯了，直接丟例外。 */
function colIndexOf_(columns, code) {
  var i = colIndexOrZero_(columns, code);
  if (!i) throw new Error('欄位定義裡找不到 code = ' + code);
  return i;
}

/**
 * 同上，但找不到回傳 0 而不丟例外。
 * 給標了 optional 的欄位用——那種欄位可能還沒加到 Sheet 上，
 * 呼叫端要自己檢查回傳值（設計約定第 12 條）。
 */
function colIndexOrZero_(columns, code) {
  for (var i = 0; i < columns.length; i++) {
    if (columns[i].code === code) return i + 1;
  }
  return 0;
}

/**
 * 依 Sheet 上「實際的表頭文字」建立 code → 欄號 的對照。
 *
 * ⚠️ 為什麼不直接用 XXX_COLUMNS 的順序：
 *    有人在 Sheet 上插入或搬動欄位之後，順序就不是定義的順序了。
 *    照順序讀會整批錯位讀到隔壁欄，而且不會報錯。
 *
 * ⚠️ 找不到必要欄位就丟例外，讓它在部署時就爆掉，
 *    而不是安靜地讀到空值、幾天後才有人發現資料是空的。
 *    標了 optional 的欄位找不到就跳過，對照表裡不會有那個 key——
 *    **呼叫端一定要檢查**，`getRange(row, undefined)` 會炸。
 */
function buildColumnMap_(sheet, columns) {
  var lastCol = sheet.getLastColumn();
  var header = lastCol ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  var pos = {};
  header.forEach(function (h, i) {
    var key = normHeader_(h);
    if (key && !(key in pos)) pos[key] = i + 1;
  });

  var map = {};
  var missing = [];
  columns.forEach(function (col) {
    var i = pos[normHeader_(col.name)];
    if (i) { map[col.code] = i; return; }
    if (!col.optional) missing.push(col.name);
  });

  if (missing.length) {
    throw new Error('分頁「' + sheet.getName() + '」缺少欄位：' + missing.join('、') +
                    '。請執行 setupSheet() 補回表頭。');
  }
  return map;
}

/** 表頭比對前先正規化：換行、連續空白都壓成一個空格 */
function normHeader_(s) {
  return String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
}


/* ══════════════════════════════════════════════════════════════
   日期與時間

   ⚠️ 全系統一律 dd/mm/yyyy、24 小時、Asia/Jakarta。
      後端一律傳「已經格式化好的字串」給前端，不要傳 ISO 讓前端自己轉——
      JS 的 new Date() 用的是看的人那台裝置的時區，台灣的手機會多算一小時。
   ══════════════════════════════════════════════════════════════ */

function tz_() {
  try {
    return SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone() || SYSTEM_INFO.timezone;
  } catch (e) {
    return SYSTEM_INFO.timezone;
  }
}

function pad2_(n) { return (n < 10 ? '0' : '') + n; }

/** Date → 'YYYY-MM-DD'（存進 _INDEX 用，字串比大小就等於比日期） */
function isoDate_(d) {
  return d.getFullYear() + '-' + pad2_(d.getMonth() + 1) + '-' + pad2_(d.getDate());
}

/** Date → 'YYYY-MM-DDTHH:mm' */
function isoDateTime_(d) {
  return isoDate_(d) + 'T' + pad2_(d.getHours()) + ':' + pad2_(d.getMinutes());
}

/** 'YYYY-MM-DD' → 'dd/mm/yyyy'（給人看的） */
function isoToDisplay_(iso) {
  var m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? (m[3] + '/' + m[2] + '/' + m[1]) : '';
}

/** 'YYYY-MM-DDTHH:mm' → 'dd/mm/yyyy HH:mm' */
function isoToDisplayTime_(iso) {
  var m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  return m ? (m[3] + '/' + m[2] + '/' + m[1] + ' ' + m[4] + ':' + m[5]) : '';
}

/** 'dd/mm/yyyy' → Date。⚠️ 一律 dd/mm，不是 mm/dd。 */
function parseDMY_(s) {
  s = String(s == null ? '' : s).trim();
  var m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (!m) return null;
  var d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  if (d.getDate() !== Number(m[1]) || d.getMonth() !== Number(m[2]) - 1) return null;
  return d;
}

/** 儲存格的值 → Date（是日期值就直接用，是 'dd/mm/yyyy' 字串就解析） */
function cellToDate_(v) {
  if (v instanceof Date) return new Date(v.getFullYear(), v.getMonth(), v.getDate());
  return parseDMY_(v);
}

/**
 * 出廠時間 DARI PCI 的容錯解析。
 *
 * 這一欄在 Sheet 上是**純文字**，兩種寫法：
 *   '20:00'        → 航班當天 20:00
 *   '30/08 20:00'  → 8 月 30 日 20:00（日在前，不是月）
 *
 * ⚠️ 年份要從航班日推出來，而且要處理跨年：
 *    航班 01/01/2027 凌晨的班機，車子 31/12 20:00 出發 —— 那是 2026 年。
 *    只用航班日的年份會算成 31/12/2027，整整差一年。
 *
 * 看不懂就回傳 null，不猜。看不懂的會被每日健檢列出來。
 */
function parseDariPci_(text, tanggalDate) {
  var s = String(text == null ? '' : text).trim();
  if (!s || !tanggalDate) return null;

  var m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m) {
    return new Date(tanggalDate.getFullYear(), tanggalDate.getMonth(), tanggalDate.getDate(),
                    Number(m[1]), Number(m[2]));
  }

  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})\s+(\d{1,2}):(\d{2})$/);
  if (m) {
    var day = Number(m[1]), mon = Number(m[2]) - 1;
    var d = new Date(tanggalDate.getFullYear(), mon, day, Number(m[3]), Number(m[4]));
    if (d.getDate() !== day || d.getMonth() !== mon) return null;      // 例如 31/02
    // 算出來的出車時間比航班日還晚很多 → 一定是跨年，退一年
    if (d.getTime() - tanggalDate.getTime() > 60 * 24 * 3600 * 1000) d.setFullYear(d.getFullYear() - 1);
    return d;
  }
  return null;
}

/**
 * 這一趟「算是過去了」的時間點。
 *
 * ⚠️ 全專案只有這一個地方判斷「過去了沒」，Query.js 顯示用的、
 *    Status.js 寫回 Sheet 用的都呼叫它。
 *    兩邊各寫一套的話，遲早會出現「畫面說已完成、Sheet 說已排定」。
 *
 * 沒有起降時間就取那一天的 23:59——寧可晚一點才算過去，
 * 也不要在人還在等車的時候就把他的行程標成已完成。
 */
function flightEndsAt_(tanggalIso, etdEta) {
  var d = String(tanggalIso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!d) return null;
  var t = String(etdEta || '').match(/^(\d{1,2}):(\d{2})$/);
  var hh = t ? Number(t[1]) : 23;
  var mm = t ? Number(t[2]) : 59;
  return new Date(Number(d[1]), Number(d[2]) - 1, Number(d[3]), hh, mm);
}

/**
 * 依時間推算出來的「實際狀態」。
 *
 * 已排定的行程，時間過了就是已完成——沒有人會為了每一筆去 Sheet 上手動改，
 * 不自動判斷的話那個欄位對過去的資料就永遠是錯的。
 *
 * ⚠️ 只動 SCHEDULED。已取消、待定、已改期都是人刻意設定的決定，
 *    程式不可以覆蓋——把一筆「已取消」自動改成「已完成」會讓人以為車來過了。
 */
function effectiveStatus_(statusCode, tanggalIso, etdEta) {
  if (statusCode !== 'SCHEDULED') return statusCode;
  var end = flightEndsAt_(tanggalIso, etdEta);
  if (end && end.getTime() < new Date().getTime()) return 'DONE';
  return statusCode;
}

/** 今天（只有年月日） */
function today_() {
  var n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

/** n 個月前的今天 */
function monthsAgo_(n) {
  var d = today_();
  d.setMonth(d.getMonth() - n);
  return d;
}

function nowStampText_() {
  return Utilities.formatDate(new Date(), tz_(), 'dd/MM/yyyy HH:mm');
}


/* ══════════════════════════════════════════════════════════════
   雙語顯示文字 → 代碼
   ══════════════════════════════════════════════════════════════ */

/**
 * Sheet 上存的是雙語顯示文字（'Jemput'、'Terjadwal 已排定'…），
 * 程式內部一律用代碼。這裡是**全專案唯一**的轉換點。
 * 對照表在 Config.js 的 CODE_OF。
 */
function codeOf_(text) {
  var s = String(text == null ? '' : text).trim();
  if (!s) return '';
  return CODE_OF[s] || s;      // 認不得就原樣回傳，讓它出現在健檢報告裡而不是變成空值
}


/* ══════════════════════════════════════════════════════════════
   錯誤記錄
   ══════════════════════════════════════════════════════════════ */

/**
 * 寫一筆到 LOG 分頁。
 * ⚠️ 記錄失敗絕對不能讓主要功能跟著失敗，所以整支包在 try/catch 裡。
 */
function logIt_(level, source, message, detail) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.LOG);
    if (!sheet) return;
    sheet.appendRow([nowStampText_(), String(source), String(level),
                     String(message), String(detail == null ? '' : detail)]);
  } catch (e) {
    Logger.log('寫 LOG 失敗：' + e.message);
  }
}

function logError_(source, message, detail) { logIt_('ERROR', source, message, detail); }
function logInfo_(source, message, detail)  { logIt_('INFO',  source, message, detail); }
