const database = db.getSiblingDB('facturas');

database.createUser({
  user: 'facturas_api',
  pwd: process.env.MONGO_API_PASSWORD,
  roles: [{ role: 'readWrite', db: 'facturas' }],
});

database.createUser({
  user: 'facturas_consulta',
  pwd: process.env.MONGO_N8N_PASSWORD,
  roles: [{ role: 'read', db: 'facturas' }],
});
