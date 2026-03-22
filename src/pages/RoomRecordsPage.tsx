import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import BottomNav from '../components/BottomNav'
import type { Lesson, Room, RoomMember, Profile } from '../types/database'
import { minutesToTime } from '../lib/scheduleUtils'

export default function RoomRecordsPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data: room } = useQuery({
    queryKey: ['room', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('rooms').select('*').eq('id', id!).single()
      if (error) throw error
      return data as Room
    },
    enabled: !!id,
  })

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
    enabled: !!id,
  })

  const { data: lessons = [], isLoading } = useQuery({
    queryKey: ['lessons_all', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lessons')
        .select('*')
        .eq('room_id', id!)
        .order('scheduled_at', { ascending: false })
      if (error) throw error
      return data as Lesson[]
    },
    enabled: !!id,
  })

  const learnersMap = useMemo(
    () => new Map(members.map((m) => [m.learner_id, m.display_name])),
    [members]
  )

  return (
    <div className="min-h-svh bg-[#F7F9F7] pb-24">
      <div className="bg-white px-4 pt-12 pb-4 flex items-center gap-3">
        <button onClick={() => navigate(`/room/${id}`)}>
          <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="#1B1B1B" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h1 className="text-lg font-bold text-[#1B1B1B]">授業記録一覧</h1>
          <p className="text-xs text-[#6B7280]">{room?.name ?? 'ルーム'}</p>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-5 space-y-3">
        {isLoading ? (
          <div className="text-center py-16 text-[#6B7280]">
            <div className="w-6 h-6 border-2 border-[#2D6A4F] border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        ) : lessons.length === 0 ? (
          <p className="text-sm text-[#6B7280] text-center py-12">授業はまだありません</p>
        ) : (
          lessons.map((lesson) => {
            const d = new Date(lesson.scheduled_at)
            const days = ['日', '月', '火', '水', '木', '金', '土']
            const startMin = d.getHours() * 60 + d.getMinutes()
            const endMin = startMin + lesson.duration_minutes
            const learnerName = lesson.learner_id ? learnersMap.get(lesson.learner_id) : null
            return (
              <button
                key={lesson.id}
                onClick={() => navigate(`/room/${id}/lesson/${lesson.id}`)}
                className="w-full bg-white rounded-2xl p-4 text-left space-y-1"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-[#1B1B1B]">
                    {d.getMonth() + 1}月{d.getDate()}日({days[d.getDay()]})
                  </p>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                      lesson.status === 'done'
                        ? 'bg-[#F3F4F6] text-[#6B7280]'
                        : lesson.status === 'scheduled'
                          ? 'bg-[#D8F3DC] text-[#2D6A4F]'
                          : 'bg-red-50 text-red-500'
                    }`}
                  >
                    {lesson.status === 'done' ? '完了' : lesson.status === 'scheduled' ? '予定' : 'キャンセル'}
                  </span>
                </div>
                <p className="text-xs text-[#6B7280]">
                  {minutesToTime(startMin)} 〜 {minutesToTime(endMin)}（{lesson.duration_minutes}分）
                </p>
                {learnerName && <p className="text-xs text-[#52B788]">{learnerName}</p>}
              </button>
            )
          })
        )}
      </div>
      <BottomNav />
    </div>
  )
}
