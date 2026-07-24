#!/bin/bash
set -e

echo "=== Starting Marginalia OCI VM Setup ==="

# 1. Check and install core dependencies if missing
if command -v git &> /dev/null && command -v docker &> /dev/null && command -v docker-compose &> /dev/null; then
  echo "--> Core dependencies (git, docker, docker-compose) are already installed. Skipping package setup..."
else
  echo "--> Dependencies missing. Installing packages..."
  echo "--> Updating system packages..."
  sudo apt-get update -y
  sudo apt-get upgrade -y

  echo "--> Installing packages..."
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
fi

# 2. Configure local iptables firewall if port 80 rule doesn't exist
if sudo iptables -C INPUT -p tcp --dport 80 -j ACCEPT &> /dev/null; then
  echo "--> Firewall port 80 is already open in iptables. Skipping..."
else
  echo "--> Configuring iptables firewall to open port 80..."
  sudo iptables -I INPUT 6 -p tcp --dport 80 -j ACCEPT
  if command -v netfilter-persistent &> /dev/null; then
    sudo netfilter-persistent save
  fi
fi

# 4. Clone or update the repository
if [ ! -d "marginalia" ]; then
  echo "--> Cloning Marginalia repository..."
  git clone https://github.com/plbogen2/marginalia.git
  cd marginalia
else
  echo "--> Updating Marginalia repository..."
  cd marginalia
  git pull origin main
fi

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