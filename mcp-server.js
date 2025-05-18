#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// Initialize PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://tlyt_log_drain:ZxSt5nIOJ2oEN2X@tlyt-log-drain-legacy.flycast:5432/tlyt_log_drain?sslmode=disable',
  ssl: false
});

// Create MCP server
const server = new Server(
  {
    name: 'tlyt-logs',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'logs_recent',
        description: 'Get recent logs',
        inputSchema: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Number of logs to return',
              default: 100
            }
          }
        }
      },
      {
        name: 'logs_timeRange',
        description: 'Get logs within time range',
        inputSchema: {
          type: 'object',
          properties: {
            from: {
              type: 'string',
              description: 'Start timestamp',
              required: true
            },
            to: {
              type: 'string',
              description: 'End timestamp',
              required: true
            }
          }
        }
      },
      {
        name: 'logs_errors',
        description: 'Get error logs only',
        inputSchema: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Number of logs to return',
              default: 100
            }
          }
        }
      },
      {
        name: 'logs_search',
        description: 'Search logs by text',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query',
              required: true
            },
            limit: {
              type: 'number',
              description: 'Number of logs to return',
              default: 100
            }
          }
        }
      },
      {
        name: 'logs_byRequest',
        description: 'Get all logs for a request ID',
        inputSchema: {
          type: 'object',
          properties: {
            requestId: {
              type: 'string',
              description: 'Request ID to search for',
              required: true
            }
          }
        }
      },
      {
        name: 'logs_stats',
        description: 'Get log statistics',
        inputSchema: {
          type: 'object',
          properties: {
            hours: {
              type: 'number',
              description: 'Number of hours to analyze',
              default: 24
            }
          }
        }
      }
    ]
  };
});

// Implement tool handlers
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    switch (request.params.name) {
      case 'logs_recent': {
        const limit = request.params.arguments?.limit || 100;
        const { rows } = await pool.query(`
          SELECT * FROM logs 
          ORDER BY timestamp DESC 
          LIMIT $1
        `, [limit]);
        return { content: [{ type: 'text', text: JSON.stringify(rows, null, 2) }] };
      }
      
      case 'logs_timeRange': {
        const { from, to } = request.params.arguments;
        const { rows } = await pool.query(`
          SELECT * FROM logs 
          WHERE timestamp >= $1 AND timestamp <= $2
          ORDER BY timestamp DESC
        `, [from, to]);
        return { content: [{ type: 'text', text: JSON.stringify(rows, null, 2) }] };
      }
      
      case 'logs_errors': {
        const limit = request.params.arguments?.limit || 100;
        const { rows } = await pool.query(`
          SELECT * FROM logs 
          WHERE level = 'error'
          ORDER BY timestamp DESC 
          LIMIT $1
        `, [limit]);
        return { content: [{ type: 'text', text: JSON.stringify(rows, null, 2) }] };
      }
      
      case 'logs_search': {
        const { query, limit = 100 } = request.params.arguments;
        const { rows } = await pool.query(`
          SELECT * FROM logs 
          WHERE message ILIKE $1
          ORDER BY timestamp DESC 
          LIMIT $2
        `, [`%${query}%`, limit]);
        return { content: [{ type: 'text', text: JSON.stringify(rows, null, 2) }] };
      }
      
      case 'logs_byRequest': {
        const { requestId } = request.params.arguments;
        const { rows } = await pool.query(`
          SELECT * FROM logs 
          WHERE request_id = $1
          ORDER BY timestamp ASC
        `, [requestId]);
        return { content: [{ type: 'text', text: JSON.stringify(rows, null, 2) }] };
      }
      
      case 'logs_stats': {
        const { hours = 24 } = request.params.arguments;
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
        return { content: [{ type: 'text', text: JSON.stringify(rows, null, 2) }] };
      }
      
      default:
        throw new Error(`Unknown tool: ${request.params.name}`);
    }
  } catch (error) {
    console.error('Error:', error);
    return {
      content: [{ type: 'text', text: `Error: ${error.message}` }],
      isError: true
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('TLYT Logs MCP server started');
}

main().catch(console.error);