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
    const { text, examples = "" } = await req.json();

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
            role: "user",
            content: `You are an expert AI text humanizer. Transform the following text to sound completely human-written while preserving all facts and meaning.

YOUR MISSION: Make text pass AI detectors (GPTZero, Turnitin, Sapling, ZeroGPT, Copyleaks, Skyline) with 0% AI detection.

═══════════════════════════════════════════════════════════════
AI DETECTION PATTERNS — WHAT TRIGGERS FLAGS
═══════════════════════════════════════════════════════════════

[PATTERNS WILL BE PROVIDED BY USER]

═══════════════════════════════════════════════════════════════
HUMANIZATION TECHNIQUES — HOW TO PASS DETECTION
═══════════════════════════════════════════════════════════════

1. VARY SENTENCE STRUCTURE & LENGTH (CRITICAL)
   Mix these patterns:
   • Short punch: 3-7 words ("Simple. Direct. Effective.")
   • Medium flow: 10-18 words ("This approach combines simplicity with power in ways that actually matter.")
   • Long detail: 25-40 words ("When you look at the data from the past five years, what becomes clear is that traditional methods simply can't keep pace with modern demands — and that's where this comes in.")
   
   ❌ BAD Pattern: All sentences 15-20 words
   ✅ GOOD Pattern: 5 words. 18 words. 3 words. 28 words. 12 words.

2. USE SYNONYMS & REPHRASE CONSTANTLY
   Never repeat phrases. Vary everything:
   • shows → reveals, indicates, suggests, demonstrates, points to
   • important → critical, key, vital, essential, matters
   • use → utilize, employ, leverage, apply, deploy
   
   Change structure too: "This shows results" → "Results prove this" → "You'll see it works"

3. ADJUST TONE & VOICE
   ✅ USE:
   • Contractions: it's, don't, can't, you're, won't, let's, here's
   • Conversational markers: "honestly," "look," "here's the thing," "to be fair"
   • Rhetorical questions: "Why does this matter?" "Want proof?"
   • Personal pronouns: "I think," "you'll find," "we noticed"
   
   Sound like you're talking to a colleague, not writing a dissertation.

4. INTRODUCE HEDGING & NUANCE
   Add qualifiers: perhaps, possibly, it seems, might, probably, likely, tends to, appears to, suggests
   
   ❌ BAD: "This cures the disease"
   ✅ GOOD: "Early results suggest this may help manage the disease — though more research is needed"

5. USE CONCRETE EXAMPLES & ANECDOTES
   ❌ BAD: "This improves efficiency"
   ✅ GOOD: "Last March, Sarah's team tested this. Processing time dropped from 3 days to 6 hours."
   
   Add: Names, dates, places, specific numbers, real scenarios

6. VARY VOCABULARY & WORD FREQUENCIES
   • Mix common words with precise, less-common alternatives
   • Use idioms naturally: "hit the nail on the head," "back to square one"
   • Include domain jargon when appropriate
   • Balance high-frequency and rare words

7. ADJUST PARAGRAPH RHYTHM & PUNCTUATION
   • Vary paragraph length: some 2 sentences, others 6+
   • Use em-dashes for emphasis — they add personality
   • Add ellipses for pauses... when natural
   • Use semicolons occasionally; they work well
   • Include (parenthetical asides) sparingly

8. EMOTIONAL & EMPATHETIC LANGUAGE
   Show feeling:
   • Enthusiasm: "Wow," "Surprisingly," "Interestingly"
   • Opinion: "I love how," "What's fascinating"
   • Emotion: "excited to share," "concerned about," "thrilled"
   • Use exclamation points sparingly for genuine emphasis!

9. ADD THOUGHTFUL "IMPERFECTIONS"
   • Start with "And" or "But" sometimes
   • Use fragments. Like this. See?
   • End with prepositions when natural
   • Add fillers: "kind of," "sort of," "you know"
   • Split infinitives if it sounds better

10. DEPTH & REASONING
    Explain WHY, not just WHAT. Add nuance, implications, edge cases, methodology details.

═══════════════════════════════════════════════════════════════
CONTEXT-SPECIFIC STRATEGIES
═══════════════════════════════════════════════════════════════

ACADEMIC/ESSAY WRITING:
• Heavy hedging: "suggests," "indicates," "appears to," "may," "could"
• First-person plural: "we found," "our analysis shows"
• Clear topic sentences
• Actual citations with specifics
• Acknowledge limitations and counter-arguments
• Concluding reflections on implications

MARKETING COPY:
• Inject brand personality and voice
• Customer examples and real scenarios
• Vary CTAs (don't repeat "Click here")
• Energetic punctuation and colloquialisms
• Creative analogies, playful humor
• Avoid generic slogans

CREATIVE WRITING:
• Unique voice with sensory details
• Idiomatic dialogue with contractions/slang
• Break narrative flow: "She paused — eyes glistening."
• Add subtext and ambiguity
• Unpredictable plot elements
• Personal perspective and reflective asides

═══════════════════════════════════════════════════════════════
CRITICAL REMINDERS
═══════════════════════════════════════════════════════════════

✓ Sentence length variation is THE #1 factor for passing detection
✓ AI detectors measure "burstiness" (variation) and "perplexity" (predictability)
✓ Low burstiness = uniform sentences = AI flag
✓ High perplexity = unpredictable words = human writing
✓ Never invent facts — only rephrase existing information
✓ Maintain all data, statistics, names, and core meaning
✓ Goal: Authentic human voice, not anti-detection tricks
✓ Target: 0% AI-generated text

═══════════════════════════════════════════════════════════════
OUTPUT FORMAT
═══════════════════════════════════════════════════════════════

CRITICAL: Return ONLY the rewritten text. No labels, no explanations, no "Here's the rewritten version:"

Just the humanized text directly.

${examples ? `═══════════════════════════════════════════════════════════════
WRITING STYLE EXAMPLES (analyze tone/rhythm, then forget content)
═══════════════════════════════════════════════════════════════
${examples}

