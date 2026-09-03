/**
 * Admins.js — 帳號管理（只有 SUPER 能用）
 *
 * 一支對外的 API：manageAdmin，用 op 分派。
 * 路由表已經用 withAuth(p, handler, true) 包起來，所以進到這裡的
 * 一定是通過驗證的 SUPER——各支 op 不必再檢查一次。
 *
 * ── 三條安全規則（guardLastActiveSuper_）────────────────────
 *
 * 前端會把對應的按鈕變灰並附上原因，但**真正的把關在這裡**。
 * 前端的判斷只是體驗，任何人都能繞過它直接打 API。
 *
 *   1. 不能停用 / 降級自己          手滑就把自己關在門外
 *   2. 不能停用 / 降級最後一位 SUPER 系統會變成沒有人進得去帳號管理頁，
 *                                   只能回 Apps Script 執行 emergencyResetSuper() 手動救
 *   3. 不能重設自己的密碼            等於把自己的密碼換成一組隨機字串然後被登出，
 *                                   沒有任何好處。要改自己的密碼走「變更密碼」
 *
 * ── 為什麼沒有「查看某人目前的密碼」這個功能 ────────────────
 *
 * **做不到，而且不該做。** Sheet 上存的是加鹽 SHA-256 迭代 1000 次的結果，
 * 這個運算單向不可逆——不是系統不給看，是連系統自己都算不回去。
 * 要能顯示，唯一辦法是改存明文，那代價是任何拿到這份 Sheet 的人
 * （帳號被盜、誤設分享、Google 端備份）就直接拿到全部管理者的密碼。
 *
 * 能給的替代資訊：
 *   「我剛剛的重設有沒有生效」→ 密碼最後變更時間
 *   「這個人還在用別人幫他設的密碼嗎」→ 待本人自行設定密碼
 */

function manageAdmin(params, session) {
  var op = str_(params.op);
  switch (op) {
    case 'list':          return adminOpList_(params, session);
    case 'create':        return adminOpCreate_(params, session);
    case 'setStatus':     return adminOpSetStatus_(params, session);
    case 'setRole':       return adminOpSetRole_(params, session);
    case 'resetPassword': return adminOpResetPassword_(params, session);
    case 'unlock':        return adminOpUnlock_(params, session);
    case 'remove':        return adminOpRemove_(params, session);
    default:              return fail_('UNKNOWN_OP', op);
  }
}


/* ══════════════════════════════════════════════════════════════
   讀取
   ══════════════════════════════════════════════════════════════ */

function adminOpList_(params, session) {
  var items = readAllAdmins_().map(function (a) { return toSafeAdmin_(a, session); });
  return ok_({ items: items, total: items.length, me: session.account });
}

/**
 * ⚠️ 白名單寫法，不是「刪掉幾個欄位」。
 *
 * readAllAdmins_() 讀的是整列，裡面有 password_hash 與 password_salt——
 * 直接回傳等於把整份密碼資料送到瀏覽器上。
 * 用白名單的話，日後 ADMIN_COLUMNS 加了新欄位也不會不小心跟著漏出去。
 */
function toSafeAdmin_(a, session) {
  var account = str_(a.account).toLowerCase();
  var role = normalizeRole_(a.role);
  var active = str_(a.status).toUpperCase() === ADMIN_STATUS.ACTIVE;

  return {
    account: account,
    name: str_(a.name),
    role: role,
    active: active,
    email_notif: str_(a.email_notif),
    // 「待本人自行設定密碼」＝ 這組密碼是別人設的，他還沒換成只有自己知道的。
    // ⚠️ 超級管理者剛幫他重設完就會是 true，那不是 bug。
    must_change_password: isTrue_(a.must_change),
    password_changed_at: str_(a.pwd_changed_at),
    last_login_at: str_(a.last_login_at),
    locked_minutes: getLockRemainingMinutes_(account),
    is_me: account === str_(session.account).toLowerCase()
  };
}


/* ══════════════════════════════════════════════════════════════
   新增
   ══════════════════════════════════════════════════════════════ */

