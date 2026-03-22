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

// 生徒ごとの色パレット
const LEARNER_COLORS = [
  { bg: '#DBEAFE', active: '#3B82F6' },
  { bg: '#FEF9C3', active: '#CA8A04' },
  { bg: '#FCE7F3', active: '#DB2777' },
  { bg: '#EDE9FE', active: '#7C3AED' },
  { bg: '#FFEDD5', active: '#EA580C' },
] as const

export default function ScheduleTab({ room, members }: Props) {
  const { user, profile } = useAuth()
  const queryClient = useQueryClient()
  const [weekKey, setWeekKey] = useState(() => getWeekKey(getThisMonday()))
  const [localMySlots, setLocalMySlots] = useState<Set<string> | null>(null)

  const isInstructor = user?.id === room.instructor_id
  const isGuardian = profile?.role === 'guardian'
  const canEdit = !isGuardian
  const thisWeekKey = getWeekKey(getThisMonday())
  const slotsPerLesson = room.lesson_minutes / 30

  // 保護者を除いた生徒IDリスト
  const learnerIds = useMemo(
    () => members.filter(m => m.profile?.role !== 'guardian').map(m => m.learner_id),
    [members]
  )

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

  const myServerSlots = useMemo(
    () => new Set(slots.filter(s => s.person_id === user!.id).map(s => `${s.day_index}-${s.slot_start}`)),
    [slots, user]
  )
  const effectiveLocalMySlots = localMySlots ?? myServerSlots

  const isDirty = useMemo(() => {
    if (effectiveLocalMySlots.size !== myServerSlots.size) return true
    for (const key of effectiveLocalMySlots) if (!myServerSlots.has(key)) return true
    return false
  }, [effectiveLocalMySlots, myServerSlots])

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

  const lessons = useMemo(
    () => allLessons.filter(l => isInWeek(l.scheduled_at, weekKey)),
    [allLessons, weekKey]
  )

  const toggleLocalSlot = (dayIndex: number, slotStart: number) => {
    if (!canEdit) return
    const key = `${dayIndex}-${slotStart}`
    setLocalMySlots(prev => {
      const next = new Set(prev ?? myServerSlots)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // 予定を提出 → 全生徒+講師が揃ったスロットは自動で授業確定
  const { mutate: submitSlots, isPending: isSubmitting } = useMutation({
    mutationFn: async () => {
      const mySlots = slots.filter(s => s.person_id === user!.id)
      const toDelete = mySlots
        .filter(s => !effectiveLocalMySlots.has(`${s.day_index}-${s.slot_start}`))
        .map(s => s.id)
      const toAdd = [...effectiveLocalMySlots]
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

      // 提出後の全スロット状態を計算（自分以外はサーバー、自分はローカル）
      const finalPersonSlots = new Map<string, Set<string>>()
      for (const s of slots) {
        if (s.person_id === user!.id) continue
        const key = `${s.day_index}-${s.slot_start}`
        if (!finalPersonSlots.has(s.person_id)) finalPersonSlots.set(s.person_id, new Set())
        finalPersonSlots.get(s.person_id)!.add(key)
      }
      finalPersonSlots.set(user!.id, effectiveLocalMySlots)

      const instructorSlots = finalPersonSlots.get(room.instructor_id) ?? new Set<string>()

      // 全生徒+講師が揃う開始スロットを検出して授業自動確定
      // 確定したブロック分だけスキップして重複授業を防ぐ
      if (learnerIds.length > 0) {
        for (let colIndex = 0; colIndex < 7; colIndex++) {
          const dayIndex = COL_TO_DAY_INDEX[colIndex]
          let i = 0
          while (i <= TIME_SLOTS.length - slotsPerLesson) {
            const startSlot = TIME_SLOTS[i]

            // 講師が連続コマを全て持っているか
            let instructorHasAll = true
            for (let j = 0; j < slotsPerLesson; j++) {
              if (!instructorSlots.has(`${dayIndex}-${startSlot + j * 30}`)) {
                instructorHasAll = false; break
              }
            }

            // 全生徒が連続コマを全て持っているか
            let allLearnersHave = instructorHasAll
            if (allLearnersHave) {
              for (const learnerId of learnerIds) {
                const learnerSlots = finalPersonSlots.get(learnerId) ?? new Set<string>()
                for (let j = 0; j < slotsPerLesson; j++) {
                  if (!learnerSlots.has(`${dayIndex}-${startSlot + j * 30}`)) {
                    allLearnersHave = false; break
                  }
                }
                if (!allLearnersHave) break
              }
            }

            if (allLearnersHave) {
              // 既存の授業がなければ自動作成
              const scheduledAt = toScheduledAt(weekKey, dayIndex, startSlot)
              const hasLesson = allLessons.some(l => l.scheduled_at === scheduledAt)
              if (!hasLesson) {
                const { error } = await supabase.from('lessons').insert({
                  room_id: room.id,
                  learner_id: learnerIds.length === 1 ? learnerIds[0] : null,
                  scheduled_at: scheduledAt,
                  duration_minutes: room.lesson_minutes,
                  status: 'scheduled',
                })
                if (error) throw error
              }
              i += slotsPerLesson // 確定したブロック分スキップ
            } else {
              i++
            }
          }
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['slots', room.id, weekKey] })
      queryClient.invalidateQueries({ queryKey: ['lessons', room.id, 'all'] })
      setLocalMySlots(null)
    },
  })

  const changeWeek = (newKey: string) => {
    if (isDirty && !confirm('未保存の変更があります。破棄して週を移動しますか？')) return
    setWeekKey(newKey)
    setLocalMySlots(null)
  }

  const slotsMap = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const s of slots) {
      const key = `${s.day_index}-${s.slot_start}`
      if (!map.has(key)) map.set(key, new Set())
      map.get(key)!.add(s.person_id)
    }
    return map
  }, [slots])

  const lessonsMap = useMemo(() => {
    const map = new Map<string, Lesson>()
    for (const l of lessons) {
      const { dayIndex, slotStart } = scheduledAtToSlot(l.scheduled_at)
      map.set(`${dayIndex}-${slotStart}`, l)
    }
    return map
  }, [lessons])

  // 仮決定・確定の重複マップ
  // 仮決定: 講師 + 1人以上の生徒（全員ではない）
  // 確定: 講師 + 全生徒
  // 連続コマ全てにマークを付ける
  const overlapMap = useMemo(() => {
    const map = new Map<string, { learnerIds: string[]; isConfirmed: boolean }>()
    if (learnerIds.length === 0 || !user) return map

    for (let colIndex = 0; colIndex < 7; colIndex++) {
      const dayIndex = COL_TO_DAY_INDEX[colIndex]
      let i = 0
      while (i <= TIME_SLOTS.length - slotsPerLesson) {
        const startSlot = TIME_SLOTS[i]

        // 講師が連続コマを全て持っているか
        let instructorHasAll = true
        for (let j = 0; j < slotsPerLesson; j++) {
          const key = `${dayIndex}-${startSlot + j * 30}`
          const persons = new Set(slotsMap.get(key) ?? [])
          if (effectiveLocalMySlots.has(key)) persons.add(user.id)
          else persons.delete(user.id)
          if (!persons.has(room.instructor_id)) { instructorHasAll = false; break }
        }

        // 各生徒の重複チェック
        const overlappingLearners: string[] = []
        if (instructorHasAll) {
          for (const learnerId of learnerIds) {
            let learnerHasAll = true
            for (let j = 0; j < slotsPerLesson; j++) {
              const key = `${dayIndex}-${startSlot + j * 30}`
              const persons = new Set(slotsMap.get(key) ?? [])
              if (effectiveLocalMySlots.has(key)) persons.add(user.id)
              else persons.delete(user.id)
              if (!persons.has(learnerId)) { learnerHasAll = false; break }
            }
            if (learnerHasAll) overlappingLearners.push(learnerId)
          }
        }

        if (overlappingLearners.length > 0) {
          const isConfirmed = overlappingLearners.length === learnerIds.length
          // 連続コマ全てにマーク（視覚的に一貫性を持たせる）
          for (let j = 0; j < slotsPerLesson; j++) {
            map.set(`${dayIndex}-${startSlot + j * 30}`, { learnerIds: overlappingLearners, isConfirmed })
          }
          i += slotsPerLesson // 確定ブロック分スキップして重複表示を防ぐ
        } else {
          i++
        }
      }
    }
    return map
  }, [slotsMap, effectiveLocalMySlots, room.instructor_id, learnerIds, slotsPerLesson, user])

  function getCellBg(dayIndex: number, slotStart: number): string {
    const key = `${dayIndex}-${slotStart}`
    if (lessonsMap.has(key)) return '#2D6A4F'

    const overlap = overlapMap.get(key)
    if (overlap) {
      if (overlap.isConfirmed) return '#2D6A4F'
      // 仮決定: 最初の重複生徒の色
      const ci = (learnerColorIndex.get(overlap.learnerIds[0]) ?? 0) % LEARNER_COLORS.length
      return LEARNER_COLORS[ci].active
    }

    const serverPersons = slotsMap.get(key) ?? new Set<string>()
    const effectivePersons = new Set([...serverPersons])
    if (effectiveLocalMySlots.has(key)) effectivePersons.add(user!.id)
    else effectivePersons.delete(user!.id)

    const hasInstructor = effectivePersons.has(room.instructor_id)
    const presentLearners = learnerIds.filter(id => effectivePersons.has(id))

    if (isInstructor) {
      if (hasInstructor) return '#D8F3DC'
      if (presentLearners.length > 0) {
        const ci = (learnerColorIndex.get(presentLearners[0]) ?? 0) % LEARNER_COLORS.length
        return LEARNER_COLORS[ci].bg
      }
    } else {
      const myCI = (learnerColorIndex.get(user!.id) ?? 0) % LEARNER_COLORS.length
      const myColor = LEARNER_COLORS[myCI]
      const isMySlot = effectiveLocalMySlots.has(key)
      if (isMySlot && hasInstructor) return myColor.active
      if (isMySlot) return myColor.bg
      if (effectivePersons.size > 0) return '#E5E7EB'
    }
    return '#F3F4F6'
  }

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
              return (
                <button
                  key={dayIndex}
                  onClick={() => {
                    if (isLesson || !canEdit) return
                    toggleLocalSlot(dayIndex, slotStart)
                  }}
                  className="h-9 border border-white transition-colors active:opacity-70 relative"
                  style={{ backgroundColor: bg }}
                >
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
        {/* 生徒の色凡例（保護者を除く） */}
        {members.filter(m => m.profile?.role !== 'guardian').length > 0 && (
          <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center">
            {members.filter(m => m.profile?.role !== 'guardian').map((m, i) => {
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
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm inline-block" style={{ background: LEARNER_COLORS[0].active }} />仮決定</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-[#2D6A4F] inline-block" />授業確定</span>
        </div>
        {/* 提出ボタン（保護者は非表示） */}
        {!isGuardian && (
          <button
            onClick={() => submitSlots()}
            disabled={!isDirty || isSubmitting}
            className="w-full bg-[#2D6A4F] hover:bg-[#245c43] text-white font-bold py-3 rounded-2xl transition-colors disabled:opacity-40"
          >
            {isSubmitting ? '保存中...' : isDirty ? '予定を提出する' : '提出済み'}
          </button>
        )}
        {isGuardian && (
          <p className="text-center text-xs text-[#9CA3AF]">保護者は閲覧のみです</p>
        )}
      </div>
    </div>
  )
}
