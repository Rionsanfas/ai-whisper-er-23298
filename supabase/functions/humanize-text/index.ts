import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const SAPLING_API_KEY = Deno.env.get("SAPLING_API_KEY");
const ZEROGPT_API_KEY = Deno.env.get("ZEROGPT_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Configuration Constants
const MAX_INPUT_LENGTH = 15000;
const API_TIMEOUT = 90000;
const DETECTOR_TIMEOUT = 15000;
const LOG_LEVEL = Deno.env.get("LOG_LEVEL") || "ERROR";

const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:8080", 
  "https://lovable.dev",
  "https://gjvrdthkcrjpvfdincfn.lovable.app",
  "https://91e106d7-b8f0-4cd7-875e-2888d00d034a.lovableproject.com",
  "https://id-preview--",
  "https://preview--",
  ".lovable.app",
  ".lovableproject.com",
];

const rateLimitStore = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_PER_MINUTE = 10;
const RATE_LIMIT_PER_HOUR = 100;

// Document Type Detection
type DocumentType = 'email' | 'academic_paper' | 'research_paper' | 'essay' | 'memo' | 'proposal' | 'generic';

function detectDocumentType(text: string): DocumentType {
  const lowerText = text.toLowerCase();
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  
  // Email patterns
  if (lowerText.includes('dear ') || lowerText.includes('hi ') || 
      lowerText.includes('regards') || lowerText.includes('sincerely') ||
      /^(to|from|subject|date):/mi.test(text)) {
    return 'email';
  }
  
  // Memo patterns
  if (/^(to|from|date|re|subject):/mi.test(text) && lowerText.includes('memo')) {
    return 'memo';
  }
  
  // Academic/Research paper patterns
  const academicKeywords = ['abstract', 'introduction', 'methodology', 'results', 
                            'discussion', 'conclusion', 'references', 'bibliography',
                            'hypothesis', 'literature review', 'research question'];
  const hasAcademicStructure = academicKeywords.filter(kw => lowerText.includes(kw)).length >= 3;
  const hasCitations = /\[\d+\]|\(\w+,?\s+\d{4}\)/.test(text);
  
  if (hasAcademicStructure || hasCitations) {
    if (lowerText.includes('thesis') || lowerText.includes('dissertation') || 
        lowerText.includes('study') || lowerText.includes('experiment')) {
      return 'research_paper';
    }
    return 'academic_paper';
  }
  
  // Essay patterns
  const hasThesis = /\b(thesis|argument|claim|contention)\b/i.test(text);
  const hasEssayStructure = lines.length > 10 && 
    (lowerText.includes('in conclusion') || lowerText.includes('to summarize') || 
     lowerText.includes('in summary'));
  
  if ((hasThesis && hasEssayStructure) || 
      (text.length > 500 && text.length < 5000 && hasEssayStructure)) {
    return 'essay';
  }
  
  // Proposal patterns
  if (lowerText.includes('proposal') || lowerText.includes('executive summary') ||
      (lowerText.includes('budget') && lowerText.includes('timeline'))) {
    return 'proposal';
  }
  
  return 'generic';
}

// Document-specific humanization rules
function getDocumentSpecificInstructions(docType: DocumentType): string {
  const instructions = {
    email: `
EMAIL-SPECIFIC RULES:
- Maintain professional yet conversational tone
- Use natural greetings and closings
- Include brief, friendly transitions
- Shorter paragraphs (2-4 sentences max)
- Direct, action-oriented language
- Occasional informal contractions (I'll, we're)
- Personal pronouns (I, we, you)`,

    academic_paper: `
ACADEMIC PAPER RULES (STUDENT/ASSIGNMENT SPECIALIZATION):
- Formal yet accessible academic tone with personal scholarly voice
- Bridge factual analysis with opinion and reflection naturally
- "What made this topic matter to me was..." style integration
- Complex sentences mixed with clear, direct statements
- Disciplinary terminology with natural explanation (register shifting)
- Varied citation integration - not formulaic, natural progression
- Strong topic sentences with natural development from lived context
- Logical flow with human reasoning patterns, not just source summary
- Occasional hedging (may, might, could suggest)
- Mix of passive and active voice (70% active)
- Extra density/temporal/semantic bridging in body and conclusion
- Emphasize original argument structure over summary`,

    research_paper: `
RESEARCH PAPER RULES (ACADEMIC/HOMEWORK SPECIALIZATION):
- Scientific rigor with human interpretation and personal investment
- Data presentation with natural commentary from researcher perspective
- Methodological clarity showing thought process, not robotic description
- Results discussion with genuine analysis and reflection
- Bridge technical findings with personal insight ("This surprised me because...")
- Limitations acknowledged naturally with context
- Implications explored with authentic reasoning and real-world connection
- Technical precision balanced with readability
- Strategic use of "we" for inclusive scholarly voice
- Integrate "research project"/"assignment" vocabulary distinctly
- Register shifts between formal citation and conversational insight
- Temporal anchoring to research process and timeline`,

    essay: `
ESSAY/STUDENT WRITING RULES (MAXIMUM PRIORITY FOCUS):
- Authentic student voice with developing arguments from personal lens
- Emphasize original perspective and lived context, not just summary
- Natural progression of ideas with personal insight and reflection
- "What struck me about this was..." style integration
- Mix of confident assertions and thoughtful questioning
- Occasional informal asides or realizations ("Honestly, I hadn't considered...")
- Varied sentence complexity reflecting genuine thinking process
- Personal examples and connections to real experience
- Natural transitions that show thought process evolution
- Imperfect but coherent logical flow - authentic development
- Emotional engagement with topic through personal investment
- Strategic use of rhetorical devices without over-polish
- Bridge analysis with opinion seamlessly
- Extra register shifting: formal argument ↔ conversational reflection
- Density/temporal/semantic bridging throughout
- Citations and sources integrated naturally, not mechanically
- Show homework/assignment context appropriately`,

    memo: `
MEMO RULES:
- Direct, business-focused language
- Bullet points with natural lead-ins
- Clear action items
- Concise paragraphs
- Professional but approachable tone
- Skip unnecessary formality`,

    proposal: `
PROPOSAL RULES:
- Persuasive yet professional tone
- Clear value propositions
- Mix of visionary and practical language
- Natural enthusiasm without hyperbole
- Structured sections with smooth transitions
- Confident recommendations with supporting rationale`,

    generic: `
GENERAL WRITING RULES:
- Natural, conversational flow
- Varied sentence structures
- Clear, engaging language
- Authentic human voice`
  };

  return instructions[docType];
}

