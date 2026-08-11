import { useState, useEffect } from 'react';
import { api } from '../../../lib/axios';
import { useAuthStore } from '../../../app/store/authStore';
import { useModalStore } from '../../../app/store/modalStore';
import { LogOut, UserPlus, ClipboardList, Activity, XCircle, Search } from 'lucide-react';

export default function SecretariaDashboard() {
  const { user, logout } = useAuthStore();
  const mostrarModal = useModalStore((state) => state.mostrarModal);
  const mostrarConfirmacao = useModalStore((state) => state.mostrarConfirmacao);
  
  const [medicos, setMedicos] = useState<any[]>([]);
  const [cotasAtivas, setCotasAtivas] = useState<any[]>([]);
  
  // Novos estados para a Busca Inteligente de Médicos
  const [medicoSelecionado, setMedicoSelecionado] = useState('');
  const [buscaMedico, setBuscaMedico] = useState('');
  const [mostrarDropdown, setMostrarDropdown] = useState(false);
  
  // Alterado para aceitar string ou number e não travar a digitação
  const [quantidade, setQuantidade] = useState<number | string>(1);
  const [filaContinua, setFilaContinua] = useState(false);
  const [observacao, setObservacao] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    carregarDados();

    // Fila em "tempo real": mesma cadência do painel do PA (5s, só com a aba visível).
    // Apenas as cotas são repuxadas — o catálogo de médicos (Oracle) fica no carregamento inicial.
    const soVisivel = () => {
      if (document.visibilityState === 'visible') carregarCotas();
    };
    const intervalo = setInterval(soVisivel, 5000);
    document.addEventListener('visibilitychange', soVisivel);
    return () => {
      clearInterval(intervalo);
      document.removeEventListener('visibilitychange', soVisivel);
    };
  }, []);

  const carregarDados = async () => {
    try {
      const [resMedicos, resCotas] = await Promise.all([
        api.get('/medicos'),
        api.get('/secretaria/cotas-ativas')
      ]);
      setMedicos(resMedicos.data);
      setCotasAtivas(resCotas.data);
    } catch (error) {
      console.error("Erro na leitura de dados operacionais", error);
    }
  };

  const carregarCotas = async () => {
    try {
      const resCotas = await api.get('/secretaria/cotas-ativas');
      setCotasAtivas(resCotas.data);
    } catch (error) {
      console.error("Erro ao atualizar a fila de cotas", error);
    }
  };

  const handleAbrirCota = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!medicoSelecionado) {
      return mostrarModal('aviso', 'Selecione o Médico', 'Pesquise e clique sobre o nome do médico na lista antes de confirmar.');
    }
    
    const medicoCompleto = medicos.find(m => String(m.id) === String(medicoSelecionado));

    // Impede abrir cota duplicada para um médico que já está na fila
    const jaTemCota = cotasAtivas.some(c => String(c.medico_id) === String(medicoSelecionado));
    if (jaTemCota) {
      return mostrarModal('aviso', 'Médico Já na Fila', 'Este médico já possui uma cota ativa. Cancele a cota atual antes de abrir uma nova.');
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
        observacao: observacao
      });

      // Limpa tudo após o sucesso
      setMedicoSelecionado('');
      setBuscaMedico('');
      setQuantidade(1);
      setFilaContinua(false);
      setObservacao('');
      carregarDados();
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
      'Tem certeza que deseja cancelar esta cota e remover o médico da fila do PA?',
      async () => {
        try {
          await api.put(`/secretaria/cota/${id}/cancelar`);
          carregarDados();
        } catch (error: any) {
          mostrarModal('erro', 'Falha no Cancelamento', error.response?.data?.erro || 'Não foi possível cancelar a cota.');
        }
      }
    );
  };

  // Filtra a lista de médicos conforme você digita (pelo Nome ou CRM).
  // Com um médico já selecionado, o campo contém "NOME (CRM: ...)" — texto que não casaria
  // com o filtro. Nesse caso mostramos a lista completa (com o selecionado em destaque).
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

      <main className="flex-1 p-4 md:p-8 grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8 max-w-7xl mx-auto w-full">
        
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <div className="flex items-center gap-2 mb-6 border-b pb-4">
              <UserPlus className="text-blue-600 w-5 h-5" />
              <h2 className="text-lg font-bold text-slate-800">Injetar Nova Cota</h2>
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
                      setMedicoSelecionado(''); // Se voltar a digitar, limpa a seleção
                    }}
                    onFocus={() => setMostrarDropdown(true)}
                    // Usamos um pequeno atraso no blur para dar tempo do usuário clicar na lista
                    onBlur={() => setTimeout(() => setMostrarDropdown(false), 200)}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 outline-none bg-white pr-10"
                    placeholder="Digite o nome do médico..."
                    required={!medicoSelecionado}
                  />
                  <Search className="w-5 h-5 text-slate-400 absolute right-3 top-2.5" />
                </div>

                {/* Lista Suspensa (Dropdown) */}
                {mostrarDropdown && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                    {medicosFiltrados.length === 0 ? (
                      <div className="p-4 text-sm text-center text-slate-500">Nenhum médico encontrado.</div>
                    ) : (
                      medicosFiltrados.map(medico => (
                        <div
                          key={medico.id}
                          // onMouseDown dispara antes do onBlur do input, garantindo que o clique funcione
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

              {/* COTA CONTÍNUA: médico fica sempre na fila, sem limite de vagas */}
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
                    O médico permanece no rodízio sem limite de vagas até esta cota ser cancelada. Ideal para plantões dedicados (ex: noite inteira em Contagem).
                  </span>
                </label>
              </div>

              {/* CAMPO DE VOLUME (oculto quando a cota é contínua) */}
              {!filaContinua && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Volume Solicitado (Unimed)</label>
                  <input
                    type="number"
                    min="1"
                    value={quantidade}
                    onChange={(e) => setQuantidade(e.target.value)} // Não força o tipo aqui
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
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg transition-colors mt-2"
              >
                {loading ? 'Processando...' : 'Confirmar Abertura de Cota'}
              </button>
            </form>
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 min-h-full">
            <div className="flex items-center justify-between mb-6 border-b pb-4">
              <div className="flex items-center gap-2">
                <Activity className="text-green-600 w-5 h-5" />
                <h2 className="text-lg font-bold text-slate-800">Monitoramento da Fila Ativa</h2>
              </div>
              <button onClick={carregarDados} className="text-sm text-blue-600 hover:underline">Sincronizar</button>
            </div>

            {cotasAtivas.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <p>Nenhum médico com cota ativa no momento.</p>
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

      </main>
    </div>
  );
}