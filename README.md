# ForClass（家庭教師アプリ）

ForClass は、講師・生徒・保護者のスケジュール調整と授業運用を行う Web アプリです。

## セットアップ

```bash
npm install
cp .env.example .env.local
npm run dev
```

`.env.local` には以下を設定してください。

```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

## 主なコマンド

```bash
npm run dev
npm run lint
npm run build
```

## ドキュメント

- 仕様: `SPEC.md`
- テスト方針: `docs/TEST_PLAN.md`
- LINE通知運用: `docs/LINE_NOTIFY_OPERATIONS.md`
