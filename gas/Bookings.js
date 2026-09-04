/**
 * Bookings.js — 接送資料的編號與共用邏輯
 *
 * ⚠️ booking_id 是全系統認一筆接送資料的唯一依據（設計約定第 3 條）。
 *    絕對不可以用列號——有人在 Sheet 上插一列、刪一列，所有列號就全錯了。
 *    所以**每一列都必須有 booking_id**，不管它是從 app 建的還是手打的。
 */

/** 流水號的計數器前綴（存在 PropertiesService） */
var SEQ_KEY_PREFIX = 'bkseq_';


/**
 * 產生下一個 booking_id，例如 AP2609037。
 *
 * ⚠️ 計數器存在 PropertiesService，**只會往上加，不會回頭用**。
 *    刪掉一筆之後號碼不補回去是刻意的——重複使用編號的話，
 *    舊的紀錄（LOG、信件、別人抄在紙上的）會指到另一筆完全不同的資料。
 *
 * ⚠️ 一定要在 LockService 裡呼叫。兩個人同時新增時，
 *    沒上鎖會拿到同一個號碼，那比沒有號碼更糟——
 *    程式會以為是同一筆，改 A 的時候改到 B。
 */
function nextBookingId_(dateObj) {
  var ym = Utilities.formatDate(dateObj, tz_(), 'yyMM');
  var props = PropertiesService.getScriptProperties();
  var key = SEQ_KEY_PREFIX + ym;

  var cur = Number(props.getProperty(key) || 0);
  if (!cur) cur = scanMaxBookingSeq_(ym);   // 第一次用到這個月份，掃一次現有資料當起點
  cur += 1;
  props.setProperty(key, String(cur));

  return 'AP' + ym + pad3_(cur);
}


/**
 * 掃出某個年月現有最大的流水號。
 * 只有在計數器不存在時才會跑（每個月一次），所以掃全部分頁是可接受的。
 */
function scanMaxBookingSeq_(ym) {
  var re = new RegExp('^AP' + ym + '(\\d+)$', 'i');
  var max = 0;
  SpreadsheetApp.getActiveSpreadsheet().getSheets().forEach(function (sheet) {
    if (!isWeekSheet_(sheet)) return;
    var last = sheet.getLastRow();
    if (last < FIRST_DATA_ROW) return;
    var map = buildColumnMap_(sheet, MAIN_COLUMNS);
    if (!map.booking_id) return;
    sheet.getRange(FIRST_DATA_ROW, map.booking_id, last - 1, 1).getValues()
         .forEach(function (r) {
           var m = str_(r[0]).match(re);
           if (m && Number(m[1]) > max) max = Number(m[1]);
         });
  });
  return max;
}


/**
 * 補上所有缺 booking_id 的列。
 *
 * 手動執行。用途：
 *   - 現在（app 的新增功能還沒做，資料都是直接打在 Sheet 上）
 *   - 日後若發現有漏網之魚
 *
 * 重複執行是安全的——已經有編號的不會被動到。
 */
