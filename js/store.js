/**
 * Data Store Layer
 * Manages Mock LocalStorage and scaffolds Firebase
 */

const USE_FIREBASE = false; // Toggle this when Firebase keys are added

// --- FIREBASE SCAFFOLDING ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, updateDoc, doc, query, where } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
  // apiKey: "YOUR_API_KEY",
  // authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  // projectId: "YOUR_PROJECT_ID",
  // storageBucket: "YOUR_PROJECT_ID.appspot.com",
  // messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  // appId: "YOUR_APP_ID"
};

let app, auth, db;
if (USE_FIREBASE) {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
}

// --- MOCK DATA LAYER (LocalStorage) ---

const MOCK_DB = {
    users: JSON.parse(localStorage.getItem('users')) || [],
    loans: JSON.parse(localStorage.getItem('loans')) || [],
    repayments: JSON.parse(localStorage.getItem('repayments')) || []
};

const saveMockDB = () => {
    localStorage.setItem('users', JSON.stringify(MOCK_DB.users));
    localStorage.setItem('loans', JSON.stringify(MOCK_DB.loans));
    localStorage.setItem('repayments', JSON.stringify(MOCK_DB.repayments));
};

// Seed some initial data if empty
if (MOCK_DB.users.length === 0) {
    MOCK_DB.users.push({
        uid: 'user_mock_lender_1',
        name: 'Alice Lender',
        email: 'alice@demo.com',
        role: 'lender',
        walletBalance: 50000,
        aiCreditScore: 800
    });
    saveMockDB();
}

// --- EXPORTED API ---

export const Store = {
    // Auth
    async loginOrRegister(name, email, role) {
        if (USE_FIREBASE) {
            // Firebase implementation would go here
            console.log("Firebase Auth not fully implemented. Using mock fallback.");
        }
        
        // Mock Implementation
        let user = MOCK_DB.users.find(u => u.email === email);
        if (!user) {
            user = {
                uid: 'user_' + Date.now().toString(),
                name,
                email,
                role,
                walletBalance: role === 'lender' ? 10000 : 0,
                aiCreditScore: 650 + Math.floor(Math.random() * 150) // random 650-800
            };
            MOCK_DB.users.push(user);
            saveMockDB();
        }
        localStorage.setItem('currentUser', JSON.stringify(user));
        return user;
    },

    getCurrentUser() {
        const u = localStorage.getItem('currentUser');
        return u ? JSON.parse(u) : null;
    },

    logout() {
        localStorage.removeItem('currentUser');
    },

    // Users
    async updateUserBalance(uid, amountChange) {
        let user = MOCK_DB.users.find(u => u.uid === uid);
        if(user) {
            user.walletBalance += amountChange;
            saveMockDB();
            
            // update local current user if it's them
            const current = this.getCurrentUser();
            if(current && current.uid === uid) {
                current.walletBalance = user.walletBalance;
                localStorage.setItem('currentUser', JSON.stringify(current));
            }
        }
    },

    // Loans
    async createLoan(loanData) {
        const newLoan = {
            loanId: 'loan_' + Date.now().toString(),
            ...loanData,
            status: 'pending',
            createdAt: new Date().toISOString()
        };
        MOCK_DB.loans.push(newLoan);
        saveMockDB();
        return newLoan;
    },

    async getMarketplaceLoans() {
        return MOCK_DB.loans.filter(l => l.status === 'pending');
    },

    async getUserLoans(userId, role) {
        if (role === 'borrower') {
            return MOCK_DB.loans.filter(l => l.borrowerId === userId);
        } else {
            // Lenders: get loans they funded (simplified mock: find repayments where they are lender, then get loans)
            const fundedLoanIds = MOCK_DB.repayments.filter(r => r.lenderId === userId).map(r => r.loanId);
            return MOCK_DB.loans.filter(l => fundedLoanIds.includes(l.loanId));
        }
    },

    async fundLoan(loanId, lenderId) {
        const loan = MOCK_DB.loans.find(l => l.loanId === loanId);
        if (!loan) throw new Error("Loan not found");
        
        loan.status = 'active';
        loan.fundedBy = lenderId; // Simplified: 1-to-1 funding
        
        // Generate repayment schedule (e.g., monthly for tenure)
        const principal = loan.amount;
        const rate = loan.interestRate / 100 / 12; // monthly rate
        const n = loan.tenureMonths;
        // EMI formula: P * r * (1+r)^n / ((1+r)^n - 1)
        const emi = (principal * rate * Math.pow(1 + rate, n)) / (Math.pow(1 + rate, n) - 1);

        for (let i = 1; i <= n; i++) {
            let dueDate = new Date();
            dueDate.setMonth(dueDate.getMonth() + i);
            
            MOCK_DB.repayments.push({
                repaymentId: 'rep_' + loanId + '_' + i,
                loanId: loan.loanId,
                borrowerId: loan.borrowerId,
                lenderId: lenderId,
                amountDue: parseFloat(emi.toFixed(2)),
                dueDate: dueDate.toISOString(),
                status: 'unpaid',
                installmentNumber: i
            });
        }
        
        saveMockDB();
        return loan;
    },

    // Repayments
    async getUserRepayments(userId) {
        return MOCK_DB.repayments.filter(r => r.borrowerId === userId);
    },
    
    async payInstallment(repaymentId) {
        const rep = MOCK_DB.repayments.find(r => r.repaymentId === repaymentId);
        if(rep) {
            rep.status = 'paid';
            rep.paidAt = new Date().toISOString();
            saveMockDB();
        }
    }
};
