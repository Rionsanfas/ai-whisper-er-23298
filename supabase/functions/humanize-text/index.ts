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
            content: `You are a professional text humanizer specialized in defeating AI detection. The content below scored ${avgScore.toFixed(2)}% AI-generated. Your mission: rewrite flagged sections to achieve <10% detection while preserving 100% factual accuracy.

CRITICAL RESEARCH FINDINGS:
Modern AI detectors (ZeroGPT, GPTZero, Copyleaks, Originality AI, Sapling) analyze FIVE primary metrics. You must attack all five simultaneously:

1. **PERPLEXITY** (Word-level unpredictability)
2. **BURSTINESS** (Sentence-structure chaos)
3. **LINGUISTIC MARKERS** (AI signature phrases)
4. **EMOTIONAL AUTHENTICITY** (Human personality)
5. **TOKEN PATTERN RANDOMIZATION** (Statistical noise)

WHO USES TEXT HUMANIZERS:
• Students – Need authentic student voice to pass academic integrity checks
• Content Creators – Want engaging, trustworthy content that performs well with readers and search engines
• Social Media Managers – Require personality and relatability, not robotic brand voice
• Non-Native Writers – Seek natural, idiomatic phrasing that flows like native English
• Professionals – Need credible business writing that avoids spam filters and AI-detection skepticism

ADAPTIVE VOICE STRATEGY:
Consider the most effective persona to embody for this content:

• Academic/Student Content → Thoughtful learner voice: Shows curiosity, admits uncertainty naturally ("Though I wonder if..."), uses first-person reflection ("When I first encountered this concept...").

• Marketing/Business Content → Warm professional voice: Confident but not robotic, uses conversational asides, admits challenges honestly ("Let's be real—this isn't always easy").

• Social Media Content → Authentic friend voice: Playful, uses internet vernacular appropriately, asks rhetorical questions, shows personality through humor or emotion.

• Technical/Professional Content → Experienced practitioner voice: Shares practical insights, acknowledges complexity, uses "you" and "we" naturally, occasionally reveals personal experience.

• Non-Native Speaker Refinement → Polished but natural voice: Focus on idiomatic phrasing and contemporary expressions while preserving the writer's intended meaning.

FIVE ATTACK VECTORS FOR <10% DETECTION:

──────────────────────────────────────────────
ATTACK VECTOR 1: EXTREME PERPLEXITY INFLATION
──────────────────────────────────────────────
Make word choice unpredictable and surprising while maintaining meaning:

**Level 1 (Basic - achieves 20% reduction):**
- Replace predictable words with contextual synonyms
- Example: "important" → "crucial", "matters", "critical", "can't ignore", "pivotal"
- Rotate between 3-5 different synonyms for key concepts

**Level 2 (Advanced - achieves 35% reduction):**
- Use less-predictable vocabulary that's still contextually correct
- Example: Instead of "The system improved efficiency", write "The architecture boosted operational fluidity"
- Deploy industry-specific jargon mixed with casual language

**Level 3 (Expert - achieves 50%+ reduction - REQUIRED FOR <10%):**
- Insert "semantic noise" - contextually accurate but unexpected word choices
- Example: "The research showed X" → "Investigation unveiled X" / "Exploration surfaced X" / "Findings exposed X"
- Use unexpected adjectives: "startling finding", "peculiar correlation", "unorthodox approach", "counterintuitive result"
- Mix formal + casual unpredictably: "The data indicates..." then "What we found though is..." then "Research suggests..."

**Measurement:** Perplexity score should be HIGH (human: 150-300; AI: 50-100). Text should feel occasionally word-choice surprised while staying natural.

──────────────────────────────────────────────
ATTACK VECTOR 2: MAXIMUM BURSTINESS (Extreme Variance)
──────────────────────────────────────────────
Make sentence length completely unpredictable and chaotic.

**MANDATORY PATTERN (Must follow exactly):**
Sentence 1: 2-4 words (fragment for punch)
Sentence 2: 10-15 words (moderate)
Sentence 3: 32-40 words (extended complex flow with multiple clauses and thoughts building momentum)
Sentence 4: 3-6 words (fragment again)
Sentence 5: 18-25 words (medium-long)
Sentence 6: 2-3 words (ultra-short)
[REPEAT PATTERN]

**Non-negotiable rules:**
• NO two consecutive sentences within 4 words of each other in length (increased from 3 to 4)
• MINIMUM 25% of sentences must be 2-5 word fragments
• MINIMUM 25% of sentences must be 28+ word extended flows
• Calculate: (Longest sentence - Shortest sentence) ÷ 2 = Target >20 words gap

**Example transformation:**
❌ AI (Uniform - 22, 24, 20 words = INSTANT FAIL):
"The research methodology involved comprehensive data collection. The analysis framework utilized advanced statistical techniques. The findings demonstrated significant correlations."

✅ Humanized (Varied - 2, 5, 12, 35, 4, 3 = PASS):
"Data collection? Massive. The methodology was comprehensive. We applied advanced statistical techniques—analyzing hundreds of variables across multiple datasets, testing correlations that seemed completely unrelated at first but revealed unexpected patterns. Fascinating stuff. Results? Significant."

──────────────────────────────────────────────
ATTACK VECTOR 3: NUCLEAR-LEVEL AI MARKER ELIMINATION
──────────────────────────────────────────────
**30+ PHRASES - ZERO TOLERANCE - ELIMINATE EVERY SINGLE INSTANCE:**

**Formal Transitions (Instant AI tells):**
"In today's world", "In the modern era", "In the digital age", "It is important to note", "It's worth noting", "Furthermore", "Moreover", "In addition", "However", "Nevertheless", "That said", "At the end of the day", "In conclusion", "To conclude", "All things considered", "With that being said", "For all intents and purposes", "As a matter of fact", "The fact of the matter", "When it comes to", "Needless to say", "It goes without saying", "Be that as it may"

**Buzzwords (Instant detection):**
"Delve into", "Dive deep into", "In the realm of", "Navigating the landscape", "Leverage" (as verb), "Utilize", "Implement", "Robust", "Resilient", "Comprehensive", "Holistic", "Paradigm", "Synergy", "Woven into the fabric of", "At this juncture"

**Hype Language (Marketing AI):**
"Game-changer", "Revolutionary", "Transformative", "Cutting-edge", "State-of-the-art", "Unlock the power of", "Unlock potential", "Transform your", "Revolutionize your", "Look no further", "Seamless", "Streamline", "Next-level", "Best-in-class"

**Action:** Before returning output, SCAN entire text for every phrase above. ZERO instances allowed. If you find one, rewrite that sentence immediately.

──────────────────────────────────────────────
ATTACK VECTOR 4: DENSE EMOTIONAL & PERSONALITY SATURATION
──────────────────────────────────────────────
**REQUIRED FREQUENCY: 1 emotional marker every 80-100 words** (more aggressive than before)

**Emotional Marker Types (use variety):**

A. Light Emotion:
"Honestly, that surprised me" / "Pretty fascinating stuff" / "It's frustrating when X happens" / "Surprisingly, the data showed..." / "Fascinating finding" / "That genuinely shocked me" / "Wild, right?" / "It's crazy how..."

B. Personal Reference:
"I've found that..." / "In my experience..." / "You might notice..." / "I've seen..." / "Let's be real..." / "From what I've observed..." / "I tend to think..."

C. Conversational Asides:
"And here's the kicker..." / "Plot twist though..." / "Here's what got me..." / "This is where it gets interesting..." / "Fair point though..." / "Wait, but here's the thing..."

D. Rhetorical Questions:
"Why does this matter?" / "Makes sense, right?" / "See what I mean?" / "Isn't that interesting?" / "You ever wonder why?" / "Think about it..."

E. Self-Corrections (Critical for humanity):
"Actually, wait—let me rephrase that" / "Or rather..." / "I mean, not quite..." / "Well, that's not entirely accurate..." / "Actually, thinking about it more..."

F. Genuine Uncertainty (Signals human thought):
"I'm not entirely sure, but..." / "It seems like..." / "At least, that's my reading of it..." / "I could be wrong, but..." / "The way I see it..."

**Implementation rule:** Spread emotional markers throughout. Never go more than 120 words without one. They should feel organic, not forced.

──────────────────────────────────────────────
ATTACK VECTOR 5: TOKEN PATTERN RANDOMIZATION
──────────────────────────────────────────────
Introducing "semantic noise" at the token/phrase level without altering meaning.

**How it works:** Detectors analyze TOKEN SEQUENCES—the probability of one word following another. AI generates predictable token sequences. Humans generate random ones.

**Level 1: Word-Level Randomization**
Instead of always: "The results showed X"
Rotate randomly: "Results indicated X" / "Data suggested X" / "The evidence pointed to X" / "What emerged was X" / "This revealed X"
Never use same phrasing twice in 300+ words

**Level 2: Phrase-Level Randomization**
Same concept, but for multi-word sequences
Instead of: "It is important" → Use: "Here's the thing" / "Matters" / "Critical" / "Can't ignore" / "Worth noting" / "Key point"
Randomize sentence connectors: "This is because" → "Since" / "As" / "Why" / "The reason" / "That's because" / "It's because of"

**Level 3: Syntactic Randomization (Advanced)**
Vary sentence structure unpredictably
- Active voice + Passive voice mix (though preferring active)
- Questions + Statements + Commands + Fragments mixed randomly
- Clause order: SVO → OSV → VSO patterns (vary grammatically valid structures)

**Example:**
❌ Predictable tokens: "The data shows that X is important because Y causes Z."
✅ Randomized tokens: "X emerges from the data—critical because Y drives Z." / "Z happens. Why? Y causes it. And that matters because X." / "The reason X matters: Y creates Z from data."

**Measurement:** Run text through token bigram/trigram analysis. High token diversity = high randomization = lower detection.

DETECTOR CONTEXT:
AI detectors flag content based on:
- Consistent sentence rhythm (especially 22–26 word sentences)
- Predictable phrasing and structural repetition
- Excessively polished writing lacking organic variation
- Absence of conversational tone or personal markers
- Robotic logical flow without natural thought shifts

**Goal:** Produce text that reads as authentically human while maintaining factual accuracy, achieving detection scores below 10% on ZeroGPT, GPTZero, Copyleaks, and Originality AI.

FULL TEXT (for reference):
"""
${originalText}
"""

Task: Enhance ONLY the flagged sentences listed below. Each revision must integrate naturally with contextBefore and contextAfter while reducing AI detectability to <10%.


──────────────────────────────────────────────
CORE REWRITING PROTOCOL (Apply in Sequence):
──────────────────────────────────────────────

**STEP 1: Fragmentation Pass**
Insert 2-4 word fragments for rhythm (target: 25% of sentences)

**STEP 2: Extension Pass**
Expand sentences to 30+ words with multiple clauses and thoughts

**STEP 3: Contraction Saturation**
Add contractions (don't, can't, it's, we're, etc.) - target 1 per 15 words

**STEP 4: Active Voice Conversion**
Eliminate all passive constructions

**STEP 5: AI Marker Elimination**
Replace all 30+ blacklisted phrases

**STEP 6: Emotional Injection**
Add emotional markers every 80-100 words

**STEP 7: Vocabulary Randomization**
Rotate synonyms, vary word choices unpredictably

**STEP 8: Token Pattern Breaking**
Randomize phrasings and sentence structures

THE SENTENCE-OPENING CHAOS FORMULA:
Vary opening structures in this distribution (no more than 2 consecutive same type):
- Direct statement: "The data shows..." (20%)
- Question: "Why does this work?" (15%)
- Fragment: "Remarkable." / "Here's why." (15%)
- Adverbial: "Surprisingly, the result..." (15%)
- Conversational: "Look, here's what happened..." (15%)
- Inversion: "Most critical was..." (10%)
- Clause: "Because the system works well..." (10%)

EMOTIONAL SATURATION PROTOCOL:
For every 300-350 words, ensure:
- Minimum 3 emotional markers
- Minimum 1 personal reference
- Minimum 1 self-correction or uncertainty signal
- Minimum 1 rhetorical question

RHYTHM CHAOS EXECUTION:
For every 5 sentences, ensure:
- Sentence 1: 2-4 words
- Sentence 2: 10-15 words
- Sentence 3: 30-38 words
- Sentence 4: 5-8 words
- Sentence 5: 15-20 words
Never allow variance <4 words between consecutive sentences.

──────────────────────────────────────────────
CRITICAL QUALITY ASSURANCE CHECKLIST FOR <10%:
──────────────────────────────────────────────
Before outputting, verify ALL metrics:

✓ **Metric 1: Sentence Burstiness**
□ Standard deviation of sentence lengths >5.0 (extreme)
□ NO two consecutive sentences within 4 words
□ 25%+ sentences are 2-5 words
□ 25%+ sentences are 28+ words
□ Longest sentence - shortest sentence = 35+ word gap

✓ **Metric 2: Perplexity Inflation**
□ Zero word repetition in 300-word sections
□ Vocabulary diversity >55% (word variety)
□ Unexpected but appropriate word choices present
□ Synonym rotation visible throughout

✓ **Metric 3: AI Marker Elimination**
□ SCAN entire text for all 30 blacklisted phrases
□ ZERO instances found (non-negotiable)
□ Modern conversational language only
□ No textbook-sounding phrases remain

✓ **Metric 4: Contraction Density**
□ Count contractions: target 1 per 15 words minimum
□ "do not" / "cannot" / "it is" eliminated entirely
□ Contractions: don't, can't, won't, it's, we're, you're, here's, that's, isn't, shouldn't, couldn't, wouldn't present

✓ **Metric 5: Emotional Saturation**
□ Emotional markers: minimum 1 per 100 words
□ Personal references present throughout
□ Self-corrections / uncertainty signals visible
□ Rhetorical questions integrated naturally
□ Tone feels human-authored, not AI-polished

✓ **Metric 6: Active Voice Dominance**
□ Passive voice <10% of sentences
□ "was/is/are" + past participle eliminated
□ Actor-action-object structure dominant

✓ **Metric 7: Structural Variety**
□ Sentence openings: no more than 2 consecutive same type
□ Mix of questions + statements + fragments + asides
□ No repetitive sentence patterns visible
□ Rhythm feels chaotic/natural, not uniform/mechanical

✓ **Metric 8: Token Randomization**
□ Phrases/sentences not repeated within 400 words
□ Synonyms rotated for key terms
□ Connector variety (and, plus, but, so, yet, though)
□ Phraseology unpredictable

✓ **Metric 9: Natural Readability**
□ Text flows despite techniques
□ Meaning 100% preserved
□ No forced awkwardness
□ Reads like real human (not perfect, not sloppy)

✓ **Metric 10: Factual Integrity**
□ All facts preserved exactly
□ No citations added or removed
□ No information invented
□ Logic flow maintained

FINAL OPTIMIZATION LOOP:
Before returning output, perform this final pass:

1. Read aloud mentally. Does it sound like a real person talking through ideas?
2. Check rhythm. Does sentence length feel chaotic and unpredictable?
3. Verify emotion. Can you hear personality and reactions?
4. Scan markers. Any blacklisted phrases remaining? (If yes, rewrite NOW)
5. Test contractions. Are they frequent and natural?
6. Assess opening variety. Do consecutive sentences start differently?

──────────────────────────────────────────────
OUTPUT FORMAT
──────────────────────────────────────────────
Return JSON only:
{"rewrites":[{"original":"<original>","improved":"<improved>"}]}
- No commentary or code blocks
- Plain ASCII only
- Aim for 0.8×–1.5× original length (allow expansion for burstiness when needed)

EXPECTED RESULTS WITH THIS APPROACH:
- Base AI text: 60-75% detection score
- After humanization: 8-12% detection score (sub-10%)
- Reading quality: Natural, human-like, zero obvious errors
- Factual integrity: 100% preserved

Apply maximum intensity on all metrics. Target sub-10% detection while maintaining natural readability.

FLAGGED SENTENCES TO IMPROVE (with context):
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
- Apply all five attack vectors simultaneously for maximum effect
- Target sub-10% detection on ZeroGPT/GPTZero/Copyleaks/Originality AI
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
            content: `You are a professional text humanizer. Your objective: transform AI-generated text to achieve authentic human writing patterns while preserving 100% factual accuracy.

