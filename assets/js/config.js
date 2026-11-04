/* ==========================================================================
   Site configuration. Fill these two values in from Supabase:
     supabaseUrl      the Project URL, https://<project-ref>.supabase.co
                      (the Connect button at the top of the dashboard, or
                      Project Settings > Data API)
     supabaseAnonKey  the PUBLISHABLE key (starts sb_publishable_), from
                      Project Settings > API Keys. A legacy "anon" key (eyJ...)
                      also works.
   The publishable key is designed to be public: what it can do is limited by
   the row level security rules in supabase/schema.sql. NEVER put a secret key
   (sb_secret_...) or the service_role key here.
   ========================================================================== */
window.YNEPF_CONFIG = {
  supabaseUrl: "https://altuwgzzouwhrsdnzadj.supabase.co",      // e.g. "https://abcdxyzcompany.supabase.co"
  supabaseAnonKey: "sb_publishable_9W2shyj2oqx-J-EK1Ka_rQ_Qu8G2gRl",  // e.g. "eyJhbGciOi..."

  // Which "Continue with..." buttons the editor sign-in shows. Only list a
  // provider once it is switched on in Supabase (Authentication > Providers),
  // otherwise its button will fail. Options: "google", "apple".
  authProviders: ["google"]
};
