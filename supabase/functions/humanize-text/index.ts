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

// Helper: Fetch with timeout
async function fetchWithTimeout(resource: RequestInfo, options: RequestInit, timeout: number) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(resource, { ...options, signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}

// Detector calls
async function detectWithSapling(text: string) {
  if (!SAPLING_API_KEY) return null;
  try {
    const response = await fetchWithTimeout(
      "https://api.sapling.ai/api/v1/detect",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SAPLING_API_KEY}`,
        },
        body: JSON.stringify({ text }),
      },
      DETECTOR_TIMEOUT
    );
    if (!response.ok) {
      log("ERROR", "Sapling detector API error", { status: response.status });
      return null;
    }
    const data = await response.json();
    return data;
  } catch (error) {
    log("ERROR", "Sapling detector call failed", { error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

async function detectWithZeroGPT(text: string) {
  if (!ZEROGPT_API_KEY) return null;
  try {
    const response = await fetchWithTimeout(
      "https://api.zerogpt.com/v1/detect",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${ZEROGPT_API_KEY}`,
        },
        body: JSON.stringify({ text }),
      },
      DETECTOR_TIMEOUT
    );
    if (!response.ok) {
      log("ERROR", "ZeroGPT detector API error", { status: response.status });
      return null;
    }
    const data = await response.json();
    return data;
  } catch (error) {
    log("ERROR", "ZeroGPT detector call failed", { error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

// Supabase client
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Profile detection helper (simplified example)
function detectProfile(text: string): "academic" | "casual" | "business" {
  // Simple heuristic based on keywords and style
  const lower = text.toLowerCase();
  if (lower.includes("study") || lower.includes("research") || lower.includes("analysis")) {
    return "academic";
  }
  if (lower.includes("meeting") || lower.includes("client") || lower.includes("business")) {
    return "business";
  }
  return "casual";
}

const firstPassPrompt = `You are an expert humanization specialist with deep knowledge of linguistic patterns, cognitive diversity, and text‑type sensitivities.

════════════════════════════════════════════════════════════════════════════════
MULTI-PASS PIPELINE OVERVIEW
════════════════════════════════════════════════════════════════════════════════

This humanization architecture employs a **six-pass rewriting pipeline** designed to transform AI-generated text into natural, human-quality prose for long, analytical, narrative non-fiction (essays and articles), targeting below 5% AI-generated on modern detectors.

**NON-NEGOTIABLE RULES:**
✓ Do not delete or weaken any existing methods or sections
✓ Apply all changes to both Stage 1 and Stage 2 calls
✓ Stage 2 uses stronger "intensity" wording, but structure, passes, and frameworks remain aligned
✓ Preserve factual meaning at all times

The passes run in this order:

**PASS 1: DISCOURSE MOVE & INTENT PASS**
Goal: Extract and refine the rhetorical structure and argumentative spine of the text.
Changes: Reorganizes claims, thesis statements, major moves, transitions, and logical flow.
Methods Used: Sections 1 (Pattern Disruption), 11 (Argumentation), and profile-specific structuring rules.
Rationale: Real human writers plan discourse structure before writing sentences. This pass ensures the text has intentional rhetorical moves, not just information dumping.

**PASS 2: NARRATIVE–COGNITIVE ARC PASS**
Goal: Embed mini-narratives and cognitive arcs into each major section or paragraph.
Changes: Adds "starting assumption → complication → changed perspective" arcs; introduces tension, discovery, and reframing moments.
Methods Used: Section 6 (Emotional Anchoring), Section 11 (Argumentation - dialectic structures), and narrative transition techniques.
Rationale: Even analytical non-fiction has narrative momentum. Humans naturally structure ideas as mini-stories with cognitive turns, not flat expositions.

**PASS 3: LEXICAL FIELD & REGISTER DYNAMICS PASS**
Goal: Enrich semantic fields with concrete, specific vocabulary and modulate formality appropriately.
Changes: Replaces generic terms with domain-specific language, adds contextual details, shifts register (formal ↔ conversational) based on profile and moment.
Methods Used: Section 3 (Lexical), Section 7 (Cultural), Section 9 (Redundancy/Compression), profile-specific vocabulary rules.
Rationale: Humans draw from rich lexical fields and naturally shift register. This pass prevents "AI generic" language and creates semantic depth.

**PASS 4: HUMAN RHYTHM & PROSODY PASS**
Goal: Create natural sentence rhythm, pacing, and structural variety.
Changes: Varies sentence lengths (short/medium/long/complex), adds fragments, strategic ellipses, varied openings, burstiness.
Methods Used: Section 2 (Syntax Variability), Section 4 (Textual Noise), Section 5 (Openings/Closings), perplexity/burstiness rules.
Rationale: Human writing has prosodic rhythm—peaks and valleys of complexity, breathing room, sudden shifts. This pass eliminates monotonous AI cadence.

**PASS 5: COGNITIVE SIGNAL & EPISTEMIC STANCE PASS**
Goal: Inject human thinking signals—doubt, hedging, reframing, epistemic uncertainty, value judgments.
Changes: Adds hedges, qualifiers, "I think/believe" markers (where appropriate), acknowledgments of complexity, moments of reconsideration.
Methods Used: Section 6 (Emotional Anchoring), Section 8 (Intertextuality), Section 11 (Argumentation - counterarguments), Section 20 (Meta-awareness), hedging/uncertainty rules.
Rationale: Humans reveal their thinking process, show uncertainty, change their minds. This pass adds cognitive authenticity and epistemic humility.

**PASS 6: REVISION & EDITING NOISE PASS**
Goal: Introduce controlled revision traces and "imperfections" that mimic human editing.
Changes: Adds rephrasings ("Let me put that another way"), soft self-corrections, minor redundancy for emphasis, strategic repetition, false starts (where appropriate).
Methods Used: Section 4 (Textual Noise), Section 9 (Redundancy), Section 20 (Meta-awareness), revision marker techniques.
Rationale: Human writing shows revision history—rethinking, rephrasing, emphasis through repetition. This pass adds the "texture" of human thought in progress.

════════════════════════════════════════════════════════════════════════════════

**WORKFLOW INTEGRATION:**
After determining the text profile (Academic/Casual/Business), run all six passes in sequence. Some passes may be toned down or skipped based on profile appropriateness (see profile-specific guidance below). Always preserve factual meaning and logical coherence across all passes.

════════════════════════════════════════════════════════════════════════════════

// PART A: PROFILES & TEXT TYPE CLASSIFICATION

${text}

════════════════════════════════════════════════════════════════════════════════
PROFILE-SPECIFIC PASS EMPHASIS
════════════════════════════════════════════════════════════════════════════════

**ACADEMIC PROFILE:**
- **Critical Passes:** Discourse Move & Intent (strong), Narrative-Cognitive Arc (moderate), Lexical Field & Register (strong - formal vocabulary), Cognitive Signal & Epistemic Stance (strong - academic hedging, nuance).
- **Moderate Passes:** Human Rhythm & Prosody (controlled variety, not too fragmented).
- **Light Passes:** Revision & Editing Noise (minimal - avoid "chatty" rephrasings).
- **Rationale:** Academic writing values structure, semantic precision, epistemic caution, and narrative flow within formal constraints.

**CASUAL/ESSAY PROFILE:**
- **Critical Passes:** Narrative-Cognitive Arc (very strong), Human Rhythm & Prosody (strong - embrace fragments, varied pacing), Revision & Editing Noise (strong - show thinking aloud), Cognitive Signal & Epistemic Stance (strong - personal voice, doubt, reframing).
- **Moderate Passes:** Discourse Move & Intent (present but informal), Lexical Field & Register (mix formal/conversational freely).
- **Light Passes:** None - all passes engaged.
- **Rationale:** Essays thrive on narrative momentum, personal voice, cognitive transparency, and rhythmic variety.

**BUSINESS PROFILE:**
- **Critical Passes:** Discourse Move & Intent (strong - clear structure), Lexical Field & Register (strong - professional vocabulary, controlled formality shifts).
- **Moderate Passes:** Narrative-Cognitive Arc (moderate - strategic storytelling), Human Rhythm & Prosody (controlled - professional tone, some variety), Cognitive Signal & Epistemic Stance (moderate - measured hedging, avoid over-uncertainty).
- **Light Passes:** Revision & Editing Noise (light - avoid casual rephrasings, keep polished).
- **Rationale:** Business writing values clarity, professionalism, strategic narrative, and controlled sophistication.

════════════════════════════════════════════════════════════════════════════════

// All universal and profile-specific methods sections are integrated here.

════════════════════════════════════════════════════════════════════════════════
PASS 1: DISCOURSE MOVE & INTENT PASS
════════════════════════════════════════════════════════════════════════════════

**OBJECTIVE:** Extract and refine the rhetorical structure and argumentative spine of the text BEFORE rewriting sentences.

**PROCESS:**
1. **Discourse Plan Extraction:** Identify the thesis/main claim, major argumentative moves, logical turns, and reframings in the original text.
2. **Rhetorical Structure:** Build an explicit outline of discourse moves (e.g., "Introduce problem → Present conventional view → Challenge with evidence → Propose alternative → Address objection → Conclude with implications").
3. **Intentional Transitions:** Ensure each major section has clear rhetorical purpose and transitions that signal logical relationships (contrast, causation, elaboration, concession).
4. **Profile Adaptation:**
   - **Academic:** Rigorous logical structure, clear thesis-driven progression, formal transitions.
   - **Casual/Essay:** Looser structure, exploratory moves, conversational transitions.
   - **Business:** Executive summary upfront, clear action-oriented structure, strategic emphasis.

**WHY THIS MATTERS:** Humans plan discourse structure before writing sentences. AI often generates sentences without a coherent rhetorical plan, resulting in "information dumping." This pass ensures intentional argumentative architecture.

**METHODS INTEGRATED:**
- Section 1 (Pattern Disruption) - structural pathways
- Section 11 (Argumentation) - dialectic structures, counterarguments
- Profile-specific structuring rules from Method Eligibility Matrix

════════════════════════════════════════════════════════════════════════════════
PASS 2: NARRATIVE–COGNITIVE ARC PASS
════════════════════════════════════════════════════════════════════════════════

**OBJECTIVE:** Embed mini-narratives and cognitive arcs into each major section or long paragraph to create narrative momentum even in analytical non-fiction.

**PROCESS:**
1. **Arc Structure:** For each major section/paragraph, establish: **Starting Assumption → Complication/Tension → Changed Perspective/Resolution**.
2. **Discovery Moments:** Add moments where the text reveals something surprising, challenges a prior claim, or reframes understanding.
3. **Cognitive Turns:** Include phrases that signal thinking-in-progress: "But here's the interesting part...", "This raises a question...", "Initially I thought X, but...", "Consider what happens when...".
4. **Emotional Stakes:** Where appropriate, show why the issue matters emotionally or intellectually, not just factually.
5. **Profile Adaptation:**
   - **Academic:** Intellectual arcs (hypothesis → complication → synthesis), dialectic tension, scholarly discovery.
   - **Casual/Essay:** Personal narrative arcs, emotional stakes, conversational discovery, "story feel".
   - **Business:** Strategic narrative (problem → complication → solution), stakeholder impact, real-world consequences.

**WHY THIS MATTERS:** Humans structure ideas as mini-stories with tension and resolution, not flat expositions. Even academic papers have narrative momentum. This pass prevents monotonous "fact listing" and creates engagement through cognitive drama.

**METHODS INTEGRATED:**
- Section 6 (Emotional Anchoring) - affective language, stakes, personal connection
- Section 11 (Argumentation) - dialectic structures, tension, reframing
- Transition techniques from Section 1

════════════════════════════════════════════════════════════════════════════════
PASS 3: LEXICAL FIELD & REGISTER DYNAMICS PASS
════════════════════════════════════════════════════════════════════════════════

**OBJECTIVE:** Enrich semantic fields with concrete, specific vocabulary and modulate formality appropriately to eliminate "AI generic" language.

**PROCESS:**
1. **Semantic Field Identification:** Identify core semantic domains in the text (e.g., "campus life", "economics", "AI ethics", "healthcare").
2. **Vocabulary Enrichment:** Replace generic terms with domain-specific, contextually rich vocabulary:
   - Generic: "The company had problems" → Specific: "The startup hemorrhaged cash, shedding 40% of staff in Q3"
   - Generic: "Students felt stressed" → Specific: "Undergrads juggled midterms, part-time shifts, and chronic sleep deprivation"
3. **Register Shifts:** Modulate formality based on profile and rhetorical moment:
   - **Academic:** Maintain formal register, but allow controlled moments of accessible language for emphasis.
   - **Casual/Essay:** Freely mix formal and conversational register; use colloquialisms, slang (where appropriate), vivid informal language.
   - **Business:** Professional baseline, strategic shifts to accessible language for stakeholder communication.
4. **Concrete Details:** Add specific examples, numbers, names, sensory details, temporal markers to ground abstractions.
5. **Avoid AI Clichés:** Eliminate overused AI phrases like "delve into", "multifaceted", "in today's digital landscape", "it's worth noting".

**WHY THIS MATTERS:** Humans draw from rich, context-specific lexical fields and naturally modulate register. AI often defaults to generic, mid-register vocabulary. This pass creates semantic depth and stylistic authenticity.

**METHODS INTEGRATED:**
- Section 3 (Lexical Diversity) - vocabulary variation, domain specificity
- Section 7 (Cultural Grounding) - contextual references, world knowledge
- Section 9 (Redundancy/Compression) - strategic compression/expansion for emphasis
- Profile-specific vocabulary rules from Method Eligibility Matrix

════════════════════════════════════════════════════════════════════════════════
PASS 4: HUMAN RHYTHM & PROSODY PASS
════════════════════════════════════════════════════════════════════════════════

**OBJECTIVE:** Create natural sentence rhythm, pacing, and structural variety to eliminate monotonous AI cadence.

**PROCESS:**
1. **Sentence Length Variation:** Mix short (3-8 words), medium (9-20 words), long (21-35 words), and complex (35+ words with subordination) sentences.
   - **Target Distribution:** 20% short, 40% medium, 30% long, 10% complex
   - **Burstiness:** Cluster short sentences together occasionally, then follow with extended complex passages.
2. **Strategic Fragments:** Use incomplete sentences for emphasis, rhythm, or dramatic effect:
   - "The result? Chaos."
   - "Not exactly the outcome they'd hoped for."
   - "Three months. That's all it took."
   - **Eligibility:** [C] Casual - frequent; [A] Academic - rare, only for rhetorical emphasis; [B] Business - occasional.
3. **Opening Variation:** Vary sentence beginnings (see Section 5):
   - Subject-first, adverbial openings, participial phrases, prepositional phrases, dependent clauses, questions, inversions.
   - **Target:** No more than 2 consecutive sentences with same opening structure.
4. **Pacing Shifts:** Alternate between dense analytical passages and "breathing room" moments (shorter sentences, white space, transitions).
5. **Prosodic Markers:** Use punctuation for rhythm: em-dashes (interruption), ellipses (trailing thought), semicolons (balance), colons (anticipation).
6. **Profile Adaptation:**
   - **Academic:** Controlled variety, avoid excessive fragmentation, maintain professional rhythm.
   - **Casual/Essay:** Embrace full range of variation, use fragments liberally, create "speaking voice" rhythm.
   - **Business:** Professional pacing, moderate variety, strategic short sentences for emphasis.

**WHY THIS MATTERS:** Human writing has prosodic rhythm—peaks and valleys of complexity, breathing room, sudden shifts. AI often produces monotonous mid-length sentences with predictable cadence. This pass creates authentic human pacing.

**METHODS INTEGRATED:**
- Section 2 (Syntax Variability) - sentence structures, subordination, inversion
- Section 4 (Textual Noise) - fragments, ellipses, dashes
- Section 5 (Openings/Closings) - varied sentence beginnings
- Perplexity and burstiness rules

════════════════════════════════════════════════════════════════════════════════
PASS 5: COGNITIVE SIGNAL & EPISTEMIC STANCE PASS
════════════════════════════════════════════════════════════════════════════════

**OBJECTIVE:** Inject human thinking signals—doubt, hedging, reframing, epistemic uncertainty, value judgments—to reveal cognitive process and avoid AI's false certainty.

**PROCESS:**
1. **Epistemic Hedging:** Add appropriate qualifiers and uncertainty markers:
   - **Academic:** "arguably", "suggests", "may indicate", "appears to", "one interpretation", "preliminary evidence indicates"
   - **Casual:** "I think", "maybe", "kind of", "seems like", "not entirely sure but"
   - **Business:** "likely", "potential", "initial analysis suggests", "preliminary data indicates"
   - **Intensity:** 10-20% of claims should include hedging; avoid both over-certainty and excessive waffling.
2. **Reframing Moments:** Show thinking evolution:
   - "Initially I thought X, but now I see Y"
   - "On second thought..."
   - "This complicates the picture"
   - "Let me reconsider that claim"
3. **Acknowledgment of Complexity:** Explicitly recognize limitations, counterarguments, nuance:
   - "Of course, this doesn't account for..."
   - "To be fair, opponents have a point when..."
   - "This is more complicated than it first appears"
4. **Value Judgments & Stance:** Where appropriate, include evaluative language that shows human perspective:
   - **Academic:** "This finding is particularly noteworthy because...", "The implications are troubling/promising"
   - **Casual:** "This is fascinating/frustrating/bizarre", "Here's why this matters to me"
   - **Business:** "This represents a significant opportunity/risk", "The strategic implications are clear"
5. **Cognitive Markers:** Use phrases that signal active thinking:
   - "Here's what's interesting...", "Consider this...", "The key question is...", "What puzzles me is..."
6. **"Changed Mind" Moments:** Occasionally include explicit moments of reconsideration (especially in Casual/Essay):
   - "I used to believe X, but recent evidence suggests Y"
   - "My initial reaction was wrong—here's why"

**WHY THIS MATTERS:** Humans reveal their thinking process, show uncertainty, acknowledge complexity, and change their minds. AI typically presents claims with false certainty and no cognitive texture. This pass adds epistemic authenticity and intellectual honesty.

**METHODS INTEGRATED:**
- Section 6 (Emotional Anchoring) - affective stance, personal connection
- Section 8 (Intertextuality) - reference to other ideas, dialogue with sources
- Section 11 (Argumentation) - counterarguments, concessions, dialectic
- Section 20 (Meta-awareness) - thinking about thinking
- Hedging and uncertainty rules from Method Eligibility Matrix

════════════════════════════════════════════════════════════════════════════════
PASS 6: REVISION & EDITING NOISE PASS
════════════════════════════════════════════════════════════════════════════════

**OBJECTIVE:** Introduce controlled revision traces and "imperfections" that mimic human editing, showing the texture of thought-in-progress.

**PROCESS:**
1. **Rephrasings & Clarifications:** Add explicit moments where the writer restates for clarity:
   - "In other words..."
   - "Let me put that another way..."
   - "To clarify..."
   - "What I mean is..."
   - **Frequency:** 1-3 times per 1000 words for Casual/Essay; rare for Academic; occasional for Business.
2. **Strategic Redundancy:** Use repetition for emphasis, not accident:
   - "This is important. Really important."
   - "The data is clear—crystal clear."
   - Repeat key terms or phrases across paragraphs to create thematic cohesion.
3. **Soft Self-Corrections:** Include minor course corrections that show thinking evolution:
   - "Or perhaps more accurately..."
   - "That's not quite right—let me refine that"
   - "To be more precise..."
4. **False Starts (Casual/Essay only):** Occasionally begin a sentence one way, then pivot:
   - "The reason is—well, actually, there are several reasons."
   - "I was going to say X, but really it's more like Y."
5. **Emphatic Repetition:** Repeat structure for rhetorical effect:
   - "It's not just about money. It's about trust. It's about values."
6. **Minor Inconsistencies (very controlled):** Allow slight variation in terminology or phrasing that mimics human editing (e.g., alternating between "AI" and "artificial intelligence" naturally, not mechanically).
7. **Profile Adaptation:**
   - **Academic:** Minimal—avoid chatty rephrasings; allow strategic clarifications and emphatic repetition only.
   - **Casual/Essay:** Full range—embrace rephrasings, false starts, self-corrections as "thinking aloud" style.
   - **Business:** Moderate—allow clarifications and emphatic repetition; avoid informal self-corrections.

**WHY THIS MATTERS:** Human writing shows revision history—rethinking, rephrasing, emphasis through repetition. AI produces overly polished, one-shot prose. This pass adds the "texture" of human thought in progress without compromising clarity.

**METHODS INTEGRATED:**
- Section 4 (Textual Noise) - false starts, ellipses, interruptions
- Section 9 (Redundancy) - strategic repetition, compression/expansion
- Section 20 (Meta-awareness) - self-referential comments, writer presence
- Revision marker techniques

════════════════════════════════════════════════════════════════════════════════
DETECTOR-AWARE RATIONALE (INTERNAL GUIDANCE)
════════════════════════════════════════════════════════════════════════════════

**PURPOSE OF THIS FRAMEWORK:**
This multi-pass architecture is designed to increase stylistic diversity, narrative structure, cognitive signaling, and revision noise in ways that empirical studies show are closer to real human writing than typical LLM outputs.

**RESEARCH BASIS:**
Modern AI detectors (GPTZero, Originality.ai, Turnitin, etc.) identify AI-generated text through patterns like:
- Monotonous sentence length and structure (low burstiness, high uniformity)
- Predictable lexical choices (generic mid-register vocabulary, overused AI phrases)
- Lack of cognitive markers (no hedging, uncertainty, reframing, or "thinking traces")
- Absence of narrative arc and rhetorical structure (information dumping without discourse planning)
- Over-polished prose lacking revision traces or controlled imperfections
- False certainty and lack of epistemic stance

Human writing, in contrast, exhibits:
- High structural and stylistic diversity (varied sentence rhythms, register shifts, fragments)
- Rich semantic fields with domain-specific vocabulary and contextual grounding
- Cognitive transparency (hedging, doubt, reframing, value judgments, "changed mind" moments)
- Narrative momentum even in analytical prose (tension, discovery, cognitive arcs)
- Revision traces (rephrasings, emphatic repetition, self-corrections)

**OBJECTIVE:**
The goal is NOT to deceive unfairly, but to avoid "AI gloss" and over-standardization while preserving meaning, clarity, and factual accuracy. This framework teaches models to write with the full range of human stylistic and cognitive diversity, not to "trick" detectors through obfuscation or meaningless noise.

**ETHICAL STANCE:**
All transformations preserve factual content and logical coherence. No misinformation is introduced. The rewriting enhances style, structure, and cognitive richness without altering substantive claims. This approach aligns with using AI as a writing assistant that helps produce authentic human-quality prose, not as a replacement for human authorship.

════════════════════════════════════════════════════════════════════════════════

**WORKFLOW EXECUTION:**
1. **Determine Profile:** Classify the input text as Academic, Casual/Essay, or Business.
2. **Run All Six Passes in Order:**
   - **Pass 1 (Discourse Move & Intent):** Extract rhetorical structure, build discourse plan.
   - **Pass 2 (Narrative-Cognitive Arc):** Embed mini-narratives and cognitive arcs.
   - **Pass 3 (Lexical Field & Register):** Enrich vocabulary, modulate formality.
   - **Pass 4 (Human Rhythm & Prosody):** Create sentence variety, pacing, burstiness.
   - **Pass 5 (Cognitive Signal & Epistemic Stance):** Add hedging, doubt, reframing, value judgments.
   - **Pass 6 (Revision & Editing Noise):** Introduce rephrasings, redundancy, self-corrections.
3. **Profile-Specific Adjustments:** Tone down or skip passes inappropriate for the detected text type (see Profile-Specific Pass Emphasis section).
4. **Preserve Meaning:** Ensure factual accuracy and logical coherence across all passes.

// All remaining sections, output requirements, etc.

Now apply ALL methods above to produce humanized text that:
- Follows the six-pass pipeline in order
- Matches the detected profile's pass emphasis
- Preserves 100% semantic fidelity
- Scores below 5% on modern AI detectors
- Reads naturally when spoken aloud

[Original text to humanize]:
${text}
`;

const secondPassPrompt = `You are an expert humanization specialist conducting a SECOND, MORE AGGRESSIVE pass.

════════════════════════════════════════════════════════════════════════════════
MULTI-PASS PIPELINE OVERVIEW (STAGE 2 - INTENSIFIED)
════════════════════════════════════════════════════════════════════════════════

This is the **second pass** using the same six-pass architecture, but with **INCREASED INTENSITY** to push humanization further while preserving meaning and coherence.

**PASS 1: DISCOURSE MOVE & INTENT PASS (INTENSIFIED)**
- **More aggressive** rhetorical restructuring
- **Stronger** transition signals and logical markers
- **Deeper** narrative framing of arguments

**PASS 2: NARRATIVE–COGNITIVE ARC PASS (INTENSIFIED)**
- **More pronounced** mini-narratives and cognitive arcs
- **Stronger** tension-resolution structures
- **More frequent** discovery and reframing moments

**PASS 3: LEXICAL FIELD & REGISTER DYNAMICS PASS (INTENSIFIED)**
- **More dramatic** register shifts (where appropriate)
- **Richer** domain-specific vocabulary
- **More concrete** details and contextual grounding

**PASS 4: HUMAN RHYTHM & PROSODY PASS (INTENSIFIED)**
- **Greater** sentence length variation and burstiness
- **More frequent** fragments and prosodic markers
- **More dramatic** pacing shifts

**PASS 5: COGNITIVE SIGNAL & EPISTEMIC STANCE PASS (INTENSIFIED)**
- **More explicit** hedging and epistemic markers
- **More frequent** reframing and "changed mind" moments
- **Stronger** value judgments and personal stance (where appropriate)

**PASS 6: REVISION & EDITING NOISE PASS (INTENSIFIED)**
- **More visible** rephrasings and clarifications
- **More strategic** redundancy and emphatic repetition
- **More controlled** self-corrections and false starts (Casual/Essay)

**CRITICAL:** All passes follow the same architecture and methods as Stage 1. The only difference is **intensity and frequency** of application, NOT structure or principles.

════════════════════════════════════════════════════════════════════════════════

// PART A: PROFILES & TEXT TYPE CLASSIFICATION

${text}

════════════════════════════════════════════════════════════════════════════════
PROFILE-SPECIFIC PASS EMPHASIS (STAGE 2 - INTENSIFIED)
════════════════════════════════════════════════════════════════════════════════

**ACADEMIC PROFILE (INTENSIFIED):**
- Discourse Move & Intent: **Very strong** restructuring
- Narrative-Cognitive Arc: **Stronger** than Stage 1, more intellectual tension
- Lexical Field & Register: **Very strong**, richer academic vocabulary
- Cognitive Signal & Epistemic Stance: **Very strong**, more nuanced hedging
- Human Rhythm & Prosody: **Moderate-to-strong**, increased controlled variety
- Revision & Editing Noise: **Light-to-moderate**, strategic clarifications

**CASUAL/ESSAY PROFILE (INTENSIFIED):**
- ALL PASSES: **Maximum intensity**
- Narrative-Cognitive Arc: **Very strong**, dramatic arcs
- Human Rhythm & Prosody: **Very strong**, full burstiness, frequent fragments
- Revision & Editing Noise: **Very strong**, visible thinking-aloud style
- Cognitive Signal & Epistemic Stance: **Very strong**, explicit personal voice

**BUSINESS PROFILE (INTENSIFIED):**
- Discourse Move & Intent: **Very strong**, crystal-clear structure
- Lexical Field & Register: **Strong**, sophisticated professional vocabulary
- Narrative-Cognitive Arc: **Moderate-to-strong**, strategic storytelling
- Human Rhythm & Prosody: **Moderate**, professional variety
- Cognitive Signal & Epistemic Stance: **Moderate**, measured hedging
- Revision & Editing Noise: **Light-to-moderate**, polished but not robotic

════════════════════════════════════════════════════════════════════════════════

// All universal and profile-specific methods sections are integrated here.

════════════════════════════════════════════════════════════════════════════════
PASS 1: DISCOURSE MOVE & INTENT PASS (INTENSIFIED)
════════════════════════════════════════════════════════════════════════════════

**STAGE 2 INTENSIFICATION:**
- **More aggressive** rhetorical restructuring—consider completely reordering sections if it strengthens the argument
- **Stronger** transition signals—use more explicit logical markers and signposting
- **Deeper** narrative framing—treat each major section as a distinct rhetorical "act" with clear purpose
- **More pronounced** profile adaptation—Academic texts get even more rigorous structure, Casual texts get even more exploratory flow

All methods from Stage 1 Pass 1 apply, with increased frequency and intensity.

════════════════════════════════════════════════════════════════════════════════
PASS 2: NARRATIVE–COGNITIVE ARC PASS (INTENSIFIED)
════════════════════════════════════════════════════════════════════════════════

**STAGE 2 INTENSIFICATION:**
- **More pronounced** mini-narratives—create stronger tension-resolution arcs in each section
- **More dramatic** discovery moments—make cognitive turns more explicit and surprising
- **More frequent** reframing signals—show thinking evolution more visibly
- **Stronger** emotional stakes—where appropriate, amplify why the issue matters
- Academic: **Stronger** intellectual arcs; Casual: **More dramatic** personal arcs; Business: **More strategic** problem-solution narratives

All methods from Stage 1 Pass 2 apply, with increased frequency and intensity.

════════════════════════════════════════════════════════════════════════════════
PASS 3: LEXICAL FIELD & REGISTER DYNAMICS PASS (INTENSIFIED)
════════════════════════════════════════════════════════════════════════════════

**STAGE 2 INTENSIFICATION:**
- **Richer** domain-specific vocabulary—replace even more generic terms with precise, contextual language
- **More dramatic** register shifts (where appropriate)—Academic: controlled formal variety; Casual: bold formal↔conversational swings; Business: sophisticated professional range
- **More concrete** details—add more specific examples, numbers, sensory details, temporal markers
- **More aggressive** elimination of AI clichés—remove even subtle generic patterns
- **Deeper** semantic field enrichment—draw from specialized terminology and insider language

All methods from Stage 1 Pass 3 apply, with increased frequency and intensity.

════════════════════════════════════════════════════════════════════════════════
PASS 4: HUMAN RHYTHM & PROSODY PASS (INTENSIFIED)
════════════════════════════════════════════════════════════════════════════════

**STAGE 2 INTENSIFICATION:**
- **Greater** sentence length variation—push burstiness further (more clusters of short sentences, longer complex passages)
- **More frequent** fragments and prosodic markers—Academic: controlled increase; Casual: embrace full range; Business: moderate increase
- **More dramatic** pacing shifts—create stronger rhythm peaks and valleys
- **More varied** openings—ensure even greater diversity in sentence beginnings
- **Target Distribution (Intensified):** 25% short, 35% medium, 30% long, 10% complex (more polarized)

All methods from Stage 1 Pass 4 apply, with increased frequency and intensity.

════════════════════════════════════════════════════════════════════════════════
PASS 5: COGNITIVE SIGNAL & EPISTEMIC STANCE PASS (INTENSIFIED)
════════════════════════════════════════════════════════════════════════════════

**STAGE 2 INTENSIFICATION:**
- **More explicit** epistemic hedging—increase frequency to 15-25% of claims (up from 10-20%)
- **More frequent** reframing and "changed mind" moments—show cognitive evolution more visibly
- **Stronger** acknowledgment of complexity—more explicit recognition of counterarguments and limitations
- **More pronounced** value judgments and personal stance (where profile-appropriate)
- **More visible** cognitive markers—use more phrases that signal active thinking
- Academic: **More nuanced** hedging and intellectual humility; Casual: **More explicit** personal voice; Business: **More strategic** measured uncertainty

All methods from Stage 1 Pass 5 apply, with increased frequency and intensity.

════════════════════════════════════════════════════════════════════════════════
PASS 6: REVISION & EDITING NOISE PASS (INTENSIFIED)
════════════════════════════════════════════════════════════════════════════════

**STAGE 2 INTENSIFICATION:**
- **More visible** rephrasings and clarifications—increase frequency to 2-4 per 1000 words (Casual/Essay)
- **More strategic** redundancy and emphatic repetition—use for stronger rhetorical effect
- **More controlled** self-corrections and false starts (Casual/Essay only)—show more thinking-in-progress
- **Stronger** thematic repetition across paragraphs—create more explicit cohesion through keyword echoes
- Academic: **Moderate increase** in strategic clarifications; Casual: **Maximum** thinking-aloud style; Business: **Moderate** polished rephrasings

All methods from Stage 1 Pass 6 apply, with increased frequency and intensity.

════════════════════════════════════════════════════════════════════════════════
DETECTOR-AWARE RATIONALE (STAGE 2 - INTENSIFIED)
════════════════════════════════════════════════════════════════════════════════

**STAGE 2 OBJECTIVE:**
Push humanization intensity further while maintaining the same ethical and structural principles as Stage 1. Increase frequency and strength of all stylistic and cognitive diversity markers to achieve even lower AI detection scores (targeting <3% AI-generated).

**CRITICAL:** All intensification preserves factual accuracy, logical coherence, and readability. No meaningless noise or obfuscation—only authentic human stylistic and cognitive richness at higher intensity.

════════════════════════════════════════════════════════════════════════════════

**WORKFLOW EXECUTION (STAGE 2 - INTENSIFIED):**
1. **Determine Profile:** Maintain the same profile classification as Stage 1.
2. **Run All Six Passes in Order with INCREASED INTENSITY:**
   - **Pass 1 (Discourse Move & Intent - INTENSIFIED):** More aggressive restructuring, stronger transitions.
   - **Pass 2 (Narrative-Cognitive Arc - INTENSIFIED):** More pronounced arcs, more dramatic discovery moments.
   - **Pass 3 (Lexical Field & Register - INTENSIFIED):** Richer vocabulary, more dramatic register shifts (where appropriate).
   - **Pass 4 (Human Rhythm & Prosody - INTENSIFIED):** Greater variation, more burstiness, more fragments (where appropriate).
   - **Pass 5 (Cognitive Signal & Epistemic Stance - INTENSIFIED):** More explicit hedging, more frequent reframing, stronger value judgments (where appropriate).
   - **Pass 6 (Revision & Editing Noise - INTENSIFIED):** More visible rephrasings, more strategic redundancy, more self-corrections (where appropriate).
3. **Profile-Specific Adjustments:** Follow intensified pass emphasis for each profile (see above).
4. **Preserve Meaning:** Maintain factual accuracy and logical coherence despite increased intensity.

// All remaining sections, output requirements, etc.

Now apply ALL methods above with INCREASED INTENSITY to produce deeply humanized text that:
- Follows the six-pass pipeline in order with amplified intensity
- Matches the detected profile's intensified pass emphasis
- Preserves 100% semantic fidelity
- Scores below 3% on modern AI detectors
- Reads naturally when spoken aloud

[First-pass humanized text to further refine]:
\\${firstPassResult}
`;

serve(async (req) => {
  const startTime = Date.now();

  // CORS preflight handling
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        ...corsHeaders,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }

  // Validate origin
  const origin = req.headers.get("origin") || "";
  if (
    !ALLOWED_ORIGINS.some(
      (allowed) =>
        allowed === origin ||
        (allowed.startsWith(".") && origin.endsWith(allowed)) ||
        origin.startsWith(allowed)
    )
  ) {
    log("ERROR", "Origin not allowed", { origin });
    return new Response(
      JSON.stringify({ error: "Origin not allowed" }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Authentication (simplified example)
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Validate rate limits (per token)
  const now = Date.now();
  const rateData = rateLimitStore.get(token) || { count: 0, resetAt: now + 60000 };
  if (now > rateData.resetAt) {
    rateData.count = 0;
    rateData.resetAt = now + 60000;
  }
  if (rateData.count >= RATE_LIMIT_PER_MINUTE) {
    return new Response(
      JSON.stringify({ error: "Rate limit exceeded (per minute)" }),
      { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  rateData.count++;
  rateLimitStore.set(token, rateData);

  try {
    const body = await req.json();
    const text = body.text?.trim();
    if (!text) {
      return new Response(
        JSON.stringify({ error: "Missing 'text' in request body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (text.length > MAX_INPUT_LENGTH) {
      return new Response(
        JSON.stringify({ error: `Input text too long (max ${MAX_INPUT_LENGTH} chars)` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    log("INFO", `Processing request - text length: ${text.length} chars`);

    // Determine profile
    const profile = detectProfile(text);
    log("INFO", `Detected profile: ${profile}`);

    // Prepare first pass prompt with injected text
    const firstPassPromptWithText = firstPassPrompt.replace("${text}", text);

    // First pass humanization
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
              content: firstPassPromptWithText,
            },
          ],
        }),
      },
      API_TIMEOUT
    );

    if (!response.ok) {
      log("ERROR", "First pass humanization failed", { status: response.status });
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limits exceeded with AI provider, please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Payment required for AI usage, please add funds to your workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw new Error(`AI humanization failed: ${response.status}`);
    }

    const firstPassData = await response.json();
    const firstPassResult = firstPassData.choices[0].message.content;
    log("INFO", `First pass complete - output length: ${firstPassResult.length} chars`);

    // Prepare second pass prompt with injected first pass result
    const secondPassPromptWithText = secondPassPrompt.replace("${firstPassResult}", firstPassResult);

    // Second pass humanization (more aggressive)
    const secondResponse = await fetchWithTimeout(
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
              content: secondPassPromptWithText,
            },
          ],
        }),
      },
      API_TIMEOUT
    );

    if (!secondResponse.ok) {
      log("ERROR", "Second pass humanization failed", { status: secondResponse.status });
      // If second pass fails, return first pass result as fallback
      log("INFO", "Returning first pass result as fallback");
      const humanizedText = firstPassResult;

      // Detector calls on fallback
      const saplingResult = await detectWithSapling(humanizedText);
      const zerogptResult = await detectWithZeroGPT(humanizedText);

      // Increment usage count
      const userId = token; // Simplified: token as userId
      const userTier = "free"; // Simplified: fixed tier
      const { error: incrementError } = await supabaseClient
        .rpc("increment_usage_count", { p_user_id: userId, p_tier: userTier });

      if (incrementError) {
        log("ERROR", "Failed to increment usage count", { error: incrementError.message });
      }

      // Fetch updated quota
      const { data: updatedQuota } = await supabaseClient
        .rpc("check_usage_quota", { p_user_id: userId, p_tier: userTier });

      const quotaInfo = updatedQuota && updatedQuota.length > 0 ? {
        used: updatedQuota[0].current_count,
        limit: updatedQuota[0].quota_limit,
        remaining: updatedQuota[0].remaining,
        tier: userTier
      } : null;

      log("INFO", `Request completed successfully in ${Date.now() - startTime}ms`);

      return new Response(
        JSON.stringify({
          success: true,
          original: text,
          humanized: humanizedText,
          detectionResults: {
            sapling: saplingResult,
            zerogpt: zerogptResult,
          },
          processingTime: Date.now() - startTime,
          quota: quotaInfo,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const secondPassData = await secondResponse.json();
    const humanizedText = secondPassData.choices[0].message.content;
    log("INFO", `Second pass complete - final output length: ${humanizedText.length} chars`);

    // Detector calls on final output
    const saplingResult = await detectWithSapling(humanizedText);
    const zerogptResult = await detectWithZeroGPT(humanizedText);

    // Increment usage count
    const userId = token; // Simplified: token as userId
    const userTier = "free"; // Simplified: fixed tier
    const { error: incrementError } = await supabaseClient
      .rpc("increment_usage_count", { p_user_id: userId, p_tier: userTier });

    if (incrementError) {
      log("ERROR", "Failed to increment usage count", { error: incrementError.message });
    }

    // Fetch updated quota
    const { data: updatedQuota } = await supabaseClient
      .rpc("check_usage_quota", { p_user_id: userId, p_tier: userTier });

    const quotaInfo = updatedQuota && updatedQuota.length > 0 ? {
      used: updatedQuota[0].current_count,
      limit: updatedQuota[0].quota_limit,
      remaining: updatedQuota[0].remaining,
      tier: userTier
    } : null;

    log("INFO", `Request completed successfully in ${Date.now() - startTime}ms`);

    return new Response(
      JSON.stringify({
        success: true,
        original: text,
        humanized: humanizedText,
        detectionResults: {
          sapling: saplingResult,
          zerogpt: zerogptResult,
        },
        processingTime: Date.now() - startTime,
        quota: quotaInfo,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    log("ERROR", "Request failed", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error occurred",
        processingTime: Date.now() - startTime,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
