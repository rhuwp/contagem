const pool = require('../config/databasePg');
const bcrypt = require('bcrypt');

// Função auxiliar para normalizar e extrair "nome.sobrenome"
function gerarIdentificadorUsuario(nomeCompleto) {
  const stringNormalizada = nomeCompleto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const partes = stringNormalizada.split(/\s+/);
  
  if (partes.length === 1) return partes[0];
  return `${partes[0]}.${partes[partes.length - 1]}`;
}

const AdminController = {
  // 1. Criar um novo acesso (Utilizador) - AGORA GERA O NOME.SOBRENOME
  // 1. Criar um novo acesso (Utilizador) - AGORA GERA O NOME.SOBRENOME E NORMALIZA A ROLE
  async criarUsuario(req, res) {
    const { nome, senha, role } = req.body;

    if (!nome || !senha || !role) {
      return res.status(400).json({ erro: 'Os campos nome, senha e nível de acesso são obrigatórios.' });
    }

    try {
      const identificador = gerarIdentificadorUsuario(nome);
      const salt = await bcrypt.genSalt(10);
      const senha_hash = await bcrypt.hash(senha, salt);
      
      //  CORREÇÃO: Força a role a ficar em letras minúsculas para respeitar o ENUM do banco de dados
      const roleNormalizada = String(role).toLowerCase();
      
      // Insere o usuário forçando a troca de senha no primeiro acesso (trocar_senha = TRUE)
      const query = `
        INSERT INTO usuarios (nome, usuario, senha_hash, role, trocar_senha) 
        VALUES ($1, $2, $3, $4, TRUE) 
        RETURNING id, nome, usuario, role, criado_em;
      `;
      
      // Note que passamos a 'roleNormalizada' como o quarto parâmetro ($4)
      const { rows } = await pool.query(query, [nome, identificador, senha_hash, roleNormalizada]);
      
      return res.status(201).json({ 
        mensagem: 'Utilizador criado com sucesso.', 
        usuario: rows[0] 
      });

    } catch (erro) {
      if (erro.code === '23505') {
        return res.status(400).json({ erro: 'Este identificador corporativo já está registado no sistema.' });
      }
      console.error('Erro ao criar utilizador:', erro);
      return res.status(500).json({ erro: 'Falha interna ao criar utilizador.' });
    }
  },

  // 2. Redefinir senha de um utilizador existente pelo Admin
  async redefinirSenha(req, res) {
    const { id } = req.params; 
    const { novaSenha } = req.body;

    if (!novaSenha || novaSenha.length < 6) {
      return res.status(400).json({ erro: 'A nova senha deve ter pelo menos 6 caracteres.' });
    }

    try {
      const salt = await bcrypt.genSalt(10);
      const novo_hash = await bcrypt.hash(novaSenha, salt);
      
      // Se o Admin redefine a senha, obriga o usuário a trocar novamente quando logar
      const query = 'UPDATE usuarios SET senha_hash = $1, trocar_senha = TRUE, atualizado_em = NOW() WHERE id = $2';
      const result = await pool.query(query, [novo_hash, id]);

      if (result.rowCount === 0) {
        return res.status(404).json({ erro: 'Utilizador não encontrado.' });
      }

      return res.status(200).json({ mensagem: 'Senha redefinida com sucesso.' });

    } catch (erro) {
      console.error('Erro ao redefinir senha:', erro);
      return res.status(500).json({ erro: 'Falha ao processar redefinição de senha.' });
    }
  },

  // 3. Listar utilizadores para a tabela do painel - CORRIGIDO (usa 'usuario' em vez de 'email')
  async listarUsuarios(req, res) {
    try {
      // Aqui estava o erro! Trocado "email" por "usuario"
      const { rows } = await pool.query('SELECT id, nome, usuario, role, ativo, criado_em FROM usuarios ORDER BY nome ASC');
      return res.status(200).json(rows);
    } catch (erro) {
      console.error('Erro ao listar utilizadores:', erro);
      return res.status(500).json({ erro: 'Falha ao buscar utilizadores.' });
    }
  },

  // 3.5. Alternar Status do Utilizador (Ativar/Desativar)
  async alternarStatusUsuario(req, res) {
    const { id } = req.params;
    
    try {
      const resultBusca = await pool.query('SELECT ativo FROM usuarios WHERE id = $1', [id]);
      
      if (resultBusca.rowCount === 0) {
        return res.status(404).json({ erro: 'Utilizador não encontrado.' });
      }

      const statusAtual = resultBusca.rows[0].ativo;
      const novoStatus = !statusAtual; // Inverte o valor

      const query = 'UPDATE usuarios SET ativo = $1, atualizado_em = NOW() WHERE id = $2';
      await pool.query(query, [novoStatus, id]);

      return res.status(200).json({ 
        mensagem: `Acesso ${novoStatus ? 'ativado' : 'desativado'} com sucesso.`, 
        ativo: novoStatus 
      });

    } catch (erro) {
      console.error('Erro ao alternar status do utilizador:', erro);
      return res.status(500).json({ erro: 'Falha ao alterar o status do utilizador.' });
    }
  },

  // 4. Criar Médico Manual
  async criarMedico(req, res) {
    const { nome, crm } = req.body;

    if (!nome || !crm) {
      return res.status(400).json({ erro: 'Nome e CRM são obrigatórios.' });
    }

    try {
      const query = `
        INSERT INTO medicos (nome, crm) 
        VALUES ($1, $2) RETURNING *;
      `;
      const { rows } = await pool.query(query, [nome, crm]);
      return res.status(201).json(rows[0]);
    } catch (erro) {
      console.error('Erro ao criar médico:', erro);
      return res.status(500).json({ erro: 'Falha ao inserir médico no Postgres.' });
    }
  },

  // =========================================
  // MÉTODOS: TAXONOMIA CLÍNICA (QUEIXAS)
  // =========================================

  async listarQueixas(req, res) {
    try {
      const query = `
        SELECT id, medico_nome, queixa 
        FROM medico_queixas 
        ORDER BY medico_nome ASC, queixa ASC
      `;
      const { rows } = await pool.query(query);
      return res.status(200).json(rows);
    } catch (erro) {
      console.error('Erro ao listar queixas:', erro);
      return res.status(500).json({ erro: 'Falha ao processar a listagem de queixas.' });
    }
  },

  async adicionarQueixa(req, res) {
    const { medico_nome, queixa } = req.body;

    if (!medico_nome || !queixa) {
      return res.status(400).json({ erro: 'Nome do médico e descrição da queixa são obrigatórios.' });
    }

    try {
      const query = `
        INSERT INTO medico_queixas (medico_nome, queixa) 
        VALUES ($1, $2) RETURNING *
      `;
      const queixaFormatada = queixa.trim().charAt(0).toUpperCase() + queixa.trim().slice(1).toLowerCase();
      const valores = [medico_nome.trim().toUpperCase(), queixaFormatada];
      
      const { rows } = await pool.query(query, valores);
      return res.status(201).json(rows[0]);
    } catch (erro) {
      console.error('Erro ao inserir queixa:', erro);
      return res.status(500).json({ erro: 'Falha ao registrar nova queixa no banco de dados.' });
    }
  },

  async removerQueixa(req, res) {
    const { id } = req.params;

    try {
      const query = 'DELETE FROM medico_queixas WHERE id = $1 RETURNING id';
      const { rowCount } = await pool.query(query, [id]);

      if (rowCount === 0) {
        return res.status(404).json({ erro: 'Registro de queixa não encontrado.' });
      }

      return res.status(204).send(); 
    } catch (erro) {
      console.error('Erro ao remover queixa:', erro);
      return res.status(500).json({ erro: 'Falha ao remover a queixa médica.' });
    }
  }
};

module.exports = AdminController;