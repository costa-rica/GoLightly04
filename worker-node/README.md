# GoLightly03 worker-node

TypeScript Express API absorbed into the GoLightly03 monorepo for stage 2 workflow work. In this phase it uses the local `@golightly/db-models` package and preserves the existing route surface while the legacy ElevenLabs and audio child-process workflow is still being phased out.

Tech Stack: TypeScript, Express.js, SQLite, Sequelize, Winston

## Setup

1. Install dependencies: `npm install`
2. Build the project: `npm run build`
3. Ensure all required directories exist (see .env section below)
4. If you are still using the temporary legacy child-process workflow during stage 2, verify the child microservices are built and accessible:
   - RequesterElevenLabs01 at `PATH_TO_ELEVENLABS_SERVICE`
   - AudioFileConcatenator01 at `PATH_TO_AUDIO_FILE_CONCATENATOR`

## Usage

Start the server:

```bash
npm start        # Production mode (compiled)
npm run dev      # Development mode (ts-node)
```

The API will be available at `http://localhost:3000`.

### API Endpoints

#### POST /meditations/new

Create a new meditation from CSV file or array.

Request Body:

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

OR with CSV file:

```json
{
  "userId": 1,
  "filenameCsv": "meditation_input.csv"
}
```

Response:

```json
{
  "success": true,
  "queueId": 123,
  "finalFilePath": "/path/to/output_20260202_153045.mp3",
  "message": "Meditation created successfully"
}
```

#### GET /health

Health check endpoint.

## Project Structure

```
GoLightly01Queuer/
├── src/
│   ├── modules/
│   │   ├── audioConcatenatorHandler.ts  # AudioConcatenator workflow
│   │   ├── childProcessSpawner.ts       # Generic child process spawner
│   │   ├── csvParser.ts                 # CSV file and array parsing
│   │   ├── csvWriter.ts                 # CSV file generation
│   │   ├── database.ts                  # Database initialization
│   │   ├── elevenLabsHandler.ts         # ElevenLabs workflow
│   │   ├── errorHandler.ts              # Error middleware
│   │   ├── errors.ts                    # Custom error classes
│   │   ├── fileManager.ts               # File operations
│   │   ├── logger.ts                    # Winston logger configuration
│   │   ├── queueManager.ts              # Queue CRUD operations
│   │   ├── validator.ts                 # Request validation
│   │   └── workflowOrchestrator.ts      # Main workflow orchestrator
│   ├── routes/
│   │   └── meditations.ts                   # Meditations API routes
│   ├── types/
│   │   └── index.ts                     # TypeScript type definitions
│   └── index.ts                         # Express app entry point
├── test/
│   ├── utils/
│   │   └── testHelpers.ts              # Test utilities
│   └── README.md                        # Test documentation
├── docs/
│   ├── REQUIREMENTS.md
│   ├── REQUIREMENTS_TODO.md
│   ├── LOGGING_NODE_JS_V06.md
│   ├── ERROR_REQUIREMENTS.md
│   └── references/
├── dist/                                # Compiled JavaScript
├── .env                                 # Environment variables
├── package.json
└── tsconfig.json
```

## .env

```
NAME_APP=GoLightly01Queuer
PORT=3000
NODE_ENV=testing
PATH_PROJECT_RESOURCES=/Users/nick/Documents/_project_resources/GoLightly/
PATH_QUEUER=/Users/nick/Documents/_project_resources/GoLightly/queuer/
JWT_SECRET=JWT_SECRET
ADMIN_EMAIL=admin@golightly.com

# Database
NAME_DB=golightly01.db
PATH_DATABASE=/Users/nick/Documents/_project_resources/GoLightly/database/

# Logs
PATH_TO_LOGS=/Users/nick/Documents/_logs
# LOG_MAX_SIZE=5
# LOG_MAX_FILES=5

# Child Process: ElevenLabs
NAME_CHILD_PROCESS_ELEVENLABS=RequesterElevenLabs01
PATH_SAVED_ELEVENLABS_AUDIO_MP3_OUTPUT=/Users/nick/Documents/_project_resources/GoLightly/eleven_labs_responses
PATH_USER_ELEVENLABS_CSV_FILES=/Users/nick/Documents/_project_resources/GoLightly/eleven_labs_user_csv_files
API_KEY_ELEVEN_LABS=your_api_key_here

# Child Process: Audio Processing
NAME_CHILD_PROCESS_AUDIO_FILE_CONCATENATOR=AudioFileConcatenator01
PATH_AUDIO_CSV_FILE=/Users/nick/Documents/_project_resources/GoLightly/audio_concatenator_input
PATH_MP3_OUTPUT=/Users/nick/Documents/_project_resources/GoLightly/audio_results
PATH_MP3_SOUND_FILES=/Users/nick/Documents/_project_resources/GoLightly/mp3_sound_files

# Child Process Paths
PATH_TO_ELEVENLABS_SERVICE=/Users/nick/Documents/RequesterElevenLabs01
PATH_TO_AUDIO_FILE_CONCATENATOR=/Users/nick/Documents/AudioFileConcatenator01
```

