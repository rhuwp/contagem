import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './app/store/authStore';

// Importação das Páginas
import LoginPage from './features/auth/pages/LoginPage';
import RedefinirSenhaPage from './features/auth/pages/RedefinirSenhaPage'; // <- NOVA TELA AQUI
import SecretariaDashboard from './features/auth/pages/SecretariaDashboard';
import SupervisaoDashboard from './features/auth/pages/SupervisaoDashboard';
import PADashboard from './features/auth/pages/PADashboard';
import AdminDashboard from './features/auth/pages/AdminDashboard';

// Esse componente funciona como um "Segurança de Porta" no React
const RotaProtegida = ({ children, rolesPermitidas }: { children: React.ReactNode, rolesPermitidas: string[] }) => {
  const { isAuthenticated, user } = useAuthStore();

  // 1. Se não estiver logado, chuta de volta pro Login
  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  // 2. BLINDAGEM DE PRIMEIRO ACESSO: Se o usuário ainda não trocou a senha provisória, 
  // ele não pode acessar NENHUM dashboard. É forçado para a tela de redefinição.
  if (user.trocar_senha) {
    return <Navigate to="/redefinir-senha" state={{ usuarioId: user.id }} replace />;
  }

  // 3. Se estiver logado e com a senha em dia, mas não tiver a permissão correta (e não for admin), bloqueia
  if (!rolesPermitidas.includes(String(user.role).toLowerCase()) && String(user.role).toLowerCase() !== 'admin') {
    return <Navigate to="/login" replace />;
  }

  // Se passou em todos os testes, mostra a tela
  return children;
};

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Rotas de Autenticação */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/redefinir-senha" element={<RedefinirSenhaPage />} />

        {/* Rotas Protegidas (Dashboards) */}
        <Route path="/secretaria" element={
          <RotaProtegida rolesPermitidas={['secretaria']}>
            <SecretariaDashboard />
          </RotaProtegida>
        } />

        <Route path="/pa" element={
          <RotaProtegida rolesPermitidas={['pa']}>
            <PADashboard />
          </RotaProtegida>
        } />

        <Route path="/supervisao" element={
          <RotaProtegida rolesPermitidas={['supervisao']}>
            <SupervisaoDashboard />
          </RotaProtegida>
        } />

        <Route path="/admin" element={
          <RotaProtegida rolesPermitidas={['admin']}>
            <AdminDashboard />
          </RotaProtegida>
        } />

        {/* Fallback: Se tentar acessar a raiz (/) ou rota inexistente, manda pro login */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;