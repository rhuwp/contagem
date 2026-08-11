import { useState, useEffect } from 'react';
import { api } from '../../../lib/axios';
import { useAuthStore } from '../../../app/store/authStore';
import { useModalStore } from '../../../app/store/modalStore';
import {
  LogOut, ShieldCheck, Users, UserPlus,
  Lock, User, KeyRound, Search,
  LayoutDashboard, Stethoscope, Trash2, Loader2, Info
} from 'lucide-react';

export default function AdminDashboard() {
  const { user, logout } = useAuthStore();
  const mostrarModal = useModalStore((state) => state.mostrarModal);
  const mostrarConfirmacao = useModalStore((state) => state.mostrarConfirmacao);

  // Controle de Navegação
  const [activeTab, setActiveTab] = useState<'usuarios' | 'queixas'>('usuarios');

  // Estados: Usuários
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
  const [criandoUsuario, setCriandoUsuario] = useState(false);

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
    if (criandoUsuario) return; // trava de duplo clique
    setCriandoUsuario(true);
    try {
      const response = await api.post('/admin/usuarios', {
        nome: nomeUsuario, senha: senhaUsuario, role: roleUsuario
      });
      const credencial = response.data?.usuario?.usuario;
      setNomeUsuario(''); setSenhaUsuario(''); setRoleUsuario('PA');
      carregarDados();
      mostrarModal('sucesso', 'Utilizador Criado', `Credencial de acesso: ${credencial || '(verifique na tabela)'}\n\nLembre o colaborador que ele deverá trocar a senha no primeiro acesso.`);
    } catch (error: any) {
      mostrarModal('erro', 'Falha ao Criar Acesso', error.response?.data?.erro || 'Erro estrutural ao criar utilizador.');
    } finally {
      setCriandoUsuario(false);
    }
  };

  const handleRedefinirSenha = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usuarioResetId) return;
    try {
      await api.put(`/admin/usuarios/${usuarioResetId}/senha`, { novaSenha: novaSenhaReset });
      setUsuarioResetId(''); setNovaSenhaReset('');
      mostrarModal('sucesso', 'Senha Redefinida', 'O colaborador deverá definir uma nova senha no próximo login.');
    } catch (error: any) {
      mostrarModal('erro', 'Falha na Redefinição', error.response?.data?.erro || 'Não foi possível redefinir a senha.');
    }
  };

  const handleAlternarStatus = (id: number, statusAtual: boolean) => {
    const acao = statusAtual ? 'desativar' : 'reativar';
    mostrarConfirmacao(
      statusAtual ? 'Desativar Acesso' : 'Reativar Acesso',
      `Tem certeza que deseja ${acao} este acesso corporativo?`,
      async () => {
        try {
          await api.put(`/admin/usuarios/${id}/status`);
          carregarDados();
        } catch (error: any) {
          mostrarModal('erro', 'Falha ao Alterar Status', error.response?.data?.erro || 'Não foi possível alterar o status do utilizador.');
        }
      }
    );
  };

  // Funções de Gestão de Queixas
  const handleAdicionarQueixa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!medicoSelecionado || !novaQueixaTexto) return;

    // Evita vincular a mesma queixa duas vezes ao mesmo médico
    const jaExiste = queixas.some(q =>
      (q.medico_nome || '').trim().toUpperCase() === medicoSelecionado.trim().toUpperCase() &&
      (q.queixa || '').trim().toLowerCase() === novaQueixaTexto.trim().toLowerCase()
    );
    if (jaExiste) {
      return mostrarModal('aviso', 'Queixa Duplicada', 'Esta queixa já está vinculada a este médico.');
    }

    try {
      await api.post('/admin/queixas', {
        medico_nome: medicoSelecionado,
        queixa: novaQueixaTexto
      });
      setMedicoSelecionado('');
      setNovaQueixaTexto('');
      carregarDados();
    } catch (error: any) {
      mostrarModal('erro', 'Falha ao Vincular', error.response?.data?.erro || 'Não foi possível registrar o vínculo clínico.');
    }
  };

  const handleRemoverQueixa = (id: number) => {
    mostrarConfirmacao(
      'Remover Queixa',
      'Confirma a remoção desta queixa para o profissional selecionado?',
      async () => {
        try {
          await api.delete(`/admin/queixas/${id}`);
          setQueixas(queixas.filter(q => q.id !== id));
        } catch (error: any) {
          mostrarModal('erro', 'Falha ao Remover', error.response?.data?.erro || 'Não foi possível remover o registro.');
        }
      }
    );
  };

  // Filtros
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
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans text-slate-900">

      {/* ===== HEADER ===== */}
      <header className="bg-white border-b border-slate-200 px-6 py-3.5 flex justify-between items-center sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-lg">
            <ShieldCheck className="text-white w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-800 leading-tight">Administração</h1>
            <p className="text-xs text-slate-500">Acessos e taxonomia clínica</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2.5 pr-3 border-r border-slate-200">
            <Avatar nome={user?.nome || 'A'} />
            <div className="leading-tight">
              <p className="text-sm font-semibold text-slate-700">{user?.nome || 'Administrador'}</p>
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

      {loading ? (
        <main className="flex-1 flex flex-col items-center justify-center p-10 gap-3">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
          <p className="text-slate-500 text-sm">Sincronizando dados locais e Oracle MV...</p>
        </main>
      ) : (
        <main className="flex-1 p-4 md:p-6 max-w-6xl mx-auto w-full space-y-6 fade-in">

          {/* ===== TABS ===== */}
          <div className="inline-flex flex-wrap bg-slate-200/70 p-1 rounded-xl gap-1">
            <TabButton
              ativa={activeTab === 'usuarios'}
              onClick={() => setActiveTab('usuarios')}
              icone={<Users className="w-4 h-4" />}
              label="Controle de Acessos"
            />
            <TabButton
              ativa={activeTab === 'queixas'}
              onClick={() => setActiveTab('queixas')}
              icone={<Stethoscope className="w-4 h-4" />}
              label="Queixas Clínicas"
            />
          </div>

          {/* ===== ABA: USUÁRIOS ===== */}
          {activeTab === 'usuarios' && (
            <div className="space-y-6 fade-in">
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">

                {/* Novo acesso */}
                <section className="lg:col-span-3 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  <CardHeader icone={<UserPlus className="w-4 h-4" />} titulo="Novo Acesso" />
                  <form onSubmit={handleCriarUsuario} className="p-6 space-y-5">

                    <div className="bg-blue-50 border border-blue-100 text-blue-800 p-3 rounded-lg flex gap-2.5 items-start text-xs">
                      <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                      <p>A credencial é gerada automaticamente no padrão <strong>nome.sobrenome</strong>. A troca de senha será exigida no primeiro acesso.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="md:col-span-2">
                        <InputGroup label="Nome Completo" icon={<User className="w-3.5 h-3.5" />}>
                          <input type="text" required value={nomeUsuario} onChange={e => setNomeUsuario(e.target.value)} className="form-input-custom" placeholder="Ex: Rhuan Vinicius Martins" />
                        </InputGroup>
                      </div>
                      <div className="md:col-span-1">
                        <InputGroup label="Nível de Acesso" icon={<LayoutDashboard className="w-3.5 h-3.5" />}>
                          <select value={roleUsuario} onChange={e => setRoleUsuario(e.target.value)} className="form-input-custom">
                            <option value="PA">Operador PA</option>
                            <option value="SECRETARIA">Secretaria</option>
                            <option value="SUPERVISAO">Supervisão</option>
                            <option value="ADMIN">Administrador TI</option>
                          </select>
                        </InputGroup>
                      </div>
                    </div>

                    <InputGroup label="Senha Provisória (mín. 6 caracteres)" icon={<Lock className="w-3.5 h-3.5" />}>
                      <input type="password" required minLength={6} value={senhaUsuario} onChange={e => setSenhaUsuario(e.target.value)} className="form-input-custom" placeholder="Será exigida a troca no primeiro acesso" />
                    </InputGroup>

                    <button
                      type="submit"
                      disabled={criandoUsuario}
                      className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-sm font-semibold py-2.5 rounded-lg transition-colors"
                    >
                      {criandoUsuario ? 'Criando...' : 'Criar Acesso'}
                    </button>
                  </form>
                </section>

                {/* Redefinição de senha */}
                <section className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  <CardHeader icone={<KeyRound className="w-4 h-4" />} titulo="Redefinir Senha" tom="amber" />
                  <form onSubmit={handleRedefinirSenha} className="p-6 space-y-5">
                    <InputGroup label="Colaborador" icon={<Users className="w-3.5 h-3.5" />}>
                      <select value={usuarioResetId} onChange={e => setUsuarioResetId(e.target.value)} className="form-input-custom">
                        <option value="">Escolha um colaborador...</option>
                        {usuarios.map(u => <option key={u.id} value={u.id}>{u.nome} ({u.role})</option>)}
                      </select>
                    </InputGroup>
                    <InputGroup label="Nova Senha Provisória" icon={<Lock className="w-3.5 h-3.5" />}>
                      <input type="password" required minLength={6} value={novaSenhaReset} onChange={e => setNovaSenhaReset(e.target.value)} className="form-input-custom" placeholder="Mínimo 6 caracteres" />
                    </InputGroup>
                    <p className="text-xs text-slate-400">O colaborador será obrigado a definir uma nova senha no próximo login.</p>
                    <button type="submit" className="w-full bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors">
                      Redefinir Senha
                    </button>
                  </form>
                </section>
              </div>

              {/* Tabela de colaboradores */}
              <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap gap-3 justify-between items-center">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-slate-800">Colaboradores</h2>
                    <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{usuariosFiltrados.length}</span>
                  </div>
                  <div className="relative w-full sm:w-64">
                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Buscar por nome ou credencial..."
                      value={filtroUsuario}
                      onChange={e => setFiltroUsuario(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-400 focus:bg-white transition-colors"
                    />
                  </div>
                </div>
                <div className="overflow-x-auto max-h-[560px] overflow-y-auto">
                  <table className="w-full text-left border-collapse relative">
                    <thead className="sticky top-0 bg-slate-50 z-10">
                      <tr className="text-slate-500 text-xs border-b border-slate-200">
                        <th className="px-6 py-3 font-semibold">Colaborador</th>
                        <th className="px-6 py-3 font-semibold">Credencial</th>
                        <th className="px-6 py-3 font-semibold">Nível</th>
                        <th className="px-6 py-3 font-semibold">Status</th>
                        <th className="px-6 py-3 font-semibold text-right">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {usuariosFiltrados.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-6 py-10 text-center text-sm text-slate-400">Nenhum colaborador encontrado.</td>
                        </tr>
                      ) : (
                        usuariosFiltrados.map((usr: any) => (
                          <tr key={usr.id} className={`transition-colors ${!usr.ativo ? 'bg-slate-50/60 opacity-60' : 'hover:bg-slate-50'}`}>
                            <td className="px-6 py-3">
                              <div className="flex items-center gap-3">
                                <Avatar nome={usr.nome} />
                                <span className="font-medium text-sm text-slate-800">{usr.nome}</span>
                              </div>
                            </td>
                            <td className="px-6 py-3 text-slate-500 font-mono text-xs">{usr.usuario}</td>
                            <td className="px-6 py-3"><RoleBadge role={usr.role} /></td>
                            <td className="px-6 py-3">
                              <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${usr.ativo ? 'text-emerald-600' : 'text-slate-400'}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${usr.ativo ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                                {usr.ativo ? 'Ativo' : 'Inativo'}
                              </span>
                            </td>
                            <td className="px-6 py-3 text-right">
                              {String(usr.id) === String(user?.id) ? (
                                <span className="text-xs font-medium text-slate-400" title="Não é possível desativar o próprio acesso">
                                  Sessão atual
                                </span>
                              ) : (
                                <button
                                  onClick={() => handleAlternarStatus(usr.id, usr.ativo)}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${
                                    usr.ativo
                                      ? 'text-red-600 border-red-200 hover:bg-red-50'
                                      : 'text-emerald-600 border-emerald-200 hover:bg-emerald-50'
                                  }`}
                                >
                                  {usr.ativo ? 'Desativar' : 'Reativar'}
                                </button>
                              )}
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

          {/* ===== ABA: QUEIXAS ===== */}
          {activeTab === 'queixas' && (
            <div className="space-y-6 fade-in">
              <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <CardHeader icone={<Stethoscope className="w-4 h-4" />} titulo="Vincular Queixa a Médico" />
                <form onSubmit={handleAdicionarQueixa} className="p-6 flex flex-col md:flex-row md:items-end gap-4">
                  <div className="flex-1">
                    <InputGroup label="Médico (Base Oracle)" icon={<User className="w-3.5 h-3.5" />}>
                      <select
                        required
                        value={medicoSelecionado}
                        onChange={e => setMedicoSelecionado(e.target.value)}
                        className="form-input-custom"
                      >
                        <option value="">Selecione o profissional...</option>
                        {medicosOracle.map(m => (
                          <option key={m.id} value={m.nome}>{m.nome}</option>
                        ))}
                      </select>
                    </InputGroup>
                  </div>
                  <div className="flex-1">
                    <InputGroup label="Queixa" icon={<Stethoscope className="w-3.5 h-3.5" />}>
                      <input
                        type="text"
                        required
                        placeholder="Ex: Epistaxe, Zumbido..."
                        value={novaQueixaTexto}
                        onChange={e => setNovaQueixaTexto(e.target.value)}
                        className="form-input-custom"
                      />
                    </InputGroup>
                  </div>
                  <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-6 py-2.5 rounded-lg transition-colors md:mb-0 w-full md:w-auto">
                    Vincular
                  </button>
                </form>
              </section>

              <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap gap-3 justify-between items-center">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-slate-800">Queixas Vinculadas</h2>
                    <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{queixasFiltradas.length}</span>
                  </div>
                  <div className="relative w-full sm:w-64">
                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Buscar por médico ou queixa..."
                      value={filtroQueixa}
                      onChange={e => setFiltroQueixa(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-400 focus:bg-white transition-colors"
                    />
                  </div>
                </div>
                <div className="overflow-x-auto max-h-[560px] overflow-y-auto">
                  <table className="w-full text-left border-collapse relative">
                    <thead className="sticky top-0 bg-slate-50 z-10">
                      <tr className="text-slate-500 text-xs border-b border-slate-200">
                        <th className="px-6 py-3 font-semibold">Profissional</th>
                        <th className="px-6 py-3 font-semibold">Queixa</th>
                        <th className="px-6 py-3 font-semibold text-right">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {queixasFiltradas.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-6 py-10 text-center text-sm text-slate-400">Nenhum registro correspondente.</td>
                        </tr>
                      ) : (
                        queixasFiltradas.map((q: any) => (
                          <tr key={q.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-6 py-3 font-medium text-sm text-slate-800">{q.medico_nome}</td>
                            <td className="px-6 py-3">
                              <span className="inline-flex px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 text-xs font-medium">
                                {q.queixa}
                              </span>
                            </td>
                            <td className="px-6 py-3 text-right">
                              <button
                                onClick={() => handleRemoverQueixa(q.id)}
                                className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
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
          padding: 0.625rem 0.875rem;
          background-color: #ffffff;
          border: 1px solid #cbd5e1;
          border-radius: 0.5rem;
          outline: none;
          transition: border-color .15s ease, box-shadow .15s ease;
          font-size: 0.875rem;
          color: #0f172a;
        }
        .form-input-custom::placeholder { color: #94a3b8; }
        .form-input-custom:focus {
          border-color: #2563eb;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
        }
        .fade-in { animation: fadeIn 0.25s ease-out; }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}} />
    </div>
  );
}

// ================= COMPONENTES AUXILIARES =================

function TabButton({ ativa, onClick, icone, label }: any) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-semibold rounded-lg flex items-center gap-2 transition-all ${
        ativa ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
      }`}
    >
      {icone} {label}
    </button>
  );
}

function CardHeader({ icone, titulo, tom = 'blue' }: any) {
  const tons: any = {
    blue: 'bg-blue-50 text-blue-600',
    amber: 'bg-amber-50 text-amber-600'
  };
  return (
    <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-2.5">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${tons[tom]}`}>
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

function RoleBadge({ role }: { role: string }) {
  const r = String(role || '').toLowerCase();
  const estilos: Record<string, string> = {
    admin: 'bg-violet-50 text-violet-700 border-violet-200',
    supervisao: 'bg-purple-50 text-purple-700 border-purple-200',
    secretaria: 'bg-sky-50 text-sky-700 border-sky-200',
    pa: 'bg-emerald-50 text-emerald-700 border-emerald-200'
  };
  const rotulos: Record<string, string> = {
    admin: 'Admin TI',
    supervisao: 'Supervisão',
    secretaria: 'Secretaria',
    pa: 'Operador PA'
  };
  return (
    <span className={`inline-flex px-2.5 py-1 rounded-md border text-xs font-medium ${estilos[r] || 'bg-slate-50 text-slate-600 border-slate-200'}`}>
      {rotulos[r] || role}
    </span>
  );
}

function InputGroup({ label, icon, children }: any) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
        {icon} {label}
      </label>
      {children}
    </div>
  );
}
