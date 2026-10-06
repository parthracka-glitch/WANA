# Automatic Event Cleanup Feature

## Overview
Automatically removes ongoing SOS events older than 24 hours from the supervisor dashboard to prevent clutter from old test events.

## How It Works

### Automatic Cleanup
- **Runs every 1 hour** automatically
- **Checks for events** older than 24 hours that haven't been marked as "I'm safe"
- **Moves events** to `pastEvents` collection
- **Archives acceptors** associated with the event
- **Marks events** as auto-resolved

### What Gets Cleaned Up
1. **Ongoing Events** older than 24 hours
2. **Associated Acceptors** (people who responded to the event)
3. Both are moved to `pastEvents` collection for historical records

## Implementation Details

### Files Created
1. `backend/src/scripts/cleanupOldEvents.js` - Core cleanup logic
2. `backend/src/jobs/eventCleanupJob.js` - Scheduled job runner
3. `backend/src/routes/cleanup.routes.js` - Manual trigger API
4. `backend/FIRESTORE_INDEX_SETUP.md` - Index setup instructions

### Firestore Changes
- Events are marked with:
  - `is_resolved: true`
  - `resolved_at: <timestamp>`
  - `resolved_reason: "Auto-resolved after 24 hours"`
  - `auto_resolved: true`

### Fallback Method
- If Firestore index is not ready, uses in-memory filtering
- Still works but slightly slower for large datasets
- Recommended to create the index for better performance

## Manual Cleanup

### Via Script
```bash
cd backend
node src/scripts/cleanupOldEvents.js
```

### Via API
```bash
POST http://localhost:3000/cleanup/events
Authorization: Bearer <your-admin-or-supervisor-token>
```

### Check Status
```bash
GET http://localhost:3000/cleanup/status
```

## Performance

### Current Results
- ✅ Successfully cleaned up 5 old events
- ✅ Processed 1 acceptor event
- ✅ Runs automatically every hour
- ✅ Fallback method working without index

### Optimization
For better performance with large datasets:
1. Create the Firestore composite index (see FIRESTORE_INDEX_SETUP.md)
2. Index fields: `is_resolved` (Ascending) + `timestamp` (Ascending)
3. Wait for index to build (usually 5-10 minutes)

## Configuration

### Change Cleanup Interval
Edit `backend/src/jobs/eventCleanupJob.js`:
```javascript
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour (change as needed)
```

### Change Age Threshold
Edit `backend/src/scripts/cleanupOldEvents.js`:
```javascript
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000; // 24 hours (change as needed)
```

## Monitoring

### Server Logs
The cleanup job logs its activity:
- `🚀 Starting event cleanup job` - Job initialized
- `🧹 Starting cleanup of old events...` - Cleanup started
- `📋 Found X old events to clean up` - Events found
- `✅ Successfully cleaned up X old events` - Cleanup completed

### Check Dashboard
After cleanup runs, refresh the supervisor dashboard to see old events removed from the map.

## Troubleshooting

### Events Not Being Cleaned
1. Check server logs for errors
2. Verify events are actually older than 24 hours
3. Ensure `timestamp` field exists on events
4. Check Firestore permissions

### Cleanup Running Too Slowly
1. Create the Firestore composite index
2. Reduce the number of events in `ongoingEvents` collection
3. Consider increasing cleanup frequency

### Manual Cleanup Needed
If automatic cleanup fails, run manual cleanup:
```bash
node backend/src/scripts/cleanupOldEvents.js
```

## Future Enhancements
- [ ] Configurable cleanup threshold via environment variable
- [ ] Email notifications when events are auto-resolved
- [ ] Dashboard UI to view auto-resolved events
- [ ] Bulk cleanup API for admin users
- [ ] Cleanup statistics and reporting
