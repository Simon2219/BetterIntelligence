/**
 * Centralized error handling system.
 * All route catch blocks and service errors should use these utilities.
 */

class AppError extends Error {
    constructor(statusCode, message) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = true;
    }
}

function createHttpError(statusCode, message) {
    return new AppError(statusCode, message);
}

function badRequest(message = 'Bad request') { return new AppError(400, message); }
function unauthorized(message = 'Unauthorized') { return new AppError(401, message); }
function forbidden(message = 'Forbidden') { return new AppError(403, message); }
function notFound(message = 'Not found') { return new AppError(404, message); }
function conflict(message = 'Conflict') { return new AppError(409, message); }

function isAppError(err) {
    return err instanceof AppError;
}

function safeErrorMessage(err) {
    if (process.env.NODE_ENV === 'production') return 'An error occurred';
    return err?.message || 'An error occurred';
}

/**
 * Standard error response for route catch blocks.
 * Respects AppError statusCode, defaults to 500 for unexpected errors.
 */
function handleRouteError(res, err, log, context) {
    const status = isAppError(err) ? err.statusCode : (err?.statusCode || 500);
    if (log && status >= 500) log.error(context || 'Request error', { err: err.message });
    res.status(status).json({ success: false, error: safeErrorMessage(err) });
}

module.exports = {
    AppError,
    createHttpError,
    badRequest,
    unauthorized,
    forbidden,
    notFound,
    conflict,
    isAppError,
    safeErrorMessage,
    handleRouteError
};
