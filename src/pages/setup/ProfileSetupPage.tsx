import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'

export default function ProfileSetupPage() {
  const navigate = useNavigate()
  const { user, profile, refreshProfile } = useAuth()
  const [displayName, setDisplayName] = useState('')

  // 名前が登録済みならスキップ
  useEffect(() => {
    if (profile?.display_name) navigate('/dashboard', { replace: true })
  }, [profile, navigate])
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !displayName.trim()) return
    setError('')
    setLoading(true)

    let avatar_url: string | null = null

    // アバター画像アップロード
    if (avatarFile) {
      const ext = avatarFile.name.split('.').pop()
      const path = `${user.id}/avatar.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, avatarFile, { upsert: true })
      if (uploadError) {
        setError('画像のアップロードに失敗しました')
        setLoading(false)
        return
      }
      avatar_url = path
    }

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ display_name: displayName.trim(), avatar_url })
      .eq('id', user.id)

    if (updateError) {
      setError('保存に失敗しました')
      setLoading(false)
      return
    }

    await refreshProfile()
    setLoading(false)
    navigate('/dashboard')
  }

  return (
    <div className="min-h-svh flex flex-col items-center justify-center bg-[#F7F9F7] px-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-[#1B1B1B]">プロフィール設定</h2>
          <p className="mt-2 text-sm text-[#6B7280]">あとから変更できます</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* アバター */}
            <div className="flex flex-col items-center gap-3">
              <div className="w-20 h-20 rounded-full bg-[#D8F3DC] flex items-center justify-center overflow-hidden">
                {avatarPreview ? (
                  <img src={avatarPreview} alt="アバター" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-2xl text-[#2D6A4F] font-bold">
                    {displayName.charAt(0) || '?'}
                  </span>
                )}
              </div>
              <label className="text-sm text-[#2D6A4F] font-medium cursor-pointer">
                画像を選択
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarChange}
                />
              </label>
            </div>

            {/* 表示名 */}
            <div>
              <label className="block text-sm font-medium text-[#1B1B1B] mb-1">表示名</label>
              <input
                type="text"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                required
                maxLength={20}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#52B788] transition-colors"
                placeholder="山田 太郎"
              />
            </div>

            {error && <p className="text-red-500 text-sm">{error}</p>}

            <button
              type="submit"
              disabled={loading || !displayName.trim()}
              className="w-full bg-[#2D6A4F] hover:bg-[#245c43] text-white font-bold py-3 rounded-2xl transition-colors disabled:opacity-50"
            >
              {loading ? '保存中...' : 'はじめる'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
