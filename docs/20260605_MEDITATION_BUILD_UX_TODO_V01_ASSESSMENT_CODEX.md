---
created_at: 2026-06-05
updated_at: 2026-06-05
created_by: codex (gpt-5)
modified_by: codex (gpt-5)
---

# Meditation Build UX TODO V01 Assessment

The TODO is close to implementable, but two concerns should be corrected before implementation begins.

## Required changes

### 1. Fix build-block color sequencing

Phase 5 asks the implementer to build the animation UI, while Phase 6 adds the `buildBlock` Tailwind palette the animation is expected to use. This can confuse implementation order and can produce either unstyled/non-PRD-compliant blocks or a failed Phase 5 web validation if the component uses `bg-buildBlock-*` classes before Tailwind knows about them.

Required TODO change:

- Move the `web/tailwind.config.js` `colors.buildBlock.*` task from Phase 6 into Phase 5 before the animation UI task, or create a small prerequisite styling phase before Phase 5.
- Add an explicit Phase 5 task that the Text, Pause, and Sound File blocks use the fixed `buildBlock` colors from the PRD.
- Leave the `maxWidth.app` and container widening tasks in Phase 6.

### 2. Clarify the backfill script path helper

Phase 3 says to resolve each file path using the "existing prerecorded-audio path helper," but there is no script-local helper today. The available helpers live under `api/src/lib/projectPaths.ts` and `worker-node/src/lib/projectPaths.ts`; importing either from a root one-shot script would couple the script to service-specific env readers and could make `npm run typecheck:scripts` or runtime behavior fail for reasons unrelated to the backfill.

Required TODO change:

- Replace the vague helper instruction with a concrete implementation direction for scripts, such as: read `PATH_PROJECT_RESOURCES` from `process.env`, require it to be set, and resolve files with `path.join(PATH_PROJECT_RESOURCES, "prerecorded_audio", soundFile.filename)`.
- Alternatively, add a shared script-safe project-resource helper first and instruct the backfill to use that helper.
- Keep the no-hard-coded-production-path requirement.
