/**
 * AutoFill.js — 在 Google Sheet 上直接打字時的自動帶入與自動清除
 *
 * 這是「兩個寫入口」對策的第一支（CLAUDE.md 設計約定第 7 條，對策 1）。
 * app 那邊的自動帶入之後會另外寫；這一支是給「直接在 Sheet 上打字」的人用的。
 *
 * 觸發方式：onEdit 是 Apps Script 的**簡易觸發器**，不需要安裝，
 *          存檔之後就會自己生效。程式自己寫進去的值不會再觸發它，不會無限迴圈。
 *
 * 管三個地方：
 *   週分頁              打 email 或姓名 → 帶入名冊資料；清空 → 收回帶入的資料
 *   DAFTAR PERSONEL     自動編 person_id、AKTIF 預設「Ya 是」
 *   JADWAL PENERBANGAN  航班號轉大寫去空格、AKTIF 預設「Ya 是」
 *
 * ── 四條安全規則，改的時候不要拿掉 ──────────────────────────
 *
 * 1. 只填空白格，絕對不覆蓋已經有值的格子。
 *    使用者手動改過的東西被程式蓋掉，是最難查也最讓人不信任系統的一種 bug。
 *
 * 2. 一個 email 對到多個人時，只填「大家都一樣」的欄位（廠別、部門），
 *    姓名、房號一律留空。
 *    猜錯比不填更糟——房號填錯，車子會開到別人家門口。
 *    （實際資料：linda.lim@pci.co.id 底下三個人住 R6-1 / R6-2 / R6-3）
 *
 * 3. 廠別只有在「啟用中的廠別剛好只有一個」時才自動填。
 *    哪天多了第二個廠，它會自己停止猜測，不需要有人記得回來改程式。
 *
 * 4. 清除時只清「還跟名冊一模一樣」的格子。
 *    你手動改過的值（例如把房號改成新的）不會被連帶清掉。
 */

/** 一次最多處理幾列（貼上一大塊時的保險，避免超過 30 秒上限） */
var AUTOFILL_MAX_ROWS = 200;

/**
 * 依名冊自動帶入的欄位。**清除時也是清這一份清單，兩邊必須是同一份。**
 *
 * ⚠️ email 一定要在裡面。踩過一次：email 原本是特例處理（只在「用姓名找到人」時
 *    才填），沒有列進這份清單，於是刪掉 NAME 時 email 沒被清掉，
 *    緊接著自動帶入又看到 email 還在，把整列連同 NAME 全部填了回來。
 *    使用者看到的是「刪不掉，一刪就自己長回來」。
 */
var FILLABLE_FIELDS = ['email', 'name', 'nama_cina', 'dept', 'factory', 'dorm', 'hp'];

/** 這兩欄是「識別欄位」：填了會帶入，清空了會收回 */
var IDENTITY_FIELDS = ['email', 'name'];


function onEdit(e) {
  try {
    if (!e || !e.range) return;
    var sheet = e.range.getSheet();
    var name = sheet.getName();

    if (name === SHEETS.PERSON)  { onEditPerson_(e, sheet);  return; }
    if (name === SHEETS.FLIGHT)  { onEditFlight_(e, sheet);  return; }
    if (name === SHEETS.VEHICLE) { onEditVehicle_(e, sheet); return; }
    if (isWeekSheet_(sheet))     { onEditWeek_(e, sheet);    return; }

    // ⚠️ 手動建立（例如複製既有分頁）的週分頁沒有 weekStart 標記，
    //    上面那一行認不得它。不當場認養的話會連鎖失效：
    //    不帶入資料 → 不標記索引待更新 → 索引不重建 → app 查不到那一整週，
    //    而畫面上完全看不出異常。所以在有人開始打字的當下就把它收編。
    if (looksLikeWeekSheet_(sheet)) {
      adoptOrphanWeekSheets_();
      if (isWeekSheet_(sheet)) { onEditWeek_(e, sheet); return; }
    }
  } catch (err) {
    // 簡易觸發器丟例外只會安靜地失敗，所以至少留一筆紀錄
    Logger.log('onEdit 失敗：' + err.message);
  }
}


