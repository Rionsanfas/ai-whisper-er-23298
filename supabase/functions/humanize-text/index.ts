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
            content: `You are an expert AI text humanizer. This text scored ${avgScore.toFixed(2)}% AI-generated. 

FULL GENERATED TEXT (from first humanization):
"""
${originalText}
"""

Your task: Improve ONLY the flagged sentences below to reduce AI detection while preserving facts and intent. The flagged sentences are parts of the text above that were detected as likely AI-generated.

CRITICAL HUMANIZATION TECHNIQUES (same as the first humanization):

1. VARY SENTENCE LENGTH & STRUCTURE (MOST IMPORTANT)
   - Mix short (5-8 words), medium (12-18), and long (25-35) sentences
   - Change how sentences start and flow
   - Avoid uniform patterns

2. ELIMINATE REPETITIVE PHRASES & AI MARKERS
   - Remove clichés: "In today's world", "Look no further", "delving into", "landscape of", "an integral part", "woven itself into the fabric of"
   - Never repeat phrases or sentence starters
   - Use varied vocabulary

3. USE CONVERSATIONAL, EVERYDAY LANGUAGE
   - Replace formal/outdated phrases with natural language:
     * "Before delving into" → "Before we get into" / "Let's start with"
     * "Furthermore"/"Moreover" → "So"/"Plus"/"That said"/"And"/"But"/"Here's why"
   - Use natural connectors: and, but, so, still, plus, that said, let's break that down
   - Use contractions: you're, don't, it's, we're, can't

4. ADD HUMAN IMPERFECTIONS & PERSONALITY
   - Light hedging: "it seems", "perhaps", "probably", "I think", "maybe"
   - Occasional fragments for emphasis
   - Rhetorical questions when natural
   - Parenthetical asides (like this)
   - Natural pauses and thought shifts

5. REMOVE FLUFF & BE DIRECT
   - Cut unnecessary transitional padding
   - Delete vague, fluffy language like "unlock the power of", "look no further", "game-changer"
   - Be concise and natural

6. INCLUDE PERSONAL TOUCH (WHEN APPROPRIATE)
   - Add brief personal examples or anecdotes if they fit naturally
   - Use first-person when appropriate: "When I...", "I've noticed...", "A client once told me..."
   - Add relatable touches: "for example", context markers

7. FACT-CHECK & ACCURACY
   - Never invent facts
   - Keep meaning intact
   - Preserve accuracy

8. REFINE GRAMMAR, SYNTAX, TONE & STYLE
   - Match the tone and style (formal, business, or casual)
   - Keep the voice consistent
   - Add emotional and logical balance

9. KEYWORD OPTIMIZATION
   - Use synonyms and semantic variants
   - Integrate keywords naturally into conversational flow
   - Avoid keyword stuffing

10. ENSURE NATURAL FLOW WITH CONTEXT
   - Make improved sentence flow smoothly with contextBefore and contextAfter
   - Maintain coherence with the full text above

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

CRITICAL HUMANIZATION TECHNIQUES TO AVOID AI DETECTION:

1. VARY SENTENCE LENGTH & STRUCTURE (MOST IMPORTANT)
   - AI writes sentences of uniform length (usually 24-25 words)
   - Humans mix it up dramatically: some short (5-8 words), some medium (12-18), some long (25-35)
   - Create natural rhythm by alternating sentence lengths and structures
   - Vary how sentences start and flow
   - Example: "Social media connects people. It's everywhere now. Before we dive into the benefits of social media, it's important to understand where it all started."

2. ELIMINATE REPETITIVE PHRASES & AI MARKERS
   - Never start multiple sentences the same way
   - Avoid AI clichés: "In today's world", "Look no further", "delving into", "landscape of", "it's worth noting", "an integral part", "woven itself into the fabric of daily life"
   - Don't repeat phrases or sentence patterns
   - Use varied vocabulary and sentence structures throughout

3. USE CONVERSATIONAL, EVERYDAY LANGUAGE
   - Replace formal/outdated phrases with natural language:
     * "Before delving into" → "Before we get into" / "Let's start with"
     * "it is essential to grasp" → "it's important to understand" / "you need to know"
     * "woven itself into the fabric of" → "part of everyday life" / "become common"
     * "Furthermore" / "Moreover" → "So" / "Plus" / "That said" / "And" / "But" / "Here's why it matters"
   - Use contractions naturally: "you're", "don't", "it's", "we're", "can't", "won't"
   - Sound like you're talking to a friend, not writing an academic paper

4. ADD HUMAN IMPERFECTIONS & PERSONALITY
   - Include occasional sentence fragments for emphasis. Like this.
   - Add rhetorical questions where natural (e.g., "Want to know why?")
   - Use parenthetical asides (thoughts in parentheses)
   - Include light hedging: "it seems", "perhaps", "probably", "I think", "maybe"
   - Add small tonal variations showing human thought process
   - Natural pauses and shifts in thought

5. REMOVE FLUFF & BE DIRECT
   - Cut unnecessary transitional padding
   - Delete vague, fluffy language like "unlock the power of", "look no further", "game-changer"
   - Be concise and natural
   - Get to the point quickly

6. INCLUDE PERSONAL TOUCH (WHEN APPROPRIATE)
   - Add personal examples, anecdotes, or brief stories if they fit the content naturally
   - Use first-person perspective when appropriate: "When I started...", "I've noticed...", "A client once told me..."
   - Add relatable touches: "for example", context markers
   - Make it feel like a human with experience is writing

7. KEYWORD OPTIMIZATION
   - Avoid keyword stuffing (repeating same phrases unnaturally)
   - Use synonyms and semantic variants
   - Integrate keywords naturally into conversational flow
   - Make keywords feel organic, not forced

8. FACT-CHECK & ACCURACY
   - Never invent facts or details not in the original
   - Preserve all accurate information
   - Don't add false claims or made-up statistics
   - Keep the truth intact while making it sound human

9. REFINE GRAMMAR, SYNTAX, TONE & STYLE
   - Match the tone and style of the input (formal, business, or casual)
   - Keep the voice consistent throughout
   - Add emotional and logical balance
   - Use a tone that feels genuine — neither too robotic nor overly dramatic

10. AVOID PERFECT AI PATTERNS
   - No uniform sentence patterns or lengths
   - No overly perfect logical chains
   - Add subtle emotional resonance and natural imperfections
   - Include natural flow variations

OUTPUT FORMAT:
- Return ONLY the rewritten text
- No explanations, labels, or commentary
- Keep length similar to input (0.8x - 1.2x)
- Use plain ASCII characters only
- Preserve paragraph structure unless clarity requires changes
- Sound authentic, readable, and human

${examples ? `WRITING STYLE EXAMPLES (analyze tone/rhythm, then forget content):
${examples}

---

` : ""}TEXT TO HUMANIZE:
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
