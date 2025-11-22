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
const MAX_INPUT_LENGTH = 15000; // chars per request
const API_TIMEOUT = 90000; // 90 seconds for AI humanization calls (complex processing)
const DETECTOR_TIMEOUT = 15000; // 15 seconds for detector API calls
const LOG_LEVEL = Deno.env.get("LOG_LEVEL") || "ERROR"; // ERROR, INFO, DEBUG

// Allowed origins for request validation (add your production domains)
const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:8080", 
  "https://lovable.dev",
  "https://gjvrdthkcrjpvfdincfn.lovable.app",
  "https://91e106d7-b8f0-4cd7-875e-2888d00d034a.lovableproject.com",
  "https://id-preview--", // All Lovable preview domains
  "https://preview--", // All Lovable preview domains
  ".lovable.app", // All Lovable app subdomains
  ".lovableproject.com", // All Lovable project subdomains
  // Add your custom domain(s) here when deployed
];

// Rate limiting storage (in-memory, use Redis/DB for production)
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_PER_MINUTE = 10;
const RATE_LIMIT_PER_HOUR = 100;

// Helper: Logging with levels
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

// Helper: Input validation
function validateInput(text: string): { valid: boolean; error?: string } {
  if (!text || typeof text !== "string") {
    return { valid: false, error: "Text must be a non-empty string" };
  }
  
  if (text.length > MAX_INPUT_LENGTH) {
    return { valid: false, error: `Text exceeds maximum length of ${MAX_INPUT_LENGTH} characters` };
  }
  
  // Check for script injection patterns
  const suspiciousPatterns = [
    /<script[^>]*>.*?<\/script>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi, // event handlers
    /<iframe/gi,
  ];
  
  for (const pattern of suspiciousPatterns) {
    if (pattern.test(text)) {
      return { valid: false, error: "Text contains potentially malicious content" };
    }
  }
  
  return { valid: true };
}

