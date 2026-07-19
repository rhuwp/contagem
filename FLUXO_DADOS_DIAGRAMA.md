# Fluxo de Dados - Indicadores de Supervisão

## 📊 Arquitetura Geral

```
┌─────────────────────────────────────────────────────────────────────┐
│                     SUPERVISÃO IPO - FLUXO DE DADOS                 │
└─────────────────────────────────────────────────────────────────────┘

                          BROWSER (ReactJS)
                         SupervisaoDashboard
                                 │
                                 │ GET /supervisao/dashboard?data=XXX
                                 ↓
                    ┌────────────────────────┐
                    │   Backend Node.js      │
                    │ SupervisaoController   │
                    └────────────────────────┘
                            │      │
                            │      └─── PostgreSQL (Rodízio)
                            │          - Cotas ativas
                            │          - Exceções
                            │          - Pacientes atendidos
                            │
                            └─── Oracle MV (Indicadores)
                                 - Atendimentos
                                 - Médicos
                                 - Tempos de processo
```

---

## 🔄 Fluxo da Requisição

```
1. Frontend envia requisição
   GET /supervisao/dashboard?data=2026-06-12

2. Backend SupervisaoController.obterDashboard()
   ├── Query PostgreSQL (Rodízio)
   │   ├── SELECT * FROM pedidos_cota (cotas ativas)
   │   └── SELECT * FROM encaminhamentos_pa (exceções)
   │
   └── Query Oracle (Indicadores)
       WITH TemposProcesso AS (
           ├── MAX(dh_processo) WHERE tipo = 1 → dh_inicio
           ├── MAX(dh_processo) WHERE tipo = 21 → dh_inicio_cadastro
           ├── MAX(dh_processo) WHERE tipo = 22 → dh_fim_cadastro
           ├── MAX(dh_processo) WHERE tipo = 31 → dh_fim_espera_medica
           ├── MAX(dh_processo) WHERE tipo = 32 → dh_fim_consulta
           └── MAX(dh_processo) WHERE tipo = 90 → dh_saida
       )
       
       WITH FilaConsolidada AS (
           ├── cd_atendimento (única por atendimento)
           ├── cd_prestador (ID único do médico)
           ├── origem_label (PA, CONTAGEM, PA3)
           ├── tempo_espera_recep = dh_inicio_cadastro - dh_inicio
           ├── tempo_cadastro = dh_fim_cadastro - dh_inicio_cadastro
           ├── tempo_espera_medica = dh_fim_espera_medica - dh_fim_cadastro
           ├── tempo_consulta = dh_fim_consulta - dh_fim_espera_medica
           └── tempo_total = dh_saida - dh_inicio
       )
       
       SELECT
           COUNT(DISTINCT cd_atendimento) → TOTAL
           COUNT(DISTINCT cd_prestador) → MÉDICOS
           MEDIAN(tempo_X) → MEDIANAS

3. Response JSON estruturado
   {
     hospitalGlobal: {
       totalAtendimentos: { total, pa, contagem, pa3 },
       medicosAtivos: { total, pa, contagem, pa3 },
       temposProcesso: { 5 medianas }
     }
   }

4. Frontend renderiza os dados nos cards
```

---

## 🏥 Mapeamento de Origens

```
┌─────────────────────────────────────────────────────────────────┐
│  CÓDIGO ORIGEM    │  LABEL      │  DESCRIÇÃO                    │
├─────────────────────────────────────────────────────────────────┤
│       16          │  PA         │  Pronto Atendimento Principal  │
│       47          │  CONTAGEM   │  Unidade de Contagem           │
│      106          │  PA3        │  Pronto Atendimento 3          │
└─────────────────────────────────────────────────────────────────┘
```

---

## ⏱️ Tipos de Tempo no Oracle

```
JORNADA DO PACIENTE:

┌────────────────────────────────────────────────────────────────────┐
│ Tipo 1 (CHEGADA)
│ ↓
│ [ESPERA RECEPÇÃO]  ← Calcula: Tipo 21 - Tipo 1
│ ↓
│ Tipo 21 (INÍCIO CADASTRO)
│ ↓
│ [CADASTRO]         ← Calcula: Tipo 22 - Tipo 21
│ ↓
│ Tipo 22 (FIM CADASTRO)
│ ↓
│ [ESPERA MÉDICA]    ← Calcula: Tipo 31 - Tipo 22
│ ↓
│ Tipo 31 (INÍCIO CONSULTA)
│ ↓
│ [CONSULTA]         ← Calcula: Tipo 32 - Tipo 31
│ ↓
│ Tipo 32 (FIM CONSULTA)
│ ↓
│ [PERMANÊNCIA FINAL] ← Calcula: Tipo 90 - Tipo 1
│ ↓
│ Tipo 90 (SAÍDA)
└────────────────────────────────────────────────────────────────────┘

TOTAL = dh_saida (tipo 90) - dh_inicio (tipo 1)
```

