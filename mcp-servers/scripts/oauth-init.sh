#!/bin/bash
# OAuth Initialization Script for MCP Servers
# Run this script to complete OAuth authentication for Gmail and GDrive accounts

set -e

echo "=== MCP OAuth Initialization ==="
echo ""
echo "This script will help you authenticate with Google APIs."
echo "A browser window will open for each account you choose to initialize."
echo ""

# Function to initialize Gmail OAuth
init_gmail() {
    local account_name=$1
    local creds_dir=$2

    echo "--- Gmail: $account_name ---"
    echo "Credentials directory: $creds_dir"

    # Ensure directory exists
    mkdir -p "$creds_dir"

    # Check for OAuth keys
    if [ ! -f "$creds_dir/credentials.json" ]; then
        echo "ERROR: credentials.json not found in $creds_dir"
        echo "Please download from Google Cloud Console and save as credentials.json"
        return 1
    fi

    echo "Starting OAuth flow... (browser will open)"
    echo "Sign in with your $account_name Google account"
    echo ""

    # Run npx locally to perform OAuth flow
    GMAIL_CREDENTIALS_PATH="$creds_dir/credentials.json" \
    GMAIL_TOKEN_PATH="$creds_dir/token.json" \
    npx -y @gongrzhe/server-gmail-autoauth-mcp &

    local pid=$!
    sleep 5

    # Check if token was created
    if [ -f "$creds_dir/token.json" ]; then
        echo "SUCCESS: Token saved to $creds_dir/token.json"
        kill $pid 2>/dev/null || true
    else
        echo "Waiting for OAuth completion..."
        echo "Press Enter after you've completed the browser authentication"
        read -r
        kill $pid 2>/dev/null || true

        if [ -f "$creds_dir/token.json" ]; then
            echo "SUCCESS: Token saved"
        else
            echo "WARNING: Token file not created. OAuth may have failed."
        fi
    fi
    echo ""
}

# Function to initialize GDrive OAuth
init_gdrive() {
    local account_name=$1
    local creds_dir=$2

    echo "--- Google Drive: $account_name ---"
    echo "Credentials directory: $creds_dir"

    mkdir -p "$creds_dir"

    if [ ! -f "$creds_dir/gcp-oauth.keys.json" ]; then
        echo "ERROR: gcp-oauth.keys.json not found in $creds_dir"
        echo "Please download from Google Cloud Console and save as gcp-oauth.keys.json"
        return 1
    fi

    echo "Starting OAuth flow... (browser will open)"
    echo "Sign in with your $account_name Google account"
    echo ""

    GDRIVE_CREDS_DIR="$creds_dir" npx -y @isaacphi/mcp-gdrive &

    local pid=$!
    sleep 5

    echo "Waiting for OAuth completion..."
    echo "Press Enter after you've completed the browser authentication"
    read -r
    kill $pid 2>/dev/null || true

    echo "OAuth flow complete. Credentials cached in $creds_dir"
    echo ""
}

# Function to initialize Google Tasks OAuth
init_gtasks() {
    local creds_dir=$1

    echo "--- Google Tasks ---"
    echo "Credentials directory: $creds_dir"

    mkdir -p "$creds_dir"

    if [ -f "$creds_dir/.env" ]; then
        echo "Existing .env found. Loading to check credentials..."
        set -a
        . "$creds_dir/.env"
        set +a
    fi

    if [ -z "$GOOGLE_CLIENT_ID" ] || [ -z "$GOOGLE_CLIENT_SECRET" ]; then
        echo ""
        echo "Google Tasks requires OAuth credentials from Google Cloud Console."
        echo "1. Go to https://console.cloud.google.com/apis/credentials"
        echo "2. Create or select an OAuth 2.0 Client ID"
        echo "3. Enable the Google Tasks API"
        echo ""
        read -p "Enter GOOGLE_CLIENT_ID: " client_id
        read -p "Enter GOOGLE_CLIENT_SECRET: " client_secret
    else
        client_id="$GOOGLE_CLIENT_ID"
        client_secret="$GOOGLE_CLIENT_SECRET"
    fi

    echo ""
    echo "Starting OAuth flow to obtain refresh token..."
    echo "A browser will open for authentication."
    echo ""

    # Use the auth binary from the package to get a refresh token
    GOOGLE_CLIENT_ID="$client_id" \
    GOOGLE_CLIENT_SECRET="$client_secret" \
    npx -y @brandcast_app/google-tasks-mcp google-tasks-mcp-auth &

    local pid=$!
    echo "Waiting for OAuth completion..."
    echo "After authenticating in the browser, copy the refresh token."
    echo "Press Enter when done."
    read -r
    kill $pid 2>/dev/null || true

    if [ -z "$GOOGLE_REFRESH_TOKEN" ]; then
        read -p "Enter GOOGLE_REFRESH_TOKEN: " refresh_token
    else
        refresh_token="$GOOGLE_REFRESH_TOKEN"
    fi

    # Save credentials to .env file
    cat > "$creds_dir/.env" << EOF
GOOGLE_CLIENT_ID=$client_id
GOOGLE_CLIENT_SECRET=$client_secret
GOOGLE_REFRESH_TOKEN=$refresh_token
EOF

    echo "SUCCESS: Credentials saved to $creds_dir/.env"
    echo ""
}

# Interactive menu
echo "Select what to initialize:"
echo "1) Gmail - Board (wharfside-govdocs)"
echo "2) Gmail - Personal (d3marco-1)"
echo "3) Google Drive - Board (wharfside-govdocs)"
echo "4) Google Drive - Personal (d3marco-1)"
echo "5) All Gmail accounts"
echo "6) All Google Drive accounts"
echo "7) Everything (all accounts)"
echo "8) Google Tasks"
echo ""
read -p "Selection [1-8]: " choice

case $choice in
    1) init_gmail "Board" "$HOME/.config/mcp-gmail-board" ;;
    2) init_gmail "Personal" "$HOME/.config/mcp-gmail-personal" ;;
    3) init_gdrive "Board" "$HOME/.config/mcp-gdrive-board" ;;
    4) init_gdrive "Personal" "$HOME/.config/mcp-gdrive-personal" ;;
    5)
        init_gmail "Board" "$HOME/.config/mcp-gmail-board"
        init_gmail "Personal" "$HOME/.config/mcp-gmail-personal"
        ;;
    6)
        init_gdrive "Board" "$HOME/.config/mcp-gdrive-board"
        init_gdrive "Personal" "$HOME/.config/mcp-gdrive-personal"
        ;;
    7)
        init_gmail "Board" "$HOME/.config/mcp-gmail-board"
        init_gmail "Personal" "$HOME/.config/mcp-gmail-personal"
        init_gdrive "Board" "$HOME/.config/mcp-gdrive-board"
        init_gdrive "Personal" "$HOME/.config/mcp-gdrive-personal"
        init_gtasks "$HOME/.config/mcp-gtasks"
        ;;
    8) init_gtasks "$HOME/.config/mcp-gtasks" ;;
    *)
        echo "Invalid selection"
        exit 1
        ;;
esac

echo "=== OAuth Initialization Complete ==="
