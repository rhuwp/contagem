const pool = require('../config/databasePg');
const { getOracleConnection } = require('../config/databaseOracle');

const SupervisaoController = {
  async obterDashboard(req, res) {
    let oracleConn;
    const { data } = req.query;
    
    const dataHoje = new Date().toLocaleDateString('en-CA'); 
    const dataFiltro = data || dataHoje;

    try {
      // 1. DADOS POSTGRESQL (Rodízio e Auditoria)
      const queryCotas = 'SELECT * FROM pedidos_cota WHERE criado_em::date = $1';
      const { rows: cotas } = await pool.query(queryCotas, [dataFiltro]);
      
      const queryExcecoes = `
        SELECT 
          id, paciente_identificador, medico_nome, usuario_nome, justificativa, criado_em 
        FROM encaminhamentos_pa 
        WHERE tipo_envio = 'EXCECAO' AND criado_em::date = $1
        ORDER BY criado_em DESC
      `;
      const { rows: excecoes } = await pool.query(queryExcecoes, [dataFiltro]);
      const pacientesAtendidos = cotas.reduce((acc, c) => acc + (c.quantidade_solicitada - c.quantidade_restante), 0);
      
      // 2. DADOS ORACLE MV (Painel Global e SLA)
      oracleConn = await getOracleConnection();

      const queryOracle = `
        WITH FilaPA AS (
          SELECT DISTINCT  
              ta.cd_atendimento, 
              o.ds_ori_ate AS "Origem", 
              prest.nm_prestador AS "NOME MEDICO",
              ROUND((CAST(COALESCE(tp4.dh_processo, tp5.dh_processo, tp.dh_processo) AS DATE) - CAST(tp.dh_processo AS DATE)) * 24 * 60, 2) AS NUM_ESPERA_RECEP,
              ROUND((CAST(tp5.dh_processo AS DATE) - CAST(tp4.dh_processo AS DATE)) * 24 * 60, 2) AS NUM_TEMPO_CAD,
              ROUND((CAST(COALESCE(tp6.dh_processo, tp7.dh_processo) AS DATE) - CAST(tp5.dh_processo AS DATE)) * 24 * 60, 2) AS NUM_ESPERA_MEDICA,
              ROUND((CAST(tp8.dh_processo AS DATE) - CAST(tp7.dh_processo AS DATE)) * 24 * 60, 2) AS NUM_TEMPO_CONSULTA,
              ROUND((CAST(COALESCE(tp9.dh_processo, tp8.dh_processo) AS DATE) - CAST(COALESCE(tp.dh_processo, tp4.dh_processo) AS DATE)) * 24 * 60, 2) AS NUM_TEMPO_TOTAL
          FROM dbamv.triagem_atendimento ta
          LEFT JOIN dbamv.fila_senha fs ON fs.cd_fila_senha = ta.cd_fila_senha
          LEFT JOIN dbamv.sacr_tempo_processo tp ON ta.cd_atendimento = tp.cd_atendimento AND tp.cd_tipo_tempo_processo = 1
          LEFT JOIN dbamv.sacr_tempo_processo tp4 ON ta.cd_atendimento = tp4.cd_atendimento AND tp4.cd_tipo_tempo_processo = 21
          LEFT JOIN dbamv.sacr_tempo_processo tp5 ON ta.cd_atendimento = tp5.cd_atendimento AND tp5.cd_tipo_tempo_processo = 22
          LEFT JOIN dbamv.sacr_tempo_processo tp6 ON ta.cd_atendimento = tp6.cd_atendimento AND tp6.cd_tipo_tempo_processo = 30
          LEFT JOIN dbamv.sacr_tempo_processo tp7 ON ta.cd_atendimento = tp7.cd_atendimento AND tp7.cd_tipo_tempo_processo = 31
          LEFT JOIN dbamv.sacr_tempo_processo tp8 ON ta.cd_atendimento = tp8.cd_atendimento AND tp8.cd_tipo_tempo_processo = 32
          LEFT JOIN dbamv.sacr_tempo_processo tp9 ON ta.cd_atendimento = tp9.cd_atendimento AND tp9.cd_tipo_tempo_processo = 90
          LEFT JOIN dbamv.atendime a ON a.cd_atendimento = ta.cd_atendimento
          LEFT JOIN dbamv.ori_ate o ON a.cd_ori_ate = o.cd_ori_ate
          JOIN dbamv.prestador prest ON a.cd_prestador = prest.cd_prestador
          WHERE a.tp_atendimento = 'U' AND a.cd_ori_ate IN ('16','47')
            AND fs.ds_fila IN ('PRONTO ATENDIMENTO', 'PRONTO ATENDIMENTO UNIMED')
            AND TRUNC(a.dt_atendimento) = TO_DATE(:data_filtro, 'YYYY-MM-DD')
        )
        SELECT 
          COUNT(*) AS TOTAL,
          COUNT(CASE WHEN UPPER("Origem") = 'PA' THEN 1 END) AS PA,
          COUNT(CASE WHEN UPPER("Origem") LIKE '%CONTAGEM%' THEN 1 END) AS CONTAGEM,
          
          -- SEPARAÇÃO DOS MÉDICOS PELA ORIGEM REAL DO ATENDIMENTO
          COUNT(DISTINCT "NOME MEDICO") AS MEDICOS,
          COUNT(DISTINCT CASE WHEN UPPER("Origem") LIKE '%CONTAGEM%' THEN "NOME MEDICO" END) AS MEDICOS_CONTAGEM,
          COUNT(DISTINCT CASE WHEN UPPER("Origem") = 'PA' THEN "NOME MEDICO" END) AS MEDICOS_PA,
          
          ROUND(MEDIAN(CASE WHEN NUM_ESPERA_RECEP >= 0 THEN NUM_ESPERA_RECEP END), 0) AS M_RECEP,
          ROUND(MEDIAN(CASE WHEN NUM_TEMPO_CAD >= 0 THEN NUM_TEMPO_CAD END), 0) AS M_CAD,
          ROUND(MEDIAN(CASE WHEN NUM_ESPERA_MEDICA >= 0 THEN NUM_ESPERA_MEDICA END), 0) AS M_MED,
          ROUND(MEDIAN(CASE WHEN NUM_TEMPO_CONSULTA >= 0 THEN NUM_TEMPO_CONSULTA END), 0) AS M_CONS,
          ROUND(MEDIAN(CASE WHEN NUM_TEMPO_TOTAL >= 0 THEN NUM_TEMPO_TOTAL END), 0) AS M_TOTAL
        FROM FilaPA
      `;
      const resultOracle = await oracleConn.execute(queryOracle, { data_filtro: dataFiltro });
      const row = resultOracle.rows[0] || {}; 

      // 3. RANKINGS (Top 10 Convênios e CIDs)
      const baseJoins = `
        FROM dbamv.triagem_atendimento ta
        JOIN dbamv.atendime a ON a.cd_atendimento = ta.cd_atendimento
        LEFT JOIN dbamv.fila_senha fs ON fs.cd_fila_senha = ta.cd_fila_senha
      `;

      const condicoesWhere = `
        WHERE a.tp_atendimento = 'U' AND a.cd_ori_ate IN ('16','47')
        AND fs.ds_fila IN ('PRONTO ATENDIMENTO', 'PRONTO ATENDIMENTO UNIMED')
      `;

      const qTopConvDia = `SELECT * FROM (SELECT c.nm_convenio AS NOME, COUNT(*) as QUANTIDADE ${baseJoins} JOIN dbamv.convenio c ON a.cd_convenio = c.cd_convenio ${condicoesWhere} AND TRUNC(a.dt_atendimento) = TO_DATE(:data_filtro, 'YYYY-MM-DD') GROUP BY c.nm_convenio ORDER BY QUANTIDADE DESC) WHERE ROWNUM <= 10`;
      const qTopConvMes = `SELECT * FROM (SELECT c.nm_convenio AS NOME, COUNT(*) as QUANTIDADE ${baseJoins} JOIN dbamv.convenio c ON a.cd_convenio = c.cd_convenio ${condicoesWhere} AND TRUNC(a.dt_atendimento, 'MM') = TRUNC(TO_DATE(:data_filtro, 'YYYY-MM-DD'), 'MM') GROUP BY c.nm_convenio ORDER BY QUANTIDADE DESC) WHERE ROWNUM <= 10`;
      
      const qTopCidDia = `SELECT * FROM (SELECT cid.ds_cid AS NOME, COUNT(*) as QUANTIDADE ${baseJoins} JOIN dbamv.cid cid ON a.cd_cid = cid.cd_cid ${condicoesWhere} AND TRUNC(a.dt_atendimento) = TO_DATE(:data_filtro, 'YYYY-MM-DD') GROUP BY cid.ds_cid ORDER BY QUANTIDADE DESC) WHERE ROWNUM <= 10`;
      const qTopCidMes = `SELECT * FROM (SELECT cid.ds_cid AS NOME, COUNT(*) as QUANTIDADE ${baseJoins} JOIN dbamv.cid cid ON a.cd_cid = cid.cd_cid ${condicoesWhere} AND TRUNC(a.dt_atendimento, 'MM') = TRUNC(TO_DATE(:data_filtro, 'YYYY-MM-DD'), 'MM') GROUP BY cid.ds_cid ORDER BY QUANTIDADE DESC) WHERE ROWNUM <= 10`;

      const resConvDia = await oracleConn.execute(qTopConvDia, { data_filtro: dataFiltro });
      const resConvMes = await oracleConn.execute(qTopConvMes, { data_filtro: dataFiltro });
      const resCidDia = await oracleConn.execute(qTopCidDia, { data_filtro: dataFiltro });
      const resCidMes = await oracleConn.execute(qTopCidMes, { data_filtro: dataFiltro });

      return res.status(200).json({
        dataReferencia: dataFiltro,
        rodizio: { 
          cotasAtivas: cotas.filter(c => c.status === 'ABERTO').length, 
          pacientesAtendidos, 
          excecoesGeradas: excecoes.length, 
          detalhesExcecoes: excecoes
        },
        hospitalGlobal: {
          totalAtendimentosHoje: row.TOTAL || 0,
          medicosLogados: row.MEDICOS || 0,
          medicosPA: row.MEDICOS_PA || 0,
          medicosContagem: row.MEDICOS_CONTAGEM || 0,
          pacientesPA: row.PA || 0,
          pacientesContagem: row.CONTAGEM || 0,
          temposProcesso: {
            esperaRecepcao: row.M_RECEP || 0,
            cadastro: row.M_CAD || 0,
            esperaMedica: row.M_MED || 0,
            consulta: row.M_CONS || 0,
            permanenciaTotal: row.M_TOTAL || 0
          }
        },
        rankings: {
          conveniosDia: resConvDia.rows || [],
          conveniosMes: resConvMes.rows || [],
          cidsDia: resCidDia.rows || [],
          cidsMes: resCidMes.rows || []
        }
      });

    } catch (erro) {
      console.error('Erro na Supervisão:', erro);
      return res.status(500).json({ erro: 'Falha ao buscar indicadores.' });
    } finally {
      if (oracleConn) await oracleConn.close();
    }
  },

  async registrarPlantao(req, res) {
    const { supervisor_id, turno, pendencias, intercorrencias, observacoes } = req.body;
    try {
      const query = `
        INSERT INTO registros_plantao (supervisor_id, turno, pendencias, intercorrencias, observacoes) 
        VALUES ($1, $2, $3, $4, $5) RETURNING *;
      `;
      const { rows } = await pool.query(query, [supervisor_id, turno, pendencias, intercorrencias, observacoes]);
      return res.status(201).json({ mensagem: 'Plantão registado com sucesso.', registro: rows[0] });
    } catch (erro) {
      return res.status(500).json({ erro: 'Falha ao salvar a passagem de plantão.' });
    }
  }
};

module.exports = SupervisaoController;