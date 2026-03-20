import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { Room, StudyPlanItem, Lesson } from '../types/database'
import { minutesToTime } from '../lib/scheduleUtils'

type Props = { room: Room }

// 授業の日時ラベル
function lessonLabel(lesson: Lesson): string {
  const d = new Date(lesson.scheduled_at)
  const days = ['日', '月', '火', '水', '木', '金', '土']
  return `${d.getMonth() + 1}/${d.getDate()}(${days[d.getDay()]}) ${minutesToTime(d.getHours() * 60 + d.getMinutes())}`
}

// アイテム追加モーダル
function AddItemModal({
  room,
  subjects,
  lessons,
  parentId,
  defaultSubject,
  onClose,
}: {
  room: Room
  subjects: string[]
  lessons: Lesson[]
  parentId: string | null
  defaultSubject?: string
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [subject, setSubject] = useState(defaultSubject ?? '')
  const [newSubject, setNewSubject] = useState('')
  const [title, setTitle] = useState('')
  const [lessonId, setLessonId] = useState('')

  const effectiveSubject = subject === '__new__' ? newSubject : subject

  const { mutate, isPending } = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('study_plan_items').insert({
        room_id: room.id,
        subject: effectiveSubject.trim(),
        title: title.trim(),
        parent_id: parentId,
        lesson_id: lessonId || null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['study_plan', room.id] })
      onClose()
    },
  })

  const isValid = effectiveSubject.trim() && title.trim()

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-t-3xl w-full max-w-lg p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-[#1B1B1B]">
          {parentId ? 'サブ項目を追加' : 'タイトルを追加'}
        </h2>

        {/* 教科選択（タイトル追加時のみ） */}
        {!parentId && (
          <div>
            <label className="block text-sm font-medium text-[#1B1B1B] mb-1">教科</label>
            <select
              value={subject}
              onChange={e => setSubject(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#52B788]"
            >
              <option value="">選択してください</option>
              {subjects.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
              <option value="__new__">+ 新しい教科を追加</option>
            </select>
            {subject === '__new__' && (
              <input
                type="text"
                value={newSubject}
                onChange={e => setNewSubject(e.target.value)}
                placeholder="例: 英語"
                maxLength={20}
                className="mt-2 w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#52B788]"
              />
            )}
          </div>
        )}

        {/* タイトル */}
        <div>
          <label className="block text-sm font-medium text-[#1B1B1B] mb-1">
            {parentId ? 'サブ項目名' : 'タイトル'}
          </label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder={parentId ? '例: 不定詞の否定形' : '例: 不定詞'}
            maxLength={40}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#52B788]"
          />
        </div>

        {/* 授業割り当て */}
        {lessons.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-[#1B1B1B] mb-1">授業日程（任意）</label>
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
          disabled={!isValid || isPending}
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
function AssignLessonModal({
  item,
  lessons,
  onClose,
}: {
  item: StudyPlanItem
  lessons: Lesson[]
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [lessonId, setLessonId] = useState(item.lesson_id ?? '')

  const { mutate, isPending } = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('study_plan_items')
        .update({ lesson_id: lessonId || null })
        .eq('id', item.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['study_plan', item.room_id] })
      onClose()
    },
  })

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-t-3xl w-full max-w-lg p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-[#1B1B1B]">授業日程を割り当て</h2>
        <p className="text-sm text-[#6B7280]">{item.title}</p>
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

export default function StudyPlanTab({ room }: Props) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const isInstructor = user?.id === room.instructor_id
  const [showAddModal, setShowAddModal] = useState<{ parentId: string | null; defaultSubject?: string } | null>(null)
  const [assignItem, setAssignItem] = useState<StudyPlanItem | null>(null)
  const [expandedSubjects, setExpandedSubjects] = useState<Set<string>>(new Set())

  // 学習計画取得
  const { data: items = [] } = useQuery({
    queryKey: ['study_plan', room.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('study_plan_items')
        .select('*')
        .eq('room_id', room.id)
        .order('order_index')
        .order('created_at')
      if (error) throw error
      return data as StudyPlanItem[]
    },
    enabled: !!user,
  })

  // 確定済み授業一覧
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

  // lessonIdで引くマップ
  const lessonsMap = useMemo(() => new Map(lessons.map(l => [l.id, l])), [lessons])

  // 削除
  const { mutate: deleteItem } = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('study_plan_items').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['study_plan', room.id] }),
  })

  // 教科一覧（重複排除）
  const subjects = useMemo(() => [...new Set(items.map(i => i.subject))], [items])

  // 教科ごとにグループ化
  const grouped = useMemo(() => {
    const topLevel = items.filter(i => i.parent_id === null)
    const bySubject = new Map<string, StudyPlanItem[]>()
    for (const item of topLevel) {
      if (!bySubject.has(item.subject)) bySubject.set(item.subject, [])
      bySubject.get(item.subject)!.push(item)
    }
    return bySubject
  }, [items])

  // サブ項目マップ（親ID → サブ一覧）
  const childrenMap = useMemo(() => {
    const map = new Map<string, StudyPlanItem[]>()
    for (const item of items.filter(i => i.parent_id !== null)) {
      if (!map.has(item.parent_id!)) map.set(item.parent_id!, [])
      map.get(item.parent_id!)!.push(item)
    }
    return map
  }, [items])

  const toggleSubject = (subject: string) => {
    setExpandedSubjects(prev => {
      const next = new Set(prev)
      if (next.has(subject)) next.delete(subject)
      else next.add(subject)
      return next
    })
  }

  return (
    <div className="flex flex-col">
      <div className="overflow-y-auto px-4 py-4 space-y-4" style={{ maxHeight: 'calc(100svh - 280px)' }}>
        {subjects.length === 0 && (
          <p className="text-sm text-[#6B7280] text-center py-8">
            {isInstructor ? '下の「＋ 追加」ボタンから学習計画を作成しましょう' : '学習計画はまだありません'}
          </p>
        )}

        {subjects.map(subject => (
          <div key={subject} className="bg-white rounded-2xl overflow-hidden">
            {/* 教科ヘッダー */}
            <button
              className="w-full flex items-center justify-between px-4 py-3"
              onClick={() => toggleSubject(subject)}
            >
              <span className="font-bold text-[#1B1B1B]">{subject}</span>
              <svg
                width="16" height="16" fill="none" viewBox="0 0 24 24"
                stroke="#6B7280" strokeWidth={2.5}
                className={`transition-transform ${expandedSubjects.has(subject) ? 'rotate-180' : ''}`}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {expandedSubjects.has(subject) && (
              <div className="border-t border-gray-100">
                {(grouped.get(subject) ?? []).map(titleItem => (
                  <div key={titleItem.id}>
                    {/* タイトル行 */}
                    <div className="flex items-start gap-2 px-4 py-2.5 border-b border-gray-50">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[#1B1B1B]">{titleItem.title}</p>
                        {titleItem.lesson_id && lessonsMap.get(titleItem.lesson_id) && (
                          <p className="text-xs text-[#52B788] mt-0.5">
                            {lessonLabel(lessonsMap.get(titleItem.lesson_id)!)}
                          </p>
                        )}
                      </div>
                      {isInstructor && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => setAssignItem(titleItem)}
                            className="text-xs text-[#52B788] px-2 py-1 rounded-lg bg-[#F0FDF4]"
                          >
                            授業
                          </button>
                          <button
                            onClick={() => setShowAddModal({ parentId: titleItem.id, defaultSubject: subject })}
                            className="text-xs text-[#6B7280] px-2 py-1 rounded-lg bg-[#F3F4F6]"
                          >
                            サブ
                          </button>
                          <button onClick={() => deleteItem(titleItem.id)} className="text-[#9CA3AF] p-1">
                            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      )}
                    </div>

                    {/* サブ項目 */}
                    {(childrenMap.get(titleItem.id) ?? []).map(sub => (
                      <div key={sub.id} className="flex items-start gap-2 px-4 py-2 pl-8 bg-[#FAFAFA] border-b border-gray-50">
                        <span className="text-[#9CA3AF] text-xs mt-0.5">└</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-[#1B1B1B]">{sub.title}</p>
                          {sub.lesson_id && lessonsMap.get(sub.lesson_id) && (
                            <p className="text-xs text-[#52B788] mt-0.5">
                              {lessonLabel(lessonsMap.get(sub.lesson_id)!)}
                            </p>
                          )}
                        </div>
                        {isInstructor && (
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => setAssignItem(sub)}
                              className="text-xs text-[#52B788] px-2 py-1 rounded-lg bg-[#F0FDF4]"
                            >
                              授業
                            </button>
                            <button onClick={() => deleteItem(sub.id)} className="text-[#9CA3AF] p-1">
                              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ))}

                {/* タイトル追加ボタン（展開時） */}
                {isInstructor && (
                  <button
                    onClick={() => setShowAddModal({ parentId: null, defaultSubject: subject })}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-[#52B788]"
                  >
                    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                    タイトルを追加
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 追加ボタン */}
      {isInstructor && (
        <div className="bg-white border-t border-gray-100 px-4 py-3">
          <button
            onClick={() => setShowAddModal({ parentId: null })}
            className="w-full border-2 border-dashed border-[#52B788] text-[#2D6A4F] font-bold py-3 rounded-2xl flex items-center justify-center gap-2"
          >
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            教科・タイトルを追加
          </button>
        </div>
      )}

      {showAddModal !== null && (
        <AddItemModal
          room={room}
          subjects={subjects}
          lessons={lessons}
          parentId={showAddModal.parentId}
          defaultSubject={showAddModal.defaultSubject}
          onClose={() => setShowAddModal(null)}
        />
      )}

      {assignItem && (
        <AssignLessonModal
          item={assignItem}
          lessons={lessons}
          onClose={() => setAssignItem(null)}
        />
      )}
    </div>
  )
}
