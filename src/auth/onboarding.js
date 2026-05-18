import { auth, db } from '../config/firebase-config.js';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  onAuthStateChanged 
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';

/**
 * Handles Firebase Auth and redirects user based on profile completeness.
 */
export function initializeAuth() {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      // User is authenticated, check if profile exists
      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);

      if (userSnap.exists()) {
        const userData = userSnap.data();
        console.log('User Profile Loaded:', userData);
        // Route to dashboard
        routeToDashboard(userData.role);
      } else {
        // Force onboarding (Profile Completion)
        console.log('User profile incomplete. Redirecting to onboarding.');
        showOnboardingForm(user);
      }
    } else {
      // User is signed out
      showAuthView();
    }
  });
}

/**
 * Signs up a new user using Firebase Auth
 */
export async function signUpUser(email, password) {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    return userCredential.user;
  } catch (error) {
    console.error("Error signing up:", error);
    throw error;
  }
}

/**
 * Completes the user profile after Auth signup
 * Required fields: Name, Phone, Role
 */
export async function completeUserProfile(user, name, phone, role) {
  try {
    const userRef = doc(db, 'users', user.uid);
    
    // Initial values
    const profileData = {
      uid: user.uid,
      name,
      phone,
      email: user.email,
      role, // 'borrower', 'lender', 'agent'
      walletBalance: 0
    };

    // If borrower, give baseline trust score
    if (role === 'borrower') {
      profileData.trustScore = 80;
    }

    await setDoc(userRef, profileData);
    console.log('Profile created successfully!');
    
    // Will automatically be handled by onAuthStateChanged, but can route manually
    routeToDashboard(role);
  } catch (error) {
    console.error("Error creating profile:", error);
  }
}

// UI Handlers
function routeToDashboard(role) {
  // Hide Auth/Onboarding, Show Dashboard based on Role
  document.getElementById('app-container').classList.remove('hidden');
  document.getElementById('mobile-header').classList.remove('hidden');
  if (window.innerWidth >= 768) {
      document.getElementById('sidebar').classList.remove('hidden');
  }
  
  // Clean up view container
  document.getElementById('view-container').innerHTML = '';
  
  // Dispatch event for main.js to handle full routing
  window.dispatchEvent(new CustomEvent('auth-success', { detail: { role } }));
}

function showOnboardingForm(user) {
  // For this prototype, if they reach here, we'll auto-complete with dummy data 
  // if they didn't go through the auth form (e.g. social login in future)
  // But our flow signs them up and creates profile immediately, so this is a fallback.
  completeUserProfile(user, 'Anonymous', '0000000000', 'borrower');
}

export function showAuthView() {
  document.getElementById('app-container').classList.add('hidden');
  
  const viewContainer = document.getElementById('view-container');
  viewContainer.innerHTML = '';
  
  const tpl = document.getElementById('tpl-auth');
  if (tpl) {
    viewContainer.appendChild(tpl.content.cloneNode(true));
    lucide.createIcons();

    const form = document.getElementById('auth-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const name = document.getElementById('auth-name').value;
      const email = document.getElementById('auth-email').value;
      const role = document.querySelector('input[name="role"]:checked').value;
      // Default password for demo
      const password = 'Password123!'; 
      
      try {
        const submitBtn = form.querySelector('button[type="submit"]');
        submitBtn.innerHTML = 'Processing...';
        submitBtn.disabled = true;

        // Sign Up (or login if exists)
        let user;
        try {
            user = await signUpUser(email, password);
        } catch (err) {
            // If already exists, try to login
            if (err.code === 'auth/email-already-in-use') {
                const { signInWithEmailAndPassword } = await import('firebase/auth');
                const cred = await signInWithEmailAndPassword(auth, email, password);
                user = cred.user;
            } else {
                throw err;
            }
        }
        
        // Complete profile (will just overwrite with same data if existing for demo purposes)
        await completeUserProfile(user, name, '555-0199', role);
        
      } catch (err) {
        console.error("Auth error", err);
        alert('Authentication failed: ' + err.message);
      }
    });
  }
}