---

## 🎯 Indicadores Retornados

```
┌──────────────────────────────────────────────────────────┐
│             ATENDIMENTOS (COUNT DISTINCT)                │
├──────────────────────────────────────────────────────────┤
│ TOTAL_ATENDIMENTOS     │ cd_atendimento (todas origens)  │
│ TOTAL_PA               │ cd_atendimento WHERE origem=16  │
│ TOTAL_CONTAGEM         │ cd_atendimento WHERE origem=47  │
│ TOTAL_PA3              │ cd_atendimento WHERE origem=106 │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│            MÉDICOS (COUNT DISTINCT CD_PRESTADOR)         │
├──────────────────────────────────────────────────────────┤
│ TOTAL_MEDICOS          │ cd_prestador (todas origens)    │
│ MEDICOS_PA             │ cd_prestador WHERE origem=16    │
│ MEDICOS_CONTAGEM       │ cd_prestador WHERE origem=47    │
│ MEDICOS_PA3            │ cd_prestador WHERE origem=106   │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│            TEMPOS EM MINUTOS (MEDIANAS)                  │
├──────────────────────────────────────────────────────────┤
│ MEDIANA_ESPERA_RECEP       │ Fila na recepção            │
│ MEDIANA_CADASTRO           │ Tempo no cadastro           │
│ MEDIANA_ESPERA_MEDICA      │ Espera pela consulta        │
│ MEDIANA_CONSULTA           │ Duração da consulta         │
│ MEDIANA_PERMANENCIA_TOTAL  │ Tempo total na unidade      │
└──────────────────────────────────────────────────────────┘
```

---

## 🖥️ Dashboard Frontend

```
┌────────────────────────────────────────────────────────────┐
│                 SUPERVISÃO IPO                    [↻ PDF]  │
├─────────────────────────────┬──────────────────────────────┤
│  DATA: [2026-06-12]          │ [Atualizar]                │
└─────────────────────────────┴──────────────────────────────┘

┌────────────────┬────────────────┬─────────────┬────────────┬──────────────┐
│   TOTAL        │   MÉDICOS      │   COTAS     │ EXCEÇÕES   │  PACIENTES   │
│ 312 atend.     │ 24 médicos     │ 45 ativas   │ 8 furos    │ 234 atendidos│
│ PA: 180        │ PA: 18         │             │            │              │
│ Cont: 100      │ Cont: 12       │             │            │              │
│ PA3: 32        │ PA3: 6         │             │            │              │
└────────────────┴────────────────┴─────────────┴────────────┴──────────────┘

┌─────────────────────────────────────────────────────────────────┐
│              TEMPOS MÉDIOS DO PROCESSO (MINUTOS)                │
├────────────┬──────────┬──────────┬──────────┬──────────────────┤
│  RECEPÇÃO  │ CADASTRO │  ESPERA  │ CONSULTA │ PERMANÊNCIA TOTAL│
│    15 m    │   8 m    │  22 m    │  12 m    │     57 m         │
└────────────┴──────────┴──────────┴──────────┴──────────────────┘

┌──────────────────────────┐  ┌──────────────────────────┐
│  TOP 10 CONVÊNIOS (DIA)  │  │  TOP 10 CIDs (DIA)       │
├──────────────────────────┤  ├──────────────────────────┤
│ 1. Convênio A      50    │  │ 1. Febre/Gripe     45    │
│ 2. Convênio B      42    │  │ 2. Dor Abdominal   38    │
│ 3. Convênio C      35    │  │ 3. Trauma          32    │
│ ...                      │  │ ...                      │
└──────────────────────────┘  └──────────────────────────┘

┌──────────────────────────────┐  ┌──────────────────────────┐
│   PLANTÃO (Registros)        │  │  EXCEÇÕES (Auditoria)    │
├──────────────────────────────┤  ├──────────────────────────┤
│ Turno: [Manhã ▼]             │  │ Senha/Ref: XXX-001       │
│ Pendências: [...]            │  │ Médico: Dr. Silva        │
│ Intercorrências: [...]       │  │ Motivo: "Fura de fila"   │
│ [Submeter e gerar PDF]       │  │ Hora: 14:30              │
└──────────────────────────────┘  └──────────────────────────┘
```

