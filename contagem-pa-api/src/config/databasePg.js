const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('connect', () => {
  console.log('Conexao com PostgreSQL estabelecida com sucesso.');
});

pool.on('error', (err) => {
  console.error('Erro critico na conexao com PostgreSQL:', err);
  process.exit(-1);
});

module.exports = pool;