let currentUser = null;
let resetToken = null;
let isDarkMode = localStorage.getItem('darkMode') === 'true';
let searchTimeout = null;

function togglePasswordVisibility(inputId, btn) {
  const input = document.getElementById(inputId);
  const eyeIcon = btn.querySelector('.eye-icon');
  const eyeOffIcon = btn.querySelector('.eye-off-icon');
  
  if (input.type === 'password') {
    input.type = 'text';
    eyeIcon.classList.add('hidden');
    eyeOffIcon.classList.remove('hidden');
  } else {
    input.type = 'password';
    eyeIcon.classList.remove('hidden');
    eyeOffIcon.classList.add('hidden');
  }
}

function toggleDarkMode() {
  isDarkMode = !isDarkMode;
  localStorage.setItem('darkMode', isDarkMode);
  applyDarkMode();
}

function applyDarkMode() {
  document.body.classList.toggle('dark-mode', isDarkMode);
  const sunIcons = document.querySelectorAll('.sun-icon');
  const moonIcons = document.querySelectorAll('.moon-icon');
  sunIcons.forEach(icon => icon.classList.toggle('hidden', isDarkMode));
  moonIcons.forEach(icon => icon.classList.toggle('hidden', !isDarkMode));
}

function setupModalOutsideClick() {
  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.add('hidden');
      }
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  applyDarkMode();
  setupModalOutsideClick();
  setupGlobalSearch();
  setupDropdownClose();
  const registerTab = document.querySelector(".auth-tabs .tab-btn[onclick*=\"register\"]");
  if (registerTab) {
    registerTab.textContent = 'Register';
  }
});

async function checkAuth() {
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('reset');
  
  if (token) {
    try {
      const res = await fetch(`/api/reset-password/${token}`);
      if (res.ok) {
        const data = await res.json();
        resetToken = token;
        document.getElementById('resetEmailDisplay').textContent = `Set a new password for ${data.email}`;
        showTab('newPassword');
        return;
      } else {
        showToast('Invalid or expired reset link', 'error');
      }
    } catch (err) {
      showToast('Invalid reset link', 'error');
    }
  }
  
  try {
    const res = await fetch('/api/me');
    if (res.ok) {
      const data = await res.json();
      currentUser = data.user;
      showDashboard();
    } else {
      hideNavForAuth();
    }
  } catch (err) {
    console.log('Not authenticated');
    hideNavForAuth();
  }
}

function showTab(tab) {
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const forgotForm = document.getElementById('forgotForm');
  const resetSuccess = document.getElementById('resetSuccess');
  const newPasswordForm = document.getElementById('newPasswordForm');
  const resetComplete = document.getElementById('resetComplete');
  const tabs = document.querySelectorAll('.auth-tabs .tab-btn');

  if (loginForm) loginForm.classList.add('hidden');
  if (registerForm) registerForm.classList.add('hidden');
  if (forgotForm) forgotForm.classList.add('hidden');
  if (resetSuccess) resetSuccess.classList.add('hidden');
  if (newPasswordForm) newPasswordForm.classList.add('hidden');
  if (resetComplete) resetComplete.classList.add('hidden');

  tabs.forEach(t => t.classList.remove('active'));

  if (tab === 'login') {
    if (loginForm) loginForm.classList.remove('hidden');
    if (tabs[0]) tabs[0].classList.add('active');
    window.history.replaceState({}, '', '/');
  } else if (tab === 'register') {
    if (registerForm) registerForm.classList.remove('hidden');
    if (tabs[1]) tabs[1].classList.add('active');
  } else if (tab === 'forgot') {
    if (forgotForm) forgotForm.classList.remove('hidden');
  } else if (tab === 'resetSuccess') {
    if (resetSuccess) resetSuccess.classList.remove('hidden');
  } else if (tab === 'newPassword') {
    if (newPasswordForm) newPasswordForm.classList.remove('hidden');
  } else if (tab === 'resetComplete') {
    if (resetComplete) resetComplete.classList.remove('hidden');
  }
}

