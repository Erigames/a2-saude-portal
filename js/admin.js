// js/admin.js - Painel do Gerente
import { db, auth } from './config.js';
import { doc, getDoc, setDoc, collection, query, where, getDocs, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

let currentFiles = [];
let currentManualId = null;
let currentUserId = null;
let newManualFile = null; // Arquivo selecionado para novo manual

// Função para alternar entre abas do painel
window.switchAdminTab = function(tab) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.admin-section').forEach(s => s.classList.add('hidden'));
    
    if(tab === 'manuals') {
        document.querySelector('.tab-btn:first-child').classList.add('active');
        document.getElementById('tab-manuals').classList.remove('hidden');
        loadManualsList();
    } else if(tab === 'users') {
        document.querySelector('.tab-btn:last-child').classList.add('active');
        document.getElementById('tab-users').classList.remove('hidden');
        // Carrega pendentes por padrão - atualiza o botão ativo
        const pendingBtn = document.querySelector('.filter-tab-btn');
        if(pendingBtn) {
            filterUsers('pending', pendingBtn);
        } else {
            // Fallback caso o botão não exista ainda
            setTimeout(() => {
                const btn = document.querySelector('.filter-tab-btn');
                if(btn) filterUsers('pending', btn);
            }, 100);
        }
    }
}

// ========== GERENCIAMENTO DE MANUAIS ==========

// Carrega lista de manuais no select
async function loadManualsList() {
    const select = document.getElementById('admin-select');
    select.innerHTML = '<option value="">Selecione um manual...</option>';
    
    try {
        const snap = await getDocs(collection(db, "manuais"));
        snap.forEach(doc => {
            const data = doc.data();
            const option = document.createElement('option');
            option.value = doc.id;
            option.textContent = data.name || doc.id;
            select.appendChild(option);
        });
    } catch(e) {
        console.error("Erro ao carregar manuais:", e);
    }
}

// Carrega conteúdo do manual selecionado
window.loadManualContent = async function() {
    const select = document.getElementById('admin-select');
    if(!select) {
        console.error("Select de manuais não encontrado!");
        return;
    }
    
    currentManualId = select.value;
    
    if(!currentManualId) {
        const contentSection = document.getElementById('manual-content-section');
        if(contentSection) {
            contentSection.classList.add('hidden');
        }
        currentFiles = [];
        return;
    }
    
    // Mostra a seção de conteúdo
    const contentSection = document.getElementById('manual-content-section');
    if(contentSection) {
        contentSection.classList.remove('hidden');
    }
    
    // Limpa e recarrega arquivos
    currentFiles = [];
    renderFiles();
    
    try {
        const snap = await getDoc(doc(db, "manuais", currentManualId));
        if(snap.exists()) {
            const d = snap.data();
            currentFiles = Array.isArray(d.files) ? d.files : [];
            console.log("Manual carregado:", currentManualId, "com", currentFiles.length, "arquivo(s)");
        } else {
            console.log("Manual não encontrado no banco:", currentManualId);
            currentFiles = [];
        }
    } catch(e) {
        console.error("Erro ao carregar manual:", e);
        currentFiles = [];
    }
    
    renderFiles();
}

// Mostra formulário para criar novo manual
window.showNewManualForm = function() {
    document.getElementById('new-manual-form').classList.remove('hidden');
}

// Esconde formulário de novo manual
window.hideNewManualForm = function() {
    document.getElementById('new-manual-form').classList.add('hidden');
    document.getElementById('new-manual-name').value = '';
    document.getElementById('new-manual-file-name').textContent = '';
    newManualFile = null;
}

// Lida com seleção de arquivo para novo manual
window.handleNewManualFileSelect = function(input) {
    if(input.files && input.files.length > 0) {
        newManualFile = input.files[0];
        document.getElementById('new-manual-file-name').textContent = `Arquivo selecionado: ${newManualFile.name}`;
    }
}