function backfillBookingIds() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return '另一個作業正在進行中，這次略過';

  try {
    var filled = [];
    var problems = [];

    SpreadsheetApp.getActiveSpreadsheet().getSheets().forEach(function (sheet) {
      if (!isWeekSheet_(sheet)) return;
      var last = sheet.getLastRow();
      if (last < FIRST_DATA_ROW) return;

      var map = buildColumnMap_(sheet, MAIN_COLUMNS);
      var width = sheet.getLastColumn();
      var values = sheet.getRange(FIRST_DATA_ROW, 1, last - 1, width).getValues();

      for (var i = 0; i < values.length; i++) {
        var row = values[i];
        var rowNum = FIRST_DATA_ROW + i;

        var hasData = false;
        for (var c = 0; c < 17 && c < row.length; c++) {
          if (str_(row[c]) !== '') { hasData = true; break; }
        }
        if (!hasData) continue;
        if (str_(row[map.booking_id - 1])) continue;      // 已經有編號

        var tanggal = cellToDate_(row[map.tanggal - 1]);
        if (!tanggal) {
          problems.push(sheet.getName() + ' 第 ' + rowNum + ' 列：沒有航班日期，無法編號');
          continue;
        }
        var id = nextBookingId_(tanggal);
        setTextCell_(sheet, rowNum, map.booking_id, id);
        filled.push(sheet.getName() + ' 第 ' + rowNum + ' 列 → ' + id);
      }
    });

    if (filled.length) markIndexDirty_();

    var msg = '補上 ' + filled.length + ' 個 booking_id';
    if (filled.length) msg += '：\n  ' + filled.slice(0, 60).join('\n  ') +
                              (filled.length > 60 ? '\n  …（還有 ' + (filled.length - 60) + ' 筆）' : '');
    if (problems.length) msg += '\n\n無法處理 ' + problems.length + ' 列：\n  ' + problems.join('\n  ');
    Logger.log(msg);
    return msg;

  } finally {
    lock.releaseLock();
  }
}


/* ══════════════════════════════════════════════════════════════
   寫入 API（v3.0）

   ⚠️ 這是 app 第一次能改動真實資料。三條規則貫穿下面每一支：

   1. **一律用 booking_id 找列，絕對不用 row_num。**
      row_num 只是列表送過來的提示，有人在 Sheet 上插一列、刪一列，
      它就全錯了——而錯的樣子是「改到隔壁那個人的資料」，
      不會報錯，也不會有人立刻發現。

   2. **一律上 LockService。** app 寫入的同時可能有人在 Sheet 上編輯，
      兩邊會互相覆蓋（設計約定第 7 條第 5 點）。

   3. **改完要立刻補 _INDEX 那一列。** _INDEX 是 5 分鐘才整張重建一次，
      不補的話管理者存檔後畫面還是舊值，他的第一個反應一定是
      「沒存進去」，然後再改一次。
   ══════════════════════════════════════════════════════════════ */

/**
 * 表單能寫哪些欄位。**白名單，不是黑名單。**
 *
 * ⚠️ 用白名單是因為前端送過來的東西一律不可信：任何人都能繞過畫面
 *    直接打 API，送一包 {booking_id:'AP...', updated_by:'別人'} 進來。
 *    黑名單只要漏一個欄位就是一個洞，白名單漏了只是那一欄改不到。
 *
 * 刻意**不在**這裡的：
 *   booking_id  系統產生，改了等於把兩筆資料的身分互換
 *   updated_at / updated_by  系統自己蓋
 *   permintaan(T)  使用者填的需求，管理者不該蓋掉（Q 欄才是管理者的備註）
 *   tanggal_asal(W)  使用者 2026-09-05 決定不自動記錄改期
 */
var BOOKING_EDITABLE = [
  // 常改的
  'tanggal', 'arah', 'flight', 'etd_eta', 'dari_pci', 'titik_jemput',
  'status', 'bagasi', 'remark',
  // 派車（Z/AA/AB）⚠️ optional 欄位，Sheet 上可能不存在，setTextCell_ 會自己跳過
  'kendaraan', 'sopir', 'hp_sopir',
  // 人員資料（名冊快照，設計約定第 4 條）
  'name', 'nama_cina', 'factory', 'dept', 'dorm', 'hp',
  'email', 'email_kontak', 'custom', 'povs', 'group_id'
];

/**
 * 不能清空的欄位。
 *
 * ⚠️ tanggal 是最重要的一條：A 欄的日期決定這一筆放在哪一張週分頁，
 *    清空的話它會**從系統裡消失**——查詢查不到、索引收不到、
 *    而 Sheet 上那一列還在。這個坑寫在設計約定第 1 條。
 */
var BOOKING_REQUIRED = ['tanggal', 'arah', 'status', 'name'];


