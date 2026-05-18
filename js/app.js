import { Store } from './store.js';

// --- STATE MANAGEMENT ---
let currentState = {
    user: null,
    currentView: 'auth',
    loans: [],
    repayments: []
};

// --- DOM ELEMENTS ---
const appContainer = document.getElementById('app-container');
const viewContainer = document.getElementById('view-container');
const sidebar = document.getElementById('sidebar');
const mobileHeader = document.getElementById('mobile-header');
const mobileNav = document.getElementById('mobile-nav');
const navLinks = document.getElementById('nav-links');
const mobileNavLinks = document.getElementById('mobile-nav-links');
const toastContainer = document.getElementById('toast-container');

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

async function initApp() {
    // Check if user is logged in
    const savedUser = Store.getCurrentUser();
    if (savedUser) {
        currentState.user = savedUser;
        navigateTo('dashboard');
    } else {
        renderView('auth');
    }

    setupGlobalListeners();
}

function setupGlobalListeners() {
    document.getElementById('logout-btn')?.addEventListener('click', handleLogout);
    
    document.getElementById('mobile-menu-btn')?.addEventListener('click', () => {
        mobileNav.classList.toggle('hidden');
    });
}

// --- ROUTING & VIEW MANAGEMENT ---
function navigateTo(viewId) {
    currentState.currentView = viewId;
    mobileNav.classList.add('hidden'); // close mobile menu on navigation
    
    // Update shell UI based on auth state
    if (currentState.user) {
        appContainer.classList.remove('hidden');
        if (window.innerWidth >= 768) {
            sidebar.classList.remove('hidden');
        }
        mobileHeader.classList.remove('hidden');
        updateSidebarInfo();
        generateNavLinks();
    } else {
        sidebar.classList.add('hidden');
        mobileHeader.classList.add('hidden');
    }
    
    renderView(viewId);
}

async function renderView(viewId) {
    viewContainer.innerHTML = '';
    const tpl = document.getElementById(`tpl-${viewId}`);
    if (!tpl) {
        console.error(`Template for view ${viewId} not found.`);
        return;
    }
    
    const clone = tpl.content.cloneNode(true);
    viewContainer.appendChild(clone);
    
    // Re-bind Lucide icons for newly added DOM elements
    lucide.createIcons();

    // Initialize specific view logic
    switch(viewId) {
        case 'auth':
            initAuthView();
            break;
        case 'dashboard':
            await initDashboardView();
            break;
        case 'marketplace':
            if (currentState.user?.role !== 'lender') return navigateTo('dashboard');
            await initMarketplaceView();
            break;
        case 'loan-request':
            if (currentState.user?.role !== 'borrower') return navigateTo('dashboard');
            initLoanRequestView();
            break;
        case 'recovery':
            await initRecoveryView();
            break;
    }
}

// --- UI HELPERS ---
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = 'info';
    if(type === 'success') icon = 'check-circle';
    if(type === 'error') icon = 'alert-circle';
    
    toast.innerHTML = `<i data-lucide="${icon}"></i> <span>${message}</span>`;
    toastContainer.appendChild(toast);
    lucide.createIcons();
    
    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function updateSidebarInfo() {
    const u = currentState.user;
    document.getElementById('user-name-display').textContent = u.name;
    document.getElementById('user-role-display').textContent = u.role;
    document.getElementById('user-avatar').textContent = u.name.charAt(0).toUpperCase();
}

function generateNavLinks() {
    const links = [
        { id: 'dashboard', label: 'Dashboard', icon: 'layout-dashboard', roles: ['borrower', 'lender'] },
        { id: 'marketplace', label: 'Marketplace', icon: 'shopping-cart', roles: ['lender'] },
        { id: 'loan-request', label: 'Request Loan', icon: 'hand-coins', roles: ['borrower'] },
        { id: 'recovery', label: 'Repayments', icon: 'calendar-clock', roles: ['borrower', 'lender'] },
    ];
    
    const filtered = links.filter(l => l.roles.includes(currentState.user.role));
    
    const renderLinks = (container) => {
        container.innerHTML = filtered.map(link => `
            <a href="#" data-view="${link.id}" class="nav-item flex items-center gap-3 px-4 py-2.5 rounded-lg transition-colors ${currentState.currentView === link.id ? 'bg-indigo-500/20 text-indigo-400 font-medium' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}">
                <i data-lucide="${link.icon}" class="w-5 h-5"></i>
                ${link.label}
            </a>
        `).join('');
        
        container.querySelectorAll('.nav-item').forEach(el => {
            el.addEventListener('click', (e) => {
                e.preventDefault();
                navigateTo(e.currentTarget.dataset.view);
            });
        });
    };
    
    renderLinks(navLinks);
    renderLinks(mobileNavLinks);
}

