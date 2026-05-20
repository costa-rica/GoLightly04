---
created_at: 2026-05-17
updated_at: 2026-05-17
created_by: claude (opus-4.7)
modified_by: claude (opus-4.7)
---



# Node.js Logging Requirements V08

## Overview

This document specifies logging requirements for Node.js applications using Winston with daily-rotated log files. These requirements apply to standard Node.js applications.

- Next.js applications will have a separate logging requirements.

## Pre-Implementation: Console Statement Migration

**IMPORTANT: This step is for human developers only, NOT for AI agents.**

Before implementing Winston logging, manually search and replace all console statements:

| Search          | Replace        |
| --------------- | -------------- |
| `console.log`   | `logger.info`  |
| `console.error` | `logger.error` |
| `console.warn`  | `logger.warn`  |
| `console.info`  | `logger.info`  |
| `console.debug` | `logger.debug` |

**Workflow:**

1. Create a new branch
2. Perform search and replace operations in your IDE
3. Commit changes to the branch
4. Then proceed with AI agent to implement Winston logger

## Logging Modes

### Development Mode

- **Output**: Console only
- **Log Files**: None created
- **Use Case**: Local development

### Testing Mode

- **Output**: Console AND log files (both simultaneously)
- **Log Files**: Daily-rotated files with size cap and retention
- **Use Case**: Automated testing, staging environments

### Production Mode

- **Output**: Log files only
- **Log Files**: Daily-rotated files with size cap and retention
- **Use Case**: Production deployments

## Environment Variables

### Required Variables

**NODE_ENV** (required)

- Values: `development`, `testing`, or `production`
- Determines logging mode

**NAME_APP** (required)

- Application identifier
- Used as the base of the log filename (see "Log File Naming" below)

**PATH_TO_LOGS** (required)

- Absolute path to log directory
- Must exist or be creatable by the application

**NAME*CHILD_PROCESS*[descriptor]** (required for apps with child processes)

- Parent process passes child process name via this variable
- Child receives value as its `NAME_APP`
- Example: `NAME_CHILD_PROCESS_SEMANTIC_SCORER=NewsNexusSemanticScorer02`

### Optional Variables

**LOG_MAX_SIZE**

- Default: `5` (megabytes)
- Specify value in megabytes (e.g., `5` = 5MB)
- Logger implementation converts to bytes internally for Winston
- Maximum size of a single file before within-day size rotation kicks in

**LOG_MAX_FILES**

- Default: `5`
- Number of dated log files to retain
- Older files are deleted automatically as new ones are written

## Log File Naming

Files are written using the date-suffixed convention so that each day's log is preserved as a historical record and the active file does not grow unbounded.

- **Active file (per day)**: `{NAME_APP}-YYYY-MM-DD.log`
- **Within-day overflow** (when a single day exceeds `LOG_MAX_SIZE`): `{NAME_APP}-YYYY-MM-DD.log.1`, `{NAME_APP}-YYYY-MM-DD.log.2`, …
  This `.log.N` suffix is the native naming produced by `winston-daily-rotate-file` when `maxSize` triggers within-day rotation; do not try to rename or reorder these files.
- **Date basis**: use the **local timezone** of the host running the app (matches operator expectations when tailing logs).
- **Rotation cadence**:
  - **Daily** — at local midnight, a new dated file is started.
  - **Size** — within a single day, files roll over when they exceed `LOG_MAX_SIZE`.
- **Retention**: keep the most recent `LOG_MAX_FILES` files; delete older ones.

Example directory contents after several days of activity:

```
GoLightly04API-2026-05-15.log
GoLightly04API-2026-05-16.log
GoLightly04API-2026-05-17.log
GoLightly04API-2026-05-17.log.1   (size overflow within today)
```

## Logger File Placement

The logger configuration file should be placed based on existing project structure:

1. Check for existing config directories in this order:
   - `config/`
   - `src/config/`
   - `lib/config/`
   - `src/lib/config/`
   - `src/modules/`
2. If any of these directories exist, place `logger.js` (or `logger.ts`) there
3. If none exist, ask the user where they want the logger file placed (e.g., `modules/`, `lib/`, `utils/`, etc.)

## Configuration File Location

Standard Node.js applications use `.env` files.

## Initialization Requirements

### Startup Validation

