import express from 'express';
import { db, Store, USER_ROLES } from './db.js';
import { HttpError, sendError, userInputError, clientIp } from './http.js';

const router = express.Router();

// Helper to log actions done by Super Admin or system
async function logSuperAdminAction(req, { module, action, entityId, description, details = {} }) {
  try {
    await db.logActivity({
      userId: req.user?.id || 'USR-0001',
      userName: req.user?.name || 'Super Admin',
      userRole: req.user?.role || 'superadmin',
      storeId: req.user?.storeId || '',
      storeName: req.user?.storeName || 'HQ',
      module,
      action,
      entityId: entityId || '',
      description,
      details,
      ip: clientIp(req)
    });
  } catch (e) {
    console.error('Error logging superadmin action:', e.message);
  }
}

// Available portal modules config
export const PORTAL_MODULES = {
  admin: [
    { key: 'overview', label: 'Overview Dashboard', category: 'Dashboard', desc: 'Main business metrics and KPI cards' },
    { key: 'analytics', label: 'Financial Analytics', category: 'Dashboard', desc: 'Order breakdowns and financial metrics' },
    { key: 'cms', label: 'Live CMS Editor', category: 'Content', desc: 'Homepage and storefront content customizer' },
    { key: 'products', label: 'Products Master', category: 'Catalog', desc: 'Manage products, prices, stock, and catalog visibility' },
    { key: 'blogs', label: 'Blog Articles', category: 'Content', desc: 'Publish agronomy articles and guidance' },
    { key: 'videos', label: 'Video Library', category: 'Content', desc: 'Educational YouTube and video reels' },
    { key: 'users', label: 'Users & Staff', category: 'Operations', desc: 'Manage store staff credentials and accounts' },
    { key: 'profile-fields', label: 'Profile Builder', category: 'Operations', desc: 'Custom farmer registration form fields' },
    { key: 'orders', label: 'Order Management', category: 'Operations', desc: 'View, update, and manage farmer orders' },
    { key: 'subscribers', label: 'Advisory Subscribers', category: 'Advisory', desc: 'Farmer WhatsApp advisory broadcasting' },
    { key: 'enquiries', label: 'Farmer Enquiries', category: 'Advisory', desc: 'Technical pest/disease enquiries' },
    { key: 'employees', label: 'Employees Directory', category: 'Operations', desc: 'Staff records and assignments' },
    { key: 'coupons', label: 'Coupons & Credits', category: 'Marketing', desc: 'Discount voucher generator' },
    { key: 'referrals', label: 'Referrals & Points', category: 'Marketing', desc: 'Farmer loyalty points ledger' },
    { key: 'support-tickets', label: 'Support Tickets', category: 'Support', desc: 'Issue tracking and customer grievances' },
    { key: 'soil-reports', label: 'Soil Test Reports', category: 'Support', desc: 'Diagnose, prescribe, and assign farmer soil lab reports' },
    { key: 'tickets', label: 'Notifications', category: 'Support', desc: 'System alert broadcast' },
    { key: 'chat', label: 'Chat Records', category: 'Support', desc: 'WhatsApp & web chatbot sessions' },
    { key: 'billing', label: 'Billing POS Access', category: 'Billing', desc: 'Direct access to store billing terminal' }
  ],
  employee: [
    { key: 'tasks', label: 'Daily Operations & Tasks', category: 'Operations', desc: 'Staff task manager' },
    { key: 'inventory', label: 'Stock & Inventory Monitor', category: 'Operations', desc: 'Warehouse stock counts' },
    { key: 'tickets', label: 'Customer Tickets & Queries', category: 'Support', desc: 'Resolve farmer support tickets' },
    { key: 'soil-reports', label: 'Soil Test Reports', category: 'Support', desc: 'Manage assigned farmer soil reports and write prescriptions' },
    { key: 'chat', label: 'Chat Inquiries', category: 'Support', desc: 'View farmer chat inquiries' }
  ],
  billing: [
    { key: 'pos', label: 'Create New GST Bill / POS', category: 'Billing', desc: 'Point of sale counter terminal' },
    { key: 'history', label: 'Invoice History & Reprints', category: 'Billing', desc: 'Search and reprint past GST tax invoices' },
    { key: 'reports', label: 'Daily Collection Summary', category: 'Billing', desc: 'End of day sales and tax reports' }
  ],
  delivery: [
    { key: 'dashboard', label: 'Assigned Shipments', category: 'Delivery', desc: 'Orders assigned for door delivery' },
    { key: 'otp', label: 'OTP Verification', category: 'Delivery', desc: 'Verify customer delivery pin on handover' },
    { key: 'status', label: 'Delivery Status Updates', category: 'Delivery', desc: 'Mark out for delivery or returned' }
  ]
};

