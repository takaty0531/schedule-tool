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
    <div className="fixed inset-0 bg-black/40 z-50" onClick={onClose}>
      <div className="fixed bottom-6 left-4 right-4 max-w-lg mx-auto bg-white rounded-2xl p-6 space-y-5 overflow-y-auto" style={{ maxHeight: 'calc(100dvh - 5rem)' }} onClick={e => e.stopPropagation()}>
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
        <button onClick={onClose} className="w-full text-sm text-[#6B7280] py-2">キャンセル</button>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const { profile, user } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)

  const { mutate: deleteRoom } = useMutation({
    mutationFn: async (roomId: string) => {
      const { error } = await supabase.from('rooms').delete().eq('id', roomId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.refetchQueries({ queryKey: ['rooms', 'instructor'] })
    },
  })

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

  // 各ルームの次回授業
  const { data: nextLessonsMap = {} } = useQuery({
    queryKey: ['next_lessons_dashboard', rooms.map(r => r.id).join(',')],
    queryFn: async () => {
      if (rooms.length === 0) return {}
      const now = new Date().toISOString()
      const { data } = await supabase
        .from('lessons')
        .select('id, room_id, scheduled_at')
        .in('room_id', rooms.map(r => r.id))
        .eq('status', 'scheduled')
        .gte('scheduled_at', now)
        .order('scheduled_at')
      const map: Record<string, { scheduled_at: string }> = {}
      data?.forEach(l => { if (!map[l.room_id]) map[l.room_id] = l })
      return map
    },
    enabled: rooms.length > 0,
  })

  // 各ルームの宿題件数
  const { data: homeworkCountMap = {} } = useQuery({
    queryKey: ['homework_counts_dashboard', rooms.map(r => r.id).join(',')],
    queryFn: async () => {
      if (rooms.length === 0) return {}
      const { data } = await supabase
        .from('homework')
        .select('room_id')
        .in('room_id', rooms.map(r => r.id))
      const map: Record<string, number> = {}
      data?.forEach(h => { map[h.room_id] = (map[h.room_id] ?? 0) + 1 })
      return map
    },
    enabled: rooms.length > 0,
  })

  // 今日の授業一覧
  const { data: todayLessons = [] } = useQuery({
    queryKey: ['today_lessons', user?.id],
    queryFn: async () => {
      const now = new Date()
      const todayJST = new Date(now.getTime() + 9 * 60 * 60 * 1000)
      const todayStr = todayJST.toISOString().split('T')[0]
      const { data } = await supabase
        .from('lessons')
        .select('id, room_id, scheduled_at, duration_minutes, rooms(name)')
        .eq('status', 'scheduled')
        .gte('scheduled_at', `${todayStr}T00:00:00+09:00`)
        .lt('scheduled_at', `${todayStr}T23:59:59+09:00`)
        .order('scheduled_at')
      return data ?? []
    },
    enabled: !!user,
  })

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

        {/* 今日の授業バナー */}
        {todayLessons.length > 0 && (
          <div className="bg-[#2D6A4F] rounded-2xl p-4 text-white space-y-2">
            <p className="text-xs opacity-70 font-medium">📅 今日の授業</p>
            {todayLessons.map((l: any) => {
              const d = new Date(l.scheduled_at)
              const h = d.getHours(), m = String(d.getMinutes()).padStart(2, '0')
              const endMin = d.getHours() * 60 + d.getMinutes() + l.duration_minutes
              const eh = Math.floor(endMin / 60), em = String(endMin % 60).padStart(2, '0')
              return (
                <button
                  key={l.id}
                  onClick={() => navigate(`/room/${l.room_id}`)}
                  className="w-full flex items-center justify-between"
                >
                  <span className="font-bold text-sm">{(l.rooms as any)?.name}</span>
                  <span className="text-xs opacity-80">{h}:{m} 〜 {eh}:{em}</span>
                </button>
              )
            })}
          </div>
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
            <p className="text-sm">
              {profile?.role === 'instructor' ? 'ルームを作成して生徒を招待しましょう' : '招待リンクからルームに参加しましょう'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {rooms.map(room => (
              <div
                key={room.id}
                className="w-full bg-white rounded-2xl p-4 shadow-sm flex items-center justify-between"
              >
                <button onClick={() => navigate(`/room/${room.id}`)} className="flex-1 text-left">
                  <p className="font-bold text-[#1B1B1B]">{room.name}</p>
                  <div className="flex items-center gap-3 mt-1">
                    {nextLessonsMap[room.id] ? (
                      <p className="text-xs text-[#6B7280]">
                        次回: {(() => {
                          const d = new Date(nextLessonsMap[room.id].scheduled_at)
                          const days = ['日','月','火','水','木','金','土']
                          return `${d.getMonth()+1}月${d.getDate()}日(${days[d.getDay()]})`
                        })()}
                      </p>
                    ) : (
                      <p className="text-xs text-[#6B7280]">授業時間: {room.lesson_minutes}分</p>
                    )}
                    {(homeworkCountMap[room.id] ?? 0) > 0 && (
                      <span className="text-[10px] bg-[#D8F3DC] text-[#2D6A4F] px-2 py-0.5 rounded-full font-medium">
                        宿題 {homeworkCountMap[room.id]}件
                      </span>
                    )}
                  </div>
                </button>
                <div className="flex items-center gap-2">
                  {profile?.role === 'instructor' && (
                    <button
                      onClick={() => {
                        if (confirm(`「${room.name}」を削除しますか？`)) {
                          deleteRoom(room.id)
                        }
                      }}
                      className="p-2 text-[#6B7280] hover:text-red-500 transition-colors"
                    >
                      <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
                  <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="#9CA3AF" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showCreate && <CreateRoomModal onClose={() => setShowCreate(false)} />}
      <BottomNav />
    </div>
  )
}
