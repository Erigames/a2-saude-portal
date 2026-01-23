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
    const mediaEl = document.getElementById('media-container');
    if(mediaEl) mediaEl.innerHTML = "";

    views.container.classList.remove('state-split', 'state-chat-full');
    views.container.classList.add('state-login');

    setTimeout(async () => {
        views.home.classList.remove('hidden');
        // Só mostra o botão do painel do gerente se o usuário logado for ADMIN
        if(!views.adminBtn.classList.contains('force-hidden')) {
            try {
                const { currentUser } = await import('./auth.js');
                const isAdmin = currentUser && currentUser.role === 'admin';
                if(isAdmin) {
                    views.adminBtn.classList.remove('hidden');
                } else {
                    views.adminBtn.classList.add('hidden');
                }
            } catch(e) {
                views.adminBtn.classList.add('hidden');
            }
        }
    }, 600);
}

export function logoutAnimation(callback) {
    views.container.classList.add('goodbye-anim');
    setTimeout(callback, 800);
}