# GoLightly03 worker-node

TypeScript Express API absorbed into the GoLightly03 monorepo for stage 2 workflow work. The production workflow uses internal ElevenLabs and audio-processing modules instead of shelling out to sibling repositories.

Tech Stack: TypeScript, Express.js, SQLite, Sequelize, Winston, FFmpeg

## Setup

1. Install dependencies: `npm install`
2. Build the project: `npm run build`
3. Ensure the directories referenced in `.env` exist and are writable
4. Ensure FFmpeg is installed and available on the machine

## Usage

Start the server:

```bash
npm start
npm run dev
```

The API will be available at `http://localhost:3000` unless `PORT` is overridden.

## API Endpoints

### POST /meditations/new

Create a new meditation from CSV file or array.

Request body example:

```json
{
  "userId": 1,
  "meditationArray": [
    {
      "id": "1",
      "pause_duration": "3.0"
    },
    {
      "id": "2",
      "text": "This is my meditation",
      "voice_id": "Xb7hH8MSUJpSbSDYk0k2",
      "speed": "0.9"
    }
  ]
}
```

Response example:

```json
{
  "success": true,
  "queueId": 123,
  "finalFilePath": "/path/to/output_20260202_153045.mp3",
  "message": "Meditation created successfully"
}
```

### GET /health

Health check endpoint.

## Project Structure

```text
worker-node/
├── src/
│   ├── modules/
│   │   ├── audio/                  # Internal audio processing modules
│   │   ├── elevenlabs/             # Internal ElevenLabs modules
│   │   ├── workflowOrchestrator.ts # Main workflow orchestrator
│   │   └── ...
│   ├── routes/
│   ├── types/
│   ├── app.ts
│   └── index.ts
├── tests/
├── package.json
└── tsconfig.json
```

## .env

```bash
NAME_APP=GoLightly03WorkerNode
PORT=3000
NODE_ENV=development
PATH_PROJECT_RESOURCES=/path/to/resources
PATH_QUEUER=/path/to/queuer
ADMIN_EMAIL=admin@example.com

# Database
NAME_DB=golightly03.db
PATH_DATABASE=/path/to/database

# Logs
PATH_TO_LOGS=/path/to/logs

# Internal ElevenLabs
API_KEY_ELEVEN_LABS=your_api_key_here
PATH_SAVED_ELEVENLABS_AUDIO_MP3_OUTPUT=/path/to/elevenlabs/output
DEFAULT_ELEVENLABS_VOICE_ID=nPczCjzI2devNBz1zQrb
DEFAULT_ELEVENLABS_SPEED=0.85

# Internal audio processing
PATH_MP3_OUTPUT=/path/to/final/audio
PATH_MP3_SOUND_FILES=/path/to/static/sound/files
```

## Workflow

1. Receive `POST /meditations/new` with `userId` and either `filenameCsv` or `meditationArray`
2. Parse input and validate structure
3. Create queue record with status `queued`
4. Update queue status to `started`
5. Update queue status to `elevenlabs`
6. Generate speech files through the internal ElevenLabs workflow
7. Save ElevenLabs file records to the database
8. Update queue status to `concatenator`
9. Build the final meditation audio through the internal audio workflow
10. Save the meditation record and related links
11. Update queue status to `done`
12. On workflow failure, update queue status to `failed`

## Notes

1. `filenameCsv` still supports legacy request ingestion through `PATH_QUEUER/user_request_csv_files/`
2. Sound file references in `meditationArray` are resolved relative to `PATH_MP3_SOUND_FILES`
3. Internal audio processing depends on FFmpeg being installed