// ================= STATS =================
router.get('/stats', async (req, res) => {
  try {
    const [stores, allUsers, logsCount] = await Promise.all([
      db.getStores(),
      db.getUsers(),
      db.getActivityLogs({ limit: 1 })
    ]);

    const stats = {
      totalStores: stores.length,
      activeStores: stores.filter(s => s.status === 'active').length,
      totalAdmins: allUsers.filter(u => u.role === 'admin').length,
      totalEmployees: allUsers.filter(u => u.role === 'employee').length,
      totalBilling: allUsers.filter(u => u.role === 'billing').length,
      totalDelivery: allUsers.filter(u => u.role === 'delivery').length,
      totalFarmers: allUsers.filter(u => u.role === 'farmer').length,
      totalActivityLogs: logsCount.total || 0,
      stores
    };

    res.json({ success: true, data: stats });
  } catch (err) {
    sendError(res, err, 'SuperAdmin Stats');
  }
});

// ================= STORES =================
router.get('/stores', async (req, res) => {
  try {
    const stores = await db.getStores();
    res.json({ success: true, data: stores, stores });
  } catch (err) {
    sendError(res, err, 'List stores');
  }
});

router.post('/stores', async (req, res) => {
  try {
    const { name, code, location, address, phone, email, adminId, adminName, status } = req.body || {};
    if (!name || !location) {
      throw new HttpError(400, 'Store name and location are required.');
    }

    const store = await db.createStore({
      name,
      code,
      location,
      address,
      phone,
      email,
      adminId,
      adminName,
      status: status || 'active'
    });

    await logSuperAdminAction(req, {
      module: 'STORES',
      action: 'CREATE_STORE',
      entityId: store.id,
      description: `Created new store location "${store.name}" in ${store.location}`,
      details: store
    });

    res.json({ success: true, store });
  } catch (err) {
    sendError(res, err, 'Create store');
  }
});

router.put('/stores/:id', async (req, res) => {
  try {
    const existing = await db.getStoreById(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Store not found' });
    }

    // A moved store is located again (its map point picks the nearest store
    // for support tickets, server/ticketRouting.js).
    const body = { ...(req.body || {}) };
    const moved = ['address', 'location'].some(k => body[k] !== undefined && String(body[k]).trim() !== String(existing[k] || '').trim());
    if (moved) body.geo = null;
    const updated = await db.updateStore(req.params.id, body);

    await logSuperAdminAction(req, {
      module: 'STORES',
      action: 'UPDATE_STORE',
      entityId: req.params.id,
      description: `Updated store location "${updated.name}" (${updated.location})`,
      details: { before: existing, after: updated }
    });

    res.json({ success: true, store: updated });
  } catch (err) {
    sendError(res, err, 'Update store');
  }
});

router.delete('/stores/:id', async (req, res) => {
  try {
    const existing = await db.getStoreById(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Store not found' });
    }

    await db.deleteStore(req.params.id);

    await logSuperAdminAction(req, {
      module: 'STORES',
      action: 'DELETE_STORE',
      entityId: req.params.id,
      description: `Deleted store "${existing.name}" (${req.params.id})`,
      details: existing
    });

    res.json({ success: true, message: 'Store deleted successfully' });
  } catch (err) {
    sendError(res, err, 'Delete store');
  }
});

