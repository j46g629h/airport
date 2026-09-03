/**
 * Setup.js — 一次性建立試算表結構，以及把轉檔 CSV 匯入週分頁
 *
 * 三支要手動執行的函式（在 Apps Script 編輯器上方選單選函式名稱 → 按「執行」）：
 *
 *   1. setupSheet()       建立所有分頁、欄位、格式、下拉選單、表頭保護
 *   2. importBookings()   把 _IMPORT 分頁的接送資料分配到各週分頁
 *   3. checkSetup()       檢查結果，把狀態印在執行紀錄上
 *
 * 另外兩支維護用的：
 *   refreshDropdowns()    在 PENGATURAN 加了新的廠別 / 部門 / 上車地點之後跑
 *   ensureUpcomingWeekSheets() 建好從今天起半年份的週分頁（排程每天自動執行）
 *   addWeekSheetForDate()     建立更遠的某一週（改 TARGET_WEEK_DATE 再執行）
 *   repairWeekSheets()        認養手動建立的分頁、補格式、排序
 *
 * ⚠️ setupSheet() 重複執行是安全的：已存在的分頁不會被清空，只會補上缺的東西。
 */


/* ══════════════════════════════════════════════════════════════
   1. 建立結構
   ══════════════════════════════════════════════════════════════ */

function setupSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var log = [];
  SETUP_WARNINGS = [];
  _FORMULA_SEP = null;   // 地區設定可能剛改過，重新量一次

  // ── 地區與時區。這兩個設錯會安靜出錯，所以程式自己設一次 ──
  try {
    ss.setSpreadsheetLocale(SYSTEM_INFO.locale);
    ss.setSpreadsheetTimeZone(SYSTEM_INFO.timezone);
    log.push('✓ 地區設定 ' + SYSTEM_INFO.locale + '、時區 ' + SYSTEM_INFO.timezone);
  } catch (e) {
    log.push('⚠ 地區/時區設定失敗，請手動到「檔案 → 設定」設成 Indonesia / (GMT+07:00) Jakarta：' + e.message);
  }

  // ── 固定分頁 ──
  ensureSheet_(ss, SHEETS.PERSON,  PERSON_COLUMNS,  { rows: PREP_ROWS_ROSTER }, log);
  ensureSheet_(ss, SHEETS.FLIGHT,  FLIGHT_COLUMNS,  { rows: PREP_ROWS_ROSTER }, log);
  ensureSheet_(ss, SHEETS.VEHICLE, VEHICLE_COLUMNS, { rows: PREP_ROWS_ROSTER }, log);
  ensureSheet_(ss, SHEETS.SETTING, SETTING_COLUMNS, { rows: PREP_ROWS_ROSTER }, log);
  ensureSheet_(ss, SHEETS.ADMIN,   ADMIN_COLUMNS,   { rows: 50,  hide: true }, log);
  ensureSheet_(ss, SHEETS.LOG,     LOG_COLUMNS,     { rows: 500, hide: true }, log);
  ensureSheet_(ss, SHEETS.INDEX,   INDEX_COLUMNS,   { rows: 500, hide: true }, log);

  // ── 選項設定的初始內容（只在空的時候寫入，不覆蓋既有資料）──
  var setting = ss.getSheetByName(SHEETS.SETTING);
  if (setting.getLastRow() < FIRST_DATA_ROW) {
    setting.getRange(FIRST_DATA_ROW, 1, SETTING_SEED.length, SETTING_COLUMNS.length)
           .setValues(SETTING_SEED);
    log.push('✓ PENGATURAN 寫入 ' + SETTING_SEED.length + ' 筆初始選項');
  } else {
    log.push('· PENGATURAN 已有資料，不覆蓋');
  }

  // ── 匯入用的暫存分頁（空白，等使用者把 CSV 匯進來）──
  if (!ss.getSheetByName(SHEETS.IMPORT)) {
    ss.insertSheet(SHEETS.IMPORT);
    log.push('✓ 建立 ' + SHEETS.IMPORT + '（匯入用暫存，匯完可以自己刪掉）');
  }

  // ── 刪掉 Google 預設的空白「工作表1」──
  ['工作表1', 'Sheet1', 'Sheet 1'].forEach(function (n) {
    var sh = ss.getSheetByName(n);
    if (sh && sh.getLastRow() === 0 && ss.getSheets().length > 1) {
      ss.deleteSheet(sh);
      log.push('✓ 刪除預設空白分頁「' + n + '」');
    }
  });

  log.push('· 公式參數分隔符號：「' + formulaSep_() + '」（依地區設定自動偵測）');

  if (SETUP_WARNINGS.length) {
    log.push('');
    log.push('【警告】' + SETUP_WARNINGS.length + ' 項');
    SETUP_WARNINGS.forEach(function (w) { log.push('  ' + w); });
  }

  log.push('');
  log.push('完成。接下來：');
  log.push('  1. 把 人員名冊_初版.csv 匯入 ' + SHEETS.PERSON + '（⚠️ 取消勾選「將文字轉換為數字、日期和公式」）');
  log.push('  2. 把 航班名冊_初版.csv 匯入 ' + SHEETS.FLIGHT + '（同上）');
  log.push('  3. 把 接送資料_轉檔.csv 匯入 ' + SHEETS.IMPORT + '（同上）');
  log.push('  4. 執行 importBookings()');
  Logger.log(log.join('\n'));
  return log.join('\n');
}


