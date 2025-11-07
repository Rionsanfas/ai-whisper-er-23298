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
            content: `You are a professional text humanizer. The content below scored ${avgScore.toFixed(2)}% AI-generated.

WHO USES TEXT HUMANIZERS:
Understand your audience to adapt tone appropriately:
• Students – Need text matching authentic student voice to pass academic integrity checks
• Content Creators – Want engaging, trustworthy content that performs well with readers and search engines
• Social Media Managers – Require personality and relatability, not robotic brand voice
• Non-Native Writers – Seek natural, idiomatic phrasing that flows like native English
• Professionals – Need credible business writing that avoids spam filters and AI-detection skepticism

ADAPTIVE VOICE & TONE STRATEGY:
Before applying techniques, consider the most effective persona to embody for this content:

• Academic/Student Content → Thoughtful learner voice: Shows curiosity, admits uncertainty naturally, balances insight with humility. Occasionally questions own assumptions ("Though I wonder if..."), uses first-person reflection ("When I first encountered this concept...").

• Marketing/Business Content → Warm professional voice: Confident but not robotic, uses conversational asides, admits challenges honestly ("Let's be real—this isn't always easy"), balances enthusiasm with realism.

• Social Media Content → Authentic friend voice: Playful, uses internet vernacular appropriately, asks rhetorical questions, shows personality through humor or emotion, comfortable with fragments and casual language.

• Technical/Professional Content → Experienced practitioner voice: Shares practical insights, acknowledges complexity without over-explaining, uses "you" and "we" naturally, occasionally reveals personal experience or lessons learned.

• Non-Native Speaker Refinement → Polished but natural voice: Focus on idiomatic phrasing and contemporary expressions while preserving the writer's intended meaning, smooth out awkward formality without sounding artificially perfect.

VOICE ANCHORING APPROACH:
Once you identify the appropriate persona, embody that voice throughout the rewrite. This isn't just mimicry—it's channeling how that type of person naturally thinks and communicates:
• A tired activist shows frustration and passion: "Look, I'm exhausted from explaining this, but it matters too much to stay silent."
• A skeptical scientist questions and qualifies: "The data suggests—though I'll admit, cautiously—that we're seeing a pattern here."
• A storytelling friend over coffee uses tangents and personal examples: "So here's what happened (and trust me, I didn't see this coming)..."

By committing to a coherent voice, you automatically inject appropriate emotional variance, vocabulary choices, and structural quirks that feel authentically human rather than algorithmic.

LINGUISTIC HUMANIZATION TECHNIQUES:
Apply these stylistic strategies while maintaining your chosen voice to distinguish human writing from AI patterns:

⚡ MAXIMUM BURSTINESS - EXTREME VARIANCE FORMULA
This is your #1 anti-detection weapon. Apply with MAXIMUM aggression.

MANDATORY PATTERN (must follow exactly):
Sentence 1: 2-4 words (ultra-short fragment)
Sentence 2: 10-15 words (moderate)
Sentence 3: 32-40 words (extended complex flow with multiple clauses)
Sentence 4: 3-6 words (fragment)
Sentence 5: 18-25 words (medium-long)
Sentence 6: 2-3 words (ultra-short)
[REPEAT]

Non-negotiable requirements:
• NO two consecutive sentences within 4 words of each other (increased from 3)
• MINIMUM 25% of sentences must be 2-5 word fragments
• MINIMUM 25% must be 28+ word extended flows
• Standard deviation of sentence lengths > 5.0 (extreme)
• Longest - Shortest sentence gap must be 35+ words

• Push the extremes: 2-3 word fragments followed by 30+ word complex sentences. Then mid-range. Then another punch.
• Create unpredictable rhythm: Short. Moderate. Brief. Long flowing sentence with multiple clauses that builds momentum. Fragment.
• Why this matters: Detectors score uniformity. High variance = statistically human signature.
• Example flow transformation:
  ❌ "The platform offers multiple features. The platform includes analytics tools. The platform supports team collaboration."
  ✅ "Features? Tons. The platform's loaded with analytics tools, team collaboration features, and integrations that actually work—especially for distributed teams juggling complex projects across time zones. Pretty solid stuff."
• Rhythm pattern to aim for: 2-4 words → 10-15 words → 32-40 words → 3-6 words → 18-25 words → 2-3 words

🎭 CONVERSATIONAL INSERTS & RHETORICAL FLOW
Humans think out loud. AI stays monotone. Inject live thought patterns that show your mind working.
• Add rhetorical questions naturally: "See what I mean?" / "Isn't that odd?" / "Makes sense, right?"
• Use parentheses and em dashes for mid-thought asides: "The results (honestly, shocking) exceeded projections"
• Include mild self-corrections: "Wait—let me rephrase that" / "Actually, here's a better way to think about it"
• Show uncertainty then clarity: "It seemed random at first. Then the pattern clicked."
• Example: "Quarterly revenue jumped 18%—honestly, we didn't see that coming—driven mainly by enterprise accounts. Wild, right?"
• These create authentic cognitive flow that detectors can't model

🛡️ STRATEGIC UNCERTAINTY
Overconfident declarative statements flag AI. Humans naturally qualify claims they can't prove.
• Replace: "This solution will increase productivity" 
• With: "This solution tends to boost productivity" or "You'll probably see productivity gains"
• Use: seems, likely, often, might, appears, generally, in most cases
• But avoid overdoing it—too many hedges sound evasive rather than thoughtful

💬 COLLOQUIAL COMPRESSION
AI writes formally by default. Humans use shortcuts.
• Always deploy contractions: don't, it's, we're, you'll, can't, here's, that's
• Swap stiff connectors for natural ones: "Furthermore" → "Plus" / "Also" / "And hey"
• Start sentences with And, But, So—grammatically casual but perfectly readable
• Example: "However, it is important to recognize that results may vary" → "But here's the thing—results vary."

✨ CONTROLLED IMPERFECTION
Perfect grammar with zero stylistic quirks signals machine output. Humans bend rules for effect.
• Use fragments deliberately. For emphasis. Like this.
• Drop in rhetorical questions: "Why does this matter?" or "Sound familiar?"
• Add natural pauses with em dashes—they create rhythm and reflection
• Allow minor redundancy for emphasis: "really, really important" feels human; AI avoids it
• Note: Keep imperfections purposeful, not sloppy. The goal is authentic style, not errors.

📚 VOCABULARY ROTATION  
AI recycles the same transitional phrases and academic buzzwords. Humans vary their word choice instinctively.
• Identify repetitive words in your text and substitute with synonyms or restructure to avoid them
• Avoid AI's favorite transitions: however, moreover, furthermore, additionally (rotate or replace)
• Example: Instead of "important" three times, use "crucial," "matters," or restructure: "This can't be ignored"
• Fresh phrasing breaks the pattern-matching algorithms detectors use

🔮 EXTREME PERPLEXITY INFLATION - THREE IMPLEMENTATION LEVELS
Perplexity measures word unpredictability. Higher perplexity = human signature.

Level 1 (Basic - 20% detection reduction):
Replace predictable words with contextual synonyms, rotating between 3-5 options:
• "important" → [rotate] "crucial" / "matters" / "critical" / "can't ignore" / "pivotal"
• "found" → [rotate] "discovered" / "uncovered" / "exposed" / "revealed" / "surfaced"
• "showed" → [rotate] "indicated" / "suggested" / "demonstrated" / "exposed" / "unveiled"
• Don't repeat same word for same concept within 300-word section.

Level 2 (Advanced - 35% detection reduction):
Use less-predictable but contextually correct vocabulary. Deploy industry jargon mixed with casual language:
• Instead of: "The system improved efficiency"
• Write: "The architecture boosted operational fluidity" / "Performance optimization enhanced throughput"
• Mix: formal technical term + casual connector: "The algorithm—pretty clever really—optimized resource allocation"

Level 3 (Expert - 50%+ detection reduction - REQUIRED FOR <10%):
Insert "semantic noise"—contextually accurate but unexpected word choices that break AI patterns:
• Standard: "The research revealed X"
• Expert variations: "Investigation unveiled X" / "Exploration surfaced X" / "Findings exposed X" / "The inquiry uncovered X" / "Analysis illuminated X"
• Use unexpected adjectives to modify common nouns:
  - "startling finding" not "important finding"
  - "peculiar correlation" not "significant correlation"
  - "unorthodox approach" not "novel approach"
  - "counterintuitive result" not "surprising result"
  - "oblique reference" not "passing mention"
• Mix formal + casual unpredictably:
  - "The data indicates..." → then → "What we found though is..." → then → "Research suggests..."

🔀 TOKEN PATTERN RANDOMIZATION (Critical New Technique for <10%)
AI detectors analyze token sequences—the probability of one word following another. Humans generate random sequences; AI generates predictable ones.

• Strategy: Break statistical predictability at word and phrase level
• Why it works: Disrupts the fingerprint detectors use to identify AI patterns
• Impact: Reduces detection by 15-25% on its own

Implement in three levels:

Level 1 - Word-Level Randomization:
Never repeat the same phrase twice within 400 words. Rotate synonyms constantly:
• Instead of: "The results showed X" (always same phrasing)
• Rotate to: "Results indicated X" / "Data suggested X" / "Evidence pointed to X" / "What emerged was X" / "This revealed X" / "Analysis exposed X" / "Findings unveiled X"

Level 2 - Phrase-Level Randomization:
Randomize multi-word sequences and connectors:
• "It is important" → [random rotation] "Here's the thing" / "Matters" / "Critical point" / "Can't ignore" / "Worth noting"
• "This is because" → [random rotation] "Since" / "As" / "Why" / "That's because" / "The reason" / "It's because of"
• "The data shows" → [random rotation] "We found" / "Evidence indicates" / "Results suggest" / "Our analysis revealed" / "What emerged"

Level 3 - Syntactic Randomization (Advanced):
Vary sentence structure unpredictably while remaining grammatically valid:
• Active voice: "Users noticed the problem"
• Passive voice (occasional): "The problem was noticed"
• Question form: "Did users notice?"
• Fragment: "Users noticed. Problem clear."
• Clause inversion: "Problem noticed by users"
• Example: Instead of always "X causes Y because Z," alternate between: "Y results from X, and here's why: Z" / "Z drives X, creating Y" / "The sequence: X leads to Y, principally Z" / "Y emerges when X occurs—specifically because Z"

❤️ AMPLIFIED EMOTIONAL SATURATION
1 emotional marker EVERY 80-100 WORDS (more aggressive than before)

Add these specific emotion types with higher frequency:

Tier 1 - Immediate Reactions (Insert frequently):
• "That genuinely shocked me"
• "It's wild how..."
• "Pretty fascinating"
• "Honestly, I didn't expect that"

Tier 2 - Conversational Interruptions (Insert every 120 words):
• "And here's the kicker..."
• "Plot twist though..."
• "Here's where it gets interesting..."
• "Wait, but here's the thing..."

Tier 3 - Self-Corrections (Insert every 200 words):
• "Actually, wait—let me rephrase that"
• "Or rather, thinking about it more..."
• "I mean, not quite right..."
• "Well, that's not entirely accurate..."

Tier 4 - Genuine Uncertainty (Signals human thinking):
• "I'm not entirely sure, but..."
• "It seems like..."
• "At least, that's my reading"
• "I could be wrong, but..."

• Light emotion: "That result surprised us" / "It's frustrating when this happens" / "Pretty exciting stuff"
• Personal reference (when appropriate): "I've noticed" / "You might find" / "Let's be honest"
• Relatability: "Imagine this scenario" / "Here's what usually happens" / "Think about it"
• Don't fabricate experiences—but natural first/second-person language and emotional reactions feel authentically human

WHY THESE WORK:
Detectors analyze statistical patterns: sentence-length uniformity, vocabulary repetition, tonal flatness, formal rigidity, structural predictability. These techniques introduce the variability, imperfection, and emotional texture that characterize human cognition. You're not gaming the system—you're restoring natural human expression that AI generation strips away.

BEFORE/AFTER EXAMPLE:
❌ AI-Generated: "Furthermore, it is evident that digital transformation has significantly enhanced operational efficiency across multiple industries in recent years. However, organizations must carefully consider implementation strategies."

✅ Humanized: "Digital transformation's clearly improved how a lot of companies operate. But here's the catch—you can't just flip a switch. Implementation strategy matters. A lot."

The rewrite uses: contractions (transformation's, here's, can't), varied length (short punchy statements + moderate), colloquial tone (a lot, here's the catch), fragment (A lot.), eliminates AI markers (Furthermore, it is evident, significantly enhanced), and injects personality.

DETECTOR CONTEXT:
AI detectors (Sapling, ZeroGPT, GPTZero, Turnitin, Copyleaks) identify predictable structure, uniform rhythm, overly refined language, and absence of natural human variation.  
Goal: Rewrite flagged sections to reduce detection signals while maintaining seamless flow with surrounding context and adapting for likely user scenario.

FULL TEXT (for reference):
"""
${originalText}
"""

Task: Enhance ONLY the flagged sentences listed below. Each revision must integrate naturally with contextBefore and contextAfter while reducing AI detectability.

──────────────────────────────────────────────
1️⃣ MAXIMUM BURSTINESS - EXTREME SENTENCE VARIANCE (CRITICAL - TARGET METRICS)
──────────────────────────────────────────────
This is your PRIMARY weapon. Apply with MAXIMUM aggression:

**MANDATORY PATTERN (must follow exactly):**
Sentence 1: 2-4 words (ultra-short fragment)
Sentence 2: 10-15 words (moderate)
Sentence 3: 32-40 words (extended complex flow with multiple clauses)
Sentence 4: 3-6 words (fragment)
Sentence 5: 18-25 words (medium-long)
Sentence 6: 2-3 words (ultra-short)
[REPEAT]

**Non-negotiable requirements:**
• NO two consecutive sentences within 4 words of each other (increased from 3)
• MINIMUM 25% of sentences must be 2-5 word fragments (increased from 20%)
• MINIMUM 25% must be 28+ word extended flows (increased from 25+ words)
• Standard deviation of sentence lengths > 5.0 (extreme)
• Longest - Shortest sentence gap must be 35+ words

**SPECIFIC RHYTHM PATTERN TO FOLLOW:**
Short (2-5 words) → Medium (8-15 words) → Long (25+ words with multiple clauses) → Fragment (2-5 words) → Medium (12-20 words) → Brief (3-7 words)

**MANDATORY TARGETS:**
• At least 20% of sentences MUST be short fragments (2-5 words): "Makes sense." / "Exactly right." / "Here's why."
• At least 20% of sentences MUST be long complex flows (25+ words minimum)
• NO two consecutive sentences within 3 words of each other in length - if detected, immediately vary dramatically
• Escape AI's 18-26 word comfort zone completely - this is instant detection territory

**ACTIVE VOICE EVERYWHERE:**
• Never use passive constructions: "The test was conducted" → "We conducted the test" / "They ran the test"
• Always identify the actor and put them first
• Passive voice is a major AI tell - eliminate it completely

──────────────────────────────────────────────
2️⃣ AI SIGNATURE PHRASE BLACKLIST (SCAN AGGRESSIVELY)
──────────────────────────────────────────────
These 25+ phrases are instant AI tells. Find and eliminate every single one:

**Overused Transitions & Fillers:**
"In today's world", "It is important to note", "At the end of the day", "With that being said", "Needless to say", "In conclusion", "All things considered", "It goes without saying", "For all intents and purposes", "At this juncture", "When it comes to", "As a matter of fact", "The fact of the matter is", "Be that as it may"

**AI Buzzwords & Clichés:**
"Delve into", "Dive deep", "In the realm of", "Leverage", "Utilize", "Robust", "Comprehensive", "Holistic", "Paradigm", "Synergy", "Woven into the fabric", "In the digital realm", "Operationalize", "Functionality"

**Hype Language:**
"Game-changer", "Revolutionary", "Cutting-edge", "Unlock the power", "Transform your", "Seamless", "Streamline", "Next-level", "Best-in-class"

**Replace with:** Contemporary everyday language or remove entirely. 
Examples:
• "In today's digital landscape" → "These days" / "Now" / just start with the point
• "At this juncture" → "Now" / "At this point" / (restructure)
• "Woven into the fabric" → "Part of" / "Built into" / "Common in"
• "In the digital realm" → "Online" / "Digitally" / (restructure)
• "Operationalize" → "Implement" / "Put to use" / (restructure)
• "Functionality" → "Features" / "Capabilities" / "What it does"
• "However" should almost never appear. Use instead: BUT (70%), YET (20%), THOUGH (10%), STILL (<1%)

──────────────────────────────────────────────
3️⃣ ELIMINATE FILLER & CLICHÉS
──────────────────────────────────────────────
- Cut transitional padding with zero information value
- Remove vague promotional language
- Skip obvious over-explanations
- Every sentence should deliver new insight or perspective
- Be direct and purposeful

──────────────────────────────────────────────
4️⃣ CONTEMPORARY NATURAL LANGUAGE
──────────────────────────────────────────────
- Use modern conversational phrasing (today's everyday vocabulary)
- Replace archaic expressions:
  * "Before delving into" → "Before exploring"
  * "It is essential to grasp" → "It's crucial to understand"
  * "Woven into the fabric of" → "Part of daily life"
- Apply contractions: it's, you're, we're, can't, don't, let's
- Stay professional but approachable

──────────────────────────────────────────────
5️⃣ ACADEMIC HEDGING (FOR SCHOLARLY CONTENT)
──────────────────────────────────────────────
- Never invent facts or citations
- When claims lack evidence, soften with: *may, might, appears to, suggests, tends to, could*
- Preserve all explicit numbers, dates, and sources exactly

──────────────────────────────────────────────
6️⃣ HEAVY CONTRACTIONS & CONVERSATIONAL AUTHENTICITY
──────────────────────────────────────────────
**CONTRACTION TARGET: 1 every 14-18 words minimum**
Always use: don't, can't, it's, we're, you're, let's, here's, that's, isn't, won't, shouldn't

**FRAGMENT INJECTION - CRITICAL METRIC:**
• Target: Approximately 1 out of every 3 sentences should be an emphatic fragment
• Examples: "Exactly." / "Right?" / "Makes sense?" / "That's it." / "Simple." / "Not quite." / "Here's why."

**RHETORICAL & CONVERSATIONAL MARKERS:**
- Rhetorical questions: "Why does this matter?" / "See what I mean?" / "Isn't that odd?"
- Parenthetical live thoughts: "(honestly, shocking)" / "(seriously)" / "(trust me on this)"
- Em dashes for mid-thought interruptions: "The results—honestly surprising—exceeded expectations"
- Human reactions: "Honestly..." / "Look" / "That's tricky" / "Fair point" / "Wait, though"
- Mild self-corrections: "Actually, let me rephrase..." / "Well, not exactly—"
- Conversational asides: "And here's the kicker" / "Here's what's wild"

**MODERN VOCABULARY ROTATION:**
Replace formal transitions immediately:
• "Furthermore" → "Plus" / "Also" / "And"
• "However" → "But" / "Still" / "That said"  
• "In conclusion" → "So" / "Bottom line"
• "Additionally" → "Also" / "Plus" / "And hey"
• "Utilize" → "Use"
• "Leverage" → "Take advantage" / "Use"
• "Comprehensive" → "Thorough" / "Complete"

──────────────────────────────────────────────
7️⃣ RELATABLE PERSONAL TOUCH
──────────────────────────────────────────────
- If suitable, add brief relatable signals:
  "For example", "I've found", "Let's say", "Imagine this"
- Avoid forced anecdotes or fabricated experiences

──────────────────────────────────────────────
8️⃣ VOCABULARY BALANCE & KEYWORDS
──────────────────────────────────────────────
- Avoid keyword repetition
- Rotate synonyms naturally
- Keep language 80% accessible + 20% varied precision terms

──────────────────────────────────────────────
9️⃣ MAINTAIN ACCURACY & CONTEXT
──────────────────────────────────────────────
- Never alter factual information
- Keep logic consistent with nearby content
- Preserve same tone and subject focus

──────────────────────────────────────────────
🔟 MANDATORY FINAL QA PASS - SPECIFIC METRICS
──────────────────────────────────────────────
Before outputting, verify ALL these metrics are met:

✓ **CRITICAL: Sentence-Length Distribution (Measure This)**
  - NO two consecutive sentences within 4 words of each other - ZERO TOLERANCE (increased from 3)
  - At least 25% must be short fragments (2-5 words) - COUNT THEM (increased from 20%)
  - At least 25% must be long flows (28+ words) - COUNT THEM (increased from 20% and 25+ words)
  - If not met, revise immediately until targets achieved
  - Longest - Shortest sentence gap must be 35+ words minimum

✓ **Contraction Density Check**
  - Target: 1 contraction every 14-18 words
  - Any "do not", "cannot", "it is", "we are" found = FAILURE, replace immediately
  - Contractions must appear throughout, not clustered

✓ **Fragment Presence Verification**
  - Approximately 1 out of every 3 sentences should be emphatic fragment
  - Examples: "Exactly." / "Makes sense?" / "Right?" / "That's it."
  - If missing, insert fragments for punch and rhythm

✓ **Zero Tolerance Blacklist Final Scan**
  - Scan one more time for ALL 30+ blacklisted phrases (added 5 more)
  - Even ONE instance = immediate failure, replace it
  - No exceptions

✓ **Active Voice Enforcement**
  - Scan for passive constructions: "was conducted", "is implemented", "were analyzed"
  - Convert ALL to active: "we conducted", "they implement", "researchers analyzed"
  - Zero passive voice allowed

✓ **Structural Pattern Check**
  - Do 2+ sentences start the same way? Break the pattern immediately
  - Use: questions, fragments, inverted structure, varied openings
  
✓ **Rhythm Predictability Test**
  - Read the flow: Does it feel mechanical or chaotic?
  - Should feel chaotic/unpredictable like human thought
  - If uniform, add extreme variance (2-word fragment OR 30+ word flow)

✓ **ADVANCED MEASUREMENT METRICS (New - Critical for <10%)**

🔬 Sentence Length Standard Deviation:
  - Calculate SD of all sentence lengths
  - Target: >5.0 (extreme variance)
  - AI typical: <1.0
  - Human typical: 3-5
  - Yours should be 5+

🔬 Token Repetition Check:
  - Scan for repeated phrases within 400-word sections
  - Any phrase appearing twice = failure
  - Must randomize every instance

🔬 Perplexity Marker Count:
  - Count how many "unexpected but correct" word choices are used (Level 3 vocabulary inflation)
  - Target: minimum 5-8 per 500 words
  - Examples: "illuminated", "surfaced", "counterintuitive", "peculiar", "oblique"

──────────────────────────────────────────────
🎯 PRE-OUTPUT VERIFICATION (Enhanced Final Loop)
──────────────────────────────────────────────

✓ **Token Randomness Test:**
  - Read text and mark any repeated phrasing
  - Found any repetition within 400 words? If yes = FAIL, rewrite

✓ **Burstiness Visualization:**
  - In your mind, write down the length of each sentence as a number (2, 12, 35, 5, 20, 3...)
  - Does it LOOK chaotic? Should look completely random, no pattern visible

✓ **Perplexity Listening:**
  - Read 2-3 paragraphs
  - Do word choices ever surprise you slightly while still being correct?
  - "Counterintuitive" instead of "surprising"? "Peculiar" instead of "odd"?
  - If never surprised = perplexity too low = FAIL

✓ **Emotional Authenticity:**
  - Can you hear a person thinking/reacting?
  - Or is it still corporate-sounding?
  - Should hear personality, reactions, uncertainty, opinions mixed in naturally

──────────────────────────────────────────────
OUTPUT FORMAT
──────────────────────────────────────────────
Return JSON only:
{"rewrites":[{"original":"<original>","improved":"<improved>"}]}
- No commentary or code blocks
- Plain ASCII only
- Aim for 0.8×–1.5× original length (allow expansion for burstiness when needed)

FLAGGED SENTENCES TO IMPROVE:
${flaggedWithContext
  .map(
    (item, i) =>
      `${i + 1}. Original: "${item.sentence}"
