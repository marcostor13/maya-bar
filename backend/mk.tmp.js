const dns=require('dns'); dns.setServers(['8.8.8.8','1.1.1.1']);
const { MongoClient } = require('mongodb'); const jwt = require('jsonwebtoken'); require('dotenv').config();
(async () => {
  const c = await MongoClient.connect(process.env.MONGODB_URI);
  const u = await c.db().collection('users').findOne({ role: 'TENANT_ADMIN' });
  console.log(jwt.sign({ sub:String(u._id), email:u.email, role:u.role, tenantId:String(u.tenantId), localIds:[] }, process.env.JWT_SECRET, { expiresIn:'2h' }));
  await c.close();
})();
