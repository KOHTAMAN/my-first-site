// 止める層：Claude Code が操作する「直前」に動く検査です。
// ここで止めた操作は、Claude Code が何を考えていても実行されません。
// 止めた理由と直し方は、Claude Code にもそのまま伝わります。
//
// 止めているもの（設定は .claude/harness.json）
//   1. 鍵（APIキー・パスワード）の入ったファイルを読む・書く
//   2. 鍵そのものをファイルやコマンドに書く
//   3. フォルダごと消す・作業を巻き戻して消す・main に直接送る・強制送信
//   4. 「書き足すだけのファイル」の行を消す・書き換える
//   5. 事業メモ（docs/business/）にメールアドレス・電話番号を書く
//   6. 要約（hot.md）が上限の行数を超える

import { readFileSync, existsSync } from "node:fs";
import { join, relative, isAbsolute } from "node:path";

const input = readJson(0) ?? {};
const tool = input.tool_name ?? "";
const t = input.tool_input ?? {};
const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
const config = readJson(join(root, ".claude/harness.json")) ?? {};

const appendOnly = config["書き足すだけのファイル"] ?? [];
const hotFile = config["要約のファイル"] ?? "docs/business/hot.md";
const hotMax = config["要約の上限行数"] ?? 40;
const safeDirs = config["消してよいフォルダ"] ?? [".next", "node_modules", "out", ".tmp"];

const SECRETS = [
  [/sk-ant-[A-Za-z0-9_-]{20,}/, "Anthropic の APIキー"],
  [/\bsk-(proj-)?[A-Za-z0-9_-]{20,}/, "OpenAI の APIキー"],
  [/\b[sr]k_live_[A-Za-z0-9]{10,}/, "Stripe の本番キー"],
  [/\bAKIA[0-9A-Z]{16}\b/, "AWS のキー"],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}/, "GitHub のトークン"],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}/, "Slack のトークン"],
  [/\bAIza[0-9A-Za-z_-]{35}\b/, "Google の APIキー"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "秘密鍵"],
];

function readJson(src) {
  try {
    return JSON.parse(readFileSync(src, "utf8"));
  } catch {
    return null;
  }
}

function stop(reason) {
  process.stderr.write(`【止める層で止めました】${reason}\n（この決まりは .claude/harness.json と .claude/hooks/stop.mjs にあります）\n`);
  process.exit(2);
}

