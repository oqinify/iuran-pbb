/**
 * Configuration for External Hosting (GitHub Pages, etc.)
 * If you host on GitHub Pages, paste your Google Apps Script Web App URL here.
 */
const getUrlParam = (name) => new URLSearchParams(window.location.search).get(name);

const CONFIG = {
    API_URL: localStorage.getItem('gas_api_url') || '',
    IS_GAS_ENV: typeof google !== 'undefined' && google.script && google.script.run,
    // Auto-detect branch: parameter first, then path-based, then default to main
    BRANCH: (getUrlParam('branch') || (window.location.pathname.includes('/testing') ? 'testing' : 'main')).toLowerCase()
};

// State Management
let appData = {
    members: [],
    transactions: [],
    expenses: [],
    stats: {},
    currentYear: new Date().getFullYear(),
    userRole: getInitialRole(),
    isForcedRole: false
};

function getInitialRole() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('mode') === 'view' || params.get('role') === 'user') {
        return 'user';
    }
    // Only return admin if session exists
    if (sessionStorage.getItem('isAdminLoggedIn') === 'true') {
        return 'admin';
    }
    return 'user'; // Default to user (viewer) for new visitors
}

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initYearSelector();
    initRoleSelector();
    fetchInitialData();
    setupEventListeners();
    initSettingsView();
    applyRolePermissions();
    checkConnection();

    // Register PWA Service Worker
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js').then(reg => {
                console.log('PWA Service Worker registered:', reg.scope);
            }).catch(err => {
                console.log('PWA Service Worker registration failed:', err);
            });
        });
    }
});

function initTheme() {
    const savedTheme = localStorage.getItem('appTheme') || 'dark-theme';
    document.body.className = savedTheme;
    const selector = document.getElementById('selectTheme');
    if (selector) selector.value = savedTheme;
}
function initYearSelector() {
    const selector = document.getElementById('selectYear');
    if (selector) {
        selector.value = appData.currentYear;
        selector.addEventListener('change', (e) => {
            appData.currentYear = e.target.value;
            fetchInitialData();
        });
    }
}

function initSettingsView() {
    const input = document.getElementById('inputApiUrl');
    if (input) input.value = CONFIG.API_URL;
    const roleSelect = document.getElementById('selectRole');
    if (roleSelect) roleSelect.value = appData.userRole;
}

function initRoleSelector() {
    const selector = document.getElementById('selectRole');
    if (selector) {
        selector.value = appData.userRole;
    }
}

function applyRolePermissions() {
    const params = new URLSearchParams(window.location.search);
    const isForcedView = params.get('mode') === 'view' || params.get('role') === 'user';
    const isViewer = appData.userRole === 'user' || isForcedView;

    if (isViewer) {
        document.body.classList.add('is-viewer');
    } else {
        document.body.classList.remove('is-viewer');
    }

    // If forced via URL, hide settings entirely for security/UX
    if (isForcedView) {
        const settingsNav = document.querySelector('.nav-item[data-view="settings"]');
        if (settingsNav) settingsNav.style.display = 'none';
    }

    const displayRole = document.getElementById('displayRole');
    if (displayRole) {
        if (isForcedView) displayRole.textContent = 'Public Viewer';
        else displayRole.textContent = isViewer ? 'Viewer' : 'Administrator';
    }

    const avatar = document.querySelector('.avatar');
    if (avatar) {
        avatar.textContent = isViewer ? 'Usr' : 'Adm';
    }

    // Toggle Header Buttons
    const btnLogin = document.getElementById('btnLoginHeader');
    const btnLogout = document.getElementById('btnLogoutHeader');
    if (btnLogin && btnLogout) {
        btnLogin.style.display = isViewer ? 'flex' : 'none';
        btnLogout.style.display = isViewer ? 'none' : 'flex';
    }

    // Update settings view based on role
    const selectRole = document.getElementById('selectRole');
    if (selectRole) selectRole.value = isViewer ? 'user' : 'admin';
}

