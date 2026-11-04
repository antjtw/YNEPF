/* ==========================================================================
   Site configuration. Fill these two values in from Supabase:
   Project Settings > API > Project URL, and the "anon / public" key.
   The anon key is designed to be public: what it can do is limited by the
   row level security rules in supabase/schema.sql. NEVER put the
   service_role key here.
   ========================================================================== */
window.YNEPF_CONFIG = {
  supabaseUrl: "",      // e.g. "https://abcdxyzcompany.supabase.co"
  supabaseAnonKey: "",  // e.g. "eyJhbGciOi..."

  // Which "Continue with..." buttons the editor sign-in shows. Only list a
  // provider once it is switched on in Supabase (Authentication > Providers),
  // otherwise its button will fail. Options: "google", "apple".
  authProviders: ["google"]
};