// Advanced Techniques Prompt Components
const ADVANCED_TECHNIQUES = `
ADVANCED HUMANIZATION TECHNIQUES (Sections 22-30):

SECTION 22: PERPLEXITY ELEVATION
- Insert unpredictable word choices and phrasing
- Use surprising but fitting analogies
- Incorporate idiomatic expressions naturally
- Vary vocabulary unexpectedly within context
- Examples: "crystal clear" → "makes perfect sense", "important" → "game-changing"

SECTION 23: BURSTINESS CALIBRATION
Target Distribution:
- 25% short sentences (3-8 words)
- 45% medium sentences (9-18 words)
- 25% long sentences (19-30 words)
- 5% very short fragments (1-2 words)
Calculate standard deviation: target 4.5-6.0 words
Natural clustering: 2-3 short, then 1-2 long, unpredictably

SECTION 24: DISCOURSE MARKER NATURALNESS
Replace AI markers:
❌ "Furthermore," "Moreover," "Additionally," "Consequently," "Thus," "Hence"
✅ "And," "But," "So," "Plus," "Also," "Still," "Yet," "Now,"
Context-aware natural connectors:
- "Here's the thing" (realization)
- "What's interesting is" (observation)
- "The catch is" (contrast)
- "Get this" (surprise)

SECTION 25: REGISTER & JARGON SHIFTS
Seamlessly bridge formal/informal:
- Technical term → plain explanation → back to technical
- Academic language → conversational aside → resume formality
- Example: "The algorithm optimizes parameters. Put simply, it finds the best settings. This recursive approach..."

SECTION 26: STYLISTIC FINGERPRINT AVOIDANCE
Randomize common LLM patterns:
❌ "It's important to note that"
❌ "It's worth mentioning"
❌ "In today's world"
❌ "In conclusion, it can be said"
✅ Direct statements without meta-commentary
✅ Natural conclusions without announcements
✅ Varied introductory phrases

SECTION 27: DENSITY & CERTAINTY MODULATION
Alternate information density:
- Dense: "The study examined three variables: age, income, education level."
- Light: "We looked at a few key factors. Age mattered."
Vary certainty levels:
- Absolute: "This proves X"
- Moderate: "This suggests X"
- Tentative: "This might indicate X"
- Questioning: "Does this mean X?"

SECTION 28: TEMPORAL ANCHORING
Add realistic time references:
- "Last week I noticed..."
- "For months now..."
- "Recently..."
- "Back in [season/year]..."
- "The other day..."
Mix past, present, future perspectives naturally

SECTION 29: SEMANTIC BRIDGES
Link ideas through:
- Personal experience: "I've seen this before when..."
- Real-world examples: "Think about how..."
- Analogies: "It's like when you..."
- Contextual connections: "This reminds me of..."
Not just logical progression, but experiential reasoning

SECTION 30: ANTI-PATTERN AUDIT
Final scan for over-application:
✓ Fragment ratio: 25-35% (not more)
✓ Contraction frequency: 1 per 12-15 words
✓ No clustered techniques
✓ No repetitive patterns
✓ No forced informality in formal contexts
✓ Smooth, natural flow maintained`;

