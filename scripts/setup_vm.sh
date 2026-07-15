#!/bin/bash
set -e

echo "=== Starting Marginalia OCI VM Setup ==="

# 1. Update system packages
echo "--> Updating system packages..."
sudo apt-get update -y
sudo apt-get upgrade -y

# 2. Install Docker and dependencies
echo "--> Installing dependencies..."
sudo apt-get install -y apt-transport-https ca-certificates curl gnupg lsb-release git

if ! command -v docker &> /dev/null; then
  curl -fsSL https://get.docker.com -o get-docker.sh
  sudo sh get-docker.sh
  rm get-docker.sh
fi

sudo usermod -aG docker $USER

if ! command -v docker-compose &> /dev/null; then
  sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
  sudo chmod +x /usr/local/bin/docker-compose
fi

# 3. Configure local iptables firewall (OCI VMs block ports locally by default)
echo "--> Configuring iptables firewall to open port 80..."
sudo iptables -I INPUT 6 -p tcp --dport 80 -j ACCEPT
sudo netfilter-persistent save

# 4. Clone the repository
if [ ! -d "marginalia" ]; then
  echo "--> Cloning Marginalia repository..."
  git clone https://github.com/plbogen2/marginalia.git
fi

cd marginalia

# 5. Setup environment configurations
if [ ! -f ".env" ]; then
  echo "--> Creating .env file..."
  SECRET=$(openssl rand -hex 24)
  cat <<EOT > .env
PORT=3000
SESSION_SECRET=$SECRET
GEMINI_API_KEY=
EOT
  echo ".env file created with secure session secrets."
fi

# 6. Build and Start the application on port 80
echo "--> Launching Marginalia containers on port 80..."
cat <<EOT > docker-compose.override.yml
version: '3.8'
services:
  marginalia:
    ports:
      - "80:3000"
EOT

# Run with sudo to ensure docker-compose permissions
sudo docker-compose up -d --build

echo "=== Setup Complete! ==="
echo "Access Marginalia at: http://$(curl -s ifconfig.me)"
echo "Note: If the page doesn't load, make sure you opened Port 80 (TCP) under Ingress Rules in your OCI VCN Security List."