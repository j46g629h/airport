/**
 * Auth.js — 管理者登入與權限驗證
 *
 * 這個檔案負責五件事：
 *   1. 密碼雜湊（加鹽 SHA-256 迭代 1000 次，明文密碼絕不落地）
 *   2. 登入：驗密碼 → 發 token
 *   3. 登入失敗鎖定（5 次 / 15 分鐘）
 *   4. 忘記密碼（寄臨時密碼到登記的信箱）
 *   5. 每支管理端 API 的 token 驗證（withAuth）
 *
 * ⚠️ 所有驗證都必須在後端。前端原始碼在公開的 GitHub 上，
 *    任何寫在前端的判斷都等同沒有判斷。
 */


/* ══════════════════════════════════════════════════════════════
   密碼雜湊
   ══════════════════════════════════════════════════════════════ */

/**
 * 產生隨機鹽值。
 *
 * 每個帳號的鹽值都不同，所以就算兩個人用一樣的密碼，
 * Sheet 上存的雜湊也完全不同——攻擊者無法一次破解一整批。
 *
 * 用 UUID 當亂數來源：Apps Script 沒有 crypto.getRandomValues，
 * 而 Utilities.getUuid() 是密碼學等級的隨機值，比 Math.random() 可靠。
 */
function generateSalt_() {
  var hex = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  return hex.substring(0, AUTH.SALT_LENGTH);
}

/**
 * SHA-256( 鹽值 + 密碼 ) 迭代 1000 次。
 *
 * 為什麼要迭代：單次 SHA-256 快到攻擊者一秒能試上億組。
 * 迭代 1000 次讓每次驗證多花數十毫秒（使用者無感），
 * 暴力破解的成本卻變成 1000 倍。
 */
function hashPassword_(password, salt) {
  var bytes = Utilities.newBlob(str_(salt) + String(password)).getBytes();
  for (var i = 0; i < AUTH.HASH_ITERATIONS; i++) {
    bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes);
  }
  return bytesToHex_(bytes);
}

/** 位元組陣列 → 十六進位字串（Apps Script 的位元組是有號的，要先轉回 0~255） */
function bytesToHex_(bytes) {
  return bytes.map(function (b) {
    return ('0' + (b & 0xFF).toString(16)).slice(-2);
  }).join('');
}

/**
 * 密碼規則：只要求 8 碼。
 *
 * 使用者刻意決定不要求大小寫與符號——規則太嚴會逼人把密碼
 * 寫在便條紙上貼螢幕，那比弱密碼更糟。
 */
function validatePasswordRule_(password) {
  var pw = String(password || '');
  if (pw.length < AUTH.MIN_PASSWORD_LENGTH) return 'PASSWORD_TOO_SHORT';
  return '';
}

/** 產生一組好唸好打的臨時密碼（去掉 0/O、1/l 這種看不出差別的字元） */
function generateTempPassword_() {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var uuid = Utilities.getUuid().replace(/-/g, '');
  var out = '';
  for (var i = 0; i < AUTH.TEMP_PASSWORD_LENGTH; i++) {
    out += chars.charAt(parseInt(uuid.charAt(i), 16) % chars.length);
  }
  // 保證至少有一個數字（有些人的輸入法在純字母時會自動大寫，容易打錯）
  return out.substring(0, out.length - 1) + String(2 + (new Date().getTime() % 8));
}


/* ══════════════════════════════════════════════════════════════
   登入
   ══════════════════════════════════════════════════════════════ */

/**
 * POST { action:'adminLogin', account, password }
 *
 * ── 臨時密碼是怎麼運作的（這是這支最重要的設計）──────────
 *
 * 「忘記密碼」寄出的臨時密碼是**額外一組**，存在 Store 裡（30 分鐘有效），
 * **不會動到帳號現有的密碼**。只有在有人真的拿臨時密碼登入成功的那一刻，
 * 才把帳號密碼換成它並要求立刻改掉。
 *
 * 為什麼要這樣繞：如果「按下忘記密碼」就直接重設密碼，
 * 那任何知道你帳號的人（登入頁在公開網址上）都能不斷按那個按鈕，
 * 讓你的密碼一直失效——他進不來，但你也進不來。
 * 現在他按再多次也只是寄信給你，你原本的密碼一直有效。
 */
