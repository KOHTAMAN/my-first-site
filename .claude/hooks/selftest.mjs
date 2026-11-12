// ハーネスの点検：止める層と確かめる層が、決まりどおりに動くかを試します。
// 使い方: node .claude/hooks/selftest.mjs
// ファイルは1つも書き換えません（検査に「こういう操作をしようとしている」と渡すだけです）。

import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const hot50 = Array.from({ length: 50 }, (_, i) => `- ${i}`).join("\n");

const CASES = [
  ["止める", "stop.mjs", "フォルダごと消す", { tool_name: "Bash", tool_input: { command: "rm -rf docs" } }, 2],
  ["止める", "stop.mjs", "作り直せるフォルダは消してよい", { tool_name: "Bash", tool_input: { command: "rm -rf .next" } }, 0],
  ["止める", "stop.mjs", "main に直接送る", { tool_name: "Bash", tool_input: { command: "git push origin main" } }, 2],
  ["止める", "stop.mjs", "作業用ブランチに送るのはよい", { tool_name: "Bash", tool_input: { command: "git push -u origin claude/top-page" } }, 0],
  ["止める", "stop.mjs", "名前に main を含むブランチはよい", { tool_name: "Bash", tool_input: { command: "git push -u origin claude/fix-main-heading" } }, 0],
  ["止める", "stop.mjs", "鍵のファイルを読む", { tool_name: "Read", tool_input: { file_path: ".env.local" } }, 2],
  ["止める", "stop.mjs", "鍵の見本（.env.example）は読んでよい", { tool_name: "Read", tool_input: { file_path: ".env.example" } }, 0],
  ["止める", "stop.mjs", "APIキーを書く", { tool_name: "Write", tool_input: { file_path: "app/page.tsx", content: 'const key = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz";' } }, 2],
  ["止める", "stop.mjs", "決めたことの行を書き換える", { tool_name: "Edit", tool_input: { file_path: "docs/business/decisions.md", old_string: "# 決めたこと・やめたこと", new_string: "# メモ" } }, 2],
  ["止める", "stop.mjs", "決めたことに書き足すのはよい", { tool_name: "Edit", tool_input: { file_path: "docs/business/decisions.md", old_string: "---", new_string: "---\n\n- 11/5 ボタンは1つにする（迷わせないため）" } }, 0],
  ["止める", "stop.mjs", "お客さんの声をコマンドで空にする", { tool_name: "Bash", tool_input: { command: ": > docs/business/customer-voice.md" } }, 2],
  ["止める", "stop.mjs", "お客さんの声を含むコミットはよい", { tool_name: "Bash", tool_input: { command: 'git add docs/business/customer-voice.md && git commit -m "docs: 前提を書く\n\nCo-Authored-By: Claude <noreply@anthropic.com>"' } }, 0],
  ["止める", "stop.mjs", "お客さんの声をコマンドで上書きする", { tool_name: "Bash", tool_input: { command: "cat new.md > docs/business/customer-voice.md" } }, 2],
  ["止める", "stop.mjs", "お客さんの声をコマンドで読むのはよい", { tool_name: "Bash", tool_input: { command: "tail -n 5 docs/business/customer-voice.md 2>/dev/null" } }, 0],
  ["止める", "stop.mjs", "事業メモに連絡先を書く", { tool_name: "Edit", tool_input: { file_path: "docs/business/customer-voice.md", old_string: "---", new_string: "---\n- 11/8 Aさん（tanaka@example.com）「返せていない」" } }, 2],
  ["止める", "stop.mjs", "今の要約が40行を超える", { tool_name: "Write", tool_input: { file_path: "docs/business/hot.md", content: hot50 } }, 2],
  ["確かめる", "check.mjs", "根拠のない数字", { tool_name: "Write", tool_input: { file_path: "app/x.tsx", content: "<p>導入企業500社</p>" } }, 2],
  ["確かめる", "check.mjs", "色の直書き", { tool_name: "Edit", tool_input: { file_path: "app/page.tsx", old_string: "a", new_string: 'style={{ color: "#1f5fd6" }}' } }, 2],
  ["確かめる", "check.mjs", "仮説を画面に出す", { tool_name: "Edit", tool_input: { file_path: "app/page.tsx", old_string: "a", new_string: "<p>🔮 月7.5時間</p>" } }, 2],
  ["確かめる", "check.mjs", "使わない言葉", { tool_name: "Edit", tool_input: { file_path: "app/page.tsx", old_string: "a", new_string: "<h1>業務効率化を実現</h1>" } }, 2],
  ["確かめる", "check.mjs", "変数とページ内リンクはよい", { tool_name: "Edit", tool_input: { file_path: "app/page.tsx", old_string: "a", new_string: '<a href="#faq" style={{ color: "var(--accent)" }}>よくある質問</a>' } }, 0],
  ["確かめる", "check.mjs", "globals.css の色の定義はよい", { tool_name: "Edit", tool_input: { file_path: "app/globals.css", old_string: "a", new_string: "--accent: #7A3346;" } }, 0],
  ["確かめる", "check.mjs", "画面以外のファイルは見ない", { tool_name: "Write", tool_input: { file_path: "docs/memo.md", content: "業務効率化" } }, 0],
];

let ng = 0;
const rows = [];
for (const [layer, script, name, input, want] of CASES) {
  const r = spawnSync(process.execPath, [join(here, script)], {
    input: JSON.stringify({ ...input, cwd: root }),
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
    encoding: "utf8",
  });
  const ok = r.status === want;
  if (!ok) ng++;
  rows.push(`| ${ok ? "OK" : "NG"} | ${layer} | ${name} | ${want === 2 ? "止める・指摘する" : "通す"} | ${r.status} |`);
  if (!ok && r.stderr) rows.push(`|  |  | ${r.stderr.trim().split("\n")[0].slice(0, 80)} |  |  |`);
}

console.log("| 結果 | 層 | 試したこと | 期待 | 終了コード |\n|---|---|---|---|---|\n" + rows.join("\n"));
console.log(ng ? `\n${ng} 件が期待どおりではありません。` : `\n${CASES.length} 件すべて期待どおりです。`);
process.exit(ng ? 1 : 0);
