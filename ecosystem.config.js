module.exports = {
  apps: [{
    name: 'lendpro-server',
    script: './dist/index.js',
    cwd: 'C:/Projects/LendingApp/server',
    env: {
      NODE_ENV: 'development',
    },
    max_restarts: 10,
    restart_delay: 5000,
  }, {
    name: 'lendpro-server-prod',
    script: './dist/index.js',
    cwd: 'C:/Projects/LendingApp/server',
    env: {
      PORT: '5001',
      NODE_ENV: 'production',
      DB_HOST: 'db.hzrxiimkiddugfcibwgx.supabase.co',
      DB_PORT: '5432',
      DB_NAME: 'postgres',
      DB_USER: 'postgres',
      DB_PASSWORD: '4FKuCgyXsuwNK9nO',
      DB_SSL: 'true',
      JWT_SECRET: '16914dd53a525ae20747c4307058045730fd9bd3e5ea95ddd58ecebb3d1678e612cfe4a4bd5ba0b500db6baa7568582282365b5b12838993aace34978322a73a',
      JWT_REFRESH_SECRET: '97c1a885f15f3e6d895be7c3dbc9f520d03c7fcb3c431716bd04740c606e7162fcada25077521333b884c15fd9c51b9e38054448cdce0a94b208a48244e02064',
      JWT_EXPIRES_IN: '1h',
      JWT_REFRESH_EXPIRES_IN: '7d',
      ALLOWED_ORIGINS: 'http://localhost:5173,https://lendpro-seven.vercel.app',
      FRONTEND_URL: 'http://localhost:5173',
    },
    max_restarts: 10,
    restart_delay: 5000,
  }, {
    name: 'lendpro-tunnel',
    script: 'cloudflared.exe',
    cwd: 'C:/Users/Administrator',
    args: ['tunnel', '--url', 'http://localhost:5001'],
    max_restarts: 10,
    restart_delay: 5000,
    env: {
      PATH: process.env.PATH,
    },
  }]
};
