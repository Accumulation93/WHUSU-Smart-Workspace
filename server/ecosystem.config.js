// 生产发布通过 redsu_current 原子软链接切换版本；本地仍可用环境变量覆盖。
const serverRoot = process.env.REDSU_SERVER_ROOT || '/home/ubuntu/redsu_current/server';

module.exports = {
  apps: [{
    name: 'redsu-scoring',
    script: 'src/index.js',
    cwd: serverRoot,
    instances: 2,
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production'
    },
    node_args: '',
    max_memory_restart: '512M',
    max_restarts: 5,
    min_uptime: '10s',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file: '/home/ubuntu/.pm2/logs/redsu-scoring-error.log',
    out_file: '/home/ubuntu/.pm2/logs/redsu-scoring-out.log',
    merge_logs: true,
    kill_timeout: 5000,
    listen_timeout: 5000
  }, {
    name: 'redsu-notification-worker',
    script: 'notificationWorker.js',
    cwd: serverRoot,
    exec_mode: 'fork',
    instances: 1,
    env: {
      NODE_ENV: 'production'
    },
    max_memory_restart: '256M',
    max_restarts: 5,
    min_uptime: '10s',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file: '/home/ubuntu/.pm2/logs/redsu-notification-worker-error.log',
    out_file: '/home/ubuntu/.pm2/logs/redsu-notification-worker-out.log',
    merge_logs: true,
    kill_timeout: 10000,
    autorestart: true
  }, {
    name: 'redsu-backup',
    script: 'backup.js',
    cwd: '/home/ubuntu/redsu_scoring/server',
    exec_mode: 'fork',
    instances: 1,
    env: {
      NODE_ENV: 'production'
    },
    max_memory_restart: '100M',
    max_restarts: 3,
    min_uptime: '30s',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file: '/home/ubuntu/.pm2/logs/redsu-backup-error.log',
    out_file: '/home/ubuntu/.pm2/logs/redsu-backup-out.log',
    merge_logs: true,
    kill_timeout: 10000,
    autorestart: true
  }]
};
