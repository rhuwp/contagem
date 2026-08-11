const jwt = require('jsonwebtoken');
const pool = require('../config/databasePg');

// Middleware para verificar se o usuário está logado
const verificarToken = (req, res, next) => {
  // Pega o token do cabeçalho da requisição
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ erro: 'Token nao fornecido. Acesso negado.' });
  }

  // O padrão é "Bearer token12345...", então separamos pelo espaço
  const parts = authHeader.split(' ');

  if (parts.length !== 2) {
    return res.status(401).json({ erro: 'Erro no formato do Token.' });
  }

  const [scheme, token] = parts;

  if (!/^Bearer$/i.test(scheme)) {
    return res.status(401).json({ erro: 'Token mal formatado.' });
  }

  // Verifica se o token é real ou se foi falsificado
  jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
    if (err) {
      return res.status(401).json({ erro: 'Token invalido ou expirado.' });
    }

    try {
      // SEGURANÇA: revalida o usuário no banco a cada requisição.
      // Usuário desativado perde o acesso IMEDIATAMENTE (não só quando o token expira).
      const { rows } = await pool.query(
        'SELECT ativo, trocar_senha FROM usuarios WHERE id = $1',
        [decoded.id]
      );

      if (rows.length === 0 || !rows[0].ativo) {
        return res.status(401).json({ erro: 'Utilizador inativo ou não encontrado. Acesso revogado.' });
      }

      // SEGURANÇA: quem tem troca de senha pendente só pode acessar a rota de redefinição
      if (rows[0].trocar_senha && req.path !== '/auth/redefinir-senha-inicial') {
        return res.status(403).json({ erro: 'Troca de senha obrigatória pendente. Conclua a redefinição para continuar.' });
      }

      req.usuarioLogado = decoded;
      return next();
    } catch (erro) {
      console.error('Erro ao validar utilizador do token:', erro);
      return res.status(500).json({ erro: 'Falha na validação de acesso.' });
    }
  });
};

// Middleware para verificar se o usuário tem a permissão correta (Role)
const verificarRole = (rolesPermitidas) => {
  return (req, res, next) => {
    if (!req.usuarioLogado || !rolesPermitidas.includes(req.usuarioLogado.role)) {
      return res.status(403).json({ erro: 'Voce nao tem permissao para acessar este recurso.' });
    }
    return next();
  };
};

// ============================================================
// Rate-limit simples em memória para o login (sem dependências):
// máximo de 10 tentativas por IP a cada 15 minutos.
// ============================================================
const tentativasLogin = new Map();
const JANELA_MS = 15 * 60 * 1000;
const MAX_TENTATIVAS = 10;

const limitarTentativasLogin = (req, res, next) => {
  const ip = req.ip || 'desconhecido';
  const agora = Date.now();
  const registro = tentativasLogin.get(ip);

  if (!registro || agora - registro.inicio > JANELA_MS) {
    tentativasLogin.set(ip, { inicio: agora, contagem: 1 });
    return next();
  }

  registro.contagem++;
  if (registro.contagem > MAX_TENTATIVAS) {
    return res.status(429).json({ erro: 'Muitas tentativas de login. Aguarde 15 minutos e tente novamente.' });
  }
  return next();
};

// Higiene: limpa entradas expiradas periodicamente
setInterval(() => {
  const agora = Date.now();
  for (const [ip, registro] of tentativasLogin) {
    if (agora - registro.inicio > JANELA_MS) tentativasLogin.delete(ip);
  }
}, JANELA_MS).unref();

module.exports = { verificarToken, verificarRole, limitarTentativasLogin };
