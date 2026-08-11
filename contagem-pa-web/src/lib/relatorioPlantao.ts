import { api } from './axios';

// Dados estruturados do relatório de passagem de plantão — buscados FRESCOS
// do banco na hora de gerar. Compartilhado entre PADashboard e Supervisão,
// e entre os dois formatos de saída (PDF e Excel).
export interface DadosRelatorio {
  dataReferencia: string;
  indicadores: any;
  fila1: any[];
  fila2: any[];
  excecoes: any[];
}

// data opcional (AAAA-MM-DD): sem ela, o backend usa a data atual.
// A Supervisão passa a data selecionada no calendário.
export async function obterDadosRelatorio(data?: string): Promise<DadosRelatorio> {
  const sufixo = data ? `?data=${data}` : '';
  const [resInd, resRel] = await Promise.all([
    api.get(`/pa/indicadores${sufixo}`),
    api.get(`/pa/relatorio-plantao${sufixo}`),
  ]);

  return {
    dataReferencia: resRel.data?.dataReferencia || data || new Date().toLocaleDateString('en-CA'),
    indicadores: resInd.data,
    fila1: resRel.data?.fila1 || [],
    fila2: resRel.data?.fila2 || [],
    excecoes: resRel.data?.excecoes || [],
  };
}

const hora = (ts: string) =>
  new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

// Converte os dados estruturados nas linhas do PDF ("## " = título de seção)
export function montarLinhas(d: DadosRelatorio): string[] {
  const ind = d.indicadores;

  const linhas: string[] = [
    '## Indicadores do Dia',
    `Data de referencia: ${d.dataReferencia}`,
    `Atendimentos no dia: ${ind?.totalAtendimentos || 0}`,
    `Espera Recepcao (mediana): ${ind?.tempos?.esperaRecepcao || 0} min   |   Tempo de Cadastro (mediana): ${ind?.tempos?.cadastro || 0} min`,
    `Espera Medica (mediana): ${ind?.tempos?.esperaMedica || 0} min   |   Permanencia Total (mediana): ${ind?.tempos?.permanenciaTotal || 0} min`,
    '## Fila 1 - Cotas (Secretarias)',
  ];

  if (!d.fila1.length) {
    linhas.push('Nenhuma cota registrada na data.');
  } else {
    d.fila1.forEach((c: any) => {
      if (c.fila_continua) {
        linhas.push(`Dr(a). ${c.medico_nome} - cota continua aberta por ${c.secretaria_nome || 'N/A'}: ${c.total_encaminhados || 0} paciente(s) encaminhado(s). [${c.status}]`);
      } else {
        linhas.push(`Dr(a). ${c.medico_nome} solicitou ${c.quantidade_solicitada} cota(s) (aberta por ${c.secretaria_nome || 'N/A'}): ${c.total_encaminhados || 0} paciente(s) encaminhado(s), ${c.quantidade_restante} vaga(s) restante(s). [${c.status}]`);
      }
    });
  }

  linhas.push('## Fila 2 - Fila da Recepcao');
  if (!d.fila2.length) {
    linhas.push('Nenhum medico passou pela fila da recepcao na data.');
  } else {
    d.fila2.forEach((f: any) => {
      const situacao = f.status === 'ATIVO'
        ? 'ainda na fila'
        : `removido${f.removido_por_nome ? ` por ${f.removido_por_nome}` : ''}`;
      linhas.push(`Foram enviados ${f.total_encaminhados || 0} paciente(s) para Dr(a). ${f.medico_nome} (adicionado por ${f.adicionado_por_nome || 'N/A'}, ${situacao}).`);
    });
  }

  linhas.push('## Furos de Fila (Excecoes)');
  if (!d.excecoes.length) {
    linhas.push('Nenhum furo de fila registrado na data.');
  } else {
    d.excecoes.forEach((e: any) => {
      linhas.push(`${hora(e.criado_em)} - Paciente ${e.paciente_identificador} enviado a Dr(a). ${e.medico_nome || 'N/A'} pelo operador ${e.usuario_nome || 'N/A'}. Justificativa: ${e.justificativa || 'nao informada'}`);
    });
  }

  return linhas;
}
