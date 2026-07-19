# 🚀 Quick Start - Indicadores Oracle

## ⚡ 5 Minutos para Começar

### 1. Testar o Endpoint (2 min)

```bash
# Terminal 1: Iniciar API (se não estiver rodando)
cd contagem-pa-api
npm run dev

# Terminal 2: Fazer requisição
curl -H "Authorization: Bearer SEU_TOKEN" \
  "http://localhost:3001/supervisao/dashboard?data=2026-06-12"

# Resposta esperada:
{
  "dataReferencia": "2026-06-12",
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
  }
}
```

### 2. Verificar no Dashboard (2 min)

```bash
# Terminal 3: Iniciar Frontend
cd contagem-pa-web
npm run dev

# Abrir no navegador: http://localhost:5173
# Fazer login como SUPERVISÃO
# Ver 5 cards com indicadores atualizados
```

### 3. Executar Testes (1 min)

```bash
# Terminal 4: Testes
node TESTES_INDICADORES.js

# Esperar resultado:
# ✅ TESTE 1: Verificando estrutura de dados...
# ✅ TESTE 2: Validando tipos de dados...
# ✅ TESTE 3: Validando regras de negócio...
# ✅ TESTE 4: Verificando atualização em tempo real...
# ✅ TESTE 5: Testando filtro por data...
```

---

## 📊 Indicadores Principais

### Atendimentos
```javascript
totalAtendimentos: {
  total: 312,      // Total geral
  pa: 180,         // Pronto Atendimento
  contagem: 100,   // Unidade de Contagem
  pa3: 32          // PA3 (NOVO)
}
```

### Médicos
```javascript
medicosAtivos: {
  total: 24,       // Total único por CD_PRESTADOR
  pa: 18,          // Médicos em PA
  contagem: 12,    // Médicos em Contagem
  pa3: 6           // Médicos em PA3 (NOVO)
}
```

### Tempos (em minutos)
```javascript
temposProcesso: {
  esperaRecepcao: 15,        // Fila na recepção
  cadastro: 8,               // Cadastro administrativo
  esperaMedica: 22,          // Espera pela consulta
  consulta: 12,              // Duração da consulta
  permanenciaTotal: 57       // Tempo total (MEDIANA)
}
```

---

## 🔍 Como Interpretar os Dados

### Atendimentos vs Médicos
```
Se TOTAL_ATENDIMENTOS = 312 e TOTAL_MEDICOS = 24
→ Média de 13 atendimentos por médico
→ 312 ÷ 24 = 13 atendimentos/médico
```

### Tempo Total vs Componentes
```
PERMANÊNCIA_TOTAL (57 min) deve ≈ RECEP (15) + CAD (8) + ESPERA (22) + CONS (12)
57 ≈ 15 + 8 + 22 + 12 = 57 ✅ Correto
```

### Validação de PA3
```
TOTAL (312) ≥ PA (180) + CONTAGEM (100) + PA3 (32)
312 ≥ 180 + 100 + 32 = 312 ✅ Correto
```

---

## 🆘 Troubleshooting

### Endpoint retorna erro 500

**Sintoma**: `{"erro": "Falha ao buscar indicadores."}`

**Solução**:
```bash
# 1. Verificar logs
tail -f contagem-pa-api/logs/*.log

# 2. Validar conexão Oracle
sqlplus user@DATABASE
SELECT * FROM dbamv.atendime WHERE ROWNUM = 1;

# 3. Testar com data válida
# Data deve estar em formato YYYY-MM-DD
curl "http://localhost:3001/supervisao/dashboard?data=2026-06-12"
# ✅ Correto

curl "http://localhost:3001/supervisao/dashboard?data=12-06-2026"
# ❌ Incorreto - vai falhar
```

### Dashboard não atualiza

**Sintoma**: Números estão congelados

**Solução**:
```javascript
// Verificar console (F12)
// Procurar por "Erro ao carregar dashboard"

// Se houver erro de token:
// 1. Logout e login novamente
// 2. Verificar token em localStorage

// Se houver erro de requisição:
// 1. Verificar se API está rodando: netstat -an | grep 3001
// 2. Verificar CORS em contagem-pa-api/src/server.js
```

### Números não batem

**Sintoma**: Total < PA + CONTAGEM + PA3

**Solução**:
```bash
# Executar query SQL de validação
# Arquivo: QUERY_ORACLE_INDICADORES.sql

# Na query, buscar:
SELECT
    COUNT(DISTINCT cd_atendimento) AS total,
    COUNT(DISTINCT CASE WHEN cd_ori_ate = '16' THEN cd_atendimento END) AS pa,
    COUNT(DISTINCT CASE WHEN cd_ori_ate = '47' THEN cd_atendimento END) AS contagem,
    COUNT(DISTINCT CASE WHEN cd_ori_ate = '106' THEN cd_atendimento END) AS pa3
FROM dbamv.atendime
WHERE TRUNC(dt_atendimento) = TO_DATE('2026-06-12', 'YYYY-MM-DD');

# Comparar com resposta da API
```

