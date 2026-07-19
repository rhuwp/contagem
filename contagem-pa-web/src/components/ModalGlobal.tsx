import { useEffect } from 'react';
import { CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { useModalStore } from '../app/store/modalStore';

// Modal único da aplicação: montado no App, acionado de qualquer página
// via useModalStore.mostrarModal(tipo, titulo, mensagem)
export default function ModalGlobal() {
  const { aberto, tipo, titulo, mensagem, onConfirmar, fecharModal } = useModalStore();

  // Fecha com a tecla Esc
  useEffect(() => {
    if (!aberto) return;
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') fecharModal(); };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [aberto, fecharModal]);

  if (!aberto) return null;

  const config = {
    sucesso: {
      icone: <CheckCircle className="w-7 h-7 text-emerald-500" />,
      bolha: 'bg-emerald-50',
      botao: 'bg-emerald-600 hover:bg-emerald-700'
    },
    erro: {
      icone: <XCircle className="w-7 h-7 text-red-500" />,
      bolha: 'bg-red-50',
      botao: 'bg-red-600 hover:bg-red-700'
    },
    aviso: {
      icone: <AlertTriangle className="w-7 h-7 text-amber-500" />,
      bolha: 'bg-amber-50',
      botao: 'bg-slate-800 hover:bg-slate-900'
    }
  }[tipo];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50"
      onClick={fecharModal}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={e => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 text-center animate-modal"
      >
        <div className={`w-14 h-14 rounded-full ${config.bolha} flex items-center justify-center mx-auto mb-4`}>
          {config.icone}
        </div>
        <h2 className="text-lg font-bold text-slate-800 mb-2">{titulo}</h2>
        <p className="text-sm text-slate-500 whitespace-pre-line mb-6">{mensagem}</p>

        {onConfirmar ? (
          <div className="flex gap-3">
            <button
              onClick={fecharModal}
              className="flex-1 bg-white border border-slate-300 text-slate-600 hover:bg-slate-50 text-sm font-semibold py-2.5 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={() => { fecharModal(); onConfirmar(); }}
              autoFocus
              className="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors"
            >
              Confirmar
            </button>
          </div>
        ) : (
          <button
            onClick={fecharModal}
            autoFocus
            className={`w-full text-white text-sm font-semibold py-2.5 rounded-lg transition-colors ${config.botao}`}
          >
            Entendido
          </button>
        )}
      </div>
      <style>{`
        .animate-modal { animation: modalIn .18s ease-out; }
        @keyframes modalIn {
          from { opacity: 0; transform: scale(.95) translateY(8px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
}
