import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../../lib/axios';
import { useAuthStore } from '../../../app/store/authStore';
import { useModalStore } from '../../../app/store/modalStore';
import { Lock } from 'lucide-react';

export default function LoginPage() {
  const [usuario, setUsuario] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [loading, setLoading] = useState(false);
  
  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);
  const mostrarModal = useModalStore((state) => state.mostrarModal);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault(); // Evita que a página recarregue
    setErro('');
    setLoading(true);

    try {
      // Faz o POST para o nosso Node.js com a chave "usuario"
      const response = await api.post('/auth/login', { usuario, senha });
      const { token, usuario: dadosUsuario } = response.data;

      // Salva no Zustand e no LocalStorage (necessário para a requisição de troca de senha funcionar)
      login(dadosUsuario, token);

      // 1. VERIFICAÇÃO DE PRIMEIRO ACESSO (Obriga a trocar a senha)
      if (dadosUsuario.trocar_senha) {
        mostrarModal('aviso', 'Primeiro Acesso', 'Por segurança, você deve alterar a senha provisória antes de continuar.');
        navigate('/redefinir-senha');
        return; // Para a execução aqui para não redirecionar para a dashboard ainda
      }

      // 2. NORMALIZAÇÃO DA ROLE (Garante que "SECRETARIA" e "secretaria" funcionem igual)
      const roleNormalizada = String(dadosUsuario.role).toLowerCase();

      // Redireciona a pessoa para a tela certa dependendo do Cargo (Role)
      if (roleNormalizada === 'secretaria') navigate('/secretaria');
      else if (roleNormalizada === 'pa') navigate('/pa');
      else if (roleNormalizada === 'supervisao') navigate('/supervisao');
      else if (roleNormalizada === 'admin') navigate('/admin');
      else navigate('/');
      
    } catch (err: any) {
      // Se o backend retornar erro (senha errada, etc), mostramos na tela
      setErro(err.response?.data?.erro || 'Erro ao conectar, verifique suas credenciais.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-200 p-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8">
        
        {/* Cabeçalho */}
        <div className="flex flex-col items-center mb-8">
          <div className="bg-blue-600 p-3 rounded-full mb-4 shadow-sm">
            <Lock className="text-white w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Contagem PA</h1>
          <p className="text-slate-500 text-sm mt-1">Acesso ao Sistema</p>
        </div>

        {/* Mensagem de Erro */}
        {erro && (
          <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-6 border border-red-200 text-center font-medium">
            {erro}
          </div>
        )}

        {/* Formulário */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">
            (Usuário)
            </label>
            <input
              type="text"
              required
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-all bg-slate-50 focus:bg-white"
              placeholder="ex: rhuan.martins"
            />
          </div>
          
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">
              Senha
            </label>
            <input
              type="password"
              required
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-all bg-slate-50 focus:bg-white"
              placeholder="••••••••"
            />
          </div>
          
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 px-4 rounded-lg transition-all disabled:opacity-50 mt-6 shadow-md hover:shadow-lg"
          >
            {loading ? 'Autenticando...' : 'Entrar no Sistema'}
          </button>
        </form>

        {/* Dica para os testes (Ajustada para o novo formato) */}
        <div className="mt-8 pt-6 border-t border-slate-100 text-center text-xs text-slate-400">
          <p className="font-bold mb-1">Nota sobre Credenciais Antigas:</p>
          <p>ntigas de teste (ex: admin@ipo.com.br)</p>
          <p className="mt-2 font-bold text-slate-500">Para contas novas: nome.sobrenome</p>
        </div>
      </div>
    </div>
  );
}