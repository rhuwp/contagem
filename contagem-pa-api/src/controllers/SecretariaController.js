const pool = require('../config/databasePg');

const SecretariaController = {
  async abrirPedidoCota(req, res) {
    const { medico_id, medico_nome, medico_crm, secretaria_id, quantidade_solicitada, observacao } = req.body;
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // RESET DA FILA: Quando entra um médico novo, todos voltam ao estado inicial de tempo
      // para que a ordem de criação defina o primeiro ciclo.
      await client.query("UPDATE pedidos_cota SET ultimo_encaminhamento_em = NULL WHERE status = 'ABERTO'");

      const queryInsert = `
        INSERT INTO pedidos_cota (
          medico_id, medico_nome, medico_crm, secretaria_id, 
          quantidade_solicitada, quantidade_restante, status, observacao
        ) 
        VALUES ($1, $2, $3, $4, $5, $6, 'ABERTO', $7) RETURNING *;
      `;
      
      const values = [String(medico_id), medico_nome, medico_crm, secretaria_id, quantidade_solicitada, quantidade_solicitada, observacao];
      const { rows } = await client.query(queryInsert, values);

      await client.query('COMMIT');
      return res.status(201).json(rows[0]);
    } catch (erro) {
      await client.query('ROLLBACK');
      console.error('Erro ao abrir cota:', erro);
      return res.status(500).json({ erro: 'Erro ao abrir cota.' });
    } finally {
      client.release();
    }
  },

  async listarCotasAtivas(req, res) {
    try {
      // ORDENAÇÃO DO RODÍZIO: Quem nunca atendeu (NULL) primeiro, seguido de quem atendeu há mais tempo
      const query = `
        SELECT * FROM pedidos_cota 
        WHERE status IN ('ABERTO', 'PAUSADO')
        ORDER BY ultimo_encaminhamento_em ASC NULLS FIRST, criado_em ASC;
      `;
      const { rows } = await pool.query(query);
      return res.status(200).json(rows);
    } catch (error) {
      return res.status(500).json({ erro: 'Erro ao listar cotas.' });
    }
  },

  async cancelarCota(req, res) {
    const { id } = req.params;
    try {
      await pool.query("UPDATE pedidos_cota SET status = 'CANCELADO' WHERE id = $1", [id]);
      return res.status(200).json({ mensagem: 'Cota cancelada.' });
    } catch (error) {
      return res.status(500).json({ erro: 'Erro ao cancelar.' });
    }
  }
};

module.exports = SecretariaController;