async function checkConnection() {
    const statusEl = document.getElementById('connectionStatus');
    const versionEl = document.getElementById('serverVersion');
    const badgeEl = document.getElementById('branchBadge');

    if (badgeEl) {
        badgeEl.textContent = CONFIG.BRANCH === 'testing' ? 'Alpha' : CONFIG.BRANCH;
        badgeEl.style.display = CONFIG.BRANCH === 'main' ? 'none' : 'inline-block';
    }

    if (CONFIG.IS_GAS_ENV && !CONFIG.API_URL) {
        statusEl.innerHTML = '<i class="fas fa-check-circle" style="color: var(--accent-success)"></i> Terhubung via GAS Environment';
        if (versionEl) versionEl.innerHTML = `Parallel Environment <br> Mode: Native GAS`;
        return;
    }

    if (!CONFIG.API_URL) {
        statusEl.innerHTML = '<i class="fas fa-exclamation-triangle" style="color: var(--accent-warning)"></i> API URL Belum Diatur';
        if (versionEl) versionEl.textContent = 'Server Version: API Tidak Terhubung';
        return;
    }

    try {
        statusEl.textContent = 'Menghubungkan...';
        const data = await callApi('getDashboardData');
        if (data.version) {
          if (versionEl) versionEl.innerHTML = `Parallel Environment <br> v${data.version || '3.2'}`;
            statusEl.innerHTML = '<i class="fas fa-check-circle" style="color: var(--accent-success)"></i> Terhubung ke API';
        }
    } catch (err) {
        statusEl.innerHTML = '<i class="fas fa-times-circle" style="color: var(--accent-error)"></i> Koneksi Gagal';
        if (versionEl) versionEl.textContent = 'Koneksi Terputus';
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
        if (!CONFIG.API_URL) return;

        if (action === 'uploadFile') {
            // Use POST for file uploads
            const response = await fetch(CONFIG.API_URL, {
                method: 'POST',
                body: JSON.stringify({ action, data })
            });
            return await response.json();
        }

        const params = new URLSearchParams({ action, ...data });
        const response = await fetch(`${CONFIG.API_URL}?${params.toString()}`);
        return await response.json();
    }
}