/**
 * 結構變動（插入列、刪除列、插入/刪除欄）。
 *
 * ⚠️ **onEdit 對這些完全不會觸發。** Google 把它們歸類為另一種事件，
 *    要用 onChange，而且 onChange **必須是安裝型觸發器**——
 *    存檔不會讓它生效，一定要跑 installTriggers()。
 *
 * 少了這一支會出兩種事，兩種都不會報錯：
 *
 *   1. 在週分頁「右鍵 → 刪除列」→ 索引不知道 → 那筆已刪除的資料
 *      **繼續出現在使用者的查詢結果裡**，直到 6 小時後的強制重建。
 *   2. 在名冊刪掉重複的那一列 → 另一列的紅底標記留著，
 *      你會去找一個已經解決的問題。
 *
 * ⚠️ onChange 不會告訴你改了哪一列，只知道「發生了什麼類型的變動」。
 *    所以這裡的做法一律是「整個重算」，不做局部更新。
 */
function onSheetChange(e) {
  try {
    var type = e && e.changeType ? String(e.changeType) : '';
    // 一般的儲存格編輯已經由 onEdit 處理過了，這裡只管結構變動
    if (['INSERT_ROW', 'REMOVE_ROW', 'INSERT_COLUMN', 'REMOVE_COLUMN',
         'INSERT_GRID', 'REMOVE_GRID'].indexOf(type) < 0) return;

    // 插入或刪除列會改變資料內容 → 索引一定要重建
    markIndexDirty_();

    // ⚠️ 不去猜「使用者現在在哪一張分頁」。
    //    onChange **不會告訴你改的是哪一張分頁**，getActiveSheet() 只是猜——
    //    刪完列立刻切走、用 Ctrl+Z 復原、或另一台裝置同時操作時就會猜錯。
    //    而猜錯的樣子是「刪掉重複的之後紅底一直留著」，沒有任何錯誤訊息。
    //    兩份名冊加起來不到一百列，無條件重算的成本可以忽略。
    refreshRosterMarks_();
  } catch (err) {
    logError_('onSheetChange', '處理結構變動失敗（' +
              (e && e.changeType) + '）', err.message);
  }
}


/* ══════════════════════════════════════════════════════════════
   週分頁
   ══════════════════════════════════════════════════════════════ */

function onEditWeek_(e, sheet) {
  var firstRow = Math.max(e.range.getRow(), FIRST_DATA_ROW);
  var lastRow  = Math.min(e.range.getLastRow(), firstRow + AUTOFILL_MAX_ROWS - 1);
  if (lastRow < firstRow) return;

  // 識別欄位被清空 → 先收回當初帶入的資料
  clearDerivedIfIdentityRemoved_(e, sheet);
  clearVehicleIfPlateRemoved_(e, sheet);

  // ⚠️ 上鎖是為了 booking_id：兩個人同時在打字時，
  //    沒上鎖會拿到同一個號碼，程式會以為是同一筆，改 A 的時候改到 B。
  //    搶不到鎖就先不補（下一次編輯會補上），不要卡住使用者打字。
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(8000)) return;
  try {
    autoFillRows_(sheet, firstRow, lastRow - firstRow + 1);
  } finally {
    lock.releaseLock();
  }

  // 告訴排程「有東西改了，該重建索引了」。
  // 沒有這一行的話，排程只能無條件每 5 分鐘重建一次，一天就會超出配額（見 Index.js）。
  markIndexDirty_();
}


/**
 * 車號被清空時，把跟著帶出來的司機與電話一併清掉。
 * 判斷方式跟人員那邊一樣：只清「還等於車輛名冊上的值」的格子。
 */
function clearVehicleIfPlateRemoved_(e, sheet) {
  var iPlate = colIndexOrZero_(MAIN_COLUMNS, 'kendaraan');
  if (!iPlate) return;                                       // 欄位還沒加就不做事
  if (e.range.getNumRows() !== 1 || e.range.getNumColumns() !== 1) return;
  if (e.range.getColumn() !== iPlate) return;
  if (String(e.range.getValue()).trim() !== '') return;

  var oldPlate = String(e.oldValue == null ? '' : e.oldValue).trim();
  if (!oldPlate) return;
  var v = lookupVehicle_(oldPlate);
  if (!v) return;

  var row = e.range.getRow();
  var changed = false;
  [['sopir', v.sopir], ['hp_sopir', v.hp_sopir]].forEach(function (pair) {
    var i = colIndexOrZero_(MAIN_COLUMNS, pair[0]);
    if (!i || !pair[1]) return;
    var cell = sheet.getRange(row, i);
    if (String(cell.getValue()).trim() === pair[1]) { cell.clearContent(); changed = true; }
  });
  if (changed) SpreadsheetApp.flush();
}


