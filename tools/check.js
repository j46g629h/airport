/**
 * check.js — 發布前的自動檢查
 *
 *   node tools/check.js
 *
 * 改完任何程式碼都可以跑，不會動到任何檔案。
 * tools/release.js 在發布前會自動跑一次，沒過就不會 push。
 *
 * 檢查五項，每一項都對應一個實際踩過的坑：
 *
 *   1. 語法          — 基本盤
 *   2. 重複的函式名稱 — node --check 抓得到重複的 const，**但抓不到重複的 function**
 *                      （重複的函式宣告在 JS 裡合法，後面那個會無聲蓋掉前面那個）。
 *                      Apps Script 所有檔案共用同一個全域範圍，撞名一定出事
 *   3. 控制字元      — 實際踩過：字串裡的空格變成 NUL，node --check 放行，
 *                      貼進 Apps Script 卻 SyntaxError，而編輯器完全看不出來
 *   4. 版本號一致    — KANTIN 設計約定第 5 條。漏改一處，使用者會拿到舊的 JS
 *                      配新的 API，畫面用「錯誤的方式」壞掉
 *   5. 個資檔案      — .gitignore 有沒有真的擋住 airport.xls 與 data/
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');     // ⚠️ 不可寫死絕對路徑，macOS 上會爆掉
const problems = [];
const notes = [];

function fail(msg) { problems.push(msg); }
function ok(msg) { notes.push('  ✓ ' + msg); }

function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function listJs(dir) {
  const d = path.join(ROOT, dir);
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d).filter(f => f.endsWith('.js')).map(f => dir + '/' + f);
}


/* ── 1. 語法 ────────────────────────────────────────────── */

function checkSyntax() {
  // 後端：串起來一起檢查，模擬 Apps Script 的共用全域範圍
  // （這樣才抓得到跨檔案的重複 const / let 宣告）
  const gasFiles = listJs('gas');
  try {
    new vm.Script(gasFiles.map(read).join('\n'), { filename: 'gas/*.js' });
    ok('後端 ' + gasFiles.length + ' 個檔案串接後語法正確');
  } catch (e) {
    fail('後端語法錯誤：' + e.message);
  }

  // 前端：各自獨立檢查（瀏覽器是分開載入的）
  listJs('js').concat(listJs('tools')).forEach(f => {
    try {
      new vm.Script(read(f), { filename: f });
    } catch (e) {
      fail(f + ' 語法錯誤：' + e.message);
    }
  });
  ok('前端與工具程式語法正確');
}


/* ── 2. 重複的函式名稱 ──────────────────────────────────── */

function checkDuplicateFunctions() {
  const seen = {};
  const dups = [];
  listJs('gas').forEach(f => {
    const src = read(f);
    const re = /^function\s+([A-Za-z0-9_$]+)/gm;
    let m;
    while ((m = re.exec(src)) !== null) {
      const name = m[1];
      if (seen[name]) dups.push(name + '（' + seen[name] + ' 與 ' + f + '）');
      else seen[name] = f;
    }
  });
  if (dups.length) {
    fail('後端有重複的函式名稱（後面的會無聲蓋掉前面的）：\n      ' + dups.join('\n      '));
  } else {
    ok('後端沒有重複的函式名稱（共 ' + Object.keys(seen).length + ' 支）');
  }
}


/* ── 3. 控制字元 ────────────────────────────────────────── */

function checkControlChars() {
  const files = listJs('gas').concat(listJs('js'), listJs('tools'),
    fs.readdirSync(ROOT).filter(f => f.endsWith('.html')),
    fs.existsSync(path.join(ROOT, 'css')) ? ['css/style.css'] : []);

  let bad = 0;
  files.forEach(f => {
    read(f).split('\n').forEach((line, i) => {
      for (let j = 0; j < line.length; j++) {
        const c = line.charCodeAt(j);
        if (c < 32 && c !== 9 && c !== 13) {
          fail(f + ' 第 ' + (i + 1) + ' 行第 ' + (j + 1) + ' 字有控制字元 0x' + c.toString(16));
          bad++;
        }
      }
    });
  });
  if (!bad) ok('沒有隱形的控制字元（' + files.length + ' 個檔案）');
}


/* ── 4. 版本號一致 ──────────────────────────────────────── */

function readVersions() {
  const out = { html: {}, js: null, gas: null };

  fs.readdirSync(ROOT).filter(f => f.endsWith('.html')).forEach(f => {
    const vs = [...read(f).matchAll(/(?:href|src)="[^"]*\?v=([0-9.]+)"/g)].map(m => m[1]);
    out.html[f] = [...new Set(vs)];
  });

  const jm = read('js/config.js').match(/version:\s*'([^']+)'/);
  out.js = jm ? jm[1] : null;
  const gm = read('gas/Config.js').match(/version:\s*'([^']+)'/);
  out.gas = gm ? gm[1] : null;

  return out;
}

