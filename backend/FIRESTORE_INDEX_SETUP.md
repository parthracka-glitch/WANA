# Firestore Index Setup Required

## Event Cleanup Index

The automatic event cleanup feature requires a composite index in Firestore.

### Index Details:
- **Collection**: `ongoingEvents`
- **Fields**:
  1. `is_resolved` (Ascending)
  2. `timestamp` (Ascending)

### How to Create the Index:

1. Click this link to create the index automatically:
   https://console.firebase.google.com/v1/r/project/wana-9705e/firestore/indexes?create_composite=ClBwcm9qZWN0cy93YW5hLTk3MDVlL2RhdGFiYXNlcy8oZGVmYXVsdCkvY29sbGVjdGlvbkdyb3Vwcy9vbmdvaW5nRXZlbnRzL2luZGV4ZXMvXxABGg8KC2lzX3Jlc29sdmVkEAEaDQoJdGltZXN0YW1wEAEaDAoIX19uYW1lX18QAQ

2. Or manually create it in Firebase Console:
   - Go to: Firebase Console → Firestore Database → Indexes
   - Click "Create Index"
   - Collection ID: `ongoingEvents`
   - Add fields:
     - Field: `is_resolved`, Order: Ascending
     - Field: `timestamp`, Order: Ascending
   - Query scope: Collection
   - Click "Create"

3. Wait for the index to build (usually takes a few minutes)

4. Restart the backend server after the index is ready

### Alternative: Manual Cleanup

Until the index is ready, you can manually run cleanup using:

```bash
cd backend
node src/scripts/cleanupOldEvents.js
```

Or use the API endpoint:
```bash
POST http://localhost:3000/cleanup/events
Authorization: Bearer <your-token>
```