/**
 * email 或姓名被清空時，把當初依它帶入的欄位一併清掉。
 *
 * ⚠️ 只在「單獨一格被清空」時作用。
 *    一次選很多格按 Delete 的話，Google 不會提供 e.oldValue，
 *    沒有舊值就查不到是誰，也就無從判斷哪些格子是程式填的。
 *    這種情況寧可什麼都不做，也不要猜著清——清錯是救不回來的。
 */
function clearDerivedIfIdentityRemoved_(e, sheet) {
  if (e.range.getNumRows() !== 1 || e.range.getNumColumns() !== 1) return;
  if (String(e.range.getValue()).trim() !== '') return;      // 不是清空
  var oldValue = String(e.oldValue == null ? '' : e.oldValue).trim();
  if (!oldValue) return;

  var editedCol = e.range.getColumn();
  var field = null;
  for (var i = 0; i < IDENTITY_FIELDS.length; i++) {
    if (editedCol === colIndexOf_(MAIN_COLUMNS, IDENTITY_FIELDS[i])) { field = IDENTITY_FIELDS[i]; break; }
  }
  if (!field) return;

  var people = (field === 'email') ? lookupByEmail_(oldValue) : lookupByName_(oldValue);
  if (!people || !people.length) return;

  var row = e.range.getRow();
  var n = MAIN_COLUMNS.length;
  var range = sheet.getRange(row, 1, 1, n);
  var values = range.getValues();
  var changed = false;

  FILLABLE_FIELDS.forEach(function (code) {
    var i = idx_(code);
    var current = String(values[0][i]).trim();
    if (!current) return;
    if (current === agreedValue_(people, code)) {    // 還是名冊上的值 → 是程式填的
      values[0][i] = '';
      changed = true;
    }
  });

  if (changed) {
    range.setValues(values);
    // 逼它現在就寫進去。緊接著跑的 autoFillRows_ 會重新讀這一列，
    // 讀到舊值的話會把剛清掉的東西又填回來。
    SpreadsheetApp.flush();
  }
}


/**
 * 把指定範圍的列補齊。setValues 一次寫回，不要一格一格寫
 * （一格一格寫在貼上 20 列時會慢到讓人以為當掉）。
 */