function adminOpCreate_(params, session) {
  var account = str_(params.account).toLowerCase();
  var name = str_(params.name);
  var role = normalizeRole_(params.role);
  var emailNotif = str_(params.email_notif).toLowerCase();

  if (!account || !name) return fail_('FIELD_REQUIRED');
  if (!looksLikeEmail_(account)) return fail_('ACCOUNT_NOT_EMAIL');
  if (emailNotif && !looksLikeEmail_(emailNotif)) return fail_('EMAIL_NOT_VALID');
  if (findAdminByAccount_(account)) return fail_('ACCOUNT_EXISTS');

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return fail_('BUSY');
  try {
    // 搶到鎖之後再確認一次——兩個人同時新增同一個帳號時，
    // 上面那次檢查可能都還沒看到對方寫進去的那一列
    if (findAdminByAccount_(account)) return fail_('ACCOUNT_EXISTS');

    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.ADMIN);
    var map = buildColumnMap_(sheet, ADMIN_COLUMNS);
    var row = Math.max(sheet.getLastRow() + 1, FIRST_DATA_ROW);
    var password = generateTempPassword_();

    setTextCell_(sheet, row, map.account, account);
    setTextCell_(sheet, row, map.name, name);
    setTextCell_(sheet, row, map.role, role);
    setTextCell_(sheet, row, map.status, ADMIN_STATUS.ACTIVE);
    if (map.email_notif) setTextCell_(sheet, row, map.email_notif, emailNotif);
    setAdminPassword_(row, password, true);         // 第一次登入強制改

    logInfo_('manageAdmin', '新增帳號', session.account + ' → ' + account + '（' + role + '）');

    // ⚠️ 密碼只在這一次回傳，之後任何 API 都拿不回來（雜湊不可逆）。
    //    前端要明確告訴使用者「只會出現這一次」。
    return ok_({ account: account, name: name, role: role, initial_password: password });
  } finally {
    lock.releaseLock();
  }
}


/* ══════════════════════════════════════════════════════════════
   修改
   ══════════════════════════════════════════════════════════════ */

function adminOpSetStatus_(params, session) {
  var target = requireTarget_(params);
  if (target.error) return target.error;
  var active = isTrue_(params.active);

  if (!active) {
    var guard = guardLastActiveSuper_(target.admin, session, 'disable');
    if (guard) return guard;
  }

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.ADMIN);
  var map = buildColumnMap_(sheet, ADMIN_COLUMNS);
  setTextCell_(sheet, target.admin.row, map.status,
               active ? ADMIN_STATUS.ACTIVE : ADMIN_STATUS.DISABLED);

  // ⚠️ 停用之後一定要作廢他手上的 token（見 Auth.js 的說明）。
  //    withAuth() 只讀 token 裡的 session 快照，不會回頭查 Sheet——
  //    少了這一行，他那支 token 在效期內（6 小時）照樣能改資料，
  //    「停用」等於沒有生效。
  var revoked = active ? 0 : revokeSessionsForAccount_(target.admin.account);
  if (!active) clearLoginFailures_(target.admin.account);   // 停用的人不必留著鎖定紀錄

  logInfo_('manageAdmin', active ? '啟用帳號' : '停用帳號',
           session.account + ' → ' + target.admin.account);
  return ok_({ account: target.admin.account, active: active, revoked: revoked });
}


function adminOpSetRole_(params, session) {
  var target = requireTarget_(params);
  if (target.error) return target.error;
  var role = normalizeRole_(params.role);

  if (role !== ADMIN_ROLES.SUPER) {
    var guard = guardLastActiveSuper_(target.admin, session, 'demote');
    if (guard) return guard;
  }

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.ADMIN);
  var map = buildColumnMap_(sheet, ADMIN_COLUMNS);
  setTextCell_(sheet, target.admin.row, map.role, role);

  // 改角色也要作廢——他那個分頁裡的角色還是舊的
  var revoked = revokeSessionsForAccount_(target.admin.account);

  logInfo_('manageAdmin', '變更角色', session.account + ' → ' + target.admin.account + '：' + role);
  return ok_({ account: target.admin.account, role: role, revoked: revoked });
}


