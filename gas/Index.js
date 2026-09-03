/**
 * Index.js — 把所有週分頁攤平成 _INDEX
 *
 * ⚠️ _INDEX 是**衍生資料**，只能由這裡從週分頁單向產生，永遠不可反向寫回。
 *    壞了、對不上、被人手動改壞了——重跑 rebuildIndex() 就好，
 *    週分頁永遠是唯一的真相（設計約定第 1 條）。
 *
 * 為什麼要有它：查詢一個人整年的紀錄，如果去遍歷 52 個週分頁，
 * 光是讀取就要 3~10 秒（每張 getValues 約 50~200ms），
 * 再加上 Apps Script 本來就有的 3~8 秒，使用者要等到懷疑人生。
 * 讀 _INDEX 只要一次 getValues，不管有 14 個還是 200 個週分頁都一樣快。
 *
 * 更新時機：Triggers.js 每 5 分鐘呼叫一次 rebuildIndexIfDirty()，
 * **但只有真的有人改過才會重建**（見下方說明）。
 * 也就是說**在 Sheet 上改完，使用者端最多 5 分鐘後才看得到**。
 * 需要馬上生效就手動執行 rebuildIndex()。階段 3 會改成即時的增量更新。
 */

/** 旗標與時間戳記存在 PropertiesService（不可用 CacheService，見設計約定第 13 條） */
var PROP_INDEX_DIRTY = 'indexDirty';
var PROP_INDEX_BUILT = 'indexBuiltAt';

/** 就算沒人改，超過這麼多小時也強制重建一次（旗標萬一漏了的保險） */
var INDEX_MAX_AGE_HOURS = 6;


/**
 * 排程呼叫的入口：沒人改過就立刻結束。
 *
 * ⚠️ 為什麼不無條件重建：
 *    單次重建 19 秒（14 個週分頁），每 5 分鐘跑一次 = 一天 93 分鐘，
 *    而一般 Google 帳號的排程配額是 **90 分鐘／天**——現在就已經超了。
 *    一年後 52 個週分頁時單次要 60~70 秒，一天要 5 個多小時，
 *    排程會在中午被 Google 停掉，而且**不會有任何錯誤訊息**，
 *    你只會發現「下午的資料都沒更新」卻查不出原因。
 *
 *    大部分的 5 分鐘區間根本沒有人動 Sheet，那些重建全是白做的。
 */
function rebuildIndexIfDirty() {
  // ⚠️ 這一段要在「有沒有變更」的判斷**之前**跑。
  //    有人複製了一個分頁卻還沒編輯過時，旗標不會被立起來——
  //    只在有變更時才掃的話，那個孤兒分頁永遠不會被認養。
  if (adoptOrphanWeekSheets_().length) markIndexDirty_();

  var props = PropertiesService.getScriptProperties();
  var dirty = props.getProperty(PROP_INDEX_DIRTY) === '1';
  var builtAt = Number(props.getProperty(PROP_INDEX_BUILT) || 0);
  var ageHours = (new Date().getTime() - builtAt) / 3600000;

  if (!dirty && ageHours < INDEX_MAX_AGE_HOURS) {
    return '沒有變更，略過重建（上次重建於 ' + ageHours.toFixed(1) + ' 小時前）';
  }

  // ⚠️ 先清旗標，再重建。順序反過來的話，重建進行中發生的編輯
  //    會被結束時的清除動作一起抹掉，那一筆就永遠不會進索引。
  //    先清的話最多只是多重建一次，不會掉資料。
  props.deleteProperty(PROP_INDEX_DIRTY);
  return rebuildIndex();
}


/** 標記「索引該更新了」。⚠️ 絕不可以讓它的失敗影響到正在進行的編輯。 */
function markIndexDirty_() {
  try {
    PropertiesService.getScriptProperties().setProperty(PROP_INDEX_DIRTY, '1');
  } catch (e) {
    Logger.log('標記索引待更新失敗：' + e.message);
  }
}


/** 手動重建。可以隨時執行，重複執行是安全的。 */
function rebuildIndex() {
  var t0 = new Date().getTime();
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    var busy = '另一個重建正在進行中，這次略過';
    Logger.log(busy);
    return busy;
  }
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var rows = [];
    var sheetCount = 0;
    var problems = [];

    ss.getSheets().forEach(function (sheet) {
      if (!isWeekSheet_(sheet)) return;
      sheetCount++;
      try {
        rows = rows.concat(indexRowsOf_(sheet, problems));
      } catch (e) {
        problems.push('分頁「' + sheet.getName() + '」讀取失敗：' + e.message);
        logError_('rebuildIndex', '讀取分頁失敗', sheet.getName() + '：' + e.message);
      }
    });

    // 日期由新到舊，同一天再依出車時間。查詢時直接照這個順序回傳。
    rows.sort(function (a, b) {
      if (a.tanggal_iso !== b.tanggal_iso) return a.tanggal_iso < b.tanggal_iso ? 1 : -1;
      return String(a.pickup_iso) < String(b.pickup_iso) ? -1 : 1;
    });

    writeIndex_(rows);
    try {
      PropertiesService.getScriptProperties().setProperty(PROP_INDEX_BUILT, String(new Date().getTime()));
    } catch (e) { /* 記不下時間只是下次會多重建一次，不影響資料 */ }

    var secs = ((new Date().getTime() - t0) / 1000).toFixed(1);
    var msg = '_INDEX 重建完成：' + rows.length + ' 筆，來自 ' + sheetCount + ' 個週分頁，耗時 ' + secs + ' 秒';
    if (problems.length) {
      msg += '\n有 ' + problems.length + ' 個問題：\n  ' + problems.slice(0, 20).join('\n  ');
    }
    Logger.log(msg);
    return msg;
  } finally {
    lock.releaseLock();
  }
}