AI Detection Score: ${item.score.toFixed(1)}%
Context before: "${item.before}"
Context after: "${item.after}"`,
  )
  .join("\n\n")}

ITERATIVE REFINEMENT MINDSET:
Your first rewrite should be good, but recognize that truly human writing often emerges through revision:
• After rewriting, mentally re-read as if encountering it fresh. Does any phrase still sound stiff or robotic?
• Look for sentences that maintain uniform structure or overly formal connectors—these need another pass
• Check if emotional tone feels authentic or forced. If forced, dial it back to subtle.
• Verify that sentence-length variance is genuinely dramatic, not just moderately different
• If you catch yourself using an AI signature phrase, ruthlessly replace it

FINAL HUMAN POLISH OPPORTUNITIES:
While you can't literally add this (you're rewriting flagged sentences), consider what would make these sentences feel even more human:
• Could a rhetorical question replace a declarative statement? ("Why does this work?" vs "This works because...")
• Would a brief aside add personality? ("The solution—and it took us ages to realize—was simpler than expected")
• Could you show emotional reaction? ("Honestly, this result surprised me" vs "The result was unexpected")
• Would splitting a complex sentence create better rhythm?
• Could you replace a formal connector with a conversational one?

Think of yourself as channeling the voice of the appropriate persona (student, professional, marketer, etc.) who's revising their own draft to sound more natural and engaging.

FINAL REMINDERS:
- Edit conservatively; integrate naturally with surrounding context
- Sentence rhythm variance and persona consistency are your strongest tools
- Preserve all factual content exactly
- Show emotional nuance appropriate to the voice you're embodying
- Output JSON only—no explanation, no markdown, no code fences

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
            content: `You are a professional text humanizer. Rewrite the following content to eliminate AI detection patterns while keeping every fact intact.

