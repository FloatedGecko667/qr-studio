# QR Studio

QRコード（モデル2・マイクロQR・rMQR・連結）を**端末内だけで**生成するPWAです。Svelte 5 + Vite で構築し、エンコーダは TypeScript で自作しています。

> QRコードは株式会社デンソーウェーブの登録商標です。

## 機能

- シンボル：モデル2（型番1〜40、L/M/Q/H、マスク0〜7）、マイクロQR（M1〜M4）、rMQR（32サイズ、M/H）、連結（2〜16個）
- 符号化：数字・英数字・バイト・漢字（Shift_JIS）を最短になるよう自動で混在、ECI、GS1（FNC1）
- 入力：URL、テキスト、複数URL、電話、SMS、メール、Wi-Fi、vCard、MeCard、位置情報、カレンダー、GS1、バイナリ
- 容量テーブル：現在の設定の前後を表示し、入力が収まる行・最小の型番・使用率を表示
- デザイン：色・透過・余白、中央のロゴ／囲み文字、ラベル枠、読取検証（zxing-cpp）
- 出力：PNG / SVG / JPEG / WebP、mm + dpi 指定、クリップボード、ZIP、履歴、プリセット、一括生成（最大1,000件）
- 日本語／英語、ライト／ダーク／端末に合わせる、JetBrains Mono 同梱、オフライン動作

要件は [docs/requirements.md](docs/requirements.md) を参照してください。

## 開発

```bash
npm install
npm run dev
```

| コマンド | 内容 |
|---|---|
| `npm test` | ユニット・往復テスト（vitest） |
| `npm run check` | 型チェック |
| `npm run lint` | oxlint |
| `npm run build` | 本番ビルド（`dist/`） |

## 検証

- `src/lib/encoder/reference.test.ts`：segno / rmqrcode-python が生成したマトリクスとセル単位で一致することを確認します（`scripts/gen-reference.py` で再生成）。
- `src/lib/encoder/roundtrip.test.ts`：全シンボル・全型番・全誤り訂正レベルを zxing-cpp で読み取り、元データに戻ることを確認します。
- `src/lib/encoder/capacity.test.ts`：容量テーブルの最大文字数ちょうどが入り、1文字多いと入らないことを全行で確認します。

## ライセンス

MIT。同梱フォント JetBrains Mono は SIL Open Font License 1.1 です。