function checkVersions() {
  const v = readVersions();

  if (!v.js) return fail('js/config.js 找不到 SYSTEM_INFO.version');
  if (!v.gas) return fail('gas/Config.js 找不到 SYSTEM_INFO.version');
  if (v.js !== v.gas) {
    return fail('版本號對不上：js/config.js 是 ' + v.js + '，gas/Config.js 是 ' + v.gas +
                '\n      （後端也要一份，是因為系統信由 Apps Script 產生，它讀不到前端檔案）');
  }

  Object.keys(v.html).forEach(f => {
    const vs = v.html[f];
    if (!vs.length) return fail(f + ' 沒有任何 ?v= 版本號');
    if (vs.length > 1) return fail(f + ' 同一個檔案裡有兩種版本號：' + vs.join('、'));
    if (vs[0] !== v.js) return fail(f + ' 的 ?v=' + vs[0] + ' 跟 SYSTEM_INFO.version（' + v.js + '）對不上');
  });

  if (!problems.length) {
    ok('版本號一致：' + v.js + '（' + Object.keys(v.html).length + ' 個 HTML ＋ 前後端 Config）');
  }
  return v.js;
}


/* ── 5. 翻譯有沒有漏 ────────────────────────────────────── */

/**
 * 兩件事：
 *   a) 印尼文與中文的字串一一對應（漏翻一句，那一句會直接印出 key，很醜）
 *   b) HTML 裡每個 data-i18n="..." 用到的 key 都真的存在
 *
 * 這種錯不會讓程式壞掉，所以測不出來——通常是使用者反映
 * 「有一句沒翻到」才發現，而那時候它已經在線上好幾天了。
 */
function checkI18n() {
  let I18N;
  try {
    // i18n.js 用 const 宣告，vm 裡取不到，所以在結尾補一個表達式當回傳值
    const src = read('js/config.js') + '\n' + read('js/i18n.js') + '\nI18N;';
    const ctx = vm.createContext({
      document: { documentElement: {}, querySelectorAll: () => [], getElementById: () => null },
      localStorage: { getItem: () => null, setItem: () => {} },
    });
    I18N = vm.runInContext(src, ctx, { filename: 'js/i18n.js' });
  } catch (e) {
    return fail('讀不到 I18N 字典：' + e.message);
  }
  if (!I18N || !I18N.id || !I18N.zh) return fail('js/i18n.js 裡找不到 I18N.id / I18N.zh');

  const idKeys = Object.keys(I18N.id);
  const zhKeys = Object.keys(I18N.zh);
  const onlyId = idKeys.filter(k => !(k in I18N.zh));
  const onlyZh = zhKeys.filter(k => !(k in I18N.id));
  if (onlyId.length) fail('這些字串只有印尼文、沒有中文：' + onlyId.join('、'));
  if (onlyZh.length) fail('這些字串只有中文、沒有印尼文：' + onlyZh.join('、'));

  // HTML 上用到但字典裡沒有的 key
  const missing = new Set();
  fs.readdirSync(ROOT).filter(f => f.endsWith('.html')).forEach(f => {
    [...read(f).matchAll(/data-i18n(?:-ph)?="([^"]+)"/g)].forEach(m => {
      if (!(m[1] in I18N.id) || !(m[1] in I18N.zh)) missing.add(f + ' → ' + m[1]);
    });
  });
  if (missing.size) fail('HTML 用到不存在的翻譯 key：\n      ' + [...missing].join('\n      '));

  if (!onlyId.length && !onlyZh.length && !missing.size) {
    ok('翻譯完整：兩種語言各 ' + idKeys.length + ' 句，HTML 用到的 key 都存在');
  }
}


/* ── 6. 個資檔案有沒有被 git 擋住 ────────────────────────── */

function checkGitignore() {
  const mustIgnore = ['airport.xls', 'data/人員名冊_初版.csv', 'data/接送資料_轉檔.csv'];
  let bad = 0;
  mustIgnore.forEach(f => {
    if (!fs.existsSync(path.join(ROOT, f))) return;       // 檔案不在就跳過
    try {
      execSync('git check-ignore -q "' + f + '"', { cwd: ROOT, stdio: 'ignore' });
    } catch (e) {
      fail('⚠ 個資檔案沒有被 .gitignore 擋住：' + f + '（絕對不可以上傳到公開的 repo）');
      bad++;
    }
  });
  if (!bad) ok('個資檔案都被 .gitignore 擋住了');
}


/* ── 主流程 ─────────────────────────────────────────────── */

function main() {
  checkSyntax();
  checkDuplicateFunctions();
  checkControlChars();
  const version = checkVersions();
  checkI18n();
  checkGitignore();

  console.log(notes.join('\n'));
  if (problems.length) {
    console.log('\n✗ 有 ' + problems.length + ' 個問題：\n');
    problems.forEach(p => console.log('  • ' + p));
    process.exit(1);
  }
  console.log('\n✓ 全部通過（目前版本 ' + version + '）');
}

if (require.main === module) main();
module.exports = { readVersions };
