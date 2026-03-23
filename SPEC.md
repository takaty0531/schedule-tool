# ForClass - 家庭教師アプリ 設計書

> 最終更新: 2026-03-23
> 運営者: WINDE
> リポジトリ: https://github.com/takaty0531/schedule-tool
> 本番URL: https://takaty0531.github.io/schedule-tool/

---

## 1. 概要

**ForClass** は家庭教師と生徒・保護者をつなぐWebアプリケーション。授業スケジュールの自動調整、宿題管理、学習計画、LINE通知を統合的に提供する。

- **初期リリース**: 家庭教師向け
- **将来展開**: 塾・音楽教室・スポーツコーチ等へのジャンル拡張
- **ホスティング**: GitHub Pages（フロントエンド）
- **バックエンド**: Supabase（Auth・DB・Storage・Edge Functions）

---

## 2. 技術スタック

| 区分 | 技術 | バージョン |
|------|------|------------|
| フロントエンド | React + TypeScript | React 19 / TS 5.9 |
| スタイリング | Tailwind CSS | v4 |
| 状態管理 | TanStack React Query | v5 |
| ルーティング | React Router | v7 |
| ビルド | Vite | v8 |
| バックエンド | Supabase（PostgreSQL 17） | supabase-js v2 |
| Edge Functions | Deno（Supabase Edge Functions） | - |
| 外部連携 | LINE Messaging API | - |
| デプロイ | GitHub Actions → GitHub Pages | - |
| リージョン | ap-southeast-1（シンガポール） | - |

---

## 3. デザイン仕様

- **雰囲気**: ミニマル・クリーン、スマホファースト
- **ダークモード**: なし

### カラーパレット

| 用途 | カラーコード | 説明 |
|------|-------------|------|
| primary | `#2D6A4F` | メインカラー（深緑） |
| primary-mid | `#52B788` | アクセント |
| primary-light | `#D8F3DC` | 選択状態背景 |
| bg | `#F7F9F7` | ページ背景 |
| text | `#1B1B1B` | メインテキスト |
| sub | `#6B7280` | サブテキスト |
| warning | `#FEF9C3` / `#CA8A04` | 警告（黄色系） |
| error | red-400 / red-500 | エラー・期限超過 |
| LINE | `#06C755` | LINE連携 |

---

## 4. ユーザーロール

| ロール（DB） | UI表示 | 説明 | 主な権限 |
|-------------|--------|------|----------|
| `instructor` | 先生 | 授業を提供する側 | ルーム作成・削除、招待、宿題管理、授業記録、通知設定、LINE送信 |
| `learner` | 生徒 | 授業を受ける側 | スケジュール入力、宿題完了マーク、ファイル提出 |
| `guardian` | 保護者 | 生徒の保護者 | 授業スケジュール・宿題の閲覧（編集不可） |

---

## 5. ページ一覧・ルーティング

### 認証ガード

| ガード | 条件 | リダイレクト先 |
|--------|------|----------------|
| PublicRoute | 未認証のみ | `/dashboard` |
| PrivateRoute | 認証済みのみ | `/`（ログイン） |
| ProfileRoute | 認証済み + プロフィール設定済み | `/setup/role` |

### ルート定義

| パス | ページ | ガード | 説明 |
|------|--------|--------|------|
| `/` | LoginPage | PublicRoute | ログイン（メール/LINE） |
| `/register` | RegisterPage | PublicRoute | 新規登録（メール/LINE） |
| `/forgot-password` | ForgotPasswordPage | PublicRoute | パスワードリセット申請 |
| `/reset-password` | ResetPasswordPage | - | パスワードリセット完了 |
| `/line-callback` | LineCallbackPage | - | LINE OAuthコールバック（ログイン/連携兼用） |
| `/setup/role` | RoleSelectPage | PrivateRoute | ロール選択 |
| `/setup/profile` | ProfileSetupPage | PrivateRoute | 表示名・アバター設定 |
| `/dashboard` | DashboardPage | ProfileRoute | ホーム画面 |
| `/room/:id` | RoomPage | ProfileRoute | ルーム詳細（5タブ） |
| `/room/:id/records` | RoomRecordsPage | ProfileRoute | 授業記録一覧 |
| `/room/:id/lesson/:lid` | LessonDetailPage | ProfileRoute | 授業詳細・記録編集 |
| `/invite/:token` | InvitePage | - | 招待リンク受付 |
| `/settings` | SettingsPage | ProfileRoute | 設定 |
| `/terms` | TermsPage | - | 利用規約 |
| `/privacy` | PrivacyPage | - | プライバシーポリシー |

