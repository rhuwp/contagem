const express = require('express');
const router = express.Router();

const SecretariaController = require('../controllers/SecretariaController');
const FilaController = require('../controllers/FilaController');
const AuthController = require('../controllers/AuthController');
const MedicoController = require('../controllers/MedicoController');
const SupervisaoController = require('../controllers/SupervisaoController');
const AdminController = require('../controllers/AdminController');
const FilaRecepcaoController = require('../controllers/FilaRecepcaoController');

// Importação unificada e correta dos middlewares de segurança
const { verificarToken, verificarRole, limitarTentativasLogin } = require('../middlewares/auth.middleware');

// --- ROTAS ABERTAS ---
// Rate-limit: máx. 10 tentativas de login por IP a cada 15 minutos
router.post('/auth/login', limitarTentativasLogin, AuthController.login);

// --- ROTAS PROTEGIDAS (Exige Token) ---
router.use(verificarToken);

// Rota para troca de senha obrigatória (Primeiro Acesso)
router.post('/auth/redefinir-senha-inicial', AuthController.alterarSenhaPrimeiroAcesso);

// --- ROTA DE MÉDICOS ---
router.get('/medicos', MedicoController.listarMedicos);

// --- ROTAS DA SECRETARIA ---
router.post('/secretaria/cota', verificarRole(['secretaria', 'admin']), SecretariaController.abrirPedidoCota);
router.get('/secretaria/cotas-ativas', verificarRole(['secretaria', 'pa', 'admin']), SecretariaController.listarCotasAtivas);
router.put('/secretaria/cota/:id/cancelar', verificarRole(['secretaria', 'admin']), SecretariaController.cancelarCota);

// --- ROTAS DO PA ---
router.post('/pa/encaminhar', verificarRole(['pa', 'admin']), FilaController.encaminharPaciente);
router.post('/pa/excecao', verificarRole(['pa', 'admin']), FilaController.enviarExcecao);
router.get('/pa/indicadores', verificarRole(['pa', 'supervisao', 'admin']), SupervisaoController.obterIndicadoresPa);
router.get('/pa/relatorio-plantao', verificarRole(['pa', 'supervisao', 'admin']), SupervisaoController.obterRelatorioPlantao);

// Fila da Recepção do PA (sem cotas, montada manualmente pela recepção)
router.get('/pa/fila-recepcao', verificarRole(['pa', 'supervisao', 'admin']), FilaRecepcaoController.listar);
router.post('/pa/fila-recepcao', verificarRole(['pa', 'admin']), FilaRecepcaoController.adicionar);
router.put('/pa/fila-recepcao/:id/encaminhar', verificarRole(['pa', 'admin']), FilaRecepcaoController.encaminhar);
router.delete('/pa/fila-recepcao/:id', verificarRole(['pa', 'admin']), FilaRecepcaoController.remover);

// --- ROTAS DA SUPERVISÃO ---
router.get('/supervisao/dashboard', verificarRole(['supervisao', 'admin']), SupervisaoController.obterDashboard);
// Passagem de plantão: usada pela Supervisão e pela recepção do PA (mesmo documento)
router.post('/supervisao/plantao', verificarRole(['supervisao', 'pa', 'admin']), SupervisaoController.registrarPlantao);

// --- ROTAS DA ADMINISTRAÇÃO (Apenas TI / Admin) ---
router.get('/admin/usuarios', verificarRole(['admin']), AdminController.listarUsuarios);
router.post('/admin/usuarios', verificarRole(['admin']), AdminController.criarUsuario);

// Rota para alternar o status do colaborador (Ativar/Desativar)
router.put('/admin/usuarios/:id/status', verificarRole(['admin']), AdminController.alternarStatusUsuario);

// Rota para redefinir senha via Admin (Gerencial)
router.put('/admin/usuarios/:id/senha', verificarRole(['admin']), AdminController.redefinirSenha);

// Rota para inserir médicos manualmente no Postgres
router.post('/admin/medicos', verificarRole(['admin']), AdminController.criarMedico);

// Rotas de Taxonomia Clínica (Queixas)
router.get('/admin/queixas', verificarRole(['admin']), AdminController.listarQueixas);
router.post('/admin/queixas', verificarRole(['admin']), AdminController.adicionarQueixa);
router.delete('/admin/queixas/:id', verificarRole(['admin']), AdminController.removerQueixa);

module.exports = router;