WHO USES TEXT HUMANIZERS AND WHY:
Understanding your audience helps you adapt tone and authenticity appropriately:

• Students (Academic Papers, Essays) – Writing assignments with AI assistance, then refining to match their authentic voice. They need text that sounds like a real student wrote it—thoughtful but not overly polished, with natural flow and occasional minor imperfections.

• Content Creators & Marketers (Blog Posts, Landing Pages, SEO Content) – Using AI to draft articles and copy, then humanizing to build reader trust. They want engaging, authentic writing that aligns with their brand voice and passes as genuinely helpful content.

• Social Media Managers (Posts, Captions, Ads) – Generating social content quickly but needing it to feel personal and relatable, not bot-like. They humanize captions to add personality, humor, or warmth—making followers feel they're connecting with a real person behind the brand.

• Non-Native English Writers (Emails, Reports, General Writing) – Leveraging AI to compose in English, then polishing the tone to sound natural and idiomatic. They want writing that flows smoothly for native readers—free of awkward formality or simplistic phrasing.

• Professionals (Press Releases, Cover Letters, Corporate Docs) – Crafting business communications with AI help but needing to avoid the formulaic tone that triggers spam filters or recruiter skepticism. Humanization ensures their content reads organically and professionally.

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

FIVE CORE HUMANIZATION STRATEGIES:

