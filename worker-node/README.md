# worker-node

The worker service receives `POST /process` requests from the API, generates ElevenLabs narration for `text` jobs, and concatenates all meditation elements into a final MP3.

## Requirements

- Node.js 20+
- `ffmpeg` available on the system path for local verification
- Postgres credentials matching the root `.env`

## Environment

- `NODE_ENV`
- `PORT`
- `NAME_APP`
- `PATH_TO_LOGS`
- `LOG_MAX_SIZE`
- `LOG_MAX_FILES`
- `PATH_PROJECT_RESOURCES`
- `API_KEY_ELEVEN_LABS`
- `DEFAULT_ELEVENLABS_VOICE_ID`
- `DEFAULT_ELEVENLABS_SPEED`

## Commands

- `npm run dev -w @golightly/worker-node`
- `npm run typecheck -w @golightly/worker-node`
- `npm run test -w @golightly/worker-node`
- `npm run build -w @golightly/worker-node`
