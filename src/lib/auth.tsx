import { createContext, useContext, useEffect, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { getDeviceId } from './pwa'
import type { Profile } from '../types/database'

type AuthContextType = {
  session: Session | null
  user: User | null
  profile: Profile | null
  loading: boolean
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  loading: true,
  refreshProfile: async () => {},
})

/** DBに保存された待機セッションを取得してログイン（PWA←Safari橋渡し） */
async function claimPendingSession(): Promise<boolean> {
  const deviceId = getDeviceId()
  const { data } = await supabase
    .from('pending_pwa_sessions')
    .select('id, access_token, refresh_token')
    .eq('device_id', deviceId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!data) return false

  // セッションを設定
  const { error } = await supabase.auth.setSession({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
  })

  // 使用済みレコードを削除
  await supabase.from('pending_pwa_sessions').delete().eq('device_id', deviceId)

  return !error
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    setProfile(data)
  }

  const refreshProfile = async () => {
    if (session?.user) await fetchProfile(session.user.id)
  }

  useEffect(() => {
    const init = async () => {
      try {
        // ローカルに保存されたセッションを取得
        const { data: { session } } = await supabase.auth.getSession()

        if (session?.user) {
          // トークンが期限切れの場合はリフレッシュを試みる
          const { data: { user }, error } = await supabase.auth.getUser()
          if (error) {
            const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession()
            if (refreshError || !refreshed.session) {
              await supabase.auth.signOut()
              setLoading(false)
              return
            }
            setSession(refreshed.session)
            await fetchProfile(refreshed.session.user.id)
            setLoading(false)
            return
          }
          setSession(session)
          await fetchProfile(user!.id)
          setLoading(false)
          return
        }

        // ローカルセッションなし → Safari経由のLINEログインのセッションを確認
        const claimed = await claimPendingSession()
        if (claimed) {
          // onAuthStateChangeが発火してセッションが設定される
          // loadingはonAuthStateChangeのハンドラで解除
          return
        }
      } catch {
        // ネットワークエラー等 → ローカルセッションをそのまま使用
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user) {
          setSession(session)
          await fetchProfile(session.user.id)
        }
      }
      setLoading(false)
    }
    init()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session?.user) {
        fetchProfile(session.user.id).finally(() => setLoading(false))
      } else {
        setProfile(null)
        setLoading(false)
      }
    })

    // アプリがフォアグラウンドに戻った時にも待機セッションを確認
    const handleVisibility = async () => {
      if (document.visibilityState === 'visible') {
        const { data: { session: current } } = await supabase.auth.getSession()
        if (!current) {
          await claimPendingSession()
        }
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      subscription.unsubscribe()
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, profile, loading, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext)
