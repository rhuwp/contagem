// =============================================================================
// SCRIPT DESATIVADO — NÃO USAR
//
// Este script de seed ficou obsoleto: referenciava a coluna "email" (que o
// esquema atual substituiu por "usuario") e criava usuários com senha padrão
// fraca — inaceitável em produção.
//
// O bootstrap correto do sistema é feito pelo setup_banco.sql (usuário
// admin.ti com troca de senha obrigatória) e os demais acessos são criados
// pelo painel de Administração.
//
// PODE APAGAR ESTE ARQUIVO. Ele foi mantido apenas porque a remoção
// automática não era permitida no ambiente de revisão.
// =============================================================================

console.error('Este script foi desativado. Use o setup_banco.sql e o painel Admin para criar usuários.');
process.exit(1);
