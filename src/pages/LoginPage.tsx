import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

function handleLineLogin() {
  const state = Math.random().toString(36).substring(2)
  localStorage.setItem('line_oauth_state', state)
  localStorage.setItem('line_oauth_state_ts', Date.now().toString())
  const redirectUri = `${window.location.origin}/schedule-tool/line-callback`
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: import.meta.env.VITE_LINE_CHANNEL_ID,
    redirect_uri: redirectUri,
    state,
    scope: 'profile openid',
  })
  window.location.href = `https://access.line.me/oauth2/v2.1/authorize?${params}`
}

export default function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) {
      setError('メールアドレスまたはパスワードが正しくありません')
      return
    }
    navigate('/dashboard')
  }

  return (
    <div className="min-h-svh flex flex-col items-center justify-center bg-[#F7F9F7] px-6">
      <div className="w-full max-w-sm space-y-8">
        {/* ロゴ */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-[#2D6A4F] tracking-tight">ForClass</h1>
          <p className="mt-2 text-sm text-[#6B7280]">先生と生徒をつなぐ授業管理アプリ</p>
        </div>

        {/* ログインカード */}
        <div className="bg-white rounded-2xl shadow-sm p-8">
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[#1B1B1B] mb-1">メールアドレス</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#52B788] transition-colors"
                placeholder="example@email.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#1B1B1B] mb-1">パスワード</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 pr-12 text-sm outline-none focus:border-[#52B788] transition-colors"
                  placeholder="••••••••"
                />
                <button type="button" onClick={() => setShowPassword(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6B7280]">
                  {showPassword ? (
                    <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                  ) : (
                    <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                  )}
                </button>
              </div>
            </div>

            {error && <p className="text-red-500 text-sm">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#2D6A4F] hover:bg-[#245c43] active:bg-[#1e4f39] text-white font-bold py-3 rounded-2xl transition-colors disabled:opacity-50"
            >
              {loading ? 'ログイン中...' : 'ログイン'}
            </button>
          </form>

          {/* LINE ログインボタン */}
          <div className="mt-5">
            <div className="relative flex items-center">
              <div className="flex-1 border-t border-gray-200" />
              <span className="px-3 text-xs text-[#9CA3AF]">または</span>
              <div className="flex-1 border-t border-gray-200" />
            </div>
            <button
              type="button"
              onClick={handleLineLogin}
              className="mt-4 w-full flex items-center justify-center gap-3 bg-[#06C755] hover:bg-[#05b34c] text-white font-bold py-3 rounded-2xl transition-colors"
            >
              <svg width="22" height="22" viewBox="0 0 48 48" fill="white">
                <path d="M24 4C12.95 4 4 11.86 4 21.5c0 6.37 4.1 11.96 10.3 15.18-.45 1.68-1.63 6.1-1.87 7.05-.3 1.17.43 1.16 1.01.84.47-.27 7.43-4.91 10.44-6.9.69.1 1.4.15 2.12.15 11.05 0 20-7.86 20-17.5S35.05 4 24 4z"/>
              </svg>
              LINEでログイン
            </button>
          </div>

          <div className="mt-6 space-y-2 text-center text-sm text-[#6B7280]">
            <p>
              アカウントをお持ちでない方は
              <Link to="/register" className="text-[#2D6A4F] font-medium ml-1">新規登録</Link>
            </p>
            <p>
              <Link to="/forgot-password" className="text-[#2D6A4F] font-medium">パスワードを忘れた方</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
