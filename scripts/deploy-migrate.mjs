if(process.env.TURSO_DATABASE_URL&&process.env.TURSO_AUTH_TOKEN)await import('./migrate.mjs');
else console.log('Database not connected yet. The website will display setup status until configured and redeployed.');
