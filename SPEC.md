# ForClass 開発仕様書

> 最終更新: 2026-03-20
> 担当: takaty0531
> リポジトリ: https://github.com/takaty0531/schedule-tool
> 本番URL: https://takaty0531.github.io/schedule-tool/

---

## 1. プロジェクト概要

**ForClass** は講師と受講者・保護者をつなぐスケジュール調整・授業管理Webアプリ。

- **初期リリース**: 家庭教師向けにUI文言を調整してリリース
- **将来展開**: 塾・音楽教室・スポーツコーチ等へのジャンル拡張
- **ホスティング**: GitHub Pages（静的サイト）
- **バックエンド**: Supabase（Auth・DB・Storage・Edge Functions）

---

## 2. 技術スタック

| 項目 | 技術 | バージョン |
|---|---|---|
| フロントエンド | React + Vite | React 19 / Vite 8 |
| 言語 | TypeScript | 5.9 |
| スタイリング | Tailwind CSS | v4（@tailwindcss/vite） |
| ルーティング | React Router | v7 |
| データ取得 | TanStack Query | v5 |
| バックエンド | Supabase | supabase-js v2 |
| 認証 | Supabase Auth（メール/パスワード）| ※将来的にLINE Login対応予定 |
| 通知（予定） | LINE Messaging API + Edge Functions + pg_cron | フェーズ6 |
| ファイル | Supabase Storage | - |
| デプロイ | GitHub Actions → GitHub Pages | - |

---

## 3. デザイン仕様

- **雰囲気**: ミニマル・クリーン、スマホファースト
- **フォント**: Noto Sans JP（Google Fonts）
- **カラーパレット**:

| 変数名 | カラーコード | 用途 |
|---|---|---|
| primary | `#2D6A4F` | メインカラー（深緑）・ボタン |
| primary-mid | `#52B788` | アクセント（ミドルグリーン） |
| primary-light | `#D8F3DC` | 薄い緑・選択状態背景 |
| bg | `#F7F9F7` | ページ背景 |
| text | `#1B1B1B` | メインテキスト |
| sub | `#6B7280` | サブテキスト・プレースホルダー |

- **形状**: 角丸大（`rounded-2xl` = 16px）
- **ダークモード**: なし
- **アニメーション**: 控えめなトランジション

---

## 4. ロール設計

| ロール（DB） | UI表示名 | 説明 |
|---|---|---|
| `instructor` | 先生 | 授業を提供する側 |
| `learner` | 生徒 | 授業を受ける側 |
| `guardian` | 保護者 | 生徒の保護者 |

> DB・コード内は汎用名称（instructor/learner/guardian）を使用。UI表示のみ日本語。

---

## 5. 画面構成・ルーティング

```
/                    ← ログイン画面（未認証のみ）
/register            ← 新規登録画面（未認証のみ）
/setup/role          ← ロール選択（初回登録後）
/setup/profile       ← プロフィール設定（名前・アバター）
/dashboard           ← ルーム一覧（ロールで表示切替）
/room/:id            ← スケジュール調整
/room/:id/records    ← 授業記録一覧（未実装）
/room/:id/lesson/:lid ← 授業詳細（記録・宿題・ファイル）（未実装）
/invite/:token       ← 招待受け入れページ
/settings            ← プロフィール・通知設定
```

---

## 6. ファイル構成

