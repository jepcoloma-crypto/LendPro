module.exports = {
  apps: [{
    name: 'lendpro-server',
    script: './dist/index.js',
    cwd: 'C:/Projects/LendingApp/server',
    env: {
      NODE_ENV: 'production',
    },
    max_restarts: 10,
    restart_delay: 5000,
  }, {
    name: 'lendpro-tunnel',
    script: 'cloudflared.exe',
    cwd: 'C:/Users/Administrator',
    args: ['tunnel', '--url', 'http://localhost:5000'],
    max_restarts: 10,
    restart_delay: 5000,
    env: {
      PATH: process.env.PATH,
    },
  }]
};
