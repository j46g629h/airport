# -*- coding: utf-8 -*-
"""
airport.xls  ->  新結構 CSV（一次性轉檔）

用法（在專案根目錄）：
    python tools/convert.py

產出（全部在 data/，data/ 已列入 .gitignore）：
    data/接送資料_轉檔.csv    89 筆，新欄位結構（A~Y），含 _分頁 欄
    data/人員名冊_初版.csv     從資料抽出的人員
    data/航班名冊_初版.csv     從資料抽出的航班號與時間
    data/轉檔檢查報告.txt      修正了什麼、哪些需要人工確認

為什麼這支是 Python 不是 Node：
   airport.xls 是 1997-2003 的舊格式（BIFF8），Node 要讀它必須另外裝套件，
   而 Python 的 xlrd 已經裝好且能直接讀。這是一次性工作，跑完就不再用到，
   不值得為它在專案裡引進 node_modules。日後的常態工具一律用 Node。

這支程式只讀 airport.xls，絕對不會修改它。
"""
import os, re, csv, sys, datetime, collections

try:
    import xlrd
except ImportError:
    print('缺少 xlrd 套件，請先執行：  python -m pip install xlrd')
    sys.exit(1)

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(BASE, 'airport.xls')
OUT = os.path.join(BASE, 'data')
TODAY = datetime.date.today()
NOW = datetime.datetime.now().strftime('%d/%m/%Y %H:%M')

# 來源欄位索引
C_DATE, C_DIR, C_FAC, C_DEPT, C_NAME, C_CN, C_CUSTOM, C_HP = 0, 1, 2, 3, 4, 5, 6, 7
C_PCI, C_FLIGHT, C_ETD, C_DORM, C_PICKUP, C_EMAIL, C_BAG, C_POVS, C_REMARK = 8, 9, 10, 11, 12, 13, 14, 15, 16

INTERNAL_DOMAINS = ('pouchen.com', 'pci.co.id')

fixes = []      # 自動修正的項目
reviews = []    # 需要人工確認的項目


# -------------------------------- 小工具 --------------------------------

def txt(sh, r, c):
    v = sh.cell_value(r, c)
    return '' if v is None else str(v).strip()


def as_dt(book, sh, r, c):
    """回傳 datetime；儲存格不是日期型別就回 None。time-only 的年份會是 1899。"""
    if sh.cell_type(r, c) != 3:
        return None
    return xlrd.xldate.xldate_as_datetime(sh.cell_value(r, c), book.datemode)


def norm_dept(sh, r):
    """DEPT 一律轉成文字。Excel 把 5010070017 存成數字，直接 str() 會變 '5010070017.0'。"""
    if sh.cell_type(r, C_DEPT) == 2:
        return str(int(sh.cell_value(r, C_DEPT)))
    return txt(sh, r, C_DEPT)


def norm_flight(sh, r):
    """航班號去掉所有空格並轉大寫。資料裡有 'CZ 8056' 和 ' CZ8353'。"""
    return txt(sh, r, C_FLIGHT).replace(' ', '').upper()


def name_key(name):
    return re.sub(r'^(mr|ms|mrs)\s+', '', name.strip().lower())


# ------------------------ 出廠時間 DARI PCI 解析 ------------------------

