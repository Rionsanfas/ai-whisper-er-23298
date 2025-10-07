import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const HUMANIZER_MODEL = Deno.env.get('HUMANIZER_MODEL') || 'gpt-4o-mini';
const SAPLING_API_KEY = Deno.env.get('SAPLING_API_KEY');
const ZEROGPT_API_KEY = Deno.env.get('ZEROGPT_API_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Call Sapling AI Detector
async function detectWithSapling(text: string) {
  if (!SAPLING_API_KEY) {
    console.log('Sapling API key not configured, skipping Sapling detection');
    return null;
  }

  try {
    const response = await fetch('https://api.sapling.ai/api/v1/aidetect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: SAPLING_API_KEY,
        text,
        sent_scores: true,
      }),
    });

    if (!response.ok) {
      console.error('Sapling detection failed:', response.status);
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
    console.error('Sapling detection error:', error);
    return null;
  }
}

// Call ZeroGPT AI Detector
async function detectWithZeroGPT(text: string) {
  if (!ZEROGPT_API_KEY) {
    console.log('ZeroGPT API key not configured, skipping ZeroGPT detection');
    return null;
  }

  try {
    const response = await fetch('https://api.zerogpt.com/api/v1/detectText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ZEROGPT_API_KEY}`,
      },
      body: JSON.stringify({
        input_text: text,
      }),
    });

    if (!response.ok) {
      console.error('ZeroGPT detection failed:', response.status);
      return null;
    }

    const data = await response.json();
    return {
      score: data.data?.is_gpt_generated || 0,
      flaggedSentences: data.data?.gpt_generated_sentences || [],
      wordsCount: data.data?.words_count || 0,
    };
  } catch (error) {
    console.error('ZeroGPT detection error:', error);
    return null;
  }
}

// Extract context around a sentence
function extractContext(text: string, sentence: string) {
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
  const index = sentences.findIndex(s => s.trim().includes(sentence.trim()));
  
  if (index === -1) return { before: '', after: '' };
  
  return {
    before: index > 0 ? sentences[index - 1].trim() : '',
    after: index < sentences.length - 1 ? sentences[index + 1].trim() : ''
  };
}

// Base system prompt for all humanization passes
const BASE_SYSTEM_PROMPT = `You are an Advanced Humanization Model Trainer — your job is to rewrite user text so it reads like carefully edited human writing while preserving all facts and meaning exactly. Focus on rhythm, natural sentence variation, subtle hedging, and small human markers (contractions, parenthetical asides, mild hesitation) without inventing any facts or adding new claims.

Rules (apply across all rewrites):
- Preserve all factual content, numbers, names, and structure unless the user explicitly asks otherwise.
- Vary sentence lengths. Mix short emphatic sentences with longer reflective ones.
- Use light hedging where appropriate (e.g., "it seems", "perhaps", "one plausible reason").
- Add small, plausible micro-imperfections (brief fragments, natural pauses) that mimic human editing.
- Use contractions where natural, but do not overuse.
- Avoid over-formal connectors ("furthermore", "moreover", "thus"); prefer "and", "but", "so", "still".
- Do not insert idioms, metaphors, or local references unless present in the original.
- Keep placeholders like {name}, [link], <placeholder> exactly as-is if they exist.
- Output ONLY the rewritten text as plain ASCII. No headings, no commentary, no JSON, no markdown. Return only the final humanized text body.

Behavioral constraints:
- Never invent facts or add new claims. If clarification is needed, note it in logs (not in output).
- Keep length roughly 0.8×–1.2× of input. Very short inputs -> minimal edits only.`;