// QA Metrics Checklist
const QA_METRICS = `
QA METRICS CHECKLIST (MANDATORY - Must Pass ALL Before Output):

Verify EACH metric below before returning output:

1. SEMANTIC FIDELITY: 100% (no factual changes from original)
2. CONTRACTIONS: 1 per 12-15 words (calculate total contractions/total words)
3. FRAGMENT RATIO: 30-35% of sentences (count fragments vs total sentences)
4. SENTENCE LENGTH SD: 3.0-3.8 words (calculate standard deviation)
5. ACTIVE VOICE: 90%+ of sentences (count actor-first constructions)
6. AI MARKER COUNT: 0 (completely eliminate: Furthermore, Moreover, Additionally, etc.)
7. VOCABULARY REPETITION: Max 2 uses per word per 300 words
8. EMOTIONAL ANCHORING: Present in EVERY paragraph (Honestly, Actually, Surprisingly, etc.)
9. READ-ALOUD NATURALNESS: 100% pass rate (every sentence flows when spoken)
10. DETECTOR SELF-SIMULATION: Estimated score <2% for all detector families

FAILURE PROTOCOL:
If ANY metric fails → Re-apply advanced techniques focusing on failed area
If metrics still fail after 1 retry → Flag for manual review but return best version

CALCULATION FORMULAS:
- Contraction Density = (Total Contractions / Total Words) × 100
  Target: 6.67-8.33% (1 per 12-15 words)
- Fragment Ratio = (Fragment Count / Total Sentences) × 100
  Target: 30-35%
- Sentence Length SD = Standard Deviation of all sentence lengths
  Target: 3.0-3.8 words
- Active Voice % = (Active Voice Sentences / Total Sentences) × 100
  Target: 90%+
- Vocabulary Repetition = Count instances of each word per 300-word block
  Target: ≤2 uses per word per block

PRIORITY: Essay and Academic documents receive MAXIMUM scrutiny on ALL metrics`;

// QA Metrics calculation functions
function calculateQAMetrics(text: string): any {
  // Split into sentences
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const totalSentences = sentences.length;
  
  // Word count
  const words = text.split(/\s+/).filter(w => w.trim().length > 0);
  const totalWords = words.length;
  
  // 1. Contractions count
  const contractionPattern = /\b\w+[''](?:t|s|re|ve|ll|d|m)\b/gi;
  const contractions = text.match(contractionPattern) || [];
  const contractionDensity = (contractions.length / totalWords) * 100;
  const contractionTarget = contractionDensity >= 6.67 && contractionDensity <= 8.33;
  
  // 2. Fragment detection (sentences < 6 words or incomplete)
  const fragments = sentences.filter(s => {
    const sWords = s.trim().split(/\s+/).length;
    return sWords < 6 || !/\b(is|are|was|were|be|been|has|have|had|do|does|did|will|would|can|could|should|must)\b/i.test(s);
  });
  const fragmentRatio = (fragments.length / totalSentences) * 100;
  const fragmentTarget = fragmentRatio >= 30 && fragmentRatio <= 35;
  
  // 3. Sentence length standard deviation
  const sentenceLengths = sentences.map(s => s.trim().split(/\s+/).length);
  const avgLength = sentenceLengths.reduce((a, b) => a + b, 0) / sentenceLengths.length;
  const variance = sentenceLengths.reduce((sum, len) => sum + Math.pow(len - avgLength, 2), 0) / sentenceLengths.length;
  const stdDev = Math.sqrt(variance);
  const stdDevTarget = stdDev >= 3.0 && stdDev <= 3.8;
  
  // 4. Active voice detection (rough heuristic: subject-verb-object, no passive markers)
  const passiveMarkers = /\b(was|were|been|being)\s+\w+(ed|en)\b/gi;
  const passiveSentences = sentences.filter(s => passiveMarkers.test(s)).length;
  const activeSentences = totalSentences - passiveSentences;
  const activeVoicePercent = (activeSentences / totalSentences) * 100;
  const activeVoiceTarget = activeVoicePercent >= 90;
  
  // 5. AI markers detection
  const aiMarkers = [
    'furthermore', 'moreover', 'additionally', 'consequently', 
    'thus', 'hence', 'firstly', 'secondly', 'thirdly',
    'it is important to note', 'it is worth mentioning',
    'in conclusion, it can be said', 'in today\'s world'
  ];
  const lowerText = text.toLowerCase();
  const foundMarkers = aiMarkers.filter(marker => lowerText.includes(marker));
  const aiMarkerTarget = foundMarkers.length === 0;
  
  // 6. Vocabulary repetition (simplified check)
  const wordFreq: { [key: string]: number } = {};
  const blocks = Math.ceil(totalWords / 300);
  let maxRepetition = 0;
  
  for (let i = 0; i < blocks; i++) {
    const blockWords = words.slice(i * 300, (i + 1) * 300)
      .map(w => w.toLowerCase().replace(/[^a-z]/g, ''))
      .filter(w => w.length > 3); // Only count words > 3 chars
    
    const blockFreq: { [key: string]: number } = {};
    blockWords.forEach(w => {
      blockFreq[w] = (blockFreq[w] || 0) + 1;
      if (blockFreq[w] > maxRepetition) maxRepetition = blockFreq[w];
    });
  }
  const vocabRepetitionTarget = maxRepetition <= 2;
  
  // 7. Emotional anchoring (check for presence in paragraphs)
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 0);
  const emotionalWords = ['honestly', 'actually', 'surprisingly', 'interestingly', 'frankly', 
                          'clearly', 'obviously', 'really', 'truly'];
  const paragraphsWithEmotion = paragraphs.filter(p => 
    emotionalWords.some(ew => p.toLowerCase().includes(ew))
  ).length;
  const emotionCoverage = (paragraphsWithEmotion / paragraphs.length) * 100;
  const emotionalAnchoringTarget = emotionCoverage >= 90; // At least 90% of paragraphs
  
  // Overall pass/fail
  const allMetricsPassed = contractionTarget && fragmentTarget && stdDevTarget && 
                          activeVoiceTarget && aiMarkerTarget && vocabRepetitionTarget && 
                          emotionalAnchoringTarget;
  
  return {
    passed: allMetricsPassed,
    metrics: {
      contractionDensity: {
        value: contractionDensity.toFixed(2),
        target: '6.67-8.33%',
        passed: contractionTarget,
        count: contractions.length,
        totalWords,
      },
      fragmentRatio: {
        value: fragmentRatio.toFixed(2),
        target: '30-35%',
        passed: fragmentTarget,
        count: fragments.length,
        totalSentences,
      },
      sentenceLengthSD: {
        value: stdDev.toFixed(2),
        target: '3.0-3.8',
        passed: stdDevTarget,
      },
      activeVoicePercent: {
        value: activeVoicePercent.toFixed(2),
        target: '90%+',
        passed: activeVoiceTarget,
        activeSentences,
        totalSentences,
      },
      aiMarkerCount: {
        value: foundMarkers.length,
        target: '0',
        passed: aiMarkerTarget,
        foundMarkers,
      },
      vocabularyRepetition: {
        value: maxRepetition,
        target: '≤2 per 300 words',
        passed: vocabRepetitionTarget,
      },
      emotionalAnchoring: {
        value: emotionCoverage.toFixed(2),
        target: '90%+ paragraphs',
        passed: emotionalAnchoringTarget,
        paragraphsWithEmotion,
        totalParagraphs: paragraphs.length,
      },
    },
  };
}

