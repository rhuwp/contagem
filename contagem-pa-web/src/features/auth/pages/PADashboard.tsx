import { useState, useEffect } from 'react';
import { api } from '../../../lib/axios';
import { useAuthStore } from '../../../app/store/authStore';
import { useModalStore } from '../../../app/store/modalStore';
import PassagemPlantao from '../../../components/PassagemPlantao';
import { obterDadosRelatorio } from '../../../lib/relatorioPlantao';
import {
  LogOut, Users, ArrowRightCircle, AlertTriangle, Stethoscope, Search,
  ChevronDown, ChevronUp, ClipboardCheck, UserPlus, Trash2,
  Activity, Hourglass, UserCheck, Timer
} from 'lucide-react';

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
      {/* Botões Agrupadores */}
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

      {/* Painel de Expansão (Detalhes) */}
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
  const mostrarConfirmacao = useModalStore((state) => state.mostrarConfirmacao);

  const [fila, setFila] = useState<any[]>([]);
  const [medicosCatalogo, setMedicosCatalogo] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Indicadores do dia (medianas) e navegação Despacho / Fila / Plantão
  const [indicadores, setIndicadores] = useState<any>(null);
  const [visao, setVisao] = useState<'despacho' | 'fila' | 'plantao'>('despacho');

  // Fila da Recepção (sem cotas, montada manualmente)
  const [filaRecepcao, setFilaRecepcao] = useState<any[]>([]);
  const [buscaFilaRecep, setBuscaFilaRecep] = useState('');
  const [mostrarDropdownRecep, setMostrarDropdownRecep] = useState(false);

  // Estados dos formulários
  const [identificadorPaciente, setIdentificadorPaciente] = useState('');
  const [modoExcecao, setModoExcecao] = useState(false);
  const [cotaExcecaoId, setCotaExcecaoId] = useState('');
  const [justificativa, setJustificativa] = useState('');

  // Estados da busca inteligente
  const [buscaMedico, setBuscaMedico] = useState('');
  const [mostrarDropdown, setMostrarDropdown] = useState(false);

  useEffect(() => {
    carregarMedicosCatalogo();
    carregarFila();
    carregarIndicadores();
    carregarFilaRecepcao();

    // Polling só com a aba VISÍVEL: aba esquecida em segundo plano não gera requests
    const soVisivel = (fn: () => void) => () => {
      if (document.visibilityState === 'visible') fn();
    };
    const intervalo = setInterval(soVisivel(carregarFila), 5000);
    const intervaloInd = setInterval(soVisivel(carregarIndicadores), 60000);
    const intervaloRecep = setInterval(soVisivel(carregarFilaRecepcao), 15000);

    // Ao voltar para a aba, atualiza tudo imediatamente
    const aoVoltar = () => {
      if (document.visibilityState === 'visible') {
        carregarFila();
        carregarIndicadores();
        carregarFilaRecepcao();
      }
    };
    document.addEventListener('visibilitychange', aoVoltar);

    return () => {
      clearInterval(intervalo);
      clearInterval(intervaloInd);
      clearInterval(intervaloRecep);
      document.removeEventListener('visibilitychange', aoVoltar);
    };
  }, []);

  const carregarIndicadores = async () => {
    try {
      const response = await api.get('/pa/indicadores');
      setIndicadores(response.data);
    } catch (error) {
      console.error("Erro ao carregar indicadores do PA:", error);
    }
  };

  const carregarFilaRecepcao = async () => {
    try {
      const response = await api.get('/pa/fila-recepcao');
      setFilaRecepcao(response.data);
    } catch (error) {
      console.error("Erro ao carregar a fila da recepção:", error);
    }
  };

  const handleAdicionarFilaRecep = async (medico: any) => {
    try {
      await api.post('/pa/fila-recepcao', {
        medico_id: medico.id,
        medico_nome: medico.nome,
        medico_crm: medico.crm
      });
      setBuscaFilaRecep('');
      setMostrarDropdownRecep(false);
      carregarFilaRecepcao();
    } catch (error: any) {
      mostrarModal('erro', 'Falha ao Adicionar', error.response?.data?.erro || 'Não foi possível adicionar o médico à fila.');
    }
  };

  const handleEncaminharRecep = async (id: number, desfazer = false) => {
    try {
      await api.put(`/pa/fila-recepcao/${id}/encaminhar`, { desfazer });
      carregarFilaRecepcao();
    } catch (error: any) {
      mostrarModal('erro', 'Falha ao Atualizar', error.response?.data?.erro || 'Não foi possível atualizar o contador.');
    }
  };

  const handleRemoverFilaRecep = (id: number, nome: string) => {
    mostrarConfirmacao(
      'Remover da Fila',
      `Remover ${nome} da fila da recepção?`,
      async () => {
        try {
          await api.delete(`/pa/fila-recepcao/${id}`);
          carregarFilaRecepcao();
        } catch (error: any) {
          mostrarModal('erro', 'Falha ao Remover', error.response?.data?.erro || 'Não foi possível remover o médico da fila.');
        }
      }
    );
  };

  const carregarMedicosCatalogo = async () => {
    try {
      const response = await api.get('/medicos');
      setMedicosCatalogo(response.data);
    } catch (error) {
      console.error("Erro ao carregar catálogo de médicos:", error);
    }
  };

  const carregarFila = async () => {
    try {
      const response = await api.get('/secretaria/cotas-ativas');
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
        paciente_identificador: identificadorPaciente
      });

      mostrarModal('sucesso', 'Paciente Encaminhado', `Dr(a). ${response.data.medico_nome || 'Médico do Rodízio'}`);
      setIdentificadorPaciente('');
      carregarFila();
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
      carregarFila();
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

  // Fila da Recepção: médicos do catálogo que casam com a busca e ainda não estão na fila
  const medicosDisponiveisRecep = medicosCatalogo.filter(m =>
    m.nome.toLowerCase().includes(buscaFilaRecep.toLowerCase()) &&
    !filaRecepcao.some(f => String(f.medico_id) === String(m.id))
  );

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
            ativa={visao === 'despacho'}
            onClick={() => setVisao('despacho')}
            icone={<ArrowRightCircle className="w-4 h-4" />}
            label="Despacho"
          />
          <TabButton
            ativa={visao === 'fila'}
            onClick={() => setVisao('fila')}
            icone={<Users className="w-4 h-4" />}
            label="Fila da Recepção"
            badge={filaRecepcao.length || undefined}
          />
          <TabButton
            ativa={visao === 'plantao'}
            onClick={() => setVisao('plantao')}
            icone={<ClipboardCheck className="w-4 h-4" />}
            label="Passagem de Plantão"
          />
        </div>

        {/* ===== VISÃO: DESPACHO ===== */}
        {visao === 'despacho' ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

            {/* Painel de Despacho */}
            {/* sem overflow-hidden: os dropdowns de busca precisam flutuar sobre o card */}
            <section className="lg:col-span-4 bg-white rounded-xl border border-slate-200 shadow-sm">
              <CardHeader icone={<ArrowRightCircle className="w-4 h-4" />} titulo="Painel de Despacho" />
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
                        Alocação automática ao médico que aguarda há mais tempo.
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
                      <p className="text-red-500 text-xs text-center font-semibold">Fila operacional vazia.</p>
                    )}
                  </form>
                ) : (
                  <form onSubmit={handleEncaminharExcecao} className="space-y-4">
                    <div className="bg-amber-50 text-amber-800 p-3 rounded-lg border border-amber-200 text-xs flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                      <p><strong>Auditoria:</strong> envios por exceção movem o médico selecionado para o final do rodízio.</p>
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
                  <h2 className="text-sm font-semibold text-slate-800">Cadeia de Alocação</h2>
                </div>
                <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
                  {filaEnriquecida.length} médico(s) na fila
                </span>
              </div>

              <div className="p-5">
                {filaEnriquecida.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                    <Users className="w-12 h-12 mb-3 opacity-20" />
                    <p className="text-sm font-semibold text-slate-500">Sem médicos ativos na fila</p>
                    <p className="text-xs">Aguardando a inserção pela secretaria.</p>
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

        ) : visao === 'fila' ? (

          /* ===== VISÃO: FILA DA RECEPÇÃO ===== */
          <div className="max-w-3xl space-y-6">
            {/* sem overflow-hidden: o dropdown de busca precisa flutuar sobre o card */}
            <section className="bg-white rounded-xl border border-slate-200 shadow-sm">
              <CardHeader icone={<UserPlus className="w-4 h-4" />} titulo="Adicionar Médico à Fila da Recepção" />
              <div className="p-5">
                <p className="text-xs text-slate-500 mb-3">
                  Fila montada pela recepção. Pesquise pelo nome e clique no médico para adicioná-lo.
                </p>
                <div className="relative">
                  <input
                    type="text"
                    value={buscaFilaRecep}
                    onChange={(e) => { setBuscaFilaRecep(e.target.value); setMostrarDropdownRecep(true); }}
                    onFocus={() => setMostrarDropdownRecep(true)}
                    onBlur={() => setTimeout(() => setMostrarDropdownRecep(false), 200)}
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-800 focus:border-transparent outline-none bg-white pr-10 font-medium transition-all"
                    placeholder="Digite o nome do médico..."
                  />
                  <Search className="w-5 h-5 text-slate-400 absolute right-3 top-3.5" />

                  {mostrarDropdownRecep && buscaFilaRecep.trim() !== '' && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                      {medicosDisponiveisRecep.length === 0 ? (
                        <div className="p-4 text-sm text-center text-slate-500">Nenhum médico disponível com esse nome.</div>
                      ) : (
                        medicosDisponiveisRecep.slice(0, 30).map(medico => (
                          <div
                            key={medico.id}
                            onMouseDown={() => handleAdicionarFilaRecep(medico)}
                            className="p-3 cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors"
                          >
                            <p className="font-medium text-sm text-slate-800">{medico.nome}</p>
                            {medico.crm && <p className="text-xs text-slate-500 mt-0.5">CRM: {medico.crm}</p>}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>
            </section>

            <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center">
                    <Users className="w-4 h-4" />
                  </div>
                  <h2 className="text-sm font-semibold text-slate-800">Fila da Recepção</h2>
                </div>
                <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
                  {filaRecepcao.length} médico(s)
                </span>
              </div>

              <div className="p-5">
                {filaRecepcao.length === 0 ? (
                  <div className="py-10 text-center text-slate-400 text-sm font-semibold">Nenhum médico na fila da recepção.</div>
                ) : (
                  <div className="space-y-2.5">
                    {filaRecepcao.map((item, index) => (
                      <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 p-4 border border-slate-200 rounded-xl hover:border-slate-300 transition-colors">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center font-bold text-sm shrink-0">
                            {index + 1}º
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-sm text-slate-800 truncate">{item.medico_nome}</p>
                            <p className="text-xs text-slate-400">
                              {item.medico_crm ? `CRM: ${item.medico_crm} · ` : ''}
                              Adicionado por {item.adicionado_por_nome || 'N/A'} às {new Date(item.criado_em).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              {item.ultimo_envio_em && ` · Último envio: ${new Date(item.ultimo_envio_em).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                            </p>
                          </div>
                        </div>

                        {/* Contador de pacientes encaminhados */}
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => handleEncaminharRecep(item.id, true)}
                            disabled={!item.total_encaminhados}
                            className="w-8 h-8 rounded-lg border border-slate-200 text-slate-400 hover:text-slate-600 hover:bg-slate-100 font-bold transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Desfazer último envio"
                          >
                            −
                          </button>
                          <div
                            className="w-11 h-11 rounded-full border-[3px] border-slate-800 text-slate-800 flex items-center justify-center font-bold text-lg"
                            title="Pacientes encaminhados"
                          >
                            {item.total_encaminhados ?? 0}
                          </div>
                          <button
                            onClick={() => handleEncaminharRecep(item.id)}
                            className="h-11 px-4 rounded-lg bg-slate-800 hover:bg-slate-900 text-white text-sm font-semibold flex items-center gap-1.5 transition-colors"
                            title="Somar um paciente encaminhado"
                          >
                            <ArrowRightCircle className="w-4 h-4" /> +1
                          </button>
                          <button
                            onClick={() => handleRemoverFilaRecep(item.id, item.medico_nome)}
                            className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            title="Remover da fila"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
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
