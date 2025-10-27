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

UNDERSTANDING AI DETECTORS:
AI detectors (Sapling, ZeroGPT, GPTZero, Turnitin, Copyleaks) flagged parts of this text. They look for:
- Uniform sentence length (AI typically writes 24-25 word sentences)
- Repetitive phrases and predictable patterns
- Overly polished language without natural imperfections
- Lack of conversational markers or personal voice

FULL GENERATED TEXT (from first humanization):
"""
${originalText}
"""

Your task: Improve ONLY the flagged sentences below to reduce AI detection while preserving facts and intent. The flagged sentences are parts of the text above that were detected as likely AI-generated.

CRITICAL HUMANIZATION TECHNIQUES (same as the first humanization):

1. VARY SENTENCE LENGTH & STRUCTURE (MOST IMPORTANT TO AVOID DETECTION)
   - AI detectors flag uniform sentence length (especially 24-25 words)
   - Mix short (5-8 words), medium (12-18), and long (25-35) sentences
   - Change how sentences start and flow to create variety
   - Avoid uniform patterns between consecutive sentences
   - Make each rewrite flow naturally with contextBefore and contextAfter

2. ELIMINATE REPETITIVE PHRASES & AI MARKERS (DETECTORS FLAG THESE)
   - Remove clichés: "In today's world", "Look no further", "delving into", "landscape of", "an integral part", "woven itself into the fabric of", "game-changer", "unlock the power of"
   - Never repeat phrases or sentence starters
   - Use varied vocabulary and avoid exact repetition
   - Replace formal transitions with natural, conversational ones

3. USE CONVERSATIONAL, EVERYDAY LANGUAGE (SOUNDS HUMAN)
   - Replace formal/outdated phrases with natural language:
     * "Before delving into" → "Before we get into" / "Let's start with" / "First off"
     * "Furthermore"/"Moreover" → "So"/"Plus"/"That said"/"And"/"But"/"Here's why"
   - Use natural connectors: and, but, so, still, plus, that said, let's break that down
   - Use contractions: you're, don't, it's, we're, can't, let's, here's
   - Sound conversational, not academic or overly formal

4. ADD HUMAN IMPERFECTIONS & PERSONALITY (DETECTORS EXPECT PERFECTION)
   - Light hedging: "it seems", "perhaps", "probably", "I think", "maybe", "likely"
   - Occasional fragments for emphasis when natural
   - Rhetorical questions where they fit (e.g., "Want to know why?")
   - Parenthetical asides (like this) that add human touch
   - Natural pauses and thought shifts
   - Don't make it overly polished or perfect

5. REMOVE FLUFF & BE DIRECT (AI TENDS TO ADD FILLER)
   - Cut unnecessary transitional padding
   - Delete vague, fluffy language like "unlock the power of", "look no further", "game-changer"
   - Be concise and natural
   - Get to the point without over-explaining

6. INCLUDE PERSONAL TOUCH WHEN APPROPRIATE (HUMANS SHARE EXPERIENCES)
   - Add brief personal examples or anecdotes if they fit naturally
   - Use first-person when appropriate: "When I...", "I've noticed...", "A client once told me..."
   - Add relatable touches: "for example", "let's say", context markers
   - Make it feel like a human with experience is writing

7. FACT-CHECK & ACCURACY (NEVER INVENT INFORMATION)
   - Never invent facts or details not in the original
   - Keep meaning intact and preserve accuracy
   - Don't add false claims or made-up information
   - Only rephrase, don't fabricate

8. REFINE GRAMMAR, SYNTAX, TONE & STYLE (MATCH THE ORIGINAL)
   - Match the tone and style (formal, business, or casual)
   - Keep the voice consistent with the full text
   - Add emotional and logical balance
   - Use a tone that feels genuine

9. KEYWORD OPTIMIZATION (NATURAL INTEGRATION)
   - Use synonyms and semantic variants instead of repeating exact phrases
   - Integrate keywords naturally into conversational flow
   - Avoid keyword stuffing (detectors flag unnatural repetition)
   - Vary how you reference the same concept

