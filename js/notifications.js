// js/notifications.js - Sistema de Notificações Customizado

/**
 * Mostra uma notificação customizada no lugar dos alert() do navegador
 * @param {string} message - Mensagem a ser exibida
 * @param {string} type - Tipo: 'success', 'error', 'warning', 'info' (padrão: 'info')
 * @param {number} duration - Duração em milissegundos (padrão: 4000)
 */
window.showNotification = function(message, type = 'info', duration = 4000) {
    const container = document.getElementById('notification-container');
    if(!container) {
        console.error("Container de notificações não encontrado!");
        return;
    }
    
    // Cria o elemento da notificação
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    
    // Ícone baseado no tipo
    const icons = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️'
    };
    
    // Cor de fundo baseada no tipo
    const bgColors = {
        success: 'rgba(76, 175, 80, 0.2)',
        error: 'rgba(244, 67, 54, 0.2)',
        warning: 'rgba(255, 152, 0, 0.2)',
        info: 'rgba(33, 150, 243, 0.2)'
    };
    
    const borderColors = {
        success: 'rgba(76, 175, 80, 0.4)',
        error: 'rgba(244, 67, 54, 0.4)',
        warning: 'rgba(255, 152, 0, 0.4)',
        info: 'rgba(33, 150, 243, 0.4)'
    };
    
    notification.style.background = bgColors[type] || bgColors.info;
    notification.style.borderColor = borderColors[type] || borderColors.info;
    
    notification.innerHTML = `
        <div class="notification-content">
            <span class="notification-icon">${icons[type] || icons.info}</span>
            <span class="notification-message">${message}</span>
            <button class="notification-close" onclick="this.parentElement.parentElement.remove()">✕</button>
        </div>
    `;
    
    // Adiciona ao container
    container.appendChild(notification);
    
    // Animação de entrada
    setTimeout(() => {
        notification.classList.add('show');
    }, 10);
    
    // Remove automaticamente após a duração especificada
    if(duration > 0) {
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                if(notification.parentElement) {
                    notification.remove();
                }
            }, 300);
        }, duration);
    }
    
    return notification;
}

// Funções auxiliares para facilitar o uso
window.showSuccess = function(message, duration = 4000) {
    return window.showNotification(message, 'success', duration);
}

window.showError = function(message, duration = 5000) {
    return window.showNotification(message, 'error', duration);
}

window.showWarning = function(message, duration = 4000) {
    return window.showNotification(message, 'warning', duration);
}

window.showInfo = function(message, duration = 4000) {
    return window.showNotification(message, 'info', duration);
}

/**
 * Mostra uma confirmação customizada (substitui confirm())
 * @param {string} message - Mensagem de confirmação
 * @param {string} confirmText - Texto do botão de confirmação (padrão: "Confirmar")
 * @param {string} cancelText - Texto do botão de cancelar (padrão: "Cancelar")
 * @returns {Promise<boolean>} - true se confirmado, false se cancelado
 */
window.showConfirm = function(message, confirmText = "Confirmar", cancelText = "Cancelar") {
    return new Promise((resolve) => {
        const container = document.getElementById('notification-container');
        if(!container) {
            resolve(false);
            return;
        }
        
        // Cria modal de confirmação
        const overlay = document.createElement('div');
        overlay.className = 'confirm-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.6);
            backdrop-filter: blur(5px);
            z-index: 20000;
            display: flex;
            justify-content: center;
            align-items: center;
        `;
        
        const modal = document.createElement('div');
        modal.className = 'confirm-modal';
        modal.style.cssText = `
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(20px);
            border: 1px solid rgba(255, 255, 255, 0.3);
            border-radius: 15px;
            padding: 30px;
            max-width: 450px;
            width: 90%;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            animation: slideDown 0.3s ease-out;
        `;
        
        modal.innerHTML = `
            <div style="margin-bottom: 20px; font-size: 1.1rem; color: #333; line-height: 1.5;">
                ${message}
            </div>
            <div style="display: flex; gap: 10px; justify-content: flex-end;">
                <button class="glass-btn btn-cancel" id="confirm-cancel" style="flex: 1;">${cancelText}</button>
                <button class="glass-btn btn-danger" id="confirm-ok" style="flex: 1;">${confirmText}</button>
            </div>
        `;
        
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        
        const handleConfirm = () => {
            overlay.remove();
            resolve(true);
        };
        
        const handleCancel = () => {
            overlay.remove();
            resolve(false);
        };
        
        modal.querySelector('#confirm-ok').onclick = handleConfirm;
        modal.querySelector('#confirm-cancel').onclick = handleCancel;
        overlay.onclick = (e) => {
            if(e.target === overlay) handleCancel();
        };
    });
}
