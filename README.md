# QR Studio

QRコード（モデル2・マイクロQR・rMQR・連結）とバーコード（JAN/EAN・UPC・Code 128・GS1-128・Code 39/93・ITF・NW-7 など）を**端末内だけで**生成するPWAです。Svelte 5 + Vite で構築し、エンコーダは TypeScript で自作しています。

> QRコードは株式会社デンソーウェーブの登録商標です。

## 機能

- シンボル：モデル2（型番1〜40、L/M/Q/H、マスク0〜7）、マイクロQR（M1〜M4）、rMQR（32サイズ、M/H）、連結（2〜16個）
- 符号化：数字・英数字・バイト・漢字（Shift_JIS）を最短になるよう自動で混在、ECI、GS1（FNC1）
- 入力：URL、テキスト、複数URL、電話、SMS、メール、Wi-Fi、vCard、MeCard、位置情報、カレンダー、GS1、画像（容量に合わせて自動縮小）、バイナリ。よく使う入力はテンプレートとして保存（明示的に保存したときだけ、パスワードは任意）
- データ削減：URL大文字化、全角→半角、連絡先の最小化、deflate 圧縮
- バーコード：EAN-13/JAN-13、EAN-8、UPC-A/E（アドオン対応）、Code 128（A/B/C 自動最適化・固定）、GS1-128、Code 39（Full ASCII）、Code 93、ITF、ITF-14（ベアラーバー）、NW-7、MSI、Pharmacode。X寸法（mm）+ dpi 指定、印刷サイズ（X寸法ごとの幅・高さ・ドット数）、連番の一括生成、履歴
- 2次元コード（専用タブ）：Data Matrix / GS1 DataMatrix（全30サイズ、ASCII・C40・Text・Base256 自動最適化、ECI）、PDF417（テキスト・数字・バイト圧縮、誤り訂正レベル0〜8、列数1〜30）、Aztec Code（コンパクト1〜4層・フルレンジ1〜32層、誤り訂正の割合指定）。1セルの px / mm + dpi 指定、容量テーブル（サイズ・層・誤り訂正レベルごとの最大文字数と使用率）、一括生成、履歴
- 読取：カメラ・画像から QR・マイクロQR・rMQR・主なバーコードを読み取り、連結の結合・解凍・画像表示。Wi-Fi・連絡先（.vcf 保存）・予定（.ics 保存）・電話・SMS・メール・位置情報は種類に応じた操作を表示。連続スキャンと読取履歴（回数の集計、CSV書き出し）
- 容量テーブル：現在の設定の前後を表示し、入力が収まる行・最小の型番・使用率を表示
- デザイン：色・透過・余白、中央のロゴ／囲み文字、ラベル枠、読取検証（zxing-cpp）
- 出力：PNG / SVG / JPEG / WebP / PDF（印刷寸法どおりのページ）、mm + dpi 指定、クリップボード、共有（Web Share）、ZIP、履歴、プリセット、一括生成（最大1,000件）
- 日本語／英語／中国語（簡体字・繁体字）／フランス語／ドイツ語／スペイン語／ポルトガル語／イタリア語、ライト／ダーク／端末に合わせる、JetBrains Mono 同梱、オフライン動作、アプリのショートカット（作る・読み取る）

要件は [docs/requirements.md](docs/requirements.md) を参照してください。

> 日本語・英語以外の訳（`src/lib/i18n/{zh-Hans,zh-Hant,fr,de,es,pt,it}.ts`）は開発者が作成したものです。各言語のネイティブの方による確認・修正を歓迎します（[Issues](https://github.com/FloatedGecko667/qr-studio/issues)）。

## 開発

```bash
npm install
npm run dev
```

| コマンド | 内容 |
|---|---|
| `npm test` | ユニット・往復テスト（vitest） |
| `npm run test:e2e` | E2E・アクセシビリティ（Playwright + axe、事前に `npm run build`） |
| `npm run check` | 型チェック |
| `npm run lint` | oxlint |
| `npm run build` | 本番ビルド（`dist/`） |

## 検証

- `src/lib/encoder/reference.test.ts`：segno / rmqrcode-python が生成したマトリクスとセル単位で一致することを確認します（`scripts/gen-reference.py` で再生成）。
- `src/lib/encoder/roundtrip.test.ts`：全シンボル・全型番・全誤り訂正レベルを zxing-cpp で読み取り、元データに戻ることを確認します。
- `src/lib/encoder/capacity.test.ts`：容量テーブルの最大文字数ちょうどが入り、1文字多いと入らないことを全行で確認します。
- `src/lib/barcode/barcode.test.ts`：バーコードのバー・スペース幅が bwip-js と一致し、zxing-cpp で読み取れることを確認します。
- `e2e/`：PC とスマホの2つの画面サイズで、生成・読取検証・保存・読取・一括生成・履歴・設定の保存・スクロール時のプレビュー表示を Playwright で確認し、全モード・全タブ（ライト／ダーク）を axe-core で WCAG 2.2 AA に照らして検査します。主な流れは Firefox・WebKit（PC・iPhone）でも実行します。
- `e2e/visual.spec.ts`：デザインテンプレートと主な画面のスクリーンショットを `e2e/__screenshots__` の基準画像と比べます。意図した見た目の変更のあとは、手元（macOS）で `npx playwright test --project=visual --update-snapshots`、Linux 分は GitHub Actions の「Visual baselines」を実行して成果物の画像を置き換えます。
- Lighthouse CI（モバイル）：性能・アクセシビリティ・ベストプラクティスが 95 以上であることを CI で確認します（`lighthouserc.json`）。
- `src/lib/barcode/capacity.test.ts`：2次元コードの容量テーブルの最大文字数ちょうどが入り、1文字多いと入らないことを全行で確認します。
- `src/lib/barcode/pdf417.test.ts`・`aztec.test.ts`：同じ符号語・ビット列から作ったシンボルが bwip-js とモジュール単位で一致し（PDF417 は複数の列数・誤り訂正レベル、Aztec はコンパクト1〜4層とフルレンジ1〜32層）、zxing-cpp で読み取れることを確認します。PDF417 の符号語パターン表は `scripts/gen-pdf417-table.mjs` で再生成します。
- `src/lib/barcode/datamatrix.test.ts`：Data Matrix の全サイズのモジュール配置が bwip-js と一致し、zxing-cpp で読み取れることを確認します。

## 依存パッケージの更新

Dependabot（`.github/dependabot.yml`）が毎週月曜に npm パッケージと GitHub Actions の更新 PR を作ります。開発用ツールの小さな更新は1つの PR にまとめ、Actions は完全な SHA で固定したまま更新します。CI がすべて通ったものだけをマージしてください。Playwright を更新して見た目の回帰テストが失敗したときは、CI の成果物の差分画像を確認し、意図どおりなら基準画像を作り直します。

## ライセンス

MIT。同梱フォント JetBrains Mono は SIL Open Font License 1.1 です。
