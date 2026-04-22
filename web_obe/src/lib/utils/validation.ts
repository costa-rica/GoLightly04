/**
 * Validates an email address format
 */
export const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Validates password requirements (minimum 4 characters)
 */
export const validatePassword = (password: string): { valid: boolean; message?: string } => {
  if (password.length < 4) {
    return {
      valid: false,
      message: 'Password must be at least 4 characters',
    };
  }
  return { valid: true };
};

/**
 * Validates that two passwords match
 */
export const validatePasswordMatch = (
  password: string,
  confirmPassword: string
): { valid: boolean; message?: string } => {
  if (password !== confirmPassword) {
    return {
      valid: false,
      message: 'Passwords do not match',
    };
  }
  return { valid: true };
};

/**
 * Validates meditation title
 */
export const validateMeditationTitle = (title: string): { valid: boolean; message?: string } => {
  if (!title || title.trim().length === 0) {
    return {
      valid: false,
      message: 'Title is required',
    };
  }
  if (title.length > 100) {
    return {
      valid: false,
      message: 'Title must be less than 100 characters',
    };
  }
  return { valid: true };
};

/**
 * Validates speed value for text-to-speech
 */
export const validateSpeed = (speed: string): { valid: boolean; message?: string } => {
  const speedNum = parseFloat(speed);
  if (isNaN(speedNum)) {
    return {
      valid: false,
      message: 'Speed must be a number',
    };
  }
  if (speedNum < 0.7 || speedNum > 1.3) {
    return {
      valid: false,
      message: 'Speed must be between 0.7 and 1.3',
    };
  }
  return { valid: true };
};

/**
 * Validates pause duration
 */
export const validatePauseDuration = (duration: string): { valid: boolean; message?: string } => {
  const durationNum = parseFloat(duration);
  if (isNaN(durationNum)) {
    return {
      valid: false,
      message: 'Duration must be a number',
    };
  }
  if (durationNum <= 0) {
    return {
      valid: false,
      message: 'Duration must be greater than 0',
    };
  }
  if (durationNum > 300) {
    return {
      valid: false,
      message: 'Duration must be less than 300 seconds',
    };
  }
  return { valid: true };
};

/**
 * Validates file is an MP3
 */
export const validateMp3File = (file: File): { valid: boolean; message?: string } => {
  if (!file.name.toLowerCase().endsWith('.mp3')) {
    return {
      valid: false,
      message: 'Only .mp3 files are allowed',
    };
  }
  // Check file size (50MB max)
  const maxSize = 50 * 1024 * 1024; // 50MB in bytes
  if (file.size > maxSize) {
    return {
      valid: false,
      message: 'File size must be less than 50MB',
    };
  }
  return { valid: true };
};