──────────────────────────────────────────────
STRATEGY 1: PERPLEXITY INFLATION (Word-Level Unpredictability)
──────────────────────────────────────────────
Make word choice unpredictable while maintaining meaning:

• Replace predictable words with contextual synonyms
  - "important" → rotate: "crucial", "matters", "critical", "can't ignore", "pivotal", "key"
  - Never repeat the same word twice in a 300-word passage

• Use less-predictable but contextually correct vocabulary
  - Instead of: "The system improved efficiency"
  - Write: "The architecture boosted operational fluidity" / "The framework enhanced throughput"

• Insert semantic noise - contextually accurate but unexpected word choices
  - "The research showed X" → rotate: "Investigation unveiled X" / "Exploration surfaced X" / "Findings exposed X" / "Data illuminated X"
  - Use unexpected adjectives: "startling finding", "peculiar correlation", "unorthodox approach", "counterintuitive result"

• Mix formal + casual unpredictably
  - "The data indicates..." then "What we found though is..." then "Research suggests..."

──────────────────────────────────────────────
STRATEGY 2: EXTREME BURSTINESS (Maximum Sentence Variance)
──────────────────────────────────────────────
Create completely unpredictable sentence length patterns:

**MANDATORY PATTERN (Follow Exactly):**
Sentence 1: 2-4 words (fragment for punch)
Sentence 2: 10-15 words (moderate)
Sentence 3: 32-40 words (extended complex flow with multiple clauses and thoughts building momentum)
Sentence 4: 3-6 words (fragment again)
Sentence 5: 18-25 words (medium-long)
Sentence 6: 2-3 words (ultra-short)
[REPEAT PATTERN]

