/**
 * Config.js — 常數與欄位定義
 *
 * ⚠️ 這個檔案就是「資料結構的定義」。
 *    改動 XXX_COLUMNS 等於改資料結構，改之前先看 CLAUDE.md 的設計約定。
 *    新增欄位時請加在陣列**最後面**，並標 optional: true，
 *    這樣程式可以先部署（該欄位暫時不顯示），使用者跑完升級才生效，
 *    中間不會有「功能全壞」的空窗期。
 */

var SYSTEM_INFO = {
  name: '機場接送系統',
  version: '0.5',
  timezone: 'Asia/Jakarta',
  locale: 'id_ID'
};

/** 一週的第一天：2 = 星期二（沿用 airport.xls 的慣例，週二 ~ 週一） */
var WEEK_START_DOW = 2;

/** 印尼文月份縮寫，用來組週分頁名稱 */
var BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

var SHEETS = {
  INDEX:   '_INDEX',
  PERSON:  'DAFTAR PERSONEL',
  FLIGHT:  'JADWAL PENERBANGAN',
  VEHICLE: 'DAFTAR KENDARAAN',
  SETTING: 'PENGATURAN',
  ADMIN:   'ADMIN',
  LOG:     'LOG',
  IMPORT:  '_IMPORT'
};

/** 資料列從第幾列開始（第 1 列是表頭） */
var FIRST_DATA_ROW = 2;

/** 建立分頁時預先套用格式與驗證的列數 */
var PREP_ROWS_WEEK   = 200;
var PREP_ROWS_ROSTER = 500;


/* ────────────────────────────────────────────────────────────────
   下拉選單的固定選項

   ⚠️ Sheet 上存的是「雙語顯示文字」，程式讀進來要立刻映射成代碼。
      映射表就在下面的 CODE_OF，全專案只有這一個地方。
      這一點刻意違反 KANTIN 設計約定第 1 條，理由見 docs/規格書_v1.md 5.5
   ──────────────────────────────────────────────────────────────── */

/**
 * ⚠️ 接／送只寫印尼文，不加中文。
 *    表頭已經是「JEMPUT 接 / 送 ANTAR」，每一格再寫一次中文是重複的，
 *    而且原始 airport.xls 本來就只寫 Jemput / Antar。
 */
var LIST_ARAH   = ['Jemput', 'Antar'];
var LIST_STATUS = ['Terjadwal 已排定', 'Selesai 已完成', 'Diundur 已改期',
                   'Menunggu 待定', 'Batal 已取消'];
var LIST_YESNO  = ['YES', 'NO'];
var LIST_YATIDAK = ['Ya 是', 'Tidak 否'];
var LIST_TIPE   = ['Karyawan 員工', 'Keluarga 眷屬', 'Tamu 訪客'];
var LIST_JENIS  = ['Kedatangan 抵達', 'Keberangkatan 起飛'];

var CODE_OF = {
  'Jemput':           'PICKUP',
  'Antar':            'DROPOFF',
  // ↓ 舊寫法。轉檔匯入的 89 筆原本長這樣，migrateArahLabels() 已經改掉了。
  //   這兩行留著當安全網：日後有人從舊檔案貼資料進來，程式照樣讀得懂，不會變成未知值。
  'Jemput 接機':      'PICKUP',
  'Antar 送機':       'DROPOFF',
  'Terjadwal 已排定': 'SCHEDULED',
  'Selesai 已完成':   'DONE',
  'Diundur 已改期':   'POSTPONED',
  'Menunggu 待定':    'PENDING',
  'Batal 已取消':     'CANCELLED',
  'Karyawan 員工':    'STAFF',
  'Keluarga 眷屬':    'FAMILY',
  'Tamu 訪客':        'GUEST',
  'Kedatangan 抵達':  'ARRIVAL',
  'Keberangkatan 起飛': 'DEPARTURE',
  'Ya 是':            'Y',
  'Tidak 否':         'N',
  'YES':              'Y',
  'NO':               'N'
};


/* ────────────────────────────────────────────────────────────────
   欄位定義

   format 說明：
     '@'          純文字（Sheet 不會自作主張判斷型別）
     'dd/mm/yyyy' 真正的日期值，用這個格式顯示
   check 說明：
     'time'       只允許 HH:MM
     'daripci'    允許 HH:MM 或 dd/mm HH:MM
     'date'       必須是日期
   ──────────────────────────────────────────────────────────────── */

