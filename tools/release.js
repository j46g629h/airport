/**
 * release.js — 一個指令完成整套發布
 *
 *   node tools/release.js 0.3 "說明"
 *   node tools/release.js 0.3 "說明" --dry-run     只印出要做什麼，不真的執行
 *
 * 它會依序做這七件事，**任何一步失敗就整個停下來**：
 *
 *   1. 檢查現在在 main 分支
 *   2. 把版本號改成 0.3（三個地方：所有 HTML 的 ?v=、js/config.js、gas/Config.js）
 *   3. 跑 tools/check.js（語法、重複函式、控制字元、版本一致、個資檔案）
 *   4. git add + commit + push        → GitHub Pages 會自動重新發布
 *   5. clasp push                     → 只在 gas/ 有改動時才做
 *   6. clasp redeploy                 → 網址不變
 *   7. 印出網址與後續要確認的事
 *
 * ══ 為什麼不做成「存檔就自動推」 ══════════════════════════
 *
 * 網站是即時上線的。存檔就推等於每按一次 Ctrl+S 就把改到一半的東西
 * 送到使用者面前，而且 git 歷史會變成一堆沒有意義的紀錄。
 * 發布應該是一個**刻意的動作**——所以這支要求你自己給版本號和說明。
 *
 * ══ 為什麼版本號一定要改 ═══════════════════════════════
 *
 * GitHub Pages 會讓瀏覽器把 CSS/JS 快取 10 分鐘。版本號沒變的話，
 * 使用者拿到的是舊的 JS 配新的 API——畫面會用「錯誤的方式」壞掉。
 * KANTIN 就踩過：API 欄位改名之後，使用者點下去整個清單消失，
 * 而且不顯示任何訊息。（設計約定第 5 條）
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const isWin = process.platform === 'win32';
// ⚠️ Windows PowerShell 上要用 clasp.cmd，直接打 clasp 會被執行原則擋掉
//    （PowerShell 優先選未簽章的 clasp.ps1）。macOS 直接用 clasp。
const CLASP = isWin ? 'clasp.cmd' : 'clasp';

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const version = args[0];
const message = args[1] || ('v' + version);

function die(msg) {
  console.error('\n✗ ' + msg + '\n');
  process.exit(1);
}

function run(cmd, opts) {
  console.log('  $ ' + cmd);
  if (DRY) return '';
  return execSync(cmd, Object.assign({ cwd: ROOT, encoding: 'utf8' }, opts || {}));
}

function quiet(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: 'utf8' }).trim();
}


/* ── 參數檢查 ───────────────────────────────────────────── */

if (!version || !/^\d+\.\d+$/.test(version)) {
  die('用法：node tools/release.js <版本> "<說明>" [--dry-run]\n' +
      '     例如：node tools/release.js 0.3 "加上管理者登入"\n' +
      '     版本格式是「數字.數字」，例如 0.3、1.0');
}


/* ── 1. 分支與版本遞增檢查 ──────────────────────────────── */

let branch;
try {
  branch = quiet('git rev-parse --abbrev-ref HEAD');
} catch (e) {
  die('這裡不是 git 專案，或 git 有問題：' + e.message);
}
if (branch !== 'main') {
  die('目前在 ' + branch + ' 分支，不是 main。發布請切回 main：git switch main');
}

const { readVersions } = require('./check.js');
const current = readVersions().js;
if (current === version) {
  die('版本號還是 ' + version + '，沒有變。\n' +
      '     版本號沒往上加的話，使用者的瀏覽器會繼續用快取裡的舊 JS（10 分鐘），\n' +
      '     舊 JS 配新 API 會讓畫面用「錯誤的方式」壞掉。請換一個新版本號。');
}
console.log('\n版本 ' + current + ' → ' + version + (DRY ? '（試跑，不會真的執行）' : ''));


/* ── 2. 改版本號 ────────────────────────────────────────── */

