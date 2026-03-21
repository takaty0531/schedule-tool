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

  // JWT検証（先生のみ送信可能）
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

  const { room_id, message } = await req.json()
  if (!room_id || !message?.trim()) {
    return new Response(JSON.stringify({ error: 'room_id と message が必要です' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Service role client で DB操作
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

  // 受信者: room_members + 先生自身（LINE連携済みのみ）
  const { data: recipients } = await supabase
    .from('profiles')
    .select('line_user_id')
    .in(
      'id',
      (await supabase
        .from('room_members')
        .select('learner_id')
        .eq('room_id', room_id)
      ).data?.map((m: { learner_id: string }) => m.learner_id) ?? []
    )
    .not('line_user_id', 'is', null)

  if (!recipients || recipients.length === 0) {
    return new Response(JSON.stringify({ sent: 0, message: 'LINE連携済みメンバーがいません' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const lineMessage = `📩 ${room.name}より\n\n${message.trim()}`
  let sentCount = 0

  for (const r of recipients) {
    if (r.line_user_id) {
      const ok = await sendLineMessage(r.line_user_id, lineMessage)
      if (ok) sentCount++
    }
  }

  return new Response(JSON.stringify({ sent: sentCount }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
