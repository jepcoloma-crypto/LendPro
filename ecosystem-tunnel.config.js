module.exports = {
  apps: [{
    name: 'lendpro-tunnel',
    script: 'server\\tunnel-watcher.js',
    interpreter: 'node',
    cwd: 'C:\\Projects\\LendingApp',
    restart_delay: 5000,
    max_restarts: 10,
    merge_logs: true,
    env: {
      CLOUDFLARED_PATH: 'C:\\Users\\Administrator\\cloudflared.exe',
      TUNNEL_URL: 'http://localhost:5001',
      VERCEL_PROJECT_ID: 'prj_MKjbKVamlFqqwYKCojYNJVQeVIMT',
      VERCEL_DEPLOY_HOOK: 'https://api.vercel.com/v1/integrations/deploy/prj_MKjbKVamlFqqwYKCojYNJVQeVIMT/vF0SP9Vrhn',
      CHECK_INTERVAL: '60000',
    }
  }]
};
