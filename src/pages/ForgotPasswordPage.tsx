import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/schedule-tool/reset-password`,
    })
    setLoading(false)
    if (error) {
      setError('送信に失敗しました。もう一度お試しください')
      return
    }
    setSent(true)
  }

  return (
    <div className="min-h-svh flex flex-col items-center justify-center bg-[#F7F9F7] px-6">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-[#2D6A4F] tracking-tight">ForClass</h1>
          <p className="mt-2 text-sm text-[#6B7280]">パスワードの再設定</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-8">
          {sent ? (
            <div className="text-center space-y-4">
              <p className="text-4xl">📧</p>
              <p className="font-bold text-[#1B1B1B]">メールを送信しました</p>
              <p className="text-sm text-[#6B7280]">{email} に再設定リンクを送りました。メールをご確認ください。</p>
              <Link to="/" className="block text-sm text-[#2D6A4F] font-medium mt-4">ログイン画面に戻る</Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-sm text-[#6B7280]">登録したメールアドレスを入力してください。パスワード再設定リンクをお送りします。</p>
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

              {error && <p className="text-red-500 text-sm">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#2D6A4F] hover:bg-[#245c43] text-white font-bold py-3 rounded-2xl transition-colors disabled:opacity-50"
              >
                {loading ? '送信中...' : '再設定メールを送る'}
              </button>

              <p className="text-center">
                <Link to="/" className="text-sm text-[#2D6A4F] font-medium">ログイン画面に戻る</Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
