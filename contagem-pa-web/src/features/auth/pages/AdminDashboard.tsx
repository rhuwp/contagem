import { useState, useEffect } from 'react';
import { api } from '../../../lib/axios';
import { useAuthStore } from '../../../app/store/authStore';
import { 
  LogOut, ShieldCheck, Users, UserPlus, 
  Lock, User, CheckCircle, XCircle, KeyRound, 
  ChevronRight, Search, LayoutDashboard, Stethoscope, Trash2, Loader2, Info
} from 'lucide-react';

export default function AdminDashboard() {
  const { user, logout } = useAuthStore();
  
  // Controle de Navegação
  const [activeTab, setActiveTab] = useState<'usuarios' | 'queixas'>('usuarios');

  // Estados: Usuários (Removido o estado de email)
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [filtroUsuario, setFiltroUsuario] = useState('');
  const [nomeUsuario, setNomeUsuario] = useState('');
  const [senhaUsuario, setSenhaUsuario] = useState('');
  const [roleUsuario, setRoleUsuario] = useState('PA');
  const [usuarioResetId, setUsuarioResetId] = useState('');
  const [novaSenhaReset, setNovaSenhaReset] = useState('');

  // Estados: Queixas
  const [medicosOracle, setMedicosOracle] = useState<any[]>([]);
  const [queixas, setQueixas] = useState<any[]>([]);
  const [filtroQueixa, setFiltroQueixa] = useState('');
  const [medicoSelecionado, setMedicoSelecionado] = useState('');
  const [novaQueixaTexto, setNovaQueixaTexto] = useState('');

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    carregarDados();
  }, []);

  const carregarDados = async () => {
    setLoading(true);
    try {
      const [resUsuarios, resMedicos, resQueixas] = await Promise.all([
        api.get('/admin/usuarios').catch(() => ({ data: [] })),
        api.get('/medicos').catch(() => ({ data: [] })),
        api.get('/admin/queixas').catch(() => ({ data: [] }))
      ]);
      setUsuarios(resUsuarios.data);
      setMedicosOracle(resMedicos.data);
      setQueixas(resQueixas.data);
    } catch (error) {
      console.error("Erro na obtenção de dados estruturais:", error);
    } finally {
      setLoading(false);
    }
  };

  // Funções de Gestão de Usuários
  const handleCriarUsuario = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/admin/usuarios', {
        nome: nomeUsuario, senha: senhaUsuario, role: roleUsuario
      });
      setNomeUsuario(''); setSenhaUsuario(''); setRoleUsuario('PA');
      carregarDados();
      alert('Utilizador criado com sucesso! Lembre o colaborador que ele deverá trocar a senha no primeiro acesso.');
    } catch (error: any) {
      alert(error.response?.data?.erro || 'Erro estrutural ao criar utilizador.');
    }
  };

  const handleRedefinirSenha = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usuarioResetId) return;
    try {
      await api.put(`/admin/usuarios/${usuarioResetId}/senha`, { novaSenha: novaSenhaReset });
      setUsuarioResetId(''); setNovaSenhaReset('');
      alert('Senha atualizada com sucesso!');
    } catch (error: any) {
      alert(error.response?.data?.erro || 'Falha no protocolo de redefinição.');
    }
  };

  // NOVA FUNÇÃO: ALTERNAR STATUS
  const handleAlternarStatus = async (id: number, statusAtual: boolean) => {
    const acao = statusAtual ? 'desativar' : 'reativar';
    if (!window.confirm(`Tem certeza que deseja ${acao} este acesso corporativo?`)) return;

    try {
      await api.put(`/admin/usuarios/${id}/status`);
      carregarDados(); // Recarrega a tabela imediatamente
    } catch (error: any) {
      alert('Falha ao alterar o status do utilizador.');
    }
  };

  // Funções de Gestão de Queixas
  const handleAdicionarQueixa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!medicoSelecionado || !novaQueixaTexto) return;

    try {
      await api.post('/admin/queixas', {
        medico_nome: medicoSelecionado,
        queixa: novaQueixaTexto
      });
      setMedicoSelecionado('');
      setNovaQueixaTexto('');
      carregarDados(); 
    } catch (error: any) {
      alert(error.response?.data?.erro || 'Falha ao registrar relacionamento clínico.');
    }
  };

  const handleRemoverQueixa = async (id: number) => {
    if (!window.confirm('Confirma a revogação desta queixa para o profissional selecionado?')) return;
    
    try {
      await api.delete(`/admin/queixas/${id}`);
      setQueixas(queixas.filter(q => q.id !== id));
    } catch (error: any) {
      alert('Falha ao remover o registro.');
    }
  };

  // Filtros (atualizados para usar 'usuario' em vez de 'email')
  const usuariosFiltrados = usuarios.filter(u => 
    u.nome.toLowerCase().includes(filtroUsuario.toLowerCase()) || 
    (u.usuario && u.usuario.toLowerCase().includes(filtroUsuario.toLowerCase()))
  );

  const queixasFiltradas = queixas.filter(q => {
    const nome = (q.medico_nome || '').toLowerCase();
    const queixaText = (q.queixa || '').toLowerCase();
    const filtro = (filtroQueixa || '').toLowerCase();
    
    return nome.includes(filtro) || queixaText.includes(filtro);
  });

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900">
      <header className="bg-white border-b border-slate-200 px-8 py-4 flex justify-between items-center sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="bg-slate-800 p-2 rounded-xl shadow-lg">
            <ShieldCheck className="text-white w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight text-slate-800">Console de Administração</h1>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Gestão de Identidade e Taxonomia</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="text-right border-r pr-4 border-slate-200 hidden sm:block">
            <p className="text-sm font-bold text-slate-700">{user?.nome || 'Administrador'}</p>
            <p className="text-[10px] text-slate-500 font-black uppercase tracking-tighter">{user?.role || 'TI'}</p>
          </div>
          <button onClick={logout} className="p-2 text-slate-400 hover:text-red-500 transition-colors">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      {loading ? (
        <main className="flex-1 flex flex-col items-center justify-center p-10">
          <Loader2 className="w-12 h-12 text-slate-800 animate-spin mb-4" />
          <p className="text-slate-500 font-bold tracking-widest uppercase text-sm animate-pulse">Sincronizando Sistemas Locais e Oracle MV...</p>
        </main>
      ) : (
        <main className="flex-1 p-6 lg:p-10 max-w-[1600px] mx-auto w-full space-y-8 fade-in">
          
          <div className="flex gap-4 border-b border-slate-200 pb-px">
            <button 
              onClick={() => setActiveTab('usuarios')}
              className={`pb-4 px-2 text-sm font-black uppercase tracking-wider flex items-center gap-2 transition-colors ${
                activeTab === 'usuarios' ? 'border-b-2 border-slate-800 text-slate-800' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <Users className="w-4 h-4" /> Controle de Acessos
            </button>
            <button 
              onClick={() => setActiveTab('queixas')}
              className={`pb-4 px-2 text-sm font-black uppercase tracking-wider flex items-center gap-2 transition-colors ${
                activeTab === 'queixas' ? 'border-b-2 border-slate-800 text-slate-800' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <Stethoscope className="w-4 h-4" /> Taxonomia Clínica (Queixas)
            </button>
          </div>

          {activeTab === 'usuarios' && (
            <div className="space-y-10 animate-in fade-in">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <section className="lg:col-span-7 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="bg-slate-50 px-8 py-5 border-b border-slate-200">
                    <h2 className="text-slate-800 font-bold flex items-center gap-2">
                      <UserPlus className="w-5 h-5" /> Provisionamento de Novo Acesso
                    </h2>
                  </div>
                  <form onSubmit={handleCriarUsuario} className="p-8 space-y-6">
                    
                    {/* Alerta de Criação Inteligente */}
                    <div className="bg-blue-50 border border-blue-200 text-blue-800 p-3 rounded-xl flex gap-3 items-start text-xs font-medium">
                      <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                      <p>O sistema gera a credencial automaticamente no padrão <strong>nome.sobrenome</strong> a partir do nome digitado. A troca de senha será exigida no primeiro acesso.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="md:col-span-2">
                        <InputGroup label="Nome Completo" icon={<User className="w-4 h-4" />}>
                          <input type="text" required value={nomeUsuario} onChange={e => setNomeUsuario(e.target.value)} className="form-input-custom" placeholder="Ex: Rhuan Vinicius Martins" />
                        </InputGroup>
                      </div>
                      <div className="md:col-span-1">
                        <InputGroup label="Nível de Acesso" icon={<LayoutDashboard className="w-4 h-4" />}>
                          <select value={roleUsuario} onChange={e => setRoleUsuario(e.target.value)} className="form-input-custom font-bold text-slate-700">
                            <option value="PA">Operador PA</option>
                            <option value="SECRETARIA">Secretaria</option>
                            <option value="SUPERVISAO">Supervisão</option>
                            <option value="ADMIN">Administrador TI</option>
                          </select>
                        </InputGroup>
                      </div>
                    </div>
                    
                    <div className="w-full">
                      <InputGroup label="Senha Provisória (Recomendado: ipo123)" icon={<Lock className="w-4 h-4" />}>
                        <input type="password" required value={senhaUsuario} onChange={e => setSenhaUsuario(e.target.value)} className="form-input-custom" placeholder="Será exigida a troca no primeiro acesso..." />
                      </InputGroup>
                    </div>

                    <button type="submit" className="w-full bg-slate-800 hover:bg-slate-900 text-white font-black py-4 rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 uppercase text-xs tracking-widest mt-2">
                      Ativar Novo Acesso <ChevronRight className="w-4 h-4" />
                    </button>
                  </form>
                </section>

                <section className="lg:col-span-5 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                  <div className="bg-slate-50 px-8 py-5 border-b border-slate-200">
                    <h2 className="text-slate-800 font-bold flex items-center gap-2">
                      <KeyRound className="w-5 h-5 text-amber-500" /> Redefinição Crítica
                    </h2>
                  </div>
                  <form onSubmit={handleRedefinirSenha} className="p-8 space-y-6 flex-1 flex flex-col justify-between">
                    <div className="space-y-6">
                      <InputGroup label="Selecionar Utilizador" icon={<Users className="w-4 h-4" />}>
                        <select value={usuarioResetId} onChange={e => setUsuarioResetId(e.target.value)} className="form-input-custom font-medium">
                          <option value="">Escolha um colaborador...</option>
                          {usuarios.map(u => <option key={u.id} value={u.id}>{u.nome} ({u.role})</option>)}
                        </select>
                      </InputGroup>
                      <InputGroup label="Nova Senha Provisória" icon={<Lock className="w-4 h-4" />}>
                        <input type="password" required minLength={6} value={novaSenhaReset} onChange={e => setNovaSenhaReset(e.target.value)} className="form-input-custom" />
                      </InputGroup>
                    </div>
                    <button type="submit" className="w-full bg-amber-500 hover:bg-amber-600 text-white font-black py-4 rounded-xl transition-all shadow-sm uppercase text-xs tracking-widest mt-6">
                      Atualizar Credenciais
                    </button>
                  </form>
                </section>
              </div>

              <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="px-8 py-5 border-b border-slate-200 flex justify-between items-center">
                  <h2 className="text-sm font-black text-slate-800 uppercase tracking-wider">Quadro de Colaboradores</h2>
                  <div className="relative w-72">
                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                    <input 
                      type="text" 
                      placeholder="Filtrar acessos..." 
                      value={filtroUsuario}
                      onChange={e => setFiltroUsuario(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-slate-400"
                    />
                  </div>
                </div>
                <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                  <table className="w-full text-left border-collapse relative">
                    <thead className="sticky top-0 bg-slate-50 z-10">
                      <tr className="text-slate-400 text-[10px] uppercase font-black tracking-widest border-b border-slate-200">
                        <th className="px-8 py-4">Colaborador</th>
                        <th className="px-8 py-4">Credencial de Acesso</th>
                        <th className="px-8 py-4">Nível</th>
                        <th className="px-8 py-4">Status</th>
                        <th className="px-8 py-4 text-right">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {usuariosFiltrados.map((usr: any) => (
                        <tr key={usr.id} className={`transition-colors ${!usr.ativo ? 'bg-slate-50 opacity-60' : 'hover:bg-slate-50'}`}>
                          <td className="px-8 py-4 font-bold text-slate-700">{usr.nome}</td>
                          <td className="px-8 py-4 text-slate-500 font-mono text-xs">{usr.usuario}</td>
                          <td className="px-8 py-4">
                            <span className="px-3 py-1 rounded bg-slate-100 border border-slate-200 text-slate-600 text-[10px] font-black uppercase tracking-tighter">
                              {usr.role}
                            </span>
                          </td>
                          <td className="px-8 py-4">
                            {usr.ativo ? 
                              <span className="text-emerald-600 font-bold text-xs flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Ativo</span> : 
                              <span className="text-slate-400 font-bold text-xs flex items-center gap-1"><XCircle className="w-3 h-3" /> Inativo</span>
                            }
                          </td>
                          <td className="px-8 py-4 text-right">
                            <button 
                              onClick={() => handleAlternarStatus(usr.id, usr.ativo)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors border ${
                                usr.ativo 
                                  ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100' 
                                  : 'bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100'
                              }`}
                            >
                              {usr.ativo ? 'Desativar' : 'Reativar'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          )}

          {activeTab === 'queixas' && (
            <div className="space-y-10 animate-in fade-in">
              <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="bg-slate-50 px-8 py-5 border-b border-slate-200">
                  <h2 className="text-slate-800 font-bold flex items-center gap-2">
                    <Stethoscope className="w-5 h-5" /> Adicionar Relacionamento Clínico
                  </h2>
                </div>
                <form onSubmit={handleAdicionarQueixa} className="p-8 flex flex-col md:flex-row items-end gap-6">
                  <div className="flex-1 w-full">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                      Médico Titular (Base Oracle)
                    </label>
                    <select 
                      required 
                      value={medicoSelecionado} 
                      onChange={e => setMedicoSelecionado(e.target.value)} 
                      className="form-input-custom font-medium"
                    >
                      <option value="">Selecione o profissional...</option>
                      {medicosOracle.map(m => (
                        <option key={m.id} value={m.nome}>{m.nome}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex-1 w-full">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                      Classificação da Queixa
                    </label>
                    <input 
                      type="text" 
                      required 
                      placeholder="Ex: Epistaxe, Zumbido..." 
                      value={novaQueixaTexto} 
                      onChange={e => setNovaQueixaTexto(e.target.value)} 
                      className="form-input-custom" 
                    />
                  </div>
                  <button type="submit" className="bg-slate-800 hover:bg-slate-900 text-white font-black px-8 py-3.5 rounded-xl transition-all shadow-sm uppercase text-xs tracking-widest w-full md:w-auto h-full">
                    Vincular Queixa
                  </button>
                </form>
              </section>

              <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="px-8 py-5 border-b border-slate-200 flex justify-between items-center">
                  <h2 className="text-sm font-black text-slate-800 uppercase tracking-wider">Matriz de Especialidades</h2>
                  <div className="relative w-72">
                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                    <input 
                      type="text" 
                      placeholder="Filtrar por médico ou queixa..." 
                      value={filtroQueixa}
                      onChange={e => setFiltroQueixa(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-slate-400"
                    />
                  </div>
                </div>
                <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                  <table className="w-full text-left border-collapse relative">
                    <thead className="sticky top-0 bg-slate-50 z-10">
                      <tr className="text-slate-400 text-[10px] uppercase font-black tracking-widest border-b border-slate-200">
                        <th className="px-8 py-4">Profissional</th>
                        <th className="px-8 py-4">Queixa Associada</th>
                        <th className="px-8 py-4 text-right">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {queixasFiltradas.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-8 py-8 text-center text-sm text-slate-400">Nenhum registro correspondente.</td>
                        </tr>
                      ) : (
                        queixasFiltradas.map((q: any) => (
                          <tr key={q.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-8 py-3 font-bold text-slate-700 text-sm">{q.medico_nome}</td>
                            <td className="px-8 py-3">
                              <span className="px-3 py-1 rounded-md border border-slate-200 bg-white text-slate-600 text-xs font-bold uppercase tracking-wider">
                                {q.queixa}
                              </span>
                            </td>
                            <td className="px-8 py-3 text-right">
                              <button 
                                onClick={() => handleRemoverQueixa(q.id)}
                                className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                title="Remover Queixa"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          )}
        </main>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        .form-input-custom {
          width: 100%;
          padding: 0.75rem 1rem;
          background-color: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 0.75rem;
          outline: none;
          transition: all 0.2s;
          font-size: 0.875rem;
        }
        .form-input-custom:focus {
          background-color: #ffffff;
          border-color: #cbd5e1;
          box-shadow: 0 0 0 4px rgba(241, 245, 249, 1);
        }
        .fade-in {
          animation: fadeIn 0.4s ease-in-out;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}} />
    </div>
  );
}

function InputGroup({ label, icon, children }: any) {
  return (
    <div className="space-y-2">
      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
        {icon} {label}
      </label>
      {children}
    </div>
  );
}