---

## 6. 画面別機能詳細

### ダッシュボード（DashboardPage）

**講師向け:**
- 今日の授業バナー（複数対応）
- 次回の授業一覧（全ルーム分、日付順）
- 未記入の授業記録（最大5件、タップで授業詳細へ）
- 生徒別の宿題状況（未提出/提出前を区別、未提出数が多い順）
- ルーム作成ボタン
- ルーム一覧（次回授業日・削除ボタン）

**生徒向け:**
- 今日の授業バナー
- 次回の授業一覧（全ルーム分）
- 未提出の宿題（期限超過、赤表示）
- 提出前の宿題（期限前、提出日表示）
- 参加中のルーム一覧

### ルーム詳細（RoomPage）- 5タブ

**詳細タブ:**
- 授業予定一覧（キャンセルボタン、講師のみ。キャンセル時はスロットも削除）
- メンバー一覧（削除機能、講師のみ）
- 招待リンク生成（生徒/保護者、7日間有効）

**スケジュールタブ（ScheduleTab）:**
- 週間カレンダー（月〜日、7:00〜23:00、30分単位）
- 各ユーザーが空き時間をタップで選択
- 全生徒+講師のスロットが揃うと自動で授業確定
- 確定授業をLINE通知送信（テンプレートベース）

**学習計画タブ（StudyPlanTab）:**
- 3階層構造（教科→タイトル→サブ項目）
- 授業への割り当て機能
- 講師のみ編集可

**宿題タブ（HomeworkTab）:**
- 宿題作成（タイトル、説明、参考資料、期限設定）
- 期限タイプ: next_lesson / lesson / custom
- 生徒割り当て（全員 or 特定生徒）
- 3セクション: 提出前 / 未提出（期限超過）/ 完了
- ファイルアップロード/ダウンロード
- 完了トグル（生徒のみ）

**通知タブ（講師のみ）:**
- 定期通知設定（4種類、テンプレート編集・差し込み変数対応）
  - 授業確定通知: `{ルーム名}` `{授業一覧}`
  - 朝の通知: `{ルーム名}` `{授業時刻}` `{宿題}` `{学習計画}`
  - 授業前通知: `{ルーム名}` `{授業日時}` `{残り時間}`
  - 授業完了通知: `{授業日時}` `{宿題}` `{次回授業}` `{学習計画}` `{授業記録}`
- LINE手動送信（メンバー選択、メッセージ入力）
- LINE送信履歴

### 授業詳細（LessonDetailPage）
- 授業情報（日時、ルーム名、ステータス）
- 授業記録編集（講師のみ）
- 授業完了マーク（講師のみ、LINE通知自動送信）
- ファイル管理
- 関連宿題一覧

### 設定（SettingsPage）
- プロフィール編集（表示名、アバター）
- アカウント情報（メール、ロール）
- LINE連携ボタン（未連携時）/ 連携済み表示
- 通知設定（講師、ルーム別リンク）
- 利用規約・プライバシーポリシーリンク
- ログアウト

---

## 7. データベース設計

### テーブル関連図

```
profiles (auth.users参照)
├── rooms (instructor_id)
│   ├── lessons (room_id) [CASCADE]
│   │   ├── lesson_records (lesson_id) [CASCADE]
│   │   ├── lesson_files (lesson_id) [CASCADE]
│   │   ├── scheduled_notifications (lesson_id) [CASCADE]
│   │   ├── homework.lesson_id [SET NULL]
│   │   ├── homework.due_lesson_id [SET NULL]
│   │   ├── study_plan_items.lesson_id [SET NULL]
│   │   └── line_logs.lesson_id [SET NULL]
│   ├── room_members (room_id) [CASCADE]
│   ├── invitations (room_id) [CASCADE]
│   ├── slots (room_id) [CASCADE]
│   ├── homework (room_id) [CASCADE]
│   │   ├── homework_completions (homework_id) [CASCADE]
│   │   └── homework_files (homework_id) [CASCADE]
│   ├── study_plan_items (room_id) [CASCADE]
│   ├── notification_settings (room_id) [CASCADE]
│   ├── scheduled_notifications (room_id) [CASCADE]
│   └── line_logs (room_id) [CASCADE]
└── guardian_learner (guardian_id, learner_id)
```

