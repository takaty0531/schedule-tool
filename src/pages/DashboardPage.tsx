import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import BottomNav from '../components/BottomNav'
import Avatar from '../components/Avatar'
import type { Room } from '../types/database'

// ルーム作成モーダル
function CreateRoomModal({ onClose }: { onClose: () => void }) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [lessonMinutes, setLessonMinutes] = useState(60)

  const { mutate, isPending } = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('rooms').insert({
        name: name.trim(),
        instructor_id: user!.id,
        lesson_minutes: lessonMinutes,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.refetchQueries({ queryKey: ['rooms', 'instructor'] })
      onClose()
    },
  })

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-t-3xl w-full max-w-lg p-6 space-y-5" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-[#1B1B1B]">ルームを作成</h2>

        <div>
          <label className="block text-sm font-medium text-[#1B1B1B] mb-1">ルーム名</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#52B788]"
            placeholder="例: 田中さんの授業"
            maxLength={30}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[#1B1B1B] mb-2">授業時間</label>
          <div className="flex gap-2">
            {[30, 60, 90, 120].map(min => (
              <button
                key={min}
                onClick={() => setLessonMinutes(min)}
                className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-colors ${
                  lessonMinutes === min
                    ? 'bg-[#2D6A4F] text-white border-[#2D6A4F]'
                    : 'bg-white text-[#6B7280] border-gray-200'
                }`}
              >
                {min}分
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={() => mutate()}
          disabled={!name.trim() || isPending}
          className="w-full bg-[#2D6A4F] hover:bg-[#245c43] text-white font-bold py-3 rounded-2xl transition-colors disabled:opacity-50"
        >
          {isPending ? '作成中...' : '作成する'}
        </button>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const { profile, user } = useAuth()
  const navigate = useNavigate()
  const [showCreate, setShowCreate] = useState(false)

  // 講師: 自分が作ったルーム一覧
  const { data: instructorRooms = [], error: roomsError, isLoading: roomsLoading } = useQuery({
    queryKey: ['rooms', 'instructor', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rooms')
        .select('*')
        .eq('instructor_id', user!.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Room[]
    },
    enabled: profile?.role === 'instructor' && !!user,
  })

  // 生徒・保護者: 参加しているルーム一覧
  const { data: memberRooms = [] } = useQuery({
    queryKey: ['rooms', 'member'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('room_members')
        .select('room_id, rooms(*)')
        .order('joined_at', { ascending: false })
      if (error) throw error
      return data.map((d: any) => d.rooms) as Room[]
    },
    enabled: profile?.role === 'learner' || profile?.role === 'guardian',
  })

  const rooms = profile?.role === 'instructor' ? instructorRooms : memberRooms

  return (
    <div className="min-h-svh bg-[#F7F9F7] pb-20">
      {/* ヘッダー */}
      <div className="bg-white px-4 pt-12 pb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Avatar avatarUrl={profile?.avatar_url ?? null} displayName={profile?.display_name ?? ''} size={36} />
          <div>
            <p className="text-xs text-[#6B7280]">
              {profile?.role === 'instructor' ? '先生' : profile?.role === 'guardian' ? '保護者' : profile?.role === 'learner' ? '生徒' : ''}
            </p>
            <p className="text-sm font-bold text-[#1B1B1B]">{profile?.display_name}</p>
          </div>
        </div>
        <h1 className="text-lg font-bold text-[#2D6A4F]">ForClass</h1>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        {/* ルーム作成ボタン（講師のみ） */}
        {profile?.role === 'instructor' && (
          <button
            onClick={() => setShowCreate(true)}
            className="w-full bg-[#2D6A4F] hover:bg-[#245c43] text-white font-bold py-3 rounded-2xl transition-colors flex items-center justify-center gap-2"
          >
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            ルームを作成
          </button>
        )}

        {/* クエリエラー表示 */}
        {roomsError && (
          <p className="text-red-500 text-sm text-center">{(roomsError as Error).message}</p>
        )}

        {/* ルーム一覧 */}
        {roomsLoading ? (
          <div className="text-center py-16 text-[#6B7280]">
            <div className="w-6 h-6 border-2 border-[#2D6A4F] border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        ) : rooms.length === 0 ? (
          <div className="text-center py-16 text-[#6B7280]">
            <p className="text-4xl mb-3">📚</p>
            <p className="text-sm">
              {profile?.role === 'instructor' ? 'ルームを作成して生徒を招待しましょう' : '招待リンクからルームに参加しましょう'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {rooms.map(room => (
              <button
                key={room.id}
                onClick={() => navigate(`/room/${room.id}`)}
                className="w-full bg-white rounded-2xl p-4 text-left shadow-sm flex items-center justify-between"
              >
                <div>
                  <p className="font-bold text-[#1B1B1B]">{room.name}</p>
                  <p className="text-xs text-[#6B7280] mt-1">授業時間: {room.lesson_minutes}分</p>
                </div>
                <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="#9CA3AF" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            ))}
          </div>
        )}
      </div>

      {showCreate && <CreateRoomModal onClose={() => setShowCreate(false)} />}
      <BottomNav />
    </div>
  )
}
