import { initAuthListener } from './auth.js';
import { goToChat, resetToHome, views } from './navigation.js';
// ADICIONADO: importamos o sendMessage aqui
import { setAiContext, initChatSequence, sendMessage } from './chat.js'; 
import { db } from './config.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import './admin.js'; 

// Inicia escuta de login
initAuthListener();

// Funções globais de navegação chamadas pelo HTML
window.transitionToChat = () => {
    goToChat();
    if(document.getElementById('chat-messages').children.length === 0) {
         initChatSequence();
    }
};

window.softReset = () => resetToHome();
window.toggleTheme = () => document.body.classList.toggle('theme-dark');

// Lógica de Seleção de Manual
window.selectManual = async function(option) {
    const { container, manualPanel } = views;
    
    container.classList.remove('state-chat-full');
    container.classList.add('state-split');
    manualPanel.classList.add('show');
    document.getElementById('manual-title').innerText = option.label;

    let data = { files: [], aiText: '' };
    try {
        const snap = await getDoc(doc(db, "manuais", option.id));
        if(snap.exists()) data = snap.data();
    } catch(e) { console.error(e); }

    setAiContext(data.aiText || "");

    const mediaContainer = document.getElementById('media-container');
    const playlist = document.getElementById('playlist-container');
    mediaContainer.innerHTML = "";
    playlist.innerHTML = "";
    playlist.classList.add('hidden');

    if(!data.files || data.files.length === 0) {
        mediaContainer.innerHTML = "<div style='color:#ccc; padding:20px;'>Vazio</div>";
    } else {
        if(data.files.length > 1) {
            playlist.classList.remove('hidden');
            data.files.forEach((f, i) => {
                const b = document.createElement('button');
                b.className = 'playlist-btn';
                b.innerText = `Arquivo ${i+1}`;
                b.onclick = () => {
                    document.querySelectorAll('.playlist-btn').forEach(x => x.classList.remove('active'));
                    b.classList.add('active');
                    renderMedia(f);
                };
                playlist.appendChild(b);
            });
            playlist.firstChild.classList.add('active');
            renderMedia(data.files[0]);
        } else {
            renderMedia(data.files[0]);
        }
    }
    
    document.getElementById('input-area').classList.remove('hidden');
}

function renderMedia(file) {
    const div = document.getElementById('media-container');
    div.innerHTML = "";
    const isVideo = file.name.match(/\.(mp4|webm)$/i);
    if(isVideo) {
        const v = document.createElement('video');
        v.src = file.name; v.controls = true; v.autoplay = true;
        div.appendChild(v);
    } else {
        const i = document.createElement('iframe');
        i.src = file.name;
        div.appendChild(i);
    }
}

/* --- ADICIONADO PARA O ENTER E BOTÃO FUNCIONAREM --- */

// 1. Faz o Enter funcionar chamando a função sendMessage do chat.js
window.handleEnter = function(e) {
    if (e.key === 'Enter') {
        sendMessage();
    }
}

// 2. Garante que o clique no botão ➤ também funcione
window.sendMessage = sendMessage;