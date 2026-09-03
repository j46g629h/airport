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
      .addToUi();
  } catch (err) {
    Logger.log('建立選單失敗：' + err.message);
  }

  try {
    gotoThisWeek();
  } catch (err) {
    Logger.log('自動跳到本週失敗：' + err.message);
  }
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