### テーブル定義

#### profiles
| カラム | 型 | 制約 | 説明 |
|--------|------|------|------|
| id | uuid | PK, FK→auth.users | ユーザーID |
| role | text | CHECK(instructor/learner/guardian) | ロール |
| display_name | text | NOT NULL | 表示名 |
| line_user_id | text | nullable | LINE ユーザーID |
| avatar_url | text | nullable | アバター画像URL |
| created_at | timestamptz | DEFAULT now() | 作成日時 |

#### rooms
| カラム | 型 | 制約 | 説明 |
|--------|------|------|------|
| id | uuid | PK, DEFAULT gen_random_uuid() | ルームID |
| name | text | NOT NULL | ルーム名 |
| instructor_id | uuid | FK→profiles | 講師ID |
| lesson_minutes | int | DEFAULT 60 | 授業時間（分） |
| description | text | nullable | 説明 |
| created_at | timestamptz | DEFAULT now() | 作成日時 |

#### room_members
| カラム | 型 | 制約 | 説明 |
|--------|------|------|------|
| id | uuid | PK | メンバーID |
| room_id | uuid | FK→rooms ON DELETE CASCADE | ルームID |
| learner_id | uuid | FK→profiles | 生徒/保護者ID |
| display_name | text | NOT NULL | 講師が設定する表示名 |
| joined_at | timestamptz | DEFAULT now() | 参加日時 |

#### guardian_learner
| カラム | 型 | 制約 | 説明 |
|--------|------|------|------|
| guardian_id | uuid | PK, FK→profiles | 保護者ID |
| learner_id | uuid | PK, FK→profiles | 生徒ID |

#### invitations
| カラム | 型 | 制約 | 説明 |
|--------|------|------|------|
| id | uuid | PK | 招待ID |
| room_id | uuid | FK→rooms ON DELETE CASCADE | ルームID |
| display_name | text | NOT NULL | 表示名 |
| role | text | CHECK(learner/guardian) | 招待ロール |
| learner_id | uuid | FK→profiles, nullable | 保護者招待時の生徒ID |
| token | text | UNIQUE | 招待トークン |
| status | text | CHECK(pending/accepted), DEFAULT pending | 状態 |
| expires_at | timestamptz | NOT NULL | 有効期限（7日間） |
| created_at | timestamptz | DEFAULT now() | 作成日時 |

#### slots
| カラム | 型 | 制約 | 説明 |
|--------|------|------|------|
| id | uuid | PK | スロットID |
| room_id | uuid | FK→rooms ON DELETE CASCADE | ルームID |
| person_id | uuid | FK→profiles | ユーザーID |
| week_key | text | NOT NULL | 週キー（例: '2026-3-23'） |
| day_index | int | CHECK(0-6) | 曜日（0=日〜6=土） |
| slot_start | int | CHECK(0-1439) | 開始時刻（分単位） |

#### lessons
| カラム | 型 | 制約 | 説明 |
|--------|------|------|------|
| id | uuid | PK | 授業ID |
| room_id | uuid | FK→rooms ON DELETE CASCADE | ルームID |
| learner_id | uuid | FK→profiles, nullable | 担当生徒ID |
| scheduled_at | timestamptz | NOT NULL | 授業日時 |
| duration_minutes | int | NOT NULL | 授業時間（分） |
| status | text | CHECK(scheduled/done/cancelled), DEFAULT scheduled | 状態 |
| created_at | timestamptz | DEFAULT now() | 作成日時 |

#### lesson_records
| カラム | 型 | 制約 | 説明 |
|--------|------|------|------|
| id | uuid | PK | 記録ID |
| lesson_id | uuid | FK→lessons ON DELETE CASCADE, UNIQUE | 授業ID |
| content | text | nullable | 授業記録内容 |
| created_at | timestamptz | DEFAULT now() | 作成日時 |
| updated_at | timestamptz | DEFAULT now() | 更新日時 |

