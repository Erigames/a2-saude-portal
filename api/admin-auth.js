/**
 * API serverless (Vercel) - Gerencia usuários no Firebase Authentication + Firestore
 * Usa Firebase Admin SDK para excluir usuários e atualizar e-mail no Auth.
 *
 * Variáveis de ambiente na Vercel:
 * - FIREBASE_SERVICE_ACCOUNT: JSON da conta de serviço (Firebase Console > Configurações > Contas de serviço > Gerar nova chave)
 */

import admin from 'firebase-admin';

function getAdminApp() {
    if (admin.apps.length) return admin.app();
    const cred = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!cred) throw new Error('FIREBASE_SERVICE_ACCOUNT não configurada');
    const serviceAccount = typeof cred === 'string' ? JSON.parse(cred) : cred;
    return admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método não permitido' });
    }

    const { action, uid, newEmail } = req.body || {};
    if (!action || !uid) {
        return res.status(400).json({ error: 'action e uid são obrigatórios' });
    }

    try {
        getAdminApp();
        const auth = admin.auth();
        const db = admin.firestore();

        if (action === 'deleteUser') {
            await auth.deleteUser(uid);
            await db.collection('users').doc(uid).delete();
            return res.status(200).json({ ok: true, message: 'Usuário excluído do Authentication e Firestore' });
        }

        if (action === 'updateEmail') {
            if (!newEmail || !newEmail.includes('@')) {
                return res.status(400).json({ error: 'newEmail inválido' });
            }
            await auth.updateUser(uid, { email: newEmail });
            await db.collection('users').doc(uid).update({ email: newEmail });
            return res.status(200).json({ ok: true, message: 'E-mail atualizado no Authentication e Firestore' });
        }

        return res.status(400).json({ error: 'action inválida. Use deleteUser ou updateEmail' });
    } catch (e) {
        console.error('admin-auth:', e);
        const msg = e.message || 'Erro ao processar';
        const code = e.code || (e.errorInfo && e.errorInfo.code);
        return res.status(500).json({ error: msg, code: code || undefined });
    }
}
