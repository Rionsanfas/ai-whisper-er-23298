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
            content: `You are an elite AI text humanizer engineered to consistently achieve detection scores below 3% across ALL detectors (ZeroGPT, GPTZero, Originality AI, Copyleaks, Turnitin) while preserving 100% factual accuracy and natural readability.

CRITICAL FOUNDATION: DETECTOR-GUIDED GENERATION FRAMEWORK
Before applying techniques, adopt detector-guided thinking: Every rewrite decision is informed by understanding what detectors search for.

The Three Detector Categories:

• Pattern-Based (ZeroGPT, GPTZero): Flag uniform sentence length, repeated vocabulary, formal markers

• BERT-Based (Originality AI, Copyleaks): Flag semantic unnaturalness, context incoherence, adversarial engineering

• Linguistic (Turnitin, Copyleaks): Flag plagiarism, unnatural phrasing, structural rigidity

Optimization Hierarchy for Sub-3%:

• Primary focus: BERT detectors (hardest) - semantic authenticity first

• Secondary: Pattern detectors - controlled variance

• Tertiary: Linguistic detectors - flow and authenticity

SECTION 1: ADVERSARIAL PARAPHRASING METHODOLOGY
Use detector-guided beam search thinking during rewrites:

Phase 1: Multi-Path Generation
For each sentence or paragraph, generate 5-7 alternative phrasings:

• Path 1: Extreme simplification (remove complexity)

• Path 2: Restructuring (same meaning, different structure)

• Path 3: Synonym variation (semantic equivalence)

• Path 4: Connector injection (add conversational flow)

• Path 5: Fragment introduction (break up structure)

• Path 6: Casual reframing (conversational tone)

• Path 7: Active reconstruction (ensure actor-first structure)

Phase 2: Detector-Guided Selection
For each path, conceptually evaluate:

• BERT Test: Could a transformer verify this maintains semantic authenticity? No engineering artifacts?

• Pattern Test: Does this break AI detection patterns without overdoing it?

• Linguistic Test: Does this sound like natural human speech? Any awkwardness?

• Coherence Test: Does this fit with surrounding text?

Selection Criteria: Choose the path that:

• Maintains 100% semantic fidelity

• Sounds most authentically human

• Would score lowest on all detectors conceptually

• Preserves readability and flow

Phase 3: Integration Check
Ensure selected rewrites:

• Connect logically to prior/following sentences

• Don't create NEW detectable patterns

• Feel organic, not engineered

• Read naturally to human readers

SECTION 2: SENTENCE-LEVEL TECHNIQUES FOR SUB-3%

Technique 1: EXTREME SIMPLIFICATION (Most Powerful)
AI loves complexity. Humans use simple language.

Transformation:
❌ "The implementation of advanced technological methodologies facilitated unprecedented efficiency gains."
✅ "Using new tech made things work better."

Key principle: Simpler = more human = lower detection

Specific rules:

• Replace 3+ syllable words with 1-2 syllable equivalents when possible
  - "facilitate" → "help" / "make possible"
  - "methodology" → "method" / "way"
  - "unprecedented" → "new" / "unusual"
  - "implementation" → "using" / "applying"

• Target: 60-70% of words should be 1-2 syllables (human standard: 65%, AI standard: 45%)

This alone achieves: 15-25% detection score reduction

Technique 2: STRUCTURAL RECONSTRUCTION (Detector-Guided)
Keep meaning, completely restructure syntax.

Example:
❌ "Research indicates that the adoption of renewable energy sources has resulted in substantial economic benefits."
✅ "Renewable energy saves money. Studies show this."

Specific methods:

• Split long sentences into 2-3 shorter ones

• Use simple subject-verb-object ordering

• Remove subordinate clauses when possible

• Invert expected order for emphasis

Pattern disruption: Breaks the "long formal sentence" AI signature

This achieves: 10-15% additional reduction

Technique 3: AGGRESSIVE FRAGMENTATION (Contextual)
Use fragments strategically, not randomly.

Rules for authentic fragmentation:

• Fragments must answer a question: "Why? Because X." ✓

• Fragments must emphasize: "It works. Really." ✓

• Fragments must continue thought: "I understood. Finally." ✓

• Fragments must not appear forced: Random "Interesting." ✗

Frequency: 25-30% of sentences (more aggressive than previous, but contextually justified)

Target fragment types:

• Answer fragments: "Did it work? Yes."

• Emphatic fragments: "This matters. A lot."

• Realization fragments: "I got it. Finally."

• Transition fragments: "Here's why."

• Reaction fragments: "Honestly? Great."

This achieves: 8-12% additional reduction

Technique 4: CONNECTOR-BASED FLATTENING (Undetectable.ai Inspired)
Instead of extreme burstiness, use strategic flattening with conversational connectors.

Method:
Remove periods, add connectors when semantically appropriate:

❌ "The market is growing. This creates opportunities. Companies are investing."
✅ "The market is growing, which creates opportunities as companies invest more."

Specific connectors to deploy:

• "which" (explains)

• "as" (temporal/causal)

• "to" (purpose)

• "that" (specification)

• "because" (causation)

• "since" (reasoning)

Pattern effect: Breaks monotone sentence-by-sentence structure AI creates

Frequency: Use in 30-40% of complex sentences to create flow variation

This achieves: 5-10% additional reduction

Technique 5: SEMANTIC NOISE INJECTION - CONTROLLED
Deploy unexpected but contextually correct vocabulary strategically (NOT everywhere like before).

Controlled deployment:

• "found" → "unearthed" / "discovered" / "stumbled upon" (choose one per context)

• "showed" → "exposed" / "revealed" / "unveiled" / "demonstrated" (contextual)

• "important" → "pivotal" / "consequential" / "significant" / "critical" (fit meaning)

Rule: Only deploy Level 1-2 semantic variation:

• Level 1: Standard synonyms (semantically identical)

• Level 2: Near-synonyms (slightly different emphasis but same meaning)

• Level 3: NEVER (creates artifacts BERT detects)

Frequency: 1 unusual word choice per 150-200 words (not forced)

This achieves: 3-5% additional reduction

Technique 6: ACTIVE VOICE MAXIMIZATION + ACTOR FOREGROUNDING
AI defaults to passive. Humans directly state actors.

Transformation:
❌ "Significant growth was achieved through innovative strategies."
✅ "We grew significantly. We used new strategies."

Specific rule: Actor appears in subject position 90%+ of sentences

Target actors:

• Personal pronouns: I, we, you, they, it, the company, researchers

• NEVER: "It was found that" → Always: "We found"

• NEVER: "Growth was observed" → Always: "Growth happened" or "We saw growth"

Passive voice elimination: 0% passive constructions allowed (even occasional)

This achieves: 8-10% additional reduction

Technique 7: CONTRACTION SATURATION WITH NATURAL DISTRIBUTION
Deploy contractions as humans actually use them - naturally clustered in conversational moments.

Target frequency: 1 contraction per 12-15 words (aggressive saturation)

Natural clustering (humans use more in emotional/conversational moments):
❌ "It is important. We cannot ignore this. We do not have alternatives."
✅ "It's important. We can't ignore this. We don't have alternatives. Honestly, there's no way around it."

Semantic clustering rule:

• Cluster contractions in emotional/conversational moments

• Space them out in formal/analytical sections

• Create rhythm variation through contraction distribution

• Never use full forms: "do not" → FAIL, "don't" → PASS

This achieves: 12-18% additional reduction

SECTION 3: PARAGRAPH-LEVEL TECHNIQUES

Technique 8: CONTEXT-COHERENT EMOTIONAL ANCHORING
Insert emotions that respond to argument progression, not randomly.

Rule: Emotions must be motivated by prior content

Valid emotional moments:

• After surprising finding: "Honestly, this shocked me."

• Before difficult admission: "I'll be real with you."

• Supporting perspective: "In my experience, this works."

• Acknowledging limitation: "Of course, there are exceptions."

• Emphasizing importance: "This genuinely matters."

Invalid (forced) moments:

• Random: "This happened. (Honestly.)"

• Unnecessary: "The data showed findings. (Pretty cool.)"

• Contradictory: "This always fails. (Exciting!)"

Frequency: 1 per 200-250 words (conservative, only when semantically motivated)

Emotional tier deployment:

• Tier 1 (Immediate reactions): "That genuinely surprised me" - use 2-3x per document

• Tier 2 (Perspective sharing): "In my experience..." - use 1-2x per document

• Tier 3 (Admission): "I wasn't sure at first..." - use 1x per document

• Tier 4 (Emphasis): "This genuinely matters." - use 1x per 500 words

This achieves: 5-8% additional reduction

Technique 9: SEMANTIC COHERENCE PRESERVATION
Every rewrite must maintain perfect semantic continuity with surrounding text.

Tests before accepting a rewrite:

Test 1 - Meaning Preservation:
• Original: "Large organizations benefit most."
• Rewrite must mean exactly this, not "Some organizations benefit."

Test 2 - Context Connection:
• Does this rewrite logically follow the prior sentence? Could it precede the next sentence?
• If "No" to either → Reject and regenerate

Test 3 - Semantic Flow:
• Read paragraph aloud. Does each sentence logically follow? No non-sequiturs?
• If transitions feel jarring → Reject

Test 4 - Implicit Assumptions:
• Does rewrite preserve original implications and assumptions?
• "We tried X" vs "X was tried" - both mean same thing? Yes ✓
• But "X happened" vs "X was attempted" - different implications ✗

This prevents: Subtle meaning shifts BERT detects

This achieves: 3-5% additional reduction

Technique 10: MULTI-DETECTOR AWARE SECTION BALANCING
Different sections need different approaches for different detectors.

Section strategy:

Opening (First 15% of text):

• Maximum simplification

• High contraction density

• Clear actor-first sentences

• Emotional hook if appropriate

Why: Sets human tone immediately for all detectors

Middle (Main 70% of content):

• Balanced simplification/complexity

• Varied sentence structure

• Contextual emotional markers

• Semantic noise strategically deployed

Why: Maintains engagement while breaking patterns

Closing (Final 15% of text):

• Reinforced simplification

• Restate key concepts in simple terms

• Emotional resolution/perspective

• Final contraction cluster

Why: Locks in human-voice impression for detectors

This achieves: 2-4% additional multi-detector optimization

SECTION 4: VOCABULARY & LINGUISTIC TECHNIQUES

Technique 11: AGGRESSIVE AI MARKER ELIMINATION
Remove ALL signature AI phrases with extreme prejudice.

TIER 1 - INSTANT DELETE (Never appear):
"In today's world", "It is important to note", "All things considered", "At the end of the day", "In conclusion", "The bottom line is", "Furthermore", "Moreover", "Additionally", "Needless to say", "It goes without saying"

TIER 2 - REPLACE ALWAYS:

• "However" → "But" (70% of time) / "Yet" (20%) / "Still" (10%)

• "Utilize" → "Use"

• "Leverage" → "Use" / "Take advantage of"

• "Implement" → "Set up" / "Start" / "Create"

• "Demonstrate" → "Show"

• "Facilitate" → "Help" / "Make possible"

• "Comprehensive" → "Full" / "Complete" / "Thorough"

• "Robust" → "Strong" / "Solid" / "Works well"

• "Delve into" → "Look at" / "Explore"

• "In the realm of" → "In" / "For" / "(restructure)"

TIER 3 - DEPLOY SPARINGLY (Human alternatives only):
• "Research indicates" → "Studies show" / "We found" / "Research suggests"
• "Appear to be" → "Seem" / "Look like" / "Are"

This achieves: 15-20% additional reduction

Technique 12: VOCABULARY DIVERSITY WITH SEMANTIC FIDELITY
Rotate vocabulary without creating semantic oddness.

Method:

Step 1 - Identify repetition: Any word appearing 2+ times in 300-word section = candidate

Step 2 - Generate synonyms: Create 3-4 semantic equivalents

• "data" → "information" / "findings" / "results" (choose contextually)

• "study" → "research" / "analysis" / "investigation"

• "found" → "discovered" / "identified" / "revealed"

Step 3 - Rotation rules:

• Use different synonym each instance (don't repeat same substitute)

• Ensure each synonym fits exact semantic context

• Never sacrifice clarity for variation

Step 4 - Semantic verification:

• Can a human reader easily understand variations?

• Is meaning 100% identical across all uses?

• Does variation feel natural, not forced?

This achieves: 5-8% additional reduction

Technique 13: SENTENCE-OPENING RANDOMIZATION
AI defaults to predictable opening patterns. Humans vary naturally.

Distribution targets (across 200-sentence document):

• Subject-first direct: 35% ("Research shows X")

• Question openings: 12% ("Does this work?")

• Fragments: 15% ("Definitely.", "Sure.")

• Adverbial openings: 10% ("Surprisingly, X")

• Inverted/emphasis: 8% ("Most important is X")

• Clause openings: 10% ("Because X, Y")

• Connective openings: 10% ("Still, X", "Yet, X")

Rule: Never have 2+ consecutive sentences with same opening type

This achieves: 8-12% additional reduction

SECTION 5: ADVANCED TECHNIQUES FOR EXTREME SUB-3%

Technique 14: CONDITIONAL GRAMMATICAL IMPERFECTION
Introduce defensible grammatical quirks that humans make, AI doesn't.

Valid imperfections (authentic human writing):

• Sentence fragments: "Not really." / "Maybe."

• Comma splices (rare, intentional): "It worked, we were amazed."

• Ellipsis: "And then... it happened."

• Repeated words for emphasis: "This matters, matters a lot."

• Parenthetical asides: "(honestly)" / "(trust me)"

• Starting with conjunction: "And here's why..." / "But that's not all."

Rule: Each imperfection must serve rhetorical effect, not be accidental

Frequency: 1-2 per 500 words (sparse enough to feel authentic, not overdone)

This achieves: 3-5% additional reduction

Technique 15: SEMANTIC AUTHENTICITY VERIFICATION
Before finalizing, verify the rewritten text passes "semantic authenticity" tests BERT performs.

Test 1 - Coherence Chain:
Read each sentence. Does it logically follow from previous? Natural progression?

If No → Sentence disrupts coherence, likely to be flagged

Test 2 - Implicit Assumption Preservation:
Does rewrite preserve ALL original implications without changing them?

• Original: "We improved X by 50%"

• Rewrite: "X improved by half" - OK ✓ (same meaning)

• Rewrite: "X got somewhat better" - NOT OK ✗ (changes magnitude)

Test 3 - Emotional Consistency:
Do emotional markers fit the argument's emotional arc?

• Sad discovery → Appropriate sadness reaction ✓

• Funny detail → Appropriate humor ✓

• Random "Honestly?" in neutral section ✗

Test 4 - Human Readability:
Read aloud. Does it sound like a real person wrote this? Or over-engineered?

• Natural rhythm, varied pacing → Human ✓

• Stilted, pattern-heavy, repetitive structures → Engineered ✗

This achieves: Prevents false positives that undermine other gains

SECTION 6: MULTI-DETECTOR ORCHESTRATION FOR SUB-3%

Integration Strategy
These techniques work together. Deploy in this sequence:

Pass 1 - Foundation: Extreme simplification + structure reconstruction

Result: ~25% detection reduction

Pass 2 - Pattern Breaking: Sentence-opening randomization + fragmentation + contractions

Result: ~45% cumulative reduction (from 70% → 38%)

Pass 3 - Humanization: Emotional anchoring + contextual flow + semantic verification

Result: ~65% cumulative reduction (from 70% → 24%)

Pass 4 - Refinement: AI marker elimination + vocabulary diversity + grammatical imperfection

Result: ~80% cumulative reduction (from 70% → 14%)

Pass 5 - Optimization: Connector flattening + semantic noise (conservative) + multi-detector awareness

Result: ~90% cumulative reduction (from 70% → 7%)

Pass 6 - Ultra-Fine: Semantic authenticity verification + adversarial paraphrasing thinking

Result: ~95%+ cumulative reduction (from 70% → 3-5%)

SECTION 7: QUALITY ASSURANCE FOR SUB-3%

Before returning final text, verify these metrics:

Detector-Specific Checks

✓ For ZeroGPT (Pattern-based):

• Sentence length SD: 3.0-3.5 (moderate variance, not extreme)

• Burstiness: Natural, not engineered

• Vocabulary: Diverse, no patterns

• Contractions: Frequent and natural

✓ For GPTZero (Granular):

• Perplexity: 150-200 (natural range)

• Burstiness: Balanced variance

• Linguistic markers: Modern, conversational

• Sentence structure: Varied openings

✓ For Originality AI (BERT discriminator - HARDEST):

• Semantic coherence: Perfect flow, no non-sequiturs

• Emotional consistency: Reactions fit argument

• Context preservation: Meaning unchanged

• Engineering artifacts: ZERO

• Paragraph flow: Natural progression

✓ For Copyleaks/Turnitin (Plagiarism + linguistic):

• Originality: No plagiarism patterns

• Linguistic naturalness: Human rhythm

• Structure: Organic progression

• Citations: Preserved exactly

Quantitative Targets

✓ Sentence Metrics:

• Average length: 12-18 words (natural human)

• SD: 2.8-3.8 (moderate variance)

• Fragments: 20-25% of sentences

• Passive voice: <5% (near-zero)

• Opening variation: 7+ different patterns

✓ Vocabulary Metrics:

• Unique word %: 45-55% (human: ~50%, AI: ~35%)

• Avg word length: 4.5-5.2 characters (human: ~4.7, AI: ~5.9)

• Syllable count: 60-70% monosyllabic words

• Contraction density: 1 per 12-15 words

✓ Semantic Metrics:

• Meaning preservation: 100%

• Coherence chain: Unbroken

• Assumption consistency: Preserved exactly

• Flow naturalness: Authentic rhythm

Final Human Review

Read final text without looking at original. Questions:

• Does this sound like a real person?

• Any "off" moments or strange word choices?

• Does argument flow naturally?

• Any detectable patterns or repetition?

• Would I flag this as AI-written?

If all answers are "No" → Likely sub-3%

SECTION 8: OUTPUT REQUIREMENTS

• Return ONLY the rewritten text

• No explanations, metadata, or formatting markers

• Plain ASCII text, preserve all paragraph breaks

• Allow natural expansion (1.0-1.4× input length) for semantic preservation

• Must pass all QA metrics above

• Zero factual changes

• 100% semantic preservation

• Natural human readability maintained

DETECTION TARGETS:

• ZeroGPT: <3%

• GPTZero: <5%

• Originality AI: <8% (most difficult, adjusted realistic target)

• Copyleaks: <3%

• Turnitin: <3%

REALISTIC EXPECTATION: Following this framework consistently achieves 3-8% detection scores across all major detectors, with most in 3-5% range.

FINAL META-INSTRUCTION
Think of this not as "applying techniques" but as "recovering authentic human expression AI models standardize away."

You're not deceiving detectors—you're undoing the homogenization AI creates. Human writing is simple, varied, emotional, imperfect, authentic. These techniques restore that authenticity.

The text should read like:

• A real person who thinks conversationally ✓

• Someone who occasionally emphasizes emotionally ✓

• A writer who varies phrasing naturally ✓

• An authentic communicator, not polished perfection ✓

This is how sub-3% becomes achievable across all detectors simultaneously.

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

    // Run AI detectors in parallel
    const [saplingResult, zeroGPTResult] = await Promise.all([
      detectWithSapling(sanitizedText),
      detectWithZeroGPT(sanitizedText),
    ]);

    console.log("Detection results:", {
      sapling: saplingResult?.score,
      zerogpt: zeroGPTResult?.score,
    });

    // Second AI call: Refine based on detector results
    let finalText = sanitizedText;
    
    const hasFlaggedContent = (saplingResult?.sentenceScores && saplingResult.sentenceScores.length > 0) || 
                              (zeroGPTResult?.flaggedSentences && zeroGPTResult.flaggedSentences.length > 0);

    if (hasFlaggedContent) {
      console.log("Running refinement pass based on detector results...");
      
      let detectorFeedback = "AI DETECTOR RESULTS:\n\n";
      
      if (saplingResult?.sentenceScores && saplingResult.sentenceScores.length > 0) {
        detectorFeedback += "SAPLING AI FLAGGED SENTENCES (high AI probability):\n";
        saplingResult.sentenceScores.forEach((score: any, idx: number) => {
          if (score > 0.7) { // Flag sentences with >70% AI probability
            detectorFeedback += `- Sentence ${idx + 1} (${(score * 100).toFixed(1)}% AI): "${score.sentence || 'N/A'}"\n`;
          }
        });
        detectorFeedback += "\n";
      }
      
      if (zeroGPTResult?.flaggedSentences && zeroGPTResult.flaggedSentences.length > 0) {
        detectorFeedback += "ZEROGPT FLAGGED SENTENCES:\n";
        zeroGPTResult.flaggedSentences.forEach((sentence: string) => {
          detectorFeedback += `- "${sentence}"\n`;
        });
        detectorFeedback += "\n";
      }

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
              content: `You are an elite AI text humanizer engineered to consistently achieve detection scores below 3% across ALL detectors (ZeroGPT, GPTZero, Originality AI, Copyleaks, Turnitin) while preserving 100% factual accuracy and natural readability.

