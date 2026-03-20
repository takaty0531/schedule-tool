import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { Room, StudyPlanItem, Lesson } from '../types/database'
import { minutesToTime } from '../lib/scheduleUtils'

type Props = { room: Room }

function lessonLabel(lesson: Lesson): string {
  const d = new Date(lesson.scheduled_at)
  const days = ['日', '月', '火', '水', '木', '金', '土']
  return `${d.getMonth() + 1}/${d.getDate()}(${days[d.getDay()]}) ${minutesToTime(d.getHours() * 60 + d.getMinutes())}`
}

// タイトル / サブ項目追加モーダル
function AddItemModal({ room, subject, lessons, parentItem, onClose }: {
  room: Room
  subject: string
  lessons: Lesson[]
  parentItem: StudyPlanItem | null  // null = タイトル追加, 非null = サブ追加
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const [lessonId, setLessonId] = useState('')

  const { mutate, isPending } = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('study_plan_items').insert({
        room_id: room.id,
        subject,
        title: title.trim(),
        parent_id: parentItem?.id ?? null,
        lesson_id: lessonId || null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['study_plan', room.id] })
      onClose()
    },
  })

  const isSubItem = parentItem !== null

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50 pt-16" onClick={onClose}>
      <div className="bg-white rounded-t-3xl w-full max-w-lg px-6 pt-6 space-y-4 overflow-y-auto" style={{ maxHeight: '90svh', paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }} onClick={e => e.stopPropagation()}>
        <div>
          <p className="text-xs text-[#52B788] font-medium mb-1">{subject}{isSubItem ? ` › ${parentItem.title}` : ''}</p>
          <h2 className="text-lg font-bold text-[#1B1B1B]">
            {isSubItem ? 'サブ項目を追加' : 'タイトルを追加'}
          </h2>
        </div>

        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder={isSubItem ? '例: 不定詞の否定形' : '例: 不定詞'}
          maxLength={40}
          autoFocus
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#52B788]"
        />

        {lessons.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-[#1B1B1B] mb-1">授業日程を割り当て（任意）</label>
            <select
              value={lessonId}
              onChange={e => setLessonId(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#52B788]"
            >
              <option value="">未割り当て</option>
              {lessons.map(l => (
                <option key={l.id} value={l.id}>{lessonLabel(l)}</option>
              ))}
            </select>
          </div>
        )}

        <button
          onClick={() => mutate()}
          disabled={!title.trim() || isPending}
          className="w-full bg-[#2D6A4F] hover:bg-[#245c43] text-white font-bold py-3 rounded-2xl transition-colors disabled:opacity-50"
        >
          {isPending ? '追加中...' : '追加する'}
        </button>
        <button onClick={onClose} className="w-full text-sm text-[#6B7280] py-2">キャンセル</button>
      </div>
    </div>
  )
}

// 授業割り当て変更モーダル
function AssignLessonModal({ item, lessons, onClose }: {
  item: StudyPlanItem; lessons: Lesson[]; onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [lessonId, setLessonId] = useState(item.lesson_id ?? '')

  const { mutate, isPending } = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('study_plan_items').update({ lesson_id: lessonId || null }).eq('id', item.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['study_plan', item.room_id] })
      onClose()
    },
  })

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50 pt-16" onClick={onClose}>
      <div className="bg-white rounded-t-3xl w-full max-w-lg px-6 pt-6 space-y-4 overflow-y-auto" style={{ maxHeight: '90svh', paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }} onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-[#1B1B1B]">授業日程を割り当て</h2>
        <p className="text-sm text-[#6B7280]">{item.subject} › {item.title}</p>
        <select
          value={lessonId}
          onChange={e => setLessonId(e.target.value)}
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#52B788]"
        >
          <option value="">未割り当て</option>
          {lessons.map(l => (
            <option key={l.id} value={l.id}>{lessonLabel(l)}</option>
          ))}
        </select>
        <button
          onClick={() => mutate()}
          disabled={isPending}
          className="w-full bg-[#2D6A4F] hover:bg-[#245c43] text-white font-bold py-3 rounded-2xl transition-colors disabled:opacity-50"
        >
          {isPending ? '保存中...' : '保存する'}
        </button>
        <button onClick={onClose} className="w-full text-sm text-[#6B7280] py-2">キャンセル</button>
      </div>
    </div>
  )
}

type ModalState =
  | { type: 'add_subject' }
  | { type: 'add_title'; subject: string }
  | { type: 'add_sub'; subject: string; parentItem: StudyPlanItem }
  | { type: 'assign'; item: StudyPlanItem }
  | null