// ================= USERS & HIERARCHY =================
router.get('/users', async (req, res) => {
  try {
    const { role, storeId, search, status } = req.query;
    // Super admin accounts are never listed: not their number, not that they exist.
    let users = (await db.getUsers()).filter(u => u.role !== 'superadmin');

    // Default: show staff roles unless specific filter requested
    if (role && role !== 'all') {
      users = users.filter(u => u.role === role);
    }
    if (storeId && storeId !== 'all') {
      users = users.filter(u => u.storeId === storeId);
    }
    if (status && status !== 'all') {
      users = users.filter(u => (u.status || 'active') === status);
    }
    if (search) {
      const q = search.toLowerCase().trim();
      users = users.filter(u =>
        u.name?.toLowerCase().includes(q) ||
        u.phone?.includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        u.storeName?.toLowerCase().includes(q) ||
        u.storeLocation?.toLowerCase().includes(q)
      );
    }

    res.json({ success: true, data: users });
  } catch (err) {
    sendError(res, err, 'List superadmin users');
  }
});

router.post('/users', async (req, res) => {
  try {
    const {
      name, phone, email, password, role,
      storeId, storeName, storeLocation,
      assignedAdminId, assignedAdminName,
      department, status, permissions
    } = req.body || {};

    if (!phone && !email) {
      throw new HttpError(400, 'Mobile number or email is required.');
    }
    if (!password) {
      throw new HttpError(400, 'Password is required.');
    }
    if (!['admin', 'employee', 'billing', 'delivery'].includes(role)) {
      throw new HttpError(400, 'Please choose a valid role (admin, employee, billing, delivery).');
    }

    // Default all modules if none specified
    let userPermissions = permissions;
    if (!userPermissions || !userPermissions.length) {
      userPermissions = (PORTAL_MODULES[role] || []).map(m => m.key);
    }

    const created = await db.createUser({
      name: name?.trim() || `${role.toUpperCase()} User`,
      phone,
      email,
      password,
      role,
      storeId: storeId || '',
      storeName: storeName || '',
      storeLocation: storeLocation || '',
      assignedAdminId: assignedAdminId || '',
      assignedAdminName: assignedAdminName || '',
      department: department || '',
      status: status || 'active',
      permissions: userPermissions,
      createdBy: 'superadmin'
    });

    // If this new user is an Admin assigned to a store, link store's adminId
    if (role === 'admin' && storeId) {
      await db.updateStore(storeId, { adminId: created.id, adminName: created.name });
    }

    await logSuperAdminAction(req, {
      module: 'USERS',
      action: 'CREATE_USER',
      entityId: created.id,
      description: `Created new ${role} "${created.name}" assigned to store ${storeName || 'Global'}`,
      details: { role, storeId, storeName, assignedAdminName }
    });

    res.json({ success: true, user: created });
  } catch (err) {
    sendError(res, userInputError(err), 'Create user');
  }
});

