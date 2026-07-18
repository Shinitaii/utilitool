export const REFUSAL_MESSAGE =
  "I can only help with questions about your utility usage and billing analytics.";

/**
 * Regex-only pre-filter over the final assistant text (defense-in-depth
 * behind the system prompt, not a replacement for it). Cheap, deterministic,
 * and intentionally narrow at this scale — a jailbreak-phrase keyword list,
 * not a semantic classifier. Expected to be revisited as new bypass patterns
 * are observed; this is not meant to be exhaustive.
 */
const JAILBREAK_PATTERNS: RegExp[] = [
  /ignore (all |the )?(previous|prior|above) instructions/i,
  /disregard (all |the )?(previous|prior|above)/i,
  /you are now( a| an)?/i,
  /forget (your|all|previous) (instructions|rules|prompt)/i,
  /reveal (your|the) (system )?prompt/i,
  /what (is|are) your (system )?(prompt|instructions)/i,
  /act as (a|an)(?! utility)/i,
  /pretend (you are|to be)/i,
  /new (persona|role|rule set)/i,
  /override your (restrictions|rules|instructions)/i,
  /jailbreak/i,
];

/**
 * Catches the assistant's own reply disclosing its system prompt, instructions,
 * or internal tool/function names/mechanism — a different failure mode than a
 * user's jailbreak attempt succeeding: this is the model volunteering
 * implementation details in response to an innocuous-sounding meta question
 * ("what tools do you have," "how do you calculate that"). Same caveat as
 * above: a keyword list, not a semantic classifier, not exhaustive.
 */
const DISCLOSURE_PATTERNS: RegExp[] = [
  /get_usage_history|get_accumulated_totals|get_billing_cost|detect_spikes/i,
  /my (system )?(prompt|instructions) (is|are|say)/i,
  /i('m| am) (instructed|told|programmed) to/i,
  /<\/?(role|task|constraints|out_of_scope|examples|output_format)>/i,
  /(my |the )?(internal |underlying )?(tool|function)s? (i have|available to me|i (can |could )?call)/i,
];

export function isFlaggedResponse(text: string): boolean {
  return (
    JAILBREAK_PATTERNS.some((pattern) => pattern.test(text)) ||
    DISCLOSURE_PATTERNS.some((pattern) => pattern.test(text))
  );
}
