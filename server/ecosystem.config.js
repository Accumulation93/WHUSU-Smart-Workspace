// 生产发布通过 whusu-smart-workspace-current 原子软链接切换版本；本地仍可用环境变量覆盖。
const serverRoot = process.env.WHUSU_SMART_WORKSPACE_SERVER_ROOT || '/home/ubuntu/whusu-smart-workspace-current/server';

module.exports = {
  apps: [{
    name: 'whusu-smart-workspace-api',
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
    error_file: '/home/ubuntu/.pm2/logs/whusu-smart-workspace-api-error.log',
    out_file: '/home/ubuntu/.pm2/logs/whusu-smart-workspace-api-out.log',
    merge_logs: true,
    kill_timeout: 5000,
    listen_timeout: 5000
  }, {
    name: 'whusu-smart-workspace-notification-worker',
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
    error_file: '/home/ubuntu/.pm2/logs/whusu-smart-workspace-notification-worker-error.log',
    out_file: '/home/ubuntu/.pm2/logs/whusu-smart-workspace-notification-worker-out.log',
    merge_logs: true,
    kill_timeout: 10000,
    autorestart: true
  }, {
    name: 'whusu-smart-workspace-backup',
    script: 'backup.js',
    cwd: '/home/ubuntu/whusu-smart-workspace/server',
    exec_mode: 'fork',
    instances: 1,
    env: {
      NODE_ENV: 'production'
    },
    max_memory_restart: '100M',
    max_restarts: 3,
    min_uptime: '30s',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file: '/home/ubuntu/.pm2/logs/whusu-smart-workspace-backup-error.log',
    out_file: '/home/ubuntu/.pm2/logs/whusu-smart-workspace-backup-out.log',
    merge_logs: true,
    kill_timeout: 10000,
    autorestart: true
  }]
};