def parse_dari_pci(book, sh, r, flight_date, who):
    """
    回傳 datetime 或 None。
    三種來源型態：
      1. 時間值（1899 基準）   -> 視為航班當天
      2. 完整日期值            -> 檢查是否為 Excel 日月顛倒誤判
      3. 文字 '08/28 20:00'    -> 兩種順序都試，取落在航班日前 0~3 天的那個
    """
    t = sh.cell_type(r, C_PCI)
    if t == 0 or txt(sh, r, C_PCI) == '':
        return None

    if t == 3:
        dt = as_dt(book, sh, r, C_PCI)
        if dt.year == 1899:
            return datetime.datetime.combine(flight_date, dt.time())

        # 完整日期：離航班日太遠就懷疑是日月被顛倒讀取
        if abs((dt.date() - flight_date).days) > 14:
            try:
                swapped = datetime.date(dt.year, dt.day, dt.month)
            except ValueError:
                swapped = None
            if swapped and 0 <= (flight_date - swapped).days <= 3:
                fixed = datetime.datetime.combine(swapped, dt.time())
                fixes.append('[日月顛倒] %s 航班日 %s：出廠時間 %s -> %s'
                             % (who, flight_date.strftime('%d/%m/%Y'),
                                dt.strftime('%d/%m/%Y %H:%M'),
                                fixed.strftime('%d/%m/%Y %H:%M')))
                return fixed
            reviews.append('[日期可疑] %s 航班日 %s：出廠時間讀到 %s，與航班日相差 %d 天，無法自動判斷'
                           % (who, flight_date.strftime('%d/%m/%Y'),
                              dt.strftime('%d/%m/%Y %H:%M'),
                              (dt.date() - flight_date).days))
        return dt

    # 文字
    raw = txt(sh, r, C_PCI)
    m = re.match(r'^(\d{1,2})[/\-.](\d{1,2})\s+(\d{1,2}):(\d{2})$', raw)
    if m:
        a, b, hh, mm = int(m.group(1)), int(m.group(2)), int(m.group(3)), int(m.group(4))
        for d, mo, label in ((b, a, 'mm/dd'), (a, b, 'dd/mm')):
            try:
                cand = datetime.date(flight_date.year, mo, d)
            except ValueError:
                continue
            if 0 <= (flight_date - cand).days <= 3:
                out = datetime.datetime.combine(cand, datetime.time(hh, mm))
                fixes.append('[手寫日期] %s 航班日 %s：出廠時間 "%s"（%s 格式）-> %s'
                             % (who, flight_date.strftime('%d/%m/%Y'), raw, label,
                                out.strftime('%d/%m/%Y %H:%M')))
                return out

    m = re.match(r'^(\d{1,2}):(\d{2})$', raw)
    if m:
        return datetime.datetime.combine(flight_date, datetime.time(int(m.group(1)), int(m.group(2))))

    reviews.append('[看不懂的出廠時間] %s 航班日 %s：原文 "%s"'
                   % (who, flight_date.strftime('%d/%m/%Y'), raw))
    return None


def fmt_dari_pci(dt, flight_date):
    """同一天只寫時間，跨日寫 dd/mm HH:MM（這一欄在 Sheet 上是純文字格式）。"""
    if dt is None:
        return ''
    if dt.date() == flight_date:
        return dt.strftime('%H:%M')
    return dt.strftime('%d/%m %H:%M')


# -------------------------------- 主流程 --------------------------------

