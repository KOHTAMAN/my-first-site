// ─────────────────────────────────────────────────────────
// これは「業務アプリの画面」です。宣伝ページ（LP）ではありません。
//
// 題材: 口頭で交わした約束の、やり忘れ防止（docs/03_spec.md）
//
// 画面の骨格（この形は崩さない）:
//   左メニュー（.side）＋ 上部バー（.topbar）＋ 本体（.content）
//   一覧 / 新規登録 / 設定 の3画面を view で切り替える
// ─────────────────────────────────────────────────────────
"use client";

import { useEffect, useMemo, useState } from "react";

// ═══════════════════════════════════════════════════════════
//  画面の型 ── docs/03_spec.md「0. 画面の型」のとおりに設定
// ═══════════════════════════════════════════════════════════

/** 色み。業種がないため pine（教育・サービス・その他）を選択 */
const TONE = "pine";

/** 密度。約束は月10〜20件（1日1件以下）と見て roomy */
const DENSITY = "roomy";

/** 画面の型。「完了したかが一目でわかる」＝未完了を古い順に片づける */
const LAYOUT: "queue" | "stage" | "due" = "queue";

/** 数え方。「3件の約束」より「3つの約束」が家庭の言葉 */
const UNIT = "つ";

/** 区分。2行目の「予約しよう / 返信しよう / これをやろう」から起こした */
const CATEGORIES = ["予約", "返信", "用事", "その他"];

// ═══════════════════════════════════════════════════════════

/** 1つの約束 */
type Yakusoku = {
  id: string;
  what: string;       // 約束の内容
  kind: string;       // 区分（予約 / 返信 / 用事 / その他）
  note: string;       // ひとこと（任意）
  promisedOn: string; // 約束した日 YYYY-MM-DD
  done: boolean;      // やり終えたか
};

type View = "list" | "new" | "settings";
type Filter = "open" | "done" | "all";

const KEY = "yakusoku-data";
const NAME_KEY = "yakusoku-appname";

/** 画面の型ごとの言葉。ここを直せば画面じゅうの文言が揃って変わる */
const TEXT = {
  queue: {
    sub: "まだやっていない約束が、古い順に並びます",
    open: "未完了", done: "完了",
    toTo: "完了にする", toBack: "未完了に戻す",
    dateLabel: "約束した日", catLabel: "区分",
    stat2: "3日以上そのまま",
    headOpen: "まだやっていない約束（古い順）",
  },
  stage: {
    sub: "どの段階で止まっているかが分かります",
    open: "進行中", done: "完了",
    toTo: "完了にする", toBack: "進行中に戻す",
    dateLabel: "受け入れた日", catLabel: "いまの段階",
    stat2: "7日以上 動きなし",
    headOpen: "進行中",
  },
  due: {
    sub: "期限が近い順に並びます",
    open: "未完了", done: "完了",
    toTo: "完了にする", toBack: "未完了に戻す",
    dateLabel: "期限", catLabel: "種別",
    stat2: "期限切れ",
    headOpen: "未完了（期限が近い順）",
  },
}[LAYOUT];

/** n日前の日付。マイナスを渡すとn日後（"due" の見本データで使う） */
const ago = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const today = () => ago(0);

/** 今日との差。0=今日、-3=3日過ぎている、+2=あと2日 */
const diff = (d: string) =>
  Math.round(
    (new Date(d + "T00:00:00").getTime() - new Date(today() + "T00:00:00").getTime()) / 86400000
  );

/** 何日そのままか（"queue" / "stage" 用） */
const waiting = (d: string) => Math.max(0, -diff(d));

/**
 * 見本データ。すべて架空です（実在の人名・連絡先は使っていません）。
 * 未完了9つ / 完了5つ。日付は ago(n) で「今日から何日前」の形にしてあります。
 */