/** 讀一個週分頁，轉成 _INDEX 的列 */
function indexRowsOf_(sheet, problems) {
  var last = sheet.getLastRow();
  if (last < FIRST_DATA_ROW) return [];

  var map = buildColumnMap_(sheet, MAIN_COLUMNS);
  var width = sheet.getLastColumn();
  var values = sheet.getRange(FIRST_DATA_ROW, 1, last - 1, width).getValues();
  var name = sheet.getName();
  var out = [];

  // map 存的是欄號（1 起算），取值要減 1
  function g(row, code) {
    var i = map[code];
    return i ? String(row[i - 1] == null ? '' : row[i - 1]).trim() : '';
  }

  for (var r = 0; r < values.length; r++) {
    var row = values[r];
    var rowNum = FIRST_DATA_ROW + r;

    var tanggal = cellToDate_(map.tanggal ? row[map.tanggal - 1] : '');
    var hasAny = false;
    for (var c = 0; c < 17 && c < row.length; c++) {
      if (String(row[c]).trim() !== '') { hasAny = true; break; }
    }
    if (!hasAny) continue;                       // 空白列略過
    if (!tanggal) {
      problems.push(name + ' 第 ' + rowNum + ' 列：沒有航班日期，未建立索引');
      continue;
    }

    var dariPciText = g(row, 'dari_pci');
    var pickup = parseDariPci_(dariPciText, tanggal);
    if (dariPciText && !pickup) {
      problems.push(name + ' 第 ' + rowNum + ' 列：出廠時間「' + dariPciText + '」看不懂');
    }

    var asal = cellToDate_(map.tanggal_asal ? row[map.tanggal_asal - 1] : '');

    out.push({
      booking_id:   g(row, 'booking_id'),
      sheet_name:   name,
      row_num:      String(rowNum),
      tanggal_iso:  isoDate_(tanggal),
      arah_code:    codeOf_(g(row, 'arah')),
      status_code:  codeOf_(g(row, 'status')) || 'SCHEDULED',
      flight:       g(row, 'flight'),
      etd_eta:      g(row, 'etd_eta'),
      dari_pci:     dariPciText,
      pickup_iso:   pickup ? isoDateTime_(pickup) : '',
      dept:         g(row, 'dept'),
      factory:      g(row, 'factory'),
      name:         g(row, 'name'),
      nama_cina:    g(row, 'nama_cina'),
      dorm:         g(row, 'dorm'),
      titik_jemput: g(row, 'titik_jemput'),
      email:        g(row, 'email').toLowerCase(),
      email_kontak: g(row, 'email_kontak').toLowerCase(),
      hp:           g(row, 'hp'),
      custom:       g(row, 'custom'),
      bagasi:       g(row, 'bagasi'),
      povs:         g(row, 'povs'),
      remark:       g(row, 'remark'),
      permintaan:   g(row, 'permintaan'),
      group_id:     g(row, 'group_id'),
      tanggal_asal: asal ? isoDate_(asal) : '',
      kendaraan:    g(row, 'kendaraan'),
      sopir:        g(row, 'sopir'),
      hp_sopir:     g(row, 'hp_sopir'),
      updated_at:   g(row, 'updated_at')
    });
  }
  return out;
}


/** 整張換掉。_INDEX 是衍生資料，砍掉重寫是安全的。 */
function writeIndex_(rows) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEETS.INDEX);
  if (!sheet) throw new Error('找不到 ' + SHEETS.INDEX + ' 分頁，請先執行 setupSheet()');

  var n = INDEX_COLUMNS.length;
  if (sheet.getLastRow() >= FIRST_DATA_ROW) {
    sheet.getRange(FIRST_DATA_ROW, 1, sheet.getLastRow() - 1, n).clearContent();
  }
  if (!rows.length) return;

  if (sheet.getMaxRows() < rows.length + 1) {
    sheet.insertRowsAfter(sheet.getMaxRows(), rows.length + 1 - sheet.getMaxRows());
  }

  var out = rows.map(function (o) {
    return INDEX_COLUMNS.map(function (col) { return o[col.code] == null ? '' : o[col.code]; });
  });
  sheet.getRange(FIRST_DATA_ROW, 1, out.length, n).setValues(out);
}


/**
 * 讀整張 _INDEX 成物件陣列。查詢都從這裡開始。
 * 索引是空的（例如剛部署還沒重建過）就自己重建一次，使用者不會看到空白畫面。
 */
function readIndex_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.INDEX);
  if (!sheet) throw new Error('找不到 ' + SHEETS.INDEX + ' 分頁');

  if (sheet.getLastRow() < FIRST_DATA_ROW) {
    rebuildIndex();
    sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.INDEX);
    if (sheet.getLastRow() < FIRST_DATA_ROW) return [];
  }

  var n = INDEX_COLUMNS.length;
  var values = sheet.getRange(FIRST_DATA_ROW, 1, sheet.getLastRow() - 1, n).getValues();
  return values.map(function (row) {
    var o = {};
    INDEX_COLUMNS.forEach(function (col, i) { o[col.code] = String(row[i] == null ? '' : row[i]); });
    return o;
  }).filter(function (o) { return o.tanggal_iso; });
}