// --- VIEW CONTROLLERS ---

// 1. Auth
function initAuthView() {
    const form = document.getElementById('auth-form');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('auth-name').value;
        const email = document.getElementById('auth-email').value;
        const role = document.querySelector('input[name="role"]:checked').value;
        
        try {
            const user = await Store.loginOrRegister(name, email, role);
            currentState.user = user;
            showToast(`Welcome, ${name}!`, 'success');
            navigateTo('dashboard');
        } catch (err) {
            showToast('Authentication failed.', 'error');
        }
    });
}

function handleLogout() {
    Store.logout();
    currentState.user = null;
    showToast('Logged out successfully.', 'info');
    navigateTo('auth');
}

// 2. Dashboard
async function initDashboardView() {
    const user = currentState.user;
    
    // Fetch data
    const activeLoans = await Store.getUserLoans(user.uid, user.role);
    const repayments = await Store.getUserRepayments(user.uid);
    
    // Update KPI Cards
    document.getElementById('dash-wallet').textContent = `$${user.walletBalance.toLocaleString()}`;
    document.getElementById('dash-active-loans').textContent = activeLoans.length;
    document.getElementById('dash-score').textContent = user.aiCreditScore || 'N/A';
    
    if(user.role === 'lender') {
        document.getElementById('dash-metric-label').textContent = 'Loans Funded';
        document.getElementById('dash-score-label').textContent = 'Avg Portfolio Risk';
        // Mock avg score calculation
        document.getElementById('dash-score').textContent = 'Low Risk'; 
        document.getElementById('dash-score').classList.replace('text-amber-400', 'text-emerald-400');
    }
    
    // Activity List
    const activityList = document.getElementById('dash-activity-list');
    if (activeLoans.length > 0) {
        activityList.innerHTML = activeLoans.slice(0,4).map(l => `
            <div class="flex items-center justify-between p-3 rounded-lg bg-slate-800/50 border border-slate-700">
                <div class="flex items-center gap-3">
                    <div class="p-2 rounded-full ${user.role === 'lender' ? 'bg-indigo-500/20 text-indigo-400' : 'bg-emerald-500/20 text-emerald-400'}">
                        <i data-lucide="${user.role === 'lender' ? 'arrow-up-right' : 'arrow-down-left'}"></i>
                    </div>
                    <div>
                        <p class="text-sm font-medium">${user.role === 'lender' ? 'Funded Loan' : 'Loan Received'}</p>
                        <p class="text-xs text-slate-400">${new Date(l.createdAt).toLocaleDateString()}</p>
                    </div>
                </div>
                <div class="font-bold">$${l.amount.toLocaleString()}</div>
            </div>
        `).join('');
    }
    lucide.createIcons();

    // Chart
    const ctx = document.getElementById('dashboardChart').getContext('2d');
    if (user.role === 'borrower') {
        const totalPaid = repayments.filter(r => r.status === 'paid').length;
        const totalUnpaid = repayments.filter(r => r.status === 'unpaid').length;
        
        if (totalPaid === 0 && totalUnpaid === 0) {
             document.getElementById('dash-chart-title').textContent = 'No Active Repayments';
        } else {
             new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: ['Paid', 'Remaining'],
                    datasets: [{
                        data: [totalPaid, totalUnpaid],
                        backgroundColor: ['#10b981', '#1e293b'],
                        borderWidth: 0,
                    }]
                },
                options: {
                    cutout: '75%',
                    plugins: { legend: { position: 'bottom', labels: { color: '#cbd5e1' } } }
                }
            });
        }
    } else {
        // Lender Chart: simplified mock line chart for portfolio growth
        new Chart(ctx, {
            type: 'line',
            data: {
                labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
                datasets: [{
                    label: 'Portfolio Value ($)',
                    data: [10000, 10500, 11200, 12000, 13500, 15000],
                    borderColor: '#4f46e5',
                    tension: 0.4,
                    fill: true,
                    backgroundColor: 'rgba(79, 70, 229, 0.1)'
                }]
            },
            options: {
                scales: {
                    y: { grid: { color: '#334155' }, ticks: { color: '#94a3b8' } },
                    x: { grid: { display: false }, ticks: { color: '#94a3b8' } }
                },
                plugins: { legend: { display: false } }
            }
        });
    }
}

