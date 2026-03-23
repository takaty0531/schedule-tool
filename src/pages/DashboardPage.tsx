import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import BottomNav from '../components/BottomNav'
import Avatar from '../components/Avatar'
import type { Room, Homework, Lesson } from '../types/database'

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

type UnrecordedLesson = {
  id: string
  room_id: string
  scheduled_at: string
  roomName: string
  learnerName: string | null
}

type LearnerHomeworkStatus = {
  learnerId: string
  learnerName: string
  roomId: string
  roomName: string
  overdueCount: number
  upcomingCount: number
}

function getRoomName(value: LessonRow['rooms']): string {
  return Array.isArray(value) ? value[0]?.name ?? 'ルーム' : value?.name ?? 'ルーム'
}

// 宿題の実際の期限日時を計算
function resolvedDueDate(hw: Homework, lessonsMap: Map<string, Lesson>, sortedLessons: Lesson[]): Date | null {
  if (!hw.due_type) return null
  if (hw.due_type === 'custom' && hw.due_date) return new Date(hw.due_date + 'T23:59:59')
  if (hw.due_type === 'lesson' && hw.due_lesson_id) {
    const l = lessonsMap.get(hw.due_lesson_id)
    return l ? new Date(l.scheduled_at) : null
  }
  if (hw.due_type === 'next_lesson' && hw.lesson_id) {
    const cur = lessonsMap.get(hw.lesson_id)
    if (!cur) return null
    const curTime = new Date(cur.scheduled_at)
    const next = sortedLessons.find(l => new Date(l.scheduled_at) > curTime)
    return next ? new Date(next.scheduled_at) : null
  }
  return null
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

  // 各ルームの次回授業（ダッシュボード表示 + ルームカード用）
  const { data: nextLessonsMap = {} } = useQuery({
    queryKey: ['next_lessons_dashboard', roomIds.join(',')],
    queryFn: async () => {
      if (roomIds.length === 0) return {}
      const { data } = await supabase
        .from('lessons').select('id, room_id, scheduled_at, duration_minutes, rooms(name)')
        .in('room_id', roomIds).eq('status', 'scheduled')
        .gte('scheduled_at', new Date().toISOString()).order('scheduled_at')
      const map: Record<string, LessonRow> = {}
      ;(data ?? []).forEach((l: any) => { if (!map[l.room_id]) map[l.room_id] = l as LessonRow })
      return map
    },
    enabled: roomIds.length > 0,
  })
  const nextLessonsList = Object.values(nextLessonsMap).sort(
    (a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
  )

  // 生徒: 未完了の宿題一覧（提出前 + 未提出を区別）
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

      // 期限計算用のlessonsデータ取得
      const { data: lessonsData } = await supabase
        .from('lessons').select('*').in('room_id', roomIds).order('scheduled_at')
      const lessonsList = (lessonsData ?? []) as Lesson[]
      const lMap = new Map(lessonsList.map(l => [l.id, l]))

      const now = new Date()
      return (hwData as (Homework & { rooms: { name: string } | null })[])
        .filter(hw => !completedIds.has(hw.id))
        .map(hw => {
          const due = resolvedDueDate(hw, lMap, lessonsList)
          const isOverdue = due ? due < now : false
          return { ...hw, dueDate: due, isOverdue }
        })
        .sort((a, b) => {
          // 未提出（期限超過）を先に表示
          if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1
          return 0
        })
        .slice(0, 8)
    },
    enabled: isLearner && roomIds.length > 0,
  })

  // 講師: 全ルームのメンバー一覧（未記入記録・宿題状況で共通利用）
  const { data: allRoomMembers = [] } = useQuery({
    queryKey: ['all_room_members', roomIds.join(',')],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('room_members')
        .select('learner_id, display_name, room_id')
        .in('room_id', roomIds)
      if (error) throw error
      return data as { learner_id: string; display_name: string; room_id: string }[]
    },
    enabled: isInstructor && roomIds.length > 0,
  })

  // 講師: 未記入の授業記録
  const { data: unrecordedLessons = [] } = useQuery({
    queryKey: ['unrecorded_lessons', user?.id, roomIds.join(',')],
    queryFn: async () => {
      const { data: doneLessons } = await supabase
        .from('lessons')
        .select('id, room_id, scheduled_at, learner_id, rooms(name)')
        .in('room_id', roomIds)
        .eq('status', 'done')
        .order('scheduled_at', { ascending: false })
        .limit(50)
      if (!doneLessons || doneLessons.length === 0) return []

      const { data: records } = await supabase
        .from('lesson_records')
        .select('lesson_id')
        .in('lesson_id', doneLessons.map(l => l.id))
      const recordedIds = new Set((records ?? []).map((r: { lesson_id: string }) => r.lesson_id))

      return doneLessons
        .filter(l => !recordedIds.has(l.id))
        .map(l => ({
          id: l.id,
          room_id: l.room_id,
          scheduled_at: l.scheduled_at,
          roomName: getRoomName(l.rooms as LessonRow['rooms']),
          learnerName: allRoomMembers.find(m => m.learner_id === l.learner_id && m.room_id === l.room_id)?.display_name ?? null,
        }))
        .slice(0, 5) as UnrecordedLesson[]
    },
    enabled: isInstructor && roomIds.length > 0 && allRoomMembers.length >= 0,
  })

  // 講師: 生徒別の宿題状況（未提出/提出前を区別）
  const { data: homeworkStatusByLearner = [] } = useQuery({
    queryKey: ['homework_status_by_learner', user?.id, roomIds.join(',')],
    queryFn: async () => {
      const { data: hwData } = await supabase
        .from('homework')
        .select('*, rooms(name)')
        .in('room_id', roomIds)
      if (!hwData || hwData.length === 0) return []

      const { data: completions } = await supabase
        .from('homework_completions')
        .select('homework_id, learner_id')
        .in('homework_id', hwData.map(h => h.id))
      const completedSet = new Set((completions ?? []).map((c: { homework_id: string; learner_id: string }) => `${c.homework_id}_${c.learner_id}`))

      // 期限計算用のlessonsデータ
      const { data: lessonsData } = await supabase
        .from('lessons').select('*').in('room_id', roomIds).order('scheduled_at')
      const lessonsList = (lessonsData ?? []) as Lesson[]
      const lMap = new Map(lessonsList.map(l => [l.id, l]))

      // ルームごとのメンバーマップ
      const roomMembersMap = new Map<string, { learner_id: string; display_name: string }[]>()
      allRoomMembers.forEach(m => {
        if (!roomMembersMap.has(m.room_id)) roomMembersMap.set(m.room_id, [])
        roomMembersMap.get(m.room_id)!.push(m)
      })

      const overdueMap = new Map<string, number>()
      const upcomingMap = new Map<string, number>()
      const nameMap = new Map<string, string>()
      const roomNameMap = new Map<string, string>()
      const now = new Date()

      hwData.forEach((hw: any) => {
        const rn = Array.isArray(hw.rooms) ? hw.rooms[0]?.name : hw.rooms?.name
        roomNameMap.set(hw.room_id, rn ?? 'ルーム')
        const due = resolvedDueDate(hw as Homework, lMap, lessonsList)
        const isOverdue = due ? due < now : false

        const targets = hw.assigned_to
          ? (roomMembersMap.get(hw.room_id) ?? []).filter(m => m.learner_id === hw.assigned_to)
          : (roomMembersMap.get(hw.room_id) ?? [])

        targets.forEach(m => {
          nameMap.set(m.learner_id, m.display_name)
          const key = `${hw.room_id}_${m.learner_id}`
          if (!completedSet.has(`${hw.id}_${m.learner_id}`)) {
            if (isOverdue) {
              overdueMap.set(key, (overdueMap.get(key) ?? 0) + 1)
            } else {
              upcomingMap.set(key, (upcomingMap.get(key) ?? 0) + 1)
            }
          }
        })
      })

      const keys = new Set([...overdueMap.keys(), ...upcomingMap.keys()])
      const result: LearnerHomeworkStatus[] = []
      keys.forEach(key => {
        const [roomId, learnerId] = key.split('_')
        const oc = overdueMap.get(key) ?? 0
        const uc = upcomingMap.get(key) ?? 0
        if (oc + uc > 0) {
          result.push({
            learnerId,
            learnerName: nameMap.get(learnerId) ?? '生徒',
            roomId,
            roomName: roomNameMap.get(roomId) ?? 'ルーム',
            overdueCount: oc,
            upcomingCount: uc,
          })
        }
      })
      // 未提出が多い順、次に提出前が多い順
      result.sort((a, b) => b.overdueCount - a.overdueCount || b.upcomingCount - a.upcomingCount)
      return result
    },
    enabled: isInstructor && roomIds.length > 0 && allRoomMembers.length >= 0,
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

        {/* 次回の授業一覧（今日の授業がない場合） */}
        {!hasTodayLesson && nextLessonsList.length > 0 && (
          <div className="bg-white rounded-2xl p-4 space-y-3">
            <p className="text-sm font-bold text-[#1B1B1B]">次回の授業</p>
            <div className="space-y-2">
              {nextLessonsList.map(l => (
                <button
                  key={l.id}
                  onClick={() => navigate(`/room/${l.room_id}`)}
                  className="w-full flex items-center gap-3 text-left"
                >
                  <div className="w-10 h-10 bg-[#D8F3DC] rounded-xl flex flex-col items-center justify-center shrink-0">
                    <span className="text-[9px] text-[#2D6A4F] font-medium leading-tight">
                      {new Date(l.scheduled_at).getMonth() + 1}月
                    </span>
                    <span className="text-base font-bold text-[#2D6A4F] leading-tight">
                      {new Date(l.scheduled_at).getDate()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#1B1B1B] truncate">{getRoomName(l.rooms)}</p>
                    <p className="text-xs text-[#52B788]">
                      {formatDateShort(l.scheduled_at)} {formatTime(l.scheduled_at)}〜
                    </p>
                  </div>
                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#D1D5DB" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 宿題（生徒のみ） */}
        {isLearner && pendingHomework.length > 0 && (() => {
          const overdueHw = pendingHomework.filter(hw => hw.isOverdue)
          const upcomingHw = pendingHomework.filter(hw => !hw.isOverdue)
          return (
            <div className="bg-white rounded-2xl p-4 space-y-3">
              {overdueHw.length > 0 && (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold text-red-500">未提出の宿題</p>
                    <span className="text-xs bg-red-50 text-red-500 px-2 py-0.5 rounded-full font-medium">
                      {overdueHw.length}件
                    </span>
                  </div>
                  <div className="space-y-2">
                    {overdueHw.map(hw => {
                      const roomName = Array.isArray((hw as any).rooms) ? (hw as any).rooms[0]?.name : (hw as any).rooms?.name
                      return (
                        <button key={hw.id} onClick={() => navigate(`/room/${hw.room_id}?tab=homework`)} className="w-full flex items-start gap-3 text-left">
                          <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 bg-red-400" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-[#1B1B1B] truncate">{hw.title}</p>
                            <p className="text-xs text-[#9CA3AF]">{roomName}</p>
                          </div>
                          {hw.dueDate && (
                            <span className="text-xs font-medium shrink-0 text-red-500">
                              {formatDateShort(hw.dueDate.toISOString())}まで
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </>
              )}
              {upcomingHw.length > 0 && (
                <>
                  <div className={`flex items-center justify-between ${overdueHw.length > 0 ? 'mt-2 pt-2 border-t border-gray-100' : ''}`}>
                    <p className="text-sm font-bold text-[#1B1B1B]">提出前の宿題</p>
                    <span className="text-xs bg-[#F7F9F7] text-[#6B7280] px-2 py-0.5 rounded-full font-medium">
                      {upcomingHw.length}件
                    </span>
                  </div>
                  <div className="space-y-2">
                    {upcomingHw.map(hw => {
                      const roomName = Array.isArray((hw as any).rooms) ? (hw as any).rooms[0]?.name : (hw as any).rooms?.name
                      return (
                        <button key={hw.id} onClick={() => navigate(`/room/${hw.room_id}?tab=homework`)} className="w-full flex items-start gap-3 text-left">
                          <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 bg-gray-300" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-[#1B1B1B] truncate">{hw.title}</p>
                            <p className="text-xs text-[#9CA3AF]">{roomName}</p>
                          </div>
                          {hw.dueDate && (
                            <span className="text-xs font-medium shrink-0 text-orange-500">
                              {formatDateShort(hw.dueDate.toISOString())}まで
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          )
        })()}

        {/* 未記入の授業記録（講師のみ） */}
        {isInstructor && unrecordedLessons.length > 0 && (
          <div className="bg-white rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-[#1B1B1B]">未記入の授業記録</p>
              <span className="text-xs bg-[#FEF9C3] text-[#CA8A04] px-2 py-0.5 rounded-full font-medium">
                {unrecordedLessons.length}件
              </span>
            </div>
            <div className="space-y-2">
              {unrecordedLessons.map(l => (
                <button
                  key={l.id}
                  onClick={() => navigate(`/room/${l.room_id}/lesson/${l.id}`)}
                  className="w-full flex items-center gap-3 text-left"
                >
                  <div className="w-1.5 h-1.5 rounded-full shrink-0 bg-[#CA8A04]" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[#1B1B1B] truncate">{l.roomName}</p>
                    <p className="text-xs text-[#9CA3AF]">
                      {formatDateShort(l.scheduled_at)} {formatTime(l.scheduled_at)}〜
                      {l.learnerName ? ` ・ ${l.learnerName}` : ''}
                    </p>
                  </div>
                  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#9CA3AF" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 生徒別の宿題状況（講師のみ） */}
        {isInstructor && homeworkStatusByLearner.length > 0 && (
          <div className="bg-white rounded-2xl p-4 space-y-3">
            <p className="text-sm font-bold text-[#1B1B1B]">生徒別の宿題状況</p>
            <div className="space-y-2">
              {homeworkStatusByLearner.map(s => {
                const hasOverdue = s.overdueCount > 0
                return (
                  <button
                    key={`${s.roomId}_${s.learnerId}`}
                    onClick={() => navigate(`/room/${s.roomId}?tab=homework`)}
                    className="w-full flex items-center gap-3 text-left"
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${hasOverdue ? 'bg-red-50' : 'bg-[#FEF9C3]'}`}>
                      <span className={`text-xs font-bold ${hasOverdue ? 'text-red-500' : 'text-[#CA8A04]'}`}>{s.overdueCount + s.upcomingCount}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#1B1B1B] truncate">{s.learnerName}</p>
                      <p className="text-xs text-[#9CA3AF]">{s.roomName}</p>
                    </div>
                    <div className="flex flex-col items-end shrink-0 gap-0.5">
                      {hasOverdue && (
                        <span className="text-xs text-red-500 font-medium">未提出{s.overdueCount}件</span>
                      )}
                      {s.upcomingCount > 0 && (
                        <span className="text-xs text-[#6B7280] font-medium">提出前{s.upcomingCount}件</span>
                      )}
                    </div>
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
