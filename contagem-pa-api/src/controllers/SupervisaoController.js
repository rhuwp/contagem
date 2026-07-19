const pool = require('../config/databasePg');
const { getOracleConnection } = require('../config/databaseOracle');

// Cache em memória: com polling de 30s por usuário logado, evita repetir
// as 7 queries Oracle para cada supervisor dentro da mesma janela.
const cacheDashboard = new Map();
const CACHE_TTL_MS = 30000;
const cacheIndicadoresPa = new Map();

// Monta a CTE base dos indicadores (condição de data parametrizável)
const montarCteFila = (condicaoData) => `
        WITH TemposProcesso AS (
          SELECT
              cd_atendimento,
              MAX(CASE WHEN cd_tipo_tempo_processo = 1 THEN dh_processo END) AS dh_inicio,
              MAX(CASE WHEN cd_tipo_tempo_processo = 21 THEN dh_processo END) AS dh_inicio_cadastro,
              MAX(CASE WHEN cd_tipo_tempo_processo = 22 THEN dh_processo END) AS dh_fim_cadastro,
              MAX(CASE WHEN cd_tipo_tempo_processo = 31 THEN dh_processo END) AS dh_fim_espera_medica,
              MAX(CASE WHEN cd_tipo_tempo_processo = 32 THEN dh_processo END) AS dh_fim_consulta,
              MAX(CASE WHEN cd_tipo_tempo_processo = 90 THEN dh_processo END) AS dh_saida
          FROM dbamv.sacr_tempo_processo
          GROUP BY cd_atendimento
        ),
        FilaConsolidada AS (
          SELECT
              a.cd_atendimento,
              a.cd_prestador,
              a.cd_convenio,
              tp.dh_inicio AS dh_chegada,
              -- Momento do atendimento médico (chamada); fallback: chegada
              COALESCE(tp.dh_fim_espera_medica, tp.dh_inicio) AS dh_ref_medico,
              CASE
                  WHEN a.cd_ori_ate = '16' THEN 'PA'
                  WHEN a.cd_ori_ate = '47' THEN 'CONTAGEM'
                  WHEN a.cd_ori_ate = '106' THEN 'PA3'
                  ELSE 'OUTRO'
              END AS origem_label,
              ROUND(GREATEST((CAST(tp.dh_inicio_cadastro AS DATE) - CAST(tp.dh_inicio AS DATE)) * 24 * 60, 0), 2) AS tempo_espera_recep,
              ROUND(GREATEST((CAST(tp.dh_fim_cadastro AS DATE) - CAST(tp.dh_inicio_cadastro AS DATE)) * 24 * 60, 0), 2) AS tempo_cadastro,
              ROUND(GREATEST((CAST(tp.dh_fim_espera_medica AS DATE) - CAST(tp.dh_fim_cadastro AS DATE)) * 24 * 60, 0), 2) AS tempo_espera_medica,
              ROUND(GREATEST((CAST(tp.dh_fim_consulta AS DATE) - CAST(tp.dh_fim_espera_medica AS DATE)) * 24 * 60, 0), 2) AS tempo_consulta,
              ROUND(GREATEST((CAST(COALESCE(tp.dh_saida, tp.dh_fim_consulta) AS DATE) - CAST(tp.dh_inicio AS DATE)) * 24 * 60, 0), 2) AS tempo_total
          FROM dbamv.triagem_atendimento ta
          INNER JOIN dbamv.atendime a ON a.cd_atendimento = ta.cd_atendimento
          LEFT JOIN dbamv.fila_senha fs ON fs.cd_fila_senha = ta.cd_fila_senha
          LEFT JOIN TemposProcesso tp ON a.cd_atendimento = tp.cd_atendimento
          WHERE a.tp_atendimento = 'U'
            AND a.cd_ori_ate IN ('16', '47', '106')
            -- Aceita NULL para não excluir pacientes sem senha de totem (encaixes manuais)
            AND (fs.ds_fila IS NULL OR fs.ds_fila IN ('PRONTO ATENDIMENTO', 'PRONTO ATENDIMENTO UNIMED'))
            AND ${condicaoData}
        )
`;

