# ForClass 新規開発 引き継ぎプロンプト

## プロジェクト概要
講師と受講者・保護者をつなぐスケジュール調整・授業管理Webアプリ「ForClass」を新規開発する。
既存アプリ（単一HTML・家庭教師特化）をReact + Viteで汎用プラットフォームとして作り直す。

- **アプリ名**: ForClass
- **コンセプト**: 講師と受講者をつなぐ授業管理プラットフォーム（家庭教師・塾・音楽教室・スポーツコーチ等に対応）
- **初期リリース**: 家庭教師向けにUI文言を調整してリリース、その後他ジャンルへ展開
- **GitHub リポジトリ**: https://github.com/takaty0531/schedule-tool
- **ホスティング**: GitHub Pages
- **既存アプリ**: https://takaty0531.github.io/schedule-tool/

---

## 技術スタック

| 項目 | 技術 |
|---|---|
| フロントエンド | React + Vite |
| スタイリング | Tailwind CSS |
| ルーティング | React Router v6 |
| データ取得 | TanStack Query |
| バックエンド | Supabase（Auth・DB・Storage・Edge Functions） |
| 認証 | Supabase Auth + LINE Login（OAuth） |
| 通知 | LINE Messaging API（Edge Functions + pg_cron） |
| ファイル | Supabase Storage |

---

## デザイン仕様

- **雰囲気**: ミニマル・クリーン、スマホファースト
- **カラーパレット**:
  - 背景: `#FFFFFF` / `#F7F9F7`
  - メイン: `#2D6A4F`（深緑）
  - アクセント: `#52B788`（ミドルグリーン）
  - 薄め: `#D8F3DC`
  - テキスト: `#1B1B1B` / `#6B7280`（サブ）
- **形状**: 角丸大（border-radius: 16px〜24px）
- **ダークモード**: なし
- **フォント**: 日本語対応の美しいフォントを選定（InterやRobotoなど汎用フォントは避ける）
- **アニメーション**: 控えめなトランジション、ページロード時のスタッガードアニメーション

---

## ロール設計（汎用）

| ロール | 説明 | 初期表示名（家庭教師向け） |
|---|---|---|
| `instructor` | 授業を提供する側 | 先生 |
| `learner` | 授業を受ける側 | 生徒 |
| `guardian` | 受講者の保護者 | 保護者 |

ロール名はDB内では汎用名称を使用し、UI表示は設定で切り替え可能な設計にする。

---

## 画面構成

```
/                          ← LINEログイン画面
/dashboard                 ← ルーム一覧（ロールで表示切替）
/room/:id                  ← スケジュール調整
/room/:id/records          ← 授業記録一覧
/room/:id/lesson/:lid      ← 授業詳細（記録・宿題・ファイル）
/invite/:token             ← 招待受け入れページ
/settings                  ← プロフィール・通知設定
```

---

## DB設計（Supabase）

### `profiles`
```sql
id uuid PRIMARY KEY REFERENCES auth.users
role text CHECK (role IN ('instructor','learner','guardian'))
display_name text
line_user_id text
avatar_url text            -- Supabase Storageのパス（avatars/バケット）
created_at timestamptz DEFAULT now()
```

### `guardian_learner`（保護者↔受講者の紐づけ）
```sql
guardian_id uuid REFERENCES profiles
learner_id uuid REFERENCES profiles
PRIMARY KEY (guardian_id, learner_id)
```

### `rooms`（ルーム）
```sql
id uuid PRIMARY KEY DEFAULT gen_random_uuid()
name text
instructor_id uuid REFERENCES profiles
lesson_minutes int DEFAULT 60  -- 30分単位で指定可（60・90・120など）
created_at timestamptz DEFAULT now()
```

### `room_members`
```sql
id uuid PRIMARY KEY DEFAULT gen_random_uuid()
room_id uuid REFERENCES rooms
learner_id uuid REFERENCES profiles
display_name text          -- 講師が設定する名前
joined_at timestamptz DEFAULT now()
```

