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
      script: '.next/standalone/server.js',
      cwd: './frontend',
      env_production: {
        NODE_ENV: 'production',
        PORT: 5174,
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