/**
 * 建立或補齊一個分頁。已存在就不清空，只重新套用表頭、格式、驗證、欄寬。
 */
function ensureSheet_(ss, name, columns, opts, log) {
  opts = opts || {};
  var created = false;
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    created = true;
  }
  applyStructure_(sheet, columns, opts.rows || PREP_ROWS_WEEK);
  if (opts.hide) sheet.hideSheet();
  if (log) log.push((created ? '✓ 建立 ' : '· 更新 ') + name + '（' + columns.length + ' 欄）');
  return sheet;
}


/**
 * 套用表頭、欄寬、數字格式、資料驗證、凍結、隱藏欄、表頭保護。
 * 這一支對「已經有資料」的分頁執行是安全的：它只改格式，不動儲存格內容。
 */
function applyStructure_(sheet, columns, prepRows) {
  var n = columns.length;

  // 欄數不夠就補
  if (sheet.getMaxColumns() < n) sheet.insertColumnsAfter(sheet.getMaxColumns(), n - sheet.getMaxColumns());
  if (sheet.getMaxRows() < prepRows + 1) sheet.insertRowsAfter(sheet.getMaxRows(), prepRows + 1 - sheet.getMaxRows());

  // 表頭
  var header = columns.map(function (c) { return c.name; });
  var hRange = sheet.getRange(1, 1, 1, n);
  hRange.setValues([header])
        .setFontWeight('bold')
        .setBackground('#e8eaed')
        .setVerticalAlignment('middle')
        .setWrap(true);
  sheet.setFrozenRows(1);

  // 每一欄的格式與驗證
  var lists = dropdownSources_();
  for (var i = 0; i < n; i++) {
    var col = columns[i];
    var body = sheet.getRange(FIRST_DATA_ROW, i + 1, prepRows, 1);

    if (col.width) sheet.setColumnWidth(i + 1, col.width);
    if (col.format) body.setNumberFormat(col.format);

    var rule = buildRule_(col, lists, sheet.getRange(FIRST_DATA_ROW, i + 1).getA1Notation());
    if (rule) {
      try {
        body.setDataValidation(rule);
        // 公式型的規則 Google 是延後驗證的，這裡逼它現在就驗，
        // 錯誤才會在這一行被接住，而不是拖到後面幾行害人找錯地方
        if (col.check) SpreadsheetApp.flush();
      } catch (e) {
        body.clearDataValidations();
        SETUP_WARNINGS.push('⚠ 「' + sheet.getName() + '」的「' + col.name +
                            '」格式檢查套用失敗，已略過（不影響其他功能）：' + e.message);
      }
    }
  }

  // 隱藏欄（R~Y 之類）
  var hideFrom = -1;
  for (var j = 0; j < n; j++) {
    if (columns[j].hidden && hideFrom < 0) hideFrom = j + 1;
    if (!columns[j].hidden && hideFrom > 0) { sheet.hideColumns(hideFrom, j + 1 - hideFrom); hideFrom = -1; }
  }
  if (hideFrom > 0) sheet.hideColumns(hideFrom, n + 1 - hideFrom);

  // 表頭保護（警告模式：跳提示但不鎖死，適合 2~3 人的小團隊）
  protectHeader_(sheet, n);
}


/* ── 公式的參數分隔符號 ──────────────────────────────────────────
   ⚠️ Google 試算表的公式分隔符號跟「地區設定」有關，不是固定的逗號：
        en_US（小數點用 . ）→  OR(a, b)
        id_ID（小數點用 , ）→  OR(a; b)      ← 我們用的就是這個
      而 setupSheet() 第一件事就是把地區設成 id_ID，所以寫死逗號必然失敗
      （錯誤訊息會說 data validation rule argument is invalid，而且因為 Google 是
       延後驗證公式的，堆疊會指到後面幾行的 protectHeader_，很容易找錯地方）。

   這裡不猜，直接量：寫 1.5 到一個暫時的分頁上，看它顯示成 "1,5" 還是 "1.5"。
   ──────────────────────────────────────────────────────────────── */
var _FORMULA_SEP = null;

function formulaSep_() {
  if (_FORMULA_SEP) return _FORMULA_SEP;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tmp = ss.insertSheet('_probe_' + new Date().getTime());
  try {
    tmp.getRange(1, 1).setNumberFormat('0.0').setValue(1.5);
    SpreadsheetApp.flush();
    _FORMULA_SEP = (tmp.getRange(1, 1).getDisplayValue().indexOf(',') >= 0) ? ';' : ',';
  } catch (e) {
    _FORMULA_SEP = ',';
  } finally {
    ss.deleteSheet(tmp);
  }
  return _FORMULA_SEP;
}

