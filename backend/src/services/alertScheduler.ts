import { Alert } from '../models/Alert';
import { Event } from '../models/Event';
import { User } from '../models/User';
import { sendEventAlertEmail } from './email';
import { broadcastAlert } from './websocket';

interface ScheduledAlert {
  eventId: string;
  userId: string;
  minutesBefore: number;
  scheduledFor: Date;
}

const sentAlerts = new Set<string>(); // Track sent alerts to avoid duplicates
let alertInterval: NodeJS.Timeout | null = null;

/**
 * Start the alert scheduler
 */
export function startAlertScheduler() {
  if (alertInterval) {
    console.log('⚠️ Alert scheduler already running');
    return;
  }

  console.log('🔔 Starting alert scheduler...');

  // Run immediately
  checkAndSendAlerts();

  // Then check every 5 minutes
  alertInterval = setInterval(checkAndSendAlerts, 5 * 60 * 1000);

  console.log('✅ Alert scheduler started (checks every 5 minutes)');
}

/**
 * Stop the alert scheduler
 */
export function stopAlertScheduler() {
  if (alertInterval) {
    clearInterval(alertInterval);
    alertInterval = null;
    console.log('🛑 Alert scheduler stopped');
  }
}

/**
 * Check for upcoming events and send alerts
 */
async function checkAndSendAlerts() {
  try {
    console.log('🔍 Checking for upcoming events to alert...');

    const now = new Date();
    const in2Hours = new Date(now.getTime() + 2 * 60 * 60 * 1000);

    // Get all upcoming events in next 2 hours
    const upcomingEvents = await Event.find({
      eventDateTime: {
        $gte: now,
        $lte: in2Hours,
      },
    }).lean();

    if (upcomingEvents.length === 0) {
      console.log('📭 No upcoming events in the next 2 hours');
      return;
    }

    console.log(`📊 Found ${upcomingEvents.length} upcoming events`);

    // Get all enabled alert configurations
    const alertConfigs = await Alert.find({ enabled: true }).lean();

    if (alertConfigs.length === 0) {
      console.log('📭 No users have alerts enabled');
      return;
    }

    let alertsSent = 0;

    for (const alertConfig of alertConfigs) {
      // Get user details
      const user = await User.findById(alertConfig.userId).lean();
      if (!user) continue;

      // Check if in quiet hours
      if (alertConfig.quietHoursEnabled && isInQuietHours(alertConfig, user.timezone)) {
        continue;
      }

      for (const event of upcomingEvents) {
        // Apply filters
        if (!shouldAlertForEvent(event, alertConfig)) {
          continue;
        }

        // Check each notification timing
        for (const minutesBefore of alertConfig.notifyBefore || [30, 60]) {
          const alertTime = new Date(event.eventDateTime.getTime() - minutesBefore * 60 * 1000);

          // Should send if we're within 5 minutes of alert time
          if (Math.abs(now.getTime() - alertTime.getTime()) <= 5 * 60 * 1000) {
            const alertKey = `${user._id}_${event.eventId}_${minutesBefore}`;

            // Skip if already sent
            if (sentAlerts.has(alertKey)) {
              continue;
            }

            // Send alert
            try {
              if (alertConfig.emailNotifications && user.email) {
                await sendEventAlertEmail(user.email, event, minutesBefore);
              }

              // Broadcast to WebSocket clients
              broadcastAlert({
                title: `Event in ${minutesBefore} minutes`,
                message: event.eventName,
                severity: event.impact === 'High' ? 'critical' : 'warning',
                event,
              });

              // Mark as sent
              sentAlerts.add(alertKey);
              alertsSent++;

              // Update alert stats
              await Alert.updateOne(
                { _id: alertConfig._id },
                {
                  $set: { lastTriggered: now },
                  $inc: { alertsSentToday: 1 },
                }
              );

              console.log(`✅ Alert sent to ${user.email} for ${event.eventName} (${minutesBefore}min before)`);
            } catch (error: any) {
              console.error(`Failed to send alert to ${user.email}:`, error.message);
            }
          }
        }
      }
    }

    console.log(`📨 Sent ${alertsSent} alerts this round`);

    // Clean up old sent alerts (older than 24 hours)
    cleanupSentAlerts();

    // Reset daily counters at midnight
    resetDailyCounters();

  } catch (error) {
    console.error('❌ Alert scheduler error:', error);
  }
}

/**
 * Check if event matches alert criteria
 */
function shouldAlertForEvent(event: any, alertConfig: any): boolean {
  // Check currency filter
  if (alertConfig.currencies.length > 0 && !alertConfig.currencies.includes(event.currency)) {
    return false;
  }

  // Check impact level
  const impactOrder = { Low: 1, Medium: 2, High: 3 };
  if (impactOrder[event.impact] < impactOrder[alertConfig.minImpact]) {
    return false;
  }

  // Check relevance score
  if (alertConfig.minRelevanceScore && event.aiRelevanceScore) {
    if (event.aiRelevanceScore < alertConfig.minRelevanceScore) {
      return false;
    }
  }

  return true;
}

/**
 * Check if current time is in quiet hours
 */
function isInQuietHours(alertConfig: any, timezone: string = 'UTC'): boolean {
  if (!alertConfig.quietHoursStart || !alertConfig.quietHoursEnd) {
    return false;
  }

  try {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTime = currentHour * 60 + currentMinute;

    const [startHour, startMin] = alertConfig.quietHoursStart.split(':').map(Number);
    const [endHour, endMin] = alertConfig.quietHoursEnd.split(':').map(Number);

    const startTime = startHour * 60 + startMin;
    const endTime = endHour * 60 + endMin;

    // Handle overnight quiet hours (e.g., 22:00 - 08:00)
    if (startTime > endTime) {
      return currentTime >= startTime || currentTime <= endTime;
    }

    return currentTime >= startTime && currentTime <= endTime;
  } catch (error) {
    return false;
  }
}

/**
 * Clean up old sent alerts from memory
 */
function cleanupSentAlerts() {
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  
  // This is a simple in-memory cleanup
  // In production, you'd want to use Redis with TTL
  if (sentAlerts.size > 10000) {
    console.log('🧹 Cleaning up sent alerts cache');
    sentAlerts.clear();
  }
}

/**
 * Reset daily alert counters at midnight
 */
async function resetDailyCounters() {
  const now = new Date();
  
  // Check if it's past midnight (between 00:00 and 00:05)
  if (now.getHours() === 0 && now.getMinutes() < 5) {
    try {
      await Alert.updateMany(
        { alertsSentToday: { $gt: 0 } },
        { $set: { alertsSentToday: 0 } }
      );
      console.log('🔄 Daily alert counters reset');
    } catch (error) {
      console.error('Failed to reset daily counters:', error);
    }
  }
}

/**
 * Get alert statistics
 */
export async function getAlertStats() {
  const totalAlerts = await Alert.countDocuments();
  const enabledAlerts = await Alert.countDocuments({ enabled: true });
  const alertsWithEmail = await Alert.countDocuments({ 
    enabled: true, 
    emailNotifications: true 
  });
  
  const totalAlertsSentToday = await Alert.aggregate([
    { $group: { _id: null, total: { $sum: '$alertsSentToday' } } }
  ]);

  return {
    totalAlerts,
    enabledAlerts,
    alertsWithEmail,
    alertsSentToday: totalAlertsSentToday[0]?.total || 0,
    schedulerRunning: !!alertInterval,
  };
}

/**
 * Manually trigger alert check (for testing)
 */
export async function triggerAlertCheck() {
  console.log('🔔 Manually triggering alert check...');
  await checkAndSendAlerts();
}