function adminLogin(params) {
  // 帳號一律轉小寫、密碼去頭尾空白——
  // 手機輸入法很容易在後面多帶一個空格，而使用者完全看不出來
  var account = str_(params.account).toLowerCase();
  var password = String(params.password || '').trim();

  if (!account || !password) return fail_('LOGIN_REQUIRED');

  // ── 1. 先看有沒有被鎖 ──
  var lockedFor = getLockRemainingMinutes_(account);
  if (lockedFor > 0) return fail_('LOGIN_LOCKED', String(lockedFor));

  // ── 2. 比對密碼 ──
  var admin = findAdminByAccount_(account);

  // ⚠️ 帳號不存在時也走一次雜湊運算，讓「帳號不存在」與「密碼錯誤」的
  //    回應時間差不多。不然有人可以用回應快慢反推出哪些帳號是存在的。
  var salt = admin ? admin.password_salt : 'no-such-account';
  var hash = hashPassword_(password, salt);

  var matched = !!(admin && hash === str_(admin.password_hash));
  var usedTemp = false;

  if (!matched && admin) {
    // 臨時密碼用的是同一組鹽值，所以上面算好的 hash 可以直接比，不必再算一次
    var tempHash = storeGet(STORE_KEYS.TEMP_PW + account);
    if (tempHash && tempHash === hash) { matched = true; usedTemp = true; }
  }

  if (!matched) {
    var left = recordLoginFailure_(account);
    // ⚠️ 刻意不說是帳號錯還是密碼錯
    return fail_('LOGIN_FAILED', String(left));
  }

  // ── 3. 密碼對了，再看帳號有沒有被停用 ──
  if (str_(admin.status).toUpperCase() !== ADMIN_STATUS.ACTIVE) {
    return fail_('ACCOUNT_DISABLED');
  }

  // ── 4. 用臨時密碼進來的，現在才真的套用重設 ──
  if (usedTemp) {
    setAdminPassword_(admin.row, password, true);      // true = 強制改密碼
    storeRemove(STORE_KEYS.TEMP_PW + account);
    logInfo_('adminLogin', '使用臨時密碼登入，已套用重設', account);
  }

  // ── 5. 發 token ──
  clearLoginFailures_(account);
  touchLastLogin_(admin.row);

  var session = {
    account: str_(admin.account).toLowerCase(),
    name: str_(admin.name),
    role: normalizeRole_(admin.role),
    must_change_password: usedTemp || isTrue_(admin.must_change)
  };
  var token = createSession_(session);

  return ok_({
    token: token,
    account: session.account,
    name: session.name,
    role: session.role,
    is_super: session.role === ADMIN_ROLES.SUPER,
    must_change_password: session.must_change_password
  });
}


/** POST { action:'adminLogout', token } */
function adminLogout(params) {
  var token = str_(params.token);
  // Properties 存的 token 是真的刪得掉的，所以這是真正的伺服器端登出
  if (token) storeRemove(STORE_KEYS.TOKEN + token);
  return ok_({ logged_out: true });
}


/**
 * POST { action:'getAdminProfile', token }
 * 前端重新整理後用它確認 token 還有效，並取回姓名與角色。
 */
function getAdminProfile(params, session) {
  return ok_({
    account: session.account,
    name: session.name,
    role: session.role,
    is_super: session.role === ADMIN_ROLES.SUPER,
    must_change_password: session.must_change_password
  });
}


/**
 * POST { action:'adminChangePassword', token, old_password, new_password }
 *
 * 第一次登入被強制改密碼時走的也是這一支：舊密碼就是那組初始（或臨時）密碼。
 */
function adminChangePassword(params, session) {
  var oldPassword = String(params.old_password || '').trim();
  var newPassword = String(params.new_password || '').trim();

  if (!oldPassword || !newPassword) return fail_('PASSWORD_REQUIRED');

  var ruleError = validatePasswordRule_(newPassword);
  if (ruleError) return fail_(ruleError, String(AUTH.MIN_PASSWORD_LENGTH));

  if (newPassword === oldPassword) return fail_('PASSWORD_SAME');

  // ⚠️ 重新從 Sheet 讀一次，不信任 session 裡的快照——
  //    帳號可能在登入之後被停用或被重設密碼
  var admin = findAdminByAccount_(session.account);
  if (!admin) return fail_('ACCOUNT_NOT_FOUND');

  if (hashPassword_(oldPassword, admin.password_salt) !== str_(admin.password_hash)) {
    return fail_('OLD_PASSWORD_WRONG');
  }

  setAdminPassword_(admin.row, newPassword, false);

  // 更新 session，前端才不會一直被導回改密碼頁
  session.must_change_password = false;
  refreshSession_(str_(params.token), session);
  updateSessionsForAccount_(session.account, { must_change_password: false });

  return ok_({ changed: true });
}