function autoFillRows_(sheet, startRow, numRows) {
  var n = MAIN_COLUMNS.length;
  var range = sheet.getRange(startRow, 1, numRows, n);
  var values = range.getValues();

  var iFactory = idx_('factory'), iStatus = idx_('status');
  var iEmail = idx_('email'), iName = idx_('name'), iBooking = idx_('booking_id');
  var iUpdAt = idx_('updated_at'), iUpdBy = idx_('updated_by');

  var defFactory = undefined;
  var now = null, who = null;
  var touched = false;

  for (var r = 0; r < numRows; r++) {
    var row = values[r];

    // ── 整列都空了 → 把隱藏欄也清乾淨 ──
    // 少了這一段，刪掉內容的那一列會因為 STATUS / 最後更新時間還在，
    // 被 getLastRow() 當成「有資料」，之後新增的資料會從更下面開始，中間留空洞。
    if (!rowHasData_(row)) {
      if (clearHiddenIfAny_(row)) touched = true;
      continue;
    }

    // ── 依 email 或姓名從名冊帶入 ──
    var people = null;
    var email = String(row[iEmail]).trim();
    if (email) people = lookupByEmail_(email);
    if ((!people || !people.length) && String(row[iName]).trim()) {
      people = lookupByName_(String(row[iName]).trim());
    }
    if (people && people.length) {
      // 用姓名找到人時，email 也會在這個迴圈裡被帶出來（它就在 FILLABLE_FIELDS 裡），
      // 不要為它另外寫一段特例——填入和清除一旦用不同的清單就會對不起來。
      FILLABLE_FIELDS.forEach(function (code) {
        var i = idx_(code);
        if (String(row[i]).trim()) return;                    // 規則 1：不覆蓋
        // 規則 2：對到多個人時，只有大家都一樣的欄位才填
        var v = agreedValue_(people, code);
        if (v) row[i] = v;
      });
    }

    // ── 派車：打了車號就帶出司機與電話 ──
    // 介面還沒做，但資料層先支援。欄位標了 optional，
    // 所以一定要檢查欄號存在（設計約定第 12 條）。
    fillVehicle_(row);

    // ── 廠別：啟用中只有一個時才填（規則 3）──
    if (!String(row[iFactory]).trim()) {
      if (defFactory === undefined) defFactory = soleFactory_();
      if (defFactory) row[iFactory] = defFactory;
    }

    // ── 狀態預設 ──
    if (!String(row[iStatus]).trim()) row[iStatus] = LIST_STATUS[0];

    // ── booking_id：手打的列也要有編號 ──
    // ⚠️ 沒有編號的列，階段 2d 的修改／刪除功能認不出來（設計約定第 3 條：
    //    一律用 id 查找、不可用列號）。所以在打字的當下就給它。
    //    只有日期填好之後才編號——沒有日期就算不出年月，
    //    而且那種列通常是打到一半，先給號碼只會留下空洞。
    if (!String(row[iBooking]).trim()) {
      var d = cellToDate_(row[idx_('tanggal')]);
      if (d) row[iBooking] = nextBookingId_(d);
    }

    // ── 最後更新 ──
    if (now === null) { now = nowStampText_(); who = currentUser_(); }
    row[iUpdAt] = now;
    row[iUpdBy] = who;

    touched = true;
  }

  if (touched) range.setValues(values);
}


/** 把 R~Y（隱藏欄）清空。有清到東西回傳 true。 */
function clearHiddenIfAny_(row) {
  var changed = false;
  for (var i = 0; i < MAIN_COLUMNS.length; i++) {
    if (!MAIN_COLUMNS[i].hidden) continue;
    if (String(row[i]).trim() !== '') { row[i] = ''; changed = true; }
  }
  return changed;
}


/** 前 17 欄（A~Q）有任何一格有值，就算這一列有資料 */
function rowHasData_(row) {
  for (var i = 0; i < 17 && i < row.length; i++) {
    if (String(row[i]).trim() !== '') return true;
  }
  return false;
}

function idx_(code) { return colIndexOf_(MAIN_COLUMNS, code) - 1; }   // 0 起算

/**
 * 這些人在某個欄位上的值全都一樣就回傳那個值，不一樣就回傳 ''。
 * 帶入與清除都用它，所以兩邊的判斷永遠一致——這一點很重要：
 * 若帶入用一套邏輯、清除用另一套，就會出現「填得進去卻清不掉」的怪現象。
 */
function agreedValue_(people, field) {
  var v = String(people[0][field] || '').trim();
  if (!v) return '';
  for (var k = 1; k < people.length; k++) {
    if (String(people[k][field] || '').trim() !== v) return '';
  }
  return v;
}


/* ══════════════════════════════════════════════════════════════
   人員名冊
   ══════════════════════════════════════════════════════════════ */

/** 讀人員名冊。只讀啟用中的。整支 onEdit 期間只讀一次。 */
var _ROSTER_CACHE = null;

function readRoster_() {
  if (_ROSTER_CACHE) return _ROSTER_CACHE;
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.PERSON);
  var out = { byEmail: {}, byName: {} };
  if (!sheet || sheet.getLastRow() < FIRST_DATA_ROW) { _ROSTER_CACHE = out; return out; }

  var n = PERSON_COLUMNS.length;
  var rows = sheet.getRange(FIRST_DATA_ROW, 1, sheet.getLastRow() - 1, n).getValues();
  var c = {};
  PERSON_COLUMNS.forEach(function (col, i) { c[col.code] = i; });

  rows.forEach(function (r) {
    if (CODE_OF[String(r[c.aktif]).trim()] === 'N') return;      // 停用的不帶入
    var p = {
      email:     String(r[c.email]).trim(),
      name:      String(r[c.name]).trim(),
      nama_cina: String(r[c.nama_cina]).trim(),
      dept:      String(r[c.dept]).trim(),
      factory:   String(r[c.factory]).trim(),
      dorm:      String(r[c.dorm]).trim(),
      hp:        String(r[c.hp]).trim()
    };
    if (p.email) {
      var ke = p.email.toLowerCase();
      if (!out.byEmail[ke]) out.byEmail[ke] = [];
      out.byEmail[ke].push(p);
    }
    if (p.name) {
      var kn = p.name.toLowerCase();
      if (!out.byName[kn]) out.byName[kn] = [];
      out.byName[kn].push(p);
    }
  });
  _ROSTER_CACHE = out;
  return out;
}

