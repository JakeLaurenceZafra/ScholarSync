import { Client } from 'pg';
import logger from '../config/logger';

interface ProgressUpdatePayload {
  group_id: string;
  project_id: string;
  progress: number;
  total_tasks: number;
  completed_tasks: number;
  timestamp: number;
}

class ProgressSyncService {
  private client: Client | null = null;
  private isListening = false;
  private io: any = null;

  constructor() {
    this.client = null;
  }

  /**
   * Initialize the service with Socket.io instance
   */
  setSocketIO(io: any) {
    this.io = io;
  }

  /**
   * Start listening for progress updates from SkyFlow
   */
  async startListening() {
    if (this.isListening) {
      logger.warn('Progress sync service already listening');
      return;
    }

    try {
      // Create a new PostgreSQL client for LISTEN
      this.client = new Client({
        connectionString: process.env.SKYFLOW_DATABASE_URL,
        ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
      });

      await this.client.connect();
      logger.info('✅ Progress sync service connected to database');

      // Listen for progress_update notifications
      await this.client.query('LISTEN progress_update');
      logger.info('🔔 Listening for progress updates from SkyFlow...');

      // Handle notifications
      this.client.on('notification', async (msg) => {
        if (msg.channel === 'progress_update' && msg.payload) {
          try {
            const payload: ProgressUpdatePayload = JSON.parse(msg.payload);
            await this.handleProgressUpdate(payload);
          } catch (error) {
            logger.error('Error parsing progress update payload:', error);
          }
        }
      });

      // Handle connection errors
      this.client.on('error', (err) => {
        logger.error('Progress sync client error:', err);
        this.isListening = false;
        // Attempt to reconnect after 5 seconds
        setTimeout(() => this.startListening(), 5000);
      });

      this.isListening = true;
    } catch (error) {
      logger.error('Failed to start progress sync service:', error);
      this.isListening = false;
      // Retry after 10 seconds
      setTimeout(() => this.startListening(), 10000);
    }
  }

  /**
   * Handle incoming progress update from SkyFlow
   */
  private async handleProgressUpdate(payload: ProgressUpdatePayload) {
    logger.info(`📊 Progress update received for group ${payload.group_id}: ${payload.progress}%`);

    try {
      // Update team_groups table with new progress
      const updateQuery = `
        UPDATE team_groups 
        SET progress = $1, updated_at = NOW()
        WHERE id = $2
        RETURNING id, name, progress
      `;

      // Use a separate client for the update query
      const { Pool } = require('pg');
      const pool = new Pool({
        connectionString: process.env.SKYFLOW_DATABASE_URL,
        ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
      });

      const result = await pool.query(updateQuery, [payload.progress, payload.group_id]);

      if (result.rows.length > 0) {
        const updatedGroup = result.rows[0];
        logger.info(`✅ Updated group "${updatedGroup.name}" progress to ${updatedGroup.progress}%`);

        // Broadcast to all connected ScholarSync clients via Socket.io
        if (this.io) {
          this.io.emit('progressUpdated', {
            groupId: payload.group_id,
            progress: payload.progress,
            totalTasks: payload.total_tasks,
            completedTasks: payload.completed_tasks,
            timestamp: payload.timestamp,
          });
          logger.info(`📡 Broadcasted progress update to ScholarSync clients`);
        }
      } else {
        logger.warn(`Group ${payload.group_id} not found in team_groups table`);
      }

      await pool.end();
    } catch (error) {
      logger.error('Error updating team_groups progress:', error);
    }
  }

  /**
   * Stop listening and cleanup
   */
  async stopListening() {
    if (this.client) {
      try {
        await this.client.query('UNLISTEN progress_update');
        await this.client.end();
        logger.info('🔕 Stopped listening for progress updates');
      } catch (error) {
        logger.error('Error stopping progress sync service:', error);
      }
    }
    this.isListening = false;
    this.client = null;
  }
}

// Export singleton instance
export const progressSyncService = new ProgressSyncService();
