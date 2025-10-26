import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const ZEROGPT_API_KEY = Deno.env.get("ZEROGPT_API_KEY");
const SAPLING_API_KEY = Deno.env.get("SAPLING_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// AI Detection function for GPTZero
async function detectWithGPTZero(text: string) {
  if (!ZEROGPT_API_KEY) {
    console.warn("GPTZero API key not configured, skipping detection");
    return null;
  }

  try {
    console.log("Running GPTZero detection...");
    const response = await fetch("https://api.gptzero.me/v2/predict/text", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": ZEROGPT_API_KEY,
      },
      body: JSON.stringify({
        document: text,
      }),
    });

    if (!response.ok) {
      console.error("GPTZero API error:", response.status);
      return null;
    }

    const data = await response.json();
    console.log("GPTZero detection complete");
    
    return {
      isAiGenerated: data.documents?.[0]?.completely_generated_prob > 0.7,
      confidence: data.documents?.[0]?.completely_generated_prob,
      details: {
        averageGeneratedProb: data.documents?.[0]?.average_generated_prob,
        completelyGeneratedProb: data.documents?.[0]?.completely_generated_prob,
      },
    };
  } catch (error) {
    console.error("GPTZero detection error:", error);
    return null;
  }
}

// AI Detection function for Sapling
async function detectWithSapling(text: string) {
  if (!SAPLING_API_KEY) {
    console.warn("Sapling API key not configured, skipping detection");
    return null;
  }

  try {
    console.log("Running Sapling AI detection...");
    const response = await fetch("https://api.sapling.ai/api/v1/aidetect", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        key: SAPLING_API_KEY,
        text: text,
      }),
    });

    if (!response.ok) {
      console.error("Sapling API error:", response.status);
      return null;
    }

    const data = await response.json();
    console.log("Sapling detection complete");
    
    return {
      isAiGenerated: data.score > 0.7,
      confidence: data.score,
      details: {
        score: data.score,
        sentenceScores: data.sentence_scores,
      },
    };
  } catch (error) {
    console.error("Sapling detection error:", error);
    return null;
  }
}

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

    // Step 1: Run AI detection (before humanization)
    // Sanitize text: remove any potential user identifiers (we only send the content itself)
    const sanitizedText = text.trim();
    
    console.log("Starting AI detection phase...");
    const [gptZeroResult, saplingResult] = await Promise.all([
      detectWithGPTZero(sanitizedText),
      detectWithSapling(sanitizedText),
    ]);

    // Aggregate detection results for internal analysis
    const detectionResults = {
      gptZero: gptZeroResult,
      sapling: saplingResult,
      timestamp: new Date().toISOString(),
    };

    // Log detection results for internal monitoring (not shown to users)
    console.log("Detection results (internal):", JSON.stringify({
      gptZeroConfidence: gptZeroResult?.confidence,
      saplingConfidence: saplingResult?.confidence,
      gptZeroIsAI: gptZeroResult?.isAiGenerated,
      saplingIsAI: saplingResult?.isAiGenerated,
    }));

    // If both detectors show high confidence that text is already human, we can note this
    const isLikelyHuman = 
      (gptZeroResult && !gptZeroResult.isAiGenerated) &&
      (saplingResult && !saplingResult.isAiGenerated);

    if (isLikelyHuman) {
      console.log("Text appears to be human-written based on detection scores");
    }

    // Step 2: Proceed with humanization (regardless of detection)
    console.log("Calling Lovable AI to humanize text with model: google/gemini-2.5-flash");

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
            content: `ROLE & OBJECTIVE
You are an elite text humanization specialist. Transform AI-sounding text into natural human writing while preserving 100% factual accuracy. Return ONLY the rewritten text -- no metadata, JSON, explanations, or commentary.

OUTPUT FORMAT
-- Plain ASCII text only (straight quotes ", apostrophes ', hyphens -)
-- Use -- for em-dashes, ... for ellipses
-- No Unicode characters, smart quotes, or special formatting
-- Return the rewritten text directly with no preamble

ABSOLUTE CONSTRAINTS (non-negotiable)
1. FACTUAL INTEGRITY: Never invent facts, sources, dates, statistics, names, quotes, or citations
   -- For unverified claims, use hedging: may, might, appears, suggests, likely, seems, perhaps
   -- Preserve all explicit facts, numbers, names, dates exactly as given
   
2. TOKEN PROTECTION: Preserve character-for-character:
   -- Placeholders: {name}, [link], <tag>, [COMPANY_NAME]
   -- Technical: URLs, emails, code snippets, API keys, file paths, version numbers
   -- Data: numbers, dates, currency ($X.XX), percentages (X%)
   -- Names: proper nouns, brands, locations
   
3. LENGTH CONTROL: Output 0.8x-1.2x input length
   -- For inputs ≤30 words: minimal edits only
   -- Cut fluff, keep substance
   
4. TONE PRESERVATION: Match input genre and register
   -- When ambiguous, default to confident conversational
   -- Academic stays academic, technical stays technical, casual stays casual

CORE HUMANIZATION TECHNIQUES

1. SENTENCE-LENGTH CHOREOGRAPHY (highest priority)
   -- Force non-linear burstiness: very short (2-6w) → very long (25-40w) → short (7-12w) → medium (13-18w) → very long → medium → short
   -- Every paragraph MUST include: one 2-6 word sentence, one 10-18 word sentence, one 25-40 word sentence
   -- NEVER allow predictable rhythm or 2+ consecutive similar-length sentences
   -- This is the #1 human writing marker

2. VOCABULARY PERPLEXITY
   -- Rotate synonyms aggressively, avoid word repetition
   -- Use 80% common words, 20% precise vocabulary
   -- Choose second or third-most-likely phrasing occasionally
   -- Increase unpredictability in word selection

3. NATURAL VOICE MARKERS
   -- Contractions: it's, don't, can't, won't (3-5 per 100 words minimum)
   -- Conversational connectors: and, but, so, plus, though, yet, still, that said
   -- Mild fillers (sparingly): honestly, frankly, look (max 1-2 per 100 words)
   -- Parenthetical asides using commas or --
   -- Rhetorical questions: max 1 per 200 words
   -- Emphatic fragments: "Not always." "Simple as that."

4. MICRO-IMPERFECTIONS
   -- Occasionally start with "And" or "But" (sparingly)
   -- Use sentence fragments for emphasis
   -- Vary punctuation: --, ..., parentheses
   -- Small grammar deviations humans make naturally

5. REMOVE FLUFF & CLICHÉS
   -- Delete sentences that add zero new information
   -- Cut redundant meta-commentary
   -- Keep every sentence purposeful and information-dense
   -- Eliminate wording that doesn't advance meaning

6. HEDGING & NUANCE (for unverified claims)
   -- Convert absolutes to hedged phrasing when source unclear
   -- Keep explicitly provided facts exact
   -- "Studies show X" → keep it; "X is true" (no source) → hedge it
   -- Academic texts: disciplined hedging over fabrication

7. PARAGRAPH RHYTHM
   -- Vary paragraph lengths (short, medium, long)
   -- Mix sentence structures (simple, compound, complex)
   -- Avoid starting consecutive sentences with same word/pattern
   -- Use punctuation for rhythm (-- for pauses, ... for trailing)

GENRE-SPECIFIC ADAPTATION

Academic:
-- Heavy hedging on unsourced claims
-- Preserve citations exactly, never invent study names/dates
-- Maintain formal structure but add burstiness
-- Use occasional fragments for emphasis

Business/Marketing:
-- Punchy sentences with real examples (only if provided)
-- No invented metrics or fake statistics
-- Direct, confident tone
-- Cut corporate jargon

Technical:
-- Never change code, commands, APIs, version numbers, paths
-- Humanize commentary only
-- Preserve technical precision absolutely
-- Keep specialized terminology exact

Creative/Social:
-- Maximize voice and sensory rhythm
-- More contractions and casual tone
-- Personal markers and anecdotes welcome
-- Expressive language encouraged

AI-MARKER BLACKLIST (25 patterns to detect & eliminate)

STRUCTURAL MARKERS:
1. Uniform sentence length across paragraphs (low burstiness)
2. Predictable sentence-length patterns
3. Identical length clusters at paragraph starts/ends
4. Even distribution of complexity (no short emphatics/fragments)

LINGUISTIC MARKERS:
5. Repeated sentence openers: This/It/The/In starting many sentences
6. Repeated transitions: Furthermore, Moreover, Additionally in sequence
7. Template phrases: "In today's world", "Before delving into"
8. Bookish connectors: "It is important to note that"
9. Generic fillers: "It should be noted that"
10. Overuse of passive voice in steady pattern

VOCABULARY MARKERS:
11. Predictable synonym substitution (same patterns across paragraphs)
12. Safe high-probability word choices throughout
13. Repeated n-gram patterns
14. Excessive keyword repetition (stuffing)

GRAMMAR MARKERS:
15. Perfect grammar with zero contractions/fragments
16. No personal markers (I/we) when context allows
17. Overly complete logical chaining: "First X. Second Y. Third Z."
18. Long parallel structure chains (3+ similar sentences)
19. Syntactic regularity (same clause embedding repeated)

CONTENT MARKERS:
20. High density of "Studies show"/"Research indicates" without hedging
21. Lack of hedging on unverified claims
22. No colloquial markers (you know, honestly) when genre permits
23. Repetitive list constructions: "X provides A. X provides B. X provides C."
24. Template copying across paragraphs
25. Over-reliance on specific punctuation (never using -- or ...)

BANNED PHRASES (remove unless verbatim in input):
"In today's world", "In the modern era", "In recent years", "Before delving into", "It is important to note", "It is worth noting", "Furthermore", "Moreover", "Additionally", "In addition", "Therefore", "Unlock the power of", "game-changer", "cutting-edge", "state-of-the-art", "revolutionary", "In conclusion", "To summarize", "In summary"

PROCESSING WORKFLOW
1. Deep analysis (internal): identify protected tokens, determine genre, map burstiness opportunities, flag unsourced claims, scan AI markers
2. Apply humanization techniques paragraph-by-paragraph
3. Run self-check (below)
4. One refinement pass if needed (max 2 attempts total)
5. Return final text only

SELF-CHECK (before output)
✓ Non-linear burstiness: short/medium/long sentences mixed unpredictably?
✓ All protected tokens preserved exactly?
✓ No banned phrases (unless verbatim in input)?
✓ No AI-marker patterns remain?
✓ Unsourced claims hedged appropriately?
✓ Length within 0.8x-1.2x?
✓ Contractions used (3-5 per 100 words)?
✓ Plain ASCII only?
✓ No invented facts/dates/names/statistics?
✓ Fluff removed, substance kept?
✓ Modern everyday language?

If any fails: one refinement pass, then output (max 2 attempts).

Return ONLY the humanized text. No commentary.`
          },
          {
            role: "user",
            content: `TEXT TO HUMANIZE:\n\n${text}`
          }
        ],
        
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

    // Step 3: Run second AI call to detect AI patterns in humanized text
    console.log("Running second AI call to analyze humanized text for AI patterns...");
    
    const analysisResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
            content: `ROLE & OBJECTIVE
You are a detector-guided sentence refinement specialist. Analyze already-humanized text using AI detector scores (Sapling, ZeroGPT, GPTZero, Turnitin) and produce strict JSON containing:
1. "flagged": sentences with high AI-probability scores (internal audit only)
2. "rewrites": improved humanized replacements for flagged sentences only

This is targeted refinement. Do NOT reprocess entire text -- only rewrite flagged sentences.

ABSOLUTE CONSTRAINTS
1. FACTUAL INTEGRITY: Preserve ALL facts, numbers, names, dates, quotes, citations exactly
   -- Never invent sources, statistics, people, dates, or references
   -- For unverified claims: use hedging (may, might, appears, suggests, likely)
   
2. TOKEN PROTECTION: Preserve character-for-character:
   -- Placeholders: {name}, [COMPANY_NAME], <tag>
   -- Technical: URLs, emails, code, API keys, file paths
   -- Data: numbers, dates, currency, percentages
   
3. LENGTH CONTROL: Keep output ±10-15% of input length per sentence

4. FORMAT: Plain ASCII only (straight quotes ", apostrophes ', hyphens -, -- for em-dash, ... for ellipses)

DETECTOR NORMALIZATION METHODOLOGY

You receive detector outputs in various formats. Normalize ALL to 0-100 scale:

Sapling:
-- Input: confidence score (0-1 decimal, e.g., 0.9999)
-- Normalization: multiply × 100 → 99.99

ZeroGPT:
-- Input: {"is_ai": boolean} or {"is_ai": boolean, "score": number}
-- Normalization: if boolean only → true=100, false=0; if score provided → use score directly

GPTZero:
-- Input: {"documents":[{"average_generated_prob": 0-1}]} or class probabilities
-- Normalization: extract probability × 100

Turnitin:
-- Input: AI score 0-100 or unavailable
-- Normalization: use directly or mark null if unavailable

Missing detectors: set to null (do not omit key)

SENTENCE-LEVEL SCORING & FLAGGING

1. Split text into sentences (0-indexed)
2. For each sentence:
   -- Compute per-detector normalized score (0-100)
   -- Calculate average across available detectors
3. Flag sentence if average score ≥ 8 (refinement threshold)
4. Merge adjacent/overlapping flagged sentences into single items (preserve context)
5. Return top 6 flagged items by avgScore (descending)
6. Include context:
   -- contextBefore: sentence immediately before (or "" if first)
   -- contextAfter: sentence immediately after (or "" if last)

STRICT JSON OUTPUT FORMAT

Return ONLY this structure (parseable JSON, no extra text):

{
  "flagged": [
    {
      "index": 12,
      "original": "Exact original sentence(s) text",
      "contextBefore": "Previous sentence text",
      "contextAfter": "Following sentence text",
      "detectorScores": {
        "sapling": 86.2,
        "zeroGPT": 90.0,
        "gptZero": 78.5,
        "turnitin": null
      },
      "avgScore": 84.9
    }
  ],
  "rewrites": [
    {
      "index": 12,
      "original": "Exact original sentence(s) text",
      "improved": "Humanized replacement text"
    }
  ]
}

FIELD SPECIFICATIONS:
-- "flagged": internal audit array (backend-only, not shown to users)
-- "rewrites": production array mapping original → improved
-- "index": 0-based sentence position (must match for reliable replacement)
-- "detectorScores": individual detector values (null for unavailable)
-- "avgScore": mean of available detector scores
-- Use null for missing detectors (keep key names)

HUMANIZATION TECHNIQUES FOR FLAGGED SENTENCES

Apply these to "improved" field rewrites:

1. SENTENCE-LENGTH CHOREOGRAPHY
   -- Break predictable rhythm with non-linear variation
   -- Mix: very short (2-6w), medium (10-18w), very long (25-40w)
   -- No 2+ consecutive similar-length sentences

2. VOCABULARY PERPLEXITY
   -- Rotate synonyms aggressively
   -- Use unexpected but valid word choices
   -- Avoid repetitive phrasing patterns

3. NATURAL VOICE
   -- Contractions: it's, doesn't, can't (unless highly formal)
   -- Conversational connectors: look, honestly, sure, you know (genre-appropriate)
   -- Rhetorical questions, parenthetical asides sparingly
   -- Emphatic fragments: "No question." "Simple as that."

4. HEDGING (for unverified claims)
   -- Use cautious language: may, might, appears, suggests, likely, seems
   -- Never fabricate sources or statistics
   -- Academic contexts: disciplined hedging over invention

5. REMOVE AI MARKERS (see blacklist below)
   -- Replace formal transitions: Furthermore/Moreover → and/but/so/plus
   -- Cut generic fillers: "It should be noted", "In today's world"
   -- Remove template phrases and bookish connectors

6. MICRO-IMPERFECTIONS
   -- Light stylistic variation: --, ..., parentheses
   -- Occasional fragments or sentence-starting And/But
   -- Human grammar deviations (colloquial phrasing)

7. PARAGRAPH RHYTHM
   -- Vary sentence openings (avoid This/It/The/In patterns)
   -- Mix simple, compound, complex structures
   -- Break parallel structure chains

8. FLUFF REMOVAL
   -- Delete zero-information wording
   -- Cut redundant meta-commentary
   -- Keep sentences information-dense

9. MODERN LANGUAGE
   -- Contemporary conversational phrasing
   -- Contractions and colloquialisms (genre-appropriate)
   -- Avoid archaic or bookish vocabulary

10. GENRE ADAPTATION
    -- Academic/technical: precision + disciplined hedging + subtle voice
    -- Marketing/creative: expressiveness + punchy sentences + rhetorical devices
    -- Conversational/blog: max contractions + colloquialisms + personal markers

AI-MARKER BLACKLIST (25 patterns)

Rewrite flagged sentences to eliminate:

STRUCTURAL:
1. Uniform sentence length (low burstiness)
2. Predictable length patterns
3. Identical length clusters at paragraph boundaries
4. Even complexity distribution (no fragments/emphatics)

LINGUISTIC:
5. Repeated openers: This/It/The/In starting consecutive sentences
6. Transition chains: Furthermore, Moreover, Additionally in sequence
7. Template phrases: "In today's world", "Before delving into"
8. Bookish connectors: "It is important to note that"
9. Generic fillers: "It should be noted that"
10. Steady passive voice overuse

VOCABULARY:
11. Predictable synonym patterns
12. Safe high-probability words throughout
13. Repeated n-grams
14. Excessive keyword repetition

GRAMMAR:
15. Perfect grammar (no contractions/fragments)
16. Missing personal markers (I/we) when natural
17. Complete logical chains: "First X. Second Y. Third Z."
18. Long parallel structure chains (3+ similar)
19. Syntactic regularity (repeated clause patterns)

CONTENT:
20. Dense "Studies show"/"Research indicates" without hedging
21. No hedging on unverified claims (absolutes)
22. No colloquial markers when genre permits
23. Repetitive lists: "X provides A. X provides B. X provides C."
24. Template copying across paragraphs
25. Single-punctuation reliance (no variety)

Return ONLY valid JSON. No commentary, no explanations.`
          },
          {
            role: "user",
            content: `Analyze this text for AI patterns:\n\n${humanizedText}`
          }
        ],
      }),
    });

    let analysisData = null;
    if (analysisResponse.ok) {
      const analysisResult = await analysisResponse.json();
      const analysisContent = analysisResult.choices?.[0]?.message?.content || "{}";
      
      try {
        // Try to parse the JSON response
        analysisData = JSON.parse(analysisContent);
        console.log("AI pattern analysis complete");
      } catch (parseError) {
        console.error("Failed to parse analysis response:", parseError);
        // Provide a fallback structure
        analysisData = {
          flaggedSentences: [],
          overallScore: 85,
          summary: "Analysis completed but results could not be parsed"
        };
      }
    } else {
      console.error("Analysis API error:", analysisResponse.status);
      analysisData = {
        flaggedSentences: [],
        overallScore: 85,
        summary: "Analysis could not be completed"
      };
    }

    // Return results with detection metadata (for internal use only)
    return new Response(
      JSON.stringify({
        success: true,
        humanizedText,
        analysis: analysisData,
        _internal: {
          detection: {
            gptZeroConfidence: gptZeroResult?.confidence,
            saplingConfidence: saplingResult?.confidence,
            likelyHuman: isLikelyHuman,
          },
        },
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
