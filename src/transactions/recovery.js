import { db, auth } from '../config/firebase-config.js';
import { collection, query, where, getDocs, doc, getDoc, updateDoc } from 'firebase/firestore';
import { repayLoan } from './payment.js';

function showToast(message, type = 'info') {
  const toastContainer = document.getElementById('toast-container');
  if (!toastContainer) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  let icon = 'info';
  if (type === 'success') icon = 'check-circle';
  if (type === 'error') icon = 'alert-circle';
  
  toast.innerHTML = `<i data-lucide="${icon}"></i> <span>${message}</span>`;
  toastContainer.appendChild(toast);
  if (window.lucide) window.lucide.createIcons();
  
  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

export async function initRecovery() {
  const user = auth.currentUser;
  if (!user) return;

  const tbody = document.getElementById('repayment-ledger-body');
  const nudgesContainer = document.getElementById('ai-nudges-container');
  const restructureBtn = document.getElementById('btn-restructure');

  if (!tbody) return;

  try {
    // 1. Fetch user role to filter properly
    const userRef = doc(db, 'users', user.uid);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) return;

    const userData = userSnap.data();
    const role = userData.role || 'borrower';
    const isBorrower = role === 'borrower';

    // 2. Fetch Loans from Firestore
    const loansRef = collection(db, 'loans');
    let q;

    if (role === 'borrower') {
      q = query(loansRef, where('borrowerId', '==', user.uid));
    } else if (role === 'lender') {
      q = query(loansRef, where('lenderId', '==', user.uid));
    } else {
      // Agent view: fetch all in-recovery loans
      q = query(loansRef, where('status', '==', 'in_recovery'));
    }

    const querySnapshot = await getDocs(q);
    const loans = [];
    querySnapshot.forEach(doc => {
      loans.push({ id: doc.id, ...doc.data() });
    });

    // We filter out 'requested' status (loans not funded yet don't have repayments)
    const activeAndPaidLoans = loans.filter(l => l.status !== 'requested');

    if (activeAndPaidLoans.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="px-4 py-8 text-center text-slate-500">No active repayment schedules.</td></tr>`;
      if (nudgesContainer) {
        nudgesContainer.innerHTML = `<div class="text-xs text-slate-500 text-center py-4">No critical nudges currently. You're doing great!</div>`;
      }
      if (restructureBtn) restructureBtn.setAttribute('disabled', 'true');
      return;
    }

    // Sort by due date (nearest first)
    activeAndPaidLoans.sort((a, b) => {
      const dateA = a.dueDate?.seconds ? a.dueDate.seconds * 1000 : new Date(a.dueDate || 0).getTime();
      const dateB = b.createdAt?.seconds ? b.dueDate.seconds * 1000 : new Date(b.dueDate || 0).getTime();
      return dateA - dateB;
    });

    let missedPaymentsCount = 0;
    let upcomingPayment = null;

    tbody.innerHTML = activeAndPaidLoans.map(l => {
      const isPaid = l.status === 'paid';
      const dueDateVal = l.dueDate?.seconds ? l.dueDate.seconds * 1000 : new Date(l.dueDate || Date.now()).getTime();
      const dueDate = new Date(dueDateVal);
      const isOverdue = !isPaid && dueDate < new Date();

      if (isOverdue) missedPaymentsCount++;
      if (!isPaid && !isOverdue && !upcomingPayment) {
        upcomingPayment = { ...l, dueDate };
      }

      let statusHtml = '';
      if (isPaid) {
        statusHtml = '<span class="px-2 py-1 text-xs rounded bg-emerald-500/20 text-emerald-400">Paid</span>';
      } else if (isOverdue) {
        statusHtml = '<span class="px-2 py-1 text-xs rounded bg-rose-500/20 text-rose-400">Overdue</span>';
      } else if (l.status === 'in_recovery') {
        statusHtml = '<span class="px-2 py-1 text-xs rounded bg-amber-500/20 text-amber-500">In Recovery</span>';
      } else {
        statusHtml = '<span class="px-2 py-1 text-xs rounded bg-slate-700 text-slate-300">Pending</span>';
      }

      let actionHtml = '';
      if (isBorrower && !isPaid) {
        actionHtml = `<button data-loan-id="${l.id}" class="btn-pay px-3 py-1 bg-indigo-600 hover:bg-indigo-500 rounded text-xs transition-colors">Pay</button>`;
      } else if (!isPaid) {
        actionHtml = `<span class="text-xs text-slate-500">Waiting</span>`;
      } else {
        actionHtml = `<span class="text-xs text-slate-400 flex items-center gap-1"><i data-lucide="check" class="w-3.5 h-3.5 text-emerald-400"></i> Done</span>`;
      }

      const totalAmountDue = l.amount + (l.amount * (l.interest / 100));

      return `
        <tr class="border-b border-slate-700/50 hover:bg-slate-800/30 transition-colors">
            <td class="px-4 py-3 font-mono text-xs text-slate-400">${l.id.slice(-6)}</td>
            <td class="px-4 py-3 font-medium">$${totalAmountDue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            <td class="px-4 py-3 text-sm">${dueDate.toLocaleDateString()}</td>
            <td class="px-4 py-3">${statusHtml}</td>
            <td class="px-4 py-3">${actionHtml}</td>
        </tr>
      `;
    }).join('');

    if (window.lucide) window.lucide.createIcons();

    // Attach Pay event listeners
    tbody.querySelectorAll('.btn-pay').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const loanId = e.target.getAttribute('data-loan-id');
        e.target.innerHTML = `<i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin mx-auto"></i>`;
        if (window.lucide) window.lucide.createIcons();
        e.target.disabled = true;

        try {
          await repayLoan(loanId);
          showToast('Payment successful! Your trust score and wallet balance have been updated.', 'success');
          // Reload view after a short delay
          setTimeout(() => initRecovery(), 1500);
        } catch (err) {
          console.error(err);
          showToast(err.message || 'Payment failed.', 'error');
          e.target.innerHTML = 'Pay';
          e.target.disabled = false;
        }
      });
    });

    // 3. AI Nudge Engine & Restructuring Eligibility
    if (nudgesContainer) {
      if (isBorrower) {
        if (missedPaymentsCount > 0) {
          nudgesContainer.innerHTML = `
            <div class="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg animate-slide-in">
                <p class="text-sm text-rose-400 font-medium mb-1"><i data-lucide="alert-triangle" class="w-4 h-4 inline"></i> High Risk Detected</p>
                <p class="text-xs text-slate-300">You have ${missedPaymentsCount} overdue payment(s). AI analysis suggests restructuring your loan to avoid a severe credit score drop. Check the restructuring tool below.</p>
            </div>
          `;
          if (restructureBtn) restructureBtn.removeAttribute('disabled');
        } else if (upcomingPayment) {
          const daysLeft = Math.ceil((upcomingPayment.dueDate - new Date()) / (1000 * 3600 * 24));
          const totalAmountDue = upcomingPayment.amount + (upcomingPayment.amount * (upcomingPayment.interest / 100));
          nudgesContainer.innerHTML = `
            <div class="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg animate-slide-in">
                <p class="text-sm text-amber-400 font-medium mb-1"><i data-lucide="bell-ring" class="w-4 h-4 inline"></i> Behavioral Nudge</p>
                <p class="text-xs text-slate-300">Friendly reminder: Your loan repayment of $${totalAmountDue.toLocaleString(undefined, { minimumFractionDigits: 2 })} is due in ${daysLeft} day(s). Paying on time boosts your Credit Score.</p>
            </div>
          `;
          if (restructureBtn) restructureBtn.setAttribute('disabled', 'true');
        } else {
          nudgesContainer.innerHTML = `<div class="text-xs text-slate-500 text-center py-4">No critical nudges currently. You're doing great!</div>`;
          if (restructureBtn) restructureBtn.setAttribute('disabled', 'true');
        }
      } else {
        nudgesContainer.innerHTML = `<div class="text-xs text-slate-500 text-center py-4">Nudges are sent directly to borrowers. Your portfolio health is monitored here.</div>`;
        if (restructureBtn) restructureBtn.setAttribute('disabled', 'true');
      }
    }

    // 4. AI Restructuring Trigger
    if (restructureBtn && isBorrower) {
      // Clone button to strip existing listeners
      const newRestructureBtn = restructureBtn.cloneNode(true);
      restructureBtn.parentNode.replaceChild(newRestructureBtn, restructureBtn);

      newRestructureBtn.addEventListener('click', async () => {
        showToast('AI Restructuring activated! Recalculating terms...', 'info');
        newRestructureBtn.innerHTML = `Recalculating...`;
        newRestructureBtn.disabled = true;

        try {
          // Find the first overdue loan to restructure
          const overdueLoan = activeAndPaidLoans.find(l => {
            const dueDateVal = l.dueDate?.seconds ? l.dueDate.seconds * 1000 : new Date(l.dueDate || 0).getTime();
            return l.status !== 'paid' && dueDateVal < new Date();
          });

          if (overdueLoan) {
            const loanRef = doc(db, 'loans', overdueLoan.id);
            // Extend due date by 6 months (180 days)
            const currentDueDateVal = overdueLoan.dueDate?.seconds ? overdueLoan.dueDate.seconds * 1000 : new Date(overdueLoan.dueDate || 0).getTime();
            const newDueDate = new Date(currentDueDateVal + 180 * 24 * 60 * 60 * 1000);

            await updateDoc(loanRef, {
              dueDate: newDueDate,
              interest: Math.max(2, overdueLoan.interest - 2), // lower interest rate slightly as incentive
              status: 'active' // reset status back to normal active
            });

            setTimeout(() => {
              showToast('Loan successfully restructured! Due date extended by 6 months and interest rate reduced.', 'success');
              initRecovery(); // reload
            }, 2000);
          } else {
            showToast('No eligible overdue loans found for restructuring.', 'error');
            newRestructureBtn.innerHTML = 'Analyze Eligibility';
            newRestructureBtn.removeAttribute('disabled');
          }
        } catch (err) {
          console.error(err);
          showToast('Failed to restructure loan.', 'error');
          newRestructureBtn.innerHTML = 'Analyze Eligibility';
          newRestructureBtn.removeAttribute('disabled');
        }
      });
    }

  } catch (error) {
    console.error('Error loading recovery console:', error);
    tbody.innerHTML = `<tr><td colspan="5" class="px-4 py-8 text-center text-rose-500">Failed to load repayments.</td></tr>`;
  }
}
