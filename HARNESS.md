# HARNESS.md：Claude Code の外側に付ける馬具

ハーネスは、馬に付ける馬具のことです。馬の力はそのままに、行き先と止まり方を人が決められるようにします。
Claude Code の力はもう十分です。差が出るのは、その外側に何を付けているかです。

このリポジトリには、4つの層のハーネスが入っています。

| 層 | 何をするか | このリポジトリで入っているもの | 自分で足すとき |
|---|---|---|---|
| 読ませる | 毎回の前提を読ませる。お願いなので、破られることがある | `CLAUDE.md`・`DESIGN.md`・事業メモ `docs/business/` | `/remember` で1行足す |
| 止める | 操作の直前に機械が止める。Claude Code が何を考えていても止まる | `.claude/hooks/stop.mjs` | 「止める層に入れて」と頼む（下に頼み方） |
| 確かめる | ファイルを直した直後に検査し、外れていたら Claude Code に直させる | `.claude/hooks/check.mjs` | 使わない言葉を `.claude/harness.json` に足す |
| 繰り返す | よくやる作業を、手順ごと1語で呼び出す | `/remember` `/inbox` `/check` など（`.claude/commands/`） | 2回やった手順を `.claude/commands/` に1ファイルで書く |

## どの層に置くかは、破られたときの痛さで決める

| 破られたときの痛さ | 置く層 | 例 |
|---|---|---|
| 小さい | 読ませる | 言葉づかい、書き方、見た目の好み |
| 中くらい | 確かめる | 色を直に書く、根拠のない数字、使わない言葉 |
| 大きい | 止める | 鍵の流出、フォルダごとの削除、お客さんの連絡先を公開する |

CLAUDE.md に「.env は読まないで」と書いても、守られる保証はありません。破られると困ることは、止める層に移します。

## 止める層が止めているもの

| 止めるもの | 理由 |
|---|---|
| 鍵の入ったファイル（`.env`）を読む・書く | 鍵は Vercel の「Environment Variables」に入れる |
| APIキーらしき文字列をファイルやコマンドに書く | 公開リポジトリに鍵が載ると、数分で悪用される |
| フォルダごと消す（`.next` などの作り直せるものは除く） | 消したものは戻しにくい |
| まだ保存していない変更をまとめて消す、`main` に直接送る、強制送信 | 戻すときは PR を閉じるか Revert（取り消し）で |
| `customer-voice.md` と `decisions.md` の行を消す・書き換える | お客さんの言葉と決めたことは、書き足すだけ |
| 事業メモにメールアドレス・電話番号を書く | 公開リポジトリは誰でも読める |
| `hot.md`（今の要約）が40行を超える | 要約は溜めると膨らむ。入れ替える |

## 確かめる層が確かめているもの

画面のファイル（`app/` `components/`）を直すたびに、書き足した部分だけを検査します。

| 確かめるもの | もとの決まり |
|---|---|
| 色・大きさを直に書いていないか（`#1f5fd6`、`13px`） | DESIGN.md：`app/globals.css` の変数を使う |
| 仮説（🔮）を画面に出していないか | CLAUDE.md 7章 |
| 「導入企業◯社」「満足度◯%」「No.1」など根拠の要る言い回し | CLAUDE.md 8章 |
| 使わない言葉（`.claude/harness.json` に並べたもの） | 自分で決めた言葉 |

## 第二の脳の縮小版

`docs/business/` に、お客さんの声と決めたことを溜めます。詳しくは `docs/business/README.md`。

```
/inbox
（お客さんとの会話のメモ・メール・LINE・議事録をそのまま貼る）
```

集めるのは人、整理するのは Claude Code、使うのは次からの会話です。

## 自分で育てる

| こうなったら | こう頼む |
|---|---|
| Claude Code に同じことを2回言った | `/remember ボタンは1つだけにする` |
| 画面に出てほしくない言葉がある | `/remember 「お得」という言葉は使わない`（使わない言葉に入る） |
| 止めたいことが増えた | `.claude/hooks/stop.mjs に、〇〇をしようとしたら止める決まりを足してください。足す前に、どう判定するかを先に見せてください。` |
| 止める層が邪魔をした | 止めた理由を読む。本当に必要な操作なら、GitHub の画面で自分でやる |
| ハーネスが効いているか確かめたい | `node .claude/hooks/selftest.mjs を実行して、結果の表を見せてください` |

止める層と確かめる層は、**新しい会話を開いたときから**効きます。入れた直後の会話では効きません。

---

## CLAUDE.md に足す文

キットを入れるとき、次の文を `CLAUDE.md` の最後に足します。

```markdown
## 11. 事業メモと、決まり

### 事業の文脈の読み方

お客さんの言葉・決めたこと・今の状況が要るときだけ、次の順に読む。毎回全部は読まない。

1. `docs/business/hot.md`（今の要約）
2. 足りなければ `docs/business/customer-voice.md`（お客さんの声）と `docs/business/decisions.md`（決めたこと）

ページの文言を書くときは、`customer-voice.md` のお客さんの言葉を優先して使う。

### 決まり（同じことを2回言ったら1行）

`/remember` で足す。日付つき。

-

### ハーネス

止める層（`.claude/hooks/stop.mjs`）と確かめる層（`.claude/hooks/check.mjs`）が入っている。
止められたら、理由をユーザーにそのまま伝え、別の方法を提案する。止める層を外したり、避ける書き方を探したりしない。
仕組みは `HARNESS.md`。
```

---

## 入れ方（Claude Code 向け）

テンプレートから作ったあとのリポジトリに、このキットを入れる手順です。

1. 次のファイルを、`https://raw.githubusercontent.com/ryotatera/dojo-vibe-starter/main/` から `curl -fsSL` で取り、同じ場所に置く。フォルダが無ければ作る

   ```
   HARNESS.md
   .claude/settings.json
   .claude/harness.json
   .claude/hooks/stop.mjs
   .claude/hooks/check.mjs
   .claude/hooks/selftest.mjs
   .claude/commands/remember.md
   .claude/commands/inbox.md
   docs/business/README.md
   docs/business/hot.md
   docs/business/customer-voice.md
   docs/business/decisions.md
   samples/CLAUDE.short.md
   samples/CLAUDE.short.sample.md
   ```

2. 同じ名前のファイルが既にあれば、上書きせずに違いを見せてユーザーに聞く
3. 上の「CLAUDE.md に足す文」を、`CLAUDE.md` の最後に足す。既に「11. 事業メモと、決まり」があれば足さない
4. `node .claude/hooks/selftest.mjs` を実行し、出てきた表をそのまま報告する。全件「OK」なら正しく入っています
5. 上に書いたもの以外のファイルは変更しない
6. PR の説明に「新しい会話を開くと、止める層と確かめる層が効き始めます」と書く
