import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

function createSupabaseClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    return {
      from: () => ({
        select: () => Promise.resolve({ data: null, error: null }),
        insert: () => Promise.resolve({ data: null, error: null }),
        upsert: () => Promise.resolve({ data: null, error: null }),
        eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }),
        order: () => Promise.resolve({ data: null, error: null }),
      }),
      channel: () => ({
        on: () => ({ subscribe: () => ({ unsubscribe: () => {} }) }),
        subscribe: () => ({ unsubscribe: () => {} }),
      }),
      removeChannel: () => {},
      storage: {
        from: () => ({
          upload: () => Promise.resolve({ data: null, error: new Error('mock') }),
          getPublicUrl: () => ({ data: { publicUrl: '' } }),
        }),
      },
    } as any
  }
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
    realtime: { params: { eventsPerSecond: 10 } },
  })
}

const globalForSupabase = globalThis as unknown as { __supabase?: ReturnType<typeof createSupabaseClient> }
export const supabase = globalForSupabase.__supabase ?? createSupabaseClient()
if (typeof window !== 'undefined') globalForSupabase.__supabase = supabase

export function subscribeToSession(
  sessionId: string,
  onUpdate: (payload: any) => void
) {
  return supabase
    .channel(`session:${sessionId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'sessions',
        filter: `id=eq.${sessionId}`,
      },
      (payload: any) => {
        onUpdate(payload.new)
      }
    )
    .subscribe()
}
