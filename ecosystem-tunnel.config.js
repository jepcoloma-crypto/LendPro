module.exports = {
  apps: [{
    name: 'lendpro-tunnel',
    script: 'C:\\Users\\Administrator\\cloudflared.exe',
    interpreter: 'none',
    args: ['tunnel', '--url', 'http://localhost:5001'],
    cwd: 'C:\\Users\\Administrator',
    restart_delay: 5000,
    max_restarts: 10,
    merge_logs: true
  }]
};
