import {
  Model,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
  DataTypes,
  ForeignKey,
} from "sequelize";
import { sequelize } from "./_connection";
import { Meditation } from "./Meditation";
import { ElevenLabsFiles } from "./ElevenLabsFiles";

export class ContractMeditationsElevenLabsFiles extends Model<
  InferAttributes<ContractMeditationsElevenLabsFiles>,
  InferCreationAttributes<ContractMeditationsElevenLabsFiles>
> {
  declare id: CreationOptional<number>;
  declare meditationId: ForeignKey<Meditation["id"]>;
  declare elevenLabsFilesId: ForeignKey<ElevenLabsFiles["id"]>;

  // Timestamps
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function initContractMeditationsElevenLabsFiles() {
  ContractMeditationsElevenLabsFiles.init(
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      meditationId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "meditations",
          key: "id",
        },
      },
      elevenLabsFilesId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "elevenlabs_files",
          key: "id",
        },
      },
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    {
      sequelize,
      tableName: "contract_meditations_elevenlabs_files",
      timestamps: true,
    },
  );
  return ContractMeditationsElevenLabsFiles;
}
