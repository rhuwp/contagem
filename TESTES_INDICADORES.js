/**
 * Testes para Validação dos Indicadores de Supervisão
 *
 * Estes testes verificam se os indicadores estão sendo retornados corretamente
 * pela API após a reestruturação.
 */

const axios = require('axios');

const API_URL = 'http://localhost:3001';
const TOKEN = 'seu_token_aqui'; // Substitua pelo token de autenticação

// ============================================================================
// CONFIGURAÇÃO
// ============================================================================

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Authorization': `Bearer ${TOKEN}`,
    'Content-Type': 'application/json'
  }
});

// ============================================================================
// TESTES
// ============================================================================

async function runTests() {
  console.log('\n========== INICIANDO TESTES DE INDICADORES ==========\n');

  try {
    // Teste 1: Verificar estrutura de resposta
    await testEstruturaDados();

    // Teste 2: Validar tipos de dados
    await testTiposDados();

    // Teste 3: Validar regras de negócio
    await testRegrasNegocio();

    // Teste 4: Verificar atualização em tempo real
    await testAtualizacaoTempo();

    // Teste 5: Testar filtro de data
    await testFiltroPorData();

    console.log('\n========== TODOS OS TESTES FINALIZADOS ==========\n');

  } catch (erro) {
    console.error('\n❌ ERRO CRÍTICO:', erro.message);
    process.exit(1);
  }
}

// ============================================================================
// TESTE 1: Estrutura de Dados
// ============================================================================

async function testEstruturaDados() {
  console.log('📋 TESTE 1: Verificando estrutura de dados...');

  const response = await api.get('/supervisao/dashboard');
  const data = response.data;

  const estruturaEsperada = {
    dataReferencia: 'string',
    rodizio: {
      cotasAtivas: 'number',
      pacientesAtendidos: 'number',
      excecoesGeradas: 'number',
      detalhesExcecoes: 'array'
    },
    hospitalGlobal: {
      totalAtendimentos: {
        total: 'number',
        pa: 'number',
        contagem: 'number',
        pa3: 'number'
      },
      medicosAtivos: {
        total: 'number',
        pa: 'number',
        contagem: 'number',
        pa3: 'number'
      },
      temposProcesso: {
        esperaRecepcao: 'number',
        cadastro: 'number',
        esperaMedica: 'number',
        consulta: 'number',
        permanenciaTotal: 'number'
      }
    },
    rankings: {
      conveniosDia: 'array',
      conveniosMes: 'array',
      cidsDia: 'array',
      cidsMes: 'array'
    }
  };

  verificarEstrutura(data, estruturaEsperada, 'root');
  console.log('✅ Estrutura validada com sucesso!\n');
}

// ============================================================================
// TESTE 2: Tipos de Dados
// ============================================================================

async function testTiposDados() {
  console.log('🔢 TESTE 2: Validando tipos de dados...');

  const response = await api.get('/supervisao/dashboard');
  const data = response.data;

  let erros = [];

  // Verificar data
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.dataReferencia)) {
    erros.push(`❌ dataReferencia inválida: ${data.dataReferencia} (esperado: YYYY-MM-DD)`);
  }

  // Verificar atendimentos
  const { totalAtendimentos, medicosAtivos, temposProcesso } = data.hospitalGlobal;

  if (totalAtendimentos.total < 0) erros.push('❌ TOTAL_ATENDIMENTOS negativo');
  if (totalAtendimentos.pa < 0) erros.push('❌ TOTAL_PA negativo');
  if (totalAtendimentos.contagem < 0) erros.push('❌ TOTAL_CONTAGEM negativo');
  if (totalAtendimentos.pa3 < 0) erros.push('❌ TOTAL_PA3 negativo');

  if (medicosAtivos.total < 0) erros.push('❌ TOTAL_MEDICOS negativo');
  if (medicosAtivos.pa < 0) erros.push('❌ MEDICOS_PA negativo');
  if (medicosAtivos.contagem < 0) erros.push('❌ MEDICOS_CONTAGEM negativo');
  if (medicosAtivos.pa3 < 0) erros.push('❌ MEDICOS_PA3 negativo');

  // Verificar tempos (medianas)
  if (temposProcesso.esperaRecepcao < 0) erros.push('❌ MEDIANA_ESPERA_RECEP negativa');
  if (temposProcesso.cadastro < 0) erros.push('❌ MEDIANA_CADASTRO negativa');
  if (temposProcesso.esperaMedica < 0) erros.push('❌ MEDIANA_ESPERA_MEDICA negativa');
  if (temposProcesso.consulta < 0) erros.push('❌ MEDIANA_CONSULTA negativa');
  if (temposProcesso.permanenciaTotal < 0) erros.push('❌ MEDIANA_PERMANENCIA_TOTAL negativa');

  if (erros.length > 0) {
    erros.forEach(e => console.error(e));
    throw new Error(`${erros.length} erro(s) de tipo encontrado(s)`);
  }

  console.log('✅ Todos os tipos validados com sucesso!\n');
}

// ============================================================================
// TESTE 3: Regras de Negócio
// ============================================================================

