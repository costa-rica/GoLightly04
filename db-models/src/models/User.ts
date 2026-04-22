import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";

export class User extends Model<InferAttributes<User>, InferCreationAttributes<User>> {
  declare id: CreationOptional<number>;
  declare email: string;
  declare password: string | null;
  declare authProvider: CreationOptional<"local" | "google" | "both">;
  declare isEmailVerified: CreationOptional<boolean>;
  declare emailVerifiedAt: Date | null;
  declare isAdmin: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function initUserModel(sequelize: Sequelize): typeof User {
  User.init(
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      email: {
        type: DataTypes.TEXT,
        allowNull: false,
        unique: true,
      },
      password: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      authProvider: {
        type: DataTypes.ENUM("local", "google", "both"),
        allowNull: false,
        defaultValue: "local",
        field: "auth_provider",
      },
      isEmailVerified: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        field: "is_email_verified",
      },
      emailVerifiedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: "email_verified_at",
      },
      isAdmin: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        field: "is_admin",
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
      tableName: "users",
      modelName: "User",
      underscored: true,
    },
  );

  return User;
}