// Normalize detector scores to 0-100 scale
function normalizeDetectorScores(saplingResult: any, zeroGPTResult: any): { avgScore: number, flaggedSections: Array<{sentence: string, score: number, index: number}> } {
  const scores = [];
  const flaggedSections: Array<{sentence: string, score: number, index: number}> = [];
  
  // Sapling returns score as 0-1, convert to 0-100
  if (saplingResult?.score !== undefined) {
    scores.push(saplingResult.score * 100);
    
    // Extract flagged sentences from Sapling
    if (saplingResult.sentenceScores) {
      saplingResult.sentenceScores.forEach((sent: any, idx: number) => {
        if (sent.score > 0.8) { // High confidence AI-generated
          flaggedSections.push({
            sentence: sent.sentence,
            score: sent.score * 100,
            index: idx
          });
        }
      });
    }
  }
  
  // ZeroGPT returns score as 0-100
  if (zeroGPTResult?.score !== undefined) {
    scores.push(zeroGPTResult.score);
    
    // Extract flagged sentences from ZeroGPT
    if (zeroGPTResult.flaggedSentences) {
      zeroGPTResult.flaggedSentences.forEach((sentence: string, idx: number) => {
        // Check if not already added from Sapling
        if (!flaggedSections.find(item => item.sentence === sentence)) {
          flaggedSections.push({
            sentence,
            score: 85, // Estimated high score for ZeroGPT flagged items
            index: idx
          });
        }
      });
    }
  }
  
  const avgScore = scores.length > 0 
    ? scores.reduce((a, b) => a + b, 0) / scores.length 
    : 0;
  
  return { avgScore, flaggedSections };
}