function rel(p) {
  if (!p) return "";
  const r = isAbsolute(p) ? relative(root, p) : p;
  return r.replaceAll("\\", "/").replace(/^\.\//, "");
}

const isEnvFile = (p) => /(^|\/)\.env(\.[^/]*)?$/.test(p) && !/\.env\.example$/.test(p);
const lines = (s) => String(s ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

function checkSecrets(text) {
  for (const [re, name] of SECRETS) {
    if (re.test(text)) {
      stop(`${name}らしき文字列を書こうとしています。鍵はファイルに書かず、Vercel の「Environment Variables」に入れてください。`);
    }
  }
}

// --- コマンド ---------------------------------------------------------------
if (tool === "Bash") {
  const cmd = String(t.command ?? "");
  checkSecrets(cmd);

  if (/\b(cat|less|more|head|tail|grep|sed|awk|source|cp|mv)\b[^|;&]*\.env(\.(local|production|development))?(\s|$|["'])/.test(cmd)) {
    stop("鍵の入ったファイル（.env）をコマンドで読もうとしています。鍵の中身は Claude Code に見せません。");
  }
  if (/\bgit\s+push\b[^;&|]*(\s-f\b|--force)/.test(cmd)) {
    stop("強制送信（git push --force）は、ほかの人や過去の変更を上書きします。使いません。");
  }
  if (/\bgit\s+push\b[^;&|]*[\s:](main|master)(\s|$)/.test(cmd)) {
    stop("main に直接送ろうとしています。ブランチに送って PR を作り、人が差分を見てから Merge してください。");
  }
  if (/\bgit\s+(reset\s+--hard|clean\s+-[a-zA-Z]*f|checkout\s+--\s+\.|restore\s+\.)/.test(cmd)) {
    stop("まだ保存していない変更がまとめて消える操作です。戻したいときは、PR を閉じるか、GitHub で Revert してください。");
  }
  // コマンドを && ; || 改行 で区切り、そのファイルを書き換える区切りだけを止める
  // （コミットメッセージの <noreply@anthropic.com> の > などで誤って止めないため）
  const segs = cmd.replace(/\d*>&\d|\d*>\s*\/dev\/null/g, "").split(/&&|\|\||;|\n/);
  for (const f of appendOnly) {
    for (const c of segs) {
      if (!c.includes(f)) continue;
      const overwrite = [...c.matchAll(/(?:^|[^>])>(?!>)\s*["']?([^\s"';|&<>]+)/g)].some((m) => m[1].includes(f));
      if (overwrite || /\btruncate\b|\b(sed|perl)\s+-i|^\s*(mv|cp)\s|\bgit\s+(checkout|restore)\b/.test(c)) {
        stop(`${f} は「書き足すだけのファイル」です。コマンドで上書き・移動・巻き戻しはしません。新しい行を足すだけにしてください。`);
      }
    }
  }
  const rm = cmd.match(/\brm\s+((?:-[a-zA-Z]+\s+)*)([^;&|]*)/);
  if (rm) {
    const flags = rm[1];
    const targets = rm[2].split(/\s+/).filter(Boolean).map((x) => rel(x.replace(/["']/g, "")).replace(/\/$/, ""));
    if (targets.some((x) => x.startsWith("docs/business"))) {
      stop("事業メモ（docs/business/）は消しません。不要な行があれば、人が GitHub の画面で直してください。");
    }
    if (/[rR]/.test(flags) && !targets.every((x) => safeDirs.includes(x))) {
      stop(`フォルダごと消すコマンドです。消してよいのは ${safeDirs.join("・")} だけです。ほかを消す必要があるなら、消す前に一覧を見せて人に聞いてください。`);
    }
  }
  process.exit(0);
}

// --- 読む --------------------------------------------------------------------
const path = rel(t.file_path);
if (tool === "Read") {
  if (isEnvFile(path)) stop("鍵の入ったファイル（.env）は読みません。必要な設定の名前だけ人に聞いてください。");
  process.exit(0);
}

// --- 書く・直す ----------------------------------------------------------------
if (tool !== "Write" && tool !== "Edit" && tool !== "MultiEdit") process.exit(0);

if (isEnvFile(path)) stop("鍵の入ったファイル（.env）は書きません。鍵は Vercel の「Environment Variables」に入れてください。");

const edits = tool === "Write" ? [] : tool === "Edit" ? [t] : (t.edits ?? []);
const newText = tool === "Write" ? String(t.content ?? "") : edits.map((e) => e.new_string ?? "").join("\n");
checkSecrets(newText);

const abs = join(root, path);
const current = existsSync(abs) ? readFileSync(abs, "utf8") : "";

if (appendOnly.includes(path) && current) {
  const removed =
    tool === "Write"
      ? lines(current).filter((l) => !lines(newText).includes(l))
      : edits.flatMap((e) => lines(e.old_string).filter((l) => !lines(e.new_string).includes(l)));
  if (removed.length) {
    stop(`${path} は「書き足すだけのファイル」です。今ある行を消す・書き換えることはしません（例: 「${removed[0].slice(0, 40)}」）。新しい行を足すだけにしてください。直す必要があるなら、人が GitHub の画面で直します。`);
  }
}

if (path.startsWith("docs/business/")) {
  if (/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(newText) || /0\d{1,4}-\d{1,4}-\d{3,4}|\b0[789]0\d{8}\b/.test(newText)) {
    stop("事業メモにメールアドレスか電話番号を書こうとしています。公開のリポジトリは誰でも読めます。連絡先は書かず、人の名前は「教室長Aさん」のように伏せてください。");
  }
}

if (path === hotFile) {
  let after = newText;
  if (tool !== "Write") {
    after = current;
    for (const e of edits) {
      after = e.replace_all ? after.split(e.old_string).join(e.new_string) : after.replace(e.old_string, e.new_string);
    }
  }
  const n = after.split(/\r?\n/).length;
  if (n > hotMax) {
    stop(`${hotFile} が ${n} 行になります（上限 ${hotMax} 行）。要約は書き足すのではなく、古いものを削って入れ替えてください。詳しい記録は customer-voice.md と decisions.md に残っています。`);
  }
}

process.exit(0);
