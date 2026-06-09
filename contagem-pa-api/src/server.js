require('dotenv').config();
const express = require('express');
const cors = require('cors');

// Inicializa a conexao com o banco de dados no arranque
require('./config/databasePg');

const app = express();

app.use(cors());
app.use(express.json());

// Importa e usa as rotas que acabamos de criar
const apiRoutes = require('./routes/api.routes');
app.use('/api', apiRoutes);

// Rota basica de status
app.get('/api/status', (req, res) => {
  res.status(200).json({
    sistema: 'API PA Contagem',
    status: 'Online',
    timestamp: new Date()
  });
});

const PORT = process.env.PORT || 3333;

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});