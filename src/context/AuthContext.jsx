import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)
export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!supabase) { setLoading(false); return undefined }
    let active = true
    supabase.auth.getSession().then(({ data }) => { if (active) { setSession(data.session); if (data.session) { loadProfile(data.session.user.id) } else { setLoading(false) } } })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => { setSession(nextSession); if (nextSession) loadProfile(nextSession.user.id); else { setProfile(null); setLoading(false) } })
    return () => { active = false; listener.subscription.unsubscribe() }
  }, [])
  async function loadProfile(userId) { if (!supabase) return; const { data, error: profileError } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle(); if (profileError) setError(profileError.message); else { setError(''); setProfile(data) } setLoading(false) }
  async function signOut() { if (supabase) await supabase.auth.signOut() }
  const value = useMemo(() => ({ session, user: session?.user || null, profile, loading, error, signOut, refreshProfile: () => session && loadProfile(session.user.id) }), [session, profile, loading, error])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
export const useAuth = () => useContext(AuthContext)