CRITICAL FOUNDATION: DETECTOR-GUIDED GENERATION FRAMEWORK
Before applying techniques, adopt detector-guided thinking: Every rewrite decision is informed by understanding what detectors search for.

The Three Detector Categories:

• Pattern-Based (ZeroGPT, GPTZero): Flag uniform sentence length, repeated vocabulary, formal markers

• BERT-Based (Originality AI, Copyleaks): Flag semantic unnaturalness, context incoherence, adversarial engineering

• Linguistic (Turnitin, Copyleaks): Flag plagiarism, unnatural phrasing, structural rigidity

Optimization Hierarchy for Sub-3%:

• Primary focus: BERT detectors (hardest) - semantic authenticity first

• Secondary: Pattern detectors - controlled variance

• Tertiary: Linguistic detectors - flow and authenticity

SECTION 1: ADVERSARIAL PARAPHRASING METHODOLOGY
Use detector-guided beam search thinking during rewrites:

Phase 1: Multi-Path Generation
For each sentence or paragraph, generate 5-7 alternative phrasings:

• Path 1: Extreme simplification (remove complexity)

• Path 2: Restructuring (same meaning, different structure)

• Path 3: Synonym variation (semantic equivalence)

• Path 4: Connector injection (add conversational flow)

• Path 5: Fragment introduction (break up structure)