function showForgotPassword(e) {
  e.preventDefault();
  showTab('forgot');
}

async function handleForgotPassword(e) {
  e.preventDefault();
  const email = document.getElementById('forgotEmail').value;

  try {
    const res = await fetch('/api/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });

    const data = await res.json();

    if (res.ok) {
      const resetUrl = `${window.location.origin}/?reset=${data.token}`;
      document.getElementById('resetLinkBtn').href = resetUrl;
      showTab('resetSuccess');
    } else {
      showToast(data.error, 'error');
    }
  } catch (err) {
    showToast('Something went wrong', 'error');
  }
}

async function handleResetPassword(e) {
  e.preventDefault();
  const password = document.getElementById('resetNewPassword').value;
  const confirmPassword = document.getElementById('resetConfirmPassword').value;

  if (password !== confirmPassword) {
    showToast('Passwords do not match', 'error');
    return;
  }

  try {
    const res = await fetch(`/api/reset-password/${resetToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });

    const data = await res.json();

    if (res.ok) {
      showTab('resetComplete');
    } else {
      showToast(data.error, 'error');
    }
  } catch (err) {
    showToast('Password reset failed', 'error');
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();

    if (res.ok) {
      currentUser = data.user;
      showToast('Welcome back!', 'success');
      showDashboard();
    } else {
      showToast(data.error, 'error');
    }
  } catch (err) {
    showToast('Login failed', 'error');
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const name = document.getElementById('registerName').value;
  const email = document.getElementById('registerEmail').value;
  const password = document.getElementById('registerPassword').value;

  try {
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password })
    });

    const data = await res.json();

    if (res.ok) {
      currentUser = data.user;
      showToast('Account created successfully!', 'success');
      showDashboard();
    } else {
      showToast(data.error, 'error');
    }
  } catch (err) {
    showToast('Registration failed', 'error');
  }
}

async function handleLogout() {
  try {
    await fetch('/api/logout', { method: 'POST' });
    currentUser = null;
    document.getElementById('authSection').classList.remove('hidden');
    document.getElementById('dashboardSection').classList.add('hidden');
    hideNavForAuth();
    showToast('Signed out successfully', 'success');
  } catch (err) {
    showToast('Logout failed', 'error');
  }
}

function getInitials(name) {
  return (name || '').trim().charAt(0).toUpperCase();
}

function showDashboard() {
  document.getElementById('authSection').classList.add('hidden');
  document.getElementById('dashboardSection').classList.remove('hidden');
  document.body.classList.remove('auth-page');
  document.getElementById('navCenter').classList.remove('hidden');
  document.getElementById('navLinks').classList.remove('hidden');

  document.getElementById('welcomeMsg').textContent = `Welcome, ${currentUser.name}`;

  // Update profile avatar and dropdown
  const profileAvatar = document.getElementById('profileAvatar');
  if (profileAvatar) {
    profileAvatar.textContent = getInitials(currentUser.name);
  }
  
  const profileDropdownHeader = document.getElementById('profileDropdownHeader');
  if (profileDropdownHeader) {
    profileDropdownHeader.innerHTML = `
      <div class="profile-dropdown-name">${escapeHtml(currentUser.name)}</div>
      <div class="profile-dropdown-role">${currentUser.role === 'admin' ? 'Administrator' : 'Member'}</div>
    `;
  }

  if (currentUser.role === 'admin') {
    loadStats();
    document.getElementById('adminStats').classList.remove('hidden');
    document.getElementById('newTicketBtn').classList.add('hidden');
    document.getElementById('userStatusCards').classList.add('hidden');
  } else {
    document.getElementById('adminStats').classList.add('hidden');
    document.getElementById('newTicketBtn').classList.remove('hidden');
    document.getElementById('userStatusCards').classList.remove('hidden');
    loadUserStats();
  }

  loadTickets();
  loadNotifications();
  applyDarkMode();
}

async function loadStats() {
  try {
    const res = await fetch('/api/stats');
    const data = await res.json();
    
    if (res.ok) {
      const stats = data.stats;
      document.getElementById('adminStats').innerHTML = `
        <div class="stat-card total">
          <div class="stat-header">
            <div class="stat-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/></svg>
            </div>
          </div>
          <div class="stat-value">${stats.total}</div>
          <div class="stat-label">Total Tickets</div>
        </div>
        <div class="stat-card open">
          <div class="stat-header">
            <div class="stat-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
            </div>
          </div>
          <div class="stat-value">${stats.open}</div>
          <div class="stat-label">Open</div>
        </div>
        <div class="stat-card in-progress">
          <div class="stat-header">
            <div class="stat-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4"/><path d="M12 18v4"/><path d="M4.93 4.93l2.83 2.83"/><path d="M16.24 16.24l2.83 2.83"/><path d="M2 12h4"/><path d="M18 12h4"/><path d="M4.93 19.07l2.83-2.83"/><path d="M16.24 7.76l2.83-2.83"/></svg>
            </div>
          </div>
          <div class="stat-value">${stats.in_progress}</div>
          <div class="stat-label">In Progress</div>
        </div>
        <div class="stat-card resolved">
          <div class="stat-header">
            <div class="stat-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            </div>
          </div>
          <div class="stat-value">${stats.resolved}</div>
          <div class="stat-label">Resolved</div>
        </div>
        <div class="stat-card closed">
          <div class="stat-header">
            <div class="stat-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 17H2a3 3 0 0 0 3-3V9a7 7 0 0 1 14 0v5a3 3 0 0 0 3 3zm-8.27 4a2 2 0 0 1-3.46 0"/></svg>
            </div>
          </div>
          <div class="stat-value">${stats.closed}</div>
          <div class="stat-label">Closed</div>
        </div>
      `;
    }
  } catch (err) {
    console.error('Failed to load stats:', err);
  }
}

function getSlaDisplay(slaDeadline, status) {
  if (!slaDeadline || status === 'closed' || status === 'resolved') {
    return { text: '-', class: '' };
  }
  
  const now = new Date();
  const deadline = new Date(slaDeadline);
  const diff = deadline - now;
  
  if (diff < 0) {
    return { text: 'Overdue', class: 'sla-overdue' };
  }
  
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  
  if (hours < 1) {
    return { text: `${minutes}m left`, class: 'sla-critical' };
  } else if (hours < 4) {
    return { text: `${hours}h ${minutes}m left`, class: 'sla-warning' };
  } else if (hours < 24) {
    return { text: `${hours}h left`, class: 'sla-normal' };
  } else {
    const days = Math.floor(hours / 24);
    return { text: `${days}d ${hours % 24}h left`, class: 'sla-normal' };
  }
}

async function loadTickets() {
  try {
    const res = await fetch('/api/tickets');
    const data = await res.json();

    if (res.ok) {
      const statusFilterEl = document.getElementById('statusFilter');
      const sortFilterEl = document.getElementById('sortFilter');
      const filter = statusFilterEl ? statusFilterEl.value : '';
      const sort = sortFilterEl ? sortFilterEl.value : 'newest';
      let tickets = data.tickets;

      if (filter) {
        tickets = tickets.filter(t => t.status === filter);
      }

      // Sort tickets
      const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
      if (sort === 'newest') {
        tickets.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      } else if (sort === 'oldest') {
        tickets.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      } else if (sort === 'priority') {
        tickets.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
      } else if (sort === 'sla') {
        tickets.sort((a, b) => {
          if (!a.sla_deadline) return 1;
          if (!b.sla_deadline) return -1;
          return new Date(a.sla_deadline) - new Date(b.sla_deadline);
        });
      }

      if (tickets.length === 0) {
        document.getElementById('ticketsList').innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">📭</div>
            <p>No tickets found</p>
            ${currentUser.role !== 'admin' ? '<button class="btn btn-primary btn-sm" onclick="showNewTicketModal()">Create your first ticket</button>' : ''}
          </div>
        `;
        return;
      }

      if (currentUser.role === 'admin') {
        // Admin view with improved layout
        document.getElementById('ticketsList').innerHTML = tickets.map(ticket => {
          const sla = getSlaDisplay(ticket.sla_deadline, ticket.status);
          const isOverdue = sla.class === 'sla-overdue';
          return `
          <div class="admin-ticket-card priority-urgent ${isOverdue ? 'ticket-overdue' : ''}" onclick="viewTicket(${ticket.id})">
            <div class="admin-ticket-header">
              <div class="admin-ticket-subject">${escapeHtml(ticket.subject)}</div>
              <div class="admin-ticket-badges">
                ${ticket.is_urgent ? '<span class="priority-badge urgent">Urgent</span>' : ''}
                <span class="ticket-status status-${ticket.status}">${ticket.status.replace('_', ' ')}</span>
                ${ticket.assigned_department ? `<span class="department-badge">${escapeHtml(ticket.assigned_department)}</span>` : ''}
              </div>
            </div>
            <div class="admin-ticket-info">
              <span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                ${escapeHtml(ticket.user_name || 'Unknown')}
              </span>
              <span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                ${escapeHtml(ticket.category)}
              </span>
              <span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                ${formatDate(ticket.created_at)}
              </span>
              ${ticket.is_urgent && ticket.sla_deadline ? `<span class="${sla.class}">${sla.text}</span>` : ''}
            </div>
            <div class="admin-ticket-actions" onclick="event.stopPropagation()">
              <button class="btn btn-secondary btn-sm" onclick="viewTicket(${ticket.id})">View</button>
              <select class="quick-status-select" onchange="updateTicketStatus(${ticket.id}, this.value); this.blur();" onclick="event.stopPropagation()">
                <option value="open" ${ticket.status === 'open' ? 'selected' : ''}>Open</option>
                <option value="in_progress" ${ticket.status === 'in_progress' ? 'selected' : ''}>In Progress</option>
                <option value="resolved" ${ticket.status === 'resolved' ? 'selected' : ''}>Resolved</option>
                <option value="closed" ${ticket.status === 'closed' ? 'selected' : ''}>Closed</option>
              </select>
              <button class="btn-icon-delete" onclick="showDeleteConfirm(${ticket.id}, event)" title="Delete">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
              </button>
            </div>
          </div>
        `}).join('');
      } else {
        // User view
        document.getElementById('ticketsList').innerHTML = tickets.map(ticket => {
          const sla = getSlaDisplay(ticket.sla_deadline, ticket.status);
          const isOverdue = ticket.is_urgent && sla.class === 'sla-overdue';
          const canDelete = ticket.status !== 'resolved' && ticket.status !== 'closed';
          return `
          <div class="ticket-card priority-urgent ${isOverdue ? 'ticket-overdue' : ''}" onclick="viewTicket(${ticket.id})">
            <div class="ticket-priority-indicator"></div>
            <div class="ticket-content">
              <div class="ticket-subject">${escapeHtml(ticket.subject)}</div>
              <div class="ticket-meta">
                <span>${escapeHtml(ticket.category)}</span>
                ${ticket.is_urgent ? '<span class="urgent-tag">Urgent</span>' : ''}
                <span>${formatDate(ticket.created_at)}</span>
              </div>
            </div>
            <div class="ticket-card-actions">
              <span class="ticket-status status-${ticket.status}">${ticket.status.replace('_', ' ')}</span>
              ${canDelete ? `<button class="btn-icon-delete" onclick="showDeleteConfirm(${ticket.id}, event)" title="Delete">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
              </button>` : ''}
            </div>
          </div>
        `}).join('');
      }
    }
  } catch (err) {
    console.error('Failed to load tickets:', err);
    showToast('Failed to load tickets', 'error');
  }
}