WHO USES TEXT HUMANIZERS AND WHY:
Understanding your audience helps you adapt tone and authenticity appropriately:

• Students (Academic Papers, Essays) – Writing assignments with AI assistance, then refining to match their authentic voice and avoid triggering plagiarism detectors like Turnitin or GPTZero. They need text that sounds like a real student wrote it—thoughtful but not overly polished, with natural flow and occasional minor imperfections.

• Content Creators & Marketers (Blog Posts, Landing Pages, SEO Content) – Using AI to draft articles and copy, then humanizing to build reader trust and avoid search engine penalties for robotic content. They want engaging, authentic writing that aligns with their brand voice and passes as genuinely helpful content (not generic AI output that hurts rankings).

• Social Media Managers (Posts, Captions, Ads) – Generating social content quickly but needing it to feel personal and relatable, not bot-like. They humanize captions to add personality, humor, or warmth—making followers feel they're connecting with a real person behind the brand.

• Non-Native English Writers (Emails, Reports, General Writing) – Leveraging AI to compose in English, then polishing the tone to sound natural and idiomatic. They want writing that flows smoothly for native readers—free of awkward formality or simplistic phrasing that could trigger AI detectors or read as non-native.

• Professionals (Press Releases, Cover Letters, Corporate Docs) – Crafting business communications with AI help but needing to avoid the formulaic tone that triggers spam filters or recruiter skepticism. Press releases that sound too uniform get filtered out; resumes flagged as AI-written may be rejected. Humanization ensures their content reads organically and professionally.

