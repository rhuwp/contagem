const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('connect', () => {
  console.log('Conexao com PostgreSQL estabelecida com sucesso.');
});

pool.on('error', (err) => {
  // NÃO derruba o processo: o pool descarta a conexão com problema e
  // abre outra na próxima consulta. Derrubar aqui mataria o serviço
  // inteiro por um soluço de rede.
  console.error('Erro no pool do PostgreSQL (conexão ociosa):', err.message);
});

module.exports = pool;