/**
 * API serverless (Vercel) - Acessa Google Sheets privada com autenticação
 * 
 * Variáveis de ambiente na Vercel:
 * - GOOGLE_SERVICE_ACCOUNT: JSON da conta de serviço do Google (Google Cloud Console > IAM & Admin > Service Accounts)
 * - SHEET_ID: ID da planilha (opcional, pode ser passado no body)
 * 
 * Como obter as credenciais:
 * 1. Acesse Google Cloud Console (https://console.cloud.google.com)
 * 2. Crie um projeto ou selecione um existente
 * 3. Vá em "IAM & Admin" > "Service Accounts"
 * 4. Crie uma nova conta de serviço ou use uma existente
 * 5. Gere uma chave JSON e adicione como variável de ambiente GOOGLE_SERVICE_ACCOUNT na Vercel
 * 6. Compartilhe a planilha com o e-mail da conta de serviço (dar permissão de "Visualizador")
 */

import { google } from 'googleapis';
import admin from 'firebase-admin';

// Inicializa Firebase Admin se ainda não estiver inicializado
function getFirebaseAdmin() {
    if (admin.apps.length) return admin.app();
    const cred = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!cred) throw new Error('FIREBASE_SERVICE_ACCOUNT não configurada');
    const serviceAccount = typeof cred === 'string' ? JSON.parse(cred) : cred;
    return admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

// Inicializa Google Sheets API
function getGoogleSheets() {
    const serviceAccountCred = process.env.GOOGLE_SERVICE_ACCOUNT;
    if (!serviceAccountCred) {
        throw new Error('GOOGLE_SERVICE_ACCOUNT não configurada');
    }
    
    const serviceAccount = typeof serviceAccountCred === 'string' 
        ? JSON.parse(serviceAccountCred) 
        : serviceAccountCred;
    
    const auth = new google.auth.GoogleAuth({
        credentials: {
            client_email: serviceAccount.client_email,
            private_key: serviceAccount.private_key,
        },
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    
    return google.sheets({ version: 'v4', auth });
}

// Verifica se o e-mail do usuário está autorizado
// Opção 1: Verifica se o e-mail está em uma coluna específica da planilha
// Opção 2: Lista de e-mails autorizados (pode ser configurada via variável de ambiente)
async function isEmailAuthorized(userEmail, sheets, sheetId) {
    // Opção 1: Lista de e-mails autorizados via variável de ambiente (mais simples)
    const authorizedEmailsEnv = process.env.AUTHORIZED_EMAILS;
    if (authorizedEmailsEnv) {
        const authorizedEmails = authorizedEmailsEnv.split(',').map(e => e.trim().toLowerCase());
        if (authorizedEmails.includes(userEmail.toLowerCase())) {
            return true;
        }
    }
    
    // Opção 2: Verifica se o e-mail está em uma coluna específica da planilha
    // Por padrão, procura em uma coluna chamada "Email" ou "E-mail" na primeira aba
    try {
        const sheetName = process.env.SHEET_EMAIL_COLUMN_TAB || 'Dados';
        const emailColumnName = process.env.SHEET_EMAIL_COLUMN || 'Email';
        
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: sheetId,
            range: `${sheetName}!A:Z`, // Lê algumas colunas para encontrar a coluna de e-mail
        });
        
        const rows = response.data.values;
        if (!rows || rows.length === 0) {
            return false;
        }
        
        // Encontra a coluna de e-mail no cabeçalho
        const headerRow = rows[0];
        const emailColumnIndex = headerRow.findIndex(
            col => col && (col.toLowerCase().includes('email') || col.toLowerCase().includes('e-mail'))
        );
        
        if (emailColumnIndex === -1) {
            // Se não encontrar coluna de e-mail, retorna false
            // Mas pode permitir se houver lista de e-mails autorizados
            return false;
        }
        
        // Verifica se o e-mail do usuário está na coluna
        for (let i = 1; i < rows.length; i++) {
            const emailInSheet = rows[i][emailColumnIndex];
            if (emailInSheet && emailInSheet.trim().toLowerCase() === userEmail.toLowerCase()) {
                return true;
            }
        }
        
        return false;
    } catch (error) {
        console.error('Erro ao verificar e-mail na planilha:', error);
        // Em caso de erro, retorna false por segurança
        return false;
    }
}

export default async function handler(req, res) {
    // Apenas aceita requisições POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método não permitido' });
    }

    try {
        const { idToken, sheetId, sheetTab } = req.body;
        
        if (!idToken) {
            return res.status(401).json({ error: 'Token de autenticação não fornecido' });
        }
        
        const finalSheetId = sheetId || process.env.SHEET_ID || '1iqSIy7R1vyFizribGrO7QpF8W8u--zDUcAv0nDQ3N6s';
        
        // Verifica o token do Firebase
        const firebaseAdmin = getFirebaseAdmin();
        const decodedToken = await firebaseAdmin.auth().verifyIdToken(idToken);
        const userEmail = decodedToken.email;
        
        if (!userEmail) {
            return res.status(401).json({ error: 'E-mail não encontrado no token' });
        }
        
        // Inicializa Google Sheets API
        const sheets = getGoogleSheets();
        
        // Verifica se o e-mail está autorizado
        const isAuthorized = await isEmailAuthorized(userEmail, sheets, finalSheetId);
        
        if (!isAuthorized) {
            return res.status(403).json({ 
                error: 'Acesso negado. Seu e-mail não está autorizado para acessar esta planilha.' 
            });
        }
        
        // Determina qual aba usar
        const targetSheet = sheetTab || process.env.SHEET_DEFAULT_TAB || 'Dados';
        
        // Obtém os dados da planilha
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: finalSheetId,
            range: `${targetSheet}!A:Z`, // Ajuste o range conforme necessário
        });
        
        const rows = response.data.values;
        
        if (!rows || rows.length === 0) {
            return res.status(404).json({ error: 'Planilha vazia ou aba não encontrada' });
        }
        
        // Converte para CSV
        const csvContent = rows.map(row => {
            return row.map(cell => {
                const cellStr = (cell || '').toString();
                // Se contém vírgula, ponto e vírgula ou quebra de linha, envolve em aspas
                if (cellStr.includes(',') || cellStr.includes(';') || cellStr.includes('\n') || cellStr.includes('"')) {
                    const escaped = cellStr.replace(/"/g, '""');
                    return `"${escaped}"`;
                }
                return cellStr;
            }).join(',');
        }).join('\n');
        
        // Retorna o CSV
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.status(200).send(csvContent);
        
    } catch (error) {
        console.error('Erro ao acessar planilha:', error);
        
        if (error.code === 'auth/id-token-expired') {
            return res.status(401).json({ error: 'Token expirado. Faça login novamente.' });
        }
        
        if (error.code === 'auth/argument-error') {
            return res.status(401).json({ error: 'Token inválido.' });
        }
        
        if (error.message && error.message.includes('GOOGLE_SERVICE_ACCOUNT')) {
            return res.status(500).json({ 
                error: 'Configuração do servidor incompleta. Contate o administrador.' 
            });
        }
        
        return res.status(500).json({ 
            error: 'Erro ao acessar a planilha',
            message: error.message 
        });
    }
}