/* ══════════════════════════════════════════════════════════════
   忘記密碼
   ══════════════════════════════════════════════════════════════ */

/**
 * POST { action:'requestPasswordReset', account }
 *
 * 寄一組臨時密碼到**名單上登記的信箱**。
 *
 * ⚠️ 三件事不可以改：
 *
 * 1. **收件人只能是名單上的 email_notif 或 account**，絕不接受呼叫端指定。
 *    可以指定的話，任何人都能把你的臨時密碼寄到自己的信箱。
 *
 * 2. **帳號不存在時也要回成功。** 回「查無此帳號」等於做了一個
 *    帳號存在與否的查詢器，攻擊者可以拿它把整份管理者名單掃出來。
 *
 * 3. **要限流**（同一帳號 10 分鐘一次）。不然這支自己會變成
 *    灌爆別人信箱的工具。
 */
function requestPasswordReset(params) {
  var account = str_(params.account).toLowerCase();
  if (!account) return fail_('LOGIN_REQUIRED');

  // 不論結果如何都回這個，避免洩漏帳號是否存在（規則 2）
  var pretendOk = ok_({ sent: true });

  var coolKey = STORE_KEYS.RESET_COOL + account;
  if (storeGet(coolKey)) return pretendOk;              // 還在冷卻中（規則 3）

  var admin = findAdminByAccount_(account);
  if (!admin) return pretendOk;
  if (str_(admin.status).toUpperCase() !== ADMIN_STATUS.ACTIVE) return pretendOk;

  var temp = generateTempPassword_();
  // 用該帳號現有的鹽值算雜湊，登入時就能跟一般密碼共用同一次運算
  storePut(STORE_KEYS.TEMP_PW + account,
           hashPassword_(temp, admin.password_salt),
           AUTH.TEMP_PASSWORD_TTL);
  storePut(coolKey, '1', AUTH.RESET_COOLDOWN_SECONDS);

  var to = str_(admin.email_notif) || str_(admin.account);
  var minutes = Math.round(AUTH.TEMP_PASSWORD_TTL / 60);

  /* ⚠️ 第二道防線（v2.5）。
   *
   * 帳號自 v2.5 起不必是 email，收件人就可能是 `ga2` 這種寄不出去的字串。
   * 建立帳號時已經擋過一次（gas/Admins.js 的 EMAIL_NOTIF_REQUIRED），
   * 但**超管可以直接在 Sheet 上把通知信箱清掉**，那道防線就繞過去了。
   *
   * 這裡先檢查再寄，是為了讓日誌說得出**真正的原因**。
   * 不檢查的話下面的 catch 只會記到 MailApp 的例外訊息
   * （「Invalid email」之類），看不出是「這個帳號根本沒有可寄的地址」。
   * 階段 4 的每日系統信會把 LOG 送到管理者眼前，訊息說得越準越有用。
   */
  if (!looksLikeEmail_(to)) {
    logError_('requestPasswordReset', '沒有可寄送的信箱',
              account + '：帳號不是 email，而 ADMIN 分頁的 email_notif 是空的。' +
              '請在 ADMIN 分頁補上通知信箱，或改用 emergencyResetSuper()。');
    return pretendOk;
  }

  try {
    MailApp.sendEmail(to,
      '[' + SYSTEM_INFO.name + '] 臨時密碼 / Kata sandi sementara',
      [
        str_(admin.name) + ' 你好，',
        '',
        '有人在 ' + SYSTEM_INFO.name + ' 按了「忘記密碼」。',
        '',
        '    帳號：' + admin.account,
        '    臨時密碼：' + temp,
        '',
        '這組臨時密碼 ' + minutes + ' 分鐘內有效，登入後系統會要求你立刻設定新密碼。',
        '⚠️ 在你真的用它登入之前，你原本的密碼仍然有效。',
        '',
        '如果不是你本人操作，可以直接忽略這封信——你的密碼沒有被改動。',
        '',
        '── 以下為印尼文 ──',
        '',
        'Ada yang menekan "Lupa kata sandi" di sistem ' + SYSTEM_INFO.name + '.',
        '',
        '    Akun: ' + admin.account,
        '    Kata sandi sementara: ' + temp,
        '',
        'Berlaku ' + minutes + ' menit. Setelah login, Anda wajib membuat kata sandi baru.',
        'Kata sandi lama Anda masih berlaku sampai Anda benar-benar login dengan yang sementara ini.',
        '',
        'Jika bukan Anda, abaikan email ini — kata sandi Anda tidak berubah.',
        '',
        '（此信由系統自動發出，請勿回覆）'
      ].join('\n'));

    logInfo_('requestPasswordReset', '已寄出臨時密碼', account);
  } catch (e) {
    // ⚠️ 寄信失敗要記錄下來，但**回給前端的還是成功**（規則 2）。
    //    寄不出去時使用者會以為沒收到信而再按一次，10 分鐘後又會試一次。
    //    真的一直寄不出去，就用 emergencyResetSuper() 從編輯器救。
    logError_('requestPasswordReset', '寄信失敗', account + '：' + e.message);
  }

  return pretendOk;
}


