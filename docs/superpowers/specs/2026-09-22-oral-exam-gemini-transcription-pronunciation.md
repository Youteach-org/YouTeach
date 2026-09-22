# Oral Exam Literal Transcription and Pronunciation Workflow

Date: 2026-09-22  
Repository: `Youteach-org/YouTeach`  
Status: active / canonical handoff  
Scope: E6C Level 6 oral-exam recordings and pair-evaluation PDFs

## 1. Continuity decision

This document supersedes the previous experimental local-PC transcription/alignment workflow for the oral exam.

Canonical decision:

- Do **not** continue the previous local-PC transcription software pipeline.
- Do **not** treat v0.11, v0.12, Whisper alignment output, OpenPronounce output, Wav2Vec2 output, or any normalized transcript as the source transcript.
- Restart transcription **from the original audio recordings**.
- Use a **Gemini model that can consume the audio directly** as the first-pass transcription engine.
- GitHub is the source of truth for this workflow and its future material decisions.
- Superpowers remains enabled for continuity/workflow discipline.

Old experimental artifacts may be retained for audit/reference, but they must **not** seed, correct, normalize, or constrain the new literal transcript.

## 2. Stage 1 — Literal audio transcription with Gemini

Goal: create a transcript that represents only what is actually heard.

### Non-negotiable transcription rules

1. Transcribe **exactly what is heard**.
2. Do **not** correct grammar.
3. Do **not** correct vocabulary.
4. Do **not** silently replace a mispronounced word with the intended/correct English word.
5. Do **not** rewrite malformed words into dictionary forms.
6. Preserve repetitions, false starts, fillers, fragments, hesitations, and self-corrections when audible.
7. Preserve nonstandard forms exactly when they are audible, e.g. forms such as `angrys`, `arbit`, `say me`, or a heard word such as `fires` even when context suggests another intended word.
8. Never use a reference transcript to normalize the audio.
9. Keep speaker identity separate: Teacher, Student A, Student B.
10. Include timestamps or time ranges sufficiently precise to return to the source audio.
11. If audio is genuinely unclear, mark it as unclear/inaudible and keep the timestamp. **Do not guess.**
12. The literal transcript must not contain an `intended` correction inline. Heard content and interpretation are separate stages.

### Required Stage-1 record

For every utterance:

- timestamp / time range;
- speaker;
- literal heard text;
- uncertainty marker only when genuinely necessary.

The Stage-1 transcript is immutable evidence for later analysis. Later interpretation may add fields, but must never overwrite the literal-heard text.

## 3. Stage 2 — Intended-word and pronunciation analysis

Only after the literal transcript is complete do we analyze pronunciation.

For each relevant word or phrase:

1. Start from the literal heard form.
2. Use sentence context and communicative meaning to identify the most likely **intended word**, but store that in a separate field.
3. Only evaluate pronunciation when the intended word is reasonably clear.
4. If intended meaning is ambiguous, mark pronunciation as **uncertain / not scorable from this token** rather than inventing an intended word.
5. Distinguish:
   - pronunciation error;
   - grammar error;
   - vocabulary/word-choice error;
   - malformed/nonstandard form;
   - transcription uncertainty.
6. Do not penalize pronunciation merely because Gemini produced an uncertain token.
7. Do not count a grammar or vocabulary mistake as a pronunciation mistake unless the audio itself demonstrates a pronunciation problem.
8. Judge whether the student's production is intelligible and acceptably realizes the intended English word, not whether the transcript matches a prewritten script character-for-character.

### Suggested analysis fields

- speaker;
- timestamp;
- heard;
- intended;
- pronunciation verdict: `acceptable` / `incorrect` / `uncertain`;
- brief pronunciation note when needed;
- lexical/grammar note separately when relevant.

## 4. Stage 3 — Evaluation PDF for each pair

After the transcript and pronunciation analysis are validated, create **one evaluation PDF per oral-exam pair**.

Each pair PDF should include:

- both students' names;
- the established oral-exam rubric results;
- concise individual comments;
- pronunciation evidence derived from the literal transcript;
- a compact table/list of meaningful pronunciation problems showing `heard -> intended` with timestamp;
- only pronunciation items whose intended word is sufficiently clear;
- teacher interventions where they materially affect Fluency/Interaction scoring;
- the final score out of 40 for each student when that pair has been fully evaluated.

The established rubric remains:

- Fluency — 8
- Coherence & Organization — 8
- Grammar & Vocabulary — 8
- Pronunciation & Intelligibility — 8
- Communicative Interaction — 8
- Total — 40

Existing manual rubric judgments are not discarded merely because transcription is being rebuilt. The new literal-transcription/pronunciation pass is primarily the evidence layer needed to make the pronunciation comments and pair PDFs defensible.

## 5. Acceptance criteria

A pair is ready for final PDF generation only when:

- the original audio has been processed from zero;
- speakers are correctly separated;
- the transcript contains what was heard, not what should have been said;
- unclear audio is explicitly marked instead of guessed;
- intended words are stored separately from heard words;
- pronunciation judgments are limited to tokens with sufficiently clear intent;
- grammar/vocabulary errors are not mislabeled as pronunciation errors;
- each cited pronunciation problem can be located again in the audio by timestamp.

## 6. Current next action

Start with the original audio for the next oral-exam pair and run **Stage 1 only** using Gemini.

Do not score pronunciation and do not generate the final PDF until the literal transcript has been reviewed for fidelity. After Stage 1 is accepted, perform Stage 2, then generate the pair PDF in Stage 3.

## 7. Continuity rule

Any future change to this workflow must be written to GitHub before the session ends. A future ChatGPT/Superpowers instance must read this spec before resuming oral-exam transcription or pronunciation evaluation.


## 8. Execution state — 2026-09-22

- The original Paul/Paulina source recording has been located in the user's ChatGPT Library as `paulina and paul(1).ogg` (audio/ogg, about 1.6 MB).
- This recording is the source to use for the restart. Do not use the old PDF review, v0.13/v0.14/v0.15 pilot outputs, or any prior normalized transcript as transcription input.
- In the current ChatGPT session there is **no Gemini connector and no Gemini/Google GenAI API credential exposed to the agent**. GitHub also contains no existing Gemini integration for this workflow.
- The agent must **not silently substitute ElevenLabs Scribe, Whisper, OpenPronounce, Wav2Vec2, or another transcription engine** for the agreed Gemini Stage 1.
- The native ChatGPT Library file cannot be bound directly to the multimedia processor from its Library file ID; an upload/native attachment binding is required before a media-processing tool can consume it.
- A media picker was opened for the user to bind the original `paulina and paul(1).ogg` recording. This binding step only solves media access; it does not by itself provide Gemini.
- If Gemini access becomes available in a future session (connector, authorized API route, or another explicit Gemini-capable tool), resume with Stage 1 from the original OGG and the literal-transcription rules in this spec.