/**
 * 主表（週分頁）。
 * ⚠️ A~Q（前 17 欄）比照 airport.xls，順序與標題一格都不能動。
 *    R~Y（後 8 欄）是新增的，hidden: true，隱藏後畫面與列印跟原檔一模一樣。
 */
var MAIN_COLUMNS = [
  { code: 'tanggal',      name: 'DATE PESAWAT',            width: 110, format: 'dd/mm/yyyy', check: 'date' },
  { code: 'arah',         name: 'JEMPUT 接 / 送 ANTAR',    width: 130, list: LIST_ARAH },
  { code: 'factory',      name: '廠別 FACTORY',            width: 100, format: '@', listFrom: 'FACTORY' },
  { code: 'dept',         name: 'DEPT',                    width: 110, format: '@', listFrom: 'DEPT' },
  { code: 'name',         name: 'NAME',                    width: 150, format: '@' },
  { code: 'nama_cina',    name: '中文名字 NAMA CINA',       width: 110, format: '@' },
  { code: 'custom',       name: 'CUSTOM',                  width: 80,  list: LIST_YESNO },
  { code: 'hp',           name: '手機號碼 HP',              width: 130, format: '@' },
  { code: 'dari_pci',     name: '出廠時間 DARI PCI',        width: 120, format: '@', check: 'daripci' },
  { code: 'flight',       name: 'FLIGHT',                  width: 90,  format: '@' },
  { code: 'etd_eta',      name: 'ETD/ETA',                 width: 90,  format: '@', check: 'time' },
  { code: 'dorm',         name: 'DORM',                    width: 90,  format: '@' },
  { code: 'titik_jemput', name: '上車地點 TITIK JEMPUT',    width: 130, format: '@', listFrom: 'TITIK_JEMPUT' },
  { code: 'email',        name: '郵件 EMAIL',               width: 200, format: '@' },
  { code: 'bagasi',       name: '行李 BAGASI',              width: 110, format: '@' },
  { code: 'povs',         name: 'POVS',                    width: 80,  format: '@' },
  { code: 'remark',       name: 'REMARK',                  width: 200, format: '@' },

  { code: 'booking_id',   name: 'booking_id',              width: 100, format: '@', hidden: true },
  { code: 'status',       name: 'STATUS',                  width: 130, list: LIST_STATUS, hidden: true },
  { code: 'permintaan',   name: 'PERMINTAAN 員工需求',      width: 200, format: '@', hidden: true },
  { code: 'email_kontak', name: 'EMAIL KONTAK 聯絡人信箱',  width: 180, format: '@', hidden: true },
  { code: 'group_id',     name: 'group_id 同行群組',        width: 100, format: '@', hidden: true },
  { code: 'tanggal_asal', name: 'TANGGAL ASAL 原訂日期',    width: 120, format: 'dd/mm/yyyy', hidden: true },
  { code: 'updated_at',   name: '最後更新時間',              width: 140, format: '@', hidden: true },
  { code: 'updated_by',   name: '更新者',                   width: 120, format: '@', hidden: true },

  /* ── 派車資訊（2026-09-02 加入）──────────────────────────────
     這三欄的**介面還沒做**，是刻意先把資料結構準備好：
     欄位現在加幾乎免費，日後才加要付一次「功能全壞的空窗期」的代價
     （設計約定第 12 條）。標 optional 讓程式在找不到它們時不丟例外，
     所以就算有人手動刪掉這幾欄，其他功能也不會一起壞。

     主表存快照（設計約定第 4 條）：日後換司機，過去的紀錄還是當時
     實際開車的那一位。車號打進去之後司機與電話由車輛名冊自動帶入。 */
  { code: 'kendaraan',    name: 'NO. KENDARAAN 車號',       width: 130, format: '@', hidden: true, optional: true },
  { code: 'sopir',        name: 'SOPIR 司機',               width: 130, format: '@', hidden: true, optional: true },
  { code: 'hp_sopir',     name: 'HP SOPIR 司機電話',        width: 140, format: '@', hidden: true, optional: true }
];

/**
 * 車輛名冊。跟人員名冊、航班名冊同一個模式：
 * 主表只打車號，司機與電話自動帶出來，不必每建一筆接送就重打一次。
 * ⚠️ 介面還沒做，這張表現在是空的，等決定啟用派車功能時才會用到。
 */
