/**
 * Structured diagnostics for API responses.
 * No console.log — every error is returned as structured JSON.
 */

export interface DiagnosticError {
  error_code: string;
  message: string;
  operation: string;
  context?: Record<string, string | number | boolean>;
  retriable: boolean;
  recovery_hint: string;
}

export function badRequest(
  errorCode: string,
  message: string,
  context?: Record<string, string | number | boolean>,
): DiagnosticError {
  return {
    error_code: errorCode,
    message,
    operation: 'request_validation',
    context,
    retriable: false,
    recovery_hint: 'Check the request parameters and try again.',
  };
}

export function conflict(
  errorCode: string,
  message: string,
  context?: Record<string, string | number | boolean>,
): DiagnosticError {
  return {
    error_code: errorCode,
    message,
    operation: 'state_conflict',
    context,
    retriable: false,
    recovery_hint: 'The resource is in a conflicting state. Check current status and retry if appropriate.',
  };
}

export function notFound(
  errorCode: string,
  message: string,
  context?: Record<string, string | number | boolean>,
): DiagnosticError {
  return {
    error_code: errorCode,
    message,
    operation: 'resource_lookup',
    context,
    retriable: false,
    recovery_hint: 'Verify the resource identifier and try again.',
  };
}

export function serviceUnavailable(
  errorCode: string,
  message: string,
  context?: Record<string, string | number | boolean>,
): DiagnosticError {
  return {
    error_code: errorCode,
    message,
    operation: 'service_downstream',
    context,
    retriable: true,
    recovery_hint: 'Try again in a few moments. If the issue persists, contact support.',
  };
}

export function preconditionFailed(
  errorCode: string,
  message: string,
  context?: Record<string, string | number | boolean>,
): DiagnosticError {
  return {
    error_code: errorCode,
    message,
    operation: 'precondition_check',
    context,
    retriable: false,
    recovery_hint: 'Meet the required conditions before retrying.',
  };
}
