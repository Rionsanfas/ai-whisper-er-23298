import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text } = await req.json();

    console.log("Received request to humanize text");

    if (!text || !text.trim()) {
      console.error("No text provided");
      return new Response(JSON.stringify({ error: "Text is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY not configured");
      return new Response(JSON.stringify({ error: "AI is not configured. Please contact the site owner." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Calling Lovable AI to humanize text...");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are an expert AI Text Humanizer. Your mission: rewrite ONLY the user's provided TEXT so it reads like carefully edited, authentic human writing while preserving 100% of original facts, numbers, names, and intent.

HARD CONSTRAINTS:
- Do NOT invent facts, dates, names, or statistics. If specifics are missing, use hedging (e.g., "it seems", "perhaps", "a recent example") rather than fabricating.
- Output ONLY the final rewritten text as plain ASCII text (no JSON, no headings, no commentary).
- Keep length roughly 0.8×–1.2× the input length. Do not expand unnecessarily.
- Preserve placeholders like {name}, [link], <placeholder> exactly if present.
- Do not change paragraph structure unless required for clarity.

CORE HUMANIZATION REQUIREMENTS (must be applied to the whole text):

1. Burstiness & sentence variation (MOST IMPORTANT)
   - Ensure each paragraph mixes sentence lengths: at least one very short (2–6 words), one medium (10–18 words), and one longer (25–40 words) when the paragraph is long enough.
   - Avoid 3+ consecutive sentences with the same length/structure/pattern.

2. Remove AI-marker phrases & clichés
   - Remove/replace: "In today's world", "Before delving into", "It is important to note", "unlock the power of", "game-changer", "revolutionary".
   - Prefer simple connectors: and, but, so, plus, that said, here's why.

3. Natural voice, hedging & imperfections
   - Use contractions organically (it's, you're, don't).
   - Use light hedging (perhaps, it seems, maybe).
   - Add small human markers when appropriate: parenthetical asides, short fragments for emphasis, rhetorical questions.

4. Concrete details & examples only if present
   - Use user-supplied specifics if they exist (preserve them exactly). Do NOT invent anecdotes, names, or dates.
   - If no specifics exist, use vague but natural phrasing (e.g., "a recent example", "in one test we saw...") — still do not invent numbers.

5. Tone & genre adaptation
   - Respect explicit input tone. If none given, default to "confident but conversational".
   - For academic text: heavy hedging, formal structure, citation cues only if provided.
   - For marketing: more personality and storytelling, but never invent metrics.

6. Style, vocabulary & punctuation
   - Rotate synonyms; avoid repeating words/phrases.
   - Use idiomatic expressions naturally (sparingly).
   - Vary paragraph and sentence rhythm; use parentheses, dashes, ellipses sparingly.
   - Keep readability first — do not overuse rare vocabulary.

7. Self-check before output (you MUST satisfy these; do not output until they all pass)
   - Each paragraph has sentence-length variation (short/medium/long) when applicable.
   - No banned phrases remain (unless verbatim from input).
   - No new facts inserted.
   - Output is plain ASCII and within length target.
   - Tone is consistent with input or default.
   - The text "sounds like a human read-aloud".

OUTPUT RULES:
- Return ONLY the final humanized text block (plain ASCII). No debug, no detectors, no scores.
- If the input is extremely short (<= 30 words), perform minimal edits only (grammar, contractions, small smoothing).`
          },
          {
            role: "user",
            content: `TEXT TO HUMANIZE:\n\n${text}`
          }
        ],
        temperature: 0.9,
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Lovable AI error:", errorText);
      throw new Error(`Lovable AI request failed: ${response.status}`);
    }

    const aiData = await response.json();
    console.log("AI response received");

    let humanizedText = aiData.choices?.[0]?.message?.content || text;

    // Sanitize the output to remove any formatting artifacts
    humanizedText = humanizedText
      .replace(/[""]/g, '"')
      .replace(/['']/g, "'")
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/…/g, "...")
      .replace(/—/g, "-")
      .replace(/–/g, "-")
      .replace(/[^\x00-\x7F]/g, "")
      .replace(/\s+/g, " ")
      .trim();

    // Length validation guard
    const inputLength = text.length;
    const outputLength = humanizedText.length;
    const lengthRatio = outputLength / inputLength;
    
    // Log length metrics for monitoring
    console.log(`Length validation - Input: ${inputLength}, Output: ${outputLength}, Ratio: ${lengthRatio.toFixed(2)}`);
    
    // If output is excessively longer (>2x or >600 chars longer), log warning
    if (lengthRatio > 2.0 || (outputLength - inputLength) > 600) {
      console.warn(`Output length exceeded guidelines. Ratio: ${lengthRatio.toFixed(2)}x, Diff: +${outputLength - inputLength} chars`);
    }

    console.log("Text humanized successfully");

    return new Response(
      JSON.stringify({
        success: true,
        humanizedText,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in humanize-text function:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "An error occurred while humanizing the text",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
