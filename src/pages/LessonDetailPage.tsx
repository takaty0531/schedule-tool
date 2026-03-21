import { useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import BottomNav from '../components/BottomNav'
import type { Lesson, LessonRecord, LessonFile, Homework, RoomMember, Profile } from '../types/database'
import { minutesToTime } from '../lib/scheduleUtils'

export default function LessonDetailPage() {
  const { id: roomId, lid: lessonId } = useParams<{ id: string; lid: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [recordContent, setRecordContent] = useState('')
  const [recordDirty, setRecordDirty] = useState(false)
  const [uploadingFile, setUploadingFile] = useState(false)

  // 授業情報
  const { data: lesson } = useQuery({
    queryKey: ['lesson', lessonId],
    queryFn: async () => {
      const { data, error } = await supabase.from('lessons').select('*').eq('id', lessonId!).single()
      if (error) throw error
      return data as Lesson
    },
    enabled: !!lessonId,
  })

  // メンバー（生徒名取得用）
  const { data: members = [] } = useQuery({
    queryKey: ['members', roomId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('room_members').select('*, profile:profiles(*)').eq('room_id', roomId!)
      if (error) throw error
      return data as (RoomMember & { profile: Profile })[]
    },
    enabled: !!roomId,
  })

  // ルーム情報（講師判定）
  const { data: room } = useQuery({
    queryKey: ['room', roomId],
    queryFn: async () => {
      const { data, error } = await supabase.from('rooms').select('*').eq('id', roomId!).single()
      if (error) throw error
      return data
    },
    enabled: !!roomId,
  })

  const isInstructor = user?.id === room?.instructor_id

  // 授業記録
  const { data: record } = useQuery({
    queryKey: ['lesson_record', lessonId],
    queryFn: async () => {
      const { data } = await supabase
        .from('lesson_records').select('*').eq('lesson_id', lessonId!).maybeSingle()
      if (data) setRecordContent(data.content ?? '')
      return data as LessonRecord | null
    },
    enabled: !!lessonId,
  })

  // ファイル一覧
  const { data: files = [] } = useQuery({
    queryKey: ['lesson_files', lessonId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lesson_files').select('*').eq('lesson_id', lessonId!).order('created_at')
      if (error) throw error
      return data as LessonFile[]
    },
    enabled: !!lessonId,
  })

  // この授業に紐づいた宿題
  const { data: homeworkList = [] } = useQuery({
    queryKey: ['homework_for_lesson', lessonId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('homework').select('*').eq('lesson_id', lessonId!).order('created_at')
      if (error) throw error
      return data as Homework[]
    },
    enabled: !!lessonId,
  })

  // 授業完了
  const { mutate: markDone, isPending: isMarkingDone } = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('lessons').update({ status: 'done' }).eq('id', lessonId!)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lesson', lessonId] })
      queryClient.invalidateQueries({ queryKey: ['lessons_scheduled', roomId] })
      queryClient.invalidateQueries({ queryKey: ['lessons', roomId, 'all'] })
      queryClient.invalidateQueries({ queryKey: ['lessons_done', roomId] })
      // 授業完了通知をLINEで送信（fire and forget）
      supabase.functions.invoke('line-lesson-done', {
        body: { room_id: roomId, lesson_id: lessonId },
      })
    },
  })

  // 授業記録保存（upsert）
  const { mutate: saveRecord, isPending: isSavingRecord } = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('lesson_records').upsert(
        { lesson_id: lessonId!, content: recordContent, updated_at: new Date().toISOString() },
        { onConflict: 'lesson_id' }
      )
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lesson_record', lessonId] })
      setRecordDirty(false)
    },
  })

  // ファイルアップロード
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !lessonId || !user) return
    setUploadingFile(true)
    try {
      const ext = file.name.split('.').pop()
      const filePath = `${lessonId}/${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage.from('lessons').upload(filePath, file)
      if (uploadError) throw uploadError
      const { error: dbError } = await supabase.from('lesson_files').insert({
        lesson_id: lessonId,
        uploader_id: user.id,
        file_type: file.type.startsWith('image/') ? 'material' : 'material',
        file_path: filePath,
        file_name: file.name,
      })
      if (dbError) throw dbError
      queryClient.invalidateQueries({ queryKey: ['lesson_files', lessonId] })
    } catch (err) {
      alert('アップロードに失敗しました')
    } finally {
      setUploadingFile(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // ファイル削除
  const { mutate: deleteFile } = useMutation({
    mutationFn: async ({ fileId, filePath }: { fileId: string; filePath: string }) => {
      await supabase.storage.from('lessons').remove([filePath])
      const { error } = await supabase.from('lesson_files').delete().eq('id', fileId)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['lesson_files', lessonId] }),
  })

  // ファイルダウンロードURL取得
  const getFileUrl = async (filePath: string) => {
    const { data } = await supabase.storage.from('lessons').createSignedUrl(filePath, 60)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  if (!lesson || !room) {
    return (
      <div className="min-h-svh flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[#2D6A4F] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const d = new Date(lesson.scheduled_at)
  const days = ['日', '月', '火', '水', '木', '金', '土']
  const startMin = d.getHours() * 60 + d.getMinutes()
  const endMin = startMin + lesson.duration_minutes
  const dateStr = `${d.getMonth() + 1}月${d.getDate()}日(${days[d.getDay()]})`
  const timeStr = `${minutesToTime(startMin)} 〜 ${minutesToTime(endMin)}`
  const learnerMember = lesson.learner_id ? members.find(m => m.learner_id === lesson.learner_id) : null

  const COLORS = ['#3B82F6','#CA8A04','#DB2777','#7C3AED','#EA580C']
  const learnerIdList = members.map(m => m.learner_id)
  const ci = lesson.learner_id ? learnerIdList.indexOf(lesson.learner_id) % COLORS.length : 0
  const learnerColor = learnerMember ? COLORS[ci < 0 ? 0 : ci] : '#2D6A4F'

  const isDone = lesson.status === 'done'

  return (
    <div className="min-h-svh bg-[#F7F9F7] pb-24">
      {/* ヘッダー */}
      <div className="bg-white px-4 pt-12 pb-4 flex items-center gap-3">
        <button onClick={() => navigate(`/room/${roomId}`)}>
          <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="#1B1B1B" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-[#1B1B1B]">授業詳細</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-5 space-y-5">

        {/* 授業情報カード */}
        <div className="bg-white rounded-2xl p-5 space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-lg font-bold text-[#1B1B1B]">{dateStr}</p>
              <p className="text-sm text-[#6B7280] mt-0.5">{timeStr}（{lesson.duration_minutes}分）</p>
            </div>
            <span className={`text-xs font-medium px-3 py-1 rounded-full ${
              isDone
                ? 'bg-[#F3F4F6] text-[#6B7280]'
                : 'bg-[#D8F3DC] text-[#2D6A4F]'
            }`}>
              {isDone ? '完了' : '予定'}
            </span>
          </div>
          {learnerMember && (
            <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: learnerColor }} />
              <span className="text-sm font-medium text-[#1B1B1B]">{learnerMember.display_name}</span>
            </div>
          )}
        </div>

        {/* 完了ボタン（講師・予定のみ） */}
        {isInstructor && !isDone && (
          <button
            onClick={() => confirm('この授業を完了にしますか？') && markDone()}
            disabled={isMarkingDone}
            className="w-full bg-[#2D6A4F] hover:bg-[#245c43] text-white font-bold py-3 rounded-2xl transition-colors disabled:opacity-50"
          >
            {isMarkingDone ? '更新中...' : '授業を完了にする'}
          </button>
        )}

        {/* 授業記録 */}
        <div className="bg-white rounded-2xl p-5 space-y-3">
          <h2 className="text-sm font-bold text-[#1B1B1B]">授業記録</h2>
          {isInstructor ? (
            <>
              <textarea
                value={recordContent}
                onChange={e => { setRecordContent(e.target.value); setRecordDirty(true) }}
                placeholder="授業内容・気づき・メモなど"
                rows={5}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#52B788] resize-none"
              />
              <button
                onClick={() => saveRecord()}
                disabled={!recordDirty || isSavingRecord}
                className="w-full bg-[#2D6A4F] hover:bg-[#245c43] text-white font-bold py-3 rounded-2xl transition-colors disabled:opacity-40"
              >
                {isSavingRecord ? '保存中...' : recordDirty ? '記録を保存する' : '保存済み'}
              </button>
            </>
          ) : (
            <p className="text-sm text-[#1B1B1B] whitespace-pre-wrap min-h-[60px]">
              {record?.content || <span className="text-[#9CA3AF]">まだ記録がありません</span>}
            </p>
          )}
        </div>

        {/* ファイル */}
        <div className="bg-white rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-[#1B1B1B]">ファイル・教材</h2>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingFile}
              className="text-xs text-[#52B788] font-medium px-3 py-1.5 rounded-lg bg-[#F0FDF4]"
            >
              {uploadingFile ? 'アップロード中...' : '＋ 追加'}
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
            <p className="text-sm text-[#9CA3AF] text-center py-3">ファイルはありません</p>
          ) : (
            <div className="space-y-2">
              {files.map(f => (
                <div key={f.id} className="flex items-center gap-3 p-3 bg-[#F7F9F7] rounded-xl">
                  {/* ファイルタイプアイコン */}
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
                    onClick={() => getFileUrl(f.file_path)}
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

        {/* この授業の宿題 */}
        {homeworkList.length > 0 && (
          <div className="bg-white rounded-2xl p-5 space-y-3">
            <h2 className="text-sm font-bold text-[#1B1B1B]">この授業の宿題</h2>
            <div className="space-y-2">
              {homeworkList.map(hw => (
                <div key={hw.id} className="p-3 bg-[#F7F9F7] rounded-xl">
                  <p className="text-sm font-medium text-[#1B1B1B]">{hw.title}</p>
                  {hw.description && (
                    <p className="text-xs text-[#6B7280] mt-0.5 line-clamp-2">{hw.description}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
      <BottomNav />
    </div>
  )
}