/**
 * 用 booking_id 找出那一列在哪裡。
 * @return {Object|null} { sheet, rowNum, map, values }
 */
function findBookingRow_(bookingId) {
  var id = str_(bookingId);
  if (!id) return null;

  var found = null;
  SpreadsheetApp.getActiveSpreadsheet().getSheets().forEach(function (sheet) {
    if (found || !isWeekSheet_(sheet)) return;
    var last = sheet.getLastRow();
    if (last < FIRST_DATA_ROW) return;

    var map = buildColumnMap_(sheet, MAIN_COLUMNS);
    if (!map.booking_id) return;

    var ids = sheet.getRange(FIRST_DATA_ROW, map.booking_id, last - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      if (str_(ids[i][0]) === id) {
        var rowNum = FIRST_DATA_ROW + i;
        found = {
          sheet: sheet, rowNum: rowNum, map: map,
          values: sheet.getRange(rowNum, 1, 1, sheet.getLastColumn()).getValues()[0]
        };
        return;
      }
    }
  });
  return found;
}


/**
 * POST { action:'updateBooking', token, booking_id, fields:{...} }
 *
 * fields 只會用到 BOOKING_EDITABLE 列出來的鍵，其餘一律忽略。
 * 沒送的欄位維持原值（部分更新），送空字串就是清空。
 */
function updateBooking(params, session) {
  var id = str_(params.booking_id);
  if (!id) return fail_('BOOKING_ID_REQUIRED');

  var fields = params.fields;
  if (typeof fields === 'string') {
    try { fields = JSON.parse(fields); } catch (e) { return fail_('FIELDS_INVALID'); }
  }
  if (!fields || typeof fields !== 'object') return fail_('FIELDS_INVALID');

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return fail_('BUSY');

  try {
    var hit = findBookingRow_(id);
    if (!hit) return fail_('BOOKING_NOT_FOUND');

    /* 只留白名單裡、而且這次真的有送過來的欄位 */
    var patch = {};
    BOOKING_EDITABLE.forEach(function (code) {
      if (Object.prototype.hasOwnProperty.call(fields, code)) patch[code] = str_(fields[code]);
    });

    /* 必填檢查。⚠️ 要拿「改完之後的值」來檢查，不是只看這次送了什麼——
       沒送的欄位維持原值，那也算有值。 */
    var newDateText = Object.prototype.hasOwnProperty.call(patch, 'tanggal')
      ? patch.tanggal
      : isoDate_(cellToDate_(hit.values[hit.map.tanggal - 1]) || new Date(0));
    for (var i = 0; i < BOOKING_REQUIRED.length; i++) {
      var code = BOOKING_REQUIRED[i];
      if (!Object.prototype.hasOwnProperty.call(patch, code)) continue;   // 沒動到就不管
      if (!patch[code]) return fail_('FIELD_REQUIRED', code);
    }

    /* 日期：前端送 'YYYY-MM-DD'（<input type="date"> 的規格值）。
       ⚠️ 不要接受 dd/mm/yyyy——同一個 API 收兩種格式，
          總有一天會收到 03/09 而分不出是 3 月 9 日還是 9 月 3 日。 */
    var newDate = null;
    if (Object.prototype.hasOwnProperty.call(patch, 'tanggal')) {
      newDate = isoTextToDate_(patch.tanggal);
      if (!newDate) return fail_('DATE_INVALID');
    }

    /* 狀態與接／送要是認得的代碼，寫進去的是 Sheet 上的雙語顯示文字 */
    if (Object.prototype.hasOwnProperty.call(patch, 'status')) {
      var st = labelOfStatus_(patch.status);
      if (!st) return fail_('STATUS_INVALID');
      patch.status = st;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'arah')) {
      var ar = labelOfArah_(patch.arah);
      if (!ar) return fail_('ARAH_INVALID');
      patch.arah = ar;
    }

    /* 航班號一律去空格轉大寫（來源資料有 'CZ 8056' 和 ' CZ8353' 兩種寫法） */
    if (Object.prototype.hasOwnProperty.call(patch, 'flight')) {
      patch.flight = patch.flight.replace(/\s+/g, '').toUpperCase();
    }

    var oldDate = cellToDate_(hit.values[hit.map.tanggal - 1]);
    var moved = '';

    /* ⚠️ 跨週要搬分頁。09/18 改成 09/25 就得從第 38 週搬到第 39 週——
       不搬的話那一列會躺在錯的分頁上，Sheet 看起來亂，
       而且每日重建會把它當成「日期不屬於這個分頁」報出來。 */
    if (newDate && (!oldDate || isoDate_(weekStart_(newDate)) !== isoDate_(weekStart_(oldDate)))) {
      moved = moveBookingToWeek_(hit, patch, newDate, session);
    } else {
      writeBookingPatch_(hit.sheet, hit.rowNum, hit.map, patch, newDate, session);
    }

    /* ⚠️ **只有補列失敗時才標記整張重建。**
       v3.0 這裡是無條件 markIndexDirty_() ＋ patchIndexRow_() 兩件都做，
       那是錯的——補完那一列之後索引已經是對的，不需要整張重建。

       後果很具體：每改一筆，5 分鐘後的排程就會做一次 19~24 秒的整張重建，
       而重建會佔住 script lock 20 秒，那段時間管理者按儲存會等很久甚至拿到 BUSY。
       更糟的是排程配額——Index.js 檔頭算過「每 5 分鐘重建 = 一天 93 分鐘，
       而配額是 90 分鐘／天」。配額用完時 Google 會直接停掉排程，
       **而且不會有任何錯誤訊息**，只會發現「下午的資料都沒更新」。

       索引仍有兩道保險：超過 INDEX_MAX_AGE_HOURS（6 小時）強制重建、
       每天 03:00 整張重建。所以少標記一次不會讓索引永遠是舊的。 */
    if (!patchIndexRow_(id)) markIndexDirty_();

    logInfo_('updateBooking', '修改 ' + id,
             session.account + '　' + Object.keys(patch).join(',') + (moved ? '　' + moved : ''));

    return ok_({ booking_id: id, moved: moved, item: adminItemById_(id) });

  } finally {
    lock.releaseLock();
  }
}


