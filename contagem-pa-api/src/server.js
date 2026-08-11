require('dotenv').config();

// ===== FAIL-FAST: valida o ambiente ANTES de subir =====
const OBRIGATORIAS = ['JWT_SECRET', 'DATABASE_URL'];
const faltando = OBRIGATORIAS.filter(v => !process.env[v]);
if (faltando.length > 0) {
  console.error(`FALHA DE AMBIENTE: variáveis ausentes no .env: ${faltando.join(', ')}. O servidor não será iniciado.`);
  process.exit(1);
}
for (const v of ['ORACLE_USER', 'ORACLE_PASSWORD', 'ORACLE_CONN_STRING']) {
  if (!process.env[v]) console.warn(`AVISO: ${v} não definida — as consultas ao Oracle MV vão falhar.`);
}

const express = require('express');
const cors = require('cors');

const pool = require('./config/databasePg');
const { fecharPoolOracle } = require('./config/databaseOracle');
const { verificarLicenca } = require('./config/licenca');

// Trava de avaliação: verifica no arranque e a cada 6 horas
verificarLicenca();
setInterval(verificarLicenca, 6 * 60 * 60 * 1000).unref();

const app = express();

// Atrás do IIS/ARR: respeita X-Forwarded-For (necessário para o rate-limit por IP)
app.set('trust proxy', 1);

app.use(cors());
app.use(express.json());

// Rota de status ABERTA (health-check do IIS/NSSM) — declarada ANTES do
// router protegido, senão o verificarToken a intercepta
app.get('/api/status', (req, res) => {
  res.status(200).json({
    sistema: 'API PA Contagem',
    status: 'Online',
    timestamp: new Date()
  });
});

const apiRoutes = require('./routes/api.routes');
app.use('/api', apiRoutes);

const PORT = process.env.PORT || 3333;

const server = app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);

  // Aquecimento em segundo plano: abre a primeira conexão Oracle (thick, lenta)
  // e pré-calcula os indicadores do dia — o primeiro usuário não espera nada
  const SupervisaoController = require('./controllers/SupervisaoController');
  SupervisaoController.aquecerIndicadores();
});

// ===== ENCERRAMENTO GRACIOSO (NSSM/pm2 enviam SIGINT/SIGTERM no stop) =====
async function encerrar(sinal) {
  console.log(`${sinal} recebido. Encerrando com segurança...`);
  server.close(async () => {
    try { await fecharPoolOracle(); } catch (erro) { console.error('Erro ao fechar pool Oracle:', erro); }
    try { await pool.end(); } catch (erro) { console.error('Erro ao fechar pool PostgreSQL:', erro); }
    console.log('Conexões encerradas. Até logo.');
    process.exit(0);
  });
  // Trava de segurança: se algo não fechar em 10s, força a saída
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGINT', () => encerrar('SIGINT'));
process.on('SIGTERM', () => encerrar('SIGTERM'));
