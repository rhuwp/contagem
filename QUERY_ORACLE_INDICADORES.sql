-- ============================================================================
-- INDICADORES DE SUPERVISÃO - PRONTO ATENDIMENTO IPO
-- SQL Oracle - Consulta READ-ONLY para análise de indicadores
-- ============================================================================
--
-- Parâmetros:
--   :data_filtro = Data para filtro (formato: 'YYYY-MM-DD', ex: '2026-06-12')
--
-- Indicadores Retornados:
--   - TOTAL_ATENDIMENTOS: Total geral (todas as origens)
--   - TOTAL_PA, TOTAL_CONTAGEM, TOTAL_PA3: Atendimentos por origem
--   - TOTAL_MEDICOS: Total de médicos únicos
--   - MEDICOS_PA, MEDICOS_CONTAGEM, MEDICOS_PA3: Médicos por origem
--   - MEDIANA_ESPERA_RECEP: Mediana de espera na recepção (minutos)
--   - MEDIANA_CADASTRO: Mediana de tempo de cadastro (minutos)
--   - MEDIANA_ESPERA_MEDICA: Mediana de espera pela consulta (minutos)
--   - MEDIANA_CONSULTA: Mediana de duração da consulta (minutos)
--   - MEDIANA_PERMANENCIA_TOTAL: Mediana de permanência total (minutos)
--
-- ============================================================================

WITH TemposProcesso AS (
  -- CTE 1: Agregar todos os tempos de processo por atendimento
  -- Evita duplicidades ao consolidar tipos de tempo em uma única linha por atendimento

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
  -- CTE 2: Consolidar dados de atendimentos com tempos calculados
  -- Mapeamento de origem (cd_ori_ate) para labels
  -- Cálculo de todos os tempos em minutos

  SELECT
      a.cd_atendimento,
      a.cd_prestador,
      CASE
          WHEN a.cd_ori_ate = '16' THEN 'PA'
          WHEN a.cd_ori_ate = '47' THEN 'CONTAGEM'
          WHEN a.cd_ori_ate = '106' THEN 'PA3'
          ELSE 'OUTRO'
      END AS origem_label,

      -- Tempo na recepção: início do cadastro - chegada
      ROUND(GREATEST(
        (CAST(tp.dh_inicio_cadastro AS DATE) - CAST(tp.dh_inicio AS DATE)) * 24 * 60,
        0
      ), 2) AS tempo_espera_recep,

      -- Tempo no cadastro: fim do cadastro - início do cadastro
      ROUND(GREATEST(
        (CAST(tp.dh_fim_cadastro AS DATE) - CAST(tp.dh_inicio_cadastro AS DATE)) * 24 * 60,
        0
      ), 2) AS tempo_cadastro,

      -- Tempo esperando médico: início consulta - fim cadastro
      ROUND(GREATEST(
        (CAST(tp.dh_fim_espera_medica AS DATE) - CAST(tp.dh_fim_cadastro AS DATE)) * 24 * 60,
        0
      ), 2) AS tempo_espera_medica,

      -- Tempo da consulta: fim consulta - início consulta
      ROUND(GREATEST(
        (CAST(tp.dh_fim_consulta AS DATE) - CAST(tp.dh_fim_espera_medica AS DATE)) * 24 * 60,
        0
      ), 2) AS tempo_consulta,

      -- Tempo total: saída (ou fim consulta) - chegada
      ROUND(GREATEST(
        (CAST(COALESCE(tp.dh_saida, tp.dh_fim_consulta) AS DATE) - CAST(tp.dh_inicio AS DATE)) * 24 * 60,
        0
      ), 2) AS tempo_total

  FROM dbamv.triagem_atendimento ta
  INNER JOIN dbamv.atendime a ON a.cd_atendimento = ta.cd_atendimento
  LEFT JOIN dbamv.fila_senha fs ON fs.cd_fila_senha = ta.cd_fila_senha
  LEFT JOIN TemposProcesso tp ON a.cd_atendimento = tp.cd_atendimento

  WHERE
      a.tp_atendimento = 'U'                    -- Apenas atendimentos de Urgência/Emergência
      AND a.cd_ori_ate IN ('16', '47', '106')   -- PA, CONTAGEM, PA3
      AND fs.ds_fila IN ('PRONTO ATENDIMENTO', 'PRONTO ATENDIMENTO UNIMED')
      AND TRUNC(a.dt_atendimento) = TO_DATE('2026-06-12', 'YYYY-MM-DD')  -- AJUSTE A DATA AQUI
)