/** setupSheet() 執行過程中的警告，最後一起印出來 */
var SETUP_WARNINGS = [];

/**
 * 資料驗證規則。
 *
 * 兩種嚴格度，刻意不一樣：
 *   固定選項（接/送、狀態、YES/NO、身分別…）→ setAllowInvalid(false)  直接擋掉
 *     這些選項不會變，打錯字會讓統計整個歪掉，沒有理由放行。
 *   可擴充選項（廠別、部門、上車地點）→ setAllowInvalid(true)  只出現紅色三角形警告
 *     這些會隨時新增。擋死的話，管理者在 PENGATURAN 加了新部門卻忘記跑
 *     refreshDropdowns()，就會發現自己打不進去而且不知道為什麼。
 */
function buildRule_(col, lists, a1) {
  var b = SpreadsheetApp.newDataValidation();

  if (col.list) {
    return b.requireValueInList(col.list, true).setAllowInvalid(false)
            .setHelpText('請從清單選擇：' + col.list.join(' / ')).build();
  }
  if (col.listFrom) {
    var items = lists[col.listFrom] || [];
    if (!items.length) return null;
    return b.requireValueInList(items, true).setAllowInvalid(true)
            .setHelpText('清單來自 ' + SHEETS.SETTING + ' 的 ' + col.listFrom +
                         '。新增選項後請執行 refreshDropdowns()').build();
  }
  if (col.check === 'date') {
    return b.requireDate().setAllowInvalid(false)
            .setHelpText('請輸入日期，格式 dd/mm/yyyy').build();
  }
  var S = formulaSep_();
  if (col.check === 'time') {
    return b.requireFormulaSatisfied(
              '=OR(ISBLANK(' + a1 + ')' + S +
              'REGEXMATCH(TO_TEXT(' + a1 + ')' + S + '"^\\d{1,2}:\\d{2}$"))')
            .setAllowInvalid(false)
            .setHelpText('請輸入 24 小時制時間，例如 13:35 或 00:20').build();
  }
  if (col.check === 'daripci') {
    // 允許 "20:00"（航班當天）或 "30/08 20:00"（前一天出車）
    return b.requireFormulaSatisfied(
              '=OR(ISBLANK(' + a1 + ')' + S +
              'REGEXMATCH(TO_TEXT(' + a1 + ')' + S + '"^\\d{1,2}:\\d{2}$")' + S +
              'REGEXMATCH(TO_TEXT(' + a1 + ')' + S + '"^\\d{1,2}[/-]\\d{1,2}\\s+\\d{1,2}:\\d{2}$"))')
            .setAllowInvalid(false)
            .setHelpText('當天出車寫 20:00；前一天出車寫 30/08 20:00（日/月，不是月/日）').build();
  }
  return null;
}


function protectHeader_(sheet, n) {
  var desc = '表頭不可修改（' + sheet.getName() + '）';
  sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE).forEach(function (p) {
    if (p.getDescription() === desc) p.remove();
  });
  sheet.getRange(1, 1, 1, n).protect()
       .setDescription(desc)
       .setWarningOnly(true);   // 跳提示，不鎖死
}


/** 讀 PENGATURAN，把可擴充的下拉選單來源整理出來 */
function dropdownSources_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEETS.SETTING);
  var out = {};
  if (!sheet || sheet.getLastRow() < FIRST_DATA_ROW) return out;

  var values = sheet.getRange(FIRST_DATA_ROW, 1, sheet.getLastRow() - 1, SETTING_COLUMNS.length).getValues();
  values.forEach(function (r) {
    var kategori = String(r[0]).trim();
    var nilai    = String(r[1]).trim();
    var aktif    = String(r[3]).trim();
    if (!kategori || !nilai) return;
    if (aktif && CODE_OF[aktif] === 'N') return;
    if (!out[kategori]) out[kategori] = [];
    if (out[kategori].indexOf(nilai) < 0) out[kategori].push(nilai);
  });
  return out;
}


/** 在 PENGATURAN 加了新的廠別 / 部門 / 上車地點之後跑這一支 */
function refreshDropdowns() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var count = 0;
  ss.getSheets().forEach(function (sheet) {
    if (!isWeekSheet_(sheet)) return;
    applyStructure_(sheet, MAIN_COLUMNS, Math.max(PREP_ROWS_WEEK, sheet.getLastRow()));
    count++;
  });
  var msg = '已更新 ' + count + ' 個週分頁的下拉選單';
  Logger.log(msg);
  return msg;
}


/**
 * 把 SETTING_SEED 裡「PENGATURAN 還沒有」的選項補進去。
 *
 * 只補、不刪、不改：你手動加的、或手動停用的，都不會被動到。
 * 判斷依據是「類別 + 值」這一組，所以同一個值不會被補第二次。
 *
 * ⚠️ 刻意不放進 setupSheet()：你若哪天故意刪掉某個預設選項，
 *    自動補回去會很煩人。要補的時候自己執行這一支。
 */