// 3. Loan Request & AI Assessment
function initLoanRequestView() {
    const analyzeBtn = document.getElementById('btn-analyze-risk');
    const submitBtn = document.getElementById('btn-submit-loan');
    const reportPanel = document.getElementById('ai-report-panel');
    
    let aiAssessmentResult = null;

    analyzeBtn.addEventListener('click', () => {
        const amount = parseFloat(document.getElementById('lr-amount').value);
        const income = parseFloat(document.getElementById('lr-income').value);
        const debts = parseFloat(document.getElementById('lr-debts').value);
        
        if (!amount || !income) {
            showToast('Please fill all required fields.', 'error');
            return;
        }

        // --- AI Mock Heuristic Engine ---
        analyzeBtn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin text-indigo-400"></i> Analyzing...`;
        lucide.createIcons();
        
        setTimeout(() => {
            // Debt to Income Ratio
            const dti = debts / income;
            // Amount to Income Ratio
            const ati = amount / (income * 12);
            
            let riskScore = 100 - (dti * 100) - (ati * 100);
            riskScore += (currentState.user.aiCreditScore - 600) / 10; // factor in credit score
            
            let tier = 'High';
            let rate = 15.5;
            let prob = 25.0;
            let tierColor = 'text-rose-400';
            let bgTierColor = 'bg-rose-500/20';

            if (riskScore > 75) {
                tier = 'Low';
                rate = 7.5;
                prob = 1.2;
                tierColor = 'text-emerald-400';
                bgTierColor = 'bg-emerald-500/20';
            } else if (riskScore > 40) {
                tier = 'Medium';
                rate = 11.0;
                prob = 8.5;
                tierColor = 'text-amber-400';
                bgTierColor = 'bg-amber-500/20';
            }
            
            aiAssessmentResult = {
                tier, rate, prob
            };

            // Display Report
            document.getElementById('report-tier').textContent = tier;
            document.getElementById('report-tier').className = `font-bold px-2 py-1 rounded text-xs ${tierColor} ${bgTierColor}`;
            document.getElementById('report-prob').textContent = `${prob}%`;
            document.getElementById('report-rate').textContent = `${rate}%`;
            
            reportPanel.classList.remove('hidden');
            analyzeBtn.innerHTML = `<i data-lucide="cpu" class="w-4 h-4 text-indigo-400"></i> Update Assessment`;
            lucide.createIcons();
            
            showToast('AI Risk Assessment Complete', 'success');
        }, 1500);
    });

    submitBtn.addEventListener('click', async () => {
        if (!aiAssessmentResult) return;
        
        const loanData = {
            borrowerId: currentState.user.uid,
            borrowerName: currentState.user.name,
            amount: parseFloat(document.getElementById('lr-amount').value),
            tenureMonths: parseInt(document.getElementById('lr-tenure').value),
            purpose: document.getElementById('lr-purpose').value,
            interestRate: aiAssessmentResult.rate,
            riskTier: aiAssessmentResult.tier,
            defaultProbability: aiAssessmentResult.prob
        };

        try {
            await Store.createLoan(loanData);
            showToast('Loan request posted to marketplace!', 'success');
            navigateTo('dashboard');
        } catch (e) {
            showToast('Error posting loan.', 'error');
        }
    });
}

