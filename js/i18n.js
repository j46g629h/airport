/**
 * i18n.js — 印尼文（主）／中文（副）
 *
 * ⚠️ 畫面上任何一句話都不要寫死在 HTML 或 JS 裡，一律走 t()。
 *    寫死的那幾句在切換語言時不會變，而且很難找——
 *    通常是使用者反映「有一句沒翻到」才發現。
 *
 * ⚠️ 後端的錯誤也是回「代碼」而不是句子（見 gas/Query.js），
 *    因為後端不知道使用者現在把介面切成哪一種語言。翻譯在這裡做。
 *
 * 用法：
 *   HTML 上加 data-i18n="key"，切換語言時由 applyLang() 自動填。
 *   JS 裡用 t('key')。
 */

const I18N = {
  id: {
    'app.name':        'Antar Jemput Bandara',

    'home.query.title': 'Cek Jadwal Saya',
    'home.query.desc':  'Masukkan email untuk melihat jadwal antar jemput Anda',
    'home.list.title':  'Cari per Tanggal / NO Pesawat',
    'home.list.desc':   'Lihat siapa saja yang berangkat pada hari atau penerbangan yang sama',

    'query.title':     'Cek Jadwal',
    'query.tab.email': 'Email',
    'query.tab.date':  'Tanggal Pesawat',
    'query.tab.flight':'NO Pesawat',

    'query.email.label': 'Alamat email',
    'query.email.hint':  'Tidak perlu lengkap — ketik sebagian saja (minimal 3 huruf). Keluarga yang memakai email yang sama akan ikut tampil.',
    'query.date.label':  'Tanggal Pesawat',
    'query.date.hint':   'Menampilkan semua orang pada tanggal tersebut.',
    'query.flight.label':'NO Pesawat',
    'query.flight.hint': 'Contoh: CI761, CX798. Menampilkan semua orang di penerbangan yang sama.',
    'query.submit':      'Cari',
    'query.searching':   'Mencari…',

    'result.title':    'Hasil',
    'result.count':    '{n} data',
    'result.empty':    'Tidak ada jadwal yang akan datang.',
    'result.emailHint':'Coba kata kunci lain, atau hubungi bagian GA.',
    'result.range':    'Hanya menampilkan jadwal mulai hari ini. Jadwal yang sudah lewat tidak ditampilkan.',

    'arah.PICKUP':  'Jemput',
    'arah.DROPOFF': 'Antar',

    'status.SCHEDULED': 'Terjadwal',
    'status.DONE':      'Selesai',
    'status.POSTPONED': 'Diundur',
    'status.PENDING':   'Menunggu',
    'status.CANCELLED': 'Batal',

    'f.pending':   'Tanggal belum ditentukan, hubungi bagian GA',
    'f.asal':      'Semula',
    'f.flight':    'NO Pesawat',
    'f.etd':       'Jam pesawat',
    'f.pickup':    'Jam dari PCI',
    'f.titik':     'Titik jemput',
    'f.dorm':      'Kamar',
    'f.dept':      'Dept',
    'f.hp':        'HP',
    'f.email':     'Email',
    'f.bagasi':    'Bagasi',
    'f.remark':    'Catatan',
    'f.permintaan':'Permintaan',
    'f.kendaraan': 'No. kendaraan',
    'f.sopir':     'Sopir',
    'f.hpSopir':   'HP sopir',

    'err.network':    'Koneksi bermasalah. Silakan coba lagi.',
    'err.timeout':    'Server lambat merespons. Silakan coba lagi.',
    'err.retrying':   'Koneksi lambat, mencoba lagi…',
    'err.server':     'Sistem bermasalah. Silakan coba lagi nanti.',
    'err.emailReq':   'Silakan masukkan email.',
    'err.emailShort': 'Ketik minimal {n} huruf.',
    'err.dateReq':    'Silakan pilih tanggal.',
    'err.dateInvalid':'Tanggal tidak valid.',
    'err.flightReq':  'Silakan masukkan NO Pesawat.',

    'nav.home':     'Beranda',
    'foot.by':      'Dikelola oleh',
    'foot.ext':     'Ext',
    'foot.version': 'Versi Sistem',
    'foot.admin':   'Login Admin',
  },

  zh: {
    'app.name':        '機場接送系統',

    'home.query.title': '查詢我的行程',
    'home.query.desc':  '輸入電子郵件，查看自己的接送安排',
    'home.list.title':  '依航班日期／航班號查詢',
    'home.list.desc':   '看看同一天或同班機還有誰',

    'query.title':     '查詢接送',
    'query.tab.email': '電子郵件',
    'query.tab.date':  '航班日期',
    'query.tab.flight':'航班號',

    'query.email.label': '電子郵件',
    'query.email.hint':  '不用打完整——打一部分就好（至少 3 個字）。共用同一個信箱的家屬會一起顯示。',
    'query.date.label':  '航班日期',
    'query.date.hint':   '顯示當天所有人的接送安排。',
    'query.flight.label':'航班號',
    'query.flight.hint': '例如 CI761、CX798。顯示同班機所有人。',
    'query.submit':      '查詢',
    'query.searching':   '查詢中…',

    'result.title':    '查詢結果',
    'result.count':    '{n} 筆',
    'result.empty':    '沒有即將到來的行程。',
    'result.emailHint':'換個關鍵字試試，或洽總務。',
    'result.range':    '只顯示今天以後的行程，已經過去的不會出現。',

    'arah.PICKUP':  '接機',
    'arah.DROPOFF': '送機',

    'status.SCHEDULED': '已排定',
    'status.DONE':      '已完成',
    'status.POSTPONED': '已改期',
    'status.PENDING':   '待定',
    'status.CANCELLED': '已取消',

    'f.pending':   '日期待定，請洽總務',
    'f.asal':      '原訂',
    'f.flight':    '航班號',
    'f.etd':       '起降時間',
    'f.pickup':    '出廠時間',
    'f.titik':     '上車地點',
    'f.dorm':      '房間號碼',
    'f.dept':      '部門',
    'f.hp':        '手機',
    'f.email':     '電子郵件',
    'f.bagasi':    '行李',
    'f.remark':    '備註',
    'f.permintaan':'需求',
    'f.kendaraan': '車號',
    'f.sopir':     '司機',
    'f.hpSopir':   '司機電話',

    'err.network':    '連線有問題，請再試一次。',
    'err.timeout':    '伺服器回應太慢，請再試一次。',
    'err.retrying':   '連線比較慢，重試中…',
    'err.server':     '系統出了問題，請稍後再試。',
    'err.emailReq':   '請輸入電子郵件。',
    'err.emailShort': '請至少輸入 {n} 個字。',
    'err.dateReq':    '請選擇日期。',
    'err.dateInvalid':'日期格式不正確。',
    'err.flightReq':  '請輸入航班號。',

    'nav.home':     '回首頁',
    'foot.by':      '維護單位',
    'foot.ext':     '分機',
    'foot.version': '系統版本',
    'foot.admin':   '管理者登入',
  },
};