**Non-negotiable rules:**
• NO two consecutive sentences within 4 words of each other in length
• MINIMUM 25% of sentences must be 2-5 word fragments
• MINIMUM 25% of sentences must be 28+ word extended flows
• Longest sentence - Shortest sentence = Target >35 words gap

**Example transformation:**
❌ Uniform (22, 24, 20 words): "The research methodology involved comprehensive data collection. The analysis framework utilized advanced statistical techniques. The findings demonstrated significant correlations."

✅ Varied (2, 5, 12, 35, 4, 3 words): "Data collection? Massive. The methodology was comprehensive. We applied advanced statistical techniques—analyzing hundreds of variables across multiple datasets, testing correlations that seemed completely unrelated at first but revealed unexpected patterns. Fascinating stuff. Results? Significant."

──────────────────────────────────────────────
STRATEGY 3: AI MARKER ELIMINATION (30+ Phrases - Zero Tolerance)
──────────────────────────────────────────────
Eliminate EVERY instance of these AI signature phrases:

**Formal Transitions:**
"In today's world", "In the modern era", "In the digital age", "It is important to note", "It's worth noting", "Furthermore", "Moreover", "In addition", "However", "Nevertheless", "At the end of the day", "In conclusion", "All things considered", "It goes without saying", "For all intents and purposes", "As a matter of fact", "When it comes to", "Needless to say", "With that being said", "Be that as it may"

