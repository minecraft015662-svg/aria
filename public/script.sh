#!/bin/bash

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m'

SERVER_URL="{{HOST_URL}}"
PTERO_DIR="/var/www/pterodactyl"

clear
echo -e "${CYAN}==================================================${NC}"
echo -e "${YELLOW}               ARIX THEME MANAGER                 ${NC}"
echo -e "${CYAN}==================================================${NC}"
echo -e " 1) Install Arix Theme"
echo -e " 2) Update Arix Theme"
echo -e " 3) Uninstall / Restore Backup"
echo -e " 4) Exit"
echo -e "${CYAN}==================================================${NC}"
read -p "Select an option [1-4]: " OPTION

case $OPTION in
    1|2)
        echo -e "\n${YELLOW}[+] License Check Required${NC}"
        read -p "Enter your License Key: " LICENSE_KEY

        RESPONSE=$(curl -s "$SERVER_URL/api/verify-license?key=$LICENSE_KEY")
        if [[ $RESPONSE != *"true"* ]]; then
            echo -e "${RED}[!] Invalid License Key! Aborting...${NC}"
            exit 1
        fi
        echo -e "${GREEN}[✓] License Verified Successfully!${NC}"

        echo -e "${YELLOW}[+] Downloading Theme...${NC}"
        cd $PTERO_DIR || exit
        curl -s -o arix.zip "$SERVER_URL/api/download-theme?key=$LICENSE_KEY"

        if [ ! -f "arix.zip" ]; then
            echo -e "${RED}[!] Download Failed! Check server settings.${NC}"
            exit 1
        fi

        echo -e "${YELLOW}[+] Creating Backup and Extracting...${NC}"
        cp -r resources/scripts/ resources/scripts_backup_$(date +%F_%T) 2>/dev/null
        unzip -o arix.zip
        rm arix.zip

        echo -e "${YELLOW}[+] Building Theme Assets (Pterodactyl)...${NC}"
        yarn install
        yarn build:production
        php artisan view:clear
        php artisan config:clear

        echo -e "${GREEN}[✓] Arix Theme Action Completed Successfully!${NC}"
        ;;

    3)
        echo -e "${YELLOW}[+] Uninstalling Theme & Cleaning Caches...${NC}"
        cd $PTERO_DIR || exit
        php artisan view:clear
        php artisan config:clear
        yarn build:production
        echo -e "${GREEN}[✓] Theme uninstalled / Asset cache cleared.${NC}"
        ;;

    4)
        echo -e "${CYAN}Exiting...${NC}"
        exit 0
        ;;

    *)
        echo -e "${RED}Invalid option selected.${NC}"
        exit 1
        ;;
esac