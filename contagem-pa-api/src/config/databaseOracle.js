require('dotenv').config();
const oracledb = require('oracledb');

// Configuração global para que o Oracle devolva objetos JSON fáceis de ler
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

// === ATIVAÇÃO DO MODO THICK (Driver Nativo C++) ===
// Resolve o Erro NJS-116 lendo o hash de senha antigo do MV.
// Caminho configurável via .env (ORACLE_CLIENT_DIR) para portabilidade entre máquinas.
const oracleClientDir = process.env.ORACLE_CLIENT_DIR || 'C:\\oracle\\instantclient_23_0';
try {
  oracledb.initOracleClient({ libDir: oracleClientDir });
  console.log(`✅ Oracle Client (Thick Mode) inicializado: ${oracleClientDir}`);
} catch (err) {
  console.error(`❌ Falha ao inicializar o Oracle Thick Mode em "${oracleClientDir}". Ajuste ORACLE_CLIENT_DIR no .env:`, err.message);
}

// Pool de conexões: criado uma única vez, reutilizado por todas as requisições.
// connection.close() devolve a conexão ao pool (não encerra de fato).
let poolPromise = null;

async function getOracleConnection() {
  // Trava de segurança do .env
  if (!process.env.ORACLE_CONN_STRING) {
    console.error('FALHA DE AMBIENTE: A variável ORACLE_CONN_STRING não foi encontrada no ficheiro .env');
    throw new Error('Configuração de banco de dados ausente.');
  }

  try {
    if (!poolPromise) {
      poolPromise = oracledb.createPool({
        user: process.env.ORACLE_USER,
        password: process.env.ORACLE_PASSWORD,
        connectString: process.env.ORACLE_CONN_STRING,
        poolMin: 1,   // mantém 1 conexão viva: evita o custo da conexão fria a cada rajada
        poolMax: 4,
        poolIncrement: 1
      });
    }
    const pool = await poolPromise;
    return await pool.getConnection();
  } catch (erro) {
    poolPromise = null; // permite nova tentativa na próxima requisição
    console.error('Erro crítico ao conectar no Oracle MV:', erro);
    throw erro;
  }
}

// Fecha o pool no encerramento gracioso do serviço
async function fecharPoolOracle() {
  if (!poolPromise) return;
  try {
    const pool = await poolPromise;
    await pool.close(10); // aguarda até 10s pelas conexões em uso
    poolPromise = null;
  } catch (erro) {
    console.error('Erro ao fechar o pool Oracle:', erro.message);
  }
}

module.exports = { getOracleConnection, fecharPoolOracle };