#!/usr/bin/env node

/**
 * NeonDB Setup Script for App Cloner Video Generator
 * 
 * This script sets up all required database tables in NeonDB (PostgreSQL)
 * 
 * Usage:
 * 1. Install dependencies: npm install pg dotenv
 * 2. Create a .env file with your NeonDB connection string:
 *    NEON_DATABASE_URL=postgresql://username:password@hostname/database?sslmode=require
 * 3. Run: node setup-neondb.js
 */

require('dotenv').config();
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function setupNeonDB() {
  const client = new Client({
    connectionString: process.env.NEON_DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    console.log('🔗 Connecting to NeonDB...');
    await client.connect();
    console.log('✅ Connected to NeonDB successfully');

    // Read the schema file
    const schemaPath = path.join(__dirname, 'neondb-schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    console.log('🏗️  Creating database tables...');
    await client.query(schema);
    console.log('✅ Database tables created successfully');

    // Verify tables were created
    const result = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);

    console.log('📋 Created tables:');
    result.rows.forEach(row => {
      console.log(`   - ${row.table_name}`);
    });

    console.log('');
    console.log('🎉 NeonDB setup completed successfully!');
    console.log('');
    console.log('Next steps:');
    console.log('1. Update your production environment variables');
    console.log('2. Deploy your application to Vercel');
    console.log('3. Test the database connection');

  } catch (error) {
    console.error('❌ Error setting up NeonDB:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

// Run the setup
if (require.main === module) {
  setupNeonDB().catch(console.error);
}

module.exports = setupNeonDB;