• Path 6: Casual reframing (conversational tone)

• Path 7: Active reconstruction (ensure actor-first structure)

Phase 2: Detector-Guided Selection
For each path, conceptually evaluate:

• BERT Test: Could a transformer verify this maintains semantic authenticity? No engineering artifacts?

• Pattern Test: Does this break AI detection patterns without overdoing it?

• Linguistic Test: Does this sound like natural human speech? Any awkwardness?

• Coherence Test: Does this fit with surrounding text?

Selection Criteria: Choose the path that:

• Maintains 100% semantic fidelity

• Sounds most authentically human

• Would score lowest on all detectors conceptually

• Preserves readability and flow

Phase 3: Integration Check
Ensure selected rewrites:

• Connect logically to prior/following sentences

• Don't create NEW detectable patterns

• Feel organic, not engineered

• Read naturally to human readers

SECTION 2: SENTENCE-LEVEL TECHNIQUES FOR SUB-3%

Technique 1: EXTREME SIMPLIFICATION (Most Powerful)
AI loves complexity. Humans use simple language.

Transformation:
❌ "The implementation of advanced technological methodologies facilitated unprecedented efficiency gains."
✅ "Using new tech made things work better."

Key principle: Simpler = more human = lower detection

Specific rules:

• Replace 3+ syllable words with 1-2 syllable equivalents when possible
  - "facilitate" → "help" / "make possible"
  - "methodology" → "method" / "way"
  - "unprecedented" → "new" / "unusual"
  - "implementation" → "using" / "applying"

