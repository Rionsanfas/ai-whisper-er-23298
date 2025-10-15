import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const SAPLING_API_KEY = Deno.env.get("SAPLING_API_KEY");
const ZEROGPT_API_KEY = Deno.env.get("ZEROGPT_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Call Sapling AI Detector
async function detectWithSapling(text: string) {
  if (!SAPLING_API_KEY) {
    console.log("Sapling API key not configured, skipping Sapling detection");
    return null;
  }

  try {
    const response = await fetch("https://api.sapling.ai/api/v1/aidetect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: SAPLING_API_KEY,
        text,
        sent_scores: true,
      }),
    });

    if (!response.ok) {
      console.error("Sapling detection failed:", response.status);
      return null;
    }

    const data = await response.json();
    return {
      score: data.score * 100, // Convert to percentage
      sentenceScores: data.sentence_scores || [],
      tokens: data.tokens || [],
      tokenProbs: data.token_probs || [],
    };
  } catch (error) {
    console.error("Sapling detection error:", error);
    return null;
  }
}

// Call ZeroGPT AI Detector
async function detectWithZeroGPT(text: string) {
  if (!ZEROGPT_API_KEY) {
    console.log("ZeroGPT API key not configured, skipping ZeroGPT detection");
    return null;
  }

  try {
    const response = await fetch("https://api.zerogpt.com/api/v1/detectText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ZEROGPT_API_KEY}`,
      },
      body: JSON.stringify({
        input_text: text,
      }),
    });

    if (!response.ok) {
      console.error("ZeroGPT detection failed:", response.status);
      return null;
    }

    const data = await response.json();
    return {
      score: data.data?.is_gpt_generated || 0,
      flaggedSentences: data.data?.gpt_generated_sentences || [],
      wordsCount: data.data?.words_count || 0,
    };
  } catch (error) {
    console.error("ZeroGPT detection error:", error);
    return null;
  }
}

// Extract context around a sentence
function extractContext(text: string, sentence: string) {
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
  const index = sentences.findIndex((s) => s.trim().includes(sentence.trim()));

  if (index === -1) return { before: "", after: "" };

  return {
    before: index > 0 ? sentences[index - 1].trim() : "",
    after: index < sentences.length - 1 ? sentences[index + 1].trim() : "",
  };
}

