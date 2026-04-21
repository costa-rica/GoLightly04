# AGENTS.md

This file provides guidance to agent / engineerc when working with code in this repository.

## Commit Message Guidance

### Guidelines

- Only generate the message for staged files/changes
- Title is lowercase, no period at the end.
- Title should be a clear summary, max 50 characters.
- Use the body to explain _why_ and the main areas changed, not just _what_.
- Bullet points should be concise and high-level.
- Try to use the ideal format. But if the commit is too broad or has too many different types, then use the borad format.
- When committing changes from TODO or task list that is already part of the repo and has phases, make refernce to the file and phase instead of writing a long commit message.
- Add a commit body whenever the staged change is not trivially small.
- A body is expected when the commit:
  - touches more than 3 files
  - touches more than one package or app
  - includes both implementation and tests
  - adds a new route, component, workflow, or integration point
- For broader commits, the title can stay concise, but the body should summarize the main change areas so a reader can understand scope without opening the diff.
- Do not use the body as a file inventory. Summarize the logical changes in 2-5 bullets.

### Format

#### Ideal Format

```
<type>:<space><message title>

<bullet points summarizing what was updated>
```

#### Broad Format

```
<message title>

<bullet points summarizing what was updated>
```

### Body expectations

- Small single-purpose commits may omit the body if the title is fully clear.
- Multi-file or cross-package commits should usually include 2-5 bullets.
- Good body bullets summarize change areas such as:
  - new UI section and status handling
  - new API proxy route and validation
  - added tests for the new route
- If the staged changes span portal, api, and worker code, the body should mention each area that changed.
- include a "co-authored-by:" at the end of the commit, with the ai agent name and model being used.
  - Do not include `<noreply@anthropic.com>`
  - keep it all lower case

#### Types for Ideal Format

| Type     | Description                           |
| -------- | ------------------------------------- |
| feat     | New feature                           |
| fix      | Bug fix                               |
| chore    | Maintenance (e.g., tooling, deps)     |
| docs     | Documentation changes                 |
| refactor | Code restructure (no behavior change) |
| test     | Adding or refactoring tests           |
| style    | Code formatting (no logic change)     |
| perf     | Performance improvements              |