### `invitations`（招待）
```sql
id uuid PRIMARY KEY DEFAULT gen_random_uuid()
room_id uuid REFERENCES rooms
display_name text          -- 講師が設定する名前
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
week_key text              -- 例: '2025-1-6'
day_index int              -- 0=日〜6=土
slot_start int             -- 分単位（例: 510 = 8:30）、30分単位固定
status text DEFAULT 'available'
```

### `lessons`（確定した授業）
```sql
id uuid PRIMARY KEY DEFAULT gen_random_uuid()
room_id uuid REFERENCES rooms
scheduled_at timestamptz
duration_minutes int
status text DEFAULT 'scheduled' CHECK (status IN ('scheduled','done','cancelled'))
created_at timestamptz DEFAULT now()
```

### `lesson_records`（授業記録）
```sql
id uuid PRIMARY KEY DEFAULT gen_random_uuid()
lesson_id uuid REFERENCES lessons
content text               -- 授業内容メモ
homework text              -- 宿題内容
created_at timestamptz DEFAULT now()
```

### `lesson_files`（宿題・教材ファイル）
```sql
id uuid PRIMARY KEY DEFAULT gen_random_uuid()
lesson_id uuid REFERENCES lessons
uploader_id uuid REFERENCES profiles
file_type text CHECK (file_type IN ('homework','material'))
file_path text             -- Supabase Storageのパス
file_name text
created_at timestamptz DEFAULT now()
```

### `notification_settings`（通知設定）
```sql
id uuid PRIMARY KEY DEFAULT gen_random_uuid()
user_id uuid REFERENCES profiles
room_id uuid REFERENCES rooms
lesson_confirmed boolean DEFAULT true   -- 予約確定時通知
morning_notify boolean DEFAULT true     -- 当日朝通知
morning_time time DEFAULT '07:30'       -- 朝の通知時刻（ユーザーが変更可）
pre_lesson_notify boolean DEFAULT true  -- 授業前通知
pre_lesson_minutes int DEFAULT 30       -- 何分前か（ユーザーが変更可）
created_at timestamptz DEFAULT now()
updated_at timestamptz DEFAULT now()
UNIQUE (user_id, room_id)
```

---

## 主要機能仕様

### 認証フロー
1. LINEログインボタン → LINE OAuth → Supabase Auth
2. 初回ログイン時にロール選択（講師 / 受講者 / 保護者）
3. プロフィール設定（display_name・アバター画像アップロード）

### アバター設定
- 講師・受講者ともにアバター画像を設定可能
- Supabase Storageの`avatars/`バケットに保存
- 未設定時はdisplay_nameのイニシャルをフォールバック表示

### ルーム・招待フロー（講師側）
1. ルーム作成（名前・授業時間を設定）
2. 受講者を招待：名前入力 → トークン生成 → LINEで共有
3. 保護者を招待：名前入力 + 紐づく受講者を選択 → トークン生成 → LINEで共有

### 招待受け入れフロー（受講者・保護者側）
1. `/invite/:token` にアクセス
2. LINEログイン
3. 自動的にroom_members / guardian_learnerに登録

### スケジュール調整
- **時間スロット**: 30分単位固定でスロット生成（7:00〜23:00）
- **授業時間分の連続スロット**が全員空いている場合に「決定」表示
- 週単位表示、週の切替可能
- モード: 入力 / 消去 / 閲覧
- 保存ボタンで一括Supabase保存
- タップ操作のみ（スマホ最適化）

### 通知設定
- 講師・受講者・保護者それぞれが個別に設定可能
- 設定項目:
  - 予約確定通知（on/off）
  - 当日朝通知（on/off・時刻指定）
  - 授業N分前通知（on/off・分数指定）
- デフォルト値は講師がルーム作成時に設定
- Supabase Edge Functions + pg_cronでスケジュール実行
- LINE Messaging APIで送信