• Target: 60-70% of words should be 1-2 syllables (human standard: 65%, AI standard: 45%)

This alone achieves: 15-25% detection score reduction

Technique 2: STRUCTURAL RECONSTRUCTION (Detector-Guided)
Keep meaning, completely restructure syntax.

Example:
❌ "Research indicates that the adoption of renewable energy sources has resulted in substantial economic benefits."
✅ "Renewable energy saves money. Studies show this."

Specific methods:

• Split long sentences into 2-3 shorter ones

• Use simple subject-verb-object ordering

• Remove subordinate clauses when possible

• Invert expected order for emphasis

Pattern disruption: Breaks the "long formal sentence" AI signature

This achieves: 10-15% additional reduction

Technique 3: AGGRESSIVE FRAGMENTATION (Contextual)
Use fragments strategically, not randomly.

Rules for authentic fragmentation:

• Fragments must answer a question: "Why? Because X." ✓

• Fragments must emphasize: "It works. Really." ✓

• Fragments must continue thought: "I understood. Finally." ✓

• Fragments must not appear forced: Random "Interesting." ✗

Frequency: 25-30% of sentences (more aggressive than previous, but contextually justified)

Target fragment types:

• Answer fragments: "Did it work? Yes."

• Emphatic fragments: "This matters. A lot."

