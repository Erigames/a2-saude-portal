/**
 * API serverless (Vercel) - Acessa Google Sheets privada com autenticação
 * 
 * Esta API verifica automaticamente se o e-mail do usuário logado tem permissão
 * para acessar a planilha através do gerenciamento de compartilhamento do Google Sheets.
 * Não é necessário manter listas de e-mails separadas - basta compartilhar a planilha
 * com os e-mails desejados no Google Sheets.
 * 
 * Variáveis de ambiente na Vercel:
 * - GOOGLE_SERVICE_ACCOUNT: JSON da conta de serviço do Google (Google Cloud Console > IAM & Admin > Service Accounts)
 * - FIREBASE_SERVICE_ACCOUNT: JSON da conta de serviço do Firebase (para verificar tokens)
 * - SHEET_ID: ID da planilha (opcional, pode ser passado no body)
 * 
 * Como obter as credenciais:
 * 1. Acesse Google Cloud Console (https://console.cloud.google.com)
 * 2. Crie um projeto ou selecione um existente
 * 3. Vá em "IAM & Admin" > "Service Accounts"
 * 4. Crie uma nova conta de serviço ou use uma existente
 * 5. Gere uma chave JSON e adicione como variável de ambiente GOOGLE_SERVICE_ACCOUNT na Vercel
 * 6. Compartilhe a planilha com o e-mail da conta de serviço (dar permissão de "Visualizador")
 * 7. Compartilhe a planilha com os e-mails dos usuários que devem ter acesso (gerenciamento normal do Google Sheets)
 */

import { google } from 'googleapis';
import admin from 'firebase-admin';

// Inicializa Firebase Admin (usa FIREBASE_SERVICE_ACCOUNT ou GOOGLE_SERVICE_ACCOUNT como fallback)
function getFirebaseAdmin() {
    if (admin.apps.length) return admin.app();
    const cred = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.GOOGLE_SERVICE_ACCOUNT;
    if (!cred) throw new Error('FIREBASE_SERVICE_ACCOUNT ou GOOGLE_SERVICE_ACCOUNT não configurada');
    const serviceAccount = typeof cred === 'string' ? JSON.parse(cred) : cred;
    return admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

// Inicializa Google Auth (usa GOOGLE_SERVICE_ACCOUNT ou FIREBASE_SERVICE_ACCOUNT como fallback)
function getGoogleAuth() {
    const serviceAccountCred = process.env.GOOGLE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!serviceAccountCred) {
        throw new Error('GOOGLE_SERVICE_ACCOUNT ou FIREBASE_SERVICE_ACCOUNT não configurada');
    }
    
    const serviceAccount = typeof serviceAccountCred === 'string' 
        ? JSON.parse(serviceAccountCred) 
        : serviceAccountCred;
    
    return new google.auth.GoogleAuth({
        credentials: {
            client_email: serviceAccount.client_email,
            private_key: serviceAccount.private_key,
        },
        scopes: [
            'https://www.googleapis.com/auth/spreadsheets.readonly',
            'https://www.googleapis.com/auth/drive.readonly'
        ],
    });
}

// Inicializa Google Sheets API
function getGoogleSheets() {
    const auth = getGoogleAuth();
    return google.sheets({ version: 'v4', auth });
}

// Inicializa Google Drive API
function getGoogleDrive() {
    const auth = getGoogleAuth();
    return google.drive({ version: 'v3', auth });
}

// Verifica se o e-mail do usuário está autorizado através das permissões do Google Sheets
// Verifica diretamente no gerenciamento de acesso da planilha (compartilhamento)
async function isEmailAuthorized(userEmail, drive, sheetId) {
    try {
        const permissionsResponse = await drive.permissions.list({
            fileId: sheetId,
            fields: 'permissions(id,type,emailAddress,role)',
            supportsAllDrives: true,
        });
        
        const permissions = permissionsResponse.data.permissions || [];
        const normalizedUserEmail = userEmail.toLowerCase().trim();
        
        for (const permission of permissions) {
            if (permission.type === 'user' && permission.emailAddress) {
                const permissionEmail = permission.emailAddress.toLowerCase().trim();
                if (permissionEmail === normalizedUserEmail) {
                    return true;
                }
            }
            if (permission.type === 'group' && permission.emailAddress) {
                const groupEmail = permission.emailAddress.toLowerCase().trim();
                if (groupEmail === normalizedUserEmail) {
                    return true;
                }
            }
        }
        
        return false;
    } catch (error) {
        const code = error.code ?? error.response?.status;
        const msg = error.message || error.response?.data?.error?.message || String(error);
        console.error('Erro ao verificar permissões da planilha:', { code, msg, sheetId });
        
        if (code === 403 || msg.toLowerCase().includes('insufficient') || msg.toLowerCase().includes('forbidden')) {
            throw new Error(
                'A conta de serviço não tem permissão para verificar as permissões da planilha. ' +
                'Ative a Drive API no Google Cloud, compartilhe a planilha com o e-mail da conta de serviço e verifique as variáveis de ambiente.'
            );
        }
        if (code === 404) {
            throw new Error('Planilha não encontrada. Verifique o SHEET_ID.');
        }
        
        throw new Error(`Falha ao verificar permissões: ${msg}`);
    }
}

