import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY — copy .env.example to .env and fill in your project values.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// A second, isolated client used only when an admin creates a new user account.
// persistSession/autoRefreshToken are off so this never touches or overwrites
// the admin's own logged-in session in the browser.
export const supabaseCreateUserClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})
