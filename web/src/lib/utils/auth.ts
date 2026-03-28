import { User } from '@/store/features/authSlice';

/**
 * Checks if a user is authenticated
 */
export const isAuthenticated = (user: User | null, token: string | null): boolean => {
  return !!(user && token);
};

/**
 * Checks if a user is an admin
 */
export const isAdmin = (user: User | null): boolean => {
  return user?.isAdmin ?? false;
};

/**
 * Gets the stored auth token from localStorage
 */
export const getStoredToken = (): string | null => {
  if (typeof window === 'undefined') return null;

  try {
    const persistedState = localStorage.getItem('persist:root');
    if (persistedState) {
      const parsed = JSON.parse(persistedState);
      const authState = JSON.parse(parsed.auth);
      return authState?.accessToken || null;
    }
  } catch (error) {
    console.error('Error reading token from localStorage:', error);
  }

  return null;
};

/**
 * Gets the stored user from localStorage
 */
export const getStoredUser = (): User | null => {
  if (typeof window === 'undefined') return null;

  try {
    const persistedState = localStorage.getItem('persist:root');
    if (persistedState) {
      const parsed = JSON.parse(persistedState);
      const authState = JSON.parse(parsed.auth);
      return authState?.user || null;
    }
  } catch (error) {
    console.error('Error reading user from localStorage:', error);
  }

  return null;
};

/**
 * Clears auth data from localStorage
 */
export const clearAuthStorage = (): void => {
  if (typeof window === 'undefined') return;

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
  } catch (error) {
    console.error('Error clearing auth storage:', error);
  }
};

/**
 * Checks if user has permission to access a route
 */
export const canAccessRoute = (
  route: string,
  user: User | null,
  token: string | null
): boolean => {
  // Public routes
  const publicRoutes = ['/', '/login', '/register', '/forgot-password', '/verify', '/reset-password'];
  if (publicRoutes.includes(route)) return true;

  // Admin routes require authentication and admin status
  if (route.startsWith('/admin')) {
    return isAuthenticated(user, token) && isAdmin(user);
  }

  // Protected routes require authentication
  return isAuthenticated(user, token);
};

/**
 * Redirects to login page (client-side only)
 */
export const redirectToLogin = (): void => {
  if (typeof window !== 'undefined') {
    window.location.href = '/';
  }
};

/**
 * Redirects to home page (client-side only)
 */
export const redirectToHome = (): void => {
  if (typeof window !== 'undefined') {
    window.location.href = '/';
  }
};
