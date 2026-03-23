import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('認証が必要です')

    const { code, redirect_uri } = await req.json()

    const channelId = Deno.env.get('VITE_LINE_CHANNEL_ID')!
    const channelSecret = Deno.env.get('LINE_CHANNEL_SECRET')!

    // LINEアクセストークンを取得
    const tokenRes = await fetch('https://api.line.me/oauth2/v2.1/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri,
        client_id: channelId,
        client_secret: channelSecret,
      }),
    })
    const tokenData = await tokenRes.json()
    if (!tokenData.access_token) throw new Error('LINEトークン取得失敗')

    // LINEプロフィール取得
    const profileRes = await fetch('https://api.line.me/v2/profile', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    })
    const profile = await profileRes.json()
    const lineUserId: string = profile.userId

    // 認証済みユーザーのIDを取得
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    if (userError || !user) throw new Error('ユーザー情報の取得に失敗しました')

    // 既に他のユーザーが同じLINEアカウントで連携済みか確認
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    const { data: existing } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('line_user_id', lineUserId)
      .neq('id', user.id)
      .maybeSingle()

    if (existing) {
      return new Response(
        JSON.stringify({ error: 'このLINEアカウントは既に別のユーザーに連携されています' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // line_user_idを更新
    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({ line_user_id: lineUserId })
      .eq('id', user.id)
    if (updateError) throw updateError

    return new Response(
      JSON.stringify({ success: true, line_user_id: lineUserId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error(err)
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
