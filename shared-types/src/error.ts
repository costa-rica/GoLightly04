export type ApiError = {
  error: {
    code: string;
    message: string;
    status: number;
    details?: unknown;
  };
};
