require('dotenv').config();
const oracledb = require('oracledb');

// Configuração global para que o Oracle devolva objetos JSON fáceis de ler
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

// === ATIVAÇÃO DO MODO THICK (Driver Nclsativo C++) ===
// Resolve o Erro NJS-116 lendo o hash de senha antigo do MV
try {
  oracledb.initOracleClient({ libDir: 'C:\\oracle\\instantclient_23_0' });
  console.log('✅ Oracle Client (Thick Mode) inicializado com sucesso.');
} catch (err) {
  console.error('❌ Falha ao inicializar o Oracle Thick Mode. Verifique o caminho:', err);
}

async function getOracleConnection() {
  // Trava de segurança do .env
  if (!process.env.ORACLE_CONN_STRING) {
    console.error('FALHA DE AMBIENTE: A variável ORACLE_CONN_STRING não foi encontrada no ficheiro .env');
    throw new Error('Configuração de banco de dados ausente.');
  }

  try {
    const connection = await oracledb.getConnection({
      user: process.env.ORACLE_USER,
      password: process.env.ORACLE_PASSWORD,
      connectString: process.env.ORACLE_CONN_STRING
    });
    return connection;
  } catch (erro) {
    console.error('Erro crítico ao conectar no Oracle MV:', erro);
    throw erro;
  }
}

module.exports = { getOracleConnection };