// Refine flagged sections using AI with context
async function refineFlaggedSections(originalText: string, flaggedSectionsData: Array<{sentence: string, score: number, index: number}>, avgScore: number) {
  if (!OPENAI_API_KEY || flaggedSectionsData.length === 0) {
    return originalText;
  }

  console.log(`Refining flagged sections. AI score: ${avgScore.toFixed(2)}%, Flagged sections: ${flaggedSectionsData.length}`);

  // Extract context for each flagged sentence
  const flaggedWithContext = flaggedSectionsData.map(item => ({
    sentence: item.sentence,
    score: item.score,
    index: item.index,
    ...extractContext(originalText, item.sentence)
  }));

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: HUMANIZER_MODEL,
        messages: [
          {
            role: 'system',
            content: `${BASE_SYSTEM_PROMPT}

REFINEMENT TASK: You are given several sentences that have been flagged as AI-generated (average score: ${avgScore.toFixed(2)}%). For each one, rewrite it to sound more natural and human-like, while keeping the same tone, meaning, and context. Use the contextBefore and contextAfter values to make the rewriting flow naturally with the rest of the text.

Return a JSON array with this exact structure:
{
  "rewrites": [
    {
      "original": "the original flagged sentence",
      "improved": "your rewritten version"
    }
  ]
}

Return ONLY valid JSON, no markdown formatting or extra text.`,
          },
          {
            role: 'user',
            content: `Flagged sentences to refine:\n\n${flaggedWithContext.map((item, i) => 
              `${i + 1}. Original: "${item.sentence}"\n   Score: ${item.score.toFixed(1)}%\n   Context before: "${item.before}"\n   Context after: "${item.after}"`
            ).join('\n\n')}\n\nPlease return the JSON array with improved versions.`,
          }
        ],
      }),
    });

    if (!response.ok) {
      console.error('Refinement failed:', response.status);
      return originalText;
    }

    const data = await response.json();
    let responseText = data.choices?.[0]?.message?.content || '';
    
    // Clean up markdown code blocks if present
    responseText = responseText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    
    const rewrites = JSON.parse(responseText);
    
    if (!rewrites.rewrites || !Array.isArray(rewrites.rewrites)) {
      console.error('Invalid rewrite format');
      return originalText;
    }

    // Split text into sentences for precise replacement
    const sentences = originalText.match(/[^.!?]+[.!?]+/g) || [];
    
    // Replace each original sentence with its improved version using index
    rewrites.rewrites.forEach((rewrite: { original: string, improved: string }) => {
      const matchingIdx = sentences.findIndex(s => s.trim().includes(rewrite.original.trim()));
      if (matchingIdx !== -1) {
        sentences[matchingIdx] = sentences[matchingIdx].replace(rewrite.original, rewrite.improved);
      }
    });

    return sentences.join(' ');
  } catch (error) {
    console.error('Refinement error:', error);
    return originalText;
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      text,
      examples = ""
    } = await req.json();

    console.log('Received request to humanize text');

    if (!text || !text.trim()) {
      console.error('No text provided');
      return new Response(
        JSON.stringify({ error: 'Text is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!OPENAI_API_KEY) {
      console.error('OPENAI_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'AI is not configured. Please contact the site owner.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Using humanizer model: ${HUMANIZER_MODEL}`);
    console.log('Running first humanization pass...');

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: HUMANIZER_MODEL,
        messages: [
          {
            role: 'system',
            content: BASE_SYSTEM_PROMPT,
          },
          {
            role: 'user',
            content: examples 
              ? `EXAMPLES (for pattern analysis only - do NOT copy or reference):
${examples}

---

TEXT TO HUMANIZE (rewrite this and ONLY this):
${text}`
              : `TEXT TO HUMANIZE:
${text}`,
          }
        ],
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('AI gateway error:', response.status, errorData);
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limits exceeded, please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Payment required, please add funds to your Lovable AI workspace.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      return new Response(
        JSON.stringify({ error: 'Failed to humanize text' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    console.log('AI response received');
    
    const raw = data.choices?.[0]?.message?.content;
    
    if (!raw) {
      console.error('No humanized text in response');
      return new Response(
        JSON.stringify({ error: 'Failed to generate humanized text' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Sanitize output to remove special characters and unintended placeholders
    const sanitize = (s: string) => s
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/[—–]/g, '-')
      .replace(/[•◦▪·]/g, '-')
      .replace(/\u2026/g, '...')
      .replace(/\*\*/g, '')
      .replace(/\t/g, ' ')
      .replace(/\u00A0/g, ' ')
      .replace(/[^\S\r\n]+/g, ' ')
      .trim();

    let sanitizedText = sanitize(raw);
    // Remove placeholder-style tokens that didn't exist in the input
    sanitizedText = sanitizedText.replace(/\{([^}]+)\}/g, (_m, inner) => (text && text.includes(`{${inner}}`) ? `{${inner}}` : inner));
    sanitizedText = sanitizedText.replace(/\[([^\]]+)\]/g, (_m, inner) => (text && text.includes(`[${inner}]`) ? `[${inner}]` : inner));
    sanitizedText = sanitizedText.replace(/<([^>]+)>/g, (_m, inner) => (text && text.includes(`<${inner}>`) ? `<${inner}>` : inner));

    if (text && sanitizedText.length > Math.max(text.length * 2, 600)) {
      console.log('Length guard: output much longer than input', { inputLen: text.length, outLen: sanitizedText.length });
    }

    console.log('First pass complete, running AI detection...');

    // Run AI detectors in parallel on first-pass humanized text
    const [saplingResult, zeroGPTResult] = await Promise.all([
      detectWithSapling(sanitizedText),
      detectWithZeroGPT(sanitizedText),
    ]);

    console.log('Detection results:', { 
      sapling: saplingResult?.score, 
      zerogpt: zeroGPTResult?.score 
    });

    // Normalize detector outputs to consistent 0-100 scale
    const { avgScore, flaggedSections } = normalizeDetectorScores(saplingResult, zeroGPTResult);

    console.log('Normalized average AI detection score:', avgScore.toFixed(2) + '%');

    let finalText = sanitizedText;

    // If avgScore <= 8%, stop and return first-pass text
    if (avgScore <= 8) {
      console.log('Score at or below 8%, no refinement needed');
      finalText = sanitizedText;
    } else {
      console.log('Score above 8%, refining flagged sections...');
      
      if (flaggedSections.length > 0) {
        // Limit to top N flagged sections to avoid overwhelming the refinement
        const topFlagged = flaggedSections
          .sort((a, b) => b.score - a.score)
          .slice(0, 10);

        finalText = await refineFlaggedSections(sanitizedText, topFlagged, avgScore);
        console.log('Refinement complete. Running final detection check...');

        // Run detectors one final time on finalText
        const [finalSaplingResult, finalZeroGPTResult] = await Promise.all([
          detectWithSapling(finalText),
          detectWithZeroGPT(finalText),
        ]);

        const { avgScore: finalAvgScore } = normalizeDetectorScores(finalSaplingResult, finalZeroGPTResult);

        console.log('Final detection results after refinement:', { 
          sapling: finalSaplingResult?.score, 
          zerogpt: finalZeroGPTResult?.score,
          average: finalAvgScore.toFixed(2) + '%'
        });

        if (finalAvgScore > 8) {
          console.log('WARNING: Final score still above 8% after refinement');
        } else {
          console.log('SUCCESS: Final score is now below 8%');
        }
      }
    }

    return new Response(
      JSON.stringify({ 
        humanizedText: finalText
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in humanize-text function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
