import { db, auth } from '../config/firebase-config.js';
import { collection, query, where, getDocs, doc, getDoc, orderBy, limit } from 'firebase/firestore';

export async function initDashboard() {
  const user = auth.currentUser;
  if (!user) return;

  try {
    // 1. Fetch user profile from Firestore
    const userRef = doc(db, 'users', user.uid);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) return;
    
    const userData = userSnap.data();
    const role = userData.role || 'borrower';
    const walletBalance = userData.walletBalance || 0;
    const trustScore = userData.trustScore || 80;

    // Update KPI Card UI elements
    const dashWalletEl = document.getElementById('dash-wallet');
    const dashActiveLoansEl = document.getElementById('dash-active-loans');
    const dashScoreEl = document.getElementById('dash-score');
    const dashMetricLabelEl = document.getElementById('dash-metric-label');
    const dashScoreLabelEl = document.getElementById('dash-score-label');

    if (dashWalletEl) {
      dashWalletEl.textContent = `$${walletBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
    }

    // 2. Fetch Loans from Firestore
    const loansRef = collection(db, 'loans');
    let q;
    if (role === 'borrower') {
      q = query(loansRef, where('borrowerId', '==', user.uid));
    } else {
      q = query(loansRef, where('lenderId', '==', user.uid));
    }

    const querySnapshot = await getDocs(q);
    const userLoans = [];
    querySnapshot.forEach(doc => {
      userLoans.push({ id: doc.id, ...doc.data() });
    });

    // Calculate Active Loans (status is active or in_recovery)
    const activeLoans = userLoans.filter(l => l.status === 'active' || l.status === 'in_recovery');
    const paidLoans = userLoans.filter(l => l.status === 'paid');

    if (dashActiveLoansEl) {
      dashActiveLoansEl.textContent = activeLoans.length;
    }

    // Role-specific settings
    if (role === 'lender') {
      if (dashMetricLabelEl) dashMetricLabelEl.textContent = 'Loans Funded';
      if (dashActiveLoansEl) dashActiveLoansEl.textContent = userLoans.filter(l => l.status !== 'requested').length;
      if (dashScoreLabelEl) dashScoreLabelEl.textContent = 'Avg Portfolio Risk';
      if (dashScoreEl) {
        dashScoreEl.textContent = 'Low Risk';
        dashScoreEl.className = 'text-3xl font-bold mt-2 text-emerald-400';
      }
    } else {
      if (dashScoreEl) {
        dashScoreEl.textContent = trustScore;
        if (trustScore < 50) {
          dashScoreEl.className = 'text-3xl font-bold mt-2 text-rose-400';
        } else if (trustScore <= 80) {
          dashScoreEl.className = 'text-3xl font-bold mt-2 text-amber-400';
        } else {
          dashScoreEl.className = 'text-3xl font-bold mt-2 text-emerald-400';
        }
      }
    }

    // 3. Render Recent Activity List
    const activityList = document.getElementById('dash-activity-list');
    if (activityList) {
      // Sort user loans by createdAt descending (if dates are present, else fallback)
      const sortedLoans = [...userLoans].sort((a, b) => {
        const dateA = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : new Date(a.createdAt || 0).getTime();
        const dateB = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : new Date(b.createdAt || 0).getTime();
        return dateB - dateA;
      });

      const displayLoans = sortedLoans.filter(l => l.status !== 'requested').slice(0, 4);

      if (displayLoans.length === 0) {
        activityList.innerHTML = `<div class="text-xs text-slate-500 text-center py-4">No recent transactions.</div>`;
      } else {
        activityList.innerHTML = displayLoans.map(l => {
          const date = l.createdAt?.seconds 
            ? new Date(l.createdAt.seconds * 1000).toLocaleDateString()
            : new Date(l.createdAt || Date.now()).toLocaleDateString();

          const isLender = role === 'lender';
          const icon = isLender ? 'arrow-up-right' : 'arrow-down-left';
          const iconBg = isLender ? 'bg-indigo-500/20 text-indigo-400' : 'bg-emerald-500/20 text-emerald-400';
          const actionText = isLender ? 'Funded Loan' : 'Loan Received';

          return `
            <div class="flex items-center justify-between p-3 rounded-lg bg-slate-800/50 border border-slate-700">
                <div class="flex items-center gap-3">
                    <div class="p-2 rounded-full ${iconBg}">
                        <i data-lucide="${icon}"></i>
                    </div>
                    <div>
                        <p class="text-sm font-medium">${actionText}</p>
                        <p class="text-xs text-slate-400">${date} • Status: <span class="capitalize font-semibold">${l.status.replace('_', ' ')}</span></p>
                    </div>
                </div>
                <div class="font-bold">$${l.amount.toLocaleString()}</div>
            </div>
          `;
        }).join('');

        if (window.lucide) window.lucide.createIcons();
      }
    }

    // 4. Render Dashboard Chart using ChartJS
    const chartCanvas = document.getElementById('dashboardChart');
    if (chartCanvas && window.Chart) {
      const ctx = chartCanvas.getContext('2d');
      // Destroy previous chart instance if exists to avoid hover errors
      const existingChart = window.Chart.getChart(chartCanvas);
      if (existingChart) {
        existingChart.destroy();
      }

      if (role === 'borrower') {
        const totalPaid = paidLoans.length;
        const totalActive = activeLoans.length;

        if (totalPaid === 0 && totalActive === 0) {
          const titleEl = document.getElementById('dash-chart-title');
          if (titleEl) titleEl.textContent = 'No active loan repayment data';
        } else {
          new window.Chart(ctx, {
            type: 'doughnut',
            data: {
              labels: ['Paid Loans', 'Active Loans'],
              datasets: [{
                data: [totalPaid, totalActive],
                backgroundColor: ['#10b981', '#1e293b'],
                borderWidth: 0,
              }]
            },
            options: {
              cutout: '75%',
              plugins: {
                legend: {
                  position: 'bottom',
                  labels: { color: '#cbd5e1' }
                }
              }
            }
          });
        }
      } else {
        // Lender Chart: Line chart for portfolio value growth (mock/simulated values)
        new window.Chart(ctx, {
          type: 'line',
          data: {
            labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
            datasets: [{
              label: 'Portfolio Value ($)',
              data: [10000, 10000 + (paidLoans.length * 500), 10500 + (paidLoans.length * 600), 11200 + (paidLoans.length * 800), 12000 + (paidLoans.length * 1000), 10000 + userLoans.filter(l => l.status === 'active').reduce((acc, curr) => acc + curr.amount, 0)],
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

  } catch (error) {
    console.error('Error loading dashboard:', error);
  }
}
