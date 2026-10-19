<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## ADRの記録方針

今後も維持するアーキテクチャ上の判断は、機能領域を問わず `docs/adr/` へ1件ずつADRファイルとして記録する。複数の設計判断は複数のADRに分け、機能ごとの設計資料を新たに作成しない。

ただし、ADRの追加・追記はユーザーから明示的に指示された場合にのみ行い、AIの判断で勝手に追加・追記しない。

ファイル名は `adr-連番-短い英語タイトル.md` とする。連番は3桁のゼロ埋め、英語タイトルは小文字の単語をハイフンで区切る（例：`adr-008-example-decision.md`）。新しい判断には既存の最大番号に続く連番を付ける。

ADRは設計資料の網羅的な保存先ではない。将来の変更時に判断の根拠として参照すべき、構造・責務の境界・整合性や互換性の保証に関わる選択を対象とする。機能仕様、項目一覧、初期版の対応範囲、現在の実装や利用技術の紹介だけではADRにしない。記載項目を埋めるために、比較した事実のない選択肢や採用理由を作らない。

ADRには、維持する設計判断として採用する方式・保証範囲・選択の理由・影響を記載する。細かな処理手順、APIの呼び出し順序、実装作業の段取りは記載しない。

各ADRには以下の項目を別セクションで記載する。

- ステータス：提案・採用・置換など、判断の状態
- 決定日：判断を決定した日付
- コンテキスト：判断が必要になった背景・前提・課題
- 検討した選択肢：比較した案とそれぞれの採否
- 決定事項：採用する方針・保証範囲
- 決定理由：選択の根拠・比較・トレードオフ
- 結果：決定による効果・制約・影響


## 開発中のDBスキーマ変更

開発中は既存データの移行を考慮しない。DBスキーマの変更は `supabase/migrations/202610190001_crm.sql` の1本を最新の定義に刷新する。差分マイグレーションや既存データの移行・互換処理は追加しない。