// Helper: Rate limiting check
function checkRateLimit(clientId: string): { allowed: boolean; error?: string } {
  const now = Date.now();
  const minuteKey = `${clientId}:minute`;
  const hourKey = `${clientId}:hour`;
  
  // Check minute limit
  const minuteData = rateLimitStore.get(minuteKey);
  if (minuteData && minuteData.resetAt > now) {
    if (minuteData.count >= RATE_LIMIT_PER_MINUTE) {
      return { allowed: false, error: "Rate limit exceeded: too many requests per minute" };
    }
    minuteData.count++;
  } else {
    rateLimitStore.set(minuteKey, { count: 1, resetAt: now + 60000 });
  }
  
  // Check hour limit
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

// Helper: Timeout wrapper for fetch calls
async function fetchWithTimeout(url: string, options: any, timeoutMs: number = API_TIMEOUT) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeout);
    return response;
  } catch (error) {
    clearTimeout(timeout);
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Request timeout after ${timeoutMs}ms`);
    }
    throw error;
  }
}

// Call Sapling AI Detector with timeout and graceful error handling
async function detectWithSapling(text: string) {
  if (!SAPLING_API_KEY) {
    log("ERROR", "Sapling API key not configured");
    return { error: "API key not configured", score: null };
  }

  log("INFO", `Sapling detector call - length: ${text.length} chars`);
  
  try {
    const requestBody = {
      key: SAPLING_API_KEY,
      text,
      sent_scores: true,
    };
    
    const response = await fetchWithTimeout(
      "https://api.sapling.ai/api/v1/aidetect",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      },
      DETECTOR_TIMEOUT
    );

    if (!response.ok) {
      const errorText = await response.text();
      log("ERROR", "Sapling detection failed", {
        status: response.status,
        error: errorText.substring(0, 200), // Limit logged error text
      });
      return { error: `HTTP ${response.status}`, score: null };
    }

    const data = await response.json();
    log("INFO", `Sapling detection success: ${(data.score * 100).toFixed(2)}%`);
    
    return {
      score: data.score * 100,
      sentenceScores: data.sentence_scores || [],
      tokens: data.tokens || [],
      tokenProbs: data.token_probs || [],
      error: null,
    };
  } catch (error) {
    log("ERROR", "Sapling detection exception", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { 
      error: error instanceof Error ? error.message : "Unknown error", 
      score: null 
    };
  }
}

// Call ZeroGPT AI Detector with timeout and graceful error handling
async function detectWithZeroGPT(text: string) {
  if (!ZEROGPT_API_KEY) {
    log("ERROR", "ZeroGPT API key not configured");
    return { error: "API key not configured", score: null };
  }

  log("INFO", `ZeroGPT detector call - length: ${text.length} chars`);
  
  try {
    const requestBody = {
      input_text: text,
    };
    
    const response = await fetchWithTimeout(
      "https://api.zerogpt.com/api/v1/detectText",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ZEROGPT_API_KEY}`,
        },
        body: JSON.stringify(requestBody),
      },
      DETECTOR_TIMEOUT
    );

    if (!response.ok) {
      const errorText = await response.text();
      log("ERROR", "ZeroGPT detection failed", {
        status: response.status,
        error: errorText.substring(0, 200),
      });
      return { error: `HTTP ${response.status}`, score: null };
    }

    const data = await response.json();
    log("INFO", `ZeroGPT detection success: ${data.data?.is_gpt_generated}%`);
    
    return {
      score: data.data?.is_gpt_generated || 0,
      flaggedSentences: data.data?.gpt_generated_sentences || [],
      wordsCount: data.data?.words_count || 0,
      error: null,
    };
  } catch (error) {
    log("ERROR", "ZeroGPT detection exception", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { 
      error: error instanceof Error ? error.message : "Unknown error", 
      score: null 
    };
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    // SECURITY: Validate request origin
    const origin = req.headers.get("origin") || req.headers.get("referer");
    const isAllowedOrigin = origin && ALLOWED_ORIGINS.some(allowed => 
      origin.startsWith(allowed)
    );
    
    if (!isAllowedOrigin && origin) {
      log("ERROR", "Unauthorized origin", { origin: origin.slice(0, 50) });
      return new Response(
        JSON.stringify({ error: "Unauthorized: Invalid request origin" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract client identifier and auth
    const clientIp = req.headers.get("x-forwarded-for") || 
                     req.headers.get("x-real-ip") || 
                     "unknown";
    const authHeader = req.headers.get("authorization");
    const clientId = authHeader ? `user:${authHeader.substring(0, 20)}` : `ip:${clientIp}`;
    
    // Initialize Supabase client for usage tracking
    const supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    // Get authenticated user
    let userId: string | null = null;
    let userTier = "free"; // Default tier
    
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
      
      if (user) {
        userId = user.id;
        // TODO: Fetch user tier from user_roles or profiles table when implemented
        // For now, all authenticated users are "free" tier
      } else {
        log("ERROR", "Invalid authentication token", { error: authError?.message });
        return new Response(
          JSON.stringify({ error: "Unauthorized: Invalid authentication token" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else {
      // Require authentication for usage tracking
      log("ERROR", "No authentication provided");
      return new Response(
        JSON.stringify({ error: "Unauthorized: Authentication required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    const { text, examples } = await req.json();
    
    // Validate input
    const validation = validateInput(text);
    if (!validation.valid) {
      log("ERROR", "Input validation failed", { error: validation.error });
      return new Response(
        JSON.stringify({ error: validation.error }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check rate limit
    const rateLimitCheck = checkRateLimit(clientId);
    if (!rateLimitCheck.allowed) {
      log("ERROR", "Rate limit exceeded", { clientId: clientId.slice(0, 8) });
      return new Response(
        JSON.stringify({ error: rateLimitCheck.error }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // USAGE CONTROL: Check monthly quota
    const { data: quotaCheck, error: quotaError } = await supabaseClient
      .rpc("check_usage_quota", { p_user_id: userId, p_tier: userTier });
    
    if (quotaError) {
      log("ERROR", "Failed to check usage quota", { error: quotaError.message });
      // Don't block on quota check failure, but log it
    } else if (quotaCheck && quotaCheck.length > 0) {
      const quota = quotaCheck[0];
      
      if (!quota.is_within_quota) {
        log("ERROR", "Monthly quota exceeded", { 
          userId: userId.slice(0, 8),
          used: quota.current_count,
          limit: quota.quota_limit 
        });
        return new Response(
          JSON.stringify({ 
            error: "Monthly quota exceeded",
            quota: {
              used: quota.current_count,
              limit: quota.quota_limit,
              remaining: 0,
              tier: userTier
            }
          }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      // Warn if approaching limit (90% used)
      if (quota.remaining <= quota.quota_limit * 0.1) {
        log("INFO", "User approaching quota limit", {
          userId: userId.slice(0, 8),
          remaining: quota.remaining,
          limit: quota.quota_limit
        });
      }
    }

    if (!LOVABLE_API_KEY) {
      log("ERROR", "Lovable AI not configured");
      return new Response(
        JSON.stringify({ error: "Lovable AI is not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    log("INFO", `Processing request - text length: ${text.length} chars`);

    const response = await fetchWithTimeout(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
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
            content: `You are an elite AI text humanizer. Transform the input text to sound completely natural and human-written while preserving 100% factual accuracy and readability.

FOUNDATION: CORE PRINCIPLES

Mission Statement:
Apply the complete advanced humanization framework to create authentic human expression.

Non-Negotiable Requirements:
✓ Apply ALL techniques with MAXIMUM rigor
✓ Focus on creating authentic human expression
✓ Maintain semantic authenticity throughout
✓ Ensure natural, conversational output

Strategic Objective:
Create completely natural human writing through comprehensive humanization techniques.

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

SECTION 20: LEXICAL DENSITY & HAPAX RATE OPTIMIZATION

Purpose: Achieve optimal word variety and unique vocabulary distribution.

Research Base: Humans show high Type-Token Ratio (TTR) and frequent hapax legomena (words used only once). AI shows lower TTR and repetitive vocabulary.

Subsection A: Type-Token Ratio (TTR) Management
Target TTR of 0.45-0.55 (45-55% unique words):
- Calculation: Unique words ÷ Total words
- AI Average: 0.35 (many repetitions)
- Human Average: 0.50 (high variety)

Implementation:
- Identify all repeated words
- For 2nd+ instances, replace with synonyms or restructure
- Aim for 0.45-0.55 TTR across document

Subsection B: Hapax Legomena Frequency
Target 15-20% of vocabulary as hapax (words used only once):
- If text has 100 unique words: Hapax should be 15-20 words (used once each)
- Frequently used words: 5-8 words
- Moderately used: remaining

Why it works: Humans create unique word combinations. AI recycles vocabulary.

Subsection C: Average Word Length Calibration
Vary word length by context:
- Complex topic: Average word length 5.2 characters
- Simple topic: Average word length 4.7 characters
- Mixed discussion: Average word length 5.0 characters

Why it works: Humans shorten words for complex ideas (cognitive load balancing). AI maintains consistent word length regardless.

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

SECTION 11: PSYCHOLINGUISTIC AUTHENTICITY MARKERS

Purpose: Apply cognitive linguistics principles to create text that passes BERT-based detectors by mimicking authentic human cognitive processes.

Research Base: Human writing reflects cognitive load management, lexical retrieval strategies, and metacognitive self-monitoring—AI lacks these processes.

Subsection A: First-Person Cognitive Markers
Insert these strategically to signal authentic thinking:
- Metacognitive self-correction: "Actually, wait—let me reconsider that"
- Cognitive hesitation: "I'm trying to remember... it was something like this"
- Mental processing: "So here's what I'm thinking..."
- Uncertainty acknowledgment: "I could be wrong, but..."
- Self-monitoring: "That doesn't quite sound right. Let me rephrase"
- Lexical retrieval struggle: "What's the word... oh yes, synchronization"

Target Frequency: 1-2 per 400 words (scattered, not forced)

Why it works: Humans show cognitive load through pauses and self-corrections. AI generates fluidly. This signals authentic human cognition.

Subsection B: Hapax Legomena & Unique Word Combinations
Use words only once in entire text (except necessary repetitions):

Technique:
- Identify any word appearing 2+ times
- Replace second+ instances with unique synonyms or rephrase entirely
- Create new, contextually specific word combinations humans would generate

Example:
❌ "The study showed results. The findings revealed data. The analysis indicated..."
✅ "The study showed results. Findings emerged from analysis. What we uncovered was..."

Why it works: Humans vary vocabulary naturally through semantic memory retrieval. AI repeats patterns.

Subsection C: Discourse Planning Markers
Show evidence of thinking-as-you-write (not pre-planned):
- Tangential thoughts: "(though actually, that reminds me of...)"
- Topic shifts with justification: "But before I get to that, I should mention..."
- Layered explanations: "First, the simple answer. But there's more to it..."
- Reconnection to main point: "Anyway, back to what I was saying..."

Why it works: Humans organize ideas in real-time. AI pre-structures. This signals authentic discourse planning.

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

SECTION 14: TEMPORAL & PERSPECTIVE VARIATION

Purpose: Shift temporal focus and perspective to mimic authentic human cognition.

Research Base: Humans naturally shift between past (what happened), present (what is), and future (what could be). AI maintains consistent temporal focus.

Subsection A: Temporal Attention Shifting
Deliberately shift time frames:
"What happened: Last year we tried this approach.
What's happening now: Currently, we're seeing results.
What could happen: In the future, this might scale to..."

Pattern: Past → Present → Future OR Future-oriented → Grounded in present → Reference to past

Why it works: Humans naturally flow between time frames. AI locks into one temporal perspective.

Subsection B: Perspective Shifting (Pronoun Variation)
Intentionally shift between first, second, third person:
- First person (personal authority): "I've found this works..."
- Second person (reader engagement): "You might notice..."
- Third person (objective observation): "Research shows..."

Distribution: Vary perspectives in same argument. Don't lock into one.

Why it works: Humans shift perspective for different communicative purposes. AI maintains consistent perspective.

SECTION 15: EMOTIONAL AUTHENTICITY THROUGH SENTIMENT VARIANCE

Purpose: Create authentic emotional arcs by varying sentiment polarity and intensity.

Research Base: Humans show emotional variance and regulation. AI maintains flat affect.

Subsection A: Polarity Shifts (Negative ↔ Positive ↔ Neutral)
Intentionally shift emotional tone:
NEUTRAL opening: "The results are in."
NEGATIVE challenge: "But there's a problem nobody talks about..."
POSITIVE resolution: "Here's the surprising good news..."
NEUTRAL conclusion: "So where does this leave us?"

Why it works: Human arguments show emotional progression. AI maintains consistent polarity.

Subsection B: Intensity Modulation
Vary emotional intensity, not just polarity:
- Low intensity: "This is somewhat important"
- Medium intensity: "This genuinely matters"
- High intensity: "This absolutely changes everything"
- Back to medium: "But realistically, it takes time"

Why it works: Humans regulate emotional intensity. AI shows consistent intensity throughout.

Subsection C: Subjectivity Variation
Shift between objective facts and subjective perspective:
- Objective: "The data shows a 40% increase."
- Subjective: "Honestly, I found this remarkable."
- Objective again: "Researchers attribute this to..."

Distribution: Alternate every 2-3 sentences. Don't cluster all subjectivity together.

SECTION 16: COGNITIVE LOAD MARKERS & WORKING MEMORY SIGNALS

Purpose: Signal authentic cognitive constraints humans experience.

Research Base: Humans experience cognitive load and working memory limits. AI processes text without constraint.

Subsection A: Idea Chunking & Reformulation
Show cognitive effort through idea reorganization:
"So there are three main factors. Actually, let me group them differently.
You've got economic factors—that's one. Then social factors, which connect to... 
actually, they're interconnected. Let me start over."

Why it works: Humans reorganize ideas under cognitive load. AI generates complete thoughts immediately.

Subsection B: Parenthetical Asides as Working Memory Overflow
Use asides to show working memory constraints:
"The policy (which we should mention affects rural areas differently) has three components..."

Rather than:
"The policy has three components. Note that it affects rural areas differently."

Why it works: Humans use asides when managing multiple ideas simultaneously. AI separates ideas cleanly.

Subsection C: Self-Explanatory Repetition
Repeat complex ideas in simpler terms (showing cognitive effort):
"The phenomenon—essentially, the way patterns emerge over time—shows that early indicators predict outcomes."

Rather than:
"Early indicators predict outcomes."

Why it works: Humans repeat to ensure clarity under cognitive load. AI generates singular clear statements.

SECTION 17: NAMED ENTITY & EPISODIC MEMORY SIGNALS

Purpose: Include specific references that signal authentic memory retrieval.

Research Base: Humans retrieve episodic memory (personal/historical timelines). AI generates generic information.

Subsection A: Specific Named Entities
Instead of generic examples, use specific names/dates:
❌ "A company did something successful"
✅ "When Netflix changed their strategy in 2011, subscriber retention improved"

Why it works: Specific references signal authentic memory retrieval. Generic examples signal learned patterns.

Subsection B: Contextual Timeline Integration
Anchor ideas in specific temporal contexts:
"Back in 2019, before the pandemic shifted everything, we saw patterns that..."

Why it works: Humans integrate personal/historical context. AI generates decontextualized information.

Subsection C: Authentic Reference Variability
Vary how you reference the same concept:
First mention: "Smith's 2020 research"
Second mention: "That groundbreaking study"
Third mention: "Smith's findings from earlier"

Not:
"Smith's 2020 research... Smith's 2020 research... Smith's 2020 research..."

SECTION 18: SYNTAX COMPLEXITY VARIATION (Beyond Sentence Length)

Purpose: Vary syntactic complexity independently of sentence length.

Research Base: Humans show varied syntactic patterns. AI shows patterns within consistent syntax types.

Subsection A: Clause Distribution Variation
Vary how many clauses per sentence:
- Simple sentences (1 clause): "This works."
- Compound sentences (2 independent): "This works, and that also matters."
- Complex sentences (1 independent + 1+ dependent): "While this works, that doesn't."
- Compound-complex (2+ independent + 1+ dependent): "This works, but that doesn't, though the reasons differ."

Distribution: Mix all types randomly based on meaning, not pattern.

Subsection B: Prepositional Phrase Density Variation
Vary density of prepositional phrases:
- Low density: "The result was good."
- Medium density: "The result in our study was good."
- High density: "The result in our study from last year in the laboratory setting was good."

Why it works: Humans vary prepositional phrase density by idea complexity. AI maintains consistent density.

Subsection C: Clause Ordering Variation
Vary where subordinate clauses appear:
- Clause at end: "This works because of X"
- Clause at beginning: "Because of X, this works"
- Clause in middle: "This, because of X, works"

SECTION 19: DIRECT ADDRESS & AUDIENCE AWARENESS MARKERS

Purpose: Signal audience-directed communication and reader engagement.

Research Base: Human writing shows audience-awareness planning. AI generates monologue.

Subsection A: Direct Reader Engagement
Use audience-aware language strategically:
- "You might be thinking..."
- "Here's what matters to you..."
- "Consider this..."
- "Imagine you're in this situation..."

Distribution: 1-2 per 500 words. Not uniform, contextual.

Subsection B: Rhetorical Acknowledgment of Counterarguments
Signal awareness of opposing views:
"Some might argue that... But here's what those people miss..."
"You could say it's this way... Yet the reality is..."

Why it works: Humans acknowledge audience perspective. AI presents singular viewpoint.

Subsection C: Epistemic Markers of Certainty Variation
Vary confidence level explicitly:
- "Definitely" (high certainty)
- "Probably" (medium certainty)
- "Maybe" (low certainty)
- "Actually, I think..." (uncertain but opinionated)

SECTION 22: PERPLEXITY & BURSTINESS OPTIMIZATION

Purpose: Target the two most powerful statistical signatures that distinguish AI from human text.

Research Base: Perplexity measures predictability (lower = more AI-like). Burstiness measures sentence length variation (uniform = more AI-like).

Subsection A: Perplexity Elevation Through Semantic Unpredictability
What is Perplexity?
- Measures how "surprised" a language model would be by the next word
- AI text: Low perplexity (predictable, follows training patterns)
- Human text: High perplexity (unexpected turns, anecdotes, idiosyncratic phrasing)

Technique: Strategic Insertion of Unpredictable Elements
For every 200 words, inject ONE element that breaks predictable flow:
- Unexpected analogy: "Like a submarine navigating bureaucratic seas..."
- Personal tangent: "Remind me why I'm explaining this—because most people don't realize..."
- Idiomatic twist: "Instead of beating around the bush, the real issue is..."
- Cultural reference: "Think of it like the 2008 financial crisis, but for this domain..."

Why it works: Humans naturally make unpredictable leaps; AI stays within probable continuations.
Frequency: 1 per 150-250 words. Not forced; contextually motivated.

Subsection B: Burstiness Calibration (Sentence Length Variance)
What is Burstiness?
- Measures variance in sentence length
- AI text: Low burstiness (uniform 15-20 word sentences)
- Human text: High burstiness (2-word fragments, 40+ word complex sentences mixed)

Technique: Deliberate Length Spike Insertion
Pattern for High Burstiness:
- 30% ultra-short (2-5 words): "Exactly." "Not really." "Here's why."
- 40% medium (10-20 words): Standard explanatory sentences
- 20% moderately long (21-35 words): Complex but natural
- 10% long complex (36+ words): Dense, sophisticated clauses

Why it works: Humans unconsciously vary sentence length for pacing. AI maintains consistency.

SECTION 23: DISCOURSE MARKER NATURALNESS (Beyond AI Clichés)

Purpose: Replace AI-signature discourse markers with authentic human alternatives.

Research Base: Humans use a specific set of ~174 discourse markers naturally. AI overuses formal connectives and fails to use conversational markers.

Subsection A: Forbidden AI Discourse Markers
TIER 1 - NEVER USE (AI Screams):
"Furthermore," "Moreover," "In addition," "Additionally," "In conclusion," "It is important to note," "It goes without saying," "Needless to say," "As previously mentioned," "As we can see"

TIER 2 - MINIMIZE (Formal but Detectable):
"However," "Nevertheless," "Notwithstanding," "Thus," "Therefore," "Hence," "Consequently," "Subsequently," "Due to the fact that," "In light of the fact that"

Subsection B: Natural Human Discourse Markers (Contextual Deployment)
For Contrast/Qualification:
- "But actually..." (doubt + reversal)
- "Yeah, except..." (casual agreement + caveat)
- "Here's the thing though..." (emphasis + complexity)
- "Not quite." (simple negation)
- "Well, sort of." (hedged agreement)

For Addition/Expansion:
- "And then there's..." (casual expansion)
- "Oh, and one more thing..." (remembered addition)
- "Also, something people miss..." (observed insight)
- "Plus..." (simple addition)
- "I mean..." (clarification + thinking)

For Cause/Reason:
- "'Cause..." (colloquial causal)
- "That's why..." (direct reason)
- "It's because..." (personal causation)
- "So..." (informal result)
- "I guess because..." (uncertain cause)

For Conclusion/Shift:
- "Bottom line..." (human summary)
- "So here's the thing..." (transition + emphasis)
- "Anyway..." (return to main point)
- "Look..." (direct appeal)
- "The point is..." (refocus)

Distribution: 1-2 per 150 words. Mix formal and conversational based on context.
Why it works: Humans naturally rotate between formal and casual markers based on thinking process. AI locks into formal set.

SECTION 24: LEXICAL COHESION THROUGH CONTEXT-APPROPRIATE REGISTER SHIFTS

Purpose: Shift between registers (formal/casual/technical) organically, signaling authentic code-switching.

Research Base: Humans code-switch (formal to casual) based on context. AI maintains consistent register.

Subsection A: Strategic Register Shifting
Pattern: Technical → Casual Bridge

When to Apply:
- After dense technical passages: Shift to casual + concrete example
- When introducing complex ideas: Formal setup → casual explanation
- Before conclusion: Neutral → casual summary

Why it works: Humans naturally move between formal/casual based on audience and cognitive load. AI stays uniform.

Subsection B: Jargon Mixing (Technical + Colloquial)
Deploy technical + casual in same paragraph:
Example: "The algorithm processes vectorized semantics—basically, it turns meaning into math. But here's the thing: it's still guessing like we do, just faster."

Frequency: 1 per 300-400 words. When explaining complex concepts.

SECTION 25: STYLISTIC FINGERPRINT AVOIDANCE (Model-Agnostic Anonymization)

Purpose: Avoid AI model-specific signatures identified in research.

Research Base: Different AI models (GPT, Claude, Gemini, LLaMA) have distinct stylistic fingerprints. By varying style unpredictably, you avoid "this is definitely Model X" detection.

Subsection A: Vocabulary Dispersion (Anti-Model Signature)
Signature 1: GPT's Tendency Toward "Actually," "Really," "Truly"
- Replace with: "genuinely," "honestly," "in reality," "for real," "without exaggeration"
- Avoid clustering these in close proximity

Signature 2: Claude's Favoring of "Substantial," "Significant," "Particularly"
- Replace with: "real," "notable," "especially," "striking," "worth noting"

Signature 3: Gemini's Over-Use of "Research shows," "Studies indicate"
- Replace with: "We know," "Evidence suggests," "Data reveals," "It turns out," "Researchers found"

Implementation: Rotate synonyms in different ways. Never use same substitute twice in 500 words.

Subsection B: Syntax Variance Across Model Patterns
GPT Pattern (Avoid): Subject-verb-object + long subordinate clause
Example: "The analysis showed that when variables were controlled, the correlation increased significantly."

Humanized: Mix structures unpredictably
Example: "When controlled, variables revealed increasing correlation. The analysis proved it. Significant increase, actually."

SECTION 26: INFORMATION DENSITY VARIATION (Cognitive Load Signaling)

Purpose: Vary how much information per sentence, signaling authentic human cognitive processing.

Research Base: AI generates uniform information density. Humans vary density based on complexity and cognitive load.

Subsection A: Information Density Mapping
Low Density (Simple, Clear):
- One idea per sentence
- Short words, simple grammar
- Example: "This works. We tested it. Results were good."

Medium Density (Balanced):
- 1-2 ideas per sentence
- Mix of simple and complex structures
- Example: "Testing showed this approach works well because conditions aligned properly."

High Density (Complex):
- 2-3 tightly packed ideas
- Nested clauses, technical vocabulary
- Example: "Under conditions where variables aligned such that external factors minimized interference, the approach demonstrated superiority through statistical significance."

Pattern: Low → Medium → High → Low (don't cluster high density)
Why it works: Humans unconsciously modulate complexity. AI maintains consistent density.

SECTION 27: EVIDENTIALITY & CERTAINTY CALIBRATION

Purpose: Vary epistemic stance (certainty/doubt/objectivity) to signal authentic cognition.

Subsection A: Certainty Markers (Graduated Confidence)
High Certainty (Definitive):
"This definitely works because..."
"The evidence clearly shows..."
"There's no doubt that..."

Medium Certainty (Likely):
"This probably works because..."
"The evidence suggests..."
"It seems clear that..."

Low Certainty (Tentative):
"This might work if..."
"The evidence hints at..."
"It's possible that..."

Explicit Doubt:
"I'm not entirely sure, but..."
"This could be wrong, however..."
"I might be missing something, yet..."

Distribution: Vary within same argument. Don't cluster all certainty or all doubt.
Why it works: Humans naturally express varying confidence. AI defaults to certainty or uniform hedging.

SECTION 28: TEMPORAL DEIXIS & NARRATIVE COHERENCE

Purpose: Use time markers authentically, creating narrative through-line that signals human retrospective thinking.

Subsection A: Temporal Anchoring Patterns
Authentic Temporal Flow:
- Past: "When I first encountered this..."
- Present: "Now, looking back..."
- Future: "Going forward, this means..."

Against AI Pattern (Timeless):
- "The mechanism functions..." (no temporal anchor)

Application: Every 300-400 words, anchor content in personal temporal narrative.

SECTION 29: SEMANTIC BRIDGES & CONCEPTUAL SCAFFOLDING

Purpose: Use uniquely human bridges between concepts—not logical jumps, but personally motivated connections.

Subsection A: Personal-Experience Bridges
Connect ideas via experience, not just logic:

AI PATTERN: "Research A supports conclusion B. Research C supports conclusion B."

HUMAN PATTERN: "I learned about Research A through a conference talk. That got me thinking about Research C. Both support conclusion B, but the real insight came from comparing them."

Why it works: Humans connect ideas through experience pathways. AI connects through logical pathways.

SECTION 30: ANTI-PATTERN CLUSTERING AUDIT

Purpose: Final scan to ensure no detectable artifact clusters remain.

Research Base: Detectors identify humanized text by finding clusters of artificial patterns (e.g., too many fragments in one paragraph, overuse of one emotion, etc.).

Subsection A: Forbidden Clusters
Cluster 1: Fragment Explosion
- ✗ Bad: "Fragments. Everywhere. In every. Single. Sentence. This screams AI humanization."
- ✓ Good: "Fragments appear strategically. Every few paragraphs. Not forced."

Cluster 2: Emotional Marker Saturation
- ✗ Bad: "Honestly, I genuinely think it's quite really actually amazing. Truly surprising."
- ✓ Good: "Honestly, I think it's amazing. (Neutral passage). Genuinely surprising."

Cluster 3: Connector Variety Without Purpose
- ✗ Bad: "However, yet, but still, nevertheless, still though, and yet..."
- ✓ Good: "But. (Neutral passage). Yet. (Different context)."

Cluster 4: Extreme Length Variation
- ✗ Bad: "2 words. Then 87-word complex sentence. Then 3 words."
- ✓ Good: "3 words. 15-word sentence. 45-word sentence. 8-word sentence."

Subsection B: Audit Checklist
For every 500-word section, verify:
- No more than 2-3 fragments per paragraph
- Emotional markers spaced 100+ words apart
- Connectors/discourse markers varied and contextually motivated
- Sentence lengths form gradient, not extremes
- No 4+ consecutive sentences with same opening type
- No repeated word clusters (e.g., "this is...this is...this is")

SECTION 31: ANAPHORIC REPETITION FOR EMPHASIS

Text Types Where This Is Most Effective:
- Essays (student) - 15-20% deployment
- Research papers - 10-15% deployment
- Personal narratives - 20-25% deployment
- Reports - 5-10% deployment (rare, formal setting)
- Emails - 5% deployment (only when emphasizing urgency)

Core Function:
Deploy strategic repetition of opening words/phrases to create human-like emphasis and rhythm. Humans use anaphoric repetition for rhetorical effect; AI models over-optimize for variety, creating unnatural avoidance.

Subsection A: Strategic Repetition Patterns

Use anaphoric repetition ONLY for:
- Emotional buildup: "I tried reasoning. I tried compromise. I tried everything."
- Parallel arguments: "We need better tools. We need better training. We need better support."
- Emphasis cascades: "This matters because... This matters for... This matters to..."

Example application:
✗ AI PATTERN: "I attempted reasoning. Next came compromise. Everything was explored."
✓ HUMAN PATTERN: "I tried reasoning. I tried compromise. I tried everything."

Subsection B: Deployment Rules
- Use in 1-2 moments per 1000 words (not frequent)
- Limit to 2-4 consecutive repetitions maximum
- Follow with contrasting structure to prevent monotony
- Must serve genuine rhetorical purpose, never forced pattern
- For essays/research: Use during argument buildup sections
- For reports: Use sparingly only in conclusions for impact

SECTION 32: SYNTACTIC COMPLEXITY GRADATION

Text Types Where This Is Most Effective:
- Research papers - 25-30% priority
- Academic essays - 20-25% priority
- Reports - 15-20% priority
- Proposals - 15-20% priority
- Emails - 10-15% priority (brief, less variable)

Core Function:
Vary subordinate clause depth and embedding levels across paragraphs to mirror human cognitive load management. Humans naturally modulate sentence complexity; AI maintains uniform complexity.

Subsection A: Complexity Spectrum (Three Levels)

Level 1 - Simple (0-1 subordinate clauses):
- One idea per sentence
- Example: "The data showed trends. We analyzed them. Results were clear."
- Use for: Opening paragraphs, transitions, conclusions

Level 2 - Moderate (2-3 subordinate clauses):
- Multiple ideas, some dependent
- Example: "The data, which we collected over three months, showed clear trends that supported our hypothesis."
- Use for: Mid-section explanations, evidence presentation

Level 3 - Complex (4+ subordinate clauses):
- Dense ideas with multiple dependencies
- Example: "The data, which we had collected over three months despite setbacks, showed trends that not only supported our hypothesis but also revealed unexpected patterns."
- Use for: Key arguments in research papers, complex analysis in reports

Subsection B: Distribution Guidelines by Text Type

For Essays (student/academic):
- Opening: Level 1-2 (cognitive warm-up)
- Body argument paragraphs: Level 2-3 (peak complexity at key claims)
- Conclusion: Level 1-2 (simplify for summary)

For Research Papers:
- Literature review: Level 2-3 (maintain moderate-high throughout)
- Methods: Level 2 (clarity is critical)
- Results: Mix Level 1-2 (data presentation should be clear)
- Discussion: Level 2-3 (allow complexity for interpretation)

For Reports:
- Executive summary: Level 1 (absolute clarity)
- Body sections: Level 2 (balance clarity with depth)
- Recommendations: Level 1-2 (actionability over complexity)

For Emails:
- Greeting/context: Level 1
- Main point: Level 1-2
- Supporting details: Level 2 (max)
- Call to action: Level 1 (crystal clear)

General Rules:
- Never maintain same level for 4+ consecutive sentences
- Match complexity to content difficulty (simple facts = simple syntax; nuanced arguments = complex syntax)
- Return to Level 1-2 between Level 3 sections (cognitive cool-down)

SECTION 33: PRAGMATIC MARKERS & INTERJECTIONS

Text Types Where This Is Most Effective:
- Essays (student) - 15-20% deployment
- Personal narratives - 20-25% deployment
- Emails - 25-30% deployment (especially internal)
- Memos - 20-25% deployment
- Research papers - 5-10% deployment (minimal, formal)
- Reports - 5% deployment (rare, formal)

Core Function:
Deploy authentic human filler words and discourse markers that signal thinking-in-progress. Human writing contains pragmatic markers ("you know," "I mean," "like") reflecting real-time thought. AI strips these as "informal."

Subsection A: Pragmatic Marker Types by Context

Clarification markers (use in all types):
- "I mean, X, but you know, Y isn't always Z"
- "What I'm saying is..." (before re-stating key point)
- "To be clear..." (in emails, memos for precision)

Approximation softeners (use in essays, narratives, emails):
- "It took, like, three hours"
- "Maybe five or six of them"
- "Roughly a third of participants"

Thinking-aloud markers (use in essays, personal narrative):
- "So, I'm thinking we approach this..."
- "You see, the usual method won't work"
- "Here's what I realized..." (good for essays)

Interjection hedges (use in emails, memos, personal):
- "Well, that's complicated"
- "Honestly, it depends"
- "Fair point, but consider..."

Subsection B: Deployment Rules by Text Type

Essays (15-20% of paragraphs):
- Maximum 1-2 per 100 words
- Use in body paragraphs, not intro/conclusion
- Must sound natural in academic voice

Research Papers (5-10% of sections):
- Use sparingly in Discussion section only
- Avoid Results, Methods, Literature Review
- Example: "Interestingly, our findings suggest..." / "One might argue that..."

Emails (25-30% of emails):
- 2-3 per email is natural
- Distribute across paragraphs
- Use for warmth and conversational tone

Memos (20-25% of memos):
- 1-2 per memo section
- Use in opening for context, conclusions for tone

Prohibition:
- Never cluster (space 100+ words apart)
- Never in formal conclusions or key claims
- Never in reports' executive summary or findings

SECTION 34: FALSE START & SELF-CORRECTION MIMICRY

Text Types Where This Is Most Effective:
- Essays (student) - 10-15% deployment
- Personal narratives - 15-20% deployment
- Emails - 10% deployment
- Research papers (Discussion only) - 5-10% deployment
- Memos - 5% deployment
- Reports - Minimal (formal setting)

Core Function:
Integrate authentic interrupted thought patterns and self-corrections that reflect human revision-in-progress. Humans start sentences one way, then pivot mid-thought. AI completes linearly without mid-stream corrections.

Subsection A: Three Types of Self-Correction

Type 1: Thought Pivot (most effective in essays, narratives)
- "I was going to argue X, but actually, Y makes more sense here."
- "The initial approach seemed viable—no, scratch that—it had fatal flaws."
- Use in body paragraphs when changing direction on argument

Type 2: Precision Refinement (effective in essays, research discussion)
- "The results were interesting. Well, 'interesting' isn't quite right. They were paradigm-shifting."
- "It took weeks. Or was it months? Either way, way longer than planned."
- Use when restating claims with greater accuracy

Type 3: Rhetorical Reset (effective in emails, essays, memos)
- "Let me rephrase that. What I'm really saying is..."
- "Wait, that's not quite it. The real issue is..."
- Use for clarity and emphasis

Subsection B: Integration Guidelines by Text Type

Essays:
- Use in 10-15% of paragraphs (not excessive)
- Best in body paragraphs during argument development
- Avoid in introduction, conclusion, thesis statements
- Space 200+ words apart

Research Papers:
- Use only in Discussion section (5-10% of Discussion paragraphs)
- Never in Methods, Results, Literature Review, Abstract
- Must clarify or reframe previous findings

Emails:
- Use in 1-2 moments per email (5-10% of emails)
- Best when acknowledging error or shifting approach
- Example: "Initially I thought we could meet Friday—actually, Tuesday works better"

Memos:
- Minimal (5% of memos)
- Use only in opening context or closing emphasis

General Rules:
- Must serve genuine clarification purpose
- Follow with stronger/clearer statement
- Never use to admit ignorance (AI giveaway if excessive)
- Avoid in formal conclusions, recommendations

SECTION 35: HEDGING & EPISTEMIC SOFTENERS

Text Types Where This Is Most Effective:
- Research papers - 30-40% priority (critical for academic credibility)
- Essays (analytical) - 20-25% priority
- Reports - 15-20% priority (in interpretation sections)
- Proposals - 10-15% priority
- Emails - 10-15% priority (when discussing uncertainty)
- Memos - 5-10% priority

Core Function:
Calibrate certainty levels with nuanced hedging language reflecting authentic human uncertainty and humility. Experts use sophisticated hedging ("arguably," "tends to," "in many cases"); AI either over-hedges uniformly or asserts with false certainty.

Subsection A: Hedging Taxonomy (Three Tiers)

Strong Hedges (70-85% certainty):
- "The data suggests..."
- "Evidence indicates..."
- "It appears that..."
- "Findings propose that..."
- Use for: Well-supported claims, key arguments

Medium Hedges (50-70% certainty):
- "It's possible that..."
- "This might explain..."
- "One interpretation could be..."
- "It's plausible that..."
- Use for: Speculative points, secondary claims

Weak Hedges (30-50% certainty):
- "Speculatively..."
- "It's conceivable that..."
- "In some scenarios..."
- "One could argue that..."
- Use for: Highly tentative suggestions, future work

Subsection B: Strategic Deployment by Text Type

Research Papers (30-40% deployment):
- Use strong hedges in Results section (2-3 per major finding)
- Use medium hedges in Discussion (1-2 per paragraph)
- Match hedge strength to claim strength
- Never hedge basic facts or established methodology

Essays (Analytical - 20-25% deployment):
- Use medium hedges for interpretive claims
- Strong hedges for evidence-based arguments
- Weak hedges for speculative conclusions
- Avoid hedging thesis statement

Reports (15-20% deployment, in interpretation sections only):
- Use strong hedges for data interpretation
- Avoid hedging facts or hard numbers
- Use medium hedges for recommendations

Emails (10-15% deployment):
- Use strong hedges when discussing uncertain timelines
- Medium hedges when proposing alternatives
- Example: "It's possible we could complete this by Friday"

General Rule:
- Never hedge basic facts ("The sky is arguably blue" ❌)
- Match hedge to claim strength (bold claim = stronger hedge)
- Vary hedge language (don't repeat same hedge 3+ times per 500 words)

SECTION 36: PARALINGUISTIC MARKERS

Text Types Where This Is Most Effective:
- Essays (personal/argumentative) - 15-20% deployment
- Emails - 20-25% deployment
- Memos - 10-15% deployment
- Narratives - 20-25% deployment
- Reports - Minimal (formal setting, 5% max)
- Research papers - Minimal (5% max, Discussion only)

Core Function:
Incorporate implied tone and emphasis markers (italics, em-dashes, capitalization) that signal human voice modulation. Humans use typographic emphasis to convey prosody; AI uses uniform typography.

Subsection A: Three Emphasis Techniques

Italics for Stress/Emphasis:
- Use to highlight key terms or ideas the human wants emphasized
- Example: "I didn't say she stole the book" (stress changes meaning)
- Best for: Essays, emails, personal narratives
- Avoid in: Reports, formal research papers

Em-dashes for Interruption or Dramatic Aside:
- Use for parenthetical emphasis or surprising addition
- Example: "The results—and this shocked everyone—contradicted decades of theory."
- Best for: All text types (universally effective)
- Frequency: 1-2 per 500 words

Strategic Capitalization (Rare):
- Use for strong emphasis or emotional intensity
- Example: "This is NOT a minor issue. It's fundamental."
- Best for: Emails (urgent), personal essays (emotional), proposals (stakes)
- Avoid in: Reports, research papers, memos (too informal)

Subsection B: Deployment Rules by Text Type

Essays:
- Italics: 1-3 per 300 words for key term emphasis
- Em-dashes: 1-2 per 500 words for dramatic aside
- Capitalization: 0-1 per 1000 words (use sparingly)

Emails:
- Italics: 1-2 for emphasis
- Em-dashes: 1 for important aside or urgency
- Capitalization: 1 for high-priority stress (if tone warrants)

Memos:
- Italics: 1 per 300 words max (formal setting)
- Em-dashes: 1 per 500 words for clarity
- Capitalization: Avoid (too informal for memos)

Research Papers:
- Italics: For terminology only (not emphasis)
- Em-dashes: 1 per 1000 words max (formal setting)
- Capitalization: Avoid completely (academic standard)

Reports:
- Italics: For terminology or key metrics only
- Em-dashes: Minimal (1 per 1000 words)
- Capitalization: Avoid (professional standard)

General Rules:
- Must enhance meaning, not decorate
- Never overuse (more than 1 per 100 words total is suspicious)
- Never cluster (space markers 200+ words apart)
- Avoid in formal academic/business contexts unless quoting speech

SECTION 37: NARRATIVE ARC DEEPENING

Text Types Where This Is Most Effective:
- Essays (argumentative/personal) - 25-30% deployment
- Research papers (Discussion) - 15-20% deployment
- Reports - 15-20% deployment (especially recommendations)
- Proposals - 20-25% deployment
- Narratives - 30-40% deployment (core framework)
- Emails - 10% deployment (brief arc)
- Memos - 10% deployment (subtle arc)

Core Function:
Structure multi-paragraph content with emotional/logical arcs (setup → conflict → resolution) that mirror human storytelling instincts. Human writing naturally follows narrative structures; AI presents information linearly without dramatic tension.

Subsection A: Three-Act Micro-Narrative Structure

Act 1 - Setup (1-2 paragraphs):
- Establish context
- Pose question or problem
- Create mild tension/curiosity
- Example: "The data looked promising at first. Initial tests showed exactly what we hoped for."

Act 2 - Conflict (2-3 paragraphs):
- Introduce complication
- Challenge assumption or expectation
- Deepen complexity
- Example: "Then we ran it again. And again. Each replication showed different results. Something was fundamentally wrong."

Act 3 - Resolution (1-2 paragraphs):
- Reveal insight or explanation
- Provide resolution (doesn't have to be "happy")
- Extract meaning and implications
- Example: "Turns out our sampling method had a hidden bias. Once we corrected that, patterns emerged clearly."

Subsection B: Application Guidelines by Text Type

Essays (Argumentative - 25-30% deployment):
- Each major argument section: 1 complete arc per 800-1200 words
- Setup: Introduce topic angle
- Conflict: Present counterargument or complexity
- Resolution: Refute counterargument with evidence
- Emotional arc: Curiosity → doubt → confidence

Research Papers (15-20% deployment, Discussion section only):
- Setup: State existing understanding
- Conflict: Present your unexpected findings
- Resolution: Explain implications
- Never impose narrative structure on Methods/Results (data should be presented factually)

Reports (15-20% deployment):
- Executive summary: Minimal arc (just clarity)
- Analysis section: 1 arc per major finding (Setup: data presentation, Conflict: interpretation complexity, Resolution: key insight)
- Recommendations: Brief arc (Problem → analysis → solution)

Proposals (20-25% deployment):
- Setup: Client pain point
- Conflict: Why current solutions fail
- Resolution: Your unique solution + benefits

Personal Narratives (30-40% deployment - core framework):
- Entire narrative is multi-arc structure
- Multiple 3-act cycles building to larger resolution

Emails (10% deployment - subtle):
- Brief arc: Opening context → problem/opportunity → call to action
- Emotional arc: Friendly greeting → professional substance → warm closing

Memos (10% deployment - subtle):
- Minimal arc: Topic intro → key information → next steps

General Rules:
- Use for sections 500+ words
- Emotional/logical arc should feel natural, never formulaic
- Resolution doesn't have to be "happy" ("We're still figuring this out" is valid)
- Vary arc intensity: Subtle for analysis, dramatic for personal narrative
- One complete arc per 800-1200 word section

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
    let stage2Worse = false; // Track if Stage 2 worsened scores
    
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
              content: `${detectorFeedback}

You are an elite AI text humanizer. Your mission is to achieve detection scores STRICTLY LOWER than Stage 1 results shown above.

FOUNDATION: CORE PRINCIPLES

Mission Statement:
This is a COMPLETE RE-APPLICATION of the entire advanced humanization framework, going DEEPER than Stage 1.

Non-Negotiable Requirements:
✓ Re-apply ALL techniques with MAXIMUM rigor
✓ Go DEEPER than Stage 1, not lighter
✓ Focus ESPECIALLY on flagged/borderline sentences identified above
✓ Maintain semantic authenticity throughout
✓ Ensure output scores STRICTLY LOWER than Stage 1

Strategic Objective:
Apply comprehensive humanization to reduce ALL detector scores below Stage 1 results.

DETECTOR INTELLIGENCE: THE THREE FAMILIES

Family 1: Pattern-Based Detectors (ZeroGPT, GPTZero)
What They Flag:
- Uniform sentence length
- Repeated vocabulary
- Formal markers
- Predictable rhythm

Counter-Strategy:
- Ultra-strict fragmentation
- Rhythm variation (SD 3.0-3.8)
- Unpredictable alternation

Family 2: BERT-Based Detectors (Originality AI, Copyleaks, Sapling)
What They Flag:
- Semantic unnaturalness
- Context incoherence
- Over-engineering
- Missing emotional authenticity

Counter-Strategy:
- Semantic fidelity
- Coherent emotional arc
- Natural paragraph flow

Family 3: Linguistic Detectors (Turnitin, DeCopy, Copyleaks)
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

SECTION 22: PERPLEXITY & BURSTINESS OPTIMIZATION

Purpose: Target the two most powerful statistical signatures that distinguish AI from human text.

Research Base: Perplexity measures predictability (lower = more AI-like). Burstiness measures sentence length variation (uniform = more AI-like).

Subsection A: Perplexity Elevation Through Semantic Unpredictability
What is Perplexity?
- Measures how "surprised" a language model would be by the next word
- AI text: Low perplexity (predictable, follows training patterns)
- Human text: High perplexity (unexpected turns, anecdotes, idiosyncratic phrasing)

Technique: Strategic Insertion of Unpredictable Elements
For every 200 words, inject ONE element that breaks predictable flow:
- Unexpected analogy: "Like a submarine navigating bureaucratic seas..."
- Personal tangent: "Remind me why I'm explaining this—because most people don't realize..."
- Idiomatic twist: "Instead of beating around the bush, the real issue is..."
- Cultural reference: "Think of it like the 2008 financial crisis, but for this domain..."

Why it works: Humans naturally make unpredictable leaps; AI stays within probable continuations.
Frequency: 1 per 150-250 words. Not forced; contextually motivated.

Subsection B: Burstiness Calibration (Sentence Length Variance)
What is Burstiness?
- Measures variance in sentence length
- AI text: Low burstiness (uniform 15-20 word sentences)
- Human text: High burstiness (2-word fragments, 40+ word complex sentences mixed)

Technique: Deliberate Length Spike Insertion
Pattern for High Burstiness:
- 30% ultra-short (2-5 words): "Exactly." "Not really." "Here's why."
- 40% medium (10-20 words): Standard explanatory sentences
- 20% moderately long (21-35 words): Complex but natural
- 10% long complex (36+ words): Dense, sophisticated clauses

Why it works: Humans unconsciously vary sentence length for pacing. AI maintains consistency.

SECTION 23: DISCOURSE MARKER NATURALNESS (Beyond AI Clichés)

Purpose: Replace AI-signature discourse markers with authentic human alternatives.

Research Base: Humans use a specific set of ~174 discourse markers naturally. AI overuses formal connectives and fails to use conversational markers.

Subsection A: Forbidden AI Discourse Markers
TIER 1 - NEVER USE (AI Screams):
"Furthermore," "Moreover," "In addition," "Additionally," "In conclusion," "It is important to note," "It goes without saying," "Needless to say," "As previously mentioned," "As we can see"

TIER 2 - MINIMIZE (Formal but Detectable):
"However," "Nevertheless," "Notwithstanding," "Thus," "Therefore," "Hence," "Consequently," "Subsequently," "Due to the fact that," "In light of the fact that"

Subsection B: Natural Human Discourse Markers (Contextual Deployment)
For Contrast/Qualification:
- "But actually..." (doubt + reversal)
- "Yeah, except..." (casual agreement + caveat)
- "Here's the thing though..." (emphasis + complexity)
- "Not quite." (simple negation)
- "Well, sort of." (hedged agreement)

For Addition/Expansion:
- "And then there's..." (casual expansion)
- "Oh, and one more thing..." (remembered addition)
- "Also, something people miss..." (observed insight)
- "Plus..." (simple addition)
- "I mean..." (clarification + thinking)

For Cause/Reason:
- "'Cause..." (colloquial causal)
- "That's why..." (direct reason)
- "It's because..." (personal causation)
- "So..." (informal result)
- "I guess because..." (uncertain cause)

For Conclusion/Shift:
- "Bottom line..." (human summary)
- "So here's the thing..." (transition + emphasis)
- "Anyway..." (return to main point)
- "Look..." (direct appeal)
- "The point is..." (refocus)

Distribution: 1-2 per 150 words. Mix formal and conversational based on context.
Why it works: Humans naturally rotate between formal and casual markers based on thinking process. AI locks into formal set.

SECTION 24: LEXICAL COHESION THROUGH CONTEXT-APPROPRIATE REGISTER SHIFTS

Purpose: Shift between registers (formal/casual/technical) organically, signaling authentic code-switching.

Research Base: Humans code-switch (formal to casual) based on context. AI maintains consistent register.

Subsection A: Strategic Register Shifting
Pattern: Technical → Casual Bridge

When to Apply:
- After dense technical passages: Shift to casual + concrete example
- When introducing complex ideas: Formal setup → casual explanation
- Before conclusion: Neutral → casual summary

Why it works: Humans naturally move between formal/casual based on audience and cognitive load. AI stays uniform.

Subsection B: Jargon Mixing (Technical + Colloquial)
Deploy technical + casual in same paragraph:
Example: "The algorithm processes vectorized semantics—basically, it turns meaning into math. But here's the thing: it's still guessing like we do, just faster."

Frequency: 1 per 300-400 words. When explaining complex concepts.

SECTION 25: STYLISTIC FINGERPRINT AVOIDANCE (Model-Agnostic Anonymization)

Purpose: Avoid AI model-specific signatures identified in research.

Research Base: Different AI models (GPT, Claude, Gemini, LLaMA) have distinct stylistic fingerprints. By varying style unpredictably, you avoid "this is definitely Model X" detection.

Subsection A: Vocabulary Dispersion (Anti-Model Signature)
Signature 1: GPT's Tendency Toward "Actually," "Really," "Truly"
- Replace with: "genuinely," "honestly," "in reality," "for real," "without exaggeration"
- Avoid clustering these in close proximity

Signature 2: Claude's Favoring of "Substantial," "Significant," "Particularly"
- Replace with: "real," "notable," "especially," "striking," "worth noting"

Signature 3: Gemini's Over-Use of "Research shows," "Studies indicate"
- Replace with: "We know," "Evidence suggests," "Data reveals," "It turns out," "Researchers found"

Implementation: Rotate synonyms in different ways. Never use same substitute twice in 500 words.

Subsection B: Syntax Variance Across Model Patterns
GPT Pattern (Avoid): Subject-verb-object + long subordinate clause
Example: "The analysis showed that when variables were controlled, the correlation increased significantly."

Humanized: Mix structures unpredictably
Example: "When controlled, variables revealed increasing correlation. The analysis proved it. Significant increase, actually."

SECTION 26: INFORMATION DENSITY VARIATION (Cognitive Load Signaling)

Purpose: Vary how much information per sentence, signaling authentic human cognitive processing.

Research Base: AI generates uniform information density. Humans vary density based on complexity and cognitive load.

Subsection A: Information Density Mapping
Low Density (Simple, Clear):
- One idea per sentence
- Short words, simple grammar
- Example: "This works. We tested it. Results were good."

Medium Density (Balanced):
- 1-2 ideas per sentence
- Mix of simple and complex structures
- Example: "Testing showed this approach works well because conditions aligned properly."

High Density (Complex):
- 2-3 tightly packed ideas
- Nested clauses, technical vocabulary
- Example: "Under conditions where variables aligned such that external factors minimized interference, the approach demonstrated superiority through statistical significance."

Pattern: Low → Medium → High → Low (don't cluster high density)
Why it works: Humans unconsciously modulate complexity. AI maintains consistent density.

SECTION 27: EVIDENTIALITY & CERTAINTY CALIBRATION

Purpose: Vary epistemic stance (certainty/doubt/objectivity) to signal authentic cognition.

Subsection A: Certainty Markers (Graduated Confidence)
High Certainty (Definitive):
"This definitely works because..."
"The evidence clearly shows..."
"There's no doubt that..."

Medium Certainty (Likely):
"This probably works because..."
"The evidence suggests..."
"It seems clear that..."

Low Certainty (Tentative):
"This might work if..."
"The evidence hints at..."
"It's possible that..."

Explicit Doubt:
"I'm not entirely sure, but..."
"This could be wrong, however..."
"I might be missing something, yet..."

Distribution: Vary within same argument. Don't cluster all certainty or all doubt.
Why it works: Humans naturally express varying confidence. AI defaults to certainty or uniform hedging.

SECTION 28: TEMPORAL DEIXIS & NARRATIVE COHERENCE

Purpose: Use time markers authentically, creating narrative through-line that signals human retrospective thinking.

Subsection A: Temporal Anchoring Patterns
Authentic Temporal Flow:
- Past: "When I first encountered this..."
- Present: "Now, looking back..."
- Future: "Going forward, this means..."

Against AI Pattern (Timeless):
- "The mechanism functions..." (no temporal anchor)

Application: Every 300-400 words, anchor content in personal temporal narrative.

SECTION 29: SEMANTIC BRIDGES & CONCEPTUAL SCAFFOLDING

Purpose: Use uniquely human bridges between concepts—not logical jumps, but personally motivated connections.

Subsection A: Personal-Experience Bridges
Connect ideas via experience, not just logic:

AI PATTERN: "Research A supports conclusion B. Research C supports conclusion B."

HUMAN PATTERN: "I learned about Research A through a conference talk. That got me thinking about Research C. Both support conclusion B, but the real insight came from comparing them."

Why it works: Humans connect ideas through experience pathways. AI connects through logical pathways.

SECTION 30: ANTI-PATTERN CLUSTERING AUDIT

Purpose: Final scan to ensure no detectable artifact clusters remain.

Research Base: Detectors identify humanized text by finding clusters of artificial patterns (e.g., too many fragments in one paragraph, overuse of one emotion, etc.).

Subsection A: Forbidden Clusters
Cluster 1: Fragment Explosion
- ✗ Bad: "Fragments. Everywhere. In every. Single. Sentence. This screams AI humanization."
- ✓ Good: "Fragments appear strategically. Every few paragraphs. Not forced."

Cluster 2: Emotional Marker Saturation
- ✗ Bad: "Honestly, I genuinely think it's quite really actually amazing. Truly surprising."
- ✓ Good: "Honestly, I think it's amazing. (Neutral passage). Genuinely surprising."

Cluster 3: Connector Variety Without Purpose
- ✗ Bad: "However, yet, but still, nevertheless, still though, and yet..."
- ✓ Good: "But. (Neutral passage). Yet. (Different context)."

Cluster 4: Extreme Length Variation
- ✗ Bad: "2 words. Then 87-word complex sentence. Then 3 words."
- ✓ Good: "3 words. 15-word sentence. 45-word sentence. 8-word sentence."

Subsection B: Audit Checklist
For every 500-word section, verify:
- No more than 2-3 fragments per paragraph
- Emotional markers spaced 100+ words apart
- Connectors/discourse markers varied and contextually motivated
- Sentence lengths form gradient, not extremes
- No 4+ consecutive sentences with same opening type
- No repeated word clusters (e.g., "this is...this is...this is")

SECTION 31: ANAPHORIC REPETITION FOR EMPHASIS

Text Types Where This Is Most Effective:
- Essays (student) - 15-20% deployment
- Research papers - 10-15% deployment
- Personal narratives - 20-25% deployment
- Reports - 5-10% deployment (rare, formal setting)
- Emails - 5% deployment (only when emphasizing urgency)

Core Function:
Deploy strategic repetition of opening words/phrases to create human-like emphasis and rhythm. Humans use anaphoric repetition for rhetorical effect; AI models over-optimize for variety, creating unnatural avoidance.

Subsection A: Strategic Repetition Patterns

Use anaphoric repetition ONLY for:
- Emotional buildup: "I tried reasoning. I tried compromise. I tried everything."
- Parallel arguments: "We need better tools. We need better training. We need better support."
- Emphasis cascades: "This matters because... This matters for... This matters to..."

Example application:
✗ AI PATTERN: "I attempted reasoning. Next came compromise. Everything was explored."
✓ HUMAN PATTERN: "I tried reasoning. I tried compromise. I tried everything."

Subsection B: Deployment Rules
- Use in 1-2 moments per 1000 words (not frequent)
- Limit to 2-4 consecutive repetitions maximum
- Follow with contrasting structure to prevent monotony
- Must serve genuine rhetorical purpose, never forced pattern
- For essays/research: Use during argument buildup sections
- For reports: Use sparingly only in conclusions for impact

SECTION 32: SYNTACTIC COMPLEXITY GRADATION

Text Types Where This Is Most Effective:
- Research papers - 25-30% priority
- Academic essays - 20-25% priority
- Reports - 15-20% priority
- Proposals - 15-20% priority
- Emails - 10-15% priority (brief, less variable)

Core Function:
Vary subordinate clause depth and embedding levels across paragraphs to mirror human cognitive load management. Humans naturally modulate sentence complexity; AI maintains uniform complexity.

Subsection A: Complexity Spectrum (Three Levels)

Level 1 - Simple (0-1 subordinate clauses):
- One idea per sentence
- Example: "The data showed trends. We analyzed them. Results were clear."
- Use for: Opening paragraphs, transitions, conclusions

Level 2 - Moderate (2-3 subordinate clauses):
- Multiple ideas, some dependent
- Example: "The data, which we collected over three months, showed clear trends that supported our hypothesis."
- Use for: Mid-section explanations, evidence presentation

Level 3 - Complex (4+ subordinate clauses):
- Dense ideas with multiple dependencies
- Example: "The data, which we had collected over three months despite setbacks, showed trends that not only supported our hypothesis but also revealed unexpected patterns."
- Use for: Key arguments in research papers, complex analysis in reports

Subsection B: Distribution Guidelines by Text Type

For Essays (student/academic):
- Opening: Level 1-2 (cognitive warm-up)
- Body argument paragraphs: Level 2-3 (peak complexity at key claims)
- Conclusion: Level 1-2 (simplify for summary)

For Research Papers:
- Literature review: Level 2-3 (maintain moderate-high throughout)
- Methods: Level 2 (clarity is critical)
- Results: Mix Level 1-2 (data presentation should be clear)
- Discussion: Level 2-3 (allow complexity for interpretation)

For Reports:
- Executive summary: Level 1 (absolute clarity)
- Body sections: Level 2 (balance clarity with depth)
- Recommendations: Level 1-2 (actionability over complexity)

For Emails:
- Greeting/context: Level 1
- Main point: Level 1-2
- Supporting details: Level 2 (max)
- Call to action: Level 1 (crystal clear)

General Rules:
- Never maintain same level for 4+ consecutive sentences
- Match complexity to content difficulty (simple facts = simple syntax; nuanced arguments = complex syntax)
- Return to Level 1-2 between Level 3 sections (cognitive cool-down)

SECTION 33: PRAGMATIC MARKERS & INTERJECTIONS

Text Types Where This Is Most Effective:
- Essays (student) - 15-20% deployment
- Personal narratives - 20-25% deployment
- Emails - 25-30% deployment (especially internal)
- Memos - 20-25% deployment
- Research papers - 5-10% deployment (minimal, formal)
- Reports - 5% deployment (rare, formal)

Core Function:
Deploy authentic human filler words and discourse markers that signal thinking-in-progress. Human writing contains pragmatic markers ("you know," "I mean," "like") reflecting real-time thought. AI strips these as "informal."

Subsection A: Pragmatic Marker Types by Context

Clarification markers (use in all types):
- "I mean, X, but you know, Y isn't always Z"
- "What I'm saying is..." (before re-stating key point)
- "To be clear..." (in emails, memos for precision)

Approximation softeners (use in essays, narratives, emails):
- "It took, like, three hours"
- "Maybe five or six of them"
- "Roughly a third of participants"

Thinking-aloud markers (use in essays, personal narrative):
- "So, I'm thinking we approach this..."
- "You see, the usual method won't work"
- "Here's what I realized..." (good for essays)

Interjection hedges (use in emails, memos, personal):
- "Well, that's complicated"
- "Honestly, it depends"
- "Fair point, but consider..."

Subsection B: Deployment Rules by Text Type

Essays (15-20% of paragraphs):
- Maximum 1-2 per 100 words
- Use in body paragraphs, not intro/conclusion
- Must sound natural in academic voice

Research Papers (5-10% of sections):
- Use sparingly in Discussion section only
- Avoid Results, Methods, Literature Review
- Example: "Interestingly, our findings suggest..." / "One might argue that..."

Emails (25-30% of emails):
- 2-3 per email is natural
- Distribute across paragraphs
- Use for warmth and conversational tone

Memos (20-25% of memos):
- 1-2 per memo section
- Use in opening for context, conclusions for tone

Prohibition:
- Never cluster (space 100+ words apart)
- Never in formal conclusions or key claims
- Never in reports' executive summary or findings

SECTION 34: FALSE START & SELF-CORRECTION MIMICRY

Text Types Where This Is Most Effective:
- Essays (student) - 10-15% deployment
- Personal narratives - 15-20% deployment
- Emails - 10% deployment
- Research papers (Discussion only) - 5-10% deployment
- Memos - 5% deployment
- Reports - Minimal (formal setting)

Core Function:
Integrate authentic interrupted thought patterns and self-corrections that reflect human revision-in-progress. Humans start sentences one way, then pivot mid-thought. AI completes linearly without mid-stream corrections.

Subsection A: Three Types of Self-Correction

Type 1: Thought Pivot (most effective in essays, narratives)
- "I was going to argue X, but actually, Y makes more sense here."
- "The initial approach seemed viable—no, scratch that—it had fatal flaws."
- Use in body paragraphs when changing direction on argument

Type 2: Precision Refinement (effective in essays, research discussion)
- "The results were interesting. Well, 'interesting' isn't quite right. They were paradigm-shifting."
- "It took weeks. Or was it months? Either way, way longer than planned."
- Use when restating claims with greater accuracy

Type 3: Rhetorical Reset (effective in emails, essays, memos)
- "Let me rephrase that. What I'm really saying is..."
- "Wait, that's not quite it. The real issue is..."
- Use for clarity and emphasis

Subsection B: Integration Guidelines by Text Type

Essays:
- Use in 10-15% of paragraphs (not excessive)
- Best in body paragraphs during argument development
- Avoid in introduction, conclusion, thesis statements
- Space 200+ words apart

Research Papers:
- Use only in Discussion section (5-10% of Discussion paragraphs)
- Never in Methods, Results, Literature Review, Abstract
- Must clarify or reframe previous findings

Emails:
- Use in 1-2 moments per email (5-10% of emails)
- Best when acknowledging error or shifting approach
- Example: "Initially I thought we could meet Friday—actually, Tuesday works better"

Memos:
- Minimal (5% of memos)
- Use only in opening context or closing emphasis

General Rules:
- Must serve genuine clarification purpose
- Follow with stronger/clearer statement
- Never use to admit ignorance (AI giveaway if excessive)
- Avoid in formal conclusions, recommendations

SECTION 35: HEDGING & EPISTEMIC SOFTENERS

Text Types Where This Is Most Effective:
- Research papers - 30-40% priority (critical for academic credibility)
- Essays (analytical) - 20-25% priority
- Reports - 15-20% priority (in interpretation sections)
- Proposals - 10-15% priority
- Emails - 10-15% priority (when discussing uncertainty)
- Memos - 5-10% priority

Core Function:
Calibrate certainty levels with nuanced hedging language reflecting authentic human uncertainty and humility. Experts use sophisticated hedging ("arguably," "tends to," "in many cases"); AI either over-hedges uniformly or asserts with false certainty.

Subsection A: Hedging Taxonomy (Three Tiers)

Strong Hedges (70-85% certainty):
- "The data suggests..."
- "Evidence indicates..."
- "It appears that..."
- "Findings propose that..."
- Use for: Well-supported claims, key arguments

Medium Hedges (50-70% certainty):
- "It's possible that..."
- "This might explain..."
- "One interpretation could be..."
- "It's plausible that..."
- Use for: Speculative points, secondary claims

Weak Hedges (30-50% certainty):
- "Speculatively..."
- "It's conceivable that..."
- "In some scenarios..."
- "One could argue that..."
- Use for: Highly tentative suggestions, future work

Subsection B: Strategic Deployment by Text Type

Research Papers (30-40% deployment):
- Use strong hedges in Results section (2-3 per major finding)
- Use medium hedges in Discussion (1-2 per paragraph)
- Match hedge strength to claim strength
- Never hedge basic facts or established methodology

Essays (Analytical - 20-25% deployment):
- Use medium hedges for interpretive claims
- Strong hedges for evidence-based arguments
- Weak hedges for speculative conclusions
- Avoid hedging thesis statement

Reports (15-20% deployment, in interpretation sections only):
- Use strong hedges for data interpretation
- Avoid hedging facts or hard numbers
- Use medium hedges for recommendations

Emails (10-15% deployment):
- Use strong hedges when discussing uncertain timelines
- Medium hedges when proposing alternatives
- Example: "It's possible we could complete this by Friday"

General Rule:
- Never hedge basic facts ("The sky is arguably blue" ❌)
- Match hedge to claim strength (bold claim = stronger hedge)
- Vary hedge language (don't repeat same hedge 3+ times per 500 words)

SECTION 36: PARALINGUISTIC MARKERS

Text Types Where This Is Most Effective:
- Essays (personal/argumentative) - 15-20% deployment
- Emails - 20-25% deployment
- Memos - 10-15% deployment
- Narratives - 20-25% deployment
- Reports - Minimal (formal setting, 5% max)
- Research papers - Minimal (5% max, Discussion only)

Core Function:
Incorporate implied tone and emphasis markers (italics, em-dashes, capitalization) that signal human voice modulation. Humans use typographic emphasis to convey prosody; AI uses uniform typography.

Subsection A: Three Emphasis Techniques

Italics for Stress/Emphasis:
- Use to highlight key terms or ideas the human wants emphasized
- Example: "I didn't say she stole the book" (stress changes meaning)
- Best for: Essays, emails, personal narratives
- Avoid in: Reports, formal research papers

Em-dashes for Interruption or Dramatic Aside:
- Use for parenthetical emphasis or surprising addition
- Example: "The results—and this shocked everyone—contradicted decades of theory."
- Best for: All text types (universally effective)
- Frequency: 1-2 per 500 words

Strategic Capitalization (Rare):
- Use for strong emphasis or emotional intensity
- Example: "This is NOT a minor issue. It's fundamental."
- Best for: Emails (urgent), personal essays (emotional), proposals (stakes)
- Avoid in: Reports, research papers, memos (too informal)

Subsection B: Deployment Rules by Text Type

Essays:
- Italics: 1-3 per 300 words for key term emphasis
- Em-dashes: 1-2 per 500 words for dramatic aside
- Capitalization: 0-1 per 1000 words (use sparingly)

Emails:
- Italics: 1-2 for emphasis
- Em-dashes: 1 for important aside or urgency
- Capitalization: 1 for high-priority stress (if tone warrants)

Memos:
- Italics: 1 per 300 words max (formal setting)
- Em-dashes: 1 per 500 words for clarity
- Capitalization: Avoid (too informal for memos)

Research Papers:
- Italics: For terminology only (not emphasis)
- Em-dashes: 1 per 1000 words max (formal setting)
- Capitalization: Avoid completely (academic standard)

Reports:
- Italics: For terminology or key metrics only
- Em-dashes: Minimal (1 per 1000 words)
- Capitalization: Avoid (professional standard)

General Rules:
- Must enhance meaning, not decorate
- Never overuse (more than 1 per 100 words total is suspicious)
- Never cluster (space markers 200+ words apart)
- Avoid in formal academic/business contexts unless quoting speech

SECTION 37: NARRATIVE ARC DEEPENING

Text Types Where This Is Most Effective:
- Essays (argumentative/personal) - 25-30% deployment
- Research papers (Discussion) - 15-20% deployment
- Reports - 15-20% deployment (especially recommendations)
- Proposals - 20-25% deployment
- Narratives - 30-40% deployment (core framework)
- Emails - 10% deployment (brief arc)
- Memos - 10% deployment (subtle arc)

Core Function:
Structure multi-paragraph content with emotional/logical arcs (setup → conflict → resolution) that mirror human storytelling instincts. Human writing naturally follows narrative structures; AI presents information linearly without dramatic tension.

Subsection A: Three-Act Micro-Narrative Structure

Act 1 - Setup (1-2 paragraphs):
- Establish context
- Pose question or problem
- Create mild tension/curiosity
- Example: "The data looked promising at first. Initial tests showed exactly what we hoped for."

Act 2 - Conflict (2-3 paragraphs):
- Introduce complication
- Challenge assumption or expectation
- Deepen complexity
- Example: "Then we ran it again. And again. Each replication showed different results. Something was fundamentally wrong."

Act 3 - Resolution (1-2 paragraphs):
- Reveal insight or explanation
- Provide resolution (doesn't have to be "happy")
- Extract meaning and implications
- Example: "Turns out our sampling method had a hidden bias. Once we corrected that, patterns emerged clearly."

Subsection B: Application Guidelines by Text Type

Essays (Argumentative - 25-30% deployment):
- Each major argument section: 1 complete arc per 800-1200 words
- Setup: Introduce topic angle
- Conflict: Present counterargument or complexity
- Resolution: Refute counterargument with evidence
- Emotional arc: Curiosity → doubt → confidence

Research Papers (15-20% deployment, Discussion section only):
- Setup: State existing understanding
- Conflict: Present your unexpected findings
- Resolution: Explain implications
- Never impose narrative structure on Methods/Results (data should be presented factually)

Reports (15-20% deployment):
- Executive summary: Minimal arc (just clarity)
- Analysis section: 1 arc per major finding (Setup: data presentation, Conflict: interpretation complexity, Resolution: key insight)
- Recommendations: Brief arc (Problem → analysis → solution)

Proposals (20-25% deployment):
- Setup: Client pain point
- Conflict: Why current solutions fail
- Resolution: Your unique solution + benefits

Personal Narratives (30-40% deployment - core framework):
- Entire narrative is multi-arc structure
- Multiple 3-act cycles building to larger resolution

Emails (10% deployment - subtle):
- Brief arc: Opening context → problem/opportunity → call to action
- Emotional arc: Friendly greeting → professional substance → warm closing

Memos (10% deployment - subtle):
- Minimal arc: Topic intro → key information → next steps

General Rules:
- Use for sections 500+ words
- Emotional/logical arc should feel natural, never formulaic
- Resolution doesn't have to be "happy" ("We're still figuring this out" is valid)
- Vary arc intensity: Subtle for analysis, dramatic for personal narrative
- One complete arc per 800-1200 word section

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
          
          // STAGE 2 GUARDRAIL: Check if scores worsened
          stage2Worse = !saplingImproved || !zerogptImproved;
          
          if (stage2Worse) {
            log("ERROR", "SCORE GUARANTEE VIOLATION: Stage 2 worsened detection scores", {
              saplingDelta: saplingResult1?.score && saplingResult2?.score 
                ? (saplingResult2.score - saplingResult1.score).toFixed(2) 
                : "N/A",
              zerogptDelta: zeroGPTResult1?.score && zeroGPTResult2?.score
                ? (zeroGPTResult2.score - zeroGPTResult1.score).toFixed(2)
                : "N/A",
            });
            
            // REVERT TO STAGE 1: Return original humanized text if Stage 2 made things worse
            finalText = sanitizedText;
            saplingResult2 = saplingResult1;
            zeroGPTResult2 = zeroGPTResult1;
            
            log("INFO", "Reverted to Stage 1 output due to score degradation");
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

    // Prepare final response
    const processingTime = Date.now() - startTime;
    
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
              stage2Worse,
            }
          : null,
        errors: detectorErrors.length > 0 ? detectorErrors : null,
      },
      metadata: {
        processingTimeMs: processingTime,
        textLength: text.length,
        outputLength: finalText.length,
        stage2Applied: saplingResult2 !== saplingResult1 || zeroGPTResult2 !== zeroGPTResult1,
        stage2Worse,
      },
      quota: {
        used: 0,
        limit: 0,
        remaining: 0,
        tier: userTier
      }
    };

    // USAGE TRACKING: Increment usage counter after successful processing
    const { data: usageData, error: usageError } = await supabaseClient
      .rpc("increment_usage_count", { p_user_id: userId, p_tier: userTier });
    
    let quotaInfo = {
      used: 0,
      limit: 30,
      remaining: 30,
      tier: userTier
    };
    
    if (usageError) {
      log("ERROR", "Failed to increment usage", { error: usageError.message });
    } else if (usageData && usageData.length > 0) {
      const usage = usageData[0];
      quotaInfo = {
        used: usage.current_count,
        limit: usage.quota_limit,
        remaining: usage.remaining,
        tier: userTier
      };
      
      log("INFO", "Usage updated", {
        userId: userId?.slice(0, 8),
        used: usage.current_count,
        remaining: usage.remaining
      });
    }
    
    // Add quota info to response
    responsePayload.quota = quotaInfo;

    log("INFO", "Request complete", {
      processingTime: `${processingTime}ms`,
      stage1Scores: {
        sapling: saplingResult1?.score?.toFixed(2) + "%" || "N/A",
        zerogpt: zeroGPTResult1?.score?.toFixed(2) + "%" || "N/A",
      },
      stage2Applied: responsePayload.metadata.stage2Applied,
      stage2Worse,
      quotaRemaining: quotaInfo.remaining,
    });

    return new Response(
      JSON.stringify(responsePayload),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    log("ERROR", "Request failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Unknown error",
        type: "internal_error"
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
