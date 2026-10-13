/* ==========================================================================
   FUTA onboarding config — the ONLY file you edit to change URLs / switches.
   Cline: if you need a new setting, add it here and read it as FUTA_CONFIG.<name>.
   ========================================================================== */
window.FUTA_CONFIG = {
  // true  = everything runs in the browser (fake accounts in localStorage) so you can preview the whole flow.
  // false = real Supabase (accounts, database, realtime). Fill the two values below first. See docs/SUPABASE.md.
  demo: false,
  supabaseUrl: 'https://futalife.vercel.app/',        // e.g. https://abcdxyz.supabase.co   (Project Settings > API)
  supabaseAnonKey: 'sb_publishable_WpmW5IjKBeNaq-QhX5CGzQ_9qjbgo_p',    // the PUBLIC "anon" / publishable key. NEVER put the service_role key in this repo.
  // Google sign-in is switched on inside Supabase (Authentication > Providers > Google), not here.
  // where to send the player after the character is saved
  afterUrl: '/world/',
  // age rules (see docs/SIGNUP_AND_CHARACTER.md): below minAge = blocked, below adultAge = "teen mode"
  minAge: 13, adultAge: 18,
  brand: { name: 'FUTA World', tagline: 'Your campus. Your Lagos life.' },
  // quality: 'auto' picks LOD by device. Force 0 (best) / 1 / 2 only for testing.
  previewLod: 'auto'
};