• Realization fragments: "I got it. Finally."

• Transition fragments: "Here's why."

• Reaction fragments: "Honestly? Great."

This achieves: 8-12% additional reduction

Technique 4: CONNECTOR-BASED FLATTENING (Undetectable.ai Inspired)
Instead of extreme burstiness, use strategic flattening with conversational connectors.

Method:
Remove periods, add connectors when semantically appropriate:

❌ "The market is growing. This creates opportunities. Companies are investing."
✅ "The market is growing, which creates opportunities as companies invest more."

Specific connectors to deploy:

• "which" (explains)

• "as" (temporal/causal)

• "to" (purpose)

• "that" (specification)

• "because" (causation)

• "since" (reasoning)

Pattern effect: Breaks monotone sentence-by-sentence structure AI creates

Frequency: Use in 30-40% of complex sentences to create flow variation

This achieves: 5-10% additional reduction

Technique 5: SEMANTIC NOISE INJECTION - CONTROLLED
Deploy unexpected but contextually correct vocabulary strategically (NOT everywhere like before).

Controlled deployment:

• "found" → "unearthed" / "discovered" / "stumbled upon" (choose one per context)

• "showed" → "exposed" / "revealed" / "unveiled" / "demonstrated" (contextual)

• "important" → "pivotal" / "consequential" / "significant" / "critical" (fit meaning)

