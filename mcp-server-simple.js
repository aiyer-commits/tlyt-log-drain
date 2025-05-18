#!/usr/bin/env node

const { Pool } = require('pg');
const readline = require('readline');
require('dotenv').config();

// Initialize PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://tlyt_log_drain:ZxSt5nIOJ2oEN2X@tlyt-log-drain-legacy.flycast:5432/tlyt_log_drain?sslmode=disable',
  ssl: false
});

// Create readline interface for stdio
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// MCP function implementations
const functions = {
  'logs.recent': async (params) => {
    const limit = params.limit || 100;
    const { rows } = await pool.query(`
      SELECT * FROM logs 
      ORDER BY timestamp DESC 
      LIMIT $1
    `, [limit]);
    return rows;
  },
  
  'logs.timeRange': async (params) => {
    const { from, to } = params;
    const { rows } = await pool.query(`
      SELECT * FROM logs 
      WHERE timestamp >= $1 AND timestamp <= $2
      ORDER BY timestamp DESC
    `, [from, to]);
    return rows;
  },
  
  'logs.errors': async (params) => {
    const limit = params.limit || 100;
    const { rows } = await pool.query(`
      SELECT * FROM logs 
      WHERE level = 'error'
      ORDER BY timestamp DESC 
      LIMIT $1
    `, [limit]);
    return rows;
  },
  
  'logs.search': async (params) => {
    const { query, limit = 100 } = params;
    const { rows } = await pool.query(`
      SELECT * FROM logs 
      WHERE message ILIKE $1
      ORDER BY timestamp DESC 
      LIMIT $2
    `, [`%${query}%`, limit]);
    return rows;
  },
  
  'logs.byRequest': async (params) => {
    const { requestId } = params;
    const { rows } = await pool.query(`
      SELECT * FROM logs 
      WHERE request_id = $1
      ORDER BY timestamp ASC
    `, [requestId]);
    return rows;
  },
  
  'logs.stats': async (params) => {
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
  }
};

// Handle incoming requests
rl.on('line', async (line) => {
  try {
    const request = JSON.parse(line);
    const { method, params, id } = request;
    
    if (functions[method]) {
      const result = await functions[method](params || {});
      const response = {
        jsonrpc: '2.0',
        id,
        result
      };
      console.log(JSON.stringify(response));
    } else {
      const error = {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32601,
          message: 'Method not found'
        }
      };
      console.log(JSON.stringify(error));
    }
  } catch (error) {
    console.error('Error:', error);
    const errorResponse = {
      jsonrpc: '2.0',
      id: request?.id,
      error: {
        code: -32603,
        message: error.message
      }
    };
    console.log(JSON.stringify(errorResponse));
  }
});

// Handle shutdown
process.on('SIGTERM', () => {
  pool.end();
  process.exit(0);
});

console.error('MCP server started');