#### lesson_files
| カラム | 型 | 制約 | 説明 |
|--------|------|------|------|
| id | uuid | PK | ファイルID |
| lesson_id | uuid | FK→lessons ON DELETE CASCADE | 授業ID |
| uploader_id | uuid | FK→profiles | アップロード者 |
| file_type | text | CHECK(homework/material) | ファイル種別 |
| file_path | text | NOT NULL | Storageパス |
| file_name | text | NOT NULL | ファイル名 |
| created_at | timestamptz | DEFAULT now() | 作成日時 |

#### study_plan_items
| カラム | 型 | 制約 | 説明 |
|--------|------|------|------|
| id | uuid | PK | 計画ID |
| room_id | uuid | FK→rooms ON DELETE CASCADE | ルームID |
| subject | text | NOT NULL | 教科名 |
| title | text | NOT NULL | タイトル |
| parent_id | uuid | FK→self, nullable | 親項目ID |
| lesson_id | uuid | FK→lessons ON DELETE SET NULL, nullable | 割当授業ID |
| order_index | int | DEFAULT 0 | 表示順 |
| created_at | timestamptz | DEFAULT now() | 作成日時 |

#### homework
| カラム | 型 | 制約 | 説明 |
|--------|------|------|------|
| id | uuid | PK | 宿題ID |
| room_id | uuid | FK→rooms ON DELETE CASCADE | ルームID |
| lesson_id | uuid | FK→lessons ON DELETE SET NULL, nullable | 紐づけ授業ID |
| assigned_to | uuid | FK→profiles, nullable | 担当生徒（null=全員） |
| title | text | NOT NULL | タイトル |
| description | text | nullable | 説明 |
| reference_text | text | nullable | 参考資料テキスト |
| due_type | text | CHECK(lesson/next_lesson/custom), nullable | 期限種別 |
| due_date | date | nullable | 期限日（custom時） |
| due_lesson_id | uuid | FK→lessons ON DELETE SET NULL, nullable | 期限授業ID |
| created_at | timestamptz | DEFAULT now() | 作成日時 |

#### homework_completions
| カラム | 型 | 制約 | 説明 |
|--------|------|------|------|
| id | uuid | PK | 完了ID |
| homework_id | uuid | FK→homework ON DELETE CASCADE | 宿題ID |
| learner_id | uuid | FK→profiles | 生徒ID |
| created_at | timestamptz | DEFAULT now() | 完了日時 |
| | | UNIQUE(homework_id, learner_id) | 重複防止 |

#### homework_files
| カラム | 型 | 制約 | 説明 |
|--------|------|------|------|
| id | uuid | PK | ファイルID |
| homework_id | uuid | FK→homework ON DELETE CASCADE | 宿題ID |
| uploader_id | uuid | FK→profiles | アップロード者 |
| file_path | text | NOT NULL | Storageパス |
| file_name | text | NOT NULL | ファイル名 |
| created_at | timestamptz | DEFAULT now() | 作成日時 |

#### notification_settings
| カラム | 型 | 制約 | 説明 |
|--------|------|------|------|
| id | uuid | PK | 設定ID |
| room_id | uuid | FK→rooms ON DELETE CASCADE, UNIQUE | ルームID |
| lesson_confirmed | boolean | DEFAULT true | 授業確定通知 |
| morning_notify | boolean | DEFAULT true | 朝の通知 |
| morning_time | time | DEFAULT '07:30' | 朝の通知時刻 |
| pre_lesson_notify | boolean | DEFAULT true | 授業前通知 |
| pre_lesson_minutes | int | DEFAULT 30 | 授業前通知（分前） |
| lesson_done_template | text | nullable | 授業完了テンプレート |
| morning_template | text | nullable | 朝の通知テンプレート |
| pre_lesson_template | text | nullable | 授業前テンプレート |
| lesson_confirmed_template | text | nullable | 授業確定テンプレート |
| created_at | timestamptz | DEFAULT now() | 作成日時 |
| updated_at | timestamptz | DEFAULT now() | 更新日時 |

#### scheduled_notifications
| カラム | 型 | 制約 | 説明 |
|--------|------|------|------|
| id | uuid | PK | 通知ID |
| user_id | uuid | FK→profiles | 対象ユーザー |
| lesson_id | uuid | FK→lessons ON DELETE CASCADE | 授業ID |
| room_id | uuid | FK→rooms ON DELETE CASCADE | ルームID |
| fire_at | timestamptz | NOT NULL | 送信予定日時 |
| sent | boolean | DEFAULT false | 送信済みフラグ |
| type | text | CHECK(morning/pre_lesson) | 通知種別 |
| created_at | timestamptz | DEFAULT now() | 作成日時 |

