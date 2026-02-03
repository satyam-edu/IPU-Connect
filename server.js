const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const path = require('path');

const app = express();
const PORT = 5000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  store: new pgSession({
    pool: pool,
    tableName: 'session',
    createTableIfMissing: true,
  }),
  secret: process.env.SESSION_SECRET || 'campus-helpdesk-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000,
    httpOnly: true,
    secure: false,
  }
}));

app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  next();
});

async function initDatabase() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        school VARCHAR(255),
        role VARCHAR(50) DEFAULT 'user',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add school column if it doesn't exist
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='school') THEN
          ALTER TABLE users ADD COLUMN school VARCHAR(255);
        END IF;
      END $$;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS tickets (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        category VARCHAR(100) NOT NULL,
        subject VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        priority VARCHAR(50) DEFAULT 'medium',
        status VARCHAR(50) DEFAULT 'open',
        sla_deadline TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add sla_deadline column if it doesn't exist
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tickets' AND column_name='sla_deadline') THEN
          ALTER TABLE tickets ADD COLUMN sla_deadline TIMESTAMP;
        END IF;
      END $$;
    `);

    // Add assigned_department column if it doesn't exist
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tickets' AND column_name='assigned_department') THEN
          ALTER TABLE tickets ADD COLUMN assigned_department VARCHAR(100);
        END IF;
      END $$;
    `);

    // Add is_urgent column if it doesn't exist
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tickets' AND column_name='is_urgent') THEN
          ALTER TABLE tickets ADD COLUMN is_urgent BOOLEAN DEFAULT FALSE;
        END IF;
      END $$;
    `);

    // Backfill sla_deadline for existing tickets that don't have it
    await client.query(`
      UPDATE tickets 
      SET sla_deadline = created_at + 
        CASE priority
          WHEN 'urgent' THEN INTERVAL '4 hours'
          WHEN 'high' THEN INTERVAL '24 hours'
          WHEN 'medium' THEN INTERVAL '48 hours'
          WHEN 'low' THEN INTERVAL '72 hours'
          ELSE INTERVAL '48 hours'
        END
      WHERE sla_deadline IS NULL
    `);

    // Backfill is_urgent for existing urgent priority tickets
    await client.query(`
      UPDATE tickets 
      SET is_urgent = TRUE 
      WHERE priority = 'urgent' AND (is_urgent IS NULL OR is_urgent = FALSE)
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS ticket_responses (
        id SERIAL PRIMARY KEY,
        ticket_id INTEGER REFERENCES tickets(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id),
        message TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS password_resets (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        token VARCHAR(255) UNIQUE NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        used BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        ticket_id INTEGER REFERENCES tickets(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL,
        message TEXT NOT NULL,
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const adminExists = await client.query("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
    if (adminExists.rows.length === 0) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await client.query(
        "INSERT INTO users (email, password, name, role) VALUES ($1, $2, $3, $4)",
        ['admin@campus.edu', hashedPassword, 'Admin', 'admin']
      );
    }
    
    console.log('Database initialized successfully');
  } catch (err) {
    console.error('Database initialization error:', err);
  } finally {
    client.release();
  }
}

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Please log in to continue' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.userId || req.session.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

app.post('/api/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (email, password, name) VALUES ($1, $2, $3) RETURNING id, email, name, role',
      [email, hashedPassword, name]
    );

    req.session.userId = result.rows[0].id;
    req.session.role = result.rows[0].role;

    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    req.session.regenerate((err) => {
      if (err) {
        console.error('Session regenerate error:', err);
        return res.status(500).json({ error: 'Login failed' });
      }
      req.session.userId = user.id;
      req.session.role = user.role;
      res.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role } });
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ message: 'Logged out successfully' });
});

function generateToken() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 64; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

app.post('/api/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    
    const user = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    
    if (user.rows.length === 0) {
      return res.status(404).json({ error: 'No account found with this email address' });
    }
    
    const token = generateToken();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    
    await pool.query(
      'INSERT INTO password_resets (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [user.rows[0].id, token, expiresAt]
    );
    
    console.log(`Password reset requested for ${email}. Token: ${token}`);
    
    res.json({ message: 'Reset link has been sent', token: token });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: 'Request failed' });
  }
});

app.get('/api/reset-password/:token', async (req, res) => {
  try {
    const { token } = req.params;
    
    const result = await pool.query(
      'SELECT pr.*, u.email FROM password_resets pr JOIN users u ON pr.user_id = u.id WHERE pr.token = $1 AND pr.used = FALSE AND pr.expires_at > NOW()',
      [token]
    );
    
    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired reset link' });
    }
    
    res.json({ valid: true, email: result.rows[0].email });
  } catch (err) {
    res.status(500).json({ error: 'Validation failed' });
  }
});

