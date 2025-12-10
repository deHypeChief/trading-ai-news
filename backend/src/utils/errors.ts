export class ApiResponse {
  constructor(
    public statusCode: number,
    public message: string,
    public data: any = null,
    public success: boolean = statusCode < 400
  ) {}
}

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const handleError = (error: any) => {
  if (error instanceof ApiError) {
    return {
      statusCode: error.statusCode,
      message: error.message,
      details: error.details,
    };
  }

  if (error.name === 'ValidationError') {
    return {
      statusCode: 400,
      message: 'Validation failed',
      details: error.errors,
    };
  }

  if (error.code === 11000) {
    return {
      statusCode: 409,
      message: 'Resource already exists',
      details: error.keyPattern,
    };
  }

  return {
    statusCode: 500,
    message: 'Internal server error',
    details: error.message,
  };
};
