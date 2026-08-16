import { useState, useEffect } from 'react';
import { api } from '../../../lib/axios';
import { useAuthStore } from '../../../app/store/authStore';
import { useModalStore } from '../../../app/store/modalStore';
import PassagemPlantao from '../../../components/PassagemPlantao';
import { obterDadosRelatorio } from '../../../lib/relatorioPlantao';
import {
  LogOut, Users, ArrowRightCircle, AlertTriangle, Stethoscope, Search,
  ChevronDown, ChevronUp, ClipboardCheck,
  Activity, Hourglass, UserCheck, Timer
} from 'lucide-react';

type Fila = 'CONTAGEM' | 'CONTAGEM_3';
type Visao = Fila | 'PLANTAO';

const NOME_FILA: Record<Fila, string> = {
  CONTAGEM: 'Contagem',
  CONTAGEM_3: 'Contagem 3',
};

// ==========================================
// 1. MOTOR DE CLASSIFICAÇÃO OTORRINO (TAXONOMIA)
// ==========================================
function categorizarQueixas(queixas: string[]) {
  const categorias: Record<string, string[]> = {
    'Ouvido': [],
    'Nariz': [],
    'Garganta': [],
    'Outros': []
  };

  queixas.forEach(q => {
    const lower = q.toLowerCase();
    // Dicionário léxico clínico
    if (lower.match(/(ouvid|orelh|tontur|zumbid|surd|otite|desequilíbrio|labirint|audi|cerum|vertigem)/)) {
      categorias['Ouvido'].push(q);
    } else if (lower.match(/(nariz|nasal|rinit|sinusit|coriza|apneia|ronco|olfat|sangrament|epistaxe|sept|adenoide)/)) {
      categorias['Nariz'].push(q);
    } else if (lower.match(/(gargant|voz|rouquid|disfonia|amigdal|deglut|engasg|faring|laring|toss|pigarr|corda)/)) {
      categorias['Garganta'].push(q);
    } else {
      categorias['Outros'].push(q);
    }
  });

  return categorias;
}

