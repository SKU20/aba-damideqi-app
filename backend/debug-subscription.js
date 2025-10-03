const supabaseAdmin = require('./config/supabaseAdmin');

async function checkUserSubscription(userId) {
  try {
    console.log(`\n🔍 Checking subscription for user: ${userId}`);
    
    // Get ALL subscriptions for this user
    const { data: allSubs, error: allError } = await supabaseAdmin
      .from('user_subscriptions')
      .select('*')
      .eq('user_id', userId);
    
    if (allError) {
      console.error('❌ Error fetching subscriptions:', allError);
      return;
    }
    
    console.log(`📊 Found ${allSubs?.length || 0} subscription(s):`);
    if (allSubs && allSubs.length > 0) {
      allSubs.forEach((sub, index) => {
        console.log(`\n📋 Subscription ${index + 1}:`);
        console.log(`   ID: ${sub.id}`);
        console.log(`   Status: ${sub.status}`);
        console.log(`   Plan ID: ${sub.plan_id}`);
        console.log(`   Start Date: ${sub.start_date}`);
        console.log(`   End Date: ${sub.end_date}`);
        console.log(`   Trial End: ${sub.trial_end_date}`);
        console.log(`   Auto Renew: ${sub.is_auto_renew}`);
        console.log(`   Created: ${sub.created_at}`);
      });
    } else {
      console.log('❌ No subscriptions found for this user');
    }
    
    // Test the hasActiveSubscription function
    const { hasActiveSubscription } = require('./middleware/subscription');
    const isActive = await hasActiveSubscription(userId);
    console.log(`\n✅ hasActiveSubscription() result: ${isActive}`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Check for the current user
const userId = 'b32b8274-dd61-4969-ab79-f943e5144462';
checkUserSubscription(userId).then(() => {
  console.log('\n🏁 Done');
  process.exit(0);
});
