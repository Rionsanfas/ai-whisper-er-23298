// api/humanize.js
import fetch from "node-fetch";
import { createClient } from "@supabase/supabase-js";

/**
 * Server-only envs (must exist in Vercel):
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 * - OPENAI_API_KEY
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}
if (!OPENAI_KEY) {
  console.error("Missing OPENAI_API_KEY");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  // server only client
  auth: { persistSession: false },
});

/* -------------------------
   Helper: verify Supabase JWT
   Expects Authorization: Bearer <access_token>
   ------------------------- */
async function verifySupabaseToken(req) {
  try {
    const authHeader = req.headers?.authorization || "";
    const token = (authHeader.split("Bearer ")[1] || "").trim();
    if (!token) return { ok: false, reason: "no_token" };

    // Supabase public REST endpoint to get user info
    // Works server-side by passing the access token
    const resp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (resp.status !== 200) return { ok: false, reason: "invalid_token", status: resp.status };
    const user = await resp.json();
    return { ok: true, user };
  } catch (err) {
    return { ok: false, reason: "error", error: err };
  }
}

/* -------------------------
   Build prompt (centralized)
   ------------------------- */
function buildPrompt({ mode = "default", language = "en", text }) {
  let base = `You are a humanizer. Rewrite the input so it sounds natural, fluent and human. Keep the original meaning.`;
  if (mode === "soft") base += ` Tone: friendly and casual.`;
  if (mode === "aggressive") base += ` Tone: direct, punchy.`;
  if (mode === "academic") base += ` Tone: formal and academic.`;
  if (language === "ar") base += ` Output in modern standard Arabic.`;
  base += `\n\nInput:\n${text}\n\nOutput:`;
  return base;
}

/* -------------------------
   Main handler
   ------------------------- */
export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    // Validate body
    const { text, mode, language } = req.body || {};
    if (!text || typeof text !== "string") return res.status(400).json({ error: "Missing text" });

    // Verify user via Authorization header (recommended)
    const tokenCheck = await verifySupabaseToken(req);
    if (!tokenCheck.ok) {
      return res.status(401).json({ error: "Unauthorized", reason: tokenCheck.reason });
    }
    const userId = tokenCheck.user?.id;
    if (!userId) return res.status(401).json({ error: "No user id" });

    // Read user credits
    const { data: creditRow, error: creditErr } = await supabase
      .from("user_credits")
      .select("current_credits")
      .eq("user_id", userId)
      .single();

    if (creditErr && creditErr.code !== "PGRST116") {
      console.error("credit read error", creditErr);
      return res.status(500).json({ error: "DB error" });
    }

    const currentCredits = creditRow?.current_credits ?? 0;
    const creditsNeeded = Math.max(1, Math.ceil((text.length || 0) / 100)); // change math later

    if (currentCredits < creditsNeeded) {
      return res.status(403).json({ error: "Not enough credits" });
    }

    // Build prompt & call OpenAI (server-side)
    const systemPrompt = buildPrompt({ mode, language, text });

    const openRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text },
        ],
        max_tokens: 1200,
        temperature: 0.6,
      }),
    });

    const openJson = await openRes.json();
    if (openJson.error) {
      console.error("OpenAI error:", openJson.error);
      return res.status(502).json({ error: "AI provider error", detail: openJson.error });
    }
    const output = openJson.choices?.[0]?.message?.content ?? "";

    // Deduct credits atomically using stored proc if available
    let deducted = false;
    try {
      await supabase.rpc("sp_deduct_credits", { p_user_id: userId, p_credits: creditsNeeded });
      deducted = true;
    } catch (rpcErr) {
      // fallback to non-atomic update
    }
    if (!deducted) {
      await supabase
        .from("user_credits")
        .update({ current_credits: Math.max(0, currentCredits - creditsNeeded) })
        .eq("user_id", userId);
    }

    // Log usage
    await supabase.from("usage_logs").insert([
      {
        user_id: userId,
        input_length: text.length,
        output_length: output.length,
        credits_used: creditsNeeded,
        model: "gpt-4.1-mini",
      },
    ]);

    return res.status(200).json({ output });
  } catch (err) {
    console.error("humanize error:", err);
    return res.status(500).json({ error: err.message || "server error" });
  }
}
