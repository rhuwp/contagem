import { useState } from 'react';
import { api } from '../lib/axios';
import { useAuthStore } from '../app/store/authStore';
import { useModalStore } from '../app/store/modalStore';
import { montarLinhas, type DadosRelatorio } from '../lib/relatorioPlantao';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { FileDown, FileSpreadsheet } from 'lucide-react';

interface Props {
  // Busca os dados frescos do banco na hora de gerar (PA: hoje; Supervisão: data do calendário)
  obterDados: () => Promise<DadosRelatorio>;
  // Tema visual: roxo (Supervisão) ou slate (PA)
  cor?: 'purple' | 'slate';
}

// Formulário + relatório de passagem de plantão (PDF ou Excel) — compartilhado
export default function PassagemPlantao({ obterDados, cor = 'purple' }: Props) {
  const { user } = useAuthStore();
  const mostrarModal = useModalStore((s) => s.mostrarModal);

  const [turno, setTurno] = useState('Manha');
  const [pendencias, setPendencias] = useState('');
  const [intercorrencias, setIntercorrencias] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [formato, setFormato] = useState<'pdf' | 'xlsx'>('pdf');
  const [enviando, setEnviando] = useState(false);

  const corTema: [number, number, number] = cor === 'purple' ? [126, 34, 206] : [30, 41, 59];
  const nomeResponsavel = user?.nome || 'Sistema (Não Identificado)';

  // ==================== PDF ====================
  const gerarPDF = (dados: DadosRelatorio | null) => {
    const doc = new jsPDF() as any;
    const dataHora = new Date().toLocaleString('pt-BR');
    const dataRef = dados?.dataReferencia || new Date().toLocaleDateString('en-CA');
    const linhas = dados ? montarLinhas(dados) : ['(Falha ao buscar os dados do dia — indicadores omitidos)'];

    // Cabeçalho com faixa colorida
    doc.setFillColor(...corTema);
    doc.rect(0, 0, 210, 30, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('RELATORIO DE PASSAGEM DE PLANTAO', 14, 13);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`IPO - Pronto Atendimento   |   Referencia: ${dataRef}   |   Gerado em: ${dataHora}`, 14, 21);
    doc.setTextColor(0, 0, 0);

    // Dados do plantão
    autoTable(doc, {
      startY: 38,
      head: [['Campo', 'Informacao']],
      body: [
        ['Data de referencia', dataRef],
        ['Turno', turno],
        ['Responsavel', nomeResponsavel],
        ['Pendencias', pendencias || 'Nenhuma informada'],
        ['Intercorrencias', intercorrencias || 'Nenhuma informada'],
        ['Observacoes Gerais', observacoes || 'Nenhuma informada'],
      ],
      theme: 'striped',
      headStyles: { fillColor: corTema, fontSize: 9 },
      styles: { fontSize: 9, cellPadding: 2.5 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 45 } },
    });

    // Seções de indicadores
    let y = doc.lastAutoTable.finalY + 10;
    const quebraPagina = (altura: number) => {
      if (y + altura > 282) { doc.addPage(); y = 20; }
    };

    linhas.forEach((linha) => {
      if (linha.startsWith('## ')) {
        quebraPagina(14);
        y += 5;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(...corTema);
        doc.text(linha.slice(3).toUpperCase(), 14, y);
        doc.setDrawColor(...corTema);
        doc.setLineWidth(0.4);
        doc.line(14, y + 1.5, 196, y + 1.5);
        y += 8;
        doc.setTextColor(60, 60, 60);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.5);
      } else {
        const quebradas: string[] = doc.splitTextToSize(linha, 178);
        quebraPagina(quebradas.length * 5 + 2);
        doc.text(quebradas, 16, y);
        y += quebradas.length * 5 + 1.5;
      }
    });

    // Rodapé com numeração
    const totalPaginas = doc.getNumberOfPages();
    for (let p = 1; p <= totalPaginas; p++) {
      doc.setPage(p);
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(`Contagem PA - Documento gerado automaticamente | Pagina ${p} de ${totalPaginas}`, 105, 292, { align: 'center' });
    }

    doc.save(`Plantao_IPO_${dataRef}_${turno}.pdf`);
  };

  // ==================== EXCEL ====================
  const gerarXLS = (d: DadosRelatorio) => {
    const wb = XLSX.utils.book_new();

    const abaPlantao = XLSX.utils.json_to_sheet([
      { Campo: 'Data de referencia', Informacao: d.dataReferencia },
      { Campo: 'Turno', Informacao: turno },
      { Campo: 'Responsavel', Informacao: nomeResponsavel },
      { Campo: 'Pendencias', Informacao: pendencias || 'Nenhuma informada' },
      { Campo: 'Intercorrencias', Informacao: intercorrencias || 'Nenhuma informada' },
      { Campo: 'Observacoes Gerais', Informacao: observacoes || 'Nenhuma informada' },
      { Campo: 'Gerado em', Informacao: new Date().toLocaleString('pt-BR') },
    ]);
    XLSX.utils.book_append_sheet(wb, abaPlantao, 'Plantao');

    const ind = d.indicadores;
    const abaIndicadores = XLSX.utils.json_to_sheet([
      { Indicador: 'Atendimentos no dia', Valor: ind?.totalAtendimentos || 0 },
      { Indicador: 'Espera Recepcao - mediana (min)', Valor: ind?.tempos?.esperaRecepcao || 0 },
      { Indicador: 'Tempo de Cadastro - mediana (min)', Valor: ind?.tempos?.cadastro || 0 },
      { Indicador: 'Espera Medica - mediana (min)', Valor: ind?.tempos?.esperaMedica || 0 },
      { Indicador: 'Permanencia Total - mediana (min)', Valor: ind?.tempos?.permanenciaTotal || 0 },
    ]);
    XLSX.utils.book_append_sheet(wb, abaIndicadores, 'Indicadores');

    const abaFila1 = XLSX.utils.json_to_sheet(
      d.fila1.length
        ? d.fila1.map((c: any) => ({
            Medico: c.medico_nome,
            'Aberta por': c.secretaria_nome || 'N/A',
            Tipo: c.fila_continua ? 'Continua' : 'Normal',
            'Cotas solicitadas': c.fila_continua ? '∞' : c.quantidade_solicitada,
            'Pacientes encaminhados': c.total_encaminhados || 0,
            'Vagas restantes': c.fila_continua ? '∞' : c.quantidade_restante,
            Status: c.status,
          }))
        : [{ Aviso: 'Nenhuma cota registrada na data.' }]
    );
    XLSX.utils.book_append_sheet(wb, abaFila1, 'Fila 1 - Cotas');

    const abaFila2 = XLSX.utils.json_to_sheet(
      d.fila2.length
        ? d.fila2.map((f: any) => ({
            Medico: f.medico_nome,
            CRM: f.medico_crm || '',
            'Pacientes encaminhados': f.total_encaminhados || 0,
            'Adicionado por': f.adicionado_por_nome || 'N/A',
            Situacao: f.status === 'ATIVO' ? 'Na fila' : `Removido${f.removido_por_nome ? ` por ${f.removido_por_nome}` : ''}`,
          }))
        : [{ Aviso: 'Nenhum medico passou pela fila da recepcao na data.' }]
    );
    XLSX.utils.book_append_sheet(wb, abaFila2, 'Fila 2 - Recepcao');

    const abaExcecoes = XLSX.utils.json_to_sheet(
      d.excecoes.length
        ? d.excecoes.map((e: any) => ({
            Hora: new Date(e.criado_em).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            Paciente: e.paciente_identificador,
            'Medico acionado': e.medico_nome || 'N/A',
            Operador: e.usuario_nome || 'N/A',
            Justificativa: e.justificativa || 'Nao informada',
          }))
        : [{ Aviso: 'Nenhum furo de fila registrado na data.' }]
    );
    XLSX.utils.book_append_sheet(wb, abaExcecoes, 'Furos de Fila');

    XLSX.writeFile(wb, `Plantao_IPO_${d.dataReferencia}_${turno}.xlsx`);
  };

  // ==================== SUBMISSÃO ====================
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (enviando) return;
    if (!user?.id) {
      return mostrarModal('erro', 'Erro de Sessão', 'O seu utilizador não foi reconhecido. Faça login novamente.');
    }

    setEnviando(true);
    try {
      // Busca os dados frescos do banco ANTES de registrar
      let dados: DadosRelatorio | null = null;
      try {
        dados = await obterDados();
      } catch {
        dados = null;
      }

      await api.post('/supervisao/plantao', { turno, pendencias, intercorrencias, observacoes });

      if (formato === 'xlsx' && dados) {
        gerarXLS(dados);
      } else {
        if (formato === 'xlsx' && !dados) {
          mostrarModal('aviso', 'Dados Indisponíveis', 'Não foi possível buscar os dados para o Excel — foi gerado um PDF simplificado.');
        }
        gerarPDF(dados);
      }

      mostrarModal('sucesso', 'Plantão Registrado', 'Passagem de plantão consolidada e relatório gerado com sucesso!');
      setPendencias(''); setIntercorrencias(''); setObservacoes('');
    } catch (error: any) {
      mostrarModal('erro', 'Falha no Registro', error.response?.data?.erro || 'Não foi possível registrar a passagem de plantão.');
    } finally {
      setEnviando(false);
    }
  };

  const anel = cor === 'purple' ? 'focus:ring-purple-500' : 'focus:ring-slate-800';
  const botao = cor === 'purple' ? 'bg-purple-600 hover:bg-purple-700' : 'bg-slate-800 hover:bg-slate-900';

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <select value={turno} onChange={(e) => setTurno(e.target.value)} className={`w-full px-4 py-3 border border-slate-200 rounded-lg bg-slate-50 outline-none focus:ring-2 ${anel} font-medium`}>
        <option value="Manha">Turno da Manhã</option>
        <option value="Tarde">Turno da Tarde</option>
        <option value="Noite">Turno da Noite</option>
      </select>
      <textarea value={pendencias} onChange={e => setPendencias(e.target.value)} className={`w-full px-4 py-3 border border-slate-200 rounded-lg h-24 outline-none focus:ring-2 ${anel}`} placeholder="Ex: Pendências, exames aguardando autorização..." />
      <textarea value={intercorrencias} onChange={e => setIntercorrencias(e.target.value)} className={`w-full px-4 py-3 border border-slate-200 rounded-lg h-24 outline-none focus:ring-2 ${anel}`} placeholder="Ex: Intercorrências, falhas de sistema, falta de médicos..." />
      <textarea value={observacoes} onChange={e => setObservacoes(e.target.value)} className={`w-full px-4 py-3 border border-slate-200 rounded-lg h-24 outline-none focus:ring-2 ${anel}`} placeholder="Observações gerais do turno..." />

      {/* Formato do relatório */}
      <div>
        <p className="text-xs font-semibold text-slate-500 mb-1.5">Formato do relatório</p>
        <div className="flex p-1 bg-slate-100 rounded-lg border border-slate-200 w-fit">
          <button
            type="button"
            onClick={() => setFormato('pdf')}
            className={`px-4 py-2 text-sm font-semibold rounded-md flex items-center gap-1.5 transition-all ${formato === 'pdf' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <FileDown className="w-4 h-4" /> PDF
          </button>
          <button
            type="button"
            onClick={() => setFormato('xlsx')}
            className={`px-4 py-2 text-sm font-semibold rounded-md flex items-center gap-1.5 transition-all ${formato === 'xlsx' ? 'bg-white shadow-sm text-emerald-700' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <FileSpreadsheet className="w-4 h-4" /> Excel (XLSX)
          </button>
        </div>
      </div>

      <button
        type="submit"
        disabled={enviando}
        className={`w-full ${botao} disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold py-4 rounded-lg shadow-md transition-colors text-lg mt-2 flex items-center justify-center gap-2`}
      >
        {formato === 'pdf' ? <FileDown className="w-5 h-5" /> : <FileSpreadsheet className="w-5 h-5" />}
        {enviando ? 'Registrando...' : `Submeter e Gerar ${formato === 'pdf' ? 'PDF' : 'Excel'}`}
      </button>
    </form>
  );
}