// Refine flagged sections using AI with context
async function refineFlaggedSections(
  originalText: string,
  flaggedSectionsData: Array<{ sentence: string; score: number }>,
  avgScore: number,
) {
  if (!LOVABLE_API_KEY || flaggedSectionsData.length === 0) {
    return originalText;
  }

  console.log(
    `Refining flagged sections. AI score: ${avgScore.toFixed(2)}%, Flagged sections: ${flaggedSectionsData.length}`,
  );

  // Extract context for each flagged sentence
  const flaggedWithContext = flaggedSectionsData.map((item) => ({
    sentence: item.sentence,
    score: item.score,
    ...extractContext(originalText, item.sentence),
  }));

  try {
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
            content: `You are an expert AI text humanizer. Transform the text to sound completely human-written while preserving all facts and meaning.

YOUR MISSION: Make text pass AI detectors (GPTZero, Turnitin, Sapling, ZeroGPT, Copyleaks, Skyline) with a score BELOW 8% AI detection.

═══════════════════════════════════════════════════════════════
AI DETECTION PATTERNS — WHAT TRIGGERS FLAGS
═══════════════════════════════════════════════════════════════

1. UNIFORM SYNTAX & STRUCTURE (Low Burstiness)
   ❌ BAD: "The project was successful. The results were impressive. The team was happy. The clients were satisfied."
   ✅ GOOD: "The project succeeded. Results? Impressive. And the team couldn't be happier — clients loved it too."
   
   WHY: AI writes uniform 24-25 word sentences. Humans mix 3-word, 10-word, and 28-word sentences randomly.

2. REPETITIVE PHRASES & KEYWORDS
   ❌ NEVER USE:
   • "In today's world" / "In the digital age" / "In this day and age"
   • "Before delving into" / "Before diving into"
   • "It is important to note that" / "It's worth noting that"
   • "An integral part" / "Woven into the fabric of"
   • "Unlock the power of" / "Look no further" / "Game-changer"
   • "Revolutionary" / "Cutting-edge" / "State-of-the-art"
   • "Furthermore" / "Moreover" / "Additionally" (too formal)
   
   ✅ INSTEAD USE: "So," "Plus," "Also," "And," "But," "That said," "Here's why"

3. OVERLY FORMAL/ROBOTIC TONE
   ❌ BAD: "One must consider the implications of this methodology"
   ✅ GOOD: "Think about what this method actually means"
   
   ❌ BAD: "It has been observed that the implementation yields favorable outcomes"
   ✅ GOOD: "This approach works. Well, actually."
   
   WHY: AI uses perfect grammar, no contractions, archaic phrasing. Humans use contractions, casual language, minor "imperfections."

4. LACK OF PERSONAL DETAIL/CREATIVITY
   ❌ BAD: "Studies show this is effective"
   ✅ GOOD: "A 2024 Stanford study found this cut errors by 40%"
   
   ❌ BAD: "This method has many benefits"
   ✅ GOOD: "When I first tried this, I was shocked — response times dropped from 2 hours to 15 minutes"
   
   WHY: AI stays abstract. Humans add names, dates, anecdotes, specifics.

5. LIMITED HEDGING & NUANCE
   ❌ BAD: "This solution works perfectly for all cases"
   ✅ GOOD: "This solution seems to work well in most scenarios — though edge cases can be tricky"
   
   ADD: perhaps, might, suggests, appears, likely, probably, seems, tends to

6. SHALLOW CONTENT COVERAGE
   ❌ BAD: Generic overviews without depth
   ✅ GOOD: Specific insights, edge cases, examples, original analysis

7. EXCESSIVE KEYWORD DENSITY
   ❌ BAD: Repeating "AI humanizer" 15 times in 300 words
   ✅ GOOD: "AI humanizer" → "the tool" → "this approach" → "text rewriter"

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
PATTERNS TO ABSOLUTELY ELIMINATE
═══════════════════════════════════════════════════════════════

OPENING PHRASES — NEVER USE:
❌ "In today's world..."
❌ "In the digital age..."
❌ "Before delving into..."
❌ "It is important to note that..."
❌ "In this day and age..."

TRANSITIONS — AVOID:
❌ "Furthermore," "Moreover," "Additionally," "Consequently"
✅ Use: "Plus," "Also," "And," "So," "But," "Beyond that"

CLICHÉS — ELIMINATE:
❌ "revolutionize," "game-changer," "cutting-edge," "state-of-the-art"
❌ "unlock the power," "take it to the next level," "low-hanging fruit"
❌ "synergy," "paradigm shift," "think outside the box"

ROBOTIC PHRASES — REMOVE:
❌ "One must consider..."
❌ "It has been observed that..."
❌ "The aforementioned..."
❌ "In conclusion, it can be stated..."

═══════════════════════════════════════════════════════════════
BEFORE & AFTER EXAMPLES
═══════════════════════════════════════════════════════════════

EXAMPLE 1:
❌ BEFORE (100% AI-flagged):
"In today's digital landscape, social media has become an integral part of modern communication. Furthermore, it enables users to connect globally. Moreover, it facilitates the sharing of information in real-time. Additionally, businesses leverage these platforms for marketing purposes."

✅ AFTER (Human-like):
"Social media's everywhere now. It connects people across continents — instantly. You share something, and boom, it's live. Businesses? They've caught on too, using these platforms to reach customers in ways traditional ads never could."

EXAMPLE 2:
❌ BEFORE (AI-detected):
"It is important to note that this methodology yields favorable outcomes. Before delving into the specifics, one must understand the foundational principles. The implementation of this approach has demonstrated considerable efficacy across multiple use cases."

✅ AFTER (Human-like):
"This method works. Really well, actually. But here's the thing — you need to grasp the basics first. Once you do? You'll see it delivers results across different scenarios. We've tested it extensively."

EXAMPLE 3:
❌ BEFORE (Robotic):
"The system provides comprehensive functionality. The system offers advanced features. The system ensures optimal performance. The system delivers reliable results."

✅ AFTER (Natural):
"This system does it all. Advanced features? Check. Performance? Optimized. And reliability? That's where it really shines — you can count on consistent results."

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

═══════════════════════════════════════════════════════════════

FULL GENERATED TEXT (from first humanization):
"""
${originalText}
"""

AI detectors flagged specific sentences above. This text scored ${avgScore.toFixed(2)}% AI-generated overall.

YOUR TASK: Improve ONLY the flagged sentences below while:
- Making each flow naturally with contextBefore and contextAfter
- Maintaining coherence with the full text
- Preserving all facts and meaning
- Applying all humanization techniques above

OUTPUT FORMAT:
Return JSON exactly as: {"rewrites":[{"original":"<original sentence>","improved":"<improved sentence>"}]}
No extra text, explanations, or code blocks. Use plain ASCII only.

FLAGGED SENTENCES TO IMPROVE (with surrounding context for flow):
${flaggedWithContext
  .map(
    (item, i) =>
      `${i + 1}. Original: "${item.sentence}"
   AI Detection Score: ${item.score.toFixed(1)}%
   Context before: "${item.before}"
   Context after: "${item.after}"`,
  )
  .join("\n\n")}
`,
          },
        ],
      }),
    });

    if (!response.ok) {
      console.error("Refinement failed:", response.status);
      return originalText;
    }

    const data = await response.json();
    let responseText = data.choices?.[0]?.message?.content || "";

    // Clean up markdown code blocks if present
    responseText = responseText
      .replace(/```json\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();

    const rewrites = JSON.parse(responseText);

    if (!rewrites.rewrites || !Array.isArray(rewrites.rewrites)) {
      console.error("Invalid rewrite format");
      return originalText;
    }

    // Replace each original sentence with its improved version
    let refinedText = originalText;
    rewrites.rewrites.forEach((rewrite: { original: string; improved: string }) => {
      refinedText = refinedText.replace(rewrite.original, rewrite.improved);
    });

    return refinedText;
  } catch (error) {
    console.error("Refinement error:", error);
    return originalText;
  }
}

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

YOUR MISSION: Make text pass AI detectors (GPTZero, Turnitin, Sapling, ZeroGPT, Copyleaks, Skyline) with a score BELOW 8% AI detection.

═══════════════════════════════════════════════════════════════
AI DETECTION PATTERNS — WHAT TRIGGERS FLAGS
═══════════════════════════════════════════════════════════════

1. UNIFORM SYNTAX & STRUCTURE (Low Burstiness)
   ❌ BAD: "The project was successful. The results were impressive. The team was happy. The clients were satisfied."
   ✅ GOOD: "The project succeeded. Results? Impressive. And the team couldn't be happier — clients loved it too."
   
   WHY: AI writes uniform 24-25 word sentences. Humans mix 3-word, 10-word, and 28-word sentences randomly.

2. REPETITIVE PHRASES & KEYWORDS
   ❌ NEVER USE:
   • "In today's world" / "In the digital age" / "In this day and age"
   • "Before delving into" / "Before diving into"
   • "It is important to note that" / "It's worth noting that"
   • "An integral part" / "Woven into the fabric of"
   • "Unlock the power of" / "Look no further" / "Game-changer"
   • "Revolutionary" / "Cutting-edge" / "State-of-the-art"
   • "Furthermore" / "Moreover" / "Additionally" (too formal)
   
   ✅ INSTEAD USE: "So," "Plus," "Also," "And," "But," "That said," "Here's why"

3. OVERLY FORMAL/ROBOTIC TONE
   ❌ BAD: "One must consider the implications of this methodology"
   ✅ GOOD: "Think about what this method actually means"
   
   ❌ BAD: "It has been observed that the implementation yields favorable outcomes"
   ✅ GOOD: "This approach works. Well, actually."
   
   WHY: AI uses perfect grammar, no contractions, archaic phrasing. Humans use contractions, casual language, minor "imperfections."

4. LACK OF PERSONAL DETAIL/CREATIVITY
   ❌ BAD: "Studies show this is effective"
   ✅ GOOD: "A 2024 Stanford study found this cut errors by 40%"
   
   ❌ BAD: "This method has many benefits"
   ✅ GOOD: "When I first tried this, I was shocked — response times dropped from 2 hours to 15 minutes"
   
   WHY: AI stays abstract. Humans add names, dates, anecdotes, specifics.

5. LIMITED HEDGING & NUANCE
   ❌ BAD: "This solution works perfectly for all cases"
   ✅ GOOD: "This solution seems to work well in most scenarios — though edge cases can be tricky"
   
   ADD: perhaps, might, suggests, appears, likely, probably, seems, tends to

6. SHALLOW CONTENT COVERAGE
   ❌ BAD: Generic overviews without depth
   ✅ GOOD: Specific insights, edge cases, examples, original analysis

7. EXCESSIVE KEYWORD DENSITY
   ❌ BAD: Repeating "AI humanizer" 15 times in 300 words
   ✅ GOOD: "AI humanizer" → "the tool" → "this approach" → "text rewriter"

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
PATTERNS TO ABSOLUTELY ELIMINATE
═══════════════════════════════════════════════════════════════

OPENING PHRASES — NEVER USE:
❌ "In today's world..."
❌ "In the digital age..."
❌ "Before delving into..."
❌ "It is important to note that..."
❌ "In this day and age..."

TRANSITIONS — AVOID:
❌ "Furthermore," "Moreover," "Additionally," "Consequently"
✅ Use: "Plus," "Also," "And," "So," "But," "Beyond that"

CLICHÉS — ELIMINATE:
❌ "revolutionize," "game-changer," "cutting-edge," "state-of-the-art"
❌ "unlock the power," "take it to the next level," "low-hanging fruit"
❌ "synergy," "paradigm shift," "think outside the box"

ROBOTIC PHRASES — REMOVE:
❌ "One must consider..."
❌ "It has been observed that..."
❌ "The aforementioned..."
❌ "In conclusion, it can be stated..."

═══════════════════════════════════════════════════════════════
BEFORE & AFTER EXAMPLES
═══════════════════════════════════════════════════════════════

EXAMPLE 1:
❌ BEFORE (100% AI-flagged):
"In today's digital landscape, social media has become an integral part of modern communication. Furthermore, it enables users to connect globally. Moreover, it facilitates the sharing of information in real-time. Additionally, businesses leverage these platforms for marketing purposes."

✅ AFTER (Human-like):
"Social media's everywhere now. It connects people across continents — instantly. You share something, and boom, it's live. Businesses? They've caught on too, using these platforms to reach customers in ways traditional ads never could."

EXAMPLE 2:
❌ BEFORE (AI-detected):
"It is important to note that this methodology yields favorable outcomes. Before delving into the specifics, one must understand the foundational principles. The implementation of this approach has demonstrated considerable efficacy across multiple use cases."

✅ AFTER (Human-like):
"This method works. Really well, actually. But here's the thing — you need to grasp the basics first. Once you do? You'll see it delivers results across different scenarios. We've tested it extensively."

EXAMPLE 3:
❌ BEFORE (Robotic):
"The system provides comprehensive functionality. The system offers advanced features. The system ensures optimal performance. The system delivers reliable results."

✅ AFTER (Natural):
"This system does it all. Advanced features? Check. Performance? Optimized. And reliability? That's where it really shines — you can count on consistent results."

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
        .replace(/[“”]/g, '"')
        .replace(/[‘’]/g, "'")
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

    console.log("Text humanized successfully, now running AI detection...");

    // Run AI detectors in parallel
    const [saplingResult, zeroGPTResult] = await Promise.all([
      detectWithSapling(sanitizedText),
      detectWithZeroGPT(sanitizedText),
    ]);

    console.log("Detection results:", {
      sapling: saplingResult?.score,
      zerogpt: zeroGPTResult?.score,
    });

    // Calculate average score
    const scores = [];
    if (saplingResult) scores.push(saplingResult.score);
    if (zeroGPTResult) scores.push(zeroGPTResult.score);

    const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

    console.log("Average AI detection score:", avgScore.toFixed(2) + "%");

    let finalText = sanitizedText;
    let refinementApplied = false;

    // If score > 8%, refine the flagged sections
    if (avgScore > 8) {
      console.log("Score above 8%, refining flagged sections...");

      // Collect flagged sections from both detectors with scores
      const flaggedSectionsData: Array<{ sentence: string; score: number }> = [];

      // Add high-scoring sentences from Sapling
      if (saplingResult?.sentenceScores) {
        saplingResult.sentenceScores.forEach((sent: any) => {
          if (sent.score > 0.8) {
            // High confidence AI-generated
            flaggedSectionsData.push({
              sentence: sent.sentence,
              score: sent.score * 100, // Convert to percentage
            });
          }
        });
      }

      // Add flagged sentences from ZeroGPT (estimate high score for flagged items)
      if (zeroGPTResult?.flaggedSentences) {
        zeroGPTResult.flaggedSentences.forEach((sentence: string) => {
          // Check if not already added from Sapling
          if (!flaggedSectionsData.find((item) => item.sentence === sentence)) {
            flaggedSectionsData.push({
              sentence,
              score: 85, // Estimated high score for ZeroGPT flagged items
            });
          }
        });
      }

      if (flaggedSectionsData.length > 0) {
        finalText = await refineFlaggedSections(sanitizedText, flaggedSectionsData, avgScore);
        refinementApplied = true;
        console.log("Refinement complete. Running final detection check...");

        // Run AI detection one more time on the refined text
        const [finalSaplingResult, finalZeroGPTResult] = await Promise.all([
          detectWithSapling(finalText),
          detectWithZeroGPT(finalText),
        ]);

        // Calculate final average score
        const finalScores = [];
        if (finalSaplingResult) finalScores.push(finalSaplingResult.score);
        if (finalZeroGPTResult) finalScores.push(finalZeroGPTResult.score);

        const finalAvgScore = finalScores.length > 0 ? finalScores.reduce((a, b) => a + b, 0) / finalScores.length : 0;

        console.log("Final detection results after refinement:", {
          sapling: finalSaplingResult?.score,
          zerogpt: finalZeroGPTResult?.score,
          average: finalAvgScore.toFixed(2) + "%",
        });

        if (finalAvgScore > 8) {
          console.log("WARNING: Final score still above 8% after refinement");
        } else {
          console.log("SUCCESS: Final score is now below 8%");
        }
      }
    } else {
      console.log("Score below 8%, no refinement needed");
    }

    return new Response(
      JSON.stringify({
        humanizedText: finalText,
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