function showNewTicketModal() {
  document.getElementById('ticketModal').classList.remove('hidden');
  document.getElementById('ticketForm').reset();
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.add('hidden');
}

async function handleSubmitTicket(e) {
  e.preventDefault();

  const ticketData = {
    category: document.getElementById('ticketCategory').value,
    is_urgent: document.getElementById('ticketUrgent').checked,
    subject: document.getElementById('ticketSubject').value,
    description: document.getElementById('ticketDescription').value
  };

  try {
    const res = await fetch('/api/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ticketData)
    });

    const data = await res.json();

    if (res.ok) {
      showToast('Ticket submitted successfully!', 'success');
      closeModal('ticketModal');
      loadTickets();
      if (currentUser.role === 'admin') loadStats();
    } else {
      showToast(data.error, 'error');
    }
  } catch (err) {
    showToast('Failed to submit ticket', 'error');
  }
}

async function viewTicket(ticketId) {
  try {
    const res = await fetch(`/api/tickets/${ticketId}`);
    const data = await res.json();

    if (res.ok) {
      const { ticket, responses } = data;

      let adminControls = '';
      let userActions = '';
      
      if (currentUser.role === 'admin') {
        adminControls = `
          <div class="admin-actions">
            <div class="admin-action-group">
              <label>Status:</label>
              <select onchange="updateTicketStatus(${ticket.id}, this.value)">
                <option value="open" ${ticket.status === 'open' ? 'selected' : ''}>Open</option>
                <option value="in_progress" ${ticket.status === 'in_progress' ? 'selected' : ''}>In Progress</option>
                <option value="resolved" ${ticket.status === 'resolved' ? 'selected' : ''}>Resolved</option>
                <option value="closed" ${ticket.status === 'closed' ? 'selected' : ''}>Closed</option>
              </select>
            </div>
            <div class="admin-action-group">
              <label>Assign to:</label>
              <select onchange="assignDepartment(${ticket.id}, this.value)">
                <option value="" ${!ticket.assigned_department ? 'selected' : ''}>-- Select Department --</option>
                <option value="IT Support" ${ticket.assigned_department === 'IT Support' ? 'selected' : ''}>IT Support</option>
                <option value="Facilities" ${ticket.assigned_department === 'Facilities' ? 'selected' : ''}>Facilities</option>
                <option value="Academic" ${ticket.assigned_department === 'Academic' ? 'selected' : ''}>Academic</option>
                <option value="Financial Aid" ${ticket.assigned_department === 'Financial Aid' ? 'selected' : ''}>Financial Aid</option>
                <option value="Housing" ${ticket.assigned_department === 'Housing' ? 'selected' : ''}>Housing</option>
                <option value="Other" ${ticket.assigned_department === 'Other' ? 'selected' : ''}>Other</option>
              </select>
            </div>
          </div>
        `;
      }

      const sla = getSlaDisplay(ticket.sla_deadline, ticket.status);
      const slaHtml = ticket.is_urgent && ticket.sla_deadline ? `
        <div class="sla-info">
          <span class="sla-info-label">SLA Deadline:</span>
          <span class="sla-info-value ${sla.class}">${sla.text}</span>
          <span class="sla-info-label" style="margin-left: auto;">${new Date(ticket.sla_deadline).toLocaleString()}</span>
        </div>
      ` : '';

      document.getElementById('ticketDetailContent').innerHTML = `
        <div class="ticket-detail-header">
          <h3>${escapeHtml(ticket.subject)}</h3>
          <div class="ticket-detail-meta">
            <span class="ticket-status status-${ticket.status}">${ticket.status.replace('_', ' ')}</span>
            <span>${escapeHtml(ticket.category)}</span>
            ${ticket.is_urgent ? '<span class="urgent-tag">Urgent</span>' : ''}
            ${currentUser.role === 'admin' && ticket.assigned_department ? `<span class="department-tag">${escapeHtml(ticket.assigned_department)}</span>` : ''}
            <span>${formatDate(ticket.created_at)}</span>
            ${ticket.user_name ? `<span>by ${escapeHtml(ticket.user_name)}</span>` : ''}
          </div>
          ${slaHtml}
        </div>

        <div class="ticket-description">${escapeHtml(ticket.description)}</div>

        ${adminControls}
        ${userActions}

        <div class="responses-section">
          <h4>Conversation</h4>
          <div class="responses-list">
            ${responses.length === 0 ? '<p style="color: var(--gray-400); font-size: 0.875rem;">No responses yet</p>' : 
              responses.map(r => `
                <div class="response-item ${r.user_role === 'admin' ? 'admin-response' : ''}">
                  <div class="response-header">
                    <span class="response-user">${escapeHtml(r.user_name)} ${r.user_role === 'admin' ? '(Staff)' : ''}</span>
                    <span class="response-time">${formatDate(r.created_at)}</span>
                  </div>
                  <div class="response-message">${escapeHtml(r.message)}</div>
                </div>
              `).join('')
            }
          </div>

          <div class="response-form">
            <textarea id="responseMessage" rows="3" placeholder="Write a response..."></textarea>
            <button class="btn btn-primary btn-sm" onclick="addResponse(${ticket.id})">Send Response</button>
          </div>
        </div>
      `;

      document.getElementById('ticketDetailModal').classList.remove('hidden');
    } else {
      showToast(data.error, 'error');
    }
  } catch (err) {
    showToast('Failed to load ticket details', 'error');
  }
}

