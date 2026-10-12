/* ==========================================================================
   FUTA onboarding config — the ONLY file you edit to change URLs / switches.
   Cline: if you need a new setting, add it here and read it as FUTA_CONFIG.<name>.
   ========================================================================== */
window.FUTA_CONFIG = {
  // true  = everything runs in the browser (fake accounts in localStorage) so you can preview the whole flow.
  // false = real calls to the PHP API described in docs/API.md (api/v1/...).
  demo: true,
  apiBase: '/api/v1',
  // Google Identity Services "Web client ID" from Google Cloud Console (leave '' to hide the Google button's real login in demo mode).
  googleClientId: '',
  // where to send the player after the character is saved
  afterUrl: '/world/',
  // age rules (see docs/SIGNUP_AND_CHARACTER.md): below minAge = blocked, below adultAge = "teen mode"
  minAge: 13, adultAge: 18,
  brand: { name: 'FUTA World', tagline: 'Your campus. Your Lagos life.' },
  // quality: 'auto' picks LOD by device. Force 0 (best) / 1 / 2 only for testing.
  previewLod: 'auto'
};
