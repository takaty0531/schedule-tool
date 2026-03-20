import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function RegisterPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [emailSent, setEmailSent] = useState(false)

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password.length < 8) {
      setError('パスワードは8文字以上で入力してください')
      return
    }
    setLoading(true)
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) {
      setLoading(false)
      if (error.message.includes('already registered') || error.message.includes('already been registered') || error.code === 'user_already_exists') {
        setError('このメールアドレスはすでに登録されています。ログイン画面からサインインしてください。')
      } else {
        setError('登録に失敗しました。もう一度お試しください')
      }
      return
    }
    // Supabaseはメール確認が有効な場合でもエラーを返さず user を返す（identities が空）
    if (data.user && data.user.identities && data.user.identities.length === 0) {
      setLoading(false)
      setError('このメールアドレスはすでに登録されています。ログイン画面からサインインしてください。')
      return
    }
    setLoading(false)
    // セッションがある場合はメール確認不要 → そのままセットアップへ
    if (data.session) {
      navigate('/setup/role')
      return
    }
    // セッションがない場合はメール確認が必要
    setEmailSent(true)
  }

  if (emailSent) {
    return (
      <div className="min-h-svh flex flex-col items-center justify-center bg-[#F7F9F7] px-6">
        <div className="w-full max-w-sm space-y-8">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-[#2D6A4F] tracking-tight">ForClass</h1>
          </div>
          <div className="bg-white rounded-2xl shadow-sm p-8 text-center space-y-4">
            <div className="w-16 h-16 bg-[#D8F3DC] rounded-full flex items-center justify-center mx-auto">
              <svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="#2D6A4F" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-[#1B1B1B]">確認メールを送信しました</h2>
            <p className="text-sm text-[#6B7280]">
              <span className="font-medium text-[#1B1B1B]">{email}</span> に確認メールを送りました。<br />
              メール内のリンクをクリックして登録を完了してください。
            </p>
            <p className="text-xs text-[#6B7280]">メールが届かない場合は迷惑メールフォルダをご確認ください。</p>
            <Link to="/" className="block mt-4 text-sm text-[#2D6A4F] font-medium">
              ログイン画面に戻る
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-svh flex flex-col items-center justify-center bg-[#F7F9F7] px-6">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-[#2D6A4F] tracking-tight">ForClass</h1>
          <p className="mt-2 text-sm text-[#6B7280]">新規アカウント登録</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-8">
          <form onSubmit={handleRegister} className="space-y-4">
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
              <label className="block text-sm font-medium text-[#1B1B1B] mb-1">パスワード（8文字以上）</label>
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
              {loading ? '登録中...' : 'アカウント作成'}
            </button>
          </form>

          <p className="text-center text-sm text-[#6B7280] mt-6">
            すでにアカウントをお持ちの方は
            <Link to="/" className="text-[#2D6A4F] font-medium ml-1">ログイン</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