async function updateTicketStatus(ticketId, status) {
  try {
    const res = await fetch(`/api/tickets/${ticketId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });

    if (res.ok) {
      showToast('Status updated', 'success');
      loadTickets();
      loadStats();
    } else {
      const data = await res.json();
      showToast(data.error, 'error');
    }
  } catch (err) {
    showToast('Failed to update status', 'error');
  }
}

async function assignDepartment(ticketId, department) {
  try {
    const res = await fetch(`/api/tickets/${ticketId}/assign`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ department: department || null })
    });

    if (res.ok) {
      showToast(department ? `Assigned to ${department}` : 'Assignment removed', 'success');
      loadTickets();
    } else {
      const data = await res.json();
      showToast(data.error, 'error');
    }
  } catch (err) {
    showToast('Failed to assign department', 'error');
  }
}

async function addResponse(ticketId) {
  const message = document.getElementById('responseMessage').value.trim();

  if (!message) {
    showToast('Please enter a message', 'error');
    return;
  }

  try {
    const res = await fetch(`/api/tickets/${ticketId}/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message })
    });

    if (res.ok) {
      showToast('Response sent', 'success');
      viewTicket(ticketId);
    } else {
      const data = await res.json();
      showToast(data.error, 'error');
    }
  } catch (err) {
    showToast('Failed to send response', 'error');
  }
}

