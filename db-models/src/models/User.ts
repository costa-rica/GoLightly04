import {
  Model,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
  DataTypes,
} from "sequelize";
import { sequelize } from "./_connection";

export class User extends Model<
  InferAttributes<User>,
  InferCreationAttributes<User>
> {
  declare id: CreationOptional<number>;
  declare email: string;
  declare password: string | null; // Nullable for Google-only auth users
  declare isEmailVerified: CreationOptional<boolean>;
  declare emailVerifiedAt: Date | null;
  declare isAdmin: CreationOptional<boolean>;
  declare authProvider: CreationOptional<string>; // 'local', 'google', or 'both'

  // Timestamps
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function initUser() {
  User.init(
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      email: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        set(value: string) {
          // Normalize email to lowercase
          this.setDataValue("email", value.toLowerCase());
        },
      },
      password: {
        type: DataTypes.STRING,
        allowNull: true, // Nullable for Google-only auth users
      },
      isEmailVerified: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      authProvider: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "local", // 'local', 'google', or 'both'
        validate: {
          isIn: [["local", "google", "both"]],
        },
      },
      emailVerifiedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      isAdmin: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    {
      sequelize,
      tableName: "users",
      timestamps: true,
    }
  );
  return User;
}