function lookupByEmail_(email) { return readRoster_().byEmail[String(email).trim().toLowerCase()] || []; }
function lookupByName_(name)   { return readRoster_().byName[String(name).trim().toLowerCase()] || []; }


/**
 * 在名冊上直接打字時：自動編 person_id、AKTIF 預設「Ya 是」。
 *
 * person_id 只有在「email 和姓名都有了」之後才編號，
 * 不然打到一半就先給號碼，刪掉那一列會留下號碼的洞。
 */
function onEditPerson_(e, sheet) {
  var firstRow = Math.max(e.range.getRow(), FIRST_DATA_ROW);
  var lastRow  = Math.min(e.range.getLastRow(), firstRow + AUTOFILL_MAX_ROWS - 1);
  if (lastRow < firstRow) return;

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;          // 搶不到鎖就放棄，下次編輯會再補
  try {
    var n = PERSON_COLUMNS.length;
    var iId = colIndexOf_(PERSON_COLUMNS, 'person_id') - 1;
    var iEmail = colIndexOf_(PERSON_COLUMNS, 'email') - 1;
    var iName = colIndexOf_(PERSON_COLUMNS, 'name') - 1;
    var iAktif = colIndexOf_(PERSON_COLUMNS, 'aktif') - 1;

    var next = nextSeqId_(sheet, iId, 'P');
    var range = sheet.getRange(firstRow, 1, lastRow - firstRow + 1, n);
    var values = range.getValues();
    var touched = false;

    for (var r = 0; r < values.length; r++) {
      var row = values[r];
      var hasIdentity = String(row[iEmail]).trim() && String(row[iName]).trim();
      if (!hasIdentity) continue;
      if (!String(row[iId]).trim())    { row[iId] = 'P' + pad3_(next++); touched = true; }
      if (!String(row[iAktif]).trim()) { row[iAktif] = LIST_YATIDAK[0];  touched = true; }
    }
    if (touched) range.setValues(values);
  } finally {
    lock.releaseLock();
  }

  // ⚠️ 刻意放在鎖外面：標記只是重算格式，不改資料，不需要鎖。
  //    兩個人同時編輯時各自算一次，算出來的結果一樣，沒有衝突。
  markPersonDuplicates_(sheet);
}


/**
 * 把重複的人標成紅底並加上註解；不重複的就把標記清掉。
 * 跟航班名冊同一套做法（見 markFlightDuplicates_），只有「什麼算重複」不一樣。
 *
 * ⚠️ **不可以只看 email。** 眷屬與員工共用同一個 email 是**刻意的設計**
 *    （設計約定第 6 條：linda.lim@pci.co.id 底下有三個人）。
 *    只看 email 的話，會把整家人標成紅色——那不是重複，那是正常資料，
 *    而且會讓這個提示立刻失去可信度。
 *
 * ⚠️ 標在**姓名**那一欄，不標 email。理由同上：email 重複是正常的，
 *    在 email 上塗紅色會把人引導到錯的地方去看。
 *
 * ⚠️ 每次都重掃整欄，不是只看剛改的那幾列——
 *    只標新的那一列的話，把重複的刪掉之後另一列的紅底會一直留著，
 *    使用者會去找一個已經解決的問題（跟航班名冊同一個理由）。
 */
