# Database Overview

This document explains the current GoLightly03 database structure and how to use the `db-models` project.

## 1. Recommendation

For the current size of this repo, keeping the schema overview and `db-models` usage guidance together in one file makes sense.

Why this makes sense right now:

1. the schema and the `db-models` package are tightly coupled
2. there are only a small number of tables and relationship types
3. most people reading this doc will want both pieces of information together

I would only split this into separate files later if one of these happens:

1. the schema gets much larger
2. migration guidance becomes a substantial topic of its own
3. you want a deeper per-table reference with examples and query patterns

## 2. Project Location

The database package lives in:

1. [db-models](/Users/nick/Documents/GoLightly03/db-models)

The main exported surface is:

1. `sequelize`
2. `initModels()`
3. all Sequelize model classes

The root export file is:

1. [db-models/src/index.ts](/Users/nick/Documents/GoLightly03/db-models/src/index.ts)

## 3. Connection Model

The project uses Sequelize with SQLite.

Connection details:

1. dialect: `sqlite`
2. storage path: `path.join(PATH_DATABASE || ".", NAME_DB || "database.sqlite")`
3. logging: disabled at the Sequelize connection level

Connection file:

1. [db-models/src/models/_connection.ts](/Users/nick/Documents/GoLightly03/db-models/src/models/_connection.ts)

Required runtime inputs in practice:

1. `PATH_DATABASE`
2. `NAME_DB`

## 4. Initialization Pattern

Before using the models, initialize them once:

```ts
import { initModels, sequelize, User } from "@golightly/db-models";

initModels();
await sequelize.authenticate();
await sequelize.sync();
```

What `initModels()` does:

1. initializes every model definition
2. applies all associations
3. returns the initialized model set

Initialization file:

1. [db-models/src/models/_index.ts](/Users/nick/Documents/GoLightly03/db-models/src/models/_index.ts)

Association file:

1. [db-models/src/models/_associations.ts](/Users/nick/Documents/GoLightly03/db-models/src/models/_associations.ts)

## 5. Table Summary

Current tables:

1. `users`
2. `meditations`
3. `queue`
4. `elevenlabs_files`
5. `sound_files`
6. `contract_users_meditations`
7. `contract_user_meditation_listens`
8. `contract_meditations_elevenlabs_files`
9. `contract_meditations_sound_files`

## 6. Table Schemas

### users

Model file:

1. [db-models/src/models/User.ts](/Users/nick/Documents/GoLightly03/db-models/src/models/User.ts)

Columns:

1. `id`
   - integer
   - primary key
   - auto increment
2. `email`
   - string
   - required
   - unique
   - normalized to lowercase in the model setter
3. `password`
   - string
   - nullable
   - intended for local auth
4. `isEmailVerified`
   - boolean
   - required
   - default `false`
5. `emailVerifiedAt`
   - date
   - nullable
6. `isAdmin`
   - boolean
   - required
   - default `false`
7. `authProvider`
   - string
   - required
   - default `local`
   - validated as one of `local`, `google`, `both`
8. `createdAt`
   - date
9. `updatedAt`
   - date

### meditations

Model file:

1. [db-models/src/models/Meditation.ts](/Users/nick/Documents/GoLightly03/db-models/src/models/Meditation.ts)

Columns:

1. `id`
   - integer
   - primary key
   - auto increment
2. `title`
   - string
   - required
3. `description`
   - text
   - nullable
4. `visibility`
   - string
   - required
   - default `public`
5. `filename`
   - string
   - nullable
6. `filePath`
   - string
   - nullable
7. `listenCount`
   - integer
   - required
   - default `0`
8. `createdAt`
   - date
9. `updatedAt`
   - date

### queue

Model file:

1. [db-models/src/models/Queue.ts](/Users/nick/Documents/GoLightly03/db-models/src/models/Queue.ts)

Columns:

1. `id`
   - integer
   - primary key
   - auto increment
2. `userId`
   - integer
   - required
   - foreign key to `users.id`
3. `status`
   - string
   - required
   - default `queued`
   - application code currently uses values such as `queued`, `started`, `elevenlabs`, `concatenator`, `done`, and `failed`
4. `jobFilename`
   - string
   - required
5. `createdAt`
   - date
6. `updatedAt`
   - date

### elevenlabs_files

Model file:

1. [db-models/src/models/ElevenLabsFiles.ts](/Users/nick/Documents/GoLightly03/db-models/src/models/ElevenLabsFiles.ts)

Columns:

1. `id`
   - integer
   - primary key
   - auto increment
2. `filename`
   - string
   - nullable
3. `filePath`
   - string
   - nullable
4. `text`
   - string
   - nullable
5. `createdAt`
   - date
6. `updatedAt`
   - date

### sound_files

Model file:

1. [db-models/src/models/SoundFiles.ts](/Users/nick/Documents/GoLightly03/db-models/src/models/SoundFiles.ts)

Columns:

1. `id`
   - integer
   - primary key
   - auto increment
2. `name`
   - string
   - required
3. `description`
   - string
   - nullable
4. `filename`
   - string
   - required
5. `createdAt`
   - date
6. `updatedAt`
   - date

### contract_users_meditations

Model file:

1. [db-models/src/models/ContractUsersMeditations.ts](/Users/nick/Documents/GoLightly03/db-models/src/models/ContractUsersMeditations.ts)

