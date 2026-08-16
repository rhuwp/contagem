import { useState, useEffect } from 'react';
import { api } from '../../../lib/axios';
import { useAuthStore } from '../../../app/store/authStore';
import { useModalStore } from '../../../app/store/modalStore';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { LogOut, UserPlus, ClipboardList, Activity, XCircle, Search, FileDown, ListChecks } from 'lucide-react';

type Fila = 'CONTAGEM' | 'CONTAGEM_3';

const NOME_FILA: Record<Fila, string> = {
  CONTAGEM: 'Contagem',
  CONTAGEM_3: 'Contagem 3',
};

export default function SecretariaDashboard() {
  const { user, logout } = useAuthStore();
  const mostrarModal = useModalStore((state) => state.mostrarModal);
  const mostrarConfirmacao = useModalStore((state) => state.mostrarConfirmacao);

  // Fila selecionada (abas)
  const [filaAtiva, setFilaAtiva] = useState<Fila>('CONTAGEM');

  const [medicos, setMedicos] = useState<any[]>([]);
  const [cotasAtivas, setCotasAtivas] = useState<any[]>([]);

  // Contador pessoal: pedidos do dia da secretária logada
  const [meusPedidos, setMeusPedidos] = useState<any>(null);

  // Busca Inteligente de Médicos
  const [medicoSelecionado, setMedicoSelecionado] = useState('');
  const [buscaMedico, setBuscaMedico] = useState('');
  const [mostrarDropdown, setMostrarDropdown] = useState(false);

  const [quantidade, setQuantidade] = useState<number | string>(1);
  const [filaContinua, setFilaContinua] = useState(false);
  const [observacao, setObservacao] = useState('');
  const [loading, setLoading] = useState(false);

  // Catálogo de médicos (Oracle) e contador: uma vez, no mount
  useEffect(() => {
    carregarMedicos();
    carregarMeusPedidos();
  }, []);

  // Cotas da fila selecionada: carrega ao trocar de aba + polling 5s (aba visível)
  useEffect(() => {
    carregarCotas(filaAtiva);

    const soVisivel = () => {
      if (document.visibilityState === 'visible') carregarCotas(filaAtiva);
    };
    const intervalo = setInterval(soVisivel, 5000);
    document.addEventListener('visibilitychange', soVisivel);
    return () => {
      clearInterval(intervalo);
      document.removeEventListener('visibilitychange', soVisivel);
    };
  }, [filaAtiva]);

  const carregarMedicos = async () => {
    try {
      const resMedicos = await api.get('/medicos');
      setMedicos(resMedicos.data);
    } catch (error) {
      console.error("Erro ao carregar o catálogo de médicos", error);
    }
  };

  const carregarCotas = async (fila: Fila) => {
    try {
      const resCotas = await api.get(`/secretaria/cotas-ativas?fila=${fila}`);
      setCotasAtivas(resCotas.data);
    } catch (error) {
      console.error("Erro ao atualizar a fila de cotas", error);
    }
  };

  const carregarMeusPedidos = async () => {
    try {
      const response = await api.get('/secretaria/meus-pedidos');
      setMeusPedidos(response.data);
    } catch (error) {
      console.error("Erro ao carregar o contador de pedidos", error);
    }
  };

  const handleAbrirCota = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!medicoSelecionado) {
      return mostrarModal('aviso', 'Selecione o Médico', 'Pesquise e clique sobre o nome do médico na lista antes de confirmar.');
    }

    const medicoCompleto = medicos.find(m => String(m.id) === String(medicoSelecionado));

    // Impede abrir cota duplicada para um médico que já está NESTA fila
    const jaTemCota = cotasAtivas.some(c => String(c.medico_id) === String(medicoSelecionado));
    if (jaTemCota) {
      return mostrarModal('aviso', 'Médico Já na Fila', `Este médico já possui uma cota ativa na fila ${NOME_FILA[filaAtiva]}. Cancele a cota atual antes de abrir uma nova.`);
    }

    if (!filaContinua) {
      const qtd = Number(quantidade);
      if (!Number.isInteger(qtd) || qtd < 1) {
        return mostrarModal('aviso', 'Quantidade Inválida', 'Informe um número inteiro maior que zero, ou marque a opção de cota contínua.');
      }
    }

    setLoading(true);
    try {
      await api.post('/secretaria/cota', {
        medico_id: medicoSelecionado,
        medico_nome: medicoCompleto?.nome || 'Nome Indisponível',
        medico_crm: medicoCompleto?.crm || '',
        quantidade_solicitada: filaContinua ? 0 : Number(quantidade),
        fila_continua: filaContinua,
        fila: filaAtiva,
        observacao: observacao
      });

      // Limpa tudo após o sucesso
      setMedicoSelecionado('');
      setBuscaMedico('');
      setQuantidade(1);
      setFilaContinua(false);
      setObservacao('');
      carregarCotas(filaAtiva);
      carregarMeusPedidos();
    } catch (error: any) {
      mostrarModal('erro', 'Falha ao Abrir Cota', error.response?.data?.erro || 'Não foi possível registrar a cota. Tente novamente.');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelarCota = (id: string) => {
    mostrarConfirmacao(
      'Remover Médico da Fila',
      `Tem certeza que deseja cancelar esta cota e remover o médico da fila ${NOME_FILA[filaAtiva]}?`,
      async () => {
        try {
          await api.put(`/secretaria/cota/${id}/cancelar`);
          carregarCotas(filaAtiva);
          carregarMeusPedidos();
        } catch (error: any) {
          mostrarModal('erro', 'Falha no Cancelamento', error.response?.data?.erro || 'Não foi possível cancelar a cota.');
        }
      }
    );
  };

  // Relatório PDF pessoal: pedidos do dia da secretária, com criação e cancelamento
  const gerarPdfMeusPedidos = async () => {
    try {
      const { data } = await api.get('/secretaria/meus-pedidos'); // dados frescos
      const pedidos: any[] = data?.pedidos || [];
      const resumo = data?.resumo || { total: 0, cancelados: 0, porFila: {} };
      const hoje = new Date().toLocaleDateString('pt-BR');
      const hr = (ts: string) => ts ? new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-';

      const doc = new jsPDF() as any;
      doc.setFillColor(37, 99, 235);
      doc.rect(0, 0, 210, 26, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.text('RELATORIO DE PEDIDOS DA SECRETARIA', 14, 11);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(`${user?.nome || ''}   |   Data: ${hoje}   |   Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 19);
      doc.setTextColor(0, 0, 0);

      autoTable(doc, {
        startY: 32,
        head: [['Hora', 'Fila', 'Medico', 'Vagas', 'Status', 'Cancelado em']],
        body: pedidos.length
          ? pedidos.map((p: any) => [
              hr(p.criado_em),
              NOME_FILA[p.fila as Fila] || p.fila,
              p.medico_nome,
              p.fila_continua ? 'Continua' : p.quantidade_solicitada,
              p.status,
              p.status === 'CANCELADO' ? hr(p.atualizado_em) : '-',
            ])
          : [['-', '-', 'Nenhum pedido realizado hoje.', '-', '-', '-']],
        theme: 'striped',
        headStyles: { fillColor: [37, 99, 235], fontSize: 8.5 },
        styles: { fontSize: 8.5, cellPadding: 2 },
      });

      const y = doc.lastAutoTable.finalY + 10;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('Totais do Dia', 14, y);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.text(`Pedidos realizados: ${resumo.total}   |   Contagem: ${resumo.porFila?.CONTAGEM || 0}   |   Contagem 3: ${resumo.porFila?.CONTAGEM_3 || 0}   |   Cancelados: ${resumo.cancelados}`, 14, y + 7);

      doc.save(`Meus_Pedidos_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (error) {
      mostrarModal('erro', 'Falha no Relatório', 'Não foi possível gerar o relatório de pedidos.');
    }
  };

  // Filtra a lista de médicos conforme você digita (pelo Nome ou CRM).
  // Com um médico já selecionado, mostra a lista completa (selecionado em destaque).
  const medicosFiltrados = medicoSelecionado
    ? medicos
    : medicos.filter(m =>
        m.nome.toLowerCase().includes(buscaMedico.toLowerCase()) ||
        (m.crm && m.crm.toLowerCase().includes(buscaMedico.toLowerCase()))
      );

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      <header className="bg-white shadow-sm px-4 md:px-8 py-4 flex flex-wrap justify-between items-center gap-y-2">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-lg">
            <ClipboardList className="text-white w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Painel da Secretaria</h1>
            <p className="text-sm text-slate-500">Gestão de Demanda Unimed</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-sm font-semibold text-slate-800">{user?.nome}</p>
            <p className="text-xs text-slate-500">{user?.usuario}</p>
          </div>
          <button
            onClick={logout}
            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"
            title="Encerrar Sessão"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="flex-1 p-4 md:p-8 max-w-7xl mx-auto w-full space-y-6">

        {/* ===== ABAS DAS FILAS ===== */}
        <div className="inline-flex flex-wrap bg-slate-200/70 p-1 rounded-xl gap-1">
          {(['CONTAGEM', 'CONTAGEM_3'] as Fila[]).map(f => (
            <button
              key={f}
              onClick={() => setFilaAtiva(f)}
              className={`px-5 py-2 text-sm font-bold rounded-lg transition-all ${
                filaAtiva === f ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Fila {NOME_FILA[f]}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8 items-start">

          <div className="lg:col-span-1 space-y-6">
            {/* ===== FORMULÁRIO DE COTA ===== */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <div className="flex items-center gap-2 mb-6 border-b pb-4">
                <UserPlus className="text-blue-600 w-5 h-5" />
                <h2 className="text-lg font-bold text-slate-800">Injetar Cota — {NOME_FILA[filaAtiva]}</h2>
              </div>

              <form onSubmit={handleAbrirCota} className="space-y-4">

                {/* CAMPO DE BUSCA INTELIGENTE DE MÉDICOS */}
                <div className="relative">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Médico Plantonista</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={buscaMedico}
                      onChange={(e) => {
                        setBuscaMedico(e.target.value);
                        setMostrarDropdown(true);
                        setMedicoSelecionado('');
                      }}
                      onFocus={() => setMostrarDropdown(true)}
                      onBlur={() => setTimeout(() => setMostrarDropdown(false), 200)}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 outline-none bg-white pr-10"
                      placeholder="Digite o nome do médico..."
                      required={!medicoSelecionado}
                    />
                    <Search className="w-5 h-5 text-slate-400 absolute right-3 top-2.5" />
                  </div>

                  {mostrarDropdown && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                      {medicosFiltrados.length === 0 ? (
                        <div className="p-4 text-sm text-center text-slate-500">Nenhum médico encontrado.</div>
                      ) : (
                        medicosFiltrados.map(medico => (
                          <div
                            key={medico.id}
                            onMouseDown={() => {
                              setMedicoSelecionado(medico.id);
                              setBuscaMedico(`${medico.nome} ${medico.crm ? `(CRM: ${medico.crm})` : ''}`);
                              setMostrarDropdown(false);
                            }}
                            className={`p-3 cursor-pointer border-b border-slate-100 last:border-0 hover:bg-blue-50 transition-colors ${
                              medicoSelecionado === medico.id ? 'bg-blue-100 font-semibold text-blue-800' : 'text-slate-700'
                            }`}
                          >
                            <p className="font-medium text-sm">{medico.nome}</p>
                            {medico.crm && <p className="text-xs text-slate-500 mt-0.5">CRM: {medico.crm}</p>}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {/* COTA CONTÍNUA */}
                <div className="flex items-start gap-3 bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <input
                    type="checkbox"
                    id="filaContinua"
                    checked={filaContinua}
                    onChange={(e) => setFilaContinua(e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-blue-600 cursor-pointer"
                  />
                  <label htmlFor="filaContinua" className="cursor-pointer">
                    <span className="block text-sm font-semibold text-slate-800">Manter sempre na fila (cota contínua)</span>
                    <span className="block text-xs text-slate-500 mt-0.5">
                      O médico permanece no rodízio sem limite de vagas até esta cota ser cancelada.
                    </span>
                  </label>
                </div>

                {!filaContinua && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Volume Solicitado (Unimed)</label>
                    <input
                      type="number"
                      min="1"
                      value={quantidade}
                      onChange={(e) => setQuantidade(e.target.value)}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 outline-none"
                      required
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Parâmetros/Observações</label>
                  <textarea
                    value={observacao}
                    onChange={(e) => setObservacao(e.target.value)}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 outline-none resize-none h-24"
                    placeholder="Observações do atendimento..."
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold py-3 px-4 rounded-lg transition-colors mt-2"
                >
                  {loading ? 'Processando...' : `Abrir Cota na Fila ${NOME_FILA[filaAtiva]}`}
                </button>
              </form>
            </div>

            {/* ===== CONTADOR PESSOAL ===== */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <div className="flex items-center gap-2 mb-4 border-b pb-3">
                <ListChecks className="text-blue-600 w-5 h-5" />
                <h2 className="text-base font-bold text-slate-800">Meus Pedidos</h2>
              </div>

              <p className="text-sm text-slate-500">Pedidos realizados Hoje:</p>
              <p className="text-4xl font-black text-slate-800 mb-2">{meusPedidos?.resumo?.total ?? 0}</p>
              <p className="text-xs text-slate-500 mb-4">
                Contagem: <span className="font-bold text-slate-700">{meusPedidos?.resumo?.porFila?.CONTAGEM ?? 0}</span>
                {' · '}Contagem 3: <span className="font-bold text-slate-700">{meusPedidos?.resumo?.porFila?.CONTAGEM_3 ?? 0}</span>
                {' · '}Cancelados: <span className="font-bold text-red-600">{meusPedidos?.resumo?.cancelados ?? 0}</span>
              </p>

              <button
                onClick={gerarPdfMeusPedidos}
                className="w-full bg-slate-800 hover:bg-slate-900 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <FileDown className="w-4 h-4" /> Relatório PDF dos Meus Pedidos
              </button>
            </div>
          </div>

          {/* ===== MONITORAMENTO DA FILA ===== */}
          <div className="lg:col-span-2">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 min-h-full">
              <div className="flex items-center justify-between mb-6 border-b pb-4">
                <div className="flex items-center gap-2">
                  <Activity className="text-green-600 w-5 h-5" />
                  <h2 className="text-lg font-bold text-slate-800">Fila {NOME_FILA[filaAtiva]} — Ativa</h2>
                </div>
                <span className="bg-slate-100 text-slate-600 text-xs font-bold px-3 py-1 rounded-full border border-slate-200">
                  {cotasAtivas.length} médico(s)
                </span>
              </div>

              {cotasAtivas.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <p>Nenhum médico com cota ativa na fila {NOME_FILA[filaAtiva]}.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-slate-600 text-sm border-b">
                        <th className="p-3 font-semibold">Profissional</th>
                        <th className="p-3 font-semibold text-center">Status</th>
                        <th className="p-3 font-semibold text-center">Consumo</th>
                        <th className="p-3 font-semibold text-center">Controle</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cotasAtivas.map(cota => (
                        <tr key={cota.id} className="border-b hover:bg-slate-50 transition-colors">
                          <td className="p-3">
                            <p className="font-semibold text-slate-800">{cota.medico_nome}</p>
                            {cota.secretaria_nome && (
                              <p className="text-xs text-slate-400 mt-0.5">Aberta por: {cota.secretaria_nome}</p>
                            )}
                            {cota.observacao && <p className="text-xs text-slate-500 mt-1">{cota.observacao}</p>}
                          </td>
                          <td className="p-3 text-center">
                            {cota.fila_continua ? (
                              <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded-full text-xs font-bold">
                                CONTÍNUA
                              </span>
                            ) : (
                              <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded-full text-xs font-bold">
                                {cota.status}
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-center font-bold text-slate-800 text-lg">
                            {cota.fila_continua ? (
                              <>{cota.total_encaminhados ?? 0} <span className="text-slate-400 text-sm">/ ∞</span></>
                            ) : (
                              <>{cota.quantidade_solicitada - cota.quantidade_restante} <span className="text-slate-400 text-sm">/ {cota.quantidade_solicitada}</span></>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            {String(cota.secretaria_id) === String(user?.id) ? (
                              <button
                                onClick={() => handleCancelarCota(cota.id)}
                                className="text-red-500 hover:text-red-700 hover:bg-red-50 p-2 rounded-full transition-colors"
                                title="Remover Médico da Fila"
                              >
                                <XCircle className="w-5 h-5" />
                              </button>
                            ) : (
                              <span
                                className="inline-block p-2 text-slate-300 cursor-not-allowed"
                                title={`Somente ${cota.secretaria_nome || 'quem abriu a cota'} pode cancelá-la`}
                              >
                                <XCircle className="w-5 h-5" />
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
