import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

function createSupabaseClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    // Return a mock client during build/SSR when env vars aren't set
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
    } as any
  }
  return createClient(supabaseUrl, supabaseAnonKey, {
    realtime: { params: { eventsPerSecond: 10 } },
  })
}

export const supabase = createSupabaseClient()

// Realtime subscription helper
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
