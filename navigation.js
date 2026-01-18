// Controla qual tela aparece e as animações
export const views = {
    auth: document.getElementById('view-auth'),
    home: document.getElementById('view-home'),
    chat: document.getElementById('view-chat'),
    adminBtn: document.getElementById('btn-admin'),
    container: document.getElementById('main-container'),
    manualPanel: document.getElementById('manual-panel')
};

export function goToHome(userEmail, isAdmin) {
    views.auth.classList.add('hidden');
    views.home.classList.remove('hidden');
    views.chat.classList.add('hidden');
    
    // Animação de entrada
    views.container.classList.add('welcome-anim');
    
    // Atualiza nome
    document.getElementById('user-display-email').innerText = userEmail.split('@')[0];

    if(isAdmin) views.adminBtn.classList.remove('hidden');
}

export function goToChat() {
    views.home.classList.add('hidden');
    views.adminBtn.classList.add('hidden');
    views.container.classList.remove('state-login');
    views.container.classList.add('state-chat-full');

    setTimeout(() => {
        views.chat.classList.remove('hidden');
    }, 600);
}

export function resetToHome() {
    views.manualPanel.classList.remove('show');
    views.chat.classList.add('hidden');
    document.getElementById('media-container').innerHTML = ""; 

    views.container.classList.remove('state-split', 'state-chat-full');
    views.container.classList.add('state-login');

    setTimeout(() => {
        views.home.classList.remove('hidden');
        if(!views.adminBtn.classList.contains('force-hidden')) {
             // Lógica simples: se estava logado como admin, mostra btn
             const userDisplay = document.getElementById('user-display-email').innerText;
             if(userDisplay) views.adminBtn.classList.remove('hidden'); 
        }
    }, 600);
}

export function logoutAnimation(callback) {
    views.container.classList.add('goodbye-anim');
    setTimeout(callback, 800);
}