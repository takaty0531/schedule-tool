import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const DEFAULT_TEMPLATE = `📝 授業が完了しました！

{授業日時}

📚 宿題
{宿題}

📋 学習計画
{学習計画}

✏️ 授業記録
{授業記録}

📅 次回の授業
{次回授業}`

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )

  const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
  if (userError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const { room_id, lesson_id } = await req.json()
  if (!room_id || !lesson_id) {
    return new Response(JSON.stringify({ error: 'room_id と lesson_id が必要です' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // 講師権限確認
  const { data: room } = await supabase
    .from('rooms')
    .select('instructor_id, name')
    .eq('id', room_id)
    .single()

  if (!room || room.instructor_id !== user.id) {
    return new Response(JSON.stringify({ error: '権限がありません' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // 並列でデータ取得
  const [
    { data: lesson },
    { data: homeworkList },
    { data: record },
    { data: planItems },
    { data: setting },
    { data: nextLessonData },
  ] = await Promise.all([
    supabase.from('lessons').select('scheduled_at, duration_minutes').eq('id', lesson_id).single(),
    supabase.from('homework').select('title').eq('lesson_id', lesson_id),
    supabase.from('lesson_records').select('content').eq('lesson_id', lesson_id).maybeSingle(),
    supabase.from('study_plan_items').select('title').eq('lesson_id', lesson_id).is('parent_id', null),
    supabase.from('notification_settings').select('lesson_done_template').eq('room_id', room_id).maybeSingle(),
    supabase.from('lessons').select('scheduled_at').eq('room_id', room_id).eq('status', 'scheduled')
      .gt('scheduled_at', new Date().toISOString()).order('scheduled_at').limit(1).maybeSingle(),
  ])

  if (!lesson) {
    return new Response(JSON.stringify({ error: '授業が見つかりません' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // テンプレートと変数を準備
  const template = setting?.lesson_done_template ?? DEFAULT_TEMPLATE

  const { full: lessonDatetime } = formatJST(lesson.scheduled_at)
  const endMin = (() => {
    const d = new Date(lesson.scheduled_at)
    const total = d.getHours() * 60 + d.getMinutes() + lesson.duration_minutes
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
  })()

  const vars: Record<string, string> = {
    '{授業日時}': `${lessonDatetime}〜${endMin}`,
    '{宿題}': homeworkList && homeworkList.length > 0
      ? homeworkList.map((h: { title: string }) => `・${h.title}`).join('\n')
      : '宿題なし',
    '{授業記録}': record?.content?.trim() || '記録なし',
    '{学習計画}': planItems && planItems.length > 0
      ? planItems.map((p: { title: string }) => `・${p.title}`).join('\n')
      : 'なし',
    '{次回授業}': nextLessonData
      ? formatJST(nextLessonData.scheduled_at).full
      : '未定',
  }

  // 変数を置換
  let message = template
  for (const [key, value] of Object.entries(vars)) {
    message = message.replaceAll(key, value)
  }

  // 生徒 + 保護者へ送信
  const { data: members } = await supabase
    .from('room_members')
    .select('learner_id')
    .eq('room_id', room_id)

  const learnerIds = members?.map((m: { learner_id: string }) => m.learner_id) ?? []

  // 保護者IDを取得（生徒に紐づく保護者）
  const { data: guardians } = learnerIds.length > 0
    ? await supabase
        .from('guardian_learner')
        .select('guardian_id')
        .in('learner_id', learnerIds)
    : { data: [] }

  const guardianIds = guardians?.map((g: { guardian_id: string }) => g.guardian_id) ?? []
  const allRecipientIds = [...new Set([...learnerIds, ...guardianIds])]

  const { data: recipients } = await supabase
    .from('profiles')
    .select('line_user_id')
    .in('id', allRecipientIds)
    .not('line_user_id', 'is', null)

  let sentCount = 0
  for (const r of recipients ?? []) {
    if (r.line_user_id) {
      const ok = await sendLineMessage(r.line_user_id, message)
      if (ok) sentCount++
    }
  }

  // ログ記録
  await supabase.from('line_logs').insert({
    room_id,
    sender_id: user.id,
    type: 'lesson_done',
    message,
    sent_count: sentCount,
    lesson_id,
  })

  return new Response(JSON.stringify({ sent: sentCount }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
