import { createClient } from "@supabase/supabase-js";
export const configured =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const invalidConfiguration =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL !==
  !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
let browser: ReturnType<typeof createClient> | null = null;
export function browserClient() {
  if (!configured) return null;
  return (browser ||= createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  ));
}
