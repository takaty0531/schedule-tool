import { useState, useMemo, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { Room, Homework, Lesson, HomeworkFile } from '../types/database'
import { minutesToTime } from '../lib/scheduleUtils'

type Props = { room: Room }

function lessonLabel(lesson: Lesson): string {
  const d = new Date(lesson.scheduled_at)
  const days = ['日', '月', '火', '水', '木', '金', '土']
  return `${d.getMonth() + 1}/${d.getDate()}(${days[d.getDay()]}) ${minutesToTime(d.getHours() * 60 + d.getMinutes())}`
}

function lessonDateLabel(lesson: Lesson): string {
  const d = new Date(lesson.scheduled_at)
  const days = ['日', '月', '火', '水', '木', '金', '土']
  return `${d.getMonth() + 1}月${d.getDate()}日(${days[d.getDay()]})`
}

// 提出日の表示ラベル
function dueDateLabel(hw: Homework, lessonsMap: Map<string, Lesson>): string | null {
  if (!hw.due_type) return null
  if (hw.due_type === 'next_lesson') return '次回授業まで'
  if (hw.due_type === 'lesson' && hw.due_lesson_id) {
    const l = lessonsMap.get(hw.due_lesson_id)
    return l ? `${lessonDateLabel(l)}まで` : '指定授業まで'
  }
  if (hw.due_type === 'custom' && hw.due_date) {
    const d = new Date(hw.due_date)
    const days = ['日', '月', '火', '水', '木', '金', '土']
    return `${d.getMonth() + 1}月${d.getDate()}日(${days[d.getDay()]})まで`
  }
  return null
}

// 宿題追加・編集モーダル
function HomeworkModal({
  room,
  lessons,
  editing,
  onClose,
}: {
  room: Room
  lessons: Lesson[]
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
      // ファイルアップロード
      if (hwId && pendingFiles.length > 0 && user) {
        for (const file of pendingFiles) {
          const ext = file.name.split('.').pop()
          const filePath = `homework/${hwId}/${Date.now()}.${ext}`
          const { error: upErr } = await supabase.storage.from('lessons').upload(filePath, file)
          if (upErr) continue
          await supabase.from('homework_files').insert({
            homework_id: hwId,
            uploader_id: user.id,
            file_path: filePath,
            file_name: file.name,
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
    <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50 pt-16" onClick={onClose}>
      <div
        className="bg-white rounded-t-3xl w-full max-w-lg px-6 pt-6 space-y-4 overflow-y-auto"
        style={{ maxHeight: 'calc(100vh - 80px)', paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-[#1B1B1B]">{editing ? '宿題を編集' : '宿題を追加'}</h2>

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

        {/* 授業割り当て */}
        <div>
          <label className="block text-sm font-medium text-[#1B1B1B] mb-1">授業日程（任意）</label>
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

        {/* 説明 */}
        <div>
          <label className="block text-sm font-medium text-[#1B1B1B] mb-1">説明（任意）</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="宿題の詳細や注意点"
            rows={3}
            maxLength={500}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#52B788] resize-none"
          />
        </div>

        {/* 参考資料（テキスト） */}
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
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleAddFile}
              accept="image/*,.pdf,.doc,.docx,.xlsx,.pptx"
            />
          </div>
          {pendingFiles.length === 0 ? (
            <p className="text-xs text-[#9CA3AF]">ファイルが選択されていません</p>
          ) : (
            <div className="space-y-1.5">
              {pendingFiles.map((f, i) => (
                <div key={i} className="flex items-center gap-2 p-2 bg-[#F7F9F7] rounded-xl">
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#2D6A4F" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span className="flex-1 text-xs text-[#1B1B1B] truncate">{f.name}</span>
                  <button
                    type="button"
                    onClick={() => setPendingFiles(prev => prev.filter((_, j) => j !== i))}
                    className="text-[#D1D5DB] p-0.5"
                  >
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

// 宿題詳細モーダル
function HomeworkDetailModal({
  hw,
  lesson,
  dueLessonLabel,
  isInstructor,
  onEdit,
  onDelete,
  onClose,
}: {
  hw: Homework
  lesson: Lesson | null
  dueLessonLabel: string | null
  isInstructor: boolean
  onEdit: () => void
  onDelete: () => void
  onClose: () => void
}) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  // ファイル一覧
  const { data: files = [] } = useQuery({
    queryKey: ['homework_files', hw.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('homework_files').select('*').eq('homework_id', hw.id).order('created_at')
      if (error) throw error
      return data as HomeworkFile[]
    },
  })

  // ファイルアップロード
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user) return
    setUploading(true)
    try {
      const ext = file.name.split('.').pop()
      const filePath = `homework/${hw.id}/${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage.from('lessons').upload(filePath, file)
      if (uploadError) throw uploadError
      const { error: dbError } = await supabase.from('homework_files').insert({
        homework_id: hw.id,
        uploader_id: user.id,
        file_path: filePath,
        file_name: file.name,
      })
      if (dbError) throw dbError
      queryClient.invalidateQueries({ queryKey: ['homework_files', hw.id] })
      queryClient.invalidateQueries({ queryKey: ['homework_file_counts', hw.id] })
    } catch {
      alert('アップロードに失敗しました')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // ファイル削除
  const { mutate: deleteFile } = useMutation({
    mutationFn: async ({ fileId, filePath }: { fileId: string; filePath: string }) => {
      await supabase.storage.from('lessons').remove([filePath])
      const { error } = await supabase.from('homework_files').delete().eq('id', fileId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['homework_files', hw.id] })
      queryClient.invalidateQueries({ queryKey: ['homework_file_counts', hw.id] })
    },
  })

  // ファイルダウンロード
  const openFile = async (filePath: string) => {
    const { data } = await supabase.storage.from('lessons').createSignedUrl(filePath, 60)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50 pt-16" onClick={onClose}>
      <div
        className="bg-white rounded-t-3xl w-full max-w-lg px-6 pt-6 space-y-4 overflow-y-auto"
        style={{ maxHeight: 'calc(100vh - 80px)', paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-bold text-[#1B1B1B] flex-1 pr-2">{hw.title}</h2>
          {isInstructor && (
            <div className="flex gap-2">
              <button onClick={onEdit} className="text-xs text-[#52B788] px-3 py-1.5 rounded-lg bg-[#F0FDF4] font-medium">編集</button>
              <button onClick={onDelete} className="text-xs text-red-500 px-3 py-1.5 rounded-lg bg-red-50 font-medium">削除</button>
            </div>
          )}
        </div>

        <div className="space-y-2">
          {lesson && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#6B7280]">授業日程:</span>
              <span className="text-sm text-[#2D6A4F] font-medium">{lessonLabel(lesson)}</span>
            </div>
          )}
          {dueLessonLabel && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#6B7280]">提出日:</span>
              <span className="text-sm font-medium text-orange-500">{dueLessonLabel}</span>
            </div>
          )}
        </div>

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

        {/* 参考資料ファイル */}
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
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileUpload}
              accept="image/*,.pdf,.doc,.docx,.xlsx,.pptx"
            />
          </div>

          {files.length === 0 ? (
            <p className="text-xs text-[#9CA3AF] text-center py-2">ファイルはありません</p>
          ) : (
            <div className="space-y-2">
              {files.map(f => (
                <div key={f.id} className="flex items-center gap-3 p-3 bg-[#F7F9F7] rounded-xl">
                  <div className="w-8 h-8 rounded-lg bg-[#D8F3DC] flex items-center justify-center shrink-0">
                    {f.file_name.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                      <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#2D6A4F" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    ) : (
                      <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#2D6A4F" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    )}
                  </div>
                  <button
                    onClick={() => openFile(f.file_path)}
                    className="flex-1 text-left text-sm text-[#1B1B1B] truncate"
                  >
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

export default function HomeworkTab({ room }: Props) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const isInstructor = user?.id === room.instructor_id
  const [showModal, setShowModal] = useState(false)
  const [editingHw, setEditingHw] = useState<Homework | null>(null)
  const [detailHw, setDetailHw] = useState<Homework | null>(null)

  const { data: homeworkList = [] } = useQuery({
    queryKey: ['homework', room.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('homework').select('*').eq('room_id', room.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Homework[]
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

  // 各宿題のファイル数をまとめて取得
  const { data: fileCounts = {} } = useQuery({
    queryKey: ['homework_file_counts', room.id, homeworkList.map(h => h.id).join(',')],
    queryFn: async () => {
      if (homeworkList.length === 0) return {}
      const { data, error } = await supabase
        .from('homework_files')
        .select('homework_id')
        .in('homework_id', homeworkList.map(h => h.id))
      if (error) throw error
      const counts: Record<string, number> = {}
      for (const row of data) {
        counts[row.homework_id] = (counts[row.homework_id] ?? 0) + 1
      }
      return counts
    },
    enabled: homeworkList.length > 0,
  })

  const lessonsMap = useMemo(() => new Map(lessons.map(l => [l.id, l])), [lessons])

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

  return (
    <div className="flex flex-col">
      <div className="overflow-y-auto px-4 py-4 space-y-3" style={{ maxHeight: 'calc(100svh - 280px)' }}>
        {homeworkList.length === 0 && (
          <p className="text-sm text-[#6B7280] text-center py-8">
            {isInstructor ? '下のボタンから宿題を追加しましょう' : '宿題はまだありません'}
          </p>
        )}

        {homeworkList.map(hw => {
          const lesson = hw.lesson_id ? lessonsMap.get(hw.lesson_id) ?? null : null
          const dueLabel = dueDateLabel(hw, lessonsMap)
          const fileCount = fileCounts[hw.id] ?? 0
          return (
            <button
              key={hw.id}
              onClick={() => setDetailHw(hw)}
              className="w-full bg-white rounded-2xl p-4 text-left space-y-1.5"
            >
              <p className="font-medium text-[#1B1B1B]">{hw.title}</p>
              {lesson && (
                <p className="text-xs text-[#52B788]">{lessonLabel(lesson)}</p>
              )}
              {dueLabel && (
                <p className="text-xs font-medium text-orange-500">{dueLabel}</p>
              )}
              {hw.description && (
                <p className="text-xs text-[#6B7280] line-clamp-2">{hw.description}</p>
              )}
              {(hw.reference_text || fileCount > 0) && (
                <div className="flex items-center gap-2">
                  {hw.reference_text && (
                    <span className="text-xs text-[#9CA3AF]">テキストあり</span>
                  )}
                  {fileCount > 0 && (
                    <span className="text-xs text-[#52B788] flex items-center gap-1">
                      <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                      </svg>
                      {fileCount}件
                    </span>
                  )}
                </div>
              )}
            </button>
          )
        })}
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
          lessons={lessons}
          editing={editingHw}
          onClose={() => { setShowModal(false); setEditingHw(null) }}
        />
      )}

      {detailHw && (
        <HomeworkDetailModal
          hw={detailHw}
          lesson={detailHw.lesson_id ? lessonsMap.get(detailHw.lesson_id) ?? null : null}
          dueLessonLabel={dueDateLabel(detailHw, lessonsMap)}
          isInstructor={isInstructor}
          onEdit={() => { setEditingHw(detailHw); setDetailHw(null); setShowModal(true) }}
          onDelete={() => deleteHw(detailHw.id)}
          onClose={() => setDetailHw(null)}
        />
      )}
    </div>
  )
}
