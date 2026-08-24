#!/bin/bash
set -e

echo "=== Starting Marginalia OCI VM Setup ==="

# 0. Create Swap File to prevent memory freezes on small instances
if [ ! -f "/swapfile" ] && [ "$(id -u)" -eq 0 -o -n "$SUDO_USER" ]; then
  echo "--> Creating a 2GB swap file to prevent OOM/freezing during builds..."
  sudo fallocate -l 2G /swapfile || sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
  echo "Swap file created and enabled."
fi

# 0.5. Disable Oracle Cloud Agent on low-memory (1GB) instances to free up ~400MB RAM
TOTAL_MEM_KB=$(grep MemTotal /proc/meminfo | awk '{print $2}')
if [ "$TOTAL_MEM_KB" -lt 1500000 ]; then
  if systemctl is-active --quiet oracle-cloud-agent 2>/dev/null; then
    echo "--> Low-memory instance detected (< 1.5GB RAM). Disabling oracle-cloud-agent to reclaim ~400MB of memory..."
    sudo systemctl stop oracle-cloud-agent || true
    sudo systemctl disable oracle-cloud-agent || true
  fi
fi

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

# 2. Configure local iptables firewall
echo "--> Configuring iptables firewall to open ports 80 and 443..."
while sudo iptables -D INPUT -p tcp --dport 80 -j ACCEPT 2>/dev/null; do :; done
sudo iptables -I INPUT 1 -p tcp --dport 80 -j ACCEPT
while sudo iptables -D INPUT -p tcp --dport 443 -j ACCEPT 2>/dev/null; do :; done
sudo iptables -I INPUT 1 -p tcp --dport 443 -j ACCEPT

if command -v netfilter-persistent &> /dev/null; then
  sudo netfilter-persistent save
fi

# 4. Clone or update the repository
if [ ! -d "marginalia" ]; then
  echo "--> Cloning Marginalia repository with submodules..."
  git clone --recurse-submodules https://github.com/plbogen2/marginalia.git
  cd marginalia
else
  echo "--> Updating Marginalia repository..."
  cd marginalia
  git pull origin main
  git submodule sync
  git submodule update --init --recursive
  cp scripts/setup_vm.sh $HOME/setup_vm.sh 2>/dev/null && chmod +x $HOME/setup_vm.sh || true
fi

# 5. Setup environment configurations
if [ ! -f ".env" ]; then
  echo "--> Creating .env file..."
  SECRET=$(openssl rand -hex 24)
  cat <<EOT > .env
PORT=3000
SESSION_SECRET=$SECRET
GEMINI_API_KEY=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
ALLOWED_USER=
PARLANDO_URL=http://parlando:8765
EOT
  echo ".env file created with secure session secrets."
fi

# 6. Build and Start the application on ports 80 and 443
echo "--> Launching Marginalia containers on ports 80 and 443..."
sudo docker-compose down || true
sudo docker-compose up -d --build --remove-orphans

echo "=== Marginalia OCI VM Setup Complete! ==="
