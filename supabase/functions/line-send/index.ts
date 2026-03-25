import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function sendLineMessage(lineUserId: string, message: string): Promise<{ ok: boolean; status: number; error?: string }> {
  const token = Deno.env.get('LINE_MESSAGING_ACCESS_TOKEN')
  if (!token) {
    console.error('[LINE] LINE_MESSAGING_ACCESS_TOKEN が未設定')
    return { ok: false, status: 0, error: 'LINE_MESSAGING_ACCESS_TOKEN not set' }
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
    console.error(`[LINE] Push失敗: status=${res.status} to=${lineUserId} body=${body}`)
    return { ok: false, status: res.status, error: body }
  }
  console.log(`[LINE] Push成功: to=${lineUserId}`)
  return { ok: true, status: res.status }
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

  const { room_id, message, user_ids } = await req.json()
  if (!room_id || !message?.trim()) {
    return new Response(JSON.stringify({ error: 'room_id と message が必要です' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // 送信者がルームの先生か確認
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

  // 受信者を取得（生徒 + 保護者、user_ids 指定があればフィルタ）
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
  const allMemberIds = [...new Set([...learnerIds, ...guardianIds])]

  const targetIds = Array.isArray(user_ids) && user_ids.length > 0
    ? allMemberIds.filter((id: string) => user_ids.includes(id))
    : allMemberIds

  if (targetIds.length === 0) {
    return new Response(JSON.stringify({ sent: 0 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const { data: recipients } = await supabase
    .from('profiles')
    .select('line_user_id')
    .in('id', targetIds)
    .not('line_user_id', 'is', null)

  if (!recipients || recipients.length === 0) {
    return new Response(JSON.stringify({ sent: 0, message: 'LINE連携済みメンバーがいません' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const lineMessage = `📩 ${room.name}より\n\n${message.trim()}`
  let sentCount = 0
  const errors: string[] = []

  console.log(`[LINE] 送信開始: room=${room.name} recipients=${recipients.length}`)

  for (const r of recipients) {
    if (r.line_user_id) {
      const result = await sendLineMessage(r.line_user_id, lineMessage)
      if (result.ok) {
        sentCount++
      } else {
        errors.push(`${r.line_user_id}: ${result.status} ${result.error}`)
      }
    }
  }

  console.log(`[LINE] 送信完了: sent=${sentCount} errors=${errors.length}`)
  if (errors.length > 0) console.error(`[LINE] エラー詳細:`, errors)

  // 送信後にline_logsに記録
  await supabase.from('line_logs').insert({
    room_id,
    sender_id: user.id,
    type: 'manual',
    message: lineMessage,
    sent_count: sentCount,
  })

  return new Response(JSON.stringify({ sent: sentCount, errors: errors.length > 0 ? errors : undefined }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
