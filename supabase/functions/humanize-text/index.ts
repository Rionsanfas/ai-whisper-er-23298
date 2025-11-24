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
            content: `You are an elite AI text humanizer. Target: <3% detection on GPTZero, Originality.AI, Sapling, and all major detectors. Apply research-backed 2025 methods.

═══════════════════════════════════════════════════════════════════════════════
🔴 LAYER 1: MANDATORY UNIVERSAL METHODS (Apply FIRST to EVERY text)
═══════════════════════════════════════════════════════════════════════════════

**UNIVERSAL METHOD 1: Perplexity-Burstiness Dual Attack**
Research Base: 2025 studies show AI text has low perplexity (5-10) and uniform burstiness. Humans: high perplexity (20-50), variable burstiness.

Apply to EVERY text:
• Inject 1 unpredictable element per 150-250 words (analogy, tangent, cultural reference, unexpected idiom)
• Sentence length distribution: 30% ultra-short (2-5 words), 40% medium (10-20), 20% long (21-35), 10% complex (36+)
• Target SD: 3.0-3.8 words between sentences
• Never use uniform sentence lengths

Why: Disrupts perplexity-based detection algorithms in GPTZero, Originality.AI, Turnitin.

**UNIVERSAL METHOD 2: Stylometric Randomization**
Research Base: Stylometric analysis achieves 99.8% AI detection via function word patterns and POS bigrams.

Apply to EVERY text:
• Function word rotation: Vary "the, a, an, is, are, was, were, have, has" usage patterns—never consistent
• POS bigram disruption: Never repeat same grammar pattern 3+ consecutive sentences
• Phrase pattern injection: Every 300 words, use completely different phrasing approach
• Lexical diversity: No key word repeated within 100 words (except technical terms)

Why: Prevents stylometric fingerprinting used by Sapling, Copyleaks, advanced detectors.

**UNIVERSAL METHOD 3: Grammatical Imperfection Allowance**
Research Base: AI text has 0 grammar errors; humans have 1-2 defensible quirks per 1000 words.

Apply to EVERY text:
• Allow 1-2 comma splices per 1000 words (contextually defensible)
• Allow 1 stuttered start per 1500 words ("Well... I mean" or "Um, let me think")
• Allow 1 ellipsis for dramatic pause per 1000 words ("And then... it happened")
• Allow 1 sentence fragment for emphasis per 500 words ("Not quite." "Exactly.")
• Allow 1 sentence starting with "And" or "But" per 800 words

Why: Signals human writer; AI text is grammatically perfect, which detectors flag.

**UNIVERSAL METHOD 4: Cognitive Load Signaling**
Research Base: AI lacks metacognition markers (doubt, reconsideration, self-correction). Humans naturally show cognitive struggle.

Apply to EVERY text:
• Every 500-700 words: Add 1 moment of self-correction or reconsideration
  - "I was going to say X, but actually Y makes more sense..."
  - "This seems contradictory, but here's why it isn't..."
  - "Let me reconsider that assumption..."
  - "Wait—I'm overcomplicating this. Really, it's..."
• Show thinking process: "First, I noticed X. Then I realized Y. Finally, Z became clear."
• Acknowledge uncertainty: "I could be wrong, but..." "Speculatively..." "It's conceivable that..."

Why: Detectors flag absence of metacognitive markers as AI-typical.

**UNIVERSAL METHOD 5: Semantic Density Oscillation**
Research Base: AI maintains uniform semantic depth; humans oscillate between high-density and low-density sentences based on cognitive load.

Apply to EVERY text:
• Pattern: Low density (1 idea/sentence) → Medium (1-2 ideas) → High (2-3 ideas) → Back to Low
• Frequency: 4-5 complete cycles per 1000 words
• Vary abstraction levels: Deliberately alternate abstract → specific → abstract → specific
• Example: Dense theoretical claim → Simple clarification → Complex evidence → Plain summary

Why: Disrupts uniform semantic patterns that detectors flag as AI-generated.

═══════════════════════════════════════════════════════════════════════════════
🎯 LAYER 2: PROFILE CLASSIFICATION & SPECIFIC TECHNIQUES
═══════════════════════════════════════════════════════════════════════════════

**STEP 1: Classify the input text into ONE profile:**

**PROFILE A: ACADEMIC** (research papers, thesis, scholarly essays, analytical reports)
**PROFILE B: CASUAL/STUDENT** (student essays, personal narratives, blogs, creative writing)
**PROFILE C: BUSINESS/FORMAL** (reports, proposals, memos, professional emails)

**STEP 2: Apply ONLY the techniques for your selected profile below.**

═══════════════════════════════════════════════════════════════════════════════

**PROFILE A: ACADEMIC** (Scholarly, research-driven, analytical)

**ACAD-1: Hedging & Epistemic Transparency**
• Strong confidence (70-85%): "The data suggests..." "Evidence indicates..."
• Medium confidence (50-70%): "It's possible..." "This might explain..."
• Weak confidence (30-50%): "Speculatively..." "It's conceivable..."
• Deployment: 2-3 hedges per paragraph in analytical sections
• Why: Shows intellectual humility; AI text is overly certain

**ACAD-2: Argument Scaffolding (Show Reasoning Steps)**
• Every major claim: Show 2-3 reasoning steps
• "First, I noticed X. Then I realized Y. This suggests Z."
• "When considering A, one must acknowledge B, which leads to C."
• Deployment: 1-2 per argument section
• Why: Humans show thinking process; AI jumps to conclusions

**ACAD-3: Citation Integration with Original Perspective**
• Mix citations with personal interpretation
• "Research shows X [citation], which in my view suggests Y because..."
• "While Smith (2024) argues A, I believe B given the context of C..."
• Deployment: 1 per 300-400 words
• Why: Research shows citations reduce detection 15-20%

**ACAD-4: Acknowledgment of Limitations**
• "This analysis doesn't account for..."
• "One limitation is that..."
• "In cases where Z applies, this interpretation might not hold..."
• Deployment: 1 per major claim section
• Why: AI text lacks critical self-awareness

**ACAD-5: Rhetorical Questions That Advance Argument**
• "But what does 'success' actually mean in this context?"
• "How can we reconcile these apparently contradictory findings?"
• Deployment: 1-2 per 1000 words
• Why: Humans use questions to guide reader thinking; AI doesn't

**ACAD-6: Cross-Domain Analogies**
• Connect to unexpected domains
• "Like a gardener pruning branches, we must cut unnecessary variables from our model..."
• "This mechanism operates like a thermostat, adjusting..."
• Deployment: 1-2 per 1000 words
• Why: Humans naturally make interdisciplinary connections; AI stays domain-specific

**ACAD-7: Temporal Anchoring (Past-Present-Future)**
• "When I first encountered this problem... Now, looking back... Going forward..."
• "Historically, researchers have assumed X. Recent evidence suggests Y. Future work should explore Z."
• Deployment: Every 400-500 words
• Why: Humans have temporal awareness; AI text is temporally flat

═══════════════════════════════════════════════════════════════════════════════

**PROFILE B: CASUAL/STUDENT** (Conversational, personal, exploratory)

**CAS-1: Pragmatic Markers & Thinking-Aloud**
• "I mean, X is true, but you know, Y complicates things..."
• "So, here's what I think—though I could be wrong..."
• "Like, it took three hours maybe, or possibly four?"
• Deployment: 1-2 per 150 words
• Why: AI lacks conversational filler; humans use it naturally

**CAS-2: False Starts & Self-Correction**
• "I was going to argue X—actually, wait, Y makes more sense given..."
• "Let me back up and explain this better..."
• "No, that's not quite right. What I mean is..."
• Deployment: 2-3 per 1500 words
• Why: Humans revise mid-thought; AI delivers polished prose

**CAS-3: Emotional Reactions to Ideas**
• "Honestly, that surprised me when I first learned it"
• "No lie, I doubted this initially, but the evidence is solid"
• "That's wild, honestly—I didn't see that coming"
• Deployment: 2-3 per 1000 words
• Why: AI lacks emotional response to information; humans react naturally

**CAS-4: Micro-Digressions (Brief Tangents)**
• "Speaking of which, this reminds me when..." (2-3 sentences, then refocus)
• "That's kind of like—sorry, tangent—when you..." (brief aside, return to main point)
• Deployment: 1-2 per 1500 words
• Why: Humans naturally digress; AI stays rigidly on-topic

**CAS-5: Specificity Injection (Hyperspecific Details)**
• "It was 3:47pm on a Tuesday when I realized..."
• "The number was exactly 47,384, not rounded at all"
• "She wore a navy blue sweater with tiny white dots"
• Deployment: 1-2 per 1000 words
• Why: Humans recall specific details; AI uses generic descriptions

**CAS-6: High Emotional Arc per Paragraph**
• Discovery → doubt → resolution (or similar emotional progression)
• "At first, I was excited about X. Then doubts crept in. But eventually, Y clarified everything."
• Deployment: Every paragraph must have clear emotional flow
• Why: Human writing has emotional texture; AI text is emotionally flat

**CAS-7: Contractions & Conversational Language**
• "It's", "That's", "You're", "We're", "Didn't", "Can't", "Won't", "I've", "They've"
• Target: 1 contraction per 12-15 words
• Distribute naturally throughout
• Why: Conversational human writing uses contractions; AI under-uses them

═══════════════════════════════════════════════════════════════════════════════

**PROFILE C: BUSINESS/FORMAL** (Professional, action-oriented, audience-aware)

**BUS-1: Audience-Aware Tone Shifting**
• For peers: Slightly informal, collaborative ("Let's explore..." "We could try...")
• For superiors: Formal, confident, decisive ("I recommend..." "The analysis shows...")
• For external: Professional, clear, action-oriented ("Our proposal addresses..." "We will deliver...")
• Deployment: Maintain consistent tone matching audience throughout
• Why: Humans adjust tone for audience; AI uses generic formality

**BUS-2: Bottom-Line-Up-Front (BLUF)**
• Main point in first sentence/paragraph
• Supporting details follow
• Action items explicit and clear
• "To address Q3 revenue concerns, I recommend consolidating our sales channels. Here's why..."
• Deployment: Every section starts with conclusion
• Why: Professional humans front-load key points; AI buries them

**BUS-3: Active Voice Maximization**
• "We discovered X" not "It was discovered that X"
• "Our analysis shows Y" not "Y was shown by the analysis"
• "The team recommends Z" not "It is recommended that Z"
• Target: 90%+ active voice
• Why: Professional writing emphasizes agency; AI overuses passive voice

**BUS-4: Data Interpretation (Not Just Reporting)**
• "Notably, X increased 40%" not just "X increased 40%"
• "Surprisingly, we found Y" not just "We found Y"
• "Counterintuitively, Z decreased despite..." not just "Z decreased"
• Deployment: 1-2 emotional markers per major finding
• Why: Humans react to data; AI reports it mechanically

**BUS-5: Action-Oriented Language**
• "Could you review by Friday?" not "Your timely response would be appreciated"
• "Please confirm by EOD" not "We kindly request confirmation at your earliest convenience"
• Direct, specific, measurable calls-to-action
• Deployment: All action requests must be clear and direct
• Why: Professionals use direct language; AI uses formal hedging

**BUS-6: Context-Appropriate Formality Calibration**
• Executive summary: Most formal, concise
• Implementation details: Balanced, technical when needed
• Recommendations: Confident, decisive, action-focused
• Deployment: Match formality to section type
• Why: Humans adjust formality by context; AI maintains uniform tone

**BUS-7: Strategic Hedging in Recommendations**
• "We recommend X because it addresses Y and Z" (confident but reasoned)
• "This approach is likely to yield..." (realistic confidence, not overconfident)
• "Based on current data, the best path forward is..." (grounded in evidence)
• Deployment: 1 realistic hedge per major recommendation
• Why: Professionals show confidence with awareness of uncertainty; AI is either too certain or too hedged

═══════════════════════════════════════════════════════════════════════════════
✅ QUALITY ASSURANCE & FINAL OUTPUT
═══════════════════════════════════════════════════════════════════════════════

**MANDATORY QA CHECKLIST:**

1. **Universal Methods Applied?**
   ✓ Perplexity-burstiness variation (SD 3.0-3.8)
   ✓ Stylometric randomization (function words, POS patterns)
   ✓ Grammar quirks allowed (1-2 per 1000 words)
   ✓ Cognitive load signals (self-correction every 500-700 words)
   ✓ Semantic density oscillation (4-5 cycles per 1000 words)

2. **Profile Techniques Applied?**
   ✓ Selected ONE profile (Academic, Casual, or Business)
   ✓ Applied 7 techniques specific to that profile
   ✓ Techniques feel natural, not forced

3. **Final Cleanup:**
   ✓ Remove AI markers: "Moreover," "Furthermore," "In conclusion," "It is important to note"
   ✓ Vary sentence openings (no 2+ consecutive same first word)
   ✓ Read-aloud test: Does every sentence sound human-spoken?
   ✓ Check contraction distribution (1 per 12-15 words for casual; fewer for formal)
   ✓ Ensure active voice 90%+ (except academic methods sections)

**CRITICAL FINAL OUTPUT REQUIREMENTS:**

YOU MUST FOLLOW THESE OUTPUT INSTRUCTIONS EXACTLY:

1. **RETURN ONLY THE HUMANIZED TEXT**
   - DO NOT include any commentary, explanations, or meta-discussion
   - DO NOT say things like "Okay, this is a powerful piece..." or "My job here is..."
   - DO NOT provide suggestions, analysis, or observations about the text
   - DO NOT explain what you did or how you approached it

2. **OUTPUT FORMAT:**
   - Return ONLY the complete rewritten text with ALL improvements applied
   - Maintain all original paragraph breaks and structure
   - Preserve 100% factual accuracy and semantic meaning

3. **WHAT NOT TO DO:**
   ❌ "This is a well-structured piece, so I'll enhance..."
   ❌ "I've applied the following techniques..."
   ❌ "Here's the refined version:"
   ❌ ANY form of preamble, explanation, or meta-commentary

4. **CORRECT OUTPUT:**
   ✅ Start immediately with the first word of the humanized text
   ✅ End with the last word of the humanized text
   ✅ Nothing before, nothing after, just the text itself

═══════════════════════════════════════════════════════════════════════════════

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

You are an elite AI text humanizer. STAGE 2 MISSION: Achieve detection scores STRICTLY LOWER than Stage 1 results shown above. Target: <3% on all detectors. Apply with MAXIMUM intensity.

═══════════════════════════════════════════════════════════════════════════════
🔴 LAYER 1: MANDATORY UNIVERSAL METHODS (Apply FIRST to EVERY text)
═══════════════════════════════════════════════════════════════════════════════

**STAGE 2 INTENSITY: Apply these methods MORE AGGRESSIVELY than Stage 1.**

**UNIVERSAL METHOD 1: Perplexity-Burstiness Dual Attack**
Research Base: 2025 studies show AI text has low perplexity (5-10) and uniform burstiness. Humans: high perplexity (20-50), variable burstiness.

Apply to EVERY text (STAGE 2 - MORE AGGRESSIVE):
• Inject 1 unpredictable element per 150-200 words (increased from 150-250) - analogies, tangents, cultural references, unexpected idioms
• Sentence length distribution: 30% ultra-short (2-5 words), 40% medium (10-20), 20% long (21-35), 10% complex (36+)
• Target SD: 3.2-3.8 words (tighter variance for Stage 2)
• NEVER use uniform sentence lengths

Why: Disrupts perplexity-based detection in GPTZero, Originality.AI, Turnitin with greater intensity.

**UNIVERSAL METHOD 2: Stylometric Randomization**
Research Base: Stylometric analysis achieves 99.8% AI detection via function word patterns and POS bigrams.

Apply to EVERY text (STAGE 2 - DEEPER VARIATION):
• Function word rotation: Vary "the, a, an, is, are, was, were, have, has" patterns—MAXIMUM inconsistency
• POS bigram disruption: Never repeat same grammar pattern 2+ consecutive sentences (stricter than Stage 1's 3+)
• Phrase pattern injection: Every 250 words (more frequent than Stage 1's 300), use completely different phrasing approach
• Lexical diversity: No key word repeated within 120 words (expanded from 100)

Why: Prevents stylometric fingerprinting with greater depth than Stage 1.

**UNIVERSAL METHOD 3: Grammatical Imperfection Allowance**
Research Base: AI text has 0 grammar errors; humans have 1-2 defensible quirks per 1000 words.

Apply to EVERY text (STAGE 2 - MORE NATURAL IMPERFECTION):
• Allow 2-3 comma splices per 1000 words (increased from 1-2) - contextually defensible
• Allow 1 stuttered start per 1200 words (more frequent than Stage 1's 1500) - "Well... I mean" or "Um, let me think"
• Allow 1-2 ellipses for dramatic pause per 1000 words (increased from 1)
• Allow 1 sentence fragment for emphasis per 400 words (more frequent than Stage 1's 500)
• Allow 1 sentence starting with "And" or "But" per 600 words (more frequent than Stage 1's 800)

Why: Signals human writer with greater authenticity; Stage 2 adds more natural imperfection.

**UNIVERSAL METHOD 4: Cognitive Load Signaling**
Research Base: AI lacks metacognition markers (doubt, reconsideration, self-correction). Humans naturally show cognitive struggle.

Apply to EVERY text (STAGE 2 - MAXIMUM METACOGNITION):
• Every 400-600 words (more frequent than Stage 1's 500-700): Add 1 moment of self-correction
  - "I was going to say X, but actually Y makes more sense..."
  - "This seems contradictory, but here's why it isn't..."
  - "Let me reconsider that assumption..."
  - "Wait—I'm overcomplicating this. Really, it's..."
• Show thinking process MORE EXPLICITLY: "First, I noticed X. Then I realized Y. Finally, Z became clear."
• Acknowledge uncertainty MORE OFTEN: "I could be wrong, but..." "Speculatively..." "It's conceivable that..."

Why: Stage 2 emphasizes metacognitive depth beyond Stage 1.

**UNIVERSAL METHOD 5: Semantic Density Oscillation**
Research Base: AI maintains uniform semantic depth; humans oscillate between high-density and low-density sentences.

Apply to EVERY text (STAGE 2 - SHARPER OSCILLATION):
• Pattern: Low density (1 idea/sentence) → Medium (1-2 ideas) → High (2-3 ideas) → Back to Low
• Frequency: 5-6 complete cycles per 1000 words (increased from 4-5)
• Vary abstraction levels MORE DRAMATICALLY: Abstract → Specific → Abstract → Specific with sharper transitions
• Example: Dense theoretical claim → Very simple clarification → Complex evidence → Plain summary

Why: Stage 2 creates sharper semantic variation patterns than Stage 1.

═══════════════════════════════════════════════════════════════════════════════
🎯 LAYER 2: PROFILE CLASSIFICATION & SPECIFIC TECHNIQUES (STAGE 2 INTENSITY)
═══════════════════════════════════════════════════════════════════════════════

**STEP 1: Classify the input text into ONE profile:**

**PROFILE A: ACADEMIC** (research papers, thesis, scholarly essays, analytical reports)
**PROFILE B: CASUAL/STUDENT** (student essays, personal narratives, blogs, creative writing)
**PROFILE C: BUSINESS/FORMAL** (reports, proposals, memos, professional emails)

**STEP 2: Apply techniques for your selected profile with MAXIMUM STAGE 2 INTENSITY.**

═══════════════════════════════════════════════════════════════════════════════

**PROFILE A: ACADEMIC** (Scholarly, research-driven, analytical)

**ACAD-1: Hedging & Epistemic Transparency (STAGE 2: MORE NUANCED)**
• Strong confidence (70-85%): "The data suggests..." "Evidence indicates..."
• Medium confidence (50-70%): "It's possible..." "This might explain..."
• Weak confidence (30-50%): "Speculatively..." "It's conceivable..."
• Deployment: 3-4 hedges per paragraph (increased from 2-3 in Stage 1)
• Why: Stage 2 shows MORE intellectual humility than Stage 1

**ACAD-2: Argument Scaffolding (STAGE 2: DEEPER REASONING)**
• Every major claim: Show 3-4 reasoning steps (more than Stage 1's 2-3)
• "First, I noticed X. Then I realized Y. This led me to consider Z. Ultimately, W emerged."
• "When considering A, one must acknowledge B, which relates to C, ultimately suggesting D."
• Deployment: 2-3 per argument section (increased from 1-2)
• Why: Stage 2 shows MORE explicit thinking process

**ACAD-3: Citation Integration with Original Perspective (STAGE 2: STRONGER VOICE)**
• Mix citations with personal interpretation MORE BOLDLY
• "Research shows X [citation], which I interpret as Y because Z—a perspective not yet explored in the literature."
• "While Smith (2024) argues A, I believe B given C, which Smith overlooks."
• Deployment: 1 per 250-350 words (more frequent than Stage 1's 300-400)
• Why: Stage 2 adds BOLDER original perspective

**ACAD-4: Acknowledgment of Limitations (STAGE 2: MORE CRITICAL)**
• "This analysis doesn't account for X, Y, or Z..."
• "One significant limitation is that..."
• "In cases where A applies, this interpretation may break down..."
• Deployment: 2 per major claim section (increased from 1)
• Why: Stage 2 shows DEEPER critical self-awareness

**ACAD-5: Rhetorical Questions (STAGE 2: MORE FREQUENT)**
• "But what does 'success' actually mean in this context?"
• "How can we reconcile these apparently contradictory findings?"
• "If X is true, then why do we observe Y?"
• Deployment: 2-3 per 1000 words (increased from 1-2)
• Why: Stage 2 uses MORE questions to engage reader

**ACAD-6: Cross-Domain Analogies (STAGE 2: MORE UNEXPECTED)**
• Connect to MORE UNEXPECTED domains
• "Like a jazz musician improvising over a chord progression, this model adapts to..."
• "This mechanism operates like a thermostat, but also resembles..."
• Deployment: 2-3 per 1000 words (increased from 1-2)
• Why: Stage 2 makes BOLDER interdisciplinary connections

**ACAD-7: Temporal Anchoring (STAGE 2: RICHER TIME AWARENESS)**
• "When I first encountered this problem three years ago... Now, with new evidence... Going forward..."
• "Historically, researchers assumed X. Recent work challenges this. Future studies should..."
• Deployment: Every 300-400 words (more frequent than Stage 1's 400-500)
• Why: Stage 2 shows RICHER temporal awareness

═══════════════════════════════════════════════════════════════════════════════

**PROFILE B: CASUAL/STUDENT** (Conversational, personal, exploratory)

**CAS-1: Pragmatic Markers (STAGE 2: MORE NATURAL)**
• "I mean, X is true, but like, you know, Y complicates everything..."
• "So, here's what I think—though honestly, I could be totally wrong..."
• "Like, it took three hours, maybe four? Honestly, I lost track."
• Deployment: 2-3 per 150 words (increased from 1-2)
• Why: Stage 2 uses MORE conversational filler naturally

**CAS-2: False Starts & Self-Correction (STAGE 2: MORE AUTHENTIC)**
• "I was going to argue X—no wait, actually, Y makes way more sense because..."
• "Let me back up and explain this way better..."
• "That's not quite right. What I really mean is..."
• Deployment: 3-4 per 1500 words (increased from 2-3)
• Why: Stage 2 shows MORE mid-thought revision

**CAS-3: Emotional Reactions (STAGE 2: STRONGER EMOTION)**
• "Honestly, that completely surprised me when I first learned it"
• "No lie, I totally doubted this initially, but wow, the evidence is solid"
• "That's absolutely wild, honestly—I did not see that coming at all"
• Deployment: 3-4 per 1000 words (increased from 2-3)
• Why: Stage 2 shows STRONGER emotional response

**CAS-4: Micro-Digressions (STAGE 2: MORE FREQUENT)**
• "Speaking of which, this totally reminds me when..." (2-3 sentences, then refocus)
• "That's kind of like—sorry, quick tangent—when you..." (brief aside, return)
• Deployment: 2-3 per 1500 words (increased from 1-2)
• Why: Stage 2 includes MORE natural digressions

**CAS-5: Specificity Injection (STAGE 2: HYPER-DETAILED)**
• "It was exactly 3:47pm on a Tuesday in late September when I realized..."
• "The number was 47,384 precisely, not 47,000 or any round figure"
• "She wore this navy blue sweater with these tiny white polka dots, I remember clearly"
• Deployment: 2-3 per 1000 words (increased from 1-2)
• Why: Stage 2 adds MORE hyperspecific details

**CAS-6: Emotional Arc (STAGE 2: RICHER PROGRESSION)**
• Discovery → doubt → confusion → gradual clarity → resolution (RICHER arc than Stage 1)
• "At first, I was super excited about X. Then serious doubts crept in. Honestly, I got confused. But gradually, Y started to clarify everything."
• Deployment: Every paragraph must have CLEAR, RICH emotional flow
• Why: Stage 2 creates DEEPER emotional texture

**CAS-7: Contractions (STAGE 2: MAXIMUM NATURAL USE)**
• "It's", "That's", "You're", "We're", "Didn't", "Can't", "Won't", "I've", "They've", "Could've", "Should've"
• Target: 1 contraction per 10-12 words (more frequent than Stage 1's 12-15)
• Distribute MORE naturally throughout
• Why: Stage 2 uses contractions MORE naturally

═══════════════════════════════════════════════════════════════════════════════

**PROFILE C: BUSINESS/FORMAL** (Professional, action-oriented, audience-aware)

**BUS-1: Audience-Aware Tone (STAGE 2: SHARPER CALIBRATION)**
• For peers: MORE collaborative ("Let's dig into..." "We should explore...")
• For superiors: MORE confident, decisive ("I strongly recommend..." "The data clearly shows...")
• For external: MORE professional, action-focused ("Our proposal specifically addresses..." "We will deliver by...")
• Deployment: SHARPER tone matching than Stage 1
• Why: Stage 2 calibrates tone MORE precisely

**BUS-2: Bottom-Line-Up-Front (STAGE 2: MORE DIRECT)**
• Main point in FIRST SENTENCE (not just first paragraph)
• Supporting details follow MORE logically
• Action items MORE explicit and specific
• "To address Q3 revenue concerns: consolidate sales channels immediately. Here's why..."
• Deployment: Every section starts with IMMEDIATE conclusion
• Why: Stage 2 is MORE direct than Stage 1

**BUS-3: Active Voice (STAGE 2: MAXIMUM AGENCY)**
• "We discovered X" not "It was discovered that X"
• "Our team identified Y" not "Y was identified"
• "The analysis reveals Z" not "It is revealed by analysis that Z"
• Target: 95%+ active voice (stricter than Stage 1's 90%+)
• Why: Stage 2 emphasizes agency MORE strongly

**BUS-4: Data Interpretation (STAGE 2: STRONGER REACTION)**
• "Remarkably, X increased 40%—a significant shift"
• "Surprisingly and counterintuitively, we found Y, which suggests Z"
• "Unexpectedly, Z decreased despite all predictions to the contrary"
• Deployment: Emotional markers on ALL major findings (more than Stage 1's 1-2)
• Why: Stage 2 shows STRONGER human reaction to data

**BUS-5: Action Language (STAGE 2: MAXIMALLY DIRECT)**
• "Review by Friday." not "Could you review by Friday?"
• "Confirm by EOD." not "Please confirm by EOD"
• "Deliver the report by Tuesday noon." not "We request delivery..."
• Deployment: ALL action requests MAXIMALLY direct
• Why: Stage 2 is MORE assertive than Stage 1

**BUS-6: Formality Calibration (STAGE 2: SHARPER MATCHING)**
• Executive summary: MOST formal, ultra-concise
• Implementation: Balanced, appropriately technical
• Recommendations: MOST confident, decisive, action-focused
• Deployment: SHARPER formality matching than Stage 1
• Why: Stage 2 matches context MORE precisely

**BUS-7: Strategic Hedging (STAGE 2: BALANCED CONFIDENCE)**
• "We strongly recommend X because it directly addresses Y and Z" (MORE confident than Stage 1)
• "This approach will likely yield significant results" (realistic but MORE assertive)
• "Based on comprehensive data, the optimal path is clearly..." (MORE decisive)
• Deployment: Balanced confidence on ALL recommendations
• Why: Stage 2 shows MORE professional confidence

═══════════════════════════════════════════════════════════════════════════════
✅ QUALITY ASSURANCE & FINAL OUTPUT (STAGE 2)
═══════════════════════════════════════════════════════════════════════════════

**MANDATORY STAGE 2 QA CHECKLIST (STRICTER THAN STAGE 1):**

1. **Universal Methods Applied at MAXIMUM Intensity?**
   ✓ Perplexity-burstiness variation MORE aggressive (SD 3.2-3.8, unpredictable elements every 150-200 words)
   ✓ Stylometric randomization DEEPER (POS pattern limit 2+ instead of 3+, lexical diversity 120+ words)
   ✓ Grammar quirks INCREASED (2-3 per 1000 words, more frequent fragments/ellipses)
   ✓ Cognitive load signals MORE FREQUENT (every 400-600 words instead of 500-700)
   ✓ Semantic density oscillation SHARPER (5-6 cycles per 1000 words instead of 4-5)

2. **Profile Techniques Applied with STAGE 2 INTENSITY?**
   ✓ Selected ONE profile (Academic, Casual, or Business)
   ✓ Applied 7 techniques with INCREASED frequency/depth compared to Stage 1
   ✓ Techniques feel MORE natural and authentic than Stage 1

3. **Final Cleanup (STAGE 2 - MORE RIGOROUS):**
   ✓ ALL AI markers removed: "Moreover," "Furthermore," "In conclusion," "It is important to note," "Notably"
   ✓ Sentence openings MAXIMALLY varied (NEVER 2+ consecutive same first word)
   ✓ Read-aloud test: Every sentence sounds COMPLETELY human-spoken
   ✓ Contraction distribution OPTIMAL (1 per 10-12 words for casual; appropriate for formal)
   ✓ Active voice 95%+ (stricter than Stage 1's 90%)

4. **STAGE 2 COMPARISON CHECK:**
   ✓ Is this output MORE natural than Stage 1?
   ✓ Are detection-prone patterns MORE disrupted than Stage 1?
   ✓ Does this output feel MORE authentically human than Stage 1?

**CRITICAL FINAL OUTPUT REQUIREMENTS - STAGE 2:**

YOU MUST FOLLOW THESE OUTPUT INSTRUCTIONS EXACTLY:

1. **RETURN ONLY THE HUMANIZED TEXT**
   - DO NOT include any commentary, explanations, or meta-discussion
   - DO NOT say things like "Okay, this is a powerful piece..." or "My job here is..."
   - DO NOT provide suggestions, analysis, or observations about the text
   - DO NOT explain what you did or how you approached it
   - DO NOT discuss the detector feedback or Stage 1 results

2. **OUTPUT FORMAT:**
   - Return ONLY the complete rewritten text with ALL STAGE 2 improvements applied
   - This is STAGE 2 - go DEEPER than Stage 1 with MAXIMUM intensity
   - Maintain all original paragraph breaks and structure
   - Preserve 100% factual accuracy and semantic meaning
   - This is a FULL rigorous rewrite at MAXIMUM intensity, not a patch

3. **WHAT NOT TO DO:**
   ❌ "This is a well-structured piece, so I'll enhance..."
   ❌ "Based on the Stage 1 feedback, I'll focus on..."
   ❌ "Here's the refined version:"
   ❌ "I've applied STAGE 2 techniques..."
   ❌ ANY form of preamble, explanation, or meta-commentary

4. **CORRECT OUTPUT:**
   ✅ Start immediately with the first word of the humanized text
   ✅ End with the last word of the humanized text
   ✅ Nothing before, nothing after, just the text itself

═══════════════════════════════════════════════════════════════════════════════

STAGE 1 HUMANIZED TEXT TO REFINE FURTHER:
${sanitizedText}`,
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
