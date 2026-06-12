# Root scripts

This directory is for cross-package one-shot ops scripts that do not belong to a single workspace. Run them from the repository root with Node and either process environment variables already set or an env file loaded by `dotenv`; if no root `.env` exists, the script relies on the ambient process env. The root owns the runtime for these scripts, so `ts-node`, `dotenv`, `fluent-ffmpeg`, and `@ffprobe-installer/ffprobe` are declared in the root `package.json` instead of inherited from a workspace. Add new scripts with an npm entry that uses `TS_NODE_PROJECT=tsconfig.scripts.json`.

`seedDefaultMeditation.ts` is deprecated and intentionally exits. Use `npm run import:meditations -- --user-key <nick|benevolent_monkey> --file <path>` or `--dir <path>`, then select the default meditation in `/admin`.
