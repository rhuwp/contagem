import { useState, useEffect } from 'react';
import { api } from '../../../lib/axios';
import { useAuthStore } from '../../../app/store/authStore';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  LogOut, Activity, AlertCircle, ClipboardCheck, 
  Calendar, Timer, UserCheck, Stethoscope, Hourglass, RefreshCw, FileDown,
  Building, PieChart
} from 'lucide-react';

export default function SupervisaoDashboard() {
  const { user, logout } = useAuthStore();
  const [dados, setDados] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  const [dataFiltro, setDataFiltro] = useState(new Date().toLocaleDateString('en-CA'));
  const [turno, setTurno] = useState('Manha');
  const [pendencias, setPendencias] = useState('');
  const [intercorrencias, setIntercorrencias] = useState('');
  const [observacoes, setObservacoes] = useState('');

  useEffect(() => {
    carregarDashboard();
    const hoje = new Date().toLocaleDateString('en-CA');
    let intervalo: any;
    if (dataFiltro === hoje) {
      intervalo = setInterval(carregarDashboard, 30000); 
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

  const gerarPDFPlantao = () => {
    const doc = new jsPDF() as any;
    const dataHora = new Date().toLocaleString();
    const nomeSupervisor = user?.nome || 'Sistema (Não Identificado)';

    doc.setFontSize(18);
    doc.text('Relatorio de Passagem de Plantao - IPO', 14, 20);
    doc.setFontSize(10);
    doc.text(`Gerado em: ${dataHora} | Supervisor: ${nomeSupervisor}`, 14, 28);
    doc.line(14, 32, 196, 32);

    autoTable(doc, {
      startY: 40,
      head: [['Campo', 'Informacao']],
      body: [
        ['Turno', turno],
        ['Supervisor Responsavel', nomeSupervisor],
        ['Pendencias', pendencias || 'Nenhuma informada'],
        ['Intercorrencias', intercorrencias || 'Nenhuma informada'],
        ['Observacoes Gerais', observacoes || 'Nenhuma informada'],
      ],
      theme: 'grid',
      headStyles: { fillColor: [126, 34, 206] }, 
    });

    const finalY = doc.lastAutoTable.finalY + 10;
    
    doc.setFontSize(14);
    doc.text('Indicadores do Hospital no Fechamento:', 14, finalY);
    doc.setFontSize(10);
    doc.text(`- Atendimentos Totais (MV): ${dados?.hospitalGlobal?.totalAtendimentosHoje || 0}`, 14, finalY + 8);
    doc.text(`- Medicos Ativos: ${dados?.hospitalGlobal?.medicosLogados || 0}`, 14, finalY + 14);
    doc.text(`- Permanencia Media Total: ${dados?.hospitalGlobal?.temposProcesso?.permanenciaTotal || 0} min`, 14, finalY + 20);
    doc.text(`- Excecoes Registradas no Rodizio: ${dados?.rodizio?.excecoesGeradas || 0}`, 14, finalY + 26);

    doc.save(`Plantao_IPO_${dataFiltro}_${turno}.pdf`);
  };

  const handleRegistrarPlantao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) return alert("Erro de Sessão: O seu utilizador não foi reconhecido.");

    try {
      await api.post('/supervisao/plantao', { 
        supervisor_id: user.id, turno, pendencias, intercorrencias, observacoes 
      });
      gerarPDFPlantao();
      alert('Passagem de plantão consolidada e PDF gerado com sucesso!');
      setPendencias(''); setIntercorrencias(''); setObservacoes('');
    } catch (error: any) {
      alert(`Erro ao registar plantão: ${error.response?.data?.erro || error.message}`);
    }
  };

  if (!dados && loading) return <div className="p-8 text-center font-bold text-slate-500 min-h-screen flex items-center justify-center">A estabelecer ligação ao MV Oracle...</div>;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <header className="bg-white shadow-sm px-8 py-4 flex justify-between items-center border-b-2 border-slate-200 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Activity className="text-purple-600 w-8 h-8" />
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">SUPERVISÃO IPO</h1>
        </div>
        
        <div className="flex items-center gap-4">
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

      <main className="p-8 max-w-[1600px] mx-auto w-full space-y-8">
        
        {/* CARDS PRINCIPAIS: INDICADORES GLOBAIS */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <StatCard title="Total Atendimentos" value={dados?.hospitalGlobal?.totalAtendimentosHoje} subtitle={`PA: ${dados?.hospitalGlobal?.pacientesPA || 0} | Cont: ${dados?.hospitalGlobal?.pacientesContagem || 0}`} color="blue" />
          <StatCard title="Médicos no Plantão" 
  value={dados?.hospitalGlobal?.medicosLogados} 
  subtitle={`PA: ${dados?.hospitalGlobal?.medicosPA || 0} | Cont: ${dados?.hospitalGlobal?.medicosContagem || 0}`} 
  color="emerald" 
/>
          <StatCard title="Cotas de Rodízio" value={dados?.rodizio?.cotasAtivas} subtitle="Injetadas pela Secretaria" color="purple" />
          <StatCard title="Exceções (Furos)" value={dados?.rodizio?.excecoesGeradas} subtitle="Registradas neste dia" color="red" />
        </div>

        {/* INDICADORES DE SLA (TEMPOS MÉDIOS) */}
        <section className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-3 mb-8">
            <Timer className="text-purple-600 w-6 h-6" />
            <h2 className="text-xl font-bold text-slate-800">Tempos Médios do Processo (Minutos) - SLA Hospitalar</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
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
            <form onSubmit={handleRegistrarPlantao} className="space-y-4">
              <select value={turno} onChange={(e) => setTurno(e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-lg bg-slate-50 outline-none focus:ring-2 focus:ring-purple-500 font-medium">
                <option value="Manha">Turno da Manhã</option>
                <option value="Tarde">Turno da Tarde</option>
                <option value="Noite">Turno da Noite</option>
              </select>
              <textarea value={pendencias} onChange={e => setPendencias(e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-lg h-24 outline-none focus:ring-2 focus:ring-purple-500" placeholder="Ex: Pendências, exames aguardando autorização..." />
              <textarea value={intercorrencias} onChange={e => setIntercorrencias(e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-lg h-24 outline-none focus:ring-2 focus:ring-purple-500" placeholder="Ex: Intercorrências, falhas de sistema, falta de médicos..." />
              <textarea value={observacoes} onChange={e => setObservacoes(e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-lg h-24 outline-none focus:ring-2 focus:ring-purple-500" placeholder="Observações gerais do turno..." />
              <button type="submit" className="w-full bg-purple-600 text-white font-bold py-4 rounded-lg shadow-md hover:bg-purple-700 transition-colors text-lg mt-2 flex items-center justify-center gap-2">
                <FileDown className="w-5 h-5" /> Submeter e Gerar Relatório PDF
              </button>
            </form>
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
    purple: 'border-l-purple-500 text-purple-600', red: 'border-l-red-500 text-red-600'
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