def main():
    if not os.path.exists(SRC):
        print('找不到 %s' % SRC)
        sys.exit(1)
    os.makedirs(OUT, exist_ok=True)

    book = xlrd.open_workbook(SRC)
    rows = []

    for sh in book.sheets():
        if sh.nrows < 2:
            continue
        for r in range(1, sh.nrows):
            vals = [sh.cell_value(r, c) for c in range(sh.ncols)]
            if all((v == '' or v is None) for v in vals):
                continue                      # 空白列直接略過

            fdt = as_dt(book, sh, r, C_DATE)
            name = txt(sh, r, C_NAME)
            if fdt is None:
                reviews.append('[缺航班日期] 分頁「%s」第 %d 列：%s，整筆略過'
                               % (sh.name, r + 1, name or '(無姓名)'))
                continue
            fdate = fdt.date()
            who = name or '(無姓名)'

            flight = norm_flight(sh, r)
            if flight and flight != txt(sh, r, C_FLIGHT):
                fixes.append('[航班號空格] %s 航班日 %s："%s" -> "%s"'
                             % (who, fdate.strftime('%d/%m/%Y'), txt(sh, r, C_FLIGHT), flight))

            etd = as_dt(book, sh, r, C_ETD)
            pci = parse_dari_pci(book, sh, r, fdate, who)
            if pci and etd and pci.date() == fdate and pci.time() > etd.time():
                reviews.append('[出車晚於航班] %s 航班日 %s：出廠 %s 晚於航班 %s，是否應為前一天？'
                               % (who, fdate.strftime('%d/%m/%Y'),
                                  pci.strftime('%H:%M'), etd.strftime('%H:%M')))

            rows.append({
                'sheet': sh.name,
                'date': fdate,
                'dir': txt(sh, r, C_DIR),
                'fac': txt(sh, r, C_FAC),
                'dept': norm_dept(sh, r),
                'name': name,
                'cn': txt(sh, r, C_CN),
                'custom': txt(sh, r, C_CUSTOM) or 'NO',
                'hp': txt(sh, r, C_HP),
                'pci': pci,
                'flight': flight,
                'etd': etd.strftime('%H:%M') if etd else '',
                'dorm': txt(sh, r, C_DORM),
                'pickup': txt(sh, r, C_PICKUP),
                'email': txt(sh, r, C_EMAIL),
                'bag': txt(sh, r, C_BAG),
                'povs': txt(sh, r, C_POVS),
                'remark': txt(sh, r, C_REMARK),
            })

    # group_id：同一天、同方向、共用同一個 email 的算同一組（家屬同行 / 代訂）
    buckets = collections.defaultdict(list)
    for i, row in enumerate(rows):
        if row['email']:
            buckets[(row['date'], row['dir'], row['email'].lower())].append(i)
    gid = 0
    for key in sorted(buckets, key=lambda k: (k[0], k[1], k[2])):
        idxs = buckets[key]
        if len(idxs) > 1:
            gid += 1
            for i in idxs:
                rows[i]['group'] = 'G%03d' % gid

    # booking_id：AP + 年月 + 三碼流水號
    seq = collections.Counter()
    for row in rows:
        ym = row['date'].strftime('%y%m')
        seq[ym] += 1
        row['bid'] = 'AP%s%03d' % (ym, seq[ym])

    write_main(rows)
    persons = write_persons(rows)
    flights = write_flights(rows)
    write_report(rows, persons, flights)

    print('轉檔完成，共 %d 筆' % len(rows))
    print('  data/接送資料_轉檔.csv     %d 筆' % len(rows))
    print('  data/人員名冊_初版.csv      %d 筆' % len(persons))
    print('  data/航班名冊_初版.csv      %d 筆' % len(flights))
    print('  data/轉檔檢查報告.txt       自動修正 %d 項、待人工確認 %d 項'
          % (len(fixes), len(reviews)))


def open_csv(path):
    # UTF-8 with BOM：在 Windows 上用 Excel 直接打開也不會變亂碼
    return open(path, 'w', newline='', encoding='utf-8-sig')


def write_main(rows):
    header = ['_分頁',
              'DATE PESAWAT', 'JEMPUT 接 / 送 ANTAR', '廠別 FACTORY', 'DEPT', 'NAME',
              '中文名字 NAMA CINA', 'CUSTOM', '手機號碼 HP', '出廠時間 DARI PCI', 'FLIGHT',
              'ETD/ETA', 'DORM', '上車地點 TITIK JEMPUT', '郵件 EMAIL', '行李 BAGASI',
              'POVS', 'REMARK',
              'booking_id', 'STATUS', 'PERMINTAAN 員工需求', 'EMAIL KONTAK 聯絡人信箱',
              'group_id 同行群組', 'TANGGAL ASAL 原訂日期', '最後更新時間', '更新者']
    with open_csv(os.path.join(OUT, '接送資料_轉檔.csv')) as f:
        w = csv.writer(f)
        w.writerow(header)
        for row in rows:
            direction = 'Jemput 接機' if row['dir'].lower().startswith('jemput') else 'Antar 送機'
            status = 'Selesai 已完成' if row['date'] < TODAY else 'Terjadwal 已排定'
            w.writerow([
                row['sheet'],
                row['date'].strftime('%d/%m/%Y'), direction, row['fac'], row['dept'], row['name'],
                row['cn'], row['custom'], row['hp'], fmt_dari_pci(row['pci'], row['date']),
                row['flight'], row['etd'], row['dorm'], row['pickup'], row['email'],
                row['bag'], row['povs'], row['remark'],
                row['bid'], status, '', '', row.get('group', ''), '', NOW, '轉檔匯入',
            ])