app.post('/api/reset-password/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;
    
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    
    const result = await pool.query(
      'SELECT * FROM password_resets WHERE token = $1 AND used = FALSE AND expires_at > NOW()',
      [token]
    );
    
    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired reset link' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    await pool.query('UPDATE users SET password = $1 WHERE id = $2', [hashedPassword, result.rows[0].user_id]);
    await pool.query('UPDATE password_resets SET used = TRUE WHERE id = $1', [result.rows[0].id]);
    
    res.json({ message: 'Password has been reset successfully' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Reset failed' });
  }
});

app.get('/api/me', requireAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, email, name, school, role FROM users WHERE id = $1', [req.session.userId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

app.put('/api/profile', requireAuth, async (req, res) => {
  try {
    const { name, school } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    let result;
    // Only update school for non-admin users
    if (req.session.role === 'admin') {
      result = await pool.query(
        'UPDATE users SET name = $1 WHERE id = $2 RETURNING id, email, name, school, role',
        [name, req.session.userId]
      );
    } else {
      result = await pool.query(
        'UPDATE users SET name = $1, school = $2 WHERE id = $3 RETURNING id, email, name, school, role',
        [name, school || null, req.session.userId]
      );
    }

    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

app.put('/api/password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    const user = await pool.query('SELECT password FROM users WHERE id = $1', [req.session.userId]);
    if (user.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const validPassword = await bcrypt.compare(currentPassword, user.rows[0].password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password = $1 WHERE id = $2', [hashedPassword, req.session.userId]);

    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    console.error('Password update error:', err);
    res.status(500).json({ error: 'Failed to update password' });
  }
});

// SLA hours based on priority
const SLA_HOURS = {
  urgent: 4,
  high: 24,
  medium: 48,
  low: 72
};

function calculateSlaDeadline(priority) {
  const hours = SLA_HOURS[priority] || SLA_HOURS.medium;
  const deadline = new Date();
  deadline.setHours(deadline.getHours() + hours);
  return deadline;
}

app.post('/api/tickets', requireAuth, async (req, res) => {
  try {
    const { category, subject, description, is_urgent } = req.body;
    if (!category || !subject || !description) {
      return res.status(400).json({ error: 'Category, subject, and description are required' });
    }

    const isUrgent = is_urgent === true;
    const ticketPriority = isUrgent ? 'urgent' : 'medium';
    const slaDeadline = isUrgent ? calculateSlaDeadline('high') : null;

    const result = await pool.query(
      'INSERT INTO tickets (user_id, category, subject, description, priority, sla_deadline, is_urgent) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [req.session.userId, category, subject, description, ticketPriority, slaDeadline, isUrgent]
    );

    res.json({ ticket: result.rows[0] });
  } catch (err) {
    console.error('Create ticket error:', err);
    res.status(500).json({ error: 'Failed to create ticket' });
  }
});

app.get('/api/tickets', requireAuth, async (req, res) => {
  try {
    let query, params;
    if (req.session.role === 'admin') {
      query = `
        SELECT t.*, u.name as user_name, u.email as user_email
        FROM tickets t
        JOIN users u ON t.user_id = u.id
        ORDER BY t.created_at DESC
      `;
      params = [];
    } else {
      query = 'SELECT * FROM tickets WHERE user_id = $1 ORDER BY created_at DESC';
      params = [req.session.userId];
    }

    const result = await pool.query(query, params);
    res.json({ tickets: result.rows });
  } catch (err) {
    console.error('Get tickets error:', err);
    res.status(500).json({ error: 'Failed to fetch tickets' });
  }
});

// Search tickets - must be before /:id route
app.get('/api/tickets/search', requireAuth, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length === 0) {
      return res.json({ tickets: [] });
    }

    const searchTerm = `%${q.trim().toLowerCase()}%`;
    let query, params;
    
    if (req.session.role === 'admin') {
      query = `
        SELECT t.*, u.name as user_name, u.email as user_email
        FROM tickets t
        JOIN users u ON t.user_id = u.id
        WHERE LOWER(t.subject) LIKE $1 OR LOWER(t.description) LIKE $1 OR LOWER(t.category) LIKE $1 OR LOWER(t.status) LIKE $1
        ORDER BY t.created_at DESC
        LIMIT 20
      `;
      params = [searchTerm];
    } else {
      query = `
        SELECT * FROM tickets
        WHERE user_id = $1 AND (LOWER(subject) LIKE $2 OR LOWER(description) LIKE $2 OR LOWER(category) LIKE $2 OR LOWER(status) LIKE $2)
        ORDER BY created_at DESC
        LIMIT 20
      `;
      params = [req.session.userId, searchTerm];
    }

    const result = await pool.query(query, params);
    res.json({ tickets: result.rows });
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: 'Search failed' });
  }
});