console.log('\n[1/6] 更新版本號');
const touched = [];

fs.readdirSync(ROOT).filter(f => f.endsWith('.html')).forEach(f => {
  const p = path.join(ROOT, f);
  const src = fs.readFileSync(p, 'utf8');
  // 只換真正的資源引用，不動註解裡提到的 ?v=
  const out = src.replace(/((?:href|src)="[^"]*\?v=)[0-9.]+(")/g, '$1' + version + '$2');
  if (out !== src) { if (!DRY) fs.writeFileSync(p, out, 'utf8'); touched.push(f); }
});

[['js/config.js', 'js/config.js'], ['gas/Config.js', 'gas/Config.js']].forEach(([rel]) => {
  const p = path.join(ROOT, rel);
  const src = fs.readFileSync(p, 'utf8');
  const out = src.replace(/(version:\s*')[^']+(')/, '$1' + version + '$2');
  if (out !== src) { if (!DRY) fs.writeFileSync(p, out, 'utf8'); touched.push(rel); }
});

console.log('  已更新 ' + touched.length + ' 個檔案：' + touched.join('、'));


/* ── 3. 檢查 ────────────────────────────────────────────── */

console.log('\n[2/6] 執行檢查');
if (DRY) {
  console.log('  $ node tools/check.js（試跑略過）');
} else {
  try {
    console.log(execSync('node tools/check.js', { cwd: ROOT, encoding: 'utf8' }));
  } catch (e) {
    console.error(e.stdout || '');
    die('檢查沒過，已停止。版本號已經改好了，修完問題再跑一次同樣的指令。');
  }
}


/* ── 4. 後端有沒有改動 ──────────────────────────────────── */

let gasChanged = true;
try {
  const changed = quiet('git status --porcelain -- gas');
  gasChanged = changed.length > 0;
} catch (e) { /* 判斷不出來就當成有改，寧可多推一次 */ }


/* ── 5. git ─────────────────────────────────────────────── */

console.log('\n[3/6] 提交並推送到 GitHub');
const status = quiet('git status --porcelain');
if (!status) {
  console.log('  沒有任何改動，略過 git');
} else {
  run('git add -A');
  run('git commit -m "v' + version + '：' + message.replace(/"/g, "'") + '"');
  run('git push');
}


/* ── 6. Apps Script ─────────────────────────────────────── */

if (!gasChanged) {
  console.log('\n[4/6] 後端沒有改動，略過 clasp push');
  console.log('[5/6] 略過 redeploy');
} else {
  console.log('\n[4/6] 推送後端');
  run(CLASP + ' push -f');

  console.log('\n[5/6] 重新部署（網址不變）');
  // 部署 ID 就是 /exec 網址裡的那一段——從 js/config.js 取，不另外存一份。
  // ⚠️ 複製一份必然會走鐘，所以這裡刻意只有一個來源。
  const m = fs.readFileSync(path.join(ROOT, 'js/config.js'), 'utf8')
              .match(/macros\/s\/([A-Za-z0-9_-]+)\/exec/);
  if (!m) die('js/config.js 裡找不到 API_URL，無法取得部署 ID');
  run(CLASP + ' redeploy ' + m[1] + ' -d "v' + version + ' ' + message.replace(/"/g, "'") + '"');
}


/* ── 7. 收尾 ────────────────────────────────────────────── */

console.log('\n[6/6] 完成\n');
console.log('  網站　：https://j46g629h.github.io/airport/');
console.log('  版本　：v' + version);
console.log('');
console.log('  ⚠️ GitHub Pages 要 1~2 分鐘才會生效。');
console.log('     手機上如果還是舊畫面，用無痕視窗開一次。');
if (gasChanged) {
  console.log('  ⚠️ 後端有改動。若這次「新增了排程」，記得回 Apps Script 執行 installTriggers()');
  console.log('     ——clasp push 只是把程式碼推上去，Google 的鬧鐘不會自己出現。');
}
console.log('');
