import {
  Model,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
  DataTypes,
  ForeignKey,
} from "sequelize";
import { sequelize } from "./_connection";
import { User } from "./User";
import { Meditation } from "./Meditation";

export class ContractUsersMeditations extends Model<
  InferAttributes<ContractUsersMeditations>,
  InferCreationAttributes<ContractUsersMeditations>
> {
  declare id: CreationOptional<number>;
  declare userId: ForeignKey<User["id"]>;
  declare meditationId: ForeignKey<Meditation["id"]>;

  // Timestamps
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function initContractUsersMeditations() {
  ContractUsersMeditations.init(
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "users",
          key: "id",
        },
      },
      meditationId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "meditations",
          key: "id",
        },
      },
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    {
      sequelize,
      tableName: "contract_users_meditations",
      timestamps: true,
    },
  );
  return ContractUsersMeditations;
}
