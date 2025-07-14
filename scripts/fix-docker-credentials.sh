#!/bin/bash

# Fix Docker credential helper issues on macOS

echo "🔧 Fixing Docker credential helper configuration..."

# Check if Docker config exists
if [ -f ~/.docker/config.json ]; then
    echo "📋 Current Docker config:"
    cat ~/.docker/config.json
    echo ""
    
    # Backup current config
    cp ~/.docker/config.json ~/.docker/config.json.backup
    echo "✅ Backed up current config to ~/.docker/config.json.backup"
fi

# Create minimal Docker config without credential helper
cat > ~/.docker/config.json << 'EOF'
{
    "auths": {}
}
EOF

echo "✅ Created minimal Docker config"
echo ""
echo "🎯 You can now run: npm run test:docker"
echo ""
echo "ℹ️  Note: This removes credential helpers. To restore:"
echo "   cp ~/.docker/config.json.backup ~/.docker/config.json"