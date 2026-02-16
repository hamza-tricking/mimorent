const sendResponse = (res, statusCode, success, message, data = null) => {
  res.status(statusCode).json({
    success,
    message,
    data
  });
};

const sendSuccess = (res, message = 'Success', data = null, statusCode = 200) => {
  sendResponse(res, statusCode, true, message, data);
};

const sendError = (res, message = 'Error', statusCode = 500, data = null) => {
  sendResponse(res, statusCode, false, message, data);
};

const sendCreated = (res, message = 'Created successfully', data = null) => {
  sendResponse(res, 201, true, message, data);
};

const sendNotFound = (res, message = 'Resource not found') => {
  sendResponse(res, 404, false, message);
};

const sendBadRequest = (res, message = 'Bad request') => {
  sendResponse(res, 400, false, message);
};

const sendUnauthorized = (res, message = 'Unauthorized') => {
  sendResponse(res, 401, false, message);
};

const sendForbidden = (res, message = 'Forbidden') => {
  sendResponse(res, 403, false, message);
};

const sendConflict = (res, message = 'Conflict') => {
  sendResponse(res, 409, false, message);
};

module.exports = {
  sendResponse,
  sendSuccess,
  sendError,
  sendCreated,
  sendNotFound,
  sendBadRequest,
  sendUnauthorized,
  sendForbidden,
  sendConflict
};