// Core humanization prompt
function buildHumanizationPrompt(text: string, docType: DocumentType, examples: string): string {
  return `You are an expert text humanizer specializing in making AI-generated content completely undetectable by AI detection systems.

DOCUMENT TYPE DETECTED: ${docType.toUpperCase()}

${getDocumentSpecificInstructions(docType)}

CORE HUMANIZATION FRAMEWORK:

SECTION 1: ADVERSARIAL PARAPHRASING
Generate 3-5 variants for complex sentences using:
- Extreme simplification (60-70% words are 1-2 syllables)
- Syntax reshaping (split/merge sentences)
- Active voice conversion (90%+ actor-first)
- Conversational rephrasing (natural speech patterns)
- Strategic fragmentation for emphasis

SECTION 2: RHYTHM & VARIATION
- Fragment ratio: 25-35% (emphasis, transitions, reactions)
- Sentence length StdDev: 4.5-6.0 words
- Opening variation: rotate 7 types, never 2 consecutive same
- Natural clustering: 2-3 short, then 1-2 long, unpredictably

SECTION 3: CONNECTOR-BASED FLATTENING
Combine short sentences naturally with: which, as, because, that, when, where, while
Rotate connectors every 2-3 sentences
Create flowing, complex structures from choppy fragments

SECTION 4: CONTRACTION INJECTION
Target: 1 contraction per 12-15 words
Natural placements: I'm, we're, it's, they're, won't, can't, shouldn't
Context-appropriate: formal documents use fewer, conversational more

SECTION 5: AI MARKER ELIMINATION
Remove/replace: Furthermore, Moreover, Additionally, Consequently, Thus, Hence, 
                 Firstly/Secondly, In conclusion, It is important to note
Replace with: And, But, So, Plus, Also, Still, Yet, Now, Here's why

SECTION 6: EMOTIONAL ANCHORING
Add genuine reactions: Honestly, Actually, Surprisingly, Interestingly, Frankly
Strategic placement: after surprising points or before emphasis
Frequency: 2-3 per 200 words, context-dependent

SECTION 7-21: COMPREHENSIVE TECHNIQUE APPLICATION
Apply additional core humanization techniques systematically

${ADVANCED_TECHNIQUES}

${QA_METRICS}

${examples ? `

USER EXAMPLES FOR STYLE MATCHING:
${examples}

Match the tone, formality, and voice patterns from these examples.` : ''}

CRITICAL REQUIREMENTS:
1. Apply ALL techniques systematically
2. Maintain 100% factual accuracy and meaning
3. Natural flow - must sound human when read aloud
4. No over-engineering or forced patterns
5. Context-appropriate humanization

OUTPUT: Return ONLY the humanized text, no explanations or meta-commentary.

TEXT TO HUMANIZE:
${text}`;
}

