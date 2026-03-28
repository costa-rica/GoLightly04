import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import { logger } from '@/lib/logger';

// Get base URL from environment
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000';

// Create axios instance
const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000, // 30 seconds
});

// Request interceptor - Add JWT token to requests
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // Log API request
    logger.debug('API Request', {
      method: config.method?.toUpperCase(),
      url: config.url,
      baseURL: config.baseURL,
      hasAuth: !!config.headers?.Authorization,
    });

    // Get token from localStorage (Redux persist stores it there)
    if (typeof window !== 'undefined') {
      try {
        const persistedState = localStorage.getItem('persist:root');
        if (persistedState) {
          const parsed = JSON.parse(persistedState);
          const authState = JSON.parse(parsed.auth);
          const token = authState?.accessToken;

          if (token && config.headers) {
            config.headers.Authorization = `Bearer ${token}`;
            logger.debug('JWT token added to request headers');
          }
        }
      } catch (error) {
        logger.error('Error reading token from localStorage', { error });
      }
    }

    return config;
  },
  (error: AxiosError) => {
    logger.error('Request interceptor error', { error: error.message });
    return Promise.reject(error);
  }
);

// Response interceptor - Handle errors globally
apiClient.interceptors.response.use(
  (response) => {
    // Log successful response
    logger.debug('API Response', {
      status: response.status,
      url: response.config.url,
      method: response.config.method?.toUpperCase(),
    });
    return response;
  },
  async (error: AxiosError) => {
    if (error.response) {
      const { status, data } = error.response;

      // Log the error with structured data
      logger.error('API Error Response', {
        status,
        url: error.config?.url,
        method: error.config?.method?.toUpperCase(),
        errorData: data,
      });

      // Handle specific status codes
      switch (status) {
        case 401:
          // Unauthorized - token expired or invalid
          logger.warn('Unauthorized request - clearing auth state');
          // Clear auth state from localStorage
          if (typeof window !== 'undefined') {
            try {
              const persistedState = localStorage.getItem('persist:root');
              if (persistedState) {
                const parsed = JSON.parse(persistedState);
                parsed.auth = JSON.stringify({
                  user: null,
                  accessToken: null,
                  isAuthenticated: false,
                });
                localStorage.setItem('persist:root', JSON.stringify(parsed));
              }
            } catch (e) {
              logger.error('Error clearing auth state', { error: e });
            }
          }
          break;

        case 403:
          logger.warn('Access forbidden', { url: error.config?.url });
          break;

        case 404:
          logger.warn('Resource not found', { url: error.config?.url });
          break;

        case 500:
        case 502:
        case 503:
        case 504:
          logger.error('Server error occurred', { status });
          break;
      }
    } else if (error.request) {
      // Request was made but no response received
      logger.error('No response received from server', {
        url: error.config?.url,
        message: error.message,
      });
    } else {
      // Something else happened
      logger.error('API request setup error', { message: error.message });
    }

    return Promise.reject(error);
  }
);

export default apiClient;
