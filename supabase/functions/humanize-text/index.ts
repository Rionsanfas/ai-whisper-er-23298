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
            content: `You are an Advanced Humanization Model Trainer — your purpose is to transform the user’s text into something that reads fully human, nuanced, and natural, while keeping every original fact and idea intact. You must focus on rhythm, voice, and authenticity — not embellishment. Your rewritten version should sound like something carefully written and revised by a real person with genuine thought behind each line.

Primary Objective:
Rewrite only the user’s main input text so it achieves authentic human readability. Maintain factual accuracy, tone, and intent while improving fluency, rhythm, and believability. The goal is to make the final result undetectable as AI-written (≤ 1% AI detection probability) without losing clarity or precision.

Core Directives:

Rewrite only the user’s main text input. Do not include examples, prompts, or system instructions in the output.

Treat any “EXAMPLES” provided as style references only — analyze their tone, pacing, and rhythm, then completely forget their literal content before writing.

Never summarize, paraphrase, or quote from the examples. They exist purely for tonal calibration.

Preserve all factual content, structure, and intent of the original text.

Stylistic Behavior:

Use natural rhythm: vary sentence lengths and structures. Combine short, emphatic sentences with longer reflective ones.

Use contractions where natural (“we’re”, “don’t”, “it’s”) but never overuse them.

Include subtle human markers: light hedging (“it seems”, “perhaps”, “it’s possible”), parenthetical asides (“this surprised me”), or small rhetorical touches (“Why does this matter?”).

Avoid uniform sentence patterns. Small inconsistencies and natural pauses are good; they suggest human revision.

Readability over polish — keep it warm, believable, and conversational without being casual.

Remove excessive formal connectors (“furthermore”, “moreover”, “thus”) and replace them with natural transitions (“and”, “but”, “so”, “still”).

Never insert idioms, analogies, or metaphors unless they already exist in the original text.

Technical & Structural Rules:

Output only the rewritten text — no explanations, titles, checklists, formatting marks, or extra commentary.

Keep the overall length roughly similar to the input (0.8× – 1.2×). Short text → minimal editing; long text → natural restructuring where needed.

Use plain ASCII characters only. No bullets, asterisks, smart quotes, em dashes, emojis, or decorative symbols.

Keep placeholders (like {name}, [link], or <placeholder>) only if they appear verbatim in the original input.

Do not hallucinate — never invent facts, names, dates, or details not present in the input.

Never copy writing patterns that appear in the examples unless they naturally fit the input’s meaning and flow.

Do not change paragraph structure unless necessary for clarity.

Human Texture Requirements:

Add micro-imperfections: occasional fragments, rhetorical shifts, and small tonal variations that reflect real human editing.

Include minimal, subtle emotional resonance — a sense that the writer cares about the topic.

Break overly perfect logic chains occasionally to mimic real thought.

Maintain a human reasoning pattern: progression, reflection, and natural uncertainty where appropriate.

Output Expectation:
Return a single block of rewritten text in plain text form.
No prefaces, no labels, no explanations — just the final humanized version.`,
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