/* ══════════════════════════════════════════════════════════════
   token（session）
   ══════════════════════════════════════════════════════════════ */

function createSession_(session) {
  storeSweepExpired();                 // 登入不頻繁，順手清掉過期的資料
  var token = Utilities.getUuid();
  refreshSession_(token, session);
  return token;
}

function refreshSession_(token, session) {
  if (!token) return;
  storePut(STORE_KEYS.TOKEN + token, JSON.stringify(session), AUTH.TOKEN_TTL);
}

function readSession_(token) {
  if (!token) return null;
  var raw = storeGet(STORE_KEYS.TOKEN + token);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}


/**
 * 保護管理端 API 的共用外殼。
 *
 * 用法（在 Main.js 的路由表裡）：
 *   updateBooking: function (p) { return withAuth(p, function (s) { return updateBooking(p, s); }); }
 *   只有 SUPER 能做的加第三個參數 true。
 *
 * ⚠️ 需要登入的 API 不要各自寫一次「檢查 token」——總有一支會忘記。
 *    在路由表統一包起來，漏掉的話一眼就看得出來。
 */
function withAuth(params, handler, requireSuper) {
  var session = readSession_(str_(params.token));
  if (!session) return fail_('UNAUTHORIZED');
  if (requireSuper && session.role !== ADMIN_ROLES.SUPER) return fail_('FORBIDDEN');
  return handler(session);
}


/**
 * 把某個帳號手上所有 token 的內容更新掉（例如改完密碼後清掉「須改密碼」旗標）。
 */
function updateSessionsForAccount_(account, patch) {
  var target = str_(account).toLowerCase();
  storeEntries(STORE_KEYS.TOKEN).forEach(function (entry) {
    try {
      var s = JSON.parse(entry.value);
      if (!s || str_(s.account).toLowerCase() !== target) return;
      Object.keys(patch).forEach(function (k) { s[k] = patch[k]; });
      storePut(entry.key, JSON.stringify(s), AUTH.TOKEN_TTL);
    } catch (e) { /* 壞掉的項目略過 */ }
  });
}


/**
 * 把某個帳號手上的所有 token 作廢。
 *
 * ⚠️ 停用帳號 / 改角色 / 重設密碼三個動作**都必須呼叫它**。
 *    withAuth() 只讀 token 裡的 session 快照，不會回頭查 Sheet——
 *    所以把某人停用之後，他手上那支 token 在效期內（6 小時）照樣能改資料，
 *    「停用」等於沒有生效。
 *
 * ⚠️ 這件事做得到，正是因為 token 存在 PropertiesService 而不是 CacheService
 *    （見 Store.js）——存進去的東西是真的列得出來、刪得掉的。
 *
 * 為什麼不改成「每次請求都回查 Sheet」：那樣每支 API 都要多讀一次管理者名單，
 * Apps Script 本來就慢，不值得為了一年用不到幾次的情況天天付這個成本。
 */
function revokeSessionsForAccount_(account) {
  var target = str_(account).toLowerCase();
  var n = 0;
  storeEntries(STORE_KEYS.TOKEN).forEach(function (entry) {
    try {
      var s = JSON.parse(entry.value);
      if (s && str_(s.account).toLowerCase() === target) {
        storeRemove(entry.key);
        n++;
      }
    } catch (e) { /* 壞掉的項目略過 */ }
  });
  return n;
}


/* ══════════════════════════════════════════════════════════════
   登入失敗鎖定

   ⚠️ 唯一的狀態來源是 Store，不是 Sheet。
      ADMIN 分頁上有 failed_count / locked_until 兩欄，
      但程式**不讀也不寫**——兩份資料一定會對不起來，
      而「兩份誰對」是最難查的一種 bug。
   ══════════════════════════════════════════════════════════════ */

