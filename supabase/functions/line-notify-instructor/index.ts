import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

  // 呼び出し元ユーザーの認証
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

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // 呼び出し元がルームのメンバーか確認
  const { data: membership } = await supabase
    .from('room_members')
    .select('learner_id')
    .eq('room_id', room_id)
    .eq('learner_id', user.id)
    .maybeSingle()

  if (!membership) {
    return new Response(JSON.stringify({ error: '権限がありません' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // ルームの講師のLINE IDを取得
  const { data: room } = await supabase
    .from('rooms')
    .select('instructor_id')
    .eq('id', room_id)
    .single()

  if (!room) {
    return new Response(JSON.stringify({ error: 'ルームが見つかりません' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const { data: instructor } = await supabase
    .from('profiles')
    .select('line_user_id')
    .eq('id', room.instructor_id)
    .single()

  if (!instructor?.line_user_id) {
    return new Response(JSON.stringify({ sent: 0, message: '講師がLINE未連携です' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // LINE送信
  const token = Deno.env.get('LINE_MESSAGING_ACCESS_TOKEN')
  if (!token) {
    return new Response(JSON.stringify({ error: 'LINE_MESSAGING_ACCESS_TOKEN not set' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      to: instructor.line_user_id,
      messages: [{ type: 'text', text: message }],
    }),
  })

  const sent = res.ok ? 1 : 0
  if (!res.ok) {
    const body = await res.text()
    console.error(`[LINE] Push失敗: status=${res.status} body=${body}`)
  }

  return new Response(JSON.stringify({ sent }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
