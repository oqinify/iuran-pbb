/**
 * Configuration for External Hosting (GitHub Pages, etc.)
 * If you host on GitHub Pages, paste your Google Apps Script Web App URL here.
 */
const CONFIG = {
    API_URL: localStorage.getItem('gas_api_url') || '',
    IS_GAS_ENV: typeof google !== 'undefined' && google.script && google.script.run
};

// State Management
let appData = {
    members: [],
    transactions: [],
    stats: {}
};

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    fetchInitialData();
    setupEventListeners();
    initSettingsView();
    checkConnection();
});

function initSettingsView() {
    const input = document.getElementById('inputApiUrl');
    if (input) input.value = CONFIG.API_URL;
}

async function checkConnection() {
    const statusEl = document.getElementById('connectionStatus');
    if (!statusEl) return;
    
    if (CONFIG.IS_GAS_ENV && !CONFIG.API_URL) {
        statusEl.innerHTML = '<i class="fas fa-check-circle" style="color: var(--accent-success)"></i> Terhubung via GAS Environment';
        return;
    }
    
    if (!CONFIG.API_URL) {
        statusEl.innerHTML = '<i class="fas fa-exclamation-triangle" style="color: var(--accent-warning)"></i> API URL Belum Diatur';
        return;
    }

    try {
        statusEl.textContent = 'Menghubungkan...';
        await callApi('getDashboardData');
        statusEl.innerHTML = '<i class="fas fa-check-circle" style="color: var(--accent-success)"></i> Terhubung ke API';
    } catch (err) {
        statusEl.innerHTML = '<i class="fas fa-times-circle" style="color: var(--accent-error)"></i> Koneksi Gagal';
    }
}

/**
 * Universal API Caller
 * Supports both GAS environment and External Fetch
 */
async function callApi(action, data = {}) {
    if (CONFIG.IS_GAS_ENV && !CONFIG.API_URL) {
        // Use native GAS runner
        return new Promise((resolve, reject) => {
            google.script.run
                .withSuccessHandler(resolve)
                .withFailureHandler(reject)[action](data);
        });
    } else {
        // Use Fetch API for external hosting
        if (!CONFIG.API_URL) {
            console.error('API_URL is not set for external hosting!');
            return;
        }
        
        const params = new URLSearchParams({ action, ...data });
        const response = await fetch(`${CONFIG.API_URL}?${params.toString()}`);
        return await response.json();
    }
}

async function fetchInitialData() {
    showLoading(true);
    try {
        const data = await callApi('getDashboardData');
        appData.stats = data.stats;
        appData.transactions = data.recentTransactions;
        renderDashboard();
        
        // Background fetch
        fetchMembers();
        fetchTransactions();
    } catch (err) {
        showToast('Gagal mengambil data: ' + err, 'error');
    } finally {
        showLoading(false);
    }
}

async function fetchMembers() {
    try {
        const members = await callApi('getMembers');
        appData.members = members;
        renderMembers();
        populateMemberSelect();
    } catch (err) {
        console.error('Fetch members error:', err);
    }
}

async function fetchTransactions() {
    try {
        const txs = await callApi('getTransactions');
        appData.transactions = txs;
        renderAllTransactions();
    } catch (err) {
        console.error('Fetch transactions error:', err);
    }
}

// Rendering Logic
function renderDashboard() {
    const stats = appData.stats;
    if (!stats) return;

    document.getElementById('statTotalQuota').textContent = formatIDR(stats.totalQuota);
    document.getElementById('statTotalUsed').textContent = formatIDR(stats.totalUsed);
    document.getElementById('statTotalBalance').textContent = formatIDR(stats.totalBalance);
    document.getElementById('statUsagePercent').textContent = stats.usagePercentage + '%';

    const tbody = document.querySelector('#recentTxTable tbody');
    tbody.innerHTML = '';
    
    appData.transactions.slice(0, 5).forEach(tx => {
        const member = appData.members.find(m => m.ID === tx.MemberID) || { Name: 'Unknown' };
        const row = `
            <tr>
                <td>${formatDate(tx.Date)}</td>
                <td>${member.Name}</td>
                <td>${formatIDR(tx.Amount)}</td>
                <td>${tx.Description || '-'}</td>
            </tr>
        `;
        tbody.innerHTML += row;
    });
}

function renderMembers() {
    const grid = document.getElementById('membersGrid');
    grid.innerHTML = '';

    appData.members.forEach(member => {
        const usagePercent = member.TotalQuota > 0 ? (member.UsedAmount / member.TotalQuota * 100) : 0;
        const card = `
            <div class="member-card">
                <div class="member-card-header">
                    <h4>${member.Name}</h4>
                    <span class="member-dept">${member.Department}</span>
                </div>
                <div class="progress-container">
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${Math.min(usagePercent, 100)}%"></div>
                    </div>
                    <div class="usage-stats">
                        <span>Pagu: ${formatIDR(member.TotalQuota)}</span>
                        <span>Sisa: ${formatIDR(member.Balance)}</span>
                    </div>
                </div>
                <div style="font-size: 12px; color: var(--text-muted)">
                    Terpakai: ${formatIDR(member.UsedAmount)} (${usagePercent.toFixed(1)}%)
                </div>
            </div>
        `;
        grid.innerHTML += card;
    });
}