/** 記一次失敗，回傳還剩幾次機會。到達上限就開始計算鎖定時間。 */
function recordLoginFailure_(account) {
  var key = STORE_KEYS.LOGIN_FAIL + account;
  var state = readFailState_(key);
  state.count += 1;

  if (state.count >= AUTH.MAX_LOGIN_FAILS) {
    state.locked_until = new Date().getTime() + AUTH.LOCKOUT_SECONDS * 1000;
  }
  storePut(key, JSON.stringify(state), AUTH.LOCKOUT_SECONDS);
  return Math.max(0, AUTH.MAX_LOGIN_FAILS - state.count);
}

function clearLoginFailures_(account) {
  storeRemove(STORE_KEYS.LOGIN_FAIL + str_(account).toLowerCase());
}

/** 還要鎖幾分鐘（沒被鎖就回 0） */
function getLockRemainingMinutes_(account) {
  var state = readFailState_(STORE_KEYS.LOGIN_FAIL + account);
  var left = (state.locked_until || 0) - new Date().getTime();
  return left > 0 ? Math.ceil(left / 60000) : 0;
}

function readFailState_(key) {
  try {
    var raw = storeGet(key);
    if (raw) {
      var parsed = JSON.parse(raw);
      if (parsed && typeof parsed.count === 'number') return parsed;
    }
  } catch (e) { /* 壞掉就重來 */ }
  return { count: 0, locked_until: 0 };
}


/* ══════════════════════════════════════════════════════════════
   管理者名單存取
   ══════════════════════════════════════════════════════════════ */

/** 依帳號找管理者。名單只有個位數，整張讀進來比對就夠快。 */
function findAdminByAccount_(account) {
  var target = str_(account).toLowerCase();
  if (!target) return null;
  var admins = readAllAdmins_();
  for (var i = 0; i < admins.length; i++) {
    if (str_(admins[i].account).toLowerCase() === target) return admins[i];
  }
  return null;
}

/**
 * 讀出管理者名單的所有資料列（含 row 列號）。
 *
 * ⚠️ 回傳的物件裡有 password_hash 與 password_salt。
 *    要傳給前端之前一定要先過 toSafeAdmin_()（見 Admins.js）——
 *    直接回傳等於把整份密碼資料送到瀏覽器上。
 */
function readAllAdmins_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.ADMIN);
  if (!sheet || sheet.getLastRow() < FIRST_DATA_ROW) return [];

  var map = buildColumnMap_(sheet, ADMIN_COLUMNS);
  var width = sheet.getLastColumn();
  var values = sheet.getRange(FIRST_DATA_ROW, 1, sheet.getLastRow() - 1, width).getValues();

  var out = [];
  values.forEach(function (row, i) {
    if (!str_(map.account ? row[map.account - 1] : '')) return;      // 空白列略過
    var o = { row: FIRST_DATA_ROW + i };
    ADMIN_COLUMNS.forEach(function (col) {
      var c = map[col.code];
      o[col.code] = c ? str_(row[c - 1]) : '';                       // optional 欄位可能不存在
    });
    out.push(o);
  });
  return out;
}


/**
 * 寫入新密碼。
 *
 * ⚠️ 一律「先設純文字格式，再寫值」。直接 setValue 的話，
 *    64 位十六進位的雜湊若剛好整串是數字會被 Sheet 判斷成科學記號，
 *    那個帳號從此永遠登不進去（KANTIN 設計約定第 11 條）。
 */
function setAdminPassword_(row, plainPassword, mustChange) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.ADMIN);
  var map = buildColumnMap_(sheet, ADMIN_COLUMNS);
  var salt = generateSalt_();

  setTextCell_(sheet, row, map.password_salt, salt);
  setTextCell_(sheet, row, map.password_hash, hashPassword_(plainPassword, salt));
  setTextCell_(sheet, row, map.must_change, mustChange ? 'TRUE' : 'FALSE');
  if (map.pwd_changed_at) setTextCell_(sheet, row, map.pwd_changed_at, nowStampText_());
}

function touchLastLogin_(row) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.ADMIN);
  var map = buildColumnMap_(sheet, ADMIN_COLUMNS);
  if (map.last_login_at) setTextCell_(sheet, row, map.last_login_at, nowStampText_());
}

/** 先設格式再寫值 */
function setTextCell_(sheet, row, col, value) {
  if (!col) return;                    // optional 欄位不存在時直接跳過
  sheet.getRange(row, col).setNumberFormat('@').setValue(String(value));
}

function normalizeRole_(role) {
  return str_(role).toUpperCase() === ADMIN_ROLES.SUPER ? ADMIN_ROLES.SUPER : ADMIN_ROLES.ADMIN;
}
