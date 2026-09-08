const { Pool } = require('pg');

// В Cloud Run мы подключаемся к Cloud SQL через Unix-сокет,
// который монтируется автоматически при флаге --add-cloudsql-instances.
// Локально (или без Cloud SQL Connector) подключаемся обычным способом через host/port.

const socketPath = process.env.DB_SOCKET_PATH; // например: /cloudsql/PROJECT:REGION:INSTANCE

const poolConfig = socketPath
  ? {
      host: socketPath,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      max: 5,
    }
  : {
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT) || 5432,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      max: 5,
    };

const pool = new Pool(poolConfig);

module.exports = pool;