const SupervisaoController = {
  async obterDashboard(req, res) {
    let oracleConn;
    const { data } = req.query;
    
    const dataHoje = new Date().toLocaleDateString('en-CA');
    const dataFiltro = data || dataHoje;

    // Responde do cache se a mesma data foi calculada há menos de 30s
    const emCache = cacheDashboard.get(dataFiltro);
    if (emCache && Date.now() - emCache.timestamp < CACHE_TTL_MS) {
      return res.status(200).json(emCache.payload);
    }

    try {
      // 1. DADOS POSTGRESQL (Rodízio e Auditoria)
      // Contagem POR EVENTO (encaminhamentos), não por estado da cota:
      // imune a cotas criadas em outro dia ou canceladas depois do consumo.
      const { rows: [rowAtendidos] } = await pool.query(
        "SELECT COUNT(*)::int AS total FROM encaminhamentos_pa WHERE tipo_envio = 'NORMAL' AND criado_em::date = $1",
        [dataFiltro]
      );

      // Cotas ativas é uma métrica de estado ATUAL (independe da data filtrada)
      const { rows: [rowCotas] } = await pool.query(
        "SELECT COUNT(*)::int AS total FROM pedidos_cota WHERE status = 'ABERTO'"
      );

      const queryExcecoes = `
        SELECT 
          id, paciente_identificador, medico_nome, usuario_nome, justificativa, criado_em 
        FROM encaminhamentos_pa 
        WHERE tipo_envio = 'EXCECAO' AND criado_em::date = $1
        ORDER BY criado_em DESC
      `;
      const { rows: excecoes } = await pool.query(queryExcecoes, [dataFiltro]);

      // 2. DADOS ORACLE MV (Painel Global e SLA)
      oracleConn = await getOracleConnection();

      // Dia-calendário: usado por todos os indicadores
      const cteFila = montarCteFila("TRUNC(a.dt_atendimento) = TO_DATE(:data_filtro, 'YYYY-MM-DD')");

      const queryOracle = `${cteFila}
        SELECT
          COUNT(DISTINCT cd_atendimento) AS TOTAL_ATENDIMENTOS,
          COUNT(DISTINCT CASE WHEN origem_label = 'PA' THEN cd_atendimento END) AS TOTAL_PA,
          COUNT(DISTINCT CASE WHEN origem_label = 'CONTAGEM' THEN cd_atendimento END) AS TOTAL_CONTAGEM,
          COUNT(DISTINCT CASE WHEN origem_label = 'PA3' THEN cd_atendimento END) AS TOTAL_PA3,

          COUNT(DISTINCT cd_prestador) AS TOTAL_MEDICOS,
          COUNT(DISTINCT CASE WHEN origem_label = 'PA' THEN cd_prestador END) AS MEDICOS_PA,
          COUNT(DISTINCT CASE WHEN origem_label = 'CONTAGEM' THEN cd_prestador END) AS MEDICOS_CONTAGEM,
          COUNT(DISTINCT CASE WHEN origem_label = 'PA3' THEN cd_prestador END) AS MEDICOS_PA3,

          ROUND(MEDIAN(CASE WHEN tempo_espera_recep > 0 THEN tempo_espera_recep END), 0) AS MEDIANA_ESPERA_RECEP,
          ROUND(MEDIAN(CASE WHEN tempo_cadastro > 0 THEN tempo_cadastro END), 0) AS MEDIANA_CADASTRO,
          ROUND(MEDIAN(CASE WHEN tempo_espera_medica > 0 THEN tempo_espera_medica END), 0) AS MEDIANA_ESPERA_MEDICA,
          ROUND(MEDIAN(CASE WHEN tempo_consulta > 0 THEN tempo_consulta END), 0) AS MEDIANA_CONSULTA,
          ROUND(MEDIAN(CASE WHEN tempo_total > 0 THEN tempo_total END), 0) AS MEDIANA_PERMANENCIA_TOTAL,

          -- Qualidade de apontamento: etapa > 4h ou permanência > 12h indica
          -- atendimento provavelmente não encerrado no MV (não erro real de SLA)
          COUNT(DISTINCT CASE WHEN tempo_consulta > 240 OR tempo_total > 720 THEN cd_atendimento END) AS REGISTROS_SUSPEITOS
        FROM FilaConsolidada
      `;
      const resultOracle = await oracleConn.execute(queryOracle, { data_filtro: dataFiltro });
      const row = resultOracle.rows[0] || {};

      // 2.5 NOVOS INDICADORES: fluxo de chegadas por hora e detalhe da permanência total
      const queryFluxoHora = `${cteFila}
        SELECT
          TO_CHAR(dh_chegada, 'HH24') AS HORA,
          COUNT(DISTINCT cd_atendimento) AS QUANTIDADE,
          ROUND(MEDIAN(CASE WHEN tempo_total > 0 THEN tempo_total END), 0) AS MEDIANA_PERMANENCIA
        FROM FilaConsolidada
        WHERE dh_chegada IS NOT NULL
        GROUP BY TO_CHAR(dh_chegada, 'HH24')
        ORDER BY HORA
      `;

      const queryPermanencia = `${cteFila}
        SELECT
          ROUND(PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY tempo_total), 0) AS P90,
          ROUND(MAX(tempo_total), 0) AS MAXIMA,
          COUNT(CASE WHEN tempo_total <= 30 THEN 1 END) AS ATE_30,
          COUNT(CASE WHEN tempo_total > 30 AND tempo_total <= 60 THEN 1 END) AS DE_31_60,
          COUNT(CASE WHEN tempo_total > 60 AND tempo_total <= 120 THEN 1 END) AS DE_61_120,
          COUNT(CASE WHEN tempo_total > 120 THEN 1 END) AS ACIMA_120
        FROM FilaConsolidada
        WHERE tempo_total > 0
      `;

      const resFluxoHora = await oracleConn.execute(queryFluxoHora, { data_filtro: dataFiltro });
      const resPermanencia = await oracleConn.execute(queryPermanencia, { data_filtro: dataFiltro });
      const perm = resPermanencia.rows[0] || {};

      // 2.6 PRODUÇÃO POR MÉDICO (dia completo, 24h): total de atendimentos e convênios
      const queryMedicosProducao = `${cteFila}
        SELECT
          p.nm_prestador AS MEDICO,
          NVL(c.nm_convenio, 'NÃO INFORMADO') AS CONVENIO,
          COUNT(DISTINCT fc.cd_atendimento) AS QUANTIDADE
        FROM FilaConsolidada fc
        JOIN dbamv.prestador p ON p.cd_prestador = fc.cd_prestador
        LEFT JOIN dbamv.convenio c ON c.cd_convenio = fc.cd_convenio
        GROUP BY p.nm_prestador, NVL(c.nm_convenio, 'NÃO INFORMADO')
      `;
      const resMedProducao = await oracleConn.execute(queryMedicosProducao, { data_filtro: dataFiltro });

      // Agregação em JS: por médico -> total do dia + quebra por convênio
      const mapMedicos = new Map();
      for (const r of (resMedProducao.rows || [])) {
        const m = mapMedicos.get(r.MEDICO) || { medico: r.MEDICO, conveniosMap: {}, total: 0 };
        m.conveniosMap[r.CONVENIO] = (m.conveniosMap[r.CONVENIO] || 0) + r.QUANTIDADE;
        m.total += r.QUANTIDADE;
        mapMedicos.set(r.MEDICO, m);
      }

      const producaoMedicos = [...mapMedicos.values()].map(m => ({
        medico: m.medico,
        total: m.total,
        convenios: Object.entries(m.conveniosMap)
          .map(([nome, quantidade]) => ({ nome, quantidade }))
          .sort((a, b) => b.quantidade - a.quantidade)
      })).sort((a, b) => b.total - a.total);

      // 3. RANKINGS (Top 10 Convênios e CIDs)
      const baseJoins = `
        FROM dbamv.triagem_atendimento ta
        JOIN dbamv.atendime a ON a.cd_atendimento = ta.cd_atendimento
        LEFT JOIN dbamv.fila_senha fs ON fs.cd_fila_senha = ta.cd_fila_senha
      `;

      const condicoesWhere = `
        WHERE a.tp_atendimento = 'U' AND a.cd_ori_ate IN ('16','47','106')
        AND (fs.ds_fila IS NULL OR fs.ds_fila IN ('PRONTO ATENDIMENTO', 'PRONTO ATENDIMENTO UNIMED'))
      `;

      const qTopConvDia = `SELECT * FROM (SELECT c.nm_convenio AS NOME, COUNT(*) as QUANTIDADE ${baseJoins} JOIN dbamv.convenio c ON a.cd_convenio = c.cd_convenio ${condicoesWhere} AND TRUNC(a.dt_atendimento) = TO_DATE(:data_filtro, 'YYYY-MM-DD') GROUP BY c.nm_convenio ORDER BY QUANTIDADE DESC) WHERE ROWNUM <= 10`;
      const qTopConvMes = `SELECT * FROM (SELECT c.nm_convenio AS NOME, COUNT(*) as QUANTIDADE ${baseJoins} JOIN dbamv.convenio c ON a.cd_convenio = c.cd_convenio ${condicoesWhere} AND TRUNC(a.dt_atendimento, 'MM') = TRUNC(TO_DATE(:data_filtro, 'YYYY-MM-DD'), 'MM') GROUP BY c.nm_convenio ORDER BY QUANTIDADE DESC) WHERE ROWNUM <= 10`;

      const qTopCidDia = `SELECT * FROM (SELECT cid.ds_cid AS NOME, COUNT(*) as QUANTIDADE ${baseJoins} JOIN dbamv.cid cid ON a.cd_cid = cid.cd_cid ${condicoesWhere} AND TRUNC(a.dt_atendimento) = TO_DATE(:data_filtro, 'YYYY-MM-DD') GROUP BY cid.ds_cid ORDER BY QUANTIDADE DESC) WHERE ROWNUM <= 10`;
      const qTopCidMes = `SELECT * FROM (SELECT cid.ds_cid AS NOME, COUNT(*) as QUANTIDADE ${baseJoins} JOIN dbamv.cid cid ON a.cd_cid = cid.cd_cid ${condicoesWhere} AND TRUNC(a.dt_atendimento, 'MM') = TRUNC(TO_DATE(:data_filtro, 'YYYY-MM-DD'), 'MM') GROUP BY cid.ds_cid ORDER BY QUANTIDADE DESC) WHERE ROWNUM <= 10`;

      const resConvDia = await oracleConn.execute(qTopConvDia, { data_filtro: dataFiltro });
      const resConvMes = await oracleConn.execute(qTopConvMes, { data_filtro: dataFiltro });
      const resCidDia = await oracleConn.execute(qTopCidDia, { data_filtro: dataFiltro });
      const resCidMes = await oracleConn.execute(qTopCidMes, { data_filtro: dataFiltro });

      const payload = {
        dataReferencia: dataFiltro,
        rodizio: {
          cotasAtivas: rowCotas.total,
          pacientesAtendidos: rowAtendidos.total,
          excecoesGeradas: excecoes.length,
          detalhesExcecoes: excecoes
        },
        hospitalGlobal: {
          totalAtendimentos: {
            total: row.TOTAL_ATENDIMENTOS || 0,
            pa: row.TOTAL_PA || 0,
            contagem: row.TOTAL_CONTAGEM || 0,
            pa3: row.TOTAL_PA3 || 0
          },
          medicosAtivos: {
            total: row.TOTAL_MEDICOS || 0,
            pa: row.MEDICOS_PA || 0,
            contagem: row.MEDICOS_CONTAGEM || 0,
            pa3: row.MEDICOS_PA3 || 0
          },
          temposProcesso: {
            esperaRecepcao: row.MEDIANA_ESPERA_RECEP || 0,
            cadastro: row.MEDIANA_CADASTRO || 0,
            esperaMedica: row.MEDIANA_ESPERA_MEDICA || 0,
            consulta: row.MEDIANA_CONSULTA || 0,
            permanenciaTotal: row.MEDIANA_PERMANENCIA_TOTAL || 0,
            registrosSuspeitos: row.REGISTROS_SUSPEITOS || 0
          },
          fluxoHorario: resFluxoHora.rows || [],
          permanenciaDetalhe: {
            p90: perm.P90 || 0,
            maxima: perm.MAXIMA || 0,
            faixas: {
              ate30: perm.ATE_30 || 0,
              de31a60: perm.DE_31_60 || 0,
              de61a120: perm.DE_61_120 || 0,
              acima120: perm.ACIMA_120 || 0
            }
          }
        },
        producaoMedicos,
        rankings: {
          conveniosDia: resConvDia.rows || [],
          conveniosMes: resConvMes.rows || [],
          cidsDia: resCidDia.rows || [],
          cidsMes: resCidMes.rows || []
        }
      };

      if (cacheDashboard.size > 50) cacheDashboard.clear(); // higiene simples
      cacheDashboard.set(dataFiltro, { payload, timestamp: Date.now() });

      return res.status(200).json(payload);

    } catch (erro) {
      console.error('Erro na Supervisão:', erro);
      return res.status(500).json({ erro: 'Falha ao buscar indicadores.' });
    } finally {
      if (oracleConn) await oracleConn.close();
    }
  },

  // Indicadores enxutos para a recepção do PA: medianas do dia atual (1 query, com cache)
  async obterIndicadoresPa(req, res) {
    let oracleConn;
    const dataFiltro = new Date().toLocaleDateString('en-CA');

    const emCache = cacheIndicadoresPa.get(dataFiltro);
    if (emCache && Date.now() - emCache.timestamp < CACHE_TTL_MS) {
      return res.status(200).json(emCache.payload);
    }

    try {
      oracleConn = await getOracleConnection();
      const cteFila = montarCteFila("TRUNC(a.dt_atendimento) = TO_DATE(:data_filtro, 'YYYY-MM-DD')");
      const query = `${cteFila}
        SELECT
          COUNT(DISTINCT cd_atendimento) AS TOTAL_ATENDIMENTOS,
          ROUND(MEDIAN(CASE WHEN tempo_espera_recep > 0 THEN tempo_espera_recep END), 0) AS MEDIANA_ESPERA_RECEP,
          ROUND(MEDIAN(CASE WHEN tempo_cadastro > 0 THEN tempo_cadastro END), 0) AS MEDIANA_CADASTRO,
          ROUND(MEDIAN(CASE WHEN tempo_espera_medica > 0 THEN tempo_espera_medica END), 0) AS MEDIANA_ESPERA_MEDICA,
          ROUND(MEDIAN(CASE WHEN tempo_total > 0 THEN tempo_total END), 0) AS MEDIANA_PERMANENCIA_TOTAL
        FROM FilaConsolidada
      `;
      const result = await oracleConn.execute(query, { data_filtro: dataFiltro });
      const row = result.rows[0] || {};

      const payload = {
        dataReferencia: dataFiltro,
        totalAtendimentos: row.TOTAL_ATENDIMENTOS || 0,
        tempos: {
          esperaRecepcao: row.MEDIANA_ESPERA_RECEP || 0,
          cadastro: row.MEDIANA_CADASTRO || 0,
          esperaMedica: row.MEDIANA_ESPERA_MEDICA || 0,
          permanenciaTotal: row.MEDIANA_PERMANENCIA_TOTAL || 0
        }
      };

      cacheIndicadoresPa.set(dataFiltro, { payload, timestamp: Date.now() });
      return res.status(200).json(payload);
    } catch (erro) {
      console.error('Erro nos indicadores do PA:', erro);
      return res.status(500).json({ erro: 'Falha ao buscar indicadores do PA.' });
    } finally {
      if (oracleConn) await oracleConn.close();
    }
  },

  async registrarPlantao(req, res) {
    const { turno, pendencias, intercorrencias, observacoes } = req.body;
    // SEGURANÇA: o supervisor é identificado pelo token, não pelo body (evita registro forjado)
    const supervisor_id = req.usuarioLogado.id;
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