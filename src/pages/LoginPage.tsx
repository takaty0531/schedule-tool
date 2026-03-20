import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

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
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#52B788] transition-colors"
                placeholder="••••••••"
              />
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

          <p className="text-center text-sm text-[#6B7280] mt-6">
            アカウントをお持ちでない方は
            <Link to="/register" className="text-[#2D6A4F] font-medium ml-1">新規登録</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