Environment variable validation occurs in the logger configuration file before logger initialization:

1. Validate all required variables are present (`NODE_ENV`, `NAME_APP`, `PATH_TO_LOGS`)
2. If any required variable is missing:
   - Output fatal error to stderr identifying the specific missing variable
   - Exit immediately with non-zero exit code (e.g., `process.exit(1)`)
   - Do NOT proceed with logger initialization or application startup

### Logger Implementation

- Logger must be initialized before any other application code runs
- Main application file (e.g., `index.js`) should load dotenv first, then require the logger configuration file
- Export a singleton logger instance for use throughout the application
- See "Logger File Placement" section for file location guidance

### Recommended Library

Use [`winston-daily-rotate-file`](https://github.com/winstonjs/winston-daily-rotate-file) as the file transport. It produces the date-suffixed naming pattern natively when configured as:

```js
new DailyRotateFile({
  filename: `${NAME_APP}-%DATE%.log`,
  dirname: PATH_TO_LOGS,
  datePattern: "YYYY-MM-DD",
  maxSize: `${LOG_MAX_SIZE}m`,
  maxFiles: `${LOG_MAX_FILES}d`, // or numeric count
  zippedArchive: false,
});
```

The transport produces files like `{NAME_APP}-YYYY-MM-DD.log` and rolls within-day overflow to `{NAME_APP}-YYYY-MM-DD.log.1`, `.log.2`, etc., matching the naming convention above. This `.log.N` suffix is the library's native output; do not attempt to rewrite it.

## Ensuring Logs on Early Exit

**Critical for microservices, scheduled tasks, and systemd services**: Applications must log their startup attempt even when exiting early due to guardrails, validation failures, or other pre-flight checks. In production mode, Winston writes to files only, and the process buffer may not flush if the application exits immediately.

**Required pattern for early exit scenarios:**

1. **Wrap application in async IIFE**: Use `(async () => { ... })()` pattern to enable early returns with proper cleanup
2. **Log before exit**: Call `logger.info()` or `logger.warn()` with exit reason
3. **Add logger.error**: Write critical messages to stderr for immediate visibility (important when tailing systemd logs)
4. **Delay before exit**: Add `await new Promise((resolve) => setTimeout(resolve, 100))` to give Winston 100ms to flush buffer to disk
5. **Then exit**: Call `process.exit(0)` or `process.exit(1)` as appropriate

This pattern ensures that when a microservice is triggered by cron or systemd but exits due to guardrails (time windows, environment checks, etc.), the log file will contain a record of the attempt. Without this pattern, the log file may remain empty, making troubleshooting impossible.

## Log Levels

Winston log levels (in order of severity):

1. **error** - Error conditions requiring immediate attention
2. **warn** - Warning conditions that should be reviewed
3. **info** - Informational messages about application state
4. **http** - HTTP request/response logging
5. **debug** - Detailed debugging information

### Environment-Specific Levels

- **Development**: All levels (debug and above)
- **Testing**: info and above (error, warn, info, http)
- **Production**: info and above (error, warn, info, http)

## Child Process Handling

- Each child process manages its own Winston logger instance
- Parent process passes `NAME_CHILD_PROCESS_[descriptor]` value to child as `NAME_APP`
- Child inherits all other logging environment variables (`NODE_ENV`, `PATH_TO_LOGS`, `LOG_MAX_SIZE`, `LOG_MAX_FILES`)
- Child and parent log to separate dated files based on their respective `NAME_APP` values

## Implementation Checklist

- [ ] Migrate console statements to logger calls (human task)
- [ ] Install Winston packages: `npm install winston winston-daily-rotate-file`
- [ ] Create logger configuration file (see "Logger File Placement" section)
- [ ] Implement environment variable validation at startup
- [ ] Configure the daily-rotate-file transport per the naming convention (`{NAME_APP}-YYYY-MM-DD.log`)
- [ ] Set `maxSize` from `LOG_MAX_SIZE` and `maxFiles` from `LOG_MAX_FILES`
- [ ] Test all three modes (development, testing, production)
- [ ] Verify child process logging (if applicable)
- [ ] Confirm fatal errors on missing required variables
- [ ] Verify a new dated file is created at local midnight and that within-day size overflow produces `.log.1`, `.log.2`, etc.