```
/
├── .env.local               ← 環境変数（gitignore済み・各自設定）
├── .env.example             ← 環境変数のサンプル
├── .github/
│   └── workflows/
│       └── deploy.yml       ← GitHub Pages 自動デプロイ
├── SPEC.md                  ← 本仕様書
├── public/
│   └── favicon.svg
├── src/
│   ├── main.tsx             ← エントリーポイント
│   ├── App.tsx              ← ルーティング・AuthProvider
│   ├── index.css            ← グローバルCSS・Tailwind設定
│   ├── lib/
│   │   ├── supabase.ts      ← Supabaseクライアント
│   │   └── auth.tsx         ← AuthContext・useAuth フック
│   ├── types/
│   │   └── database.ts      ← DB テーブルの TypeScript 型定義
│   ├── pages/
│   │   ├── LoginPage.tsx        ← ログイン
│   │   ├── RegisterPage.tsx     ← 新規登録
│   │   ├── DashboardPage.tsx    ← ルーム一覧（実装予定）
│   │   ├── RoomPage.tsx         ← スケジュール調整（実装予定）
│   │   ├── InvitePage.tsx       ← 招待受け入れ（実装予定）
│   │   ├── SettingsPage.tsx     ← 設定（実装予定）
│   │   └── setup/
│   │       ├── RoleSelectPage.tsx   ← ロール選択
│   │       └── ProfileSetupPage.tsx ← プロフィール設定
│   ├── components/          ← 共通UIコンポーネント（今後追加）
│   └── hooks/               ← カスタムフック（今後追加）
├── index.html
├── vite.config.ts           ← base: '/schedule-tool/' 設定済み
├── package.json
└── tsconfig.json
```

---

## 7. 環境変数

