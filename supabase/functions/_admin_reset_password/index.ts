// Temporary one-shot admin function. Delete after use.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

Deno.serve(async (req) => {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const body = await req.json();
  const admin = createClient(url, key);
  const { data, error } = await admin.auth.admin.updateUserById(body.user_id, {
    password: body.password,
  });
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  return new Response(JSON.stringify({ ok: true, id: data.user.id, email: data.user.email, email_confirmed_at: data.user.email_confirmed_at }), {
    headers: { "Content-Type": "application/json" },
  });
});