## External Files

### User Request CSV Files

Location: `PATH_QUEUER/user_request_csv_files/`

Format:

```csv
id,text,voice_id,speed,pause_duration,sound_file
1,,,,3.0,
2,This is my meditation,Xb7hH8MSUJpSbSDYk0k2,0.9,,
3,Another phrase,Xb7hH8MSUJpSbSDYk0k2,1.0,,
4,,,,2.5,
```

Columns:

- `id` (required) - Unique identifier for each row
- `text` - Text to convert to speech (processed by ElevenLabs)
- `voice_id` - ElevenLabs voice ID (optional, uses default if empty)
- `speed` - Speech speed 0.7-1.2 (optional, uses default if empty)
- `pause_duration` - Seconds of silence to insert
- `sound_file` - Filename of existing audio file (must exist in PATH_MP3_SOUND_FILES)

Rules:

- Each row must have either `text`, `pause_duration`, or `sound_file` populated
- `sound_file` cannot be used with `text`, `voice_id`, `speed`, or `pause_duration` in the same row

### Sound Files

Location: `PATH_MP3_SOUND_FILES/`

This directory contains pre-existing MP3 audio files that can be referenced in the `sound_file` field of meditation requests. When a `sound_file` value is provided, the system constructs the full path by joining `PATH_MP3_SOUND_FILES` with the filename and includes it in the audio concatenation workflow.

Example: If `sound_file` is set to `bell.mp3`, the system will look for the file at `PATH_MP3_SOUND_FILES/bell.mp3`.

## Child Processes

### RequesterElevenLabs01

Converts text to speech using ElevenLabs API.

Location: `PATH_TO_ELEVENLABS_SERVICE`

Environment Variables:

- `NAME_APP` - Set to `NAME_CHILD_PROCESS_ELEVENLABS`
- Inherits all parent environment variables

Logging: Logs to `PATH_TO_LOGS/RequesterElevenLabs01.log`

### AudioFileConcatenator01

Concatenates audio files and generates silence.

Location: `PATH_TO_AUDIO_FILE_CONCATENATOR`

Environment Variables:

- `NAME_APP` - Set to `NAME_CHILD_PROCESS_AUDIO_FILE_CONCATENATOR`
- `PATH_AND_FILENAME_AUDIO_CSV_FILE` - Path to input CSV
- Inherits all parent environment variables

Logging: Logs to `PATH_TO_LOGS/AudioFileConcatenator01.log`

## Workflow

1. Receive POST /meditations/new request with `userId` and either `filenameCsv` or `meditationArray`
2. Parse input and validate structure
3. Create queue record (status: "queued")
4. Update status to "started"
5. Generate ElevenLabs CSV for text entries
6. Update status to "elevenlabs"
7. Spawn RequesterElevenLabs01 microservice
8. Parse ElevenLabs output to get MP3 file paths
9. Generate AudioConcatenator CSV mapping all elements
10. Update status to "concatenator"
11. Spawn AudioFileConcatenator01 microservice
12. Parse AudioConcatenator output to get final MP3 path
13. Update status to "done"
14. Return final file path to client

## References

- [REQUIREMENTS.md](docs/REQUIREMENTS.md) - Detailed project requirements
- [REQUIREMENTS_TODO.md](docs/REQUIREMENTS_TODO.md) - Implementation checklist
- [LOGGING_NODE_JS_V06.md](docs/LOGGING_NODE_JS_V06.md) - Logging standards
- [ERROR_REQUIREMENTS.md](docs/ERROR_REQUIREMENTS.md) - Error handling standards
- [RequesterElevenLabs01 README](docs/references/README-RequesterElevenLabs01.md)
- [AudioFileConcatenator01 README](docs/references/README-AudioFileConcatenator01.md)
