import { db, auth } from '../config/firebase-config.js';
import { collection, addDoc, doc, getDoc } from 'firebase/firestore';

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

export function initLoanRequest() {
  const analyzeBtn = document.getElementById('btn-analyze-risk');
  const submitBtn = document.getElementById('btn-submit-loan');
  const reportPanel = document.getElementById('ai-report-panel');
  
  if (!analyzeBtn || !submitBtn || !reportPanel) return;

  let aiAssessmentResult = null;

  analyzeBtn.addEventListener('click', async () => {
    const amountVal = document.getElementById('lr-amount').value;
    const tenureVal = document.getElementById('lr-tenure').value;
    const purposeVal = document.getElementById('lr-purpose').value;
    const incomeVal = document.getElementById('lr-income').value;
    const debtsVal = document.getElementById('lr-debts').value;

    const amount = parseFloat(amountVal);
    const tenure = parseInt(tenureVal);
    const purpose = purposeVal.trim();
    const income = parseFloat(incomeVal);
    const debts = parseFloat(debtsVal || 0);

    if (isNaN(amount) || isNaN(income) || !purpose) {
      showToast('Please fill out all required fields with valid numbers.', 'error');
      return;
    }

    analyzeBtn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin text-indigo-400"></i> Analyzing...`;
    if (window.lucide) window.lucide.createIcons();

    try {
      // Get borrower's trust score from Firestore
      let trustScore = 80;
      if (auth.currentUser) {
        const userRef = doc(db, 'users', auth.currentUser.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          trustScore = userSnap.data().trustScore || 80;
        }
      }

      // Simple AI Mock Assessment Heuristics
      const dti = (debts + (amount / tenure)) / income;
      const ati = amount / (income * 12);
      
      let riskScore = 100 - (dti * 100) - (ati * 100);
      riskScore += (trustScore - 60) / 2;

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
        tier,
        rate,
        prob,
        amount,
        tenure,
        purpose,
        income,
        debts
      };

      // Display Report
      const reportTierEl = document.getElementById('report-tier');
      const reportProbEl = document.getElementById('report-prob');
      const reportRateEl = document.getElementById('report-rate');

      if (reportTierEl) {
        reportTierEl.textContent = `${tier} Risk`;
        reportTierEl.className = `font-bold px-2 py-1 rounded text-xs ${tierColor} ${bgTierColor}`;
      }
      if (reportProbEl) {
        reportProbEl.textContent = `${prob}%`;
      }
      if (reportRateEl) {
        reportRateEl.textContent = `${rate}%`;
      }

      reportPanel.classList.remove('hidden');
      showToast('AI Risk Assessment Complete!', 'success');

    } catch (err) {
      console.error(err);
      showToast('Error running AI Assessment.', 'error');
    } finally {
      analyzeBtn.innerHTML = `<i data-lucide="cpu" class="w-4 h-4 text-indigo-400"></i> Run AI Assessment`;
      if (window.lucide) window.lucide.createIcons();
    }
  });

  submitBtn.addEventListener('click', async () => {
    if (!aiAssessmentResult) {
      showToast('Please run AI Assessment first.', 'error');
      return;
    }

    if (!auth.currentUser) {
      showToast('You must be logged in to submit a loan request.', 'error');
      return;
    }

    submitBtn.innerHTML = `Processing...`;
    submitBtn.disabled = true;

    try {
      const dueDate = new Date();
      dueDate.setMonth(dueDate.getMonth() + aiAssessmentResult.tenure);

      const loanData = {
        borrowerId: auth.currentUser.uid,
        borrowerName: auth.currentUser.displayName || auth.currentUser.email.split('@')[0],
        amount: aiAssessmentResult.amount,
        interest: aiAssessmentResult.rate,
        dueDate: dueDate,
        status: 'requested',
        purpose: aiAssessmentResult.purpose,
        tenure: aiAssessmentResult.tenure,
        tenureMonths: aiAssessmentResult.tenure,
        riskTier: aiAssessmentResult.tier,
        defaultProbability: aiAssessmentResult.prob,
        createdAt: new Date()
      };

      await addDoc(collection(db, 'loans'), loanData);
      showToast('Loan request posted to marketplace!', 'success');

      // Navigate back to dashboard by triggering click on the nav item
      const navDash = document.getElementById('nav-dashboard') || document.querySelector('[data-template="tpl-dashboard"]');
      if (navDash) {
        navDash.click();
      } else {
        window.location.reload();
      }

    } catch (err) {
      console.error(err);
      showToast('Failed to post loan request.', 'error');
      submitBtn.innerHTML = `Confirm & Post to Marketplace`;
      submitBtn.disabled = false;
    }
  });
}