function topUpSettings() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEETS.SETTING);
  if (!sheet) throw new Error('找不到 ' + SHEETS.SETTING + ' 分頁');

  var have = {};
  if (sheet.getLastRow() >= FIRST_DATA_ROW) {
    sheet.getRange(FIRST_DATA_ROW, 1, sheet.getLastRow() - 1, 2).getValues()
         .forEach(function (r) { have[String(r[0]).trim() + '|' + String(r[1]).trim()] = true; });
  }

  var add = SETTING_SEED.filter(function (r) {
    if (!String(r[1]).trim()) return false;               // 空值（例如系統信收件人）不補
    return !have[String(r[0]).trim() + '|' + String(r[1]).trim()];
  });

  if (add.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, add.length, SETTING_COLUMNS.length).setValues(add);
  }
  var msg = '補上 ' + add.length + ' 筆選項' +
            (add.length ? '：' + add.map(function (r) { return r[0] + '/' + r[1]; }).join('、') : '（都已存在）');
  Logger.log(msg);
  return msg;
}


/**
 * 把既有資料的「Jemput 接機 / Antar 送機」改成「Jemput / Antar」。
 *
 * ⚠️ 要先清掉該欄的資料驗證才寫得進去——新的清單裡沒有舊的值，
 *    嚴格驗證（setAllowInvalid(false)）會擋下寫入。寫完再由 applyStructure_ 裝回去。
 */
function migrateArahLabels() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var col = colIndexOf_(MAIN_COLUMNS, 'arah');
  var map = { 'Jemput 接機': 'Jemput', 'Antar 送機': 'Antar' };
  var changed = 0, sheets = 0;

  ss.getSheets().forEach(function (sheet) {
    if (!isWeekSheet_(sheet)) return;
    var last = sheet.getLastRow();
    if (last < FIRST_DATA_ROW) return;

    var range = sheet.getRange(FIRST_DATA_ROW, col, last - 1, 1);
    var vals = range.getValues();
    var hit = 0;
    for (var i = 0; i < vals.length; i++) {
      var v = String(vals[i][0]).trim();
      if (map[v]) { vals[i][0] = map[v]; hit++; }
    }
    if (hit) {
      range.clearDataValidations();
      range.setValues(vals);
      changed += hit;
      sheets++;
    }
    applyStructure_(sheet, MAIN_COLUMNS, Math.max(PREP_ROWS_WEEK, last));
  });

  var msg = '已改寫 ' + changed + ' 格（' + sheets + ' 個週分頁），並重新套用下拉選單';
  Logger.log(msg);
  return msg;
}


/**
 * 改過 Config 之後跑這一支，它會把該做的一次做完。
 * 重複執行是安全的。
 */
function updateStructure() {
  var L = [];
  SETUP_WARNINGS = [];
  _FORMULA_SEP = null;
  L.push('1. ' + topUpSettings());
  L.push('2. ' + migrateArahLabels());
  L.push('3. ' + refreshDropdowns());
  L.push('4. ' + sortSheets());
  if (SETUP_WARNINGS.length) {
    L.push('');
    L.push('【警告】');
    SETUP_WARNINGS.forEach(function (w) { L.push('  ' + w); });
  }
  Logger.log(L.join('\n'));
  return L.join('\n');
}


/* ══════════════════════════════════════════════════════════════
   1b. 管理者帳號（一次性 ＋ 救援）
   ══════════════════════════════════════════════════════════════ */

/**
 * 第一個超級管理者。改這裡再執行 createFirstSuperAdmin()。
 * ⚠️ 這裡**只有帳號和姓名，沒有密碼**——密碼由程式亂數產生。
 *    `gas/` 會跟著 git 上傳到公開的 repo，寫在裡面等於公開貼在網路上。
 */
var FIRST_SUPER = {
  account: 'j46g629h@hotmail.com',
  name: 'Ken Wang'
};


/**
 * 建立第一個超級管理者。只能在名單是空的時候執行。
 *
 * 密碼亂數產生、印在「執行紀錄」上，第一次登入會被強制改掉。
 * ⚠️ 印出來的那組密碼**只會出現這一次**，執行完立刻複製走。
 *    忘了也沒關係，執行 emergencyResetSuper() 就會給你新的一組。
 */
function createFirstSuperAdmin() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEETS.ADMIN);
  if (!sheet) throw new Error('找不到 ' + SHEETS.ADMIN + ' 分頁，請先執行 setupSheet()');

  var existing = readAllAdmins_();
  if (existing.length) {
    var msg = '名單裡已經有 ' + existing.length + ' 個帳號，不重複建立。\n' +
              '  忘記密碼請執行 emergencyResetSuper()，不要用這一支。';
    Logger.log(msg);
    return msg;
  }

  var map = buildColumnMap_(sheet, ADMIN_COLUMNS);
  var row = FIRST_DATA_ROW;
  var password = generateTempPassword_();

  setTextCell_(sheet, row, map.account, str_(FIRST_SUPER.account).toLowerCase());
  setTextCell_(sheet, row, map.name, FIRST_SUPER.name);
  setTextCell_(sheet, row, map.role, ADMIN_ROLES.SUPER);
  setTextCell_(sheet, row, map.status, ADMIN_STATUS.ACTIVE);
  setAdminPassword_(row, password, true);            // true = 第一次登入強制改

  var out = [
    '已建立超級管理者：',
    '    帳號　：' + FIRST_SUPER.account,
    '    姓名　：' + FIRST_SUPER.name,
    '    初始密碼：' + password,
    '',
    '⚠️ 這組密碼只會出現這一次，現在就複製走。',
    '⚠️ 第一次登入會被要求立刻設定新密碼。',
    '',
    '登入頁：https://j46g629h.github.io/airport/admin.html'
  ].join('\n');
  Logger.log(out);
  return out;
}


