/**
 * Health.js — 資料健檢
 *
 *   在 Apps Script 編輯器執行 checkData()，把結果印在執行紀錄上。
 *
 * ⚠️ 這是「兩個寫入口」對策的第四項（設計約定第 7 條）。
 *    直接在 Sheet 上打字一定會有錯——重點不是防止，
 *    是**讓錯誤在害到人之前被發現**。
 *
 * ⚠️ 這一支**只讀不寫**，隨時可以執行，不會改到任何資料。
 *
 * 階段 4 會把同一份結果放進每日系統信，你就不必記得來跑它。
 */

function checkData() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var issues = [];
  var stats = { rows: 0, sheets: 0 };

  // 名冊與航班名冊先讀進來，後面逐列比對
  var roster = readRoster_();
  var flights = {};
  var fsheet = ss.getSheetByName(SHEETS.FLIGHT);
  if (fsheet && fsheet.getLastRow() >= FIRST_DATA_ROW) {
    var fmap = buildColumnMap_(fsheet, FLIGHT_COLUMNS);
    fsheet.getRange(FIRST_DATA_ROW, 1, fsheet.getLastRow() - 1, FLIGHT_COLUMNS.length)
          .getValues().forEach(function (r) {
            var code = str_(r[fmap.flight - 1]).replace(/\s+/g, '').toUpperCase();
            if (code) flights[code] = true;
          });
  }

  var seenIds = {};

  // ── 孤兒分頁（最嚴重：整週的資料都不會出現在 app 上）──
  ss.getSheets().forEach(function (sheet) {
    if (isWeekSheet_(sheet)) return;
    var name = sheet.getName();
    if (name.charAt(0) === '_') return;
    for (var k in SHEETS) { if (SHEETS[k] === name) return; }
    if (looksLikeWeekSheet_(sheet)) {
      issues.push(['🔴 孤兒分頁', '「' + name + '」看起來是週分頁但程式認不得它，' +
                   '這一整週的資料在 app 上查不到。執行 repairWeekSheets() 修復']);
    }
  });

  // ── 逐列檢查 ──
  ss.getSheets().forEach(function (sheet) {
    if (!isWeekSheet_(sheet)) return;
    stats.sheets++;

    var last = sheet.getLastRow();
    if (last < FIRST_DATA_ROW) return;

    var map = buildColumnMap_(sheet, MAIN_COLUMNS);
    var sheetWeek = weekKeyOf_(sheet);
    var values = sheet.getRange(FIRST_DATA_ROW, 1, last - 1, sheet.getLastColumn()).getValues();

    function g(row, code) {
      var i = map[code];
      return i ? str_(row[i - 1]) : '';
    }

    for (var i = 0; i < values.length; i++) {
      var row = values[i];
      var where = sheet.getName() + ' 第 ' + (FIRST_DATA_ROW + i) + ' 列';

      var hasData = false;
      for (var c = 0; c < 17 && c < row.length; c++) {
        if (str_(row[c]) !== '') { hasData = true; break; }
      }
      if (!hasData) continue;
      stats.rows++;

      var who = g(row, 'name') || '(無姓名)';
      var tanggal = cellToDate_(map.tanggal ? row[map.tanggal - 1] : '');

      // 1. 日期
      if (!tanggal) {
        issues.push(['🔴 缺航班日期', where + '　' + who + '：沒有日期，這一筆不會出現在 app 上']);
        continue;                                    // 沒日期，後面的檢查沒有意義
      }

      // 2. 日期跟分頁對不上
      if (sheetWeek && isoDate_(weekStart_(tanggal)) !== sheetWeek) {
        issues.push(['🟡 日期不屬於這個分頁', where + '　' + who + '：日期是 ' +
                     isoToDisplay_(isoDate_(tanggal)) + '，應該放在「' +
                     weekSheetName_(tanggal) + '」。app 上查得到，只是 Sheet 上看起來會亂']);
      }

      // 3. booking_id
      var id = g(row, 'booking_id');
      if (!id) {
        issues.push(['🟡 缺 booking_id', where + '　' + who +
                     '：執行 backfillBookingIds() 補上']);
      } else if (seenIds[id]) {
        issues.push(['🔴 booking_id 重複', where + '　' + who + '：' + id +
                     ' 跟 ' + seenIds[id] + ' 撞號，改資料時會改到錯的那一筆']);
      } else {
        seenIds[id] = where;
      }

      // 4. 出廠時間
      var pci = g(row, 'dari_pci');
      if (pci && !parseDariPci_(pci, tanggal)) {
        issues.push(['🟡 出廠時間看不懂', where + '　' + who + '：「' + pci +
                     '」。當天出車寫 20:00，前一天寫 30/08 20:00（日在前）']);
      }

      // 5. 接／送 與 狀態必須認得
      var arah = g(row, 'arah');
      if (!arah) issues.push(['🟡 沒有接／送', where + '　' + who]);
      else if (['PICKUP', 'DROPOFF'].indexOf(codeOf_(arah)) < 0) {
        issues.push(['🟡 接／送是未知值', where + '　' + who + '：「' + arah + '」']);
      }
      var st = g(row, 'status');
      if (st && ['SCHEDULED', 'DONE', 'POSTPONED', 'PENDING', 'CANCELLED'].indexOf(codeOf_(st)) < 0) {
        issues.push(['🟡 狀態是未知值', where + '　' + who + '：「' + st + '」']);
      }

      // 6. email 不在名冊（不是錯，但通常表示名冊還沒補）
      var email = g(row, 'email').toLowerCase();
      if (email && !roster.byEmail[email]) {
        issues.push(['🔵 名冊查無此信箱', where + '　' + who + '：' + email +
                     '。補進 ' + SHEETS.PERSON + ' 之後就能自動帶入資料']);
      }

      // 7. 航班號不在航班名冊
      var fl = g(row, 'flight').replace(/\s+/g, '').toUpperCase();
      if (fl && !flights[fl]) {
        issues.push(['🔵 航班名冊沒有這個航班', where + '　' + who + '：' + fl +
                     '。補進 ' + SHEETS.FLIGHT + ' 之後就能自動帶入起降時間']);
      }
      if (fl && fl !== g(row, 'flight')) {
        issues.push(['🟡 航班號有多餘空格或小寫', where + '　' + who + '：「' +
                     g(row, 'flight') + '」應為「' + fl + '」。程式搜尋時會找不到']);
      }
    }
  });

  checkPersonRoster_(ss, issues, stats);
  checkFlightRoster_(ss, issues, stats, flights);

  // ── 輸出 ──
  var L = [];
  L.push('資料健檢　' + nowStampText_());
  L.push('掃描 ' + stats.rows + ' 筆接送資料（' + stats.sheets + ' 個週分頁）、' +
         (stats.persons || 0) + ' 筆人員名冊、' + (stats.flights || 0) + ' 筆航班名冊');
  L.push('');

  if (!issues.length) {
    L.push('✓ 沒有發現問題');
  } else {
    // 依嚴重度分組：🔴 一定要處理　🟡 建議處理　🔵 只是提醒
    var groups = {};
    issues.forEach(function (x) { (groups[x[0]] = groups[x[0]] || []).push(x[1]); });
    L.push('發現 ' + issues.length + ' 項：');
    L.push('（🔴 一定要處理　🟡 建議處理　🔵 只是提醒，不影響功能）');
    Object.keys(groups).sort().forEach(function (k) {
      L.push('');
      L.push('【' + k + '】' + groups[k].length + ' 項');
      groups[k].slice(0, 30).forEach(function (m) { L.push('  ' + m); });
      if (groups[k].length > 30) L.push('  …（還有 ' + (groups[k].length - 30) + ' 項）');
    });
  }

  var out = L.join('\n');
  Logger.log(out);
  return out;
}


