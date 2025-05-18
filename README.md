# TLYT Log Drain Service

A lightweight log drain service for Vercel and Gigalixir apps with MCP integration for Claude Code.

## Installation & Deployment

### 1. Local Setup
```bash
npm install
cp .env.example .env
# Edit .env with your database credentials
```

### 2. Create Fly.io App
```bash
flyctl auth login
flyctl apps create tlyt-log-drain --machines
```

### 3. Create PostgreSQL Database
```bash
flyctl postgres create -a tlyt-log-drain-db
flyctl postgres attach tlyt-log-drain-db -a tlyt-log-drain
```

### 4. Set Secrets
```bash
flyctl secrets set DRAIN_AUTH_TOKEN=your-secret-token-here -a tlyt-log-drain
```

### 5. Initialize Database
```bash
flyctl postgres connect -a tlyt-log-drain-db
# Paste contents of schema.sql
```

### 6. Deploy
```bash
flyctl deploy
```

## Configure Log Drains

### Vercel
In your Vercel project settings:
1. Go to Settings > Log Drains
2. Add endpoint: `https://tlyt-log-drain.fly.dev/logs/vercel`
3. Use basic auth: `user:your-secret-token-here`

### Gigalixir
```bash
gigalixir drains:add https://user:your-secret-token-here@tlyt-log-drain.fly.dev/logs/gigalixir
```

## Claude Code MCP Integration

### 1. Build MCP server
```bash
npm run build-mcp
```

### 2. Add to Claude Desktop config
Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "tlyt-logs": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/tlyt-log-drain/mcp-server.js"],
      "env": {
        "DATABASE_URL": "your-postgres-url-from-fly"
      }
    }
  }
}
```

### 3. Restart Claude Code

## Usage in Claude Code

```javascript
// Get recent logs
mcp__tlyt-logs__recent({ limit: 50 })

// Search for errors
mcp__tlyt-logs__errors({ limit: 100 })

// Full-text search
mcp__tlyt-logs__search({ query: "timeout" })

// Get logs for specific request
mcp__tlyt-logs__byRequest({ requestId: "abc123" })

// Custom SQL query
mcp__tlyt-logs__query({ 
  sql: "SELECT * FROM logs WHERE source = $1 AND level = $2 LIMIT 10",
  values: ["backend", "error"]
})
```

## Maintenance

### View logs
```bash
flyctl logs -a tlyt-log-drain
```

### SSH into container
```bash
flyctl ssh console -a tlyt-log-drain
```

### Database console
```bash
flyctl postgres connect -a tlyt-log-drain-db
```

### Log Retention Policy
**UNLIMITED RETENTION** - Logs are stored indefinitely by default.

The schema includes an optional cleanup function that can delete logs older than 30 days, but it is NOT automatically executed. To enable automatic cleanup, you would need to set up a cron job or use pg_cron extension.

If you want to manually clean up old logs:
```sql
-- Connect to database
flyctl postgres connect -a tlyt-log-drain-db

-- Delete logs older than 30 days
SELECT cleanup_old_logs();

-- Or custom cleanup
DELETE FROM logs WHERE timestamp < NOW() - INTERVAL '90 days';
```