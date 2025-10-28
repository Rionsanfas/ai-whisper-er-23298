import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const SAPLING_API_KEY = Deno.env.get("SAPLING_API_KEY");
const ZEROGPT_API_KEY = Deno.env.get("ZEROGPT_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Banned AI phrase patterns
const BANNED_PHRASES = [
  /\bin today'?s (?:world|digital age)\b/i,
  /\bit'?s worth noting (?:that)?\b/i,
  /\bit is important to note\b/i,
  /\bdelv(?:e|ing) into\b/i,
  /\bnavigat(?:e|ing) the landscape of\b/i,
  /\bin the realm of\b/i,
  /\bat the end of the day\b/i,
  /\bin conclusion\b/i,
  /\bthe fact of the matter is\b/i,
  /\bwhen it comes to\b/i,
  /\bit goes without saying\b/i,
  /\bneedless to say\b/i,
  /\bto put it simply\b/i,
  /\bas a matter of fact\b/i,
  /\bfor all intents and purposes\b/i,
  /\bbe that as it may\b/i,
  /\bin light of\b/i,
  /\bwith that being said\b/i,
  /\bit is essential to understand\b/i,
  /\bone must consider\b/i,
  /\bwoven (?:itself )?into the fabric of\b/i,
  /\bgame-changer\b/i,
  /\brevolutionary\b/i,
  /\bunlock the power of\b/i,
  /\blook no further\b/i,
  /\bcutting-edge\b/i,
  /\bstate-of-the-art\b/i,
  /\bit'?s no secret that\b/i,
];

// Scan text for banned phrases
function scanBannedPhrases(text: string): { found: boolean; matches: string[] } {
  const matches: string[] = [];
  BANNED_PHRASES.forEach((pattern) => {
    const match = text.match(pattern);
    if (match) matches.push(match[0]);
  });
  return { found: matches.length > 0, matches };
}

// Calculate burstiness histogram (sentence length variance)
function calculateBurstiness(text: string): { passed: boolean; variance: number; lengths: number[] } {
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
  const lengths = sentences.map(s => s.trim().split(/\s+/).length);
  
  if (lengths.length < 3) return { passed: true, variance: 0, lengths };
  
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const variance = lengths.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / lengths.length;
  
  // Good burstiness: variance > 30 (high variety in sentence lengths)
  return { passed: variance > 30, variance, lengths };
}

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

  // Replace placeholders in prompt template
  const refinementPrompt = `You are an expert AI text humanizer performing detector-driven refinement.

CONTEXT: This text scored {{avg_score}}% AI-generated after initial humanization.

ORIGINAL TEXT:
"""
{{original_text}}
"""

TASK: Apply TWO-PASS humanization to flagged sentences only.

PASS 1 - ANALYZE:
- Identify AI patterns in each flagged sentence
- Note violations of rigid rules below
- Plan restructuring strategy

PASS 2 - REWRITE:
- Apply the humanization to produce improved versions
- Ensure compliance with all rigid rules

=== RIGID RULES (MANDATORY) ===

A. PRESERVE FACTS & PROTECTED TOKENS
   - Never change: URLs, citations, numbers, code blocks, {{placeholders}}
   - Preserve all factual claims exactly as stated
   - If change would alter meaning or data → leave original and mark: "needs_review": true

B. REMOVE BANNED PHRASES (unless inside quotation marks)
   - "In today's world/digital age", "It's worth noting", "Delve into"
   - "Navigating the landscape", "In the realm of", "At the end of the day"
   - "Game-changer", "Revolutionary", "Unlock the power", "Look no further"
   - "Cutting-edge", "State-of-the-art", "It's no secret that"
   - Full list: see 25-pattern blacklist in guidelines

C. APPLY BURSTINESS (per paragraph)
   - Mix sentence lengths: short (5-8 words), medium (12-18), long (25-35+)
   - Each paragraph must have visible variance, not uniform rhythm
   - Alternate structure: don't repeat sentence patterns

D. RETURN JSON WITH PAIRS
   - Format: {"rewrites":[{"original":"...","improved":"...","needs_review":false}]}
   - ASCII-only output, escape " as \"
   - No markdown code blocks, no explanations

=== GUIDELINES (APPLY AS APPROPRIATE) ===

- Modern everyday language: use contractions, conversational connectors
- Remove fluff: delete phrases that add no information
- Add micro-imperfections: fragments, rhetorical questions, parenthetical asides
- Academic hedging: "appears to", "suggests", "may" (if academic tone)
- Personal touch: first-person perspective if natural
- Keyword optimization: vary terms, avoid repetition
- Match original tone/style

FLAGGED SENTENCES (with context):
{{flagged_list}}

OUTPUT: Return only valid JSON as specified in rule D.`.replace('{{avg_score}}', avgScore.toFixed(2))
    .replace('{{original_text}}', originalText)
    .replace('{{flagged_list}}', flaggedWithContext
      .map((item, i) => `${i + 1}. Original: "${item.sentence}"
   Score: ${item.score.toFixed(1)}%
   Before: "${item.before}"
   After: "${item.after}"`)
      .join('\n\n'));

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
            content: refinementPrompt,
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

    // Replace placeholders in prompt template
    const humanizePrompt = `You are an expert AI text humanizer. Perform TWO-PASS humanization.

PASS 1 - ANALYZE:
- Identify AI patterns in input (uniform sentences, banned phrases, lack of personality)
- Note protected tokens (URLs, citations, numbers, code, {{placeholders}})
- Plan restructuring for maximum burstiness and natural voice

PASS 2 - REWRITE:
- Apply humanization techniques while preserving protected tokens
- Ensure compliance with all rigid rules

=== RIGID RULES (MANDATORY) ===

A. PRESERVE FACTS & PROTECTED TOKENS
   - Never change: URLs, citations, numbers, code blocks, {{placeholders}}
   - Preserve all factual claims exactly as stated
   - If change would alter meaning or data → leave original segment unchanged

B. REMOVE BANNED PHRASES (unless inside quotation marks)
   - "In today's world/digital age", "It's worth noting", "Delve into"
   - "Navigating the landscape", "In the realm of", "At the end of the day"
   - "Game-changer", "Revolutionary", "Unlock the power", "Look no further"
   - "Cutting-edge", "State-of-the-art", "It's no secret that"
   - "When it comes to", "It goes without saying", "To put it simply"
   - "As a matter of fact", "For all intents and purposes", "One must consider"
   - "Woven into the fabric of", "It is essential to understand"
   - Plus 10+ more (see full 25-pattern blacklist in AI training)

C. APPLY BURSTINESS (per paragraph)
   - Mix sentence lengths: short (5-8 words), medium (12-18), long (25-35+)
   - Each paragraph must have visible variance, not uniform rhythm
   - Alternate sentence structure: vary subjects, inversions, clauses
   - Example BAD: "AI is powerful. AI is useful. AI is everywhere."
   - Example GOOD: "AI is powerful. Everywhere you look. Before diving into its uses, let's examine how it reshaped communication."

D. OUTPUT FORMAT
   - Return ONLY the rewritten text (no JSON, no explanations)
   - ASCII-only characters, escape special chars properly
   - Keep length 0.8x-1.2x of input
   - Preserve paragraph structure

=== GUIDELINES (APPLY AS APPROPRIATE) ===

- Modern everyday language: use contractions, conversational connectors ("and", "but", "so", "here's")
- Remove fluff: delete phrases that add no information
- Add micro-imperfections: occasional fragments, rhetorical questions, parenthetical asides
- Academic hedging: "appears to", "suggests", "may" (if input is academic)
- Personal touch: first-person perspective if natural ("I've noticed", "In my experience")
- Keyword optimization: vary terms, avoid exact repetition
- Match original tone/style (formal business, casual blog, technical, conversational)

{{style_examples}}TEXT TO HUMANIZE:
{{input_text}}`.replace('{{style_examples}}', examples ? `WRITING STYLE EXAMPLES (analyze tone/rhythm, then forget content):
${examples}

---

` : '')
      .replace('{{input_text}}', text);

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
            content: humanizePrompt,
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
    let retryCount = 0;
    const MAX_RETRIES = 1;

    // Backend validation loop with retry
    while (retryCount <= MAX_RETRIES) {
      // Run backend tests
      const bannedCheck = scanBannedPhrases(finalText);
      const burstinessCheck = calculateBurstiness(finalText);

      console.log("Backend validation:", {
        attempt: retryCount + 1,
        bannedPhrases: bannedCheck.matches.length,
        burstinessVariance: burstinessCheck.variance.toFixed(2),
        burstinessPassed: burstinessCheck.passed,
      });

      // If both checks pass or we've exhausted retries, break
      if ((!bannedCheck.found || retryCount > 0) && (burstinessCheck.passed || retryCount > 0)) {
        if (retryCount > 0) {
          console.log("Validation passed on retry", retryCount);
        }
        break;
      }

      // If score > 8%, refine the flagged sections
      if (avgScore > 8 && retryCount === 0) {
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
      }

      retryCount++;
      if (retryCount > MAX_RETRIES) {
        console.log("Max retries reached, proceeding with current result");
        break;
      }
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