Columns:

1. `id`
   - integer
   - primary key
   - auto increment
2. `userId`
   - integer
   - required
   - foreign key to `users.id`
3. `meditationId`
   - integer
   - required
   - foreign key to `meditations.id`
4. `createdAt`
   - date
5. `updatedAt`
   - date

Purpose:

1. links users to meditations they own or are associated with

### contract_user_meditation_listens

Model file:

1. [db-models/src/models/ContractUserMeditationsListen.ts](/Users/nick/Documents/GoLightly03/db-models/src/models/ContractUserMeditationsListen.ts)

Columns:

1. `id`
   - integer
   - primary key
   - auto increment
2. `userId`
   - integer
   - required
   - foreign key to `users.id`
3. `meditationId`
   - integer
   - required
   - foreign key to `meditations.id`
4. `listenCount`
   - integer
   - required
   - default `0`
5. `favorite`
   - boolean
   - required
   - default `false`
6. `createdAt`
   - date
7. `updatedAt`
   - date

Purpose:

1. stores per-user listen and favorite state for meditations

### contract_meditations_elevenlabs_files

Model file:

1. [db-models/src/models/ContractMeditationsElevenLabsFiles.ts](/Users/nick/Documents/GoLightly03/db-models/src/models/ContractMeditationsElevenLabsFiles.ts)

Columns:

1. `id`
   - integer
   - primary key
   - auto increment
2. `meditationId`
   - integer
   - required
   - foreign key to `meditations.id`
3. `elevenLabsFilesId`
   - integer
   - required
   - foreign key to `elevenlabs_files.id`
4. `createdAt`
   - date
5. `updatedAt`
   - date

Purpose:

1. links a meditation to the generated ElevenLabs source files used to build it

### contract_meditations_sound_files

Model file:

1. [db-models/src/models/ContractMeditationsSoundFiles.ts](/Users/nick/Documents/GoLightly03/db-models/src/models/ContractMeditationsSoundFiles.ts)

Columns:

1. `id`
   - integer
   - primary key
   - auto increment
2. `meditationId`
   - integer
   - required
   - stored as `meditation_id`
   - foreign key to `meditations.id`
   - `CASCADE` on update/delete
3. `soundFilesId`
   - integer
   - required
   - stored as `sound_files_id`
   - foreign key to `sound_files.id`
   - `CASCADE` on update/delete
4. `createdAt`
   - date
   - stored as `created_at`
5. `updatedAt`
   - date
   - stored as `updated_at`

Purpose:

1. links a meditation to pre-existing sound files referenced in the workflow

## 7. Relationship Overview

Main relationships:

1. `User` many-to-many `Meditation` through `ContractUsersMeditations`
2. `User` one-to-many `Queue`
3. `User` one-to-many `ContractUserMeditationsListen`
4. `Meditation` one-to-many `ContractUserMeditationsListen`
5. `Meditation` many-to-many `ElevenLabsFiles` through `ContractMeditationsElevenLabsFiles`
6. `Meditation` many-to-many `SoundFiles` through `ContractMeditationsSoundFiles`

Practical meaning:

1. users can own or be linked to many meditations
2. the queue belongs to users
3. a meditation can retain provenance about generated speech files
4. a meditation can retain provenance about referenced static sound files

## 8. How To Use db-models

### Basic import

```ts
import {
  initModels,
  sequelize,
  User,
  Meditation,
  Queue,
} from "@golightly/db-models";
```

### App startup

Recommended startup pattern:

1. load env vars first
2. call `initModels()`
3. authenticate with `sequelize.authenticate()`
4. sync or run your app-level DB boot logic

Example:

```ts
import dotenv from "dotenv";
import { initModels, sequelize } from "@golightly/db-models";

dotenv.config();

initModels();
await sequelize.authenticate();
await sequelize.sync({ alter: false });
```

### Creating records

Example:

```ts
const user = await User.create({
  email: "person@example.com",
  password: "hashed-password",
});

const meditation = await Meditation.create({
  title: "Morning Reset",
  filename: "morning_reset.mp3",
  filePath: "/audio/20260328/",
});
```

### Querying with associations

Example:

```ts
const meditation = await Meditation.findByPk(1, {
  include: ["users", "elevenLabsFiles", "soundFiles"],
});
```

Note:

1. association aliases come from [db-models/src/models/_associations.ts](/Users/nick/Documents/GoLightly03/db-models/src/models/_associations.ts)
2. if you query with includes, use the alias names defined there

## 9. Where db-models Is Used

Current main consumers in this repo:

1. [api](/Users/nick/Documents/GoLightly03/api)
2. [worker-node](/Users/nick/Documents/GoLightly03/worker-node)

Both treat `db-models` as the shared schema and model layer.

## 10. Notes And Cautions

1. `initModels()` should be called once during process startup before model use
2. the package currently assumes SQLite storage
3. queue `status` is a plain string in the database, so allowed values are enforced by application code, not DB enum constraints
4. `ContractMeditationsSoundFiles` uses underscored column names in storage, unlike the rest of the schema, so that table deserves extra care in raw SQL or migration work
5. if this schema grows much further, splitting this file into `DATABASE_SCHEMA.md` and `DB_MODELS_USAGE.md` would become more reasonable