/**
 * 把一列搬到另一張週分頁。
 *
 * ⚠️ 順序是「先在新分頁寫好，再刪舊的」。反過來的話，
 *    中間任何一步失敗（配額用完、逾時）都會讓那一筆**憑空消失**。
 *    這樣做最壞的情況是多一份重複，而重複看得到、也救得回來。
 *
 * ⚠️ booking_id 不變。它是全系統認這一筆的唯一依據，
 *    搬個位置就換號的話，LOG、信件、別人抄在紙上的都會指到空的。
 */
function moveBookingToWeek_(hit, patch, newDate, session) {
  var target = ensureWeekSheet(newDate);
  var tMap = buildColumnMap_(target, MAIN_COLUMNS);
  var width = Math.max(hit.sheet.getLastColumn(), target.getLastColumn());

  /* 整列原樣複製過去（依表頭對應，不是依位置——兩張分頁的欄序理論上一樣，
     但「理論上一樣」正是安靜出錯的溫床） */
  var newRow = target.getLastRow() + 1;
  MAIN_COLUMNS.forEach(function (col) {
    var from = hit.map[col.code], to = tMap[col.code];
    if (!from || !to) return;                    // optional 欄位可能不存在
    setTextCell_(target, newRow, to, str_(hit.values[from - 1]));
  });

  writeBookingPatch_(target, newRow, tMap, patch, newDate, session);
  hit.sheet.deleteRow(hit.rowNum);

  return hit.sheet.getName() + ' → ' + target.getName();
}


