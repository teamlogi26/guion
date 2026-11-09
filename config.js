// Configuración pública de Supabase.
// La "publishable key" está hecha para ir en la web: la seguridad la ponen las políticas RLS de schema.sql.
// NUNCA pongas aquí la "secret key" (sb_secret_…).
window.SUPABASE_URL = "https://rdpcydzadphbvbdzgcmv.supabase.co";
window.SUPABASE_KEY = "sb_publishable_fhuuoedmqqkvHe8O7yitJA_NhEQ_p1F";

// false = la web abre directo, sin iniciar sesión (requiere correr supabase/02_sin_login.sql).
window.REQUIERE_LOGIN = false;
