import { useState, useMemo, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { Room, Homework, Lesson, HomeworkFile, RoomMember, Profile, HomeworkCompletion } from '../types/database'
import { minutesToTime } from '../lib/scheduleUtils'

type Props = {
  room: Room
  members: (RoomMember & { profile: Profile })[]
}

// --- ユーティリティ ---

function lessonLabel(lesson: Lesson): string {
  const d = new Date(lesson.scheduled_at)
  const days = ['日', '月', '火', '水', '木', '金', '土']
  return `${d.getMonth() + 1}/${d.getDate()}(${days[d.getDay()]}) ${minutesToTime(d.getHours() * 60 + d.getMinutes())}`
}

function lessonFullLabel(lesson: Lesson): string {
  const d = new Date(lesson.scheduled_at)
  const days = ['日', '月', '火', '水', '木', '金', '土']
  return `${d.getMonth() + 1}月${d.getDate()}日(${days[d.getDay()]}) ${minutesToTime(d.getHours() * 60 + d.getMinutes())}の授業`
}

function dueDateLabel(hw: Homework, lessonsMap: Map<string, Lesson>): string | null {
  if (!hw.due_type) return null
  if (hw.due_type === 'next_lesson') return '次回授業まで'
  if (hw.due_type === 'lesson' && hw.due_lesson_id) {
    const l = lessonsMap.get(hw.due_lesson_id)
    if (!l) return '指定授業まで'
    const d = new Date(l.scheduled_at)
    const days = ['日', '月', '火', '水', '木', '金', '土']
    return `${d.getMonth() + 1}/${d.getDate()}(${days[d.getDay()]})まで`
  }
  if (hw.due_type === 'custom' && hw.due_date) {
    const d = new Date(hw.due_date)
    const days = ['日', '月', '火', '水', '木', '金', '土']
    return `${d.getMonth() + 1}/${d.getDate()}(${days[d.getDay()]})まで`
  }
  return null
}

// 実際の提出期限日時を計算
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

function hwIsOverdue(hw: Homework, lessonsMap: Map<string, Lesson>, sortedLessons: Lesson[]): boolean {
  const due = resolvedDueDate(hw, lessonsMap, sortedLessons)
  return due ? due < new Date() : false
}

// 授業日程別グループ化
type LessonGroup = { lesson: Lesson | null; items: Homework[] }

function groupByLesson(hwList: Homework[], lessonsMap: Map<string, Lesson>): LessonGroup[] {
  const map = new Map<string | null, Homework[]>()
  for (const hw of hwList) {
    const key = hw.lesson_id ?? null
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(hw)
  }
  const result: LessonGroup[] = []
  for (const [lessonId, items] of map) {
    result.push({ lesson: lessonId ? (lessonsMap.get(lessonId) ?? null) : null, items })
  }
  result.sort((a, b) => {
    if (!a.lesson) return 1
    if (!b.lesson) return -1
    return new Date(a.lesson.scheduled_at).getTime() - new Date(b.lesson.scheduled_at).getTime()
  })
  return result
}

// --- 宿題詳細モーダル ---
function HomeworkDetailModal({
  hw,
  lesson,
  dueLabel,
  isInstructor,
  assignedName,
  isCompleted,
  isLearner,
  onEdit,
  onDelete,
  onToggleComplete,
  onClose,
}: {
  hw: Homework
  lesson: Lesson | null
  dueLabel: string | null
  isInstructor: boolean
  assignedName: string | null
  isCompleted: boolean
  isLearner: boolean
  onEdit: () => void
  onDelete: () => void
  onToggleComplete: () => void
  onClose: () => void
}) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const { data: files = [] } = useQuery({
    queryKey: ['homework_files', hw.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('homework_files').select('*').eq('homework_id', hw.id).order('created_at')
      if (error) throw error
      return data as HomeworkFile[]
    },
  })

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user) return
    setUploading(true)
    try {
      const ext = file.name.split('.').pop()
      const filePath = `homework/${hw.id}/${Date.now()}.${ext}`
      await supabase.storage.from('lessons').upload(filePath, file)
      await supabase.from('homework_files').insert({
        homework_id: hw.id, uploader_id: user.id, file_path: filePath, file_name: file.name,
      })
      queryClient.invalidateQueries({ queryKey: ['homework_files', hw.id] })
    } catch { alert('アップロードに失敗しました') }
    finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const { mutate: deleteFile } = useMutation({
    mutationFn: async ({ fileId, filePath }: { fileId: string; filePath: string }) => {
      await supabase.storage.from('lessons').remove([filePath])
      const { error } = await supabase.from('homework_files').delete().eq('id', fileId)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['homework_files', hw.id] }),
  })

  const openFile = async (filePath: string) => {
    const { data } = await supabase.storage.from('lessons').createSignedUrl(filePath, 60)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50" onClick={onClose}>
      <div
        className="fixed bottom-6 left-4 right-4 max-w-lg mx-auto bg-white rounded-2xl p-6 space-y-4 overflow-y-auto"
        style={{ maxHeight: 'calc(100dvh - 5rem)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-lg font-bold text-[#1B1B1B] flex-1">{hw.title}</h2>
          {isInstructor && (
            <div className="flex gap-2 shrink-0">
              <button onClick={onEdit} className="text-xs text-[#52B788] px-3 py-1.5 rounded-lg bg-[#F0FDF4] font-medium">編集</button>
              <button onClick={onDelete} className="text-xs text-red-500 px-3 py-1.5 rounded-lg bg-red-50 font-medium">削除</button>
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          {lesson && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#6B7280]">授業:</span>
              <span className="text-sm text-[#2D6A4F] font-medium">{lessonLabel(lesson)}</span>
            </div>
          )}
          {assignedName && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#6B7280]">担当:</span>
              <span className="text-sm font-medium text-[#1B1B1B]">{assignedName}</span>
            </div>
          )}
          {dueLabel && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#6B7280]">提出:</span>
              <span className="text-sm font-medium text-orange-500">{dueLabel}</span>
            </div>
          )}
        </div>

        {/* 完了トグル（生徒のみ） */}
        {isLearner && (
          <button
            onClick={onToggleComplete}
            className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-medium text-sm transition-colors ${
              isCompleted
                ? 'bg-[#D8F3DC] text-[#2D6A4F]'
                : 'bg-[#F7F9F7] text-[#6B7280]'
            }`}
          >
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            {isCompleted ? '完了済み（タップで未完了に戻す）' : '完了にする'}
          </button>
        )}

        {hw.description && (
          <div className="bg-[#F7F9F7] rounded-xl p-4">
            <p className="text-xs font-medium text-[#6B7280] mb-1">説明</p>
            <p className="text-sm text-[#1B1B1B] whitespace-pre-wrap">{hw.description}</p>
          </div>
        )}

        {hw.reference_text && (
          <div className="bg-[#F7F9F7] rounded-xl p-4">
            <p className="text-xs font-medium text-[#6B7280] mb-1">参考資料テキスト</p>
            <p className="text-sm text-[#1B1B1B] whitespace-pre-wrap break-all">{hw.reference_text}</p>
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-[#1B1B1B]">参考資料ファイル</p>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="text-xs text-[#52B788] font-medium px-3 py-1.5 rounded-lg bg-[#F0FDF4]"
            >
              {uploading ? 'アップロード中...' : '＋ 追加'}
            </button>
            <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileUpload}
              accept="image/*,.pdf,.doc,.docx,.xlsx,.pptx" />
          </div>
          {files.length === 0 ? (
            <p className="text-xs text-[#9CA3AF] text-center py-2">ファイルはありません</p>
          ) : (
            <div className="space-y-2">
              {files.map(f => (
                <div key={f.id} className="flex items-center gap-3 p-3 bg-[#F7F9F7] rounded-xl">
                  <div className="w-8 h-8 rounded-lg bg-[#D8F3DC] flex items-center justify-center shrink-0">
                    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#2D6A4F" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <button onClick={() => openFile(f.file_path)} className="flex-1 text-left text-sm text-[#1B1B1B] truncate">
                    {f.file_name}
                  </button>
                  {(isInstructor || f.uploader_id === user?.id) && (
                    <button
                      onClick={() => confirm('削除しますか？') && deleteFile({ fileId: f.id, filePath: f.file_path })}
                      className="text-[#D1D5DB] p-1 shrink-0"
                    >
                      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <button onClick={onClose} className="w-full text-sm text-[#6B7280] py-2">閉じる</button>
      </div>
    </div>
  )
}

// --- 宿題追加・編集モーダル ---
function HomeworkModal({
  room,
  lessons,
  learners,
  editing,
  onClose,
}: {
  room: Room
  lessons: Lesson[]
  learners: (RoomMember & { profile: Profile })[]
  editing: Homework | null
  onClose: () => void
}) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [title, setTitle] = useState(editing?.title ?? '')
  const [description, setDescription] = useState(editing?.description ?? '')
  const [referenceText, setReferenceText] = useState(editing?.reference_text ?? '')
  const [lessonId, setLessonId] = useState(editing?.lesson_id ?? '')
  const [assignedTo, setAssignedTo] = useState(editing?.assigned_to ?? '')
  const [dueType, setDueType] = useState<'lesson' | 'next_lesson' | 'custom' | ''>(editing?.due_type ?? '')
  const [dueLessonId, setDueLessonId] = useState(editing?.due_lesson_id ?? '')
  const [dueDate, setDueDate] = useState(editing?.due_date ?? '')
  const [pendingFiles, setPendingFiles] = useState<File[]>([])

  const handleAddFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPendingFiles(prev => [...prev, file])
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  const { mutate, isPending } = useMutation({
    mutationFn: async () => {
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        reference_text: referenceText.trim() || null,
        lesson_id: lessonId || null,
        assigned_to: assignedTo || null,
        due_type: dueType || null,
        due_lesson_id: dueType === 'lesson' ? (dueLessonId || null) : null,
        due_date: dueType === 'custom' ? (dueDate || null) : null,
      }
      let hwId = editing?.id
      if (editing) {
        const { error } = await supabase.from('homework').update(payload).eq('id', editing.id)
        if (error) throw error
      } else {
        const { data, error } = await supabase.from('homework').insert({ room_id: room.id, ...payload }).select('id').single()
        if (error) throw error
        hwId = data.id
      }
      if (hwId && pendingFiles.length > 0 && user) {
        for (const file of pendingFiles) {
          const ext = file.name.split('.').pop()
          const filePath = `homework/${hwId}/${Date.now()}.${ext}`
          const { error: upErr } = await supabase.storage.from('lessons').upload(filePath, file)
          if (upErr) continue
          await supabase.from('homework_files').insert({
            homework_id: hwId, uploader_id: user.id, file_path: filePath, file_name: file.name,
          })
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['homework', room.id] })
      onClose()
    },
  })

  return (
    <div className="fixed inset-0 bg-black/40 z-50" onClick={onClose}>
      <div
        className="fixed bottom-6 left-4 right-4 max-w-lg mx-auto bg-white rounded-2xl p-6 space-y-4 overflow-y-auto"
        style={{ maxHeight: 'calc(100dvh - 5rem)' }}
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-[#1B1B1B]">{editing ? '宿題を編集' : '宿題を追加'}</h2>

        {/* 授業日程（プライマリ） */}
        <div>
          <label className="block text-sm font-medium text-[#1B1B1B] mb-1">授業日程</label>
          {lessons.length === 0 ? (
            <p className="text-xs text-[#9CA3AF] py-2">確定した授業がありません</p>
          ) : (
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
          )}
        </div>

        {/* タイトル */}
        <div>
          <label className="block text-sm font-medium text-[#1B1B1B] mb-1">タイトル</label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="例: 教科書 p.30〜35"
            maxLength={50}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#52B788]"
          />
        </div>

        {/* 説明 */}
        <div>
          <label className="block text-sm font-medium text-[#1B1B1B] mb-1">内容（任意）</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="宿題の詳細や注意点"
            rows={3}
            maxLength={500}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#52B788] resize-none"
          />
        </div>

        {/* 担当生徒 */}
        {learners.length > 1 && (
          <div>
            <label className="block text-sm font-medium text-[#1B1B1B] mb-1">担当生徒（任意）</label>
            <select
              value={assignedTo}
              onChange={e => setAssignedTo(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#52B788]"
            >
              <option value="">全員</option>
              {learners.map(m => (
                <option key={m.learner_id} value={m.learner_id}>{m.profile?.display_name ?? m.display_name}</option>
              ))}
            </select>
          </div>
        )}

        {/* 提出日 */}
        <div>
          <label className="block text-sm font-medium text-[#1B1B1B] mb-2">提出日（任意）</label>
          <div className="flex gap-2 flex-wrap">
            {[
              { value: '', label: '設定なし' },
              { value: 'next_lesson', label: '次回授業まで' },
              { value: 'lesson', label: '授業日を指定' },
              { value: 'custom', label: '日付を入力' },
            ].map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setDueType(opt.value as typeof dueType)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
                  dueType === opt.value
                    ? 'bg-[#2D6A4F] text-white border-[#2D6A4F]'
                    : 'bg-white text-[#6B7280] border-gray-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {dueType === 'lesson' && (
            <div className="mt-2">
              {lessons.length === 0 ? (
                <p className="text-xs text-[#9CA3AF]">確定した授業がありません</p>
              ) : (
                <select
                  value={dueLessonId}
                  onChange={e => setDueLessonId(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#52B788]"
                >
                  <option value="">授業を選択</option>
                  {lessons.map(l => (
                    <option key={l.id} value={l.id}>{lessonLabel(l)}</option>
                  ))}
                </select>
              )}
            </div>
          )}
          {dueType === 'custom' && (
            <input
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              className="mt-2 w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#52B788]"
            />
          )}
        </div>

        {/* 参考資料テキスト */}
        <div>
          <label className="block text-sm font-medium text-[#1B1B1B] mb-1">参考資料テキスト（任意）</label>
          <textarea
            value={referenceText}
            onChange={e => setReferenceText(e.target.value)}
            placeholder="URLや参考ページなど"
            rows={2}
            maxLength={300}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#52B788] resize-none"
          />
        </div>

        {/* 参考資料ファイル */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-[#1B1B1B]">参考資料ファイル（任意）</label>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-xs text-[#52B788] font-medium px-3 py-1.5 rounded-lg bg-[#F0FDF4]"
            >
              ＋ 追加
            </button>
            <input ref={fileInputRef} type="file" className="hidden" onChange={handleAddFile}
              accept="image/*,.pdf,.doc,.docx,.xlsx,.pptx" />
          </div>
          {pendingFiles.length === 0 ? (
            <p className="text-xs text-[#9CA3AF]">ファイルが選択されていません</p>
          ) : (
            <div className="space-y-1.5">
              {pendingFiles.map((f, i) => (
                <div key={i} className="flex items-center gap-2 p-2 bg-[#F7F9F7] rounded-xl">
                  <span className="flex-1 text-xs text-[#1B1B1B] truncate">{f.name}</span>
                  <button type="button" onClick={() => setPendingFiles(prev => prev.filter((_, j) => j !== i))}
                    className="text-[#D1D5DB] p-0.5">
                    <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={() => mutate()}
          disabled={!title.trim() || isPending}
          className="w-full bg-[#2D6A4F] hover:bg-[#245c43] text-white font-bold py-3 rounded-2xl transition-colors disabled:opacity-50"
        >
          {isPending ? '保存中...' : editing ? '更新する' : '追加する'}
        </button>
        <button onClick={onClose} className="w-full text-sm text-[#6B7280] py-2">キャンセル</button>
      </div>
    </div>
  )
}

// --- 宿題カード ---
function HomeworkCard({
  hw,
  dueLabel,
  isCompleted,
  isLearner,
  isOverdueFlag,
  assignedName,
  onTap,
  onToggleComplete,
}: {
  hw: Homework
  dueLabel: string | null
  isCompleted: boolean
  isLearner: boolean
  isOverdueFlag: boolean
  assignedName: string | null
  onTap: () => void
  onToggleComplete: () => void
}) {
  return (
    <div className="flex items-start gap-3 bg-white rounded-2xl p-4">
      {/* 完了チェックボックス */}
      {isLearner ? (
        <button
          onClick={e => { e.stopPropagation(); onToggleComplete() }}
          className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
            isCompleted ? 'bg-[#52B788] border-[#52B788]' : isOverdueFlag ? 'border-red-400' : 'border-gray-300'
          }`}
        >
          {isCompleted && (
            <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </button>
      ) : (
        <div className={`w-2 h-2 rounded-full shrink-0 mt-2 ${isCompleted ? 'bg-[#52B788]' : isOverdueFlag ? 'bg-red-400' : 'bg-gray-300'}`} />
      )}

      {/* コンテンツ */}
      <button className="flex-1 text-left min-w-0" onClick={onTap}>
        <p className={`font-medium text-sm leading-snug ${isCompleted ? 'text-[#9CA3AF] line-through' : '[#1B1B1B]'}`}>
          {hw.title}
        </p>
        {assignedName && (
          <p className="text-xs text-[#6B7280] mt-0.5">{assignedName}</p>
        )}
        {dueLabel && (
          <p className={`text-xs mt-0.5 font-medium ${isOverdueFlag && !isCompleted ? 'text-red-500' : 'text-orange-500'}`}>
            {dueLabel}{isOverdueFlag && !isCompleted ? ' ⚠️' : ''}
          </p>
        )}
        {hw.description && (
          <p className="text-xs text-[#6B7280] mt-1 line-clamp-2">{hw.description}</p>
        )}
      </button>
    </div>
  )
}

// --- メインコンポーネント ---
export default function HomeworkTab({ room, members }: Props) {
  const { user, profile } = useAuth()
  const queryClient = useQueryClient()
  const isInstructor = user?.id === room.instructor_id
  const isLearner = profile?.role === 'learner'
  const [showModal, setShowModal] = useState(false)
  const [editingHw, setEditingHw] = useState<Homework | null>(null)
  const [detailHw, setDetailHw] = useState<Homework | null>(null)
  const [completedOpen, setCompletedOpen] = useState(false)

  // 生徒のみのメンバー（担当割り当て用）
  const learners = useMemo(
    () => members.filter(m => m.profile?.role === 'learner'),
    [members]
  )

  // 宿題一覧
  const { data: homeworkList = [] } = useQuery({
    queryKey: ['homework', room.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('homework').select('*').eq('room_id', room.id).order('created_at', { ascending: false })
      if (error) throw error
      return data as Homework[]
    },
    enabled: !!user,
  })

  // 授業一覧（全ステータス、日付順）
  const { data: lessons = [] } = useQuery({
    queryKey: ['lessons_all', room.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lessons').select('*').eq('room_id', room.id).neq('status', 'cancelled').order('scheduled_at').limit(500)
      if (error) throw error
      return data as Lesson[]
    },
    enabled: !!user,
  })

  // 自分の完了状態
  const { data: completions = [] } = useQuery({
    queryKey: ['homework_completions', room.id, user?.id],
    queryFn: async () => {
      const hwIds = homeworkList.map(h => h.id)
      if (hwIds.length === 0) return []
      const { data, error } = await supabase
        .from('homework_completions').select('*').in('homework_id', hwIds).eq('learner_id', user!.id)
      if (error) throw error
      return data as HomeworkCompletion[]
    },
    enabled: !!user && homeworkList.length > 0 && !isInstructor,
  })

  // 先生用: 全完了状態
  const { data: allCompletions = [] } = useQuery({
    queryKey: ['homework_completions_all', room.id],
    queryFn: async () => {
      const hwIds = homeworkList.map(h => h.id)
      if (hwIds.length === 0) return []
      const { data, error } = await supabase
        .from('homework_completions').select('*').in('homework_id', hwIds)
      if (error) throw error
      return data as HomeworkCompletion[]
    },
    enabled: !!user && homeworkList.length > 0 && isInstructor,
  })

  const lessonsMap = useMemo(() => new Map(lessons.map(l => [l.id, l])), [lessons])
  const membersMap = useMemo(() => new Map(members.map(m => [m.learner_id, m])), [members])

  const completedHwIds = useMemo(() => {
    const source = isInstructor ? [] : completions  // 先生は完了判定しない
    return new Set(source.map(c => c.homework_id))
  }, [completions, isInstructor])

  const completedCountByHw = useMemo(() => {
    const map = new Map<string, number>()
    for (const c of allCompletions) {
      map.set(c.homework_id, (map.get(c.homework_id) ?? 0) + 1)
    }
    return map
  }, [allCompletions])

  // 完了トグル
  const { mutate: toggleCompletion } = useMutation({
    mutationFn: async ({ hwId, nowCompleted }: { hwId: string; nowCompleted: boolean }) => {
      if (nowCompleted) {
        const { error } = await supabase.from('homework_completions').insert({ homework_id: hwId, learner_id: user!.id })
        if (error) throw error
      } else {
        const { error } = await supabase.from('homework_completions').delete()
          .eq('homework_id', hwId).eq('learner_id', user!.id)
        if (error) throw error
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['homework_completions', room.id, user?.id] }),
  })

  // 削除
  const { mutate: deleteHw } = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('homework').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['homework', room.id] })
      setDetailHw(null)
    },
  })

  // セクション分け
  const { upcoming, overdue, completed } = useMemo(() => {
    const upcoming: Homework[] = []
    const overdue: Homework[] = []
    const completed: Homework[] = []
    for (const hw of homeworkList) {
      if (completedHwIds.has(hw.id)) {
        completed.push(hw)
      } else if (hwIsOverdue(hw, lessonsMap, lessons)) {
        overdue.push(hw)
      } else {
        upcoming.push(hw)
      }
    }
    return { upcoming, overdue, completed }
  }, [homeworkList, completedHwIds, lessonsMap, lessons])

  const upcomingGroups = useMemo(() => groupByLesson(upcoming, lessonsMap), [upcoming, lessonsMap])
  const overdueGroups = useMemo(() => groupByLesson(overdue, lessonsMap), [overdue, lessonsMap])
  const completedGroups = useMemo(() => groupByLesson(completed, lessonsMap), [completed, lessonsMap])

  function renderGroups(groups: LessonGroup[], isOverdueSection: boolean) {
    return groups.map((g, gi) => (
      <div key={gi} className="space-y-2">
        {/* 授業ヘッダー */}
        <div className="flex items-center gap-2 px-1">
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#6B7280" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span className="text-xs font-semibold text-[#6B7280]">
            {g.lesson ? lessonFullLabel(g.lesson) : '授業未割り当て'}
          </span>
        </div>
        {g.items.map(hw => {
          const isCompleted = completedHwIds.has(hw.id)
          const completedCount = completedCountByHw.get(hw.id) ?? 0
          const assignedMember = hw.assigned_to ? membersMap.get(hw.assigned_to) : null
          const assignedName = assignedMember
            ? (assignedMember.profile?.display_name ?? assignedMember.display_name)
            : null
          return (
            <div key={hw.id}>
              <HomeworkCard
                hw={hw}
                dueLabel={dueDateLabel(hw, lessonsMap)}
                isCompleted={isCompleted}
                isLearner={isLearner}
                isOverdueFlag={isOverdueSection}
                assignedName={isInstructor && assignedName ? assignedName : null}
                onTap={() => setDetailHw(hw)}
                onToggleComplete={() => toggleCompletion({ hwId: hw.id, nowCompleted: !isCompleted })}
              />
              {/* 先生向け: 完了件数バッジ */}
              {isInstructor && completedCount > 0 && (
                <p className="text-xs text-[#52B788] px-4 pt-1">{completedCount}人が完了済み</p>
              )}
            </div>
          )
        })}
      </div>
    ))
  }

  const scheduledLessons = useMemo(() => lessons.filter(l => l.status === 'scheduled'), [lessons])

  return (
    <div className="flex flex-col">
      <div className="overflow-y-auto px-4 py-4 space-y-5" style={{ maxHeight: 'calc(100svh - 280px)' }}>

        {homeworkList.length === 0 && (
          <p className="text-sm text-[#6B7280] text-center py-8">
            {isInstructor ? '下のボタンから宿題を追加しましょう' : '宿題はまだありません'}
          </p>
        )}

        {/* 未提出セクション */}
        {upcoming.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-[#1B1B1B]">未提出</span>
              <span className="text-xs bg-[#F7F9F7] text-[#6B7280] px-2 py-0.5 rounded-full">{upcoming.length}</span>
            </div>
            {renderGroups(upcomingGroups, false)}
          </div>
        )}

        {/* 期限超過セクション */}
        {overdue.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-red-500">期限超過</span>
              <span className="text-xs bg-red-50 text-red-500 px-2 py-0.5 rounded-full">{overdue.length}</span>
            </div>
            {renderGroups(overdueGroups, true)}
          </div>
        )}

        {/* 完了セクション（折りたたみ） */}
        {completed.length > 0 && (
          <div className="space-y-3">
            <button
              onClick={() => setCompletedOpen(v => !v)}
              className="flex items-center gap-2 w-full text-left"
            >
              <span className="text-sm font-bold text-[#6B7280]">完了</span>
              <span className="text-xs bg-[#D8F3DC] text-[#2D6A4F] px-2 py-0.5 rounded-full">{completed.length}</span>
              <svg
                width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#9CA3AF" strokeWidth={2}
                className={`ml-auto transition-transform ${completedOpen ? 'rotate-180' : ''}`}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {completedOpen && renderGroups(completedGroups, false)}
          </div>
        )}
      </div>

      {isInstructor && (
        <div className="bg-white border-t border-gray-100 px-4 py-3">
          <button
            onClick={() => { setEditingHw(null); setShowModal(true) }}
            className="w-full border-2 border-dashed border-[#52B788] text-[#2D6A4F] font-bold py-3 rounded-2xl flex items-center justify-center gap-2"
          >
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            宿題を追加
          </button>
        </div>
      )}

      {showModal && (
        <HomeworkModal
          room={room}
          lessons={scheduledLessons}
          learners={learners}
          editing={editingHw}
          onClose={() => { setShowModal(false); setEditingHw(null) }}
        />
      )}

      {detailHw && (
        <HomeworkDetailModal
          hw={detailHw}
          lesson={detailHw.lesson_id ? lessonsMap.get(detailHw.lesson_id) ?? null : null}
          dueLabel={dueDateLabel(detailHw, lessonsMap)}
          isInstructor={isInstructor}
          isLearner={isLearner}
          assignedName={(() => {
            if (!detailHw.assigned_to) return null
            const m = membersMap.get(detailHw.assigned_to)
            return m ? (m.profile?.display_name ?? m.display_name) : null
          })()}
          isCompleted={completedHwIds.has(detailHw.id)}
          onEdit={() => { setEditingHw(detailHw); setDetailHw(null); setShowModal(true) }}
          onDelete={() => deleteHw(detailHw.id)}
          onToggleComplete={() => toggleCompletion({
            hwId: detailHw.id,
            nowCompleted: !completedHwIds.has(detailHw.id),
          })}
          onClose={() => setDetailHw(null)}
        />
      )}
    </div>
  )
}
