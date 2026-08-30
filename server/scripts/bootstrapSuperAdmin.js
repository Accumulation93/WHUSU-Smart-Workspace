require('dotenv').config();

const {
  BootstrapError,
  parseBootstrapConfig,
  bootstrapSuperAdmin
} = require('./bootstrapSuperAdminService');

async function main() {
  const config = parseBootstrapConfig(process.argv.slice(2), process.env);
  const pool = require('../src/config/db');
  const identityCrypto = require('../src/core/services/identityCrypto');
  const { generateId } = require('../src/utils/helpers');

  try {
    identityCrypto.validateIdentityCryptoConfig();
    const result = await bootstrapSuperAdmin({
      pool,
      config,
      generateId,
      cryptoAdapter: {
        hashOpenid: identityCrypto.hmac,
        hashOpenidCandidates: identityCrypto.hmacCandidates,
        encryptOpenid: identityCrypto.encryptOpenid,
        decryptOpenid: identityCrypto.decryptOpenid
      }
    });
    const actionText = result.changed ? '初始化完成' : '配置已经生效，无需重复写入';
    console.log(`超级管理员${actionText}。未输出任何身份凭据。`);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    const code = error instanceof BootstrapError ? error.code : 'unexpected_failure';
    console.error(`超级管理员初始化失败（${code}）。请按离线初始化文档核对输入和数据状态。`);
    process.exitCode = 1;
  });
}

module.exports = { main };
