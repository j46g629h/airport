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
