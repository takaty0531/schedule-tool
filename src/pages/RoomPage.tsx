import { useState, useRef } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import BottomNav from '../components/BottomNav'
import Avatar from '../components/Avatar'
import ScheduleTab from '../components/ScheduleTab'
import StudyPlanTab from '../components/StudyPlanTab'
import HomeworkTab from '../components/HomeworkTab'
import type { Room, RoomMember, Profile, Invitation, Lesson } from '../types/database'
import { minutesToTime, scheduledAtToSlot, getWeekKey } from '../lib/scheduleUtils'

type Tab = 'detail' | 'schedule' | 'study_plan' | 'homework' | 'notify'

const DEFAULT_LESSON_DONE_TEMPLATE = `📝 授業が完了しました！

{授業日時}

📚 宿題
{宿題}

📋 学習計画
{学習計画}

✏️ 授業記録
{授業記録}

📅 次回の授業
{次回授業}`

const DEFAULT_MORNING_TEMPLATE = `おはようございます！
本日 {授業時刻} から「{ルーム名}」の授業があります。

📚 宿題
{宿題}

📋 学習計画
{学習計画}`

const DEFAULT_PRE_LESSON_TEMPLATE = `⏰ {残り時間}分後に「{ルーム名}」の授業が始まります！

📅 {授業日時}`

const LESSON_DONE_VARS = [
  { label: '授業日時', value: '{授業日時}' },
  { label: '宿題', value: '{宿題}' },
  { label: '次回授業', value: '{次回授業}' },
  { label: '学習計画', value: '{学習計画}' },
  { label: '授業記録', value: '{授業記録}' },
]

const MORNING_VARS = [
  { label: 'ルーム名', value: '{ルーム名}' },
  { label: '授業時刻', value: '{授業時刻}' },
  { label: '宿題', value: '{宿題}' },
  { label: '学習計画', value: '{学習計画}' },
]

const PRE_LESSON_VARS = [
  { label: 'ルーム名', value: '{ルーム名}' },
  { label: '授業日時', value: '{授業日時}' },
  { label: '残り時間', value: '{残り時間}' },
]

// トークン生成
function generateToken() {
  return Math.random().toString(36).substring(2) + Date.now().toString(36)
}

