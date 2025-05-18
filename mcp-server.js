const { Server } = require('@modelcontextprotocol/server');
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const server = new Server();

// Get recent logs
server.registerFunction('logs.recent', async (params) => {
  const limit = params.limit || 100;
  const { rows } = await pool.query(`
    SELECT * FROM logs 
    ORDER BY timestamp DESC 
    LIMIT $1
  `, [limit]);
  return rows;
});

// Query logs by time range
server.registerFunction('logs.timeRange', async (params) => {
  const { from, to } = params;
  const { rows } = await pool.query(`
    SELECT * FROM logs 
    WHERE timestamp >= $1 AND timestamp <= $2
    ORDER BY timestamp DESC
  `, [from, to]);
  return rows;
});

// Get errors only
server.registerFunction('logs.errors', async (params) => {
  const limit = params.limit || 100;
  const { rows } = await pool.query(`
    SELECT * FROM logs 
    WHERE level = 'error'
    ORDER BY timestamp DESC 
    LIMIT $1
  `, [limit]);
  return rows;
});

// Full-text search
server.registerFunction('logs.search', async (params) => {
  const { query, limit = 100 } = params;
  const { rows } = await pool.query(`
    SELECT * FROM logs 
    WHERE to_tsvector('english', message) @@ plainto_tsquery('english', $1)
    ORDER BY timestamp DESC 
    LIMIT $2
  `, [query, limit]);
  return rows;
});

// Get logs by request ID
server.registerFunction('logs.byRequest', async (params) => {
  const { requestId } = params;
  const { rows } = await pool.query(`
    SELECT * FROM logs 
    WHERE request_id = $1
    ORDER BY timestamp ASC
  `, [requestId]);
  return rows;
});

// Direct SQL query (be careful with this)
server.registerFunction('logs.query', async (params) => {
  const { sql, values = [] } = params;
  // Basic safety check - only allow SELECT queries
  if (!sql.trim().toLowerCase().startsWith('select')) {
    throw new Error('Only SELECT queries are allowed');
  }
  const { rows } = await pool.query(sql, values);
  return rows;
});

// Get log statistics
server.registerFunction('logs.stats', async (params) => {
  const { hours = 24 } = params;
  const { rows } = await pool.query(`
    SELECT 
      source,
      level,
      DATE_TRUNC('hour', timestamp) as hour,
      COUNT(*) as count
    FROM logs
    WHERE timestamp > NOW() - INTERVAL '${hours} hours'
    GROUP BY source, level, hour
    ORDER BY hour DESC
  `);
  return rows;
});

// Start MCP server
server.start();
console.log('MCP server started');