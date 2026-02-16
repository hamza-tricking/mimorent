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

const adminOnly = authorize('admin');
const employeeOrAdmin = authorize('employee', 'admin');
const customerOrEmployeeOrAdmin = authorize('customer', 'employee', 'admin');

module.exports = {
  authorize,
  adminOnly,
  employeeOrAdmin,
  customerOrEmployeeOrAdmin
};