/**
 * 救援：重設超級管理者的密碼。
 *
 * ⚠️ 這是「只有一位超管」這個決定的配套。
 *    重設密碼是超管專屬功能，而他是唯一的超管——忘記密碼時
 *    沒有任何人能幫他。這支從 Apps Script 編輯器直接執行，
 *    不依賴登入、不依賴寄信，是最後一道保險。
 *
 * 它會同時：產生新密碼、清掉登入失敗鎖定、作廢他手上所有 token。
 */
function emergencyResetSuper() {
  var supers = readAllAdmins_().filter(function (a) {
    return normalizeRole_(a.role) === ADMIN_ROLES.SUPER;
  });
  if (!supers.length) {
    var none = '名單裡沒有任何超級管理者。請先執行 createFirstSuperAdmin()。';
    Logger.log(none);
    return none;
  }

  var lines = ['已重設 ' + supers.length + ' 個超級管理者帳號的密碼：', ''];
  supers.forEach(function (a) {
    var password = generateTempPassword_();
    setAdminPassword_(a.row, password, true);
    clearLoginFailures_(a.account);
    storeRemove(STORE_KEYS.TEMP_PW + str_(a.account).toLowerCase());
    var revoked = revokeSessionsForAccount_(a.account);

    // 順便把狀態改回啟用——不然萬一是「不小心把自己停用」，重設密碼也進不去
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.ADMIN);
    var map = buildColumnMap_(sheet, ADMIN_COLUMNS);
    setTextCell_(sheet, a.row, map.status, ADMIN_STATUS.ACTIVE);

    lines.push('    帳號　：' + a.account);
    lines.push('    新密碼：' + password);
    lines.push('    （已解除鎖定、已作廢 ' + revoked + ' 個登入中的 token、狀態設為啟用）');
    lines.push('');
  });
  lines.push('⚠️ 密碼只會出現這一次，現在就複製走。登入後會被要求立刻改掉。');

  var out = lines.join('\n');
  Logger.log(out);
  logInfo_('emergencyResetSuper', '從編輯器執行救援重設', supers.length + ' 個帳號');
  return out;
}


/* ══════════════════════════════════════════════════════════════
   2. 週分頁
   ══════════════════════════════════════════════════════════════ */

/**
 * 一週的第一天（沿用 airport.xls 的慣例：週二 ~ 週一）。
 */
function weekStart_(date) {
  var d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  var diff = (d.getDay() - WEEK_START_DOW + 7) % 7;
  d.setDate(d.getDate() - diff);
  return d;
}

/** 週分頁名稱，例如 "25 Agu - 31 Agu" */
function weekSheetName_(date) {
  var a = weekStart_(date);
  var b = new Date(a.getFullYear(), a.getMonth(), a.getDate() + 6);
  var f = function (x) { return pad2_(x.getDate()) + ' ' + BULAN[x.getMonth()]; };
  return f(a) + ' - ' + f(b);
}

/**
 * 找出某個日期所屬的週分頁；沒有就回傳 null。
 *
 * ⚠️ 先靠 developer metadata 的 weekStart 找，找不到才退回用名稱找。
 *    有人把分頁改名之後，程式照樣找得到同一張，不會另外建一張重複的。
 */
function findWeekSheet_(date) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var key = isoDate_(weekStart_(date));

  var found = ss.createDeveloperMetadataFinder().withKey('weekStart').withValue(key).find();
  for (var i = 0; i < found.length; i++) {
    var loc = found[i].getLocation().getSheet();
    if (loc) return loc;
  }
  return ss.getSheetByName(weekSheetName_(date)) || null;
}


/**
 * 找出（或建立）某個日期所屬的週分頁。
 * 已存在的會順便補上標記與格式，所以對手動建立的分頁執行也是安全的。
 */
function ensureWeekSheet(date) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var key = isoDate_(weekStart_(date));

  var sheet = findWeekSheet_(date);
  if (!sheet) sheet = ss.insertSheet(weekSheetName_(date));

  applyStructure_(sheet, MAIN_COLUMNS, PREP_ROWS_WEEK);
  if (!weekKeyOf_(sheet)) sheet.addDeveloperMetadata('weekStart', key);
  return sheet;
}


/** 是週分頁的話回傳它的起始日（'2026-08-25'），不是的話回傳 null */
function weekKeyOf_(sheet) {
  var md = sheet.getDeveloperMetadata();
  for (var i = 0; i < md.length; i++) {
    if (md[i].getKey() === 'weekStart') return md[i].getValue();
  }
  return null;
}