function showToast(message, type) {
  const toast = document.getElementById('toast');
  const icon = type === 'success' ? '✓' : '✕';
  toast.innerHTML = `<span>${icon}</span> ${message}`;
  toast.className = `toast ${type}`;
  toast.classList.remove('hidden');

  setTimeout(() => {
    toast.classList.add('hidden');
  }, 3000);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatDate(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now - date;
  
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
  });
}

function showProfileModal() {
  document.getElementById('profileName').value = currentUser.name;
  document.getElementById('profileEmail').value = currentUser.email;
  
  // Hide school field for admins
  const schoolFieldGroup = document.getElementById('schoolFieldGroup');
  if (currentUser.role === 'admin') {
    schoolFieldGroup.style.display = 'none';
  } else {
    schoolFieldGroup.style.display = 'block';
    document.getElementById('profileSchool').value = currentUser.school || '';
  }
  
  document.getElementById('profileModal').classList.remove('hidden');
}

function showSettingsModal() {
  document.getElementById('passwordForm').reset();
  document.getElementById('settingsModal').classList.remove('hidden');
}

async function handleUpdateProfile(e) {
  e.preventDefault();
  const name = document.getElementById('profileName').value;
  const school = currentUser.role === 'admin' ? null : document.getElementById('profileSchool').value;

  try {
    const res = await fetch('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, school })
    });

    const data = await res.json();

    if (res.ok) {
      currentUser = data.user;
      showToast('Profile updated successfully', 'success');
      closeModal('profileModal');
      showDashboard();
    } else {
      showToast(data.error, 'error');
    }
  } catch (err) {
    showToast('Failed to update profile', 'error');
  }
}