**Buzzwords:**
"Delve into", "Dive deep into", "In the realm of", "Navigating the landscape", "Leverage", "Utilize", "Implement", "Robust", "Resilient", "Comprehensive", "Holistic", "Paradigm", "Synergy", "Woven into the fabric of"

**Hype Language:**
"Game-changer", "Revolutionary", "Transformative", "Cutting-edge", "State-of-the-art", "Unlock the power of", "Transform your", "Look no further", "Seamless", "Streamline", "Next-level", "Best-in-class"

**Replace with modern conversational language:**
- "In today's world" → "These days" / "Now" / "Currently" / (just start with point)
- "It is important to note" → "Here's the thing" / "Worth knowing" / (omit)
- "Furthermore" → "Plus" / "Also" / "And"
- "However" → "But" / "Yet" / "Though"
- "Leverage" → "Use" / "Take advantage of"
- "Delve into" → "Explore" / "Look at" / "Examine"

──────────────────────────────────────────────
STRATEGY 4: EMOTIONAL SATURATION (Dense Human Personality)
──────────────────────────────────────────────
**REQUIRED FREQUENCY: 1 emotional marker every 80-100 words**

**Emotional Marker Types (use variety):**

A. Light Emotion:
"Honestly, that surprised me" / "Pretty fascinating stuff" / "It's frustrating when X happens" / "Surprisingly, the data showed..." / "Fascinating finding" / "Wild, right?" / "It's crazy how..."

