const express = require('express');
const { Pool } = require('pg');
const basicAuth = require('basic-auth');
require('dotenv').config();

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.text({ type: 'application/logplex-1', limit: '10mb' }));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Auth middleware
const auth = (req, res, next) => {
  const user = basicAuth(req);
  if (!user || user.pass !== process.env.DRAIN_AUTH_TOKEN) {
    res.status(401).send('Unauthorized');
    return;
  }
  next();
};

// Vercel verification - handle all methods for the one-time verification
app.all('/logs/vercel', (req, res, next) => {
  // Always send the verification header for any request
  res.setHeader('x-vercel-verify', 'b3d85ec654c790ee25f9ca3c445b2c9a12ca0213');
  
  // For GET/HEAD requests, just return OK with the header
  if (req.method === 'GET' || req.method === 'HEAD') {
    console.log(`Vercel verification ${req.method} request`);
    return res.status(200).send('OK');
  }
  
  // For POST requests during verification, handle empty/invalid data gracefully
  if (req.method === 'POST' && (!req.body || (Array.isArray(req.body) && req.body.length === 0))) {
    console.log('Vercel verification POST with empty body');
    return res.status(200).json({ received: 0 });
  }
  
  // Pass through to the actual POST handler for real logs
  next();
});

// Vercel log endpoint
app.post('/logs/vercel', auth, async (req, res) => {
  try {
    console.log('Vercel POST request body:', JSON.stringify(req.body, null, 2));
    
    const logs = Array.isArray(req.body) ? req.body : [req.body];
    
    for (const log of logs) {
      // Validate timestamp before processing
      const timestamp = new Date(log.timestamp);
      if (isNaN(timestamp.getTime())) {
        console.log('Invalid timestamp:', log.timestamp);
        continue; // Skip logs with invalid timestamps
      }
      
      await pool.query(`
        INSERT INTO logs (timestamp, source, level, message, request_id, project_id, deployment_id, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        timestamp,
        'frontend',
        log.type === 'stderr' ? 'error' : 'info',
        log.message || '',
        log.requestId || null,
        log.projectId || null,
        log.deploymentId || null,
        {
          host: log.host,
          path: log.path,
          statusCode: log.statusCode,
          buildId: log.buildId
        }
      ]);
    }
    
    res.status(200).json({ received: logs.length });
  } catch (error) {
    console.error('Error processing Vercel logs:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Gigalixir log endpoint
app.post('/logs/gigalixir', auth, async (req, res) => {
  try {
    const syslogRegex = /^<\d+>1 (\S+) (\S+) (\S+) (\S+) (\S+) (.*)$/;
    const lines = req.body.split('\n').filter(line => line.trim());
    
    for (const line of lines) {
      const match = line.match(syslogRegex);
      if (match) {
        const [, timestamp, hostname, appname, procid, msgid, message] = match;
        
        // Extract request ID from Phoenix logs if present
        const requestIdMatch = message.match(/\[request_id: ([\w-]+)\]/);
        const requestId = requestIdMatch ? requestIdMatch[1] : null;
        
        // Determine log level
        let level = 'info';
        if (message.toLowerCase().includes('error')) level = 'error';
        else if (message.toLowerCase().includes('warn')) level = 'warn';
        
        await pool.query(`
          INSERT INTO logs (timestamp, source, level, message, request_id, metadata)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [
          new Date(timestamp),
          'backend',
          level,
          message,
          requestId,
          { hostname, appname, procid, msgid }
        ]);
      }
    }
    
    res.status(200).json({ received: lines.length });
  } catch (error) {
    console.error('Error processing Gigalixir logs:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Query endpoint for basic testing
app.get('/api/logs', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT * FROM logs 
      ORDER BY timestamp DESC 
      LIMIT 100
    `);
    res.json(rows);
  } catch (error) {
    console.error('Error querying logs:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Log drain service listening on port ${PORT}`);
});