// Cria novo manual - ID gerado automaticamente baseado no nome
window.createNewManual = async function() {
    const nameInput = document.getElementById('new-manual-name');
    if(!nameInput) {
        alert("Campo de nome não encontrado!");
        return;
    }
    
    const name = nameInput.value.trim();
    
    if(!name) {
        alert("Preencha o nome do manual!");
        nameInput.focus();
        return;
    }
    
    if(!newManualFile) {
        alert("Selecione um arquivo para o manual!");
        return;
    }
    
    // Gera ID automaticamente baseado no nome (remove acentos, espaços, caracteres especiais)
    const id = name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove acentos
        .replace(/[^a-z0-9\s-]/g, '') // Remove caracteres especiais
        .replace(/\s+/g, '-') // Substitui espaços por hífen
        .replace(/-+/g, '-') // Remove hífens duplicados
        .trim();
    
    if(!id) {
        alert("Nome inválido! Use apenas letras, números e espaços.");
        return;
    }
    
    try {
        // Verifica se já existe um manual com este ID
        let finalId = id;
        let counter = 1;
        let check = await getDoc(doc(db, "manuais", finalId));
        while(check.exists()) {
            finalId = `${id}-${counter}`;
            check = await getDoc(doc(db, "manuais", finalId));
            counter++;
        }
        
        // Cria o manual com o arquivo selecionado
        await setDoc(doc(db, "manuais", finalId), {
            name: name,
            files: [{name: newManualFile.name}], // Adiciona o arquivo selecionado
            createdAt: new Date()
        });
        
        alert(`Manual "${name}" criado com sucesso!`);
        
        // Limpa o formulário
        hideNewManualForm();
        
        // Recarrega a lista e seleciona o manual criado
        await loadManualsList();
        
        const select = document.getElementById('admin-select');
        if(select) {
            select.value = finalId;
            // Carrega o conteúdo do manual recém-criado
            await loadManualContent();
        }
        
        console.log("Manual criado:", finalId, "com arquivo:", newManualFile.name);
    } catch(e) {
        console.error("Erro ao criar manual:", e);
        alert("Erro ao criar manual: " + (e.message || "Erro desconhecido"));
    }
}

// Remove arquivo da lista
window.handleFileSelect = function(input) {
    if(!input || !input.files || input.files.length === 0) {
        alert("Nenhum arquivo selecionado!");
        return;
    }
    
    // Adiciona todos os arquivos selecionados à lista
    Array.from(input.files).forEach(f => {
        // Verifica se o arquivo já não está na lista
        const exists = currentFiles.some(existing => existing.name === f.name);
        if(!exists) {
            currentFiles.push({name: f.name});
        }
    });
    
    renderFiles();
    
    // Limpa o input para permitir selecionar o mesmo arquivo novamente
    input.value = '';
}

window.removeFile = function(i) {
    if(i < 0 || i >= currentFiles.length) {
        console.error("Índice inválido para remover arquivo:", i);
        return;
    }
    
    const fileName = currentFiles[i].name;
    currentFiles.splice(i, 1);
    renderFiles();
    console.log("Arquivo removido:", fileName);
}

function renderFiles() {
    const list = document.getElementById('admin-file-list');
    if(!list) {
        console.error("Lista de arquivos não encontrada!");
        return;
    }
    
    list.innerHTML = "";
    
    if(currentFiles.length === 0) {
        list.innerHTML = "<li style='color:#999; padding: 10px;'>Nenhum arquivo adicionado</li>";
        return;
    }
    
    currentFiles.forEach((f, i) => {
        const li = document.createElement('li');
        li.className = 'file-item';
        
        const span = document.createElement('span');
        span.textContent = f.name;
        
        const removeBtn = document.createElement('span');
        removeBtn.className = 'remove-file';
        removeBtn.textContent = 'X';
        removeBtn.onclick = () => removeFile(i);
        removeBtn.title = 'Remover arquivo';
        
        li.appendChild(span);
        li.appendChild(removeBtn);
        list.appendChild(li);
    });
}

// Salva manual
window.saveManual = async function() {
    if(!currentManualId) {
        alert("Selecione um manual primeiro!");
        return;
    }
    
    if(currentFiles.length === 0) {
        if(!confirm("Nenhum arquivo adicionado. Deseja salvar mesmo assim?")) {
            return;
        }
    }
    
    try {
        // Busca o nome do manual para preservá-lo
        const manualDoc = await getDoc(doc(db, "manuais", currentManualId));
        const existingData = manualDoc.exists() ? manualDoc.data() : {};
        
        await setDoc(doc(db, "manuais", currentManualId), {
            name: existingData.name || currentManualId,
            files: currentFiles,
            updatedAt: new Date()
        }, { merge: true });
        
        alert("Manual salvo com sucesso! " + currentFiles.length + " arquivo(s) adicionado(s).");
    } catch(e) {
        console.error("Erro ao salvar:", e);
        alert("Erro ao salvar manual: " + (e.message || "Erro desconhecido"));
    }
}

