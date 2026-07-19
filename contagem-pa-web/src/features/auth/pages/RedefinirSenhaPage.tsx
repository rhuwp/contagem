import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../../lib/axios';
import { useModalStore } from '../../../app/store/modalStore';
import { ShieldAlert } from 'lucide-react';

export default function RedefinirSenhaPage() {
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [erro, setErro] = useState('');
  const [loading, setLoading] = useState(false);
  
  const navigate = useNavigate();
  const mostrarModal = useModalStore((state) => state.mostrarModal);

  const handleRedefinir = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro('');

    if (novaSenha !== confirmarSenha) {
      setErro('As senhas não coincidem.');
      return;
    }

    if (novaSenha.length < 6) {
      setErro('A senha deve ter pelo menos 6 caracteres.');
      return;
    }

    setLoading(true);

    try {
      // O backend identifica o usuário pelo token JWT (não enviamos o id)
      await api.post('/auth/redefinir-senha-inicial', { novaSenha });

      mostrarModal('sucesso', 'Senha Atualizada', 'Faça login novamente com a sua nova credencial.');
      navigate('/'); // Volta para a tela de login
      
    } catch (err: any) {
      setErro(err.response?.data?.erro || 'Erro ao processar a requisição.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-200 p-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 animate-in fade-in zoom-in duration-300">
        
        <div className="flex flex-col items-center mb-8">
          <div className="bg-amber-100 p-3 rounded-full mb-4 shadow-sm">
            <ShieldAlert className="text-amber-600 w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800 text-center">Ação Necessária</h1>
          <p className="text-slate-500 text-sm mt-2 text-center">
            Este é o seu primeiro acesso ao sistema Contagem PA. Por motivos de segurança, você deve definir uma senha pessoal e intransferível.
          </p>
        </div>

        {erro && (
          <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-6 border border-red-200 text-center font-medium">
            {erro}
          </div>
        )}

        <form onSubmit={handleRedefinir} className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">Nova Senha</label>
            <input
              type="password"
              required
              value={novaSenha}
              onChange={(e) => setNovaSenha(e.target.value)}
              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none transition-all bg-slate-50 focus:bg-white"
              placeholder="Digite sua nova senha"
            />
          </div>
          
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">Confirmar Senha</label>
            <input
              type="password"
              required
              value={confirmarSenha}
              onChange={(e) => setConfirmarSenha(e.target.value)}
              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none transition-all bg-slate-50 focus:bg-white"
              placeholder="Digite novamente"
            />
          </div>
          
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-3.5 px-4 rounded-lg transition-all disabled:opacity-50 mt-6 shadow-md"
          >
            {loading ? 'Salvando credenciais...' : 'Salvar e Continuar'}
          </button>
        </form>
      </div>
    </div>
  );
}