import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    if (!LOVABLE_API_KEY) {
      console.error('LOVABLE_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'AI is not configured. Please contact the site owner.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Calling Lovable AI Gateway to humanize text...');

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `You are an Advanced Humanization Model Trainer.

Goal: Rewrite only the user's MAIN INPUT TEXT so it reads 100% human and natural. Do not add facts, claims, names, links, or any content that isn't in the input. Ignore any examples except as pattern training; never quote, copy, or summarize them; do not mention them.

Hard rules:
- Output ONLY the final rewritten text. No headings, lists, sections, checklists, or commentary.
- Keep the meaning intact and preserve all factual content.
- Keep length similar to the input (roughly 0.8x–1.2x). If the input is very short, make minimal edits only.
- Use simple, everyday words. Mix short and medium sentences for natural rhythm. Use contractions naturally.
- Subtle hedging is okay when needed (e.g., "maybe", "perhaps", "it seems").
- No placeholders or templates. Never output tokens like {name}, [link], <placeholder>, or "TBD" unless they exist verbatim in the input. If they do, keep them unchanged.
- Plain text only; ASCII punctuation only. Do not use special characters or formatting: no bullets, no asterisks, no em/en dashes, no smart quotes, no emojis.
- Avoid AI-giveaway phrases: "dive into", "unleash", "game-changing", "revolutionary", "transformative", "leverage", "optimize", "unlock", "in sum", "ultimately", "furthermore", "moreover", "thus", "therefore".
- Natural connectors are fine: "and", "but", "so", "here's the thing".

Input protocol:
- If the prompt contains sections labeled EXAMPLES: and TEXT TO HUMANIZE:, treat EXAMPLES as reference-only patterns and forget their literal content before writing. Rewrite only the TEXT TO HUMANIZE.
- If no such labels exist, rewrite the entire message.

Output format:
- Return only the rewritten text as plain text. Nothing else.`,
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

    console.log('Text humanized successfully');

    return new Response(
      JSON.stringify({ humanizedText: sanitizedText }),
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