` : ""}═══════════════════════════════════════════════════════════════
TEXT TO HUMANIZE
═══════════════════════════════════════════════════════════════
${text}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error("AI gateway error:", response.status, errorData);
      if (response.status === 401) {
        return new Response(
          JSON.stringify({ error: "Lovable AI authentication failed. Please contact support." }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (response.status === 403) {
        return new Response(
          JSON.stringify({ error: "Lovable AI request not allowed. Please contact support." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limits exceeded, please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Lovable AI usage limit exceeded. Please add credits to your workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ error: "Failed to humanize text" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    console.log("AI response received");

    const raw = data.choices?.[0]?.message?.content;

    if (!raw) {
      console.error("No humanized text in response");
      return new Response(JSON.stringify({ error: "Failed to generate humanized text" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Sanitize output to remove special characters and unintended placeholders
    const sanitize = (s: string) =>
      s
        .replace(/[""]/g, '"')
        .replace(/['']/g, "'")
        .replace(/[—–]/g, "-")
        .replace(/[•◦▪·]/g, "-")
        .replace(/\u2026/g, "...")
        .replace(/\*\*/g, "")
        .replace(/\t/g, " ")
        .replace(/\u00A0/g, " ")
        .replace(/[^\S\r\n]+/g, " ")
        .trim();

    let sanitizedText = sanitize(raw);
    // Remove placeholder-style tokens that didn't exist in the input
    sanitizedText = sanitizedText.replace(/\{([^}]+)\}/g, (_m, inner) =>
      text && text.includes(`{${inner}}`) ? `{${inner}}` : inner,
    );
    sanitizedText = sanitizedText.replace(/\[([^\]]+)\]/g, (_m, inner) =>
      text && text.includes(`[${inner}]`) ? `[${inner}]` : inner,
    );
    sanitizedText = sanitizedText.replace(/<([^>]+)>/g, (_m, inner) =>
      text && text.includes(`<${inner}>`) ? `<${inner}>` : inner,
    );

    if (text && sanitizedText.length > Math.max(text.length * 2, 600)) {
      console.log("Length guard: output much longer than input", {
        inputLen: text.length,
        outLen: sanitizedText.length,
      });
    }

    console.log("Text humanized successfully");

    return new Response(
      JSON.stringify({
        humanizedText: sanitizedText,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error in humanize-text function:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