/** 把 patch 寫進指定的列，順便蓋上「最後更新時間」與「更新者」 */
function writeBookingPatch_(sheet, rowNum, map, patch, newDate, session) {
  Object.keys(patch).forEach(function (code) {
    if (code === 'tanggal') return;              // 日期另外處理（要寫成真的日期）
    setTextCell_(sheet, rowNum, map[code], patch[code]);
  });

  if (newDate && map.tanggal) {
    /* ⚠️ 日期欄寫的是真正的 Date，不是文字——A 欄要能排序、能比較。
       這一欄的數字格式由 applyStructure_ 設成 dd/mm/yyyy。 */
    sheet.getRange(rowNum, map.tanggal).setValue(newDate);
  }

  setTextCell_(sheet, rowNum, map.updated_at, nowStampText_());
  setTextCell_(sheet, rowNum, map.updated_by, session.account);
}


/**
 * POST { action:'deleteBooking', token, booking_id }
 *
 * ⚠️ **實際刪列**，不是把狀態改成已取消（使用者 2026-09-04 決定）。
 *    兩種在畫面上長得一樣，意義完全不同：真的取消行程要留紀錄（已取消），
 *    建錯的、重複的才該刪掉。
 *
 * ⚠️ 使用者 2026-09-05 決定**不做整列備份**。誤刪的救法是
 *    Google Sheet 自己的「檔案 → 版本紀錄」。
 *    這裡只留一行 LOG 記「誰、什麼時候、刪了哪一筆」——那是稽核，不是備份。
 */
function deleteBooking(params, session) {
  var id = str_(params.booking_id);
  if (!id) return fail_('BOOKING_ID_REQUIRED');

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return fail_('BUSY');

  try {
    var hit = findBookingRow_(id);
    if (!hit) return fail_('BOOKING_NOT_FOUND');

    var who = str_(hit.values[hit.map.name - 1]);
    var when = cellToDate_(hit.values[hit.map.tanggal - 1]);
    var where = hit.sheet.getName() + ' 第 ' + hit.rowNum + ' 列';

    hit.sheet.deleteRow(hit.rowNum);

    // 同上：移除成功就不必整張重建（見 updateBooking 裡的說明）
    if (!removeIndexRow_(id)) markIndexDirty_();

    logInfo_('deleteBooking', '刪除 ' + id,
             session.account + '　' + who + '　' +
             (when ? isoToDisplay_(isoDate_(when)) : '(無日期)') + '　' + where);

    return ok_({ booking_id: id });

  } finally {
    lock.releaseLock();
  }
}


/* ══════════════════ 小工具 ══════════════════ */

/** 'YYYY-MM-DD' → Date。⚠️ 只吃這一種格式，見 updateBooking 的說明 */
function isoTextToDate_(s) {
  var m = str_(s).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  var y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  var dt = new Date(y, mo - 1, d);
  // 02-31 這種會被 Date 自己捲到 3 月，捲過的就是無效日期
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return dt;
}

/** 代碼（SCHEDULED…）→ Sheet 上存的雙語文字。認不得回傳空字串 */
function labelOfStatus_(code) {
  var want = str_(code).toUpperCase();
  for (var i = 0; i < LIST_STATUS.length; i++) {
    if (codeOf_(LIST_STATUS[i]) === want) return LIST_STATUS[i];
  }
  return '';
}

/** 代碼（PICKUP / DROPOFF）→ 'Jemput' / 'Antar' */
function labelOfArah_(code) {
  var want = str_(code).toUpperCase();
  for (var i = 0; i < LIST_ARAH.length; i++) {
    if (codeOf_(LIST_ARAH[i]) === want) return LIST_ARAH[i];
  }
  return '';
}

/** 改完之後把那一筆重新讀出來給前端，讓畫面就地更新（不必整頁重載） */
function adminItemById_(id) {
  var rows = readIndex_();
  for (var i = 0; i < rows.length; i++) {
    if (str_(rows[i].booking_id) === str_(id)) return toAdminItem_(rows[i]);
  }
  return null;
}