var VEHICLE_COLUMNS = [
  { code: 'kendaraan_id', name: 'kendaraan_id',            width: 110, format: '@', hidden: true },
  { code: 'kendaraan',    name: 'NO. KENDARAAN 車號',       width: 140, format: '@' },
  { code: 'sopir',        name: 'SOPIR 司機',               width: 150, format: '@' },
  { code: 'hp_sopir',     name: 'HP SOPIR 司機電話',        width: 150, format: '@' },
  { code: 'keterangan',   name: 'KETERANGAN 說明',          width: 250, format: '@' },
  { code: 'aktif',        name: 'AKTIF 啟用',               width: 90,  list: LIST_YATIDAK }
];

/** 人員名冊。EMAIL 允許重複（眷屬與員工共用），person_id 才是唯一識別。 */
var PERSON_COLUMNS = [
  { code: 'person_id',  name: 'person_id',                 width: 90,  format: '@', hidden: true },
  { code: 'email',      name: 'EMAIL 電子郵件',             width: 220, format: '@' },
  { code: 'name',       name: 'NAME 英文姓名',              width: 160, format: '@' },
  { code: 'nama_cina',  name: 'NAMA CINA 中文姓名',         width: 120, format: '@' },
  { code: 'dept',       name: 'DEPT 部門代碼',              width: 120, format: '@' },
  { code: 'factory',    name: 'FACTORY 廠別',               width: 100, format: '@' },
  { code: 'dorm',       name: 'DORM 房間號碼',              width: 100, format: '@' },
  { code: 'hp',         name: 'HP 手機號碼',                width: 140, format: '@' },
  { code: 'tipe',       name: 'TIPE 身分別',                width: 130, list: LIST_TIPE },
  { code: 'email_notif', name: 'EMAIL NOTIFIKASI 通知信箱', width: 200, format: '@' },
  { code: 'aktif',      name: 'AKTIF 啟用',                 width: 90,  list: LIST_YATIDAK }
];

/** 航班名冊。FLIGHT 是主鍵，寫入前一律去空格並轉大寫。 */
var FLIGHT_COLUMNS = [
  { code: 'flight', name: 'FLIGHT 航班號', width: 110, format: '@' },
  { code: 'jenis',  name: 'JENIS 類型',    width: 150, list: LIST_JENIS },
  { code: 'waktu',  name: 'WAKTU 時間',    width: 100, format: '@', check: 'time' },
  { code: 'aktif',  name: 'AKTIF 啟用',    width: 90,  list: LIST_YATIDAK }
];

/** 選項設定。所有下拉選單的來源、系統信收件人、各種門檻都放這裡。 */
var SETTING_COLUMNS = [
  { code: 'kategori',  name: 'KATEGORI 類別',   width: 160, format: '@' },
  { code: 'nilai',     name: 'NILAI 值',        width: 220, format: '@' },
  { code: 'keterangan', name: 'KETERANGAN 說明', width: 320, format: '@' },
  { code: 'aktif',     name: 'AKTIF 啟用',      width: 90,  list: LIST_YATIDAK }
];

/** 管理者帳號。⚠️ 任何密碼都不可以寫進程式碼，帳號由 Admins.js 產生。 */
var ADMIN_COLUMNS = [
  { code: 'account',        name: 'account',        width: 200, format: '@' },
  { code: 'name',           name: 'name',           width: 150, format: '@' },
  { code: 'role',           name: 'role',           width: 90,  format: '@' },
  { code: 'password_hash',  name: 'password_hash',  width: 140, format: '@' },
  { code: 'password_salt',  name: 'password_salt',  width: 140, format: '@' },
  { code: 'status',         name: 'status',         width: 90,  format: '@' },
  { code: 'must_change',    name: 'must_change_password', width: 120, format: '@' },
  { code: 'pwd_changed_at', name: 'password_changed_at',  width: 150, format: '@' },
  { code: 'last_login_at',  name: 'last_login_at',  width: 150, format: '@' },
  { code: 'failed_count',   name: 'failed_count',   width: 90,  format: '@' },
  { code: 'locked_until',   name: 'locked_until',   width: 150, format: '@' }
];

var LOG_COLUMNS = [
  { code: 'waktu',   name: '時間',   width: 150, format: '@' },
  { code: 'sumber',  name: '來源',   width: 140, format: '@' },
  { code: 'level',   name: '等級',   width: 80,  format: '@' },
  { code: 'pesan',   name: '訊息',   width: 320, format: '@' },
  { code: 'detail',  name: '詳細',   width: 400, format: '@' }
];

/**
 * _INDEX：把所有週分頁攤平成一張表，只給查詢用。
 * ⚠️ 這是衍生資料，永遠只能由程式從週分頁單向產生，不可反向寫回。
 *    壞了重算一次就好（見 CLAUDE.md 設計約定第 1 條）。
 */
