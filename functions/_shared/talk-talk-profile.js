const VALID_STATES = new Set(["observed", "recurring", "mastered"]);
const VALID_TRENDS = new Set(["stable", "improving", "needs-practice"]);
const SKILL_ID_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;

function count(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.min(1_000_000, Math.floor(n)) : 0;
}

function timestamp(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

function sanitizeContexts(raw) {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const output = {};
  for (const [key, value] of Object.entries(source).slice(0, 30)) {
    const cleanKey = String(key || "").trim().slice(0, 60);
    if (!cleanKey) continue;
    output[cleanKey] = count(value);
  }
  return output;
}

function sanitizeSkill(skillId, raw) {
  if (!SKILL_ID_RE.test(skillId)) throw new Error("Invalid Talk Talk skill id.");
  const state = String(raw?.state || "observed");
  if (!VALID_STATES.has(state)) throw new Error("Invalid Talk Talk skill state.");
  const trend = String(raw?.trend || "stable");
  if (!VALID_TRENDS.has(trend)) throw new Error("Invalid Talk Talk skill trend.");

  return {
    state,
    hits: count(raw?.hits),
    misses: count(raw?.misses),
    transferHits: count(raw?.transferHits),
    regressionMisses: count(raw?.regressionMisses),
    contexts: sanitizeContexts(raw?.contexts),
    lastEvidenceAt: timestamp(raw?.lastEvidenceAt),
    trend
  };
}

export function normalizeTalkTalkProfile(raw, canonicalStudentKey) {
  const studentKey = String(canonicalStudentKey || "").trim();
  if (!studentKey) throw new Error("Canonical Talk Talk student key is required.");

  const skills = {};
  const sourceSkills = raw?.skills && typeof raw.skills === "object" && !Array.isArray(raw.skills)
    ? raw.skills
    : {};

  for (const [rawId, value] of Object.entries(sourceSkills).slice(0, 120)) {
    const skillId = String(rawId || "").trim();
    skills[skillId] = sanitizeSkill(skillId, value);
  }

  const requestedFocus = String(raw?.currentFocus || "").trim();
  const currentFocus = requestedFocus && Object.prototype.hasOwnProperty.call(skills, requestedFocus)
    ? requestedFocus
    : null;

  return {
    schemaVersion: 1,
    studentKey,
    currentFocus,
    skills
  };
}

export function mergeTalkTalkProfile(existing, incoming, canonicalStudentKey) {
  const studentKey = String(canonicalStudentKey || "").trim();
  const oldProfile = normalizeTalkTalkProfile(existing || {}, studentKey);
  const newProfile = normalizeTalkTalkProfile(incoming || {}, studentKey);

  return normalizeTalkTalkProfile({
    currentFocus: newProfile.currentFocus,
    skills: {
      ...oldProfile.skills,
      ...newProfile.skills
    }
  }, studentKey);
}