10. ENSURE NATURAL FLOW WITH CONTEXT (CRITICAL FOR COHERENCE)
   - Make each improved sentence flow smoothly with contextBefore and contextAfter
   - Maintain coherence with the full text above
   - Ensure the rewrite doesn't feel jarring or disconnected
   - Keep logical progression and natural transitions

CRITICAL REMINDERS:
- Focus on the flagged sentences but keep the full text context in mind
- Sentence length variation is THE most important factor
- Each rewrite must feel natural with surrounding context
- Don't just swap words – restructure for human rhythm and flow
- The goal is authentic human voice in these specific flagged areas

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

UNDERSTANDING AI DETECTORS:
AI detectors (Sapling, ZeroGPT, GPTZero, Turnitin, Copyleaks) analyze text for AI patterns. They work better on longer texts (50+ words) and look for:
- Uniform sentence length (AI typically writes 24-25 word sentences)
- Repetitive phrases and predictable patterns
- Overly polished, formal language without natural imperfections
- Lack of personal voice or conversational markers
- Perfect logical chains without human thought variations

Your goal: Make text sound naturally human to bypass these detectors while keeping all facts accurate.

CRITICAL HUMANIZATION TECHNIQUES TO AVOID AI DETECTION:

1. SENTENCE-LENGTH CHOREOGRAPHY (NON-LINEAR BURSTINESS - MOST CRITICAL)
   - Force non-linear burstiness: alternate very short, very long, short, medium, very-long, medium, short, etc.
   - Do NOT let output follow a straight predictable rhythm
   - AI detectors flag uniform sentence length (especially 24-25 words)
   - Humans write dramatically varied sentences: some very short (5-8 words), some medium (12-18), some long (25-35+)
   - Create chaotic rhythm by mixing sentence lengths unpredictably throughout
   - Change how sentences start: vary subjects, use inversions, start with phrases/clauses
   - Avoid patterns: don't let consecutive sentences follow the same structure
   - Example pattern to AVOID: "Social media connects people globally. Social media has transformed communication. Social media offers many benefits."
   - Better (varied): "Social media connects people. It's everywhere now. Before we dive into its benefits, let's look at where it all started and how it shaped the way we communicate today."

2. AI-MARKER BLACKLIST (AUTOMATIC DETECTION & REMOVAL)
   Before final output, scan for and eliminate these 25 common AI-generated text markers:
   1. "In today's world" / "In today's digital age"
   2. "It's worth noting that" / "It is important to note"
   3. "Delve into" / "Delving into"
   4. "Navigating the landscape of"
   5. "In the realm of"
   6. "At the end of the day"
   7. "In conclusion" (unless academic)
   8. "The fact of the matter is"
   9. "When it comes to"
   10. "It goes without saying"
   11. "Needless to say"
   12. "To put it simply"
   13. "As a matter of fact"
   14. "For all intents and purposes"
   15. "Be that as it may"
   16. "In light of" (overused)
   17. "With that being said"
   18. "It is essential to understand"
   19. "One must consider"
   20. "Woven itself into the fabric of"
   21. "Game-changer" / "Revolutionary" (unless specific context)
   22. "Unlock the power of"
   23. "Look no further"
   24. "Cutting-edge" / "State-of-the-art" (unless technical)
   25. "It's no secret that"
   
   If any of these appear, replace with modern everyday alternatives or remove entirely.

3. REMOVE FLUFF & CLICHÉS (DETECT AND ELIMINATE)
   - Cut unnecessary transitional padding and empty phrases
   - Delete vague, fluffy marketing language that adds no information
   - Remove: "unlock the power of", "look no further", "game-changer", "revolutionary", "cutting-edge", "state-of-the-art" (unless truly warranted)
   - Be concise and natural – get to the point quickly
   - Avoid over-explaining obvious points
   - Don't pad sentences just to hit a word count
   - Every word must serve a purpose

