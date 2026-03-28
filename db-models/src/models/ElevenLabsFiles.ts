import {
  Model,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
  DataTypes,
} from "sequelize";
import { sequelize } from "./_connection";

export class ElevenLabsFiles extends Model<
  InferAttributes<ElevenLabsFiles>,
  InferCreationAttributes<ElevenLabsFiles>
> {
  declare id: CreationOptional<number>;
  declare filename: string | null;
  declare filePath: string | null;
  declare text: string | null;

  // Timestamps
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function initElevenLabsFiles() {
  ElevenLabsFiles.init(
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      filename: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      filePath: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      text: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    {
      sequelize,
      tableName: "elevenlabs_files",
      timestamps: true,
    }
  );
  return ElevenLabsFiles;
}
