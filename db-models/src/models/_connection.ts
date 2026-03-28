import { Sequelize } from "sequelize";
import * as path from "path";

const sequelize = new Sequelize({
  dialect: "sqlite",
  storage: path.join(
    process.env.PATH_DATABASE || ".",
    process.env.NAME_DB || "database.sqlite",
  ),
  logging: false,
});

export { sequelize };
export default sequelize;
