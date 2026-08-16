const pool = require('../config/databasePg');

const FilaController = {
  // FLUXO NORMAL
  async encaminharPaciente(req, res) {
    const { paciente_identificador, fila } = req.body;
    // SEGURANÇA: o operador é identificado pelo token, não pelo body (evita log forjado)
    const usuario_pa_id = req.usuarioLogado.id;
    const filaDestino = ['CONTAGEM', 'CONTAGEM_3'].includes(fila) ? fila : 'CONTAGEM';

    if (!paciente_identificador) {
      return res.status(400).json({ erro: 'Identificação do paciente ausente.' });
    }

    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // 1. Busca o nome do Operador do PA para o log
      const { rows: userRows } = await client.query('SELECT nome FROM usuarios WHERE id = $1', [usuario_pa_id]);
      const usuarioNome = userRows[0]?.nome || 'Operador Desconhecido';

      // 2. Busca o médico no topo do rodízio
      // Cota contínua participa do rodízio sem limite de vagas
      const queryBusca = `
        SELECT id, medico_id, medico_nome, quantidade_restante, fila_continua
        FROM pedidos_cota
        WHERE status = 'ABERTO' AND fila = $1 AND (fila_continua = TRUE OR quantidade_restante > 0)
        ORDER BY ultimo_encaminhamento_em ASC NULLS FIRST, criado_em ASC
        LIMIT 1
        FOR UPDATE;
      `;
      const { rows } = await client.query(queryBusca, [filaDestino]);

      if (rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ erro: 'Não existem médicos com cotas disponíveis.' });
      }

      const pedidoAtual = rows[0];

      if (pedidoAtual.fila_continua) {
        // 3a. Cota contínua: só gira o rodízio, nunca decrementa nem conclui
        await client.query(`
          UPDATE pedidos_cota
          SET ultimo_encaminhamento_em = NOW(), atualizado_em = NOW()
          WHERE id = $1
        `, [pedidoAtual.id]);
      } else {
        // 3b. Cota normal: decrementa e conclui ao zerar
        const novaQuantidade = pedidoAtual.quantidade_restante - 1;
        const novoStatus = novaQuantidade === 0 ? 'CONCLUIDO' : 'ABERTO';

        await client.query(`
          UPDATE pedidos_cota
          SET quantidade_restante = $1, status = $2, ultimo_encaminhamento_em = NOW(), atualizado_em = NOW()
          WHERE id = $3
        `, [novaQuantidade, novoStatus, pedidoAtual.id]);
      }

      // 4. Registra log legível para auditoria
      await client.query(`
        INSERT INTO encaminhamentos_pa (
          pedido_cota_id, usuario_pa_id, paciente_identificador, tipo_envio, medico_nome, usuario_nome
        ) 
        VALUES ($1, $2, $3, 'NORMAL', $4, $5)
      `, [pedidoAtual.id, usuario_pa_id, paciente_identificador, pedidoAtual.medico_nome, usuarioNome]);

      await client.query('COMMIT'); 

      return res.status(200).json({
        mensagem: 'Encaminhamento normal concluído.',
        medico_nome: pedidoAtual.medico_nome
      });

    } catch (erro) {
      await client.query('ROLLBACK');
      console.error('Erro no Rodízio Normal:', erro);
      return res.status(500).json({ erro: 'Falha no processamento da fila.' });
    } finally {
      client.release();
    }
  },

  // FLUXO EXCEÇÃO
  async enviarExcecao(req, res) {
    const { pedido_cota_id, paciente_identificador, justificativa } = req.body;
    // SEGURANÇA: o operador é identificado pelo token, não pelo body (evita log forjado)
    const usuario_pa_id = req.usuarioLogado.id;

    if (!justificativa || !pedido_cota_id) {
      return res.status(400).json({ erro: 'Dados de exceção incompletos.' });
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 1. Busca o nome do operador para o log
      const { rows: userRows } = await client.query('SELECT nome FROM usuarios WHERE id = $1', [usuario_pa_id]);
      const usuarioNome = userRows[0]?.nome || 'Operador Desconhecido';

      // 2. Busca e TRAVA a cota de destino (mesma proteção do fluxo normal)
      const { rows: cotaRows } = await client.query(
        'SELECT medico_nome, quantidade_restante, fila_continua, status FROM pedidos_cota WHERE id = $1 FOR UPDATE',
        [pedido_cota_id]
      );

      if (cotaRows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ erro: 'Cota não encontrada.' });
      }

      const cota = cotaRows[0];
      const medicoNome = cota.medico_nome || 'Médico Desconhecido';

      if (cota.status !== 'ABERTO') {
        await client.query('ROLLBACK');
        return res.status(400).json({ erro: 'Esta cota não está mais ativa.' });
      }
      if (!cota.fila_continua && cota.quantidade_restante <= 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ erro: 'Este médico não possui mais vagas disponíveis.' });
      }

      // 3. CONSOME a vaga (igual ao fluxo normal) e move o médico para o fim do rodízio.
      // Cota contínua: só gira o rodízio, sem decrementar.
      if (cota.fila_continua) {
        await client.query(`
          UPDATE pedidos_cota
          SET ultimo_encaminhamento_em = NOW(), atualizado_em = NOW()
          WHERE id = $1
        `, [pedido_cota_id]);
      } else {
        const novaQuantidade = cota.quantidade_restante - 1;
        const novoStatus = novaQuantidade === 0 ? 'CONCLUIDO' : 'ABERTO';

        await client.query(`
          UPDATE pedidos_cota
          SET quantidade_restante = $1, status = $2, ultimo_encaminhamento_em = NOW(), atualizado_em = NOW()
          WHERE id = $3
        `, [novaQuantidade, novoStatus, pedido_cota_id]);
      }

      // 4. Registra o log legível
      const queryLog = `
        INSERT INTO encaminhamentos_pa (
          pedido_cota_id, usuario_pa_id, paciente_identificador, tipo_envio, justificativa, medico_nome, usuario_nome
        ) 
        VALUES ($1, $2, $3, 'EXCECAO', $4, $5, $6)
      `;
      await client.query(queryLog, [pedido_cota_id, usuario_pa_id, paciente_identificador, justificativa, medicoNome, usuarioNome]);

      await client.query('COMMIT');

      return res.status(200).json({ mensagem: 'Exceção registada. Médico movido para o final do rodízio.' });

    } catch (erro) {
      await client.query('ROLLBACK');
      console.error('Erro no Rodízio de Exceção:', erro);
      return res.status(500).json({ erro: 'Falha ao processar exceção.' });
    } finally {
      client.release();
    }
  }
};

module.exports = FilaController;