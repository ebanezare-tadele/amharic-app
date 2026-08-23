// Passcode-gated writer for the shared family audio recordings.
//
// This is the ONLY thing allowed to write to the `shared_recordings`
// table or the `recordings` storage bucket — RLS blocks the client's
// anon key from writing either (see the migration). This function holds
// the service role key (a Supabase secret, injected at runtime — never
// shipped to the browser) and only uses it after checking the caller
// supplied the family passcode, which is a separate secret you set
// yourself:
//
//   supabase secrets set FAMILY_PASSCODE='whatever you pick'
//
// Reads (listing/playing shared clips) do NOT go through this function —
// the client reads `shared_recordings` and the storage bucket directly
// with the public anon key, since those are meant to be world-readable.
//
// Actions (POST body, all JSON):
//   { action: "verify", passcode }
//   { action: "put",    passcode, fam, ord, dataUrl, contentType }
//   { action: "delete", passcode, fam, ord }

import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

// Constant-time-ish string compare so we're not leaking passcode length
// or contents via response timing. Family-passcode threat model doesn't
// call for anything fancier than this.
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function checkPasscode(supplied: unknown): { ok: true } | { ok: false; error: string } {
  const configured = Deno.env.get("FAMILY_PASSCODE");
  if (!configured) {
    return { ok: false, error: "Family passcode isn't configured on the server yet." };
  }
  if (typeof supplied !== "string" || !supplied) {
    return { ok: false, error: "Passcode required." };
  }
  if (!safeEqual(supplied, configured)) {
    return { ok: false, error: "Wrong passcode." };
  }
  return { ok: true };
}

function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; contentType: string } {
  const match = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl);
  if (!match) throw new Error("Not a base64 data URL.");
  const [, contentType, b64] = match;
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { bytes, contentType };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ ok: false, error: "POST only." }, 405);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON body." }, 400);
  }

  const { action, passcode } = body ?? {};

  if (action === "verify") {
    const check = checkPasscode(passcode);
    return json(check.ok ? { ok: true } : { ok: false, error: check.error }, check.ok ? 200 : 401);
  }

  if (action !== "put" && action !== "delete") {
    return json({ ok: false, error: "Unknown action." }, 400);
  }

  const check = checkPasscode(passcode);
  if (!check.ok) return json({ ok: false, error: check.error }, 401);

  const fam = Number(body.fam);
  const ord = Number(body.ord);
  if (!Number.isInteger(fam) || !Number.isInteger(ord) || fam < 0 || ord < 0) {
    return json({ ok: false, error: "Bad fam/ord." }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceRoleKey);

  const storagePath = `${fam}/${ord}`;

  if (action === "delete") {
    const { error: storageErr } = await admin.storage.from("recordings").remove([storagePath]);
    if (storageErr) return json({ ok: false, error: storageErr.message }, 500);
    const { error: rowErr } = await admin
      .from("shared_recordings")
      .delete()
      .eq("fam", fam)
      .eq("ord", ord);
    if (rowErr) return json({ ok: false, error: rowErr.message }, 500);
    return json({ ok: true });
  }

  // action === "put"
  const dataUrl = body.dataUrl;
  if (typeof dataUrl !== "string") return json({ ok: false, error: "Missing dataUrl." }, 400);

  // Mirrors the ~700KB clip-length guard in the app's own Voice component
  // (App.jsx) — enforced here too since this endpoint is reachable
  // directly, not just through the UI that normally guards it.
  if (dataUrl.length > 1_000_000) {
    return json({ ok: false, error: "Clip too large." }, 413);
  }

  let bytes: Uint8Array, contentType: string;
  try {
    ({ bytes, contentType } = dataUrlToBytes(dataUrl));
  } catch {
    return json({ ok: false, error: "Bad dataUrl." }, 400);
  }

  const { error: uploadErr } = await admin.storage
    .from("recordings")
    .upload(storagePath, bytes, { contentType, upsert: true });
  if (uploadErr) return json({ ok: false, error: uploadErr.message }, 500);

  const { error: rowErr } = await admin
    .from("shared_recordings")
    .upsert({ fam, ord, storage_path: storagePath, updated_at: new Date().toISOString() });
  if (rowErr) return json({ ok: false, error: rowErr.message }, 500);

  const { data: pub } = admin.storage.from("recordings").getPublicUrl(storagePath);
  return json({ ok: true, url: pub.publicUrl });
});