export default function StudyPlanTab({ room }: Props) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const isInstructor = user?.id === room.instructor_id
  const [modal, setModal] = useState<ModalState>(null)
  const [expandedSubjects, setExpandedSubjects] = useState<Set<string>>(new Set())
  const [expandedTitles, setExpandedTitles] = useState<Set<string>>(new Set())

  const { data: items = [] } = useQuery({
    queryKey: ['study_plan', room.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('study_plan_items').select('*').eq('room_id', room.id)
        .order('order_index').order('created_at')
      if (error) throw error
      return data as StudyPlanItem[]
    },
    enabled: !!user,
  })

  const { data: lessons = [] } = useQuery({
    queryKey: ['lessons_scheduled', room.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lessons').select('*').eq('room_id', room.id).eq('status', 'scheduled')
        .order('scheduled_at')
      if (error) throw error
      return data as Lesson[]
    },
    enabled: !!user,
  })

  const lessonsMap = useMemo(() => new Map(lessons.map(l => [l.id, l])), [lessons])

  const { mutate: deleteItem } = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('study_plan_items').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['study_plan', room.id] }),
  })

  // 新しい教科名を追加する（最初のタイトルを一緒に入力してもらう方式）
  const subjects = useMemo(() => [...new Set(items.map(i => i.subject))], [items])

  // 教科ごとのタイトル一覧
  const titlesBySubject = useMemo(() => {
    const map = new Map<string, StudyPlanItem[]>()
    for (const item of items.filter(i => i.parent_id === null)) {
      if (!map.has(item.subject)) map.set(item.subject, [])
      map.get(item.subject)!.push(item)
    }
    return map
  }, [items])

  // 親IDごとのサブ項目
  const subsByParent = useMemo(() => {
    const map = new Map<string, StudyPlanItem[]>()
    for (const item of items.filter(i => i.parent_id !== null)) {
      if (!map.has(item.parent_id!)) map.set(item.parent_id!, [])
      map.get(item.parent_id!)!.push(item)
    }
    return map
  }, [items])

  const toggleSubject = (subject: string) =>
    setExpandedSubjects(prev => {
      const next = new Set(prev)
      next.has(subject) ? next.delete(subject) : next.add(subject)
      return next
    })

  const toggleTitle = (id: string) =>
    setExpandedTitles(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  return (
    <div className="flex flex-col">
      <div className="overflow-y-auto px-4 py-4 space-y-3" style={{ maxHeight: 'calc(100svh - 280px)' }}>
        {subjects.length === 0 && (
          <p className="text-sm text-[#6B7280] text-center py-8">
            {isInstructor ? '下のボタンから教科を追加しましょう' : '学習計画はまだありません'}
          </p>
        )}

        {subjects.map(subject => {
          const isSubjectOpen = expandedSubjects.has(subject)
          const titleItems = titlesBySubject.get(subject) ?? []

          return (
            <div key={subject} className="bg-white rounded-2xl overflow-hidden">
              {/* 教科ヘッダー */}
              <div className="flex items-center">
                <button
                  className="flex-1 flex items-center gap-2 px-4 py-3"
                  onClick={() => toggleSubject(subject)}
                >
                  <svg
                    width="16" height="16" fill="none" viewBox="0 0 24 24"
                    stroke="#6B7280" strokeWidth={2.5}
                    className={`transition-transform shrink-0 ${isSubjectOpen ? 'rotate-90' : ''}`}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                  <span className="font-bold text-[#1B1B1B]">{subject}</span>
                  <span className="text-xs text-[#9CA3AF] ml-1">({titleItems.length})</span>
                </button>
                {isInstructor && isSubjectOpen && (
                  <button
                    onClick={() => setModal({ type: 'add_title', subject })}
                    className="px-3 py-3 text-[#52B788]"
                  >
                    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                )}
              </div>

              {/* タイトル一覧（教科が開いているとき） */}
              {isSubjectOpen && (
                <div className="border-t border-gray-100">
                  {titleItems.length === 0 && (
                    <p className="text-xs text-[#9CA3AF] px-4 py-3">タイトルがありません</p>
                  )}
                  {titleItems.map(titleItem => {
                    const isTitleOpen = expandedTitles.has(titleItem.id)
                    const subItems = subsByParent.get(titleItem.id) ?? []
                    const assignedLesson = titleItem.lesson_id ? lessonsMap.get(titleItem.lesson_id) : null

                    return (
                      <div key={titleItem.id} className="border-b border-gray-50 last:border-b-0">
                        {/* タイトル行 */}
                        <div className="flex items-start">
                          <button
                            className="flex-1 flex items-start gap-2 px-4 py-2.5 pl-8"
                            onClick={() => toggleTitle(titleItem.id)}
                          >
                            <svg
                              width="14" height="14" fill="none" viewBox="0 0 24 24"
                              stroke="#9CA3AF" strokeWidth={2.5}
                              className={`transition-transform mt-0.5 shrink-0 ${isTitleOpen ? 'rotate-90' : ''}`}
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                            </svg>
                            <div className="text-left">
                              <p className="text-sm font-medium text-[#1B1B1B]">{titleItem.title}</p>
                              {assignedLesson && (
                                <p className="text-xs text-[#52B788] mt-0.5">{lessonLabel(assignedLesson)}</p>
                              )}
                              {subItems.length > 0 && (
                                <p className="text-xs text-[#9CA3AF] mt-0.5">{subItems.length}項目</p>
                              )}
                            </div>
                          </button>
                          {isInstructor && (
                            <div className="flex items-center gap-0.5 pr-2 pt-2">
                              <button
                                onClick={() => setModal({ type: 'assign', item: titleItem })}
                                className="text-xs text-[#52B788] px-2 py-1 rounded-lg"
                                title="授業を割り当て"
                              >
                                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                              </button>
                              <button onClick={() => deleteItem(titleItem.id)} className="text-[#D1D5DB] p-1">
                                <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                          )}
                        </div>

                        {/* サブ項目一覧（タイトルが開いているとき） */}
                        {isTitleOpen && (
                          <div className="bg-[#FAFAFA]">
                            {subItems.map(sub => {
                              const subLesson = sub.lesson_id ? lessonsMap.get(sub.lesson_id) : null
                              return (
                                <div key={sub.id} className="flex items-start border-t border-gray-100">
                                  <div className="flex-1 flex items-start gap-2 px-4 py-2 pl-14">
                                    <span className="text-[#C4C9D4] text-xs mt-0.5 shrink-0">—</span>
                                    <div>
                                      <p className="text-sm text-[#1B1B1B]">{sub.title}</p>
                                      {subLesson && (
                                        <p className="text-xs text-[#52B788] mt-0.5">{lessonLabel(subLesson)}</p>
                                      )}
                                    </div>
                                  </div>
                                  {isInstructor && (
                                    <div className="flex items-center gap-0.5 pr-2 pt-2">
                                      <button
                                        onClick={() => setModal({ type: 'assign', item: sub })}
                                        className="text-[#52B788] px-1 py-1"
                                        title="授業を割り当て"
                                      >
                                        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                        </svg>
                                      </button>
                                      <button onClick={() => deleteItem(sub.id)} className="text-[#D1D5DB] p-1">
                                        <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                      </button>
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                            {/* サブ追加ボタン */}
                            {isInstructor && (
                              <button
                                onClick={() => setModal({ type: 'add_sub', subject, parentItem: titleItem })}
                                className="w-full flex items-center gap-2 px-4 py-2 pl-14 text-xs text-[#52B788] border-t border-gray-100"
                              >
                                <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                                </svg>
                                サブ項目を追加
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* 追加ボタン */}
      {isInstructor && (
        <div className="bg-white border-t border-gray-100 px-4 py-3">
          <button
            onClick={() => setModal({ type: 'add_subject' })}
            className="w-full border-2 border-dashed border-[#52B788] text-[#2D6A4F] font-bold py-3 rounded-2xl flex items-center justify-center gap-2"
          >
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            教科を追加
          </button>
        </div>
      )}

      {/* モーダル */}
      {modal?.type === 'add_subject' && (
        // 教科追加: 教科名→タイトル追加の2ステップ
        <AddSubjectStep
          existingSubjects={subjects}
          onClose={() => setModal(null)}
          onAdded={subject => {
            setModal({ type: 'add_title', subject })
            setExpandedSubjects(prev => new Set([...prev, subject]))
          }}
        />
      )}
      {modal?.type === 'add_title' && (
        <AddItemModal
          room={room}
          subject={modal.subject}
          lessons={lessons}
          parentItem={null}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'add_sub' && (
        <AddItemModal
          room={room}
          subject={modal.subject}
          lessons={lessons}
          parentItem={modal.parentItem}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'assign' && (
        <AssignLessonModal
          item={modal.item}
          lessons={lessons}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}

// 教科追加ステップ（教科名入力後、すぐにタイトル追加へ移行）
function AddSubjectStep({ existingSubjects, onClose, onAdded }: {
  existingSubjects: string[]
  onClose: () => void
  onAdded: (subject: string) => void
}) {
  const [subject, setSubject] = useState('')
  const isDuplicate = existingSubjects.includes(subject.trim())

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50 pt-16" onClick={onClose}>
      <div className="bg-white rounded-t-3xl w-full max-w-lg px-6 pt-6 space-y-4 overflow-y-auto" style={{ maxHeight: '90svh', paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }} onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-[#1B1B1B]">教科を追加</h2>
        <input
          type="text"
          value={subject}
          onChange={e => setSubject(e.target.value)}
          placeholder="例: 英語、数学、理科"
          maxLength={20}
          autoFocus
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#52B788]"
        />
        {isDuplicate && <p className="text-xs text-red-500">この教科はすでに存在します</p>}
        <button
          onClick={() => subject.trim() && !isDuplicate && onAdded(subject.trim())}
          disabled={!subject.trim() || isDuplicate}
          className="w-full bg-[#2D6A4F] hover:bg-[#245c43] text-white font-bold py-3 rounded-2xl transition-colors disabled:opacity-50"
        >
          追加して最初のタイトルへ →
        </button>
        <button onClick={onClose} className="w-full text-sm text-[#6B7280] py-2">キャンセル</button>
      </div>
    </div>
  )
}
