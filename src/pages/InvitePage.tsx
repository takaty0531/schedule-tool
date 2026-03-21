import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { Invitation, Room } from '../types/database'

export default function InvitePage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const { session, profile, loading: authLoading } = useAuth()
  const [invitation, setInvitation] = useState<Invitation | null>(null)
  const [room, setRoom] = useState<Room | null>(null)
  const [status, setStatus] = useState<'loading' | 'valid' | 'invalid' | 'joining' | 'done'>('loading')

  useEffect(() => {
    const fetchInvitation = async () => {
      const { data, error } = await supabase
        .from('invitations')
        .select('*, rooms(*)')
        .eq('token', token!)
        .single()

      if (error || !data) { setStatus('invalid'); return }
      if (data.status === 'accepted') { setStatus('invalid'); return }
      if (new Date(data.expires_at) < new Date()) { setStatus('invalid'); return }

      setInvitation(data as Invitation)
      setRoom((data as any).rooms as Room)
      setStatus('valid')
    }
    fetchInvitation()
  }, [token])

  const handleJoin = async () => {
    if (!invitation || !session || !profile) return
    setStatus('joining')

    // room_membersに登録（生徒・保護者共通）
    if (invitation.role === 'learner') {
      const { error } = await supabase.from('room_members').insert({
        room_id: invitation.room_id,
        learner_id: session.user.id,
        display_name: invitation.display_name,
      })
      if (error && error.code !== '23505') { setStatus('valid'); return }
    }

    // 保護者の場合はguardian_learnerにも登録
    if (invitation.role === 'guardian' && invitation.learner_id) {
      const { error } = await supabase.from('guardian_learner').insert({
        guardian_id: session.user.id,
        learner_id: invitation.learner_id,
      })
      if (error && error.code !== '23505') { setStatus('valid'); return }
    }

    // 招待をacceptedに更新
    await supabase.from('invitations').update({ status: 'accepted' }).eq('id', invitation.id)

    setStatus('done')
    setTimeout(() => navigate(`/room/${invitation.room_id}`), 1500)
  }

  if (status === 'loading' || authLoading) {
    return (
      <div className="min-h-svh flex items-center justify-center bg-[#F7F9F7]">
        <div className="w-6 h-6 border-2 border-[#2D6A4F] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (status === 'invalid') {
    return (
      <div className="min-h-svh flex flex-col items-center justify-center bg-[#F7F9F7] px-6 text-center">
        <h2 className="text-xl font-bold text-[#1B1B1B]">招待リンクが無効です</h2>
        <p className="text-sm text-[#6B7280] mt-2">有効期限切れまたは使用済みです</p>
      </div>
    )
  }

  if (status === 'done') {
    return (
      <div className="min-h-svh flex flex-col items-center justify-center bg-[#F7F9F7] px-6 text-center">
        <h2 className="text-xl font-bold text-[#1B1B1B]">参加しました！</h2>
        <p className="text-sm text-[#6B7280] mt-2">ルームに移動します...</p>
      </div>
    )
  }

  return (
    <div className="min-h-svh flex flex-col items-center justify-center bg-[#F7F9F7] px-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-[#1B1B1B]">招待が届いています</h2>
        </div>

        <div className="bg-white rounded-2xl p-6 space-y-3">
          <div>
            <p className="text-xs text-[#6B7280]">ルーム</p>
            <p className="font-bold text-[#1B1B1B]">{room?.name}</p>
          </div>
          <div>
            <p className="text-xs text-[#6B7280]">あなたの名前</p>
            <p className="font-bold text-[#1B1B1B]">{invitation?.display_name}</p>
          </div>
          <div>
            <p className="text-xs text-[#6B7280]">役割</p>
            <p className="font-bold text-[#1B1B1B]">{invitation?.role === 'learner' ? '生徒' : '保護者'}</p>
          </div>
        </div>

        {!session ? (
          // 未ログインの場合はログイン/登録へ誘導
          <div className="space-y-3">
            <p className="text-sm text-[#6B7280] text-center">参加するにはログインが必要です</p>
            <button
              onClick={() => navigate(`/?redirect=/invite/${token}`)}
              className="w-full bg-[#2D6A4F] text-white font-bold py-3 rounded-2xl"
            >
              ログインして参加
            </button>
            <button
              onClick={() => navigate(`/register?redirect=/invite/${token}`)}
              className="w-full border border-[#2D6A4F] text-[#2D6A4F] font-bold py-3 rounded-2xl"
            >
              新規登録して参加
            </button>
          </div>
        ) : (
          <button
            onClick={handleJoin}
            disabled={status === 'joining'}
            className="w-full bg-[#2D6A4F] text-white font-bold py-3 rounded-2xl disabled:opacity-50"
          >
            {status === 'joining' ? '参加中...' : 'このルームに参加する'}
          </button>
        )}
      </div>
    </div>
  )
}