/* ══════════════════════════════════════════════════════════════
   名冊的檢查

   ⚠️ 這裡特別檢查「型別」。從 Excel 貼過來時，Sheet 很容易把
      5010070017 判斷成數字、502Z039000 判斷成文字——同一欄兩種型別，
      篩選部門就會漏資料，而畫面上只有「靠左 / 靠右」的差別，
      不特別看根本不會發現。
   ══════════════════════════════════════════════════════════════ */

/** 這一格是數字型別嗎（該是文字卻變成數字＝從 Excel 貼過來時被轉掉了） */
function isNumericCell_(v) { return typeof v === 'number'; }


function checkPersonRoster_(ss, issues, stats) {
  var sheet = ss.getSheetByName(SHEETS.PERSON);
  if (!sheet || sheet.getLastRow() < FIRST_DATA_ROW) return;

  var map = buildColumnMap_(sheet, PERSON_COLUMNS);
  var values = sheet.getRange(FIRST_DATA_ROW, 1, sheet.getLastRow() - 1,
                              sheet.getLastColumn()).getValues();
  var seen = {};
  var n = 0;

  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var where = SHEETS.PERSON + ' 第 ' + (FIRST_DATA_ROW + i) + ' 列';
    var email = str_(row[map.email - 1]).toLowerCase();
    var name = str_(row[map.name - 1]);
    if (!email && !name) continue;
    n++;

    if (!email) { issues.push(['🟡 名冊缺 email', where + '　' + name + '：沒有 email 就無法帶入，使用者也查不到']); }
    else if (!looksLikeEmail_(email)) { issues.push(['🟡 名冊 email 格式怪', where + '：' + email]); }

    if (!name) issues.push(['🟡 名冊缺英文姓名', where + '：' + email]);

    if (!str_(row[map.person_id - 1]) && email && name) {
      issues.push(['🟡 名冊缺 person_id', where + '　' + name + '：執行 backfillRosterIds() 補上']);
    }

    // ⚠️ email 可以重複（眷屬共用），但「同一個 email ＋ 同一個姓名」重複就是打了兩次
    var key = email + '|' + name.toLowerCase();
    if (seen[key]) issues.push(['🔴 名冊重複', where + '：' + name + ' / ' + email + ' 跟 ' + seen[key] + ' 完全一樣']);
    else seen[key] = where;

    if (isNumericCell_(row[map.dept - 1])) {
      issues.push(['🟡 部門代碼變成數字', where + '　' + name +
                   '：這一欄必須是文字。選取整欄 → 格式 → 數值 → 純文字，再重打一次']);
    }
    if (isNumericCell_(row[map.hp - 1])) {
      issues.push(['🟡 手機號碼變成數字', where + '　' + name + '：開頭的 0 會不見。整欄設成純文字']);
    }
    if (isNumericCell_(row[map.dorm - 1])) {
      issues.push(['🟡 房號變成數字', where + '　' + name + '：整欄設成純文字']);
    }
  }
  stats.persons = n;
}


