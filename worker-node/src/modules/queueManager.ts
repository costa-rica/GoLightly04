import { Queue } from './database';
import logger from './logger';
import { QueueStatus, QueueRecord } from '../types';

/**
 * Add a new job to the queue
 * @param userId - User ID for the job
 * @param jobFilename - Filename for the job CSV
 * @returns The created queue record
 */
export async function addJobToQueue(userId: number, jobFilename: string): Promise<QueueRecord> {
  logger.info(`Adding new job to queue for user ${userId}: ${jobFilename}`);

  const queueRecord = await Queue.create({
    userId,
    status: 'queued',
    jobFilename,
  });

  logger.info(`Job added to queue with ID: ${queueRecord.id}`);

  return {
    id: queueRecord.id,
    userId: queueRecord.userId,
    status: queueRecord.status as QueueStatus,
    jobFilename: queueRecord.jobFilename,
    createdAt: queueRecord.createdAt,
    updatedAt: queueRecord.updatedAt,
  };
}

/**
 * Update job status
 * @param queueId - Queue record ID
 * @param status - New status
 */
export async function updateJobStatus(queueId: number, status: QueueStatus): Promise<void> {
  logger.info(`Updating queue ${queueId} status to: ${status}`);

  const queueRecord = await Queue.findByPk(queueId);

  if (!queueRecord) {
    throw new Error(`Queue record not found: ${queueId}`);
  }

  queueRecord.status = status;
  await queueRecord.save();

  logger.info(`Queue ${queueId} status updated successfully`);
}

/**
 * Get next queued job (FIFO - first in, first out)
 * @returns The next queued job or null if queue is empty
 */
export async function getNextQueuedJob(): Promise<QueueRecord | null> {
  const queueRecord = await Queue.findOne({
    where: { status: 'queued' },
    order: [['createdAt', 'ASC']], // FIFO: oldest first
  });

  if (!queueRecord) {
    return null;
  }

  return {
    id: queueRecord.id,
    userId: queueRecord.userId,
    status: queueRecord.status as QueueStatus,
    jobFilename: queueRecord.jobFilename,
    createdAt: queueRecord.createdAt,
    updatedAt: queueRecord.updatedAt,
  };
}

/**
 * Check if there are any jobs currently being processed
 * @returns true if a job is in progress, false otherwise
 */
export async function isQueueProcessing(): Promise<boolean> {
  const processingStatuses: QueueStatus[] = ['started', 'elevenlabs', 'concatenator'];

  const count = await Queue.count({
    where: {
      status: processingStatuses,
    },
  });

  return count > 0;
}

/**
 * Get queue record by ID
 * @param queueId - Queue record ID
 * @returns The queue record or null if not found
 */
export async function getQueueRecord(queueId: number): Promise<QueueRecord | null> {
  const queueRecord = await Queue.findByPk(queueId);

  if (!queueRecord) {
    return null;
  }

  return {
    id: queueRecord.id,
    userId: queueRecord.userId,
    status: queueRecord.status as QueueStatus,
    jobFilename: queueRecord.jobFilename,
    createdAt: queueRecord.createdAt,
    updatedAt: queueRecord.updatedAt,
  };
}

/**
 * Get all queued jobs
 * @returns Array of queued jobs
 */
export async function getAllQueuedJobs(): Promise<QueueRecord[]> {
  const queueRecords = await Queue.findAll({
    where: { status: 'queued' },
    order: [['createdAt', 'ASC']],
  });

  return queueRecords.map(record => ({
    id: record.id,
    userId: record.userId,
    status: record.status as QueueStatus,
    jobFilename: record.jobFilename,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }));
}

/**
 * Get count of jobs in each status
 * @returns Object with counts by status
 */
export async function getQueueCounts(): Promise<Record<string, number>> {
  const statuses: QueueStatus[] = ['queued', 'started', 'elevenlabs', 'concatenator', 'done'];

  const counts: Record<string, number> = {};

  for (const status of statuses) {
    counts[status] = await Queue.count({ where: { status } });
  }

  counts.total = await Queue.count();

  return counts;
}

/**
 * Delete a queue record
 * @param queueId - Queue record ID
 */
export async function deleteQueueRecord(queueId: number): Promise<void> {
  logger.info(`Deleting queue record: ${queueId}`);

  const deleted = await Queue.destroy({
    where: { id: queueId },
  });

  if (deleted === 0) {
    throw new Error(`Queue record not found: ${queueId}`);
  }

  logger.info(`Queue record ${queueId} deleted successfully`);
}