`.env.local` に以下を設定（Supabase > Settings > API で確認）：

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJxxx...
```

GitHub ActionsのSecretsにも同名で登録すること（Settings > Secrets and variables > Actions）。

---

## 8. DB設計（Supabase）

### `profiles`
```sql
id uuid PRIMARY KEY REFERENCES auth.users
role text CHECK (role IN ('instructor','learner','guardian'))
display_name text
line_user_id text
avatar_url text        -- Supabase Storage: avatars/{user_id}/avatar.{ext}
created_at timestamptz DEFAULT now()
```

### `rooms`
```sql
id uuid PRIMARY KEY DEFAULT gen_random_uuid()
name text
instructor_id uuid REFERENCES profiles
lesson_minutes int DEFAULT 60  -- 30分単位（60・90・120など）
created_at timestamptz DEFAULT now()
```

### `room_members`
```sql
id uuid PRIMARY KEY DEFAULT gen_random_uuid()
room_id uuid REFERENCES rooms
learner_id uuid REFERENCES profiles
display_name text      -- 講師が設定する表示名
joined_at timestamptz DEFAULT now()
```

### `guardian_learner`
```sql
guardian_id uuid REFERENCES profiles
learner_id uuid REFERENCES profiles
PRIMARY KEY (guardian_id, learner_id)
```

### `invitations`
```sql
id uuid PRIMARY KEY DEFAULT gen_random_uuid()
room_id uuid REFERENCES rooms
display_name text
role text CHECK (role IN ('learner','guardian'))
learner_id uuid REFERENCES profiles  -- 保護者の場合、紐づく受講者
token text UNIQUE
status text DEFAULT 'pending' CHECK (status IN ('pending','accepted'))
expires_at timestamptz
created_at timestamptz DEFAULT now()
```

### `slots`（空き時間）
```sql
id uuid PRIMARY KEY DEFAULT gen_random_uuid()
room_id uuid REFERENCES rooms
person_id uuid REFERENCES profiles
week_key text          -- 例: '2025-1-6'（その週の月曜日の年-月-日）
day_index int          -- 0=日〜6=土
slot_start int         -- 分単位（例: 510 = 8:30）、30分単位固定
status text DEFAULT 'available'
```

### `lessons`
```sql
id uuid PRIMARY KEY DEFAULT gen_random_uuid()
room_id uuid REFERENCES rooms
scheduled_at timestamptz
duration_minutes int
status text DEFAULT 'scheduled' CHECK (status IN ('scheduled','done','cancelled'))
created_at timestamptz DEFAULT now()
```

### `lesson_records`
```sql
id uuid PRIMARY KEY DEFAULT gen_random_uuid()
lesson_id uuid REFERENCES lessons
content text
homework text
created_at timestamptz DEFAULT now()
```

### `lesson_files`
```sql
id uuid PRIMARY KEY DEFAULT gen_random_uuid()
lesson_id uuid REFERENCES lessons
uploader_id uuid REFERENCES profiles
file_type text CHECK (file_type IN ('homework','material'))
file_path text         -- Supabase Storage: lessons/{lesson_id}/{filename}
file_name text
created_at timestamptz DEFAULT now()
```

### `notification_settings`
```sql
id uuid PRIMARY KEY DEFAULT gen_random_uuid()
user_id uuid REFERENCES profiles
room_id uuid REFERENCES rooms
lesson_confirmed boolean DEFAULT true
morning_notify boolean DEFAULT true
morning_time time DEFAULT '07:30'
pre_lesson_notify boolean DEFAULT true
pre_lesson_minutes int DEFAULT 30
created_at timestamptz DEFAULT now()
updated_at timestamptz DEFAULT now()
UNIQUE (user_id, room_id)
```

---

## 9. Supabase Storage バケット

| バケット名 | 公開設定 | 用途 |
|---|---|---|
| `avatars` | Public | プロフィール画像 |
| `lessons` | Private | 宿題・教材ファイル |

### ファイルパス規則
- アバター: `avatars/{user_id}/avatar.{ext}`
- 授業ファイル: `lessons/{lesson_id}/{filename}`

---

## 10. 認証フロー

1. `/register` でメール・パスワード登録
2. Supabase Auth でユーザー作成
3. `/setup/role` でロール選択 → `profiles` テーブルにレコード作成
4. `/setup/profile` で表示名・アバター設定
5. `/dashboard` へリダイレクト

### 保護ルートの仕組み（`App.tsx`）
- `PrivateRoute`: 未認証なら `/` にリダイレクト
- `PublicRoute`: 認証済みなら `/dashboard` にリダイレクト

---

## 11. 開発フェーズと進捗

| フェーズ | 内容 | 状態 |
|---|---|---|
| フェーズ1 | 環境構築（Vite・Tailwind・Router・Supabase） | ✅ 完了 |
| フェーズ2 | 認証・プロフィール設定 | ✅ 完了 |
| フェーズ3 | ルーム作成・招待機能 | 🔲 未着手 |
| フェーズ4 | スケジュール調整画面 | 🔲 未着手 |
| フェーズ5 | 授業記録・ファイルアップロード | 🔲 未着手 |
| フェーズ6 | LINE通知（Edge Functions + pg_cron） | 🔲 未着手 |

---

## 12. フェーズ3 実装予定内容（次のタスク）

### ルーム作成（講師側）
- ルーム名・授業時間（分）を入力して作成
- `rooms` テーブルに保存

### 招待機能（講師側）
- 受講者の名前を入力 → ランダムトークン生成 → 招待URL発行
- 保護者招待時は紐づく受講者を選択
- `invitations` テーブルに保存・LINEで共有

### 招待受け入れ（`/invite/:token`）
- トークンで `invitations` を検索
- ログイン後 `room_members` / `guardian_learner` に自動登録

---

## 13. ローカル開発手順

```bash
# 依存関係インストール
npm install

# 環境変数設定
cp .env.example .env.local
# .env.local にSupabaseのURLとAnonKeyを入力

# 開発サーバー起動
npm run dev

# ビルド
npm run build
```

---

## 14. デプロイ手順

`main` ブランチにpushすると GitHub Actions が自動でビルド・デプロイ。

**GitHub Secrets の設定（初回のみ）:**
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

**GitHub Pages の設定（初回のみ）:**
- Settings > Pages > Source: **GitHub Actions**

---

## 15. 注意事項

- `.env.local` は絶対にgitにコミットしない（`.gitignore` で除外済み）
- DB・コード内のロール名は汎用名称（instructor/learner/guardian）を使用
- UI表示は家庭教師向け文言（先生・生徒・保護者）で実装
- スマホファースト（タップ操作最適化）
- Supabase RLSポリシーは全テーブルに設定済み
- 変更前は必ずビルド確認（`npm run build`）
