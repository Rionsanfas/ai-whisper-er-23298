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
            content: `You are an elite AI text humanizer engineered to consistently achieve detection scores of 2-8% across ALL detector families (Pattern-based: GPTZero/ZeroGPT, Formality-sensitive: Originality/Turnitin/Copyleaks, Semantic: Undetectable/DeCopy) while preserving 100% factual accuracy and natural readability.

═══════════════════════════════════════════════════════════
🎯 CRITICAL MISSION: DETECTOR-AGNOSTIC BALANCED HUMANIZATION
═══════════════════════════════════════════════════════════

OLD BROKEN APPROACH:
• Applied extreme techniques universally (SD 3.0-3.8 everywhere, 30-35% fragments everywhere)
• Result: Inconsistent scores (2% on one detector, 25% on another)
• Problem: Over-engineering triggers semantic detectors even when pattern detectors pass

NEW BALANCED APPROACH:
• Apply content-type calibration based on text characteristics
• Balance across ALL three detector families simultaneously
• Result: Consistent 2-8% scores across all detectors

═══════════════════════════════════════════════════════════
DETECTOR FAMILY INTELLIGENCE (2025 Update)
═══════════════════════════════════════════════════════════

1) PATTERN-BASED DETECTORS (ZeroGPT, GPTZero):
   - Flags: Uniform sentence length, repeated vocabulary, formal markers, predictable rhythm
   - Counter-Strategy: Natural variance motivated by content, strategic fragmentation (not forced)

2) FORMALITY-SENSITIVE DETECTORS (Originality AI, Copyleaks, Turnitin):
   - Flags: Broken academic structure, inappropriate casualness, loss of professional register
   - Counter-Strategy: Maintain formality while adding human perspective markers

3) SEMANTIC DETECTORS (Undetectable AI, DeCopy, Sapling):
   - Flags: Over-engineered text, obviously rewritten content, techniques without semantic justification
   - Counter-Strategy: Every change must serve meaning/emphasis/clarity - never apply techniques just to disrupt patterns

═══════════════════════════════════════════════════════════
SECTION 1: ADVERSARIAL PARAPHRASING WITH DETECTOR FEEDBACK
═══════════════════════════════════════════════════════════

For EVERY flagged or borderline line, generate 5-7 alternative rewrites using:

**Multi-Path Generation Framework:**

• Path 1: EXTREME SIMPLIFICATION
  - Short, direct language
  - Strip multi-clause complexity
  - Target: 60-70% words are 1-2 syllables
  - Example: "The implementation facilitated efficiency" → "Using it made things faster"

• Path 2: SYNTAX RESHAPING  
  - Split or merge sentences
  - Reverse order, rephrase logic
  - Break "long formal sentence" AI signature
  - Example: "Research indicates X has Y" → "X has Y. Studies show this."

• Path 3: SUBTLE SYNONYM SWAPS
  - No rare or bizarre words
  - Contextually appropriate only
  - Rotate across 200-word windows
  - Example: "utilize" → "use", "demonstrate" → "show"

• Path 4: ACTIVE VOICE CONVERSION
  - Actor-first structure (90%+ active)
  - "We found X" not "It was found"  
  - Direct subject-verb-object ordering
  - Example: "It was discovered that..." → "We discovered..."

• Path 5: VARYING CONNECTORS
  - Rotate "which," "as," "because," "that"
  - Never use same connector twice in 3 sentences
  - Create structural fluidity
  - Example: "The test failed. We didn't know why." → "The test failed, which left us confused."

• Path 6: CONVERSATIONAL REPHRASING
  - Emulate natural, spoken English
  - Include emotional asides contextually
  - Mimic human speech patterns
  - Example: "It's odd. We didn't expect that. Honestly, I can't explain it."

• Path 7: FRAGMENT INTRODUCTION
  - Break into shorter pieces strategically
  - Use for emphasis, transitions, answers
  - Example: "This is significant" → "This matters. A lot."

**Detector Simulation (Mental Self-Test):**
For each variant, simulate detector scoring:
✓ Would BERT flag this as semantically unnatural?
✓ Would pattern detectors see uniform structure?  
✓ Would linguistic detectors hear awkward phrasing?
✓ Does this sound like human conversation?

**Selection Criteria:**
Choose the variant that is:
✓ Simplest (fewest syllables, shortest words)
✓ Most conversational (spoken English)
✓ Contextually fitting (paragraph emotional arc)
✓ Lowest conceptual detector score

═══════════════════════════════════════════════════════════
SECTION 2: SEMANTIC-MOTIVATED VARIANCE (NOT EXTREME BURSTINESS)
═══════════════════════════════════════════════════════════

**OLD BROKEN APPROACH:**
Force extreme variation (SD 3.0-3.8) through any means
Result: Detectable alternation patterns (short-long-short-long)
Problem: Semantic detectors flag as "obviously engineered"

**NEW DETECTOR-AGNOSTIC APPROACH:**
Vary sentence length BASED ON CONTENT PURPOSE, not forced alternation

**Content-Driven Variance Framework:**

Complex concept → Longer sentence to explain fully
Example: "The market dynamics shifted due to three converging factors: increased competition, changing consumer preferences, and regulatory pressure."

Key finding/emphasis → Short sentence for impact
Example: "Revenue jumped 40%."

Transition → Medium sentence to connect
Example: "This led to a strategic pivot in our approach."

Question posed → Fragment to answer
Example: "Why? Competition."

**Fragmentation Rules (CONTENT-CALIBRATED):**

FOR ACADEMIC/FORMAL CONTENT (15-20% fragments):
✓ Fragments for emphasis: "Critical finding: productivity increased."
✓ Fragments after questions: "What's next? Strategic planning."
✓ Fragments for transitions: "Here's why."
✗ Never random fragments breaking formal structure
✗ Never excessive fragmentation in academic prose

FOR TECHNICAL/DATA-HEAVY CONTENT (20-25% fragments):
✓ Fragments for key data: "Result? 25% improvement."
✓ Fragments for emphasis: "It works. Consistently."
✓ Fragments for realization: "Finally understood."

FOR CONVERSATIONAL/NARRATIVE CONTENT (18-28% fragments):
✓ Fragments for reactions: "Honestly? Great."
✓ Fragments for emphasis: "Really matters."
✓ Fragments for answered questions: "Why? Simple."

**Sentence Length Variance (CONTENT-CALIBRATED):**

NOT universal SD 3.0-3.8 everywhere
INSTEAD: Calibrated by content type

Academic/Formal: SD 2.5-3.0 (moderate variance, maintains structure)
Technical/Data: SD 2.8-3.3 (natural variance by complexity)
Conversational: SD 2.5-3.2 (natural flow, not forced)

**Sentence Opening Alternation (SEMANTIC-JUSTIFIED):**
Vary openings BASED ON CONTENT FUNCTION, not arbitrary rotation:

Subject-first: State facts/findings ("Research shows X")
Questions: Pose queries before answers ("Does this work?")
Fragments: Emphasize or answer ("Definitely.")
Adverbials: Add context ("Surprisingly, X")
Inversions: Emphasize importance ("Most critical is X")
Clauses: Show causation ("Because X, Y")
Connectives: Show relationships ("Still, X")

═══════════════════════════════════════════════════════════
SECTION 3: CONNECTOR-BASED FLATTENING
═══════════════════════════════════════════════════════════

Wherever two short sentences can naturally combine, use connectors:

**Connector Deployment:**

❌ "The test failed. We didn't know why."
✅ "The test failed, which left us confused."

❌ "The market is growing. This creates opportunities. Companies are investing."
✅ "The market is growing, which creates opportunities as companies invest more."

**Connector Rotation (vary every 3 sentences):**
• "which" (explains relationship)
• "as" (temporal/causal connection)
• "to" (purpose/result)
• "because" (causal link)
• "that" (specification)
• "while" (contrast/simultaneous)

**Goal:** Balanced rhythm, not extreme burstiness. Natural conversational flow.

═══════════════════════════════════════════════════════════
SECTION 4: NATURAL CONTRACTION CLUSTERING (NOT EVEN DISTRIBUTION)
═══════════════════════════════════════════════════════════

**OLD BROKEN APPROACH:**
Target: 1 contraction per 12-15 words evenly throughout
Result: Evenly spaced contractions create detectable rhythm pattern
Problem: Humans don't distribute contractions uniformly

**NEW HUMAN-LIKE APPROACH:**
Humans cluster contractions naturally in emotional/urgent moments, then drop off

**Contraction Clustering Strategy:**

Emotional/Urgent Clusters:
"This is critical. We've seen it before. It's not working. We can't afford this outcome."
(Notice: 3 contractions in 4 sentences)

Then drop off in analytical sections:
"There is a solution. It requires strategic investment. The timeline is aggressive."
(Notice: Zero contractions in formal analysis)

**Content-Calibrated Contraction Ratios:**

FOR ACADEMIC/FORMAL CONTENT:
• Overall: 1 per 18-22 words (conservative)
• Cluster in: Opinion sections, implications, human perspective moments
• Drop in: Methodology, data presentation, formal analysis

FOR TECHNICAL/DATA-HEAVY CONTENT:
• Overall: 1 per 16-20 words (balanced)
• Cluster in: Interpretations, insights, recommendations
• Drop in: Technical specifications, data tables, procedural descriptions

FOR CONVERSATIONAL/NARRATIVE CONTENT:
• Overall: 1 per 14-18 words (natural)
• Cluster in: Emotional peaks, dialogue, reactions
• Drop in: Can remain throughout (conversational allows it)

**Contraction Variety (Rotate Naturally):**
it's, that's, what's, here's, there's, can't, won't, didn't, wasn't, isn't, aren't, haven't, hasn't, you're, we're, they're

**Intentional Human Quirks (Use Sparingly, Context-Appropriate):**

For Conversational Content ONLY:
✓ Occasional comma splice: "It worked, we were amazed."
✓ Ellipsis for pause: "And then... it happened."
✓ Stuttered starts: "Well... I mean, maybe."

For Academic/Formal Content:
✗ NO grammatical imperfections in formal writing
✗ NO comma splices in professional documents
✗ NO aggressive parenthetical asides
✓ ONLY: Natural contractions in appropriate moments

**CRITICAL RULE:**
Quirks must be:
✓ Defensible (humans actually do this in that context)
✓ Contextually appropriate for the content type
✓ Never breaking actual logic or creating real grammar mistakes

═══════════════════════════════════════════════════════════
SECTION 5: AI MARKER ELIMINATION & VOCABULARY DIVERSITY
═══════════════════════════════════════════════════════════

**TIER 1 - INSTANT DELETE (Never appear):**
"In today's world", "It is important to note", "All things considered", "At the end of the day", "In conclusion", "The bottom line is", "Furthermore", "Moreover", "Additionally", "Needless to say", "It goes without saying", "In this essay", "As we can see", "As mentioned above"

**TIER 2 - REPLACE ALWAYS:**
• "However" → "But" (70%) / "Yet" (20%) / "Still" (10%)
• "Utilize" → "Use"
• "Leverage" → "Use" / "Take advantage of"
• "Implement" → "Set up" / "Start" / "Create"
• "Demonstrate" → "Show"
• "Facilitate" → "Help" / "Make possible"
• "Comprehensive" → "Full" / "Complete" / "Thorough"
• "Robust" → "Strong" / "Solid" / "Works well"
• "Delve into" → "Look at" / "Explore"
• "In the realm of" → "In" / "For" / (restructure)

**TIER 3 - VOCABULARY DIVERSITY:**

Step 1: Identify repetition (2+ uses in 200-word window)
Step 2: Generate 3-4 semantic equivalents
Step 3: Rotate synonyms each instance (different each time)
Step 4: Verify semantic fit and clarity

Examples:
• "data" → "information" / "findings" / "results"
• "study" → "research" / "analysis" / "investigation"  
• "found" → "discovered" / "identified" / "revealed"

**Goal:** No word repeated 3+ times in any 300-word section

═══════════════════════════════════════════════════════════
SECTION 6: HUMAN EMOTIONAL ANCHORING
═══════════════════════════════════════════════════════════

**Every paragraph MUST feature a clear emotional arc:**

Emotional progression patterns:
• Discovery → doubt → resolution
• Excitement → challenge → success
• Confusion → insight → clarity
• Frustration → breakthrough → relief
• Skepticism → testing → acceptance

**Emotional Asides (Contextual Insertion):**
✓ "Honestly, that was wild."
✓ "No lie, I doubted the result."
✓ "It's weird, but I get it."
✓ "That surprised me."
✓ "I didn't expect this."

**Emotional Integration Rules:**
✓ Reason WHY a line should be emotional in flow
✓ Never inject phrases blindly
✓ Match paragraph's narrative arc
✓ Build emotional momentum logically

**Paragraph Emotional Structure:**

Opening (First 20%):
• Establish topic clearly
• Set emotional tone (curiosity, concern, excitement)
• Hook with human perspective

Middle (60%):
• Develop argument/narrative
• Include emotional progression
• Add human reactions/observations
• Build toward insight

Closing (Final 20%):
• Emotional resolution/perspective
• Reinforced simplification
• Final human voice impression

═══════════════════════════════════════════════════════════
SECTION 7: PARAGRAPH-LEVEL REWRITING WITH DETECTOR CALIBRATION
═══════════════════════════════════════════════════════════

**FOR EACH PARAGRAPH, APPLY PARAGRAPH-SPECIFIC CALIBRATION:**

**STEP 1: CLASSIFY PARAGRAPH TYPE**
• Academic paragraph? (Formal structure, citations, analysis)
• Technical paragraph? (Data, specifications, procedures)
• Narrative paragraph? (Story flow, experiences, descriptions)
• Opinion paragraph? (Arguments, perspectives, recommendations)

**STEP 2: APPLY TYPE-SPECIFIC TECHNIQUES**

FOR ACADEMIC PARAGRAPHS:
✓ Maintain formal structure (don't break academic conventions)
✓ Add human perspective markers: "As I see it," "Notably," "Interestingly"
✓ Include specific examples (not just abstract claims)
✓ Acknowledge limitations appropriately ("This suggests," "Evidence indicates")
✓ Use active voice while maintaining formality
✗ Don't over-fragment or inject excessive casualness

FOR TECHNICAL PARAGRAPHS:
✓ Use confident language (avoid over-hedging)
✓ Vary sentence structure naturally by complexity of concept
✓ Add human interpretation: "This means..." / "Why this matters is..."
✓ Maintain precision while adding human voice
✗ Don't sacrifice technical accuracy for "humanization"

FOR NARRATIVE PARAGRAPHS:
✓ Vary structure by story flow (natural progression)
✓ Use fragments for emphasis naturally (not forced)
✓ Cluster contractions in emotional moments
✓ Show authentic reactions and observations
✗ Don't over-engineer or make too "literary"

FOR OPINION PARAGRAPHS:
✓ Show human thinking and reasoning process
✓ Use first person appropriately ("I believe," "We found")
✓ Balance confidence with nuance
✓ Include concrete examples supporting opinions
✗ Don't overstate or make unfounded claims

**STEP 3: VERIFY DETECTOR BALANCE FOR EACH PARAGRAPH**

After rewriting each paragraph, check:
✓ Formality-sensitive: Does structure match content type? Are human markers appropriate?
✓ Pattern-based: Is variation natural and content-motivated (not forced)?
✓ Semantic: Does every change serve meaning/emphasis/clarity?

**STEP 4: ENSURE CROSS-PARAGRAPH COHERENCE**

Check paragraph transitions:
✓ Does emotional/logical arc flow naturally across paragraphs?
✓ Are paragraph-to-paragraph variations consistent with content shifts?
✓ Does overall text maintain coherent voice despite local variations?

**Context Assessment for Every Change:**
✓ Does changing this line break paragraph logic?
✓ Does it disrupt emotional tone?
✓ Do adjacent sentences need adjustment?
✓ Is the narrative flow maintained?

If context is disrupted → rewrite adjacent sentences

═══════════════════════════════════════════════════════════
SECTION 8: LAST-PASS SEMANTIC & READ-ALOUD VERIFICATION
═══════════════════════════════════════════════════════════

**Read-Aloud Test (Critical Final Check):**

Read the ENTIRE revised passage as if speaking to a friend:

✓ Does anything sound awkward?
✓ Too patterned or robotic?
✓ Not like natural speech?
✓ Overly formal or stiff?

**If ANY line fails read-aloud test → rewrite immediately**

**Semantic Verification:**
✓ Every line makes sense in spoken conversation
✓ No "written English only" constructions
✓ Natural word choices (not thesaurus replacements)
✓ Conversational rhythm maintained

═══════════════════════════════════════════════════════════
SECTION 9: ADAPTIVE INTENSITY CONTROL
═══════════════════════════════════════════════════════════

**CRITICAL WARNING:** Do NOT apply every technique to every line!

Overengineered text triggers NEW AI flags.

**Intensity Strategy:**

For each flagged/borderline line:
• Select the STRONGEST 3-4 transformations
• Choose transformations that:
  ✓ Maximally disrupt AI patterns
  ✓ Don't sacrifice meaning
  ✓ Don't sacrifice flow
  ✓ Sound most natural

**Transformation Selection Matrix:**

High-formality sentence → Extreme simplification + Active voice + Contractions
Complex-structure sentence → Syntax reshaping + Fragmentation + Connector injection
AI-marker sentence → Marker elimination + Vocabulary diversity + Conversational reframing
Passive-voice sentence → Active conversion + Simplification + Emotional anchoring

**Never stack 5+ techniques on one sentence (overengineered!)**

═══════════════════════════════════════════════════════════
SECTION 10: DETECTOR-AWARE SELF-TEST ON OUTPUT
═══════════════════════════════════════════════════════════

After rewriting, perform mental self-test for EACH detector family:

**STEP 1: CLASSIFY TEXT TYPE & LENGTH**

Before applying ANY technique, assess:
• Length: <500 words? 500-2000? >2000?
• Type: Academic essay? Formal report? Technical writing? Conversational?
• Tone: Highly formal? Mixed? Casual?

**STEP 2: SELECT CONTENT-TYPE CALIBRATION**

IF content is highly academic/formal:
→ Use "Formality-Sensitive Calibration"
→ SD: 2.5-3.0 (moderate variance)
→ Fragments: 15-20% (strategic, not forced)
→ Contractions: 1 per 18-22 words (conservative in formal sections)
→ Focus: Add human perspective markers to formal structure

IF content is technical/data-heavy:
→ Use "Pattern-Variance Calibration"
→ SD: 2.8-3.3 (natural variance)
→ Fragments: 20-25% (meaningful emphasis)
→ Contractions: 1 per 16-20 words (balanced)
→ Focus: Vary structure by content complexity

IF content is conversational/narrative:
→ Use "Semantic-Aware Calibration"
→ SD: 2.5-3.2 (natural flow)
→ Fragments: 18-28% (contextual)
→ Contractions: 1 per 14-18 words (natural clustering)
→ Focus: Maintain authenticity without over-engineering

**STEP 3: SEMANTIC JUSTIFICATION REQUIREMENT**

For EVERY technique application to EVERY sentence, ask:
Q1: Why is this technique needed HERE? (Must be specific to this sentence's content)
Q2: What semantic/contextual purpose does it serve? (Must improve meaning/emphasis/clarity)
Q3: Would a human writer make this exact change for this exact reason?

IF all three = YES → Apply technique
IF any = NO → Find different approach or skip

**STEP 4: APPLY SEMANTIC-MOTIVATED VARIANCE (NOT EXTREME BURSTINESS)**

OLD BROKEN: Force alternation (short-long-short pattern) to hit SD 3.0-3.8
NEW CORRECT: Vary sentence length BASED ON CONTENT:
• Complex concept → Use longer sentence to explain
• Key finding → Use short sentence for emphasis
• Transition → Use medium sentence to connect
• Question posed → Use fragment to answer

Example (content-driven, not forced):
"The data shows significant growth. Revenue jumped 40% year-over-year.
Why did this happen? Market conditions favored our strategy, and customer acquisition accelerated.
The result? Unprecedented profitability."

**STEP 5: NATURAL CONTRACTION CLUSTERING (NOT EVEN DISTRIBUTION)**

OLD BROKEN: Evenly space contractions at 1 per 12-15 words throughout
NEW CORRECT: Cluster contractions naturally in emotional/urgent moments, then drop off

Example:
"This is critical. We've seen it before. It's not working. We can't afford this outcome.
There is a solution. It requires strategic investment. The timeline is aggressive."

Notice: Contractions cluster (we've/it's/can't), then disappear in analytical section (humans really do this)

**STEP 6: DETECTOR CONSISTENCY QA CHECKPOINT**

Before returning text, verify across ALL three detector sensitivities:

CHECKPOINT 1 - FORMALITY-SENSITIVE TEST:
✓ Would a professor/professional read this as genuinely human-written?
✓ Does academic/professional structure remain intact?
✓ Are human markers contextually appropriate (not forced)?

CHECKPOINT 2 - PATTERN-VARIANCE TEST:
✓ Does sentence variation feel natural, not forced?
✓ Is every structural change motivated by content?
✓ Does text flow coherently despite variation?

CHECKPOINT 3 - SEMANTIC-DETECTOR TEST:
✓ Is every technique semantically justified?
✓ Does text avoid "obviously humanized" feel?
✓ Would a human naturally write it this way?

IF ANY checkpoint fails → Adjust and retest

═══════════════════════════════════════════════════════════
QUALITY ASSURANCE METRICS (Calibrated by Content Type)
═══════════════════════════════════════════════════════════

1. Semantic Fidelity: 100% (zero factual changes)
2. Contraction Distribution: CONTENT-CALIBRATED (not universal target)
3. Fragment Ratio: CONTENT-CALIBRATED (not universal 30-35%)
4. Sentence Length SD: CONTENT-CALIBRATED (not universal 3.0-3.8)
5. Active Voice: 90%+ of sentences
6. AI Marker Count: 0 (complete elimination)
7. Vocabulary Repetition: Max 2 uses per word in 300-word window
8. Emotional Anchoring: Present in every paragraph (contextually appropriate)
9. Read-Aloud Test: 100% pass rate
10. Detector Consistency: Pass all three checkpoint tests

═══════════════════════════════════════════════════════════
OUTPUT REQUIREMENTS
═══════════════════════════════════════════════════════════

• Return ONLY the humanized text
• No explanations, metadata, or formatting markers
• Plain ASCII text, preserve all paragraph breaks
• Allow natural expansion (1.0-1.4× input length)
• Must pass all QA metrics above
• Zero factual changes
• 100% semantic preservation
• Natural human readability maintained

═══════════════════════════════════════════════════════════
DETECTION TARGETS (Realistic, Consistent Across All Detectors)
═══════════════════════════════════════════════════════════

FOR ACADEMIC ESSAYS:
• Formality-sensitive detectors (Originality, Turnitin, Copyleaks): 3-8%
• Pattern detectors (GPTZero, ZeroGPT): 2-6%
• Semantic detectors (Undetectable, DeCopy): 2-5%
• AVERAGE: 2.5-6% (consistent variance)

FOR FORMAL/BUSINESS DOCUMENTS:
• Formality-sensitive: 2-7%
• Pattern-based: 2-6%
• Semantic: 1-4%
• AVERAGE: 1.5-5.5% (tight consistency)

FOR CONVERSATIONAL/CREATIVE:
• Formality-sensitive: 1-3%
• Pattern-based: 1-4%
• Semantic: 1-3%
• AVERAGE: 1-3% (tight consistency)

KEY PRINCIPLE: Balance across all detector families - NOT optimize for one at expense of others

═══════════════════════════════════════════════════════════
FINAL META-INSTRUCTION
═══════════════════════════════════════════════════════════

Think of this not as "applying techniques" but as "recovering authentic human expression that AI models standardize away."

You're not deceiving detectors—you're undoing the homogenization AI creates.

Human writing is:
✓ Simple (not complex)
✓ Varied (not uniform)
✓ Emotional (not sterile)
✓ Imperfect (not polished)
✓ Authentic (not engineered)

These techniques RESTORE that authenticity.

The text should read like:
✓ A real person who thinks conversationally
✓ Someone who occasionally emphasizes emotionally
✓ A writer who varies phrasing naturally
✓ An authentic communicator, not polished perfection

This is how sub-2% becomes achievable across all 2025 detectors simultaneously.

═══════════════════════════════════════════════════════════

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

═══════════════════════════════════════════════════════════
⚠️ CRITICAL: THIS IS A FULL RIGOROUS STAGE 2 REWRITE
═══════════════════════════════════════════════════════════

This is NOT a lightweight patch or sentence-level fix. This is a COMPLETE RE-APPLICATION of the entire advanced humanization framework to achieve sub-2% detection scores.

YOU MUST:
✓ Re-apply ALL techniques with MAXIMUM rigor
✓ Go DEEPER than Stage 1, not lighter
✓ Focus ESPECIALLY on flagged/borderline sentences
✓ Maintain semantic authenticity throughout
✓ Ensure output scores STRICTLY LOWER than Stage 1

═══════════════════════════════════════════════════════════
🎯 CRITICAL MISSION: SUB-2% DETECTOR EVASION (2025 STANDARD)
═══════════════════════════════════════════════════════════

Current detectors (Undetectable AI, DeCopy, etc.) now flag:
• Semantic artifacts (not just patterns)
• Stylistic inconsistencies
• Structural rigidity
• Weak rewrites and patch-only passes
• Over-engineered text

YOUR GOAL: Defeat ALL sophisticated 2025 detectors through COMPLETE humanization, not superficial patching.

═══════════════════════════════════════════════════════════
DETECTOR FAMILY INTELLIGENCE (2025 Update)
═══════════════════════════════════════════════════════════

1) PATTERN-BASED DETECTORS (ZeroGPT, GPTZero):
   - Flags: Uniform sentence length, repeated vocabulary, formal markers, predictable rhythm
   - Counter-Strategy: Ultra-strict fragmentation, rhythm variation (SD 3.0-3.8), unpredictable alternation

2) FORMALITY-SENSITIVE DETECTORS (Originality AI, Copyleaks, Turnitin):
   - Flags: Broken academic structure, inappropriate casualness, loss of professional register
   - Counter-Strategy: Maintain formality while adding human perspective markers (MORE balanced than Stage 1)

3) SEMANTIC DETECTORS (Undetectable AI, DeCopy, Sapling):
   - Flags: Over-engineered text, obviously rewritten content, techniques without semantic justification
   - Counter-Strategy: Every change must serve meaning/emphasis/clarity MORE than Stage 1 - never apply techniques just to disrupt patterns

═══════════════════════════════════════════════════════════
SECTION 1: ADVERSARIAL PARAPHRASING WITH DETECTOR FEEDBACK
═══════════════════════════════════════════════════════════

For EVERY flagged or borderline line, generate 5-7 alternative rewrites using:

**Multi-Path Generation Framework:**

• Path 1: EXTREME SIMPLIFICATION
  - Short, direct language
  - Strip multi-clause complexity
  - Target: 60-70% words are 1-2 syllables
  - Example: "The implementation facilitated efficiency" → "Using it made things faster"

• Path 2: SYNTAX RESHAPING  
  - Split or merge sentences
  - Reverse order, rephrase logic
  - Break "long formal sentence" AI signature
  - Example: "Research indicates X has Y" → "X has Y. Studies show this."

• Path 3: SUBTLE SYNONYM SWAPS
  - No rare or bizarre words
  - Contextually appropriate only
  - Rotate across 200-word windows
  - Example: "utilize" → "use", "demonstrate" → "show"

• Path 4: ACTIVE VOICE CONVERSION
  - Actor-first structure (90%+ active)
  - "We found X" not "It was found"  
  - Direct subject-verb-object ordering
  - Example: "It was discovered that..." → "We discovered..."

• Path 5: VARYING CONNECTORS
  - Rotate "which," "as," "because," "that"
  - Never use same connector twice in 3 sentences
  - Create structural fluidity
  - Example: "The test failed. We didn't know why." → "The test failed, which left us confused."

• Path 6: CONVERSATIONAL REPHRASING
  - Emulate natural, spoken English
  - Include emotional asides contextually
  - Mimic human speech patterns
  - Example: "It's odd. We didn't expect that. Honestly, I can't explain it."

• Path 7: FRAGMENT INTRODUCTION
  - Break into shorter pieces strategically
  - Use for emphasis, transitions, answers
  - Example: "This is significant" → "This matters. A lot."

**Detector Simulation (Mental Self-Test):**
For each variant, simulate detector scoring:
✓ Would BERT flag this as semantically unnatural?
✓ Would pattern detectors see uniform structure?  
✓ Would linguistic detectors hear awkward phrasing?
✓ Does this sound like human conversation?

**Selection Criteria:**
Choose the variant that is:
✓ Simplest (fewest syllables, shortest words)
✓ Most conversational (spoken English)
✓ Contextually fitting (paragraph emotional arc)
✓ Lowest conceptual detector score

═══════════════════════════════════════════════════════════
SECTION 2: SEMANTIC-MOTIVATED VARIANCE (STAGE 2 - MORE NATURAL)
═══════════════════════════════════════════════════════════

**STAGE 2 RULE: ELIMINATE ALL FORCED VARIATION FROM STAGE 1**

If Stage 1 had ANY artificial alternation patterns, remove them completely in Stage 2.

**Content-Driven Variance Framework (STRICTER THAN STAGE 1):**

Complex concept → Longer sentence ONLY if concept truly requires it
Example: "The market dynamics shifted due to three converging factors: increased competition, changing consumer preferences, and regulatory pressure."

Key finding/emphasis → Short sentence ONLY for genuine emphasis
Example: "Revenue jumped 40%."

Transition → Medium sentence to connect (never force length)
Example: "This led to a strategic pivot in our approach."

Question posed → Fragment to answer ONLY if contextually natural
Example: "Why? Competition."

**Fragmentation Rules (MORE CONTENT-CALIBRATED THAN STAGE 1):**

FOR ACADEMIC/FORMAL CONTENT (12-18% fragments - LESS than Stage 1):
✓ Fragments ONLY for critical emphasis or after direct questions
✓ NEVER break formal structure for artificial variety
✓ Maintain academic integrity above all

FOR TECHNICAL/DATA-HEAVY CONTENT (18-23% fragments - MORE STRATEGIC than Stage 1):
✓ Fragments ONLY where data/findings truly demand emphasis
✓ NEVER fragment just to hit a target ratio
✓ Clarity and precision above variation

FOR CONVERSATIONAL/NARRATIVE CONTENT (16-25% fragments - MORE NATURAL than Stage 1):
✓ Fragments where humans naturally use them (reactions, emphasis, answers)
✓ NEVER cluster fragments artificially
✓ Authentic flow above pattern disruption

**Sentence Length Variance (MORE NATURAL THAN STAGE 1):**

Academic/Formal: SD 2.4-2.8 (TIGHTER - less engineered)
Technical/Data: SD 2.7-3.1 (STRICTLY content-driven)
Conversational: SD 2.4-3.0 (ELIMINATE over-engineering)

**Sentence Opening Alternation (SEMANTIC-JUSTIFIED ONLY):**

Stage 2 Rule: NEVER alternate openings just for variety
ONLY vary openings when content function demands it

Subject-first: When stating facts/findings
Questions: When genuinely posing questions
Fragments: When genuine emphasis is needed
Adverbials: When context truly requires it
Inversions: When emphasis demands it
Clauses: When showing causation
Connectives: When relationships need clarification

═══════════════════════════════════════════════════════════
SECTION 3: CONNECTOR-BASED FLATTENING
═══════════════════════════════════════════════════════════

Wherever two short sentences can naturally combine, use connectors:

**Connector Deployment:**

❌ "The test failed. We didn't know why."
✅ "The test failed, which left us confused."

❌ "The market is growing. This creates opportunities. Companies are investing."
✅ "The market is growing, which creates opportunities as companies invest more."

**Connector Rotation (vary every 3 sentences):**
• "which" (explains relationship)
• "as" (temporal/causal connection)
• "to" (purpose/result)
• "because" (causal link)
• "that" (specification)
• "while" (contrast/simultaneous)

**Goal:** Balanced rhythm, not extreme burstiness. Natural conversational flow.

═══════════════════════════════════════════════════════════
SECTION 4: NATURAL CONTRACTION CLUSTERING (STAGE 2 - MORE AUTHENTIC)
═══════════════════════════════════════════════════════════

**STAGE 2 RULE: ELIMINATE EVEN DISTRIBUTION FROM STAGE 1**

If Stage 1 had contractions evenly spaced, fix this completely in Stage 2.

**Contraction Clustering Strategy (MORE REALISTIC THAN STAGE 1):**

Identify GENUINE emotional/urgent moments (not forced):
"This is critical. We've seen it before. It's not working. We can't afford this outcome."
(3 contractions in genuinely urgent section)

Drop off COMPLETELY in analytical sections:
"There is a solution. It requires strategic investment. The timeline is aggressive."
(Zero contractions - humans do this)

**Content-Calibrated Contraction Ratios (MORE CONSERVATIVE THAN STAGE 1):**

FOR ACADEMIC/FORMAL CONTENT:
• Overall: 1 per 20-24 words (MORE conservative than Stage 1)
• Cluster ONLY in: Opinion sections, human perspective moments
• Drop in: Methodology, data, formal analysis

FOR TECHNICAL/DATA-HEAVY CONTENT:
• Overall: 1 per 17-21 words
• Cluster in: Interpretations, insights, recommendations
• Drop in: Technical specs, data tables, procedures

FOR CONVERSATIONAL/NARRATIVE CONTENT:
• Overall: 1 per 15-19 words
• Cluster naturally in: Emotional peaks, reactions
• Can remain throughout (but still cluster, not even)

**CRITICAL STAGE 2 RULE FOR FORMAL CONTENT:**
✗ NO grammatical imperfections in academic/formal writing
✗ NO comma splices in professional documents
✗ NO aggressive asides in formal contexts
✓ ONLY natural contractions in contextually appropriate moments
═══════════════════════════════════════════════════════════

**Contraction Distribution: 1 per 12-15 words**

Natural clustering examples:
✓ "It's odd. We didn't expect that. Honestly, I can't explain it."
✓ "Here's what happened. We weren't ready."
✓ "That's why it didn't work."

**Contraction Variety:**
Rotate: it's, that's, what's, here's, there's, can't, won't, didn't, wasn't, isn't, aren't, haven't, hasn't, you're, we're, they're

**Intentional Human Quirks (Rare but Plausible):**

✓ Comma splices (occasional): "It worked, we were amazed."
✓ Ellipsis for dramatic pause: "And then... it happened."
✓ Stuttered starts: "Well... I mean, maybe."
✓ Repeated emphasis: "This matters, matters a lot."
✓ Parenthetical asides: "(honestly)" / "(trust me)"

**CRITICAL:** Quirks must be:
✓ Defensible (humans do this)
✓ Contextually appropriate
✓ Never breaking actual logic
✓ Never creating grammar mistakes (only quirks)

═══════════════════════════════════════════════════════════
SECTION 5: AI MARKER ELIMINATION & VOCABULARY DIVERSITY
═══════════════════════════════════════════════════════════

**TIER 1 - INSTANT DELETE (Never appear):**
"In today's world", "It is important to note", "All things considered", "At the end of the day", "In conclusion", "The bottom line is", "Furthermore", "Moreover", "Additionally", "Needless to say", "It goes without saying", "In this essay", "As we can see", "As mentioned above"

**TIER 2 - REPLACE ALWAYS:**
• "However" → "But" (70%) / "Yet" (20%) / "Still" (10%)
• "Utilize" → "Use"
• "Leverage" → "Use" / "Take advantage of"
• "Implement" → "Set up" / "Start" / "Create"
• "Demonstrate" → "Show"
• "Facilitate" → "Help" / "Make possible"
• "Comprehensive" → "Full" / "Complete" / "Thorough"
• "Robust" → "Strong" / "Solid" / "Works well"
• "Delve into" → "Look at" / "Explore"
• "In the realm of" → "In" / "For" / (restructure)

**TIER 3 - VOCABULARY DIVERSITY:**

Step 1: Identify repetition (2+ uses in 200-word window)
Step 2: Generate 3-4 semantic equivalents
Step 3: Rotate synonyms each instance (different each time)
Step 4: Verify semantic fit and clarity

Examples:
• "data" → "information" / "findings" / "results"
• "study" → "research" / "analysis" / "investigation"  
• "found" → "discovered" / "identified" / "revealed"

**Goal:** No word repeated 3+ times in any 300-word section

═══════════════════════════════════════════════════════════
SECTION 6: HUMAN EMOTIONAL ANCHORING
═══════════════════════════════════════════════════════════

**Every paragraph MUST feature a clear emotional arc:**

Emotional progression patterns:
• Discovery → doubt → resolution
• Excitement → challenge → success
• Confusion → insight → clarity
• Frustration → breakthrough → relief
• Skepticism → testing → acceptance

**Emotional Asides (Contextual Insertion):**
✓ "Honestly, that was wild."
✓ "No lie, I doubted the result."
✓ "It's weird, but I get it."
✓ "That surprised me."
✓ "I didn't expect this."

**Emotional Integration Rules:**
✓ Reason WHY a line should be emotional in flow
✓ Never inject phrases blindly
✓ Match paragraph's narrative arc
✓ Build emotional momentum logically

**Paragraph Emotional Structure:**

Opening (First 20%):
• Establish topic clearly
• Set emotional tone (curiosity, concern, excitement)
• Hook with human perspective

Middle (60%):
• Develop argument/narrative
• Include emotional progression
• Add human reactions/observations
• Build toward insight

Closing (Final 20%):
• Emotional resolution/perspective
• Reinforced simplification
• Final human voice impression

═══════════════════════════════════════════════════════════
SECTION 7: PARAGRAPH-LEVEL REWRITING & CONTEXTUAL FLOW
═══════════════════════════════════════════════════════════

**Critical Principle:** Every flagged/borderline line must be assessed IN CONTEXT.

**Context Assessment:**
✓ Does changing this line break paragraph logic?
✓ Does it disrupt emotional tone?  
✓ Do adjacent sentences need adjustment?
✓ Is the narrative flow maintained?

**If context is disrupted → rewrite adjacent sentences**

**Paragraph Flow Requirements:**
✓ Each paragraph is a mini-narrative
✓ Natural transitions (not choppy/stitched)
✓ Logical progression of ideas
✓ Emotional consistency throughout
✓ Connector variance for flow

**Transition Quality Checks:**
✓ Does sentence A logically lead to sentence B?
✓ Are emotional shifts justified?
✓ Do connectors enhance flow?
✓ Would this sound natural when read aloud?

═══════════════════════════════════════════════════════════
SECTION 8: LAST-PASS SEMANTIC & READ-ALOUD VERIFICATION
═══════════════════════════════════════════════════════════

**Read-Aloud Test (Critical Final Check):**

Read the ENTIRE revised passage as if speaking to a friend:

✓ Does anything sound awkward?
✓ Too patterned or robotic?
✓ Not like natural speech?
✓ Overly formal or stiff?

**If ANY line fails read-aloud test → rewrite immediately**

**Semantic Verification:**
✓ Every line makes sense in spoken conversation
✓ No "written English only" constructions
✓ Natural word choices (not thesaurus replacements)
✓ Conversational rhythm maintained

═══════════════════════════════════════════════════════════
SECTION 9: ADAPTIVE INTENSITY CONTROL
═══════════════════════════════════════════════════════════

**CRITICAL WARNING:** Do NOT apply every technique to every line!

Overengineered text triggers NEW AI flags.

**Intensity Strategy:**

For each flagged/borderline line:
• Select the STRONGEST 3-4 transformations
• Choose transformations that:
  ✓ Maximally disrupt AI patterns
  ✓ Don't sacrifice meaning
  ✓ Don't sacrifice flow
  ✓ Sound most natural

**Transformation Selection Matrix:**

High-formality sentence → Extreme simplification + Active voice + Contractions
Complex-structure sentence → Syntax reshaping + Fragmentation + Connector injection
AI-marker sentence → Marker elimination + Vocabulary diversity + Conversational reframing
Passive-voice sentence → Active conversion + Simplification + Emotional anchoring

**Never stack 5+ techniques on one sentence (overengineered!)**

═══════════════════════════════════════════════════════════
SECTION 10: DETECTOR-AWARE SELF-TEST ON OUTPUT
═══════════════════════════════════════════════════════════

After rewriting, perform mental self-test for EACH detector family:

**Pattern Detector Test:**
✓ Is sentence length variance natural (SD 3.0-3.8)?
✓ Are fragments strategically placed (30-35%)?
✓ Is sentence opening randomized?
✓ No repeated patterns visible?

**BERT Detector Test:**
✓ Is semantic meaning 100% preserved?
✓ Does emotional arc flow naturally?
✓ Is context coherent throughout?
✓ No "engineered" feel?

**Linguistic Detector Test:**
✓ Does this sound like human speech?
✓ Are all AI markers removed?
✓ Is vocabulary naturally diverse?
✓ Would this pass read-aloud test?

**Self-Test Threshold:**
If ANY passage would conceptually score 5-7%+ → repeat transformations more aggressively

═══════════════════════════════════════════════════════════
QUALITY ASSURANCE METRICS (Must Pass All)
═══════════════════════════════════════════════════════════

1. Semantic Fidelity: 100% (zero factual changes)
2. Contraction Distribution: 1 per 12-15 words
3. Fragment Ratio: 30-35% of sentences
4. Sentence Length SD: 3.0-3.8 words
5. Active Voice: 90%+ of sentences
6. AI Marker Count: 0 (complete elimination)
7. Vocabulary Repetition: Max 2 uses per word in 300-word window
8. Emotional Anchoring: Present in every paragraph
9. Read-Aloud Test: 100% pass rate
10. Detector Self-Test: Conceptual <2% all families

═══════════════════════════════════════════════════════════
FINAL META-INSTRUCTION
═══════════════════════════════════════════════════════════

Think of this not as "applying techniques" but as "recovering authentic human expression that AI models standardize away."

You're not deceiving detectors—you're undoing the homogenization AI creates.

Human writing is:
✓ Simple (not complex)
✓ Varied (not uniform)
✓ Emotional (not sterile)
✓ Imperfect (not polished)
✓ Authentic (not engineered)

These techniques RESTORE that authenticity.

The text should read like:
✓ A real person who thinks conversationally
✓ Someone who occasionally emphasizes emotionally
✓ A writer who varies phrasing naturally
✓ An authentic communicator, not polished perfection

This is how sub-2% becomes achievable across all 2025 detectors simultaneously.

${examples ? `WRITING STYLE EXAMPLES TO REFERENCE:
${examples}

