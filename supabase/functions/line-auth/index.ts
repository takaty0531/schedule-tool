import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
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
    const displayName: string = profile.displayName
    const pictureUrl: string | null = profile.pictureUrl ?? null

    // Supabase Admin クライアント
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // 既存ユーザーをline_user_idで検索
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('line_user_id', lineUserId)
      .maybeSingle()

    const email = `line_${lineUserId}@line.forclass.app`
    let userId: string

    if (existingProfile) {
      userId = existingProfile.id
    } else {
      // 新規ユーザー作成
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { line_user_id: lineUserId, display_name: displayName },
      })
      if (createError) throw createError
      userId = newUser.user!.id

      // プロフィール作成（ロール未設定 → /setup/role へ）
      await supabaseAdmin.from('profiles').insert({
        id: userId,
        display_name: displayName,
        line_user_id: lineUserId,
        avatar_url: null,
        role: null,
      })
    }

    // アバター画像URLを更新（LINEプロフィール画像）
    if (pictureUrl) {
      await supabaseAdmin
        .from('profiles')
        .update({ avatar_url: pictureUrl })
        .eq('id', userId)
        .is('avatar_url', null)
    }

    // マジックリンク生成 → セッション取得
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email,
    })
    if (linkError) throw linkError

    // セッショントークンを直接取得
    const { data: sessionData, error: sessionError } =
      await supabaseAdmin.auth.admin.getUserById(userId)
    if (sessionError) throw sessionError

    // OTPを使ってセッション作成
    const token = linkData.properties?.hashed_token
    const { data: verifyData, error: verifyError } = await supabaseAdmin.auth.verifyOtp({
      token_hash: token,
      type: 'magiclink',
    })
    if (verifyError) throw verifyError

    return new Response(
      JSON.stringify({
        access_token: verifyData.session?.access_token,
        refresh_token: verifyData.session?.refresh_token,
        user: verifyData.user,
        is_new_user: !existingProfile,
      }),
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
