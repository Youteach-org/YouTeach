function normalizeGroupName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function compactGroupCode(value) {
  const tokens = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean);

  if (!tokens.length) return "";
  if (tokens.length === 1) {
    const token = tokens[0];
    if (token.length <= 3 || /\d/.test(token)) return token.slice(0, 6);
    return token.slice(0, 3);
  }

  const withDigit = tokens.find((token) => /\d/.test(token));
  if (withDigit) return withDigit.slice(0, 6);
  return tokens.map((token) => token[0]).join("").slice(0, 4);
}

function groupIdentityValues(groups, groupName) {
  const target = normalizeGroupName(groupName);
  const identities = new Set(target ? [target] : []);

  Object.entries(groups || {}).forEach(([key, group]) => {
    const values = [key, group?.name, group?.groupName]
      .map(normalizeGroupName)
      .filter(Boolean);
    if (values.includes(target)) {
      values.forEach((value) => identities.add(value));
    }
  });

  return [...identities];
}

function groupAliases(groups, workingGroup) {
  return new Set(groupIdentityValues(groups, workingGroup));
}

function legacyGroupSubjectSignature(value) {
  const genericTokens = new Set([
    "group",
    "grupo",
    "class",
    "clase",
    "section",
    "seccion"
  ]);
  const tokens = normalizeGroupName(value)
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .filter((token) => !/\d/.test(token))
    .filter((token) => !genericTokens.has(token));

  const signature = tokens.join(" ").trim();
  return signature.replace(/\s+/g, "").length >= 6 ? signature : "";
}

function uniquelyMatchesLegacyGroupName(storedGroup, workingGroup, groups) {
  const signature = legacyGroupSubjectSignature(storedGroup);
  if (!signature) return false;

  const activeIdentities = new Set(groupIdentityValues(groups, workingGroup));
  if (!activeIdentities.size) return false;

  const matchingGroupKeys = Object.entries(groups || {})
    .filter(([key, group]) =>
      [key, group?.name, group?.groupName]
        .map(legacyGroupSubjectSignature)
        .filter(Boolean)
        .includes(signature)
    )
    .map(([key]) => key);

  if (matchingGroupKeys.length !== 1) return false;

  const matchedKey = matchingGroupKeys[0];
  const matchedIdentities = groupIdentityValues(groups, matchedKey);
  return matchedIdentities.some((identity) => activeIdentities.has(identity));
}

export function submissionGroupNames(submissions = {}) {
  return [...new Set(
    Object.values(submissions || {})
      .map((submission) => String(submission?.groupName || "").trim())
      .filter(Boolean)
  )];
}

export function assignmentMatchesGroupEvidence({
  assignment = {},
  submissions = {},
  workingGroup = "",
  groups = {}
} = {}) {
  const active = String(workingGroup || "").trim();
  if (!active) return true;

  const aliases = groupAliases(groups, active);
  const storedGroup = String(assignment?.groupName || "ALL").trim();
  if (!storedGroup || storedGroup.toUpperCase() === "ALL") return true;
  if (aliases.has(normalizeGroupName(storedGroup))) return true;
  if (uniquelyMatchesLegacyGroupName(storedGroup, active, groups)) return true;

  return submissionGroupNames(submissions)
    .some((groupName) =>
      aliases.has(normalizeGroupName(groupName)) ||
      uniquelyMatchesLegacyGroupName(groupName, active, groups)
    );
}

function uniqueNonEmpty(values, normalize = (value) => String(value || "").trim()) {
  const map = new Map();
  values.forEach((value) => {
    const raw = String(value || "").trim();
    if (!raw) return;
    const key = normalize(raw);
    if (!map.has(key)) map.set(key, raw);
  });
  return [...map.values()];
}

function taskCodeGroupPart(code) {
  const parts = String(code || "").trim().toUpperCase().split("-").filter(Boolean);
  if (parts.length < 4) return "";
  const penultimate = parts.at(-2) || "";
  if (/^T(?:MS|\d+)$/.test(penultimate) && parts.length >= 5) {
    return parts.at(-3) || "";
  }
  return penultimate;
}

function groupFromTaskCode(code, groups, submissionGroups) {
  const groupPart = taskCodeGroupPart(code);
  if (!groupPart) return "";
  if (groupPart === "ALL") return "ALL";

  const matches = [];
  Object.entries(groups || {}).forEach(([key, group]) => {
    const names = [key, group?.name, group?.groupName]
      .map((value) => String(value || "").trim())
      .filter(Boolean);
    if (names.some((name) => compactGroupCode(name) === groupPart)) {
      matches.push(key);
    }
  });

  const uniqueMatches = [...new Set(matches)];
  if (uniqueMatches.length === 1) return uniqueMatches[0];

  const normalizedSubmissionGroups = uniqueNonEmpty(
    submissionGroups,
    normalizeGroupName
  );
  if (normalizedSubmissionGroups.length !== 1) return "";

  const submissionGroup = normalizedSubmissionGroups[0];
  if (compactGroupCode(submissionGroup) !== groupPart) return "";

  const exactKey = Object.keys(groups || {}).find(
    (key) => normalizeGroupName(key) === normalizeGroupName(submissionGroup)
  );
  return exactKey || submissionGroup;
}

function earliestSubmissionTime(rows) {
  const times = rows
    .flatMap((submission) => [
      Number(submission?.submittedAt || 0),
      Number(submission?.uploadedAt || 0),
      Number(submission?.updatedAt || 0)
    ])
    .filter((value) => Number.isFinite(value) && value > 0);
  return times.length ? Math.min(...times) : 0;
}

export function buildRecoveredAssignmentFromSubmissions({
  assignmentId = "",
  submissions = {},
  groups = {},
  recoveredAt = Date.now(),
  recoveredBy = ""
} = {}) {
  const rows = Object.values(submissions || {}).filter(Boolean);
  if (!assignmentId || !rows.length) return null;

  const codes = uniqueNonEmpty(
    rows.map((submission) => submission?.assignmentCode),
    (value) => String(value || "").trim().toUpperCase()
  );
  const titles = uniqueNonEmpty(
    rows.map((submission) => submission?.assignmentTitle),
    (value) => String(value || "").trim().toLocaleLowerCase()
  );
  if (codes.length !== 1 || titles.length !== 1) return null;

  const code = String(codes[0] || "").trim().toUpperCase();
  const title = String(titles[0] || "").trim();
  const historicalGroups = submissionGroupNames(submissions);
  const groupName = groupFromTaskCode(code, groups, historicalGroups);
  if (!groupName) return null;

  const assignmentTypeCode = String(code.split("-")[0] || "").trim().toUpperCase();
  const createdAt = earliestSubmissionTime(rows) || Number(recoveredAt || Date.now());

  return {
    code,
    title,
    instructions: "Recovered from existing YouTeach submission records. Review the assignment to restore any missing original instructions.",
    assignmentType: assignmentTypeCode || "Recovered",
    assignmentTypeCode,
    groupName,
    dueAt: 0,
    active: false,
    storageProvider: "google-drive",
    createdAt,
    createdBy: recoveredBy || "YouTeach recovery",
    recoveredFromSubmissionHistory: true,
    recoveredAssignmentId: String(assignmentId),
    recoveredAt: Number(recoveredAt || Date.now()),
    recoveredBy: recoveredBy || "YouTeach recovery",
    recoverySourceGroups: historicalGroups,
    evaluationTargetNeedsReview: true
  };
}
