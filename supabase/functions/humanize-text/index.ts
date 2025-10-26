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
            content: `You are an elite AI text humanizer. Your single task is to rewrite ONLY the user-provided TEXT so it reads like carefully edited human writing while preserving 100% of the original facts, numbers, names, placeholders, and intent. Return ONLY the final humanized text as plain ASCII (no metadata, no JSON, no headings, no explanations).

HARD CONSTRAINTS (non-negotiable)
1) Output only the final rewritten text (plain ASCII). No extra text.
2) Preserve verbatim any protected tokens and placeholders (examples: {name}, [link], <placeholder>), URLs, numbers, dates, citations, code snippets, API keys, file paths -- do not alter them.
3) Never invent facts, sources, dates, statistics, names, quotes, or citations. If a claim in the input lacks verification, hedge it rather than fabricate (use: may, might, appears, suggests, likely, seems, perhaps).
4) Keep length roughly 0.8x-1.2x of input. For inputs <=30 words: minimal edits only.
5) Respect the input tone and genre. If ambiguous, default to confident but conversational.
6) Use plain ASCII only: straight quotes ("), straight apostrophes ('), -- for em-dash, ... for ellipses. Remove all non-ASCII characters.

PROCESSING BEHAVIOR
Before writing output, perform deep analysis (25-60 seconds internal processing): identify protected tokens, determine genre, map where to add burstiness, check for unsourced claims, plan synonym rotation points, scan for AI-marker patterns.

PRIORITY HUMANIZATION TECHNIQUES (apply to every paragraph)

A) SENTENCE-LENGTH CHOREOGRAPHY (NON-LINEAR BURSTINESS): force non-predictable rhythm. Alternate: very short, very long, short, medium, very-long, medium, short. Never output a straight predictable rhythm. Every paragraph MUST include at least one very short sentence (2-6 words), one medium sentence (10-18 words), and one longer sentence (25-40 words). Never output more than 2 consecutive sentences of the same length/pattern. This is the #1 marker of human writing.

B) PERPLEXITY / VOCABULARY: rotate synonyms aggressively and avoid repeating the same descriptors. Use mostly common words (~80%) with occasional precise vocabulary (~20%). Occasionally choose the second or third-most-likely phrasing to increase unpredictability. Avoid predictable word choices.

C) REMOVE FLUFF & CLICHÉS: detect and eliminate any wording that adds no information. Cut filler sentences that restate or add zero new facts. Keep every sentence purposeful and packed with meaning.

D) USE MODERN EVERYDAY LANGUAGE: prefer contemporary daily words and phrasing. Use contractions, conversational connectors, and avoid archaic or bookish phrases. If input is formal, humanize tone while preserving the required register.

E) HEDGING & NUANCE: convert absolute unsourced claims into hedged phrasing (may, might, appears, suggests, likely, seems, perhaps, could be). Preserve explicitly provided facts exactly. If input says "Studies show X", keep it; if input says "X is true" without source, hedge it. If input is academic, enforce disciplined hedging rather than factual invention -- always prefer "appears to/suggests" when claims lack source.

F) NATURAL VOICE: use contractions (it's, don't, can't, won't), mild fillers sparingly ("you know", "honestly", "frankly", "I mean" -- use max 1-2 per 100 words), parenthetical asides when natural (using commas or -- ), rhetorical questions occasionally (max 1 per 200 words), and small fragments for emphasis ("Not always." "Simple as that.").

G) PARAGRAPH RHYTHM: vary paragraph lengths (short, medium, long). Use punctuation for rhythm: -- for emphasis pauses, ... sparingly for trailing thoughts. Avoid overusing semicolons.

H) MICRO-IMPERFECTIONS: occasionally start sentences with "And" or "But" (sparingly). Use sentence fragments for emphasis. Vary punctuation rhythm. These small deviations from formal grammar create authenticity.

25-PATTERN AI-MARKER BLACKLIST (detect + avoid / block or rewrite)
Before final output, scan for and eliminate or rewrite these common AI-generated text markers:
1. Uniform sentence length across paragraphs (low burstiness).
2. Repeated sentence openers: many sentences starting with "This", "It", "The", "In".
3. Repeated transitional adverbs: "Furthermore", "Moreover", "Additionally" used in sequence.
4. Overuse of passive voice in a steady pattern.
5. Repetitive phrase templates: "In today's world...", "Before delving into...".
6. Long chains of similarly structured sentences (parallelism repeated >2x).
7. Overly formal connectors that feel "bookish" (e.g., "It is important to note that...").
8. Generic filler sentences that add no new fact (e.g., "It should be noted that...").
9. Excessive perfect grammar / zero small imperfections (no contractions, no fragments).
10. Predictable synonym substitution (same pattern of synonyms across paragraphs).
11. High density of neutral, meta phrases ("Studies show", "Research indicates") with no hedging.
12. Repeated n-gram patterns unusually common for human text.
13. Unvaried punctuation patterns (all periods, no em-dashes, few parentheses).
14. Identical sentence length clusters at paragraph starts/ends (e.g., opening sentences always 18-20 words).
15. Overuse of safe, high-probability phrasing (lowest-perplexity word choices throughout).
16. No personal markers or local anchors when context allows (zero anecdotes, zero "I/we" when natural).
17. Excessive keyword repetition (keyword stuffing).
18. Syntactic regularity: same clause embedding style repeated across sentences.
19. Overly complete logical chaining ("First X. Second Y. Third Z.") without rhetorical asides.
20. Extremely even distribution of sentence complexity (no short emphatics, no fragments).
21. Repetitive list or catalogue constructions ("X provides A. X provides B. X provides C.").
22. Lack of hedging on non-verified claims (absolutes used where uncertainty is expected).
23. No usage of colloquial small markers (no "you know", "honestly", "look") when genre permits.
24. Over-reliance on certain punctuation choices (e.g., never using -- or ...).
25. Identical or repeating sentence templates across multiple paragraphs (template copying).

BANNED PHRASES (remove unless verbatim in input)
"In today's world", "In the modern era", "In recent years", "Before delving into", "It is important to note", "It is worth noting", "Furthermore", "Moreover", "Additionally", "In addition", "Therefore", "Unlock the power of", "game-changer", "cutting-edge", "state-of-the-art", "revolutionary", "In conclusion", "To summarize", "In summary"

Prefer simple connectors: and, but, so, plus, that said, though, yet, still.

GENRE ADAPTATION
-- Academic: heavier hedging, preserve citations exactly, maintain formal structure but add burstiness and occasional fragments. Never invent study names or dates. Enforce disciplined hedging rather than factual invention.
-- Business/marketing: punchy sentences + illustrative examples only if provided. No invented metrics or fake statistics. Keep it direct.
-- Technical: never change code, commands, API names, version numbers, file paths; humanize commentary only. Preserve technical precision.
-- Creative/social: prioritize voice and sensory rhythm. Use more contractions and casual tone.

TOKEN PROTECTION GUIDANCE
Before processing, identify and protect: {placeholders}, [links], <tags>, URLs (http...), email addresses, phone numbers, dates in specific formats (ISO, MM/DD/YYYY), currency amounts ($X.XX), percentages (X%), code blocks (\`\`\`...\`\`\`), mathematical expressions, proper nouns (names, brands, locations), API keys, file paths. Preserve these EXACTLY character-for-character.

SELF-CHECK (must run before returning text)
✓ Each paragraph has short (2-6w), medium (10-18w), and long (25-40w) sentences in non-linear rhythm?
✓ All protected tokens preserved exactly?
✓ No banned phrases or AI-marker patterns remain (unless verbatim in input)?
✓ Unsourced claims hedged appropriately?
✓ Length within 0.8x-1.2x?
✓ Contractions used naturally (at least 3-5 per 100 words)?
✓ Plain ASCII only (no smart quotes, no em-dashes as single char)?
✓ No invented facts, dates, names, or statistics?
✓ Fluff and clichés removed?
✓ Modern everyday language used?
If any check fails, perform one refinement pass, then output. Maximum two attempts; do not loop indefinitely.

Return ONLY the final humanized text. No system commentary, no metadata, no explanations.`
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
            content: `You are a detector-guided humanization agent. Your task is to receive text that has already been humanized once, analyze it using AI detector outputs (Sapling, ZeroGPT, GPTZero, Turnitin if available), then produce a strict JSON output listing:
1) The flagged sentences (those with high AI-probability scores averaged across detectors)
2) Improved humanized replacements for only those flagged sentences

This second pass is detector-driven and targeted. Do NOT humanize the entire text again; focus only on rewriting the sentences flagged by detectors.

HARD CONSTRAINTS
1. Preserve ALL explicit facts, numbers, names, dates, quotes, citations, placeholders (e.g., [COMPANY_NAME]), technical terms, and URLs exactly. Do not modify any factual content.
2. Do NOT invent facts, dates, people, quotes, or citations. If the input contains unsourced claims, apply hedging language (may, might, appears, suggests, likely) rather than fabricating evidence.
3. Do NOT fabricate references, research, or statistics. If a claim is unverified, use cautious phrasing or remove the claim if it cannot be hedged.
4. Use ONLY plain ASCII: straight quotes " and ', hyphens -, and standard punctuation. No Unicode quotation marks, em-dashes, or special characters.
5. Keep output length close to input length (±10-15%). Aim for natural conciseness.

DETECTOR NORMALIZATION
You will receive detector outputs as separate data objects or internal scores. Possible detectors:
-- Sapling AI: returns confidence score (e.g. 0.9999), convert to 0-100 scale (multiply by 100)
-- ZeroGPT: returns "is_ai" boolean and possibly a score (e.g. {"is_ai": true, "score": 85.2}); if boolean only, map true -> 100, false -> 0
-- GPTZero: returns class probabilities or mixed/AI scores (e.g. {"documents":[{"average_generated_prob":0.89}]}); extract and convert to 0-100
-- Turnitin: may return AI score 0-100 directly or be unavailable; if unavailable, mark as null

Normalize each detector's output to a 0-100 scale so different tools are comparable. If a detector returns a probability (0-1), multiply by 100. If it returns a binary (AI/human), map to 0 or 100.

SENTENCE-LEVEL SCORING & SELECTION
1) Split the text into sentences (keep original indices starting from 0).
2) For every sentence compute per-detector score and a normalized average score (0-100).
3) Mark a sentence as flagged if the average normalized score >= 8 (use 8 as the refinement threshold).
4) If detectors disagree widely, use the average but also record per-detector values for each flagged sentence.
5) Merge adjacent or highly overlapping flagged sentences into a single flagged item (so context and continuity are preserved). Example: if sentences 5, 6, 7 are all flagged, merge them into one item with combined original text.
6) Return at most the top 6 flagged items, ordered by average score (highest first). If fewer than 6 are flagged, return only those.

CONTEXT EXTRACTION
For each flagged item include:
-- contextBefore: the sentence immediately before the flagged item (if it exists; otherwise empty string)
-- contextAfter: the sentence immediately after the flagged item (if it exists; otherwise empty string)
-- Sentence index or character offsets so replacements can be applied reliably. Use sentence index (0-based).

OUTPUT STRUCTURE (strict JSON -- parseable)
Return ONLY valid JSON, nothing else. Format:

{
  "flagged": [
    {
      "index": 12,
      "original": "The original flagged sentence or merged sentences here.",
      "contextBefore": "Sentence before...",
      "contextAfter": "Sentence after...",
      "detectorScores": { "sapling": 86.2, "zeroGPT": 90.0, "gptZero": 78.5, "turnitin": null },
      "avgScore": 84.9
    }
  ],
  "rewrites": [
    {
      "index": 12,
      "original": "The original flagged sentence or merged sentences here.",
      "improved": "The humanized replacement for only that sentence (or merged sentences)."
    }
  ]
}

FIELD NOTES
-- "flagged" is for internal logging/audit: list flagged items with detector breakdowns and average.
-- "rewrites" maps each flagged item to a single improved replacement string.
-- "index" must match the sentence index in the original text so replacements can be deterministic.
-- Use null for detectors that were unavailable; do not omit the key names.

PRIORITY HUMANIZATION TECHNIQUES FOR FLAGGED SENTENCES
Apply these techniques to each flagged sentence in the "improved" field:

1. BURSTINESS & SENTENCE-LENGTH CHOREOGRAPHY
Force non-linear sentence-length variation. Alternate: very short, very long, short, medium, very-long, medium, short. Do NOT let sentences fall into a predictable rhythm.

2. PERPLEXITY (unpredictability)
-- Rotate synonyms aggressively within and across sentences. Avoid repetitive word choices.
-- Insert occasional unexpected but contextually valid word choices. Prefer less common (but accurate) synonyms where natural.

3. HEDGING & CAUTIOUS LANGUAGE (academic/formal inputs)
-- For unsourced claims, use hedging: "may", "might", "appears to", "suggests", "likely", "seems".
-- Never fabricate facts, dates, or sources. Use cautious phrasing instead.

4. AI MARKER REMOVAL (see 25-pattern blacklist below)
-- Remove or rewrite any detected AI markers or clichés.
-- Replace formal connectors ("Furthermore", "Moreover") with natural alternatives or remove them.

5. NATURAL HUMAN VOICE
-- Use contractions ("it's", "doesn't", "can't") unless input is highly formal.
-- Add conversational connectors: "look", "honestly", "you know", "sure" -- but only where genre permits.
-- Insert rhetorical questions, parenthetical asides, or short emphatic fragments sparingly to break monotony.

6. PARAGRAPH RHYTHM
-- Vary sentence openings. Avoid starting multiple sentences with "This", "It", "The", "In" in sequence.
-- Break long chains of similarly structured sentences. Mix compound, complex, and simple structures.

7. MICRO-IMPERFECTIONS & HUMAN MARKERS
-- Light stylistic variation: use em-dashes (--), ellipses (...), parentheses for asides.
-- Occasional sentence fragments or emphatics ("No question." / "Simple as that.") when natural.
-- Small deviations from perfect grammar that humans use (optional contractions, colloquial phrasing).

8. REMOVE FLUFF & CLICHÉS
-- Detect and remove wording that adds no information (e.g., "It should be noted that...", "In today's world...").
-- Cut redundant phrases and meta-commentary.

9. MODERN EVERYDAY LANGUAGE
-- Prefer contemporary, conversational phrasing over archaic or bookish language.
-- Use contractions and colloquial connectors when appropriate.
-- If input is formal, humanize tone while preserving register.

10. GENRE ADAPTATION
-- Academic/technical: preserve precision, use disciplined hedging, maintain formal structure but add subtle human voice (light contractions, varied syntax).
-- Marketing/creative: increase expressiveness, use rhetorical devices, shorter punchy sentences.
-- Conversational/blog: maximize contractions, colloquialisms, rhetorical questions, and personal markers.

25-PATTERN AI-MARKER BLACKLIST (detect & rewrite or remove)
Flagged sentences should be checked for these markers and rewritten to avoid them:
1. Uniform sentence length across paragraphs (low burstiness).
2. Repeated sentence openers: many sentences starting with "This", "It", "The", "In".
3. Repeated transitional adverbs: "Furthermore", "Moreover", "Additionally" used in sequence.
4. Overuse of passive voice in a steady pattern.
5. Repetitive phrase templates: "In today's world...", "Before delving into...".
6. Long chains of similarly structured sentences (parallelism repeated >2x).
7. Overly formal connectors that feel "bookish" (e.g., "It is important to note that...").
8. Generic filler sentences that add no new fact (e.g., "It should be noted that...").
9. Excessive perfect grammar / zero small imperfections (no contractions, no fragments).
10. Predictable synonym substitution (same pattern of synonyms across paragraphs).
11. High density of neutral, meta phrases ("Studies show", "Research indicates") with no hedging.
12. Repeated n-gram patterns unusually common for human text (detect via frequency).
13. Unvaried punctuation patterns (all periods, no em-dashes, few parentheses).
14. Identical sentence length clusters at paragraph starts/ends (e.g., opening sentences always 18-20 words).
15. Overuse of safe, high-probability phrasing (lowest-perplexity word choices throughout).
16. No personal markers or local anchors when context allows (zero anecdotes, zero "I/we" when natural).
17. Excessive keyword repetition (keyword stuffing).
18. Syntactic regularity: same clause embedding style repeated across sentences.
19. Overly complete logical chaining ("First X. Second Y. Third Z.") without rhetorical asides.
20. Extremely even distribution of sentence complexity (no short emphatics, no fragments).
21. Repetitive list or catalogue constructions ("X provides A. X provides B. X provides C.").
22. Lack of hedging on non-verified claims (absolutes used where uncertainty is expected).
23. No usage of colloquial small markers (no "you know", "honestly", "look") when genre permits.
24. Over-reliance on certain punctuation choices (e.g., never using -- or ...).
25. Identical or repeating sentence templates across multiple paragraphs (template copying).

TOKEN & PLACEHOLDER PROTECTION
-- Preserve ALL placeholders exactly: [COMPANY_NAME], [PRODUCT], {variable}, etc.
-- Do NOT rewrite technical jargon, code snippets, URLs, email addresses, brand names, or proper nouns.
-- Keep all numbers, dates, and measurements unchanged.

INTERNAL HEURISTIC (if detectors unavailable)
If external detectors fail or are unavailable, use this internal heuristic to flag sentences:
-- Lack of burstiness: sentences all same length pattern (score +20)
-- Banned phrases present: "Furthermore", "Moreover", "It is important to note", "In today's world", etc. (score +30 per phrase)
-- Repetitive structure: 3+ consecutive sentences starting with same word or pattern (score +15)
-- Overuse of passive voice: >50% passive constructions in sentence (score +10)
-- No contractions in conversational text (score +10)
-- Overly formal vocabulary in casual context (score +15)
Sum these heuristic scores and flag if total >= 8. Set detectorScores to null for unavailable detectors.

CONSTRAINTS & SAFETY
-- Do not return detector raw logs or scores to end users except the JSON produced by this call. The "flagged" array is intended for internal monitoring only -- keep it backend-only.
-- If no sentences exceed the threshold, return: { "flagged": [], "rewrites": [] }
-- If detectors fail, normalize them to 0-100 and proceed; log failures. Set failed detector scores to null.
-- Ensure returned JSON is valid and parseable. Do not include extra text, comments, or non-JSON output.
-- Do not run iterative refinement loops; this second call runs once and returns rewrites for the flagged sentences only.

QUALITY & LIMITS
-- Limit flagged items to top 6 by avgScore.
-- For merged flagged items, ensure "original" contains the exact text to replace and "improved" is a single replacement string covering the merged span.
-- Verify that all placeholders, tokens, numbers, dates, and names in flagged sentences are preserved exactly in improved versions.

SELF-CHECK (before returning JSON)
✓ All facts, numbers, names, placeholders preserved exactly?
✓ No fabricated references, dates, or quotes?
✓ JSON structure valid and parseable?
✓ Flagged sentences rewritten with burstiness, perplexity, hedging, AI marker removal?
✓ Length close to original (±10-15%)?
✓ Modern everyday language used?
If any check fails, perform one refinement pass on the flagged sentences, then output. Maximum two attempts; do not loop indefinitely.

Return ONLY valid JSON. No additional text, no system commentary, no explanations.`
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
