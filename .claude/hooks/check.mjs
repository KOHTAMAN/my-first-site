// 確かめる層：Claude Code がファイルを直した「直後」に動く検査です。
// 決まりから外れていたら、どこがどう外れたかを Claude Code に伝え、直させます。
// 検査するのは、今回書き足した部分だけです（前からある部分は見ません）。
//
// 確かめているもの（設定は .claude/harness.json）
//   1. 色や大きさを直に書いていないか（DESIGN.md：app/globals.css の変数を使う）
//   2. 仮説（🔮）を画面に出していないか（CLAUDE.md 7章）
//   3. 根拠の要る数字・言い回しを書いていないか（CLAUDE.md 8章）
//   4. 「使わない言葉」を使っていないか

import { readFileSync } from "node:fs";
import { join, relative, isAbsolute, extname } from "node:path";

const input = readJson(0) ?? {};
const tool = input.tool_name ?? "";
const t = input.tool_input ?? {};
const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
const config = readJson(join(root, ".claude/harness.json")) ?? {};

const dirs = config["検査するフォルダ"] ?? ["app", "components"];
const ngWords = config["使わない言葉"] ?? [];

function readJson(src) {
  try {
    return JSON.parse(readFileSync(src, "utf8"));
  } catch {
    return null;
  }
}

const p = String(t.file_path ?? "");
const path = (isAbsolute(p) ? relative(root, p) : p).replaceAll("\\", "/").replace(/^\.\//, "");
const ext = extname(path);
if (!dirs.some((d) => path.startsWith(`${d}/`))) process.exit(0);
if (![".tsx", ".ts", ".jsx", ".js", ".css"].includes(ext)) process.exit(0);

const text =
  tool === "Write"
    ? String(t.content ?? "")
    : tool === "Edit"
      ? String(t.new_string ?? "")
      : (t.edits ?? []).map((e) => e.new_string ?? "").join("\n");

const found = [];
const add = (rule, hit, fix) => found.push(`- ${rule}: 「${hit.trim().slice(0, 40)}」 → ${fix}`);

// 1. 色・大きさの直書き（変数を定義している globals.css は除く）
if (!path.endsWith("globals.css")) {
  for (const m of text.matchAll(/(?<!href=["'])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b|\b(?:rgba?|hsla?)\(/g)) {
    add("色の直書き", m[0], "app/globals.css の色の変数（var(--accent) など）に置き換える");
    break;
  }
  for (const m of text.matchAll(/\b\d+(?:\.\d+)?px\b/g)) {
    add("大きさの直書き", m[0], "app/globals.css の余白・文字サイズの変数に置き換える");
    break;
  }
}

// 2. 仮説を画面に出さない
if (ext !== ".css" && text.includes("🔮")) {
  add("仮説（🔮）が画面に出ている", "🔮", "画面から消す。仮説は docs/ の中だけに置く");
}

// 3. 根拠の要る数字・言い回し
const CLAIMS = [
  /導入(?:企業|社数|実績|件数)[^\n]{0,6}[0-9０-９]/,
  /満足度[^\n]{0,6}[0-9０-９]+\s*[%％]/,
  /[0-9０-９][0-9０-９,，]*\s*(?:社|名|人|店舗|校)(?:以上)?(?:が|の)(?:導入|利用|満足)/,
  /(?:累計|実績)[^\n]{0,4}[0-9０-９][0-9０-９,，]*\s*(?:件|社|名|人)/,
  /No\.?\s?1|ナンバーワン|業界初|日本初|業界最安|地域最安/,
];
if (ext !== ".css") {
  for (const re of CLAIMS) {
    const m = text.match(re);
    if (m) add("根拠の要る言い回し", m[0], "docs/business/ に根拠があればその行を答える。無ければ消す");
  }
}

// 4. 使わない言葉
if (ext !== ".css") {
  for (const w of ngWords) {
    if (w && text.includes(w)) add("使わない言葉", w, "お客さんの言葉（docs/business/customer-voice.md）に言い換える");
  }
}

if (found.length) {
  process.stderr.write(
    `【確かめる層の指摘】${path}\n${found.join("\n")}\n` +
      "直してから次に進んでください。直さない理由があるなら、その理由をユーザーに伝えてください。\n",
  );
  process.exit(2);
}
process.exit(0);
