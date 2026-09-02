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
    'result.past':     'Tanggal yang Anda cari sudah lewat. Hanya jadwal mulai hari ini yang dapat dicari.',

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

    'adm.login.title':  'Login Admin',
    'adm.account':      'Akun',
    'adm.password':     'Kata sandi',
    'adm.name':         'Nama',
    'adm.role':         'Peran',
    'adm.role.super':   'Super Admin',
    'adm.role.admin':   'Admin',
    'adm.login.submit': 'Masuk',
    'adm.logout':       'Keluar',
    'adm.working':      'Memproses…',
    'adm.forgot.link':  'Lupa kata sandi?',
    'adm.forgot.title': 'Lupa Kata Sandi',
    'adm.forgot.desc':  'Kata sandi sementara akan dikirim ke email yang terdaftar. Kata sandi lama Anda tetap berlaku sampai Anda login dengan yang sementara.',
    'adm.forgot.submit':'Kirim',
    'adm.forgot.sent':  'Jika akun tersebut terdaftar, email berisi kata sandi sementara sudah dikirim. Silakan periksa kotak masuk Anda.',
    'adm.backToLogin':  'Kembali ke login',
    'adm.change.title': 'Ganti Kata Sandi',
    'adm.change.desc':  'Kata sandi Anda saat ini dibuat oleh sistem. Silakan buat kata sandi baru yang hanya Anda ketahui.',
    'adm.change.new':     'Kata sandi baru',
    'adm.change.confirm': 'Ulangi kata sandi baru',
    'adm.change.rule':    'Minimal 8 karakter.',
    'adm.change.submit':  'Simpan',
    'adm.change.done':    'Kata sandi berhasil diubah.',
    'adm.done.title':   'Sudah Masuk',
    'adm.done.soon':    'Menu pengelolaan jadwal akan tersedia pada tahap berikutnya. Untuk sementara, kelola data langsung di Google Sheet.',
    'adm.err.required': 'Silakan isi semua kolom.',
    'adm.err.failed':   'Akun atau kata sandi salah. Sisa {n} percobaan.',
    'adm.err.locked':   'Terlalu banyak percobaan. Coba lagi dalam {n} menit, atau gunakan "Lupa kata sandi".',
    'adm.err.disabled': 'Akun ini tidak aktif. Hubungi administrator.',
    'adm.err.expired':  'Sesi berakhir. Silakan login kembali.',
    'adm.err.forbidden':'Akun Anda tidak punya izin untuk tindakan ini.',
    'adm.err.tooShort': 'Kata sandi minimal {n} karakter.',
    'adm.err.notMatch': 'Kedua kata sandi tidak sama.',
    'adm.err.same':     'Kata sandi baru tidak boleh sama dengan yang lama.',
    'adm.err.oldWrong': 'Kata sandi lama salah.',
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
    'result.past':     '您查詢的日期已經過去了。只能查詢今天以後的行程。',

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

    'adm.login.title':  '管理者登入',
    'adm.account':      '帳號',
    'adm.password':     '密碼',
    'adm.name':         '姓名',
    'adm.role':         '角色',
    'adm.role.super':   '超級管理者',
    'adm.role.admin':   '管理者',
    'adm.login.submit': '登入',
    'adm.logout':       '登出',
    'adm.working':      '處理中…',
    'adm.forgot.link':  '忘記密碼？',
    'adm.forgot.title': '忘記密碼',
    'adm.forgot.desc':  '系統會寄一組臨時密碼到你登記的信箱。在你真的用它登入之前，原本的密碼仍然有效。',
    'adm.forgot.submit':'寄出',
    'adm.forgot.sent':  '如果這個帳號存在，臨時密碼已經寄到登記的信箱，請去收信。',
    'adm.backToLogin':  '返回登入',
    'adm.change.title': '設定新密碼',
    'adm.change.desc':  '你目前這組密碼是系統產生的，請改成只有你自己知道的。',
    'adm.change.new':     '新密碼',
    'adm.change.confirm': '再輸入一次新密碼',
    'adm.change.rule':    '至少 8 個字元。',
    'adm.change.submit':  '儲存',
    'adm.change.done':    '密碼已更新。',
    'adm.done.title':   '已登入',
    'adm.done.soon':    '班表管理功能會在下一階段開放。目前請直接在 Google 試算表上維護資料。',
    'adm.err.required': '請填寫所有欄位。',
    'adm.err.failed':   '帳號或密碼錯誤，還可以試 {n} 次。',
    'adm.err.locked':   '嘗試次數過多，請於 {n} 分鐘後再試，或使用「忘記密碼」。',
    'adm.err.disabled': '此帳號已停用，請洽系統管理者。',
    'adm.err.expired':  '登入已過期，請重新登入。',
    'adm.err.forbidden':'你的帳號沒有執行這個操作的權限。',
    'adm.err.tooShort': '密碼至少要 {n} 個字元。',
    'adm.err.notMatch': '兩次輸入的密碼不一樣。',
    'adm.err.same':     '新密碼不可與舊密碼相同。',
    'adm.err.oldWrong': '舊密碼不正確。',
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

  const lines = [];
  const by = (SYSTEM_INFO.maintainer && SYSTEM_INFO.maintainer[currentLang]) || '';
  if (by) lines.push(t('foot.by') + colon() + by);
  if (SYSTEM_INFO.contact) lines.push(t('foot.ext') + ' ' + SYSTEM_INFO.contact);
  // 'v' 與「系統版本」這幾個字只在顯示時加，存的是純數字（見 js/config.js）
  lines.push(t('foot.version') + ' v' + SYSTEM_INFO.version +
             (SYSTEM_INFO.year ? ' · ' + SYSTEM_INFO.year : ''));

  // 一行一個項目，置中。用 DOM 建，不用 innerHTML——
  // 維護單位是設定檔來的字串，走 innerHTML 等於多開一個沒必要的洞。
  box.textContent = '';
  lines.forEach(function (line, i) {
    const row = document.createElement('div');
    row.textContent = line + (i < lines.length - 1 ? ' ·' : '');
    box.appendChild(row);
  });

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