// 招待モーダル
function InviteModal({ room, members, onClose }: { room: Room; members: (RoomMember & { profile: Profile })[]; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [role, setRole] = useState<'learner' | 'guardian'>('learner')
  const [displayName, setDisplayName] = useState('')
  const [linkedLearnerId, setLinkedLearnerId] = useState('')
  const [inviteUrl, setInviteUrl] = useState('')

  const { mutate, isPending } = useMutation({
    mutationFn: async () => {
      const token = generateToken()
      const expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7日後
      const { error } = await supabase.from('invitations').insert({
        room_id: room.id,
        display_name: displayName.trim(),
        role,
        learner_id: role === 'guardian' ? linkedLearnerId || null : null,
        token,
        expires_at,
      })
      if (error) throw error
      return token
    },
    onSuccess: (token) => {
      const url = `${window.location.origin}/schedule-tool/invite/${token}`
      setInviteUrl(url)
      queryClient.invalidateQueries({ queryKey: ['invitations', room.id] })
    },
  })

  const handleCopy = () => {
    navigator.clipboard.writeText(inviteUrl)
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50" onClick={onClose}>
      <div className="fixed bottom-6 left-4 right-4 max-w-lg mx-auto bg-white rounded-2xl p-6 space-y-5 overflow-y-auto" style={{ maxHeight: 'calc(100dvh - 5rem)' }} onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-[#1B1B1B]">招待リンクを作成</h2>

        {!inviteUrl ? (
          <>
            {/* ロール選択 */}
            <div className="flex gap-2">
              {(['learner', 'guardian'] as const).map(r => (
                <button
                  key={r}
                  onClick={() => setRole(r)}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-colors ${
                    role === r ? 'bg-[#2D6A4F] text-white border-[#2D6A4F]' : 'bg-white text-[#6B7280] border-gray-200'
                  }`}
                >
                  {r === 'learner' ? '生徒' : '保護者'}
                </button>
              ))}
            </div>

            {/* 表示名 */}
            <div>
              <label className="block text-sm font-medium text-[#1B1B1B] mb-1">
                {role === 'learner' ? '生徒の名前' : '保護者の名前'}
              </label>
              <input
                type="text"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#52B788]"
                placeholder="例: 田中 太郎"
                maxLength={20}
              />
            </div>

            {/* 保護者の場合: 紐づく生徒を選択 */}
            {role === 'guardian' && members.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-[#1B1B1B] mb-1">紐づく生徒</label>
                <select
                  value={linkedLearnerId}
                  onChange={e => setLinkedLearnerId(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#52B788]"
                >
                  <option value="">選択してください</option>
                  {members.map(m => (
                    <option key={m.learner_id} value={m.learner_id}>{m.display_name}</option>
                  ))}
                </select>
              </div>
            )}

            <button
              onClick={() => mutate()}
              disabled={!displayName.trim() || isPending}
              className="w-full bg-[#2D6A4F] hover:bg-[#245c43] text-white font-bold py-3 rounded-2xl transition-colors disabled:opacity-50"
            >
              {isPending ? '生成中...' : '招待リンクを生成'}
            </button>
            <button onClick={onClose} className="w-full text-sm text-[#6B7280] py-2">キャンセル</button>
          </>
        ) : (
          // 招待URL表示
          <div className="space-y-4">
            <p className="text-sm text-[#6B7280]">以下のリンクをLINEで共有してください（7日間有効）</p>
            <div className="bg-[#F7F9F7] rounded-xl p-3 text-xs text-[#1B1B1B] break-all">{inviteUrl}</div>
            <button
              onClick={handleCopy}
              className="w-full bg-[#2D6A4F] hover:bg-[#245c43] text-white font-bold py-3 rounded-2xl transition-colors"
            >
              リンクをコピー
            </button>
            <button
              onClick={() => setInviteUrl('')}
              className="w-full text-sm text-[#6B7280] py-2"
            >
              別の招待を作成
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function RoomPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const [showInvite, setShowInvite] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'member' | 'invitation'; id: string; name: string } | null>(null)
  const [cancelLessonConfirm, setCancelLessonConfirm] = useState<{ lesson: Lesson; label: string } | null>(null)
  const initialTab = (searchParams.get('tab') as Tab | null) ?? 'detail'
  const [activeTab, setActiveTab] = useState<Tab>(
    initialTab === 'notify' || initialTab === 'schedule' || initialTab === 'study_plan' || initialTab === 'homework'
      ? initialTab
      : 'detail'
  )

  // テンプレートエディター
  const lessonDoneRef = useRef<HTMLTextAreaElement>(null)
  const morningRef = useRef<HTMLTextAreaElement>(null)
  const preLessonRef = useRef<HTMLTextAreaElement>(null)
  const [lessonDoneText, setLessonDoneText] = useState<string | null>(null)
  const [morningText, setMorningText] = useState<string | null>(null)
  const [preLessonText, setPreLessonText] = useState<string | null>(null)
  const [templateSaved, setTemplateSaved] = useState(false)
  // 展開中の通知タイプ
  const [expandedNotif, setExpandedNotif] = useState<'lesson_done' | 'morning' | 'pre_lesson' | null>(null)

  // LINE連絡
  const [lineMessage, setLineMessage] = useState('')
  const [lineSending, setLineSending] = useState(false)
  const [lineSent, setLineSent] = useState('')
  const [selectedRecipients, setSelectedRecipients] = useState<Set<string>>(new Set())

  const handleLineSend = async () => {
    if (!lineMessage.trim() || !id || selectedRecipients.size === 0) return
    setLineSending(true)
    setLineSent('')
    const { data, error } = await supabase.functions.invoke('line-send', {
      body: { room_id: id, message: lineMessage.trim(), user_ids: [...selectedRecipients] },
    })
    setLineSending(false)
    if (error) {
      setLineSent('送信に失敗しました')
    } else {
      setLineSent(`${data?.sent ?? 0}名に送信しました`)
      setLineMessage('')
    }
  }

  // ルーム情報
  const { data: room } = useQuery({
    queryKey: ['room', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('rooms').select('*').eq('id', id!).single()
      if (error) throw error
      return data as Room
    },
  })

  // メンバー一覧
  const { data: members = [] } = useQuery({
    queryKey: ['members', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('room_members')
        .select('*, profile:profiles(*)')
        .eq('room_id', id!)
      if (error) throw error
      return data as (RoomMember & { profile: Profile })[]
    },
  })

  // LINE連携済みメンバー計算（members取得後に定義）
  const lineMembers = members.filter(m => m.profile?.line_user_id)
  const learnerIds = lineMembers.filter(m => m.profile?.role === 'learner').map(m => m.learner_id)
  const guardianIds = lineMembers.filter(m => m.profile?.role === 'guardian').map(m => m.learner_id)
  const allIds = lineMembers.map(m => m.learner_id)
  const selectAll = () => setSelectedRecipients(new Set(allIds))
  const selectLearners = () => setSelectedRecipients(new Set(learnerIds))
  const selectGuardians = () => setSelectedRecipients(new Set(guardianIds))
  const toggleRecipient = (uid: string) => setSelectedRecipients(prev => {
    const next = new Set(prev)
    if (next.has(uid)) next.delete(uid)
    else next.add(uid)
    return next
  })

  // 講師プロフィール
  const { data: instructorProfile } = useQuery({
    queryKey: ['instructor_profile', room?.instructor_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles').select('*').eq('id', room!.instructor_id).single()
      if (error) throw error
      return data as Profile
    },
    enabled: !!room?.instructor_id,
  })

  // 確定済み授業
  const { data: scheduledLessons = [] } = useQuery({
    queryKey: ['lessons_scheduled', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lessons').select('*').eq('room_id', id!).eq('status', 'scheduled')
        .order('scheduled_at')
      if (error) throw error
      return data as Lesson[]
    },
  })

  // 完了済み授業（累計時間）
  const { data: doneLessons = [] } = useQuery({
    queryKey: ['lessons_done', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lessons').select('*').eq('room_id', id!).eq('status', 'done')
      if (error) throw error
      return data as Lesson[]
    },
  })

  // 通知設定（講師のみ）
  const { data: notifSetting } = useQuery({
    queryKey: ['notification_settings', id],
    queryFn: async () => {
      const { data } = await supabase
        .from('notification_settings')
        .select('*')
        .eq('room_id', id!)
        .maybeSingle()
      return data as {
        id: string
        room_id: string
        morning_notify: boolean
        morning_time: string
        pre_lesson_notify: boolean
        pre_lesson_minutes: number
        lesson_done_template: string | null
        morning_template: string | null
        pre_lesson_template: string | null
      } | null
    },
    enabled: profile?.role === 'instructor',
  })

  const [notifForm, setNotifForm] = useState<{
    morning_notify: boolean
    morning_time: string
    pre_lesson_notify: boolean
    pre_lesson_minutes: number
  } | null>(null)

  // notifSetting が取れたら初期値をセット
  const resolvedNotif = notifForm ?? (notifSetting ? {
    morning_notify: notifSetting.morning_notify,
    morning_time: notifSetting.morning_time?.slice(0, 5) ?? '07:30',
    pre_lesson_notify: notifSetting.pre_lesson_notify,
    pre_lesson_minutes: notifSetting.pre_lesson_minutes,
  } : { morning_notify: true, morning_time: '07:30', pre_lesson_notify: true, pre_lesson_minutes: 30 })

  const { mutate: saveNotif, isPending: notifSaving } = useMutation({
    mutationFn: async () => {
      const payload = {
        ...resolvedNotif,
        room_id: id!,
        lesson_done_template: lessonDoneText ?? notifSetting?.lesson_done_template ?? DEFAULT_LESSON_DONE_TEMPLATE,
        morning_template: morningText ?? notifSetting?.morning_template ?? DEFAULT_MORNING_TEMPLATE,
        pre_lesson_template: preLessonText ?? notifSetting?.pre_lesson_template ?? DEFAULT_PRE_LESSON_TEMPLATE,
      }
      if (notifSetting?.id) {
        const { error } = await supabase.from('notification_settings').update(payload).eq('id', notifSetting.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('notification_settings').insert(payload)
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification_settings', id] })
      setTemplateSaved(true)
      setTimeout(() => setTemplateSaved(false), 2000)
    },
  })

  // 直近の宿題一覧（生徒・保護者向け）
  const { data: upcomingHomework = [] } = useQuery({
    queryKey: ['homework_room', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('homework').select('*').eq('room_id', id!).order('created_at', { ascending: false }).limit(5)
      if (error) throw error
      return data
    },
    enabled: profile?.role !== 'instructor' && !!id,
  })

  // LINE通知履歴（講師のみ）
  const { data: lineLogs = [] } = useQuery({
    queryKey: ['line_logs', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('line_logs')
        .select('*')
        .eq('room_id', id!)
        .order('created_at', { ascending: false })
        .limit(20)
      if (error) throw error
      return data
    },
    enabled: profile?.role === 'instructor' && !!id,
  })

  // 招待一覧（講師のみ）
  const { data: invitations = [] } = useQuery({
    queryKey: ['invitations', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invitations')
        .select('*')
        .eq('room_id', id!)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Invitation[]
    },
    enabled: profile?.role === 'instructor',
  })

  // 招待削除
  const deleteInvitationMutation = useMutation({
    mutationFn: async (invitationId: string) => {
      const { error } = await supabase.from('invitations').delete().eq('id', invitationId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invitations', id] })
      setDeleteConfirm(null)
    },
  })

  // メンバー削除
  const deleteMemberMutation = useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase.from('room_members').delete().eq('id', memberId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members', id] })
      setDeleteConfirm(null)
    },
  })

  const cancelLessonMutation = useMutation({
    mutationFn: async (lesson: Lesson) => {
      // 授業に対応するスロットを特定して削除
      const { dayIndex, slotStart } = scheduledAtToSlot(lesson.scheduled_at)
      const slotsPerLesson = room!.lesson_minutes / 30
      const d = new Date(lesson.scheduled_at)
      const monday = new Date(d)
      const day = monday.getDay()
      monday.setDate(monday.getDate() - (day === 0 ? 6 : day - 1))
      monday.setHours(0, 0, 0, 0)
      const weekKey = getWeekKey(monday)

      // 該当する30分スロットをすべて削除（全参加者分）
      const slotStarts = Array.from({ length: slotsPerLesson }, (_, i) => slotStart + i * 30)
      const { error: slotError } = await supabase
        .from('slots')
        .delete()
        .eq('room_id', lesson.room_id)
        .eq('week_key', weekKey)
        .eq('day_index', dayIndex)
        .in('slot_start', slotStarts)
      if (slotError) throw slotError

      // 授業を削除
      const { error } = await supabase.from('lessons').delete().eq('id', lesson.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lessons_scheduled', id] })
      queryClient.invalidateQueries({ queryKey: ['next_lessons_dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['slots', id] })
      queryClient.invalidateQueries({ queryKey: ['lessons', id, 'all'] })
    },
  })

  if (!room) return null

  const insertLessonDone = (variable: string) => {
    const el = lessonDoneRef.current
    if (!el) return
    const start = el.selectionStart ?? 0
    const end = el.selectionEnd ?? 0
    const base = lessonDoneText ?? notifSetting?.lesson_done_template ?? DEFAULT_LESSON_DONE_TEMPLATE
    const next = base.slice(0, start) + variable + base.slice(end)
    setLessonDoneText(next)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(start + variable.length, start + variable.length)
    })
  }
  const insertMorning = (variable: string) => {
    const el = morningRef.current
    if (!el) return
    const start = el.selectionStart ?? 0
    const end = el.selectionEnd ?? 0
    const base = morningText ?? notifSetting?.morning_template ?? DEFAULT_MORNING_TEMPLATE
    const next = base.slice(0, start) + variable + base.slice(end)
    setMorningText(next)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(start + variable.length, start + variable.length)
    })
  }
  const insertPreLesson = (variable: string) => {
    const el = preLessonRef.current
    if (!el) return
    const start = el.selectionStart ?? 0
    const end = el.selectionEnd ?? 0
    const base = preLessonText ?? notifSetting?.pre_lesson_template ?? DEFAULT_PRE_LESSON_TEMPLATE
    const next = base.slice(0, start) + variable + base.slice(end)
    setPreLessonText(next)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(start + variable.length, start + variable.length)
    })
  }

  return (
    <div className="min-h-svh bg-[#F7F9F7] pb-20">
      {/* ヘッダー */}
      <div className="bg-white px-4 pt-12 pb-0 flex items-center gap-3">
        <button onClick={() => navigate('/dashboard')}>
          <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="#1B1B1B" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-[#1B1B1B]">{room.name}</h1>
          <p className="text-xs text-[#6B7280]">授業時間: {room.lesson_minutes}分</p>
        </div>
      </div>

      {/* タブ */}
      <div className="bg-white border-b border-gray-200 flex overflow-x-auto">
        {((['detail', 'schedule', 'study_plan', 'homework'] as Tab[]).concat(
          profile?.role === 'instructor' ? ['notify' as Tab] : []
        )).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-shrink-0 px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
              activeTab === tab
                ? 'border-[#2D6A4F] text-[#2D6A4F]'
                : 'border-transparent text-[#6B7280]'
            }`}
          >
            {tab === 'detail' ? '詳細' : tab === 'schedule' ? 'スケジュール' : tab === 'study_plan' ? '学習計画' : tab === 'homework' ? '宿題' : '通知'}
          </button>
        ))}
      </div>

      {activeTab === 'schedule' && (
        <div className="max-w-lg mx-auto">
          <ScheduleTab room={room} members={members} />
        </div>
      )}
      {activeTab === 'study_plan' && (
        <div className="max-w-lg mx-auto">
          <StudyPlanTab room={room} />
        </div>
      )}
      {activeTab === 'homework' && (
        <div className="max-w-lg mx-auto">
          <HomeworkTab room={room} members={members} />
        </div>
      )}

      {/* 通知タブ（先生専用） */}
      {activeTab === 'notify' && profile?.role === 'instructor' && (
        <div className="max-w-lg mx-auto px-4 py-6 space-y-5 overflow-y-auto" style={{ maxHeight: 'calc(100svh - 140px)' }}>

          {/* 定期通知設定 */}
          <div className="bg-white rounded-2xl overflow-hidden">
            <div className="px-4 pt-4 pb-3 border-b border-gray-100">
              <h2 className="text-sm font-bold text-[#1B1B1B]">定期通知設定</h2>
            </div>

            {/* 朝の通知 */}
            <div className="border-b border-gray-100">
              <button
                onClick={() => setExpandedNotif(expandedNotif === 'morning' ? null : 'morning')}
                className="w-full flex items-center justify-between px-4 py-3.5"
              >
                <div className="flex items-center gap-3">
                  <span className="text-base">🌅</span>
                  <div className="text-left">
                    <p className="text-sm font-medium text-[#1B1B1B]">朝の通知</p>
                    <p className="text-[11px] text-[#9CA3AF]">授業当日の朝に送信</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div
                    onClick={e => { e.stopPropagation(); setNotifForm({ ...resolvedNotif, morning_notify: !resolvedNotif.morning_notify }) }}
                    className={`w-10 h-5 rounded-full transition-colors flex items-center ${resolvedNotif.morning_notify ? 'bg-[#2D6A4F]' : 'bg-gray-200'}`}
                  >
                    <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform mx-0.5 ${resolvedNotif.morning_notify ? 'translate-x-5' : 'translate-x-0'}`} />
                  </div>
                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#9CA3AF" strokeWidth={2} className={`transition-transform ${expandedNotif === 'morning' ? 'rotate-180' : ''}`}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>
              {expandedNotif === 'morning' && (
                <div className="px-4 pb-4 space-y-3">
                  {resolvedNotif.morning_notify && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[#6B7280]">通知時刻</span>
                      <input
                        type="time"
                        value={resolvedNotif.morning_time}
                        onChange={e => setNotifForm({ ...resolvedNotif, morning_time: e.target.value })}
                        className="border border-gray-200 rounded-lg px-2 py-1 text-sm outline-none focus:border-[#52B788]"
                      />
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-[#6B7280] mb-2">差し込み変数（タップで挿入）</p>
                    <div className="flex flex-wrap gap-1.5">
                      {MORNING_VARS.map(v => (
                        <button key={v.value} onClick={() => insertMorning(v.value)} className="text-xs px-2.5 py-1 rounded-full bg-[#D8F3DC] text-[#2D6A4F] font-medium hover:bg-[#b7e4c7] transition-colors">{v.label}</button>
                      ))}
                    </div>
                  </div>
                  <textarea
                    ref={morningRef}
                    value={morningText ?? notifSetting?.morning_template ?? DEFAULT_MORNING_TEMPLATE}
                    onChange={e => setMorningText(e.target.value)}
                    rows={8}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#52B788] resize-none font-mono"
                  />
                  <button onClick={() => setMorningText(DEFAULT_MORNING_TEMPLATE)} className="text-xs text-[#6B7280] underline">デフォルトに戻す</button>
                </div>
              )}
            </div>

            {/* 授業前通知 */}
            <div className="border-b border-gray-100">
              <button
                onClick={() => setExpandedNotif(expandedNotif === 'pre_lesson' ? null : 'pre_lesson')}
                className="w-full flex items-center justify-between px-4 py-3.5"
              >
                <div className="flex items-center gap-3">
                  <span className="text-base">⏰</span>
                  <div className="text-left">
                    <p className="text-sm font-medium text-[#1B1B1B]">授業前通知</p>
                    <p className="text-[11px] text-[#9CA3AF]">授業開始前に送信</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div
                    onClick={e => { e.stopPropagation(); setNotifForm({ ...resolvedNotif, pre_lesson_notify: !resolvedNotif.pre_lesson_notify }) }}
                    className={`w-10 h-5 rounded-full transition-colors flex items-center ${resolvedNotif.pre_lesson_notify ? 'bg-[#2D6A4F]' : 'bg-gray-200'}`}
                  >
                    <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform mx-0.5 ${resolvedNotif.pre_lesson_notify ? 'translate-x-5' : 'translate-x-0'}`} />
                  </div>
                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#9CA3AF" strokeWidth={2} className={`transition-transform ${expandedNotif === 'pre_lesson' ? 'rotate-180' : ''}`}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>
              {expandedNotif === 'pre_lesson' && (
                <div className="px-4 pb-4 space-y-3">
                  {resolvedNotif.pre_lesson_notify && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[#6B7280]">何分前</span>
                      <select
                        value={resolvedNotif.pre_lesson_minutes}
                        onChange={e => setNotifForm({ ...resolvedNotif, pre_lesson_minutes: Number(e.target.value) })}
                        className="border border-gray-200 rounded-lg px-2 py-1 text-sm outline-none focus:border-[#52B788]"
                      >
                        {[10, 15, 20, 30, 45, 60].map(m => (
                          <option key={m} value={m}>{m}分前</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-[#6B7280] mb-2">差し込み変数（タップで挿入）</p>
                    <div className="flex flex-wrap gap-1.5">
                      {PRE_LESSON_VARS.map(v => (
                        <button key={v.value} onClick={() => insertPreLesson(v.value)} className="text-xs px-2.5 py-1 rounded-full bg-[#D8F3DC] text-[#2D6A4F] font-medium hover:bg-[#b7e4c7] transition-colors">{v.label}</button>
                      ))}
                    </div>
                  </div>
                  <textarea
                    ref={preLessonRef}
                    value={preLessonText ?? notifSetting?.pre_lesson_template ?? DEFAULT_PRE_LESSON_TEMPLATE}
                    onChange={e => setPreLessonText(e.target.value)}
                    rows={5}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#52B788] resize-none font-mono"
                  />
                  <button onClick={() => setPreLessonText(DEFAULT_PRE_LESSON_TEMPLATE)} className="text-xs text-[#6B7280] underline">デフォルトに戻す</button>
                </div>
              )}
            </div>

            {/* 授業完了通知 */}
            <div>
              <button
                onClick={() => setExpandedNotif(expandedNotif === 'lesson_done' ? null : 'lesson_done')}
                className="w-full flex items-center justify-between px-4 py-3.5"
              >
                <div className="flex items-center gap-3">
                  <span className="text-base">📝</span>
                  <div className="text-left">
                    <p className="text-sm font-medium text-[#1B1B1B]">授業完了通知</p>
                    <p className="text-[11px] text-[#9CA3AF]">授業を「完了」にしたとき自動送信</p>
                  </div>
                </div>
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#9CA3AF" strokeWidth={2} className={`transition-transform ${expandedNotif === 'lesson_done' ? 'rotate-180' : ''}`}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {expandedNotif === 'lesson_done' && (
                <div className="px-4 pb-4 space-y-3">
                  <div>
                    <p className="text-xs text-[#6B7280] mb-2">差し込み変数（タップで挿入）</p>
                    <div className="flex flex-wrap gap-1.5">
                      {LESSON_DONE_VARS.map(v => (
                        <button key={v.value} onClick={() => insertLessonDone(v.value)} className="text-xs px-2.5 py-1 rounded-full bg-[#D8F3DC] text-[#2D6A4F] font-medium hover:bg-[#b7e4c7] transition-colors">{v.label}</button>
                      ))}
                    </div>
                  </div>
                  <textarea
                    ref={lessonDoneRef}
                    value={lessonDoneText ?? notifSetting?.lesson_done_template ?? DEFAULT_LESSON_DONE_TEMPLATE}
                    onChange={e => setLessonDoneText(e.target.value)}
                    rows={12}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#52B788] resize-none font-mono"
                  />
                  <button onClick={() => setLessonDoneText(DEFAULT_LESSON_DONE_TEMPLATE)} className="text-xs text-[#6B7280] underline">デフォルトに戻す</button>
                </div>
              )}
            </div>

            {/* 保存ボタン */}
            <div className="px-4 pb-4 pt-2">
              <button
                onClick={() => saveNotif()}
                disabled={notifSaving}
                className="w-full bg-[#2D6A4F] hover:bg-[#245c43] text-white text-sm font-bold py-2.5 rounded-xl transition-colors disabled:opacity-40"
              >
                {notifSaving ? '保存中...' : templateSaved ? '保存しました ✓' : '設定を保存'}
              </button>
            </div>
          </div>

          {/* LINE連絡 */}
          <div className="bg-white rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <svg width="18" height="18" viewBox="0 0 48 48" fill="#06C755"><path d="M24 4C12.95 4 4 11.86 4 21.5c0 6.37 4.1 11.96 10.3 15.18-.45 1.68-1.63 6.1-1.87 7.05-.3 1.17.43 1.16 1.01.84.47-.27 7.43-4.91 10.44-6.9.69.1 1.4.15 2.12.15 11.05 0 20-7.86 20-17.5S35.05 4 24 4z"/></svg>
              <h2 className="text-sm font-bold text-[#1B1B1B]">LINE連絡</h2>
            </div>

            {/* クイック選択 */}
            <div className="flex gap-2 flex-wrap">
              {[
                { label: '全員', action: selectAll, count: allIds.length },
                { label: '生徒全員', action: selectLearners, count: learnerIds.length },
                { label: '保護者全員', action: selectGuardians, count: guardianIds.length },
              ].map(({ label, action, count }) => (
                <button
                  key={label}
                  onClick={action}
                  disabled={count === 0}
                  className="text-xs px-3 py-1.5 rounded-full border border-[#52B788] text-[#2D6A4F] font-medium disabled:opacity-30 disabled:border-gray-200 disabled:text-gray-400 hover:bg-[#D8F3DC] transition-colors"
                >
                  {label}（{count}名）
                </button>
              ))}
              <button
                onClick={() => setSelectedRecipients(new Set())}
                className="text-xs px-3 py-1.5 rounded-full border border-gray-200 text-[#6B7280] hover:bg-gray-50 transition-colors"
              >
                クリア
              </button>
            </div>

            {/* メンバーリスト */}
            <div className="space-y-1.5">
              {members.map(m => {
                const hasLine = !!m.profile?.line_user_id
                const isSelected = selectedRecipients.has(m.learner_id)
                const roleLabel = m.profile?.role === 'guardian' ? '保護者' : '生徒'
                return (
                  <button
                    key={m.learner_id}
                    onClick={() => hasLine && toggleRecipient(m.learner_id)}
                    disabled={!hasLine}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors text-left ${
                      !hasLine ? 'opacity-40 cursor-not-allowed border-gray-100 bg-gray-50' :
                      isSelected ? 'border-[#2D6A4F] bg-[#D8F3DC]' : 'border-gray-200 bg-white hover:bg-gray-50'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${
                      isSelected ? 'bg-[#2D6A4F] border-[#2D6A4F]' : 'border-gray-300'
                    }`}>
                      {isSelected && (
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="white" strokeWidth={2}>
                          <path d="M2 5l2.5 2.5L8 3" />
                        </svg>
                      )}
                    </div>
                    <span className="text-sm font-medium text-[#1B1B1B] flex-1">{m.display_name}</span>
                    <span className="text-xs text-[#6B7280]">{roleLabel}</span>
                    {hasLine ? (
                      <span className="text-[10px] text-[#06C755] font-medium">LINE済</span>
                    ) : (
                      <span className="text-[10px] text-[#9CA3AF]">未連携</span>
                    )}
                  </button>
                )
              })}
              {members.length === 0 && (
                <p className="text-xs text-[#9CA3AF] text-center py-2">まだメンバーがいません</p>
              )}
            </div>

            <textarea
              value={lineMessage}
              onChange={e => { setLineMessage(e.target.value); setLineSent('') }}
              rows={3}
              maxLength={500}
              placeholder="メッセージを入力..."
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#52B788] resize-none"
            />
            {lineSent && (
              <p className={`text-xs ${lineSent.includes('失敗') ? 'text-red-500' : 'text-[#2D6A4F]'}`}>{lineSent}</p>
            )}
            <button
              onClick={handleLineSend}
              disabled={lineSending || !lineMessage.trim() || selectedRecipients.size === 0}
              className="w-full bg-[#06C755] hover:bg-[#05b34c] text-white text-sm font-bold py-2.5 rounded-xl transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {lineSending ? '送信中...' : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                  {selectedRecipients.size > 0 ? `${selectedRecipients.size}名にLINEで送信` : 'LINEで送信'}
                </>
              )}
            </button>
          </div>

          {/* LINE送信履歴 */}
          {lineLogs.length > 0 && (
            <div className="bg-white rounded-2xl p-4 space-y-3">
              <h2 className="text-sm font-bold text-[#1B1B1B]">LINE送信履歴</h2>
              <div className="space-y-2">
                {lineLogs.map((log: { id: string; type: string; created_at: string; sent_count: number; message: string }) => {
                  const d = new Date(log.created_at)
                  const typeLabel = log.type === 'lesson_done' ? '授業完了通知' : '手動送信'
                  const typeColor = log.type === 'lesson_done' ? 'text-[#2D6A4F] bg-[#D8F3DC]' : 'text-[#6B7280] bg-gray-100'
                  return (
                    <div key={log.id} className="border border-gray-100 rounded-xl p-3 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${typeColor}`}>{typeLabel}</span>
                        <span className="text-[10px] text-[#9CA3AF]">
                          {d.getMonth()+1}/{d.getDate()} {d.getHours()}:{String(d.getMinutes()).padStart(2,'0')} · {log.sent_count}名
                        </span>
                      </div>
                      <p className="text-xs text-[#6B7280] line-clamp-2">{log.message}</p>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

        </div>
      )}

      {activeTab === 'detail' && (() => {
        const COLORS = ['#3B82F6','#CA8A04','#DB2777','#7C3AED','#EA580C']
        const learnerIdList = members.map(m => m.learner_id)
        const totalDoneMin = doneLessons.reduce((acc, l) => acc + l.duration_minutes, 0)
        const totalDoneLabel = totalDoneMin >= 60
          ? `${Math.floor(totalDoneMin / 60)}時間${totalDoneMin % 60 > 0 ? `${totalDoneMin % 60}分` : ''}`
          : `${totalDoneMin}分`
        const days = ['日','月','火','水','木','金','土']
        const nextLesson = scheduledLessons[0] ?? null

        // 生徒・保護者ビュー
        if (profile?.role !== 'instructor') {
          return (
            <div className="max-w-lg mx-auto px-4 py-6 space-y-5 overflow-y-auto" style={{ maxHeight: 'calc(100svh - 200px)' }}>
              {/* 先生ボックス */}
              {instructorProfile && (
                <div className="bg-white rounded-2xl p-4 flex items-center gap-3">
                  <Avatar avatarUrl={instructorProfile.avatar_url} displayName={instructorProfile.display_name} size={40} />
                  <div className="flex-1">
                    <p className="font-bold text-[#1B1B1B]">{instructorProfile.display_name}</p>
                    <p className="text-xs text-[#6B7280]">先生</p>
                  </div>
                  <span className="w-3 h-3 rounded-full bg-[#2D6A4F]" />
                </div>
              )}

              {/* 次回の授業カード */}
              {nextLesson && (() => {
                const d = new Date(nextLesson.scheduled_at)
                const endMin = d.getHours() * 60 + d.getMinutes() + nextLesson.duration_minutes
                const learnerMember = nextLesson.learner_id ? members.find(m => m.learner_id === nextLesson.learner_id) : null
                return (
                  <div className="bg-[#2D6A4F] rounded-2xl p-4 text-white">
                    <p className="text-xs opacity-70 mb-1">次回の授業</p>
                    <p className="font-bold text-base">
                      {d.getMonth() + 1}月{d.getDate()}日({days[d.getDay()]})
                    </p>
                    <p className="text-sm opacity-90 mt-0.5">
                      {minutesToTime(d.getHours() * 60 + d.getMinutes())} 〜 {minutesToTime(endMin)}（{nextLesson.duration_minutes}分）
                    </p>
                    {learnerMember && (
                      <p className="text-xs mt-1 opacity-80">{learnerMember.display_name}</p>
                    )}
                  </div>
                )
              })()}

              {/* 宿題セクション */}
              <div className="bg-white rounded-2xl p-4 space-y-3">
                <h2 className="text-sm font-bold text-[#1B1B1B]">宿題</h2>
                {upcomingHomework.length === 0 ? (
                  <p className="text-sm text-[#6B7280] text-center py-2">宿題はありません</p>
                ) : (
                  <div className="space-y-2">
                    {upcomingHomework.map((hw: { id: string; title: string }) => (
                      <div key={hw.id} className="flex items-start gap-2 py-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#52B788] shrink-0 mt-1.5" />
                        <span className="text-sm text-[#1B1B1B]">{hw.title}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        }

        return (
        <div className="max-w-lg mx-auto px-4 py-6 space-y-5 overflow-y-auto" style={{ maxHeight: 'calc(100svh - 200px)' }}>

          {/* ルーム情報カード */}
          <div className="bg-white rounded-2xl p-4 space-y-1">
            <p className="text-xs text-[#6B7280]">ルーム名</p>
            <p className="font-bold text-[#1B1B1B] text-base">{room.name}</p>
            <p className="text-xs text-[#6B7280]">授業時間: {room.lesson_minutes}分</p>
            {room.description && (
              <p className="text-sm text-[#1B1B1B] whitespace-pre-wrap pt-1">{room.description}</p>
            )}
          </div>

          {/* 先生ボックス */}
          {instructorProfile && (
            <div className="bg-white rounded-2xl p-4 flex items-center gap-3">
              <Avatar avatarUrl={instructorProfile.avatar_url} displayName={instructorProfile.display_name} size={40} />
              <div className="flex-1">
                <p className="font-bold text-[#1B1B1B]">{instructorProfile.display_name}</p>
                <p className="text-xs text-[#6B7280]">先生</p>
              </div>
              <span className="w-3 h-3 rounded-full bg-[#2D6A4F]" />
            </div>
          )}

          {/* 統計カード */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-white rounded-2xl p-3 text-center">
              <p className="text-xl font-bold text-[#2D6A4F]">{members.length}</p>
              <p className="text-[10px] text-[#6B7280] mt-0.5">生徒数</p>
            </div>
            <div className="bg-white rounded-2xl p-3 text-center">
              <p className="text-xl font-bold text-[#2D6A4F]">{scheduledLessons.length}</p>
              <p className="text-[10px] text-[#6B7280] mt-0.5">予定授業</p>
            </div>
            <div className="bg-white rounded-2xl p-3 text-center">
              <p className="text-xl font-bold text-[#2D6A4F]">{totalDoneMin > 0 ? totalDoneLabel : '—'}</p>
              <p className="text-[10px] text-[#6B7280] mt-0.5">累計時間</p>
            </div>
          </div>

          <button
            onClick={() => navigate(`/room/${id}/records`)}
            className="w-full bg-white rounded-2xl p-4 flex items-center justify-between text-left"
          >
            <div>
              <p className="text-sm font-bold text-[#1B1B1B]">授業記録一覧</p>
              <p className="text-xs text-[#6B7280]">これまでの授業履歴を確認</p>
            </div>
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#9CA3AF" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>

          {/* 次回の授業 */}
          {nextLesson && (() => {
            const d = new Date(nextLesson.scheduled_at)
            const endMin = d.getHours() * 60 + d.getMinutes() + nextLesson.duration_minutes
            const learnerMember = nextLesson.learner_id ? members.find(m => m.learner_id === nextLesson.learner_id) : null
            return (
              <div className="bg-[#2D6A4F] rounded-2xl p-4 text-white">
                <p className="text-xs opacity-70 mb-1">次回の授業</p>
                <p className="font-bold text-base">
                  {d.getMonth() + 1}月{d.getDate()}日({days[d.getDay()]})
                </p>
                <p className="text-sm opacity-90 mt-0.5">
                  {minutesToTime(d.getHours() * 60 + d.getMinutes())} 〜 {minutesToTime(endMin)}（{nextLesson.duration_minutes}分）
                </p>
                {learnerMember && (
                  <p className="text-xs mt-1 opacity-80">{learnerMember.display_name}</p>
                )}
              </div>
            )
          })()}

          {/* 確定済み授業一覧 */}
          <div>
            <h2 className="text-sm font-bold text-[#6B7280] mb-3">
              授業予定 ({scheduledLessons.length})
            </h2>
            {scheduledLessons.length === 0 ? (
              <p className="text-sm text-[#6B7280] text-center py-4">授業予定はありません</p>
            ) : (
              <div className="space-y-2">
                {scheduledLessons.map(l => {
                  const d = new Date(l.scheduled_at)
                  const endMin = d.getHours() * 60 + d.getMinutes() + l.duration_minutes
                  const learnerMember = l.learner_id ? members.find(m => m.learner_id === l.learner_id) : null
                  const ci = l.learner_id ? learnerIdList.indexOf(l.learner_id) % COLORS.length : 0
                  const dotColor = learnerMember ? COLORS[ci < 0 ? 0 : ci] : '#2D6A4F'
                  const label = `${d.getMonth() + 1}月${d.getDate()}日(${days[d.getDay()]}) ${minutesToTime(d.getHours() * 60 + d.getMinutes())} 〜 ${minutesToTime(endMin)}`
                  return (
                    <div key={l.id} className="bg-white rounded-2xl p-4 flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ background: dotColor }} />
                      <button
                        onClick={() => navigate(`/room/${id}/lesson/${l.id}`)}
                        className="flex-1 text-left active:opacity-70 transition-opacity"
                      >
                        <p className="text-sm font-medium text-[#1B1B1B]">
                          {d.getMonth() + 1}月{d.getDate()}日({days[d.getDay()]})
                        </p>
                        <p className="text-xs text-[#6B7280]">
                          {minutesToTime(d.getHours() * 60 + d.getMinutes())} 〜 {minutesToTime(endMin)}
                        </p>
                        {learnerMember && (
                          <p className="text-xs font-medium mt-0.5" style={{ color: dotColor }}>{learnerMember.display_name}</p>
                        )}
                      </button>
                      {profile?.role === 'instructor' && (
                        <button
                          onClick={() => setCancelLessonConfirm({ lesson: l, label })}
                          className="shrink-0 p-1.5 rounded-lg text-[#EF4444] hover:bg-red-50 active:opacity-70 transition"
                          title="授業をキャンセル"
                        >
                          <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                      <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#D1D5DB" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* メンバー一覧 */}
          <div>
            <h2 className="text-sm font-bold text-[#6B7280] mb-3">メンバー ({members.length})</h2>
            {members.length === 0 ? (
              <p className="text-sm text-[#6B7280] text-center py-4">まだメンバーがいません</p>
            ) : (
              <div className="space-y-2">
                {members.map((m, i) => {
                  const ci = i % COLORS.length
                  return (
                    <div key={m.id} className="bg-white rounded-2xl p-4 flex items-center gap-3">
                      <Avatar avatarUrl={m.profile.avatar_url} displayName={m.display_name} size={40} />
                      <div className="flex-1">
                        <p className="font-medium text-[#1B1B1B]">{m.display_name}</p>
                        <p className="text-xs text-[#6B7280]">{m.profile?.role === 'guardian' ? '保護者' : '生徒'}</p>
                      </div>
                      <span className="w-3 h-3 rounded-full" style={{ background: COLORS[ci] }} />
                      {profile?.role === 'instructor' && (
                        <button
                          onClick={() => setDeleteConfirm({ type: 'member', id: m.id, name: m.display_name })}
                          className="ml-1 p-1.5 rounded-full text-[#9CA3AF] hover:text-red-500 hover:bg-red-50 transition-colors"
                          aria-label="メンバーを削除"
                        >
                          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* 招待中（未承認）一覧 */}
          {profile?.role === 'instructor' && invitations.length > 0 && (
            <div>
              <h2 className="text-sm font-bold text-[#6B7280] mb-3">招待中 ({invitations.length})</h2>
              <div className="space-y-2">
                {invitations.map(inv => (
                  <div key={inv.id} className="bg-white rounded-2xl p-4 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-[#1B1B1B]">{inv.display_name}</p>
                      <p className="text-xs text-[#6B7280]">{inv.role === 'learner' ? '生徒' : '保護者'} • 招待中</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs bg-[#D8F3DC] text-[#2D6A4F] px-2 py-1 rounded-full">pending</span>
                      <button
                        onClick={() => setDeleteConfirm({ type: 'invitation', id: inv.id, name: inv.display_name })}
                        className="p-1.5 rounded-full text-[#9CA3AF] hover:text-red-500 hover:bg-red-50 transition-colors"
                        aria-label="招待を削除"
                      >
                        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 先生専用セクション */}
          {profile?.role === 'instructor' && (
            <>
              {/* 招待ボタン */}
              <button
                onClick={() => setShowInvite(true)}
                className="w-full border-2 border-dashed border-[#52B788] text-[#2D6A4F] font-bold py-3 rounded-2xl flex items-center justify-center gap-2"
              >
                <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                生徒・保護者を招待
              </button>
            </>
          )}

        </div>
        )
      })()}

      {showInvite && room && (
        <InviteModal room={room} members={members} onClose={() => setShowInvite(false)} />
      )}

      {/* 削除確認ダイアログ */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-4" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm space-y-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-base font-bold text-[#1B1B1B]">
              {deleteConfirm.type === 'member' ? 'メンバーを削除' : '招待を削除'}
            </h2>
            <p className="text-sm text-[#6B7280]">
              「{deleteConfirm.name}」を{deleteConfirm.type === 'member' ? 'このルームから削除' : 'の招待をキャンセル'}しますか？この操作は取り消せません。
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-[#6B7280]"
              >
                キャンセル
              </button>
              <button
                onClick={() => {
                  if (deleteConfirm.type === 'member') {
                    deleteMemberMutation.mutate(deleteConfirm.id)
                  } else {
                    deleteInvitationMutation.mutate(deleteConfirm.id)
                  }
                }}
                disabled={deleteMemberMutation.isPending || deleteInvitationMutation.isPending}
                className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-bold transition-colors disabled:opacity-50"
              >
                削除する
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 授業キャンセル確認ダイアログ */}
      {cancelLessonConfirm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-4" onClick={() => setCancelLessonConfirm(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm space-y-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-base font-bold text-[#1B1B1B]">授業をキャンセル</h2>
            <p className="text-sm text-[#6B7280]">
              以下の授業をキャンセルしますか？<br />
              <span className="font-medium text-[#1B1B1B]">{cancelLessonConfirm.label}</span>
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setCancelLessonConfirm(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-[#6B7280]"
              >
                戻る
              </button>
              <button
                onClick={() => {
                  cancelLessonMutation.mutate(cancelLessonConfirm.lesson, {
                    onSuccess: () => setCancelLessonConfirm(null),
                  })
                }}
                disabled={cancelLessonMutation.isPending}
                className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-bold transition-colors disabled:opacity-50"
              >
                キャンセルする
              </button>
            </div>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  )
}
