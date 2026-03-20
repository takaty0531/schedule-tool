import { useState, useMemo, useEffect } from 'react'
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
  // ローカルの選択状態: `${dayIndex}-${slotStart}` のSet
  const [localMySlots, setLocalMySlots] = useState<Set<string>>(new Set())

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

  // サーバーのデータでローカル状態を初期化（週切り替え時・提出後にリセット）
  useEffect(() => {
    setLocalMySlots(new Set(
      slots
        .filter(s => s.person_id === user!.id)
        .map(s => `${s.day_index}-${s.slot_start}`)
    ))
  }, [slots])

  // サーバー上の自分のスロット
  const myServerSlots = useMemo(
    () => new Set(slots.filter(s => s.person_id === user!.id).map(s => `${s.day_index}-${s.slot_start}`)),
    [slots, user]
  )

  // 未保存の変更があるか
  const isDirty = useMemo(() => {
    if (localMySlots.size !== myServerSlots.size) return true
    for (const key of localMySlots) if (!myServerSlots.has(key)) return true
    return false
  }, [localMySlots, myServerSlots])

  // 確定済み授業取得（当週分）
  const { data: lessons = [] } = useQuery({
    queryKey: ['lessons', room.id, weekKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lessons').select('*').eq('room_id', room.id).eq('status', 'scheduled')
      if (error) throw error
      return (data as Lesson[]).filter(l => isInWeek(l.scheduled_at, weekKey))
    },
    enabled: !!user,
  })

  // セルのトグル（ローカルのみ）
  const toggleLocalSlot = (dayIndex: number, slotStart: number) => {
    const key = `${dayIndex}-${slotStart}`
    setLocalMySlots(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // 予定を提出（差分をDBに保存）
  const { mutate: submitSlots, isPending: isSubmitting } = useMutation({
    mutationFn: async () => {
      const mySlots = slots.filter(s => s.person_id === user!.id)

      // 削除: サーバーにあってローカルにないもの
      const toDelete = mySlots
        .filter(s => !localMySlots.has(`${s.day_index}-${s.slot_start}`))
        .map(s => s.id)

      // 追加: ローカルにあってサーバーにないもの
      const toAdd = [...localMySlots]
        .filter(key => !myServerSlots.has(key))
        .map(key => {
          const [dayIndex, slotStart] = key.split('-').map(Number)
          return { room_id: room.id, person_id: user!.id, week_key: weekKey, day_index: dayIndex, slot_start: slotStart }
        })

      if (toDelete.length > 0) {
        const { error } = await supabase.from('slots').delete().in('id', toDelete)
        if (error) throw error
      }
      if (toAdd.length > 0) {
        const { error } = await supabase.from('slots').insert(toAdd)
        if (error) throw error
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['slots', room.id, weekKey] }),
  })

  // 週切り替え（未保存があれば確認）
  const changeWeek = (newKey: string) => {
    if (isDirty && !confirm('未保存の変更があります。破棄して週を移動しますか？')) return
    setWeekKey(newKey)
  }

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

  // スロットマップ（他の人のサーバーデータ）
  const slotsMap = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const s of slots) {
      const key = `${s.day_index}-${s.slot_start}`
      if (!map.has(key)) map.set(key, new Set())
      map.get(key)!.add(s.person_id)
    }
    return map
  }, [slots])

  // 授業マップ
  const lessonsMap = useMemo(() => {
    const map = new Map<string, Lesson>()
    for (const l of lessons) {
      const { dayIndex, slotStart } = scheduledAtToSlot(l.scheduled_at)
      map.set(`${dayIndex}-${slotStart}`, l)
    }
    return map
  }, [lessons])

  // セルの状態（自分はローカル状態、他者はサーバー状態を参照）
  type CellState = 'lesson' | 'overlap' | 'mine' | 'other' | 'empty'
  function getCellState(dayIndex: number, slotStart: number): CellState {
    if (lessonsMap.has(`${dayIndex}-${slotStart}`)) return 'lesson'
    const key = `${dayIndex}-${slotStart}`
    const isMySlot = localMySlots.has(key)
    const serverPersons = slotsMap.get(key) ?? new Set()
    const effectivePersons = new Set([...serverPersons].filter(id => id !== user!.id))
    if (isMySlot) effectivePersons.add(user!.id)
    const hasInstructor = effectivePersons.has(room.instructor_id)
    const hasLearner = learnerIds.some(id => effectivePersons.has(id))
    if (hasInstructor && hasLearner) return 'overlap'
    if (isMySlot) return 'mine'
    if ([...serverPersons].some(id => id !== user!.id)) return 'other'
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
        <button onClick={() => changeWeek(prevWeekKey(weekKey))} className="p-2 text-[#2D6A4F]">
          <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <button onClick={() => changeWeek(thisWeekKey)} className="text-sm font-medium text-[#1B1B1B]">
          {weekLabel}
        </button>
        <button onClick={() => changeWeek(nextWeekKey(weekKey))} className="p-2 text-[#2D6A4F]">
          <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* カレンダーグリッド */}
      <div className="overflow-y-auto" style={{ maxHeight: 'calc(100svh - 320px)' }}>
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
          <div key={slotStart} style={{ display: 'grid', gridTemplateColumns: '36px repeat(7, 1fr)' }}>
            <div className="text-right pr-1 border-r border-gray-100 flex items-center justify-end">
              <span className="text-[10px] text-[#9CA3AF]">{minutesToTime(slotStart)}</span>
            </div>
            {COL_TO_DAY_INDEX.map((dayIndex) => {
              const state = getCellState(dayIndex, slotStart)
              const cellBg =
                state === 'lesson' ? 'bg-[#2D6A4F]' :
                state === 'overlap' ? 'bg-[#52B788]' :
                state === 'mine' ? 'bg-[#D8F3DC]' :
                state === 'other' ? 'bg-[#E5E7EB]' :
                'bg-[#F3F4F6]'
              return (
                <button
                  key={dayIndex}
                  onClick={() => {
                    if (state === 'lesson') return
                    if (state === 'overlap' && isInstructor) {
                      setConfirmingSlot({ dayIndex, slotStart })
                    } else {
                      toggleLocalSlot(dayIndex, slotStart)
                    }
                  }}
                  className={`h-9 border border-white ${cellBg} transition-colors active:opacity-70`}
                />
              )
            })}
          </div>
        ))}
      </div>

      {/* 凡例 + 提出ボタン */}
      <div className="bg-white border-t border-gray-100 px-4 py-3 space-y-3">
        <div className="flex gap-3 justify-center text-[10px] text-[#6B7280]">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-[#D8F3DC] inline-block" />自分の空き</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-[#52B788] inline-block" />調整可能</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-[#2D6A4F] inline-block" />授業確定</span>
        </div>
        <button
          onClick={() => submitSlots()}
          disabled={!isDirty || isSubmitting}
          className="w-full bg-[#2D6A4F] hover:bg-[#245c43] text-white font-bold py-3 rounded-2xl transition-colors disabled:opacity-40"
        >
          {isSubmitting ? '保存中...' : isDirty ? '予定を提出する' : '提出済み'}
        </button>
        {isInstructor && (
          <p className="text-center text-xs text-[#52B788]">調整可能なコマをタップして授業を確定できます</p>
        )}
      </div>

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
