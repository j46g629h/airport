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
    'home.admin.title': 'Area Admin',
    'home.admin.desc':  'Tambah, ubah, hapus data antar jemput (perlu akun)',

    'query.title':     'Cek Jadwal',
    'query.tab.email': 'Email',
    'query.tab.date':  'Tanggal Pesawat',
    'query.tab.flight':'NO Pesawat',

    'query.email.label': 'Alamat email',
    'query.email.hint':  'Ketik minimal bagian sebelum @ (contoh: linda.lim). Keluarga yang memakai email yang sama akan ikut tampil.',
    'query.date.label':  'Tanggal Pesawat',
    'query.date.hint':   'Menampilkan semua orang pada tanggal tersebut.',
    'query.flight.label':'NO Pesawat',
    'query.flight.hint': 'Contoh: CI761, CX798. Huruf dan angka, tanpa spasi, huruf besar/kecil bebas. Menampilkan semua orang di penerbangan yang sama.',
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
    'adm.done.soon':    'Daftar jadwal sudah bisa dilihat dan difilter. Menambah dan mengubah data masih dilakukan langsung di Google Sheet (menyusul pada tahap berikutnya).',
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

    'acc.title':        'Kelola Akun',
    'acc.back':         'Admin',
    'acc.disabled':     'Nonaktif',
    'acc.locked':       'Terkunci {n} mnt',
    'acc.pendingPw':    'Belum ganti sandi',
    'acc.emailNotif':   'Email notifikasi',
    'acc.pwChanged':    'Sandi diubah',
    'acc.lastLogin':    'Login terakhir',
    'acc.never':        'Belum pernah',
    'acc.done':         'Berhasil.',
    'acc.create.toggle':'+ Akun baru',
    'acc.create.submit':'Buat akun',
    'acc.new.account':  'Akun',
    'acc.new.accountHint':'Boleh email atau nama pendek, mis. ga2 atau ken.wang.',
    'acc.new.name':     'Nama',
    'acc.new.role':     'Peran',
    'acc.new.emailNotif':'Email notifikasi',
    'acc.new.emailNotifHint':'Wajib diisi kalau akun bukan alamat email — ke sinilah kata sandi sementara dikirim kalau lupa sandi.',
    'acc.act.reset':    'Reset sandi',
    'acc.act.disable':  'Nonaktifkan',
    'acc.act.enable':   'Aktifkan',
    'acc.act.toSuper':  'Jadikan Super',
    'acc.act.toAdmin':  'Jadikan Admin',
    'acc.act.unlock':   'Buka kunci',
    'acc.act.remove':   'Hapus',
    'acc.guard.self':      'Tidak bisa dilakukan pada akun sendiri.',
    'acc.guard.resetSelf': 'Untuk mengubah sandi sendiri, gunakan menu ganti kata sandi.',
    'acc.guard.lastSuper': 'Ini satu-satunya Super Admin yang aktif. Kalau dinonaktifkan, tidak ada yang bisa masuk ke halaman ini.',
    'acc.confirm.reset':   'Reset kata sandi {name}? Dia akan langsung keluar dari sistem dan harus memakai kata sandi baru.',
    'acc.confirm.disable': 'Nonaktifkan {name}? Dia akan langsung keluar dari sistem.',
    'acc.confirm.toSuper': 'Jadikan {name} Super Admin? Dia akan bisa mengelola semua akun.',
    'acc.confirm.toAdmin': 'Turunkan {name} menjadi Admin biasa?',
    'acc.confirm.remove':  'HAPUS akun {account} secara permanen? Untuk karyawan yang keluar, sebaiknya pakai "Nonaktifkan" agar riwayat tetap terbaca.',
    'acc.err.badAccount': 'Akun hanya boleh huruf, angka, dan . _ - @ (3-64 karakter).',
    'acc.err.badEmail':   'Format Email Notifikasi tidak valid.',
    'acc.err.notifReq':   'Akun ini bukan email, jadi Email Notifikasi wajib diisi — ke sanalah kata sandi sementara dikirim kalau lupa sandi.',
    'acc.err.exists':   'Akun ini sudah ada.',
    'acc.err.notFound': 'Akun tidak ditemukan.',
    'acc.err.busy':     'Sedang sibuk, coba lagi sebentar.',
    'acc.pw.title':     'Kata Sandi Awal',
    'acc.pw.value':     'Kata sandi',
    'acc.pw.once':      'Kata sandi ini hanya muncul sekali. Salin sekarang dan sampaikan langsung ke orangnya. Sistem tidak bisa menampilkannya lagi.',
    'acc.noPasswordNote':'Sistem tidak dapat menampilkan kata sandi siapa pun — yang tersimpan adalah hash satu arah, bahkan sistem sendiri tidak bisa membacanya. Kalau lupa, cukup reset.',
    'acc.link':         'Kelola Akun',

    'list.title':       'Daftar Jadwal',
    'list.link':        'Daftar Jadwal',
    'list.range':       'Rentang tanggal',
    'list.from':        'Dari',
    'list.to':          'Sampai',
    'list.search':      'Tampilkan',
    'list.quick.week':  'Minggu ini',
    'list.quick.14':    '14 hari ke depan',
    'list.quick.month': 'Bulan ini',
    'list.quick.past':  '14 hari lalu',
    'list.quick.all':   'Semua',

    'nav.list':     'Daftar Jadwal',
    'nav.accounts': 'Kelola Akun',
    'list.liveHint':    'Filter di bawah bekerja langsung — tidak perlu cari ulang.',
    'list.keyword':     'Nama / email / kamar',
    'list.keyword.ph':  'Ketik sebagian saja',
    'list.arah':        'Jemput / Antar',
    'list.status':      'Status',
    'list.all':         'Semua',
    'list.more':        'Filter lain',
    'list.needOnly':    'Hanya yang ada permintaan',
    'list.sort':        'Urutkan',
    'list.sort.date':   'Tanggal',
    'list.sort.name':   'Nama',
    'list.sort.flight': 'NO Pesawat',
    'list.sort.updated':'Terakhir diubah',
    'list.reset':       'Hapus filter',
    'list.reload':      'Muat ulang',
    'list.countOf':     '{n} dari {total} data',
    'list.stat':        'Jemput {a} · Antar {b}',
    'list.empty':       'Tidak ada data yang cocok dengan filter.',
    'list.emptyHint':   'Coba hapus sebagian filter.',
    'list.emptyRange':  'Tidak ada jadwal pada rentang tanggal ini.',
    'list.showMore':    'Tampilkan {n} lagi',
    'list.fresh':       'Data per {t}',
    'list.lag':         'Perubahan yang baru dibuat langsung di Google Sheet baru muncul di sini paling lambat 5 menit kemudian.',
    'list.truncated':   'Data terlalu banyak. Hanya {n} data terdekat dari hari ini yang ditampilkan (total {total}). Silakan persempit rentang tanggal.',
    'list.sheetRaw':    'Di Sheet masih: {s}',
    'list.hasReq':      'Ada permintaan',
    'list.detail':      'Detail',
    'list.close':       'Tutup',

    'th.date':   'Tanggal',
    'th.arah':   'Jemput/Antar',
    'th.name':   'Nama',
    'th.flight': 'NO Pesawat',
    'th.pickup': 'Dari PCI',
    'th.titik':  'Titik jemput',
    'th.status': 'Status',
    'th.detail': 'Detail',

    'f.factory':     'Factory',
    'f.custom':      'Custom',
    'f.povs':        'POVS',
    'f.group':       'Grup',
    'f.emailKontak': 'Email kontak',
    'f.updated':     'Terakhir diubah',
    'f.booking':     'No. booking',
    'f.sheet':       'Lokasi di Sheet',

    'err.dateRange': 'Tanggal "Dari" tidak boleh lebih akhir dari "Sampai".',
  },

  zh: {
    'app.name':        '機場接送系統',

    'home.query.title': '查詢我的行程',
    'home.query.desc':  '輸入電子郵件，查看自己的接送安排',
    'home.admin.title': '管理者專區',
    'home.admin.desc':  '新增、修改、刪除接送資料（需要帳號密碼）',

    'query.title':     '查詢接送',
    'query.tab.email': '電子郵件',
    'query.tab.date':  '航班日期',
    'query.tab.flight':'航班號',

    'query.email.label': '電子郵件',
    'query.email.hint':  '至少打到 @ 前面那一段（例如 linda.lim）。共用同一個信箱的家屬會一起顯示。',
    'query.date.label':  '航班日期',
    'query.date.hint':   '顯示當天所有人的接送安排。',
    'query.flight.label':'航班號',
    'query.flight.hint': '例如 CI761、CX798。英文與數字不需空格，大小寫不拘。顯示同班機所有人。',
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
    'adm.done.soon':    '班表列表已經可以查詢與篩選。新增與修改仍請直接在 Google 試算表上做，下一階段才會開放。',
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

    'acc.title':        '帳號管理',
    'acc.back':         '管理',
    'acc.disabled':     '已停用',
    'acc.locked':       '鎖定中 {n} 分',
    'acc.pendingPw':    '待本人設定密碼',
    'acc.emailNotif':   '通知信箱',
    'acc.pwChanged':    '密碼最後變更',
    'acc.lastLogin':    '最後登入',
    'acc.never':        '從未',
    'acc.done':         '已完成。',
    'acc.create.toggle':'＋ 新增帳號',
    'acc.create.submit':'建立帳號',
    'acc.new.account':  '帳號',
    'acc.new.accountHint':'電子郵件或短名稱都可以，例如 ga2 或 ken.wang。',
    'acc.new.name':     '姓名',
    'acc.new.role':     '角色',
    'acc.new.emailNotif':'通知信箱',
    'acc.new.emailNotifHint':'帳號不是電子郵件時**必填**——忘記密碼的臨時密碼會寄到這裡。',
    'acc.act.reset':    '重設密碼',
    'acc.act.disable':  '停用',
    'acc.act.enable':   '啟用',
    'acc.act.toSuper':  '升為超管',
    'acc.act.toAdmin':  '降為管理者',
    'acc.act.unlock':   '解除鎖定',
    'acc.act.remove':   '刪除',
    'acc.guard.self':      '不能對自己做這個動作。',
    'acc.guard.resetSelf': '要改自己的密碼請走「變更密碼」。',
    'acc.guard.lastSuper': '這是唯一一位啟用中的超級管理者。停用之後就沒有人進得去這一頁了。',
    'acc.confirm.reset':   '確定要重設 {name} 的密碼嗎？他會立刻被登出，必須改用新密碼。',
    'acc.confirm.disable': '確定要停用 {name} 嗎？他會立刻被登出。',
    'acc.confirm.toSuper': '確定把 {name} 升為超級管理者嗎？他將能管理所有帳號。',
    'acc.confirm.toAdmin': '確定把 {name} 降為一般管理者嗎？',
    'acc.confirm.remove':  '確定要永久刪除帳號 {account} 嗎？人員離職請改用「停用」，這樣歷史操作紀錄才查得到是誰做的。',
    'acc.err.badAccount': '帳號只能用英文、數字和 . _ - @ ，長度 3～64 個字。',
    'acc.err.badEmail':   '通知信箱的格式不正確。',
    'acc.err.notifReq':   '這個帳號不是電子郵件，所以「通知信箱」必填——忘記密碼時臨時密碼會寄到那裡。',
    'acc.err.exists':   '這個帳號已經存在。',
    'acc.err.notFound': '查無此帳號。',
    'acc.err.busy':     '系統忙碌中，請稍後再試。',
    'acc.pw.title':     '初始密碼',
    'acc.pw.value':     '密碼',
    'acc.pw.once':      '這組密碼只會出現這一次，現在就複製走並當面交給本人。系統無法再顯示第二次。',
    'acc.noPasswordNote':'系統查不到任何人目前的密碼——存的是單向雜湊，連系統自己都算不回去。忘記了就重設一次即可。',
    'acc.link':         '帳號管理',

    'list.title':       '班表列表',
    'list.link':        '班表列表',
    'list.range':       '日期區間',
    'list.from':        '起',
    'list.to':          '迄',
    'list.search':      '查詢',
    'list.quick.week':  '本週',
    'list.quick.14':    '未來 14 天',
    'list.quick.month': '本月',
    'list.quick.past':  '過去 14 天',
    'list.quick.all':   '全部',

    'nav.list':     '班表列表',
    'nav.accounts': '帳號管理',
    'list.liveHint':    '以下的篩選是即時的，不必重新查詢。',
    'list.keyword':     '姓名／電子郵件／房號',
    'list.keyword.ph':  '打一部分就好',
    'list.arah':        '接／送',
    'list.status':      '狀態',
    'list.all':         '全部',
    'list.more':        '更多篩選',
    'list.needOnly':    '只看有需求的',
    'list.sort':        '排序',
    'list.sort.date':   '日期',
    'list.sort.name':   '姓名',
    'list.sort.flight': '航班號',
    'list.sort.updated':'最後更新',
    'list.reset':       '清除篩選',
    'list.reload':      '重新整理',
    'list.countOf':     '{total} 筆中的 {n} 筆',
    'list.stat':        '接 {a} · 送 {b}',
    'list.empty':       '沒有符合篩選條件的資料。',
    'list.emptyHint':   '試著把部分篩選條件清掉。',
    'list.emptyRange':  '這個日期區間裡沒有任何行程。',
    'list.showMore':    '再顯示 {n} 筆',
    'list.fresh':       '資料更新於 {t}',
    'list.lag':         '剛剛直接在 Google 試算表上改的資料，最多 5 分鐘後才會出現在這裡。',
    'list.truncated':   '資料太多，只顯示離今天最近的 {n} 筆（共 {total} 筆）。請把日期區間縮小。',
    'list.sheetRaw':    '試算表上還是「{s}」',
    'list.hasReq':      '有需求',
    'list.detail':      '詳細',
    'list.close':       '收合',

    'th.date':   '日期',
    'th.arah':   '接／送',
    'th.name':   '姓名',
    'th.flight': '航班',
    'th.pickup': '出廠時間',
    'th.titik':  '上車地點',
    'th.status': '狀態',
    'th.detail': '詳細',

    'f.factory':     '廠別',
    'f.custom':      'CUSTOM',
    'f.povs':        'POVS',
    'f.group':       '同行群組',
    'f.emailKontak': '聯絡人信箱',
    'f.updated':     '最後更新',
    'f.booking':     '編號',
    'f.sheet':       '分頁位置',

    'err.dateRange': '「起」不可以晚於「迄」。',
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
  /* ⚠️ 這一支只服務**使用者端**（js/query.js）。
     管理端的錯誤代碼走 js/admin-accounts.js 的 tAccountError
     → js/admin-session.js 的 tAdminError，那邊已經翻好了。
     不要在這裡再翻一份——同一個代碼兩份翻譯，改了一邊忘了另一邊，
     使用者會看到兩種不同的說法，而且沒有人查得出為什麼。 */
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
  lines.forEach(function (line) {
    const row = document.createElement('div');
    row.textContent = line;          // 垂直排列時行尾不加分隔號——它沒有分隔到東西
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
