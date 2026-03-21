import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function LineCallbackPage() {
  const navigate = useNavigate()
  const [error, setError] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    localStorage.removeItem('line_oauth_state')
    localStorage.removeItem('line_oauth_state_ts')

    if (!code) {
      setError('認証コードが取得できませんでした')
      return
    }

    const redirectUri = `${window.location.origin}/schedule-tool/line-callback`

    supabase.functions
      .invoke('line-auth', { body: { code, redirect_uri: redirectUri } })
      .then(async ({ data, error: fnError }) => {
        if (fnError || !data?.access_token) {
          setError('LINEログインに失敗しました')
          return
        }

        // セッションをセット
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: data.access_token,
          refresh_token: data.refresh_token,
        })

        if (sessionError) {
          setError('セッション設定に失敗しました')
          return
        }

        // 新規ユーザーはロール設定へ、既存はダッシュボードへ
        if (data.is_new_user) {
          navigate('/setup/role')
        } else {
          navigate('/dashboard')
        }
      })
  }, [navigate])

  if (error) {
    return (
      <div className="min-h-svh flex flex-col items-center justify-center bg-[#F7F9F7] px-6 gap-4">
        <p className="text-red-500 text-sm">{error}</p>
        <button
          onClick={() => navigate('/')}
          className="text-[#2D6A4F] font-medium text-sm"
        >
          ログイン画面に戻る
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-svh flex items-center justify-center bg-[#F7F9F7]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-[#2D6A4F] border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-[#6B7280]">LINEでログイン中...</p>
      </div>
    </div>
  )
}
