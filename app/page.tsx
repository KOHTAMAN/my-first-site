// ─────────────────────────────────────────────────────────
// これは「業務アプリの画面」です。宣伝ページ（LP）ではありません。
//
// 題材: 子連れのお出かけスポット候補の管理（docs/03_spec.md）
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

/** 色み。業種がない（家庭で使う道具）ため pine */
const TONE = "pine";

/** 密度。出かけ先を決めるのは月4〜6回、1件が1日がかりで重い */
const DENSITY = "roomy";

/** 画面の型。天気の区分ごとに束ねる（明日が雨なら「雨の日」の束だけ見る） */
const LAYOUT: "queue" | "stage" | "due" = "stage";

/** 数え方。遊び場は「件」ではなく「か所」 */
const UNIT = "か所";

/** 区分＝天気。天気予報は取りに行かず、スポット側にどの天気向きかを持たせる */
const CATEGORIES = ["晴れの日", "雨の日", "どちらでも", "期間限定"];

/** 「雨でも遊べる」に数える区分 */
const RAINY_OK = ["雨の日", "どちらでも"];

// ═══════════════════════════════════════════════════════════

/** 1か所のお出かけスポット候補 */
type Spot = {
  id: string;
  name: string;    // スポット名
  weather: string; // 天気の区分（晴れの日 / 雨の日 / どちらでも / 期間限定）
  access: string;  // 行き方・所要（任意）
  cost: number;    // 大人1人ぶんの料金（円）。家族の合計は設定の家族構成から計算する
  done: boolean;   // 行ったか
  addedOn: string; // 登録した日 YYYY-MM-DD（入力せず自動で入る）
  link?: string;   // 元の記事のURL（イベントを取り込んだときだけ自動で入る）
};

type View = "list" | "new" | "settings";
type Filter = "open" | "done" | "all";

const KEY = "odekake-spots";
const NAME_KEY = "odekake-appname";
const FAMILY_KEY = "odekake-family";
const AREA_KEY = "odekake-area";
const FEED_KEY = "odekake-feed";

/** 住んでいるエリア。イベントの取り込みと、行き先の目印に使う */
type Area = { pref: string; city: string };
const DEFAULT_AREA: Area = { pref: "", city: "" };

const PREFS = [
  "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
  "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
  "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県",
  "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県",
  "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県", "山口県",
  "徳島県", "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県",
  "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県",
];

/** 「東京都 練馬区」のような1行。未設定なら空 */
const areaText = (a: Area) => [a.pref, a.city].filter(Boolean).join(" ");

/** 取り込みの上限。ここを増やす前に、取り込み元の負荷を考えること */
const IMPORT_MAX = 20;

/** 家族構成。ここを変えると、一覧の費用がまとめて変わる */
type Family = {
  adults: number;   // 大人の人数
  kidsPaid: number; // 子ども（料金がかかる）の人数
  kidsFree: number; // 子ども（無料）の人数
  kidRate: number;  // 子ども料金のめやす（大人の何%か）
};

/** 初期値は 大人2・料金がかかる子1・無料の子1（3歳と1歳の想定） */
const DEFAULT_FAMILY: Family = { adults: 2, kidsPaid: 1, kidsFree: 1, kidRate: 50 };

/** 大人1人ぶんの料金から、この家族の合計を出す */
const totalCost = (adultCost: number, f: Family) =>
  Math.round(adultCost * f.adults + adultCost * (f.kidRate / 100) * f.kidsPaid);

/** 「大人2人・子ども1人（大人の50%）」のような1行の説明 */
const familyText = (f: Family) =>
  `大人${f.adults}人・子ども${f.kidsPaid}人（大人の${f.kidRate}%）` +
  (f.kidsFree > 0 ? `・無料の子ども${f.kidsFree}人` : "");

