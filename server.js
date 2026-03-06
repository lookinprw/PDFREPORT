require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8123;
const HOST = process.env.HOST || '0.0.0.0';

app.use(express.static('public'));

app.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}`);
  console.log(`Access from mobile: http://<YOUR_IP>:${PORT}`);
  console.log('Once PWA is installed, the app works fully offline.');
});