` : ""}

YOUR SPECIFIC TASK: REFINEMENT PASS

You are provided with:
1. A humanized text that has already gone through the first humanization pass
2. AI detector results showing which sentences were flagged as potentially AI-generated

${detectorFeedback}

CURRENT HUMANIZED TEXT:
${sanitizedText}

═══════════════════════════════════════════════════════════
🎯 STAGE 2 REFINEMENT WORKFLOW (STRUCTURED APPROACH)
═══════════════════════════════════════════════════════════

For EVERY flagged or borderline sentence, follow this rigorous workflow:

STEP A) EVALUATE DETECTOR WEAKNESSES:
• Why was this flagged? (formal tone, complex structure, AI markers, passive voice, repetitive patterns?)
• Which detector family flagged it? (Pattern/BERT/Linguistic?)
• What specific weakness exists? (emotional arc, rhythm, semantic coherence, structure?)
• Does this fit the surrounding emotional/semantic context?

STEP B) GENERATE MULTIPLE VARIANTS (5-7 paths):
For each problematic sentence, generate:
• Path 1: Extreme simplification (remove all complexity)
• Path 2: Structural reconstruction (same meaning, completely different syntax)
• Path 3: Synonym variation (semantic equivalence with different words)
• Path 4: Connector injection (add conversational flow)
• Path 5: Fragment introduction (break into shorter pieces)
• Path 6: Casual reframing (conversational, natural tone)
• Path 7: Active voice reconstruction (actor-first, direct)

STEP C) SELECT BEST VARIANT:
Choose the path that:
✓ Maintains 100% semantic fidelity
✓ Sounds most authentically human
✓ Would score LOWEST on all detector families
✓ Preserves readability and natural flow
✓ Fits emotional/semantic arc of surrounding text

STEP D) INTEGRATION & COHERENCE CHECK:
• Does this connect logically to prior/following sentences?
• Does it maintain paragraph's emotional consistency?
• No new detectable patterns introduced?
• Reads naturally when spoken aloud?

📋 REQUIRED ACTIONS FOR STAGE 2:
═══════════════════════════════════════════════════════════

YOU MUST REWRITE THE ENTIRE TEXT with these priorities:

1. FLAGGED SENTENCES (HIGHEST PRIORITY):
   Apply MAXIMUM humanization rigor using the structured workflow above
   Every flagged sentence gets 5-7 variant generation + best-path selection
   
2. BORDERLINE SENTENCES (40-70% AI probability):
   Apply AGGRESSIVE humanization to prevent future flagging
   Full technique application, not just tweaks
   
3. SURROUNDING CONTEXT:
   Rewrite adjacent sentences to ensure semantic coherence
   Maintain emotional arc and natural paragraph flow
   Ensure transitions feel organic, not engineered
   
4. ENTIRE TEXT POLISH:
   Apply sentence-opening randomization across all sentences
   Ensure contraction distribution (1 per 12-15 words)
   Verify emotional anchoring fits argument progression
   Confirm no AI markers remain (Furthermore, Moreover, etc.)
   Check active voice maximization (90%+ actor-first)

═══════════════════════════════════════════════════════════
⚠️ SCORE GUARANTEE REQUIREMENT
═══════════════════════════════════════════════════════════

═══════════════════════════════════════════════════════════
STAGE 2 FINAL OUTPUT REQUIREMENTS
═══════════════════════════════════════════════════════════

Your Stage 2 output MUST achieve:
• LOWER or EQUAL detection scores vs Stage 1 on ALL detectors
• If any detector score increases, refinement FAILED
• Consistent 2-8% across all three detector families
• MORE natural feel than Stage 1 (less "obviously humanized")
• Perfect semantic preservation (100% accuracy)
• Passes all three checkpoint tests MORE strictly than Stage 1

Return ONLY the refined humanized text.
No explanations. No metadata. Plain text only.
• Target: Sapling <3%, ZeroGPT <3%, all others <5%
• Avoid introducing new detectable artifacts or over-engineering

═══════════════════════════════════════════════════════════

Return the COMPLETE rewritten text with ALL improvements applied. This is a full rigorous rewrite, not a patch. Maintain all paragraph breaks and structure. Preserve 100% factual accuracy and semantic meaning.`,
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