function isWeekSheet_(sheet) {
  return weekKeyOf_(sheet) !== null;
}

/**
 * 把分頁排成：週分頁（由舊到新）→ 名冊 → 選項設定 → _IMPORT。
 *
 * Apps Script 的 insertSheet() 插在哪個位置不固定，所以建完之後順序會亂跳。
 * 這一支隨時可以重跑，跑幾次都一樣。
 */
function sortSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var weeks = [];
  ss.getSheets().forEach(function (sh) {
    var key = weekKeyOf_(sh);
    if (key) weeks.push({ sheet: sh, key: key });
  });
  weeks.sort(function (a, b) { return a.key < b.key ? -1 : (a.key > b.key ? 1 : 0); });

  var pos = 1;
  weeks.forEach(function (w) {
    w.sheet.activate();
    ss.moveActiveSheet(pos++);
  });
  [SHEETS.PERSON, SHEETS.FLIGHT, SHEETS.VEHICLE, SHEETS.SETTING, SHEETS.IMPORT].forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (sh && !sh.isSheetHidden()) {
      sh.activate();
      ss.moveActiveSheet(pos++);
    }
  });

  var msg = '已排序：' + weeks.length + ' 個週分頁（由舊到新）＋ 參考分頁';
  Logger.log(msg);
  return msg;
}

/**
 * 建好「從今天起半年份」的週分頁。排程每天跑一次。
 *
 * ⚠️ 這一支是為了讓你**永遠不必手動建立週分頁**。
 *    手動建的分頁沒有 weekStart 標記，程式認不得它——
 *    資料打進去看起來一切正常，但 _INDEX 收不到，app 完全查不到那一整週，
 *    而且**不會有任何錯誤訊息**（設計約定第 7b 條）。
 *
 * ⚠️ 一次最多建 MAX_NEW_WEEK_SHEETS_PER_RUN 個。
 *    一口氣建 27 個會超過 Apps Script 的 6 分鐘上限而被中斷，
 *    而且不會報錯——你只會發現分頁沒建完。
 *    排程每天跑，分幾天就補齊了；急的話手動多執行幾次。
 *
 * 重複執行是安全的：已存在的分頁不會被動到。
 */
function ensureUpcomingWeekSheets() {
  var created = [];
  var existed = 0;
  var pending = 0;

  for (var i = 0; i <= WEEK_LOOKAHEAD_DAYS; i += 7) {
    var d = new Date();
    d.setDate(d.getDate() + i);

    if (findWeekSheet_(d)) { existed++; continue; }

    if (created.length >= MAX_NEW_WEEK_SHEETS_PER_RUN) { pending++; continue; }
    created.push(ensureWeekSheet(d).getName());
  }
  if (created.length) sortSheets();

  var msg = '週分頁檢查（未來 ' + WEEK_LOOKAHEAD_DAYS + ' 天）：新建 ' + created.length +
            ' 個，已存在 ' + existed + ' 個';
  if (created.length) msg += '\n新建：' + created.join('、');
  if (pending) {
    msg += '\n⚠️ 還有 ' + pending + ' 週尚未建立（單次上限 ' + MAX_NEW_WEEK_SHEETS_PER_RUN +
           ' 個，避免超過執行時間）。明天排程會繼續補，' +
           '要現在補齊就再執行這一支 ' + Math.ceil(pending / MAX_NEW_WEEK_SHEETS_PER_RUN) + ' 次。';
  }
  Logger.log(msg);
  if (created.length) logInfo_('ensureUpcomingWeekSheets', '自動建立週分頁', created.join('、'));
  return msg;
}


/** 舊名字保留，免得有人照舊習慣執行它 */
function ensureNextWeekSheet() { return ensureUpcomingWeekSheets(); }


/**
 * 要建立哪一天所屬的週分頁。改這裡再執行 addWeekSheetForDate()。
 * 格式 dd/mm/yyyy（跟全系統一致，日在前）。
 */
var TARGET_WEEK_DATE = '25/12/2026';

/**
 * 建立「更遠的未來」那一週的分頁。
 *
 * 每天自動建的只做到未來三週。有人訂了三個月後的機票時，
 * 那一週的分頁還不存在——改上面的 TARGET_WEEK_DATE 再執行這一支。
 *
 * ⚠️ 不要自己在 Sheet 上按右鍵新增分頁。手動建的沒有程式認得的標記，
 *    資料打進去看起來正常，但 app 完全查不到那一整週，而且不會報錯
 *    （設計約定第 7b 條）。
 *
 * 階段 2d 之後，從 app 新增接送資料時會自動建好對應的週分頁，
 * 這一支就只剩「直接在 Sheet 上打字」時才用得到。
 */
