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

// Inicializa Firebase Admin se ainda não estiver inicializado
function getFirebaseAdmin() {
    if (admin.apps.length) return admin.app();
    const cred = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!cred) throw new Error('FIREBASE_SERVICE_ACCOUNT não configurada');
    const serviceAccount = typeof cred === 'string' ? JSON.parse(cred) : cred;
    return admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

// Inicializa Google Auth (compartilhado entre Sheets e Drive)
function getGoogleAuth() {
    const serviceAccountCred = process.env.GOOGLE_SERVICE_ACCOUNT;
    if (!serviceAccountCred) {
        throw new Error('GOOGLE_SERVICE_ACCOUNT não configurada');
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
        // Lista todas as permissões do arquivo (planilha)
        const permissionsResponse = await drive.permissions.list({
            fileId: sheetId,
            fields: 'permissions(id,type,emailAddress,role)',
        });
        
        const permissions = permissionsResponse.data.permissions || [];
        const normalizedUserEmail = userEmail.toLowerCase().trim();
        
        // Verifica se o e-mail do usuário está nas permissões
        for (const permission of permissions) {
            // Verifica permissões de usuário (type: 'user')
            if (permission.type === 'user' && permission.emailAddress) {
                const permissionEmail = permission.emailAddress.toLowerCase().trim();
                if (permissionEmail === normalizedUserEmail) {
                    // E-mail encontrado nas permissões - usuário tem acesso
                    return true;
                }
            }
            
            // Verifica permissões de grupo (type: 'group')
            // Nota: A API não lista membros de grupos automaticamente
            // Se você usar grupos, pode precisar de lógica adicional
            if (permission.type === 'group' && permission.emailAddress) {
                const groupEmail = permission.emailAddress.toLowerCase().trim();
                // Se o e-mail do usuário corresponde ao e-mail do grupo
                // (caso de grupos do Google Workspace)
                if (groupEmail === normalizedUserEmail) {
                    return true;
                }
            }
        }
        
        // Também verifica se o arquivo está compartilhado publicamente ou com "qualquer pessoa com o link"
        // Neste caso, verificamos se há permissão para "anyone" ou "domain"
        const hasPublicAccess = permissions.some(p => 
            p.type === 'anyone' || p.type === 'domain'
        );
        
        // Se o arquivo está público, permite acesso (mas isso não deve acontecer se a planilha for privada)
        // Por segurança, vamos retornar false mesmo se público, a menos que seja explicitamente necessário
        // return hasPublicAccess; // Descomente se quiser permitir acesso público
        
        return false;
    } catch (error) {
        console.error('Erro ao verificar permissões da planilha:', error);
        
        // Se o erro for de permissão insuficiente da conta de serviço, retorna erro específico
        if (error.code === 403 || error.message?.includes('insufficient permissions')) {
            throw new Error('A conta de serviço não tem permissão para verificar as permissões da planilha. Verifique se a conta de serviço tem acesso à planilha.');
        }
        
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
        
        // Inicializa Google Drive API para verificar permissões
        const drive = getGoogleDrive();
        
        // Verifica se o e-mail está autorizado através das permissões do Google Sheets
        const isAuthorized = await isEmailAuthorized(userEmail, drive, finalSheetId);
        
        if (!isAuthorized) {
            return res.status(403).json({ 
                error: 'Acesso negado. Seu e-mail não tem permissão para acessar esta planilha. Verifique se você tem acesso à planilha no Google Sheets.' 
            });
        }
        
        // Inicializa Google Sheets API para obter os dados
        const sheets = getGoogleSheets();
        
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
