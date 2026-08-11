const fs = require('fs');
const path = require('path');

// ============================================================================
// TRAVA DE EXPIRAÇÃO (período de avaliação)
//
// >>> DEFINA A DATA-LIMITE AQUI ANTES DE GERAR O .EXE <<<
// Formato: 'AAAA-MM-DD'. Exemplo: '2026-09-30' (expira ao fim desse dia).
// Com null, a trava fica DESATIVADA (modo desenvolvimento).
//
// A data fica embutida no executável — não é lida do .env de propósito,
// para não poder ser alterada na máquina de teste.
// ============================================================================
const DATA_LIMITE = '2026-09-18';

// Arquivo de marca d'água temporal: guarda o maior "agora" já visto.
// Impede burlar a trava voltando o relógio do Windows.
const ARQUIVO_MARCA = path.join(path.dirname(process.execPath.includes('node') ? process.cwd() : process.execPath), 'licenca.dat');

function lerMarca() {
  try {
    const bruto = fs.readFileSync(ARQUIVO_MARCA, 'utf-8');
    // Armazenado em base64 só para não ser óbvio a olho nu
    const ts = parseInt(Buffer.from(bruto, 'base64').toString('utf-8'), 10);
    return Number.isFinite(ts) ? ts : 0;
  } catch {
    return 0;
  }
}

function gravarMarca(ts) {
  try {
    fs.writeFileSync(ARQUIVO_MARCA, Buffer.from(String(ts), 'utf-8').toString('base64'));
  } catch {
    // sem permissão de escrita não é motivo para derrubar o sistema
  }
}

// Consulta a hora em fonte externa (quando a máquina tiver internet).
// Falhou/timeout? Retorna null e seguimos com o relógio local + marca.
async function obterHoraExterna() {
  const fontes = [
    { url: 'https://worldtimeapi.org/api/timezone/Etc/UTC', campo: 'utc_datetime' },
    { url: 'https://timeapi.io/api/Time/current/zone?timeZone=UTC', campo: 'dateTime' },
  ];

  for (const fonte of fontes) {
    try {
      const controlador = new AbortController();
      const timer = setTimeout(() => controlador.abort(), 5000);
      const resposta = await fetch(fonte.url, { signal: controlador.signal });
      clearTimeout(timer);
      if (!resposta.ok) continue;
      const dados = await resposta.json();
      const data = new Date(dados[fonte.campo]);
      if (!isNaN(data.getTime())) return data;
    } catch {
      // tenta a próxima fonte
    }
  }
  return null;
}

async function verificarLicenca() {
  if (!DATA_LIMITE) return; // trava desativada

  const limite = new Date(`${DATA_LIMITE}T23:59:59`);

  // "Agora" mais confiável disponível:
  // 1) começa pelo relógio local;
  // 2) se a marca gravada for maior, o relógio foi voltado — usa a marca;
  // 3) se houver internet, a hora externa é soberana.
  let agora = new Date();
  const marca = lerMarca();
  if (marca > agora.getTime()) agora = new Date(marca);

  const externa = await obterHoraExterna();
  if (externa) agora = externa;

  gravarMarca(Math.max(agora.getTime(), marca));

  if (agora > limite) {
    console.error('==========================================================');
    console.error(' Período de avaliação encerrado.');
    console.error(' Entre em contato com o fornecedor para ativar o sistema.');
    console.error('==========================================================');
    process.exit(1);
  }
}

module.exports = { verificarLicenca };
