const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const systemConfig = require('../src/core/models/systemConfig');

async function main() {
  try {
    const config = await systemConfig.get();
    console.log('config-ok', JSON.stringify({ timezone: config && config.timezone }));
  } catch (error) {
    console.log('config-error', String(error && error.message));
  }
  try {
    const state = await systemConfig.getHistoricalTimeReviewState();
    console.log('review-ok', JSON.stringify(state));
  } catch (error) {
    console.log('review-error', String(error && error.message));
  }
  process.exit(0);
}

main().catch((error) => {
  console.log('diagnose-fatal', String(error && error.message));
  process.exit(1);
});