def write_persons(rows):
    people = {}
    for row in rows:
        k = name_key(row['name'])
        if not k:
            continue
        p = people.setdefault(k, {'name': row['name'], 'emails': set(), 'remarks': set(),
                                  'cn': '', 'dept': '', 'fac': '', 'dorm': '', 'hp': ''})
        if row['email']:
            p['emails'].add(row['email'].lower())
        if row['remark']:
            p['remarks'].add(row['remark'])
        for fld in ('cn', 'dept', 'fac', 'dorm', 'hp'):
            if row[fld]:
                p[fld] = row[fld]

    # 一個 email 被幾個人用
    email_users = collections.defaultdict(set)
    for k, p in people.items():
        for e in p['emails']:
            email_users[e].add(k)

    out = []
    for k, p in people.items():
        email = sorted(p['emails'])[0] if p['emails'] else ''
        domain = email.split('@')[-1] if email else ''
        shared = len(email_users.get(email, ())) > 1

        if domain and domain not in INTERNAL_DOMAINS:
            tipe = 'Tamu 訪客'
        elif shared and not p['cn']:
            tipe = 'Keluarga 眷屬'
        else:
            tipe = 'Karyawan 員工'

        # 姓名與信箱帳號對不上 -> 可能是眷屬或代訂，請人工確認
        local = re.sub(r'[._\-]', '', email.split('@')[0].lower()) if email else ''
        nm = re.sub(r'[^a-z]', '', k)
        if local and nm and tipe == 'Karyawan 員工' and not (local[:4] in nm or nm[:4] in local):
            note = ('（備註：%s）' % ' ; '.join(sorted(p['remarks']))) if p['remarks'] else ''
            reviews.append('[身分別待確認] %s / %s：姓名與信箱帳號對不上，可能是眷屬或由他人代訂%s'
                           % (p['name'], email, note))

        out.append({'email': email, 'name': p['name'], 'cn': p['cn'], 'dept': p['dept'],
                    'fac': p['fac'], 'dorm': p['dorm'], 'hp': p['hp'], 'tipe': tipe})

    # 疑似同一個人被打成兩筆：同 email + 同中文姓名（例如 Fankie / Frankie 拼錯）
    seen = {}
    for p in out:
        if not p['cn']:
            continue
        key = (p['email'], p['cn'])
        if key in seen:
            reviews.append('[疑似重複人員] "%s" 與 "%s" 的 email、中文姓名、部門、房號、手機全部相同，'
                           '可能是同一人被打成兩筆（英文拼字不同）。確認後請刪掉其中一筆'
                           % (seen[key], p['name']))
        else:
            seen[key] = p['name']

    tipe_order = {'Karyawan 員工': 0, 'Keluarga 眷屬': 1, 'Tamu 訪客': 2}
    out.sort(key=lambda x: (x['email'], tipe_order.get(x['tipe'], 9), x['name']))
    for i, p in enumerate(out, 1):
        p['pid'] = 'P%03d' % i

    with open_csv(os.path.join(OUT, '人員名冊_初版.csv')) as f:
        w = csv.writer(f)
        # ⚠️ 欄位順序必須跟 gas/Config.js 的 PERSON_COLUMNS 一模一樣。
        #    匯入是「照位置貼」的，這裡多一欄少一欄，整排就位移。
        #    v2.3 已移除『EMAIL NOTIFIKASI 通知信箱』。
        w.writerow(['person_id', 'EMAIL 電子郵件', 'NAME 英文姓名', 'NAMA CINA 中文姓名',
                    'DEPT 部門代碼', 'FACTORY 廠別', 'DORM 房間號碼', 'HP 手機號碼',
                    'TIPE 身分別', 'AKTIF 啟用'])
        for p in out:
            w.writerow([p['pid'], p['email'], p['name'], p['cn'], p['dept'], p['fac'],
                        p['dorm'], p['hp'], p['tipe'], 'Ya 是'])
    return out