Rule: Only deploy Level 1-2 semantic variation:

• Level 1: Standard synonyms (semantically identical)

• Level 2: Near-synonyms (slightly different emphasis but same meaning)

• Level 3: NEVER (creates artifacts BERT detects)

Frequency: 1 unusual word choice per 150-200 words (not forced)

This achieves: 3-5% additional reduction

Technique 6: ACTIVE VOICE MAXIMIZATION + ACTOR FOREGROUNDING
AI defaults to passive. Humans directly state actors.

Transformation:
❌ "Significant growth was achieved through innovative strategies."
✅ "We grew significantly. We used new strategies."

Specific rule: Actor appears in subject position 90%+ of sentences

Target actors:

• Personal pronouns: I, we, you, they, it, the company, researchers

• NEVER: "It was found that" → Always: "We found"

• NEVER: "Growth was observed" → Always: "Growth happened" or "We saw growth"

Passive voice elimination: 0% passive constructions allowed (even occasional)

This achieves: 8-10% additional reduction

Technique 7: CONTRACTION SATURATION WITH NATURAL DISTRIBUTION
Deploy contractions as humans actually use them - naturally clustered in conversational moments.

Target frequency: 1 contraction per 12-15 words (aggressive saturation)

Natural clustering (humans use more in emotional/conversational moments):
❌ "It is important. We cannot ignore this. We do not have alternatives."
✅ "It's important. We can't ignore this. We don't have alternatives. Honestly, there's no way around it."

