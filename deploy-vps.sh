#!/bin/bash
set -e

echo "=== LendPro VPS Deployment ==="

# 1. Install dependencies
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl gnupg postgresql postgresql-contrib

# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# PM2
sudo npm install -g pm2

# cloudflared
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o /tmp/cloudflared.deb
sudo dpkg -i /tmp/cloudflared.deb

# 2. Clone/pull repo
if [ -d /opt/lendpro ]; then
  cd /opt/lendpro && git pull
else
  sudo mkdir -p /opt/lendpro
  sudo chown -R $USER:$USER /opt/lendpro
  git clone https://github.com/jepcoloma-crypto/LendPro.git /opt/lendpro
  cd /opt/lendpro
fi

# 3. Setup env
cat > /opt/lendpro/server/.env << 'EOF'
PORT=5000
NODE_ENV=production
DB_HOST=db.hzrxiimkiddugfcibwgx.supabase.co
DB_PORT=5432
DB_NAME=postgres
DB_USER=postgres
DB_PASSWORD=4FKuCgyXsuwNK9nO
DB_SSL=true
JWT_SECRET=16914dd53a525ae20747c4307058045730fd9bd3e5ea95ddd58ecebb3d1678e612cfe4a4bd5ba0b500db6baa7568582282365b5b12838993aace34978322a73a
JWT_REFRESH_SECRET=97c1a885f15f3e6d895be7c3dbc9f520d03c7fcb3c431716bd04740c606e7162fcada25077521333b884c15fd9c51b9e38054448cdce0a94b208a48244e02064
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d
FRONTEND_URL=https://lendpro-seven.vercel.app
ALLOWED_ORIGINS=*
EOF

# 4. Build server
cd /opt/lendpro/server
npm install --include=dev
npm run build

# 5. Start with PM2
pm2 start /opt/lendpro/ecosystem.config.js
pm2 save
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u $USER --hp /home/$USER

# 6. Setup Cloudflare named tunnel
echo ""
echo "=== Cloudflare Tunnel Setup ==="
echo "Run this in another terminal: cloudflared tunnel login"
echo "Then: cloudflared tunnel create lendpro"
echo "Then: cloudflared tunnel route dns lendpro yourdomain.com"
echo ""
echo "After that, create /home/$USER/.cloudflared/config.yml:"
echo "  tunnel: <tunnel-id>"
echo "  credentials-file: /home/$USER/.cloudflared/<tunnel-id>.json"
echo "  ingress:"
echo "    - hostname: yourdomain.com"
echo "      service: http://localhost:5000"
echo "    - service: http_status:404"
echo ""
echo "Then: sudo cloudflared service install"
echo ""

# 7. Test
echo "=== Testing ==="
sleep 3
curl -s http://localhost:5000/health

echo ""
echo "=== Deploy to Vercel ==="
echo "Install vercel CLI and run:"
echo "  vercel env add VITE_API_BASE_URL production"
echo "  (enter: https://yourdomain.com)"
echo "  vercel deploy --prod"
echo ""
echo "=== Done! ==="