var INDEX_COLUMNS = [
  { code: 'booking_id',   name: 'booking_id',   width: 100, format: '@' },
  { code: 'sheet_name',   name: 'sheet_name',   width: 160, format: '@' },
  { code: 'row_num',      name: 'row_num',      width: 80,  format: '@' },
  { code: 'tanggal_iso',  name: 'tanggal_iso',  width: 110, format: '@' },
  { code: 'arah_code',    name: 'arah_code',    width: 90,  format: '@' },
  { code: 'status_code',  name: 'status_code',  width: 100, format: '@' },
  { code: 'flight',       name: 'flight',       width: 90,  format: '@' },
  { code: 'etd_eta',      name: 'etd_eta',      width: 90,  format: '@' },
  { code: 'dari_pci',     name: 'dari_pci',     width: 110, format: '@' },
  { code: 'pickup_iso',   name: 'pickup_iso',   width: 160, format: '@' },
  { code: 'dept',         name: 'dept',         width: 110, format: '@' },
  { code: 'factory',      name: 'factory',      width: 100, format: '@' },
  { code: 'name',         name: 'name',         width: 150, format: '@' },
  { code: 'nama_cina',    name: 'nama_cina',    width: 110, format: '@' },
  { code: 'dorm',         name: 'dorm',         width: 90,  format: '@' },
  { code: 'titik_jemput', name: 'titik_jemput', width: 130, format: '@' },
  { code: 'email',        name: 'email',        width: 200, format: '@' },
  { code: 'email_kontak', name: 'email_kontak', width: 200, format: '@' },
  { code: 'hp',           name: 'hp',           width: 130, format: '@' },
  { code: 'custom',       name: 'custom',       width: 80,  format: '@' },
  { code: 'bagasi',       name: 'bagasi',       width: 110, format: '@' },
  { code: 'povs',         name: 'povs',         width: 80,  format: '@' },
  { code: 'remark',       name: 'remark',       width: 200, format: '@' },
  { code: 'permintaan',   name: 'permintaan',   width: 200, format: '@' },
  { code: 'group_id',     name: 'group_id',     width: 100, format: '@' },
  { code: 'tanggal_asal', name: 'tanggal_asal', width: 110, format: '@' },
  { code: 'kendaraan',    name: 'kendaraan',    width: 130, format: '@' },
  { code: 'sopir',        name: 'sopir',        width: 130, format: '@' },
  { code: 'hp_sopir',     name: 'hp_sopir',     width: 140, format: '@' },
  { code: 'updated_at',   name: 'updated_at',   width: 140, format: '@' }
];

/** 選項設定的初始內容（來自 airport.xls 的 89 筆資料） */
var SETTING_SEED = [
  ['FACTORY',       'Adidas',       '廠別。新增廠別時往下加一列', 'Ya 是'],
  ['DEPT',          '5010070017',   '部門代碼', 'Ya 是'],
  ['DEPT',          '502Z039000',   '部門代碼', 'Ya 是'],
  ['DEPT',          '5100070020',   '部門代碼', 'Ya 是'],
  ['DEPT',          '5310082000',   '部門代碼', 'Ya 是'],
  ['TITIK_JEMPUT',  'KANTIN GSG1',  '上車地點', 'Ya 是'],
  ['TITIK_JEMPUT',  'KANTIN GSG2',  '上車地點', 'Ya 是'],
  ['TITIK_JEMPUT',  'LAPANGAN GOLF', '上車地點', 'Ya 是'],
  ['TITIK_JEMPUT',  'BUNGALOW 5',   '上車地點', 'Ya 是'],
  ['TITIK_JEMPUT',  'OFFICE ROB',   '上車地點', 'Ya 是'],
  ['TITIK_JEMPUT',  'OFFICE UOB',   '上車地點', 'Ya 是'],
  ['TITIK_JEMPUT',  'Pos aDCI',     '上車地點。來自原始資料的唯一一筆，用不到就把 AKTIF 改成 Tidak 否', 'Ya 是'],
  ['EMAIL_SISTEM',  '',             '每日系統信收件人。⚠️ 至少填 2 個（一人休假時要有人接手），一列一個信箱', 'Ya 是'],
  ['EMAIL_SISTEM',  '',             '每日系統信收件人（第 2 個）', 'Ya 是'],
  ['HARI_MENUNGGU', '3',            '「待定」超過幾天要在系統信裡標紅色', 'Ya 是'],
  ['JAM_KUNCI',     '12',           '出發前幾小時鎖定，使用者不能再改需求', 'Ya 是']
];
