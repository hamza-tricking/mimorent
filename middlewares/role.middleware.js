const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. User not authenticated.'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Insufficient permissions.'
      });
    }

    next();
  };
};

const adminOnly = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Access denied. User not authenticated.'
    });
  }

  // Allow admin for all requests, sousAdmin for GET requests only
  if (req.user.role === 'admin') {
    return next();
  }
  
  if (req.user.role === 'sousAdmin' && req.method === 'GET') {
    return next();
  }

  return res.status(403).json({
    success: false,
    message: 'Access denied. Insufficient permissions.'
  });
};
const employerOnly = authorize('employer');
const sousAdminOnly = authorize('sousAdmin');
const adminOrSousAdmin = authorize('admin', 'sousAdmin');
const employeeOrAdmin = authorize('employee', 'admin');
const customerOrEmployeeOrAdmin = authorize('customer', 'employee', 'admin');

module.exports = {
  authorize,
  adminOnly,
  employerOnly,
  sousAdminOnly,
  adminOrSousAdmin,
  employeeOrAdmin,
  customerOrEmployeeOrAdmin
};
