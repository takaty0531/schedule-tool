import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import BottomNav from '../components/BottomNav'
import Avatar from '../components/Avatar'
import type { Room, Homework } from '../types/database'

type MemberRoomRow = {
  room_id: string
  rooms: Room | Room[] | null
}

type LessonRow = {
  id: string
  room_id: string
  scheduled_at: string
  duration_minutes: number
  rooms: { name: string } | { name: string }[] | null
}

function getRoomName(value: LessonRow['rooms']): string {
  return Array.isArray(value) ? value[0]?.name ?? 'ルーム' : value?.name ?? 'ルーム'
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
}

function formatDateShort(iso: string): string {
  const d = new Date(iso)
  const days = ['日', '月', '火', '水', '木', '金', '土']
  return `${d.getMonth() + 1}/${d.getDate()}(${days[d.getDay()]})`
}

function formatDateFull(iso: string): string {
  const d = new Date(iso)
  const days = ['日', '月', '火', '水', '木', '金', '土']
  return `${d.getMonth() + 1}月${d.getDate()}日(${days[d.getDay()]})`
}

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

  const isLearner = profile?.role === 'learner'
  const isGuardian = profile?.role === 'guardian'
  const isInstructor = profile?.role === 'instructor'

  const { mutate: deleteRoom } = useMutation({
    mutationFn: async (roomId: string) => {
      const { error } = await supabase.from('rooms').delete().eq('id', roomId)
      if (error) throw error
    },
    onSuccess: () => queryClient.refetchQueries({ queryKey: ['rooms', 'instructor'] }),
  })

  // 講師: 自分のルーム一覧
  const { data: instructorRooms = [], isLoading: roomsLoading } = useQuery({
    queryKey: ['rooms', 'instructor', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rooms').select('*').eq('instructor_id', user!.id).order('created_at', { ascending: false })
      if (error) throw error
      return data as Room[]
    },
    enabled: isInstructor && !!user,
  })

  // 生徒・保護者: 参加ルーム一覧
  const { data: memberRooms = [] } = useQuery({
    queryKey: ['rooms', 'member'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('room_members').select('room_id, rooms(*)').order('joined_at', { ascending: false })
      if (error) throw error
      return (data as MemberRoomRow[])
        .map(d => (Array.isArray(d.rooms) ? d.rooms[0] : d.rooms))
        .filter((room): room is Room => !!room)
    },
    enabled: (isLearner || isGuardian) && !!user,
  })

  const rooms = isInstructor ? instructorRooms : memberRooms
  const roomIds = rooms.map(r => r.id)

  // 今日の授業
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
      return (data ?? []) as LessonRow[]
    },
    enabled: !!user,
  })

  // 次回授業（今日以降で最近のもの）
  const { data: nextLesson } = useQuery({
    queryKey: ['next_lesson_all', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('lessons')
        .select('id, room_id, scheduled_at, duration_minutes, rooms(name)')
        .eq('status', 'scheduled')
        .gt('scheduled_at', new Date().toISOString())
        .order('scheduled_at')
        .limit(1)
        .single()
      return data as LessonRow | null
    },
    enabled: !!user,
  })

  // 各ルームの次回授業（ルームカード用）
  const { data: nextLessonsMap = {} } = useQuery({
    queryKey: ['next_lessons_dashboard', roomIds.join(',')],
    queryFn: async () => {
      if (roomIds.length === 0) return {}
      const { data } = await supabase
        .from('lessons').select('id, room_id, scheduled_at')
        .in('room_id', roomIds).eq('status', 'scheduled')
        .gte('scheduled_at', new Date().toISOString()).order('scheduled_at')
      const map: Record<string, { scheduled_at: string }> = {}
      data?.forEach(l => { if (!map[l.room_id]) map[l.room_id] = l })
      return map
    },
    enabled: roomIds.length > 0,
  })

  // 生徒: 未提出の宿題一覧
  const { data: pendingHomework = [] } = useQuery({
    queryKey: ['pending_homework_dashboard', user?.id, roomIds.join(',')],
    queryFn: async () => {
      if (roomIds.length === 0) return []
      // 自分宛 or 全員宛の宿題を取得
      const { data: hwData } = await supabase
        .from('homework').select('*, rooms(name)')
        .in('room_id', roomIds)
        .or(`assigned_to.is.null,assigned_to.eq.${user!.id}`)
        .order('created_at', { ascending: false })
      if (!hwData || hwData.length === 0) return []

      // 完了済みを除外
      const { data: completions } = await supabase
        .from('homework_completions')
        .select('homework_id')
        .in('homework_id', hwData.map(h => h.id))
        .eq('learner_id', user!.id)
      const completedIds = new Set((completions ?? []).map((c: { homework_id: string }) => c.homework_id))

      return (hwData as (Homework & { rooms: { name: string } | null })[])
        .filter(hw => !completedIds.has(hw.id))
        .slice(0, 5) // 最大5件
    },
    enabled: isLearner && roomIds.length > 0,
  })

  const hasTodayLesson = todayLessons.length > 0

  return (
    <div className="min-h-svh bg-[#F7F9F7] pb-20">
      {/* ヘッダー */}
      <div className="bg-white px-4 pt-12 pb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Avatar avatarUrl={profile?.avatar_url ?? null} displayName={profile?.display_name ?? ''} size={36} />
          <div>
            <p className="text-xs text-[#6B7280]">
              {isInstructor ? '先生' : isGuardian ? '保護者' : isLearner ? '生徒' : ''}
            </p>
            <p className="text-sm font-bold text-[#1B1B1B]">{profile?.display_name}</p>
          </div>
        </div>
        <h1 className="text-lg font-bold text-[#2D6A4F]">ForClass</h1>
      </div>

      <div className="max-w-lg mx-auto px-4 py-5 space-y-4">

        {/* 今日の授業バナー */}
        {hasTodayLesson && (
          <div className="bg-[#2D6A4F] rounded-2xl p-4 text-white space-y-2">
            <p className="text-xs opacity-70 font-medium">📅 今日の授業</p>
            {todayLessons.map(l => {
              const endMin = new Date(l.scheduled_at).getHours() * 60 + new Date(l.scheduled_at).getMinutes() + l.duration_minutes
              return (
                <button key={l.id} onClick={() => navigate(`/room/${l.room_id}`)} className="w-full flex items-center justify-between">
                  <span className="font-bold text-sm">{getRoomName(l.rooms)}</span>
                  <span className="text-xs opacity-80">
                    {formatTime(l.scheduled_at)} 〜 {`${Math.floor(endMin / 60)}:${String(endMin % 60).padStart(2, '0')}`}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {/* 次回授業カード（今日の授業がない場合） */}
        {!hasTodayLesson && nextLesson && (
          <button
            onClick={() => navigate(`/room/${nextLesson.room_id}`)}
            className="w-full bg-white rounded-2xl p-4 text-left flex items-center gap-4"
          >
            <div className="w-12 h-12 bg-[#D8F3DC] rounded-xl flex flex-col items-center justify-center shrink-0">
              <span className="text-[10px] text-[#2D6A4F] font-medium leading-tight">
                {new Date(nextLesson.scheduled_at).getMonth() + 1}月
              </span>
              <span className="text-xl font-bold text-[#2D6A4F] leading-tight">
                {new Date(nextLesson.scheduled_at).getDate()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-[#6B7280]">次回の授業</p>
              <p className="font-bold text-[#1B1B1B] text-sm truncate">{getRoomName(nextLesson.rooms)}</p>
              <p className="text-xs text-[#52B788]">
                {formatDateShort(nextLesson.scheduled_at)} {formatTime(nextLesson.scheduled_at)}〜
              </p>
            </div>
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#9CA3AF" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}

        {/* 未提出の宿題（生徒のみ） */}
        {isLearner && pendingHomework.length > 0 && (
          <div className="bg-white rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-[#1B1B1B]">未提出の宿題</p>
              <span className="text-xs bg-[#FEF9C3] text-[#CA8A04] px-2 py-0.5 rounded-full font-medium">
                {pendingHomework.length}件
              </span>
            </div>
            <div className="space-y-2">
              {pendingHomework.map(hw => {
                const roomName = Array.isArray((hw as any).rooms)
                  ? (hw as any).rooms[0]?.name
                  : (hw as any).rooms?.name
                const isDueCustom = hw.due_type === 'custom' && hw.due_date
                const isOverdue = isDueCustom && new Date(hw.due_date + 'T23:59:59') < new Date()
                return (
                  <button
                    key={hw.id}
                    onClick={() => navigate(`/room/${hw.room_id}?tab=homework`)}
                    className="w-full flex items-start gap-3 text-left"
                  >
                    <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${isOverdue ? 'bg-red-400' : 'bg-[#52B788]'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-[#1B1B1B] truncate">{hw.title}</p>
                      <p className="text-xs text-[#9CA3AF]">{roomName}</p>
                    </div>
                    {isDueCustom && (
                      <span className={`text-xs font-medium shrink-0 ${isOverdue ? 'text-red-500' : 'text-orange-500'}`}>
                        {formatDateShort(hw.due_date! + 'T00:00:00')}まで
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* ルーム作成ボタン（講師のみ） */}
        {isInstructor && (
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

        {/* ルーム一覧 */}
        {roomsLoading ? (
          <div className="text-center py-16">
            <div className="w-6 h-6 border-2 border-[#2D6A4F] border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        ) : rooms.length === 0 ? (
          <div className="text-center py-16 text-[#6B7280]">
            <p className="text-sm">
              {isInstructor ? 'ルームを作成して生徒を招待しましょう' : '招待リンクからルームに参加しましょう'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {isInstructor || isGuardian ? (
              <p className="text-xs font-semibold text-[#6B7280] px-1">ルーム一覧</p>
            ) : (
              <p className="text-xs font-semibold text-[#6B7280] px-1">参加中のルーム</p>
            )}
            {rooms.map(room => {
              const next = nextLessonsMap[room.id]
              return (
                <div key={room.id} className="w-full bg-white rounded-2xl p-4 flex items-center gap-3">
                  <button onClick={() => navigate(`/room/${room.id}`)} className="flex-1 text-left min-w-0">
                    <p className="font-bold text-[#1B1B1B] truncate">{room.name}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {next ? (
                        <p className="text-xs text-[#6B7280]">
                          次回: {formatDateFull(next.scheduled_at)}
                        </p>
                      ) : (
                        <p className="text-xs text-[#9CA3AF]">授業未定</p>
                      )}
                    </div>
                  </button>
                  <div className="flex items-center gap-2 shrink-0">
                    {isInstructor && (
                      <button
                        onClick={() => confirm(`「${room.name}」を削除しますか？`) && deleteRoom(room.id)}
                        className="p-2 text-[#6B7280] hover:text-red-500 transition-colors"
                      >
                        <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}
                    <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#9CA3AF" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {showCreate && <CreateRoomModal onClose={() => setShowCreate(false)} />}
      <BottomNav />
    </div>
  )
}