async function handleChangePassword(e) {
  e.preventDefault();
  const currentPassword = document.getElementById('currentPassword').value;
  const newPassword = document.getElementById('newPassword').value;
  const confirmPassword = document.getElementById('confirmPassword').value;

  if (newPassword !== confirmPassword) {
    showToast('New passwords do not match', 'error');
    return;
  }

  try {
    const res = await fetch('/api/password', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword })
    });

    const data = await res.json();

    if (res.ok) {
      showToast('Password updated successfully', 'success');
      closeModal('settingsModal');
    } else {
      showToast(data.error, 'error');
    }
  } catch (err) {
    showToast('Failed to update password', 'error');
  }
}

// Delete Ticket
let ticketToDelete = null;

function showDeleteConfirm(ticketId, e) {
  if (e) e.stopPropagation();
  ticketToDelete = ticketId;
  document.getElementById('deleteConfirmModal').classList.remove('hidden');
}

async function confirmDeleteTicket() {
  if (!ticketToDelete) return;
  
  try {
    const res = await fetch(`/api/tickets/${ticketToDelete}`, {
      method: 'DELETE'
    });
    
    const data = await res.json();
    
    if (res.ok) {
      showToast('Ticket deleted successfully', 'success');
      closeModal('deleteConfirmModal');
      closeModal('ticketDetailModal');
      loadTickets();
      if (currentUser.role !== 'admin') {
        loadUserStats();
      } else {
        loadStats();
      }
    } else {
      showToast(data.error, 'error');
    }
  } catch (err) {
    showToast('Failed to delete ticket', 'error');
  }
  
  ticketToDelete = null;
}