/** 画面の型ごとの言葉。ここを直せば画面じゅうの文言が揃って変わる */
const TEXT = {
  queue: {
    sub: "まだ行っていない候補が、登録した順に並びます",
    open: "まだ行っていない", done: "行った",
    toTo: "行ったことにする", toBack: "まだに戻す",
    catLabel: "天気の区分",
    headOpen: "まだ行っていない候補",
  },
  stage: {
    sub: "明日の天気に合う束を見て、費用が合う1か所を選びます",
    open: "まだ行っていない", done: "行った",
    toTo: "行ったことにする", toBack: "まだに戻す",
    catLabel: "天気の区分",
    headOpen: "まだ行っていない候補",
  },
  due: {
    sub: "行ける時期が近い順に並びます",
    open: "まだ行っていない", done: "行った",
    toTo: "行ったことにする", toBack: "まだに戻す",
    catLabel: "天気の区分",
    headOpen: "まだ行っていない候補",
  },
}[LAYOUT];

/** n日前の日付。マイナスを渡すとn日後 */
const ago = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const today = () => ago(0);

/** 費用の表示。0円は「無料」と出す */
const costText = (yen: number) => (yen <= 0 ? "無料" : `${yen.toLocaleString()}円`);

/**
 * 見本データ。すべて架空です（実在の施設名・人名・連絡先は使っていません）。
 * まだ行っていない 9か所 / 行った 5か所。日付は ago(n) で「今日から何日前」の形。
 */
const SAMPLE: Spot[] = [
  { id: "s01", name: "屋根つき広場のある総合公園",       weather: "どちらでも", access: "車15分・駐車場あり（無料）",        cost: 0,    done: false, addedOn: ago(1)  },
  { id: "s02", name: "駅ビルの屋内あそび場",             weather: "雨の日",     access: "電車15分・ベビーカーで入れる",      cost: 800,  done: false, addedOn: ago(0)  },
  { id: "s03", name: "川沿いの大型公園（ふわふわドーム）", weather: "晴れの日",   access: "車25分・駐車場あり（無料）",        cost: 0,    done: false, addedOn: ago(2)  },
  { id: "s04", name: "図書館の絵本コーナーと工作室",       weather: "雨の日",     access: "徒歩10分・ベビーカー置き場あり",    cost: 0,    done: false, addedOn: ago(4)  },
  { id: "s05", name: "海辺の芝生広場と長いすべり台",       weather: "晴れの日",   access: "車40分・駐車場あり（1日500円）",    cost: 0,    done: false, addedOn: ago(6)  },
  { id: "s06", name: "水族館（屋内と屋外の両方あり）",     weather: "どちらでも", access: "電車30分＋徒歩10分",               cost: 1800, done: false, addedOn: ago(7)  },
  { id: "s07", name: "ショッピングモールのキッズパーク",   weather: "雨の日",     access: "車20分・駐車場3時間無料",          cost: 600,  done: false, addedOn: ago(9)  },
  { id: "s08", name: "牧場のふれあいコーナー",            weather: "晴れの日",   access: "車50分・駐車場あり（無料）",        cost: 1000, done: false, addedOn: ago(11) },
  { id: "s09", name: "小川で水あそびできる公園",          weather: "晴れの日",   access: "自転車15分・日かげが少ない",        cost: 0,    done: true,  addedOn: ago(15) },
  { id: "s10", name: "公園に来る移動動物園（春と秋だけ）", weather: "期間限定",   access: "車25分・駐車場あり（無料）",        cost: 400,  done: false, addedOn: ago(12) },
  { id: "s11", name: "児童館の乳幼児ひろば",              weather: "雨の日",     access: "自転車8分・下の子と行きやすい",     cost: 0,    done: true,  addedOn: ago(13) },
  { id: "s12", name: "農産物直売所の遊具コーナー",         weather: "どちらでも", access: "車25分・駐車場あり（無料）",        cost: 0,    done: true,  addedOn: ago(17) },
  { id: "s13", name: "市民プールの幼児コーナー（夏だけ）", weather: "期間限定",   access: "車15分・駐車場あり（1回500円）",    cost: 400,  done: true,  addedOn: ago(19) },
  { id: "s14", name: "駅前広場のイルミネーション（冬）",   weather: "期間限定",   access: "電車10分・夕方から",               cost: 0,    done: true,  addedOn: ago(21) },
];

