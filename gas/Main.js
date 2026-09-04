/**
 * Main.js — API 入口與路由
 *
 * ══ CORS：這個專案唯一能走的路 ══════════════════════════════
 *
 * Apps Script **不支援 doOptions**，所以只要瀏覽器發出「預檢請求」，
 * 整個呼叫就會在到達我們的程式之前被擋掉。避開預檢的條件是：
 *
 *   1. Content-Type 必須是 'text/plain'（不可用 'application/json'）
 *   2. 不可以加任何自訂 header（token 要放在 body，不能放 header）
 *
 * 這是 KANTIN 設計約定第 2 條，同一個坑。改成別的寫法會直接被瀏覽器擋掉，
 * 而且錯誤訊息在主控台上長得像網路問題，完全看不出真正的原因。
 *
 * 所以：**所有 API 都用 POST，參數是一段 JSON 字串放在 body。**
 * 使用者的 email 也因此不會出現在網址裡（不會留在瀏覽器歷史與伺服器日誌）。
 */


/**
 * 路由表。新增 API 就加在這裡。
 *
 * ⚠️ 需要登入的 API **一律用 withAuth() 包起來**，不要在各支裡面
 *    各自寫一次「檢查 token」——總有一支會忘記。集中在這張表，
 *    漏掉的話一眼就看得出來。只有 SUPER 能做的加第三個參數 true。
 */
var ROUTES = {
  // ── 不需要登入 ──
  ping:          function (p) { return ok_({ pong: true, time: nowStampText_() }); },
  queryByEmail:  function (p) { return queryByEmail(p); },
  queryByDate:   function (p) { return queryByDate(p); },
  queryByFlight: function (p) { return queryByFlight(p); },
  adminLogin:    function (p) { return adminLogin(p); },
  adminLogout:   function (p) { return adminLogout(p); },
  requestPasswordReset: function (p) { return requestPasswordReset(p); },

  // ── 需要登入 ──
  getAdminProfile:     function (p) { return withAuth(p, function (s) { return getAdminProfile(p, s); }); },
  adminChangePassword: function (p) { return withAuth(p, function (s) { return adminChangePassword(p, s); }); },
  // ⚠️ 管理端列表沒有「今天以後」的限制，看得到全部歷史——所以一定要包 withAuth，
  //    這一支若漏了登入檢查，等於把整份歷史紀錄開放給任何知道網址的人
  listBookings:        function (p) { return withAuth(p, function (s) { return listBookings(p, s); }); },

  /* 寫入（v3.0）。⚠️ 兩支都是**一般管理者也能用**——使用者 2026-09-04 決定
     兩種管理者都有實際刪列的權限，所以第三個參數不能給 true。 */
  updateBooking:       function (p) { return withAuth(p, function (s) { return updateBooking(p, s); }); },
  deleteBooking:       function (p) { return withAuth(p, function (s) { return deleteBooking(p, s); }); },

  // ── 只有 SUPER ──（第三個參數 true）
  manageAdmin: function (p) { return withAuth(p, function (s) { return manageAdmin(p, s); }, true); }
};


/**
 * 瀏覽器直接打開 /exec 時會走到這裡。
 * 純粹給部署後的第一次驗證用——看得到這段 JSON 就代表部署成功。
 */
function doGet(e) {
  return ok_({
    service: SYSTEM_INFO.name,
    version: SYSTEM_INFO.version,
    time: nowStampText_(),
    note: '這個服務的 API 一律用 POST。看到這段訊息表示部署成功。'
  });
}


function doPost(e) {
  var action = '(未知)';
  try {
    var params = parseBody_(e);
    action = String(params.action || '');

    var handler = ROUTES[action];
    if (!handler) return fail_('UNKNOWN_ACTION', '不認得的動作：' + action);

    return handler(params);
  } catch (err) {
    // ⚠️ 一定要回 JSON，不能讓例外變成 Apps Script 的 HTML 錯誤頁，
    //    否則前端 JSON.parse 會炸開，訊息跟使用者遇到的事完全對不上。
    logError_('doPost', action + ' 失敗', err.message + '\n' + (err.stack || ''));
    return fail_('SERVER_ERROR', '系統出了問題，請稍後再試');
  }
}


/**
 * 把 body 解析成參數物件。
 * 前端送的是 JSON 字串，但 Content-Type 標成 text/plain（見檔頭說明），
 * 所以 Apps Script 不會自動幫我們解析，要自己來。
 */
function parseBody_(e) {
  if (e && e.postData && e.postData.contents) {
    try {
      var o = JSON.parse(e.postData.contents);
      if (o && typeof o === 'object') return o;
    } catch (err) {
      throw new Error('body 不是合法的 JSON：' + err.message);
    }
  }
  // 沒有 body 就退回用網址參數（只給手動測試用，正式呼叫一律走 body）
  return (e && e.parameter) ? e.parameter : {};
}


/* ══════════════════════════════════════════════════════════════
   本機測試用（在編輯器直接執行，不必部署也不必開瀏覽器）
   ══════════════════════════════════════════════════════════════ */

function testQueryByEmail() {
  var out = queryByEmail({ email: 'kyle.ma@pouchen.com' });
  Logger.log(out.getContent());
}

function testQueryByDate() {
  var out = queryByDate({ date: '18/09/2026' });
  Logger.log(out.getContent());
}

function testQueryByFlight() {
  var out = queryByFlight({ flight: 'CI761' });
  Logger.log(out.getContent());
}
