import {
  Model,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
  DataTypes,
} from "sequelize";
import { sequelize } from "./_connection";

export class SoundFiles extends Model<
  InferAttributes<SoundFiles>,
  InferCreationAttributes<SoundFiles>
> {
  declare id: CreationOptional<number>;
  declare name: string;
  declare description: string | null;
  declare filename: string;

  // Timestamps
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function initSoundFiles() {
  SoundFiles.init(
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      description: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      filename: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    {
      sequelize,
      tableName: "sound_files",
      timestamps: true,
    }
  );
  return SoundFiles;
}