let currentLang = DEFAULT_LANG;

/** ⚠️ localStorage 在無痕視窗、空間滿了、關掉網站資料時都會丟例外，一律包起來 */
function loadLang() {
  try {
    const saved = localStorage.getItem(LS_LANG);
    if (saved && I18N[saved]) currentLang = saved;
  } catch (e) { /* 讀不到就用預設語言，不影響功能 */ }
  return currentLang;
}

function setLang(lang) {
  if (!I18N[lang]) return;
  currentLang = lang;
  try { localStorage.setItem(LS_LANG, lang); } catch (e) { /* 存不進去只是下次要重選 */ }
  applyLang();
}

function getLang() { return currentLang; }

/** 翻譯。找不到 key 就把 key 本身印出來——那樣一眼看得出漏翻了哪一句 */
function t(key, vars) {
  let s = (I18N[currentLang] && I18N[currentLang][key]) || key;
  if (vars) {
    Object.keys(vars).forEach(function (k) {
      s = s.replace('{' + k + '}', vars[k]);
    });
  }
  return s;
}

/**
 * 冒號要跟著語言走。
 * 中文用全形「：」，印尼文用半形「: 」——
 * 在印尼文句子裡放一個全形冒號會很突兀（Dikelola oleh：PCI GA），
 * 而且那個字元在某些字型下寬度會怪怪的。
 */
function colon() { return currentLang === 'zh' ? '：' : ': '; }

/** 後端回來的錯誤代碼 → 使用者看得懂的話 */
function tError(code, detail) {
  switch (code) {
    case 'EMAIL_REQUIRED':  return t('err.emailReq');
    case 'EMAIL_TOO_SHORT': return t('err.emailShort', { n: detail || 3 });
    case 'DATE_INVALID':    return t('err.dateInvalid');
    case 'FLIGHT_REQUIRED': return t('err.flightReq');
    default:                return t('err.server');
  }
}

/** 把畫面上所有 data-i18n 的元素填好，並更新語言按鈕與 <html lang> */
function applyLang() {
  document.documentElement.lang = (currentLang === 'zh' ? 'zh-Hant' : 'id');

  document.querySelectorAll('[data-i18n]').forEach(function (el) {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  document.querySelectorAll('[data-i18n-ph]').forEach(function (el) {
    el.placeholder = t(el.getAttribute('data-i18n-ph'));
  });

  document.querySelectorAll('.lang button').forEach(function (btn) {
    btn.setAttribute('aria-pressed', String(btn.dataset.lang === currentLang));
  });

  renderFooter();
  if (typeof onLangChanged === 'function') onLangChanged();
}

/**
 * 頁尾：維護單位 → 聯絡分機 → 系統版本 → 管理者登入。
 * 留空的欄位不會顯示（例如還沒填分機時就不會出現「分機：」）。
 */
function renderFooter() {
  const box = document.getElementById('footInfo');
  if (!box) return;

  const parts = [];
  const by = (SYSTEM_INFO.maintainer && SYSTEM_INFO.maintainer[currentLang]) || '';
  if (by) parts.push(t('foot.by') + colon() + by);
  if (SYSTEM_INFO.contact) parts.push(t('foot.ext') + ' ' + SYSTEM_INFO.contact);
  // 'v' 與「系統版本」這幾個字只在顯示時加，存的是純數字（見 js/config.js）
  parts.push(t('foot.version') + ' v' + SYSTEM_INFO.version);
  if (SYSTEM_INFO.year) parts.push(SYSTEM_INFO.year);

  box.textContent = parts.join(' · ');

  const admin = document.getElementById('footAdmin');
  if (admin) admin.textContent = t('foot.admin');
}

/** 語言切換按鈕。每一頁都會呼叫。 */
function initLangSwitch() {
  loadLang();
  document.querySelectorAll('.lang button').forEach(function (btn) {
    btn.addEventListener('click', function () { setLang(btn.dataset.lang); });
  });
  applyLang();
}
