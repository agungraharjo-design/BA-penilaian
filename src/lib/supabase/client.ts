import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY')
    // Return minimal mock to prevent crash
    return {
      auth: {
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
        signInWithOAuth: async () => ({ error: new Error('Supabase not configured') }),
        signInWithPassword: async () => ({ error: new Error('Supabase not configured') }),
        signOut: async () => {},
        getSession: async () => ({ data: { session: null } }),
      },
      from: () => ({
        select: () => Promise.resolve({ data: null, error: null }),
        insert: () => Promise.resolve({ data: null, error: null }),
        upsert: () => Promise.resolve({ data: null, error: null }),
        update: () => Promise.resolve({ data: null, error: null }),
        eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }),
        order: () => Promise.resolve({ data: null, error: null }),
        on: () => ({ subscribe: () => {} }),
      }),
    } as any
  }
  return createBrowserClient(url, anonKey)
}