// Exclui manual
window.deleteManual = async function() {
    if(!currentManualId) {
        alert("Selecione um manual primeiro!");
        return;
    }
    
    // Busca o nome do manual para exibir na confirmação
    let manualName = currentManualId;
    try {
        const manualDoc = await getDoc(doc(db, "manuais", currentManualId));
        if(manualDoc.exists()) {
            manualName = manualDoc.data().name || currentManualId;
        }
    } catch(e) {
        console.error("Erro ao buscar nome do manual:", e);
    }
    
    if(!confirm(`Tem certeza que deseja excluir o manual "${manualName}"?\n\nEsta ação não pode ser desfeita!`)) {
        return;
    }
    
    try {
        await deleteDoc(doc(db, "manuais", currentManualId));
        alert("Manual excluído com sucesso!");
        
        // Limpa as variáveis e interface
        currentManualId = null;
        currentFiles = [];
        
        const select = document.getElementById('admin-select');
        if(select) select.value = '';
        
        const contentSection = document.getElementById('manual-content-section');
        if(contentSection) contentSection.classList.add('hidden');
        
        // Recarrega a lista de manuais
        loadManualsList();
        
        console.log("Manual excluído:", manualName);
    } catch(e) {
        console.error("Erro ao excluir:", e);
        alert("Erro ao excluir manual: " + (e.message || "Erro desconhecido"));
    }
}

// ========== GERENCIAMENTO DE USUÁRIOS ==========

// Filtra usuários por status
window.filterUsers = async function(status, buttonElement) {
    // Atualiza botões de filtro
    document.querySelectorAll('.filter-tab-btn').forEach(b => b.classList.remove('active'));
    if(buttonElement) {
        buttonElement.classList.add('active');
    }
    
    const list = document.getElementById('user-list');
    list.innerHTML = "<li>Carregando...</li>";
    
    try {
        const q = query(collection(db, "users"), where("status", "==", status));
        const snap = await getDocs(q);
        list.innerHTML = "";
        
        if(snap.empty) {
            list.innerHTML = `<li style='color:#999;'>Nenhum usuário ${status === 'pending' ? 'pendente' : 'cadastrado'}.</li>`;
            return;
        }
        
        snap.forEach(d => {
            const u = d.data();
            const li = document.createElement('li');
            li.className = 'user-item';
            
            const userInfo = document.createElement('div');
            userInfo.className = 'user-info';
            
            const emailSpan = document.createElement('span');
            emailSpan.className = 'user-email';
            emailSpan.textContent = u.email;
            
            const roleSpan = document.createElement('span');
            roleSpan.className = 'user-role';
            roleSpan.textContent = u.role || 'user';
            
            userInfo.appendChild(emailSpan);
            userInfo.appendChild(roleSpan);
            
            const userActions = document.createElement('div');
            userActions.className = 'user-actions';
            
            if(status === 'pending') {
                const approveBtn = document.createElement('button');
                approveBtn.className = 'glass-btn btn-approve';
                approveBtn.textContent = 'Aprovar';
                approveBtn.onclick = () => approveUser(d.id);
                userActions.appendChild(approveBtn);
            }
            
            const editBtn = document.createElement('button');
            editBtn.className = 'glass-btn btn-edit';
            editBtn.textContent = 'Editar';
            editBtn.onclick = () => editUser(d.id, u.email);
            userActions.appendChild(editBtn);
            
            li.appendChild(userInfo);
            li.appendChild(userActions);
            list.appendChild(li);
        });
    } catch(e) {
        console.error("Erro ao carregar usuários:", e);
        list.innerHTML = "<li>Erro ao carregar usuários.</li>";
    }
}

// Aprova usuário pendente
window.approveUser = async function(uid) {
    try {
        await updateDoc(doc(db, "users", uid), { status: 'approved' });
        alert("Usuário aprovado!");
        // Recarrega a lista de pendentes mantendo o botão ativo
        const pendingBtn = document.querySelector('.filter-tab-btn');
        if(pendingBtn && pendingBtn.textContent.includes('Pendentes')) {
            filterUsers('pending', pendingBtn);
        }
    } catch(e) {
        console.error("Erro ao aprovar:", e);
        alert("Erro ao aprovar usuário!");
    }
}

