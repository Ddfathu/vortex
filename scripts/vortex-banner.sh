#!/bin/bash

# Warna
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Mengambil Info OS
OS_INFO=$(grep PRETTY_NAME /etc/os-release | cut -d '"' -f 2)

# Mengambil IP dan Lokasi Server
SERVER_IP=$(curl -s ifconfig.me)
SERVER_HOST=$(curl -s ipinfo.io/country)
if [ -z "$SERVER_HOST" ]; then
    SERVER_HOST="Unknown"
fi

echo -e "${CYAN}================================================${NC}"
echo -e "${YELLOW}           W E L C O M E   T O   S E R V E R    ${NC}"
echo -e "${CYAN}================================================${NC}"
echo -e "${GREEN}OS System    :${NC} ${OS_INFO}"
echo -e "${GREEN}IP Server    :${NC} ${SERVER_IP}"
echo -e "${GREEN}Location     :${NC} ${SERVER_HOST}"
echo -e "${CYAN}================================================${NC}"
echo -e "${PURPLE}Moded by Vortex Project${NC}"
echo -e "${CYAN}================================================${NC}"
echo ""

# Panggil menu jika sesi adalah interaktif
if [[ $- == *i* ]]; then
    menu
fi
