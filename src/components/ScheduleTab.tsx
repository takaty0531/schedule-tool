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

type ViewMode = 'input' | 'erase' | 'view'

// 生徒ごとの色パレット（bg=スロットのみ, active=講師との重複）
const LEARNER_COLORS = [
  { bg: '#DBEAFE', active: '#3B82F6' }, // blue
  { bg: '#FEF9C3', active: '#CA8A04' }, // yellow
  { bg: '#FCE7F3', active: '#DB2777' }, // pink
  { bg: '#EDE9FE', active: '#7C3AED' }, // purple
  { bg: '#FFEDD5', active: '#EA580C' }, // orange
] as const

// 授業確定モーダル
function LessonConfirmModal({
  weekKey, dayIndex, slotStart, lessonMinutes, isConfirming,
  overlappingLearnerIds, members,
  onConfirm, onClose,
}: {
  weekKey: string; dayIndex: number; slotStart: number
  lessonMinutes: number; isConfirming: boolean
  overlappingLearnerIds: string[]
  members: (RoomMember & { profile: Profile })[]
  onConfirm: (learnerId: string) => void
  onClose: () => void
}) {
  const learnerIdList = members.map(m => m.learner_id)
  const [selectedLearnerId, setSelectedLearnerId] = useState(
    overlappingLearnerIds.length === 1 ? overlappingLearnerIds[0] : ''
  )
  const endMin = slotStart + lessonMinutes
  const date = (() => {
    const d = new Date(toScheduledAt(weekKey, dayIndex, slotStart))
    return `${d.getMonth() + 1}月${d.getDate()}日(${['日','月','火','水','木','金','土'][d.getDay()]})`
  })()

  return (
    <div className="fixed inset-0 bg-black/40 z-50" onClick={onClose}>
      <div className="fixed bottom-6 left-4 right-4 max-w-lg mx-auto bg-white rounded-2xl p-6 space-y-5 overflow-y-auto" style={{ maxHeight: 'calc(100dvh - 5rem)' }} onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-[#1B1B1B]">授業を確定しますか？</h2>
        <div className="bg-[#F7F9F7] rounded-2xl p-4 space-y-1">
          <p className="text-sm font-medium text-[#1B1B1B]">{date}</p>
          <p className="text-sm text-[#6B7280]">
            {minutesToTime(slotStart)} 〜 {minutesToTime(endMin)}（{lessonMinutes}分）
          </p>
        </div>

        {/* 生徒選択 */}
        <div>
          <p className="text-sm font-medium text-[#1B1B1B] mb-2">生徒を選択</p>
          <div className="space-y-2">
            {overlappingLearnerIds.map(lid => {
              const ci = learnerIdList.indexOf(lid) % LEARNER_COLORS.length
              const color = LEARNER_COLORS[ci < 0 ? 0 : ci]
              const member = members.find(m => m.learner_id === lid)
              return (
                <button
                  key={lid}
                  onClick={() => setSelectedLearnerId(lid)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-colors ${
                    selectedLearnerId === lid ? 'border-[#2D6A4F]' : 'border-gray-200'
                  }`}
                >
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ background: color.active }} />
                  <span className="text-sm font-medium text-[#1B1B1B]">{member?.display_name}</span>
                  {selectedLearnerId === lid && (
                    <svg className="ml-auto" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#2D6A4F" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        <button
          onClick={() => selectedLearnerId && onConfirm(selectedLearnerId)}
          disabled={isConfirming || !selectedLearnerId}
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
  const [confirmingSlot, setConfirmingSlot] = useState<{ dayIndex: number; slotStart: number; learnerIds: string[] } | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('input')
  const [localMySlots, setLocalMySlots] = useState<Set<string>>(new Set())

  const isInstructor = user?.id === room.instructor_id
  const thisWeekKey = getWeekKey(getThisMonday())
  const learnerIds = useMemo(() => members.map(m => m.learner_id), [members])

  // learner_id → color index マップ
  const learnerColorIndex = useMemo(() => {
    const map = new Map<string, number>()
    learnerIds.forEach((id, i) => map.set(id, i))
    return map
  }, [learnerIds])

  // 今週のスロット取得
  const { data: slots = [] } = useQuery({
    queryKey: ['slots', room.id, weekKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('slots').select('*').eq('room_id', room.id).eq('week_key', weekKey)
      if (error) throw error
      return data as Slot[]
    },
    enabled: !!user,
  })

  // サーバーデータでローカル状態を初期化
  useEffect(() => {
    setLocalMySlots(new Set(
      slots.filter(s => s.person_id === user!.id).map(s => `${s.day_index}-${s.slot_start}`)
    ))
  }, [slots])

  const myServerSlots = useMemo(
    () => new Set(slots.filter(s => s.person_id === user!.id).map(s => `${s.day_index}-${s.slot_start}`)),
    [slots, user]
  )

  const isDirty = useMemo(() => {
    if (localMySlots.size !== myServerSlots.size) return true
    for (const key of localMySlots) if (!myServerSlots.has(key)) return true
    return false
  }, [localMySlots, myServerSlots])

  // 確定済み授業（全期間）
  const { data: allLessons = [] } = useQuery({
    queryKey: ['lessons', room.id, 'all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lessons').select('*').eq('room_id', room.id).eq('status', 'scheduled')
        .order('scheduled_at')
      if (error) throw error
      return data as Lesson[]
    },
    enabled: !!user,
  })

  // 当週の確定済み授業
  const lessons = useMemo(
    () => allLessons.filter(l => isInWeek(l.scheduled_at, weekKey)),
    [allLessons, weekKey]
  )

  // セルのトグル（ローカルのみ）
  const toggleLocalSlot = (dayIndex: number, slotStart: number) => {
    if (viewMode === 'view') return
    const key = `${dayIndex}-${slotStart}`
    setLocalMySlots(prev => {
      const next = new Set(prev)
      if (viewMode === 'erase') next.delete(key)
      else if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // 予定を提出
  const { mutate: submitSlots, isPending: isSubmitting } = useMutation({
    mutationFn: async () => {
      const mySlots = slots.filter(s => s.person_id === user!.id)
      const toDelete = mySlots
        .filter(s => !localMySlots.has(`${s.day_index}-${s.slot_start}`))
        .map(s => s.id)
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

  // 週切り替え
  const changeWeek = (newKey: string) => {
    if (isDirty && !confirm('未保存の変更があります。破棄して週を移動しますか？')) return
    setWeekKey(newKey)
  }

  // 授業確定
  const { mutate: confirmLesson, isPending: isConfirming } = useMutation({
    mutationFn: async ({ dayIndex, slotStart, learnerId }: { dayIndex: number; slotStart: number; learnerId: string }) => {
      const { error } = await supabase.from('lessons').insert({
        room_id: room.id,
        learner_id: learnerId,
        scheduled_at: toScheduledAt(weekKey, dayIndex, slotStart),
        duration_minutes: room.lesson_minutes,
        status: 'scheduled',
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lessons', room.id, 'all'] })
      setConfirmingSlot(null)
    },
  })

  // スロットマップ（person_id → Set of keys）
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

  // 連続スロット判定: 生徒ごとに instructor+learner の連続コマを検出
  const slotsPerLesson = room.lesson_minutes / 30
  // Map<cellKey, overlappingLearnerIds[]>
  const overlapStartMap = useMemo(() => {
    const map = new Map<string, string[]>()
    if (learnerIds.length === 0) return map
    for (let colIndex = 0; colIndex < 7; colIndex++) {
      const dayIndex = COL_TO_DAY_INDEX[colIndex]
      for (let i = 0; i <= TIME_SLOTS.length - slotsPerLesson; i++) {
        const startSlot = TIME_SLOTS[i]
        for (const learnerId of learnerIds) {
          let allMatch = true
          for (let j = 0; j < slotsPerLesson; j++) {
            const slotStart = startSlot + j * 30
            const key = `${dayIndex}-${slotStart}`
            const persons = new Set(slotsMap.get(key) ?? [])
            if (localMySlots.has(key)) persons.add(user!.id)
            else persons.delete(user!.id)
            if (!persons.has(room.instructor_id) || !persons.has(learnerId)) {
              allMatch = false; break
            }
          }
          if (allMatch) {
            const cellKey = `${dayIndex}-${startSlot}`
            if (!map.has(cellKey)) map.set(cellKey, [])
            if (!map.get(cellKey)!.includes(learnerId)) map.get(cellKey)!.push(learnerId)
          }
        }
      }
    }
    return map
  }, [slotsMap, localMySlots, room.instructor_id, learnerIds, slotsPerLesson])

  // セルの背景色
  function getCellBg(dayIndex: number, slotStart: number): string {
    if (lessonsMap.has(`${dayIndex}-${slotStart}`)) return '#2D6A4F'
    const key = `${dayIndex}-${slotStart}`
    const serverPersons = slotsMap.get(key) ?? new Set<string>()
    const effectivePersons = new Set([...serverPersons])
    if (localMySlots.has(key)) effectivePersons.add(user!.id)
    else effectivePersons.delete(user!.id)
    const hasInstructor = effectivePersons.has(room.instructor_id)
    const presentLearners = learnerIds.filter(id => effectivePersons.has(id))

    if (isInstructor) {
      if (hasInstructor && presentLearners.length > 0) {
        const ci = (learnerColorIndex.get(presentLearners[0]) ?? 0) % LEARNER_COLORS.length
        return LEARNER_COLORS[ci].active
      }
      if (hasInstructor) return '#D8F3DC'
      if (presentLearners.length > 0) {
        const ci = (learnerColorIndex.get(presentLearners[0]) ?? 0) % LEARNER_COLORS.length
        return LEARNER_COLORS[ci].bg
      }
    } else {
      const myCI = (learnerColorIndex.get(user!.id) ?? 0) % LEARNER_COLORS.length
      const myColor = LEARNER_COLORS[myCI]
      const isMySlot = localMySlots.has(key)
      if (isMySlot && hasInstructor) return myColor.active
      if (isMySlot) return myColor.bg
      if (effectivePersons.size > 0) return '#E5E7EB'
    }
    return '#F3F4F6'
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

      {/* モード切り替え */}
      <div className="flex gap-1 px-4 py-2 bg-white border-b border-gray-100">
        {(['input', 'erase', 'view'] as ViewMode[]).map(mode => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            className={`flex-1 py-1.5 rounded-xl text-xs font-medium transition-colors ${
              viewMode === mode ? 'bg-[#2D6A4F] text-white' : 'bg-[#F3F4F6] text-[#6B7280]'
            }`}
          >
            {mode === 'input' ? '入力' : mode === 'erase' ? '消去' : '閲覧'}
          </button>
        ))}
      </div>

      {/* カレンダーグリッド */}
      <div className="overflow-y-auto" style={{ maxHeight: 'calc(100svh - 400px)' }}>
        {/* 曜日ヘッダー */}
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
            {COL_TO_DAY_INDEX.map(dayIndex => {
              const isLesson = lessonsMap.has(`${dayIndex}-${slotStart}`)
              const bg = getCellBg(dayIndex, slotStart)
              const overlapLearners = overlapStartMap.get(`${dayIndex}-${slotStart}`) ?? []
              const canConfirm = isInstructor && overlapLearners.length > 0
              return (
                <button
                  key={dayIndex}
                  onClick={() => {
                    if (isLesson) return
                    if (canConfirm) {
                      setConfirmingSlot({ dayIndex, slotStart, learnerIds: overlapLearners })
                    } else if (viewMode !== 'view') {
                      toggleLocalSlot(dayIndex, slotStart)
                    }
                  }}
                  className="h-9 border border-white transition-colors active:opacity-70 relative"
                  style={{ backgroundColor: bg }}
                >
                  {/* 連続スロット開始マーク */}
                  {canConfirm && (
                    <span className="absolute inset-x-0 top-0.5 flex justify-center gap-0.5">
                      {overlapLearners.slice(0, 3).map(lid => (
                        <span
                          key={lid}
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ background: '#fff', opacity: 0.9 }}
                        />
                      ))}
                    </span>
                  )}
                  {/* 確定済み授業の生徒ドット */}
                  {isLesson && (() => {
                    const lesson = lessonsMap.get(`${dayIndex}-${slotStart}`)!
                    if (!lesson.learner_id) return null
                    const ci = (learnerColorIndex.get(lesson.learner_id) ?? 0) % LEARNER_COLORS.length
                    return (
                      <span
                        className="absolute bottom-0.5 right-0.5 w-1.5 h-1.5 rounded-full"
                        style={{ background: LEARNER_COLORS[ci].bg }}
                      />
                    )
                  })()}
                </button>
              )
            })}
          </div>
        ))}
      </div>

      {/* 凡例 + ボタン */}
      <div className="bg-white border-t border-gray-100 px-4 py-3 space-y-3">
        {/* 生徒の色凡例 */}
        {members.length > 0 && (
          <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center">
            {members.map((m, i) => {
              const ci = i % LEARNER_COLORS.length
              return (
                <span key={m.id} className="flex items-center gap-1 text-[10px] text-[#6B7280]">
                  <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: LEARNER_COLORS[ci].active }} />
                  {m.display_name}
                </span>
              )
            })}
          </div>
        )}
        {/* 状態凡例 */}
        <div className="flex gap-3 justify-center text-[10px] text-[#6B7280]">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-[#D8F3DC] inline-block" />自分の空き</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm inline-block" style={{ background: LEARNER_COLORS[0].active }} />調整可能</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-[#2D6A4F] inline-block" />授業確定</span>
        </div>
        <button
          onClick={() => submitSlots()}
          disabled={!isDirty || isSubmitting || viewMode === 'view'}
          className="w-full bg-[#2D6A4F] hover:bg-[#245c43] text-white font-bold py-3 rounded-2xl transition-colors disabled:opacity-40"
        >
          {isSubmitting ? '保存中...' : isDirty ? '予定を提出する' : '提出済み'}
        </button>
        {isInstructor && (
          <p className="text-center text-xs text-[#52B788]">●マークのコマをタップして授業を確定できます</p>
        )}
      </div>

      {confirmingSlot && (
        <LessonConfirmModal
          weekKey={weekKey}
          dayIndex={confirmingSlot.dayIndex}
          slotStart={confirmingSlot.slotStart}
          lessonMinutes={room.lesson_minutes}
          isConfirming={isConfirming}
          overlappingLearnerIds={confirmingSlot.learnerIds}
          members={members}
          onConfirm={(learnerId) => confirmLesson({
            dayIndex: confirmingSlot.dayIndex,
            slotStart: confirmingSlot.slotStart,
            learnerId,
          })}
          onClose={() => setConfirmingSlot(null)}
        />
      )}
    </div>
  )
}
