const pool = require('../config/databasePg');

// Fila montada pela recepção do PA: sem cotas, apenas ordem de chegada dos médicos.
// Registros nunca são apagados (soft delete) para manter auditoria de quem
// adicionou e removeu cada médico.
const FilaRecepcaoController = {
  async listar(req, res) {
    try {
      const { rows } = await pool.query(`
        SELECT id, medico_id, medico_nome, medico_crm, adicionado_por_nome, criado_em,
               total_encaminhados, ultimo_envio_em
        FROM fila_recepcao_pa
        WHERE status = 'ATIVO'
        ORDER BY criado_em ASC
      `);
      return res.status(200).json(rows);
    } catch (erro) {
      console.error('Erro ao listar fila da recepção:', erro);
      return res.status(500).json({ erro: 'Falha ao listar a fila da recepção.' });
    }
  },

  async adicionar(req, res) {
    const { medico_id, medico_nome, medico_crm } = req.body;
    const usuario = req.usuarioLogado;

    if (!medico_id || !medico_nome) {
      return res.status(400).json({ erro: 'Dados do médico ausentes.' });
    }

    try {
      // Evita o mesmo médico duas vezes na fila ativa
      const { rows: existentes } = await pool.query(
        "SELECT id FROM fila_recepcao_pa WHERE medico_id = $1 AND status = 'ATIVO' LIMIT 1",
        [String(medico_id)]
      );
      if (existentes.length > 0) {
        return res.status(409).json({ erro: 'Este médico já está na fila da recepção.' });
      }

      // Auditoria: quem adicionou vem do token, nunca do body
      const { rows } = await pool.query(`
        INSERT INTO fila_recepcao_pa (medico_id, medico_nome, medico_crm, adicionado_por, adicionado_por_nome)
        VALUES ($1, $2, $3, $4, $5) RETURNING *
      `, [String(medico_id), medico_nome, medico_crm || null, usuario.id, usuario.nome]);

      return res.status(201).json(rows[0]);
    } catch (erro) {
      console.error('Erro ao adicionar médico à fila da recepção:', erro);
      return res.status(500).json({ erro: 'Falha ao adicionar o médico à fila.' });
    }
  },

  // Contador de pacientes enviados: incrementa a cada envio (inverso da fila de cotas).
  // Com { desfazer: true } no body, decrementa (correção de clique errado), nunca abaixo de 0.
  async encaminhar(req, res) {
    const { id } = req.params;
    const desfazer = req.body?.desfazer === true;

    try {
      const query = desfazer
        ? `UPDATE fila_recepcao_pa
           SET total_encaminhados = GREATEST(total_encaminhados - 1, 0)
           WHERE id = $1 AND status = 'ATIVO'
           RETURNING total_encaminhados`
        : `UPDATE fila_recepcao_pa
           SET total_encaminhados = total_encaminhados + 1, ultimo_envio_em = NOW()
           WHERE id = $1 AND status = 'ATIVO'
           RETURNING total_encaminhados`;

      const { rows } = await pool.query(query, [id]);

      if (rows.length === 0) {
        return res.status(404).json({ erro: 'Médico não encontrado na fila ativa.' });
      }

      return res.status(200).json({ total_encaminhados: rows[0].total_encaminhados });
    } catch (erro) {
      console.error('Erro ao atualizar contador da fila da recepção:', erro);
      return res.status(500).json({ erro: 'Falha ao atualizar o contador de encaminhamentos.' });
    }
  },

  async remover(req, res) {
    const { id } = req.params;
    const usuario = req.usuarioLogado;

    try {
      const result = await pool.query(`
        UPDATE fila_recepcao_pa
        SET status = 'REMOVIDO', removido_em = NOW(), removido_por = $1, removido_por_nome = $2
        WHERE id = $3 AND status = 'ATIVO'
      `, [usuario.id, usuario.nome, id]);

      if (result.rowCount === 0) {
        return res.status(404).json({ erro: 'Registro não encontrado ou já removido.' });
      }

      return res.status(200).json({ mensagem: 'Médico removido da fila da recepção.' });
    } catch (erro) {
      console.error('Erro ao remover médico da fila da recepção:', erro);
      return res.status(500).json({ erro: 'Falha ao remover o médico da fila.' });
    }
  }
};

module.exports = FilaRecepcaoController;
