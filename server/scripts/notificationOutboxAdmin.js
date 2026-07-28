require('dotenv').config();

function parseArgs(argv) {
  const command = argv[2] || 'status';
  let id = '';
  for (let index = 3; index < argv.length; index += 1) {
    if (argv[index] === '--id') id = String(argv[++index] || '').trim();
    else throw new Error('未知参数: ' + argv[index]);
  }
  if (!['status', 'retry'].includes(command)) throw new Error('仅支持 status 或 retry');
  if (command === 'retry' && (!id || id.length > 64 || !/^[A-Za-z0-9._:-]+$/.test(id))) {
    throw new Error('retry 必须提供合法的 --id');
  }
  return { command, id };
}

async function main() {
  const options = parseArgs(process.argv);
  const pool = require('../src/config/db');
  const outboxModel = require('../src/modules/audit/models/notificationOutbox');
  try {
    if (options.command === 'status') {
      const deadLetterCount = await outboxModel.getDeadLetterCount();
      console.log(JSON.stringify({ status: 'success', deadLetterCount }));
      return;
    }
    const result = await outboxModel.retryDead(options.id);
    console.log(JSON.stringify({ status: result.changed ? 'success' : 'not_found', changed: result.changed }));
    if (!result.changed) process.exitCode = 2;
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}

module.exports = { parseArgs };