---

## 💾 Estrutura de Resposta JSON

```json
{
  "dataReferencia": "2026-06-12",
  
  "rodizio": {
    "cotasAtivas": 45,
    "pacientesAtendidos": 234,
    "excecoesGeradas": 8,
    "detalhesExcecoes": [
      {
        "id": 1,
        "paciente_identificador": "PA-001",
        "medico_nome": "Dr. Silva",
        "usuario_nome": "Operador",
        "justificativa": "Paciente crítico",
        "criado_em": "2026-06-12T14:30:00Z"
      }
    ]
  },
  
  "hospitalGlobal": {
    "totalAtendimentos": {
      "total": 312,
      "pa": 180,
      "contagem": 100,
      "pa3": 32
    },
    
    "medicosAtivos": {
      "total": 24,
      "pa": 18,
      "contagem": 12,
      "pa3": 6
    },
    
    "temposProcesso": {
      "esperaRecepcao": 15,
      "cadastro": 8,
      "esperaMedica": 22,
      "consulta": 12,
      "permanenciaTotal": 57
    }
  },
  
  "rankings": {
    "conveniosDia": [
      { "NOME": "Convênio A", "QUANTIDADE": 50 },
      { "NOME": "Convênio B", "QUANTIDADE": 42 }
    ],
    "conveniosMes": [],
    "cidsDia": [],
    "cidsMes": []
  }
}
```

---

## 🔍 Validações Aplicadas

```
┌─────────────────────────────────────────────────────────────┐
│ VALIDAÇÃO                                      REGRA         │
├─────────────────────────────────────────────────────────────┤
│ Soma de origens                  TOTAL >= PA + CONTAGEM + PA3│
│ Contagem de médicos              TOTAL >= PA_MED + CONT_MED  │
│ Se há atendimentos               TOTAL > 0 → MÉDICOS > 0     │
│ Tempos positivos                 MEDIANA >= 0 (min: 1)       │
│ Data no formato correto          YYYY-MM-DD                  │
│ Integridade de dados             Todos campos retornados     │
└─────────────────────────────────────────────────────────────┘
```

---

## 🚀 Performance Esperada

```
OPERAÇÃO                          TEMPO         NOTAS
──────────────────────────────────────────────────────────
PostgreSQL (Rodízio)              ~30ms         Query simples
CTE TemposProcesso                ~50ms         GROUP BY agregação
CTE FilaConsolidada               ~100-150ms    JOINs com triagem
SELECT Final (Agregação)          ~10ms         Em memória
──────────────────────────────────────────────────────────
TOTAL ESPERADO                    200-300ms     Valor médio
```

---

## 📋 Checklist de Verificação

- [ ] SQL executa em < 1 segundo
- [ ] Dashboard carrega em < 2 segundos
- [ ] Cards exibem 5 indicadores (com PA3)
- [ ] Tempos em minutos são todos ≥ 0
- [ ] PDF inclui PA3 na contagem
- [ ] Filtro de data funciona para datas passadas
- [ ] Atualização automática a cada 30s (hoje)
- [ ] Médicos: COUNT DISTINCT cd_prestador (não nome)
- [ ] Atendimentos: COUNT DISTINCT cd_atendimento (não duplica)
- [ ] Medianas calculadas sem valores negativos

---

## 🔗 Transição de Dados

```
DADOS LEGADOS → NOVOS CAMPOS

totalAtendimentosHoje         → totalAtendimentos.total
pacientesPA (label "PA")      → totalAtendimentos.pa
pacientesContagem             → totalAtendimentos.contagem
(novo) PA3                    → totalAtendimentos.pa3

medicosLogados                → medicosAtivos.total
medicosPA                     → medicosAtivos.pa
medicosContagem               → medicosAtivos.contagem
(novo) PA3                    → medicosAtivos.pa3

M_RECEP → temposProcesso.esperaRecepcao
M_CAD   → temposProcesso.cadastro
M_MED   → temposProcesso.esperaMedica
M_CONS  → temposProcesso.consulta
M_TOTAL → temposProcesso.permanenciaTotal
```

---

**Gerado em**: 2026-06-12  
**Status**: ✅ Documentação Completa
