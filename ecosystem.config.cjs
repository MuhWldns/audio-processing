module.exports = {
  apps: [
    {
      name: 'rbx-api',
      script: 'src/server.js',
      cwd: './backend',
      interpreter: 'bun',
      env_production: {
        NODE_ENV: 'production',
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      error_file: './logs/api-error.log',
      out_file: './logs/api-out.log',
      merge_logs: true,
      time: true,
    },
    {
      name: 'rbx-frontend',
      script: 'node_modules/.bin/next',
      args: 'start -p 3002',
      cwd: './frontend',
      env_production: {
        NODE_ENV: 'production',
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      error_file: './logs/frontend-error.log',
      out_file: './logs/frontend-out.log',
      merge_logs: true,
      time: true,
    },
  ],
};