// 4. Marketplace
async function initMarketplaceView() {
    const loans = await Store.getMarketplaceLoans();
    const container = document.getElementById('marketplace-list');
    
    const renderLoans = (filterStr = 'all') => {
        let filtered = loans;
        if (filterStr !== 'all') {
            filtered = loans.filter(l => l.riskTier === filterStr);
        }
        
        if (filtered.length === 0) {
            container.innerHTML = `<div class="col-span-full text-center py-12 text-slate-500">No active loans match this filter.</div>`;
            return;
        }

        container.innerHTML = filtered.map(l => {
            let badgeColor = l.riskTier === 'Low' ? 'bg-emerald-500/20 text-emerald-400' : 
                             l.riskTier === 'Medium' ? 'bg-amber-500/20 text-amber-400' : 'bg-rose-500/20 text-rose-400';
            
            return `
                <div class="glass-panel p-5 rounded-xl flex flex-col h-full transform transition-all hover:-translate-y-1 hover:shadow-xl hover:shadow-indigo-500/10">
                    <div class="flex justify-between items-start mb-4">
                        <div>
                            <h4 class="font-semibold text-lg">$${l.amount.toLocaleString()}</h4>
                            <p class="text-xs text-slate-400">${l.purpose} • ${l.tenureMonths} mo</p>
                        </div>
                        <span class="text-xs font-bold px-2 py-1 rounded ${badgeColor}">${l.riskTier} Risk</span>
                    </div>
                    
                    <div class="grid grid-cols-2 gap-4 mb-4 mt-auto">
                        <div class="bg-slate-800/50 p-2 rounded-lg text-center border border-slate-700/50">
                            <p class="text-xs text-slate-400 mb-1">ROI</p>
                            <p class="font-bold text-indigo-400">${l.interestRate}%</p>
                        </div>
                        <div class="bg-slate-800/50 p-2 rounded-lg text-center border border-slate-700/50">
                            <p class="text-xs text-slate-400 mb-1">Match</p>
                            <p class="font-bold text-emerald-400">${(100 - l.defaultProbability).toFixed(1)}%</p>
                        </div>
                    </div>
                    
                    <button data-loan-id="${l.loanId}" data-amount="${l.amount}" class="btn-fund w-full py-2 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 rounded-lg text-sm font-medium transition-colors">
                        Fund Loan
                    </button>
                </div>
            `;
        }).join('');

        // Attach event listeners
        container.querySelectorAll('.btn-fund').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const loanId = e.target.dataset.loanId;
                const amount = parseFloat(e.target.dataset.amount);
                
                if (currentState.user.walletBalance < amount) {
                    showToast('Insufficient wallet balance.', 'error');
                    return;
                }

                try {
                    e.target.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin mx-auto"></i>`;
                    lucide.createIcons();
                    await Store.fundLoan(loanId, currentState.user.uid);
                    await Store.updateUserBalance(currentState.user.uid, -amount);
                    showToast('Loan successfully funded!', 'success');
                    initMarketplaceView(); // reload
                } catch (err) {
                    showToast('Failed to fund loan.', 'error');
                }
            });
        });
        
        lucide.createIcons();
    };

    renderLoans();

    // Filter
    document.getElementById('market-filter').addEventListener('change', (e) => {
        renderLoans(e.target.value);
    });

    // Scatter Chart (Risk vs Return)
    if(window.innerWidth >= 768 && loans.length > 0) {
        const ctx = document.getElementById('scatterChart').getContext('2d');
        const dataPoints = loans.map(l => ({
            x: l.defaultProbability, // X is risk (default prob)
            y: l.interestRate,       // Y is reward (ROI)
            r: 8
        }));

        new Chart(ctx, {
            type: 'bubble',
            data: {
                datasets: [{
                    label: 'Marketplace Loans',
                    data: dataPoints,
                    backgroundColor: 'rgba(79, 70, 229, 0.6)',
                    borderColor: 'rgba(79, 70, 229, 1)',
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        title: { display: true, text: 'Default Probability (%)', color: '#94a3b8' },
                        grid: { color: '#334155' },
                        ticks: { color: '#94a3b8' }
                    },
                    y: {
                        title: { display: true, text: 'Suggested ROI (%)', color: '#94a3b8' },
                        grid: { color: '#334155' },
                        ticks: { color: '#94a3b8' }
                    }
                },
                plugins: { legend: { display: false } }
            }
        });
    }
}