async function fetchInitialData() {
    showLoading(true);
    try {
        const data = await callApi('getDashboardData', { year: appData.currentYear });
        appData.members = data.members || [];
        appData.stats = data.stats;
        appData.transactions = data.recentTransactions;
        appData.expenses = data.recentExpenses;

        renderDashboard();
        renderMembers();
        populateMemberSelect();

        // Background fetch for full history
        fetchTransactions(appData.currentYear);
        fetchExpenses(appData.currentYear);
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

async function fetchTransactions(year) {
    try {
        const txs = await callApi('getTransactions', { year: year || appData.currentYear });
        appData.transactions = txs;
        renderAllTransactions();
    } catch (err) {
        console.error('Fetch transactions error:', err);
    }
}

async function fetchExpenses(year) {
    try {
        const exps = await callApi('getExpenses', { year: year || appData.currentYear });
        appData.expenses = exps;
        renderAllExpenses();
    } catch (err) {
        console.error('Fetch expenses error:', err);
    }
}

// Rendering Logic
function renderDashboard() {
    const stats = appData.stats;
    if (!stats) return;

    document.getElementById('statTotalQuota').textContent = formatIDR(stats.totalQuota);
    document.getElementById('statTotalUsed').textContent = formatIDR(stats.totalUsed);
    document.getElementById('statTotalExpense').textContent = formatIDR(stats.totalExpense);
    document.getElementById('statNetBalance').textContent = formatIDR(stats.netBalance);

    const tbody = document.querySelector('#recentTxTable tbody');
    tbody.innerHTML = '';

    appData.transactions.slice(0, 5).forEach(tx => {
        const member = getMember(tx.MemberID);
        const row = `
            <tr>
                <td data-label="Tanggal">${formatDate(tx.Date)}</td>
                <td data-label="Anggota">${member.Name}</td>
                <td data-label="Nominal">${formatIDR(tx.Amount)}</td>
                <td data-label="Keterangan">${tx.Description || '-'}</td>
            </tr>
        `;
        tbody.innerHTML += row;
    });

    renderCharts();
}

let mainChart = null;
function renderCharts() {
    const ctxMain = document.getElementById('mainChart');
    const container = document.getElementById('progressStatsContainer');
    
    if (!ctxMain || !container) return;

    // --- 1. Render Line Chart ---
    if (mainChart) mainChart.destroy();

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    const monthlyIncome = new Array(12).fill(0);
    const monthlyExpense = new Array(12).fill(0);

    appData.transactions.forEach(tx => {
        const date = new Date(tx.Date);
        if (!isNaN(date)) monthlyIncome[date.getMonth()] += tx.Amount;
    });

    appData.expenses.forEach(exp => {
        const date = new Date(exp.Date);
        if (!isNaN(date)) monthlyExpense[date.getMonth()] += exp.Amount;
    });

    const isDark = document.body.classList.contains('dark-theme');
    const textColor = isDark ? '#94a3b8' : '#64748b';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)';

    mainChart = new Chart(ctxMain, {
        type: 'line',
        data: {
            labels: months,
            datasets: [
                {
                    label: 'Iuran Masuk',
                    data: monthlyIncome,
                    borderColor: '#a855f7',
                    backgroundColor: 'rgba(168, 85, 247, 0.1)',
                    fill: true,
                    tension: 0.4,
                    borderWidth: 3,
                    pointRadius: 4,
                    pointBackgroundColor: '#a855f7'
                },
                {
                    label: 'Pengeluaran',
                    data: monthlyExpense,
                    borderColor: '#f43f5e',
                    backgroundColor: 'rgba(244, 63, 94, 0.1)',
                    fill: true,
                    tension: 0.4,
                    borderWidth: 3,
                    pointRadius: 4,
                    pointBackgroundColor: '#f43f5e'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: gridColor },
                    ticks: {
                        color: textColor,
                        callback: value => 'Rp ' + (value / 1000) + 'k'
                    }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: textColor }
                }
            }
        }
    });

    // Custom Legend for Line Chart
    const legendContainer = document.getElementById('chartLegend');
    if (legendContainer) {
        legendContainer.innerHTML = `
            <div style="display: flex; gap: 16px;">
                <div style="display: flex; align-items: center; gap: 6px; font-size: 12px; color: ${textColor}">
                    <div style="width: 12px; height: 12px; border-radius: 3px; background: #a855f7"></div> Iuran
                </div>
                <div style="display: flex; align-items: center; gap: 6px; font-size: 12px; color: ${textColor}">
                    <div style="width: 12px; height: 12px; border-radius: 3px; background: #f43f5e"></div> Bayar
                </div>
            </div>
        `;
    }

    // --- 2. Render Progress Bars ---
    const stats = appData.stats;
    if (!stats) return;

    const baseline = stats.totalQuota || 1;
    const metrics = [
        { label: 'Iuran Terkumpul', value: stats.totalUsed, icon: 'fas fa-receipt', color: 'var(--grad-blue)', perc: (stats.totalUsed / baseline * 100).toFixed(1) },
        { label: 'Pengeluaran', value: stats.totalExpense, icon: 'fas fa-shopping-cart', color: 'var(--grad-rose)', perc: (stats.totalExpense / baseline * 100).toFixed(1) },
        { label: 'Saldo Kas', value: stats.netBalance, icon: 'fas fa-wallet', color: 'var(--grad-green)', perc: (stats.netBalance / baseline * 100).toFixed(1) }
    ];

    container.innerHTML = metrics.map(m => `
        <div class="progress-item">
            <div class="progress-info">
                <div class="progress-label">
                    <i class="${m.icon}" style="color: ${m.color.split(' ')[0]}"></i>
                    <span>${m.label}</span>
                </div>
                <div class="progress-value">${m.perc}%</div>
            </div>
            <div class="progress-track">
                <div class="progress-fill" style="width: 0%; background: ${m.color}" data-width="${m.perc}%"></div>
            </div>
        </div>
    `).join('');

    setTimeout(() => {
        container.querySelectorAll('.progress-fill').forEach(bar => {
            bar.style.width = bar.getAttribute('data-width');
        });
    }, 100);
}

