import { api } from './axios';

// Dados estruturados do relatório de passagem de plantão — buscados FRESCOS
// do banco na hora de gerar. Compartilhado entre PA e Supervisão, e entre
// os dois formatos de saída (PDF e Excel).
export interface DadosRelatorio {
  dataReferencia: string;
  indicadores: any;
  cotas: any[];     // cotas do dia, das duas filas (campo `fila`)
  excecoes: any[];  // furos do dia (campo `fila`)
}

// Resumo agregado de uma fila: uma linha por médico
export interface ResumoMedico {
  medico: string;
  pedidos: number;
  vagas: number;        // soma das vagas solicitadas (cotas normais)
  continua: boolean;    // possui ao menos uma cota contínua
  encaminhados: number; // envios normais
  excecoes: number;     // envios por exceção
}

export const NOME_FILA: Record<string, string> = {
  CONTAGEM: 'Contagem',
  CONTAGEM_3: 'Contagem 3',
};

// data opcional (AAAA-MM-DD): sem ela, o backend usa a data atual.
export async function obterDadosRelatorio(data?: string): Promise<DadosRelatorio> {
  const sufixo = data ? `?data=${data}` : '';
  const [resInd, resRel] = await Promise.all([
    api.get(`/pa/indicadores${sufixo}`),
    api.get(`/pa/relatorio-plantao${sufixo}`),
  ]);

  return {
    dataReferencia: resRel.data?.dataReferencia || data || new Date().toLocaleDateString('en-CA'),
    indicadores: resInd.data,
    cotas: resRel.data?.cotas || [],
    excecoes: resRel.data?.excecoes || [],
  };
}

// Agrega as cotas de uma fila em uma linha por médico
export function resumirPorMedico(cotas: any[], fila: string): ResumoMedico[] {
  const mapa = new Map<string, ResumoMedico>();

  cotas.filter(c => c.fila === fila).forEach((c: any) => {
    const r = mapa.get(c.medico_nome) || {
      medico: c.medico_nome, pedidos: 0, vagas: 0, continua: false, encaminhados: 0, excecoes: 0,
    };
    r.pedidos += 1;
    if (c.fila_continua) r.continua = true;
    else r.vagas += c.quantidade_solicitada || 0;
    r.encaminhados += c.encaminhados_normais || 0;
    r.excecoes += c.encaminhados_excecao || 0;
    mapa.set(c.medico_nome, r);
  });

  return [...mapa.values()].sort((a, b) => (b.encaminhados + b.excecoes) - (a.encaminhados + a.excecoes));
}

const hora = (ts: string) =>
  new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const linhaMedico = (r: ResumoMedico): string => {
  const vagas = r.continua
    ? (r.vagas > 0 ? `${r.vagas} vaga(s) + cota continua` : 'cota continua')
    : `${r.vagas} vaga(s)`;
  const excecao = r.excecoes > 0 ? `, ${r.excecoes} por excecao` : '';
  return `Dr(a). ${r.medico} — ${r.pedidos} pedido(s), ${vagas}, ${r.encaminhados} paciente(s) encaminhado(s)${excecao}.`;
};

// Converte os dados estruturados nas linhas do PDF ("## " = título de seção)
export function montarLinhas(d: DadosRelatorio): string[] {
  const ind = d.indicadores;

  const linhas: string[] = [
    '## Indicadores do Dia',
    `Data de referencia: ${d.dataReferencia}`,
    `Atendimentos no dia: ${ind?.totalAtendimentos || 0}`,
    `Espera Recepcao (mediana): ${ind?.tempos?.esperaRecepcao || 0} min   |   Tempo de Cadastro (mediana): ${ind?.tempos?.cadastro || 0} min`,
    `Espera Medica (mediana): ${ind?.tempos?.esperaMedica || 0} min   |   Permanencia Total (mediana): ${ind?.tempos?.permanenciaTotal || 0} min`,
  ];

  for (const fila of ['CONTAGEM', 'CONTAGEM_3']) {
    linhas.push(`## Fila ${NOME_FILA[fila]} — Resumo por Medico`);
    const resumo = resumirPorMedico(d.cotas, fila);
    if (!resumo.length) {
      linhas.push('Nenhum pedido registrado na data.');
    } else {
      resumo.forEach(r => linhas.push(linhaMedico(r)));
      const totPedidos = resumo.reduce((a, r) => a + r.pedidos, 0);
      const totEnc = resumo.reduce((a, r) => a + r.encaminhados + r.excecoes, 0);
      linhas.push(`TOTAL DA FILA: ${totPedidos} pedido(s), ${totEnc} paciente(s) encaminhado(s).`);
    }
  }

  linhas.push('## Furos de Fila (Excecoes)');
  if (!d.excecoes.length) {
    linhas.push('Nenhum furo de fila registrado na data.');
  } else {
    d.excecoes.forEach((e: any) => {
      linhas.push(`[${NOME_FILA[e.fila] || e.fila}] ${hora(e.criado_em)} — Paciente ${e.paciente_identificador} enviado a Dr(a). ${e.medico_nome || 'N/A'} pelo operador ${e.usuario_nome || 'N/A'}. Justificativa: ${e.justificativa || 'nao informada'}`);
    });
  }

  return linhas;
}
