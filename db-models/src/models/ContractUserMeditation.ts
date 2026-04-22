import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";

export class ContractUserMeditation extends Model<
  InferAttributes<ContractUserMeditation>,
  InferCreationAttributes<ContractUserMeditation>
> {
  declare id: CreationOptional<number>;
  declare userId: number;
  declare meditationId: number;
  declare createdAt: CreationOptional<Date>;
}

export function initContractUserMeditationModel(sequelize: Sequelize): typeof ContractUserMeditation {
  ContractUserMeditation.init(
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
      meditationId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: "meditation_id",
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        field: "created_at",
      },
    },
    {
      sequelize,
      tableName: "contract_user_meditations",
      modelName: "ContractUserMeditation",
      underscored: true,
      updatedAt: false,
      indexes: [
        {
          unique: true,
          fields: ["user_id", "meditation_id"],
        },
      ],
    },
  );

  return ContractUserMeditation;
}
