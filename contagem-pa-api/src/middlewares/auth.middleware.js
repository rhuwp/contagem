const jwt = require('jsonwebtoken');

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
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).json({ erro: 'Token invalido ou expirado.' });
    }

    // Se estiver tudo certo, coloca os dados do usuário na requisição e deixa passar
    req.usuarioLogado = decoded;
    return next();
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

module.exports = { verificarToken, verificarRole };