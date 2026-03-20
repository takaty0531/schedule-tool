import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { Room, Homework, Lesson } from '../types/database'
import { minutesToTime } from '../lib/scheduleUtils'

type Props = { room: Room }

function lessonLabel(lesson: Lesson): string {
  const d = new Date(lesson.scheduled_at)
  const days = ['日', '月', '火', '水', '木', '金', '土']
  return `${d.getMonth() + 1}/${d.getDate()}(${days[d.getDay()]}) ${minutesToTime(d.getHours() * 60 + d.getMinutes())}`
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
  const queryClient = useQueryClient()
  const [title, setTitle] = useState(editing?.title ?? '')
  const [description, setDescription] = useState(editing?.description ?? '')
  const [referenceText, setReferenceText] = useState(editing?.reference_text ?? '')
  const [lessonId, setLessonId] = useState(editing?.lesson_id ?? '')

  const { mutate, isPending } = useMutation({
    mutationFn: async () => {
      if (editing) {
        const { error } = await supabase.from('homework').update({
          title: title.trim(),
          description: description.trim() || null,
          reference_text: referenceText.trim() || null,
          lesson_id: lessonId || null,
        }).eq('id', editing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('homework').insert({
          room_id: room.id,
          title: title.trim(),
          description: description.trim() || null,
          reference_text: referenceText.trim() || null,
          lesson_id: lessonId || null,
        })
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['homework', room.id] })
      onClose()
    },
  })

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50" onClick={onClose}>
      <div
        className="bg-white rounded-t-3xl w-full max-w-lg p-6 space-y-4 overflow-y-auto"
        style={{ maxHeight: '90svh' }}
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

        {/* 参考資料 */}
        <div>
          <label className="block text-sm font-medium text-[#1B1B1B] mb-1">参考資料（任意）</label>
          <textarea
            value={referenceText}
            onChange={e => setReferenceText(e.target.value)}
            placeholder="URLや参考ページなど"
            rows={2}
            maxLength={300}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#52B788] resize-none"
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
  isInstructor,
  onEdit,
  onDelete,
  onClose,
}: {
  hw: Homework
  lesson: Lesson | null
  isInstructor: boolean
  onEdit: () => void
  onDelete: () => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-t-3xl w-full max-w-lg p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-bold text-[#1B1B1B] flex-1 pr-2">{hw.title}</h2>
          {isInstructor && (
            <div className="flex gap-2">
              <button onClick={onEdit} className="text-xs text-[#52B788] px-3 py-1.5 rounded-lg bg-[#F0FDF4] font-medium">編集</button>
              <button onClick={onDelete} className="text-xs text-red-500 px-3 py-1.5 rounded-lg bg-red-50 font-medium">削除</button>
            </div>
          )}
        </div>

        {lesson && (
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#2D6A4F] shrink-0" />
            <span className="text-sm text-[#2D6A4F] font-medium">{lessonLabel(lesson)}</span>
          </div>
        )}

        {hw.description && (
          <div className="bg-[#F7F9F7] rounded-xl p-4">
            <p className="text-xs font-medium text-[#6B7280] mb-1">説明</p>
            <p className="text-sm text-[#1B1B1B] whitespace-pre-wrap">{hw.description}</p>
          </div>
        )}

        {hw.reference_text && (
          <div className="bg-[#F7F9F7] rounded-xl p-4">
            <p className="text-xs font-medium text-[#6B7280] mb-1">参考資料</p>
            <p className="text-sm text-[#1B1B1B] whitespace-pre-wrap break-all">{hw.reference_text}</p>
          </div>
        )}

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

  // 宿題一覧
  const { data: homeworkList = [] } = useQuery({
    queryKey: ['homework', room.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('homework')
        .select('*')
        .eq('room_id', room.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Homework[]
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
            {isInstructor ? '下の「＋ 追加」ボタンから宿題を追加しましょう' : '宿題はまだありません'}
          </p>
        )}

        {homeworkList.map(hw => {
          const lesson = hw.lesson_id ? lessonsMap.get(hw.lesson_id) ?? null : null
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
              {hw.description && (
                <p className="text-xs text-[#6B7280] line-clamp-2">{hw.description}</p>
              )}
              {hw.reference_text && (
                <p className="text-xs text-[#9CA3AF]">参考資料あり</p>
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
          isInstructor={isInstructor}
          onEdit={() => { setEditingHw(detailHw); setDetailHw(null); setShowModal(true) }}
          onDelete={() => deleteHw(detailHw.id)}
          onClose={() => setDetailHw(null)}
        />
      )}
    </div>
  )
}