// ==========================================
// 2. COMPONENTE DE VISUALIZAÇÃO EXPANSÍVEL
// ==========================================
const QueixasViewer = ({ queixas }: { queixas: string[] }) => {
  const [categoriaAtiva, setCategoriaAtiva] = useState<string | null>(null);

  if (!queixas || queixas.length === 0) return null;

  const categorias = categorizarQueixas(queixas);

  return (
    <div className="mt-2.5 w-full">
      <div className="flex flex-wrap gap-1.5">
        {Object.entries(categorias).map(([nome, itens]) => {
          if (itens.length === 0) return null;
          const isAtiva = categoriaAtiva === nome;

          return (
            <button
              key={nome}
              onClick={() => setCategoriaAtiva(isAtiva ? null : nome)}
              className={`text-[11px] px-2.5 py-1 rounded-md font-semibold flex items-center gap-1.5 transition-all ${
                isAtiva
                  ? 'bg-slate-800 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200'
              }`}
            >
              {nome}
              <span className={`px-1.5 rounded-full text-[10px] font-bold ${isAtiva ? 'bg-white/20' : 'bg-white text-slate-500'}`}>
                {itens.length}
              </span>
              {isAtiva ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          );
        })}
      </div>

      {categoriaAtiva && categorias[categoriaAtiva].length > 0 && (
        <div className="mt-2 p-2.5 bg-slate-50 border border-slate-200 rounded-lg flex flex-wrap gap-1.5">
          {categorias[categoriaAtiva].map((q, idx) => (
            <span
              key={idx}
              className="bg-white text-slate-600 border border-slate-200 text-[11px] px-2 py-0.5 rounded font-medium"
            >
              {q}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

// ==========================================
// 3. PAINEL PRINCIPAL (PA DASHBOARD)
// ==========================================
export default function PADashboard() {
  const { user, logout } = useAuthStore();
  const mostrarModal = useModalStore((state) => state.mostrarModal);

  const [fila, setFila] = useState<any[]>([]);
  const [medicosCatalogo, setMedicosCatalogo] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Indicadores do dia (medianas) e navegação Contagem / Contagem 3 / Plantão
  const [indicadores, setIndicadores] = useState<any>(null);
  const [visao, setVisao] = useState<Visao>('CONTAGEM');

  // Estados dos formulários
  const [identificadorPaciente, setIdentificadorPaciente] = useState('');
  const [modoExcecao, setModoExcecao] = useState(false);
  const [cotaExcecaoId, setCotaExcecaoId] = useState('');
  const [justificativa, setJustificativa] = useState('');

  // Estados da busca inteligente
  const [buscaMedico, setBuscaMedico] = useState('');
  const [mostrarDropdown, setMostrarDropdown] = useState(false);

  // A fila em operação (na aba Plantão mantém a última selecionada)
  const filaOperacao: Fila = visao === 'PLANTAO' ? 'CONTAGEM' : visao;

  // Catálogo + indicadores: uma vez no mount, com polling leve dos indicadores
  useEffect(() => {
    carregarMedicosCatalogo();
    carregarIndicadores();

    const soVisivel = (fn: () => void) => () => {
      if (document.visibilityState === 'visible') fn();
    };
    const intervaloInd = setInterval(soVisivel(carregarIndicadores), 60000);

    const aoVoltar = () => {
      if (document.visibilityState === 'visible') carregarIndicadores();
    };
    document.addEventListener('visibilitychange', aoVoltar);

    return () => {
      clearInterval(intervaloInd);
      document.removeEventListener('visibilitychange', aoVoltar);
    };
  }, []);

  // Fila da aba selecionada: recarrega ao trocar de aba + polling 5s (aba visível)
  useEffect(() => {
    if (visao === 'PLANTAO') return;
    const filaSel = visao;

    // Limpa o formulário de exceção ao trocar de fila (a cota é de outra fila)
    setModoExcecao(false);
    setCotaExcecaoId('');
    setBuscaMedico('');
    setJustificativa('');

    carregarFila(filaSel);
    const soVisivel = () => {
      if (document.visibilityState === 'visible') carregarFila(filaSel);
    };
    const intervalo = setInterval(soVisivel, 5000);
    document.addEventListener('visibilitychange', soVisivel);
    return () => {
      clearInterval(intervalo);
      document.removeEventListener('visibilitychange', soVisivel);
    };
  }, [visao]);

  const carregarIndicadores = async () => {
    try {
      const response = await api.get('/pa/indicadores');
      setIndicadores(response.data);
    } catch (error) {
      console.error("Erro ao carregar indicadores do PA:", error);
    }
  };

  const carregarMedicosCatalogo = async () => {
    try {
      const response = await api.get('/medicos');
      setMedicosCatalogo(response.data);
    } catch (error) {
      console.error("Erro ao carregar catálogo de médicos:", error);
    }
  };

  const carregarFila = async (filaSel: Fila) => {
    try {
      const response = await api.get(`/secretaria/cotas-ativas?fila=${filaSel}`);
      const filaAtiva = response.data.filter((c: any) => c.status === 'ABERTO' && (c.fila_continua || c.quantidade_restante > 0));
      setFila(filaAtiva);
    } catch (error) {
      console.error("Erro ao carregar a fila:", error);
    }
  };

  const handleEncaminharNormal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identificadorPaciente.trim()) return;

    setLoading(true);
    try {
      const response = await api.post('/pa/encaminhar', {
        paciente_identificador: identificadorPaciente,
        fila: filaOperacao
      });

      mostrarModal('sucesso', 'Paciente Encaminhado', `Dr(a). ${response.data.medico_nome || 'Médico do Rodízio'}`);
      setIdentificadorPaciente('');
      carregarFila(filaOperacao);
    } catch (error: any) {
      mostrarModal('erro', 'Falha no Encaminhamento', error.response?.data?.erro || 'Erro ao encaminhar paciente. A fila pode estar vazia.');
    } finally {
      setLoading(false);
    }
  };

  const handleEncaminharExcecao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cotaExcecaoId) {
      return mostrarModal('aviso', 'Selecione o Médico', 'Escolha o médico de destino para a exceção na lista suspensa.');
    }

    setLoading(true);
    try {
      await api.post('/pa/excecao', {
        pedido_cota_id: cotaExcecaoId,
        paciente_identificador: identificadorPaciente,
        justificativa: justificativa
      });

      mostrarModal('sucesso', 'Exceção Registrada', 'Paciente encaminhado. O médico foi movido para o final do rodízio.');
      setIdentificadorPaciente('');
      setCotaExcecaoId('');
      setBuscaMedico('');
      setJustificativa('');
      setModoExcecao(false);
      carregarFila(filaOperacao);
    } catch (error: any) {
      mostrarModal('erro', 'Falha na Exceção', error.response?.data?.erro || 'Erro ao registar exceção.');
    } finally {
      setLoading(false);
    }
  };

  // Integração de Queixas na Fila
  const filaEnriquecida = fila.map(cota => {
    const medicoInfo = medicosCatalogo.find(m => String(m.id) === String(cota.medico_id) || m.nome === cota.medico_nome);
    return {
      ...cota,
      queixas: medicoInfo?.queixas || []
    };
  });

  // Com um médico já selecionado, o campo contém "Dr(a). NOME" — texto que não casaria
  // com o filtro. Nesse caso mostramos a fila completa (com o selecionado em destaque).
  const filaFiltradaExcecao = cotaExcecaoId
    ? filaEnriquecida
    : filaEnriquecida.filter(c =>
        c.medico_nome.toLowerCase().includes(buscaMedico.toLowerCase()) ||
        (c.queixas && c.queixas.some((q: string) => q.toLowerCase().includes(buscaMedico.toLowerCase())))
      );

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans text-slate-900">

      {/* ===== HEADER ===== */}
      <header className="bg-white border-b border-slate-200 px-6 py-3.5 flex justify-between items-center sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <div className="bg-slate-800 p-2 rounded-lg">
            <Users className="text-white w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-800 leading-tight">Pronto Atendimento</h1>
            <p className="text-xs text-slate-500">Distribuição de senhas e rodízio médico</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2.5 pr-3 border-r border-slate-200">
            <Avatar nome={user?.nome || 'PA'} />
            <div className="leading-tight">
              <p className="text-sm font-semibold text-slate-700">{user?.nome}</p>
              <p className="text-xs text-slate-400">{user?.usuario}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
            title="Encerrar Sessão"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="flex-1 p-4 md:p-6 max-w-[1500px] mx-auto w-full space-y-6">

        {/* ===== INDICADORES DO DIA ===== */}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3 md:gap-4">
          <MiniIndicador titulo="Atendimentos Hoje" valor={indicadores?.totalAtendimentos} unidade="" icone={<Activity className="w-4 h-4" />} />
          <MiniIndicador titulo="Espera Recepção" valor={indicadores?.tempos?.esperaRecepcao} unidade="min" icone={<Hourglass className="w-4 h-4" />} />
          <MiniIndicador titulo="Tempo Cadastro" valor={indicadores?.tempos?.cadastro} unidade="min" icone={<UserCheck className="w-4 h-4" />} />
          <MiniIndicador titulo="Espera Médica" valor={indicadores?.tempos?.esperaMedica} unidade="min" icone={<Timer className="w-4 h-4" />} />
          <MiniIndicador titulo="Permanência Total" valor={indicadores?.tempos?.permanenciaTotal} unidade="min" icone={<Timer className="w-4 h-4" />} />
        </div>

        {/* ===== NAVEGAÇÃO ===== */}
        <div className="inline-flex flex-wrap bg-slate-200/70 p-1 rounded-xl gap-1">
          <TabButton
            ativa={visao === 'CONTAGEM'}
            onClick={() => setVisao('CONTAGEM')}
            icone={<ArrowRightCircle className="w-4 h-4" />}
            label="Contagem"
          />
          <TabButton
            ativa={visao === 'CONTAGEM_3'}
            onClick={() => setVisao('CONTAGEM_3')}
            icone={<ArrowRightCircle className="w-4 h-4" />}
            label="Contagem 3"
          />
          <TabButton
            ativa={visao === 'PLANTAO'}
            onClick={() => setVisao('PLANTAO')}
            icone={<ClipboardCheck className="w-4 h-4" />}
            label="Passagem de Plantão"
          />
        </div>

        {visao !== 'PLANTAO' ? (
          /* ===== VISÃO: DESPACHO (Contagem / Contagem 3) ===== */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

            {/* Painel de Despacho */}
            <section className="lg:col-span-4 bg-white rounded-xl border border-slate-200 shadow-sm">
              <CardHeader icone={<ArrowRightCircle className="w-4 h-4" />} titulo={`Despacho — ${NOME_FILA[filaOperacao]}`} />
              <div className="p-5">

                <div className="flex p-1 bg-slate-100 rounded-lg mb-5 border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setModoExcecao(false)}
                    className={`flex-1 py-2 text-sm font-semibold rounded-md transition-all ${!modoExcecao ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    Rodízio Padrão
                  </button>
                  <button
                    type="button"
                    onClick={() => setModoExcecao(true)}
                    className={`flex-1 py-2 text-sm font-semibold rounded-md transition-all ${modoExcecao ? 'bg-white shadow-sm text-amber-600' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    Exceção
                  </button>
                </div>

                {!modoExcecao ? (
                  <form onSubmit={handleEncaminharNormal} className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1.5">Identificação do Paciente</label>
                      <input
                        type="text"
                        value={identificadorPaciente}
                        onChange={(e) => setIdentificadorPaciente(e.target.value)}
                        className="w-full px-4 py-3 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-800 focus:border-transparent outline-none font-medium transition-all"
                        placeholder="Nome, Código MV ou Senha..."
                        required
                        autoFocus
                      />
                      <p className="text-xs text-slate-400 mt-2">
                        Alocação automática ao médico que aguarda há mais tempo na fila {NOME_FILA[filaOperacao]}.
                      </p>
                    </div>

                    <button
                      type="submit"
                      disabled={loading || filaEnriquecida.length === 0}
                      className="w-full bg-slate-800 hover:bg-slate-900 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-semibold py-3.5 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                      {loading ? 'Processando...' : 'Encaminhar Próximo Paciente'}
                      <ArrowRightCircle className="w-4 h-4" />
                    </button>
                    {filaEnriquecida.length === 0 && (
                      <p className="text-red-500 text-xs text-center font-semibold">Fila {NOME_FILA[filaOperacao]} vazia. Aguarde a inserção de cotas.</p>
                    )}
                  </form>
                ) : (
                  <form onSubmit={handleEncaminharExcecao} className="space-y-4">
                    <div className="bg-amber-50 text-amber-800 p-3 rounded-lg border border-amber-200 text-xs flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                      <p><strong>Auditoria:</strong> envios por exceção consomem a vaga e movem o médico para o final do rodízio.</p>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1.5">Identificação do Paciente</label>
                      <input
                        type="text"
                        value={identificadorPaciente}
                        onChange={(e) => setIdentificadorPaciente(e.target.value)}
                        className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none font-medium transition-all"
                        placeholder="Nome, Código MV ou Senha..."
                        required
                      />
                    </div>

                    <div className="relative">
                      <label className="block text-xs font-semibold text-slate-500 mb-1.5">Médico Destino (Ativo)</label>
                      <div className="relative">
                        <input
                          type="text"
                          value={buscaMedico}
                          onChange={(e) => {
                            setBuscaMedico(e.target.value);
                            setMostrarDropdown(true);
                            setCotaExcecaoId('');
                          }}
                          onFocus={() => setMostrarDropdown(true)}
                          onBlur={() => setTimeout(() => setMostrarDropdown(false), 200)}
                          className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none bg-white pr-10 text-sm font-medium transition-all"
                          placeholder="Pesquise por nome ou queixa..."
                          required={!cotaExcecaoId}
                        />
                        <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
                      </div>

                      {mostrarDropdown && (
                        <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                          {filaFiltradaExcecao.length === 0 ? (
                            <div className="p-4 text-sm text-center text-slate-500">Nenhuma correlação encontrada.</div>
                          ) : (
                            filaFiltradaExcecao.map(cota => (
                              <div
                                key={cota.id}
                                onMouseDown={() => {
                                  setCotaExcecaoId(cota.id);
                                  setBuscaMedico(`Dr(a). ${cota.medico_nome}`);
                                  setMostrarDropdown(false);
                                }}
                                className={`p-3 cursor-pointer border-b border-slate-100 last:border-0 hover:bg-amber-50 transition-colors ${
                                  cotaExcecaoId === cota.id ? 'bg-amber-100 font-semibold text-amber-800' : 'text-slate-700'
                                }`}
                              >
                                <p className="font-semibold text-sm">Dr(a). {cota.medico_nome}</p>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1.5">Justificativa Operacional</label>
                      <textarea
                        value={justificativa}
                        onChange={(e) => setJustificativa(e.target.value)}
                        className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none resize-none h-20 text-sm transition-all"
                        placeholder="Motivo clínico ou estrutural..."
                        required
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full bg-amber-500 hover:bg-amber-600 disabled:bg-slate-300 text-white font-semibold py-3 px-4 rounded-lg transition-colors text-sm"
                    >
                      {loading ? 'Processando...' : 'Confirmar Exceção'}
                    </button>
                  </form>
                )}
              </div>
            </section>

            {/* Fila de Rodízio */}
            <section className="lg:col-span-8 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center">
                    <Stethoscope className="w-4 h-4" />
                  </div>
                  <h2 className="text-sm font-semibold text-slate-800">Cadeia de Alocação — {NOME_FILA[filaOperacao]}</h2>
                </div>
                <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
                  {filaEnriquecida.length} médico(s) na fila
                </span>
              </div>

              <div className="p-5">
                {filaEnriquecida.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                    <Users className="w-12 h-12 mb-3 opacity-20" />
                    <p className="text-sm font-semibold text-slate-500">Sem médicos ativos na fila {NOME_FILA[filaOperacao]}</p>
                    <p className="text-xs">Aguardando a inserção de cotas pela secretaria.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filaEnriquecida.map((cota, index) => (
                      <div
                        key={cota.id}
                        className={`p-4 rounded-xl border transition-all ${
                          index === 0
                            ? 'border-slate-800 bg-slate-50/80 shadow-sm'
                            : 'border-slate-200 bg-white'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-3 min-w-0 flex-1">
                            <div className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-sm shrink-0 mt-0.5 ${
                              index === 0 ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-400'
                            }`}>
                              {index + 1}º
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className={`font-semibold truncate ${index === 0 ? 'text-slate-900' : 'text-slate-700'}`}>
                                  {cota.medico_nome}
                                </h3>
                                {index === 0 && (
                                  <span className="bg-slate-800 text-white text-[10px] font-bold uppercase px-2 py-0.5 rounded-full shrink-0">
                                    Próximo
                                  </span>
                                )}
                                {cota.fila_continua && (
                                  <span className="bg-purple-50 text-purple-700 border border-purple-200 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full shrink-0">
                                    Contínua
                                  </span>
                                )}
                              </div>

                              <QueixasViewer queixas={cota.queixas} />

                              {cota.observacao && (
                                <p className="text-xs text-slate-500 mt-2.5 flex items-center gap-1.5 bg-slate-100 px-2.5 py-1.5 rounded-md w-fit border border-slate-200">
                                  <AlertTriangle className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                  {cota.observacao}
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="text-center shrink-0">
                            <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wide mb-1">Vagas</p>
                            <div className={`w-11 h-11 rounded-full flex items-center justify-center font-bold text-lg border-[3px] ${
                              index === 0 ? 'border-slate-800 text-slate-800' : 'border-slate-200 text-slate-500'
                            }`}>
                              {cota.fila_continua ? '∞' : cota.quantidade_restante}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </div>

        ) : (

          /* ===== VISÃO: PASSAGEM DE PLANTÃO ===== */
          <div className="max-w-2xl">
            <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <CardHeader icone={<ClipboardCheck className="w-4 h-4" />} titulo="Passagem de Plantão da Recepção" />
              <div className="p-5">
                <PassagemPlantao
                  cor="slate"
                  obterDados={() => obterDadosRelatorio()}
                />
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

// ================= COMPONENTES AUXILIARES =================

function TabButton({ ativa, onClick, icone, label, badge }: any) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-semibold rounded-lg flex items-center gap-2 transition-all ${
        ativa ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
      }`}
    >
      {icone} {label}
      {badge !== undefined && (
        <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${ativa ? 'bg-slate-800 text-white' : 'bg-slate-300/70 text-slate-600'}`}>
          {badge}
        </span>
      )}
    </button>
  );
}

function CardHeader({ icone, titulo }: any) {
  return (
    <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2.5">
      <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center">
        {icone}
      </div>
      <h2 className="text-sm font-semibold text-slate-800">{titulo}</h2>
    </div>
  );
}

function Avatar({ nome }: { nome: string }) {
  const iniciais = nome
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(p => p[0])
    .filter((_, i, arr) => i === 0 || i === arr.length - 1)
    .join('')
    .toUpperCase();

  return (
    <div className="w-9 h-9 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-xs font-bold text-slate-600 shrink-0">
      {iniciais || '?'}
    </div>
  );
}

// Card compacto de indicador (medianas do dia vindas do MV)
function MiniIndicador({ titulo, valor, unidade, icone }: any) {
  return (
    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center shrink-0">
          {icone}
        </div>
        <p className="text-xs font-semibold text-slate-500 truncate">{titulo}</p>
      </div>
      <p className="text-2xl font-bold text-slate-800">
        {valor ?? '—'}
        {unidade && <span className="text-sm font-medium text-slate-400 ml-1">{unidade}</span>}
      </p>
    </div>
  );
}
