# Contagem PA

Sistema de contagem para Pronto Atendimento (PA) com dashboard administrativo, supervisão de filas e gerenciamento de usuários.

## 📁 Estrutura do Projeto

```
contagem-pa/
├── contagem-pa-api/      # Backend (Node.js + Express)
├── contagem-pa-web/      # Frontend (React + TypeScript + Vite)
└── README.md
```

## 🚀 Quick Start

### Backend
```bash
cd contagem-pa-api
cp .env.example .env
npm install
npm run dev
```

### Frontend
```bash
cd contagem-pa-web
npm install
npm run dev
```

## 📋 Requisitos

- Node.js 18+
- PostgreSQL
- Oracle Database (para Supervisão)

## 🔧 Configuração

### API
1. Copie `.env.example` para `.env`
2. Configure suas credenciais PostgreSQL e Oracle
3. Execute `npm run dev`

### Web
1. Certifique-se que a API está rodando em `http://localhost:3333`
2. Execute `npm run dev`
3. Acesse `http://localhost:5173`

## 📝 Recursos

- **Admin Dashboard** - Gerenciamento de usuários e sistema
- **PA Dashboard** - Visualização de contagem em tempo real
- **Supervisão Dashboard** - Monitoramento de filas (Oracle)
- **Autenticação JWT** - Login com roles (admin, pa, supervisao, secretaria)

## 📦 Tecnologias

**Backend:**
- Express.js
- PostgreSQL + OracleDB
- JWT + bcrypt

**Frontend:**
- React 19
- TypeScript
- Tailwind CSS
- Zustand (state management)
