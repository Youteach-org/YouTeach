# 2026-10-13 — Assignment activity color code

## Goal

Make Assignment cards visually distinguishable by activity type without changing the meaning of selection.

## Approved behavior

- All Assignment cards keep the same white base background when not selected.
- The activity type is identified by a narrow accent stripe, the Task Code color, and the Activity Type chip.
- Selecting a card remains the only state that changes the full card background to the existing blue selected state.
- An evaluated Assignment no longer turns the whole card green; evaluation state remains visible through the existing **Evaluated** chip.
- Category containers do not use amber fill for `Needs category review`; unresolved category state is shown as a compact **Review category** chip inside the affected card.

## Activity palette

- Exam family: red.
- Classwork: cyan.
- Homework: amber/orange.
- Project: green.
- Practice / Lab: teal.
- Research: indigo.
- Presentation: pink.
- Portfolio: slate.
- Classroom Participation / Discussion: yellow-gold.
- Teamwork: emerald.
- Classroom Online Game (COG): violet.
- Attendance: teal.
- Other / custom fallback: gray.

## Implementation

- `teacher-assignments.js` derives a stable `activity-<subtype>` CSS class from the canonical `activitySubtype`.
- `teacher-assignments.html` defines the palette with CSS custom properties so background-selection behavior stays independent from activity identity.
- Regression coverage verifies activity classes, selected-card behavior, evaluated-card behavior, and the review-category chip.
