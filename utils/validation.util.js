const Joi = require('joi');

const validateRequest = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body);
    if (error) {
      const errorMessage = error.details.map(detail => detail.message).join(', ');
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        error: errorMessage
      });
    }
    next();
  };
};

const userValidationSchema = Joi.object({
  firstName: Joi.string().trim().min(2).max(50).required(),
  lastName: Joi.string().trim().min(2).max(50).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  phone: Joi.string().trim().max(20).optional(),
  role: Joi.string().valid('admin', 'employee', 'customer').optional(),
  dateOfBirth: Joi.date().optional(),
  address: Joi.object({
    street: Joi.string().trim().optional(),
    city: Joi.string().trim().optional(),
    wilaya: Joi.string().trim().optional(),
    zipCode: Joi.string().trim().optional()
  }).optional()
});

const propertyValidationSchema = Joi.object({
  title: Joi.string().trim().min(3).max(200).required(),
  type: Joi.string().valid('apartment', 'villa', 'shop').required(),
  wilaya: Joi.string().trim().min(2).max(50).required(),
  office: Joi.string().hex().length(24).required(),
  prices: Joi.object({
    daily: Joi.number().min(0).optional(),
    monthly: Joi.number().min(0).optional(),
    yearly: Joi.number().min(0).optional()
  }).required(),
  status: Joi.string().valid('available', 'inactive').optional(),
  rooms: Joi.number().integer().min(0).optional(),
  bathrooms: Joi.number().integer().min(0).optional(),
  description: Joi.string().trim().max(2000).optional(),
  features: Joi.array().items(Joi.string().trim().max(100)).optional(),
  images: Joi.array().items(Joi.string().trim()).optional()
});

const bookingValidationSchema = Joi.object({
  property: Joi.string().hex().length(24).required(),
  customer: Joi.string().hex().length(24).optional(),
  office: Joi.string().hex().length(24).required(),
  startDate: Joi.date().required(),
  endDate: Joi.date().greater(Joi.ref('startDate')).required(),
  priceType: Joi.string().valid('daily', 'monthly', 'yearly').required(),
  totalPrice: Joi.number().min(0).required(),
  numberOfGuests: Joi.number().integer().min(1).max(20).optional(),
  specialRequests: Joi.string().trim().max(500).optional(),
  notes: Joi.string().trim().max(1000).optional()
});

const officeValidationSchema = Joi.object({
  name: Joi.string().trim().min(2).max(100).required(),
  email: Joi.string().email().required(),
  phone: Joi.string().trim().min(5).max(20).required(),
  address: Joi.object({
    street: Joi.string().trim().required(),
    city: Joi.string().trim().required(),
    wilaya: Joi.string().trim().required(),
    zipCode: Joi.string().trim().optional()
  }).required(),
  manager: Joi.string().hex().length(24).required(),
  description: Joi.string().trim().max(1000).optional(),
  logo: Joi.string().trim().optional(),
  workingHours: Joi.object({
    monday: Joi.object({ open: Joi.string().optional(), close: Joi.string().optional() }).optional(),
    tuesday: Joi.object({ open: Joi.string().optional(), close: Joi.string().optional() }).optional(),
    wednesday: Joi.object({ open: Joi.string().optional(), close: Joi.string().optional() }).optional(),
    thursday: Joi.object({ open: Joi.string().optional(), close: Joi.string().optional() }).optional(),
    friday: Joi.object({ open: Joi.string().optional(), close: Joi.string().optional() }).optional(),
    saturday: Joi.object({ open: Joi.string().optional(), close: Joi.string().optional() }).optional(),
    sunday: Joi.object({ open: Joi.string().optional(), close: Joi.string().optional() }).optional()
  }).optional(),
  socialMedia: Joi.object({
    website: Joi.string().uri().optional(),
    facebook: Joi.string().uri().optional(),
    instagram: Joi.string().uri().optional(),
    linkedin: Joi.string().uri().optional()
  }).optional()
});

module.exports = {
  validateRequest,
  userValidationSchema,
  propertyValidationSchema,
  bookingValidationSchema,
  officeValidationSchema
};
