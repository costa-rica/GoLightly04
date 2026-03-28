import {
  DataTypes,
  Model,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
  ForeignKey,
} from "sequelize";
import { sequelize } from "./_connection";
import { Meditation } from "./Meditation";
import { SoundFiles } from "./SoundFiles";

export class ContractMeditationsSoundFiles extends Model<
  InferAttributes<ContractMeditationsSoundFiles>,
  InferCreationAttributes<ContractMeditationsSoundFiles>
> {
  declare id: CreationOptional<number>;
  declare meditationId: ForeignKey<Meditation["id"]>;
  declare soundFilesId: ForeignKey<SoundFiles["id"]>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function initContractMeditationsSoundFiles() {
  ContractMeditationsSoundFiles.init(
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
        references: {
          model: "meditations",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      soundFilesId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: "sound_files_id",
        references: {
          model: "sound_files",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
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
      tableName: "contract_meditations_sound_files",
      timestamps: true,
      underscored: true,
    },
  );
}