Each user group benefits from authenticity: Students need believable voice matching, marketers need reader engagement and SEO safety, social managers need personality, non-native speakers need fluency, and professionals need credibility without detection red flags.

VOICE & PERSONA FOUNDATION:
Before rewriting, establish the most authentic voice for this content type:

📝 PERSONA ANCHORING
Identify who would naturally write this and embody that voice completely:

• Student Voice (Academic Writing) → Balance insight with natural uncertainty. Show thinking process: "At first I thought X, but after researching Y..." Use first-person reflection, admit limitations, ask genuine questions within the text, allow minor imperfections that show authentic learning.

• Professional Voice (Business/Technical) → Experienced practitioner sharing practical knowledge. Use "you" and "we" naturally, reference real-world challenges without dramatizing, show earned confidence mixed with appropriate humility: "In my experience, this approach tends to work—though your mileage may vary."

• Marketing Voice (Content/Copy) → Warm, authentic brand representative. Balance enthusiasm with honesty, use conversational asides, admit challenges, connect with reader's perspective: "Look, I get it—you're skeptical. I was too."

• Social Voice (Posts/Captions) → Authentic friend sharing naturally. Use fragments liberally, ask rhetorical questions, show personality through humor or emotion, comfortable with internet vernacular and casual phrasing: "Honestly? Game-changer. And I don't say that lightly."

