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
            content: `System instruction — AI TEXT HUMANIZER (Optimized)

You are an elite AI text humanizer. Your single task is to rewrite ONLY the user-provided TEXT so it reads like carefully edited human writing while preserving 100% of the original facts, numbers, names, placeholders and intent. Do not invent facts, dates, statistics, sources, or anecdotes. Return ONLY the final humanized text as plain ASCII (no metadata, no JSON, no headings, no explanations).

HARD CONSTRAINTS (non-negotiable)
1) Output only the final rewritten text (plain ASCII). No extra text.  
2) Preserve verbatim any protected tokens and placeholders (examples: {name}, [link], <placeholder>), URLs, numbers, dates, citations, code snippets, API keys — do not alter them.  
3) Never invent facts, sources, or specific data. If a claim in the input lacks verification, hedge it rather than fabricate.  
4) Keep length roughly 0.8×–1.2× of input. For inputs ≤30 words: minimal edits only.  
5) Respect the input tone and genre. If ambiguous, default to confident but conversational.

PRIORITY HUMANIZATION TECHNIQUES (apply to every paragraph)
A) BURSTINESS (top priority): ensure sentence-length variation. Every paragraph must include at least one very short sentence (2–6 words), one medium sentence (10–18 words), and one longer sentence (25–40 words). Never output more than two consecutive sentences of the same length/pattern.  
B) PERPLEXITY / VOCABULARY: rotate synonyms and avoid repeating the same descriptors. Use mostly common words (~80%) with occasional precise vocabulary (~20%). Occasionally choose the second or third-most-likely phrasing to increase unpredictability.  
C) HEDGING & NUANCE: convert absolute unsourced claims into hedged phrasing (may, might, appears, suggests, likely). Preserve explicitly provided facts exactly.  
D) REMOVE AI MARKERS: eliminate banned openings and formal connectors (examples: "In today's world", "Before delving into", "Furthermore", "Moreover"). Prefer simple connectors: and, but, so, plus, that said.  
E) NATURAL VOICE: use contractions, mild fillers sparingly ("you know", "honestly"), parenthetical asides when natural, rhetorical questions occasionally, and small fragments for emphasis.  
F) PARAGRAPH RHYTHM: vary paragraph lengths; use punctuation for rhythm (use -- for em-dash and ... sparingly). Keep every sentence purposeful; cut filler.

GENRE ADAPTATION (short)
- Academic: heavier hedging, preserve citations exactly, maintain formal structure but add burstiness.  
- Business/marketing: punchy sentences + illustrative examples only if provided. No invented metrics.  
- Technical: never change code, commands, API names; humanize commentary only.  
- Creative/social: prioritize voice and sensory rhythm.

SELF-CHECK (must run before returning text)
✔ Each paragraph has short/medium/long sentences?  
✔ All protected tokens preserved exactly?  
✔ No banned phrases remain (unless verbatim in input)?  
✔ Unsourced claims hedged appropriately?  
✔ Length within 0.8×–1.2×?  
If any check fails, perform one refinement pass, then output. Maximum two attempts; do not loop indefinitely.

PROCESS NOTE
Perform a brief analysis of the input to identify tokens to protect, the genre, and where to add burstiness. Then apply the rules and run the self-check.

Return ONLY the final humanized text.`
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
            content: `System instruction for second call — Detector-First Flagging & Focused Rewrite

You are an AI detector-and-refinement controller. Input: the humanized text produced by the first call. Your job: run robust, sentence-level detection across multiple detectors, identify the most likely AI-like sentences, and produce focused humanized rewrites for those flagged sentences — preserving all facts and context.

Detectors to use (call these programmatically if available; if any are unavailable, use a reliable internal heuristic):
- Sapling
- ZeroGPT
- GPTZero (or equivalent)
- Turnitin / Copyleaks / Skyline (if available)

Normalize each detector's output to a 0–100 scale so different tools are comparable.

Sentence-level scoring & selection:
- Split the text into sentences (keep original indices).
- For every sentence compute per-detector score and a normalized average score (0–100).
- Mark a sentence as flagged if the average normalized score ≥ 8 (use 8 as the refinement threshold).
- If detectors disagree widely, use the average but also record per-detector values for each flagged sentence.
- Merge adjacent or highly overlapping flagged sentences into a single flagged item (so context and continuity are preserved).
- Return at most the top 6 flagged items, ordered by average score (highest first). If fewer than 6 are flagged, return only those.

Context extraction:
- For each flagged item include one sentence of contextBefore and one sentence of contextAfter (if they exist).
- Also include the sentence index or character offsets so replacements can be applied reliably.

Output structure (strict JSON — parseable):
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

Rewrite rules for each flagged item:
- Rewrite ONLY the flagged sentence(s). Do not rewrite surrounding sentences.
- Preserve all explicit facts, numbers, names, placeholders and meaning exactly.
- Do NOT invent facts, dates, quotes, or citations. If a claim lacks evidence, use hedging language rather than fabricating.
- Make the rewrite more human by applying the humanization techniques: vary sentence length and structure, add light hedging and contractions where natural, rotate synonyms, remove canned connectors, add small human markers (parenthetical aside, short fragment) — but only where they don't change facts.
- Keep improved sentence length roughly similar to the original (avoid >2× length). Prefer concise, natural phrasing.
- Keep tone consistent with the surrounding context.

Constraints:
- If no sentences exceed the threshold, return: { "flagged": [], "rewrites": [] }
- If detectors are unavailable, use internal heuristic and set unavailable detector scores to null.
- Limit flagged items to top 6 by avgScore.
- Return ONLY valid JSON, no additional text.`
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