function markPersonDuplicates_(sheet) {
  var last = sheet.getLastRow();
  if (last < FIRST_DATA_ROW) return;

  var iEmail = colIndexOf_(PERSON_COLUMNS, 'email');
  var iName  = colIndexOf_(PERSON_COLUMNS, 'name');
  var values = sheet.getRange(FIRST_DATA_ROW, 1, last - 1, PERSON_COLUMNS.length).getValues();

  // 先數每個「email ＋ 姓名」各出現在哪幾列
  var rowsOf = {};
  values.forEach(function (r, i) {
    var key = personKey_(r[iEmail - 1], r[iName - 1]);
    if (!key) return;
    (rowsOf[key] = rowsOf[key] || []).push(FIRST_DATA_ROW + i);
  });

  var backgrounds = [];
  var notes = [];
  values.forEach(function (r, i) {
    var key = personKey_(r[iEmail - 1], r[iName - 1]);
    var dup = key && rowsOf[key].length > 1;
    backgrounds.push([dup ? '#FBEDEC' : null]);
    notes.push([dup
      ? '⚠️ 名冊重複\n' +
        '同一個人也出現在第 ' +
        rowsOf[key].filter(function (n) { return n !== FIRST_DATA_ROW + i; }).join('、') +
        ' 列（email 與姓名都一樣）。\n\n' +
        '同一個人建兩次的後果：\n' +
        '· 改房號或停用時只會改到其中一筆，另一筆繼續生效\n' +
        '· 兩筆的值一旦不一樣，輸入接送資料時那個欄位就會**安靜地不再自動帶入**\n\n' +
        '請把多餘的那一列刪掉（歷史紀錄不會受影響）。'
      : '']);
  });

  var range = sheet.getRange(FIRST_DATA_ROW, iName, last - 1, 1);
  range.setBackgrounds(backgrounds);
  range.setNotes(notes);
}


/**
 * 名冊的「同一個人」怎麼認：email ＋ 姓名，**兩個都有值**才算。
 *
 * 只有其中一個的（打到一半的列）一律不判斷——
 * 打字打到 email 那一格時，姓名還是空的，這時候標紅底只會嚇到人。
 *
 * 大小寫與多餘空白都正規化掉：'Mr  Kyle Ma' 跟 'mr kyle ma' 是同一個人。
 */
function personKey_(email, name) {
  var e = str_(email).toLowerCase();
  var n = str_(name).toLowerCase().replace(/\s+/g, ' ');
  return (e && n) ? (e + '|' + n) : '';
}


/**
 * 重算兩份名冊的重複標記。
 * onChange（插入／刪除列）與 onOpen（開啟試算表）都呼叫它。
 *
 * ⚠️ 兩份各自包 try/catch：其中一份出錯（例如有人把表頭改壞了）
 *    絕對不可以害另一份跟著不更新。
 */
function refreshRosterMarks_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  try {
    var p = ss.getSheetByName(SHEETS.PERSON);
    if (p) markPersonDuplicates_(p);
  } catch (e) {
    Logger.log('重算人員名冊重複標記失敗：' + e.message);
  }
  try {
    var f = ss.getSheetByName(SHEETS.FLIGHT);
    if (f) markFlightDuplicates_(f);
  } catch (e) {
    Logger.log('重算航班名冊重複標記失敗：' + e.message);
  }
}


/**
 * 掃出目前最大的「前綴＋數字」編號再加一（P001 / K001 …）。
 * ⚠️ 掃的是整欄現有值，所以刪掉中間某一列不會讓號碼被重複發放。
 */
function nextSeqId_(sheet, iId, prefix) {
  if (sheet.getLastRow() < FIRST_DATA_ROW) return 1;
  var ids = sheet.getRange(FIRST_DATA_ROW, iId + 1, sheet.getLastRow() - 1, 1).getValues();
  var re = new RegExp('^' + prefix + '(\\d+)$', 'i');
  var max = 0;
  ids.forEach(function (r) {
    var m = String(r[0]).trim().match(re);
    if (m && Number(m[1]) > max) max = Number(m[1]);
  });
  return max + 1;
}

function pad3_(n) { return (n < 10 ? '00' : (n < 100 ? '0' : '')) + n; }


/* ══════════════════════════════════════════════════════════════
   航班名冊
   ══════════════════════════════════════════════════════════════ */

