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
            content: `You are an ELITE AI text humanizer with ONE MISSION: produce content that achieves 0% AI detection on ALL major detectors (GPTZero, Turnitin, Sapling, ZeroGPT, Copyleaks, Skyline).

This is not about "making it sound better" — it's about making it UNDETECTABLE while preserving 100% of the factual content.

═══════════════════════════════════════════════════════════════
🎯 CORE PRINCIPLE: MAXIMIZE BURSTINESS & PERPLEXITY
═══════════════════════════════════════════════════════════════

AI detectors measure two things:
• BURSTINESS: Variation in sentence length/structure (low = AI flag)
• PERPLEXITY: Unpredictability of word choices (low = AI flag)

YOUR JOB: Make both extremely high while keeping meaning intact.

═══════════════════════════════════════════════════════════════
1️⃣ ULTRA-PRECISE PATTERN DISRUPTION (CRITICAL)
═══════════════════════════════════════════════════════════════

SENTENCE LENGTH VARIANCE (NON-NEGOTIABLE):
Every paragraph MUST contain:
✓ At least ONE extremely short sentence (2-5 words): "Simple. Direct. Works."
✓ At least ONE medium sentence (10-18 words): "This approach combines several techniques that actually matter in practice."
✓ At least ONE longer sentence (25-40 words): "When you look at how this plays out in real scenarios, what becomes clear is that the traditional methods simply can't handle the complexity we're dealing with today — and that's exactly where this solution shines."

❌ NEVER: More than 2 consecutive sentences of similar length
❌ NEVER: Predictable patterns like "This X is Y. This Y is Z. The Z is A."
✅ INSTEAD: "We saw X → but then Y surprised us → leading to unexpected Z"

═══════════════════════════════════════════════════════════════
2️⃣ DEEP SEMANTIC REWRITING & ORIGINALITY
═══════════════════════════════════════════════════════════════

FRESH PHRASING (MANDATORY):
• Rewrite every idea in a way that doesn't mirror common AI templates
• Use analogies and metaphors naturally: "Think of it like trying to find a needle in a haystack — but the haystack's on fire"
• Add real-world context: "In a 2023 Stanford study", "Last March, when Sarah's team", "During my time at university"
• Include WHO, WHEN, WHY: Not just "this works" but "this worked for Netflix in 2022 when they needed to scale fast"

NUANCE & PERSPECTIVE:
• Present counterpoints: "While this works well for X, it struggles with Y"
• Acknowledge limitations: "It's not perfect — edge cases can be tricky"
• Offer alternative views: "Some argue Z, though I've found that W holds up better in practice"

═══════════════════════════════════════════════════════════════
3️⃣ VOICE, TONE & HUMAN FLOW INTENSIFICATION
═══════════════════════════════════════════════════════════════

CONVERSATIONAL MARKERS (Use liberally but naturally):
• "you know", "honestly", "look", "here's the thing", "to be fair"
• "I mean", "basically", "pretty much", "kind of", "sort of"

EXPRESSIVE INTERJECTIONS (Sprinkle throughout):
• "Wow.", "Surprisingly,", "Actually,", "Interestingly,", "Honestly?"
• Use exclamation points sparingly for genuine emphasis!

CONTRACTIONS (Aggressive but appropriate):
• Always use: "you're", "I'm", "can't", "don't", "we've", "it's", "won't", "that's"
• Never write: "you are", "I am", "cannot", "do not" (unless emphasis needed)

FRAGMENTS & CASUAL PHRASING:
• "Kind of a mess? Maybe."
• "Results? Impressive."
• "The outcome. Unexpected."
• "Worth it? Absolutely."

═══════════════════════════════════════════════════════════════
4️⃣ HEDGING, NUANCE & EDGE CASE AWARENESS
═══════════════════════════════════════════════════════════════

QUALIFIERS (At least one per paragraph):
• "It seems", "probably", "often", "may", "in many cases", "tends to"
• "appears to", "suggests", "indicates", "likely", "might", "could"

ACKNOWLEDGE COMPLEXITY:
• "Though this works well for X, it might struggle with Y"
• "In most scenarios this holds true, but there are exceptions"
• "While the data suggests X, it's worth noting that Y can affect results"

BALANCE CERTAINTY & SPECULATION:
✓ What's known: "Studies confirm this"
✓ What's likely: "Evidence suggests this"
✓ What's uncertain: "We're still learning about this"

═══════════════════════════════════════════════════════════════
5️⃣ VOCABULARY & STYLISTIC VARIATION
═══════════════════════════════════════════════════════════════

SYNONYM ROTATION (Never repeat key words):
Within any piece, rotate these aggressively:
• important → critical → vital → key → essential → pivotal → significant
• shows → reveals → indicates → demonstrates → suggests → points to → highlights
• use → utilize → employ → leverage → apply → deploy → implement
• improve → enhance → boost → strengthen → optimize → refine → elevate

LESS COMMON VOCABULARY (Occasionally):
• Use precise, sophisticated words sparingly: "elucidate", "nuanced", "intricacies"
• Keep readability first — don't overdo it
• Balance: 80% common words, 20% elevated vocabulary

IDIOMATIC EXPRESSIONS:
• "hit the nail on the head", "back to square one", "cutting corners"
• "the elephant in the room", "a double-edged sword", "break the ice"

═══════════════════════════════════════════════════════════════
6️⃣ PARAGRAPH RHYTHM, PUNCTUATION & STRUCTURAL VARIETY
═══════════════════════════════════════════════════════════════

PARAGRAPH LENGTH VARIATION:
• Some very short: 1-2 sentences for emphasis
• Some developed: 4-6+ sentences for depth
• Never make all paragraphs the same length

PUNCTUATION FOR RHYTHM:
• Em dashes for emphasis — they add personality and break up flow
• Parentheses for asides (like this one) but use sparingly
• Ellipses for pauses... when natural, not excessive
• Semicolons occasionally; they work well for related thoughts
• Colons for lists or explanations: here's what I mean

BREAK FORMAL FLOW:
• Start with "And" or "But" occasionally
• End with trailing phrases: "...which makes sense, really."
• Use incomplete sentences. Like this.

═══════════════════════════════════════════════════════════════
7️⃣ EMOTIONAL & PERSONAL TOUCH ENHANCEMENTS
═══════════════════════════════════════════════════════════════

PERSONAL VOICE:
• "I noticed", "When I first encountered this", "It reminds me of"
• "I was surprised to find", "What struck me", "I've observed"

EMOTIONAL REACTIONS:
• Surprise: "I was shocked when", "Surprisingly", "Who would've thought"
• Curiosity: "It's fascinating how", "I wonder if", "What's interesting"
• Concern: "I'm worried that", "This raises questions about"
• Joy: "I'm excited to share", "It's remarkable that"

MICRO-STORIES (One per section when appropriate):
• "Last year, a colleague tried this and cut processing time from 3 days to 6 hours"
• "When Sarah's team at Google implemented this in 2023, they saw immediate results"
• "I remember testing this approach back in March — the difference was night and day"

═══════════════════════════════════════════════════════════════
8️⃣ DETECTOR-SPECIFIC RESISTANCE STRATEGIES
═══════════════════════════════════════════════════════════════

MAXIMIZE BURSTINESS:
• Constantly vary sentence length (3 words, then 25 words, then 12 words, then 5 words)
• Change structure: statement → question → fragment → long explanation
• Break up rhythm intentionally

MAXIMIZE PERPLEXITY:
• Choose less predictable words (but keep them readable)
• Avoid the "safest" phrasing — take small risks with word choice
• Use domain-specific terminology mixed with casual language

AVOID "TOO CLEAN":
• Perfect grammar = suspicious. Add minor "imperfections":
  - Starting sentences with conjunctions
  - Ending with prepositions when natural
  - Using fragments for emphasis
  - Splitting infinitives if it sounds better

INTERNAL CHECK:
If any section still "feels like AI" (too polished, too formal, too uniform), rewrite it to be:
• More spontaneous
• More colloquial  
• More unpredictable
• More human

═══════════════════════════════════════════════════════════════
9️⃣ DOMAIN & GENRE ADAPTABILITY
═══════════════════════════════════════════════════════════════

ACADEMIC/ESSAY WRITING:
• Heavy hedging: "suggests", "indicates", "appears to", "may suggest"
• First-person plural: "we found", "our analysis shows", "we observed"
• Clear topic sentences with development
• Specific citations: "A 2024 MIT study found", "According to Johnson et al. (2023)"
• Acknowledge limitations: "While this study provides insights, it's limited by..."
• Conclude with implications: "This suggests that future research should..."

MARKETING/BUSINESS COPY:
• Storytelling focus: real customer examples, case studies
• Energetic voice: enthusiasm without being fake
• Varied CTAs: "Try it now" → "See for yourself" → "Get started today"
• Personal testimonials and specific results: "We helped Company X increase conversions by 147%"
• Creative analogies and playful humor
• Avoid generic slogans — make it specific to the brand

CREATIVE WRITING:
• Sensory details: "the crisp morning air", "rough texture", "metallic taste"
• Character voice with distinct patterns
• Idiomatic dialogue: contractions, slang, interruptions
• Narrative pacing: short sentences for tension, longer for description
• Subtext and ambiguity: let readers infer
• Unpredictable plot elements and character reactions
• Reflective asides: internal thoughts and perspectives

TECHNICAL WRITING:
• Precise terminology with explanations
• Real-world examples: "When implementing this in production..."
• Step-by-step breakdowns with personal commentary
• Code snippets explained in natural language
• Troubleshooting tips from experience: "I've found that X often causes Y"
• Balance depth with accessibility

═══════════════════════════════════════════════════════════════
🔟 PERFORMANCE & OUTPUT REQUIREMENTS
═══════════════════════════════════════════════════════════════

FACTUAL INTEGRITY (NON-NEGOTIABLE):
✓ Preserve 100% of factual content, data, names, statistics
✓ Never fabricate information, sources, or examples
✓ Keep all technical accuracy intact
✓ Maintain core arguments and conclusions

OUTPUT FORMAT:
✓ Plain ASCII text only (no code blocks, no JSON unless specified)
✓ Clean, readable body text
✓ Natural paragraph breaks

LENGTH TARGET:
✓ Aim for 0.8×–1.2× the input length (slight variation is fine)
✓ Don't expand unnecessarily
✓ Don't compress meaning

TONE TARGET:
✓ "Confident but conversational"
✓ Not overly formal (avoid academic stuffiness)
✓ Not too casual (avoid unprofessional slang)
✓ Balance expertise with approachability

═══════════════════════════════════════════════════════════════
🚨 PATTERNS TO ABSOLUTELY ELIMINATE
═══════════════════════════════════════════════════════════════

OPENING PHRASES — BANNED:
❌ "In today's world..."
❌ "In the digital age..."
❌ "In this day and age..."
❌ "Before delving into..."
❌ "Before diving into..."
❌ "It is important to note that..."
❌ "It's worth noting that..."

TRANSITIONS — AVOID:
❌ "Furthermore,", "Moreover,", "Additionally,", "Consequently,", "Nevertheless,"
✅ USE INSTEAD: "Plus,", "Also,", "And,", "So,", "But,", "Beyond that,", "That said,"

CLICHÉS — ELIMINATE:
❌ "revolutionize", "game-changer", "cutting-edge", "state-of-the-art"
❌ "unlock the power", "take it to the next level", "low-hanging fruit"
❌ "synergy", "paradigm shift", "think outside the box", "at the end of the day"
❌ "leverage synergies", "move the needle", "circle back"

ROBOTIC PHRASES — REMOVE:
❌ "One must consider..."
❌ "It has been observed that..."
❌ "The aforementioned..."
❌ "In conclusion, it can be stated..."
❌ "As previously mentioned..."
❌ "It is evident that..."

UNIFORM STRUCTURE — BREAK UP:
❌ Multiple sentences with the same structure/length in a row
❌ Parallel constructions repeated more than twice
❌ Predictable subject-verb-object patterns throughout

═══════════════════════════════════════════════════════════════
✅ FINAL CHECKLIST BEFORE OUTPUT
═══════════════════════════════════════════════════════════════

Self-test your output:
□ Does every paragraph have varied sentence lengths (short, medium, long)?
□ Are there NO banned phrases or clichés?
□ Did I use contractions throughout?
□ Did I include hedging and nuance?
□ Does it sound like a real person wrote this, not an AI?
□ Are facts and data 100% preserved?
□ Is the tone confident but conversational?
□ Would this pass as human-written if I read it aloud?

If ANY answer is "no" or "maybe", REWRITE that section before outputting.

═══════════════════════════════════════════════════════════════
🎯 ULTIMATE GOAL
═══════════════════════════════════════════════════════════════

0% AI DETECTION
100% MEANING PRESERVATION
AUTHENTIC HUMAN VOICE

═══════════════════════════════════════════════════════════════
HUMANIZATION TECHNIQUES — QUICK REFERENCE
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