function addWeekSheetForDate() {
  var d = parseDMY_(TARGET_WEEK_DATE);
  if (!d) {
    var bad = 'TARGET_WEEK_DATE 格式不對：「' + TARGET_WEEK_DATE + '」。請用 dd/mm/yyyy，例如 25/12/2026';
    Logger.log(bad);
    return bad;
  }

  var existed = !!SpreadsheetApp.getActiveSpreadsheet().getSheetByName(weekSheetName_(d));
  var sheet = ensureWeekSheet(d);
  sortSheets();

  var msg = (existed ? '分頁已經存在：' : '已建立分頁：') + sheet.getName() +
            '（' + isoToDisplay_(isoDate_(weekStart_(d))) + ' 那一週）';
  Logger.log(msg);
  return msg;
}


/**
 * 這個分頁「長得像」週分頁嗎（表頭對得上主表的前幾欄）？
 * 用來認出手動建立、但沒有 weekStart 標記的分頁。
 */
function looksLikeWeekSheet_(sheet) {
  try {
    if (sheet.getLastColumn() < 17) return false;
    var header = sheet.getRange(1, 1, 1, 17).getValues()[0].map(normHeader_);
    for (var i = 0; i < 5; i++) {                 // 前 5 欄對得上就算數
      if (header[i] !== normHeader_(MAIN_COLUMNS[i].name)) return false;
    }
    return true;
  } catch (e) {
    return false;
  }
}


/**
 * 認養「長得像週分頁、但沒有 weekStart 標記」的分頁。
 *
 * ⚠️ 這是一張安全網。沒有它的話會發生這種連鎖失效：
 *      手動複製一個分頁 → 沒有標記 → onEdit 不認得它、不會自動帶入
 *      → 不會標記索引待更新 → 索引永遠不重建 → app 查不到那一整週
 *    而畫面上完全看不出異常。
 *
 * 週次從**第一列有日期的資料**推算，不是從分頁名稱——
 * 名稱是人取的，可能打錯或根本沒改。
 */
function adoptOrphanWeekSheets_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var adopted = [];

  ss.getSheets().forEach(function (sheet) {
    if (isWeekSheet_(sheet)) return;                       // 已經認得了
    var name = sheet.getName();
    if (name.charAt(0) === '_') return;                    // _INDEX 之類
    for (var k in SHEETS) { if (SHEETS[k] === name) return; }   // 固定分頁
    if (!looksLikeWeekSheet_(sheet)) return;

    // ⚠️ 每一張分頁各自包 try/catch。一張有問題的分頁（例如表頭少一欄，
    //    buildColumnMap_ 會丟例外）不可以害其他分頁也認養不了。
    try {
      var last = sheet.getLastRow();
      if (last < FIRST_DATA_ROW) return;                   // 還沒有資料，等有了再認養

      var map = buildColumnMap_(sheet, MAIN_COLUMNS);
      var dates = sheet.getRange(FIRST_DATA_ROW, map.tanggal, last - 1, 1).getValues();
      var found = null;
      for (var i = 0; i < dates.length && !found; i++) found = cellToDate_(dates[i][0]);
      if (!found) return;                                  // 沒有任何一列有日期，無從判斷

      sheet.addDeveloperMetadata('weekStart', isoDate_(weekStart_(found)));
      adopted.push(name + ' → ' + weekSheetName_(found));
    } catch (e) {
      logError_('adoptOrphanWeekSheets', '認養失敗', name + '：' + e.message);
    }
  });

  if (adopted.length) {
    logInfo_('adoptOrphanWeekSheets', '認養手動建立的週分頁', adopted.join('；'));
  }
  return adopted;
}


/**
 * 手動修復：認養孤兒分頁 ＋ 補齊格式 ＋ 排序。
 * 覺得「有一整週的資料在 app 上查不到」時執行這一支。
 */
function repairWeekSheets() {
  var adopted = adoptOrphanWeekSheets_();
  var refreshed = refreshDropdowns();
  sortSheets();
  markIndexDirty_();

  var msg = '認養 ' + adopted.length + ' 個分頁' +
            (adopted.length ? '：\n  ' + adopted.join('\n  ') : '（沒有孤兒分頁）') +
            '\n' + refreshed +
            '\n索引已標記待重建，5 分鐘內會生效（要馬上生效就執行 rebuildIndex）';
  Logger.log(msg);
  return msg;
}


/* ══════════════════════════════════════════════════════════════
   3. 匯入接送資料
   ══════════════════════════════════════════════════════════════ */

/**
 * 把 _IMPORT 分頁的資料分配到各週分頁。
 *
 * _IMPORT 的欄位順序 = 接送資料_轉檔.csv：
 *   第 1 欄是 _分頁（原始 Excel 的分頁名稱，只作參考，不使用）
 *   第 2~26 欄對應 MAIN_COLUMNS 的 25 欄
 *
 * ⚠️ 匯入 CSV 時一定要取消勾選「將文字轉換為數字、日期和公式」，
 *    否則 Google 會把 "30/08 20:00" 自作主張變成日期——那正是原始 Excel 的 bug。
 *
 * ⚠️ 重複執行會重複寫入。跑之前先確認週分頁是空的。
 */
