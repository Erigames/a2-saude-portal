import { auth, db } from './config.js';
import { goToHome } from './navigation.js';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let isRegisterMode = false;
export let currentUser = null;

export function initAuthListener() {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            try {
                const userSnap = await getDoc(doc(db, "users", user.uid));
                if (userSnap.exists()) {
                    const data = userSnap.data();
                    if (data.status === 'pending') {
                        await signOut(auth);
                        document.getElementById('auth-msg').innerText = "Aguardando aprovação.";
                    } else {
                        currentUser = data;
                        goToHome(data.email, data.role === 'admin');
                    }
                } else {
                     await signOut(auth);
                }
            } catch (e) { console.error(e); }
        }
    });
}

// Funções expostas para o HTML (window)
window.toggleAuthMode = function() {
    isRegisterMode = document.getElementById('auth-toggle').checked;
    document.getElementById('btn-text').innerText = isRegisterMode ? "Cadastrar" : "Acessar";
    document.getElementById('auth-msg').innerText = "";
    
    // Adiciona animação de mudança de posição das caixas
    const authForm = document.querySelector('.auth-form');
    const emailWrapper = document.getElementById('email-wrapper');
    const passWrapper = document.getElementById('pass-wrapper');
    const emailInput = document.getElementById('auth-email');
    const passInput = document.getElementById('auth-pass');
    
    if(isRegisterMode) {
        // Modo cadastro: inverte a ordem (senha primeiro, depois email)
        authForm.classList.add('register-mode');
        // Usa CSS order para inverter a ordem visualmente
        emailWrapper.style.order = '2';
        passWrapper.style.order = '1';
        emailInput.placeholder = "E-mail corporativo";
        passInput.placeholder = "Crie uma senha (mín. 6 caracteres)";
    } else {
        // Modo login: ordem normal (email primeiro, depois senha)
        authForm.classList.remove('register-mode');
        // Ordem normal
        emailWrapper.style.order = '1';
        passWrapper.style.order = '2';
        emailInput.placeholder = "E-mail corporativo";
        passInput.placeholder = "Senha de acesso";
    }
}

window.handleAuthSubmit = function() {
    const email = document.getElementById('auth-email').value;
    const pass = document.getElementById('auth-pass').value;
    const msg = document.getElementById('auth-msg');

    if (isRegisterMode) {
        if(pass.length < 6) { msg.innerText = "Senha curta."; return; }
        msg.innerText = "Criando...";
        createUserWithEmailAndPassword(auth, email, pass)
            .then((cred) => setDoc(doc(db, "users", cred.user.uid), { email, role: 'user', status: 'pending', createdAt: new Date() }))
            .then(() => { signOut(auth); msg.innerText = "Solicitação enviada!"; })
            .catch(e => msg.innerText = "Erro: " + e.code);
    } else {
        msg.innerText = "Entrando...";
        signInWithEmailAndPassword(auth, email, pass).catch(e => msg.innerText = "Dados inválidos.");
    }
}

window.handleLogout = function() {
    import('./navigation.js').then(nav => {
        nav.logoutAnimation(async () => {
            await signOut(auth);
            location.reload();
        });
    });
}