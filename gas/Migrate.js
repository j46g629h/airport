/**
 * Migrate.js — 狀態標籤搬遷（v2.9）
 *
 * 一次性的工作，但**做成可以重複執行**：已經搬過的列再跑一次不會有事，
 * 因為每一條規則都只認舊值。這很重要——你會需要跑第二次
 * （補完 W 欄之後把剩下的「已改期」轉掉）。
 *
 * ── 三條安全規則 ────────────────────────────────────────
 *
 * 1. **先試跑。** previewMigrateStatus() 一個字都不寫，只印出會改哪幾筆。
 *    這種功能出錯的樣子不是跳錯誤訊息，而是安靜地改掉一堆不該改的東西。
 *
 * 2. **看不懂的一律不動。** 只認得清清楚楚的舊值，其餘原樣留著並列進報告。
 *    猜錯一格就是一筆行程的狀態變成假的。
 *
 * 3. **「已改期」要有 W 欄（原訂日期）才轉。** W 欄空白就把它轉成「已排定」的話，
 *    「這一筆改過期」這件事會**永久消失**——沒有任何地方還記得它。
 *    所以那種列不動，列進報告等人補完 W 欄再跑一次。
 */

/** 試跑：只印出會改哪幾筆，不寫入任何東西 */
function previewMigrateStatus() {
  return migrateStatusLabels_(true);
}

/** 實際執行 */
function migrateStatusLabels() {
  return migrateStatusLabels_(false);
}


/** 舊值 → 新值。只有這裡列出來的會被動到 */
var STATUS_MIGRATION = {
  'Menunggu 待定': 'Menunggu Jadwal 待改期'
};

/** 需要 W 欄（原訂日期）有值才能轉的舊值 */
var STATUS_MIGRATION_NEEDS_ASAL = {
  'Diundur 已改期': 'Terjadwal 已排定'
};


function migrateStatusLabels_(dryRun) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) {
    var busy = '另一個作業正在進行中，這次略過';
    Logger.log(busy);
    return busy;
  }

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var changed = [];       // 會改／已改的
    var blocked = [];       // 想改但條件不足，刻意不動的
    var scanned = 0;
    var touchedSheets = 0;

    ss.getSheets().forEach(function (sheet) {
      if (!isWeekSheet_(sheet)) return;
      var last = sheet.getLastRow();
      if (last < FIRST_DATA_ROW) return;

      /* ⚠️ 欄位位置一律問表頭，不可以用 MAIN_COLUMNS 的定義順序
         （CLAUDE.md「拿掉一個欄位比加一個危險」那一條）。 */
      var map = buildColumnMap_(sheet, MAIN_COLUMNS);
      var statusCol = map.status;
      var asalCol   = map.tanggal_asal;
      if (!statusCol) {
        blocked.push(sheet.getName() + '：找不到 STATUS 欄，整張跳過');
        return;
      }

      var width = sheet.getLastColumn();
      var values = sheet.getRange(FIRST_DATA_ROW, 1, last - 1, width).getValues();
      var updates = [];                       // [列號, 新值]

      for (var i = 0; i < values.length; i++) {
        var row = values[i];
        var rowNum = FIRST_DATA_ROW + i;
        var raw = String(row[statusCol - 1]).trim();
        if (!raw) continue;
        scanned++;

        var who = String(map.name ? row[map.name - 1] : '');
        var where = sheet.getName() + ' 第 ' + rowNum + ' 列　' + who;

        if (STATUS_MIGRATION[raw]) {
          updates.push([rowNum, STATUS_MIGRATION[raw]]);
          changed.push(where + '　「' + raw + '」→「' + STATUS_MIGRATION[raw] + '」');
          continue;
        }

        if (STATUS_MIGRATION_NEEDS_ASAL[raw]) {
          /* ⚠️ W 欄有值才轉。空白的轉過去會讓「改過期」這件事永久消失 */
          var asal = asalCol ? cellToDate_(row[asalCol - 1]) : null;
          if (asal) {
            updates.push([rowNum, STATUS_MIGRATION_NEEDS_ASAL[raw]]);
            changed.push(where + '　「' + raw + '」→「' +
                         STATUS_MIGRATION_NEEDS_ASAL[raw] + '」（原訂 ' +
                         isoToDisplay_(isoDate_(asal)) + '）');
          } else {
            blocked.push(where + '　「' + raw + '」：W 欄（原訂日期）是空的，' +
                         '不動它。補上原訂日期後再跑一次就會轉成「' +
                         STATUS_MIGRATION_NEEDS_ASAL[raw] + '」');
          }
        }
      }

      if (!dryRun && updates.length) {
        /* ⚠️ 一定要先清掉資料驗證才寫得進去。新的下拉清單裡沒有舊的值，
           而嚴格驗證（setAllowInvalid(false)）會直接擋下寫入——
           而且它擋下來的樣子是丟例外，不是安靜失敗，整支會中斷在一半。
           寫完由 applyStructure_ 把新的清單裝回去。 */
        var range = sheet.getRange(FIRST_DATA_ROW, statusCol, last - 1, 1);
        range.clearDataValidations();
        updates.forEach(function (u) {
          sheet.getRange(u[0], statusCol).setValue(u[1]);
        });
        applyStructure_(sheet, MAIN_COLUMNS, Math.max(PREP_ROWS_WEEK, last));
        touchedSheets++;
      }
    });

    var L = [];
    L.push((dryRun ? '【試跑，一個字都沒寫】' : '【已執行】') +
           '掃描 ' + scanned + ' 筆');
    L.push((dryRun ? '會改 ' : '已改 ') + changed.length + ' 筆' +
           (dryRun ? '' : '（' + touchedSheets + ' 個週分頁）'));
    if (changed.length) {
      L.push('');
      changed.slice(0, 60).forEach(function (c) { L.push('  ' + c); });
      if (changed.length > 60) L.push('  …（還有 ' + (changed.length - 60) + ' 筆）');
    }

    if (blocked.length) {
      L.push('');
      L.push('⚠️ 刻意不動的 ' + blocked.length + ' 筆（需要人工判斷）：');
      blocked.slice(0, 60).forEach(function (b) { L.push('  ' + b); });
      if (blocked.length > 60) L.push('  …（還有 ' + (blocked.length - 60) + ' 筆）');
    }

    if (!changed.length && !blocked.length) {
      L.push('');
      L.push('沒有需要搬遷的資料——狀態標籤已經是新的了。');
    }

    if (!dryRun && changed.length) {
      markIndexDirty_();                       // Sheet 變了，索引要重建
      logInfo_('migrateStatusLabels', '狀態標籤搬遷', changed.length + ' 筆');
    }

    var msg = L.join('\n');
    Logger.log(msg);
    return msg;

  } finally {
    lock.releaseLock();
  }
}