/** 一覧をどう束ねるか。LAYOUT ごとに変わる */
type Group = { key: string; label: string; items: Spot[] };

function grouped(list: Spot[], filter: Filter): Group[] {
  const head = filter === "open" ? TEXT.headOpen : filter === "done" ? TEXT.done : "すべて";

  if (LAYOUT === "stage" && filter === "open") {
    // 天気の区分ごとに束ねる。CATEGORIES の順に並べ、中身が無い区分は出さない
    return CATEGORIES.map((c) => ({
      key: c,
      label: c,
      items: list.filter((i) => i.weather === c),
    })).filter((g) => g.items.length > 0);
  }

  return [{ key: "all", label: head, items: list }];
}

export default function Home() {
  const [items, setItems] = useState<Spot[]>([]);
  const [appName, setAppName] = useState("おでかけ候補");
  const [family, setFamily] = useState<Family>(DEFAULT_FAMILY);
  const [area, setArea] = useState<Area>(DEFAULT_AREA);
  const [feedUrl, setFeedUrl] = useState("");
  const [onlyArea, setOnlyArea] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState("");
  const [loaded, setLoaded] = useState(false);

  const [view, setView] = useState<View>("list");
  const [filter, setFilter] = useState<Filter>("open");
  const [wx, setWx] = useState("all");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Spot | null>(null);

  const [form, setForm] = useState({ name: "", weather: CATEGORIES[0], access: "", cost: "" });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      setItems(raw ? (JSON.parse(raw) as Spot[]) : SAMPLE);
      const n = localStorage.getItem(NAME_KEY);
      if (n) setAppName(n);
      const f = localStorage.getItem(FAMILY_KEY);
      if (f) setFamily({ ...DEFAULT_FAMILY, ...(JSON.parse(f) as Partial<Family>) });
      const a = localStorage.getItem(AREA_KEY);
      if (a) setArea({ ...DEFAULT_AREA, ...(JSON.parse(a) as Partial<Area>) });
      const u = localStorage.getItem(FEED_KEY);
      if (u) setFeedUrl(u);
    } catch {
      setItems(SAMPLE);
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem(KEY, JSON.stringify(items));
    localStorage.setItem(NAME_KEY, appName);
    localStorage.setItem(FAMILY_KEY, JSON.stringify(family));
    localStorage.setItem(AREA_KEY, JSON.stringify(area));
    localStorage.setItem(FEED_KEY, feedUrl);
  }, [items, appName, family, area, feedUrl, loaded]);

  // 見本データのまま触っていない状態か（1か所でも足す・消すと false になる）
  const isSample = items.length === SAMPLE.length && items.every((i) => i.id.startsWith("s"));

  const counts = useMemo(
    () => ({
      open: items.filter((i) => !i.done).length,
      done: items.filter((i) => i.done).length,
      all: items.length,
    }),
    [items]
  );

  /** まだ行っていない候補のうち、雨でも遊べるところ */
  const rainyOk = useMemo(
    () => items.filter((i) => !i.done && RAINY_OK.includes(i.weather)).length,
    [items]
  );

  const shown = useMemo(() => {
    const k = q.trim().toLowerCase();
    return items
      .filter((i) => (filter === "all" ? true : filter === "open" ? !i.done : i.done))
      .filter((i) => wx === "all" || i.weather === wx)
      .filter((i) => !k || (i.name + i.access + i.weather).toLowerCase().includes(k))
      .sort((a, b) =>
        filter === "done"
          ? b.addedOn.localeCompare(a.addedOn)
          : a.cost - b.cost || b.addedOn.localeCompare(a.addedOn)
      );
  }, [items, filter, wx, q]);

  const groups = useMemo(() => grouped(shown, filter), [shown, filter]);

  function resetForm() {
    setForm({ name: "", weather: CATEGORIES[0], access: "", cost: "" });
    setEditing(null);
  }

  function save() {
    const name = form.name.trim();
    if (!name) return;
    const cost = Math.max(0, Number(form.cost) || 0);
    if (editing) {
      setItems(
        items.map((i) =>
          i.id === editing.id ? { ...i, name, weather: form.weather, access: form.access.trim(), cost } : i
        )
      );
    } else {
      setItems([
        ...items,
        {
          id: String(Date.now()),
          name,
          weather: form.weather,
          access: form.access.trim(),
          cost,
          done: false,
          addedOn: today(),
        },
      ]);
    }
    resetForm();
    setView("list");
  }

  function startEdit(r: Spot) {
    setEditing(r);
    setForm({ name: r.name, weather: r.weather, access: r.access, cost: r.cost ? String(r.cost) : "" });
    setView("new");
  }

  /**
   * 設定した取り込み元から、イベントを「期間限定」の候補として取り込む。
   * ボタンを押したときだけ動く（自動では動かない）。1回に取り込むのは IMPORT_MAX 件まで。
   */
  async function importEvents() {
    const url = feedUrl.trim();
    if (!url || importing) return;
    setImporting(true);
    setImportMsg("取り込んでいます…");
    try {
      const res = await fetch(`/api/events?url=${encodeURIComponent(url)}`);
      const data: { items?: { title: string; link: string; date: string }[]; error?: string } = await res.json();
      if (!res.ok || !data.items) {
        setImportMsg(data.error ?? "取り込めませんでした。");
        return;
      }
      const key = area.city || area.pref;
      const candidates = data.items
        .filter((e) => !onlyArea || !key || e.title.includes(key))
        .filter((e) => !items.some((i) => i.name === e.title))
        .slice(0, IMPORT_MAX);

      if (candidates.length === 0) {
        setImportMsg("新しく取り込めるイベントはありませんでした（すべて登録済みか、しぼり込みで残りませんでした）。");
        return;
      }
      const added: Spot[] = candidates.map((e, n) => ({
        id: `${Date.now()}-${n}`,
        name: e.title,
        weather: "期間限定",
        access: areaText(area) ? `${areaText(area)}のお知らせから取り込み` : "取り込んだイベント",
        cost: 0,
        done: false,
        addedOn: e.date || today(),
        link: e.link,
      }));
      setItems([...items, ...added]);
      setImportMsg(
        `${added.length}${UNIT}取り込みました。費用と天気の区分は「期間限定・無料」で入れてあるので、一覧から直してください。`
      );
    } catch {
      setImportMsg("取り込めませんでした。通信を確かめて、もう一度試してください。");
    } finally {
      setImporting(false);
    }
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
    settings: ["設定", "エリア・イベントの取り込み・家族構成・データの初期化"],
  };

  return (
    <div className="shell" data-tone={TONE} data-density={DENSITY}>
      {/* ───────── 左メニュー ───────── */}
      <nav className="side">
        <div className="side-brand">
          <div className="n">{appName}</div>
          <div className="s">{areaText(area) || "この端末に保存"}</div>
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
        <div className="side-foot">見つけたその場で1{UNIT}登録しておくと、前の日に探さずに済みます</div>
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
                <div className="stat"><div className="n">{rainyOk}</div><div className="l">雨の日でもOK</div></div>
                <div className="stat"><div className="n">{counts.all}</div><div className="l">全{UNIT}</div></div>
              </div>

              <div className="filters">
                <div className="search">
                  <input className="field" value={q} onChange={(e) => setQ(e.target.value)}
                    placeholder="スポット名・行き方で検索" />
                </div>
                <select className="select" value={wx} onChange={(e) => setWx(e.target.value)}
                  aria-label="天気の区分でしぼる">
                  <option value="all">天気は全部</option>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <div className="seg">
                  {(["open", "done", "all"] as Filter[]).map((f) => (
                    <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>
                      {f === "open" ? `まだ ${counts.open}`
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
                        {q || wx !== "all" ? "この条件に合う候補はありません"
                          : filter === "open" ? "まだ行っていない候補がありません"
                          : filter === "done" ? "行ったことにした候補はまだありません"
                          : "まだ候補が登録されていません"}
                      </div>
                      <div className="d">
                        {q || wx !== "all"
                          ? "天気のしぼり込みを「天気は全部」に戻すか、検索の言葉を変えてみてください。"
                          : "右上の「新規登録」から1" + UNIT + "目を登録できます。"}
                      </div>
                    </div>
                  </>
                ) : (
                  groups.map((g) => (
                    <div key={g.key}>
                      <div className="group-head">
                        {g.label}
                        <span className="count">{g.items.length} {UNIT}</span>
                      </div>
                      {g.items.map((r) => (
                        <div className="row" key={r.id}>
                          <div className="row-main">
                            <div className="row-title">{r.name}</div>
                            {r.access && <div className="row-sub">{r.access}</div>}
                          </div>
                          <div className="row-meta">
                            <span className={"badge" + (r.cost <= 0 ? " badge-ok" : "")}>
                              {costText(totalCost(r.cost, family))}
                            </span>
                            {!(LAYOUT === "stage" && filter === "open") && (
                              <span className="badge">{r.weather}</span>
                            )}
                            <span className="row-time">{r.addedOn.slice(5).replace("-", "/")}</span>
                            {r.link && (
                              <a className="btn-ghost" href={r.link} target="_blank" rel="noreferrer">元の記事</a>
                            )}
                            <button className="btn-ghost" onClick={() => startEdit(r)}>編集</button>
                            <button className="btn-ghost" onClick={() => toggle(r.id)}>
                              {r.done ? TEXT.toBack : TEXT.toTo}
                            </button>
                            <button className="btn-ghost danger-btn" onClick={() => remove(r.id)}>削除</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))
                )}
              </div>
              <p className="note">
                費用は<b>{familyText(family)}</b>で計算しています（駐車場代は含みません。行き方の欄に書いてあります）。
                家族構成は設定から変えられます。
              </p>
              <p className="note">データはこの端末のブラウザにだけ保存されます。外部には送信されません。</p>
            </>
          )}

          {/* ── 新規登録・編集 ── */}
          {view === "new" && (
            <div className="panel">
              <div className="form-row">
                <label className="label" htmlFor="f-name">スポット名<span className="req">必須</span></label>
                <input id="f-name" className="field" value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter") save(); }}
                  placeholder="例：川沿いの大型公園（ふわふわドーム）" />
                <span className="hint">あとで見て、どこのことか分かる書き方にします</span>
              </div>

              <div className="form-row">
                <div className="inline">
                  <div>
                    <label className="label" htmlFor="f-wx">{TEXT.catLabel}</label>
                    <select id="f-wx" className="select" value={form.weather}
                      onChange={(e) => setForm({ ...form, weather: e.target.value })}>
                      {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor="f-cost">大人1人の料金（円）</label>
                    <input id="f-cost" className="field" type="number" min="0" step="100" value={form.cost}
                      onChange={(e) => setForm({ ...form, cost: e.target.value })}
                      placeholder="0" />
                  </div>
                </div>
                <span className="hint">
                  大人1人ぶんの入場料を入れます。一覧には{familyText(family)}の合計が出ます。無料なら 0 のままで大丈夫です
                </span>
              </div>

              <div className="form-row">
                <label className="label" htmlFor="f-access">行き方・所要</label>
                <textarea id="f-access" className="field" value={form.access}
                  onChange={(e) => setForm({ ...form, access: e.target.value })}
                  placeholder="例：車25分・駐車場あり（無料）" />
              </div>

              <div className="form-actions">
                <button className="btn" onClick={save} disabled={!form.name.trim()}>
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
                <label className="label">エリア</label>
                <div className="inline">
                  <div>
                    <label className="label" htmlFor="f-pref">都道府県</label>
                    <select id="f-pref" className="select" value={area.pref}
                      onChange={(e) => setArea({ ...area, pref: e.target.value })}>
                      <option value="">選んでください</option>
                      {PREFS.map((x) => <option key={x}>{x}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor="f-city">市区町村</label>
                    <input id="f-city" className="field" value={area.city}
                      onChange={(e) => setArea({ ...area, city: e.target.value })}
                      placeholder="例：練馬区" />
                  </div>
                </div>
                <span className="hint">
                  位置情報は使いません。ここで選んだエリアは、左上の表示と、下のイベント取り込みのしぼり込みに使います
                </span>
              </div>

              <div className="form-row">
                <label className="label" htmlFor="f-feed">イベント情報の取り込み元（RSS / Atom のURL）</label>
                <input id="f-feed" className="field" value={feedUrl}
                  onChange={(e) => { setFeedUrl(e.target.value); setImportMsg(""); }}
                  placeholder="https://example.lg.jp/kosodate.xml" />
                <span className="hint">
                  お住まいの自治体サイトで「RSS」のページを開き、子育て・イベントのフィードのURLを貼ります。
                  https で始まるものだけ取り込めます
                </span>
                <div className="inline">
                  <button className="btn" onClick={importEvents} disabled={!feedUrl.trim() || importing}>
                    {importing ? "取り込み中…" : "いま取り込む"}
                  </button>
                  <label className="label" htmlFor="f-only">
                    <input id="f-only" type="checkbox" checked={onlyArea}
                      onChange={(e) => setOnlyArea(e.target.checked)} />
                    {" "}{areaText(area) ? `「${area.city || area.pref}」を含むものだけ` : "エリア名を含むものだけ"}
                  </label>
                </div>
                {importMsg && <div className="notice">{importMsg}</div>}
                <span className="hint">
                  押したときだけ取り込みます（自動では動きません）。1回に取り込むのは{IMPORT_MAX}{UNIT}まで。
                  取り込んだものは「期間限定・無料」で入るので、費用と天気の区分は一覧から直してください
                </span>
              </div>

              <div className="form-row">
                <label className="label">家族構成</label>
                <div className="inline">
                  <div>
                    <label className="label" htmlFor="f-adults">大人（人）</label>
                    <input id="f-adults" className="field" type="number" min="0" max="10" value={family.adults}
                      onChange={(e) => setFamily({ ...family, adults: Math.max(0, Number(e.target.value) || 0) })} />
                  </div>
                  <div>
                    <label className="label" htmlFor="f-kids">子ども・料金がかかる（人）</label>
                    <input id="f-kids" className="field" type="number" min="0" max="10" value={family.kidsPaid}
                      onChange={(e) => setFamily({ ...family, kidsPaid: Math.max(0, Number(e.target.value) || 0) })} />
                  </div>
                  <div>
                    <label className="label" htmlFor="f-kids-free">子ども・無料（人）</label>
                    <input id="f-kids-free" className="field" type="number" min="0" max="10" value={family.kidsFree}
                      onChange={(e) => setFamily({ ...family, kidsFree: Math.max(0, Number(e.target.value) || 0) })} />
                  </div>
                  <div>
                    <label className="label" htmlFor="f-rate">子ども料金のめやす（%）</label>
                    <input id="f-rate" className="field" type="number" min="0" max="100" step="10" value={family.kidRate}
                      onChange={(e) => setFamily({ ...family, kidRate: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })} />
                  </div>
                </div>
                <span className="hint">
                  いまの設定：{familyText(family)}。一覧の費用がこの人数で計算し直されます。
                  下の子が無料の年齢のうちは「子ども・無料」に入れておきます
                </span>
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
