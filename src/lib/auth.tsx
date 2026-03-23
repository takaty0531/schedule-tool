import { createContext, useContext, useEffect, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from './supabase'
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
            // リフレッシュトークンでセッション復元を試行
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
      if (session?.user) fetchProfile(session.user.id)
      else setProfile(null)
    })

    return () => subscription.unsubscribe()
  }, [])

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, profile, loading, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext)
