import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";

export class JobQueue extends Model<InferAttributes<JobQueue>, InferCreationAttributes<JobQueue>> {
  declare id: CreationOptional<number>;
  declare meditationId: number;
  declare sequence: number;
  declare type: "text" | "sound" | "pause";
  declare inputData: string;
  declare status: CreationOptional<"pending" | "processing" | "complete" | "failed">;
  declare filePath: string | null;
  declare attemptCount: CreationOptional<number>;
  declare lastError: string | null;
  declare lastAttemptedAt: Date | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function initJobQueueModel(sequelize: Sequelize): typeof JobQueue {
  JobQueue.init(
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      meditationId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: "meditation_id",
      },
      sequence: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      type: {
        type: DataTypes.ENUM("text", "sound", "pause"),
        allowNull: false,
      },
      inputData: {
        type: DataTypes.TEXT,
        allowNull: false,
        field: "input_data",
      },
      status: {
        type: DataTypes.ENUM("pending", "processing", "complete", "failed"),
        allowNull: false,
        defaultValue: "pending",
      },
      filePath: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: "file_path",
      },
      attemptCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        field: "attempt_count",
      },
      lastError: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: "last_error",
      },
      lastAttemptedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: "last_attempted_at",
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
      tableName: "jobs_queue",
      modelName: "JobQueue",
      underscored: true,
    },
  );

  return JobQueue;
}