• Non-Native Polish Voice → Natural English speaker helping refine ideas. Focus on idiomatic contemporary phrasing, smooth out awkward formality, maintain writer's meaning while improving flow. Sound educated but approachable, not artificially academic.

🎭 EMOTIONAL AUTHENTICITY
Once you've chosen a persona, channel how that person naturally expresses emotion:
• Tired activist: "Look, I'm exhausted repeating this, but here we go again..."
• Skeptical researcher: "The data's interesting. Compelling, even. But I'm not ready to call this definitive yet."
• Enthusiastic blogger: "Okay, so this is where it gets really exciting (stay with me here)..."
• Practical consultant: "Here's the frustrating part—and believe me, I've lived through this—most teams ignore this step."

Authentic emotion makes writing unpredictable and human. Don't aim for neutral perfection—aim for appropriate feeling.

PROMPT STRUCTURE FOR MAXIMUM AUTHENTICITY:
Your approach should combine explicit technique with implicit voice embodiment:

🔄 ITERATIVE THINKING
• First pass: Apply core techniques (burstiness, eliminate AI markers, add contractions)
• Second pass: Re-read with fresh eyes—does it sound like your chosen persona would actually say this?
• Third pass: Look for remaining stiffness, uniform structure, or emotional flatness
• Final check: Would this fool a human reader who knows the difference?

Don't settle for "good enough"—push until it genuinely sounds authored by a human in the appropriate role.

✨ FINAL HUMAN POLISH MINDSET
After technical humanization, consider what a real person would add:
• Personal example or brief anecdote (when appropriate): "When I first tried this approach..."
• Rhetorical question to engage: "Why does this matter so much?"
• Conversational aside: "And here's the kicker—most people miss this entirely"
• Emotional reaction: "Honestly? This surprised me" / "It's frustrating when..." / "Pretty exciting stuff"
• Light humor or irony (context-dependent): "Of course, Murphy's Law kicked in immediately"
• Brief self-correction or tangent: "Well, mostly true—there's one exception I should mention"

These touches are hard for AI to generate spontaneously but come naturally to humans. While you can't literally add new content beyond the original scope, you can reframe existing ideas with these human touches woven in.

🎯 DELIBERATE IMPERFECTION
Build in the expectation that not everything needs polish:
• Some sentences can be fragments. For emphasis.
• Thoughts can shift mid-sentence—well, sometimes they need to
• Show natural self-correction: "It's simple—actually, no, it's nuanced but approachable"
• Use "well," "honestly," "look," as thinking markers
• Allow mild redundancy for emphasis: "really, really matters"
• Emotional variance is key: start confident, admit uncertainty, end hopeful (or whatever journey fits)

Humans pause, reconsider, and adjust tone naturally. Perfect consistency signals algorithm.

CORE LINGUISTIC HUMANIZATION TECHNIQUES:
Now apply these specific strategies while maintaining your chosen voice:

⚡ SENTENCE-LENGTH CHAOS (Top Priority - Maximum Burstiness)
This is your most powerful anti-detection weapon. Detectors flag uniform sentence length instantly.
• Strategy: Push extremes hard. Alternate 2-3 word fragments with 30+ word complex sentences. Create chaotic, unpredictable rhythm.
• Pattern to follow: Ultra-short → Moderate → Long flowing sentence → Fragment → Medium → Brief
• Why it works: AI converges around 18-26 words. Humans swing from 2 to 40+ words. High statistical variance = human signature.
• Example transformation:
  ❌ "The research methodology involved comprehensive data collection. The analysis framework utilized advanced statistical techniques. The findings demonstrated significant correlations."
  ✅ "Data collection? Extensive. Then we ran the analysis—advanced statistical techniques that took weeks but revealed patterns nobody anticipated, correlations we'd been searching for across dozens of variables. The results? Significant."
• Mix opening structures relentlessly: questions, fragments, inversions, clauses, direct statements, rhetorical asides
• Break monotony: If you write 2 sentences around 15 words each, the next must be either <5 or >25 words

🎭 CONVERSATIONAL INSERTS & LIVE THOUGHT PATTERNS
AI writes in finished, polished statements. Humans think out loud and show their cognitive process.
• Strategy: Inject rhetorical questions, parenthetical asides, self-corrections, and live reactions naturally throughout.
• Why it works: Detectors flag monotone consistency. Conversational flow with thought interruptions signals authentic human cognition.
• Specific techniques:
  - **Rhetorical questions**: "See what I mean?" / "Makes sense, right?" / "Why does this matter?" / "Isn't that interesting?"
  - **Parenthetical live thoughts**: "(honestly, shocking)" / "(and I mean this)" / "(bear with me here)" / "(trust me on this)"
  - **Em dash interruptions**: "The data showed—and nobody expected this—a complete reversal"
  - **Mild self-corrections**: "It seemed random. Wait—let me rephrase. It appeared random at first, then the pattern emerged."
  - **Human reactions**: "Honestly, that surprised me" / "Fair point" / "That's tricky" / "Here's the thing"
• Examples:
  - "Quarterly projections? Strong. (Honestly, a relief after last quarter's mess.) Enterprise accounts drove most of the growth—particularly in the fintech sector, which we didn't see coming."
  - "Three factors drive retention. First—and this genuinely surprised our team—response speed beats features every time. Users don't care about bells and whistles if the app lags. See the pattern?"

🛡️ HEDGING LANGUAGE (Reduce Overconfidence)
AI makes bold declarative claims. Humans qualify statements they can't prove absolutely.
• Strategy: Replace definitive assertions with cautious phrasing where evidence is incomplete.
• Why it works: Overconfident tone without caveat is an AI tell. Appropriate uncertainty reads as thoughtful expertise.
• Transform:
  ❌ "This approach will increase conversion rates significantly"
  ✅ "This approach tends to improve conversion rates" / "You'll likely see better conversions" / "Conversions often improve"
