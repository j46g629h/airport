/**
 * Store.js — 附有效期的鍵值儲存
 *
 * ⚠️ 為什麼不用 CacheService（這是 KANTIN 踩過的坑，直接沿用結論）：
 *
 * 在這個環境上 `CacheService` **完全沒有作用**——
 * `put()` 不會丟出任何錯誤，但 `get()` 永遠回傳 null，
 * 連同一次請求內寫完立刻讀都讀不到。
 *
 * 結果是：登入會成功並發出 token，但下一個請求讀不到那個 token，
 * 變成「輸入密碼後又跳回登入畫面」。而且因為 put 不報錯，
 * 錯誤日誌裡一片空白，完全沒有線索。
 *
 * `PropertiesService` 在同一個環境下完全正常，所以改用它。
 * 它沒有內建有效期，這個檔案就是補上那一層。
 *
 * 順帶一個好處：token 存在 Properties 是**真的刪得掉的**，
 * 所以「登出」和「停用帳號時作廢他手上的 token」才做得到——
 * 這兩件事在 CacheService 上是辦不到的。
 *
 * ⚠️ 這裡的資料格式是 {v: 值, e: 到期毫秒}。
 *    Index.js 用同一個 PropertiesService 存了兩個**不是這個格式**的值
 *    （indexDirty、indexBuiltAt）。下面每一支都會跳過格式不符的項目，
 *    所以兩者共存是安全的——改這個檔案時不要拿掉那些檢查。
 */


/**
 * @param {string} key
 * @param {string} value      值必須是字串。物件請自己先 JSON.stringify
 * @param {number} ttlSeconds 幾秒後過期
 */
function storePut(key, value, ttlSeconds) {
  PropertiesService.getScriptProperties().setProperty(key, JSON.stringify({
    v: value,
    e: new Date().getTime() + (Number(ttlSeconds) || 0) * 1000
  }));
}


/** 讀出一筆；不存在或已過期都回傳 null。讀到過期的順手刪掉。 */
function storeGet(key) {
  var props = PropertiesService.getScriptProperties();
  var raw = props.getProperty(key);
  if (!raw) return null;

  try {
    var parsed = JSON.parse(raw);
    if (parsed && parsed.e && parsed.e < new Date().getTime()) {
      props.deleteProperty(key);
      return null;
    }
    return (parsed && parsed.v !== undefined) ? parsed.v : null;
  } catch (e) {
    // 格式壞掉就當作沒有，並清掉免得每次都失敗
    try { props.deleteProperty(key); } catch (e2) { /* 忽略 */ }
    return null;
  }
}


/** 刪掉一筆（登出、作廢 token 都用這個） */
function storeRemove(key) {
  try {
    PropertiesService.getScriptProperties().deleteProperty(key);
  } catch (e) {
    // 本來就不存在也算成功
  }
}


/**
 * 清掉所有已過期的資料。
 *
 * PropertiesService 沒有自動過期，過期的 token 會一直留著。
 * 在登入時順手掃一次就夠了——登入不頻繁，而那正是要新增 token 的時候。
 */
function storeSweepExpired() {
  try {
    var props = PropertiesService.getScriptProperties();
    var all = props.getProperties();
    var now = new Date().getTime();
    var expired = [];

    Object.keys(all).forEach(function (key) {
      try {
        var parsed = JSON.parse(all[key]);
        if (parsed && parsed.e && parsed.e < now) expired.push(key);
      } catch (e) {
        // 不是這個格式存的（例如 Index.js 的旗標），不要動它
      }
    });

    expired.forEach(function (key) { props.deleteProperty(key); });
    return expired.length;
  } catch (e) {
    // 清理失敗不該影響任何正常功能
    Logger.log('storeSweepExpired 失敗（可忽略）：' + e);
    return 0;
  }
}


/**
 * 列出所有以某個前綴開頭、且尚未過期的資料。
 *
 * 用途：把某個帳號手上的所有 token 一次找出來作廢。
 * token 的 key 是 `admin_token_<隨機 UUID>`，光看 key 認不出是誰的，
 * 只能全部讀出來、逐一看內容裡的帳號。
 * 管理者只有個位數，token 也只有個位數，全部讀出來完全不影響效能。
 *
 * @return {Array} [{ key, value }, ...]
 */
function storeEntries(prefix) {
  var out = [];
  try {
    var all = PropertiesService.getScriptProperties().getProperties();
    var now = new Date().getTime();

    Object.keys(all).forEach(function (key) {
      if (prefix && key.indexOf(prefix) !== 0) return;
      try {
        var parsed = JSON.parse(all[key]);
        if (!parsed || parsed.v === undefined) return;
        if (parsed.e && parsed.e < now) return;          // 過期的當作不存在
        out.push({ key: key, value: parsed.v });
      } catch (e) {
        // 不是這個格式存的，不要動它
      }
    });
  } catch (e) {
    Logger.log('storeEntries 失敗（回傳空清單）：' + e);
  }
  return out;
}
