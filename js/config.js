/**
 * 系統設定
 *
 * ⚠️ 整個專案只有這個檔案放 API 網址。
 *    Apps Script 重新部署導致網址改變時，只要改這一行。
 *    其他檔案一律引用 API_URL，不可以自己寫死一份。
 */

// Apps Script 網頁應用程式網址（部署後取得，/exec 結尾）
const API_URL = 'https://script.google.com/macros/s/AKfycbwMuEjod-AKyW6FZxevHD_GxPMy4WQunoePtxTmLmEfP6be7kkKDUFh_kb2ZazrdKmM/exec';


/**
 * 頁尾顯示的系統資訊。
 *
 * ⚠️ version 要跟 gas/Config.js 的 SYSTEM_INFO.version 保持一致。
 *    後端也要有一份，是因為系統信是 Apps Script 產生的，
 *    而它讀不到 GitHub Pages 上的前端檔案。
 *    「複製一份」必然會走鐘，所以改版時兩邊都要記得改。
 */
const SYSTEM_INFO = {
  // ⚠️ 不要加 'v' 前綴。這個值必須跟 gas/Config.js 的 SYSTEM_INFO.version
  //    以及所有 HTML 的 ?v= **完全相同**，tools/check.js 會比對。
  //    顯示時才在前面加 v（見 js/i18n.js 的 renderFooter）。
  version: '1.9',
  year: '2026',

  // 維護單位（依介面語言顯示對應版本）
  maintainer: { zh: 'PCI 總務', id: 'PCI GA' },

  // 聯絡分機。⚠️ 留空的話頁尾就不會出現這一段
  contact: '3690',
};


/** 預設語言。使用者切換過就記在 localStorage，下次照他的選擇。 */
const DEFAULT_LANG = 'id';

/**
 * localStorage 的 key。
 *
 * ⚠️ 最後查詢成功的 email 只留**一筆**。
 *    借手機給同事用的情況真的會發生，不能讓別人的信箱累積在這台裝置上。
 *    而且只存「查得到資料」的那一次——存了查無資料的，
 *    等資料補上之後他還要等快取過期才看得到，而他不會再來第二次。
 */
const LS_LANG  = 'airport.lang';
const LS_EMAIL = 'airport.lastEmail';