app.get('/api/tickets/:id', requireAuth, async (req, res) => {
  try {
    const ticketId = req.params.id;
    let ticketQuery, ticketParams;

    if (req.session.role === 'admin') {
      ticketQuery = `
        SELECT t.*, u.name as user_name, u.email as user_email
        FROM tickets t
        JOIN users u ON t.user_id = u.id
        WHERE t.id = $1
      `;
      ticketParams = [ticketId];
    } else {
      ticketQuery = 'SELECT * FROM tickets WHERE id = $1 AND user_id = $2';
      ticketParams = [ticketId, req.session.userId];
    }

    const ticketResult = await pool.query(ticketQuery, ticketParams);
    if (ticketResult.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const responsesResult = await pool.query(`
      SELECT tr.*, u.name as user_name, u.role as user_role
      FROM ticket_responses tr
      JOIN users u ON tr.user_id = u.id
      WHERE tr.ticket_id = $1
      ORDER BY tr.created_at ASC
    `, [ticketId]);

    res.json({ ticket: ticketResult.rows[0], responses: responsesResult.rows });
  } catch (err) {
    console.error('Get ticket error:', err);
    res.status(500).json({ error: 'Failed to fetch ticket' });
  }
});

// Delete ticket (users can only delete their own non-resolved/closed tickets)
app.delete('/api/tickets/:id', requireAuth, async (req, res) => {
  try {
    const ticketId = req.params.id;
    
    // Check if ticket exists and belongs to user
    const ticketCheck = await pool.query(
      'SELECT id, status, user_id FROM tickets WHERE id = $1',
      [ticketId]
    );
    
    if (ticketCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }
    
    const ticket = ticketCheck.rows[0];
    
    // Only allow users to delete their own tickets (admins can delete any)
    if (req.session.role !== 'admin' && ticket.user_id !== req.session.userId) {
      return res.status(403).json({ error: 'You can only delete your own tickets' });
    }
    
    // Users cannot delete resolved or closed tickets
    if (req.session.role !== 'admin' && (ticket.status === 'resolved' || ticket.status === 'closed')) {
      return res.status(400).json({ error: 'Cannot delete resolved or closed tickets' });
    }
    
    // Delete ticket (cascades to responses and notifications)
    await pool.query('DELETE FROM tickets WHERE id = $1', [ticketId]);
    
    res.json({ success: true, message: 'Ticket deleted successfully' });
  } catch (err) {
    console.error('Delete ticket error:', err);
    res.status(500).json({ error: 'Failed to delete ticket' });
  }
});

app.post('/api/tickets/:id/respond', requireAuth, async (req, res) => {
  try {
    const ticketId = req.params.id;
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    let ticketCheck;
    if (req.session.role === 'admin') {
      ticketCheck = await pool.query('SELECT id FROM tickets WHERE id = $1', [ticketId]);
    } else {
      ticketCheck = await pool.query('SELECT id FROM tickets WHERE id = $1 AND user_id = $2', [ticketId, req.session.userId]);
    }

    if (ticketCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const result = await pool.query(
      'INSERT INTO ticket_responses (ticket_id, user_id, message) VALUES ($1, $2, $3) RETURNING *',
      [ticketId, req.session.userId, message]
    );

    await pool.query('UPDATE tickets SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [ticketId]);

    // Create notification for ticket owner or admin
    const ticketInfo = await pool.query('SELECT user_id, subject FROM tickets WHERE id = $1', [ticketId]);
    if (ticketInfo.rows.length > 0) {
      const ticketOwnerId = ticketInfo.rows[0].user_id;
      const ticketSubject = ticketInfo.rows[0].subject;
      
      // If admin responds, notify ticket owner. If user responds, notify admins
      if (req.session.role === 'admin' && ticketOwnerId !== req.session.userId) {
        await pool.query(
          'INSERT INTO notifications (user_id, ticket_id, type, message) VALUES ($1, $2, $3, $4)',
          [ticketOwnerId, ticketId, 'response', `Staff replied to your ticket: "${ticketSubject}"`]
        );
      } else if (req.session.role !== 'admin') {
        // Notify all admins about user response
        const admins = await pool.query("SELECT id FROM users WHERE role = 'admin'");
        for (const admin of admins.rows) {
          await pool.query(
            'INSERT INTO notifications (user_id, ticket_id, type, message) VALUES ($1, $2, $3, $4)',
            [admin.id, ticketId, 'response', `New response on ticket: "${ticketSubject}"`]
          );
        }
      }
    }

    res.json({ response: result.rows[0] });
  } catch (err) {
    console.error('Add response error:', err);
    res.status(500).json({ error: 'Failed to add response' });
  }
});

app.put('/api/tickets/:id/status', requireAdmin, async (req, res) => {
  try {
    const ticketId = req.params.id;
    const { status } = req.body;

    if (!['open', 'in_progress', 'resolved', 'closed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const result = await pool.query(
      'UPDATE tickets SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [status, ticketId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    // Create notification for ticket owner about status change
    const ticket = result.rows[0];
    const statusLabels = { open: 'Open', in_progress: 'In Progress', resolved: 'Resolved', closed: 'Closed' };
    await pool.query(
      'INSERT INTO notifications (user_id, ticket_id, type, message) VALUES ($1, $2, $3, $4)',
      [ticket.user_id, ticketId, 'status_change', `Ticket "${ticket.subject}" status changed to ${statusLabels[status]}`]
    );

    res.json({ ticket: result.rows[0] });
  } catch (err) {
    console.error('Update status error:', err);
    res.status(500).json({ error: 'Failed to update ticket status' });
  }
});

app.put('/api/tickets/:id/assign', requireAdmin, async (req, res) => {
  try {
    const ticketId = req.params.id;
    const { department } = req.body;

    const validDepartments = ['IT Support', 'Facilities', 'Academic', 'Financial Aid', 'Housing', 'Other'];
    if (department && !validDepartments.includes(department)) {
      return res.status(400).json({ error: 'Invalid department' });
    }

    const result = await pool.query(
      'UPDATE tickets SET assigned_department = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [department || null, ticketId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    res.json({ ticket: result.rows[0] });
  } catch (err) {
    console.error('Assign department error:', err);
    res.status(500).json({ error: 'Failed to assign department' });
  }
});

app.get('/api/stats', requireAdmin, async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'open') as open,
        COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress,
        COUNT(*) FILTER (WHERE status = 'resolved') as resolved,
        COUNT(*) FILTER (WHERE status = 'closed') as closed
      FROM tickets
    `);

    res.json({ stats: stats.rows[0] });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Get notifications
app.get('/api/notifications', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT n.*, t.subject as ticket_subject 
       FROM notifications n 
       LEFT JOIN tickets t ON n.ticket_id = t.id 
       WHERE n.user_id = $1 
       ORDER BY n.created_at DESC 
       LIMIT 20`,
      [req.session.userId]
    );
    
    const unreadCount = await pool.query(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND is_read = FALSE',
      [req.session.userId]
    );
    
    res.json({ 
      notifications: result.rows,
      unreadCount: parseInt(unreadCount.rows[0].count)
    });
  } catch (err) {
    console.error('Get notifications error:', err);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// Mark notification as read
app.put('/api/notifications/:id/read', requireAuth, async (req, res) => {
  try {
    await pool.query(
      'UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2',
      [req.params.id, req.session.userId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

// Mark all notifications as read
app.put('/api/notifications/read-all', requireAuth, async (req, res) => {
  try {
    await pool.query(
      'UPDATE notifications SET is_read = TRUE WHERE user_id = $1',
      [req.session.userId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark all as read' });
  }
});

// Get user stats for status summary cards
app.get('/api/user-stats', requireAuth, async (req, res) => {
  try {
    let query, params;
    if (req.session.role === 'admin') {
      query = `
        SELECT 
          COUNT(*) FILTER (WHERE status = 'open') as open,
          COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress,
          COUNT(*) FILTER (WHERE status = 'resolved') as resolved
        FROM tickets
      `;
      params = [];
    } else {
      query = `
        SELECT 
          COUNT(*) FILTER (WHERE status = 'open') as open,
          COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress,
          COUNT(*) FILTER (WHERE status = 'resolved') as resolved
        FROM tickets WHERE user_id = $1
      `;
      params = [req.session.userId];
    }
    
    const result = await pool.query(query, params);
    res.json({ stats: result.rows[0] });
  } catch (err) {
    console.error('User stats error:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

initDatabase().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`IPU Connect running on http://0.0.0.0:${PORT}`);
  });
});
