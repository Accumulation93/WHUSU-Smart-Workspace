require('dotenv').config();
const crypto = require('crypto');
const pool = require('../src/config/db');
const { generateId, safeString } = require('../src/utils/helpers');

async function main() {
  const expectedSecret = safeString(process.env.SUPER_ADMIN_BOOTSTRAP_SECRET);
  const providedSecret = safeString(process.env.BOOTSTRAP_SECRET);
  if (!expectedSecret || !providedSecret || expectedSecret.length !== providedSecret.length
      || !crypto.timingSafeEqual(Buffer.from(expectedSecret), Buffer.from(providedSecret))) {
    throw new Error('缺少或错误的本地初始化密钥');
  }
  const name = safeString(process.env.BOOTSTRAP_NAME);
  const studentId = safeString(process.env.BOOTSTRAP_STUDENT_ID);
  if (!name || !studentId) throw new Error('必须设置 BOOTSTRAP_NAME 和 BOOTSTRAP_STUDENT_ID');

  const [existing] = await pool.query(
    "SELECT id FROM admin_info WHERE admin_level = 'super_admin' AND org_id = '' LIMIT 1"
  );
  if (existing.length) throw new Error('超级管理员已存在，拒绝重复初始化');

  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let inviteCode = '';
  for (let i = 0; i < 8; i++) inviteCode += chars[crypto.randomInt(0, chars.length)];
  const inviteExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await pool.query(
    `INSERT INTO admin_info
      (id, name, student_id, openid, admin_level, bind_status, invite_code,
       invited_at, invite_expires_at, org_id)
     VALUES (?, ?, ?, '', 'super_admin', 'invited', ?, NOW(), ?, '')`,
    [generateId(), name, studentId, inviteCode, inviteExpiresAt]
  );
  console.log('超级管理员记录已创建。一次性邀请码：' + inviteCode + '（24小时内有效）');
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