function checkFlightRoster_(ss, issues, stats, flightsSeen) {
  var sheet = ss.getSheetByName(SHEETS.FLIGHT);
  if (!sheet || sheet.getLastRow() < FIRST_DATA_ROW) return;

  var map = buildColumnMap_(sheet, FLIGHT_COLUMNS);
  var values = sheet.getRange(FIRST_DATA_ROW, 1, sheet.getLastRow() - 1,
                              sheet.getLastColumn()).getValues();
  var seen = {};
  var n = 0;

  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var where = SHEETS.FLIGHT + ' 第 ' + (FIRST_DATA_ROW + i) + ' 列';
    var raw = str_(row[map.flight - 1]);
    if (!raw) continue;
    n++;

    var code = raw.replace(/\s+/g, '').toUpperCase();
    if (code !== raw) {
      issues.push(['🟡 航班號有空格或小寫', where + '：「' + raw + '」應為「' + code +
                   '」。點一下那一格重打就會自動修正']);
    }
    if (seen[code]) issues.push(['🔴 航班號重複', where + '：' + code + ' 跟 ' + seen[code] + ' 撞號']);
    else seen[code] = where;

    var waktu = str_(row[map.waktu - 1]);
    if (!waktu) {
      issues.push(['🟡 航班缺時間', where + '：' + code + ' 沒有起降時間，輸入接送資料時不會自動帶入']);
    } else if (!/^\d{1,2}:\d{2}$/.test(waktu)) {
      issues.push(['🟡 航班時間格式不對', where + '：' + code + ' 的「' + waktu +
                   '」不是 HH:MM。⚠️ 從 Excel 貼過來的時間常常會變成日期值']);
    }
    if (!str_(row[map.jenis - 1])) {
      issues.push(['🔵 航班沒有標抵達/起飛', where + '：' + code]);
    }
  }
  stats.flights = n;
}


/**
 * 補上名冊缺的編號。
 *
 * 用途：一次貼超過 200 列時，onEdit 只處理得了前 200 列（那是為了
 * 不超過 30 秒上限而設的保險），剩下的要靠這一支補。
 * 重複執行是安全的——已經有編號的不會被動到。
 */
function backfillRosterIds() {
  var out = [];
  out.push(backfillOneRoster_(SHEETS.PERSON, PERSON_COLUMNS, 'person_id', 'P',
                              ['email', 'name']));
  out.push(backfillOneRoster_(SHEETS.VEHICLE, VEHICLE_COLUMNS, 'kendaraan_id', 'K',
                              ['kendaraan']));
  var msg = out.join('\n');
  Logger.log(msg);
  return msg;
}


function backfillOneRoster_(sheetName, columns, idCode, prefix, requiredCodes) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < FIRST_DATA_ROW) return sheetName + '：沒有資料';

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return sheetName + '：忙碌中，這次略過';

  try {
    var map = buildColumnMap_(sheet, columns);
    var iId = map[idCode];
    var values = sheet.getRange(FIRST_DATA_ROW, 1, sheet.getLastRow() - 1,
                                sheet.getLastColumn()).getValues();
    var next = nextSeqId_(sheet, iId - 1, prefix);
    var filled = 0;

    for (var i = 0; i < values.length; i++) {
      var row = values[i];
      var ready = requiredCodes.every(function (c) { return str_(row[map[c] - 1]) !== ''; });
      if (!ready) continue;
      if (str_(row[iId - 1])) continue;
      setTextCell_(sheet, FIRST_DATA_ROW + i, iId, prefix + pad3_(next++));
      filled++;
    }
    return sheetName + '：補上 ' + filled + ' 個編號';
  } finally {
    lock.releaseLock();
  }
}