function adminOpResetPassword_(params, session) {
  var target = requireTarget_(params);
  if (target.error) return target.error;

  // 規則 3：不能重設自己的
  if (isSelf_(target.admin, session)) return fail_('CANNOT_RESET_SELF');

  var password = generateTempPassword_();
  setAdminPassword_(target.admin.row, password, true);
  clearLoginFailures_(target.admin.account);
  storeRemove(STORE_KEYS.TEMP_PW + str_(target.admin.account).toLowerCase());
  var revoked = revokeSessionsForAccount_(target.admin.account);

  logInfo_('manageAdmin', '重設密碼', session.account + ' → ' + target.admin.account);
  return ok_({ account: target.admin.account, initial_password: password, revoked: revoked });
}


/** 解除登入失敗鎖定。狀態只存在 Store，所以清掉那一筆就好。 */
function adminOpUnlock_(params, session) {
  var target = requireTarget_(params);
  if (target.error) return target.error;

  clearLoginFailures_(target.admin.account);
  logInfo_('manageAdmin', '解除鎖定', session.account + ' → ' + target.admin.account);
  return ok_({ account: target.admin.account, unlocked: true });
}


/**
 * 真的刪掉那一列。
 *
 * ⚠️ 刪之前先把整列內容寫進 LOG。這種功能出錯的樣子不是跳錯誤訊息，
 *    是安靜地少了一筆而且沒有人知道——那一筆 LOG 就是唯一的還原依據。
 *
 * 用途是「建錯了、重複建」。人離職請用「停用」，
 * 停用的帳號留著才查得到歷史操作是誰做的。
 */
function adminOpRemove_(params, session) {
  var target = requireTarget_(params);
  if (target.error) return target.error;

  var guard = guardLastActiveSuper_(target.admin, session, 'disable');
  if (guard) return guard;

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.ADMIN);
  var map = buildColumnMap_(sheet, ADMIN_COLUMNS);

  // 先記錄，再刪除。⚠️ 順序不可顛倒——刪完才記，中途失敗就什麼都沒留下。
  //    密碼雜湊與鹽值刻意不寫進 LOG（LOG 分頁比 ADMIN 分頁容易被看到）
  logInfo_('manageAdmin', '刪除帳號',
           session.account + ' 刪除了：' +
           [str_(target.admin.account), str_(target.admin.name),
            normalizeRole_(target.admin.role), str_(target.admin.status),
            str_(target.admin.email_notif)].join(' | '));

  revokeSessionsForAccount_(target.admin.account);
  clearLoginFailures_(target.admin.account);
  sheet.deleteRow(target.admin.row);

  return ok_({ account: target.admin.account, removed: true });
}


/* ══════════════════════════════════════════════════════════════
   共用
   ══════════════════════════════════════════════════════════════ */

function requireTarget_(params) {
  var account = str_(params.account).toLowerCase();
  if (!account) return { error: fail_('FIELD_REQUIRED') };
  var admin = findAdminByAccount_(account);
  if (!admin) return { error: fail_('ACCOUNT_NOT_FOUND') };
  return { admin: admin };
}

function isSelf_(admin, session) {
  return str_(admin.account).toLowerCase() === str_(session.account).toLowerCase();
}

/**
 * 規則 1 與 2。
 * @param {string} what 'disable'（停用／刪除）或 'demote'（降級）
 */
function guardLastActiveSuper_(admin, session, what) {
  if (isSelf_(admin, session)) {
    return fail_(what === 'demote' ? 'CANNOT_DEMOTE_SELF' : 'CANNOT_DISABLE_SELF');
  }
  var isSuper = normalizeRole_(admin.role) === ADMIN_ROLES.SUPER;
  var isActive = str_(admin.status).toUpperCase() === ADMIN_STATUS.ACTIVE;
  if (isSuper && isActive && countActiveSupers_() <= 1) {
    return fail_('LAST_SUPER');
  }
  return null;
}

function countActiveSupers_() {
  return readAllAdmins_().filter(function (a) {
    return normalizeRole_(a.role) === ADMIN_ROLES.SUPER &&
           str_(a.status).toUpperCase() === ADMIN_STATUS.ACTIVE;
  }).length;
}

function looksLikeEmail_(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str_(s));
}