const SAMPLE: Yakusoku[] = [
  { id: "s01", what: "美容院の予約を取る",       kind: "予約",   note: "土曜の午前がいいと言っていた",       promisedOn: ago(0),  done: false },
  { id: "s02", what: "ママ友グループに返信する",  kind: "返信",   note: "運動会の集合時間の件",             promisedOn: ago(1),  done: false },
  { id: "s03", what: "クリーニングを取りに行く",  kind: "用事",   note: "駅前の店。伝票は玄関の引き出し",     promisedOn: ago(1),  done: false },
  { id: "s04", what: "歯医者の予約を取り直す",    kind: "予約",   note: "前回キャンセルしたぶん",            promisedOn: ago(2),  done: false },
  { id: "s05", what: "義母に電話する",           kind: "その他", note: "お礼を伝えると言ったまま",          promisedOn: ago(3),  done: false },
  { id: "s06", what: "ゴミ袋の大を買っておく",    kind: "用事",   note: "残り2枚。スーパーで買える",         promisedOn: ago(4),  done: false },
  { id: "s07", what: "レストランを予約する",      kind: "予約",   note: "結婚記念日。個室が空いていれば",     promisedOn: ago(5),  done: false },
  { id: "s08", what: "保育園の連絡帳に書く",      kind: "その他", note: "来週の遠足を休む連絡",              promisedOn: ago(6),  done: false },
  { id: "s09", what: "車の点検を予約する",        kind: "予約",   note: "そろそろ車検が近いと言われた",       promisedOn: ago(9),  done: false },
  { id: "s10", what: "園の写真を注文する",        kind: "用事",   note: "注文済み。来週届く",                promisedOn: ago(12), done: true  },
  { id: "s11", what: "友人へ結婚祝いを送る",      kind: "その他", note: "発送済み",                         promisedOn: ago(14), done: true  },
  { id: "s12", what: "帰りに牛乳を買う",          kind: "用事",   note: "買って帰った",                     promisedOn: ago(16), done: true  },
  { id: "s13", what: "旅行の宿を予約する",        kind: "予約",   note: "10月の連休ぶん。予約完了",          promisedOn: ago(18), done: true  },
  { id: "s14", what: "面談の日程を返信する",      kind: "返信",   note: "第2希望で確定した",                 promisedOn: ago(21), done: true  },
];

/** 一覧をどう束ねるか。LAYOUT ごとに変わる */
type Group = { key: string; label: string; mark?: "late" | "now"; items: Yakusoku[] };

function grouped(list: Yakusoku[], filter: Filter): Group[] {
  const head = filter === "open" ? TEXT.headOpen : filter === "done" ? TEXT.done : "すべて";

  if (LAYOUT === "stage" && filter === "open") {
    // 段階ごとに束ねる。CATEGORIES の順に並べ、中身が無い段階は出さない
    return CATEGORIES.map((c) => ({
      key: c,
      label: c,
      mark: undefined,
      items: list.filter((i) => i.kind === c),
    })).filter((g) => g.items.length > 0);
  }

  if (LAYOUT === "due" && filter === "open") {
    const buckets: Group[] = [
      { key: "late",  label: "期限が過ぎている", mark: "late", items: [] },
      { key: "now",   label: "今日・明日",       mark: "now",  items: [] },
      { key: "week",  label: "今週のうち",                     items: [] },
      { key: "later", label: "それ以降",                       items: [] },
    ];
    list.forEach((i) => {
      const d = diff(i.promisedOn);
      if (d < 0) buckets[0].items.push(i);
      else if (d <= 1) buckets[1].items.push(i);
      else if (d <= 7) buckets[2].items.push(i);
      else buckets[3].items.push(i);
    });
    return buckets.filter((b) => b.items.length > 0);
  }

  return [{ key: "all", label: head, items: list }];
}

/** 行の右に出す小さなバッジ。LAYOUT ごとに意味が変わる */
function rowBadge(r: Yakusoku): { text: string; kind: "warn" | "danger" } | null {
  if (r.done) return null;
  if (LAYOUT === "due") {
    const d = diff(r.promisedOn);
    if (d < 0) return { text: `${-d}日 超過`, kind: "danger" };
    if (d === 0) return { text: "今日", kind: "warn" };
    return null;
  }
  const w = waiting(r.promisedOn);
  const limit = LAYOUT === "stage" ? 7 : 3;
  return w >= limit ? { text: `${w}日`, kind: "warn" } : null;
}

