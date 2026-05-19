import { db, auth } from '../config/firebase-config.js';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { fundLoan } from '../transactions/payment.js';

/**
 * Fetches all requested loans and attaches the borrower's trust score.
 */
export async function loadMarketplace() {
  const marketplaceList = document.getElementById('marketplace-list');
  marketplaceList.innerHTML = '<p class="text-slate-400">Loading marketplace...</p>';

  try {
    const loansRef = collection(db, 'loans');
    const q = query(loansRef, where('status', '==', 'requested'));
    const querySnapshot = await getDocs(q);

    marketplaceList.innerHTML = ''; // Clear loading

    if (querySnapshot.empty) {
      marketplaceList.innerHTML = '<p class="text-slate-400">No loans currently requested.</p>';
      return;
    }

    for (const loanDoc of querySnapshot.docs) {
      const loanData = loanDoc.data();
      const loanId = loanDoc.id;

      // Fetch borrower's trust score
      const borrowerRef = doc(db, 'users', loanData.borrowerId);
      const borrowerSnap = await getDoc(borrowerRef);
      
      let trustScore = 80; // Default fallback
      if (borrowerSnap.exists()) {
        trustScore = borrowerSnap.data().trustScore;
      }

      // Render Card
      const cardHTML = generateLoanCard(loanId, loanData, trustScore);
      marketplaceList.insertAdjacentHTML('beforeend', cardHTML);
    }

    // Attach event listeners to funding buttons
    document.querySelectorAll('.btn-fund').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const loanId = e.target.getAttribute('data-id');
        const borrowerId = e.target.getAttribute('data-borrower');
        const amount = parseFloat(e.target.getAttribute('data-amount'));
        
        const lenderId = auth.currentUser ? auth.currentUser.uid : null;
        if (!lenderId) {
          alert('You must be logged in to fund a loan.');
          return;
        }
        
        await handleFunding(loanId, lenderId, borrowerId, amount);
      });
    });

  } catch (error) {
    console.error('Error loading marketplace:', error);
    marketplaceList.innerHTML = '<p class="text-danger">Failed to load marketplace data.</p>';
  }
}

function generateLoanCard(loanId, loanData, trustScore) {
  // Trust Score Visuals & Penalty: Green (>80), Yellow (50-80), Red (<50)
  let borderColor = 'border-success'; // Green
  let badgeColor = 'bg-success/20 text-success';
  let trustLabel = 'High Trust';

  if (trustScore < 50) {
    borderColor = 'border-danger'; // Red
    badgeColor = 'bg-danger/20 text-danger';
    trustLabel = 'High Risk';
  } else if (trustScore <= 80) {
    borderColor = 'border-amber-500'; // Yellow
    badgeColor = 'bg-amber-500/20 text-amber-500';
    trustLabel = 'Medium Risk';
  }

  return `
    <div class="glass-panel p-6 rounded-xl border-t-4 ${borderColor} relative">
      <div class="absolute top-4 right-4 px-2 py-1 rounded text-xs font-bold ${badgeColor}">
        Score: ${trustScore} (${trustLabel})
      </div>
      <h3 class="text-lg font-bold mb-1">$${loanData.amount}</h3>
      <p class="text-sm text-slate-400 mb-4">Interest: ${loanData.interest}% | Due: ${new Date(loanData.dueDate.seconds * 1000).toLocaleDateString()}</p>
      <button class="btn-fund w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors"
        data-id="${loanId}" data-borrower="${loanData.borrowerId}" data-amount="${loanData.amount}">
        Fund Loan
      </button>
    </div>
  `;
}

async function handleFunding(loanId, lenderId, borrowerId, amount) {
  try {
    console.log(`Funding loan ${loanId}...`);
    await fundLoan(loanId, lenderId, borrowerId, amount);
    console.log('Successfully funded loan!');
    loadMarketplace(); // Refresh marketplace
  } catch (error) {
    console.error('Funding failed:', error);
    alert('Transaction failed. Check console for details.');
  }
}
