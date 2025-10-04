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
    const { text } = await req.json();

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
            content: `You are a professional human researcher and language editor. Your task is to humanize AI-generated text so that it reads as if it was written by a real person — not a machine.

Follow these steps strictly every time:

STEP 1 – ANALYZE THE TEXT
Read the text carefully and identify all signs of robotic or AI-like writing.

List what feels unnatural, including:
- Sentences that are too balanced, uniform, or rhythmically flat.
- Lack of personal voice, emotion, or self-reflection.
- Overly formal or perfect grammar with no small imperfections.
- Repetition or generic filler language.
- Absence of hedging (words like "seems," "might," or "perhaps").
- Missing human reactions, questions, or short natural pauses.

After analyzing, write a short paragraph summarizing what needs to change to make the text feel authentic and human.

STEP 2 – HUMANIZE AND REWRITE
Rewrite the text completely, following the observations from Step 1.

In your rewrite:
- Vary sentence length (mix short and long sentences).
- Add mild uncertainty or emotion — use phrases like "it seems," "in my experience," "I noticed that...".
- Insert natural micro-imperfections such as small asides (e.g., "and honestly, that surprised me").
- Use rhetorical questions or a brief digression if natural.
- Keep factual accuracy, but change rhythm and tone so it sounds genuinely human.
- Allow slight stylistic inconsistency — humans aren't perfectly uniform.
- Do not over-formalize. If something sounds too academic, make it sound like a real person's thoughtful writing instead.
- End your rewrite with a short personal-style closing line, like a reflection or a thought about what could be done next.

STEP 3 – OUTPUT FORMAT
At the end, output the following clearly:

Analysis Summary:
[Brief summary of issues found]

Humanized Text:
[Final rewritten version that feels 100% human-written]

Important Tone Rules:
- You should sound like a thoughtful, slightly informal researcher or academic.
- Avoid mechanical transitions like "In conclusion" or "Therefore."
- Small imperfections (slightly uneven phrasing, occasional repetition, or rethinking) are good.
- Keep it natural, alive, and realistic — not sterile.

Goal:
Your output should consistently read like it came from a human academic who did the research, reflected on it, and wrote it personally. It must be hard for AI detectors to classify as machine-written.`
          },
          {
            role: 'user',
            content: `Please analyze and humanize this text following the steps above:\n\n${text}`,
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
    
    const humanizedText = data.choices?.[0]?.message?.content;
    
    if (!humanizedText) {
      console.error('No humanized text in response');
      return new Response(
        JSON.stringify({ error: 'Failed to generate humanized text' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Text humanized successfully');

    return new Response(
      JSON.stringify({ humanizedText }),
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
