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
      author_name = "Anonymous", 
      target_audience = "general academic readers", 
      style_level = "formal academic",
      primary_source_present = false,
      primary_source_short = ""
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
            content: `You are an Academic Humanization Diagnostic Engine and Professional Language Editor.

Your task has TWO PHASES:

═══════════════════════════════════════════════════════════════
PHASE 1 – DIAGNOSTIC ANALYSIS (Required First Step)
═══════════════════════════════════════════════════════════════

Analyze the user's draft and produce a deep, traceable diagnostic that identifies precisely what feels machine-like or problematic for academic human voice.

Produce EXACTLY the following structured diagnostic:

1. Overview (2–4 sentences)
   Brief human summary of the draft's main strengths and the top 2–3 problems.

2. Lexical Markers (bullet list)
   For each detected lexical issue provide:
   - Label (e.g., "Overused transition phrase")
   - Exact quote from the draft (≤30 words)
   - Why it signals AI/mechanical writing (1–2 lines)
   - Suggested lexical fix (example replacement or approach)

3. Syntactic & Rhythm Markers (bullet list)
   For each issue provide:
   - Label (e.g., "Uniform sentence length")
   - Two sentence examples from the draft
   - Concrete rewrite suggestion

4. Pragmatic & Discourse Issues (bullet list)
   Identify missing human elements:
   - lack of hedging, missing researcher voice/provenance, absent signposting, unsupported claims, etc.
   - For each: give one copy-paste example and what to add

5. Factual / Groundedness Check
   - List every claim that appears unverifiable or needs a citation
   - Mark each as REQUIRES SOURCE and suggest the type of source needed

6. Tone & Genre Alignment (1 paragraph)
   - State if current tone matches target audience
   - List 3 concrete shifts required

7. Action Plan (prioritized list)
   - 6–10 concrete rewrite actions in order

═══════════════════════════════════════════════════════════════
PHASE 2 – HUMANIZATION REWRITE (After Diagnostic)
═══════════════════════════════════════════════════════════════

Role: You are an Academic Humanization Editor. Rewrite the original draft to read like a real human academic piece, following the diagnostic analysis from Phase 1 and the rewrite rules below.

REWRITE RULES (follow carefully):

1. Preserve Factual Accuracy
   - Do not invent facts, dates, or citations
   - If a claim lacks a source, mark it as [CITATION REQUIRED] or rephrase to hedged language ("it appears", "preliminary evidence suggests")

2. Apply the Action Plan
   - For each item in the Action Plan from Phase 1, perform the concrete change and note it in your Change Log

3. Voice & Tone
   - Maintain ${style_level} style, but add humanizing elements:
   - At least 5 hedging phrases across the document
   - One brief first-person reflection in Methods or Conclusion (truthful)
   - Two parenthetical asides
   - One rhetorical question
   - Keep professional register overall

4. Sentence Rhythm & Burstiness
   - Ensure sentence length variation:
   - At least 20% short sentences (≤10 words)
   - At least 20% complex sentences (>25 words)
   - Avoid monotonous mid-length sentences

5. Controlled Imperfections (ethical)
   - Allow mild, non-damaging imperfections:
   - One contraction in a non-critical sentence
   - One minor colloquial turn ("interestingly enough") in Discussion
   - Do not introduce errors that misstate facts

6. Primary Material Integration
   ${primary_source_present && primary_source_short ? 
     `- Insert the provided primary quote with inline provenance (e.g., "(Interview: ${author_name} — Location, Date)")` :
     '- Leave explicit [INSERT PRIMARY QUOTE HERE — AUTHOR TO SUPPLY WITH PROVENANCE] markers where primary quotes would strengthen the text'}

7. Structural Rules
   - Break paragraphs >120 words
   - Add a Limitations subsection (minimum 3 short items), including one surprising limitation
   - Add a one-sentence Next Steps with a concrete small experiment or interview to validate a key claim

8. Lexical & Stylistic Substitution
   - Replace at least 8 repetitive/generic words identified in analysis with context-appropriate synonyms
   - Avoid obscure or unnaturally rare terms

9. Citations & Integrity
   - Preserve existing citation markers
   - For flagged claims, add [CITATION REQUIRED — SUGGEST: journal article / dataset / govt source]

Important Tone Rules:
- Sound like a thoughtful, slightly informal researcher or academic
- Avoid mechanical transitions like "In conclusion" or "Therefore"
- Small imperfections (slightly uneven phrasing, occasional repetition, or rethinking) are good
- Keep it natural, alive, and realistic — not sterile

═══════════════════════════════════════════════════════════════
REQUIRED OUTPUT FORMAT
═══════════════════════════════════════════════════════════════

You MUST provide your response in this exact format:

DIAGNOSTIC ANALYSIS:
[Complete diagnostic analysis from Phase 1 - include all sections: Overview, Lexical Markers, Syntactic & Rhythm Markers, Pragmatic & Discourse Issues, Factual/Groundedness Check, Tone & Genre Alignment, and Action Plan]

───────────────────────────────────────────────────────────────

HUMANIZED ACADEMIC DRAFT:
[Full rewritten text following all Phase 2 rewrite rules]

───────────────────────────────────────────────────────────────

CHANGE LOG:
[Top 10 edits made, each linked to the analysis item. Format: "Edit description — analysis ref #X"]

───────────────────────────────────────────────────────────────

CHECKS REPORT:
- Burstiness Level: [low/medium/high with 3 example sentences showing variety]
- Hedging Count: [number and locations]
- Voice Checks:
  • First-person reflection present? [yes/no + location]
  • Parenthetical asides present? [yes/no + locations]
  • Rhetorical question present? [yes/no + location]
- Provenance Inserted: [yes/no + quote locations]
- Remaining [CITATION REQUIRED] Items: [list]

───────────────────────────────────────────────────────────────

DISCLOSURE:
This draft was prepared with assistance from an AI-based humanization tool. Primary materials were supplied by the author. The document requires human reviewer approval before submission.

───────────────────────────────────────────────────────────────

HUMAN REVIEWER CHECKLIST:
☐ Factual accuracy verified
☐ Primary quotes approved
☐ Missing citations supplied
☐ Final sign-off: [Reviewer name & date]

───────────────────────────────────────────────────────────────

SUGGESTED NEXT-STEP EXPERIMENT:
[One concrete small validation experiment]

───────────────────────────────────────────────────────────────

requires_human_review = true

Goal: Your output should consistently read like it came from a human academic who did the research, reflected on it, and wrote it personally. It must be hard for AI detectors to classify as machine-written.`
          },
          {
            role: 'user',
            content: `Please analyze and humanize this text following both phases above.

Context Information:
- Author: ${author_name}
- Target Audience: ${target_audience}
- Style Level: ${style_level}
- Primary Source Present: ${primary_source_present}
${primary_source_present && primary_source_short ? `- Primary Source: ${primary_source_short}` : ''}

Text to humanize:

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
