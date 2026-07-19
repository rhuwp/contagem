import { useState } from 'react';
import { api } from '../lib/axios';
import { useAuthStore } from '../app/store/authStore';
import { useModalStore } from '../app/store/modalStore';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { FileDown } from 'lucide-react';

interface Props {
  // Linhas extras impressas no rodapé do PDF (ex: indicadores do fechamento)
  linhasIndicadores?: string[];
  // Tema visual: roxo (Supervisão) ou slate (PA)
  cor?: 'purple' | 'slate';
}

// Formulário + PDF de passagem de plantão — compartilhado entre Supervisão e PA
export default function PassagemPlantao({ linhasIndicadores = [], cor = 'purple' }: Props) {
  const { user } = useAuthStore();
  const mostrarModal = useModalStore((s) => s.mostrarModal);

  const [turno, setTurno] = useState('Manha');
  const [pendencias, setPendencias] = useState('');
  const [intercorrencias, setIntercorrencias] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [enviando, setEnviando] = useState(false);

  const dataHoje = new Date().toLocaleDateString('en-CA');

  const gerarPDF = () => {
    const doc = new jsPDF() as any;
    const dataHora = new Date().toLocaleString();
    const nomeResponsavel = user?.nome || 'Sistema (Não Identificado)';

    doc.setFontSize(18);
    doc.text('Relatorio de Passagem de Plantao - IPO', 14, 20);
    doc.setFontSize(10);
    doc.text(`Gerado em: ${dataHora} | Responsavel: ${nomeResponsavel}`, 14, 28);
    doc.line(14, 32, 196, 32);

    autoTable(doc, {
      startY: 40,
      head: [['Campo', 'Informacao']],
      body: [
        ['Turno', turno],
        ['Responsavel', nomeResponsavel],
        ['Pendencias', pendencias || 'Nenhuma informada'],
        ['Intercorrencias', intercorrencias || 'Nenhuma informada'],
        ['Observacoes Gerais', observacoes || 'Nenhuma informada'],
      ],
      theme: 'grid',
      headStyles: { fillColor: cor === 'purple' ? [126, 34, 206] : [30, 41, 59] },
    });

    if (linhasIndicadores.length > 0) {
      const finalY = doc.lastAutoTable.finalY + 10;
      doc.setFontSize(14);
      doc.text('Indicadores no Fechamento:', 14, finalY);
      doc.setFontSize(10);
      linhasIndicadores.forEach((linha, i) => doc.text(linha, 14, finalY + 8 + i * 6));
    }

    doc.save(`Plantao_IPO_${dataHoje}_${turno}.pdf`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (enviando) return;
    if (!user?.id) {
      return mostrarModal('erro', 'Erro de Sessão', 'O seu utilizador não foi reconhecido. Faça login novamente.');
    }

    setEnviando(true);
    try {
      await api.post('/supervisao/plantao', { turno, pendencias, intercorrencias, observacoes });
      gerarPDF();
      mostrarModal('sucesso', 'Plantão Registrado', 'Passagem de plantão consolidada e PDF gerado com sucesso!');
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
      <button
        type="submit"
        disabled={enviando}
        className={`w-full ${botao} disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold py-4 rounded-lg shadow-md transition-colors text-lg mt-2 flex items-center justify-center gap-2`}
      >
        <FileDown className="w-5 h-5" /> {enviando ? 'Registrando...' : 'Submeter e Gerar Relatório PDF'}
      </button>
    </form>
  );
}
