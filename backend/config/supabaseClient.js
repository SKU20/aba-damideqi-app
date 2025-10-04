const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Set JWT expiry to 3 weeks (like Messenger)
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    // Custom session configuration
    storage: undefined, // Use default storage
    storageKey: 'sb-auth-token',
    flowType: 'pkce'
  }
});

module.exports = supabaseClient;
