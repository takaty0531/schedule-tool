import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import BottomNav from '../components/BottomNav'
import Avatar from '../components/Avatar'
import ScheduleTab from '../components/ScheduleTab'
import type { Room, RoomMember, Profile, Invitation } from '../types/database'

type Tab = 'members' | 'schedule'

// トークン生成
function generateToken() {
  return Math.random().toString(36).substring(2) + Date.now().toString(36)
}

// 招待モーダル
function InviteModal({ room, members, onClose }: { room: Room; members: (RoomMember & { profile: Profile })[]; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [role, setRole] = useState<'learner' | 'guardian'>('learner')
  const [displayName, setDisplayName] = useState('')
  const [linkedLearnerId, setLinkedLearnerId] = useState('')
  const [inviteUrl, setInviteUrl] = useState('')

  const { mutate, isPending } = useMutation({
    mutationFn: async () => {
      const token = generateToken()
      const expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7日後
      const { error } = await supabase.from('invitations').insert({
        room_id: room.id,
        display_name: displayName.trim(),
        role,
        learner_id: role === 'guardian' ? linkedLearnerId || null : null,
        token,
        expires_at,
      })
      if (error) throw error
      return token
    },
    onSuccess: (token) => {
      const url = `${window.location.origin}/schedule-tool/invite/${token}`
      setInviteUrl(url)
      queryClient.invalidateQueries({ queryKey: ['invitations', room.id] })
    },
  })

  const handleCopy = () => {
    navigator.clipboard.writeText(inviteUrl)
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-t-3xl w-full max-w-lg p-6 space-y-5" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-[#1B1B1B]">招待リンクを作成</h2>

        {!inviteUrl ? (
          <>
            {/* ロール選択 */}
            <div className="flex gap-2">
              {(['learner', 'guardian'] as const).map(r => (
                <button
                  key={r}
                  onClick={() => setRole(r)}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-colors ${
                    role === r ? 'bg-[#2D6A4F] text-white border-[#2D6A4F]' : 'bg-white text-[#6B7280] border-gray-200'
                  }`}
                >
                  {r === 'learner' ? '生徒' : '保護者'}
                </button>
              ))}
            </div>

            {/* 表示名 */}
            <div>
              <label className="block text-sm font-medium text-[#1B1B1B] mb-1">
                {role === 'learner' ? '生徒の名前' : '保護者の名前'}
              </label>
              <input
                type="text"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#52B788]"
                placeholder="例: 田中 太郎"
                maxLength={20}
              />
            </div>

            {/* 保護者の場合: 紐づく生徒を選択 */}
            {role === 'guardian' && members.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-[#1B1B1B] mb-1">紐づく生徒</label>
                <select
                  value={linkedLearnerId}
                  onChange={e => setLinkedLearnerId(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#52B788]"
                >
                  <option value="">選択してください</option>
                  {members.map(m => (
                    <option key={m.learner_id} value={m.learner_id}>{m.display_name}</option>
                  ))}
                </select>
              </div>
            )}

            <button
              onClick={() => mutate()}
              disabled={!displayName.trim() || isPending}
              className="w-full bg-[#2D6A4F] hover:bg-[#245c43] text-white font-bold py-3 rounded-2xl transition-colors disabled:opacity-50"
            >
              {isPending ? '生成中...' : '招待リンクを生成'}
            </button>
          </>
        ) : (
          // 招待URL表示
          <div className="space-y-4">
            <p className="text-sm text-[#6B7280]">以下のリンクをLINEで共有してください（7日間有効）</p>
            <div className="bg-[#F7F9F7] rounded-xl p-3 text-xs text-[#1B1B1B] break-all">{inviteUrl}</div>
            <button
              onClick={handleCopy}
              className="w-full bg-[#2D6A4F] hover:bg-[#245c43] text-white font-bold py-3 rounded-2xl transition-colors"
            >
              リンクをコピー
            </button>
            <button
              onClick={() => setInviteUrl('')}
              className="w-full text-sm text-[#6B7280] py-2"
            >
              別の招待を作成
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function RoomPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [showInvite, setShowInvite] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>('members')

  // ルーム情報
  const { data: room } = useQuery({
    queryKey: ['room', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('rooms').select('*').eq('id', id!).single()
      if (error) throw error
      return data as Room
    },
  })

  // メンバー一覧
  const { data: members = [] } = useQuery({
    queryKey: ['members', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('room_members')
        .select('*, profile:profiles(*)')
        .eq('room_id', id!)
      if (error) throw error
      return data as (RoomMember & { profile: Profile })[]
    },
  })

  // 招待一覧（講師のみ）
  const { data: invitations = [] } = useQuery({
    queryKey: ['invitations', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invitations')
        .select('*')
        .eq('room_id', id!)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Invitation[]
    },
    enabled: profile?.role === 'instructor',
  })

  if (!room) return null

  return (
    <div className="min-h-svh bg-[#F7F9F7] pb-20">
      {/* ヘッダー */}
      <div className="bg-white px-4 pt-12 pb-0 flex items-center gap-3">
        <button onClick={() => navigate('/dashboard')}>
          <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="#1B1B1B" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-[#1B1B1B]">{room.name}</h1>
          <p className="text-xs text-[#6B7280]">授業時間: {room.lesson_minutes}分</p>
        </div>
      </div>

      {/* タブ */}
      <div className="bg-white border-b border-gray-200 flex">
        {(['members', 'schedule'] as Tab[]).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${
              activeTab === tab
                ? 'border-[#2D6A4F] text-[#2D6A4F]'
                : 'border-transparent text-[#6B7280]'
            }`}
          >
            {tab === 'members' ? 'メンバー' : 'スケジュール'}
          </button>
        ))}
      </div>

      {activeTab === 'schedule' ? (
        <div className="max-w-lg mx-auto">
          <ScheduleTab room={room} members={members} />
        </div>
      ) : (
      <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
        {/* 招待ボタン（講師のみ） */}
        {profile?.role === 'instructor' && (
          <button
            onClick={() => setShowInvite(true)}
            className="w-full border-2 border-dashed border-[#52B788] text-[#2D6A4F] font-bold py-3 rounded-2xl flex items-center justify-center gap-2"
          >
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            生徒・保護者を招待
          </button>
        )}

        {/* メンバー一覧 */}
        <div>
          <h2 className="text-sm font-bold text-[#6B7280] mb-3">メンバー ({members.length})</h2>
          {members.length === 0 ? (
            <p className="text-sm text-[#6B7280] text-center py-4">まだメンバーがいません</p>
          ) : (
            <div className="space-y-2">
              {members.map(m => (
                <div key={m.id} className="bg-white rounded-2xl p-4 flex items-center gap-3">
                  <Avatar avatarUrl={m.profile.avatar_url} displayName={m.display_name} size={40} />
                  <div>
                    <p className="font-medium text-[#1B1B1B]">{m.display_name}</p>
                    <p className="text-xs text-[#6B7280]">生徒</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 招待中（未承認）一覧 */}
        {profile?.role === 'instructor' && invitations.length > 0 && (
          <div>
            <h2 className="text-sm font-bold text-[#6B7280] mb-3">招待中 ({invitations.length})</h2>
            <div className="space-y-2">
              {invitations.map(inv => (
                <div key={inv.id} className="bg-white rounded-2xl p-4 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-[#1B1B1B]">{inv.display_name}</p>
                    <p className="text-xs text-[#6B7280]">{inv.role === 'learner' ? '生徒' : '保護者'} • 招待中</p>
                  </div>
                  <span className="text-xs bg-[#D8F3DC] text-[#2D6A4F] px-2 py-1 rounded-full">pending</span>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
      )}

      {showInvite && room && (
        <InviteModal room={room} members={members} onClose={() => setShowInvite(false)} />
      )}
      <BottomNav />
    </div>
  )
}
