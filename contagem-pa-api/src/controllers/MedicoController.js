const pool = require('../config/databasePg'); // <- Adicionado o Postgres
const { getOracleConnection } = require('../config/databaseOracle');

const MedicoController = {
  async listarMedicos(req, res) {
    let connection;

    try {
      connection = await getOracleConnection();

      // 1. Consulta padrão do MV (Oracle)
      const query = `
        SELECT 
          CD_PRESTADOR, 
          NM_PRESTADOR, 
          DS_CODIGO_CONSELHO 
        FROM DBAMV.PRESTADOR 
        WHERE TP_SITUACAO = 'A' 
        AND CD_TIP_PRESTA = '8'
          AND DS_CODIGO_CONSELHO IS NOT NULL
        ORDER BY NM_PRESTADOR ASC
      `;
      const result = await connection.execute(query);

      // 2. Consulta das queixas importadas (PostgreSQL)
      const queryQueixas = 'SELECT medico_nome, queixa FROM medico_queixas';
      const { rows: queixasPg } = await pool.query(queryQueixas);

      // 3. Cruzamento de Dados (Merge)
      const medicosFormatados = result.rows.map(p => {
        const nomeOracle = p.NM_PRESTADOR.trim().toUpperCase();
        
        // Encontra todas as queixas deste médico específico
        const queixasDesteMedico = queixasPg
          .filter(q => q.medico_nome && q.medico_nome.trim().toUpperCase() === nomeOracle)
          .map(q => q.queixa);

        return {
          id: p.CD_PRESTADOR,
          nome: p.NM_PRESTADOR,
          crm: p.DS_CODIGO_CONSELHO,
          queixas: queixasDesteMedico // <- Nova propriedade com o Array de queixas
        };
      });

      return res.status(200).json(medicosFormatados);

    } catch (erro) {
      console.error('Erro ao listar médicos do Oracle e PG:', erro);
      return res.status(500).json({ erro: 'Falha ao buscar a lista de médicos no sistema.' });
    } finally {
      if (connection) {
        try { await connection.close(); } catch (err) { console.error(err); }
      }
    }
  }
};

module.exports = MedicoController;