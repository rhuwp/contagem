const pool = require('../config/databasePg');

const SecretariaController = {
  async abrirPedidoCota(req, res) {
    const { medico_id, medico_nome, medico_crm, quantidade_solicitada, observacao, fila_continua } = req.body;
    // SEGURANÇA: a secretária é identificada pelo token, não pelo body (evita log forjado)
    const secretaria_id = req.usuarioLogado.id;

    const continua = fila_continua === true;
    const qtd = Number(quantidade_solicitada);

    if (!medico_id || !medico_nome) {
      return res.status(400).json({ erro: 'Dados do médico ausentes.' });
    }
    // Cota contínua não tem limite de vagas; cota normal exige quantidade válida
    if (!continua && (!Number.isInteger(qtd) || qtd < 1)) {
      return res.status(400).json({ erro: 'Quantidade solicitada inválida. Informe um número inteiro maior que zero.' });
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // TRAVA DE DUPLICIDADE: um médico só pode ter UMA cota ativa por vez
      const { rows: existentes } = await client.query(
        "SELECT id FROM pedidos_cota WHERE medico_id = $1 AND status IN ('ABERTO', 'PAUSADO') LIMIT 1 FOR UPDATE",
        [String(medico_id)]
      );
      if (existentes.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ erro: 'Este médico já possui uma cota ativa na fila. Cancele a cota atual antes de abrir outra.' });
      }

      // RESET DA FILA: Quando entra um médico novo, todos voltam ao estado inicial de tempo
      // para que a ordem de criação defina o primeiro ciclo.
      await client.query("UPDATE pedidos_cota SET ultimo_encaminhamento_em = NULL WHERE status = 'ABERTO'");

      const queryInsert = `
        INSERT INTO pedidos_cota (
          medico_id, medico_nome, medico_crm, secretaria_id,
          quantidade_solicitada, quantidade_restante, status, observacao, fila_continua
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'ABERTO', $7, $8) RETURNING *;
      `;

      const values = [
        String(medico_id), medico_nome, medico_crm, secretaria_id,
        continua ? 0 : qtd, continua ? 0 : qtd, observacao, continua
      ];
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
      // ORDENAÇÃO DO RODÍZIO: Quem nunca atendeu (NULL) primeiro, seguido de quem atendeu há mais tempo.
      // Inclui o nome de quem abriu a cota e o total já encaminhado (útil para cotas contínuas).
      const query = `
        SELECT
          p.*,
          u.nome AS secretaria_nome,
          (SELECT COUNT(*)::int FROM encaminhamentos_pa e
            WHERE e.pedido_cota_id = p.id AND e.tipo_envio = 'NORMAL') AS total_encaminhados
        FROM pedidos_cota p
        LEFT JOIN usuarios u ON u.id::text = p.secretaria_id::text
        WHERE p.status IN ('ABERTO', 'PAUSADO')
        ORDER BY p.ultimo_encaminhamento_em ASC NULLS FIRST, p.criado_em ASC;
      `;
      const { rows } = await pool.query(query);
      return res.status(200).json(rows);
    } catch (error) {
      console.error('Erro ao listar cotas:', error);
      return res.status(500).json({ erro: 'Erro ao listar cotas.' });
    }
  },

  async cancelarCota(req, res) {
    const { id } = req.params;
    const usuario = req.usuarioLogado;

    try {
      const { rows } = await pool.query('SELECT secretaria_id, status FROM pedidos_cota WHERE id = $1', [id]);

      if (rows.length === 0) {
        return res.status(404).json({ erro: 'Cota não encontrada.' });
      }

      const cota = rows[0];

      if (!['ABERTO', 'PAUSADO'].includes(cota.status)) {
        return res.status(400).json({ erro: 'Esta cota não está mais ativa.' });
      }

      // TRAVA: apenas a secretária que abriu a cota (ou um admin) pode cancelá-la
      if (usuario.role !== 'admin' && String(cota.secretaria_id) !== String(usuario.id)) {
        return res.status(403).json({ erro: 'Apenas a secretária que abriu esta cota pode cancelá-la.' });
      }

      await pool.query("UPDATE pedidos_cota SET status = 'CANCELADO', atualizado_em = NOW() WHERE id = $1", [id]);
      return res.status(200).json({ mensagem: 'Cota cancelada.' });
    } catch (error) {
      console.error('Erro ao cancelar cota:', error);
      return res.status(500).json({ erro: 'Erro ao cancelar.' });
    }
  }
};

module.exports = SecretariaController;