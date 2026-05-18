import { db } from '../config/firebase-config.js';
import { doc, runTransaction } from 'firebase/firestore';

/**
 * Handles funding a loan atomically.
 * Deducts from lender, adds to borrower, and updates loan status.
 */
export async function fundLoan(loanId, lenderId, borrowerId, amount) {
  const lenderRef = doc(db, 'users', lenderId);
  const borrowerRef = doc(db, 'users', borrowerId);
  const loanRef = doc(db, 'loans', loanId);

  await runTransaction(db, async (transaction) => {
    const lenderDoc = await transaction.get(lenderRef);
    const borrowerDoc = await transaction.get(borrowerRef);
    const loanDoc = await transaction.get(loanRef);

    if (!lenderDoc.exists() || !borrowerDoc.exists() || !loanDoc.exists()) {
      throw new Error("Missing document references for transaction.");
    }

    const lenderBalance = lenderDoc.data().walletBalance || 0;
    const borrowerBalance = borrowerDoc.data().walletBalance || 0;

    if (lenderBalance < amount) {
      throw new Error("Insufficient funds in lender wallet.");
    }

    if (loanDoc.data().status !== 'requested') {
      throw new Error("Loan is no longer available.");
    }

    // Deduct from Lender
    transaction.update(lenderRef, { walletBalance: lenderBalance - amount });
    
    // Add to Borrower
    transaction.update(borrowerRef, { walletBalance: borrowerBalance + amount });

    // Update Loan
    transaction.update(loanRef, {
      status: 'active',
      lenderId: lenderId
    });
  });
}

/**
 * Handles repayment atomically.
 * Deducts from borrower, adds to lender, updates loan status, and applies penalty if late.
 */
export async function repayLoan(loanId) {
  const loanRef = doc(db, 'loans', loanId);

  await runTransaction(db, async (transaction) => {
    const loanDoc = await transaction.get(loanRef);
    if (!loanDoc.exists()) throw new Error("Loan does not exist.");

    const loanData = loanDoc.data();
    if (loanData.status !== 'active' && loanData.status !== 'in_recovery') {
      throw new Error("Loan is not active.");
    }

    const borrowerId = loanData.borrowerId;
    const lenderId = loanData.lenderId;
    const amountDue = loanData.amount + (loanData.amount * (loanData.interest / 100)); // Simple calculation

    const borrowerRef = doc(db, 'users', borrowerId);
    const lenderRef = doc(db, 'users', lenderId);

    const borrowerDoc = await transaction.get(borrowerRef);
    const lenderDoc = await transaction.get(lenderRef);

    if (!borrowerDoc.exists() || !lenderDoc.exists()) {
      throw new Error("Missing user document references.");
    }

    const borrowerBalance = borrowerDoc.data().walletBalance || 0;
    const lenderBalance = lenderDoc.data().walletBalance || 0;

    if (borrowerBalance < amountDue) {
      throw new Error("Borrower has insufficient funds to repay.");
    }

    // Determine if late (Penalty Logic)
    let trustScoreDeduction = 0;
    const currentDate = new Date();
    const dueDate = new Date(loanData.dueDate.seconds * 1000); // Assuming Firestore timestamp

    if (currentDate > dueDate) {
      // Repayment is late, apply penalty
      trustScoreDeduction = 15; // Set penalty amount
      console.log(`Repayment is late. Penalizing Trust Score by ${trustScoreDeduction}`);
    }

    // Deduct from Borrower
    const currentTrustScore = borrowerDoc.data().trustScore || 80;
    const newTrustScore = Math.max(0, currentTrustScore - trustScoreDeduction); // Prevent negative score

    transaction.update(borrowerRef, { 
      walletBalance: borrowerBalance - amountDue,
      trustScore: newTrustScore
    });

    // Add to Lender
    transaction.update(lenderRef, { walletBalance: lenderBalance + amountDue });

    // Update Loan Status
    transaction.update(loanRef, { status: 'paid' });
  });
}
