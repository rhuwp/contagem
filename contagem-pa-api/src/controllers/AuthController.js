const pool = require('../config/databasePg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const AuthController = {
  // 1. Rota de Login com Verificação de Primeiro Acesso
  async login(req, res) {
    const { usuario, senha } = req.body;

    if (!usuario || !senha) {
      return res.status(400).json({ erro: 'Credencial corporativa e senha são obrigatórios.' });
    }

    try {
      // Busca o usuário e verifica se está ativo
      const { rows } = await pool.query('SELECT * FROM usuarios WHERE usuario = $1 AND ativo = TRUE', [usuario]);
      const dadosUsuario = rows[0];

      if (!dadosUsuario) {
        return res.status(401).json({ erro: 'Credenciais inválidas ou utilizador inativo.' });
      }

      // Compara a senha
      const senhaValida = await bcrypt.compare(senha, dadosUsuario.senha_hash);
      
      if (!senhaValida) {
        return res.status(401).json({ erro: 'Credenciais inválidas.' });
      }

      // Gera o Token JWT
      const token = jwt.sign(
        { id: dadosUsuario.id, role: dadosUsuario.role, nome: dadosUsuario.nome },
        process.env.JWT_SECRET,
        { expiresIn: '8h' }
      );

      // Retorna os dados incluindo a flag de troca de senha
      return res.status(200).json({
        mensagem: 'Login realizado com sucesso.',
        token,
        usuario: {
          id: dadosUsuario.id,
          nome: dadosUsuario.nome,
          usuario: dadosUsuario.usuario,
          role: dadosUsuario.role,
          trocar_senha: dadosUsuario.trocar_senha // Flag para controle no Frontend
        }
      });

    } catch (erro) {
      console.error('Erro no login:', erro);
      return res.status(500).json({ erro: 'Falha interna no servidor.' });
    }
  },

  // 2. Rota para Alterar Senha (Obrigatório no Primeiro Acesso)
  // SEGURANÇA: o id vem do token JWT (req.usuarioLogado), nunca do body,
  // para impedir que um usuário troque a senha de outro (IDOR).
  async alterarSenhaPrimeiroAcesso(req, res) {
    const { novaSenha } = req.body;
    const id = req.usuarioLogado.id;

    if (!novaSenha || novaSenha.length < 6) {
      return res.status(400).json({ erro: 'A nova senha deve ter no mínimo 6 caracteres.' });
    }

    try {
      const salt = await bcrypt.genSalt(10);
      const senha_hash = await bcrypt.hash(novaSenha, salt);

      // Atualiza a senha e desativa a flag de troca obrigatória
      const query = `
        UPDATE usuarios 
        SET senha_hash = $1, trocar_senha = FALSE, atualizado_em = NOW() 
        WHERE id = $2
      `;
      
      const result = await pool.query(query, [senha_hash, id]);

      if (result.rowCount === 0) {
        return res.status(404).json({ erro: 'Utilizador não encontrado.' });
      }

      return res.status(200).json({ mensagem: 'Senha atualizada com sucesso. Acesso liberado.' });
    } catch (erro) {
      console.error('Erro ao trocar senha inicial:', erro);
      return res.status(500).json({ erro: 'Falha ao atualizar senha.' });
    }
  }
};

module.exports = AuthController;