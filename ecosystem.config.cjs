module.exports = {
  apps: [
    {
      name: 'shortlink',
      cwd: __dirname,
      script: 'build/index.js',
      exec_mode: 'fork',
      instances: 1,
      node_args: '--env-file=.env --enable-source-maps',
      env: {
        NODE_ENV: 'production',
        SHUTDOWN_TIMEOUT: '1',
      },
      max_memory_restart: '512M',
      time: true,
      kill_timeout: 1500,
    },
  ],
};
