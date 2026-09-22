# Oral Exam Gemini Cloud Runner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Run Stage 1 of the oral-exam workflow in the cloud with Gemini 3.5 Transcribe, using verbatim mode, speaker diarization, and word timestamps, without local-PC software or Creative Claw.

**Architecture:** The original OGG remains outside GitHub. A short-lived authenticated source URL is passed to a GitHub Actions run. The runner downloads the audio, calls Gemini 3.5 Transcribe, validates the result, and commits only the Stage-1 transcript to GitHub.

**Tech Stack:** GitHub Actions, Python 3.12, `google-genai`, Gemini 3.5 Transcribe.

**Spec:** `docs/superpowers/specs/2026-09-22-oral-exam-gemini-transcription-pronunciation.md`

## Global Constraints

- Use the original audio as the evidence source.
- Use Gemini, not Whisper, ElevenLabs, OpenPronounce, Wav2Vec2, or Creative Claw.
- Transcription mode must be `verbatim`.
- Keep diarization and word timestamps.
- Do not perform pronunciation scoring or intended-word correction in Stage 1.
- Do not commit raw student audio to GitHub.

## Review Focus

- Missing Gemini secret must fail explicitly without falling back to another engine.
- Issue input must reject unsafe pair slugs.
- Empty/no-annotation Gemini output must not be committed.
- Speaker labels must remain Gemini diarization labels at Stage 1; no invented identity mapping.
- Raw audio must remain outside Git history.

---

### Task 1: Verbatim transcription script

**Files:**
- Create: `tools/oral-exam/gemini_transcribe.py`
- Create: `tests/test_gemini_transcribe.py`

**Interfaces:**
- Consumes: local audio path and Gemini API credential.
- Produces: Stage-1 JSON and Markdown with full text, word annotations, and grouped speaker turns.

- [x] Write tests for verbatim configuration, annotation extraction, speaker grouping, and Stage-1 labeling.
- [x] Run the tests and verify they fail before implementation.
- [x] Implement the transcription helpers and live Gemini call.
- [x] Run the tests and verify they pass.

### Task 2: GitHub Actions runner

**Files:**
- Create: `.github/workflows/oral-exam-gemini-transcribe.yml`

**Interfaces:**
- Consumes: temporary authenticated audio URL, pair slug, and `GEMINI_API_KEY` or `GOOGLE_API_KEY` Actions secret.
- Produces: committed `docs/oral-exam-transcripts/<pair>-stage1.json` and `.md`.

- [x] Add manual and issue-triggered execution paths.
- [x] Fail explicitly when Gemini credentials are absent.
- [x] Download the source audio without storing it in Git history.
- [x] Run and validate Gemini Stage 1 before commit.
- [x] Report success/failure on the triggering issue.
