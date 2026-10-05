# 2026-10-05 — Historical Assignment group visibility

## Problem

Teacher Assignments could report that stored Assignments existed while showing none for the current working group. The visible Block filter was not the cause. The hidden working-group match rejected older Assignments whose saved group name no longer matched the current group name.

Observed example:
- current working group: `303-2 epidemiologia`
- historical Assignment group naming could be subject-only, e.g. `Epidemiología`

## Changes

1. Assignment group matching now supports a conservative legacy-name bridge:
   - accents/case are normalized;
   - section/number tokens are ignored only for legacy subject matching;
   - automatic matching is allowed only when the subject signature maps to exactly one currently visible group;
   - ambiguous multi-section subjects remain unlinked.

2. When no stored Assignment can be safely linked to the current group, Assignment Browser no longer hides the records behind only an empty-state message.
   - It shows a **Stored assignments outside <group>** review section.
   - Each card exposes its saved group.
   - The teacher may explicitly **Link to <current group>**.
   - Relinking writes audit fields (`groupRelinkedFrom`, `groupRelinkedAt`, `groupRelinkedBy`) and flags the evaluation target for category review.

3. Regression coverage was added for:
   - unique legacy subject-name matching;
   - ambiguity rejection when multiple current sections share the same subject;
   - unrelated-group rejection;
   - the explicit stored-assignment relink fallback.

## Safety

The change does not mass-reassign stored Assignments. Ambiguous historical records require a teacher click before the Assignment group is changed.
