import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function sendLineMessage(lineUserId: string, message: string) {
  const token = Deno.env.get('LINE_MESSAGING_ACCESS_TOKEN')!
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
  return res.ok
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const now = new Date()
  const todayJST = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  const todayStr = todayJST.toISOString().split('T')[0]
  const currentHour = todayJST.getHours()
  const currentMinute = todayJST.getMinutes()

  // 確定済み授業を取得
  const { data: lessons } = await supabase
    .from('lessons')
    .select('id, room_id, learner_id, scheduled_at, duration_minutes, rooms(name, instructor_id)')
    .eq('status', 'scheduled')
    .gte('scheduled_at', `${todayStr}T00:00:00+09:00`)
    .lt('scheduled_at', `${todayStr}T23:59:59+09:00`)

  if (!lessons || lessons.length === 0) {
    return new Response(JSON.stringify({ sent: 0 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let sentCount = 0

  for (const lesson of lessons) {
    const lessonDate = new Date(lesson.scheduled_at)
    const lessonJST = new Date(lessonDate.getTime() + 9 * 60 * 60 * 1000)
    const lessonHour = lessonJST.getHours()
    const lessonMinute = lessonJST.getMinutes()
    const room = lesson.rooms as { name: string; instructor_id: string } | null
    if (!room) continue

    // 通知設定を取得
    const { data: settings } = await supabase
      .from('notification_settings')
      .select('*')
      .eq('room_id', lesson.room_id)

    for (const setting of settings ?? []) {
      // 朝の通知（7:30頃）
      if (setting.morning_notify) {
        const [mh, mm] = setting.morning_time.split(':').map(Number)
        if (currentHour === mh && currentMinute === mm) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('line_user_id, display_name')
            .eq('id', setting.user_id)
            .maybeSingle()
          if (profile?.line_user_id) {
            const msg = `おはようございます！\n本日 ${lessonHour}:${String(lessonMinute).padStart(2, '0')} から「${room.name}」の授業があります。`
            await sendLineMessage(profile.line_user_id, msg)
            sentCount++
          }
        }
      }

      // 授業前通知
      if (setting.pre_lesson_notify) {
        const preMin = lessonHour * 60 + lessonMinute - setting.pre_lesson_minutes
        const preHour = Math.floor(preMin / 60)
        const preMinute = preMin % 60
        if (currentHour === preHour && currentMinute === preMinute) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('line_user_id, display_name')
            .eq('id', setting.user_id)
            .maybeSingle()
          if (profile?.line_user_id) {
            const msg = `${setting.pre_lesson_minutes}分後に「${room.name}」の授業が始まります！`
            await sendLineMessage(profile.line_user_id, msg)
            sentCount++
          }
        }
      }
    }
  }

  return new Response(JSON.stringify({ sent: sentCount }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
