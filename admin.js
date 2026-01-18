import { db } from './config.js';
import { doc, getDoc, setDoc, collection, query, where, getDocs, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let currentFiles = [];

// Expondo funções para o HTML
window.switchAdminTab = function(tab) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.admin-section').forEach(s => s.classList.add('hidden'));
    
    if(tab === 'content') {
        document.querySelector('.tab-btn:first-child').classList.add('active');
        document.getElementById('tab-content').classList.remove('hidden');
    } else {
        document.querySelector('.tab-btn:last-child').classList.add('active');
        document.getElementById('tab-users').classList.remove('hidden');
        loadUsers();
    }
}

async function loadUsers() {
    const list = document.getElementById('user-list');
    list.innerHTML = "<li>Carregando...</li>";
    try {
        const q = query(collection(db, "users"), where("status", "==", "pending"));
        const snap = await getDocs(q);
        list.innerHTML = "";
        if(snap.empty) { list.innerHTML = "<li>Nenhum pendente.</li>"; return; }
        snap.forEach(d => {
            const u = d.data();
            list.innerHTML += `<li class="user-item"><span>${u.email}</span><button class="btn-approve" onclick="approveUser('${d.id}')">OK</button></li>`;
        });
    } catch (e) { list.innerHTML = "<li>Erro.</li>"; }
}

window.approveUser = async (uid) => {
    await updateDoc(doc(db, "users", uid), { status: 'approved' });
    loadUsers();
}

// Lógica de Conteúdo
const select = document.getElementById('admin-select');
if(select) select.onchange = loadContent;

async function loadContent() {
    const key = select.value;
    currentFiles = [];
    document.getElementById('admin-ai-text').value = "Carregando...";
    renderFiles();
    try {
        const snap = await getDoc(doc(db, "manuais", key));
        if(snap.exists()) {
            const d = snap.data();
            document.getElementById('admin-ai-text').value = d.aiText || "";
            currentFiles = d.files || [];
        } else { document.getElementById('admin-ai-text').value = ""; }
    } catch(e){}
    renderFiles();
}

window.handleFileSelect = function(input) {
    Array.from(input.files).forEach(f => currentFiles.push({name: f.name}));
    renderFiles();
}
window.removeFile = function(i) { currentFiles.splice(i, 1); renderFiles(); }

function renderFiles() {
    const list = document.getElementById('admin-file-list');
    list.innerHTML = "";
    currentFiles.forEach((f, i) => list.innerHTML += `<li class="file-item"><span>${f.name}</span><span class="remove-file" onclick="removeFile(${i})">X</span></li>`);
}

window.saveManual = async function() {
    await setDoc(doc(db, "manuais", select.value), {
        files: currentFiles,
        aiText: document.getElementById('admin-ai-text').value
    });
    alert("Salvo!");
    document.getElementById('admin-modal').classList.add('hidden');
}

// Botão de abrir modal
const btn = document.getElementById('btn-admin');
if(btn) btn.onclick = () => {
    document.getElementById('admin-modal').classList.remove('hidden');
    loadContent();
}
window.closeAdmin = () => document.getElementById('admin-modal').classList.add('hidden');