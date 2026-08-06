const mysql = require("mysql2/promise");
const fs = require("fs/promises");
const path = require("path");
const { config } = require("./config");

const pool = mysql.createPool({
  ...config.mysql,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: "+00:00",
  decimalNumbers: true,
  multipleStatements: true
});

let schemaInitialization;

async function initializeDatabase() {
  if (!schemaInitialization) {
    schemaInitialization = fs.readFile(path.join(__dirname, "schema.sql"), "utf8")
      .then((schema) => schema
        .replace(/^CREATE DATABASE IF NOT EXISTS[\s\S]*?;\s*/mi, "")
        .replace(/^USE\s+[^;]+;\s*/mi, ""))
      .then((schema) => pool.query(schema))
      .catch((error) => {
        schemaInitialization = undefined;
        throw error;
      });
  }
  return schemaInitialization;
}

async function inTransaction(work) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = { pool, inTransaction, initializeDatabase };