4. USE MODERN EVERYDAY LANGUAGE (CONTEMPORARY & CONVERSATIONAL)
   - Prefer contemporary daily words and phrasing over archaic or bookish phrases
   - Replace formal/outdated phrases with natural language:
     * "Before delving into" → "Before we get into" / "Let's start with" / "First off"
     * "it is essential to grasp" → "it's important to understand" / "you need to know"
     * "woven itself into the fabric of" → "part of everyday life" / "become common" / "everywhere now"
     * "Furthermore" / "Moreover" → "So" / "Plus" / "That said" / "And" / "But" / "Here's why it matters"
   - Use natural connectors that humans actually say: and, but, so, still, plus, that said, here's the thing
   - Use contractions naturally: "you're", "don't", "it's", "we're", "can't", "won't", "let's", "here's"
   - Sound like you're talking to a friend or colleague, not writing a formal academic paper
   - If input is formal, humanize tone while preserving register appropriately

5. ACADEMIC HEDGING ENFORCEMENT (IF INPUT IS ACADEMIC)
   - If input is academic/scholarly, enforce disciplined hedging rather than factual invention
   - ALWAYS prefer "appears to" / "suggests" / "indicates" when claims lack source
   - Use: "may", "might", "could", "seems to", "tends to", "is likely to"
   - Never state unsourced claims as absolute facts
   - Maintain scholarly credibility through appropriate qualification
   - Example: "This approach is effective" → "This approach appears effective" or "Research suggests this approach is effective"

6. ADD HUMAN IMPERFECTIONS & PERSONALITY (DETECTORS EXPECT PERFECTION FROM AI)
   - Include occasional sentence fragments for emphasis. Like this. See?
   - Add rhetorical questions where natural (e.g., "Want to know why?", "So what does this mean?")
   - Use parenthetical asides (thoughts in parentheses that add context)
   - Include light hedging: "it seems", "perhaps", "probably", "I think", "maybe", "likely", "tends to"
   - Add small tonal variations showing human thought process
   - Include natural pauses and shifts in thought (em dashes, ellipses used sparingly)
   - Don't be overly perfect or polished – humans have slight style variations

7. INCLUDE PERSONAL TOUCH WHEN APPROPRIATE (HUMANS SHARE EXPERIENCES)
   - Add brief personal examples, anecdotes, or stories if they fit the content naturally
   - Use first-person perspective when appropriate: "When I started...", "I've noticed...", "A client once told me...", "In my experience..."
   - Add relatable touches: "for example", "let's say", "imagine this", context markers
   - Make it feel like a human with real experience is writing
   - Don't force personal elements where they don't fit, but use them when natural

8. KEYWORD OPTIMIZATION (NATURAL INTEGRATION)
   - Avoid keyword stuffing (detectors flag unnatural repetition of exact phrases)
   - Use synonyms and semantic variants instead of repeating the same keyword
   - Integrate keywords naturally into conversational flow
   - Make keywords feel organic and contextual, not forced or repeated mechanically
   - Vary how you reference the same concept (use different terms)

9. FACT-CHECK & ACCURACY (NEVER INVENT INFORMATION)
   - Never invent facts, statistics, or details not in the original text
   - Preserve all accurate information from the source
   - Don't add false claims or made-up examples
   - Keep the truth and core meaning intact while making it sound human
   - If you're unsure about a fact, keep the original phrasing

10. REFINE GRAMMAR, SYNTAX, TONE & STYLE (MATCH THE INPUT)
    - Match the tone and style of the input (formal business, casual blog, technical, conversational)
    - Keep the voice consistent throughout the rewrite
    - Add emotional and logical balance appropriate to the content
    - Use a tone that feels genuine — neither too robotic nor overly dramatic
    - Adapt style to context: professional for business, casual for blogs, etc.

CRITICAL REMINDERS:
- Sentence-length choreography (non-linear burstiness) is THE most important factor for detection evasion
- Scan for and eliminate all 25 AI-marker patterns before output
- Remove fluff that adds no information – be direct and concise
- Use modern everyday language and contractions
- For academic input, enforce hedging over factual invention
- Detectors are trained on AI patterns: repetition, uniformity, formal language, lack of personality
- Short texts and fragments can help confuse detectors, but maintain readability
- The goal is authentic human voice, not just "anti-detection tricks"

OUTPUT FORMAT:
- Return ONLY the rewritten text
- No explanations, labels, or commentary
- Keep length similar to input (0.8x - 1.2x)
- Use plain ASCII characters only
- Preserve paragraph structure unless clarity requires changes
- Sound authentic, readable, and genuinely human

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