---

## 📈 Exemplos de Uso

### Analisar Produtividade de Médicos
```bash
# Atendimentos por médico hoje
curl "http://localhost:3001/supervisao/dashboard?data=2026-06-12" | \
  jq '.hospitalGlobal.totalAtendimentos.total / .hospitalGlobal.medicosAtivos.total'

# Resultado: 13 atendimentos/médico em média
```

### Monitorar SLA
```bash
# Verificar se médiana de espera está normal
curl "http://localhost:3001/supervisao/dashboard?data=2026-06-12" | \
  jq '.hospitalGlobal.temposProcesso | keys[] as $key | "\($key): \(.[$key]) min"'

# Resultado:
# "esperaRecepcao: 15 min"
# "cadastro: 8 min"
# ...
```

### Comparar Unidades
```bash
# PA vs CONTAGEM vs PA3
curl "http://localhost:3001/supervisao/dashboard?data=2026-06-12" | \
  jq '.hospitalGlobal.totalAtendimentos'

# Resultado mostra mix de pacientes por origem
```

---

## 📚 Documentação Completa

Para entender melhor, consulte:

- 📖 **INDICADORES_ORACLE_DOCUMENTACAO.md** - Explicação técnica de cada indicador
- 📊 **FLUXO_DADOS_DIAGRAMA.md** - Diagramas visuais do fluxo
- 🔍 **QUERY_ORACLE_INDICADORES.sql** - SQL completo para validação
- ✅ **README_MUDANCAS.md** - Resumo das mudanças implementadas
- 📋 **INDICE_COMPLETO.md** - Índice de todos os arquivos

---

## 🎯 Checklist Pós-Deploy

- [ ] API retorna HTTP 200
- [ ] Dashboard exibe 5 cards
- [ ] PA3 aparece nos cards
- [ ] PDF pode ser gerado com sucesso
- [ ] Testes passam sem erros
- [ ] Números fazem sentido (validação manual)
- [ ] Atualização automática funciona a cada 30s
- [ ] Filtro de data permite datas passadas
- [ ] Relatório PDF inclui PA3

---

## 💡 Tips & Tricks

### Filtrar dados por período
```bash
# Hoje
curl "http://localhost:3001/supervisao/dashboard"

# Ontem
curl "http://localhost:3001/supervisao/dashboard?data=$(date -d 'yesterday' +%Y-%m-%d)"

# 7 dias atrás
curl "http://localhost:3001/supervisao/dashboard?data=$(date -d '7 days ago' +%Y-%m-%d)"
```

### Gerar arquivo JSON para análise
```bash
# Exportar para arquivo
curl -H "Authorization: Bearer TOKEN" \
  "http://localhost:3001/supervisao/dashboard?data=2026-06-12" | \
  jq '.' > dados_supervisao_2026-06-12.json

# Analisar em Excel ou Python
```

### Monitorar em tempo real (a cada 10s)
```bash
# Terminal
watch -n 10 'curl -s "http://localhost:3001/supervisao/dashboard" | jq ".hospitalGlobal.totalAtendimentos"'
```

---

## 🔗 Endpoints

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/supervisao/dashboard` | Dashboard hoje |
| GET | `/supervisao/dashboard?data=2026-06-12` | Dashboard data específica |
| POST | `/supervisao/plantao` | Registrar passagem de plantão |

---

## 🎓 Conceitos-Chave

### COUNT(DISTINCT cd_atendimento)
Garante que cada atendimento é contado apenas 1 vez, mesmo que apareça em múltiplos registros

### COUNT(DISTINCT cd_prestador)
Conta médicos únicos por seu ID (não por nome) para evitar duplicação

### MEDIAN em vez de AVG
Mediana é mais robusta - um paciente que fica 5 horas não distorce a média

### CTE (Common Table Expression)
Torna SQL mais legível e evita subconsultas aninhadas

---

## 📞 Suporte

Se algo não funcionar:

1. Consulte **INDICADORES_ORACLE_DOCUMENTACAO.md** para detalhes técnicos
2. Execute **TESTES_INDICADORES.js** para validar tudo
3. Verifique logs em `contagem-pa-api/logs/`
4. Compare com **QUERY_ORACLE_INDICADORES.sql** executando no Oracle

---

**Última atualização**: 2026-06-12  
**Versão**: 2.0  
**Status**: ✅ Pronto para uso
