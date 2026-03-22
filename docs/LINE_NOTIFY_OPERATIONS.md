# LINE通知 運用メモ

## 対象
- `line-notify`（定期通知）
- `line-lesson-done`（授業完了通知）
- `line-send`（手動送信）

## 失敗時の基本方針
- 定期通知は `sent=false` のまま残す（再実行対象）
- 一時失敗が想定されるため、ジョブ再実行でリカバリする
- 手動送信/授業完了通知は画面またはログで失敗を確認する

## 監視指標（最低限）
- 送信対象件数
- 成功件数（`sent`）
- 失敗件数（対象件数 - 成功件数）

## 定期ジョブ例（pg_cron）
- 5分ごとに通知関数を実行する構成を想定
- SQL例（環境に合わせてURL/鍵を差し替え）

```sql
select cron.schedule(
  'forclass-line-notify-every-5min',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/line-notify',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
```
