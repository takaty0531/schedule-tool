import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { isStandalone } from '../lib/pwa'

export default function LineCallbackPage() {
  const navigate = useNavigate()
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  const state = params.get('state') ?? ''
  // stateフォーマット: "デバイスID" or "link:デバイスID"
  const isLinkMode = state.startsWith('link:')
  const deviceId = isLinkMode ? state.replace('link:', '') : state
  const [error, setError] = useState('')
  const [showReturnGuide, setShowReturnGuide] = useState(false)

  useEffect(() => {
    if (!code) return

    const redirectUri = `${window.location.origin}/schedule-tool/line-callback`

    if (isLinkMode) {
      // LINE連携モード
      supabase.auth.getSession().then(async ({ data: { session } }) => {
        if (!session) {
          setError('ログインセッションが見つかりません')
          return
        }
        const { data, error: fnError } = await supabase.functions.invoke('line-link', {
          body: { code, redirect_uri: redirectUri },
        })
        if (fnError || data?.error) {
          setError(data?.error ?? 'LINE連携に失敗しました')
          return
        }
        navigate('/settings?line_linked=1')
      })
      return
    }

    // 通常のLINEログイン/登録モード
    supabase.functions
      .invoke('line-auth', { body: { code, redirect_uri: redirectUri } })
      .then(async ({ data, error: fnError }) => {
        if (fnError || !data?.access_token) {
          setError('LINEログインに失敗しました')
          return
        }

        const { error: sessionError } = await supabase.auth.setSession({
          access_token: data.access_token,
          refresh_token: data.refresh_token,
        })

        if (sessionError) {
          setError('セッション設定に失敗しました')
          return
        }

        // PWA standaloneモードならそのまま遷移
        if (isStandalone()) {
          navigate(data.is_new_user ? '/setup/role' : '/dashboard')
          return
        }

        // Safariで開かれた場合 → セッションをDBに保存してPWAへの橋渡し
        if (deviceId) {
          await supabase.from('pending_pwa_sessions').insert({
            device_id: deviceId,
            access_token: data.access_token,
            refresh_token: data.refresh_token,
          })
        }

        // PWAが存在する可能性がある場合は案内を表示
        if (deviceId && !isStandalone()) {
          setShowReturnGuide(true)
        } else {
          navigate(data.is_new_user ? '/setup/role' : '/dashboard')
        }
      })
  }, [code, navigate, isLinkMode, deviceId])

  if (!code) {
    return (
      <div className="min-h-svh flex flex-col items-center justify-center bg-[#F7F9F7] px-6 gap-4">
        <p className="text-red-500 text-sm">認証コードが取得できませんでした</p>
        <button onClick={() => navigate('/')} className="text-[#2D6A4F] font-medium text-sm">
          ログイン画面に戻る
        </button>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-svh flex flex-col items-center justify-center bg-[#F7F9F7] px-6 gap-4">
        <p className="text-red-500 text-sm">{error}</p>
        <button onClick={() => navigate('/')} className="text-[#2D6A4F] font-medium text-sm">
          ログイン画面に戻る
        </button>
      </div>
    )
  }

  // Safari → PWAへの案内画面
  if (showReturnGuide) {
    return (
      <div className="min-h-svh flex items-center justify-center bg-[#F7F9F7] px-6">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm p-8 text-center space-y-5">
          <div className="w-16 h-16 bg-[#D8F3DC] rounded-full flex items-center justify-center mx-auto">
            <svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="#2D6A4F" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-[#1B1B1B]">ログイン完了</h2>
          <p className="text-sm text-[#6B7280]">
            ホーム画面の<span className="font-medium text-[#2D6A4F]">ForClass</span>アプリに戻ると、自動的にログインされます。
          </p>
          <div className="pt-2 border-t border-gray-100">
            <button
              onClick={() => navigate('/dashboard')}
              className="w-full text-sm text-[#2D6A4F] font-medium py-2"
            >
              このままSafariで使う
            </button>
          </div>
        </div>
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