// 5. Recovery & Repayments
async function initRecoveryView() {
    const repayments = await Store.getUserRepayments(currentState.user.uid);
    const tbody = document.getElementById('repayment-ledger-body');
    const nudgesContainer = document.getElementById('ai-nudges-container');
    const isBorrower = currentState.user.role === 'borrower';
    
    if (repayments.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="px-4 py-8 text-center text-slate-500">No active repayment schedules.</td></tr>`;
        return;
    }

    // Sort by due date
    repayments.sort((a,b) => new Date(a.dueDate) - new Date(b.dueDate));

    let missedPayments = 0;
    
    tbody.innerHTML = repayments.map(r => {
        const isPaid = r.status === 'paid';
        const isOverdue = !isPaid && new Date(r.dueDate) < new Date();
        if (isOverdue) missedPayments++;

        let statusHtml = '';
        if(isPaid) statusHtml = '<span class="px-2 py-1 text-xs rounded bg-emerald-500/20 text-emerald-400">Paid</span>';
        else if(isOverdue) statusHtml = '<span class="px-2 py-1 text-xs rounded bg-rose-500/20 text-rose-400">Overdue</span>';
        else statusHtml = '<span class="px-2 py-1 text-xs rounded bg-slate-700 text-slate-300">Pending</span>';

        let actionHtml = '';
        if(isBorrower && !isPaid) {
            actionHtml = `<button data-rep-id="${r.repaymentId}" class="btn-pay px-3 py-1 bg-indigo-600 hover:bg-indigo-500 rounded text-xs transition-colors">Pay</button>`;
        } else if (!isPaid) {
            actionHtml = `<span class="text-xs text-slate-500">Waiting</span>`;
        }

        return `
            <tr class="border-b border-slate-700/50 hover:bg-slate-800/30 transition-colors">
                <td class="px-4 py-3 font-mono text-xs text-slate-400">${r.loanId.slice(-6)}</td>
                <td class="px-4 py-3 font-medium">$${r.amountDue}</td>
                <td class="px-4 py-3 text-sm">${new Date(r.dueDate).toLocaleDateString()}</td>
                <td class="px-4 py-3">${statusHtml}</td>
                <td class="px-4 py-3">${actionHtml}</td>
            </tr>
        `;
    }).join('');

    // Attach Pay event listeners
    tbody.querySelectorAll('.btn-pay').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const repId = e.target.dataset.repId;
            try {
                await Store.payInstallment(repId);
                showToast('Installment paid successfully!', 'success');
                initRecoveryView(); // reload
            } catch (err) {
                showToast('Payment failed.', 'error');
            }
        });
    });

    // --- AI Nudge Engine (Mock) ---
    if (isBorrower) {
        if (missedPayments > 0) {
            nudgesContainer.innerHTML = `
                <div class="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg animate-slide-in">
                    <p class="text-sm text-rose-400 font-medium mb-1"><i data-lucide="alert-triangle" class="w-4 h-4 inline"></i> High Risk Detected</p>
                    <p class="text-xs text-slate-300">You have ${missedPayments} overdue payment(s). AI analysis suggests restructuring your loan to avoid a severe credit score drop. Check the restructuring tool below.</p>
                </div>
            `;
            document.getElementById('btn-restructure').removeAttribute('disabled');
        } else {
            // Check if upcoming payment in next 7 days
            const upcoming = repayments.find(r => r.status !== 'paid' && (new Date(r.dueDate) - new Date()) / (1000 * 3600 * 24) <= 7);
            if (upcoming) {
                 nudgesContainer.innerHTML = `
                    <div class="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg animate-slide-in">
                        <p class="text-sm text-amber-400 font-medium mb-1"><i data-lucide="bell-ring" class="w-4 h-4 inline"></i> Behavioral Nudge</p>
                        <p class="text-xs text-slate-300">Friendly reminder: Your next EMI of $${upcoming.amountDue} is due on ${new Date(upcoming.dueDate).toLocaleDateString()}. Maintaining your perfect streak will boost your AI Credit Score.</p>
                    </div>
                `;
            } else {
                nudgesContainer.innerHTML = `<div class="text-xs text-slate-500 text-center py-4">No critical nudges currently. You're doing great!</div>`;
            }
        }
    } else {
        nudgesContainer.innerHTML = `<div class="text-xs text-slate-500 text-center py-4">Nudges are sent directly to borrowers. Your portfolio health is monitored here.</div>`;
    }
    
    // Restructure Action
    document.getElementById('btn-restructure').addEventListener('click', () => {
        showToast('AI Restructuring activated! Recalculating EMIs...', 'info');
        // Mock logic delay
        setTimeout(() => {
            showToast('EMIs successfully restructured and extended by 6 months.', 'success');
            document.getElementById('btn-restructure').setAttribute('disabled', 'true');
        }, 2000);
    });

    lucide.createIcons();
}
