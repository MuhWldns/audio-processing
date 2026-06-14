#!/bin/bash
# Deploy script for RBX Royale platform
# Run from project root on VPS

set -e

echo "=== RBX Royale Deploy Script ==="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 1. Pull latest code
echo -e "${GREEN}[1/7] Pulling latest code...${NC}"
git pull origin main

# 2. Install backend dependencies
echo -e "${GREEN}[2/7] Installing backend dependencies...${NC}"
cd backend
bun install --frozen-lockfile
npx prisma generate

# 3. Run database migrations
echo -e "${GREEN}[3/7] Running database migrations...${NC}"
npx prisma migrate deploy
cd ..

# 4. Install frontend dependencies & build
echo -e "${GREEN}[4/7] Installing frontend dependencies...${NC}"
cd frontend
npm install --frozen-lockfile

echo -e "${GREEN}[5/7] Building frontend...${NC}"
npm run build

# Next.js standalone output does not copy public/ or .next/static automatically.
# PM2 runs .next/standalone/server.js, so these must be placed beside it or all
# static assets (CSS, JS chunks, images) 404 at runtime.
cp -r public .next/standalone/
cp -r .next/static .next/standalone/.next/
cd ..

# 5. Create logs directory
echo -e "${GREEN}[6/7] Setting up logs...${NC}"
mkdir -p logs

# 6. Restart services with PM2
echo -e "${GREEN}[7/7] Restarting services...${NC}"
pm2 stop ecosystem.config.cjs 2>/dev/null || true
pm2 start ecosystem.config.cjs --env production
pm2 save

echo ""
echo -e "${GREEN}=== Deploy complete! ===${NC}"
echo ""
echo "Services:"
echo "  Backend API:  https://api-rbx.muhwldns.me (port 3001)"
echo "  Frontend:     https://store.muhwldns.me (port 5174)"
echo ""
echo "Commands:"
echo "  pm2 status          - Check service status"
echo "  pm2 logs rbx-api    - View backend logs"
echo "  pm2 logs rbx-frontend - View frontend logs"
echo "  pm2 restart all     - Restart all services"
echo ""
echo -e "${YELLOW}Reminder: Setup Cloudflare Tunnel routes:${NC}"
echo "  api-rbx.muhwldns.me   -> localhost:3001"
echo "  store.muhwldns.me     -> localhost:5174"