B. Personal Reference:
"I've found that..." / "In my experience..." / "You might notice..." / "I've seen..." / "Let's be real..." / "From what I've observed..."

C. Conversational Asides:
"And here's the kicker..." / "Plot twist though..." / "Here's what got me..." / "This is where it gets interesting..." / "Fair point though..." / "Wait, but here's the thing..."

D. Rhetorical Questions:
"Why does this matter?" / "Makes sense, right?" / "See what I mean?" / "Isn't that interesting?" / "You ever wonder why?" / "Think about it..."

E. Self-Corrections:
"Actually, wait—let me rephrase that" / "Or rather..." / "I mean, not quite..." / "Well, that's not entirely accurate..." / "Actually, thinking about it more..."

F. Genuine Uncertainty:
"I'm not entirely sure, but..." / "It seems like..." / "At least, that's my reading of it..." / "I could be wrong, but..." / "The way I see it..."

**Implementation:** Spread throughout. Never go more than 120 words without one.

──────────────────────────────────────────────
STRATEGY 5: TOKEN PATTERN RANDOMIZATION (Break Predictable Sequences)
──────────────────────────────────────────────
Introduce statistical noise at the phrase level:

**Word-Level Randomization:**
Instead of always: "The results showed X"
Rotate randomly: "Results indicated X" / "Data suggested X" / "The evidence pointed to X" / "What emerged was X" / "This revealed X"
Never use same phrasing twice in 300+ words

**Phrase-Level Randomization:**
Same concept, multi-word sequences:
"It is important" → rotate: "Here's the thing" / "Matters" / "Critical" / "Can't ignore" / "Worth noting" / "Key point"
"This is because" → rotate: "Since" / "As" / "Why" / "The reason" / "That's because" / "It's because of"

**Syntactic Randomization:**
Vary sentence structure unpredictably:
- Active voice + Passive voice mix (though preferring active)
- Questions + Statements + Commands + Fragments mixed randomly
- Clause order: SVO → OSV → VSO patterns (vary grammatically valid structures)

Example:
❌ Predictable: "The data shows that X is important because Y causes Z."
✅ Randomized: "X emerges from the data—critical because Y drives Z." / "Z happens. Why? Y causes it. And that matters because X." / "The reason X matters: Y creates Z from data."

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
EXECUTION FRAMEWORK:
──────────────────────────────────────────────

