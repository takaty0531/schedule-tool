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

  // 送信すべき通知を取得（fire_at が現在時刻以前 かつ 未送信）
  const { data: notifications } = await supabase
    .from('scheduled_notifications')
    .select(`
      id,
      type,
      fire_at,
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

  let sentCount = 0

  for (const notif of notifications) {
    const profile = notif.profiles as { line_user_id: string | null } | null
    const lesson = notif.lessons as { scheduled_at: string; rooms: { name: string } | null } | null

    if (!profile?.line_user_id || !lesson) continue

    const lessonDate = new Date(lesson.scheduled_at)
    const lessonJST = new Date(lessonDate.getTime() + 9 * 60 * 60 * 1000)
    const lessonHour = lessonJST.getHours()
    const lessonMinute = String(lessonJST.getMinutes()).padStart(2, '0')
    const roomName = (lesson.rooms as { name: string } | null)?.name ?? 'ルーム'

    let message = ''
    if (notif.type === 'morning') {
      message = `おはようございます！\n本日 ${lessonHour}:${lessonMinute} から「${roomName}」の授業があります。`
    } else {
      // 授業開始時刻と fire_at の差分から「何分前」を計算
      const diffMinutes = Math.round(
        (lessonDate.getTime() - new Date(notif.fire_at).getTime()) / 60000
      )
      message = `${diffMinutes}分後に「${roomName}」の授業が始まります！`
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