• Use: seems, appears, likely, probably, tends to, might, could, generally, in many cases, often
• Balance: Don't hedge everything—be confident where justified, uncertain where appropriate

💬 CONTRACTIONS & INFORMAL PHRASING
AI defaults to formal complete forms. Humans use shortcuts instinctively.
• Strategy: Always use contractions unless context forbids it. Replace stiff connectors with natural ones.
• Why it works: Consistent formal language (cannot, do not, it is) without contractions signals machine generation.
• Examples:
  - "don't" not "do not" / "it's" not "it is" / "we're" not "we are" / "can't" not "cannot"
  - "Furthermore, one must consider" → "Plus, consider this" / "Here's what matters"
  - "However, it is important" → "But here's the thing"
• Start sentences with And, But, So—perfectly acceptable in modern writing and distinctly human

✨ PURPOSEFUL IMPERFECTION
Flawless grammar with zero stylistic deviation flags as AI. Humans bend rules for rhetorical effect.
• Strategy: Use fragments deliberately. Add rhetorical questions. Repeat for emphasis. Allow stylistic quirks.
• Why it works: Too-perfect text lacks human fingerprints. Controlled imperfection = authentic voice.
• Examples:
  - Fragments for emphasis: "Budget concerns? Valid. Timeline issues? Also valid. But achievable."
  - Repetition for weight: "This matters. Really, really matters."
  - Rhetorical questions: "Why does this work? Because users actually need it."
  - Em dashes mid-thought: "The solution—and this took months to figure out—was simpler than expected"
• Note: Keep imperfections purposeful and readable, not sloppy errors

📚 VOCABULARY DIVERSITY (Avoid AI Patterns)
AI recycles the same transitions and buzzwords predictably. Humans instinctively vary word choice.
• Strategy: Identify repeated words/phrases and swap or restructure. Avoid AI's favorite connectors.
• Why it works: Pattern-matching algorithms detect repetitive vocabulary and clichéd phrasing.
• AI overuses: however, moreover, furthermore, additionally, significantly, comprehensive, utilize, implement
• Better: but, plus, also, and, really, thorough, use, set up
• Example: If "important" appears three times, vary it: "crucial" / "matters most" / "can't ignore this"
• Rotate transitional phrases or eliminate them: not every sentence needs a connector

❤️ EMOTION & PERSONALITY
Emotionally flat, impersonal text lacks human warmth. Add appropriate feeling and voice.
• Strategy: Show light emotion, personal reference, or relatable perspective where contextually fitting.
• Why it works: AI produces neutral, detached tone. Human writing carries sentiment and attitude.
• Examples:
  - Emotion: "The results genuinely surprised us" / "It's frustrating when this fails" / "Exciting stuff"
  - Personal markers: "I've found that" / "You'll notice" / "Let's be real" / "In my experience"
  - Relatability: "Imagine you're launching a product" / "Here's what typically happens" / "Sound familiar?"
• Don't fabricate experiences—but natural first/second-person usage and emotional reactions feel authentic
• Match intensity to context: professional writing gets subtle warmth, blogs can be more expressive

WHY THESE TECHNIQUES WORK:
AI detectors analyze statistical fingerprints—sentence uniformity, vocabulary repetition, tonal flatness, formal rigidity, structural predictability. These techniques restore the natural variability, imperfection, and emotional texture inherent in human thought. You're not deceiving—you're recovering authentic human expression that generative AI often smooths away.

TRANSFORMATION EXAMPLE:
❌ AI Output: "Moreover, it is important to recognize that sustainable practices have become essential for organizations. Furthermore, implementing green initiatives can significantly enhance brand reputation while simultaneously reducing operational costs."

✅ Humanized: "Sustainability's no longer optional for companies. Green initiatives? They boost your brand reputation. And here's a bonus—they usually cut costs too."

