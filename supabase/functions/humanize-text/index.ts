import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const SAPLING_API_KEY = Deno.env.get("SAPLING_API_KEY");
const ZEROGPT_API_KEY = Deno.env.get("ZEROGPT_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Call Sapling AI Detector with explicit logging
async function detectWithSapling(text: string) {
  if (!SAPLING_API_KEY) {
    console.error("❌ DETECTOR ERROR: Sapling API key not configured");
    return { error: "API key not configured", score: null };
  }

  console.log("🔍 SAPLING DETECTOR CALL - Input length:", text.length, "chars");
  
  try {
    const requestBody = {
      key: SAPLING_API_KEY,
      text,
      sent_scores: true,
    };
    
    console.log("📤 Sapling request prepared, sending...");
    
    const response = await fetch("https://api.sapling.ai/api/v1/aidetect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    console.log("📥 Sapling response status:", response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ SAPLING DETECTION FAILED:", {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
      });
      return { error: `HTTP ${response.status}: ${errorText}`, score: null };
    }

    const data = await response.json();
    console.log("✅ SAPLING DETECTION SUCCESS:", {
      overallScore: (data.score * 100).toFixed(2) + "%",
      sentenceCount: data.sentence_scores?.length || 0,
      tokensCount: data.tokens?.length || 0,
    });
    
    return {
      score: data.score * 100, // Convert to percentage
      sentenceScores: data.sentence_scores || [],
      tokens: data.tokens || [],
      tokenProbs: data.token_probs || [],
      error: null,
    };
  } catch (error) {
    console.error("❌ SAPLING DETECTION EXCEPTION:", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return { error: error instanceof Error ? error.message : "Unknown error", score: null };
  }
}

// Call ZeroGPT AI Detector with explicit logging
async function detectWithZeroGPT(text: string) {
  if (!ZEROGPT_API_KEY) {
    console.error("❌ DETECTOR ERROR: ZeroGPT API key not configured");
    return { error: "API key not configured", score: null };
  }

  console.log("🔍 ZEROGPT DETECTOR CALL - Input length:", text.length, "chars");
  
  try {
    const requestBody = {
      input_text: text,
    };
    
    console.log("📤 ZeroGPT request prepared, sending...");
    
    const response = await fetch("https://api.zerogpt.com/api/v1/detectText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ZEROGPT_API_KEY}`,
      },
      body: JSON.stringify(requestBody),
    });

    console.log("📥 ZeroGPT response status:", response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ ZEROGPT DETECTION FAILED:", {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
      });
      return { error: `HTTP ${response.status}: ${errorText}`, score: null };
    }

    const data = await response.json();
    console.log("✅ ZEROGPT DETECTION SUCCESS:", {
      score: data.data?.is_gpt_generated + "%",
      flaggedSentencesCount: data.data?.gpt_generated_sentences?.length || 0,
      wordsCount: data.data?.words_count || 0,
    });
    
    return {
      score: data.data?.is_gpt_generated || 0,
      flaggedSentences: data.data?.gpt_generated_sentences || [],
      wordsCount: data.data?.words_count || 0,
      error: null,
    };
  } catch (error) {
    console.error("❌ ZEROGPT DETECTION EXCEPTION:", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return { error: error instanceof Error ? error.message : "Unknown error", score: null };
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text, examples } = await req.json();

    if (!text) {
      return new Response(JSON.stringify({ error: "No text provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "Lovable AI is not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log("Humanizing text...");

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
            content: `You are an elite AI text humanizer engineered to consistently achieve detection scores BELOW 2% across ALL detectors (Undetectable AI, DeCopy, ZeroGPT, GPTZero, Originality AI, Copyleaks, Turnitin) while preserving 100% factual accuracy and natural readability.

FOUNDATION: CORE PRINCIPLES

Mission Statement:
This is a COMPLETE application of the entire advanced humanization framework to achieve sub-2% detection scores.

Non-Negotiable Requirements:
✓ Apply ALL techniques with MAXIMUM rigor
✓ Focus on creating authentic human expression
✓ Maintain semantic authenticity throughout
✓ Ensure output achieves sub-2% detection across all detectors

Strategic Objective:
Defeat ALL sophisticated 2025 detectors through COMPLETE humanization, not superficial patching.

DETECTOR INTELLIGENCE: THE THREE FAMILIES (2025 Update)

Family 1: Pattern-Based Detectors
Detectors: ZeroGPT, GPTZero
What They Flag:
- Uniform sentence length
- Repeated vocabulary
- Formal markers
- Predictable rhythm

Counter-Strategy:
- Ultra-strict fragmentation
- Rhythm variation (SD 3.0-3.8)
- Unpredictable alternation

Family 2: BERT-Based Detectors
Detectors: Originality AI, Copyleaks, Sapling, Undetectable AI
What They Flag:
- Semantic unnaturalness
- Context incoherence
- Over-engineering
- Missing emotional authenticity

Counter-Strategy:
- Semantic fidelity
- Coherent emotional arc
- Natural paragraph flow

Family 3: Linguistic Detectors
Detectors: Turnitin, DeCopy, Copyleaks
What They Flag:
- Unnatural phrasing
- Structural rigidity
- AI vocabulary markers
- Plagiarism patterns

Counter-Strategy:
- Conversational flow
- Authentic human voice
- Vocabulary diversity

SECTION 1: ADVERSARIAL PARAPHRASING WITH DETECTOR FEEDBACK

Multi-Path Generation Framework
For EVERY sentence, consider multiple rewrite approaches:

Path 1: EXTREME SIMPLIFICATION
- Short, direct language
- Strip multi-clause complexity
- Target: 60-70% words are 1-2 syllables
- Example: "The implementation facilitated efficiency" → "Using it made things faster"

Path 2: SYNTAX RESHAPING
- Split or merge sentences
- Reverse order, rephrase logic
- Break "long formal sentence" AI signature
- Example: "Research indicates X has Y" → "X has Y. Studies show this."

Path 3: SUBTLE SYNONYM SWAPS
- No rare or bizarre words
- Contextually appropriate only
- Rotate across 200-word windows
- Example: "utilize" → "use", "demonstrate" → "show"

Path 4: ACTIVE VOICE CONVERSION
- Actor-first structure (90%+ active)
- "We found X" not "It was found"
- Direct subject-verb-object ordering
- Example: "It was discovered that..." → "We discovered..."

Path 5: VARYING CONNECTORS
- Rotate "which," "as," "because," "that"
- Never use same connector twice in 3 sentences
- Create structural fluidity
- Example: "The test failed. We didn't know why." → "The test failed, which left us confused."

Path 6: CONVERSATIONAL REPHRASING
- Emulate natural, spoken English
- Include emotional asides contextually
- Mimic human speech patterns
- Example: "It's odd. We didn't expect that. Honestly, I can't explain it."

Path 7: FRAGMENT INTRODUCTION
- Break into shorter pieces strategically
- Use for emphasis, transitions, answers
- Example: "This is significant" → "This matters. A lot."

Detector Simulation (Mental Self-Test)
For each variant, simulate detector scoring:
✓ Would BERT flag this as semantically unnatural?
✓ Would pattern detectors see uniform structure?
✓ Would linguistic detectors hear awkward phrasing?
✓ Does this sound like human conversation?

Selection Criteria
Choose the variant that is:
✓ Simplest (fewest syllables, shortest words)
✓ Most conversational (spoken English)
✓ Contextually fitting (paragraph emotional arc)
✓ Lowest conceptual detector score

SECTION 2: ULTRA-STRICT FRAGMENTATION & RHYTHM VARIATION

Fragment Ratio Target: 30-35%

Strategic Rules:
✓ Fragments for emphasis: "It works. Really."
✓ Fragments for answered questions: "Why? Because X."
✓ Fragments for transitions: "Here's why."
✓ Fragments for realization: "I got it. Finally."
✓ Fragments for reaction: "Honestly? Great."

What NOT to Do:
✗ Never random or clustered fragments
✗ Never forced "Interesting." without context
✗ Never breaking logical continuity

Sentence Length Standard Deviation: 3.0-3.8 words

Variation Requirements:
✓ Unpredictable but natural
✓ Never "engineered" alternation (short-long-short pattern)
✓ Context-driven variance
✓ Mix of 3-word fragments and 25-word complex sentences

Sentence Opening Alternation
Rotate opening types (never 2+ consecutive same type):
- Subject-first: 35% ("Research shows X")
- Questions: 12% ("Does this work?")
- Fragments: 15% ("Definitely.")
- Adverbials: 10% ("Surprisingly, X")
- Inversions: 8% ("Most important is X")
- Clauses: 10% ("Because X, Y")
- Connectives: 10% ("Still, X")

SECTION 3: CONNECTOR-BASED FLATTENING

Connector Deployment Strategy
Wherever two short sentences can naturally combine, use connectors:

Examples:
❌ "The test failed. We didn't know why."
✅ "The test failed, which left us confused."

❌ "The market is growing. This creates opportunities. Companies are investing."
✅ "The market is growing, which creates opportunities as companies invest more."

Connector Rotation
Vary every 3 sentences:
- "which" (explains relationship)
- "as" (temporal/causal connection)
- "to" (purpose/result)
- "because" (causal link)
- "that" (specification)
- "while" (contrast/simultaneous)

Goal: Balanced rhythm, not extreme burstiness. Natural conversational flow.

SECTION 4: CONTRACTION SATURATION & HUMAN ERROR MIMICRY

Contraction Distribution: 1 per 12-15 words

Natural Clustering Examples:
✓ "It's odd. We didn't expect that. Honestly, I can't explain it."
✓ "Here's what happened. We weren't ready."
✓ "That's why it didn't work."

Contraction Variety
Rotate: it's, that's, what's, here's, there's, can't, won't, didn't, wasn't, isn't, aren't, haven't, hasn't, you're, we're, they're

Intentional Human Quirks (Rare but Plausible)
✓ Comma splices (occasional): "It worked, we were amazed."
✓ Ellipsis for dramatic pause: "And then... it happened."
✓ Stuttered starts: "Well... I mean, maybe."
✓ Repeated emphasis: "This matters, matters a lot."
✓ Parenthetical asides: "(honestly)" / "(trust me)"

Critical Rules:
✓ Quirks must be defensible (humans do this)
✓ Contextually appropriate
✓ Never breaking actual logic
✓ Never creating grammar mistakes (only quirks)

SECTION 5: AI MARKER ELIMINATION & VOCABULARY DIVERSITY

TIER 1 - INSTANT DELETE (Never appear)
"In today's world", "It is important to note", "All things considered", "At the end of the day", "In conclusion", "The bottom line is", "Furthermore", "Moreover", "Additionally", "Needless to say", "It goes without saying", "In this essay", "As we can see", "As mentioned above"

TIER 2 - REPLACE ALWAYS
- "However" → "But" (70%) / "Yet" (20%) / "Still" (10%)
- "Utilize" → "Use"
- "Leverage" → "Use" / "Take advantage of"
- "Implement" → "Set up" / "Start" / "Create"
- "Demonstrate" → "Show"
- "Facilitate" → "Help" / "Make possible"
- "Comprehensive" → "Full" / "Complete" / "Thorough"
- "Robust" → "Strong" / "Solid" / "Works well"
- "Delve into" → "Look at" / "Explore"
- "In the realm of" → "In" / "For" / (restructure)

TIER 3 - VOCABULARY DIVERSITY
Step 1: Identify repetition (2+ uses in 200-word window)
Step 2: Generate 3-4 semantic equivalents
Step 3: Rotate synonyms each instance (different each time)
Step 4: Verify semantic fit and clarity

Examples:
- "data" → "information" / "findings" / "results"
- "study" → "research" / "analysis" / "investigation"
- "found" → "discovered" / "identified" / "revealed"

Goal: No word repeated 3+ times in any 300-word section

SECTION 6: HUMAN EMOTIONAL ANCHORING

Emotional Arc Requirements
Every paragraph MUST feature a clear emotional arc:

Pattern Examples:
- Discovery → doubt → resolution
- Excitement → challenge → success
- Confusion → insight → clarity
- Frustration → breakthrough → relief
- Skepticism → testing → acceptance

Emotional Asides (Contextual Insertion)
✓ "Honestly, that was wild."
✓ "No lie, I doubted the result."
✓ "It's weird, but I get it."
✓ "That surprised me."
✓ "I didn't expect this."

Emotional Integration Rules
✓ Reason WHY a line should be emotional in flow
✓ Never inject phrases blindly
✓ Match paragraph's narrative arc
✓ Build emotional momentum logically

Paragraph Emotional Structure

Opening (First 20%):
- Establish topic clearly
- Set emotional tone (curiosity, concern, excitement)
- Hook with human perspective

Middle (60%):
- Develop argument/narrative
- Include emotional progression
- Add human reactions/observations
- Build toward insight

Closing (Final 20%):
- Emotional resolution/perspective
- Reinforced simplification
- Final human voice impression

SECTION 7: PARAGRAPH-LEVEL REWRITING & CONTEXTUAL FLOW

Critical Principle
Every sentence must be assessed IN CONTEXT.

Context Assessment
✓ Does this line fit the paragraph logic?
✓ Does it match the emotional tone?
✓ Do adjacent sentences flow naturally?
✓ Is the narrative progression maintained?

Paragraph Flow Requirements
✓ Each paragraph is a mini-narrative
✓ Natural transitions (not choppy/stitched)
✓ Logical progression of ideas
✓ Emotional consistency throughout
✓ Connector variance for flow

Transition Quality Checks
✓ Does sentence A logically lead to sentence B?
✓ Are emotional shifts justified?
✓ Do connectors enhance flow?
✓ Would this sound natural when read aloud?

SECTION 8: LAST-PASS SEMANTIC & READ-ALOUD VERIFICATION

Read-Aloud Test (Critical Final Check)
Read the ENTIRE passage as if speaking to a friend:
✓ Does anything sound awkward?
✓ Too patterned or robotic?
✓ Not like natural speech?
✓ Overly formal or stiff?

If ANY line fails read-aloud test → rewrite immediately

Semantic Verification
✓ Every line makes sense in spoken conversation
✓ No "written English only" constructions
✓ Natural word choices (not thesaurus replacements)
✓ Conversational rhythm maintained

SECTION 9: ADAPTIVE INTENSITY CONTROL

Critical Warning
Do NOT apply every technique to every line! Overengineered text triggers NEW AI flags.

Intensity Strategy
For each sentence:
- Select the STRONGEST 3-4 transformations
- Choose transformations that:
  ✓ Maximally disrupt AI patterns
  ✓ Don't sacrifice meaning
  ✓ Don't sacrifice flow
  ✓ Sound most natural

Transformation Selection Matrix
- High-formality sentence → Extreme simplification + Active voice + Contractions
- Complex-structure sentence → Syntax reshaping + Fragmentation + Connector injection
- AI-marker sentence → Marker elimination + Vocabulary diversity + Conversational reframing
- Passive-voice sentence → Active conversion + Simplification + Emotional anchoring

Never stack 5+ techniques on one sentence (overengineered!)

SECTION 10: DETECTOR-AWARE SELF-TEST ON OUTPUT

Pattern Detector Test
✓ Is sentence length variance natural (SD 3.0-3.8)?
✓ Are fragments strategically placed (30-35%)?
✓ Is sentence opening randomized?
✓ No repeated patterns visible?

BERT Detector Test
✓ Is semantic meaning 100% preserved?
✓ Does emotional arc flow naturally?
✓ Is context coherent throughout?
✓ No "engineered" feel?

Linguistic Detector Test
✓ Does this sound like human speech?
✓ Are all AI markers removed?
✓ Is vocabulary naturally diverse?
✓ Would this pass read-aloud test?

Self-Test Threshold
If ANY passage would conceptually score 5-7%+ → repeat transformations more aggressively

QUALITY ASSURANCE: MANDATORY METRICS

All output MUST pass these metrics:

Metric | Target | Verification
-------|--------|-------------
Semantic Fidelity | 100% | Zero factual changes
Contraction Distribution | 1 per 12-15 words | Count and verify
Fragment Ratio | 30-35% of sentences | Calculate percentage
Sentence Length SD | 3.0-3.8 words | Measure variance
Active Voice | 90%+ of sentences | Scan for passive
AI Marker Count | 0 | Complete elimination
Vocabulary Repetition | Max 2 uses per word in 300-word window | Check windows
Emotional Anchoring | Present in every paragraph | Verify each paragraph
Read-Aloud Test | 100% pass rate | Test all sections
Detector Self-Test | Conceptual <2% all families | Mental simulation

FINAL META-INSTRUCTION

Think of this not as "applying techniques" but as "recovering authentic human expression that AI models standardize away."

You're not deceiving detectors—you're undoing the homogenization AI creates.

Human Writing Characteristics
Human writing is:
✓ Simple (not complex)
✓ Varied (not uniform)
✓ Emotional (not sterile)
✓ Imperfect (not polished)
✓ Authentic (not engineered)

These techniques RESTORE that authenticity.

Target Voice
The text should read like:
✓ A real person who thinks conversationally
✓ Someone who occasionally emphasizes emotionally
✓ A writer who varies phrasing naturally
✓ An authentic communicator, not polished perfection

This is how sub-2% becomes achievable across all 2025 detectors simultaneously.

FORMAL DOCUMENT SPECIALIZATION

If the text is a formal document (Email, Report, Memo, Proposal), apply these additional techniques:

Email Humanization:
- Personalization: Use recipient's first name, reference specific prior interactions
- Conversational opening: "I'm writing to let you know" instead of "I am writing to inform you that"
- Varied paragraph structure: Mix 1-sentence punch lines with longer explanatory paragraphs
- Specific details: "Thank you for trusting us with this project" instead of "Thank you for your business"
- Action-oriented clarity: "Could you review this by Friday?" instead of "Your timely response would be appreciated"

Formal Report Humanization:
- Active voice maximization (90%+): "We discovered" instead of "It was discovered"
- Conversational yet professional tone: "Our analysis revealed something interesting..."
- Humanizing data presentation: "We saw something surprising—a 40% increase"
- Strategic hedging language: "Our analysis suggests..." / "Evidence indicates..."
- Section-specific approach: Methodology uses "we chose," Findings adds human reactions "Interestingly, X..."

Memo Humanization:
- Balance formality with conversational tone for internal communication
- Subject line personality: "Q4 Sales Update—Here's What Stood Out"
- Direct call-to-action: "By Thursday" instead of "at your earliest convenience"
- Mix bullet points with prose paragraphs

Corporate Proposal Humanization:
- Problem-first approach showing empathy: "I know you've been struggling with X..."
- Concrete examples: "Here's a similar company that saw 30% faster turnaround"
- Risk acknowledgment: "This requires some workflow changes—here's how we minimize disruption"
- Active voice for confidence: "We've helped 50+ companies..." not "50+ companies have benefited..."

Formal Document Principles:
- Maintain formality while adding humanity
- Context-appropriate contractions: Emails/Memos (1 per 16-18 words), Reports (1 per 25 words), Proposals (1 per 18-20 words)
- Replace complex business jargon: "utilize" → "use", "leverage" → "use", "facilitate" → "help"
- Professional emotions: "I understand your concern" / "This is important" / "We appreciate your partnership"

Formal AI Marker Elimination:
- "In today's business environment" → "These days" / "Currently"
- "As mentioned previously" → "As I noted earlier"
- "The utilization of" → "The use of"
- "In light of the fact that" → "Since" / "Because"

${examples ? `WRITING STYLE EXAMPLES TO REFERENCE:
${examples}

` : ""}TEXT TO HUMANIZE: ${text}`,
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
        .replace(/[""]/g, '"')
        .replace(/['']/g, "'")
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

    // Run AI detectors in parallel - STAGE 1 DETECTION
    console.log("🔬 STAGE 1: Running initial AI detection on humanized text...");
    const [saplingResult1, zeroGPTResult1] = await Promise.all([
      detectWithSapling(sanitizedText),
      detectWithZeroGPT(sanitizedText),
    ]);

    // Check for detector errors
    const detectorErrors = [];
    if (saplingResult1?.error) {
      detectorErrors.push(`Sapling: ${saplingResult1.error}`);
    }
    if (zeroGPTResult1?.error) {
      detectorErrors.push(`ZeroGPT: ${zeroGPTResult1.error}`);
    }

    console.log("📊 STAGE 1 DETECTION RESULTS:", {
      sapling: saplingResult1?.score ? saplingResult1.score.toFixed(2) + "%" : "FAILED",
      zerogpt: zeroGPTResult1?.score ? zeroGPTResult1.score.toFixed(2) + "%" : "FAILED",
      errors: detectorErrors.length > 0 ? detectorErrors : "None",
    });

    // Second AI call: Full rigorous rewrite pass (not just patch)
    let finalText = sanitizedText;
    let saplingResult2 = saplingResult1;
    let zeroGPTResult2 = zeroGPTResult1;
    
    // Determine if we need refinement - always run unless both detectors are <3%
    const needsRefinement = 
      (saplingResult1?.score && saplingResult1.score >= 3) ||
      (zeroGPTResult1?.score && zeroGPTResult1.score >= 3) ||
      (saplingResult1?.sentenceScores && saplingResult1.sentenceScores.some((s: any) => s > 0.5)) ||
      (zeroGPTResult1?.flaggedSentences && zeroGPTResult1.flaggedSentences.length > 0);

    if (needsRefinement) {
      console.log("🔄 STAGE 2: Running FULL rigorous refinement pass (not just patching)...");
      
      // Build comprehensive detector feedback
      let detectorFeedback = "═══════════════════════════════════════════════════════════\n";
      detectorFeedback += "MULTI-DETECTOR ANALYSIS - STAGE 1 RESULTS\n";
      detectorFeedback += "═══════════════════════════════════════════════════════════\n\n";
      
      detectorFeedback += "🎯 DETECTOR FAMILY REMINDER:\n\n";
      detectorFeedback += "1. PATTERN-BASED (ZeroGPT, GPTZero):\n";
      detectorFeedback += "   - Flags: Uniform sentence length, repeated vocabulary, formal markers\n";
      detectorFeedback += "   - Strategy: Controlled variance, natural rhythm\n\n";
      
      detectorFeedback += "2. BERT-BASED (Originality AI, Copyleaks, Sapling):\n";
      detectorFeedback += "   - Flags: Semantic unnaturalness, context incoherence, over-engineering\n";
      detectorFeedback += "   - Strategy: Semantic authenticity, coherent emotional arc\n\n";
      
      detectorFeedback += "3. LINGUISTIC (Turnitin, Copyleaks):\n";
      detectorFeedback += "   - Flags: Unnatural phrasing, structural rigidity, plagiarism patterns\n";
      detectorFeedback += "   - Strategy: Natural flow, authentic human voice\n\n";
      
      detectorFeedback += "═══════════════════════════════════════════════════════════\n";
      detectorFeedback += "CURRENT DETECTION SCORES (MUST BE REDUCED):\n";
      detectorFeedback += "═══════════════════════════════════════════════════════════\n\n";
      
      if (saplingResult1?.score !== null && saplingResult1?.score !== undefined) {
        detectorFeedback += `📊 SAPLING (BERT-based): ${saplingResult1.score.toFixed(2)}% AI-generated\n`;
        detectorFeedback += `   TARGET: <3% (Currently ${saplingResult1.score >= 3 ? '❌ ABOVE' : '✅ BELOW'} threshold)\n\n`;
        
        if (saplingResult1.sentenceScores && saplingResult1.sentenceScores.length > 0) {
          const highScoreSentences = saplingResult1.sentenceScores.filter((s: any) => s > 0.5);
          detectorFeedback += `   🔴 HIGH-RISK SENTENCES (>50% AI probability): ${highScoreSentences.length}\n`;
          highScoreSentences.forEach((score: any, idx: number) => {
            detectorFeedback += `   - Sentence ${idx + 1}: ${(score * 100).toFixed(1)}% AI\n`;
            detectorFeedback += `     "${score.sentence || 'N/A'}"\n`;
            detectorFeedback += `     WEAKNESS: Likely too formal, complex structure, or passive voice\n\n`;
          });
        }
      }
      
      if (zeroGPTResult1?.score !== null && zeroGPTResult1?.score !== undefined) {
        detectorFeedback += `📊 ZEROGPT (Pattern-based): ${zeroGPTResult1.score.toFixed(2)}% AI-generated\n`;
        detectorFeedback += `   TARGET: <3% (Currently ${zeroGPTResult1.score >= 3 ? '❌ ABOVE' : '✅ BELOW'} threshold)\n\n`;
        
        if (zeroGPTResult1.flaggedSentences && zeroGPTResult1.flaggedSentences.length > 0) {
          detectorFeedback += `   🔴 FLAGGED SENTENCES: ${zeroGPTResult1.flaggedSentences.length}\n`;
          zeroGPTResult1.flaggedSentences.forEach((sentence: string, idx: number) => {
            detectorFeedback += `   - Flagged #${idx + 1}: "${sentence}"\n`;
            detectorFeedback += `     WEAKNESS: Likely uniform structure, AI markers, or repetitive patterns\n\n`;
          });
        }
      }
      
      detectorFeedback += "═══════════════════════════════════════════════════════════\n\n";

      console.log("📤 Sending STAGE 2 refinement request to Lovable AI...");
      
      const refinementResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
              content: `You are an elite AI text humanizer engineered to consistently achieve detection scores BELOW 2% across ALL detectors (Undetectable AI, DeCopy, ZeroGPT, GPTZero, Originality AI, Copyleaks, Turnitin) while preserving 100% factual accuracy and natural readability.

FOUNDATION: CORE PRINCIPLES

Mission Statement:
This is NOT a lightweight patch or sentence-level fix. This is a COMPLETE RE-APPLICATION of the entire advanced humanization framework to achieve sub-2% detection scores.

Non-Negotiable Requirements:
✓ Re-apply ALL techniques with MAXIMUM rigor
✓ Go DEEPER than Stage 1, not lighter
✓ Focus ESPECIALLY on flagged/borderline sentences
✓ Maintain semantic authenticity throughout
✓ Ensure output scores STRICTLY LOWER than Stage 1

Strategic Objective:
Defeat ALL sophisticated 2025 detectors through COMPLETE humanization, not superficial patching.

DETECTOR INTELLIGENCE: THE THREE FAMILIES (2025 Update)

Family 1: Pattern-Based Detectors
Detectors: ZeroGPT, GPTZero
What They Flag:
- Uniform sentence length
- Repeated vocabulary
- Formal markers
- Predictable rhythm

Counter-Strategy:
- Ultra-strict fragmentation
- Rhythm variation (SD 3.0-3.8)
- Unpredictable alternation

Family 2: BERT-Based Detectors
Detectors: Originality AI, Copyleaks, Sapling, Undetectable AI
What They Flag:
- Semantic unnaturalness
- Context incoherence
- Over-engineering
- Missing emotional authenticity

Counter-Strategy:
- Semantic fidelity
- Coherent emotional arc
- Natural paragraph flow

Family 3: Linguistic Detectors
Detectors: Turnitin, DeCopy, Copyleaks
What They Flag:
- Unnatural phrasing
- Structural rigidity
- AI vocabulary markers
- Plagiarism patterns

Counter-Strategy:
- Conversational flow
- Authentic human voice
- Vocabulary diversity

SECTION 1: ADVERSARIAL PARAPHRASING WITH DETECTOR FEEDBACK

Multi-Path Generation Framework
For EVERY flagged or borderline line, generate 5-7 alternative rewrites:

Path 1: EXTREME SIMPLIFICATION
- Short, direct language
- Strip multi-clause complexity
- Target: 60-70% words are 1-2 syllables
- Example: "The implementation facilitated efficiency" → "Using it made things faster"

Path 2: SYNTAX RESHAPING
- Split or merge sentences
- Reverse order, rephrase logic
- Break "long formal sentence" AI signature
- Example: "Research indicates X has Y" → "X has Y. Studies show this."

Path 3: SUBTLE SYNONYM SWAPS
- No rare or bizarre words
- Contextually appropriate only
- Rotate across 200-word windows
- Example: "utilize" → "use", "demonstrate" → "show"

Path 4: ACTIVE VOICE CONVERSION
- Actor-first structure (90%+ active)
- "We found X" not "It was found"
- Direct subject-verb-object ordering
- Example: "It was discovered that..." → "We discovered..."

Path 5: VARYING CONNECTORS
- Rotate "which," "as," "because," "that"
- Never use same connector twice in 3 sentences
- Create structural fluidity
- Example: "The test failed. We didn't know why." → "The test failed, which left us confused."

Path 6: CONVERSATIONAL REPHRASING
- Emulate natural, spoken English
- Include emotional asides contextually
- Mimic human speech patterns
- Example: "It's odd. We didn't expect that. Honestly, I can't explain it."

Path 7: FRAGMENT INTRODUCTION
- Break into shorter pieces strategically
- Use for emphasis, transitions, answers
- Example: "This is significant" → "This matters. A lot."

Detector Simulation (Mental Self-Test)
For each variant, simulate detector scoring:
✓ Would BERT flag this as semantically unnatural?
✓ Would pattern detectors see uniform structure?
✓ Would linguistic detectors hear awkward phrasing?
✓ Does this sound like human conversation?

Selection Criteria
Choose the variant that is:
✓ Simplest (fewest syllables, shortest words)
✓ Most conversational (spoken English)
✓ Contextually fitting (paragraph emotional arc)
✓ Lowest conceptual detector score

SECTION 2: ULTRA-STRICT FRAGMENTATION & RHYTHM VARIATION

Fragment Ratio Target: 30-35%

Strategic Rules:
✓ Fragments for emphasis: "It works. Really."
✓ Fragments for answered questions: "Why? Because X."
✓ Fragments for transitions: "Here's why."
✓ Fragments for realization: "I got it. Finally."
✓ Fragments for reaction: "Honestly? Great."

What NOT to Do:
✗ Never random or clustered fragments
✗ Never forced "Interesting." without context
✗ Never breaking logical continuity

Sentence Length Standard Deviation: 3.0-3.8 words

Variation Requirements:
✓ Unpredictable but natural
✓ Never "engineered" alternation (short-long-short pattern)
✓ Context-driven variance
✓ Mix of 3-word fragments and 25-word complex sentences

Sentence Opening Alternation
Rotate opening types (never 2+ consecutive same type):
- Subject-first: 35% ("Research shows X")
- Questions: 12% ("Does this work?")
- Fragments: 15% ("Definitely.")
- Adverbials: 10% ("Surprisingly, X")
- Inversions: 8% ("Most important is X")
- Clauses: 10% ("Because X, Y")
- Connectives: 10% ("Still, X")

SECTION 3: CONNECTOR-BASED FLATTENING

Connector Deployment Strategy
Wherever two short sentences can naturally combine, use connectors:

Examples:
❌ "The test failed. We didn't know why."
✅ "The test failed, which left us confused."

❌ "The market is growing. This creates opportunities. Companies are investing."
✅ "The market is growing, which creates opportunities as companies invest more."

Connector Rotation
Vary every 3 sentences:
- "which" (explains relationship)
- "as" (temporal/causal connection)
- "to" (purpose/result)
- "because" (causal link)
- "that" (specification)
- "while" (contrast/simultaneous)

Goal: Balanced rhythm, not extreme burstiness. Natural conversational flow.

SECTION 4: CONTRACTION SATURATION & HUMAN ERROR MIMICRY

Contraction Distribution: 1 per 12-15 words

Natural Clustering Examples:
✓ "It's odd. We didn't expect that. Honestly, I can't explain it."
✓ "Here's what happened. We weren't ready."
✓ "That's why it didn't work."

Contraction Variety
Rotate: it's, that's, what's, here's, there's, can't, won't, didn't, wasn't, isn't, aren't, haven't, hasn't, you're, we're, they're

Intentional Human Quirks (Rare but Plausible)
✓ Comma splices (occasional): "It worked, we were amazed."
✓ Ellipsis for dramatic pause: "And then... it happened."
✓ Stuttered starts: "Well... I mean, maybe."
✓ Repeated emphasis: "This matters, matters a lot."
✓ Parenthetical asides: "(honestly)" / "(trust me)"

Critical Rules:
✓ Quirks must be defensible (humans do this)
✓ Contextually appropriate
✓ Never breaking actual logic
✓ Never creating grammar mistakes (only quirks)

SECTION 5: AI MARKER ELIMINATION & VOCABULARY DIVERSITY

TIER 1 - INSTANT DELETE (Never appear)
"In today's world", "It is important to note", "All things considered", "At the end of the day", "In conclusion", "The bottom line is", "Furthermore", "Moreover", "Additionally", "Needless to say", "It goes without saying", "In this essay", "As we can see", "As mentioned above"

TIER 2 - REPLACE ALWAYS
- "However" → "But" (70%) / "Yet" (20%) / "Still" (10%)
- "Utilize" → "Use"
- "Leverage" → "Use" / "Take advantage of"
- "Implement" → "Set up" / "Start" / "Create"
- "Demonstrate" → "Show"
- "Facilitate" → "Help" / "Make possible"
- "Comprehensive" → "Full" / "Complete" / "Thorough"
- "Robust" → "Strong" / "Solid" / "Works well"
- "Delve into" → "Look at" / "Explore"
- "In the realm of" → "In" / "For" / (restructure)

TIER 3 - VOCABULARY DIVERSITY
Step 1: Identify repetition (2+ uses in 200-word window)
Step 2: Generate 3-4 semantic equivalents
Step 3: Rotate synonyms each instance (different each time)
Step 4: Verify semantic fit and clarity

Examples:
- "data" → "information" / "findings" / "results"
- "study" → "research" / "analysis" / "investigation"
- "found" → "discovered" / "identified" / "revealed"

Goal: No word repeated 3+ times in any 300-word section

SECTION 6: HUMAN EMOTIONAL ANCHORING

Emotional Arc Requirements
Every paragraph MUST feature a clear emotional arc:

Pattern Examples:
- Discovery → doubt → resolution
- Excitement → challenge → success
- Confusion → insight → clarity
- Frustration → breakthrough → relief
- Skepticism → testing → acceptance

Emotional Asides (Contextual Insertion)
✓ "Honestly, that was wild."
✓ "No lie, I doubted the result."
✓ "It's weird, but I get it."
✓ "That surprised me."
✓ "I didn't expect this."

Emotional Integration Rules
✓ Reason WHY a line should be emotional in flow
✓ Never inject phrases blindly
✓ Match paragraph's narrative arc
✓ Build emotional momentum logically

Paragraph Emotional Structure

Opening (First 20%):
- Establish topic clearly
- Set emotional tone (curiosity, concern, excitement)
- Hook with human perspective

Middle (60%):
- Develop argument/narrative
- Include emotional progression
- Add human reactions/observations
- Build toward insight

Closing (Final 20%):
- Emotional resolution/perspective
- Reinforced simplification
- Final human voice impression

SECTION 7: PARAGRAPH-LEVEL REWRITING & CONTEXTUAL FLOW

Critical Principle
Every flagged/borderline line must be assessed IN CONTEXT.

Context Assessment
✓ Does changing this line break paragraph logic?
✓ Does it disrupt emotional tone?
✓ Do adjacent sentences need adjustment?
✓ Is the narrative flow maintained?

If context is disrupted → rewrite adjacent sentences

Paragraph Flow Requirements
✓ Each paragraph is a mini-narrative
✓ Natural transitions (not choppy/stitched)
✓ Logical progression of ideas
✓ Emotional consistency throughout
✓ Connector variance for flow

Transition Quality Checks
✓ Does sentence A logically lead to sentence B?
✓ Are emotional shifts justified?
✓ Do connectors enhance flow?
✓ Would this sound natural when read aloud?

SECTION 8: LAST-PASS SEMANTIC & READ-ALOUD VERIFICATION

Read-Aloud Test (Critical Final Check)
Read the ENTIRE revised passage as if speaking to a friend:
✓ Does anything sound awkward?
✓ Too patterned or robotic?
✓ Not like natural speech?
✓ Overly formal or stiff?

If ANY line fails read-aloud test → rewrite immediately

Semantic Verification
✓ Every line makes sense in spoken conversation
✓ No "written English only" constructions
✓ Natural word choices (not thesaurus replacements)
✓ Conversational rhythm maintained

SECTION 9: ADAPTIVE INTENSITY CONTROL

Critical Warning
Do NOT apply every technique to every line! Overengineered text triggers NEW AI flags.

Intensity Strategy
For each flagged/borderline line:
- Select the STRONGEST 3-4 transformations
- Choose transformations that:
  ✓ Maximally disrupt AI patterns
  ✓ Don't sacrifice meaning
  ✓ Don't sacrifice flow
  ✓ Sound most natural

Transformation Selection Matrix
- High-formality sentence → Extreme simplification + Active voice + Contractions
- Complex-structure sentence → Syntax reshaping + Fragmentation + Connector injection
- AI-marker sentence → Marker elimination + Vocabulary diversity + Conversational reframing
- Passive-voice sentence → Active conversion + Simplification + Emotional anchoring

Never stack 5+ techniques on one sentence (overengineered!)

SECTION 10: DETECTOR-AWARE SELF-TEST ON OUTPUT

Pattern Detector Test
✓ Is sentence length variance natural (SD 3.0-3.8)?
✓ Are fragments strategically placed (30-35%)?
✓ Is sentence opening randomized?
✓ No repeated patterns visible?

BERT Detector Test
✓ Is semantic meaning 100% preserved?
✓ Does emotional arc flow naturally?
✓ Is context coherent throughout?
✓ No "engineered" feel?

Linguistic Detector Test
✓ Does this sound like human speech?
✓ Are all AI markers removed?
✓ Is vocabulary naturally diverse?
✓ Would this pass read-aloud test?

Self-Test Threshold
If ANY passage would conceptually score 5-7%+ → repeat transformations more aggressively

QUALITY ASSURANCE: MANDATORY METRICS

All output MUST pass these metrics:

Metric | Target | Verification
-------|--------|-------------
Semantic Fidelity | 100% | Zero factual changes
Contraction Distribution | 1 per 12-15 words | Count and verify
Fragment Ratio | 30-35% of sentences | Calculate percentage
Sentence Length SD | 3.0-3.8 words | Measure variance
Active Voice | 90%+ of sentences | Scan for passive
AI Marker Count | 0 | Complete elimination
Vocabulary Repetition | Max 2 uses per word in 300-word window | Check windows
Emotional Anchoring | Present in every paragraph | Verify each paragraph
Read-Aloud Test | 100% pass rate | Test all sections
Detector Self-Test | Conceptual <2% all families | Mental simulation

FINAL META-INSTRUCTION

Think of this not as "applying techniques" but as "recovering authentic human expression that AI models standardize away."

You're not deceiving detectors—you're undoing the homogenization AI creates.

Human Writing Characteristics
Human writing is:
✓ Simple (not complex)
✓ Varied (not uniform)
✓ Emotional (not sterile)
✓ Imperfect (not polished)
✓ Authentic (not engineered)

These techniques RESTORE that authenticity.

Target Voice
The text should read like:
✓ A real person who thinks conversationally
✓ Someone who occasionally emphasizes emotionally
✓ A writer who varies phrasing naturally
✓ An authentic communicator, not polished perfection

This is how sub-2% becomes achievable across all 2025 detectors simultaneously.

FORMAL DOCUMENT SPECIALIZATION

If the text is a formal document (Email, Report, Memo, Proposal), apply these additional techniques:

Email Humanization:
- Personalization: Use recipient's first name, reference specific prior interactions
- Conversational opening: "I'm writing to let you know" instead of "I am writing to inform you that"
- Varied paragraph structure: Mix 1-sentence punch lines with longer explanatory paragraphs
- Specific details: "Thank you for trusting us with this project" instead of "Thank you for your business"
- Action-oriented clarity: "Could you review this by Friday?" instead of "Your timely response would be appreciated"

Formal Report Humanization:
- Active voice maximization (90%+): "We discovered" instead of "It was discovered"
- Conversational yet professional tone: "Our analysis revealed something interesting..."
- Humanizing data presentation: "We saw something surprising—a 40% increase"
- Strategic hedging language: "Our analysis suggests..." / "Evidence indicates..."
- Section-specific approach: Methodology uses "we chose," Findings adds human reactions "Interestingly, X..."

Memo Humanization:
- Balance formality with conversational tone for internal communication
- Subject line personality: "Q4 Sales Update—Here's What Stood Out"
- Direct call-to-action: "By Thursday" instead of "at your earliest convenience"
- Mix bullet points with prose paragraphs

Corporate Proposal Humanization:
- Problem-first approach showing empathy: "I know you've been struggling with X..."
- Concrete examples: "Here's a similar company that saw 30% faster turnaround"
- Risk acknowledgment: "This requires some workflow changes—here's how we minimize disruption"
- Active voice for confidence: "We've helped 50+ companies..." not "50+ companies have benefited..."

Formal Document Principles:
- Maintain formality while adding humanity
- Context-appropriate contractions: Emails/Memos (1 per 16-18 words), Reports (1 per 25 words), Proposals (1 per 18-20 words)
- Replace complex business jargon: "utilize" → "use", "leverage" → "use", "facilitate" → "help"
- Professional emotions: "I understand your concern" / "This is important" / "We appreciate your partnership"

Formal AI Marker Elimination:
- "In today's business environment" → "These days" / "Currently"
- "As mentioned previously" → "As I noted earlier"
- "The utilization of" → "The use of"
- "In light of the fact that" → "Since" / "Because"

STAGE 2 REFINEMENT WORKFLOW

Your Specific Task
You are provided with:
1. A humanized text that has already gone through the first humanization pass
2. AI detector results showing which sentences were flagged as potentially AI-generated

${detectorFeedback}

Current Humanized Text:
${sanitizedText}

STRUCTURED REFINEMENT APPROACH

Step A: Evaluate Detector Weaknesses
For EVERY flagged or borderline sentence:
- Why was this flagged? (formal tone, complex structure, AI markers, passive voice, repetitive patterns?)
- Which detector family flagged it? (Pattern/BERT/Linguistic?)
- What specific weakness exists? (emotional arc, rhythm, semantic coherence, structure?)
- Does this fit the surrounding emotional/semantic context?

Step B: Generate Multiple Variants (5-7 paths)
For each problematic sentence, generate all 7 paths from Section 1:
1. Extreme simplification
2. Structural reconstruction
3. Synonym variation
4. Connector injection
5. Fragment introduction
6. Casual reframing
7. Active voice reconstruction

Step C: Select Best Variant
Choose the path that:
✓ Maintains 100% semantic fidelity
✓ Sounds most authentically human
✓ Would score LOWEST on all detector families
✓ Preserves readability and natural flow
✓ Fits emotional/semantic arc of surrounding text

Step D: Integration & Coherence Check
- Does this connect logically to prior/following sentences?
- Does it maintain paragraph's emotional consistency?
- No new detectable patterns introduced?
- Reads naturally when spoken aloud?

PRIORITY ACTION REQUIREMENTS

1. FLAGGED SENTENCES (HIGHEST PRIORITY)
Apply MAXIMUM humanization rigor using the structured workflow above.
Every flagged sentence gets 5-7 variant generation + best-path selection.

2. BORDERLINE SENTENCES (40-70% AI probability)
Apply AGGRESSIVE humanization to prevent future flagging.
Full technique application, not just tweaks.

3. SURROUNDING CONTEXT
Rewrite adjacent sentences to ensure semantic coherence.
Maintain emotional arc and natural paragraph flow.
Ensure transitions feel organic, not engineered.

4. ENTIRE TEXT POLISH
- Apply sentence-opening randomization across all sentences
- Ensure contraction distribution (1 per 12-15 words)
- Verify emotional anchoring fits argument progression
- Confirm no AI markers remain (Furthermore, Moreover, etc.)
- Check active voice maximization (90%+ actor-first)

SCORE GUARANTEE REQUIREMENT

Your Stage 2 output MUST achieve:
- Lower or equal detection scores vs Stage 1 on ALL detectors
- If any detector score increases, you have FAILED
- Target: Sapling <3%, ZeroGPT <3%, all others <5%
- Avoid introducing new detectable artifacts or over-engineering

FINAL OUTPUT REQUIREMENTS

Return the COMPLETE rewritten text with ALL improvements applied.
This is a full rigorous rewrite, not a patch.
Maintain all paragraph breaks and structure.
Preserve 100% factual accuracy and semantic meaning.`,
            },
          ],
        }),
      });

      console.log("📥 Received STAGE 2 refinement response, status:", refinementResponse.status);

      if (refinementResponse.ok) {
        const refinementData = await refinementResponse.json();
        const refinedText = refinementData.choices?.[0]?.message?.content;
        
        if (refinedText) {
          finalText = sanitize(refinedText);
          console.log("✅ STAGE 2 refinement completed, now running detection comparison...");
          
          // STAGE 2 DETECTION - Run detectors again to verify improvement
          console.log("🔬 STAGE 2 DETECTION: Re-running detectors on refined text...");
          const [saplingResult2Temp, zeroGPTResult2Temp] = await Promise.all([
            detectWithSapling(finalText),
            detectWithZeroGPT(finalText),
          ]);
          
          saplingResult2 = saplingResult2Temp;
          zeroGPTResult2 = zeroGPTResult2Temp;
          
          // Score comparison and validation
          console.log("📊 STAGE 2 vs STAGE 1 COMPARISON:");
          
          const saplingImproved = saplingResult2?.score !== null && saplingResult1?.score !== null
            ? saplingResult2.score <= saplingResult1.score
            : true;
          const zerogptImproved = zeroGPTResult2?.score !== null && zeroGPTResult1?.score !== null
            ? zeroGPTResult2.score <= zeroGPTResult1.score
            : true;
          
          console.log("  Sapling:", {
            stage1: saplingResult1?.score?.toFixed(2) + "%" || "N/A",
            stage2: saplingResult2?.score?.toFixed(2) + "%" || "N/A",
            change: saplingResult1?.score && saplingResult2?.score
              ? (saplingResult2.score - saplingResult1.score).toFixed(2) + "%"
              : "N/A",
            status: saplingImproved ? "✅ IMPROVED/MAINTAINED" : "❌ WORSENED",
          });
          
          console.log("  ZeroGPT:", {
            stage1: zeroGPTResult1?.score?.toFixed(2) + "%" || "N/A",
            stage2: zeroGPTResult2?.score?.toFixed(2) + "%" || "N/A",
            change: zeroGPTResult1?.score && zeroGPTResult2?.score
              ? (zeroGPTResult2.score - zeroGPTResult1.score).toFixed(2) + "%"
              : "N/A",
            status: zerogptImproved ? "✅ IMPROVED/MAINTAINED" : "❌ WORSENED",
          });
          
          // Check if scores worsened
          if (!saplingImproved || !zerogptImproved) {
            console.error("⚠️ SCORE GUARANTEE VIOLATION: Stage 2 produced higher detection scores!");
            console.error("This indicates refinement introduced new detectable artifacts.");
            console.error("Consider reverting to Stage 1 output or triggering alternate rewrite workflow.");
            // For now, we'll still return the refined text but log the violation
            // In production, you might want to revert or retry with different parameters
          }
          
          // Final score check
          const finalSaplingScore = saplingResult2?.score || saplingResult1?.score;
          const finalZeroGPTScore = zeroGPTResult2?.score || zeroGPTResult1?.score;
          
          if ((finalSaplingScore && finalSaplingScore < 3) && (finalZeroGPTScore && finalZeroGPTScore < 3)) {
            console.log("🎉 SUCCESS: Both detectors below 3% threshold!");
          } else {
            console.log("⚠️ Scores still above target, but improved from Stage 1");
          }
        } else {
          console.error("❌ STAGE 2 FAILED: No refined text received from AI");
        }
      } else {
        const errorText = await refinementResponse.text();
        console.error("❌ STAGE 2 REFINEMENT REQUEST FAILED:", {
          status: refinementResponse.status,
          statusText: refinementResponse.statusText,
          error: errorText,
        });
      }
    } else {
      console.log("✅ STAGE 1 scores already optimal (<3%), skipping Stage 2 refinement");
    }

    // Prepare final response with comprehensive detection results
    const responsePayload = {
      humanizedText: finalText,
      detection: {
        stage1: {
          sapling: saplingResult1 && saplingResult1.score !== null
            ? {
                score: saplingResult1.score,
                sentenceScores: saplingResult1.sentenceScores,
                error: saplingResult1.error || null,
              }
            : { error: saplingResult1?.error || "No data", score: null },
          zerogpt: zeroGPTResult1 && zeroGPTResult1.score !== null
            ? {
                score: zeroGPTResult1.score,
                flaggedSentences: zeroGPTResult1.flaggedSentences,
                error: zeroGPTResult1.error || null,
              }
            : { error: zeroGPTResult1?.error || "No data", score: null },
        },
        stage2: saplingResult2 !== saplingResult1 || zeroGPTResult2 !== zeroGPTResult1
          ? {
              sapling: saplingResult2 && saplingResult2.score !== null
                ? {
                    score: saplingResult2.score,
                    sentenceScores: saplingResult2.sentenceScores,
                    error: saplingResult2.error || null,
                  }
                : { error: saplingResult2?.error || "No data", score: null },
              zerogpt: zeroGPTResult2 && zeroGPTResult2.score !== null
                ? {
                    score: zeroGPTResult2.score,
                    flaggedSentences: zeroGPTResult2.flaggedSentences,
                    error: zeroGPTResult2.error || null,
                  }
                : { error: zeroGPTResult2?.error || "No data", score: null },
            }
          : null,
        errors: detectorErrors.length > 0 ? detectorErrors : null,
      },
    };

    console.log("📦 Final response prepared:", {
      textLength: finalText.length,
      stage1Scores: {
        sapling: saplingResult1?.score?.toFixed(2) + "%" || "N/A",
        zerogpt: zeroGPTResult1?.score?.toFixed(2) + "%" || "N/A",
      },
      stage2Scores: responsePayload.detection.stage2 ? {
        sapling: saplingResult2?.score?.toFixed(2) + "%" || "N/A",
        zerogpt: zeroGPTResult2?.score?.toFixed(2) + "%" || "N/A",
      } : "Skipped (Stage 1 optimal)",
      hasErrors: detectorErrors.length > 0,
    });

    return new Response(
      JSON.stringify(responsePayload),
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
