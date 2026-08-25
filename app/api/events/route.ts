// ─────────────────────────────────────────────────────────
// イベント情報の取り込み口（サーバー側）
//
// なぜ app/page.tsx の1枚で終わらないのか:
//   ブラウザから他サイトのRSSを直接読むと CORS で必ず失敗します。
//   そのため、取得だけをサーバー側で行い、結果をJSONで返します。
//
// 上限（勝手に増やさないこと）:
//   - https のURLだけ / 社内・自分自身のアドレスは拒否
//   - 取得は8秒でうちきり、1MBまで
//   - 返すのは最大20件
//   - 自動では動かない。設定画面のボタンを押したときだけ動く
//   - 有料の外部APIは使っていないので、呼び出しにお金はかかりません
// ─────────────────────────────────────────────────────────

export const dynamic = "force-dynamic";

const MAX_ITEMS = 20;
const MAX_BYTES = 1_000_000;
const TIMEOUT_MS = 8000;

/** 社内向け・自分自身を指すアドレスを弾く（外部の公開フィードだけを許す） */
function blockedHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal") || h.endsWith(".local")) return true;
  if (/^\[?::1\]?$/.test(h)) return true;
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  return false;
}

const unescapeXml = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

function tag(body: string, name: string): string {
  const m = body.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? unescapeXml(m[1]) : "";
}

/** RSS は <link>URL</link>、Atom は <link href="URL" /> */
function pickLink(body: string): string {
  const atom = body.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*\/?>/i);
  if (atom) return atom[1];
  const rss = tag(body, "link");
  return /^https?:\/\//i.test(rss) ? rss : "";
}

/** 日付らしきものを YYYY-MM-DD にそろえる。読めなければ空 */
function pickDate(body: string): string {
  for (const n of ["pubDate", "published", "updated", "dc:date", "date"]) {
    const raw = tag(body, n);
    if (!raw) continue;
    const t = Date.parse(raw);
    if (!Number.isNaN(t)) return new Date(t).toISOString().slice(0, 10);
  }
  return "";
}

function parseFeed(xml: string) {
  const out: { title: string; link: string; date: string }[] = [];
  const blocks = xml.matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi);
  for (const b of blocks) {
    const body = b[2];
    const title = tag(body, "title");
    if (!title) continue;
    out.push({ title, link: pickLink(body), date: pickDate(body) });
    if (out.length >= MAX_ITEMS) break;
  }
  return out;
}

export async function GET(req: Request) {
  const target = new URL(req.url).searchParams.get("url") ?? "";

  let u: URL;
  try {
    u = new URL(target);
  } catch {
    return Response.json({ error: "URLの形が正しくありません。https で始まるアドレスを入れてください。" }, { status: 400 });
  }
  if (u.protocol !== "https:") {
    return Response.json({ error: "https で始まるアドレスだけ取り込めます。" }, { status: 400 });
  }
  if (blockedHost(u.hostname)) {
    return Response.json({ error: "このアドレスからは取り込めません。" }, { status: 400 });
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(u.toString(), {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*" },
      cache: "no-store",
    });
    if (!res.ok) {
      return Response.json({ error: `取り込み元から ${res.status} が返りました。URLを確かめてください。` }, { status: 502 });
    }
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) {
      return Response.json({ error: "取り込み元のデータが大きすぎます（1MBまで）。" }, { status: 502 });
    }
    const xml = new TextDecoder("utf-8").decode(buf);
    const items = parseFeed(xml);
    if (items.length === 0) {
      return Response.json({ error: "イベントらしき項目が見つかりませんでした。RSS/AtomのURLか確かめてください。" }, { status: 422 });
    }
    return Response.json({ items });
  } catch {
    return Response.json({ error: "取り込み元につながりませんでした。時間をおいて試してください。" }, { status: 504 });
  } finally {
    clearTimeout(timer);
  }
}
