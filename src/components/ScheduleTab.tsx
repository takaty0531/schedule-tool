import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { Room, RoomMember, Profile, Slot, Lesson } from '../types/database'
import {
  DAY_LABELS, COL_TO_DAY_INDEX, TIME_SLOTS,
  getWeekKey, getThisMonday, prevWeekKey, nextWeekKey,
  minutesToTime, toScheduledAt, scheduledAtToSlot, isInWeek,
  dateLabelForDay, todayDayIndex,
} from '../lib/scheduleUtils'

type Props = {
  room: Room
  members: (RoomMember & { profile: Profile })[]
}

// 授業確定モーダル
function LessonConfirmModal({
  weekKey, dayIndex, slotStart, lessonMinutes, isConfirming, onConfirm, onClose,
}: {
  weekKey: string; dayIndex: number; slotStart: number
  lessonMinutes: number; isConfirming: boolean
  onConfirm: () => void; onClose: () => void
}) {
  const endMin = slotStart + lessonMinutes
  const date = (() => {
    const d = new Date(toScheduledAt(weekKey, dayIndex, slotStart))
    return `${d.getMonth() + 1}月${d.getDate()}日(${['日','月','火','水','木','金','土'][d.getDay()]})`
  })()
  return (
    <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-t-3xl w-full max-w-lg p-6 space-y-5" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-[#1B1B1B]">授業を確定しますか？</h2>
        <div className="bg-[#F7F9F7] rounded-2xl p-4 space-y-1">
          <p className="text-sm font-medium text-[#1B1B1B]">{date}</p>
          <p className="text-sm text-[#6B7280]">
            {minutesToTime(slotStart)} 〜 {minutesToTime(endMin)}（{lessonMinutes}分）
          </p>
        </div>
        <button
          onClick={onConfirm}
          disabled={isConfirming}
          className="w-full bg-[#2D6A4F] hover:bg-[#245c43] text-white font-bold py-3 rounded-2xl transition-colors disabled:opacity-50"
        >
          {isConfirming ? '確定中...' : '授業を確定する'}
        </button>
        <button onClick={onClose} className="w-full text-sm text-[#6B7280] py-2">キャンセル</button>
      </div>
    </div>
  )
}

