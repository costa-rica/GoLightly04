import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";

export class Meditation extends Model<
  InferAttributes<Meditation>,
  InferCreationAttributes<Meditation>
> {
  declare id: CreationOptional<number>;
  declare userId: number;
  declare title: string;
  declare description: string | null;
  declare meditationArray: object[];
  declare filename: string | null;
  declare filePath: string | null;
  declare visibility: CreationOptional<"public" | "private">;
  declare stage: CreationOptional<"template" | "staged" | "library">;
  declare sourceMode: CreationOptional<"spreadsheet" | "script">;
  declare scriptSource: string | null;
  declare isDefault: CreationOptional<boolean>;
  declare metadata: CreationOptional<Record<string, unknown>>;
  declare status: CreationOptional<"pending" | "processing" | "complete" | "failed">;
  declare listenCount: CreationOptional<number>;
  declare durationSeconds: CreationOptional<number | null>;
  declare durationSecondsTalking: CreationOptional<number | null>;
  declare durationSecondsPause: CreationOptional<number | null>;
  declare durationSecondsSound: CreationOptional<number | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function initMeditationModel(sequelize: Sequelize): typeof Meditation {
  Meditation.init(
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: "user_id",
      },
      title: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      meditationArray: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
        field: "meditation_array",
      },
      filename: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      filePath: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: "file_path",
      },
      visibility: {
        type: DataTypes.ENUM("public", "private"),
        allowNull: false,
        defaultValue: "public",
      },
      stage: {
        type: DataTypes.ENUM("template", "staged", "library"),
        allowNull: false,
        defaultValue: "library",
      },
      sourceMode: {
        type: DataTypes.STRING(16),
        allowNull: false,
        defaultValue: "spreadsheet",
        field: "source_mode",
      },
      scriptSource: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: "script_source",
      },
      isDefault: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        field: "is_default",
      },
      metadata: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      status: {
        type: DataTypes.ENUM("pending", "processing", "complete", "failed"),
        allowNull: false,
        defaultValue: "pending",
      },
      listenCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        field: "listen_count",
      },
      durationSeconds: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: "duration_seconds",
      },
      durationSecondsTalking: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: "duration_seconds_talking",
      },
      durationSecondsPause: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: "duration_seconds_pause",
      },
      durationSecondsSound: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: "duration_seconds_sound",
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
      tableName: "meditations",
      modelName: "Meditation",
      underscored: true,
    },
  );

  return Meditation;
}
