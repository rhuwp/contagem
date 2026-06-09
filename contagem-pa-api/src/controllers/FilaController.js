const pool = require('../config/databasePg');

const FilaController = {
  // FLUXO NORMAL
  async encaminharPaciente(req, res) {
    const { usuario_pa_id, paciente_identificador } = req.body;
    
    if (!usuario_pa_id || !paciente_identificador) {
      return res.status(400).json({ erro: 'Dados do paciente ou operador ausentes.' });
    }

    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // 1. Busca o nome do Operador do PA para o log
      const { rows: userRows } = await client.query('SELECT nome FROM usuarios WHERE id = $1', [usuario_pa_id]);
      const usuarioNome = userRows[0]?.nome || 'Operador Desconhecido';

      // 2. Busca o médico no topo do rodízio
      const queryBusca = `
        SELECT id, medico_id, medico_nome, quantidade_restante 
        FROM pedidos_cota 
        WHERE status = 'ABERTO' AND quantidade_restante > 0 
        ORDER BY ultimo_encaminhamento_em ASC NULLS FIRST, criado_em ASC 
        LIMIT 1 
        FOR UPDATE;
      `;
      const { rows } = await client.query(queryBusca);

      if (rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ erro: 'Não existem médicos com cotas disponíveis.' });
      }

      const pedidoAtual = rows[0];
      const novaQuantidade = pedidoAtual.quantidade_restante - 1;
      const novoStatus = novaQuantidade === 0 ? 'CONCLUIDO' : 'ABERTO';

      // 3. Atualiza cota e timestamp de rodízio
      await client.query(`
        UPDATE pedidos_cota 
        SET quantidade_restante = $1, status = $2, ultimo_encaminhamento_em = NOW(), atualizado_em = NOW()
        WHERE id = $3
      `, [novaQuantidade, novoStatus, pedidoAtual.id]);

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
    const { usuario_pa_id, pedido_cota_id, paciente_identificador, justificativa } = req.body;
    
    if (!justificativa || !pedido_cota_id) {
      return res.status(400).json({ erro: 'Dados de exceção incompletos.' });
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 1. Busca os nomes legíveis para salvar no banco
      const { rows: userRows } = await client.query('SELECT nome FROM usuarios WHERE id = $1', [usuario_pa_id]);
      const usuarioNome = userRows[0]?.nome || 'Operador Desconhecido';

      const { rows: cotaRows } = await client.query('SELECT medico_nome FROM pedidos_cota WHERE id = $1', [pedido_cota_id]);
      const medicoNome = cotaRows[0]?.medico_nome || 'Médico Desconhecido';

      // 2. MOVE o médico para o final da fila de rodízio (sem decrementar quantidade)
      const queryRotation = `
        UPDATE pedidos_cota 
        SET ultimo_encaminhamento_em = NOW(), atualizado_em = NOW()
        WHERE id = $1
      `;
      await client.query(queryRotation, [pedido_cota_id]);

      // 3. Registra o log legível
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