// Stage 2 refinement prompt
function buildRefinementPrompt(text: string, stage1Detection: any): string {
  const flaggedSentences = stage1Detection.zerogpt?.flaggedSentences || [];
  const highScoreSentences = stage1Detection.sapling?.sentenceScores?.filter((s: any) => s.score > 70) || [];
  
  return `You are performing STAGE 2 refinement on humanized text that still shows AI detection signals.

STAGE 1 DETECTION RESULTS:
- Sapling Score: ${stage1Detection.sapling?.score || 'N/A'}%
- ZeroGPT Score: ${stage1Detection.zerogpt?.score || 'N/A'}%
- Flagged Sentences: ${flaggedSentences.length}
- High-probability sentences: ${highScoreSentences.length}

PRIORITY TARGETS:
${flaggedSentences.map((s: any, i: number) => `${i + 1}. [${s.score}%] "${s.sentence}"`).join('\n')}

REFINEMENT PROTOCOL:

STEP 1: AGGRESSIVE REWRITE OF FLAGGED CONTENT
For each flagged sentence:
- Generate 5-7 complete rewrites using different approaches
- Test each mentally against detection patterns
- Select the most natural, conversational variant
- Ensure seamless integration with surrounding text

STEP 2: CONTEXT HARMONIZATION
- Rewrite adjacent sentences for flow
- Maintain emotional/semantic arc
- Ensure natural transitions
- No abrupt style shifts

STEP 3: ADVANCED TECHNIQUE APPLICATION
Apply with maximum intensity:
- Perplexity elevation (unexpected but natural phrasing)
- Extreme burstiness (wider sentence length variation)
- Discourse marker replacement (remove all AI patterns)
- Register shifts (formal↔casual bridges)
- Temporal anchoring (add time references)
- Semantic bridges (experience-based reasoning)

STEP 4: ANTI-PATTERN AUDIT
Final check:
- No LLM fingerprints
- No repeated patterns
- No over-application of any single technique
- Natural flow when read aloud

SCORE GUARANTEE REQUIREMENT:
Your output MUST achieve LOWER or EQUAL scores on ALL detectors vs Stage 1.
If uncertain, favor simplicity and naturalness over complexity.

TARGET: Sapling <3%, ZeroGPT <3%

OUTPUT: Return ONLY the complete refined text, preserving all paragraph structure.

TEXT TO REFINE:
${text}`;
}

// Helper functions
function log(level: "ERROR" | "INFO" | "DEBUG", message: string, data?: any) {
  const levels = { ERROR: 0, INFO: 1, DEBUG: 2 };
  const currentLevel = levels[LOG_LEVEL as keyof typeof levels] || 0;
  
  if (levels[level] <= currentLevel) {
    if (level === "ERROR") {
      console.error(message, data ? JSON.stringify(data, null, 2) : "");
    } else {
      console.log(message, data ? JSON.stringify(data, null, 2) : "");
    }
  }
}

function validateInput(text: string): { valid: boolean; error?: string } {
  if (!text || typeof text !== "string") {
    return { valid: false, error: "Text must be a non-empty string" };
  }
  
  if (text.length > MAX_INPUT_LENGTH) {
    return { valid: false, error: `Text exceeds maximum length of ${MAX_INPUT_LENGTH} characters` };
  }
  
  const suspiciousPatterns = [
    /<script[^>]*>.*?<\/script>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi,
    /<iframe/gi,
  ];
  
  for (const pattern of suspiciousPatterns) {
    if (pattern.test(text)) {
      return { valid: false, error: "Text contains potentially malicious content" };
    }
  }
  
  return { valid: true };
}

function checkRateLimit(clientId: string): { allowed: boolean; error?: string } {
  const now = Date.now();
  const minuteKey = `${clientId}:minute`;
  const hourKey = `${clientId}:hour`;
  
  const minuteData = rateLimitStore.get(minuteKey);
  if (minuteData && minuteData.resetAt > now) {
    if (minuteData.count >= RATE_LIMIT_PER_MINUTE) {
      return { allowed: false, error: "Rate limit exceeded: too many requests per minute" };
    }
    minuteData.count++;
  } else {
    rateLimitStore.set(minuteKey, { count: 1, resetAt: now + 60000 });
  }
  
  const hourData = rateLimitStore.get(hourKey);
  if (hourData && hourData.resetAt > now) {
    if (hourData.count >= RATE_LIMIT_PER_HOUR) {
      return { allowed: false, error: "Rate limit exceeded: too many requests per hour" };
    }
    hourData.count++;
  } else {
    rateLimitStore.set(hourKey, { count: 1, resetAt: now + 3600000 });
  }
  
  return { allowed: true };
}