export default function Home() {
  const [items, setItems] = useState<Yakusoku[]>([]);
  const [appName, setAppName] = useState("やくそく管理");
  const [loaded, setLoaded] = useState(false);

  const [view, setView] = useState<View>("list");
  const [filter, setFilter] = useState<Filter>("open");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Yakusoku | null>(null);

  const [form, setForm] = useState({ what: "", kind: CATEGORIES[0], note: "", promisedOn: today() });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      setItems(raw ? (JSON.parse(raw) as Yakusoku[]) : SAMPLE);
      const n = localStorage.getItem(NAME_KEY);
      if (n) setAppName(n);
    } catch {
      setItems(SAMPLE);
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem(KEY, JSON.stringify(items));
    localStorage.setItem(NAME_KEY, appName);
  }, [items, appName, loaded]);

  // 見本データのまま触っていない状態か（1つでも足す・消すと false になる）
  const isSample = items.length === SAMPLE.length && items.every((i) => i.id.startsWith("s"));

  const counts = useMemo(
    () => ({
      open: items.filter((i) => !i.done).length,
      done: items.filter((i) => i.done).length,
      all: items.length,
    }),
    [items]
  );

  /** 2つ目の統計。LAYOUT で意味が変わる */
  const attention = useMemo(() => {
    const open = items.filter((i) => !i.done);
    if (LAYOUT === "due") return open.filter((i) => diff(i.promisedOn) < 0).length;
    const limit = LAYOUT === "stage" ? 7 : 3;
    return open.filter((i) => waiting(i.promisedOn) >= limit).length;
  }, [items]);

  const shown = useMemo(() => {
    const k = q.trim().toLowerCase();
    return items
      .filter((i) => (filter === "all" ? true : filter === "open" ? !i.done : i.done))
      .filter((i) => !k || (i.what + i.note + i.kind).toLowerCase().includes(k))
      .sort((a, b) => a.promisedOn.localeCompare(b.promisedOn));
  }, [items, filter, q]);

  const groups = useMemo(() => grouped(shown, filter), [shown, filter]);

  function resetForm() {
    setForm({ what: "", kind: CATEGORIES[0], note: "", promisedOn: today() });
    setEditing(null);
  }

  function save() {
    const what = form.what.trim();
    if (!what) return;
    if (editing) {
      setItems(items.map((i) => (i.id === editing.id ? { ...i, ...form, what } : i)));
    } else {
      setItems([...items, { id: String(Date.now()), ...form, what, done: false }]);
    }
    resetForm();
    setView("list");
  }

  function startEdit(r: Yakusoku) {
    setEditing(r);
    setForm({ what: r.what, kind: r.kind, note: r.note, promisedOn: r.promisedOn });
    setView("new");
  }

  const toggle = (id: string) => setItems(items.map((i) => (i.id === id ? { ...i, done: !i.done } : i)));
  const remove = (id: string) => setItems(items.filter((i) => i.id !== id));

  const NAV: { k: View; label: string; count?: number }[] = [
    { k: "list", label: "一覧", count: counts.open },
    { k: "new", label: "新規登録" },
    { k: "settings", label: "設定" },
  ];

  const titles: { [K in View]: [string, string] } = {
    list: ["一覧", TEXT.sub],
    new: [editing ? "編集" : "新規登録", "入力して保存すると、一覧に追加されます"],
    settings: ["設定", "表示名の変更と、データの初期化"],
  };

  return (
    <div className="shell" data-tone={TONE} data-density={DENSITY}>
      {/* ───────── 左メニュー ───────── */}
      <nav className="side">
        <div className="side-brand">
          <div className="n">{appName}</div>
          <div className="s">この端末に保存</div>
        </div>
        <div className="side-label">メニュー</div>
        <div className="side-nav">
          {NAV.map((n) => (
            <button
              key={n.k}
              className="side-item"
              aria-current={view === n.k ? "page" : undefined}
              onClick={() => { if (n.k !== "new") resetForm(); setView(n.k); }}
            >
              {n.label}
              {typeof n.count === "number" && <span className="c">{n.count}</span>}
            </button>
          ))}
        </div>
        <div className="side-foot">思い出したその場で登録すると、たまりません</div>
      </nav>

      {/* ───────── 本体 ───────── */}
      <div className="main">
        <header className="topbar">
          <span className="t">{titles[view][0]}</span>
          <span className="d">{titles[view][1]}</span>
          {view === "list" && (
            <span className="right">
              <button className="btn" onClick={() => { resetForm(); setView("new"); }}>新規登録</button>
            </span>
          )}
        </header>

        <div className="content">
          {/* ── 一覧 ── */}
          {view === "list" && (
            <>
              {isSample && (
                <div className="notice">
                  表示中のデータは<b>見本</b>です。そのまま触って試せます。
                  消したいときは、左メニューの<b>設定</b>から。
                </div>
              )}

              <div className="stats">
                <div className="stat"><div className="n accent">{counts.open}</div><div className="l">{TEXT.open}</div></div>
                <div className="stat"><div className="n">{attention}</div><div className="l">{TEXT.stat2}</div></div>
                <div className="stat"><div className="n">{counts.all}</div><div className="l">全部</div></div>
              </div>

              <div className="filters">
                <div className="search">
                  <input className="field" value={q} onChange={(e) => setQ(e.target.value)}
                    placeholder="約束の内容・ひとことで検索" />
                </div>
                <div className="seg">
                  {(["open", "done", "all"] as Filter[]).map((f) => (
                    <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>
                      {f === "open" ? `${TEXT.open} ${counts.open}`
                        : f === "done" ? `${TEXT.done} ${counts.done}`
                        : `全部 ${counts.all}`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="list">
                {shown.length === 0 ? (
                  <>
                    <div className="list-head">
                      {filter === "open" ? TEXT.headOpen : filter === "done" ? TEXT.done : "すべて"}
                      <span className="count">0 {UNIT}</span>
                    </div>
                    <div className="empty">
                      <div className="t">
                        {q ? "見つかりませんでした"
                          : filter === "open" ? "やり残している約束はありません"
                          : filter === "done" ? "完了にした約束はまだありません"
                          : "まだ約束が登録されていません"}
                      </div>
                      <div className="d">
                        {q ? "検索の言葉を変えてみてください。" : "右上の「新規登録」から追加できます。"}
                      </div>
                    </div>
                  </>
                ) : (
                  groups.map((g) => (
                    <div key={g.key}>
                      <div className={"group-head" + (g.mark ? ` is-${g.mark}` : "")}>
                        {g.mark && <span className="dot" />}
                        {g.label}
                        <span className="count">{g.items.length} {UNIT}</span>
                      </div>
                      {g.items.map((r) => {
                        const b = rowBadge(r);
                        return (
                          <div className="row" key={r.id}>
                            <div className="row-main">
                              <div className="row-title">{r.what}</div>
                              {r.note && <div className="row-sub">{r.note}</div>}
                            </div>
                            <div className="row-meta">
                              {b && <span className={`badge badge-${b.kind}`}>{b.text}</span>}
                              {!(LAYOUT === "stage" && filter === "open") && (
                                <span className="badge">{r.kind}</span>
                              )}
                              <span className="row-time">{r.promisedOn.slice(5).replace("-", "/")}</span>
                              <button className="btn-ghost" onClick={() => startEdit(r)}>編集</button>
                              <button className="btn-ghost" onClick={() => toggle(r.id)}>
                                {r.done ? TEXT.toBack : TEXT.toTo}
                              </button>
                              <button className="btn-ghost danger-btn" onClick={() => remove(r.id)}>削除</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>
              <p className="note">データはこの端末のブラウザにだけ保存されます。外部には送信されません。</p>
            </>
          )}

          {/* ── 新規登録・編集 ── */}
          {view === "new" && (
            <div className="panel">
              <div className="form-row">
                <label className="label" htmlFor="f-what">約束の内容<span className="req">必須</span></label>
                <input id="f-what" className="field" value={form.what}
                  onChange={(e) => setForm({ ...form, what: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter") save(); }}
                  placeholder="例：美容院の予約を取る" />
                <span className="hint">あとで見て何のことか分かる書き方にします</span>
              </div>

              <div className="form-row">
                <div className="inline">
                  <div>
                    <label className="label" htmlFor="f-cat">{TEXT.catLabel}</label>
                    <select id="f-cat" className="select" value={form.kind}
                      onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                      {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor="f-date">{TEXT.dateLabel}</label>
                    <input id="f-date" className="field" type="date" value={form.promisedOn}
                      onChange={(e) => setForm({ ...form, promisedOn: e.target.value })} />
                  </div>
                </div>
              </div>

              <div className="form-row">
                <label className="label" htmlFor="f-note">ひとこと</label>
                <textarea id="f-note" className="field" value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  placeholder="相手・場所・期限など、思い出す手がかり" />
              </div>

              <div className="form-actions">
                <button className="btn" onClick={save} disabled={!form.what.trim()}>
                  {editing ? "保存する" : "一覧に追加"}
                </button>
                <button className="btn-ghost" onClick={() => { resetForm(); setView("list"); }}>やめる</button>
                <span className="spacer" />
                {editing && (
                  <button className="btn-ghost danger-btn"
                    onClick={() => { remove(editing.id); resetForm(); setView("list"); }}>
                    この1{UNIT}を削除
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── 設定 ── */}
          {view === "settings" && (
            <div className="panel">
              <div className="form-row">
                <label className="label" htmlFor="f-app">画面の表示名</label>
                <input id="f-app" className="field" value={appName}
                  onChange={(e) => setAppName(e.target.value)} />
                <span className="hint">左上に表示されます。変えるとすぐ反映されます</span>
              </div>

              <div className="form-row">
                <label className="label">データ</label>
                <div className="inline">
                  <button className="btn-ghost" onClick={() => setItems(SAMPLE)}>見本データを入れ直す</button>
                  <button className="btn-ghost danger-btn"
                    onClick={() => { if (confirm("全部消します。よろしいですか？")) setItems([]); }}>
                    全部消す
                  </button>
                </div>
                <span className="hint">
                  現在 {counts.all} {UNIT}（{TEXT.open} {counts.open} / {TEXT.done} {counts.done}）
                </span>
              </div>

              <p className="note">
                データはこの端末のブラウザにだけ保存されます。
                別の端末や他の人とは共有されません（共有は第3回で扱います）。
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
