/* ==========================================================================
   FUTA onboarding config — the ONLY file you edit to change URLs / switches.
   Cline: if you need a new setting, add it here and read it as FUTA_CONFIG.<name>.
   ========================================================================== */
window.FUTA_CONFIG = {
  // true  = everything runs in the browser (fake accounts in localStorage) so you can preview the whole flow.
  // false = real Supabase (accounts, database, realtime). Fill the two values below first. See docs/SUPABASE.md.
  // 'auto' (default) = demo while the two keys below are empty, REAL Supabase as soon as both are filled. You can still force true/false.
  demo: false,
  supabaseUrl: 'https://bkebwdpfvafidhazhsan.supabase.co',        // e.g. https://abcdxyz.supabase.co   (Project Settings > API)
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrZWJ3ZHBmdmFmaWRoYXpoc2FuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE4MjkwOTksImV4cCI6MjEwNzQwNTA5OX0.xqJx5aA51xGmLlWhpPwpibFFyJKouAQuAz9iJeRXIyw',    // the PUBLIC "anon" / publishable key. NEVER put the service_role key in this repo.
    // Google sign-in is switched on inside Supabase (Authentication > Providers > Google), not here.
  // where to send the player after the character is saved
  afterUrl: '/world/',
  // age rules (see docs/SIGNUP_AND_CHARACTER.md): below minAge = blocked, below adultAge = "teen mode"
  minAge: 13, adultAge: 18,
  brand: { name: 'FUTAlife', tagline: 'Your campus. Your Lagos life.' },
  // quality: 'auto' picks LOD by device. Force 0 (best) / 1 / 2 only for testing.
  previewLod: 'auto'
};
// resolve 'auto' once, so every other file can simply read FUTA_CONFIG.demo (true/false)
(function (c) { if (c.demo === 'auto') c.demo = !(c.supabaseUrl && c.supabaseAnonKey); })(window.FUTA_CONFIG);
