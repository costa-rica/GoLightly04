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

export class ContractUserMeditationsListen extends Model<
  InferAttributes<ContractUserMeditationsListen>,
  InferCreationAttributes<ContractUserMeditationsListen>
> {
  declare id: CreationOptional<number>;
  declare userId: ForeignKey<User["id"]>;
  declare meditationId: ForeignKey<Meditation["id"]>;
  declare listenCount: number;
  declare favorite: CreationOptional<boolean>;

  // Timestamps
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function initContractUserMeditationsListen() {
  ContractUserMeditationsListen.init(
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
      listenCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      favorite: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    {
      sequelize,
      tableName: "contract_user_meditation_listens",
      timestamps: true,
    },
  );
  return ContractUserMeditationsListen;
}