function importBookings() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var imp = ss.getSheetByName(SHEETS.IMPORT);
  if (!imp || imp.getLastRow() < 2) {
    throw new Error('找不到 ' + SHEETS.IMPORT + ' 或裡面沒有資料。請先把 接送資料_轉檔.csv 匯入這個分頁。');
  }

  var n = MAIN_COLUMNS.length;
  var raw = imp.getRange(1, 1, imp.getLastRow(), n + 1).getDisplayValues();
  var header = raw[0];
  if (String(header[1]).indexOf('DATE PESAWAT') < 0) {
    throw new Error('_IMPORT 的欄位對不上。第 2 欄應該是 DATE PESAWAT，實際是「' + header[1] + '」');
  }

  var byWeek = {}, skipped = [], total = 0;

  for (var r = 1; r < raw.length; r++) {
    var row = raw[r];
    if (!String(row[1]).trim()) continue;

    var d = parseDMY_(row[1]);
    if (!d) { skipped.push('第 ' + (r + 1) + ' 列：日期「' + row[1] + '」看不懂'); continue; }

    var values = [];
    for (var c = 0; c < n; c++) values.push(String(row[c + 1]));
    values[0] = d;                                   // A 欄寫真正的日期值
    var asal = parseDMY_(values[22]);
    values[22] = asal ? asal : '';                   // W 欄原訂日期

    var key = isoDate_(weekStart_(d));
    if (!byWeek[key]) byWeek[key] = { date: d, rows: [] };
    byWeek[key].rows.push(values);
    total++;
  }

  var keys = Object.keys(byWeek).sort();
  keys.forEach(function (k) {
    var pack = byWeek[k];
    var sheet = ensureWeekSheet(pack.date);
    var start = Math.max(sheet.getLastRow() + 1, FIRST_DATA_ROW);
    if (start + pack.rows.length > sheet.getMaxRows()) {
      sheet.insertRowsAfter(sheet.getMaxRows(), start + pack.rows.length - sheet.getMaxRows());
    }
    sheet.getRange(start, 1, pack.rows.length, MAIN_COLUMNS.length).setValues(pack.rows);
    sheet.getRange(start, 1, pack.rows.length, 1).setNumberFormat('dd/mm/yyyy');
  });

  var log = [];
  log.push('匯入完成：' + total + ' 筆，分配到 ' + keys.length + ' 個週分頁');
  keys.forEach(function (k) {
    log.push('  ' + weekSheetName_(byWeek[k].date) + '　' + byWeek[k].rows.length + ' 筆');
  });
  if (skipped.length) {
    log.push('');
    log.push('略過 ' + skipped.length + ' 列：');
    skipped.forEach(function (s) { log.push('  ' + s); });
  }
  markIndexDirty_();      // 匯入是用程式寫的，不會觸發 onEdit，要自己標記

  log.push('');
  log.push('確認無誤後，可以自己把 ' + SHEETS.IMPORT + ' 分頁刪掉。');
  Logger.log(log.join('\n'));
  return log.join('\n');
}


/* ══════════════════════════════════════════════════════════════
   4. 檢查
   ══════════════════════════════════════════════════════════════ */

function checkSetup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var L = [];
  L.push('【試算表】' + ss.getName());
  L.push('  地區設定：' + ss.getSpreadsheetLocale() + (ss.getSpreadsheetLocale() === SYSTEM_INFO.locale ? ' ✓' : ' ⚠ 應為 ' + SYSTEM_INFO.locale));
  L.push('  時區    ：' + ss.getSpreadsheetTimeZone() + (ss.getSpreadsheetTimeZone() === SYSTEM_INFO.timezone ? ' ✓' : ' ⚠ 應為 ' + SYSTEM_INFO.timezone));
  L.push('');

  var need = [SHEETS.PERSON, SHEETS.FLIGHT, SHEETS.SETTING, SHEETS.ADMIN, SHEETS.LOG, SHEETS.INDEX];
  L.push('【固定分頁】');
  need.forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (!sh) { L.push('  ✗ ' + name + ' 不存在'); return; }
    var rows = Math.max(sh.getLastRow() - 1, 0);
    L.push('  ✓ ' + name + '　' + rows + ' 筆資料' + (sh.isSheetHidden() ? '（隱藏）' : ''));
  });

  L.push('');
  L.push('【週分頁】');
  var weeks = ss.getSheets().filter(isWeekSheet_);
  if (!weeks.length) {
    L.push('  （還沒有。執行 importBookings() 或 ensureNextWeekSheet() 之後才會出現）');
  } else {
    var total = 0;
    weeks.forEach(function (sh) {
      var rows = Math.max(sh.getLastRow() - 1, 0);
      total += rows;
      L.push('  ' + sh.getName() + '　' + rows + ' 筆');
    });
    L.push('  ── 合計 ' + total + ' 筆，' + weeks.length + ' 個分頁');
  }

  var imp = ss.getSheetByName(SHEETS.IMPORT);
  if (imp) {
    L.push('');
    L.push('【' + SHEETS.IMPORT + '】還在，' + Math.max(imp.getLastRow() - 1, 0) + ' 筆。確認匯入無誤後可以刪掉');
  }

  Logger.log(L.join('\n'));
  return L.join('\n');
}