function renderMembers() {
    const grid = document.getElementById('membersGrid');
    grid.innerHTML = '';

    appData.members.forEach(member => {
        const usagePercent = member.TotalQuota > 0 ? (member.UsedAmount / member.TotalQuota * 100) : 0;
        const card = `
            <div class="member-card">
                <div class="member-card-header" style="display: flex; justify-content: space-between; align-items: flex-start;">
                    <div>
                        <h4>${member.Name}</h4>
                        <span class="member-dept">${member.Department}</span>
                    </div>
                    <button class="btn-icon admin-only" onclick="editMemberData('${member.ID}')" title="Edit Anggota">
                        <i class="fas fa-pencil-alt"></i>
                    </button>
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
    if (!tbody) return;
    tbody.innerHTML = '';

    const filterValue = document.getElementById('filterMemberName')?.value.toLowerCase() || '';

    const filteredTxs = appData.transactions.filter(tx => {
        const member = getMember(tx.MemberID);
        return member.Name.toLowerCase().includes(filterValue);
    });

    filteredTxs.forEach(tx => {
        const member = getMember(tx.MemberID);
        const recLink = tx.Attachment ? `<a href="${tx.Attachment}" target="_blank" title="Bukti Setor" style="margin-left:8px; color:var(--accent-success)"><i class="fas fa-receipt"></i></a>` : '';

        const actions = `
            <div class="action-buttons">
                <button class="btn btn-icon" onclick="editData('${tx.ID}', 'tx')" title="Edit"><i class="fas fa-edit"></i></button>
                <button class="btn btn-icon btn-danger" onclick="deleteData('${tx.ID}', 'tx')" title="Hapus"><i class="fas fa-trash"></i></button>
            </div>
        `;
        const row = `
            <tr>
                <td data-label="ID">${tx.ID}</td>
                <td data-label="Tanggal">${formatDate(tx.Date)}</td>
                <td data-label="Anggota">${member.Name}</td>
                <td data-label="Nominal">${formatIDR(tx.Amount)}</td>
                <td data-label="Keterangan">${tx.Description || '-'}${recLink}</td>
                <td data-label="Aksi" class="admin-only">${actions}</td>
            </tr>
        `;
        tbody.innerHTML += row;
    });
}

function renderAllExpenses() {
    const tbody = document.querySelector('#allExpTable tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    appData.expenses.forEach(exp => {
        const invLink = exp.InvoiceDoc ? `<a href="${exp.InvoiceDoc}" target="_blank" title="Bukti Tagihan" style="margin-left:8px; color:var(--accent-primary)"><i class="fas fa-file-invoice"></i></a>` : '';
        const recLink = exp.ReceiptDoc ? `<a href="${exp.ReceiptDoc}" target="_blank" title="Bukti Pembayaran" style="margin-left:8px; color:var(--accent-success)"><i class="fas fa-receipt"></i></a>` : '';

        const actions = `
            <div class="action-buttons">
                <button class="btn btn-icon" onclick="editData('${exp.ID}', 'exp')" title="Edit"><i class="fas fa-edit"></i></button>
                <button class="btn btn-icon btn-danger" onclick="deleteData('${exp.ID}', 'exp')" title="Hapus"><i class="fas fa-trash"></i></button>
            </div>
        `;
        const row = `
            <tr>
                <td data-label="ID">${exp.ID}</td>
                <td data-label="Tanggal">${formatDate(exp.Date)}</td>
                <td data-label="Nominal">${formatIDR(exp.Amount)}</td>
                <td data-label="Keterangan">${exp.Description || '-'}${invLink}${recLink}</td>
                <td data-label="Aksi" class="admin-only">${actions}</td>
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
    document.querySelectorAll('.bottom-nav-item').forEach(n => n.classList.remove('active'));

    const viewEl = document.getElementById(viewId + 'View');
    const navEl = document.querySelector(`.nav-item[data-view="${viewId}"]`);
    const bottomNavEl = document.querySelector(`.bottom-nav-item[data-view="${viewId}"]`);

    if (viewEl) viewEl.classList.add('active');
    if (navEl) navEl.classList.add('active');
    if (bottomNavEl) bottomNavEl.classList.add('active');

    // Scroll to top when switching view
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Event Listeners
function setupEventListeners() {
    const selectorTheme = document.getElementById('selectTheme');
    if (selectorTheme) {
        selectorTheme.addEventListener('change', (e) => {
            const theme = e.target.value;
            document.body.className = theme;
            localStorage.setItem('appTheme', theme);
            showToast('Tema diubah ke ' + (theme === 'light-theme' ? 'Terang' : 'Gelap'));
        });
    }

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

    // Sidebar & Bottom Nav
    const navItems = document.querySelectorAll('.nav-item, .bottom-nav-item');

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            switchView(item.dataset.view);
            if (window.innerWidth <= 1024) {
                sidebar.classList.remove('active');
            }
        });
    });

    // FAB Toggle
    const fabContainer = document.querySelector('.fab-container');
    const fabMain = document.getElementById('fabMain');
    if (fabMain) {
        fabMain.addEventListener('click', () => {
            fabContainer.classList.toggle('active');
        });
    }

    // Close FAB on click outside
    document.addEventListener('click', (e) => {
        if (fabContainer && !fabContainer.contains(e.target) && fabContainer.classList.contains('active')) {
            fabContainer.classList.remove('active');
        }
    });

    // FAB Action Buttons
    const fabNewTx = document.getElementById('fabNewTx');
    const fabNewExp = document.getElementById('fabNewExp');

    if (fabNewTx) {
        fabNewTx.addEventListener('click', () => {
            document.getElementById('btnNewTx').click();
            fabContainer.classList.remove('active');
        });
    }
    if (fabNewExp) {
        fabNewExp.addEventListener('click', () => {
            document.getElementById('btnNewExp').click();
            fabContainer.classList.remove('active');
        });
    }

    // Modals
    const modalTx = document.getElementById('modalTx');
    const modalMem = document.getElementById('modalMember');
    const modalExp = document.getElementById('modalExpense');

    const btnNewTx = document.getElementById('btnNewTx');
    const btnAddMember = document.getElementById('btnAddMember');
    const btnNewExp = document.getElementById('btnNewExp');

    if (btnNewTx) btnNewTx.onclick = () => modalTx.classList.add('active');
    if (btnAddMember) btnAddMember.onclick = () => {
        const form = document.getElementById('formMember');
        if (form) form.reset();
        document.getElementById('memId').value = '';
        const modalTitle = document.querySelector('#modalMember h3');
        if (modalTitle) modalTitle.textContent = 'Tambah Anggota Baru';
        const btnSubmit = document.querySelector('#formMember .btn-submit');
        if (btnSubmit) btnSubmit.textContent = 'Daftarkan Anggota';
        modalMem.classList.add('active');
    };
    if (btnNewExp) btnNewExp.onclick = () => {
        modalExp.classList.add('active');
        const expDesc = document.getElementById('expDesc');
        if (expDesc) {
            const count = appData.expenses.length;
            expDesc.value = `Pembayaran ke-${count + 1}`;
        }
    };

    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.onclick = () => {
            const modal = btn.closest('.modal');
            if (modal) {
                modal.classList.remove('active');
                const form = modal.querySelector('form');
                if (form) form.reset();
            } else {
                document.querySelectorAll('.modal').forEach(m => {
                    m.classList.remove('active');
                    const form = m.querySelector('form');
                    if (form) form.reset();
                });
            }
        };
    });

    // Auto-fill Description based on member's payment sequence
    const selectMember = document.getElementById('selectMember');
    if (selectMember) {
        selectMember.addEventListener('change', () => {
            const memberId = selectMember.value;
            if (!memberId) return;
            const count = appData.transactions.filter(t => t.MemberID === memberId).length;
            const descInput = document.getElementById('txDesc');
            if (descInput) descInput.value = `Iuran ke-${count + 1}`;
        });
    }

    // Form Submissions
    const formTx = document.getElementById('formTransaction');
    if (formTx) {
        formTx.onsubmit = async (e) => {
            e.preventDefault();
            const btn = e.target.querySelector('button[type="submit"]');
            const originalText = btn.innerHTML;

            const data = {
                memberId: document.getElementById('selectMember').value,
                date: document.getElementById('txDate').value,
                amount: document.getElementById('txAmount').value,
                description: document.getElementById('txDesc').value.trim()
            };

            // Fallback description
            if (!data.description) {
                const count = appData.transactions.filter(t => t.MemberID === data.memberId).length;
                data.description = `Iuran ke-${count + 1}`;
            }
            const recInput = document.getElementById('txReceipt');

            try {
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyimpan...';
                document.body.style.cursor = 'wait';

                // Handle Receipt Upload
                if (recInput && recInput.files.length > 0) {
                    const member = appData.members.find(m => m.ID === data.memberId);
                    const memberName = member ? member.Name.replace(/\s+/g, '-') : 'Unknown';
                    const count = appData.transactions.filter(t => t.MemberID === data.memberId).length;
                    const file = recInput.files[0];
                    const base64 = await toBase64(file);
                    const res = await callApi('uploadFile', { base64, name: `Setor_ke-${count + 1}_${memberName}_${file.name}` });
                    if (res.success) data.receiptUrl = res.url;
                }

                const res = await callApi('addTransaction', data);
                showToast(res.message || 'Transaksi berhasil');
                modalTx.classList.remove('active');
                await fetchInitialData();
                e.target.reset();
            } catch (err) {
                showToast('Gagal menyimpan transaksi: ' + err, 'error');
            } finally {
                btn.disabled = false;
                btn.innerHTML = originalText;
                document.body.style.cursor = 'default';
            }
        };
    }

    const formMem = document.getElementById('formMember');
    if (formMem) {
        formMem.onsubmit = async (e) => {
            e.preventDefault();
            const btn = e.target.querySelector('button[type="submit"]');
            const originalText = btn.innerHTML;

            const id = document.getElementById('memId').value;
            const data = {
                id: id,
                name: document.getElementById('memName').value,
                department: document.getElementById('memDept').value,
                quota: document.getElementById('memQuota').value
            };
            const action = id ? 'editMember' : 'addMember';

            try {
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyimpan...';
                document.body.style.cursor = 'wait';

                const res = await callApi(action, data);
                if (res.error) {
                    showToast('Gagal: ' + res.error, 'error');
                } else {
                    showToast(id ? 'Data anggota diperbarui' : 'Anggota berhasil didaftarkan');
                    modalMem.classList.remove('active');
                    await fetchMembers();
                    e.target.reset();
                }
            } catch (err) {
                showToast('Gagal mendaftarkan anggota: ' + err, 'error');
            } finally {
                btn.disabled = false;
                btn.innerHTML = originalText;
                document.body.style.cursor = 'default';
            }
        };
    }

    const formExp = document.getElementById('formExpense');
    if (formExp) {
        formExp.onsubmit = async (e) => {
            e.preventDefault();
            const btn = e.target.querySelector('button[type="submit"]');
            const originalText = btn.innerHTML;

            const data = {
                date: document.getElementById('expDate').value,
                amount: document.getElementById('expAmount').value,
                description: document.getElementById('expDesc').value.trim()
            };

            // Fallback description
            if (!data.description) {
                const count = appData.expenses.length;
                data.description = `Pembayaran ke-${count + 1}`;
            }

            // Validation: Spending must be <= Balance
            if (Number(data.amount) > appData.stats.netBalance) {
                showToast('Saldo Kas tidak mencukupi! (Sisa: ' + formatIDR(appData.stats.netBalance) + ')', 'error');
                return;
            }

            const invInput = document.getElementById('expInvoice');
            const recInput = document.getElementById('expReceipt');

            try {
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyimpan...';
                document.body.style.cursor = 'wait';

                // Handle Invoice Upload
                if (invInput && invInput.files.length > 0) {
                    const count = appData.expenses.length;
                    const file = invInput.files[0];
                    const base64 = await toBase64(file);
                    const res = await callApi('uploadFile', { base64, name: `Exp_Tagihan_ke-${count + 1}_${file.name}` });
                    if (res.success) data.invoiceUrl = res.url;
                }

                // Handle Receipt Upload
                if (recInput && recInput.files.length > 0) {
                    const count = appData.expenses.length;
                    const file = recInput.files[0];
                    const base64 = await toBase64(file);
                    const res = await callApi('uploadFile', { base64, name: `Exp_Bayar_ke-${count + 1}_${file.name}` });
                    if (res.success) data.receiptUrl = res.url;
                }

                const res = await callApi('addExpense', data);
                showToast(res.message || 'Belanja berhasil dicatat');
                const modalExp = document.getElementById('modalExpense');
                if (modalExp) modalExp.classList.remove('active');
                await fetchInitialData();
                e.target.reset();
            } catch (err) {
                showToast('Gagal mencatat belanja: ' + err, 'error');
            } finally {
                btn.disabled = false;
                btn.innerHTML = originalText;
                document.body.style.cursor = 'default';
            }
        };
    }

    const formEdit = document.getElementById('formEdit');
    if (formEdit) {
        formEdit.onsubmit = async (e) => {
            e.preventDefault();
            const btn = e.target.querySelector('button[type="submit"]');
            const originalText = btn.innerHTML;

            const type = document.getElementById('editType').value;
            const action = type === 'tx' ? 'editTransaction' : 'editExpense';

            const data = {
                id: document.getElementById('editId').value,
                date: document.getElementById('editDate').value,
                amount: document.getElementById('editAmount').value,
                description: document.getElementById('editDesc').value
            };

            // Validation for Expense
            if (type === 'exp' && Number(data.amount) > appData.stats.netBalance) {
                // Warning, but let them edit if it's not a huge delta (simplified)
            }

            try {
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyimpan...';
                document.body.style.cursor = 'wait';

                // Handle File Upload in Edit
                const editFileInput = document.getElementById('editReceipt');
                if (editFileInput && editFileInput.files.length > 0) {
                    const file = editFileInput.files[0];
                    const base64 = await toBase64(file);
                    const name = `Edit_${type}_${data.id}_${file.name}`;
                    const uploadRes = await callApi('uploadFile', { base64, name });
                    if (uploadRes.success) data.receiptUrl = uploadRes.url;
                }

                const res = await callApi(action, data);
                showToast(res.message || 'Perubahan disimpan');
                const modalEdit = document.getElementById('modalEdit');
                if (modalEdit) modalEdit.classList.remove('active');
                await fetchInitialData();
            } catch (err) {
                showToast('Gagal mengedit: ' + err, 'error');
            } finally {
                btn.disabled = false;
                btn.innerHTML = originalText;
                document.body.style.cursor = 'default';
                // Reset file input
                const editFileInput = document.getElementById('editReceipt');
                if (editFileInput) editFileInput.value = '';
            }
        };
    }

    // Auto-sync every 5 minutes
    setInterval(() => {
        console.log('Auto-syncing dashboard...');
        fetchInitialData();
    }, 5 * 60 * 1000);

    // Settings Form
    const formSettings = document.getElementById('formSettings');
    if (formSettings) {
        formSettings.onsubmit = (e) => {
            e.preventDefault();
            const newUrl = document.getElementById('inputApiUrl').value.trim();
            localStorage.setItem('gas_api_url', newUrl);
            CONFIG.API_URL = newUrl;
            showToast('Pengaturan disimpan');
            checkConnection();
            fetchInitialData();
        };
    }

    // Header Actions
    const btnLoginH = document.getElementById('btnLoginHeader');
    if (btnLoginH) btnLoginH.onclick = () => {
        document.getElementById('modalLogin').classList.add('active');
    };

    const btnLogoutH = document.getElementById('btnLogoutHeader');
    if (btnLogoutH) btnLogoutH.onclick = () => {
        document.getElementById('modalLogoutConfirm').classList.add('active');
    };

    const btnConfirmLogout = document.getElementById('btnConfirmLogout');
    if (btnConfirmLogout) {
        btnConfirmLogout.onclick = () => {
            performLogout();
        };
    }

    // Login Form (Modal)
    const formLogin = document.getElementById('formLogin');
    if (formLogin) {
        formLogin.onsubmit = async (e) => {
            e.preventDefault();
            const user = document.getElementById('adminUser').value;
            const pass = document.getElementById('adminPin').value;
            handleLoginAttempt(user, pass, e.target);
        };
    }

    // Transactions Filter
    const filterMember = document.getElementById('filterMemberName');
    if (filterMember) {
        filterMember.addEventListener('input', () => {
            renderAllTransactions();
        });
    }
}