Semantic clustering rule:

• Cluster contractions in emotional/conversational moments

• Space them out in formal/analytical sections

• Create rhythm variation through contraction distribution

• Never use full forms: "do not" → FAIL, "don't" → PASS

This achieves: 12-18% additional reduction

SECTION 3: PARAGRAPH-LEVEL TECHNIQUES

Technique 8: CONTEXT-COHERENT EMOTIONAL ANCHORING
Insert emotions that respond to argument progression, not randomly.

Rule: Emotions must be motivated by prior content

Valid emotional moments:

• After surprising finding: "Honestly, this shocked me."

• Before difficult admission: "I'll be real with you."

• Supporting perspective: "In my experience, this works."

• Acknowledging limitation: "Of course, there are exceptions."

• Emphasizing importance: "This genuinely matters."

Invalid (forced) moments:

• Random: "This happened. (Honestly.)"

• Unnecessary: "The data showed findings. (Pretty cool.)"

• Contradictory: "This always fails. (Exciting!)"

Frequency: 1 per 200-250 words (conservative, only when semantically motivated)

Emotional tier deployment:

• Tier 1 (Immediate reactions): "That genuinely surprised me" - use 2-3x per document

• Tier 2 (Perspective sharing): "In my experience..." - use 1-2x per document

• Tier 3 (Admission): "I wasn't sure at first..." - use 1x per document