function checkOrigin(origin: string | null): boolean {
  if (!origin) return true;
  
  return ALLOWED_ORIGINS.some(allowed => {
    if (allowed.startsWith('.')) {
      return origin.includes(allowed);
    }
    return origin === allowed || origin.startsWith(allowed);
  });
}

function sanitize(text: string): string {
  return text
    .replace(/```[a-z]*\n?/g, '')
    .replace(/^\s*#+\s*/gm, '')
    .replace(/\*\*/g, '')
    .trim();
}

// AI Detection functions
async function detectWithSapling(text: string): Promise<any> {
  if (!SAPLING_API_KEY) {
    return { error: "Sapling API key not configured", score: null };
  }
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DETECTOR_TIMEOUT);
    
    const response = await fetch("https://api.sapling.ai/api/v1/aidetect", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        key: SAPLING_API_KEY,
        text: text,
      }),
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      const errorText = await response.text();
      log("ERROR", "Sapling detection failed", { status: response.status, error: errorText });
      return { error: `HTTP ${response.status}`, score: null };
    }
    
    const data = await response.json();
    const overallScore = data.score * 100;
    const sentenceScores = data.sentence_scores?.map((s: any) => ({
      sentence: s.sentence,
      score: s.score * 100,
    })) || [];
    
    return {
      score: overallScore,
      sentenceScores,
      error: null,
    };
  } catch (error) {
    log("ERROR", "Sapling detection error", { error: String(error) });
    return { error: String(error), score: null };
  }
}

async function detectWithZeroGPT(text: string): Promise<any> {
  if (!ZEROGPT_API_KEY) {
    return { error: "ZeroGPT API key not configured", score: null };
  }
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DETECTOR_TIMEOUT);
    
    const response = await fetch("https://api.zerogpt.com/api/detect/detectText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "ApiKey": ZEROGPT_API_KEY,
      },
      body: JSON.stringify({
        input_text: text,
      }),
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      const errorText = await response.text();
      log("ERROR", "ZeroGPT detection failed", { status: response.status, error: errorText });
      return { error: `HTTP ${response.status}`, score: null };
    }
    
    const data = await response.json();
    const score = data.data?.fakePercentage || 0;
    const flaggedSentences = data.data?.sentences
      ?.filter((s: any) => s.isFlagged)
      ?.map((s: any) => ({
        sentence: s.sentence,
        score: s.score,
      })) || [];
    
    return {
      score,
      flaggedSentences,
      error: null,
    };
  } catch (error) {
    log("ERROR", "ZeroGPT detection error", { error: String(error) });
    return { error: String(error), score: null };
  }
}

// Main humanization function
async function humanizeText(text: string, docType: DocumentType, examples: string): Promise<string> {
  if (!LOVABLE_API_KEY) {
    throw new Error("LOVABLE_API_KEY not configured");
  }
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);
  
  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: buildHumanizationPrompt(text, docType, examples),
          },
        ],
        temperature: 0.8,
      }),
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`AI API error: ${response.status} - ${errorText}`);
    }
    
    const data = await response.json();
    const humanizedText = data.choices?.[0]?.message?.content;
    
    if (!humanizedText) {
      throw new Error("No content in AI response");
    }
    
    return sanitize(humanizedText);
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

// Humanization with custom prompt (for QA retry)
async function humanizeWithCustomPrompt(customPrompt: string): Promise<string> {
  if (!LOVABLE_API_KEY) {
    throw new Error("LOVABLE_API_KEY not configured");
  }
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);
  
  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: customPrompt,
          },
        ],
        temperature: 0.8,
      }),
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`AI API error: ${response.status} - ${errorText}`);
    }
    
    const data = await response.json();
    const humanizedText = data.choices?.[0]?.message?.content;
    
    if (!humanizedText) {
      throw new Error("No content in AI response");
    }
    
    return sanitize(humanizedText);
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

// Stage 2 refinement
async function refineText(text: string, stage1Detection: any): Promise<string> {
  if (!LOVABLE_API_KEY) {
    throw new Error("LOVABLE_API_KEY not configured");
  }
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);
  
  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: buildRefinementPrompt(text, stage1Detection),
          },
        ],
        temperature: 0.9,
      }),
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`AI API error: ${response.status} - ${errorText}`);
    }
    
    const data = await response.json();
    const refinedText = data.choices?.[0]?.message?.content;
    
    if (!refinedText) {
      throw new Error("No content in AI response");
    }
    
    return sanitize(refinedText);
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

// Main request handler
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  
  const startTime = Date.now();
  
  try {
    // Origin validation
    const origin = req.headers.get("origin");
    if (!checkOrigin(origin)) {
      log("ERROR", "Unauthorized origin", { origin });
      return new Response(
        JSON.stringify({ error: "Unauthorized origin" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // Parse request
    const { text, examples = "" } = await req.json();
    
    // Input validation
    const validation = validateInput(text);
    if (!validation.valid) {
      return new Response(
        JSON.stringify({ error: validation.error }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // Authentication
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    const token = authHeader.replace("Bearer ", "");
    const supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });
    
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid authentication token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    const userId = user.id;
    const userTier = "free"; // Default tier
    
    // Rate limiting
    const rateLimit = checkRateLimit(userId);
    if (!rateLimit.allowed) {
      return new Response(
        JSON.stringify({ error: rateLimit.error }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // Check usage quota
    const { data: quotaData, error: quotaError } = await supabaseClient
      .rpc("check_usage_quota", { p_user_id: userId, p_tier: userTier });
    
    if (quotaError) {
      log("ERROR", "Quota check failed", { error: quotaError.message });
    } else if (quotaData && quotaData.length > 0) {
      const quota = quotaData[0];
      if (!quota.is_within_quota) {
        return new Response(
          JSON.stringify({ 
            error: "Usage quota exceeded", 
            quota: {
              used: quota.current_count,
              limit: quota.quota_limit,
              remaining: quota.remaining
            }
          }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }
    
    // STEP 1: DOCUMENT TYPE DETECTION
    const docType = detectDocumentType(text);
    log("INFO", `📄 Document type detected: ${docType}`);
    
    // STEP 2: CORE HUMANIZATION (Stage 1)
    log("INFO", "🔄 Starting Stage 1 humanization with document-specific rules...");
    let humanizedText = await humanizeText(text, docType, examples);
    
    // STEP 2.5: QA METRICS VALIDATION
    log("INFO", "📋 Validating QA metrics on humanized text...");
    let qaMetrics = calculateQAMetrics(humanizedText);
    
    // If QA metrics fail on first pass, retry with enhanced guidance (for academic/essay documents)
    if (!qaMetrics.passed && (docType === 'essay' || docType === 'academic_paper' || docType === 'research_paper')) {
      log("INFO", "⚠️ QA metrics failed on first pass, retrying with enhanced guidance...");
      
      // Build failure guidance
      const failedMetrics = Object.entries(qaMetrics.metrics)
        .filter(([_, metric]: [string, any]) => !metric.passed)
        .map(([name, metric]: [string, any]) => `${name}: ${JSON.stringify(metric)}`)
        .join('\n');
      
      const enhancedPrompt = buildHumanizationPrompt(text, docType, examples) + 
        `\n\n⚠️ CRITICAL QA METRICS FAILED ON PREVIOUS ATTEMPT:\n${failedMetrics}\n\n` +
        `MUST FIX: Apply extra focus on the failed metrics above. Re-check all requirements before output.`;
      
      try {
        const retryText = await humanizeWithCustomPrompt(enhancedPrompt);
        qaMetrics = calculateQAMetrics(retryText);
        
        if (qaMetrics.passed) {
          humanizedText = retryText;
          log("INFO", "✅ QA metrics passed on retry!");
        } else {
          log("INFO", "⚠️ QA metrics still failing after retry, using best version available");
          // Keep original humanizedText
        }
      } catch (error) {
        log("ERROR", "QA retry failed", { error: String(error) });
        // Keep original humanizedText
      }
    }
    
    log("INFO", "📊 QA Metrics Results", {
      passed: qaMetrics.passed,
      contractions: qaMetrics.metrics.contractionDensity.passed ? '✅' : '❌',
      fragments: qaMetrics.metrics.fragmentRatio.passed ? '✅' : '❌',
      stdDev: qaMetrics.metrics.sentenceLengthSD.passed ? '✅' : '❌',
      activeVoice: qaMetrics.metrics.activeVoicePercent.passed ? '✅' : '❌',
      aiMarkers: qaMetrics.metrics.aiMarkerCount.passed ? '✅' : '❌',
      vocabRep: qaMetrics.metrics.vocabularyRepetition.passed ? '✅' : '❌',
      emotion: qaMetrics.metrics.emotionalAnchoring.passed ? '✅' : '❌',
    });
    
    // STEP 3: STAGE 1 DETECTION
    log("INFO", "🔬 Running Stage 1 AI detection...");
    const [saplingResult1, zeroGPTResult1] = await Promise.all([
      detectWithSapling(humanizedText),
      detectWithZeroGPT(humanizedText),
    ]);
    
    const stage1Detection = {
      sapling: saplingResult1,
      zerogpt: zeroGPTResult1,
    };
    
    const detectorErrors: string[] = [];
    if (saplingResult1.error) detectorErrors.push(`Sapling: ${saplingResult1.error}`);
    if (zeroGPTResult1.error) detectorErrors.push(`ZeroGPT: ${zeroGPTResult1.error}`);
    
    log("INFO", "📊 Stage 1 detection results", {
      sapling: saplingResult1.score?.toFixed(2) + "%" || "FAILED",
      zerogpt: zeroGPTResult1.score?.toFixed(2) + "%" || "FAILED",
      errors: detectorErrors,
    });
    
    // STEP 4: DECIDE IF STAGE 2 IS NEEDED
    const saplingNeedsRefinement = saplingResult1.score !== null && saplingResult1.score > 3;
    const zerogptNeedsRefinement = zeroGPTResult1.score !== null && zeroGPTResult1.score > 3;
    const needsStage2 = saplingNeedsRefinement || zerogptNeedsRefinement;
    
    let saplingResult2 = saplingResult1;
    let zeroGPTResult2 = zeroGPTResult1;
    let stage2Worse = false;
    let finalText = humanizedText;
    
    if (needsStage2) {
      log("INFO", "⚡ Scores above 3% threshold, starting Stage 2 refinement...");
      
      try {
        const refinedText = await refineText(humanizedText, stage1Detection);
        
        // STEP 5: STAGE 2 DETECTION
        log("INFO", "🔬 Running Stage 2 detection...");
        const [saplingResult2Temp, zeroGPTResult2Temp] = await Promise.all([
          detectWithSapling(refinedText),
          detectWithZeroGPT(refinedText),
        ]);
        
        saplingResult2 = saplingResult2Temp;
        zeroGPTResult2 = zeroGPTResult2Temp;
        
        // STEP 6: SCORE GUARANTEE - Compare and decide
        const saplingImproved = saplingResult2.score !== null && saplingResult1.score !== null
          ? saplingResult2.score <= saplingResult1.score
          : true;
        const zerogptImproved = zeroGPTResult2.score !== null && zeroGPTResult1.score !== null
          ? zeroGPTResult2.score <= zeroGPTResult1.score
          : true;
        
        log("INFO", "🔀 Stage 2 vs Stage 1 comparison", {
          sapling: {
            stage1: saplingResult1.score?.toFixed(2) + "%",
            stage2: saplingResult2.score?.toFixed(2) + "%",
            improved: saplingImproved,
          },
          zerogpt: {
            stage1: zeroGPTResult1.score?.toFixed(2) + "%",
            stage2: zeroGPTResult2.score?.toFixed(2) + "%",
            improved: zerogptImproved,
          },
        });
        
        // Only use Stage 2 if ALL detectors improved or stayed same
        if (saplingImproved && zerogptImproved) {
          finalText = refinedText;
          log("INFO", "✅ Stage 2 accepted - scores improved/maintained");
        } else {
          stage2Worse = true;
          log("INFO", "⚠️ Stage 2 rejected - reverting to Stage 1 (better scores)");
        }
      } catch (error) {
        log("ERROR", "Stage 2 refinement failed", { error: String(error) });
        // Keep Stage 1 result on Stage 2 failure
      }
    } else {
      log("INFO", "✅ Stage 1 scores optimal (≤3%), skipping Stage 2");
    }
    
    const processingTime = Date.now() - startTime;
    
    // Increment usage
    const { data: usageData, error: usageError } = await supabaseClient
      .rpc("increment_usage_count", { p_user_id: userId, p_tier: userTier });
    
    let quotaInfo = {
      used: 0,
      limit: 30,
      remaining: 30,
      tier: userTier,
    };
    
    if (usageError) {
      log("ERROR", "Failed to increment usage", { error: usageError.message });
    } else if (usageData && usageData.length > 0) {
      const usage = usageData[0];
      quotaInfo = {
        used: usage.current_count,
        limit: usage.quota_limit,
        remaining: usage.remaining,
        tier: userTier,
      };
    }
    
    // Build response
    const responsePayload = {
      humanizedText: finalText,
      documentType: docType,
      qaMetrics: qaMetrics,
      detection: {
        stage1: {
          sapling: saplingResult1.score !== null
            ? { score: saplingResult1.score, sentenceScores: saplingResult1.sentenceScores }
            : { error: saplingResult1.error, score: null },
          zerogpt: zeroGPTResult1.score !== null
            ? { score: zeroGPTResult1.score, flaggedSentences: zeroGPTResult1.flaggedSentences }
            : { error: zeroGPTResult1.error, score: null },
        },
        stage2: needsStage2 ? {
          sapling: saplingResult2.score !== null
            ? { score: saplingResult2.score, sentenceScores: saplingResult2.sentenceScores }
            : { error: saplingResult2.error, score: null },
          zerogpt: zeroGPTResult2.score !== null
            ? { score: zeroGPTResult2.score, flaggedSentences: zeroGPTResult2.flaggedSentences }
            : { error: zeroGPTResult2.error, score: null },
          stage2Worse,
        } : null,
        errors: detectorErrors.length > 0 ? detectorErrors : null,
      },
      metadata: {
        processingTimeMs: processingTime,
        textLength: text.length,
        outputLength: finalText.length,
        stage2Applied: needsStage2 && !stage2Worse,
      },
      quota: quotaInfo,
    };
    
    log("INFO", "✨ Request complete", {
      processingTime: `${processingTime}ms`,
      docType,
      stage2Applied: needsStage2 && !stage2Worse,
      quotaRemaining: quotaInfo.remaining,
    });
    
    return new Response(
      JSON.stringify(responsePayload),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    log("ERROR", "❌ Request failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
        type: "internal_error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
