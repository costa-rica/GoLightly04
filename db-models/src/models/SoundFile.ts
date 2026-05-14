import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";

export class SoundFile extends Model<
  InferAttributes<SoundFile>,
  InferCreationAttributes<SoundFile>
> {
  declare id: CreationOptional<number>;
  declare name: string;
  declare description: string | null;
  declare filename: string;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

// The database owns a functional unique index on LOWER(BTRIM(name)) named
// sound_files_name_normalized_idx. Keep duplicate-name behavior in sync with
// api/src/routes/sounds.ts before changing sound upload semantics.
export function initSoundFileModel(sequelize: Sequelize): typeof SoundFile {
  SoundFile.init(
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      name: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      filename: {
        type: DataTypes.TEXT,
        allowNull: false,
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
      tableName: "sound_files",
      modelName: "SoundFile",
      underscored: true,
    },
  );

  return SoundFile;
}
