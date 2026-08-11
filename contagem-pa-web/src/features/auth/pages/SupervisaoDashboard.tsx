import { useState, useEffect } from 'react';
import { api } from '../../../lib/axios';
import { useAuthStore } from '../../../app/store/authStore';
import PassagemPlantao from '../../../components/PassagemPlantao';
import { obterDadosRelatorio } from '../../../lib/relatorioPlantao';
import {
  LogOut, Activity, AlertCircle, ClipboardCheck,
  Calendar, Timer, UserCheck, Stethoscope, Hourglass, RefreshCw,
  Building, PieChart, ChevronDown, ChevronUp
} from 'lucide-react';

export default function SupervisaoDashboard() {
  const { user, logout } = useAuthStore();
  const [dados, setDados] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [dataFiltro, setDataFiltro] = useState(new Date().toLocaleDateString('en-CA'));

  useEffect(() => {
    carregarDashboard();
    const hoje = new Date().toLocaleDateString('en-CA');
    let intervalo: ReturnType<typeof setInterval> | undefined;
    if (dataFiltro === hoje) {
      // Polling só com a aba visível
      intervalo = setInterval(() => {
        if (document.visibilityState === 'visible') carregarDashboard();
      }, 30000);
    }
    return () => clearInterval(intervalo);
  }, [dataFiltro]);

  const carregarDashboard = async () => {
    setLoading(true);
    try {
      const response = await api.get(`/supervisao/dashboard?data=${dataFiltro}`);
      setDados(response.data);
    } catch (error) {
      console.error("Erro ao carregar dashboard:", error);
    } finally {
      setLoading(false);
    }
  };

  if (!dados && loading) return <div className="p-8 text-center font-bold text-slate-500 min-h-screen flex items-center justify-center">A estabelecer ligação ao MV Oracle...</div>;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <header className="bg-white shadow-sm px-4 md:px-8 py-4 flex flex-wrap justify-between items-center gap-y-3 border-b-2 border-slate-200 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Activity className="text-purple-600 w-8 h-8" />
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">SUPERVISÃO IPO</h1>
        </div>
        
        <div className="flex flex-wrap items-center gap-2 md:gap-4">
          <div className="flex items-center gap-2 bg-white border-2 border-purple-100 rounded-xl px-4 py-2 shadow-sm">
            <Calendar className="w-5 h-5 text-purple-600" />
            <input 
              type="date" 
              value={dataFiltro}
              onChange={(e) => setDataFiltro(e.target.value)}
              className="text-sm font-bold text-slate-700 outline-none"
            />
          </div>

          <button onClick={carregarDashboard} className="p-2 hover:bg-slate-100 rounded-full transition-all" title="Atualizar Dados">
            <RefreshCw className={`w-5 h-5 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <div className="h-8 w-px bg-slate-200 mx-2" />
          
          <div className="text-right pl-2 hidden md:block">
            <p className="text-sm font-semibold text-slate-800">{user?.nome || 'Convidado'}</p>
            <p className="text-xs text-slate-500 uppercase">{user?.role || 'Supervisão'}</p>
          </div>
          
          <button onClick={logout} className="flex items-center gap-2 text-red-500 font-bold hover:bg-red-50 px-4 py-2 ml-4 rounded-lg transition-all">
            Sair <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="p-4 md:p-8 max-w-[1600px] mx-auto w-full space-y-6 md:space-y-8">

        {/* CARDS PRINCIPAIS: INDICADORES GLOBAIS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4 md:gap-6">
          <StatCard
            title="Total Atendimentos"
            value={dados?.hospitalGlobal?.totalAtendimentos?.total}
            subtitle={`PA: ${dados?.hospitalGlobal?.totalAtendimentos?.pa || 0} | Cont: ${dados?.hospitalGlobal?.totalAtendimentos?.contagem || 0} | PA3: ${dados?.hospitalGlobal?.totalAtendimentos?.pa3 || 0}`}
            color="blue"
          />
          <StatCard
            title="Médicos no Plantão"
            value={dados?.hospitalGlobal?.medicosAtivos?.total}
            subtitle={`PA: ${dados?.hospitalGlobal?.medicosAtivos?.pa || 0} | Cont: ${dados?.hospitalGlobal?.medicosAtivos?.contagem || 0} | PA3: ${dados?.hospitalGlobal?.medicosAtivos?.pa3 || 0}`}
            color="emerald"
          />
          <StatCard title="Cotas de Rodízio" value={dados?.rodizio?.cotasAtivas} subtitle="Abertas neste momento" color="purple" />
          <StatCard title="Exceções (Furos)" value={dados?.rodizio?.excecoesGeradas} subtitle="Registradas neste dia" color="red" />
          <StatCard title="Pacientes Atendidos" value={dados?.rodizio?.pacientesAtendidos} subtitle="Sistema de Rodízio PA" color="amber" />
        </div>

        {/* INDICADORES DE SLA (TEMPOS MÉDIOS) */}
        <section className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-3 mb-4">
            <Timer className="text-purple-600 w-6 h-6" />
            <h2 className="text-xl font-bold text-slate-800">Tempos de Processo — Mediana (Minutos) · SLA Hospitalar</h2>
          </div>
          {(dados?.hospitalGlobal?.temposProcesso?.registrosSuspeitos || 0) > 0 && (
            <div className="mb-6 bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold px-4 py-2 rounded-lg inline-flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {dados.hospitalGlobal.temposProcesso.registrosSuspeitos} registro(s) com apontamento suspeito (etapa &gt; 4h) — provável atendimento não encerrado no MV
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-6 md:gap-8">
            <SLABadge label="Espera Recepção" value={dados?.hospitalGlobal?.temposProcesso?.esperaRecepcao} icon={<Hourglass />} />
            <SLABadge label="Tempo Cadastro" value={dados?.hospitalGlobal?.temposProcesso?.cadastro} icon={<UserCheck />} />
            <SLABadge label="Espera Médica" value={dados?.hospitalGlobal?.temposProcesso?.esperaMedica} icon={<Activity />} />
            <SLABadge label="Tempo Consulta" value={dados?.hospitalGlobal?.temposProcesso?.consulta} icon={<Stethoscope />} />
            <div className="bg-slate-900 p-6 rounded-2xl text-center shadow-lg transform hover:scale-105 transition-all flex flex-col justify-center">
              <p className="text-slate-400 text-xs font-black uppercase tracking-widest mb-2">Permanência Total</p>
              <p className="text-4xl font-black text-white">{dados?.hospitalGlobal?.temposProcesso?.permanenciaTotal || 0}<span className="text-lg ml-1 font-normal opacity-50">min</span></p>
            </div>
          </div>
        </section>

        {/* FLUXO POR HORA + DETALHE DA PERMANÊNCIA TOTAL */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
            <div className="flex items-center gap-3 mb-8">
              <Activity className="text-purple-600 w-6 h-6" />
              <h2 className="text-xl font-bold text-slate-800">Fluxo de Chegadas por Hora</h2>
            </div>
            <FluxoHorarioChart dados={dados?.hospitalGlobal?.fluxoHorario || []} />
          </div>

          <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
            <div className="flex items-center gap-3 mb-8">
              <Hourglass className="text-purple-600 w-6 h-6" />
              <h2 className="text-xl font-bold text-slate-800">Permanência Total</h2>
            </div>
            <PermanenciaDetalhe
              detalhe={dados?.hospitalGlobal?.permanenciaDetalhe}
              mediana={dados?.hospitalGlobal?.temposProcesso?.permanenciaTotal}
            />
          </div>
        </section>

        {/* PRODUÇÃO POR MÉDICO */}
        <section className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <UserCheck className="text-purple-600 w-6 h-6" />
              <h2 className="text-xl font-bold text-slate-800">Produção por Médico</h2>
            </div>
            <span className="bg-slate-100 text-slate-600 text-xs font-bold px-3 py-1 rounded-full border border-slate-200">
              {dados?.producaoMedicos?.length || 0} médico(s) no dia
            </span>
          </div>
          <MedicosProducao lista={dados?.producaoMedicos} />
        </section>

        {/* NOVA SEÇÃO: TOP 10 CONVÊNIOS E CID */}
        {dados?.rankings && (
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <RankingCard 
              titulo="Top 10 Convênios" 
              icone={<Building className="text-blue-500 w-6 h-6" />}
              dataDia={dados.rankings.conveniosDia} 
              dataMes={dados.rankings.conveniosMes} 
              corBase="blue"
            />
            <RankingCard 
              titulo="Top 10 CIDs (Doenças)" 
              icone={<PieChart className="text-emerald-500 w-6 h-6" />}
              dataDia={dados.rankings.cidsDia} 
              dataMes={dados.rankings.cidsMes} 
              corBase="emerald"
            />
          </section>
        )}

        {/* SECÇÃO INFERIOR: PLANTÃO E AUDITORIA */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <h2 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2 border-b pb-4">
              <ClipboardCheck className="text-purple-600 w-5 h-5" /> Formulário de Passagem de Plantão
            </h2>
            {/* Mesmo relatório do PADashboard, seguindo a DATA SELECIONADA no calendário */}
            <PassagemPlantao
              cor="purple"
              obterDados={() => obterDadosRelatorio(dataFiltro)}
            />
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <div className="flex items-center gap-3 mb-6 border-b pb-4">
              <AlertCircle className="text-red-500 w-6 h-6" />
              <h2 className="text-lg font-bold text-slate-800">Auditoria de Furos de Fila (Exceções)</h2>
            </div>
            <div className="space-y-4 max-h-[550px] overflow-y-auto pr-2">
              {!dados?.rodizio?.detalhesExcecoes || dados.rodizio.detalhesExcecoes.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                  <AlertCircle className="w-12 h-12 mb-3 opacity-20" />
                  <p className="font-semibold text-center">Nenhum furo de fila registado em {dataFiltro}.</p>
                </div>
              ) : (
                dados.rodizio.detalhesExcecoes.map((exc: any) => (
                  <div key={exc.id} className="p-5 bg-slate-50 rounded-xl border border-slate-200 hover:border-red-300 transition-all">
                    <div className="flex justify-between items-center mb-3">
                      <span className="font-black text-slate-800">Ref/Senha: {exc.paciente_identificador}</span>
                      <span className="text-xs font-bold bg-white px-3 py-1 rounded-full shadow-sm text-slate-500 border border-slate-100">
                        {new Date(exc.criado_em).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      </span>
                    </div>
                    <div className="space-y-1 text-sm">
                      <p><span className="text-slate-500">Médico Acionado:</span> <span className="font-bold text-slate-700">{exc.medico_nome || 'N/A'}</span></p>
                      <p><span className="text-slate-500">Operador do PA:</span> <span className="font-bold text-slate-700">{exc.usuario_nome || 'N/A'}</span></p>
                      <div className="mt-3 bg-red-50 border border-red-100 p-3 rounded-lg">
                        <p className="text-red-700 italic font-medium">"{exc.justificativa}"</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

// ================= COMPONENTES AUXILIARES =================

// Lista expansível de produção por médico (dia completo, 24h)
function MedicosProducao({ lista }: { lista: any[] }) {
  const [expandido, setExpandido] = useState<string | null>(null);
  const medicos = lista || [];

  if (medicos.length === 0) {
    return <div className="py-10 text-center text-slate-400 text-sm font-bold">Nenhum atendimento médico registrado na data.</div>;
  }

  return (
    <div className="space-y-2">
      {medicos.map(m => {
        const aberto = expandido === m.medico;
        return (
          <div key={m.medico} className={`border rounded-xl transition-all ${aberto ? 'border-slate-300 shadow-sm' : 'border-slate-200'}`}>
            <button
              onClick={() => setExpandido(aberto ? null : m.medico)}
              className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-50 rounded-xl transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0 flex-wrap">
                <Stethoscope className="w-4 h-4 text-slate-400 shrink-0" />
                <span className="font-bold text-sm text-slate-800 truncate">{m.medico}</span>
                {m.suspeitos?.length > 0 && (
                  <span className="bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> {m.suspeitos.length} apontamento(s) suspeito(s)
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 shrink-0 ml-4">
                <span className="text-xs font-medium text-slate-500 hidden sm:inline" title="Tempo de consulta típico (mediana do dia)">
                  consulta: <span className="font-bold text-slate-700">{m.medianaConsulta ?? '—'}</span> min
                </span>
                <span className="text-sm font-black text-slate-800">
                  {m.total} <span className="text-xs font-medium text-slate-400">atend.</span>
                </span>
                {aberto ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
              </div>
            </button>

            {aberto && (
              <div className="px-4 pb-4 space-y-3">
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">Convênios Atendidos</p>
                  <div className="flex flex-wrap gap-2">
                    {(m.convenios || []).map((c: any) => (
                      <span key={c.nome} className="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-200 text-slate-700 text-xs font-medium px-2.5 py-1 rounded-md">
                        {c.nome}
                        <span className="font-black text-slate-900">{c.quantidade}</span>
                      </span>
                    ))}
                  </div>
                </div>

                {/* Apontamentos suspeitos: provável registro não encerrado no MV */}
                {m.suspeitos?.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <p className="text-xs font-bold text-amber-800 mb-2 flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      Apontamentos suspeitos — provável atendimento não encerrado no MV
                    </p>
                    <div className="space-y-1">
                      {m.suspeitos.map((s: any, i: number) => (
                        <p key={i} className="text-xs text-amber-900">
                          <span className="font-semibold">{s.paciente}</span> — {s.motivo}
                        </p>
                      ))}
                    </div>
                    <p className="text-[10px] text-amber-700 mt-2">
                      Estes registros não entram no tempo de consulta típico do médico. Solicite o encerramento no MV.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Gráfico de barras (CSS puro) com as chegadas de pacientes por hora do dia
function FluxoHorarioChart({ dados }: { dados: any[] }) {
  const porHora = Array.from({ length: 24 }, (_, h) => {
    const item = dados.find((d: any) => Number(d.HORA ?? d.hora) === h);
    return {
      hora: h,
      qtd: Number(item?.QUANTIDADE ?? item?.quantidade ?? 0),
      mediana: Number(item?.MEDIANA_PERMANENCIA ?? item?.mediana_permanencia ?? 0)
    };
  });
  const max = Math.max(...porHora.map(p => p.qtd), 1);
  const total = porHora.reduce((acc, p) => acc + p.qtd, 0);
  const pico = porHora.reduce((a, b) => (b.qtd > a.qtd ? b : a), porHora[0]);

  if (total === 0) {
    return <div className="h-56 flex items-center justify-center text-slate-400 text-sm font-bold">Sem chegadas registradas na data.</div>;
  }

  return (
    <div>
      <div className="flex items-end gap-1 h-48">
        {porHora.map(p => (
          <div
            key={p.hora}
            className="flex-1 flex flex-col items-center justify-end gap-1 group h-full"
            title={`${String(p.hora).padStart(2, '0')}h — ${p.qtd} chegada(s)${p.mediana ? ` | permanência mediana: ${p.mediana} min` : ''}`}
          >
            <span className="text-[9px] font-black text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity">
              {p.qtd || ''}
            </span>
            <div
              className={`w-full rounded-t transition-colors ${p.qtd ? 'bg-purple-500 group-hover:bg-purple-700' : 'bg-slate-100'}`}
              style={{ height: `${Math.max((p.qtd / max) * 100, p.qtd ? 4 : 2)}%` }}
            />
            <span className={`text-[9px] font-bold ${p.hora === pico.hora ? 'text-purple-600' : 'text-slate-400'}`}>{p.hora}</span>
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-500 font-medium mt-4 text-center">
        Pico às <span className="font-black text-purple-600">{String(pico.hora).padStart(2, '0')}h</span> com {pico.qtd} chegada(s) · passe o mouse para detalhes
      </p>
    </div>
  );
}

// Detalhe da permanência total: mediana, P90, máxima e distribuição por faixas
function PermanenciaDetalhe({ detalhe, mediana }: any) {
  const faixas = [
    { label: '≤ 30 min', valor: detalhe?.faixas?.ate30 || 0, cor: 'bg-emerald-500' },
    { label: '31–60 min', valor: detalhe?.faixas?.de31a60 || 0, cor: 'bg-blue-500' },
    { label: '1–2 h', valor: detalhe?.faixas?.de61a120 || 0, cor: 'bg-amber-500' },
    { label: '> 2 h', valor: detalhe?.faixas?.acima120 || 0, cor: 'bg-red-500' },
  ];
  const total = faixas.reduce((acc, f) => acc + f.valor, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Mediana</p>
          <p className="text-2xl font-black text-slate-800">{mediana || 0}<span className="text-xs font-normal text-slate-400 ml-0.5">m</span></p>
        </div>
        <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">P90</p>
          <p className="text-2xl font-black text-slate-800">{detalhe?.p90 || 0}<span className="text-xs font-normal text-slate-400 ml-0.5">m</span></p>
        </div>
        <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Máxima</p>
          <p className="text-2xl font-black text-red-600">{detalhe?.maxima || 0}<span className="text-xs font-normal text-slate-400 ml-0.5">m</span></p>
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Distribuição dos Pacientes</p>
        {total === 0 ? (
          <p className="text-sm text-slate-400 font-bold text-center py-4">Sem dados na data.</p>
        ) : (
          faixas.map(f => {
            const pct = Math.round((f.valor / total) * 100);
            return (
              <div key={f.label}>
                <div className="flex justify-between text-xs font-bold text-slate-600 mb-1">
                  <span>{f.label}</span>
                  <span>{f.valor} ({pct}%)</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2.5">
                  <div className={`${f.cor} h-2.5 rounded-full transition-all`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// Novo Componente para exibir o Ranking (Top 10)
function RankingCard({ titulo, icone, dataDia, dataMes, corBase }: any) {
  const [aba, setAba] = useState('DIA');
  const lista = aba === 'DIA' ? dataDia : dataMes;

  const bgAtivo = corBase === 'blue' ? 'bg-blue-600 text-white shadow-md' : 'bg-emerald-600 text-white shadow-md';
  const textInativo = 'text-slate-500 hover:bg-slate-100';

  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col h-[450px]">
      <div className="flex justify-between items-center mb-6 border-b pb-4">
        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          {icone} {titulo}
        </h2>
        {/* Toggle Dia/Mês */}
        <div className="bg-slate-50 p-1 rounded-lg border border-slate-200 flex">
          <button onClick={() => setAba('DIA')} className={`px-4 py-1 text-xs font-bold rounded-md transition-all ${aba === 'DIA' ? bgAtivo : textInativo}`}>
            Dia
          </button>
          <button onClick={() => setAba('MES')} className={`px-4 py-1 text-xs font-bold rounded-md transition-all ${aba === 'MES' ? bgAtivo : textInativo}`}>
            Mês
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pr-2 space-y-2">
        {lista && lista.length > 0 ? (
          lista.map((item: any, index: number) => {
            // Dependendo de como a biblioteca Oracle estiver configurada, a coluna pode vir minúscula ou maiúscula.
            const nome = item.NOME || item.nome;
            const quantidade = item.QUANTIDADE || item.quantidade;
            return (
              <div key={index} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div className="flex items-center gap-3">
                  <span className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-black ${index < 3 ? 'bg-slate-800 text-white' : 'bg-slate-200 text-slate-500'}`}>
                    {index + 1}
                  </span>
                  <p className="text-sm font-bold text-slate-700 truncate max-w-[200px] sm:max-w-[300px]" title={nome}>
                    {nome}
                  </p>
                </div>
                <span className="font-black text-lg text-slate-800">{quantidade}</span>
              </div>
            );
          })
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-slate-400">
            <p className="text-sm font-bold">Nenhum dado encontrado.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ title, value, subtitle, color }: any) {
  const colors: any = {
    blue: 'border-l-blue-500 text-blue-600', emerald: 'border-l-emerald-500 text-emerald-600',
    purple: 'border-l-purple-500 text-purple-600', red: 'border-l-red-500 text-red-600',
    amber: 'border-l-amber-500 text-amber-600'
  };
  return (
    <div className={`bg-white p-6 rounded-2xl shadow-sm border border-slate-200 border-l-8 ${colors[color]}`}>
      <p className="text-xs font-black uppercase text-slate-400 tracking-wider mb-2">{title}</p>
      <p className="text-4xl font-black text-slate-800 mb-2">{value ?? '-'}</p>
      <p className="text-xs font-medium text-slate-500 bg-slate-50 inline-block px-2 py-1 rounded">{subtitle}</p>
    </div>
  );
}

function SLABadge({ label, value, icon }: any) {
  return (
    <div className="text-center group">
      <div className="w-14 h-14 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-400 group-hover:bg-purple-100 group-hover:text-purple-600 transition-colors duration-300">
        {icon}
      </div>
      <p className="text-[11px] font-black text-slate-400 uppercase tracking-wide mb-2">{label}</p>
      <p className="text-3xl font-black text-slate-800">{value ?? '-'}<span className="text-base font-normal text-slate-400 ml-1">m</span></p>
    </div>
  );
}