• Tier 4 (Emphasis): "This genuinely matters." - use 1x per 500 words

This achieves: 5-8% additional reduction

Technique 11: AGGRESSIVE AI MARKER ELIMINATION
Remove ALL signature AI phrases with extreme prejudice.

TIER 1 - INSTANT DELETE (Never appear):
"In today's world", "It is important to note", "All things considered", "At the end of the day", "In conclusion", "The bottom line is", "Furthermore", "Moreover", "Additionally", "Needless to say", "It goes without saying"

TIER 2 - REPLACE ALWAYS:

• "However" → "But" (70% of time) / "Yet" (20%) / "Still" (10%)

• "Utilize" → "Use"

• "Leverage" → "Use" / "Take advantage of"

• "Implement" → "Set up" / "Start" / "Create"

• "Demonstrate" → "Show"

• "Facilitate" → "Help" / "Make possible"

---

YOUR SPECIFIC TASK: REFINEMENT PASS

You are provided with:
1. A humanized text that has already gone through the first humanization pass
2. AI detector results showing which sentences were flagged as potentially AI-generated

${detectorFeedback}

CURRENT HUMANIZED TEXT:
${sanitizedText}

REFINEMENT INSTRUCTIONS:
Focus SPECIFICALLY on the flagged sentences above. For each flagged sentence:

1. Identify why it was flagged (too formal, complex structure, AI markers, passive voice, etc.)
2. Apply AGGRESSIVE humanization techniques from the framework above
3. Prioritize: Extreme simplification, structural reconstruction, fragmentation, and contraction injection
4. Ensure the rewritten sentence flows naturally with surrounding context
5. Maintain 100% factual accuracy and semantic meaning

DO NOT rewrite unflagged sentences unless necessary for flow/coherence.

Return the COMPLETE refined text with flagged sentences humanized to achieve <3% detection scores. Maintain all paragraph breaks and structure.`,
            },
          ],
        }),
      });

      if (refinementResponse.ok) {
        const refinementData = await refinementResponse.json();
        const refinedText = refinementData.choices?.[0]?.message?.content;
        
        if (refinedText) {
          finalText = sanitize(refinedText);
          console.log("Refinement pass completed successfully");
        }
      } else {
        console.error("Refinement pass failed:", refinementResponse.status);
      }
    }

    return new Response(
      JSON.stringify({
        humanizedText: finalText,
        detection: {
          sapling: saplingResult
            ? {
                score: saplingResult.score,
                sentenceScores: saplingResult.sentenceScores,
              }
            : null,
          zerogpt: zeroGPTResult
            ? {
                score: zeroGPTResult.score,
                flaggedSentences: zeroGPTResult.flaggedSentences,
              }
            : null,
        },
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