export default function ScheduleTab({ room, members }: Props) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [weekKey, setWeekKey] = useState(() => getWeekKey(getThisMonday()))
  const [confirmingSlot, setConfirmingSlot] = useState<{ dayIndex: number; slotStart: number } | null>(null)

  const isInstructor = user?.id === room.instructor_id
  const thisWeekKey = getWeekKey(getThisMonday())
  const learnerIds = members.map(m => m.learner_id)

  // 今週のスロット取得
  const { data: slots = [] } = useQuery({
    queryKey: ['slots', room.id, weekKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('slots')
        .select('*')
        .eq('room_id', room.id)
        .eq('week_key', weekKey)
      if (error) throw error
      return data as Slot[]
    },
    enabled: !!user,
  })

  // 確定済み授業取得（当週分）
  const { data: lessons = [] } = useQuery({
    queryKey: ['lessons', room.id, weekKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lessons')
        .select('*')
        .eq('room_id', room.id)
        .eq('status', 'scheduled')
      if (error) throw error
      return (data as Lesson[]).filter(l => isInWeek(l.scheduled_at, weekKey))
    },
    enabled: !!user,
  })

  // スロットのトグル（楽観的更新）
  const { mutate: toggleSlot } = useMutation({
    mutationFn: async ({ dayIndex, slotStart }: { dayIndex: number; slotStart: number }) => {
      const existing = slots.find(
        s => s.person_id === user!.id && s.day_index === dayIndex && s.slot_start === slotStart
      )
      if (existing) {
        const { error } = await supabase.from('slots').delete().eq('id', existing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('slots').insert({
          room_id: room.id, person_id: user!.id,
          week_key: weekKey, day_index: dayIndex, slot_start: slotStart,
        })
        if (error) throw error
      }
    },
    onMutate: async ({ dayIndex, slotStart }) => {
      await queryClient.cancelQueries({ queryKey: ['slots', room.id, weekKey] })
      const prev = queryClient.getQueryData<Slot[]>(['slots', room.id, weekKey])
      queryClient.setQueryData<Slot[]>(['slots', room.id, weekKey], (old = []) => {
        const existing = old.find(
          s => s.person_id === user!.id && s.day_index === dayIndex && s.slot_start === slotStart
        )
        if (existing) return old.filter(s => s.id !== existing.id)
        return [...old, {
          id: `temp-${dayIndex}-${slotStart}`,
          room_id: room.id, person_id: user!.id,
          week_key: weekKey, day_index: dayIndex, slot_start: slotStart, status: 'available',
        }]
      })
      return { prev }
    },
    onError: (_, __, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['slots', room.id, weekKey], ctx.prev)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['slots', room.id, weekKey] }),
  })

  // 授業確定
  const { mutate: confirmLesson, isPending: isConfirming } = useMutation({
    mutationFn: async ({ dayIndex, slotStart }: { dayIndex: number; slotStart: number }) => {
      const { error } = await supabase.from('lessons').insert({
        room_id: room.id,
        scheduled_at: toScheduledAt(weekKey, dayIndex, slotStart),
        duration_minutes: room.lesson_minutes,
        status: 'scheduled',
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lessons', room.id, weekKey] })
      setConfirmingSlot(null)
    },
  })

  // スロットマップ: `${dayIndex}-${slotStart}` → Set<person_id>
  const slotsMap = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const s of slots) {
      const key = `${s.day_index}-${s.slot_start}`
      if (!map.has(key)) map.set(key, new Set())
      map.get(key)!.add(s.person_id)
    }
    return map
  }, [slots])

  // 授業マップ: `${dayIndex}-${slotStart}` → Lesson
  const lessonsMap = useMemo(() => {
    const map = new Map<string, Lesson>()
    for (const l of lessons) {
      const { dayIndex, slotStart } = scheduledAtToSlot(l.scheduled_at)
      map.set(`${dayIndex}-${slotStart}`, l)
    }
    return map
  }, [lessons])

  // セルの状態
  type CellState = 'lesson' | 'overlap' | 'mine' | 'other' | 'empty'
  function getCellState(dayIndex: number, slotStart: number): CellState {
    if (lessonsMap.has(`${dayIndex}-${slotStart}`)) return 'lesson'
    const persons = slotsMap.get(`${dayIndex}-${slotStart}`)
    if (!persons) return 'empty'
    const hasInstructor = persons.has(room.instructor_id)
    const hasLearner = learnerIds.some(id => persons.has(id))
    if (hasInstructor && hasLearner) return 'overlap'
    if (persons.has(user!.id)) return 'mine'
    if (persons.size > 0) return 'other'
    return 'empty'
  }

  // 週ラベル
  const weekLabel = (() => {
    const mon = new Date(toScheduledAt(weekKey, 1, 0)).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })
    const sun = new Date(toScheduledAt(weekKey, 0, 0)).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })
    return `${mon} 〜 ${sun}`
  })()

  const todayIdx = todayDayIndex()

  return (
    <div className="flex flex-col">
      {/* 週ナビゲーション */}
      <div className="flex items-center justify-between px-2 py-3 bg-white border-b border-gray-100">
        <button
          onClick={() => setWeekKey(prevWeekKey(weekKey))}
          className="p-2 text-[#2D6A4F]"
        >
          <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <button
          onClick={() => setWeekKey(thisWeekKey)}
          className="text-sm font-medium text-[#1B1B1B]"
        >
          {weekLabel}
        </button>
        <button
          onClick={() => setWeekKey(nextWeekKey(weekKey))}
          className="p-2 text-[#2D6A4F]"
        >
          <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* カレンダーグリッド */}
      <div className="overflow-y-auto" style={{ maxHeight: 'calc(100svh - 280px)' }}>
        {/* 曜日ヘッダー（sticky） */}
        <div
          className="sticky top-0 bg-white z-10 border-b border-gray-200"
          style={{ display: 'grid', gridTemplateColumns: '36px repeat(7, 1fr)' }}
        >
          <div />
          {DAY_LABELS.map((label, col) => {
            const dayIdx = COL_TO_DAY_INDEX[col]
            const isToday = dayIdx === todayIdx && weekKey === thisWeekKey
            return (
              <div key={col} className="text-center py-1">
                <p className={`text-xs font-medium ${isToday ? 'text-[#2D6A4F]' : 'text-[#6B7280]'}`}>{label}</p>
                <p className={`text-xs ${isToday ? 'text-[#2D6A4F] font-bold' : 'text-[#1B1B1B]'}`}>
                  {dateLabelForDay(weekKey, col)}
                </p>
              </div>
            )
          })}
        </div>

        {/* 時間スロット行 */}
        {TIME_SLOTS.map(slotStart => (
          <div
            key={slotStart}
            style={{ display: 'grid', gridTemplateColumns: '36px repeat(7, 1fr)' }}
          >
            {/* 時刻ラベル */}
            <div className="text-right pr-1 border-r border-gray-100 flex items-center justify-end">
              <span className="text-[10px] text-[#9CA3AF]">{minutesToTime(slotStart)}</span>
            </div>
            {/* 各曜日のセル */}
            {COL_TO_DAY_INDEX.map((dayIndex) => {
              const state = getCellState(dayIndex, slotStart)
              const cellBg =
                state === 'lesson' ? 'bg-[#2D6A4F]' :
                state === 'overlap' ? 'bg-[#52B788]' :
                state === 'mine' ? 'bg-[#D8F3DC]' :
                state === 'other' ? 'bg-[#E5E7EB]' :
                'bg-[#F3F4F6]'
              const canConfirm = state === 'overlap' && isInstructor
              return (
                <button
                  key={dayIndex}
                  onClick={() => {
                    if (state === 'lesson') return
                    if (canConfirm) {
                      setConfirmingSlot({ dayIndex, slotStart })
                    } else {
                      toggleSlot({ dayIndex, slotStart })
                    }
                  }}
                  className={`h-9 border border-white ${cellBg} transition-colors active:opacity-70`}
                />
              )
            })}
          </div>
        ))}
      </div>

      {/* 凡例 */}
      <div className="flex gap-3 justify-center py-3 bg-white border-t border-gray-100 text-[10px] text-[#6B7280]">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-[#D8F3DC] inline-block" />自分の空き</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-[#52B788] inline-block" />調整可能</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-[#2D6A4F] inline-block" />授業確定</span>
        {isInstructor && <span className="text-[#52B788] font-medium">緑コマをタップで確定</span>}
      </div>

      {/* 授業確定モーダル */}
      {confirmingSlot && (
        <LessonConfirmModal
          weekKey={weekKey}
          dayIndex={confirmingSlot.dayIndex}
          slotStart={confirmingSlot.slotStart}
          lessonMinutes={room.lesson_minutes}
          isConfirming={isConfirming}
          onConfirm={() => confirmLesson(confirmingSlot)}
          onClose={() => setConfirmingSlot(null)}
        />
      )}
    </div>
  )
}