/**
 * 航班號正規化：轉大寫、去掉所有空格。
 *
 * 原始資料裡就有 'CZ 8056'（中間有空格）和 ' CZ8353'（開頭有空格）。
 * 那種空格肉眼看不出來，但程式搜尋 'CZ8353' 會找不到那一筆。
 * 在打字的當下就修掉，比事後健檢有效。
 */
function onEditFlight_(e, sheet) {
  var firstRow = Math.max(e.range.getRow(), FIRST_DATA_ROW);
  var lastRow  = Math.min(e.range.getLastRow(), firstRow + AUTOFILL_MAX_ROWS - 1);
  if (lastRow < firstRow) return;

  var n = FLIGHT_COLUMNS.length;
  var iFlight = colIndexOf_(FLIGHT_COLUMNS, 'flight') - 1;
  var iAktif  = colIndexOf_(FLIGHT_COLUMNS, 'aktif') - 1;

  var range = sheet.getRange(firstRow, 1, lastRow - firstRow + 1, n);
  var values = range.getValues();
  var touched = false;

  for (var r = 0; r < values.length; r++) {
    var row = values[r];
    var raw = String(row[iFlight]);
    var norm = raw.replace(/\s+/g, '').toUpperCase();
    if (norm && norm !== raw) { row[iFlight] = norm; touched = true; }
    if (norm && !String(row[iAktif]).trim()) { row[iAktif] = LIST_YATIDAK[0]; touched = true; }
  }
  if (touched) range.setValues(values);

  markFlightDuplicates_(sheet);
}


/**
 * 把重複的航班號標成紅底並加上註解；不重複的就把標記清掉。
 *
 * ⚠️ 用「紅底 ＋ 註解」而不是跳視窗：
 *    onEdit 是簡易觸發器，權限有限，`SpreadsheetApp.getUi().alert()`
 *    在這裡會直接丟權限錯誤。而且跳視窗會打斷打字的節奏——
 *    一格一格輸入時每打錯一次就跳一個框，很快就會讓人想關掉這個功能。
 *    紅底是「看得到但不擋路」，這種提示才留得住。
 *
 * ⚠️ 每次都重掃整欄，不是只看剛改的那幾列。
 *    只標新的那一列的話，你把重複的改掉之後，**另一列的紅底會一直留著**——
 *    使用者會以為還沒解決，然後去找一個已經不存在的問題。
 *    航班名冊只有幾十列，整欄重掃的成本可以忽略。
 *
 * ⚠️ 只提示、不阻擋。打到一半的值本來就可能暫時跟別人一樣。
 */
function markFlightDuplicates_(sheet) {
  var last = sheet.getLastRow();
  if (last < FIRST_DATA_ROW) return;

  var iFlight = colIndexOf_(FLIGHT_COLUMNS, 'flight');
  var range = sheet.getRange(FIRST_DATA_ROW, iFlight, last - 1, 1);
  var values = range.getValues();

  // 先數每個航班號各出現在哪幾列
  var rowsOf = {};
  values.forEach(function (r, i) {
    var code = normPlate_(r[0]).replace(/\s+/g, '');
    if (!code) return;
    (rowsOf[code] = rowsOf[code] || []).push(FIRST_DATA_ROW + i);
  });

  var backgrounds = [];
  var notes = [];
  values.forEach(function (r, i) {
    var code = normPlate_(r[0]).replace(/\s+/g, '');
    var dup = code && rowsOf[code].length > 1;
    backgrounds.push([dup ? '#FBEDEC' : null]);
    notes.push([dup
      ? '⚠️ 航班號重複\n' + code + ' 也出現在第 ' +
        rowsOf[code].filter(function (n) { return n !== FIRST_DATA_ROW + i; }).join('、') +
        ' 列。\n\n同一個航班號只能有一列，不然自動帶入起降時間時不知道要用哪一個。'
      : '']);
  });

  range.setBackgrounds(backgrounds);
  range.setNotes(notes);
}


/* ══════════════════════════════════════════════════════════════
   車輛名冊（派車功能的資料層，介面還沒做）
   ══════════════════════════════════════════════════════════════ */

var _VEHICLE_CACHE = null;

