const express = require('express');
const path = require('path');
const app = express();
const port = 3000;
const rootPath = '../public';

app.use(express.static(path.join(__dirname, rootPath)));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, rootPath, 'index.html'));
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});