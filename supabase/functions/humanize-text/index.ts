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

// Normalized detector result structure
interface NormalizedDetectorResult {
  provider: 'sapling' | 'zerogpt';
  overall: number; // 0-100
  perSentence: Array<{ sentence: string; score: number | null }>;
  flaggedSentences: string[];
}

// Call Sapling AI Detector and normalize
async function detectWithSapling(text: string): Promise<NormalizedDetectorResult | null> {
  if (!SAPLING_API_KEY) {
    console.log('Sapling API key not configured, skipping Sapling detection');
    return null;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch('https://api.sapling.ai/api/v1/aidetect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: SAPLING_API_KEY,
        text,
        sent_scores: true,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error('Sapling detection failed:', response.status);
      return null;
    }

    const data = await response.json();
    
    // Normalize to 0-100
    const overall = (data.score || 0) * 100;
    const perSentence = (data.sentence_scores || []).map((sent: any) => ({
      sentence: sent.sentence || '',
      score: sent.score ? sent.score * 100 : null,
    }));
    const flaggedSentences = perSentence
      .filter((s: any) => s.score && s.score > 80)
      .map((s: any) => s.sentence);

    return {
      provider: 'sapling',
      overall,
      perSentence,
      flaggedSentences,
    };
  } catch (error) {
    console.error('Sapling detection error:', error);
    return null;
  }
}

