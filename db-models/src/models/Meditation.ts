import {
  Model,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
  DataTypes,
} from "sequelize";
import { sequelize } from "./_connection";

export class Meditation extends Model<
  InferAttributes<Meditation>,
  InferCreationAttributes<Meditation>
> {
  declare id: CreationOptional<number>;
  declare title: string;
  declare description: string | null;
  declare visibility: CreationOptional<string>;
  declare filename: string | null;
  declare filePath: string | null;
  declare listenCount: CreationOptional<number>;

  // Timestamps
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function initMeditation() {
  Meditation.init(
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      title: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      visibility: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "public",
      },
      filename: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      filePath: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      listenCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    {
      sequelize,
      tableName: "meditations",
      timestamps: true,
    },
  );
  return Meditation;
}
