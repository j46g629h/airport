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
    var weekSheets = [];    // 掃過的週分頁，第三階段要重裝下拉選單

    ss.getSheets().forEach(function (sheet) {
      if (!isWeekSheet_(sheet)) return;
      var last = sheet.getLastRow();

      /* ⚠️ 這一行要放在所有 return **之前**。
         還沒有資料的空白週分頁（未來三週那幾張）也要換下拉選單——
         那正是管理者接下來要輸入新資料的地方。
         放在下面的話它們會被 `last < FIRST_DATA_ROW` 那一行跳過，
         而且完全看不出來：有資料的分頁都對了，只有空的那幾張選不到新選項。 */
      weekSheets.push({ sheet: sheet, last: last });

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
           清掉的驗證由下面的第三階段一次裝回去。 */
        var range = sheet.getRange(FIRST_DATA_ROW, statusCol, last - 1, 1);
        range.clearDataValidations();
        updates.forEach(function (u) {
          sheet.getRange(u[0], statusCol).setValue(u[1]);
        });
        touchedSheets++;
      }
    });

    /* ══ 第三階段：把下拉選單換成新的 ══════════════════════════════
       ⚠️ **不論有沒有改到任何一筆資料都要做。** 這是實際踩過的坑：

       原本這一行掛在「有 updates 才執行」裡面。而實際上線時搬遷是 0 筆
       （匯進來的資料本來就沒有舊的「待定」與「已改期」），
       於是下拉選單**一次都沒有被換掉**——Sheet 上還是舊的五個選項，
       而 STATUS 那一欄是嚴格驗證（setAllowInvalid(false)），
       結果就是管理者**選不到也打不進新的「待定」與「待改期」**。

       而且它不會報錯，只會在你想選的時候發現「選單裡沒有那一項」，
       完全看不出是搬遷少做了一步。

       教訓：**改了 LIST_STATUS 就一定要重裝下拉選單**，
       這件事跟「有沒有資料要搬」是兩回事。 */
    var refreshed = 0;
    if (!dryRun) {
      weekSheets.forEach(function (w) {
        applyStructure_(w.sheet, MAIN_COLUMNS, Math.max(PREP_ROWS_WEEK, w.last));
        refreshed++;
      });
    }

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

    L.push('');
    if (dryRun) {
      L.push('執行時還會把 ' + weekSheets.length + ' 個週分頁的下拉選單換成新的五個選項' +
             '（這件事跟有沒有資料要搬無關，一定會做）。');
    } else {
      L.push('✓ 已重裝 ' + refreshed + ' 個週分頁的下拉選單（新的五個狀態選項）');
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