function renderAllTransactions() {
    const tbody = document.querySelector('#allTxTable tbody');
    tbody.innerHTML = '';
    
    appData.transactions.forEach(tx => {
        const member = appData.members.find(m => m.ID === tx.MemberID) || { Name: tx.MemberID };
        const row = `
            <tr>
                <td>${tx.ID}</td>
                <td>${formatDate(tx.Date)}</td>
                <td>${member.Name}</td>
                <td>${formatIDR(tx.Amount)}</td>
                <td>${tx.Description || '-'}</td>
            </tr>
        `;
        tbody.innerHTML += row;
    });
}

function populateMemberSelect() {
    const select = document.getElementById('selectMember');
    if (!select) return;
    select.innerHTML = '<option value="">Pilih Anggota...</option>';
    appData.members.forEach(m => {
        select.innerHTML += `<option value="${m.ID}">${m.Name} (${m.Department})</option>`;
    });
}

// Navigation
function switchView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    
    const viewEl = document.getElementById(viewId + 'View');
    const navEl = document.querySelector(`[data-view="${viewId}"]`);
    
    if (viewEl) viewEl.classList.add('active');
    if (navEl) navEl.classList.add('active');
}

// Event Listeners
function setupEventListeners() {
    // Sidebar Toggle for Mobile
    const sidebar = document.querySelector('.sidebar');
    const btnToggle = document.getElementById('btnToggleSidebar');
    
    if (btnToggle) {
        btnToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            sidebar.classList.toggle('active');
        });
    }

    // Sidebar Overlay Click (Close sidebar)
    const overlay = document.getElementById('sidebarOverlay');
    if (overlay) {
        overlay.addEventListener('click', () => {
            sidebar.classList.remove('active');
        });
    }

    // Navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            switchView(item.dataset.view);
            if (window.innerWidth <= 1024) {
                sidebar.classList.remove('active');
            }
        });
    });

    // Modals
    const modalTx = document.getElementById('modalTx');
    const modalMem = document.getElementById('modalMember');

    const btnNewTx = document.getElementById('btnNewTx');
    const btnAddMember = document.getElementById('btnAddMember');

    if (btnNewTx) btnNewTx.onclick = () => modalTx.classList.add('active');
    if (btnAddMember) btnAddMember.onclick = () => modalMem.classList.add('active');

    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.onclick = () => {
            if (modalTx) modalTx.classList.remove('active');
            if (modalMem) modalMem.classList.remove('active');
        };
    });

    // Form Submissions
    const formTx = document.getElementById('formTransaction');
    if (formTx) {
        formTx.onsubmit = async (e) => {
            e.preventDefault();
            const data = {
                memberId: document.getElementById('selectMember').value,
                date: document.getElementById('txDate').value,
                amount: document.getElementById('txAmount').value,
                description: document.getElementById('txDesc').value
            };

            try {
                const res = await callApi('addTransaction', data);
                showToast(res.message || 'Transaksi berhasil');
                modalTx.classList.remove('active');
                fetchInitialData(); // Refresh
                e.target.reset();
            } catch (err) {
                showToast('Gagal menyimpan transaksi: ' + err, 'error');
            }
        };
    }

    const formMem = document.getElementById('formMember');
    if (formMem) {
        formMem.onsubmit = async (e) => {
            e.preventDefault();
            const data = {
                name: document.getElementById('memName').value,
                department: document.getElementById('memDept').value,
                quota: document.getElementById('memQuota').value
            };

            try {
                const res = await callApi('addMember', data);
                showToast('Anggota berhasil didaftarkan');
                modalMem.classList.remove('active');
                fetchMembers();
                e.target.reset();
            } catch (err) {
                showToast('Gagal mendaftarkan anggota: ' + err, 'error');
            }
        };
    }

    // Settings Form
    const formSettings = document.getElementById('formSettings');
    if (formSettings) {
        formSettings.onsubmit = (e) => {
            e.preventDefault();
            const newUrl = document.getElementById('inputApiUrl').value.trim();
            localStorage.setItem('gas_api_url', newUrl);
            CONFIG.API_URL = newUrl;
            showToast('Pengaturan berhasil disimpan');
            checkConnection();
            
            // Re-fetch data with new URL
            fetchInitialData();
        };
    }
}

// Helpers
function formatIDR(num) {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        maximumFractionDigits: 0
    }).format(num);
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('id-ID', { 
        day: '2-digit', 
        month: 'short', 
        year: 'numeric' 
    });
}

function showToast(msg, type = 'success') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.style.background = type === 'error' ? 'var(--accent-red)' : 'var(--accent-green)';
    toast.style.display = 'block';
    setTimeout(() => { toast.style.display = 'none'; }, 3000);
}

function showLoading(show) {
    const overlay = document.getElementById('loadingOverlay');
    if (!overlay) return;
    
    if (show) {
        overlay.classList.add('active');
        document.body.style.cursor = 'wait';
    } else {
        overlay.classList.remove('active');
        document.body.style.cursor = 'default';
    }
}