// Global Search
function setupGlobalSearch() {
  const searchInput = document.getElementById('globalSearch');
  const searchResults = document.getElementById('searchResults');
  
  if (!searchInput) return;
  
  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.trim();
    
    clearTimeout(searchTimeout);
    
    if (query.length < 2) {
      searchResults.classList.add('hidden');
      return;
    }
    
    searchTimeout = setTimeout(() => performSearch(query), 300);
  });
  
  searchInput.addEventListener('focus', () => {
    if (searchInput.value.trim().length >= 2) {
      searchResults.classList.remove('hidden');
    }
  });
}

async function performSearch(query) {
  const searchResults = document.getElementById('searchResults');
  
  try {
    const res = await fetch(`/api/tickets/search?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    
    if (res.ok) {
      if (data.tickets.length === 0) {
        searchResults.innerHTML = '<div class="search-no-results">No tickets found</div>';
      } else {
        searchResults.innerHTML = data.tickets.map(ticket => `
          <div class="search-result-item" onclick="viewTicketFromSearch(${ticket.id})">
            <div class="search-result-subject">${escapeHtml(ticket.subject)}</div>
            <div class="search-result-meta">
              <span>${escapeHtml(ticket.category)}</span>
              <span>${ticket.status.replace('_', ' ')}</span>
              <span>${formatDate(ticket.created_at)}</span>
            </div>
          </div>
        `).join('');
      }
      searchResults.classList.remove('hidden');
    }
  } catch (err) {
    console.error('Search error:', err);
  }
}

function viewTicketFromSearch(ticketId) {
  document.getElementById('searchResults').classList.add('hidden');
  document.getElementById('globalSearch').value = '';
  viewTicket(ticketId);
}

// Dropdown close on outside click
function setupDropdownClose() {
  document.addEventListener('click', (e) => {
    // Close search results
    const searchContainer = document.querySelector('.search-container');
    const searchResults = document.getElementById('searchResults');
    if (searchContainer && searchResults && !searchContainer.contains(e.target)) {
      searchResults.classList.add('hidden');
    }
    
    // Close notification panel
    const notifWrapper = document.querySelector('.notification-wrapper');
    const notifPanel = document.getElementById('notificationPanel');
    if (notifWrapper && notifPanel && !notifWrapper.contains(e.target)) {
      notifPanel.classList.add('hidden');
    }
    
    // Close profile dropdown
    const profileWrapper = document.querySelector('.profile-dropdown-wrapper');
    const profileDropdown = document.getElementById('profileDropdown');
    if (profileWrapper && profileDropdown && !profileWrapper.contains(e.target)) {
      profileDropdown.classList.add('hidden');
    }
  });
}

// Notifications
async function loadNotifications() {
  try {
    const res = await fetch('/api/notifications');
    const data = await res.json();
    
    if (res.ok) {
      updateNotificationBadge(data.unreadCount);
      renderNotifications(data.notifications);
    }
  } catch (err) {
    console.error('Failed to load notifications:', err);
  }
}

function updateNotificationBadge(count) {
  const badge = document.getElementById('notificationBadge');
  if (badge) {
    if (count > 0) {
      badge.textContent = count > 9 ? '9+' : count;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }
}

function renderNotifications(notifications) {
  const list = document.getElementById('notificationList');
  if (!list) return;
  
  if (notifications.length === 0) {
    list.innerHTML = '<div class="notification-empty">No notifications yet</div>';
    return;
  }
  
  list.innerHTML = notifications.map(n => `
    <div class="notification-item ${n.is_read ? '' : 'unread'}" onclick="handleNotificationClick(${n.id}, ${n.ticket_id})">
      <div class="notification-item-message">${escapeHtml(n.message)}</div>
      <div class="notification-item-time">${formatDate(n.created_at)}</div>
    </div>
  `).join('');
}

function toggleNotifications() {
  const panel = document.getElementById('notificationPanel');
  const dropdown = document.getElementById('profileDropdown');
  
  if (dropdown) dropdown.classList.add('hidden');
  panel.classList.toggle('hidden');
  
  if (!panel.classList.contains('hidden')) {
    loadNotifications();
  }
}

async function handleNotificationClick(notifId, ticketId) {
  try {
    await fetch(`/api/notifications/${notifId}/read`, { method: 'PUT' });
    loadNotifications();
    
    document.getElementById('notificationPanel').classList.add('hidden');
    
    if (ticketId) {
      viewTicket(ticketId);
    }
  } catch (err) {
    console.error('Failed to mark notification as read:', err);
  }
}

async function markAllNotificationsRead() {
  try {
    await fetch('/api/notifications/read-all', { method: 'PUT' });
    loadNotifications();
    showToast('All notifications marked as read', 'success');
  } catch (err) {
    showToast('Failed to mark notifications as read', 'error');
  }
}

// Profile Dropdown
function toggleProfileDropdown() {
  const dropdown = document.getElementById('profileDropdown');
  const panel = document.getElementById('notificationPanel');
  
  if (panel) panel.classList.add('hidden');
  dropdown.classList.toggle('hidden');
}

function closeProfileDropdown() {
  const dropdown = document.getElementById('profileDropdown');
  if (dropdown) dropdown.classList.add('hidden');
}

// User Status Cards
async function loadUserStats() {
  try {
    const res = await fetch('/api/user-stats');
    const data = await res.json();
    
    if (res.ok) {
      const stats = data.stats;
      document.getElementById('openCount').textContent = stats.open || 0;
      document.getElementById('inProgressCount').textContent = stats.in_progress || 0;
      document.getElementById('resolvedCount').textContent = stats.resolved || 0;
    }
  } catch (err) {
    console.error('Failed to load user stats:', err);
  }
}

function filterByStatus(status) {
  const statusFilter = document.getElementById('statusFilter');
  if (statusFilter) {
    statusFilter.value = status;
    loadTickets();
  }
}

// Hide navbar elements on auth page
function hideNavForAuth() {
  document.body.classList.add('auth-page');
  const navCenter = document.getElementById('navCenter');
  const navLinks = document.getElementById('navLinks');
  if (navCenter) navCenter.classList.add('hidden');
  if (navLinks) navLinks.classList.add('hidden');
}

document.addEventListener('DOMContentLoaded', checkAuth);