#### line_logs
| カラム | 型 | 制約 | 説明 |
|--------|------|------|------|
| id | uuid | PK | ログID |
| room_id | uuid | FK→rooms ON DELETE CASCADE, nullable | ルームID |
| sender_id | uuid | FK→profiles, nullable | 送信者ID |
| lesson_id | uuid | FK→lessons ON DELETE SET NULL, nullable | 授業ID |
| type | text | CHECK(manual/lesson_done) | 送信種別 |
| message | text | NOT NULL | メッセージ本文 |
| sent_count | int | DEFAULT 0 | 送信人数 |
| created_at | timestamptz | DEFAULT now() | 送信日時 |

### Storageバケット

| バケット | 公開 | 用途 | パス規則 |
|----------|------|------|----------|
| avatars | public | プロフィール画像 | `avatars/{user_id}/avatar.{ext}` |
| lessons | private | 授業資料・宿題ファイル | `lessons/{lesson_id}/{timestamp}.{ext}` |

---

## 8. RLSポリシー（Row Level Security）

全テーブルにRLS有効。ヘルパー関数: `is_room_instructor(room_id)`, `is_member_of_room(room_id)`

| テーブル | SELECT | INSERT | UPDATE | DELETE |
|----------|--------|--------|--------|--------|
| profiles | 全員 | 自分のみ | 自分のみ | - |
| rooms | 講師+メンバー | 講師 | 講師 | 講師 |
| room_members | 講師+同室メンバー | 講師+招待された人 | 講師 | 講師 |
| lessons | ルーム関係者 | 講師+メンバー | 講師 | 講師 |
| lesson_records | ルーム関係者 | 講師 | 講師 | 講師 |
| lesson_files | ルーム関係者 | アップロード者 | - | アップロード者 |
| slots | ルーム関係者 | 自分のみ | 自分のみ | 自分のみ |
| homework | ルーム関係者（割当分） | 講師 | 講師 | 講師 |
| homework_completions | ルーム関係者 | 生徒（自分分） | - | 生徒（自分分） |
| homework_files | ルーム関係者 | メンバー | - | アップロード者+講師 |
| study_plan_items | ルーム関係者 | 講師 | 講師 | 講師 |
| notification_settings | 講師+メンバー | 講師 | 講師 | 講師 |
| invitations | 全員 | 講師 | 講師+期限内の認証ユーザー | 講師 |
| line_logs | 講師 | 講師 | - | - |
| scheduled_notifications | 自分のみ | - | - | - |

---

## 9. Edge Functions

| 関数名 | トリガー | JWT | 説明 |
|--------|----------|-----|------|
| line-auth | ログイン/登録画面のLINEボタン | 不要 | LINE OAuth → ユーザー作成/検索 → セッション生成 |
| line-link | 設定画面の「連携する」ボタン | 必須 | LINE OAuth → profiles.line_user_id更新（重複チェック付き） |
| line-send | 通知タブのLINE送信・授業確定通知 | 必須 | LINE Messaging API push送信 → line_logs記録 |
| line-lesson-done | 授業詳細の「授業完了」ボタン | 必須 | テンプレート変数置換 → LINE送信 → line_logs記録 |
| line-notify | CronJob（定期実行） | 不要 | scheduled_notifications未送信分 → テンプレート置換 → LINE送信 |

---

## 10. 主要フロー

### 認証フロー
```
メール登録: /register → signUp → メール確認 → /setup/role → /setup/profile → /dashboard
LINE登録:   /register → LINE OAuth → line-auth → /setup/role → /setup/profile → /dashboard
LINE連携:   /settings → LINE OAuth(state=link) → line-link → profiles.line_user_id更新
```

### スケジュール確定フロー
```
講師・生徒がスロット選択 → 「予定を提出する」
→ 全生徒+講師の連続スロットをスキャン
→ 授業時間分揃えば lessons に自動INSERT（status=scheduled）
→ 講師が「確定授業を通知する」→ テンプレート適用 → LINE送信
```

