/**
 * Menu.js — 試算表上的自訂選單，以及開啟時自動跳到本週
 *
 * ⚠️ onOpen 是**簡易觸發器**，存檔後就會生效，不需要安裝。
 *    但它在「沒有授權」的狀態下權限很有限——所以每一段都各自包 try/catch，
 *    其中一段失敗不可以害整個選單都出不來。
 *
 * 為什麼要有選單：日常維護（資料健檢、清除殘留、建立週分頁）
 * 本來都要開 Apps Script 編輯器、找函式、按執行。
 * 那個門檻高到人不會去做，而不做的結果就是問題累積到很久以後才爆。
 * 放在試算表上方點兩下就好，才會真的被用。
 *
 * ⚠️ 從選單呼叫的函式是「使用者主動觸發」，權限跟手動執行一樣完整，
 *    所以可以用 HtmlService 顯示報告、可以寄信。這跟 onEdit / onOpen
 *    本身的限制是兩回事。
 */

function onOpen(e) {
  // 選單優先。就算下面的自動跳頁失敗，至少工具還在
  try {
    SpreadsheetApp.getUi()
      .createMenu('🛫 機場接送')
      .addItem('跳到本週', 'gotoThisWeek')
      .addSeparator()
      .addItem('資料健檢', 'menuCheckData')
      .addItem('重建索引（讓 app 立刻看到最新資料）', 'menuRebuildIndex')
      .addSeparator()
      .addItem('建立未來的週分頁', 'menuEnsureWeeks')
      .addItem('清除殘留列', 'menuCleanupGhostRows')
      .addItem('修復週分頁（認養 + 補格式）', 'menuRepairWeekSheets')
      .addItem('重設名冊的重複標示', 'menuPersonHighlight')
      .addItem('整理人員名冊欄位（移除退役欄）', 'menuTidyPersonColumns')
      .addToUi();
  } catch (err) {
    Logger.log('建立選單失敗：' + err.message);
  }

  try {
    gotoThisWeek();
  } catch (err) {
    Logger.log('自動跳到本週失敗：' + err.message);
  }

  /* ── 自我修復：重算航班名冊的重複標記 ──────────────────────
   *
   * ⚠️ **人員名冊不在這裡。** 它的「中文姓名重複」改用 Google Sheet 內建的
   *    條件式格式（gas/Setup.js 的 setupPersonHighlight_），那是 Sheet 自己
   *    即時算的，不需要任何重算。下面整段講的是航班名冊。
   *
   * 紅底＋註解**是衍生資料**，跟 `_INDEX` 一樣：真相在資料欄裡，
   * 標記只是算出來的結果。衍生資料就該有一個「重算就好」的入口。
   *
   * 平常維護它的是兩條路，而**兩條都會靜默失效**：
   *
   *   onEdit（簡易觸發器）    改內容、按 Delete 清空 → 會跑，這條很穩
   *   onSheetChange（安裝型） 右鍵「刪除列」 → 只有裝了才會跑
   *
   * 第二條有三種失效方式，共同點是**完全不會有錯誤訊息**：
   *   1. 新增觸發器之後忘了跑 installTriggers()
   *   2. 換人安裝——觸發器是跟著「安裝的人」跑的，不是跟著檔案
   *   3. Google 因為授權變動把它停用
   *
   * 失效的樣子是「刪掉重複的那一列之後，另一列的紅底一直留著」——
   * 於是有人會去找一個已經解決的問題，而且會開始不相信這個提示。
   *
   * onOpen 是**簡易觸發器**：存檔就生效、不必安裝、不會因為誰忘記而消失。
   * 所以拿它當最後一道防線——就算上面那條路掛了，下次打開試算表標記就是對的。
   *
   * ⚠️ 放在前面那些 try/catch 的**外面**：選單或跳頁失敗，
   *    不可以連帶讓這道防線消失。refreshRosterMarks_() 自己也包了 try/catch
   *    （唯讀身分開啟時寫不進去），所以它失敗也不會往外炸。
   *
   * ⚠️ 成本可以忽略：兩份名冊加起來不到一百列，大約 0.3~0.6 秒，
   *    而且是在開檔案的當下，沒有人在等它。
   */
  refreshRosterMarks_();
}


/**
 * 切到「今天所屬的那一週」的分頁。
 *
 * ⚠️ 找不到就什麼都不做——不要自作主張建立分頁。
 *    onOpen 的權限有限，而且「打開檔案就默默多一個分頁」很嚇人。
 *    缺分頁的話由每天 03:00 的排程補，或從選單按「建立未來的週分頁」。
 */
function gotoThisWeek() {
  var sheet = findWeekSheet_(new Date());
  if (!sheet) return '找不到本週的分頁，請從選單按「建立未來的週分頁」';
  SpreadsheetApp.getActiveSpreadsheet().setActiveSheet(sheet);
  return sheet.getName();
}


/* ══════════════════════════════════════════════════════════════
   選單項目
   ══════════════════════════════════════════════════════════════ */

function menuCheckData()         { showReport_('資料健檢', checkData()); }
function menuRebuildIndex()      { showReport_('重建索引', rebuildIndex()); }
function menuEnsureWeeks()       { showReport_('建立未來的週分頁', ensureUpcomingWeekSheets()); }
function menuCleanupGhostRows()  { showReport_('清除殘留列', cleanupGhostRows()); }
function menuRepairWeekSheets()  { showReport_('修復週分頁', repairWeekSheets()); }

/**
 * 重新套用「中文姓名重複 → 整列標黃」的條件式格式。
 *
 * 平常不必按——條件式格式設定一次就永遠有效，是 Google 自己在算的。
 * 這個選單項目是給兩種情況用的：
 *   1. 這個功能剛上線，還沒套用過
 *   2. 有人不小心把那條規則刪掉了
 */
function menuPersonHighlight() { showReport_('重設名冊的重複標示', setupPersonHighlight_()); }

/**
 * 把人員名冊上已經退役的欄位刪掉，然後重套整列標黃的規則。
 *
 * ⚠️ 兩件事一定要一起做，所以放在同一個選單項目裡：
 *    整列標黃的範圍是從 PERSON_COLUMNS.length 算出來的（少一欄 → A2:K 變 A2:J）。
 *    只刪欄不重套，最右邊會多黃一欄；只重套不刪欄，那一欄還在。
 *
 * ⚠️ 用選單而不是叫人自己在 Sheet 上右鍵刪欄：程式是**按表頭名稱**找欄的，
 *    不可能刪到隔壁那一欄。手動刪欄刪錯一格就是真的資料不見了。
 *
 * 重複按是安全的：欄已經刪掉之後第二次是空轉，規則也只是重套一次。
 */
function menuTidyPersonColumns() {
  var lines = [];
  lines.push(dropRetiredPersonColumns_());
  lines.push(setupPersonHighlight_());
  showReport_('整理人員名冊欄位', lines.join('\n'));
}


/**
 * 把報告顯示在一個可以捲動、可以複製的視窗裡。
 *
 * ⚠️ 不用 ui.alert()：健檢報告可能有幾十行，alert 顯示長文很難讀，
 *    而且沒辦法複製起來貼給別人看。
 */
function showReport_(title, text) {
  var html = HtmlService.createHtmlOutput(
      '<div style="font:13px/1.6 ui-monospace,Menlo,Consolas,monospace;' +
      'white-space:pre-wrap;word-break:break-word;padding:4px">' +
      escapeHtml_(String(text)) + '</div>')
    .setWidth(720)
    .setHeight(520);
  SpreadsheetApp.getUi().showModalDialog(html, title);
}

function escapeHtml_(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
