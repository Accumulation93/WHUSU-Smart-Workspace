'use strict';

const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const pool = require('../src/config/db');
const { preparePublishedActivities } = require('../src/modules/scoring/services/publicationSummary');

preparePublishedActivities()
  .then(count => console.log(JSON.stringify({ preparedScoringPublications: count })))
  .catch(error => {
    console.error('[scoring-publication]', error.code || error.name);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