function parseBody(req) {
    let body = req.body;
    if (typeof body === 'string') {
        try {
            return JSON.parse(body);
        } catch (e) {
            return null;
        }
    }
    if (Buffer.isBuffer && Buffer.isBuffer(body)) {
        try {
            return JSON.parse(body.toString('utf8'));
        } catch (e) {
            return null;
        }
    }
    return body && typeof body === 'object' ? body : {};
}

function getErrorMessage(error) {
    if (error.response?.data?.error?.message) {
        return error.response.data.error.message;
    }
    if (error.response?.data?.error_description) {
        return error.response.data.error_description;
    }
    if (error.message) return error.message;
    return String(error);
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método não permitido' });
    }

    try {
        const body = parseBody(req);
        if (!body || typeof body !== 'object') {
            return res.status(400).json({ error: 'Body JSON inválido' });
        }
        const { idToken, sheetId, sheetTab } = body;
        
        if (!idToken) {
            return res.status(401).json({ error: 'Token de autenticação não fornecido' });
        }
        
        const finalSheetId = sheetId || process.env.SHEET_ID || '1iqSIy7R1vyFizribGrO7QpF8W8u--zDUcAv0nDQ3N6s';
        
        const firebaseAdmin = getFirebaseAdmin();
        const decodedToken = await firebaseAdmin.auth().verifyIdToken(idToken);
        const userEmail = decodedToken.email;
        
        if (!userEmail) {
            return res.status(401).json({ error: 'E-mail não encontrado no token' });
        }
        
        const drive = getGoogleDrive();
        const isAuthorized = await isEmailAuthorized(userEmail, drive, finalSheetId);
        
        if (!isAuthorized) {
            return res.status(403).json({ 
                error: 'Acesso negado. Seu e-mail não tem permissão para acessar esta planilha. Verifique se você tem acesso à planilha no Google Sheets.' 
            });
        }
        
        const sheets = getGoogleSheets();
        const targetSheet = sheetTab || process.env.SHEET_DEFAULT_TAB || 'Dados';
        
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: finalSheetId,
            range: `${targetSheet}!A:Z`,
        });
        
        const rows = response.data.values;
        
        if (!rows || rows.length === 0) {
            return res.status(404).json({ error: 'Planilha vazia ou aba não encontrada' });
        }
        
        const csvContent = rows.map(row => {
            return row.map(cell => {
                const cellStr = (cell || '').toString();
                if (cellStr.includes(',') || cellStr.includes(';') || cellStr.includes('\n') || cellStr.includes('"')) {
                    const escaped = cellStr.replace(/"/g, '""');
                    return `"${escaped}"`;
                }
                return cellStr;
            }).join(',');
        }).join('\n');
        
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.status(200).send(csvContent);
        
    } catch (error) {
        const msg = getErrorMessage(error);
        console.error('Erro ao acessar planilha:', error);
        if (error.stack) console.error(error.stack);
        
        if (error.code === 'auth/id-token-expired') {
            return res.status(401).json({ error: 'Token expirado. Faça login novamente.' });
        }
        if (error.code === 'auth/argument-error') {
            return res.status(401).json({ error: 'Token inválido.' });
        }
        if (error.message && error.message.includes('GOOGLE_SERVICE_ACCOUNT')) {
            return res.status(500).json({ 
                error: 'GOOGLE_SERVICE_ACCOUNT não configurada ou inválida.',
                message: msg 
            });
        }
        if (error.message && error.message.includes('FIREBASE_SERVICE_ACCOUNT')) {
            return res.status(500).json({ 
                error: 'FIREBASE_SERVICE_ACCOUNT não configurada ou inválida.',
                message: msg 
            });
        }
        
        return res.status(500).json({ 
            error: 'Erro ao acessar a planilha',
            message: msg 
        });
    }
}