async function handleLoginAttempt(user, pass, formElement) {
    const btn = formElement.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;

    try {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Memverifikasi...';

        const res = await callApi('verifyAdmin', { user, pass });
        if (res.success) {
            sessionStorage.setItem('isAdminLoggedIn', 'true');
            appData.userRole = 'admin';

            document.getElementById('modalLogin').classList.remove('active');
            showToast('Login berhasil! Mode Administrator aktif.');
            applyRolePermissions();

            renderMembers();
            renderAllTransactions();
            renderAllExpenses();
        } else {
            showToast(res.error || 'Username atau Password salah', 'error');
        }
    } catch (err) {
        showToast('Gagal login: ' + err, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
        formElement.reset();
    }
}

function performLogout() {
    sessionStorage.removeItem('isAdminLoggedIn');
    appData.userRole = 'user';

    // Close modal before reload (though reload will clear it anyway)
    const modal = document.getElementById('modalLogoutConfirm');
    if (modal) modal.classList.remove('active');

    showToast('Logout berhasil. Mode Viewer aktif.');

    // Reload to fresh state
    setTimeout(() => {
        location.reload();
    }, 1500);
}

function handleLogout() {
    // Show confirmation modal
    const modal = document.getElementById('modalLogoutConfirm');
    if (modal) modal.classList.add('active');
}

// Helpers
window.editData = (id, type) => {
    let item;
    if (type === 'tx') item = appData.transactions.find(t => t.ID === id);
    else item = appData.expenses.find(e => e.ID === id);

    if (!item) return;

    document.getElementById('editId').value = id;
    document.getElementById('editType').value = type;

    // Format date for input type="date" (YYYY-MM-DD)
    const dateObj = new Date(item.Date);
    const yyyy = dateObj.getFullYear();
    const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
    const dd = String(dateObj.getDate()).padStart(2, '0');

    document.getElementById('editDate').value = `${yyyy}-${mm}-${dd}`;
    document.getElementById('editAmount').value = item.Amount;
    document.getElementById('editDesc').value = item.Description;

    // Adjust label and visibility for Edit File
    const receiptContainer = document.getElementById('editReceiptContainer');
    if (receiptContainer) {
        const label = receiptContainer.querySelector('label');
        if (type === 'tx') {
            label.textContent = 'Ganti Bukti Setor (Opsional)';
            receiptContainer.style.display = 'block';
        } else {
            // For expenses, we might want to handle multiple files, but for now let's just hide or adapt
            label.textContent = 'Ganti Bukti (Opsional)';
            receiptContainer.style.display = 'block'; // Allow it for expenses too, maps to receiptUrl/ReceiptDoc
        }
    }

    const modalEdit = document.getElementById('modalEdit');
    if (modalEdit) modalEdit.classList.add('active');
};

window.deleteData = async (id, type) => {
    if (!confirm('Apakah Anda yakin ingin menghapus data ini?')) return;

    showLoading(true);
    try {
        const action = type === 'tx' ? 'deleteTransaction' : 'deleteExpense';
        const res = await callApi(action, { id });
        showToast(res.message || 'Data dihapus');
        await fetchInitialData();
    } catch (err) {
        showToast('Gagal menghapus: ' + err, 'error');
    } finally {
        showLoading(false);
    }
};

window.editMemberData = (id) => {
    const member = getMember(id);
    if (!member || member.ID === '') return;

    document.getElementById('memId').value = member.ID;
    document.getElementById('memName').value = member.Name;
    document.getElementById('memDept').value = member.Department;
    document.getElementById('memQuota').value = member.TotalQuota;

    const modalTitle = document.querySelector('#modalMember h3');
    if (modalTitle) modalTitle.textContent = 'Edit Data Anggota';
    const btnSubmit = document.querySelector('#formMember .btn-submit');
    if (btnSubmit) btnSubmit.textContent = 'Simpan Perubahan';

    const modalMem = document.getElementById('modalMember');
    if (modalMem) modalMem.classList.add('active');
};

function getMember(id) {
    if (!id) return { Name: 'Unknown', ID: '', Department: '-' };
    const member = appData.members.find(m => String(m.ID).trim() === String(id).trim());
    return member || { Name: id, ID: id, Department: '-' };
}

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

function toBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

function showToast(msg, type = 'success') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.style.background = type === 'error' ? 'var(--accent-error)' : 'var(--accent-success)';
    toast.style.color = '#fff';
    toast.style.display = 'block';
    setTimeout(() => { toast.style.display = 'none'; }, 4000);
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