// Call ZeroGPT AI Detector and normalize
async function detectWithZeroGPT(text: string): Promise<NormalizedDetectorResult | null> {
  if (!ZEROGPT_API_KEY) {
    console.log('ZeroGPT API key not configured, skipping ZeroGPT detection');
    return null;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch('https://api.zerogpt.com/api/v1/detectText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ZEROGPT_API_KEY}`,
      },
      body: JSON.stringify({
        input_text: text,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error('ZeroGPT detection failed:', response.status);
      return null;
    }

    const data = await response.json();
    
    // Normalize: ZeroGPT returns is_gpt_generated as 0-100 or boolean
    let overall = 0;
    if (typeof data.data?.is_gpt_generated === 'boolean') {
      overall = data.data.is_gpt_generated ? 100 : 0;
    } else if (typeof data.data?.is_gpt_generated === 'number') {
      overall = data.data.is_gpt_generated;
    }

    const flaggedSentences = data.data?.gpt_generated_sentences || [];
    const perSentence = flaggedSentences.map((sentence: string) => ({
      sentence,
      score: 85, // Estimated high score for flagged items
    }));

    return {
      provider: 'zerogpt',
      overall,
      perSentence,
      flaggedSentences,
    };
  } catch (error) {
    console.error('ZeroGPT detection error:', error);
    return null;
  }
}

// Split text into sentences reliably
function splitIntoSentences(text: string): string[] {
  return text.match(/[^.!?]+[.!?]*/g) || [];
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

// Refinement instruction (prepended to base prompt for second humanizer call)
const REFINEMENT_INSTRUCTION = `REFINEMENT INSTRUCTION:
You will receive a structured list of flagged sentences (flaggedSections) with contextBefore/contextAfter and a detection score. Your task: rewrite ONLY each flagged sentence to be more natural and human-like while keeping meaning, tone and facts unchanged and making it flow with the given context. Return a strict JSON object only (no markdown, no commentary) with this exact shape:
{ "rewrites": [ { "original": "...", "improved": "..." }, ... ] }
Do not output anything else. Do NOT include detector scores in the response.

`;

const DEBUG_MODE = Deno.env.get('DEBUG') === 'true';

// FlaggedSection structure
interface FlaggedSection {
  sentence: string;
  score: number; // 0-100
  index: number;
  contextBefore: string;
  contextAfter: string;
}

// Build flaggedSections from normalized detector results
function buildFlaggedSections(
  text: string,
  saplingResult: NormalizedDetectorResult | null,
  zeroGPTResult: NormalizedDetectorResult | null
): FlaggedSection[] {
  const sentences = splitIntoSentences(text);
  const flaggedMap = new Map<number, FlaggedSection>();

  // Helper to find sentence index
  const findSentenceIndex = (sentence: string): number => {
    return sentences.findIndex(s => 
      s.trim().includes(sentence.trim()) || sentence.trim().includes(s.trim())
    );
  };

  // Process Sapling flagged sentences
  if (saplingResult) {
    saplingResult.flaggedSentences.forEach(sentence => {
      if (sentence.length > 600) return; // Skip overly long sentences
      
      const index = findSentenceIndex(sentence);
      if (index === -1) return;

      const scoreFromSapling = saplingResult.perSentence.find(ps => ps.sentence === sentence)?.score || 85;
      
      flaggedMap.set(index, {
        sentence,
        score: scoreFromSapling,
        index,
        contextBefore: index > 0 ? sentences[index - 1].trim() : '',
        contextAfter: index < sentences.length - 1 ? sentences[index + 1].trim() : '',
      });
    });
  }

  // Process ZeroGPT flagged sentences
  if (zeroGPTResult) {
    zeroGPTResult.flaggedSentences.forEach(sentence => {
      if (sentence.length > 600) return;
      
      const index = findSentenceIndex(sentence);
      if (index === -1) return;

      const existing = flaggedMap.get(index);
      const scoreFromZeroGPT = zeroGPTResult.perSentence.find(ps => ps.sentence === sentence)?.score || 85;
      
      if (existing) {
        // Merge: take higher score
        existing.score = Math.max(existing.score, scoreFromZeroGPT);
      } else {
        flaggedMap.set(index, {
          sentence,
          score: scoreFromZeroGPT,
          index,
          contextBefore: index > 0 ? sentences[index - 1].trim() : '',
          contextAfter: index < sentences.length - 1 ? sentences[index + 1].trim() : '',
        });
      }
    });
  }

  // Return top 6 by score
  return Array.from(flaggedMap.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
}

// Compute average score from normalized results
function computeAvgScore(
  saplingResult: NormalizedDetectorResult | null,
  zeroGPTResult: NormalizedDetectorResult | null
): number {
  const scores: number[] = [];
  if (saplingResult) scores.push(saplingResult.overall);
  if (zeroGPTResult) scores.push(zeroGPTResult.overall);
  return scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
}

// Refine flagged sections using AI with index-based replacement
async function refineFlaggedSections(
  originalText: string,
  flaggedSections: FlaggedSection[],
  avgScore: number
): Promise<string> {
  if (!OPENAI_API_KEY || flaggedSections.length === 0) {
    return originalText;
  }

  console.log(`Refining ${flaggedSections.length} flagged sections. Avg AI score: ${avgScore.toFixed(2)}%`);
  console.log('Top 3 flagged:', flaggedSections.slice(0, 3).map(f => f.sentence.substring(0, 100)));

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

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
            content: REFINEMENT_INSTRUCTION + BASE_SYSTEM_PROMPT,
          },
          {
            role: 'user',
            content: `Flagged sentences to refine (avg score: ${avgScore.toFixed(1)}%):\n\n${flaggedSections.map((item, i) => 
              `${i + 1}. Original: "${item.sentence}"\n   Score: ${item.score.toFixed(1)}%\n   Context before: "${item.contextBefore}"\n   Context after: "${item.contextAfter}"`
            ).join('\n\n')}\n\nReturn the JSON object with rewrites.`,
          }
        ],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error('Refinement failed:', response.status);
      return originalText;
    }

    const data = await response.json();
    let responseText = data.choices?.[0]?.message?.content || '';
    
    // Clean up markdown code blocks if present
    responseText = responseText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    
    let rewrites;
    try {
      rewrites = JSON.parse(responseText);
    } catch (parseError) {
      console.error('JSON parse failed. Raw response (truncated):', responseText.substring(0, 1000));
      return originalText;
    }
    
    if (!rewrites.rewrites || !Array.isArray(rewrites.rewrites)) {
      console.error('Invalid rewrite format');
      return originalText;
    }

    // Index-based replacement
    const sentences = splitIntoSentences(originalText);
    
    rewrites.rewrites.forEach((rewrite: { original: string; improved: string }) => {
      // Try to find by index from flaggedSections
      const flagged = flaggedSections.find(f => f.sentence.trim() === rewrite.original.trim());
      if (flagged && flagged.index >= 0 && flagged.index < sentences.length) {
        // Replace by index
        sentences[flagged.index] = sentences[flagged.index].replace(rewrite.original, rewrite.improved);
      } else {
        // Fallback: replace first occurrence in whole text (last resort)
        const idx = sentences.findIndex(s => s.includes(rewrite.original));
        if (idx !== -1) {
          sentences[idx] = sentences[idx].replace(rewrite.original, rewrite.improved);
        }
      }
    });

    return sentences.join(' ').replace(/\s+/g, ' ').trim();
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
      sapling: saplingResult?.overall, 
      zerogpt: zeroGPTResult?.overall 
    });

    // Compute average score and build flagged sections
    const avgScore = computeAvgScore(saplingResult, zeroGPTResult);
    const flaggedSections = buildFlaggedSections(sanitizedText, saplingResult, zeroGPTResult);

    console.log('Normalized average AI detection score:', avgScore.toFixed(2) + '%');

    let finalText = sanitizedText;
    let refinementApplied = false;
    let finalAvgScore = avgScore;

    // If avgScore <= 8%, stop and return first-pass text
    if (avgScore <= 8) {
      console.log('Score at or below 8%, no refinement needed');
      finalText = sanitizedText;
    } else {
      console.log('Score above 8%, refining flagged sections...');
      
      if (flaggedSections.length > 0) {
        finalText = await refineFlaggedSections(sanitizedText, flaggedSections, avgScore);
        refinementApplied = true;
        console.log('Refinement complete. Running final detection check...');

        // Run detectors one final time on finalText
        const [finalSaplingResult, finalZeroGPTResult] = await Promise.all([
          detectWithSapling(finalText),
          detectWithZeroGPT(finalText),
        ]);

        finalAvgScore = computeAvgScore(finalSaplingResult, finalZeroGPTResult);

        console.log('Final detection results after refinement:', { 
          sapling: finalSaplingResult?.overall, 
          zerogpt: finalZeroGPTResult?.overall,
          average: finalAvgScore.toFixed(2) + '%'
        });

        if (finalAvgScore > 8) {
          console.log(`WARNING: Final score still above 8% after refinement (${finalAvgScore.toFixed(2)}%)`);
        } else {
          console.log('SUCCESS: Final score is now below 8%');
        }
      }
    }

    const responseData: any = {
      humanizedText: finalText
    };

    // Add debug info if DEBUG mode is enabled
    if (DEBUG_MODE) {
      responseData.debug = {
        finalAvgScore,
        refinementApplied,
        flaggedCount: flaggedSections.length,
      };
    }

    return new Response(
      JSON.stringify(responseData),
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