-- Query Principal: Agregação de indicadores
SELECT
  -- ========== ATENDIMENTOS ==========
  COUNT(DISTINCT cd_atendimento) AS TOTAL_ATENDIMENTOS,
  COUNT(DISTINCT CASE WHEN origem_label = 'PA' THEN cd_atendimento END) AS TOTAL_PA,
  COUNT(DISTINCT CASE WHEN origem_label = 'CONTAGEM' THEN cd_atendimento END) AS TOTAL_CONTAGEM,
  COUNT(DISTINCT CASE WHEN origem_label = 'PA3' THEN cd_atendimento END) AS TOTAL_PA3,

  -- ========== MÉDICOS ==========
  COUNT(DISTINCT cd_prestador) AS TOTAL_MEDICOS,
  COUNT(DISTINCT CASE WHEN origem_label = 'PA' THEN cd_prestador END) AS MEDICOS_PA,
  COUNT(DISTINCT CASE WHEN origem_label = 'CONTAGEM' THEN cd_prestador END) AS MEDICOS_CONTAGEM,
  COUNT(DISTINCT CASE WHEN origem_label = 'PA3' THEN cd_prestador END) AS MEDICOS_PA3,

  -- ========== TEMPOS (MEDIANAS EM MINUTOS) ==========
  ROUND(MEDIAN(CASE WHEN tempo_espera_recep > 0 THEN tempo_espera_recep END), 0) AS MEDIANA_ESPERA_RECEP,
  ROUND(MEDIAN(CASE WHEN tempo_cadastro > 0 THEN tempo_cadastro END), 0) AS MEDIANA_CADASTRO,
  ROUND(MEDIAN(CASE WHEN tempo_espera_medica > 0 THEN tempo_espera_medica END), 0) AS MEDIANA_ESPERA_MEDICA,
  ROUND(MEDIAN(CASE WHEN tempo_consulta > 0 THEN tempo_consulta END), 0) AS MEDIANA_CONSULTA,
  ROUND(MEDIAN(CASE WHEN tempo_total > 0 THEN tempo_total END), 0) AS MEDIANA_PERMANENCIA_TOTAL

FROM FilaConsolidada;

-- ============================================================================
-- EXEMPLOS DE QUERIES COMPLEMENTARES PARA VALIDAÇÃO
-- ============================================================================

-- 1. Verificar contagem de atendimentos por origem
SELECT
    origem_label,
    COUNT(DISTINCT cd_atendimento) as qtd_atendimentos,
    COUNT(DISTINCT cd_prestador) as qtd_medicos
FROM FilaConsolidada
GROUP BY origem_label;

-- 2. Listar top 10 médicos por número de atendimentos (PA)
SELECT
    a.cd_prestador,
    p.nm_prestador,
    COUNT(DISTINCT a.cd_atendimento) as qtd_atendimentos
FROM dbamv.atendime a
JOIN dbamv.prestador p ON p.cd_prestador = a.cd_prestador
WHERE a.tp_atendimento = 'U'
  AND a.cd_ori_ate = '16'
  AND TRUNC(a.dt_atendimento) = TRUNC(SYSDATE)
GROUP BY a.cd_prestador, p.nm_prestador
ORDER BY qtd_atendimentos DESC
FETCH FIRST 10 ROWS ONLY;

-- 3. Distribuição de tempos para análise de outliers
SELECT
    MIN(tempo_total) as min_tempo,
    PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY tempo_total) as q1,
    PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY tempo_total) as mediana,
    PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY tempo_total) as q3,
    MAX(tempo_total) as max_tempo
FROM FilaConsolidada
WHERE tempo_total > 0;

-- ============================================================================
