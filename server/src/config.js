require("dotenv").config();

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable de entorno ${name}`);
  return value;
}

function origins() {
  const configured = process.env.CORS_ORIGIN;
  const values = configured
    ? configured.split(",")
    : ["http://localhost:3000", process.env.RENDER_EXTERNAL_URL];
  return values.map((origin) => origin?.trim()).filter(Boolean);
}

const mysqlSsl = process.env.MYSQL_SSL === "true";

const config = {
  port: Number(process.env.PORT || 3000),
  mysql: {
    host: required("MYSQL_HOST"),
    port: Number(process.env.MYSQL_PORT || 3306),
    database: required("MYSQL_DATABASE"),
    user: required("MYSQL_USER"),
    password: required("MYSQL_PASSWORD"),
    ssl: mysqlSsl ? { rejectUnauthorized: process.env.MYSQL_SSL_REJECT_UNAUTHORIZED !== "false" } : undefined
  },
  jwtSecret: required("JWT_SECRET"),
  corsOrigins: origins(),
  initialAdmin: {
    name: process.env.ADMIN_NAME?.trim(),
    email: process.env.ADMIN_EMAIL?.trim(),
    password: process.env.ADMIN_PASSWORD
  }
};

module.exports = { config };
