function clean(value) {
  return String(value ?? "").trim();
}

function normalizeTags(value) {
  const source = Array.isArray(value) ? value : String(value ?? "").split(",");
  const seen = new Set();
  return source
    .map((item) => clean(item))
    .filter((item) => {
      const key = item.toLocaleLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function normalizeExamBankMetadata(value = {}) {
  return {
    title: clean(value.title),
    subject: clean(value.subject ?? value.course),
    unit: clean(value.unit),
    topic: clean(value.topic),
    examType: clean(value.examType),
    examDate: clean(value.examDate),
    version: clean(value.version),
    tags: normalizeTags(value.tags)
  };
}

export function buildExamBankEntry({
  id,
  metadata,
  file,
  now = Date.now(),
  actor = ""
} = {}) {
  const entryId = clean(id);
  if (!entryId) throw new Error("Exam Bank entry ID is required.");

  const normalized = normalizeExamBankMetadata(metadata);
  if (!normalized.title) throw new Error("Exam title is required.");

  const driveFileId = clean(file?.id);
  const originalFileName = clean(file?.originalFileName ?? file?.name);
  if (!driveFileId || !originalFileName) {
    throw new Error("Original exam file reference is required.");
  }

  const timestamp = Number(now);
  const safeNow = Number.isFinite(timestamp) ? timestamp : Date.now();
  const teacher = clean(actor);

  return {
    id: entryId,
    schemaVersion: 1,
    ...normalized,
    originalFileName,
    driveFileId,
    driveFileName: clean(file?.name) || originalFileName,
    driveFileUrl: clean(file?.url),
    mimeType: clean(file?.mimeType) || "application/octet-stream",
    size: Math.max(0, Number(file?.size || 0)),
    createdAt: safeNow,
    updatedAt: safeNow,
    createdBy: teacher,
    updatedBy: teacher
  };
}

function exact(value, wanted) {
  const filter = clean(wanted).toLocaleLowerCase();
  if (!filter) return true;
  return clean(value).toLocaleLowerCase() === filter;
}

export function filterExamBankEntries(entries = {}, filters = {}) {
  const source = entries && typeof entries === "object" && !Array.isArray(entries)
    ? entries
    : {};

  const query = clean(filters.query).toLocaleLowerCase();
  const subject = clean(filters.subject);
  const unit = clean(filters.unit);
  const topic = clean(filters.topic);
  const examType = clean(filters.examType);
  const version = clean(filters.version);
  const tag = clean(filters.tag).toLocaleLowerCase();

  return Object.entries(source)
    .filter(([, entry]) => {
      if (!entry || typeof entry !== "object") return false;
      if (!exact(entry.subject, subject)) return false;
      if (!exact(entry.unit, unit)) return false;
      if (!exact(entry.topic, topic)) return false;
      if (!exact(entry.examType, examType)) return false;
      if (!exact(entry.version, version)) return false;

      const tags = Array.isArray(entry.tags) ? entry.tags : [];
      if (tag && !tags.some((item) => clean(item).toLocaleLowerCase() === tag)) {
        return false;
      }

      if (query) {
        const haystack = [
          entry.title,
          entry.subject,
          entry.unit,
          entry.topic,
          entry.examType,
          entry.examDate,
          entry.version,
          entry.originalFileName,
          ...tags
        ].map((item) => clean(item).toLocaleLowerCase()).join(" ");
        if (!haystack.includes(query)) return false;
      }

      return true;
    })
    .sort((a, b) => {
      const dateDifference = Number(b[1]?.updatedAt || 0) - Number(a[1]?.updatedAt || 0);
      if (dateDifference) return dateDifference;
      return clean(a[1]?.title).localeCompare(clean(b[1]?.title));
    });
}
