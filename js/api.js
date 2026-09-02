/**
 * api.js — 連線層
 *
 * ══ 為什麼要有逾時與自動重試 ══════════════════════════════
 *
 * **這不是我們的程式有問題。** 真的跑到我們的程式一定會回 HTTP 200 + JSON，
 * 就算是錯誤也是 {ok:false, error:'...'}。
 * 但 Apps Script 的 /exec 網址本身**會偶爾回 HTTP 404**——
 * 在 KANTIN 實測連打 15 次有 1 次，而且是等了 33 秒之後才回。
 *
 * 少了重試的話，那 1/15 的使用者看到的是「載入中…」轉很久，
 * 然後跳「連線有問題」。**而他只要再按一次就會成功——但他不會再按第二次。**
 *
 * 三個數字都是量出來的，不是猜的：
 *
 *   逾時 25 秒   正常回應 1.5~3 秒，但實測出現過 20 秒才回而且最後是成功的。
 *                設 10 秒會把「其實會成功」的請求砍掉重練，反而更慢。
 *                25 秒取在「量到的最慢成功 20 秒」與「Google 自己放棄的 33 秒」之間。
 *   重試 1 次    單次失敗率約 7%，重試一次降到 0.5%；
 *                再重試一次只再降一點點，卻讓最壞情況多等 25 秒。
 *   重試前等 1 秒 不要立刻打回去。
 *
 * ══ 三件不可以搞錯的事 ═══════════════════════════════════
 *
 * ① **只有「連線失敗」才重試。** 後端有回 JSON 就算它說 ok:false
 *    （查無資料之類）也是正常回應，重試只是白等一次還多打一次 API。
 *
 * ② **回來的不是 JSON 要當成連線問題。** 404 回的是一頁 HTML，
 *    直接 response.json() 會丟一個看不懂的解析錯誤，訊息跟使用者遇到的事對不上。
 *    所以先 response.text() 再自己 JSON.parse，失敗就轉成連線錯誤。
 *
 * ③ **只有「重複做也不會出事」的 API 可以開重試。**
 *    Api.post() 的第二個參數預設是 false，要開必須自己寫出來。
 *    目前三支查詢都是純讀取，可以重試。
 *
 * ══ CORS：只有這一種寫法能通 ═════════════════════════════
 *
 * Apps Script **不支援 doOptions**，所以只要瀏覽器發出預檢請求，
 * 整個呼叫會在到達後端之前就被擋掉。避開預檢的條件：
 *   1. Content-Type 必須是 'text/plain'（不可用 'application/json'）
 *   2. 不可以加任何自訂 header
 * 改成別的寫法會直接被瀏覽器擋掉，而且主控台的錯誤訊息長得像網路問題。
 */

const API_TIMEOUT_MS     = 25000;
const API_RETRY_TIMES    = 1;
const API_RETRY_DELAY_MS = 1000;

/** 重試發生時通知畫面（換掉載入文字）。少了它，使用者會盯著骨架卡住 25 秒以為當掉。 */
let apiRetryNotice = null;
function setApiRetryNotice(fn) { apiRetryNotice = fn; }

function apiDelay(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }


/** 連線層自己的錯誤型別，跟「後端回了 ok:false」區分開 */
class ApiConnectionError extends Error {
  constructor(message) { super(message); this.name = 'ApiConnectionError'; }
}


async function fetchJsonOnce(body) {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller
    ? setTimeout(function () { controller.abort(); }, API_TIMEOUT_MS)
    : null;

  let res;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      // ⚠️ 一定要 text/plain，見檔頭 CORS 說明
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
      redirect: 'follow',
      signal: controller ? controller.signal : undefined,
    });
  } catch (err) {
    throw new ApiConnectionError(err && err.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK');
  } finally {
    if (timer) clearTimeout(timer);
  }

  // ⚠️ 先拿文字再自己 parse。404 回的是 HTML，直接 .json() 的錯誤訊息會看不懂
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new ApiConnectionError('BAD_RESPONSE');
  }
}


async function fetchJson(body, canRetry) {
  let left = canRetry ? API_RETRY_TIMES : 0;
  for (;;) {
    try {
      return await fetchJsonOnce(body);
    } catch (err) {
      // 只有連線問題才重試。後端有回 JSON（即使 ok:false）不在這裡
      if (!(err instanceof ApiConnectionError) || left <= 0) throw err;
      left -= 1;
      if (apiRetryNotice) apiRetryNotice();
      await apiDelay(API_RETRY_DELAY_MS);
    }
  }
}


const Api = {
  /**
   * @param {object} body      至少要有 action
   * @param {boolean} canRetry 只有「重複做也不會出事」的 API 才可以開
   */
  post(body, canRetry) {
    return fetchJson(body, canRetry === true);
  },

  // 三支查詢都是純讀取，可以重試
  queryByEmail(email)   { return Api.post({ action: 'queryByEmail',  email: email },   true); },
  queryByDate(date)     { return Api.post({ action: 'queryByDate',   date: date },     true); },
  queryByFlight(flight) { return Api.post({ action: 'queryByFlight', flight: flight }, true); },
};
