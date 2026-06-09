require('dotenv').config();
const pool = require('../config/databasePg');
const bcrypt = require('bcrypt');

async function popularBanco() {
  console.log('Iniciando a criação de usuários de teste...');

  try {
    const salt = await bcrypt.genSalt(10);
    // Todos os usuários terão a senha "123456" para facilitar os testes
    const senhaHash = await bcrypt.hash('123456', salt); 

    const usuarios = [
      { nome: 'Administrador TI', email: 'admin@ipo.com.br', role: 'admin' },
      { nome: 'Secretaria Unimed', email: 'secretaria@ipo.com.br', role: 'secretaria' },
      { nome: 'Painel PA', email: 'pa@ipo.com.br', role: 'pa' },
      { nome: 'Supervisão Geral', email: 'supervisao@ipo.com.br', role: 'supervisao' }
    ];

    // 1. Cria os usuários (O ON CONFLICT evita que o banco dê erro se você rodar o script duas vezes)
    for (const u of usuarios) {
      await pool.query(
        `INSERT INTO usuarios (nome, email, senha_hash, role) 
         VALUES ($1, $2, $3, $4) 
         ON CONFLICT (email) DO NOTHING`,
        [u.nome, u.email, senhaHash, u.role]
      );
      console.log(` Usuário criado: ${u.email} (Perfil: ${u.role})`);
    }

    // 2. Cria um Médico de teste
    await pool.query(`
      INSERT INTO medicos (nome, crm, idade_minima, idade_maxima, cooperado) 
      VALUES ('Dr. Rafael Teste', '12345-PR', 0, 120, true) 
      ON CONFLICT (crm) DO NOTHING
    `);
    console.log(' Médico de teste "Dr. Rafael" criado com sucesso.');

    console.log('\n Banco de dados inicializado e pronto para uso!');
    process.exit(0);

  } catch (erro) {
    console.error(' Erro ao criar usuários:', erro);
    process.exit(1);
  }
}

popularBanco();