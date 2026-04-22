/**
 * Formats a date string to a human-readable format
 */
export const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

/**
 * Formats a date string to include time
 */
export const formatDateTime = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/**
 * Formats duration in seconds to minutes:seconds format
 */
export const formatDuration = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

/**
 * Formats pause duration string (e.g., "3.0" -> "3s")
 */
export const formatPauseDuration = (duration: string): string => {
  const num = parseFloat(duration);
  if (isNaN(num)) return duration;
  return `${num}s`;
};

/**
 * Formats speed value for display (e.g., "0.85" -> "0.85x")
 */
export const formatSpeed = (speed: string): string => {
  const num = parseFloat(speed);
  if (isNaN(num)) return speed;
  return `${num}x`;
};

/**
 * Truncates text to a specified length with ellipsis
 */
export const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  return `${text.substring(0, maxLength)}...`;
};

/**
 * Formats listen count with commas
 */
export const formatListenCount = (count: number): string => {
  return count.toLocaleString('en-US');
};

/**
 * Formats file size in bytes to human-readable format
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

/**
 * Formats visibility status for display
 */
export const formatVisibility = (visibility: string): string => {
  return visibility.charAt(0).toUpperCase() + visibility.slice(1);
};

/**
 * Formats queue status with proper capitalization
 */
export const formatQueueStatus = (status: string): string => {
  return status.charAt(0).toUpperCase() + status.slice(1);
};
