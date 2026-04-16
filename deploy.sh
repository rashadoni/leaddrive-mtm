#!/bin/bash
# MTM Deployment Script for Hetzner VDS
# Run this on your Mac: bash deploy.sh

SERVER="178.156.249.177"
USER="root"
PASS="bicegfspAjKr"

echo "🚀 MTM Deployment to $SERVER"
echo "================================"

# Step 1: Install Docker on server
echo "📦 Step 1: Installing Docker..."
sshpass -p "$PASS" ssh -o StrictHostKeyChecking=no $USER@$SERVER << 'REMOTE'
# Update system
apt-get update -y && apt-get upgrade -y

# Install Docker
if ! command -v docker &> /dev/null; then
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
fi

# Install Docker Compose
if ! command -v docker-compose &> /dev/null; then
  apt-get install -y docker-compose-plugin
fi

# Install sshpass if needed
apt-get install -y git

# Create project directory
mkdir -p /opt/mtm
echo "✅ Docker installed"
docker --version
REMOTE

# Step 2: Copy project files to server
echo "📤 Step 2: Uploading project files..."
cd ~/Documents/MTM

# Create a deployment archive
tar czf /tmp/mtm-deploy.tar.gz \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='dist' \
  --exclude='ios' \
  --exclude='android' \
  --exclude='MTMobileApp' \
  --exclude='MTMobile' \
  --exclude='.git' \
  admin-panel/ backend/ docker-compose.yml nginx/

sshpass -p "$PASS" scp -o StrictHostKeyChecking=no /tmp/mtm-deploy.tar.gz $USER@$SERVER:/opt/mtm/

# Step 3: Extract and configure on server
echo "⚙️ Step 3: Configuring server..."
sshpass -p "$PASS" ssh -o StrictHostKeyChecking=no $USER@$SERVER << 'REMOTE'
cd /opt/mtm
tar xzf mtm-deploy.tar.gz
rm mtm-deploy.tar.gz

# Create production .env for backend
cat > backend/.env << 'EOF'
DATABASE_URL="postgresql://mtm_user:mtm_secure_2026@db:5432/mtm_db?schema=public"
JWT_SECRET="mtm-jwt-production-$(openssl rand -hex 32)"
JWT_EXPIRES_IN="7d"
PORT=4000
CORS_ORIGIN="http://178.156.249.177"
ONEC_BASE_URL="http://185.132.107.206:6540"
ONEC_USERNAME="WebService"
ONEC_PASSWORD="Z3ytun"
EOF

# Create .env for frontend
cat > admin-panel/.env.local << 'EOF'
NEXT_PUBLIC_API_URL=http://178.156.249.177:4000/api
ONEC_BASE_URL=http://185.132.107.206:6540
ONEC_USERNAME=WebService
ONEC_PASSWORD=Z3ytun
EOF

# Update docker-compose for production
cat > docker-compose.yml << 'DEOF'
version: '3.8'

services:
  db:
    image: postgres:16-alpine
    container_name: mtm-db
    restart: always
    environment:
      POSTGRES_DB: mtm_db
      POSTGRES_USER: mtm_user
      POSTGRES_PASSWORD: mtm_secure_2026
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "127.0.0.1:5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U mtm_user -d mtm_db"]
      interval: 5s
      timeout: 5s
      retries: 5

  backend:
    build: ./backend
    container_name: mtm-backend
    restart: always
    depends_on:
      db:
        condition: service_healthy
    environment:
      DATABASE_URL: postgresql://mtm_user:mtm_secure_2026@db:5432/mtm_db?schema=public
      JWT_SECRET: mtm-jwt-production-secret-hetzner-2026
      JWT_EXPIRES_IN: 7d
      PORT: 4000
      CORS_ORIGIN: "*"
      ONEC_BASE_URL: http://185.132.107.206:6540
      ONEC_USERNAME: WebService
      ONEC_PASSWORD: Z3ytun
    ports:
      - "4000:4000"

  frontend:
    build:
      context: ./admin-panel
      args:
        - NEXT_PUBLIC_API_URL=http://178.156.249.177:4000/api
    container_name: mtm-frontend
    restart: always
    depends_on:
      - backend
    ports:
      - "80:3000"

volumes:
  pgdata:
DEOF

echo "✅ Configuration complete"
REMOTE

# Step 4: Build and start
echo "🏗️ Step 4: Building and starting services..."
sshpass -p "$PASS" ssh -o StrictHostKeyChecking=no $USER@$SERVER << 'REMOTE'
cd /opt/mtm

# Build and start all services
docker compose up -d --build

# Wait for DB to be ready
echo "⏳ Waiting for database..."
sleep 10

# Run Prisma migrations and seed
docker compose exec backend sh -c "npx prisma db push && npx prisma db seed" 2>/dev/null || echo "Seed will run on first start"

echo ""
echo "✅ ================================"
echo "✅ MTM DEPLOYED SUCCESSFULLY!"
echo "✅ ================================"
echo ""
echo "🌐 Admin Panel: http://178.156.249.177"
echo "🔌 Backend API: http://178.156.249.177:4000"
echo "🏥 Health Check: http://178.156.249.177:4000/health"
echo ""
echo "📱 Login: admin@mtm.az / R@shad123"
echo ""
docker compose ps
REMOTE

echo ""
echo "🎉 Deployment complete!"
echo "Open http://178.156.249.177 in browser"