router.put('/users/:id', async (req, res) => {
  try {
    const existing = await db.getUserById(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const updates = { ...req.body };
    // Disallow removing superadmin role from yourself
    if (req.params.id === req.user.id && updates.role && updates.role !== 'superadmin') {
      throw new HttpError(400, 'You cannot remove your own Super Admin access.');
    }

    const updated = await db.updateUser(req.params.id, updates);

    // If this is an admin and store changed, update store
    if (updated.role === 'admin' && updates.storeId && updates.storeId !== existing.storeId) {
      await db.updateStore(updates.storeId, { adminId: updated.id, adminName: updated.name });
    }

    await logSuperAdminAction(req, {
      module: 'USERS',
      action: 'UPDATE_USER',
      entityId: req.params.id,
      description: `Updated profile for ${updated.name} (${updated.role})`,
      details: { changedFields: Object.keys(updates) }
    });

    res.json({ success: true, user: updated });
  } catch (err) {
    sendError(res, userInputError(err), 'Update user');
  }
});

// ================= PERMISSIONS & VISIBILITY CONTROL =================
router.put('/users/:id/permissions', async (req, res) => {
  try {
    const { permissions } = req.body || {};
    if (!Array.isArray(permissions)) {
      throw new HttpError(400, 'Permissions must be an array of module keys.');
    }

    const existing = await db.getUserById(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const updated = await db.updateUser(req.params.id, { permissions });

    const added = permissions.filter(p => !(existing.permissions || []).includes(p));
    const removed = (existing.permissions || []).filter(p => !permissions.includes(p));

    await logSuperAdminAction(req, {
      module: 'PERMISSIONS',
      action: 'PERMISSION_CHANGE',
      entityId: req.params.id,
      description: `Updated module permissions for ${existing.name} (${existing.role}): ${permissions.length} modules enabled`,
      details: {
        userId: existing.id,
        userName: existing.name,
        role: existing.role,
        modulesGranted: added,
        modulesRevoked: removed,
        activePermissions: permissions
      }
    });

    res.json({ success: true, permissions: updated.permissions });
  } catch (err) {
    sendError(res, err, 'Update permissions');
  }
});

// ================= WORK LOGS & AUDIT MONITOR =================
router.get('/work-logs', async (req, res) => {
  try {
    const result = await db.getActivityLogs(req.query);
    res.json({ success: true, ...result });
  } catch (err) {
    sendError(res, err, 'Get activity logs');
  }
});

// ================= PORTAL MODULES CONFIG =================
router.get('/modules-config', (req, res) => {
  res.json({ success: true, data: PORTAL_MODULES });
});

// ================= SUPER ADMIN - ALL SHOPS ANALYTICS =================
router.get('/analytics', async (req, res) => {
  try {
    const { storeId, from, to } = req.query;
    const [stores, allUsers, allInvoices] = await Promise.all([
      db.getStores(),
      db.getUsers(),
      db.getInvoicesAllStores({ storeId, from, to })
    ]);

    // If a specific store is requested, filter target stores
    const targetStores = (storeId && storeId !== 'all')
      ? stores.filter(s => s.id === storeId || s.code === storeId)
      : stores;

    // Build store-level maps
    const storeMap = {};
    targetStores.forEach(s => {
      storeMap[s.id] = {
        id: s.id,
        code: s.code || s.id,
        name: s.name,
        location: s.location,
        status: s.status,
        adminName: s.adminName || '—',
        totalBills: 0,
        grossSales: 0,
        totalGst: 0,
        cash: 0,
        upi: 0,
        credit: 0,
        bankTransfer: 0,
        staffCount: 0,
      };
    });

    // Assign staff counts per store
    allUsers.forEach(u => {
      if (u.storeId && storeMap[u.storeId] && u.role !== 'superadmin') {
        storeMap[u.storeId].staffCount += 1;
      }
    });

    // Aggregate invoice metrics
    let totalGrossSales = 0;
    let totalGstCollected = 0;
    let totalInvoiceCount = 0;
    let totalCash = 0, totalUpi = 0, totalCredit = 0, totalBank = 0;

    // Revenue by date (for trend charts)
    const revenueByDate = {};
    // Product sales aggregation
    const productSalesMap = {};

    allInvoices.forEach(inv => {
      const amt = Number(inv.grandTotal || 0);
      const gst = Number(inv.totalGst || 0);
      const mode = (inv.paymentMode || '').toLowerCase();
      const dateKey = (inv.date || '').slice(0, 10);
      const storeCode = inv.storeCode || inv.storeId || 'UNKNOWN';

      totalGrossSales += amt;
      totalGstCollected += gst;
      totalInvoiceCount += 1;

      if (mode.includes('cash')) { totalCash += amt; }
      else if (mode.includes('upi')) { totalUpi += amt; }
      else if (mode.includes('credit')) { totalCredit += amt; }
      else if (mode.includes('bank') || mode.includes('transfer')) { totalBank += amt; }

      // Date-based trend
      if (dateKey) {
        if (!revenueByDate[dateKey]) revenueByDate[dateKey] = { date: dateKey, total: 0, stores: {} };
        revenueByDate[dateKey].total += amt;
        if (!revenueByDate[dateKey].stores[storeCode]) revenueByDate[dateKey].stores[storeCode] = 0;
        revenueByDate[dateKey].stores[storeCode] += amt;
      }

      // Store breakdown
      if (inv.storeId && storeMap[inv.storeId]) {
        storeMap[inv.storeId].totalBills += 1;
        storeMap[inv.storeId].grossSales += amt;
        storeMap[inv.storeId].totalGst += gst;
        if (mode.includes('cash')) storeMap[inv.storeId].cash += amt;
        else if (mode.includes('upi')) storeMap[inv.storeId].upi += amt;
        else if (mode.includes('credit')) storeMap[inv.storeId].credit += amt;
        else if (mode.includes('bank')) storeMap[inv.storeId].bankTransfer += amt;
      }

      // Product aggregation
      (inv.items || []).forEach(item => {
        const pname = item.name || 'Unknown Product';
        if (!productSalesMap[pname]) productSalesMap[pname] = { name: pname, unitsSold: 0, revenue: 0 };
        productSalesMap[pname].unitsSold += Number(item.qty || 0);
        productSalesMap[pname].revenue += Number(item.lineTotal || 0);
      });
    });

    const storeBreakdown = Object.values(storeMap).map(s => ({
      ...s,
      grossSales: Math.round(s.grossSales * 100) / 100,
      totalGst: Math.round(s.totalGst * 100) / 100,
      cash: Math.round(s.cash * 100) / 100,
      upi: Math.round(s.upi * 100) / 100,
      credit: Math.round(s.credit * 100) / 100,
      bankTransfer: Math.round(s.bankTransfer * 100) / 100,
    }));

    // Sort by grossSales desc to find top performer
    const sorted = [...storeBreakdown].sort((a, b) => b.grossSales - a.grossSales);
    const topStore = sorted[0] || null;

    const revenueTrend = Object.values(revenueByDate)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(d => ({ ...d, total: Math.round(d.total * 100) / 100 }));

    const topProducts = Object.values(productSalesMap)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 20)
      .map(p => ({ ...p, revenue: Math.round(p.revenue * 100) / 100 }));

    res.json({
      success: true,
      data: {
        kpis: {
          totalGrossSales: Math.round(totalGrossSales * 100) / 100,
          totalGstCollected: Math.round(totalGstCollected * 100) / 100,
          totalInvoiceCount,
          avgBillValue: totalInvoiceCount > 0
            ? Math.round((totalGrossSales / totalInvoiceCount) * 100) / 100
            : 0,
          totalActiveStores: stores.filter(s => s.status === 'active').length,
          totalStores: stores.length,
          topStore: topStore ? { name: topStore.name, code: topStore.code, grossSales: topStore.grossSales } : null,
          paymentMix: {
            cash: Math.round(totalCash * 100) / 100,
            upi: Math.round(totalUpi * 100) / 100,
            credit: Math.round(totalCredit * 100) / 100,
            bankTransfer: Math.round(totalBank * 100) / 100,
          }
        },
        storeBreakdown,
        revenueTrend,
        topProducts,
      }
    });
  } catch (err) {
    sendError(res, err, 'SuperAdmin Analytics');
  }
});

// Super Admin can view all invoices across all stores
router.get('/all-invoices', async (req, res) => {
  try {
    const { storeId, storeCode, from, to, limit } = req.query;
    let invoices = await db.getInvoicesAllStores({ storeId, storeCode, from, to });
    if (limit) invoices = invoices.slice(0, Number(limit));
    res.json({ success: true, data: invoices, total: invoices.length });
  } catch (err) {
    sendError(res, err, 'SuperAdmin All Invoices');
  }
});

export default router;
