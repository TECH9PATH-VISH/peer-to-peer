import '../styles.css';
import { initializeAuth } from './auth/onboarding.js';
import { loadMarketplace } from './marketplace/marketplace.js';
import { initLoanRequest } from './transactions/loan-request.js';
import { initDashboard } from './dashboard/dashboard.js';
import { initRecovery } from './transactions/recovery.js';
import { auth } from './config/firebase-config.js';
import { signOut } from 'firebase/auth';

// Navigation configuration based on roles
const roleConfig = {
  borrower: {
    defaultView: 'tpl-dashboard',
    menu: [
      { id: 'nav-dashboard', label: 'Dashboard', icon: 'layout-dashboard', template: 'tpl-dashboard' },
      { id: 'nav-loan-request', label: 'Request Loan', icon: 'file-text', template: 'tpl-loan-request' },
      { id: 'nav-recovery', label: 'Repayments', icon: 'refresh-ccw', template: 'tpl-recovery' }
    ]
  },
  lender: {
    defaultView: 'tpl-dashboard',
    menu: [
      { id: 'nav-dashboard', label: 'Dashboard', icon: 'layout-dashboard', template: 'tpl-dashboard' },
      { id: 'nav-marketplace', label: 'Marketplace', icon: 'shopping-cart', template: 'tpl-marketplace' }
    ]
  },
  agent: {
    defaultView: 'tpl-recovery',
    menu: [
      { id: 'nav-recovery', label: 'Recovery Console', icon: 'shield-alert', template: 'tpl-recovery' }
    ]
  }
};

// Initialize Authentication flow
document.addEventListener('DOMContentLoaded', () => {
  initializeAuth();

  // Handle logout
  document.getElementById('logout-btn')?.addEventListener('click', async () => {
    try {
      await signOut(auth);
      window.location.reload();
    } catch (error) {
      console.error('Logout error:', error);
    }
  });

  // Listen for auth success to setup routing and load initial data
  window.addEventListener('auth-success', (e) => {
    const role = e.detail.role;
    const config = roleConfig[role] || roleConfig['borrower'];
    
    // Update user info display
    if (auth.currentUser) {
      const userDisplay = document.getElementById('user-name-display');
      const roleDisplay = document.getElementById('user-role-display');
      const avatarDisplay = document.getElementById('user-avatar');
      
      const displayName = auth.currentUser.displayName || auth.currentUser.email?.split('@')[0] || 'User';
      if (userDisplay) userDisplay.textContent = displayName;
      if (roleDisplay) roleDisplay.textContent = role;
      if (avatarDisplay) avatarDisplay.textContent = displayName.charAt(0).toUpperCase();
    }

    setupNavigation(config.menu);
    renderView(config.defaultView);
  });
});

function setupNavigation(menuItems) {
  const navLinksContainer = document.getElementById('nav-links');
  const mobileNavLinksContainer = document.getElementById('mobile-nav-links');
  
  if (!navLinksContainer) return;
  
  navLinksContainer.innerHTML = '';
  if (mobileNavLinksContainer) mobileNavLinksContainer.innerHTML = '';

  menuItems.forEach(item => {
    const navHtml = `
      <a href="#" class="nav-item flex items-center gap-3 px-4 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-800/50 rounded-lg transition-colors" data-template="${item.template}">
        <i data-lucide="${item.icon}" class="w-4 h-4"></i> ${item.label}
      </a>
    `;
    
    navLinksContainer.insertAdjacentHTML('beforeend', navHtml);
    if (mobileNavLinksContainer) {
      mobileNavLinksContainer.insertAdjacentHTML('beforeend', navHtml);
    }
  });

  // Re-initialize icons
  if (window.lucide) window.lucide.createIcons();

  // Add click listeners to navigation links
  document.querySelectorAll('.nav-item').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      
      const templateId = e.currentTarget.getAttribute('data-template');
      
      // Update active state
      document.querySelectorAll('.nav-item').forEach(el => {
        el.classList.remove('bg-slate-800', 'text-white');
        el.classList.add('text-slate-300');
      });
      document.querySelectorAll(`.nav-item[data-template="${templateId}"]`).forEach(el => {
        el.classList.remove('text-slate-300');
        el.classList.add('bg-slate-800', 'text-white');
      });
      
      renderView(templateId);
      
      // Close mobile menu if open
      const mobileNav = document.getElementById('mobile-nav');
      if (mobileNav && !mobileNav.classList.contains('hidden')) {
        mobileNav.classList.add('hidden');
      }
    });
  });
  
  // Highlight the first item by default
  const firstNav = document.querySelector('.nav-item');
  if (firstNav) {
    firstNav.classList.remove('text-slate-300');
    firstNav.classList.add('bg-slate-800', 'text-white');
  }

  // Mobile menu toggle logic
  const mobileMenuBtn = document.getElementById('mobile-menu-btn');
  const mobileNav = document.getElementById('mobile-nav');
  if (mobileMenuBtn && mobileNav) {
    // Clone to remove previous listeners
    const newBtn = mobileMenuBtn.cloneNode(true);
    mobileMenuBtn.parentNode.replaceChild(newBtn, mobileMenuBtn);
    
    newBtn.addEventListener('click', () => {
      mobileNav.classList.toggle('hidden');
    });
  }
}

function renderView(templateId) {
  const viewContainer = document.getElementById('view-container');
  const template = document.getElementById(templateId);
  
  if (!viewContainer || !template) return;
  
  // Clear container and inject new view
  viewContainer.innerHTML = '';
  viewContainer.appendChild(template.content.cloneNode(true));
  
  // Re-initialize icons for newly rendered view
  if (window.lucide) window.lucide.createIcons();
  
  // Initialize view specific logic
  if (templateId === 'tpl-marketplace') {
    loadMarketplace();
  } else if (templateId === 'tpl-loan-request') {
    initLoanRequest();
  } else if (templateId === 'tpl-dashboard') {
    initDashboard();
  } else if (templateId === 'tpl-recovery') {
    initRecovery();
  }
}