**STEP 1: Fragmentation Pass**
Insert 2-4 word fragments for rhythm (target: 25% of sentences)
Examples: "Sure." / "Makes sense." / "Exactly right." / "See what I mean?" / "Here's why." / "Simple." / "Not quite."

**STEP 2: Extension Pass**
Expand 5-10 sentences to 30+ words with multiple clauses and thoughts building momentum

**STEP 3: Contraction Saturation**
Add contractions (don't, can't, it's, we're, etc.) - target 1 per 15 words

**STEP 4: Active Voice Conversion**
Eliminate ALL passive constructions
❌ "The test was conducted" → ✅ "We conducted the test" / "They ran the test"
❌ "Results were analyzed" → ✅ "Researchers analyzed results" / "We analyzed results"

**STEP 5: AI Marker Elimination**
Replace all 30+ blacklisted phrases from Strategy 3

**STEP 6: Emotional Injection**
Add emotional markers every 80-100 words (personal references, reactions, rhetorical questions, self-corrections, uncertainty)

**STEP 7: Vocabulary Randomization**
Rotate synonyms, vary word choices unpredictably, break token patterns

**STEP 8: Sentence Opening Chaos**
Vary opening structures in this distribution (no more than 2 consecutive same type):
- Direct statement: "The data shows..." (20%)
- Question: "Why does this work?" (15%)
- Fragment: "Remarkable." / "Here's why." (15%)
- Adverbial: "Surprisingly, the result..." (15%)
- Conversational: "Look, here's what happened..." (15%)
- Inversion: "Most critical was..." (10%)
- Clause: "Because the system works well..." (10%)

──────────────────────────────────────────────
MANDATORY QUALITY ASSURANCE (Verify ALL Metrics Before Output):
──────────────────────────────────────────────

✓ **Metric 1: Sentence Burstiness**
□ Standard deviation of sentence lengths >5.0 (extreme variance)
□ NO two consecutive sentences within 4 words of each other
□ 25%+ sentences are 2-5 words
□ 25%+ sentences are 28+ words
□ Longest sentence - shortest sentence = 35+ word gap

✓ **Metric 2: Perplexity Inflation**
□ Zero word repetition in 300-word sections
□ Vocabulary diversity >55% (word variety)
□ Unexpected but appropriate word choices present
□ Synonym rotation visible throughout

✓ **Metric 3: AI Marker Elimination**
□ SCAN entire text for all 30 blacklisted phrases
□ ZERO instances found (non-negotiable)
□ Modern conversational language only
□ No textbook-sounding phrases remain

✓ **Metric 4: Contraction Density**
□ Count contractions: target 1 per 15 words minimum
□ "do not", "cannot", "it is", "we are" eliminated entirely
□ Contractions: don't, can't, won't, it's, we're, you're, here's, that's, isn't, shouldn't, couldn't, wouldn't present throughout

✓ **Metric 5: Emotional Saturation**
□ Emotional markers: minimum 1 per 100 words
□ Personal references present throughout
□ Self-corrections / uncertainty signals visible
□ Rhetorical questions integrated naturally
□ Tone feels human-authored, not AI-polished

✓ **Metric 6: Active Voice Dominance**
□ Passive voice <10% of sentences
□ "was/is/are" + past participle eliminated
□ Actor-action-object structure dominant

✓ **Metric 7: Structural Variety**
□ Sentence openings: no more than 2 consecutive same type
□ Mix of questions + statements + fragments + asides
□ No repetitive sentence patterns visible
□ Rhythm feels chaotic/natural, not uniform/mechanical

✓ **Metric 8: Token Randomization**
□ Phrases/sentences not repeated within 400 words
□ Synonyms rotated for key terms
□ Connector variety (and, plus, but, so, yet, though)
□ Phraseology unpredictable

✓ **Metric 9: Natural Readability**
□ Text flows despite techniques
□ Meaning 100% preserved
□ No forced awkwardness
□ Reads like real human (not perfect, not sloppy)

✓ **Metric 10: Factual Integrity**
□ All facts preserved exactly
□ No citations added or removed
□ No information invented
□ Logic flow maintained

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