/** 讀車輛名冊，整理成 { 車號: {sopir, hp_sopir} }。只讀啟用中的。 */
function readVehicles_() {
  if (_VEHICLE_CACHE) return _VEHICLE_CACHE;
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.VEHICLE);
  var out = {};
  if (!sheet || sheet.getLastRow() < FIRST_DATA_ROW) { _VEHICLE_CACHE = out; return out; }

  var n = VEHICLE_COLUMNS.length;
  var rows = sheet.getRange(FIRST_DATA_ROW, 1, sheet.getLastRow() - 1, n).getValues();
  var c = {};
  VEHICLE_COLUMNS.forEach(function (col, i) { c[col.code] = i; });

  rows.forEach(function (r) {
    var plate = normPlate_(r[c.kendaraan]);
    if (!plate) return;
    if (CODE_OF[String(r[c.aktif]).trim()] === 'N') return;
    out[plate] = {
      sopir:    String(r[c.sopir]).trim(),
      hp_sopir: String(r[c.hp_sopir]).trim()
    };
  });
  _VEHICLE_CACHE = out;
  return out;
}

function lookupVehicle_(plate) { return readVehicles_()[normPlate_(plate)] || null; }

/** 車號正規化：轉大寫、把連續空白壓成一個。'b 1234  abc' → 'B 1234 ABC' */
function normPlate_(s) { return String(s == null ? '' : s).trim().replace(/\s+/g, ' ').toUpperCase(); }

/** 主表：打了車號就帶出司機與電話（只填空白格） */
function fillVehicle_(row) {
  var iPlate = colIndexOrZero_(MAIN_COLUMNS, 'kendaraan');
  if (!iPlate) return;
  var plate = String(row[iPlate - 1]).trim();
  if (!plate) return;
  var v = lookupVehicle_(plate);
  if (!v) return;

  var iSopir = colIndexOrZero_(MAIN_COLUMNS, 'sopir');
  var iHp    = colIndexOrZero_(MAIN_COLUMNS, 'hp_sopir');
  if (iSopir && v.sopir && !String(row[iSopir - 1]).trim()) row[iSopir - 1] = v.sopir;
  if (iHp && v.hp_sopir && !String(row[iHp - 1]).trim())    row[iHp - 1] = v.hp_sopir;
}

/** 車輛名冊上直接打字：車號正規化、自動編號、AKTIF 預設「Ya 是」 */
function onEditVehicle_(e, sheet) {
  var firstRow = Math.max(e.range.getRow(), FIRST_DATA_ROW);
  var lastRow  = Math.min(e.range.getLastRow(), firstRow + AUTOFILL_MAX_ROWS - 1);
  if (lastRow < firstRow) return;

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  try {
    var n = VEHICLE_COLUMNS.length;
    var iId    = colIndexOf_(VEHICLE_COLUMNS, 'kendaraan_id') - 1;
    var iPlate = colIndexOf_(VEHICLE_COLUMNS, 'kendaraan') - 1;
    var iAktif = colIndexOf_(VEHICLE_COLUMNS, 'aktif') - 1;

    var next = nextSeqId_(sheet, iId, 'K');
    var range = sheet.getRange(firstRow, 1, lastRow - firstRow + 1, n);
    var values = range.getValues();
    var touched = false;

    for (var r = 0; r < values.length; r++) {
      var row = values[r];
      var raw = String(row[iPlate]);
      var plate = normPlate_(raw);
      if (!plate) continue;
      if (plate !== raw)               { row[iPlate] = plate;          touched = true; }
      if (!String(row[iId]).trim())    { row[iId] = 'K' + pad3_(next++); touched = true; }
      if (!String(row[iAktif]).trim()) { row[iAktif] = LIST_YATIDAK[0]; touched = true; }
    }
    if (touched) range.setValues(values);
  } finally {
    lock.releaseLock();
  }
}


/* ══════════════════════════════════════════════════════════════
   共用
   ══════════════════════════════════════════════════════════════ */

/** 啟用中的廠別剛好一個就回傳它，零個或多個都回傳 null（不猜） */
function soleFactory_() {
  var list = dropdownSources_()['FACTORY'] || [];
  return list.length === 1 ? list[0] : null;
}

function currentUser_() {
  try {
    return Session.getActiveUser().getEmail() || 'Sheet';
  } catch (e) {
    return 'Sheet';
  }
}
