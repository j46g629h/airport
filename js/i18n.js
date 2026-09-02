/**
 * i18n.js — 印尼文（主）／中文（副）
 *
 * ⚠️ 畫面上任何一句話都不要寫死在 HTML 或 JS 裡，一律走 t()。
 *    寫死的那幾句在切換語言時不會變，而且很難找——
 *    通常是使用者反映「有一句沒翻到」才發現。
 *
 * 用法：
 *   HTML 上加 data-i18n="key"，切換語言時由 applyLang() 自動填。
 *   JS 裡用 t('key')。
 */

const I18N = {
  id: {
    'app.name':        'Antar Jemput Bandara',
    'app.subtitle':    'PCI adidas',

    'home.query.title': 'Cek Jadwal Saya',
    'home.query.desc':  'Masukkan email untuk melihat jadwal antar jemput Anda',
    'home.list.title':  'Cari per Tanggal / Nomor Penerbangan',
    'home.list.desc':   'Lihat siapa saja yang berangkat pada hari atau penerbangan yang sama',

    'query.title':     'Cek Jadwal',
    'query.tab.email': 'Email',
    'query.tab.date':  'Tanggal',
    'query.tab.flight':'Penerbangan',

    'query.email.label': 'Alamat email',
    'query.email.hint':  'Email yang terdaftar. Keluarga yang memakai email yang sama akan ikut tampil.',
    'query.date.label':  'Tanggal penerbangan',
    'query.date.hint':   'Menampilkan semua orang pada tanggal tersebut.',
    'query.flight.label':'Nomor penerbangan',
    'query.flight.hint': 'Contoh: CI761, CX798. Menampilkan semua orang di penerbangan yang sama.',
    'query.submit':      'Cari',
    'query.searching':   'Mencari…',

    'result.title':    'Hasil',
    'result.count':    '{n} data',
    'result.empty':    'Tidak ada data yang cocok.',
    'result.emailHint':'Pastikan email sudah benar, atau hubungi bagian GA.',
    'result.range':    'Hanya menampilkan data 3 bulan terakhir dan yang akan datang.',

    'arah.PICKUP':  'Jemput',
    'arah.DROPOFF': 'Antar',

    'status.SCHEDULED': 'Terjadwal',
    'status.DONE':      'Selesai',
    'status.POSTPONED': 'Diundur',
    'status.PENDING':   'Menunggu',
    'status.CANCELLED': 'Batal',

    'f.date':      'Tanggal',
    'f.pending':   'Tanggal belum ditentukan, hubungi bagian GA',
    'f.asal':      'Semula',
    'f.flight':    'Penerbangan',
    'f.etd':       'Jam pesawat',
    'f.pickup':    'Jam dari PCI',
    'f.titik':     'Titik jemput',
    'f.dorm':      'Kamar',
    'f.dept':      'Dept',
    'f.factory':   'Pabrik',
    'f.hp':        'HP',
    'f.email':     'Email',
    'f.bagasi':    'Bagasi',
    'f.remark':    'Catatan',
    'f.permintaan':'Permintaan',
    'f.kendaraan': 'No. kendaraan',
    'f.sopir':     'Sopir',
    'f.hpSopir':   'HP sopir',

    'err.network':  'Koneksi bermasalah. Silakan coba lagi.',
    'err.timeout':  'Server lambat merespons. Silakan coba lagi.',
    'err.retrying': 'Koneksi lambat, mencoba lagi…',
    'err.server':   'Sistem bermasalah. Silakan coba lagi nanti.',
    'err.emailReq': 'Silakan masukkan email.',
    'err.dateReq':  'Silakan pilih tanggal.',
    'err.flightReq':'Silakan masukkan nomor penerbangan.',

    'nav.back':  '← Kembali',
    'foot.by':   'Dikelola oleh',
  },

  zh: {
    'app.name':        '機場接送系統',
    'app.subtitle':    'PCI adidas',

    'home.query.title': '查詢我的行程',
    'home.query.desc':  '輸入電子郵件，查看自己的接送安排',
    'home.list.title':  '依日期／航班號查詢',
    'home.list.desc':   '看看同一天或同班機還有誰',

    'query.title':     '查詢接送',
    'query.tab.email': '電子郵件',
    'query.tab.date':  '航班日期',
    'query.tab.flight':'航班號',

    'query.email.label': '電子郵件',
    'query.email.hint':  '名冊上登記的信箱。共用同一個信箱的家屬會一起顯示。',
    'query.date.label':  '航班日期',
    'query.date.hint':   '顯示當天所有人的接送安排。',
    'query.flight.label':'航班號碼',
    'query.flight.hint': '例如 CI761、CX798。顯示同班機所有人。',
    'query.submit':      '查詢',
    'query.searching':   '查詢中…',

    'result.title':    '查詢結果',
    'result.count':    '{n} 筆',
    'result.empty':    '查不到符合的資料。',
    'result.emailHint':'請確認信箱是否正確，或洽總務。',
    'result.range':    '只顯示最近 3 個月以及未來的資料。',

    'arah.PICKUP':  '接機',
    'arah.DROPOFF': '送機',

    'status.SCHEDULED': '已排定',
    'status.DONE':      '已完成',
    'status.POSTPONED': '已改期',
    'status.PENDING':   '待定',
    'status.CANCELLED': '已取消',

    'f.date':      '航班日期',
    'f.pending':   '日期待定，請洽總務',
    'f.asal':      '原訂',
    'f.flight':    '航班號',
    'f.etd':       '起降時間',
    'f.pickup':    '出廠時間',
    'f.titik':     '上車地點',
    'f.dorm':      '房間號碼',
    'f.dept':      '部門',
    'f.factory':   '廠別',
    'f.hp':        '手機',
    'f.email':     '電子郵件',
    'f.bagasi':    '行李',
    'f.remark':    '備註',
    'f.permintaan':'需求',
    'f.kendaraan': '車號',
    'f.sopir':     '司機',
    'f.hpSopir':   '司機電話',

    'err.network':  '連線有問題，請再試一次。',
    'err.timeout':  '伺服器回應太慢，請再試一次。',
    'err.retrying': '連線比較慢，重試中…',
    'err.server':   '系統出了問題，請稍後再試。',
    'err.emailReq': '請輸入電子郵件。',
    'err.dateReq':  '請選擇日期。',
    'err.flightReq':'請輸入航班號。',

    'nav.back':  '← 返回',
    'foot.by':   '維護單位',
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

  if (typeof onLangChanged === 'function') onLangChanged();
}

/** 語言切換按鈕。每一頁都會呼叫。 */
function initLangSwitch() {
  loadLang();
  document.querySelectorAll('.lang button').forEach(function (btn) {
    btn.addEventListener('click', function () { setLang(btn.dataset.lang); });
  });
  applyLang();
}
