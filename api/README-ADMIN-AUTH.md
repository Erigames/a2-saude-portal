# API admin-auth – Excluir usuário e alterar e-mail no Firebase Auth

Esta API usa o **Firebase Admin SDK** para:

- **Excluir usuário**: remove do **Firebase Authentication** e do **Firestore** (coleção `users`).
- **Alterar e-mail**: atualiza o e-mail no **Authentication** e no **Firestore**.

## 1. Instalar dependências

Na raiz do projeto:

```bash
npm install
```

## 2. Conta de serviço do Firebase

1. Acesse [Firebase Console](https://console.firebase.google.com) → seu projeto.
2. **Configurações do projeto** (ícone de engrenagem) → **Contas de serviço**.
3. Clique em **Gerar nova chave privada** e baixe o JSON.

## 3. Variável de ambiente na Vercel

1. Vercel → seu projeto → **Settings** → **Environment Variables**.
2. Crie a variável:
   - **Name**: `FIREBASE_SERVICE_ACCOUNT`
   - **Value**: cole o **conteúdo completo do JSON** da chave (uma única linha).
3. Salve e faça um novo deploy.

## 4. Testar localmente

```bash
npx vercel dev
```

Acesse o site e use o painel do gerente. Exclusão e alteração de e-mail passam pela API e atualizam Authentication + Firestore.

## 5. Rotas

- **POST** `/api/admin-auth`
- Body (JSON):
  - Excluir: `{ "action": "deleteUser", "uid": "<uid>" }`
  - Alterar e-mail: `{ "action": "updateEmail", "uid": "<uid>", "newEmail": "novo@email.com" }`