def write_flights(rows):
    info = collections.defaultdict(lambda: {'dirs': set(), 'times': collections.Counter()})
    for row in rows:
        if not row['flight']:
            continue
        info[row['flight']]['dirs'].add(row['dir'].lower())
        if row['etd']:
            info[row['flight']]['times'][row['etd']] += 1

    out = []
    for code in sorted(info):
        d = info[code]
        if 'jemput' in d['dirs'] and 'antar' in d['dirs']:
            jenis = ''
            reviews.append('[航班方向衝突] %s 同時出現在接機與送機，請確認' % code)
        elif 'jemput' in d['dirs']:
            jenis = 'Kedatangan 抵達'
        else:
            jenis = 'Keberangkatan 起飛'

        if not d['times']:
            waktu = ''
            reviews.append('[航班缺時間] %s 在資料裡沒有任何起降時間，請自行補上' % code)
        else:
            waktu = d['times'].most_common(1)[0][0]
            if len(d['times']) > 1:
                allt = ', '.join('%s（%d 次）' % (t, n) for t, n in d['times'].most_common())
                reviews.append('[航班時間不一致] %s 出現過 %s；已先採用 %s，請確認正確時間'
                               % (code, allt, waktu))
        out.append({'code': code, 'jenis': jenis, 'waktu': waktu})

    with open_csv(os.path.join(OUT, '航班名冊_初版.csv')) as f:
        w = csv.writer(f)
        w.writerow(['FLIGHT 航班號', 'JENIS 類型', 'WAKTU 時間', 'AKTIF 啟用'])
        for x in out:
            w.writerow([x['code'], x['jenis'], x['waktu'], 'Ya 是'])
    return out


def write_report(rows, persons, flights):
    L = []
    L.append('airport.xls 轉檔檢查報告')
    L.append('產生時間：%s' % NOW)
    L.append('=' * 70)
    L.append('')
    L.append('【筆數】')
    L.append('  接送資料      %d 筆（來自 %d 個週分頁）'
             % (len(rows), len(set(r['sheet'] for r in rows))))
    L.append('  人員名冊      %d 筆   員工 %d／眷屬 %d／訪客 %d'
             % (len(persons),
                sum(1 for p in persons if p['tipe'].startswith('Karyawan')),
                sum(1 for p in persons if p['tipe'].startswith('Keluarga')),
                sum(1 for p in persons if p['tipe'].startswith('Tamu'))))
    L.append('  航班名冊      %d 筆   抵達 %d／起飛 %d'
             % (len(flights),
                sum(1 for x in flights if x['jenis'].startswith('Kedatangan')),
                sum(1 for x in flights if x['jenis'].startswith('Keberangkatan'))))
    L.append('')
    L.append('【選項設定可用的清單】')
    L.append('  廠別    ：%s' % ', '.join(sorted(set(r['fac'] for r in rows if r['fac']))))
    L.append('  部門代碼：%s' % ', '.join(sorted(set(r['dept'] for r in rows if r['dept']))))
    L.append('  上車地點：%s' % (', '.join(sorted(set(r['pickup'] for r in rows if r['pickup'])))
                                or '（資料裡幾乎沒填）'))
    L.append('  房間號碼：共 %d 種' % len(set(r['dorm'] for r in rows if r['dorm'])))
    L.append('')
    L.append('=' * 70)
    L.append('【已自動修正】%d 項' % len(fixes))
    L.append('')
    for x in (fixes or ['（無）']):
        L.append('  ' + x)
    L.append('')
    L.append('=' * 70)
    L.append('【需要人工確認】%d 項' % len(reviews))
    L.append('※ 這些程式不敢自己決定，請看過之後直接在 CSV 或 Google Sheet 上修改')
    L.append('')
    for x in (reviews or ['（無）']):
        L.append('  ' + x)
    L.append('')
    with open(os.path.join(OUT, '轉檔檢查報告.txt'), 'w', encoding='utf-8-sig') as f:
        f.write('\n'.join(L))


if __name__ == '__main__':
    main()
