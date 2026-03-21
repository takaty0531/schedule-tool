import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import BottomNav from '../components/BottomNav'

type NotificationSetting = {
  id: string
  room_id: string
  room_name: string
  morning_notify: boolean
  morning_time: string
  pre_lesson_notify: boolean
  pre_lesson_minutes: number
}

const ROLE_LABEL: Record<string, string> = {
  instructor: '先生',
  learner: '生徒',
  guardian: '保護者',
}

export default function SettingsPage() {
  const navigate = useNavigate()
  const { user, profile, refreshProfile } = useAuth()

  const [displayName, setDisplayName] = useState(profile?.display_name ?? '')
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 通知設定
  const [notifSettings, setNotifSettings] = useState<NotificationSetting[]>([])
  const [notifSaving, setNotifSaving] = useState<string | null>(null) // room_id

  useEffect(() => {
    if (!user) return
    // ユーザーが所属するルームと通知設定を取得
    supabase
      .from('room_members')
      .select('room_id, rooms(id, name)')
      .eq('user_id', user.id)
      .then(async ({ data: members }) => {
        if (!members) return
        const settings: NotificationSetting[] = []
        for (const m of members) {
          const room = m.rooms as unknown as { id: string; name: string } | null
          if (!room) continue
          // 通知設定を取得（なければデフォルト値）
          const { data } = await supabase
            .from('notification_settings')
            .select('*')
            .eq('user_id', user.id)
            .eq('room_id', room.id)
            .maybeSingle()
          settings.push({
            id: data?.id ?? '',
            room_id: room.id,
            room_name: room.name,
            morning_notify: data?.morning_notify ?? true,
            morning_time: data?.morning_time?.slice(0, 5) ?? '07:30',
            pre_lesson_notify: data?.pre_lesson_notify ?? true,
            pre_lesson_minutes: data?.pre_lesson_minutes ?? 30,
          })
        }
        setNotifSettings(settings)
      })
  }, [user])

  const updateNotifField = (room_id: string, field: keyof NotificationSetting, value: unknown) => {
    setNotifSettings(prev =>
      prev.map(s => s.room_id === room_id ? { ...s, [field]: value } : s)
    )
  }

  const saveNotifSetting = async (s: NotificationSetting) => {
    if (!user) return
    setNotifSaving(s.room_id)
    const payload = {
      user_id: user.id,
      room_id: s.room_id,
      morning_notify: s.morning_notify,
      morning_time: s.morning_time,
      pre_lesson_notify: s.pre_lesson_notify,
      pre_lesson_minutes: s.pre_lesson_minutes,
    }
    if (s.id) {
      await supabase.from('notification_settings').update(payload).eq('id', s.id)
    } else {
      const { data } = await supabase.from('notification_settings').insert(payload).select('id').single()
      if (data) {
        setNotifSettings(prev =>
          prev.map(ns => ns.room_id === s.room_id ? { ...ns, id: data.id } : ns)
        )
      }
    }
    setNotifSaving(null)
  }

  // アバター画像 URL（公開バケット）
  const currentAvatarUrl = profile?.avatar_url
    ? supabase.storage.from('avatars').getPublicUrl(profile.avatar_url).data.publicUrl
    : null

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
  }

  const handleSave = async () => {
    if (!user || !displayName.trim()) return
    setSaving(true)
    setError('')

    let avatar_url = profile?.avatar_url ?? null

    if (avatarFile) {
      const ext = avatarFile.name.split('.').pop()
      const path = `${user.id}/avatar.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, avatarFile, { upsert: true })
      if (uploadError) {
        setError('画像のアップロードに失敗しました')
        setSaving(false)
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
      setSaving(false)
      return
    }

    await refreshProfile()
    setAvatarFile(null)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleLogout = async () => {
    if (!confirm('ログアウトしますか？')) return
    await supabase.auth.signOut()
    navigate('/')
  }

  const displayAvatar = avatarPreview ?? currentAvatarUrl

  return (
    <div className="min-h-svh bg-[#F7F9F7] pb-24">
      {/* ヘッダー */}
      <div className="bg-white px-4 pt-12 pb-4">
        <h1 className="text-lg font-bold text-[#1B1B1B]">設定</h1>
      </div>

      <div className="max-w-lg mx-auto px-4 py-5 space-y-5">

        {/* プロフィール編集 */}
        <div className="bg-white rounded-2xl p-5 space-y-4">
          <h2 className="text-sm font-bold text-[#1B1B1B]">プロフィール</h2>

          {/* アバター */}
          <div className="flex flex-col items-center gap-3">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="relative w-20 h-20 rounded-full overflow-hidden bg-[#D8F3DC] flex items-center justify-center"
            >
              {displayAvatar ? (
                <img src={displayAvatar} alt="アバター" className="w-full h-full object-cover" />
              ) : (
                <span className="text-2xl font-bold text-[#2D6A4F]">
                  {displayName.charAt(0) || '?'}
                </span>
              )}
              {/* オーバーレイ */}
              <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
            </button>
            <p className="text-xs text-[#6B7280]">タップして変更</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarChange}
            />
          </div>

          {/* 表示名 */}
          <div>
            <label className="block text-xs font-medium text-[#6B7280] mb-1">表示名</label>
            <input
              type="text"
              value={displayName}
              onChange={e => { setDisplayName(e.target.value); setSaved(false) }}
              maxLength={20}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#52B788] transition-colors"
              placeholder="山田 太郎"
            />
          </div>

          {error && <p className="text-red-500 text-xs">{error}</p>}

          <button
            onClick={handleSave}
            disabled={saving || !displayName.trim() || (displayName === profile?.display_name && !avatarFile)}
            className="w-full bg-[#2D6A4F] hover:bg-[#245c43] text-white font-bold py-3 rounded-2xl transition-colors disabled:opacity-40"
          >
            {saving ? '保存中...' : saved ? '保存しました ✓' : '保存する'}
          </button>
        </div>

        {/* アカウント情報 */}
        <div className="bg-white rounded-2xl p-5 space-y-3">
          <h2 className="text-sm font-bold text-[#1B1B1B]">アカウント</h2>
          <div className="space-y-2">
            <div className="flex items-center justify-between py-2 border-b border-gray-100">
              <span className="text-xs text-[#6B7280]">メールアドレス</span>
              <span className="text-sm text-[#1B1B1B]">{user?.email ?? '—'}</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-gray-100">
              <span className="text-xs text-[#6B7280]">ロール</span>
              <span className="text-sm text-[#1B1B1B]">{profile?.role ? ROLE_LABEL[profile.role] : '—'}</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-xs text-[#6B7280]">LINE連携</span>
              {(profile as { line_user_id?: string } | null)?.line_user_id ? (
                <span className="inline-flex items-center gap-1 text-xs text-[#06C755] font-medium">
                  <svg width="14" height="14" viewBox="0 0 48 48" fill="#06C755"><path d="M24 4C12.95 4 4 11.86 4 21.5c0 6.37 4.1 11.96 10.3 15.18-.45 1.68-1.63 6.1-1.87 7.05-.3 1.17.43 1.16 1.01.84.47-.27 7.43-4.91 10.44-6.9.69.1 1.4.15 2.12.15 11.05 0 20-7.86 20-17.5S35.05 4 24 4z"/></svg>
                  連携済み
                </span>
              ) : (
                <span className="text-xs text-[#9CA3AF]">未連携</span>
              )}
            </div>
          </div>
        </div>

        {/* LINE通知設定 */}
        {notifSettings.length > 0 && (
          <div className="bg-white rounded-2xl p-5 space-y-4">
            <h2 className="text-sm font-bold text-[#1B1B1B]">LINE通知設定</h2>
            {notifSettings.map(s => (
              <div key={s.room_id} className="border border-gray-100 rounded-xl p-4 space-y-3">
                <p className="text-sm font-medium text-[#1B1B1B]">{s.room_name}</p>

                {/* 朝の通知 */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[#6B7280]">朝の通知</span>
                    <button
                      onClick={() => updateNotifField(s.room_id, 'morning_notify', !s.morning_notify)}
                      className={`w-11 h-6 rounded-full transition-colors ${s.morning_notify ? 'bg-[#2D6A4F]' : 'bg-gray-200'}`}
                    >
                      <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5 ${s.morning_notify ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>
                  {s.morning_notify && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[#6B7280]">通知時刻</span>
                      <input
                        type="time"
                        value={s.morning_time}
                        onChange={e => updateNotifField(s.room_id, 'morning_time', e.target.value)}
                        className="border border-gray-200 rounded-lg px-2 py-1 text-sm outline-none focus:border-[#52B788]"
                      />
                    </div>
                  )}
                </div>

                {/* 授業前通知 */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[#6B7280]">授業前通知</span>
                    <button
                      onClick={() => updateNotifField(s.room_id, 'pre_lesson_notify', !s.pre_lesson_notify)}
                      className={`w-11 h-6 rounded-full transition-colors ${s.pre_lesson_notify ? 'bg-[#2D6A4F]' : 'bg-gray-200'}`}
                    >
                      <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5 ${s.pre_lesson_notify ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>
                  {s.pre_lesson_notify && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[#6B7280]">何分前</span>
                      <select
                        value={s.pre_lesson_minutes}
                        onChange={e => updateNotifField(s.room_id, 'pre_lesson_minutes', Number(e.target.value))}
                        className="border border-gray-200 rounded-lg px-2 py-1 text-sm outline-none focus:border-[#52B788]"
                      >
                        {[10, 15, 20, 30, 45, 60].map(m => (
                          <option key={m} value={m}>{m}分前</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => saveNotifSetting(s)}
                  disabled={notifSaving === s.room_id}
                  className="w-full bg-[#2D6A4F] hover:bg-[#245c43] text-white text-sm font-bold py-2 rounded-xl transition-colors disabled:opacity-40"
                >
                  {notifSaving === s.room_id ? '保存中...' : '保存'}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* ログアウト */}
        <button
          onClick={handleLogout}
          className="w-full bg-white text-red-500 font-bold py-3 rounded-2xl border border-red-100 hover:bg-red-50 transition-colors"
        >
          ログアウト
        </button>

      </div>
      <BottomNav />
    </div>
  )
}