### 授業記録
- 授業ごとに内容メモ・宿題を記録（講師が入力）
- ファイル添付（宿題・教材、Supabase Storage）
- 受講者・保護者も閲覧可能

---

## 実装済み機能（2026-03-21時点）

### 認証
- LINEログイン（OAuth 2.0 authorization code grant）
  - iOSのSFSafariViewController問題によりstate検証は廃止（localStorageが共有されないため）
  - Edge Function `line-auth` でLINEトークン交換 → Supabase Auth セッション発行
  - 既存ユーザーのline_user_id自動紐付け対応
- メールログイン（Supabase Auth）
- 設定画面でのLINE連携状態表示（`line_u...@...`形式のメールは「LINEアカウント」と表示）

### セットアップフロー
- `/setup/role` → `/setup/profile` → `/dashboard` の順
- 役割設定済みの場合は `/setup/role` をスキップ
- 名前設定済みの場合は `/setup/profile` をスキップ（上書き防止）
- LINEユーザーはprofileが既存のため INSERT ではなく UPDATE で役割保存

### ルーム・招待
- 先生によるルーム作成（名前・授業時間）
- 生徒・保護者への招待リンク発行
- 招待受け入れページ（`/invite/:token`）
  - 未ログインの場合はログイン/新規登録へ誘導（token付きredirect）
  - authLoading待機後にsession判定（ログイン状態の誤判定を防止）

### ダッシュボード
- 先生: 自分が作ったルーム一覧、ルーム作成・削除
- 生徒・保護者: 参加しているルーム一覧
- 今日の授業バナー表示
- 各ルームの次回授業日・宿題件数表示

### iOS対応
- `font-size: 16px !important` でinput自動ズーム防止（`src/index.css`）

### UIルール
- アプリ内に絵文字は使用しない
- メールラベルは「メール」（「メールアドレス」ではない）
- 長いメールアドレスはtruncateで省略

### DBマイグレーション（適用済み）
- `profiles.role` を NOT NULL → nullable に変更（LINEユーザーのロール設定前対応）
- `room_members` に INSERT RLSポリシー追加（`learner_id = auth.uid()`）

### Edge Functions（Supabase）
- `line-auth`: LINEトークン交換・ユーザー作成/セッション発行
- `line-notify`: LINE Messaging API通知送信

---

## 開発フェーズ

### フェーズ1（完了）環境構築
- Vite + React、Tailwind CSS、React Router、TanStack Query
- GitHub Pages デプロイ設定
- Supabase クライアント設定

### フェーズ2（完了）認証・プロフィール
- LINEログイン認証（iOS Safari対応済み）
- プロフィール作成・アバターアップロード

### フェーズ3（完了）ルーム・招待
- ルーム作成
- 招待機能（受講者・保護者）
- 招待受け入れページ

### フェーズ4（完了）スケジュール調整
- スケジュール調整画面
- 30分単位スロット・授業時間対応

### フェーズ5（完了）授業記録・宿題
- 授業記録・宿題入力
- 先生専用「通知」タブ・授業完了LINE通知テンプレート

### フェーズ6（実装中）通知
- LINE Messaging API設定済み
- Edge Functions + pg_cronで通知スケジュール実装済み
- 先生によるLINE連絡送信機能（宛先選択）

---

## 注意事項
- 変更前に必ずユーザーに確認を取ること
- GitHub Pagesへのデプロイ確認後に次のフェーズへ進む
- 段階的に進め、各フェーズで動作確認を行う
- スマホファーストで実装（タップ操作最適化）
- Supabase RLSポリシーを各テーブルに適切に設定する
- DB・コード内のロール名は汎用名称（instructor/learner/guardian）を使用
- UI表示は初期リリース時は家庭教師向け文言（先生・生徒・保護者）で実装
- アプリ内に絵文字は使用しない