// Abre modal para editar usuário
window.editUser = function(uid, email) {
    console.log("editUser chamado - UID:", uid, "Email:", email);
    currentUserId = uid;
    
    const modal = document.getElementById('edit-user-modal');
    const emailInput = document.getElementById('edit-user-email');
    
    if(!modal) {
        console.error("Modal edit-user-modal não encontrado!");
        alert("Erro: Modal não encontrado!");
        return;
    }
    
    if(!emailInput) {
        console.error("Campo edit-user-email não encontrado!");
        alert("Erro: Campo de e-mail não encontrado!");
        return;
    }
    
    // Preenche o campo de email
    emailInput.value = email || '';
    
    // Remove a classe hidden para exibir o modal
    modal.classList.remove('hidden');
    
    // Foca no campo de email
    setTimeout(() => {
        emailInput.focus();
    }, 100);
    
    console.log("Modal de edição aberto com sucesso para:", email);
}

// Fecha modal de edição
window.closeEditUserModal = function() {
    const modal = document.getElementById('edit-user-modal');
    const emailInput = document.getElementById('edit-user-email');
    
    if(modal) {
        modal.classList.add('hidden');
    }
    
    if(emailInput) {
        emailInput.value = '';
    }
    
    currentUserId = null;
    console.log("Modal de edição fechado");
}

// Salva novo email do usuário
window.saveUserEmail = async function() {
    if(!currentUserId) {
        alert("Nenhum usuário selecionado!");
        return;
    }
    
    const emailInput = document.getElementById('edit-user-email');
    if(!emailInput) {
        alert("Campo de e-mail não encontrado!");
        return;
    }
    
    const newEmail = emailInput.value.trim();
    if(!newEmail || !newEmail.includes('@')) {
        alert("E-mail inválido!");
        return;
    }
    
    try {
        // Atualiza o email no Firestore
        await updateDoc(doc(db, "users", currentUserId), { email: newEmail });
        alert("E-mail atualizado com sucesso!");
        closeEditUserModal();
        
        // Recarrega a lista atual (pendentes ou cadastrados)
        const activeBtn = document.querySelector('.filter-tab-btn.active');
        if(activeBtn) {
            const status = activeBtn.textContent.includes('Pendentes') ? 'pending' : 'approved';
            filterUsers(status, activeBtn);
        } else {
            // Fallback: recarrega cadastrados
            const approvedBtn = document.querySelectorAll('.filter-tab-btn')[1];
            if(approvedBtn) {
                filterUsers('approved', approvedBtn);
            }
        }
    } catch(e) {
        console.error("Erro ao atualizar email:", e);
        alert("Erro ao atualizar e-mail: " + (e.message || "Erro desconhecido"));
    }
}

// Envia email de reset de senha
window.sendPasswordReset = async function() {
    if(!currentUserId) {
        alert("Nenhum usuário selecionado!");
        return;
    }
    
    const emailInput = document.getElementById('edit-user-email');
    if(!emailInput) {
        alert("Campo de e-mail não encontrado!");
        return;
    }
    
    const email = emailInput.value.trim();
    if(!email || !email.includes('@')) {
        alert("E-mail inválido!");
        return;
    }
    
    try {
        // Envia o email de reset de senha via Firebase Auth
        await sendPasswordResetEmail(auth, email);
        alert("E-mail de redefinição de senha enviado com sucesso para: " + email);
    } catch(e) {
        console.error("Erro ao enviar email:", e);
        let errorMsg = "Erro ao enviar e-mail.";
        if(e.code === 'auth/user-not-found') {
            errorMsg = "Usuário não encontrado. Verifique se o e-mail está correto.";
        } else if(e.code === 'auth/invalid-email') {
            errorMsg = "E-mail inválido.";
        } else if(e.message) {
            errorMsg = "Erro: " + e.message;
        }
        alert(errorMsg);
    }
}

// ========== INICIALIZAÇÃO ==========

// Botão de abrir modal
const btn = document.getElementById('btn-admin');
if(btn) {
    btn.onclick = () => {
        document.getElementById('admin-modal').classList.remove('hidden');
        loadManualsList();
    };
}

window.closeAdmin = () => {
    document.getElementById('admin-modal').classList.add('hidden');
}
