import { create } from 'zustand';

export type TipoModal = 'sucesso' | 'erro' | 'aviso';

interface ModalState {
  aberto: boolean;
  tipo: TipoModal;
  titulo: string;
  mensagem: string;
  // Quando definido, o modal vira uma confirmação com botões Confirmar/Cancelar
  onConfirmar: (() => void) | null;
  mostrarModal: (tipo: TipoModal, titulo: string, mensagem: string) => void;
  mostrarConfirmacao: (titulo: string, mensagem: string, onConfirmar: () => void) => void;
  fecharModal: () => void;
}

export const useModalStore = create<ModalState>((set) => ({
  aberto: false,
  tipo: 'aviso',
  titulo: '',
  mensagem: '',
  onConfirmar: null,
  mostrarModal: (tipo, titulo, mensagem) => set({ aberto: true, tipo, titulo, mensagem, onConfirmar: null }),
  mostrarConfirmacao: (titulo, mensagem, onConfirmar) => set({ aberto: true, tipo: 'aviso', titulo, mensagem, onConfirmar }),
  fecharModal: () => set({ aberto: false, onConfirmar: null }),
}));