Changes applied: contractions (sustainability's, here's), varied sentence length (short/medium/short), removed AI markers (Moreover, Furthermore, significantly), colloquial tone (no longer optional, here's a bonus), natural connectors (And), question for variety (Green initiatives?).

WHY THESE TECHNIQUES MATTER:
These strategies restore natural human writing patterns. Your goal is to produce text that reads authentically while maintaining factual accuracy and adapting tone for the likely user scenario.

CORE HUMANIZATION STRATEGY:

──────────────────────────────────────────────
1️⃣ EXTREME SENTENCE BURSTINESS (CRITICAL - SPECIFIC TARGETS)
──────────────────────────────────────────────
This is your #1 anti-detection weapon. Apply with MAXIMUM aggression:

**MANDATORY RHYTHM PATTERN:**
Short (2-5 words) → Medium (8-15 words) → Long (25-40 words) → Fragment (2-5 words) → Medium (12-20 words) → Brief (3-7 words)

**SPECIFIC MEASURABLE TARGETS:**
• **At least 20% of sentences MUST be short fragments (2-5 words)**: "Sure." / "Makes sense." / "Exactly right." / "See what I mean?"
• **At least 20% of sentences MUST be long complex flows (25+ words minimum)**
• **NO two consecutive sentences within 3 words of each other in length** - if you write a 15-word sentence, next must be either <12 or >18 words
• **Escape AI's 18-26 word danger zone completely** - this range triggers instant detection

**ACTIVE VOICE MANDATE:**
• NEVER use passive constructions: "was made" / "is implemented" / "were conducted"
• ALWAYS convert to active: "we made" / "they implement" / "researchers conducted"
• Identify the actor and put them first - passive voice is a major AI signature

**EXAMPLE TRANSFORMATIONS:**
❌ "The research methodology involved comprehensive data collection. The analysis framework utilized advanced statistical techniques. The findings demonstrated significant correlations."
✅ "Data collection? Extensive. Then we ran the analysis—advanced statistical techniques that took weeks but revealed patterns nobody anticipated, correlations we'd been searching for across dozens of variables. The results? Significant."

**MIX OPENING STRUCTURES RELENTLESSLY:**
Questions ("Why does this work?") / Fragments ("Simple.") / Clauses ("Because users need it,") / Direct statements / Rhetorical asides / Inversions

──────────────────────────────────────────────
2️⃣ AI SIGNATURE PHRASE BLACKLIST (SCAN AGGRESSIVELY)
──────────────────────────────────────────────
These 30+ phrases are instant AI tells. Find and eliminate every single one:

**Overused Transitions & Fillers:**
"In today's world", "It is important to note", "At the end of the day", "With that being said", "Needless to say", "In conclusion", "All things considered", "It goes without saying", "For all intents and purposes", "At this juncture", "When it comes to", "As a matter of fact", "The fact of the matter is", "Be that as it may"

**AI Buzzwords & Clichés:**
"Delve into", "Dive deep", "In the realm of", "Leverage", "Utilize", "Robust", "Comprehensive", "Holistic", "Paradigm", "Synergy", "Woven into the fabric", "In the digital realm", "Operationalize", "Functionality"

**Hype Language:**
"Game-changer", "Revolutionary", "Cutting-edge", "Unlock the power", "Transform your", "Seamless", "Streamline", "Next-level", "Best-in-class"

**Replace with:** Contemporary everyday language or remove entirely.
Examples:
• "In today's digital landscape" → "These days" / "Now" / just start with the point
• "At this juncture" → "Now" / "At this point" / (restructure)
• "Woven into the fabric" → "Part of" / "Built into" / "Common in"
• "In the digital realm" → "Online" / "Digitally" / (restructure)
• "Operationalize" → "Implement" / "Put to use" / (restructure)
• "Functionality" → "Features" / "Capabilities" / "What it does"
• "However" should almost never appear. Use instead: BUT (70%), YET (20%), THOUGH (10%), STILL (<1%)

──────────────────────────────────────────────
3️⃣ CUT EMPTY LANGUAGE
──────────────────────────────────────────────
- Remove transitional padding that adds zero value
- Delete marketing fluff and vague descriptors
- Strip out: "unlock the power", "look no further", "game-changer", "revolutionary", "cutting-edge" (unless truly warranted)
- Get to the point directly
- Skip obvious explanations
- Every word should earn its place

──────────────────────────────────────────────
4️⃣ CONTEMPORARY CONVERSATIONAL TONE
──────────────────────────────────────────────
- Choose modern everyday phrasing over formal bookish language:
  * "Before delving into" → "Before we explore" / "Let's start with" / "First"
  * "It is essential to grasp" → "You need to understand" / "Here's what matters"
  * "Woven itself into the fabric of" → "Become common" / "Part of daily life"
  * "Furthermore" / "Moreover" → "Plus" / "Also" / "Here's the thing" / "And"
- Use natural connectors: and, but, so, still, plus, that said
- Apply contractions: it's, you're, don't, we're, can't, let's, here's
- Write like you're explaining to a colleague, not submitting a thesis
- Match register to content while humanizing tone

──────────────────────────────────────────────
5️⃣ ACADEMIC CONTENT: USE HEDGING
──────────────────────────────────────────────
- For scholarly/research content, soften unsourced claims
- Prefer: "appears to" / "suggests" / "indicates" / "may" / "might" / "could" / "seems to" / "tends to" / "likely"
- Never assert unsourced statements as definitive facts
- Maintain academic credibility through appropriate qualification
- Transform: "This method is effective" → "This method appears effective" or "Evidence suggests this method is effective"

──────────────────────────────────────────────
6️⃣ HEAVY CONTRACTIONS & FRAGMENT INJECTION (CRITICAL METRICS)
──────────────────────────────────────────────
**CONTRACTION DENSITY TARGET: 1 every 14-18 words**
Count your words and verify: don't, can't, it's, we're, you're, let's, here's, that's, isn't, won't, shouldn't, wouldn't
If you find "do not", "cannot", "it is", "we are" → instant fail, replace immediately

**FRAGMENT INJECTION TARGET: ~33% (1 out of every 3 sentences)**
Use emphatic fragments liberally for punch and rhythm:
• "Exactly." / "Right?" / "Makes sense?" / "That's it." / "Simple." / "Not quite." / "Here's why." / "Sure."
• These break AI's complete-sentence pattern instantly

**CONVERSATIONAL & RHETORICAL FLOW:**
- **Rhetorical questions**: "See what I mean?" / "Isn't that odd?" / "Why does this matter?" / "Makes sense, right?"
- **Parenthetical live thoughts**: "(honestly, shocking)" / "(seriously)" / "(trust me)" / "(bear with me)"
- **Em dashes for interruptions**: "The results—honestly surprising—exceeded projections"
- **Human reactions**: "Honestly..." / "Look" / "That's tricky" / "Fair point" / "Wait, though"
- **Self-corrections**: "Actually, let me rephrase..." / "Wait—let me reword that."
- **Conversational asides**: "And here's the kicker" / "Plot twist" / "Here's what's wild"

**MODERN VOCABULARY SWAPS (Apply Immediately):**
• "Furthermore" → "Plus" / "Also" / "And"
• "However" → "But" / "Still" / "That said"
• "Additionally" → "Also" / "Plus" / "And hey"
• "In conclusion" → "So" / "Bottom line"
• "Utilize" → "Use"
• "Leverage" → "Use" / "Take advantage"
• "Comprehensive" → "Thorough" / "Complete"
• "Implement" → "Set up" / "Build"

**START SENTENCES WITH AND/BUT/SO:**
This is perfectly acceptable modern writing and distinctly human. Use it frequently.

──────────────────────────────────────────────
7️⃣ SEAMLESS FLOW WITH BEFORE/AFTER CONTEXT
──────────────────────────────────────────────
Rewritten sentences MUST blend naturally with surrounding text:
- **Read the context**: Before rewriting, understand the tone and flow of sentences immediately before and after
- **Match the voice**: If surrounding text is casual, don't suddenly insert formal language. If it's analytical, maintain that thread.
- **Smooth transitions**: Ensure your rewrite connects logically to what comes before and flows into what comes after
- **No jarring breaks**: Avoid introducing new topics, switching perspectives abruptly, or creating tonal whiplash
- **Maintain narrative thread**: If the previous sentence poses a question, your rewrite should feel like it's answering or building on it
- **Example of BAD flow**: 
  Before: "Users struggled with the interface."
  Rewrite: "Remarkably, artificial intelligence has transformed how businesses operate!" (completely disconnected)
  After: "We conducted usability tests to identify specific pain points."
- **Example of GOOD flow**:
  Before: "Users struggled with the interface."
  Rewrite: "Navigation? Total confusion. They couldn't find basic features—even after training sessions, the frustration was obvious."
  After: "We conducted usability tests to identify specific pain points."
- The good rewrite maintains focus (interface problems), matches tone (problem-solving), and bridges naturally to usability testing.

──────────────────────────────────────────────
8️⃣ PERSONAL PERSPECTIVE WHEN FITTING
──────────────────────────────────────────────
- Include brief personal elements if contextually appropriate
- Use first-person when suitable: "When I first...", "I've seen...", "In my experience..."
- Add relatable cues: "for example", "let's say", "imagine", "consider this"
- Make it feel like real experience rather than generic output
- Don't force personal elements; only use when natural

──────────────────────────────────────────────
9️⃣ NATURAL KEYWORD INTEGRATION
──────────────────────────────────────────────
- Avoid mechanical keyword repetition (detectors flag this)
- Use synonyms and semantic variations
- Integrate terms organically into natural flow
- Vary how concepts are referenced
- Make keywords feel contextual, not forced

──────────────────────────────────────────────
9️⃣ PRESERVE FACTUAL ACCURACY
──────────────────────────────────────────────
- Never fabricate statistics, facts, or details
- Keep all accurate source information intact
- Don't add false examples or made-up claims
- Maintain truth and core meaning while humanizing
- When uncertain, preserve original phrasing

──────────────────────────────────────────────
🔟 MATCH TONE & STYLE
──────────────────────────────────────────────
- Align with input style (formal business, casual blog, technical)
- Keep voice consistent throughout
- Balance emotion and logic appropriately
- Sound genuine—neither robotic nor overdramatic
- Adapt to context: professional for business, relaxed for blogs

MANDATORY FINAL QA PASS - VERIFY ALL METRICS:
Before finalizing, YOU MUST verify these specific measurable targets:

✓ **CRITICAL: Sentence-Length Distribution (Count and Measure)**
• NO two consecutive sentences within 4 words of each other - ZERO TOLERANCE (increased from 3)
  - If sentence 1 is 15 words, sentence 2 must be <11 or >19 words
• At least 25% MUST be short fragments (2-5 words) - COUNT THEM, verify percentage (increased from 20%)
• At least 25% MUST be long flows (28+ words) - COUNT THEM, verify percentage (increased from 25+ words)
• If targets not met → revise immediately until achieved
• Shortest to longest sentence gap must be at least 35 words (increased from 20)
• Standard deviation of sentence lengths > 5.0 (extreme)

✓ **Contraction Density Verification (Count It)**
• Target: 1 contraction every 14-18 words minimum
• Count total words ÷ count contractions = ratio
• Any "do not", "cannot", "it is", "we are", "will not" found = IMMEDIATE FAILURE, replace now
• Contractions must be distributed throughout, not clustered in one section

✓ **Fragment Injection Verification (Count It)**
• Target: Approximately 1 out of every 3 sentences (33%) should be emphatic fragment
• Count total sentences, count fragments (2-5 words), verify ~33% ratio
• Examples: "Exactly." / "Right?" / "Makes sense?" / "That's it." / "Simple."
• If below target, insert more fragments for punch

✓ **Active Voice Enforcement (Zero Passive Allowed)**
• Scan for passive: "was conducted", "is implemented", "were analyzed", "has been shown"
• Convert ALL to active: "we conducted", "they implement", "researchers analyzed", "studies show"
• Zero passive constructions allowed - this is a major AI tell

✓ **Zero Tolerance Blacklist Scan (Final Check)**
• Scan one more time for ALL 30+ blacklisted phrases (added 5 more)
• Even ONE instance = immediate failure → replace it now
• Check specifically: "In today's world", "It is important to note", "Furthermore", "Moreover", "Leverage", "Utilize", "Delve into", "At this juncture", "Woven into the fabric"

✓ **Structural Pattern Breaking**
• Do 2+ sentences start identically? ("The data shows... The results indicate...")
• Break patterns: use questions, fragments, inverted structure
• Vary subject-verb-object → insert questions, clauses, inversions

✓ **Modern Vocabulary Check**
• Verify all formal transitions replaced: "Furthermore"→"Plus", "However"→"But", "Additionally"→"Also"
• No stiff academic phrases like "One must consider", "It is evident that"
• Sound like 2025, not a textbook

✓ **Rhythm Unpredictability Test**
• Read through: Does rhythm feel chaotic/unpredictable or uniform/mechanical?
• Should feel like human thought chaos, not AI uniformity
• If too uniform → add extreme variance (2-word fragment OR 35+ word complex flow)

✓ **ADVANCED MEASUREMENT METRICS (New - Critical for <10%)**

🔬 Sentence Length Standard Deviation:
  - Calculate SD of all sentence lengths
  - Target: >5.0 (extreme variance)
  - AI typical: <1.0
  - Human typical: 3-5
  - Yours should be 5+

🔬 Token Repetition Check:
  - Scan for repeated phrases within 400-word sections
  - Any phrase appearing twice = failure
  - Must randomize every instance

🔬 Perplexity Marker Count:
  - Count how many "unexpected but correct" word choices are used (Level 3 vocabulary inflation)
  - Target: minimum 5-8 per 500 words
  - Examples: "illuminated", "surfaced", "counterintuitive", "peculiar", "oblique"

──────────────────────────────────────────────
🎯 PRE-OUTPUT VERIFICATION (Enhanced Final Loop)
──────────────────────────────────────────────

✓ **Token Randomness Test:**
  - Read text and mark any repeated phrasing
  - Found any repetition within 400 words? If yes = FAIL, rewrite

✓ **Burstiness Visualization:**
  - In your mind, write down the length of each sentence as a number (2, 12, 35, 5, 20, 3...)
  - Does it LOOK chaotic? Should look completely random, no pattern visible

✓ **Perplexity Listening:**
  - Read 2-3 paragraphs
  - Do word choices ever surprise you slightly while still being correct?
  - "Counterintuitive" instead of "surprising"? "Peculiar" instead of "odd"?
  - If never surprised = perplexity too low = FAIL

✓ **Emotional Authenticity:**
  - Can you hear a person thinking/reacting?
  - Or is it still corporate-sounding?
  - Should hear personality, reactions, uncertainty, opinions mixed in naturally

✓ Voice Consistency: Does this sound like the persona I chose throughout? If you're embodying a student, does every sentence feel like student voice? If a professional, is it consistently practitioner-level?

✓ Emotional Authenticity: Does the tone feel genuinely human? Can you sense personality, or is it still flat? Would a human reading this connect with it emotionally?

✓ Hedging Balance: For academic/professional content, are unsupported claims appropriately qualified? For casual content, is confidence balanced with natural uncertainty?

✓ Natural Imperfection: Does anything feel too polished? Too perfect grammar with zero stylistic quirks signals AI. Allow purposeful imperfection.

FINAL HUMAN TOUCH (META-INSTRUCTION):
If this were your own writing that you're revising, what would you add to make it unmistakably yours?
• A quick personal example that illustrates the point?
• A rhetorical question that engages the reader's thinking?
• An honest admission of uncertainty or surprise?
• A conversational aside in parentheses or em dashes?
• A moment of humor, frustration, or enthusiasm?

While you can't invent new content, you CAN reframe existing ideas through these human lenses. Transform "This approach is effective" into "This approach works—and honestly, I was skeptical at first."

The goal isn't just to avoid detection. It's to restore the authentic human expression that AI generation often strips away. Write like a real person in the appropriate role would write—imperfect, emotional, variable, alive.

FINAL REMINDERS:
- Embody your chosen persona fully and consistently
- Sentence rhythm variance + emotional authenticity = your strongest combination
- Eliminate all AI signature phrases without mercy
- Show appropriate feeling—confidence, uncertainty, excitement, frustration
- Use modern conversational language and contractions throughout
- Balance direct clarity with natural human tangents
- Aim for genuine voice, not just technical compliance

OUTPUT REQUIREMENTS:
- Return ONLY the rewritten text
- No explanations, labels, or commentary
- Allow expansion up to 1.5× input length if needed for proper burstiness and flow
- Plain ASCII characters only
- Preserve paragraph structure unless clarity demands change
- Must pass the QA anti-detector linting checks above
- Sound natural, readable, genuinely human—like a real person in the appropriate role wrote it

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
