import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function sendLineMessage(lineUserId: string, message: string) {
  const token = Deno.env.get('LINE_MESSAGING_ACCESS_TOKEN')
  if (!token) {
    console.error('[LINE-NOTIFY] LINE_MESSAGING_ACCESS_TOKEN が未設定')
    return false
  }
  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      to: lineUserId,
      messages: [{ type: 'text', text: message }],
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    console.error(`[LINE-NOTIFY] Push失敗: status=${res.status} to=${lineUserId} body=${body}`)
  }
  return res.ok
}

// JST 日時フォーマット
function formatJST(isoStr: string) {
  const d = new Date(new Date(isoStr).getTime() + 9 * 60 * 60 * 1000)
  const days = ['日', '月', '火', '水', '木', '金', '土']
  const h = d.getHours()
  const m = String(d.getMinutes()).padStart(2, '0')
  return {
    date: `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日(${days[d.getDay()]})`,
    time: `${h}:${m}`,
    full: `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日(${days[d.getDay()]}) ${h}:${m}`,
  }
}

const DEFAULT_MORNING_TEMPLATE = `おはようございます！
本日 {授業時刻} から「{ルーム名}」の授業があります。

📚 宿題
{宿題}

📋 学習計画
{学習計画}`

const DEFAULT_PRE_LESSON_TEMPLATE = `⏰ {残り時間}分後に「{ルーム名}」の授業が始まります！

📅 {授業日時}`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // 送信すべき通知を取得
  const { data: notifications } = await supabase
    .from('scheduled_notifications')
    .select(`
      id,
      type,
      fire_at,
      lesson_id,
      room_id,
      lessons(scheduled_at, rooms(name)),
      profiles(line_user_id)
    `)
    .lte('fire_at', new Date().toISOString())
    .eq('sent', false)

  if (!notifications || notifications.length === 0) {
    return new Response(JSON.stringify({ sent: 0 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // room_id ごとにテンプレート設定をまとめて取得
  const roomIds = [...new Set(notifications.map(n => n.room_id))]
  const { data: settingRows } = await supabase
    .from('notification_settings')
    .select('room_id, morning_template, pre_lesson_template')
    .in('room_id', roomIds)

  const settingsMap: Record<string, { morning_template: string | null; pre_lesson_template: string | null }> = {}
  for (const s of settingRows ?? []) {
    settingsMap[s.room_id] = { morning_template: s.morning_template, pre_lesson_template: s.pre_lesson_template }
  }

  let sentCount = 0

  for (const notif of notifications) {
    const profile = notif.profiles as { line_user_id: string | null } | null
    const lesson = notif.lessons as { scheduled_at: string; rooms: { name: string } | null } | null

    if (!profile?.line_user_id || !lesson) continue

    const lessonDate = new Date(lesson.scheduled_at)
    const { full: lessonFull, time: lessonTime } = formatJST(lesson.scheduled_at)
    const roomName = (lesson.rooms as { name: string } | null)?.name ?? 'ルーム'
    const setting = settingsMap[notif.room_id] ?? {}

    let message = ''

    if (notif.type === 'morning') {
      // 宿題・学習計画の内容を取得
      const [{ data: homeworkList }, { data: planItems }] = await Promise.all([
        supabase.from('homework').select('title').eq('lesson_id', notif.lesson_id),
        supabase.from('study_plan_items').select('title').eq('lesson_id', notif.lesson_id).is('parent_id', null),
      ])

      const template = setting.morning_template ?? DEFAULT_MORNING_TEMPLATE
      const homeworkText = homeworkList && homeworkList.length > 0
        ? homeworkList.map(h => `・${h.title}`).join('\n')
        : 'なし'
      const planText = planItems && planItems.length > 0
        ? planItems.map(p => `・${p.title}`).join('\n')
        : 'なし'

      message = template
        .replaceAll('{ルーム名}', roomName)
        .replaceAll('{授業時刻}', lessonTime)
        .replaceAll('{授業日時}', lessonFull)
        .replaceAll('{宿題}', homeworkText)
        .replaceAll('{学習計画}', planText)
    } else {
      const diffMinutes = Math.round(
        (lessonDate.getTime() - new Date(notif.fire_at).getTime()) / 60000
      )
      const template = setting.pre_lesson_template ?? DEFAULT_PRE_LESSON_TEMPLATE

      message = template
        .replaceAll('{ルーム名}', roomName)
        .replaceAll('{授業日時}', lessonFull)
        .replaceAll('{残り時間}', String(diffMinutes))
    }

    const ok = await sendLineMessage(profile.line_user_id, message)
    if (ok) {
      await supabase
        .from('scheduled_notifications')
        .update({ sent: true })
        .eq('id', notif.id)
      sentCount++
    }
  }

  return new Response(JSON.stringify({ sent: sentCount }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
