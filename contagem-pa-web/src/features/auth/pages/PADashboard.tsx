import { useState, useEffect } from 'react';
import { api } from '../../../lib/axios';
import { useAuthStore } from '../../../app/store/authStore';
import { LogOut, Users, ArrowRightCircle, AlertTriangle, Stethoscope, Search, ChevronDown, ChevronUp } from 'lucide-react';

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
    <div className="mt-3 w-full">
      {/* Botões Agrupadores */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(categorias).map(([nome, itens]) => {
          if (itens.length === 0) return null;
          const isAtiva = categoriaAtiva === nome;
          
          return (
            <button
              key={nome}
              onClick={() => setCategoriaAtiva(isAtiva ? null : nome)}
              className={`text-[10px] px-3 py-1.5 rounded-lg font-black uppercase flex items-center gap-1.5 transition-all duration-200 ${
                isAtiva 
                  ? 'bg-slate-800 text-white shadow-md' 
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200'
              }`}
            >
              {nome}
              <span className={`px-1.5 py-0.5 rounded-full text-[9px] ${isAtiva ? 'bg-slate-600' : 'bg-slate-200'}`}>
                {itens.length}
              </span>
              {isAtiva ? <ChevronUp className="w-3 h-3 ml-1" /> : <ChevronDown className="w-3 h-3 ml-1" />}
            </button>
          );
        })}
      </div>

      {/* Painel de Expansão (Detalhes) */}
      {categoriaAtiva && categorias[categoriaAtiva].length > 0 && (
        <div className="mt-2 p-3 bg-slate-50 border border-slate-200 rounded-lg flex flex-wrap gap-2 animate-in fade-in slide-in-from-top-2">
          {categorias[categoriaAtiva].map((q, idx) => (
            <span 
              key={idx} 
              className="bg-white text-slate-700 border border-slate-300 shadow-sm text-[10px] px-2 py-1 rounded font-bold uppercase tracking-wider"
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
  
  const [fila, setFila] = useState<any[]>([]);
  const [medicosCatalogo, setMedicosCatalogo] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

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
    const intervalo = setInterval(carregarFila, 5000);
    return () => clearInterval(intervalo);
  }, []);

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
      const filaAtiva = response.data.filter((c: any) => c.status === 'ABERTO' && c.quantidade_restante > 0);
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
        usuario_pa_id: user?.id,
        paciente_identificador: identificadorPaciente
      });
      
      alert(`Encaminhado com sucesso para:\nDr(a). ${response.data.medico_nome || 'Médico do Rodízio'}`);
      setIdentificadorPaciente('');
      carregarFila();
    } catch (error: any) {
      alert(error.response?.data?.erro || 'Erro ao encaminhar paciente. A fila pode estar vazia.');
    } finally {
      setLoading(false);
    }
  };

  const handleEncaminharExcecao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cotaExcecaoId) return alert('Selecione o médico de destino para a exceção na lista suspensa.');

    setLoading(true);
    try {
      await api.post('/pa/excecao', {
        usuario_pa_id: user?.id,
        pedido_cota_id: cotaExcecaoId,
        paciente_identificador: identificadorPaciente,
        justificativa: justificativa
      });
      
      alert('Paciente encaminhado por exceção com sucesso! O médico foi movido para o final do rodízio.');
      setIdentificadorPaciente('');
      setCotaExcecaoId('');
      setBuscaMedico('');
      setJustificativa('');
      setModoExcecao(false);
      carregarFila();
    } catch (error: any) {
      alert(error.response?.data?.erro || 'Erro ao registar exceção.');
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

  const filaFiltradaExcecao = filaEnriquecida.filter(c => 
    c.medico_nome.toLowerCase().includes(buscaMedico.toLowerCase()) || 
    (c.queixas && c.queixas.some((q: string) => q.toLowerCase().includes(buscaMedico.toLowerCase())))
  );

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans">
      <header className="bg-white shadow-sm px-8 py-4 flex justify-between items-center border-b-4 border-slate-800">
        <div className="flex items-center gap-3">
          <div className="bg-slate-800 p-2 rounded-lg">
            <Users className="text-white w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Pronto Atendimento (PA)</h1>
            <p className="text-sm text-slate-500">Distribuição de Senhas e Motor de Rodízio</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-sm font-semibold text-slate-800">{user?.nome}</p>
            <p className="text-xs text-slate-500 uppercase font-bold">{user?.role}</p>
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

      <main className="flex-1 p-8 grid grid-cols-1 lg:grid-cols-12 gap-8 max-w-[1600px] mx-auto w-full">
        
        {/* Painel de Despacho */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <h2 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
              <ArrowRightCircle className="text-slate-800 w-5 h-5" />
              Painel de Despacho
            </h2>

            <div className="flex p-1 bg-slate-100 rounded-lg mb-6 border border-slate-200">
              <button
                type="button"
                onClick={() => setModoExcecao(false)}
                className={`flex-1 py-2 text-sm font-bold rounded-md transition-all ${!modoExcecao ? 'bg-white shadow-sm text-slate-800 border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Rodízio Padrão
              </button>
              <button
                type="button"
                onClick={() => setModoExcecao(true)}
                className={`flex-1 py-2 text-sm font-bold rounded-md transition-all ${modoExcecao ? 'bg-white shadow-sm text-amber-600 border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Exceção (Furar Fila)
              </button>
            </div>

            {!modoExcecao ? (
              <form onSubmit={handleEncaminharNormal} className="space-y-5">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Identificação do Paciente</label>
                  <input 
                    type="text" 
                    value={identificadorPaciente}
                    onChange={(e) => setIdentificadorPaciente(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-800 outline-none text-base font-medium"
                    placeholder="Nome, Código MV ou Senha..."
                    required
                    autoFocus
                  />
                  <p className="text-xs text-slate-500 mt-2 font-medium">
                    Alocação automática ao médico que aguarda há mais tempo.
                  </p>
                </div>

                <button 
                  type="submit"
                  disabled={loading || filaEnriquecida.length === 0}
                  className="w-full bg-slate-800 hover:bg-slate-900 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold py-4 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 text-base shadow-sm"
                >
                  {loading ? 'Processando...' : 'Encaminhar Próximo Paciente'}
                  <ArrowRightCircle className="w-5 h-5" />
                </button>
                {filaEnriquecida.length === 0 && (
                  <p className="text-red-500 text-xs text-center font-bold mt-3">Fila operacional vazia. Aguarde a inserção de cotas.</p>
                )}
              </form>
            ) : (
              <form onSubmit={handleEncaminharExcecao} className="space-y-4">
                <div className="bg-amber-50 text-amber-800 p-3 rounded-lg border border-amber-200 text-xs flex items-start gap-2 mb-4">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <p><strong>Auditoria:</strong> Envios por exceção remetem o profissional médico selecionado para o final do ciclo de rodízio.</p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Identificação do Paciente</label>
                  <input 
                    type="text" 
                    value={identificadorPaciente}
                    onChange={(e) => setIdentificadorPaciente(e.target.value)}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none font-medium"
                    placeholder="Nome, Código MV ou Senha..."
                    required
                  />
                </div>

                <div className="relative">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Médico Destino (Ativo)</label>
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
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none bg-white pr-10 font-medium text-sm"
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
                            <p className="font-bold text-sm">Dr(a). {cota.medico_nome}</p>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Justificativa Operacional</label>
                  <textarea 
                    value={justificativa}
                    onChange={(e) => setJustificativa(e.target.value)}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none resize-none h-20 text-sm font-medium"
                    placeholder="Motivo clínico ou estrutural..."
                    required
                  />
                </div>

                <button 
                  type="submit"
                  disabled={loading}
                  className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-3 px-4 rounded-lg transition-colors mt-2 text-sm shadow-sm"
                >
                  {loading ? 'Processando...' : 'Confirmar Exceção'}
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Fila de Rodízio Visual com Componente Expansível */}
        <div className="lg:col-span-8">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 min-h-full">
            <div className="flex items-center justify-between mb-6 border-b pb-4">
              <div className="flex items-center gap-2">
                <Stethoscope className="text-slate-800 w-5 h-5" />
                <h2 className="text-lg font-bold text-slate-800">Cadeia de Alocação</h2>
              </div>
              <span className="bg-slate-100 text-slate-600 text-xs font-bold px-3 py-1 rounded-full border border-slate-200">
                {filaEnriquecida.length} Recursos Disponíveis
              </span>
            </div>

            {filaEnriquecida.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                <Users className="w-12 h-12 mb-4 opacity-20" />
                <p className="text-base font-semibold text-slate-600">Sem recursos médicos ativos</p>
                <p className="text-sm">O sistema encontra-se ocioso.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {filaEnriquecida.map((cota, index) => (
                  <div 
                    key={cota.id} 
                    className={`p-5 rounded-xl border-2 transition-all ${
                      index === 0 
                        ? 'border-slate-800 bg-slate-50 shadow-sm' 
                        : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-4 w-full">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-black text-lg shrink-0 mt-1 ${
                          index === 0 ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-400'
                        }`}>
                          {index + 1}º
                        </div>
                        
                        <div className="flex-1">
                          <h3 className={`font-bold ${index === 0 ? 'text-slate-900 text-lg' : 'text-slate-700 text-base'}`}>
                            {cota.medico_nome}
                          </h3>
                          
                          {/* Substituição pela Taxonomia Estruturada */}
                          <QueixasViewer queixas={cota.queixas} />

                          {cota.observacao && (
                            <p className="text-xs text-slate-600 mt-3 flex items-center gap-1.5 font-medium bg-slate-100 p-2 rounded-md w-fit border border-slate-200">
                              <AlertTriangle className="w-3.5 h-3.5 text-slate-500" />
                              {cota.observacao}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="text-right shrink-0 ml-6 flex flex-col items-end">
                        <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest mb-1">Vagas</p>
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center font-black text-xl border-4 ${
                          index === 0 ? 'border-slate-800 text-slate-800' : 'border-slate-200 text-slate-500'
                        }`}>
                          {cota.quantidade_restante}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </main>
    </div>
  );
}