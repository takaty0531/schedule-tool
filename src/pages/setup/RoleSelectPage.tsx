import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'
import type { Role } from '../../types/database'

const roles: { value: Role; label: string; description: string }[] = [
  { value: 'instructor', label: '先生', description: '授業を提供する側' },
  { value: 'learner', label: '生徒', description: '授業を受ける側' },
  { value: 'guardian', label: '保護者', description: '生徒の保護者' },
]

export default function RoleSelectPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [selected, setSelected] = useState<Role | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleNext = async () => {
    if (!selected || !user) return
    setError('')
    setLoading(true)

    // 既存プロフィールがあればroleだけ更新、なければ新規挿入
    const { data: existing } = await supabase.from('profiles').select('id').eq('id', user.id).maybeSingle()
    const { error } = existing
      ? await supabase.from('profiles').update({ role: selected }).eq('id', user.id)
      : await supabase.from('profiles').insert({ id: user.id, role: selected, display_name: '' })

    setLoading(false)
    if (error) {
      setError('保存に失敗しました。もう一度お試しください。')
      return
    }
    navigate('/setup/profile')
  }

  return (
    <div className="min-h-svh flex flex-col items-center justify-center bg-[#F7F9F7] px-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-[#1B1B1B]">あなたの役割を選んでください</h2>
          <p className="mt-2 text-sm text-[#6B7280]">後から変更することはできません</p>
        </div>

        <div className="space-y-3">
          {roles.map(role => (
            <button
              key={role.value}
              onClick={() => setSelected(role.value)}
              className={`w-full bg-white rounded-2xl p-5 text-left border-2 transition-all ${
                selected === role.value
                  ? 'border-[#2D6A4F] bg-[#D8F3DC]'
                  : 'border-transparent shadow-sm'
              }`}
            >
              <div className="flex items-center gap-4">
                <p className="font-bold text-[#1B1B1B]">{role.label}</p>
                <p className="text-xs text-[#6B7280]">{role.description}</p>
              </div>
            </button>
          ))}
        </div>

        {error && <p className="text-red-500 text-sm text-center">{error}</p>}

        <button
          onClick={handleNext}
          disabled={!selected || loading}
          className="w-full bg-[#2D6A4F] hover:bg-[#245c43] text-white font-bold py-3 rounded-2xl transition-colors disabled:opacity-50"
        >
          {loading ? '保存中...' : '次へ'}
        </button>
      </div>
    </div>
  )
}