### 授業キャンセルフロー
```
講師が授業一覧で×ボタン → 確認ダイアログ
→ 該当スロット（全参加者分）を削除
→ lessons レコードを物理削除（CASCADE で関連データも削除）
```

### 宿題フロー
```
講師が宿題作成 → 期限タイプ・生徒割り当て設定
→ 生徒がHomeworkTabで確認 → 完了トグル → homework_completions作成/削除
→ ダッシュボードで提出前/未提出を区別表示
```

### 招待フロー
```
講師がルーム詳細で招待リンク生成（token, 7日有効）
→ 生徒/保護者がリンクにアクセス → InvitePage
→ 期限・ステータス確認（クライアント+DB側RLS）
→ room_members INSERT（保護者はguardian_learnerも）
→ invitations.status = 'accepted'
```

### 期限計算ロジック（宿題）
```
due_type = 'custom'      → due_date + 'T23:59:59'
due_type = 'lesson'      → due_lesson_idの授業のscheduled_at
due_type = 'next_lesson'  → lesson_idの次回授業のscheduled_at
due_type = null           → 期限なし（常に「提出前」）
```

---

## 11. 環境変数

### フロントエンド（.env.local）
```
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=xxxxx
VITE_LINE_CHANNEL_ID=xxxxx
```

### Edge Functions（Supabase Secrets）
```
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
VITE_LINE_CHANNEL_ID
LINE_CHANNEL_SECRET
LINE_MESSAGING_ACCESS_TOKEN
```

### GitHub Actions Secrets
```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_LINE_CHANNEL_ID
```

---

## 12. ファイル構成

```
src/
├── App.tsx                    # ルーティング・認証ガード
├── main.tsx                   # エントリーポイント
├── lib/
│   ├── auth.tsx               # AuthContext・useAuth()
│   ├── supabase.ts            # Supabaseクライアント
│   └── scheduleUtils.ts       # スケジュール計算ユーティリティ
├── types/
│   └── database.ts            # DB型定義
├── components/
│   ├── Avatar.tsx              # アバター表示
│   ├── BottomNav.tsx           # ボトムナビ（ホーム・設定）
│   ├── ScheduleTab.tsx         # スケジュール管理タブ
│   ├── StudyPlanTab.tsx        # 学習計画タブ
│   └── HomeworkTab.tsx         # 宿題管理タブ
├── pages/
│   ├── LoginPage.tsx           # ログイン（メール/LINE）
│   ├── RegisterPage.tsx        # 新規登録（メール/LINE）
│   ├── DashboardPage.tsx       # ダッシュボード
│   ├── RoomPage.tsx            # ルーム詳細（5タブ）
│   ├── RoomRecordsPage.tsx     # 授業記録一覧
│   ├── LessonDetailPage.tsx    # 授業詳細
│   ├── SettingsPage.tsx        # 設定
│   ├── InvitePage.tsx          # 招待受付
│   ├── LineCallbackPage.tsx    # LINEコールバック
│   ├── ForgotPasswordPage.tsx  # パスワードリセット申請
│   ├── ResetPasswordPage.tsx   # パスワードリセット
│   ├── TermsPage.tsx           # 利用規約
│   ├── PrivacyPage.tsx         # プライバシーポリシー
│   └── setup/
│       ├── RoleSelectPage.tsx  # ロール選択
│       └── ProfileSetupPage.tsx # プロフィール設定
supabase/
└── functions/
    ├── line-auth/index.ts      # LINEログイン/新規登録
    ├── line-link/index.ts      # LINE連携（既存アカウント）
    ├── line-send/index.ts      # メッセージ送信
    ├── line-lesson-done/index.ts # 授業完了通知
    └── line-notify/index.ts    # 定期通知（CronJob）
```

---

## 13. CI/CD

### ci.yml（PRチェック）
- Node.js 20 → `npm ci` → `npm run lint` → `npm run build`

### deploy.yml（本番デプロイ）
- mainブランチpushで自動トリガー
- ビルド → dist/をGitHub Pagesにデプロイ

### GitHub Pages設定
- Settings > Pages > Source: **GitHub Actions**

---

## 14. ローカル開発

```bash
npm install            # 依存関係インストール
cp .env.example .env.local  # 環境変数設定
npm run dev            # 開発サーバー起動（http://localhost:5173）
npm run build          # 本番ビルド
npx tsc --noEmit       # 型チェック
```
