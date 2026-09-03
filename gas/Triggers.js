/**
 * Triggers.js — 排程的安裝與移除
 *
 * ⚠️ 新增排程之後**一定要重跑 installTriggers()**。
 *    clasp push 只是把程式碼推上去，Google 那邊的鬧鐘不會自己出現——
 *    新排程就這樣安靜地不存在，而且沒有任何錯誤訊息會告訴你。
 *
 * installTriggers() 會先清光再重裝，所以重複執行是安全的。
 * 裝完用 listTriggers() 確認數量對得上。
 *
 * ⚠️ 排程是跟著「安裝的人」跑的，不是跟著電腦。
 *    換電腦不用重裝；但換人安裝的話，舊的那組要先移除。
 */

/** 這個專案要裝哪些排程。新增時加在這裡，然後重跑 installTriggers()。 */
var TRIGGER_PLAN = [
  { fn: 'rebuildIndexIfDirty', every: 'minutes', n: 5,
    why: '有人改過才重建 _INDEX。沒改過就 0.1 秒結束——無條件重建會超出每日配額' },
  { fn: 'markPastAsDone', every: 'hours', n: 1,
    why: '把時間已經過去的「已排定」改成「已完成」，讓 Sheet 上的值跟使用者畫面一致' },
  { fn: 'ensureUpcomingWeekSheets', every: 'days', n: 1, hour: 3,
    why: '建好本週與未來三週的分頁，讓人永遠不必手動建立（手動建的沒有標記，程式認不得）' }
];


function installTriggers() {
  removeTriggers();

  TRIGGER_PLAN.forEach(function (t) {
    var b = ScriptApp.newTrigger(t.fn).timeBased();
    if (t.every === 'minutes')      b.everyMinutes(t.n);
    else if (t.every === 'hours')   b.everyHours(t.n);
    else if (t.every === 'days')    b.everyDays(t.n).atHour(t.hour || 2);
    else throw new Error('不認得的排程週期：' + t.every);
    b.create();
  });

  var msg = '已安裝 ' + TRIGGER_PLAN.length + ' 個排程：\n  ' +
            TRIGGER_PLAN.map(function (t) {
              return t.fn + '（每 ' + t.n + ' ' + t.every + '）— ' + t.why;
            }).join('\n  ');
  Logger.log(msg);
  logInfo_('installTriggers', '排程重新安裝', msg);
  return msg;
}


function removeTriggers() {
  var all = ScriptApp.getProjectTriggers();
  all.forEach(function (t) { ScriptApp.deleteTrigger(t); });
  Logger.log('已移除 ' + all.length + ' 個舊排程');
  return all.length;
}


function listTriggers() {
  var all = ScriptApp.getProjectTriggers();
  var L = ['目前有 ' + all.length + ' 個排程：'];
  all.forEach(function (t) {
    L.push('  ' + t.getHandlerFunction() + '　' + t.getEventType());
  });
  if (all.length !== TRIGGER_PLAN.length) {
    L.push('');
    L.push('⚠ 應該要有 ' + TRIGGER_PLAN.length + ' 個。數量對不上，請執行 installTriggers()');
  }
  Logger.log(L.join('\n'));
  return L.join('\n');
}
