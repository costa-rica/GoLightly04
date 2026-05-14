---
created_at: 2026-05-14
updated_at: 2026-05-14
created_by: codex (gpt-5)
modified_by: codex (gpt-5)
---

# Database Usage Guide

The GoLightly04 database layer is published inside the monorepo as `@golightly/db-models`.

## Package Description

- Published name: `@golightly/db-models`
- Source path: `db-models/src`
- Build output path: `db-models/dist`
- ORM: Sequelize 6
- Database engine: PostgreSQL
- Model convention: one class per table, with one `init<ModelName>Model()` function per model file.
- Centralized init: `initializeModels(sequelize)` in `db-models/src/models/associations.ts`.
- Centralized exports: `db-models/src/index.ts`.
- Timestamp convention: most models use `createdAt` and `updatedAt`; `ContractUserMeditation` sets `updatedAt: false`.
- Table naming convention: `freezeTableName: true`, `underscored: true`, and explicit `tableName` values.

## Project Structure

```text
db-models/src/
├── config/
│   ├── env.ts
│   └── sequelize.ts
├── index.ts
└── models/
    ├── ContractUserMeditation.ts
    ├── JobQueue.ts
    ├── Meditation.ts
    ├── SoundFile.ts
    ├── User.ts
    └── associations.ts
```

## Using This Package in an App

1. Load the consuming app's `.env` before importing code that opens a database connection.
2. Import `createSequelize`, `getDefaultSequelize`, `initializeModels`, or `provisionDatabase` from `@golightly/db-models`.
3. Create a Sequelize handle with `createSequelize({ role: "boot" })` for provisioning or `getDefaultSequelize()` for runtime app access.
4. Call `initializeModels(sequelize)` before using model classes.
5. Authenticate or sync the connection.
6. Mount routes or start the server after the database is ready.

### Initialization pattern

```ts
import dotenv from "dotenv";
import {
  createSequelize,
  getDefaultSequelize,
  initializeModels,
  provisionDatabase,
} from "@golightly/db-models";

dotenv.config();

export async function bootstrapDatabase() {
  const bootSequelize = createSequelize({ role: "boot" });
  initializeModels(bootSequelize);
  await provisionDatabase(bootSequelize);
  await bootSequelize.close();

  const appSequelize = getDefaultSequelize();
  initializeModels(appSequelize);
  await appSequelize.authenticate();

  return appSequelize;
}
```

## Why Order Matters

- Loading env first prevents `readDbModelsEnv()` from throwing missing `PG_*` errors.
- Calling `initializeModels()` before model usage prevents Sequelize model initialization errors.
- Running `provisionDatabase()` before runtime traffic creates the tables and enum types.
- Starting routes before authentication can surface database failures as request-time errors.
- Using the app role for schema creation can fail because `golightly04_app` is intended for runtime DML.

## Environment Variables

| Variable | Required | Example | Notes |
|---|---:|---|---|
| `PG_HOST` | Yes | `localhost` | Host must be reachable from the app process. |
| `PG_PORT` | Yes | `5432` | Must be a positive integer and accept PostgreSQL connections. |
| `PG_DATABASE` | Yes | `golightly04_dev` | Database must exist before the app starts. |
| `PG_USER` | Yes | `golightly04_boot` | Bootstrap role used when `createSequelize({ role: "boot" })` is selected. Needs schema creation privileges for provisioning. |
| `PG_SCHEMA` | Yes | `public` | Schema must exist. |
| `PG_APP_ROLE` | Yes | `golightly04_app` | Runtime role used by `getDefaultSequelize()` and `createSequelize({ role: "app" })`. Needs `CONNECT`, schema `USAGE`, table DML, and sequence usage. |
| `PG_POOL_MAX` | No | `3` | Optional positive integer for Sequelize pool max. |
| `PG_PASSWORD` | No | `local-password` | Optional. Omit when local `pg_hba.conf` uses trust auth for the project roles. |

## Creating or Updating Schema

```ts
// Create missing tables without destructive changes.
await sequelize.sync();

// Development only: ask Sequelize to alter existing tables to match models.
await sequelize.sync({ alter: true });

// Destructive: drop and recreate tables.
await sequelize.sync({ force: true });
```

- `sequelize.sync()` is what `syncAll()` and `provisionDatabase()` use today.
- `{ alter: true }` can help during local model iteration, but review generated changes before production use.
- `{ force: true }` destroys data and should only be used for disposable databases.

## Using Models

```ts
import { Meditation, User, getDefaultSequelize, initializeModels } from "@golightly/db-models";

const sequelize = getDefaultSequelize();
initializeModels(sequelize);

const user = await User.findOne({ where: { email: "admin@example.com" } });

const publicMeditations = await Meditation.findAll({
  where: { visibility: "public", status: "complete" },
  order: [["createdAt", "DESC"]],
});

if (user) {
  await Meditation.create({
    userId: user.id,
    title: "morning focus",
    description: null,
    meditationArray: [],
  });
}
```

## Template (copy for each new model)

```ts
import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";

export class ExampleModel extends Model<
  InferAttributes<ExampleModel>,
  InferCreationAttributes<ExampleModel>
> {
  declare id: CreationOptional<number>;
  declare name: string;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function initExampleModel(sequelize: Sequelize): typeof ExampleModel {
  ExampleModel.init(
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      name: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        field: "created_at",
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        field: "updated_at",
      },
    },
    {
      sequelize,
      tableName: "example_models",
      modelName: "ExampleModel",
      underscored: true,
    },
  );

  return ExampleModel;
}
```

## Example src/models/_index.ts

This project uses `db-models/src/index.ts` instead of `src/models/_index.ts`.

```ts
import {
  InferAttributes,
  InferCreationAttributes,
  Sequelize,
} from "sequelize";
import { createSequelize, getDefaultSequelize } from "./config/sequelize";
import { initializeModels } from "./models/associations";
import { ContractUserMeditation } from "./models/ContractUserMeditation";
import { JobQueue } from "./models/JobQueue";
import { Meditation } from "./models/Meditation";
import { SoundFile } from "./models/SoundFile";
import { User } from "./models/User";

export { createSequelize, getDefaultSequelize, initializeModels };
export { User, SoundFile, Meditation, JobQueue, ContractUserMeditation };
export type { InferAttributes, InferCreationAttributes };

export async function syncAll(sequelize: Sequelize = getDefaultSequelize()): Promise<Sequelize> {
  initializeModels(sequelize);
  await sequelize.sync();
  return sequelize;
}
```

## Database Configuration

- Engine: PostgreSQL.
- ORM: Sequelize.
- Env var prefix: `PG_`.
- `db-models` does not own a `.env` file.
- `api` and `worker-node` load their own `.env` files and pass settings through process env.
- `web` does not connect directly to PostgreSQL.