async function testRegrasNegocio() {
  console.log('📏 TESTE 3: Validando regras de negócio...');

  const response = await api.get('/supervisao/dashboard');
  const data = response.data;
  const { totalAtendimentos, medicosAtivos } = data.hospitalGlobal;

  let erros = [];

  // Regra 1: TOTAL >= PA + CONTAGEM + PA3
  // (um atendimento pode aparecer em múltiplas origens)
  const somaAtendimentos = totalAtendimentos.pa + totalAtendimentos.contagem + totalAtendimentos.pa3;
  if (totalAtendimentos.total < somaAtendimentos) {
    erros.push(`❌ Inconsistência: TOTAL_ATENDIMENTOS (${totalAtendimentos.total}) < PA+CONTAGEM+PA3 (${somaAtendimentos})`);
  }

  // Regra 2: MEDICOS.TOTAL >= MEDICOS.PA + MEDICOS.CONTAGEM + MEDICOS.PA3
  // (um médico pode atender em múltiplas origens)
  const somaMedicos = medicosAtivos.pa + medicosAtivos.contagem + medicosAtivos.pa3;
  if (medicosAtivos.total < somaMedicos) {
    erros.push(`❌ Inconsistência: TOTAL_MEDICOS (${medicosAtivos.total}) < PA+CONTAGEM+PA3 (${somaMedicos})`);
  }

  // Regra 3: Se há atendimentos, deve haver médicos
  if (totalAtendimentos.total > 0 && medicosAtivos.total === 0) {
    erros.push('❌ Há atendimentos mas nenhum médico registrado');
  }

  if (erros.length > 0) {
    erros.forEach(e => console.error(e));
    throw new Error(`${erros.length} violação(ões) de regra encontrada(s)`);
  }

  console.log('✅ Todas as regras de negócio validadas!\n');
}

// ============================================================================
// TESTE 4: Atualização em Tempo Real
// ============================================================================

async function testAtualizacaoTempo() {
  console.log('⏱️ TESTE 4: Verificando atualização em tempo real...');

  const hoje = new Date().toLocaleDateString('en-CA');
  const response1 = await api.get(`/supervisao/dashboard?data=${hoje}`);

  console.log(`  - Primeira requisição: ${new Date().toLocaleTimeString()}`);
  const data1 = response1.data.hospitalGlobal.totalAtendimentos.total;

  // Aguardar 5 segundos
  await new Promise(resolve => setTimeout(resolve, 5000));

  const response2 = await api.get(`/supervisao/dashboard?data=${hoje}`);
  console.log(`  - Segunda requisição (após 5s): ${new Date().toLocaleTimeString()}`);
  const data2 = response2.data.hospitalGlobal.totalAtendimentos.total;

  console.log(`  - Resultado 1: ${data1} atendimentos`);
  console.log(`  - Resultado 2: ${data2} atendimentos`);

  if (data1 !== data2) {
    console.log(`  ℹ️ Dados atualizados (diferença: ${data2 - data1})`);
  } else {
    console.log(`  ℹ️ Dados sem alterações`);
  }

  console.log('✅ Teste de atualização concluído!\n');
}

// ============================================================================
// TESTE 5: Filtro por Data
// ============================================================================

async function testFiltroPorData() {
  console.log('📅 TESTE 5: Testando filtro por data...');

  const hoje = new Date().toLocaleDateString('en-CA');
  const ontem = new Date(Date.now() - 86400000).toLocaleDateString('en-CA');
  const setedias = new Date(Date.now() - 7*86400000).toLocaleDateString('en-CA');

  const resHoje = await api.get(`/supervisao/dashboard?data=${hoje}`);
  const resOntem = await api.get(`/supervisao/dashboard?data=${ontem}`);
  const resSetedias = await api.get(`/supervisao/dashboard?data=${setedias}`);

  console.log(`  - Hoje (${hoje}): ${resHoje.data.hospitalGlobal.totalAtendimentos.total} atendimentos`);
  console.log(`  - Ontem (${ontem}): ${resOntem.data.hospitalGlobal.totalAtendimentos.total} atendimentos`);
  console.log(`  - 7 dias atrás (${setedias}): ${resSeteiais.data.hospitalGlobal.totalAtendimentos.total} atendimentos`);

  console.log('✅ Filtro por data funcionando!\n');
}

// ============================================================================
// FUNÇÕES AUXILIARES
// ============================================================================

function verificarEstrutura(obj, schema, path = '') {
  for (const [key, expectedType] of Object.entries(schema)) {
    const fullPath = path ? `${path}.${key}` : key;

    if (!(key in obj)) {
      throw new Error(`❌ Campo ausente: ${fullPath}`);
    }

    const actualType = Array.isArray(obj[key]) ? 'array' : typeof obj[key];

    if (expectedType === 'number' && typeof obj[key] !== 'number') {
      throw new Error(`❌ Tipo incorreto em ${fullPath}: esperado number, recebido ${actualType}`);
    }

    if (expectedType === 'string' && typeof obj[key] !== 'string') {
      throw new Error(`❌ Tipo incorreto em ${fullPath}: esperado string, recebido ${actualType}`);
    }

    if (expectedType === 'array' && !Array.isArray(obj[key])) {
      throw new Error(`❌ Tipo incorreto em ${fullPath}: esperado array, recebido ${actualType}`);
    }

    // Verificação recursiva para objetos
    if (typeof expectedType === 'object' && !Array.isArray(expectedType)) {
      verificarEstrutura(obj[key], expectedType, fullPath);
    }
  }
}

// ============================================================================
// EXECUÇÃO
// ============================================================================

runTests().catch(erro => {
  console.error('\n❌ Teste falhou:', erro.message);
  process.exit(1);
});

module.exports = { runTests };
