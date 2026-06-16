const fs = require('fs');
const path = require('path');

const apiUrl = process.env.BACKEND_URL || 'http://localhost:3000';

const content = `export const environment = {
  production: true,
  apiUrl: '${apiUrl}'
};
`;

const envDir = path.join(__dirname, '..', 'src', 'environments');
fs.mkdirSync(envDir, { recursive: true });
fs.writeFileSync(path.join(envDir, 'environment.prod.ts'), content);
console.log('[set-env] environment.prod.ts -> apiUrl:', apiUrl);
