/**
 * Status.js — 把時間已經過去的「已排定」自動改成「已完成」
 *
 * 為什麼需要：STATUS 是轉檔時算好的，之後沒有任何東西會更新它。
 * 而沒有人會為了每一筆行程回 Sheet 手動改狀態——不自動處理的話，
 * 那個欄位對所有過去的資料就永遠是錯的。
 *
 * ⚠️ 使用者畫面上看到的狀態是**即時算**出來的（Query.js 的 effectiveStatus_），
 *    所以不靠這支排程也不會顯示錯。這支的用途是**讓 Sheet 上的值跟畫面一致**——
 *    不然管理者打開 Sheet 看到「已排定」，使用者手機上看到「已完成」，
 *    兩個人對著同一筆資料講不同的話。
 *
 * ── 三條安全規則 ────────────────────────────────────────
 *
 * 1. **只動 SCHEDULED。** 已取消、待定、已改期都是人刻意設定的決定。
 *    把一筆「已取消」自動改成「已完成」，會讓看的人以為車來過了。
 *
 * 2. **沒有起降時間就取當天 23:59。** 寧可晚幾小時才標記，
 *    也不要在人還在等車的時候就把他的行程標成已完成。
 *
 * 3. **先試跑再執行。** previewMarkPastAsDone() 只印出「會改哪幾筆」，
 *    一個字都不寫。這種功能出錯的樣子不是跳錯誤訊息，
 *    而是安靜地改掉一堆不該改的東西，而且很久以後才會被發現。
 */

/** 試跑：只印出會改哪幾筆，不寫入任何東西 */
function previewMarkPastAsDone() {
  return markPastAsDone_(true);
}

/** 實際執行（排程每小時呼叫） */
function markPastAsDone() {
  return markPastAsDone_(false);
}


function markPastAsDone_(dryRun) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) {
    var busy = '另一個作業正在進行中，這次略過';
    Logger.log(busy);
    return busy;
  }

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var doneLabel = LIST_STATUS[1];              // 'Selesai 已完成'
    var changed = [];
    var scanned = 0;

    ss.getSheets().forEach(function (sheet) {
      if (!isWeekSheet_(sheet)) return;
      var last = sheet.getLastRow();
      if (last < FIRST_DATA_ROW) return;

      var map = buildColumnMap_(sheet, MAIN_COLUMNS);
      var width = sheet.getLastColumn();
      var values = sheet.getRange(FIRST_DATA_ROW, 1, last - 1, width).getValues();

      var statusCol = map.status;
      var updates = [];                          // [列號, 新值]

      for (var i = 0; i < values.length; i++) {
        var row = values[i];
        var tanggal = cellToDate_(map.tanggal ? row[map.tanggal - 1] : '');
        if (!tanggal) continue;
        scanned++;

        var code = codeOf_(String(row[statusCol - 1]).trim());
        if (code !== 'SCHEDULED') continue;      // 規則 1

        var etd = map.etd_eta ? String(row[map.etd_eta - 1]).trim() : '';
        if (effectiveStatus_('SCHEDULED', isoDate_(tanggal), etd) !== 'DONE') continue;

        updates.push(FIRST_DATA_ROW + i);
        changed.push(sheet.getName() + ' 第 ' + (FIRST_DATA_ROW + i) + ' 列　' +
                     isoToDisplay_(isoDate_(tanggal)) + ' ' + (etd || '(無時間)') + '　' +
                     String(map.name ? row[map.name - 1] : ''));
      }

      if (!dryRun && updates.length) {
        // 一列一列寫。同一張分頁裡要改的通常只有幾筆，
        // 為了它們整批重寫整欄反而會把別人剛改到一半的值蓋掉。
        updates.forEach(function (r) {
          sheet.getRange(r, statusCol).setValue(doneLabel);
        });
      }
    });

    var msg = (dryRun ? '【試跑】' : '') +
              '掃描 ' + scanned + ' 筆，' +
              (dryRun ? '會改 ' : '已改 ') + changed.length + ' 筆為「' + doneLabel + '」';
    if (changed.length) {
      msg += '\n  ' + changed.slice(0, 50).join('\n  ');
      if (changed.length > 50) msg += '\n  …（還有 ' + (changed.length - 50) + ' 筆）';
    }

    if (!dryRun && changed.length) {
      markIndexDirty_();                         // Sheet 變了，索引要重建
      logInfo_('markPastAsDone', '自動標記已完成', changed.length + ' 筆');
    }

    Logger.log(msg);
    return msg;

  } finally {
    lock.releaseLock();
  }
}
