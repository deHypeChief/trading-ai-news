import mongoose from 'mongoose';
import 'dotenv/config';

async function migrateUserSubscriptions() {
  try {
    console.log('Starting user subscription migration...');

    // Connect to database directly
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/smart-money-calendar';
    await mongoose.connect(mongoURI);
    console.log('✅ MongoDB connected');

    // Get the users collection
    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');

    // Find all users with empty subscription objects
    const usersToUpdate = await usersCollection.find({
      $or: [
        { subscription: { $exists: false } },
        { subscription: {} },
        { 'subscription.plan': { $exists: false } },
        { subscription: null }
      ]
    }).toArray();

    console.log(`Found ${usersToUpdate.length} users needing subscription migration`);

    // Also check what subscription data exists
    const allUsers = await usersCollection.find({}).toArray();
    console.log('Total users in DB:', allUsers.length);
    allUsers.forEach(user => {
      console.log(`User ${user.email}: subscription =`, JSON.stringify(user.subscription, null, 2));
    });

    const trialEndsAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // 3 days from now

    // Find all users with expired trials that need trialEndsAt dates
    const usersNeedingTrialDates = await usersCollection.find({
      'subscription.status': 'inactive',
      'subscription.plan': 'free',
      $or: [
        { 'subscription.trialEndsAt': { $exists: false } },
        { 'subscription.trialEndsAt': null }
      ]
    }).toArray();

    console.log(`Found ${usersNeedingTrialDates.length} users needing trial end dates`);

    for (const user of usersNeedingTrialDates) {
      console.log(`Setting trial end date for user: ${user.email} (created: ${user.createdAt})`);

      // Set trialEndsAt to 3 days after account creation
      const trialEndsAt = new Date(user.createdAt.getTime() + 3 * 24 * 60 * 60 * 1000);

      await usersCollection.updateOne(
        { _id: user._id },
        {
          $set: {
            'subscription.trialEndsAt': trialEndsAt
          }
        }
      );
    }

    console.log('Migration completed successfully!');

    // Disconnect from database
    await mongoose.disconnect();
    console.log('✅ MongoDB disconnected');

    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Run migration
migrateUserSubscriptions();